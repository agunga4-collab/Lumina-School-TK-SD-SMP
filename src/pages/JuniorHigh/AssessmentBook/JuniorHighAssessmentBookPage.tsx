import * as React from 'react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BookOpen,
  Calendar,
  Layers,
  Sparkles,
  Download,
  Settings,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Award,
  ChevronRight,
  Filter,
  FileSpreadsheet,
  Users,
  Edit3,
  GitBranch
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useAcademicYear } from '../../../context/AcademicYearContext';
import {
  Class,
  Student,
  LearningGoal,
  JHAssessmentLO,
  JHFormativeEntry,
  JHSummativeEntry,
  AssessmentBookOptions,
  DEFAULT_ASSESSMENT_BOOK_OPTIONS,
  ReportConfig
} from '../../../types';
import {
  getClasses,
  getActiveStudents,
  getReportConfig,
  db
} from '../../../lib/firebase';
import {
  getAssessmentBookOptions,
  getJuniorHighLGs,
  getLOsForLG,
  getFormativeEntries,
  getSummativeEntries
} from '../../../services/juniorHighAssessmentBookService';
import { getJHGradeLevelNumber } from '../../../services/juniorHighMidtermService';
import { FormativeMatrixGrid } from './components/FormativeMatrixGrid';
import { StudentRecapView } from './components/StudentRecapView';
import { FormativeAssessmentModal } from './components/FormativeAssessmentModal';
import { SummativeModal } from './components/SummativeModal';
import { ManageLOModal } from './components/ManageLOModal';
import { ProposeLGModal } from './components/ProposeLGModal';
import { BulkFormativeModal } from './components/BulkFormativeModal';
import { AssessmentBookSettingsModal } from './components/AssessmentBookSettingsModal';
import { exportJuniorHighAssessmentBookExcel } from '../../../utils/exportJuniorHighAssessmentBookExcel';
import { toast } from 'sonner';

const DEFAULT_JH_SUBJECTS = [
  'Bahasa Indonesia',
  'Science',
  'Mathematics',
  'English',
  'Social Studies and Civics',
  'Islamic Studies',
  'Quran Recitation',
  'Household & Urban Gardening',
  'Kewirausahaan',
  'Performing Arts',
  'Art & Makerspace',
  'Physical Education',
  'Digital Literacy'
];

export default function JuniorHighAssessmentBookPage() {
  const { currentUser, profile } = useAuth();
  const effectiveUser = (currentUser || profile) as any;
  const { activeYear } = useAcademicYear();

  // Role permissions
  const userRole = (effectiveUser?.role || (effectiveUser as any)?.roleId || '').toUpperCase();
  const isSuperAdmin = userRole === 'SUPER_ADMIN';
  const isHeadUnit = ['HEAD_UNIT', 'HEAD_JUNIOR'].includes(userRole);
  const isReadOnly = ['PRINCIPAL', 'VICE_PRINCIPAL'].includes(userRole);
  const isTeacher = ['TEACHER', 'HOMEROOM_TEACHER'].includes(userRole);

  // Primary filters
  const [selectedYear, setSelectedYear] = useState<string>(() => {
    return activeYear || '2025/2026';
  });
  const [selectedSemester, setSelectedSemester] = useState<string>('1');
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedSubject, setSelectedSubject] = useState<string>('Bahasa Indonesia');
  const [selectedLGId, setSelectedLGId] = useState<string>('');

  // View tab
  const [activeTab, setActiveTab] = useState<'MATRIX' | 'RECAP'>('MATRIX');

  // Master data
  const [classesList, setClassesList] = useState<Class[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [learningGoals, setLearningGoals] = useState<LearningGoal[]>([]);
  const [los, setLOs] = useState<JHAssessmentLO[]>([]);
  const [formativeEntries, setFormativeEntries] = useState<JHFormativeEntry[]>([]);
  const [summativeEntries, setSummativeEntries] = useState<JHSummativeEntry[]>([]);
  const [options, setOptions] = useState<AssessmentBookOptions>(DEFAULT_ASSESSMENT_BOOK_OPTIONS);

  // Loading states
  const [loadingClasses, setLoadingClasses] = useState<boolean>(true);
  const [loadingData, setLoadingData] = useState<boolean>(false);

  // Modals state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [proposeModalLG, setProposeModalLG] = useState<{
    isOpen: boolean;
    parentLG?: LearningGoal | null;
    existingLG?: LearningGoal | null;
  }>({
    isOpen: false,
    parentLG: null,
    existingLG: null
  });
  const [isManageLOOpen, setIsManageLOOpen] = useState(false);

  // Bulk Formative Modal state
  const [bulkModalState, setBulkModalState] = useState<{
    isOpen: boolean;
    lo: JHAssessmentLO | null;
  }>({
    isOpen: false,
    lo: null
  });

  // Formative Assessment Modal state
  const [formativeModalState, setFormativeModalState] = useState<{
    isOpen: boolean;
    student: Student | null;
    lo: JHAssessmentLO | null;
  }>({
    isOpen: false,
    student: null,
    lo: null
  });

  // Summative Assessment Modal state
  const [summativeModalState, setSummativeModalState] = useState<{
    isOpen: boolean;
    student: Student | null;
  }>({
    isOpen: false,
    student: null
  });

  const selectedClass = useMemo(() => {
    return classesList.find(c => c.id === selectedClassId) || null;
  }, [classesList, selectedClassId]);

  const gradeNumberStr = useMemo(() => {
    if (!selectedClass) return '';
    const num = getJHGradeLevelNumber(selectedClass);
    return num > 0 ? String(num) : '';
  }, [selectedClass]);

  const activeLG = useMemo(() => {
    return learningGoals.find(g => g.id === selectedLGId) || null;
  }, [learningGoals, selectedLGId]);

  // Requirement C & Item 3: Pembatasan guru untuk mata pelajaran
  const availableSubjects = useMemo(() => {
    if (!selectedClass) {
      return (isSuperAdmin || isHeadUnit || isReadOnly) ? DEFAULT_JH_SUBJECTS : [];
    }
    if (isSuperAdmin || isHeadUnit || isReadOnly) {
      return DEFAULT_JH_SUBJECTS;
    }

    const uid = effectiveUser?.uid || effectiveUser?.id;
    const classAssignedSubjects = (selectedClass.teacherAssignments || [])
      .filter(a => a.userId === uid)
      .map(a => (a as any).subject || (a as any).subjectId)
      .filter(Boolean);

    const userSubjects = effectiveUser?.assignedSubjects || effectiveUser?.subjects || [];
    const merged = Array.from(new Set([...classAssignedSubjects, ...userSubjects])).filter(Boolean);
    if (merged.length > 0) {
      return merged;
    }
    // Untuk TEACHER dan HOMEROOM_TEACHER tanpa penugasan: kembalikan [] (JANGAN fallback ke DEFAULT_JH_SUBJECTS)
    return [];
  }, [selectedClass, isSuperAdmin, isHeadUnit, isReadOnly, effectiveUser]);

  // Sync selectedSubject with available subjects
  useEffect(() => {
    if (availableSubjects.length > 0) {
      if (!availableSubjects.includes(selectedSubject)) {
        setSelectedSubject(availableSubjects[0]);
      }
    } else {
      setSelectedSubject('');
    }
  }, [availableSubjects, selectedSubject]);

  const isOwnUnusedLG = useMemo(() => {
    if (!activeLG) return false;
    const uid = effectiveUser?.uid || effectiveUser?.id;
    const isOwner = activeLG.createdBy === uid;
    const hasAssessments = los.length > 0 || formativeEntries.length > 0 || summativeEntries.length > 0;
    return isOwner && !hasAssessments;
  }, [activeLG, effectiveUser, los, formativeEntries, summativeEntries]);

  // Load Classes & Options on mount or academicYear change
  useEffect(() => {
    let isCancelled = false;
    const fetchInit = async () => {
      setLoadingClasses(true);
      try {
        const [allClasses, opts] = await Promise.all([
          getClasses(),
          getAssessmentBookOptions()
        ]);
        if (isCancelled) return;

        setOptions(opts);

        const raw = Array.isArray(allClasses) ? allClasses : [];
        let jhClasses = raw.filter(c => {
          if (!c) return false;
          const isJH = c.unitId === 'JUNIOR_HIGH';
          const isYr = c.academicYear === selectedYear;
          return isJH && isYr && c.status !== 'archived';
        });

        // Requirement C: Pembatasan guru untuk kelas
        // Untuk TEACHER/HOMEROOM_TEACHER, pemilih kelas hanya berisi yang ditugaskan padanya
        // (teacherAssignments, assignedTeacherIds, homeroomTeacherId). Super Admin dan Head Unit melihat semua.
        if (isTeacher && !isSuperAdmin && !isHeadUnit) {
          const uid = effectiveUser?.uid || effectiveUser?.id;
          jhClasses = jhClasses.filter(c => {
            const isHomeroom = c.homeroomTeacherId === uid;
            const inHomeroomIds = Array.isArray(c.homeroomTeacherIds) && c.homeroomTeacherIds.includes(uid);
            const inAssignedTeacherIds = Array.isArray(c.assignedTeacherIds) && c.assignedTeacherIds.includes(uid);
            const inAssignments = Array.isArray(c.teacherAssignments) && c.teacherAssignments.some(a => a.userId === uid);
            return isHomeroom || inHomeroomIds || inAssignedTeacherIds || inAssignments;
          });
        }

        setClassesList(jhClasses);
        if (jhClasses.length > 0) {
          setSelectedClassId(prev => (prev && jhClasses.some(c => c.id === prev) ? prev : jhClasses[0].id));
        } else {
          setSelectedClassId('');
        }
      } catch (err) {
        console.error('Error fetching init for Assessment Book:', err);
      } finally {
        if (!isCancelled) setLoadingClasses(false);
      }
    };

    fetchInit();
    return () => {
      isCancelled = true;
    };
  }, [selectedYear, isTeacher, isSuperAdmin, isHeadUnit, effectiveUser?.uid]);

  // Load Students for selected class
  useEffect(() => {
    if (!selectedClassId || !selectedYear) {
      setStudents([]);
      return;
    }
    let isCancelled = false;
    const fetchStudentsList = async () => {
      try {
        const list = await getActiveStudents(selectedClassId, selectedYear);
        if (isCancelled) return;
        const sorted = (list || []).sort((a, b) => {
          const numA = a.attendanceNumber ?? (a as any).noAbsen ?? 999;
          const numB = b.attendanceNumber ?? (b as any).noAbsen ?? 999;
          if (numA !== numB) return numA - numB;
          return (a.name || '').localeCompare(b.name || '');
        });
        setStudents(sorted);
      } catch (err) {
        console.error('Error loading students:', err);
      }
    };
    fetchStudentsList();
    return () => {
      isCancelled = true;
    };
  }, [selectedClassId, selectedYear]);

  // Load Learning Goals for selected subject & grade
  const loadLearningGoals = useCallback(async () => {
    try {
      const lgs = await getJuniorHighLGs(gradeNumberStr, selectedSubject, selectedYear);
      setLearningGoals(lgs);
      if (lgs.length > 0) {
        setSelectedLGId(prev => (prev && lgs.some(g => g.id === prev) ? prev : lgs[0].id));
      } else {
        setSelectedLGId('');
      }
    } catch (err) {
      console.error('Error loading LGs:', err);
    }
  }, [gradeNumberStr, selectedSubject, selectedYear]);

  useEffect(() => {
    loadLearningGoals();
  }, [loadLearningGoals]);

  // Load LOs, Formative Entries, and Summative Entries for active LG
  const loadAssessmentData = useCallback(async () => {
    if (!selectedClassId || !selectedSubject || !selectedLGId) {
      setLOs([]);
      setFormativeEntries([]);
      setSummativeEntries([]);
      return;
    }

    setLoadingData(true);
    try {
      const [loList, fEntries, sEntries] = await Promise.all([
        getLOsForLG({
          classId: selectedClassId,
          subjectId: selectedSubject,
          academicYear: selectedYear,
          semester: selectedSemester,
          lgId: selectedLGId
        }),
        getFormativeEntries({
          classId: selectedClassId,
          subjectId: selectedSubject,
          academicYear: selectedYear,
          semester: selectedSemester,
          lgId: selectedLGId
        }),
        getSummativeEntries({
          classId: selectedClassId,
          subjectId: selectedSubject,
          academicYear: selectedYear,
          semester: selectedSemester,
          lgId: selectedLGId
        })
      ]);

      setLOs(loList);
      setFormativeEntries(fEntries);
      setSummativeEntries(sEntries);
    } catch (err) {
      console.error('Error loading assessment data:', err);
      toast.error('Gagal memuat data asesmen');
    } finally {
      setLoadingData(false);
    }
  }, [selectedClassId, selectedSubject, selectedYear, selectedSemester, selectedLGId]);

  useEffect(() => {
    loadAssessmentData();
  }, [loadAssessmentData]);

  // Open Formative Modal
  const handleOpenFormativeModal = (student: Student, lo: JHAssessmentLO) => {
    setFormativeModalState({
      isOpen: true,
      student,
      lo
    });
  };

  // Open Summative Modal
  const handleOpenSummativeModal = (student: Student) => {
    setSummativeModalState({
      isOpen: true,
      student
    });
  };

  // Open Bulk Formative Modal
  const handleOpenBulkModal = (lo: JHAssessmentLO) => {
    setBulkModalState({
      isOpen: true,
      lo
    });
  };

  // Export Excel
  const handleExportExcel = () => {
    if (!activeLG) {
      toast.warning('Pilih Learning Goal terlebih dahulu');
      return;
    }
    if (students.length === 0) {
      toast.warning('Belum ada siswa di kelas ini');
      return;
    }

    exportJuniorHighAssessmentBookExcel({
      className: selectedClass?.name || 'Junior_High',
      subjectName: selectedSubject,
      academicYear: selectedYear,
      semester: selectedSemester,
      lg: activeLG,
      los,
      students,
      formativeEntries,
      summativeEntries
    });
    toast.success('File Excel Assessment Book berhasil diunduh!');
  };

  return (
    <div className="min-h-screen bg-slate-50/50 pb-16">
      {/* Top Banner / Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-blue-600 mb-1">
                <span>Lumina Junior High</span>
                <span>•</span>
                <span className="text-gray-500">Buku Asesmen Guru</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                <BookOpen size={24} className="text-blue-600" />
                Assessment Book
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">
                Pencatatan asesmen formatif harian berbasis Learning Objectives (LO) dan sumatif Learning Goals (LG).
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={loadAssessmentData}
                disabled={loadingData}
                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                title="Muat ulang data"
              >
                <RefreshCw size={14} className={loadingData ? 'animate-spin' : ''} />
                <span className="hidden sm:inline">Segarkan</span>
              </button>

              <button
                onClick={handleExportExcel}
                disabled={!activeLG || students.length === 0}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors disabled:opacity-50"
              >
                <Download size={14} />
                <span>Ekspor Excel</span>
              </button>

              {/* Requirement A.1: Tombol Pengaturan Opsi hanya tampil untuk Super Admin */}
              {isSuperAdmin && (
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
                  title="Pengaturan opsi dropdown"
                >
                  <Settings size={14} />
                  <span className="hidden sm:inline">Pengaturan Opsi</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        {/* Read-Only Notice for Principal / Vice Principal */}
        {isReadOnly && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-2 text-xs text-amber-900">
            <AlertCircle size={16} className="text-amber-600 shrink-0" />
            <span>Mode Baca-Saja: Sebagai {userRole}, Anda memiliki izin pemantauan capaian asesmen siswa tanpa akses ubah/input data.</span>
          </div>
        )}

        {/* Filter Bar */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Tahun Ajaran */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
              Tahun Ajaran
            </label>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 font-medium"
            >
              {['2024/2025', '2025/2026', '2026/2027'].map(yr => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>
          </div>

          {/* Semester */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
              Semester
            </label>
            <select
              value={selectedSemester}
              onChange={e => setSelectedSemester(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 font-medium"
            >
              <option value="1">Semester 1 (Ganjil)</option>
              <option value="2">Semester 2 (Genap)</option>
            </select>
          </div>

          {/* Kelas */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
              Kelas Junior High
            </label>
            <select
              value={selectedClassId}
              onChange={e => setSelectedClassId(e.target.value)}
              disabled={loadingClasses || classesList.length === 0}
              className="w-full text-xs px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 font-medium disabled:opacity-50"
            >
              {classesList.length === 0 ? (
                <option value="">Tidak ada kelas JH ditugaskan</option>
              ) : (
                classesList.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))
              )}
            </select>
          </div>

          {/* Mata Pelajaran */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
              Mata Pelajaran
            </label>
            <select
              value={selectedSubject}
              onChange={e => setSelectedSubject(e.target.value)}
              disabled={availableSubjects.length === 0}
              className="w-full text-xs px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 font-medium disabled:opacity-50"
            >
              {availableSubjects.length === 0 ? (
                <option value="">Tidak ada mata pelajaran yang ditugaskan</option>
              ) : (
                availableSubjects.map(subj => (
                  <option key={subj} value={subj}>{subj}</option>
                ))
              )}
            </select>
          </div>
        </div>

        {/* Banner peringatan jika guru tidak memiliki penugasan mapel pada kelas terpilih */}
        {isTeacher && !isSuperAdmin && !isHeadUnit && availableSubjects.length === 0 && (
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-2.5 text-xs text-amber-800">
            <AlertCircle size={16} className="text-amber-600 shrink-0" />
            <span className="font-medium">Belum ada penugasan mapel untuk kelas ini. Hubungi admin.</span>
          </div>
        )}

        {/* Learning Goal Selector & Active LG Card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-blue-50 text-blue-700">
                <Layers size={18} />
              </span>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                  Pilih Learning Goal (LG) yang Dinilai
                </h3>
                <p className="text-[11px] text-gray-500">
                  Target sumatif untuk capaian pembelajaran materi ini
                </p>
              </div>
            </div>

            {!isReadOnly && (
              <div className="flex items-center gap-2">
                {activeLG && isOwnUnusedLG && (
                  <button
                    onClick={() => setProposeModalLG({ isOpen: true, parentLG: null, existingLG: activeLG })}
                    className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                    title="Edit teks LG milik sendiri (belum ada riwayat penilaian)"
                  >
                    <Edit3 size={14} /> Edit LG
                  </button>
                )}
                {activeLG && !isOwnUnusedLG && (
                  <button
                    onClick={() => setProposeModalLG({ isOpen: true, parentLG: activeLG, existingLG: null })}
                    className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                    title="Ajukan versi baru dari LG ini (membuat draf v+1)"
                  >
                    <GitBranch size={14} /> Ajukan Versi Baru
                  </button>
                )}
                <button
                  onClick={() => setProposeModalLG({ isOpen: true, parentLG: null, existingLG: null })}
                  className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Sparkles size={14} /> Usulkan LG Baru
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
            <div className="md:col-span-2">
              <select
                value={selectedLGId}
                onChange={e => setSelectedLGId(e.target.value)}
                disabled={learningGoals.length === 0}
                className="w-full text-xs px-3 py-2.5 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 font-medium disabled:opacity-50"
              >
                {learningGoals.length === 0 ? (
                  <option value="">Belum ada Learning Goal untuk mapel/grade ini</option>
                ) : (
                  learningGoals.map(g => (
                    <option key={g.id} value={g.id}>
                      [{g.code || 'LG'}] {g.goalText?.slice(0, 90)}{g.goalText?.length > 90 ? '...' : ''}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="md:col-span-1 flex items-center justify-end">
              {activeLG ? (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-500">Status:</span>
                  <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                    activeLG.status === 'DRAFT'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {activeLG.status === 'DRAFT'
                      ? activeLG.reviewStatus === 'SUDAH_SESUAI'
                        ? 'Sudah Sesuai'
                        : 'Menunggu Persetujuan'
                      : 'Aktif / Published'}
                  </span>
                  {activeLG.strand && (
                    <span className="px-2 py-0.5 rounded-md font-medium text-[10px] bg-gray-100 text-gray-700">
                      {activeLG.strand}
                    </span>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          {/* Active LG Highlight Banner */}
          {activeLG ? (
            <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-100 flex items-start gap-2.5 text-xs text-blue-950">
              <span className="font-extrabold bg-blue-600 text-white px-1.5 py-0.5 rounded text-[10px] shrink-0 mt-0.5">
                {activeLG.code || 'LG'}
              </span>
              <div className="leading-relaxed">
                <span className="font-bold">Deskripsi Capaian Pembelajaran: </span>
                {activeLG.goalText}
              </div>
            </div>
          ) : (
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
              <AlertCircle size={16} className="text-amber-600 shrink-0" />
              <span>
                Tidak ditemukan Learning Goal untuk mata pelajaran {selectedSubject} pada tingkat kelas ini.
                {!isReadOnly && <> Silakan klik tombol <span className="font-bold">"Usulkan LG Baru"</span> di atas.</>}
              </span>
            </div>
          )}
        </div>

        {/* View Switcher Tabs */}
        {activeLG && (
          <div className="flex items-center justify-between border-b border-gray-200 pb-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('MATRIX')}
                className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                  activeTab === 'MATRIX'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                Matrix Asesmen (Grid)
              </button>
              <button
                onClick={() => setActiveTab('RECAP')}
                className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                  activeTab === 'RECAP'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                Rekap Capaian Siswa ({students.length})
              </button>
            </div>

            <div className="text-xs text-gray-500">
              <span className="font-bold text-gray-800">{los.length}</span> LO aktif • <span className="font-bold text-gray-800">{students.length}</span> siswa
            </div>
          </div>
        )}

        {/* Content View */}
        {activeLG ? (
          activeTab === 'MATRIX' ? (
            <FormativeMatrixGrid
              students={students}
              lg={activeLG}
              los={los}
              formativeEntries={formativeEntries}
              summativeEntries={summativeEntries}
              options={options}
              classId={selectedClassId}
              subjectId={selectedSubject}
              academicYear={selectedYear}
              semester={selectedSemester}
              teacherId={effectiveUser?.uid || ''}
              teacherName={effectiveUser?.displayName || effectiveUser?.name || 'Guru'}
              isReadOnly={isReadOnly}
              onOpenFormativeModal={handleOpenFormativeModal}
              onOpenSummativeModal={handleOpenSummativeModal}
              onOpenManageLOModal={() => setIsManageLOOpen(true)}
              onOpenBulkModal={handleOpenBulkModal}
              onRefreshData={loadAssessmentData}
            />
          ) : (
            <StudentRecapView
              students={students}
              lg={activeLG}
              los={los}
              formativeEntries={formativeEntries}
              summativeEntries={summativeEntries}
              onOpenFormativeModal={handleOpenFormativeModal}
              onOpenSummativeModal={handleOpenSummativeModal}
            />
          )
        ) : null}
      </div>

      {/* Modals */}
      {/* 1. Settings Modal (Super Admin only) */}
      {isSuperAdmin && (
        <AssessmentBookSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          initialOptions={options}
          onSaved={updated => setOptions(updated)}
        />
      )}

      {/* 2. Propose LG Modal */}
      {!isReadOnly && (
        <ProposeLGModal
          isOpen={proposeModalLG.isOpen}
          onClose={() => setProposeModalLG({ isOpen: false, parentLG: null, existingLG: null })}
          grade={gradeNumberStr || '7'}
          subject={selectedSubject}
          academicYear={selectedYear}
          teacherId={effectiveUser?.uid || ''}
          teacherName={effectiveUser?.displayName || effectiveUser?.name || 'Guru'}
          parentLG={proposeModalLG.parentLG}
          existingLG={proposeModalLG.existingLG}
          onSuccess={newId => {
            loadLearningGoals();
            setSelectedLGId(newId);
          }}
        />
      )}

      {/* 3. Manage LO Modal */}
      {activeLG && !isReadOnly && (
        <ManageLOModal
          isOpen={isManageLOOpen}
          onClose={() => setIsManageLOOpen(false)}
          lg={activeLG}
          classId={selectedClassId}
          subjectId={selectedSubject}
          academicYear={selectedYear}
          semester={selectedSemester}
          los={los}
          teacherUid={effectiveUser?.uid || ''}
          teacherName={effectiveUser?.displayName || effectiveUser?.name || 'Guru'}
          onRefresh={loadAssessmentData}
        />
      )}

      {/* 4. Bulk Formative Modal (Requirement H) */}
      {bulkModalState.isOpen && bulkModalState.lo && !isReadOnly && (
        <BulkFormativeModal
          isOpen={bulkModalState.isOpen}
          onClose={() => setBulkModalState({ isOpen: false, lo: null })}
          lo={bulkModalState.lo}
          students={students}
          classId={selectedClassId}
          subjectId={selectedSubject}
          academicYear={selectedYear}
          semester={selectedSemester}
          options={options}
          teacherId={effectiveUser?.uid || ''}
          teacherName={effectiveUser?.displayName || effectiveUser?.name || 'Guru'}
          onSuccess={loadAssessmentData}
        />
      )}

      {/* 5. Formative Assessment Modal */}
      {formativeModalState.isOpen && formativeModalState.student && formativeModalState.lo && (
        <FormativeAssessmentModal
          isOpen={formativeModalState.isOpen}
          onClose={() => setFormativeModalState({ isOpen: false, student: null, lo: null })}
          student={formativeModalState.student}
          lo={formativeModalState.lo}
          classId={selectedClassId}
          subjectId={selectedSubject}
          academicYear={selectedYear}
          semester={selectedSemester}
          options={options}
          historyEntries={formativeEntries.filter(
            e => e.studentId === formativeModalState.student?.id && e.loId === formativeModalState.lo?.id
          )}
          teacherId={effectiveUser?.uid || ''}
          teacherName={effectiveUser?.displayName || effectiveUser?.name || 'Guru'}
          isSuperAdmin={isSuperAdmin}
          isReadOnly={isReadOnly}
          onSaved={loadAssessmentData}
        />
      )}

      {/* 6. Summative Assessment Modal */}
      {summativeModalState.isOpen && summativeModalState.student && activeLG && (
        <SummativeModal
          isOpen={summativeModalState.isOpen}
          onClose={() => setSummativeModalState({ isOpen: false, student: null })}
          student={summativeModalState.student}
          lg={activeLG}
          los={los}
          loScores={(() => {
            const map: Record<string, any> = {};
            const sid = summativeModalState.student.id;
            for (const lo of los) {
              const matched = formativeEntries.filter(e => e.studentId === sid && e.loId === lo.id);
              if (matched.length > 0) {
                map[lo.id] = matched[matched.length - 1].comprehensionLevel;
              }
            }
            return map;
          })()}
          existingSummative={summativeEntries.find(e => e.studentId === summativeModalState.student?.id)}
          classId={selectedClassId}
          subjectId={selectedSubject}
          academicYear={selectedYear}
          semester={selectedSemester}
          options={options}
          teacherId={effectiveUser?.uid || ''}
          teacherName={effectiveUser?.displayName || effectiveUser?.name || 'Guru'}
          isReadOnly={isReadOnly}
          onSaved={loadAssessmentData}
        />
      )}
    </div>
  );
}
