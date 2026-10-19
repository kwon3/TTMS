import Link from "next/link";
import { notFound } from "next/navigation";
import { dt, SeverityBadge, StatusBadge } from "@/components/badges";
import AttachmentInput from "@/components/AttachmentInput";
import { StateForm, SubmitButton } from "@/components/forms";
import {
  acknowledgeIncident,
  addComment,
  adminCloseIncident,
  confirmComplete,
  reassignManager,
  saveAction,
} from "@/lib/actions/incidents";
import { requireUser } from "@/lib/auth";
import {
  EVENT_LABEL,
  getAttachments,
  getComments,
  getEvents,
  companyManagers,
  getIncidentFor,
  isDesignatedFor,
  listActiveManagers,
} from "@/lib/incidents";
import { formatSize } from "@/lib/time";
import { ROLE_LABEL, type Attachment, type Incident, type User } from "@/lib/types";

const STEPS = [
  { key: "created_at", label: "장애 접수" },
  { key: "acknowledged_at", label: "담당자 확인" },
  { key: "action_at", label: "원인분석·조치" },
  { key: "closed_at", label: "처리완료" },
] as const;

function Stepper({ incident }: { incident: Incident }) {
  return (
    <ol className="grid grid-cols-4">
      {STEPS.map((s, idx) => {
        const at = incident[s.key];
        return (
          <li key={s.key} className="relative flex flex-col items-center text-center">
            {idx > 0 && (
              <span className={`absolute top-3.5 right-1/2 -z-0 h-0.5 w-full ${at ? "bg-blue-500" : "bg-slate-200"}`} />
            )}
            <span
              className={`relative z-10 grid size-7 place-items-center rounded-full text-xs font-bold ${
                at ? "bg-blue-600 text-white" : "border-2 border-slate-200 bg-white text-slate-400"
              }`}
            >
              {at ? "✓" : idx + 1}
            </span>
            <span className={`mt-1.5 text-xs font-medium ${at ? "text-slate-800" : "text-slate-400"}`}>{s.label}</span>
            <span className="text-[11px] text-slate-400">{at ? dt(at) : ""}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** 지금 이 사용자가 해야 할 일 안내 (designated: 이 고객사의 지정 담당자 여부) */
function nextStep(user: User, i: Incident, designated: boolean): { text: string; tone: "info" | "todo" | "done" } {
  const isMgr = user.role === "manager";
  const isCus = user.role === "customer";
  const notMine = isMgr && !designated;
  switch (i.status) {
    case "received":
      if (notMine)
        return { text: "이 고객사의 지정 담당자가 아닙니다. 댓글과 원인·조치내역은 작성할 수 있지만 접수 확인·처리완료는 지정 담당자만 할 수 있습니다.", tone: "info" };
      return isMgr || user.role === "admin"
        ? {
            text:
              isMgr && !i.manager_id
                ? "새로 접수된 장애입니다. '접수 확인'을 누르면 이 건의 담당자가 되고 고객사에 알림이 갑니다."
                : "새로 접수된 장애입니다. '접수 확인'을 누르면 고객사에 처리 시작 알림이 갑니다.",
            tone: "todo",
          }
        : { text: "담당자의 접수 확인을 기다리고 있습니다.", tone: "info" };
    case "in_progress":
      return isMgr
        ? { text: "원인 분석이 끝나면 아래에 원인과 조치 내역을 등록하세요. 등록하면 고객사에 알림이 갑니다.", tone: "todo" }
        : { text: "담당자가 원인을 분석하고 조치 중입니다.", tone: "info" };
    case "resolved": {
      if (isCus && !i.customer_confirmed_at)
        return {
          text: "담당자가 조치 내역을 등록했습니다. 내용을 확인하고 문제가 해결되었으면 '처리완료'를 눌러주세요. 추가 문의는 댓글로 남겨주세요.",
          tone: "todo",
        };
      if (isMgr && designated && !i.manager_confirmed_at)
        return { text: "고객 확인을 받고 '처리완료'를 눌러주세요. 고객과 담당자가 모두 누르면 보고서가 자동 생성됩니다.", tone: "todo" };
      if (notMine)
        return { text: "처리완료는 이 고객사의 지정 담당자만 누를 수 있습니다. 댓글과 조치내역 수정은 가능합니다.", tone: "info" };
      if (user.role === "admin" && !i.manager_confirmed_at)
        return {
          text: "관리자는 '담당자 대신 처리완료'로 담당자 확인을 대신하거나, '관리자 강제 종결'로 바로 종결할 수 있습니다.",
          tone: "info",
        };
      return { text: "상대방의 처리완료 확인을 기다리고 있습니다.", tone: "info" };
    }
    case "closed":
      return {
        text:
          i.close_type === "admin"
            ? `관리자(${i.closed_by_name})가 강제 종결해 장애 이력에 저장되었습니다. 보고서를 다운로드할 수 있습니다.`
            : "처리완료되어 장애 이력에 저장되었습니다. 보고서를 다운로드할 수 있습니다.",
        tone: "done",
      };
  }
}

const isImage = (f: Attachment) => Boolean(f.mime_type?.startsWith("image/") && f.mime_type !== "image/svg+xml");

function Files({ files }: { files: Attachment[] }) {
  if (files.length === 0) return null;
  const images = files.filter(isImage);
  return (
    <>
      {images.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {images.map((f) => (
            <a key={f.id} href={`/api/files/${f.id}`} target="_blank" title={f.original_name}>
              {/* 스크린샷 미리보기 (클릭하면 원본) */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/files/${f.id}`}
                alt={f.original_name}
                loading="lazy"
                className="h-28 w-auto max-w-56 rounded-lg border border-slate-200 object-cover hover:border-blue-400"
              />
            </a>
          ))}
        </div>
      )}
      <FileLinks files={files} />
    </>
  );
}

function FileLinks({ files }: { files: Attachment[] }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {files.map((f) => (
        <li key={f.id}>
          <a
            href={`/api/files/${f.id}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 hover:border-blue-300 hover:text-blue-700"
          >
            📎 {f.original_name} <span className="text-slate-400">({formatSize(f.size)})</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right text-slate-800">{children}</dd>
    </div>
  );
}

export default async function IncidentPage({ params }: PageProps<"/incidents/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const incident = await getIncidentFor(user, Number(id));
  if (!incident) notFound();

  const [comments, attachments, events, managers, designatedManagers, designated] = await Promise.all([
    getComments(incident.id),
    getAttachments(incident.id),
    getEvents(incident.id),
    user.role === "admin" ? listActiveManagers() : Promise.resolve([]),
    companyManagers(incident.company_id),
    isDesignatedFor(user, incident),
  ]);
  const closed = incident.status === "closed";
  // 원인·조치내역은 담당자 누구나(지정 여부 무관)와 관리자가 작성할 수 있다
  const isHandler = user.role === "admin" || user.role === "manager";
  const step = nextStep(user, incident, designated);
  const designatedNames = designatedManagers.map((m) => m.name).join(", ") || "지정 담당자";

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/" className="text-xs text-slate-500 hover:text-blue-600">
            ← 목록으로
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-slate-500">{incident.code}</span>
            <SeverityBadge severity={incident.severity} />
            <StatusBadge status={incident.status} />
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{incident.title}</h1>
        </div>
        {closed && (
          <a href={`/api/incidents/${incident.id}/report`} className="btn-primary">
            ⬇ 보고서 다운로드 (PDF)
          </a>
        )}
      </div>

      <div className="card px-6 py-5">
        <Stepper incident={incident} />
      </div>

      <div
        className={`rounded-xl border px-5 py-3 text-sm ${
          step.tone === "todo"
            ? "border-amber-200 bg-amber-50 text-amber-800"
            : step.tone === "done"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-blue-100 bg-blue-50 text-blue-800"
        }`}
      >
        <strong className="mr-2">{step.tone === "todo" ? "해야 할 일" : "진행 상황"}</strong>
        {step.text}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* 왼쪽: 내용·조치·댓글 */}
        <div className="space-y-5 lg:col-span-2">
          <section className="card">
            <h2 className="card-title">장애 내용</h2>
            <div className="px-5 py-4">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{incident.description}</p>
              <Files files={attachments.filter((a) => !a.comment_id && a.uploaded_by === incident.customer_id)} />
            </div>
          </section>

          <section className="card">
            <h2 className="card-title flex items-center justify-between">
              원인 분석 · 조치 내역
              {incident.action_at && (
                <span className="text-xs font-normal text-slate-400">
                  {incident.action_by_name ? `${incident.action_by_name} 작성 · ` : ""}등록 {dt(incident.action_at)}
                </span>
              )}
            </h2>
            <div className="space-y-4 px-5 py-4">
              {isHandler && !closed ? (
                <>
                  {incident.status === "received" && designated && (
                    <form action={acknowledgeIncident} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3">
                      <input type="hidden" name="id" value={incident.id} />
                      <p className="text-sm text-slate-600">
                        {user.role === "manager" && !incident.manager_id
                          ? "접수를 확인하면 이 건의 담당자가 되고 고객사에 처리 시작 알림이 갑니다."
                          : "접수를 확인하면 고객사에 처리 시작 알림이 갑니다."}
                      </p>
                      <SubmitButton
                        className="btn-secondary shrink-0"
                        confirmTitle="접수 확인"
                        confirm={`접수 확인을 누르면 고객사(${incident.company_name})에 처리 시작 알림이 갑니다.${user.role === "manager" && !incident.manager_id ? "\n이 건의 담당자로 배정됩니다." : ""}`}
                      >
                        접수 확인
                      </SubmitButton>
                    </form>
                  )}
                  <StateForm action={saveAction} className="space-y-3">
                    <input type="hidden" name="id" value={incident.id} />
                    <div>
                      <label className="label" htmlFor="cause">
                        장애 원인 *
                      </label>
                      <textarea
                        id="cause"
                        name="cause"
                        className="input min-h-24"
                        required
                        defaultValue={incident.cause ?? ""}
                        placeholder="분석된 장애 원인을 입력하세요."
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor="action">
                        조치 내역 *
                      </label>
                      <textarea
                        id="action"
                        name="action"
                        className="input min-h-28"
                        required
                        defaultValue={incident.action_taken ?? ""}
                        placeholder="수행한 조치와 재발 방지 대책을 입력하세요."
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <AttachmentInput className="max-w-sm" />
                      <SubmitButton
                        confirmTitle={incident.action_at ? "조치내역 수정" : "조치내역 등록"}
                        confirm={`${incident.action_at ? "조치내역을 수정" : "조치내역을 등록"}하면 고객사(${incident.company_name})에 알림이 갑니다.${
                          incident.customer_confirmed_at || incident.manager_confirmed_at
                            ? "\n이미 누른 처리완료 확인은 초기화되어 다시 확인을 받아야 합니다."
                            : ""
                        }`}
                      >
                        {incident.action_at ? "조치내역 수정 · 고객 알림" : "조치내역 등록 · 고객 알림"}
                      </SubmitButton>
                    </div>
                  </StateForm>
                </>
              ) : incident.action_at ? (
                <>
                  <div>
                    <h3 className="mb-1 text-xs font-semibold text-slate-500">장애 원인</h3>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{incident.cause}</p>
                  </div>
                  <div>
                    <h3 className="mb-1 text-xs font-semibold text-slate-500">조치 내역</h3>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{incident.action_taken}</p>
                  </div>
                </>
              ) : (
                <p className="py-4 text-center text-sm text-slate-400">아직 등록된 조치 내역이 없습니다.</p>
              )}
              <Files files={attachments.filter((a) => !a.comment_id && a.uploaded_by !== incident.customer_id)} />
            </div>
          </section>

          <section className="card">
            <h2 className="card-title">대화 ({comments.length})</h2>
            <ul className="divide-y divide-slate-100">
              {comments.length === 0 && (
                <li className="px-5 py-8 text-center text-sm text-slate-400">
                  고객과 담당자가 주고받는 문의·답변이 여기에 기록되며, 처리완료 시 보고서에 포함됩니다.
                </li>
              )}
              {comments.map((c) => (
                <li key={c.id} className={`px-5 py-4 ${c.user_id === user.id ? "bg-blue-50/40" : ""}`}>
                  <div className="flex items-center gap-2 text-sm">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                        c.user_role === "customer"
                          ? "bg-emerald-100 text-emerald-700"
                          : c.user_role === "manager"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {ROLE_LABEL[c.user_role]}
                    </span>
                    <span className="font-medium">{c.user_name}</span>
                    <span className="text-xs text-slate-400">{dt(c.created_at)}</span>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap">{c.body}</p>
                  <Files files={attachments.filter((a) => a.comment_id === c.id)} />
                </li>
              ))}
            </ul>
            {!closed && (
              <StateForm action={addComment} resetOnSuccess className="border-t border-slate-100 px-5 py-4">
                <input type="hidden" name="id" value={incident.id} />
                <textarea
                  name="body"
                  className="input min-h-20"
                  required
                  placeholder={user.role === "customer" ? "담당자에게 문의·추가 정보를 남기세요." : "고객에게 안내·질문을 남기세요."}
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                  <AttachmentInput className="max-w-sm" />
                  <SubmitButton
                    className="btn-secondary"
                    confirmTitle="댓글 등록"
                    confirm={
                      user.role === "customer"
                        ? `댓글을 등록하면 담당자(${incident.manager_name ?? designatedNames})에게 알림이 갑니다.`
                        : `댓글을 등록하면 고객사(${incident.company_name})에 알림이 갑니다.`
                    }
                  >
                    댓글 등록
                  </SubmitButton>
                </div>
              </StateForm>
            )}
          </section>
        </div>

        {/* 오른쪽: 정보·처리완료·경과 */}
        <aside className="space-y-5">
          <section className="card">
            <h2 className="card-title">처리완료 확인</h2>
            <div className="space-y-3 px-5 py-4">
              {[
                {
                  label: "고객",
                  name: incident.customer_name,
                  at: incident.customer_confirmed_at,
                  by: incident.customer_confirmed_by_name,
                  proxy: false,
                },
                {
                  label: "담당자",
                  name: incident.manager_name ?? designatedNames,
                  at: incident.manager_confirmed_at,
                  by: incident.manager_confirmed_by_name,
                  proxy: incident.manager_confirmed_by_role === "admin",
                },
              ].map((p) => (
                <div key={p.label} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                  <div>
                    <p className="text-xs text-slate-500">{p.label}</p>
                    <p className="text-sm font-medium">{p.name}</p>
                  </div>
                  {p.at ? (
                    <span className="text-right text-xs text-emerald-700">
                      ✓ {p.by ?? "확인"}
                      {p.proxy && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-700">관리자 대리</span>}
                      <br />
                      <span className="text-slate-400">{dt(p.at)}</span>
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">미확인</span>
                  )}
                </div>
              ))}

              {closed && (
                <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  {incident.close_type === "admin" ? (
                    <>
                      <span className="mr-1 rounded bg-red-100 px-1 text-[10px] font-medium text-red-700">관리자 강제 종결</span>
                      {incident.closed_by_name} · {dt(incident.closed_at)}
                    </>
                  ) : (
                    <>
                      고객·담당자 처리완료 확인으로 종결 · {dt(incident.closed_at)}
                    </>
                  )}
                </div>
              )}

              {incident.status === "resolved" &&
                ((user.role === "customer" && !incident.customer_confirmed_at) ||
                  (user.role === "manager" && designated && !incident.manager_confirmed_at)) && (
                  <form action={confirmComplete}>
                    <input type="hidden" name="id" value={incident.id} />
                    <SubmitButton
                      className="btn-success w-full py-2.5"
                      confirmTitle="처리완료"
                      confirm={
                        user.role === "customer"
                          ? incident.manager_confirmed_at
                            ? `담당자는 이미 처리완료를 확인했습니다.
처리완료를 누르면 바로 종결되고 보고서가 생성되며, 담당자(${incident.manager_name ?? designatedNames})에게 알림이 갑니다.`
                            : `처리완료를 누르면 담당자(${incident.manager_name ?? designatedNames})에게 알림이 갑니다.
담당자도 처리완료를 누르면 종결되고 보고서가 생성됩니다.`
                          : incident.customer_confirmed_at
                            ? `고객은 이미 처리완료를 확인했습니다.
처리완료를 누르면 바로 종결되고 보고서가 생성되며, 고객사(${incident.company_name})에 알림이 갑니다.`
                            : `처리완료를 누르면 고객사(${incident.company_name})에 알림이 갑니다.
고객도 처리완료를 누르면 종결되고 보고서가 생성됩니다.`
                      }
                    >
                      ✓ 처리완료
                    </SubmitButton>
                  </form>
                )}

              {user.role === "admin" && incident.status === "resolved" && !incident.manager_confirmed_at && (
                <form action={confirmComplete}>
                  <input type="hidden" name="id" value={incident.id} />
                  <SubmitButton
                    className="btn-success w-full py-2.5"
                    confirmTitle="담당자 대신 처리완료"
                    confirm={
                      incident.customer_confirmed_at
                        ? `담당자 대신 처리완료를 확인합니다. 고객은 이미 확인했으므로 바로 종결되고 보고서가 생성됩니다.
고객사(${incident.company_name})와 담당자에게 알림이 갑니다.`
                        : `담당자 대신 처리완료를 확인합니다. 고객사(${incident.company_name})와 담당자에게 알림이 갑니다.
고객도 처리완료를 누르면 종결됩니다.`
                    }
                  >
                    ✓ 담당자 대신 처리완료
                  </SubmitButton>
                </form>
              )}

              {user.role === "admin" && !closed && (
                <details className="rounded-lg border border-red-200">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-red-700">관리자 강제 종결</summary>
                  <form action={adminCloseIncident} className="space-y-2 border-t border-red-100 p-3">
                    <input type="hidden" name="id" value={incident.id} />
                    <p className="text-xs text-slate-500">
                      고객·담당자 확인 없이 즉시 처리완료하고 보고서를 생성합니다. (중복·오접수 정리 등)
                    </p>
                    <input name="reason" className="input py-1.5" placeholder="종결 사유 (선택, 보고서에 기록)" />
                    <SubmitButton
                      className="btn w-full bg-red-600 py-2 text-white hover:bg-red-700"
                      confirmTitle="관리자 강제 종결"
                      confirmLabel="종결"
                      confirm={`고객·담당자 확인 없이 지금 종결하고 보고서를 생성합니다. 되돌릴 수 없습니다.
고객사(${incident.company_name})와 담당자에게 알림이 갑니다.`}
                    >
                      지금 종결하기
                    </SubmitButton>
                  </form>
                </details>
              )}

              {incident.status !== "resolved" && !closed && user.role !== "admin" && (
                <p className="text-xs text-slate-400">담당자가 조치 내역을 등록하면 처리완료를 누를 수 있습니다.</p>
              )}
              {closed && (
                <a href={`/api/incidents/${incident.id}/report`} className="btn-primary w-full">
                  ⬇ 보고서 다운로드 (PDF)
                </a>
              )}
            </div>
          </section>

          <section className="card">
            <h2 className="card-title">접수 정보</h2>
            <dl className="divide-y divide-slate-50 px-5 py-2">
              <Info label="고객사">{incident.company_name}</Info>
              <Info label="접수자">{incident.customer_name}</Info>
              <Info label="담당자">
                {incident.manager_name ?? <span className="text-amber-600">접수 확인 전</span>}
              </Info>
              <Info label="지정 담당자">
                {designatedManagers.length ? designatedNames : <span className="text-red-500">미지정</span>}
              </Info>
              <Info label="장애 유형">{incident.category}</Info>
              <Info label="대상 시스템">{incident.target_system ?? "-"}</Info>
              <Info label="발생일시">{dt(incident.occurred_at)}</Info>
              <Info label="접수일시">{dt(incident.created_at)}</Info>
            </dl>
            {user.role === "admin" && !closed && (
              <form action={reassignManager} className="flex gap-2 border-t border-slate-100 px-5 py-3">
                <input type="hidden" name="id" value={incident.id} />
                <select name="manager_id" className="input py-1.5" defaultValue={incident.manager_id ?? ""}>
                  <option value="" disabled>
                    담당자 선택
                  </option>
                  {managers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <SubmitButton
                  className="btn-secondary btn-sm shrink-0"
                  confirmTitle="담당자 배정"
                  confirm="배정하면 새 담당자와 고객사에 알림이 갑니다."
                >
                  배정
                </SubmitButton>
              </form>
            )}
          </section>

          <section className="card">
            <h2 className="card-title">처리 경과</h2>
            <ol className="space-y-3 px-5 py-4">
              {events.map((e) => (
                <li key={e.id} className="relative border-l-2 border-slate-200 pl-4">
                  <span className="absolute top-1.5 -left-[5px] size-2 rounded-full bg-blue-500" />
                  <p className="text-sm font-medium">{EVENT_LABEL[e.type] ?? e.type}</p>
                  <p className="text-xs text-slate-500">
                    {dt(e.created_at)} · {e.user_name ?? "시스템"}
                  </p>
                  {e.detail && <p className="text-xs text-slate-400">{e.detail}</p>}
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
