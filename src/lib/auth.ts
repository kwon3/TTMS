import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { admin, createAuthClient } from "./supabase/server";
import type { Role, User } from "./types";

type ProfileRow = {
  id: string;
  email: string;
  name: string;
  role: Role;
  company_id: number | null;
  phone: string | null;
  active: boolean;
  company: { name: string } | null;
};

export async function getProfile(id: string): Promise<User | null> {
  const { data } = await admin()
    .from("profiles")
    .select("id, email, name, role, company_id, phone, active, company:companies!profiles_company_fk(name)")
    .eq("id", id)
    .maybeSingle<ProfileRow>();
  if (!data) return null;
  const { company, ...rest } = data;
  return { ...rest, company_name: company?.name ?? null };
}

/** 현재 로그인 사용자 (없거나 사용 중지면 null). 요청당 한 번만 조회한다. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createAuthClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) return null;
  const user = await getProfile(uid);
  return user && user.active ? user : null;
});

/** 로그인 필수. 역할 제한이 있으면 해당 역할만 통과 */
export async function requireUser(...roles: Role[]): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (roles.length > 0 && !roles.includes(user.role)) redirect("/");
  return user;
}

/** 관리자 계정이 하나도 없으면 최초 설정 화면을 보여준다 */
export async function needsSetup(): Promise<boolean> {
  const { count, error } = await admin()
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");
  if (error)
    throw new Error(`Supabase 테이블을 찾을 수 없습니다. supabase/schema.sql을 SQL Editor에서 실행하세요. (${error.message})`);
  return (count ?? 0) === 0;
}
