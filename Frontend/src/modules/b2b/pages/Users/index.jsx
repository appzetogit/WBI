import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { 
  FiUsers, FiUserPlus, FiUserCheck, FiUserX, FiMail, FiPhone, 
  FiSearch, FiFilter, FiDownload, FiMoreVertical, FiEdit2, 
  FiTrash2, FiActivity, FiRefreshCw, FiX, FiCheck, FiSettings, FiCheckCircle
} from 'react-icons/fi';
import api from '../../../../services/api';
import toast from 'react-hot-toast';

// Zod schema for validation
const userFormSchema = z.object({
  fullName: z.string().min(2, 'Full Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  mobile: z.string().regex(/^[0-9]{10}$/, 'Mobile must be exactly 10 digits'),
  role: z.string().min(1, 'Please select a role')
});

// Roles default permissions mapping
const DEFAULT_ROLE_PERMISSIONS = {
  'Company Admin': [
    'bulk_jobs.read', 'bulk_jobs.write',
    'jobs.read', 'jobs.write',
    'wallet.read', 'wallet.write',
    'invoices.read',
    'reports.read',
    'support.write',
    'users.manage',
    'company_profile.read', 'company_profile.write'
  ],
  'Operations Manager': [
    'bulk_jobs.read', 'bulk_jobs.write',
    'jobs.read', 'jobs.write',
    'support.write',
    'company_profile.read'
  ],
  'Finance User': [
    'wallet.read', 'wallet.write',
    'invoices.read',
    'reports.read',
    'company_profile.read'
  ],
  'Support User': [
    'support.write',
    'jobs.read',
    'company_profile.read'
  ],
  'Viewer': [
    'bulk_jobs.read',
    'jobs.read',
    'wallet.read',
    'invoices.read',
    'reports.read',
    'company_profile.read'
  ]
};

const ALL_PERMISSIONS = [
  { key: 'bulk_jobs.read', label: 'View Bulk Jobs', category: 'Bulk Jobs' },
  { key: 'bulk_jobs.write', label: 'Create Bulk Jobs', category: 'Bulk Jobs' },
  { key: 'jobs.read', label: 'View Jobs', category: 'My Jobs' },
  { key: 'jobs.write', label: 'Create/Edit Jobs', category: 'My Jobs' },
  { key: 'wallet.read', label: 'View Wallet & Balances', category: 'Wallet & Payments' },
  { key: 'wallet.write', label: 'Process Wallet Deductions/Topups', category: 'Wallet & Payments' },
  { key: 'invoices.read', label: 'View Invoices', category: 'Invoices' },
  { key: 'reports.read', label: 'View Reports', category: 'Reports' },
  { key: 'support.write', label: 'Manage Support Tickets', category: 'Support' },
  { key: 'company_profile.read', label: 'View Profile', category: 'Company Profile' },
  { key: 'company_profile.write', label: 'Edit Profile', category: 'Company Profile' },
  { key: 'users.manage', label: 'Manage B2B Users & Access', category: 'Users' }
];

const Users = () => {
  const queryClient = useQueryClient();
  
  // States
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  
  // Drawer States
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState('create'); // 'create' | 'edit'
  const [editingUserId, setEditingUserId] = useState(null);
  const [selectedPermissions, setSelectedPermissions] = useState([]);
  
  // Active User Dropdown state
  const [activeMenuId, setActiveMenuId] = useState(null);

  // Activity log state
  const [isActivityOpen, setIsActivityOpen] = useState(false);
  const [activityUserId, setActivityUserId] = useState(null);
  const [activityLogs, setActivityLogs] = useState([]);
  const [loadingActivity, setLoadingActivity] = useState(false);

  // Debounce search term
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // React Hook Form
  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm({
    defaultValues: {
      fullName: '',
      email: '',
      mobile: '',
      role: ''
    }
  });

  const selectedRole = watch('role');

  // Automatically update checkbox state when role changes (if in create mode or edit prefill)
  useEffect(() => {
    if (selectedRole && DEFAULT_ROLE_PERMISSIONS[selectedRole]) {
      setSelectedPermissions(DEFAULT_ROLE_PERMISSIONS[selectedRole]);
    }
  }, [selectedRole]);

  // Queries
  const { data: summaryData } = useQuery({
    queryKey: ['b2bUsersSummary'],
    queryFn: async () => {
      const res = await api.get('/b2b/users/summary');
      return res.data.data;
    }
  });

  const { data: listData, isLoading } = useQuery({
    queryKey: ['b2bUsersList', page, debouncedSearch, statusFilter, roleFilter],
    queryFn: async () => {
      const res = await api.get('/b2b/users', {
        params: {
          page,
          limit: 10,
          search: debouncedSearch,
          status: statusFilter,
          role: roleFilter
        }
      });
      return res.data;
    }
  });

  // Mutations
  const inviteMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.post('/b2b/users/invite', payload);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success('Invitation sent successfully!');
      if (data.inviteLink) {
        // Log to verify
        console.log('Invite Link generated:', data.inviteLink);
      }
      queryClient.invalidateQueries(['b2bUsersList']);
      queryClient.invalidateQueries(['b2bUsersSummary']);
      closeDrawer();
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to send invitation');
    }
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, payload }) => {
      const res = await api.patch(`/b2b/users/${id}`, payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success('User details updated successfully');
      queryClient.invalidateQueries(['b2bUsersList']);
      closeDrawer();
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to update user');
    }
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }) => {
      const res = await api.patch(`/b2b/users/${id}/status`, { status });
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'User status updated successfully');
      queryClient.invalidateQueries(['b2bUsersList']);
      queryClient.invalidateQueries(['b2bUsersSummary']);
      setActiveMenuId(null);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to update user status');
    }
  });

  const resendMutation = useMutation({
    mutationFn: async (id) => {
      const res = await api.post(`/b2b/users/${id}/resend-invite`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Invitation link resent successfully!');
      setActiveMenuId(null);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to resend invitation');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const res = await api.delete(`/b2b/users/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('User deleted successfully');
      queryClient.invalidateQueries(['b2bUsersList']);
      queryClient.invalidateQueries(['b2bUsersSummary']);
      setActiveMenuId(null);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to delete user');
    }
  });

  // Event Handlers
  const handleOpenCreateDrawer = () => {
    setDrawerMode('create');
    setEditingUserId(null);
    reset({
      fullName: '',
      email: '',
      mobile: '',
      role: 'Viewer'
    });
    setSelectedPermissions(DEFAULT_ROLE_PERMISSIONS['Viewer']);
    setIsDrawerOpen(true);
  };

  const handleOpenEditDrawer = (user) => {
    setDrawerMode('edit');
    setEditingUserId(user._id);
    reset({
      fullName: user.fullName,
      email: user.email,
      mobile: user.mobile,
      role: user.role
    });
    setSelectedPermissions(user.permissions || []);
    setIsDrawerOpen(true);
    setActiveMenuId(null);
  };

  const closeDrawer = () => {
    setIsDrawerOpen(false);
    reset();
  };

  const handleCheckboxChange = (key) => {
    if (selectedPermissions.includes(key)) {
      setSelectedPermissions(selectedPermissions.filter(p => p !== key));
    } else {
      setSelectedPermissions([...selectedPermissions, key]);
    }
  };

  const onFormSubmit = (data) => {
    const parsed = userFormSchema.safeParse(data);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }

    const payload = {
      fullName: data.fullName,
      email: data.email,
      mobile: data.mobile,
      role: data.role,
      permissions: selectedPermissions
    };

    if (drawerMode === 'create') {
      inviteMutation.mutate(payload);
    } else {
      editMutation.mutate({ id: editingUserId, payload });
    }
  };

  const toggleUserStatus = (user) => {
    const targetStatus = user.status === 'active' ? 'inactive' : 'active';
    statusMutation.mutate({ id: user._id, status: targetStatus });
  };

  const handleResendInvite = (userId) => {
    resendMutation.mutate(userId);
  };

  const handleDeleteUser = (userId) => {
    if (window.confirm('Are you sure you want to remove this user from your team?')) {
      deleteMutation.mutate(userId);
    }
  };

  const handleViewActivityLogs = async (user) => {
    setActivityUserId(user._id);
    setIsActivityOpen(true);
    setLoadingActivity(true);
    setActiveMenuId(null);
    try {
      const res = await api.get(`/b2b/users/${user._id}/activity`);
      if (res.data.success) {
        setActivityLogs(res.data.data);
      }
    } catch (err) {
      toast.error('Failed to load user activity logs');
    } finally {
      setLoadingActivity(false);
    }
  };

  const exportToCSV = () => {
    if (!listData || !listData.data || listData.data.length === 0) {
      toast.error('No users found to export');
      return;
    }

    const headers = ['Full Name', 'Email', 'Mobile', 'Role', 'Status', 'Last Login', 'Created At'];
    const rows = listData.data.map(usr => [
      usr.fullName,
      usr.email,
      usr.mobile,
      usr.role,
      usr.status,
      usr.lastLoginAt ? new Date(usr.lastLoginAt).toLocaleString() : 'Never',
      new Date(usr.createdAt).toLocaleString()
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.map(val => `"${val}"`).join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `b2b_users_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Users exported successfully!');
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 pb-20 pt-4">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-800 tracking-tight">Team Members</h1>
          <p className="text-xs text-gray-400 font-bold mt-1">Manage team members, roles, and granular access override permissions.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenCreateDrawer}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl text-white font-bold text-xs bg-[#10AFA5] hover:bg-[#0E9B92] transition-all shadow-md shadow-[#10AFA5]/10"
          >
            <FiUserPlus size={15} />
            <span>Invite Team Member</span>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-[#E6F4F2] shadow-sm flex items-center gap-4">
          <div className="h-10 w-10 bg-[#F0FDFA] rounded-2xl flex items-center justify-center text-[#10AFA5]">
            <FiUsers size={20} />
          </div>
          <div>
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Total Members</span>
            <span className="text-lg font-black text-gray-800">{summaryData?.total || 0}</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-emerald-50 shadow-sm flex items-center gap-4">
          <div className="h-10 w-10 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-500">
            <FiUserCheck size={20} />
          </div>
          <div>
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Active</span>
            <span className="text-lg font-black text-gray-800">{summaryData?.active || 0}</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-orange-50 shadow-sm flex items-center gap-4">
          <div className="h-10 w-10 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-500">
            <FiRefreshCw size={18} className="animate-spin-slow" />
          </div>
          <div>
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Pending Invite</span>
            <span className="text-lg font-black text-gray-800">{summaryData?.invited || 0}</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="h-10 w-10 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400">
            <FiUserX size={20} />
          </div>
          <div>
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Inactive / Blocked</span>
            <span className="text-lg font-black text-gray-800">{(summaryData?.inactive || 0) + (summaryData?.blocked || 0)}</span>
          </div>
        </div>
      </div>

      {/* Filters Board */}
      <div className="bg-white p-5 rounded-3xl border border-[#E6F4F2] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-1 flex-col md:flex-row gap-3">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search by name, email or mobile..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-100 focus:border-[#10AFA5] rounded-xl text-xs font-semibold outline-none transition-all"
            />
            <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400 font-extrabold uppercase">Status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold text-gray-700 focus:border-[#10AFA5] outline-none"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="invited">Pending Invite</option>
              <option value="inactive">Inactive</option>
              <option value="blocked">Blocked</option>
            </select>
          </div>

          {/* Role filter */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400 font-extrabold uppercase">Role</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold text-gray-700 focus:border-[#10AFA5] outline-none"
            >
              <option value="all">All Roles</option>
              <option value="Company Admin">Company Admin</option>
              <option value="Operations Manager">Operations Manager</option>
              <option value="Finance User">Finance User</option>
              <option value="Support User">Support User</option>
              <option value="Viewer">Viewer</option>
            </select>
          </div>
        </div>

        <button
          onClick={exportToCSV}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-100 text-gray-700 rounded-xl text-xs font-bold transition-all shrink-0"
        >
          <FiDownload size={14} />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-3xl border border-[#E6F4F2] shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center items-center py-24">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#10AFA5]"></div>
          </div>
        ) : !listData || listData.data.length === 0 ? (
          <div className="text-center py-20 space-y-4">
            <div className="h-16 w-16 mx-auto bg-gray-50 rounded-full flex items-center justify-center text-gray-300">
              <FiUsers size={32} />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-gray-700">No Members Found</h3>
              <p className="text-xs text-gray-400 mt-1">Try relaxing your search terms or filters.</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100">
                  <th className="py-4 px-6 text-[10px] uppercase font-bold text-gray-400 tracking-wider">User</th>
                  <th className="py-4 px-6 text-[10px] uppercase font-bold text-gray-400 tracking-wider">Contact</th>
                  <th className="py-4 px-6 text-[10px] uppercase font-bold text-gray-400 tracking-wider">Role</th>
                  <th className="py-4 px-6 text-[10px] uppercase font-bold text-gray-400 tracking-wider">Permissions</th>
                  <th className="py-4 px-6 text-[10px] uppercase font-bold text-gray-400 tracking-wider">Status</th>
                  <th className="py-4 px-6 text-[10px] uppercase font-bold text-gray-400 tracking-wider">Last Login</th>
                  <th className="py-4 px-6 text-[10px] uppercase font-bold text-gray-400 tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {listData.data.map((user) => (
                  <tr key={user._id} className="hover:bg-gray-50/30 transition-colors">
                    {/* User Profile info */}
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-[#F0FDFA] rounded-2xl flex items-center justify-center text-[#10AFA5] font-black text-sm border border-[#10AFA5]/10 shrink-0">
                          {user.fullName?.charAt(0)}
                        </div>
                        <div>
                          <h4 className="text-xs font-black text-gray-800">{user.fullName}</h4>
                          <span className="text-[9px] text-gray-400 font-bold block mt-0.5">ID: {user._id.substring(user._id.length - 8).toUpperCase()}</span>
                        </div>
                      </div>
                    </td>

                    {/* Contact Details */}
                    <td className="py-4 px-6">
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-1.5 text-gray-600 font-semibold">
                          <FiMail size={12} className="text-gray-400" />
                          <span>{user.email}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-gray-600 font-semibold">
                          <FiPhone size={12} className="text-gray-400" />
                          <span>{user.mobile}</span>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="py-4 px-6">
                      <span className="px-3 py-1 text-[10px] font-black text-gray-600 bg-gray-50 rounded-full border border-gray-100 inline-block">
                        {user.role}
                      </span>
                    </td>

                    {/* Permissions summary */}
                    <td className="py-4 px-6">
                      <div className="max-w-[200px] flex flex-wrap gap-1">
                        {user.permissions?.length === 0 ? (
                          <span className="text-[9px] text-gray-400 font-bold">No permissions</span>
                        ) : user.role === 'Company Admin' ? (
                          <span className="text-[9px] font-extrabold text-[#10AFA5] bg-[#F0FDFA] px-1.5 py-0.5 rounded">All Modules</span>
                        ) : (
                          <span className="text-[9px] font-extrabold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                            {user.permissions?.length} Modules
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Status Pill */}
                    <td className="py-4 px-6">
                      {user.status === 'active' && (
                        <span className="px-2 py-0.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 rounded border border-emerald-100">
                          Active
                        </span>
                      )}
                      {user.status === 'invited' && (
                        <span className="px-2 py-0.5 text-[10px] font-bold text-orange-600 bg-orange-50 rounded border border-orange-100">
                          Pending Invite
                        </span>
                      )}
                      {user.status === 'inactive' && (
                        <span className="px-2 py-0.5 text-[10px] font-bold text-gray-500 bg-gray-50 rounded border border-gray-200">
                          Inactive
                        </span>
                      )}
                      {user.status === 'blocked' && (
                        <span className="px-2 py-0.5 text-[10px] font-bold text-red-600 bg-red-50 rounded border border-red-100">
                          Blocked
                        </span>
                      )}
                    </td>

                    {/* Last Login */}
                    <td className="py-4 px-6 text-xs text-gray-500 font-semibold">
                      {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString('en-US', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Never'}
                    </td>

                    {/* Actions Menu */}
                    <td className="py-4 px-6 text-right relative">
                      <button
                        onClick={() => setActiveMenuId(activeMenuId === user._id ? null : user._id)}
                        className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-50 transition-colors"
                      >
                        <FiMoreVertical size={16} />
                      </button>

                      {activeMenuId === user._id && (
                        <>
                          {/* Backdrop to close */}
                          <div className="fixed inset-0 z-10" onClick={() => setActiveMenuId(null)} />
                          
                          {/* Dropdown Card */}
                          <div className="absolute right-6 mt-1 w-44 bg-white border border-gray-100 rounded-2xl shadow-xl py-2 z-20 text-left space-y-0.5">
                            <button
                              onClick={() => handleOpenEditDrawer(user)}
                              className="w-full px-4 py-2 text-left text-xs font-bold text-gray-700 hover:bg-[#F0FDFA] hover:text-[#10AFA5] flex items-center gap-2 transition-all"
                            >
                              <FiEdit2 size={13} />
                              <span>Edit Member</span>
                            </button>
                            
                            {user.status === 'invited' && (
                              <button
                                onClick={() => handleResendInvite(user._id)}
                                className="w-full px-4 py-2 text-left text-xs font-bold text-orange-600 hover:bg-orange-50/50 flex items-center gap-2 transition-all"
                              >
                                <FiRefreshCw size={13} />
                                <span>Resend Invitation</span>
                              </button>
                            )}

                            {user.status !== 'invited' && (
                              <button
                                onClick={() => toggleUserStatus(user)}
                                className={`w-full px-4 py-2 text-left text-xs font-bold flex items-center gap-2 transition-all ${
                                  user.status === 'active' ? 'text-gray-500 hover:bg-gray-50' : 'text-emerald-600 hover:bg-emerald-50/30'
                                }`}
                              >
                                {user.status === 'active' ? <FiUserX size={13} /> : <FiUserCheck size={13} />}
                                <span>{user.status === 'active' ? 'Deactivate' : 'Activate'}</span>
                              </button>
                            )}

                            <button
                              onClick={() => handleViewActivityLogs(user)}
                              className="w-full px-4 py-2 text-left text-xs font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-all"
                            >
                              <FiActivity size={13} />
                              <span>View Logs</span>
                            </button>

                            <div className="h-px bg-gray-100 my-1" />

                            <button
                              onClick={() => handleDeleteUser(user._id)}
                              className="w-full px-4 py-2 text-left text-xs font-bold text-red-500 hover:bg-red-50 flex items-center gap-2 transition-all"
                            >
                              <FiTrash2 size={13} />
                              <span>Remove Member</span>
                            </button>
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Table Pagination */}
        {listData && listData.pagination && listData.pagination.pages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4 bg-white">
            <span className="text-xs text-gray-400 font-bold">
              Showing page {page} of {listData.pagination.pages} ({listData.pagination.total} entries)
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3.5 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-100 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-xs font-bold text-gray-600 transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(listData.pagination.pages, p + 1))}
                disabled={page === listData.pagination.pages}
                className="px-3.5 py-1.5 bg-[#10AFA5] hover:bg-[#0E9B92] rounded-xl text-xs font-bold text-white transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit User Drawer (Slide-out) */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/30 backdrop-blur-xs transition-opacity" onClick={closeDrawer} />
          
          <div className="absolute inset-y-0 right-0 max-w-full flex">
            <div className="w-screen max-w-lg bg-white shadow-2xl flex flex-col justify-between">
              
              {/* Drawer Header */}
              <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-gray-800">
                    {drawerMode === 'create' ? 'Invite Team Member' : 'Edit Member Details'}
                  </h3>
                  <p className="text-[10px] text-gray-400 font-bold mt-0.5">
                    {drawerMode === 'create' ? 'Send a setup invite link with assigned permissions.' : 'Configure profile details and overrides.'}
                  </p>
                </div>
                <button onClick={closeDrawer} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-50">
                  <FiX size={18} />
                </button>
              </div>

              {/* Drawer Body (Scrollable form) */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <form onSubmit={handleSubmit(onFormSubmit)} id="user-drawer-form" className="space-y-4">
                  {/* Full Name */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Full Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Rahul Sharma"
                      {...register('fullName', { required: true })}
                      className="w-full px-4 py-2.5 border border-gray-200 focus:border-[#10AFA5] rounded-xl text-xs font-semibold outline-none transition-all"
                    />
                  </div>

                  {/* Email Address */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Email Address</label>
                    <input
                      type="email"
                      placeholder="e.g. rahul@company.com"
                      {...register('email', { required: true })}
                      disabled={drawerMode === 'edit'}
                      className="w-full px-4 py-2.5 border border-gray-200 focus:border-[#10AFA5] rounded-xl text-xs font-semibold outline-none transition-all disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                    />
                  </div>

                  {/* Mobile Number */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Mobile Number</label>
                    <input
                      type="tel"
                      placeholder="10-digit mobile number"
                      {...register('mobile', { required: true })}
                      className="w-full px-4 py-2.5 border border-gray-200 focus:border-[#10AFA5] rounded-xl text-xs font-semibold outline-none transition-all"
                    />
                  </div>

                  {/* Role Dropdown */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Role Matrix</label>
                    <select
                      {...register('role', { required: true })}
                      className="w-full px-4 py-2.5 border border-gray-200 focus:border-[#10AFA5] rounded-xl text-xs font-bold text-gray-700 outline-none transition-all"
                    >
                      <option value="Viewer">Viewer</option>
                      <option value="Support User">Support User</option>
                      <option value="Finance User">Finance User</option>
                      <option value="Operations Manager">Operations Manager</option>
                      <option value="Company Admin">Company Admin</option>
                    </select>
                  </div>
                </form>

                {/* Custom Override Permissions Section */}
                <div className="space-y-3 border-t border-gray-100 pt-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-black text-gray-800">Module Access Control</h4>
                      <p className="text-[9px] text-gray-400 font-bold">Customize overrides from default role mappings.</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {/* Group by category for visual cleanliness */}
                    {['Bulk Jobs', 'My Jobs', 'Wallet & Payments', 'Invoices', 'Reports', 'Support', 'Company Profile', 'Users'].map((cat) => {
                      const items = ALL_PERMISSIONS.filter(p => p.category === cat);
                      if (items.length === 0) return null;

                      return (
                        <div key={cat} className="space-y-2 border border-gray-50 rounded-2xl p-3 bg-gray-50/30">
                          <span className="text-[9px] uppercase font-extrabold text-gray-400 tracking-wider block border-b border-gray-50 pb-1">{cat}</span>
                          <div className="grid grid-cols-1 gap-2 pt-1">
                            {items.map((perm) => (
                              <label key={perm.key} className="flex items-center gap-2 cursor-pointer group">
                                <input
                                  type="checkbox"
                                  checked={selectedPermissions.includes(perm.key)}
                                  onChange={() => handleCheckboxChange(perm.key)}
                                  disabled={selectedRole === 'Company Admin'} // Admin has absolute permission, no bypass allowed
                                  className="h-3.5 w-3.5 text-[#10AFA5] rounded border-gray-300 focus:ring-[#10AFA5]"
                                />
                                <span className="text-[11px] text-gray-600 font-semibold group-hover:text-gray-800 transition-colors">
                                  {perm.label}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Drawer Footer */}
              <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 bg-gray-50/50">
                <button
                  type="button"
                  onClick={closeDrawer}
                  className="px-4 py-2 border border-gray-200 text-gray-600 rounded-xl text-xs font-bold hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="user-drawer-form"
                  disabled={inviteMutation.isPending || editMutation.isPending}
                  className="px-5 py-2 bg-[#10AFA5] hover:bg-[#0E9B92] disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-[#10AFA5]/10"
                >
                  {drawerMode === 'create' ? 'Send Invitation' : 'Save Details'}
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Activity Logs Slide-out Drawer */}
      {isActivityOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/30 backdrop-blur-xs transition-opacity" onClick={() => setIsActivityOpen(false)} />
          
          <div className="absolute inset-y-0 right-0 max-w-full flex">
            <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col justify-between">
              
              {/* Drawer Header */}
              <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-gray-800">User Audit Logs</h3>
                  <p className="text-[10px] text-gray-400 font-bold mt-0.5">Historical log of security activities for compliance.</p>
                </div>
                <button onClick={() => setIsActivityOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-50">
                  <FiX size={18} />
                </button>
              </div>

              {/* Drawer Body */}
              <div className="flex-1 overflow-y-auto p-6">
                {loadingActivity ? (
                  <div className="flex justify-center items-center py-20">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#10AFA5]"></div>
                  </div>
                ) : activityLogs.length === 0 ? (
                  <div className="text-center py-20 space-y-3">
                    <FiActivity size={24} className="mx-auto text-gray-300" />
                    <p className="text-xs text-gray-400 font-bold">No activity history logs found for this user.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {activityLogs.map((log, idx) => (
                      <div key={log._id || idx} className="border-l-2 border-[#10AFA5] pl-3 py-1.5 space-y-1">
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide bg-gray-50 px-1 py-0.5 rounded border border-gray-100">
                          {log.module}
                        </span>
                        <p className="text-xs font-semibold text-gray-700 leading-normal">{log.action}</p>
                        <div className="flex items-center justify-between gap-2 pt-0.5">
                          <span className="text-[9px] text-gray-400 font-bold">
                            IP: {log.ipAddress || 'Unknown'}
                          </span>
                          <span className="text-[9px] text-gray-400 font-bold text-right">
                            {new Date(log.createdAt).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Drawer Footer */}
              <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end bg-gray-50/50">
                <button
                  type="button"
                  onClick={() => setIsActivityOpen(false)}
                  className="px-5 py-2 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                >
                  Close Logs
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Users;
