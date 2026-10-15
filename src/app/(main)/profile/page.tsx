import { StateForm, SubmitButton } from "@/components/forms";
import { changePassword, updateProfile } from "@/lib/actions/auth";
import { requireUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/types";

export default async function ProfilePage() {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-xl font-bold text-slate-900">내 정보</h1>

      <StateForm action={updateProfile} className="card space-y-4 p-6">
        <p className="text-sm text-slate-500">
          아이디 <b className="text-slate-800">{user.username}</b> · {ROLE_LABEL[user.role]}
          {user.company_name ? ` · ${user.company_name}` : ""}
        </p>
        <div>
          <label className="label">이름</label>
          <input name="name" defaultValue={user.name} className="input" required />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">이메일</label>
            <input name="email" type="email" defaultValue={user.email ?? ""} className="input" />
          </div>
          <div>
            <label className="label">연락처</label>
            <input name="phone" defaultValue={user.phone ?? ""} className="input" />
          </div>
        </div>
        <div className="flex justify-end">
          <SubmitButton>저장</SubmitButton>
        </div>
      </StateForm>

      <StateForm action={changePassword} resetOnSuccess className="card space-y-4 p-6">
        <h2 className="text-sm font-semibold">비밀번호 변경</h2>
        <div>
          <label className="label">현재 비밀번호</label>
          <input name="current" type="password" className="input" required autoComplete="current-password" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">새 비밀번호 (8자 이상)</label>
            <input name="next" type="password" className="input" required minLength={8} autoComplete="new-password" />
          </div>
          <div>
            <label className="label">새 비밀번호 확인</label>
            <input name="confirm" type="password" className="input" required minLength={8} autoComplete="new-password" />
          </div>
        </div>
        <div className="flex justify-end">
          <SubmitButton>비밀번호 변경</SubmitButton>
        </div>
      </StateForm>
    </div>
  );
}
