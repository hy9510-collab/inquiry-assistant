# 의정활동 비서 — 웹페이지

경기도의회 문화체육관광위원회 정책지원관의 의정활동 기록·공유 사이트.
데이터 원본은 `03_대장/의정활동대장.xlsx` 하나이며, 사이트는 변환된 JSON만 읽는다.

## 페이지 구성

| 페이지 | 내용 | 접근 |
|---|---|---|
| `index.html` (공개) | 홈 요약 · 공약 이행 현황 · 의회활동 | 누구나 |
| `internal.html` (내부) | 민원 칸반 · 일정 · 보도 · 월간 공유(인쇄/PDF) | 비밀번호 |

내부 데이터(민원·일정·보도)는 정적 파일이 아니라 서버리스 함수(`api/internal-data`)가
로그인 쿠키를 확인한 뒤에만 반환한다. 민원인 정보는 대장 단계에서 비식별(이니셜·유형만) 처리.

## 데이터 흐름

```
03_대장/의정활동대장.xlsx  (원본 — 깃 제외)
        │  python 변환_데이터생성.py
        ├→ data/public.json   (공개: 공약이행, 의회활동+회의록 발언 보충)
        └→ api/_data.js       (내부: 민원처리, 보도홍보, 일정과제 — 함수 번들 전용)
```

xlsx 원본과 한글·오피스 파일은 `.gitignore`로 깃에서 제외된다.
배포 시에는 `.vercelignore`가 웹 파일(index/internal/data/api) 외 전부를 제외한다.

## 최초 배포 (1회)

1. **GitHub 로그인**: `winget install GitHub.cli` 후 `gh auth login` (브라우저 인증)
2. **private 저장소 생성·푸시**:
   ```
   gh repo create uijeong-web --private --source . --push
   ```
3. **Vercel 연결**: https://vercel.com → Add New → Project → GitHub `uijeong-web` 저장소 Import
   - Framework Preset: **Other**, 설정 변경 없이 Deploy
4. **내부 페이지 비밀번호 설정**: Vercel → Project → Settings → Environment Variables
   - Key `ADMIN_PASSWORD`, Value 원하는 비밀번호 → 저장 후 **Redeploy**
   - 미설정 시 내부 페이지는 아무도 열 수 없다 (안전한 기본값)

## 갱신 절차 (평상시)

1. `03_대장/의정활동대장.xlsx` 수정 (필요 시 `python 회의록_수집.py 의원명`으로 발언 수집)
2. 변환: `python 변환_데이터생성.py`
3. 커밋·푸시:
   ```
   git add -A
   git commit -m "대장 갱신 YYYY-MM-DD"
   git push
   ```
4. 푸시하면 Vercel이 자동 재배포한다 (1~2분 소요)

> 이 PC의 Python 실행: `%LOCALAPPDATA%\Programs\Python\Python312\python.exe`
> (`python` 별칭이 안 먹으면 전체 경로로 실행)

## 비밀번호 변경 / 유출 시

Vercel → Settings → Environment Variables에서 `ADMIN_PASSWORD` 값 변경 → Redeploy.
기존 로그인 쿠키는 즉시 무효화된다 (쿠키가 비밀번호 해시와 일치해야 하므로).

## 로컬 미리보기

- 공개 페이지만: `python -m http.server 3000` → http://localhost:3000
- 내부 페이지 포함(서버리스 함수 실행): `npx vercel dev` (Node.js 필요)

## 관련 스크립트

- `변환_데이터생성.py` — xlsx → 웹 JSON 변환
- `회의록_수집.py` — kms.ggc.go.kr 의원별 발언 수집 → `03_대장/회의록_의원명.json`
- `hwpx_리포트생성.py` — 월간 리포트 hwpx 생성 (`04_리포트/리포트_YYYYMM_의원명.hwpx`)
- `대시보드_생성.py` — (구) 로컬 대시보드 생성기
