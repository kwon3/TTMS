"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "../auth";
import { addEvent, companyManagers, getIncidentFor, isDesignatedFor, managerSideIds } from "../incidents";
import { adminIds, notify } from "../notify";
import { buildReport } from "../report";
import { admin, must } from "../supabase/server";
import { fromKstInput } from "../time";
import { CATEGORIES, SEVERITIES, type Incident, type User } from "../types";
import { parseUploads, saveAttachments } from "../uploads";
import type { FormState } from "./auth";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const now = () => new Date().toISOString();

/** 원인분석·조치내역은 담당자 누구나(지정되지 않았어도) 또는 관리자가 작성할 수 있다 */
function canWriteAction(user: User) {
  return user.role === "admin" || user.role === "manager";
}

// ------------------------------------------------------------------ 장애 접수 (고객)

export async function createIncident(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser("customer");
  if (!user.company_id) return { error: "소속 고객사가 지정되지 않은 계정입니다. 관리자에게 문의하세요." };

  const title = str(fd, "title");
  const description = str(fd, "description");
  const severity = str(fd, "severity");
  const category = str(fd, "category");
  if (!title || !description) return { error: "제목과 장애 내용을 입력하세요." };
  if (!(SEVERITIES as readonly string[]).includes(severity)) return { error: "긴급도를 선택하세요." };
  if (!(CATEGORIES as readonly string[]).includes(category)) return { error: "장애 유형을 선택하세요." };
  const files = parseUploads(fd, user.id);
  if (typeof files === "string") return { error: files };

  const company = must(await admin().from("companies").select("id, name").eq("id", user.company_id).single()) as {
    id: number;
    name: string;
  };
  const managers = await companyManagers(company.id);

  // 담당자는 지정 담당자 중 '접수 확인'을 누른 사람으로 정해진다. 지정 담당자가 1명이면 바로 배정.
  const incident = must(
    await admin()
      .from("incidents")
      .insert({
        company_id: company.id,
        customer_id: user.id,
        manager_id: managers.length === 1 ? managers[0].id : null,
        title,
        description,
        severity,
        category,
        target_system: str(fd, "target_system") || null,
        occurred_at: fromKstInput(str(fd, "occurred_at")),
      })
      .select("id")
      .single(),
  ) as { id: number };

  await addEvent(incident.id, user.id, "created", `긴급도 ${severity} / ${category}`);
  if (managers.length > 0)
    await addEvent(incident.id, null, "assigned", `고객사 지정 담당자: ${managers.map((m) => m.name).join(", ")}`);
  await saveAttachments(files, incident.id, null, user.id);

  const prefix = severity === "긴급" ? "[긴급] " : "";
  if (managers.length > 0) {
    await notify(
      managers.map((m) => m.id),
      incident.id,
      `${prefix}새 장애 접수: ${title} (${company.name})`,
    );
  } else {
    await notify(
      await adminIds(),
      incident.id,
      `${prefix}담당자 미지정 고객사의 장애 접수: ${title} (${company.name}) — 담당자를 지정하세요.`,
    );
  }
  redirect(`/incidents/${incident.id}`);
}

// ------------------------------------------------------------------ 접수 확인 (지정 담당자·관리자)

export async function acknowledgeIncident(fd: FormData) {
  const user = await requireUser("manager", "admin");
  const incident = await getIncidentFor(user, Number(fd.get("id")));
  if (!incident || incident.status !== "received" || !(await isDesignatedFor(user, incident))) return;

  // 지정 담당자가 접수 확인하면 그 사람이 이 건의 담당자가 된다
  const takeOver = user.role === "manager" && !incident.manager_id;
  must(
    await admin()
      .from("incidents")
      .update({
        status: "in_progress",
        acknowledged_at: now(),
        updated_at: now(),
        ...(takeOver ? { manager_id: user.id } : {}),
      })
      .eq("id", incident.id)
      .eq("status", "received"),
  );
  await addEvent(incident.id, user.id, "acknowledged", takeOver ? `${user.name} 담당자로 배정` : undefined);
  await notify(
    [incident.customer_id],
    incident.id,
    `담당자(${user.name})가 장애 접수를 확인하고 처리를 시작했습니다: ${incident.title}`,
  );
  // 다른 지정 담당자에게도 누가 맡았는지 알린다
  await notify(
    (await managerSideIds(incident)).filter((id) => id !== user.id),
    incident.id,
    `${user.name}님이 장애 접수를 확인하고 담당합니다: ${incident.title}`,
  );
  revalidatePath(`/incidents/${incident.id}`);
}

// ------------------------------------------------------------------ 원인분석·조치내역 등록 (담당자 누구나·관리자)

export async function saveAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser("manager", "admin");
  const incident = await getIncidentFor(user, Number(fd.get("id")));
  if (!incident || !canWriteAction(user)) return { error: "조치 권한이 없습니다." };
  if (incident.status === "closed") return { error: "이미 처리완료된 건입니다." };

  const cause = str(fd, "cause");
  const action = str(fd, "action");
  if (!cause || !action) return { error: "장애 원인과 조치 내역을 모두 입력하세요." };
  const files = parseUploads(fd, user.id);
  if (typeof files === "string") return { error: files };

  const first = !incident.action_at;
  const hadConfirm = Boolean(incident.customer_confirmed_at || incident.manager_confirmed_at);
  const t = now();
  must(
    await admin()
      .from("incidents")
      .update({
        cause,
        action_taken: action,
        action_by: user.id,
        status: "resolved",
        action_at: incident.action_at ?? t,
        acknowledged_at: incident.acknowledged_at ?? t,
        customer_confirmed_at: null,
        customer_confirmed_by: null,
        manager_confirmed_at: null,
        manager_confirmed_by: null,
        updated_at: t,
      })
      .eq("id", incident.id)
      .neq("status", "closed"),
  );
  if (!incident.acknowledged_at) await addEvent(incident.id, user.id, "acknowledged");
  await addEvent(incident.id, user.id, first ? "action" : "action_updated");
  if (hadConfirm) await addEvent(incident.id, null, "confirm_reset");
  await saveAttachments(files, incident.id, null, user.id);

  await notify(
    [incident.customer_id],
    incident.id,
    first
      ? `담당자(${user.name})가 원인분석·조치내역을 등록했습니다. 확인 후 '처리완료'를 눌러주세요: ${incident.title}`
      : `담당자(${user.name})가 조치내역을 수정했습니다. 다시 확인해 주세요: ${incident.title}`,
  );
  // 지정 담당자가 아닌 사람이 작성했으면 지정 담당자들에게도 알린다
  await notify(
    (await managerSideIds(incident)).filter((id) => id !== user.id),
    incident.id,
    `${user.name}님이 원인분석·조치내역을 ${first ? "등록" : "수정"}했습니다: ${incident.title}`,
  );
  revalidatePath(`/incidents/${incident.id}`);
  return { ok: first ? "조치내역을 등록하고 고객사에 알렸습니다." : "조치내역을 수정하고 고객사에 알렸습니다." };
}

// ------------------------------------------------------------------ 댓글 (고객·담당자 누구나·관리자)

export async function addComment(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const incident = await getIncidentFor(user, Number(fd.get("id")));
  if (!incident) return { error: "접근 권한이 없습니다." };
  if (incident.status === "closed") return { error: "처리완료된 건에는 댓글을 남길 수 없습니다." };
  const body = str(fd, "body");
  if (!body) return { error: "내용을 입력하세요." };
  const files = parseUploads(fd, user.id);
  if (typeof files === "string") return { error: files };

  const comment = must(
    await admin().from("comments").insert({ incident_id: incident.id, user_id: user.id, body }).select("id").single(),
  ) as { id: number };
  must(await admin().from("incidents").update({ updated_at: now() }).eq("id", incident.id));
  await saveAttachments(files, incident.id, comment.id, user.id);

  // 고객이 쓰면 담당자 쪽 전원에게, 담당자·관리자가 쓰면 고객과 (본인 외) 담당자 쪽에 알린다
  const managerSide = await managerSideIds(incident);
  const targets = user.role === "customer" ? managerSide : [incident.customer_id, ...managerSide];
  const preview = body.length > 40 ? `${body.slice(0, 40)}…` : body;
  await notify(
    targets.filter((id) => id !== user.id),
    incident.id,
    `${user.name}님의 새 댓글 [${incident.title}]: ${preview}`,
  );
  revalidatePath(`/incidents/${incident.id}`);
  return { ok: "등록했습니다." };
}

// ------------------------------------------------------------------ 처리완료 확인 (고객 / 지정 담당자, 관리자는 담당자 대리)

/** 종결 시점의 기록으로 보고서를 확정 저장하고 양쪽에 알린다 */
async function finalizeClosed(incident: Incident, message: string) {
  const content = await buildReport(incident.id);
  must(await admin().from("reports").upsert({ incident_id: incident.id, content }, { onConflict: "incident_id" }));
  await notify([incident.customer_id, ...(await managerSideIds(incident))], incident.id, message);
}

export async function confirmComplete(fd: FormData) {
  const user = await requireUser("customer", "manager", "admin");
  const incident = await getIncidentFor(user, Number(fd.get("id")));
  if (!incident || incident.status !== "resolved") return;
  // 담당자 쪽 확인은 고객사 지정 담당자(또는 배정 담당자)와 관리자만
  if (user.role !== "customer" && !(await isDesignatedFor(user, incident))) return;

  const side = user.role === "customer" ? "customer" : "manager";
  const byAdmin = user.role === "admin";

  // 고객·담당자가 동시에 눌러도 안전하도록 DB 함수에서 한 번에 처리
  const result = must(
    await admin().rpc("confirm_incident", { p_incident_id: incident.id, p_role: side, p_user: user.id }),
  ) as "closed" | "confirmed" | "noop";
  if (result === "noop") return;

  await addEvent(
    incident.id,
    user.id,
    side === "customer" ? "customer_confirmed" : "manager_confirmed",
    byAdmin ? `관리자 ${user.name} 대리 확인` : undefined,
  );

  if (result === "closed") {
    await addEvent(incident.id, null, "closed", "고객·담당자 처리완료 확인 → 장애 이력 저장 및 보고서 생성");
    await finalizeClosed(incident, `처리완료되었습니다. 장애 보고서를 다운로드할 수 있습니다: ${incident.title}`);
  } else if (side === "customer") {
    await notify(
      await managerSideIds(incident),
      incident.id,
      `고객이 처리완료를 확인했습니다. 담당자님도 '처리완료'를 눌러주세요: ${incident.title}`,
    );
  } else {
    await notify(
      [incident.customer_id, ...(await managerSideIds(incident))].filter((id) => id !== user.id),
      incident.id,
      byAdmin
        ? `관리자(${user.name})가 담당자 대신 처리완료를 확인했습니다. 고객 확인 후 종결됩니다: ${incident.title}`
        : `담당자(${user.name})가 처리완료를 확인했습니다. 이상 없으면 '처리완료'를 눌러주세요: ${incident.title}`,
    );
  }
  revalidatePath(`/incidents/${incident.id}`);
}

// ------------------------------------------------------------------ 관리자 강제 종결 (단계와 무관)

export async function adminCloseIncident(fd: FormData) {
  const user = await requireUser("admin");
  const incident = await getIncidentFor(user, Number(fd.get("id")));
  if (!incident || incident.status === "closed") return;
  const reason = str(fd, "reason");

  const result = must(
    await admin().rpc("admin_close_incident", { p_incident_id: incident.id, p_user: user.id }),
  ) as "closed" | "noop";
  if (result === "noop") return;

  await addEvent(incident.id, user.id, "admin_closed", reason ? `사유: ${reason}` : undefined);
  await finalizeClosed(
    incident,
    `관리자(${user.name})가 처리완료(종결)했습니다. 장애 보고서를 다운로드할 수 있습니다: ${incident.title}`,
  );
  revalidatePath(`/incidents/${incident.id}`);
}

// ------------------------------------------------------------------ 담당자 변경 (관리자)

export async function reassignManager(fd: FormData) {
  const user = await requireUser("admin");
  const incident = await getIncidentFor(user, Number(fd.get("id")));
  const managerId = str(fd, "manager_id");
  if (!incident || incident.status === "closed" || !managerId || managerId === incident.manager_id) return;
  const m = must(
    await admin()
      .from("profiles")
      .select("id, name")
      .eq("id", managerId)
      .eq("role", "manager")
      .eq("active", true)
      .maybeSingle(),
  ) as { id: string; name: string } | null;
  if (!m) return;

  must(
    await admin()
      .from("incidents")
      .update({ manager_id: m.id, manager_confirmed_at: null, manager_confirmed_by: null, updated_at: now() })
      .eq("id", incident.id),
  );
  await addEvent(incident.id, user.id, "assigned", `${m.name} 담당자로 배정`);
  await notify([m.id], incident.id, `장애 건이 배정되었습니다: ${incident.title} (${incident.company_name})`);
  await notify([incident.customer_id], incident.id, `담당자가 ${m.name}님으로 배정되었습니다: ${incident.title}`);
  revalidatePath(`/incidents/${incident.id}`);
}
