import { StateForm, SubmitButton } from "@/components/forms";
import { createUser, resetPassword, toggleUserActive } from "@/lib/actions/admin";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLE_LABEL, type Role } from "@/lib/types";

type Row = {
  id: number;
  username: string;
  name: string;
  role: Role;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  active: number;
  created_at: string;
};

export default async function UsersPage() {
  const me = await requireUser("admin");
  const companies = db.prepare("SELECT id, name FROM companies ORDER BY name").all() as { id: number; name: string }[];
  const users = db
    .prepare(
      `SELECT u.id, u.username, u.name, u.role, c.name AS company_name, u.email, u.phone, u.active, u.created_at
         FROM users u LEFT JOIN companies c ON c.id = u.company_id
        ORDER BY CASE u.role WHEN 'admin' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, u.name`,
    )
    .all() as Row[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">계정 관리</h1>
        <p className="text-sm text-slate-500">고객·담당자·관리자 계정을 발급합니다. 고객 계정은 소속 고객사를 지정해야 합니다.</p>
      </div>

      <StateForm action={createUser} resetOnSuccess className="card p-5">
        <h2 className="mb-3 text-sm font-semibold">계정 발급</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label">역할 *</label>
            <select name="role" className="input" defaultValue="customer">
              <option value="customer">고객</option>
              <option value="manager">담당자</option>
              <option value="admin">관리자</option>
            </select>
          </div>
          <div>
            <label className="label">소속 고객사 (고객만)</label>
            <select name="company_id" className="input" defaultValue="">
              <option value="">선택</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">아이디 *</label>
            <input name="username" className="input" required pattern="[A-Za-z0-9_.\-]{3,30}" autoComplete="off" />
          </div>
          <div>
            <label className="label">초기 비밀번호 * (8자 이상)</label>
            <input name="password" type="password" className="input" required minLength={8} autoComplete="new-password" />
          </div>
          <div>
            <label className="label">이름 *</label>
            <input name="name" className="input" required />
          </div>
          <div>
            <label className="label">이메일</label>
            <input name="email" type="email" className="input" />
          </div>
          <div>
            <label className="label">연락처</label>
            <input name="phone" className="input" />
          </div>
          <div className="flex items-end">
            <SubmitButton className="btn-primary w-full">계정 발급</SubmitButton>
          </div>
        </div>
      </StateForm>

      <section className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>이름</th>
              <th>아이디</th>
              <th>역할</th>
              <th>고객사</th>
              <th>연락처</th>
              <th>상태</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.active ? "" : "opacity-50"}>
                <td className="font-medium">{u.name}</td>
                <td className="font-mono text-xs">{u.username}</td>
                <td>{ROLE_LABEL[u.role]}</td>
                <td>{u.company_name ?? "-"}</td>
                <td className="text-xs text-slate-500">
                  {u.email ?? ""}
                  {u.email && u.phone ? <br /> : null}
                  {u.phone ?? ""}
                </td>
                <td>{u.active ? <span className="text-emerald-600">사용</span> : <span className="text-red-500">중지</span>}</td>
                <td>
                  {u.id !== me.id && (
                    <div className="flex flex-wrap items-center gap-2">
                      <form action={toggleUserActive}>
                        <input type="hidden" name="id" value={u.id} />
                        <SubmitButton className="btn-secondary btn-sm">{u.active ? "사용 중지" : "다시 사용"}</SubmitButton>
                      </form>
                      <details className="relative">
                        <summary className="btn-secondary btn-sm cursor-pointer list-none">비밀번호 재설정</summary>
                        <StateForm
                          action={resetPassword}
                          resetOnSuccess
                          className="absolute right-0 z-10 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
                        >
                          <input type="hidden" name="id" value={u.id} />
                          <input
                            name="password"
                            type="password"
                            minLength={8}
                            required
                            placeholder="새 비밀번호 (8자 이상)"
                            className="input mb-2 py-1.5"
                            autoComplete="new-password"
                          />
                          <SubmitButton className="btn-primary btn-sm w-full">재설정</SubmitButton>
                        </StateForm>
                      </details>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
