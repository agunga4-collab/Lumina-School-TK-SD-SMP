import * as React from 'react';
import { 
  AlertTriangle, CheckCircle2, Clock, ChevronRight, Loader2, 
  Calendar, ArrowRight, BookOpen, AlertCircle, Sparkles, Check,
  Smile, Camera, History, FileText, LayoutGrid, ChevronDown, RefreshCw, X
} from 'lucide-react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { isTeacherAssignedToClass } from '../../services/classTeacherAssignmentService';
import { cn } from '../../lib/utils';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { useAuth } from '../../context/AuthContext';
import { useTeacherAssignedClasses } from '../../hooks/useTeacherAssignedClasses';
import { 
  getKindergartenClasses, 
  getKindergartenStudents, 
  logFirestoreRead 
} from '../../lib/kindergartenMetadataCache';
import { getMonday, formatDateToKey } from '../../lib/kindergartenWeeklyReport';
import { toast } from 'sonner';

// Reusable exact student-in-class matcher matching all existing Kindergarten logic
const isStudentInClass = (studClassId: string, activeClass: { id: string; name: string }) => {
  const sClass = (studClassId || '').trim().toLowerCase();
  const actId = (activeClass.id || '').trim().toLowerCase();
  const actName = (activeClass.name || '').trim().toLowerCase();
  
  if (!sClass) return false;
  if (sClass === actId || sClass === actName) return true;
  
  const norm = (str: string) => str.replace(/[\s\-_]+/g, '').toLowerCase();
  const normS = norm(sClass);
  const normId = norm(actId);
  const normName = norm(actName);
  
  if (normS === normName || normS === normId) return true;
  
  const hasKoala = (str: string) => str.includes('koala');
  const hasPanda = (str: string) => str.includes('panda');
  const hasCaterpillar = (str: string) => str.includes('caterpillar');
  const hasButterfly = (str: string) => str.includes('butterfly');
  const hasCenderawasih = (str: string) => str.includes('cenderawasih');
  const hasElang = (str: string) => str.includes('elang');
  const hasKakatua = (str: string) => str.includes('kakatua');
  const hasBadak = (str: string) => str.includes('badak');
  const hasKomodo = (str: string) => str.includes('komodo');
  const hasTapir = (str: string) => str.includes('tapir');
  
  if (hasKoala(normS) && hasKoala(normName)) return true;
  if (hasPanda(normS) && hasPanda(normName)) return true;
  if (hasCaterpillar(normS) && hasCaterpillar(normName)) return true;
  if (hasButterfly(normS) && hasButterfly(normName)) return true;
  if (hasCenderawasih(normS) && hasCenderawasih(normName)) return true;
  if (hasElang(normS) && hasElang(normName)) return true;
  if (hasKakatua(normS) && hasKakatua(normName)) return true;
  if (hasBadak(normS) && hasBadak(normName)) return true;
  if (hasKomodo(normS) && hasKomodo(normName)) return true;
  if (hasTapir(normS) && hasTapir(normName)) return true;

  const specificClassWords = [
    'koala', 'panda', 'caterpillar', 'butterfly',
    'cenderawasih', 'elang', 'kakatua', 'badak', 'komodo', 'tapir'
  ];
  const hasSpecS = specificClassWords.some(w => normS.includes(w));
  const hasSpecAct = specificClassWords.some(w => normId.includes(w) || normName.includes(w));
  
  if (hasSpecAct && !hasSpecS) {
    return false;
  }
  
  if (normId.includes(normS) || normS.includes(normId)) return true;
  
  return false;
};

// Activity lists to display proper labels
const ACTIVITY_LABEL_MAP: Record<string, string> = {
  ART_EXPLORATIONS: 'Art Explorations',
  MAKE_BELIEVE: 'Make-Believe',
  DISCOVERY: 'Discovery',
  LIBRARY_LITERACY: 'Library & Literacy',
  BLOCKS_BUILDING: 'Blocks & Building',
  ENGLISH: 'English',
  MUSIC: 'Music',
  OUTSIDE: 'Outside',
  AUDIO_VISUAL: 'Audio Visual',
  SPECIAL_PROGRAM: 'Special Program',
  MORNING_MOVEMENT: 'Morning Movement',
  ISLAMIC_AWARENESS: 'Islamic Awareness'
};

// Domain lists to display proper labels
const DOMAIN_LABEL_MAP: Record<string, string> = {
  SOSIAL_EMOSIONAL: 'Sosial-Emosional',
  AGAMA_BUDI_PEKERTI: 'Nilai Agama & Budi Pekerti',
  BAHASA: 'Bahasa',
  KOGNITIF: 'Kognitif',
  FISIK_MOTORIK: 'Fisik-Motorik',
  SENI: 'Seni'
};

interface TaskItem {
  id: string;
  type: 'attendance_today' | 'attendance_late' | 'observation' | 'weekly_summary' | 'weekly_report';
  title: string;
  issue: string;
  dateStr: string;
  metadata?: any;
}

export default function TeacherDashboard() {
  const navigate = useNavigate();
  const { activeYear } = useAcademicYear();
  const { currentUser } = useOutletContext<{ currentUser: any }>() || {};
  const { profile } = useAuth();

  // Class assignment lists using useTeacherAssignedClasses
  const {
    assignedClasses: classes,
    assignedClassIds,
    primaryClassId,
    isRestrictedToAssignedClasses,
    loading: isLoadingClasses,
    setLastSelectedClassId
  } = useTeacherAssignedClasses({
    userId: profile?.uid || currentUser?.uid,
    academicYearId: activeYear || '2026/2027'
  });

  const [selectedClassId, setSelectedClassId] = React.useState<string>('');
  const [allStudents, setAllStudents] = React.useState<any[]>([]);
  const [schoolHolidays, setSchoolHolidays] = React.useState<string[]>([]);

  // Loading and refreshing states
  const [loadingInitial, setLoadingInitial] = React.useState(true);
  const [loadingTasks, setLoadingTasks] = React.useState(false);
  const [refreshCounter, setRefreshCounter] = React.useState(0);

  // Computed class students
  const activeClassObj = React.useMemo(() => {
    return classes.find(c => c.id === selectedClassId);
  }, [classes, selectedClassId]);

  const classStudents = React.useMemo(() => {
    if (!selectedClassId || !activeClassObj) return [];
    return allStudents.filter(s => isStudentInClass(s.classId, activeClassObj));
  }, [allStudents, selectedClassId, activeClassObj]);

  // Task lists state
  const [attendanceTasks, setAttendanceTasks] = React.useState<TaskItem[]>([]);
  const [observationStatus, setObservationStatus] = React.useState<{
    sessionsCount: number;
    incompleteSessions: TaskItem[];
  }>({ sessionsCount: 0, incompleteSessions: [] });
  const [weeklySummaryStatus, setWeeklySummaryStatus] = React.useState<{
    hasDrafts: boolean;
    incompleteCount: number;
    totalCount: number;
    task: TaskItem | null;
  }>({ hasDrafts: false, incompleteCount: 0, totalCount: 0, task: null });
  const [weeklyReportStatus, setWeeklyReportStatus] = React.useState<{
    hasReports: boolean;
    incompleteStudents: string[];
    task: TaskItem | null;
  }>({ hasReports: false, incompleteStudents: [], task: null });

  // Exclude weekend / holiday helper
  const isWeekendOrHoliday = React.useCallback((dateStr: string, holidays: string[]) => {
    const d = new Date(dateStr);
    const day = d.getDay();
    if (day === 0 || day === 6) return true;
    return holidays.includes(dateStr);
  }, []);

  // Fetch school holidays
  React.useEffect(() => {
    async function loadHolidays() {
      try {
        const holidaySnap = await getDocs(collection(db, 'school_holidays'));
        const list = holidaySnap.docs.map(docSnap => {
          const data = docSnap.data();
          return data.date || docSnap.id;
        }).filter((d): d is string => typeof d === 'string' && d !== '');
        setSchoolHolidays(list);
      } catch (err) {
        console.warn('Failed to load school_holidays:', err);
        setSchoolHolidays([]);
      }
    }
    loadHolidays();
  }, []);

  // Set default selection and handle URL/storage redirection rules
  React.useEffect(() => {
    if (!isLoadingClasses && classes.length > 0) {
      const defaultClassId = primaryClassId;
      if (defaultClassId) {
        setSelectedClassId(defaultClassId);
      }
    }
  }, [classes, assignedClassIds, primaryClassId, isLoadingClasses]);

  // Real-time access check
  React.useEffect(() => {
    if (!isLoadingClasses && isRestrictedToAssignedClasses && selectedClassId) {
      if (assignedClassIds.length > 0 && !assignedClassIds.includes(selectedClassId)) {
        toast.error('Anda tidak memiliki hak akses untuk kelas ini. Mengembalikan ke kelas penugasan Anda.');
        setSelectedClassId(primaryClassId || '');
      }
    }
  }, [selectedClassId, isRestrictedToAssignedClasses, assignedClassIds, primaryClassId, isLoadingClasses]);

  // Fetch students initially
  React.useEffect(() => {
    async function loadInitialData() {
      if (!activeYear) return;
      setLoadingInitial(true);
      try {
        // Fetch Kindergarten students
        const fetchedStudents = await getKindergartenStudents(activeYear);
        setAllStudents(fetchedStudents);
      } catch (err) {
        console.error('Error loading initial teacher dashboard data:', err);
        toast.error('Gagal memuat data siswa.');
      } finally {
        setLoadingInitial(false);
      }
    }

    loadInitialData();
  }, [activeYear]);

  // Aggregate Tasks for selected class
  React.useEffect(() => {
    if (!selectedClassId || classStudents.length === 0) {
      setAttendanceTasks([]);
      setObservationStatus({ sessionsCount: 0, incompleteSessions: [] });
      setWeeklySummaryStatus({ hasDrafts: false, incompleteCount: 0, totalCount: 0, task: null });
      setWeeklyReportStatus({ hasReports: false, incompleteStudents: [], task: null });
      return;
    }

    async function evaluateTasks() {
      setLoadingTasks(true);
      try {
        const today = new Date();
        const todayStr = formatDateToKey(today);
        const isTodaySchoolDay = !isWeekendOrHoliday(todayStr, schoolHolidays);

        // Calculate previous school day
        let prevD = new Date(today);
        let prevDateStr = '';
        let loopSafety = 0;
        while (loopSafety < 15) {
          prevD.setDate(prevD.getDate() - 1);
          const tempStr = formatDateToKey(prevD);
          if (!isWeekendOrHoliday(tempStr, schoolHolidays)) {
            prevDateStr = tempStr;
            break;
          }
          loopSafety++;
        }

        const tasks: TaskItem[] = [];

        // ----------------------------------------------------
        // 1. ATTENDANCE & EMOTIONAL CHECKLIST EVALUATION
        // ----------------------------------------------------
        const attendanceQueries = [];
        if (isTodaySchoolDay) {
          attendanceQueries.push(getDoc(doc(db, 'attendance', `${selectedClassId}_${todayStr}`)));
        }
        if (prevDateStr) {
          attendanceQueries.push(getDoc(doc(db, 'attendance', `${selectedClassId}_${prevDateStr}`)));
        }

        const attendanceSnaps = await Promise.all(attendanceQueries);
        logFirestoreRead('attendanceReports', attendanceSnaps.length);

        let snapIdx = 0;
        if (isTodaySchoolDay) {
          const todaySnap = attendanceSnaps[snapIdx++];
          let incompleteCount = classStudents.length;
          if (todaySnap && todaySnap.exists()) {
            const list = todaySnap.data().students || [];
            const completedCount = classStudents.filter(student => {
              const matched = list.find((s: any) => s.studentId === student.id);
              return matched && matched.status;
            }).length;
            incompleteCount = classStudents.length - completedCount;
          }
          if (incompleteCount > 0) {
            tasks.push({
              id: `att_today_${selectedClassId}_${todayStr}`,
              type: 'attendance_today',
              title: 'Checklist Kehadiran & Emosi (Hari Ini)',
              issue: `${incompleteCount} dari ${classStudents.length} siswa belum di-checklist`,
              dateStr: todayStr,
              metadata: { classId: selectedClassId, date: todayStr }
            });
          }
        }

        if (prevDateStr) {
          const prevSnap = attendanceSnaps[snapIdx];
          let incompleteCount = classStudents.length;
          if (prevSnap && prevSnap.exists()) {
            const list = prevSnap.data().students || [];
            const completedCount = classStudents.filter(student => {
              const matched = list.find((s: any) => s.studentId === student.id);
              return matched && matched.status;
            }).length;
            incompleteCount = classStudents.length - completedCount;
          }
          if (incompleteCount > 0) {
            tasks.push({
              id: `att_late_${selectedClassId}_${prevDateStr}`,
              type: 'attendance_late',
              title: 'Checklist Kehadiran & Emosi (Data Tertinggal)',
              issue: `${incompleteCount} dari ${classStudents.length} siswa belum di-checklist`,
              dateStr: prevDateStr,
              metadata: { classId: selectedClassId, date: prevDateStr }
            });
          }
        }

        setAttendanceTasks(tasks);

        // ----------------------------------------------------
        // 2. OBSERVATION DATA EVALUATION
        // ----------------------------------------------------
        const obsQuery = query(
          collection(db, 'observations'),
          where('date', '==', todayStr)
        );
        const obsSnap = await getDocs(obsQuery);
        logFirestoreRead('observations', obsSnap.docs.length || 1);

        const todayObservations = obsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const incompleteObsSessions: TaskItem[] = [];

        todayObservations.forEach((sessionDoc: any) => {
          const detailsMap = sessionDoc.observations || {};
          const uncompletedStudents = classStudents.filter(student => {
            const detailObj = detailsMap[student.id];
            return !detailObj || !detailObj.grading;
          });

          if (uncompletedStudents.length > 0) {
            incompleteObsSessions.push({
              id: `obs_${sessionDoc.id}`,
              type: 'observation',
              title: `Observasi: ${ACTIVITY_LABEL_MAP[sessionDoc.activity] || sessionDoc.activity} — ${DOMAIN_LABEL_MAP[sessionDoc.domain] || sessionDoc.domain}`,
              issue: `${uncompletedStudents.length} dari ${classStudents.length} siswa belum memiliki grading`,
              dateStr: todayStr,
              metadata: { 
                classId: selectedClassId, 
                date: todayStr, 
                activity: sessionDoc.activity, 
                domain: sessionDoc.domain 
              }
            });
          }
        });

        setObservationStatus({
          sessionsCount: todayObservations.length,
          incompleteSessions: incompleteObsSessions
        });

        // ----------------------------------------------------
        // 3. WEEKLY SUMMARY & AI EVALUATION
        // ----------------------------------------------------
        const mon = getMonday(today);
        const fri = new Date(mon);
        fri.setDate(mon.getDate() + 4);
        const monStr = formatDateToKey(mon);
        const friStr = formatDateToKey(fri);

        const summaryQuery = query(
          collection(db, 'weekly_summary_drafts'),
          where('startDate', '==', monStr)
        );
        const summarySnap = await getDocs(summaryQuery);
        logFirestoreRead('observations', summarySnap.docs.length || 1);

        const draftsList = summarySnap.docs.map(d => d.data());
        const classDrafts = draftsList.filter(d => d.classId === selectedClassId);

        const incompleteSummaryStudents = classStudents.filter(student => {
          const matchedDraft = classDrafts.find(d => d.studentId === student.id);
          return !matchedDraft || (!matchedDraft.weeklyComments && !matchedDraft.socialEmotional);
        });

        let summaryTask: TaskItem | null = null;
        if (incompleteSummaryStudents.length > 0) {
          summaryTask = {
            id: `summary_${selectedClassId}_${monStr}`,
            type: 'weekly_summary',
            title: 'Komentar Mingguan (Weekly Summary)',
            issue: `${incompleteSummaryStudents.length} dari ${classStudents.length} siswa belum memiliki komentar mingguan`,
            dateStr: `${monStr} - ${friStr}`,
            metadata: { classId: selectedClassId, date: todayStr }
          };
        }

        setWeeklySummaryStatus({
          hasDrafts: classDrafts.length > 0,
          incompleteCount: incompleteSummaryStudents.length,
          totalCount: classStudents.length,
          task: summaryTask
        });

        // ----------------------------------------------------
        // 4. WEEKLY REPORT (FINAL) EVALUATION
        // ----------------------------------------------------
        const reportQuery = query(
          collection(db, 'published_kg_reports'),
          where('academicYear', '==', activeYear),
          where('startDate', '==', monStr)
        );
        const reportSnap = await getDocs(reportQuery);
        logFirestoreRead('observations', reportSnap.docs.length || 1);

        const reportsList = reportSnap.docs.map(d => d.data());
        const classReports = reportsList.filter(r => r.classId === selectedClassId);

        const incompleteReportStudents = classStudents.filter(student => {
          return !classReports.some(r => r.studentId === student.id);
        });

        let reportTask: TaskItem | null = null;
        if (incompleteReportStudents.length > 0) {
          reportTask = {
            id: `report_${selectedClassId}_${monStr}`,
            type: 'weekly_report',
            title: 'Kunci Laporan Mingguan (Weekly Report)',
            issue: `${incompleteReportStudents.length} dari ${classStudents.length} siswa belum dikunci / publish`,
            dateStr: `${monStr} - ${friStr}`,
            metadata: { classId: selectedClassId, date: todayStr }
          };
        }

        setWeeklyReportStatus({
          hasReports: classReports.length > 0,
          incompleteStudents: incompleteReportStudents.map(s => s.name),
          task: reportTask
        });

      } catch (err) {
        console.error('Error calculating dashboard tasks:', err);
      } finally {
        setLoadingTasks(false);
      }
    }

    evaluateTasks();
  }, [selectedClassId, classStudents, schoolHolidays, refreshCounter]);

  const handleRefresh = () => {
    setRefreshCounter(prev => prev + 1);
    toast.success('Data diperbarui dari sistem! 🔄');
  };

  const handleAction = (task: TaskItem) => {
    const meta = task.metadata || {};
    switch (task.type) {
      case 'attendance_today':
      case 'attendance_late':
        navigate(`/kindy/checklist?classId=${meta.classId}&date=${meta.date}`);
        break;
      case 'observation':
        navigate(`/kindy/observation?classId=${meta.classId}&date=${meta.date}&activity=${meta.activity}&domain=${meta.domain}`);
        break;
      case 'weekly_summary':
        navigate(`/kindy/weekly-summary?classId=${meta.classId}&date=${meta.date}`);
        break;
      case 'weekly_report':
        navigate(`/kindy/weekly-review?classId=${meta.classId}&date=${meta.date}`);
        break;
    }
  };

  if (loadingInitial) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        <p className="text-sm font-medium text-gray-500">Memuat dashboard...</p>
      </div>
    );
  }

  if (classes.length === 0) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="max-w-4xl mx-auto my-12 p-12 bg-white border border-gray-150 rounded-3xl shadow-sm text-center">
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="p-4 bg-amber-50 text-amber-600 rounded-full">
              <AlertCircle size={36} />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Belum Ada Kelas Ditugaskan</h2>
            <p className="text-gray-600 max-w-md">
              Belum ada kelas aktif yang ditugaskan kepada Anda pada Tahun Ajaran {activeYear || '2026/2027'}. Hubungi Kepala Unit atau admin untuk memperbarui assignment kelas.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" id="teacher-dashboard-container">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <LayoutGrid size={18} />
            </div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">Dashboard Guru Kelas</h1>
          </div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Lumina Kindergarten</p>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={handleRefresh}
            className="p-2.5 bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 rounded-xl transition duration-150 ease-in-out shadow-sm flex items-center gap-2 text-xs font-bold uppercase tracking-wider"
            title="Muat Ulang"
          >
            <RefreshCw size={14} className={cn("text-gray-400", loadingTasks && "animate-spin")} />
            Aktualkan
          </button>

          {classes.length > 1 && (
            <div className="relative shrink-0">
              <select
                value={selectedClassId}
                onChange={(e) => {
                  setSelectedClassId(e.target.value);
                  setLastSelectedClassId(e.target.value);
                }}
                disabled={isRestrictedToAssignedClasses && classes.length <= 1}
                className="appearance-none pl-4 pr-10 py-2.5 bg-white text-sm font-semibold text-gray-800 border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-500 transition shadow-sm cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
              >
                {classes.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.homeroomTeacherName ? `(${c.homeroomTeacherName})` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
            </div>
          )}

          {classes.length === 1 && (
            <div className="px-4 py-2 bg-emerald-50 border border-emerald-100 rounded-xl text-xs font-bold text-emerald-800 tracking-wide uppercase">
              Kelas: {classes[0].name}
            </div>
          )}
        </div>
      </div>

      {/* COMPILATION OF TASK ACTIONS: TABLE / LIST FORMAT */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
          <div className="space-y-0.5">
            <h2 className="text-sm font-bold text-gray-900 tracking-tight">Tugas Perlu Ditindaklanjuti</h2>
            <p className="text-xs text-gray-400">Daftar aksi yang memerlukan perhatian segera berdasarkan data real-time kelas.</p>
          </div>
          {loadingTasks && (
            <span className="flex items-center gap-2 text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin" />
              Memproses data...
            </span>
          )}
        </div>

        {/* TASK EVALUATION TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-wider bg-gray-50/30">
                <th className="py-4.5 px-6 font-semibold">Tugas / Sesi</th>
                <th className="py-4.5 px-6 font-semibold">Masalah (Issue)</th>
                <th className="py-4.5 px-6 font-semibold">Periode / Tanggal</th>
                <th className="py-4.5 px-6 font-semibold text-right">Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {/* GROUP 1: ATTENDANCE */}
              {attendanceTasks.map((task) => (
                <tr key={task.id} className="hover:bg-gray-50/50 transition">
                  <td className="py-4 px-6 font-medium text-gray-900 flex items-center gap-3">
                    <span className="p-2 bg-blue-50 text-blue-600 rounded-lg shrink-0">
                      <Smile size={16} />
                    </span>
                    <div>
                      <p className="font-bold text-gray-800 leading-none">{task.title}</p>
                      <p className="text-xs text-gray-400 mt-1">Attendance & Emotional Checklist</p>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-gray-600 font-semibold text-xs">
                    <span className="inline-flex items-center gap-1.5 text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full font-bold">
                      <AlertTriangle size={12} className="shrink-0" />
                      {task.issue}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-gray-500 font-medium text-xs">
                    {new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(task.dateStr))}
                  </td>
                  <td className="py-4 px-6 text-right">
                    <button
                      onClick={() => handleAction(task)}
                      className="inline-flex items-center gap-1 text-xs font-extrabold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-xl transition uppercase tracking-wide"
                    >
                      Checklist
                      <ChevronRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}

              {/* GROUP 2: OBSERVATIONS */}
              {observationStatus.incompleteSessions.map((task) => (
                <tr key={task.id} className="hover:bg-gray-50/50 transition">
                  <td className="py-4 px-6 font-medium text-gray-900 flex items-center gap-3">
                    <span className="p-2 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
                      <Camera size={16} />
                    </span>
                    <div>
                      <p className="font-bold text-gray-800 leading-none">{task.title}</p>
                      <p className="text-xs text-gray-400 mt-1">Observation Data</p>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-gray-600 font-semibold text-xs">
                    <span className="inline-flex items-center gap-1.5 text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full font-bold">
                      <AlertTriangle size={12} className="shrink-0" />
                      {task.issue}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-gray-500 font-medium text-xs">
                    {new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(task.dateStr))}
                  </td>
                  <td className="py-4 px-6 text-right">
                    <button
                      onClick={() => handleAction(task)}
                      className="inline-flex items-center gap-1 text-xs font-extrabold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-2 rounded-xl transition uppercase tracking-wide"
                    >
                      Lengkapi
                      <ChevronRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}

              {/* GROUP 3: WEEKLY SUMMARY */}
              {weeklySummaryStatus.task && (
                <tr className="hover:bg-gray-50/50 transition">
                  <td className="py-4 px-6 font-medium text-gray-900 flex items-center gap-3">
                    <span className="p-2 bg-teal-50 text-teal-600 rounded-lg shrink-0">
                      <Sparkles size={16} />
                    </span>
                    <div>
                      <p className="font-bold text-gray-800 leading-none">{weeklySummaryStatus.task.title}</p>
                      <p className="text-xs text-gray-400 mt-1">Weekly Summary & AI</p>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-gray-600 font-semibold text-xs">
                    <span className="inline-flex items-center gap-1.5 text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full font-bold">
                      <AlertTriangle size={12} className="shrink-0" />
                      {weeklySummaryStatus.task.issue}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-gray-500 font-medium text-xs">
                    {weeklySummaryStatus.task.dateStr}
                  </td>
                  <td className="py-4 px-6 text-right">
                    <button
                      onClick={() => handleAction(weeklySummaryStatus.task!)}
                      className="inline-flex items-center gap-1 text-xs font-extrabold text-teal-600 hover:text-teal-800 bg-teal-50 hover:bg-teal-100 px-3 py-2 rounded-xl transition uppercase tracking-wide"
                    >
                      Isi Summary
                      <ChevronRight size={14} />
                    </button>
                  </td>
                </tr>
              )}

              {/* GROUP 4: WEEKLY REPORT */}
              {weeklyReportStatus.task && (
                <tr className="hover:bg-gray-50/50 transition">
                  <td className="py-4 px-6 font-medium text-gray-900 flex items-center gap-3">
                    <span className="p-2 bg-purple-50 text-purple-600 rounded-lg shrink-0">
                      <History size={16} />
                    </span>
                    <div>
                      <p className="font-bold text-gray-800 leading-none">{weeklyReportStatus.task.title}</p>
                      <p className="text-xs text-gray-400 mt-1">Weekly Report (Final)</p>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-gray-600 font-semibold text-xs">
                    <span className="inline-flex items-center gap-1.5 text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full font-bold">
                      <AlertTriangle size={12} className="shrink-0" />
                      {weeklyReportStatus.task.issue}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-gray-500 font-medium text-xs">
                    {weeklyReportStatus.task.dateStr}
                  </td>
                  <td className="py-4 px-6 text-right">
                    <button
                      onClick={() => handleAction(weeklyReportStatus.task!)}
                      className="inline-flex items-center gap-1 text-xs font-extrabold text-purple-600 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 px-3 py-2 rounded-xl transition uppercase tracking-wide"
                    >
                      Kunci & Publish
                      <ChevronRight size={14} />
                    </button>
                  </td>
                </tr>
              )}

              {/* FALLBACK IF ABSOLUTELY EVERYTHING IS 100% COMPLETE */}
              {!loadingTasks && attendanceTasks.length === 0 && observationStatus.incompleteSessions.length === 0 && !weeklySummaryStatus.task && !weeklyReportStatus.task && (
                <tr>
                  <td colSpan={4} className="py-12 px-6 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <CheckCircle2 size={24} />
                      </div>
                      <p className="text-sm font-extrabold text-gray-800">Semua Beres! Tidak ada tugas tertinggal.</p>
                      <p className="text-xs text-gray-400">Seluruh agenda harian, observasi, dan pelaporan mingguan kelas Anda telah diselesaikan.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADDITIONAL SUMMARY / METRICS LIST SECTION */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* OBSERVATION SESSIONS COMPACT RECAP */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-800 tracking-tight flex items-center gap-2">
              <Camera size={16} className="text-indigo-600" />
              Sesi Observasi Hari Ini
            </h3>
            <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full font-black uppercase tracking-wider">
              {observationStatus.sessionsCount} Sesi Dibuat
            </span>
          </div>

          {observationStatus.sessionsCount === 0 ? (
            <div className="p-5 bg-gray-50 rounded-xl text-center border border-dashed border-gray-100">
              <p className="text-xs text-gray-500 font-semibold">Belum Ada Sesi Hari Ini</p>
              <p className="text-[10px] text-gray-400 mt-1">Guru belum membuat sesi observasi harian untuk tanggal hari ini.</p>
            </div>
          ) : observationStatus.incompleteSessions.length === 0 ? (
            <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl flex items-center gap-3">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <p className="text-xs text-emerald-800 font-bold">Seluruh Sesi Hari Ini Lengkap</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] text-red-650 bg-red-50/50 border border-red-100 px-3 py-2 rounded-lg font-bold">
                Terdapat beberapa sesi observasi hari ini yang nilainya belum lengkap diisi.
              </p>
              <div className="divide-y divide-gray-100 max-h-[160px] overflow-y-auto">
                {observationStatus.incompleteSessions.map(session => (
                  <div key={session.id} className="py-2 flex justify-between items-center text-xs">
                    <span className="font-bold text-gray-700 truncate max-w-[240px]">{session.title}</span>
                    <span className="text-[10px] text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded-md shrink-0">{session.issue}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* WEEKLY PELAPORAN COMPACT RECAP */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-800 tracking-tight flex items-center gap-2">
              <History size={16} className="text-purple-600" />
              Progress Laporan Mingguan
            </h3>
            <span className="text-[10px] bg-purple-50 text-purple-700 px-2.5 py-1 rounded-full font-black uppercase tracking-wider">
              Minggu Aktif
            </span>
          </div>

          <div className="space-y-3">
            {/* Weekly Summary Status */}
            <div className="flex justify-between items-center border-b border-gray-100 pb-2.5 text-xs">
              <span className="text-gray-500 font-semibold">Weekly Summary & AI:</span>
              {!weeklySummaryStatus.hasDrafts ? (
                <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                  Belum ada draf minggu ini
                </span>
              ) : weeklySummaryStatus.incompleteCount === 0 ? (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full flex items-center gap-1">
                  <Check size={10} strokeWidth={3} />
                  Seluruh Sesi Mingguan Lengkap
                </span>
              ) : (
                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
                  {weeklySummaryStatus.incompleteCount} anak belum diisi
                </span>
              )}
            </div>

            {/* Weekly Report Locked Status */}
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-500 font-semibold">Status Kunci (Lock):</span>
              {!weeklyReportStatus.hasReports ? (
                <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                  Belum diproses minggu ini
                </span>
              ) : weeklyReportStatus.incompleteStudents.length === 0 ? (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full flex items-center gap-1">
                  <Check size={10} strokeWidth={3} />
                  Seluruh Siswa Di-lock / Final
                </span>
              ) : (
                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
                  {weeklyReportStatus.incompleteStudents.length} anak belum di-lock
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
