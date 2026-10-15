"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "../auth";
import { admin, must } from "../supabase/server";
import type { FormState } from "./auth";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const BAN_FOREVER = "876000h"; // 사용 중지 = 사실상 영구 로그인 차단

/** 폼에서 선택된 담당자 중 실제로 사용 중인 담당자만 남긴다 */
async function validManagerIds(fd: FormData): Promise<string[]> {
  const ids = [...new Set(fd.getAll("manager_ids").map(String).filter(Boolean))];
  if (ids.length === 0) return [];
  const rows = must(
    await admin().from("profiles").select("id").in("id", ids).eq("role", "manager").eq("active", true),
  ) as { id: string }[];
  return rows.map((r) => r.id);
}

async function replaceCompanyManagers(companyId: number, managerIds: string[]) {
  must(await admin().from("company_managers").delete().eq("company_id", companyId));
  if (managerIds.length > 0)
    must(
      await admin()
        .from("company_managers")
        .insert(managerIds.map((manager_id) => ({ company_id: companyId, manager_id }))),
    );
}

// ------------------------------------------------------------------ 고객사 (담당자 여러 명 지정)

export async function createCompany(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireUser("admin");
  const name = str(fd, "name");
  if (!name) return { error: "고객사명을 입력하세요." };
  const managerIds = await validManagerIds(fd);
  const { data, error } = await admin().from("companies").insert({ name }).select("id").single();
  if (error || !data) return { error: error?.code === "23505" ? "이미 등록된 고객사명입니다." : error?.message };
  await replaceCompanyManagers(data.id, managerIds);
  revalidatePath("/admin/companies");
  return { ok: `'${name}' 고객사를 등록했습니다.` };
}

export async function setCompanyManagers(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireUser("admin");
  const companyId = Number(fd.get("company_id"));
  if (!companyId) return { error: "고객사를 찾을 수 없습니다." };
  const managerIds = await validManagerIds(fd);
  await replaceCompanyManagers(companyId, managerIds);
  revalidatePath("/admin/companies");
  return { ok: `담당자 ${managerIds.length}명을 지정했습니다.` };
}

// ------------------------------------------------------------------ 사용자 계정

export async function createUser(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireUser("admin");
  const email = str(fd, "email").toLowerCase();
  const password = String(fd.get("password") ?? "");
  const name = str(fd, "name");
  const role = str(fd, "role");
  const companyId = Number(fd.get("company_id")) || null;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "올바른 이메일을 입력하세요." };
  if (password.length < 8) return { error: "비밀번호는 8자 이상이어야 합니다." };
  if (!name) return { error: "이름을 입력하세요." };
  if (!["admin", "manager", "customer"].includes(role)) return { error: "역할을 선택하세요." };
  if (role === "customer" && !companyId) return { error: "고객 계정은 소속 고객사를 선택해야 합니다." };

  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) {
    const dup = error?.message.toLowerCase().includes("already");
    return { error: dup ? "이미 등록된 이메일입니다." : `계정을 만들지 못했습니다: ${error?.message}` };
  }
  const { error: profileError } = await admin()
    .from("profiles")
    .insert({
      id: data.user.id,
      email,
      name,
      role,
      company_id: role === "customer" ? companyId : null,
      phone: str(fd, "phone") || null,
    });
  if (profileError) {
    await admin().auth.admin.deleteUser(data.user.id); // 프로필 저장 실패 시 로그인 계정도 되돌린다
    return { error: `계정을 만들지 못했습니다: ${profileError.message}` };
  }
  revalidatePath("/admin/users");
  return { ok: `'${name}' 계정을 만들었습니다.` };
}

export async function toggleUserActive(fd: FormData) {
  const me = await requireUser("admin");
  const id = str(fd, "id");
  if (!id || id === me.id) return; // 자기 자신은 중지할 수 없음
  const row = must(await admin().from("profiles").select("active").eq("id", id).single()) as { active: boolean };
  const active = !row.active;
  must(await admin().from("profiles").update({ active }).eq("id", id));
  await admin().auth.admin.updateUserById(id, { ban_duration: active ? "none" : BAN_FOREVER });
  revalidatePath("/admin/users");
}

export async function resetPassword(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireUser("admin");
  const id = str(fd, "id");
  const password = String(fd.get("password") ?? "");
  if (password.length < 8) return { error: "비밀번호는 8자 이상이어야 합니다." };
  const { error } = await admin().auth.admin.updateUserById(id, { password });
  if (error) return { error: `재설정하지 못했습니다: ${error.message}` };
  return { ok: "비밀번호를 재설정했습니다." };
}
