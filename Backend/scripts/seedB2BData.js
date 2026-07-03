require('dotenv').config();
const mongoose = require('mongoose');
const B2BCompany = require('../models/B2BCompany');
const B2BJob = require('../models/B2BJob');
const B2BWallet = require('../models/B2BWallet');
const B2BWalletTransaction = require('../models/B2BWalletTransaction');
const B2BInvoice = require('../models/B2BInvoice');
const B2BEngineerAssignment = require('../models/B2BEngineerAssignment');
const Engineer = require('../models/Engineer');
const SupportTicket = require('../models/SupportTicket');
const SupportMessage = require('../models/SupportMessage');
const SupportAttachment = require('../models/SupportAttachment');
const bcrypt = require('bcryptjs');

async function seed() {
  console.log('Starting B2B Database seeding...');
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI is not set in .env');
    }

    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB.');

    // 1. Clean existing seeded data to prevent duplicates
    await B2BCompany.deleteMany({ email: { $in: ['partner@wbi.in', 'techsolve@wbi.in'] } });
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('Password123', salt);

    // 2. Create the Corporate Partner company (TechSolve Pvt. Ltd.)
    const company = await B2BCompany.create({
      companyName: 'TechSolve Pvt. Ltd.',
      gstNumber: '27TECHSOLV1234Z',
      panNumber: 'TECHSOL123',
      tanNumber: 'TAN1234567',
      cinNumber: 'U72200MH2025PTC123456',
      logoUrl: 'https://images.unsplash.com/photo-1516841273335-e39b37888115?auto=format&fit=crop&w=100&h=100&q=80',
      companyAddress: '404, Tech Tower, Hiranandani, Powai, Mumbai, MH - 400076',
      billingAddress: '404, Tech Tower, Hiranandani, Powai, Mumbai, MH - 400076',
      branches: [
        {
          branchName: 'Mumbai HQ',
          branchAddress: 'Hiranandani, Powai',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400076',
          contactPerson: 'Aditya Sen'
        },
        {
          branchName: 'Pune Depot',
          branchAddress: 'Kalyani Nagar',
          city: 'Pune',
          state: 'Maharashtra',
          pincode: '411006',
          contactPerson: 'Amit Patil'
        },
        {
          branchName: 'Navi Mumbai Hub',
          branchAddress: 'Vashi Sector 17',
          city: 'Navi Mumbai',
          state: 'Maharashtra',
          pincode: '400703',
          contactPerson: 'Vikram Rao'
        },
        {
          branchName: 'Thane Branch',
          branchAddress: 'Ghodbunder Road',
          city: 'Thane',
          state: 'Maharashtra',
          pincode: '400607',
          contactPerson: 'Rahul Nair'
        }
      ],
      authorizedPerson: {
        name: 'TechSolve Partner',
        designation: 'Super Admin',
        email: 'techsolve@wbi.in',
        phone: '9876543210'
      },
      email: 'techsolve@wbi.in',
      phone: '9876543210',
      passwordHash,
      verificationStatus: 'approved',
      isActive: true,
      walletBalance: 154320
    });

    console.log(`Created Company: ${company.companyName} (ID: ${company._id})`);

    // Clean existing database records to avoid duplicate key conflicts
    await B2BJob.deleteMany({});
    await B2BWallet.deleteMany({});
    await B2BWalletTransaction.deleteMany({});
    await B2BInvoice.deleteMany({});
    await B2BEngineerAssignment.deleteMany({});
    await SupportTicket.deleteMany({});
    await SupportMessage.deleteMany({});
    await SupportAttachment.deleteMany({});

    // 3. Create wallet
    const wallet = await B2BWallet.create({
      companyId: company._id,
      balance: 154320
    });
    console.log(`Created Wallet balance: ₹${wallet.balance}`);

    // 4. Create actual Engineer documents in the Engineer collection
    const mockEngineersData = [
      { name: 'Rahul Sharma', phone: '9876543210', email: 'rahul.s@wbi.in', status: 'ONLINE', address: { city: 'Delhi' }, rating: 4.8, completedJobs: 128, experienceLevel: 'Senior (6–10 years)', serviceCategories: ['AC Repair', 'Washing Machine'] },
      { name: 'Amit Singh', phone: '9876543211', email: 'amit.s@wbi.in', status: 'BUSY', address: { city: 'Mumbai' }, rating: 4.6, completedJobs: 98, experienceLevel: 'Mid-level (3–6 years)', serviceCategories: ['AC Repair', 'Microwave'] },
      { name: 'Vikas Patel', phone: '9876543212', email: 'vikas.p@wbi.in', status: 'BUSY', address: { city: 'Thane' }, rating: 4.7, completedJobs: 112, experienceLevel: 'Senior (6–10 years)', serviceCategories: ['Electrical', 'Washing Machine'] },
      { name: 'Suresh Yadav', phone: '9876543213', email: 'suresh.y@wbi.in', status: 'OFFLINE', address: { city: 'Pune' }, rating: 4.4, completedJobs: 76, experienceLevel: 'Mid-level (3–6 years)', serviceCategories: ['Plumbing', 'Sanitization'] },
      { name: 'Neha Verma', phone: '9876543214', email: 'neha.v@wbi.in', status: 'BUSY', address: { city: 'Mumbai' }, rating: 4.9, completedJobs: 156, experienceLevel: 'Senior (6–10 years)', serviceCategories: ['AC Repair', 'Refrigerator'] },
      { name: 'Manoj Kumar', phone: '9876543215', email: 'manoj.k@wbi.in', status: 'ONLINE', address: { city: 'Navi Mumbai' }, rating: 4.5, completedJobs: 84, experienceLevel: 'Senior (6–10 years)', serviceCategories: ['Carpentry', 'Washing Machine'] },
      { name: 'Deepak Yadav', phone: '9876543216', email: 'deepak.y@wbi.in', status: 'BUSY', address: { city: 'Delhi' }, rating: 4.6, completedJobs: 93, experienceLevel: 'Senior (6–10 years)', serviceCategories: ['RO / Filter', 'Water Purifier'] },
      { name: 'Pooja Nair', phone: '9876543217', email: 'pooja.n@wbi.in', status: 'suspended', address: { city: 'Hyderabad' }, rating: 4.7, completedJobs: 67, experienceLevel: 'Mid-level (3–6 years)', serviceCategories: ['Cleaning', 'Pest Control'] }
    ];

    // Delete existing test engineers to avoid duplicate phone conflicts
    await Engineer.deleteMany({ phone: { $in: mockEngineersData.map(e => e.phone) } });

    const seededEngineers = [];
    for (const engData of mockEngineersData) {
      const eng = await Engineer.create({
        ...engData,
        registrationType: 'Individual Engineer / Technician',
        approvalStatus: 'approved',
        password: 'Password123'
      });
      seededEngineers.push(eng);
    }
    console.log(`Successfully seeded ${seededEngineers.length} Engineers in the Engineer collection.`);

    // Helper map of Name -> ObjectId
    const engineerMap = {};
    seededEngineers.forEach(eng => {
      engineerMap[eng.name] = eng._id;
    });

    // 5. Seed Jobs
    // Seed exact jobs linking to correct engineer ObjectIds
    const screenshotJobs = [
      { jobId: 'JOB-12500', service: 'Washing Machine', location: 'Thane', priority: 'High', assignedTo: engineerMap['Vikas Patel'], assignedToName: 'Vikas Patel', status: 'in_progress', charge: 4500, date: new Date() },
      { jobId: 'JOB-12499', service: 'AC Repair', location: 'Mumbai', priority: 'Medium', assignedTo: engineerMap['Amit Singh'], assignedToName: 'Amit Singh', status: 'in_progress', charge: 2200, date: new Date() },
      { jobId: 'JOB-12497', service: 'Refrigerator', location: 'Mumbai', priority: 'High', assignedTo: engineerMap['Neha Verma'], assignedToName: 'Neha Verma', status: 'assigned', charge: 3500, date: new Date() },
      { jobId: 'JOB-12496', service: 'RO / Filter', location: 'Delhi', priority: 'Medium', assignedTo: engineerMap['Deepak Yadav'], assignedToName: 'Deepak Yadav', status: 'in_progress', charge: 2800, date: new Date() }
    ];

    // Seed more jobs spread across May 2025/current year to generate nice chart trendlines
    const extraMayJobs = [];
    const servicesList = ['AC Repair', 'Plumbing', 'Electrician', 'Pest Control', 'Washing Machine'];
    const locationsList = ['Mumbai', 'Pune', 'Navi Mumbai', 'Thane'];
    const prioritiesList = ['Low', 'Medium', 'High'];
    const statusesList = ['completed', 'in_progress', 'pending'];
    const engineersList = ['Rahul Sharma', 'Suresh Yadav', 'Amit Singh', 'Vikas Patel', 'Neha Verma', 'Manoj Kumar', 'Deepak Yadav'];

    // Generate ~40 extra jobs
    for (let day = 1; day <= 28; day++) {
      const numJobs = Math.floor(Math.random() * 2) + 1; // 1 to 2 jobs per day
      for (let j = 0; j < numJobs; j++) {
        const randomNum = Math.floor(Math.random() * 5000) + 1000;
        const jobId = `JOB-${randomNum}`;
        const service = servicesList[Math.floor(Math.random() * servicesList.length)];
        const location = locationsList[Math.floor(Math.random() * locationsList.length)];
        const priority = prioritiesList[Math.floor(Math.random() * prioritiesList.length)];
        const status = statusesList[Math.floor(Math.random() * statusesList.length)];
        
        const engName = status !== 'pending' ? engineersList[Math.floor(Math.random() * engineersList.length)] : null;
        const assignedTo = engName ? engineerMap[engName] : null;
        const charge = Math.floor(1200 + Math.random() * 3000);
        
        const date = new Date();
        date.setDate(day);

        extraMayJobs.push({
          jobId,
          service,
          location,
          priority,
          assignedTo,
          assignedToName: engName,
          status,
          charge,
          date
        });
      }
    }

    const allJobs = [
      ...screenshotJobs,
      ...extraMayJobs
    ].map(j => ({ 
      ...j, 
      companyId: company._id, 
      city: j.location || 'Mumbai', 
      address: `${j.location || 'Mumbai'} Service Point`,
      preferredDate: j.date || new Date(),
      state: 'Maharashtra', 
      pincode: '400076', 
      customerName: 'Test Customer', 
      phone: '9876543210', 
      coordinates: { type: 'Point', coordinates: [72.8777, 19.0760] } 
    }));

    const seededJobsObj = await B2BJob.insertMany(allJobs);
    console.log(`Seeded ${seededJobsObj.length} jobs inside b2b_jobs collection.`);

    // 6. Seed B2BEngineerAssignment records linking jobs & engineers correctly
    const assignmentsToSeed = [];
    seededJobsObj.forEach(job => {
      if (job.assignedTo && job.status !== 'pending') {
        assignmentsToSeed.push({
          companyId: company._id,
          jobId: job._id,
          engineerId: job.assignedTo,
          status: job.status === 'completed' ? 'completed' : 'accepted',
          assignedAt: job.date
        });
      }
    });

    if (assignmentsToSeed.length > 0) {
      const seededAssignments = await B2BEngineerAssignment.insertMany(assignmentsToSeed);
      console.log(`Seeded ${seededAssignments.length} B2BEngineerAssignment records.`);
    }

    // 7. Seed Ledger transactions
    const ledgerTxns = [
      { companyId: company._id, transactionId: 'TXN-001', type: 'topup', amount: 200000, totalAmount: 200000, remark: 'Bank Top Up', date: new Date() },
      { companyId: company._id, transactionId: 'TXN-002', type: 'job_deduction', amount: -2200, totalAmount: -2200, remark: 'Charges for JOB-12499', date: new Date() },
      { companyId: company._id, transactionId: 'TXN-003', type: 'job_deduction', amount: -2800, totalAmount: -2800, remark: 'Charges for JOB-12496', date: new Date() }
    ];
    await B2BWalletTransaction.insertMany(ledgerTxns);
    console.log('Seeded ledger audit records.');

    // 8. Seed invoices matching the reference UI screenshot
    console.log('Generating and seeding realistic B2B Invoices...');
    const { generateAndUploadInvoicePdf } = require('../utils/invoicePdfGenerator');
    
    const companySnapshot = {
      companyName: company.companyName,
      gstNumber: company.gstNumber,
      billingAddress: company.billingAddress || company.companyAddress,
      email: company.email,
      phone: company.phone
    };

    const invoiceTemplates = [
      { invoiceNumber: 'INV-2025-00048', dateOffsetMonth: 5, dateOffsetDay: 30, billingPeriod: 'Jun 2025', totalJobs: 18, subtotal: 88000, gstAmount: 15840, totalAmount: 103840, status: 'paid', paymentStatus: 'paid', paymentMethod: 'Razorpay', transactionId: 'pay_QR12xyZ9876', paymentDate: new Date('2025-07-02T10:00:00Z') },
      { invoiceNumber: 'INV-2025-00047', dateOffsetMonth: 4, dateOffsetDay: 31, billingPeriod: 'May 2025', totalJobs: 22, subtotal: 102000, gstAmount: 18360, totalAmount: 120360, status: 'paid', paymentStatus: 'paid', paymentMethod: 'Razorpay', transactionId: 'pay_AB56cdY1234', paymentDate: new Date('2025-06-03T11:00:00Z') },
      { invoiceNumber: 'INV-2025-00046', dateOffsetMonth: 3, dateOffsetDay: 30, billingPeriod: 'Apr 2025', totalJobs: 16, subtotal: 76000, gstAmount: 13680, totalAmount: 89680, status: 'paid', paymentStatus: 'paid', paymentMethod: 'wallet', transactionId: 'TXN-WLT-998822', paymentDate: new Date('2025-05-01T15:30:00Z') },
      { invoiceNumber: 'INV-2025-00045', dateOffsetMonth: 2, dateOffsetDay: 31, billingPeriod: 'Mar 2025', totalJobs: 20, subtotal: 95000, gstAmount: 17100, totalAmount: 112100, status: 'pending', paymentStatus: 'unpaid' },
      { invoiceNumber: 'INV-2025-00044', dateOffsetMonth: 1, dateOffsetDay: 28, billingPeriod: 'Feb 2025', totalJobs: 15, subtotal: 70000, gstAmount: 12600, totalAmount: 82600, status: 'pending', paymentStatus: 'unpaid' },
      { invoiceNumber: 'INV-2025-00043', dateOffsetMonth: 0, dateOffsetDay: 31, billingPeriod: 'Jan 2025', totalJobs: 19, subtotal: 90000, gstAmount: 16200, totalAmount: 106200, status: 'overdue', paymentStatus: 'unpaid' },
      { invoiceNumber: 'INV-2024-00042', dateOffsetMonth: -1, dateOffsetDay: 31, billingPeriod: 'Dec 2024', totalJobs: 14, subtotal: 64000, gstAmount: 11520, totalAmount: 75520, status: 'overdue', paymentStatus: 'unpaid' },
      { invoiceNumber: 'INV-2024-00041', dateOffsetMonth: -2, dateOffsetDay: 30, billingPeriod: 'Nov 2024', totalJobs: 17, subtotal: 82000, gstAmount: 14760, totalAmount: 96760, status: 'paid', paymentStatus: 'paid', paymentMethod: 'wallet', transactionId: 'TXN-WLT-554411', paymentDate: new Date('2024-12-01T09:15:00Z') }
    ];

    const invoicesToInsert = [];

    for (const template of invoiceTemplates) {
      // Calculate specific dates
      const baseYear = template.invoiceNumber.startsWith('INV-2025') ? 2025 : 2024;
      const invoiceDate = new Date(baseYear, template.dateOffsetMonth, template.dateOffsetDay, 12, 0, 0);
      const dueDate = new Date(invoiceDate);
      dueDate.setDate(dueDate.getDate() + 15); // Net 15

      // Start / End dates of billing period
      const billingPeriodStart = new Date(baseYear, template.dateOffsetMonth, 1, 0, 0, 0);
      const billingPeriodEnd = new Date(baseYear, template.dateOffsetMonth + 1, 0, 23, 59, 59);

      // Extract job IDs completed during this billing period to link them
      const periodJobs = seededJobsObj.filter(
        j => j.status === 'completed' && j.completedAt >= billingPeriodStart && j.completedAt <= billingPeriodEnd
      );

      const invoiceData = {
        companyId: company._id,
        invoiceNumber: template.invoiceNumber,
        invoiceId: template.invoiceNumber, // compatibility
        invoiceType: 'monthly',
        billingPeriod: template.billingPeriod,
        billingPeriodStart,
        billingPeriodEnd,
        invoiceDate,
        dueDate,
        totalJobs: template.totalJobs,
        completedJobIds: periodJobs.map(j => j._id),
        perJobCharge: Math.round(template.subtotal / template.totalJobs),
        platformFee: 0,
        subtotal: template.subtotal,
        gstPercent: 18,
        gstAmount: template.gstAmount,
        totalAmount: template.totalAmount,
        paidAmount: template.paymentStatus === 'paid' ? template.totalAmount : 0,
        status: template.status,
        paymentStatus: template.paymentStatus,
        paymentDate: template.paymentDate || null,
        paymentMethod: template.paymentMethod || null,
        transactionId: template.transactionId || null,
        companySnapshot
      };

      // Create invoice record
      const invoice = await B2BInvoice.create(invoiceData);

      // Generate invoice PDF tax document and upload to Cloudinary
      const pdfUrl = await generateAndUploadInvoicePdf(invoice);
      invoice.invoicePdfUrl = pdfUrl;
      invoice.fileUrl = pdfUrl;
      await invoice.save();

      // Update linked B2B jobs
      if (periodJobs.length > 0) {
        await B2BJob.updateMany(
          { _id: { $in: periodJobs.map(j => j._id) } },
          { $set: { invoiceId: invoice._id } }
        );
      }

      invoicesToInsert.push(invoice);
    }
    console.log(`Seeded ${invoicesToInsert.length} corporate billing invoices with real tax PDFs.`);

    // 9. Seed B2B Support Tickets matching reference UI screenshot
    console.log('Seeding B2B support tickets and conversation threads...');
    
    // Find some jobs/invoices to create links
    const sampleJob = seededJobsObj.find(j => j.jobId === 'JOB-12500');
    const sampleInvoice = invoicesToInsert.find(i => i.invoiceNumber === 'INV-2025-00046');

    const supportTemplates = [
      {
        ticketNumber: 'SUP-2025-00024',
        subject: 'Payment not deducted from wallet',
        category: 'Payment',
        status: 'Open',
        priority: 'High',
        createdAt: new Date('2025-06-30T10:20:00Z'),
        lastUpdate: new Date('2025-06-30T10:25:00Z'),
        description: 'I have completed a job, but the amount is not deducted from my wallet. Please check and resolve this issue.',
        conversation: [
          { senderRole: 'b2b', senderName: company.companyName, msg: 'I have completed a job, but the amount is not deducted from my wallet. Please check and resolve this issue.', time: new Date('2025-06-30T10:20:00Z') },
          { senderRole: 'support', senderName: 'Support Team', msg: 'We have received your request. Our team is checking this and will get back to you soon.', time: new Date('2025-06-30T10:25:00Z') }
        ]
      },
      {
        ticketNumber: 'SUP-2025-00023',
        subject: 'Engineer did not arrive on time',
        category: 'Job Related',
        status: 'In Progress',
        priority: 'Medium',
        createdAt: new Date('2025-06-29T16:15:00Z'),
        lastUpdate: new Date('2025-06-29T17:40:00Z'),
        description: 'The assigned engineer has not arrived at the Thane branch location yet. Please coordinate.',
        relatedJobId: sampleJob ? sampleJob._id : null,
        conversation: [
          { senderRole: 'b2b', senderName: company.companyName, msg: 'The assigned engineer has not arrived at the Thane branch location yet. Please coordinate.', time: new Date('2025-06-29T16:15:00Z') },
          { senderRole: 'support', senderName: 'Support Team', msg: 'We are contacting the engineer Vikas Patel to get his live ETA.', time: new Date('2025-06-29T16:45:00Z') },
          { senderRole: 'b2b', senderName: company.companyName, msg: 'Any update? The store manager is waiting.', time: new Date('2025-06-29T17:20:00Z') },
          { senderRole: 'support', senderName: 'Support Team', msg: 'Engineer experienced a puncture. He is en-route now and should reach within 15 minutes.', time: new Date('2025-06-29T17:40:00Z') }
        ]
      },
      {
        ticketNumber: 'SUP-2025-00022',
        subject: 'Invoice download issue',
        category: 'Invoice',
        status: 'Open',
        priority: 'Medium',
        createdAt: new Date('2025-06-29T11:30:00Z'),
        lastUpdate: new Date('2025-06-29T11:45:00Z'),
        description: 'Unable to download invoice INV-2025-00046. It shows a PDF loading error.',
        relatedInvoiceId: sampleInvoice ? sampleInvoice._id : null,
        conversation: [
          { senderRole: 'b2b', senderName: company.companyName, msg: 'Unable to download invoice INV-2025-00046. It shows a PDF loading error.', time: new Date('2025-06-29T11:30:00Z') },
          { senderRole: 'support', senderName: 'Support Team', msg: 'We have logged this issue. Our tech team is investigating the Cloudinary attachment link.', time: new Date('2025-06-29T11:45:00Z') }
        ]
      },
      {
        ticketNumber: 'SUP-2025-00021',
        subject: 'Want to add more engineers',
        category: 'Account',
        status: 'Resolved',
        priority: 'Low',
        createdAt: new Date('2025-06-28T14:05:00Z'),
        lastUpdate: new Date('2025-06-28T16:10:00Z'),
        description: 'We need to register 5 new field engineers to our dashboard.',
        conversation: [
          { senderRole: 'b2b', senderName: company.companyName, msg: 'We need to register 5 new field engineers to our dashboard.', time: new Date('2025-06-28T14:05:00Z') },
          { senderRole: 'support', senderName: 'Support Team', msg: 'Please share the CSV of details or add them through the Engineers registration tab.', time: new Date('2025-06-28T15:00:00Z') },
          { senderRole: 'b2b', senderName: company.companyName, msg: 'Understood. Registered them through the panel. Thanks!', time: new Date('2025-06-28T16:00:00Z') },
          { senderRole: 'support', senderName: 'Support Team', msg: 'Excellent. Marking this ticket as resolved. Have a great day!', time: new Date('2025-06-28T16:10:00Z') }
        ]
      },
      {
        ticketNumber: 'SUP-2025-00020',
        subject: 'Job marked complete but not done',
        category: 'Job Related',
        status: 'In Progress',
        priority: 'High',
        createdAt: new Date('2025-06-27T09:10:00Z'),
        lastUpdate: new Date('2025-06-27T14:30:00Z'),
        description: 'JOB-12499 was marked completed by engineer but work is still pending.',
        conversation: [
          { senderRole: 'b2b', senderName: company.companyName, msg: 'JOB-12499 was marked completed by engineer but work is still pending.', time: new Date('2025-06-27T09:10:00Z') }
        ]
      },
      {
        ticketNumber: 'SUP-2025-00019',
        subject: 'Unable to assign engineer',
        category: 'Engineer',
        status: 'Resolved',
        priority: 'Medium',
        createdAt: new Date('2025-06-26T18:20:00Z'),
        lastUpdate: new Date('2025-06-26T19:15:00Z'),
        description: 'System displays error while manually assigning Vikas Patel to JOB-12497.',
        conversation: [
          { senderRole: 'b2b', senderName: company.companyName, msg: 'System displays error while manually assigning Vikas Patel to JOB-12497.', time: new Date('2025-06-26T18:20:00Z') }
        ]
      },
      {
        ticketNumber: 'SUP-2025-00018',
        subject: 'Wallet recharge not reflected',
        category: 'Payment',
        status: 'Open',
        priority: 'High',
        createdAt: new Date('2025-06-25T15:40:00Z'),
        lastUpdate: new Date('2025-06-25T15:50:00Z'),
        description: 'We recharge wallet with 200,000 INR but wallet balance shows no change.',
        conversation: [
          { senderRole: 'b2b', senderName: company.companyName, msg: 'We recharge wallet with 200,000 INR but wallet balance shows no change.', time: new Date('2025-06-25T15:40:00Z') }
        ]
      },
      {
        ticketNumber: 'SUP-2025-00017',
        subject: 'Report data mismatch',
        category: 'Reports',
        status: 'Resolved',
        priority: 'Low',
        createdAt: new Date('2025-06-24T13:25:00Z'),
        lastUpdate: new Date('2025-06-24T14:05:00Z'),
        description: 'Monthly expense total is not matching with raw CSV exported rows.',
        conversation: [
          { senderRole: 'b2b', senderName: company.companyName, msg: 'Monthly expense total is not matching with raw CSV exported rows.', time: new Date('2025-06-24T13:25:00Z') }
        ]
      }
    ];

    for (const t of supportTemplates) {
      const ticket = await SupportTicket.create({
        companyId: company._id,
        ticketNumber: t.ticketNumber,
        subject: t.subject,
        description: t.description,
        category: t.category,
        priority: t.priority,
        status: t.status,
        relatedJobId: t.relatedJobId || null,
        relatedInvoiceId: t.relatedInvoiceId || null,
        createdBy: company.authorizedPerson?.name || company.companyName,
        contactEmail: company.email,
        contactNumber: company.phone,
        lastMessageAt: t.lastUpdate,
        createdAt: t.createdAt,
        updatedAt: t.lastUpdate
      });

      for (const msg of t.conversation) {
        await SupportMessage.create({
          ticketId: ticket._id,
          senderId: msg.senderRole === 'b2b' ? company._id : new mongoose.Types.ObjectId(), // Random admin ID for support replies
          senderRole: msg.senderRole,
          senderName: msg.senderName,
          message: msg.msg,
          createdAt: msg.time
        });
      }
    }
    console.log(`Seeded ${supportTemplates.length} support tickets and message histories.`);

    console.log('Seeding process completed successfully!');
  } catch (error) {
    console.error('Seeding failed with error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

seed();
