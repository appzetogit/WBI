const SiteTestingEnquiry = require('../models/SiteTestingEnquiry');
const { queueOpportunityFromEnquiry, buildAssignmentMetaFromEnquiry } = require('../utils/createOpportunityFromEnquiry');

/** The signed-in actor, whatever the auth middleware called the field. */
const actorId = (req) => req.user?._id || req.user?.id || null;

// CREATE an enquiry (Public App)
exports.createEnquiry = async (req, res) => {
  try {
    const newEnquiry = await SiteTestingEnquiry.create(req.body);
    
    // Notify admin clients
    if (global.io) {
      global.io.emit('newEnquiry', {
        type: 'Site Testing',
        data: newEnquiry
      });
    }

    queueOpportunityFromEnquiry({
      enquiry: newEnquiry,
      enquiryType: 'sitetesting',
      enquiryModel: 'SiteTestingEnquiry',
      titlePrefix: `Site testing — ${newEnquiry.city || 'Site'}`,
      assignmentMeta: buildAssignmentMetaFromEnquiry(newEnquiry)
    });

    res.status(201).json({
      success: true,
      message: 'Site Testing Enquiry submitted successfully',
      data: newEnquiry
    });
  } catch (error) {
    console.error('Error creating site testing enquiry:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// GET all enquiries (Admin)
exports.getEnquiries = async (req, res) => {
  try {
    const enquiries = await SiteTestingEnquiry.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      data: enquiries
    });
  } catch (error) {
    console.error('Error fetching site testing enquiries:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// GET single enquiry
exports.getEnquiry = async (req, res) => {
  try {
    const enquiry = await SiteTestingEnquiry.findById(req.params.id);
    if (!enquiry) {
      return res.status(404).json({ success: false, message: 'Enquiry not found' });
    }
    res.status(200).json({ success: true, data: enquiry });
  } catch (error) {
    console.error('Error fetching site testing enquiry:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// UPDATE status (Admin)
exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['New', 'Testing Scheduled', 'Testing In Progress', 'Report Generating', 'Report Sent', 'Closed'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const enquiry = await SiteTestingEnquiry.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );

    if (!enquiry) {
      return res.status(404).json({ success: false, message: 'Enquiry not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Status updated successfully',
      data: enquiry
    });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// DELETE an enquiry
exports.deleteEnquiry = async (req, res) => {
  try {
    const enquiry = await SiteTestingEnquiry.findByIdAndDelete(req.params.id);
    if (!enquiry) {
      return res.status(404).json({ success: false, message: 'Enquiry not found' });
    }
    res.status(200).json({ success: true, message: 'Enquiry deleted successfully' });
  } catch (error) {
    console.error('Error deleting enquiry:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// BROADCAST to Vendor Radar
exports.broadcastToVendors = async (req, res) => {
  try {
    const enquiry = await SiteTestingEnquiry.findById(req.params.id);
    if (!enquiry) {
      return res.status(404).json({ success: false, message: 'Enquiry not found' });
    }
    
    const Booking = require('../models/Booking');
    const User = require('../models/User');
    const UserService = require('../models/UserService');
    
    const B2BCompany = require('../models/B2BCompany');
    
    // Fallback B2B User & Service for Enterprise Jobs
    let user = await User.findOne({ email: 'b2b-enterprise@appzeto.com' });
    if (!user) {
      user = await User.create({ name: 'B2B Enterprise', email: 'b2b-enterprise@appzeto.com', phone: '9999999999', isVerified: true });
    }
    
    // Find or create B2BCompany and Wallet for escrow logic
    let b2bCompany = await B2BCompany.findOne({ primaryEmail: 'b2b-enterprise@appzeto.com' });
    if (!b2bCompany) {
      b2bCompany = await B2BCompany.create({
        companyName: 'B2B Enterprise',
        primaryEmail: 'b2b-enterprise@appzeto.com',
        primaryPhone: '9999999999',
        status: 'Active'
      });
    }

    const walletLedger = require('../services/b2bWalletLedger.service');
    // The wallet starts empty: money only ever enters through a top-up that
    // writes a ledger row. It is never pre-funded here.
    await walletLedger.ensureWallet(b2bCompany._id);

    const estimatedQuote = 5000;

    // Freeze (escrow) the funds — the ledger refuses if they are not there.
    let reservation;
    try {
      reservation = await walletLedger.reserve({
        companyId: b2bCompany._id,
        amount: estimatedQuote,
        reservationId: `SITE-${enquiry._id}`,
        idempotencyKey: `site-testing:${enquiry._id}`,
        remark: `Site testing escrow — enquiry ${enquiry._id}`,
        actor: { actorId: actorId(req) || null, role: req.user?.role || 'admin' }
      });
    } catch (err) {
      if (err.code === 'INSUFFICIENT_FUNDS') {
        return res.status(402).json({
          success: false,
          message: 'Insufficient funds in the B2B wallet for escrow. Please top up.',
          ...err.details
        });
      }
      throw err;
    }

    let service = await UserService.findOne({ serviceName: 'Enterprise Site Testing' });
    if (!service) {
      service = await UserService.create({ serviceName: 'Enterprise Site Testing', basePrice: estimatedQuote, categoryId: null });
    }

    // Generate Booking
    const bookingNumber = 'B2B-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    
    const newBooking = new Booking({
      bookingNumber,
      userId: user._id,
      serviceId: service._id,
      serviceName: 'Enterprise Site Testing',
      serviceCategory: 'B2B Projects',
      urgencyLevel: 'urgent',
      basePrice: estimatedQuote, // Fixed B2B estimate
      totalAmount: estimatedQuote,
      paymentStatus: 'escrowed', // Mark as escrowed
      bookingStatus: 'searching', // Key for Vendor Radar
      address: {
        addressLine1: enquiry.siteAddress,
        city: enquiry.city,
        state: 'N/A',
        zipCode: '000000',
        location: { type: 'Point', coordinates: [77.209, 28.6139] } // Default coordinates
      },
      scheduleDate: enquiry.preferredVisitDate || new Date(),
      scheduleTime: enquiry.preferredTimeSlot || 'Anytime'
    });

    await newBooking.save();

    // Broadcast Socket Event to Vendors
    if (global.io) {
      global.io.emit('new_vendor_radar_job', {
        type: 'B2B_SITE_TESTING',
        booking: newBooking
      });
    }
    
    enquiry.status = 'Testing Scheduled';
    await enquiry.save();

    res.status(200).json({
      success: true,
      message: 'Broadcasted to Vendor Radar successfully',
      booking: newBooking,
      escrow: { amount: estimatedQuote, wallet: reservation.balance }
    });
  } catch (error) {
    console.error('Error broadcasting enquiry:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
