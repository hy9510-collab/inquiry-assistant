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

// 교육청 세출결산 JSON → 질의서용 텍스트 (share/avgShare/delta는 분수 0.xx)
function toEduText(d) {
  if (!d || d.empty) return `【예산 분석 비서 · 경기교육청 결산】\n${(d && d.message) || "데이터가 없습니다."}`;
  const L = [`【예산 분석 비서 · ${d.target || "경기"}교육청 세출결산 전국 비교 (${d.year}회계연도)】`];
  const c = d.current || {};
  if (c.expense != null) {
    L.push(`- 세출결산 ${money(c.expense)} (17개 시·도교육청 중 ${d.rank}위/${d.total}개)`);
    if (c.revenue != null) L.push(`- 세입결산 ${money(c.revenue)}, 세입-세출 차액(잉여) ${money(c.diff)}`);
  }
  if (Array.isArray(d.policy) && d.policy.length) {
    L.push(`\n[정책분야별 세출 비중 (경기 vs 전국 평균, 금액 상위)]`);
    d.policy.slice(0, 10).forEach((p, i) => {
      const cmp = p.avgShare != null ? `, 전국평균 ${pct(p.avgShare)} 대비 ${p.delta >= 0 ? "+" : ""}${(p.delta * 100).toFixed(1)}%p` : "";
      L.push(`${i + 1}. ${p.name} ${money(p.amt)} (비중 ${pct(p.share)}${cmp})`);
    });
  }
  if (Array.isArray(d.issues) && d.issues.length) {
    L.push(`\n[자동 추출 쟁점]`);
    d.issues.forEach((i, n) => L.push(`${n + 1}. (${i.type}) ${i.title} — ${i.detail}`));
  }
  L.push(`\n※ 출처: 지방교육재정알리미 세입·세출 결산. ${d.note || ""}`.trim());
  L.push(`※ API에 예산현액 없음 → 집행률 대신 규모·비중 분석.`);
  return L.join("\n");
}

// 교육청 세출예산(당초) JSON → 질의서용 텍스트 (deltaRate/share는 분수 0.xx)
function toEduBudgetText(d) {
  if (!d || d.empty) return `【예산 분석 비서 · 경기교육청 세출예산】\n${(d && d.message) || "데이터가 없습니다."}`;
  const L = [`【예산 분석 비서 · ${d.target || "경기"}교육청 세출예산(당초) (${d.year}회계연도)】`];
  const cur = (d.current || {}).total, prev = (d.previous || {}).total;
  if (cur != null) {
    const prevTxt = prev ? ` (전년 ${money(prev)} 대비 ${d.deltaRate >= 0 ? "+" : ""}${pct(d.deltaRate)}, ${money(d.delta)})` : "";
    L.push(`- 총 세출예산 ${money(cur)}${prevTxt} · 전국 ${d.rank}위/${d.totalRegions}개`);
  }
  if (d.labor && d.labor.amt != null) {
    L.push(`- 인건비 ${money(d.labor.amt)} (비중 ${pct(d.labor.share)}, 전년 대비 ${d.labor.deltaRate >= 0 ? "+" : ""}${pct(d.labor.deltaRate)})`);
  }
  if (Array.isArray(d.fields) && d.fields.length) {
    L.push(`\n[정책분야별 세출예산 (금액 상위)]`);
    d.fields.slice(0, 10).forEach((f, i) => {
      const chg = f.deltaRate == null ? "전년 미상" : `전년 대비 ${f.deltaRate >= 0 ? "+" : ""}${pct(f.deltaRate)}, ${money(f.delta)}`;
      L.push(`${i + 1}. ${f.name} ${money(f.amt)} (비중 ${pct(f.share)}, ${chg})`);
    });
  }
  if (Array.isArray(d.issues) && d.issues.length) {
    L.push(`\n[자동 추출 쟁점]`);
    d.issues.forEach((i, n) => L.push(`${n + 1}. (${i.type}) ${i.title} — ${i.detail}`));
  }
  L.push(`\n※ 출처: 지방교육재정알리미 정책사업별 세출예산(당초·본예산). ${d.note || ""}`.trim());
  return L.join("\n");
}

// 산하 공공기관 경영·재정 점검 JSON → 질의서용 텍스트 (연도 파라미터 없음)
function toPubinstText(d) {
  if (!d || !d.summary) return `【예산 분석 비서 · 산하 공공기관】\n데이터가 없습니다.`;
  const s = d.summary;
  const L = [`【예산 분석 비서 · 경기도 산하 공공기관 경영·재정 점검】`];
  L.push(`- 대상 ${s.total}개 기관 (공사·공단 ${s.공사공단}, 출자·출연 ${s.출자출연}, 기타 ${s.안내})`);
  if (s.worstDebt) L.push(`- 최고 부채비율: ${s.worstDebt.name} ${s.worstDebt.val}% (${s.worstDebt.year})`);
  if (Array.isArray(s.lossPersist) && s.lossPersist.length) L.push(`- 당기순손실 2년 연속: ${s.lossPersist.join(", ")}`);
  if (Array.isArray(s.gradeLow) && s.gradeLow.length) L.push(`- 경영평가 하위등급(라·마): ${s.gradeLow.join(", ")}`);
  if (Array.isArray(d.issues) && d.issues.length) {
    L.push(`\n[자동 추출 쟁점]`);
    d.issues.forEach((i, n) => L.push(`${n + 1}. [${i.inst}] (${i.type}) ${i.title} — ${i.detail}`));
  }
  L.push(`\n※ 출처: ${d.source || "클린아이 지방공공기관 통합공시 / 기관 정보공개"}. ${d.note || ""}`.trim());
  return L.join("\n");
}

// kind → { 예산 비서 API 경로, 변환 함수, 기본연도 오프셋(현재연도 기준, null=연도 미사용) }
const KINDS = {
  settlement: { path: "province-settlement", fmt: toText, year: -2 },
  budget: { path: "province-budget", fmt: toBudgetText, year: 0 },
  "edu-settlement": { path: "edu-settlement", fmt: toEduText, year: -2 },
  "edu-budget": { path: "edu-budget", fmt: toEduBudgetText, year: 0 },
  pubinst: { path: "pubinst", fmt: toPubinstText, year: null },
};

export default async function handler(req, res) {
  // kind: settlement(경기 결산·기본) | budget(경기 예산) | edu-settlement | edu-budget | pubinst
  const kind = KINDS[req.query.kind] ? req.query.kind : "settlement";
  const cfg = KINDS[kind];
  const base = (process.env.BUDGET_API_URL || DEFAULT_BUDGET_URL).replace(/\/+$/, "");
  const token = process.env.BUDGET_BYPASS_TOKEN || "";
  const headers = token
    ? { "x-vercel-protection-bypass": token, "x-vercel-set-bypass-cookie": "false" }
    : {};
  // pubinst는 연도 파라미터 없음, 나머지는 요청연도(없으면 오프셋 기본값)
  let year = null;
  let url = `${base}/api/${cfg.path}`;
  if (cfg.year !== null) {
    year = Number(req.query.year) || new Date().getFullYear() + cfg.year;
    url += `?year=${encodeURIComponent(year)}`;
  }
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
    const text = cfg.fmt(data);
    return res.status(200).json({ text, year: data.year || year, kind, source: base });
  } catch (e) {
    return res.status(500).json({ error: "예산 비서 호출 실패: " + String((e && e.message) || e) });
  }
}
