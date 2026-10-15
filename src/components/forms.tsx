"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/lib/actions/auth";

/**
 * 제출 버튼. confirm을 주면 누를 때 확인 창(확인/취소)을 먼저 띄우고,
 * '확인'을 눌러야 제출된다. '취소'를 누르면 아무 일도 일어나지 않는다.
 */
export function SubmitButton({
  children,
  pendingText = "처리 중…",
  className = "btn-primary",
  confirm,
  confirmTitle = "확인해 주세요",
  confirmLabel = "확인",
}: {
  children: ReactNode;
  pendingText?: string;
  className?: string;
  confirm?: string;
  confirmTitle?: string;
  confirmLabel?: string;
}) {
  const { pending } = useFormStatus();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const approved = useRef(false);

  return (
    <>
      <button
        ref={buttonRef}
        type="submit"
        disabled={pending}
        className={className}
        onClick={(e) => {
          if (!confirm) return;
          if (approved.current) {
            approved.current = false; // 확인 후 다시 눌린 것 → 그대로 제출
            return;
          }
          e.preventDefault();
          // 필수 입력이 비어 있으면 확인 창 대신 입력 안내를 먼저 보여준다
          if (buttonRef.current?.form && !buttonRef.current.form.reportValidity()) return;
          dialogRef.current?.showModal();
        }}
      >
        {pending ? pendingText : children}
      </button>
      {confirm && (
        <dialog
          ref={dialogRef}
          className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-xl p-0 shadow-2xl backdrop:bg-slate-900/40"
          onClick={(e) => {
            if (e.target === dialogRef.current) dialogRef.current.close(); // 바깥 클릭 = 취소
          }}
        >
          <div className="p-6">
            <h3 className="text-base font-semibold text-slate-900">{confirmTitle}</h3>
            <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-slate-600">{confirm}</p>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-3">
            <button type="button" className="btn-secondary" onClick={() => dialogRef.current?.close()} autoFocus>
              취소
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                dialogRef.current?.close();
                approved.current = true;
                buttonRef.current?.click();
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}

/** 서버 액션의 오류/성공 메시지를 폼 아래에 보여주는 폼 */
export function StateForm({
  action,
  children,
  className,
  resetOnSuccess = false,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state?.error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}
      {state?.ok && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.ok}</p>}
    </form>
  );
}
