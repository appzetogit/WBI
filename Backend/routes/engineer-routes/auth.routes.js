const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const {
  sendOTP,
  register,
  login,
  logout,
  refreshToken,
  verifyLogin,
  verifyAadhaarSignup,
  verifyPanSignup,
  initiateDigiLockerSignup,
  completeDigiLockerSignup
} = require('../../controllers/engineerControllers/engineerAuthController');
const { registerCompany } = require('../../controllers/b2bControllers/companyAuthController');
const { authenticate } = require('../../middleware/authMiddleware');
const { isEngineer } = require('../../middleware/roleMiddleware');
const rateLimiter = require('../../middleware/rateLimiter');
const { verificationLimiter, otpLimiter, registrationLimiter, loginLimiter, strictApiLimiter } = rateLimiter;
const { getRegistrationConfig } = require('../../controllers/engineerControllers/engineerConfigController');
const idempotency = require('../../middleware/idempotency');

// Validation rules
const sendOTPValidation = [
  body('phone').trim().notEmpty().withMessage('Phone number is required')
    .isLength({ min: 10, max: 10 }).withMessage('Phone number must be 10 digits'),
  body('email').optional({ nullable: true, checkFalsy: true }).isEmail().withMessage('Please provide a valid email')
];

const verifyLoginValidation = [
  body('phone').trim().notEmpty().withMessage('Phone number is required')
    .isLength({ min: 10, max: 10 }).withMessage('Phone number must be 10 digits'),
  body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits')
];

const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('phone').trim().notEmpty().withMessage('Phone number is required')
    .isLength({ min: 10, max: 10 }).withMessage('Phone number must be 10 digits'),
  body('email').optional({ nullable: true, checkFalsy: true }).isEmail().withMessage('Please provide a valid email'),
  body('password').trim().notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
];

const loginValidation = [
  body('phone').trim().notEmpty().withMessage('Phone number is required')
    .isLength({ min: 10, max: 10 }).withMessage('Phone number must be 10 digits'),
  body('password').trim().notEmpty().withMessage('Password is required')
];

// ===== PUBLIC ROUTES =====

// LAYER 3: OTP — max 3 sends per 10 minutes (prevents SMS spam)
router.post('/send-otp', idempotency, otpLimiter, sendOTPValidation, sendOTP);

// LAYER 3: Login verify — max 3 per 10 seconds (rapid-fire click protection)
router.post('/verify-login', idempotency, loginLimiter, verifyLoginValidation, verifyLogin);

// LAYER 3: Registration — max 5 per minute
router.post('/register', idempotency, registrationLimiter, registerValidation, register);
router.post('/register-company', registrationLimiter, registerCompany);

router.post('/login', loginLimiter, loginValidation, login);
router.post('/refresh-token', refreshToken);
router.get('/config/registration', getRegistrationConfig);

// ===== AUTHENTICATED ROUTES =====
router.post('/logout', authenticate, isEngineer, logout);

// ===== PRE-REGISTRATION CGPE (expensive external API — strict limits) =====
// LAYER 3: verificationLimiter = max 5 per 15 minutes per IP
router.post('/verify-aadhaar-signup', verificationLimiter, verifyAadhaarSignup);
router.post('/verify-pan-signup', verificationLimiter, verifyPanSignup);
router.post('/digilocker/initiate', verificationLimiter, initiateDigiLockerSignup);
router.post('/digilocker/complete', verificationLimiter, completeDigiLockerSignup);

module.exports = router;
