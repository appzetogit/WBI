const EngineerTool = require('../../models/EngineerTool');
const EngineerRegistrationConfig = require('../../models/EngineerRegistrationConfig');

// --- Engineer Tools Management ---

const getTools = async (req, res) => {
  try {
    const tools = await EngineerTool.find().sort({ sortOrder: 1 });
    res.status(200).json({ success: true, data: tools });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch tools' });
  }
};

const createTool = async (req, res) => {
  try {
    const { name, icon, isActive, sortOrder } = req.body;
    const tool = await EngineerTool.create({ name, icon, isActive, sortOrder });
    res.status(201).json({ success: true, data: tool });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create tool' });
  }
};

const updateTool = async (req, res) => {
  try {
    const { id } = req.params;
    const tool = await EngineerTool.findByIdAndUpdate(id, req.body, { new: true });
    if (!tool) return res.status(404).json({ success: false, message: 'Tool not found' });
    res.status(200).json({ success: true, data: tool });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update tool' });
  }
};

const deleteTool = async (req, res) => {
  try {
    const { id } = req.params;
    await EngineerTool.findByIdAndDelete(id);
    res.status(200).json({ success: true, message: 'Tool deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete tool' });
  }
};

// --- Engineer Registration Config Management ---

const getConfig = async (req, res) => {
  try {
    let config = await EngineerRegistrationConfig.findOne();
    if (!config) {
      config = await EngineerRegistrationConfig.create({});
    }
    res.status(200).json({ success: true, data: config });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch config' });
  }
};

const updateConfig = async (req, res) => {
  try {
    let config = await EngineerRegistrationConfig.findOne();
    if (config) {
      config = await EngineerRegistrationConfig.findByIdAndUpdate(config._id, req.body, { new: true });
    } else {
      config = await EngineerRegistrationConfig.create(req.body);
    }
    res.status(200).json({ success: true, data: config });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update config' });
  }
};

module.exports = {
  getTools, createTool, updateTool, deleteTool,
  getConfig, updateConfig
};
