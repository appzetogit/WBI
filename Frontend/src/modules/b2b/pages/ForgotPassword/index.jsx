import React from 'react';
import { useNavigate } from 'react-router-dom';
import ForgotPasswordFlow from '../../../../components/auth/ForgotPasswordFlow';

const ForgotPassword = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <ForgotPasswordFlow 
        role="b2b" 
        onBack={() => navigate('/b2b/login')}
        onSuccess={() => navigate('/b2b/login')}
      />
    </div>
  );
};

export default ForgotPassword;
