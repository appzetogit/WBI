import React, { forwardRef, useState } from 'react';
import brandConfig from '../../config/brandConfig';

/**
 * Centralized Logo Component
 * Usage: <Logo className="h-8 w-auto" />
 * onDark — white badge behind full-color logo (use on teal/dark headers, not CSS invert)
 */
const Logo = forwardRef(({ className = 'h-8 w-auto', onDark = false, ...props }, ref) => {
  const [src, setSrc] = useState(brandConfig.logoPath);

  const img = (
    <img
      fetchPriority="low"
      loading="lazy"
      ref={onDark ? undefined : ref}
      src={src}
      alt={brandConfig.brandName}
      className={`${className} object-contain`}
      onError={() => {
        if (src !== brandConfig.logoAltPath) {
          setSrc(brandConfig.logoAltPath);
        } else if (src !== '/logo/WBILogo.jpg') {
          setSrc('/logo/WBILogo.jpg');
        }
      }}
      {...props}
    />
  );

  if (onDark) {
    return (
      <span
        ref={ref}
        className="inline-flex items-center justify-center bg-white rounded-xl p-2 shadow-md ring-1 ring-white/30 shrink-0"
      >
        {img}
      </span>
    );
  }

  return img;
});

Logo.displayName = 'Logo';

export default Logo;
