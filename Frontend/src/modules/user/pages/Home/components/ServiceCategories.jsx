import React, { useMemo } from 'react';
import ServiceIconRenderer from '../../../components/common/ServiceIconRenderer';
import {
  FiMonitor, FiShield, FiBriefcase, FiZap, FiHeart, FiSettings, FiCpu, FiAlertCircle,
  FiCloudSnow, FiBox, FiDroplet, FiClock, FiWind, FiThermometer, FiTool, FiGrid
} from 'react-icons/fi';

const iconMap = {
  FiMonitor, FiShield, FiBriefcase, FiZap, FiHeart, FiSettings, FiCpu, FiAlertCircle,
  FiCloudSnow, FiBox, FiDroplet, FiClock, FiWind, FiThermometer, FiTool, FiGrid
};

const GRID_SLOTS = 7;

const ServiceCategories = React.memo(({ categories = [], onCategoryClick, onSeeAllClick }) => {
  const displayCategories = useMemo(() => {
    const fromAdmin = (categories || [])
      .filter((c) => c && !c.isMore)
      .slice(0, GRID_SLOTS)
      .map((c, index) => ({
        id: c.id || c._id || c.slug || `cat-${index}`,
        title: c.title || c.name || c.categoryName || 'Service',
        slug: c.slug || c.id || c._id,
        icon: c.icon || c.image || c.iconUrl || '',
        isService: true,
        ...c
      }));

    if (!fromAdmin.length) {
      return [{ id: 'more', title: 'More Services', isMore: true }];
    }

    return [...fromAdmin, { id: 'more', title: 'More Services', isMore: true }];
  }, [categories]);

  return (
    <div className="px-4 mt-0 mb-4">
      <div className="bg-white rounded-[24px] shadow-[0_4px_24px_rgba(16,175,165,0.06)] border border-[#E5F3F2] p-4 grid grid-cols-4 gap-y-5 gap-x-2">
        {displayCategories.map((category, index) => {
          return (
            <div
              key={category.id || index}
              className="flex flex-col items-center justify-start cursor-pointer w-full px-1 active:scale-95 transition-transform"
              onClick={() => {
                if (category.isMore) {
                  onSeeAllClick?.();
                } else {
                  onCategoryClick?.(category);
                }
              }}
            >
              <div className="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center mb-2 overflow-hidden flex-shrink-0 transition-transform duration-300 group-hover:-translate-y-1">
                {category.isMore ? (
                  <div className="w-full h-full bg-[#F8FCFC] rounded-full flex items-center justify-center shadow-[0_2px_8px_rgba(16,175,165,0.06)] border border-[#E5F3F2]">
                    <div className="grid grid-cols-2 gap-0.5 w-5 h-5">
                      <div className="rounded-full border-[1.5px] border-[#10AFA5] w-full h-full"></div>
                      <div className="rounded-full border-[1.5px] border-[#10AFA5] w-full h-full"></div>
                      <div className="rounded-full border-[1.5px] border-[#10AFA5] w-full h-full"></div>
                      <div className="rounded-full border-[1.5px] border-[#10AFA5] w-full h-full"></div>
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[#10AFA5] rounded-full overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04)] border border-gray-100 bg-white">
                    {category.icon && iconMap[category.icon] ? (
                      React.createElement(iconMap[category.icon], { className: 'w-5 h-5 sm:w-6 sm:h-6' })
                    ) : category.icon && (category.icon.startsWith('http') || category.icon.startsWith('/') || category.icon.includes('.')) ? (
                      <img src={category.icon} className="w-full h-full object-cover transition-transform duration-500 hover:scale-110" alt={category.title} />
                    ) : (
                      <ServiceIconRenderer categoryName={category.title} className="w-full h-full object-cover" />
                    )}
                  </div>
                )}
              </div>

              <div className="h-[32px] sm:h-[36px] flex items-start justify-center w-full">
                <span className="text-[10px] sm:text-[11px] font-bold text-center leading-[1.2] line-clamp-2 w-full break-words text-[#0F172A]">
                  {category.title}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

ServiceCategories.displayName = 'ServiceCategories';

export default ServiceCategories;
