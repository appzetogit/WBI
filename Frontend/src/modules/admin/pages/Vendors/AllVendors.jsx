import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { FiCheck, FiX, FiEye, FiSearch, FiFilter, FiDownload, FiPower, FiTrash2, FiExternalLink, FiLoader } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import CardShell from '../UserCategories/components/CardShell';
import Modal from '../UserCategories/components/Modal';
import DocumentPreviewModal from '../../../../components/documents/DocumentPreviewModal';
import adminVendorService from '../../../../services/adminVendorService';

const display = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  return String(value);
};

const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatAddress = (address = {}) => {
  const parts = [
    address.fullAddress,
    address.addressLine1,
    address.addressLine2,
    address.landmark,
    address.city,
    address.state,
    address.pincode
  ].filter(Boolean);
  return parts.length ? [...new Set(parts)].join(', ') : '—';
};

const DetailField = ({ label, children }) => (
  <div>
    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">{label}</label>
    <div className="text-sm text-gray-900 break-words">{children ?? '—'}</div>
  </div>
);

const SectionTitle = ({ children }) => (
  <h4 className="text-xs font-black uppercase tracking-wider text-gray-500 border-b border-gray-100 pb-2 mb-3">{children}</h4>
);

const DocThumb = ({ label, url, number, status, onPreview }) => {
  if (!url) return null;
  const isPdf = /\.pdf(\?|$)/i.test(String(url)) || String(url).toLowerCase().includes('/raw/upload') || String(url).includes('application/pdf');
  return (
    <div className="rounded-xl border border-gray-100 overflow-hidden bg-gray-50">
      <div className="px-3 py-2 flex items-center justify-between gap-2 border-b border-gray-100 bg-white">
        <div className="min-w-0">
          <p className="text-xs font-bold text-gray-800 truncate">{label}</p>
          {number ? <p className="text-[10px] text-gray-500 font-mono mt-0.5">{number}</p> : null}
          {status ? (
            <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border bg-amber-50 text-amber-700 border-amber-100">
              {String(status).replace(/_/g, ' ')}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={() => onPreview?.({ url, title: label })} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg" title="Preview">
            <FiEye className="w-3.5 h-3.5" />
          </button>
          <a href={url} target="_blank" rel="noopener noreferrer" className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg" title="Open">
            <FiExternalLink className="w-3.5 h-3.5" />
          </a>
          <a href={url} download target="_blank" rel="noopener noreferrer" className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg" title="Download">
            <FiDownload className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
      <button type="button" onClick={() => onPreview?.({ url, title: label })} className="block w-full text-left">
        {isPdf ? (
          <div className="h-40 flex items-center justify-center text-xs font-semibold text-gray-500 bg-slate-100">
            PDF document — click to preview
          </div>
        ) : (
          <img
            src={url}
            alt={label}
            className="w-full h-40 object-cover bg-white"
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const fallback = e.currentTarget.nextElementSibling;
              if (fallback) fallback.classList.remove('hidden');
            }}
          />
        )}
        <div className="hidden h-40 flex items-center justify-center text-xs font-semibold text-gray-500 bg-slate-100 px-3 text-center">
          Preview unavailable — use Open / Download
        </div>
      </button>
    </div>
  );
};

const AllVendors = () => {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [docPreview, setDocPreview] = useState(null);

  useEffect(() => {
    loadVendors();
  }, []);

  const loadVendors = async () => {
    try {
      setLoading(true);
      const response = await adminVendorService.getAllVendors({ limit: 200 });
      if (response.success) {
        const transformedVendors = response.data.map((vendor) => ({
          id: vendor._id,
          name: vendor.name,
          email: vendor.email,
          phone: vendor.phone,
          businessName: vendor.businessName,
          service: vendor.service,
          approvalStatus: vendor.approvalStatus,
          createdAt: vendor.createdAt,
          isActive: vendor.isActive
        }));
        setVendors(transformedVendors);
      } else {
        toast.error(response.message || 'Failed to load vendors');
      }
    } catch (error) {
      console.error('Error loading vendors:', error);
      toast.error('Failed to load vendors. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const filteredVendors = useMemo(() => {
    return vendors.filter((vendor) => {
      const serviceString = Array.isArray(vendor.service)
        ? vendor.service.join(' ')
        : (vendor.service || '');

      const matchesStatus = filterStatus === 'all' || vendor.approvalStatus === filterStatus;
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        (vendor.name || '').toLowerCase().includes(q) ||
        (vendor.email || '').toLowerCase().includes(q) ||
        String(vendor.phone || '').includes(searchQuery) ||
        serviceString.toLowerCase().includes(q) ||
        (vendor.businessName || '').toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [vendors, filterStatus, searchQuery]);

  const handleApprove = async (vendorId) => {
    try {
      const response = await adminVendorService.approveVendor(vendorId);
      if (response.success) {
        setVendors((prev) => prev.map((v) => (v.id === vendorId ? { ...v, approvalStatus: 'approved' } : v)));
        setSelectedVendor((prev) => (prev?.id === vendorId || prev?._id === vendorId
          ? { ...prev, approvalStatus: 'approved' }
          : prev));
        toast.success('Vendor approved successfully!');
      } else {
        toast.error(response.message || 'Failed to approve vendor');
      }
    } catch (error) {
      console.error('Error approving vendor:', error);
      toast.error('Failed to approve vendor. Please try again.');
    }
  };

  const handleReject = async (vendorId) => {
    try {
      const response = await adminVendorService.rejectVendor(vendorId);
      if (response.success) {
        setVendors((prev) => prev.map((v) => (v.id === vendorId ? { ...v, approvalStatus: 'rejected' } : v)));
        setSelectedVendor((prev) => (prev?.id === vendorId || prev?._id === vendorId
          ? { ...prev, approvalStatus: 'rejected' }
          : prev));
        toast.success('Vendor rejected successfully.');
      } else {
        toast.error(response.message || 'Failed to reject vendor');
      }
    } catch (error) {
      console.error('Error rejecting vendor:', error);
      toast.error('Failed to reject vendor. Please try again.');
    }
  };

  const handleKycApprove = async (vendorId) => {
    try {
      const response = await adminVendorService.updateKycStatus(vendorId, 'verified');
      if (response.success) {
        setVendors((prev) => prev.map((v) => (v.id === vendorId ? { ...v, kycStatus: 'verified' } : v)));
        setSelectedVendor((prev) => (prev?.id === vendorId || prev?._id === vendorId
          ? { ...prev, kycStatus: 'verified', compliance: { ...prev.compliance, kycStatus: 'verified' } }
          : prev));
        toast.success('KYC verified successfully!');
      } else {
        toast.error(response.message || 'Failed to verify KYC');
      }
    } catch (error) {
      console.error('Error verifying KYC:', error);
      toast.error('Failed to verify KYC. Please try again.');
    }
  };

  const handleKycReject = async (vendorId) => {
    const reason = window.prompt('Please enter a reason for rejecting the KYC:');
    if (reason === null) return;
    try {
      const response = await adminVendorService.updateKycStatus(vendorId, 'rejected', reason);
      if (response.success) {
        setVendors((prev) => prev.map((v) => (v.id === vendorId ? { ...v, kycStatus: 'rejected' } : v)));
        setSelectedVendor((prev) => (prev?.id === vendorId || prev?._id === vendorId
          ? { ...prev, kycStatus: 'rejected', compliance: { ...prev.compliance, kycStatus: 'rejected' } }
          : prev));
        toast.success('KYC rejected successfully.');
      } else {
        toast.error(response.message || 'Failed to reject KYC');
      }
    } catch (error) {
      console.error('Error rejecting KYC:', error);
      toast.error('Failed to reject KYC. Please try again.');
    }
  };

  const handleToggleStatus = async (vendorId, currentStatus) => {
    try {
      const newStatus = !currentStatus;
      const response = await adminVendorService.toggleStatus(vendorId, newStatus);
      if (response.success) {
        setVendors((prev) => prev.map((v) => (v.id === vendorId ? { ...v, isActive: newStatus } : v)));
        toast.success(`Vendor ${newStatus ? 'activated' : 'deactivated'} successfully`);
      } else {
        toast.error(response.message || 'Failed to update vendor status');
      }
    } catch (error) {
      console.error('Error toggling vendor status:', error);
      toast.error('Failed to update status');
    }
  };

  const handleDelete = async (vendorId) => {
    if (!window.confirm('Are you sure you want to delete this vendor? This action cannot be undone.')) {
      return;
    }
    try {
      const response = await adminVendorService.deleteVendor(vendorId);
      if (response.success) {
        setVendors((prev) => prev.filter((v) => v.id !== vendorId));
        toast.success('Vendor deleted successfully');
      } else {
        toast.error(response.message || 'Failed to delete vendor');
      }
    } catch (error) {
      console.error('Error deleting vendor:', error);
      toast.error('Failed to delete vendor');
    }
  };

  const handleViewDetails = useCallback(async (vendor) => {
    setIsViewModalOpen(true);
    setSelectedVendor(null);
    setDetailLoading(true);
    try {
      const response = await adminVendorService.getVendorDetails(vendor.id);
      if (!response.success) {
        toast.error(response.message || 'Failed to load vendor details');
        setIsViewModalOpen(false);
        return;
      }
      const full = response.data?.vendor || {};
      const documents = response.data?.documents || full.documents || [];
      const bankAccounts = response.data?.bankAccounts || full.bankAccounts || [];
      const stats = response.data?.stats || {};
      setSelectedVendor({
        ...full,
        id: full._id || vendor.id,
        documents,
        bankAccounts,
        primaryBank: full.primaryBank || bankAccounts[0] || null,
        stats
      });
    } catch (error) {
      console.error('Error loading vendor details:', error);
      toast.error('Failed to load vendor details');
      setIsViewModalOpen(false);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      approved: 'bg-green-100 text-green-800 border-green-300',
      rejected: 'bg-red-100 text-red-800 border-red-300'
    };
    const label = status ? String(status) : 'pending';
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${styles[label] || styles.pending}`}>
        {label.charAt(0).toUpperCase() + label.slice(1)}
      </span>
    );
  };

  const pendingCount = vendors.filter((v) => v.approvalStatus === 'pending').length;
  const approvedCount = vendors.filter((v) => v.approvalStatus === 'approved').length;
  const rejectedCount = vendors.filter((v) => v.approvalStatus === 'rejected').length;

  const serviceLabels = selectedVendor
    ? (selectedVendor.approvedServices?.length
      ? selectedVendor.approvedServices.map((s) => s.categoryName || s.categoryCode).filter(Boolean)
      : (Array.isArray(selectedVendor.service) ? selectedVendor.service : [selectedVendor.service].filter(Boolean)))
    : [];

  const bank = selectedVendor?.primaryBank || selectedVendor?.bankDetails || null;

  return (
    <div className="space-y-4">
      <CardShell icon={FiFilter} title="Vendor Management" subtitle="Manage and verify platform vendors">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
            <div className="text-[10px] font-bold text-yellow-700 uppercase tracking-wider mb-1">Pending</div>
            <div className="text-xl font-bold text-yellow-900">{pendingCount}</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-3">
            <div className="text-[10px] font-bold text-green-700 uppercase tracking-wider mb-1">Approved</div>
            <div className="text-xl font-bold text-green-900">{approvedCount}</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <div className="text-[10px] font-bold text-red-700 uppercase tracking-wider mb-1">Rejected</div>
            <div className="text-xl font-bold text-red-900">{rejectedCount}</div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search vendors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all text-xs"
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {['all', 'pending', 'approved', 'rejected'].map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setFilterStatus(status)}
                className={`px-3 py-2 rounded-lg text-xs font-bold capitalize transition-all whitespace-nowrap ${
                  filterStatus === status
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Vendor Details</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Business Info</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr>
                    <td colSpan="4" className="px-4 py-8 text-center text-xs text-gray-500">Loading vendors...</td>
                  </tr>
                ) : filteredVendors.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="px-4 py-8 text-center text-xs text-gray-500">No vendors found</td>
                  </tr>
                ) : (
                  filteredVendors.map((vendor) => (
                    <tr key={vendor.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-bold text-gray-900 text-xs">{vendor.name}</p>
                          <p className="text-[10px] text-gray-500">{vendor.phone}</p>
                          <p className="text-[10px] text-gray-400">{vendor.email}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-bold text-gray-800 text-xs">{vendor.businessName || 'N/A'}</p>
                          <p className="text-[10px] text-blue-600 font-medium">
                            {Array.isArray(vendor.service) ? vendor.service.join(', ') : (vendor.service || 'No service')}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
                          vendor.approvalStatus === 'approved'
                            ? 'bg-green-50 text-green-700 border-green-100'
                            : vendor.approvalStatus === 'rejected'
                              ? 'bg-red-50 text-red-700 border-red-100'
                              : 'bg-yellow-50 text-yellow-700 border-yellow-100'
                        }`}>
                          {vendor.approvalStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleViewDetails(vendor)}
                            className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                            title="View Details"
                          >
                            <FiEye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(vendor.id, vendor.isActive)}
                            className={`p-1.5 rounded-lg transition-colors ${vendor.isActive ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}
                            title={vendor.isActive ? 'Disable Login' : 'Enable Login'}
                          >
                            <FiPower className={`w-3.5 h-3.5 ${vendor.isActive ? 'fill-current' : ''}`} />
                          </button>
                          {vendor.approvalStatus === 'pending' && (
                            <>
                              <button type="button" onClick={() => handleApprove(vendor.id)} className="p-1.5 text-green-500 hover:bg-green-50 rounded-lg transition-colors" title="Approve">
                                <FiCheck className="w-3.5 h-3.5" />
                              </button>
                              <button type="button" onClick={() => handleReject(vendor.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Reject">
                                <FiX className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          <button type="button" onClick={() => handleDelete(vendor.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Delete Vendor">
                            <FiTrash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </CardShell>

      <Modal
        isOpen={isViewModalOpen}
        onClose={() => {
          setIsViewModalOpen(false);
          setSelectedVendor(null);
          setDocPreview(null);
        }}
        title="Vendor Details"
        size="xl"
      >
        {detailLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
            <FiLoader className="w-5 h-5 animate-spin" /> Loading full vendor profile...
          </div>
        ) : selectedVendor ? (
          <div className="space-y-6 max-h-[75vh] overflow-y-auto pr-1">
            <div>
              <SectionTitle>Business Profile</SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DetailField label="Business Name">{display(selectedVendor.businessName)}</DetailField>
                <DetailField label="Owner Name">{display(selectedVendor.name)}</DetailField>
                <DetailField label="Email">{display(selectedVendor.email)}</DetailField>
                <DetailField label="Phone">{display(selectedVendor.phone)}</DetailField>
                <DetailField label="GSTIN">{display(selectedVendor.gstin)}</DetailField>
                <DetailField label="PAN Number">{display(selectedVendor.pan?.number)}</DetailField>
                <DetailField label="Aadhaar">{display(selectedVendor.aadhar?.number)}</DetailField>
                <DetailField label="Incorporation">{display(selectedVendor.incorporationType)}</DetailField>
                <DetailField label="Company Code">{display(selectedVendor.uniqueCompanyCode)}</DetailField>
                <DetailField label="Vendor Type">{display(selectedVendor.vendorType || selectedVendor.businessType)}</DetailField>
                <DetailField label="Partner Mode">{display(selectedVendor.partnerMode)}</DetailField>
                <DetailField label="Models">{display(selectedVendor.vendorModels)}</DetailField>
                <DetailField label="Status">{getStatusBadge(selectedVendor.approvalStatus)}</DetailField>
                <DetailField label="Active">
                  <span className={`text-sm font-semibold ${selectedVendor.isActive ? 'text-green-600' : 'text-red-600'}`}>
                    {selectedVendor.isActive ? 'Active' : 'Inactive'}
                  </span>
                </DetailField>
                <DetailField label="Registered On">{formatDate(selectedVendor.createdAt)}</DetailField>
                <DetailField label="Approved On">{formatDate(selectedVendor.approvalDate)}</DetailField>
              </div>
            </div>

            <div>
              <SectionTitle>Address & Coverage</SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DetailField label="Office Address">{formatAddress(selectedVendor.address)}</DetailField>
                <DetailField label="Working Cities">{display(selectedVendor.workingCities)}</DetailField>
                <DetailField label="Service Radius">{selectedVendor.serviceRadiusKm != null ? `${selectedVendor.serviceRadiusKm} km` : '—'}</DetailField>
                <DetailField label="Team Size">{display(selectedVendor.teamSize)}</DetailField>
                <DetailField label="Website">{display(selectedVendor.website)}</DetailField>
                <DetailField label="Description">{display(selectedVendor.companyDescription)}</DetailField>
              </div>
            </div>

            <div>
              <SectionTitle>Services</SectionTitle>
              {serviceLabels.length ? (
                <div className="flex flex-wrap gap-2">
                  {serviceLabels.map((label) => (
                    <span key={label} className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                      {label}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No services on file</p>
              )}
            </div>

            <div>
              <SectionTitle>Bank / Settlement</SectionTitle>
              {bank ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <DetailField label="Account Holder">{display(bank.accountHolderName || bank.accountName)}</DetailField>
                  <DetailField label="Account Number">{display(bank.accountNumberMasked || bank.accountNumber)}</DetailField>
                  <DetailField label="IFSC">{display(bank.ifsc || bank.ifscCode)}</DetailField>
                  <DetailField label="Bank Name">{display(bank.bankName)}</DetailField>
                  <DetailField label="UPI ID">{display(bank.upiId)}</DetailField>
                  <DetailField label="Verification">{display(bank.verificationStatus || bank.pennyDropStatus)}</DetailField>
                </div>
              ) : (
                <p className="text-sm text-gray-500">No bank details submitted</p>
              )}
            </div>

            <div>
              <SectionTitle>Compliance & Onboarding</SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DetailField label="KYC Status">{display(selectedVendor.compliance?.kycStatus || selectedVendor.kycStatus)}</DetailField>
                <DetailField label="PAN Verified">{display(selectedVendor.compliance?.panVerified)}</DetailField>
                <DetailField label="GST Verified">{display(selectedVendor.compliance?.gstVerified)}</DetailField>
                <DetailField label="Onboarding">{display(selectedVendor.onboarding?.status)}</DetailField>
                <DetailField label="Operational Audit">{display(selectedVendor.operationalAuditStatus)}</DetailField>
                <DetailField label="Digital SLA">{display(selectedVendor.digitalSLAAccepted)}</DetailField>
                <DetailField label="Email Verified">{display(selectedVendor.isEmailVerified)}</DetailField>
                <DetailField label="Phone Verified">{display(selectedVendor.isPhoneVerified)}</DetailField>
              </div>
            </div>

            {(selectedVendor.stats && (selectedVendor.stats.totalBookings > 0 || selectedVendor.stats.totalEarnings > 0)) && (
              <div>
                <SectionTitle>Performance Snapshot</SectionTitle>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-xl border border-gray-100 p-3 bg-gray-50">
                    <p className="text-[10px] uppercase font-bold text-gray-400">Bookings</p>
                    <p className="text-lg font-bold text-gray-900">{selectedVendor.stats.totalBookings || 0}</p>
                  </div>
                  <div className="rounded-xl border border-gray-100 p-3 bg-gray-50">
                    <p className="text-[10px] uppercase font-bold text-gray-400">Completed</p>
                    <p className="text-lg font-bold text-gray-900">{selectedVendor.stats.completedBookings || 0}</p>
                  </div>
                  <div className="rounded-xl border border-gray-100 p-3 bg-gray-50">
                    <p className="text-[10px] uppercase font-bold text-gray-400">Earnings</p>
                    <p className="text-lg font-bold text-gray-900">₹{Number(selectedVendor.stats.totalEarnings || 0).toLocaleString('en-IN')}</p>
                  </div>
                  <div className="rounded-xl border border-gray-100 p-3 bg-gray-50">
                    <p className="text-[10px] uppercase font-bold text-gray-400">Revenue</p>
                    <p className="text-lg font-bold text-gray-900">₹{Number(selectedVendor.stats.totalRevenue || 0).toLocaleString('en-IN')}</p>
                  </div>
                </div>
              </div>
            )}

            <div>
              <SectionTitle>Verification Documents</SectionTitle>
              {(selectedVendor.documents || []).length ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {selectedVendor.documents.map((doc) => (
                    <DocThumb
                      key={`${doc.source}-${doc.label}-${doc.fileUrl || doc.url}`}
                      label={doc.label}
                      url={doc.previewUrl || doc.fileUrl || doc.url}
                      number={doc.number}
                      status={doc.status}
                      onPreview={setDocPreview}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No verification documents uploaded</p>
              )}
            </div>

            {selectedVendor.approvalStatus === 'pending' && (
              <div className="flex gap-3 pt-4 border-t border-gray-200 sticky bottom-0 bg-white">
                <button
                  type="button"
                  onClick={async () => {
                    await handleApprove(selectedVendor.id);
                    setIsViewModalOpen(false);
                    setSelectedVendor(null);
                  }}
                  className="flex-1 px-4 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                >
                  <FiCheck className="w-5 h-5" />
                  Approve Vendor Registration
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await handleReject(selectedVendor.id);
                    setIsViewModalOpen(false);
                    setSelectedVendor(null);
                  }}
                  className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                >
                  <FiX className="w-5 h-5" />
                  Reject Vendor Registration
                </button>
              </div>
            )}
            
            {(selectedVendor.compliance?.kycStatus === 'pending' || selectedVendor.kycStatus === 'pending') && (
              <div className="flex gap-3 pt-4 border-t border-gray-200 sticky bottom-0 bg-white">
                <button
                  type="button"
                  onClick={async () => {
                    await handleKycApprove(selectedVendor.id);
                  }}
                  className="flex-1 px-4 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                >
                  <FiCheck className="w-5 h-5" />
                  Approve KYC Documents
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await handleKycReject(selectedVendor.id);
                  }}
                  className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                >
                  <FiX className="w-5 h-5" />
                  Reject KYC Documents
                </button>
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      <DocumentPreviewModal
        open={Boolean(docPreview?.url)}
        url={docPreview?.url}
        title={docPreview?.title || 'Document'}
        onClose={() => setDocPreview(null)}
      />
    </div>
  );
};

export default AllVendors;
