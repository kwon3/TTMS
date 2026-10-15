import { redirect } from "next/navigation";
import { connection } from "next/server";
import { StateForm, SubmitButton } from "@/components/forms";
import { setupAdmin } from "@/lib/actions/auth";
import { needsSetup } from "@/lib/auth";

/** 관리자 계정이 하나도 없을 때만 열리는 최초 설정 화면 */
export default async function SetupPage() {
  await connection(); // 요청마다 관리자 존재 여부를 확인 (빌드 시 미리 만들지 않음)
  if (!(await needsSetup())) redirect("/login");

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-slate-100 to-blue-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold text-slate-900">최초 설정</h1>
          <p className="mt-1 text-sm text-slate-500">
            시스템 관리자 계정을 만듭니다. 이 화면은 관리자가 없을 때 한 번만 나타납니다.
          </p>
        </div>
        <StateForm action={setupAdmin} className="card space-y-4 p-6">
          <div>
            <label className="label">이름</label>
            <input name="name" className="input" required defaultValue="시스템 관리자" />
          </div>
          <div>
            <label className="label">이메일 (로그인 아이디)</label>
            <input name="email" type="email" className="input" required autoComplete="username" />
          </div>
          <div>
            <label className="label">비밀번호 (8자 이상)</label>
            <input name="password" type="password" className="input" required minLength={8} autoComplete="new-password" />
          </div>
          <SubmitButton className="btn-primary w-full" pendingText="만드는 중…">
            관리자 계정 만들기
          </SubmitButton>
        </StateForm>
      </div>
    </div>
  );
}
