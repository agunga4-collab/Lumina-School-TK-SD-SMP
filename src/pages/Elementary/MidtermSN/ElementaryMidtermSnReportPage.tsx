import * as React from 'react';
import { Component } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  FileText, Calendar, Users, Layers, Sparkles,
  Shield, UserCheck, AlertCircle, RefreshCw,
  FileCheck2, Clock, CheckCircle2, ChevronRight,
  BookOpen, MessageSquare, Send
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useAcademicYear } from '../../../context/AcademicYearContext';
import { db, getClasses, getReportConfig } from '../../../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  fetchElemSnStudentsForClass,
  fetchElemSnMidtermReport,
  createDefaultElemSnReport,
  saveElemSnMidtermReport,
  fetchElemSnPublishedReports,
  getElemSnDocId
} from '../../../services/elementarySnMidtermService';
import { ManageSnStudentsModal } from './ManageSnStudentsModal';
import { ElementaryMidtermSnLearningGoalsTab } from './ElementaryMidtermSnLearningGoalsTab';
import { ElementaryMidtermSnGeneralCommentsTab } from './ElementaryMidtermSnGeneralCommentsTab';
import { ElementaryMidtermSnReviewApprovalGenComTab } from './ElementaryMidtermSnReviewApprovalGenComTab';
import { ElementaryMidtermSnPublishPdfTab } from './ElementaryMidtermSnPublishPdfTab';
import { ElementaryMidtermSnRekapTab } from './ElementaryMidtermSnRekapTab';
import type {
  ElementarySnStudentDoc,
  ElementarySnMidtermReportDoc,
  ElementarySnPublishedMidtermReportDoc
} from '../../../types/elementaryMidtermSnReport';
import type { Class, Student, ReportConfig, User } from '../../../types';

class ElementaryMidtermSnErrorBoundary extends Component<any, any> {
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
    console.error('Elementary Midterm SN Module Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 max-w-2xl mx-auto my-12 bg-white rounded-3xl border border-red-200 shadow-sm text-center space-y-6">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
            <AlertCircle size={32} />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">
              Midterm Report SN Elementary mengalami kendala saat memuat data.
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Terjadi kesalahan teknis. Silakan klik tombol di bawah untuk memuat ulang data.
            </p>
          </div>
          <div className="flex justify-center">
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-2xl transition-all cursor-pointer"
            >
              Coba Lagi
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function ElementaryMidtermSnReportPageContent() {
  const { currentUser, profile } = useAuth();
  const effectiveUser = (currentUser || profile) as User;
  const { activeYear } = useAcademicYear();

  const [searchParams, setSearchParams] = useSearchParams();

  // Academic Year options
  const availableYears = React.useMemo(() => {
    const defaults = ['2024/2025', '2025/2026', '2026/2027'];
    if (activeYear && !defaults.includes(activeYear)) {
      return [...defaults, activeYear].sort();
    }
    return defaults;
  }, [activeYear]);

  // Context filters
  const urlYear = searchParams.get('academicYear');
  const [selectedYear, setSelectedYear] = React.useState<string>(urlYear || activeYear || '2025/2026');

  const urlSemester = searchParams.get('semester');
  const [selectedSemester, setSelectedSemester] = React.useState<string>(urlSemester === '2' ? '2' : '1');

  const urlPeriod = searchParams.get('period');
  const [selectedTerm, setSelectedTerm] = React.useState<string>(urlPeriod === 'midterm-2' ? '2' : '1');

  const urlTab = searchParams.get('tab') || '';
  const initialActiveTab =
    urlTab === 'general-comments' ? 'COMMENTS' :
    urlTab === 'review-approval' ? 'REVIEW' :
    urlTab === 'publish' ? 'PUBLISH' :
    urlTab === 'tracking' ? 'REKAP' : 'GOALS';
  const [activeTab, setActiveTab] = React.useState<'GOALS' | 'COMMENTS' | 'REVIEW' | 'PUBLISH' | 'REKAP'>(initialActiveTab);

  // Elementary Classes state
  const [classesList, setClassesList] = React.useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = React.useState<string>('');
  const [loadingClasses, setLoadingClasses] = React.useState<boolean>(true);

  // SN Students in selected class
  const [snStudentsList, setSnStudentsList] = React.useState<ElementarySnStudentDoc[]>([]);
  const [selectedStudentId, setSelectedStudentId] = React.useState<string>('');
  const [loadingSnStudents, setLoadingSnStudents] = React.useState<boolean>(false);

  // Report & Publishing state
  const [reportDoc, setReportDoc] = React.useState<ElementarySnMidtermReportDoc | null>(null);
  const [publishedReports, setPublishedReports] = React.useState<ElementarySnPublishedMidtermReportDoc[]>([]);
  const [reportConfig, setReportConfig] = React.useState<ReportConfig | null>(null);
  const [loadingReportData, setLoadingReportData] = React.useState<boolean>(false);

  // Active request tracking to avoid race conditions
  const activeReportRequestIdRef = React.useRef<number>(0);

  // Manage SN Students Modal
  const [isManageModalOpen, setIsManageModalOpen] = React.useState<boolean>(false);

  // Period configs (Titimangsa & Cutoff Date)
  const [signingDateRaw, setSigningDateRaw] = React.useState<string>('');
  const [cutoffDateRaw, setCutoffDateRaw] = React.useState<string>('');
  const [showAttendanceRecap, setShowAttendanceRecap] = React.useState<boolean>(true);

  const configDocId = `ELEMENTARY_${selectedYear.replace(/\//g, '_')}_${selectedSemester}_${selectedTerm}`;

  // Load period config
  React.useEffect(() => {
    const loadPeriodConfig = async () => {
      try {
        const docRef = doc(db, 'elem_midterm_period_configs', configDocId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setSigningDateRaw(data.signingDateRaw || '');
          setCutoffDateRaw(data.cutoffDateRaw || '');
          setShowAttendanceRecap(data.showAttendanceRecap !== false);
        } else {
          setSigningDateRaw('');
          setCutoffDateRaw('');
          setShowAttendanceRecap(true);
        }
      } catch (e) {
        console.error('Error loading Elementary period config:', e);
      }
    };
    loadPeriodConfig();
  }, [configDocId]);

  // Check Admin permission for SN assignment
  const isAdminUser = React.useMemo(() => {
    if (!effectiveUser) return false;
    const role = (effectiveUser.role || (effectiveUser as any).roleId || '').toUpperCase();
    const email = (effectiveUser.email || '').toLowerCase();
    return [
      'SUPER_ADMIN',
      'ADMIN',
      'PRINCIPAL',
      'HEAD_UNIT'
    ].includes(role) || email === 'agunga4@lazuardi.sch.id' || email === 'agunga4@gmail.com';
  }, [effectiveUser]);

  // Load Elementary Classes strictly filtered by active academicYear
  React.useEffect(() => {
    let isMounted = true;
    const fetchElementaryClasses = async () => {
      setLoadingClasses(true);
      try {
        const all = await getClasses();
        if (!isMounted) return;

        const rawClasses = Array.isArray(all) ? all : [];
        const elemClasses = rawClasses.filter((c) => {
          if (!c) return false;
          const isElem = c.unitId === 'ELEMENTARY';
          const isActiveYear = c.academicYear === selectedYear;
          const isNotArchived = c.status !== 'archived';
          return isElem && isActiveYear && isNotArchived;
        });

        elemClasses.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setClassesList(elemClasses);

        // Class selection sync
        const urlClassId = searchParams.get('classId');
        const isValidUrlClass = elemClasses.some((c) => c && c.id === urlClassId);

        if (isValidUrlClass && urlClassId) {
          setSelectedClassId(urlClassId);
        } else if (elemClasses.length > 0) {
          setSelectedClassId(elemClasses[0].id);
        } else {
          setSelectedClassId('');
        }
      } catch (err) {
        console.error('Error loading Elementary classes in Midterm SN:', err);
      } finally {
        if (isMounted) setLoadingClasses(false);
      }
    };

    fetchElementaryClasses();
    return () => {
      isMounted = false;
    };
  }, [selectedYear]);

  // Selected Class object
  const selectedClass = React.useMemo(() => {
    return classesList.find((c) => c.id === selectedClassId) || null;
  }, [classesList, selectedClassId]);

  // Load SN Students list for selected class
  const loadSnStudents = React.useCallback(async () => {
    if (!selectedClassId || !selectedYear) {
      setSnStudentsList([]);
      setSelectedStudentId('');
      return;
    }

    setLoadingSnStudents(true);
    try {
      const snDocs = await fetchElemSnStudentsForClass(selectedClassId, selectedYear);
      setSnStudentsList(snDocs);

      // Select student logic
      const urlStudentId = searchParams.get('studentId');
      const isValidUrlStudent = snDocs.some((s) => s.studentId === urlStudentId);

      if (isValidUrlStudent && urlStudentId) {
        setSelectedStudentId(urlStudentId);
      } else if (snDocs.length > 0) {
        setSelectedStudentId(snDocs[0].studentId);
      } else {
        setSelectedStudentId('');
      }
    } catch (err) {
      console.error('Error loading SN students:', err);
    } finally {
      setLoadingSnStudents(false);
    }
  }, [selectedClassId, selectedYear]);

  React.useEffect(() => {
    loadSnStudents();
  }, [loadSnStudents]);

  // Selected SN Student Doc & Object
  const selectedSnStudentDoc = React.useMemo(() => {
    return snStudentsList.find((s) => s.studentId === selectedStudentId) || null;
  }, [snStudentsList, selectedStudentId]);

  const selectedStudentObject: Student | null = React.useMemo(() => {
    if (!selectedSnStudentDoc) return null;
    return {
      id: selectedSnStudentDoc.studentId,
      name: selectedSnStudentDoc.studentName,
      nisn: selectedSnStudentDoc.nisn,
      classId: selectedSnStudentDoc.classId,
      className: selectedSnStudentDoc.className,
      status: 'active'
    } as Student;
  }, [selectedSnStudentDoc]);

  // Load Report Data for selected SN student with race-condition guard
  const loadStudentReportData = React.useCallback(async () => {
    if (!selectedStudentId || !selectedClassId || !selectedYear || !selectedSemester || !selectedTerm) {
      setReportDoc(null);
      return;
    }

    const currentRequestId = ++activeReportRequestIdRef.current;
    setLoadingReportData(true);

    try {
      const [config, existingReport, publishedList] = await Promise.all([
        getReportConfig('ELEMENTARY'),
        fetchElemSnMidtermReport(selectedStudentId, selectedClassId, selectedYear, selectedSemester, selectedTerm),
        fetchElemSnPublishedReports(selectedClassId, selectedYear, selectedSemester, selectedTerm)
      ]);

      if (currentRequestId !== activeReportRequestIdRef.current) {
        return;
      }

      setReportConfig(config || null);
      setPublishedReports(publishedList);

      if (existingReport) {
        setReportDoc(existingReport);
      } else if (selectedStudentObject && selectedClass && effectiveUser) {
        // Only initialize default if no report exists in Firestore
        const newDraft = createDefaultElemSnReport(
          selectedStudentObject,
          selectedClass,
          selectedYear,
          selectedSemester,
          selectedTerm,
          effectiveUser
        );
        await saveElemSnMidtermReport(newDraft, effectiveUser);
        if (currentRequestId === activeReportRequestIdRef.current) {
          setReportDoc(newDraft);
        }
      }
    } catch (err) {
      console.error('Error loading SN student report data:', err);
    } finally {
      if (currentRequestId === activeReportRequestIdRef.current) {
        setLoadingReportData(false);
      }
    }
  }, [selectedStudentId, selectedClassId, selectedYear, selectedSemester, selectedTerm, selectedStudentObject, selectedClass, effectiveUser]);

  React.useEffect(() => {
    loadStudentReportData();
  }, [loadStudentReportData]);

  // URL Sync
  React.useEffect(() => {
    if (loadingClasses) return;

    const newParams = new URLSearchParams(searchParams);

    if (selectedClassId) newParams.set('classId', selectedClassId);
    else newParams.delete('classId');

    if (selectedStudentId) newParams.set('studentId', selectedStudentId);
    else newParams.delete('studentId');

    newParams.set('academicYear', selectedYear);
    newParams.set('semester', selectedSemester);
    newParams.set('period', selectedTerm === '2' ? 'midterm-2' : 'midterm-1');

    const tabParamValue =
      activeTab === 'GOALS' ? 'learning-goals' :
      activeTab === 'COMMENTS' ? 'general-comments' :
      activeTab === 'REVIEW' ? 'review-approval' :
      activeTab === 'PUBLISH' ? 'publish' : 'tracking';
    newParams.set('tab', tabParamValue);

    let hasChanged = false;
    newParams.forEach((val, key) => {
      if (searchParams.get(key) !== val) hasChanged = true;
    });
    searchParams.forEach((val, key) => {
      if (!newParams.has(key)) hasChanged = true;
    });

    if (hasChanged) {
      setSearchParams(newParams, { replace: true });
    }
  }, [selectedClassId, selectedStudentId, selectedYear, selectedSemester, selectedTerm, activeTab, loadingClasses, setSearchParams]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      {/* 1. Context Header */}
      <div className="bg-gradient-to-r from-amber-700 via-amber-800 to-indigo-900 text-white rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="px-3 py-1 bg-amber-400 text-slate-900 rounded-xl text-xs font-black uppercase tracking-wider">
                Special Needs (SN)
              </span>
              <span className="text-amber-200 text-xs font-bold">
                Elementary Unit
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">
              Rapor Midterm SN - Elementary
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-amber-100 font-medium">
              <span>Siswa SN: <strong className="text-amber-300 font-black">{selectedSnStudentDoc?.studentName || 'Belum Dipilih'}</strong></span>
              <span>•</span>
              <span>Kelas: <strong className="text-white font-bold">{selectedClass?.name || 'Belum Dipilih'}</strong></span>
              <span>•</span>
              <span>Tahun Ajaran: <strong className="text-white font-bold">{selectedYear}</strong></span>
              <span>•</span>
              <span>Semester {selectedSemester} (Midterm {selectedTerm})</span>
            </div>
          </div>

          {isAdminUser && selectedClass && (
            <button
              onClick={() => setIsManageModalOpen(true)}
              className="px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black rounded-2xl shadow-lg transition-all flex items-center gap-2 cursor-pointer shrink-0"
            >
              <Shield size={16} />
              <span>Kelola Siswa SN</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Control Bar (Year, Semester, Period, Class, Student) */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {/* Academic Year */}
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">
              Tahun Ajaran
            </label>
            <select
              value={selectedYear}
              onChange={(e) => {
                setSelectedYear(e.target.value);
                setSelectedStudentId('');
                setReportDoc(null);
              }}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 outline-hidden"
            >
              {availableYears.map((yr) => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>
          </div>

          {/* Semester */}
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">
              Semester
            </label>
            <select
              value={selectedSemester}
              onChange={(e) => {
                setSelectedSemester(e.target.value);
                setReportDoc(null);
              }}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 outline-hidden"
            >
              <option value="1">Semester 1 (Ganjil)</option>
              <option value="2">Semester 2 (Genap)</option>
            </select>
          </div>

          {/* Period */}
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">
              Periode Midterm
            </label>
            <select
              value={selectedTerm}
              onChange={(e) => {
                setSelectedTerm(e.target.value);
                setReportDoc(null);
              }}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 outline-hidden"
            >
              <option value="1">Midterm 1</option>
              <option value="2">Midterm 2</option>
            </select>
          </div>

          {/* Elementary Class (Filtered by active academicYear) */}
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">
              Kelas Elementary ({selectedYear})
            </label>
            <select
              value={selectedClassId}
              onChange={(e) => {
                setSelectedClassId(e.target.value);
                setSelectedStudentId('');
                setReportDoc(null);
              }}
              disabled={loadingClasses}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 outline-hidden disabled:opacity-50"
            >
              {loadingClasses ? (
                <option value="">Memuat kelas...</option>
              ) : classesList.length === 0 ? (
                <option value="">Tidak ada kelas di tahun {selectedYear}</option>
              ) : (
                classesList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* SN Student Selector */}
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">
              Pilih Siswa SN
            </label>
            <select
              value={selectedStudentId}
              onChange={(e) => {
                setSelectedStudentId(e.target.value);
                setReportDoc(null);
              }}
              disabled={loadingSnStudents || snStudentsList.length === 0}
              className="w-full p-2.5 bg-amber-50/70 border border-amber-300 rounded-xl text-xs font-black text-amber-950 focus:ring-2 focus:ring-amber-500 outline-hidden disabled:opacity-50"
            >
              {!selectedClassId ? (
                <option value="">Pilih kelas terlebih dahulu</option>
              ) : loadingSnStudents ? (
                <option value="">Memuat siswa SN...</option>
              ) : snStudentsList.length === 0 ? (
                <option value="">Belum ada siswa SN</option>
              ) : (
                snStudentsList.map((s) => (
                  <option key={s.studentId} value={s.studentId}>
                    {s.studentName} ({s.nisn || '-'})
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {/* Info or Warning when no SN students */}
        {!selectedClassId ? (
          <div className="p-3 bg-slate-100 rounded-2xl text-xs text-slate-600 flex items-center gap-2">
            <AlertCircle size={16} className="text-slate-500" />
            <span>Pilih kelas terlebih dahulu.</span>
          </div>
        ) : snStudentsList.length === 0 && !loadingSnStudents ? (
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="text-amber-600 shrink-0" />
              <span>Belum ada siswa SN yang ditetapkan Admin pada kelas ini.</span>
            </div>
            {isAdminUser && (
              <button
                onClick={() => setIsManageModalOpen(true)}
                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs transition-all cursor-pointer shrink-0"
              >
                Tetapkan Siswa SN Sekarang
              </button>
            )}
          </div>
        ) : null}
      </div>

      {/* 3. Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {[
          { id: 'GOALS', label: '1. Learning Goals & Remarks', icon: BookOpen, requiresStudent: true },
          { id: 'COMMENTS', label: '2. General Comments', icon: MessageSquare, requiresStudent: true },
          { id: 'REVIEW', label: '3. Review & Approval', icon: FileCheck2, requiresStudent: true },
          { id: 'PUBLISH', label: '4. Publish PDF', icon: Send, requiresStudent: true },
          { id: 'REKAP', label: '5. Rekap & Open Tracking', icon: Users, requiresStudent: false }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const isDisabled = tab.requiresStudent && !selectedStudentId;

          return (
            <button
              key={tab.id}
              onClick={() => {
                if (!isDisabled) setActiveTab(tab.id as any);
              }}
              disabled={isDisabled}
              className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                isActive
                  ? 'bg-slate-900 text-white shadow-md'
                  : isDisabled
                  ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 4. Active Tab Content */}
      {!selectedStudentId && activeTab !== 'REKAP' ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-4 shadow-xs">
          <div className="w-14 h-14 bg-amber-50 text-amber-800 rounded-2xl flex items-center justify-center mx-auto">
            <Users size={28} />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-800">
              Pilih Satu Siswa SN Terlebih Dahulu
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Seluruh Learning Goals, komentar umum, dan hasil publish dikelola secara terisolasi per siswa SN.
            </p>
          </div>
        </div>
      ) : loadingReportData && activeTab !== 'REKAP' ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-3 shadow-xs">
          <RefreshCw size={28} className="animate-spin text-amber-600 mx-auto" />
          <p className="text-xs font-bold text-slate-600">Memuat data rapor siswa SN...</p>
        </div>
      ) : (
        <div>
          {activeTab === 'GOALS' && reportDoc && selectedStudentObject && selectedClass && (
            <ElementaryMidtermSnLearningGoalsTab
              currentUser={effectiveUser}
              selectedClass={selectedClass}
              selectedStudent={selectedStudentObject}
              reportDoc={reportDoc}
              onUpdateReportDoc={(updated) => setReportDoc(updated)}
              onRefreshData={loadStudentReportData}
              loading={loadingReportData}
            />
          )}

          {activeTab === 'COMMENTS' && reportDoc && selectedStudentObject && selectedClass && (
            <ElementaryMidtermSnGeneralCommentsTab
              currentUser={effectiveUser}
              selectedClass={selectedClass}
              selectedStudent={selectedStudentObject}
              reportDoc={reportDoc}
              onUpdateReportDoc={(updated) => setReportDoc(updated)}
              onRefreshData={loadStudentReportData}
              loading={loadingReportData}
            />
          )}

          {activeTab === 'REVIEW' && reportDoc && selectedStudentObject && selectedClass && (
            <ElementaryMidtermSnReviewApprovalGenComTab
              currentUser={effectiveUser}
              selectedClass={selectedClass}
              selectedStudent={selectedStudentObject}
              reportDoc={reportDoc}
              onUpdateReportDoc={(updated) => setReportDoc(updated)}
              onRefreshData={loadStudentReportData}
              loading={loadingReportData}
            />
          )}

          {activeTab === 'PUBLISH' && reportDoc && selectedStudentObject && selectedClass && (
            <ElementaryMidtermSnPublishPdfTab
              currentUser={effectiveUser}
              selectedClass={selectedClass}
              selectedStudent={selectedStudentObject}
              reportDoc={reportDoc}
              publishedReports={publishedReports}
              reportConfig={reportConfig}
              onRefreshData={loadStudentReportData}
              loading={loadingReportData}
              signingDateRaw={signingDateRaw}
              cutoffDateRaw={cutoffDateRaw}
              showAttendanceRecap={showAttendanceRecap}
            />
          )}

          {activeTab === 'REKAP' && (
            <ElementaryMidtermSnRekapTab
              snStudentsList={snStudentsList}
              publishedReports={publishedReports}
              onSelectStudentById={(sId) => {
                setSelectedStudentId(sId);
                setActiveTab('GOALS');
              }}
              onRefreshData={loadStudentReportData}
              loading={loadingReportData}
            />
          )}
        </div>
      )}

      {/* 5. Manage SN Students Modal (Admin Only) */}
      {isManageModalOpen && selectedClass && (
        <ManageSnStudentsModal
          isOpen={isManageModalOpen}
          onClose={() => setIsManageModalOpen(false)}
          selectedClass={selectedClass}
          academicYear={selectedYear}
          currentUser={effectiveUser}
          onRefresh={async () => {
            await loadSnStudents();
          }}
        />
      )}
    </div>
  );
}

export default function ElementaryMidtermSnReportPage() {
  return (
    <ElementaryMidtermSnErrorBoundary>
      <ElementaryMidtermSnReportPageContent />
    </ElementaryMidtermSnErrorBoundary>
  );
}
