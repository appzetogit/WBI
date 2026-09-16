import React from 'react';

export default function FormField({
  label,
  name,
  type = 'text',
  value = '',
  onChange,
  placeholder = '',
  error = '',
  helperText = '',
  required = false,
  disabled = false,
  options = [],
  rows = 3,
  icon: Icon,
  className = '',
  action = null
}) {
  const inputBaseStyle = `w-full px-3.5 py-2.5 rounded-xl border text-sm transition-all outline-none font-medium ${
    error
      ? 'border-red-400 bg-red-50/20 text-gray-900 focus:border-red-500 focus:ring-2 focus:ring-red-200'
      : 'border-gray-200 bg-white text-gray-800 placeholder-gray-400 focus:border-[#10AFA5] focus:ring-2 focus:ring-[#10AFA5]/20 hover:border-gray-300'
  } ${disabled ? 'bg-gray-100 text-gray-500 cursor-not-allowed border-gray-200' : ''}`;

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between">
        <label htmlFor={name} className="block text-xs font-semibold text-gray-700 tracking-wide">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        {action && <div>{action}</div>}
      </div>

      <div className="relative">
        {Icon && (
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
            <Icon className="w-4 h-4" />
          </div>
        )}

        {type === 'select' ? (
          <select
            id={name}
            name={name}
            value={value ?? ''}
            onChange={onChange}
            disabled={disabled}
            className={`${inputBaseStyle} ${Icon ? 'pl-10' : ''} cursor-pointer`}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((opt) => (
              <option key={opt.value ?? opt} value={opt.value ?? opt}>
                {opt.label ?? opt}
              </option>
            ))}
          </select>
        ) : type === 'textarea' ? (
          <textarea
            id={name}
            name={name}
            rows={rows}
            value={value ?? ''}
            onChange={onChange}
            disabled={disabled}
            placeholder={placeholder}
            className={`${inputBaseStyle} resize-none`}
          />
        ) : (
          <input
            id={name}
            name={name}
            type={type}
            value={value ?? ''}
            onChange={onChange}
            disabled={disabled}
            placeholder={placeholder}
            className={`${inputBaseStyle} ${Icon ? 'pl-10' : ''}`}
          />
        )}
      </div>

      {error ? (
        <p className="text-xs text-red-500 font-medium flex items-center gap-1">
          <span>⚠️</span> {error}
        </p>
      ) : helperText ? (
        <p className="text-[11px] text-gray-400">{helperText}</p>
      ) : null}
    </div>
  );
}
