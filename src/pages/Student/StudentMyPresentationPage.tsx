import * as React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { getStudentById } from '../../lib/firebase';
import { threeWayConferenceService } from '../../services/threeWayConferenceService';
import { Student, ConferencePeriod, StudentConferenceResponse } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, Tv, AlertCircle, ArrowLeft, ArrowRight, Play, X, Compass, Award, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// Sub-components
import { PresentationHeader } from '../../components/Student/MyPresentation/PresentationHeader';
import { PresentationSlide, SlideData } from '../../components/Student/MyPresentation/PresentationSlide';
import { PresentationControls } from '../../components/Student/MyPresentation/PresentationControls';
import { PresentationProgress } from '../../components/Student/MyPresentation/PresentationProgress';
import { PresentationEmptyState } from '../../components/Student/MyPresentation/PresentationEmptyState';

export default function StudentMyPresentationPage() {
  const { profile } = useAuth();
  const { activeYear, activeSemester } = useAcademicYear();
  const navigate = useNavigate();

  // Loading States
  const [loading, setLoading] = React.useState(true);

  // Core Data
  const [student, setStudent] = React.useState<Student | null>(null);
  const [period, setPeriod] = React.useState<ConferencePeriod | null>(null);
  const [response, setResponse] = React.useState<StudentConferenceResponse | null>(null);
  const [selfExplorationRef, setSelfExplorationRef] = React.useState<any>(null);

  // Presentation Mode State
  const [isPresentMode, setIsPresentMode] = React.useState(false);
  const [currentSlideIndex, setCurrentSlideIndex] = React.useState(0);

  const studentId = profile?.luminaId || '';

  const fetchData = React.useCallback(async () => {
    if (!studentId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Fetch student trusted records
      const sData = await getStudentById(studentId);
      setStudent(sData);

      // Fetch active conference period
      const activePeriod = await threeWayConferenceService.getCurrentConferencePeriod(activeYear, activeSemester);
      setPeriod(activePeriod);

      if (activePeriod) {
        // Fetch existing response
        const existingResponse = await threeWayConferenceService.getCurrentStudentConferenceResponse(activePeriod.id, studentId);
        setResponse(existingResponse);

        // Fetch Self-Exploration References
        const seRef = await threeWayConferenceService.getStudentSelfExplorationReference(studentId, activeYear, activeSemester);
        setSelfExplorationRef(seRef);
      }
    } catch (err) {
      console.error('Error fetching data for presentation:', err);
    } finally {
      setLoading(false);
    }
  }, [studentId, activeYear, activeSemester]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Build slide list dynamically
  const slides = React.useMemo(() => {
    const list: SlideData[] = [];
    if (!response) return list;

    // 1. Cover
    list.push({ type: 'COVER', title: 'Cover' });

    // 2. About Me
    list.push({ type: 'ABOUT_ME', title: 'About Me' });

    // 3. My Strengths
    list.push({ type: 'STRENGTHS', title: 'My Strengths' });

    // 4. My Areas for Growth
    list.push({ type: 'GROWTH', title: 'My Areas for Growth' });

    // 5-8. Goals by Strand
    const goals = response.goals || [];
    const spiritualGoals = goals.filter(g => g.strand === 'SPIRITUAL');
    const imaginalGoals = goals.filter(g => g.strand === 'IMAGINAL');
    const rationalGoals = goals.filter(g => g.strand === 'RATIONAL');
    const materialGoals = goals.filter(g => g.strand === 'MATERIAL');

    if (spiritualGoals.length > 0) {
      list.push({ type: 'GOAL_STRAND', title: 'Spiritual Goals', strand: 'SPIRITUAL', goals: spiritualGoals });
    }
    if (imaginalGoals.length > 0) {
      list.push({ type: 'GOAL_STRAND', title: 'Imaginal Goals', strand: 'IMAGINAL', goals: imaginalGoals });
    }
    if (rationalGoals.length > 0) {
      list.push({ type: 'GOAL_STRAND', title: 'Rational Goals', strand: 'RATIONAL', goals: rationalGoals });
    }
    if (materialGoals.length > 0) {
      list.push({ type: 'GOAL_STRAND', title: 'Material/Physical Goals', strand: 'MATERIAL', goals: materialGoals });
    }

    // 9. Self-Exploration
    const hasSeData = selfExplorationRef?.enrollment || response.selfExplorationSnapshot || response.selfExplorationReferenceId;
    if (hasSeData) {
      list.push({ type: 'SELF_EXPLORATION', title: 'My Self-Exploration' });
    }

    // 10. Karya Ilmiah (Grade 9 only, when reference data exists)
    const isGrade9 = response.gradeLevel === 9 || student?.grade === 9;
    const hasKiData = response.karyaIlmiahReferenceId || response.karyaIlmiahReferenceId !== null;
    if (isGrade9 && hasKiData) {
      list.push({ type: 'KARYA_ILMIAH', title: 'My Karya Ilmiah' });
    }

    // 11. Unit Activity
    if (response.unitActivity && response.unitActivity.trim()) {
      list.push({ type: 'UNIT_ACTIVITY', title: 'My Unit Activity' });
    }

    // 12. Commitment (Only if goals exist)
    if (goals.length > 0) {
      const nearestGoals = [...goals]
        .filter(g => g.targetDate !== null)
        .sort((a, b) => (a.targetDate || 0) - (b.targetDate || 0))
        .slice(0, 3);
      list.push({ type: 'COMMITMENT', title: 'My Commitment', goals: nearestGoals });
    }

    // 13. Conference Notes (Only for Submitted or Completed)
    if (response.status === 'SUBMITTED' || response.status === 'CONFERENCE_COMPLETED') {
      list.push({ type: 'CONFERENCE_NOTES', title: 'Conference Notes' });
    }

    return list;
  }, [response, selfExplorationRef, student]);

  // Reset current slide safely if the dynamic slide list changes
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
      } else if (e.key === 'ArrowRight') {
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

  const handleBackToGoalSetting = () => {
    navigate('/student/goal-setting');
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="animate-spin text-blue-600" size={36} />
        <p className="text-sm font-bold text-gray-500 uppercase tracking-widest animate-pulse">
          Loading Presentation...
        </p>
      </div>
    );
  }

  // Availability Checks
  if (!period) {
    return <PresentationEmptyState type="NO_PERIOD" />;
  }

  if (!response) {
    return <PresentationEmptyState type="NO_RESPONSE" />;
  }

  const currentSlide = slides[currentSlideIndex];

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8 space-y-8 max-w-5xl mx-auto">
      {/* Normal Preview Mode */}
      {!isPresentMode ? (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-6"
        >
          {/* Header section with warning banners if DRAFT */}
          <PresentationHeader
            status={response.status}
            onBackToGoalSetting={handleBackToGoalSetting}
          />

          {/* Central Stage */}
          {currentSlide && (
            <div className="relative">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentSlideIndex}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <PresentationSlide
                    slide={currentSlide}
                    studentName={response.studentName || student?.name || ''}
                    className={response.className || ''}
                    gradeLevel={response.gradeLevel || student?.grade || 0}
                    academicYear={response.academicYear || activeYear}
                    semester={response.semester || activeSemester}
                    aboutMe={response.aboutMe || ''}
                    strengths={response.strengths || ''}
                    areasForGrowth={response.areasForGrowth || ''}
                    unitActivity={response.unitActivity || ''}
                    selfExplorationRef={selfExplorationRef}
                    status={response.status}
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          )}

          {/* Slide progress dots and label */}
          <PresentationProgress
            currentSlideIndex={currentSlideIndex}
            totalSlides={slides.length}
            onSelectSlide={setCurrentSlideIndex}
          />

          {/* Navigation Controls */}
          <PresentationControls
            currentSlideIndex={currentSlideIndex}
            totalSlides={slides.length}
            isPresentMode={false}
            onPrevious={handlePrevious}
            onNext={handleNext}
            onTogglePresentMode={handleTogglePresentMode}
            onBackToGoalSetting={handleBackToGoalSetting}
          />
        </motion.div>
      ) : (
        /* Present Mode: Focused, full-screen-like backdrop overlay */
        <div className="fixed inset-0 bg-gray-950 z-50 flex flex-col justify-between p-6 select-none animate-in fade-in duration-300">
          {/* Top Info Bar */}
          <div className="flex items-center justify-between border-b border-gray-900 pb-4 max-w-4xl mx-auto w-full">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-950/50 text-blue-400 rounded-xl">
                <Tv size={20} />
              </div>
              <div className="text-left">
                <h4 className="text-sm font-black text-white tracking-tight uppercase">
                  {student?.name || response.studentName}
                </h4>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                  Active Presentation Mode
                </p>
              </div>
            </div>

            <button
              id="btn-close-present-top"
              onClick={() => setIsPresentMode(false)}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-900 rounded-xl transition-all cursor-pointer"
              title="Exit Present Mode (Esc)"
            >
              <X size={20} />
            </button>
          </div>

          {/* Central Active Slide Stage */}
          <div className="flex-1 flex items-center justify-center py-8 max-w-4xl mx-auto w-full">
            <AnimatePresence mode="wait">
              {currentSlide && (
                <motion.div
                  key={currentSlideIndex}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                  className="w-full max-w-3xl"
                >
                  <PresentationSlide
                    slide={currentSlide}
                    studentName={response.studentName || student?.name || ''}
                    className={response.className || ''}
                    gradeLevel={response.gradeLevel || student?.grade || 0}
                    academicYear={response.academicYear || activeYear}
                    semester={response.semester || activeSemester}
                    aboutMe={response.aboutMe || ''}
                    strengths={response.strengths || ''}
                    areasForGrowth={response.areasForGrowth || ''}
                    unitActivity={response.unitActivity || ''}
                    selfExplorationRef={selfExplorationRef}
                    status={response.status}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Bottom Progress & Control Bar */}
          <div className="space-y-4 max-w-4xl mx-auto w-full">
            <div className="flex justify-center gap-2">
              {Array.from({ length: slides.length }).map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentSlideIndex(idx)}
                  className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                    idx === currentSlideIndex ? 'w-6 bg-blue-500' : 'w-1.5 bg-gray-800 hover:bg-gray-700'
                  }`}
                  title={`Go to slide ${idx + 1}`}
                />
              ))}
            </div>

            <PresentationControls
              currentSlideIndex={currentSlideIndex}
              totalSlides={slides.length}
              isPresentMode={true}
              onPrevious={handlePrevious}
              onNext={handleNext}
              onTogglePresentMode={handleTogglePresentMode}
            />
          </div>
        </div>
      )}
    </div>
  );
}
