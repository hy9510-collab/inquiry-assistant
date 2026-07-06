// 비밀번호 잠금(화면 안 로그인 폼 + 쿠키) — Vercel Edge Middleware
// 이 앱의 모든 요청을 가로채서, 로그인돼 있지 않으면 비밀번호 입력 화면을 보여준다.
// 비밀번호는 코드에 넣지 않는다. Vercel 환경변수 SITE_PASSWORD 에서만 읽는다.
//   - 화면의 입력칸에 비밀번호를 넣고 로그인하면, 통과 쿠키가 발급된다(30일 유지).
//   - 쿠키에는 비밀번호 원문 대신 SHA-256 값만 담는다.

export const config = {
  // 정적 자원까지 모두 잠근다. 내부 경로만 제외.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

const COOKIE = "site_auth";

async function token(password) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function loginPage(message) {
  const err = message ? `<p style="color:#c0241a;margin:0 0 10px">${message}</p>` : "";
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>로그인</title></head>
<body style="font-family:'Malgun Gothic',sans-serif;max-width:360px;margin:80px auto;padding:0 16px;color:#222">
<h1 style="font-size:20px;margin-bottom:6px">질의서 작성 비서</h1>
<p style="color:#666;margin-top:0">비밀번호를 입력하세요.</p>
${err}
<form method="POST" action="/__login">
  <input type="password" name="password" placeholder="비밀번호" autofocus
    style="width:100%;box-sizing:border-box;padding:11px;font-size:15px;border:1px solid #bbb;border-radius:8px">
  <button type="submit"
    style="margin-top:10px;width:100%;background:#1a56db;color:#fff;border:0;border-radius:8px;padding:12px;font-size:15px;cursor:pointer">로그인</button>
</form>
</body></html>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export default async function middleware(req) {
  const password = process.env.SITE_PASSWORD;

  // 환경변수가 없으면 아무나 못 들어오게 막는다(안전 우선).
  if (!password) {
    return new Response(
      "SITE_PASSWORD 환경변수가 설정되지 않았습니다. Vercel 프로젝트 설정에서 비밀번호를 등록해 주세요.",
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }

  const good = await token(password);
  const url = new URL(req.url);

  // 로그인 폼 제출 처리
  if (url.pathname === "/__login" && req.method === "POST") {
    const form = await req.formData();
    if (form.get("password") === password) {
      return new Response(null, {
        status: 302,
        headers: {
          "Set-Cookie": `${COOKIE}=${good}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`,
          Location: "/",
        },
      });
    }
    return loginPage("비밀번호가 올바르지 않습니다.");
  }

  // 통과 쿠키가 있으면 그대로 진행
  const cookie = req.headers.get("cookie") || "";
  if (cookie.split(";").some((c) => c.trim() === `${COOKIE}=${good}`)) return;

  // 로그인 안 됨 → 비밀번호 입력 화면
  return loginPage();
}
