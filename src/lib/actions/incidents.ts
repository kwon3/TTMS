"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "../auth";
import { db, nowString, transaction } from "../db";
import { filesFrom, saveFiles, validateFiles } from "../files";
import { addEvent, getIncidentFor } from "../incidents";
import { adminIds, notify } from "../notify";
import { buildReport, saveReport } from "../report";
import { CATEGORIES, SEVERITIES, type Incident, type User } from "../types";
import type { FormState } from "./auth";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

/** 담당자 본인 또는 관리자만 조치 가능 */
function canHandle(user: User, incident: Incident) {
  return user.role === "admin" || (user.role === "manager" && incident.manager_id === user.id);
}

// ------------------------------------------------------------------ 장애 접수 (고객)

export async function createIncident(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser("customer");
  if (!user.company_id) return { error: "소속 고객사가 지정되지 않은 계정입니다. 관리자에게 문의하세요." };

  const title = str(fd, "title");
  const description = str(fd, "description");
  const severity = str(fd, "severity");
  const category = str(fd, "category");
  const targetSystem = str(fd, "target_system");
  const occurredAt = str(fd, "occurred_at");
  if (!title || !description) return { error: "제목과 장애 내용을 입력하세요." };
  if (!(SEVERITIES as readonly string[]).includes(severity)) return { error: "긴급도를 선택하세요." };
  if (!(CATEGORIES as readonly string[]).includes(category)) return { error: "장애 유형을 선택하세요." };
  const files = filesFrom(fd);
  const fileError = validateFiles(files);
  if (fileError) return { error: fileError };

  const company = db.prepare("SELECT id, name, manager_id FROM companies WHERE id = ?").get(user.company_id) as {
    id: number;
    name: string;
    manager_id: number | null;
  };

  const id = transaction(() => {
    const newId = Number(
      db
        .prepare(
          `INSERT INTO incidents (company_id, customer_id, manager_id, title, description, severity, category, target_system, occurred_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(company.id, user.id, company.manager_id, title, description, severity, category, targetSystem || null, occurredAt || null)
        .lastInsertRowid,
    );
    const ymd = nowString().slice(0, 10).replaceAll("-", "");
    db.prepare("UPDATE incidents SET code = ? WHERE id = ?").run(`INC-${ymd}-${String(newId).padStart(4, "0")}`, newId);
    addEvent(newId, user.id, "created", `긴급도 ${severity} / ${category}`);
    if (company.manager_id) {
      const m = db.prepare("SELECT name FROM users WHERE id = ?").get(company.manager_id) as { name: string };
      addEvent(newId, null, "assigned", `${m.name} 담당자 자동 배정 (고객사 담당)`);
    }
    return newId;
  });
  await saveFiles(files, id, null, user.id);

  const prefix = severity === "긴급" ? "[긴급] " : "";
  if (company.manager_id) {
    notify([company.manager_id], id, `${prefix}새 장애 접수: ${title} (${company.name})`);
  } else {
    notify(adminIds(), id, `${prefix}담당자 미지정 고객사의 장애 접수: ${title} (${company.name}) — 담당자를 배정하세요.`);
  }
  redirect(`/incidents/${id}`);
}

// ------------------------------------------------------------------ 접수 확인 (담당자)

export async function acknowledgeIncident(fd: FormData) {
  const user = await requireUser("manager", "admin");
  const incident = getIncidentFor(user, Number(fd.get("id")));
  if (!incident || !canHandle(user, incident) || incident.status !== "received") return;

  db.prepare("UPDATE incidents SET status = 'in_progress', acknowledged_at = ?, updated_at = ? WHERE id = ?").run(
    nowString(),
    nowString(),
    incident.id,
  );
  addEvent(incident.id, user.id, "acknowledged");
  notify([incident.customer_id], incident.id, `담당자(${user.name})가 장애 접수를 확인하고 처리를 시작했습니다: ${incident.title}`);
  revalidatePath(`/incidents/${incident.id}`);
}

// ------------------------------------------------------------------ 원인분석·조치내역 등록 (담당자)

export async function saveAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser("manager", "admin");
  const incident = getIncidentFor(user, Number(fd.get("id")));
  if (!incident || !canHandle(user, incident)) return { error: "조치 권한이 없습니다." };
  if (incident.status === "closed") return { error: "이미 처리완료된 건입니다." };

  const cause = str(fd, "cause");
  const action = str(fd, "action");
  if (!cause || !action) return { error: "장애 원인과 조치 내역을 모두 입력하세요." };
  const files = filesFrom(fd);
  const fileError = validateFiles(files);
  if (fileError) return { error: fileError };

  const first = !incident.action_at;
  const hadConfirm = Boolean(incident.customer_confirmed_at || incident.manager_confirmed_at);
  const now = nowString();
  transaction(() => {
    db.prepare(
      `UPDATE incidents
          SET cause = ?, action_taken = ?, status = 'resolved',
              action_at = COALESCE(action_at, ?), acknowledged_at = COALESCE(acknowledged_at, ?),
              customer_confirmed_at = NULL, manager_confirmed_at = NULL, updated_at = ?
        WHERE id = ?`,
    ).run(cause, action, now, now, now, incident.id);
    if (!incident.acknowledged_at) addEvent(incident.id, user.id, "acknowledged");
    addEvent(incident.id, user.id, first ? "action" : "action_updated");
    if (hadConfirm) addEvent(incident.id, null, "confirm_reset");
  });
  await saveFiles(files, incident.id, null, user.id);

  notify(
    [incident.customer_id],
    incident.id,
    first
      ? `담당자가 원인분석·조치내역을 등록했습니다. 확인 후 '처리완료'를 눌러주세요: ${incident.title}`
      : `담당자가 조치내역을 수정했습니다. 다시 확인해 주세요: ${incident.title}`,
  );
  revalidatePath(`/incidents/${incident.id}`);
  return { ok: first ? "조치내역을 등록하고 고객에게 알렸습니다." : "조치내역을 수정하고 고객에게 알렸습니다." };
}

// ------------------------------------------------------------------ 댓글 (고객·담당자·관리자)

export async function addComment(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const incident = getIncidentFor(user, Number(fd.get("id")));
  if (!incident) return { error: "접근 권한이 없습니다." };
  if (incident.status === "closed") return { error: "처리완료된 건에는 댓글을 남길 수 없습니다." };
  const body = str(fd, "body");
  if (!body) return { error: "내용을 입력하세요." };
  const files = filesFrom(fd);
  const fileError = validateFiles(files);
  if (fileError) return { error: fileError };

  const commentId = Number(
    db.prepare("INSERT INTO comments (incident_id, user_id, body) VALUES (?, ?, ?)").run(incident.id, user.id, body)
      .lastInsertRowid,
  );
  db.prepare("UPDATE incidents SET updated_at = ? WHERE id = ?").run(nowString(), incident.id);
  await saveFiles(files, incident.id, commentId, user.id);

  const targets =
    user.role === "customer"
      ? [incident.manager_id]
      : user.role === "manager"
        ? [incident.customer_id]
        : [incident.customer_id, incident.manager_id];
  const preview = body.length > 40 ? `${body.slice(0, 40)}…` : body;
  notify(targets, incident.id, `${user.name}님의 새 댓글 [${incident.title}]: ${preview}`);
  revalidatePath(`/incidents/${incident.id}`);
  return { ok: "등록했습니다." };
}

// ------------------------------------------------------------------ 처리완료 확인 (고객·담당자 모두)

export async function confirmComplete(fd: FormData) {
  const user = await requireUser("customer", "manager");
  const incident = getIncidentFor(user, Number(fd.get("id")));
  if (!incident || incident.status !== "resolved") return;
  if (user.role === "manager" && incident.manager_id !== user.id) return;

  const now = nowString();
  const isCustomer = user.role === "customer";
  const customerAt = isCustomer ? now : incident.customer_confirmed_at;
  const managerAt = isCustomer ? incident.manager_confirmed_at : now;
  if ((isCustomer && incident.customer_confirmed_at) || (!isCustomer && incident.manager_confirmed_at)) return;

  const bothDone = Boolean(customerAt && managerAt);
  transaction(() => {
    db.prepare(
      `UPDATE incidents SET customer_confirmed_at = ?, manager_confirmed_at = ?, updated_at = ?,
              status = ?, closed_at = ? WHERE id = ?`,
    ).run(customerAt, managerAt, now, bothDone ? "closed" : "resolved", bothDone ? now : null, incident.id);
    addEvent(incident.id, user.id, isCustomer ? "customer_confirmed" : "manager_confirmed");
    if (bothDone) {
      addEvent(incident.id, null, "closed", "고객·담당자 처리완료 확인 → 장애 이력 저장 및 보고서 생성");
      // 처리완료 시점의 모든 기록을 보고서로 확정해 이력에 저장
      saveReport(incident.id, buildReport(incident.id));
    }
  });

  if (bothDone) {
    notify(
      [incident.customer_id, incident.manager_id],
      incident.id,
      `처리완료되었습니다. 장애 보고서를 다운로드할 수 있습니다: ${incident.title}`,
    );
  } else if (isCustomer) {
    notify([incident.manager_id], incident.id, `고객이 처리완료를 확인했습니다. 담당자님도 '처리완료'를 눌러주세요: ${incident.title}`);
  } else {
    notify([incident.customer_id], incident.id, `담당자가 처리완료를 확인했습니다. 이상 없으면 '처리완료'를 눌러주세요: ${incident.title}`);
  }
  revalidatePath(`/incidents/${incident.id}`);
}

// ------------------------------------------------------------------ 담당자 변경 (관리자)

export async function reassignManager(fd: FormData) {
  const user = await requireUser("admin");
  const incident = getIncidentFor(user, Number(fd.get("id")));
  const managerId = Number(fd.get("manager_id"));
  if (!incident || incident.status === "closed" || !managerId || managerId === incident.manager_id) return;
  const m = db.prepare("SELECT id, name FROM users WHERE id = ? AND role = 'manager' AND active = 1").get(managerId) as
    | { id: number; name: string }
    | undefined;
  if (!m) return;

  transaction(() => {
    db.prepare(
      "UPDATE incidents SET manager_id = ?, manager_confirmed_at = NULL, updated_at = ? WHERE id = ?",
    ).run(m.id, nowString(), incident.id);
    addEvent(incident.id, user.id, "assigned", `${m.name} 담당자로 배정`);
  });
  notify([m.id], incident.id, `장애 건이 배정되었습니다: ${incident.title} (${incident.company_name})`);
  notify([incident.customer_id], incident.id, `담당자가 ${m.name}님으로 배정되었습니다: ${incident.title}`);
  revalidatePath(`/incidents/${incident.id}`);
}
