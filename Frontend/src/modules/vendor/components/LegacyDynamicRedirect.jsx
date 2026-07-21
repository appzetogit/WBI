import React from 'react';
import { useLocation } from 'react-router-dom';
import VendorHomeRedirect from './VendorHomeRedirect';

/** Maps /vendor/dynamic/* → /vendor/:serviceSlug/* */
const LegacyDynamicRedirect = () => {
  const location = useLocation();
  const suffix = location.pathname.replace(/^\/vendor\/dynamic\/?/, '') || 'dashboard';
  return <VendorHomeRedirect suffix={suffix} />;
};

export default LegacyDynamicRedirect;
