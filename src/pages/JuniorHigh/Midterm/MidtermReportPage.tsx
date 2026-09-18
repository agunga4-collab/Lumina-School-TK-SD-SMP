import * as React from 'react';
import { 
  FileText, Calendar, Users, Layers, Sparkles, 
  Upload, FileCheck2, RefreshCw, AlertCircle, CheckCircle2 
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useAcademicYear } from '../../../context/AcademicYearContext';
import { db, getClasses, getActiveStudents, getReportConfig } from '../../../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { useJHReportAttendance } from '../../../hooks/useJHReportAttendance';
import { 
  fetchMidtermMasterGoals, 
  fetchMidtermStudentData, 
  fetchPublishedMidtermReports,
  normalizeMidtermStudentData
} from '../../../services/juniorHighMidtermService';
import { MidtermLearningGoalsTab } from './MidtermLearningGoalsTab';
import { MidtermGeneralCommentsTab } from './MidtermGeneralCommentsTab';
import { MidtermPublishPdfTab } from './MidtermPublishPdfTab';
import { MidtermRekapTab } from './MidtermRekapTab';
import type { 
  MidtermMasterGoalDoc, 
  MidtermStudentDataDoc, 
  PublishedMidtermReport 
} from '../../../types/midtermReport';
import type { Class, Student, ReportConfig, User } from '../../../types';

class MidtermErrorBoundary extends React.Component<
  { children: React.ReactNode; isSuperAdmin: boolean },
  { hasError: boolean; error: Error | null; errorInfo: React.ErrorInfo | null }
> {
  constructor(props: { children: React.ReactNode; isSuperAdmin: boolean }) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    console.error("Midterm Modul Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 max-w-2xl mx-auto my-12 bg-white rounded-3xl border border-red-200 shadow-sm text-center space-y-6">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
            <svg className="w-8 h-8 fill-none stroke-current" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">
              Midterm Report mengalami kendala saat memuat data.
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Beberapa konfigurasi data atau sinkronisasi dokumen terhambat. Silakan lakukan muat ulang.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row justify-center gap-3">
            <button 
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-2xl transition-all uppercase tracking-wider cursor-pointer"
            >
              Muat Ulang
            </button>
            {this.props.isSuperAdmin && (
              <button 
                onClick={() => {
                  const info = `Error: ${this.state.error?.message}\nStack: ${this.state.error?.stack}\nComponent Stack: ${this.state.errorInfo?.componentStack}`;
                  navigator.clipboard.writeText(info);
                  alert("Detail diagnosik berhasil disalin!");
                }}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-2xl transition-all uppercase tracking-wider border border-slate-200 cursor-pointer"
              >
                Salin Detail Diagnostik
              </button>
            )}
          </div>
          {this.props.isSuperAdmin && this.state.error && (
            <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200 text-left overflow-auto max-h-48 text-[10px] font-mono text-slate-600">
              <div className="font-bold text-red-600 mb-1">Developer Stacktrace:</div>
              {this.state.error.message}
              <pre className="mt-2 text-[9px] leading-tight whitespace-pre">{this.state.error.stack}</pre>
            </div>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

export default function MidtermReportPage() {
  const { currentUser, profile } = useAuth();
  const effectiveUser = (currentUser || profile) as User;
  const { academicYears, activeAcademicYear } = useAcademicYear();

  // Primary Context Filters
  const [selectedYear, setSelectedYear] = React.useState<string>(activeAcademicYear?.name || '2025/2026');
  const [selectedSemester, setSelectedSemester] = React.useState<string>('1');
  const [selectedTerm, setSelectedTerm] = React.useState<string>('1');
  const [activeTab, setActiveTab] = React.useState<'GOALS' | 'COMMENTS' | 'PUBLISH' | 'REKAP'>('GOALS');

  // Classes & Selection
  const [classesList, setClassesList] = React.useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = React.useState<string>('');
  const [loadingClasses, setLoadingClasses] = React.useState<boolean>(true);

  // Class Students & Report Config
  const [students, setStudents] = React.useState<Student[]>([]);
  const [reportConfig, setReportConfig] = React.useState<ReportConfig | null>(null);
  const [homeroomTeacherProfile, setHomeroomTeacherProfile] = React.useState<{ displayName: string; niy?: string; signatureUrl?: string | null } | null>(null);

  // Midterm Data Models
  const [masterGoalsMap, setMasterGoalsMap] = React.useState<Record<string, MidtermMasterGoalDoc>>({});
  const [studentDataMap, setStudentDataMap] = React.useState<Record<string, MidtermStudentDataDoc>>({});
  const [publishedReports, setPublishedReports] = React.useState<PublishedMidtermReport[]>([]);
  const [loadingData, setLoadingData] = React.useState<boolean>(false);

  // Sync active academic year on mount
  React.useEffect(() => {
    if (activeAcademicYear?.name) {
      setSelectedYear(activeAcademicYear.name);
    }
  }, [activeAcademicYear]);

  // Load Junior High Classes
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

          return activeClassKeys.has(c.id) || activeClassKeys.has(c.name) || ((c as any).classId && activeClassKeys.has((c as any).classId));
        });

        setClassesList(jhClasses);
        if (jhClasses.length > 0) {
          // If previous selection is valid keep it, else select first
          if (!jhClasses.some(c => c.id === selectedClassId)) {
            setSelectedClassId(jhClasses[0].id);
          }
        } else {
          setSelectedClassId('');
        }
      } catch (err) {
        console.error('Error loading Junior High classes:', err);
      } finally {
        setLoadingClasses(false);
      }
    };
    fetchJHClasses();
  }, [selectedYear]);

  const selectedClass = classesList.find(c => c.id === selectedClassId) || null;

  // Read-only attendance resolution
  const activeStudentIds = React.useMemo(() => students.map(s => s.id), [students]);
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const { studentAttendanceMap } = useJHReportAttendance({
    selectedClassId,
    selectedClassName: selectedClass?.name,
    selectedYear,
    selectedSemester,
    selectedMonth: currentMonthStr,
    studentIds: activeStudentIds
  });

  // Load students and data for selected class
  const loadClassData = React.useCallback(async () => {
    if (!selectedClassId || !selectedYear) return;
    setLoadingData(true);
    try {
      // 1. Fetch active students in class
      const [studentList, config, goals, sData, published] = await Promise.all([
        getActiveStudents(selectedClassId, selectedYear),
        getReportConfig('JUNIOR_HIGH'),
        fetchMidtermMasterGoals(selectedClassId, selectedYear, selectedSemester, selectedTerm),
        fetchMidtermStudentData(selectedClassId, selectedYear, selectedSemester, selectedTerm),
        fetchPublishedMidtermReports({
          classId: selectedClassId,
          academicYear: selectedYear,
          semester: selectedSemester,
          midtermTerm: selectedTerm
        })
      ]);

      const sortedStudents = (studentList || []).sort((a, b) => {
        const numA = a.attendanceNumber ?? (a as any).noAbsen ?? 999;
        const numB = b.attendanceNumber ?? (b as any).noAbsen ?? 999;
        if (numA !== numB) return numA - numB;
        return a.name.localeCompare(b.name);
      });

      const fullStudentDataMap: Record<string, MidtermStudentDataDoc> = {};
      sortedStudents.forEach(student => {
        const existing = sData[student.id];
        fullStudentDataMap[student.id] = existing || normalizeMidtermStudentData(null, {
          studentId: student.id,
          studentName: student.name,
          classId: selectedClassId,
          academicYear: selectedYear,
          semester: selectedSemester,
          midtermTerm: selectedTerm
        });
      });

      setStudents(sortedStudents);
      setReportConfig(config);
      setMasterGoalsMap(goals);
      setStudentDataMap(fullStudentDataMap);
      setPublishedReports(published);

      // Load homeroom teacher profile if available
      if (selectedClass?.homeroomTeacherId) {
        try {
          const uSnap = await getDoc(doc(db, 'users', selectedClass.homeroomTeacherId));
          if (uSnap.exists()) {
            const uData = uSnap.data();
            setHomeroomTeacherProfile({
              displayName: uData.displayName || uData.name || selectedClass.homeroomTeacherName || 'Homeroom Teacher',
              niy: uData.niy,
              signatureUrl: uData.signatureUrl
            });
          }
        } catch (e) {
          console.warn('Could not load homeroom user profile', e);
        }
      }
    } catch (err) {
      console.error('Error loading midterm class data:', err);
    } finally {
      setLoadingData(false);
    }
  }, [selectedClassId, selectedYear, selectedSemester, selectedTerm, selectedClass]);

  React.useEffect(() => {
    loadClassData();
  }, [loadClassData]);

  const publishedMap = React.useMemo(() => {
    const map: Record<string, PublishedMidtermReport> = {};
    const list = Array.isArray(publishedReports) ? publishedReports : [];
    for (const rep of list) {
      if (rep && rep.studentId) {
        if (!map[rep.studentId] || rep.version > map[rep.studentId].version) {
          map[rep.studentId] = rep;
        }
      }
    }
    return map;
  }, [publishedReports]);

  return (
    <MidtermErrorBoundary isSuperAdmin={profile?.role === 'super_admin'}>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header Banner */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-sm">
              <FileText size={20} className="text-emerald-400" />
            </span>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase">
                Midterm Report
              </h1>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">
                Lazuardi GCS Junior High — Progress Report Management & Publishing
              </p>
            </div>
          </div>
        </div>

        {/* Global Context Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Academic Year */}
          <div className="flex flex-col">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Tahun Ajaran
            </label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="text-xs font-bold px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            >
              {academicYears.length > 0 ? (
                academicYears.map(y => (
                  <option key={y.id} value={y.name}>{y.name}</option>
                ))
              ) : (
                <>
                  <option value="2025/2026">2025/2026</option>
                  <option value="2026/2027">2026/2027</option>
                </>
              )}
            </select>
          </div>

          {/* Semester */}
          <div className="flex flex-col">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Semester
            </label>
            <select
              value={selectedSemester}
              onChange={(e) => setSelectedSemester(e.target.value)}
              className="text-xs font-bold px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            >
              <option value="1">Semester 1</option>
              <option value="2">Semester 2</option>
            </select>
          </div>

          {/* Midterm Term */}
          <div className="flex flex-col">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Periode Midterm
            </label>
            <select
              value={selectedTerm}
              onChange={(e) => setSelectedTerm(e.target.value)}
              className="text-xs font-bold px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            >
              <option value="1">Midterm 1</option>
              <option value="2">Midterm 2</option>
            </select>
          </div>

          {/* Class Selector */}
          <div className="flex flex-col">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Kelas Junior High
            </label>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              disabled={loadingClasses || classesList.length === 0}
              className="text-xs font-bold px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 min-w-[140px]"
            >
              {classesList.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Refresh button */}
          <div className="flex flex-col justify-end">
            <button
              onClick={() => loadClassData()}
              disabled={loadingData}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all disabled:opacity-50 mt-auto"
              title="Refresh Data"
            >
              <RefreshCw size={15} className={loadingData ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Tabs (4 main tabs) */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('GOALS')}
          className={`px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'GOALS'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Layers size={15} className={activeTab === 'GOALS' ? 'text-emerald-400' : 'text-slate-400'} />
          1. Learning Goals & Remarks
        </button>

        <button
          onClick={() => setActiveTab('COMMENTS')}
          className={`px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'COMMENTS'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Sparkles size={15} className={activeTab === 'COMMENTS' ? 'text-emerald-400' : 'text-slate-400'} />
          2. General Comments (AI)
        </button>

        <button
          onClick={() => setActiveTab('PUBLISH')}
          className={`px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'PUBLISH'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Upload size={15} className={activeTab === 'PUBLISH' ? 'text-emerald-400' : 'text-slate-400'} />
          3. Publish PDF
        </button>

        <button
          onClick={() => setActiveTab('REKAP')}
          className={`px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'REKAP'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <FileCheck2 size={15} className={activeTab === 'REKAP' ? 'text-emerald-400' : 'text-slate-400'} />
          4. Rekap Publikasi & Open Tracking
        </button>
      </div>

      {/* Main Tab Content */}
      {classesList.length === 0 && !loadingClasses ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-3 shadow-xs">
          <AlertCircle size={32} className="mx-auto text-amber-500" />
          <h3 className="text-base font-bold text-slate-900 uppercase">
            Tidak Ada Kelas Junior High Aktif
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Tidak ditemukan kelas Junior High dengan siswa aktif pada tahun ajaran {selectedYear}. Silakan pastikan kelas dan enrollment siswa telah dikonfigurasi di sistem.
          </p>
        </div>
      ) : (
        <>
          {activeTab === 'GOALS' && (
            <MidtermLearningGoalsTab
              currentUser={effectiveUser}
              selectedClass={selectedClass}
              students={students}
              academicYear={selectedYear}
              semester={selectedSemester}
              midtermTerm={selectedTerm}
              masterGoalsMap={masterGoalsMap}
              studentDataMap={studentDataMap}
              onRefreshData={loadClassData}
              loading={loadingData}
            />
          )}

          {activeTab === 'COMMENTS' && (
            <MidtermGeneralCommentsTab
              currentUser={effectiveUser}
              selectedClass={selectedClass}
              students={students}
              academicYear={selectedYear}
              semester={selectedSemester}
              midtermTerm={selectedTerm}
              studentDataMap={studentDataMap}
              onRefreshData={loadClassData}
              loading={loadingData}
            />
          )}

          {activeTab === 'PUBLISH' && (
            <MidtermPublishPdfTab
              currentUser={effectiveUser}
              selectedClass={selectedClass}
              students={students}
              academicYear={selectedYear}
              semester={selectedSemester}
              midtermTerm={selectedTerm}
              masterGoalsMap={masterGoalsMap}
              studentDataMap={studentDataMap}
              publishedReportsMap={publishedMap}
              studentAttendanceMap={studentAttendanceMap}
              reportConfig={reportConfig}
              homeroomTeacherProfile={homeroomTeacherProfile}
              onRefreshData={loadClassData}
              loading={loadingData}
            />
          )}

          {activeTab === 'REKAP' && (
            <MidtermRekapTab
              currentUser={effectiveUser}
              classes={classesList}
              selectedClassId={selectedClassId}
              onSelectClassId={(id) => setSelectedClassId(id)}
              students={students}
              academicYear={selectedYear}
              semester={selectedSemester}
              midtermTerm={selectedTerm}
              publishedReports={publishedReports}
              loading={loadingData}
              onRefreshData={loadClassData}
            />
          )}
        </>
      )}
    </div>
    </MidtermErrorBoundary>
  );
}
