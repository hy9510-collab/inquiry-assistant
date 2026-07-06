// 질의서·보고서 작성·변환 작업실 (로컬, 무료, AI 없음)
// 하는 일: Claude가 써 준 질의서·보고서 원고를 붙여넣거나 파일로 불러와 → 한글파일(.hwpx)로 변환·다운로드.
//         종류를 고르면 '빈 양식(뼈대)'을 넣어 작성 출발점으로 쓸 수 있음.
// 켜기: node server.mjs  → 브라우저에서 안내되는 주소(예: http://localhost:3939)
// 실제 변환은 build.mjs와 동일하게 lib/buildHwpx.mjs가 담당.
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { buildHwpx } from "./lib/buildHwpx.mjs";
import AdmZip from "adm-zip";

// 켤 포트: 환경변수 PORT가 있으면 그 값, 없으면 3000부터 비어 있는 포트를 찾는다.
const PORTS = process.env.PORT ? [Number(process.env.PORT)] : [3000, 3939, 4000, 4321, 5000];

// 종류별 빈 양식(뼈대). 개조식 기호(□ 제목 / ⚪ 단락 / - 세부)로 통일 → 그대로 한글 서식이 입혀진다.
const TEMPLATES = {
  "질의서": `# 2025회계연도 ○○ 분석(질의)자료

| 구 분 | 내 용 |
| --- | --- |
| 일 시 | 2026. ○. ○.(○) ○○:○○ |
| 장 소 | 상임위 회의실 |
| 대 상 | 경기도교육청(○○회계) |

경기도의회 ○○위원회

## [질의서 목록]

| 연번 | 주 제 | 소관 | 페이지 |
| --- | --- | --- | --- |
| 1 | (주제) | ○○과 |  |

## 1. (주제)  (소관: ○○과)

□ 질의배경

⚪ (배경·근거)

- (보조 설명)

□ 질의사항

1. (소제목)

⚪ (문제 제기)

- (세부질문 — 끝을 '?'로)

□ 마무리

⚪ (개선방안)

⚪ (자료제출·후속보고 — 끝을 '바람.'으로)

□ 추가 요청자료

- (기간·대상·항목을 특정한 요구자료)
`,
  "현안·정책 검토보고서": `# ○○ 현안 검토보고서

| 구 분 | 내 용 |
| --- | --- |
| 작성일 | 2026. ○. ○. |
| 작 성 | 정책지원관 |

□ 추진배경 및 현황

⚪ (추진 배경과 현재 상황)

- (세부 사실·근거)

□ 문제점

⚪ (핵심 쟁점·문제 제기)

- (세부 문제)

□ 개선방안

⚪ (검토의견·대안)

- (구체 방안)

□ 기대효과 및 향후계획

⚪ (기대효과와 향후 일정)
`,
  "활동·결과 보고서": `# ○○ 결과보고서

| 구 분 | 내 용 |
| --- | --- |
| 일 시 | 2026. ○. ○.(○) |
| 장 소 |  |
| 참 석 |  |

□ 개요

⚪ (행사·출장·회의의 목적과 개요)

□ 추진경과 및 주요내용

⚪ (추진 경과)

- (주요 내용)

□ 결과 및 조치사항

⚪ (결과)

- (조치·후속 사항)

□ 향후계획

⚪ (향후 일정·계획)
`,
};

// 종류별 서식 안내(한 줄)
const GUIDES = {
  "질의서": "질의배경 · 질의사항 · 마무리 · 추가 요청자료",
  "현안·정책 검토보고서": "추진배경·현황 · 문제점 · 개선방안 · 기대효과·향후계획",
  "활동·결과 보고서": "개요 · 추진경과·주요내용 · 결과·조치사항 · 향후계획",
};

// ── AI 자동작성(무료 Gemini) 설정 ────────────────────────────────
// 키는 코드에 넣지 않는다. ① 환경변수 GEMINI_API_KEY, 또는 ② 이 폴더의 gemini_key.txt(키 한 줄)에서 읽는다.
// ※ gemini_key.txt 는 절대 드라이브·깃허브에 올리지 말 것(내 컴퓨터에만 둔다).
const GEMINI_MODEL = "gemini-2.5-flash"; // 무료 티어 모델. 나중에 안 되면 이 값만 최신 모델명으로 바꾼다.
function getGeminiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  const f = join(import.meta.dirname, "gemini_key.txt");
  if (existsSync(f)) {
    let s = readFileSync(f, "utf8");
    if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1); // 메모장이 붙이는 BOM 제거
    return s.trim();
  }
  return "";
}

// ── 참고 파일(.hwpx)에서 글자만 뽑기 ──────────────────────────────
// .hwpx = zip. 본문은 Contents/section0.xml… 안의 <hp:t>…</hp:t>에 들어 있다.
// 문단(</hp:p>)마다 줄을 바꾸고 태그를 걷어내 순수 텍스트로 돌려준다(스캔·이미지 한글은 글자 없음).
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

// AI에게 주는 작성 규칙(경기도의회 서식·개조식). 종류별 골격은 요청 때 TEMPLATES로 함께 준다.
const WRITE_SYSTEM = `당신은 경기도의회 정책지원관의 '질의서·보고서 작성 비서'입니다. 결과는 한국어, 개조식으로만 씁니다.

[기호 규칙 — 반드시 지킴]
- 맨 위 첫 줄은 '# 제목' 한 줄.
- 이어서 표지 표: '| 구 분 | 내 용 |' 형식의 표.
- '□ ' = 대제목, '⚪ ' = 단락(핵심 문장), '- ' = 세부 항목, '1. ' = 숫자 소제목.
- 아래 [골격]의 구조와 기호를 그대로 따르고, 내용만 [주제]·[자료]로 채운다.

[작성 원칙]
- 사실·수치를 지어내지 않는다. [자료]에 없으면 만들지 말고, 모르는 값은 ○○ 또는 [확인 필요]로 둔다.
- 점검형 어조(단정적 비난 금지): "~한 것은 아닌지", "확인이 필요함".
- 질의서의 마무리(□ 마무리)에는 ① 개선방안 ② 자료제출 요구 ③ 후속보고 요구를 담고, 자료제출·후속보고 문장은 '바람.'으로 끝낸다.
- 세부질문(-)은 '?'로 끝낸다.

[출력 형식]
- 마크다운 원고 본문만 출력한다. 코드블록으로 감싸거나 '다음은 …입니다' 같은 설명·머리말을 덧붙이지 않는다.`;

const PAGE =`<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>질의서·보고서 작성·변환 작업실</title>
<style>
  body{font-family:'Malgun Gothic',sans-serif;max-width:760px;margin:32px auto;padding:0 16px;color:#222;line-height:1.6}
  h1{font-size:22px;margin-bottom:4px}
  p.sub{color:#666;margin-top:0}
  label{display:block;font-weight:600;margin:18px 0 6px}
  textarea{width:100%;height:340px;box-sizing:border-box;padding:12px;font-size:14px;
    font-family:Consolas,'D2Coding',monospace;border:1px solid #bbb;border-radius:8px;resize:vertical}
  input[type=text],select{padding:8px;font-size:14px;border:1px solid #bbb;border-radius:8px}
  input[type=text]{width:280px}
  .row{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:14px}
  button{background:#1a56db;color:#fff;border:0;border-radius:8px;padding:11px 22px;font-size:15px;cursor:pointer}
  button:hover{background:#1442ad}
  button.ghost{background:#eef2ff;color:#1a56db;border:1px solid #c9d6ff;padding:9px 16px;font-size:14px}
  button.ghost:hover{background:#dfe7ff}
  .file{font-size:14px}
  .guide{color:#666;font-size:13px}
  .hint{background:#f3f6ff;border:1px solid #d6e0ff;border-radius:8px;padding:10px 14px;font-size:13px;color:#334}
  .ai{background:#f6fbf6;border:1px solid #bfe3bf;border-radius:8px;padding:12px 14px;margin-top:14px}
  .ai b{color:#137333}
  .ai .note{color:#666;font-size:12px;margin:4px 0 8px}
  #topic{flex:1;min-width:260px}
  #msg{margin-top:12px;font-size:14px}
  .err{color:#c0241a}.ok{color:#137333}
</style></head>
<body>
  <h1>질의서·보고서 작성·변환 작업실</h1>
  <p class="sub">Claude가 써 준 질의서·보고서 원고를 경기도의회 서식의 한글파일(.hwpx)로 바꿔 드립니다. (인터넷·로그인·AI 불필요, 내 컴퓨터 안에서만 동작)</p>
  <div class="hint">① 종류를 고르고 → ② Claude가 쓴 원고를 붙여넣거나 파일로 불러온 뒤(비어 있으면 <b>빈 양식 넣기</b>로 뼈대부터) → ③ <b>한글파일 만들기</b>를 누르세요.</div>

  <label>① 종류</label>
  <div class="row">
    <select id="type" onchange="onType()">
      <option value="질의서">질의서</option>
      <option value="현안·정책 검토보고서">현안·정책 검토보고서</option>
      <option value="활동·결과 보고서">활동·결과 보고서</option>
    </select>
    <button class="ghost" onclick="insertTemplate()">빈 양식 넣기</button>
    <span id="guide" class="guide"></span>
  </div>

  <div class="ai">
    <b>AI로 초안 만들기 (무료·Gemini)</b>
    <div class="note">주제나 지시를 적고 버튼을 누르면 아래 원고칸이 자동으로 채워집니다. 원고칸에 자료를 붙여넣거나 아래 <b>참고 파일</b>을 첨부하면 그 내용을 함께 참고합니다. (입력·첨부 내용은 구글 서버로 전송되어 처리됩니다)</div>
    <div class="row">
      <input type="text" id="topic" placeholder="예: 학교급식 잔반 처리 예산 집행 점검">
      <button class="ghost" onclick="aiWrite()">AI로 초안 만들기</button>
    </div>
    <div class="row" style="margin-top:8px">
      <span class="file">참고 파일 첨부(.hwpx/.md/.txt, 여러 개 가능): <input type="file" accept=".hwpx,.md,.txt,.markdown" multiple onchange="addRefFiles(this)"></span>
      <button class="ghost" onclick="clearRef()">비우기</button>
    </div>
    <div id="refStatus" class="guide">첨부된 참고 파일 없음</div>
  </div>

  <label>② 원고</label>
  <textarea id="md" placeholder="Claude가 써 준 원고를 여기에 붙여넣으세요. (비어 있으면 위 '빈 양식 넣기'로 뼈대부터 시작할 수 있습니다)"></textarea>

  <div class="row">
    <span class="file">원고 파일 불러오기: <input type="file" accept=".md,.txt,.markdown" onchange="loadFile(this)"></span>
  </div>

  <label>③ 저장할 파일 이름</label>
  <div class="row">
    <input type="text" id="name" placeholder="질의서" value="질의서">
    <span style="color:#666">.hwpx</span>
    <button onclick="convert()">한글파일 만들기</button>
  </div>
  <div id="msg"></div>

<script>
const TEMPLATES = ${JSON.stringify(TEMPLATES)};
const GUIDES = ${JSON.stringify(GUIDES)};
const TYPES = Object.keys(TEMPLATES);

function onType(){
  const t = document.getElementById('type').value;
  document.getElementById('guide').textContent = '서식: ' + (GUIDES[t] || '');
  const n = document.getElementById('name');
  if(!n.value.trim() || TYPES.indexOf(n.value.trim()) >= 0) n.value = t;
}
function insertTemplate(){
  const t = document.getElementById('type').value;
  const ta = document.getElementById('md');
  if(ta.value.trim() && !confirm('현재 원고 내용을 지우고 「' + t + '」 빈 양식으로 바꿀까요?')) return;
  ta.value = TEMPLATES[t] || '';
  const n = document.getElementById('name');
  if(!n.value.trim() || TYPES.indexOf(n.value.trim()) >= 0) n.value = t;
  ta.focus();
}
function loadFile(input){
  const f = input.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = () => {
    document.getElementById('md').value = r.result;
    const n = document.getElementById('name');
    if(!n.value.trim() || TYPES.indexOf(n.value.trim()) >= 0) n.value = f.name.replace(/\\.[^.]+$/,'');
  };
  r.readAsText(f, 'utf-8');
}
async function convert(){
  const md = document.getElementById('md').value;
  let name = (document.getElementById('name').value || '질의서').trim() || '질의서';
  const msg = document.getElementById('msg');
  if(!md.trim()){ msg.className='err'; msg.textContent='원고를 먼저 붙여넣거나 빈 양식을 채워 주세요.'; return; }
  msg.className=''; msg.textContent='변환 중...';
  try{
    const res = await fetch('/convert', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({name, md})});
    if(!res.ok){ msg.className='err'; msg.textContent='변환 실패: ' + (await res.text()); return; }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name.replace(/\\.hwpx?$/i,'') + '.hwpx';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(a.href);
    msg.className='ok'; msg.textContent='완료! 한글파일이 다운로드되었습니다.';
  }catch(e){ msg.className='err'; msg.textContent='오류: ' + e.message; }
}
let refFiles = [];   // 첨부한 참고 파일: [{name, text}]
async function addRefFiles(input){
  const files = [...input.files];
  input.value = '';  // 같은 파일을 다시 붙일 수 있게 초기화
  const status = document.getElementById('refStatus');
  for(const f of files){
    try{
      let text;
      if(f.name.toLowerCase().endsWith('.hwpx')){
        status.className='guide'; status.textContent = f.name + ' 글자 추출 중...';
        const res = await fetch('/extract', {method:'POST', body:f});
        text = await res.text();
        if(!res.ok) throw new Error(text);
      } else {
        text = await f.text();  // .txt/.md 는 그대로 읽음
      }
      refFiles.push({name:f.name, text:(text||'').trim()});
    }catch(e){
      status.className='err'; status.textContent = f.name + ' 첨부 실패: ' + e.message; return;
    }
  }
  renderRef();
}
function renderRef(){
  const status = document.getElementById('refStatus');
  if(!refFiles.length){ status.className='guide'; status.textContent='첨부된 참고 파일 없음'; return; }
  status.className='ok';
  status.textContent = '첨부됨 → ' + refFiles.map(r=>r.name+'('+r.text.length+'자)').join(', ');
}
function clearRef(){ refFiles=[]; renderRef(); }
function buildSource(){   // 첨부 파일 + 원고칸 내용을 하나의 참고자료로 합침
  const parts = [];
  for(const r of refFiles) parts.push('【참고파일: '+r.name+'】\\n'+r.text);
  const ta = document.getElementById('md').value.trim();
  if(ta) parts.push('【현재 원고칸】\\n'+ta);
  return parts.join('\\n\\n');
}
async function aiWrite(){
  const type = document.getElementById('type').value;
  const topic = document.getElementById('topic').value.trim();
  const ta = document.getElementById('md');
  const msg = document.getElementById('msg');
  if(!topic){ msg.className='err'; msg.textContent='먼저 주제나 지시를 입력해 주세요.'; return; }
  if(ta.value.trim() && !confirm('현재 원고칸 내용을 AI 초안으로 바꿀까요? (칸에 있던 내용과 첨부 파일은 참고자료로 함께 전달됩니다)')) return;
  msg.className=''; msg.textContent='AI가 초안을 쓰는 중... (보통 10~30초)';
  try{
    const res = await fetch('/write', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({type, topic, source: buildSource()})});
    const text = await res.text();
    if(!res.ok){
      if(text==='NO_KEY'){ msg.className='err'; msg.innerHTML='아직 Gemini 키가 없습니다. 폴더에 <b>gemini_key.txt</b> 파일을 만들어 무료 키를 넣어 주세요(발급 방법은 시작하기.md 참고).'; return; }
      msg.className='err'; msg.textContent='AI 오류: ' + text; return;
    }
    ta.value = text;
    const n = document.getElementById('name');
    if(!n.value.trim() || TYPES.indexOf(n.value.trim()) >= 0) n.value = type;
    msg.className='ok'; msg.textContent='AI 초안이 채워졌습니다. 내용을 꼭 확인·수정한 뒤 [한글파일 만들기]를 누르세요.';
  }catch(e){ msg.className='err'; msg.textContent='오류: ' + e.message; }
}
onType();
</script>
</body></html>`;

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(PAGE);
    return;
  }
  if (req.method === "POST" && req.url.startsWith("/write")) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    let type = "질의서", topic = "", source = "";
    try {
      const j = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      type = j.type || "질의서";
      topic = (j.topic || "").slice(0, 20000);
      source = (j.source || "").slice(0, 40000);
    } catch { /* 빈 요청은 아래에서 걸러진다 */ }
    if (!TEMPLATES[type]) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("알 수 없는 종류입니다."); return;
    }
    if (!topic.trim()) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("주제를 입력해 주세요."); return;
    }
    const key = getGeminiKey();
    if (!key) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("NO_KEY"); return;
    }
    try {
      const prompt = `[종류] ${type}\n\n[골격 — 이 구조·기호를 그대로 따르세요]\n${TEMPLATES[type]}\n\n[주제]\n${topic}\n\n[자료]\n${source.trim() || "(제공된 자료 없음 — 자료가 필요한 값은 ○○ 또는 [확인 필요]로 두세요)"}`;
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
        res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(`Gemini 오류(${r.status}). 키·모델명을 확인해 주세요. ${t.slice(0, 300)}`); return;
      }
      const data = await r.json();
      let text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
      text = text.replace(/^```[a-z]*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
      if (!text) {
        res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("생성 결과가 비어 있습니다. 잠시 후 다시 시도해 주세요."); return;
      }
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(text); return;
    } catch (e) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("호출 실패: " + String(e && e.message || e)); return;
    }
  }
  if (req.method === "POST" && req.url.startsWith("/extract")) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    try {
      const text = extractHwpxText(Buffer.concat(chunks));
      if (!text.trim()) {
        res.writeHead(422, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("글자를 찾지 못했습니다(스캔·이미지로 된 한글파일일 수 있습니다)."); return;
      }
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(text.slice(0, 100000)); return; // 참고자료는 10만 자까지만
    } catch (e) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("한글파일(.hwpx)을 읽지 못했습니다: " + String(e && e.message || e)); return;
    }
  }
  if (req.method === "POST" && req.url.startsWith("/convert")) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks).toString("utf8");
    let name = "질의서", md = "";
    try { const j = JSON.parse(body); name = (j.name || "질의서").trim() || "질의서"; md = j.md || ""; }
    catch { md = body; }
    if (!md.trim()) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("원고가 비어 있습니다."); return;
    }
    try {
      const buf = await buildHwpx(md);
      const fname = encodeURIComponent(name.replace(/\.hwpx?$/i, "")) + ".hwpx";
      res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${fname}`,
      });
      res.end(buf); return;
    } catch (e) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(String(e && e.message || e)); return;
    }
  }
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("not found");
});

// 성공적으로 켜진 포트만 안내한다(실제 바인딩된 포트 기준).
server.once("listening", () => {
  const { port } = server.address();
  console.log(`질의서·보고서 작업실 켜짐 → http://localhost:${port}`);
  console.log(getGeminiKey() ? "AI 자동작성: 준비됨(Gemini 키 인식)" : "AI 자동작성: 키 없음 → gemini_key.txt 를 만들면 켜집니다");
  console.log("브라우저에서 위 주소를 여세요. 끄려면 이 창에서 Ctrl+C");
});

// 비어 있는 포트를 차례로 시도해서 켠다(이미 쓰는 포트면 다음 것으로).
function start(i = 0) {
  if (i >= PORTS.length) {
    console.error("빈 포트를 찾지 못했습니다. 다른 프로그램을 끄고 다시 시도하세요.");
    process.exit(1);
  }
  const port = PORTS[i];
  server.once("error", (e) => {
    if (e.code === "EADDRINUSE") { console.log(`포트 ${port} 사용 중 → 다음 포트 시도`); start(i + 1); }
    else { console.error(e.message); process.exit(1); }
  });
  server.listen(port);
}
start();
