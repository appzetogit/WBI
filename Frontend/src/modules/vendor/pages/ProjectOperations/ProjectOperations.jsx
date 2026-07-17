import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProjectOpsLayout from './components/ProjectOpsLayout';
import ProjectOS from './ProjectOS';
import SitesLocations from './SitesLocations';
import MilestonesTasks from './MilestonesTasks';
import DispatchCenter from './DispatchCenter';
import LiveOperations from './LiveOperations';
import CalendarSchedule from './CalendarSchedule';

const ProjectOperations = () => (
  <Routes>
    <Route element={<ProjectOpsLayout />}>
      <Route path="/" element={<Navigate to="os" replace />} />
      <Route path="os" element={<ProjectOS />} />
      <Route path="sites" element={<SitesLocations />} />
      <Route path="milestones" element={<MilestonesTasks />} />
      <Route path="dispatch" element={<DispatchCenter />} />
      <Route path="live" element={<LiveOperations />} />
      <Route path="calendar" element={<CalendarSchedule />} />
    </Route>
  </Routes>
);

export default ProjectOperations;
