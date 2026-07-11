# 자료변환 — Gemini 연결(정리·구조화)
# 추출한 원문(또는 미디어 파일)을 Gemini에 보내 '정리된 문서 구조(JSON)'를 받는다.
# API 키는 05_자료변환/설정.txt 또는 환경변수 GEMINI_API_KEY 에서 읽는다.
import os, json, base64, re
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
CONFIG = BASE / "05_자료변환" / "설정.txt"
DEFAULT_MODEL = "gemini-2.5-flash"
API = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

# 문서 성격 → 추천 출력형식 (Gemini가 형식을 안 주거나 auto일 때의 기준)
NATURE_TO_FORMAT = {
    "보고서": "hwpx", "공문": "hwpx", "공지": "hwpx", "회의록": "hwpx", "요약": "hwpx",
    "데이터표": "xlsx", "명단": "xlsx", "대장": "xlsx", "통계": "xlsx",
    "발표자료": "pptx", "브리핑": "pptx",
    "배포": "pdf", "인쇄": "pdf",
}

PROMPT = """당신은 경기도의회 문화체육관광위원회 정책지원관의 의정활동 비서입니다.
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
- 내용이 없으면 빈 배열([])로 두고 임의로 지어내지 마십시오.
"""


def _read_config():
    cfg = {}
    if CONFIG.exists():
        for line in CONFIG.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                cfg[k.strip()] = v.strip()
    return cfg


def load_key():
    cfg = _read_config()
    key = os.environ.get("GEMINI_API_KEY") or cfg.get("GEMINI_API_KEY", "")
    model = os.environ.get("GEMINI_MODEL") or cfg.get("GEMINI_MODEL") or DEFAULT_MODEL
    return key.strip(), model.strip()


class GeminiError(RuntimeError):
    pass


def _call(parts, model, key):
    import requests
    body = {
        "contents": [{"parts": parts}],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2},
    }
    r = requests.post(API.format(model=model), params={"key": key},
                      json=body, timeout=180)
    if r.status_code != 200:
        raise GeminiError(f"Gemini API 오류 {r.status_code}: {r.text[:400]}")
    data = r.json()
    try:
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError):
        raise GeminiError(f"Gemini 응답을 해석할 수 없습니다: {json.dumps(data)[:400]}")


def _parse_json(text):
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())  # 혹시 모를 코드펜스 제거
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.S)
        if m:
            return json.loads(m.group(0))
        raise GeminiError("Gemini가 올바른 JSON을 주지 않았습니다.")


def normalize(doc, source_name="", want_format=None):
    doc = dict(doc) if isinstance(doc, dict) else {}
    doc.setdefault("제목", source_name or "정리 결과")
    doc.setdefault("성격", "")
    doc.setdefault("요약", [])
    doc.setdefault("섹션", [])
    doc.setdefault("비고", "")
    fmt = (want_format or "").lower()
    if fmt not in ("hwpx", "xlsx", "pptx", "pdf"):
        fmt = str(doc.get("추천형식", "")).lower()
    if fmt not in ("hwpx", "xlsx", "pptx", "pdf"):
        fmt = NATURE_TO_FORMAT.get(doc.get("성격", ""), "hwpx")
    doc["추천형식"] = fmt
    secs = []
    for s in doc.get("섹션", []):
        if not isinstance(s, dict):
            continue
        s.setdefault("소제목", "")
        s.setdefault("문단", [])
        if not isinstance(s.get("문단"), list):
            s["문단"] = [str(s["문단"])]
        tbl = s.get("표")
        if isinstance(tbl, dict) and tbl.get("행"):
            tbl.setdefault("제목", "")
            tbl.setdefault("헤더", [])
        else:
            s["표"] = None
        secs.append(s)
    doc["섹션"] = secs
    doc["출처"] = source_name
    return doc


def organize_text(raw_text, source_name="", want_format=None, note=""):
    key, model = load_key()
    if not key:
        raise GeminiError("GEMINI_API_KEY가 없습니다. 05_자료변환/설정.txt에 키를 넣어주세요.")
    hint = f"\n\n[자료 출처] {source_name}" if source_name else ""
    ask = f"\n\n[추가 요청사항] {note}" if note else ""
    parts = [{"text": PROMPT + hint + ask + "\n\n[자료 원문]\n" + raw_text[:120000]}]
    doc = _parse_json(_call(parts, model, key))
    return normalize(doc, source_name, want_format)


def organize_media(data: bytes, mime: str, source_name="", want_format=None, note=""):
    """동영상·음성·이미지를 파일 그대로 Gemini에 보내 정리한다(20MB 이하 inline)."""
    key, model = load_key()
    if not key:
        raise GeminiError("GEMINI_API_KEY가 없습니다. 05_자료변환/설정.txt에 키를 넣어주세요.")
    if len(data) > 19 * 1024 * 1024:
        raise GeminiError("현재 미디어는 19MB 이하만 지원합니다. 더 짧게 잘라서 넣어주세요.")
    ask = f"\n[추가 요청사항] {note}" if note else ""
    parts = [
        {"text": PROMPT + f"\n\n[자료 출처] {source_name}{ask}\n\n첨부된 미디어의 내용을 위 스키마로 정리하십시오."},
        {"inline_data": {"mime_type": mime, "data": base64.b64encode(data).decode()}},
    ]
    doc = _parse_json(_call(parts, model, key))
    return normalize(doc, source_name, want_format)
