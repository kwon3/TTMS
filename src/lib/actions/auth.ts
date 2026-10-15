"use server";

import { redirect } from "next/navigation";
import { createSession, destroySession, requireUser } from "../auth";
import { db } from "../db";
import { hashPassword, verifyPassword } from "../password";

export type FormState = { error?: string; ok?: string } | undefined;

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!username || !password) return { error: "아이디와 비밀번호를 입력하세요." };

  const user = db
    .prepare("SELECT id, password_hash, active FROM users WHERE username = ?")
    .get(username) as { id: number; password_hash: string; active: number } | undefined;
  if (!user || !verifyPassword(password, user.password_hash))
    return { error: "아이디 또는 비밀번호가 올바르지 않습니다." };
  if (!user.active) return { error: "사용이 중지된 계정입니다. 관리자에게 문의하세요." };

  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(new Date().toISOString());
  await createSession(user.id);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id) as { password_hash: string };
  if (!verifyPassword(current, row.password_hash)) return { error: "현재 비밀번호가 올바르지 않습니다." };
  if (next.length < 8) return { error: "새 비밀번호는 8자 이상이어야 합니다." };
  if (next !== confirm) return { error: "새 비밀번호 확인이 일치하지 않습니다." };
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(next), user.id);
  return { ok: "비밀번호를 변경했습니다." };
}

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "이름을 입력하세요." };
  db.prepare("UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?").run(
    name,
    String(formData.get("email") ?? "").trim() || null,
    String(formData.get("phone") ?? "").trim() || null,
    user.id,
  );
  return { ok: "정보를 저장했습니다." };
}
