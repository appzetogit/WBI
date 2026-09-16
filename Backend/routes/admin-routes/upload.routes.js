const express = require('express');
const router = express.Router();
const { uploadImage, uploadMedia, uploadGenericFile } = require('../../middleware/uploadMiddleware');
const { getSignature } = require('../../controllers/cloudinaryController');
const { uploadLimiter } = require('../../middleware/rateLimiter');

/**
 * This router is mounted twice: at /api/admin and at /api (generic access).
 *
 * It deliberately stays unauthenticated because vendor and engineer signup
 * wizards upload KYC documents before any session exists — requiring auth here
 * would break registration. Guarding only the /api/admin mount would achieve
 * nothing, since the same handlers are reachable via /api.
 *
 * The real controls are therefore: mime/extension filtering and size caps in
 * uploadMiddleware, plus this volume limit so the endpoints cannot be abused as
 * anonymous object storage.
 */
router.use(uploadLimiter);

// Get signature for direct signed upload
router.get('/upload/sign-signature', getSignature);

// Upload single file to Cloudinary
router.post('/upload', uploadImage, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // When using multer-storage-cloudinary, req.file.path is the secure_url
    res.status(200).json({
      success: true,
      imageUrl: req.file.path,
      message: 'File uploaded successfully'
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload file',
      error: error.message
    });
  }
});

// Upload media file to Cloudinary (Images & Videos)
router.post('/upload-media', uploadMedia, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // When using multer-storage-cloudinary, req.file.path is the secure_url
    res.status(200).json({
      success: true,
      imageUrl: req.file.path,
      message: 'Media uploaded successfully'
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload file',
      error: error.message
    });
  }
});

// Upload generic file (PDF, DOC, Images) to Cloudinary
router.post('/upload-file', uploadGenericFile, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded or file format not supported'
      });
    }

    res.status(200).json({
      success: true,
      imageUrl: req.file.path,
      message: 'File uploaded successfully'
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload file',
      error: error.message
    });
  }
});

module.exports = router;
