import Link from "next/link";
import IncidentTable from "@/components/IncidentTable";
import { requireUser } from "@/lib/auth";
import { countByStatus, listIncidents } from "@/lib/incidents";
import { STATUS_LABEL, type IncidentStatus } from "@/lib/types";

const CARDS: { status: IncidentStatus; color: string; hint: Record<string, string> }[] = [
  {
    status: "received",
    color: "text-amber-600",
    hint: { customer: "담당자 확인 대기", manager: "확인이 필요한 건", admin: "담당자 확인 대기" },
  },
  {
    status: "in_progress",
    color: "text-blue-600",
    hint: { customer: "원인 분석·조치 중", manager: "조치내역 등록 필요", admin: "조치 진행 중" },
  },
  {
    status: "resolved",
    color: "text-violet-600",
    hint: { customer: "확인 후 처리완료 필요", manager: "처리완료 확인 대기", admin: "처리완료 확인 대기" },
  },
  {
    status: "closed",
    color: "text-slate-600",
    hint: { customer: "보고서 다운로드 가능", manager: "보고서 다운로드 가능", admin: "보고서 다운로드 가능" },
  },
];

export default async function Dashboard({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  const sp = await searchParams;
  const status = typeof sp.status === "string" && sp.status in STATUS_LABEL ? sp.status : "";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  const counts = countByStatus(user);
  const incidents = listIncidents(user, status ? { status, q } : { closed: false, q });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">대시보드</h1>
          <p className="text-sm text-slate-500">
            {user.role === "customer"
              ? `${user.company_name ?? ""} 장애 접수 현황입니다.`
              : user.role === "manager"
                ? "나에게 배정된 장애 현황입니다."
                : "전체 장애 현황입니다."}
          </p>
        </div>
        {user.role === "customer" && (
          <Link href="/incidents/new" className="btn-primary">
            + 장애 접수
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {CARDS.map((c) => (
          <Link
            key={c.status}
            href={c.status === "closed" ? "/history" : status === c.status ? "/" : `/?status=${c.status}`}
            className={`card p-4 transition hover:border-blue-300 ${status === c.status ? "ring-2 ring-blue-400" : ""}`}
          >
            <p className="text-sm text-slate-500">{STATUS_LABEL[c.status]}</p>
            <p className={`mt-1 text-3xl font-bold ${c.color}`}>{counts[c.status] ?? 0}</p>
            <p className="mt-1 text-xs text-slate-400">{c.hint[user.role]}</p>
          </Link>
        ))}
      </div>

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-700">
            {status ? `${STATUS_LABEL[status as IncidentStatus]} 건` : "진행 중인 장애"} ({incidents.length})
          </h2>
          <form className="flex gap-2">
            {status && <input type="hidden" name="status" value={status} />}
            <input name="q" defaultValue={q} placeholder="제목·접수번호·고객사·시스템 검색" className="input w-64 py-1.5" />
            <button className="btn-secondary btn-sm">검색</button>
          </form>
        </div>
        <IncidentTable incidents={incidents} />
      </section>
    </div>
  );
}
