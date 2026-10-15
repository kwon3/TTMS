import "server-only";
import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { EVENT_LABEL, getAttachments, getComments, getEvents, getIncident } from "./incidents";
import { admin, must } from "./supabase/server";
import { formatDuration, formatSize, kst } from "./time";
import { ROLE_LABEL } from "./types";

/** 처리완료 시점에 확정·저장되는 보고서 내용 */
export type ReportContent = {
  reportNo: string;
  generatedAt: string;
  incident: {
    code: string;
    title: string;
    company: string;
    customer: string;
    manager: string;
    severity: string;
    category: string;
    targetSystem: string;
    occurredAt: string;
    createdAt: string;
    acknowledgedAt: string;
    actionAt: string;
    customerConfirmedAt: string;
    managerConfirmedAt: string;
    closedAt: string;
    description: string;
    cause: string;
    action: string;
  };
  durations: { toAcknowledge: string; toAction: string; total: string };
  summary: string;
  conversation: {
    customerCount: number;
    managerCount: number;
    otherCount: number;
    entries: { at: string; author: string; role: string; body: string }[];
  };
  timeline: { at: string; label: string; actor: string; detail: string }[];
  attachments: { name: string; size: string; at: string }[];
};

const dash = (v: string | null | undefined) => (v && v.trim() ? v : "-");

/** 장애 건의 모든 기록(접수·조치·댓글·경과)을 템플릿에 맞춰 보고서로 정리 */
export async function buildReport(incidentId: number): Promise<ReportContent> {
  const i = await getIncident(incidentId);
  if (!i) throw new Error("장애 건을 찾을 수 없습니다.");
  const [comments, events, attachments] = await Promise.all([
    getComments(incidentId),
    getEvents(incidentId),
    getAttachments(incidentId),
  ]);

  const customerCount = comments.filter((c) => c.user_role === "customer").length;
  const managerCount = comments.filter((c) => c.user_role === "manager").length;
  const otherCount = comments.length - customerCount - managerCount;
  const durations = {
    toAcknowledge: formatDuration(i.created_at, i.acknowledged_at),
    toAction: formatDuration(i.created_at, i.action_at),
    total: formatDuration(i.created_at, i.closed_at),
  };
  const t = (iso: string | null) => kst(iso); // 보고서의 모든 시각은 한국 시간

  const sentences = [
    `본 장애는 ${t(i.created_at)}에 ${i.company_name}의 ${i.customer_name} 고객이 '${i.title}' 건으로 접수하였습니다` +
      (i.target_system ? ` (대상 시스템: ${i.target_system}, 긴급도: ${i.severity}).` : ` (긴급도: ${i.severity}).`),
  ];
  if (i.acknowledged_at)
    sentences.push(`${dash(i.manager_name)} 담당자가 ${t(i.acknowledged_at)}에 접수를 확인하였습니다(접수 후 ${durations.toAcknowledge}).`);
  if (i.action_at)
    sentences.push(`담당자는 ${t(i.action_at)}에 장애 원인분석 및 조치내역을 등록하였습니다(접수 후 ${durations.toAction}).`);
  sentences.push(
    comments.length > 0
      ? `처리 과정에서 고객과 담당자 간에 총 ${comments.length}건의 의견(고객 ${customerCount}건, 담당자 ${managerCount}건${otherCount ? `, 관리자 ${otherCount}건` : ""})이 오갔습니다.`
      : "처리 과정에서 별도의 의견 교환은 없었습니다.",
  );
  sentences.push(
    `${t(i.closed_at)}에 고객과 담당자 모두 처리완료를 확인하여 종결되었으며, 총 처리 소요시간은 ${durations.total}입니다.`,
  );

  const year = kst(i.closed_at ?? i.created_at).slice(0, 4);
  return {
    reportNo: `RPT-${year}-${String(i.id).padStart(5, "0")}`,
    generatedAt: t(i.closed_at),
    incident: {
      code: i.code,
      title: i.title,
      company: i.company_name,
      customer: i.customer_name,
      manager: dash(i.manager_name),
      severity: i.severity,
      category: i.category,
      targetSystem: dash(i.target_system),
      occurredAt: t(i.occurred_at),
      createdAt: t(i.created_at),
      acknowledgedAt: t(i.acknowledged_at),
      actionAt: t(i.action_at),
      customerConfirmedAt: t(i.customer_confirmed_at),
      managerConfirmedAt: t(i.manager_confirmed_at),
      closedAt: t(i.closed_at),
      description: i.description,
      cause: dash(i.cause),
      action: dash(i.action_taken),
    },
    durations,
    summary: sentences.join(" "),
    conversation: {
      customerCount,
      managerCount,
      otherCount,
      entries: comments.map((c) => ({
        at: t(c.created_at),
        author: c.user_name,
        role: ROLE_LABEL[c.user_role],
        body: c.body,
      })),
    },
    timeline: events.map((e) => ({
      at: t(e.created_at),
      label: EVENT_LABEL[e.type] ?? e.type,
      actor: e.user_name ? `${e.user_name}(${ROLE_LABEL[e.user_role!]})` : "시스템",
      detail: e.detail ?? "",
    })),
    attachments: attachments.map((a) => ({ name: a.original_name, size: formatSize(a.size), at: t(a.created_at) })),
  };
}

export async function getReport(incidentId: number): Promise<ReportContent | null> {
  const row = must(await admin().from("reports").select("content").eq("incident_id", incidentId).maybeSingle()) as {
    content: ReportContent;
  } | null;
  return row?.content ?? null;
}

// ---------------------------------------------------------------- PDF 렌더링

/** 프로젝트에 포함된 나눔고딕(OFL 라이선스)을 쓴다. Vercel(리눅스)에도 그대로 배포된다. */
function fontPaths() {
  const dir = path.join(process.cwd(), "fonts");
  const regular = path.join(dir, "NanumGothic-Regular.ttf");
  const bold = path.join(dir, "NanumGothic-Bold.ttf");
  if (!fs.existsSync(regular)) throw new Error(`보고서용 한글 글꼴을 찾을 수 없습니다: ${regular}`);
  return { regular, bold: fs.existsSync(bold) ? bold : regular };
}

const COLOR = { text: "#1f2937", muted: "#6b7280", line: "#d1d5db", head: "#f3f4f6", accent: "#1d4ed8" };

export function renderReportPdf(r: ReportContent): Promise<Buffer> {
  const fonts = fontPaths();
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 56, bottom: 56, left: 50, right: 50 },
    bufferPages: true,
    font: fonts.regular,
    info: { Title: `장애 처리 보고서 ${r.incident.code}`, Author: "장애 접수·조치 관리 시스템" },
  });
  doc.registerFont("R", fonts.regular);
  doc.registerFont("B", fonts.bold);

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom;
  const ensure = (h: number) => {
    if (doc.y + h > bottom()) doc.addPage();
  };

  // 제목
  doc.font("B").fontSize(20).fillColor(COLOR.text).text("장애 처리 보고서", left, doc.y, { width, align: "center" });
  doc.moveDown(0.3);
  doc
    .font("R")
    .fontSize(9)
    .fillColor(COLOR.muted)
    .text(`보고서 번호 ${r.reportNo}   ·   접수번호 ${r.incident.code}   ·   작성일시 ${r.generatedAt}`, {
      width,
      align: "center",
    });
  doc.moveDown(1);

  let sectionNo = 0;
  const section = (title: string) => {
    ensure(40);
    doc.moveDown(0.6);
    sectionNo += 1;
    const y = doc.y;
    doc.rect(left, y, 3, 14).fill(COLOR.accent);
    doc.font("B").fontSize(12).fillColor(COLOR.text).text(`${sectionNo}. ${title}`, left + 10, y, { width: width - 10 });
    doc.moveDown(0.4);
    doc.x = left;
  };

  const paragraph = (text: string) => {
    doc.font("R").fontSize(10).fillColor(COLOR.text).text(text, left, doc.y, { width, lineGap: 3 });
  };

  /** 열 너비 비율과 행 데이터로 테두리가 있는 표를 그린다 */
  const table = (cols: number[], rows: string[][], opts: { header?: boolean; labelCols?: number[] } = {}) => {
    const total = cols.reduce((a, b) => a + b, 0);
    const ws = cols.map((c) => (c / total) * width);
    const pad = 5;
    rows.forEach((row, ri) => {
      const isHead = opts.header && ri === 0;
      const heights = row.map((cell, ci) => {
        doc.font(isHead || opts.labelCols?.includes(ci) ? "B" : "R").fontSize(9);
        return doc.heightOfString(cell || " ", { width: ws[ci] - pad * 2, lineGap: 2 });
      });
      const h = Math.max(...heights) + pad * 2;
      ensure(h);
      const y = doc.y;
      let x = left;
      row.forEach((cell, ci) => {
        const isLabel = opts.labelCols?.includes(ci);
        if (isHead || isLabel) doc.rect(x, y, ws[ci], h).fill(COLOR.head);
        doc.rect(x, y, ws[ci], h).lineWidth(0.5).strokeColor(COLOR.line).stroke();
        doc
          .font(isHead || isLabel ? "B" : "R")
          .fontSize(9)
          .fillColor(COLOR.text)
          .text(cell || " ", x + pad, y + pad, { width: ws[ci] - pad * 2, lineGap: 2 });
        x += ws[ci];
      });
      doc.x = left;
      doc.y = y + h;
    });
  };

  const i = r.incident;
  section("장애 개요");
  table(
    [1, 2, 1, 2],
    [
      ["접수번호", i.code, "긴급도", i.severity],
      ["제목", i.title, "장애 유형", i.category],
      ["고객사", i.company, "대상 시스템", i.targetSystem],
      ["접수자(고객)", i.customer, "담당자", i.manager],
      ["장애 발생일시", i.occurredAt, "접수일시", i.createdAt],
      ["담당자 확인일시", i.acknowledgedAt, "조치 등록일시", i.actionAt],
      ["종결일시", i.closedAt, "총 처리시간", r.durations.total],
    ],
    { labelCols: [0, 2] },
  );

  section("처리 요약");
  paragraph(r.summary);

  section("장애 내용");
  paragraph(i.description);

  section("원인 분석");
  paragraph(i.cause);

  section("조치 내역");
  paragraph(i.action);

  section("처리 경과");
  table(
    [2.2, 2.4, 2, 3.4],
    [["일시", "구분", "처리자", "비고"], ...r.timeline.map((t) => [t.at, t.label, t.actor, t.detail])],
    { header: true },
  );

  section(
    `고객·담당자 대화 내용 (총 ${r.conversation.entries.length}건 / 고객 ${r.conversation.customerCount}건, 담당자 ${r.conversation.managerCount}건)`,
  );
  if (r.conversation.entries.length === 0) paragraph("등록된 대화가 없습니다.");
  r.conversation.entries.forEach((e) => {
    ensure(36);
    doc
      .font("B")
      .fontSize(9.5)
      .fillColor(e.role === "고객" ? "#047857" : COLOR.accent)
      .text(`${e.author} (${e.role})`, left, doc.y, { continued: true })
      .font("R")
      .fillColor(COLOR.muted)
      .text(`   ${e.at}`);
    doc.font("R").fontSize(10).fillColor(COLOR.text).text(e.body, left + 10, doc.y + 2, { width: width - 10, lineGap: 2 });
    doc.moveDown(0.5);
    doc.x = left;
  });

  section("첨부파일");
  if (r.attachments.length === 0) paragraph("첨부파일이 없습니다.");
  else table([5, 1.5, 2.5], [["파일명", "크기", "등록일시"], ...r.attachments.map((a) => [a.name, a.size, a.at])], { header: true });

  section("처리완료 확인");
  table(
    [1, 2, 1, 2],
    [
      ["고객", i.customer, "확인일시", i.customerConfirmedAt],
      ["담당자", i.manager, "확인일시", i.managerConfirmedAt],
    ],
    { labelCols: [0, 2] },
  );

  // 쪽 번호
  const range = doc.bufferedPageRange();
  for (let p = range.start; p < range.start + range.count; p++) {
    doc.switchToPage(p);
    // 하단 여백 안쪽에 쓰면 pdfkit이 새 쪽을 만들므로 잠시 여백을 0으로 둔다
    doc.page.margins.bottom = 0;
    doc
      .font("R")
      .fontSize(8)
      .fillColor(COLOR.muted)
      .text(`${r.reportNo}  ·  ${p + 1} / ${range.count}`, left, doc.page.height - 36, {
        width,
        align: "center",
        lineBreak: false,
      });
  }
  doc.end();
  return done;
}
