import * as React from 'react';
import { useNavigate } from 'react-router-dom';

export default function SEPlan() {
  const navigate = useNavigate();
  React.useEffect(() => {
    navigate('/self-exploration/my', { replace: true });
  }, [navigate]);

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
