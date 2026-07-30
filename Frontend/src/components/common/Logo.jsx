import React, { forwardRef, useState, useEffect } from 'react';
import brandConfig from '../../config/brandConfig';

/**
 * Centralized Logo Component
 * Usage: <Logo className="h-8 w-auto" src="/logo/TazkYLogo.jpeg" />
 * onDark — white badge behind full-color logo (use on teal/dark headers, not CSS invert)
 */
const Logo = forwardRef(({ className = 'h-8 w-auto', onDark = false, circle = false, src: propSrc, ...props }, ref) => {
  const [src, setSrc] = useState(propSrc || brandConfig.logoPath);

  useEffect(() => {
    if (propSrc) {
      setSrc(propSrc);
    }
  }, [propSrc]);

  const img = (
    <img
      fetchPriority="low"
      loading="lazy"
      ref={onDark || circle ? undefined : ref}
      src={src}
      alt={brandConfig.brandName}
      className={circle ? 'w-full h-full object-cover rounded-full' : `${className} object-contain`}
      onError={() => {
        if (src !== propSrc && propSrc) {
          setSrc(propSrc);
        } else if (src !== brandConfig.logoAltPath) {
          setSrc(brandConfig.logoAltPath);
        } else if (src !== '/logo/WBILogo.jpg') {
          setSrc('/logo/WBILogo.jpg');
        }
      }}
      {...props}
    />
  );

  if (circle) {
    return (
      <span
        ref={ref}
        className={`${className} inline-flex items-center justify-center rounded-full overflow-hidden border border-gray-200/80 shadow-sm bg-white shrink-0 aspect-square p-0.5`}
      >
        {img}
      </span>
    );
  }

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
