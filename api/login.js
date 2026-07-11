// 내부 페이지 로그인 — POST {password} → 일치 시 HttpOnly 쿠키 발급
// 비밀번호는 Vercel 환경변수 ADMIN_PASSWORD 로 설정한다 (미설정 시 로그인 불가).
const crypto = require('crypto');

function token(pw) {
  return crypto.createHash('sha256').update('ggc-uijeong-v1:' + pw).digest('hex');
}

module.exports = (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const admin = process.env.ADMIN_PASSWORD || '';
  const pw = (req.body && req.body.password) || '';
  if (!admin || pw.length === 0 || pw.length > 200) {
    return res.status(401).json({ ok: false });
  }
  const a = Buffer.from(token(pw)), b = Buffer.from(token(admin));
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
    res.setHeader('Set-Cookie',
      `auth=${token(admin)}; HttpOnly; Path=/; Max-Age=43200; SameSite=Strict; Secure`);
    return res.status(200).json({ ok: true });
  }
  return res.status(401).json({ ok: false });
};
