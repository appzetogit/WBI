const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const {
  getOpportunities,
  getOpportunityById,
  submitBid,
  editBid,
  getInvitations,
  acceptInvitation,
  declineInvitation,
  getProposals,
  getProposalById,
  createProposal,
  updateProposal,
  sendProposal,
  downloadProposalPdf,
  getAcceptedWork,
  getCounts
} = require('../../controllers/vendorControllers/businessIntakeController');

// All routes require vendor authentication
// Note: The `authenticate` middleware sets req.user as the logged-in vendor

// ── Opportunities ───────────────────────────────────────
router.get('/opportunities', authenticate, getOpportunities);
router.get('/opportunities/:id', authenticate, getOpportunityById);
router.post('/opportunities/:id/bid', authenticate, submitBid);
router.put('/opportunities/:id/bid/:bidId', authenticate, editBid);

// ── Invitations ─────────────────────────────────────────
router.get('/invitations', authenticate, getInvitations);
router.post('/invitations/:id/accept', authenticate, acceptInvitation);
router.post('/invitations/:id/decline', authenticate, declineInvitation);

// ── Proposals ───────────────────────────────────────────
router.get('/proposals', authenticate, getProposals);
router.post('/proposals', authenticate, createProposal);
router.get('/proposals/:id', authenticate, getProposalById);
router.put('/proposals/:id', authenticate, updateProposal);
router.post('/proposals/:id/send', authenticate, sendProposal);
router.get('/proposals/:id/download-pdf', authenticate, downloadProposalPdf);

// ── Accepted Work ────────────────────────────────────────
router.get('/accepted-work', authenticate, getAcceptedWork);

// ── Sidebar Badge Counts ─────────────────────────────────
router.get('/counts', authenticate, getCounts);

module.exports = router;
