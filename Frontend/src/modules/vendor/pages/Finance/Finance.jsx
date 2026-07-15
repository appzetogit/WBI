import React from 'react';
import { motion } from 'framer-motion';
import { useVendorConfig } from '../../context/VendorConfigContext';
import { Wallet, ArrowUpRight, ArrowDownRight, IndianRupee, FileText, Download } from 'lucide-react';

const Finance = () => {
  const { vendorProfile } = useVendorConfig();

  const MOCK_TRANSACTIONS = [
    { id: 'TXN-001', date: '2026-07-15', desc: 'Milestone 2 - CCTV-RL-1029', amount: 25000, type: 'credit', status: 'completed' },
    { id: 'TXN-002', date: '2026-07-12', desc: 'Wallet Withdrawal', amount: 50000, type: 'debit', status: 'completed' },
    { id: 'TXN-003', date: '2026-07-10', desc: 'Platform Fee - NET-1030', amount: 1500, type: 'debit', status: 'completed' },
  ];

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Finance & Billing</h1>
        <p className="text-gray-500">Manage your earnings, milestone payouts, and invoices.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 p-6 rounded-xl shadow-lg text-white col-span-1 md:col-span-2 flex flex-col justify-between">
          <div>
            <p className="text-gray-400 text-sm font-medium">Master Wallet Balance</p>
            <h2 className="text-4xl font-bold mt-2 flex items-center">
              <IndianRupee className="w-8 h-8 mr-1" /> {vendorProfile?.walletBalance?.toLocaleString() || '1,25,000'}
            </h2>
          </div>
          <div className="flex space-x-4 mt-6">
            <button className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition-colors">
              Withdraw Funds
            </button>
            <button className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg shadow-sm transition-colors flex items-center">
              <FileText className="w-4 h-4 mr-2" /> View Ledger
            </button>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col justify-center">
          <p className="text-sm font-medium text-gray-500 mb-4">Quick Stats (This Month)</p>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 flex items-center"><ArrowUpRight className="w-4 h-4 text-green-500 mr-2" /> Total Earnings</span>
              <span className="font-bold text-gray-900">₹4,50,000</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 flex items-center"><ArrowDownRight className="w-4 h-4 text-red-500 mr-2" /> Platform Fees</span>
              <span className="font-bold text-gray-900">₹22,500</span>
            </div>
            <div className="flex justify-between items-center pt-3 border-t border-gray-100">
              <span className="text-sm font-medium text-gray-800">Pending Payouts</span>
              <span className="font-bold text-orange-600">₹75,000</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-900">Recent Transactions</h2>
          <button className="text-sm font-medium text-blue-600 hover:text-blue-800 flex items-center">
            <Download className="w-4 h-4 mr-1" /> Export CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Transaction ID</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Description</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-right">Amount</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {MOCK_TRANSACTIONS.map((txn, idx) => (
                <motion.tr 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  key={txn.id} 
                  className="hover:bg-gray-50"
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{new Date(txn.date).toLocaleDateString()}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{txn.id}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{txn.desc}</td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm font-bold text-right ${txn.type === 'credit' ? 'text-green-600' : 'text-gray-900'}`}>
                    {txn.type === 'credit' ? '+' : '-'} ₹{txn.amount.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 capitalize">
                      {txn.status}
                    </span>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Finance;
