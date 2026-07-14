import React, { useState, useEffect, useCallback } from 'react';
import { FiBriefcase, FiPlus, FiAlertCircle, FiCheckCircle } from 'react-icons/fi';
import { useWorkforce } from '../../../hooks/useWorkforce';
import LogoLoader from '../../../../../components/common/LogoLoader';
import toast from 'react-hot-toast';

const ProjectAssignmentTab = () => {
  const { 
    getProjectAssignments, 
    getTeamMembers, 
    updateProjectAssignment,
    getAvailableProjects,
    getProjectScopeDetails,
    validateAssignment,
    createDynamicAssignment,
    loading 
  } = useWorkforce();
  
  const [assignments, setAssignments] = useState([]);
  const [members, setMembers] = useState([]);
  const [availableProjects, setAvailableProjects] = useState([]);
  const [projectDetails, setProjectDetails] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  
  const initialFormState = { 
    memberId: '', projectId: '', assignmentScope: 'PROJECT',
    milestoneId: '', siteId: '', taskId: '', assignedRole: '', 
    startDate: '', endDate: '', allocationPercent: 100, 
    plannedHoursPerDay: 8, priority: 'Medium', notes: ''
  };
  
  const [formData, setFormData] = useState(initialFormState);

  const fetchData = useCallback(async () => {
    try {
      const [assignRes, memberRes] = await Promise.all([
        getProjectAssignments({}),
        getTeamMembers({ limit: 1000 })
      ]);
      if (assignRes?.success) setAssignments(assignRes.data || []);
      if (memberRes?.success) setMembers(memberRes.data?.data || memberRes.data || []);
    } catch (e) {
      console.error(e);
    }
  }, [getProjectAssignments, getTeamMembers]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openModal = async () => {
    setFormData(initialFormState);
    setValidationResult(null);
    setIsModalOpen(true);
    try {
      const projRes = await getAvailableProjects({});
      if (projRes?.success) setAvailableProjects(projRes.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleProjectSelect = async (projectId) => {
    setFormData({ ...formData, projectId, assignmentScope: 'PROJECT', milestoneId: '', siteId: '', taskId: '', assignedRole: '' });
    setValidationResult(null);
    if (!projectId) {
      setProjectDetails(null);
      return;
    }
    try {
      const res = await getProjectScopeDetails(projectId);
      if (res?.success) {
        setProjectDetails(res.data);
        const proj = res.data.project;
        if (proj) {
          setFormData(prev => ({
            ...prev,
            startDate: proj.startDate ? proj.startDate.split('T')[0] : prev.startDate,
            endDate: proj.expectedEndDate ? proj.expectedEndDate.split('T')[0] : prev.endDate
          }));
        }
      }
    } catch (e) {
      console.error(e);
      setProjectDetails(null);
    }
  };

  const handleValidate = async () => {
    if (!formData.memberId || !formData.projectId || !formData.startDate || !formData.endDate || !formData.allocationPercent) {
      toast.error('Please fill all required fields');
      return;
    }
    setIsValidating(true);
    try {
      const res = await validateAssignment(formData);
      if (res?.success) {
        setValidationResult(res.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsValidating(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validationResult || !validationResult.valid) {
      toast.error('Please validate the assignment first and ensure no conflicts.');
      return;
    }
    try {
      await createDynamicAssignment(formData);
      setIsModalOpen(false);
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateStatus = async (id, status) => {
    try {
      await updateProjectAssignment(id, { status });
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };
  
  const formatDate = (dateString) => {
    if (!dateString) return 'Not available';
    const d = new Date(dateString);
    return isNaN(d.getTime()) ? 'Not available' : d.toLocaleDateString();
  };

  if (loading && assignments.length === 0) return <div className="py-20"><LogoLoader /></div>;

  return (
    <div className="space-y-6">
      
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-gray-800">Project Assignments</h3>
        <button onClick={openModal} className="bg-[#0D8A72] text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-[#0a6b58] transition-colors">
          <FiPlus /> Assign Project
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Active Assignments Column */}
        <div className="lg:col-span-2 space-y-4">
          <h4 className="font-bold text-gray-600 uppercase text-xs tracking-wider">Active Allocations</h4>
          {assignments.filter(a => a.status === 'Active' || a.status === 'ACTIVE' || a.status === 'PENDING_ACCEPTANCE' || a.status === 'ACCEPTED').map(a => (
            <div key={a._id} className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <img src={a.memberId?.profileImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(a.memberId?.name || 'U')}`} className="w-10 h-10 rounded-full" />
                <div>
                  <p className="font-bold text-gray-800">{a.memberId?.name}</p>
                  <p className="text-[10px] text-gray-500 font-medium">{a.memberId?.roleId?.title}</p>
                </div>
              </div>
              
              <div className="flex-1 max-w-sm">
                <div className="flex justify-between items-center mb-1">
                  <p className="font-bold text-gray-800 text-sm">{a.projectName || a.projectId?.title}</p>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${a.priority === 'High' || a.priority === 'Critical' ? 'bg-red-100 text-red-600' : a.priority === 'Medium' ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'}`}>{a.priority}</span>
                </div>
                <div className="flex justify-between text-[10px] text-gray-500 mb-1 font-medium">
                  <span>{formatDate(a.startDate)}</span>
                  <span>{formatDate(a.endDate)}</span>
                </div>
                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-[#0D8A72]" style={{ width: `${a.allocationPercent}%` }}></div>
                </div>
                <p className="text-[9px] text-gray-400 text-right mt-0.5">Allocated: {a.allocationPercent}% ({a.status})</p>
              </div>

              <div className="flex md:flex-col gap-2 shrink-0">
                <button onClick={() => handleUpdateStatus(a._id, 'COMPLETED')} className="px-3 py-1 bg-green-50 text-green-600 hover:bg-green-100 rounded text-xs font-bold transition-colors">Mark Complete</button>
                <button onClick={() => handleUpdateStatus(a._id, 'CANCELLED')} className="px-3 py-1 bg-gray-50 text-gray-600 hover:bg-gray-100 rounded text-xs font-bold transition-colors">Cancel</button>
              </div>
            </div>
          ))}
          {assignments.filter(a => a.status === 'Active' || a.status === 'ACTIVE' || a.status === 'PENDING_ACCEPTANCE' || a.status === 'ACCEPTED').length === 0 && (
            <p className="text-sm text-gray-500 p-5 bg-gray-50 rounded-xl text-center border border-dashed border-gray-200">No active project assignments.</p>
          )}
        </div>

        {/* History / Completed Column */}
        <div className="space-y-4">
          <h4 className="font-bold text-gray-600 uppercase text-xs tracking-wider">Completed / Past</h4>
          {assignments.filter(a => a.status !== 'Active' && a.status !== 'ACTIVE' && a.status !== 'PENDING_ACCEPTANCE' && a.status !== 'ACCEPTED').slice(0, 10).map(a => (
            <div key={a._id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm opacity-75">
              <div className="flex items-center gap-2 mb-2">
                <img src={a.memberId?.profileImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(a.memberId?.name || 'U')}`} className="w-6 h-6 rounded-full" />
                <div>
                  <p className="font-bold text-gray-800 text-xs">{a.memberId?.name}</p>
                  <p className="text-[9px] text-gray-500 font-medium">{a.projectName || a.projectId?.title}</p>
                </div>
              </div>
              <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-50">
                <span className={`text-[10px] font-bold ${a.status === 'COMPLETED' || a.status === 'Completed' ? 'text-green-500' : 'text-gray-500'}`}>{a.status}</span>
                <span className="text-[9px] text-gray-400">{formatDate(a.endDate)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-gray-800">Assign Project to Team Member</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              
              <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg flex gap-3 text-blue-800 text-xs font-medium">
                <FiAlertCircle size={16} className="shrink-0 mt-0.5" />
                <p>Select an active project, define the assignment scope, validate availability, and confirm the assignment.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
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
                  <select required className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={formData.projectId} onChange={(e) => handleProjectSelect(e.target.value)}>
                    <option value="">Select a project</option>
                    {availableProjects.map(p => (
                      <option key={p._id} value={p._id}>{p.projectCode} - {p.title}</option>
                    ))}
                  </select>
                </div>
              </div>

              {projectDetails && (
                <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <p><span className="font-bold text-gray-600">Category:</span> {projectDetails.project?.category?.name || projectDetails.project?.category || 'N/A'}</p>
                    <p><span className="font-bold text-gray-600">Sub-Service:</span> {projectDetails.project?.subcategory?.name || projectDetails.project?.subcategory || 'N/A'}</p>
                    <p><span className="font-bold text-gray-600">Client:</span> {projectDetails.project?.clientName}</p>
                    <p><span className="font-bold text-gray-600">Template:</span> {projectDetails.template?.name}</p>
                  </div>
                </div>
              )}

              {projectDetails && (
                <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Assignment Scope</label>
                    <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={formData.assignmentScope} onChange={(e) => setFormData({...formData, assignmentScope: e.target.value, milestoneId: '', siteId: '', taskId: ''})}>
                      <option value="PROJECT">Entire Project</option>
                      {projectDetails.milestones?.length > 0 && <option value="MILESTONE">Specific Milestone</option>}
                      {projectDetails.sites?.length > 0 && <option value="SITE">Specific Site</option>}
                      {projectDetails.tasks?.length > 0 && <option value="TASK">Specific Task</option>}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Assign as Role</label>
                    <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={formData.assignedRole} onChange={(e) => setFormData({...formData, assignedRole: e.target.value})}>
                      <option value="">Select Role (Optional)</option>
                      {projectDetails.roles?.map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>

                  {formData.assignmentScope === 'MILESTONE' && (
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-gray-700 mb-1">Select Milestone</label>
                      <select required className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={formData.milestoneId} onChange={(e) => setFormData({...formData, milestoneId: e.target.value})}>
                        <option value="">Select milestone</option>
                        {projectDetails.milestones?.map(m => (
                          <option key={m._id} value={m._id}>{m.title}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {formData.assignmentScope === 'SITE' && (
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-gray-700 mb-1">Select Site</label>
                      <select required className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={formData.siteId} onChange={(e) => setFormData({...formData, siteId: e.target.value})}>
                        <option value="">Select site</option>
                        {projectDetails.sites?.map(s => (
                          <option key={s._id} value={s._id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {formData.assignmentScope === 'TASK' && (
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-gray-700 mb-1">Select Task</label>
                      <select required className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={formData.taskId} onChange={(e) => setFormData({...formData, taskId: e.target.value})}>
                        <option value="">Select task</option>
                        {projectDetails.tasks?.map(t => (
                          <option key={t._id} value={t._id}>{t.title}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Start Date <span className="text-red-500">*</span></label>
                  <input required type="date" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={formData.startDate} onChange={(e) => { setFormData({...formData, startDate: e.target.value}); setValidationResult(null); }} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">End Date <span className="text-red-500">*</span></label>
                  <input required type="date" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={formData.endDate} onChange={(e) => { setFormData({...formData, endDate: e.target.value}); setValidationResult(null); }} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
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

              {/* Validation Summary */}
              {validationResult && (
                <div className={`p-4 rounded-lg border text-sm ${validationResult.valid ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                  <h4 className="font-bold flex items-center gap-2 mb-2">
                    {validationResult.valid ? <><FiCheckCircle /> Validation Successful</> : <><FiAlertCircle /> Validation Failed</>}
                  </h4>
                  <ul className="list-disc pl-5 space-y-1 text-xs">
                    <li>Current Allocation: {validationResult.currentAllocation}%</li>
                    <li>Resulting Allocation: {validationResult.resultingAllocation}%</li>
                    <li>Skill Match: {validationResult.skillMatchPercentage}%</li>
                    {validationResult.missingSkills?.length > 0 && <li>Missing Skills: {validationResult.missingSkills.join(', ')}</li>}
                    {validationResult.conflicts?.map((c, i) => <li key={i} className="text-red-600 font-bold">{c}</li>)}
                    {validationResult.warnings?.map((c, i) => <li key={i} className="text-orange-600">{c}</li>)}
                  </ul>
                </div>
              )}

              <div className="pt-4 flex justify-end gap-3 border-t border-gray-100 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50 rounded-lg">Cancel</button>
                
                {!validationResult ? (
                  <button type="button" onClick={handleValidate} disabled={isValidating || !formData.memberId || !formData.projectId} className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
                    {isValidating ? 'Validating...' : 'Validate Assignment'}
                  </button>
                ) : (
                  <button type="submit" disabled={loading || !validationResult.valid} className="px-4 py-2 text-sm font-bold text-white bg-[#0D8A72] hover:bg-[#0a6b58] rounded-lg disabled:opacity-50">
                    {loading ? 'Assigning...' : 'Confirm Assignment'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default ProjectAssignmentTab;
