import api from '../../../services/api';

export const workforceService = {
  // DASHBOARD
  getDashboardStats: async () => {
    const res = await api.get('/vendors/team/overview');
    return res.data;
  },
  getAnalytics: async (period) => {
    const res = await api.get('/vendors/team/analytics', { params: { period } });
    return res.data;
  },
  getActivity: async (params) => {
    const res = await api.get('/vendors/team/activity', { params });
    return res.data;
  },

  // DEPARTMENTS
  getDepartments: async () => {
    const res = await api.get('/vendors/team/departments');
    return res.data;
  },
  createDepartment: async (data) => {
    const res = await api.post('/vendors/team/departments', data);
    return res.data;
  },
  updateDepartment: async (id, data) => {
    const res = await api.put(`/vendors/team/departments/${id}`, data);
    return res.data;
  },
  deleteDepartment: async (id) => {
    const res = await api.delete(`/vendors/team/departments/${id}`);
    return res.data;
  },

  // ROLES
  getRoles: async () => {
    const res = await api.get('/vendors/team/roles');
    return res.data;
  },
  createRole: async (data) => {
    const res = await api.post('/vendors/team/roles', data);
    return res.data;
  },
  updateRole: async (id, data) => {
    const res = await api.put(`/vendors/team/roles/${id}`, data);
    return res.data;
  },
  deleteRole: async (id) => {
    const res = await api.delete(`/vendors/team/roles/${id}`);
    return res.data;
  },

  // SKILLS CATALOG
  getSkills: async () => {
    const res = await api.get('/vendors/team/skills');
    return res.data;
  },
  createSkill: async (data) => {
    const res = await api.post('/vendors/team/skills', data);
    return res.data;
  },
  updateSkill: async (id, data) => {
    const res = await api.put(`/vendors/team/skills/${id}`, data);
    return res.data;
  },
  deleteSkill: async (id) => {
    const res = await api.delete(`/vendors/team/skills/${id}`);
    return res.data;
  },

  // SKILL MATRIX
  getMemberSkillMatrix: async (memberId) => {
    const res = await api.get(`/vendors/team/skill-matrix/${memberId}`);
    return res.data;
  },
  upsertMemberSkill: async (data) => {
    const res = await api.post('/vendors/team/skill-matrix', data);
    return res.data;
  },
  deleteMemberSkill: async (id) => {
    const res = await api.delete(`/vendors/team/skill-matrix/${id}`);
    return res.data;
  },
  getSkillGapAnalysis: async () => {
    const res = await api.get('/vendors/team/skill-gap');
    return res.data;
  },

  // TEAM MEMBERS
  getTeamMembers: async (params) => {
    const res = await api.get('/vendors/team/members', { params });
    return res.data;
  },
  getMemberProfile: async (id) => {
    const res = await api.get(`/vendors/team/members/${id}`);
    return res.data;
  },
  addMember: async (data) => {
    const res = await api.post('/vendors/team/members', data);
    return res.data;
  },
  updateMember: async (id, data) => {
    const res = await api.put(`/vendors/team/members/${id}`, data);
    return res.data;
  },
  deleteMember: async (id) => {
    const res = await api.delete(`/vendors/team/members/${id}`);
    return res.data;
  },
  updateMemberStatus: async (id, status) => {
    const res = await api.patch(`/vendors/team/members/${id}/status`, { status });
    return res.data;
  },
  bulkUpdateMembers: async (data) => {
    const res = await api.patch('/vendors/team/members/bulk-update', data);
    return res.data;
  },

  // PROJECT ASSIGNMENTS
  getProjectAssignments: async (params) => {
    const res = await api.get('/vendors/team/assignments', { params });
    return res.data;
  },
  // Deprecated: assignProject
  // assignProject: async (data) => {
  //   const res = await api.post('/vendors/team/assignments', data);
  //   return res.data;
  // },
  updateProjectAssignment: async (id, data) => {
    const res = await api.put(`/vendors/team/assignments/${id}`, data);
    return res.data;
  },

  // DYNAMIC PROJECT ASSIGNMENTS (Project OS Connected)
  getAvailableProjects: async (params) => {
    const res = await api.get('/vendors/team/project-assignments/available-projects', { params });
    return res.data;
  },
  getProjectScopeDetails: async (projectId) => {
    const res = await api.get(`/vendors/team/project-assignments/projects/${projectId}/details`);
    return res.data;
  },
  validateAssignment: async (data) => {
    const res = await api.post('/vendors/team/project-assignments/validate', data);
    return res.data;
  },
  createDynamicAssignment: async (data) => {
    const res = await api.post('/vendors/team/project-assignments', data);
    return res.data;
  },

  // PERFORMANCE
  getPerformance: async (params) => {
    const res = await api.get('/vendors/team/performance', { params });
    return res.data;
  },
  upsertPerformance: async (data) => {
    const res = await api.post('/vendors/team/performance', data);
    return res.data;
  },

  // AVAILABILITY
  getAvailability: async () => {
    const res = await api.get('/vendors/team/availability');
    return res.data;
  },
  updateAvailability: async (id, data) => {
    const res = await api.patch(`/vendors/team/availability/${id}`, data);
    return res.data;
  },

  // LEAVES
  getLeaves: async (params) => {
    const res = await api.get('/vendors/team/leaves', { params });
    return res.data;
  },
  applyLeave: async (data) => {
    const res = await api.post('/vendors/team/leaves', data);
    return res.data;
  },
  approveLeave: async (id, approvedById) => {
    const res = await api.patch(`/vendors/team/leaves/${id}/approve`, { approvedById });
    return res.data;
  },
  rejectLeave: async (id, rejectionReason) => {
    const res = await api.patch(`/vendors/team/leaves/${id}/reject`, { rejectionReason });
    return res.data;
  },

  // ATTENDANCE
  getAttendance: async (params) => {
    const res = await api.get('/vendors/team/attendance', { params });
    return res.data;
  },
  markAttendance: async (data) => {
    const res = await api.post('/vendors/team/attendance', data);
    return res.data;
  },

  // CERTIFICATIONS
  getCertifications: async (params) => {
    const res = await api.get('/vendors/team/certifications', { params });
    return res.data;
  },
  addCertification: async (data) => {
    const res = await api.post('/vendors/team/certifications', data);
    return res.data;
  },
  updateCertification: async (id, data) => {
    const res = await api.put(`/vendors/team/certifications/${id}`, data);
    return res.data;
  },
  deleteCertification: async (id) => {
    const res = await api.delete(`/vendors/team/certifications/${id}`);
    return res.data;
  }
};
