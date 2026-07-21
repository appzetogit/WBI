import React, { useState, useEffect } from 'react';
import { FiCheckCircle } from 'react-icons/fi';

import { toast } from 'react-hot-toast';

const DynamicForm = ({ config, initialData = null, onSubmit, onCancel, submitLabel = 'Submit' }) => {
  const [formData, setFormData] = useState(() => initialData || {});

  // Only reset when schema identity changes — NOT on every render (default {} was wiping inputs)
  const schemaKey = config?.subCatCode || config?.stepTitle || config?.fields?.length || 'form';
  useEffect(() => {
    setFormData(initialData && typeof initialData === 'object' ? { ...initialData } : {});
  }, [schemaKey]);

  if (!config || !config.fields || config.fields.length === 0) {
    return <div className="text-gray-500 text-center py-4">No form configuration available.</div>;
  }

  const fieldKey = (field) => field.key || field.fieldKey || field.fieldName || field.name;
  const isRequired = (field) => field.required ?? field.isRequired;
  const fieldOptions = (field) =>
    (field.options || []).map((opt) =>
      typeof opt === 'string' ? { value: opt, label: opt } : opt
    );

  const handleChange = (e, field) => {
    const key = fieldKey(field);
    if (field.type === 'file') {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setFormData((prev) => ({ ...prev, [key]: reader.result }));
        };
        reader.readAsDataURL(file);
      }
      return;
    }
    const value = e.target.value;
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleCheckboxChange = (e, field, optionValue) => {
    const key = fieldKey(field);
    setFormData((prev) => {
      const currentValues = prev[key] || [];
      const newValues = e.target.checked
        ? [...currentValues, optionValue]
        : currentValues.filter((v) => v !== optionValue);
      return { ...prev, [key]: newValues };
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    for (const field of config.fields) {
      if (field.visible === false) continue;

      const key = fieldKey(field);
      const val = formData[key];

      if (isRequired(field)) {
        if (field.type === 'multiselect' || field.type === 'checkbox') {
          if (!val || val.length === 0) {
            toast.error(`Please select at least one option for ${field.label}`);
            return;
          }
        } else {
          if (val === undefined || val === null || val.toString().trim() === '') {
            toast.error(`Please fill out ${field.label}`);
            return;
          }
        }
      }

      if (field.type === 'number' && val !== undefined && val !== null && String(val).trim() !== '') {
        const n = Number(val);
        if (Number.isNaN(n)) {
          toast.error(`${field.label} must be a number`);
          return;
        }
        const min = field.validation?.min;
        const max = field.validation?.max;
        if (min != null && n < min) {
          toast.error(`${field.label} must be ≥ ${min}`);
          return;
        }
        if (max != null && n > max) {
          toast.error(`${field.label} must be ≤ ${max}`);
          return;
        }
      }
    }

    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {config.stepTitle && (
        <h3 className="text-xl font-bold text-gray-800 mb-4">{config.stepTitle}</h3>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {config.fields.map((field) => {
          if (field.visible === false) return null;
          const key = fieldKey(field);
          const opts = fieldOptions(field);

          return (
            <div key={key} className={['textarea', 'multiselect', 'checkbox'].includes(field.type) ? 'col-span-full' : ''}>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                {field.label} {isRequired(field) && <span className="text-red-500">*</span>}
              </label>

              {['text', 'email', 'phone', 'number'].includes(field.type) && (
                <input
                  type={field.type === 'phone' ? 'tel' : field.type}
                  value={formData[key] || ''}
                  onChange={(e) => handleChange(e, field)}
                  disabled={field.editable === false}
                  placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
                  min={field.type === 'number' && field.validation?.min != null ? field.validation.min : undefined}
                  max={field.type === 'number' && field.validation?.max != null ? field.validation.max : undefined}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                />
              )}

              {(field.type === 'date' || field.type === 'time') && (
                <input
                  type={field.type}
                  value={formData[key] || ''}
                  onChange={(e) => handleChange(e, field)}
                  disabled={field.editable === false}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                />
              )}

              {field.type === 'textarea' && (
                <textarea
                  value={formData[key] || ''}
                  onChange={(e) => handleChange(e, field)}
                  disabled={field.editable === false}
                  placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
                  rows={4}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm resize-y"
                />
              )}

              {(field.type === 'dropdown' || field.type === 'select') && (
                <select
                  value={formData[key] || ''}
                  onChange={(e) => handleChange(e, field)}
                  disabled={field.editable === false}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm appearance-none"
                >
                  <option value="">Select {field.label}</option>
                  {opts.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              )}

              {field.type === 'radio' && (
                <div className="flex flex-wrap gap-3">
                  {opts.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name={key}
                        checked={formData[key] === opt.value}
                        onChange={() => setFormData((prev) => ({ ...prev, [key]: opt.value }))}
                        disabled={field.editable === false}
                        className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">{opt.label}</span>
                    </label>
                  ))}
                </div>
              )}

              {(field.type === 'multiselect' || field.type === 'checkbox') && (
                <div className="flex flex-wrap gap-3">
                  {opts.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(formData[key] || []).includes(opt.value)}
                        onChange={(e) => handleCheckboxChange(e, field, opt.value)}
                        disabled={field.editable === false}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">{opt.label}</span>
                    </label>
                  ))}
                </div>
              )}

              {field.type === 'file' && (
                <div>
                  <input
                    type="file"
                    onChange={(e) => handleChange(e, field)}
                    disabled={field.editable === false}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition-all"
                  />
                  {formData[key] && String(formData[key]).startsWith('data:image') && (
                    <img fetchPriority="low" loading="lazy" src={formData[key]} alt="Preview" className="mt-2 h-20 rounded-lg object-cover" />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex gap-4 pt-6 border-t border-gray-100">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-all text-sm text-center"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          className="flex-[2] py-3 px-4 text-white rounded-xl font-bold hover:opacity-90 active:scale-[0.98] transition-all flex justify-center items-center gap-2 text-sm"
          style={{ backgroundColor: '#00a6a6' }}
        >
          {submitLabel} <FiCheckCircle className="text-lg" />
        </button>
      </div>
    </form>
  );
};

export default DynamicForm;
