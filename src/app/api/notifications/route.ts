import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Notification } from "@/lib/types";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const items = db
    .prepare(
      "SELECT id, incident_id, message, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 30",
    )
    .all(user.id) as Notification[];
  const { n } = db
    .prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL")
    .get(user.id) as { n: number };
  return Response.json({ items, unread: n });
}

/** 알림 읽음 처리. body에 id가 없으면 전체 읽음 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = (await req.json().catch(() => ({}))) as { id?: number };
  if (id) {
    db.prepare(
      "UPDATE notifications SET read_at = datetime('now','localtime') WHERE id = ? AND user_id = ? AND read_at IS NULL",
    ).run(id, user.id);
  } else {
    db.prepare(
      "UPDATE notifications SET read_at = datetime('now','localtime') WHERE user_id = ? AND read_at IS NULL",
    ).run(user.id);
  }
  return Response.json({ ok: true });
}
