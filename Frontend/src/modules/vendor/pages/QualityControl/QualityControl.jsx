import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShieldCheck, Image as ImageIcon, Video, CheckCircle, 
  XCircle, AlertCircle, Clock, MapPin, ZoomIn 
} from 'lucide-react';

const MOCK_PROOFS = [
  {
    id: 'PRF-801',
    projectCode: 'CCTV-RL-1029',
    siteName: 'Reliance Retail - Malviya Nagar',
    engineerName: 'Rahul Sharma',
    milestone: 'Cabling & Mounting',
    timestamp: '2 hours ago',
    status: 'pending', // pending, approved, rejected
    type: 'image',
    url: 'https://images.unsplash.com/photo-1558002038-1055907df827?auto=format&fit=crop&q=80&w=800',
    notes: 'Camera mounted at 15ft height as per layout.'
  },
  {
    id: 'PRF-802',
    projectCode: 'NET-1030',
    siteName: 'HDFC Branch 04',
    engineerName: 'Amit Kumar',
    milestone: 'Rack Setup',
    timestamp: '5 hours ago',
    status: 'rejected',
    type: 'image',
    url: 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&q=80&w=800',
    notes: 'Rack bolted, cables dressed.'
  }
];

const QualityControl = () => {
  const [proofs, setProofs] = useState(MOCK_PROOFS);
  const [selectedImage, setSelectedImage] = useState(null);

  const handleStatusChange = (id, newStatus) => {
    setProofs(proofs.map(p => p.id === id ? { ...p, status: newStatus } : p));
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="mb-8 flex flex-col md:flex-row justify-between md:items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Quality & Control</h1>
          <p className="text-gray-500">Review field proofs before they are sent to the client for billing.</p>
        </div>
        <div className="mt-4 md:mt-0 flex space-x-3">
          <div className="bg-white px-4 py-2 rounded-lg shadow-sm border border-gray-200 flex items-center">
            <Clock className="w-4 h-4 text-orange-500 mr-2" />
            <span className="text-sm font-medium text-gray-700">Pending Review: <span className="font-bold text-gray-900">{proofs.filter(p=>p.status==='pending').length}</span></span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {proofs.map((proof) => (
          <motion.div 
            key={proof.id}
            layout
            className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col"
          >
            <div className="relative h-48 bg-gray-200 group overflow-hidden cursor-pointer" onClick={() => setSelectedImage(proof.url)}>
              <img src={proof.url} alt="Proof" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all flex items-center justify-center">
                <ZoomIn className="text-white opacity-0 group-hover:opacity-100 w-8 h-8" />
              </div>
              <div className="absolute top-2 right-2">
                <span className={`px-2 py-1 text-xs font-bold rounded-md shadow-sm ${
                  proof.status === 'pending' ? 'bg-orange-500 text-white' : 
                  proof.status === 'approved' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                }`}>
                  {proof.status.toUpperCase()}
                </span>
              </div>
            </div>

            <div className="p-5 flex-1">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-sm font-bold text-gray-900">{proof.projectCode}</h3>
                <span className="text-xs text-gray-500 flex items-center">
                  <Clock className="w-3 h-3 mr-1" /> {proof.timestamp}
                </span>
              </div>
              <p className="text-sm text-gray-600 mb-1">{proof.milestone}</p>
              <p className="text-xs text-gray-500 flex items-center mb-3">
                <MapPin className="w-3 h-3 mr-1" /> {proof.siteName}
              </p>

              <div className="bg-gray-50 p-3 rounded-md text-sm text-gray-700 italic border border-gray-100 mb-4">
                "{proof.notes}"
                <p className="text-xs text-gray-400 mt-1 font-semibold not-italic">- {proof.engineerName}</p>
              </div>
            </div>

            {proof.status === 'pending' ? (
              <div className="grid grid-cols-2 border-t border-gray-100">
                <button 
                  onClick={() => handleStatusChange(proof.id, 'rejected')}
                  className="py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors flex items-center justify-center border-r border-gray-100"
                >
                  <XCircle className="w-4 h-4 mr-2" /> Reject
                </button>
                <button 
                  onClick={() => handleStatusChange(proof.id, 'approved')}
                  className="py-3 text-sm font-medium text-green-600 hover:bg-green-50 transition-colors flex items-center justify-center"
                >
                  <CheckCircle className="w-4 h-4 mr-2" /> Approve
                </button>
              </div>
            ) : (
              <div className="py-3 px-5 border-t border-gray-100 bg-gray-50">
                <p className="text-xs font-medium text-center text-gray-500">
                  Reviewed and {proof.status}.
                </p>
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Lightbox Modal */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4 cursor-pointer"
            onClick={() => setSelectedImage(null)}
          >
            <motion.img 
              initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              src={selectedImage} 
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            <button 
              className="absolute top-6 right-6 text-white bg-gray-800 rounded-full p-2 hover:bg-gray-700"
              onClick={() => setSelectedImage(null)}
            >
              <XCircle className="w-6 h-6" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default QualityControl;
