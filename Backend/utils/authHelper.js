const Admin = require('../models/Admin');
const Vendor = require('../models/Vendor');
const Worker = require('../models/Worker');
const Engineer = require('../models/Engineer');
const User = require('../models/User');

const COLLECTIONS = [
  { role: 'admin', model: Admin, redirect: '/admin/dashboard' },
  { role: 'vendor', model: Vendor, redirect: '/vendor' },
  { role: 'engineer', model: Engineer, redirect: '/engineer/dashboard' },
  { role: 'worker', model: Worker, redirect: '/worker/dashboard' },
  { role: 'user', model: User, redirect: '/user' }
];

/** Normalize Indian mobile numbers to comparable digit forms */
const buildPhoneQueries = (identifierString) => {
  const digits = String(identifierString).replace(/\D/g, '');
  if (!digits) return null;

  const last10 = digits.slice(-10);
  const variants = new Set([digits, last10]);
  if (last10.length === 10) {
    variants.add(`91${last10}`);
    variants.add(`+91${last10}`);
  }

  return {
    $or: [
      { phone: { $in: [...variants] } },
      { mobile: { $in: [...variants] } }
    ]
  };
};

/**
 * Searches across Admin, Vendor, Engineer, Worker, and User collections
 * to find a user by their phone or email.
 *
 * @param {string} identifier - Email address or phone number
 * @param {string} preferredRole - (Optional) The role to check first
 * @returns {Promise<Object|null>} - Returns { user, role, redirect, model } if found, null otherwise
 */
const findUserAcrossCollections = async (identifier, preferredRole = null) => {
  if (!identifier) return null;
  const identifierString = String(identifier).trim();
  const isEmail = identifierString.includes('@');

  let collectionsToSearch = [...COLLECTIONS];
  if (preferredRole) {
    // Engineer/Worker share one Flutter field app — prefer the selected role,
    // then immediately try the sibling field role before vendor/user/admin.
    const fieldPair =
      preferredRole === 'engineer'
        ? ['engineer', 'worker']
        : preferredRole === 'worker'
          ? ['worker', 'engineer']
          : [preferredRole];

    const preferredItems = fieldPair
      .map((role) => COLLECTIONS.find((c) => c.role === role))
      .filter(Boolean);
    const preferredRoles = new Set(preferredItems.map((c) => c.role));
    collectionsToSearch = [
      ...preferredItems,
      ...COLLECTIONS.filter((c) => !preferredRoles.has(c.role))
    ];
  }

  for (const item of collectionsToSearch) {
    let query;
    if (isEmail) {
      const escaped = identifierString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query = { email: { $regex: new RegExp(`^${escaped}$`, 'i') } };
    } else {
      if (item.role === 'admin') continue;
      query = buildPhoneQueries(identifierString);
      if (!query) continue;
    }

    const user = await item.model.findOne(query).select('+password');
    if (user) {
      let resolvedRole = item.role;
      let resolvedRedirect = item.redirect;

      if (item.role === 'user' && user.role === 'admin') {
        resolvedRole = 'admin';
        resolvedRedirect = '/admin/dashboard';
      }

      return {
        user,
        role: resolvedRole,
        redirect: resolvedRedirect,
        model: item.model
      };
    }
  }
  return null;
};

module.exports = {
  findUserAcrossCollections,
  COLLECTIONS,
  buildPhoneQueries
};
