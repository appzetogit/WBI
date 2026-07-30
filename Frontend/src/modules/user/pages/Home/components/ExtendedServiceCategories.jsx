import React from 'react';
import { FiChevronRight } from 'react-icons/fi';
import ServiceIconRenderer from '../../../components/common/ServiceIconRenderer';

const ExtendedServiceCategories = ({ categories = [], isLoading = false, onCategoryClick }) => {
  const displayCategories = categories?.length > 0 ? categories : [];

  if (isLoading) {
    return <div className="h-40 bg-gray-50 animate-pulse rounded-2xl mx-4" />;
  }

  if (!displayCategories.length) {
    return null;
  }

  return (
    <section className="py-2 px-4 mb-8 relative">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-[20px] font-bold text-[#0F172A] tracking-tight">Service Categories</h2>
        <button type="button" className="text-[14px] font-semibold flex items-center gap-1 active:opacity-70 transition-opacity text-[#10AFA5]">
          See All <FiChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="flex overflow-x-auto gap-2.5 pb-2 -mx-4 px-4 scrollbar-hide snap-x">
        {Array.from({ length: Math.ceil(displayCategories.length / 2) }).map((_, colIndex) => (
          <div key={colIndex} className="flex flex-col gap-2.5 min-w-[145px] sm:min-w-[160px] snap-center flex-shrink-0">
            {displayCategories.slice(colIndex * 2, colIndex * 2 + 2).map((category, index) => (
              <div
                key={category.id || category.targetCategoryId || `${colIndex}-${index}`}
                onClick={() => {
                  if (onCategoryClick && (category.targetCategoryId || category.id)) {
                    onCategoryClick({ id: category.targetCategoryId || category.id });
                  }
                }}
                className="bg-white rounded-xl p-2.5 flex items-center gap-2.5 shadow-sm border border-gray-100 active:scale-[0.98] transition-transform cursor-pointer w-full"
              >
                <div className="w-8 h-8 rounded-full bg-[#E5F3F2] flex items-center justify-center flex-shrink-0 text-[#10AFA5]">
                  <ServiceIconRenderer categoryName={category.title} className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-bold text-[#0F172A] leading-tight pr-1 line-clamp-2">
                  {category.title}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
};

export default ExtendedServiceCategories;
