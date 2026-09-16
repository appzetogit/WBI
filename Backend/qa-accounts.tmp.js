require('dotenv').config();
const BASE = 'http://127.0.0.1:5000/api';
const { generateVerificationToken } = require('./utils/tokenService');
const PASSWORD = 'QaTest!2026#WBI';
const A = {
  user:     { phone: '9000000001', email: 'user.test@qa.wbi.test',     name: 'QA Test User' },
  engineer: { phone: '9000000002', email: 'engineer.test@qa.wbi.test', name: 'QA Test Engineer' },
  vendor:   { phone: '9000000003', email: 'vendor.test@qa.wbi.test',   name: 'QA Test Vendor' }
};
const call = async (m, p, b, h={}) => {
  const res = await fetch(BASE+p, { method:m, headers:{'Content-Type':'application/json',...h}, body: b?JSON.stringify(b):undefined });
  const t = await res.text(); let j; try{ j=JSON.parse(t);}catch{ j={raw:t.slice(0,200)}; }
  return { status: res.status, body: j };
};
const log = (s,r) => { const ok=r.status>=200&&r.status<300; console.log(`${ok?'PASS':'FAIL'}  ${String(r.status).padEnd(4)} ${s}`); if(!ok) console.log('        →', JSON.stringify(r.body).slice(0,400)); return ok; };
(async () => {
  console.log('=== PHASE A: ACCOUNT CREATION (real HTTP APIs) ===\n');
  const out = {};
  let r = await call('POST','/users/auth/register',{ name:A.user.name, email:A.user.email, verificationToken: generateVerificationToken(A.user.phone) });
  log('USER  register', r); out.user = r.body;

  r = await call('POST','/engineers/auth/register',{ name:A.engineer.name, email:A.engineer.email, phone:A.engineer.phone, password:PASSWORD, verificationToken: generateVerificationToken(A.engineer.phone), roleType:'Engineer' });
  log('ENG   register', r); out.engineer = r.body;

  r = await call('POST','/vendors/auth/register',{ name:A.vendor.name, ownerName:A.vendor.name, email:A.vendor.email, phone:A.vendor.phone, password:PASSWORD, businessName:'WBIQA Test Vendor Pvt Ltd', verificationToken: generateVerificationToken(A.vendor.phone) });
  log('VEND  register', r); out.vendor = r.body;

  console.log('\n=== RESULT KEYS ===');
  for (const [k,v] of Object.entries(out)) {
    console.log(k+':', JSON.stringify({ success:v.success, message:v.message, id:v.user?._id||v.engineer?._id||v.vendor?._id||v.data?._id, hasTokens: !!(v.accessToken||v.tokens||v.data?.accessToken) }).slice(0,250));
  }
})().catch(e=>{ console.error('ERR:', e.message, e.cause?.code||''); });
