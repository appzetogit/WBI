const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');

// #region agent log
const DEBUG_LOG_PATH = path.join(__dirname, '..', '..', '.cursor', 'debug-7d825b.log');
function agentLog(hypothesisId, location, message, data = {}) {
  const payload = { sessionId: '7d825b', runId: 'pre-fix', hypothesisId, location, message, data, timestamp: Date.now() };
  try { fs.appendFileSync(DEBUG_LOG_PATH, JSON.stringify(payload) + '\n'); } catch (_) { /* ignore */ }
  fetch('http://127.0.0.1:7577/ingest/6011d822-6630-4485-85a2-a11dfd06147b', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '7d825b' }, body: JSON.stringify(payload) }).catch(() => {});
}
// #endregion

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
        'x-secret-key': this.clientSecret || '',
        'x-api-secret': this.clientSecret || ''
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

      // #region agent log
      agentLog('A', 'cgpeService.js:makeRequest:ok', 'CGPE request OK', { endpoint, httpStatus: response.status, hasData: !!response.data });
      // #endregion

      return response.data;
    } catch (error) {
      // Log full CGPE error response for debugging on production
      console.error('[CGPE_SERVICE_ERROR] Full response:', JSON.stringify(error.response?.data || error.message));
      console.error('[CGPE_SERVICE_ERROR] Status:', error.response?.status);
      console.error('[CGPE_SERVICE_ERROR] Endpoint:', endpoint);

      const resData = error.response?.data || {};
      // Surface IP restriction error clearly
      if (resData.message && resData.message.toLowerCase().includes('ip not allowed')) {
        throw new Error(`CGPE API Error: Your server IP (${resData.error?.clientIP || 'unknown'}) is not whitelisted. Please add this IP in your CGPE merchant dashboard under IP Whitelist settings.`);
      }
      const errorMessage = resData.message || resData.error || error.message || 'Verification failed due to invalid details or provider error.';
      // #region agent log
      agentLog('A', 'cgpeService.js:makeRequest:err', 'CGPE request failed', { endpoint, httpStatus: error.response?.status || null, providerMsg: String(errorMessage).slice(0, 120), baseUrl: this.baseUrl });
      // #endregion
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
  extractOkycSessionId(result) {
    const d = result?.data ?? {};
    const candidates = [
      d.sessionId,
      d.clientId,
      d.requestId,
      d.referenceId,
      d.reference_id,
      d.transactionId,
      result.sessionId,
      result.clientId,
      result.requestId,
      result.reference_id
    ];
    for (const c of candidates) {
      if (c == null || c === '') continue;
      const id = String(c).trim();
      if (id && !this.isStaleFakeOkycSessionId(id)) return id;
    }
    return null;
  }

  /** Legacy bug generated `client_<13-digit-ms>` with no provider tie-in */
  isStaleFakeOkycSessionId(id) {
    return /^client_\d{13}$/.test(String(id));
  }

  normalizeAadhaarVerifyResult(result, aadhaarNumber) {
    const aadhaarData = result.data?.aadhaarData || result.data || result.result || {};
    return {
      success: true,
      data: {
        ...aadhaarData,
        fullName: aadhaarData.fullName || aadhaarData.name,
        aadhaarNumberMasked:
          aadhaarData.aadhaarNumberMasked ||
          (aadhaarNumber ? `XXXX-XXXX-${String(aadhaarNumber).slice(-4)}` : 'XXXX-XXXX-XXXX')
      },
      requestId:
        result.data?.transactionId ||
        result.transactionId ||
        result.reference_id ||
        result.data?.requestId ||
        `req_${Date.now()}`
    };
  }

  /** Synthetic id when provider omitted requestId — not valid for OKYC verify */
  isSyntheticDocSessionId(id) {
    return /^doc_\d{4}_\d+$/.test(String(id || ''));
  }

  async generateAadhaarOtp(aadhaarNumber) {
    const num = String(aadhaarNumber);
    const isMock = process.env.USE_MOCK_KYC === 'true' || !this.apiKey || this.apiKey === 'your_cgpe_api_key_here';
    // #region agent log
    agentLog('D', 'cgpeService.js:generateAadhaarOtp:start', 'generateAadhaarOtp start', { baseUrl: this.baseUrl, isMock, aadhaarLast4: num.slice(-4), merchantConfigured: !!this.clientId, runId: 'post-fix' });
    // #endregion

    // Primary: OKYC on verify.cgpey.com (doc /api/kyc/* and /api/v1/*/aadhaar/generate-otp return 404)
    try {
      const result = await this.makeRequest('/api/v1/verify/okyc/initiate', { aadhaarNumber: num });
      const sessionId = this.extractOkycSessionId(result);
      if (!sessionId) {
        const keys = Object.keys(result?.data || result || {});
        console.error('[CGPE] okyc/initiate missing session id keys:', keys);
        // #region agent log
        agentLog('B', 'cgpeService.js:generateAadhaarOtp:okycNoSession', 'okyc initiate missing session', { keys, runId: 'post-fix' });
        // #endregion
        throw new Error('Aadhaar OTP sent but provider session id missing. Please try Get OTP again.');
      }
      console.log('[CGPE] Aadhaar OTP generated via okyc/initiate session=', sessionId);
      // #region agent log
      agentLog('B', 'cgpeService.js:generateAadhaarOtp:okycOk', 'okyc initiate succeeded', { flow: 'okyc', hasSession: true, runId: 'post-fix' });
      // #endregion
      return {
        success: true,
        data: {
          clientId: sessionId,
          flow: 'okyc',
          message: result.message || result.data?.message || 'OTP sent successfully'
        },
        requestId: result.data?.transactionId || result.reference_id || result.data?.referenceId || sessionId
      };
    } catch (okycErr) {
      // #region agent log
      agentLog('E', 'cgpeService.js:generateAadhaarOtp:okycFail', 'okyc initiate failed', { err: String(okycErr?.message || '').slice(0, 160), runId: 'post-fix' });
      // #endregion
      throw okycErr;
    }
  }

  /**
   * Verify Aadhaar OTP — OKYC primary (matches generate via okyc/initiate)
   */
  async verifyAadhaarOtp(sessionId, otp, aadhaarNumber) {
    try {
      const otpStr = String(otp ?? '').trim();
      if (!otpStr) {
        throw new Error('OTP is required');
      }
      const aadhaar = aadhaarNumber ? String(aadhaarNumber).trim() : null;
      if (!aadhaar || !/^\d{12}$/.test(aadhaar)) {
        throw new Error('Valid 12-digit Aadhaar number is required');
      }

      const sid = String(sessionId ?? '').trim();
      if (!sid || this.isStaleFakeOkycSessionId(sid) || this.isSyntheticDocSessionId(sid)) {
        throw new Error('OTP session expired. Please tap Get OTP again and use the new code.');
      }

      // OKYC verify — same session from okyc/initiate (do not call dead /api/kyc/* paths)
      const okycPayload = {
        sessionId: sid,
        clientId: sid,
        reference_id: sid,
        referenceId: sid,
        requestId: sid,
        otp: otpStr,
        aadhaarNumber: aadhaar
      };

      try {
        const result = await this.makeRequest('/api/v1/verify/okyc/verify', okycPayload);
        // #region agent log
        agentLog('B', 'cgpeService.js:verifyAadhaarOtp:okycOk', 'okyc verify succeeded', { runId: 'post-fix' });
        // #endregion
        console.log('[CGPE] Aadhaar OTP verified via okyc/verify');
        return this.normalizeAadhaarVerifyResult(result, aadhaar);
      } catch (okycErr) {
        // #region agent log
        agentLog('E', 'cgpeService.js:verifyAadhaarOtp:okycFail', 'okyc verify failed', { err: String(okycErr?.message || '').slice(0, 160), runId: 'post-fix' });
        // #endregion
        const msg = okycErr.message || 'Aadhaar verification failed';
        if (/validation error/i.test(msg) || /invalid otp/i.test(msg) || /route not found/i.test(msg)) {
          throw new Error(
            'Invalid or expired Aadhaar OTP. Tap Get OTP again and enter the latest UIDAI SMS within 2–3 minutes.'
          );
        }
        throw okycErr;
      }
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
   * Verify Bank Account details (Penny Drop)
   */
  async verifyBank(accountNumber, ifsc) {
    const accNumberStr = String(accountNumber);
    const ifscStr = String(ifsc);

    const result = await this.makeRequest('/api/v1/verify/bank', {
      accountNumber: accNumberStr,
      ifscCode: ifscStr
    });

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
   * Docs: POST /api/v1/digilocker/initiate { mobileNumber, redirectUrl }
   * Headers: x-merchant-id, x-api-key, x-secret-key
   */
  async initiateDigiLocker(mobileNumber, redirectUrl) {
    // #region agent log
    agentLog('DL1', 'cgpeService.js:initiateDigiLocker', 'digilocker initiate', { hasMobile: !!mobileNumber, hasRedirect: !!redirectUrl, runId: 'post-fix' });
    // #endregion
    const result = await this.makeRequest('/api/v1/digilocker/initiate', {
      mobileNumber: String(mobileNumber || '').trim(),
      redirectUrl: String(redirectUrl || '').trim()
    });
    const d = result.data || {};
    const authUrl = d.authUrl || d.authorizationUrl || d.url || null;
    const recordId = d.recordId || d.transactionId || null;
    if (!authUrl || !recordId) {
      // #region agent log
      agentLog('DL1', 'cgpeService.js:initiateDigiLocker:badResp', 'missing authUrl/recordId', { keys: Object.keys(d), runId: 'post-fix' });
      // #endregion
      throw new Error('DigiLocker initiate failed: authUrl or recordId missing from provider');
    }
    // #region agent log
    agentLog('DL1', 'cgpeService.js:initiateDigiLocker:ok', 'digilocker initiate ok', { hasAuthUrl: true, hasRecordId: true, runId: 'post-fix' });
    // #endregion
    return {
      success: true,
      data: {
        recordId,
        publicId: d.publicId || null,
        authUrl,
        authorizationUrl: authUrl,
        state: d.state || null
      },
      requestId: result.requestId || result.data?.requestId
    };
  }

  /**
   * Callback for DigiLocker OAuth Code — no auth headers (per CGPE docs)
   */
  async callbackDigiLocker(code, state, codeVerifier, recordId) {
    // #region agent log
    agentLog('DL2', 'cgpeService.js:callbackDigiLocker', 'digilocker callback', { hasCode: !!code, hasState: !!state, hasVerifier: !!codeVerifier, hasRecordId: !!recordId, runId: 'post-fix' });
    // #endregion
    const response = await axios.post(
      `${this.baseUrl}/api/v1/digilocker/callback`,
      {
        code: String(code || '').trim(),
        state: String(state || '').trim(),
        codeVerifier: String(codeVerifier || '').trim(),
        recordId: String(recordId || '').trim()
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
    );
    if (response.data && response.data.success === false) {
      throw new Error(response.data.message || 'DigiLocker callback failed');
    }
    return response.data;
  }

  /**
   * Complete DigiLocker OAuth Flow — returns verified Aadhaar KYC
   */
  async completeDigiLocker(recordId) {
    // #region agent log
    agentLog('DL3', 'cgpeService.js:completeDigiLocker', 'digilocker complete', { hasRecordId: !!recordId, runId: 'post-fix' });
    // #endregion
    const result = await this.makeRequest('/api/v1/digilocker/complete', {
      recordId: String(recordId || '').trim()
    });
    const aadhaarData = result.data?.aadhaarData || result.data || {};
    return {
      success: true,
      data: {
        fullName: aadhaarData.name || aadhaarData.fullName,
        dob: aadhaarData.dateOfBirth || aadhaarData.dob,
        gender: aadhaarData.gender,
        address: aadhaarData.address,
        state: aadhaarData.state,
        district: aadhaarData.district,
        pincode: aadhaarData.pincode,
        aadhaarNumberMasked:
          aadhaarData.aadhaarNumberMasked ||
          (aadhaarData.aadhaarNumber
            ? `XXXX-XXXX-${String(aadhaarData.aadhaarNumber).slice(-4)}`
            : 'XXXX-XXXX-XXXX'),
        transactionId: result.data?.transactionId || result.requestId,
        status: result.data?.status || 'VERIFIED'
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
          sessionId: `client_${Date.now()}_${num}`,
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
    
    if (endpoint.includes('gst')) {
      const gstin = (data.gstin || '').toUpperCase();
      if (gstin.endsWith('Z0')) {
        throw new Error('GSTIN not found or inactive');
      }
      return {
        success: true,
        transactionId: `req_gst_${Date.now()}`,
        status: 'SUCCESS',
        result: {
          legal_name: 'ACME ENTERPRISES PRIVATE LIMITED',
          status: 'Active',
          gstin
        }
      };
    }

    if (endpoint.includes('cin')) {
      return {
        success: true,
        transactionId: `req_cin_${Date.now()}`,
        status: 'SUCCESS',
        result: {
          company_name: 'ACME ENTERPRISES PRIVATE LIMITED',
          status: 'Active',
          cin: data.cin
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
      const rid = 'mock_record_12345';
      const redirect = data.redirectUrl || 'http://localhost:5174/engineer/signup';
      const authUrl = redirect.includes('?')
        ? `${redirect}&recordId=${rid}&code=mock_code&state=mock_state&codeVerifier=mock_verifier`
        : `${redirect}?recordId=${rid}&code=mock_code&state=mock_state&codeVerifier=mock_verifier`;
      return {
        success: true,
        requestId: `req_dl_init_${Date.now()}`,
        status: 'SUCCESS',
        data: {
          recordId: rid,
          publicId: 'digilocker_mock_public',
          authUrl,
          authorizationUrl: authUrl,
          url: authUrl,
          state: 'mock_state'
        }
      };
    }

    if (endpoint.includes('digilocker/callback')) {
      return {
        success: true,
        message: 'Authorization code received (mock)',
        data: { recordId: data.recordId || 'mock_record_12345', status: 'PENDING' }
      };
    }

    if (endpoint.includes('digilocker/complete')) {
      return {
        success: true,
        requestId: `req_dl_comp_${Date.now()}`,
        status: 'SUCCESS',
        data: {
          transactionId: `txn_mock_${Date.now()}`,
          recordId: data.recordId || 'mock_record_12345',
          service: 'DIGILOCKER',
          aadhaarData: {
            name: 'Mock User',
            dateOfBirth: '1990-01-01',
            gender: 'MALE',
            address: 'Mock Address',
            state: 'Mock State',
            district: 'Mock District',
            pincode: '123456',
            aadhaarNumberMasked: 'XXXX-XXXX-1234'
          },
          status: 'VERIFIED'
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
