import React, { useState, useEffect, useLayoutEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FiArrowLeft, FiClock, FiChevronRight } from 'react-icons/fi';
import { cmsService } from '../../../../services/cmsService';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { motion } from 'framer-motion';

const DEFAULT_LEGAL_TEXTS = {
  'terms-services': `
    <p>These terms and conditions ("Terms") govern the use of services made available on or through our platform and/or mobile application (collectively, the "Platform", and together with the services made available on or through the Platform, the "Services"). These Terms also include our privacy policy, available on the website and the app ("Privacy Policy"), and any guidelines, additional, or supplemental terms, policies, and disclaimers made available or issued by us from time to time ("Additional Terms"). Privacy Policy and Additional Terms form an integral part of these Terms.</p>
    <p>These Terms form a legally binding agreement between WBI Enterprise Services Private Limited and you, a user of the Platform. By accessing or using the Platform, you represent that you have read, understood, and agreed to be bound by these Terms.</p>
    <h2>1. Account Registration & User Security</h2>
    <p>To access most features of the Platform, you must register for an account using a valid mobile number and OTP verification. You agree to maintain accurate, complete, and updated profile information at all times.</p>
    <h2>2. Booking & Cancellation Policy</h2>
    <p>All service requests submitted via the Platform are matched with qualified service partners. You may cancel or reschedule bookings in accordance with our cancellation guidelines before the assigned professional starts their journey.</p>
    <h2>3. Payment Terms & Billing</h2>
    <p>Prices for services are clearly displayed prior to final checkout. Payment can be made online via integrated gateways or via cash on delivery where enabled.</p>
  `,
  'about-us': `
    <p>Welcome to <strong>WBI Platform</strong>! We are dedicated to providing world-class doorstep services, maintenance, and technical solutions with unmatched convenience, safety, and reliability.</p>
    <p>Founded with the vision of bridging skilled service partners with households and enterprise businesses, our platform streamlines service discovery, transparent pricing, and instant real-time dispatch.</p>
    <h2>Our Core Values</h2>
    <p>Our commitment rests on three core pillars: Trust, Speed, and Quality. Every technician and service partner on our network undergoes rigorous background checks and technical evaluations before onboarding.</p>
    <h2>Why Thousands Trust Us</h2>
    <ul>
      <li><strong>Verified Experts:</strong> Certified professionals dedicated to excellence.</li>
      <li><strong>Transparent Pricing:</strong> Upfront rates with clear billing breakups.</li>
      <li><strong>24/7 Customer Support:</strong> Responsive help and escalation channels.</li>
    </ul>
  `,
  'privacy-policy': `
    <p>We value your privacy and are committed to safeguarding your personal information. This Privacy Policy details how we collect, store, process, and protect your data when you use our website or mobile application.</p>
    <h2>1. Information We Collect</h2>
    <p>We collect information you provide directly, such as your full name, contact number, delivery address, and transaction logs necessary to fulfill your requested services.</p>
    <h2>2. Usage of Collected Data</h2>
    <p>Your information is strictly used to process service bookings, communicate OTPs and delivery updates, and continuously improve platform performance and security.</p>
    <h2>3. Data Protection & Encryption</h2>
    <p>We deploy standard TLS encryption, secure database access controls, and strict internal compliance standards to prevent unauthorized access or disclosure of user data.</p>
  `
};

const CmsPage = ({ slug, defaultTitle, targetPanel = 'user' }) => {
  const navigate = useNavigate();
  const [pageData, setPageData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  useEffect(() => {
    let isMounted = true;
    const fetchContent = async () => {
      setIsLoading(true);
      try {
        const response = await cmsService.getCmsContent(slug, targetPanel);
        if (isMounted) {
          if (response && response.success && response.data) {
            setPageData(response.data);
          } else {
            setPageData({
              title: defaultTitle,
              subtitle: '',
              content: '',
              isConfigured: false
            });
          }
        }
      } catch (err) {
        if (isMounted) {
          console.error(`Failed to load CMS content for ${slug} (${targetPanel}):`, err);
          setPageData({
            title: defaultTitle,
            subtitle: '',
            content: '',
            isConfigured: false
          });
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchContent();

    return () => {
      isMounted = false;
    };
  }, [slug, defaultTitle, targetPanel]);

  const title = pageData?.title || defaultTitle;
  const content = pageData?.content && pageData.content.trim().length > 0
    ? pageData.content
    : DEFAULT_LEGAL_TEXTS[slug] || '';
  const updatedAt = pageData?.updatedAt;

  const formatDate = (dateStr) => {
    if (!dateStr) return 'March 25, 2026';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return 'March 25, 2026';
    }
  };

  return (
    <div className="min-h-screen bg-white pb-24 text-[#1E242B] font-sans antialiased">
      {/* 1. Top Bar Navigation */}
      <header className="bg-white sticky top-0 z-40 border-b border-gray-100 shadow-sm">
        <div className="px-4 py-3.5 flex items-center justify-between relative max-w-lg mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="p-1 -ml-1 text-gray-800 hover:bg-gray-100 rounded-full transition-colors active:scale-95 z-10"
            aria-label="Go Back"
          >
            <FiArrowLeft className="w-6 h-6" />
          </button>
          
          <h1 className="absolute inset-0 flex items-center justify-center text-lg font-bold text-[#0F172A] tracking-tight pointer-events-none">
            {title}
          </h1>
          <div className="w-6" /> {/* Spacer */}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-lg mx-auto">
        {/* 2. Sub-Header Brand Row */}
        <div className="px-5 py-4 border-b border-gray-100 bg-white">
          <div className="flex items-center gap-2">
            <img
              src="/logo/WBILogo.jpg"
              alt="WBI Logo"
              className="h-9 w-auto object-contain rounded-lg shadow-sm"
              onError={(e) => {
                e.target.onerror = null;
                e.target.style.display = 'none';
              }}
            />
            <span className="text-xl font-black tracking-tight text-[#00a6a6] font-poppins">
              WBI
            </span>
          </div>
        </div>

        {/* 3. Breadcrumbs */}
        <div className="px-5 pt-5 pb-2 flex items-center gap-1.5 text-xs text-gray-500 font-medium">
          <Link to="/user/home" className="hover:text-[#00a6a6] transition-colors">
            Home
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-gray-700 font-semibold">{title}</span>
        </div>

        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <LoadingSpinner />
            <p className="text-xs text-gray-400 font-medium">Loading document...</p>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            {/* 4. Banner Hero Title Section */}
            <div className="px-5 py-7 bg-gradient-to-r from-[#EBF7F5] via-[#F4FCFB] to-[#FAFEFD] border-y border-teal-50/60 my-2">
              <h2 className="text-3xl font-extrabold text-[#0F172A] tracking-tight mb-2 font-poppins">
                {title}
              </h2>
              <p className="text-xs text-gray-500 font-medium">
                Last updated: {formatDate(updatedAt)}
              </p>
            </div>

            {/* 5. Document Content Body */}
            <div className="px-5 py-6">
              <div
                className="cms-document-content text-[#2D3748] text-[14.5px] leading-[1.75] space-y-5"
                dangerouslySetInnerHTML={{ __html: content }}
              />
            </div>
          </motion.div>
        )}
      </main>

      {/* Styled CSS for rich legal document content */}
      <style>{`
        .cms-document-content h1 {
          font-size: 1.6rem;
          font-weight: 800;
          color: #0F172A;
          margin-top: 1.5rem;
          margin-bottom: 0.75rem;
          line-height: 1.3;
        }
        .cms-document-content h2 {
          font-size: 1.25rem;
          font-weight: 700;
          color: #0F172A;
          margin-top: 1.5rem;
          margin-bottom: 0.6rem;
          line-height: 1.4;
        }
        .cms-document-content h3 {
          font-size: 1.1rem;
          font-weight: 600;
          color: #1E293B;
          margin-top: 1.25rem;
          margin-bottom: 0.5rem;
        }
        .cms-document-content p {
          margin-bottom: 1.1rem;
          line-height: 1.75;
          color: #334155;
        }
        .cms-document-content ul {
          list-style-type: disc;
          padding-left: 1.4rem;
          margin-bottom: 1.2rem;
          color: #334155;
        }
        .cms-document-content ol {
          list-style-type: decimal;
          padding-left: 1.4rem;
          margin-bottom: 1.2rem;
          color: #334155;
        }
        .cms-document-content li {
          margin-bottom: 0.5rem;
          line-height: 1.65;
        }
        .cms-document-content blockquote {
          border-left: 4px solid #00a6a6;
          padding-left: 1rem;
          margin-top: 1.2rem;
          margin-bottom: 1.2rem;
          font-style: italic;
          color: #1E293B;
          background: #F0FDF4;
          padding-top: 0.75rem;
          padding-bottom: 0.75rem;
          border-radius: 0 0.75rem 0.75rem 0;
        }
        .cms-document-content strong {
          color: #0F172A;
          font-weight: 700;
        }
        .cms-document-content a {
          color: #00a6a6;
          text-decoration: underline;
          font-weight: 500;
        }
      `}</style>
    </div>
  );
};

export default CmsPage;
