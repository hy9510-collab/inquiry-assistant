// 내부 데이터 API — 로그인 쿠키가 유효할 때만 민원·보도·일정 데이터를 반환
const crypto = require('crypto');
const data = require('./_data.js');

function token(pw) {
  return crypto.createHash('sha256').update('ggc-uijeong-v1:' + pw).digest('hex');
}

module.exports = (req, res) => {
  const admin = process.env.ADMIN_PASSWORD || '';
  const m = (req.headers.cookie || '').match(/auth=([a-f0-9]{64})/);
  if (!admin || !m) return res.status(401).json({ error: 'unauthorized' });
  const a = Buffer.from(m[1]), b = Buffer.from(token(admin));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(data);
};
