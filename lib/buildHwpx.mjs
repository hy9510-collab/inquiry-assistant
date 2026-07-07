// 질의서 마크다운 → 양식 서식 적용 HWPX (Buffer 반환)
// build.mjs(CLI)와 server.mjs(웹)가 공유하는 변환 함수.
// 적용: 본문 경기천년바탕(명조·가독성) 15pt · 제목 경기천년제목 Medium 고딕(굵게),
//       □ 구분제목 17pt / 숫자 소제목 15pt, 행간 180%, 자간 0(보통),
//       경기천년체 미설치 PC는 한컴돋움으로 대체(substFont)
import { markdownToHwpx } from "kordoc";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const AdmZip = require("adm-zip");

// 마크다운 원고를 받아 서식이 입혀진 HWPX 바이너리(Buffer)를 돌려준다.
export async function buildHwpx(md) {
  // 1) 마크다운 전처리: □ 제목/숫자 소제목을 **굵게** 처리(숫자 보존 + 식별용)
  const md2 = md.split(/\r?\n/).map((line) => {
    if (/^□\s/.test(line)) return `**${line}**`;
    if (/^\d+\.\s/.test(line)) return `**${line}**`;
    return line;
  }).join("\n");

  const raw = Buffer.from(await markdownToHwpx(md2));

  // 2) HWPX 후처리
  const zip = new AdmZip(raw);
  let header = zip.readAsText("Contents/header.xml");
  let section = zip.readAsText("Contents/section0.xml");

  // 2-0) 표 테두리: 한글은 borderFill을 id 1부터 인식한다(양식도 id=1부터, id=0 없음).
  //   kordoc은 id=0부터 만들어 인덱싱이 어긋나 테두리가 사라진다. id 1·2로 재구성한다.
  //   id 1 = 테두리 없음(문자/문단 기본), id 2 = 사방 검정 실선 0.12mm(표용)
  const bf = (id, t) =>
    `<hh:borderFill id="${id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">` +
    `<hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>` +
    `<hh:leftBorder type="${t}" width="0.12 mm" color="#000000"/><hh:rightBorder type="${t}" width="0.12 mm" color="#000000"/>` +
    `<hh:topBorder type="${t}" width="0.12 mm" color="#000000"/><hh:bottomBorder type="${t}" width="0.12 mm" color="#000000"/>` +
    `<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/></hh:borderFill>`;
  header = header.replace(/<hh:borderFills[\s\S]*?<\/hh:borderFills>/,
    `<hh:borderFills itemCnt="2">${bf(1, "NONE")}${bf(2, "SOLID")}</hh:borderFills>`);

  // 2-1) 글꼴 교체: 본문(id0)=경기천년바탕(명조), 제목(id1·id2)=경기천년제목 Medium(고딕).
  //   경기천년체가 없는 PC에서는 대체 글꼴(substFont)로 한컴돋움을 쓰게 지정한다.
  header = header
    .replace(/face="함초롬바탕"/g, 'face="경기천년바탕"')
    .replace(/face="함초롬돋움"/g, 'face="경기천년제목 Medium"')
    .replace(/face="HY견고딕"/g, 'face="경기천년제목 Medium"')
    .replace(
      /(<hh:font id="\d+" face="경기천년[^"]*" type="TTF" isEmbedded="0">)/g,
      '$1<hh:substFont face="한컴돋움" type="TTF" isEmbedded="0"/>'
    );

  // 2-2) 본문(charPr 0) 크기 10pt → 15pt
  header = header.replace(/<hh:charPr id="0" height="1000"/, '<hh:charPr id="0" height="1500"');

  // 2-2b) 표지 제목(charPr 5)·질의 제목/목록(charPr 6) 굵게 + 계층 보강
  const addBold = (block) => block.includes("<hh:bold/>")
    ? block : block.replace(/(<hh:offset[^>]*\/>)/, "$1<hh:bold/>");
  header = header.replace(/<hh:charPr id="5"[\s\S]*?<\/hh:charPr>/, (m) => addBold(m));
  header = header.replace(/<hh:charPr id="6" height="1400"/, '<hh:charPr id="6" height="1600"')
                 .replace(/<hh:charPr id="6"[\s\S]*?<\/hh:charPr>/, (m) => addBold(m));

  // 2-3) 굵은 제목/소제목 charPr 추가 (id 11: 17pt 굵게, id 12: 15pt 굵게)
  const mkCharPr = (id, h) =>
    `<hh:charPr id="${id}" height="${h}" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="0">` +
    `<hh:fontRef hangul="1" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>` +
    `<hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>` +
    `<hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>` +
    `<hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>` +
    `<hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>` +
    `<hh:bold/></hh:charPr>`;
  header = header
    .replace(/<\/hh:charProperties>/, mkCharPr(11, 1700) + mkCharPr(12, 1500) + "</hh:charProperties>")
    .replace(/<hh:charProperties itemCnt="11">/, '<hh:charProperties itemCnt="13">');

  // 2-5) 문단 여백/들여쓰기/정렬용 paraPr 추가
  //   20 가운데정렬(표지 제목·위원회) / 21 □구분제목(앞 간격 큼) /
  //   22 숫자 소제목(앞 간격) / 23 ⚪단락 / 24 ·세부질문(들여쓰기)
  const basePara = header.match(/<hh:paraPr id="0"[\s\S]*?<\/hh:paraPr>/)[0];
  const mkPara = (id, { align = "JUSTIFY", indent = 0, left = 0, prev = 0, next = 0 } = {}) =>
    basePara
      .replace(/id="0"/, `id="${id}"`)
      .replace(/horizontal="JUSTIFY"/, `horizontal="${align}"`)
      .replace(/<hh:margin[^>]*\/>/, `<hh:margin indent="${indent}" left="${left}" right="0" prev="${prev}" next="${next}"/>`);
  const newParas =
    mkPara(20, { align: "CENTER", next: 200 }) +
    mkPara(21, { prev: 200, next: 300 }) +
    mkPara(22, { prev: 600, next: 150 }) +
    mkPara(23, { prev: 180, next: 60 }) +
    mkPara(24, { left: 620, indent: -620, prev: 30, next: 30 }) +
    mkPara(25, { align: "CENTER" }) +   // 표: 구분·제목 셀(가운데)
    mkPara(26, { align: "LEFT" });      // 표: 내용 셀(왼쪽)
  const paraCnt = Number(header.match(/paraProperties itemCnt="(\d+)"/)[1]);
  header = header
    .replace(/<\/hh:paraProperties>/, newParas + "</hh:paraProperties>")
    .replace(/<hh:paraProperties itemCnt="\d+">/, `<hh:paraProperties itemCnt="${paraCnt + 7}">`);

  // 2-7) 줄 간격 180% 통일 + 자간은 0(보통)으로 두어 빽빽하지 않게(가독성 우선)
  //      + 문자/문단 '테두리 없음' 참조를 새 borderFill id 1로 재매핑
  header = header
    .replace(/<hh:lineSpacing type="PERCENT" value="\d+"\/>/g, '<hh:lineSpacing type="PERCENT" value="180"/>')
    .replace(/borderFillIDRef="0"/g, 'borderFillIDRef="1"');

  // 2-6) 페이지 여백: 위 20 / 아래·좌·우 15 mm (1mm≈283.465 HWPUNIT)
  //   → top 5670, bottom/left/right 4252. 표(155mm)가 본문폭(180mm) 안에 들어간다.
  section = section.replace(
    /<hp:margin header="\d+" footer="\d+" gutter="\d+" left="\d+" right="\d+" top="\d+" bottom="\d+"\/>/,
    '<hp:margin header="2835" footer="2835" gutter="0" left="4252" right="4252" top="5670" bottom="4252"/>');

  // 2-6b) 표 셀 안 여백 확대(빡빡하지 않게) + 표 테두리 참조를 새 borderFill id 2로
  section = section
    .replace(/<hp:cellMargin[^>]*\/>/g, '<hp:cellMargin left="510" right="510" top="200" bottom="200"/>')
    .replace(/borderFillIDRef="1"/g, 'borderFillIDRef="2"');

  // 2-4) 본문 문단 재지정: charPr(굵기/크기) + paraPr(간격/들여쓰기/정렬)
  //   □ 구분 제목 앞에는 빈 문단을 넣어 한 줄 띄운다.
  const emptyP = '<hp:p paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0"><hp:t></hp:t></hp:run></hp:p>';
  section = section.replace(/<hp:p\b[\s\S]*?<\/hp:p>/g, (p) => {
    const text = (p.match(/<hp:t>([\s\S]*?)<\/hp:t>/g) || [])
      .map((x) => x.replace(/<[^>]+>/g, "")).join("");
    const isHeading = /charPrIDRef="[56]"/.test(p);
    // 표지 제목(charPr 5)·위원회 줄 → 가운데정렬
    if (/charPrIDRef="5"/.test(p) || /^경기도의회/.test(text)) {
      return p.replace(/paraPrIDRef="\d+"/g, 'paraPrIDRef="20"');
    }
    let cp = null, pp = null;
    if (/^□\s/.test(text)) { cp = "11"; pp = "21"; }
    else if (/^\d+\.\s/.test(text) && !isHeading) { cp = "12"; pp = "22"; }
    else if (/^⚪/.test(text)) { pp = "23"; }
    else if (/^[·•-]\s/.test(text)) { pp = "24"; }
    if (!cp && !pp) return p;
    if (cp && !isHeading) p = p.replace(/charPrIDRef="[01]"/g, `charPrIDRef="${cp}"`);
    if (pp && !isHeading) p = p.replace(/paraPrIDRef="\d+"/g, `paraPrIDRef="${pp}"`);
    if (/^□\s/.test(text)) return emptyP + p;  // □ 구분 제목 앞 한 줄 띄움
    return p;
  });

  // 2-8) 표: 열 너비를 글자 수에 맞춰 조정 + 정렬(구분/제목=가운데, 내용=왼쪽) + 셀 굵기 해제
  const cellText = (tc) =>
    (tc.match(/<hp:t>([\s\S]*?)<\/hp:t>/g) || []).map((x) => x.replace(/<[^>]+>/g, "")).join("");
  const isWide = (ch) =>
    /[ᄀ-ᇿ⺀-꓏가-힣豈-﫿＀-￯]/.test(ch) || "○◎●□⚪△▲▪◦…·—".includes(ch);
  const textWidth = (s) => {
    let w = 0;
    for (const ch of [...s]) w += ch === " " ? 520 : isWide(ch) ? 1500 : 880; // 전각 15pt / 반각 약 8.8pt
    return w;
  };
  const CELL_PAD = 1020 + 700; // 좌우 셀 여백(510+510) + 여유
  const MIN_COL = 5000, TABLE_MAX = 50000; // 본문폭(약 180mm) 안에서 최대
  section = section.replace(/<hp:tbl\b[\s\S]*?<\/hp:tbl>/g, (tbl) => {
    const info = (tbl.match(/<hp:tc\b[\s\S]*?<\/hp:tc>/g) || []).map((tc) => {
      const a = tc.match(/<hp:cellAddr colAddr="(\d+)" rowAddr="(\d+)"\/>/);
      return { col: a ? +a[1] : 0, row: a ? +a[2] : 0, w: textWidth(cellText(tc)) };
    });
    const colW = {};
    for (const c of info) colW[c.col] = Math.max(MIN_COL, (colW[c.col] || 0), c.w + CELL_PAD);
    const cols = Object.keys(colW).map(Number);
    let total = cols.reduce((s, c) => s + colW[c], 0);
    if (total > TABLE_MAX) { const k = TABLE_MAX / total; for (const c of cols) colW[c] = Math.floor(colW[c] * k); total = cols.reduce((s, c) => s + colW[c], 0); }
    let i = 0;
    return tbl
      .replace(/(<hp:sz width=")\d+(")/, `$1${total}$2`)
      .replace(/<hp:tc\b[\s\S]*?<\/hp:tc>/g, (tc) => {
        const { col, row } = info[i++];
        const align = col === 0 || row === 0 ? "25" : "26";
        return tc
          .replace(/(<hp:cellSz width=")\d+(")/, `$1${colW[col]}$2`)
          .replace(/paraPrIDRef="\d+"/g, `paraPrIDRef="${align}"`)
          .replace(/charPrIDRef="\d+"/g, 'charPrIDRef="0"');
      });
  });

  // 3) 재패키징 (mimetype은 무압축 유지)
  zip.updateFile("Contents/header.xml", Buffer.from(header, "utf8"));
  zip.updateFile("Contents/section0.xml", Buffer.from(section, "utf8"));
  const mt = zip.getEntry("mimetype");
  if (mt) mt.header.method = 0; // STORED
  return zip.toBuffer();
}
