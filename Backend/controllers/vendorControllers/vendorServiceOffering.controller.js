const mongoose = require('mongoose');
const VendorServiceOffering = require('../../models/VendorServiceOffering');
const DigitalServiceCategory = require('../../models/DigitalServiceCategory');
const DigitalServiceSubcategory = require('../../models/DigitalServiceSubcategory');
const Vendor = require('../../models/Vendor');

// 1. GET Options
exports.getVendorServiceOptions = async (req, res) => {
  try {
    const { executionModel } = req.query;
    
    // In a full implementation, you might filter categories by execution model.
    // For now, we return all active digital categories.
    const categories = await DigitalServiceCategory.find({ isActive: true }).select('name slug icon color').lean();
    const subCategories = await DigitalServiceSubcategory.find({ isActive: true }).select('name slug categoryId').lean();

    const vendor = await Vendor.findById(req.user.id).select('vendorModels').lean();

    return res.status(200).json({
      success: true,
      data: {
        categories,
        subCategories,
        vendorModels: vendor.vendorModels || []
      }
    });
  } catch (error) {
    console.error('Error fetching service options:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 2. GET Summary
exports.getVendorServiceSummary = async (req, res) => {
  try {
    const vendorId = req.user.id;
    
    const [total, active, featured] = await Promise.all([
      VendorServiceOffering.countDocuments({ vendorId, deletedAt: null }),
      VendorServiceOffering.countDocuments({ vendorId, deletedAt: null, status: 'ACTIVE', approvalStatus: 'APPROVED' }),
      VendorServiceOffering.countDocuments({ vendorId, deletedAt: null, isFeatured: true, status: 'ACTIVE' })
    ]);

    // Mock orders and revenue for now since we don't have the full Order/Project linking implemented in this scope
    const totalOrders = 0; 
    const totalRevenue = 0;

    return res.status(200).json({
      success: true,
      data: {
        totalServices: total,
        activeServices: active,
        featuredServices: featured,
        totalOrders,
        totalRevenue
      }
    });
  } catch (error) {
    console.error('Error fetching service summary:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 3. GET List
exports.getVendorServiceOfferings = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { search, category, status, executionModel, page = 1, limit = 10 } = req.query;

    const query = { vendorId, deletedAt: null };

    if (search) {
      query.title = { $regex: search, $options: 'i' };
    }
    if (category) {
      query.categoryId = category;
    }
    if (status) {
      query.status = status;
    }
    if (executionModel) {
      query.executionModel = executionModel;
    }

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      VendorServiceOffering.find(query)
        .populate('categoryId', 'name color icon')
        .populate('subCategoryId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      VendorServiceOffering.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      data: {
        items,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Error fetching service offerings:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 4. POST Create
exports.createVendorServiceOffering = async (req, res) => {
  try {
    const vendorId = req.user.id;
    
    // Check if vendor has this model approved
    const vendor = await Vendor.findById(vendorId).select('vendorModels');
    if (!vendor.vendorModels || !vendor.vendorModels.includes(req.body.executionModel)) {
      return res.status(403).json({ success: false, message: 'You are not approved for this execution model.' });
    }

    const newOffering = await VendorServiceOffering.create({
      ...req.body,
      vendorId,
      status: 'DRAFT',
      approvalStatus: 'NOT_SUBMITTED'
    });

    return res.status(201).json({
      success: true,
      message: 'Service offering draft created successfully',
      data: newOffering
    });

  } catch (error) {
    console.error('Error creating service offering:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 5. PATCH Update
exports.updateVendorServiceOffering = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { id } = req.params;

    const offering = await VendorServiceOffering.findOne({ _id: id, vendorId, deletedAt: null });
    if (!offering) return res.status(404).json({ success: false, message: 'Service offering not found' });

    // Restrict edits if approved and active, unless putting to draft
    if (offering.status === 'ACTIVE' && req.body.status !== 'DRAFT' && req.body.status !== 'INACTIVE') {
      return res.status(400).json({ success: false, message: 'Cannot edit an active service directly. Change status to DRAFT first.' });
    }

    Object.assign(offering, req.body);
    await offering.save();

    return res.status(200).json({
      success: true,
      message: 'Service offering updated successfully',
      data: offering
    });

  } catch (error) {
    console.error('Error updating service offering:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 6. POST Submit for Approval
exports.submitForApproval = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { id } = req.params;

    const offering = await VendorServiceOffering.findOne({ _id: id, vendorId, deletedAt: null });
    if (!offering) return res.status(404).json({ success: false, message: 'Service offering not found' });

    offering.status = 'PENDING_APPROVAL';
    offering.approvalStatus = 'PENDING';
    await offering.save();

    return res.status(200).json({
      success: true,
      message: 'Service offering submitted for approval',
      data: offering
    });

  } catch (error) {
    console.error('Error submitting service offering:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 7. POST Activate
exports.activateOffering = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { id } = req.params;

    const offering = await VendorServiceOffering.findOne({ _id: id, vendorId, deletedAt: null });
    if (!offering) return res.status(404).json({ success: false, message: 'Service offering not found' });

    if (offering.approvalStatus !== 'APPROVED') {
      return res.status(400).json({ success: false, message: 'Cannot activate. Service is not approved by admin.' });
    }

    offering.status = 'ACTIVE';
    await offering.save();

    return res.status(200).json({
      success: true,
      message: 'Service offering activated successfully',
      data: offering
    });

  } catch (error) {
    console.error('Error activating service offering:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 8. DELETE Archive
exports.archiveOffering = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { id } = req.params;

    const offering = await VendorServiceOffering.findOne({ _id: id, vendorId, deletedAt: null });
    if (!offering) return res.status(404).json({ success: false, message: 'Service offering not found' });

    offering.status = 'ARCHIVED';
    offering.deletedAt = new Date();
    await offering.save();

    return res.status(200).json({
      success: true,
      message: 'Service offering archived successfully',
      data: offering
    });

  } catch (error) {
    console.error('Error archiving service offering:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
