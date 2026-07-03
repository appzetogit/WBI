import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiPhone, FiMessageSquare } from 'react-icons/fi';
import { FaWhatsapp } from 'react-icons/fa';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';
import supportAgentImg from '../../../../../assets/images/support_agent.webp';

const HelpAndSubscribe = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubscribe = (e) => {
    e.preventDefault();
    if (!email) {
      toast.error('Please enter your email address');
      return;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error('Please enter a valid email address');
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      toast.success('Thank you for subscribing! Keep an eye on your inbox.');
      setEmail('');
    }, 1200);
  };

  return (
    <div className="w-full space-y-5 px-4 md:px-6 pb-8 max-w-screen-xl mx-auto font-sans">
      
      {/* 1. Need Help Card */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="bg-gradient-to-r from-[#EBF9F8] to-[#F4FDFD] border border-[#CCFBF1] rounded-2xl p-5 md:p-6 lg:pl-44 flex flex-col lg:flex-row items-center justify-between gap-5 relative overflow-hidden shadow-sm min-h-[120px] lg:h-[135px]"
      >
        {/* Support Agent Mascot - Absolutely positioned on desktop to overflow/align to bottom edge */}
        <div className="relative lg:absolute lg:bottom-0 lg:left-6 w-24 h-24 lg:w-[130px] lg:h-[130px] flex-shrink-0 flex items-end">
          <img 
            src={supportAgentImg} 
            alt="Support Agent" 
            className="w-full h-auto max-h-full object-contain object-bottom select-none pointer-events-none"
            loading="lazy"
          />
          {/* Online green dot */}
          <span className="absolute bottom-1 right-2 flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-white"></span>
          </span>
        </div>

        {/* Text Content */}
        <div className="text-center lg:text-left flex-1 min-w-[200px]">
          <h3 className="text-xl sm:text-2xl font-extrabold text-[#0F172A] tracking-tight">
            Need Help?
          </h3>
          <p className="text-xs sm:text-sm text-[#475569] font-semibold mt-1">
            Our support team is ready to assist you.
          </p>
        </div>

        {/* Contact CTA Boxes - Horizontal Row */}
        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto flex-shrink-0 max-w-xl">
          
          {/* Call Us */}
          <a 
            href="tel:18001239284"
            className="bg-white hover:bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-center gap-3 flex-1 sm:flex-initial cursor-pointer transition-all duration-200 hover:shadow-sm active:scale-95 group/btn"
          >
            <div className="w-9 h-9 rounded-full bg-[#EBF9F8] flex items-center justify-center text-[#10AFA5] flex-shrink-0 transition-transform duration-200 group-hover/btn:scale-105">
              <FiPhone className="w-4.5 h-4.5" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none">Call Us</span>
              <span className="text-[13px] font-extrabold text-[#10AFA5] mt-1 whitespace-nowrap leading-none">1800-123-9284</span>
            </div>
          </a>

          {/* WhatsApp */}
          <a 
            href="https://wa.me/9118001239284"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white hover:bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-center gap-3 flex-1 sm:flex-initial cursor-pointer transition-all duration-200 hover:shadow-sm active:scale-95 group/btn"
          >
            <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center text-[#25D366] flex-shrink-0 transition-transform duration-200 group-hover/btn:scale-105">
              <FaWhatsapp className="w-4.5 h-4.5" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none">WhatsApp</span>
              <span className="text-[13px] font-extrabold text-[#10AFA5] mt-1 whitespace-nowrap leading-none">Chat Now</span>
            </div>
          </a>

          {/* Live Chat */}
          <button 
            onClick={() => navigate('/user/help-support')}
            className="bg-white hover:bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-center gap-3 flex-1 sm:flex-initial cursor-pointer transition-all duration-200 hover:shadow-sm active:scale-95 group/btn"
          >
            <div className="w-9 h-9 rounded-full bg-[#EBF9F8] flex items-center justify-center text-[#10AFA5] flex-shrink-0 transition-transform duration-200 group-hover/btn:scale-105">
              <FiMessageSquare className="w-4.5 h-4.5" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none">Live Chat</span>
              <span className="text-[13px] font-extrabold text-[#10AFA5] mt-1 whitespace-nowrap leading-none">Available 24x7</span>
            </div>
          </button>

        </div>
      </motion.div>

      {/* 2. Stay Updated Card */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="bg-gradient-to-r from-[#F4F9F9] to-[#FAFCFC] border border-[#E5F3F2] rounded-2xl p-5 md:p-6 lg:pr-64 flex flex-col lg:flex-row items-center justify-between gap-5 relative overflow-hidden shadow-sm min-h-[120px] lg:h-[135px]"
      >
        <div className="flex items-center gap-4 flex-col sm:flex-row text-center sm:text-left w-full lg:w-auto">
          
          {/* Envelope with soft circular background */}
          <div className="w-14 h-14 sm:w-16 sm:h-16 flex-shrink-0 flex items-center justify-center relative bg-[#E6F5F4] rounded-full shadow-inner p-2.5 transition-transform duration-300 hover:rotate-6">
            <svg viewBox="0 0 100 100" className="w-full h-full filter drop-shadow-[0_2px_4px_rgba(16,175,165,0.15)]">
              <path d="M5,25 L95,25 L95,75 L5,75 Z" fill="url(#envelopeBackGrad2)" rx="8" />
              <rect x="22" y="14" width="56" height="32" rx="3" fill="#FFFFFF" />
              <line x1="30" y1="22" x2="70" y2="22" stroke="#CCFBF1" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="30" y1="29" x2="58" y2="29" stroke="#CCFBF1" strokeWidth="2.5" strokeLinecap="round" />
              <polygon points="5,25 50,50 95,25" fill="url(#envelopeFlapGrad2)" />
              <path d="M5,25 L45,53 C48,55 52,55 55,53 L95,25 L95,75 L5,75 Z" fill="url(#envelopeFoldsGrad2)" />
              
              <defs>
                <linearGradient id="envelopeBackGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#0D9488" />
                  <stop offset="100%" stopColor="#14B8A6" />
                </linearGradient>
                <linearGradient id="envelopeFlapGrad2" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#2DD4BF" />
                  <stop offset="100%" stopColor="#0D9488" />
                </linearGradient>
                <linearGradient id="envelopeFoldsGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#14B8A6" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#0F766E" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          {/* Texts & Input form stacked or inline */}
          <div className="flex-grow max-w-lg">
            <h3 className="text-xl sm:text-2xl font-extrabold text-[#0F172A] tracking-tight">
              Stay Updated
            </h3>
            <p className="text-xs sm:text-sm text-[#475569] font-semibold mt-0.5">
              Subscribe to get service tips, offers & updates.
            </p>
            
            {/* Input Form - horizontal layout */}
            <form onSubmit={handleSubscribe} className="mt-3 flex flex-col sm:flex-row gap-2 max-w-md w-full">
              <input 
                type="email" 
                placeholder="Enter your email address" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-grow bg-white border border-slate-200 focus:border-[#10AFA5] focus:ring-2 focus:ring-[#10AFA5]/15 rounded-lg px-3.5 py-2 text-xs font-semibold text-slate-800 placeholder-slate-400 outline-none transition-all"
              />
              <button 
                type="submit" 
                disabled={isSubmitting}
                className="bg-[#10AFA5] hover:bg-[#0D9488] active:scale-[0.98] transition-all duration-150 text-white font-extrabold text-xs px-5 py-2.5 rounded-lg shadow-sm shadow-[#10AFA5]/20 flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap min-w-[100px]"
              >
                {isSubmitting ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  'Subscribe'
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Right side: High-fidelity CSS Smartphone Mockup and Notification Bubble */}
        <div className="hidden lg:block absolute bottom-0 right-6 w-[230px] h-[120px] select-none pointer-events-none">
          {/* Phone Body standing up but cut off by card bottom */}
          <div className="absolute bottom-[-105px] left-8 w-[125px] h-[210px] bg-slate-900 rounded-[22px] border-[3px] border-slate-800 shadow-2xl p-1 overflow-hidden">
            {/* Screen background */}
            <div className="absolute inset-0 bg-gradient-to-tr from-teal-950/90 to-emerald-950/90" />
            
            {/* Notch */}
            <div className="absolute top-1 left-1/2 -translate-x-1/2 w-9 h-2.5 bg-black rounded-full z-20" />
            
            {/* Simple wallpaper elements */}
            <div className="absolute top-6 left-2 w-8 h-8 bg-teal-500/10 rounded-full blur-md" />
            <div className="absolute bottom-12 right-2 w-12 h-12 bg-emerald-500/10 rounded-full blur-lg" />
            
            {/* Phone bottom bar */}
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-10 h-0.5 bg-white/30 rounded-full z-20" />
          </div>

          {/* Floating Push Notification Bubble - styled exact to screenshot */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, x: 20 }}
            whileInView={{ opacity: 1, scale: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="absolute top-2.5 right-0 bg-white/95 backdrop-blur-sm rounded-xl p-3 shadow-md border border-slate-100 w-[195px] z-30"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-1 mb-1">
              <div className="flex items-center gap-1.5">
                <div className="w-3.5 h-3.5 rounded-full bg-[#10AFA5] flex items-center justify-center text-[5.5px] text-white font-extrabold">
                  W
                </div>
                <span className="text-[7.5px] font-black text-slate-800">WBI Services</span>
              </div>
              <span className="text-[6.5px] font-semibold text-slate-400">now</span>
            </div>
            <p className="text-[8px] font-extrabold text-slate-800 leading-tight">
              Get 20% off on AC Repair this summer!
            </p>
          </motion.div>
        </div>

      </motion.div>

    </div>
  );
};

export default HelpAndSubscribe;
