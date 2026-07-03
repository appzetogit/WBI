/**
 * Page transition animation - slide from bottom
 */
export const animatePageIn = (element, onComplete) => {
  if (!element) return;
  
  import('gsap').then(({ gsap }) => {
    gsap.fromTo(
      element,
      {
        y: '100%',
        opacity: 0,
      },
      {
        y: 0,
        opacity: 1,
        duration: 0.35,
        ease: 'power2.out',
        onComplete,
      }
    );
  });
};

/**
 * Page transition animation - slide to bottom (exit)
 */
export const animatePageOut = (element, onComplete) => {
  if (!element) return;
  
  import('gsap').then(({ gsap }) => {
    gsap.to(element, {
      y: '100%',
      opacity: 0.8,
      duration: 0.3,
      ease: 'power2.in',
      onComplete,
    });
  });
};

/**
 * Fade in animation
 */
export const fadeIn = (element, delay = 0, duration = 0.5) => {
  if (!element) return;
  
  import('gsap').then(({ gsap }) => {
    gsap.fromTo(
      element,
      { opacity: 0 },
      {
        opacity: 1,
        duration,
        delay,
        ease: 'power2.out',
      }
    );
  });
};

/**
 * Slide in from left
 */
export const slideInLeft = (element, delay = 0) => {
  if (!element) return;
  
  import('gsap').then(({ gsap }) => {
    gsap.fromTo(
      element,
      {
        x: -50,
        opacity: 0,
      },
      {
        x: 0,
        opacity: 1,
        duration: 0.6,
        delay,
        ease: 'power2.out',
      }
    );
  });
};

/**
 * Scale in animation
 */
export const scaleIn = (element, delay = 0) => {
  if (!element) return;
  
  import('gsap').then(({ gsap }) => {
    gsap.fromTo(
      element,
      {
        scale: 0.8,
        opacity: 0,
      },
      {
        scale: 1,
        opacity: 1,
        duration: 0.5,
        delay,
        ease: 'back.out(1.7)',
      }
    );
  });
};

/**
 * Stagger animation for multiple elements
 */
export const staggerFadeIn = (elements, delay = 0.1) => {
  if (!elements || elements.length === 0) return;
  
  import('gsap').then(({ gsap }) => {
    gsap.fromTo(
      elements,
      {
        y: 30,
        opacity: 0,
      },
      {
        y: 0,
        opacity: 1,
        duration: 0.5,
        stagger: delay,
        ease: 'power2.out',
      }
    );
  });
};

/**
 * Hover scale animation
 */
export const setupHoverScale = (element, scale = 1.05) => {
  if (!element) return;
  
  let hoverIn, hoverOut;
  
  import('gsap').then(({ gsap }) => {
    hoverIn = () => {
      gsap.to(element, {
        scale,
        duration: 0.3,
        ease: 'power2.out',
      });
    };
    
    hoverOut = () => {
      gsap.to(element, {
        scale: 1,
        duration: 0.3,
        ease: 'power2.out',
      });
    };
    
    element.addEventListener('mouseenter', hoverIn);
    element.addEventListener('mouseleave', hoverOut);
  });
  
  return () => {
    if (hoverIn && hoverOut) {
      element.removeEventListener('mouseenter', hoverIn);
      element.removeEventListener('mouseleave', hoverOut);
    }
  };
};

/**
 * Pulse animation
 */
export const pulse = (element, repeat = -1) => {
  if (!element) return;
  
  import('gsap').then(({ gsap }) => {
    gsap.to(element, {
      scale: 1.03,
      duration: 1.5,
      repeat,
      yoyo: true,
      ease: 'power1.inOut',
    });
  });
};

/**
 * Scroll-triggered fade in
 */
export const scrollFadeIn = (element, offset = 100) => {
  if (!element) return;
  
  Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(([{ gsap }, { ScrollTrigger }]) => {
    gsap.registerPlugin(ScrollTrigger);
    gsap.fromTo(
      element,
      {
        y: offset,
        opacity: 0,
      },
      {
        y: 0,
        opacity: 1,
        duration: 0.8,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: element,
          start: 'top 85%',
          toggleActions: 'play none none none',
        },
      }
    );
  });
};

/**
 * Ripple effect animation
 */
export const createRipple = (element, x, y) => {
  if (!element) return;
  
  const ripple = document.createElement('span');
  ripple.className = 'gsap-ripple';
  ripple.style.cssText = `
    position: absolute;
    border-radius: 50%;
    background: rgba(245, 158, 11, 0.3);
    width: 0;
    height: 0;
    left: ${x}px;
    top: ${y}px;
    transform: translate(-50%, -50%);
    pointer-events: none;
  `;
  
  element.style.position = 'relative';
  element.appendChild(ripple);
  
  import('gsap').then(({ gsap }) => {
    gsap.to(ripple, {
      width: 100,
      height: 100,
      opacity: 0,
      duration: 0.6,
      ease: 'power2.out',
      onComplete: () => {
        ripple.remove();
      },
    });
  });
};

/**
 * Modal slide up animation
 */
export const animateModalIn = (element) => {
  if (!element) return;
  
  import('gsap').then(({ gsap }) => {
    gsap.fromTo(
      element,
      {
        y: '100%',
      },
      {
        y: 0,
        duration: 0.3,
        ease: 'power2.out',
      }
    );
  });
};

/**
 * Modal slide down animation
 */
export const animateModalOut = (element, onComplete) => {
  if (!element) return;
  
  import('gsap').then(({ gsap }) => {
    gsap.to(element, {
      y: '100%',
      duration: 0.2,
      ease: 'power2.in',
      onComplete,
    });
  });
};

/**
 * Logo animation - slide in + pulse
 */
export const animateLogo = (element) => {
  if (!element) return;
  
  import('gsap').then(({ gsap }) => {
    const tl = gsap.timeline();
    
    tl.fromTo(
      element,
      {
        x: -20,
        opacity: 0,
      },
      {
        x: 0,
        opacity: 1,
        duration: 0.6,
        ease: 'power2.out',
      }
    ).to(element, {
      scale: 1.03,
      duration: 1.5,
      repeat: -1,
      yoyo: true,
      ease: 'power1.inOut',
    });
  });
};

/**
 * Cleanup function for ScrollTrigger
 */
export const cleanupScrollTriggers = () => {
  import('gsap/ScrollTrigger').then(({ ScrollTrigger }) => {
    ScrollTrigger.getAll().forEach(trigger => trigger.kill());
  });
};

