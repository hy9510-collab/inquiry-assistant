// AI 초안 만들기 (Gemini) — Vercel 서버리스
// 키는 코드에 넣지 않는다. Vercel 환경변수 GEMINI_API_KEY 에서만 읽는다(브라우저에 노출 안 됨).
import { TEMPLATES, WRITE_SYSTEM, GEMINI_MODEL } from "../lib/templates.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  const body = req.body || {};
  const type = body.type || "질의서";
  const guide = String(body.guide || "").slice(0, 2000); // 질의서 유형별 점검 관점(선택)
  const topic = String(body.topic || "").slice(0, 20000);
  const source = String(body.source || "").slice(0, 40000);
  const count = Math.max(1, Math.min(10, parseInt(body.count, 10) || 1)); // 질의 주제 개수(질의서 전용)

  if (!TEMPLATES[type]) return res.status(400).json({ error: "알 수 없는 종류입니다." });
  if (!topic.trim()) return res.status(400).json({ error: "주제를 입력해 주세요." });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(400).json({ error: "NO_KEY: 서버에 AI 키가 설정되지 않았습니다." });

  try {
    const guideBlock = guide.trim()
      ? `\n\n[유형별 점검 관점 — 이 관점을 중심으로 질의를 구성하되, 사실·수치는 아래 자료에 있는 것만 사용]\n${guide.trim()}`
      : "";
    const countBlock = type === "질의서"
      ? `\n\n[질의 개수 — 반드시 지킴]\n- 서로 다른 쟁점으로 질의 주제 ${count}개를 작성한다.\n- [질의서 목록] 표에 연번 1~${count} 행을 채우고, 이어서 '## 1.'부터 '## ${count}.'까지 각 주제를 골격 구조(□ 질의배경·질의사항·마무리·추가 요청자료)로 반복 작성한다.\n- 주제는 ${count}개를 채우되, 사실·수치는 [자료] 범위에서만 쓰고 없는 값은 지어내지 말고 ○○ 또는 [확인 필요]로 둔다.`
      : "";
    const prompt = `[종류] ${type}${guideBlock}${countBlock}\n\n[골격 — 이 구조·기호를 그대로 따르세요]\n${TEMPLATES[type]}\n\n[주제]\n${topic}\n\n[자료]\n${source.trim() || "(제공된 자료 없음 — 자료가 필요한 값은 ○○ 또는 [확인 필요]로 두세요)"}`;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: WRITE_SYSTEM }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4 },
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      return res.status(502).json({ error: `Gemini 오류(${r.status}). 키·모델명을 확인해 주세요. ${t.slice(0, 300)}` });
    }
    const data = await r.json();
    let text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
    text = text.replace(/^```[a-z]*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    if (!text) return res.status(502).json({ error: "생성 결과가 비어 있습니다. 잠시 후 다시 시도해 주세요." });
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: "호출 실패: " + String((e && e.message) || e) });
  }
}
