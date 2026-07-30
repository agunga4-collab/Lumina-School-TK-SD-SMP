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
  themeId = 'LAZUARDI'
}: PresentationSlideProps) {
  const theme = PRESENTATION_THEMES[themeId];

  const renderContent = () => {
    switch (slide.type) {
      case 'COVER':
        return (
          <div 
            className="flex flex-col items-center justify-center min-h-[420px] text-center p-12 space-y-8 select-none"
            style={{ backgroundColor: theme.slideBg }}
          >
            <div 
              className="inline-flex items-center justify-center w-16 h-16 rounded-[1.5rem] mb-2 shadow-md transition-transform hover:scale-105"
              style={{ backgroundColor: theme.badgeBg, color: theme.primary }}
            >
              <Award size={36} />
            </div>
            
            <div className="space-y-3">
              <span 
                className="text-xs font-mono font-extrabold uppercase tracking-[0.4em] block"
                style={{ color: theme.secondary }}
              >
                Three-Way Conference
              </span>
              <h2 
                className="text-3xl md:text-5xl font-black tracking-tight max-w-2xl leading-none"
                style={{ color: theme.primary }}
              >
                My Three-Way Conference
              </h2>
            </div>

            <div className="h-0.5 w-24 rounded-full" style={{ backgroundColor: theme.secondary }} />

            <div className="space-y-4">
              <h3 
                className="text-2xl md:text-3xl font-extrabold tracking-tight animate-pulse"
                style={{ color: theme.textPrimary }}
              >
                {studentName}
              </h3>
              
              <div className="flex flex-wrap items-center justify-center gap-3 text-sm font-semibold max-w-lg mx-auto">
                <span className="px-3.5 py-1.5 rounded-xl border" style={{ backgroundColor: theme.cardBg, borderColor: theme.cardBorder, color: theme.textSecondary }}>
                  Class: {className || '-'}
                </span>
                <span className="px-3.5 py-1.5 rounded-xl border" style={{ backgroundColor: theme.cardBg, borderColor: theme.cardBorder, color: theme.textSecondary }}>
                  Grade: {gradeLevel}
                </span>
                <span className="px-3.5 py-1.5 rounded-xl border" style={{ backgroundColor: theme.cardBg, borderColor: theme.cardBorder, color: theme.textSecondary }}>
                  Year: {academicYear}
                </span>
                <span className="px-3.5 py-1.5 rounded-xl border" style={{ backgroundColor: theme.cardBg, borderColor: theme.cardBorder, color: theme.textSecondary }}>
                  Semester: {semester}
                </span>
              </div>
            </div>
          </div>
        );

      case 'ABOUT_ME':
        return (
          <div className="space-y-6 p-8 text-left" style={{ backgroundColor: theme.slideBg }}>
            <div className="flex items-center gap-4 pb-4 border-b" style={{ borderColor: theme.cardBorder }}>
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

            <div 
              className="text-sm md:text-base leading-relaxed whitespace-pre-wrap max-h-[45vh] overflow-y-auto pr-2 p-6 rounded-2xl border"
              style={{ backgroundColor: theme.cardBg, borderColor: theme.cardBorder, color: theme.textSecondary }}
            >
              {aboutMe.trim() ? (
                aboutMe
              ) : (
                <p className="italic" style={{ color: theme.textSecondary }}>Tell us a little about yourself in Goal Setting.</p>
              )}
            </div>
          </div>
        );

      case 'STRENGTHS':
        return (
          <div className="space-y-6 p-8 text-left" style={{ backgroundColor: theme.slideBg }}>
            <div className="flex items-center gap-4 pb-4 border-b" style={{ borderColor: theme.cardBorder }}>
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

            <div 
              className="text-sm md:text-base leading-relaxed whitespace-pre-wrap max-h-[45vh] overflow-y-auto pr-2 p-6 rounded-2xl border"
              style={{ backgroundColor: theme.cardBg, borderColor: theme.cardBorder, color: theme.textSecondary }}
            >
              {strengths.trim() ? (
                strengths
              ) : (
                <p className="italic" style={{ color: theme.textSecondary }}>Describe your strengths in Goal Setting.</p>
              )}
            </div>
          </div>
        );

      case 'GROWTH':
        return (
          <div className="space-y-6 p-8 text-left" style={{ backgroundColor: theme.slideBg }}>
            <div className="flex items-center gap-4 pb-4 border-b" style={{ borderColor: theme.cardBorder }}>
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

            <div 
              className="text-sm md:text-base leading-relaxed whitespace-pre-wrap max-h-[45vh] overflow-y-auto pr-2 p-6 rounded-2xl border"
              style={{ backgroundColor: theme.cardBg, borderColor: theme.cardBorder, color: theme.textSecondary }}
            >
              {areasForGrowth.trim() ? (
                areasForGrowth
              ) : (
                <p className="italic" style={{ color: theme.textSecondary }}>Describe your areas for growth in Goal Setting.</p>
              )}
            </div>
          </div>
        );

      case 'GOAL_STRAND':
        const strandGoals = slide.goals || [];
        return (
          <div className="space-y-6 p-8 text-left" style={{ backgroundColor: theme.slideBg }}>
            <div className="flex items-center gap-4 pb-4 border-b" style={{ borderColor: theme.cardBorder }}>
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
                  SMART goals for {slide.title.toLowerCase()} development
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-h-[45vh] overflow-y-auto pr-2">
              {strandGoals.length > 0 ? (
                strandGoals.map((g) => <GoalCard key={g.id} goal={g} theme={theme} />)
              ) : (
                <p className="italic col-span-2 text-center py-6" style={{ color: theme.textSecondary }}>
                  No goals set for this strand.
                </p>
              )}
            </div>
          </div>
        );

      case 'SELF_EXPLORATION':
        const enrollment = selfExplorationRef?.enrollment;
        const periodLabel = selfExplorationRef?.periodLabel;
        return (
          <div className="space-y-6 p-8 text-left" style={{ backgroundColor: theme.slideBg }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b" style={{ borderColor: theme.cardBorder }}>
              <div className="flex items-center gap-4">
                <div 
                  className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"
                  style={{ backgroundColor: theme.badgeBg, color: theme.primary }}
                >
                  <Sparkles size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black uppercase italic tracking-tight" style={{ color: theme.primary }}>My Self-Exploration</h3>
                  <p className="text-xs font-bold uppercase tracking-wider" style={{ color: theme.textSecondary }}>
                    {periodLabel || 'Active Semester Period'}
                  </p>
                </div>
              </div>

              <a
                href="/self-exploration/my"
                className="flex items-center gap-1.5 px-4 py-2 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-sm hover:opacity-90 self-start sm:self-auto cursor-pointer"
                style={{ backgroundColor: theme.primary }}
              >
                <span>Open Self-Exploration</span>
              </a>
            </div>

            {enrollment ? (
              <div className="space-y-4 max-h-[42vh] overflow-y-auto pr-2">
                <div 
                  className="flex items-center gap-2 p-3 rounded-xl w-fit text-xs font-bold uppercase border"
                  style={{ backgroundColor: theme.badgeBg, color: theme.primary, borderColor: theme.cardBorder }}
                >
                  <span className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: theme.secondary }} />
                  <span>Status: {enrollment.status || 'PLANNING'}</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {enrollment.choices && enrollment.choices.map((choice: any, idx: number) => (
                    <div 
                      key={idx} 
                      className="p-4 rounded-2xl border space-y-2"
                      style={{ backgroundColor: theme.cardBg, borderColor: theme.cardBorder }}
                    >
                      <div className="flex items-center justify-between border-b pb-1.5" style={{ borderColor: theme.cardBorder }}>
                        <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: theme.textSecondary }}>
                          Choice Slot {choice.slot || idx + 1}
                        </span>
                        <span 
                          className="text-[9px] font-black px-1.5 py-0.5 border rounded uppercase"
                          style={{ backgroundColor: theme.slideBg, borderColor: theme.cardBorder, color: theme.primary }}
                        >
                          {choice.strand}
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] font-bold uppercase" style={{ color: theme.textSecondary }}>Activity</span>
                        <p className="text-xs font-bold" style={{ color: theme.textPrimary }}>
                          {choice.activityName || choice.customActivity || '-'}
                        </p>
                      </div>
                      {choice.finalTarget && (
                        <div>
                          <span className="text-[9px] font-bold uppercase" style={{ color: theme.textSecondary }}>Target</span>
                          <p className="text-xs italic" style={{ color: theme.textSecondary }}>"{choice.finalTarget}"</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div 
                className="p-12 rounded-2xl border border-dashed text-center space-y-2"
                style={{ backgroundColor: theme.cardBg, borderColor: theme.cardBorder }}
              >
                <Compass size={24} style={{ color: theme.secondary, margin: '0 auto' }} />
                <h4 className="text-xs font-black uppercase italic" style={{ color: theme.textPrimary }}>No self-exploration found</h4>
                <p className="text-xs max-w-sm mx-auto" style={{ color: theme.textSecondary }}>
                  No Self-Exploration plan has been loaded for this conference period.
                </p>
              </div>
            )}
          </div>
        );

      case 'KARYA_ILMIAH':
        return (
          <div className="space-y-6 p-8 text-left" style={{ backgroundColor: theme.slideBg }}>
            <div className="flex items-center gap-4 pb-4 border-b" style={{ borderColor: theme.cardBorder }}>
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

            <div 
              className="p-12 rounded-2xl border border-dashed text-center space-y-3"
              style={{ backgroundColor: theme.cardBg, borderColor: theme.cardBorder }}
            >
              <BookOpen size={32} style={{ color: theme.primary, margin: '0 auto' }} />
              <h4 className="text-base font-extrabold uppercase tracking-tight" style={{ color: theme.primary }}>
                Karya Ilmiah Project Active
              </h4>
              <p className="text-xs max-w-sm mx-auto leading-relaxed" style={{ color: theme.textSecondary }}>
                Your Karya Ilmiah registration is linked to this conference. You are working on your graduation thesis requirements.
              </p>
            </div>
          </div>
        );

      case 'UNIT_ACTIVITY':
        return (
          <div className="space-y-6 p-8 text-left" style={{ backgroundColor: theme.slideBg }}>
            <div className="flex items-center gap-4 pb-4 border-b" style={{ borderColor: theme.cardBorder }}>
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

            {slide.unitActivityCategory ? (
              <div className="space-y-5">
                <div className="p-4 border rounded-2xl" style={{ backgroundColor: theme.cardBg, borderColor: theme.cardBorder }}>
                  <span className="font-extrabold uppercase tracking-wider text-[10px]" style={{ color: theme.secondary }}>Specific Activity Chosen</span>
                  <p className="font-black mt-1 text-sm md:text-base" style={{ color: theme.textPrimary }}>
                    {slide.unitActivityName || <em style={{ color: theme.textSecondary }}>None selected</em>}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-5 border rounded-2xl space-y-2" style={{ backgroundColor: theme.badgeBg, borderColor: theme.cardBorder }}>
                    <span className="font-black uppercase tracking-wider text-[10px] block" style={{ color: theme.primary }}>My Worries</span>
                    <p className="text-xs md:text-sm font-semibold leading-relaxed whitespace-pre-wrap max-h-[20vh] overflow-y-auto" style={{ color: theme.textPrimary }}>
                      {slide.unitActivityWorries || <em style={{ color: theme.textSecondary }}>No worries entered</em>}
                    </p>
                  </div>
                  <div className="p-5 border rounded-2xl space-y-2" style={{ backgroundColor: theme.cardBg, borderColor: theme.cardBorder }}>
                    <span className="font-black uppercase tracking-wider text-[10px] block" style={{ color: theme.secondary }}>Plan to Overcome</span>
                    <p className="text-xs md:text-sm font-semibold leading-relaxed whitespace-pre-wrap max-h-[20vh] overflow-y-auto" style={{ color: theme.textSecondary }}>
                      {slide.unitActivityOvercomingPlan || <em style={{ color: theme.textSecondary }}>No plan entered</em>}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div 
                className="text-sm md:text-base leading-relaxed whitespace-pre-wrap max-h-[45vh] overflow-y-auto pr-2 p-6 rounded-2xl border"
                style={{ backgroundColor: theme.cardBg, borderColor: theme.cardBorder, color: theme.textSecondary }}
              >
                {unitActivity && unitActivity.trim() ? (
                  unitActivity
                ) : (
                  <p className="italic">No unit activity narrative added.</p>
                )}
              </div>
            )}
          </div>
        );

      case 'COMMITMENT':
        const goalsToDisplay = slide.goals || [];
        return (
          <div className="space-y-6 p-8 text-left flex flex-col justify-between min-h-[420px]" style={{ backgroundColor: theme.slideBg }}>
            <div className="space-y-6">
              <div className="flex items-center gap-4 pb-4 border-b" style={{ borderColor: theme.cardBorder }}>
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

              {goalsToDisplay.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-xs font-black uppercase tracking-widest mb-1" style={{ color: theme.secondary }}>Top Goals by Urgency</p>
                  {goalsToDisplay.map((g, idx) => (
                    <div 
                      key={g.id} 
                      className="flex items-start gap-3 p-4 rounded-xl border transition-all hover:translate-x-1"
                      style={{ backgroundColor: theme.cardBg, borderColor: theme.cardBorder }}
                    >
                      <span 
                        className="flex items-center justify-center w-6 h-6 rounded-lg font-bold text-xs shrink-0 mt-0.5 border"
                        style={{ backgroundColor: theme.slideBg, color: theme.primary, borderColor: theme.cardBorder }}
                      >
                        {idx + 1}
                      </span>
                      <div>
                        <p className="text-sm font-extrabold leading-snug" style={{ color: theme.textPrimary }}>{g.goal}</p>
                        <p className="text-[10px] uppercase font-bold tracking-wider mt-1" style={{ color: theme.textSecondary }}>
                          Strand: {g.strand} • Target: {formatDate(g.targetDate)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="italic text-center py-6" style={{ color: theme.textSecondary }}>No goals available to display.</p>
              )}
            </div>

            <div 
              className="mt-6 p-5 border rounded-2xl text-center shadow-sm"
              style={{ backgroundColor: theme.badgeBg, borderColor: theme.cardBorder, color: theme.primary }}
            >
              <p className="text-sm font-black tracking-tight leading-relaxed italic">
                "I am committed to taking small, consistent steps toward my goals."
              </p>
            </div>
          </div>
        );

      case 'CONFERENCE_NOTES':
        return (
          <div className="flex flex-col items-center justify-center min-h-[420px] text-center p-12 space-y-6 select-none" style={{ backgroundColor: theme.slideBg }}>
            <div 
              className="w-16 h-16 rounded-[1.5rem] flex items-center justify-center shadow-md animate-bounce"
              style={{ backgroundColor: theme.badgeBg, color: theme.primary }}
            >
              <MessageSquare size={36} />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-black tracking-tight" style={{ color: theme.primary }}>Conference Notes & Agreements</h3>
              <p className="text-sm max-w-md mx-auto leading-relaxed" style={{ color: theme.textSecondary }}>
                Conference notes and agreements will be added during the review and consensus phase with your homeroom teacher and parents.
              </p>
            </div>
            <div 
              className="p-4 rounded-xl border text-xs font-black uppercase tracking-wider"
              style={{ backgroundColor: theme.cardBg, borderColor: theme.cardBorder, color: theme.secondary }}
            >
              Read-Only Stage 3 Presentation
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div 
      className="rounded-[2rem] border overflow-hidden min-h-[420px] flex flex-col justify-between transition-all duration-300"
      style={{ backgroundColor: theme.slideBg, borderColor: theme.cardBorder, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}
      id={`presentation-slide-${slide.type.toLowerCase()}`}
    >
      <div className="flex-1 overflow-y-auto max-h-[60vh] md:max-h-[70vh]">
        {renderContent()}
      </div>
    </div>
  );
}
