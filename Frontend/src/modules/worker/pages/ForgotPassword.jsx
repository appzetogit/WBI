import React from 'react';
import ForgotPasswordFlow from '../../../components/auth/ForgotPasswordFlow';

const ForgotPassword = () => {
  return <ForgotPasswordFlow role="worker" loginRoute="/worker/login" />;
};

export default ForgotPassword;
