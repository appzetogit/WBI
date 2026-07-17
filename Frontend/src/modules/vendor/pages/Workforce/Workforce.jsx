import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import WorkforceLayout from './components/WorkforceLayout';
import Engineers from './Engineers';
import ProjectTeams from './ProjectTeams';
import TeamStructure from './TeamStructure';
import SkillMatrix from './SkillMatrix';
import Assignments from './Assignments';
import Availability from './Availability';
import Attendance from './Attendance';
import LeaveCalendar from './LeaveCalendar';
import Certifications from './Certifications';

const Workforce = () => (
  <Routes>
    <Route element={<WorkforceLayout />}>
      <Route path="/" element={<Navigate to="engineers" replace />} />
      <Route path="engineers" element={<Engineers />} />
      <Route path="teams" element={<ProjectTeams />} />
      <Route path="structure" element={<TeamStructure />} />
      <Route path="skills" element={<SkillMatrix />} />
      <Route path="assignments" element={<Assignments />} />
      <Route path="availability" element={<Availability />} />
      <Route path="attendance" element={<Attendance />} />
      <Route path="leave" element={<LeaveCalendar />} />
      <Route path="certifications" element={<Certifications />} />
    </Route>
  </Routes>
);

export default Workforce;
