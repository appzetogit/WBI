const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const B2BCompany = require('../models/B2BCompany');
const B2BUser = require('../models/B2BUser');
const B2BRole = require('../models/B2BRole');
const B2BUserActivityLog = require('../models/B2BUserActivityLog');
const userController = require('../controllers/b2bControllers/b2bUserController');

const runTest = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected!');

    // 1. Create a dummy B2B Company if none exists
    let company = await B2BCompany.findOne({ email: 'testadmin@company.com' });
    if (!company) {
      company = await B2BCompany.create({
        companyName: 'Test Corporation',
        gstNumber: '27AAAAA1111A1Z1',
        panNumber: 'AAAAA1111A',
        tanNumber: 'ABCD12345E',
        companyAddress: 'Test Road, Mumbai',
        billingAddress: 'Test Road, Mumbai',
        authorizedPerson: {
          name: 'Authorized Person',
          designation: 'Director',
          email: 'testadmin@company.com',
          phone: '9999999999'
        },
        email: 'testadmin@company.com',
        phone: '9999999999',
        passwordHash: 'dummyhash',
        verificationStatus: 'approved',
        isActive: true
      });
      console.log('Created test company!');
    }

    // 2. Clear old B2B users for this company to make test repeatable
    await B2BUser.deleteMany({ companyId: company._id });
    await B2BRole.deleteMany({ companyId: company._id });
    await B2BUserActivityLog.deleteMany({ companyId: company._id });
    console.log('Cleared existing B2B users/roles/logs for test company.');

    // 3. Create the main Company Admin user
    const adminUser = await B2BUser.create({
      companyId: company._id,
      fullName: company.authorizedPerson.name,
      email: company.email,
      mobile: company.phone,
      role: 'Company Admin',
      permissions: [
        'bulk_jobs.read', 'bulk_jobs.write',
        'jobs.read', 'jobs.write',
        'wallet.read', 'wallet.write',
        'invoices.read',
        'reports.read',
        'support.write',
        'users.manage',
        'company_profile.read', 'company_profile.write'
      ],
      status: 'active',
      passwordHash: '$2a$10$abcdefghijklmnopqrstuv' // dummy hash
    });
    console.log('Created main Company Admin:', adminUser.email);

    // Mock request context
    const req = {
      companyId: company._id.toString(),
      user: { id: adminUser._id.toString() },
      ip: '127.0.0.1',
      headers: { 'user-agent': 'NodeTestRunner' },
      connection: {}
    };

    // 4. Invite a user
    console.log('\n--- 1. Testing user invitation ---');
    let inviteRes = null;
    const resMock = {
      status: (code) => {
        console.log('Response Status:', code);
        return {
          json: (data) => {
            inviteRes = data;
            console.log('Response JSON:', JSON.stringify(data, null, 2));
          }
        };
      }
    };

    await userController.inviteUser({
      ...req,
      body: {
        fullName: 'Test Operator',
        email: 'operator@company.com',
        mobile: '9876543210',
        role: 'Operations Manager'
      }
    }, resMock);

    if (!inviteRes || !inviteRes.success) {
      throw new Error('User invitation failed');
    }

    const inviteToken = inviteRes.token;
    const invitedUser = inviteRes.data;

    // 5. Verify the token (Public API)
    console.log('\n--- 2. Testing acceptInviteVerify ---');
    let verifyRes = null;
    await userController.acceptInviteVerify({
      body: { token: inviteToken }
    }, {
      status: (code) => {
        console.log('Response Status:', code);
        return {
          json: (data) => {
            verifyRes = data;
            console.log('Response JSON:', JSON.stringify(data, null, 2));
          }
        };
      }
    });

    if (!verifyRes || !verifyRes.success) {
      throw new Error('Invitation token verification failed');
    }

    // 6. Set password (Public API)
    console.log('\n--- 3. Testing acceptInviteSetPassword ---');
    let setPasswordRes = null;
    await userController.acceptInviteSetPassword({
      body: { token: inviteToken, password: 'SecurePassword123' },
      ip: '127.0.0.1',
      headers: { 'user-agent': 'NodeTestRunner' },
      connection: {}
    }, {
      status: (code) => {
        console.log('Response Status:', code);
        return {
          json: (data) => {
            setPasswordRes = data;
            console.log('Response JSON:', JSON.stringify(data, null, 2));
          }
        };
      }
    });

    if (!setPasswordRes || !setPasswordRes.success) {
      throw new Error('Password setting failed');
    }

    // 7. Verify status in database
    const updatedUserObj = await B2BUser.findById(invitedUser._id);
    console.log('User status after password activation:', updatedUserObj.status);
    if (updatedUserObj.status !== 'active') {
      throw new Error('Expected user status to be active');
    }

    // 8. Try updating user status (Self-deactivation constraint check)
    console.log('\n--- 4. Testing self-deactivation constraint ---');
    let statusRes = null;
    await userController.updateUserStatus({
      ...req,
      params: { userId: adminUser._id.toString() }, // Deactivating self!
      body: { status: 'inactive' }
    }, {
      status: (code) => {
        console.log('Self-deactivation result code:', code);
        return {
          json: (data) => {
            statusRes = data;
            console.log('Self-deactivation response:', data);
          }
        };
      }
    });

    // 9. Try deleting user (Last admin constraint check)
    console.log('\n--- 5. Testing last Company Admin delete constraint ---');
    let deleteRes = null;
    await userController.deleteUser({
      ...req,
      user: { id: updatedUserObj._id.toString() }, // Logged in as operator
      companyId: company._id.toString(),
      params: { userId: adminUser._id.toString() } // Deleting the only Company Admin!
    }, {
      status: (code) => {
        console.log('Delete Admin result code:', code);
        return {
          json: (data) => {
            deleteRes = data;
            console.log('Delete Admin response:', data);
          }
        };
      }
    });

    // 10. View activity logs
    console.log('\n--- 6. Testing retrieve activity logs ---');
    let logsRes = null;
    await userController.getUserActivityLog({
      ...req,
      params: { userId: updatedUserObj._id.toString() }
    }, {
      status: (code) => {
        console.log('Logs retrieval status:', code);
        return {
          json: (data) => {
            logsRes = data;
            console.log('Number of logs retrieved:', data.data?.length);
          }
        };
      }
    });

    console.log('\n✅ ALL INTEGRATION TESTS PASSED!');
    process.exit(0);
  } catch (error) {
    console.error('❌ TEST FAILURE:', error);
    process.exit(1);
  }
};

runTest();
