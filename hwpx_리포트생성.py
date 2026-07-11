# hwpx 리포트 생성기 — 03_대장 데이터로 회차별(월간) 리포트 hwpx 생성
# 사용법:
#   python hwpx_리포트생성.py 의원명 2026-07   → 04_리포트/리포트_202607_의원명.hwpx
#   python hwpx_리포트생성.py --템플릿          → 04_리포트/템플릿.hwpx (재)생성
# 원리: 템플릿.hwpx(OWPML zip)의 본문 XML(Contents/section0.xml)에서 {{토큰}}을 치환.
#   - {{의원명}} {{연월}} {{생성일}} : 문단 내 텍스트 치환
#   - {{요약}} {{공약}} {{민원}} {{의회활동}} {{일정}} : 토큰이 든 문단을 복제해
#     여러 줄로 치환 (문단 모양은 템플릿의 해당 문단을 그대로 따름)
#   한글에서 직접 꾸민 템플릿으로 교체해도 토큰만 유지하면 동작한다.
import datetime, re, shutil, sys, zipfile
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

BASE = Path(__file__).parent
sys.path.insert(0, str(BASE))
from 대시보드_생성 import read  # 원본 하나: 03_대장/의정활동대장.xlsx

TEMPLATE = BASE / "04_리포트" / "템플릿.hwpx"


# ── 1. 템플릿 hwpx 생성 (OWPML 최소 구성) ─────────────────────────────
def _fontfaces():
    langs = ["HANGUL", "LATIN", "HANJA", "JAPANESE", "OTHER", "SYMBOL", "USER"]
    face = ('<hh:fontface lang="{l}" fontCnt="1"><hh:font id="0" face="함초롬바탕" type="TTF" isEmbedded="0">'
            '<hh:typeInfo familyType="FCAT_GOTHIC" weight="6" proportion="4" contrast="0" strokeVariation="1"'
            ' armStyle="1" letterform="1" midline="1" xHeight="1"/></hh:font></hh:fontface>')
    return f'<hh:fontfaces itemCnt="7">{"".join(face.format(l=l) for l in langs)}</hh:fontfaces>'


def _border_fill(bid):
    edge = '<hh:{e}Border type="NONE" width="0.1 mm" color="#000000"/>'
    return (f'<hh:borderFill id="{bid}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">'
            '<hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>'
            + "".join(edge.format(e=e) for e in ["left", "right", "top", "bottom"])
            + '<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/></hh:borderFill>')


def _char_pr(cid, height, color="#000000", bold=False):
    seven = 'hangul="{v}" latin="{v}" hanja="{v}" japanese="{v}" other="{v}" symbol="{v}" user="{v}"'
    return (f'<hh:charPr id="{cid}" height="{height}" textColor="{color}" shadeColor="none" useFontSpace="0"'
            ' useKerning="0" symMark="NONE" borderFillIDRef="2">'
            f'<hh:fontRef {seven.format(v=0)}/><hh:ratio {seven.format(v=100)}/><hh:spacing {seven.format(v=0)}/>'
            f'<hh:relSz {seven.format(v=100)}/><hh:offset {seven.format(v=0)}/>'
            + ("<hh:bold/>" if bold else "") + "</hh:charPr>")


def _para_pr(pid, align="JUSTIFY", prev=0):
    return (f'<hh:paraPr id="{pid}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1"'
            ' suppressLineNumbers="0" checked="0">'
            f'<hh:align horizontal="{align}" vertical="BASELINE"/>'
            '<hh:heading type="NONE" idRef="0" level="0"/>'
            '<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0"'
            ' keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>'
            '<hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/>'
            f'<hc:right value="0" unit="HWPUNIT"/><hc:prev value="{prev}" unit="HWPUNIT"/>'
            '<hc:next value="0" unit="HWPUNIT"/></hh:margin>'
            '<hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/>'
            '<hh:border borderFillIDRef="2" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0"'
            ' connect="0" ignoreMargin="0"/><hh:autoSpacing eAsianEng="0" eAsianNum="0"/></hh:paraPr>')


HEADER_XML = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml2011/head"'
    ' xmlns:hc="http://www.hancom.co.kr/hwpml2011/core" version="1.4" secCnt="1">'
    '<hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>'
    '<hh:refList>' + _fontfaces()
    + f'<hh:borderFills itemCnt="2">{_border_fill(1)}{_border_fill(2)}</hh:borderFills>'
    # charPr — 0:본문 10pt / 1:제목 16pt 남색 굵게 / 2:소제목 12pt 남색 굵게 / 3:작은글씨 8.5pt 회색 / 4:본문 굵게
    + ('<hh:charProperties itemCnt="5">'
       + _char_pr(0, 1000) + _char_pr(1, 1600, "#1F3864", True) + _char_pr(2, 1200, "#1F3864", True)
       + _char_pr(3, 850, "#666666") + _char_pr(4, 1000, bold=True) + "</hh:charProperties>")
    + '<hh:tabProperties itemCnt="1"><hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/></hh:tabProperties>'
    # paraPr — 0:본문 / 1:가운데 / 2:소제목(앞 여백)
    + ('<hh:paraProperties itemCnt="3">'
       + _para_pr(0) + _para_pr(1, align="CENTER") + _para_pr(2, align="LEFT", prev=600) + "</hh:paraProperties>")
    + ('<hh:styles itemCnt="1"><hh:style id="0" type="PARA" name="바탕글" engName="Normal"'
       ' paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/></hh:styles>')
    + "</hh:refList></hh:head>")

_PID = 0
def _p(text, char=0, para=0, sec_pr=""):
    global _PID
    _PID += 1
    return (f'<hp:p id="{_PID}" paraPrIDRef="{para}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">'
            f'<hp:run charPrIDRef="{char}">{sec_pr}<hp:t>{text}</hp:t></hp:run></hp:p>')

SEC_PR = ('<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000"'
    ' tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0">'
    '<hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/>'
    '<hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/>'
    '<hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL"'
    ' fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/>'
    '<hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/>'
    '<hp:pagePr landscape="WIDELY" width="59528" height="84188" gutterType="LEFT_ONLY">'
    '<hp:margin header="4252" footer="4252" gutter="0" left="8504" right="8504" top="5668" bottom="4252"/>'
    '</hp:pagePr></hp:secPr>')


def build_section_xml():
    global _PID
    _PID = 0
    body = [
        _p("의정활동 월간 리포트", char=1, para=1, sec_pr=SEC_PR),
        _p("{{의원명}} 의원 ｜ {{연월}} ｜ 작성: 정책지원관 ｜ 경기도의회 문화체육관광위원회", char=3, para=1),
        _p("", 0, 0),
        _p("1. 이달의 활동 요약", 2, 2), _p("{{요약}}", 0, 0),
        _p("2. 공약 이행 현황", 2, 2), _p("{{공약}}", 0, 0),
        _p("3. 이달 민원 처리(비식별)", 2, 2), _p("{{민원}}", 0, 0),
        _p("4. 의회 활동 상세", 2, 2), _p("{{의회활동}}", 0, 0),
        _p("5. 다음 일정", 2, 2), _p("{{일정}}", 0, 0),
        _p("", 0, 0),
        _p("본 리포트는 의정활동대장 원본에서 생성되었습니다. 생성일 {{생성일}}", 3, 0),
    ]
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml2011/section"'
            ' xmlns:hp="http://www.hancom.co.kr/hwpml2011/paragraph"'
            ' xmlns:hc="http://www.hancom.co.kr/hwpml2011/core">' + "".join(body) + "</hs:sec>")


def write_hwpx(path, section_xml, title="의정활동 리포트", preview=""):
    files = [
        ("mimetype", "application/hwp+zip"),
        ("version.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
         '<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml2011/version" tagetApplication="WORDPROCESSOR"'
         ' major="5" minor="1" micro="1" buildNumber="0" os="1" xmlVersion="1.4"'
         ' application="Hancom Office Hangul" appVersion="11, 0, 0, 1"/>'),
        ("META-INF/manifest.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
         '<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">'
         '<odf:file-entry odf:full-path="/" odf:media-type="application/hwp+zip"/>'
         '<odf:file-entry odf:full-path="Contents/header.xml" odf:media-type="application/xml"/>'
         '<odf:file-entry odf:full-path="Contents/section0.xml" odf:media-type="application/xml"/>'
         '</odf:manifest>'),
        ("META-INF/container.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
         '<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container">'
         '<ocf:rootfiles><ocf:rootfile ocf:full-path="Contents/content.hpf"'
         ' ocf:media-type="application/hwpml-package+xml"/></ocf:rootfiles></ocf:container>'),
        ("Contents/content.hpf", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
         '<opf:package xmlns:opf="http://www.idpf.org/2007/opf/" version="" unique-identifier="" id="">'
         f'<opf:metadata><opf:title>{title}</opf:title><opf:language>ko</opf:language></opf:metadata>'
         '<opf:manifest>'
         '<opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>'
         '<opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>'
         '<opf:item id="settings" href="settings.xml" media-type="application/xml"/></opf:manifest>'
         '<opf:spine><opf:itemref idref="header" linear="yes"/>'
         '<opf:itemref idref="section0" linear="yes"/></opf:spine></opf:package>'),
        ("settings.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
         '<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml2011/app">'
         '<ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/></ha:HWPApplicationSetting>'),
        ("Contents/header.xml", HEADER_XML),
        ("Contents/section0.xml", section_xml),
        ("Preview/PrvText.txt", preview or title),
    ]
    path.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        for name, content in files:
            z.writestr(name, content, zipfile.ZIP_STORED if name == "mimetype" else zipfile.ZIP_DEFLATED)


def make_template(force=False):
    if TEMPLATE.exists() and not force:
        return
    write_hwpx(TEMPLATE, build_section_xml(), "의정활동 리포트 템플릿")
    print(f"템플릿 생성: {TEMPLATE}")


# ── 2. 본문 XML 치환 ──────────────────────────────────────────────────
def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def replace_block(xml, token, lines):
    """{{token}}이 든 문단을 찾아, 그 문단 모양 그대로 lines 개수만큼 복제 치환."""
    m = re.search(r'<hp:p\b[^>]*>(?:(?!</hp:p>).)*\{\{' + token + r'\}\}(?:(?!</hp:p>).)*</hp:p>', xml, re.S)
    if not m:
        return xml
    para = m.group(0)
    attrs = re.match(r"<hp:p\b([^>]*)>", para).group(1)
    attrs = re.sub(r'\s*id="[^"]*"', "", attrs)
    run = re.search(r'<hp:run\b[^>]*charPrIDRef="([^"]*)"', para)
    char = run.group(1) if run else "0"
    if not lines:
        lines = ["기록 없음"]
    global _PID
    out = []
    for ln in lines:
        _PID += 1
        out.append(f'<hp:p id="9{_PID:04d}"{attrs}><hp:run charPrIDRef="{char}"><hp:t>{esc(ln)}</hp:t></hp:run></hp:p>')
    return xml[:m.start()] + "".join(out) + xml[m.end():]


# ── 3. 대장 데이터 → 리포트 본문 구성 ────────────────────────────────
def load_minutes(member, month):
    """회의록_수집.py가 저장한 JSON에서 해당 월 발언 기록을 가져온다."""
    f = BASE / "03_대장" / f"회의록_{member}.json"
    if not f.exists():
        return []
    import json
    return [e for e in json.loads(f.read_text(encoding="utf-8"))["발언목록"] if e["일자"].startswith(month)]


def build_report(member, month):
    data = read()
    pick = lambda s, dc: [r for r in data[s]["rows"] if r[0] == member and str(r[dc]).startswith(month)]
    pl = [r for r in data["공약이행"]["rows"] if r[0] == member]
    acts, mws, prs = pick("의회활동", 1), pick("민원처리", 1), pick("보도홍보", 1)
    mw_all = [r for r in data["민원처리"]["rows"] if r[0] == member]
    pending = sum(1 for r in mw_all if r[6] and r[6] != "회신완료")
    nxt = sorted([r for r in data["일정과제"]["rows"] if r[0][:7] > month], key=lambda r: r[0])[:10]
    minutes = load_minutes(member, month)
    known_dates = {r[1] for r in acts}
    extra = [e for e in minutes if e["일자"] not in known_dates]  # 대장에 없는 발언 기록 보충

    요약 = [
        f"· 의회 활동 {len(acts) + len(extra)}건"
        + (f" ({', '.join(sorted({r[2] for r in acts} | {e['유형'] for e in extra}))})" if acts or extra else ""),
        f"· 민원 접수 {len(mws)}건 (누적 미처리 {pending}건)",
        f"· 언론·홍보 {len(prs)}건",
    ]
    stat = {s: sum(1 for r in pl if r[7] == s) for s in ["완료", "일부이행", "추진중", "구상", "보류"]}
    공약 = ["· " + " / ".join(f"{k} {v}" for k, v in stat.items())] if pl else []
    공약 += [f"· [{r[7]}] {r[2]}" + (f" — {r[8]}" if r[8] else "") + (f" (다음: {r[9]})" if r[9] else "") for r in pl]
    민원 = [f"· {r[1]} [{r[3]}] {str(r[4])[:40]} — {r[6]}" for r in mws]
    의회활동 = [f"· {r[1]} [{r[2]}] {r[3]}" + (f" — 후속: {r[6]}" if r[6] else "") + (f" ({r[7]})" if r[7] else "")
             for r in sorted(acts, key=lambda r: r[1])]
    의회활동 += [f"· {e['일자']} [{e['유형']}] {e['회의명']} — 발언 (출처: {e['링크']})"
             for e in sorted(extra, key=lambda e: e["일자"])]
    일정 = [f"· {r[0]} [{r[1]}] {r[2]}" for r in nxt]

    make_template()
    ym = month.replace("-", "")
    out = BASE / "04_리포트" / f"리포트_{ym}_{member}.hwpx"
    shutil.copy(TEMPLATE, out)
    with zipfile.ZipFile(TEMPLATE) as z:
        names = z.namelist()
        contents = {n: z.read(n) for n in names}
    xml = contents["Contents/section0.xml"].decode("utf-8")
    for tk, v in [("의원명", member), ("연월", month), ("생성일", datetime.date.today().isoformat())]:
        xml = xml.replace("{{" + tk + "}}", esc(v))
    for tk, lines in [("요약", 요약), ("공약", 공약 or ["공약 기록 없음 — 선거공보 기준 입력 예정"]),
                      ("민원", 민원 or ["이달 접수 민원 없음"]), ("의회활동", 의회활동 or ["이달 의회 활동 기록 없음"]),
                      ("일정", 일정 or ["예정 일정 없음"])]:
        xml = replace_block(xml, tk, lines)
    contents["Contents/section0.xml"] = xml.encode("utf-8")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for n in names:
            z.writestr(n, contents[n], zipfile.ZIP_STORED if n == "mimetype" else zipfile.ZIP_DEFLATED)
    print(f"생성 완료: {out}")
    if extra:
        print(f"  * 회의록시스템 발언 {len(extra)}건을 보충했습니다 (대장 의회활동에는 미기재 상태).")
    return out


if __name__ == "__main__":
    if "--템플릿" in sys.argv:
        make_template(force=True)
    elif len(sys.argv) >= 3:
        build_report(sys.argv[1], sys.argv[2])
    else:
        print(__doc__ or "사용법: python hwpx_리포트생성.py 의원명 YYYY-MM  |  --템플릿")
