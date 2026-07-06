// 참고 파일(.hwpx)에서 글자만 뽑기 — Vercel 서버리스
// .hwpx = zip. 본문은 Contents/section0.xml… 안의 <hp:t>…</hp:t>에 들어 있다.
// 업로드 파일(원본 바이트)을 그대로 받으려고 기본 body 파싱을 끈다.
import AdmZip from "adm-zip";

export const config = { api: { bodyParser: false } };

function decodeXml(s) {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}
function extractHwpxText(buf) {
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
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).send("method not allowed"); return; }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  try {
    const text = extractHwpxText(Buffer.concat(chunks));
    if (!text.trim()) { res.status(422).send("글자를 찾지 못했습니다(스캔·이미지로 된 한글파일일 수 있습니다)."); return; }
    res.status(200).send(text.slice(0, 100000)); // 참고자료는 10만 자까지만
  } catch (e) {
    res.status(400).send("한글파일(.hwpx)을 읽지 못했습니다: " + String((e && e.message) || e));
  }
}
