import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { 
  FiUser, FiBriefcase, FiMapPin, FiMail, FiPhone, FiLock, 
  FiAlertCircle, FiCheck, FiX, FiCheckCircle, FiUpload, 
  FiFileText, FiTrash2, FiEye, FiSettings, FiActivity, 
  FiKey, FiBell, FiChevronRight, FiHelpCircle, FiCreditCard
} from 'react-icons/fi';
import api from '../../../../services/api';
import toast from 'react-hot-toast';

// Zod Validation Schemas
const companySchema = z.object({
  companyName: z.string().min(1, 'Company Name is required'),
  companyType: z.string().min(1, 'Company Type is required'),
  gstNumber: z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GST format (e.g. 07AABCT1234Q1Z5)'),
  panNumber: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN format (e.g. AABCT1234Q)'),
  tanNumber: z.string().regex(/^[A-Z]{4}[0-9]{5}[A-Z]{1}$/, 'Invalid TAN format (e.g. DELT12345G)'),
  cinNumber: z.string().optional().or(z.literal('')),
  incorporationDate: z.string().optional().or(z.literal('')),
  companyEmail: z.string().email('Invalid Email Address'),
  companyPhone: z.string().min(10, 'Phone must be at least 10 digits')
});

const contactPersonSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  designation: z.string().min(1, 'Designation is required'),
  email: z.string().email('Invalid Email Address'),
  phone: z.string().min(10, 'Mobile must be at least 10 digits'),
  altPhone: z.string().optional().or(z.literal(''))
});

const addressSchema = z.object({
  registeredAddress: z.string().min(1, 'Registered address is required'),
  billingAddress: z.string().min(1, 'Billing address is required'),
  sameAsRegistered: z.boolean().optional()
});

const bankSchema = z.object({
  accountHolderName: z.string().min(1, 'Account holder name is required'),
  accountNumber: z.string().min(9, 'Account number must be at least 9 digits'),
  ifscCode: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC code format (e.g. HDFC0001234)'),
  bankName: z.string().min(1, 'Bank name is required'),
  branchName: z.string().min(1, 'Branch name is required')
});

const passwordSchema = z.object({
  currentPassword: z.string().min(6, 'Current password must be at least 6 characters'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters')
});

const Profile = () => {
  const queryClient = useQueryClient();
  const [activeModal, setActiveModal] = useState(null); // 'profile' | 'contact' | 'address' | 'branches' | 'bank' | 'password' | 'notifications'
  const [logoUploading, setLogoUploading] = useState(false);
  const [docUploadingType, setDocUploadingType] = useState(null);
  
  const [notifPrefs, setNotifPrefs] = useState({
    email: true,
    sms: true,
    push: false
  });

  // React Query: Fetch Profile Data
  const { data: profileData, isLoading, isError, refetch } = useQuery({
    queryKey: ['b2bProfile'],
    queryFn: async () => {
      const res = await api.get('/b2b/company-profile');
      if (!res.data.success) throw new Error('Failed to fetch profile');
      return res.data.company;
    }
  });

  useEffect(() => {
    const p = profileData?.notificationPreferences;
    if (p && typeof p === 'object') {
      setNotifPrefs({
        email: p.email !== false,
        sms: p.sms !== false,
        push: !!p.push
      });
    }
  }, [profileData]);

  // React Query: Fetch Active Sessions
  const { data: sessionData } = useQuery({
    queryKey: ['b2bSessions'],
    queryFn: async () => {
      const res = await api.get('/b2b/company-profile/sessions');
      return res.data.sessions || [];
    },
    enabled: !!profileData
  });

  // React Hook Forms Setup
  const profileForm = useForm();
  const contactForm = useForm();
  const addressForm = useForm();
  const bankForm = useForm();
  const passwordForm = useForm();
  const branchForm = useForm();

  // Mutations
  const updateNotifPrefsMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.patch('/b2b/company-profile/notification-preferences', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['b2bProfile'] });
      toast.success('Notification preferences saved');
      setActiveModal(null);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to save preferences')
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.patch('/b2b/company-profile', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['b2bProfile'] });
      toast.success('Company profile updated successfully!');
      setActiveModal(null);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to update profile');
    }
  });

  const updateContactMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.patch('/b2b/company-profile/contact-person', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['b2bProfile'] });
      toast.success('Contact person updated successfully!');
      setActiveModal(null);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to update contact');
    }
  });

  const updateAddressMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.patch('/b2b/company-profile/address', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['b2bProfile'] });
      toast.success('Addresses updated successfully!');
      setActiveModal(null);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to update address');
    }
  });

  const saveBankMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.patch('/b2b/company-profile/bank', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['b2bProfile'] });
      toast.success('Bank details saved successfully!');
      setActiveModal(null);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to save bank details');
    }
  });

  const pennyDropMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/b2b/company-profile/bank/verify');
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['b2bProfile'] });
      toast.success('Penny Drop Verification Successful!');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Penny Drop verification failed');
    }
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.patch('/b2b/company-profile/change-password', payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Password updated successfully!');
      setActiveModal(null);
      passwordForm.reset();
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to update password');
    }
  });

  const logoutSessionsMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/b2b/company-profile/logout-all-devices');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['b2bSessions'] });
      toast.success('Successfully logged out of all other sessions');
    },
    onError: (err) => {
      toast.error('Failed to log out of other sessions');
    }
  });

  const addBranchMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.post('/b2b/company-profile/branches', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['b2bProfile'] });
      toast.success('Branch added successfully!');
      branchForm.reset();
    },
    onError: (err) => {
      toast.error('Failed to add branch');
    }
  });

  const removeBranchMutation = useMutation({
    mutationFn: async (branchId) => {
      const res = await api.delete(`/b2b/company-profile/branches/${branchId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['b2bProfile'] });
      toast.success('Branch deleted successfully');
    },
    onError: () => {
      toast.error('Failed to delete branch');
    }
  });

  // Handle Logo Upload
  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setLogoUploading(true);
    try {
      const res = await api.post('/b2b/company-profile/logo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data.success) {
        queryClient.invalidateQueries({ queryKey: ['b2bProfile'] });
        toast.success('Company logo updated successfully!');
      }
    } catch (err) {
      toast.error('Failed to upload logo');
    } finally {
      setLogoUploading(false);
    }
  };

  // Handle Document Upload
  const handleDocumentUpload = async (e, docType, docId = null) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('documentType', docType);

    setDocUploadingType(docType);
    try {
      let res;
      if (docId) {
        res = await api.post(`/b2b/company-profile/documents/${docId}/reupload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } else {
        res = await api.post('/b2b/company-profile/documents', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }
      if (res.data.success) {
        queryClient.invalidateQueries({ queryKey: ['b2bProfile'] });
        toast.success('Document uploaded successfully!');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to upload document');
    } finally {
      setDocUploadingType(null);
    }
  };

  // Open modals with pre-filled details
  const openEditProfile = () => {
    profileForm.reset({
      companyName: profileData?.companyName || '',
      companyType: profileData?.companyType || '',
      gstNumber: profileData?.gstNumber || '',
      panNumber: profileData?.panNumber || '',
      tanNumber: profileData?.tanNumber || '',
      cinNumber: profileData?.cinNumber || '',
      incorporationDate: profileData?.incorporationDate ? new Date(profileData.incorporationDate).toISOString().split('T')[0] : '',
      companyEmail: profileData?.companyEmail || profileData?.email || '',
      companyPhone: profileData?.companyPhone || profileData?.phone || ''
    });
    setActiveModal('profile');
  };

  const openEditContact = () => {
    contactForm.reset({
      name: profileData?.authorizedPerson?.name || '',
      designation: profileData?.authorizedPerson?.designation || '',
      email: profileData?.authorizedPerson?.email || '',
      phone: profileData?.authorizedPerson?.phone || '',
      altPhone: profileData?.authorizedPerson?.altPhone || ''
    });
    setActiveModal('contact');
  };

  const openEditAddress = () => {
    addressForm.reset({
      registeredAddress: profileData?.companyAddress || '',
      billingAddress: profileData?.billingAddress || '',
      sameAsRegistered: profileData?.companyAddress === profileData?.billingAddress
    });
    setActiveModal('address');
  };

  const openEditBank = () => {
    bankForm.reset({
      accountHolderName: profileData?.bankAccount?.accountHolderName || '',
      accountNumber: '', // Keep empty for input safety
      ifscCode: profileData?.bankAccount?.ifscCode || '',
      bankName: profileData?.bankAccount?.bankName || '',
      branchName: profileData?.bankAccount?.branchName || ''
    });
    setActiveModal('bank');
  };

  // Submit handers
  const onSubmitProfile = (data) => {
    const parsed = companySchema.safeParse(data);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    updateProfileMutation.mutate(data);
  };

  const onSubmitContact = (data) => {
    const parsed = contactPersonSchema.safeParse(data);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    updateContactMutation.mutate(data);
  };

  const onSubmitAddress = (data) => {
    const parsed = addressSchema.safeParse(data);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    const payload = {
      registeredAddress: data.registeredAddress,
      billingAddress: data.sameAsRegistered ? data.registeredAddress : data.billingAddress
    };
    updateAddressMutation.mutate(payload);
  };

  const onSubmitBank = (data) => {
    const parsed = bankSchema.safeParse(data);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    saveBankMutation.mutate(data);
  };

  const onSubmitPassword = (data) => {
    const parsed = passwordSchema.safeParse(data);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    changePasswordMutation.mutate(data);
  };

  const onAddBranchSubmit = (data) => {
    if (!data.branchName || !data.address || !data.city || !data.state || !data.pincode || !data.contactPerson || !data.contactPhone) {
      toast.error('Please fill all branch fields');
      return;
    }
    addBranchMutation.mutate(data);
  };

  // Skeleton Loader for initial fetch
  if (isLoading) {
    return (
      <div className="p-6 space-y-6 animate-pulse max-w-7xl mx-auto">
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <div className="h-6 w-48 bg-gray-200 rounded-lg"></div>
            <div className="h-4 w-32 bg-gray-200 rounded-lg"></div>
          </div>
          <div className="h-10 w-28 bg-gray-200 rounded-xl"></div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="h-64 bg-gray-100 rounded-3xl"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="h-48 bg-gray-100 rounded-3xl"></div>
              <div className="h-48 bg-gray-100 rounded-3xl"></div>
            </div>
            <div className="h-48 bg-gray-100 rounded-3xl"></div>
          </div>
          <div className="space-y-6">
            <div className="h-40 bg-gray-100 rounded-3xl"></div>
            <div className="h-56 bg-gray-100 rounded-3xl"></div>
            <div className="h-64 bg-gray-100 rounded-3xl"></div>
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
        <FiAlertCircle className="w-14 h-14 text-red-500 mb-4 animate-bounce" />
        <h2 className="text-xl font-bold text-gray-800 mb-2">Error Loading Profile</h2>
        <p className="text-gray-500 mb-6 max-w-sm">We ran into an issue while retrieving your company details. Please try reloading.</p>
        <button onClick={refetch} className="px-6 py-2.5 bg-[#10AFA5] text-white font-bold rounded-xl hover:opacity-90 shadow-md">
          Reload Profile
        </button>
      </div>
    );
  }

  // Verification status configurations
  const statusConfig = {
    pending: { label: 'Pending', color: 'bg-yellow-50 border-yellow-100 text-yellow-700', icon: '⏳' },
    verified: { label: 'Verified', color: 'bg-emerald-50 border-emerald-100 text-emerald-700', icon: '✅' },
    approved: { label: 'Approved', color: 'bg-emerald-50 border-emerald-100 text-emerald-700', icon: '✅' },
    rejected: { label: 'Rejected', color: 'bg-rose-50 border-rose-100 text-rose-700', icon: '❌' }
  };

  const currentStatus = statusConfig[profileData?.verificationStatus?.toLowerCase()] || statusConfig.pending;

  // Documents list template mapping
  const docLabels = {
    gstCertificate: 'GST Certificate',
    panCard: 'PAN Card',
    companyRegistrationCertificate: 'Registration Certificate',
    cancelledCheque: 'Cancelled Cheque',
    addressProof: 'Address Proof'
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto text-[#1F2937]">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Company Profile</h1>
          <p className="text-xs text-gray-500 mt-1">Manage your company information, authorized signatures, bank details, and compliance documents.</p>
        </div>
        <button 
          onClick={openEditProfile}
          className="bg-[#10AFA5] hover:bg-[#0D9488] text-white text-xs font-bold px-5 py-2.5 rounded-xl flex items-center gap-1.5 shadow-md shadow-teal-500/10 transition-all duration-300"
        >
          <FiSettings className="w-4 h-4" />
          Edit Profile
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: Main Profile Cards */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Section 1: Company Details */}
          <div className="bg-white rounded-3xl border border-[#E6F4F2] p-6 shadow-sm relative overflow-hidden">
            <div className="flex flex-col md:flex-row gap-6 items-start">
              
              {/* Logo Box */}
              <div className="flex flex-col items-center gap-3 shrink-0">
                <div className="w-28 h-28 rounded-2xl border border-gray-100 bg-gray-50/50 p-2 flex items-center justify-center relative overflow-hidden group shadow-inner">
                  {profileData?.logoUrl ? (
                    <img src={profileData.logoUrl} alt="Logo" className="max-w-full max-h-full object-contain rounded-xl" />
                  ) : (
                    <div className="text-center text-gray-300 text-xs font-bold">
                      <FiBriefcase className="w-8 h-8 mx-auto mb-1 text-gray-200" />
                      WBI Logo
                    </div>
                  )}
                  {logoUploading && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  )}
                </div>
                <label className="cursor-pointer bg-gray-50 hover:bg-gray-100 border border-gray-200 text-[10px] font-bold text-gray-600 px-3 py-1.5 rounded-lg transition-all text-center">
                  Change Logo
                  <input type="file" onChange={handleLogoUpload} accept="image/*" className="hidden" />
                </label>
              </div>

              {/* Core Details Grid */}
              <div className="flex-1 space-y-4 w-full">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold text-gray-800 capitalize">{profileData?.companyName}</h2>
                    <span className="bg-teal-50 text-[#10AFA5] text-[10px] font-bold px-2.5 py-0.5 rounded-full capitalize border border-teal-100">
                      {profileData?.companyType || 'Private Limited'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Authorized corporate business partner profile details.</p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-gray-50/50 rounded-2xl p-4 border border-gray-50">
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">GST Number</p>
                    <p className="text-xs font-bold text-gray-700 mt-0.5">{profileData?.gstNumber || '--'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">PAN Number</p>
                    <p className="text-xs font-bold text-gray-700 mt-0.5">{profileData?.panNumber || '--'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">TAN Number</p>
                    <p className="text-xs font-bold text-gray-700 mt-0.5">{profileData?.tanNumber || '--'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">CIN Number</p>
                    <p className="text-xs font-bold text-gray-700 mt-0.5">{profileData?.cinNumber || '--'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <p className="text-[10px] text-gray-400 font-bold">Incorporation Date</p>
                    <p className="font-bold text-gray-700 mt-0.5">
                      {profileData?.incorporationDate ? new Date(profileData.incorporationDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '--'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 font-bold">Company Email</p>
                    <p className="font-bold text-gray-700 mt-0.5 break-all">{profileData?.companyEmail || profileData?.email}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 font-bold">Company Phone</p>
                    <p className="font-bold text-gray-700 mt-0.5">{profileData?.companyPhone || profileData?.phone}</p>
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* Section 2: Contact Person & Address details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Contact Person */}
            <div className="bg-white rounded-3xl border border-[#E6F4F2] p-6 shadow-sm flex flex-col justify-between">
              <div className="flex justify-between items-start border-b border-gray-50 pb-3.5">
                <div>
                  <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider border-l-3 border-[#10AFA5] pl-2">Contact Person</h3>
                  <p className="text-[10px] text-gray-400 mt-0.5">Primary business coordinator details</p>
                </div>
                <button onClick={openEditContact} className="text-[#10AFA5] hover:underline text-xs font-bold flex items-center gap-1">
                  ✏️ Edit
                </button>
              </div>

              <div className="py-4 space-y-3.5 flex-1">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-teal-50/80 flex items-center justify-center text-[#10AFA5] text-sm font-bold">
                    {profileData?.authorizedPerson?.name?.slice(0, 2).toUpperCase() || 'CP'}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-bold text-gray-800 capitalize">{profileData?.authorizedPerson?.name}</p>
                      <span className="bg-teal-50 text-[#10AFA5] text-[9px] font-bold px-1.5 py-0.5 rounded">Authorized</span>
                    </div>
                    <p className="text-[10px] text-gray-400 font-medium capitalize mt-0.5">{profileData?.authorizedPerson?.designation || 'Coordinator'}</p>
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-gray-600">
                    <FiMail className="text-[#10AFA5] shrink-0" />
                    <span className="break-all">{profileData?.authorizedPerson?.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <FiPhone className="text-[#10AFA5] shrink-0" />
                    <span>{profileData?.authorizedPerson?.phone}</span>
                  </div>
                  {profileData?.authorizedPerson?.altPhone && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1 rounded shrink-0">WA</span>
                      <span>{profileData?.authorizedPerson?.altPhone}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Address details */}
            <div className="bg-white rounded-3xl border border-[#E6F4F2] p-6 shadow-sm flex flex-col justify-between">
              <div className="flex justify-between items-start border-b border-gray-50 pb-3.5">
                <div>
                  <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider border-l-3 border-[#10AFA5] pl-2">Address Details</h3>
                  <p className="text-[10px] text-gray-400 mt-0.5">Corporate office & billing ledger</p>
                </div>
                <button onClick={openEditAddress} className="text-[#10AFA5] hover:underline text-xs font-bold flex items-center gap-1">
                  ✏️ Edit
                </button>
              </div>

              <div className="py-4 space-y-3.5 flex-1 text-xs">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Registered Office</p>
                  <p className="text-gray-700 mt-1 leading-relaxed capitalize">{profileData?.companyAddress}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Billing Office</p>
                  <p className="text-gray-700 mt-1 leading-relaxed capitalize">{profileData?.billingAddress}</p>
                </div>
              </div>

              <div className="flex justify-between items-center border-t border-gray-50 pt-3">
                <span className="text-[10px] font-bold text-gray-400 flex items-center gap-1">
                  📍 {profileData?.branches?.length || 0} Office Locations
                </span>
                <button onClick={() => setActiveModal('branches')} className="text-[#10AFA5] text-xs font-bold hover:underline">
                  View All
                </button>
              </div>
            </div>

          </div>

          {/* Section 3: Documents Upload Grid */}
          <div className="bg-white rounded-3xl border border-[#E6F4F2] p-6 shadow-sm">
            <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider border-l-3 border-[#10AFA5] pl-2 mb-6">Documents</h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
              {Object.keys(docLabels).map(docType => {
                const doc = profileData?.documents?.find(d => d.documentType === docType);
                const isUploading = docUploadingType === docType;
                
                return (
                  <div key={docType} className="border border-gray-50 bg-gray-50/50 rounded-2xl p-4 flex flex-col justify-between items-center text-center space-y-3 min-h-[160px]">
                    <div className="w-10 h-10 rounded-full bg-teal-50 flex items-center justify-center text-[#10AFA5]">
                      <FiFileText className="w-5 h-5" />
                    </div>
                    
                    <div>
                      <p className="text-[10px] font-bold text-gray-700 leading-tight line-clamp-2">{docLabels[docType]}</p>
                      {doc ? (
                        <span className={`inline-block text-[8px] font-bold px-1.5 py-0.5 rounded mt-1.5 capitalize ${
                          doc.status === 'verified' ? 'bg-emerald-50 text-emerald-600' :
                          doc.status === 'rejected' ? 'bg-rose-50 text-rose-600' : 'bg-yellow-50 text-yellow-600'
                        }`}>
                          {doc.status}
                        </span>
                      ) : (
                        <span className="inline-block text-[8px] font-bold px-1.5 py-0.5 rounded mt-1.5 bg-gray-100 text-gray-400">
                          Not Uploaded
                        </span>
                      )}
                    </div>

                    <div className="w-full">
                      {isUploading ? (
                        <div className="w-5 h-5 border-2 border-[#10AFA5] border-t-transparent rounded-full animate-spin mx-auto"></div>
                      ) : doc ? (
                        <div className="flex flex-col gap-1 w-full">
                          <a 
                            href={doc.fileUrl} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="bg-white hover:bg-gray-100 text-[#10AFA5] border border-gray-200 text-[10px] font-bold py-1 rounded-lg w-full transition-colors inline-block"
                          >
                            View
                          </a>
                          {doc.status === 'rejected' && (
                            <label className="bg-red-50 hover:bg-red-100 text-red-600 text-[9px] font-bold py-1 rounded-lg w-full cursor-pointer transition-colors block">
                              Re-upload
                              <input type="file" onChange={(e) => handleDocumentUpload(e, docType, doc._id)} accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden" />
                            </label>
                          )}
                        </div>
                      ) : (
                        <label className="bg-white hover:bg-gray-100 text-[#10AFA5] border border-gray-200 text-[10px] font-bold py-1 px-2 rounded-lg w-full cursor-pointer transition-colors block">
                          Upload
                          <input type="file" onChange={(e) => handleDocumentUpload(e, docType)} accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden" />
                        </label>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div className="mt-6 text-center">
              <label className="bg-[#10AFA5] hover:bg-[#0D9488] text-white text-xs font-bold px-6 py-2.5 rounded-xl cursor-pointer shadow-md inline-flex items-center gap-1.5">
                <FiUpload className="w-4 h-4" />
                Upload New Document
                <input type="file" onChange={(e) => handleDocumentUpload(e, 'gstCertificate')} accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden" />
              </label>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: Verification, Bank, Settings */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Section 4: Verification Status Widget */}
          <div className="bg-white rounded-3xl border border-[#E6F4F2] p-6 shadow-sm text-center relative overflow-hidden">
            <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto text-xl font-bold shadow-sm">
              {currentStatus.icon}
            </div>
            <h3 className="text-sm font-bold text-gray-800 mt-3">{currentStatus.label}</h3>
            <p className="text-[11px] text-gray-400 mt-1 max-w-[200px] mx-auto leading-relaxed">
              {profileData?.verificationStatus === 'verified' || profileData?.verificationStatus === 'approved' 
                ? 'Your company profile is verified. Access to bulk booking is fully active.'
                : 'Registration documents are pending administrative validation review.'}
            </p>

            <div className="border-t border-gray-50 mt-5 pt-4 space-y-2 text-left text-xs">
              <div className="flex justify-between">
                <span className="text-gray-400 font-medium">Verified On</span>
                <span className="font-bold text-gray-700">
                  {profileData?.verifiedOn ? new Date(profileData.verifiedOn).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : (profileData?.verificationStatus === 'approved' ? 'Approved' : '—')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 font-medium">Verified By</span>
                <span className="font-bold text-gray-700">{profileData?.verifiedBy || (profileData?.verificationStatus === 'approved' ? 'WBI Admin' : '—')}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400 font-medium">Status</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded capitalize ${currentStatus.color}`}>
                  {profileData?.verificationStatus}
                </span>
              </div>
              {profileData?.rejectionReason && (
                <div className="bg-red-50 text-red-700 p-2.5 rounded-xl border border-red-100 mt-3 text-[11px]">
                  <p className="font-bold">Rejection Reason:</p>
                  <p className="mt-0.5 font-medium leading-relaxed">{profileData.rejectionReason}</p>
                </div>
              )}
            </div>
          </div>

          {/* Section 5: Bank Details */}
          <div className="bg-white rounded-3xl border border-[#E6F4F2] p-6 shadow-sm relative">
            <div className="flex justify-between items-center border-b border-gray-50 pb-3">
              <div>
                <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider border-l-3 border-[#10AFA5] pl-2">Bank Details</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">Payout routing settings</p>
              </div>
              <button onClick={openEditBank} className="text-[#10AFA5] hover:underline text-xs font-bold flex items-center gap-1">
                ✏️ Edit
              </button>
            </div>

            {profileData?.bankAccount ? (
              <div className="py-4 space-y-3.5 text-xs">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Account Holder Name</p>
                  <p className="font-bold text-gray-700 mt-0.5 capitalize">{profileData.bankAccount.accountHolderName}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Account Number</p>
                  <p className="font-bold text-gray-700 mt-0.5">{profileData.bankAccount.accountNumberMasked}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">IFSC Code</p>
                    <p className="font-bold text-gray-700 mt-0.5">{profileData.bankAccount.ifscCode}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Bank Name</p>
                    <p className="font-bold text-gray-700 mt-0.5 capitalize">{profileData.bankAccount.bankName}</p>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Branch</p>
                  <p className="font-bold text-gray-700 mt-0.5 capitalize">{profileData.bankAccount.branchName}</p>
                </div>
                <div className="flex justify-between items-center border-t border-gray-50 pt-3.5 mt-2">
                  <span className="text-[10px] font-bold text-gray-400">Verification Status</span>
                  {profileData.bankAccount.verificationStatus === 'verified' ? (
                    <span className="bg-emerald-50 text-emerald-600 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-100">Verified</span>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="bg-yellow-50 text-yellow-600 text-[10px] font-bold px-2 py-0.5 rounded-full border border-yellow-100">Unverified</span>
                      <button 
                        onClick={() => pennyDropMutation.mutate()}
                        disabled={pennyDropMutation.isPending}
                        className="bg-[#10AFA5] hover:bg-[#0D9488] text-white text-[9px] font-bold px-2 py-1 rounded shadow-sm disabled:opacity-50"
                      >
                        {pennyDropMutation.isPending ? 'Verifying...' : 'Verify Now'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-xs space-y-3">
                <FiCreditCard className="w-10 h-10 mx-auto text-gray-200" />
                <p className="text-gray-400 font-bold">No Bank Details Saved</p>
                <button onClick={openEditBank} className="bg-[#10AFA5]/10 hover:bg-[#10AFA5]/25 text-[#10AFA5] text-xs font-bold px-4 py-1.5 rounded-lg transition-colors">
                  Add Bank Details
                </button>
              </div>
            )}
          </div>

          {/* Section 6: Account Settings */}
          <div className="bg-white rounded-3xl border border-[#E6F4F2] p-6 shadow-sm">
            <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider border-l-3 border-[#10AFA5] pl-2 mb-4">Account Settings</h3>
            
            <div className="space-y-1">
              <button 
                onClick={() => setActiveModal('password')}
                className="w-full flex justify-between items-center py-3 text-xs font-bold text-gray-600 hover:text-gray-900 border-b border-gray-50 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <FiKey className="text-[#10AFA5] w-4 h-4" />
                  Change Password
                </span>
                <FiChevronRight className="text-gray-400 w-4 h-4" />
              </button>

              <button 
                onClick={() => setActiveModal('notifications')}
                className="w-full flex justify-between items-center py-3 text-xs font-bold text-gray-600 hover:text-gray-900 border-b border-gray-50 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <FiBell className="text-[#10AFA5] w-4 h-4" />
                  Notification Preferences
                </span>
                <FiChevronRight className="text-gray-400 w-4 h-4" />
              </button>

              <div className="w-full flex justify-between items-center py-3 text-xs font-bold text-gray-600 border-b border-gray-50">
                <span className="flex items-center gap-2">
                  <FiActivity className="text-[#10AFA5] w-4 h-4" />
                  Active Sessions
                </span>
                <span className="bg-emerald-50 text-emerald-600 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-100">
                  {sessionData?.length || 1} Active
                </span>
              </div>
            </div>

            <button 
              onClick={() => logoutSessionsMutation.mutate()}
              className="w-full border border-red-200 hover:bg-red-50 text-red-600 text-xs font-bold py-2.5 rounded-xl mt-5 shadow-sm transition-colors text-center block"
            >
              Logout All Devices
            </button>
          </div>

        </div>

      </div>

      {/* ========================================================
                            MODALS / DRAWERS
      ======================================================== */}
      
      {/* 1. EDIT PROFILE MODAL */}
      {activeModal === 'profile' && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => setActiveModal(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
              <FiX className="w-5 h-5" />
            </button>
            <h3 className="text-base font-bold text-gray-800 mb-4">Edit Company Core Profile</h3>
            
            <form onSubmit={profileForm.handleSubmit(onSubmitProfile)} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Company Name *</label>
                  <input type="text" {...profileForm.register('companyName')} required className="w-full h-10 border border-gray-200 text-xs rounded-xl px-3.5 mt-1.5 focus:ring-2 focus:ring-[#10AFA5]/10 focus:border-[#10AFA5] outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Company Type *</label>
                  <select {...profileForm.register('companyType')} required className="w-full h-10 border border-gray-200 text-xs rounded-xl px-3.5 mt-1.5 focus:ring-2 focus:ring-[#10AFA5]/10 focus:border-[#10AFA5] outline-none bg-white">
                    <option value="Private Limited">Private Limited</option>
                    <option value="Partnership">Partnership</option>
                    <option value="Proprietorship">Proprietorship</option>
                    <option value="Public Limited">Public Limited</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase">GST Number *</label>
                  <input type="text" {...profileForm.register('gstNumber')} required placeholder="e.g. 07AABCT1234Q1Z5" className="w-full h-10 border border-gray-200 text-xs rounded-xl px-3.5 mt-1.5 focus:ring-2 focus:ring-[#10AFA5]/10 focus:border-[#10AFA5] outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase">PAN Number *</label>
                  <input type="text" {...profileForm.register('panNumber')} required placeholder="e.g. AABCT1234Q" className="w-full h-10 border border-gray-200 text-xs rounded-xl px-3.5 mt-1.5 focus:ring-2 focus:ring-[#10AFA5]/10 focus:border-[#10AFA5] outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase">TAN Number *</label>
                  <input type="text" {...profileForm.register('tanNumber')} required placeholder="e.g. DELT12345G" className="w-full h-10 border border-gray-200 text-xs rounded-xl px-3.5 mt-1.5 focus:ring-2 focus:ring-[#10AFA5]/10 focus:border-[#10AFA5] outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase">CIN Number</label>
                  <input type="text" {...profileForm.register('cinNumber')} className="w-full h-10 border border-gray-200 text-xs rounded-xl px-3.5 mt-1.5 focus:ring-2 focus:ring-[#10AFA5]/10 focus:border-[#10AFA5] outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Incorporation Date</label>
                  <input type="date" {...profileForm.register('incorporationDate')} className="w-full h-10 border border-gray-200 text-xs rounded-xl px-3.5 mt-1.5 focus:ring-2 focus:ring-[#10AFA5]/10 focus:border-[#10AFA5] outline-none bg-white" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Company Email *</label>
                  <input type="email" {...profileForm.register('companyEmail')} required className="w-full h-10 border border-gray-200 text-xs rounded-xl px-3.5 mt-1.5 focus:ring-2 focus:ring-[#10AFA5]/10 focus:border-[#10AFA5] outline-none" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Company Phone *</label>
                  <input type="text" {...profileForm.register('companyPhone')} required className="w-full h-10 border border-gray-200 text-xs rounded-xl px-3.5 mt-1.5 focus:ring-2 focus:ring-[#10AFA5]/10 focus:border-[#10AFA5] outline-none" />
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-gray-50">
                <button type="button" onClick={() => setActiveModal(null)} className="px-5 py-2 border border-gray-200 text-xs font-bold text-gray-500 rounded-xl hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2 bg-[#10AFA5] hover:bg-[#0D9488] text-white text-xs font-bold rounded-xl shadow-md">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. EDIT CONTACT PERSON */}
      {activeModal === 'contact' && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 relative">
            <button onClick={() => setActiveModal(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
              <FiX className="w-5 h-5" />
            </button>
            <h3 className="text-base font-bold text-gray-800 mb-4">Edit Contact Person</h3>
            
            <form onSubmit={contactForm.handleSubmit(onSubmitContact)} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase">Authorized Person Name *</label>
                <input type="text" {...contactForm.register('name')} required className="w-full h-10 border border-gray-200 text-xs rounded-xl px-3.5 mt-1.5 focus:ring-2 focus:ring-[#10AFA5]/10 focus:border-[#10AFA5] outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase">Designation *</label>
                <input type="text" {...contactForm.register('designation')} required className="w-full h-10 border border-gray-200 text-xs rounded-xl px-3.5 mt-1.5 focus:ring-2 focus:ring-[#10AFA5]/10 focus:border-[#10AFA5] outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase">Email Address *</label>
                <input type="email" {...contactForm.register('email')} required className="w-full h-10 border border-gray-200 text-xs rounded-xl px-3.5 mt-1.5 focus:ring-2 focus:ring-[#10AFA5]/10 focus:border-[#10AFA5] outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Mobile Number *</label>
                  <input type="text" {...contactForm.register('phone')} required className="w-full h-10 border border-gray-200 text-xs rounded-xl px-3.5 mt-1.5 focus:ring-2 focus:ring-[#10AFA5]/10 focus:border-[#10AFA5] outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase">WhatsApp Number</label>
                  <input type="text" {...contactForm.register('altPhone')} className="w-full h-10 border border-gray-200 text-xs rounded-xl px-3.5 mt-1.5 focus:ring-2 focus:ring-[#10AFA5]/10 focus:border-[#10AFA5] outline-none" />
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-gray-50">
                <button type="button" onClick={() => setActiveModal(null)} className="px-5 py-2 border border-gray-200 text-xs font-bold text-gray-500 rounded-xl hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2 bg-[#10AFA5] hover:bg-[#0D9488] text-white text-xs font-bold rounded-xl shadow-md">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. EDIT ADDRESS DETAILS */}
      {activeModal === 'address' && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 relative">
            <button onClick={() => setActiveModal(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
              <FiX className="w-5 h-5" />
            </button>
            <h3 className="text-base font-bold text-gray-800 mb-4">Edit Address Details</h3>
            
            <form onSubmit={addressForm.handleSubmit(onSubmitAddress)} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase">Registered Corporate Address *</label>
                <textarea {...addressForm.register('registeredAddress')} required rows="3" className="w-full border border-gray-200 text-xs rounded-xl px-3.5 py-2.5 mt-1.5 focus:ring-2 focus:ring-[#10AFA5]/10 focus:border-[#10AFA5] outline-none resize-none" />
              </div>
              
              <div className="flex items-center gap-2">
                <input type="checkbox" id="sameAsReg" {...addressForm.register('sameAsRegistered')} className="rounded text-[#10AFA5] focus:ring-[#10AFA5]/30 w-4 h-4" />
                <label htmlFor="sameAsReg" className="text-xs font-bold text-gray-600 cursor-pointer">Billing Address is same as Registered Address</label>
              </div>

              {!addressForm.watch('sameAsRegistered') && (
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Billing Address *</label>
                  <textarea {...addressForm.register('billingAddress')} required rows="3" className="w-full border border-gray-200 text-xs rounded-xl px-3.5 py-2.5 mt-1.5 focus:ring-2 focus:ring-[#10AFA5]/10 focus:border-[#10AFA5] outline-none resize-none animate-fade-in" />
                </div>
              )}

              <div className="flex gap-3 justify-end pt-4 border-t border-gray-50">
                <button type="button" onClick={() => setActiveModal(null)} className="px-5 py-2 border border-gray-200 text-xs font-bold text-gray-500 rounded-xl hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2 bg-[#10AFA5] hover:bg-[#0D9488] text-white text-xs font-bold rounded-xl shadow-md">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. OFFICE BRANCHES MANAGER */}
      {activeModal === 'branches' && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-gray-100 relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => setActiveModal(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
              <FiX className="w-5 h-5" />
            </button>
            <h3 className="text-base font-bold text-gray-800 mb-4">Manage Branch Locations</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              
              {/* Branch form */}
              <div className="md:col-span-5 bg-gray-50/50 rounded-2xl border border-gray-100 p-4 space-y-4">
                <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wide">Add Office Branch</h4>
                
                <form onSubmit={branchForm.handleSubmit(onAddBranchSubmit)} className="space-y-3">
                  <input type="text" {...branchForm.register('branchName')} required placeholder="Branch Name (e.g. Noida HQ)" className="w-full h-9 border border-gray-200 text-xs rounded-xl px-3 bg-white" />
                  <input type="text" {...branchForm.register('address')} required placeholder="Street address" className="w-full h-9 border border-gray-200 text-xs rounded-xl px-3 bg-white" />
                  <input type="text" {...branchForm.register('city')} required placeholder="City" className="w-full h-9 border border-gray-200 text-xs rounded-xl px-3 bg-white" />
                  <input type="text" {...branchForm.register('state')} required placeholder="State" className="w-full h-9 border border-gray-200 text-xs rounded-xl px-3 bg-white" />
                  <input type="text" {...branchForm.register('pincode')} required placeholder="Pincode" className="w-full h-9 border border-gray-200 text-xs rounded-xl px-3 bg-white" />
                  <input type="text" {...branchForm.register('contactPerson')} required placeholder="Contact coordinator" className="w-full h-9 border border-gray-200 text-xs rounded-xl px-3 bg-white" />
                  <input type="text" {...branchForm.register('contactPhone')} required placeholder="Contact phone" className="w-full h-9 border border-gray-200 text-xs rounded-xl px-3 bg-white" />
                  
                  <button type="submit" disabled={addBranchMutation.isPending} className="w-full py-2 bg-[#10AFA5] hover:bg-[#0D9488] text-white text-xs font-bold rounded-xl transition-colors shadow-md">
                    {addBranchMutation.isPending ? 'Saving...' : 'Add Branch Location'}
                  </button>
                </form>
              </div>

              {/* Branch List */}
              <div className="md:col-span-7 space-y-3">
                <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wide">Existing Locations</h4>
                
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {!profileData?.branches || profileData.branches.length === 0 ? (
                    <p className="text-center py-10 text-xs text-gray-400 font-bold">No branches added yet.</p>
                  ) : (
                    profileData.branches.map((br) => (
                      <div key={br._id} className="border border-gray-100 rounded-xl p-3 bg-gray-50/20 flex justify-between gap-3 text-xs">
                        <div>
                          <p className="font-bold text-gray-800 capitalize">{br.branchName}</p>
                          <p className="text-gray-500 mt-1 leading-snug">{br.address}, {br.city}, {br.state} - {br.pincode}</p>
                          <p className="text-[10px] text-gray-400 font-bold mt-1.5 flex items-center gap-1">
                            👤 Contact: {br.contactPerson} ({br.contactPhone})
                          </p>
                        </div>
                        <button
                          onClick={() => removeBranchMutation.mutate(br._id)}
                          className="text-gray-400 hover:text-red-600 p-1.5 rounded hover:bg-red-50 self-start transition-colors shrink-0"
                        >
                          <FiTrash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* 5. EDIT BANK DETAILS */}
      {activeModal === 'bank' && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 relative">
            <button onClick={() => setActiveModal(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
              <FiX className="w-5 h-5" />
            </button>
            <h3 className="text-base font-bold text-gray-800 mb-4">Edit Bank Details</h3>
            
            <form onSubmit={bankForm.handleSubmit(onSubmitBank)} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase">Account Holder Name *</label>
                <input type="text" {...bankForm.register('accountHolderName')} required className="w-full h-10 border border-gray-200 text-xs rounded-xl px-3.5 mt-1.5 focus:ring-2 focus:ring-[#10AFA5]/10 focus:border-[#10AFA5] outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase">Account Number *</label>
                <input type="password" {...bankForm.register('accountNumber')} required placeholder="Enter full bank account number" className="w-full h-10 border border-gray-200 text-xs rounded-xl px-3.5 mt-1.5 focus:ring-2 focus:ring-[#10AFA5]/10 focus:border-[#10AFA5] outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase">IFSC Code *</label>
                <input type="text" {...bankForm.register('ifscCode')} required placeholder="e.g. HDFC0001234" className="w-full h-10 border border-gray-200 text-xs rounded-xl px-3.5 mt-1.5 focus:ring-2 focus:ring-[#10AFA5]/10 focus:border-[#10AFA5] outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Bank Name *</label>
                  <input type="text" {...bankForm.register('bankName')} required className="w-full h-10 border border-gray-200 text-xs rounded-xl px-3.5 mt-1.5 focus:ring-2 focus:ring-[#10AFA5]/10 focus:border-[#10AFA5] outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Branch Name *</label>
                  <input type="text" {...bankForm.register('branchName')} required className="w-full h-10 border border-gray-200 text-xs rounded-xl px-3.5 mt-1.5 focus:ring-2 focus:ring-[#10AFA5]/10 focus:border-[#10AFA5] outline-none" />
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-gray-50">
                <button type="button" onClick={() => setActiveModal(null)} className="px-5 py-2 border border-gray-200 text-xs font-bold text-gray-500 rounded-xl hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2 bg-[#10AFA5] hover:bg-[#0D9488] text-white text-xs font-bold rounded-xl shadow-md">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. CHANGE PASSWORD */}
      {activeModal === 'password' && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 relative">
            <button onClick={() => setActiveModal(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
              <FiX className="w-5 h-5" />
            </button>
            <h3 className="text-base font-bold text-gray-800 mb-4">Change Account Password</h3>
            
            <form onSubmit={passwordForm.handleSubmit(onSubmitPassword)} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase">Current Password *</label>
                <input type="password" {...passwordForm.register('currentPassword')} required className="w-full h-10 border border-gray-200 text-xs rounded-xl px-3.5 mt-1.5 focus:ring-2 focus:ring-[#10AFA5]/10 focus:border-[#10AFA5] outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase">New Password *</label>
                <input type="password" {...passwordForm.register('newPassword')} required className="w-full h-10 border border-gray-200 text-xs rounded-xl px-3.5 mt-1.5 focus:ring-2 focus:ring-[#10AFA5]/10 focus:border-[#10AFA5] outline-none" />
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-gray-50">
                <button type="button" onClick={() => setActiveModal(null)} className="px-5 py-2 border border-gray-200 text-xs font-bold text-gray-500 rounded-xl hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2 bg-[#10AFA5] hover:bg-[#0D9488] text-white text-xs font-bold rounded-xl shadow-md">
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. NOTIFICATION PREFERENCES */}
      {activeModal === 'notifications' && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-gray-100 relative">
            <button onClick={() => setActiveModal(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
              <FiX className="w-5 h-5" />
            </button>
            <h3 className="text-base font-bold text-gray-800 mb-4">Notification Preferences</h3>
            
            <div className="space-y-4 py-2">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs font-bold text-gray-700">Email Notifications</p>
                  <p className="text-[10px] text-gray-400">Receive booking invoices & summary emails</p>
                </div>
                <input
                  type="checkbox"
                  checked={notifPrefs.email}
                  onChange={(e) => setNotifPrefs((prev) => ({ ...prev, email: e.target.checked }))}
                  className="rounded text-[#10AFA5] focus:ring-[#10AFA5]/30 w-4.5 h-4.5"
                />
              </div>
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs font-bold text-gray-700">SMS Alerts</p>
                  <p className="text-[10px] text-gray-400">Receive real-time mobile OTP & dispatch SMS</p>
                </div>
                <input
                  type="checkbox"
                  checked={notifPrefs.sms}
                  onChange={(e) => setNotifPrefs((prev) => ({ ...prev, sms: e.target.checked }))}
                  className="rounded text-[#10AFA5] focus:ring-[#10AFA5]/30 w-4.5 h-4.5"
                />
              </div>
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs font-bold text-gray-700">Real-time Web Push</p>
                  <p className="text-[10px] text-gray-400">Push status alerts during live job tracking</p>
                </div>
                <input
                  type="checkbox"
                  checked={notifPrefs.push}
                  onChange={(e) => setNotifPrefs((prev) => ({ ...prev, push: e.target.checked }))}
                  className="rounded text-[#10AFA5] focus:ring-[#10AFA5]/30 w-4.5 h-4.5"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-5 border-t border-gray-50 mt-4">
              <button
                type="button"
                disabled={updateNotifPrefsMutation.isPending}
                onClick={() => updateNotifPrefsMutation.mutate(notifPrefs)}
                className="px-5 py-2 bg-[#10AFA5] hover:bg-[#0D9488] disabled:bg-gray-300 text-white text-xs font-bold rounded-xl w-full shadow-md text-center"
              >
                {updateNotifPrefsMutation.isPending ? 'Saving…' : 'Save Preferences'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Profile;
