import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChevronRight, FileEdit } from 'lucide-react';
import { cn } from '../../../lib/utils';

interface PresentationHeaderProps {
  status: 'DRAFT' | 'SUBMITTED' | 'CONFERENCE_COMPLETED' | null;
  onBackToGoalSetting: () => void;
}

export function PresentationHeader({ status, onBackToGoalSetting }: PresentationHeaderProps) {
  return (
    <div className="space-y-4 w-full">
      {/* Title & Info */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-2 border-b border-gray-100">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">
            My Presentation
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Polished read-only slide sequence for your Three-Way Conference
          </p>
        </div>

        {status && (
          <div className="flex items-center gap-2 self-start md:self-center">
            <span className="text-xs font-mono font-bold text-gray-400 uppercase tracking-widest">
              Response Status:
            </span>
            <span
              id="presentation-status-badge"
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border",
                status === 'DRAFT'
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
              )}
            >
              {status === 'DRAFT' ? (
                <>
                  <FileEdit size={12} />
                  <span>Draft</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={12} />
                  <span>{status === 'SUBMITTED' ? 'Submitted' : 'Completed'}</span>
                </>
              )}
            </span>
          </div>
        )}
      </div>

      {/* Warning/Info Banners */}
      {status === 'DRAFT' && (
        <div
          id="banner-draft-warning"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl shadow-sm text-amber-800"
        >
          <div className="flex items-start sm:items-center gap-3">
            <AlertTriangle className="text-amber-600 shrink-0 mt-0.5 sm:mt-0" size={20} />
            <p className="text-sm font-medium leading-relaxed">
              This is a preview based on your draft. Submit your Goal Setting when you are ready for the Three-Way Conference.
            </p>
          </div>
          <button
            id="btn-continue-goal-setting"
            onClick={onBackToGoalSetting}
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-amber-700 transition-all shadow-sm shrink-0 text-center justify-center cursor-pointer"
          >
            <span>Continue Goal Setting</span>
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
