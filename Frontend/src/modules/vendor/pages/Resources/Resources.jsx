import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ResourcesLayout from './components/ResourcesLayout';
import CapacityCenter from './CapacityCenter';
import Inventory from './Inventory';
import ToolsEquipment from './ToolsEquipment';
import Warehouses from './Warehouses';
import InstalledAssets from './InstalledAssets';

const Resources = () => (
  <Routes>
    <Route element={<ResourcesLayout />}>
      <Route path="/" element={<Navigate to="capacity" replace />} />
      <Route path="capacity" element={<CapacityCenter />} />
      <Route path="inventory" element={<Inventory />} />
      <Route path="tools" element={<ToolsEquipment />} />
      <Route path="warehouses" element={<Warehouses />} />
      <Route path="assets" element={<InstalledAssets />} />
    </Route>
  </Routes>
);

export default Resources;
