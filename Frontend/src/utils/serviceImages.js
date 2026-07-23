export const getServiceImage = (serviceName = '', serviceCategory = '') => {
  const searchString = `${serviceName} ${serviceCategory}`.toLowerCase();

  // High quality local image mapping for home services (One Time Services)
  if (searchString.includes('ac ') || searchString.includes('air condition') || searchString.includes('a/c')) 
    return '/assets/icones/AC.jpeg';
  
  if (searchString.includes('washing machine') || searchString.includes('washer')) 
    return '/assets/icones/WashingMachine.jpeg';
  
  if (searchString.includes('ro ') || searchString.includes('purifier') || searchString.includes('water filter') || searchString.includes('geyser') || searchString.includes('heater')) 
    return '/assets/icones/waterPr.jpeg';
  
  if (searchString.includes('cctv') || searchString.includes('camera') || searchString.includes('security')) 
    return '/assets/icones/cameraCCTV.jpeg';

  if (searchString.includes('plumb') || searchString.includes('pipe') || searchString.includes('water')) 
    return '/assets/icones/plumber.jpeg';

  if (searchString.includes('wifi') || searchString.includes('internet') || searchString.includes('router') || searchString.includes('network')) 
    return '/assets/icones/WIFI.jpeg';

  if (searchString.includes('repair') || searchString.includes('fix') || searchString.includes('service')) 
    return '/assets/icones/Repair.jpeg';

  // Fallback to the other provided image or Unsplash if none match
  if (searchString.includes('clean') || searchString.includes('maid') || searchString.includes('paint') || searchString.includes('wall') || searchString.includes('electric'))
    return '/assets/icones/WhatsApp Image 2026-07-22 at 1.11.42 PM (1).jpeg';

  // Default image for generic services
  return '/assets/icones/Repair.jpeg';
};

export const getFallbackImage = () => {
  // Reliable robust fallback
  return '/assets/icones/Repair.jpeg';
};

