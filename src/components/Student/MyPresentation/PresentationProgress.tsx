import * as React from 'react';
import { cn } from '../../../lib/utils';

interface PresentationProgressProps {
  currentSlideIndex: number;
  totalSlides: number;
  onSelectSlide: (index: number) => void;
}

export function PresentationProgress({ currentSlideIndex, totalSlides, onSelectSlide }: PresentationProgressProps) {
  if (totalSlides <= 1) return null;

  return (
    <div className="flex flex-col items-center gap-3 w-full py-2">
      {/* Visual Indicator Dots */}
      <div className="flex flex-wrap justify-center gap-2 max-w-full px-4">
        {Array.from({ length: totalSlides }).map((_, idx) => (
          <button
            key={idx}
            id={`progress-dot-${idx}`}
            onClick={() => onSelectSlide(idx)}
            className={cn(
              "h-2 rounded-full transition-all duration-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2",
              idx === currentSlideIndex
                ? "w-8 bg-[#002366]"
                : "w-2 bg-gray-300 hover:bg-gray-400"
            )}
            aria-label={`Go to slide ${idx + 1}`}
            title={`Slide ${idx + 1}`}
          />
        ))}
      </div>

      {/* Numeric Indicator */}
      <span className="text-xs font-mono font-medium text-gray-500 uppercase tracking-wider">
        Slide {currentSlideIndex + 1} of {totalSlides}
      </span>
    </div>
  );
}
