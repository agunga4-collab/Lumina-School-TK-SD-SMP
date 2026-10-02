import * as React from 'react';
import { Component } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  FileText, Calendar, Users, Layers, Sparkles,
  Shield, UserCheck, AlertCircle, RefreshCw, Layers3,
  BookOpen, MessageSquare, FileCheck2, Send, BarChart3, Loader2
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useAcademicYear } from '../../../context/AcademicYearContext';
import { db, getClasses, getReportConfig, getStudentById } from '../../../lib/firebase';
import { doc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { useJHReportAttendance } from '../../../hooks/useJHReportAttendance';
import {
  fetchSnStudentsForClass,
  fetchSnMidtermReport,
  fetchSnPublishedReportsForClass,
  canUserManageSnStatus
} from '../../../services/juniorHighSnMidtermService';
import { ManageSnStudentsModal } from './ManageSnStudentsModal';
import { MidtermSnLearningGoalsTab } from './MidtermSnLearningGoalsTab';
import { MidtermSnGeneralCommentsTab } from './MidtermSnGeneralCommentsTab';
import { MidtermSnReviewApprovalGenComTab } from './MidtermSnReviewApprovalGenComTab';
import { MidtermSnPublishPdfTab } from './MidtermSnPublishPdfTab';
import { MidtermSnRekapTab } from './MidtermSnRekapTab';
import type { SnStudentDoc, SnMidtermReportDoc, SnPublishedMidtermReportDoc } from '../../../types/midtermSnReport';
import type { Class, Student, ReportConfig, User } from '../../../types';

class SnErrorBoundary extends Component<any, any> {
  props: any;
  state: any;
  setState: any;

  constructor(props: any) {
    super(props);
    this.props = props;
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Rapor Midterm SN Error Boundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 max-w-2xl mx-auto my-12 bg-white rounded-3xl border border-rose-200 shadow-sm text-center space-y-6">
          <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
            <AlertCircle size={32} />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">
              Modul Rapor Midterm SN Mengalami Kendala
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Gagal memuat data rapor. Silakan muat ulang halaman.
            </p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-2xl transition-all cursor-pointer"
          >
            Muat Ulang
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function MidtermSnReportPageContent() {
  const { currentUser, profile } = useAuth();
  const effectiveUser = (currentUser || profile) as User;
  const { activeYear } = useAcademicYear();

  const [searchParams, setSearchParams] = useSearchParams();

  // Primary Context Filters
  const [selectedYear, setSelectedYear] = React.useState<string>(
    searchParams.get('academicYear') || activeYear || '2025/2026'
  );
  const [selectedSemester, setSelectedSemester] = React.useState<string>(
    searchParams.get('semester') === '2' ? '2' : '1'
  );
  const [selectedTerm, setSelectedTerm] = React.useState<string>(
    searchParams.get('period') === '2' ? '2' : '1'
  );

  const [selectedClassId, setSelectedClassId] = React.useState<string>(
    searchParams.get('classId') || ''
  );
  const [selectedStudentId, setSelectedStudentId] = React.useState<string>(
    searchParams.get('studentId') || ''
  );

  const [activeTab, setActiveTab] = React.useState<
    'GOALS' | 'COMMENTS' | 'REVIEW' | 'PUBLISH' | 'REKAP'
  >((searchParams.get('tab') as any) || 'GOALS');

  // Loaded Collections
  const [allClasses, setAllClasses] = React.useState<Class[]>([]);
  const [selectedClass, setSelectedClass] = React.useState<Class | null>(null);

  const [snStudents, setSnStudents] = React.useState<SnStudentDoc[]>([]);
  const [selectedStudentObj, setSelectedStudentObj] = React.useState<Student | null>(null);

  const [snReportDoc, setSnReportDoc] = React.useState<SnMidtermReportDoc | null>(null);
  const [publishedReports, setPublishedReports] = React.useState<SnPublishedMidtermReportDoc[]>([]);
  const [reportConfig, setReportConfig] = React.useState<ReportConfig | null>(null);

  const [signingDateRaw, setSigningDateRaw] = React.useState<string>('');
  const [cutoffDateRaw, setCutoffDateRaw] = React.useState<string>('');

  const [loadingMaster, setLoadingMaster] = React.useState<boolean>(true);
  const [loadingStudents, setLoadingStudents] = React.useState<boolean>(false);
  const [loadingReport, setLoadingReport] = React.useState<boolean>(false);

  const [isManageModalOpen, setIsManageModalOpen] = React.useState<boolean>(false);

  const canManageSn = canUserManageSnStatus(effectiveUser);

  // Load Classes & Config on Mount
  React.useEffect(() => {
    let isMounted = true;
    const initMaster = async () => {
      setLoadingMaster(true);
      try {
        const [classList, cfg] = await Promise.all([
          getClasses(),
          getReportConfig('JUNIOR_HIGH')
        ]);
        if (!isMounted) return;

        const jhClasses = (classList || []).filter(
          (c) => c && (c.unitId === 'JUNIOR_HIGH' || (c as any).unit === 'JUNIOR_HIGH')
        );
        setAllClasses(jhClasses);
        setReportConfig(cfg || null);

        // Auto-select class only if none was specified in searchParams
        if (!selectedClassId && jhClasses.length > 0) {
          setSelectedClassId(jhClasses[0].id);
        }
      } catch (err) {
        console.error("[MidtermSnReportPage] Gagal memuat data master kelas:", err);
      } finally {
        if (isMounted) setLoadingMaster(false);
      }
    };
    initMaster();
    return () => {
      isMounted = false;
    };
  }, []);

  // Update selected class object when selectedClassId or allClasses change
  React.useEffect(() => {
    if (selectedClassId && allClasses.length > 0) {
      const cls = allClasses.find((c) => c.id === selectedClassId) || null;
      setSelectedClass(cls);
    } else {
      setSelectedClass(null);
    }
  }, [selectedClassId, allClasses]);

  const [homeroomTeacherProfile, setHomeroomTeacherProfile] = React.useState<{ displayName: string; niy?: string; signatureUrl?: string | null } | null>(null);

  // Guarded homeroom teacher profile synchronization for SN
  React.useEffect(() => {
    let isCancelled = false;
    const currentSelectedClass = allClasses.find(c => c.id === selectedClassId);
    if (currentSelectedClass) {
      let resolvedName: string | null = null;
      const isEmail = (val?: string | null) => !!val && val.includes('@');

      if (currentSelectedClass.homeroomTeacherName && !isEmail(currentSelectedClass.homeroomTeacherName)) {
        resolvedName = currentSelectedClass.homeroomTeacherName;
      }

      const fetchNiy = async () => {
        let niyVal = '';
        if (currentSelectedClass.homeroomTeacherId) {
          try {
            const teacherDoc = await getDoc(doc(db, 'users', currentSelectedClass.homeroomTeacherId));
            if (teacherDoc.exists()) {
              const teacherData = teacherDoc.data();
              niyVal = teacherData?.niy || teacherData?.NIY || '';
            }
          } catch (teacherErr) {
            console.warn("Failed to fetch teacher profile for NIY by ID:", teacherErr);
          }
        }

        if (!niyVal && currentSelectedClass.homeroomTeacherName) {
          try {
            const usersRef = collection(db, 'users');
            const qUsers = query(usersRef, where('displayName', '==', currentSelectedClass.homeroomTeacherName));
            const querySnap = await getDocs(qUsers);
            if (!querySnap.empty) {
              const docData = querySnap.docs[0].data();
              niyVal = docData?.niy || docData?.NIY || '';
            }
          } catch (qErr) {
            console.warn("Failed to query teacher profile by name:", qErr);
          }
        }

        if (isCancelled) return;

        const nextProfile = {
          displayName: resolvedName || 'Homeroom Teacher',
          niy: niyVal || '',
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
      };

      fetchNiy();
    } else {
      setHomeroomTeacherProfile(prev => (prev === null ? prev : null));
    }

    return () => {
      isCancelled = true;
    };
  }, [selectedClassId, allClasses]);

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

  React.useEffect(() => {
    let isCancelled = false;
    const loadPeriodConfig = async () => {
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
        console.error("Error loading JH SN period config:", e);
      }
    };
    loadPeriodConfig();
    return () => {
      isCancelled = true;
    };
  }, [selectedYear, selectedSemester, selectedTerm]);

  const activeStudentIds = React.useMemo(() => (snStudents || []).map(s => s.studentId).filter(Boolean), [snStudents]);
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

  // Sync Search Params to URL
  React.useEffect(() => {
    const params = new URLSearchParams();
    if (selectedYear) params.set('academicYear', selectedYear);
    if (selectedSemester) params.set('semester', selectedSemester);
    if (selectedTerm) params.set('period', selectedTerm);
    if (selectedClassId) params.set('classId', selectedClassId);
    if (selectedStudentId) params.set('studentId', selectedStudentId);
    if (activeTab) params.set('tab', activeTab);
    setSearchParams(params, { replace: true });
  }, [
    selectedYear,
    selectedSemester,
    selectedTerm,
    selectedClassId,
    selectedStudentId,
    activeTab,
    setSearchParams
  ]);

  // Load SN Students list when class or academic year changes
  const loadSnStudents = React.useCallback(async () => {
    if (!selectedClassId || typeof selectedClassId !== 'string' || !selectedClassId.trim()) {
      setSnStudents([]);
      return;
    }

    setLoadingStudents(true);
    try {
      const list = await fetchSnStudentsForClass(selectedClassId.trim(), selectedYear?.trim());
      setSnStudents(list || []);

      // If current selectedStudentId is not in the list, auto-select first or clear
      if (selectedStudentId) {
        const match = (list || []).find((s) => s.studentId === selectedStudentId);
        if (!match) {
          if (list && list.length > 0) {
            setSelectedStudentId(list[0].studentId);
          } else {
            setSelectedStudentId('');
            setSelectedStudentObj(null);
            setSnReportDoc(null);
          }
        }
      } else if (list && list.length > 0) {
        setSelectedStudentId(list[0].studentId);
      }
    } catch (err) {
      console.error("[MidtermSnReportPage] Gagal memuat siswa SN:", { selectedClassId, selectedYear }, err);
      setSnStudents([]);
    } finally {
      setLoadingStudents(false);
    }
  }, [selectedClassId, selectedYear, selectedStudentId]);

  React.useEffect(() => {
    loadSnStudents();
  }, [selectedClassId, selectedYear]);

  // Load Selected SN Student's Data & Report Doc
  const loadStudentReport = React.useCallback(async () => {
    if (
      !selectedStudentId ||
      typeof selectedStudentId !== 'string' ||
      !selectedStudentId.trim() ||
      !selectedClass ||
      !selectedClass.id ||
      !selectedYear ||
      !selectedSemester ||
      !selectedTerm
    ) {
      setSelectedStudentObj(null);
      setSnReportDoc(null);
      return;
    }

    setLoadingReport(true);
    try {
      const sId = selectedStudentId.trim();
      const cId = selectedClass.id.trim();
      const aYear = selectedYear.trim();
      const sem = selectedSemester.trim();
      const term = selectedTerm.trim();

      // Safe fetch for student profile
      let stdDoc: Student | null = null;
      try {
        stdDoc = await getStudentById(sId);
      } catch (e) {
        console.warn("[MidtermSnReportPage] getStudentById fallback:", e);
      }

      const fallbackName = snStudents.find((s) => s.studentId === sId)?.studentName || 'Siswa SN';
      const studentData: Student = stdDoc || {
        id: sId,
        name: fallbackName,
        classId: cId,
        currentUnit: 'JUNIOR_HIGH'
      };

      setSelectedStudentObj(studentData);

      // Safe fetch for published reports
      let publishedList: SnPublishedMidtermReportDoc[] = [];
      try {
        publishedList = await fetchSnPublishedReportsForClass(cId, aYear, sem, term);
      } catch (e) {
        console.warn("[MidtermSnReportPage] fetchSnPublishedReportsForClass error:", e);
      }
      setPublishedReports(publishedList || []);

      // Safe fetch for SN midterm report draft
      const report = await fetchSnMidtermReport(studentData, selectedClass, aYear, sem, term);
      setSnReportDoc(report);
    } catch (err) {
      console.error("[MidtermSnReportPage] Gagal memuat data rapor siswa SN:", { selectedStudentId, classId: selectedClass?.id }, err);
      toast.error('Gagal memuat data rapor siswa SN.');
    } finally {
      setLoadingReport(false);
    }
  }, [
    selectedStudentId,
    selectedClass,
    selectedYear,
    selectedSemester,
    selectedTerm,
    snStudents
  ]);

  React.useEffect(() => {
    loadStudentReport();
  }, [loadStudentReport]);

  const handleSelectStudent = (studentId: string) => {
    // Reset state before loading new student
    setSelectedStudentId(studentId);
    setSelectedStudentObj(null);
    setSnReportDoc(null);
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 font-sans pb-16">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2.5 bg-purple-100 text-purple-900 rounded-2xl">
              <Shield size={22} />
            </span>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">
                Rapor Midterm SN (Junior High)
              </h1>
              <p className="text-xs text-slate-500 font-semibold">
                Modul Khusus Pengelolaan Rapor Midterm Siswa Special Needs
              </p>
            </div>
          </div>
        </div>

        {/* Dynamic Context Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="px-3.5 py-1.5 bg-purple-50 text-purple-950 border border-purple-200 rounded-xl text-xs font-black">
            Kelas: <span className="text-purple-700">{selectedClass?.name || 'Belum Dipilih'}</span>
          </div>
          <div className="px-3.5 py-1.5 bg-amber-50 text-amber-950 border border-amber-200 rounded-xl text-xs font-black">
            Siswa SN: <span className="text-amber-700">{selectedStudentObj?.name || 'Belum Dipilih'}</span>
          </div>
          {canManageSn && selectedClass && (
            <button
              onClick={() => setIsManageModalOpen(true)}
              className="px-3.5 py-1.5 bg-purple-900 hover:bg-purple-800 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <UserCheck size={14} /> Kelola Siswa SN
            </button>
          )}
        </div>
      </div>

      {/* Selectors Bar */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
        {/* Academic Year */}
        <div>
          <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
            Tahun Ajaran
          </label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
          >
            <option value="2024/2025">2024/2025</option>
            <option value="2025/2026">2025/2026</option>
            <option value="2026/2027">2026/2027</option>
          </select>
        </div>

        {/* Semester */}
        <div>
          <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
            Semester
          </label>
          <select
            value={selectedSemester}
            onChange={(e) => setSelectedSemester(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
          >
            <option value="1">Semester 1</option>
            <option value="2">Semester 2</option>
          </select>
        </div>

        {/* Midterm Period */}
        <div>
          <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
            Periode Midterm
          </label>
          <select
            value={selectedTerm}
            onChange={(e) => setSelectedTerm(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
          >
            <option value="1">Midterm 1</option>
            <option value="2">Midterm 2</option>
          </select>
        </div>

        {/* Class Selector */}
        <div>
          <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
            Pilih Kelas
          </label>
          <select
            value={selectedClassId}
            onChange={(e) => {
              setSelectedClassId(e.target.value);
              setSelectedStudentId('');
            }}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
          >
            <option value="">-- Pilih Kelas --</option>
            {allClasses.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </select>
        </div>

        {/* SN Student Selector */}
        <div>
          <label className="block text-[10px] font-black uppercase text-purple-700 mb-1">
            Siswa Special Needs (SN)
          </label>
          <select
            value={selectedStudentId}
            onChange={(e) => handleSelectStudent(e.target.value)}
            disabled={!selectedClassId || snStudents.length === 0}
            className="w-full px-3 py-2 bg-purple-50 border border-purple-300 rounded-2xl text-xs font-black text-purple-950 focus:outline-none focus:ring-2 focus:ring-purple-500/30 disabled:opacity-50"
          >
            {!selectedClassId ? (
              <option value="">-- Pilih Kelas Dahulu --</option>
            ) : snStudents.length === 0 ? (
              <option value="">-- Belum ada Siswa SN --</option>
            ) : (
              <>
                <option value="">-- Pilih Siswa SN --</option>
                {snStudents.map((sn) => (
                  <option key={sn.studentId} value={sn.studentId}>
                    {sn.studentName}
                  </option>
                ))}
              </>
            )}
          </select>
        </div>
      </div>

      {/* No Class Selected Banner */}
      {!selectedClassId && !loadingMaster && (
        <div className="p-8 text-center bg-white rounded-3xl border border-slate-200 shadow-2xs space-y-2">
          <Users size={32} className="mx-auto text-purple-600" />
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">
            Pilih Kelas Terlebih Dahulu
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Silakan tentukan kelas di atas untuk melihat siswa SN dan mengelola rapor individual.
          </p>
        </div>
      )}

      {/* No SN Students Alert Banner */}
      {selectedClassId && snStudents.length === 0 && !loadingStudents && selectedClass && (
        <div className="p-5 bg-purple-50 border border-purple-200 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-purple-950">
          <div className="flex items-center gap-3">
            <Shield size={20} className="text-purple-700 shrink-0" />
            <p className="font-bold">
              Belum ada siswa SN yang ditetapkan Admin pada kelas <span className="underline">{selectedClass.name}</span>.
            </p>
          </div>
          {canManageSn && (
            <button
              onClick={() => setIsManageModalOpen(true)}
              className="px-4 py-2 bg-purple-900 text-white rounded-xl font-bold hover:bg-purple-800 transition-all shadow-2xs shrink-0 cursor-pointer"
            >
              Tetapkan Siswa SN
            </button>
          )}
        </div>
      )}

      {/* Navigation Tabs */}
      {selectedClassId && (
        <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveTab('GOALS')}
            disabled={!selectedStudentId}
            className={`px-5 py-3 rounded-2xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'GOALS'
                ? 'bg-purple-900 text-white shadow-xs'
                : 'text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed'
            }`}
          >
            <BookOpen size={16} /> 1. Learning Goals & Remarks
          </button>

          <button
            onClick={() => setActiveTab('COMMENTS')}
            disabled={!selectedStudentId}
            className={`px-5 py-3 rounded-2xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'COMMENTS'
                ? 'bg-purple-900 text-white shadow-xs'
                : 'text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed'
            }`}
          >
            <MessageSquare size={16} /> 2. General Comments
          </button>

          <button
            onClick={() => setActiveTab('REVIEW')}
            disabled={!selectedStudentId}
            className={`px-5 py-3 rounded-2xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'REVIEW'
                ? 'bg-purple-900 text-white shadow-xs'
                : 'text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed'
            }`}
          >
            <FileCheck2 size={16} /> 3. Review & Approval GenCom
          </button>

          <button
            onClick={() => setActiveTab('PUBLISH')}
            disabled={!selectedStudentId}
            className={`px-5 py-3 rounded-2xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'PUBLISH'
                ? 'bg-purple-900 text-white shadow-xs'
                : 'text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed'
            }`}
          >
            <Send size={16} /> 4. Publish PDF
          </button>

          <button
            onClick={() => setActiveTab('REKAP')}
            className={`px-5 py-3 rounded-2xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'REKAP'
                ? 'bg-purple-900 text-white shadow-xs'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            <BarChart3 size={16} /> 5. Rekap Publikasi & Tracking
          </button>
        </div>
      )}

      {/* Tab Content Display */}
      {selectedClassId && !selectedStudentId && activeTab !== 'REKAP' ? (
        <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 space-y-3">
          <AlertCircle size={36} className="mx-auto text-amber-500" />
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">
            Siswa SN Belum Dipilih
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Silakan pilih siswa SN dari dropdown di atas untuk mengelola Learning Goals, General Comment, atau merilis rapor.
          </p>
        </div>
      ) : (
        selectedClass && (
          <>
            {activeTab === 'GOALS' && selectedStudentObj && snReportDoc && (
              <MidtermSnLearningGoalsTab
                currentUser={effectiveUser}
                selectedClass={selectedClass}
                selectedStudent={selectedStudentObj}
                reportDoc={snReportDoc}
                onRefreshData={loadStudentReport}
                loading={loadingReport}
              />
            )}

            {activeTab === 'COMMENTS' && selectedStudentObj && snReportDoc && (
              <MidtermSnGeneralCommentsTab
                currentUser={effectiveUser}
                selectedClass={selectedClass}
                selectedStudent={selectedStudentObj}
                reportDoc={snReportDoc}
                onRefreshData={loadStudentReport}
                loading={loadingReport}
              />
            )}

            {activeTab === 'REVIEW' && selectedStudentObj && snReportDoc && (
              <MidtermSnReviewApprovalGenComTab
                currentUser={effectiveUser}
                selectedClass={selectedClass}
                selectedStudent={selectedStudentObj}
                reportDoc={snReportDoc}
                onRefreshData={loadStudentReport}
                loading={loadingReport}
              />
            )}

            {activeTab === 'PUBLISH' && selectedStudentObj && snReportDoc && (
              <MidtermSnPublishPdfTab
                currentUser={effectiveUser}
                selectedClass={selectedClass}
                selectedStudent={selectedStudentObj}
                reportDoc={snReportDoc}
                publishedReports={publishedReports}
                reportConfig={reportConfig}
                homeroomTeacherProfile={homeroomTeacherProfile}
                studentAttendanceMap={studentAttendanceMap}
                attendanceCutoffDate={cutoffDateRaw ? formatToCustomDate(cutoffDateRaw) : undefined}
                onRefreshData={loadStudentReport}
                loading={loadingReport}
              />
            )}

            {activeTab === 'REKAP' && (
              <MidtermSnRekapTab
                currentUser={effectiveUser}
                selectedClass={selectedClass}
                snStudents={snStudents}
                publishedReports={publishedReports}
                academicYear={selectedYear}
                semester={selectedSemester}
                midtermTerm={selectedTerm}
                onRefreshData={loadSnStudents}
                loading={loadingStudents}
              />
            )}
          </>
        )
      )}

      {/* Admin Manage SN Students Modal */}
      {selectedClass && (
        <ManageSnStudentsModal
          isOpen={isManageModalOpen}
          onClose={() => setIsManageModalOpen(false)}
          selectedClass={selectedClass}
          academicYear={selectedYear}
          currentUser={effectiveUser}
          onRefresh={loadSnStudents}
        />
      )}
    </div>
  );
}

export default function MidtermSnReportPage() {
  return (
    <SnErrorBoundary>
      <MidtermSnReportPageContent />
    </SnErrorBoundary>
  );
}
