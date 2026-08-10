const axios = require('axios');
const https = require('https');

class CgpeService {
  constructor() {
    this.baseUrl = process.env.CGPE_BASE_URL || process.env.VERIFY_API_BASE_URL || 'https://verify.cgpey.com';
    // Never hardcode production secrets — set CGPE_* in environment
    this.apiKey = process.env.CGPE_API_KEY || process.env.VERIFY_API_KEY || '';
    this.clientId = process.env.CGPE_CLIENT_ID || process.env.VERIFY_MERCHANT_ID || '';
    this.clientSecret = process.env.CGPE_CLIENT_SECRET || process.env.VERIFY_SECRET_KEY || '';
  }

  /**
   * Helper to make POST requests to CGPE API
   * @param {string} endpoint
   * @param {object} data
   * @param {{ headerMode?: 'default' | 'kyc-doc' }} [options]
   *   kyc-doc = official Aadhaar OTP docs (x-api-key + x-api-secret only)
   */
  async makeRequest(endpoint, data, options = {}) {
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
      const httpsAgent = new https.Agent({
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.3'
      });

      const headerMode = options.headerMode || 'default';
      // Official KYC OTP docs: x-api-key + x-api-secret only (merchantId in body)
      // DigiLocker / default: also send x-merchant-id + x-secret-key
      const headers =
        headerMode === 'kyc-doc'
          ? {
              'Content-Type': 'application/json',
              'x-api-key': this.apiKey,
              'x-api-secret': this.clientSecret || ''
            }
          : {
              'Content-Type': 'application/json',
              'x-merchant-id': this.clientId,
              'x-api-key': this.apiKey,
              'x-secret-key': this.clientSecret || '',
              'x-api-secret': this.clientSecret || ''
            };

      const response = await axios.post(`${this.baseUrl}${endpoint}`, { ...data }, { headers, httpsAgent });
      
      if (response.data && (response.data.status === 'FAILED' || response.data.success === false)) {
        const errorMsg = response.data.message || response.data.error || 'Verification failed at provider end';
        throw new Error(errorMsg);
      }

      return response.data;
    } catch (error) {
      console.error('[CGPE_SERVICE_ERROR] Full response:', JSON.stringify(error.response?.data || error.message));
      console.error('[CGPE_SERVICE_ERROR] Status:', error.response?.status);
      console.error('[CGPE_SERVICE_ERROR] Endpoint:', endpoint);

      const resData = error.response?.data || {};
      if (resData.message && String(resData.message).toLowerCase().includes('ip not allowed')) {
        const isProd = process.env.NODE_ENV === 'production';
        if (!isProd && process.env.CGPE_STRICT_IP !== 'true') {
          console.warn(
            `[CGPE] IP not whitelisted (${resData.error?.clientIP || 'unknown'}) — dev mock fallback for ${endpoint}`
          );
          return this.simulateSandboxResponse(endpoint, data);
        }
        throw new Error(`CGPE API Error: Your server IP (${resData.error?.clientIP || 'unknown'}) is not whitelisted. Please add this IP in your CGPE merchant dashboard under IP Whitelist settings.`);
      }
      const detail = Array.isArray(resData.error)
        ? resData.error.filter(Boolean).join('; ')
        : (typeof resData.error === 'string' ? resData.error : '');
      const errorMessage =
        [resData.message, detail].filter(Boolean).join(': ') ||
        error.message ||
        'Verification failed due to invalid details or provider error.';
      throw new Error(`Verification Failed: ${errorMessage} (Status: ${error.response?.status || 'Unknown'})`);
    }
  }

  /**
   * Live GST verification (CGPE / GSP)
   * POST /api/v1/verify/gst  body: { gstNumber }  (also accepts { gstin })
   */
  async verifyGst(gstin) {
    const normalized = String(gstin || '').trim().toUpperCase();
    if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(normalized)) {
      throw new Error('Invalid GSTIN format. Please enter a valid 15-character GSTIN (e.g., 27ABCDE1234F1Z5).');
    }
    // Provider samples use gstNumber; some integrations use gstin — send both
    return this.makeRequest('/api/v1/verify/gst', {
      gstNumber: normalized,
      gstin: normalized
    });
  }

  /**
   * Live CIN / MCA verification (CGPE)
   * POST /api/v1/verify/cin  body: { cinNumber }  (also accepts { cin })
   */
  async verifyCin(cinNumber) {
    const normalized = String(cinNumber || '').trim().toUpperCase().replace(/\s+/g, '');
    if (
      !/^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/.test(normalized) &&
      !/^[A-Z]{3}-[0-9]{4}$/.test(normalized)
    ) {
      throw new Error('Invalid CIN format. Please enter a valid 21-character CIN (e.g., U72900MH2019PTC123456).');
    }
    return this.makeRequest('/api/v1/verify/cin', {
      cinNumber: normalized,
      cin: normalized
    });
  }

  /**
   * Live UPI VPA verification
   * POST /api/v1/verify/upi  { vpa }
   */
  async verifyUpi(vpa) {
    const normalized = String(vpa || '').trim().toLowerCase().replace(/\s+/g, '');
    if (!/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(normalized)) {
      throw new Error('Invalid UPI format. Please enter a valid VPA (e.g., name@paytm).');
    }
    return this.makeRequest('/api/v1/verify/upi', { vpa: normalized });
  }

  /**
   * Mobile → linked UPI lookup
   * POST /api/v1/verify/mobile-upi  { mobile }
   */
  async lookupMobileUpi(mobile) {
    const digits = String(mobile || '').replace(/\D/g, '').slice(-10);
    if (!/^[6-9]\d{9}$/.test(digits)) {
      throw new Error('Invalid mobile format. Enter a valid 10-digit Indian mobile number.');
    }
    return this.makeRequest('/api/v1/verify/mobile-upi', { mobile: digits });
  }

  /**
   * Reverse geocode
   * POST /api/v1/verify/location-detector  { latitude, longitude, detailed }
   */
  async detectLocation(latitude, longitude, detailed = false) {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error('Invalid coordinates for location detector.');
    }
    return this.makeRequest('/api/v1/verify/location-detector', {
      latitude: lat,
      longitude: lng,
      detailed: Boolean(detailed)
    });
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

    // verify.cgpey.com: /api/kyc/* = 404; docs.cgpey.com rejects these merchant keys.
    // Working path: OKYC initiate (delivers UIDAI OTP on production).
    try {
      const result = await this.makeRequest('/api/v1/verify/okyc/initiate', { aadhaarNumber: num });
      // Prefer real sessionId — okyc/verify requires sessionId (not clientId alone)
      const sessionId =
        (result?.data?.sessionId && String(result.data.sessionId).trim()) ||
        (result?.sessionId && String(result.sessionId).trim()) ||
        this.extractOkycSessionId(result);
      if (!sessionId) {
        const keys = Object.keys(result?.data || result || {});
        console.error('[CGPE] okyc/initiate missing session id keys:', keys);
        throw new Error('Aadhaar OTP sent but provider session id missing. Please try Get OTP again.');
      }
      console.log('[CGPE] Aadhaar OTP generated via okyc/initiate session=', sessionId);
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
      throw okycErr;
    }
  }

  /**
   * Verify Aadhaar OTP via CGPE OKYC.
   * Runtime-proven required body: { sessionId, otp, aadhaarNumber }
   * Endpoint: POST /api/v1/verify/okyc/verify (other guessed paths return 404)
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

      const payload = { sessionId: sid, otp: otpStr, aadhaarNumber: aadhaar };

      try {
        const result = await this.makeRequest('/api/v1/verify/okyc/verify', payload);
        return this.normalizeAadhaarVerifyResult(result, aadhaar);
      } catch (err) {
        const msg = String(err.message || '');
        if (/invalid otp|otp expired|incorrect otp/i.test(msg)) {
          const e = new Error(
            'Invalid or expired Aadhaar OTP. Tap Get OTP again and enter the latest UIDAI SMS within 2–3 minutes.'
          );
          e.providerMessage = msg;
          throw e;
        }
        if (/sessionId.*required|aadhaarNumber.*required|validation error/i.test(msg)) {
          const e = new Error(
            'Aadhaar OTP verification rejected by provider (missing session fields). Tap Get OTP again, or use DigiLocker.'
          );
          e.providerMessage = msg;
          throw e;
        }
        throw err;
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
    const result = await this.makeRequest('/api/v1/digilocker/initiate', {
      mobileNumber: String(mobileNumber || '').trim(),
      redirectUrl: String(redirectUrl || '').trim()
    });
    const d = result.data || {};
    const authUrl = d.authUrl || d.authorizationUrl || d.url || null;
    const recordId = d.recordId || d.transactionId || null;
    if (!authUrl || !recordId) {
      throw new Error('DigiLocker initiate failed: authUrl or recordId missing from provider');
    }
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
      const gstin = String(data.gstin || data.gstNumber || '').toUpperCase();
      if (gstin.endsWith('Z0')) {
        throw new Error('GSTIN not found or inactive');
      }
      if (gstin.endsWith('Z1')) {
        throw new Error('GSTIN status is Cancelled');
      }
      if (gstin.endsWith('Z2')) {
        throw new Error('GSTIN status is Suspended');
      }
      const pan = gstin.length === 15 ? gstin.slice(2, 12) : null;
      const stateCode = gstin.slice(0, 2);
      return {
        success: true,
        message: 'GST verification completed',
        transactionId: `req_gst_${Date.now()}`,
        statusCode: 200,
        data: {
          service: 'GST_VERIFICATION',
          gstNumber: gstin,
          gstin,
          legalName: 'ACME ENTERPRISES PRIVATE LIMITED',
          tradeName: 'ACME SERVICES',
          registrationStatus: 'ACTIVE',
          status: 'ACTIVE',
          pan,
          constitutionOfBusiness: 'Private Limited Company',
          taxpayerType: 'Regular',
          registrationDate: '01/04/2018',
          natureOfBusiness: 'Services',
          lastUpdated: new Date().toISOString().slice(0, 10),
          stateCode,
          pradr: {
            addr: {
              bnm: 'Business Plaza',
              st: 'MG Road',
              loc: 'Commercial Area',
              dst: 'Sample District',
              stcd: stateCode,
              pncd: '400001'
            }
          }
        }
      };
    }

    if (endpoint.includes('cin')) {
      const cin = String(data.cinNumber || data.cin || '').toUpperCase();
      if (cin.endsWith('000000')) {
        throw new Error('Company not found on MCA records');
      }
      if (cin.endsWith('111111')) {
        throw new Error('Company status is Struck Off');
      }
      return {
        success: true,
        message: 'CIN verification completed',
        requestId: `REQ_${Date.now()}_mock`,
        statusCode: 200,
        data: {
          transactionId: `tx_cin_${Date.now()}`,
          service: 'CIN_VERIFICATION',
          success: true,
          status: 'SUCCESS',
          message: 'CIN verification completed',
          cin,
          companyId: cin,
          companyName: 'ACME TECHNOLOGIES PRIVATE LIMITED',
          companyType: 'Private',
          companyMasterData: {
            cin,
            company_llp_name: 'ACME TECHNOLOGIES PRIVATE LIMITED',
            roc_code: 'ROC Mumbai',
            registration_number: cin.slice(-6),
            company_category: 'Company limited by shares',
            class_of_company: 'Private',
            authorised_capital: '1000000',
            paid_up_capital: '500000',
            date_of_incorporation: '2019-05-20',
            registered_address: '123 MG Road, Andheri, Mumbai, Maharashtra, India, 400053',
            company_status: 'Active',
            whether_listed_or_not: 'Unlisted'
          },
          presentDirectors: [
            {
              din_pan: '01234567',
              name: 'ROHAN SHARMA',
              date_of_appointment: '20/05/2019',
              nationality: 'Indian',
              gender: 'Male'
            }
          ],
          pastDirectors: [],
          charges: [],
          relatedParties: [],
          allDirectorships: [],
          chargeable: true,
          userConsent: true,
          timestamp: new Date().toISOString(),
          clientRefNum: `REQ_${Date.now()}_mock`,
          requestId: `tx_cin_${Date.now()}`
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

    if (endpoint.includes('mobile-upi') || endpoint.includes('mobile_upi')) {
      const mobile = String(data.mobile || '').replace(/\D/g, '').slice(-10);
      if (mobile.endsWith('0000')) {
        return {
          success: true,
          message: 'Mobile to UPI lookup completed',
          statusCode: 200,
          data: {
            service: 'MOBILE_TO_UPI_VERIFICATION',
            mobile,
            mobileLinkedName: null,
            vpa: null
          }
        };
      }
      return {
        success: true,
        message: 'Mobile to UPI lookup completed',
        statusCode: 200,
        data: {
          service: 'MOBILE_TO_UPI_VERIFICATION',
          mobile,
          mobileLinkedName: 'Mock User',
          vpa: `${mobile}@paytm`,
          transactionId: `tx_mupi_${Date.now()}`
        }
      };
    }

    if (endpoint.includes('upi') && !endpoint.includes('mobile')) {
      const vpa = String(data.vpa || '').toLowerCase();
      if (vpa.includes('invalid@') || vpa.endsWith('@fail')) {
        throw new Error('UPI ID not found or inactive');
      }
      return {
        success: true,
        message: 'UPI verification completed',
        statusCode: 200,
        transactionId: `tx_upi_${Date.now()}`,
        data: {
          service: 'UPI_VERIFICATION',
          vpa,
          accountHolderName: 'Mock Account Holder',
          transactionId: `tx_upi_${Date.now()}`
        }
      };
    }

    if (endpoint.includes('location-detector') || endpoint.includes('location_detector')) {
      const lat = Number(data.latitude) || 21.2514;
      const lng = Number(data.longitude) || 81.6296;
      return {
        success: true,
        message: 'Location detector completed',
        requestId: `REQ_${Date.now()}_mock`,
        timestamp: new Date().toISOString(),
        statusCode: 200,
        data: {
          transactionId: `tx_loc_${Date.now()}`,
          service: 'LOCATION_DETECTOR',
          success: true,
          status: 'SUCCESS',
          message: 'Location detected successfully',
          displayName: 'Raipur, Chhattisgarh, India',
          latitude: lat,
          longitude: lng,
          detailed: Boolean(data.detailed),
          address: {
            house: '',
            road: 'Sample Road',
            suburb: '',
            city: 'Raipur',
            state: 'Chhattisgarh',
            postcode: '492001',
            country: 'India',
            countryCode: 'in',
            county: '',
            district: 'Raipur'
          },
          osmData: {
            osmId: 1234567,
            osmType: 'relation',
            boundingBox: ['21.15', '81.55', '21.35', '81.75']
          },
          clientRefNum: `REQ_${Date.now()}_mock`
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
