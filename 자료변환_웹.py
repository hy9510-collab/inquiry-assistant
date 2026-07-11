# 의정활동 비서 — 자료변환 웹앱
# 브라우저에서 파일·링크·메모를 넣으면 Gemini가 정리해 hwpx/xlsx/pptx/pdf/docx로 내려준다.
# 실행:  python 자료변환_웹.py   →  http://127.0.0.1:8765 자동 열림
#   (Gemini API 키는 05_자료변환/설정.txt 의 GEMINI_API_KEY 에 넣는다)
import sys, threading, webbrowser, traceback
from pathlib import Path

BASE = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE))
from flask import Flask, request, jsonify, send_from_directory, Response
from 자료변환 import 추출, 정리, 출력

OUT_DIR = BASE / "05_자료변환" / "출력"
OUT_DIR.mkdir(parents=True, exist_ok=True)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 60 * 1024 * 1024  # 60MB


def _one(fmt, source_name, *, media=None, mime=None, raw=None, note=""):
    """단일 자료를 정리→생성. 결과 dict 반환."""
    want = fmt if fmt != "auto" else None
    if media is not None:
        doc = 정리.organize_media(media, mime, source_name, want, note=note)
    else:
        doc = 정리.organize_text(raw, source_name, want, note=note)
    out = 출력.generate(doc, None if fmt == "auto" else fmt, OUT_DIR)
    return {
        "source": source_name, "제목": doc["제목"], "성격": doc.get("성격", ""),
        "형식": out.suffix.lstrip("."), "요약": doc.get("요약", []),
        "섹션수": len(doc.get("섹션", [])), "file": out.name,
    }


@app.get("/")
def home():
    key, model = 정리.load_key()
    return Response(PAGE.replace("__KEY__", "1" if key else "").replace("__MODEL__", model),
                    mimetype="text/html")


@app.get("/api/status")
def status():
    key, model = 정리.load_key()
    return jsonify(key=bool(key), model=model)


@app.post("/api/process")
def process():
    fmt = request.form.get("format", "auto")
    combine = request.form.get("combine") == "1"
    note = request.form.get("note", "").strip()
    url = request.form.get("url", "").strip()
    text = request.form.get("text", "").strip()
    files = request.files.getlist("files")
    results, errors = [], []
    text_sources = []   # (name, raw)  ← 합치기 대상
    media_jobs = []     # (name, bytes, mime)

    # 1) 입력 수집
    for f in files:
        data = f.read()
        if not data:
            continue
        if 추출.is_media(f.filename):
            media_jobs.append((f.filename, data, 추출.mime_of(f.filename)))
        else:
            try:
                text_sources.append((f.filename, 추출.extract_bytes(f.filename, data)))
            except Exception as e:
                errors.append(f"{f.filename}: 추출 실패 — {e}")
    if url:
        try:
            if 추출.is_youtube(url):
                text_sources.append((url, 추출.from_youtube(url)))
            else:
                text_sources.append((url, 추출.from_url(url)))
        except Exception as e:
            errors.append(f"{url}: 링크 읽기 실패 — {e}")
    if text:
        text_sources.append(("메모", text))

    if not text_sources and not media_jobs:
        return jsonify(results=[], errors=["넣은 자료가 없습니다. 파일·링크·텍스트 중 하나를 넣어주세요."])

    # 2) 정리·생성
    try:
        if combine and text_sources:
            merged = "\n\n".join(f"===== [{n}] =====\n{t}" for n, t in text_sources)
            results.append(_one(fmt, "통합 정리", raw=merged, note=note))
        else:
            for name, raw in text_sources:
                try:
                    results.append(_one(fmt, name, raw=raw, note=note))
                except Exception as e:
                    errors.append(f"{name}: {e}")
        for name, data, mime in media_jobs:
            try:
                results.append(_one(fmt, name, media=data, mime=mime, note=note))
            except Exception as e:
                errors.append(f"{name}: {e}")
    except 정리.GeminiError as e:
        errors.append(str(e))
    except Exception as e:
        traceback.print_exc()
        errors.append(f"처리 오류: {e}")
    return jsonify(results=results, errors=errors)


@app.get("/download/<path:name>")
def download(name):
    return send_from_directory(OUT_DIR, name, as_attachment=True)


PAGE = r"""<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>자료변환 — 의정활동 비서</title><style>
:root{--navy:#1f3864;--bg:#f4f6fa;--line:#dde3ee;--acc:#3d6cb9}
*{box-sizing:border-box}body{font-family:'Malgun Gothic','맑은 고딕',sans-serif;margin:0;background:var(--bg);color:#222}
header{background:var(--navy);color:#fff;padding:16px 24px}
header h1{margin:0;font-size:20px}header .sub{font-size:12px;opacity:.85;margin-top:3px}
.wrap{max-width:900px;margin:0 auto;padding:22px}
.panel{background:#fff;border:1px solid var(--line);border-radius:12px;padding:20px;margin-bottom:16px}
.panel h2{margin:0 0 12px;font-size:16px;color:var(--navy)}
#drop{border:2px dashed #b9c4db;border-radius:12px;padding:34px;text-align:center;color:#667;cursor:pointer;transition:.15s}
#drop.over{background:#eef2fb;border-color:var(--acc);color:var(--navy)}
#flist{margin:10px 0 0;font-size:13px}#flist div{padding:4px 0;color:#334}
textarea,input[type=url]{width:100%;padding:10px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit}
textarea{min-height:90px;resize:vertical}
.row{display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-top:6px}
label.fld{font-size:13px;color:#445;display:block;margin:12px 0 5px;font-weight:600}
select{padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit}
.btn{background:var(--navy);color:#fff;border:0;border-radius:8px;padding:12px 22px;font-size:15px;cursor:pointer}
.btn:disabled{opacity:.5;cursor:default}
.chk{font-size:13px;color:#445;display:flex;align-items:center;gap:6px}
.warn{background:#fff3d6;border:1px solid #f0d48a;color:#7a5a10;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:14px}
.res{border:1px solid var(--line);border-radius:10px;padding:14px;margin-bottom:10px}
.res .t{font-weight:700;color:var(--navy);font-size:14px}
.res .m{font-size:12px;color:#778;margin:3px 0 8px}
.res ul{margin:6px 0;padding-left:18px;font-size:13px}
.res a.dl{display:inline-block;background:#e8eefb;color:var(--navy);text-decoration:none;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:600}
.err{background:#fde3e3;border:1px solid #f0b4b4;color:#a12626;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:8px;white-space:pre-wrap}
.badge{display:inline-block;background:#eef2fa;color:var(--navy);border-radius:10px;padding:2px 9px;font-size:11px;margin-left:6px}
#spin{display:none;text-align:center;color:#667;padding:14px;font-size:14px}
footer{font-size:11px;color:#889;text-align:center;padding:14px}
</style></head><body>
<header><h1>자료변환</h1><div class="sub">경기도의회 문화체육관광위원회 ｜ 정책지원관 · 자료를 넣으면 Gemini가 정리해 문서로 내려줍니다</div></header>
<div class="wrap">
  <div id="nokey" class="warn" style="display:none">
    ⚠ Gemini API 키가 설정되지 않았습니다. <b>05_자료변환/설정.txt</b> 파일에
    <code>GEMINI_API_KEY=발급받은키</code> 를 넣고 새로고침하세요.
    (키 발급: https://aistudio.google.com/apikey)
  </div>
  <div class="panel">
    <h2>1. 자료 넣기</h2>
    <div id="drop">📎 파일을 여기에 끌어다 놓거나 클릭해서 선택<br>
      <small>hwpx · 엑셀 · ppt · pdf · docx · txt · 이미지 · 음성/동영상(19MB↓)</small></div>
    <input id="file" type="file" multiple style="display:none">
    <div id="flist"></div>
    <label class="fld">링크(웹페이지 주소) — 선택</label>
    <input id="url" type="url" placeholder="https://www.ggc.go.kr/...">
    <label class="fld">직접 입력(정리할 원문) — 선택</label>
    <textarea id="text" placeholder="회의 내용, 기사 본문 등 정리할 원문을 붙여넣기… (지시가 아니라 '내용'을 넣는 칸)"></textarea>
  </div>
  <div class="panel">
    <h2>2. 출력 설정</h2>
    <label class="fld">요청사항 — 어떻게 정리할지 (선택)</label>
    <input id="note" type="text" placeholder="예: 3줄로 요약 / 표 위주로 / 핵심 쟁점만 / 발표용으로 / 존댓말로">
    <div style="height:8px"></div>
    <div class="row">
      <div><label class="fld" style="margin:0 0 5px">출력 형식</label>
        <select id="format">
          <option value="auto">자동(성격에 맞게 Gemini가 선택)</option>
          <option value="hwpx">한글 hwpx (보고서·공문)</option>
          <option value="xlsx">엑셀 xlsx (표·명단·데이터)</option>
          <option value="pptx">파워포인트 pptx (발표자료)</option>
          <option value="pdf">PDF (배포·인쇄)</option>
          <option value="docx">워드 docx</option>
        </select></div>
      <label class="chk" style="margin-top:22px"><input type="checkbox" id="combine"> 여러 자료를 하나로 합치기</label>
    </div>
    <div class="row" style="margin-top:16px">
      <button class="btn" id="go">정리해서 만들기 →</button>
    </div>
  </div>
  <div id="spin">⏳ Gemini가 정리하는 중입니다… (자료 양에 따라 10~40초)</div>
  <div id="out"></div>
</div>
<footer>원본은 로컬에만 저장됩니다 ｜ 결과물: 05_자료변환/출력/ ｜ 민원인 등 개인정보는 비식별 처리</footer>
<script>
const $=s=>document.querySelector(s);
let picked=[];
const drop=$("#drop"),fileInput=$("#file");
drop.onclick=()=>fileInput.click();
fileInput.onchange=e=>{addFiles(e.target.files);fileInput.value=""};
["dragover","dragenter"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add("over")}));
["dragleave","drop"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove("over")}));
drop.addEventListener("drop",e=>addFiles(e.dataTransfer.files));
function addFiles(fl){for(const f of fl)picked.push(f);render()}
function render(){$("#flist").innerHTML=picked.map((f,i)=>
  '<div>📄 '+f.name+' <span class="badge">'+(f.size/1024|0)+' KB</span> '+
  '<a href="#" onclick="rm('+i+');return false" style="color:#a12626;text-decoration:none">✕</a></div>').join("")}
function rm(i){picked.splice(i,1);render()}
fetch("/api/status").then(r=>r.json()).then(s=>{if(!s.key)$("#nokey").style.display="block"});

$("#go").onclick=async()=>{
  const fd=new FormData();
  picked.forEach(f=>fd.append("files",f));
  fd.append("url",$("#url").value);
  fd.append("text",$("#text").value);
  fd.append("note",$("#note").value);
  fd.append("format",$("#format").value);
  fd.append("combine",$("#combine").checked?"1":"0");
  $("#go").disabled=true;$("#spin").style.display="block";$("#out").innerHTML="";
  try{
    const r=await fetch("/api/process",{method:"POST",body:fd});
    const j=await r.json();
    let h="";
    (j.errors||[]).forEach(e=>h+='<div class="err">'+esc(e)+'</div>');
    (j.results||[]).forEach(x=>{
      h+='<div class="res"><div class="t">'+esc(x.제목)+'<span class="badge">'+esc(x.형식)+'</span>'+
         (x.성격?'<span class="badge">'+esc(x.성격)+'</span>':'')+'</div>'+
         '<div class="m">출처: '+esc(x.source)+' ｜ 섹션 '+x.섹션수+'개</div>'+
         (x.요약&&x.요약.length?'<ul>'+x.요약.map(s=>'<li>'+esc(s)+'</li>').join("")+'</ul>':'')+
         '<a class="dl" href="/download/'+encodeURIComponent(x.file)+'">⬇ '+esc(x.file)+'</a></div>';
    });
    $("#out").innerHTML=h||'<div class="err">결과가 없습니다.</div>';
  }catch(e){$("#out").innerHTML='<div class="err">요청 실패: '+esc(e.message)+'</div>'}
  $("#go").disabled=false;$("#spin").style.display="none";
};
function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}
</script></body></html>"""


def _open():
    webbrowser.open("http://127.0.0.1:8765")


if __name__ == "__main__":
    threading.Timer(1.0, _open).start()
    print("자료변환 웹앱 실행 중 →  http://127.0.0.1:8765  (종료: Ctrl+C)")
    app.run(host="127.0.0.1", port=8765, debug=False)
