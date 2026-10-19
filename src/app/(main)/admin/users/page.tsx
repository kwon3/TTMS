import { StateForm, SubmitButton } from "@/components/forms";
import { createUser, resetPassword, toggleUserActive, updateUser } from "@/lib/actions/admin";
import { requireUser } from "@/lib/auth";
import { admin, must } from "@/lib/supabase/server";
import { ROLE_LABEL, type Role } from "@/lib/types";

type Row = {
  id: string;
  company_id: number | null;
  name: string;
  role: Role;
  company: { name: string } | null;
  email: string;
  phone: string | null;
  active: boolean;
};

const ROLE_ORDER: Record<Role, number> = { admin: 0, manager: 1, customer: 2 };

export default async function UsersPage() {
  const me = await requireUser("admin");
  const [companyRes, userRes, linkRes] = await Promise.all([
    admin().from("companies").select("id, name").order("name"),
    admin()
      .from("profiles")
      .select("id, name, role, email, phone, active, company_id, company:companies!profiles_company_fk(name)"),
    admin().from("company_managers").select("company_id, manager_id"),
  ]);
  const companies = must(companyRes) as { id: number; name: string }[];
  const links = must(linkRes) as { company_id: number; manager_id: string }[];
  // 담당자는 지정된 고객사 목록을 보여준다
  const designated = (managerId: string) =>
    links
      .filter((l) => l.manager_id === managerId)
      .map((l) => companies.find((c) => c.id === l.company_id)?.name)
      .filter(Boolean)
      .join(", ");
  const users = (must(userRes) as unknown as Row[]).sort(
    (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name, "ko"),
  );

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
            <label className="label">이메일 (로그인 아이디) *</label>
            <input name="email" type="email" className="input" required autoComplete="off" />
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
              <th>이메일 (아이디)</th>
              <th>역할</th>
              <th>고객사 / 지정 고객사</th>
              <th>연락처</th>
              <th>상태</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.active ? "" : "opacity-50"}>
                <td className="font-medium">{u.name}</td>
                <td className="text-xs">{u.email}</td>
                <td>{ROLE_LABEL[u.role]}</td>
                <td className="text-xs">
                  {u.role === "manager" ? designated(u.id) || <span className="text-slate-400">지정 없음</span> : (u.company?.name ?? "-")}
                </td>
                <td className="text-xs text-slate-500">{u.phone ?? "-"}</td>
                <td>{u.active ? <span className="text-emerald-600">사용</span> : <span className="text-red-500">중지</span>}</td>
                <td>
                  <div className="flex flex-wrap items-center gap-2">
                    <details className="relative">
                      <summary className="btn-secondary btn-sm cursor-pointer list-none">정보 수정</summary>
                      <StateForm
                        action={updateUser}
                        className="absolute right-0 z-10 mt-1 w-72 space-y-2 rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
                      >
                        <input type="hidden" name="id" value={u.id} />
                        <label className="label">이름</label>
                        <input name="name" defaultValue={u.name} required className="input py-1.5" />
                        <label className="label">연락처</label>
                        <input name="phone" defaultValue={u.phone ?? ""} className="input py-1.5" />
                        {u.role === "customer" && (
                          <>
                            <label className="label">소속 고객사</label>
                            <select name="company_id" defaultValue={u.company_id ?? ""} className="input py-1.5" required>
                              <option value="">선택</option>
                              {companies.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </>
                        )}
                        {u.role === "manager" && (
                          <p className="text-xs text-slate-400">지정 고객사는 고객사·담당자 화면에서 바꿉니다.</p>
                        )}
                        <SubmitButton className="btn-primary btn-sm w-full">저장</SubmitButton>
                      </StateForm>
                    </details>
                  {u.id !== me.id && (
                    <>
                      <form action={toggleUserActive}>
                        <input type="hidden" name="id" value={u.id} />
                        <SubmitButton
                          className="btn-secondary btn-sm"
                          confirmTitle={u.active ? "사용 중지" : "다시 사용"}
                          confirm={
                            u.active
                              ? `${u.name}(${u.email}) 계정을 사용 중지합니다.
이 계정으로는 로그인할 수 없게 됩니다.`
                              : `${u.name}(${u.email}) 계정을 다시 사용할 수 있게 합니다.`
                          }
                        >
                          {u.active ? "사용 중지" : "다시 사용"}
                        </SubmitButton>
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
                          <SubmitButton
                            className="btn-primary btn-sm w-full"
                            confirmTitle="비밀번호 재설정"
                            confirm={`${u.name} 계정의 비밀번호를 입력한 값으로 바꿉니다.
새 비밀번호는 본인에게 따로 알려주세요.`}
                          >
                            재설정
                          </SubmitButton>
                        </StateForm>
                      </details>
                    </>
                  )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
