import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiCheck, FiX, FiEye, FiSearch, FiFilter, FiDownload, FiLoader, FiDollarSign, FiPower, FiTrash2, FiExternalLink } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import CardShell from '../UserCategories/components/CardShell';
import Modal from '../UserCategories/components/Modal';
import DocumentPreviewModal from '../../../../components/documents/DocumentPreviewModal';
import adminEngineerService from '../../../../services/adminEngineerService';
import { formatEngineerServiceLabel } from '../../utils/adminHelpers';

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

const DetailField = ({ label, children }) => (
  <div>
    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">{label}</label>
    <div className="text-sm text-gray-900 break-words">{children ?? '—'}</div>
  </div>
);

const SectionTitle = ({ children }) => (
  <h4 className="text-xs font-black uppercase tracking-wider text-gray-500 border-b border-gray-100 pb-2 mb-3">{children}</h4>
);

const DocThumb = ({ label, url, status, onPreview }) => {
  if (!url) return null;
  const isPdf = String(url).toLowerCase().includes('.pdf');
  const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(String(url)) || String(url).includes('/video/');
  const openPreview = () => {
    if (isVideo) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    onPreview?.({ url, title: label });
  };
  return (
    <div className="rounded-xl border border-gray-100 overflow-hidden bg-gray-50">
      <div className="px-3 py-2 flex items-center justify-between gap-2 border-b border-gray-100 bg-white">
        <div>
          <p className="text-xs font-bold text-gray-800 capitalize">{label}</p>
          {status ? <p className="text-[10px] text-gray-400 capitalize">{status}</p> : null}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={openPreview}
            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"
            title="Preview"
          >
            <FiEye className="w-3.5 h-3.5" />
          </button>
          <a href={url} target="_blank" rel="noopener noreferrer" className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg" title="Open">
            <FiExternalLink className="w-3.5 h-3.5" />
          </a>
          <a href={url} download className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg" title="Download">
            <FiDownload className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
      <button type="button" onClick={openPreview} className="block w-full text-left">
        {isVideo ? (
          <video src={url} className="w-full h-40 object-cover bg-black" muted />
        ) : isPdf ? (
          <div className="h-40 flex items-center justify-center text-xs font-semibold text-gray-500">PDF document — click to preview</div>
        ) : (
          <img src={url} alt={label} className="w-full h-40 object-cover" loading="lazy" />
        )}
      </button>
    </div>
  );
};

const AllEngineers = () => {
  const [engineers, setEngineers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'pending', 'approved', 'rejected'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEngineer, setSelectedEngineer] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [verificationDocuments, setVerificationDocuments] = useState([]);
  const [cgpeStatus, setCgpeStatus] = useState({});
  const [detailStats, setDetailStats] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [paySubmitting, setPaySubmitting] = useState(false);

  // Load engineers from backend
  useEffect(() => {
    loadEngineers();
  }, []);

  const loadEngineers = async () => {
    try {
      setLoading(true);
      const response = await adminEngineerService.getAllEngineers();
      if (response.success) {
        // Transform backend data to frontend format
        const transformedEngineers = response.data.map(engineer => ({
          id: engineer._id,
          name: engineer.name,
          email: engineer.email,
          phone: engineer.phone,
          serviceCategory: formatEngineerServiceLabel(engineer),
          approvalStatus: engineer.approvalStatus,
          aadhar: engineer.aadhar?.number,
          pan: engineer.pan?.number,
          documents: {
            aadhar: engineer.aadhar?.document,
            aadharBack: engineer.aadhar?.backDocument,
            pan: engineer.pan?.document,
            other: engineer.otherDocuments?.[0]
          },
          createdAt: engineer.createdAt,
          isActive: engineer.isActive
        }));
        setEngineers(transformedEngineers);
      } else {
        toast.error(response.message || 'Failed to load engineers');
      }
    } catch (error) {
      console.error('Error loading engineers:', error);
      toast.error('Failed to load engineers. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const filteredEngineers = useMemo(() => {
    return engineers.filter(engineer => {
      const matchesStatus = filterStatus === 'all' || engineer.approvalStatus === filterStatus;
      const matchesSearch =
        engineer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        engineer.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        engineer.phone.includes(searchQuery) ||
        engineer.serviceCategory.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [engineers, filterStatus, searchQuery]);

  const handleApprove = async (engineerId) => {
    try {
      const response = await adminEngineerService.approveEngineer(engineerId);
      if (response.success) {
        setEngineers(prev => prev.map(w =>
          w.id === engineerId ? { ...w, approvalStatus: 'approved' } : w
        ));
        toast.success('Engineer approved successfully!');
      } else {
        toast.error(response.message || 'Failed to approve engineer');
      }
    } catch (error) {
      console.error('Error approving engineer:', error);
      toast.error('Failed to approve engineer. Please try again.');
    }
  };

  const handleReject = async (engineerId) => {
    try {
      const response = await adminEngineerService.rejectEngineer(engineerId);
      if (response.success) {
        setEngineers(prev => prev.map(w =>
          w.id === engineerId ? { ...w, approvalStatus: 'rejected' } : w
        ));
        toast.success('Engineer rejected successfully.');
      } else {
        toast.error(response.message || 'Failed to reject engineer');
      }
    } catch (error) {
      console.error('Error rejecting engineer:', error);
      toast.error('Failed to reject engineer. Please try again.');
    }
  };

  const handleToggleStatus = async (engineerId, currentStatus) => {
    try {
      const newStatus = !currentStatus;
      const response = await adminEngineerService.toggleStatus(engineerId, newStatus);
      if (response.success) {
        setEngineers(prev => prev.map(w =>
          w.id === engineerId ? { ...w, isActive: newStatus } : w
        ));
        toast.success(`Engineer ${newStatus ? 'activated' : 'deactivated'} successfully`);
      } else {
        toast.error(response.message || 'Failed to update engineer status');
      }
    } catch (error) {
      console.error('Error toggling engineer status:', error);
      toast.error('Failed to update status');
    }
  };

  const handleDelete = async (engineerId) => {
    if (!window.confirm('Are you sure you want to delete this engineer? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await adminEngineerService.deleteEngineer(engineerId);
      if (response.success) {
        setEngineers(prev => prev.filter(w => w.id !== engineerId));
        toast.success('Engineer deleted successfully');
      } else {
        toast.error(response.message || 'Failed to delete engineer');
      }
    } catch (error) {
      console.error('Error deleting engineer:', error);
      toast.error('Failed to delete engineer');
    }
  };

  const handleViewDetails = async (engineer) => {
    setIsViewModalOpen(true);
    setDetailLoading(true);
    setSelectedEngineer(null);
    setVerificationDocuments([]);
    setCgpeStatus({});
    setDetailStats(null);
    try {
      const response = await adminEngineerService.getEngineerDetails(engineer.id);
      if (!response.success || !response.data?.engineer) {
        toast.error(response.message || 'Failed to load engineer details');
        setIsViewModalOpen(false);
        return;
      }
      const eng = response.data.engineer;
      setSelectedEngineer({
        ...eng,
        id: eng._id,
        serviceCategory: formatEngineerServiceLabel(eng)
      });
      setVerificationDocuments(response.data.documents || []);
      setCgpeStatus(response.data.cgpeStatus || {});
      setDetailStats(response.data.stats || null);
    } catch (error) {
      console.error('Error loading engineer details:', error);
      toast.error('Failed to load engineer details. Please try again.');
      setIsViewModalOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const handlePayClick = (engineer) => {
    setSelectedEngineer(engineer);
    setPayAmount('');
    setPayNotes('');
    setIsPayModalOpen(true);
  };

  const handleRecordPayment = async () => {
    if (!payAmount || isNaN(payAmount) || parseFloat(payAmount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    try {
      setPaySubmitting(true);
      const res = await adminEngineerService.payEngineer(selectedEngineer.id, {
        amount: parseFloat(payAmount),
        notes: payNotes
      });

      if (res.success) {
        toast.success(`Payment of ₹${payAmount} recorded for ${selectedEngineer.name}`);
        setIsPayModalOpen(false);
        loadEngineers(); // Refresh data
      } else {
        toast.error(res.message || 'Failed to record payment');
      }
    } catch (error) {
      toast.error('Failed to process payment');
    } finally {
      setPaySubmitting(false);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      approved: 'bg-green-100 text-green-800 border-green-300',
      rejected: 'bg-red-100 text-red-800 border-red-300'
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${styles[status] || styles.pending}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const pendingCount = engineers.filter(w => w.approvalStatus === 'pending').length;
  const approvedCount = engineers.filter(w => w.approvalStatus === 'approved').length;
  const rejectedCount = engineers.filter(w => w.approvalStatus === 'rejected').length;

  return (
    <div className="space-y-4">
      <CardShell
        icon={FiFilter}
        title="Engineer Management"
        subtitle="Manage and verify platform engineers"
      >
        {/* Stats Cards */}
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

        {/* Search and Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search engineers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all text-xs"
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {['all', 'pending', 'approved', 'rejected'].map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-3 py-2 rounded-lg text-xs font-bold capitalize transition-all whitespace-nowrap ${filterStatus === status
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Engineer Details</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Category</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr>
                    <td colSpan="4" className="px-4 py-8 text-center text-xs text-gray-500">Loading engineers...</td>
                  </tr>
                ) : filteredEngineers.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="px-4 py-8 text-center text-xs text-gray-500">No engineers found</td>
                  </tr>
                ) : (
                  filteredEngineers.map((engineer) => (
                    <tr key={engineer.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-bold text-gray-900 text-xs">{engineer.name}</p>
                          <p className="text-[10px] text-gray-500">{engineer.phone}</p>
                          <p className="text-[10px] text-gray-400">{engineer.email}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[11px] text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded-full uppercase tracking-wider">
                          {engineer.serviceCategory}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${engineer.approvalStatus === 'approved' ? 'bg-green-50 text-green-700 border-green-100' :
                          engineer.approvalStatus === 'rejected' ? 'bg-red-50 text-red-700 border-red-100' :
                            'bg-yellow-50 text-yellow-700 border-yellow-100'
                          }`}>
                          {engineer.approvalStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {/* View Details */}
                          <button
                            onClick={() => handleViewDetails(engineer)}
                            className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                            title="View Details"
                          >
                            <FiEye className="w-3.5 h-3.5" />
                          </button>

                          {/* Toggle Active Status */}
                          <button
                            onClick={() => handleToggleStatus(engineer.id, engineer.isActive)}
                            className={`p-1.5 rounded-lg transition-colors ${engineer.isActive ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}
                            title={engineer.isActive ? "Disable Login" : "Enable Login"}
                          >
                            <FiPower className={`w-3.5 h-3.5 ${engineer.isActive ? 'fill-current' : ''}`} />
                          </button>



                          {/* Approve/Reject (Only for pending) */}
                          {engineer.approvalStatus === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApprove(engineer.id)}
                                className="p-1.5 text-green-500 hover:bg-green-50 rounded-lg transition-colors"
                                title="Approve"
                              >
                                <FiCheck className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleReject(engineer.id)}
                                className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                title="Reject"
                              >
                                <FiX className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}

                          {/* Delete Engineer */}
                          <button
                            onClick={() => handleDelete(engineer.id)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete Engineer"
                          >
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

      {/* View Engineer Details Modal */}
      <Modal
        isOpen={isViewModalOpen}
        onClose={() => {
          setIsViewModalOpen(false);
          setSelectedEngineer(null);
          setVerificationDocuments([]);
          setCgpeStatus({});
          setDetailStats(null);
          setPreviewDoc(null);
        }}
        title="Engineer Details"
        size="xl"
      >
        {detailLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-500 gap-2 text-sm">
            <FiLoader className="w-5 h-5 animate-spin" />
            Loading full registration details...
          </div>
        ) : selectedEngineer ? (
          <div className="space-y-8">
            {/* Header strip */}
            <div className="flex flex-wrap items-start gap-4 justify-between">
              <div className="flex items-center gap-3">
                {(selectedEngineer.selfieUrl || selectedEngineer.profilePhoto) ? (
                  <img
                    src={selectedEngineer.selfieUrl || selectedEngineer.profilePhoto}
                    alt={selectedEngineer.name}
                    className="w-14 h-14 rounded-full object-cover border border-gray-200"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-lg">
                    {(selectedEngineer.name || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-lg font-bold text-gray-900">{selectedEngineer.name}</p>
                  <p className="text-xs text-gray-500">{selectedEngineer.serviceCategory}</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {getStatusBadge(selectedEngineer.approvalStatus)}
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${selectedEngineer.isActive ? 'bg-green-50 text-green-700 border-green-100' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                      {selectedEngineer.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              </div>
              {detailStats ? (
                <div className="flex gap-3 text-center">
                  <div className="px-3 py-2 rounded-xl bg-gray-50 border border-gray-100 min-w-[72px]">
                    <p className="text-sm font-bold text-gray-900">{detailStats.totalJobs || 0}</p>
                    <p className="text-[9px] uppercase text-gray-400 font-bold">Jobs</p>
                  </div>
                  <div className="px-3 py-2 rounded-xl bg-gray-50 border border-gray-100 min-w-[72px]">
                    <p className="text-sm font-bold text-gray-900">{detailStats.completedJobs || 0}</p>
                    <p className="text-[9px] uppercase text-gray-400 font-bold">Done</p>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Personal */}
            <div>
              <SectionTitle>Personal Information</SectionTitle>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <DetailField label="Name">{display(selectedEngineer.name)}</DetailField>
                <DetailField label="Email">{display(selectedEngineer.email)}</DetailField>
                <DetailField label="Phone">{display(selectedEngineer.phone)}</DetailField>
                <DetailField label="WhatsApp">{display(selectedEngineer.whatsappNumber)}</DetailField>
                <DetailField label="Emergency Contact">{display(selectedEngineer.emergencyContactNumber)}</DetailField>
                <DetailField label="DOB">{formatDate(selectedEngineer.dob)}</DetailField>
                <DetailField label="Gender">{display(selectedEngineer.gender)}</DetailField>
                <DetailField label="Username">{display(selectedEngineer.username)}</DetailField>
                <DetailField label="Registered">{formatDate(selectedEngineer.createdAt)}</DetailField>
              </div>
            </div>

            {/* Registration / company */}
            <div>
              <SectionTitle>Registration</SectionTitle>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <DetailField label="Engineer Type">{display(selectedEngineer.engineerType)}</DetailField>
                <DetailField label="Registration Type">{display(selectedEngineer.registrationType)}</DetailField>
                <DetailField label="Company Name">{display(selectedEngineer.companyDetails?.companyName)}</DetailField>
                <DetailField label="Employee ID">{display(selectedEngineer.companyDetails?.employeeId)}</DetailField>
                <DetailField label="Designation">{display(selectedEngineer.companyDetails?.designation)}</DetailField>
                <DetailField label="Linked Via Code">{display(selectedEngineer.linkedViaCode)}</DetailField>
                <DetailField label="Vendor Approval">{display(selectedEngineer.vendorApprovalStatus)}</DetailField>
                <DetailField label="Heard About WBI">{display(selectedEngineer.heardAboutWbi)}</DetailField>
                <DetailField label="Referral Code">{display(selectedEngineer.referralCode)}</DetailField>
              </div>
            </div>

            {/* Skills & categories */}
            <div>
              <SectionTitle>Skills & Services</SectionTitle>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <DetailField label="Primary Category">{display(selectedEngineer.primaryCategory || selectedEngineer.serviceCategory)}</DetailField>
                <DetailField label="Service Categories">{display(selectedEngineer.serviceCategories)}</DetailField>
                <DetailField label="Primary Skill">{display(selectedEngineer.primarySkill)}</DetailField>
                <DetailField label="Secondary Skills">{display(selectedEngineer.secondarySkills)}</DetailField>
                <DetailField label="Experience Level">{display(selectedEngineer.experienceLevel)}</DetailField>
                <DetailField label="Total Experience (Years)">{display(selectedEngineer.totalExperienceYears)}</DetailField>
                <DetailField label="Highest Education">{display(selectedEngineer.highestEducation)}</DetailField>
                <DetailField label="Field of Study">{display(selectedEngineer.fieldOfStudy)}</DetailField>
                <DetailField label="Work Type">{display(selectedEngineer.workType || selectedEngineer.preferredWorkType)}</DetailField>
                <DetailField label="Availability">{display(selectedEngineer.availability)}</DetailField>
                <DetailField label="Can Work Independently">{display(selectedEngineer.canWorkIndependently)}</DetailField>
                <DetailField label="Willing To Travel">{display(selectedEngineer.willingToTravel)}</DetailField>
                <DetailField label="Emergency Service">{display(selectedEngineer.emergencyService)}</DetailField>
              </div>
              {Array.isArray(selectedEngineer.subServices) && selectedEngineer.subServices.length > 0 ? (
                <div className="mt-4">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Sub-services</label>
                  <div className="flex flex-wrap gap-2">
                    {selectedEngineer.subServices.map((sub, idx) => (
                      <span key={idx} className="text-[11px] bg-blue-50 text-blue-700 px-2 py-1 rounded-full font-semibold">
                        {sub.name || sub}
                        {sub.yearsOfExperience != null ? ` · ${sub.yearsOfExperience}y` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Kit / tools / media meta */}
            <div>
              <SectionTitle>Uniform, Tools & Vehicle</SectionTitle>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <DetailField label="T-shirt Size">{display(selectedEngineer.tshirtSize)}</DetailField>
                <DetailField label="Tools Available">{display(selectedEngineer.toolsAvailable)}</DetailField>
                <DetailField label="Other Tools">{display(selectedEngineer.otherTools)}</DetailField>
                <DetailField label="Own Tools">{display(selectedEngineer.workTools?.ownTools)}</DetailField>
                <DetailField label="Has Bike">{display(selectedEngineer.hasBike)}</DetailField>
                <DetailField label="Vehicle Available">{display(selectedEngineer.workTools?.vehicleAvailable)}</DetailField>
                <DetailField label="Vehicle Type">{display(selectedEngineer.workTools?.vehicleType)}</DetailField>
                <DetailField label="Vehicle Number">{display(selectedEngineer.vehicleNumber)}</DetailField>
                <DetailField label="Vehicle Verification">{display(selectedEngineer.vehicleVerificationStatus)}</DetailField>
              </div>
            </div>

            {/* Address */}
            <div>
              <SectionTitle>Address & Work Locations</SectionTitle>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <DetailField label="Address Line 1">{display(selectedEngineer.address?.addressLine1 || selectedEngineer.address?.fullAddress)}</DetailField>
                <DetailField label="Address Line 2">{display(selectedEngineer.address?.addressLine2)}</DetailField>
                <DetailField label="City">{display(selectedEngineer.address?.city)}</DetailField>
                <DetailField label="State">{display(selectedEngineer.address?.state)}</DetailField>
                <DetailField label="Pincode">{display(selectedEngineer.address?.pincode)}</DetailField>
                <DetailField label="Landmark">{display(selectedEngineer.address?.landmark)}</DetailField>
                <DetailField label="Primary Area">{display(selectedEngineer.workLocations?.primaryArea)}</DetailField>
                <DetailField label="Service Radius (km)">{display(selectedEngineer.workLocations?.serviceRadius)}</DetailField>
                <DetailField label="Available Cities">{display(selectedEngineer.workLocations?.availableCities)}</DetailField>
              </div>
            </div>

            {/* Bank + ID numbers */}
            <div>
              <SectionTitle>Identity & Bank</SectionTitle>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <DetailField label="Aadhaar">{display(selectedEngineer.aadhar?.number)}</DetailField>
                <DetailField label="PAN">{display(selectedEngineer.pan?.number)}</DetailField>
                <DetailField label="CGPE Aadhaar">{display(cgpeStatus?.aadhaar?.status)} {cgpeStatus?.aadhaar?.documentNumberMasked ? `(${cgpeStatus.aadhaar.documentNumberMasked})` : ''}</DetailField>
                <DetailField label="CGPE PAN">{display(cgpeStatus?.pan?.status)} {cgpeStatus?.pan?.documentNumberMasked ? `(${cgpeStatus.pan.documentNumberMasked})` : ''}</DetailField>
                <DetailField label="Account Holder">{display(selectedEngineer.bankDetails?.accountHolder)}</DetailField>
                <DetailField label="Account Number">{display(selectedEngineer.bankDetails?.accountNumber)}</DetailField>
                <DetailField label="IFSC">{display(selectedEngineer.bankDetails?.ifscCode)}</DetailField>
                <DetailField label="Bank Name">{display(selectedEngineer.bankDetails?.bankName)}</DetailField>
                <DetailField label="UPI">{display(selectedEngineer.bankDetails?.upiId)}</DetailField>
                <DetailField label="Joining Fee Paid">{display(selectedEngineer.joiningFeePaid)}</DetailField>
                <DetailField label="Joining Fee Amount">{selectedEngineer.joiningFeeFinalAmount || selectedEngineer.joiningFeeAmount ? `₹${selectedEngineer.joiningFeeFinalAmount || selectedEngineer.joiningFeeAmount}` : '—'}</DetailField>
                <DetailField label="Coupon">{display(selectedEngineer.couponCode)}</DetailField>
              </div>
            </div>

            {/* Media + documents gallery */}
            <div>
              <SectionTitle>Media & Documents</SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <DocThumb
                  label="Selfie"
                  url={selectedEngineer.selfieUrl}
                  status={selectedEngineer.selfieStatus}
                  onPreview={setPreviewDoc}
                />
                <DocThumb
                  label="Intro Video"
                  url={selectedEngineer.introVideoUrl}
                  status={selectedEngineer.introVideoStatus}
                  onPreview={setPreviewDoc}
                />
                <DocThumb
                  label="Aadhaar Front"
                  url={selectedEngineer.aadhar?.document || selectedEngineer.documents?.aadhaar || selectedEngineer.documents?.aadhaarFrontUrl}
                  onPreview={setPreviewDoc}
                />
                <DocThumb
                  label="Aadhaar Back"
                  url={selectedEngineer.aadhar?.backDocument}
                  onPreview={setPreviewDoc}
                />
                <DocThumb
                  label="PAN Document"
                  url={selectedEngineer.pan?.document || selectedEngineer.documents?.pan}
                  onPreview={setPreviewDoc}
                />
                <DocThumb
                  label="Driving License"
                  url={selectedEngineer.drivingLicenseUrl || selectedEngineer.licenseUrl}
                  status={selectedEngineer.licenseVerificationStatus}
                  onPreview={setPreviewDoc}
                />
                <DocThumb
                  label="RC Document"
                  url={selectedEngineer.rcUrl}
                  onPreview={setPreviewDoc}
                />
                <DocThumb
                  label="Education Certificate"
                  url={selectedEngineer.educationCertificateUrl}
                  status={selectedEngineer.educationCertificateStatus}
                  onPreview={setPreviewDoc}
                />
                <DocThumb
                  label="Police Verification"
                  url={selectedEngineer.policeVerification?.document}
                  status={selectedEngineer.policeVerification?.status}
                  onPreview={setPreviewDoc}
                />
                {(selectedEngineer.uploadedDocuments || []).map((doc, idx) => (
                  <React.Fragment key={`up-${doc.key || idx}`}>
                    <DocThumb
                      label={String(doc.key || `Document ${idx + 1}`).replace(/_/g, ' ')}
                      url={doc.url}
                      status={doc.status}
                      onPreview={setPreviewDoc}
                    />
                    {doc.backUrl ? (
                      <DocThumb
                        label={`${String(doc.key || 'Document').replace(/_/g, ' ')} (Back)`}
                        url={doc.backUrl}
                        status={doc.status}
                        onPreview={setPreviewDoc}
                      />
                    ) : null}
                  </React.Fragment>
                ))}
                {(selectedEngineer.skillCertificates || []).map((cert, idx) => (
                  <DocThumb
                    key={`cert-${idx}`}
                    label={cert.name || `Skill Certificate ${idx + 1}`}
                    url={cert.documentUrl}
                    onPreview={setPreviewDoc}
                  />
                ))}
                {(cgpeStatus?.aadhaar?.fileUrl || cgpeStatus?.aadhaar?.backFileUrl) ? (
                  <>
                    <DocThumb label="CGPE Aadhaar File" url={cgpeStatus.aadhaar.fileUrl} status={cgpeStatus.aadhaar.physicalUploadStatus || cgpeStatus.aadhaar.status} onPreview={setPreviewDoc} />
                    <DocThumb label="CGPE Aadhaar Back" url={cgpeStatus.aadhaar.backFileUrl} status={cgpeStatus.aadhaar.physicalUploadStatus || cgpeStatus.aadhaar.status} onPreview={setPreviewDoc} />
                  </>
                ) : null}
                {(cgpeStatus?.pan?.fileUrl || cgpeStatus?.pan?.backFileUrl) ? (
                  <>
                    <DocThumb label="CGPE PAN File" url={cgpeStatus.pan.fileUrl} status={cgpeStatus.pan.physicalUploadStatus || cgpeStatus.pan.status} onPreview={setPreviewDoc} />
                    <DocThumb label="CGPE PAN Back" url={cgpeStatus.pan.backFileUrl} status={cgpeStatus.pan.physicalUploadStatus || cgpeStatus.pan.status} onPreview={setPreviewDoc} />
                  </>
                ) : null}
                {verificationDocuments.map((doc) => (
                  <DocThumb
                    key={doc._id}
                    label={`${String(doc.documentType || 'Document').replace(/_/g, ' ')}${doc.side && doc.side !== 'single' ? ` (${doc.side})` : ''}`}
                    url={doc.signedPreviewUrl || doc.fileUrl}
                    status={doc.status}
                    onPreview={setPreviewDoc}
                  />
                ))}
              </div>
              {!selectedEngineer.selfieUrl &&
                !selectedEngineer.introVideoUrl &&
                !selectedEngineer.aadhar?.document &&
                !selectedEngineer.pan?.document &&
                !(selectedEngineer.uploadedDocuments || []).length &&
                !verificationDocuments.length && (
                  <p className="text-sm text-gray-500 text-center py-6 border border-dashed border-gray-200 rounded-xl mt-2">
                    No documents uploaded yet.
                  </p>
                )}
            </div>

            {selectedEngineer.approvalStatus === 'pending' && (
              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={async () => {
                    await handleApprove(selectedEngineer.id);
                    setIsViewModalOpen(false);
                    setSelectedEngineer(null);
                  }}
                  className="flex-1 px-4 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                >
                  <FiCheck className="w-5 h-5" />
                  Approve Engineer
                </button>
                <button
                  onClick={async () => {
                    await handleReject(selectedEngineer.id);
                    setIsViewModalOpen(false);
                    setSelectedEngineer(null);
                  }}
                  className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                >
                  <FiX className="w-5 h-5" />
                  Reject Engineer
                </button>
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      <DocumentPreviewModal
        open={Boolean(previewDoc?.url)}
        url={previewDoc?.url}
        title={previewDoc?.title || 'Document'}
        onClose={() => setPreviewDoc(null)}
      />

      {/* Pay Engineer Modal */}
      <Modal
        isOpen={isPayModalOpen}
        onClose={() => {
          setIsPayModalOpen(false);
          setSelectedEngineer(null);
        }}
        title={`Record Payment for ${selectedEngineer?.name}`}
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Amount (₹)</label>
            <input
              type="number"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              placeholder="Enter amount"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Notes (Optional)</label>
            <textarea
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
              placeholder="Add payment reference or notes"
              rows="3"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleRecordPayment}
            disabled={paySubmitting}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {paySubmitting ? 'Processing...' : 'Confirm Payment'}
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default AllEngineers;
