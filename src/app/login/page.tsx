import { redirect } from "next/navigation";
import { StateForm, SubmitButton } from "@/components/forms";
import { login } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/auth";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-slate-100 to-blue-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-xl bg-blue-600 text-xl font-bold text-white">
            !
          </div>
          <h1 className="text-xl font-bold text-slate-900">장애 접수·조치 관리</h1>
          <p className="mt-1 text-sm text-slate-500">발급받은 계정으로 로그인하세요.</p>
        </div>
        <StateForm action={login} className="card space-y-4 p-6">
          <div>
            <label className="label" htmlFor="username">
              아이디
            </label>
            <input id="username" name="username" className="input" autoComplete="username" required autoFocus />
          </div>
          <div>
            <label className="label" htmlFor="password">
              비밀번호
            </label>
            <input
              id="password"
              name="password"
              type="password"
              className="input"
              autoComplete="current-password"
              required
            />
          </div>
          <SubmitButton className="btn-primary w-full" pendingText="로그인 중…">
            로그인
          </SubmitButton>
        </StateForm>
        <p className="mt-4 text-center text-xs text-slate-400">계정 발급·비밀번호 분실은 관리자에게 문의하세요.</p>
      </div>
    </div>
  );
}
