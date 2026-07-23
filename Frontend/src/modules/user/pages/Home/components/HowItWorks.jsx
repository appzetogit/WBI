import React from 'react';
import { themeColors } from '../../../../../theme';
import * as Icons from 'react-icons/fi';

// Dynamic Icon Component
const DynamicFiIcon = ({ name, className, style }) => {
  const IconComponent = Icons[name];
  if (!IconComponent) return <Icons.FiSearch className={className} style={style} />;
  return <IconComponent className={className} style={style} />;
};

const HowItWorks = ({ steps = [], isLoading = false, data = null }) => {
  const brandColor = themeColors?.brand?.teal || '#23b0a7';

  if (isLoading) {
    return <div className="h-40 bg-gray-50 animate-pulse rounded-2xl mx-4" />;
  }

  // Use dynamic data if provided
  const activeSection = data && data.isActive;
  if (data && !activeSection) return null;

  const sectionTitle = data?.title || 'How It Works';
  const displaySteps = data?.items?.length > 0 
    ? data.items.filter(s => s.isActive).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)) 
    : steps;

  if (!displaySteps || displaySteps.length === 0) return null;

  return (
    <section className="pt-1 pb-4 px-4 mb-2 relative overflow-hidden">
      {/* Section Title matching Real service experiences */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-black">
          {sectionTitle}
        </h2>
      </div>

      <div className="relative mt-2">
        {/* Dotted connecting line background */}
        <div 
          className="absolute top-[24px] left-[15%] right-[15%] h-[1px] z-0" 
          style={{
            backgroundImage: `linear-gradient(to right, ${brandColor} 40%, transparent 0%)`,
            backgroundPosition: 'bottom',
            backgroundSize: '8px 1px',
            backgroundRepeat: 'repeat-x',
            opacity: 0.2
          }}
        />

        {/* Scrollable Container */}
        <div className="flex overflow-x-auto gap-4 pb-4 -mx-4 px-4 lg:mx-0 lg:px-0 scrollbar-hide snap-x relative z-10">
          {displaySteps.map((step, index) => {
            return (
              <div 
                key={step._id || index} 
                className="min-w-[110px] w-[110px] flex-shrink-0 flex flex-col items-center text-center snap-center relative group"
              >
                {/* Icon Circle */}
                <div 
                  className="w-12 h-12 rounded-full border bg-white flex items-center justify-center relative shadow-[0_2px_8px_rgba(35,176,167,0.06)] transition-all duration-300 group-hover:shadow-[0_4px_16px_rgba(35,176,167,0.12)] group-hover:-translate-y-1"
                  style={{ borderColor: `${brandColor}20` }} 
                >
                  {step.iconUrl ? (
                    <img 
                      fetchPriority="low" 
                      loading="lazy" 
                      src={step.iconUrl} 
                      alt={step.title} 
                      className="w-5 h-5 object-contain animate-fadeIn transition-transform duration-300 group-hover:scale-110" 
                    />
                  ) : (
                    <DynamicFiIcon 
                      name={step.iconName || 'FiSearch'} 
                      className="w-5 h-5 transition-transform duration-300 group-hover:scale-110" 
                      style={{ color: brandColor }} 
                    />
                  )}
                  
                  {/* Number Badge */}
                  <div 
                    className="absolute -bottom-[6px] text-white w-[18px] h-[18px] rounded-full flex items-center justify-center text-[8px] font-black border-2 border-white shadow-sm transition-transform duration-300 group-hover:scale-110"
                    style={{ backgroundColor: brandColor }}
                  >
                    {step.stepNumber || (index + 1)}
                  </div>
                </div>

                {/* Step Subtitle */}
                <span 
                  className="text-[9.5px] font-black uppercase tracking-wider mt-4"
                  style={{ color: brandColor }}
                >
                  Step {step.stepNumber || (index + 1)}
                </span>

                {/* Text Content */}
                <h3 className="text-[#0F172A] font-black text-[12px] leading-tight mt-1 mb-1 max-w-[110px] truncate-2-lines">
                  {step.title}
                </h3>
                <p className="text-[#64748B] text-[10.5px] leading-snug font-medium max-w-[115px]">
                  {step.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
