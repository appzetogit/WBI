require('dotenv').config();
const mongoose = require('mongoose');
const { generateOTP, hashOTP, storeOTP, verifyOTP } = require('../../utils/redisOtp.util');
const { sendOTP } = require('../../services/smsService');

async function testOtpFlowTiming() {
    console.log("=== Starting OTP Flow Timing Check ===\n");
    
    // Connect to MongoDB
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/wbi');
        console.log("Connected to MongoDB.");
    } catch (err) {
        console.error("Failed to connect to MongoDB:", err);
        process.exit(1);
    }

    const testPhone = process.env.TEST_PHONE || '9999999999'; // Use a test phone number or one from env
    console.log(`Testing OTP Flow for phone: ${testPhone}`);

    // STEP 1: Generate OTP
    const t0 = performance.now();
    let otp;
    
    // In test mode generateOTP returns 123456 by default. If we want a dynamic one:
    if (process.env.USE_DEFAULT_OTP === 'true') {
        otp = '123456';
    } else {
        otp = Math.floor(100000 + Math.random() * 900000).toString();
    }
    
    const otpHash = hashOTP(otp);
    console.log(`Generated OTP: ${otp} (Hash: ${otpHash})`);

    // STEP 2: Store OTP
    const t1 = performance.now();
    await storeOTP(testPhone, otpHash);
    const t2 = performance.now();
    console.log(`\n[Time] OTP Storage took ${(t2 - t1).toFixed(2)} ms`);

    // STEP 3: Send OTP via SMS
    console.log("\nSending SMS...");
    const t3 = performance.now();
    const smsResult = await sendOTP(testPhone, otp);
    const t4 = performance.now();
    const smsTime = t4 - t3;
    
    if (smsResult.success) {
        console.log(`✅ SMS Sent Successfully in ${smsTime.toFixed(2)} ms`);
    } else {
        console.log(`❌ SMS Sending Failed after ${smsTime.toFixed(2)} ms`);
        console.log(`Error:`, smsResult.error || smsResult.message);
    }
    
    console.log(`\n=> Total time to Generate, Store and Send: ${(t4 - t0).toFixed(2)} ms`);

    // STEP 4: Verification
    console.log("\n--- Starting Verification Phase ---");
    console.log("Simulating user entering the OTP...");
    
    const verifyT0 = performance.now();
    const verifyResult = await verifyOTP(testPhone, otp);
    const verifyT1 = performance.now();
    
    if (verifyResult.success) {
        console.log(`✅ OTP Verification Successful in ${(verifyT1 - verifyT0).toFixed(2)} ms`);
    } else {
        console.log(`❌ OTP Verification Failed after ${(verifyT1 - verifyT0).toFixed(2)} ms`);
        console.log(`Reason: ${verifyResult.message}`);
    }

    // Attempt verification again with same OTP (should fail due to being used/deleted)
    console.log("\nTrying verification again with the same OTP (should fail)...");
    const verifyT2 = performance.now();
    const verifyResult2 = await verifyOTP(testPhone, otp);
    const verifyT3 = performance.now();
    
    if (!verifyResult2.success) {
        console.log(`✅ Correctly rejected used OTP in ${(verifyT3 - verifyT2).toFixed(2)} ms`);
    } else {
        console.log(`❌ Incorrectly accepted used OTP in ${(verifyT3 - verifyT2).toFixed(2)} ms`);
    }

    // Cleanup and Exit
    console.log("\n=== Test Completed ===");
    await mongoose.disconnect();
    process.exit(0);
}

testOtpFlowTiming();
