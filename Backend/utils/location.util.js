/**
 * Location / reverse-geocode utilities for CGPE location-detector.
 */

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isValidCoordinates(latitude, longitude) {
  const lat = toNumber(latitude);
  const lng = toNumber(longitude);
  if (lat == null || lng == null) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function mapProviderLocationResponse(providerPayload, latInput, lngInput) {
  const root = providerPayload?.data || providerPayload?.result || providerPayload || {};
  const addr = root.address || root.addressDetails || {};
  const osm = root.osmData || root.osm || {};

  const latitude = toNumber(root.latitude ?? latInput);
  const longitude = toNumber(root.longitude ?? lngInput);

  return {
    displayName:
      root.displayName ||
      root.display_name ||
      root.formattedAddress ||
      [addr.city, addr.state, addr.country].filter(Boolean).join(', ') ||
      null,
    latitude,
    longitude,
    detailed: Boolean(root.detailed),
    address: {
      house: addr.house || addr.house_number || '',
      road: addr.road || addr.street || '',
      suburb: addr.suburb || addr.neighbourhood || '',
      city: addr.city || addr.town || addr.village || '',
      district: addr.district || addr.county || '',
      state: addr.state || '',
      pincode: addr.postcode || addr.pincode || addr.pin || '',
      country: addr.country || '',
      countryCode: addr.countryCode || addr.country_code || '',
      county: addr.county || ''
    },
    osmData: {
      osmId: osm.osmId || osm.osm_id || null,
      osmType: osm.osmType || osm.osm_type || null,
      boundingBox: osm.boundingBox || osm.bounding_box || null
    },
    transactionId:
      root.transactionId ||
      providerPayload?.transactionId ||
      root.requestId ||
      null,
    requestId:
      root.clientRefNum ||
      root.requestId ||
      providerPayload?.requestId ||
      null,
    providerTimestamp: providerPayload?.timestamp || root.timestamp || null,
    provider: 'cgpe'
  };
}

function fullAddressLine(profile) {
  if (!profile) return null;
  if (profile.displayName) return profile.displayName;
  const a = profile.address || {};
  return [a.house, a.road, a.suburb, a.city, a.district, a.state, a.pincode, a.country]
    .filter(Boolean)
    .join(', ');
}

module.exports = {
  toNumber,
  isValidCoordinates,
  mapProviderLocationResponse,
  fullAddressLine
};
