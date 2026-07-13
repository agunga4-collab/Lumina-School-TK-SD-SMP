import * as React from 'react';
import { useOutletContext, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileSpreadsheet, User, Calendar, Target, Save, 
  CheckCircle2, AlertCircle, Info, Clock, BookOpen,
  ArrowRight, ShieldCheck, HelpCircle, ChevronLeft, ChevronRight, Plus
} from 'lucide-react';
import { cn, formatDate } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { 
  db, getCICOGoalConfig, saveCICOGoalConfig, 
  getCICODailyReports, saveCICODailyReport,
  getCICOWeeklyReflections, saveCICOWeeklyReflection,
  getClasses, getActiveStudents, getTeachers, createBehaviorAlert,
  handleFirestoreError
} from '../../lib/firebase';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { CICO_SESSIONS, CICO_DEFAULT_GOALS } from '../../constants';
import type { 
  MTSSCase, CICODailyReport, CICOSessionData, CICOWeeklyReflection, Student, Class, User as AppUser
} from '../../types';

// Helper to get Monday of a week
function getMonday(d: Date): Date {
  const dateCopy = new Date(d);
  const day = dateCopy.getDay();
  const diff = dateCopy.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  return new Date(dateCopy.setDate(diff));
}

// Format date to local Indonesian string
function formatLocalDate(d: Date): string {
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

export default function MTSSBehaviorSpreadsheet() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { filters } = useOutletContext<{ filters: any }>();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL parameters if navigated from elsewhere
  const urlStudentId = searchParams.get('studentId') || '';
  const urlClassId = searchParams.get('classId') || '';

  // Class & Student listing states
  const [classes, setClasses] = React.useState<Class[]>([]);
  const [students, setStudents] = React.useState<Student[]>([]);
  const [cases, setCases] = React.useState<MTSSCase[]>([]);
  const [teachers, setTeachers] = React.useState<AppUser[]>([]);

  // Selection states
  const [selectedClassId, setSelectedClassId] = React.useState<string>(urlClassId);
  const [selectedStudentId, setSelectedStudentId] = React.useState<string>(urlStudentId);
  const [currentWeekMonday, setCurrentWeekMonday] = React.useState<Date>(getMonday(new Date()));
  const [activeDayIdx, setActiveDayIdx] = React.useState<number>(new Date().getDay() >= 1 && new Date().getDay() <= 5 ? new Date().getDay() - 1 : 0); // Default to Mon-Fri or Mon

  // Core Data States
  const [mtssCase, setMtssCase] = React.useState<MTSSCase | null>(null);
  const [dailyReports, setDailyReports] = React.useState<CICODailyReport[]>([]);
  const [reflections, setReflections] = React.useState<CICOWeeklyReflection[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [savingDaily, setSavingDaily] = React.useState(false);
  const [savingReflection, setSavingReflection] = React.useState(false);

  // Daily Entry State
  const [dailyForm, setDailyForm] = React.useState<Omit<CICODailyReport, 'id' | 'createdAt' | 'updatedAt'>>({
    caseId: '',
    studentId: '',
    date: '',
    weekNumber: 1,
    sessions: [],
    dailyAvgScore: 0,
    dailyNote: '',
    hasSpecialIncident: false,
    incidentNote: '',
    isAbsent: false,
    createdBy: profile?.uid || ''
  });

  // Reflection form state
  const [reflectionForm, setReflectionForm] = React.useState({
    studentPositives: '',
    studentPlans: '',
    teacherNotes: ''
  });

  // Monday of selected week formatted as YYYY-MM-DD
  const mondayStr = currentWeekMonday.toISOString().split('T')[0];

  // 1. Fetch Classes, Cases and Teachers initially
  React.useEffect(() => {
    if (!profile) return;
    const loadMetadata = async () => {
      try {
        const [classesData, teachersData] = await Promise.all([
          getClasses(),
          getTeachers()
        ]);
        setTeachers(teachersData || []);

        const jhClasses = (classesData || []).filter(c => 
          c.unitId === 'JUNIOR_HIGH' && 
          c.academicYear === filters.academicYear && 
          c.status !== 'archived'
        );
        setClasses(jhClasses);

        // Auto-select first class if not set by URL
        if (jhClasses.length > 0 && !selectedClassId) {
          setSelectedClassId(jhClasses[0].id);
        }
      } catch (err) {
        console.error("Error loading classes/teachers:", err);
      }
    };

    // Listen to behavior cases to match active Tier 2 students
    const casesQuery = query(
      collection(db, 'behaviorCases'),
      where('academicYear', '==', filters.academicYear)
    );
    const unsubscribeCases = onSnapshot(casesQuery, (snapshot) => {
      const casesList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as MTSSCase[];
      setCases(casesList);
    }, (err) => {
      handleFirestoreError(err, 'list', 'behaviorCases');
    });

    loadMetadata();
    return () => unsubscribeCases();
  }, [profile, filters.academicYear]);

  // 2. Fetch students roster dynamically for selected class
  React.useEffect(() => {
    if (!selectedClassId) return;
    const loadRoster = async () => {
      try {
        const classStudents = await getActiveStudents(selectedClassId, filters.academicYear);
        setStudents(classStudents || []);

        // Auto-select first student if not set or not in list
        if (classStudents && classStudents.length > 0) {
          const isCurrentInList = classStudents.some(s => s.id === selectedStudentId);
          if (!isCurrentInList && !urlStudentId) {
            setSelectedStudentId(classStudents[0].id);
          }
        } else {
          setSelectedStudentId('');
        }
      } catch (err) {
        console.error("Error loading roster:", err);
      }
    };
    loadRoster();
  }, [selectedClassId, filters.academicYear]);

  // 3. Find active case & fetch reports when selected student or selected week changes
  React.useEffect(() => {
    if (!selectedStudentId) {
      setMtssCase(null);
      setDailyReports([]);
      setReflections([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    // Find active behavior case for this student (preferably OPEN/MONITORING and Tier 2/3)
    const matchedCase = cases.find(c => 
      c.studentId === selectedStudentId && 
      c.status !== 'CLOSED' &&
      (c.tier === 'Tier 2' || c.tier === 'Tier 3')
    ) || cases.find(c => c.studentId === selectedStudentId && c.status !== 'CLOSED')
      || cases.find(c => c.studentId === selectedStudentId); // Fallback to any

    setMtssCase(matchedCase || null);

    if (!matchedCase) {
      setDailyReports([]);
      setReflections([]);
      setLoading(false);
      return;
    }

    // Fetch reports & reflections for this case
    const loadCICOData = async () => {
      try {
        const [reports, refs] = await Promise.all([
          getCICODailyReports(matchedCase.id),
          getCICOWeeklyReflections(matchedCase.id)
        ]);

        setDailyReports(reports || []);
        setReflections(refs || []);
      } catch (err) {
        console.error("Error loading CICO records:", err);
      } finally {
        setLoading(false);
      }
    };

    loadCICOData();
  }, [selectedStudentId, cases]);

  // Generate 5 days of the selected week
  const daysOfWeek = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(currentWeekMonday);
    d.setDate(currentWeekMonday.getDate() + i);
    return d;
  });

  const activeDateStr = daysOfWeek[activeDayIdx].toISOString().split('T')[0];

  // Goals list (mapped for matching)
  const cicoGoals = mtssCase?.tier2Meeting?.cicoGoals || CICO_DEFAULT_GOALS.map((g, i) => ({ id: `goal${i+1}`, label: g }));

  // 4. Update the Daily Form state when active date or dailyReports change
  React.useEffect(() => {
    if (!selectedStudentId) return;

    const existingReport = dailyReports.find(r => r.date === activeDateStr);
    if (existingReport) {
      setDailyForm(existingReport);
    } else {
      // Create fresh default session rows
      const freshSessions: CICOSessionData[] = CICO_SESSIONS.map(s => ({
        sessionId: s.id,
        sessionName: s.label,
        timeSlot: s.time,
        scores: { goal1: null, goal2: null, goal3: null, goal4: null },
        isNA: false,
        filledBy: profile?.uid || '',
        filledByName: profile?.displayName || ''
      }));

      setDailyForm({
        caseId: mtssCase?.id || 'unmatched',
        studentId: selectedStudentId,
        date: activeDateStr,
        weekNumber: 1,
        sessions: freshSessions,
        dailyAvgScore: 0,
        dailyNote: '',
        hasSpecialIncident: false,
        incidentNote: '',
        isAbsent: false,
        createdBy: profile?.uid || ''
      });
    }
  }, [activeDateStr, dailyReports, selectedStudentId, mtssCase]);

  // 5. Update the Weekly Reflection state when mondayStr or reflections change
  React.useEffect(() => {
    if (!mtssCase) return;
    const weeklyRef = reflections.find(r => r.weekStartingDate === mondayStr);
    if (weeklyRef) {
      setReflectionForm({
        studentPositives: weeklyRef.studentPositives || '',
        studentPlans: weeklyRef.studentPlans || '',
        teacherNotes: weeklyRef.teacherNotes || ''
      });
    } else {
      setReflectionForm({
        studentPositives: '',
        studentPlans: '',
        teacherNotes: ''
      });
    }
  }, [mondayStr, reflections, mtssCase]);

  // Handle Score Toggle inside grid cell
  const handleScoreSelect = (sessionId: string, goalKey: keyof CICOSessionData['scores'], scoreValue: 1 | 2 | 3) => {
    setDailyForm(prev => {
      const updatedSessions = prev.sessions.map(s => {
        if (s.sessionId === sessionId) {
          const currentVal = s.scores[goalKey];
          // Toggle off if clicking the already selected score
          const newVal = currentVal === scoreValue ? null : scoreValue;
          return {
            ...s,
            scores: {
              ...s.scores,
              [goalKey]: newVal
            },
            filledBy: profile?.uid || '',
            filledByName: profile?.displayName || s.filledByName || ''
          };
        }
        return s;
      });

      // Calculate new metrics
      let totalEarned = 0;
      let totalPossible = 0;
      updatedSessions.forEach(s => {
        if (s.isNA) return;
        Object.keys(s.scores).forEach(k => {
          const sc = s.scores[k as keyof CICOSessionData['scores']];
          if (sc !== null) {
            totalEarned += sc;
            totalPossible += 3;
          }
        });
      });

      const average = totalPossible > 0 ? (totalEarned / (totalPossible / 3)) : 0; // scale out of 3

      return {
        ...prev,
        sessions: updatedSessions,
        dailyAvgScore: average
      };
    });
  };

  // Toggle Entire Session as NA (Not Applicable)
  const handleToggleNA = (sessionId: string) => {
    setDailyForm(prev => {
      const updatedSessions = prev.sessions.map(s => {
        if (s.sessionId === sessionId) {
          const isCurrentlyNA = !s.isNA;
          return {
            ...s,
            isNA: isCurrentlyNA,
            scores: isCurrentlyNA 
              ? { goal1: null, goal2: null, goal3: null, goal4: null }
              : s.scores
          };
        }
        return s;
      });

      // Recalculate average
      let totalEarned = 0;
      let totalPossible = 0;
      updatedSessions.forEach(s => {
        if (s.isNA) return;
        Object.keys(s.scores).forEach(k => {
          const sc = s.scores[k as keyof CICOSessionData['scores']];
          if (sc !== null) {
            totalEarned += sc;
            totalPossible += 3;
          }
        });
      });

      const average = totalPossible > 0 ? (totalEarned / (totalPossible / 3)) : 0;

      return {
        ...prev,
        sessions: updatedSessions,
        dailyAvgScore: average
      };
    });
  };

  // Save Daily Report Worksheet to firestore
  const handleSaveDailyReport = async () => {
    if (!mtssCase) return;
    setSavingDaily(true);
    try {
      // Quick validation
      let filledSessionsCount = 0;
      dailyForm.sessions.forEach(s => {
        if (s.isNA) return;
        const hasSomeScore = Object.values(s.scores).some(v => v !== null);
        if (hasSomeScore) filledSessionsCount++;
      });

      if (filledSessionsCount < 5 && !dailyForm.isAbsent) {
        const proceed = window.confirm(`Hanya ${filledSessionsCount} sesi yang terisi nilai hari ini (Direkomendasikan minimal 5 sesi). Yakin ingin menyimpan worksheet?`);
        if (!proceed) {
          setSavingDaily(false);
          return;
        }
      }

      const payload = {
        ...dailyForm,
        caseId: mtssCase.id,
        isLateInput: activeDateStr !== new Date().toISOString().split('T')[0]
      };

      await saveCICODailyReport(payload);

      // Reload fresh daily reports
      const reports = await getCICODailyReports(mtssCase.id);
      setDailyReports(reports || []);

      // High severity alert if low scores 3 days in a row
      if (!dailyForm.isAbsent) {
        const validReports = (reports || []).filter(r => !r.isAbsent).slice(0, 3);
        if (validReports.length === 3 && validReports.every(r => r.dailyAvgScore < 1.5)) {
          const targetRoles = ['BK_MENTOR', 'HEAD_JUNIOR', 'SUPER_ADMIN'];
          const targetUserIds = teachers.filter(t => targetRoles.includes(t.role)).map(t => t.uid);

          await createBehaviorAlert({
            type: 'ALERT-T2-02',
            severity: 'HIGH',
            title: 'Skor CICO Sangat Rendah Beruntun',
            message: `${mtssCase.studentName} mendapat nilai rata-rata CICO < 1.5 selama 3 hari kerja berturut-turut.`,
            caseId: mtssCase.id,
            studentId: mtssCase.studentId,
            studentName: mtssCase.studentName,
            targetUserIds,
            actionUrl: `/junior-high/behavior/mtss/cases/${mtssCase.id}`
          });
        }
      }

      alert("Data CICO harian berhasil disimpan ke server!");
    } catch (err: any) {
      console.error(err);
      alert(`Gagal menyimpan data: ${err.message || String(err)}`);
    } finally {
      setSavingDaily(false);
    }
  };

  // Save Weekly Reflection
  const handleSaveReflection = async () => {
    if (!mtssCase) return;
    setSavingReflection(true);
    try {
      const payload: Omit<CICOWeeklyReflection, 'id' | 'createdAt' | 'updatedAt'> = {
        caseId: mtssCase.id,
        weekStartingDate: mondayStr,
        weekNumber: 1,
        studentPositives: reflectionForm.studentPositives,
        studentPlans: reflectionForm.studentPlans,
        teacherNotes: reflectionForm.teacherNotes
      };

      await saveCICOWeeklyReflection(payload);

      // Reload reflections
      const refs = await getCICOWeeklyReflections(mtssCase.id);
      setReflections(refs || []);

      alert("Catatan refleksi mingguan berhasil disimpan!");
    } catch (err: any) {
      console.error(err);
      alert(`Gagal menyimpan refleksi: ${err.message || String(err)}`);
    } finally {
      setSavingReflection(false);
    }
  };

  // Switch weeks
  const changeWeek = (direction: 'prev' | 'next') => {
    const offset = direction === 'prev' ? -7 : 7;
    const newMon = new Date(currentWeekMonday);
    newMon.setDate(currentWeekMonday.getDate() + offset);
    setCurrentWeekMonday(newMon);
  };

  // Get daily average for displaying on calendar or tabs
  const getDayAvgScore = (dateString: string) => {
    const report = dailyReports.find(r => r.date === dateString);
    if (!report) return null;
    if (report.isAbsent) return 'Absent';
    return report.dailyAvgScore;
  };

  const getDayPct = (dateString: string) => {
    const report = dailyReports.find(r => r.date === dateString);
    if (!report) return null;
    if (report.isAbsent) return null;
    // Calculate percentage based on session scores
    let earned = 0;
    let possible = 0;
    report.sessions.forEach(s => {
      if (s.isNA) return;
      Object.values(s.scores).forEach(sc => {
        const val = sc as number | null;
        if (val !== null) {
          earned += val;
          possible += 3;
        }
      });
    });
    return possible > 0 ? (earned / possible) * 100 : 0;
  };

  const activeStudentObj = students.find(s => s.id === selectedStudentId);

  return (
    <div className="space-y-6">
      {/* 1. Classroom & Student Workbook Selector bar */}
      <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center flex-1">
          {/* Class Select Dropdown */}
          <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-100 min-w-[150px]">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Class</span>
            <select
              value={selectedClassId}
              onChange={(e) => {
                setSelectedClassId(e.target.value);
                setSelectedStudentId(''); // reset student
              }}
              className="text-xs font-black uppercase tracking-widest bg-transparent outline-none cursor-pointer text-gray-800 w-full"
            >
              <option value="">Select Class</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Student Selector pill row */}
          <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-100 flex-1">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest shrink-0">Student</span>
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="text-xs font-black uppercase tracking-widest bg-transparent outline-none cursor-pointer text-gray-800 w-full"
            >
              <option value="">Select Student Workbook</option>
              {students.map(s => {
                const hasCase = cases.some(c => c.studentId === s.id && c.status !== 'CLOSED');
                const matchedC = cases.find(c => c.studentId === s.id && c.status !== 'CLOSED');
                return (
                  <option key={s.id} value={s.id}>
                    {s.name} {hasCase ? `(${matchedC?.tier || 'CICO Active'})` : '(No active CICO program)'}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {/* Week navigator */}
        <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-xl border border-gray-100 self-center">
          <button 
            onClick={() => changeWeek('prev')}
            className="p-1.5 hover:bg-white rounded-lg text-gray-500 hover:text-blue-600 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="text-center px-3 min-w-[160px]">
            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 leading-none">Selected Week</p>
            <p className="text-[11px] font-black text-gray-800 uppercase mt-1 tracking-wider">
              {formatLocalDate(daysOfWeek[0])} - {formatLocalDate(daysOfWeek[4])}
            </p>
          </div>
          <button 
            onClick={() => changeWeek('next')}
            className="p-1.5 hover:bg-white rounded-lg text-gray-500 hover:text-blue-600 transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Conditional rendering for empty or unmatched student workbook */}
      {!selectedStudentId ? (
        <div className="bg-white p-16 rounded-[2.5rem] border border-gray-100 shadow-sm text-center max-w-xl mx-auto space-y-4">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto">
            <FileSpreadsheet size={32} />
          </div>
          <div>
            <h3 className="text-lg font-black uppercase italic tracking-tight text-gray-900">MTSS Behavior Worksheet</h3>
            <p className="text-xs text-gray-500 leading-relaxed mt-2 uppercase font-semibold tracking-wider">
              Pilih kelas dan siswa di atas untuk membuka buku kerja (workbook) pemantauan perilaku Check-In Check-Out (CICO) interaktif.
            </p>
          </div>
        </div>
      ) : loading ? (
        <div className="h-[40vh] flex flex-col items-center justify-center space-y-4 bg-white rounded-[2.5rem] border border-gray-100">
          <Clock className="animate-pulse text-blue-600" size={36} />
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Loading Student Ledger...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          
          {/* LEFT SIDEBAR: Student Profile & CICO Case context */}
          <div className="lg:col-span-1 space-y-6">
            
            {/* Roster & Case Profile card */}
            <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6 space-y-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                <User size={80} />
              </div>
              <div className="space-y-1">
                <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest italic">Student Workbook</span>
                <h3 className="text-lg font-black text-gray-900 tracking-tight leading-tight uppercase italic">{activeStudentObj?.name}</h3>
                <p className="text-xs font-bold text-gray-400 font-mono">NISN: {activeStudentObj?.nisn || '—'}</p>
              </div>

              <div className="border-t border-gray-50 pt-4 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-400 font-bold uppercase tracking-wider text-[10px]">CICO Status</span>
                  {mtssCase ? (
                    <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest">
                      Active
                    </span>
                  ) : (
                    <span className="bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest">
                      Inactive
                    </span>
                  )}
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-400 font-bold uppercase tracking-wider text-[10px]">Support Tier</span>
                  <span className={cn(
                    "px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest",
                    mtssCase?.tier === 'Tier 3' ? 'bg-rose-50 text-rose-700 border border-rose-100' :
                    mtssCase?.tier === 'Tier 2' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                    'bg-gray-50 text-gray-500 border border-gray-100'
                  )}>
                    {mtssCase?.tier || 'No Active Program'}
                  </span>
                </div>

                {mtssCase && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-400 font-bold uppercase tracking-wider text-[10px]">Success Rate Target</span>
                    <span className="font-bold text-gray-700 text-[10px] uppercase font-mono">
                      {mtssCase?.tier2Meeting?.cicoTargetAchievement || 80}%
                    </span>
                  </div>
                )}
              </div>

              {/* Action Button if they don't have CICO initialized */}
              {!mtssCase && (
                <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 text-center space-y-3 mt-4">
                  <p className="text-[10px] text-blue-700 font-bold uppercase tracking-wider leading-relaxed">
                    Siswa ini belum memiliki rencana intervensi perilaku (CICO) yang aktif.
                  </p>
                  <Link
                    to="/junior-high/behavior/mtss/cases"
                    className="inline-flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-[9px] font-black uppercase tracking-widest px-3 py-2 rounded-lg transition-all"
                  >
                    <Plus size={10} /> Aktifkan CICO
                  </Link>
                </div>
              )}
            </div>

            {/* Excel workbook guidelines info box */}
            <div className="bg-[#001033] text-white rounded-[2rem] p-6 space-y-3 shadow-inner">
              <div className="flex items-center gap-2">
                <Info size={16} className="text-blue-300 shrink-0" />
                <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-300">Workbook Guide</h4>
              </div>
              <p className="text-[9px] text-blue-100/75 leading-relaxed uppercase tracking-wider font-semibold">
                Setiap hari kerja, pendidik mengisi lembar kerja Check-In Check-Out (CICO).
              </p>
              <div className="space-y-1.5 pt-2 border-t border-blue-900 text-[9px] font-mono text-blue-100/60">
                <p>• 3 = Memenuhi target mandiri (0-1 pengingat)</p>
                <p>• 2 = Butuh pengingat moderat (2 kali)</p>
                <p>• 1 = Intervensi intensif (3+ pengingat)</p>
                <p>• N/A = Sesi dilewati atau libur</p>
              </div>
            </div>
          </div>

          {/* RIGHT WORKSHEET AREA: Main Daily CICO Grid & Reflections */}
          <div className="lg:col-span-3 space-y-6">
            
            {/* Daily Sheet tabs (Excel sheet tabs-style) */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-100 px-4 pt-3 flex items-end gap-1.5 overflow-x-auto no-scrollbar">
                {daysOfWeek.map((day, idx) => {
                  const dayDateStr = day.toISOString().split('T')[0];
                  const avg = getDayAvgScore(dayDateStr);
                  const pct = getDayPct(dayDateStr);
                  const isActive = activeDayIdx === idx;
                  const label = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'][idx];

                  return (
                    <button
                      key={idx}
                      onClick={() => setActiveDayIdx(idx)}
                      className={cn(
                        "flex flex-col items-start px-5 py-3 rounded-t-xl text-xs font-black uppercase tracking-widest transition-all duration-150 whitespace-nowrap min-w-[110px] border-x border-t relative z-10",
                        isActive 
                          ? "bg-white border-gray-200 text-blue-600 shadow-sm border-b-white translate-y-[1px]"
                          : "bg-gray-100 border-transparent text-gray-400 hover:text-gray-700 hover:bg-gray-50"
                      )}
                    >
                      <span className="text-[9px] tracking-widest opacity-60 font-black">{label}</span>
                      <span className="text-[11px] font-black italic text-gray-800 leading-tight mt-0.5">{formatLocalDate(day)}</span>
                      {avg !== null && (
                        <span className={cn(
                          "mt-1 text-[8px] font-bold font-mono px-1.5 py-0.5 rounded-md",
                          avg === 'Absent' ? 'bg-slate-100 text-slate-500' :
                          Number(avg) >= 2.4 ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                          Number(avg) >= 1.8 ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                          'bg-rose-50 text-rose-700 border border-rose-100'
                        )}>
                          {avg === 'Absent' ? 'ABS' : `${pct ? Math.round(pct) : 0}%`}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Main Worksheet spreadsheet grid */}
              <div className="p-6 space-y-6">
                
                {/* Daily control headers */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                      <Calendar size={18} />
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-widest text-gray-900">
                        {['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'][activeDayIdx]}, {daysOfWeek[activeDayIdx].toLocaleDateString('id-ID', { dateStyle: 'long' })}
                      </h4>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none mt-1">CICO Daily Evaluation Sheet</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 self-stretch sm:self-auto justify-between">
                    {/* Absent Toggle */}
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={dailyForm.isAbsent}
                        onChange={(e) => setDailyForm(prev => ({ ...prev, isAbsent: e.target.checked }))}
                        className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                      />
                      <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Siswa Absen / Libur</span>
                    </label>

                    {/* Today's Avg metrics display */}
                    {!dailyForm.isAbsent && (
                      <div className="text-right">
                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Day Score</p>
                        <p className="text-base font-black italic text-blue-900">
                          {dailyForm.dailyAvgScore.toFixed(2)} <span className="text-[10px] text-gray-400 uppercase tracking-widest font-black font-sans leading-none">/ 3</span>
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {dailyForm.isAbsent ? (
                  <div className="py-16 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                    <HelpCircle className="mx-auto text-gray-300 mb-2" size={32} />
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Siswa ditandai absen atau libur hari ini.</p>
                    <p className="text-[9px] text-gray-400 uppercase mt-1">Isian CICO dinonaktifkan untuk tanggal ini.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-gray-100 rounded-xl">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="px-4 py-3 border-b border-gray-100 text-[10px] font-black uppercase tracking-widest text-gray-500">Session Phase</th>
                          {cicoGoals.map((goal) => (
                            <th key={goal.id} className="px-4 py-3 border-b border-gray-100 text-center text-[10px] font-black uppercase tracking-widest text-gray-900">
                              {goal.label}
                            </th>
                          ))}
                          <th className="px-4 py-3 border-b border-gray-100 text-center text-[10px] font-black uppercase tracking-widest text-gray-500">NA</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {dailyForm.sessions.map((session, sIdx) => {
                          const currentSessionConstant = CICO_SESSIONS.find(cs => cs.id === session.sessionId);
                          return (
                            <tr key={session.sessionId} className={cn("hover:bg-gray-50/50 transition-colors", session.isNA && "opacity-40")}>
                              <td className="px-4 py-4">
                                <div className="flex flex-col">
                                  <span className="text-xs font-black text-gray-900 uppercase italic leading-none">{session.sessionName}</span>
                                  <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                                    {currentSessionConstant?.time || session.timeSlot || '—'}
                                  </span>
                                </div>
                              </td>

                              {cicoGoals.map((goal, gIdx) => {
                                const scoreKey = `goal${gIdx + 1}` as keyof CICOSessionData['scores'];
                                const selectedScore = session.scores[scoreKey];

                                return (
                                  <td key={goal.id} className="px-2 py-3 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                      {[1, 2, 3].map((val) => (
                                        <button
                                          key={val}
                                          disabled={session.isNA}
                                          onClick={() => handleScoreSelect(session.sessionId, scoreKey, val as 1|2|3)}
                                          className={cn(
                                            "w-7 h-7 rounded-lg text-[10px] font-black transition-all flex items-center justify-center border",
                                            selectedScore === val ? (
                                              val === 3 ? "bg-emerald-500 border-emerald-500 text-white shadow-sm shadow-emerald-500/20" :
                                              val === 2 ? "bg-amber-400 border-amber-400 text-white shadow-sm shadow-amber-400/20" :
                                              "bg-rose-500 border-rose-500 text-white shadow-sm shadow-rose-500/20"
                                            ) : "bg-white border-gray-200 text-gray-300 hover:text-gray-500 hover:bg-gray-50"
                                          )}
                                        >
                                          {val}
                                        </button>
                                      ))}
                                    </div>
                                  </td>
                                );
                              })}

                              <td className="px-4 py-3 text-center">
                                <button
                                  onClick={() => handleToggleNA(session.sessionId)}
                                  className={cn(
                                    "px-2 py-1 rounded text-[8px] font-black uppercase tracking-widest border transition-all",
                                    session.isNA 
                                      ? "bg-slate-700 text-white border-slate-700" 
                                      : "bg-white text-gray-400 border-gray-200 hover:text-gray-600 hover:bg-gray-50"
                                  )}
                                >
                                  N/A
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Additional notes & Save row */}
                {!dailyForm.isAbsent && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Catatan Umum Harian</label>
                      <textarea
                        rows={2}
                        value={dailyForm.dailyNote || ''}
                        onChange={(e) => setDailyForm(prev => ({ ...prev, dailyNote: e.target.value }))}
                        placeholder="Masukkan catatan evaluasi umum untuk hari ini..."
                        className="w-full text-xs p-3 border border-gray-200 rounded-xl outline-none focus:border-blue-300 resize-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={dailyForm.hasSpecialIncident}
                          onChange={(e) => setDailyForm(prev => ({ ...prev, hasSpecialIncident: e.target.checked }))}
                          className="rounded text-red-600 focus:ring-red-500 w-4 h-4"
                        />
                        <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest">Lapor Insiden Khusus Hari Ini?</span>
                      </label>

                      {dailyForm.hasSpecialIncident && (
                        <textarea
                          rows={2}
                          value={dailyForm.incidentNote || ''}
                          onChange={(e) => setDailyForm(prev => ({ ...prev, incidentNote: e.target.value }))}
                          placeholder="Jelaskan insiden khusus, respon guru, dan tindakan pencegahannya..."
                          className="w-full text-xs p-3 border border-rose-100 bg-rose-50/10 rounded-xl outline-none focus:border-rose-300 resize-none text-rose-800 placeholder:text-rose-200"
                        />
                      )}
                    </div>
                  </div>
                )}

                {/* Save Daily buttons */}
                <div className="flex justify-end pt-2">
                  <button
                    disabled={savingDaily}
                    onClick={handleSaveDailyReport}
                    className="flex items-center gap-2 bg-[#002366] hover:bg-blue-800 text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50 shadow-sm"
                  >
                    <Save size={14} />
                    {savingDaily ? "Menyimpan..." : "Simpan Daily Sheet"}
                  </button>
                </div>

              </div>
            </div>

            {/* 2. CICO WEEKLY REFLECTION & CONTEXT (Workbook style) */}
            {mtssCase && (
              <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6 space-y-6">
                <div className="flex items-center gap-3 pb-3 border-b border-gray-50">
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                    <BookOpen size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase italic tracking-tight text-gray-900">
                      Weekly Reflection Worksheet
                    </h3>
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-0.5 leading-none">
                      Workbook monitoring & refleksi guru-murid periode {mondayStr}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                      1. Hal Positif Murid (What went well?)
                    </label>
                    <textarea
                      rows={3}
                      value={reflectionForm.studentPositives}
                      onChange={(e) => setReflectionForm(prev => ({ ...prev, studentPositives: e.target.value }))}
                      placeholder="Jelaskan kemajuan positif yang ditunjukkan murid minggu ini..."
                      className="w-full text-xs p-3 border border-gray-200 rounded-xl outline-none focus:border-blue-300 resize-none leading-relaxed"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                      2. Rencana Tindak Lanjut Murid (Next Week Focus)
                    </label>
                    <textarea
                      rows={3}
                      value={reflectionForm.studentPlans}
                      onChange={(e) => setReflectionForm(prev => ({ ...prev, studentPlans: e.target.value }))}
                      placeholder="Apa fokus perbaikan atau target utama murid minggu depan?"
                      className="w-full text-xs p-3 border border-gray-200 rounded-xl outline-none focus:border-blue-300 resize-none leading-relaxed"
                    />
                  </div>

                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                      3. Catatan & Evaluasi Wali Kelas / Mentor
                    </label>
                    <textarea
                      rows={3}
                      value={reflectionForm.teacherNotes}
                      onChange={(e) => setReflectionForm(prev => ({ ...prev, teacherNotes: e.target.value }))}
                      placeholder="Rekomendasi tambahan dari mentor perilaku / wali kelas untuk koordinasi..."
                      className="w-full text-xs p-3 border border-gray-200 rounded-xl outline-none focus:border-blue-300 resize-none leading-relaxed"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    disabled={savingReflection}
                    onClick={handleSaveReflection}
                    className="flex items-center gap-2 bg-gray-900 hover:bg-black text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50"
                  >
                    <Save size={14} />
                    {savingReflection ? "Menyimpan..." : "Simpan Refleksi Mingguan"}
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
