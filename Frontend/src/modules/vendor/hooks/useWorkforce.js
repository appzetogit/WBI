import { useState, useCallback } from 'react';
import { workforceService } from '../services/workforceService';
import toast from 'react-hot-toast';

export const useWorkforce = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // DASHBOARD
  const getDashboardStats = useCallback(async () => {
    setLoading(true);
    try {
      const data = await workforceService.getDashboardStats();
      setError(null);
      return data;
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch dashboard stats');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // DEPARTMENTS
  const getDepartments = useCallback(async () => {
    setLoading(true);
    try {
      const data = await workforceService.getDepartments();
      return data;
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch departments');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createDepartment = useCallback(async (deptData) => {
    setLoading(true);
    try {
      const data = await workforceService.createDepartment(deptData);
      toast.success('Department created successfully');
      return data;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create department');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateDepartment = useCallback(async (id, deptData) => {
    setLoading(true);
    try {
      const data = await workforceService.updateDepartment(id, deptData);
      toast.success('Department updated successfully');
      return data;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update department');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteDepartment = useCallback(async (id) => {
    setLoading(true);
    try {
      const data = await workforceService.deleteDepartment(id);
      toast.success('Department deleted successfully');
      return data;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete department');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // ROLES
  const getRoles = useCallback(async () => {
    setLoading(true);
    try {
      const data = await workforceService.getRoles();
      return data;
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch roles');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createRole = useCallback(async (roleData) => {
    setLoading(true);
    try {
      const data = await workforceService.createRole(roleData);
      toast.success('Role created successfully');
      return data;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create role');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateRole = useCallback(async (id, roleData) => {
    setLoading(true);
    try {
      const data = await workforceService.updateRole(id, roleData);
      toast.success('Role updated successfully');
      return data;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update role');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteRole = useCallback(async (id) => {
    setLoading(true);
    try {
      const data = await workforceService.deleteRole(id);
      toast.success('Role deleted successfully');
      return data;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete role');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // TEAM MEMBERS
  const getTeamMembers = useCallback(async (params) => {
    setLoading(true);
    try {
      const data = await workforceService.getTeamMembers(params);
      return data;
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch team members');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getMemberProfile = useCallback(async (id) => {
    setLoading(true);
    try {
      const data = await workforceService.getMemberProfile(id);
      return data;
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch member profile');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const addMember = useCallback(async (memberData) => {
    setLoading(true);
    try {
      const data = await workforceService.addMember(memberData);
      toast.success('Team member added successfully');
      return data;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add team member');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateMember = useCallback(async (id, memberData) => {
    setLoading(true);
    try {
      const data = await workforceService.updateMember(id, memberData);
      toast.success('Team member updated successfully');
      return data;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update team member');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteMember = useCallback(async (id) => {
    setLoading(true);
    try {
      const data = await workforceService.deleteMember(id);
      toast.success('Team member deactivated successfully');
      return data;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to deactivate team member');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateMemberStatus = useCallback(async (id, status) => {
    setLoading(true);
    try {
      const data = await workforceService.updateMemberStatus(id, status);
      toast.success('Member status updated');
      return data;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update status');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const bulkUpdateMembers = useCallback(async (updateData) => {
    setLoading(true);
    try {
      const data = await workforceService.bulkUpdateMembers(updateData);
      toast.success('Members updated successfully');
      return data;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update members');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // SKILLS
  const getSkills = useCallback(async () => {
    setLoading(true);
    try {
      const data = await workforceService.getSkills();
      return data;
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch skills');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getSkillGapAnalysis = useCallback(async () => {
    setLoading(true);
    try {
      const data = await workforceService.getSkillGapAnalysis();
      return data;
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch skill gap analysis');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const upsertMemberSkill = useCallback(async (skillData) => {
    setLoading(true);
    try {
      const data = await workforceService.upsertMemberSkill(skillData);
      toast.success('Skill updated successfully');
      return data;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update skill');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // ASSIGNMENTS
  const getProjectAssignments = useCallback(async (params) => {
    setLoading(true);
    try {
      const data = await workforceService.getProjectAssignments(params);
      return data;
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch assignments');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // DYNAMIC ASSIGNMENTS
  const getAvailableProjects = useCallback(async (params) => {
    try {
      return await workforceService.getAvailableProjects(params);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to fetch available projects');
      throw err;
    }
  }, []);

  const getProjectScopeDetails = useCallback(async (projectId) => {
    try {
      return await workforceService.getProjectScopeDetails(projectId);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to fetch project details');
      throw err;
    }
  }, []);

  const validateAssignment = useCallback(async (validationData) => {
    try {
      return await workforceService.validateAssignment(validationData);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Validation failed');
      throw err;
    }
  }, []);

  const createDynamicAssignment = useCallback(async (assignmentData) => {
    setLoading(true);
    try {
      const data = await workforceService.createDynamicAssignment(assignmentData);
      toast.success('Dynamic project assignment created successfully');
      return data;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to assign project');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // AVAILABILITY
  const getAvailability = useCallback(async () => {
    setLoading(true);
    try {
      const data = await workforceService.getAvailability();
      return data;
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch availability');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // PERFORMANCE
  const getPerformance = useCallback(async (params) => {
    setLoading(true);
    try {
      const data = await workforceService.getPerformance(params);
      return data;
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch performance');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logPerformance = useCallback(async (perfData) => {
    setLoading(true);
    try {
      const data = await workforceService.upsertPerformance(perfData);
      toast.success('Performance logged successfully');
      return data;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to log performance');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // LEAVES
  const getLeaves = useCallback(async (params) => {
    setLoading(true);
    try {
      const data = await workforceService.getLeaves(params);
      return data;
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch leaves');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const applyLeave = useCallback(async (leaveData) => {
    setLoading(true);
    try {
      const data = await workforceService.applyLeave(leaveData);
      toast.success('Leave applied successfully');
      return data;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to apply leave');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const approveLeave = useCallback(async (id, approvedById) => {
    setLoading(true);
    try {
      const data = await workforceService.approveLeave(id, approvedById);
      toast.success('Leave approved successfully');
      return data;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to approve leave');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const rejectLeave = useCallback(async (id, reason) => {
    setLoading(true);
    try {
      const data = await workforceService.rejectLeave(id, reason);
      toast.success('Leave rejected');
      return data;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reject leave');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // ATTENDANCE
  const getAttendance = useCallback(async (params) => {
    setLoading(true);
    try {
      const data = await workforceService.getAttendance(params);
      return data;
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch attendance');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const markAttendance = useCallback(async (attendanceData) => {
    setLoading(true);
    try {
      const data = await workforceService.markAttendance(attendanceData);
      toast.success('Attendance marked successfully');
      return data;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to mark attendance');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    getDashboardStats,
    getDepartments,
    createDepartment,
    updateDepartment,
    deleteDepartment,
    getRoles,
    createRole,
    updateRole,
    deleteRole,
    getTeamMembers,
    getMemberProfile,
    addMember,
    updateMember,
    deleteMember,
    updateMemberStatus,
    bulkUpdateMembers,

    getSkills,
    getSkillGapAnalysis,
    upsertMemberSkill,
    
    // Project Assignments
    getProjectAssignments,
    getAvailableProjects,
    getProjectScopeDetails,
    validateAssignment,
    createDynamicAssignment,
    
    // Performance
    getAvailability,
    getPerformance,
    logPerformance,
    getLeaves,
    applyLeave,
    approveLeave,
    rejectLeave,
    getAttendance,
    markAttendance
  };
};
