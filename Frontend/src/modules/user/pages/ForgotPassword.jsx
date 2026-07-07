import React from 'react';
import ForgotPasswordFlow from '../../../components/auth/ForgotPasswordFlow';

const ForgotPassword = () => {
  return <ForgotPasswordFlow role="user" loginRoute="/user/login" />;
};

export default ForgotPassword;
