export const validators = {
  mobile: (value) => {
    if (!value) return { isValid: false, message: 'Mobile number is required' };
    const num = value.replace(/\D/g, '');
    if (num.length !== 10) return { isValid: false, message: 'Must be exactly 10 digits' };
    if (!/^[6-9]/.test(num)) return { isValid: false, message: 'Must start with 6, 7, 8, or 9' };
    if (/^(\d)\1{9}$/.test(num)) return { isValid: false, message: 'Invalid repeated numbers' };
    return { isValid: true, value: num };
  },
  
  email: (value) => {
    if (!value) return { isValid: false, message: 'Email is required' };
    const email = value.toLowerCase().trim();
    // Strict RFC 5322 regex
    const emailRegex = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    if (!emailRegex.test(email)) return { isValid: false, message: 'Please enter a valid email address' };
    
    const [, domain] = email.split('@');
    if (['test.com', 'example.com'].includes(domain)) return { isValid: false, message: 'This email provider is not allowed' };
    
    return { isValid: true, value: email };
  },
  
  name: (value) => {
    if (!value) return { isValid: false, message: 'Name is required' };
    let name = value.replace(/\s+/g, ' ').trim();
    if (name.length < 2) return { isValid: false, message: 'Name must be at least 2 characters' };
    if (name.length > 50) return { isValid: false, message: 'Name must be less than 50 characters' };
    if (/\d/.test(name)) return { isValid: false, message: 'Numbers are not allowed in name' };
    // Basic emoji block regex
    if (/(?:[\u2700-\u27bf]|(?:\ud83c[\udde6-\uddff]){2}|[\ud800-\udbff][\udc00-\udfff]|[\u0023-\u0039]\ufe0f?\u20e3|\u3299|\u3297|\u303d|\u3030|\u24c2|\ud83c[\udd70-\udd71]|\ud83c[\udd7e-\udd7f]|\ud83c\udd8e|\ud83c[\udd91-\udd9a]|\ud83c[\udde6-\uddff]|\ud83c[\ude01-\ude02]|\ud83c\ude1a|\ud83c\ude2f|\ud83c[\ude32-\ude3a]|\ud83c[\ude50-\ude51]|\u203c|\u2049|[\u25aa-\u25ab]|\u25b6|\u25c0|[\u25fb-\u25fe]|\u00a9|\u00ae|\u2122|\u2139|\ud83c\udc04|[\u2600-\u26FF]|\u2b05|\u2b06|\u2b07|\u2b1b|\u2b1c|\u2b50|\u2b55|\u231a|\u231b|\u2328|\u23cf|[\u23e9-\u23f3]|[\u23f8-\u23fa]|\ud83c\udccf|\u2934|\u2935|[\u2190-\u21ff])/.test(name)) {
      return { isValid: false, message: 'Emojis are not allowed' };
    }
    return { isValid: true, value: name };
  },

  password: (value) => {
    if (!value) return { isValid: false, message: 'Password is required' };
    if (value.length < 8) return { isValid: false, message: 'Minimum 8 characters' };
    if (value.length > 16) return { isValid: false, message: 'Maximum 16 characters' };
    if (!/[A-Z]/.test(value)) return { isValid: false, message: 'Must contain an uppercase letter' };
    if (!/[a-z]/.test(value)) return { isValid: false, message: 'Must contain a lowercase letter' };
    if (!/[0-9]/.test(value)) return { isValid: false, message: 'Must contain a number' };
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(value)) return { isValid: false, message: 'Must contain a special character' };
    return { isValid: true, value };
  },
  
  aadhaar: (value) => {
    if (!value) return { isValid: false, message: 'Aadhaar is required' };
    const num = value.replace(/\D/g, '');
    if (num.length !== 12) return { isValid: false, message: 'Must be exactly 12 digits' };
    if (/^0|^1/.test(num)) return { isValid: false, message: 'Invalid Aadhaar format' };
    return { isValid: true, value: num };
  },

  pan: (value) => {
    if (!value) return { isValid: false, message: 'PAN is required' };
    const pan = value.toUpperCase().trim();
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan)) return { isValid: false, message: 'Invalid PAN format (e.g. ABCDE1234F)' };
    return { isValid: true, value: pan };
  },
  
  otp: (value) => {
    if (!value) return { isValid: false, message: 'OTP is required' };
    const num = value.replace(/\D/g, '');
    if (num.length !== 6) return { isValid: false, message: 'OTP must be 6 digits' };
    return { isValid: true, value: num };
  }
};

export const checkPasswordStrength = (password) => {
  if (!password) return { score: 0, label: 'None', color: 'bg-gray-200' };
  let score = 0;
  if (password.length > 7) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  if (password.length > 12) score += 1;

  if (score < 2) return { score, label: 'Weak', color: 'bg-red-500' };
  if (score < 4) return { score, label: 'Medium', color: 'bg-yellow-500' };
  return { score, label: 'Strong', color: 'bg-green-500' };
};
