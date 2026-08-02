import * as React from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useAcademicYear } from '../../../context/AcademicYearContext';
import { threeWayConferenceService, resolveConferenceClass } from '../../../services/threeWayConferenceService';
import { Student, ThreeWayConference, Class } from '../../../types';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, Tv, X, Play, RefreshCw, AlertCircle, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../../lib/utils';

// Sub-components
import { PresentationSlide, SlideData, PRESENTATION_THEMES } from './PresentationSlide';
import { PresentationControls } from './PresentationControls';
import { PresentationProgress } from './PresentationProgress';

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

export interface PresentationViewerProps {
  conference: ThreeWayConference | null;
  student: Student | null;
  viewerMode: 'STUDENT' | 'TEACHER';
  viewerName?: string;
  canEdit: boolean;
  onRefresh?: () => void;
}

export function ThreeWayConferencePresentationViewer({
  conference,
  student,
  viewerMode,
  viewerName,
  canEdit = false,
  onRefresh
}: PresentationViewerProps) {
  const navigate = useNavigate();
  const { activeYear, activeSemester } = useAcademicYear();

  // Loading and error states
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selfExplorationRef, setSelfExplorationRef] = React.useState<any>(null);
  const [resolvedClass, setResolvedClass] = React.useState<Class | null>(null);

  // Theme Settings
  const [selectedTheme, setSelectedTheme] = React.useState<'LAZUARDI' | 'OCEAN' | 'COBALT' | 'BLOOM' | 'EARTH'>('LAZUARDI');

  // Presentation Mode State
  const [isPresentMode, setIsPresentMode] = React.useState(false);
  const [currentSlideIndex, setCurrentSlideIndex] = React.useState(0);
  const [textSize, setTextSize] = React.useState<'NORMAL' | 'LARGE' | 'XLARGE'>('NORMAL');

  // Fetch references (e.g. self-exploration reference data)
  const fetchReferences = React.useCallback(async () => {
    if (!student?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Select active theme from conference response snapshot
      if (conference?.presentationTheme) {
        setSelectedTheme(conference.presentationTheme);
      }

      // Fetch student self exploration reference
      const seRef = await threeWayConferenceService.getStudentSelfExplorationReference(
        student.id,
        conference?.academicYear || activeYear,
        Number(conference?.semester || activeSemester)
      );
      setSelfExplorationRef(seRef);

      // Resolve actual active class for the student for this specific conference academic year
      if (conference) {
        const resolved = await resolveConferenceClass(conference as any, student);
        setResolvedClass(resolved);
      }
    } catch (err: any) {
      console.error('Error fetching presentation viewer references:', err);
      // We don't block the entire viewer if only reference fetching fails, unless it's a critical error
    } finally {
      setLoading(false);
    }
  }, [student, conference, activeYear, activeSemester]);

  React.useEffect(() => {
    fetchReferences();
  }, [fetchReferences]);

  // Handle exiting presentation view
  const handleExitViewer = () => {
    if (viewerMode === 'TEACHER') {
      if (student?.id) {
        navigate(`/junior-high/conference/workspace?studentId=${student.id}`);
      } else {
        navigate('/junior-high/conference/workspace');
      }
    } else {
      navigate('/student/goal-setting');
    }
  };

  // Build slide list dynamically based on the conference response content
  const slides = React.useMemo(() => {
    const list: SlideData[] = [];
    if (!conference) return list;

    // 1. Cover
    list.push({ type: 'COVER', title: 'Cover' });

    // 2. About Me
    if (conference.aboutMe && conference.aboutMe.trim()) {
      list.push({ type: 'ABOUT_ME', title: 'About Me' });
    }

    // 3. My Strengths
    if (conference.strengths && conference.strengths.trim()) {
      const parsedStrengths = parseBulletPoints(conference.strengths);
      if (parsedStrengths.length > 4) {
        const chunkSize = 4;
        for (let i = 0; i < parsedStrengths.length; i += chunkSize) {
          const chunk = parsedStrengths.slice(i, i + chunkSize);
          list.push({
            type: 'STRENGTHS',
            title: `My Strengths (${Math.floor(i / chunkSize) + 1})`,
            strengthsList: chunk,
            strengthIndex: i,
            totalStrengths: parsedStrengths.length
          });
        }
      } else {
        list.push({
          type: 'STRENGTHS',
          title: 'My Strengths',
          strengthsList: parsedStrengths,
          strengthIndex: 0,
          totalStrengths: parsedStrengths.length
        });
      }
    }

    // 4. My Areas for Growth
    if (conference.areasForGrowth && conference.areasForGrowth.trim()) {
      list.push({ type: 'GROWTH', title: 'My Areas for Growth' });
    }

    // 5-8. Goals by Strand
    const goals = conference.goals || [];
    const spiritualGoals = goals.filter(g => g.strand === 'SPIRITUAL');
    const imaginalGoals = goals.filter(g => g.strand === 'IMAGINAL');
    const rationalGoals = goals.filter(g => g.strand === 'RATIONAL');
    const materialGoals = goals.filter(g => g.strand === 'MATERIAL_PHYSICAL');

    const addGoalsByStrand = (strandGoals: any[], title: string, strand: 'SPIRITUAL' | 'IMAGINAL' | 'RATIONAL' | 'MATERIAL') => {
      strandGoals.forEach((goal, idx) => {
        list.push({
          type: 'GOAL_STRAND',
          title: title,
          strand: strand,
          singleGoal: goal,
          goalIndex: idx,
          totalGoals: strandGoals.length
        });
      });
    };

    if (spiritualGoals.length > 0) {
      addGoalsByStrand(spiritualGoals, 'Spiritual Goals', 'SPIRITUAL');
    }
    if (imaginalGoals.length > 0) {
      addGoalsByStrand(imaginalGoals, 'Imaginal Goals', 'IMAGINAL');
    }
    if (rationalGoals.length > 0) {
      addGoalsByStrand(rationalGoals, 'Rational Goals', 'RATIONAL');
    }
    if (materialGoals.length > 0) {
      addGoalsByStrand(materialGoals, 'Material/Physical Goals', 'MATERIAL');
    }

    // 9. Self-Exploration
    const hasSeData = selfExplorationRef?.enrollment || conference.selfExplorationSnapshot || conference.selfExplorationReferenceId;
    if (hasSeData) {
      list.push({ type: 'SELF_EXPLORATION', title: 'My Self-Exploration' });
    }

    // 10. Karya Ilmiah (Grade 9 only, when reference data exists)
    const isGrade9 = conference.gradeLevel === 9 || student?.grade === 9;
    const hasKiData = conference.karyaIlmiahReferenceId || conference.karyaIlmiahReferenceId !== null;
    if (isGrade9 && hasKiData) {
      list.push({ type: 'KARYA_ILMIAH', title: 'My Karya Ilmiah' });
    }

    // 11. Unit Activity
    if (conference.unitActivities && conference.unitActivities.length > 0) {
      conference.unitActivities.forEach(ua => {
        if (ua.activityName || ua.worries || ua.overcomingPlan) {
          list.push({
            type: 'UNIT_ACTIVITY',
            title: `Unit Activity: ${ua.category}`,
            unitActivityCategory: ua.category,
            unitActivityName: ua.activityName,
            unitActivityWorries: ua.worries,
            unitActivityOvercomingPlan: ua.overcomingPlan
          });
        }
      });
    } else if (conference.unitActivity && conference.unitActivity.trim()) {
      list.push({ type: 'UNIT_ACTIVITY', title: 'My Unit Activity' });
    }

    // 13. Conference Notes (Only for Submitted or Completed)
    if (conference.status === 'SUBMITTED' || conference.status === 'CONFERENCE_COMPLETED') {
      list.push({ type: 'CONFERENCE_NOTES', title: 'Conference Notes' });
    }

    return list;
  }, [conference, selfExplorationRef, student]);

  // Keep current index in safe boundaries
  React.useEffect(() => {
    if (slides.length > 0 && currentSlideIndex >= slides.length) {
      setCurrentSlideIndex(Math.max(0, slides.length - 1));
    }
  }, [slides, currentSlideIndex]);

  // Keyboard navigation for Present Mode
  React.useEffect(() => {
    if (!isPresentMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentSlideIndex(prev => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight' || e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        setCurrentSlideIndex(prev => Math.min(slides.length - 1, prev + 1));
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setIsPresentMode(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPresentMode, slides.length]);

  const handlePrevious = () => {
    setCurrentSlideIndex(prev => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    setCurrentSlideIndex(prev => Math.min(slides.length - 1, prev + 1));
  };

  const handleTogglePresentMode = () => {
    setIsPresentMode(prev => !prev);
  };

  const handleSelectTheme = async (themeKey: 'LAZUARDI' | 'OCEAN' | 'COBALT' | 'BLOOM' | 'EARTH') => {
    if (viewerMode === 'TEACHER') return; // Teacher cannot modify student theme choice

    setSelectedTheme(themeKey);
    if (conference && student?.id) {
      try {
        await threeWayConferenceService.savePresentationTheme(conference.periodId, student.id, themeKey);
      } catch (err) {
        console.error('Error saving presentation theme:', err);
      }
    }
  };

  // 1. Loading Skeleton Screen
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4" id="presentation-skeleton-loader">
        <Loader2 className="animate-spin text-blue-600" size={36} />
        <p className="text-sm font-bold text-gray-500 uppercase tracking-widest animate-pulse">
          Loading Presentation Viewer...
        </p>
      </div>
    );
  }

  // 2. Data Siswa Hilang
  if (!student) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center max-w-md mx-auto" id="error-student-missing">
        <div className="p-4 bg-red-50 text-red-600 rounded-full mb-4">
          <AlertCircle size={32} />
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-2">Data siswa untuk conference ini tidak ditemukan.</h3>
        <p className="text-sm text-gray-500 mb-6">Data siswa atau profil murid tidak dapat dimuat dari sistem database.</p>
        <button
          onClick={handleExitViewer}
          className="px-5 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-sm font-bold transition shadow-md"
        >
          Kembali ke Workspace
        </button>
      </div>
    );
  }

  // 3. Conference belum memiliki konten / Response belum ada
  if (!conference || slides.length <= 1) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center max-w-md mx-auto" id="error-no-content">
        <div className="p-4 bg-amber-50 text-amber-600 rounded-full mb-4">
          <AlertCircle size={32} />
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-2">Presentasi belum memiliki konten yang dapat ditampilkan.</h3>
        <p className="text-sm text-gray-500 mb-6">Siswa belum mengisi respon Goal Setting atau data conference kosong.</p>
        <button
          onClick={handleExitViewer}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition shadow-md"
        >
          Kembali ke Workspace
        </button>
      </div>
    );
  }

  const currentSlide = slides[currentSlideIndex];
  const activeTheme = PRESENTATION_THEMES[selectedTheme];

  return (
    <div className="w-full space-y-6">
      
      {/* Teacher Presentation Header Banner (Preview mode only) */}
      {viewerMode === 'TEACHER' && !isPresentMode && (
        <div 
          className="bg-slate-900 text-white px-5 py-3.5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border border-slate-800 shadow-lg"
          id="teacher-mode-banner"
        >
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-bold tracking-tight">
            <span className="text-slate-400 font-mono text-[10px] tracking-wider uppercase">PRESENTATION MODE</span>
            <span className="text-slate-600 hidden sm:inline">•</span>
            <span className="text-white font-black text-sm">{student.name}</span>
            <span className="text-slate-600 hidden sm:inline">•</span>
            <span className="bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-md border border-blue-500/20 text-[10px] font-black uppercase tracking-widest">
              Dipandu oleh Guru
            </span>
            {viewerName && (
              <>
                <span className="text-slate-600 hidden sm:inline">•</span>
                <span className="text-slate-400 font-normal">Guru: {viewerName}</span>
              </>
            )}
          </div>
          <button
            onClick={handleExitViewer}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-[11px] font-bold uppercase transition"
          >
            <ArrowLeft size={12} />
            <span>Keluar</span>
          </button>
        </div>
      )}

      {/* Normal Preview Mode layout */}
      {!isPresentMode ? (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-6"
        >
          {/* Header showing conference meta info */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-gray-100">
            <div>
              <h1 className="text-2xl font-black text-gray-900 tracking-tight">
                {viewerMode === 'TEACHER' ? `${student.name}'s Conference Slides` : 'My Presentation'}
              </h1>
              <p className="text-xs text-gray-500 mt-1">
                Academic Year: <strong>{conference.academicYear}</strong> • Semester: <strong>{conference.semester}</strong> • Theme: <strong>{activeTheme.name}</strong>
              </p>
            </div>

            <div className="flex items-center gap-4 self-start md:self-center">
              <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl border border-gray-200/50" id="preview-text-size-controls">
                <button
                  onClick={() => setTextSize('NORMAL')}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer",
                    textSize === 'NORMAL'
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-900 hover:bg-white/40"
                  )}
                  title="Normal Font Size"
                >
                  A
                </button>
                <button
                  onClick={() => setTextSize('LARGE')}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer",
                    textSize === 'LARGE'
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-900 hover:bg-white/40"
                  )}
                  title="Large Font Size"
                >
                  A+
                </button>
                <button
                  onClick={() => setTextSize('XLARGE')}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-sm font-black transition-all cursor-pointer",
                    textSize === 'XLARGE'
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-900 hover:bg-white/40"
                  )}
                  title="Extra Large Font Size"
                >
                  A++
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-gray-400 uppercase tracking-widest">
                  Status:
                </span>
                <span
                  id="presentation-status-badge"
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider border",
                    conference.status === 'DRAFT'
                      ? "bg-amber-50 text-amber-700 border-amber-200"
                      : "bg-emerald-50 text-emerald-700 border-emerald-200"
                  )}
                >
                  {conference.status}
                </span>
              </div>
            </div>
          </div>

          {/* Theme Selector (STUDENT only) */}
          {viewerMode === 'STUDENT' && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-white border border-gray-100 rounded-2xl shadow-sm">
              <div className="space-y-0.5">
                <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest">Presentation Theme</h4>
                <p className="text-[10px] text-gray-400 font-medium">Select an authentic style identity for your slides.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(['LAZUARDI', 'OCEAN', 'COBALT', 'BLOOM', 'EARTH'] as const).map((themeKey) => {
                  const th = PRESENTATION_THEMES[themeKey];
                  const isSelected = selectedTheme === themeKey;
                  return (
                    <button
                      key={themeKey}
                      id={`btn-theme-${themeKey.toLowerCase()}`}
                      onClick={() => handleSelectTheme(themeKey)}
                      className={cn(
                        "flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-extrabold border transition-all cursor-pointer",
                        isSelected
                          ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                          : "bg-gray-50 hover:bg-gray-100 text-gray-600 border-gray-200"
                      )}
                    >
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: th.primary }} />
                      <span>{th.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Central Slide Stage */}
          {currentSlide && (
            <div className="relative w-full h-[540px] md:h-[620px] lg:h-[680px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentSlideIndex}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                  className="w-full h-full"
                >
                  <PresentationSlide
                    slide={currentSlide}
                    studentName={student.name}
                    className={resolvedClass?.name || conference.className || (student as any).className || ''}
                    gradeLevel={resolvedClass?.grade || conference.gradeLevel || student.grade || 0}
                    academicYear={conference.academicYear}
                    semester={conference.semester}
                    aboutMe={conference.aboutMe || ''}
                    strengths={conference.strengths || ''}
                    areasForGrowth={conference.areasForGrowth || ''}
                    unitActivity={conference.unitActivity || ''}
                    selfExplorationRef={selfExplorationRef}
                    status={conference.status as any}
                    themeId={selectedTheme}
                    textSize={textSize}
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          )}

          {/* Slide Progress Dots */}
          <PresentationProgress
            currentSlideIndex={currentSlideIndex}
            slides={slides}
            onSelectSlide={setCurrentSlideIndex}
            themeId={selectedTheme}
          />

          {/* Controls */}
          <PresentationControls
            currentSlideIndex={currentSlideIndex}
            totalSlides={slides.length}
            isPresentMode={false}
            onPrevious={handlePrevious}
            onNext={handleNext}
            onTogglePresentMode={handleTogglePresentMode}
            onBackToGoalSetting={handleExitViewer}
            themeId={selectedTheme}
          />
        </motion.div>
      ) : (
        
        /* Full Screen Present Mode */
        <div 
          className="fixed inset-0 z-50 flex flex-col justify-between p-6 md:p-8 select-none animate-in fade-in duration-300 overflow-hidden"
          style={{ backgroundColor: activeTheme.bg }}
        >
          {/* Top Bar inside Present Mode */}
          <div className="w-full max-w-5xl mx-auto flex items-center justify-between border-b border-white/10 pb-4 shrink-0">
            <div className="flex items-center gap-3">
              <div 
                className="p-2 rounded-xl shadow-sm"
                style={{ backgroundColor: activeTheme.badgeBg, color: activeTheme.primary }}
              >
                <Tv size={20} />
              </div>
              <div className="text-left">
                {viewerMode === 'TEACHER' ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-black uppercase tracking-wider text-teal-400 bg-teal-400/10 border border-teal-400/20 px-1.5 py-0.5 rounded-md">
                      PRESENTATION MODE
                    </span>
                    <span className="text-xs text-white/50">•</span>
                    <h4 className="text-sm font-black text-white tracking-tight uppercase">
                      {student.name}
                    </h4>
                    <span className="text-xs text-white/50">•</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400 bg-blue-400/10 border border-blue-400/20 px-1.5 py-0.5 rounded-md">
                      Dipandu oleh Guru
                    </span>
                    {viewerName && (
                      <>
                        <span className="text-xs text-white/50">•</span>
                        <span className="text-[10px] font-normal text-white/60">Guru: {viewerName}</span>
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    <h4 className="text-sm font-black text-white tracking-tight uppercase">
                      {student.name}
                    </h4>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-teal-400">
                      Three-Way Conference • Presentation Mode
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10" id="present-text-size-controls">
                <button
                  onClick={() => setTextSize('NORMAL')}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer",
                    textSize === 'NORMAL'
                      ? "bg-white text-slate-950 shadow-sm"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  )}
                  title="Normal Font Size"
                >
                  A
                </button>
                <button
                  onClick={() => setTextSize('LARGE')}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer",
                    textSize === 'LARGE'
                      ? "bg-white text-slate-950 shadow-sm"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  )}
                  title="Large Font Size"
                >
                  A+
                </button>
                <button
                  onClick={() => setTextSize('XLARGE')}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-sm font-black transition-all cursor-pointer",
                    textSize === 'XLARGE'
                      ? "bg-white text-slate-950 shadow-sm"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  )}
                  title="Extra Large Font Size"
                >
                  A++
                </button>
              </div>

              <button
                id="btn-close-present-top"
                onClick={() => setIsPresentMode(false)}
                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer"
                title="Exit Present Mode (Esc)"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Slide Stage frame */}
          <div className="flex-1 w-full flex items-center justify-center my-4 overflow-hidden shrink-0">
            <div 
              style={{ width: 'min(96vw, 1720px)', height: 'min(72vh, 880px)' }}
              className="flex flex-col justify-between rounded-[2rem] shadow-2xl border border-white/5 overflow-hidden"
            >
              <AnimatePresence mode="wait">
                {currentSlide && (
                  <motion.div
                    key={currentSlideIndex}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.2 }}
                    className="w-full h-full"
                  >
                    <PresentationSlide
                      slide={currentSlide}
                      studentName={student.name}
                      className={conference.className || (student as any).className || ''}
                      gradeLevel={conference.gradeLevel || student.grade || 0}
                      academicYear={conference.academicYear}
                      semester={conference.semester}
                      aboutMe={conference.aboutMe || ''}
                      strengths={conference.strengths || ''}
                      areasForGrowth={conference.areasForGrowth || ''}
                      unitActivity={conference.unitActivity || ''}
                      selfExplorationRef={selfExplorationRef}
                      status={conference.status as any}
                      themeId={selectedTheme}
                      textSize={textSize}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Bottom Bar Controls & Progress */}
          <div className="w-full max-w-5xl mx-auto space-y-4 shrink-0">
            <PresentationProgress
              currentSlideIndex={currentSlideIndex}
              slides={slides}
              onSelectSlide={setCurrentSlideIndex}
              themeId={selectedTheme}
            />

            <PresentationControls
              currentSlideIndex={currentSlideIndex}
              totalSlides={slides.length}
              isPresentMode={true}
              onPrevious={handlePrevious}
              onNext={handleNext}
              onTogglePresentMode={handleTogglePresentMode}
              themeId={selectedTheme}
            />
          </div>
        </div>
      )}
    </div>
  );
}
