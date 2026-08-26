const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const ServiceBrand = require('../models/ServiceBrand');

async function run() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected!');

    const brands = await ServiceBrand.find();
    console.log(`Found ${brands.length} brand entries in DB.`);

    let updatedCount = 0;
    for (const brand of brands) {
      if (brand.logo && brand.logo.includes('logo.clearbit.com')) {
        const domain = brand.logo.replace('https://logo.clearbit.com/', '');
        const newLogo = `https://www.google.com/s2/favicons?sz=64&domain=${domain}`;
        
        brand.logo = newLogo;
        await brand.save();
        updatedCount++;
      }
    }

    console.log(`Successfully migrated ${updatedCount} brand logos from clearbit to google favicons!`);
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

run();
