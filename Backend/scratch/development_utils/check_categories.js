require('dotenv').config();
const mongoose = require('mongoose');
const ServiceCategory = require('./models/ServiceCategory');

async function check() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    console.log('Connecting to MongoDB:', mongoUri);
    await mongoose.connect(mongoUri);
    console.log('Database connected.');

    const categories = await ServiceCategory.find({});
    console.log('Categories Count:', categories.length);
    categories.forEach(c => {
      console.log(`Category: name="${c.name}", slug="${c.slug}", icon="${c.icon}", isActive=${c.isActive}, showOnApp=${c.showOnApp}`);
    });

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();
