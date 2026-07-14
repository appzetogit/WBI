import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiBell, FiVolume2, FiGlobe, FiInfo, FiLogOut, FiTrash2, FiMapPin, FiSettings, FiShield, FiUserX, FiChevronRight } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import { vendorAuthService } from '../../../../services/authService';
import api from '../../../../services/api';
const getPushService = () => import('../../../../services/pushNotificationService');
const registerFCMToken = async (...args) => (await getPushService()).registerFCMToken(...args);
const removeFCMToken = async (...args) => (await getPushService()).removeFCMToken(...args);

const Settings = () => {
  const navigate = useNavigate();
  const [settings, setSettings] = useState({
    notifications: true,
    soundAlerts: true,
    language: 'en',
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        setIsLoading(true);
        // Fallback to local storage initially for fast render
        const savedSettings = JSON.parse(localStorage.getItem('vendorSettings') || '{}');
        if (Object.keys(savedSettings).length > 0) {
          setSettings(prev => ({ ...prev, ...savedSettings }));
        }

        // Fetch production settings from backend
        const response = await api.get('/vendors/settings');
        if (response.data?.success && response.data?.data?.settings) {
          const backendSettings = response.data.data.settings;
          setSettings(prev => ({ ...prev, ...backendSettings }));
          localStorage.setItem('vendorSettings', JSON.stringify(backendSettings));
        }
      } catch (error) {
        console.error('Error loading settings from backend:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  const saveSettingsToBackend = async (newSettings) => {
    try {
      await api.put('/vendors/settings', newSettings);
      localStorage.setItem('vendorSettings', JSON.stringify(newSettings));
    } catch (error) {
      console.error('Failed to sync settings with backend:', error);
      toast.error('Failed to sync settings to cloud');
    }
  };

  const handleToggle = async (key) => {
    const newValue = !settings[key];
    const updatedSettings = { ...settings, [key]: newValue };
    setSettings(updatedSettings);
    
    // Sync to backend in background
    saveSettingsToBackend({ [key]: newValue });

    // Handle FCM Token registration/removal if notifications toggled
    if (key === 'notifications') {
      if (newValue) {
        try {
          await registerFCMToken('vendor', true);
          toast.success('Push Notifications enabled');
        } catch (error) {
          console.error('Error enabling notifications:', error);
          toast.error('Failed to enable push notifications');
        }
      } else {
        try {
          await removeFCMToken('vendor');
          toast.success('Push Notifications disabled');
        } catch (error) {
          console.error('Error disabling notifications:', error);
        }
      }
    }
  };

  const handleLanguageChange = (lang) => {
    const updatedSettings = { ...settings, language: lang };
    setSettings(updatedSettings);
    
    // Sync to backend in background
    saveSettingsToBackend({ language: lang });
    toast.success(`Language changed to ${lang === 'en' ? 'English' : 'Hindi'}`);
  };

  const handleLogout = async () => {
    try {
      await vendorAuthService.logout();
      toast.success('Logged out successfully');
      navigate('/vendor/login');
    } catch (error) {
      localStorage.removeItem('vendorAccessToken');
      localStorage.removeItem('vendorRefreshToken');
      localStorage.removeItem('vendorData');
      toast.success('Logged out successfully');
      navigate('/vendor/login');
    }
  };

  const handleDeleteAccount = async () => {
    if (window.confirm('Are you absolutely sure you want to delete your account? This action cannot be undone and you will lose all your data.')) {
      try {
        await api.delete('/vendors/profile');
        toast.success('Account deleted successfully');
        localStorage.clear();
        navigate('/');
      } catch (error) {
        console.error('Error deleting account:', error);
        toast.error('Failed to delete account');
      }
    }
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto font-sans text-gray-900 animate-fade-in">
      
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-teal-50 rounded-2xl flex items-center justify-center">
          <FiSettings className="w-6 h-6 text-teal-600" />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Settings & Preferences</h1>
          <p className="text-gray-500 mt-1">Manage your account settings, notifications, and language.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column - Main Settings */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Notifications Panel */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 transition-all hover:shadow-md">
            <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
              <FiBell className="text-teal-600" /> Notifications
            </h2>
            <div className="space-y-6">
              <div className="flex items-center justify-between group">
                <div>
                  <h3 className="font-semibold text-gray-800">Push Notifications</h3>
                  <p className="text-sm text-gray-500 mt-0.5">Receive real-time alerts for new bookings and updates.</p>
                </div>
                <button
                  onClick={() => handleToggle('notifications')}
                  className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 ${
                    settings.notifications ? 'bg-teal-600' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                      settings.notifications ? 'translate-x-8' : 'translate-x-1'
                    } shadow-sm`}
                  />
                </button>
              </div>
              <div className="h-px bg-gray-100 w-full"></div>
              <div className="flex items-center justify-between group">
                <div>
                  <h3 className="font-semibold text-gray-800">Sound Alerts</h3>
                  <p className="text-sm text-gray-500 mt-0.5">Play a notification sound when a new job arrives.</p>
                </div>
                <button
                  onClick={() => handleToggle('soundAlerts')}
                  className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 ${
                    settings.soundAlerts ? 'bg-teal-600' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                      settings.soundAlerts ? 'translate-x-8' : 'translate-x-1'
                    } shadow-sm`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Localization Panel */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 transition-all hover:shadow-md">
            <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
              <FiGlobe className="text-teal-600" /> Localization
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => handleLanguageChange('en')}
                className={`p-4 rounded-2xl border-2 text-left transition-all flex flex-col ${
                  settings.language === 'en' 
                  ? 'border-teal-600 bg-teal-50/50 shadow-sm' 
                  : 'border-gray-100 hover:border-gray-200 bg-white'
                }`}
              >
                <span className={`font-bold ${settings.language === 'en' ? 'text-teal-700' : 'text-gray-700'}`}>English</span>
                <span className="text-sm text-gray-500 mt-1">Default</span>
              </button>
              <button
                onClick={() => handleLanguageChange('hi')}
                className={`p-4 rounded-2xl border-2 text-left transition-all flex flex-col ${
                  settings.language === 'hi' 
                  ? 'border-teal-600 bg-teal-50/50 shadow-sm' 
                  : 'border-gray-100 hover:border-gray-200 bg-white'
                }`}
              >
                <span className={`font-bold ${settings.language === 'hi' ? 'text-teal-700' : 'text-gray-700'}`}>हिंदी</span>
                <span className="text-sm text-gray-500 mt-1">Hindi</span>
              </button>
            </div>
          </div>

          {/* Business Address */}
          <div 
            onClick={() => navigate('/vendor/address-management')}
            className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 transition-all hover:shadow-md hover:border-teal-100 cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                  <FiMapPin className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 group-hover:text-teal-600 transition-colors">Manage Business Address</h3>
                  <p className="text-sm text-gray-500 mt-0.5">Update your service location and radius.</p>
                </div>
              </div>
              <FiChevronRight className="w-5 h-5 text-gray-400 group-hover:text-teal-600 transition-colors" />
            </div>
          </div>

        </div>

        {/* Right Column - Danger Zone & Info */}
        <div className="space-y-6">
          
          {/* Security & Access */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
              <FiShield className="text-teal-600" /> Account Security
            </h2>
            <div className="space-y-4">
              <button
                onClick={handleLogout}
                className="w-full py-3.5 px-4 bg-gray-50 hover:bg-gray-100 text-gray-800 font-bold rounded-2xl flex items-center justify-center gap-2 transition-colors border border-gray-200"
              >
                <FiLogOut className="w-5 h-5" /> Sign Out
              </button>
              
              <div className="h-px bg-gray-100 w-full my-4"></div>
              
              <div className="p-4 bg-rose-50/50 border border-rose-100 rounded-2xl">
                <h3 className="font-bold text-rose-800 flex items-center gap-2 mb-1">
                  <FiUserX /> Danger Zone
                </h3>
                <p className="text-xs text-rose-600/80 mb-4 leading-relaxed">
                  Permanently delete your account and all associated data. This action cannot be reversed.
                </p>
                <button
                  onClick={handleDeleteAccount}
                  className="w-full py-2.5 px-4 bg-white text-rose-600 border border-rose-200 hover:bg-rose-50 hover:border-rose-300 font-bold rounded-xl transition-colors text-sm"
                >
                  Delete Account
                </button>
              </div>
            </div>
          </div>

          {/* About App */}
          <div className="bg-gray-50/50 rounded-3xl p-6 border border-gray-100 text-center">
            <div className="w-12 h-12 bg-white shadow-sm border border-gray-100 rounded-2xl mx-auto flex items-center justify-center mb-3">
              <FiInfo className="w-6 h-6 text-teal-600" />
            </div>
            <h3 className="font-bold text-gray-800">WBI Vendor Portal</h3>
            <p className="text-sm text-gray-500 mt-1">Version 1.0.0 (Production)</p>
            <p className="text-xs text-gray-400 mt-4">© {new Date().getFullYear()} Wetzel Barron Infosystem Pvt Ltd.<br/>All rights reserved.</p>
          </div>

        </div>
      </div>
    </div>
  );
};

export default Settings;

