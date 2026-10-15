import { getCurrentUser } from "@/lib/auth";
import { getIncidentFor } from "@/lib/incidents";
import { getReport, renderReportPdf } from "@/lib/report";

/** 처리완료 시 저장된 보고서를 PDF로 내려준다 */
export async function GET(_req: Request, ctx: RouteContext<"/api/incidents/[id]/report">) {
  const user = await getCurrentUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const incident = getIncidentFor(user, Number(id));
  const report = incident && getReport(incident.id);
  if (!incident || !report) return new Response("보고서가 없습니다.", { status: 404 });

  try {
    const pdf = await renderReportPdf(report);
    const filename = `장애보고서_${incident.code}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (e) {
    console.error(e);
    return new Response(e instanceof Error ? e.message : "보고서 생성 실패", { status: 500 });
  }
}
