import React from 'react';
import { motion } from 'framer-motion';
import { FiCheck, FiChevronRight } from 'react-icons/fi';
import { themeColors } from '../../../../../theme';

const CarePlanBanner = ({ data }) => {
  // Use data from backend if available, otherwise fallback to UI reference defaults
  const isActive = data?.isActive !== false; // Default to true if undefined
  
  if (!isActive) return null;

  const title = data?.title || 'Peace of mind';
  const highlightedText = data?.highlightedText || 'with WBI Care Plan';
  const subtitle = data?.subtitle || 'Get annual maintenance & priority support at exclusive prices.';
  const badgeText = data?.badgeText || 'WBI Care Plan';
  const buttonText = data?.buttonText || 'Explore Care Plans';
  const discountText = data?.discountText || 'UP TO 20% SAVINGS*';
  
  const benefits = data?.items?.length > 0 ? data.items.filter(i => i.isActive).map(i => i.title) : [
    'Priority Booking',
    'Free Check-ups',
    'Exclusive Discounts',
    '24x7 Support'
  ];

  // If no image is provided from backend, we will use a fallback or placeholder.
  const imageUrl = data?.imageUrl || '/rider-3D.png'; 

  // Dynamically parse discount text (e.g. "UP TO 20% SAVINGS*" or "GET 15% OFF")
  const parseDiscountText = (text) => {
    if (!text) return { prefix: 'UP TO', value: '20%', suffix: 'SAVINGS*' };
    
    // Extract numbers like "20%" or "15%" or numbers with space
    const match = text.match(/(\d+%\s*|\d+\s*%|\d+)/i);
    if (match) {
      const value = match[0].trim();
      const index = text.indexOf(value);
      const prefix = text.substring(0, index).trim() || 'UP TO';
      const suffix = text.substring(index + value.length).trim() || 'SAVINGS*';
      return { prefix, value, suffix };
    }
    
    // Split fallback
    const parts = text.split(/\s+/);
    if (parts.length >= 3) {
      return {
        prefix: parts[0] + (parts.length > 3 ? ' ' + parts[1] : ''),
        value: parts[parts.length - 2],
        suffix: parts[parts.length - 1]
      };
    }
    return { prefix: 'UP TO', value: text, suffix: '' };
  };

  const { prefix, value, suffix } = parseDiscountText(discountText);
  
  return (
    <section className="px-4 mb-6 relative z-10 max-w-7xl mx-auto">
      <div className="relative bg-gradient-to-r from-[#F4FAF8] to-[#EAF6F4] rounded-[24px] md:rounded-[32px] p-5 md:p-8 lg:p-10 overflow-hidden flex flex-row items-center justify-between border border-[#E5F3F2] shadow-sm min-h-[190px] sm:min-h-[220px] md:min-h-[280px] lg:min-h-[320px] w-full">
        
        {/* Left Content Area */}
        <div className="relative z-10 w-[58%] sm:w-[60%] md:w-[50%] lg:w-[48%] flex flex-col justify-center">
          {/* Pill Badge */}
          <div className="inline-flex items-center gap-1.5 bg-white px-2.5 py-1 md:px-3 md:py-1.5 rounded-full border border-slate-100 shadow-sm mb-2.5 md:mb-4 w-fit">
            <div className="w-4 h-4 md:w-5 md:h-5 bg-[#10AFA5] rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-white text-[9px] md:text-[10px] font-bold">W</span>
            </div>
            <span className="text-[10px] md:text-[12px] font-bold text-[#0F172A] uppercase tracking-wide">{badgeText}</span>
          </div>

          {/* Heading */}
          <h2 className="text-[18px] sm:text-[22px] md:text-[28px] lg:text-[36px] font-black leading-[1.15] text-[#0F172A] mb-1.5 md:mb-3">
            {title} <span className="text-[#10AFA5]">{highlightedText}</span>
          </h2>

          {/* Subtitle */}
          <p className="text-[#475569] text-[11px] sm:text-[12px] md:text-[13px] lg:text-[15px] font-medium leading-relaxed mb-2.5 md:mb-5 max-w-[260px] sm:max-w-[280px] md:max-w-[340px]">
            {subtitle}
          </p>

          {/* Benefits Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-3 md:gap-y-3 md:gap-x-4 mb-3.5 md:mb-5 max-w-full sm:max-w-[320px] md:max-w-[380px]">
            {benefits.map((benefit, index) => (
              <div key={index} className="flex items-center gap-1.5 md:gap-2.5">
                <div className="w-4 h-4 md:w-[18px] md:h-[18px] rounded-full border border-[#10AFA5] flex items-center justify-center flex-shrink-0 bg-white shadow-sm">
                  <FiCheck className="w-2.5 h-2.5 md:w-2.5 md:h-2.5 text-[#10AFA5]" strokeWidth={4} />
                </div>
                <span className="text-[11px] sm:text-[12px] md:text-[12.5px] lg:text-[14px] font-semibold text-[#334155] sm:truncate">{benefit}</span>
              </div>
            ))}
          </div>

          {/* CTA Button */}
          <motion.button 
            whileTap={{ scale: 0.96 }}
            whileHover={{ scale: 1.02 }}
            onClick={() => {
               if(data?.buttonRedirect) {
                 window.location.href = data.buttonRedirect;
               } else {
                 console.log('Navigate to Care Plans');
               }
            }}
            className="bg-[#10AFA5] text-white px-4 py-2 md:px-5 md:py-2.5 rounded-xl font-bold text-[11px] sm:text-[12px] md:text-[13px] lg:text-[14px] flex items-center gap-2 active:scale-95 transition-transform shadow-md shadow-[#10AFA5]/20 hover:bg-[#0D948C] w-fit"
          >
            {buttonText}
            <div className="w-[18px] h-[18px] md:w-[22px] md:h-[22px] rounded-full border border-white flex items-center justify-center flex-shrink-0">
              <FiChevronRight className="w-3 h-3 md:w-3.5 md:h-3.5 text-white" strokeWidth={3} />
            </div>
          </motion.button>
        </div>

        {/* Right Illustration */}
        <div className="absolute right-[18%] sm:right-[22%] bottom-0 h-[82%] sm:h-[90%] md:h-[95%] lg:h-[105%] max-w-[35%] sm:max-w-[40%] flex items-end justify-center pointer-events-none z-0">
          <motion.img 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            src={imageUrl} 
            alt="WBI Care Plan" 
            className="h-full object-contain object-bottom drop-shadow-md select-none"
            onError={(e) => {
              // If local /rider-3D.png fails to load on dev server, try fallback to public location
              if (e.target.src.indexOf('Technicians.png') === -1) {
                e.target.src = '/img/Technicians.png';
              } else {
                e.target.style.opacity = '0';
              }
            }}
          />
        </div>
        
        {/* Discount Badge */}
        <motion.div 
          whileHover={{ scale: 1.05 }}
          transition={{ type: 'spring', stiffness: 300 }}
          className="absolute right-4 sm:right-6 md:right-8 lg:right-12 top-1/2 -translate-y-1/2 z-10 flex flex-col items-center justify-center pointer-events-auto cursor-pointer flex-shrink-0"
        >
          <div className="bg-gradient-to-br from-[#1cd2c6] to-[#10AFA5] w-[56px] h-[66px] sm:w-[70px] sm:h-[82px] md:w-[90px] md:h-[105px] lg:w-[105px] lg:h-[125px] rounded-t-full rounded-b-[18px] md:rounded-b-[24px] shadow-lg border-[2px] md:border-[3px] border-white/80 backdrop-blur flex flex-col items-center justify-center text-white text-center p-1 md:p-2 relative overflow-hidden">
             <span className="text-[6.5px] sm:text-[8px] md:text-[11px] font-bold uppercase tracking-wider mb-0.5 opacity-90">{prefix}</span>
             <span className="text-[17px] sm:text-[22px] md:text-[32px] lg:text-[36px] font-black leading-none mb-0.5 drop-shadow-sm">{value}</span>
             <span className="text-[6px] sm:text-[7.5px] md:text-[9.5px] lg:text-[10.5px] font-bold uppercase tracking-wide whitespace-nowrap">{suffix}</span>
          </div>
          <span className="text-[6.5px] sm:text-[7.5px] md:text-[9.5px] font-bold text-[#64748B] mt-1">*T&C Apply</span>
        </motion.div>

      </div>
    </section>
  );
};

export default CarePlanBanner;
