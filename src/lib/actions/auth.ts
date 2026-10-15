"use server";

import { redirect } from "next/navigation";
import { getProfile, needsSetup, requireUser } from "../auth";
import { admin, createAuthClient, createStatelessClient, must } from "../supabase/server";

export type FormState = { error?: string; ok?: string } | undefined;

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = str(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "이메일과 비밀번호를 입력하세요." };

  const supabase = await createAuthClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: "이메일 또는 비밀번호가 올바르지 않습니다." };

  const profile = await getProfile(data.user.id);
  if (!profile || !profile.active) {
    await supabase.auth.signOut();
    return { error: profile ? "사용이 중지된 계정입니다. 관리자에게 문의하세요." : "등록되지 않은 계정입니다. 관리자에게 문의하세요." };
  }
  redirect("/");
}

export async function logout() {
  const supabase = await createAuthClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** 최초 관리자 계정 만들기 (관리자가 한 명도 없을 때만 동작) */
export async function setupAdmin(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await needsSetup())) redirect("/login");
  const email = str(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const name = str(formData, "name");
  if (!email || !name) return { error: "이메일과 이름을 입력하세요." };
  if (password.length < 8) return { error: "비밀번호는 8자 이상이어야 합니다." };

  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) return { error: `계정을 만들지 못했습니다: ${error?.message}` };
  must(await admin().from("profiles").insert({ id: data.user.id, email, name, role: "admin" }));

  const supabase = await createAuthClient();
  await supabase.auth.signInWithPassword({ email, password });
  redirect("/");
}

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const check = await createStatelessClient().auth.signInWithPassword({ email: user.email, password: current });
  if (check.error) return { error: "현재 비밀번호가 올바르지 않습니다." };
  if (next.length < 8) return { error: "새 비밀번호는 8자 이상이어야 합니다." };
  if (next !== confirm) return { error: "새 비밀번호 확인이 일치하지 않습니다." };

  const { error } = await admin().auth.admin.updateUserById(user.id, { password: next });
  if (error) return { error: `변경하지 못했습니다: ${error.message}` };
  return { ok: "비밀번호를 변경했습니다." };
}

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const name = str(formData, "name");
  if (!name) return { error: "이름을 입력하세요." };
  must(
    await admin()
      .from("profiles")
      .update({ name, phone: str(formData, "phone") || null })
      .eq("id", user.id),
  );
  return { ok: "정보를 저장했습니다." };
}
