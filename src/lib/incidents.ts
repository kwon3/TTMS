import "server-only";
import { db } from "./db";
import type { Attachment, Comment, Incident, IncidentEvent, User } from "./types";

const INCIDENT_SELECT = `
  SELECT i.*, c.name AS company_name, cu.name AS customer_name, m.name AS manager_name
    FROM incidents i
    JOIN companies c ON c.id = i.company_id
    JOIN users cu ON cu.id = i.customer_id
    LEFT JOIN users m ON m.id = i.manager_id`;

/** 역할별 조회 범위: 관리자=전체, 담당자=배정된 건, 고객=소속 고객사 건 */
function scope(user: User): { where: string; params: (string | number)[] } {
  if (user.role === "admin") return { where: "1=1", params: [] };
  if (user.role === "manager") return { where: "i.manager_id = ?", params: [user.id] };
  return { where: "i.company_id = ?", params: [user.company_id ?? -1] };
}

export type IncidentFilter = { status?: string; q?: string; closed?: boolean };

export function listIncidents(user: User, filter: IncidentFilter = {}): Incident[] {
  const s = scope(user);
  const where = [s.where];
  const params = [...s.params];
  if (filter.closed === true) where.push("i.status = 'closed'");
  if (filter.closed === false) where.push("i.status <> 'closed'");
  if (filter.status) {
    where.push("i.status = ?");
    params.push(filter.status);
  }
  if (filter.q) {
    where.push("(i.title LIKE ? OR i.code LIKE ? OR c.name LIKE ? OR i.target_system LIKE ?)");
    const like = `%${filter.q}%`;
    params.push(like, like, like, like);
  }
  const order =
    filter.closed === true
      ? "i.closed_at DESC"
      : `CASE i.severity WHEN '긴급' THEN 0 WHEN '높음' THEN 1 WHEN '보통' THEN 2 ELSE 3 END, i.created_at DESC`;
  return db
    .prepare(`${INCIDENT_SELECT} WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT 500`)
    .all(...params) as Incident[];
}

export function countByStatus(user: User): Record<string, number> {
  const s = scope(user);
  const rows = db
    .prepare(`SELECT i.status, COUNT(*) AS n FROM incidents i WHERE ${s.where} GROUP BY i.status`)
    .all(...s.params) as { status: string; n: number }[];
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

export function getIncident(id: number): Incident | undefined {
  return db.prepare(`${INCIDENT_SELECT} WHERE i.id = ?`).get(id) as Incident | undefined;
}

export function canView(user: User, incident: Incident): boolean {
  if (user.role === "admin") return true;
  if (user.role === "manager") return incident.manager_id === user.id;
  return incident.company_id === user.company_id;
}

/** 접근 권한까지 확인한 조회 */
export function getIncidentFor(user: User, id: number): Incident | undefined {
  const incident = getIncident(id);
  return incident && canView(user, incident) ? incident : undefined;
}

export function getComments(incidentId: number): Comment[] {
  return db
    .prepare(
      `SELECT cm.*, u.name AS user_name, u.role AS user_role
         FROM comments cm JOIN users u ON u.id = cm.user_id
        WHERE cm.incident_id = ? ORDER BY cm.created_at, cm.id`,
    )
    .all(incidentId) as Comment[];
}

export function getAttachments(incidentId: number): Attachment[] {
  return db
    .prepare(
      `SELECT id, incident_id, comment_id, original_name, mime_type, size, uploaded_by, created_at
         FROM attachments WHERE incident_id = ? ORDER BY id`,
    )
    .all(incidentId) as Attachment[];
}

export function getEvents(incidentId: number): IncidentEvent[] {
  return db
    .prepare(
      `SELECT e.*, u.name AS user_name, u.role AS user_role
         FROM incident_events e LEFT JOIN users u ON u.id = e.user_id
        WHERE e.incident_id = ? ORDER BY e.created_at, e.id`,
    )
    .all(incidentId) as IncidentEvent[];
}

export function addEvent(incidentId: number, userId: number | null, type: string, detail?: string) {
  db.prepare("INSERT INTO incident_events (incident_id, user_id, type, detail) VALUES (?, ?, ?, ?)").run(
    incidentId,
    userId,
    type,
    detail ?? null,
  );
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
