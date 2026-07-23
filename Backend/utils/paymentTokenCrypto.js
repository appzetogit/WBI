/**
 * Encrypt/decrypt Razorpay token ids at rest (AES-256-GCM).
 * If PAYMENT_TOKEN_ENCRYPTION_KEY is unset, values are stored as plaintext with prefix "plain:".
 */
const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const PREFIX = 'enc:v1:';

function getKey() {
  const raw = process.env.PAYMENT_TOKEN_ENCRYPTION_KEY;
  if (!raw) return null;
  // Accept 32-byte hex or utf8 passphrase hashed to 32 bytes
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  return crypto.createHash('sha256').update(raw).digest();
}

function encryptToken(plain) {
  if (!plain) return null;
  const key = getKey();
  if (!key) return `plain:${plain}`;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function decryptToken(stored) {
  if (!stored) return null;
  if (stored.startsWith('plain:')) return stored.slice(6);
  if (!stored.startsWith(PREFIX)) return stored;
  const key = getKey();
  if (!key) throw new Error('PAYMENT_TOKEN_ENCRYPTION_KEY required to decrypt token');
  const parts = stored.slice(PREFIX.length).split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted token format');
  const [ivHex, tagHex, dataHex] = parts;
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final()
  ]);
  return dec.toString('utf8');
}

function hashVpa(vpa) {
  return crypto.createHash('sha256').update(String(vpa).trim().toLowerCase()).digest('hex');
}

function maskVpa(vpa) {
  const s = String(vpa).trim().toLowerCase();
  const at = s.indexOf('@');
  if (at <= 0) return '***@***';
  const user = s.slice(0, at);
  const handle = s.slice(at);
  const visible = user.length <= 2 ? `${user[0] || '*'}*` : `${user.slice(0, 2)}***`;
  return `${visible}${handle}`;
}

module.exports = {
  encryptToken,
  decryptToken,
  hashVpa,
  maskVpa,
  getKey
};
