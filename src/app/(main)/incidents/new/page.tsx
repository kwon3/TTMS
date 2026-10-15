import { StateForm, SubmitButton } from "@/components/forms";
import { createIncident } from "@/lib/actions/incidents";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CATEGORIES, SEVERITIES } from "@/lib/types";

export default async function NewIncidentPage() {
  const user = await requireUser("customer");
  const company = user.company_id
    ? (db
        .prepare("SELECT c.name, m.name AS manager_name FROM companies c LEFT JOIN users m ON m.id = c.manager_id WHERE c.id = ?")
        .get(user.company_id) as { name: string; manager_name: string | null })
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">장애 접수</h1>
        <p className="text-sm text-slate-500">
          접수하면 {company?.manager_name ? `담당자(${company.manager_name})` : "담당자"}에게 바로 알림이 전송됩니다.
        </p>
      </div>

      <StateForm action={createIncident} className="card space-y-5 p-6">
        <div>
          <label className="label" htmlFor="title">
            제목 *
          </label>
          <input id="title" name="title" className="input" maxLength={200} required placeholder="예) 홈페이지 접속 불가" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className="label">긴급도 *</span>
            <div className="grid grid-cols-4 gap-2">
              {SEVERITIES.map((s) => (
                <label
                  key={s}
                  className="cursor-pointer rounded-lg border border-slate-300 py-2 text-center text-sm has-checked:border-blue-500 has-checked:bg-blue-50 has-checked:font-semibold has-checked:text-blue-700"
                >
                  <input type="radio" name="severity" value={s} className="sr-only" defaultChecked={s === "보통"} required />
                  {s}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="label" htmlFor="category">
              장애 유형 *
            </label>
            <select id="category" name="category" className="input" required defaultValue="">
              <option value="" disabled>
                선택하세요
              </option>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="target_system">
              대상 시스템·장비
            </label>
            <input id="target_system" name="target_system" className="input" placeholder="예) 웹서버 WEB-01, ERP" />
          </div>
          <div>
            <label className="label" htmlFor="occurred_at">
              장애 발생일시
            </label>
            <input id="occurred_at" name="occurred_at" type="datetime-local" className="input" />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="description">
            장애 내용 *
          </label>
          <textarea
            id="description"
            name="description"
            className="input min-h-40"
            required
            placeholder={"현상, 발생 상황, 오류 메시지, 영향 범위 등을 자세히 적어주세요."}
          />
        </div>

        <div>
          <label className="label" htmlFor="files">
            첨부파일 (스크린샷·로그 등, 파일당 10MB · 최대 5개)
          </label>
          <input
            id="files"
            name="files"
            type="file"
            multiple
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm hover:file:bg-slate-200"
          />
        </div>

        <div className="flex justify-end border-t border-slate-100 pt-4">
          <SubmitButton pendingText="접수 중…">장애 접수하기</SubmitButton>
        </div>
      </StateForm>
    </div>
  );
}
