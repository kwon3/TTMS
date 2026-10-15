import { StateForm, SubmitButton } from "@/components/forms";
import { createCompany, setCompanyManager } from "@/lib/actions/admin";
import { requireUser } from "@/lib/auth";
import { listActiveManagers } from "@/lib/incidents";
import { admin, must } from "@/lib/supabase/server";

type Row = {
  id: number;
  name: string;
  manager_id: string | null;
  customers: number;
  open_incidents: number;
  total_incidents: number;
};

type Manager = { id: string; name: string; email: string };

function ManagerSelect({ managers, value }: { managers: Manager[]; value?: string | null }) {
  return (
    <select name="manager_id" defaultValue={value ?? ""} className="input py-1.5">
      <option value="">(미지정)</option>
      {managers.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name} ({m.email})
        </option>
      ))}
    </select>
  );
}

export default async function CompaniesPage() {
  await requireUser("admin");
  const [managers, companyRows, customers, incidents] = await Promise.all([
    listActiveManagers(),
    admin().from("companies").select("id, name, manager_id").order("name"),
    admin().from("profiles").select("company_id").eq("role", "customer"),
    admin().from("incidents").select("company_id, status"),
  ]);
  const custRows = must(customers) as { company_id: number | null }[];
  const incRows = must(incidents) as { company_id: number; status: string }[];
  const companies: Row[] = (must(companyRows) as Omit<Row, "customers" | "open_incidents" | "total_incidents">[]).map(
    (c) => ({
      ...c,
      customers: custRows.filter((u) => u.company_id === c.id).length,
      open_incidents: incRows.filter((i) => i.company_id === c.id && i.status !== "closed").length,
      total_incidents: incRows.filter((i) => i.company_id === c.id).length,
    }),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">고객사 · 담당자 지정</h1>
        <p className="text-sm text-slate-500">
          고객사별 담당자를 지정하면, 해당 고객사의 장애 접수가 그 담당자에게 자동 배정되고 알림이 전송됩니다.
        </p>
      </div>

      <StateForm action={createCompany} resetOnSuccess className="card p-5">
        <h2 className="mb-3 text-sm font-semibold">고객사 등록</h2>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <label className="label">고객사명 *</label>
            <input name="name" className="input" required />
          </div>
          <div>
            <label className="label">담당자</label>
            <ManagerSelect managers={managers} />
          </div>
          <SubmitButton>등록</SubmitButton>
        </div>
      </StateForm>

      <section className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>고객사</th>
              <th>고객 계정</th>
              <th>진행 중 / 전체 장애</th>
              <th className="w-96">담당자</th>
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
                  <form action={setCompanyManager} className="flex gap-2">
                    <input type="hidden" name="company_id" value={c.id} />
                    <ManagerSelect managers={managers} value={c.manager_id} />
                    <SubmitButton className="btn-secondary btn-sm shrink-0">저장</SubmitButton>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="text-xs text-slate-400">
        ※ 담당자 변경은 이후 접수되는 건부터 적용됩니다. 이미 접수된 건은 장애 상세 화면에서 담당자를 다시 배정하세요.
      </p>
    </div>
  );
}
