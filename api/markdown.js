// 폼 → 질의서 마크다운 원고 미리보기 (Vercel 서버리스)
import { formToMarkdown } from "../lib/formToMarkdown.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });
  try {
    const { form } = req.body || {};
    const markdown = formToMarkdown(form || {});
    res.status(200).json({ markdown });
  } catch (err) {
    res.status(400).json({ error: err.message || "처리 중 오류가 발생했습니다." });
  }
}
