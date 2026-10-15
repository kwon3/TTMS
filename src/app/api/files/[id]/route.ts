import fs from "node:fs/promises";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { db, UPLOAD_DIR } from "@/lib/db";
import { getIncidentFor } from "@/lib/incidents";

export async function GET(_req: Request, ctx: RouteContext<"/api/files/[id]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const file = db
    .prepare("SELECT incident_id, original_name, stored_name, mime_type FROM attachments WHERE id = ?")
    .get(Number(id)) as
    | { incident_id: number; original_name: string; stored_name: string; mime_type: string | null }
    | undefined;
  if (!file || !getIncidentFor(user, file.incident_id)) return new Response("not found", { status: 404 });

  const data = await fs.readFile(path.join(UPLOAD_DIR, path.basename(file.stored_name)));
  const isImage = file.mime_type?.startsWith("image/") && file.mime_type !== "image/svg+xml";
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": isImage ? file.mime_type! : "application/octet-stream",
      "Content-Disposition": `${isImage ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.original_name)}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
