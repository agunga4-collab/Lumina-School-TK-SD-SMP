import * as React from 'react';
import { Component } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { 
  FileText, Calendar, Users, Layers, Sparkles, 
  Upload, FileCheck2, RefreshCw, AlertCircle, CheckCircle2 
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useAcademicYear } from '../../../context/AcademicYearContext';
import { db, getClasses, getActiveStudents, getReportConfig } from '../../../lib/firebase';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { useJHReportAttendance } from '../../../hooks/useJHReportAttendance';
import { 
  fetchMidtermMasterGoals, 
  fetchMidtermStudentData, 
  fetchPublishedMidtermReports,
  normalizeMidtermStudentData
} from '../../../services/juniorHighMidtermService';
import { MidtermLearningGoalsTab } from './MidtermLearningGoalsTab';
import { MidtermGeneralCommentsTab } from './MidtermGeneralCommentsTab';
import { ReviewApprovalGenComTab } from './ReviewApprovalGenComTab';
import { MidtermPublishPdfTab } from './MidtermPublishPdfTab';
import { MidtermRekapTab } from './MidtermRekapTab';
import type { 
  MidtermMasterGoalDoc, 
  MidtermStudentDataDoc, 
  PublishedMidtermReport 
} from '../../../types/midtermReport';
import type { Class, Student, ReportConfig, User } from '../../../types';

class MidtermErrorBoundary extends Component<any, any> {
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
              onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-2xl transition-all uppercase tracking-wider cursor-pointer"
            >
              Coba Lagi
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

function MidtermReportPageContent() {
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

  const [searchParams, setSearchParams] = useSearchParams();

  const tabMapping: Record<string, 'GOALS' | 'COMMENTS' | 'REVIEW' | 'PUBLISH' | 'REKAP'> = React.useMemo(() => ({
    'learning-goals': 'GOALS',
    'general-comments': 'COMMENTS',
    'review-approval': 'REVIEW',
    'publish-pdf': 'PUBLISH',
    'tracking': 'REKAP'
  }), []);

  const inverseTabMapping: Record<'GOALS' | 'COMMENTS' | 'REVIEW' | 'PUBLISH' | 'REKAP', string> = React.useMemo(() => ({
    'GOALS': 'learning-goals',
    'COMMENTS': 'general-comments',
    'REVIEW': 'review-approval',
    'PUBLISH': 'publish-pdf',
    'REKAP': 'tracking'
  }), []);

  // Primary Context derived directly from URL searchParams
  const selectedYear = searchParams.get('academicYear') || activeYear || '2025/2026';
  const selectedSemester = searchParams.get('semester') === '2' ? '2' : '1';
  const selectedTerm = searchParams.get('period') === 'midterm-2' || searchParams.get('period') === '2' ? '2' : '1';

  const urlTab = searchParams.get('tab');
  const activeTab: 'GOALS' | 'COMMENTS' | 'REVIEW' | 'PUBLISH' | 'REKAP' = 
    (urlTab && tabMapping[urlTab]) ? tabMapping[urlTab] : 'GOALS';

  const selectedClassId = searchParams.get('classId') || '';

  // Primitive contextKey for single fetch trigger
  const contextKey = `${selectedYear}|${selectedSemester}|${selectedTerm}|${selectedClassId}`;

  // Helper to update searchParams - URL modification ONLY, no setLoadingData
  const updateUrlParams = React.useCallback((updates: {
    academicYear?: string;
    semester?: string;
    period?: string;
    classId?: string;
    tab?: 'GOALS' | 'COMMENTS' | 'REVIEW' | 'PUBLISH' | 'REKAP';
  }) => {
    setSearchParams((prevParams) => {
      const nextParams = new URLSearchParams(prevParams);
      let hasChange = false;

      if (updates.academicYear !== undefined && nextParams.get('academicYear') !== updates.academicYear) {
        nextParams.set('academicYear', updates.academicYear);
        hasChange = true;
      }
      if (updates.semester !== undefined && nextParams.get('semester') !== updates.semester) {
        nextParams.set('semester', updates.semester);
        hasChange = true;
      }
      if (updates.period !== undefined) {
        const periodSlug = updates.period === '2' || updates.period === 'midterm-2' ? 'midterm-2' : 'midterm-1';
        if (nextParams.get('period') !== periodSlug) {
          nextParams.set('period', periodSlug);
          hasChange = true;
        }
      }
      if (updates.tab !== undefined) {
        const tabSlug = inverseTabMapping[updates.tab] || 'learning-goals';
        if (nextParams.get('tab') !== tabSlug) {
          nextParams.set('tab', tabSlug);
          hasChange = true;
        }
      }
      if (updates.classId !== undefined) {
        if (updates.classId) {
          if (nextParams.get('classId') !== updates.classId) {
            nextParams.set('classId', updates.classId);
            hasChange = true;
          }
        } else {
          if (nextParams.has('classId')) {
            nextParams.delete('classId');
            hasChange = true;
          }
        }
      }

      return hasChange ? nextParams : prevParams;
    }, { replace: true });
  }, [inverseTabMapping, setSearchParams]);

  // Ensure default searchParams are explicitly present in URL
  React.useEffect(() => {
    const hasYear = searchParams.has('academicYear');
    const hasSemester = searchParams.has('semester');
    const hasPeriod = searchParams.has('period');
    const hasTab = searchParams.has('tab');

    if (!hasYear || !hasSemester || !hasPeriod || !hasTab) {
      updateUrlParams({
        academicYear: hasYear ? (searchParams.get('academicYear') || undefined) : selectedYear,
        semester: hasSemester ? (searchParams.get('semester') || undefined) : selectedSemester,
        period: hasPeriod ? (searchParams.get('period') || undefined) : selectedTerm,
        tab: hasTab ? (tabMapping[searchParams.get('tab') || ''] || undefined) : activeTab
      });
    }
  }, [searchParams, updateUrlParams, selectedYear, selectedSemester, selectedTerm, activeTab, tabMapping]);

  // Config states for Titimangsa & Cut Off
  const [signingDateRaw, setSigningDateRaw] = React.useState<string>('');
  const [cutoffDateRaw, setCutoffDateRaw] = React.useState<string>('');
  const [loadingPeriodConfig, setLoadingPeriodConfig] = React.useState<boolean>(false);

  const configDocId = `JUNIOR_HIGH_${selectedYear.replace(/\//g, '_')}_${selectedSemester}_${selectedTerm}`;

  const formatToCustomDate = (dateStr: string): string => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    const mIndex = parseInt(month, 10) - 1;
    const dNum = parseInt(day, 10);
    return `${dNum} ${months[mIndex]} ${year}`;
  };

  // Load period config
  React.useEffect(() => {
    let isCancelled = false;
    const loadPeriodConfig = async () => {
      setLoadingPeriodConfig(true);
      try {
        const docRef = doc(db, 'jh_midterm_period_configs', configDocId);
        const docSnap = await getDoc(docRef);
        if (isCancelled) return;
        if (docSnap.exists()) {
          const data = docSnap.data();
          setSigningDateRaw(data.signingDateRaw || '');
          setCutoffDateRaw(data.cutoffDateRaw || '');
        } else {
          setSigningDateRaw('');
          setCutoffDateRaw('');
        }
      } catch (e) {
        if (!isCancelled) console.error("Error loading JH period config:", e);
      } finally {
        if (!isCancelled) setLoadingPeriodConfig(false);
      }
    };
    loadPeriodConfig();
    return () => {
      isCancelled = true;
    };
  }, [configDocId]);

  const signingDateFormatted = React.useMemo(() => formatToCustomDate(signingDateRaw), [signingDateRaw]);
  const cutoffDateFormatted = React.useMemo(() => formatToCustomDate(cutoffDateRaw), [cutoffDateRaw]);

  const isAuthorizedToEdit = React.useMemo(() => {
    if (!effectiveUser) return false;
    const role = (effectiveUser.role || (effectiveUser as any).roleId || '').toUpperCase();
    return [
      'SUPER_ADMIN',
      'PRINCIPAL',
      'HEAD_UNIT',
      'HEAD_JUNIOR',
      'VICE_PRINCIPAL',
      'COORDINATOR',
      'SECRETARY_JH',
      'ADMIN'
    ].includes(role);
  }, [effectiveUser]);

  const handleSaveSigningDate = async (val: string) => {
    if (!isAuthorizedToEdit) return;
    setSigningDateRaw(val);
    try {
      const docRef = doc(db, 'jh_midterm_period_configs', configDocId);
      await setDoc(docRef, {
        signingDateRaw: val,
        reportSigningDate: formatToCustomDate(val),
        reportSigningLocation: 'Depok',
        academicYear: selectedYear,
        semester: selectedSemester,
        midtermPeriod: selectedTerm,
        updatedAt: Date.now()
      }, { merge: true });
      toast.success('Tanggal Titimangsa berhasil disimpan!');
    } catch (e: any) {
      toast.error('Gagal menyimpan Tanggal Titimangsa: ' + e.message);
    }
  };

  const handleSaveCutoffDate = async (val: string) => {
    if (!isAuthorizedToEdit) return;
    setCutoffDateRaw(val);
    try {
      const docRef = doc(db, 'jh_midterm_period_configs', configDocId);
      await setDoc(docRef, {
        cutoffDateRaw: val,
        attendanceCutoffDate: formatToCustomDate(val),
        academicYear: selectedYear,
        semester: selectedSemester,
        midtermPeriod: selectedTerm,
        updatedAt: Date.now()
      }, { merge: true });
      toast.success('Tanggal Cut Off Kehadiran berhasil disimpan!');
    } catch (e: any) {
      toast.error('Gagal menyimpan Tanggal Cut Off Kehadiran: ' + e.message);
    }
  };

  // Classes List
  const [classesList, setClassesList] = React.useState<Class[]>([]);
  const [loadingClasses, setLoadingClasses] = React.useState<boolean>(true);

  // Class Students & Report Config
  const [students, setStudents] = React.useState<Student[]>([]);
  const [reportConfig, setReportConfig] = React.useState<ReportConfig | null>(null);
  const [homeroomTeacherProfile, setHomeroomTeacherProfile] = React.useState<{ displayName: string; niy?: string; signatureUrl?: string | null } | null>(null);

  // Midterm Data Models
  const [masterGoalsMap, setMasterGoalsMap] = React.useState<Record<string, MidtermMasterGoalDoc>>({});
  const [studentDataMap, setStudentDataMap] = React.useState<Record<string, MidtermStudentDataDoc>>({});
  const [publishedReports, setPublishedReports] = React.useState<PublishedMidtermReport[]>([]);
  const [loadingData, setLoadingData] = React.useState<boolean>(true);

  // Load Junior High Classes
  React.useEffect(() => {
    let isCancelled = false;

    const fetchJHClasses = async () => {
      setLoadingClasses(true);
      try {
        const all = await getClasses();
        let enrollmentsSnap = null;
        try {
          enrollmentsSnap = await getDocs(query(
            collection(db, 'enrollments'),
            where('academicYear', '==', selectedYear),
            where('status', '==', 'active')
          ));
        } catch (enrollErr) {
          console.warn("User lacks broad enrollments query permission; bypassing active enrollment filtering:", enrollErr);
        }

        if (isCancelled) return;

        const activeClassKeys = new Set<string>();
        if (enrollmentsSnap && Array.isArray(enrollmentsSnap.docs)) {
          enrollmentsSnap.docs.forEach(d => {
            const e = d.data();
            if (e && e.classId) activeClassKeys.add(e.classId);
          });
        }

        const rawClasses = Array.isArray(all) ? all : [];
        const jhClasses = rawClasses.filter(c => {
          if (!c) return false;
          const isJH = c.unitId === 'JUNIOR_HIGH';
          const isActiveYear = c.academicYear === selectedYear;
          const isNotArchived = c.status !== 'archived';
          if (!isJH || !isActiveYear || !isNotArchived) return false;

          if (enrollmentsSnap) {
            return activeClassKeys.has(c.id) || activeClassKeys.has(c.name) || Boolean((c as any).classId && activeClassKeys.has((c as any).classId));
          }
          return true;
        });

        // Guard before state update: only update if class IDs differ
        setClassesList(prev => {
          const prevIds = prev.map(c => c.id).join(',');
          const newIds = jhClasses.map(c => c.id).join(',');
          return prevIds === newIds ? prev : jhClasses;
        });

        // Ensure URL classId is valid for the loaded classes list
        const urlClassId = searchParams.get('classId');
        if (jhClasses.length > 0) {
          const hasUrlClass = urlClassId && jhClasses.some(c => c && c.id === urlClassId);
          if (!hasUrlClass && urlClassId !== jhClasses[0].id) {
            updateUrlParams({ classId: jhClasses[0].id });
          }
        } else if (urlClassId) {
          updateUrlParams({ classId: '' });
        }
      } catch (err) {
        if (!isCancelled) console.error('Error loading Junior High classes:', err);
      } finally {
        if (!isCancelled) setLoadingClasses(false);
      }
    };

    fetchJHClasses();

    return () => {
      isCancelled = true;
    };
  }, [selectedYear]);

  const safeClassesList = Array.isArray(classesList) ? classesList.filter(Boolean) : [];
  const selectedClass = safeClassesList.find(c => c.id === selectedClassId) || null;

  // Read-only attendance resolution
  const safeStudents = Array.isArray(students) ? students.filter(Boolean) : [];
  const activeStudentIds = React.useMemo(() => safeStudents.map(s => s?.id).filter((id): id is string => Boolean(id)), [safeStudents]);
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

  // Guarded homeroom teacher profile synchronization
  React.useEffect(() => {
    const currentSelectedClass = classesList.find(c => c.id === selectedClassId);
    if (currentSelectedClass) {
      let resolvedName: string | null = null;
      const isEmail = (val?: string | null) => !!val && val.includes('@');

      if (currentSelectedClass.homeroomTeacherName && !isEmail(currentSelectedClass.homeroomTeacherName)) {
        resolvedName = currentSelectedClass.homeroomTeacherName;
      }

      const nextProfile = {
        displayName: resolvedName || 'Homeroom Teacher',
        niy: '',
        signatureUrl: currentSelectedClass.teacherSignatureUrl || null
      };

      setHomeroomTeacherProfile(prev => {
        if (
          prev?.displayName === nextProfile.displayName &&
          prev?.niy === nextProfile.niy &&
          prev?.signatureUrl === nextProfile.signatureUrl
        ) {
          return prev;
        }
        return nextProfile;
      });
    } else {
      setHomeroomTeacherProfile(prev => (prev === null ? prev : null));
    }
  }, [selectedClassId, classesList]);

  // Manual or in-tab refresh function
  const loadClassData = React.useCallback(async (silent = false) => {
    if (!selectedClassId || !selectedYear) return;

    if (!silent) {
      setLoadingData(true);
      setStudents([]);
      setMasterGoalsMap({});
      setStudentDataMap({});
      setPublishedReports([]);
    }

    try {
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
      const fullStudentDataMap: Record<string, MidtermStudentDataDoc> = {};
      sortedStudents.forEach(student => {
        if (!student || !student.id) return;
        const existing = safeSData[student.id];
        fullStudentDataMap[student.id] = existing || normalizeMidtermStudentData(null, {
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
    } catch (err) {
      console.error('Error refreshing midterm class data:', err);
    } finally {
      if (!silent) {
        setLoadingData(false);
      }
    }
  }, [selectedClassId, selectedYear, selectedSemester, selectedTerm]);

  // Single reactive fetch effect triggered strictly by primitive contextKey
  React.useEffect(() => {
    let isCancelled = false;

    const executeFetch = async () => {
      if (!selectedClassId || !selectedYear) {
        setStudents(prev => prev.length === 0 ? prev : []);
        setMasterGoalsMap(prev => Object.keys(prev).length === 0 ? prev : {});
        setStudentDataMap(prev => Object.keys(prev).length === 0 ? prev : {});
        setPublishedReports(prev => prev.length === 0 ? prev : []);
        setLoadingData(false);
        return;
      }

      setLoadingData(true);
      setStudents([]);
      setMasterGoalsMap({});
      setStudentDataMap({});
      setPublishedReports([]);

      try {
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

        if (isCancelled) return;

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
        const fullStudentDataMap: Record<string, MidtermStudentDataDoc> = {};
        sortedStudents.forEach(student => {
          if (!student || !student.id) return;
          const existing = safeSData[student.id];
          fullStudentDataMap[student.id] = existing || normalizeMidtermStudentData(null, {
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
      } catch (err) {
        if (!isCancelled) console.error('Error loading midterm class data:', err);
      } finally {
        if (!isCancelled) {
          setLoadingData(false);
        }
      }
    };

    executeFetch();

    return () => {
      isCancelled = true;
    };
  }, [contextKey]);

  const safePublishedReports = Array.isArray(publishedReports) ? publishedReports.filter(Boolean) : [];
  const publishedMap = React.useMemo(() => {
    const map: Record<string, PublishedMidtermReport> = {};
    for (const rep of safePublishedReports) {
      if (rep && rep.studentId) {
        if (!map[rep.studentId] || (rep.version ?? 0) > (map[rep.studentId].version ?? 0)) {
          map[rep.studentId] = rep;
        }
      }
    }
    return map;
  }, [safePublishedReports]);

  const safeMasterGoalsMap = masterGoalsMap && typeof masterGoalsMap === 'object' ? masterGoalsMap : {};
  const safeStudentDataMap = studentDataMap && typeof studentDataMap === 'object' ? studentDataMap : {};

  // Tab key strictly based on URL state source of truth
  const tabContentKey = `${selectedYear}-${selectedSemester}-${selectedTerm}-${selectedClassId}-${activeTab}`;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header Banner */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-100 pb-4">
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
                onChange={(e) => updateUrlParams({ academicYear: e.target.value })}
                className="text-xs font-bold px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              >
                {availableYears.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {/* Semester */}
            <div className="flex flex-col">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Semester
              </label>
              <select
                value={selectedSemester}
                onChange={(e) => updateUrlParams({ semester: e.target.value })}
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
                onChange={(e) => updateUrlParams({ period: e.target.value })}
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
                onChange={(e) => updateUrlParams({ classId: e.target.value })}
                disabled={loadingClasses || safeClassesList.length === 0}
                className="text-xs font-bold px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 min-w-[140px]"
              >
                {safeClassesList.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Refresh button */}
            <div className="flex flex-col justify-end">
              <button
                onClick={() => loadClassData()}
                disabled={loadingData}
                className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all disabled:opacity-50 mt-auto cursor-pointer"
                title="Refresh Data"
              >
                <RefreshCw size={15} className={loadingData ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
        </div>

        {/* Date Pickers for Titimangsa & Cut Off Kehadiran */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          {/* Tanggal Titimangsa */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                Tanggal Titimangsa (signing date)
              </label>
              {!isAuthorizedToEdit && (
                <span className="text-[9px] text-amber-500 font-bold uppercase tracking-wider">Read Only</span>
              )}
            </div>
            <input
              type="date"
              disabled={!isAuthorizedToEdit}
              value={signingDateRaw}
              onChange={(e) => handleSaveSigningDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:opacity-50"
            />
            {signingDateFormatted ? (
              <p className="text-[10px] text-slate-600 font-bold">Format PDF: Depok, {signingDateFormatted}</p>
            ) : (
              <p className="text-[10px] text-red-500 font-bold">Harap diisi sebelum publish</p>
            )}
          </div>

          {/* Tanggal Cut Off Kehadiran */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                Tanggal Cut Off Kehadiran (attendance cutoff date)
              </label>
              {!isAuthorizedToEdit && (
                <span className="text-[9px] text-amber-500 font-bold uppercase tracking-wider">Read Only</span>
              )}
            </div>
            <input
              type="date"
              disabled={!isAuthorizedToEdit}
              value={cutoffDateRaw}
              onChange={(e) => handleSaveCutoffDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:opacity-50"
            />
            {cutoffDateFormatted ? (
              <p className="text-[10px] text-slate-600 font-bold">Format PDF: Rekap kehadiran sampai {cutoffDateFormatted}</p>
            ) : (
              <p className="text-[10px] text-red-500 font-bold">Harap diisi sebelum publish</p>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Tabs (5 main tabs) */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => updateUrlParams({ tab: 'GOALS' })}
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
          onClick={() => updateUrlParams({ tab: 'COMMENTS' })}
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
          onClick={() => updateUrlParams({ tab: 'REVIEW' })}
          className={`px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'REVIEW'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <FileCheck2 size={15} className={activeTab === 'REVIEW' ? 'text-emerald-400' : 'text-slate-400'} />
          3. Review & Approval GenCom
        </button>

        <button
          onClick={() => updateUrlParams({ tab: 'PUBLISH' })}
          className={`px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'PUBLISH'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Upload size={15} className={activeTab === 'PUBLISH' ? 'text-emerald-400' : 'text-slate-400'} />
          4. Publish PDF
        </button>

        <button
          onClick={() => updateUrlParams({ tab: 'REKAP' })}
          className={`px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'REKAP'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Users size={15} className={activeTab === 'REKAP' ? 'text-emerald-400' : 'text-slate-400'} />
          5. Rekap Publikasi & Open Tracking
        </button>
      </div>

      {/* Main Tab Content */}
      {loadingClasses ? (
        <div className="p-16 bg-white rounded-3xl border border-slate-200 text-center space-y-4 shadow-xs">
          <RefreshCw size={28} className="animate-spin text-slate-900 mx-auto" />
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider animate-pulse">
            Memuat konfigurasi kelas Junior High...
          </p>
        </div>
      ) : safeClassesList.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-3 shadow-xs">
          <AlertCircle size={32} className="mx-auto text-amber-500" />
          <h3 className="text-base font-bold text-slate-900 uppercase">
            Tidak Ada Kelas Junior High Aktif
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Tidak ditemukan kelas Junior High dengan siswa aktif pada tahun ajaran {selectedYear}. Silakan pastikan kelas dan enrollment siswa telah dikonfigurasi di sistem.
          </p>
        </div>
      ) : loadingData ? (
        <div className="p-16 bg-white rounded-3xl border border-slate-200 text-center space-y-4 shadow-xs">
          <RefreshCw size={28} className="animate-spin text-slate-900 mx-auto" />
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider animate-pulse">
            Memuat data Rapor Midterm Junior High...
          </p>
        </div>
      ) : !selectedClassId ? (
        <div className="p-16 bg-white rounded-3xl border border-slate-200 text-center space-y-3 shadow-xs">
          <AlertCircle size={32} className="text-amber-500 mx-auto" />
          <h3 className="text-sm font-black text-slate-800 uppercase">Tidak Ada Kelas Terpilih</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Silakan pilih kelas Junior High pada filter di atas untuk mulai mengelola Rapor Midterm.
          </p>
        </div>
      ) : (
        <div key={tabContentKey}>
          {activeTab === 'GOALS' && (
            <MidtermLearningGoalsTab
              currentUser={effectiveUser}
              selectedClass={selectedClass}
              allJuniorHighClasses={safeClassesList}
              students={safeStudents}
              academicYear={selectedYear}
              semester={selectedSemester}
              midtermTerm={selectedTerm}
              masterGoalsMap={safeMasterGoalsMap}
              studentDataMap={safeStudentDataMap}
              onRefreshData={() => loadClassData(true)}
              loading={loadingData}
            />
          )}

          {activeTab === 'COMMENTS' && (
            <MidtermGeneralCommentsTab
              currentUser={effectiveUser}
              selectedClass={selectedClass}
              students={safeStudents}
              academicYear={selectedYear}
              semester={selectedSemester}
              midtermTerm={selectedTerm}
              studentDataMap={safeStudentDataMap}
              onRefreshData={() => loadClassData(true)}
              loading={loadingData}
            />
          )}

          {activeTab === 'REVIEW' && (
            <ReviewApprovalGenComTab
              currentUser={effectiveUser}
              selectedClass={selectedClass}
              students={safeStudents}
              academicYear={selectedYear}
              semester={selectedSemester}
              midtermTerm={selectedTerm}
              studentDataMap={safeStudentDataMap}
              onRefreshData={() => loadClassData(true)}
              loading={loadingData}
            />
          )}

          {activeTab === 'PUBLISH' && (
            <MidtermPublishPdfTab
              currentUser={effectiveUser}
              selectedClass={selectedClass}
              students={safeStudents}
              academicYear={selectedYear}
              semester={selectedSemester}
              midtermTerm={selectedTerm}
              masterGoalsMap={safeMasterGoalsMap}
              studentDataMap={safeStudentDataMap}
              publishedReportsMap={publishedMap}
              studentAttendanceMap={studentAttendanceMap || {}}
              reportConfig={reportConfig}
              homeroomTeacherProfile={homeroomTeacherProfile}
              onRefreshData={() => loadClassData(true)}
              loading={loadingData}
              reportSigningDate={signingDateFormatted}
              reportSigningLocation="Depok"
              attendanceCutoffDate={cutoffDateFormatted}
              signingDateRaw={signingDateRaw}
              cutoffDateRaw={cutoffDateRaw}
            />
          )}

          {activeTab === 'REKAP' && (
            <MidtermRekapTab
              currentUser={effectiveUser}
              classes={safeClassesList}
              selectedClassId={selectedClassId}
              onSelectClassId={(id) => updateUrlParams({ classId: id })}
              students={safeStudents}
              academicYear={selectedYear}
              semester={selectedSemester}
              midtermTerm={selectedTerm}
              publishedReports={safePublishedReports}
              loading={loadingData}
              onRefreshData={() => loadClassData(true)}
              masterGoalsMap={safeMasterGoalsMap}
              studentDataMap={safeStudentDataMap}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default function MidtermReportPage() {
  const { profile } = useAuth();
  const isSuperAdmin = profile?.role === 'super_admin' || profile?.role === 'SUPER_ADMIN';

  return (
    <MidtermErrorBoundary isSuperAdmin={isSuperAdmin}>
      <MidtermReportPageContent />
    </MidtermErrorBoundary>
  );
}
