const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const {
  getOpportunities,
  getOpportunityById,
  submitBid,
  acceptClientRequest,
  declineClientRequest,
  awardMyBid,
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
  getCounts,
  bookmarkOpportunity,
  removeBookmark,
  getActivityFeed
} = require('../../controllers/vendorControllers/businessIntakeController');

// All routes require vendor authentication

// ── Opportunities ───────────────────────────────────────
router.get('/opportunities', authenticate, getOpportunities);
router.get('/opportunities/:id', authenticate, getOpportunityById);
router.post('/opportunities/:id/bid', authenticate, submitBid);
router.post('/opportunities/:id/accept', authenticate, acceptClientRequest);
router.post('/opportunities/:id/decline', authenticate, declineClientRequest);
router.post('/opportunities/:id/award', authenticate, awardMyBid);
router.put('/opportunities/:id/bid/:bidId', authenticate, editBid);
router.post('/opportunities/:id/bookmark', authenticate, bookmarkOpportunity);
router.delete('/opportunities/:id/bookmark', authenticate, removeBookmark);

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

// ── Sidebar Badge Counts + Activity ──────────────────────
router.get('/counts', authenticate, getCounts);
router.get('/activity', authenticate, getActivityFeed);

module.exports = router;
