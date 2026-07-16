import axios from 'axios';
import api from '../services/api';

/**
 * Cloudinary Direct Upload Utility
 * Uploads files directly to Cloudinary using a secure signature from our backend.
 * Built-in aggressive compression to minimize upload time.
 */

/**
 * Compress an image to target size before upload.
 * Selfie:    max 600x600,  quality 0.65, JPEG
 * Default:   max 1000x1000, quality 0.70, JPEG
 * @param {File} file
 * @param {{ maxWidth?, maxHeight?, quality? }} opts
 * @returns {Promise<File>}
 */
export const compressImageForUpload = (
  file,
  { maxWidth = 1000, maxHeight = 1000, quality = 0.70 } = {}
) => {
  return new Promise((resolve) => {
    // Non-image files (PDF, etc.) → skip compression
    if (!file.type.startsWith('image/')) {
      resolve(file);
      return;
    }

    const img = new Image();
    const src = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(src);

      let { width, height } = img;

      // Scale down proportionally
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return; }
          // Only use compressed if it's actually smaller
          if (blob.size < file.size) {
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
          } else {
            resolve(file); // original is already small enough
          }
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => { URL.revokeObjectURL(src); resolve(file); };
    img.src = src;
  });
};

/**
 * Upload a file directly to Cloudinary with built-in compression.
 * @param {File} file - The file object to upload
 * @param {string} folder - Target folder in Cloudinary
 * @param {Function} onProgress - Progress callback (percent) => {}
 * @param {{ maxWidth?, maxHeight?, quality?, skipCompression? }} compressOpts
 * @returns {Promise<string>} - The secure URL of the uploaded file
 */
export const uploadToCloudinary = async (
  file,
  folder = 'appzeto',
  onProgress,
  compressOpts = {}
) => {
  try {
    // 1. Compress image before upload (unless skipped)
    const fileToUpload = compressOpts.skipCompression
      ? file
      : await compressImageForUpload(file, compressOpts);

    // 2. Get signature from backend
    const signResponse = await api.get(`/upload/sign-signature?folder=${folder}`);
    if (!signResponse.data.success) {
      throw new Error('Failed to get upload signature');
    }
    const { signature, timestamp, apiKey, cloudName } = signResponse.data;

    // 3. Build FormData (binary, NOT base64)
    const formData = new FormData();
    formData.append('file', fileToUpload);
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp);
    formData.append('signature', signature);
    formData.append('folder', folder);

    // 4. Upload directly to Cloudinary
    const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`;
    const response = await axios.post(cloudinaryUrl, formData, {
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const pct = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(pct);
        }
      },
    });

    return response.data.secure_url;
  } catch (error) {
    console.error('[Cloudinary Upload Error]', error);
    throw error;
  }
};

/**
 * Convenience: upload a selfie with extra-aggressive compression (600px, 65% quality)
 */
export const uploadSelfieToCloudinary = (file, folder = 'kyc_selfies', onProgress) =>
  uploadToCloudinary(file, folder, onProgress, { maxWidth: 600, maxHeight: 600, quality: 0.65 });

/**
 * Convenience: upload a KYC document (1000px, 70% quality)
 */
export const uploadDocumentToCloudinary = (file, folder = 'kyc_documents', onProgress) =>
  uploadToCloudinary(file, folder, onProgress, { maxWidth: 1000, maxHeight: 1000, quality: 0.70 });

export default uploadToCloudinary;
