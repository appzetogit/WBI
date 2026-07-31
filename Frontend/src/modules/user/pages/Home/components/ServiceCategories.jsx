import React, { useMemo } from 'react';

const HARDCODED_CATEGORIES = [
  { id: 'ac', title: 'AC Repair', slug: 'ac-repair', icon: '/icones/Ac.jpeg' },
  { id: 'wm', title: 'Washing Machine', slug: 'washing-machine', icon: '/icones/electric.jpeg' },
  { id: 'plumb', title: 'Plumbing', slug: 'plumbing', icon: '/icones/water.jpeg' },
  { id: 'cctv', title: 'CCTV Camera', slug: 'cctv-camera', icon: '/icones/camera.jpeg' },
  { id: 'ro', title: 'RO & Purifier', slug: 'ro-purifier', icon: '/icones/null.jpeg' },
  { id: 'repair', title: 'Home Repair', slug: 'home-repair', icon: '/icones/repair.jpeg' },
  { id: 'net', title: 'Networking', slug: 'networking', icon: '/icones/wifi.jpeg' },
];

const ServiceCategories = React.memo(({ categories = [], onCategoryClick, onSeeAllClick }) => {
  const displayCategories = useMemo(() => {
    return [
      ...HARDCODED_CATEGORIES,
      { id: 'more', title: 'More Services', isMore: true }
    ];
  }, []);

  const handleItemClick = (item) => {
    if (item.isMore) {
      onSeeAllClick?.();
      return;
    }

    if (categories && categories.length > 0) {
      const keywords = item.title.toLowerCase().split(' ');
      const matched = categories.find(c => {
        const dbTitle = (c.title || c.name || '').toLowerCase();
        const dbSlug = (c.slug || '').toLowerCase();
        return keywords.some(kw => kw.length > 2 && (dbTitle.includes(kw) || dbSlug.includes(kw)));
      });

      if (matched) {
        onCategoryClick?.(matched);
        return;
      }
    }

    onCategoryClick?.(item);
  };

  return (
    <div className="px-4 mt-0 mb-4">
      <div className="bg-white rounded-[24px] shadow-[0_4px_24px_rgba(16,175,165,0.06)] border border-[#E5F3F2] p-4 grid grid-cols-4 gap-y-5 gap-x-2">
        {displayCategories.map((category, index) => {
          return (
            <div
              key={category.id || index}
              className="flex flex-col items-center justify-start cursor-pointer w-full px-1 active:scale-95 transition-transform group"
              onClick={() => handleItemClick(category)}
            >
              <div className="w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center mb-2 overflow-hidden flex-shrink-0 rounded-full shadow-[0_2px_12px_rgba(0,0,0,0.04)] border border-gray-100 bg-white transition-transform duration-300 group-hover:-translate-y-1">
                {category.isMore ? (
                  <div className="w-full h-full bg-[#F8FCFC] flex items-center justify-center">
                    <div className="grid grid-cols-2 gap-1 w-5 h-5 sm:w-6 sm:h-6">
                      <div className="rounded-full border-[2px] border-[#10AFA5] w-full h-full"></div>
                      <div className="rounded-full border-[2px] border-[#10AFA5] w-full h-full"></div>
                      <div className="rounded-full border-[2px] border-[#10AFA5] w-full h-full"></div>
                      <div className="rounded-full border-[2px] border-[#10AFA5] w-full h-full"></div>
                    </div>
                  </div>
                ) : (
                  <img
                    src={category.icon}
                    alt={category.title}
                    className="w-full h-full object-cover p-1 transition-transform duration-500 group-hover:scale-110"
                    loading="lazy"
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                )}
              </div>

              <div className="h-[32px] sm:h-[36px] flex items-start justify-center w-full">
                <span className="text-[11px] sm:text-[12px] font-bold text-center leading-[1.25] line-clamp-2 w-full break-words text-[#0F172A]">
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
