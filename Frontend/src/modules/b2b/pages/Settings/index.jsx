import React, { useState } from 'react';
import { FiCheckCircle, FiLogOut, FiShield } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../../../services/api';

const Settings = () => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updating, setUpdating] = useState(false);
  const [loggingOutDevices, setLoggingOutDevices] = useState(false);

  const handlePasswordUpdate = async (e) => {
    e.preventDefault();
    if (!oldPassword || !newPassword || !confirmPassword) {
      toast.error('All password fields are required');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setUpdating(true);
    try {
      await api.patch('/b2b/company-profile/change-password', {
        currentPassword: oldPassword,
        newPassword
      });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password updated successfully');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update password');
    } finally {
      setUpdating(false);
    }
  };

  const handleLogoutAllDevices = async () => {
    setLoggingOutDevices(true);
    try {
      await api.post('/b2b/company-profile/logout-all-devices');
      toast.success('Logged out of all other devices');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to logout other devices');
    } finally {
      setLoggingOutDevices(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="max-w-xl bg-white rounded-3xl border border-[#E6F4F2] p-6 shadow-sm">
        <div className="border-b border-gray-50 pb-4 mb-6">
          <h3 className="text-sm font-bold text-gray-800 border-l-4 border-[#10AFA5] pl-2 uppercase tracking-wide">
            Change Account Password
          </h3>
        </div>

        <form onSubmit={handlePasswordUpdate} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1.5">Old Password *</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="Enter current password"
              className="w-full h-10 border border-gray-200 text-xs rounded-xl px-3.5 focus:ring-2 focus:ring-[#10AFA5]/10 focus:border-[#10AFA5] transition-all"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1.5">New Password *</label>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min 8 characters"
              className="w-full h-10 border border-gray-200 text-xs rounded-xl px-3.5 focus:ring-2 focus:ring-[#10AFA5]/10 focus:border-[#10AFA5] transition-all"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1.5">Confirm New Password *</label>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              className="w-full h-10 border border-gray-200 text-xs rounded-xl px-3.5 focus:ring-2 focus:ring-[#10AFA5]/10 focus:border-[#10AFA5] transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={updating}
            className="bg-[#10AFA5] hover:bg-[#0D9488] disabled:bg-gray-300 text-white text-xs font-bold px-6 py-2.5 rounded-xl shadow-md shadow-teal-500/10 flex items-center gap-1.5 transition-colors ml-auto"
          >
            <FiCheckCircle />
            {updating ? 'Updating...' : 'Change Password'}
          </button>
        </form>
      </div>

      <div className="max-w-xl bg-white rounded-3xl border border-[#E6F4F2] p-6 shadow-sm">
        <div className="border-b border-gray-50 pb-4 mb-4">
          <h3 className="text-sm font-bold text-gray-800 border-l-4 border-[#10AFA5] pl-2 uppercase tracking-wide flex items-center gap-2">
            <FiShield className="text-[#10AFA5]" /> Security
          </h3>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          End all other active sessions for this company account. Your current session stays signed in.
        </p>
        <button
          type="button"
          disabled={loggingOutDevices}
          onClick={handleLogoutAllDevices}
          className="flex items-center gap-2 px-5 py-2.5 border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 text-xs font-bold rounded-xl transition-colors"
        >
          <FiLogOut />
          {loggingOutDevices ? 'Signing out…' : 'Logout all other devices'}
        </button>
      </div>
    </div>
  );
};

export default Settings;
