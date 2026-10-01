const ServiceRequest = require('../models/ServiceRequest');

const normalizePhone = (p) => String(p || '').replace(/\D/g, '').slice(-10);

const NOT_FOUND = { ok: false, status: 404, message: 'Request not found' };

/**
 * Requests submitted before submissions were tied to an account have userId=null.
 * They are handed to the customer whose login phone matches the contact phone on
 * the request — the only identity those records carry.
 */
async function claimLegacyServiceRequests(user) {
  const phone = normalizePhone(user?.phone);
  if (phone.length !== 10) return 0;

  const orphans = await ServiceRequest.find({ userId: null })
    .select('_id contact.phone')
    .limit(500)
    .lean();
  const ids = orphans
    .filter((sr) => normalizePhone(sr.contact?.phone) === phone)
    .map((sr) => sr._id);
  if (!ids.length) return 0;

  const res = await ServiceRequest.updateMany(
    { _id: { $in: ids }, userId: null },
    { $set: { userId: user._id } }
  );
  return res.modifiedCount || 0;
}

/**
 * Load a service request owned by the logged-in customer.
 * Anything the caller does not own is reported as "not found" so request codes
 * (which are sequential) cannot be probed.
 */
async function findOwnedServiceRequest(requestCode, user) {
  if (!user?._id) return { ok: false, status: 401, message: 'Authentication required' };

  const sr = await ServiceRequest.findOne({ requestCode: String(requestCode || '') });
  if (!sr) return NOT_FOUND;

  if (sr.userId) {
    return String(sr.userId) === String(user._id) ? { ok: true, request: sr } : NOT_FOUND;
  }

  const phone = normalizePhone(user.phone);
  if (phone.length === 10 && phone === normalizePhone(sr.contact?.phone)) {
    const claimed = await ServiceRequest.findOneAndUpdate(
      { _id: sr._id, userId: null },
      { $set: { userId: user._id } },
      { new: true }
    );
    if (claimed) return { ok: true, request: claimed };
  }
  return NOT_FOUND;
}

/** Express helper: resolve ownership or send the error response. */
async function requireOwnedServiceRequest(req, res) {
  const result = await findOwnedServiceRequest(req.params.requestCode, req.user);
  if (!result.ok) {
    res.status(result.status).json({ success: false, message: result.message });
    return null;
  }
  return result.request;
}

module.exports = {
  normalizePhone,
  claimLegacyServiceRequests,
  findOwnedServiceRequest,
  requireOwnedServiceRequest
};
