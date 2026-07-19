import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, ArrowRight, Play, X, ArrowLeftSquare 
} from 'lucide-react';
import { cn } from '../../../lib/utils';

interface PresentationControlsProps {
  currentSlideIndex: number;
  totalSlides: number;
  isPresentMode: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onTogglePresentMode: () => void;
  onBackToGoalSetting?: () => void;
}

export function PresentationControls({
  currentSlideIndex,
  totalSlides,
  isPresentMode,
  onPrevious,
  onNext,
  onTogglePresentMode,
  onBackToGoalSetting
}: PresentationControlsProps) {
  const navigate = useNavigate();

  const handleBackToGoalSetting = onBackToGoalSetting || (() => {
    navigate('/student/goal-setting');
  });

  const isFirst = currentSlideIndex === 0;
  const isLast = currentSlideIndex === totalSlides - 1;

  if (isPresentMode) {
    // Present Mode controls (compact, dark-theme aligned or clean overlay)
    return (
      <div className="flex items-center justify-between gap-4 max-w-xl mx-auto w-full px-6 py-4 bg-gray-900 rounded-3xl border border-gray-800 shadow-2xl">
        <button
          id="btn-present-prev"
          onClick={onPrevious}
          disabled={isFirst}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer",
            isFirst 
              ? "text-gray-600 bg-gray-800/40 cursor-not-allowed" 
              : "text-white bg-gray-800 hover:bg-gray-700 active:scale-95"
          )}
          aria-label="Previous Slide"
        >
          <ArrowLeft size={16} />
          <span>Previous</span>
        </button>

        <span className="text-xs font-mono font-bold text-gray-400">
          {currentSlideIndex + 1} / {totalSlides}
        </span>

        <div className="flex items-center gap-3">
          <button
            id="btn-present-exit"
            onClick={onTogglePresentMode}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm text-red-400 bg-red-950/40 border border-red-900/30 hover:bg-red-900/20 transition-all active:scale-95 cursor-pointer"
            aria-label="Exit Present Mode"
          >
            <X size={16} />
            <span className="hidden sm:inline">Exit</span>
          </button>

          <button
            id="btn-present-next"
            onClick={onNext}
            disabled={isLast}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer",
              isLast 
                ? "text-gray-600 bg-gray-800/40 cursor-not-allowed" 
                : "text-white bg-[#002366] hover:opacity-95 active:scale-95"
            )}
            aria-label="Next Slide"
          >
            <span>Next</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    );
  }

  // Normal Preview Mode controls
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 w-full py-4 border-t border-gray-100 mt-6">
      <button
        id="btn-back-to-goal"
        onClick={handleBackToGoalSetting}
        className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-800 transition-colors py-2 px-3 rounded-xl hover:bg-gray-100 cursor-pointer"
      >
        <ArrowLeftSquare size={18} />
        <span>Back to Goal Setting</span>
      </button>

      <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
        <button
          id="btn-prev-slide"
          onClick={onPrevious}
          disabled={isFirst}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm border transition-all cursor-pointer",
            isFirst 
              ? "text-gray-300 bg-gray-50 border-gray-100 cursor-not-allowed" 
              : "text-gray-700 bg-white border-gray-200 hover:bg-gray-50 active:scale-95"
          )}
          aria-label="Previous Slide"
        >
          <ArrowLeft size={16} />
          <span>Previous</span>
        </button>

        <button
          id="btn-toggle-present"
          onClick={onTogglePresentMode}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm text-blue-700 bg-blue-50 border border-blue-100 hover:bg-blue-100/50 transition-all active:scale-95 cursor-pointer"
          aria-label="Enter Present Mode"
        >
          <Play size={16} className="fill-blue-700 text-blue-700" />
          <span>Present</span>
        </button>

        <button
          id="btn-next-slide"
          onClick={onNext}
          disabled={isLast}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm text-white transition-all cursor-pointer",
            isLast 
              ? "bg-gray-200 text-gray-400 cursor-not-allowed" 
              : "bg-[#002366] hover:opacity-95 active:scale-95"
          )}
          aria-label="Next Slide"
        >
          <span>Next</span>
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
