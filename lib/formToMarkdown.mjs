// 폼 데이터(JSON) → 질의서 마크다운 원고
// 표지 + [질의서 목록] 표 + 질의 항목(질의배경/질의사항/마무리/추가 요청자료)을
// 기본양식 구조로 생성한다. 생성된 마크다운은 buildHwpx로 그대로 넘긴다.

// 표 셀이 깨지지 않도록 '|'만 정리(표지·목록 표에 들어가는 짧은 값).
const cell = (v) => String(v ?? "").replace(/\|/g, "/").trim();

// 여러 줄 텍스트 → 문단 배열. 이미 머리표(⚪ / - / · / 숫자.)가 있으면 그대로,
// 없으면 기본 머리표(defaultMark)를 붙인다. 빈 줄은 건너뛴다.
function toParas(text, defaultMark) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (/^(⚪|[-·•]\s|\d+\.\s)/.test(l) ? l : `${defaultMark}${l}`));
}

export function formToMarkdown(form) {
  const f = form || {};
  const items = Array.isArray(f.items) ? f.items : [];
  const out = [];

  // 표지 — 유형별 표지 칸(cover 배열)과 표 아래 한 줄(footer)로 구성
  out.push(`# ${cell(f.title) || "질의 자료"}`, "");
  const coverRows = (Array.isArray(f.cover) ? f.cover : []).filter((r) => r && cell(r.value));
  if (coverRows.length) {
    out.push("| 구 분 | 내 용 |", "| --- | --- |");
    for (const r of coverRows) out.push(`| ${cell(r.label)} | ${cell(r.value)} |`);
    out.push("");
  }
  if (cell(f.footer)) out.push(cell(f.footer), "");

  // 질의서 목록
  out.push("## [질의서 목록]", "");
  out.push("| 연번 | 주 제 | 소관 | 페이지 |", "| --- | --- | --- | --- |");
  items.forEach((it, i) => {
    out.push(`| ${i + 1} | ${cell(it.subject)} | ${cell(it.department)} |  |`);
  });
  out.push("");

  // 질의 항목
  items.forEach((it, i) => {
    out.push(`## ${i + 1}. ${cell(it.subject)}  (소관: ${cell(it.department)})`, "");
    const blocks = [
      ["□ 질의배경", toParas(it.background, "⚪ ")],
      ["□ 질의사항", toParas(it.questions, "⚪ ")],
      ["□ 마무리", toParas(it.closing, "⚪ ")],
      ["□ 추가 요청자료", toParas(it.materials, "- ")],
    ];
    for (const [head, paras] of blocks) {
      if (!paras.length) continue;       // 비어 있으면 그 구분 자체를 생략
      out.push(head, "");
      for (const p of paras) out.push(p, "");
    }
  });

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
