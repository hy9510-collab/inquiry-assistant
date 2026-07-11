// 자료정리 — 입력(텍스트/링크/파일) → Gemini 정리 → 문서 구조(JSON) 반환. Vercel 서버리스.
// 파일은 원본 바이트를 그대로 받으려고 기본 bodyParser를 끈다.
//   • 파일 업로드: POST /api/organize?name=<파일명>&format=<>&note=<>  (본문 = 파일 바이트)
//   • 텍스트/링크: POST /api/organize  (JSON 본문 {text, url, format, note})
import { extractText, fileMimeFor } from "../lib/extractText.mjs";
import { organizeText, organizeFile, GeminiError } from "../lib/organizeCore.mjs";

export const config = { api: { bodyParser: false } };
export const maxDuration = 60;

const YT = /(?:youtube\.com|youtu\.be)/i;

async function readBuf(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

async function fromUrl(url) {
  if (YT.test(url))
    throw new Error("웹 배포판에서는 유튜브 자막 수집이 제한됩니다. 영상 파일을 올리거나 로컬 앱을 이용해 주세요.");
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; InquiryAssistant/1.0)" } });
  if (!r.ok) throw new Error(`링크를 열지 못했습니다(${r.status}).`);
  let html = await r.text();
  html = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";
  const text = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
  return (title ? `[제목] ${title.trim()}\n[출처] ${url}\n\n` : `[출처] ${url}\n\n`) + text;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });
  try {
    const url0 = new URL(req.url, "http://x");
    const q = url0.searchParams;
    const name = q.get("name");
    const buf = await readBuf(req);

    let doc;
    if (name) {
      // 파일 업로드
      const format = q.get("format") || "";
      const note = q.get("note") || "";
      const mime = fileMimeFor(name);
      if (mime) {
        doc = await organizeFile(buf.toString("base64"), mime, name, format, note);
      } else {
        const text = await extractText(name, buf);
        if (!text || !text.trim()) return res.status(422).json({ error: "파일에서 글자를 찾지 못했습니다." });
        doc = await organizeText(text, name, format, note);
      }
    } else {
      // 텍스트/링크 (JSON 본문)
      let body = {};
      try { body = JSON.parse(buf.toString("utf8") || "{}"); } catch { body = {}; }
      const format = body.format || "";
      const note = (body.note || "").toString();
      if (body.url && body.url.trim()) {
        const text = await fromUrl(body.url.trim());
        doc = await organizeText(text, body.url.trim(), format, note);
      } else if (body.text && body.text.trim()) {
        doc = await organizeText(body.text.trim(), body.source || "메모", format, note);
      } else {
        return res.status(400).json({ error: "넣은 자료가 없습니다. 파일·링크·텍스트 중 하나를 넣어주세요." });
      }
    }
    return res.status(200).json({ doc });
  } catch (e) {
    const msg = String((e && e.message) || e);
    const code = e instanceof GeminiError ? (msg.startsWith("NO_KEY") ? 400 : 502) : 400;
    return res.status(code).json({ error: msg });
  }
}
