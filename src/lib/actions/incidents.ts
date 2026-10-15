"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "../auth";
import { addEvent, getIncidentFor } from "../incidents";
import { adminIds, notify } from "../notify";
import { buildReport } from "../report";
import { admin, must } from "../supabase/server";
import { fromKstInput } from "../time";
import { CATEGORIES, SEVERITIES, type Incident, type User } from "../types";
import { parseUploads, saveAttachments } from "../uploads";
import type { FormState } from "./auth";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const now = () => new Date().toISOString();

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
  if (!title || !description) return { error: "제목과 장애 내용을 입력하세요." };
  if (!(SEVERITIES as readonly string[]).includes(severity)) return { error: "긴급도를 선택하세요." };
  if (!(CATEGORIES as readonly string[]).includes(category)) return { error: "장애 유형을 선택하세요." };
  const files = parseUploads(fd, user.id);
  if (typeof files === "string") return { error: files };

  const company = must(
    await admin()
      .from("companies")
      .select("id, name, manager_id, manager:profiles!companies_manager_id_fkey(name)")
      .eq("id", user.company_id)
      .single(),
  ) as unknown as { id: number; name: string; manager_id: string | null; manager: { name: string } | null };

  const incident = must(
    await admin()
      .from("incidents")
      .insert({
        company_id: company.id,
        customer_id: user.id,
        manager_id: company.manager_id,
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
  if (company.manager_id) await addEvent(incident.id, null, "assigned", `${company.manager?.name} 담당자 자동 배정 (고객사 담당)`);
  await saveAttachments(files, incident.id, null, user.id);

  const prefix = severity === "긴급" ? "[긴급] " : "";
  if (company.manager_id) {
    await notify([company.manager_id], incident.id, `${prefix}새 장애 접수: ${title} (${company.name})`);
  } else {
    await notify(
      await adminIds(),
      incident.id,
      `${prefix}담당자 미지정 고객사의 장애 접수: ${title} (${company.name}) — 담당자를 배정하세요.`,
    );
  }
  redirect(`/incidents/${incident.id}`);
}

// ------------------------------------------------------------------ 접수 확인 (담당자)

export async function acknowledgeIncident(fd: FormData) {
  const user = await requireUser("manager", "admin");
  const incident = await getIncidentFor(user, Number(fd.get("id")));
  if (!incident || !canHandle(user, incident) || incident.status !== "received") return;

  must(
    await admin()
      .from("incidents")
      .update({ status: "in_progress", acknowledged_at: now(), updated_at: now() })
      .eq("id", incident.id)
      .eq("status", "received"),
  );
  await addEvent(incident.id, user.id, "acknowledged");
  await notify(
    [incident.customer_id],
    incident.id,
    `담당자(${user.name})가 장애 접수를 확인하고 처리를 시작했습니다: ${incident.title}`,
  );
  revalidatePath(`/incidents/${incident.id}`);
}

// ------------------------------------------------------------------ 원인분석·조치내역 등록 (담당자)

export async function saveAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser("manager", "admin");
  const incident = await getIncidentFor(user, Number(fd.get("id")));
  if (!incident || !canHandle(user, incident)) return { error: "조치 권한이 없습니다." };
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
        status: "resolved",
        action_at: incident.action_at ?? t,
        acknowledged_at: incident.acknowledged_at ?? t,
        customer_confirmed_at: null,
        manager_confirmed_at: null,
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
      ? `담당자가 원인분석·조치내역을 등록했습니다. 확인 후 '처리완료'를 눌러주세요: ${incident.title}`
      : `담당자가 조치내역을 수정했습니다. 다시 확인해 주세요: ${incident.title}`,
  );
  revalidatePath(`/incidents/${incident.id}`);
  return { ok: first ? "조치내역을 등록하고 고객에게 알렸습니다." : "조치내역을 수정하고 고객에게 알렸습니다." };
}

// ------------------------------------------------------------------ 댓글 (고객·담당자·관리자)

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

  const targets =
    user.role === "customer"
      ? [incident.manager_id]
      : user.role === "manager"
        ? [incident.customer_id]
        : [incident.customer_id, incident.manager_id];
  const preview = body.length > 40 ? `${body.slice(0, 40)}…` : body;
  await notify(targets, incident.id, `${user.name}님의 새 댓글 [${incident.title}]: ${preview}`);
  revalidatePath(`/incidents/${incident.id}`);
  return { ok: "등록했습니다." };
}

// ------------------------------------------------------------------ 처리완료 확인 (고객·담당자 모두)

export async function confirmComplete(fd: FormData) {
  const user = await requireUser("customer", "manager");
  const incident = await getIncidentFor(user, Number(fd.get("id")));
  if (!incident || incident.status !== "resolved") return;
  if (user.role === "manager" && incident.manager_id !== user.id) return;

  // 고객·담당자가 동시에 눌러도 안전하도록 DB 함수에서 한 번에 처리
  const result = must(
    await admin().rpc("confirm_incident", { p_incident_id: incident.id, p_role: user.role }),
  ) as "closed" | "confirmed" | "noop";
  if (result === "noop") return;

  const isCustomer = user.role === "customer";
  await addEvent(incident.id, user.id, isCustomer ? "customer_confirmed" : "manager_confirmed");

  if (result === "closed") {
    await addEvent(incident.id, null, "closed", "고객·담당자 처리완료 확인 → 장애 이력 저장 및 보고서 생성");
    // 처리완료 시점의 모든 기록을 보고서로 확정해 이력에 저장
    const content = await buildReport(incident.id);
    must(await admin().from("reports").upsert({ incident_id: incident.id, content }, { onConflict: "incident_id" }));
    await notify(
      [incident.customer_id, incident.manager_id],
      incident.id,
      `처리완료되었습니다. 장애 보고서를 다운로드할 수 있습니다: ${incident.title}`,
    );
  } else if (isCustomer) {
    await notify(
      [incident.manager_id],
      incident.id,
      `고객이 처리완료를 확인했습니다. 담당자님도 '처리완료'를 눌러주세요: ${incident.title}`,
    );
  } else {
    await notify(
      [incident.customer_id],
      incident.id,
      `담당자가 처리완료를 확인했습니다. 이상 없으면 '처리완료'를 눌러주세요: ${incident.title}`,
    );
  }
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
      .update({ manager_id: m.id, manager_confirmed_at: null, updated_at: now() })
      .eq("id", incident.id),
  );
  await addEvent(incident.id, user.id, "assigned", `${m.name} 담당자로 배정`);
  await notify([m.id], incident.id, `장애 건이 배정되었습니다: ${incident.title} (${incident.company_name})`);
  await notify([incident.customer_id], incident.id, `담당자가 ${m.name}님으로 배정되었습니다: ${incident.title}`);
  revalidatePath(`/incidents/${incident.id}`);
}
