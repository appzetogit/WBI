const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const {
  getCounts,
  getCapacity,
  getInventory,
  updateInventory,
  getTools,
  updateTool,
  getWarehouses,
  getInstalledAssets,
  updateInstalledAsset
} = require('../../controllers/vendorControllers/resourcesOpsController');

router.get('/counts', authenticate, getCounts);
router.get('/capacity', authenticate, getCapacity);

router.get('/inventory', authenticate, getInventory);
router.patch('/inventory/:id', authenticate, updateInventory);

router.get('/tools', authenticate, getTools);
router.patch('/tools/:id', authenticate, updateTool);

router.get('/warehouses', authenticate, getWarehouses);

router.get('/assets', authenticate, getInstalledAssets);
router.patch('/assets/:id', authenticate, updateInstalledAsset);

module.exports = router;
