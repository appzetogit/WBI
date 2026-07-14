import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiDollarSign, FiArrowUp, FiArrowDown, FiArrowRight, FiClock, FiCheckCircle, FiAlertCircle, FiSend, FiTrendingUp, FiCreditCard, FiDownload, FiFilter } from 'react-icons/fi';
import LogoLoader from '../../../../components/common/LogoLoader';
import vendorWalletService from '../../../../services/vendorWalletService';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

const Wallet = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [wallet, setWallet] = useState({
    balance: 0,
    dues: 0,
    earnings: 0,
    amountDue: 0,
    totalCashCollected: 0,
    totalSettled: 0,
    totalWithdrawn: 0,
    pendingSettlements: 0,
    cashLimit: 10000
  });
  const [transactions, setTransactions] = useState([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadWalletData();
  }, []);

  const loadWalletData = async () => {
    try {
      setLoading(true);
      const [walletRes, txnRes] = await Promise.all([
        vendorWalletService.getWallet(),
        vendorWalletService.getTransactions({ limit: 50 })
      ]);

      if (walletRes.success) {
        setWallet(walletRes.data);
      }

      if (txnRes.success) {
        setTransactions(txnRes.data || []);
      }
    } catch (error) {
      console.error('Error loading wallet:', error);
      toast.error('Failed to load wallet data');
    } finally {
      setLoading(false);
    }
  };

  const filteredTransactions = transactions.filter(txn => {
    if (filter === 'all') return true;
    return txn.type === filter;
  });

  const getTransactionIcon = (type) => {
    switch (type) {
      case 'cash_collected': return <FiArrowDown className="w-5 h-5 text-rose-500" />;
      case 'earnings_credit': return <FiArrowUp className="w-5 h-5 text-emerald-500" />;
      case 'settlement': return <FiCheckCircle className="w-5 h-5 text-teal-500" />;
      case 'withdrawal': return <FiSend className="w-5 h-5 text-blue-500" />;
      case 'tds_deduction': return <FiAlertCircle className="w-5 h-5 text-amber-500" />;
      case 'commission': return <FiDollarSign className="w-5 h-5 text-indigo-500" />;
      case 'platform_fee': return <FiCreditCard className="w-5 h-5 text-rose-500" />;
      default: return <FiDollarSign className="w-5 h-5 text-gray-500" />;
    }
  };

  const getTransactionLabel = (type) => {
    switch (type) {
      case 'cash_collected': return 'Cash Collected (COD)';
      case 'earnings_credit': return 'Service Earnings';
      case 'settlement': return 'Settlement Paid';
      case 'withdrawal': return 'Withdrawal Payout';
      case 'tds_deduction': return 'TDS Deduction';
      case 'commission': return 'Platform Commission';
      case 'platform_fee': return 'Platform Fee';
      default: return type.replace('_', ' ');
    }
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) return <LogoLoader />;

  const limitPercentage = Math.min(100, (wallet.dues / (wallet.cashLimit || 10000)) * 100);

  return (
    <div className="font-sans space-y-8 max-w-7xl mx-auto w-full pb-12">
      
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Wallet & Ledger</h1>
          <p className="text-gray-500 text-sm mt-1">Manage your earnings, dues, and transaction history.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => navigate('/vendor/wallet/settlements')}
            className="px-5 py-2.5 bg-gray-50 border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-100 transition-colors flex items-center gap-2 text-sm"
          >
            <FiClock className="w-4 h-4" /> History
          </button>
          <button className="px-5 py-2.5 bg-gray-900 text-white font-semibold rounded-xl shadow-md shadow-gray-900/20 hover:bg-gray-800 transition-colors flex items-center gap-2 text-sm">
            <FiDownload className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      {wallet.isBlocked && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-red-50 border-l-4 border-red-500 rounded-r-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
        >
          <div className="flex items-start gap-3">
            <div className="p-2 bg-red-100 rounded-lg shrink-0 mt-0.5"><FiAlertCircle className="w-5 h-5 text-red-600" /></div>
            <div>
              <h3 className="font-bold text-red-900 text-base">Account Temporarily Blocked</h3>
              <p className="text-sm text-red-700 mt-1">{wallet.blockReason || 'Your account is blocked due to excessive dues exceeding the cash limit.'}</p>
            </div>
          </div>
          <button onClick={() => navigate('/vendor/wallet/settle')} className="px-6 py-2.5 bg-red-600 text-white font-bold rounded-xl shadow-md hover:bg-red-700 transition-colors whitespace-nowrap">
            Pay Dues Now
          </button>
        </motion.div>
      )}

      {/* Main Financial Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Earnings Card */}
        <div className="relative overflow-hidden bg-gradient-to-br from-emerald-500 to-teal-700 rounded-3xl p-8 text-white shadow-xl shadow-teal-500/20">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
          <div className="relative z-10 flex flex-col h-full justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-teal-50 font-medium tracking-wide">Available Earnings</span>
                <div className="bg-white/20 p-2 rounded-xl backdrop-blur-md">
                  <FiTrendingUp className="w-5 h-5 text-white" />
                </div>
              </div>
              <h2 className="text-4xl md:text-5xl font-extrabold mb-1">
                ₹{wallet.earnings?.toLocaleString() || 0}
              </h2>
              <p className="text-teal-100 text-sm">Ready to be withdrawn to your bank</p>
            </div>
            
            <div className="mt-8 pt-6 border-t border-white/20 flex items-center justify-between">
              <div>
                <p className="text-xs text-teal-100 uppercase tracking-wider mb-1">Total Settled</p>
                <p className="font-bold text-lg">₹{wallet.totalSettled?.toLocaleString() || 0}</p>
              </div>
              <button 
                onClick={() => navigate('/vendor/wallet/withdraw')}
                className="px-6 py-3 bg-white text-teal-700 font-bold rounded-xl hover:bg-teal-50 transition-colors shadow-lg"
              >
                Request Withdrawal
              </button>
            </div>
          </div>
        </div>

        {/* Dues Card */}
        <div className="relative overflow-hidden bg-white rounded-3xl p-8 border border-gray-100 shadow-xl shadow-gray-200/50 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-500 font-medium tracking-wide">Amount Due to Admin</span>
              <div className="bg-rose-50 p-2 rounded-xl">
                <FiArrowDown className="w-5 h-5 text-rose-500" />
              </div>
            </div>
            <h2 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-1">
              ₹{wallet.dues?.toLocaleString() || 0}
            </h2>
            <p className="text-gray-400 text-sm">Cash collected (COD) minus commissions</p>
          </div>

          <div className="mt-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-700">Cash Collection Limit</span>
              <span className="text-xs font-bold text-gray-500">
                ₹{(wallet.dues || 0).toLocaleString()} / ₹{(wallet.cashLimit || 10000).toLocaleString()}
              </span>
            </div>
            <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden mb-2">
              <div 
                className={`h-full rounded-full transition-all duration-700 ${limitPercentage > 85 ? 'bg-rose-500' : limitPercentage > 60 ? 'bg-amber-500' : 'bg-teal-500'}`}
                style={{ width: `${limitPercentage}%` }}
              ></div>
            </div>
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Total COD</p>
                <p className="font-bold text-gray-800">₹{wallet.totalCashCollected?.toLocaleString() || 0}</p>
              </div>
              {wallet.dues > 0 ? (
                <button 
                  onClick={() => navigate('/vendor/wallet/settle')}
                  className="px-6 py-2.5 bg-rose-600 text-white font-bold rounded-xl shadow-md shadow-rose-600/20 hover:bg-rose-700 transition-colors"
                >
                  Pay Dues Now
                </button>
              ) : (
                <span className="px-4 py-2 bg-green-50 text-green-700 font-bold text-sm rounded-lg border border-green-100">
                  No Dues Pending
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Ledger Section */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gray-50/50">
          <div>
            <h3 className="font-bold text-gray-900 text-lg">Transaction Ledger</h3>
            <p className="text-sm text-gray-500">Your recent financial activity</p>
          </div>
          
          <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 scrollbar-hide">
            {[
              { id: 'all', label: 'All' },
              { id: 'earnings_credit', label: 'Earnings' },
              { id: 'cash_collected', label: 'Cash (COD)' },
              { id: 'settlement', label: 'Settlements' },
              { id: 'withdrawal', label: 'Withdrawals' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                  filter === f.id 
                    ? 'bg-gray-900 text-white shadow-md' 
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-0">
          {filteredTransactions.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                <FiFilter className="w-8 h-8 text-gray-300" />
              </div>
              <h4 className="text-lg font-bold text-gray-900 mb-1">No Transactions Found</h4>
              <p className="text-gray-500 text-sm">There are no records matching your current filter.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredTransactions.map((txn, idx) => {
                const isCredit = ['earnings_credit', 'settlement'].includes(txn.type);
                const isDebit = ['cash_collected', 'tds_deduction', 'withdrawal', 'platform_fee', 'commission'].includes(txn.type);
                
                return (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.02 }}
                    key={txn._id} 
                    className="p-5 hover:bg-gray-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm border ${
                        isCredit ? 'bg-emerald-50 border-emerald-100' : 
                        txn.type === 'withdrawal' ? 'bg-blue-50 border-blue-100' :
                        'bg-rose-50 border-rose-100'
                      }`}>
                        {getTransactionIcon(txn.type)}
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900 text-base">{getTransactionLabel(txn.type)}</h4>
                        <p className="text-sm text-gray-500 mb-1.5">{txn.description}</p>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-gray-400 font-medium flex items-center gap-1">
                            <FiClock className="w-3 h-3" /> {formatDate(txn.createdAt)}
                          </span>
                          <span className={`font-bold px-2 py-0.5 rounded-md ${
                            txn.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                            txn.status === 'pending' ? 'bg-amber-100 text-amber-700' : 
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {txn.status.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right sm:pr-4">
                      <div className={`text-lg font-extrabold mb-1 ${isCredit ? 'text-emerald-600' : 'text-gray-900'}`}>
                        {isDebit ? '-' : '+'}₹{Math.abs(txn.amount).toLocaleString()}
                      </div>
                      {txn.referenceId && (
                        <div className="text-[10px] text-gray-400 font-mono tracking-wider uppercase">
                          REF: {txn.referenceId.slice(-8)}
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Wallet;
