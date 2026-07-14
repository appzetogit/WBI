import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiCreditCard, FiShield, FiCheckCircle } from 'react-icons/fi';
import vendorWalletService from '../../../../services/vendorWalletService';
import { toast } from 'react-hot-toast';

const SettlementRequest = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [wallet, setWallet] = useState({ amountDue: 0 });
  const [amount, setAmount] = useState('');
  
  // Razorpay Key should typically come from env or an API, but we'll use env for frontend
  const razorpayKeyId = import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_YourTestKeyHere'; 

  useEffect(() => {
    loadWallet();
    loadRazorpayScript();
  }, []);

  const loadRazorpayScript = () => {
    if (!document.getElementById('razorpay-checkout-js')) {
      const script = document.createElement('script');
      script.id = 'razorpay-checkout-js';
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      document.body.appendChild(script);
    }
  };

  const loadWallet = async () => {
    try {
      setLoading(true);
      const res = await vendorWalletService.getWallet();
      if (res.success) {
        setWallet(res.data);
        setAmount(res.data.amountDue.toString());
      }
    } catch (error) {
      toast.error('Failed to load wallet details');
    } finally {
      setLoading(false);
    }
  };

  const handlePayNow = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (parseFloat(amount) > wallet.amountDue) {
      toast.error(`Amount cannot exceed ₹${wallet.amountDue}`);
      return;
    }

    if (!window.Razorpay) {
      toast.error('Payment gateway is loading. Please try again in a few seconds.');
      return;
    }

    try {
      setProcessing(true);
      const toastId = toast.loading('Initializing secure payment...');

      // 1. Create Order on Backend
      const orderRes = await vendorWalletService.createSettlementOrder(parseFloat(amount));
      
      if (!orderRes.success) {
        throw new Error(orderRes.message || 'Failed to create payment order');
      }

      toast.dismiss(toastId);

      // 2. Open Razorpay Checkout
      const options = {
        key: razorpayKeyId,
        amount: orderRes.data.amount,
        currency: orderRes.data.currency,
        name: 'WBI Digital Solutions',
        description: 'Wallet Dues Settlement',
        image: '/wbi-logo.png', // Replace with your actual logo path
        order_id: orderRes.data.orderId,
        handler: async function (response) {
          // 3. Verify Payment on Backend
          try {
            const verifyToast = toast.loading('Verifying payment...');
            const verifyRes = await vendorWalletService.verifySettlementPayment({
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
              amount: parseFloat(amount)
            });

            toast.dismiss(verifyToast);

            if (verifyRes.success) {
              toast.success(
                <div className="flex flex-col">
                  <span className="font-bold">Payment Successful!</span>
                  <span className="text-sm">Your dues have been cleared.</span>
                </div>, 
                { duration: 5000 }
              );
              navigate('/vendor/wallet', { replace: true });
            } else {
              throw new Error(verifyRes.message || 'Payment verification failed');
            }
          } catch (error) {
            console.error('Verification error:', error);
            toast.error(error.message || 'Payment verification failed. Please contact support if amount was deducted.');
          }
        },
        prefill: {
          name: wallet.vendor?.businessName || wallet.vendor?.name || 'Vendor',
          contact: '' // You can pass vendor phone here if available in context
        },
        theme: {
          color: '#0F766E' // Teal color matching the premium theme
        },
        modal: {
          ondismiss: function() {
            setProcessing(false);
          }
        }
      };

      const rzp = new window.Razorpay(options);
      
      rzp.on('payment.failed', function (response) {
        setProcessing(false);
        toast.error(`Payment failed: ${response.error.description}`);
      });

      rzp.open();

    } catch (error) {
      console.error('Payment initialization error:', error);
      toast.dismiss();
      toast.error(error.message || 'Failed to initialize payment');
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-t-teal-600 rounded-full animate-spin border-gray-200"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-3xl mx-auto font-sans">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <button 
            onClick={() => navigate('/vendor/wallet')}
            className="flex items-center text-gray-500 hover:text-gray-900 transition-colors mb-2"
          >
            <FiArrowLeft className="mr-2" /> Back to Wallet
          </button>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Settle Dues</h1>
          <p className="text-gray-500 mt-1">Pay your outstanding balance securely online.</p>
        </div>
      </div>

      {/* Main Card */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        
        {/* Banner */}
        <div className="bg-gradient-to-r from-rose-600 to-rose-800 p-8 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10 transform translate-x-1/4 -translate-y-1/4">
            <FiCreditCard className="w-48 h-48" />
          </div>
          <div className="relative z-10">
            <p className="text-rose-100 font-medium mb-1 uppercase tracking-wider text-sm">Total Amount Due</p>
            <div className="text-5xl font-black tracking-tight">
              ₹{wallet.amountDue?.toLocaleString() || 0}
            </div>
          </div>
        </div>

        {/* Form Body */}
        <div className="p-8 space-y-6">
          
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Amount to Pay
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <span className="text-gray-500 text-lg font-bold">₹</span>
              </div>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full pl-10 pr-4 py-4 bg-gray-50 rounded-2xl border-2 border-gray-100 focus:border-teal-500 focus:ring-0 focus:outline-none transition-colors text-lg font-bold text-gray-900"
                placeholder="0.00"
                max={wallet.amountDue}
                disabled={processing || wallet.amountDue <= 0}
              />
            </div>
            {wallet.amountDue > 0 && (
              <p className="text-sm text-gray-500 mt-2 flex items-center gap-1">
                <FiCheckCircle className="text-teal-600" /> You can pay partially or in full.
              </p>
            )}
          </div>

          <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100 flex items-start gap-4">
            <div className="bg-white p-3 rounded-xl shadow-sm">
              <FiShield className="w-6 h-6 text-teal-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">100% Secure Payment</h3>
              <p className="text-sm text-gray-500 mt-1">
                Your payment is processed securely via Razorpay. Supported methods include UPI, Credit/Debit Cards, and Netbanking.
              </p>
            </div>
          </div>

          <button
            onClick={handlePayNow}
            disabled={processing || !amount || parseFloat(amount) <= 0 || wallet.amountDue <= 0}
            className="w-full py-4 rounded-2xl font-bold text-white text-lg flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
            style={{
              background: 'linear-gradient(135deg, #0F766E 0%, #0D9488 100%)',
              boxShadow: '0 10px 25px -5px rgba(15, 118, 110, 0.4)'
            }}
          >
            {processing ? (
              <>
                <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                Processing...
              </>
            ) : (
              <>
                Pay Now via Razorpay
              </>
            )}
          </button>

        </div>
      </div>
      
    </div>
  );
};

export default SettlementRequest;
