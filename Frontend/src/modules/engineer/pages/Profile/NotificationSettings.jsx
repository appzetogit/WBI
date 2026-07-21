import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiSave, FiBell, FiVolume2, FiSmartphone, FiBriefcase, FiTool, FiCreditCard, FiUser } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import Header from '../../components/layout/Header';
import engineerService from '../../../../services/engineerService';

const getPushService = () => import('../../../../services/pushNotificationService');

const NotificationSettings = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const defaultPrefs = {
    jobs: true,
    workUpdates: true,
    payments: true,
    account: true
  };

  const [formData, setFormData] = useState({
    notifications: true,
    soundAlerts: true,
    notificationPreferences: { ...defaultPrefs }
  });

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await engineerService.getProfile();
        if (res.success && (res.engineer || res.worker)) {
          const w = res.engineer || res.worker;
          const prefs = w.settings?.notificationPreferences || {};
          setFormData({
            notifications: w.settings?.notifications ?? true,
            soundAlerts: w.settings?.soundAlerts ?? true,
            notificationPreferences: {
              jobs: prefs.jobs ?? true,
              workUpdates: prefs.workUpdates ?? true,
              payments: prefs.payments ?? true,
              account: prefs.account ?? true
            }
          });
        }
      } catch (err) {
        toast.error('Failed to load settings');
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const masterOn = formData.notifications;

  const setPref = (key, value) => {
    setFormData((prev) => ({
      ...prev,
      notificationPreferences: { ...prev.notificationPreferences, [key]: value }
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await engineerService.updateProfile({
        settings: {
          notifications: formData.notifications,
          soundAlerts: formData.soundAlerts,
          notificationPreferences: formData.notificationPreferences,
          language: 'en'
        }
      });

      const engineerData = JSON.parse(localStorage.getItem('engineerData') || '{}');
      engineerData.settings = {
        ...(engineerData.settings || {}),
        notifications: formData.notifications,
        soundAlerts: formData.soundAlerts,
        notificationPreferences: formData.notificationPreferences
      };
      localStorage.setItem('engineerData', JSON.stringify(engineerData));

      if (formData.notifications) {
        try {
          const push = await getPushService();
          await push.registerFCMToken('engineer', true);
        } catch (_) {
          /* permission denied */
        }
      }

      toast.success('Settings updated successfully');
      navigate(-1);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const Toggle = ({ label, icon, value, onChange, description, disabled }) => (
    <div className={`flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="mt-1 text-gray-700">{icon}</div>
        <div>
          <h4 className="text-sm font-bold text-gray-800">{label}</h4>
          <p className="text-[10px] font-medium text-gray-500 mt-0.5 max-w-[220px] leading-relaxed">{description}</p>
        </div>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={onChange}
        className={`w-12 h-6 rounded-full p-1 transition-colors duration-300 ease-in-out ${value ? 'bg-gray-900' : 'bg-gray-200'} disabled:cursor-not-allowed`}
      >
        <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform duration-300 ease-in-out ${value ? 'translate-x-6' : 'translate-x-0'}`} />
      </button>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FCFC] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-gray-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FCFC] font-sans text-[#0F172A] ">
      <Header title="Notifications" showBack={true} onBack={() => navigate(-1)} />

      <main className="px-5 pt-6 max-w-md mx-auto space-y-6 pb-10">

        <div className="bg-gray-50 border border-gray-200 p-4 rounded-2xl flex items-start gap-3">
          <FiBell className="w-5 h-5 text-gray-700 shrink-0 mt-0.5" />
          <p className="text-xs text-gray-700 font-medium leading-relaxed">
            Choose what you want to hear about — new jobs, work progress, wallet &amp; payouts, and account updates.
          </p>
        </div>

        <div className="bg-white p-5 rounded-3xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-gray-50 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 px-1">General</p>

          <Toggle
            label="Push notifications"
            description="Master switch for alerts on this device (jobs, work, payments)."
            icon={<FiSmartphone />}
            value={formData.notifications}
            onChange={() => setFormData({ ...formData, notifications: !formData.notifications })}
          />

          <Toggle
            label="Sound alerts"
            description="Ring or chime for urgent new job requests."
            icon={<FiVolume2 />}
            value={formData.soundAlerts}
            onChange={() => setFormData({ ...formData, soundAlerts: !formData.soundAlerts })}
          />
        </div>

        <div className="bg-white p-5 rounded-3xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-gray-50 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 px-1">Categories</p>

          <Toggle
            label="Jobs & assignments"
            description="Vendor ops jobs, freelancer pool projects, and B2B offers."
            icon={<FiBriefcase />}
            value={formData.notificationPreferences.jobs}
            disabled={!masterOn}
            onChange={() => setPref('jobs', !formData.notificationPreferences.jobs)}
          />

          <Toggle
            label="Work updates"
            description="Status changes, reminders, and project milestones."
            icon={<FiTool />}
            value={formData.notificationPreferences.workUpdates}
            disabled={!masterOn}
            onChange={() => setPref('workUpdates', !formData.notificationPreferences.workUpdates)}
          />

          <Toggle
            label="Payments & wallet"
            description="Earnings credited, withdrawal submitted, and payout processed."
            icon={<FiCreditCard />}
            value={formData.notificationPreferences.payments}
            disabled={!masterOn}
            onChange={() => setPref('payments', !formData.notificationPreferences.payments)}
          />

          <Toggle
            label="Account"
            description="Profile, verification, and important platform messages."
            icon={<FiUser />}
            value={formData.notificationPreferences.account}
            disabled={!masterOn}
            onChange={() => setPref('account', !formData.notificationPreferences.account)}
          />
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-gray-900 hover:bg-black text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-[0_4px_20px_rgba(0,0,0,0.15)] disabled:opacity-70 disabled:active:scale-100"
        >
          {saving ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <FiSave className="w-5 h-5" /> Save preferences
            </>
          )}
        </button>
      </main>
    </div>
  );
};

export default NotificationSettings;
