import * as React from 'react';
import { motion } from 'motion/react';
import { 
  FileText, Calendar, Users, RefreshCw, AlertCircle, Info, CheckCircle2, 
  ArrowRight, ShieldAlert, CheckCircle, HelpCircle, Compass, Heart, Lock
} from 'lucide-react';
import { db, getClasses, getActiveStudents } from '../../lib/firebase';
import { doc, getDoc, getDocs, query, collection, where } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useJHReportAttendance } from '../../hooks/useJHReportAttendance';
import type { Class, Student, ClassReportSummary, JuniorHighMonthlyReportComment } from '../../types';
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

export default function MonthlyReportTemplatePage() {
  const { profile } = useAuth();
  const { activeYear, activeSemester } = useAcademicYear();
  const navigate = useNavigate();

  // Selected parameters (Clear current display and reload matching data when changed)
  const [selectedYear, setSelectedYear] = React.useState<string>('2026/2027');
  const [selectedSemester, setSelectedSemester] = React.useState<string>('1');
  const [selectedMonth, setSelectedMonth] = React.useState<string>('');
  const [selectedClassId, setSelectedClassId] = React.useState<string>('');

  // Dropdowns & master data
  const [classesList, setClassesList] = React.useState<Class[]>([]);
  const [loadingClasses, setLoadingClasses] = React.useState<boolean>(false);
  const [students, setStudents] = React.useState<Student[]>([]);
  const [loadingStudents, setLoadingStudents] = React.useState<boolean>(false);

  // Read-only fetched data
  const [classSummary, setClassSummary] = React.useState<ClassReportSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = React.useState<boolean>(false);
  const [commentsMap, setCommentsMap] = React.useState<Record<string, JuniorHighMonthlyReportComment>>({});
  const [loadingComments, setLoadingComments] = React.useState<boolean>(false);

  // Error states for source health
  const [studentsError, setStudentsError] = React.useState<boolean>(false);
  const [summaryError, setSummaryError] = React.useState<boolean>(false);
  const [commentsError, setCommentsError] = React.useState<boolean>(false);

  // Selected class display name for legacy fallback matching
  const selectedClassObj = React.useMemo(() => {
    return classesList.find(c => c.id === selectedClassId);
  }, [classesList, selectedClassId]);

  // Derive student IDs for the query input
  const activeStudentIds = React.useMemo(() => {
    return students.map(s => s.id);
  }, [students]);

  // Hook call for read-only monthly attendance resolution
  const {
    loading: loadingAttendance,
    error: attendanceError,
    errorType: attendanceErrorType,
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

  // Set initial filter state
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
        const all = await getClasses();
        const jhClasses = (all || []).filter(c => 
          c.unitId === 'JUNIOR_HIGH' && 
          c.status !== 'archived'
        );
        setClassesList(jhClasses);
        if (jhClasses.length > 0 && !selectedClassId) {
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
  }, [selectedClassId]);

  // Immediate stale data cleanup on context filter change to guarantee checking state during loading (Requirement 8)
  React.useEffect(() => {
    setStudents([]);
    setClassSummary(null);
    setCommentsMap({});
    setStudentsError(false);
    setSummaryError(false);
    setCommentsError(false);
  }, [selectedClassId, selectedYear, selectedSemester, selectedMonth]);

  // Load report data trigger
  const loadReportData = async () => {
    if (!selectedClassId || !selectedYear || !selectedSemester || !selectedMonth) return;

    setLoadingStudents(true);
    setLoadingSummary(true);
    setLoadingComments(true);
    setStudentsError(false);
    setSummaryError(false);
    setCommentsError(false);

    // 1. Fetch active students in class & sort according to sorting rule
    try {
      const list = await getActiveStudents(selectedClassId, selectedYear);
      const sorted = (list || []).sort((a, b) => {
        const numA = a.attendanceNumber ?? a.noAbsen ?? a.rollNumber ?? a.rosterNumber ?? 999;
        const numB = b.attendanceNumber ?? b.noAbsen ?? b.rollNumber ?? b.rosterNumber ?? 999;
        if (numA !== numB) {
          return numA - numB;
        }
        return a.name.localeCompare(b.name);
      });
      setStudents(sorted);
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
        setClassSummary(null);
      }
    } catch (err) {
      console.error('Error fetching summary:', err);
      setSummaryError(true);
    } finally {
      setLoadingSummary(false);
    }

    // 3. Fetch student comments
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
  };

  React.useEffect(() => {
    if (selectedClassId && selectedYear && selectedSemester && selectedMonth) {
      loadReportData();
    }
  }, [selectedClassId, selectedYear, selectedSemester, selectedMonth]);

  // Compute readiness stats using the pure shared helper (Requirement 1, 2, 3, 4, 5, 6)
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
    selectedClassId,
    selectedYear,
    selectedSemester,
    selectedMonth,
    loadingClasses,
    loadingStudents,
    loadingSummary,
    loadingComments,
    loadingAttendance,
    studentsError,
    summaryError,
    commentsError,
    attendanceError,
    students,
    classSummary,
    commentsMap,
    attendanceAvailableForPeriod,
  ]);

  const { overallState, checklist, counts } = readinessResult;
  const isReportReady = overallState === 'READY FOR FUTURE PUBLISH';

  // Status Banner calculation
  const getInternalStatusBanner = () => {
    if (overallState === 'READY FOR FUTURE PUBLISH') {
      return (
        <div className="bg-emerald-600 border border-emerald-700 text-white px-5 py-4 rounded-xl flex items-center justify-between gap-4 shadow-sm mb-6">
          <div className="flex items-center gap-3">
            <CheckCircle className="text-white shrink-0" size={24} />
            <div>
              <h4 className="font-black text-sm uppercase tracking-wide">
                Preview Ready for Future Publish — Not Published
              </h4>
              <p className="text-xs text-emerald-100 mt-0.5 font-medium">
                All required report data is complete. This report has not been published.
              </p>
            </div>
          </div>
          <span className="px-3 py-1 bg-emerald-700/60 rounded-lg text-[10px] font-black uppercase tracking-widest border border-emerald-500/30">
            PREVIEW READY
          </span>
        </div>
      );
    } else {
      return (
        <div className="bg-amber-500 border border-amber-600 text-white px-5 py-4 rounded-xl flex items-center justify-between gap-4 shadow-sm mb-6">
          <div className="flex items-center gap-3">
            <ShieldAlert className="text-white shrink-0" size={24} />
            <div>
              <h4 className="font-black text-sm uppercase tracking-wide">
                Internal Draft — Not Published
              </h4>
              <p className="text-xs text-amber-50 mt-0.5 font-medium">
                {overallState === 'CHECKING' 
                  ? 'Memuat data kesiapan rapor...' 
                  : 'Rapor belum siap dipublikasikan karena kelengkapan data tidak terpenuhi.'}
              </p>
            </div>
          </div>
          <span className="px-3 py-1 bg-amber-600/60 rounded-lg text-[10px] font-black uppercase tracking-widest border border-amber-400/30">
            INTERNAL DRAFT
          </span>
        </div>
      );
    }
  };

  return (
    <div id="monthly-report-template-page" className="min-h-screen bg-slate-50/50 p-6">
      {/* Top Header Workspace Section */}
      <div className="mx-auto max-w-6xl mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#002366]/10 text-[#002366] border border-[#002366]/20">
                JUNIOR HIGH ONLY
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                Internal Workspace
              </span>
            </div>
            <h1 className="text-2xl font-black text-slate-950 uppercase tracking-tight italic flex items-center gap-2">
              <FileText className="text-[#002366]" size={26} />
              Monthly Report Template
            </h1>
            <p className="text-sm text-slate-500 mt-0.5 font-medium">
              Pratinjau visual internal read-only dari format Rapor Kemajuan Bulanan dengan sistem aksen biru teratur.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-center">
            <button
              onClick={loadReportData}
              disabled={loadingStudents || loadingSummary || loadingComments}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
            >
              <RefreshCw size={15} className={(loadingStudents || loadingSummary || loadingComments) ? 'animate-spin' : ''} />
              Muat Ulang Data
            </button>
          </div>
        </div>
      </div>

      {/* Internal Status Banner Block */}
      <div className="mx-auto max-w-6xl">
        {getInternalStatusBanner()}
      </div>

      {/* Pre-Publish Validation Compact Summary Box */}
      <div className="mx-auto max-w-6xl mb-6 bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg border ${overallState === 'READY FOR FUTURE PUBLISH' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>
            <CheckCircle2 size={20} />
          </div>
          <div>
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
              Pre-Publish Validation
            </h4>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1 text-xs text-slate-500 font-medium">
              <span>Status: <strong className={`font-black ${overallState === 'READY FOR FUTURE PUBLISH' ? 'text-emerald-700 font-black' : 'text-amber-700 font-black'}`}>{overallState}</strong></span>
              <span className="text-slate-300">•</span>
              <span>
                {overallState === 'READY FOR FUTURE PUBLISH' 
                  ? 'All items passed validation' 
                  : `${checklist.filter(item => item.state !== 'Ready').length} remaining incomplete items`}
              </span>
            </div>
          </div>
        </div>

        {/* Safe Reason Summary */}
        <div className="text-xs font-medium text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 max-w-md w-full md:w-auto">
          <span className="font-bold text-slate-700 block mb-0.5 text-[9px] uppercase tracking-wide">Validation Summary</span>
          {overallState === 'READY FOR FUTURE PUBLISH' ? (
            <span className="text-emerald-700 font-bold text-xs">This report is ready to enter a future publish workflow.</span>
          ) : (
            <span className="text-rose-700 font-bold text-xs block">
              {checklist.find(item => item.state !== 'Ready' && item.reason)?.reason || 'Report context is incomplete.'}
            </span>
          )}
        </div>
      </div>

      {/* Context Filters */}
      <div className="mx-auto max-w-6xl bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-6">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1">
          <Info size={13} className="text-[#002366]" /> Filter Konteks Laporan
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
              <Calendar size={13} className="text-[#002366]" /> Tahun Ajaran
            </label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full text-sm rounded-lg border-slate-200 focus:border-[#002366] focus:ring-[#002366] py-2 bg-slate-50/50 font-bold"
            >
              <option value="2025/2026">2025/2026</option>
              <option value="2026/2027">2026/2027</option>
              <option value="2027/2028">2027/2028</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
              Semester
            </label>
            <div className="grid grid-cols-2 gap-2">
              {['1', '2'].map((sem) => (
                <button
                  key={sem}
                  onClick={() => setSelectedSemester(sem)}
                  className={`py-2 text-sm font-black rounded-lg border transition-all cursor-pointer ${
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
            <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
              <Calendar size={13} className="text-[#002366]" /> Periode Bulan
            </label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full text-sm rounded-lg border-slate-200 focus:border-[#002366] focus:ring-[#002366] py-1.5 bg-slate-50/50 font-bold"
            />
          </div>

          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
              <Users size={13} className="text-[#002366]" /> Kelas Junior High
            </label>
            {loadingClasses ? (
              <div className="h-10 flex items-center px-3 bg-slate-50 rounded-lg text-xs text-slate-400 font-medium">
                <RefreshCw size={14} className="animate-spin mr-2" />
                Memuat daftar kelas...
              </div>
            ) : (
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="w-full text-sm rounded-lg border-slate-200 focus:border-[#002366] focus:ring-[#002366] py-2 bg-slate-50/50 font-black"
              >
                <option value="" disabled>-- Pilih Kelas --</option>
                {classesList.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Main Assembly Grid */}
      <div className="mx-auto max-w-6xl grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Side: Summary & Status Stats */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Metrics Card */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-[#002366] border-b border-slate-100 pb-2 flex items-center gap-1.5">
              <CheckCircle2 size={16} /> Kelengkapan Laporan
            </h3>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50/50 border border-slate-100 p-3 rounded-lg text-center">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide block">Roster Aktif</span>
                <strong className="text-lg font-black text-slate-800">{counts.totalStudents}</strong>
              </div>
              <div className="bg-emerald-50/20 border border-emerald-100 p-3 rounded-lg text-center">
                <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wide block">Final</span>
                <strong className="text-lg font-black text-emerald-700">{counts.finalCommentsCount}</strong>
              </div>
              <div className="bg-amber-50/20 border border-amber-100 p-3 rounded-lg text-center">
                <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wide block">Draft</span>
                <strong className="text-lg font-black text-amber-700">{counts.draftCommentsCount}</strong>
              </div>
              <div className="bg-slate-100/50 border border-slate-150 p-3 rounded-lg text-center">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wide block">Belum Diisi</span>
                <strong className="text-lg font-black text-slate-600">{counts.missingFinalCommentsCount}</strong>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-3 text-[11px] text-slate-400 flex flex-col gap-1">
              <div className="flex justify-between">
                <span>Summary Pembelajaran:</span>
                <span className={`font-bold ${counts.isClassSummaryReady ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {counts.isClassSummaryReady ? 'READY' : classSummary ? 'DRAFT' : 'MISSING'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Absensi Terhubung:</span>
                <span className={`font-bold ${counts.attendanceAvailable ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {counts.attendanceAvailable ? 'Tersedia (Tercatat)' : 'Tidak Tersedia'}
                </span>
              </div>
            </div>
          </div>

          {/* Guidelines info card */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-[#002366] flex items-center gap-1">
              <Info size={14} /> Aturan Layout Laporan
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Halaman ini menampilkan struktur tata letak rapor bulanan Junior High secara visual. Semua operasi data bersifat read-only.
            </p>
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex gap-2 text-[11px] text-slate-600">
                <span className="font-bold text-[#002366] shrink-0">1.</span>
                <span>Komentar berstatus <strong>DRAFT</strong> tidak dipublikasikan ke pratinjau dan disembunyikan isinya demi kerahasiaan draf guru.</span>
              </div>
              <div className="flex gap-2 text-[11px] text-slate-600">
                <span className="font-bold text-[#002366] shrink-0">2.</span>
                <span>Absensi menggunakan label standard Bahasa Inggris: <strong>Sick Leave</strong>, <strong>Excused Leave</strong>, dan <strong>Absent</strong>.</span>
              </div>
            </div>
          </div>

        </div>

        {/* Right Side: Report Masthead, Summary & Student List */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Visual Report Card Layout Wrapper */}
          <div className="bg-white border border-[#002366]/20 rounded-2xl shadow-md overflow-hidden bg-white">
            
            {/* Masthead Deep Navy Block */}
            <div className="bg-[#002366] text-white p-6 relative">
              <div className="absolute top-4 right-4 text-white/10 uppercase tracking-widest font-black text-4xl pointer-events-none select-none">
                JH-REPORT
              </div>
              <div className="flex items-center gap-2 mb-2">
                <Heart className="text-teal-400 fill-teal-400/20 shrink-0" size={16} />
                <span className="text-[10px] font-black tracking-widest uppercase text-teal-300">
                  Lazuardi Junior High • Monthly Report Visual Template
                </span>
              </div>
              <h2 className="text-xl font-black uppercase tracking-wider italic">
                Monthly Progress Report
              </h2>
              <p className="text-xs text-slate-300 mt-0.5 uppercase tracking-wide">
                Laporan Perkembangan Bulanan Siswa SMP
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-3 gap-x-4 border-t border-white/15 pt-4 mt-4 text-xs text-slate-200">
                <div>
                  <span className="block text-[10px] text-slate-400 uppercase tracking-wider font-bold">Kelas</span>
                  <strong className="text-sm text-white font-black">{selectedClassObj?.name || '-'}</strong>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-400 uppercase tracking-wider font-bold">Tahun Ajaran</span>
                  <strong className="text-sm text-white font-black">{selectedYear}</strong>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-400 uppercase tracking-wider font-bold">Semester</span>
                  <strong className="text-sm text-white font-black">Semester {selectedSemester}</strong>
                </div>
                <div className="col-span-2">
                  <span className="block text-[10px] text-slate-400 uppercase tracking-wider font-bold">Periode Laporan</span>
                  <strong className="text-sm text-white font-black">{getIndonesianMonthLabel(selectedMonth) || selectedMonth || '-'}</strong>
                </div>
              </div>
            </div>

            {/* CLASS LEARNING SUMMARY SECTION */}
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center justify-between gap-4 border-b border-blue-100 pb-3 mb-4">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-[#002366]">
                    Class Learning Summary (Ringkasan Kelas)
                  </h3>
                  <p className="text-[10px] text-slate-400">Ringkasan perjalanan aktivitas pembelajaran kelas bulan ini.</p>
                </div>
                <button
                  onClick={() => navigate('/junior-high/monthly-report')}
                  className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-[#002366] hover:underline cursor-pointer"
                >
                  Open Monthly Report Summary <ArrowRight size={12} />
                </button>
              </div>

              {loadingSummary ? (
                <div className="py-8 text-center">
                  <RefreshCw size={20} className="animate-spin text-slate-400 mx-auto mb-2" />
                  <span className="text-xs text-slate-400 font-medium">Memuat Ringkasan Kelas...</span>
                </div>
              ) : !classSummary ? (
                <div className="border border-dashed border-slate-200 rounded-xl p-6 text-center bg-slate-50/40">
                  <AlertCircle size={20} className="mx-auto text-amber-500 mb-2" />
                  <p className="text-xs font-bold text-slate-600">Class summary has not been completed for this context.</p>
                  <p className="text-[10px] text-slate-400 mt-1">Lengkapi summary kelas melalui menu Monthly Report Summary.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Learning Journey */}
                  <div className="bg-slate-50/50 border border-slate-100 rounded-xl p-4">
                    <span className="text-[9px] font-black text-[#002366] uppercase tracking-wider block mb-1">
                      Learning Journey
                    </span>
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide">
                      {classSummary.sections?.learningJourney?.title || 'No Title'}
                    </h4>
                    <p className="text-xs text-slate-600 mt-2 leading-relaxed whitespace-pre-wrap">
                      {classSummary.sections?.learningJourney?.summary || 'No Summary'}
                    </p>
                  </div>

                  {/* Weekly Lessons & Unit Activities list rendering */}
                  {classSummary.sections?.weeklyLessonsAndUnitActivities && classSummary.sections.weeklyLessonsAndUnitActivities.length > 0 ? (
                    <div className="space-y-2.5">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">
                        Weekly Lessons / Unit Activities
                      </span>
                      <div className="grid grid-cols-1 gap-2">
                        {classSummary.sections.weeklyLessonsAndUnitActivities.map((item, idx) => (
                          <div 
                            key={item.id || idx}
                            className={`border rounded-xl p-3 text-xs ${
                              item.category === 'WEEKLY_LESSON' ? 'bg-blue-50/10 border-blue-100' : 'bg-purple-50/5 border-purple-100'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${
                                item.category === 'WEEKLY_LESSON' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                              }`}>
                                {item.category === 'WEEKLY_LESSON' ? 'Weekly' : 'UA'}
                              </span>
                              <strong className="text-slate-800 font-bold">{item.title}</strong>
                            </div>
                            <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">{item.summary}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {/* STUDENT PROGRESS ROSTER SECTION */}
            <div className="p-6">
              <div className="flex items-center justify-between gap-4 border-b border-blue-100 pb-3 mb-4">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-[#002366]">
                    Student Monthly Progress (Perkembangan Siswa)
                  </h3>
                  <p className="text-[10px] text-slate-400">Roster siswa aktif dalam kelas terurut sesuai No. Absen.</p>
                </div>
                <button
                  onClick={() => navigate('/junior-high/monthly-comments')}
                  className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-[#002366] hover:underline cursor-pointer"
                >
                  Open Comments <ArrowRight size={12} />
                </button>
              </div>

              {/* Attendance status banner notice */}
              {selectedClassId && selectedYear && selectedSemester && selectedMonth && (
                <div className="mb-4 px-4 py-2 bg-slate-50 border border-slate-100 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs font-semibold text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <Calendar size={13} className="text-[#002366]" />
                    <span>Presensi Kehadiran Bulanan</span>
                  </div>
                  <div>
                    {loadingAttendance ? (
                      <span className="inline-flex items-center gap-1 text-blue-650">
                        <RefreshCw size={11} className="animate-spin" /> Memuat data...
                      </span>
                    ) : attendanceError ? (
                      <span className="text-rose-600 font-bold bg-rose-50 px-2.5 py-0.5 rounded border border-rose-100 text-[10px]">
                        Attendance not loaded for this period due to query error.
                      </span>
                    ) : !attendanceAvailableForPeriod ? (
                      <span className="text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded border border-amber-100 text-[10px]">
                        Attendance not recorded for this period.
                      </span>
                    ) : (
                      <span className="text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-100 text-[10px]">
                        Attendance recorded
                      </span>
                    )}
                  </div>
                </div>
              )}

              {loadingStudents || loadingComments ? (
                <div className="py-12 text-center">
                  <RefreshCw size={24} className="animate-spin text-slate-400 mx-auto mb-2" />
                  <span className="text-xs text-slate-400 font-medium">Memuat daftar siswa & komentar...</span>
                </div>
              ) : students.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs font-bold border border-dashed border-slate-200 rounded-xl bg-slate-50/40">
                  Tidak ada data siswa aktif dalam kelas ini untuk tahun ajaran terpilih.
                </div>
              ) : (
                <div className="space-y-5">
                  {students.map((student, index) => {
                    const commentObj = commentsMap[student.id];
                    const absNum = student.attendanceNumber ?? student.noAbsen ?? student.rollNumber ?? student.rosterNumber ?? (index + 1);
                    const status = commentObj?.status || 'NOT_FOUND';

                    return (
                      <div 
                        key={student.id} 
                        className="border border-slate-150 rounded-xl p-4 hover:border-blue-200 transition-colors bg-white relative space-y-3.5"
                      >
                        {/* Student Card Top Section */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-50 pb-2.5">
                          <div className="flex items-center gap-3">
                            <span className="w-7 h-7 rounded-lg bg-blue-50 text-[#002366] flex items-center justify-center font-black text-xs shrink-0 border border-blue-100">
                              {absNum}
                            </span>
                            <div>
                              <h4 className="text-sm font-black text-slate-800">{student.name}</h4>
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                NIS: {student.id} • Grade: {student.classGrade || '7/8/9'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-start sm:self-center">
                            {/* Status Chip */}
                            {status === 'FINAL' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                                FINAL
                              </span>
                            ) : status === 'DRAFT' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-100 text-amber-800 border border-amber-200">
                                DRAFT
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black bg-slate-100 text-slate-400 border border-slate-200">
                                BELUM DIISI
                              </span>
                            )}

                            <button
                              onClick={() => navigate('/junior-high/monthly-comments')}
                              className="px-2 py-1 bg-slate-50 hover:bg-slate-100 text-[10px] font-black text-[#002366] border border-slate-200 rounded-lg transition-colors cursor-pointer"
                            >
                              Open Comments
                            </button>
                          </div>
                        </div>

                        {/* Compact Attendance Grid - exact Contract labels */}
                        <div className="grid grid-cols-3 gap-2 border border-slate-100 rounded-lg p-2.5 bg-slate-50/40 text-center">
                          <div>
                            <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">Sick Leave</span>
                            <strong className="text-xs font-black text-slate-700">
                              {loadingAttendance ? (
                                <span className="text-slate-300">...</span>
                              ) : attendanceAvailableForPeriod && studentAttendanceMap[student.id] ? (
                                studentAttendanceMap[student.id].sickLeave ?? '-'
                              ) : (
                                '-'
                              )}
                            </strong>
                          </div>
                          <div className="border-x border-slate-150">
                            <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">Excused Leave</span>
                            <strong className="text-xs font-black text-slate-700">
                              {loadingAttendance ? (
                                <span className="text-slate-300">...</span>
                              ) : attendanceAvailableForPeriod && studentAttendanceMap[student.id] ? (
                                studentAttendanceMap[student.id].excusedLeave ?? '-'
                              ) : (
                                '-'
                              )}
                            </strong>
                          </div>
                          <div>
                            <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">Absent</span>
                            <strong className="text-xs font-black text-slate-700">
                              {loadingAttendance ? (
                                <span className="text-slate-300">...</span>
                              ) : attendanceAvailableForPeriod && studentAttendanceMap[student.id] ? (
                                studentAttendanceMap[student.id].absent ?? '-'
                              ) : (
                                '-'
                              )}
                            </strong>
                          </div>
                        </div>

                        {/* General Comments display (Strict Rule applied) */}
                        <div className="space-y-1">
                          <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">
                            General Comments
                          </span>
                          
                          {status === 'FINAL' ? (
                            <div className="p-3.5 rounded-xl border border-blue-50 bg-blue-50/5 text-slate-700 leading-relaxed text-xs whitespace-pre-wrap font-medium">
                              {commentObj.generalComment}
                            </div>
                          ) : status === 'DRAFT' ? (
                            <div className="p-3.5 rounded-xl border border-amber-100 bg-amber-50/10 text-slate-500 italic text-center text-xs font-semibold">
                              Draft comment — not included in final report
                            </div>
                          ) : (
                            <div className="p-3.5 rounded-xl border border-dashed border-slate-200 bg-slate-50/20 text-slate-400 italic text-center text-xs font-semibold">
                              No final comment yet
                            </div>
                          )}
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Page Footer Notice inside report card wrapper */}
            <div className="bg-slate-50/50 border-t border-slate-100 px-6 py-4 flex items-center justify-between text-[11px] text-slate-400 font-medium">
              <span>This is an internal visual template. No report has been published or shared.</span>
              <span className="font-mono">LAZUARDI LUMINARY</span>
            </div>

          </div>

          {/* Bottom notices */}
          <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 flex items-start gap-2.5 text-xs text-slate-500">
            <Info className="text-slate-400 mt-0.5 shrink-0" size={16} />
            <div className="space-y-1 leading-relaxed">
              <strong className="text-slate-700 font-bold block">Internal Visual Template Only</strong>
              <p>
                Pratinjau di atas tidak dapat dicetak secara resmi atau diekspor sebagai PDF. Seluruh visual dirancang khusus sebagai alat peninjauan desain dan tata letak data internal Guru dan Staf Junior High.
              </p>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
