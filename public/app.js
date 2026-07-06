"use strict";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ── 질의서 유형 정의 ─────────────────────────────────────
// 유형을 고르면 제목·파일명 기본값과 작성 포인트, 각 입력 칸의 예시(placeholder)를
// 그 유형의 점검 관점(지침)에 맞춰 바꿔 준다.
const TYPES = {
  budget: {
    label: "예산안 심사", title: "○○○○년도 제○회 예산안 분석(질의)자료", file: "예산심사_질의서",
    focus: "신규·증액·반복편성·집행부진 사업의 타당성",
    subject: "예) ○○사업 신규(증액) 편성의 적정성 질의",
    background: "예) 사업 목적·예산 규모·전년 대비 증감 등 편성 현황을 사실 중심으로",
    questions: "예) 1. 사업 타당성\n사업 효과·중복 여부 검증이 되었는지?\n- 산출 근거는 무엇인지?",
    closing: "예) 과다·중복 편성 여부 재검토 요청",
    materials: "예) 사업계획서, 산출내역서, 전년도 집행실적",
  },
  settlement: {
    label: "결산 심사", title: "○○○○회계연도 결산 분석(질의)자료", file: "결산심사_질의서",
    focus: "실집행률·이월/불용·성과지표 달성 여부",
    subject: "예) ○○사업 집행 결과 및 실집행률 질의",
    background: "예) 예산현액·집행액·이월·불용액 등 결산 현황을 사실 중심으로",
    questions: "예) 1. 실집행 점검\n낮은 실집행률(○%)의 원인은?\n- 이월·불용 사유와 재발 방지책은?",
    closing: "예) 성과 미흡 사업의 개선·정비 요청",
    materials: "예) 세부 집행내역, 성과보고서, 이월·불용 명세",
  },
  audit: {
    label: "행정사무감사", title: "○○○○년도 행정사무감사 질의자료", file: "행정사무감사_질의서",
    focus: "전년도 지적사항 이행·관리·감독 책임",
    subject: "예) 전년도 지적사항 ○○ 이행 여부 질의",
    background: "예) 전년도 지적·시정요구 내용과 조치계획을 사실 중심으로",
    questions: "예) 1. 이행 점검\n시정요구 ○○의 조치 결과는?\n- 미이행 사유와 향후 일정은?",
    closing: "예) 미이행 사항의 조속 이행·관리 강화 요청",
    materials: "예) 조치결과보고서, 관련 공문·내부결재",
  },
  ordinance: {
    label: "조례안 심사", title: "○○ 조례안 검토(질의)자료", file: "조례안심사_질의서",
    focus: "제·개정 입법 필요성·상위법 부합·예산 소요",
    subject: "예) ○○ 조례안 제정 필요성 및 실효성 질의",
    background: "예) 제·개정 취지, 상위법령 근거, 유사 조례 현황을 사실 중심으로",
    questions: "예) 1. 입법 필요성\n기존 제도로 대응 불가한 사유는?\n- 상위법 위임 범위에 부합하는지?\n- 예산 소요와 재원 대책은?",
    closing: "예) 실효성·재정부담 검토 후 정비 요청",
    materials: "예) 조례안 원문, 비용추계서, 유사 조례 비교표",
  },
  report: {
    label: "업무보고·일반회의", title: "○○ 업무보고 질의자료", file: "업무보고_질의서",
    focus: "정책 방향·추진 일정·향후 계획",
    subject: "예) ○○ 정책 추진 현황 및 계획 질의",
    background: "예) 정책 목표, 추진 경과, 현재 단계를 사실 중심으로",
    questions: "예) 1. 추진 현황\n당초 계획 대비 진척도는?\n- 향후 일정과 목표 시점은?",
    closing: "예) 차질 없는 추진과 점검 요청",
    materials: "예) 추진계획서, 일정표, 예산 투입 현황",
  },
  provincial: {
    label: "도정질문", title: "제○회 경기도의회 정례회 도정질문", file: "도정질문",
    focus: "도정 전반의 정책 방향·현안 대응",
    subject: "예) ○○ 현안에 대한 도지사 입장 질의",
    background: "예) 현안의 배경·도민 영향·도의 대응 경과를 사실 중심으로",
    questions: "예) 1. 도지사 입장\n○○에 대한 도지사의 입장은?\n- 구체적 대책과 추진 시기는?",
    closing: "예) 책임 있는 도정 운영과 후속 조치 요청",
    materials: "예) 관련 통계·현황 자료",
  },
  written: {
    label: "서면질의", title: "서면질의서", file: "서면질의",
    focus: "서면 회신을 요구하는 구체적 확인 사항",
    subject: "예) ○○ 자료 제출 및 확인 요청",
    background: "예) 확인이 필요한 사안의 경위를 간단히",
    questions: "예) - ○○ 현황은 어떠한지?\n- ○○ 자료를 제출해 주시기 바람",
    closing: "예) 기한 내 서면 회신 요청",
    materials: "예) 요청 자료 목록",
  },
};

// 한 질의 항목의 모든 입력 칸 예시(placeholder)를 선택한 유형에 맞춰 바꾼다.
function setItemPlaceholders(el, t) {
  if (!t) return;
  $(".i-subject", el).placeholder = t.subject;
  $(".i-background", el).placeholder = t.background;
  $(".i-questions", el).placeholder = t.questions;
  $(".i-closing", el).placeholder = t.closing;
  $(".i-materials", el).placeholder = t.materials;
}

// ── 유형별 표지(표지 칸) 정의 ────────────────────────────
// rows: 표지 표의 행(구분/내용), footer: 표 아래 한 줄(위원회 등).
const DEFAULT_COVER = {
  rows: [
    { key: "date",  label: "일 시", ph: "예) 2026. 6. 20.(금) ○○:○○" },
    { key: "place", label: "장 소", ph: "예) 상임위 회의실" },
    { key: "target", label: "대 상", ph: "예) ○○국" },
  ],
  footer: { key: "committee", label: "위원회", ph: "예) 경기도의회 ○○위원회" },
};
const COVERS = {
  audit: {
    rows: [
      { key: "date",  label: "일 시", ph: "예) 2026. ○. ○.(요일) ○○:○○" },
      { key: "place", label: "장 소", ph: "예) 상임위 회의실" },
      { key: "target", label: "감사대상", ph: "예) ○○국(실·과)" },
    ],
    footer: { key: "committee", label: "위원회", ph: "예) 경기도의회 ○○위원회" },
  },
  ordinance: {
    rows: [
      { key: "bill",  label: "의안번호", ph: "예) 제○○호" },
      { key: "date",  label: "일 시", ph: "예) 2026. ○. ○.(요일) ○○:○○" },
      { key: "place", label: "장 소", ph: "예) 상임위 회의실" },
      { key: "target", label: "소 관", ph: "예) ○○국 ○○과" },
    ],
    footer: { key: "committee", label: "위원회", ph: "예) 경기도의회 ○○위원회" },
  },
  provincial: {
    rows: [
      { key: "session",    label: "회 기", ph: "예) 제○○회 정례회 제○차 본회의" },
      { key: "date",       label: "일 시", ph: "예) 2026. ○. ○.(요일)" },
      { key: "questioner", label: "질문자", ph: "예) ○○○ 의원" },
      { key: "answerer",   label: "답변자", ph: "예) 경기도지사" },
    ],
    footer: { key: "committee", label: "소 속", ph: "예) 경기도의회 ○○위원회" },
  },
  written: {
    rows: [
      { key: "receiver",   label: "수 신", ph: "예) ○○국장" },
      { key: "questioner", label: "질문자", ph: "예) ○○○ 의원" },
      { key: "date",       label: "작성일", ph: "예) 2026. ○. ○." },
      { key: "deadline",   label: "회신기한", ph: "예) 2026. ○. ○.까지" },
    ],
    footer: { key: "committee", label: "소 속", ph: "예) 경기도의회 ○○위원회" },
  },
};

// 표지 칸 하나(label+input)를 만든다. role: "row"(표 행) | "footer"(표 아래 줄).
function coverField(f, role) {
  const lab = document.createElement("label");
  if (role === "footer") lab.className = "full";
  const inp = document.createElement("input");
  inp.dataset.key = f.key;
  inp.dataset.label = f.label;
  inp.dataset.role = role;
  inp.placeholder = f.ph || "";
  lab.append(`${f.label} `, inp);
  return lab;
}

// 선택한 유형에 맞춰 표지 칸을 다시 그린다(이미 입력한 값은 키 기준으로 보존).
function renderCover(id) {
  const grid = $("#cover-grid");
  const prev = {};
  $$("input[data-key]", grid).forEach((inp) => { prev[inp.dataset.key] = inp.value; });
  $$("label:not(.title)", grid).forEach((el) => el.remove());   // 제목만 남기고 제거
  const conf = COVERS[id] || DEFAULT_COVER;
  const frag = document.createDocumentFragment();
  conf.rows.forEach((r) => frag.appendChild(coverField(r, "row")));
  if (conf.footer) frag.appendChild(coverField(conf.footer, "footer"));
  grid.appendChild(frag);
  $$("input[data-key]", grid).forEach((inp) => { if (prev[inp.dataset.key]) inp.value = prev[inp.dataset.key]; });
}

// ── 탭 전환 ──────────────────────────────────────────────
$$(".tab").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});
function switchTab(name) {
  $$(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  $$(".panel").forEach((p) => p.classList.toggle("active", p.id === name));
}

// ── 질의 항목 블록 ───────────────────────────────────────
const itemsBox = $("#items");
function addItem(data = {}) {
  const idx = $$(".item", itemsBox).length + 1;
  const el = document.createElement("div");
  el.className = "item";
  el.innerHTML = `
    <div class="item-head">
      <h3>질의 <span class="num">${idx}</span></h3>
      <button type="button" class="danger del">삭제</button>
    </div>
    <div class="item-row">
      <label>주제 <input class="i-subject" placeholder="예) 순세계잉여금 발생과 추경 재원화의 적정성 질의" /></label>
      <label>소관 <input class="i-department" placeholder="예) 재정담당관" /></label>
    </div>
    <div class="item-fields">
      <label>질의배경 <textarea class="i-background" placeholder="한 줄에 한 문장씩. 그냥 쓰면 ⚪로 표시됩니다."></textarea></label>
      <label>질의사항 <textarea class="i-questions" placeholder="소제목은 '1. 제목', 핵심은 그냥 쓰기(⚪), 세부질문은 '- 질문?' 형식"></textarea></label>
      <label>마무리 <textarea class="i-closing" placeholder="한 줄에 한 문장씩(⚪)"></textarea></label>
      <label>추가 요청자료 <textarea class="i-materials" placeholder="한 줄에 하나씩(- 목록)"></textarea></label>
    </div>`;
  $(".i-subject", el).value = data.subject || "";
  $(".i-department", el).value = data.department || "";
  $(".i-background", el).value = data.background || "";
  $(".i-questions", el).value = data.questions || "";
  $(".i-closing", el).value = data.closing || "";
  $(".i-materials", el).value = data.materials || "";
  setItemPlaceholders(el, TYPES[$("#f-type").value]); // 선택한 유형의 칸별 예시
  $(".del", el).addEventListener("click", () => { el.remove(); renumber(); updateFormPreview(); });
  itemsBox.appendChild(el);
}
function renumber() {
  $$(".item .num", itemsBox).forEach((n, i) => (n.textContent = i + 1));
}
$("#add-item").addEventListener("click", () => { addItem(); updateFormPreview(); });
addItem(); // 시작 시 1개

// ── 질의서 유형 선택 ─────────────────────────────────────
const typeHint = $("#type-hint");
$("#f-type").addEventListener("change", (e) => applyType(e.target.value));
renderCover(""); // 시작 시 기본 표지(일시·장소·대상·위원회) 그리기
function applyType(id) {
  const t = TYPES[id];
  renderCover(id);   // 표지 칸을 유형에 맞게(없으면 기본) 다시 그림
  if (!t) { typeHint.textContent = "유형을 고르면 제목·파일명과 작성 포인트가 자동으로 맞춰집니다."; return; }
  typeHint.textContent = `[${t.label}] 작성 포인트 — ${t.focus}`;
  if (!$("#f-title").value.trim()) $("#f-title").value = t.title;       // 빈 칸일 때만 채움
  if (!$("#f-filename").value.trim()) $("#f-filename").value = t.file;
  $$(".item", itemsBox).forEach((el) => setItemPlaceholders(el, t));   // 모든 항목 칸 예시 갱신
}

// ── 폼 → 데이터 수집 ─────────────────────────────────────
function collectForm() {
  const cover = [];
  let footer = "";
  $$("#cover-grid input[data-key]").forEach((inp) => {
    if (inp.dataset.role === "footer") footer = inp.value;
    else cover.push({ label: inp.dataset.label, value: inp.value });
  });
  return {
    title: $("#f-title").value,
    cover,
    footer,
    items: $$(".item", itemsBox).map((el) => ({
      subject: $(".i-subject", el).value,
      department: $(".i-department", el).value,
      background: $(".i-background", el).value,
      questions: $(".i-questions", el).value,
      closing: $(".i-closing", el).value,
      materials: $(".i-materials", el).value,
    })),
  };
}

// ── API 호출 ─────────────────────────────────────────────
async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res;
}

async function download(payload) {
  const res = await postJson("/api/build", payload);
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || "한글파일 생성에 실패했습니다.");
  }
  const blob = await res.blob();
  const name = (payload.filename || "질의서").replace(/\.hwpx$/i, "") + ".hwpx";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// 버튼 작업을 감싸 로딩/토스트 처리
async function run(btn, fn) {
  btn.disabled = true;
  try { await fn(); }
  catch (err) { toast(err.message || "오류가 발생했습니다.", true); }
  finally { btn.disabled = false; }
}

// ── 폼 탭 버튼 ───────────────────────────────────────────
$("#to-md").addEventListener("click", (e) => run(e.target, async () => {
  const res = await postJson("/api/markdown", { form: collectForm() });
  const { markdown } = await res.json();
  $("#md-text").value = markdown;
  renderPreview($("#md-text").value, $("#md-preview"));
  if (!$("#md-filename").value) $("#md-filename").value = $("#f-filename").value;
  switchTab("md");
  toast("원고로 보냈습니다. 다듬은 뒤 ‘한글파일 만들기’를 누르세요.");
}));

$("#build-form").addEventListener("click", (e) => run(e.target, async () => {
  await download({ mode: "form", form: collectForm(), filename: $("#f-filename").value });
  toast("한글파일을 내려받았습니다.");
}));

// ── 원고 탭 ──────────────────────────────────────────────
$("#build-md").addEventListener("click", (e) => run(e.target, async () => {
  await download({ mode: "markdown", markdown: $("#md-text").value, filename: $("#md-filename").value });
  toast("한글파일을 내려받았습니다.");
}));

// 원고 미리보기 — 질의서가 화면에 보기 좋게 표시되도록 렌더링(실제 서식은 한글파일에서 적용됨)
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
function renderPreview(md, el) {
  const lines = (md || "").split(/\r?\n/);
  const out = [];
  let tbl = null; // 연속된 표 행을 모으는 버퍼

  const flushTable = () => {
    if (!tbl) return;
    const rows = tbl.map((cells, r) => {
      const tag = r === 0 ? "th" : "td";
      return `<tr>${cells.map((c) => `<${tag}>${esc(c)}</${tag}>`).join("")}</tr>`;
    }).join("");
    out.push(`<table class="pv-table">${rows}</table>`);
    tbl = null;
  };

  for (const raw of lines) {
    const t = raw.trim();
    if (/^\|/.test(t)) {                                  // 표: | a | b | 형식
      if (/^\|[\s|:-]+\|?$/.test(t)) continue;            // 구분선(---) 줄은 건너뜀
      const cells = t.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      if (!tbl) tbl = [];
      tbl.push(cells);
      continue;
    }
    flushTable();
    if (!t) continue;
    if (/^#\s/.test(t)) { out.push(`<div class="pv-title">${esc(t.replace(/^#\s/, ""))}</div>`); continue; }
    if (/^##\s/.test(t)) { out.push(`<div class="pv-h2">${esc(t.replace(/^##\s/, ""))}</div>`); continue; }
    if (/^□\s/.test(t)) { out.push(`<div class="box">${esc(t)}</div>`); continue; }
    if (/^\d+\.\s/.test(t)) { out.push(`<div class="num">${esc(t)}</div>`); continue; }
    if (/^⚪/.test(t)) { out.push(`<div class="o">${esc(t)}</div>`); continue; }
    if (/^[-·•]\s/.test(t)) { out.push(`<div class="sub">${esc(t)}</div>`); continue; }
    out.push(`<div class="p">${esc(t)}</div>`);
  }
  flushTable();
  el.innerHTML = out.join("") ||
    `<div class="pv-empty">원고를 입력하면 여기에 질의서 모습이 표시됩니다.</div>`;
}

// 원고 탭: 입력할 때마다 미리보기 갱신
$("#md-text").addEventListener("input", () => renderPreview($("#md-text").value, $("#md-preview")));
renderPreview("", $("#md-preview")); // 시작 시 빈 상태 안내 표시

// 폼 탭: 칸을 채우는 동안 미리보기 갱신
// 폼→원고 변환은 서버(/api/markdown)에 맡겨 한글파일과 같은 원고로 미리 보여 준다(입력이 멈추면 실행).
var formTimer;
function updateFormPreview() {
  clearTimeout(formTimer);
  formTimer = setTimeout(async () => {
    try {
      const res = await postJson("/api/markdown", { form: collectForm() });
      const { markdown } = await res.json();
      renderPreview(markdown, $("#form-preview"));
    } catch { /* 미리보기 실패는 조용히 무시(다운로드와 무관) */ }
  }, 350);
}
$("#form").addEventListener("input", updateFormPreview);
$("#form").addEventListener("change", updateFormPreview);
updateFormPreview(); // 시작 시 한 번 표시

// ── 토스트 ───────────────────────────────────────────────
let toastTimer;
function toast(msg, isErr = false) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.toggle("err", isErr);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3200);
}
