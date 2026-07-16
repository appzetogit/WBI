const axios = require('axios');
const https = require('https');

class CgpeService {
  constructor() {
    this.baseUrl = process.env.CGPE_BASE_URL || process.env.VERIFY_API_BASE_URL || 'https://verify.cgpey.com';
    this.apiKey = process.env.CGPE_API_KEY || process.env.VERIFY_API_KEY || 'pk_a7e260f3f70602e79d2551b04389bf94';
    this.clientId = process.env.CGPE_CLIENT_ID || process.env.VERIFY_MERCHANT_ID || '6a226d16b27283a7438b2f44';
    this.clientSecret = process.env.CGPE_CLIENT_SECRET || process.env.VERIFY_SECRET_KEY || '0949dfd379ce77ab141f9808569d0f451f0afc8b187ac653cb13b2c8965c3c27';
  }

  /**
   * Helper to make POST requests to CGPE API
   */
  async makeRequest(endpoint, data) {
    // Strict Validation
    if (endpoint.includes('aadhaar') && data.aadhaarNumber) {
      if (!/^\d{12}$/.test(data.aadhaarNumber)) {
        throw new Error('Invalid Aadhaar format. Please enter a valid 12-digit Aadhaar number.');
      }
    }
    
    if (endpoint.includes('/verify/pan') && data.pan) {
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i.test(data.pan)) {
        throw new Error('Invalid PAN format. Please enter a valid PAN (e.g., ABCDE1234F).');
      }
    }

    const isMock = process.env.USE_MOCK_KYC === 'true' || !this.apiKey || this.apiKey === 'your_cgpe_api_key_here';
    if (isMock) {
      return this.simulateSandboxResponse(endpoint, data);
    }

    try {
      // Create HTTPS agent to handle TLS compatibility issues (ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR)
      const httpsAgent = new https.Agent({
        rejectUnauthorized: true, // Keep SSL verification enabled for security
        minVersion: 'TLSv1.2',   // Force minimum TLS 1.2 to avoid legacy TLS errors
        maxVersion: 'TLSv1.3'
      });

      const headers = {
        'Content-Type': 'application/json',
        'x-merchant-id': this.clientId,
        'x-api-key': this.apiKey,
        'x-secret-key': this.clientSecret || ''
      };

      const payload = {
        ...data
      };

      const response = await axios.post(`${this.baseUrl}${endpoint}`, payload, { headers, httpsAgent });
      
      // Explicitly check for API-level failures even if HTTP status is 200 OK
      if (response.data && (response.data.status === 'FAILED' || response.data.success === false)) {
        const errorMsg = response.data.message || response.data.error || 'Verification failed at provider end';
        throw new Error(errorMsg);
      }

      return response.data;
    } catch (error) {
      // Extract the actual error message from the provider if available
      const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message || 'Verification failed due to invalid details or provider error.';
      throw new Error(`Verification Failed: ${errorMessage} (Status: ${error.response?.status || 'Unknown'})`);
    }
  }

  /**
   * Fetch OAuth dynamic bearer token
   */
  async getAccessToken() {
    try {
      const response = await axios.post(`${this.baseUrl}/oauth/token`, {
        client_id: this.clientId,
        client_secret: this.clientSecret
      });
      return response.data.access_token;
    } catch (error) {
      console.error('[CGPE_SERVICE_AUTH_ERROR] Token fetch failed', error.response?.data || error.message);
      throw new Error('CGPE authentication handshake failed');
    }
  }

  /**
   * Generate Aadhaar OTP
   */
  async generateAadhaarOtp(aadhaarNumber) {
    try {
      const result = await this.makeRequest('/api/v1/verify/okyc/initiate', { aadhaarNumber });
      return {
        success: true,
        data: {
          clientId: result.data?.sessionId || result.sessionId || `client_${Date.now()}`,
          message: result.message || 'OTP sent successfully'
        },
        requestId: result.data?.transactionId || result.reference_id || `req_${Date.now()}`
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Verify Aadhaar OTP
   */
  async verifyAadhaarOtp(sessionId, otp, aadhaarNumber) {
    try {
      const result = await this.makeRequest('/api/v1/verify/okyc/verify', { sessionId, otp, aadhaarNumber });
      
      const aadhaarData = result.data?.aadhaarData || result.data || {};
      
      return {
        success: true,
        data: {
          ...aadhaarData,
          fullName: aadhaarData.name, // Normalizing name format for kycController
          aadhaarNumberMasked: 'XXXX-XXXX-' + (aadhaarNumber || 'XXXX').slice(-4)
        },
        requestId: result.data?.transactionId || result.reference_id || `req_${Date.now()}`
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Verify PAN card
   */
  async verifyPan(panNumber) {
    try {
      const result = await this.makeRequest('/api/v1/verify/pan', { pan: panNumber });
      return {
        success: true,
        data: result.data || result,
        requestId: result.data?.transactionId || result.reference_id || `req_${Date.now()}`
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Verify Bank Account details (Penny Drop with fallback to Pennyless)
   */
  async verifyBank(accountNumber, ifsc) {
    const accNumberStr = String(accountNumber);
    const ifscStr = String(ifsc);

    let result;
    try {
      result = await this.makeRequest('/api/v1/verify/bank', {
        accountNumber: accNumberStr,
        ifscCode: ifscStr
      });
    } catch (error) {
      console.warn(`[CGPE_SERVICE] Penny drop failed for ${accNumberStr}, falling back to pennyless. Error: ${error.message}`);
      try {
        result = await this.makeRequest('/api/v1/verify/bank-pennyless', {
          accountNumber: accNumberStr,
          ifscCode: ifscStr
        });
      } catch (pennylessError) {
        throw pennylessError;
      }
    }

    const bankResult = result.result || {};

    // is_valid false means invalid/inactive account
    if (bankResult.is_valid === false) {
      throw new Error(bankResult.failure_reason || 'Bank account verification failed: Account not valid');
    }

    return {
      success: true,
      data: {
        accountHolderName: bankResult.account_holder_name,
        accountNumberMasked: bankResult.account_number,
        ifsc: bankResult.account_ifsc || ifscStr,
        isValid: bankResult.is_valid
      },
      requestId: result.tranx_id || `req_${Date.now()}`
    };
  }

  /**
   * Verify Driving License via CGPE
   */
  async verifyDrivingLicense(dlNumber, dob) {
    const result = await this.makeRequest('/api/v1/verify/driving_license', {
      dlNumber,
      dob
    });

    if (result.status === 'FAILED' || !result.success) {
      throw new Error(result.message || 'Driving License verification failed');
    }

    return {
      success: true,
      data: {
        fullName: result.data?.name || 'Verified User',
        dlNumberMasked: dlNumber.slice(0, 4) + 'XXXX' + dlNumber.slice(-4),
        status: result.data?.status || 'ACTIVE'
      },
      requestId: result.requestId || `req_dl_${Date.now()}`
    };
  }

  /**
   * Initiate DigiLocker OAuth Flow
   */
  async initiateDigiLocker(mobileNumber, redirectUrl) {
    const result = await this.makeRequest('/api/v1/digilocker/initiate', {
      mobileNumber,
      redirectUrl
    });
    return {
      success: true,
      data: {
        recordId: result.data?.recordId,
        authUrl: result.data?.authUrl,
        state: result.data?.state
      }
    };
  }

  /**
   * Callback for DigiLocker OAuth Code
   */
  async callbackDigiLocker(code, state, codeVerifier, recordId) {
    // Official docs state no auth headers needed for this step
    const response = await axios.post(`${this.baseUrl}/api/v1/digilocker/callback`, {
      code,
      state,
      codeVerifier,
      recordId
    });
    return response.data;
  }

  /**
   * Complete DigiLocker OAuth Flow
   */
  async completeDigiLocker(recordId) {
    const result = await this.makeRequest('/api/v1/digilocker/complete', {
      recordId
    });
    const aadhaarData = result.data?.aadhaarData || {};
    return {
      success: true,
      data: {
        fullName: aadhaarData.name,
        dob: aadhaarData.dateOfBirth,
        gender: aadhaarData.gender,
        address: aadhaarData.address,
        aadhaarNumberMasked: aadhaarData.aadhaarNumberMasked || 'XXXX-XXXX-XXXX'
      }
    };
  }

  /**
   * Verify face matching between selfie and document photo using face_match API
   */
  async verifyFaceMatch(selfieUrl, docImageUrl) {
    const isMock = !this.apiKey || this.apiKey === 'your_cgpe_api_key_here';
    if (isMock) {
      return this.simulateSandboxResponse('/api/v1/verify/face_match', { selfieUrl, docImageUrl });
    }

    try {
      const FormData = require('form-data');
      const formData = new FormData();

      // Download selfie image into buffer or parse base64
      let image1Buffer;
      if (selfieUrl.startsWith('data:image')) {
        const base64Data = selfieUrl.replace(/^data:image\/\w+;base64,/, "");
        image1Buffer = Buffer.from(base64Data, 'base64');
      } else {
        const image1Response = await axios.get(selfieUrl, { responseType: 'arraybuffer' });
        image1Buffer = Buffer.from(image1Response.data, 'binary');
      }
      
      // Append the downloaded file stream with a filename
      formData.append('image1', image1Buffer, { filename: 'selfie.jpg', contentType: 'image/jpeg' });
      
      // Pass the doc image URL as image2_url (ensure it is a valid url or omit it for testing)
      if (docImageUrl && docImageUrl.startsWith('http')) {
        formData.append('image2_url', docImageUrl);
      }

      const headers = {
        ...formData.getHeaders(),
        'x-merchant-id': this.clientId,
        'x-api-key': this.apiKey,
        'x-secret-key': this.clientSecret || ''
      };

      const response = await axios.post(`${this.baseUrl}/api/v1/verify/face_match`, formData, { headers });

      if (response.data && (response.data.status === 'FAILED' || response.data.success === false)) {
        const errorMsg = response.data.message || response.data.error || 'Face match verification failed at provider end';
        throw new Error(errorMsg);
      }

      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message || 'Face match verification failed.';
      throw new Error(`Face Match Failed: ${errorMessage}`);
    }
  }

  /**
   * Verify face matching between selfie and document photo (Legacy)
   */
  async verifySelfie(selfieUrl, docImageUrl) {
    return this.verifyFaceMatch(selfieUrl, docImageUrl);
  }

  /**
   * Sandbox simulation mode fallback if no keys configured
   */
  simulateSandboxResponse(endpoint, data) {
    console.log(`[CGPE_MOCK] Simulating CGPE API call for ${endpoint}`, data);
    
    if (endpoint.includes('aadhaar/generate-otp') || endpoint.includes('okyc/initiate')) {
      const num = data.aadhaarNumber || '123456789012';
      if (num === '000000000000') {
        throw new Error('Invalid Aadhaar number format or invalid digits');
      }
      return {
        success: true,
        requestId: `req_adh_gen_${Date.now()}`,
        status: 'SUCCESS',
        data: {
          clientId: `client_${Date.now()}_${num}`,
          message: 'OTP sent successfully'
        }
      };
    }
    
    if (endpoint.includes('aadhaar/submit-otp') || endpoint.includes('aadhaar') || endpoint.includes('okyc/verify') || endpoint.includes('okyc/submit')) {
      return {
        success: true,
        requestId: `req_adh_sub_${Date.now()}`,
        status: 'SUCCESS',
        data: {
          fullName: 'John Doe',
          dob: '1992-05-15',
          gender: 'MALE',
          state: 'Madhya Pradesh',
          pincode: '452001',
          careOf: 'C/O Richard Doe',
          aadhaarNumberMasked: 'XXXX-XXXX-1234'
        }
      };
    }
    
    if (endpoint.includes('pan')) {
      const num = (data.panNumber || 'ABCDE1234F').toUpperCase();
      if (num === 'ABCDE0000F') {
        throw new Error('PAN status is INACTIVE or not matching records');
      }
      return {
        success: true,
        requestId: `req_pan_${Date.now()}`,
        status: 'SUCCESS',
        data: {
          fullName: data.fullName || 'John Doe',
          panNumberMasked: num.slice(0, 2) + 'XXXXX' + num.slice(-3),
          status: 'ACTIVE',
          category: 'INDIVIDUAL'
        }
      };
    }

    if (endpoint.includes('bank')) {
      const num = data.accountNumber || '1234567890';
      if (num === '0000000000') {
        throw new Error('Bank verification failed: Account number not active or invalid details');
      }
      return {
        status: 'success',
        result: {
          failure_reason: null,
          account_number: 'XXXXXX' + num.slice(-4),
          user: null,
          is_valid: true,
          account_holder_name: 'JOHN DOE',
          account_ifsc: data.ifscCode || data.ifsc || 'HDFC0001234',
          npci_error_code: null
        },
        tranx_id: `req_bnk_${Date.now()}`,
        chargeble: 'true',
        user_consent: 'true'
      };
    }

    if (endpoint.includes('selfie') || endpoint.includes('face_match')) {
      return {
        success: true,
        requestId: `req_slf_${Date.now()}`,
        status: 'SUCCESS',
        data: {
          matchScore: 88.4,
          isMatch: true,
          faceDetected: true,
          status: 'MATCHED'
        }
      };
    }

    if (endpoint.includes('digilocker/initiate')) {
      return {
        success: true,
        requestId: `req_dl_init_${Date.now()}`,
        status: 'SUCCESS',
        data: {
          url: data.redirectUrl ? (data.redirectUrl.includes('?') ? `${data.redirectUrl}&recordId=mock_record_12345` : `${data.redirectUrl}?recordId=mock_record_12345`) : 'http://localhost:5174/mock-digilocker-redirect?recordId=mock_record_12345',
          recordId: 'mock_record_12345'
        }
      };
    }

    if (endpoint.includes('digilocker/complete')) {
      return {
        success: true,
        requestId: `req_dl_comp_${Date.now()}`,
        status: 'SUCCESS',
        data: {
          fullName: 'Mock User',
          dob: '1990-01-01',
          gender: 'MALE',
          aadhaarNumberMasked: 'XXXX-XXXX-1234',
          address: {
            state: 'Mock State',
            pincode: '123456',
            careOf: 'Mock C/O'
          }
        }
      };
    }

    if (endpoint.includes('driving_license') || endpoint.includes('license')) {
      const num = (data.dlNumber || 'DL1420110012345').toUpperCase();
      if (num === 'DL0000000000000') {
        throw new Error('Driving License is invalid or not active');
      }
      return {
        success: true,
        requestId: `req_dlv_${Date.now()}`,
        status: 'SUCCESS',
        data: {
          name: 'John Doe',
          status: 'ACTIVE',
          dob: data.dob || '1990-01-01'
        }
      };
    }

    throw new Error('Unknown verification endpoint requested');
  }
}

module.exports = new CgpeService();
