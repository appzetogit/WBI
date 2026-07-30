const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { authenticate } = require('../../middleware/authMiddleware');
const { isApprovedB2B } = require('../../middleware/roleMiddleware');
const b2bBulkJobController = require('../../controllers/b2bControllers/b2bBulkJobController');

// Ensure local upload directories exist safely in the workspace
const uploadDir = path.join(__dirname, '../../uploads/b2b-bulk');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Storage engine config
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// File extensions filter — spreadsheets only. Documents (PDF/DOCX/images) cannot be
// parsed into structured job rows and previously reached the parser as garbage data.
const ALLOWED_UPLOAD_EXTENSIONS = ['.xlsx', '.xls', '.csv'];
const ALLOWED_UPLOAD_MIMETYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream', // some browsers send this for .xlsx
  'text/csv',
  'text/plain',
  'application/csv',
  'application/x-csv'
];

const excelFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_UPLOAD_EXTENSIONS.includes(ext)) {
    return cb(new Error('Only .xlsx, .xls, .csv allowed'), false);
  }
  if (file.mimetype && !ALLOWED_UPLOAD_MIMETYPES.includes(file.mimetype.toLowerCase())) {
    return cb(new Error('Only .xlsx, .xls, .csv allowed'), false);
  }
  cb(null, true);
};

// Spreadsheet upload handler (No file size limit — supports large enterprise batches)
const uploadSpreadsheet = multer({
  storage: diskStorage,
  fileFilter: excelFilter
}).single('file');

const handleMulterError = (err, req, res, next) => {
  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message || 'File upload failed'
    });
  }
  next();
};

// Endpoints mapping
router.get('/stats', authenticate, isApprovedB2B, b2bBulkJobController.getStats);
router.get('/sample', authenticate, isApprovedB2B, b2bBulkJobController.downloadSample);
router.post('/upload', authenticate, isApprovedB2B, uploadSpreadsheet, handleMulterError, b2bBulkJobController.uploadFile);
router.get('/history', authenticate, isApprovedB2B, b2bBulkJobController.getHistory);
router.get('/:batchId', authenticate, isApprovedB2B, b2bBulkJobController.getBatchDetails);
router.get('/:batchId/download', authenticate, isApprovedB2B, b2bBulkJobController.downloadOriginalFile);
router.get('/errors/:batchId', authenticate, isApprovedB2B, b2bBulkJobController.getBatchErrors);
router.get('/errors/:batchId/download', authenticate, isApprovedB2B, b2bBulkJobController.downloadErrorReport);
router.post('/confirm/:batchId', authenticate, isApprovedB2B, b2bBulkJobController.confirmUpload);
router.post('/:batchId/retry', authenticate, isApprovedB2B, b2bBulkJobController.retryBatch);
router.delete('/:batchId', authenticate, isApprovedB2B, b2bBulkJobController.deleteBatch);

module.exports = router;
