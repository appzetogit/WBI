import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiSearch, FiMessageCircle, FiPhoneCall, FiMail, FiFileText, FiLifeBuoy, FiChevronRight, FiClock, FiCheckCircle, FiAlertCircle, FiUser, FiX } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';

const SupportCenter = () => {
  const navigate = useNavigate();
  const [vendorData, setVendorData] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [ticketForm, setTicketForm] = useState({ subject: '', category: 'General', description: '' });

  // Load Vendor Data & Mock Tickets
  useEffect(() => {
    const data = localStorage.getItem('vendorData');
    if (data && data !== 'undefined') {
      try {
        setVendorData(JSON.parse(data));
      } catch (e) {
        console.error('Failed to parse vendorData', e);
      }
    }

    const savedTickets = localStorage.getItem('vendorTickets');
    if (savedTickets) {
      setTickets(JSON.parse(savedTickets));
    } else {
      // Default placeholder tickets
      const defaultTickets = [
        { id: 'TKT-8923', subject: 'Payment settlement delay', status: 'In Progress', date: new Date(Date.now() - 7200000).toLocaleString(), category: 'Billing' },
        { id: 'TKT-8845', subject: 'How to update service locations?', status: 'Resolved', date: new Date(Date.now() - 172800000).toLocaleString(), category: 'General' },
      ];
      setTickets(defaultTickets);
      localStorage.setItem('vendorTickets', JSON.stringify(defaultTickets));
    }
  }, []);

  const handleCreateTicket = (e) => {
    e.preventDefault();
    if (!ticketForm.subject || !ticketForm.description) {
      toast.error("Please fill in all required fields.");
      return;
    }

    const newTicket = {
      id: `TKT-${Math.floor(1000 + Math.random() * 9000)}`,
      subject: ticketForm.subject,
      status: 'Open',
      date: new Date().toLocaleString(),
      category: ticketForm.category
    };

    const updatedTickets = [newTicket, ...tickets];
    setTickets(updatedTickets);
    localStorage.setItem('vendorTickets', JSON.stringify(updatedTickets));
    
    toast.success("Support ticket created successfully!");
    setIsModalOpen(false);
    setTicketForm({ subject: '', category: 'General', description: '' });
  };

  const quickLinks = [
    { title: 'Billing & Payments', icon: FiFileText, desc: 'Invoices, payouts, and tax documents', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100', link: '/vendor/digital-solution/wallet' },
    { title: 'Account Settings', icon: FiUser, desc: 'Profile, security, and preferences', color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100', link: '/vendor/digital-solution/settings' },
    { title: 'Technical Help', icon: FiLifeBuoy, desc: 'App issues, bugs, and troubleshooting', color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100', action: () => setIsModalOpen(true) },
    { title: 'Service Guidelines', icon: FiCheckCircle, desc: 'Quality standards and best practices', color: 'text-teal-600', bg: 'bg-teal-50', border: 'border-teal-100', link: '/vendor/digital-solution/dashboard' },
  ];

  return (
    <div className="font-sans space-y-8 max-w-7xl mx-auto w-full pb-12">
      
      {/* Hero Section */}
      <div className="relative bg-gradient-to-br from-gray-900 to-gray-800 rounded-[2rem] overflow-hidden shadow-2xl shadow-gray-900/20 px-8 py-16 text-center md:text-left md:px-12 flex flex-col md:flex-row items-center justify-between">
        <div className="absolute top-0 right-0 w-96 h-96 bg-teal-500/20 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl -ml-10 -mb-10 pointer-events-none"></div>
        
        <div className="relative z-10 max-w-2xl">
          <h1 className="text-3xl md:text-5xl font-extrabold text-white mb-4 tracking-tight">
            How can we help you, <span className="text-teal-400">{vendorData?.name?.split(' ')[0] || 'Partner'}</span>?
          </h1>
          <p className="text-gray-400 text-lg mb-8 max-w-xl">
            Search our knowledge base or reach out to our dedicated support team to resolve your issues instantly.
          </p>
          
          <div className="relative max-w-lg">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <FiSearch className="text-gray-400 w-6 h-6" />
            </div>
            <input 
              type="text" 
              placeholder="Search for articles, guides, or FAQs..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/10 backdrop-blur-md border border-white/20 text-white placeholder-gray-300 text-base rounded-2xl focus:ring-2 focus:ring-teal-400 focus:bg-white/20 block pl-14 p-4 transition-all outline-none"
            />
          </div>
        </div>

        <div className="hidden md:flex relative z-10 w-48 h-48 bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2rem] items-center justify-center shadow-2xl rotate-3 hover:rotate-0 transition-transform duration-500">
           <FiLifeBuoy className="w-24 h-24 text-teal-400 opacity-80" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column (Quick Links & Contact) */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Quick Help Categories */}
          <div>
            <h3 className="text-xl font-bold text-gray-900 mb-6">Browse Topics</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {quickLinks.map((item, idx) => (
                <motion.div 
                  key={idx}
                  whileHover={{ y: -4 }}
                  onClick={() => item.link ? navigate(item.link) : (item.action && item.action())}
                  className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md cursor-pointer transition-all flex items-start gap-4"
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${item.bg} border ${item.border}`}>
                    <item.icon className={`w-6 h-6 ${item.color}`} />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900 text-base mb-1">{item.title}</h4>
                    <p className="text-sm text-gray-500 leading-relaxed">{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Contact Methods */}
          <div className="bg-white rounded-[2rem] p-8 border border-gray-100 shadow-sm">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Still need help?</h3>
            <p className="text-gray-500 text-sm mb-8">Our support team is available 24/7 to assist you.</p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <a href="mailto:support@webcraft.com" className="flex flex-col items-center text-center p-6 bg-gray-50 rounded-2xl border border-gray-100 hover:border-teal-200 hover:bg-teal-50/50 transition-colors cursor-pointer group">
                <div className="w-12 h-12 bg-teal-100 text-teal-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <FiMessageCircle className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-gray-900 mb-1">Live Chat</h4>
                <p className="text-xs text-gray-500 mb-3">Wait time: ~2 mins</p>
                <span className="text-teal-600 font-semibold text-sm group-hover:underline">Start Chat</span>
              </a>

              <a href="tel:+18001234567" className="flex flex-col items-center text-center p-6 bg-gray-50 rounded-2xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/50 transition-colors cursor-pointer group">
                <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <FiPhoneCall className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-gray-900 mb-1">Phone Call</h4>
                <p className="text-xs text-gray-500 mb-3">Mon-Fri, 9am - 6pm</p>
                <span className="text-blue-600 font-semibold text-sm group-hover:underline">Call Us</span>
              </a>

              <a href="mailto:support@webcraft.com" className="flex flex-col items-center text-center p-6 bg-gray-50 rounded-2xl border border-gray-100 hover:border-orange-200 hover:bg-orange-50/50 transition-colors cursor-pointer group">
                <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <FiMail className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-gray-900 mb-1">Email Support</h4>
                <p className="text-xs text-gray-500 mb-3">Reply within 24 hours</p>
                <span className="text-orange-600 font-semibold text-sm group-hover:underline">Send Email</span>
              </a>
            </div>
          </div>
        </div>

        {/* Right Column (Tickets & Status) */}
        <div className="space-y-8">
          
          {/* Create Ticket Button */}
          <button 
            onClick={() => setIsModalOpen(true)}
            className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-4 px-6 rounded-2xl shadow-lg shadow-teal-600/25 transition-all flex items-center justify-center gap-2 active:scale-95"
          >
            <FiLifeBuoy className="w-5 h-5" />
            Open a New Ticket
          </button>

          {/* Recent Tickets */}
          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden flex flex-col h-[400px]">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between shrink-0 bg-gray-50/50">
              <h3 className="font-bold text-gray-900">Recent Tickets</h3>
              <span className="text-teal-600 text-sm font-semibold hover:underline cursor-pointer">View All</span>
            </div>
            
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {tickets.length > 0 ? (
                tickets.map((ticket, idx) => (
                  <div key={idx} className="p-6 hover:bg-gray-50 transition-colors cursor-pointer group">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-gray-400">{ticket.id}</span>
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md ${
                        ticket.status === 'Resolved' || ticket.status === 'Closed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {ticket.status}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-gray-900 mb-2 pr-4">{ticket.subject}</h4>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span className="flex items-center gap-1.5"><FiClock className="w-3.5 h-3.5" /> {ticket.date}</span>
                      <FiChevronRight className="w-4 h-4 text-gray-300 group-hover:text-teal-500 transition-colors" />
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 p-6 text-center">
                  <FiAlertCircle className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-sm">No recent tickets.</p>
                </div>
              )}
            </div>
          </div>

          {/* System Status */}
          <div className="bg-gray-900 rounded-[2rem] p-6 text-white relative overflow-hidden">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-green-500/20 rounded-full blur-2xl"></div>
            <div className="flex items-center gap-4 mb-2">
              <div className="w-3 h-3 bg-green-500 rounded-full shadow-[0_0_12px_rgba(34,197,94,0.8)] animate-pulse"></div>
              <h3 className="font-bold text-white">All Systems Operational</h3>
            </div>
            <p className="text-gray-400 text-xs pl-7">Platform is running smoothly.</p>
          </div>

        </div>
      </div>

      {/* Ticket Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gray-50">
                <h3 className="text-lg font-bold text-gray-900">Create Support Ticket</h3>
                <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                  <FiX className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleCreateTicket} className="p-6 space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Subject</label>
                  <input 
                    type="text" 
                    required
                    value={ticketForm.subject}
                    onChange={(e) => setTicketForm({...ticketForm, subject: e.target.value})}
                    placeholder="Brief description of the issue"
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Category</label>
                  <select 
                    value={ticketForm.category}
                    onChange={(e) => setTicketForm({...ticketForm, category: e.target.value})}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all bg-white"
                  >
                    <option>General</option>
                    <option>Billing & Payouts</option>
                    <option>Technical Issue</option>
                    <option>Account Settings</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Details</label>
                  <textarea 
                    required
                    rows="4"
                    value={ticketForm.description}
                    onChange={(e) => setTicketForm({...ticketForm, description: e.target.value})}
                    placeholder="Please describe your issue in detail..."
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all resize-none"
                  ></textarea>
                </div>

                <div className="pt-2 flex items-center justify-end gap-3">
                  <button 
                    type="button" 
                    onClick={() => setIsModalOpen(false)}
                    className="px-5 py-2.5 text-gray-600 font-semibold hover:bg-gray-100 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-6 py-2.5 bg-teal-600 text-white font-bold rounded-xl shadow-md shadow-teal-600/20 hover:bg-teal-700 transition-colors"
                  >
                    Submit Ticket
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default SupportCenter;
