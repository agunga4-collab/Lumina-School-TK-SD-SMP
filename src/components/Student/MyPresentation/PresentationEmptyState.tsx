import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, ClipboardList } from 'lucide-react';

interface PresentationEmptyStateProps {
  type: 'NO_PERIOD' | 'NO_RESPONSE';
}

export function PresentationEmptyState({ type }: PresentationEmptyStateProps) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center max-w-lg mx-auto">
      <div className="p-5 bg-blue-50 text-blue-600 rounded-[2rem] mb-6 shadow-sm">
        {type === 'NO_PERIOD' ? (
          <ClipboardList size={40} id="empty-state-period-icon" />
        ) : (
          <Target size={40} id="empty-state-response-icon" />
        )}
      </div>
      
      <h3 className="text-xl font-bold text-gray-900 tracking-tight mb-2">
        {type === 'NO_PERIOD' 
          ? 'My Presentation is not available yet.' 
          : 'Complete your Goal Setting to create your presentation.'
        }
      </h3>
      
      <p className="text-sm text-gray-500 leading-relaxed mb-6">
        {type === 'NO_PERIOD' 
          ? 'An active conference period has not been opened by the administration. Please check back later.' 
          : 'Your personalized conference slides are automatically generated based on your Goal Setting response. Complete it first to unlock your presentation.'
        }
      </p>

      {type === 'NO_RESPONSE' && (
        <button
          id="btn-go-to-goal-setting"
          onClick={() => navigate('/student/goal-setting')}
          className="px-6 py-3 bg-[#002366] text-white rounded-xl font-bold hover:opacity-95 transition-all shadow-md active:scale-95 cursor-pointer"
        >
          Go to Goal Setting
        </button>
      )}
    </div>
  );
}
