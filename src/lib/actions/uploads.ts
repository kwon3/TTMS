"use server";

import crypto from "node:crypto";
import { requireUser } from "../auth";
import { admin } from "../supabase/server";
import { BUCKET, MAX_FILE_SIZE, MAX_FILES, uploadPrefix } from "../uploads";

export type UploadTicket = { path: string; token: string };

/** 브라우저가 Storage에 직접 올릴 수 있도록 파일별 일회용 업로드 주소를 발급한다 */
export async function prepareUploads(
  files: { name: string; size: number }[],
): Promise<{ tickets?: UploadTicket[]; error?: string }> {
  const user = await requireUser();
  if (files.length > MAX_FILES) return { error: `첨부파일은 최대 ${MAX_FILES}개까지 올릴 수 있습니다.` };
  const big = files.find((f) => f.size > MAX_FILE_SIZE);
  if (big) return { error: `'${big.name}' 파일이 10MB를 초과합니다.` };

  const tickets: UploadTicket[] = [];
  for (const f of files) {
    const dot = f.name.lastIndexOf(".");
    const ext = dot > 0 ? f.name.slice(dot).replace(/[^A-Za-z0-9.]/g, "").slice(0, 10) : "";
    const path = `${uploadPrefix(user.id)}${crypto.randomUUID()}${ext}`;
    const { data, error } = await admin().storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) return { error: `업로드 준비에 실패했습니다: ${error?.message}` };
    tickets.push({ path: data.path, token: data.token });
  }
  return { tickets };
}
