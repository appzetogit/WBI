const cloudinary = require('../config/cloudinary');

const PLACEHOLDER_KEYS = new Set(['digilocker-fetch', 'selfie-capture', 'dummy_id_image_url']);

/**
 * True when URL is a usable http(s)/data file link (not DigiLocker placeholder).
 */
function isRealFileUrl(url) {
  if (!url || PLACEHOLDER_KEYS.has(String(url))) return false;
  const s = String(url);
  return s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:') || s.startsWith('/');
}

/**
 * Original upload filenames (e.g. "Screenshot 2025-09-15.png") are NOT Cloudinary public_ids.
 */
function isLikelyCloudinaryPublicId(fileKey) {
  if (!fileKey || PLACEHOLDER_KEYS.has(String(fileKey))) return false;
  const key = String(fileKey);
  if (/\s/.test(key)) return false;
  if (/^Screenshot/i.test(key)) return false;
  // Prefer folder/public_id style; reject bare original filenames with extensions
  if (key.includes('/')) return true;
  if (/\.(png|jpe?g|webp|gif|pdf|mp4|webm)$/i.test(key)) return false;
  return true;
}

/**
 * Extract Cloudinary public_id from a delivery URL.
 * e.g. .../upload/v123/kyc_documents/abc.jpg → kyc_documents/abc
 */
function extractCloudinaryPublicId(fileUrl) {
  if (!fileUrl || !String(fileUrl).includes('cloudinary.com')) return null;
  try {
    const u = String(fileUrl);
    const uploadIdx = u.indexOf('/upload/');
    if (uploadIdx === -1) return null;
    let rest = u.slice(uploadIdx + '/upload/'.length);
    // strip transforms / version
    rest = rest.replace(/^([^/]+\/)*v\d+\//, '');
    // remove query
    rest = rest.split('?')[0];
    // remove extension
    rest = rest.replace(/\.[a-zA-Z0-9]+$/, '');
    return rest || null;
  } catch {
    return null;
  }
}

function generateSignedUrl(fileKey) {
  if (!fileKey || !isLikelyCloudinaryPublicId(fileKey)) return '';
  try {
    return cloudinary.url(fileKey, {
      resource_type: 'auto',
      type: 'authenticated',
      sign_url: true,
      expires_at: Math.floor(Date.now() / 1000) + 3600
    });
  } catch (error) {
    console.error('Failed to generate Cloudinary signed URL:', error.message);
    return '';
  }
}

/**
 * Resolve the best preview URL for admin document galleries.
 * Prefer public Cloudinary delivery URLs; only sign when fileKey is a real public_id
 * and there is no usable public fileUrl.
 */
function resolveDocumentPreviewUrl(fileUrl, fileKey) {
  if (isRealFileUrl(fileUrl)) {
    return {
      previewUrl: fileUrl,
      hasPhysicalFile: true,
      source: 'fileUrl'
    };
  }

  if (isLikelyCloudinaryPublicId(fileKey)) {
    const signed = generateSignedUrl(fileKey);
    if (signed) {
      return { previewUrl: signed, hasPhysicalFile: true, source: 'signed_fileKey' };
    }
  }

  const fromUrlKey = extractCloudinaryPublicId(fileUrl);
  if (fromUrlKey) {
    const signed = generateSignedUrl(fromUrlKey);
    if (signed) {
      return { previewUrl: signed, hasPhysicalFile: true, source: 'signed_extracted' };
    }
  }

  return { previewUrl: null, hasPhysicalFile: false, source: 'none' };
}

module.exports = {
  isRealFileUrl,
  isLikelyCloudinaryPublicId,
  extractCloudinaryPublicId,
  generateSignedUrl,
  resolveDocumentPreviewUrl
};
