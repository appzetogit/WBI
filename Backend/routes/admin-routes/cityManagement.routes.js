const express = require('express');
const router = express.Router();
const {
  getAllCities,
  getCity,
  createCity,
  updateCity,
  deleteCity,
  toggleCityStatus
} = require('../../controllers/cityController');
const { authenticate } = require('../../middleware/authMiddleware');
const { isSuperAdmin } = require('../../middleware/roleMiddleware');

/**
 * @route   /api/admin/cities
 * @desc    Admin city management routes
 * @access  Private (Super Admin)
 */
/**
 * IMPORTANT: this router is mounted at '/api/admin' (server.js), and several
 * other admin routers are mounted at the same prefix AFTER it. A bare
 * `router.use(mw)` here has no path, so it runs for EVERY /api/admin/* request
 * that reaches this point — meaning it would gate the entire admin API behind
 * super_admin, not just city management.
 *
 * The guard is therefore scoped to '/cities' explicitly. Do not replace this
 * with a bare router.use().
 */
router.use('/cities', authenticate, isSuperAdmin);

router.get('/cities', getAllCities);
router.get('/cities/:id', getCity);
router.post('/cities', createCity);
router.put('/cities/:id', updateCity);
router.delete('/cities/:id', deleteCity);
router.patch('/cities/:id/status', toggleCityStatus);

module.exports = router;
