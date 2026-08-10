const ServiceCategory = require('../../models/ServiceCategory');
const Service = require('../../models/Service');

// Get all ONE_TIME categories
exports.getCategories = async (req, res) => {
  try {
    const categories = await ServiceCategory.find({ type: 'ONE_TIME' }).sort({ sortOrder: 1, createdAt: -1 });
    res.status(200).json({ success: true, count: categories.length, data: categories });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// Create ONE_TIME category
exports.createCategory = async (req, res) => {
  try {
    const category = await ServiceCategory.create({ ...req.body, type: 'ONE_TIME' });
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// Update Category
exports.updateCategory = async (req, res) => {
  try {
    const category = await ServiceCategory.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!category) return res.status(404).json({ success: false, error: 'Category not found' });
    res.status(200).json({ success: true, data: category });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// Get all ONE_TIME services
exports.getServices = async (req, res) => {
  try {
    const services = await Service.find({ type: 'ONE_TIME' }).populate('categoryId').sort({ sortOrder: 1, createdAt: -1 });
    res.status(200).json({ success: true, count: services.length, data: services });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// Create ONE_TIME service
exports.createService = async (req, res) => {
  try {
    const service = await Service.create({ ...req.body, type: 'ONE_TIME' });
    res.status(201).json({ success: true, data: service });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// Update Service
exports.updateService = async (req, res) => {
  try {
    const service = await Service.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!service) return res.status(404).json({ success: false, error: 'Service not found' });
    res.status(200).json({ success: true, data: service });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// Delete Service
exports.deleteService = async (req, res) => {
  try {
    const service = await Service.findByIdAndDelete(req.params.id);
    if (!service) return res.status(404).json({ success: false, error: 'Service not found' });
    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};
