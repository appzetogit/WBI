export const loadRazorpay = () => {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    // Check if script is already injected
    if (document.getElementById('razorpay-script')) {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts += 1;
        if (window.Razorpay) {
          clearInterval(interval);
          resolve(true);
        } else if (attempts > 50) {
          clearInterval(interval);
          reject(new Error('Razorpay SDK load timeout'));
        }
      }, 100);
      return;
    }

    const script = document.createElement('script');
    script.id = 'razorpay-script';
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => {
      resolve(true);
    };
    script.onerror = () => {
      script.remove();
      reject(new Error('Razorpay SDK failed to load'));
    };
    document.body.appendChild(script);
  });
};
