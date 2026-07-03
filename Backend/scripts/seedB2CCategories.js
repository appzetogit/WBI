const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const ServiceCategory = require('../models/ServiceCategory');
const OneTimeService = require('../models/OneTimeService');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const dbUrl = process.env.MONGODB_URI;
if (!dbUrl) {
  console.error('MONGODB_URI not found in environment variables');
  process.exit(1);
}

const seedB2CCategories = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(dbUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('MongoDB Connected successfully!');

    const b2cCategoriesList = [
      {
        name: 'Home Appliances',
        slug: 'home-appliances',
        description: 'AC Installation, Refrigerator Repair, Washing Machine Repair & more',
        icon: 'FiSettings',
        displayOrder: 1,
        isActive: true,
        showOnApp: true,
        roles: ['worker'],
        serviceType: 'one_time',
        audience: 'b2c',
        assignedRole: 'worker'
      },
      {
        name: 'Plumbing',
        slug: 'plumbing',
        description: 'Pipe leaks, water tank cleaning, bathroom fittings & motor pump repair',
        icon: 'FiDroplet',
        displayOrder: 2,
        isActive: true,
        showOnApp: true,
        roles: ['worker'],
        serviceType: 'one_time',
        audience: 'b2c',
        assignedRole: 'worker'
      },
      {
        name: 'Electrical',
        slug: 'electrical',
        description: 'House wiring, switchboard repairs, electrical fault finding & light fitting',
        icon: 'FiZap',
        displayOrder: 3,
        isActive: true,
        showOnApp: true,
        roles: ['worker'],
        serviceType: 'one_time',
        audience: 'b2c',
        assignedRole: 'worker'
      },
      {
        name: 'Mobile & Gadgets',
        slug: 'mobile-gadgets',
        description: 'Screen repair, battery replacement, software flashing & setups',
        icon: 'FiSmartphone',
        displayOrder: 4,
        isActive: true,
        showOnApp: true,
        roles: ['worker'],
        serviceType: 'one_time',
        audience: 'b2c',
        assignedRole: 'worker'
      },
      {
        name: 'IT & Computer',
        slug: 'it-computer',
        description: 'Desktop/laptop repairs, OS installation, data recovery & printer setup',
        icon: 'FiMonitor',
        displayOrder: 5,
        isActive: true,
        showOnApp: true,
        roles: ['worker'],
        serviceType: 'one_time',
        audience: 'b2c',
        assignedRole: 'worker'
      },
      {
        name: 'CCTV',
        slug: 'cctv',
        description: 'CCTV Camera installation, repairs, DVR/NVR setup & relocation',
        icon: 'FiVideo',
        displayOrder: 6,
        isActive: true,
        showOnApp: true,
        roles: ['worker'],
        serviceType: 'one_time',
        audience: 'b2c',
        assignedRole: 'worker'
      },
      {
        name: 'Security',
        slug: 'security',
        description: 'Video door phones, smart locks, access control & barriers',
        icon: 'FiLock',
        displayOrder: 7,
        isActive: true,
        showOnApp: true,
        roles: ['worker'],
        serviceType: 'one_time',
        audience: 'b2c',
        assignedRole: 'worker'
      },
      {
        name: 'Telecom',
        slug: 'telecom',
        description: 'EPABX installation, intercom repair, telephone line setup',
        icon: 'FiPhoneCall',
        displayOrder: 8,
        isActive: true,
        showOnApp: true,
        roles: ['worker'],
        serviceType: 'one_time',
        audience: 'b2c',
        assignedRole: 'worker'
      },
      {
        name: 'Banking Devices',
        slug: 'banking-devices',
        description: 'ATM maintenance, POS terminal installation, biometric setups & note counters',
        icon: 'FiBriefcase',
        displayOrder: 9,
        isActive: true,
        showOnApp: true,
        roles: ['worker'],
        serviceType: 'one_time',
        audience: 'b2c',
        assignedRole: 'worker'
      },
      {
        name: 'Audio & Video',
        slug: 'audio-video',
        description: 'TV mounting, home theatre alignment, projector & sound system setups',
        icon: 'FiVolume2',
        displayOrder: 10,
        isActive: true,
        showOnApp: true,
        roles: ['worker'],
        serviceType: 'one_time',
        audience: 'b2c',
        assignedRole: 'worker'
      },
      {
        name: 'Office Equipment',
        slug: 'office-equipment',
        description: 'Shredders, scanners, copiers, EPABX & projector repairs',
        icon: 'FiPrinter',
        displayOrder: 11,
        isActive: true,
        showOnApp: true,
        roles: ['worker'],
        serviceType: 'one_time',
        audience: 'b2c',
        assignedRole: 'worker'
      },
      {
        name: 'Automobile',
        slug: 'automobile',
        description: 'EV Charger installation, car electrical repair, vehicle GPS setups',
        icon: 'FiSettings',
        displayOrder: 12,
        isActive: true,
        showOnApp: true,
        roles: ['worker'],
        serviceType: 'one_time',
        audience: 'b2c',
        assignedRole: 'worker'
      }
    ];

    console.log('Seeding B2C ServiceCategories...');
    const seededCategories = [];
    for (const cat of b2cCategoriesList) {
      // Find or create category
      let category = await ServiceCategory.findOne({ slug: cat.slug });
      if (category) {
        console.log(`Category "${cat.name}" already exists. Updating configurations...`);
        category.serviceType = cat.serviceType;
        category.audience = cat.audience;
        category.assignedRole = cat.assignedRole;
        category.roles = cat.roles;
        category.icon = cat.icon;
        category.displayOrder = cat.displayOrder;
        await category.save();
      } else {
        console.log(`Creating category: ${cat.name}`);
        category = await ServiceCategory.create(cat);
      }
      seededCategories.push(category);
    }

    console.log('Categories seeded. Linking existing OneTimeServices...');
    const homeAppliancesCat = seededCategories.find(c => c.slug === 'home-appliances');
    
    // Find all B2C One-Time Services
    const services = await OneTimeService.find({});
    console.log(`Found ${services.length} existing services.`);

    for (const service of services) {
      if (!service.categoryId) {
        console.log(`Linking service "${service.name}" to Home Appliances category.`);
        service.categoryId = homeAppliancesCat._id;
        await service.save();
      }
    }

    console.log('Seeding complete! Disconnecting from database...');
    await mongoose.disconnect();
    console.log('Database connection closed.');
  } catch (error) {
    console.error('Seeding failed with error:', error);
    process.exit(1);
  }
};

seedB2CCategories();
