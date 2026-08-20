const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../../middleware/authMiddleware');
const { isEngineer } = require('../../middleware/roleMiddleware');
const {
  getAssignedJobs,
  getJobById,
  updateJobStatus,
  startJob,
  completeJob,
  addWorkerNotes,
  verifyVisit,
  workerReachedLocation,
  collectCash,
  respondToJob,
  uploadJobMedia,
  addJobMaterials,
  getJobTimeline,
  getJobProgress,
  addJobExpenses,
  getJobReport,
  getJobCompletionDetails,
  shareJobReport
} = require('../../controllers/bookingControllers/workerBookingController');
const {
  createOrUpdateBill,
  getBillByBookingId
} = require('../../controllers/vendorControllers/vendorBillController');
const VendorServiceCatalog = require('../../models/VendorServiceCatalog');
const VendorPartsCatalog = require('../../models/VendorPartsCatalog');

// Validation rules
const updateStatusValidation = [
  body('status').isIn(['in_progress', 'completed'])
    .withMessage('Invalid status')
];

const respondValidation = [
  body('status').isIn(['ACCEPTED', 'REJECTED']).withMessage('Invalid status')
];

const addNotesValidation = [
  body().custom((value, { req }) => {
    const { notes, structuredNotes } = req.body || {};
    const hasNotes = typeof notes === 'string' && notes.trim().length > 0;
    const hasStructured = !!(
      structuredNotes &&
      typeof structuredNotes === 'object' &&
      Object.values(structuredNotes).some(v => typeof v === 'string' && v.trim().length > 0)
    );
    if (hasNotes || hasStructured) {
      if (!hasNotes && hasStructured) {
        req.body.notes = [
          structuredNotes.issueFound,
          structuredNotes.resolutionDetails,
          structuredNotes.additionalRemarks
        ].filter(v => typeof v === 'string' && v.trim().length > 0).join('\n') || 'Work notes updated';
      }
      return true;
    }
    throw new Error('Notes are required');
  })
];

const { verifyAadhaarPanForJob } = require('../../middleware/verificationMiddleware');
const rateLimiter = require('../../middleware/rateLimiter');
const { engineerApiLimiter, engineerActionLimiter } = rateLimiter;

// Routes
router.get('/jobs', authenticate, isEngineer, engineerApiLimiter, getAssignedJobs);
router.get('/jobs/:id', authenticate, isEngineer, engineerApiLimiter, getJobById);
router.put('/jobs/:id/respond', authenticate, isEngineer, engineerActionLimiter, verifyAadhaarPanForJob, respondValidation, respondToJob);
router.put('/jobs/:id/status', authenticate, isEngineer, engineerActionLimiter, verifyAadhaarPanForJob, updateStatusValidation, updateJobStatus);
router.post('/jobs/:id/start', authenticate, isEngineer, engineerActionLimiter, verifyAadhaarPanForJob, startJob);
router.post('/jobs/:id/reached', authenticate, isEngineer, engineerActionLimiter, workerReachedLocation);
router.post('/jobs/:id/visit/verify', authenticate, isEngineer, engineerActionLimiter, verifyVisit);
router.post('/jobs/:id/complete', authenticate, isEngineer, engineerActionLimiter, completeJob);
router.post('/jobs/:id/payment/collect', authenticate, isEngineer, engineerActionLimiter, collectCash);
router.post('/jobs/:id/notes', authenticate, isEngineer, engineerActionLimiter, addNotesValidation, addWorkerNotes);
router.post('/jobs/:id/upload', authenticate, isEngineer, engineerActionLimiter, uploadJobMedia);
router.post('/jobs/:id/materials', authenticate, isEngineer, engineerActionLimiter, addJobMaterials);
router.get('/jobs/:id/timeline', authenticate, isEngineer, engineerApiLimiter, getJobTimeline);
router.get('/jobs/:id/progress', authenticate, isEngineer, engineerApiLimiter, getJobProgress);
router.post('/jobs/:id/expenses', authenticate, isEngineer, engineerActionLimiter, addJobExpenses);
router.get('/jobs/:id/report', authenticate, isEngineer, engineerApiLimiter, getJobReport);
router.get('/jobs/:id/completion', authenticate, isEngineer, engineerApiLimiter, getJobCompletionDetails);
router.post('/jobs/:id/share', authenticate, isEngineer, engineerActionLimiter, shareJobReport);

// Bill Routes
router.post('/jobs/:id/bill', authenticate, isEngineer, (req, res, next) => {
  req.params.bookingId = req.params.id;
  next();
}, createOrUpdateBill);

router.get('/jobs/:id/bill', authenticate, isEngineer, (req, res, next) => {
  req.params.bookingId = req.params.id;
  next();
}, getBillByBookingId);

// Catalog Routes (for billing)
router.get('/catalog/services', authenticate, isEngineer, engineerApiLimiter, async (req, res) => {
  try {
    const services = await VendorServiceCatalog.find({ status: 'active' })
      .populate('categoryId', 'title')
      .sort({ name: 1 })
      .limit(500)
      .lean();
    res.status(200).json({ success: true, services });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch services catalog' });
  }
});

router.get('/catalog/parts', authenticate, isEngineer, engineerApiLimiter, async (req, res) => {
  try {
    const parts = await VendorPartsCatalog.find({ status: 'active' })
      .populate('categoryId', 'title')
      .sort({ name: 1 })
      .limit(500)
      .lean();
    res.status(200).json({ success: true, parts });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch parts catalog' });
  }
});

module.exports = router;

