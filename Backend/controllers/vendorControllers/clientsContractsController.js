/**
 * Clients & Contracts Controller
 * All functions filter strictly by vendorId
 */
const mongoose = require('mongoose');
const VendorClient = require('../../models/VendorClient');
const VendorContract = require('../../models/VendorContract');
const ScopeChange = require('../../models/ScopeChange');
const ClientConversation = require('../../models/ClientConversation');
const VendorProposal = require('../../models/VendorProposal');
const Vendor = require('../../models/Vendor');

const getVendorId = (req) => req.user._id || req.user.id;

const getVendorCategoryCodes = async (vendorId) => {
  const vendor = await Vendor.findById(vendorId).select('approvedServices').lean();
  if (!vendor?.approvedServices?.length) return [];
  return vendor.approvedServices
    .filter((s) => s.status === 'active')
    .map((s) => s.categoryCode)
    .filter(Boolean);
};

// ── Counts ───────────────────────────────────────────────
const getCounts = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const vid = new mongoose.Types.ObjectId(vendorId);

    const [individual, b2b, unreadConvos, pendingScope, activeContracts, proposalsPending] = await Promise.all([
      VendorClient.countDocuments({ vendorId: vid, type: 'individual', status: { $ne: 'inactive' } }),
      VendorClient.countDocuments({ vendorId: vid, type: 'b2b', status: { $ne: 'inactive' } }),
      ClientConversation.countDocuments({ vendorId: vid, unreadCount: { $gt: 0 } }),
      ScopeChange.countDocuments({ vendorId: vid, status: 'pending' }),
      VendorContract.countDocuments({ vendorId: vid, status: 'active' }),
      VendorProposal.countDocuments({ vendorId: vid, status: { $in: ['sent', 'viewed', 'negotiating'] } })
    ]);

    res.status(200).json({
      success: true,
      data: {
        individualClients: individual,
        b2bClients: b2b,
        conversationsUnread: unreadConvos,
        proposalsPending,
        activeContracts,
        scopeChangesPending: pendingScope,
        totalClients: individual + b2b
      }
    });
  } catch (error) {
    console.error('getCounts error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch counts' });
  }
};

// ── Clients ──────────────────────────────────────────────
const getClients = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const {
      type,
      status,
      category,
      city,
      search,
      sort = 'lastActivityAt',
      order = 'desc',
      page = 1,
      limit = 12
    } = req.query;

    const filter = { vendorId: new mongoose.Types.ObjectId(vendorId) };
    if (type) filter.type = type;
    if (status) filter.status = status;
    if (category) filter.serviceCategoryCodes = category;
    if (city) filter.city = new RegExp(city, 'i');

    // Dynamic: if no category filter, optionally restrict to vendor approved services
    if (!category) {
      const codes = await getVendorCategoryCodes(vendorId);
      if (codes.length) {
        filter.$or = [
          { serviceCategoryCodes: { $in: codes } },
          { serviceCategoryCodes: { $size: 0 } },
          { serviceCategoryCodes: { $exists: false } }
        ];
      }
    }

    if (search && search.trim()) {
      const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$and = (filter.$and || []).concat([{
        $or: [
          { name: rx },
          { company: rx },
          { city: rx },
          { email: rx },
          { phone: rx },
          { industry: rx }
        ]
      }]);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortObj = { [sort]: order === 'asc' ? 1 : -1 };

    const [data, total] = await Promise.all([
      VendorClient.find(filter).sort(sortObj).skip(skip).limit(parseInt(limit)).lean(),
      VendorClient.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)) || 1
      }
    });
  } catch (error) {
    console.error('getClients error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch clients' });
  }
};

const getClientById = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const client = await VendorClient.findOne({
      _id: req.params.id,
      vendorId: new mongoose.Types.ObjectId(vendorId)
    }).lean();

    if (!client) return res.status(404).json({ success: false, message: 'Client not found' });

    const [contracts, conversations, scopeChanges] = await Promise.all([
      VendorContract.find({ vendorId: vendorId, clientId: client._id }).sort({ createdAt: -1 }).limit(5).lean(),
      ClientConversation.find({ vendorId: vendorId, clientId: client._id }).sort({ lastMessageAt: -1 }).limit(3).lean(),
      ScopeChange.find({ vendorId: vendorId, clientId: client._id }).sort({ createdAt: -1 }).limit(5).lean()
    ]);

    res.status(200).json({
      success: true,
      data: { ...client, recentContracts: contracts, recentConversations: conversations, recentScopeChanges: scopeChanges }
    });
  } catch (error) {
    console.error('getClientById error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch client' });
  }
};

const createClient = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const { type, name, company, email, phone, city, state, gstNumber, industry, serviceCategoryCodes, serviceCategoryNames, status, priority } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name is required' });
    if (!type || !['individual', 'b2b'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Valid type (individual|b2b) is required' });
    }

    const client = await VendorClient.create({
      vendorId: new mongoose.Types.ObjectId(vendorId),
      type,
      name,
      company: company || '',
      email: email || '',
      phone: phone || '',
      city: city || '',
      state: state || '',
      gstNumber: gstNumber || '',
      industry: industry || '',
      serviceCategoryCodes: serviceCategoryCodes || [],
      serviceCategoryNames: serviceCategoryNames || [],
      status: status || 'prospect',
      priority: priority || 'normal',
      lastActivityAt: new Date()
    });

    res.status(201).json({ success: true, message: 'Client created', data: client });
  } catch (error) {
    console.error('createClient error:', error);
    res.status(500).json({ success: false, message: 'Failed to create client' });
  }
};

const updateClient = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const client = await VendorClient.findOne({
      _id: req.params.id,
      vendorId: new mongoose.Types.ObjectId(vendorId)
    });
    if (!client) return res.status(404).json({ success: false, message: 'Client not found' });

    const allowed = [
      'name', 'company', 'email', 'phone', 'city', 'state', 'gstNumber', 'industry',
      'companySize', 'serviceCategoryCodes', 'serviceCategoryNames', 'status', 'rating',
      'totalSpend', 'pendingPayments', 'activeProjects', 'totalSites', 'cities',
      'assignedTeam', 'slaTier', 'priority', 'tags', 'notes'
    ];
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) client[key] = req.body[key];
    });
    client.lastActivityAt = new Date();
    await client.save();

    res.status(200).json({ success: true, message: 'Client updated', data: client });
  } catch (error) {
    console.error('updateClient error:', error);
    res.status(500).json({ success: false, message: 'Failed to update client' });
  }
};

// ── Contracts ────────────────────────────────────────────
const getContracts = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const { status, search, page = 1, limit = 12 } = req.query;
    const filter = { vendorId: new mongoose.Types.ObjectId(vendorId) };
    if (status) filter.status = status;
    if (search && search.trim()) {
      const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ title: rx }, { contractCode: rx }];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [data, total] = await Promise.all([
      VendorContract.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('clientId', 'name company type city')
        .lean(),
      VendorContract.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)) || 1
      }
    });
  } catch (error) {
    console.error('getContracts error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch contracts' });
  }
};

const getContractById = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const contract = await VendorContract.findOne({
      _id: req.params.id,
      vendorId: new mongoose.Types.ObjectId(vendorId)
    }).populate('clientId', 'name company type city email phone').lean();

    if (!contract) return res.status(404).json({ success: false, message: 'Contract not found' });
    res.status(200).json({ success: true, data: contract });
  } catch (error) {
    console.error('getContractById error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch contract' });
  }
};

const createContract = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const { clientId, title, value, startDate, endDate, warrantyMonths, amc, serviceCategoryCode, serviceCategoryName } = req.body;
    if (!clientId || !title || !startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'clientId, title, startDate, endDate are required' });
    }

    const client = await VendorClient.findOne({
      _id: clientId,
      vendorId: new mongoose.Types.ObjectId(vendorId)
    });
    if (!client) return res.status(404).json({ success: false, message: 'Client not found' });

    const contract = new VendorContract({
      vendorId: new mongoose.Types.ObjectId(vendorId),
      clientId,
      title,
      value: value || 0,
      startDate,
      endDate,
      warrantyMonths: warrantyMonths || 12,
      amc: amc || { enabled: false },
      serviceCategoryCode: serviceCategoryCode || '',
      serviceCategoryName: serviceCategoryName || '',
      status: 'draft'
    });
    await contract.save();

    res.status(201).json({ success: true, message: 'Contract created', data: contract });
  } catch (error) {
    console.error('createContract error:', error);
    res.status(500).json({ success: false, message: 'Failed to create contract' });
  }
};

const updateContract = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const contract = await VendorContract.findOne({
      _id: req.params.id,
      vendorId: new mongoose.Types.ObjectId(vendorId)
    });
    if (!contract) return res.status(404).json({ success: false, message: 'Contract not found' });

    const { status, action, renewalDate, value, title, notes, signatures } = req.body;

    if (action === 'renew') {
      contract.status = 'active';
      contract.renewalDate = renewalDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      contract.version += 1;
      if (renewalDate) contract.endDate = renewalDate;
    } else if (action === 'terminate') {
      contract.status = 'terminated';
    } else if (status) {
      contract.status = status;
    }

    if (value !== undefined) contract.value = value;
    if (title) contract.title = title;
    if (notes !== undefined) contract.notes = notes;
    if (signatures) contract.signatures = signatures;
    if (renewalDate && action !== 'renew') contract.renewalDate = renewalDate;

    await contract.save();
    res.status(200).json({ success: true, message: 'Contract updated', data: contract });
  } catch (error) {
    console.error('updateContract error:', error);
    res.status(500).json({ success: false, message: 'Failed to update contract' });
  }
};

// ── Scope Changes ────────────────────────────────────────
const getScopeChanges = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const { status, page = 1, limit = 12 } = req.query;
    const filter = { vendorId: new mongoose.Types.ObjectId(vendorId) };
    if (status) filter.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [data, total] = await Promise.all([
      ScopeChange.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('clientId', 'name company type')
        .populate('contractId', 'contractCode title')
        .lean(),
      ScopeChange.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)) || 1
      }
    });
  } catch (error) {
    console.error('getScopeChanges error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch scope changes' });
  }
};

const createScopeChange = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const { clientId, contractId, title, previousScope, updatedScope, costDelta, timelineDeltaDays, reason, requestedBy } = req.body;
    if (!clientId || !title || !previousScope || !updatedScope) {
      return res.status(400).json({ success: false, message: 'clientId, title, previousScope, updatedScope are required' });
    }

    const change = new ScopeChange({
      vendorId: new mongoose.Types.ObjectId(vendorId),
      clientId,
      contractId: contractId || null,
      title,
      previousScope,
      updatedScope,
      costDelta: costDelta || 0,
      timelineDeltaDays: timelineDeltaDays || 0,
      reason: reason || '',
      requestedBy: requestedBy || 'Client',
      status: 'pending'
    });
    await change.save();

    res.status(201).json({ success: true, message: 'Scope change created', data: change });
  } catch (error) {
    console.error('createScopeChange error:', error);
    res.status(500).json({ success: false, message: 'Failed to create scope change' });
  }
};

const updateScopeChange = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const change = await ScopeChange.findOne({
      _id: req.params.id,
      vendorId: new mongoose.Types.ObjectId(vendorId)
    });
    if (!change) return res.status(404).json({ success: false, message: 'Scope change not found' });
    if (change.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Only pending scope changes can be updated' });
    }

    const { status, approvedBy } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'status must be approved or rejected' });
    }

    change.status = status;
    change.approvedBy = approvedBy || (status === 'approved' ? 'Vendor' : null);
    change.decidedAt = new Date();
    await change.save();

    res.status(200).json({ success: true, message: `Scope change ${status}`, data: change });
  } catch (error) {
    console.error('updateScopeChange error:', error);
    res.status(500).json({ success: false, message: 'Failed to update scope change' });
  }
};

// ── Conversations ────────────────────────────────────────
const getConversations = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const { channel, unread, search, page = 1, limit = 20 } = req.query;
    const filter = { vendorId: new mongoose.Types.ObjectId(vendorId) };
    if (channel && channel !== 'all') filter.channel = channel;
    if (unread === 'true') filter.unreadCount = { $gt: 0 };
    if (search && search.trim()) {
      filter.subject = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [data, total] = await Promise.all([
      ClientConversation.find(filter)
        .sort({ pinned: -1, lastMessageAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('clientId', 'name company type city')
        .select('-messages')
        .lean(),
      ClientConversation.countDocuments(filter)
    ]);

    // Attach last message preview
    const withPreview = await Promise.all(data.map(async (thread) => {
      const full = await ClientConversation.findById(thread._id).select('messages').lean();
      const last = full?.messages?.[full.messages.length - 1];
      return {
        ...thread,
        lastMessage: last ? { text: last.text, sender: last.sender, createdAt: last.createdAt } : null
      };
    }));

    res.status(200).json({
      success: true,
      data: withPreview,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)) || 1
      }
    });
  } catch (error) {
    console.error('getConversations error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch conversations' });
  }
};

const getConversationById = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const convo = await ClientConversation.findOne({
      _id: req.params.id,
      vendorId: new mongoose.Types.ObjectId(vendorId)
    }).populate('clientId', 'name company type city phone email').lean();

    if (!convo) return res.status(404).json({ success: false, message: 'Conversation not found' });

    // Mark as read
    await ClientConversation.updateOne(
      { _id: req.params.id },
      { $set: { unreadCount: 0 } }
    );

    res.status(200).json({ success: true, data: { ...convo, unreadCount: 0 } });
  } catch (error) {
    console.error('getConversationById error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch conversation' });
  }
};

const sendMessage = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const { text, attachments, internal } = req.body;
    if (!text?.trim() && !attachments?.length) {
      return res.status(400).json({ success: false, message: 'Message text or attachment required' });
    }

    const convo = await ClientConversation.findOne({
      _id: req.params.id,
      vendorId: new mongoose.Types.ObjectId(vendorId)
    });
    if (!convo) return res.status(404).json({ success: false, message: 'Conversation not found' });

    const msg = {
      sender: 'vendor',
      text: text || '',
      attachments: attachments || [],
      internal: !!internal,
      createdAt: new Date()
    };
    convo.messages.push(msg);
    convo.lastMessageAt = new Date();
    await convo.save();

    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`vendor-${vendorId}`).emit('client_message', {
          conversationId: convo._id,
          message: msg
        });
      }
    } catch (_) { /* non-critical */ }

    res.status(201).json({
      success: true,
      message: 'Message sent',
      data: msg
    });
  } catch (error) {
    console.error('sendMessage error:', error);
    res.status(500).json({ success: false, message: 'Failed to send message' });
  }
};

// ── Proposals (reuse VendorProposal with client populate) ─
const getProposals = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const { status, clientId, page = 1, limit = 12 } = req.query;
    const filter = { vendorId: new mongoose.Types.ObjectId(vendorId) };
    if (status) filter.status = status;
    if (clientId) filter.clientId = new mongoose.Types.ObjectId(clientId);

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [proposals, total, statusCounts] = await Promise.all([
      VendorProposal.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('clientId', 'name company type')
        .populate('opportunityId', 'title categoryName clientInfo.company')
        .lean(),
      VendorProposal.countDocuments(filter),
      VendorProposal.aggregate([
        { $match: { vendorId: new mongoose.Types.ObjectId(vendorId) } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ])
    ]);

    const counts = statusCounts.reduce((acc, c) => ({ ...acc, [c._id]: c.count }), {});

    res.status(200).json({
      success: true,
      data: proposals,
      statusCounts: {
        all: Object.values(counts).reduce((s, v) => s + v, 0),
        draft: counts.draft || 0,
        sent: counts.sent || 0,
        viewed: counts.viewed || 0,
        accepted: counts.accepted || 0,
        rejected: counts.rejected || 0,
        negotiating: counts.negotiating || 0
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)) || 1
      }
    });
  } catch (error) {
    console.error('getProposals (CC) error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch proposals' });
  }
};

module.exports = {
  getCounts,
  getClients,
  getClientById,
  createClient,
  updateClient,
  getContracts,
  getContractById,
  createContract,
  updateContract,
  getScopeChanges,
  createScopeChange,
  updateScopeChange,
  getConversations,
  getConversationById,
  sendMessage,
  getProposals
};
