// 예산 분석 비서(별도 앱)의 결산 분석 결과를 불러와 질의서 참고자료용 텍스트로 변환.
// 예산 비서는 Vercel 로그인 보호(Authentication)로 막혀 있어, 서버-서버 호출은
// 'Protection Bypass for Automation' 토큰(BUDGET_BYPASS_TOKEN)을 헤더로 보내 통과한다.
// 보호를 끈 경우엔 토큰 없이도 동작한다. 토큰은 코드에 넣지 않고 환경변수에서만 읽는다.
const DEFAULT_BUDGET_URL = "https://budget-assistant-git-main-hy-s-projects11.vercel.app";

const won = (n) => (n == null || isNaN(n) ? "-" : Math.round(n).toLocaleString("ko-KR"));
const pct = (n) => (n == null || isNaN(n) ? "-" : (n * 100).toFixed(1) + "%");
// 큰 금액은 조원/억원 단위로 읽기 좋게 (부호 유지)
const money = (n) => {
  if (n == null || isNaN(n)) return "-";
  const a = Math.abs(n);
  if (a >= 1e12) return (n / 1e12).toFixed(2).replace(/\.00$/, "") + "조원";
  if (a >= 1e8) return Math.round(n / 1e8).toLocaleString("ko-KR") + "억원";
  return Math.round(n).toLocaleString("ko-KR") + "원";
};

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

// 예산 비서 분야별 세출예산 JSON → 질의서에 붙일 읽기 좋은 한국어 텍스트
function toBudgetText(d) {
  if (!d || d.empty) return `【예산 분석 비서 · 경기 세출예산】\n${(d && d.message) || "데이터가 없습니다."}`;
  const L = [`【예산 분석 비서 · 경기 세출예산 (${d.year}회계연도)】`];
  const cur = d.current || {};
  if (cur.total != null) {
    const prevTxt =
      d.previous && d.previous.total
        ? ` (전년 ${money(d.previous.total)} 대비 ${d.deltaRate >= 0 ? "+" : ""}${pct(d.deltaRate)}, ${money(d.delta)})`
        : "";
    L.push(`- 총 세출예산 ${money(cur.total)}${prevTxt}`);
  }
  if (Array.isArray(d.fields) && d.fields.length) {
    L.push(`\n[분야별 세출예산 (금액 상위)]`);
    d.fields.slice(0, 10).forEach((f, i) => {
      const chg = f.deltaRate == null ? "신규 편성" : `전년 대비 ${f.deltaRate >= 0 ? "+" : ""}${pct(f.deltaRate)}, ${money(f.delta)}`;
      L.push(`${i + 1}. ${f.name} ${money(f.amt)} (비중 ${pct(f.share)}, ${chg})`);
    });
  }
  if (Array.isArray(d.newSects) && d.newSects.length) {
    L.push(`\n[신규 편성 부문]`);
    d.newSects.forEach((s) => L.push(`- ${s.name} : ${money(s.amt)}`));
  }
  if (Array.isArray(d.issues) && d.issues.length) {
    L.push(`\n[자동 추출 쟁점]`);
    d.issues.forEach((i, n) => L.push(`${n + 1}. (${i.type}) ${i.title} — ${i.detail}`));
  }
  L.push(`\n※ 출처: 지방재정365 구조별 기능별 세출예산(총계). ${d.note || ""}`.trim());
  L.push(`※ 금액은 총계 기준[추정] — 인용 전 예산서 원문 확인 권장.`);
  return L.join("\n");
}

export default async function handler(req, res) {
  // kind: 'budget'(예산안 심사) | 'settlement'(결산 심사, 기본)
  const kind = req.query.kind === "budget" ? "budget" : "settlement";
  // 예산은 최신이 당해연도, 결산은 API 시차로 2년 전이 기본
  const defaultYear = kind === "budget" ? new Date().getFullYear() : new Date().getFullYear() - 2;
  const year = Number(req.query.year) || defaultYear;
  const path = kind === "budget" ? "province-budget" : "province-settlement";
  const base = (process.env.BUDGET_API_URL || DEFAULT_BUDGET_URL).replace(/\/+$/, "");
  const token = process.env.BUDGET_BYPASS_TOKEN || "";
  const url = `${base}/api/${path}?year=${encodeURIComponent(year)}`;
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
    const text = kind === "budget" ? toBudgetText(data) : toText(data);
    return res.status(200).json({ text, year: data.year || year, kind, source: base });
  } catch (e) {
    return res.status(500).json({ error: "예산 비서 호출 실패: " + String((e && e.message) || e) });
  }
}
