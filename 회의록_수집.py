# 회의록 수집 — 경기도의회 회의록시스템(kms.ggc.go.kr) 의원별 발언 목록·링크 수집
# 사용법:
#   python 회의록_수집.py 의원명              → 12대(현 대수)에서 검색·수집
#   python 회의록_수집.py 의원명 --daesu 11   → 11대에서 검색·수집
#   python 회의록_수집.py --목록 [--daesu 12] → 해당 대수 의원 명단만 출력
# 저장: 03_대장/회의록_의원명.json (기존 파일과 병합, mntsId 기준 중복 제거)
import argparse, datetime, json, re, sys
from pathlib import Path

import requests

sys.stdout.reconfigure(encoding="utf-8")

BASE = Path(__file__).parent
OUT_DIR = BASE / "03_대장"
HOST = "https://kms.ggc.go.kr"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0"}
PAGE_SIZE = 15  # MntsMbrList.do 페이지당 건수

# 회의명 키워드 → 대장 '의회활동' 유형 분류
TYPE_RULES = [
    ("행정사무감사", "행정사무감사"),
    ("5분자유발언", "5분자유발언"),
    ("본회의", "본회의"),
    ("예산결산", "예산심사"),
    ("특별위원회", "특별위원회"),
    ("인사청문", "인사청문회"),
]


def fetch_members(daesu):
    """의원별 회의록 페이지에서 해당 대수의 (의원명, spkrId) 목록을 얻는다."""
    r = requests.post(f"{HOST}/svc/cms/mnts/MntsMbr.do", data={"schVar01": daesu},
                      headers=HEADERS, timeout=30)
    r.raise_for_status()
    found = re.findall(r"goMntsMbrPage\('([^']+)','([^']+)'\)", r.text)
    # 페이지 하단에 다른 대수 링크가 섞일 수 있어 중복만 제거하고 순서 유지
    seen, members = set(), []
    for name, spkr_id in found:
        if spkr_id not in seen:
            seen.add(spkr_id)
            members.append((name, spkr_id))
    return members


def fetch_speech_page(daesu, name, spkr_id, page_no):
    """의원별 회의록 목록 1페이지를 가져와 (총건수, 발언목록) 반환."""
    data = {
        "schVar01": daesu, "schVar07": name, "schVar08": spkr_id,
        "schVar02": "", "schVar03": 0, "schVar04": 0, "schVar05": 0, "schVar06": 0,
        "schVar09": "", "schVar10": "", "schVar11": "", "schVar12": 0,
        "schFirstIndex": 0, "schLastIndex": 0, "schStartNo": 0, "schPageNo": page_no,
    }
    r = requests.post(f"{HOST}/svc/cms/mnts/MntsMbrList.do", data=data,
                      headers=HEADERS, timeout=30)
    r.raise_for_status()
    m = re.search(r'name="schTotalCnt"\s+value="(\d+)"', r.text)
    total = int(m.group(1)) if m else 0
    items = []
    for mnts_id, spkr, title in re.findall(
            r'href="/cms/mntsMbrSmplViewer\.do\?mntsId=(\d+)&amp;spkrId=([^"#]+)#pos1"[^>]*>\s*([^<]+?)\s*</a>',
            r.text):
        d = re.search(r"(\d{4})\.(\d{2})\.(\d{2})", title)
        date = "-".join(d.groups()) if d else ""
        mtype = next((t for kw, t in TYPE_RULES if kw in title), "상임위질의")
        items.append({
            "mntsId": mnts_id,
            "일자": date,
            "회의명": title,
            "유형": mtype,
            "링크": f"{HOST}/cms/mntsMbrSmplViewer.do?mntsId={mnts_id}&spkrId={spkr}#pos1",
        })
    return total, items


def collect(name, daesu):
    members = fetch_members(daesu)
    match = [(n, i) for n, i in members if n == name]
    if not match:
        similar = [n for n, _ in members if name in n or n in name]
        print(f"[!] 제{daesu}대에서 '{name}' 의원을 찾지 못했습니다.")
        if similar:
            print(f"    비슷한 이름: {', '.join(similar)}")
        print(f"    전체 명단은 --목록 옵션으로 확인하세요.")
        return None
    name, spkr_id = match[0]

    total, items = fetch_speech_page(daesu, name, spkr_id, 1)
    print(f"{name} 의원({spkr_id}, 제{daesu}대) — 발언 회의록 총 {total}건")
    pages = -(-total // PAGE_SIZE)
    for p in range(2, pages + 1):
        _, more = fetch_speech_page(daesu, name, spkr_id, p)
        items += more
        print(f"  {p}/{pages} 페이지 수집… (누적 {len(items)}건)")

    out = OUT_DIR / f"회의록_{name}.json"
    old = {}
    if out.exists():
        old = {e["mntsId"]: e for e in json.loads(out.read_text(encoding="utf-8")).get("발언목록", [])}
    merged = {**old, **{e["mntsId"]: e for e in items}}
    speeches = sorted(merged.values(), key=lambda e: (e["일자"], e["mntsId"]), reverse=True)
    doc = {
        "의원명": name,
        "spkrId": spkr_id,
        "대수": daesu,
        "수집일시": datetime.datetime.now().isoformat(timespec="seconds"),
        "출처": f"{HOST}/svc/cms/mnts/MntsMbr.do",
        "총건수": len(speeches),
        "발언목록": speeches,
    }
    out.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    new_cnt = len(merged) - len(old)
    print(f"저장 완료: {out}  (신규 {new_cnt}건, 누적 {len(speeches)}건)")
    return doc


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="경기도의회 의원별 회의록(발언) 수집")
    ap.add_argument("의원명", nargs="?", help="수집할 의원 이름")
    ap.add_argument("--daesu", type=int, default=12, help="대수 (기본 12)")
    ap.add_argument("--목록", action="store_true", help="해당 대수 의원 명단 출력")
    a = ap.parse_args()
    if a.목록:
        for n, i in fetch_members(a.daesu):
            print(f"{n}\t{i}")
    elif a.의원명:
        collect(a.의원명, a.daesu)
    else:
        ap.print_help()
