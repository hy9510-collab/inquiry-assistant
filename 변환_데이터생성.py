# 웹 데이터 변환 — 03_대장/의정활동대장.xlsx → 웹사이트용 JSON
# 사용법: python 변환_데이터생성.py
# 출력:
#   data/public.json — 공개 데이터 (공약이행, 의회활동 + 회의록시스템 발언 보충)
#   api/_data.js     — 내부 데이터 (민원처리, 보도홍보, 일정과제)
#                      서버리스 함수 번들에만 포함되고 정적 파일로는 서빙되지 않음
# 원칙: xlsx 원본은 깃에 올리지 않는다. 이 스크립트의 출력만 커밋한다.
import datetime, json, sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
BASE = Path(__file__).parent
sys.path.insert(0, str(BASE))
from 대시보드_생성 import read  # 원본 하나: 03_대장/의정활동대장.xlsx


def minutes_extra(acts):
    """회의록_수집.py가 저장한 JSON에서, 의회활동 시트에 없는 발언 기록을 행으로 보충."""
    known = {(r[0], r[1]) for r in acts["rows"]}
    extra = []
    for f in sorted((BASE / "03_대장").glob("회의록_*.json")):
        doc = json.loads(f.read_text(encoding="utf-8"))
        for e in doc["발언목록"]:
            if (doc["의원명"], e["일자"]) not in known:
                extra.append([doc["의원명"], e["일자"], e["유형"], e["회의명"], "",
                              "회의록시스템 발언 기록", "", e["링크"], ""])
    return extra


def main():
    data = read()
    acts = data["의회활동"]
    acts = {"headers": acts["headers"], "rows": acts["rows"] + minutes_extra(acts)}
    stamp = datetime.date.today().isoformat()

    public = {"생성일": stamp, "공약이행": data["공약이행"], "의회활동": acts}
    internal = {"생성일": stamp, "민원처리": data["민원처리"],
                "보도홍보": data["보도홍보"], "일정과제": data["일정과제"]}

    (BASE / "data").mkdir(exist_ok=True)
    out_pub = BASE / "data" / "public.json"
    out_pub.write_text(json.dumps(public, ensure_ascii=False), encoding="utf-8")
    (BASE / "api").mkdir(exist_ok=True)
    out_int = BASE / "api" / "_data.js"
    out_int.write_text("// 자동 생성 — 변환_데이터생성.py 실행으로 갱신. 직접 수정 금지.\n"
                       "module.exports = " + json.dumps(internal, ensure_ascii=False) + ";\n",
                       encoding="utf-8")
    n = lambda d, k: len(d[k]["rows"])
    print(f"생성 완료: {out_pub}  (공약 {n(public,'공약이행')}건, 의회활동 {n(public,'의회활동')}건)")
    print(f"생성 완료: {out_int}  (민원 {n(internal,'민원처리')}건, 보도 {n(internal,'보도홍보')}건, 일정 {n(internal,'일정과제')}건)")


if __name__ == "__main__":
    main()
