import * as React from 'react';
import { Component } from 'react';
import { 
  FileText, Calendar, Users, Layers, Sparkles, 
  Upload, FileCheck2, RefreshCw, AlertCircle, CheckCircle2 
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useAcademicYear } from '../../../context/AcademicYearContext';
import { db, getClasses, getActiveStudents, getReportConfig } from '../../../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { 
  fetchElementaryMidtermMasterGoals, 
  fetchElementaryMidtermStudentData, 
  fetchPublishedElementaryMidtermReports,
  normalizeElementaryMidtermStudentData
} from '../../../services/elementaryMidtermService';
import { ElementaryMidtermLearningGoalsTab } from './ElementaryMidtermLearningGoalsTab';
import { ElementaryMidtermGeneralCommentsTab } from './ElementaryMidtermGeneralCommentsTab';
import { ElementaryReviewApprovalGenComTab } from './ElementaryReviewApprovalGenComTab';
import { ElementaryMidtermPublishPdfTab } from './ElementaryMidtermPublishPdfTab';
import { ElementaryMidtermRekapTab } from './ElementaryMidtermRekapTab';
import type { 
  ElementaryMidtermMasterGoalDoc, 
  ElementaryMidtermStudentDataDoc, 
  PublishedElementaryMidtermReport 
} from '../../../types/elementaryMidtermReport';
import type { Class, Student, ReportConfig, User } from '../../../types';

class ElementaryMidtermErrorBoundary extends Component<any, any> {
  props: any;
  state: any;
  setState: any;

  constructor(props: any) {
    super(props);
    this.props = props;
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    console.error("Elementary Midterm Module Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 max-w-2xl mx-auto my-12 bg-white rounded-3xl border border-red-200 shadow-sm text-center space-y-6">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
            <AlertCircle size={32} />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">
              Midterm Elementary Report mengalami kendala saat memuat data.
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
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function ElementaryMidtermReportPageContent() {
  const { currentUser, profile } = useAuth();
  const effectiveUser = (currentUser || profile) as User;
  const { activeYear } = useAcademicYear();

  const availableYears = React.useMemo(() => {
    const defaults = ['2024/2025', '2025/2026', '2026/2027'];
    if (activeYear && !defaults.includes(activeYear)) {
      return [...defaults, activeYear].sort();
    }
    return defaults;
  }, [activeYear]);

  // Primary Context Filters
  const [selectedYear, setSelectedYear] = React.useState<string>(activeYear || '2025/2026');
  const [selectedSemester, setSelectedSemester] = React.useState<string>('1');
  const [selectedTerm, setSelectedTerm] = React.useState<string>('1');
  const [activeTab, setActiveTab] = React.useState<'GOALS' | 'COMMENTS' | 'REVIEW' | 'PUBLISH' | 'REKAP'>('GOALS');

  // Classes & Selection
  const [classesList, setClassesList] = React.useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = React.useState<string>('');
  const [loadingClasses, setLoadingClasses] = React.useState<boolean>(true);

  // Class Students & Report Config
  const [students, setStudents] = React.useState<Student[]>([]);
  const [reportConfig, setReportConfig] = React.useState<ReportConfig | null>(null);
  const [homeroomTeacherProfile, setHomeroomTeacherProfile] = React.useState<{ displayName: string; niy?: string; signatureUrl?: string | null } | null>(null);
  const [elementaryLogoUrl, setElementaryLogoUrl] = React.useState<string | null>(null);

  // Fetch Elementary logo from settings/logos or localStorage
  React.useEffect(() => {
    const fetchElementaryLogo = async () => {
      try {
        const logoDoc = await getDoc(doc(db, 'settings', 'logos'));
        if (logoDoc.exists()) {
          const data = logoDoc.data() as any;
          if (data?.ELEMENTARY?.rectangular) {
            setElementaryLogoUrl(data.ELEMENTARY.rectangular);
            return;
          }
        }
        const localLogos = localStorage.getItem('lumina_school_logos');
        if (localLogos) {
          const parsed = JSON.parse(localLogos);
          if (parsed?.ELEMENTARY?.rectangular) {
            setElementaryLogoUrl(parsed.ELEMENTARY.rectangular);
            return;
          }
        }
      } catch (e) {
        console.warn("Failed to fetch Elementary logo in ElementaryMidtermReportPage:", e);
        const localLogos = localStorage.getItem('lumina_school_logos');
        if (localLogos) {
          try {
            const parsed = JSON.parse(localLogos);
            if (parsed?.ELEMENTARY?.rectangular) {
              setElementaryLogoUrl(parsed.ELEMENTARY.rectangular);
            }
          } catch (_) {}
        }
      }
    };
    fetchElementaryLogo();
  }, []);

  // Midterm Data Models
  const [masterGoalsMap, setMasterGoalsMap] = React.useState<Record<string, ElementaryMidtermMasterGoalDoc>>({});
  const [studentDataMap, setStudentDataMap] = React.useState<Record<string, ElementaryMidtermStudentDataDoc>>({});
  const [publishedReports, setPublishedReports] = React.useState<PublishedElementaryMidtermReport[]>([]);
  const [loadingData, setLoadingData] = React.useState<boolean>(false);

  // Sync active academic year on change
  React.useEffect(() => {
    if (activeYear) {
      setSelectedYear(activeYear);
    }
  }, [activeYear]);

  // Load Elementary Classes
  React.useEffect(() => {
    const fetchElementaryClasses = async () => {
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
        if (enrollmentsSnap && Array.isArray(enrollmentsSnap.docs)) {
          enrollmentsSnap.docs.forEach(d => {
            const e = d.data();
            if (e && e.classId) activeClassKeys.add(e.classId);
          });
        }

        const rawClasses = Array.isArray(all) ? all : [];
        const elemClasses = rawClasses.filter(c => {
          if (!c) return false;
          const isElem = c.unitId === 'ELEMENTARY';
          const isActiveYear = c.academicYear === selectedYear;
          const isNotArchived = c.status !== 'archived';
          return isElem && isActiveYear && isNotArchived;
        });

        setClassesList(elemClasses);
        if (elemClasses.length > 0) {
          if (!elemClasses.some(c => c && c.id === selectedClassId)) {
            setSelectedClassId(elemClasses[0].id);
          }
        } else {
          setSelectedClassId('');
        }
      } catch (err) {
        console.error('Error loading Elementary classes:', err);
      } finally {
        setLoadingClasses(false);
      }
    };
    fetchElementaryClasses();
  }, [selectedYear]);

  const safeClassesList = Array.isArray(classesList) ? classesList.filter(Boolean) : [];
  const selectedClass = safeClassesList.find(c => c.id === selectedClassId) || null;

  // Load class data
  const loadClassData = React.useCallback(async (silent = false) => {
    if (!selectedClassId || !selectedYear) return;
    if (!silent) setLoadingData(true);
    try {
      const [studentList, config, goals, sData, published] = await Promise.all([
        getActiveStudents(selectedClassId, selectedYear),
        getReportConfig('ELEMENTARY'),
        fetchElementaryMidtermMasterGoals(selectedClassId, selectedYear, selectedSemester, selectedTerm),
        fetchElementaryMidtermStudentData(selectedClassId, selectedYear, selectedSemester, selectedTerm),
        fetchPublishedElementaryMidtermReports({
          classId: selectedClassId,
          academicYear: selectedYear,
          semester: selectedSemester,
          midtermTerm: selectedTerm
        })
      ]);

      const rawStudentList = Array.isArray(studentList) ? studentList.filter(Boolean) : [];
      const sortedStudents = rawStudentList.sort((a, b) => {
        const numA = a.attendanceNumber ?? (a as any).noAbsen ?? 999;
        const numB = b.attendanceNumber ?? (b as any).noAbsen ?? 999;
        if (numA !== numB) return numA - numB;
        const nameA = typeof a.name === 'string' ? a.name : '';
        const nameB = typeof b.name === 'string' ? b.name : '';
        return nameA.localeCompare(nameB);
      });

      const safeSData = sData && typeof sData === 'object' ? sData : {};
      const fullStudentDataMap: Record<string, ElementaryMidtermStudentDataDoc> = {};
      sortedStudents.forEach(student => {
        if (!student || !student.id) return;
        const existing = safeSData[student.id];
        fullStudentDataMap[student.id] = existing || normalizeElementaryMidtermStudentData(null, {
          studentId: student.id,
          studentName: student.name || 'Siswa',
          classId: selectedClassId,
          academicYear: selectedYear,
          semester: selectedSemester,
          midtermTerm: selectedTerm
        });
      });

      setStudents(sortedStudents);
      setReportConfig(config || null);
      setMasterGoalsMap(goals && typeof goals === 'object' ? goals : {});
      setStudentDataMap(fullStudentDataMap);
      setPublishedReports(Array.isArray(published) ? published.filter(Boolean) : []);

      // Load Homeroom teacher user profile
      if (selectedClass?.homeroomTeacherId) {
        try {
          const uSnap = await getDoc(doc(db, 'users', selectedClass.homeroomTeacherId));
          if (uSnap.exists()) {
            const uData = uSnap.data();
            setHomeroomTeacherProfile({
              displayName: uData?.displayName || uData?.name || selectedClass.homeroomTeacherName || 'Homeroom Teacher',
              niy: uData?.niy,
              signatureUrl: uData?.signatureUrl
            });
          }
        } catch (e) {
          console.warn('Could not load homeroom user profile', e);
        }
      }
    } catch (err) {
      console.error('Error loading Elementary Midterm class data:', err);
    } finally {
      if (!silent) setLoadingData(false);
    }
  }, [selectedClassId, selectedYear, selectedSemester, selectedTerm, selectedClass]);

  React.useEffect(() => {
    loadClassData();
  }, [loadClassData]);

  return (
    <div className="space-y-6 pb-16">
      {/* Page Header */}
      <div className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-slate-900 p-8 rounded-[2.5rem] text-white shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-500/30">
              Lumina Elementary • Midterm Report
            </span>
            <h1 className="text-2xl font-black tracking-tight uppercase">
              Modul Rapor Midterm Elementary
            </h1>
            <p className="text-xs text-emerald-200/80 font-medium max-w-xl">
              Input Learning Goals, nilai remark (A/D/B), General Comments, approval, serta penerbitan PDF Progress Report.
            </p>
          </div>

          <button
            onClick={loadClassData}
            disabled={loadingData}
            className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-2xl text-xs font-bold uppercase tracking-wider backdrop-blur-md transition-all flex items-center gap-2 border border-white/10 cursor-pointer self-start md:self-auto"
          >
            <RefreshCw size={14} className={loadingData ? "animate-spin" : ""} />
            <span>Refresh Data</span>
          </button>
        </div>

        {/* Filters Header Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-4 border-t border-emerald-700/50">
          {/* Tahun Ajaran */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-emerald-200">
              Tahun Ajaran
            </label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900/80 text-white border border-emerald-500/30 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-400"
            >
              {availableYears.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Semester */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-emerald-200">
              Semester
            </label>
            <select
              value={selectedSemester}
              onChange={(e) => setSelectedSemester(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900/80 text-white border border-emerald-500/30 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-400"
            >
              <option value="1">Semester 1</option>
              <option value="2">Semester 2</option>
            </select>
          </div>

          {/* Term Midterm */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-emerald-200">
              Periode Midterm
            </label>
            <select
              value={selectedTerm}
              onChange={(e) => setSelectedTerm(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900/80 text-white border border-emerald-500/30 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-400"
            >
              <option value="1">Mid Term 1</option>
              <option value="2">Mid Term 2</option>
            </select>
          </div>

          {/* Kelas Elementary */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-emerald-200">
              Kelas Elementary
            </label>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              disabled={loadingClasses || safeClassesList.length === 0}
              className="w-full px-3 py-2 bg-slate-900/80 text-white border border-emerald-500/30 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-50"
            >
              {safeClassesList.length === 0 ? (
                <option value="">Tidak ada kelas SD</option>
              ) : (
                safeClassesList.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))
              )}
            </select>
          </div>
        </div>
      </div>

      {/* Primary Navigation Tabs (5 Steps) */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {[
          { id: 'GOALS', label: '1. Learning Goals & Remarks', icon: Layers },
          { id: 'COMMENTS', label: '2. General Comments (AI)', icon: Sparkles },
          { id: 'REVIEW', label: '3. Review & Approval GenCom', icon: FileText },
          { id: 'PUBLISH', label: '4. Publish PDF', icon: FileCheck2 },
          { id: 'REKAP', label: '5. Rekap Publikasi & Tracking', icon: Users },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-5 py-3 rounded-2xl text-xs font-extrabold uppercase tracking-wider flex items-center gap-2.5 transition-all cursor-pointer ${
                isActive
                  ? 'bg-emerald-800 text-white shadow-md shadow-emerald-900/10'
                  : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200/80 hover:text-slate-900'
              }`}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Tab View Contents */}
      {loadingData ? (
        <div className="p-16 bg-white rounded-3xl border border-slate-200 text-center space-y-4 shadow-xs">
          <RefreshCw size={28} className="animate-spin text-emerald-600 mx-auto" />
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider animate-pulse">
            Memuat data Rapor Midterm Elementary...
          </p>
        </div>
      ) : !selectedClassId ? (
        <div className="p-16 bg-white rounded-3xl border border-slate-200 text-center space-y-3 shadow-xs">
          <AlertCircle size={32} className="text-amber-500 mx-auto" />
          <h3 className="text-sm font-black text-slate-800 uppercase">Tidak Ada Kelas Terpilih</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Silakan pilih kelas Elementary pada filter di atas untuk mulai mengelola Rapor Midterm.
          </p>
        </div>
      ) : (
        <div>
          {activeTab === 'GOALS' && (
            <ElementaryMidtermLearningGoalsTab
              selectedClassId={selectedClassId}
              selectedClass={selectedClass}
              allElementaryClasses={safeClassesList}
              selectedYear={selectedYear}
              selectedSemester={selectedSemester}
              selectedTerm={selectedTerm}
              students={students}
              masterGoalsMap={masterGoalsMap}
              studentDataMap={studentDataMap}
              onRefreshData={loadClassData}
              currentUser={effectiveUser}
            />
          )}

          {activeTab === 'COMMENTS' && (
            <ElementaryMidtermGeneralCommentsTab
              selectedClassId={selectedClassId}
              selectedClass={selectedClass}
              selectedYear={selectedYear}
              selectedSemester={selectedSemester}
              selectedTerm={selectedTerm}
              students={students}
              studentDataMap={studentDataMap}
              onRefreshData={loadClassData}
              currentUser={effectiveUser}
            />
          )}

          {activeTab === 'REVIEW' && (
            <ElementaryReviewApprovalGenComTab
              selectedClassId={selectedClassId}
              selectedClass={selectedClass}
              selectedYear={selectedYear}
              selectedSemester={selectedSemester}
              selectedTerm={selectedTerm}
              students={students}
              studentDataMap={studentDataMap}
              onRefreshData={loadClassData}
              currentUser={effectiveUser}
            />
          )}

          {activeTab === 'PUBLISH' && (
            <ElementaryMidtermPublishPdfTab
              selectedClassId={selectedClassId}
              selectedClass={selectedClass}
              selectedYear={selectedYear}
              selectedSemester={selectedSemester}
              selectedTerm={selectedTerm}
              students={students}
              masterGoalsMap={masterGoalsMap}
              studentDataMap={studentDataMap}
              publishedReports={publishedReports}
              reportConfig={reportConfig}
              logoUrl={elementaryLogoUrl}
              homeroomTeacherProfile={homeroomTeacherProfile}
              onRefreshData={loadClassData}
              currentUser={effectiveUser}
            />
          )}

          {activeTab === 'REKAP' && (
            <ElementaryMidtermRekapTab
              students={students}
              publishedReports={publishedReports}
              selectedClass={selectedClass}
              selectedYear={selectedYear}
              selectedSemester={selectedSemester}
              selectedTerm={selectedTerm}
              onRefreshData={loadClassData}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default function ElementaryMidtermReportPage() {
  const { currentUser } = useAuth();
  return (
    <ElementaryMidtermErrorBoundary isSuperAdmin={currentUser?.role === 'SUPER_ADMIN'}>
      <ElementaryMidtermReportPageContent />
    </ElementaryMidtermErrorBoundary>
  );
}
