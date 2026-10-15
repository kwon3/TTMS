import "server-only";
import { admin, must } from "./supabase/server";
import type { Attachment, Comment, Incident, IncidentEvent, IncidentStatus, User } from "./types";

/**
 * 역할별 조회 범위
 * - 관리자·담당자: 전체 (지정되지 않은 고객사 건도 보고 댓글·조치내역을 남길 수 있음)
 *   담당자가 mine=true면 자신이 지정된 고객사 건만
 * - 고객: 소속 고객사 건만 (다른 고객사 건은 절대 볼 수 없음)
 */
async function scopeCompanies(user: User, mine?: boolean): Promise<number[] | null> {
  if (user.role === "customer") return [user.company_id ?? -1];
  if (user.role === "manager" && mine) {
    const ids = await designatedCompanyIds(user.id);
    return ids.length ? ids : [-1];
  }
  return null;
}

export type IncidentFilter = { status?: string; q?: string; closed?: boolean; mine?: boolean };

const SEVERITY_RANK: Record<string, number> = { 긴급: 0, 높음: 1, 보통: 2, 낮음: 3 };

export async function listIncidents(user: User, filter: IncidentFilter = {}): Promise<Incident[]> {
  let query = admin().from("incidents_v").select("*");
  const companies = await scopeCompanies(user, filter.mine);
  if (companies) query = query.in("company_id", companies);
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

export async function countByStatus(user: User, mine?: boolean): Promise<Partial<Record<IncidentStatus, number>>> {
  let query = admin().from("incidents").select("status");
  const companies = await scopeCompanies(user, mine);
  if (companies) query = query.in("company_id", companies);
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
  if (user.role === "admin" || user.role === "manager") return true;
  return user.company_id != null && incident.company_id === user.company_id;
}

// ---------------------------------------------------------------- 고객사별 지정 담당자 (1:N)

export async function designatedCompanyIds(managerId: string): Promise<number[]> {
  const rows = must(await admin().from("company_managers").select("company_id").eq("manager_id", managerId)) as {
    company_id: number;
  }[];
  return rows.map((r) => r.company_id);
}

/** 고객사에 지정된 (사용 중인) 담당자 목록 */
export async function companyManagers(companyId: number): Promise<{ id: string; name: string }[]> {
  const rows = must(
    await admin()
      .from("company_managers")
      .select("manager:profiles!inner(id, name, active)")
      .eq("company_id", companyId),
  ) as unknown as { manager: { id: string; name: string; active: boolean } }[];
  return rows
    .map((r) => r.manager)
    .filter((m) => m.active)
    .map(({ id, name }) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

/** 이 장애의 접수 확인·처리완료를 할 수 있는지: 관리자, 또는 고객사 지정 담당자/배정 담당자 */
export async function isDesignatedFor(user: User, incident: Incident): Promise<boolean> {
  if (user.role === "admin") return true;
  if (user.role !== "manager") return false;
  if (incident.manager_id === user.id) return true;
  const { data } = await admin()
    .from("company_managers")
    .select("manager_id")
    .eq("company_id", incident.company_id)
    .eq("manager_id", user.id)
    .maybeSingle();
  return Boolean(data);
}

/** 담당자 쪽 알림 대상: 고객사 지정 담당자 전원 + 배정 담당자 */
export async function managerSideIds(incident: Incident): Promise<string[]> {
  const ids = (await companyManagers(incident.company_id)).map((m) => m.id);
  if (incident.manager_id && !ids.includes(incident.manager_id)) ids.push(incident.manager_id);
  return ids;
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
  admin_closed: "관리자 강제 종결",
};
