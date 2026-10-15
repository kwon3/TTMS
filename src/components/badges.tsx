import { kst } from "@/lib/time";
import { STATUS_LABEL, type IncidentStatus } from "@/lib/types";

const STATUS_STYLE: Record<IncidentStatus, string> = {
  received: "bg-amber-50 text-amber-700 ring-amber-200",
  in_progress: "bg-blue-50 text-blue-700 ring-blue-200",
  resolved: "bg-violet-50 text-violet-700 ring-violet-200",
  closed: "bg-slate-100 text-slate-600 ring-slate-200",
};

const SEVERITY_STYLE: Record<string, string> = {
  긴급: "bg-red-600 text-white ring-red-600",
  높음: "bg-orange-50 text-orange-700 ring-orange-200",
  보통: "bg-sky-50 text-sky-700 ring-sky-200",
  낮음: "bg-slate-50 text-slate-600 ring-slate-200",
};

const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap";

export function StatusBadge({ status }: { status: IncidentStatus }) {
  return <span className={`${base} ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function SeverityBadge({ severity }: { severity: string }) {
  return <span className={`${base} ${SEVERITY_STYLE[severity] ?? SEVERITY_STYLE["낮음"]}`}>{severity}</span>;
}

/** 한국 시간 "2026-10-15 13:20" */
export const dt = (v: string | null | undefined) => kst(v);
