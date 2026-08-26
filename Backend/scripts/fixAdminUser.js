const mongoose = require('mongoose');
const Admin = require('../models/Admin');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');

  const email = 'admin@admin.com';
  let admin = await Admin.findOne({ email });

  if (admin) {
    console.log('Admin user found:', admin.email);
    console.log('Current role:', admin.role);
    console.log('Is Active:', admin.isActive);
    
    // Reset password to admin123
    admin.password = 'admin123';
    admin.role = 'super_admin';
    admin.isActive = true;
    await admin.save();
    console.log('✅ Admin password has been reset to: admin123');
  } else {
    console.log('Admin user not found. Creating a new admin user admin@admin.com...');
    const adminData = {
      name: 'Super Admin',
      email: 'admin@admin.com',
      password: 'admin123',
      role: 'super_admin',
      isActive: true,
      permissions: {
        users: { read: true, write: true, delete: true },
        vendors: { read: true, write: true, delete: true },
        workers: { read: true, write: true, delete: true },
        bookings: { read: true, write: true, delete: true },
        payments: { read: true, write: true, delete: true },
        categories: { read: true, write: true, delete: true },
        services: { read: true, write: true, delete: true },
        homeContent: { read: true, write: true, delete: true },
        notifications: { read: true, write: true, delete: true },
        reports: { read: true, write: true, delete: true },
        settings: { read: true, write: true, delete: true }
      }
    };
    await Admin.create(adminData);
    console.log('✅ New Admin user admin@admin.com created successfully with password: admin123');
  }

  await mongoose.disconnect();
}

run();
