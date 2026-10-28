import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, Calendar, Users, RefreshCw, AlertCircle, Info, CheckCircle2, 
  ChevronRight, ChevronLeft, ArrowRight, Printer, Sparkles, MessageSquare, 
  BookOpen, CheckCircle, HelpCircle, ShieldAlert, Layers, Search, Download
} from 'lucide-react';
import { db, getClasses, getActiveStudents } from '../../lib/firebase';
import { doc, getDoc, getDocs, query, collection, where } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useJHReportAttendance } from '../../hooks/useJHReportAttendance';
import type { Class, Student, ClassReportSummary, JuniorHighMonthlyReportComment } from '../../types';
import { JuniorHighMonthlyReportDocument } from '../../components/JuniorHigh/JuniorHighMonthlyReportDocument';
import { validateReportReadiness } from './MonthlyReportReadinessHelper';

const indonesianMonths = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

function getIndonesianMonthLabel(periodKey: string): string {
  if (!periodKey || !periodKey.includes('-')) return '';
  const [year, month] = periodKey.split('-');
  const monthIdx = parseInt(month, 10) - 1;
  if (monthIdx >= 0 && monthIdx < 12) {
    return `${indonesianMonths[monthIdx]} ${year}`;
  }
  return periodKey;
}

export default function MonthlyReportPreviewPage() {
  const { profile } = useAuth();
  const { activeYear, activeSemester } = useAcademicYear();
  const navigate = useNavigate();

  // Selected parameters
  const [selectedYear, setSelectedYear] = React.useState<string>('2026/2027');
  const [selectedSemester, setSelectedSemester] = React.useState<string>('1');
  const [selectedMonth, setSelectedMonth] = React.useState<string>('');
  const [selectedClassId, setSelectedClassId] = React.useState<string>('');

  // Dropdowns & master data
  const [classesList, setClassesList] = React.useState<Class[]>([]);
  const [loadingClasses, setLoadingClasses] = React.useState<boolean>(false);
  const [students, setStudents] = React.useState<Student[]>([]);
  const [loadingStudents, setLoadingStudents] = React.useState<boolean>(false);
  const [selectedStudentIndex, setSelectedStudentIndex] = React.useState<number>(0);
  const [studentSearchQuery, setStudentSearchQuery] = React.useState<string>('');

  // Read-only data
  const [classSummary, setClassSummary] = React.useState<ClassReportSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = React.useState<boolean>(false);
  const [commentsMap, setCommentsMap] = React.useState<Record<string, JuniorHighMonthlyReportComment>>({});
  const [loadingComments, setLoadingComments] = React.useState<boolean>(false);

  // Dynamic UA States
  const [unitActivityEnrollments, setUnitActivityEnrollments] = React.useState<any[]>([]);
  const [semesterSummariesMap, setSemesterSummariesMap] = React.useState<Record<string, string>>({});
  const [loadingUaData, setLoadingUaData] = React.useState<boolean>(false);

  // Self Exploration Reflections Map (studentId -> reflection doc)
  const [reflectionMap, setReflectionMap] = React.useState<Record<string, any>>({});
  const [loadingReflections, setLoadingReflections] = React.useState<boolean>(false);

  // Logos, Configurations, and Signatures
  const [logos, setLogos] = React.useState<any>(null);
  const [reportConfig, setReportConfig] = React.useState<any>(null);
  const [homeroomTeacherProfile, setHomeroomTeacherProfile] = React.useState<any>(null);

  // UI view options
  const [showReadinessDetails, setShowReadinessDetails] = React.useState<boolean>(false);

  // Error states
  const [studentsError, setStudentsError] = React.useState<boolean>(false);
  const [summaryError, setSummaryError] = React.useState<boolean>(false);
  const [commentsError, setCommentsError] = React.useState<boolean>(false);

  // Selected class display object
  const selectedClassObj = React.useMemo(() => {
    return classesList.find(c => c.id === selectedClassId);
  }, [classesList, selectedClassId]);

  const isUaActive = React.useMemo(() => {
    if (!selectedYear || !selectedSemester || !selectedMonth) return false;
    const currentFirstYear = parseInt(selectedYear.split('/')[0]) || 0;
    const activationFirstYear = 2026;

    if (currentFirstYear > activationFirstYear) return true;
    if (currentFirstYear < activationFirstYear) return false;

    if (selectedSemester === '2') return true;
    if (selectedSemester === '1' && selectedMonth >= '2026-08') return true;
    return false;
  }, [selectedYear, selectedSemester, selectedMonth]);

  // Derive active student IDs
  const activeStudentIds = React.useMemo(() => {
    return students.map(s => s.id);
  }, [students]);

  // Hook for monthly attendance
  const {
    loading: loadingAttendance,
    error: attendanceError,
    attendanceAvailableForPeriod,
    studentAttendanceMap,
  } = useJHReportAttendance({
    selectedClassId,
    selectedClassName: selectedClassObj?.name,
    selectedYear,
    selectedSemester,
    selectedMonth,
    studentIds: activeStudentIds,
  });

  // Filter students based on search
  const filteredStudents = React.useMemo(() => {
    if (!studentSearchQuery.trim()) return students;
    const q = studentSearchQuery.toLowerCase();
    return students.filter(s => 
      s.name.toLowerCase().includes(q) || 
      (s.id && s.id.toLowerCase().includes(q)) ||
      ((s as any).nis && String((s as any).nis).toLowerCase().includes(q))
    );
  }, [students, studentSearchQuery]);

  // Currently selected student
  const currentStudent = React.useMemo(() => {
    if (students.length === 0) return null;
    const safeIdx = Math.max(0, Math.min(selectedStudentIndex, students.length - 1));
    return students[safeIdx] || null;
  }, [students, selectedStudentIndex]);

  // Load Logos and Configs
  React.useEffect(() => {
    const fetchLogosAndConfig = async () => {
      try {
        const logoDoc = await getDoc(doc(db, "settings", "logos"));
        if (logoDoc.exists()) {
          setLogos(logoDoc.data());
        }
      } catch (err) {
        console.warn("Failed to load school logos:", err);
      }

      try {
        const q = query(collection(db, "reportConfig"), where("status", "==", "active"));
        const snap = await getDocs(q);
        const configs = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));

        let resolved = configs.find(c => 
          (c.unit === 'JUNIOR_HIGH' || c.unitId === 'JUNIOR_HIGH') &&
          c.reportType === 'MONTHLY_PROGRESS' &&
          c.academicYear === selectedYear
        );

        if (!resolved) {
          resolved = configs.find(c => 
            (c.unit === 'JUNIOR_HIGH' || c.unitId === 'JUNIOR_HIGH') &&
            c.reportType === 'MONTHLY_PROGRESS' &&
            (!c.academicYear || c.academicYear === '')
          );
        }

        if (!resolved) {
          resolved = configs.find(c => 
            (c.unit === 'JUNIOR_HIGH' || c.unitId === 'JUNIOR_HIGH') &&
            (!c.reportType || c.reportType === '' || c.reportType === 'DEFAULT')
          );
        }

        setReportConfig(resolved || null);
      } catch (err) {
        console.warn("Failed to load reportConfig in Preview:", err);
      }
    };

    fetchLogosAndConfig();
  }, [selectedYear]);

  // Load homeroom teacher profile
  React.useEffect(() => {
    const fetchHomeroomTeacher = async () => {
      if (!selectedClassObj?.homeroomTeacherId) {
        setHomeroomTeacherProfile(null);
        return;
      }
      try {
        const userDoc = await getDoc(doc(db, 'users', selectedClassObj.homeroomTeacherId));
        if (userDoc.exists()) {
          setHomeroomTeacherProfile(userDoc.data());
        } else {
          setHomeroomTeacherProfile(null);
        }
      } catch (err) {
        console.warn("Failed to fetch homeroom teacher profile:", err);
        setHomeroomTeacherProfile(null);
      }
    };
    fetchHomeroomTeacher();
  }, [selectedClassObj]);

  // Initial filter state
  React.useEffect(() => {
    if (activeYear) setSelectedYear(activeYear);
    if (activeSemester) setSelectedSemester(String(activeSemester));

    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(currentMonthStr);
  }, [activeYear, activeSemester]);

  // Fetch classes
  React.useEffect(() => {
    const fetchJHClasses = async () => {
      setLoadingClasses(true);
      try {
        const [all, enrollmentsSnap] = await Promise.all([
          getClasses(),
          getDocs(query(
            collection(db, 'enrollments'),
            where('academicYear', '==', selectedYear),
            where('status', '==', 'active')
          ))
        ]);

        const activeClassKeys = new Set<string>();
        enrollmentsSnap.docs.forEach(d => {
          const e = d.data();
          if (e.classId) activeClassKeys.add(e.classId);
        });

        const jhClasses = (all || []).filter(c => {
          const isJH = c.unitId === 'JUNIOR_HIGH';
          const isActiveYear = c.academicYear === selectedYear;
          const isNotArchived = c.status !== 'archived';
          if (!isJH || !isActiveYear || !isNotArchived) return false;

          return activeClassKeys.has(c.id) || 
                 activeClassKeys.has(c.name) || 
                 ((c as any).classId && activeClassKeys.has((c as any).classId));
        });

        setClassesList(jhClasses);

        if (selectedClassId) {
          const isStillEligible = jhClasses.some(c => c.id === selectedClassId);
          if (!isStillEligible) setSelectedClassId('');
        } else if (jhClasses.length > 0) {
          setSelectedClassId(jhClasses[0].id);
        }
      } catch (err) {
        console.error('Error loading Junior High classes:', err);
        toast.error('Gagal memuat daftar kelas');
      } finally {
        setLoadingClasses(false);
      }
    };
    fetchJHClasses();
  }, [selectedYear]);

  // Cleanup on context filter changes
  React.useEffect(() => {
    setStudents([]);
    setClassSummary(null);
    setCommentsMap({});
    setUnitActivityEnrollments([]);
    setSemesterSummariesMap({});
    setReflectionMap({});
    setSelectedStudentIndex(0);
    setStudentsError(false);
    setSummaryError(false);
    setCommentsError(false);
  }, [selectedClassId, selectedYear, selectedSemester, selectedMonth]);

  // Read-only data assembly
  const loadReportData = async () => {
    if (!selectedClassId || !selectedYear || !selectedSemester || !selectedMonth) return;

    setLoadingStudents(true);
    setLoadingSummary(true);
    setLoadingComments(true);
    setLoadingReflections(true);
    setStudentsError(false);
    setSummaryError(false);
    setCommentsError(false);

    // 1. Fetch active students in class & sort
    try {
      const list = await getActiveStudents(selectedClassId, selectedYear);
      const sorted = (list || []).sort((a, b) => {
        const numA = a.attendanceNumber ?? a.noAbsen ?? a.rollNumber ?? a.rosterNumber ?? 999;
        const numB = b.attendanceNumber ?? b.noAbsen ?? b.rollNumber ?? b.rosterNumber ?? 999;
        if (numA !== numB) return numA - numB;
        return a.name.localeCompare(b.name);
      });
      setStudents(sorted);
      setSelectedStudentIndex(0);
    } catch (err) {
      console.error('Error fetching students:', err);
      setStudentsError(true);
    } finally {
      setLoadingStudents(false);
    }

    // 2. Fetch class-level summary
    try {
      const academicYearNormalized = selectedYear.replace(/\//g, '-');
      const summaryId = `JUNIOR_HIGH_MONTHLY_PROGRESS_${selectedClassId}_${academicYearNormalized}_${selectedSemester}_${selectedMonth}`;
      const summaryRef = doc(db, 'class_report_summaries', summaryId);
      const summarySnap = await getDoc(summaryRef);
      if (summarySnap.exists()) {
        setClassSummary(summarySnap.data() as ClassReportSummary);
      } else {
        // Fallback to non-prefixed ID
        const fallbackId = `${selectedClassId}_${academicYearNormalized}_${selectedSemester}_${selectedMonth}`;
        const fallbackSnap = await getDoc(doc(db, 'class_report_summaries', fallbackId));
        if (fallbackSnap.exists()) {
          setClassSummary(fallbackSnap.data() as ClassReportSummary);
        } else {
          setClassSummary(null);
        }
      }
    } catch (err) {
      console.error('Error fetching class summary:', err);
      setSummaryError(true);
    } finally {
      setLoadingSummary(false);
    }

    // 3. Fetch student general comments
    try {
      const q = query(
        collection(db, 'junior_high_monthly_report_comments'),
        where('classId', '==', selectedClassId),
        where('academicYear', '==', selectedYear),
        where('semester', '==', selectedSemester),
        where('periodKey', '==', selectedMonth)
      );
      const snap = await getDocs(q);
      const map: Record<string, JuniorHighMonthlyReportComment> = {};
      snap.docs.forEach(docSnap => {
        const data = docSnap.data() as JuniorHighMonthlyReportComment;
        if (data.studentId) {
          map[data.studentId] = { ...data, id: docSnap.id };
        }
      });
      setCommentsMap(map);
    } catch (err) {
      console.error('Error fetching comments:', err);
      setCommentsError(true);
    } finally {
      setLoadingComments(false);
    }

    // 4. Fetch Self Exploration reflections
    try {
      const qRefl = query(
        collection(db, 'seMonthlyReflections'),
        where('academicYear', '==', selectedYear),
        where('semester', '==', selectedSemester),
        where('periodKey', '==', selectedMonth)
      );
      const reflSnap = await getDocs(qRefl);
      const rMap: Record<string, any> = {};
      reflSnap.docs.forEach(d => {
        const data = d.data();
        if (data.studentId) {
          rMap[data.studentId] = { id: d.id, ...data };
        }
      });
      setReflectionMap(rMap);
    } catch (err) {
      console.warn('Error loading reflections:', err);
      setReflectionMap({});
    } finally {
      setLoadingReflections(false);
    }

    // 5. Fetch UA Enrollments and summaries if UA is active
    if (isUaActive) {
      setLoadingUaData(true);
      try {
        const [enrollSnap, summariesSnap] = await Promise.all([
          getDocs(query(
            collection(db, 'junior_high_unit_activity_enrollments'),
            where('academicYear', '==', selectedYear),
            where('semester', '==', selectedSemester),
            where('status', '==', 'CONFIRMED')
          )),
          getDocs(query(
            collection(db, 'junior_high_unit_activity_semester_summaries'),
            where('academicYear', '==', selectedYear),
            where('semester', '==', selectedSemester),
            where('month', '==', selectedMonth)
          ))
        ]);

        const enrollmentsList = enrollSnap.docs.map(docSnap => docSnap.data());
        setUnitActivityEnrollments(enrollmentsList);

        const sMap: Record<string, string> = {};
        summariesSnap.docs.forEach(docSnap => {
          const data = docSnap.data();
          if (data.normalizedUaName) {
            sMap[data.normalizedUaName] = data.summary || '';
          }
        });
        setSemesterSummariesMap(sMap);
      } catch (err) {
        console.error('Error fetching UA data for preview:', err);
      } finally {
        setLoadingUaData(false);
      }
    }
  };

  React.useEffect(() => {
    if (selectedClassId && selectedYear && selectedSemester && selectedMonth) {
      loadReportData();
    }
  }, [selectedClassId, selectedYear, selectedSemester, selectedMonth]);

  // Compute readiness stats
  const readinessResult = React.useMemo(() => {
    return validateReportReadiness(
      {
        classId: selectedClassId,
        academicYear: selectedYear,
        semester: selectedSemester,
        periodKey: selectedMonth,
        unit: 'JUNIOR_HIGH',
        reportType: 'MONTHLY_PROGRESS',
      },
      {
        loadingClasses,
        loadingStudents,
        loadingSummary,
        loadingComments,
        loadingAttendance,
      },
      {
        studentsError,
        summaryError,
        commentsError,
        attendanceError: !!attendanceError,
      },
      {
        students,
        classSummary,
        commentsMap,
        attendanceAvailableForPeriod,
      }
    );
  }, [
    selectedClassId, selectedYear, selectedSemester, selectedMonth,
    loadingClasses, loadingStudents, loadingSummary, loadingComments, loadingAttendance,
    studentsError, summaryError, commentsError, attendanceError,
    students, classSummary, commentsMap, attendanceAvailableForPeriod,
  ]);

  const { overallState, checklist, counts } = readinessResult;

  // Resolve weekly lessons and unit activities for current student
  const resolvedWeeklyLessons = React.useMemo(() => {
    if (!classSummary) return [];

    const rawItems = classSummary.sections?.weeklyLessonsAndUnitActivities || [];
    const savedItems = rawItems
      .filter(item => Boolean(item.title?.trim() || item.summary?.trim()))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const hasSavedUa = savedItems.some(item => item.category === 'UNIT_ACTIVITY');

    // If no UNIT_ACTIVITY was entered in classSummary and UA is active, supplement dynamic student enrollments if present
    if (!hasSavedUa && isUaActive && currentStudent) {
      const studentEnrollments = unitActivityEnrollments.filter(
        e => e.studentId === currentStudent.id && e.status === 'CONFIRMED'
      );
      if (studentEnrollments.length > 0) {
        const dynamicUaItems = studentEnrollments.map((e, index) => {
          const desc = semesterSummariesMap[e.normalizedUaName] || '';
          return {
            id: `ua_dyn_${e.normalizedUaName}_${index}`,
            order: savedItems.length + index,
            category: 'UNIT_ACTIVITY' as const,
            title: e.normalizedUaName,
            summary: desc.trim() || '[Deskripsi aktivitas bulanan belum diisi di menu Unit Aktivitas.]'
          };
        }).sort((a, b) => a.title.localeCompare(b.title));

        return [...savedItems, ...dynamicUaItems];
      }
    }

    return savedItems;
  }, [classSummary, isUaActive, currentStudent, unitActivityEnrollments, semesterSummariesMap]);

  // Resolve approved self-exploration reflection slots for current student
  const resolvedSelfExplorationSlots = React.useMemo(() => {
    if (!currentStudent) return [];
    const reflectionDoc = reflectionMap[currentStudent.id];
    if (reflectionDoc?.overallStatus !== 'APPROVED') return [];
    return (reflectionDoc.slots || [])
      .filter((slot: any) => slot.status === 'APPROVED' && slot.reflectionText?.trim())
      .sort((a: any, b: any) => a.slot - b.slot);
  }, [currentStudent, reflectionMap]);

  // Current student specific data
  const currentComment = currentStudent ? commentsMap[currentStudent.id] : null;
  const currentAttendance = currentStudent ? studentAttendanceMap[currentStudent.id] : null;

  // Navigation handlers
  const handlePrevStudent = () => {
    if (selectedStudentIndex > 0) {
      setSelectedStudentIndex(selectedStudentIndex - 1);
    }
  };

  const handleNextStudent = () => {
    if (selectedStudentIndex < students.length - 1) {
      setSelectedStudentIndex(selectedStudentIndex + 1);
    }
  };

  const handlePrint = () => {
    if (!currentStudent) {
      toast.error('Pilih siswa terlebih dahulu.');
      return;
    }
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-100/60 pb-16">
      
      {/* Top Banner & Control Zone (Screen only, hidden on print) */}
      <div className="print:hidden bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#002366]/10 text-[#002366] border border-[#002366]/20">
                  PREVIEW DOKUMEN RAPOR
                </span>
                <span className="text-xs text-slate-400">· 2 Halaman A4 Identik PDF</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <FileText className="text-[#002366]" size={24} />
                Pratinjau Rapor Bulanan Junior High
              </h1>
            </div>

            {/* Quick Actions Bar */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handlePrint}
                disabled={!currentStudent}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#002366] text-white hover:bg-[#002366]/90 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                title="Cetak rapor atau simpan sebagai file PDF"
              >
                <Printer size={15} />
                Cetak / Simpan PDF
              </button>

              <button
                onClick={() => navigate('/junior-high/monthly-comments')}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-xs transition-colors cursor-pointer"
              >
                <MessageSquare size={14} className="text-[#002366]" />
                Komentar Siswa
              </button>

              <button
                onClick={() => navigate('/junior-high/monthly-report')}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-xs transition-colors cursor-pointer"
              >
                <BookOpen size={14} className="text-[#002366]" />
                Input Materi Kelas
              </button>

              <button
                onClick={() => navigate('/junior-high/monthly-report-pdf')}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-xs transition-colors cursor-pointer"
              >
                <Download size={14} className="text-[#002366]" />
                PDF Massal
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-5 space-y-5">
        
        {/* Context Filters Card (Screen only) */}
        <div className="print:hidden bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
                <Calendar size={13} className="text-[#002366]" /> Tahun Ajaran
              </label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full text-xs sm:text-sm rounded-xl border-slate-200 focus:border-[#002366] focus:ring-[#002366] py-2 bg-slate-50/50 font-medium"
              >
                <option value="2025/2026">2025/2026</option>
                <option value="2026/2027">2026/2027</option>
                <option value="2027/2028">2027/2028</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Semester
              </label>
              <div className="grid grid-cols-2 gap-2">
                {['1', '2'].map((sem) => (
                  <button
                    key={sem}
                    type="button"
                    onClick={() => setSelectedSemester(sem)}
                    className={`py-2 text-xs sm:text-sm font-semibold rounded-xl border transition-all cursor-pointer ${
                      selectedSemester === sem
                        ? 'bg-[#002366] text-white border-[#002366] shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    Sem {sem}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
                <Calendar size={13} className="text-[#002366]" /> Periode Bulan
              </label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full text-xs sm:text-sm rounded-xl border-slate-200 focus:border-[#002366] focus:ring-[#002366] py-1.5 bg-slate-50/50 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
                <Users size={13} className="text-[#002366]" /> Kelas Junior High
              </label>
              {loadingClasses ? (
                <div className="h-10 flex items-center px-3 bg-slate-50 rounded-xl text-xs text-slate-400">
                  <RefreshCw size={14} className="animate-spin mr-2" />
                  Memuat kelas...
                </div>
              ) : (
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="w-full text-xs sm:text-sm rounded-xl border-slate-200 focus:border-[#002366] focus:ring-[#002366] py-2 bg-slate-50/50 font-medium"
                >
                  <option value="" disabled>
                    {classesList.length === 0 ? "Tidak ada kelas aktif" : "-- Pilih Kelas --"}
                  </option>
                  {classesList.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>

        {/* Readiness Compact Summary Strip (Screen only) */}
        {selectedClassId && selectedMonth && (
          <div className="print:hidden bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-bold text-slate-700 flex items-center gap-1.5 uppercase text-[10px] tracking-wider text-[#002366]">
                  <Info size={14} className="text-[#002366]" /> Kesiapan Dokumen:
                </span>

                {/* Ringkasan Kelas Badge */}
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                  classSummary?.sections?.learningJourney?.summary
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}>
                  {classSummary?.sections?.learningJourney?.summary ? '✓ Ringkasan Kelas Siap' : '⚠️ Ringkasan Belum Diisi'}
                </span>

                {/* Current Student Comment Badge */}
                {currentStudent && (
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                    currentComment?.status === 'FINAL'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : currentComment?.status === 'DRAFT'
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : 'bg-rose-50 text-rose-800 border-rose-200'
                  }`}>
                    {currentComment?.status === 'FINAL'
                      ? '✓ Komentar: FINAL'
                      : currentComment?.status === 'DRAFT'
                      ? '⚠️ Komentar: DRAFT'
                      : '❌ Belum Ada Komentar'}
                  </span>
                )}

                {/* Kehadiran Badge */}
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                  attendanceAvailableForPeriod
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}>
                  {attendanceAvailableForPeriod ? '✓ Kehadiran Tercatat' : 'Kehadiran Nihil'}
                </span>

                {/* Total Class Progress */}
                <span className="text-[11px] text-slate-500 font-medium pl-1">
                  (Kelas: <strong>{counts.finalCommentsCount}</strong> dari <strong>{counts.totalStudents}</strong> siswa FINAL)
                </span>
              </div>

              <button
                type="button"
                onClick={() => setShowReadinessDetails(!showReadinessDetails)}
                className="text-xs font-semibold text-[#002366] hover:underline self-start md:self-auto"
              >
                {showReadinessDetails ? 'Sembunyikan Rincian ▲' : 'Lihat Rincian Validasi ▼'}
              </button>
            </div>

            {/* Expandable Readiness Details */}
            {showReadinessDetails && (
              <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                {checklist.map(item => (
                  <div key={item.key} className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/50 flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700">{item.label}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                        item.state === 'Ready' ? 'bg-emerald-100 text-emerald-800' :
                        item.state === 'Incomplete' ? 'bg-amber-100 text-amber-800' :
                        'bg-slate-150 text-slate-700'
                      }`}>
                        {item.state}
                      </span>
                    </div>
                    {item.reason && (
                      <p className="text-[10px] text-slate-400 italic leading-snug">{item.reason}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Student Navigation Toolbar (Screen only) */}
        {students.length > 0 && (
          <div className="print:hidden bg-white border border-slate-200 rounded-2xl shadow-sm p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            
            {/* Left: Previous / Next & Index */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={handlePrevStudent}
                disabled={selectedStudentIndex <= 0}
                className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Siswa Sebelumnya"
              >
                <ChevronLeft size={18} />
              </button>

              <span className="text-xs font-semibold text-slate-600 px-2 min-w-[120px] text-center">
                Siswa <strong>{selectedStudentIndex + 1}</strong> dari <strong>{students.length}</strong>
              </span>

              <button
                type="button"
                onClick={handleNextStudent}
                disabled={selectedStudentIndex >= students.length - 1}
                className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Siswa Selanjutnya"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {/* Center/Right: Dropdown selector */}
            <div className="flex flex-1 items-center gap-3 w-full sm:w-auto justify-end">
              <div className="w-full sm:max-w-xs">
                <select
                  value={selectedStudentIndex}
                  onChange={(e) => setSelectedStudentIndex(Number(e.target.value))}
                  className="w-full text-xs sm:text-sm rounded-xl border-slate-200 focus:border-[#002366] focus:ring-[#002366] py-2 bg-slate-50/50 font-semibold text-slate-800"
                >
                  {students.map((st, idx) => {
                    const cStat = commentsMap[st.id]?.status;
                    const cMarker = cStat === 'FINAL' ? '✓' : cStat === 'DRAFT' ? '✎' : '○';
                    const noAbsen = st.attendanceNumber ?? st.noAbsen ?? (idx + 1);
                    return (
                      <option key={st.id} value={idx}>
                        {noAbsen}. {st.name} ({cMarker} {cStat || 'Belum Diisi'})
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

          </div>
        )}

        {/* Main Document Viewer Container */}
        <div className="flex justify-center py-2">
          {loadingStudents || loadingSummary ? (
            <div className="py-24 text-center">
              <RefreshCw size={32} className="animate-spin text-[#002366] mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-600">Menyusun dokumen rapor bulanan...</p>
              <p className="text-xs text-slate-400 mt-1">Mengambil data perjalanan belajar, materi mingguan, kehadiran, dan komentar siswa.</p>
            </div>
          ) : !selectedClassId ? (
            <div className="py-20 text-center border-2 border-dashed border-slate-200 rounded-3xl max-w-lg mx-auto p-8 bg-white/70">
              <Users size={36} className="text-slate-300 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-slate-700">Pilih Kelas Terlebih Dahulu</h3>
              <p className="text-xs text-slate-400 mt-1">Pilih kelas di filter atas untuk melihat pratinjau lembar rapor bulanan siswa.</p>
            </div>
          ) : students.length === 0 ? (
            <div className="py-20 text-center border-2 border-dashed border-slate-200 rounded-3xl max-w-lg mx-auto p-8 bg-white/70">
              <AlertCircle size={36} className="text-amber-500 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-slate-700">Tidak Ada Siswa Aktif</h3>
              <p className="text-xs text-slate-400 mt-1">Belum ada siswa yang terdaftar aktif pada kelas ini untuk tahun ajaran terpilih.</p>
            </div>
          ) : currentStudent ? (
            <div className="w-full flex justify-center overflow-x-auto pb-8">
              {/* Actual 2-Page A4 Document Sheet */}
              <JuniorHighMonthlyReportDocument
                documentIdPrefix="jh-preview"
                student={currentStudent}
                className={selectedClassObj?.name || ''}
                periodKey={selectedMonth}
                logos={logos}
                reportConfig={reportConfig}
                homeroomTeacherProfile={homeroomTeacherProfile}
                homeroomTeacherName={homeroomTeacherProfile?.displayName || selectedClassObj?.homeroomTeacherName || 'Wali Kelas'}
                classSummary={classSummary}
                weeklyLessons={resolvedWeeklyLessons}
                selfExplorationSlots={resolvedSelfExplorationSlots}
                attendance={currentAttendance || null}
                attendanceAvailable={attendanceAvailableForPeriod}
                comment={currentComment || null}
                isPreview={true}
              />
            </div>
          ) : null}
        </div>

      </div>

    </div>
  );
}
