// 질의서 마크다운 → 양식 서식 적용 HWPX 빌더 (CLI)
// 사용: node build.mjs <입력.md> <출력.hwpx>
// 실제 변환은 lib/buildHwpx.mjs가 담당(웹서버 server.mjs와 공유).
import { readFileSync, writeFileSync } from "node:fs";
import { buildHwpx } from "./lib/buildHwpx.mjs";

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) { console.error("usage: node build.mjs <in.md> <out.hwpx>"); process.exit(1); }

const md = readFileSync(inPath, "utf8");
const buf = await buildHwpx(md);
writeFileSync(outPath, buf);
console.log("built:", outPath);
