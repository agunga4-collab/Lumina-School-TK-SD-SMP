import * as React from 'react';
import { useAuth } from '../../context/AuthContext';
import { Navigate } from 'react-router-dom';

export default function SEDashboard() {
  const { profile } = useAuth();

  if (!profile) return null;

  // Student portal has its own route, but let's handle redirection here as well
  if (profile.role === 'STUDENT') {
    return <Navigate to="/self-exploration/my" replace />;
  }

  if (['SUPER_ADMIN', 'HEAD_UNIT'].includes(profile.role)) {
    return <Navigate to="/self-exploration/periods" replace />;
  }

  if (profile.role === 'TEACHER') {
    return <Navigate to="/self-exploration/class" replace />;
  }

  return (
    <div className="p-20 text-center uppercase font-black text-xs text-gray-400">
       Access Denied for this role.
    </div>
  );
}
