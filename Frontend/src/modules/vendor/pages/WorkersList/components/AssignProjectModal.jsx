import React, { useState, useEffect } from 'react';
import { FiAlertCircle, FiCheck, FiX, FiInfo } from 'react-icons/fi';
import { useWorkforce } from '../../../hooks/useWorkforce';
import toast from 'react-hot-toast';
import LogoLoader from '../../../../../components/common/LogoLoader';

const AssignProjectModal = ({ isOpen, onClose, members, onAssignmentComplete }) => {
  const { getAvailableProjects, getProjectScopeDetails, validateAssignment, createDynamicAssignment } = useWorkforce();
  
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [validating, setValidating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  const [projects, setProjects] = useState([]);
  const [projectDetails, setProjectDetails] = useState(null);
  
  const [validationResult, setValidationResult] = useState(null);

  const [formData, setFormData] = useState({
    memberId: '',
    projectId: '',
    assignmentScope: 'PROJECT',
    milestoneId: '',
    siteId: '',
    taskId: '',
    assignedRole: '',
    startDate: '',
    endDate: '',
    allocationPercent: 100,
    plannedHoursPerDay: 8,
    priority: 'Medium',
    notes: ''
  });

  useEffect(() => {
    if (isOpen) {
      fetchProjects();
      resetForm();
    }
  }, [isOpen]);

  const fetchProjects = async () => {
    setLoadingProjects(true);
    try {
      const res = await getAvailableProjects();
      if (res?.success) {
        setProjects(res.data || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingProjects(false);
    }
  };

  const handleProjectChange = async (projectId) => {
    setFormData(prev => ({ 
      ...prev, 
      projectId, 
      milestoneId: '', 
      siteId: '', 
      taskId: '', 
      assignedRole: '', 
      assignmentScope: 'PROJECT' 
    }));
    setProjectDetails(null);
    setValidationResult(null);

    if (!projectId) return;

    setLoadingDetails(true);
    try {
      const res = await getProjectScopeDetails(projectId);
      if (res?.success) {
        setProjectDetails(res.data);
        const p = res.data.project;
        if (p.startDate && p.expectedEndDate) {
          setFormData(prev => ({
            ...prev,
            startDate: p.startDate.split('T')[0],
            endDate: p.expectedEndDate.split('T')[0]
          }));
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDetails(false);
    }
  };

  const resetForm = () => {
    setFormData({
      memberId: '',
      projectId: '',
      assignmentScope: 'PROJECT',
      milestoneId: '',
      siteId: '',
      taskId: '',
      assignedRole: '',
      startDate: '',
      endDate: '',
      allocationPercent: 100,
      plannedHoursPerDay: 8,
      priority: 'Medium',
      notes: ''
    });
    setProjectDetails(null);
    setValidationResult(null);
  };

  const handleValidate = async () => {
    if (!formData.memberId || !formData.projectId || !formData.startDate || !formData.endDate || !formData.allocationPercent) {
      toast.error('Please fill all required fields before validating');
      return;
    }
    
    setValidating(true);
    try {
      const res = await validateAssignment({
        memberId: formData.memberId,
        projectId: formData.projectId,
        startDate: formData.startDate,
        endDate: formData.endDate,
        allocationPercent: formData.allocationPercent,
        requiredSkills: [] // To be extracted from task/role if available
      });
      if (res?.success) {
        setValidationResult(res.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setValidating(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validationResult?.valid) {
      toast.error('Please resolve validation errors before assigning');
      return;
    }
    
    setSubmitting(true);
    try {
      const res = await createDynamicAssignment(formData);
      if (res?.success) {
        onAssignmentComplete();
        onClose();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
          <h3 className="font-bold text-gray-800">Dynamic Project Assignment</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
        </div>
        
        <div className="p-6 overflow-y-auto grow">
          <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg flex gap-3 text-blue-800 text-xs font-medium mb-6">
            <FiInfo size={16} className="shrink-0 mt-0.5" />
            <p>Assignments are securely connected to the Project OS. Allocations exceeding 100% bandwidth will be automatically blocked to prevent overworking.</p>
          </div>

          <form id="assignForm" onSubmit={handleSubmit} className="space-y-5">
            
            {/* Step 1: Member & Project */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Select Member <span className="text-red-500">*</span></label>
                <select required className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={formData.memberId} onChange={(e) => { setFormData({...formData, memberId: e.target.value}); setValidationResult(null); }}>
                  <option value="">Select a team member</option>
                  {members.filter(m => m.isActive).map(m => (
                    <option key={m._id} value={m._id}>{m.name} ({m.roleId?.title})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Select Project <span className="text-red-500">*</span></label>
                <select required disabled={loadingProjects} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={formData.projectId} onChange={(e) => handleProjectChange(e.target.value)}>
                  <option value="">{loadingProjects ? 'Loading projects...' : 'Select a project'}</option>
                  {projects.map(p => (
                    <option key={p._id} value={p._id}>{p.projectCode} - {p.title}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Readonly Project Info */}
            {projectDetails && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 grid grid-cols-3 gap-2 text-xs">
                <div><span className="text-gray-500 font-medium">Category:</span> <span className="font-bold text-gray-700">{projectDetails.project.category}</span></div>
                <div><span className="text-gray-500 font-medium">Sub-Category:</span> <span className="font-bold text-gray-700">{projectDetails.project.subcategory || 'N/A'}</span></div>
                <div><span className="text-gray-500 font-medium">Template:</span> <span className="font-bold text-gray-700">{projectDetails.template.name}</span></div>
              </div>
            )}

            {/* Step 2: Scope & Role */}
            {projectDetails && (
              <div className="border border-gray-200 rounded-lg p-4 space-y-4">
                <h4 className="font-bold text-sm text-gray-800 border-b border-gray-100 pb-2">Scope & Role</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Assignment Scope <span className="text-red-500">*</span></label>
                    <select required className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={formData.assignmentScope} onChange={(e) => setFormData({...formData, assignmentScope: e.target.value})}>
                      <option value="PROJECT">Entire Project</option>
                      {projectDetails.milestones?.length > 0 && <option value="MILESTONE">Specific Milestone</option>}
                      {projectDetails.sites?.length > 0 && <option value="SITE">Specific Site</option>}
                      {projectDetails.tasks?.length > 0 && <option value="TASK">Specific Task</option>}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Assign As (Role) <span className="text-red-500">*</span></label>
                    <select required className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={formData.assignedRole} onChange={(e) => setFormData({...formData, assignedRole: e.target.value})}>
                      <option value="">Select a role</option>
                      {projectDetails.roles?.map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>

                  {formData.assignmentScope === 'MILESTONE' && (
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-gray-700 mb-1">Select Milestone <span className="text-red-500">*</span></label>
                      <select required className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={formData.milestoneId} onChange={(e) => setFormData({...formData, milestoneId: e.target.value})}>
                        <option value="">Select milestone</option>
                        {projectDetails.milestones.map(m => <option key={m._id} value={m._id}>{m.title}</option>)}
                      </select>
                    </div>
                  )}

                  {formData.assignmentScope === 'SITE' && (
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-gray-700 mb-1">Select Site <span className="text-red-500">*</span></label>
                      <select required className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={formData.siteId} onChange={(e) => setFormData({...formData, siteId: e.target.value})}>
                        <option value="">Select site</option>
                        {projectDetails.sites.map(s => <option key={s._id} value={s._id}>{s.siteCode} - {s.name}</option>)}
                      </select>
                    </div>
                  )}

                  {formData.assignmentScope === 'TASK' && (
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-gray-700 mb-1">Select Task <span className="text-red-500">*</span></label>
                      <select required className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={formData.taskId} onChange={(e) => setFormData({...formData, taskId: e.target.value})}>
                        <option value="">Select task</option>
                        {projectDetails.tasks.map(t => <option key={t._id} value={t._id}>{t.taskCode} - {t.title}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 3: Schedule & Workload */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Start Date <span className="text-red-500">*</span></label>
                <input required type="date" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={formData.startDate} onChange={(e) => { setFormData({...formData, startDate: e.target.value}); setValidationResult(null); }} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">End Date <span className="text-red-500">*</span></label>
                <input required type="date" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={formData.endDate} onChange={(e) => { setFormData({...formData, endDate: e.target.value}); setValidationResult(null); }} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Allocation % (1-100) <span className="text-red-500">*</span></label>
                <input required type="number" min="1" max="100" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={formData.allocationPercent} onChange={(e) => { setFormData({...formData, allocationPercent: parseInt(e.target.value)}); setValidationResult(null); }} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Priority</label>
                <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={formData.priority} onChange={(e) => setFormData({...formData, priority: e.target.value})}>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>
            </div>

            {/* Validation Panel */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="flex justify-between items-center mb-3">
                <h4 className="font-bold text-sm text-gray-800">Validation Summary</h4>
                <button type="button" onClick={handleValidate} disabled={validating || !formData.memberId || !formData.projectId} className="px-3 py-1 bg-[#0D8A72] text-white text-xs font-bold rounded hover:bg-[#0a6b58] disabled:opacity-50">
                  {validating ? 'Checking...' : 'Run Validation'}
                </button>
              </div>

              {!validationResult ? (
                <p className="text-xs text-gray-500 italic text-center py-2">Click 'Run Validation' to check bandwidth constraints.</p>
              ) : (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 text-xs font-medium">Availability Status:</span>
                    {validationResult.valid ? (
                      <span className="text-green-600 font-bold flex items-center gap-1"><FiCheck /> Available</span>
                    ) : (
                      <span className="text-red-600 font-bold flex items-center gap-1"><FiX /> Overbooked</span>
                    )}
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 text-xs font-medium">Current Allocation:</span>
                    <span className="font-bold text-gray-800">{validationResult.currentAllocation}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 text-xs font-medium">New Total Allocation:</span>
                    <span className={`font-bold ${validationResult.valid ? 'text-green-600' : 'text-red-600'}`}>{validationResult.resultingAllocation}%</span>
                  </div>
                  {validationResult.conflicts?.length > 0 && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-100 rounded text-red-700 text-xs">
                      {validationResult.conflicts.map((c, i) => <div key={i}>• {c}</div>)}
                    </div>
                  )}
                  {validationResult.warnings?.length > 0 && (
                    <div className="mt-2 p-2 bg-orange-50 border border-orange-100 rounded text-orange-700 text-xs">
                      {validationResult.warnings.map((w, i) => <div key={i}>• {w}</div>)}
                    </div>
                  )}
                </div>
              )}
            </div>
            
          </form>
        </div>

        <div className="px-6 py-4 flex justify-end gap-3 border-t border-gray-100 bg-gray-50 shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button 
            type="submit" 
            form="assignForm"
            disabled={submitting || !validationResult?.valid} 
            className="px-4 py-2 text-sm font-bold text-white bg-[#0D8A72] hover:bg-[#0a6b58] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">
            {submitting ? 'Creating Assignment...' : 'Finalize Assignment'}
          </button>
        </div>

      </div>
    </div>
  );
};

export default AssignProjectModal;
