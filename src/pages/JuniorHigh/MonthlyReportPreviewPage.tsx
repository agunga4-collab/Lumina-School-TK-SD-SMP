import * as React from 'react';
import { motion } from 'motion/react';
import { 
  FileText, Calendar, Users, RefreshCw, AlertCircle, Info, CheckCircle2, 
  ChevronRight, ArrowRight, ShieldAlert, BadgeHelp, CheckCircle, HelpCircle
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

  // Read-only data
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

  // Read-only data assembly trigger
  const loadReportData = async () => {
    if (!selectedClassId || !selectedYear || !selectedSemester || !selectedMonth) return;

    setLoadingStudents(true);
    setLoadingSummary(true);
    setLoadingComments(true);
    setStudentsError(false);
    setSummaryError(false);
    setCommentsError(false);

    // 1. Fetch active students in class & sort
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

  return (
    <div id="monthly-report-preview-page" className="min-h-screen bg-slate-50/50 p-6">
      {/* Header */}
      <div className="mx-auto max-w-6xl mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#002366]/10 text-[#002366] border border-[#002366]/20">
                JUNIOR HIGH ONLY
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                Internal Preview — Not Published
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <FileText className="text-[#002366]" size={26} />
              Preview & Validasi Rapor Bulanan
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Gunakan workspace ini untuk memvalidasi kelengkapan ringkasan kelas dan komentar per siswa sebelum proses publikasi.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-center">
            <button
              onClick={loadReportData}
              disabled={loadingStudents || loadingSummary || loadingComments}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={15} className={(loadingStudents || loadingSummary || loadingComments) ? 'animate-spin' : ''} />
              Muat Ulang
            </button>
          </div>
        </div>
      </div>

      {/* Context Filters */}
      <div className="mx-auto max-w-6xl bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
              <Calendar size={13} className="text-[#002366]" /> Tahun Ajaran
            </label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full text-sm rounded-lg border-slate-200 focus:border-[#002366] focus:ring-[#002366] py-2 bg-slate-50/50"
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
                  onClick={() => setSelectedSemester(sem)}
                  className={`py-2 text-sm font-semibold rounded-lg border transition-all ${
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
              className="w-full text-sm rounded-lg border-slate-200 focus:border-[#002366] focus:ring-[#002366] py-1.5 bg-slate-50/50"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
              <Users size={13} className="text-[#002366]" /> Kelas Junior High
            </label>
            {loadingClasses ? (
              <div className="h-10 flex items-center px-3 bg-slate-50 rounded-lg text-xs text-slate-400">
                <RefreshCw size={14} className="animate-spin mr-2" />
                Memuat kelas...
              </div>
            ) : (
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="w-full text-sm rounded-lg border-slate-200 focus:border-[#002366] focus:ring-[#002366] py-2 bg-slate-50/50 font-medium"
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
        
        {/* Left Hand: Readiness & Checklist */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="border-b border-slate-150 bg-slate-50/50 px-4 py-3">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <CheckCircle2 size={16} className="text-[#002366]" />
                Pre-Publish Validation
              </h2>
            </div>

            <div className="p-4 space-y-4">
              {/* Readiness status card */}
              <div className={`p-4 rounded-xl border text-center ${
                overallState === 'READY FOR FUTURE PUBLISH'
                  ? 'bg-emerald-50/60 border-emerald-200 text-emerald-800'
                  : overallState === 'CHECKING'
                  ? 'bg-sky-50/50 border-sky-200 text-sky-800'
                  : 'bg-amber-50/50 border-amber-200 text-amber-800'
              }`}>
                <span className="text-[10px] font-bold uppercase tracking-widest block mb-1">Status Kesiapan</span>
                <strong className="text-base font-black tracking-tight">
                  {overallState === 'READY FOR FUTURE PUBLISH' 
                    ? 'READY FOR FUTURE PUBLISH' 
                    : overallState === 'CHECKING'
                    ? 'CHECKING'
                    : 'NOT READY'}
                </strong>
                <p className="text-xs mt-1.5 leading-relaxed font-medium">
                  {overallState === 'READY FOR FUTURE PUBLISH' 
                    ? 'All required report data is complete. This report has not been published.'
                    : overallState === 'CHECKING'
                    ? 'Memeriksa kelengkapan data rapor...'
                    : 'Complete the items below before this report can enter a future publish workflow.'}
                </p>
              </div>

              {/* Step checklist */}
              <div className="space-y-2.5 pt-2">
                {checklist.map(item => {
                  const stateColorClass = (() => {
                    switch (item.state) {
                      case 'Ready': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
                      case 'Missing': return 'bg-rose-100 text-rose-800 border-rose-200';
                      case 'Incomplete': return 'bg-amber-100 text-amber-800 border-amber-200';
                      case 'Unavailable': return 'bg-slate-100 text-slate-600 border-slate-200';
                      case 'Loading': return 'bg-blue-100 text-blue-800 border-blue-200';
                      case 'Error': return 'bg-red-100 text-red-900 border-red-200';
                      default: return 'bg-slate-150 text-slate-700 border-slate-200';
                    }
                  })();

                  const stateIcon = (() => {
                    switch (item.state) {
                      case 'Ready': return <CheckCircle className="text-emerald-500 shrink-0" size={14} />;
                      case 'Missing': return <AlertCircle className="text-rose-500 shrink-0" size={14} />;
                      case 'Incomplete': return <HelpCircle className="text-amber-500 shrink-0" size={14} />;
                      case 'Unavailable': return <HelpCircle className="text-slate-400 shrink-0" size={14} />;
                      case 'Loading': return <RefreshCw className="text-blue-500 animate-spin shrink-0" size={14} />;
                      case 'Error': return <ShieldAlert className="text-red-600 shrink-0" size={14} />;
                      default: return <HelpCircle className="text-slate-400 shrink-0" size={14} />;
                    }
                  })();

                  return (
                    <div key={item.key} className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/50 flex flex-col gap-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          {stateIcon}
                          <span className="font-bold text-slate-700">{item.label}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${stateColorClass}`}>
                          {item.state}
                        </span>
                      </div>
                      {item.reason && (
                        <p className="text-[10px] text-slate-500 leading-normal pl-5 font-medium italic">
                          {item.reason}
                        </p>
                      )}
                    </div>
                  );
                })}

                {/* Counts Panel */}
                <div className="border-t border-slate-100 pt-3 mt-4 space-y-1.5 text-[11px] text-slate-500">
                  <div className="font-bold text-[#002366] uppercase tracking-wider text-[9px] mb-2">
                    Statistik Data
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Siswa Aktif:</span>
                    <strong className="text-slate-700 font-bold">{counts.totalStudents} siswa</strong>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Komentar FINAL:</span>
                    <strong className="text-emerald-700 font-bold">{counts.finalCommentsCount}</strong>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Komentar DRAFT:</span>
                    <strong className="text-amber-700 font-bold">{counts.draftCommentsCount}</strong>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Belum Komentar / Draft:</span>
                    <strong className="text-rose-700 font-bold">{counts.missingFinalCommentsCount}</strong>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Status Kehadiran Periode:</span>
                    <strong className={`font-bold ${counts.attendanceAvailable ? 'text-emerald-700' : 'text-slate-500'}`}>
                      {counts.attendanceAvailable ? 'Tercatat (Tersedia)' : 'Tidak Tersedia'}
                    </strong>
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* Context description card */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 text-xs text-slate-500 space-y-3">
            <h3 className="font-bold text-slate-700 flex items-center gap-1">
              <Info size={14} className="text-[#002366]" /> Informasi Preview
            </h3>
            <p>
              Halaman ini menyatukan data secara read-only untuk melakukan review pra-cetak. Perubahan data tidak dapat dilakukan di sini secara langsung.
            </p>
            <div className="space-y-1.5 pt-2 border-t border-slate-150">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div>
                <span>Ubah Ringkasan di <strong>Report Summary</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div>
                <span>Tulis komentar di <strong>Report Comments</strong></span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Hand: Class Summary Rendering & Students Listing */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Class Summary Container */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="border-b border-slate-150 bg-slate-50/50 px-5 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Review Ringkasan Kelas (Summary)</h3>
                <p className="text-[11px] text-slate-400">Diambil langsung dari workspace ringkasan rapor bulanan kelas.</p>
              </div>
              <button
                onClick={() => navigate('/junior-high/monthly-report')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#002366] hover:underline"
              >
                Edit Summary <ArrowRight size={13} />
              </button>
            </div>

            <div className="p-5">
              {loadingSummary ? (
                <div className="py-6 text-center">
                  <RefreshCw size={20} className="animate-spin text-slate-400 mx-auto mb-2" />
                  <span className="text-xs text-slate-400">Memuat summary...</span>
                </div>
              ) : !classSummary ? (
                <div className="border border-dashed border-slate-200 rounded-xl p-6 text-center bg-slate-50/40">
                  <AlertCircle size={24} className="mx-auto text-amber-500 mb-2" />
                  <p className="text-xs font-semibold text-slate-600">Class summary has not been completed for this context.</p>
                  <p className="text-[10px] text-slate-400 mt-1">Gunakan tautan di kanan atas untuk mengisi ringkasan pembelajaran.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Learning Journey Box */}
                  <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50">
                    <span className="text-[10px] font-bold text-[#002366] uppercase block mb-1">Learning Journey</span>
                    <h4 className="text-sm font-bold text-slate-800">{classSummary.sections?.learningJourney?.title || '-'}</h4>
                    <p className="text-xs text-slate-600 mt-1.5 leading-relaxed whitespace-pre-wrap">
                      {classSummary.sections?.learningJourney?.summary || '-'}
                    </p>
                  </div>

                  {/* Weekly & Unit Activities list rendering */}
                  {classSummary.sections?.weeklyLessonsAndUnitActivities && classSummary.sections.weeklyLessonsAndUnitActivities.length > 0 && (
                    <div className="space-y-3">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Weekly Lessons & Unit Activities</span>
                      <div className="space-y-2">
                        {classSummary.sections.weeklyLessonsAndUnitActivities.map((item, index) => (
                          <div 
                            key={item.id || index}
                            className={`border rounded-lg p-3 text-xs flex gap-3 ${
                              item.category === 'WEEKLY_LESSON' ? 'bg-blue-50/20 border-blue-100' : 'bg-purple-50/10 border-purple-100'
                            }`}
                          >
                            <span className="font-bold text-slate-400 mt-0.5">#{index + 1}</span>
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5">
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                  item.category === 'WEEKLY_LESSON' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                                }`}>
                                  {item.category === 'WEEKLY_LESSON' ? 'WEEKLY' : 'UA'}
                                </span>
                                <strong className="text-slate-800">{item.title}</strong>
                              </div>
                              <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">{item.summary}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Student Comment Assembly List */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="border-b border-slate-150 bg-slate-50/50 px-5 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Assembly Komentar & Kehadiran Siswa</h3>
                <p className="text-[11px] text-slate-400">Roster siswa terurut berdasarkan No. Absen dengan komentar gabungan.</p>
              </div>
              <button
                onClick={() => navigate('/junior-high/monthly-comments')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#002366] hover:underline"
              >
                Tulis Komentar <ArrowRight size={13} />
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {/* Attendance status banner notice */}
              {selectedClassId && selectedYear && selectedSemester && selectedMonth && (
                <div className="px-5 py-3 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs font-semibold text-slate-500 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Calendar size={14} className="text-[#002366]" />
                    <span>Presensi Kehadiran Bulanan</span>
                  </div>
                  <div>
                    {loadingAttendance ? (
                      <span className="inline-flex items-center gap-1.5 text-blue-650">
                        <RefreshCw size={12} className="animate-spin" /> Memuat data presensi...
                      </span>
                    ) : attendanceError ? (
                      attendanceErrorType === 'permission-denied' ? (
                        <span className="text-rose-600 font-bold bg-rose-50 px-2.5 py-0.5 rounded border border-rose-100">
                          Attendance data could not be accessed for this report period.
                        </span>
                      ) : (
                        <span className="text-rose-600 font-bold bg-rose-50 px-2.5 py-0.5 rounded border border-rose-100">
                          Attendance data could not be loaded for this report period.
                        </span>
                      )
                    ) : !attendanceAvailableForPeriod ? (
                      <span className="text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded border border-amber-100">
                        Attendance has not been recorded for this report period.
                      </span>
                    ) : (
                      <span className="text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-100">
                        Attendance is recorded for this period
                      </span>
                    )}
                  </div>
                </div>
              )}

              {loadingStudents || loadingComments ? (
                <div className="py-12 text-center">
                  <RefreshCw size={24} className="animate-spin text-slate-400 mx-auto mb-2" />
                  <span className="text-xs text-slate-400">Assembling roster...</span>
                </div>
              ) : students.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  Tidak ada data siswa dalam kelas ini.
                </div>
              ) : (
                students.map((student, index) => {
                  const commentObj = commentsMap[student.id];
                  const absNum = student.attendanceNumber ?? student.noAbsen ?? student.rollNumber ?? student.rosterNumber ?? (index + 1);
                  const status = commentObj?.status || 'NOT_FOUND';

                  return (
                    <div key={student.id} className="p-5 hover:bg-slate-50/50 transition-colors space-y-3">
                      
                      {/* Student Card Header info */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center font-bold text-xs shrink-0">
                            {absNum}
                          </span>
                          <div>
                            <h4 className="text-sm font-bold text-slate-800">{student.name}</h4>
                            <span className="text-[10px] text-slate-400 font-mono">NIS: {student.id}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-start sm:self-center">
                          {/* Status badge */}
                          {status === 'FINAL' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              FINAL
                            </span>
                          ) : status === 'DRAFT' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              Draft
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-400 border border-slate-200">
                              Belum Diisi
                            </span>
                          )}

                          <button
                            onClick={() => navigate('/junior-high/monthly-comments')}
                            className="p-1 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-700 text-xs font-semibold px-2"
                            title="Tulis atau edit komentar di Workspace Komentar"
                          >
                            Open Comments
                          </button>
                        </div>
                      </div>

                      {/* Attendance labels & placeholders */}
                      <div className="grid grid-cols-3 gap-2 border border-slate-100 rounded-lg p-2.5 bg-slate-50/30 text-xs text-center">
                        <div>
                          <span className="block text-[10px] font-medium text-slate-400">Sick Leave</span>
                          <strong className="text-slate-700">
                            {loadingAttendance ? (
                              <span className="text-slate-300">...</span>
                            ) : attendanceAvailableForPeriod && studentAttendanceMap[student.id] ? (
                              studentAttendanceMap[student.id].sickLeave ?? '-'
                            ) : (
                              '-'
                            )}
                          </strong>
                        </div>
                        <div className="border-x border-slate-100">
                          <span className="block text-[10px] font-medium text-slate-400">Excused Leave</span>
                          <strong className="text-slate-700">
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
                          <span className="block text-[10px] font-medium text-slate-400">Absent</span>
                          <strong className="text-slate-700">
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

                      {/* Comment text rendering wrapper based on status */}
                      <div className="text-xs">
                        {status === 'FINAL' ? (
                          <div className="p-3 rounded-lg border border-slate-100 bg-slate-50/40 text-slate-650 leading-relaxed whitespace-pre-wrap">
                            {commentObj.generalComment}
                          </div>
                        ) : status === 'DRAFT' ? (
                          <div className="p-3 rounded-lg border border-amber-100 bg-amber-50/20 text-slate-500 italic text-center">
                            Draft comment — not included in final report
                          </div>
                        ) : (
                          <div className="p-3 rounded-lg border border-dashed border-slate-200 text-slate-400 italic text-center">
                            No final comment yet
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Data Integrity Notices banner list */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-xs p-5 space-y-2.5">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Data Integrity Notices</h4>
            <div className="space-y-1.5 text-xs text-slate-500">
              {!classSummary && (
                <div className="flex items-center gap-2 text-rose-600 font-medium">
                  <ShieldAlert size={14} />
                  <span>Missing class summary for the selected period.</span>
                </div>
              )}
              {counts.draftCommentsCount > 0 && (
                <div className="flex items-center gap-2 text-amber-600 font-medium">
                  <ShieldAlert size={14} />
                  <span>Draft comments found. Drafts are excluded from the official final reports.</span>
                </div>
              )}
              {counts.missingFinalCommentsCount > 0 && (
                <div className="flex items-center gap-2 text-amber-600 font-medium">
                  <ShieldAlert size={14} />
                  <span>{counts.missingFinalCommentsCount} student(s) do not have a finalized general comment.</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-slate-400">
                <Info size={14} />
                <span>Attendance not connected; values shown as `-`.</span>
              </div>
              <div className="flex items-center gap-2 text-slate-400">
                <Info size={14} />
                <span>This is an internal preview. No report has been published or shared.</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
