const FormSchema = require('../../models/FormSchema');
const ServiceRequest = require('../../models/ServiceRequest');
const { initializePaymentForNewRequest } = require('../../services/serviceRequestPayment.service');

const normalizeOptions = (options = []) =>
  (options || []).map((opt) =>
    typeof opt === 'string' ? { value: opt, label: opt } : opt
  );

/** Map DB schema → DynamicForm-friendly config */
const toRendererConfig = (doc) => ({
  subCatCode: doc.subCatCode,
  categoryCode: doc.categoryCode,
  categoryName: doc.categoryName,
  subCategoryName: doc.subCategoryName,
  description: doc.description,
  iconName: doc.iconName,
  basePrice: doc.basePrice,
  fields: (doc.fields || [])
    .slice()
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
    .map((f) => ({
      key: f.fieldName,
      fieldName: f.fieldName,
      label: f.label,
      type: f.type === 'select' ? 'dropdown' : f.type,
      required: !!f.required,
      placeholder: f.placeholder || '',
      options: normalizeOptions(f.options),
      validation: f.validation || {}
    }))
});

const validateAgainstSchema = (fields, formData = {}) => {
  const errors = [];
  for (const field of fields || []) {
    const key = field.fieldName;
    const val = formData[key];
    const empty =
      val === undefined ||
      val === null ||
      (typeof val === 'string' && !val.trim()) ||
      (Array.isArray(val) && val.length === 0);

    if (field.required && empty) {
      errors.push(`${field.label} is required`);
      continue;
    }
    if (empty) continue;

    if (field.type === 'number') {
      const n = Number(val);
      if (Number.isNaN(n)) errors.push(`${field.label} must be a number`);
      if (field.validation?.min != null && n < field.validation.min) {
        errors.push(`${field.label} must be ≥ ${field.validation.min}`);
      }
      if (field.validation?.max != null && n > field.validation.max) {
        errors.push(`${field.label} must be ≤ ${field.validation.max}`);
      }
    }
    if (field.validation?.regex) {
      try {
        const re = new RegExp(field.validation.regex);
        if (!re.test(String(val))) errors.push(`${field.label} format is invalid`);
      } catch {
        /* ignore bad regex in seed */
      }
    }
  }
  return errors;
};

/** Escape user input for safe RegExp */
const escapeRegex = (str = '') => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * GET /api/public/form-schemas/search?q=
 * Production catalog search across all Excel sub-services (C01–C24).
 */
exports.searchSubServices = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      return res.json({ success: true, count: 0, data: [] });
    }
    if (q.length > 80) {
      return res.status(400).json({ success: false, message: 'Search query too long' });
    }

    const regex = new RegExp(escapeRegex(q), 'i');
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 40, 1), 60);

    const docs = await FormSchema.find({
      isActive: true,
      $or: [
        { subCategoryName: regex },
        { description: regex },
        { categoryName: regex },
        { subCatCode: regex },
        { categoryCode: regex }
      ]
    })
      .select('subCatCode subCategoryName description iconName basePrice categoryCode categoryName')
      .sort({ subCatCode: 1 })
      .limit(limit)
      .lean();

    let slugByCode = {};
    try {
      const ServiceCategory = require('../../models/ServiceCategory');
      const codes = [...new Set(docs.map((d) => d.categoryCode).filter(Boolean))];
      if (codes.length) {
        const cats = await ServiceCategory.find({
          categoryCode: { $in: codes },
          isActive: true
        })
          .select('categoryCode slug')
          .lean();
        slugByCode = Object.fromEntries(
          cats.map((c) => [String(c.categoryCode).toUpperCase(), c.slug])
        );
      }
    } catch {
      /* slug enrichment is optional */
    }

    res.json({
      success: true,
      count: docs.length,
      data: docs.map((d) => ({
        _id: d.subCatCode,
        subCatCode: d.subCatCode,
        title: d.subCategoryName,
        name: d.subCategoryName,
        description: d.description || '',
        iconName: d.iconName || 'FiCheckCircle',
        basePrice: d.basePrice,
        categoryCode: d.categoryCode,
        categoryName: d.categoryName,
        categorySlug: slugByCode[String(d.categoryCode).toUpperCase()] || null
      }))
    });
  } catch (error) {
    console.error('searchSubServices error:', error);
    res.status(500).json({ success: false, message: 'Failed to search services' });
  }
};

/** GET /api/public/form-schemas/category/:categoryCode — list sub-services */
exports.listByCategory = async (req, res) => {
  try {
    const categoryCode = String(req.params.categoryCode || '').toUpperCase();
    const docs = await FormSchema.find({ categoryCode, isActive: true })
      .select('subCatCode subCategoryName description iconName basePrice categoryCode categoryName')
      .sort({ subCatCode: 1 })
      .lean();

    res.json({
      success: true,
      data: docs.map((d) => ({
        _id: d.subCatCode,
        subCatCode: d.subCatCode,
        title: d.subCategoryName,
        name: d.subCategoryName,
        description: d.description,
        iconName: d.iconName || 'FiWifi',
        basePrice: d.basePrice,
        rating: 4.8,
        reviews: 48,
        slug: d.subCatCode.toLowerCase(),
        categoryCode: d.categoryCode,
        categoryName: d.categoryName
      }))
    });
  } catch (error) {
    console.error('listByCategory error:', error);
    res.status(500).json({ success: false, message: 'Failed to load sub-services' });
  }
};

/** GET /api/public/form-schemas/:subCatCode */
exports.getFormSchema = async (req, res) => {
  try {
    const subCatCode = String(req.params.subCatCode || '').toUpperCase();
    const doc = await FormSchema.findOne({ subCatCode, isActive: true }).lean();
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Form schema not found' });
    }
    res.json({ success: true, data: toRendererConfig(doc) });
  } catch (error) {
    console.error('getFormSchema error:', error);
    res.status(500).json({ success: false, message: 'Failed to load form schema' });
  }
};

/** POST /api/public/service-requests */
exports.submitServiceRequest = async (req, res) => {
  try {
    const { subCatCode, formData = {} } = req.body || {};
    if (!subCatCode) {
      return res.status(400).json({ success: false, message: 'subCatCode is required' });
    }

    const schema = await FormSchema.findOne({
      subCatCode: String(subCatCode).toUpperCase(),
      isActive: true
    });
    if (!schema) {
      return res.status(404).json({ success: false, message: 'Unknown sub-service' });
    }

    const errors = validateAgainstSchema(schema.fields, formData);
    if (errors.length) {
      return res.status(400).json({ success: false, message: errors[0], errors });
    }

    const request = new ServiceRequest({
      userId: req.user?._id || req.user?.id || null,
      categoryCode: schema.categoryCode,
      categoryName: schema.categoryName,
      subCatCode: schema.subCatCode,
      subCategoryName: schema.subCategoryName,
      formData,
      contact: {
        name: formData.fullName || formData.name || '',
        phone: formData.phone || formData.mobile || '',
        email: formData.email || '',
        city: formData.city || '',
        address: formData.siteAddress || formData.address || ''
      },
      status: 'Pending'
    });
    await request.save();

    const paymentInit = await initializePaymentForNewRequest(request, schema, formData);

    res.status(201).json({
      success: true,
      message: paymentInit.paymentRequired
        ? 'Service request created — complete payment to notify vendors'
        : 'Service request submitted',
      data: {
        requestId: request._id,
        requestCode: request.requestCode,
        subCatCode: request.subCatCode,
        status: request.status,
        paymentRequired: paymentInit.paymentRequired,
        paymentStatus: paymentInit.status,
        amount: paymentInit.amount,
        currency: 'INR',
        razorpayKey: paymentInit.paymentRequired ? process.env.RAZORPAY_KEY_ID : undefined
      }
    });
  } catch (error) {
    console.error('submitServiceRequest error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit request', error: error.message });
  }
};

/** GET /api/public/service-requests/:requestCode — confirmation lookup */
exports.getByCode = async (req, res) => {
  try {
    const doc = await ServiceRequest.findOne({ requestCode: req.params.requestCode }).lean();
    if (!doc) return res.status(404).json({ success: false, message: 'Request not found' });
    res.json({
      success: true,
      data: {
        requestCode: doc.requestCode,
        status: doc.status,
        subCatCode: doc.subCatCode,
        subCategoryName: doc.subCategoryName,
        payment: doc.payment
          ? {
              amount: doc.payment.amount,
              status: doc.payment.status,
              escrowStatus: doc.payment.escrowStatus
            }
          : null
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch request' });
  }
};
