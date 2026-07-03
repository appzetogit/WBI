const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const ServiceCategory = require('../models/ServiceCategory');
const OneTimeService = require('../models/OneTimeService');
const ServiceIssue = require('../models/ServiceIssue');
const ServiceBrand = require('../models/ServiceBrand');
const ServicePackage = require('../models/ServicePackage');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const dbUrl = process.env.MONGODB_URI;
if (!dbUrl) {
  console.error('MONGODB_URI not found in environment variables');
  process.exit(1);
}

const servicesConfig = [
  {
    name: 'Home Cleaning',
    slug: 'home-cleaning',
    description: 'Deep professional cleaning for rooms, bathrooms, kitchens, and full apartments.',
    image: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=500&q=80',
    estimatedDuration: '120-180 mins',
    startingPrice: 599,
    isBrandRequired: false,
    isIssueRequired: true,
    isPackageRequired: true,
    allowsOtherProblem: true,
    categorySlug: 'home-appliances',
    problems: [
      'Full Home Cleaning',
      'Bathroom Cleaning',
      'Kitchen Cleaning',
      'Sofa Cleaning',
      'Carpet Cleaning',
      'Deep Cleaning',
      'Other'
    ],
    brands: []
  },
  {
    name: 'Laundry',
    slug: 'laundry',
    description: 'Dry cleaning, wash & iron, wash & fold services with doorstep pickup and delivery.',
    image: 'https://images.unsplash.com/photo-1545173168-9f1947e80154?w=500&q=80',
    estimatedDuration: '45 mins',
    startingPrice: 199,
    isBrandRequired: false,
    isIssueRequired: true,
    isPackageRequired: true,
    allowsOtherProblem: true,
    categorySlug: 'home-appliances',
    problems: [
      'Wash & Fold',
      'Wash & Iron',
      'Dry Cleaning',
      'Stain Removal',
      'Curtain Cleaning',
      'Pickup & Delivery Issue',
      'Other'
    ],
    brands: []
  },
  {
    name: 'Beauty Services',
    slug: 'beauty-services',
    description: 'Salon and beautician services at home including waxing, facial, manicure, and makeup.',
    image: 'https://images.unsplash.com/photo-1560750588-73207b1ef5b8?w=500&q=80',
    estimatedDuration: '90 mins',
    startingPrice: 399,
    isBrandRequired: false,
    isIssueRequired: true,
    isPackageRequired: true,
    allowsOtherProblem: true,
    categorySlug: 'home-appliances',
    problems: [
      'Facial',
      'Waxing',
      'Threading',
      'Manicure/Pedicure',
      'Hair Spa',
      'Bridal/Party Makeup',
      'Other'
    ],
    brands: []
  },
  {
    name: 'Salon at Home',
    slug: 'salon-at-home',
    description: 'Haircut, beard trimming, shaving, hair coloring, and body massages at the comfort of your home.',
    image: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=500&q=80',
    estimatedDuration: '60 mins',
    startingPrice: 249,
    isBrandRequired: false,
    isIssueRequired: true,
    isPackageRequired: true,
    allowsOtherProblem: true,
    categorySlug: 'home-appliances',
    problems: [
      'Haircut',
      'Beard Trim',
      'Hair Color',
      'Facial',
      'Massage',
      'Grooming Package',
      'Other'
    ],
    brands: []
  },
  {
    name: 'Carpenter',
    slug: 'carpenter',
    description: 'Door lock repair, furniture assembly, cabinet door alignments, and custom wood works.',
    image: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=500&q=80',
    estimatedDuration: '60-120 mins',
    startingPrice: 149,
    isBrandRequired: false,
    isIssueRequired: true,
    isPackageRequired: true,
    allowsOtherProblem: true,
    categorySlug: 'home-appliances',
    problems: [
      'Door Lock Repair',
      'Cabinet Door Alignment',
      'Sofa Repair',
      'Furniture Assembly',
      'Wooden Partition Installation',
      'Other'
    ],
    brands: []
  },
  {
    name: 'Appliance Repair',
    slug: 'appliance-repair',
    description: 'Diagnostic and repair services for minor household electrical appliances.',
    image: 'https://images.unsplash.com/photo-1581092921461-eab62e97a780?w=500&q=80',
    estimatedDuration: '60 mins',
    startingPrice: 299,
    isBrandRequired: true,
    isIssueRequired: true,
    isPackageRequired: true,
    allowsOtherProblem: true,
    categorySlug: 'appliance-solutions',
    problems: [
      'Appliance Not Working',
      'Noise Issue',
      'Power Issue',
      'Installation',
      'Servicing',
      'Spare Part Required',
      'Other'
    ],
    brands: ['LG', 'Samsung', 'Panasonic', 'Philips', 'Havells']
  },
  {
    name: 'Car Wash',
    slug: 'car-wash',
    description: 'Eco-friendly waterless exterior wash, internal detailing, vacuuming, and polish.',
    image: 'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?w=500&q=80',
    estimatedDuration: '45-90 mins',
    startingPrice: 299,
    isBrandRequired: false,
    isIssueRequired: true,
    isPackageRequired: true,
    allowsOtherProblem: true,
    categorySlug: 'automobile',
    problems: [
      'Exterior Wash',
      'Interior Cleaning',
      'Full Car Wash',
      'Wax Polish',
      'Engine Cleaning',
      'Seat Cleaning',
      'Other'
    ],
    brands: []
  },
  {
    name: 'Home Maintenance',
    slug: 'home-maintenance',
    description: 'General repair, window fix, floor check, and fixing fixtures around the house.',
    image: 'https://images.unsplash.com/photo-1505797149-43b0069ec26b?w=500&q=80',
    estimatedDuration: '60-120 mins',
    startingPrice: 199,
    isBrandRequired: false,
    isIssueRequired: true,
    isPackageRequired: true,
    allowsOtherProblem: true,
    categorySlug: 'home-appliances',
    problems: [
      'General Inspection',
      'Minor Repair',
      'Door/Window Fix',
      'Fixture Repair',
      'Wall/Floor Minor Repair',
      'Multiple Small Tasks',
      'Other'
    ],
    brands: []
  },
  {
    name: 'AC Installation & Service',
    slug: 'ac-service',
    description: 'AC deep jet cleaning, filter cleaning, gas level inspection, and general servicing.',
    image: 'https://images.unsplash.com/photo-1621905252507-b354bc25edac?w=500&q=80',
    estimatedDuration: '45-60 mins',
    startingPrice: 349,
    isBrandRequired: true,
    isIssueRequired: true,
    isPackageRequired: true,
    allowsOtherProblem: true,
    categorySlug: 'appliance-solutions',
    problems: [
      'Cooling Issue',
      'Gas Filling',
      'Water Leakage',
      'Installation',
      'Uninstallation',
      'PCB Fault',
      'Other'
    ],
    brands: ['Daikin', 'Voltas', 'LG', 'Samsung', 'Blue Star', 'Lloyd', 'Carrier']
  },
  {
    name: 'Refrigerator Repair',
    slug: 'refrigerator-repair',
    description: 'Fridge gas filling, compressor repair, door seal repair, and cooling fix.',
    image: 'https://images.unsplash.com/photo-1571175432267-efb92f44775a?w=500&q=80',
    estimatedDuration: '60-90 mins',
    startingPrice: 299,
    isBrandRequired: true,
    isIssueRequired: true,
    isPackageRequired: true,
    allowsOtherProblem: true,
    categorySlug: 'appliance-solutions',
    problems: [
      'Not Cooling',
      'Water Leakage',
      'Compressor Issue',
      'Door Issue',
      'Noise Issue',
      'Ice Build-up',
      'Other'
    ],
    brands: ['LG', 'Samsung', 'Whirlpool', 'Godrej', 'Haier']
  },
  {
    name: 'Washing Machine Repair',
    slug: 'washing-machine-repair',
    description: 'Drum repair, motor repair, drainage issue fix, and board troubleshooting.',
    image: 'https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?w=500&q=80',
    estimatedDuration: '60-90 mins',
    startingPrice: 299,
    isBrandRequired: true,
    isIssueRequired: true,
    isPackageRequired: true,
    allowsOtherProblem: true,
    categorySlug: 'appliance-solutions',
    problems: [
      'Not Spinning',
      'Water Leakage',
      'Drainage Issue',
      'Motor Issue',
      'Installation',
      'Other'
    ],
    brands: ['LG', 'Samsung', 'IFB', 'Whirlpool', 'Bosch']
  },
  {
    name: 'Microwave Repair',
    slug: 'microwave-repair',
    description: 'Magnetron replacement, touch pad repair, plate motor repair, and wiring fix.',
    image: 'https://images.unsplash.com/photo-1574269909862-7e1d70bb8078?w=500&q=80',
    estimatedDuration: '45-60 mins',
    startingPrice: 299,
    isBrandRequired: true,
    isIssueRequired: true,
    isPackageRequired: true,
    allowsOtherProblem: true,
    categorySlug: 'appliance-solutions',
    problems: [
      'Not Heating',
      'Plate Not Rotating',
      'Spark Issue',
      'Door Issue',
      'Power Issue',
      'Other'
    ],
    brands: ['LG', 'Samsung', 'IFB', 'Panasonic', 'Godrej']
  },
  {
    name: 'Water Heater / Geyser Repair',
    slug: 'geyser-repair',
    description: 'Thermostat replacement, heating element repair, leakage check, and wiring fix.',
    image: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=500&q=80',
    estimatedDuration: '45-60 mins',
    startingPrice: 249,
    isBrandRequired: true,
    isIssueRequired: true,
    isPackageRequired: true,
    allowsOtherProblem: true,
    categorySlug: 'appliance-solutions',
    problems: [
      'No Heating',
      'Water Leakage',
      'Installation',
      'Thermostat Issue',
      'Power Issue',
      'Other'
    ],
    brands: ['Havells', 'V-Guard', 'AO Smith', 'Racold', 'Bajaj']
  },
  {
    name: 'Plumbing',
    slug: 'plumbing',
    description: 'Leaking pipe fix, tap installation, sink blockage removal, and water pump repair.',
    image: 'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=500&q=80',
    estimatedDuration: '45-90 mins',
    startingPrice: 149,
    isBrandRequired: false,
    isIssueRequired: true,
    isPackageRequired: true,
    allowsOtherProblem: true,
    categorySlug: 'plumbing',
    problems: [
      'Pipe Leak',
      'Tap Repair',
      'Drainage Blockage',
      'Bathroom Fitting',
      'Water Tank Cleaning',
      'Motor Pump Issue',
      'Other'
    ],
    brands: []
  },
  {
    name: 'Electrical',
    slug: 'electrical',
    description: 'MCB replacement, light fixture installation, ceiling fan fix, and short circuit finding.',
    image: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=500&q=80',
    estimatedDuration: '45-60 mins',
    startingPrice: 149,
    isBrandRequired: false,
    isIssueRequired: true,
    isPackageRequired: true,
    allowsOtherProblem: true,
    categorySlug: 'electrical',
    problems: [
      'Switchboard Repair',
      'MCB Issue',
      'Wiring Issue',
      'Fan Installation',
      'Light Fitting',
      'Fault Finding',
      'Other'
    ],
    brands: []
  },
  {
    name: 'Pest Control',
    slug: 'pest-control',
    description: 'Cockroach, bed bug, termite, mosquito, and general insect eradication services.',
    image: 'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=500&q=80',
    estimatedDuration: '60-120 mins',
    startingPrice: 699,
    isBrandRequired: false,
    isIssueRequired: true,
    isPackageRequired: true,
    allowsOtherProblem: true,
    categorySlug: 'pest-control',
    problems: [
      'Cockroach Control',
      'Termite Control',
      'Bed Bug Control',
      'Mosquito Control',
      'Rodent Control',
      'General Pest Control',
      'Other'
    ],
    brands: []
  },
  {
    name: 'Painting',
    slug: 'painting',
    description: 'Interior and exterior wall painting, waterproof wall primers, and touch-ups.',
    image: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=500&q=80',
    estimatedDuration: '180 mins',
    startingPrice: 999,
    isBrandRequired: false,
    isIssueRequired: true,
    isPackageRequired: true,
    allowsOtherProblem: true,
    categorySlug: 'painting',
    problems: [
      'Wall Painting',
      'Touch-up Painting',
      'Waterproofing',
      'Putty Work',
      'Texture Paint',
      'Full Home Painting',
      'Other'
    ],
    brands: []
  },
  {
    name: 'Mobile & Gadgets',
    slug: 'mobile-gadgets',
    description: 'Professional repair and setup services for mobile phones, tablets, smartwatches and gadgets.',
    image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=500&q=80',
    estimatedDuration: '45-90 mins',
    startingPrice: 399,
    isBrandRequired: true,
    isIssueRequired: true,
    isPackageRequired: true,
    allowsOtherProblem: true,
    categorySlug: 'mobile-gadgets',
    problems: [
      'Screen Damage',
      'Battery Issue',
      'Charging Issue',
      'Speaker/Mic Issue',
      'Software Issue',
      'Network Issue',
      'Other'
    ],
    brands: ['Apple', 'Samsung', 'OnePlus', 'Xiaomi', 'Vivo', 'Oppo', 'Realme']
  },
  // Individual Office Equipment Services
  {
    name: 'Printer / Copier Repair',
    slug: 'printer-copier-repair',
    description: 'Professional repair and maintenance for office printers and copiers.',
    image: 'https://images.unsplash.com/photo-1612815154858-60aa4c59eaa6?w=500&q=80',
    estimatedDuration: '60-90 mins',
    startingPrice: 499,
    isBrandRequired: true,
    isIssueRequired: true,
    isPackageRequired: true,
    allowsOtherProblem: true,
    categorySlug: 'office-equipment',
    problems: ['Not Powering On', 'Paper Jam', 'Poor Print Quality', 'Network Issue', 'Other'],
    brands: ['HP', 'Canon', 'Epson', 'Brother', 'Samsung']
  },
  {
    name: 'Shredder Repair',
    slug: 'shredder-repair',
    description: 'Repair and unjamming services for office paper shredders.',
    image: 'https://images.unsplash.com/photo-1593640408182-31c70c8268f5?w=500&q=80',
    estimatedDuration: '45-60 mins',
    startingPrice: 399,
    isBrandRequired: false,
    isIssueRequired: true,
    isPackageRequired: true,
    allowsOtherProblem: true,
    categorySlug: 'office-equipment',
    problems: ['Paper Jam', 'Motor Not Running', 'Strange Noise', 'Other'],
    brands: []
  },
  {
    name: 'Scanner Setup',
    slug: 'scanner-setup',
    description: 'Installation and setup of flatbed and document scanners.',
    image: 'https://images.unsplash.com/photo-1593640408182-31c70c8268f5?w=500&q=80',
    estimatedDuration: '45 mins',
    startingPrice: 299,
    isBrandRequired: true,
    isIssueRequired: true,
    isPackageRequired: true,
    allowsOtherProblem: true,
    categorySlug: 'office-equipment',
    problems: ['Driver Installation', 'Network Setup', 'Scan Quality Issue', 'Other'],
    brands: ['HP', 'Canon', 'Epson', 'Fujitsu', 'Brother']
  },
  {
    name: 'EPABX Setup',
    slug: 'epabx-setup',
    description: 'Professional setup and configuration for office EPABX systems.',
    image: 'https://images.unsplash.com/photo-1593640408182-31c70c8268f5?w=500&q=80',
    estimatedDuration: '120-180 mins',
    startingPrice: 999,
    isBrandRequired: true,
    isIssueRequired: true,
    isPackageRequired: true,
    allowsOtherProblem: true,
    categorySlug: 'office-equipment',
    problems: ['New Installation', 'Configuration Issue', 'Line Extension', 'Other'],
    brands: ['Panasonic', 'Matrix', 'Crystal', 'NEC']
  },
  {
    name: 'Projector Repair',
    slug: 'projector-repair',
    description: 'Diagnosis and repair of office conference room projectors.',
    image: 'https://images.unsplash.com/photo-1593640408182-31c70c8268f5?w=500&q=80',
    estimatedDuration: '60-90 mins',
    startingPrice: 599,
    isBrandRequired: true,
    isIssueRequired: true,
    isPackageRequired: true,
    allowsOtherProblem: true,
    categorySlug: 'office-equipment',
    problems: ['Lamp Replacement', 'Display Issue', 'Power Issue', 'Mounting', 'Other'],
    brands: ['Epson', 'Sony', 'BenQ', 'Panasonic', 'Optoma']
  },
  // Individual Automobile Services
  {
    name: 'EV Charger Installation',
    slug: 'ev-charger-installation',
    description: 'Professional setup and wiring for home electric vehicle chargers.',
    image: 'https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=500&q=80',
    estimatedDuration: '120-180 mins',
    startingPrice: 1499,
    isBrandRequired: false,
    isIssueRequired: true,
    isPackageRequired: true,
    allowsOtherProblem: true,
    categorySlug: 'automobile',
    problems: ['New Installation', 'Relocation', 'Wiring Issue', 'Other'],
    brands: []
  },
  {
    name: 'Car Electrical Repair',
    slug: 'car-electrical-repair',
    description: 'Diagnosis and repair for car wiring, lights, and electronics.',
    image: 'https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=500&q=80',
    estimatedDuration: '60-120 mins',
    startingPrice: 499,
    isBrandRequired: true,
    isIssueRequired: true,
    isPackageRequired: true,
    allowsOtherProblem: true,
    categorySlug: 'automobile',
    problems: ['Wiring Issue', 'Headlight/Taillight Issue', 'Dashboard Error', 'Other'],
    brands: ['Tata', 'Mahindra', 'Hyundai', 'Maruti Suzuki', 'Toyota', 'Kia', 'Honda']
  },
  {
    name: 'Vehicle Battery Replacement',
    slug: 'vehicle-battery-replacement',
    description: 'On-site car battery testing and replacement services.',
    image: 'https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=500&q=80',
    estimatedDuration: '45 mins',
    startingPrice: 299,
    isBrandRequired: false,
    isIssueRequired: true,
    isPackageRequired: true,
    allowsOtherProblem: true,
    categorySlug: 'automobile',
    problems: ['Dead Battery', 'Low Voltage', 'Terminal Cleaning', 'New Battery Installation', 'Other'],
    brands: []
  },
  {
    name: 'GPS Tracker Installation',
    slug: 'gps-tracker-installation',
    description: 'Secure installation of GPS tracking devices for vehicles.',
    image: 'https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=500&q=80',
    estimatedDuration: '60-90 mins',
    startingPrice: 599,
    isBrandRequired: false,
    isIssueRequired: true,
    isPackageRequired: true,
    allowsOtherProblem: true,
    categorySlug: 'automobile',
    problems: ['Hidden Installation', 'OBD Port Setup', 'Device Troubleshooting', 'Other'],
    brands: []
  },
  {
    name: 'Audio & Video Services',
    slug: 'audio-video-services',
    description: 'Professional setup, mounting, and installation of TVs, home theatres, projectors, and audio systems.',
    image: 'https://images.unsplash.com/photo-1593784991095-a205069470b6?w=500&q=80',
    estimatedDuration: '60-120 mins',
    startingPrice: 599,
    isBrandRequired: true,
    isIssueRequired: true,
    isPackageRequired: true,
    allowsOtherProblem: true,
    categorySlug: 'audio-video',
    problems: [
      'TV Mounting',
      'Home Theatre Installation',
      'Projector Setup',
      'Sound System Installation',
      'DJ Equipment Setup',
      'Other'
    ],
    brands: ['Sony', 'Samsung', 'LG', 'Bose', 'JBL', 'Philips', 'Yamaha']
  },
  {
    name: 'Automobile Repair & Setup',
    slug: 'automobile-repair-setup',
    description: 'Professional automobile electrical repair, EV charger installation, and tracker setup.',
    image: 'https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=500&q=80',
    estimatedDuration: '60-120 mins',
    startingPrice: 499,
    isBrandRequired: true,
    isIssueRequired: true,
    isPackageRequired: true,
    allowsOtherProblem: true,
    categorySlug: 'automobile',
    problems: [
      'EV Charger Installation',
      'Car Electrical Repair',
      'Vehicle Battery Replacement',
      'GPS Tracker Installation',
      'Other'
    ],
    brands: ['Tata', 'Mahindra', 'Hyundai', 'Maruti Suzuki', 'Toyota', 'Kia', 'Honda']
  }
];

const seedConfigs = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(dbUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('MongoDB Connected successfully!');

    // Fetch Categories to map
    const categories = await ServiceCategory.find().lean();
    const catMap = {};
    categories.forEach(c => {
      catMap[c.slug] = c._id;
    });
    const defaultCatId = categories.length > 0 ? categories[0]._id : null;

    for (const cfg of servicesConfig) {
      console.log(`\nProcessing service: "${cfg.name}"...`);

      // 1. Find existing service by slug OR name to avoid duplicates if slug changed slightly
      let service = await OneTimeService.findOne({ $or: [{ slug: cfg.slug }, { name: cfg.name }] });

      if (service) {
        console.log(`Service "${service.name}" exists. Updating fields...`);
        service.name = cfg.name;
        service.slug = cfg.slug;
        service.description = cfg.description;
        service.image = cfg.image;
        service.startingPrice = cfg.startingPrice;
        service.estimatedDuration = cfg.estimatedDuration;
        
        // Use the unified field names as per the prompt requirements and pre-save hooks
        service.isBrandRequired = cfg.isBrandRequired;
        service.requiresBrand = cfg.isBrandRequired;
        
        service.isIssueRequired = cfg.isIssueRequired;
        service.requiresProblem = cfg.isIssueRequired;
        
        service.isPackageRequired = cfg.isPackageRequired;
        service.requiresPackage = cfg.isPackageRequired;
        
        service.allowsOtherProblem = cfg.allowsOtherProblem;
        
        const targetCategoryId = catMap[cfg.categorySlug] || defaultCatId;
        if (targetCategoryId) {
          service.categoryId = targetCategoryId;
        }
        
        await service.save();
      } else {
        console.log(`Creating new service "${cfg.name}"...`);
        const targetCategoryId = catMap[cfg.categorySlug] || defaultCatId;
        
        service = await OneTimeService.create({
          name: cfg.name,
          slug: cfg.slug,
          description: cfg.description,
          image: cfg.image,
          startingPrice: cfg.startingPrice,
          estimatedDuration: cfg.estimatedDuration,
          isBrandRequired: cfg.isBrandRequired,
          requiresBrand: cfg.isBrandRequired,
          isIssueRequired: cfg.isIssueRequired,
          requiresProblem: cfg.isIssueRequired,
          isPackageRequired: cfg.isPackageRequired,
          requiresPackage: cfg.isPackageRequired,
          allowsOtherProblem: cfg.allowsOtherProblem,
          categoryId: targetCategoryId,
          isActive: true
        });
      }

      // 2. Clear old issues and re-seed
      await ServiceIssue.deleteMany({ serviceId: service._id });
      console.log(`Cleared existing issues for "${cfg.name}".`);

      for (let i = 0; i < cfg.problems.length; i++) {
        await ServiceIssue.create({
          serviceId: service._id,
          title: cfg.problems[i],
          isActive: true,
          sortOrder: i
        });
      }
      console.log(`Seeded ${cfg.problems.length} issues for "${cfg.name}".`);

      // 3. Clear old brands and re-seed IF required
      await ServiceBrand.deleteMany({ serviceId: service._id });
      if (cfg.isBrandRequired && cfg.brands && cfg.brands.length > 0) {
        for (let j = 0; j < cfg.brands.length; j++) {
          await ServiceBrand.create({
            serviceId: service._id,
            brandName: cfg.brands[j],
            isActive: true,
            sortOrder: j
          });
        }
        console.log(`Seeded ${cfg.brands.length} brands for "${cfg.name}".`);
      } else {
        console.log(`No brands required for "${cfg.name}".`);
      }

      // 4. Check for packages. Add a default one if none exist.
      const pkgCount = await ServicePackage.countDocuments({ serviceId: service._id });
      if (pkgCount === 0 && cfg.isPackageRequired) {
        console.log(`Seeding default package for "${cfg.name}".`);
        await ServicePackage.create({
          serviceId: service._id,
          name: 'Standard Service / Inspection',
          description: `Standard diagnostic and inspection service for ${cfg.name}. Additional repairs or parts will be charged separately.`,
          price: cfg.startingPrice,
          estimatedDuration: cfg.estimatedDuration,
          warranty: '30 days warranty',
          isActive: true,
          sortOrder: 0,
          brandIds: [],
          issueIds: []
        });
      }
    }

    console.log('\nSeeding complete! Disconnecting from database...');
    await mongoose.disconnect();
    console.log('Database connection closed.');
  } catch (error) {
    console.error('Seeding failed with error:', error);
    process.exit(1);
  }
};

seedConfigs();
