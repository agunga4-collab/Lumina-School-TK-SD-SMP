import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, ArrowRight, Play, X, ArrowLeftSquare, HelpCircle
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { PRESENTATION_THEMES } from './PresentationSlide';

interface PresentationControlsProps {
  currentSlideIndex: number;
  totalSlides: number;
  isPresentMode: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onTogglePresentMode: () => void;
  onBackToGoalSetting?: () => void;
  themeId?: 'LAZUARDI' | 'OCEAN' | 'COBALT' | 'BLOOM' | 'EARTH';
}

export function PresentationControls({
  currentSlideIndex,
  totalSlides,
  isPresentMode,
  onPrevious,
  onNext,
  onTogglePresentMode,
  onBackToGoalSetting,
  themeId = 'LAZUARDI'
}: PresentationControlsProps) {
  const navigate = useNavigate();
  const theme = PRESENTATION_THEMES[themeId];

  const handleBackToGoalSetting = onBackToGoalSetting || (() => {
    navigate('/student/goal-setting');
  });

  const isFirst = currentSlideIndex === 0;
  const isLast = currentSlideIndex === totalSlides - 1;

  if (isPresentMode) {
    // Elegant, theme-aware Present Mode bottom controls
    return (
      <div 
        className="flex flex-col sm:flex-row items-center justify-between gap-4 w-full px-6 py-4 rounded-2xl border shadow-xl select-none"
        style={{ 
          backgroundColor: theme.bg === '#0B1220' ? '#111827' : theme.bg, 
          borderColor: 'rgba(255, 255, 255, 0.08)' 
        }}
      >
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
          <button
            id="btn-present-prev"
            onClick={onPrevious}
            disabled={isFirst}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer",
              isFirst 
                ? "text-gray-600 bg-gray-800/20 cursor-not-allowed" 
                : "text-white bg-white/10 hover:bg-white/20 active:scale-95"
            )}
            aria-label="Previous Slide"
          >
            <ArrowLeft size={14} />
            <span>Prev</span>
          </button>

          <span className="text-xs font-mono font-black text-gray-400">
            {currentSlideIndex + 1} / {totalSlides}
          </span>
        </div>

        {/* Keyboard navigation helper */}
        <div className="hidden lg:flex items-center gap-1.5 text-gray-500 text-[10px] uppercase font-bold tracking-widest">
          <HelpCircle size={12} />
          <span>Use Left/Right Arrows or Space to navigate</span>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          <button
            id="btn-present-exit"
            onClick={onTogglePresentMode}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider text-rose-400 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 transition-all active:scale-95 cursor-pointer"
            aria-label="Exit Present Mode"
          >
            <X size={14} />
            <span>Exit</span>
          </button>

          <button
            id="btn-present-next"
            onClick={onNext}
            disabled={isLast}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider text-white transition-all cursor-pointer",
              isLast 
                ? "bg-gray-800 text-gray-600 cursor-not-allowed" 
                : "hover:opacity-90 active:scale-95"
            )}
            style={{
              backgroundColor: isLast ? undefined : theme.primary
            }}
            aria-label="Next Slide"
          >
            <span>Next</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    );
  }

  // Normal Preview Mode controls
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 w-full py-4 border-t border-gray-100 mt-6 select-none">
      <button
        id="btn-back-to-goal"
        onClick={handleBackToGoalSetting}
        className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-gray-500 hover:text-gray-800 transition-colors py-2.5 px-4 rounded-xl hover:bg-gray-100 cursor-pointer"
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
            "flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest border transition-all cursor-pointer",
            isFirst 
              ? "text-gray-300 bg-gray-50 border-gray-100 cursor-not-allowed" 
              : "text-gray-700 bg-white border-gray-200 hover:bg-gray-50 active:scale-95"
          )}
          aria-label="Previous Slide"
        >
          <ArrowLeft size={14} />
          <span>Previous</span>
        </button>

        <button
          id="btn-toggle-present"
          onClick={onTogglePresentMode}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest text-white transition-all active:scale-95 cursor-pointer shadow-sm"
          style={{ backgroundColor: theme.primary }}
          aria-label="Enter Present Mode"
        >
          <Play size={14} className="fill-white text-white" />
          <span>Present</span>
        </button>

        <button
          id="btn-next-slide"
          onClick={onNext}
          disabled={isLast}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest text-white transition-all cursor-pointer",
            isLast 
              ? "bg-gray-200 text-gray-400 cursor-not-allowed" 
              : "hover:opacity-90 active:scale-95"
          )}
          style={{
            backgroundColor: isLast ? undefined : theme.secondary
          }}
          aria-label="Next Slide"
        >
          <span>Next</span>
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}
