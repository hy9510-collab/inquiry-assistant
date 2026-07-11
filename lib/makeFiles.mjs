// 정리된 문서 구조(doc) → 파일 버퍼. hwpx / xlsx / pptx / pdf.
// hwpx는 기존 buildHwpx(마크다운→경기도의회 서식) 엔진을 재사용한다.
import { buildHwpx } from "./buildHwpx.mjs";
import { readFileSync } from "node:fs";

const SUBTITLE = (doc) =>
  "경기도의회 문화체육관광위원회 ｜ 정책지원관 정리" + (doc.출처 ? ` ｜ ${doc.출처}` : "");

// ── doc → 마크다운 (hwpx 입력용) ──────────────────────────────────
function tableMd(t) {
  let header = t.헤더 || [];
  let rows = t.행 || [];
  if (!header.length && rows.length) { header = rows[0]; rows = rows.slice(1); }
  if (!header.length) return "";
  const esc = (c) => String(c).replace(/\|/g, "\\|").replace(/\n/g, " ");
  const line = (cells) => "| " + cells.map(esc).join(" | ") + " |";
  const out = [line(header), "| " + header.map(() => "---").join(" | ") + " |"];
  for (const r of rows) {
    const cells = header.map((_, i) => (r[i] == null ? "" : r[i]));
    out.push(line(cells));
  }
  return out.join("\n");
}

export function docToMarkdown(doc) {
  const md = [`# ${doc.제목}`, "", SUBTITLE(doc), ""];
  if (doc.요약?.length) {
    md.push("## 요약", "");
    for (const x of doc.요약) md.push(`- ${x}`);
    md.push("");
  }
  for (const s of doc.섹션 || []) {
    if (s.소제목) md.push(`## ${s.소제목}`, "");
    for (const p of s.문단 || []) md.push(p, "");
    if (s.표) {
      if (s.표.제목) md.push(`**〔${s.표.제목}〕**`, "");
      const tm = tableMd(s.표);
      if (tm) md.push(tm, "");
    }
  }
  if (doc.비고) md.push("", `비고: ${doc.비고}`);
  return md.join("\n");
}

export async function makeHwpx(doc) {
  return await buildHwpx(docToMarkdown(doc));
}

// ── xlsx (exceljs) ────────────────────────────────────────────────
function safeSheet(name, i) {
  const s = String(name || `표${i}`).replace(/[\\/*?:[\]]/g, " ").slice(0, 28).trim() || `표${i}`;
  return s;
}
export async function makeXlsx(doc) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const head = { font: { color: { argb: "FFFFFFFF" }, bold: true }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } } };

  const ws = wb.addWorksheet("요약");
  ws.getColumn(1).width = 90;
  ws.addRow([doc.제목]); ws.getCell("A1").font = { bold: true, size: 14, color: { argb: "FF1F3864" } };
  ws.addRow([SUBTITLE(doc)]); ws.getRow(2).font = { size: 9, color: { argb: "FF666666" } };
  ws.addRow([]);
  for (const x of doc.요약 || []) ws.addRow([`· ${x}`]).getCell(1).alignment = { wrapText: true };

  let ti = 0;
  for (const s of doc.섹션 || []) {
    if (!s.표) continue;
    ti++;
    const sh = wb.addWorksheet(safeSheet(s.표.제목 || s.소제목, ti));
    let header = s.표.헤더 || [], rows = s.표.행 || [];
    if (!header.length && rows.length) { header = rows[0]; rows = rows.slice(1); }
    if (header.length) {
      const hr = sh.addRow(header);
      hr.eachCell((c) => { c.font = head.font; c.fill = head.fill; });
    }
    for (const r of rows) sh.addRow(header.length ? header.map((_, i) => r[i] ?? "") : r);
    (header.length ? header : rows[0] || [""]).forEach((_, i) => { sh.getColumn(i + 1).width = 22; sh.getColumn(i + 1).alignment = { wrapText: true, vertical: "top" }; });
  }
  if (!ti && (doc.섹션 || []).length) {
    const sh = wb.addWorksheet("본문");
    const hr = sh.addRow(["소제목", "내용"]); hr.eachCell((c) => { c.font = head.font; c.fill = head.fill; });
    for (const s of doc.섹션) sh.addRow([s.소제목 || "", (s.문단 || []).join("\n")]);
    sh.getColumn(1).width = 24; sh.getColumn(2).width = 80; sh.getColumn(2).alignment = { wrapText: true };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ── pptx (pptxgenjs) ──────────────────────────────────────────────
export async function makePptx(doc) {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const p = new PptxGenJS();
  const NAVY = "1F3864";

  let s = p.addSlide();
  s.addText(doc.제목, { x: 0.5, y: 2.2, w: 9, h: 1.2, fontSize: 30, bold: true, color: NAVY });
  s.addText(SUBTITLE(doc), { x: 0.5, y: 3.4, w: 9, h: 0.5, fontSize: 12, color: "666666" });

  if (doc.요약?.length) {
    s = p.addSlide();
    s.addText("요약", { x: 0.5, y: 0.3, w: 9, h: 0.6, fontSize: 22, bold: true, color: NAVY });
    s.addText(doc.요약.map((t) => ({ text: t, options: { bullet: true, fontSize: 16, breakLine: true } })),
      { x: 0.6, y: 1.1, w: 8.8, h: 4.5 });
  }
  for (const sec of doc.섹션 || []) {
    s = p.addSlide();
    s.addText(sec.소제목 || "내용", { x: 0.5, y: 0.3, w: 9, h: 0.6, fontSize: 20, bold: true, color: NAVY });
    const paras = (sec.문단 || []);
    if (paras.length)
      s.addText(paras.map((t) => ({ text: t, options: { bullet: true, fontSize: 15, breakLine: true } })),
        { x: 0.6, y: 1.1, w: 8.8, h: sec.표 ? 2.4 : 4.5 });
    if (sec.표) {
      let header = sec.표.헤더 || [], rows = sec.표.행 || [];
      if (!header.length && rows.length) { header = rows[0]; rows = rows.slice(1); }
      const body = rows.map((r) => (header.length ? header.map((_, i) => String(r[i] ?? "")) : r.map(String)));
      const trows = [];
      if (header.length) trows.push(header.map((h) => ({ text: String(h), options: { bold: true, color: "FFFFFF", fill: NAVY } })));
      for (const r of body) trows.push(r.map((c) => ({ text: c })));
      if (trows.length) s.addTable(trows, { x: 0.5, y: paras.length ? 3.6 : 1.1, w: 9, fontSize: 10, border: { pt: 0.5, color: "CCCCCC" } });
    }
  }
  return Buffer.from(await p.write({ outputType: "nodebuffer" }));
}

// ── pdf (pdf-lib + 한글 폰트) ─────────────────────────────────────
let _fontBytes = null;
function fontBytes() {
  if (!_fontBytes) _fontBytes = readFileSync(new URL("./fonts/NanumGothic-Regular.ttf", import.meta.url));
  return _fontBytes;
}
export async function makePdf(doc) {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const fontkit = (await import("@pdf-lib/fontkit")).default;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes(), { subset: true });
  const NAVY = rgb(0x1f / 255, 0x38 / 255, 0x64 / 255);
  const GRAY = rgb(0.4, 0.4, 0.4);
  const BLACK = rgb(0, 0, 0);
  const M = 50, W = 595.28, H = 841.89, right = W - M;

  let page = pdf.addPage([W, H]);
  let y = H - M;
  const newPage = () => { page = pdf.addPage([W, H]); y = H - M; };
  const wrap = (text, size, maxW) => {
    const lines = [];
    for (const raw of String(text).split("\n")) {
      let cur = "";
      for (const ch of raw) {
        if (font.widthOfTextAtSize(cur + ch, size) > maxW && cur) { lines.push(cur); cur = ch; }
        else cur += ch;
      }
      lines.push(cur);
    }
    return lines;
  };
  const draw = (text, { size = 11, color = BLACK, gap = 4, indent = 0 } = {}) => {
    for (const ln of wrap(text, size, right - M - indent)) {
      if (y - size < M) newPage();
      y -= size;
      page.drawText(ln, { x: M + indent, y, size, font, color });
      y -= gap;
    }
  };

  draw(doc.제목, { size: 18, color: NAVY, gap: 6 });
  draw(SUBTITLE(doc), { size: 9, color: GRAY, gap: 8 });
  if (doc.요약?.length) {
    y -= 4; draw("요약", { size: 13, color: NAVY, gap: 5 });
    for (const x of doc.요약) draw(`· ${x}`, { size: 11, gap: 3 });
  }
  for (const s of doc.섹션 || []) {
    y -= 6;
    if (s.소제목) draw(s.소제목, { size: 13, color: NAVY, gap: 5 });
    for (const p of s.문단 || []) draw(p, { size: 11, gap: 3 });
    if (s.표) drawTable(s.표);
  }
  if (doc.비고) { y -= 6; draw(`비고: ${doc.비고}`, { size: 9, color: GRAY }); }

  function drawTable(t) {
    let header = t.헤더 || [], rows = t.행 || [];
    if (!header.length && rows.length) { header = rows[0]; rows = rows.slice(1); }
    const ncol = header.length || (rows[0] ? rows[0].length : 1);
    const cw = (right - M) / ncol, size = 9, pad = 3, lh = size + 2;
    if (t.제목) { y -= 3; draw(`〔${t.제목}〕`, { size: 10, gap: 3 }); }
    const drawRow = (cells, isHead) => {
      const wrapped = cells.map((c) => wrap(c, size, cw - pad * 2));
      const rowH = Math.max(1, ...wrapped.map((w) => w.length)) * lh + pad;
      if (y - rowH < M) newPage();
      const top = y;
      cells.forEach((_, i) => {
        const x = M + i * cw;
        if (isHead) page.drawRectangle({ x, y: top - rowH, width: cw, height: rowH, color: rgb(0.91, 0.93, 0.97) });
        page.drawRectangle({ x, y: top - rowH, width: cw, height: rowH, borderColor: rgb(0.8, 0.83, 0.89), borderWidth: 0.5 });
        let ty = top - size - pad + 2;
        for (const ln of wrapped[i]) { page.drawText(ln, { x: x + pad, y: ty, size, font, color: BLACK }); ty -= lh; }
      });
      y = top - rowH;
    };
    if (header.length) drawRow(header.map(String), true);
    for (const r of rows) drawRow((header.length ? header.map((_, i) => r[i] ?? "") : r).map(String), false);
    y -= 4;
  }
  return Buffer.from(await pdf.save());
}

const EXT = { hwpx: "hwpx", xlsx: "xlsx", pptx: "pptx", pdf: "pdf" };
export async function makeFile(doc, format) {
  const f = EXT[format] ? format : "hwpx";
  const buf = f === "hwpx" ? await makeHwpx(doc)
    : f === "xlsx" ? await makeXlsx(doc)
    : f === "pptx" ? await makePptx(doc)
    : await makePdf(doc);
  return { buffer: buf, ext: EXT[f] };
}
