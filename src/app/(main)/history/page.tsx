import IncidentTable from "@/components/IncidentTable";
import { requireUser } from "@/lib/auth";
import { listIncidents } from "@/lib/incidents";

export default async function HistoryPage({ searchParams }: PageProps<"/history">) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const incidents = listIncidents(user, { closed: true, q });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">장애 이력·보고서</h1>
        <p className="text-sm text-slate-500">
          고객과 담당자가 모두 처리완료를 확인한 건입니다. 보고서는 종결 시점 기록으로 자동 작성되었습니다.
        </p>
      </div>
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-700">처리완료 건 ({incidents.length})</h2>
          <form className="flex gap-2">
            <input name="q" defaultValue={q} placeholder="제목·접수번호·고객사·시스템 검색" className="input w-64 py-1.5" />
            <button className="btn-secondary btn-sm">검색</button>
          </form>
        </div>
        <IncidentTable incidents={incidents} history />
      </section>
    </div>
  );
}
