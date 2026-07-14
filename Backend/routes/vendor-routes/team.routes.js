const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isVendor } = require('../../middleware/roleMiddleware');
const ctrl = require('../../controllers/vendorControllers/vendorTeamController');

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
router.get('/overview', authenticate, isVendor, ctrl.getWorkforceDashboard);
router.get('/analytics', authenticate, isVendor, ctrl.getAnalytics);
router.get('/activity', authenticate, isVendor, ctrl.getActivity);

// ─── DEPARTMENTS ──────────────────────────────────────────────────────────────
router.get('/departments', authenticate, isVendor, ctrl.getDepartments);
router.post('/departments', authenticate, isVendor, ctrl.createDepartment);
router.put('/departments/:id', authenticate, isVendor, ctrl.updateDepartment);
router.delete('/departments/:id', authenticate, isVendor, ctrl.deleteDepartment);

// ─── ROLES ────────────────────────────────────────────────────────────────────
router.get('/roles', authenticate, isVendor, ctrl.getRoles);
router.post('/roles', authenticate, isVendor, ctrl.createRole);
router.put('/roles/:id', authenticate, isVendor, ctrl.updateRole);
router.delete('/roles/:id', authenticate, isVendor, ctrl.deleteRole);

// ─── SKILLS CATALOG ───────────────────────────────────────────────────────────
router.get('/skills', authenticate, isVendor, ctrl.getSkills);
router.post('/skills', authenticate, isVendor, ctrl.createSkill);
router.put('/skills/:id', authenticate, isVendor, ctrl.updateSkill);
router.delete('/skills/:id', authenticate, isVendor, ctrl.deleteSkill);

// ─── SKILL MATRIX ─────────────────────────────────────────────────────────────
router.get('/skill-matrix/:memberId', authenticate, isVendor, ctrl.getMemberSkillMatrix);
router.post('/skill-matrix', authenticate, isVendor, ctrl.upsertMemberSkill);
router.delete('/skill-matrix/:id', authenticate, isVendor, ctrl.deleteMemberSkill);
router.get('/skill-gap', authenticate, isVendor, ctrl.getSkillGapAnalysis);

// ─── TEAM MEMBERS ─────────────────────────────────────────────────────────────
router.get('/members', authenticate, isVendor, ctrl.getTeamMembers);
router.get('/members/:id', authenticate, isVendor, ctrl.getMemberProfile);
router.post('/members', authenticate, isVendor, ctrl.addMember);
router.put('/members/:id', authenticate, isVendor, ctrl.updateMember);
router.delete('/members/:id', authenticate, isVendor, ctrl.deleteMember);
router.patch('/members/:id/status', authenticate, isVendor, ctrl.updateMemberStatus);
router.patch('/members/bulk-update', authenticate, isVendor, ctrl.bulkUpdateMembers);

// ─── PROJECT ASSIGNMENTS ─────────────────────────────────────────────────────
const assignCtrl = require('../../controllers/vendorControllers/vendorProjectAssignmentController');
router.get('/project-assignments/available-projects', authenticate, isVendor, assignCtrl.getAvailableProjects);
router.get('/project-assignments/projects/:projectId/details', authenticate, isVendor, assignCtrl.getProjectDetails);
router.post('/project-assignments/validate', authenticate, isVendor, assignCtrl.validateAssignment);
router.post('/project-assignments', authenticate, isVendor, assignCtrl.createAssignment);

router.get('/assignments', authenticate, isVendor, ctrl.getProjectAssignments);
// router.post('/assignments', authenticate, isVendor, ctrl.assignProject); // Deprecated
router.put('/assignments/:id', authenticate, isVendor, ctrl.updateProjectAssignment);

// ─── PERFORMANCE ──────────────────────────────────────────────────────────────
router.get('/performance', authenticate, isVendor, ctrl.getPerformance);
router.post('/performance', authenticate, isVendor, ctrl.upsertPerformance);

// ─── AVAILABILITY ─────────────────────────────────────────────────────────────
router.get('/availability', authenticate, isVendor, ctrl.getAvailability);
router.patch('/availability/:id', authenticate, isVendor, ctrl.updateAvailability);

// ─── LEAVE MANAGEMENT ─────────────────────────────────────────────────────────
router.get('/leaves', authenticate, isVendor, ctrl.getLeaves);
router.post('/leaves', authenticate, isVendor, ctrl.applyLeave);
router.patch('/leaves/:id/approve', authenticate, isVendor, ctrl.approveLeave);
router.patch('/leaves/:id/reject', authenticate, isVendor, ctrl.rejectLeave);

// ─── ATTENDANCE ───────────────────────────────────────────────────────────────
router.get('/attendance', authenticate, isVendor, ctrl.getAttendance);
router.post('/attendance', authenticate, isVendor, ctrl.markAttendance);

// ─── CERTIFICATIONS ───────────────────────────────────────────────────────────
router.get('/certifications', authenticate, isVendor, ctrl.getCertifications);
router.post('/certifications', authenticate, isVendor, ctrl.addCertification);
router.put('/certifications/:id', authenticate, isVendor, ctrl.updateCertification);
router.delete('/certifications/:id', authenticate, isVendor, ctrl.deleteCertification);

module.exports = router;
