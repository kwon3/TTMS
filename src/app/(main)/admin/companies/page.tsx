import { StateForm, SubmitButton } from "@/components/forms";
import { createCompany, setCompanyManagers } from "@/lib/actions/admin";
import { requireUser } from "@/lib/auth";
import { listActiveManagers } from "@/lib/incidents";
import { admin, must } from "@/lib/supabase/server";

type Manager = { id: string; name: string; email: string };

type Row = {
  id: number;
  name: string;
  managerIds: string[];
  customers: number;
  open_incidents: number;
  total_incidents: number;
};

/** 담당자 여러 명을 체크박스로 고른다 */
function ManagerChecks({ managers, selected = [] }: { managers: Manager[]; selected?: string[] }) {
  if (managers.length === 0)
    return <p className="text-xs text-slate-400">등록된 담당자가 없습니다. 계정 관리에서 담당자 계정을 먼저 만드세요.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {managers.map((m) => (
        <label
          key={m.id}
          className="cursor-pointer rounded-lg border border-slate-300 px-2.5 py-1 text-xs has-checked:border-blue-500 has-checked:bg-blue-50 has-checked:text-blue-700"
          title={m.email}
        >
          <input type="checkbox" name="manager_ids" value={m.id} defaultChecked={selected.includes(m.id)} className="mr-1" />
          {m.name}
        </label>
      ))}
    </div>
  );
}

export default async function CompaniesPage() {
  await requireUser("admin");
  const [managers, companyRows, links, customers, incidents] = await Promise.all([
    listActiveManagers(),
    admin().from("companies").select("id, name").order("name"),
    admin().from("company_managers").select("company_id, manager_id"),
    admin().from("profiles").select("company_id").eq("role", "customer"),
    admin().from("incidents").select("company_id, status"),
  ]);
  const linkRows = must(links) as { company_id: number; manager_id: string }[];
  const custRows = must(customers) as { company_id: number | null }[];
  const incRows = must(incidents) as { company_id: number; status: string }[];
  const companies: Row[] = (must(companyRows) as { id: number; name: string }[]).map((c) => ({
    ...c,
    managerIds: linkRows.filter((l) => l.company_id === c.id).map((l) => l.manager_id),
    customers: custRows.filter((u) => u.company_id === c.id).length,
    open_incidents: incRows.filter((i) => i.company_id === c.id && i.status !== "closed").length,
    total_incidents: incRows.filter((i) => i.company_id === c.id).length,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">고객사 · 담당자 지정</h1>
        <p className="text-sm text-slate-500">
          고객사마다 담당자를 여러 명 지정할 수 있습니다. 지정 담당자 모두에게 접수 알림이 가고, 접수 확인·처리완료는 지정
          담당자만 할 수 있습니다. 지정되지 않은 담당자도 댓글과 원인·조치내역은 작성할 수 있습니다.
        </p>
      </div>

      <StateForm action={createCompany} resetOnSuccess className="card space-y-3 p-5">
        <h2 className="text-sm font-semibold">고객사 등록</h2>
        <div>
          <label className="label">고객사명 *</label>
          <input name="name" className="input max-w-md" required />
        </div>
        <div>
          <span className="label">지정 담당자 (여러 명 선택 가능)</span>
          <ManagerChecks managers={managers} />
        </div>
        <SubmitButton>등록</SubmitButton>
      </StateForm>

      <section className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>고객사</th>
              <th>고객 계정</th>
              <th>진행 중 / 전체 장애</th>
              <th className="min-w-96">지정 담당자</th>
            </tr>
          </thead>
          <tbody>
            {companies.length === 0 && (
              <tr>
                <td colSpan={4} className="py-10 text-center text-slate-400">
                  등록된 고객사가 없습니다.
                </td>
              </tr>
            )}
            {companies.map((c) => (
              <tr key={c.id}>
                <td className="font-medium">{c.name}</td>
                <td>{c.customers}명</td>
                <td>
                  {c.open_incidents} / {c.total_incidents}
                </td>
                <td>
                  <StateForm action={setCompanyManagers} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="company_id" value={c.id} />
                    <ManagerChecks managers={managers} selected={c.managerIds} />
                    <SubmitButton className="btn-secondary btn-sm shrink-0">저장</SubmitButton>
                  </StateForm>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="text-xs text-slate-400">
        ※ 지정 담당자 변경은 이미 접수된 건의 알림·처리완료 권한에도 바로 적용됩니다. 특정 건의 담당자를 바꾸려면 장애 상세
        화면에서 배정하세요.
      </p>
    </div>
  );
}
