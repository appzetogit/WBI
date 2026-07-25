import React from 'react';
import { FiTool, FiSettings, FiCode, FiSmartphone, FiPenTool, FiSpeaker, FiServer, FiShield, FiMonitor, FiLayout, FiWifi, FiCamera } from 'react-icons/fi';

// Local generated vector icons (from grid)
import homeCleaningIcon from '../../../../assets/images/icons/services/vector/home-cleaning.png';
import acRepairIcon from '../../../../assets/images/icons/services/vector/ac-repair.png';
import plumbingIcon from '../../../../assets/images/icons/services/vector/plumbing.png';
import electricianIcon from '../../../../assets/images/icons/services/vector/electrician.png';
import salonIcon from '../../../../assets/images/icons/services/vector/salon-at-home.png';
import paintingIcon from '../../../../assets/images/icons/services/vector/painting.png';
import pestControlIcon from '../../../../assets/images/icons/services/vector/pest-control.png';
import carWashIcon from '../../../../assets/images/icons/services/vector/car-wash.png';
import applianceRepairIcon from '../../../../assets/images/icons/services/vector/appliance-repair.png';
import carpenterIcon from '../../../../assets/images/icons/services/vector/carpenter.png';
import laundryIcon from '../../../../assets/images/icons/services/vector/laundry.png';
import beautyServicesIcon from '../../../../assets/images/icons/services/vector/beauty-services.png';
import deepCleaningIcon from '../../../../assets/images/icons/services/vector/deep-cleaning.png';
import homeMaintenanceIcon from '../../../../assets/images/icons/services/vector/home-maintenance.png';
import cctvIcon from '../../../../assets/images/icons/services/vector/cctv.png';

export const ServiceIconRenderer = ({ categoryName, className = "w-[32px] h-[32px]" }) => {
  if (!categoryName) return <FiTool className={className} />;
  
  const normalized = categoryName.toLowerCase().trim();

  // Primary 14 Approved Services
  if (normalized.includes('ac')) return <img fetchPriority="low" loading="lazy" src={acRepairIcon} className={className} style={{ objectFit: 'contain' }} alt="AC Repair" />;
  if (normalized.includes('plumb')) return <img fetchPriority="low" loading="lazy" src={plumbingIcon} className={className} style={{ objectFit: 'contain' }} alt="Plumbing" />;
  if (normalized.includes('electric')) return <img fetchPriority="low" loading="lazy" src={electricianIcon} className={className} style={{ objectFit: 'contain' }} alt="Electrician" />;
  if (normalized.includes('salon')) return <img fetchPriority="low" loading="lazy" src={salonIcon} className={className} style={{ objectFit: 'contain' }} alt="Salon at Home" />;
  if (normalized.includes('paint')) return <img fetchPriority="low" loading="lazy" src={paintingIcon} className={className} style={{ objectFit: 'contain' }} alt="Painting" />;
  if (normalized.includes('pest')) return <img fetchPriority="low" loading="lazy" src={pestControlIcon} className={className} style={{ objectFit: 'contain' }} alt="Pest Control" />;
  if (normalized.includes('car wash') || normalized.includes('carwash')) return <img fetchPriority="low" loading="lazy" src={carWashIcon} className={className} style={{ objectFit: 'contain' }} alt="Car Wash" />;
  if (normalized.includes('appliance')) return <img fetchPriority="low" loading="lazy" src={applianceRepairIcon} className={className} style={{ objectFit: 'contain' }} alt="Appliance Repair" />;
  if (normalized.includes('carpent')) return <img fetchPriority="low" loading="lazy" src={carpenterIcon} className={className} style={{ objectFit: 'contain' }} alt="Carpenter" />;
  if (normalized.includes('laundry') || normalized.includes('wash')) return <img fetchPriority="low" loading="lazy" src={laundryIcon} className={className} style={{ objectFit: 'contain' }} alt="Laundry" />;
  if (normalized.includes('beauty')) return <img fetchPriority="low" loading="lazy" src={beautyServicesIcon} className={className} style={{ objectFit: 'contain' }} alt="Beauty Services" />;
  if (normalized.includes('deep clean')) return <img fetchPriority="low" loading="lazy" src={deepCleaningIcon} className={className} style={{ objectFit: 'contain' }} alt="Deep Cleaning" />;
  if (normalized.includes('maintenance')) return <img fetchPriority="low" loading="lazy" src={homeMaintenanceIcon} className={className} style={{ objectFit: 'contain' }} alt="Home Maintenance" />;
  if (normalized.includes('clean')) return <img fetchPriority="low" loading="lazy" src={homeCleaningIcon} className={className} style={{ objectFit: 'contain' }} alt="Home Cleaning" />;

  // CCTV & Surveillance Services
  if (normalized.includes('dvr') || normalized.includes('nvr')) return <FiServer className={className} />;
  if (normalized.includes('cctv') || normalized.includes('camera') || normalized.includes('surveillance')) return <FiCamera className={className} />;

  // Digital Solutions & IT Services (Using exact react-icons/fi to match CategoryDetails)
  if (normalized.includes('web')) return <FiCode className={className} />;
  if (normalized.includes('app')) return <FiSmartphone className={className} />;
  if (normalized.includes('marketing') || normalized.includes('seo')) return <FiSpeaker className={className} />;
  if (normalized.includes('design') || normalized.includes('ui/ux')) return <FiPenTool className={className} />;
  if (normalized.includes('server') || normalized.includes('cloud') || normalized.includes('hosting')) return <FiServer className={className} />;
  if (normalized.includes('security') || normalized.includes('cyber')) return <FiShield className={className} />;
  if (normalized.includes('network') || normalized.includes('wifi')) return <FiWifi className={className} />;
  if (normalized.includes('software') || normalized.includes('crm') || normalized.includes('erp')) return <FiLayout className={className} />;
  if (normalized.includes('computer') || normalized.includes('laptop') || normalized.includes('desktop')) return <FiMonitor className={className} />;

  // Default fallback
  return <FiSettings className={className} />;
};

export default ServiceIconRenderer;
