import { getCurrentUser } from "@/lib/auth";
import { admin } from "@/lib/supabase/server";
import type { Notification } from "@/lib/types";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const [list, unread] = await Promise.all([
    admin()
      .from("notifications")
      .select("id, incident_id, message, read_at, created_at")
      .eq("user_id", user.id)
      .order("id", { ascending: false })
      .limit(30),
    admin()
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null),
  ]);
  return Response.json({ items: (list.data ?? []) as Notification[], unread: unread.count ?? 0 });
}

/** 알림 읽음 처리. body에 id가 없으면 전체 읽음 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = (await req.json().catch(() => ({}))) as { id?: number };
  let query = admin()
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);
  if (id) query = query.eq("id", id);
  await query;
  return Response.json({ ok: true });
}
