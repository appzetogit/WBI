const mongoose = require('mongoose');
const Notification = require('../models/Notification');
require('dotenv').config();

async function inspect() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB successfully!');
  
  const notifs = await Notification.find().sort({ createdAt: -1 }).limit(10);
  console.log('Recent 10 Notifications:');
  notifs.forEach(n => {
    console.log(`- [${n.createdAt.toISOString()}] User: ${n.userId}, Worker: ${n.workerId}, Title: "${n.title}", Message: "${n.message}", Type: ${n.type}`);
  });
  
  await mongoose.disconnect();
}

inspect();
