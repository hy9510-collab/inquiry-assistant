// 비밀번호 잠금(HTTP Basic 인증) — Vercel Edge Middleware
// 이 앱의 모든 요청을 가로채서, 브라우저 로그인 창으로 비밀번호를 물어본다.
// 비밀번호는 코드에 넣지 않는다. Vercel 환경변수 SITE_PASSWORD 에서만 읽는다.
//   - 아이디(username)는 아무거나 넣어도 되고, 비밀번호만 SITE_PASSWORD 와 같으면 통과.
//   - 한 번 로그인하면 브라우저가 이후 요청에 자동으로 인증정보를 붙인다.

export const config = {
  // 정적 자원 요청까지 모두 잠근다. 잠글 필요 없는 내부 경로만 제외.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

export default function middleware(req) {
  const password = process.env.SITE_PASSWORD;

  // 환경변수가 없으면 아무나 들어오지 못하게 막는다(안전 우선).
  if (!password) {
    return new Response(
      "SITE_PASSWORD 환경변수가 설정되지 않았습니다. Vercel 프로젝트 설정에서 비밀번호를 등록해 주세요.",
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }

  const auth = req.headers.get("authorization") || "";
  if (auth.startsWith("Basic ")) {
    try {
      const decoded = atob(auth.slice(6)); // "아이디:비밀번호"
      const pass = decoded.slice(decoded.indexOf(":") + 1);
      if (pass === password) return; // 통과 — 원래 요청 그대로 진행
    } catch {
      // 디코딩 실패 → 아래에서 다시 로그인 요구
    }
  }

  // 인증 없음/틀림 → 브라우저 로그인 창을 띄운다.
  return new Response("로그인이 필요합니다.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="질의서 작성 비서", charset="UTF-8"',
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
