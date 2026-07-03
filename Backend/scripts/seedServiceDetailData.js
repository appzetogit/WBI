const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const OneTimeService = require('../models/OneTimeService');
const ServiceBrand = require('../models/ServiceBrand');
const ServiceIssue = require('../models/ServiceIssue');
const ServicePackage = require('../models/ServicePackage');
const OneTimeSubService = require('../models/OneTimeSubService');

const servicesData = [
  {
    name: 'AC Repair',
    slug: 'ac-repair',
    subtitle: 'Professional AC Repair & Service at your doorstep',
    image: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=600&auto=format&fit=crop&q=60',
    rating: 4.8,
    totalReviews: 12500,
    isBrandRequired: true,
    isIssueRequired: true,
    brands: [
      { name: 'LG', logo: 'https://www.google.com/s2/favicons?sz=64&domain=lg.com' },
      { name: 'Samsung', logo: 'https://www.google.com/s2/favicons?sz=64&domain=samsung.com' },
      { name: 'Voltas', logo: 'https://www.google.com/s2/favicons?sz=64&domain=voltas.com' },
      { name: 'Daikin', logo: 'https://www.google.com/s2/favicons?sz=64&domain=daikin.com' },
      { name: 'Panasonic', logo: 'https://www.google.com/s2/favicons?sz=64&domain=panasonic.com' },
      { name: 'Whirlpool', logo: 'https://www.google.com/s2/favicons?sz=64&domain=whirlpool.com' },
      { name: 'Haier', logo: 'https://www.google.com/s2/favicons?sz=64&domain=haier.com' }
    ],
    issues: [
      'AC not cooling',
      'Water leakage',
      'Gas leakage',
      'AC not turning ON',
      'Unusual noise',
      'Bad smell from AC',
      'Remote not working',
      'AC making loud noise',
      'Ice forming on unit',
      'AC tripping frequently'
    ],
    subServices: [
      { name: 'General Service', description: 'Cleaning, filter check, general inspection', price: 299, isDefault: true },
      { name: 'Gas Refilling', description: 'Top up gas for better cooling', price: 899, isDefault: false },
      { name: 'Deep Cleaning', description: 'Indoor & outdoor deep cleaning', price: 499, isDefault: false },
      { name: 'PCB Inspection', description: 'PCB & electronic component check', price: 399, isDefault: false },
      { name: 'AC Installation/Uninstall', description: 'AC install or uninstall service', price: 799, isDefault: false },
      { name: 'Jet Pump Service', description: 'Water jet pump checking', price: 249, isDefault: false }
    ]
  },
  {
    name: 'AC Service',
    slug: 'ac-service',
    subtitle: 'Professional AC Repair & Service at your doorstep',
    image: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=600&auto=format&fit=crop&q=60',
    rating: 4.8,
    totalReviews: 12500,
    isBrandRequired: true,
    isIssueRequired: true,
    brands: [
      { name: 'LG', logo: 'https://www.google.com/s2/favicons?sz=64&domain=lg.com' },
      { name: 'Samsung', logo: 'https://www.google.com/s2/favicons?sz=64&domain=samsung.com' },
      { name: 'Voltas', logo: 'https://www.google.com/s2/favicons?sz=64&domain=voltas.com' },
      { name: 'Daikin', logo: 'https://www.google.com/s2/favicons?sz=64&domain=daikin.com' },
      { name: 'Panasonic', logo: 'https://www.google.com/s2/favicons?sz=64&domain=panasonic.com' },
      { name: 'Whirlpool', logo: 'https://www.google.com/s2/favicons?sz=64&domain=whirlpool.com' },
      { name: 'Haier', logo: 'https://www.google.com/s2/favicons?sz=64&domain=haier.com' }
    ],
    issues: [
      'AC not cooling',
      'Water leakage',
      'Gas leakage',
      'AC not turning ON',
      'Unusual noise',
      'Bad smell from AC',
      'Remote not working',
      'AC making loud noise',
      'Ice forming on unit',
      'AC tripping frequently'
    ],
    subServices: [
      { name: 'General Service', description: 'Cleaning, filter check, general inspection', price: 299, isDefault: true },
      { name: 'Gas Refilling', description: 'Top up gas for better cooling', price: 899, isDefault: false },
      { name: 'Deep Cleaning', description: 'Indoor & outdoor deep cleaning', price: 499, isDefault: false },
      { name: 'PCB Inspection', description: 'PCB & electronic component check', price: 399, isDefault: false },
      { name: 'AC Installation/Uninstall', description: 'AC install or uninstall service', price: 799, isDefault: false },
      { name: 'Jet Pump Service', description: 'Water jet pump checking', price: 249, isDefault: false }
    ]
  },
  {
    name: 'Washing Machine Repair',
    slug: 'washing-machine-repair',
    subtitle: 'Expert washing machine troubleshooting & service',
    image: 'https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?w=600&auto=format&fit=crop&q=60',
    rating: 4.7,
    totalReviews: 8900,
    isBrandRequired: true,
    isIssueRequired: true,
    brands: [
      { name: 'LG', logo: 'https://www.google.com/s2/favicons?sz=64&domain=lg.com' },
      { name: 'Samsung', logo: 'https://www.google.com/s2/favicons?sz=64&domain=samsung.com' },
      { name: 'Whirlpool', logo: 'https://www.google.com/s2/favicons?sz=64&domain=whirlpool.com' },
      { name: 'IFB', logo: 'https://www.google.com/s2/favicons?sz=64&domain=ifbappliances.com' },
      { name: 'Bosch', logo: 'https://www.google.com/s2/favicons?sz=64&domain=bosch.com' },
      { name: 'Godrej', logo: 'https://www.google.com/s2/favicons?sz=64&domain=godrej.com' }
    ],
    issues: [
      'Not spinning',
      'Water not draining',
      'Making loud noise',
      'Not starting',
      'Door not opening',
      'Vibrating excessively',
      'Not filling water',
      'Error code showing'
    ],
    subServices: [
      { name: 'Basic Service', description: 'Complete check & cleaning', price: 349, isDefault: true },
      { name: 'Motor Repair', description: 'Motor inspection and repair', price: 599, isDefault: false },
      { name: 'PCB Repair', description: 'Electronic board repair', price: 699, isDefault: false },
      { name: 'Drum Cleaning', description: 'Drum descaling and cleaning', price: 299, isDefault: false },
      { name: 'Water Inlet Valve Repair', description: 'Valve check and fix', price: 399, isDefault: false }
    ]
  },
  {
    name: 'Geyser Repair',
    slug: 'geyser-repair',
    subtitle: 'Hot water geyser repair and installation services',
    image: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=600&auto=format&fit=crop&q=60',
    rating: 4.6,
    totalReviews: 4300,
    isBrandRequired: true,
    isIssueRequired: true,
    brands: [
      { name: 'Racold', logo: 'https://www.google.com/s2/favicons?sz=64&domain=racold.com' },
      { name: 'Havells', logo: 'https://www.google.com/s2/favicons?sz=64&domain=havells.com' },
      { name: 'AO Smith', logo: 'https://www.google.com/s2/favicons?sz=64&domain=aosmith.com' },
      { name: 'Bajaj', logo: 'https://www.google.com/s2/favicons?sz=64&domain=bajajelectricals.com' },
      { name: 'Venus', logo: 'https://www.google.com/s2/favicons?sz=64&domain=venushomeappliances.com' }
    ],
    issues: [
      'Not heating water',
      'Water leaking',
      'No hot water',
      'Taking too long to heat',
      'Making noise',
      'Pilot light not working'
    ],
    subServices: [
      { name: 'Basic Inspection', description: 'Full geyser check', price: 199, isDefault: true },
      { name: 'Element Replacement', description: 'Heating element change', price: 599, isDefault: false },
      { name: 'Thermostat Repair', description: 'Thermostat fix', price: 399, isDefault: false },
      { name: 'Anode Rod Replacement', description: 'Prevent corrosion', price: 299, isDefault: false },
      { name: 'Safety Valve Replacement', description: 'Pressure valve fix', price: 249, isDefault: false }
    ]
  },
  {
    name: 'Plumbing',
    slug: 'plumbing',
    subtitle: 'Leakage fixing, blocks cleaning & plumbing service',
    image: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=600&auto=format&fit=crop&q=60',
    rating: 4.8,
    totalReviews: 18400,
    isBrandRequired: true,
    isIssueRequired: true,
    brands: [
      { name: 'Jaguar', logo: 'https://www.google.com/s2/favicons?sz=64&domain=jaquar.com' },
      { name: 'Hindware', logo: 'https://www.google.com/s2/favicons?sz=64&domain=hindware.com' },
      { name: 'Cera', logo: 'https://www.google.com/s2/favicons?sz=64&domain=cera-india.com' },
      { name: 'Parryware', logo: 'https://www.google.com/s2/favicons?sz=64&domain=parryware.in' },
      { name: 'Kohler', logo: 'https://www.google.com/s2/favicons?sz=64&domain=kohler.com' }
    ],
    issues: [
      'Pipe leakage',
      'Drain blocked',
      'Low water pressure',
      'Tap leaking',
      'No water supply',
      'Toilet overflow'
    ],
    subServices: [
      { name: 'Pipe Leak Repair', description: 'Fix leaking pipes', price: 299, isDefault: true },
      { name: 'Drain Unblocking', description: 'Clear blocked drains', price: 399, isDefault: false },
      { name: 'Tap/Faucet Repair', description: 'Fix dripping taps', price: 199, isDefault: false },
      { name: 'Flush Tank Repair', description: 'Fix toilet flush', price: 349, isDefault: false },
      { name: 'Water Pump Service', description: 'Pump inspection & repair', price: 599, isDefault: false }
    ]
  },
  {
    name: 'Electrician',
    slug: 'electrician',
    subtitle: 'Repairs, installations & wiring solutions',
    image: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=600&auto=format&fit=crop&q=60',
    rating: 4.9,
    totalReviews: 22100,
    isBrandRequired: true,
    isIssueRequired: true,
    brands: [
      { name: 'Anchor', logo: 'https://www.google.com/s2/favicons?sz=64&domain=anchor-pana.com' },
      { name: 'Havells', logo: 'https://www.google.com/s2/favicons?sz=64&domain=havells.com' },
      { name: 'Legrand', logo: 'https://www.google.com/s2/favicons?sz=64&domain=legrand.co.in' },
      { name: 'Schneider', logo: 'https://www.google.com/s2/favicons?sz=64&domain=se.com' }
    ],
    issues: [
      'No power in room',
      'Short circuit',
      'Wiring issue',
      'Switch not working',
      'Fan not working',
      'Light flickering'
    ],
    subServices: [
      { name: 'Basic Inspection', description: 'Check all connections', price: 199, isDefault: true },
      { name: 'Switch/Socket Repair', description: 'Fix switches and outlets', price: 149, isDefault: false },
      { name: 'Fan Installation', description: 'Install ceiling/wall fan', price: 249, isDefault: false },
      { name: 'MCB/Fuse Repair', description: 'Main board fix', price: 299, isDefault: false },
      { name: 'Wiring Repair', description: 'Fix faulty wiring', price: 499, isDefault: false }
    ]
  },
  {
    name: 'Carpenter',
    slug: 'carpenter',
    subtitle: 'Furniture repair, assembly & woodwork services',
    image: 'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?w=600&auto=format&fit=crop&q=60',
    rating: 4.7,
    totalReviews: 9500,
    isBrandRequired: true,
    isIssueRequired: true,
    brands: [
      { name: 'CenturyPly', logo: 'https://www.google.com/s2/favicons?sz=64&domain=centuryply.com' },
      { name: 'Greenply', logo: 'https://www.google.com/s2/favicons?sz=64&domain=greenply.com' },
      { name: 'Action Tesa', logo: 'https://www.google.com/s2/favicons?sz=64&domain=actiontesa.com' }
    ],
    issues: [
      'Door lock repair',
      'Cabinet door alignment',
      'Sofa repair',
      'Furniture assembly',
      'Wooden partition installation'
    ],
    subServices: [
      { name: 'Basic Woodwork Check', description: 'Complete furniture diagnostic', price: 199, isDefault: true },
      { name: 'Door Lock Repair', description: 'Fix door lock mechanisms', price: 299, isDefault: false },
      { name: 'Hinge/Cabinet Alignment', description: 'Adjust drawer and door hinges', price: 149, isDefault: false },
      { name: 'Drawer Repair', description: 'Fix sliding channels', price: 199, isDefault: false }
    ]
  },
  {
    name: 'Painting',
    slug: 'painting',
    subtitle: 'Professional wall painting, seepage & water-proofing',
    image: 'https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=600&auto=format&fit=crop&q=60',
    rating: 4.8,
    totalReviews: 6100,
    isBrandRequired: true,
    isIssueRequired: true,
    brands: [
      { name: 'Asian Paints', logo: 'https://www.google.com/s2/favicons?sz=64&domain=asianpaints.com' },
      { name: 'Berger Paints', logo: 'https://www.google.com/s2/favicons?sz=64&domain=bergerpaints.com' },
      { name: 'Nerolac', logo: 'https://www.google.com/s2/favicons?sz=64&domain=nerolac.com' },
      { name: 'Dulux', logo: 'https://www.google.com/s2/favicons?sz=64&domain=dulux.in' }
    ],
    issues: [
      'Wall peeling',
      'Dampness/seepage',
      'Full home painting',
      'Texture painting',
      'Waterproofing'
    ],
    subServices: [
      { name: 'Dampness Inspection', description: 'Complete wall check for dampness', price: 199, isDefault: true },
      { name: 'Wall Touch-up', description: 'Small area painting touch-up', price: 349, isDefault: false },
      { name: 'Seepage Proofing', description: 'Undercoat waterproofing application', price: 599, isDefault: false }
    ]
  },
  {
    name: 'Pest Control',
    slug: 'pest-control',
    subtitle: 'Safe cockroach, bedbug & termite control service',
    image: 'https://images.unsplash.com/photo-1587324438673-56c547842c97?w=600&auto=format&fit=crop&q=60',
    rating: 4.6,
    totalReviews: 7200,
    isBrandRequired: true,
    isIssueRequired: true,
    brands: [
      { name: 'PCI', logo: 'https://www.google.com/s2/favicons?sz=64&domain=pestcontrolindia.com' },
      { name: 'Hicare', logo: 'https://www.google.com/s2/favicons?sz=64&domain=hicare.in' }
    ],
    issues: [
      'Cockroach control',
      'Termite control',
      'Bed bug treatment',
      'Rodent control',
      'Mosquito breeding prevention'
    ],
    subServices: [
      { name: 'General Pest Check', description: 'Examine pest breeding spots', price: 199, isDefault: true },
      { name: 'Cockroach Spray', description: 'Safe organic gel cockroach control', price: 399, isDefault: false },
      { name: 'Bedbug Heat Treatment', description: 'Thermal treatment for bedbugs', price: 599, isDefault: false }
    ]
  },
  {
    name: 'Deep Cleaning',
    slug: 'deep-cleaning',
    subtitle: 'Full home sanitization & deep cleaning experts',
    image: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=600&auto=format&fit=crop&q=60',
    rating: 4.8,
    totalReviews: 14200,
    isBrandRequired: true,
    isIssueRequired: true,
    brands: [
      { name: 'Taski', logo: 'https://www.google.com/s2/favicons?sz=64&domain=diversey.com' },
      { name: 'Karcher', logo: 'https://www.google.com/s2/favicons?sz=64&domain=kaercher.com' }
    ],
    issues: [
      'Kitchen deep cleaning',
      'Bathroom deep cleaning',
      'Full home deep cleaning',
      'Sofa shampooing',
      'Carpet cleaning'
    ],
    subServices: [
      { name: '1 BHK Deep Clean', description: 'Complete deep cleaning for 1 BHK flat', price: 999, isDefault: true },
      { name: 'Kitchen Surface Wipe', description: 'Clean kitchen countertops and cabinets', price: 499, isDefault: false },
      { name: 'Bathroom Sanitization', description: 'Deep scrubbing & wall tiles cleaning', price: 399, isDefault: false }
    ]
  },
  {
    name: 'CCTV Installation',
    slug: 'cctv-installation',
    subtitle: 'CCTV Camera repair, setup & NVR/DVR installation',
    image: 'https://images.unsplash.com/photo-1557597774-9d273605dfa9?w=600&auto=format&fit=crop&q=60',
    rating: 4.7,
    totalReviews: 2900,
    isBrandRequired: true,
    isIssueRequired: true,
    brands: [
      { name: 'Hikvision', logo: 'https://www.google.com/s2/favicons?sz=64&domain=hikvision.com' },
      { name: 'CP Plus', logo: 'https://www.google.com/s2/favicons?sz=64&domain=cpplusworld.com' },
      { name: 'Dahua', logo: 'https://www.google.com/s2/favicons?sz=64&domain=dahuasecurity.com' },
      { name: 'Honeywell', logo: 'https://www.google.com/s2/favicons?sz=64&domain=honeywell.com' }
    ],
    issues: [
      'Camera not showing feed',
      'DVR/NVR not recording',
      'Blur/Noisy video',
      'Night vision not working',
      'Hard disk error'
    ],
    subServices: [
      { name: 'Camera Setup', description: 'Mounting and configuring CCTV cameras', price: 499, isDefault: true },
      { name: 'DVR/NVR Config', description: 'Configure dynamic recording options', price: 399, isDefault: false },
      { name: 'Cable Routing', description: 'Structured routing per camera', price: 299, isDefault: false }
    ]
  }
];

const seedData = async () => {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected!');

    for (const data of servicesData) {
      console.log(`\nProcessing service: ${data.name}...`);
      let service = await OneTimeService.findOne({ slug: data.slug });

      if (!service) {
        service = await OneTimeService.create({
          name: data.name,
          slug: data.slug,
          subtitle: data.subtitle,
          image: data.image,
          rating: data.rating,
          totalReviews: data.totalReviews,
          isBrandRequired: data.isBrandRequired,
          isIssueRequired: data.isIssueRequired,
          estimatedDuration: '45-60 mins'
        });
        console.log(`Created service ${data.name}`);
      } else {
        service.subtitle = data.subtitle;
        service.image = data.image;
        service.rating = data.rating;
        service.totalReviews = data.totalReviews;
        service.isBrandRequired = data.isBrandRequired;
        service.isIssueRequired = data.isIssueRequired;
        await service.save();
        console.log(`Updated service ${data.name}`);
      }

      // Clear old brands, issues, sub-services, and packages
      await ServiceBrand.deleteMany({ serviceId: service._id });
      await ServiceIssue.deleteMany({ serviceId: service._id });
      await ServicePackage.deleteMany({ serviceId: service._id });
      await OneTimeSubService.deleteMany({ serviceId: service._id });

      const brandIds = [];
      let sortOrder = 1;
      
      // Seed Brands
      for (const br of data.brands) {
        const brandObj = await ServiceBrand.create({
          serviceId: service._id,
          brandName: br.name,
          logo: br.logo,
          isActive: true,
          sortOrder: sortOrder++
        });
        brandIds.push(brandObj._id);
      }
      console.log(`Seeded ${brandIds.length} brands for ${data.name}`);

      // Seed Issues
      let issueSort = 1;
      const issueIds = [];
      for (const label of data.issues) {
        const issueObj = await ServiceIssue.create({
          serviceId: service._id,
          title: label,
          brandIds: brandIds, // Applicable to all seeded brands for this service
          isActive: true,
          sortOrder: issueSort++
        });
        issueIds.push(issueObj._id);
      }
      console.log(`Seeded ${issueIds.length} issues for ${data.name}`);

      // Seed Sub-services (Both generic and brand-specific if required)
      let subSort = 1;
      for (const sub of data.subServices) {
        // We create generic sub-services (brandId is null)
        await OneTimeSubService.create({
          serviceId: service._id,
          brandId: null, // applies to all brands
          name: sub.name,
          description: sub.description,
          price: sub.price,
          isDefault: sub.isDefault,
          isActive: true,
          sortOrder: subSort++
        });

        // We also create brand-specific versions for LG / Samsung as example overrides if needed
        for (const brandObj of await ServiceBrand.find({ serviceId: service._id })) {
          // Keep same price or vary slightly by brand name length
          const brandPrice = brandObj.brandName === 'LG' ? sub.price : sub.price + 50; 
          await OneTimeSubService.create({
            serviceId: service._id,
            brandId: brandObj._id,
            name: `${sub.name}`,
            description: sub.description,
            price: brandPrice,
            isDefault: sub.isDefault,
            isActive: true,
            sortOrder: subSort++
          });
        }
      }
      console.log(`Seeded sub-services for ${data.name}`);

      // Seed a starter package to ensure StartingPrice is 299
      await ServicePackage.create({
        serviceId: service._id,
        name: 'Basic Troubleshooting & Diagnostic',
        description: 'Complete inspection and fault identification by a certified professional.',
        price: 299,
        estimatedDuration: '45 - 60 mins',
        warranty: '30 days warranty',
        isActive: true,
        sortOrder: 1,
        brandIds: [], // applicable to all
        issueIds: [] // applicable to all
      });
      console.log(`Seeded starter package for ${data.name}`);
    }

    console.log('\nSeeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding error:', error);
    process.exit(1);
  }
};

seedData();
