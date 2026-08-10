const mongoose = require('mongoose');
const ServiceCategory = require('../models/ServiceCategory');
const Service = require('../models/Service');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') }); // Make sure dotenv runs with absolute path

const categoriesData = [
  {
    name: 'Electrical',
    services: [
      'Switch/Socket Repair',
      'Fan Installation/Repair',
      'Light Installation/Repair',
      'MCB Replacement',
      'DB Repair',
      'Wiring Repair',
      'Short Circuit Repair',
      'Earthing Check/Repair',
      'Inverter Installation/Repair'
    ]
  },
  {
    name: 'AC / HVAC',
    services: [
      'AC Service',
      'AC Repair',
      'AC Installation',
      'Gas Charging',
      'Gas Leak Repair',
      'AC Cleaning',
      'AC Uninstallation',
      'AC Troubleshooting'
    ]
  },
  {
    name: 'Appliance Repair',
    services: [
      'Refrigerator Repair',
      'Washing Machine Repair',
      'Microwave Repair',
      'TV Repair',
      'Water Purifier Repair',
      'Geyser Repair',
      'Chimney Repair',
      'Mixer/Grinder Repair'
    ]
  },
  {
    name: 'Plumbing',
    services: [
      'Tap Repair/Replacement',
      'Pipe Leakage Repair',
      'Drain Blockage',
      'Flush Repair',
      'Sink Repair',
      'Water Tank/Pipe Repair',
      'Motor/Pump Repair'
    ]
  },
  {
    name: 'CCTV & Security',
    services: [
      'CCTV Camera Installation',
      'CCTV Camera Repair',
      'DVR/NVR Setup',
      'Camera Replacement',
      'Biometric Device Installation',
      'Access Control Repair'
    ]
  },
  {
    name: 'Networking',
    services: [
      'Wi-Fi Router Setup',
      'Router Configuration',
      'LAN Cable Repair',
      'Network Troubleshooting',
      'Printer Network Setup',
      'Computer/Device Network Setup'
    ]
  },
  {
    name: 'Solar / Energy',
    services: [
      'Solar Panel Inspection',
      'Solar Panel Cleaning',
      'Inverter Repair',
      'Battery Replacement',
      'Solar Wiring Repair',
      'Solar System Troubleshooting',
      'EV Charger Repair/Installation'
    ]
  },
  {
    name: 'Healthcare Equipment',
    services: [
      'Medical Equipment Inspection',
      'Medical Equipment Repair',
      'ECG Machine Repair',
      'Patient Monitor Repair',
      'Medical Refrigerator Repair',
      'Oxygen Concentrator Repair',
      'BP Monitor/Small Equipment Repair',
      'Biomedical Equipment Troubleshooting'
    ]
  },
  {
    name: 'Home / Facility',
    services: [
      'Carpentry Repair',
      'Door/Lock Repair',
      'Furniture Repair',
      'Painting Touch-up',
      'Tile Repair',
      'Minor Civil Repair',
      'Pest Control Visit',
      'General Maintenance Visit'
    ]
  }
];

const seedOneTimeServices = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/wbi';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    for (let catIndex = 0; catIndex < categoriesData.length; catIndex++) {
      const catData = categoriesData[catIndex];
      
      const categorySlug = catData.name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/(^-|-$)/g, '');

      let category = await ServiceCategory.findOne({ slug: categorySlug });
      if (!category) {
        category = await ServiceCategory.create({
          name: catData.name,
          slug: categorySlug,
          type: 'ONE_TIME',
          serviceType: 'one_time',
          roles: ['worker', 'engineer'],
          isActive: true,
          displayOrder: catIndex + 1
        });
        console.log(`Created category: ${category.name}`);
      } else {
        // Update existing category to be ONE_TIME
        category.type = 'ONE_TIME';
        category.serviceType = 'one_time';
        await category.save();
        console.log(`Updated category: ${category.name}`);
      }

      for (let srvIndex = 0; srvIndex < catData.services.length; srvIndex++) {
        const srvName = catData.services[srvIndex];
        const srvSlug = srvName.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/(^-|-$)/g, '');

        let service = await Service.findOne({ slug: srvSlug, categoryId: category._id });
        if (!service) {
          service = await Service.create({
            categoryId: category._id,
            title: srvName,
            slug: srvSlug,
            type: 'ONE_TIME',
            basePrice: 0, // Not required to have strict pricing upfront based on prompt
            gstPercentage: 18,
            status: 'active',
            sortOrder: srvIndex + 1,
            description: `Professional ${srvName} service.`
          });
          console.log(`  Created service: ${service.title}`);
        } else {
          // Update existing
          service.type = 'ONE_TIME';
          service.categoryId = category._id;
          await service.save();
          console.log(`  Updated service: ${service.title}`);
        }
      }
    }

    console.log('Seeding completed successfully');
    process.exit(0);
  } catch (err) {
    console.error('Seeding error:', err);
    process.exit(1);
  }
};

seedOneTimeServices();
