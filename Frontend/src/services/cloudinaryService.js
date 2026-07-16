/**
 * Cloudinary Service
 * Real upload wrapper – delegates to the central uploadToCloudinary utility
 * so that compression + direct-to-Cloudinary logic is in one place.
 */
import { uploadToCloudinary } from '../utils/cloudinaryUpload';

/**
 * Upload any file to Cloudinary with optional progress callback.
 * @param {File|string} file - File object, or an existing URL (returned as-is)
 * @param {{ folder?, onProgress?, compressOpts? }} options
 * @returns {Promise<string>} Cloudinary secure URL
 */
export const uploadFile = async (file, options = {}) => {
  // Already a URL string → return immediately
  if (typeof file === 'string') return file;

  const { folder = 'appzeto', onProgress, compressOpts = {} } = options;
  return uploadToCloudinary(file, folder, onProgress, compressOpts);
};

export default uploadFile;
