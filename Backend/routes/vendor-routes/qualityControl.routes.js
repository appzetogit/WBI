const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const {
  getCounts,
  getProofs,
  updateProof,
  getReviews,
  updateReview,
  getClientApprovals,
  getB2BApprovals,
  updateApproval,
  getIssues,
  updateIssue,
  getChangeRequests,
  updateChangeRequest,
  getDamages,
  updateDamage
} = require('../../controllers/vendorControllers/qualityControlController');

router.get('/counts', authenticate, getCounts);

router.get('/proofs', authenticate, getProofs);
router.patch('/proofs/:id', authenticate, updateProof);

router.get('/reviews', authenticate, getReviews);
router.patch('/reviews/:id', authenticate, updateReview);

router.get('/client-approvals', authenticate, getClientApprovals);
router.get('/b2b-approvals', authenticate, getB2BApprovals);
router.patch('/approvals/:id', authenticate, updateApproval);

router.get('/issues', authenticate, getIssues);
router.patch('/issues/:id', authenticate, updateIssue);

router.get('/change-requests', authenticate, getChangeRequests);
router.patch('/change-requests/:id', authenticate, updateChangeRequest);

router.get('/damage', authenticate, getDamages);
router.patch('/damage/:id', authenticate, updateDamage);

module.exports = router;
