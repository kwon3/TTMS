import "server-only";
import { admin, must } from "./supabase/server";
import type { Attachment, Comment, Incident, IncidentEvent, IncidentStatus, User } from "./types";

/** 역할별 조회 범위: 관리자=전체, 담당자=배정된 건, 고객=소속 고객사 건 */
function scope(user: User): [column: string, value: string | number] | null {
  if (user.role === "manager") return ["manager_id", user.id];
  if (user.role === "customer") return ["company_id", user.company_id ?? -1];
  return null;
}

export type IncidentFilter = { status?: string; q?: string; closed?: boolean };

const SEVERITY_RANK: Record<string, number> = { 긴급: 0, 높음: 1, 보통: 2, 낮음: 3 };

export async function listIncidents(user: User, filter: IncidentFilter = {}): Promise<Incident[]> {
  let query = admin().from("incidents_v").select("*");
  const sc = scope(user);
  if (sc) query = query.eq(...sc);
  if (filter.closed === true) query = query.eq("status", "closed");
  if (filter.closed === false) query = query.neq("status", "closed");
  if (filter.status) query = query.eq("status", filter.status);
  if (filter.q) {
    // PostgREST or() 문법을 깨는 문자는 제거
    const q = filter.q.replace(/[,()*%\\:"]/g, " ").trim();
    if (q) {
      const like = `%${q}%`;
      query = query.or(
        `title.ilike.${like},code.ilike.${like},company_name.ilike.${like},target_system.ilike.${like}`,
      );
    }
  }
  query =
    filter.closed === true
      ? query.order("closed_at", { ascending: false })
      : query.order("created_at", { ascending: false });
  const rows = must(await query.limit(500)) as Incident[];
  if (filter.closed !== true) {
    // 진행 중 목록은 긴급도 높은 순 → 최신 접수 순
    rows.sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9));
  }
  return rows;
}

export async function countByStatus(user: User): Promise<Partial<Record<IncidentStatus, number>>> {
  let query = admin().from("incidents").select("status");
  const sc = scope(user);
  if (sc) query = query.eq(...sc);
  const rows = must(await query) as { status: IncidentStatus }[];
  const counts: Partial<Record<IncidentStatus, number>> = {};
  for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return counts;
}

export async function getIncident(id: number): Promise<Incident | null> {
  if (!Number.isFinite(id)) return null;
  return must(await admin().from("incidents_v").select("*").eq("id", id).maybeSingle()) as Incident | null;
}

export function canView(user: User, incident: Incident): boolean {
  if (user.role === "admin") return true;
  if (user.role === "manager") return incident.manager_id === user.id;
  return incident.company_id === user.company_id;
}

/** 접근 권한까지 확인한 조회 */
export async function getIncidentFor(user: User, id: number): Promise<Incident | null> {
  const incident = await getIncident(id);
  return incident && canView(user, incident) ? incident : null;
}

export async function getComments(incidentId: number): Promise<Comment[]> {
  return must(
    await admin().from("comments_v").select("*").eq("incident_id", incidentId).order("created_at").order("id"),
  ) as Comment[];
}

export async function getAttachments(incidentId: number): Promise<Attachment[]> {
  return must(await admin().from("attachments").select("*").eq("incident_id", incidentId).order("id")) as Attachment[];
}

export async function getEvents(incidentId: number): Promise<IncidentEvent[]> {
  return must(
    await admin().from("events_v").select("*").eq("incident_id", incidentId).order("created_at").order("id"),
  ) as IncidentEvent[];
}

export async function addEvent(incidentId: number, userId: string | null, type: string, detail?: string) {
  must(
    await admin()
      .from("incident_events")
      .insert({ incident_id: incidentId, user_id: userId, type, detail: detail ?? null }),
  );
}

export async function listActiveManagers(): Promise<{ id: string; name: string; email: string }[]> {
  return must(
    await admin().from("profiles").select("id, name, email").eq("role", "manager").eq("active", true).order("name"),
  ) as { id: string; name: string; email: string }[];
}

export const EVENT_LABEL: Record<string, string> = {
  created: "장애 접수",
  assigned: "담당자 배정",
  acknowledged: "담당자 접수 확인",
  action: "원인분석·조치내역 등록",
  action_updated: "조치내역 수정",
  customer_confirmed: "고객 처리완료 확인",
  manager_confirmed: "담당자 처리완료 확인",
  confirm_reset: "처리완료 확인 초기화(조치내역 변경)",
  closed: "처리완료(종결)",
};
