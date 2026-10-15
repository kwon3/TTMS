import "server-only";
import { admin, must } from "./supabase/server";

/**
 * 사용자들에게 알림을 저장한다. notifications 테이블에 행이 추가되면
 * Supabase Realtime이 접속 중인 사용자 브라우저로 즉시 전달한다.
 */
export async function notify(userIds: Iterable<string | null | undefined>, incidentId: number | null, message: string) {
  const ids = [...new Set([...userIds].filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return;
  must(
    await admin()
      .from("notifications")
      .insert(ids.map((user_id) => ({ user_id, incident_id: incidentId, message }))),
  );
}

export async function adminIds(): Promise<string[]> {
  const rows = must(await admin().from("profiles").select("id").eq("role", "admin").eq("active", true)) as {
    id: string;
  }[];
  return rows.map((r) => r.id);
}
