import React from 'react';
import { FiBriefcase, FiMapPin, FiChevronRight } from 'react-icons/fi';

const getDisplay = (request) => {
  const pay = request.payment?.status;
  if (pay === 'pending' || pay === 'failed') {
    return { label: 'Payment Pending', pillBg: 'bg-[#FDF3E6]', pillText: 'text-[#E57A00]' };
  }
  switch (request.status) {
    case 'Assigned':
      return { label: 'Vendor Assigned', pillBg: 'bg-[#E5F7F5]', pillText: 'text-[#10AFA5]' };
    case 'In Progress':
      return { label: 'In Progress', pillBg: 'bg-[#E5F7F5]', pillText: 'text-[#10AFA5]' };
    case 'Completed':
      return { label: 'Completed', pillBg: 'bg-emerald-50', pillText: 'text-emerald-600' };
    case 'Cancelled':
      return {
        label: request.payment?.escrowStatus === 'refunded' ? 'Refunded' : 'Cancelled',
        pillBg: 'bg-red-50',
        pillText: 'text-red-500'
      };
    default:
      return { label: 'Finding Vendor', pillBg: 'bg-[#FDF3E6]', pillText: 'text-[#E57A00]' };
  }
};

const ServiceRequestCard = ({ request, onClick }) => {
  const display = getDisplay(request);
  const amount = Number(request.payment?.amount) || 0;
  const created = request.createdAt
    ? new Date(request.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-[20px] p-4 border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.03)] active:scale-[0.98] transition-transform cursor-pointer flex items-center gap-3"
    >
      <div className="w-12 h-12 rounded-2xl bg-[#E5F7F5] text-[#10AFA5] flex items-center justify-center shrink-0">
        <FiBriefcase className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <h3 className="text-[14px] font-extrabold text-slate-800 leading-[1.2] line-clamp-1">
            {request.subCategoryName}
          </h3>
          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full whitespace-nowrap ${display.pillBg} ${display.pillText}`}>
            {display.label}
          </span>
        </div>
        <p className="text-[11px] font-medium text-slate-500 truncate">
          {request.requestCode}
          {created ? ` · ${created}` : ''}
        </p>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[11px] text-slate-500 flex items-center gap-1 truncate">
            {request.city ? (
              <>
                <FiMapPin className="w-3 h-3 shrink-0" />
                {request.city}
              </>
            ) : (
              request.categoryName
            )}
          </span>
          {amount > 0 && (
            <span className="text-[13px] font-extrabold text-[#10AFA5]">₹{amount.toLocaleString('en-IN')}</span>
          )}
        </div>
      </div>
      <FiChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
    </div>
  );
};

export default ServiceRequestCard;
