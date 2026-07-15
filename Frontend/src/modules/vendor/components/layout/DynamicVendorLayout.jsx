import React from 'react';
import { Outlet } from 'react-router-dom';
import DynamicSidebar from '../DynamicSidebar';
import { VendorConfigProvider } from '../../context/VendorConfigContext';
import { VendorSocketProvider } from '../../context/VendorSocketContext';
import { Bell, User, Search } from 'lucide-react';

const DynamicVendorLayout = () => {
  return (
    <VendorSocketProvider>
      <VendorConfigProvider>
        <div className="flex h-screen overflow-hidden bg-gray-50">
          <DynamicSidebar />
          
          <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top Header */}
          <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-6 z-10">
            <div className="flex-1 flex items-center">
              <div className="relative w-96 hidden md:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Search projects, sites, engineers..." 
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm bg-gray-50"
                />
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <button className="relative p-2 text-gray-400 hover:text-gray-600">
                <Bell className="w-5 h-5" />
                <span className="absolute top-1.5 right-1.5 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
              </button>
              
              <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center border border-blue-200 cursor-pointer">
                <User className="w-4 h-4 text-blue-600" />
              </div>
            </div>
          </header>

          {/* Main Content Area */}
          <main className="flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>
      </VendorConfigProvider>
    </VendorSocketProvider>
  );
};

export default DynamicVendorLayout;
