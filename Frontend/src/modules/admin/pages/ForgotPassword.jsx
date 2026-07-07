import React from 'react';
import ForgotPasswordFlow from '../../../components/auth/ForgotPasswordFlow';

const ForgotPassword = () => {
  return <ForgotPasswordFlow role="admin" loginRoute="/admin/login" />;
};

export default ForgotPassword;
