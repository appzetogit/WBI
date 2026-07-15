import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, MapPin, Search, Plus, Filter,
  Star, Briefcase, Phone, Mail, CheckCircle, Shield, Target
} from 'lucide-react';

const MOCK_WORKFORCE = [
  {
    id: 'ENG-01',
    name: 'Rahul Sharma',
    phone: '+91 9876543210',
    email: 'rahul.s@example.com',
    skills: ['CCTV Installation', 'DVR Configuration', 'Networking Basics'],
    status: 'available',
    currentLocation: 'Indore, MP',
    rating: 4.8,
    jobsCompleted: 45
  },
  {
    id: 'ENG-02',
    name: 'Amit Kumar',
    phone: '+91 9988776655',
    email: 'amit.k@example.com',
    skills: ['Network Cabling', 'Rack Setup', 'Router Config'],
    status: 'on_job',
    currentLocation: 'Bhopal, MP',
    rating: 4.9,
    jobsCompleted: 62
  },
  {
    id: 'ENG-03',
    name: 'Suresh Yadav',
    phone: '+91 8877665544',
    email: 'suresh.y@example.com',
    skills: ['Solar Panel Mounting', 'Electrical Wiring', 'Inverter Sync'],
    status: 'leave',
    currentLocation: 'Jaipur, RJ',
    rating: 4.5,
    jobsCompleted: 18
  }
];

const Workforce = () => {
  const [engineers, setEngineers] = useState(MOCK_WORKFORCE);
  const [showAddModal, setShowAddModal] = useState(false);

  const getStatusColor = (status) => {
    switch(status) {
      case 'available': return 'bg-green-100 text-green-800';
      case 'on_job': return 'bg-blue-100 text-blue-800';
      case 'leave': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex flex-col md:flex-row justify-between md:items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Workforce Management</h1>
          <p className="text-gray-500">Manage your engineers, their skills, and live availability.</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="mt-4 md:mt-0 px-4 py-2 bg-gray-900 text-white rounded-lg shadow-sm hover:bg-gray-800 flex items-center"
        >
          <Plus className="w-4 h-4 mr-2" /> Add Engineer
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">Total Engineers</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{engineers.length}</p>
          </div>
          <div className="p-3 bg-blue-50 rounded-lg">
            <Users className="w-6 h-6 text-blue-600" />
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">Available Now</p>
            <p className="text-2xl font-bold text-green-600 mt-1">
              {engineers.filter(e => e.status === 'available').length}
            </p>
          </div>
          <div className="p-3 bg-green-50 rounded-lg">
            <CheckCircle className="w-6 h-6 text-green-600" />
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">On Active Job</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">
              {engineers.filter(e => e.status === 'on_job').length}
            </p>
          </div>
          <div className="p-3 bg-blue-50 rounded-lg">
            <Briefcase className="w-6 h-6 text-blue-600" />
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">Average Rating</p>
            <p className="text-2xl font-bold text-yellow-500 mt-1 flex items-center">
              4.7 <Star className="w-5 h-5 ml-1 fill-current" />
            </p>
          </div>
          <div className="p-3 bg-yellow-50 rounded-lg">
            <Target className="w-6 h-6 text-yellow-600" />
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search engineers by name or skill..." 
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>
        <button className="flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 w-full sm:w-auto">
          <Filter className="h-4 w-4 mr-2" /> Filter
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {engineers.map(eng => (
          <motion.div 
            key={eng.id}
            whileHover={{ y: -4 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col"
          >
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center">
                  <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg">
                    {eng.name.charAt(0)}
                  </div>
                  <div className="ml-3">
                    <h3 className="text-lg font-bold text-gray-900">{eng.name}</h3>
                    <p className="text-xs text-gray-500">{eng.id}</p>
                  </div>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${getStatusColor(eng.status)}`}>
                  {eng.status.replace('_', ' ')}
                </span>
              </div>
              
              <div className="space-y-2 mb-4">
                <p className="text-sm text-gray-600 flex items-center">
                  <Phone className="w-4 h-4 mr-2 text-gray-400" /> {eng.phone}
                </p>
                <p className="text-sm text-gray-600 flex items-center">
                  <Mail className="w-4 h-4 mr-2 text-gray-400" /> {eng.email}
                </p>
                <p className="text-sm text-gray-600 flex items-center">
                  <MapPin className="w-4 h-4 mr-2 text-gray-400" /> {eng.currentLocation}
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Verified Skills</p>
                <div className="flex flex-wrap gap-2">
                  {eng.skills.map((skill, idx) => (
                    <span key={idx} className="bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-auto border-t border-gray-100 bg-gray-50 px-6 py-4 flex justify-between items-center">
              <div className="flex flex-col">
                <span className="text-xs text-gray-500">Performance</span>
                <span className="text-sm font-semibold flex items-center">
                  {eng.rating} <Star className="w-3 h-3 ml-1 text-yellow-500 fill-current" /> 
                  <span className="mx-2 text-gray-300">|</span> 
                  {eng.jobsCompleted} Jobs
                </span>
              </div>
              <button className="text-sm font-medium text-blue-600 hover:text-blue-800">
                View Profile
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Add Engineer Modal (Mock UI) */}
      <AnimatePresence>
        {showAddModal && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black bg-opacity-50 z-40 backdrop-blur-sm"
              onClick={() => setShowAddModal(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-white rounded-xl shadow-2xl z-50 p-6"
            >
              <h2 className="text-xl font-bold text-gray-900 mb-4">Add New Engineer</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-gray-900 focus:border-gray-900 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                  <input type="tel" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-gray-900 focus:border-gray-900 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Primary Skill / Service Category</label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-gray-900 focus:border-gray-900 outline-none">
                    <option>CCTV Installation</option>
                    <option>Networking</option>
                    <option>Solar Panel</option>
                  </select>
                </div>
              </div>
              <div className="mt-6 flex justify-end space-x-3">
                <button onClick={() => setShowAddModal(false)} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md">Cancel</button>
                <button onClick={() => setShowAddModal(false)} className="px-4 py-2 bg-gray-900 text-white rounded-md">Add Engineer</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Workforce;
