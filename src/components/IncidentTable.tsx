import Link from "next/link";
import { formatDuration } from "@/lib/report";
import type { Incident } from "@/lib/types";
import { dt, SeverityBadge, StatusBadge } from "./badges";

function Check({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      title={`${label} 처리완료 ${on ? "확인" : "미확인"}`}
      className={`inline-block rounded px-1.5 text-[11px] ${on ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}
    >
      {label}
      {on ? "✓" : "–"}
    </span>
  );
}

export default function IncidentTable({ incidents, history = false }: { incidents: Incident[]; history?: boolean }) {
  if (incidents.length === 0) {
    return <p className="px-5 py-14 text-center text-sm text-slate-400">해당하는 장애 건이 없습니다.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>접수번호</th>
            <th>긴급도</th>
            <th>제목</th>
            <th>고객사</th>
            <th>담당자</th>
            <th>상태</th>
            <th>접수일시</th>
            {history ? (
              <>
                <th>종결일시</th>
                <th>처리시간</th>
                <th>보고서</th>
              </>
            ) : (
              <th>처리완료 확인</th>
            )}
          </tr>
        </thead>
        <tbody>
          {incidents.map((i) => (
            <tr key={i.id} className="hover:bg-slate-50">
              <td className="font-mono text-xs whitespace-nowrap text-slate-500">{i.code}</td>
              <td>
                <SeverityBadge severity={i.severity} />
              </td>
              <td className="max-w-80">
                <Link href={`/incidents/${i.id}`} className="line-clamp-1 font-medium text-slate-800 hover:text-blue-600">
                  {i.title}
                </Link>
                <span className="text-xs text-slate-400">
                  {i.category}
                  {i.target_system ? ` · ${i.target_system}` : ""}
                </span>
              </td>
              <td className="whitespace-nowrap">{i.company_name}</td>
              <td className="whitespace-nowrap">{i.manager_name ?? <span className="text-red-500">미배정</span>}</td>
              <td>
                <StatusBadge status={i.status} />
              </td>
              <td className="text-xs whitespace-nowrap text-slate-500">{dt(i.created_at)}</td>
              {history ? (
                <>
                  <td className="text-xs whitespace-nowrap text-slate-500">{dt(i.closed_at)}</td>
                  <td className="text-xs whitespace-nowrap">{formatDuration(i.created_at, i.closed_at)}</td>
                  <td>
                    <a href={`/api/incidents/${i.id}/report`} className="btn-secondary btn-sm whitespace-nowrap">
                      PDF 다운로드
                    </a>
                  </td>
                </>
              ) : (
                <td className="space-x-1 whitespace-nowrap">
                  {i.status === "resolved" ? (
                    <>
                      <Check on={!!i.customer_confirmed_at} label="고객" />
                      <Check on={!!i.manager_confirmed_at} label="담당" />
                    </>
                  ) : (
                    <span className="text-xs text-slate-300">-</span>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
