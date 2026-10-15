import { getCurrentUser } from "@/lib/auth";
import { getIncidentFor } from "@/lib/incidents";
import { admin } from "@/lib/supabase/server";
import { BUCKET } from "@/lib/uploads";

/** 권한을 확인한 뒤 Storage의 1분짜리 임시 주소로 보내준다 */
export async function GET(_req: Request, ctx: RouteContext<"/api/files/[id]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const { data: file } = await admin()
    .from("attachments")
    .select("incident_id, original_name, storage_path, mime_type")
    .eq("id", Number(id))
    .maybeSingle<{ incident_id: number; original_name: string; storage_path: string; mime_type: string | null }>();
  if (!file || !(await getIncidentFor(user, file.incident_id))) return new Response("not found", { status: 404 });

  const isImage = file.mime_type?.startsWith("image/") && file.mime_type !== "image/svg+xml";
  const { data, error } = await admin()
    .storage.from(BUCKET)
    .createSignedUrl(file.storage_path, 60, isImage ? undefined : { download: file.original_name });
  if (error || !data) return new Response("파일을 찾을 수 없습니다.", { status: 404 });
  return Response.redirect(data.signedUrl, 302);
}
