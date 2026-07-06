// 폼/원고 → 서식 적용 HWPX 다운로드 (Vercel 서버리스)
import { buildHwpx } from "../lib/buildHwpx.mjs";
import { formToMarkdown } from "../lib/formToMarkdown.mjs";

// 다운로드 파일명에서 위험 문자 제거(경로/헤더 주입 방지).
function safeName(name) {
  const base = String(name || "질의서").replace(/[\\/:*?"<>|\r\n]/g, "").trim() || "질의서";
  return base.toLowerCase().endsWith(".hwpx") ? base : base + ".hwpx";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });
  try {
    const body = req.body || {};
    const md = body.mode === "form" ? formToMarkdown(body.form || {}) : String(body.markdown || "");
    if (!md.trim()) return res.status(400).json({ error: "내용이 비어 있습니다." });
    const buf = await buildHwpx(md);
    const fname = safeName(body.filename);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fname)}`);
    res.status(200).send(Buffer.from(buf));
  } catch (err) {
    res.status(400).json({ error: err.message || "처리 중 오류가 발생했습니다." });
  }
}
