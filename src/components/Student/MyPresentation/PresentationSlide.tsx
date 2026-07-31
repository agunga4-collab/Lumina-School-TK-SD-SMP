import * as React from 'react';
import { 
  Target, Sparkles, BookOpen, User, ShieldAlert, CheckCircle2,
  Calendar, Flame, ListChecks, HelpCircle, Award, Compass, MessageSquare
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { SmartGoal } from '../../../types';

export type SlideType = 
  | 'COVER'
  | 'ABOUT_ME'
  | 'STRENGTHS'
  | 'GROWTH'
  | 'GOAL_STRAND'
  | 'SELF_EXPLORATION'
  | 'KARYA_ILMIAH'
  | 'UNIT_ACTIVITY'
  | 'COMMITMENT'
  | 'CONFERENCE_NOTES';

export interface SlideData {
  type: SlideType;
  title: string;
  strand?: 'SPIRITUAL' | 'IMAGINAL' | 'RATIONAL' | 'MATERIAL';
  goals?: SmartGoal[];
  singleGoal?: SmartGoal;
  goalIndex?: number;
  totalGoals?: number;
  strengthsList?: string[];
  strengthIndex?: number;
  totalStrengths?: number;
  unitActivityCategory?: string;
  unitActivityName?: string;
  unitActivityWorries?: string;
  unitActivityOvercomingPlan?: string;
}

export interface ThemePalette {
  id: 'LAZUARDI' | 'OCEAN' | 'COBALT' | 'BLOOM' | 'EARTH';
  name: string;
  primary: string;
  secondary: string;
  bg: string;
  slideBg: string;
  textPrimary: string;
  textSecondary: string;
  cardBg: string;
  cardBorder: string;
  badgeBg: string;
  badgeText: string;
}

export const PRESENTATION_THEMES: Record<ThemePalette['id'], ThemePalette> = {
  LAZUARDI: {
    id: 'LAZUARDI',
    name: 'Lazuardi',
    primary: '#0B1E43', // Deep Navy
    secondary: '#0D9488', // Teal
    bg: '#0B1220', // Solid Dark Navy
    slideBg: '#FFFFFF', // Clean White canvas
    textPrimary: '#0F172A', // Slate 900
    textSecondary: '#475569', // Slate 600
    cardBg: '#F8FAFC', // Slate 50
    cardBorder: '#E2E8F0', // Slate 200
    badgeBg: '#F0FDF4', // Emerald 50 tint
    badgeText: '#15803D' // Emerald 700
  },
  OCEAN: {
    id: 'OCEAN',
    name: 'Ocean',
    primary: '#1E40AF', // Blue 800
    secondary: '#14B8A6', // Cyan 600 (Seafoam)
    bg: '#0C1D36', // Ocean Dark Shell
    slideBg: '#FAFDFD', // Clean sea tint white
    textPrimary: '#0F172A',
    textSecondary: '#475569',
    cardBg: '#F0FDF4', // Light Emerald 50
    cardBorder: '#D1FAE5', // Emerald 100
    badgeBg: '#E0F2FE', // Light blue
    badgeText: '#0369A1'
  },
  COBALT: {
    id: 'COBALT',
    name: 'Cobalt',
    primary: '#1D4ED8', // Royal Blue
    secondary: '#64748B', // Slate 500
    bg: '#081026', // Cobalt Dark Shell
    slideBg: '#FFFFFF',
    textPrimary: '#0F172A',
    textSecondary: '#334155',
    cardBg: '#F1F5F9', // Slate 100
    cardBorder: '#E2E8F0',
    badgeBg: '#EFF6FF',
    badgeText: '#1D4ED8'
  },
  BLOOM: {
    id: 'BLOOM',
    name: 'Bloom',
    primary: '#701A75', // Fuchsia 900 (Plum)
    secondary: '#DB2777', // Rose 600
    bg: '#1C0612', // Dark plum shell
    slideBg: '#FFFDFD', // Light cream rose canvas
    textPrimary: '#4D0727', // Dark pink/plum
    textSecondary: '#831843', // Rose 900
    cardBg: '#FFF1F2', // Rose 50
    cardBorder: '#FFE4E6', // Rose 100
    badgeBg: '#FDF2F8',
    badgeText: '#BE185D'
  },
  EARTH: {
    id: 'EARTH',
    name: 'Earth',
    primary: '#14532D', // Green 900 (Forest)
    secondary: '#D97706', // Amber 600 (Warm sand/stone)
    bg: '#1F1A12', // Warm brown/stone dark shell
    slideBg: '#FAF9F6', // Sand Warm Stone canvas
    textPrimary: '#1C1917', // Stone 900
    textSecondary: '#44403C', // Stone 600
    cardBg: '#F5F5F4', // Stone 100
    cardBorder: '#E7E5E4', // Stone 200
    badgeBg: '#FEF3C7', // Amber 100
    badgeText: '#B45309' // Amber 700
  }
};

interface PresentationSlideProps {
  slide: SlideData;
  studentName: string;
  className: string;
  gradeLevel: number;
  academicYear: string;
  semester: number;
  aboutMe: string;
  strengths: string;
  areasForGrowth: string;
  unitActivity?: string;
  selfExplorationRef: any;
  status: 'DRAFT' | 'SUBMITTED' | 'CONFERENCE_COMPLETED';
  themeId?: ThemePalette['id'];
  textSize?: 'NORMAL' | 'LARGE' | 'XLARGE';
}

function formatDate(timestamp: number | null | undefined): string {
  if (!timestamp) return 'No target date';
  try {
    return new Date(timestamp).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  } catch {
    return 'Invalid date';
  }
}

function parseBulletPoints(text: string): string[] {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const items: string[] = [];
  for (const line of lines) {
    let clean = line.trim();
    if (!clean) continue;
    clean = clean.replace(/^(?:[-*•]|\d+\.)\s*/, '').trim();
    if (clean) {
      items.push(clean);
    }
  }
  return items;
}

// Polished Sub-component for Goal Card
function GoalCard({ goal, theme }: { goal: SmartGoal; theme: ThemePalette; key?: string }) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div 
      className="p-6 rounded-3xl border shadow-sm space-y-4 text-left transition-all hover:shadow-md"
      style={{ backgroundColor: theme.cardBg, borderColor: theme.cardBorder }}
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 border-b pb-3" style={{ borderColor: theme.cardBorder }}>
        <div>
          <h4 className="text-base font-extrabold tracking-tight leading-tight" style={{ color: theme.textPrimary }}>
            {goal.goal}
          </h4>
          <div className="flex items-center gap-1.5 text-xs mt-1" style={{ color: theme.textSecondary }}>
            <Calendar size={13} style={{ color: theme.secondary }} />
            <span>Target: {formatDate(goal.targetDate)}</span>
          </div>
        </div>
        {goal.status && (
          <span 
            className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border self-start"
            style={{ 
              backgroundColor: theme.badgeBg, 
              color: theme.badgeText, 
              borderColor: theme.cardBorder 
            }}
          >
            {goal.status.replace('_', ' ')}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div className="space-y-1">
          <p className="font-extrabold uppercase tracking-wider text-[10px]" style={{ color: theme.secondary }}>Things I Have to Do</p>
          <p 
            className="p-3 rounded-xl italic leading-relaxed whitespace-pre-wrap border"
            style={{ backgroundColor: theme.slideBg, borderColor: theme.cardBorder, color: theme.textSecondary }}
          >
            {goal.actions || 'No actions listed.'}
          </p>
        </div>
        <div className="space-y-1">
          <p className="font-extrabold uppercase tracking-wider text-[10px]" style={{ color: theme.secondary }}>Proof That My Effort Is Working</p>
          <p 
            className="p-3 rounded-xl italic leading-relaxed whitespace-pre-wrap border"
            style={{ backgroundColor: theme.slideBg, borderColor: theme.cardBorder, color: theme.textSecondary }}
          >
            {goal.evidence || 'No evidence listed.'}
          </p>
        </div>
      </div>

      {/* SMART Reflection Expander */}
      <div className="pt-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer focus:outline-none"
          style={{ color: theme.primary }}
        >
          <span>{expanded ? 'Hide' : 'View'} SMART Reflection</span>
          <span className="text-[10px] font-normal" style={{ color: theme.textSecondary }}>
            ({expanded ? '▲' : '▼'})
          </span>
        </button>

        {expanded && (
          <div 
            className="mt-3 p-4 rounded-2xl border space-y-3 text-xs animate-in fade-in slide-in-from-top-1 duration-200"
            style={{ backgroundColor: theme.slideBg, borderColor: theme.cardBorder, color: theme.textSecondary }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="font-black uppercase text-[9px] tracking-wider block" style={{ color: theme.secondary }}>Specific</span>
                <p className="mt-0.5 leading-relaxed whitespace-pre-wrap">{goal.smartSpecific}</p>
              </div>
              <div>
                <span className="font-black uppercase text-[9px] tracking-wider block" style={{ color: theme.secondary }}>Measurable</span>
                <p className="mt-0.5 leading-relaxed whitespace-pre-wrap">{goal.smartMeasurable}</p>
              </div>
              <div>
                <span className="font-black uppercase text-[9px] tracking-wider block" style={{ color: theme.secondary }}>Achievable</span>
                <p className="mt-0.5 leading-relaxed whitespace-pre-wrap">{goal.smartAchievable}</p>
              </div>
              <div>
                <span className="font-black uppercase text-[9px] tracking-wider block" style={{ color: theme.secondary }}>Relevant</span>
                <p className="mt-0.5 leading-relaxed whitespace-pre-wrap">{goal.smartRelevant}</p>
              </div>
            </div>
            <div className="border-t pt-2" style={{ borderColor: theme.cardBorder }}>
              <span className="font-black uppercase text-[9px] tracking-wider block" style={{ color: theme.secondary }}>Time-Bound</span>
              <p className="mt-0.5 leading-relaxed whitespace-pre-wrap">{goal.smartTimeBound}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function PresentationSlide({
  slide,
  studentName,
  className,
  gradeLevel,
  academicYear,
  semester,
  aboutMe,
  strengths,
  areasForGrowth,
  unitActivity,
  selfExplorationRef,
  status,
  themeId = 'LAZUARDI',
  textSize = 'NORMAL'
}: PresentationSlideProps) {
  const theme = PRESENTATION_THEMES[themeId];

  const renderContent = () => {
    switch (slide.type) {
      case 'COVER':
        return (
          <div 
            className="flex flex-col items-center justify-center min-h-full h-full text-center p-8 md:p-16 space-y-8 select-none"
            style={{ backgroundColor: theme.slideBg }}
          >
            <div 
              className="inline-flex items-center justify-center w-20 h-20 rounded-[2rem] shadow-lg transition-all hover:scale-105 duration-300"
              style={{ backgroundColor: theme.badgeBg, color: theme.primary }}
            >
              <Award size={44} />
            </div>
            
            <div className="space-y-4">
              <span 
                className="text-sm font-mono font-extrabold uppercase tracking-[0.4em] block animate-pulse"
                style={{ color: theme.secondary }}
              >
                Three-Way Conference
              </span>
              <h2 
                className="text-4xl md:text-6xl font-black tracking-tight max-w-3xl leading-tight"
                style={{ color: theme.primary }}
              >
                My Three-Way Conference
              </h2>
            </div>

            <div className="h-1 w-24 rounded-full animate-pulse" style={{ backgroundColor: theme.secondary }} />

            <div className="space-y-6">
              <h3 
                className="text-3xl md:text-4xl font-black tracking-tight"
                style={{ color: theme.textPrimary }}
              >
                {studentName}
              </h3>
              
              <div className="flex flex-wrap items-center justify-center gap-3 text-sm md:text-base font-bold max-w-2xl mx-auto">
                <span className="px-4 py-2 rounded-2xl border bg-white/40 backdrop-blur-sm shadow-sm" style={{ borderColor: theme.cardBorder, color: theme.textSecondary }}>
                  Class: {className || '-'}
                </span>
                <span className="px-4 py-2 rounded-2xl border bg-white/40 backdrop-blur-sm shadow-sm" style={{ borderColor: theme.cardBorder, color: theme.textSecondary }}>
                  Grade: {gradeLevel}
                </span>
                <span className="px-4 py-2 rounded-2xl border bg-white/40 backdrop-blur-sm shadow-sm" style={{ borderColor: theme.cardBorder, color: theme.textSecondary }}>
                  Year: {academicYear}
                </span>
                <span className="px-4 py-2 rounded-2xl border bg-white/40 backdrop-blur-sm shadow-sm" style={{ borderColor: theme.cardBorder, color: theme.textSecondary }}>
                  Semester: {semester}
                </span>
              </div>
            </div>
          </div>
        );

      case 'ABOUT_ME':
        return (
          <div className="flex flex-col h-full w-full p-8 md:p-12 select-none" style={{ backgroundColor: theme.slideBg }}>
            <div className="slide-header flex items-center justify-between pb-6 mb-8 border-b" style={{ borderColor: theme.cardBorder }}>
              <div className="flex items-center gap-4">
                <div 
                  className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"
                  style={{ backgroundColor: theme.badgeBg, color: theme.primary }}
                >
                  <User size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black uppercase italic tracking-tight" style={{ color: theme.primary }}>About Me</h3>
                  <p className="text-xs font-bold uppercase tracking-wider" style={{ color: theme.textSecondary }}>Who I am and my current reflection</p>
                </div>
              </div>
            </div>

            <div className="slide-content flex-1 flex flex-col justify-center">
              <div 
                className="text-base md:text-lg lg:text-xl leading-relaxed whitespace-pre-wrap max-h-[45vh] overflow-y-auto pr-4 p-8 rounded-3xl border bg-white/30 backdrop-blur-sm shadow-sm"
                style={{ borderColor: theme.cardBorder, color: theme.textSecondary }}
              >
                {aboutMe.trim() ? (
                  aboutMe
                ) : (
                  <p className="italic" style={{ color: theme.textSecondary }}>Tell us a little about yourself in Goal Setting.</p>
                )}
              </div>
            </div>
          </div>
        );

      case 'STRENGTHS':
        const strengthItems = slide.strengthsList || parseBulletPoints(strengths);
        const hasItems = strengthItems.length > 0;
        const currentStrengthIndex = slide.strengthIndex ?? 0;
        const totalStrengthsCount = slide.totalStrengths ?? strengthItems.length;

        const renderStrengthsContent = () => {
          if (!hasItems) {
            return (
              <p className="italic text-center py-12 text-lg md:text-xl" style={{ color: theme.textSecondary }}>
                Describe your strengths in Goal Setting.
              </p>
            );
          }

          if (strengthItems.length <= 2) {
            return (
              <div className="flex flex-col items-center justify-center py-6 text-center max-w-3xl mx-auto space-y-6">
                <span className="font-serif text-[6rem] leading-[0] select-none text-gray-300 opacity-35">“</span>
                <p className="text-xl md:text-3xl lg:text-4xl font-black leading-snug tracking-tight" style={{ color: theme.textPrimary }}>
                  {strengthItems.join(' & ')}
                </p>
                <span className="font-serif text-[6rem] leading-[0] select-none text-gray-300 opacity-35 mt-4">”</span>
              </div>
            );
          }

          return (
            <div className={cn(
              "grid gap-6 w-full py-4",
              strengthItems.length === 1 ? "grid-cols-1 max-w-2xl mx-auto" : "grid-cols-1 md:grid-cols-2"
            )}>
              {strengthItems.map((item, index) => (
                <div 
                  key={index} 
                  className="p-6 md:p-8 rounded-3xl border bg-white/40 backdrop-blur-sm shadow-sm flex items-start gap-4 transition-all duration-300 hover:translate-y-[-2px] hover:shadow-md"
                  style={{ borderColor: theme.cardBorder }}
                >
                  <div 
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-black text-sm"
                    style={{ backgroundColor: theme.badgeBg, color: theme.secondary }}
                  >
                    {currentStrengthIndex + index + 1}
                  </div>
                  <p className="text-base md:text-lg lg:text-xl font-bold leading-relaxed pt-1" style={{ color: theme.textPrimary }}>
                    {item}
                  </p>
                </div>
              ))}
            </div>
          );
        };

        return (
          <div className="flex flex-col h-full w-full p-8 md:p-12 select-none" style={{ backgroundColor: theme.slideBg }}>
            <div className="slide-header flex items-center justify-between pb-6 mb-8 border-b" style={{ borderColor: theme.cardBorder }}>
              <div className="flex items-center gap-4">
                <div 
                  className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"
                  style={{ backgroundColor: theme.badgeBg, color: theme.secondary }}
                >
                  <Award size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black uppercase italic tracking-tight" style={{ color: theme.primary }}>My Strengths</h3>
                  <p className="text-xs font-bold uppercase tracking-wider" style={{ color: theme.textSecondary }}>Things I do well and proud of</p>
                </div>
              </div>
              
              {totalStrengthsCount > 4 && (
                <span className="text-xs font-mono font-black uppercase tracking-wider px-3.5 py-1.5 rounded-full border bg-white/50" style={{ borderColor: theme.cardBorder, color: theme.textSecondary }}>
                  Page {Math.floor(currentStrengthIndex / 4) + 1} of {Math.ceil(totalStrengthsCount / 4)}
                </span>
              )}
            </div>

            <div className="slide-content flex-1 flex flex-col justify-center">
              {renderStrengthsContent()}
            </div>
          </div>
        );

      case 'GROWTH':
        const growthItems = parseBulletPoints(areasForGrowth);
        const hasGrowth = growthItems.length > 0;

        const renderGrowthContent = () => {
          if (!hasGrowth) {
            return (
              <p className="italic text-center py-12 text-lg md:text-xl" style={{ color: theme.textSecondary }}>
                Describe your areas for growth in Goal Setting.
              </p>
            );
          }

          if (growthItems.length <= 2) {
            return (
              <div className="flex flex-col items-center justify-center py-6 text-center max-w-3xl mx-auto space-y-6">
                <span className="font-serif text-[6rem] leading-[0] select-none text-gray-300 opacity-35">“</span>
                <p className="text-xl md:text-3xl lg:text-4xl font-black leading-snug tracking-tight" style={{ color: theme.textPrimary }}>
                  {growthItems.join(' & ')}
                </p>
                <span className="font-serif text-[6rem] leading-[0] select-none text-gray-300 opacity-35 mt-4">”</span>
              </div>
            );
          }

          return (
            <div className={cn(
              "grid gap-6 w-full py-4",
              growthItems.length === 1 ? "grid-cols-1 max-w-2xl mx-auto" : "grid-cols-1 md:grid-cols-2"
            )}>
              {growthItems.map((item, index) => (
                <div 
                  key={index} 
                  className="p-6 md:p-8 rounded-3xl border bg-white/40 backdrop-blur-sm shadow-sm flex items-start gap-4 transition-all duration-300 hover:translate-y-[-2px] hover:shadow-md"
                  style={{ borderColor: theme.cardBorder }}
                >
                  <div 
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-black text-sm"
                    style={{ backgroundColor: theme.badgeBg, color: theme.primary }}
                  >
                    {index + 1}
                  </div>
                  <p className="text-base md:text-lg lg:text-xl font-bold leading-relaxed pt-1" style={{ color: theme.textPrimary }}>
                    {item}
                  </p>
                </div>
              ))}
            </div>
          );
        };

        return (
          <div className="flex flex-col h-full w-full p-8 md:p-12 select-none" style={{ backgroundColor: theme.slideBg }}>
            <div className="slide-header flex items-center justify-between pb-6 mb-8 border-b" style={{ borderColor: theme.cardBorder }}>
              <div className="flex items-center gap-4">
                <div 
                  className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"
                  style={{ backgroundColor: theme.badgeBg, color: theme.primary }}
                >
                  <Flame size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black uppercase italic tracking-tight" style={{ color: theme.primary }}>My Areas for Growth</h3>
                  <p className="text-xs font-bold uppercase tracking-wider" style={{ color: theme.textSecondary }}>Where I want to improve and learn more</p>
                </div>
              </div>
            </div>

            <div className="slide-content flex-1 flex flex-col justify-center">
              {renderGrowthContent()}
            </div>
          </div>
        );

      case 'GOAL_STRAND':
        const currentGoal = slide.singleGoal;
        const currentGoalIdx = slide.goalIndex ?? 0;
        const totalGoalsCount = slide.totalGoals ?? 1;

        if (!currentGoal) {
          return (
            <div className="flex flex-col h-full w-full p-8 md:p-12 select-none" style={{ backgroundColor: theme.slideBg }}>
              <div className="slide-header flex items-center gap-4 pb-6 mb-8 border-b" style={{ borderColor: theme.cardBorder }}>
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm" style={{ backgroundColor: theme.badgeBg, color: theme.primary }}>
                  <Target size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black uppercase italic tracking-tight" style={{ color: theme.primary }}>
                    My {slide.title}
                  </h3>
                  <p className="text-xs font-bold uppercase tracking-wider" style={{ color: theme.textSecondary }}>
                    SMART goals
                  </p>
                </div>
              </div>
              <div className="slide-content flex-1 flex flex-col justify-center text-center">
                <p className="italic text-lg" style={{ color: theme.textSecondary }}>No goal data provided.</p>
              </div>
            </div>
          );
        }

        const smartComponents = [
          { letter: 'S', name: 'Specific', desc: currentGoal.smartSpecific, colorClass: 'text-rose-500/20' },
          { letter: 'M', name: 'Measurable', desc: currentGoal.smartMeasurable, colorClass: 'text-amber-500/20' },
          { letter: 'A', name: 'Achievable', desc: currentGoal.smartAchievable, colorClass: 'text-emerald-500/20' },
          { letter: 'R', name: 'Relevant', desc: currentGoal.smartRelevant, colorClass: 'text-blue-500/20' },
          { letter: 'T', name: 'Time-Bound', desc: currentGoal.smartTimeBound, colorClass: 'text-indigo-500/20' }
        ];

        return (
          <div className="flex flex-col h-full w-full p-8 md:p-12 select-none animate-fade-in" style={{ backgroundColor: theme.slideBg }}>
            {/* Header */}
            <div className="slide-header flex items-center justify-between pb-6 mb-8 border-b" style={{ borderColor: theme.cardBorder }}>
              <div className="flex items-center gap-4">
                <div 
                  className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"
                  style={{ backgroundColor: theme.badgeBg, color: theme.primary }}
                >
                  <Target size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black uppercase italic tracking-tight" style={{ color: theme.primary }}>
                    My {slide.title}
                  </h3>
                  <p className="text-xs font-bold uppercase tracking-wider" style={{ color: theme.textSecondary }}>
                    SMART Goal ({currentGoalIdx + 1} of {totalGoalsCount})
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-mono font-bold px-3.5 py-1.5 rounded-xl border bg-white/50" style={{ borderColor: theme.cardBorder, color: theme.textSecondary }}>
                  Target: {formatDate(currentGoal.targetDate)}
                </span>
                {currentGoal.status && (
                  <span 
                    className="px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider border"
                    style={{ 
                      backgroundColor: theme.badgeBg, 
                      color: theme.badgeText, 
                      borderColor: theme.cardBorder 
                    }}
                  >
                    {currentGoal.status.replace('_', ' ')}
                  </span>
                )}
              </div>
            </div>

            {/* Content Area */}
            <div className="slide-content flex-1 flex flex-col justify-start space-y-8 overflow-y-auto pr-2">
              {/* Goal Statement Card */}
              <div className="p-6 md:p-8 rounded-3xl border bg-white/40 backdrop-blur-sm shadow-sm space-y-3" style={{ borderColor: theme.cardBorder }}>
                <span className="font-extrabold uppercase tracking-widest text-[10px] text-gray-400 block">Goal Statement</span>
                <h2 className="text-xl md:text-3xl font-black leading-tight tracking-tight" style={{ color: theme.textPrimary }}>
                  {currentGoal.goal}
                </h2>
              </div>

              {/* Action & Evidence Split Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-6 rounded-3xl border bg-white/40 backdrop-blur-sm shadow-sm space-y-2" style={{ borderColor: theme.cardBorder }}>
                  <span className="font-extrabold uppercase tracking-widest text-[10px] text-rose-500 block">Things I Have to Do</span>
                  <p className="text-base font-semibold leading-relaxed" style={{ color: theme.textPrimary }}>
                    {currentGoal.actions || 'No actions listed.'}
                  </p>
                </div>
                <div className="p-6 rounded-3xl border bg-white/40 backdrop-blur-sm shadow-sm space-y-2" style={{ borderColor: theme.cardBorder }}>
                  <span className="font-extrabold uppercase tracking-widest text-[10px] text-emerald-500 block">Proof Effort is Working</span>
                  <p className="text-base font-semibold leading-relaxed" style={{ color: theme.textPrimary }}>
                    {currentGoal.evidence || 'No evidence listed.'}
                  </p>
                </div>
              </div>

              {/* 5-Column SMART Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 pt-2">
                {smartComponents.map((comp) => (
                  <div 
                    key={comp.letter}
                    className="p-5 rounded-2xl border bg-white/40 backdrop-blur-sm shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[160px] group hover:translate-y-[-2px] transition-all duration-300"
                    style={{ borderColor: theme.cardBorder }}
                  >
                    {/* Big letter in background */}
                    <span className={cn(
                      "absolute top-[-10px] right-2 font-serif text-[5.5rem] font-black select-none pointer-events-none transition-transform duration-300 group-hover:scale-105",
                      comp.colorClass
                    )}>
                      {comp.letter}
                    </span>

                    <div className="space-y-1 relative z-10">
                      <h4 className="text-sm font-black tracking-tight" style={{ color: theme.primary }}>
                        {comp.name}
                      </h4>
                      <p className="text-xs md:text-sm font-bold leading-relaxed pt-1" style={{ color: theme.textSecondary }}>
                        {comp.desc || <em className="text-gray-400 font-normal">Not defined</em>}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 'SELF_EXPLORATION':
        const seEnrollment = selfExplorationRef?.enrollment || {};
        const seChoices = seEnrollment.activityChoices || [];
        const hasChoices = seChoices.length > 0;

        return (
          <div className="flex flex-col h-full w-full p-8 md:p-12 select-none" style={{ backgroundColor: theme.slideBg }}>
            <div className="slide-header flex items-center justify-between pb-6 mb-8 border-b" style={{ borderColor: theme.cardBorder }}>
              <div className="flex items-center gap-4">
                <div 
                  className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"
                  style={{ backgroundColor: theme.badgeBg, color: theme.primary }}
                >
                  <Compass size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black uppercase italic tracking-tight" style={{ color: theme.primary }}>My Self-Exploration</h3>
                  <p className="text-xs font-bold uppercase tracking-wider" style={{ color: theme.textSecondary }}>Self-chosen co-curricular pathways</p>
                </div>
              </div>
            </div>

            <div className="slide-content flex-1 flex flex-col justify-center">
              {hasChoices ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[45vh] overflow-y-auto pr-2 py-2">
                  {seChoices.map((choice: any, index: number) => (
                    <div 
                      key={index} 
                      className="p-6 rounded-3xl border bg-white/40 backdrop-blur-sm shadow-sm space-y-4 text-left hover:translate-y-[-2px] transition-all duration-300"
                      style={{ borderColor: theme.cardBorder }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold uppercase tracking-widest text-[10px]" style={{ color: theme.secondary }}>
                          {choice.category || 'Choice'}
                        </span>
                        <span className="w-6 h-6 rounded-lg font-bold text-xs flex items-center justify-center" style={{ backgroundColor: theme.badgeBg, color: theme.primary }}>
                          {index + 1}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">Activity Name</span>
                        <p className="text-base font-black leading-snug" style={{ color: theme.textPrimary }}>
                          {choice.activityName || choice.customActivity || '-'}
                        </p>
                      </div>
                      {choice.finalTarget && (
                        <div className="pt-2 border-t border-dashed" style={{ borderColor: theme.cardBorder }}>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">Personal Target</span>
                          <p className="text-sm italic font-medium leading-relaxed" style={{ color: theme.textSecondary }}>
                            "{choice.finalTarget}"
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div 
                  className="p-12 rounded-3xl border border-dashed text-center space-y-3 max-w-xl mx-auto bg-white/40 backdrop-blur-sm"
                  style={{ borderColor: theme.cardBorder }}
                >
                  <Compass size={32} style={{ color: theme.secondary, margin: '0 auto' }} />
                  <h4 className="text-lg font-black uppercase italic" style={{ color: theme.textPrimary }}>No Self-Exploration Found</h4>
                  <p className="text-sm" style={{ color: theme.textSecondary }}>
                    No Self-Exploration plan has been loaded for this conference period.
                  </p>
                </div>
              )}
            </div>
          </div>
        );

      case 'KARYA_ILMIAH':
        return (
          <div className="flex flex-col h-full w-full p-8 md:p-12 select-none" style={{ backgroundColor: theme.slideBg }}>
            <div className="slide-header flex items-center justify-between pb-6 mb-8 border-b" style={{ borderColor: theme.cardBorder }}>
              <div className="flex items-center gap-4">
                <div 
                  className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"
                  style={{ backgroundColor: theme.badgeBg, color: theme.primary }}
                >
                  <BookOpen size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black uppercase italic tracking-tight" style={{ color: theme.primary }}>My Karya Ilmiah</h3>
                  <p className="text-xs font-bold uppercase tracking-wider" style={{ color: theme.textSecondary }}>Grade 9 Graduation Project Summary</p>
                </div>
              </div>
            </div>

            <div className="slide-content flex-1 flex flex-col justify-center">
              <div 
                className="p-12 rounded-3xl border border-dashed text-center space-y-4 max-w-xl mx-auto shadow-sm bg-white/40 backdrop-blur-sm"
                style={{ borderColor: theme.cardBorder }}
              >
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto" style={{ backgroundColor: theme.badgeBg }}>
                  <BookOpen size={32} style={{ color: theme.primary }} />
                </div>
                <h4 className="text-xl font-black uppercase tracking-tight" style={{ color: theme.primary }}>
                  Karya Ilmiah Project Active
                </h4>
                <p className="text-base font-medium leading-relaxed" style={{ color: theme.textSecondary }}>
                  Your Karya Ilmiah registration is linked to this conference. You are working on your graduation thesis requirements.
                </p>
              </div>
            </div>
          </div>
        );

      case 'UNIT_ACTIVITY':
        return (
          <div className="flex flex-col h-full w-full p-8 md:p-12 select-none" style={{ backgroundColor: theme.slideBg }}>
            <div className="slide-header flex items-center justify-between pb-6 mb-8 border-b" style={{ borderColor: theme.cardBorder }}>
              <div className="flex items-center gap-4">
                <div 
                  className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"
                  style={{ backgroundColor: theme.badgeBg, color: theme.secondary }}
                >
                  <Compass size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black uppercase italic tracking-tight" style={{ color: theme.primary }}>
                    {slide.unitActivityCategory ? `Unit Activity: ${slide.unitActivityCategory}` : 'My Unit Activity'}
                  </h3>
                  <p className="text-xs font-bold uppercase tracking-wider" style={{ color: theme.textSecondary }}>
                    {slide.unitActivityCategory ? 'Reflection per chosen category' : 'Narrative reflection of school unit activities'}
                  </p>
                </div>
              </div>
            </div>

            <div className="slide-content flex-1 flex flex-col justify-center">
              {slide.unitActivityCategory ? (
                <div className="space-y-6">
                  <div className="p-6 border rounded-3xl bg-white/40 backdrop-blur-sm shadow-sm" style={{ borderColor: theme.cardBorder }}>
                    <span className="font-extrabold uppercase tracking-widest text-[10px] text-gray-400 block mb-1">Specific Activity Chosen</span>
                    <p className="text-lg font-black leading-tight" style={{ color: theme.textPrimary }}>
                      {slide.unitActivityName || <em style={{ color: theme.textSecondary }}>None selected</em>}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-6 border rounded-3xl bg-white/40 backdrop-blur-sm shadow-sm space-y-3" style={{ borderColor: theme.cardBorder }}>
                      <span className="font-extrabold uppercase tracking-widest text-[10px] text-rose-500 block">My Worries</span>
                      <p className="text-base font-semibold leading-relaxed whitespace-pre-wrap max-h-[22vh] overflow-y-auto" style={{ color: theme.textPrimary }}>
                        {slide.unitActivityWorries || <em style={{ color: theme.textSecondary }}>No worries entered</em>}
                      </p>
                    </div>
                    <div className="p-6 border rounded-3xl bg-white/40 backdrop-blur-sm shadow-sm space-y-3" style={{ borderColor: theme.cardBorder }}>
                      <span className="font-extrabold uppercase tracking-widest text-[10px] text-emerald-500 block">Plan to Overcome</span>
                      <p className="text-base font-semibold leading-relaxed whitespace-pre-wrap max-h-[22vh] overflow-y-auto" style={{ color: theme.textSecondary }}>
                        {slide.unitActivityOvercomingPlan || <em style={{ color: theme.textSecondary }}>No plan entered</em>}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div 
                  className="text-base md:text-lg leading-relaxed whitespace-pre-wrap max-h-[45vh] overflow-y-auto pr-4 p-8 rounded-3xl border bg-white/30 backdrop-blur-sm shadow-sm"
                  style={{ borderColor: theme.cardBorder, color: theme.textSecondary }}
                >
                  {unitActivity && unitActivity.trim() ? (
                    unitActivity
                  ) : (
                    <p className="italic" style={{ color: theme.textSecondary }}>No unit activity narrative added.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        );

      case 'COMMITMENT':
        const goalsToDisplay = slide.goals || [];
        return (
          <div className="flex flex-col h-full w-full p-8 md:p-12 select-none" style={{ backgroundColor: theme.slideBg }}>
            <div className="slide-header flex items-center justify-between pb-6 mb-8 border-b" style={{ borderColor: theme.cardBorder }}>
              <div className="flex items-center gap-4">
                <div 
                  className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"
                  style={{ backgroundColor: theme.badgeBg, color: theme.primary }}
                >
                  <ListChecks size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black uppercase italic tracking-tight" style={{ color: theme.primary }}>My Commitment</h3>
                  <p className="text-xs font-bold uppercase tracking-wider" style={{ color: theme.textSecondary }}>Selected key goals to focus on first</p>
                </div>
              </div>
            </div>

            <div className="slide-content flex-1 flex flex-col justify-center">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-4 max-h-[45vh] overflow-y-auto pr-2">
                  {goalsToDisplay.length > 0 ? (
                    goalsToDisplay.map((g, idx) => (
                      <div 
                        key={g.id} 
                        className="flex items-start gap-4 p-5 rounded-2xl border bg-white/40 backdrop-blur-sm shadow-sm hover:translate-x-1 transition-all duration-300"
                        style={{ borderColor: theme.cardBorder }}
                      >
                        <span 
                          className="flex items-center justify-center w-8 h-8 rounded-xl font-black text-sm shrink-0 border"
                          style={{ backgroundColor: theme.badgeBg, color: theme.primary, borderColor: theme.cardBorder }}
                        >
                          {idx + 1}
                        </span>
                        <div>
                          <p className="text-base font-black leading-snug" style={{ color: theme.textPrimary }}>{g.goal}</p>
                          <p className="text-xs uppercase font-extrabold tracking-wider mt-1.5" style={{ color: theme.textSecondary }}>
                            Strand: {g.strand} • Target: {formatDate(g.targetDate)}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="italic text-center py-12 text-base md:text-lg" style={{ color: theme.textSecondary }}>
                      No key goals selected as primary focus.
                    </p>
                  )}
                </div>

                <div 
                  className="p-8 border rounded-3xl text-center shadow-sm flex flex-col justify-center items-center space-y-4 bg-white/40 backdrop-blur-sm"
                  style={{ borderColor: theme.cardBorder, color: theme.primary }}
                >
                  <span className="font-serif text-5xl leading-none font-black select-none opacity-20">“</span>
                  <p className="text-base md:text-lg font-black tracking-tight leading-relaxed italic">
                    I am committed to taking small, consistent steps toward my goals.
                  </p>
                  <span className="font-serif text-5xl leading-none font-black select-none opacity-20 mt-2">”</span>
                </div>
              </div>
            </div>
          </div>
        );

      case 'CONFERENCE_NOTES':
        return (
          <div className="flex flex-col h-full w-full p-8 md:p-12 select-none" style={{ backgroundColor: theme.slideBg }}>
            <div className="slide-header flex items-center justify-between pb-6 mb-8 border-b" style={{ borderColor: theme.cardBorder }}>
              <div className="flex items-center gap-4">
                <div 
                  className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"
                  style={{ backgroundColor: theme.badgeBg, color: theme.primary }}
                >
                  <MessageSquare size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black uppercase italic tracking-tight" style={{ color: theme.primary }}>Conference Notes</h3>
                  <p className="text-xs font-bold uppercase tracking-wider" style={{ color: theme.textSecondary }}>Decisions & Agreements with teacher and parents</p>
                </div>
              </div>
            </div>

            <div className="slide-content flex-1 flex flex-col justify-center">
              <div className="flex flex-col items-center justify-center text-center p-8 space-y-6 max-w-xl mx-auto shadow-sm bg-white/40 backdrop-blur-sm rounded-3xl border" style={{ borderColor: theme.cardBorder }}>
                <div 
                  className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-sm animate-pulse"
                  style={{ backgroundColor: theme.badgeBg, color: theme.primary }}
                >
                  <MessageSquare size={32} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-black tracking-tight" style={{ color: theme.primary }}>Conference Notes & Agreements</h3>
                  <p className="text-base leading-relaxed" style={{ color: theme.textSecondary }}>
                    Conference notes and agreements will be added during the review and consensus phase with your homeroom teacher and parents.
                  </p>
                </div>
                <div 
                  className="px-4 py-2 rounded-2xl border text-xs font-black uppercase tracking-wider"
                  style={{ backgroundColor: theme.cardBg, borderColor: theme.cardBorder, color: theme.secondary }}
                >
                  Read-Only Stage 3 Presentation
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div 
      className={cn(
        "rounded-[2rem] border overflow-hidden transition-all duration-300 w-full h-full flex flex-col justify-between presentation-slide-container"
      )}
      style={{ backgroundColor: theme.slideBg, borderColor: theme.cardBorder, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}
      id={`presentation-slide-${slide.type.toLowerCase()}`}
      data-text-size={textSize}
    >
      <style>{`
        .presentation-slide-container {
          --presentation-scale: 1;
        }
        .presentation-slide-container[data-text-size="NORMAL"] {
          --presentation-scale: 1;
        }
        .presentation-slide-container[data-text-size="LARGE"] {
          --presentation-scale: 1.25;
        }
        .presentation-slide-container[data-text-size="XLARGE"] {
          --presentation-scale: 1.5;
        }

        .presentation-slide-container h2 {
          font-size: calc(1.8rem * var(--presentation-scale)) !important;
          line-height: 1.2 !important;
        }
        .presentation-slide-container h3 {
          font-size: calc(1.5rem * var(--presentation-scale)) !important;
          line-height: 1.3 !important;
        }
        .presentation-slide-container h4 {
          font-size: calc(1.2rem * var(--presentation-scale)) !important;
          line-height: 1.4 !important;
        }
        .presentation-slide-container p, 
        .presentation-slide-container li,
        .presentation-slide-container span:not(.font-serif) {
          font-size: calc(1rem * var(--presentation-scale)) !important;
          line-height: 1.6 !important;
        }
        .presentation-slide-container .statement-text {
          font-size: calc(2.2rem * var(--presentation-scale)) !important;
          line-height: 1.3 !important;
        }
        .presentation-slide-container .smart-desc {
          font-size: calc(1rem * var(--presentation-scale)) !important;
          line-height: 1.5 !important;
        }
      `}</style>
      <div className="flex-1 overflow-y-auto w-full h-full">
        {renderContent()}
      </div>
    </div>
  );
}
