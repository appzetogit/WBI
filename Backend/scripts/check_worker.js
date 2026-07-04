const mongoose = require('mongoose');
require('dotenv').config();
const Worker = require('../models/Worker');

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const worker = await Worker.findById('6a48ee4caf15a143e45941a7');
    console.log('Worker doc:', JSON.stringify(worker.toObject(), null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};
run();
