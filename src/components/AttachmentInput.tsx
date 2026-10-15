"use client";

import { useEffect, useRef, useState } from "react";
import { prepareUploads } from "@/lib/actions/uploads";
import { supabaseBrowser } from "@/lib/supabase/client";

type Uploaded = { path: string; name: string; size: number; type: string };

/**
 * 파일을 고르면 바로 Supabase Storage에 올리고, 올린 파일 목록을 hidden 입력(uploads)으로 폼에 실어 보낸다.
 * (Vercel 서버는 요청 크기 제한이 있어 파일을 서버를 거치지 않고 직접 올린다)
 */
export default function AttachmentInput({ className = "" }: { className?: string }) {
  const [files, setFiles] = useState<Uploaded[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const guardRef = useRef<HTMLInputElement>(null);

  // 업로드 중에는 폼 제출을 막는다
  useEffect(() => {
    guardRef.current?.setCustomValidity(busy ? "첨부파일을 올리는 중입니다. 잠시 후 다시 눌러주세요." : "");
  }, [busy]);

  // 폼이 초기화되면(댓글 등록 성공 등) 목록도 비운다
  useEffect(() => {
    const form = inputRef.current?.form;
    const clear = () => {
      setFiles([]);
      setError("");
    };
    form?.addEventListener("reset", clear);
    return () => form?.removeEventListener("reset", clear);
  }, []);

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;
    setError("");
    setBusy(true);
    try {
      const res = await prepareUploads(picked.map((f) => ({ name: f.name, size: f.size })));
      if (res.error || !res.tickets) throw new Error(res.error ?? "업로드 준비 실패");
      const storage = supabaseBrowser().storage.from("attachments");
      const done: Uploaded[] = [];
      for (let i = 0; i < picked.length; i++) {
        const f = picked[i];
        const t = res.tickets[i];
        const { error } = await storage.uploadToSignedUrl(t.path, t.token, f, {
          contentType: f.type || "application/octet-stream",
        });
        if (error) throw new Error(`'${f.name}' 업로드 실패: ${error.message}`);
        done.push({ path: t.path, name: f.name, size: f.size, type: f.type });
      }
      setFiles((prev) => [...prev, ...done].slice(0, 5));
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={className}>
      <input type="hidden" name="uploads" value={JSON.stringify(files)} />
      <input ref={guardRef} tabIndex={-1} aria-hidden className="sr-only" value="" onChange={() => {}} />
      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-200">
        📎 파일 첨부
        <input ref={inputRef} type="file" multiple className="hidden" onChange={onChange} disabled={busy || files.length >= 5} />
      </label>
      <span className="ml-2 text-xs text-slate-400">{busy ? "올리는 중…" : "파일당 10MB, 최대 5개"}</span>
      {files.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {files.map((f) => (
            <li key={f.path} className="flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs text-blue-800">
              {f.name}
              <button
                type="button"
                className="text-blue-400 hover:text-red-500"
                onClick={() => setFiles((prev) => prev.filter((x) => x.path !== f.path))}
                aria-label={`${f.name} 제거`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
