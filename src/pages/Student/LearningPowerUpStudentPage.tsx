import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, FileText, ChevronRight, 
  Calendar, CheckCircle2, Clock, 
  AlertCircle, ChevronLeft, Loader2, 
  ShieldAlert, BookOpen, Languages, 
  BookMarked, Calculator, CheckSquare, 
  X, Info, Send, CornerDownLeft, AlertTriangle
} from 'lucide-react';
import { useOutletContext, Navigate } from 'react-router-dom';
import { User as AppUser, Student, LearningPowerUpAssignment, LpuAssignmentHistoryEntry } from '../../types';
import { cn } from '../../lib/utils';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { 
  doc, 
  getDoc, 
  query, 
  collection, 
  where, 
  getDocs, 
  setDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { db, handleFirestoreError } from '../../lib/firebase';
import { toast } from 'sonner';
import { formatLearningPowerUpDate } from '../../services/learningPowerUpService';

interface LearningPowerUpPackage {
  id: string; // learning_power_up_{classId}_{weekStartDate}
  unit: 'JUNIOR_HIGH';
  academicYearId: string;
  classId: string;
  weekStartDate: string;
  weekEndDate: string;
  weekLabel: string;
  tasks: {
    bahasaIndonesia: string | null;
    english: string | null;
    mengaji: string | null;
    numerasi: string | null;
  };
  copiedFromWeekId: string | null;
  createdBy: string;
  createdAt: any;
  updatedAt: any;
}

interface TaskProgressHistory {
  timestamp: string;
  action: 'SUBMIT' | 'REVISION_REQUEST' | 'RESUBMIT' | 'VERIFY';
  note?: string | null;
  actorName: string;
}

interface TaskProgress {
  id: string; // progress_{packageId}_{studentId}_{field}
  packageId: string;
  studentId: string;
  classId: string;
  academicYearId: string;
  field: 'bahasaIndonesia' | 'english' | 'mengaji' | 'numerasi';
  status: 'NOT_STARTED' | 'SUBMITTED' | 'REVISION_REQUIRED' | 'VERIFIED';
  submittedAt: any;
  verifiedAt: any;
  verifiedBy: string | null;
  revisionNote: string | null;
  revisedAt: any;
  updatedAt: any;
  history?: TaskProgressHistory[];
}

const CATEGORY_CONFIG = {
  bahasaIndonesia: {
    label: 'Bahasa Indonesia',
    icon: BookOpen,
    colorClass: 'text-blue-600 bg-blue-50 border-blue-200',
    accentColor: 'blue',
    cardBorder: 'hover:border-blue-300'
  },
  english: {
    label: 'English',
    icon: Languages,
    colorClass: 'text-violet-600 bg-violet-50 border-violet-200',
    accentColor: 'violet',
    cardBorder: 'hover:border-violet-300'
  },
  mengaji: {
    label: 'Mengaji',
    icon: BookMarked,
    colorClass: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    accentColor: 'emerald',
    cardBorder: 'hover:border-emerald-300'
  },
  numerasi: {
    label: 'Numerasi',
    icon: Calculator,
    colorClass: 'text-amber-600 bg-amber-50 border-amber-200',
    accentColor: 'amber',
    cardBorder: 'hover:border-amber-300'
  }
};

const formatLpuDateTime = (value: any, fallback: string = '-'): string => {
  if (value === null || value === undefined || value === '') return fallback;
  
  let d: Date;
  
  if (value && typeof value.toDate === 'function') {
    try {
      d = value.toDate();
    } catch (e) {
      return fallback;
    }
  } 
  else if (value && typeof value === 'object' && 'seconds' in value) {
    try {
      const secs = Number(value.seconds);
      const nanos = Number(value.nanoseconds || 0);
      d = new Date(secs * 1000 + Math.floor(nanos / 1_000_000));
    } catch (e) {
      return fallback;
    }
  } 
  else if (value instanceof Date) {
    d = value;
  } 
  else if (typeof value === 'number') {
    d = new Date(value);
  } 
  else if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      try {
        const parts = value.split('-');
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        d = new Date(year, month, day, 12, 0, 0);
      } catch (e) {
        return fallback;
      }
    } else {
      d = new Date(value);
    }
  } 
  else {
    return fallback;
  }

  if (!d || isNaN(d.getTime())) return fallback;

  try {
    const idMonths = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const day = d.getDate();
    const month = idMonths[d.getMonth()];
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day} ${month} ${year}, ${hours}.${minutes}`;
  } catch (e) {
    return fallback;
  }
};

const formatLpuDate = (value: any, fallback: string = '-'): string => {
  if (value === null || value === undefined || value === '') return fallback;
  
  let d: Date;
  
  if (value && typeof value.toDate === 'function') {
    try {
      d = value.toDate();
    } catch (e) {
      return fallback;
    }
  } 
  else if (value && typeof value === 'object' && 'seconds' in value) {
    try {
      const secs = Number(value.seconds);
      const nanos = Number(value.nanoseconds || 0);
      d = new Date(secs * 1000 + Math.floor(nanos / 1_000_000));
    } catch (e) {
      return fallback;
    }
  } 
  else if (value instanceof Date) {
    d = value;
  } 
  else if (typeof value === 'number') {
    d = new Date(value);
  } 
  else if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      try {
        const parts = value.split('-');
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        d = new Date(year, month, day, 12, 0, 0);
      } catch (e) {
        return fallback;
      }
    } else {
      d = new Date(value);
    }
  } 
  else {
    return fallback;
  }

  if (!d || isNaN(d.getTime())) return fallback;

  try {
    const idMonths = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const day = d.getDate();
    const month = idMonths[d.getMonth()];
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  } catch (e) {
    return fallback;
  }
};

class LearningPowerUpStudentErrorBoundary extends React.Component<any, any> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    if (process.env.NODE_ENV !== 'production') {
      console.error("Learning Power-Up Student Error Boundary caught an error:", error, errorInfo);
    }
  }

  render() {
    if ((this as any).state.hasError) {
      return (
        <div className="p-8 bg-rose-50/50 rounded-3xl border border-rose-100 text-center max-w-lg mx-auto my-12 space-y-4 relative z-10 bg-white shadow-xl">
          <p className="text-sm font-black text-rose-600">
            Terjadi masalah saat memuat Learning Power-Up.
          </p>
          <p className="text-xs text-gray-500 font-bold leading-normal">
            Halaman gagal dimuat karena kesalahan yang tidak terduga atau data yang tidak valid. Silakan muat ulang halaman untuk mencoba kembali.
          </p>
          <button
            type="button"
            onClick={() => {
              (this as any).setState({ hasError: false });
              window.location.reload();
            }}
            className="bg-rose-600 hover:bg-rose-700 text-white font-black px-6 py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
          >
            Muat Ulang
          </button>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

export default function LearningPowerUpStudentPage() {
  return (
    <LearningPowerUpStudentErrorBoundary>
      <LearningPowerUpStudentPageContent />
    </LearningPowerUpStudentErrorBoundary>
  );
}

function LearningPowerUpStudentPageContent() {
  const { currentUser } = useOutletContext<{ currentUser: AppUser }>();
  
  if (currentUser?.role !== 'STUDENT') {
    return <Navigate to="/" replace />;
  }

  const { activeYear } = useAcademicYear();
  const [studentData, setStudentData] = React.useState<Student | null>(null);
  const [classData, setClassData] = React.useState<any | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [dataError, setDataError] = React.useState<string | null>(null);
  const [isValidated, setIsValidated] = React.useState(false);

  // Feature specific states
  const [packages, setPackages] = React.useState<LearningPowerUpPackage[]>([]);
  const [progresses, setProgresses] = React.useState<Record<string, TaskProgress>>({});
  const [assignments, setAssignments] = React.useState<LearningPowerUpAssignment[]>([]);
  interface UnifiedWeek {
    id: string;
    weekStartDate: string;
    weekEndDate: string;
    weekLabel: string;
  }
  const [weeks, setWeeks] = React.useState<UnifiedWeek[]>([]);
  const [selectedWeek, setSelectedWeek] = React.useState<string>('');
  const [loadingTasks, setLoadingTasks] = React.useState(false);

  // Detail popup states
  const [activeTaskDetail, setActiveTaskDetail] = React.useState<{
    field: 'bahasaIndonesia' | 'english' | 'mengaji' | 'numerasi';
    taskDescription: string;
    isDifferentiated: boolean;
    assignment?: LearningPowerUpAssignment;
  } | null>(null);
  const [isSubmittingAction, setIsSubmittingAction] = React.useState(false);

  // Validate student account on mount
  React.useEffect(() => {
    const validateAndFetch = async () => {
      if (!currentUser) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setDataError(null);
      setIsValidated(false);

      try {
        const studentId = currentUser.luminaId;
        if (!studentId || !studentId.trim()) {
          setDataError("Data akun siswa belum terhubung dengan data kelas. Silakan hubungi admin.");
          setLoading(false);
          return;
        }

        const studentProfileRef = doc(db, 'students', studentId.trim());
        const studentProfileSnap = await getDoc(studentProfileRef);
        if (!studentProfileSnap.exists()) {
          setDataError("Data akun siswa belum terhubung dengan data kelas. Silakan hubungi admin.");
          setLoading(false);
          return;
        }
        const studentProfile = { id: studentProfileSnap.id, ...studentProfileSnap.data() } as Student;

        if (!activeYear) {
          setDataError("Tahun ajaran aktif belum ditentukan. Silakan hubungi admin.");
          setLoading(false);
          return;
        }

        const qEnroll = query(
          collection(db, 'enrollments'),
          where('studentId', '==', studentId.trim()),
          where('academicYear', '==', activeYear)
        );
        const qEnrollSnap = await getDocs(qEnroll);
        
        let enrollment = null;
        if (!qEnrollSnap.empty) {
          enrollment = qEnrollSnap.docs[0].data();
        }

        if (!enrollment) {
          setDataError("Data akun siswa belum terhubung dengan data kelas. Silakan hubungi admin.");
          setLoading(false);
          return;
        }

        const classDocRef = doc(db, 'classes', enrollment.classId);
        const classDocSnap = await getDoc(classDocRef);
        let classDetails = null;
        if (classDocSnap.exists()) {
          classDetails = { id: classDocSnap.id, ...classDocSnap.data() };
        } else {
          const qClass = query(
            collection(db, 'classes'),
            where('name', '==', enrollment.classId)
          );
          const qClassSnap = await getDocs(qClass);
          if (!qClassSnap.empty) {
            classDetails = { id: qClassSnap.docs[0].id, ...qClassSnap.docs[0].data() };
          }
        }

        setStudentData(studentProfile);
        setClassData(classDetails);
        setIsValidated(true);
      } catch (err: any) {
        console.error("Critical student validation failed:", err);
        setDataError("Terjadi kesalahan memuat data siswa. Silakan coba beberapa saat lagi atau hubungi admin.");
      } finally {
        setLoading(false);
      }
    };

    validateAndFetch();
  }, [currentUser, activeYear]);

  // Load Packages and Progresses
  const loadTasksAndProgress = async () => {
    if (!classData || !studentData || !activeYear) return;
    setLoadingTasks(true);
    try {
      // 1. Fetch weekly task packages
      const qPackages = query(
        collection(db, 'learning_power_up_tasks'),
        where('academicYearId', '==', activeYear),
        where('classId', '==', classData.id)
      );

      const packagesSnap = await getDocs(qPackages);
      const loadedPackages = packagesSnap.docs.map(d => ({
        id: d.id,
        ...d.data()
      })) as LearningPowerUpPackage[];

      // Sort by start date descending
      loadedPackages.sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate));
      setPackages(loadedPackages);

      // 2. Fetch student's progress
      const qProgress = query(
        collection(db, 'learning_power_up_progress'),
        where('studentId', '==', studentData.id),
        where('classId', '==', classData.id),
        where('academicYearId', '==', activeYear)
      );
      const progressSnap = await getDocs(qProgress);
      const progressMap: Record<string, TaskProgress> = {};
      progressSnap.docs.forEach(d => {
        const p = d.data() as TaskProgress;
        progressMap[`${p.packageId}_${p.field}`] = { id: d.id, ...p };
      });
      setProgresses(progressMap);

      // 3. Fetch student's individual assignments
      const qAssignments = query(
        collection(db, 'learning_power_up_assignments'),
        where('studentId', '==', studentData.id),
        where('academicYearId', '==', activeYear)
      );
      const assignmentsSnap = await getDocs(qAssignments);
      const loadedAssignments = assignmentsSnap.docs.map(d => ({
        id: d.id,
        ...d.data()
      })) as LearningPowerUpAssignment[];
      setAssignments(loadedAssignments);

      // 4. Build unified weeks
      const weekMap = new Map<string, UnifiedWeek>();
      loadedPackages.forEach(p => {
        weekMap.set(p.weekStartDate, {
          id: p.id,
          weekStartDate: p.weekStartDate,
          weekEndDate: p.weekEndDate,
          weekLabel: p.weekLabel
        });
      });
      loadedAssignments.forEach(asg => {
        if (!weekMap.has(asg.weekStartDate)) {
          weekMap.set(asg.weekStartDate, {
            id: 'diff_' + asg.weekStartDate,
            weekStartDate: asg.weekStartDate,
            weekEndDate: asg.weekEndDate,
            weekLabel: asg.weekLabel
          });
        }
      });

      const sortedWeeks = Array.from(weekMap.values()).sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate));
      setWeeks(sortedWeeks);

      if (sortedWeeks.length > 0 && !selectedWeek) {
        setSelectedWeek(sortedWeeks[0].id);
      }
    } catch (err: any) {
      console.error("Error loading learning power-up packages/progress/assignments:", err);
      toast.error("Gagal memuat tugas mingguan.");
      handleFirestoreError(err, 'list', 'learning_power_up_tasks');
    } finally {
      setLoadingTasks(false);
    }
  };

  React.useEffect(() => {
    if (isValidated && classData && studentData) {
      loadTasksAndProgress();
    }
  }, [isValidated, classData, studentData, activeYear]);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-12 h-12 text-[#109E58] animate-spin" />
        <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Memvalidasi Data Akun...</p>
      </div>
    );
  }

  if (dataError) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 bg-white border border-red-100 rounded-[2rem] shadow-xl shadow-red-50/50 flex flex-col items-center text-center space-y-6">
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center">
          <ShieldAlert size={32} />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-black text-gray-900 tracking-tight">Koneksi Akun Terganggu</h2>
          <p className="text-sm text-gray-500 font-medium leading-relaxed">{dataError}</p>
        </div>
        <div className="w-full pt-2">
          <button
            onClick={() => window.location.reload()}
            className="w-full py-4 bg-gray-900 hover:bg-gray-800 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-sm"
          >
            Segarkan Halaman
          </button>
        </div>
      </div>
    );
  }

  if (!isValidated || !studentData || !classData) {
    return null;
  }

  // Find current selected unified week
  const activeUnifiedWeek = weeks.find(w => w.id === selectedWeek);

  // Current selected legacy package, if any, matching the selected unified week start date
  const activePackage = activeUnifiedWeek ? packages.find(p => p.weekStartDate === activeUnifiedWeek.weekStartDate) : null;
  
  // Extract active fields of the current selected week. 
  // A field is active if there is an individual assignment OR a legacy package task with text.
  const activeFields = activeUnifiedWeek ? (['bahasaIndonesia', 'english', 'mengaji', 'numerasi'] as const).filter(field => {
    // Has individual assignment?
    const hasAsg = assignments.some(asg => asg.weekStartDate === activeUnifiedWeek.weekStartDate && asg.subjectKey === field);
    if (hasAsg) return true;
    // Or has legacy package task?
    const legPack = packages.find(p => p.weekStartDate === activeUnifiedWeek.weekStartDate);
    return !!(legPack && legPack.tasks[field] && legPack.tasks[field]?.trim());
  }) : [];

  // Summary counts for current selected week
  const totalWeekTasks = activeFields.length;
  const verifiedCount = activeUnifiedWeek ? activeFields.filter(field => {
    // Individual assignment has priority
    const asg = assignments.find(a => a.weekStartDate === activeUnifiedWeek.weekStartDate && a.subjectKey === field);
    if (asg) {
      return asg.status === 'VERIFIED';
    }
    const legPack = packages.find(p => p.weekStartDate === activeUnifiedWeek.weekStartDate);
    if (legPack) {
      return progresses[`${legPack.id}_${field}`]?.status === 'VERIFIED';
    }
    return false;
  }).length : 0;

  // Overdue status check helper
  const isOverdue = (endDate: string) => {
    const today = new Date().toISOString().split('T')[0];
    return today > endDate;
  };

  // Status badges UI mapper
  const getStatusBadge = (status: TaskProgress['status'] | undefined, endDate: string, isCancelled?: boolean) => {
    if (isCancelled) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
          <AlertCircle size={14} className="text-slate-500" />
          Tugas Dibatalkan Guru
        </span>
      );
    }
    const overdue = isOverdue(endDate) && status !== 'VERIFIED';
    switch (status) {
      case 'VERIFIED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 size={14} className="text-emerald-500" />
            Selesai & Terverifikasi
          </span>
        );
      case 'SUBMITTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock size={14} className="text-amber-500 animate-pulse" />
            Menunggu Verifikasi Guru
          </span>
        );
      case 'REVISION_REQUIRED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertTriangle size={14} className="text-rose-500" />
            Perlu Revisi
          </span>
        );
      default:
        if (overdue) {
          return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200 animate-pulse">
              <AlertCircle size={14} className="text-red-500" />
              Terlambat (Belum Selesai)
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-slate-50 text-slate-500 border border-slate-200">
            <CheckSquare size={14} className="text-slate-400" />
            Belum Dikerjakan
          </span>
        );
    }
  };

  // Submit task completion action handler
  const handleTaskSubmit = async (field: 'bahasaIndonesia' | 'english' | 'mengaji' | 'numerasi', isRevision: boolean) => {
    if (!activePackage) return;
    setIsSubmittingAction(true);
    try {
      const progressKey = `${activePackage.id}_${field}`;
      const progressId = progresses[progressKey]?.id || `progress_${activePackage.id}_${studentData.id}_${field}`;
      const currentHistory = progresses[progressKey]?.history || [];
      const nowStr = new Date().toLocaleString('id-ID', { hour12: false });
      
      const newHistoryItem: TaskProgressHistory = {
        timestamp: nowStr,
        action: isRevision ? 'RESUBMIT' : 'SUBMIT',
        actorName: studentData.name,
        note: isRevision ? "Siswa mengirim ulang tugas setelah revisi." : "Siswa menandai tugas selesai."
      };

      const updatedProgress = {
        id: progressId,
        packageId: activePackage.id,
        studentId: studentData.id,
        classId: classData.id,
        academicYearId: activeYear,
        field: field,
        status: 'SUBMITTED',
        submittedAt: serverTimestamp(),
        verifiedAt: progresses[progressKey]?.verifiedAt || null,
        verifiedBy: progresses[progressKey]?.verifiedBy || null,
        revisionNote: progresses[progressKey]?.revisionNote || null,
        revisedAt: isRevision ? serverTimestamp() : (progresses[progressKey]?.revisedAt || null),
        updatedAt: serverTimestamp(),
        history: [...currentHistory, newHistoryItem]
      };

      await setDoc(doc(db, 'learning_power_up_progress', progressId), updatedProgress, { merge: true });
      toast.success(isRevision ? "Tugas berhasil dikirim ulang!" : "Tugas berhasil ditandai selesai.");
      
      // Reload lists
      await loadTasksAndProgress();
    } catch (err) {
      console.error("Error submitting learning power up task:", err);
      toast.error("Gagal mengirim laporan tugas.");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Submit differentiated assignment completion action handler
  const handleAssignmentSubmit = async (assignmentId: string, isRevision: boolean) => {
    const asg = assignments.find(a => a.id === assignmentId);
    if (!asg) return;
    setIsSubmittingAction(true);
    try {
      const currentHistory = asg.history || [];
      const now = new Date();
      
      const newHistoryItem: LpuAssignmentHistoryEntry = {
        action: 'SUBMIT',
        performedByUid: currentUser.uid,
        performedByName: studentData.name,
        performedByRole: 'STUDENT',
        timestamp: now,
        note: isRevision ? "Siswa mengirim ulang tugas setelah revisi." : "Siswa menandai tugas selesai."
      };

      const docRef = doc(db, 'learning_power_up_assignments', asg.id);
      
      const updatedFields = {
        status: 'SUBMITTED',
        submittedAt: serverTimestamp(),
        history: [...currentHistory, newHistoryItem],
        updatedAt: serverTimestamp()
      };

      await setDoc(docRef, updatedFields, { merge: true });
      toast.success(isRevision ? "Tugas berhasil dikirim ulang!" : "Tugas berhasil ditandai selesai.");
      
      // Update activeTaskDetail to reflect the newly submitted assignment in the modal
      if (activeTaskDetail && activeTaskDetail.assignment?.id === asg.id) {
        setActiveTaskDetail(prev => {
          if (!prev) return null;
          return {
            ...prev,
            assignment: {
              ...asg,
              status: 'SUBMITTED',
              submittedAt: now,
              history: [...currentHistory, newHistoryItem]
            }
          };
        });
      }

      // Reload lists
      await loadTasksAndProgress();
    } catch (err: any) {
      console.error("Error submitting assignment:", err);
      toast.error("Gagal mengirim laporan tugas.");
      handleFirestoreError(err, 'update', `learning_power_up_assignments/${asg.id}`);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Determine overall uncompleted active task fields for the current selected week
  const uncompletedActiveFieldsCount = activeUnifiedWeek ? activeFields.filter(field => {
    const asg = assignments.find(a => a.weekStartDate === activeUnifiedWeek.weekStartDate && a.subjectKey === field);
    if (asg) {
      return asg.status === 'ASSIGNED' || asg.status === 'REVISION_REQUIRED';
    }
    const legPack = packages.find(p => p.weekStartDate === activeUnifiedWeek.weekStartDate);
    if (legPack) {
      const status = progresses[`${legPack.id}_${field}`]?.status || 'NOT_STARTED';
      return status === 'NOT_STARTED' || status === 'REVISION_REQUIRED';
    }
    return false;
  }).length : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8" id="learning-power-up-student-root">
      
      {/* Reminder Panel */}
      {uncompletedActiveFieldsCount > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between gap-4 shadow-sm"
          id="student-powerup-reminder"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
              <AlertTriangle size={20} />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-900">Pengingat Penguatan Belajar</p>
              <p className="text-xs text-amber-700 font-medium">
                Masih ada {uncompletedActiveFieldsCount} bidang tugas Learning Power-Up yang perlu diselesaikan pekan ini.
              </p>
            </div>
          </div>
          <div className="text-xs font-bold text-amber-800 bg-white px-3 py-1.5 rounded-full border border-amber-200">
            Perlu Tindakan
          </div>
        </motion.div>
      )}

      {/* Header Panel */}
      <div className="bg-white rounded-[2rem] border border-slate-100 p-8 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <span className="px-3 py-1 bg-[#109E58]/10 text-[#109E58] text-[10px] font-black uppercase tracking-widest rounded-full border border-[#109E58]/20">
            Lumina Junior High — Learning Power-Up
          </span>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">
            Learning Power-Up Saya
          </h1>
          <p className="text-sm text-gray-500 font-medium">
            Pantau dan selesaikan penguatan belajarmu setiap minggu.
          </p>
          
          <div className="flex flex-wrap gap-x-4 gap-y-2 pt-2 text-xs font-semibold text-gray-500">
            <span className="bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100">
              Siswa: <strong className="text-gray-900">{studentData.name}</strong>
            </span>
            <span className="bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100">
              Kelas: <strong className="text-gray-900">{classData.name}</strong>
            </span>
            <span className="bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100">
              Tahun Ajaran: <strong className="text-gray-900">{activeYear}</strong>
            </span>
          </div>
        </div>

        {/* Progress summary widget */}
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6 md:w-80 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-gray-500 uppercase tracking-widest">Progres Pekan Ini</span>
            <span className="text-sm font-black text-slate-700 bg-white px-2.5 py-1 rounded-lg border border-slate-200/60">
              {verifiedCount} dari {totalWeekTasks} Selesai
            </span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
            <div 
              className="bg-[#109E58] h-full rounded-full transition-all duration-500" 
              style={{ width: `${totalWeekTasks > 0 ? (verifiedCount / totalWeekTasks) * 100 : 0}%` }}
            />
          </div>
          <p className="text-[11px] text-gray-400 font-bold leading-none">
            *Otoritas verifikasi final ada pada Guru / Coach kelasmu.
          </p>
        </div>
      </div>

      {/* Week Selector and Tasks Grid */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-gray-900">Daftar Tugas Pekan Ini</h2>
            <p className="text-xs font-medium text-gray-400">Pilih pekan untuk melihat instruksi dan status penyelesaian tugas.</p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Pilih Pekan:</span>
            {weeks.length > 0 ? (
              <select
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(e.target.value)}
                className="bg-white border border-slate-200 text-gray-700 font-bold text-sm px-4 py-2.5 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-[#109E58]/20 focus:border-[#109E58]"
              >
                {weeks.map(w => (
                  <option key={w.id} value={w.id}>{w.weekLabel}</option>
                ))}
              </select>
            ) : (
              <div className="text-xs font-bold text-gray-400 bg-slate-50 border border-slate-100 px-3 py-2 rounded-xl">
                Tidak ada pekan tersedia
              </div>
            )}
          </div>
        </div>

        {/* Tasks Grid */}
        {loadingTasks ? (
          <div className="min-h-[20vh] flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-8 h-8 text-[#109E58] animate-spin" />
            <p className="text-xs text-gray-400 font-bold">Memuat daftar tugas...</p>
          </div>
        ) : activeFields.length > 0 && activeUnifiedWeek ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" id="tasks-list-grid">
            {activeFields.map(field => {
              const cfg = CATEGORY_CONFIG[field];
              const IconComp = cfg.icon;

              // Check if there's a differentiated assignment for this week & subject
              const asg = assignments.find(a => a.weekStartDate === activeUnifiedWeek.weekStartDate && a.subjectKey === field);
              
              let status: 'NOT_STARTED' | 'SUBMITTED' | 'REVISION_REQUIRED' | 'VERIFIED' = 'NOT_STARTED';
              let overdue: boolean = false;
              let taskDescription: string = '';
              let title: string = `Tugas ${cfg.label}`;
              let isDifferentiated = false;
              let weekLabel = activeUnifiedWeek.weekLabel;
              let weekEndDate = activeUnifiedWeek.weekEndDate;

              if (asg) {
                status = asg.status === 'ASSIGNED' ? 'NOT_STARTED' : asg.status;
                overdue = isOverdue(asg.weekEndDate) && status !== 'VERIFIED';
                taskDescription = asg.taskInstructions;
                title = asg.taskTitle;
                isDifferentiated = true;
                weekLabel = asg.weekLabel;
                weekEndDate = asg.weekEndDate;
              } else if (activePackage) {
                const progress = progresses[`${activePackage.id}_${field}`];
                status = progress?.status || 'NOT_STARTED';
                overdue = isOverdue(activePackage.weekEndDate) && status !== 'VERIFIED';
                taskDescription = activePackage.tasks[field] || '';
                title = `Tugas ${cfg.label}`;
                weekLabel = activePackage.weekLabel;
                weekEndDate = activePackage.weekEndDate;
              }

              return (
                <div 
                  key={field}
                  className={cn(
                    "bg-white border border-slate-100 rounded-[2rem] p-6 shadow-sm transition-all duration-300 flex flex-col justify-between space-y-6 relative overflow-hidden",
                    cfg.cardBorder,
                    overdue && "border-red-200 bg-red-50/10 shadow-sm shadow-red-50"
                  )}
                  id={`task-card-${field}`}
                >
                  {overdue && (
                    <div className="absolute top-0 right-0 bg-red-500 text-white font-black text-[9px] uppercase tracking-widest px-3 py-1 rounded-bl-xl shadow-sm">
                      Terlambat
                    </div>
                  )}

                  <div className="space-y-4">
                    {/* Category Icon and Label */}
                    <div className="flex items-center gap-2.5">
                      <div className={cn("w-10 h-10 rounded-xl border flex items-center justify-center shrink-0", cfg.colorClass)}>
                        <IconComp size={20} />
                      </div>
                      <div>
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block leading-none mb-1">
                          KATEGORI
                        </span>
                        <h4 className="text-xs font-bold text-gray-800 leading-none">
                          {cfg.label}
                        </h4>
                      </div>
                    </div>

                    {/* Task Title */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="text-md font-bold text-gray-900 tracking-tight line-clamp-2">
                          {title}
                        </h3>
                        {isDifferentiated && asg && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#109E58]/10 text-[#109E58] border border-[#109E58]/20 shrink-0">
                            Level {asg.levelSnapshot}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 font-medium">
                        Pekan: {weekLabel}
                      </p>
                    </div>

                    {/* Instruction Summary */}
                    <p className="text-xs text-gray-500 font-medium line-clamp-3 bg-slate-50 p-3 rounded-xl border border-slate-100/50">
                      {taskDescription}
                    </p>
                  </div>

                  {/* Footer Stats & CTA */}
                  <div className="space-y-4 pt-4 border-t border-slate-100/60">
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                        Batas Waktu:
                      </span>
                      <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                        <Calendar size={14} className="text-gray-400" />
                        {weekEndDate ? formatLearningPowerUpDate(weekEndDate) : '-'}
                      </span>
                    </div>

                    {/* Status Badge */}
                    <div className="pt-1">
                      {getStatusBadge(status, weekEndDate, asg?.isCancelled)}
                    </div>

                    {/* Action Button */}
                    <button
                      onClick={() => setActiveTaskDetail({ 
                        field, 
                        taskDescription, 
                        isDifferentiated: isDifferentiated, 
                        assignment: asg 
                      })}
                      className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 mt-2"
                    >
                      Tampilkan Detail
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-slate-50 border border-slate-100 rounded-[2rem] p-12 text-center max-w-xl mx-auto space-y-4" id="empty-tasks-state">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 mx-auto">
              <CheckSquare size={32} />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-black text-gray-900">Belum Ada Tugas Pekan Ini</h3>
              <p className="text-sm text-gray-500 font-semibold leading-relaxed">
                Seluruh tugas Learning Power-Up untuk kelasmu belum dirilis oleh guru/coach, atau semua pekan telah selesai. Silakan hubungi coach kelasmu jika ada pertanyaan.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Modal Detail Tugas */}
      <AnimatePresence>
        {activeTaskDetail && (
          (() => {
            const isDiff = activeTaskDetail.isDifferentiated;
            const asg = activeTaskDetail.assignment;
            const cfg = CATEGORY_CONFIG[activeTaskDetail.field];
            
            const rawStatus = isDiff && asg ? asg.status : (activePackage ? (progresses[`${activePackage.id}_${activeTaskDetail.field}`]?.status || 'NOT_STARTED') : 'NOT_STARTED');
            const status: "NOT_STARTED" | "SUBMITTED" | "REVISION_REQUIRED" | "VERIFIED" = rawStatus === 'ASSIGNED' ? 'NOT_STARTED' : rawStatus;
            const revisionNote = isDiff && asg ? asg.revisionNote : (activePackage ? progresses[`${activePackage.id}_${activeTaskDetail.field}`]?.revisionNote : undefined);
            const history = isDiff && asg ? asg.history : (activePackage ? (progresses[`${activePackage.id}_${activeTaskDetail.field}`]?.history || []) : []);
            
            const weekLabel = isDiff && asg ? asg.weekLabel : (activeUnifiedWeek?.weekLabel || '');
            const weekEndDate = isDiff && asg ? asg.weekEndDate : (activeUnifiedWeek?.weekEndDate || '');
            const title = isDiff && asg ? asg.taskTitle : `Tugas Penguatan ${cfg?.label}`;
            
            const getFormattedTime = (ts: any) => {
              if (!ts) return '';
              if (typeof ts === 'string') return ts;
              if (ts.toDate && typeof ts.toDate === 'function') {
                return ts.toDate().toLocaleString('id-ID', { hour12: false });
              }
              if (ts.seconds) {
                return new Date(ts.seconds * 1000).toLocaleString('id-ID', { hour12: false });
              }
              return '';
            };

            return (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto" id="task-detail-modal-overlay">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: 15 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 15 }}
                  className="bg-white rounded-[2.5rem] shadow-2xl max-w-5xl w-full overflow-hidden flex flex-col md:flex-row relative"
                  id="task-detail-modal-body"
                >
                  {/* Close Button */}
                  <button 
                    onClick={() => setActiveTaskDetail(null)}
                    className="absolute top-6 right-6 p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-all z-10"
                  >
                    <X size={18} />
                  </button>

                  {/* KOTAK KIRI - TUGAS SAYA */}
                  <div className="flex-1 p-8 md:p-10 border-r border-slate-100 bg-white space-y-6">
                    <div>
                      <span className="px-3 py-1.5 bg-[#109E58]/10 text-[#109E58] text-[9px] font-black uppercase tracking-widest rounded-full border border-[#109E58]/20 inline-block mb-3">
                        KOTAK KIRI — TUGAS SAYA {isDiff && "— TERDIFERENSIASI"}
                      </span>
                      
                      <div className="flex items-center gap-3 mb-4">
                        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border", cfg?.colorClass)}>
                          {React.createElement(cfg?.icon || BookOpen, { size: 20 })}
                        </div>
                        <div>
                          <span className="text-[9px] font-black text-gray-400 tracking-wider block">KATEGORI TUGAS</span>
                          <h4 className="text-xs font-black text-gray-700">{cfg?.label}</h4>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-2xl font-black text-gray-900 tracking-tight">
                          {title}
                        </h3>
                        {isDiff && asg && (
                          <span className="px-3 py-1 bg-indigo-100 text-indigo-700 text-[11px] font-black uppercase tracking-wider rounded-xl border border-indigo-200 inline-block">
                            Level {asg.levelSnapshot}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Instruction container */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Instruksi Tugas</h4>
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-sm text-gray-700 font-medium leading-relaxed max-h-40 overflow-y-auto">
                        {activeTaskDetail.taskDescription}
                      </div>
                    </div>

                    {/* Date / Metadata info row */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                        <span className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Periode</span>
                        <span className="text-xs font-bold text-gray-700 block">{weekLabel}</span>
                      </div>
                      <div className="bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                        <span className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Batas Waktu</span>
                        <span className="text-xs font-bold text-red-600 block">
                          {weekEndDate ? formatLearningPowerUpDate(weekEndDate) : '-'}
                        </span>
                      </div>
                    </div>

                    {/* Workflow actions & status indicator */}
                    <div className="pt-4 border-t border-slate-100 space-y-4">
                      <div className="space-y-1">
                        <span className="text-xs font-black text-gray-400 uppercase tracking-wider block">Status Saat Ini</span>
                        <div>
                          {getStatusBadge(status, weekEndDate, asg?.isCancelled)}
                        </div>
                      </div>

                      {/* Actions based on status */}
                      <div className="pt-2">
                        {isDiff && asg?.isCancelled ? (
                          <div className="bg-slate-100 border border-slate-300 rounded-2xl p-4 text-center space-y-2">
                            <p className="text-sm font-bold text-slate-800 flex items-center justify-center gap-1.5">
                              <AlertCircle size={16} className="text-slate-500" />
                              Tugas ini telah dibatalkan oleh guru.
                            </p>
                            {asg.cancellationReason && (
                              <p className="text-xs text-slate-600 font-medium leading-relaxed">
                                Alasan: <span className="font-bold">{asg.cancellationReason}</span>
                                {asg.cancellationNote && ` (${asg.cancellationNote})`}
                              </p>
                            )}
                          </div>
                        ) : (
                          <>
                            {/* NOT STARTED / DEFAULT / ASSIGNED */}
                            {(status === 'NOT_STARTED') && (
                              <button
                                onClick={() => {
                                  if (isDiff && asg) {
                                    handleAssignmentSubmit(asg.id, false);
                                  } else {
                                    handleTaskSubmit(activeTaskDetail.field, false);
                                  }
                                }}
                                disabled={isSubmittingAction}
                                className="w-full py-4 bg-[#109E58] hover:bg-[#0d854a] disabled:bg-[#109E58]/50 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
                              >
                                {isSubmittingAction ? (
                                  <>
                                    <Loader2 size={16} className="animate-spin" />
                                    Memproses...
                                  </>
                                ) : (
                                  <>
                                    <CheckSquare size={16} />
                                    Saya Sudah Selesai
                                  </>
                                )}
                              </button>
                            )}

                            {/* SUBMITTED */}
                            {status === 'SUBMITTED' && (
                              <div className="bg-amber-50/50 border border-amber-200 rounded-2xl p-4 text-center">
                                <p className="text-sm font-bold text-amber-900">Menunggu Verifikasi Coach</p>
                                <p className="text-xs text-amber-700 font-medium mt-1 leading-relaxed">
                                  Tugasmu sudah dikirim dan sedang diperiksa guru. Tidak ada tindakan lanjutan yang perlu kamu lakukan sekarang.
                                </p>
                              </div>
                            )}

                            {/* REVISION_REQUIRED */}
                            {status === 'REVISION_REQUIRED' && (
                              <button
                                onClick={() => {
                                  if (isDiff && asg) {
                                    handleAssignmentSubmit(asg.id, true);
                                  } else {
                                    handleTaskSubmit(activeTaskDetail.field, true);
                                  }
                                }}
                                disabled={isSubmittingAction}
                                className="w-full py-4 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-500/50 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md flex items-center justify-center gap-2 animate-pulse"
                              >
                                {isSubmittingAction ? (
                                  <>
                                    <Loader2 size={16} className="animate-spin" />
                                    Mengirim Ulang...
                                  </>
                                ) : (
                                  <>
                                    <CornerDownLeft size={16} />
                                    Kirim Ulang Setelah Revisi
                                  </>
                                )}
                              </button>
                            )}

                            {/* VERIFIED */}
                            {status === 'VERIFIED' && (
                              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
                                <p className="text-sm font-bold text-emerald-900 flex items-center justify-center gap-1.5">
                                  <CheckCircle2 size={16} className="text-emerald-500" />
                                  Telah Diverifikasi Guru
                                </p>
                                <p className="text-xs text-emerald-700 font-medium mt-1 leading-relaxed">
                                  Luar biasa! Tugas ini telah disetujui dan ditandai selesai oleh guru. Selamat atas kerja kerasmu pekan ini!
                                </p>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* KOTAK KANAN - STATUS & CATATAN GURU */}
                  <div className="flex-1 p-8 md:p-10 bg-slate-50 space-y-6">
                    <div>
                      <span className="px-3 py-1.5 bg-slate-200 text-slate-700 text-[9px] font-black uppercase tracking-widest rounded-full border border-slate-300 inline-block mb-4">
                        KOTAK KANAN — STATUS & CATATAN GURU
                      </span>
                      <h3 className="text-lg font-black text-gray-900">Riwayat & Catatan Guru</h3>
                      <p className="text-xs font-semibold text-gray-400">Linimasa riwayat pengajuan dan catatan revisi.</p>
                    </div>

                    {/* Coach notes if exist */}
                    {revisionNote && (
                      <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 space-y-2">
                        <span className="text-[10px] font-black text-rose-700 uppercase tracking-wider block">Catatan Revisi dari Guru:</span>
                        <p className="text-xs font-bold text-rose-900 leading-relaxed bg-white p-3 rounded-xl border border-rose-100 shadow-sm">
                          "{revisionNote}"
                        </p>
                      </div>
                    )}

                    {/* History timeline log list */}
                    <div className="space-y-3">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Log Aktivitas</span>
                      
                      <div className="space-y-4 max-h-60 overflow-y-auto pr-1">
                        {history && history.length > 0 ? (
                          history.map((h: any, idx: number) => {
                            const actorName = isDiff ? h.performedByName : h.actorName;
                            const action = h.action;
                            const timestampStr = formatLpuDateTime(h.timestamp);
                            
                            return (
                              <div key={idx} className="flex gap-3 text-xs">
                                {/* Timeline dot */}
                                <div className="flex flex-col items-center">
                                  <div className={cn(
                                    "w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-white font-black text-[10px]",
                                    action === 'VERIFY' ? "bg-emerald-500" :
                                    action === 'REVISION_REQUEST' ? "bg-rose-500" : "bg-blue-500"
                                  )}>
                                    {idx + 1}
                                  </div>
                                  {idx < history.length - 1 && (
                                    <div className="w-0.5 bg-slate-200 flex-1 min-h-[20px]" />
                                  )}
                                </div>
                                
                                {/* Timeline card */}
                                <div className="bg-white p-3 rounded-xl border border-slate-100 flex-1 space-y-1">
                                  <div className="flex items-center justify-between text-[10px] font-semibold text-gray-400">
                                    <span>{timestampStr}</span>
                                    <span className="font-bold text-gray-500">{actorName || 'Siswa'}</span>
                                  </div>
                                  <p className="font-bold text-gray-800 text-xs">
                                    {action === 'ASSIGN' && "Tugas ditugaskan oleh guru."}
                                    {action === 'SUBMIT' && "Mengirim tugas untuk diperiksa."}
                                    {action === 'RESUBMIT' && "Mengirim ulang tugas setelah revisi."}
                                    {action === 'REVISION_REQUEST' && "Guru meminta revisi tugas."}
                                    {action === 'VERIFY' && "Guru menyetujui & memverifikasi tugas selesai."}
                                  </p>
                                  {h.note && (
                                    <p className="text-[11px] text-gray-500 italic leading-normal bg-slate-50 px-2 py-1.5 rounded border border-slate-100 mt-1">
                                      "{h.note}"
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="text-center py-6 text-xs text-gray-400 font-semibold bg-white rounded-xl border border-slate-200/50">
                            Belum ada aktivitas tercatat. Lakukan pengiriman tugas pertama Anda!
                          </div>
                        )}
                      </div>
                    </div>

                  </div>
                </motion.div>
              </div>
            );
          })()
        )}
      </AnimatePresence>

    </div>
  );
}
