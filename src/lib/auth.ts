import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import type { Role, User } from "./types";

const COOKIE = "sid";
const SESSION_DAYS = 7;

export async function createSession(userId: number) {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(
    token,
    userId,
    expires.toISOString(),
  );
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIE !== "1",
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  store.delete(COOKIE);
}

/** 현재 로그인 사용자 (없으면 null) */
export async function getCurrentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.name, u.role, u.company_id, u.email, u.phone, u.active,
              c.name AS company_name, s.expires_at
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN companies c ON c.id = u.company_id
        WHERE s.token = ?`,
    )
    .get(token) as (User & { expires_at: string }) | undefined;
  if (!row || !row.active || new Date(row.expires_at) < new Date()) return null;
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    company_id: row.company_id,
    company_name: row.company_name,
    email: row.email,
    phone: row.phone,
    active: row.active,
  };
}

/** 로그인 필수. 역할 제한이 있으면 해당 역할만 통과 */
export async function requireUser(...roles: Role[]): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (roles.length > 0 && !roles.includes(user.role)) redirect("/");
  return user;
}
