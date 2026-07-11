// 업로드 파일(버퍼) → 텍스트 추출. Gemini에 넘길 원문을 만든다.
// hwpx·docx·pptx는 zip(XML) 파싱, xlsx는 exceljs, txt/md/csv/json은 그대로.
// pdf·이미지·미디어는 여기서 뽑지 않고 파일 그대로 Gemini에 보낸다(api/organize.js에서 처리).
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const AdmZip = require("adm-zip");

// 확장자별 처리 방식 구분
export const GEMINI_FILE_MIME = {
  pdf: "application/pdf",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
};
export const MEDIA_MIME = {
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", ogg: "audio/ogg",
};

export function extOf(name = "") {
  const m = String(name).toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}
// Gemini에 파일 그대로 보내야 하는 형식(추출 불가/불필요)
export function fileMimeFor(name) {
  const e = extOf(name);
  return GEMINI_FILE_MIME[e] || MEDIA_MIME[e] || null;
}
export function isMedia(name) {
  return !!MEDIA_MIME[extOf(name)];
}

function decodeXml(s) {
  return String(s)
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}
const stripTags = (xml) => decodeXml(String(xml).replace(/<[^>]+>/g, ""));

// ── hwpx: Contents/sectionN.xml 의 <hp:t> ──
function fromHwpx(buf) {
  const zip = new AdmZip(buf);
  const entries = zip.getEntries()
    .filter((e) => /section\d+\.xml$/i.test(e.entryName))
    .sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true }));
  const lines = [];
  for (const e of entries) {
    const xml = e.getData().toString("utf8");
    for (const para of xml.split(/<\/hp:p>/)) {
      const runs = [...para.matchAll(/<(?:hp:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:hp:)?t>/g)].map((m) => m[1]);
      if (runs.length) lines.push(decodeXml(runs.join("")));
    }
  }
  return lines.join("\n");
}

// ── docx: word/document.xml 의 <w:p>(문단) / <w:t>(글자) ──
function fromDocx(buf) {
  const zip = new AdmZip(buf);
  const xml = zip.readAsText("word/document.xml") || "";
  const lines = [];
  for (const para of xml.split(/<\/w:p>/)) {
    const runs = [...para.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => decodeXml(m[1]));
    if (runs.length) lines.push(runs.join(""));
  }
  return lines.join("\n");
}

// ── pptx: ppt/slides/slideN.xml 의 <a:t> ──
function fromPptx(buf) {
  const zip = new AdmZip(buf);
  const slides = zip.getEntries()
    .filter((e) => /ppt\/slides\/slide\d+\.xml$/i.test(e.entryName))
    .sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true }));
  const out = [];
  slides.forEach((e, i) => {
    out.push(`### 슬라이드 ${i + 1}`);
    const xml = e.getData().toString("utf8");
    for (const m of xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)) out.push(decodeXml(m[1]));
  });
  return out.join("\n");
}

// ── xlsx: exceljs로 시트별 셀 덤프 ──
async function fromXlsx(buf) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const parts = [];
  wb.eachSheet((ws) => {
    parts.push(`### 시트: ${ws.name}`);
    ws.eachRow((row) => {
      const cells = [];
      row.eachCell({ includeEmpty: true }, (c) => {
        let v = c.value;
        if (v && typeof v === "object") v = v.text || v.result || v.hyperlink || "";
        cells.push(v == null ? "" : String(v));
      });
      if (cells.some((x) => x.trim())) parts.push(cells.join("\t"));
    });
  });
  return parts.join("\n");
}

// 파일명 확장자로 분기해 텍스트를 뽑는다. (pdf·이미지·미디어는 null 반환 → 파일 그대로 전송)
export async function extractText(name, buf) {
  const e = extOf(name);
  if (fileMimeFor(name)) return null; // Gemini가 직접 처리
  switch (e) {
    case "hwpx": return fromHwpx(buf);
    case "docx": return fromDocx(buf);
    case "pptx": return fromPptx(buf);
    case "xlsx": case "xlsm": return await fromXlsx(buf);
    case "txt": case "md": case "csv": case "json": case "":
      return buf.toString("utf8");
    default:
      return buf.toString("utf8"); // 알 수 없는 형식은 텍스트로 시도
  }
}
