import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiFileText,
  FiInfo,
  FiShield,
  FiSave,
  FiEye,
  FiEdit3,
  FiCheck,
  FiRefreshCw,
  FiBold,
  FiItalic,
  FiUnderline,
  FiList,
  FiType,
  FiCode,
  FiSmartphone,
  FiZap,
  FiClock
} from 'react-icons/fi';
import { cmsService } from '../../../../services/cmsService';

const LoadingSpinner = ({ size = 'md' }) => {
  const sizeClasses = size === 'sm' ? 'w-4 h-4 border-2' : 'w-8 h-8 border-3';
  return (
    <div className={`animate-spin rounded-full border-[#00a6a6] border-t-transparent ${sizeClasses}`} />
  );
};

const PAGES = [
  {
    slug: 'about-us',
    label: 'About Us',
    icon: FiInfo,
    description: 'Company overview, mission, vision, and team details',
    sampleTemplate: `<h1>About Our Company</h1>
<p>Welcome to <strong>our platform</strong>! We are dedicated to providing world-class services right at your doorstep with convenience, safety, and reliability.</p>
<h2>Our Mission</h2>
<p>Our mission is to empower local professionals and provide seamless, transparent, and high-quality services to every household and business.</p>
<h2>Why Choose Us?</h2>
<ul>
  <li><strong>Verified Professionals:</strong> Thoroughly background-checked expert partners.</li>
  <li><strong>Upfront Pricing:</strong> Fixed rates with no hidden surprises.</li>
  <li><strong>Satisfaction Guarantee:</strong> Complete support for every service booked.</li>
</ul>
<blockquote>Quality service isn't just our promise—it's our standard.</blockquote>`
  },
  {
    slug: 'terms-services',
    label: 'Terms & Services',
    icon: FiFileText,
    description: 'User terms, conditions, booking policies, and legal guidelines',
    sampleTemplate: `<h1>Terms & Conditions</h1>
<p>Please read these Terms & Conditions carefully before using our platform or booking any services.</p>
<h2>1. Agreement to Terms</h2>
<p>By accessing or using our services, you agree to be bound by these terms. If you do not agree to all terms, you may not use our services.</p>
<h2>2. Service Bookings</h2>
<p>All service bookings are subject to availability of verified service partners in your service area.</p>
<h2>3. Cancellations & Refunds</h2>
<ul>
  <li>Free cancellation before professional is assigned or journey started.</li>
  <li>Cancellation charges apply if booking is cancelled after professional is en route.</li>
</ul>
<h2>4. User Responsibilities</h2>
<p>Users must provide accurate address details and a safe working environment for service partners.</p>`
  },
  {
    slug: 'privacy-policy',
    label: 'Privacy Policy',
    icon: FiShield,
    description: 'Data collection, privacy safeguards, and security practices',
    sampleTemplate: `<h1>Privacy Policy</h1>
<p>We respect your privacy and are committed to protecting your personal data.</p>
<h2>1. Information We Collect</h2>
<p>We collect information you provide directly, such as your name, mobile phone number, address, and booking history.</p>
<h2>2. How We Use Your Information</h2>
<ul>
  <li>To facilitate booking requests and connect you with service partners.</li>
  <li>To send transaction updates, OTPs, and invoices.</li>
  <li>To improve platform security and user experience.</li>
</ul>
<h2>3. Data Protection & Security</h2>
<p>We implement strict encryption and security protocols to prevent unauthorized access, disclosure, or modification of your data.</p>
<h2>4. Contact Us</h2>
<p>If you have any questions regarding this Privacy Policy, please contact our support team.</p>`
  }
];

const CmsContentManagement = () => {
  const [activeTab, setActiveTab] = useState('about-us');
  const [formData, setFormData] = useState({
    title: '',
    subtitle: '',
    content: ''
  });
  const [cmsDataMap, setCmsDataMap] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [viewMode, setViewMode] = useState('editor'); // 'editor' | 'raw' | 'preview'
  const editorRef = useRef(null);

  // Fetch all CMS content on mount
  const fetchAllContent = async () => {
    setIsLoading(true);
    try {
      const response = await cmsService.getAllCmsContentAdmin();
      if (response && response.success && response.data) {
        setCmsDataMap(response.data);
        const activeData = response.data[activeTab] || {};
        setFormData({
          title: activeData.title || '',
          subtitle: activeData.subtitle || '',
          content: activeData.content || ''
        });
      }
    } catch (err) {
      console.error('Failed to load CMS list for admin:', err);
      toast.error('Failed to load CMS content list');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllContent();
  }, []);

  // Sync form when tab changes
  useEffect(() => {
    const activeData = cmsDataMap[activeTab] || {};
    const defaultPage = PAGES.find(p => p.slug === activeTab);
    setFormData({
      title: activeData.title || defaultPage?.label || '',
      subtitle: activeData.subtitle || defaultPage?.description || '',
      content: activeData.content || ''
    });
  }, [activeTab, cmsDataMap]);

  // Sync editable div when content or tab changes
  useEffect(() => {
    if (editorRef.current && viewMode === 'editor') {
      if (editorRef.current.innerHTML !== formData.content) {
        editorRef.current.innerHTML = formData.content || '';
      }
    }
  }, [formData.content, viewMode, activeTab]);

  const handleEditorInput = () => {
    if (editorRef.current) {
      setFormData(prev => ({
        ...prev,
        content: editorRef.current.innerHTML
      }));
    }
  };

  const executeCommand = (command, value = null) => {
    document.execCommand(command, false, value);
    handleEditorInput();
  };

  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast.error('Title is required');
      return;
    }

    setIsSaving(true);
    try {
      const response = await cmsService.updateCmsContentAdmin(activeTab, {
        title: formData.title,
        subtitle: formData.subtitle,
        content: formData.content,
        isActive: true
      });

      if (response && response.success) {
        toast.success(`${PAGES.find(p => p.slug === activeTab)?.label} saved successfully!`);
        // Update local map state
        setCmsDataMap(prev => ({
          ...prev,
          [activeTab]: {
            ...prev[activeTab],
            title: formData.title,
            subtitle: formData.subtitle,
            content: formData.content,
            updatedAt: new Date().toISOString()
          }
        }));
      } else {
        toast.error(response?.message || 'Failed to save content');
      }
    } catch (err) {
      console.error('Error saving CMS content:', err);
      toast.error(err?.message || 'Failed to save content');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadSample = () => {
    const currentTabObj = PAGES.find(p => p.slug === activeTab);
    if (currentTabObj && currentTabObj.sampleTemplate) {
      setFormData(prev => ({
        ...prev,
        content: currentTabObj.sampleTemplate
      }));
      if (editorRef.current) {
        editorRef.current.innerHTML = currentTabObj.sampleTemplate;
      }
      toast.success('Sample template loaded! Make sure to click Save Changes.');
    }
  };

  const activePageObj = PAGES.find(p => p.slug === activeTab);
  const activeMetaData = cmsDataMap[activeTab];
  const isConfigured = Boolean(formData.content && formData.content.trim().length > 0);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
        <LoadingSpinner />
        <p className="mt-3 text-sm text-gray-500 font-medium">Loading CMS Management...</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2.5 bg-teal-50 text-[#00a6a6] rounded-xl">
              <FiFileText className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 font-poppins">CMS Content Management</h1>
              <p className="text-xs sm:text-sm text-gray-500">
                Manage dynamic content for About Us, Terms & Services, and Privacy Policy
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-2.5 bg-[#00a6a6] hover:bg-[#008c8c] text-white text-sm font-semibold rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50"
          >
            {isSaving ? <LoadingSpinner size="sm" /> : <FiSave className="w-4 h-4" />}
            <span>Save Changes</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {PAGES.map(page => {
          const Icon = page.icon;
          const isActive = activeTab === page.slug;
          const pageData = cmsDataMap[page.slug];
          const hasContent = Boolean(pageData?.content && pageData.content.trim().length > 0);

          return (
            <button
              key={page.slug}
              onClick={() => setActiveTab(page.slug)}
              className={`p-4 rounded-2xl text-left border transition-all flex items-start gap-4 ${
                isActive
                  ? 'bg-white border-[#00a6a6] shadow-md ring-2 ring-[#00a6a6]/10'
                  : 'bg-white/70 border-gray-100 hover:bg-white hover:border-gray-200'
              }`}
            >
              <div
                className={`p-3 rounded-xl flex items-center justify-center shrink-0 ${
                  isActive ? 'bg-[#00a6a6] text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className={`font-bold text-sm ${isActive ? 'text-gray-900' : 'text-gray-700'}`}>
                    {page.label}
                  </h3>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      hasContent
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {hasContent ? 'Active' : 'Pending'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 truncate mt-1">{page.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Main Editing Card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Card Header & Controls */}
        <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-gray-900 font-poppins">
              Editing: <span className="text-[#00a6a6]">{activePageObj?.label}</span>
            </h2>
            {activeMetaData?.updatedAt && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <FiClock className="w-3.5 h-3.5" />
                Updated {new Date(activeMetaData.updatedAt).toLocaleDateString()}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-gray-200">
            <button
              onClick={() => setViewMode('editor')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                viewMode === 'editor' ? 'bg-[#00a6a6] text-white' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <FiEdit3 className="w-3.5 h-3.5" />
              Visual Editor
            </button>
            <button
              onClick={() => setViewMode('raw')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                viewMode === 'raw' ? 'bg-[#00a6a6] text-white' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <FiCode className="w-3.5 h-3.5" />
              HTML Code
            </button>
            <button
              onClick={() => setViewMode('preview')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                viewMode === 'preview' ? 'bg-[#00a6a6] text-white' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <FiSmartphone className="w-3.5 h-3.5" />
              App Preview
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Metadata Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Page Title
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g. About Us"
                className="w-full px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#00a6a6] focus:bg-white transition-all outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Subtitle / Tagline
              </label>
              <input
                type="text"
                value={formData.subtitle}
                onChange={e => setFormData({ ...formData, subtitle: e.target.value })}
                placeholder="Brief summary or slogan"
                className="w-full px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#00a6a6] focus:bg-white transition-all outline-none"
              />
            </div>
          </div>

          {/* Quick Action Bar */}
          <div className="flex items-center justify-between border-t border-gray-100 pt-4">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Page Body Content
            </span>
            <button
              onClick={handleLoadSample}
              type="button"
              className="flex items-center gap-1.5 text-xs text-[#00a6a6] font-semibold hover:underline"
            >
              <FiZap className="w-3.5 h-3.5" />
              Load Sample Template
            </button>
          </div>

          {/* Visual Editor View */}
          {viewMode === 'editor' && (
            <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              {/* Formatting Toolbar */}
              <div className="bg-gray-50 border-b border-gray-200 p-2 flex flex-wrap items-center gap-1 text-gray-700">
                <button
                  onClick={() => executeCommand('bold')}
                  title="Bold"
                  type="button"
                  className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <FiBold className="w-4 h-4" />
                </button>
                <button
                  onClick={() => executeCommand('italic')}
                  title="Italic"
                  type="button"
                  className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <FiItalic className="w-4 h-4" />
                </button>
                <button
                  onClick={() => executeCommand('underline')}
                  title="Underline"
                  type="button"
                  className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <FiUnderline className="w-4 h-4" />
                </button>
                <div className="h-5 w-px bg-gray-300 mx-1" />
                <button
                  onClick={() => executeCommand('formatBlock', '<h1>')}
                  title="Header 1"
                  type="button"
                  className="px-2 py-1 text-xs font-bold hover:bg-gray-200 rounded-lg transition-colors"
                >
                  H1
                </button>
                <button
                  onClick={() => executeCommand('formatBlock', '<h2>')}
                  title="Header 2"
                  type="button"
                  className="px-2 py-1 text-xs font-bold hover:bg-gray-200 rounded-lg transition-colors"
                >
                  H2
                </button>
                <button
                  onClick={() => executeCommand('formatBlock', '<h3>')}
                  title="Header 3"
                  type="button"
                  className="px-2 py-1 text-xs font-bold hover:bg-gray-200 rounded-lg transition-colors"
                >
                  H3
                </button>
                <button
                  onClick={() => executeCommand('formatBlock', '<p>')}
                  title="Paragraph"
                  type="button"
                  className="px-2 py-1 text-xs font-semibold hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Paragraph
                </button>
                <div className="h-5 w-px bg-gray-300 mx-1" />
                <button
                  onClick={() => executeCommand('insertUnorderedList')}
                  title="Bullet List"
                  type="button"
                  className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <FiList className="w-4 h-4" />
                </button>
                <button
                  onClick={() => executeCommand('formatBlock', '<blockquote>')}
                  title="Quote"
                  type="button"
                  className="px-2 py-1 text-xs italic hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Quote
                </button>
                <button
                  onClick={() => executeCommand('removeFormat')}
                  title="Clear Formatting"
                  type="button"
                  className="p-2 hover:bg-gray-200 rounded-lg text-red-500 transition-colors ml-auto"
                >
                  Clear Format
                </button>
              </div>

              {/* Editable Area */}
              <div
                ref={editorRef}
                contentEditable
                onInput={handleEditorInput}
                className="p-6 min-h-[350px] max-h-[500px] overflow-y-auto focus:outline-none text-gray-800 text-sm leading-relaxed cms-rich-text bg-white"
              />
            </div>
          )}

          {/* Raw HTML Code View */}
          {viewMode === 'raw' && (
            <div className="border border-gray-200 rounded-2xl overflow-hidden">
              <div className="bg-gray-900 p-3 text-xs text-gray-400 font-mono flex items-center justify-between">
                <span>HTML Source Code</span>
                <span>UTF-8</span>
              </div>
              <textarea
                value={formData.content}
                onChange={e => setFormData({ ...formData, content: e.target.value })}
                rows={14}
                className="w-full p-4 font-mono text-xs bg-slate-950 text-emerald-400 focus:outline-none leading-relaxed"
                placeholder="Enter raw HTML content here..."
              />
            </div>
          )}

          {/* Live App Mobile Preview */}
          {viewMode === 'preview' && (
            <div className="flex justify-center bg-gray-100 p-6 rounded-2xl border border-gray-200">
              <div className="w-[380px] bg-[#F7F7FB] border-[8px] border-gray-800 rounded-[40px] shadow-2xl overflow-hidden flex flex-col min-h-[550px] relative">
                {/* Mobile Header Bar */}
                <div className="bg-white px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-400" />
                    <div className="w-3 h-3 rounded-full bg-amber-400" />
                    <div className="w-3 h-3 rounded-full bg-green-400" />
                  </div>
                  <span className="text-[11px] font-bold text-gray-700">App Preview</span>
                </div>

                <div className="p-4 space-y-4 flex-1 overflow-y-auto">
                  {/* Banner */}
                  <div className="bg-gradient-to-r from-teal-700 to-emerald-800 text-white rounded-2xl p-4 shadow-sm">
                    <h3 className="font-bold text-base font-poppins">{formData.title || 'Page Title'}</h3>
                    {formData.subtitle && (
                      <p className="text-xs text-teal-100 opacity-90 mt-0.5">{formData.subtitle}</p>
                    )}
                  </div>

                  {/* Body Content */}
                  <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                    {formData.content ? (
                      <div
                        className="cms-rich-text text-xs leading-relaxed text-gray-700"
                        dangerouslySetInnerHTML={{ __html: formData.content }}
                      />
                    ) : (
                      <div className="text-center py-8 text-gray-400 text-xs">
                        No content entered yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Styled Rich Text formatting */}
      <style>{`
        .cms-rich-text h1 {
          font-size: 1.5rem;
          font-weight: 800;
          color: #111827;
          margin-top: 1rem;
          margin-bottom: 0.5rem;
        }
        .cms-rich-text h2 {
          font-size: 1.25rem;
          font-weight: 700;
          color: #1f2937;
          margin-top: 1rem;
          margin-bottom: 0.5rem;
        }
        .cms-rich-text h3 {
          font-size: 1.1rem;
          font-weight: 600;
          color: #374151;
          margin-top: 0.75rem;
          margin-bottom: 0.35rem;
        }
        .cms-rich-text p {
          margin-bottom: 0.75rem;
          line-height: 1.6;
        }
        .cms-rich-text ul {
          list-style-type: disc;
          padding-left: 1.25rem;
          margin-bottom: 0.75rem;
        }
        .cms-rich-text ol {
          list-style-type: decimal;
          padding-left: 1.25rem;
          margin-bottom: 0.75rem;
        }
        .cms-rich-text li {
          margin-bottom: 0.25rem;
        }
        .cms-rich-text blockquote {
          border-left: 4px solid #00a6a6;
          padding-left: 0.75rem;
          margin-top: 0.75rem;
          margin-bottom: 0.75rem;
          font-style: italic;
          color: #4b5563;
          background: #f0fdfa;
          padding-top: 0.5rem;
          padding-bottom: 0.5rem;
        }
      `}</style>
    </div>
  );
};

export default CmsContentManagement;
