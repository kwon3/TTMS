import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { db, UPLOAD_DIR } from "./db";

export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_FILES = 5;

/** 폼에서 넘어온 파일 목록 (빈 입력 제외) */
export function filesFrom(formData: FormData, field = "files"): File[] {
  return formData.getAll(field).filter((f): f is File => f instanceof File && f.size > 0);
}

/** 업로드 제한 검사. 문제 있으면 오류 메시지 반환 */
export function validateFiles(files: File[]): string | null {
  if (files.length > MAX_FILES) return `첨부파일은 최대 ${MAX_FILES}개까지 올릴 수 있습니다.`;
  const big = files.find((f) => f.size > MAX_FILE_SIZE);
  if (big) return `'${big.name}' 파일이 10MB를 초과합니다.`;
  return null;
}

export async function saveFiles(files: File[], incidentId: number, commentId: number | null, userId: number) {
  const insert = db.prepare(
    `INSERT INTO attachments (incident_id, comment_id, original_name, stored_name, mime_type, size, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const file of files) {
    // 저장 파일명은 원본 이름과 무관한 난수로 만들어 경로 조작을 막는다
    const ext = path.extname(file.name).replace(/[^A-Za-z0-9.]/g, "").slice(0, 10);
    const stored = `${crypto.randomUUID()}${ext}`;
    await fs.writeFile(path.join(UPLOAD_DIR, stored), Buffer.from(await file.arrayBuffer()));
    insert.run(incidentId, commentId, file.name, stored, file.type || null, file.size, userId);
  }
}
