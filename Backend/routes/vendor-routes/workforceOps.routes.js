const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const {
  getCounts,
  syncWorkforce,
  getEngineers,
  updateEngineer,
  getTeams,
  getStructure,
  getSkillMatrix,
  getAssignments,
  updateAssignment,
  getAvailability,
  getAttendance,
  getLeaves,
  updateLeave,
  getCertifications
} = require('../../controllers/vendorControllers/workforceOpsController');

router.get('/counts', authenticate, getCounts);
router.post('/sync', authenticate, syncWorkforce);

router.get('/engineers', authenticate, getEngineers);
router.patch('/engineers/:id', authenticate, updateEngineer);

router.get('/teams', authenticate, getTeams);
router.get('/structure', authenticate, getStructure);
router.get('/skills', authenticate, getSkillMatrix);

router.get('/assignments', authenticate, getAssignments);
router.patch('/assignments/:id', authenticate, updateAssignment);

router.get('/availability', authenticate, getAvailability);
router.get('/attendance', authenticate, getAttendance);

router.get('/leaves', authenticate, getLeaves);
router.patch('/leaves/:id', authenticate, updateLeave);

router.get('/certifications', authenticate, getCertifications);

module.exports = router;
