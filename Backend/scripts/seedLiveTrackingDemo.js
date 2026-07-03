const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const B2BCompany = require('../models/B2BCompany');
const Engineer = require('../models/Engineer');
const B2BJob = require('../models/B2BJob');
const EngineerLocationSession = require('../models/EngineerLocationSession');
const EngineerAssignment = require('../models/EngineerAssignment');
const JobStatusLog = require('../models/JobStatusLog');

const seedDemoData = async () => {
  try {
    console.log('Connecting to MongoDB...');
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      family: 4,
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`✅ MongoDB Connected Successfully: ${conn.connection.host}`);

    // 1. Create or Find B2B Company
    let company = await B2BCompany.findOne({ email: 'admin@techsolve.com' });
    if (!company) {
      company = await B2BCompany.create({
        companyName: 'TechSolve Pvt. Ltd.',
        email: 'admin@techsolve.com',
        phone: '9112223334',
        gstNumber: '07AAAAA1111A1Z1',
        panNumber: 'ABCDE1234F',
        tanNumber: 'DELA12345B',
        companyAddress: 'Sector 62, Noida, UP',
        billingAddress: 'Sector 62, Noida, UP',
        authorizedPerson: {
          name: 'TechSolve Admin',
          designation: 'Manager',
          email: 'admin@techsolve.com',
          phone: '9112223334'
        },
        verificationStatus: 'approved',
        passwordHash: '$2a$10$X8LdC/VvG7j.uQd4Z5E4Fe/eXwD2.hHj0f73mX1K.8lK1Y5z3D1yG' // dummy password hash
      });
      console.log('Test B2B Company created:', company.companyName);
    } else {
      // Ensure company is approved
      company.verificationStatus = 'approved';
      await company.save();
      console.log('Test B2B Company loaded:', company.companyName);
    }

    // 2. Clear old demo jobs, sessions, assignments, logs
    console.log('Cleaning up old tracking sessions and demo jobs...');
    // Find all B2B jobs of this company first to only delete its assignments/logs
    const companyJobIds = await B2BJob.find({ companyId: company._id }).distinct('_id');
    await B2BJob.deleteMany({ companyId: company._id });
    await EngineerAssignment.deleteMany({ companyId: company._id });
    await JobStatusLog.deleteMany({ jobId: { $in: companyJobIds } });

    // 3. Create or Update 5 Field Engineers
    const demoEngineers = [
      {
        name: 'Rahul Sharma',
        email: 'rahul.sharma@wbi.in',
        phone: '9100000001',
        rating: 4.8,
        status: 'BUSY',
        lat: 28.5355, // Delhi Lajpat Nagar
        lng: 77.2410,
        battery: 78,
        sessionStatus: 'en_route'
      },
      {
        name: 'Amit Singh',
        email: 'amit.singh@wbi.in',
        phone: '9100000002',
        rating: 4.6,
        status: 'BUSY',
        lat: 28.5700, // Delhi Connaught Place
        lng: 77.2200,
        battery: 65,
        sessionStatus: 'at_location'
      },
      {
        name: 'Vikas Patel',
        email: 'vikas.patel@wbi.in',
        phone: '9100000003',
        rating: 4.7,
        status: 'BUSY',
        lat: 28.4595, // Gurgaon
        lng: 77.0266,
        battery: 60,
        sessionStatus: 'working'
      },
      {
        name: 'Neha Verma',
        email: 'neha.verma@wbi.in',
        phone: '9100000004',
        rating: 4.9,
        status: 'ONLINE',
        lat: 28.6304, // Delhi Karol Bagh
        lng: 77.1898,
        battery: 40,
        sessionStatus: 'on_break'
      },
      {
        name: 'Suresh Yadav',
        email: 'suresh.yadav@wbi.in',
        phone: '9100000005',
        rating: 4.2,
        status: 'OFFLINE',
        lat: 28.6139, // Noida
        lng: 77.3524,
        battery: 15,
        sessionStatus: 'offline'
      }
    ];

    const engineersList = [];

    for (const data of demoEngineers) {
      let engineer = await Engineer.findOne({ email: data.email });
      if (!engineer) {
        engineer = await Engineer.create({
          name: data.name,
          email: data.email,
          phone: data.phone,
          rating: data.rating,
          status: data.status,
          role: 'engineer',
          roleType: 'Engineer',
          approvalStatus: 'approved',
          profilePhoto: `https://ui-avatars.com/api/?name=${encodeURIComponent(data.name)}&background=10AFA5&color=fff`,
          location: {
            lat: data.lat,
            lng: data.lng,
            updatedAt: new Date()
          },
          geoLocation: {
            type: 'Point',
            coordinates: [data.lng, data.lat]
          }
        });
        console.log('Created Engineer:', data.name);
      } else {
        engineer.status = data.status;
        engineer.location = { lat: data.lat, lng: data.lng, updatedAt: new Date() };
        engineer.geoLocation = { type: 'Point', coordinates: [data.lng, data.lat] };
        await engineer.save();
        console.log('Updated Engineer:', data.name);
      }

      engineersList.push({ engineer, meta: data });

      // Ensure location session exists
      await EngineerLocationSession.findOneAndUpdate(
        { engineerId: engineer._id },
        {
          currentLocation: { type: 'Point', coordinates: [data.lng, data.lat] },
          heading: Math.floor(Math.random() * 360),
          speed: data.sessionStatus === 'en_route' ? 22 : 0,
          battery: data.battery,
          status: data.sessionStatus,
          isOnline: data.sessionStatus !== 'offline',
          lastUpdatedAt: new Date()
        },
        { upsert: true, new: true }
      );
    }

    // 4. Create 5 B2B Jobs assigned to these engineers
    const demoJobs = [
      {
        jobId: 'JOB-TS-12500',
        customerName: 'Ankit Verma',
        service: 'AC Repair',
        address: 'Rohini Sector 7, Delhi',
        lat: 28.7050,
        lng: 77.1260,
        status: 'in_progress',
        trackingStatus: 'en_route',
        eta: 12
      },
      {
        customerName: 'Sanjay Kumar',
        jobId: 'JOB-TS-12499',
        service: 'Washing Machine Repair',
        address: 'Andheri West, Mumbai',
        lat: 19.1136,
        lng: 72.8697,
        status: 'in_progress',
        trackingStatus: 'reached_location',
        eta: 0
      },
      {
        customerName: 'Ajay Gupta',
        jobId: 'JOB-TS-12498',
        service: 'RO Repair',
        address: 'Thane West, Thane',
        lat: 19.2183,
        lng: 72.9781,
        status: 'in_progress',
        trackingStatus: 'work_started',
        eta: 0
      },
      {
        customerName: 'Megha Sen',
        jobId: 'JOB-TS-12497',
        service: 'Electrical Repair',
        address: 'Lajpat Nagar, Delhi',
        lat: 28.5708,
        lng: 77.2393,
        status: 'completed',
        trackingStatus: 'completed',
        eta: 0
      },
      {
        customerName: 'Kunal Sen',
        jobId: 'JOB-TS-12496',
        service: 'Geyser Service',
        address: 'Janakpuri, Delhi',
        lat: 28.6219,
        lng: 77.0878,
        status: 'cancelled',
        trackingStatus: 'cancelled',
        eta: 0
      }
    ];

    for (let i = 0; i < demoJobs.length; i++) {
      const jobData = demoJobs[i];
      const assignedEngData = engineersList[i]; // map 1-to-1 for simplicity

      // Clear any pre-existing job with the same jobId to be absolutely clean
      await B2BJob.deleteOne({ jobId: jobData.jobId });

      const job = await B2BJob.create({
        companyId: company._id,
        jobId: jobData.jobId,
        customerName: jobData.customerName,
        phone: '999999990' + i,
        address: jobData.address,
        city: 'New Delhi',
        state: 'Delhi',
        pincode: '110001',
        coordinates: {
          type: 'Point',
          coordinates: [jobData.lng, jobData.lat]
        },
        service: jobData.service,
        preferredDate: new Date(),
        assignedTo: assignedEngData.engineer._id,
        assignedToName: assignedEngData.engineer.name,
        status: jobData.status,
        trackingStatus: jobData.trackingStatus,
        eta: jobData.eta,
        charge: 500 + i * 100,
        paymentStatus: 'unpaid'
      });

      console.log('Created B2B Job:', job.jobId);

      // Create Assignment record
      await EngineerAssignment.create({
        companyId: company._id,
        jobId: job._id,
        engineerId: assignedEngData.engineer._id,
        status: jobData.trackingStatus,
        assignedAt: new Date(Date.now() - 3600000), // 1 hour ago
        acceptedAt: new Date(Date.now() - 3000000),
        enRouteAt: jobData.trackingStatus === 'en_route' ? new Date(Date.now() - 1200000) : null,
        reachedAt: jobData.trackingStatus === 'reached_location' ? new Date(Date.now() - 600000) : null,
        completedAt: jobData.status === 'completed' ? new Date() : null
      });

      // Create status log history
      await JobStatusLog.create({
        jobId: job._id,
        engineerId: assignedEngData.engineer._id,
        status: 'accepted',
        message: 'Accepted Job',
        timestamp: new Date(Date.now() - 3000000)
      });

      if (['en_route', 'reached_location', 'work_started', 'completed'].includes(jobData.trackingStatus)) {
        await JobStatusLog.create({
          jobId: job._id,
          engineerId: assignedEngData.engineer._id,
          status: 'en_route',
          message: 'En Route',
          timestamp: new Date(Date.now() - 2000000)
        });
      }

      if (['reached_location', 'work_started', 'completed'].includes(jobData.trackingStatus)) {
        await JobStatusLog.create({
          jobId: job._id,
          engineerId: assignedEngData.engineer._id,
          status: 'reached_location',
          message: 'Reached Near Location',
          timestamp: new Date(Date.now() - 1000000)
        });
      }
    }

    console.log('Demo seeder script completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding demo data:', error);
    process.exit(1);
  }
};

seedDemoData();
