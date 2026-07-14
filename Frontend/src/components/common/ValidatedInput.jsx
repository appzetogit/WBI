import React, { useState, useEffect } from 'react';
import { FiCheckCircle, FiEye, FiEyeOff, FiAlertCircle } from 'react-icons/fi';
import { checkPasswordStrength } from '../../utils/validationUtils';

const ValidatedInput = ({ 
  label, 
  name, 
  type = 'text', 
  value, 
  onChange, 
  placeholder,
  validator,
  required = true,
  disabled = false,
  className = ''
}) => {
  const [isTouched, setIsTouched] = useState(false);
  const [error, setError] = useState('');
  const [isValid, setIsValid] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [strength, setStrength] = useState({ score: 0, label: 'None', color: 'bg-gray-200' });

  // Run validation when value changes
  useEffect(() => {
    if (required && !value) {
      setIsValid(false);
      setError(''); // Don't show error immediately on empty unless touched
      if (type === 'password') setStrength({ score: 0, label: 'None', color: 'bg-gray-200' });
      return;
    }

    if (value && validator) {
      const result = validator(value);
      setIsValid(result.isValid);
      if (!result.isValid && isTouched) {
        setError(result.message);
      } else {
        setError('');
      }
    } else if (value) {
      setIsValid(true);
      setError('');
    }

    if (type === 'password' && value) {
      setStrength(checkPasswordStrength(value));
    }
  }, [value, validator, isTouched, required, type]);

  const handleBlur = () => {
    setIsTouched(true);
    if (required && !value) {
      setError(`${label || name} is required`);
      setIsValid(false);
    } else if (value && validator) {
      const result = validator(value);
      if (!result.isValid) {
        setError(result.message);
      }
    }
  };

  const handleChange = (e) => {
    onChange(e);
  };

  const inputType = type === 'password' ? (showPassword ? 'text' : 'password') : type;

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label className="block text-sm font-bold text-gray-700 mb-1.5">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      
      <div className="relative">
        <input
          name={name}
          type={inputType}
          value={value || ''}
          onChange={handleChange}
          onBlur={handleBlur}
          disabled={disabled}
          placeholder={placeholder}
          className={`w-full bg-gray-50 border ${
            error ? 'border-red-500 focus:ring-red-500/20' : 
            isValid ? 'border-green-500 focus:ring-green-500/20' : 
            'border-gray-200 focus:ring-[#4F46E5]/20'
          } rounded-xl py-3 px-4 focus:outline-none focus:ring-2 transition-all ${
            type === 'password' ? 'pr-12' : (isValid || error) ? 'pr-10' : ''
          }`}
        />
        
        {/* Right side icons */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center space-x-2">
          {error && <FiAlertCircle className="text-red-500 w-5 h-5" />}
          {isValid && !error && <FiCheckCircle className="text-green-500 w-5 h-5" />}
          
          {type === 'password' && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-gray-400 hover:text-gray-600 focus:outline-none ml-1"
            >
              {showPassword ? <FiEyeOff className="w-5 h-5" /> : <FiEye className="w-5 h-5" />}
            </button>
          )}
        </div>
      </div>
      
      {/* Error Message */}
      {error && (
        <p className="text-red-500 text-xs mt-1.5 font-medium animate-fadeIn">
          {error}
        </p>
      )}

      {/* Password Strength Meter */}
      {type === 'password' && value && (
        <div className="mt-2 animate-fadeIn">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-gray-500 font-medium">Password Strength</span>
            <span className={`text-xs font-bold ${
              strength.label === 'Weak' ? 'text-red-500' :
              strength.label === 'Medium' ? 'text-yellow-500' : 'text-green-500'
            }`}>{strength.label}</span>
          </div>
          <div className="flex gap-1 h-1.5">
            <div className={`flex-1 rounded-full transition-all duration-300 ${strength.score >= 1 ? strength.color : 'bg-gray-200'}`} />
            <div className={`flex-1 rounded-full transition-all duration-300 ${strength.score >= 2 ? strength.color : 'bg-gray-200'}`} />
            <div className={`flex-1 rounded-full transition-all duration-300 ${strength.score >= 4 ? strength.color : 'bg-gray-200'}`} />
          </div>
        </div>
      )}
    </div>
  );
};

export default ValidatedInput;
