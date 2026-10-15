import { getCurrentUser } from "@/lib/auth";
import { bus, type NotifyPayload } from "@/lib/notify";

export const dynamic = "force-dynamic";

/** Server-Sent Events: 로그인 사용자에게 새 알림을 실시간으로 밀어준다 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const encoder = new TextEncoder();
  const channel = `user:${user.id}`;
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      const onNotify = (p: NotifyPayload) => send("notification", p);
      // 프록시·브라우저가 연결을 끊지 않도록 주기적으로 신호를 보낸다
      const ping = setInterval(() => controller.enqueue(encoder.encode(": ping\n\n")), 25_000);

      bus.on(channel, onNotify);
      send("ready", { userId: user.id });

      cleanup = () => {
        clearInterval(ping);
        bus.off(channel, onNotify);
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
