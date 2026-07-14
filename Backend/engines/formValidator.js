/**
 * WBI Project OS — Form Validator Engine
 * 
 * Validates ProjectFormSubmission data against FormTemplate field definitions.
 * Run server-side — never trust frontend validation.
 */

const FormTemplate = require('../models/projectOS/FormTemplate');

/**
 * Validate a form submission payload against a published FormTemplate
 * @param {string} formTemplateId
 * @param {Object} values  — { fieldId: value }
 * @param {string[]} attachmentFieldIds — fieldIds where files were uploaded
 * @param {string} role — the submitter's role (for role-restricted fields)
 * @returns {Promise<{ valid: boolean, errors: string[] }>}
 */
async function validateFormSubmission(formTemplateId, values, attachmentFieldIds = [], role) {
  const template = await FormTemplate.findById(formTemplateId).lean();
  if (!template) return { valid: false, errors: ['Form template not found'] };
  if (template.status !== 'PUBLISHED') return { valid: false, errors: ['Form template is not published'] };

  const errors = [];
  const valueMap = values || {};
  const attachmentSet = new Set(attachmentFieldIds);

  for (const field of template.fields) {
    const { fieldId, label, fieldType, required, options, validation, visibleToRoles } = field;

    // ── Role visibility check ────────────────────────────────────────────────
    if (visibleToRoles && visibleToRoles.length > 0 && role) {
      if (!visibleToRoles.includes(role)) continue; // skip hidden fields
    }

    const rawValue = valueMap[fieldId];
    const isEmpty = rawValue === undefined || rawValue === null || rawValue === '';

    // ── Required check ────────────────────────────────────────────────────────
    const isFileField = ['FILE', 'IMAGE', 'VIDEO', 'SIGNATURE'].includes(fieldType);
    if (required) {
      if (isFileField) {
        if (!attachmentSet.has(fieldId)) {
          errors.push(`"${label}" is required`);
          continue;
        }
      } else if (isEmpty) {
        errors.push(`"${label}" is required`);
        continue;
      }
    }

    if (isEmpty) continue; // no further validation if optional and empty

    // ── Type-specific validation ───────────────────────────────────────────────
    switch (fieldType) {
      case 'NUMBER':
      case 'DECIMAL': {
        const num = parseFloat(rawValue);
        if (isNaN(num)) { errors.push(`"${label}" must be a number`); break; }
        if (validation?.min !== undefined && num < validation.min) errors.push(`"${label}" must be at least ${validation.min}`);
        if (validation?.max !== undefined && num > validation.max) errors.push(`"${label}" must be at most ${validation.max}`);
        break;
      }
      case 'TEXT':
      case 'TEXTAREA':
      case 'URL':
      case 'SERIAL_NUMBER': {
        const str = String(rawValue);
        if (validation?.minLength && str.length < validation.minLength) errors.push(`"${label}" must be at least ${validation.minLength} characters`);
        if (validation?.maxLength && str.length > validation.maxLength) errors.push(`"${label}" must be at most ${validation.maxLength} characters`);
        if (validation?.pattern) {
          const regex = new RegExp(validation.pattern);
          if (!regex.test(str)) errors.push(`"${label}" has an invalid format`);
        }
        if (fieldType === 'URL') {
          try { new URL(rawValue); } catch { errors.push(`"${label}" must be a valid URL`); }
        }
        break;
      }
      case 'SELECT':
      case 'RADIO': {
        if (options && options.length > 0 && !options.includes(rawValue)) {
          errors.push(`"${label}" has an invalid selection: "${rawValue}"`);
        }
        break;
      }
      case 'MULTISELECT':
      case 'CHECKBOX': {
        if (!Array.isArray(rawValue)) { errors.push(`"${label}" must be an array`); break; }
        if (options && options.length > 0) {
          const invalid = rawValue.filter(v => !options.includes(v));
          if (invalid.length > 0) errors.push(`"${label}" contains invalid options: ${invalid.join(', ')}`);
        }
        break;
      }
      case 'DATE':
      case 'DATETIME': {
        const d = new Date(rawValue);
        if (isNaN(d.getTime())) errors.push(`"${label}" must be a valid date`);
        break;
      }
      case 'LOCATION': {
        if (!rawValue?.lat || !rawValue?.lng) errors.push(`"${label}" must include valid lat/lng`);
        break;
      }
      case 'REPEATABLE_GROUP': {
        if (!Array.isArray(rawValue)) errors.push(`"${label}" must be an array`);
        break;
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateFormSubmission };
