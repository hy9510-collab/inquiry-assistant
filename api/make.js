// 자료정리 — 정리된 문서 구조(doc) + 형식 → 파일 다운로드. Vercel 서버리스.
// POST /api/make  JSON { doc, format: "hwpx|xlsx|pptx|pdf", filename? }
import { makeFile } from "../lib/makeFiles.mjs";
import { normalizeDoc } from "../lib/organizeCore.mjs";

export const maxDuration = 60;

const MIME = {
  hwpx: "application/octet-stream",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pdf: "application/pdf",
};

function safeName(name, ext) {
  const base = String(name || "정리결과").replace(/[\\/:*?"<>|\r\n]/g, "").trim() || "정리결과";
  return base.toLowerCase().endsWith("." + ext) ? base : `${base}.${ext}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });
  try {
    const body = req.body || {};
    if (!body.doc) return res.status(400).json({ error: "정리된 내용(doc)이 없습니다." });
    const doc = normalizeDoc(body.doc, body.doc.출처 || "", body.format || body.doc.추천형식 || "");
    const { buffer, ext } = await makeFile(doc, body.format || doc.추천형식);
    const fname = safeName(body.filename || doc.제목, ext);
    res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fname)}`);
    return res.status(200).send(Buffer.from(buffer));
  } catch (e) {
    return res.status(400).json({ error: String((e && e.message) || e) });
  }
}
