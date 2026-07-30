import * as React from 'react';
import { cn } from '../../../lib/utils';
import { SlideData, PRESENTATION_THEMES } from './PresentationSlide';

interface PresentationProgressProps {
  currentSlideIndex: number;
  slides: SlideData[];
  onSelectSlide: (index: number) => void;
  themeId?: 'LAZUARDI' | 'OCEAN' | 'COBALT' | 'BLOOM' | 'EARTH';
}

export function PresentationProgress({ 
  currentSlideIndex, 
  slides, 
  onSelectSlide,
  themeId = 'LAZUARDI'
}: PresentationProgressProps) {
  if (slides.length <= 1) return null;

  const theme = PRESENTATION_THEMES[themeId];

  return (
    <div className="w-full py-4 px-6 bg-slate-900/10 rounded-2xl border border-slate-100 mt-4 select-none">
      {/* Dynamic Segmented Progress Rail */}
      <div className="relative flex items-center justify-between w-full">
        {/* Continuous background track line */}
        <div className="absolute left-0 right-0 h-1 bg-gray-200 rounded-full z-0" />
        
        {/* Active progress fill line */}
        <div 
          className="absolute left-0 h-1 rounded-full z-0 transition-all duration-500 ease-out"
          style={{ 
            width: `${(currentSlideIndex / (slides.length - 1)) * 100}%`,
            backgroundColor: theme.secondary 
          }}
        />

        {/* Section nodes */}
        {slides.map((slide, idx) => {
          const isSelected = idx === currentSlideIndex;
          const isPassed = idx < currentSlideIndex;

          // Short label for the progress rail to keep it clean and prevent layout issues
          let label = slide.title;
          if (slide.type === 'GOAL_STRAND' && slide.strand) {
            label = slide.strand.charAt(0) + slide.strand.slice(1).toLowerCase() + ' Goal';
          } else if (slide.type === 'COVER') {
            label = 'Cover';
          } else if (slide.type === 'ABOUT_ME') {
            label = 'About';
          } else if (slide.type === 'STRENGTHS') {
            label = 'Strengths';
          } else if (slide.type === 'GROWTH') {
            label = 'Growth';
          } else if (slide.type === 'SELF_EXPLORATION') {
            label = 'Explorer';
          } else if (slide.type === 'KARYA_ILMIAH') {
            label = 'Thesis';
          } else if (slide.type === 'UNIT_ACTIVITY') {
            label = slide.unitActivityCategory ? slide.unitActivityCategory.split(' ')[0] : 'Activity';
          } else if (slide.type === 'COMMITMENT') {
            label = 'Commit';
          } else if (slide.type === 'CONFERENCE_NOTES') {
            label = 'Notes';
          }

          return (
            <button
              key={idx}
              onClick={() => onSelectSlide(idx)}
              className="relative flex flex-col items-center z-10 group focus:outline-none cursor-pointer"
              title={`Go to slide ${idx + 1}: ${slide.title}`}
            >
              {/* Node indicator */}
              <div 
                className={cn(
                  "w-3.5 h-3.5 rounded-full border-2 transition-all duration-300 flex items-center justify-center",
                  isSelected 
                    ? "scale-125 shadow-md" 
                    : isPassed 
                      ? "opacity-90" 
                      : "bg-white border-gray-300 hover:border-gray-400"
                )}
                style={{
                  backgroundColor: isSelected ? theme.primary : isPassed ? theme.secondary : '#ffffff',
                  borderColor: isSelected ? theme.secondary : isPassed ? theme.secondary : '#cbd5e1'
                }}
              />
              
              {/* Responsive Text Label */}
              <span 
                className={cn(
                  "absolute top-6 whitespace-nowrap text-[9px] font-extrabold uppercase tracking-wider transition-all duration-200 hidden md:block",
                  isSelected 
                    ? "font-black scale-105" 
                    : "opacity-40 group-hover:opacity-80 scale-95"
                )}
                style={{
                  color: isSelected ? theme.primary : '#475569'
                }}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
      
      {/* Mobile-friendly active slide indicator */}
      <div className="mt-3 md:mt-4 text-center">
        <span className="text-[10px] font-mono font-bold text-gray-500 uppercase tracking-widest bg-gray-50 px-2.5 py-1 rounded-full border border-gray-100">
          Slide {currentSlideIndex + 1} of {slides.length}: {slides[currentSlideIndex]?.title}
        </span>
      </div>
    </div>
  );
}
