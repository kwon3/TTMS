"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "../auth";
import { db } from "../db";
import { hashPassword } from "../password";
import type { FormState } from "./auth";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const idOrNull = (fd: FormData, key: string) => Number(fd.get(key)) || null;

function isActiveManager(id: number | null) {
  return !id || Boolean(db.prepare("SELECT 1 FROM users WHERE id = ? AND role = 'manager' AND active = 1").get(id));
}

// ------------------------------------------------------------------ 고객사

export async function createCompany(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireUser("admin");
  const name = str(fd, "name");
  const managerId = idOrNull(fd, "manager_id");
  if (!name) return { error: "고객사명을 입력하세요." };
  if (!isActiveManager(managerId)) return { error: "올바른 담당자를 선택하세요." };
  if (db.prepare("SELECT 1 FROM companies WHERE name = ?").get(name)) return { error: "이미 등록된 고객사명입니다." };
  db.prepare("INSERT INTO companies (name, manager_id) VALUES (?, ?)").run(name, managerId);
  revalidatePath("/admin/companies");
  return { ok: `'${name}' 고객사를 등록했습니다.` };
}

export async function setCompanyManager(fd: FormData) {
  await requireUser("admin");
  const companyId = Number(fd.get("company_id"));
  const managerId = idOrNull(fd, "manager_id");
  if (!isActiveManager(managerId)) return;
  db.prepare("UPDATE companies SET manager_id = ? WHERE id = ?").run(managerId, companyId);
  revalidatePath("/admin/companies");
}

// ------------------------------------------------------------------ 사용자 계정

export async function createUser(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireUser("admin");
  const username = str(fd, "username");
  const password = String(fd.get("password") ?? "");
  const name = str(fd, "name");
  const role = str(fd, "role");
  const companyId = idOrNull(fd, "company_id");

  if (!/^[A-Za-z0-9_.-]{3,30}$/.test(username)) return { error: "아이디는 영문·숫자·_.- 조합 3~30자로 입력하세요." };
  if (password.length < 8) return { error: "비밀번호는 8자 이상이어야 합니다." };
  if (!name) return { error: "이름을 입력하세요." };
  if (!["admin", "manager", "customer"].includes(role)) return { error: "역할을 선택하세요." };
  if (role === "customer" && !companyId) return { error: "고객 계정은 소속 고객사를 선택해야 합니다." };
  if (db.prepare("SELECT 1 FROM users WHERE username = ?").get(username)) return { error: "이미 사용 중인 아이디입니다." };

  db.prepare(
    "INSERT INTO users (username, password_hash, name, role, company_id, email, phone) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(
    username,
    hashPassword(password),
    name,
    role,
    role === "customer" ? companyId : null,
    str(fd, "email") || null,
    str(fd, "phone") || null,
  );
  revalidatePath("/admin/users");
  return { ok: `'${name}' 계정을 만들었습니다.` };
}

export async function toggleUserActive(fd: FormData) {
  const admin = await requireUser("admin");
  const id = Number(fd.get("id"));
  if (id === admin.id) return; // 자기 자신은 중지할 수 없음
  db.prepare("UPDATE users SET active = 1 - active WHERE id = ?").run(id);
  db.prepare("DELETE FROM sessions WHERE user_id = ? AND (SELECT active FROM users WHERE id = ?) = 0").run(id, id);
  revalidatePath("/admin/users");
}

export async function resetPassword(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireUser("admin");
  const id = Number(fd.get("id"));
  const password = String(fd.get("password") ?? "");
  if (password.length < 8) return { error: "비밀번호는 8자 이상이어야 합니다." };
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(password), id);
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
  return { ok: "비밀번호를 재설정했습니다." };
}
