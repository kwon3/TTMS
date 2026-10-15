import "server-only";
import { admin, must } from "./supabase/server";

export const BUCKET = "attachments";
export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_FILES = 5;

export type UploadedFile = { path: string; name: string; size: number; type: string };

/** 사용자별 업로드 경로. 다른 사람이 올린 파일을 자기 것으로 등록하지 못하게 경로로 검증한다. */
export const uploadPrefix = (userId: string) => `uploads/${userId}/`;

/**
 * 폼의 hidden 입력(uploads)에 담긴, 브라우저가 이미 Storage에 올린 파일 목록을 검증한다.
 * 문제가 있으면 오류 메시지 문자열을 돌려준다.
 */
export function parseUploads(fd: FormData, userId: string): UploadedFile[] | string {
  const raw = String(fd.get("uploads") ?? "");
  if (!raw) return [];
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return "첨부파일 정보가 올바르지 않습니다.";
  }
  if (!Array.isArray(list)) return "첨부파일 정보가 올바르지 않습니다.";
  if (list.length > MAX_FILES) return `첨부파일은 최대 ${MAX_FILES}개까지 올릴 수 있습니다.`;
  const prefix = uploadPrefix(userId);
  const files: UploadedFile[] = [];
  for (const f of list as Partial<UploadedFile>[]) {
    if (typeof f.path !== "string" || !f.path.startsWith(prefix) || f.path.includes(".."))
      return "첨부파일 정보가 올바르지 않습니다.";
    const size = Number(f.size);
    if (!Number.isFinite(size) || size <= 0 || size > MAX_FILE_SIZE) return `'${f.name}' 파일이 10MB를 초과합니다.`;
    files.push({ path: f.path, name: String(f.name ?? "file").slice(0, 200), size, type: String(f.type ?? "") });
  }
  return files;
}

export async function saveAttachments(files: UploadedFile[], incidentId: number, commentId: number | null, userId: string) {
  if (files.length === 0) return;
  must(
    await admin()
      .from("attachments")
      .insert(
        files.map((f) => ({
          incident_id: incidentId,
          comment_id: commentId,
          original_name: f.name,
          storage_path: f.path,
          mime_type: f.type || null,
          size: f.size,
          uploaded_by: userId,
        })),
      ),
  );
}
