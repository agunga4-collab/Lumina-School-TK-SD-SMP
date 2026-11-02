import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  FileText, Calendar, Users, Layers, Sparkles, 
  Camera, MessageSquare, Eye, AlertCircle, RefreshCw, CheckCircle2, ShieldAlert 
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useAcademicYear } from '../../../context/AcademicYearContext';
import { db, getClasses, getActiveStudents } from '../../../lib/firebase';
import { getGradeLevelNumber } from '../../../types/elementaryMidtermReport';
import type { Class, Student, User } from '../../../types';
import type { 
  ElementaryMonthlyCurriculumDoc, 
  ElementaryMonthlyStudentScoreDoc 
} from '../../../types/elementaryMonthlyReport';
import { 
  fetchElementaryMonthlyCurriculum, 
  fetchElementaryMonthlyStudentScores,
  getMonthOptionsForAcademicYear,
  formatMonthLabel
} from '../../../services/elementaryMonthlyReportService';
import { getJakartaDefaultMonth } from '../../../services/juniorHighMonthlyReportService';
import { LearningGoalsScoreGrid } from './components/LearningGoalsScoreGrid';
import { ProjectAndPhotoTab } from './components/ProjectAndPhotoTab';
import { NarrativeAndApprovalTab } from './components/NarrativeAndApprovalTab';
import { PublicationTrackingTab } from './components/PublicationTrackingTab';
import { toast } from 'sonner';

export default function ElementaryMonthlyReportPage() {
  const { currentUser, profile } = useAuth();
  const effectiveUser = (currentUser || profile) as User;
  const { activeYear } = useAcademicYear();
  const [searchParams, setSearchParams] = useSearchParams();

  // Role check
  const isAuthorized = React.useMemo(() => {
    if (!effectiveUser) return false;
    const role = (effectiveUser.role || (effectiveUser as any).roleId || '').toUpperCase();
    const unit = (effectiveUser.unitId || (effectiveUser as any).unit || '').toUpperCase();
    if (['SUPER_ADMIN'].includes(role)) return true;
    if (['HEAD_UNIT', 'PRINCIPAL', 'VICE_PRINCIPAL', 'SECRETARY_ELEM', 'COORDINATOR'].includes(role)) {
      return unit === 'ELEMENTARY' || unit === 'ALL' || !unit;
    }
    if (['TEACHER', 'HOMEROOM_TEACHER', 'BK_MENTOR', 'COUNSELOR'].includes(role)) {
      return unit === 'ELEMENTARY' || unit === 'ALL' || !unit;
    }
    return false;
  }, [effectiveUser]);

  // Filters
  const availableYears = React.useMemo(() => {
    const defaults = ['2024/2025', '2025/2026', '2026/2027'];
    if (activeYear && !defaults.includes(activeYear)) {
      return [...defaults, activeYear].sort();
    }
    return defaults;
  }, [activeYear]);

  const urlYear = searchParams.get('academicYear');
  const [selectedYear, setSelectedYear] = React.useState<string>(urlYear || activeYear || '2025/2026');

  const urlSemester = searchParams.get('semester');
  const [selectedSemester, setSelectedSemester] = React.useState<string>(urlSemester === '2' ? '2' : '1');

  // Month options based on year and semester
  const monthOptions = React.useMemo(() => {
    return getMonthOptionsForAcademicYear(selectedYear, selectedSemester);
  }, [selectedYear, selectedSemester]);

  const urlMonth = searchParams.get('month');
  const [selectedMonth, setSelectedMonth] = React.useState<string>(() => {
    if (urlMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(urlMonth)) return urlMonth;
    const defaultYm = getJakartaDefaultMonth();
    const match = monthOptions.find(m => m.value === defaultYm);
    return match ? match.value : monthOptions[0]?.value || defaultYm;
  });

  // Classes & Student state
  const [classesList, setClassesList] = React.useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = React.useState<string>('');
  const [loadingClasses, setLoadingClasses] = React.useState<boolean>(true);

  const [students, setStudents] = React.useState<Student[]>([]);
  const [loadingStudents, setLoadingStudents] = React.useState<boolean>(false);

  // Curriculum & Scores
  const [curriculumDoc, setCurriculumDoc] = React.useState<ElementaryMonthlyCurriculumDoc | null>(null);
  const [studentScoresMap, setStudentScoresMap] = React.useState<Record<string, ElementaryMonthlyStudentScoreDoc>>({});
  const [loadingData, setLoadingData] = React.useState<boolean>(false);

  // Tab state (4 tabs: GOALS, PROJECTS, NARRATIVE, PUBLISH)
  const [activeTab, setActiveTab] = React.useState<'GOALS' | 'PROJECTS' | 'NARRATIVE' | 'PUBLISH'>('GOALS');

  // Load Elementary Grade 1-3 Classes
  React.useEffect(() => {
    const fetchClasses = async () => {
      setLoadingClasses(true);
      try {
        const all = await getClasses();
        const raw = Array.isArray(all) ? all : [];
        const filtered = raw.filter(c => {
          if (!c) return false;
          const isElem = c.unitId === 'ELEMENTARY';
          const isYear = c.academicYear === selectedYear;
          const isNotArchived = c.status !== 'archived';
          const grade = getGradeLevelNumber(c);
          return isElem && isYear && isNotArchived && [1, 2, 3].includes(grade);
        });

        // Sort by grade, then name
        filtered.sort((a, b) => {
          const gA = getGradeLevelNumber(a);
          const gB = getGradeLevelNumber(b);
          if (gA !== gB) return gA - gB;
          return a.name.localeCompare(b.name);
        });

        setClassesList(filtered);

        const urlClass = searchParams.get('classId');
        if (urlClass && filtered.some(c => c.id === urlClass)) {
          setSelectedClassId(urlClass);
        } else if (filtered.length > 0) {
          if (selectedClassId && filtered.some(c => c.id === selectedClassId)) {
            // Keep existing
          } else {
            setSelectedClassId(filtered[0].id);
          }
        } else {
          setSelectedClassId('');
        }
      } catch (err) {
        console.error("Error loading Elementary Grade 1-3 classes:", err);
      } finally {
        setLoadingClasses(false);
      }
    };

    fetchClasses();
  }, [selectedYear]);

  // Sync URL search params
  React.useEffect(() => {
    if (loadingClasses) return;
    const params = new URLSearchParams(searchParams);
    params.set('academicYear', selectedYear);
    params.set('semester', selectedSemester);
    params.set('month', selectedMonth);
    if (selectedClassId) {
      params.set('classId', selectedClassId);
    } else {
      params.delete('classId');
    }
    setSearchParams(params, { replace: true });
  }, [selectedYear, selectedSemester, selectedMonth, selectedClassId, loadingClasses]);

  // Load Students
  React.useEffect(() => {
    if (!selectedClassId || !selectedYear) {
      setStudents([]);
      return;
    }

    let isMounted = true;
    setLoadingStudents(true);
    getActiveStudents(selectedClassId, selectedYear)
      .then(list => {
        if (!isMounted) return;
        const sorted = (list || []).sort((a, b) => {
          const noA = a.attendanceNumber ?? a.noAbsen ?? 999;
          const noB = b.attendanceNumber ?? b.noAbsen ?? 999;
          if (noA !== noB) return noA - noB;
          return a.name.localeCompare(b.name);
        });
        setStudents(sorted);
      })
      .catch(err => {
        console.error("Error loading students:", err);
        if (isMounted) setStudents([]);
      })
      .finally(() => {
        if (isMounted) setLoadingStudents(false);
      });

    return () => { isMounted = false; };
  }, [selectedClassId, selectedYear]);

  // Load Curriculum and Scores for active context
  const loadCurriculumAndScores = React.useCallback(async (silent = false) => {
    if (!selectedClassId || !selectedYear || !selectedSemester || !selectedMonth) {
      setCurriculumDoc(null);
      setStudentScoresMap({});
      return;
    }

    if (!silent) setLoadingData(true);
    try {
      const [curric, scores] = await Promise.all([
        fetchElementaryMonthlyCurriculum(selectedClassId, selectedYear, selectedSemester, selectedMonth),
        fetchElementaryMonthlyStudentScores(selectedClassId, selectedYear, selectedSemester, selectedMonth)
      ]);
      setCurriculumDoc(curric);
      setStudentScoresMap(scores);
    } catch (err) {
      console.error("Error loading monthly report data:", err);
      toast.error('Gagal memuat data Monthly Report.');
    } finally {
      if (!silent) setLoadingData(false);
    }
  }, [selectedClassId, selectedYear, selectedSemester, selectedMonth]);

  React.useEffect(() => {
    loadCurriculumAndScores();
  }, [loadCurriculumAndScores]);

  const selectedClass = classesList.find(c => c.id === selectedClassId) || null;
  const monthLabel = formatMonthLabel(selectedMonth);

  if (!isAuthorized) {
    return (
      <div className="p-8 max-w-lg mx-auto my-12 bg-white rounded-3xl border border-red-200 shadow-sm text-center space-y-4">
        <div className="w-14 h-14 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
          <ShieldAlert size={28} />
        </div>
        <h2 className="text-base font-bold text-slate-900">Akses Ditolak</h2>
        <p className="text-xs text-slate-500">
          Modul Monthly Report Elementary Grade 1–3 hanya dapat diakses oleh Guru Kelas, Guru Pengajar Elementary, dan Manajemen Sekolah yang berwenang.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Page Title & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800">
              Elementary Grade 1–3
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-500 font-semibold">{monthLabel}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-1">
            Monthly Report (Lower Grade)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manajemen capaian Learning Goals dan penilaian bulanan siswa jenjang Elementary Grade 1, 2, dan 3.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadCurriculumAndScores()}
          disabled={loadingData}
          className="self-start sm:self-auto px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw size={14} className={loadingData ? 'animate-spin text-emerald-600' : ''} />
          <span>Muat Ulang Data</span>
        </button>
      </div>

      {/* Top Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Academic Year */}
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
            Tahun Ajaran
          </label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="w-full text-xs font-semibold px-3 py-2.5 border border-slate-300 rounded-xl bg-slate-50/50 hover:bg-white focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
          >
            {availableYears.map(yr => (
              <option key={yr} value={yr}>{yr}</option>
            ))}
          </select>
        </div>

        {/* Semester */}
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
            Semester
          </label>
          <select
            value={selectedSemester}
            onChange={(e) => {
              const sem = e.target.value;
              setSelectedSemester(sem);
              const opts = getMonthOptionsForAcademicYear(selectedYear, sem);
              if (opts.length > 0) {
                setSelectedMonth(opts[0].value);
              }
            }}
            className="w-full text-xs font-semibold px-3 py-2.5 border border-slate-300 rounded-xl bg-slate-50/50 hover:bg-white focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
          >
            <option value="1">Semester 1 (Ganjil)</option>
            <option value="2">Semester 2 (Genap)</option>
          </select>
        </div>

        {/* Month */}
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
            Bulan Penilaian (YYYY-MM)
          </label>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-full text-xs font-semibold px-3 py-2.5 border border-slate-300 rounded-xl bg-slate-50/50 hover:bg-white focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
          >
            {monthOptions.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* Grade 1-3 Classes */}
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
            Kelas (Grade 1 – 3)
          </label>
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            disabled={loadingClasses || classesList.length === 0}
            className="w-full text-xs font-semibold px-3 py-2.5 border border-slate-300 rounded-xl bg-slate-50/50 hover:bg-white focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
          >
            {classesList.length === 0 ? (
              <option value="">Tidak ada kelas Grade 1-3</option>
            ) : (
              classesList.map(c => {
                const gr = getGradeLevelNumber(c);
                return (
                  <option key={c.id} value={c.id}>
                    {c.name} (Grade {gr})
                  </option>
                );
              })
            )}
          </select>
        </div>
      </div>

      {/* 4 Tabs Header */}
      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto pb-1">
        {/* Tab 1: Learning Goals & Nilai (ACTIVE) */}
        <button
          type="button"
          onClick={() => setActiveTab('GOALS')}
          className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 border-b-2 ${
            activeTab === 'GOALS'
              ? 'border-emerald-600 text-emerald-800 bg-emerald-50/50'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Layers size={16} />
          <span>Learning Goals &amp; Nilai</span>
        </button>

        {/* Tab 2: Proyek & Foto (ACTIVE) */}
        <button
          type="button"
          onClick={() => setActiveTab('PROJECTS')}
          className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 border-b-2 ${
            activeTab === 'PROJECTS'
              ? 'border-emerald-600 text-emerald-800 bg-emerald-50/50'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Camera size={16} />
          <span>Proyek &amp; Foto</span>
        </button>

        {/* Tab 3: Narasi & Approval (ACTIVE) */}
        <button
          type="button"
          onClick={() => setActiveTab('NARRATIVE')}
          className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 border-b-2 ${
            activeTab === 'NARRATIVE'
              ? 'border-emerald-600 text-emerald-800 bg-emerald-50/50'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <MessageSquare size={16} />
          <span>Narasi &amp; Approval</span>
        </button>

        {/* Tab 4: Preview & Publikasi (ACTIVE) */}
        <button
          type="button"
          onClick={() => setActiveTab('PUBLISH')}
          className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 border-b-2 ${
            activeTab === 'PUBLISH'
              ? 'border-emerald-600 text-emerald-800 bg-emerald-50/50'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Eye size={16} />
          <span>Preview &amp; Publikasi</span>
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'GOALS' ? (
        loadingData || loadingStudents ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 space-y-3">
            <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-500 font-medium">Memuat data kurikulum dan nilai siswa...</p>
          </div>
        ) : (
          <LearningGoalsScoreGrid
            curriculumDoc={curriculumDoc}
            studentScoresMap={studentScoresMap}
            students={students}
            selectedClass={selectedClass}
            selectedYear={selectedYear}
            selectedSemester={selectedSemester}
            selectedMonth={selectedMonth}
            monthLabel={monthLabel}
            allElementaryClasses={classesList}
            currentUser={effectiveUser}
            onRefreshData={() => loadCurriculumAndScores(true)}
          />
        )
      ) : activeTab === 'PROJECTS' ? (
        <ProjectAndPhotoTab
          selectedClass={selectedClass}
          selectedYear={selectedYear}
          selectedSemester={selectedSemester}
          selectedMonth={selectedMonth}
          monthLabel={monthLabel}
          students={students}
          currentUser={effectiveUser}
        />
      ) : activeTab === 'NARRATIVE' ? (
        <NarrativeAndApprovalTab
          curriculumDoc={curriculumDoc}
          studentScoresMap={studentScoresMap}
          students={students}
          selectedClass={selectedClass}
          selectedYear={selectedYear}
          selectedSemester={selectedSemester}
          selectedMonth={selectedMonth}
          monthLabel={monthLabel}
          currentUser={effectiveUser}
          onRefreshData={() => loadCurriculumAndScores(true)}
        />
      ) : (
        <PublicationTrackingTab
          curriculumDoc={curriculumDoc}
          studentScoresMap={studentScoresMap}
          students={students}
          selectedClass={selectedClass}
          selectedYear={selectedYear}
          selectedSemester={selectedSemester}
          selectedMonth={selectedMonth}
          monthLabel={monthLabel}
          currentUser={effectiveUser}
          onRefreshData={() => loadCurriculumAndScores(true)}
        />
      )}
    </div>
  );
}
