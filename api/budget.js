// 예산 분석 비서(별도 앱)의 결산 분석 결과를 불러와 질의서 참고자료용 텍스트로 변환.
// 예산 비서는 Vercel 로그인 보호(Authentication)로 막혀 있어, 서버-서버 호출은
// 'Protection Bypass for Automation' 토큰(BUDGET_BYPASS_TOKEN)을 헤더로 보내 통과한다.
// 보호를 끈 경우엔 토큰 없이도 동작한다. 토큰은 코드에 넣지 않고 환경변수에서만 읽는다.
const DEFAULT_BUDGET_URL = "https://budget-assistant-git-main-hy-s-projects11.vercel.app";

const won = (n) => (n == null || isNaN(n) ? "-" : Math.round(n).toLocaleString("ko-KR"));
const pct = (n) => (n == null || isNaN(n) ? "-" : (n * 100).toFixed(1) + "%");

// 예산 비서 결산 분석 JSON → 질의서에 붙일 읽기 좋은 한국어 텍스트
function toText(d) {
  if (!d || d.empty) return `【예산 분석 비서 · 경기 결산】\n${(d && d.message) || "데이터가 없습니다."}`;
  const L = [`【예산 분석 비서 · 경기 결산 시·도 비교 (${d.year}회계연도)】`];
  const c = d.current;
  if (c) {
    L.push(`- 경기 본청 집행률 ${pct(c.rate)} (17개 시·도 중 ${d.rank}위/${d.total}개), 전국 평균 ${pct(d.nationAvg)}, 중앙값 ${pct(d.median)}`);
    L.push(`- 예산현액 ${won(c.budget)}원, 지출액 ${won(c.spent)}원, 미집행 ${won(c.unspent)}원`);
    if (d.previous) L.push(`- 전년(${d.year - 1}) 집행률 ${pct(d.previous.rate)} → ${d.year}년 ${pct(c.rate)}`);
  }
  if (Array.isArray(d.issues) && d.issues.length) {
    L.push(`\n[자동 추출 쟁점]`);
    d.issues.forEach((i, n) => L.push(`${n + 1}. (${i.type}) ${i.title} — ${i.detail}`));
  }
  L.push(`\n※ 출처: 지방재정365 지역통합세출결산. ${d.note || ""}`.trim());
  L.push(`※ 금액 라벨에 [추정]이 포함될 수 있음 — 인용 전 원문 확인 권장.`);
  return L.join("\n");
}

export default async function handler(req, res) {
  const year = Number(req.query.year) || new Date().getFullYear() - 2;
  const base = (process.env.BUDGET_API_URL || DEFAULT_BUDGET_URL).replace(/\/+$/, "");
  const token = process.env.BUDGET_BYPASS_TOKEN || "";
  const url = `${base}/api/province-settlement?year=${encodeURIComponent(year)}`;
  const headers = token
    ? { "x-vercel-protection-bypass": token, "x-vercel-set-bypass-cookie": "false" }
    : {};
  try {
    const r = await fetch(url, { headers, redirect: "manual" });
    if (r.status >= 300 && r.status < 400) {
      return res.status(502).json({ error: "PROTECTED: 예산 비서가 로그인 보호 상태입니다." });
    }
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      return res.status(502).json({ error: "PROTECTED: 예산 비서 응답을 읽지 못했습니다(로그인 보호 또는 주소 확인)." });
    }
    const data = await r.json();
    return res.status(200).json({ text: toText(data), year: data.year || year, source: base });
  } catch (e) {
    return res.status(500).json({ error: "예산 비서 호출 실패: " + String((e && e.message) || e) });
  }
}
