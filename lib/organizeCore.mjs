// 자료정리 코어 — 추출한 원문(또는 파일)을 Gemini에 보내 '정리된 문서 구조(JSON)'를 받는다.
// 키는 요청으로 받은 사용자 키(userKey)를 우선 쓰고, 없으면 환경변수 GEMINI_API_KEY로 대체한다(저장·로그 안 함).
import { GEMINI_MODEL } from "./templates.mjs";

const NATURE_TO_FORMAT = {
  보고서: "hwpx", 공문: "hwpx", 공지: "hwpx", 회의록: "hwpx", 요약: "hwpx",
  데이터표: "xlsx", 명단: "xlsx", 대장: "xlsx", 통계: "xlsx",
  발표자료: "pptx", 브리핑: "pptx",
  배포: "pdf", 인쇄: "pdf",
};
export const FORMATS = ["hwpx", "xlsx", "pptx", "pdf"];

export const ORGANIZE_PROMPT = `당신은 경기도의회 문화체육관광위원회 정책지원관의 의정활동 비서입니다.
아래 자료를 읽고, 의정활동에 바로 쓸 수 있게 한국어로 정리하십시오.
반드시 아래 JSON 스키마 하나만 출력하고, 그 외 설명·코드펜스는 쓰지 마십시오.

{
  "제목": "자료를 대표하는 제목",
  "성격": "보고서 | 데이터표 | 발표자료 | 회의록 | 공지 | 요약 중 가장 가까운 것",
  "추천형식": "hwpx | xlsx | pptx | pdf 중 성격에 가장 맞는 것",
  "요약": ["핵심을 3~6개 항목으로. 각 항목은 한 문장."],
  "섹션": [
    {
      "소제목": "섹션 제목",
      "문단": ["설명 문단. 여러 개 가능."],
      "표": {"제목": "표 이름(선택)", "헤더": ["열1","열2"], "행": [["값","값"]]}
    }
  ],
  "비고": "출처·날짜·주의사항 등 (선택)"
}

규칙:
- 표로 정리하는 게 자연스러운 내용(명단·일정·수치·항목별 현황)은 반드시 '표'로 넣으십시오.
- 날짜·출처·링크가 원문에 있으면 보존하십시오.
- 민원인 등 개인정보는 이니셜·유형만 남기고 비식별 처리하십시오.
- 내용이 없으면 빈 배열([])로 두고 임의로 지어내지 마십시오.`;

export class GeminiError extends Error {}

async function callGemini(parts, userKey = "") {
  const key = String(userKey || "").trim().slice(0, 200) || process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiError("NO_KEY: AI 키가 없습니다. 본인 Gemini 키를 입력해 주세요.");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new GeminiError(`Gemini 오류(${r.status}). ${t.slice(0, 300)}`);
  }
  const data = await r.json();
  const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  if (!text) throw new GeminiError("생성 결과가 비어 있습니다. 잠시 후 다시 시도해 주세요.");
  return parseJson(text);
}

function parseJson(text) {
  let t = String(text).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try { return JSON.parse(t); } catch {}
  const m = t.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  throw new GeminiError("Gemini가 올바른 JSON을 주지 않았습니다.");
}

export function normalizeDoc(doc, sourceName = "", wantFormat = "") {
  doc = doc && typeof doc === "object" ? doc : {};
  const out = {
    제목: doc["제목"] || sourceName || "정리 결과",
    성격: doc["성격"] || "",
    요약: Array.isArray(doc["요약"]) ? doc["요약"].map(String) : [],
    섹션: [],
    비고: doc["비고"] ? String(doc["비고"]) : "",
    출처: sourceName,
  };
  let fmt = String(wantFormat || "").toLowerCase();
  if (!FORMATS.includes(fmt)) fmt = String(doc["추천형식"] || "").toLowerCase();
  if (!FORMATS.includes(fmt)) fmt = NATURE_TO_FORMAT[out.성격] || "hwpx";
  out.추천형식 = fmt;
  for (const s of Array.isArray(doc["섹션"]) ? doc["섹션"] : []) {
    if (!s || typeof s !== "object") continue;
    const sec = {
      소제목: s["소제목"] ? String(s["소제목"]) : "",
      문단: Array.isArray(s["문단"]) ? s["문단"].map(String) : (s["문단"] ? [String(s["문단"])] : []),
      표: null,
    };
    const t = s["표"];
    if (t && typeof t === "object" && Array.isArray(t["행"]) && t["행"].length) {
      sec.표 = {
        제목: t["제목"] ? String(t["제목"]) : "",
        헤더: Array.isArray(t["헤더"]) ? t["헤더"].map(String) : [],
        행: t["행"].map((row) => (Array.isArray(row) ? row.map((c) => (c == null ? "" : String(c))) : [String(row)])),
      };
    }
    out.섹션.push(sec);
  }
  return out;
}

// 텍스트 원문 → 정리
export async function organizeText(text, sourceName = "", wantFormat = "", note = "", userKey = "") {
  const hint = sourceName ? `\n\n[자료 출처] ${sourceName}` : "";
  const ask = note ? `\n\n[추가 요청사항] ${note}` : "";
  const prompt = ORGANIZE_PROMPT + hint + ask + "\n\n[자료 원문]\n" + String(text).slice(0, 120000);
  const doc = await callGemini([{ text: prompt }], userKey);
  return normalizeDoc(doc, sourceName, wantFormat);
}

// 유튜브 영상 URL에서 영상 ID 추출 (watch?v= / youtu.be / shorts / live / embed)
export function youtubeId(url) {
  const m = String(url).match(/(?:v=|\/live\/|\/shorts\/|\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

// 유튜브 영상 → Gemini가 영상을 직접 보고 정리 (자막 수집 불필요)
export async function organizeYoutube(url, wantFormat = "", note = "", userKey = "") {
  const id = youtubeId(url);
  if (!id) throw new GeminiError("유튜브 영상 주소에서 영상 ID를 찾지 못했습니다.");
  const clean = `https://www.youtube.com/watch?v=${id}`;
  const ask = note ? `\n[추가 요청사항] ${note}` : "";
  const prompt = ORGANIZE_PROMPT + `\n\n[영상 출처] ${url}${ask}\n\n첨부된 유튜브 영상(음성·자막·화면)을 보고 위 스키마로 정리하십시오.`;
  let doc;
  try {
    doc = await callGemini([{ text: prompt }, { fileData: { fileUri: clean } }], userKey);
  } catch (e) {
    if (/token count exceeds/i.test(String(e.message)))
      throw new GeminiError("영상이 너무 깁니다. 웹에서는 짧은 영상만 지원합니다. 긴 영상은 로컬 앱(자료변환)을 이용해 주세요.");
    throw e;
  }
  return normalizeDoc(doc, url, wantFormat);
}

// 파일(pdf·이미지·미디어) 그대로 → 정리
export async function organizeFile(base64, mimeType, sourceName = "", wantFormat = "", note = "", userKey = "") {
  const ask = note ? `\n[추가 요청사항] ${note}` : "";
  const prompt = ORGANIZE_PROMPT + `\n\n[자료 출처] ${sourceName}${ask}\n\n첨부된 자료의 내용을 위 스키마로 정리하십시오.`;
  const doc = await callGemini([{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64 } }], userKey);
  return normalizeDoc(doc, sourceName, wantFormat);
}
