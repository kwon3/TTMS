// 서버(Vercel)는 UTC로 동작하므로 화면·보고서의 시간은 항상 한국 시간으로 변환해 표시한다.

const KST = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** ISO 시각 → "2026-10-15 13:46" (seconds=true면 초까지) */
export function kst(iso: string | null | undefined, seconds = false): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const s = KST.format(d); // "2026-10-15 13:46:05"
  return seconds ? s : s.slice(0, 16);
}

/** datetime-local 입력값("2026-10-15T09:30")을 한국 시간 기준 ISO로 */
export function fromKstInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(`${value.length === 16 ? `${value}:00` : value}+09:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function formatDuration(from: string | null, to: string | null): string {
  if (!from || !to) return "-";
  let min = Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000));
  const days = Math.floor(min / 1440);
  min -= days * 1440;
  const hours = Math.floor(min / 60);
  min -= hours * 60;
  const parts = [];
  if (days) parts.push(`${days}일`);
  if (hours) parts.push(`${hours}시간`);
  parts.push(`${min}분`);
  return parts.join(" ");
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
