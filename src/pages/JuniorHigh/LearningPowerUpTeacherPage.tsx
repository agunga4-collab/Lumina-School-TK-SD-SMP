import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, CheckSquare, Sparkles, BookOpen, 
  Languages, BookMarked, Calculator, Clock, 
  AlertTriangle, Check, ShieldAlert, Plus, 
  Calendar, Search, Filter, Loader2, Info, 
  Eye, Edit, Trash2, Send, Save, ArrowRight, CornerDownLeft, FileText, CheckCircle2,
  X, AlertCircle, Copy, CheckSquare2
} from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { User as AppUser, Student } from '../../types';
import { cn } from '../../lib/utils';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { 
  db, 
  getClasses, 
  getActiveStudents,
  handleFirestoreError
} from '../../lib/firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  getDoc,
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  serverTimestamp, 
  writeBatch 
} from 'firebase/firestore';
import { toast } from 'sonner';
import { isTeacherAssignedToClass } from '../../services/classTeacherAssignmentService';
import {
  resolveStudentActiveSubjectLevel,
  resolveTeacherAuthorizedScope,
  generateDeterministicAssignmentId,
  LPU_SUBJECT_MAP
} from '../../services/learningPowerUpService';
import {
  LearningPowerUpTaskBatch,
  LearningPowerUpAssignment,
  LpuSubjectKey,
  LpuSubjectArea,
  LpuLevelTask,
  LpuAssignmentHistoryEntry
} from '../../types';


interface LearningPowerUpPackage {
  id: string; // learning_power_up_{classId}_{weekStartDate}
  unit: 'JUNIOR_HIGH';
  academicYearId: string;
  classId: string;
  weekStartDate: string; // YYYY-MM-DD
  weekEndDate: string; // YYYY-MM-DD
  weekLabel: string; // e.g. "Pekan (10 Agt - 16 Agt 2026)"
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
  action: 'SUBMIT' | 'REVISION_REQUEST' | 'RESUBMIT' | 'VERIFY' | 'UNVERIFY';
  note?: string | null;
  actorName: string;
}

interface TaskProgress {
  id: string; // progress_{packageId}_{studentId}_{field}
  packageId: string;
  taskPackageId?: string;
  studentId: string;
  classId: string;
  academicYearId: string;
  field: 'bahasaIndonesia' | 'english' | 'mengaji' | 'numerasi';
  subjectKey?: string;
  status: 'NOT_STARTED' | 'SUBMITTED' | 'REVISION_REQUIRED' | 'VERIFIED';
  submittedAt: any;
  verifiedAt: any;
  verifiedBy: string | null;
  verifiedByUserId?: string | null;
  verifiedByName?: string | null;
  verifiedByEmail?: string | null;
  verificationMethod?: 'INDIVIDUAL' | 'BULK' | null;
  revisionNote: string | null;
  revisedAt: any;
  updatedAt: any;
  history?: TaskProgressHistory[];
  lastUnverifiedByUserId?: string | null;
  lastUnverifiedByEmail?: string | null;
  lastUnverifiedAt?: any;
  unverifyReason?: string | null;
}

const CATEGORY_CONFIG = {
  bahasaIndonesia: {
    label: 'Bahasa Indonesia',
    icon: BookOpen,
    colorClass: 'text-blue-600 bg-blue-50 border-blue-200',
    accentColor: 'blue'
  },
  english: {
    label: 'English',
    icon: Languages,
    colorClass: 'text-violet-600 bg-violet-50 border-violet-200',
    accentColor: 'violet'
  },
  mengaji: {
    label: 'Mengaji',
    icon: BookMarked,
    colorClass: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    accentColor: 'emerald'
  },
  numerasi: {
    label: 'Numerasi',
    icon: Calculator,
    colorClass: 'text-amber-600 bg-amber-50 border-amber-200',
    accentColor: 'amber'
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

const formatDateShort = (dateStr: string) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const months = ['Agt', 'Sep', 'Okt', 'Nov', 'Des', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul'];
  // Correctly mapping month index to Indonesian months list
  const idMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${d.getDate()} ${idMonths[d.getMonth()]}`;
};

const formatDateFull = (dateStr: string) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const idMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${d.getDate()} ${idMonths[d.getMonth()]} ${d.getFullYear()}`;
};

const formatDateRange = (startStr: string, endStr: string) => {
  if (!startStr || !endStr) return '';
  const start = new Date(startStr);
  const end = new Date(endStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return '';
  const idMonthsFull = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  
  const startDay = start.getDate();
  const endDay = end.getDate();
  const startMonth = start.getMonth();
  const endMonth = end.getMonth();
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();

  if (startYear === endYear) {
    if (startMonth === endMonth) {
      return `${startDay}–${endDay} ${idMonthsFull[startMonth]} ${startYear}`;
    } else {
      return `${startDay} ${idMonthsFull[startMonth]} – ${endDay} ${idMonthsFull[endMonth]} ${startYear}`;
    }
  } else {
    return `${startDay} ${idMonthsFull[startMonth]} ${startYear} – ${endDay} ${idMonthsFull[endMonth]} ${endYear}`;
  }
};

const formatVerificationTime = (timestamp: any) => {
  return formatLpuDateTime(timestamp, '');
};

const canTeacherVerifySubject = (
  user: AppUser, 
  classData: any, 
  subjectField: 'bahasaIndonesia' | 'english' | 'mengaji' | 'numerasi'
): boolean => {
  if (!user || !classData) return false;
  
  const role = user.role;
  // If the user is authenticated and has a Junior High staff/teacher role, they can verify any subject for this JH class
  const allowedRoles = [
    'TEACHER', 'HOMEROOM_TEACHER', 'BK_MENTOR', 'HEAD_JUNIOR', 
    'SUPER_ADMIN', 'HEAD_UNIT', 'PRINCIPAL', 'VICE_PRINCIPAL', 
    'COORDINATOR', 'COUNSELOR'
  ];
  
  if (allowedRoles.includes(role) && classData.unitId === 'JUNIOR_HIGH') {
    return true;
  }

  // 1. Super Admin, Head Unit, Principal, Coordinator have full access
  if (['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'PRINCIPAL', 'VICE_PRINCIPAL', 'COORDINATOR'].includes(role)) {
    return true;
  }

  // 2. Wali Kelas (Homeroom Teacher) check
  const assignments = classData.teacherAssignments || [];
  const isHomeroom = assignments.some(
    (a: any) => a.userId === user.uid && a.role === 'HOMEROOM_TEACHER'
  ) || classData.homeroomTeacherId === user.uid;

  if (isHomeroom) {
    return true; // Wali Kelas is allowed
  }

  // 3. Subject-specific assignment checks. Let's see if the teacher is assigned to this class first
  const isAssignedToClass = assignments.some((a: any) => a.userId === user.uid) || 
                            (classData.assignedTeacherIds && classData.assignedTeacherIds.includes(user.uid));
  if (!isAssignedToClass) {
    return false; // Not even assigned to this class!
  }

  // 4. If assigned, let's check if the assignment has specific subject fields (e.g., subjects array)
  const userAssignment = assignments.find((a: any) => a.userId === user.uid);
  if (userAssignment && userAssignment.subjects && Array.isArray(userAssignment.subjects)) {
    if (userAssignment.subjects.includes(subjectField)) {
      return true;
    }
  }

  // 5. Keyword mapping on jobTitle or displayName or email
  const jobTitleLower = (user.jobTitle || '').toLowerCase();
  const displayNameLower = (user.displayName || '').toLowerCase();
  const emailLower = (user.email || '').toLowerCase();

  const checkKeywords = (keywords: string[]) => {
    return keywords.some(k => 
      jobTitleLower.includes(k) || 
      displayNameLower.includes(k) || 
      emailLower.includes(k)
    );
  };

  if (subjectField === 'bahasaIndonesia') {
    return checkKeywords(['bahasa', 'indonesia', 'indo', 'bi']);
  }
  if (subjectField === 'english') {
    return checkKeywords(['english', 'inggris', 'eng']);
  }
  if (subjectField === 'mengaji') {
    return checkKeywords(['mengaji', 'agama', 'islam', 'ustadz', 'ustadzah', 'quran', 'pai']);
  }
  if (subjectField === 'numerasi') {
    return checkKeywords(['numerasi', 'math', 'matematika', 'sains', 'ipa', 'mipa', 'numeracy']);
  }

  return false;
};

class LearningPowerUpErrorBoundary extends React.Component<any, any> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    if (process.env.NODE_ENV !== 'production') {
      console.error("Learning Power-Up Error Boundary caught an error:", error, errorInfo);
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

export default function LearningPowerUpTeacherPage() {
  return (
    <LearningPowerUpErrorBoundary>
      <LearningPowerUpTeacherPageContent />
    </LearningPowerUpErrorBoundary>
  );
}

function LearningPowerUpTeacherPageContent() {
  const { currentUser } = useOutletContext<{ currentUser: AppUser }>();
  const { activeYear } = useAcademicYear();

  // Navigation tabs
  const [activeTab, setActiveTab] = React.useState<'TRACKER' | 'MANAGE_TASKS'>('TRACKER');

  // Metadata & filters
  const [classes, setClasses] = React.useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = React.useState<string>('');
  const [selectedWeek, setSelectedWeek] = React.useState<string>('');
  const [students, setStudents] = React.useState<Student[]>([]);
  const [packages, setPackages] = React.useState<LearningPowerUpPackage[]>([]);
  const [progresses, setProgresses] = React.useState<TaskProgress[]>([]);

  // Loading states
  const [loadingMetadata, setLoadingMetadata] = React.useState(true);
  const [loadingData, setLoadingData] = React.useState(false);

  // Search filter inside table
  const [searchQuery, setSearchQuery] = React.useState<string>('');

  // Form states
  const [weekStartDate, setWeekStartDate] = React.useState('');
  const [weekEndDate, setWeekEndDate] = React.useState('');
  const [weekLabel, setWeekLabel] = React.useState('');
  const [copiedFromWeekId, setCopiedFromWeekId] = React.useState('');
  const [tasksForm, setTasksForm] = React.useState({
    bahasaIndonesia: '',
    english: '',
    mengaji: '',
    numerasi: ''
  });

  // --- New-Style LPU Batch States ---
  const [newSubject, setNewSubject] = React.useState<LpuSubjectKey | ''>('');
  const [newTargetClassIds, setNewTargetClassIds] = React.useState<string[]>([]);
  const [newWeekStartDate, setNewWeekStartDate] = React.useState('');
  const [newWeekEndDate, setNewWeekEndDate] = React.useState('');
  const [newWeekLabel, setNewWeekLabel] = React.useState('');
  const [newSemester, setNewSemester] = React.useState<'1' | '2'>('1');
  const [levelTasks, setLevelTasks] = React.useState<Record<string, { title: string; instructions: string }>>({});
  
  // Roster resolved with student level info
  const [rosterLevels, setRosterLevels] = React.useState<Array<{
    student: any;
    classId: string;
    className: string;
    level: string;
    resolved: boolean;
  }>>([]);
  const [loadingRosterLevels, setLoadingRosterLevels] = React.useState(false);

  // New-style Batch collection list
  const [taskBatches, setTaskBatches] = React.useState<LearningPowerUpTaskBatch[]>([]);
  const [editingBatchId, setEditingBatchId] = React.useState<string | null>(null);
  const [editingBatchStatus, setEditingBatchStatus] = React.useState<string | null>(null);
  const [editingBatchHasActivity, setEditingBatchHasActivity] = React.useState<boolean>(false);
  const [changeNote, setChangeNote] = React.useState<string>('');

  // Publish confirmation modal state
  const [publishPreflight, setPublishPreflight] = React.useState<{
    batch: Partial<LearningPowerUpTaskBatch>;
    recipientsCountByLevel: Record<string, number>;
    studentsWithoutLevel: any[];
    studentsSkippedNoTask: any[];
    classesNames: string[];
  } | null>(null);
  const [isPublishing, setIsPublishing] = React.useState(false);


  // Verification modal states
  const [verifyingProgress, setVerifyingProgress] = React.useState<{
    student: Student;
    field: 'bahasaIndonesia' | 'english' | 'mengaji' | 'numerasi';
    taskDescription: string;
    progress: TaskProgress | null;
  } | null>(null);
  const [verificationNote, setVerificationNote] = React.useState('');
  const [isSavingVerification, setIsSavingVerification] = React.useState(false);

  // Bulk verification confirmation state
  const [bulkConfirm, setBulkConfirm] = React.useState<{
    field: 'bahasaIndonesia' | 'english' | 'mengaji' | 'numerasi';
    studentCount: number;
  } | null>(null);

  // Individual unverification confirmation state
  const [unverifyingProgress, setUnverifyingProgress] = React.useState<{
    student: Student;
    field: 'bahasaIndonesia' | 'english' | 'mengaji' | 'numerasi';
    progress: TaskProgress;
  } | null>(null);

  // Bulk unverification confirmation state
  const [bulkUnverifyConfirm, setBulkUnverifyConfirm] = React.useState<{
    field: 'bahasaIndonesia' | 'english' | 'mengaji' | 'numerasi';
    studentCount: number;
  } | null>(null);

  // --- New-Style LPU Assignment and Cancellation States ---
  const [loadedAssignments, setLoadedAssignments] = React.useState<LearningPowerUpAssignment[]>([]);
  const [cancellingBatch, setCancellingBatch] = React.useState<LearningPowerUpTaskBatch | null>(null);
  const [cancellationReason, setCancellationReason] = React.useState<'Salah kelas' | 'Salah periode' | 'Konten perlu diperbaiki' | 'Duplikat' | 'Lainnya' | ''>('');
  const [cancellationNote, setCancellationNote] = React.useState('');
  const [isCancelling, setIsCancelling] = React.useState(false);
  const [cancellingBatchStats, setCancellingBatchStats] = React.useState<{
    totalAssignments: number;
    notStarted: number;
    submitted: number;
    verified: number;
    revision: number;
  } | null>(null);
  const [showArchivedCancelled, setShowArchivedCancelled] = React.useState(false);

  // --- Deletion States ---
  const [deletingBatch, setDeletingBatch] = React.useState<LearningPowerUpTaskBatch | null>(null);
  const [deletingBatchStats, setDeletingBatchStats] = React.useState<{
    totalAssignments: number;
    notStarted: number;
    submitted: number;
    verified: number;
    revision: number;
  } | null>(null);
  const [deleteSecondConfirmChecked, setDeleteSecondConfirmChecked] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  // Load Classes on mount
  React.useEffect(() => {
    const loadClassesList = async () => {
      setLoadingMetadata(true);
      try {
        const allClasses = await getClasses() || [];
        const jhClasses = allClasses.filter(
          c => c.unitId === 'JUNIOR_HIGH' && c.status !== 'archived' && c.academicYear === activeYear
        );

        // Deduplicate classes by ID to avoid duplicates
        const seenIds = new Set<string>();
        const uniqueJhClasses = jhClasses.filter(c => {
          if (!c.id || seenIds.has(c.id)) return false;
          seenIds.add(c.id);
          return true;
        });

        // Junior High teachers can select any active Junior High class in the active academic year
        setClasses(uniqueJhClasses);

        // Find teacher's assigned/default class as the initial selected class if available
        const assignedClass = uniqueJhClasses.find(c => isTeacherAssignedToClass(c, currentUser?.uid));
        
        if (assignedClass) {
          setSelectedClassId(assignedClass.id);
        } else if (uniqueJhClasses.length > 0) {
          setSelectedClassId(uniqueJhClasses[0].id);
        } else {
          setSelectedClassId('');
        }
      } catch (err) {
        console.error("Error loading teacher classes:", err);
        toast.error("Gagal memuat daftar kelas SMP.");
      } finally {
        setLoadingMetadata(false);
      }
    };

    if (currentUser && activeYear) {
      loadClassesList();
    }
  }, [currentUser, activeYear]);

  // Load packages, progress, and student roster for the selected class
  const loadClassData = async () => {
    if (!selectedClassId || !activeYear) return;
    // Clear the previous class's students/data while the new class is loading
    setStudents([]);
    setPackages([]);
    setProgresses([]);
    
    setLoadingData(true);
    try {
      // 1. Load active student roster
      const roster = await getActiveStudents(selectedClassId, activeYear) || [];
      
      // Enrich each student with resolved NIS
      const enrichedStudents = await Promise.all(roster.map(async (student: any) => {
        // Try getting NIS from existing fields
        let foundNis = 
          student.nis ||
          student.NIS ||
          student.studentNumber ||
          student.nisSiswa ||
          student.profile?.nis ||
          student.studentProfile?.nis ||
          student.luminaId;

        // If not found directly, perform a lookup based on studentId (student.id)
        if (!foundNis && student.id) {
          try {
            // Lookup in students collection
            const sDoc = await getDoc(doc(db, 'students', student.id));
            if (sDoc.exists()) {
              const sData = sDoc.data();
              foundNis = 
                sData.luminaId ||
                sData.nis ||
                sData.NIS ||
                sData.studentNumber ||
                sData.nisSiswa ||
                sData.profile?.nis ||
                sData.studentProfile?.nis;
            }

            // Fallback lookup in roleInvites if still not found
            if (!foundNis) {
              const iDoc = await getDoc(doc(db, 'roleInvites', student.id));
              if (iDoc.exists()) {
                const iData = iDoc.data();
                if (iData) {
                  foundNis = iData.luminaId || iData.nis;
                }
              }
            }

            // Fallback lookup in users if still not found
            if (!foundNis) {
              const uDoc = await getDoc(doc(db, 'users', student.id));
              if (uDoc.exists()) {
                const uData = uDoc.data();
                if (uData) {
                  foundNis = uData.luminaId || uData.nis;
                }
              }
            }
          } catch (err) {
            console.warn(`Error resolving NIS for student ID ${student.id}:`, err);
          }
        }

        // If found, format as string, otherwise check if id itself is numeric/not standard Firestore ID/UUID
        let resolvedNis = "-";
        if (foundNis) {
          resolvedNis = String(foundNis);
        } else {
          const idStr = String(student.id || "");
          if (
            idStr &&
            !/^[a-zA-Z0-9]{20}$/.test(idStr) &&
            !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(idStr) &&
            !/^[a-zA-Z0-9]{20,30}$/.test(idStr)
          ) {
            resolvedNis = idStr;
          }
        }

        return {
          ...student,
          nis: resolvedNis
        };
      }));

      setStudents(enrichedStudents);

      // 2. Load level-based batches for this class & year
      const qBatches = query(
        collection(db, 'learning_power_up_task_batches'),
        where('academicYearId', '==', activeYear),
        where('targetClassIds', 'array-contains', selectedClassId)
      );
      const batchesSnap = await getDocs(qBatches);
      const classLevelBatches = batchesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as LearningPowerUpTaskBatch[];

      const filteredClassBatches = classLevelBatches.filter(b => 
        b.status === 'PUBLISHED' || (showArchivedCancelled && (b.status === 'CANCELLED' || b.status === 'ARCHIVED'))
      );

      // Build virtual packages for level-based weeks
      const uniqueWeekStarts = Array.from(new Set(filteredClassBatches.map(b => b.weekStartDate)));
      const virtualPackages: LearningPowerUpPackage[] = uniqueWeekStarts.map(weekStart => {
        const weekBatches = filteredClassBatches.filter(b => b.weekStartDate === weekStart);
        return {
          id: `level_week_${weekStart}`,
          unit: 'JUNIOR_HIGH',
          academicYearId: activeYear,
          classId: selectedClassId,
          weekStartDate: weekStart,
          weekEndDate: weekBatches[0].weekEndDate,
          weekLabel: weekBatches[0].weekLabel,
          tasks: {
            bahasaIndonesia: weekBatches.find(b => b.subjectKey === 'bahasaIndonesia') ? "Tugas Level-Based" : null,
            english: weekBatches.find(b => b.subjectKey === 'english') ? "Tugas Level-Based" : null,
            mengaji: weekBatches.find(b => b.subjectKey === 'mengaji') ? "Tugas Level-Based" : null,
            numerasi: weekBatches.find(b => b.subjectKey === 'numerasi') ? "Tugas Level-Based" : null,
          },
          copiedFromWeekId: null,
          createdBy: weekBatches[0].createdBy,
          createdAt: weekBatches[0].createdAt,
          updatedAt: weekBatches[0].updatedAt
        };
      });

      // 2.5 Load legacy packages for this class & year
      const qLegacyPackages = query(
        collection(db, 'learning_power_up_tasks'),
        where('classId', '==', selectedClassId),
        where('academicYearId', '==', activeYear)
      );
      const legacyPackagesSnap = await getDocs(qLegacyPackages);
      const legacyPackages = legacyPackagesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as LearningPowerUpPackage[];

      // Sort combined packages by start date descending
      const loadedPackages = [...virtualPackages, ...legacyPackages];
      loadedPackages.sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate));
      setPackages(loadedPackages);

      if (loadedPackages.length > 0 && !selectedWeek) {
        setSelectedWeek(loadedPackages[0].id);
      } else if (loadedPackages.length > 0 && !loadedPackages.some(p => p.id === selectedWeek)) {
        setSelectedWeek(loadedPackages[0].id);
      }

      // 3. Load level-based assignments
      const qAssignments = query(
        collection(db, 'learning_power_up_assignments'),
        where('academicYearId', '==', activeYear),
        where('classId', '==', selectedClassId)
      );
      const assignmentsSnap = await getDocs(qAssignments);
      const loadedAsgs = assignmentsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as LearningPowerUpAssignment[];
      setLoadedAssignments(loadedAsgs);

      // Map level-based assignments to virtual TaskProgress records
      const virtualProgresses: TaskProgress[] = loadedAsgs.map(asg => {
        let status: TaskProgress['status'] = 'NOT_STARTED';
        if (asg.isCancelled) {
          status = 'CANCELLED' as any;
        } else if (asg.status === 'VERIFIED') {
          status = 'VERIFIED';
        } else if (asg.status === 'SUBMITTED') {
          status = 'SUBMITTED';
        } else if (asg.status === 'REVISION_REQUIRED') {
          status = 'REVISION_REQUIRED';
        } else {
          status = 'NOT_STARTED';
        }

        return {
          id: asg.id,
          packageId: `level_week_${asg.weekStartDate}`,
          taskPackageId: `level_week_${asg.weekStartDate}`,
          studentId: asg.studentId,
          classId: asg.classId,
          academicYearId: asg.academicYearId,
          field: asg.subjectKey,
          subjectKey: asg.subjectKey,
          status: status,
          verifiedAt: asg.verifiedAt,
          verifiedBy: asg.verifiedBy,
          verifiedByEmail: asg.verifiedByEmail,
          verifiedByName: asg.verifiedByName,
          verificationMethod: asg.verificationMethod,
          revisionNote: asg.history?.filter(h => h.action === 'REVISION_REQUEST' && h.note).slice(-1)[0]?.note || '',
          history: asg.history || []
        } as any;
      });

      // 3.5 Load legacy progress records for this class & year
      const qLegacyProgress = query(
        collection(db, 'learning_power_up_progress'),
        where('classId', '==', selectedClassId),
        where('academicYearId', '==', activeYear)
      );
      const legacyProgressSnap = await getDocs(qLegacyProgress);
      const legacyProgresses = legacyProgressSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as TaskProgress[];
      
      setProgresses([...virtualProgresses, ...legacyProgresses]);

      // Load new task batches as well
      await loadTaskBatches();

    } catch (err) {
      console.error("Error loading class data for tracker:", err);
      toast.error("Gagal memuat data tracker kelas.");
    } finally {
      setLoadingData(false);
    }
  };

  const loadTaskBatches = async () => {
    if (!activeYear) return;
    try {
      const q = query(
        collection(db, 'learning_power_up_task_batches'),
        where('academicYearId', '==', activeYear)
      );
      const snap = await getDocs(q);
      const batches = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as LearningPowerUpTaskBatch[];
      batches.sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate));
      setTaskBatches(batches);
    } catch (err) {
      console.error("Error loading task batches:", err);
    }
  };

  React.useEffect(() => {
    if (selectedClassId && activeYear) {
      loadClassData();
    }
  }, [selectedClassId, activeYear, showArchivedCancelled]);

  // Load roster and levels dynamically for new batch setup
  React.useEffect(() => {
    const loadRosterAndLevels = async () => {
      if (!newSubject || newTargetClassIds.length === 0 || !activeYear) {
        setRosterLevels([]);
        return;
      }

      setLoadingRosterLevels(true);
      try {
        // Fetch all students for selected classes
        const allStudentsInClasses: any[] = [];
        for (const classId of newTargetClassIds) {
          const roster = await getActiveStudents(classId, activeYear) || [];
          const enriched = await Promise.all(roster.map(async (student: any) => {
            const nis = await resolveNisForStudent(student);
            return { ...student, nis };
          }));
          allStudentsInClasses.push(...enriched);
        }

        // Query lits/num records for the active year and subject
        const qRecords = query(
          collection(db, 'junior_high_literacy_numeracy_records'),
          where('schoolYear', '==', activeYear),
          where('subjectArea', '==', LPU_SUBJECT_MAP[newSubject])
        );
        const recordsSnap = await getDocs(qRecords);
        const recordsByStudentId: Record<string, any> = {};
        
        // Priority weight/order to resolve session key
        const SESSION_PRIORITY: Record<string, number> = {
          'SEMESTER_1_START': 1,
          'SEMESTER_1_END': 2,
          'SPRING_ASSESSMENT_3': 3,
          'SEMESTER_2_START': 4,
          'SEMESTER_2_END': 5
        };

        recordsSnap.forEach(docSnap => {
          const data = docSnap.data();
          if (data.studentId) {
            const existing = recordsByStudentId[data.studentId];
            if (!existing) {
              recordsByStudentId[data.studentId] = data;
            } else {
              const priorityA = SESSION_PRIORITY[data.sessionKey] || 0;
              const priorityB = SESSION_PRIORITY[existing.sessionKey] || 0;
              if (priorityA > priorityB) {
                recordsByStudentId[data.studentId] = data;
              }
            }
          }
        });

        const getLevelFromRecord = (record: any, subj: LpuSubjectKey): string => {
          if (!record) return '';
          switch (subj) {
            case 'bahasaIndonesia':
              return record.readingLevel || '';
            case 'english':
              return record.readingLevel || '';
            case 'mengaji':
              return record.level || '';
            case 'numerasi':
              return record.mathLevel || '';
            default:
              return '';
          }
        };

        // Map students to levels
        const resolvedList = allStudentsInClasses.map(student => {
          const classObj = classes.find(c => c.id === student.classId);
          const record = recordsByStudentId[student.id];
          const level = getLevelFromRecord(record, newSubject);
          return {
            student,
            classId: student.classId,
            className: classObj?.name || student.classId || 'Unknown Class',
            level: level, // empty string if none
            resolved: !!level
          };
        });

        setRosterLevels(resolvedList);

        // Now, initialize levelTasks for only represented levels
        const uniqueLevels = Array.from(new Set(resolvedList.filter(r => r.resolved).map(r => r.level)));
        const newLevelTasks: Record<string, { title: string; instructions: string }> = {};
        uniqueLevels.forEach(lvl => {
          newLevelTasks[lvl] = levelTasks[lvl] || { title: '', instructions: '' };
        });
        setLevelTasks(newLevelTasks);

      } catch (err) {
        console.error("Error loading roster and levels:", err);
        toast.error("Gagal memuat level kemampuan siswa.");
      } finally {
        setLoadingRosterLevels(false);
      }
    };

    loadRosterAndLevels();
  }, [newSubject, newTargetClassIds, activeYear, classes]);

  const resolveNisForStudent = async (student: any) => {
    let foundNis = 
      student.nis ||
      student.NIS ||
      student.studentNumber ||
      student.nisSiswa ||
      student.profile?.nis ||
      student.studentProfile?.nis ||
      student.luminaId;

    if (!foundNis && student.id) {
      try {
        const sDoc = await getDoc(doc(db, 'students', student.id));
        if (sDoc.exists()) {
          const sData = sDoc.data();
          foundNis = 
            sData.luminaId ||
            sData.nis ||
            sData.NIS ||
            sData.studentNumber ||
            sData.nisSiswa ||
            sData.profile?.nis ||
            sData.studentProfile?.nis;
        }
      } catch (err) {
        console.warn("Error resolving NIS:", err);
      }
    }
    return foundNis ? String(foundNis) : "-";
  };


  // Handle start date picker change - auto updates end date & weekLabel
  const handleStartDateChange = (val: string) => {
    setWeekStartDate(val);
    if (val) {
      const d = new Date(val);
      const end = new Date(d);
      end.setDate(d.getDate() + 6);
      const endStr = end.toISOString().split('T')[0];
      setWeekEndDate(endStr);
      
      const label = formatDateRange(val, endStr);
      setWeekLabel(label);
 
      // If an existing package exists for this startDate, prefill it!
      const existing = packages.find(p => p.weekStartDate === val);
      if (existing) {
        setWeekLabel(existing.weekLabel || label);
        setTasksForm({
          bahasaIndonesia: existing.tasks.bahasaIndonesia || '',
          english: existing.tasks.english || '',
          mengaji: existing.tasks.mengaji || '',
          numerasi: existing.tasks.numerasi || ''
        });
        toast.info("Memuat data tugas terdaftar untuk tanggal ini.");
      } else {
        setTasksForm({
          bahasaIndonesia: '',
          english: '',
          mengaji: '',
          numerasi: ''
        });
      }
    }
  };
 
  // Copy tasks from previous package
  const handleCopyFromPrevious = () => {
    if (!copiedFromWeekId) {
      toast.error("Pilih periode sumber terlebih dahulu!");
      return;
    }
    const sourcePkg = packages.find(p => p.id === copiedFromWeekId);
    if (sourcePkg) {
      setTasksForm({
        bahasaIndonesia: sourcePkg.tasks.bahasaIndonesia || '',
        english: sourcePkg.tasks.english || '',
        mengaji: sourcePkg.tasks.mengaji || '',
        numerasi: sourcePkg.tasks.numerasi || ''
      });
      toast.success(`Berhasil menyalin deskripsi tugas dari periode ${formatDateRange(sourcePkg.weekStartDate, sourcePkg.weekEndDate)}!`);
    }
  };
 
  // Save package to Firestore
  const handleSavePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClassId || !activeYear) return;
    
    const computedLabel = weekLabel || formatDateRange(weekStartDate, weekEndDate);
    if (!weekStartDate || !weekEndDate || !computedLabel) {
      toast.error("Harap isi tanggal mulai dan selesai!");
      return;
    }
 
    const isAllEmpty = !tasksForm.bahasaIndonesia.trim() && 
                       !tasksForm.english.trim() && 
                       !tasksForm.mengaji.trim() && 
                       !tasksForm.numerasi.trim();
    if (isAllEmpty) {
      toast.error("Tugas tidak dapat disimpan karena semua bidang tugas kosong!");
      return;
    }
 
    setLoadingData(true);
    try {
      const packageId = `learning_power_up_${selectedClassId}_${weekStartDate}`;
      const pkgDoc: LearningPowerUpPackage = {
        id: packageId,
        unit: 'JUNIOR_HIGH',
        academicYearId: activeYear,
        classId: selectedClassId,
        weekStartDate,
        weekEndDate,
        weekLabel: computedLabel,
        tasks: {
          bahasaIndonesia: tasksForm.bahasaIndonesia.trim() || null,
          english: tasksForm.english.trim() || null,
          mengaji: tasksForm.mengaji.trim() || null,
          numerasi: tasksForm.numerasi.trim() || null
        },
        copiedFromWeekId: copiedFromWeekId || null,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
 
      await setDoc(doc(db, 'learning_power_up_tasks', packageId), pkgDoc);
      toast.success("Tugas berhasil disimpan!");
       
      // Reset form
      setWeekStartDate('');
      setWeekEndDate('');
      setWeekLabel('');
      setCopiedFromWeekId('');
      setTasksForm({
        bahasaIndonesia: '',
        english: '',
        mengaji: '',
        numerasi: ''
      });
       
      setSelectedWeek(packageId);
      await loadClassData();
    } catch (err) {
      console.error("Error saving package:", err);
      toast.error("Gagal menyimpan tugas.");
    } finally {
      setLoadingData(false);
    }
  };
 
  // Delete package and associated progresses
  const handleDeletePackage = async (pkgId: string) => {
    if (!confirm("Apakah Anda yakin ingin menghapus tugas ini? Seluruh progres penyelesaian siswa untuk periode ini juga akan terhapus secara permanen.")) {
      return;
    }
    setLoadingData(true);
    try {
      const batch = writeBatch(db);
       
      // Delete package
      batch.delete(doc(db, 'learning_power_up_tasks', pkgId));
       
      // Delete all related progresses
      const q = query(collection(db, 'learning_power_up_progress'), where('packageId', '==', pkgId));
      const progressSnap = await getDocs(q);
      progressSnap.docs.forEach(docSnap => {
        batch.delete(docSnap.ref);
      });
       
      await batch.commit();
      toast.success("Tugas dan seluruh progres siswa berhasil dihapus.");
      await loadClassData();
    } catch (err) {
      console.error("Error deleting package:", err);
      toast.error("Gagal menghapus tugas.");
    } finally {
      setLoadingData(false);
    }
  };

  // Edit package (prefills the form)
  const handleEditPackage = (pkg: LearningPowerUpPackage) => {
    setWeekStartDate(pkg.weekStartDate);
    setWeekEndDate(pkg.weekEndDate);
    setWeekLabel(pkg.weekLabel);
    setTasksForm({
      bahasaIndonesia: pkg.tasks.bahasaIndonesia || '',
      english: pkg.tasks.english || '',
      mengaji: pkg.tasks.mengaji || '',
      numerasi: pkg.tasks.numerasi || ''
    });
    toast.success("Data tugas berhasil dimasukkan ke form di atas. Anda dapat mengubah dan menyimpannya.");
    window.scrollTo({ top: 300, behavior: 'smooth' });
  };

  // --- New-Style Task Batch Handlers ---
  
  const validateTeacherScopeForBatch = (subject: LpuSubjectKey, classIds: string[]): { isValid: boolean; error?: string } => {
    for (const classId of classIds) {
      const classObj = classes.find(c => c.id === classId);
      if (!classObj) {
        return { isValid: false, error: `Kelas tidak ditemukan: ${classId}` };
      }
      const auth = resolveTeacherAuthorizedScope(currentUser, classObj, subject, true);
      if (!auth.isAuthorized) {
        return { isValid: false, error: `Anda tidak berwenang untuk ${CATEGORY_CONFIG[subject]?.label || subject} di kelas ${classObj.name}: ${auth.reason}` };
      }
    }
    return { isValid: true };
  };

  const handleSaveNewBatchDraft = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newSubject) {
      toast.error("Harap pilih Subject!");
      return;
    }
    if (newTargetClassIds.length === 0) {
      toast.error("Harap pilih setidaknya satu Kelas Target!");
      return;
    }
    if (!newWeekStartDate || !newWeekEndDate) {
      toast.error("Harap isi rentang Tanggal!");
      return;
    }

    // Validate teacher scope
    const validation = validateTeacherScopeForBatch(newSubject, newTargetClassIds);
    if (!validation.isValid) {
      toast.error(validation.error);
      return;
    }

    // Ensure at least one task is entered
    const hasSomeTask = (Object.values(levelTasks) as Array<{ title: string; instructions: string }>).some(t => t.title.trim() && t.instructions.trim());
    if (!hasSomeTask) {
      toast.error("Harap masukkan setidaknya satu judul dan instruksi tugas untuk level kemampuan!");
      return;
    }

    setLoadingData(true);
    try {
      const batchId = editingBatchId || `batch_${newSubject}_${newWeekStartDate}_${activeYear.replace('/', '_')}`;
      const cleanLevelTasks: Record<string, LpuLevelTask> = {};
      Object.entries(levelTasks).forEach(([lvl, rawTask]) => {
        const task = rawTask as { title: string; instructions: string };
        if (task.title.trim() || task.instructions.trim()) {
          cleanLevelTasks[lvl] = {
            title: task.title.trim(),
            instructions: task.instructions.trim()
          };
        }
      });

      const isEditing = !!editingBatchId;
      const batchDoc: LearningPowerUpTaskBatch = {
        id: batchId,
        unit: 'JUNIOR_HIGH',
        subjectKey: newSubject,
        subjectArea: LPU_SUBJECT_MAP[newSubject],
        academicYearId: activeYear,
        semester: newSemester,
        targetClassIds: newTargetClassIds,
        weekStartDate: newWeekStartDate,
        weekEndDate: newWeekEndDate,
        weekLabel: newWeekLabel || `Pekan (${formatDateShort(newWeekStartDate)} - ${formatDateShort(newWeekEndDate)})`,
        levelTasks: cleanLevelTasks,
        status: 'DRAFT',
        createdBy: isEditing ? (taskBatches.find(b => b.id === batchId)?.createdBy || currentUser.uid) : currentUser.uid,
        createdByEmail: isEditing ? (taskBatches.find(b => b.id === batchId)?.createdByEmail || currentUser.email || '') : (currentUser.email || ''),
        createdByName: isEditing ? (taskBatches.find(b => b.id === batchId)?.createdByName || currentUser.displayName || '') : (currentUser.displayName || ''),
        createdAt: isEditing ? (taskBatches.find(b => b.id === batchId)?.createdAt || serverTimestamp()) : serverTimestamp(),
        updatedBy: currentUser.uid,
        updatedByEmail: currentUser.email || '',
        updatedByName: currentUser.displayName || '',
        updatedAt: serverTimestamp()
      };

      await setDoc(doc(db, 'learning_power_up_task_batches', batchId), batchDoc);
      toast.success("Draft tugas berhasil disimpan!");
      
      resetNewBatchForm();
      await loadTaskBatches();
    } catch (err) {
      console.error("Error saving draft batch:", err);
      toast.error("Gagal menyimpan draft tugas.");
    } finally {
      setLoadingData(false);
    }
  };

  const handlePublishPreflight = () => {
    if (!newSubject) {
      toast.error("Harap pilih Subject!");
      return;
    }
    if (newTargetClassIds.length === 0) {
      toast.error("Harap pilih Kelas Target!");
      return;
    }
    if (!newWeekStartDate || !newWeekEndDate) {
      toast.error("Harap isi rentang Tanggal!");
      return;
    }

    // Validate teacher scope
    const validation = validateTeacherScopeForBatch(newSubject, newTargetClassIds);
    if (!validation.isValid) {
      toast.error(validation.error);
      return;
    }

    // Ensure at least one task is entered
    const hasSomeTask = (Object.values(levelTasks) as Array<{ title: string; instructions: string }>).some(t => t.title.trim() && t.instructions.trim());
    if (!hasSomeTask) {
      toast.error("Harap masukkan setidaknya satu judul dan instruksi tugas untuk level kemampuan!");
      return;
    }

    // Count recipients per level
    const recipientsCountByLevel: Record<string, number> = {};
    const studentsWithoutLevel: any[] = [];
    const studentsSkippedNoTask: any[] = [];

    rosterLevels.forEach(({ student, className, level, resolved }) => {
      if (!resolved || !level) {
        studentsWithoutLevel.push({ student, className });
      } else {
        const task = levelTasks[level] as { title: string; instructions: string } | undefined;
        const hasTask = task && task.title.trim() && task.instructions.trim();
        if (!hasTask) {
          studentsSkippedNoTask.push({ student, className, level });
        } else {
          recipientsCountByLevel[level] = (recipientsCountByLevel[level] || 0) + 1;
        }
      }
    });

    const classesNames = newTargetClassIds.map(cid => classes.find(c => c.id === cid)?.name || cid);

    const batchObj: Partial<LearningPowerUpTaskBatch> = {
      subjectKey: newSubject,
      subjectArea: LPU_SUBJECT_MAP[newSubject],
      academicYearId: activeYear,
      semester: newSemester,
      targetClassIds: newTargetClassIds,
      weekStartDate: newWeekStartDate,
      weekEndDate: newWeekEndDate,
      weekLabel: newWeekLabel || `Pekan (${formatDateShort(newWeekStartDate)} - ${formatDateShort(newWeekEndDate)})`,
      levelTasks: levelTasks
    };

    setPublishPreflight({
      batch: batchObj,
      recipientsCountByLevel,
      studentsWithoutLevel,
      studentsSkippedNoTask,
      classesNames
    });
  };

  const executePublishBatch = async () => {
    if (!publishPreflight) return;
    setIsPublishing(true);

    try {
      const { batch } = publishPreflight;
      const batchId = editingBatchId || `batch_${batch.subjectKey}_${batch.weekStartDate}_${activeYear.replace('/', '_')}`;

      // 1. Prepare clean levelTasks
      const cleanLevelTasks: Record<string, LpuLevelTask> = {};
      Object.entries(levelTasks).forEach(([lvl, rawTask]) => {
        const task = rawTask as { title: string; instructions: string };
        if (task.title.trim() || task.instructions.trim()) {
          cleanLevelTasks[lvl] = {
            title: task.title.trim(),
            instructions: task.instructions.trim()
          };
        }
      });

      // 2. Prepare task batch record
      const isEditing = !!editingBatchId;
      const batchDoc: LearningPowerUpTaskBatch = {
        id: batchId,
        unit: 'JUNIOR_HIGH',
        subjectKey: batch.subjectKey!,
        subjectArea: batch.subjectArea!,
        academicYearId: activeYear,
        semester: batch.semester!,
        targetClassIds: batch.targetClassIds!,
        weekStartDate: batch.weekStartDate!,
        weekEndDate: batch.weekEndDate!,
        weekLabel: batch.weekLabel!,
        levelTasks: cleanLevelTasks,
        status: 'PUBLISHED',
        createdBy: isEditing ? (taskBatches.find(b => b.id === batchId)?.createdBy || currentUser.uid) : currentUser.uid,
        createdByEmail: isEditing ? (taskBatches.find(b => b.id === batchId)?.createdByEmail || currentUser.email || '') : (currentUser.email || ''),
        createdByName: isEditing ? (taskBatches.find(b => b.id === batchId)?.createdByName || currentUser.displayName || '') : (currentUser.displayName || ''),
        createdAt: isEditing ? (taskBatches.find(b => b.id === batchId)?.createdAt || serverTimestamp()) : serverTimestamp(),
        updatedBy: currentUser.uid,
        updatedByEmail: currentUser.email || '',
        updatedByName: currentUser.displayName || '',
        updatedAt: serverTimestamp(),
        publishedBy: currentUser.uid,
        publishedByEmail: currentUser.email || '',
        publishedByName: currentUser.displayName || '',
        publishedAt: serverTimestamp()
      };

      // 3. Collect all assignments to create
      const assignmentsToCreate: LearningPowerUpAssignment[] = [];
      rosterLevels.forEach(({ student, className, level, resolved }) => {
        if (resolved && level) {
          const task = levelTasks[level];
          if (task && task.title.trim() && task.instructions.trim()) {
            const assignmentId = generateDeterministicAssignmentId(batchId, student.id, batch.subjectKey!);
            
            const historyEntry: LpuAssignmentHistoryEntry = {
              action: 'ASSIGN',
              performedByUid: currentUser.uid,
              performedByName: currentUser.displayName || currentUser.email || 'Guru',
              performedByRole: currentUser.role,
              timestamp: new Date()
            };

            const assignmentDoc: LearningPowerUpAssignment = {
              id: assignmentId,
              unit: 'JUNIOR_HIGH',
              taskBatchId: batchId,
              studentId: student.id,
              studentNameSnapshot: student.name,
              classId: student.classId,
              classNameSnapshot: className,
              subjectKey: batch.subjectKey!,
              subjectArea: batch.subjectArea!,
              levelSnapshot: level,
              taskTitle: task.title.trim(),
              taskInstructions: task.instructions.trim(),
              academicYearId: activeYear,
              semester: batch.semester!,
              weekStartDate: batch.weekStartDate!,
              weekEndDate: batch.weekEndDate!,
              weekLabel: batch.weekLabel!,
              status: 'ASSIGNED',
              history: [historyEntry],
              updatedAt: serverTimestamp()
            };

            assignmentsToCreate.push(assignmentDoc);
          }
        }
      });

      // 4. Batch-write assignments in chunks of 400 to protect limits
      const chunkSize = 400;
      for (let i = 0; i < assignmentsToCreate.length; i += chunkSize) {
        const chunk = assignmentsToCreate.slice(i, i + chunkSize);
        const writeB = writeBatch(db);
        chunk.forEach(asg => {
          writeB.set(doc(db, 'learning_power_up_assignments', asg.id), asg);
        });
        await writeB.commit();
      }

      // 5. Finally, write the published task batch doc to mark it as PUBLISHED
      await setDoc(doc(db, 'learning_power_up_task_batches', batchId), batchDoc);

      toast.success(`Berhasil menerbitkan tugas! ${assignmentsToCreate.length} tugas individu berhasil disebar.`);
      setPublishPreflight(null);
      resetNewBatchForm();
      await loadTaskBatches();
    } catch (err) {
      console.error("Error executing publish:", err);
      toast.error("Gagal menerbitkan tugas. Pastikan Anda memiliki koneksi internet stabil.");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleEditBatch = async (batch: LearningPowerUpTaskBatch) => {
    setLoadingData(true);
    try {
      let hasActivity = false;
      if (batch.status === 'PUBLISHED') {
        const q = query(
          collection(db, 'learning_power_up_assignments'),
          where('taskBatchId', '==', batch.id)
        );
        const snap = await getDocs(q);
        hasActivity = snap.docs.some(docSnap => {
          const asg = docSnap.data() as LearningPowerUpAssignment;
          return asg.status !== 'ASSIGNED' && asg.status !== 'CANCELLED';
        });
      }
      
      setEditingBatchId(batch.id);
      setEditingBatchStatus(batch.status);
      setEditingBatchHasActivity(hasActivity);
      setNewSubject(batch.subjectKey);
      setNewTargetClassIds(batch.targetClassIds);
      setNewWeekStartDate(batch.weekStartDate);
      setNewWeekEndDate(batch.weekEndDate);
      setNewWeekLabel(batch.weekLabel);
      setNewSemester(batch.semester);
      setLevelTasks(batch.levelTasks);
      setChangeNote('');

      toast.success(
        batch.status === 'PUBLISHED'
          ? (hasActivity
              ? "Tugas Terbit dimuat. Terdeteksi aktivitas siswa: Hanya dapat mengedit judul, instruksi, batas waktu, dan label pekan. Catatan perubahan wajib diisi."
              : "Tugas Terbit dimuat. Belum ada aktivitas siswa: Anda dapat mengedit semua field kecuali Subject.")
          : "Data tugas berhasil dimasukkan ke form di atas. Anda dapat mengubah, menyimpan draft, atau langsung menerbitkannya."
      );
      window.scrollTo({ top: 300, behavior: 'smooth' });
    } catch (err) {
      console.error("Error loading batch for editing:", err);
      toast.error("Gagal memuat tugas untuk diedit.");
    } finally {
      setLoadingData(false);
    }
  };

  const handleSavePublishedChanges = async () => {
    if (!editingBatchId || editingBatchStatus !== 'PUBLISHED') return;

    if (editingBatchHasActivity && !changeNote.trim()) {
      toast.error("Catatan perubahan wajib diisi karena tugas ini sudah memiliki aktivitas siswa!");
      return;
    }

    const hasSomeTask = (Object.values(levelTasks) as Array<{ title: string; instructions: string }>).some(t => t && t.title?.trim() && t.instructions?.trim());
    if (!hasSomeTask) {
      toast.error("Harap masukkan setidaknya satu judul dan instruksi tugas untuk level kemampuan!");
      return;
    }

    setLoadingData(true);
    try {
      const originalBatch = taskBatches.find(b => b.id === editingBatchId);
      if (!originalBatch) {
        throw new Error("Original task batch not found");
      }

      const cleanLevelTasks: Record<string, LpuLevelTask> = {};
      Object.entries(levelTasks).forEach(([lvl, rawTask]) => {
        const task = rawTask as { title: string; instructions: string };
        if (task && (task.title?.trim() || task.instructions?.trim())) {
          cleanLevelTasks[lvl] = {
            title: (task.title || '').trim(),
            instructions: (task.instructions || '').trim()
          };
        }
      });

      const updatedBatchDoc: LearningPowerUpTaskBatch = {
        ...originalBatch,
        levelTasks: cleanLevelTasks,
        weekEndDate: newWeekEndDate,
        weekLabel: newWeekLabel || `Pekan (${formatDateShort(newWeekStartDate)} - ${formatDateShort(newWeekEndDate)})`,
        updatedBy: currentUser.uid,
        updatedByEmail: currentUser.email || '',
        updatedByName: currentUser.displayName || '',
        updatedAt: serverTimestamp(),
      };

      if (!editingBatchHasActivity) {
        updatedBatchDoc.targetClassIds = newTargetClassIds;
        updatedBatchDoc.weekStartDate = newWeekStartDate;
        updatedBatchDoc.semester = newSemester;

        const q = query(collection(db, 'learning_power_up_assignments'), where('taskBatchId', '==', editingBatchId));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const deleteBatch = writeBatch(db);
          snap.docs.forEach(docSnap => {
            deleteBatch.delete(docSnap.ref);
          });
          await deleteBatch.commit();
        }

        const studentDocs: any[] = [];
        for (const classId of newTargetClassIds) {
          const sQ = query(collection(db, 'students'), where('classId', '==', classId), where('status', '==', 'active'));
          const sSnap = await getDocs(sQ);
          studentDocs.push(...sSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        }

        const levelsSnap = await getDocs(collection(db, 'system_lpu_levels'));
        const levelMap: Record<string, string> = {};
        levelsSnap.docs.forEach(d => {
          const data = d.data();
          if (data.studentId && data[newSubject]) {
            levelMap[data.studentId] = data[newSubject];
          }
        });

        const assignmentsToCreate: LearningPowerUpAssignment[] = [];
        for (const student of studentDocs) {
          const studentClass = classes.find(c => c.id === student.classId);
          const level = levelMap[student.id];
          if (level) {
            const task = cleanLevelTasks[level];
            if (task && task.title?.trim() && task.instructions?.trim()) {
              const assignmentId = `assignment_${editingBatchId}_${student.id}_${newSubject}`;
              const historyEntry: LpuAssignmentHistoryEntry = {
                action: 'ASSIGN',
                performedByUid: currentUser.uid,
                performedByName: currentUser.displayName || currentUser.email || 'Guru',
                performedByRole: currentUser.role,
                timestamp: new Date()
              };

              assignmentsToCreate.push({
                id: assignmentId,
                unit: 'JUNIOR_HIGH',
                taskBatchId: editingBatchId,
                studentId: student.id,
                studentNameSnapshot: student.name,
                classId: student.classId,
                classNameSnapshot: studentClass?.name || '',
                subjectKey: newSubject,
                subjectArea: LPU_SUBJECT_MAP[newSubject],
                levelSnapshot: level,
                taskTitle: task.title.trim(),
                taskInstructions: task.instructions.trim(),
                academicYearId: activeYear,
                semester: newSemester,
                weekStartDate: newWeekStartDate,
                weekEndDate: newWeekEndDate,
                weekLabel: newWeekLabel || `Pekan (${formatDateShort(newWeekStartDate)} - ${formatDateShort(newWeekEndDate)})`,
                status: 'ASSIGNED',
                history: [historyEntry],
                updatedAt: serverTimestamp()
              });
            }
          }
        }

        const chunkSize = 400;
        for (let i = 0; i < assignmentsToCreate.length; i += chunkSize) {
          const chunk = assignmentsToCreate.slice(i, i + chunkSize);
          const writeB = writeBatch(db);
          chunk.forEach(asg => {
            writeB.set(doc(db, 'learning_power_up_assignments', asg.id), asg);
          });
          await writeB.commit();
        }
      } else {
        updatedBatchDoc.changeNote = changeNote;

        const q = query(collection(db, 'learning_power_up_assignments'), where('taskBatchId', '==', editingBatchId));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const updateB = writeBatch(db);
          snap.docs.forEach(docSnap => {
            const asg = docSnap.data() as LearningPowerUpAssignment;
            const task = cleanLevelTasks[asg.levelSnapshot];
            if (task) {
              const historyEntry: LpuAssignmentHistoryEntry = {
                action: 'ASSIGN',
                performedByUid: currentUser.uid,
                performedByName: currentUser.displayName || currentUser.email || 'Guru',
                performedByRole: currentUser.role,
                timestamp: new Date(),
                note: `Tugas diperbarui oleh guru: "${changeNote}"`
              };

              updateB.update(docSnap.ref, {
                taskTitle: task.title.trim(),
                taskInstructions: task.instructions.trim(),
                weekEndDate: newWeekEndDate,
                weekLabel: newWeekLabel || `Pekan (${formatDateShort(newWeekStartDate)} - ${formatDateShort(newWeekEndDate)})`,
                changeNote: changeNote,
                history: [...(asg.history || []), historyEntry],
                updatedAt: serverTimestamp()
              });
            }
          });
          await updateB.commit();
        }
      }

      await setDoc(doc(db, 'learning_power_up_task_batches', editingBatchId), updatedBatchDoc);
      toast.success("Tugas terbit berhasil diperbarui!");
      resetNewBatchForm();
      await loadTaskBatches();
    } catch (err) {
      console.error("Error saving published batch changes:", err);
      toast.error("Gagal menyimpan perubahan tugas terbit.");
    } finally {
      setLoadingData(false);
    }
  };

  const canDeleteBatch = (batch: LearningPowerUpTaskBatch) => {
    if (!currentUser || !batch) return false;
    
    // Super Admin and Head Junior are allowed
    if (['SUPER_ADMIN', 'HEAD_JUNIOR'].includes(currentUser.role)) return true;
    
    // Active Junior High staff roles
    const activeJuniorHighStaffRoles = [
      'TEACHER', 'HOMEROOM_TEACHER', 'BK_MENTOR',
      'MTSS_ACADEMIC_PJ', 'COUNSELOR', 'SECRETARY_JH'
    ];
    
    return activeJuniorHighStaffRoles.includes(currentUser.role);
  };

  const handleDeleteBatchClick = async (batch: LearningPowerUpTaskBatch) => {
    setLoadingData(true);
    try {
      const q = query(
        collection(db, 'learning_power_up_assignments'),
        where('taskBatchId', '==', batch.id)
      );
      const snap = await getDocs(q);
      const asgs = snap.docs.map(doc => doc.data() as LearningPowerUpAssignment);
      
      const totalAssignments = asgs.length;
      const notStarted = asgs.filter(a => !a.status || a.status === 'ASSIGNED').length;
      const submitted = asgs.filter(a => (a.status as string) === 'SUBMITTED' || (a.status as string) === 'PENDING_VERIFICATION').length;
      const verified = asgs.filter(a => (a.status as string) === 'VERIFIED' || (a.status as string) === 'COMPLETED').length;
      const revision = asgs.filter(a => (a.status as string) === 'REVISION_REQUIRED' || (a.status as string) === 'RETURNED').length;

      setDeletingBatchStats({
        totalAssignments,
        notStarted,
        submitted,
        verified,
        revision
      });
      setDeletingBatch(batch);
      setDeleteSecondConfirmChecked(false);
    } catch (err) {
      console.error("Error loading stats for deletion:", err);
      toast.error("Gagal memuat statistik tugas.");
    } finally {
      setLoadingData(false);
    }
  };

  const handleDeleteBatchSubmit = async () => {
    if (!deletingBatch) return;
    
    // Prevent double clicks
    if (isDeleting) return;
    setIsDeleting(true);
    setLoadingData(true);

    try {
      const batchId = deletingBatch.id;
      
      // 1. Fetch all corresponding assignments for this batch
      const qAsgs = query(
        collection(db, 'learning_power_up_assignments'),
        where('taskBatchId', '==', batchId)
      );
      const asgsSnap = await getDocs(qAsgs);
      const asgDocs = asgsSnap.docs;

      // 2. Fetch all corresponding activity logs for this batch
      const qLogs = query(
        collection(db, 'learning_power_up_activity_logs'),
        where('taskBatchId', '==', batchId)
      );
      const logsSnap = await getDocs(qLogs);
      const logDocs = logsSnap.docs;

      // Prepare chunks of deletions
      const allDeletes: any[] = [
        doc(db, 'learning_power_up_task_batches', batchId),
        ...asgDocs.map(d => d.ref),
        ...logDocs.map(d => d.ref)
      ];

      const CHUNK_SIZE = 400;
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < allDeletes.length; i += CHUNK_SIZE) {
        const chunk = allDeletes.slice(i, i + CHUNK_SIZE);
        const writeB = writeBatch(db);
        chunk.forEach(ref => {
          writeB.delete(ref);
        });
        
        try {
          await writeB.commit();
          successCount += chunk.length;
        } catch (chunkErr) {
          console.error(`Error deleting chunk starting at index ${i}:`, chunkErr);
          failCount += chunk.length;
        }
      }

      // Check results
      if (failCount > 0) {
        toast.error(`Berhasil menghapus ${successCount} data, namun ${failCount} data gagal dihapus.`);
      } else {
        toast.success("Tugas, seluruh assignment siswa, dan riwayat log berhasil dihapus secara permanen.");
      }

      // Reset and refresh
      setDeletingBatch(null);
      setDeletingBatchStats(null);
      setDeleteSecondConfirmChecked(false);
      
      // Refresh teacher list, tracker, and student pages
      await loadTaskBatches();
      await loadClassData();
      
    } catch (err) {
      console.error("Error running handleDeleteBatchSubmit:", err);
      toast.error("Gagal menghapus tugas secara permanen.");
    } finally {
      setIsDeleting(false);
      setLoadingData(false);
    }
  };

  const handleCancelBatchClick = async (batch: LearningPowerUpTaskBatch) => {
    setLoadingData(true);
    try {
      const q = query(
        collection(db, 'learning_power_up_assignments'),
        where('taskBatchId', '==', batch.id)
      );
      const snap = await getDocs(q);
      const asgs = snap.docs.map(doc => doc.data() as LearningPowerUpAssignment);
      
      const totalAssignments = asgs.length;
      const notStarted = asgs.filter(a => !a.status || a.status === 'ASSIGNED').length;
      const submitted = asgs.filter(a => (a.status as string) === 'SUBMITTED' || (a.status as string) === 'PENDING_VERIFICATION').length;
      const verified = asgs.filter(a => (a.status as string) === 'VERIFIED' || (a.status as string) === 'COMPLETED').length;
      const revision = asgs.filter(a => (a.status as string) === 'REVISION_REQUIRED' || (a.status as string) === 'RETURNED').length;

      setCancellingBatchStats({
        totalAssignments,
        notStarted,
        submitted,
        verified,
        revision
      });
      setCancellingBatch(batch);
      setCancellationReason('');
      setCancellationNote('');
    } catch (err) {
      console.error("Error loading stats for cancellation:", err);
      toast.error("Gagal memuat statistik tugas.");
    } finally {
      setLoadingData(false);
    }
  };

  const handleCancelBatchSubmit = async () => {
    if (!cancellingBatch || !cancellationReason) {
      toast.error("Silakan pilih alasan pembatalan.");
      return;
    }

    setIsCancelling(true);
    let successfulAssignmentsCount = 0;
    let totalAssignmentsCount = 0;

    try {
      // 1. Fetch all assignments
      const q = query(
        collection(db, 'learning_power_up_assignments'),
        where('taskBatchId', '==', cancellingBatch.id)
      );
      
      let snap;
      try {
        snap = await getDocs(q);
      } catch (err) {
        handleFirestoreError(err, 'list', 'learning_power_up_assignments');
      }

      const docsToUpdate = snap.docs.filter(docSnap => {
        const asg = docSnap.data() as LearningPowerUpAssignment;
        return asg.status !== 'CANCELLED' || !asg.isCancelled;
      });

      totalAssignmentsCount = docsToUpdate.length;

      // 2. Process in chunks of 400 for safety and rate-limit friendliness
      const chunkSize = 400;
      for (let i = 0; i < docsToUpdate.length; i += chunkSize) {
        const chunk = docsToUpdate.slice(i, i + chunkSize);
        const batchWrite = writeBatch(db);

        chunk.forEach(docSnap => {
          const asg = docSnap.data() as LearningPowerUpAssignment;
          const newHistoryEntry: LpuAssignmentHistoryEntry = {
            action: 'CANCEL' as any,
            performedByUid: currentUser.uid,
            performedByName: currentUser.displayName || currentUser.email || 'Guru',
            performedByRole: currentUser.role,
            timestamp: new Date(),
            note: `Tugas dibatalkan oleh guru. Alasan: ${cancellationReason}. Catatan: ${cancellationNote.trim()}`
          };

          batchWrite.set(docSnap.ref, {
            isCancelled: true,
            status: 'CANCELLED',
            history: [...(asg.history || []), newHistoryEntry],
            updatedAt: serverTimestamp()
          }, { merge: true });
        });

        try {
          await batchWrite.commit();
          successfulAssignmentsCount += chunk.length;
        } catch (err) {
          console.error(`Error committing assignment chunk starting at ${i}:`, err);
          throw err; // propagate to prevent marking batch as CANCELLED
        }
      }

      // 3. Update parent batch
      const batchRef = doc(db, 'learning_power_up_task_batches', cancellingBatch.id);
      try {
        await setDoc(batchRef, {
          status: 'CANCELLED',
          cancellationReason: cancellationReason,
          cancellationNote: cancellationNote.trim(),
          cancelledAt: serverTimestamp(),
          cancelledBy: currentUser.displayName || currentUser.email || 'Guru',
          cancelledByUid: currentUser.uid,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (err) {
        handleFirestoreError(err, 'update', `learning_power_up_task_batches/${cancellingBatch.id}`);
      }

      // 4. Create one cancellation event in the activity log
      const logId = `${cancellingBatch.id}_cancelled_${Date.now()}`;
      try {
        await setDoc(doc(db, 'learning_power_up_activity_logs', logId), {
          unit: 'JUNIOR_HIGH',
          actor: {
            uid: currentUser.uid,
            name: currentUser.displayName || currentUser.email || 'Guru',
            email: currentUser.email || '',
            role: currentUser.role
          },
          timestamp: serverTimestamp(),
          reason: cancellationReason,
          note: cancellationNote.trim(),
          taskBatchId: cancellingBatch.id
        });
      } catch (err) {
        handleFirestoreError(err, 'create', `learning_power_up_activity_logs/${logId}`);
      }

      toast.success(`Tugas berhasil dibatalkan. Riwayat siswa tetap tersimpan. (${successfulAssignmentsCount} tugas siswa diperbarui)`);
      setCancellingBatch(null);
      setCancellingBatchStats(null);
      await loadClassData();
    } catch (err: any) {
      console.error("Error cancelling batch:", err);
      
      const isPermissionError = 
        err?.message?.toLowerCase().includes('permission') || 
        err?.message?.toUpperCase().includes('PERMISSION_DENIED') || 
        err?.code === 'permission-denied';

      if (isPermissionError) {
        toast.error("Pembatalan tugas gagal karena Anda tidak memiliki izin yang diperlukan. Hubungi Super Admin atau administrator Junior High.");
      } else {
        toast.error(`Gagal membatalkan tugas. Baru ${successfulAssignmentsCount} dari ${totalAssignmentsCount} tugas siswa yang berhasil dibatalkan. Silakan coba lagi.`);
      }
    } finally {
      setIsCancelling(false);
    }
  };

  const resetNewBatchForm = () => {
    setNewSubject('');
    setNewTargetClassIds([]);
    setNewWeekStartDate('');
    setNewWeekEndDate('');
    setNewWeekLabel('');
    setNewSemester('1');
    setLevelTasks({});
    setRosterLevels([]);
    setEditingBatchId(null);
    setEditingBatchStatus(null);
    setEditingBatchHasActivity(false);
    setChangeNote('');
  };


  // Filter student roster by name search
  const filteredStudents = students.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.nis && s.nis.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Helper: Find progress record
  const findProgress = (studentId: string, pkgId: string, field: string): TaskProgress | null => {
    return progresses.find(p => p.studentId === studentId && p.packageId === pkgId && p.field === field) || null;
  };

  const isFieldAllVerified = (field: 'bahasaIndonesia' | 'english' | 'mengaji' | 'numerasi') => {
    if (!activePackage || students.length === 0) return false;
    return students.every(student => {
      const progress = findProgress(student.id, activePackage.id, field);
      return progress?.status === 'VERIFIED';
    });
  };

  // Filter package options
  const activePackage = packages.find(p => p.id === selectedWeek);
  const activeFields = activePackage ? (['bahasaIndonesia', 'english', 'mengaji', 'numerasi'] as const).filter(
    f => activePackage.tasks[f] && activePackage.tasks[f]?.trim()
  ) : [];

  // Handle spreadsheet cell click -> opens Verification Modal or Unverification Dialog
  const handleCellClick = (student: Student, field: 'bahasaIndonesia' | 'english' | 'mengaji' | 'numerasi') => {
    if (!activePackage) return;
    const taskDescription = activePackage.tasks[field] || '';
    if (!taskDescription.trim()) {
      toast.error(`Tidak ada tugas untuk bidang ${CATEGORY_CONFIG[field].label} pada periode ini.`);
      return;
    }
    const progress = findProgress(student.id, activePackage.id, field);
    
    // Check if task is already VERIFIED -> trigger cancellation dialog
    if (progress && progress.status === 'VERIFIED') {
      const activeClass = classes.find(c => c.id === selectedClassId);
      const hasAccess = canTeacherVerifySubject(currentUser, activeClass, field);
      if (!hasAccess) {
        toast.error(`Akses Ditolak: Anda tidak memiliki wewenang untuk membatalkan verifikasi pada bidang ${CATEGORY_CONFIG[field].label}.`);
        return;
      }
      setUnverifyingProgress({ student, field, progress });
      return;
    }

    setVerifyingProgress({ student, field, taskDescription, progress });
    setVerificationNote(progress?.revisionNote || '');
  };

  // Save teacher verification (Verify Completed / Request Revision)
  const handleVerificationSave = async (isApproved: boolean) => {
    if (!verifyingProgress || !activePackage) return;
    const { student, field, progress } = verifyingProgress;
    
    if (!isApproved && !verificationNote.trim()) {
      toast.error("Feedback guru wajib diisi jika Anda menandai tugas Belum Tuntas!");
      return;
    }

    setIsSavingVerification(true);
    try {
      if (activePackage.id.startsWith('level_week_')) {
        const targetBatch = taskBatches.find(b => 
          b.weekStartDate === activePackage.weekStartDate && 
          b.subjectKey === field &&
          b.targetClassIds.includes(selectedClassId)
        );
        if (!targetBatch) {
          toast.error("Gagal menemukan batch tugas level-based.");
          return;
        }

        const assignmentId = generateDeterministicAssignmentId(targetBatch.id, student.id, field);
        const existingAsg = loadedAssignments.find(a => a.id === assignmentId);
        
        const newHistoryEntry: LpuAssignmentHistoryEntry = {
          action: isApproved ? 'VERIFY' : 'REVISION_REQUEST',
          performedByUid: currentUser.uid,
          performedByName: currentUser.displayName || currentUser.email || 'Guru',
          performedByRole: currentUser.role,
          timestamp: new Date(),
          note: isApproved ? "Guru menandai tugas Selesai." : `Guru menandai tugas Belum Tuntas. Catatan: "${verificationNote}"`
        };

        const updatedHistory = existingAsg ? [...(existingAsg.history || []), newHistoryEntry] : [newHistoryEntry];

        const assignmentUpdate = {
          status: isApproved ? 'VERIFIED' : 'REVISION_REQUIRED',
          verifiedAt: isApproved ? serverTimestamp() : null,
          verifiedBy: isApproved ? (currentUser.displayName || currentUser.email || "Guru") : null,
          verifiedByName: isApproved ? (currentUser.displayName || currentUser.email || "Guru") : null,
          verifiedByEmail: isApproved ? (currentUser.email || null) : null,
          verificationMethod: isApproved ? ("INDIVIDUAL" as const) : null,
          revisionNote: isApproved ? null : verificationNote,
          history: updatedHistory,
          updatedAt: serverTimestamp()
        };

        await setDoc(doc(db, 'learning_power_up_assignments', assignmentId), assignmentUpdate, { merge: true });
        toast.success(isApproved ? "Tugas berhasil ditandai Selesai!" : "Tugas berhasil ditandai Belum Tuntas dengan catatan.");
        setVerifyingProgress(null);
        await loadClassData();
        return;
      }

      const progressId = progress?.id || `progress_${activePackage.id}_${student.id}_${field}`;
      const currentHistory = progress?.history || [];
      const nowStr = new Date().toLocaleString('id-ID', { hour12: false });

      const newHistoryItem: TaskProgressHistory = {
        timestamp: nowStr,
        action: isApproved ? 'VERIFY' : 'REVISION_REQUEST',
        actorName: currentUser.displayName || currentUser.email || "Guru/Coach",
        note: isApproved ? "Guru menandai tugas Selesai." : `Guru menandai tugas Belum Tuntas. Catatan: "${verificationNote}"`
      };

      const updatedProgress = {
        id: progressId,
        packageId: activePackage.id,
        taskPackageId: activePackage.id,
        studentId: student.id,
        classId: selectedClassId,
        academicYearId: activeYear,
        field,
        subjectKey: field,
        status: isApproved ? 'VERIFIED' : 'REVISION_REQUIRED',
        submittedAt: progress?.submittedAt || null,
        verifiedAt: isApproved ? serverTimestamp() : (progress?.verifiedAt || null),
        verifiedBy: isApproved ? (currentUser.displayName || currentUser.email || "Guru/Coach") : (progress?.verifiedBy || null),
        verifiedByUserId: isApproved ? (currentUser.uid || null) : (progress?.verifiedByUserId || null),
        verifiedByName: isApproved ? (currentUser.displayName || currentUser.email || "Guru/Coach") : (progress?.verifiedByName || null),
        verifiedByEmail: isApproved ? (currentUser.email || null) : (progress?.verifiedByEmail || null),
        verificationMethod: isApproved ? ("INDIVIDUAL" as const) : (progress?.verificationMethod || null),
        revisionNote: isApproved ? null : verificationNote,
        revisedAt: progress?.revisedAt || null,
        updatedAt: serverTimestamp(),
        history: [...currentHistory, newHistoryItem]
      };

      await setDoc(doc(db, 'learning_power_up_progress', progressId), updatedProgress, { merge: true });
      toast.success(isApproved ? "Tugas berhasil ditandai Selesai!" : "Tugas berhasil ditandai Belum Tuntas dengan catatan.");
      
      setVerifyingProgress(null);
      await loadClassData();
    } catch (err) {
      console.error("Error saving verification:", err);
      toast.error("Gagal menyimpan hasil verifikasi.");
    } finally {
      setIsSavingVerification(false);
    }
  };

  // Bulk Verification Click handler
  const handleBulkVerifyClick = (field: 'bahasaIndonesia' | 'english' | 'mengaji' | 'numerasi') => {
    const activeClass = classes.find(c => c.id === selectedClassId);
    const hasAccess = canTeacherVerifySubject(currentUser, activeClass, field);
    if (!hasAccess) {
      toast.error(`Akses Ditolak: Anda tidak memiliki wewenang untuk verifikasi massal pada bidang ${CATEGORY_CONFIG[field].label}.`);
      return;
    }

    setBulkConfirm({
      field,
      studentCount: filteredStudents.length
    });
  };

  // Bulk Verification Submit handler
  const handleBulkVerifySubmit = async () => {
    if (!bulkConfirm || !activePackage) return;
    const { field } = bulkConfirm;
    
    // Authorization check
    const activeClass = classes.find(c => c.id === selectedClassId);
    const hasAccess = canTeacherVerifySubject(currentUser, activeClass, field);
    if (!hasAccess) {
      toast.error(`Akses ditolak: Anda tidak berwenang melakukan verifikasi massal bidang ${CATEGORY_CONFIG[field].label}.`);
      setBulkConfirm(null);
      return;
    }

    setLoadingData(true);
    try {
      if (activePackage.id.startsWith('level_week_')) {
        const targetBatch = taskBatches.find(b => 
          b.weekStartDate === activePackage.weekStartDate && 
          b.subjectKey === field &&
          b.targetClassIds.includes(selectedClassId)
        );
        if (!targetBatch) {
          toast.error("Gagal menemukan batch tugas level-based.");
          setBulkConfirm(null);
          setLoadingData(false);
          return;
        }

        const batch = writeBatch(db);
        for (const student of students) {
          const assignmentId = generateDeterministicAssignmentId(targetBatch.id, student.id, field);
          const existingAsg = loadedAssignments.find(a => a.id === assignmentId);
          if (!existingAsg) continue;

          const newHistoryEntry: LpuAssignmentHistoryEntry = {
            action: 'VERIFY',
            performedByUid: currentUser.uid,
            performedByName: currentUser.displayName || currentUser.email || 'Guru',
            performedByRole: currentUser.role,
            timestamp: new Date(),
            note: "Verifikasi massal oleh guru."
          };

          const updatedHistory = [...(existingAsg.history || []), newHistoryEntry];
          const assignmentUpdate = {
            status: 'VERIFIED',
            verifiedAt: serverTimestamp(),
            verifiedBy: currentUser.displayName || currentUser.email || "Guru",
            verifiedByName: currentUser.displayName || currentUser.email || "Guru",
            verifiedByEmail: currentUser.email || null,
            verificationMethod: "BULK" as const,
            history: updatedHistory,
            updatedAt: serverTimestamp()
          };

          batch.set(doc(db, 'learning_power_up_assignments', assignmentId), assignmentUpdate, { merge: true });
        }

        await batch.commit();
        toast.success(`Berhasil melakukan verifikasi massal untuk seluruh siswa kelas pada bidang ${CATEGORY_CONFIG[field].label}!`);
        setBulkConfirm(null);
        await loadClassData();
        return;
      }

      const batch = writeBatch(db);
      const nowStr = new Date().toLocaleString('id-ID', { hour12: false });

      for (const student of students) {
        const existingProgress = findProgress(student.id, activePackage.id, field);
        const progressId = existingProgress?.id || `progress_${activePackage.id}_${student.id}_${field}`;
        const currentHistory = existingProgress?.history || [];

        const newHistoryItem: TaskProgressHistory = {
          timestamp: nowStr,
          action: 'VERIFY',
          actorName: currentUser.displayName || currentUser.email || "Guru/Coach",
          note: "Verifikasi massal oleh guru."
        };

        const updatedProgress = {
          id: progressId,
          packageId: activePackage.id,
          taskPackageId: activePackage.id,
          studentId: student.id,
          classId: selectedClassId,
          academicYearId: activeYear,
          field,
          subjectKey: field,
          status: 'VERIFIED' as const,
          submittedAt: existingProgress?.submittedAt || serverTimestamp(),
          verifiedAt: serverTimestamp(),
          verifiedBy: currentUser.displayName || currentUser.email || "Guru/Coach",
          verifiedByUserId: currentUser.uid || null,
          verifiedByName: currentUser.displayName || currentUser.email || "Guru/Coach",
          verifiedByEmail: currentUser.email || null,
          verificationMethod: "BULK" as const,
          revisionNote: null,
          revisedAt: existingProgress?.revisedAt || null,
          updatedAt: serverTimestamp(),
          history: [...currentHistory, newHistoryItem]
        };

        batch.set(doc(db, 'learning_power_up_progress', progressId), updatedProgress, { merge: true });
      }

      await batch.commit();
      toast.success(`Berhasil melakukan verifikasi massal untuk seluruh siswa kelas pada bidang ${CATEGORY_CONFIG[field].label}!`);
      setBulkConfirm(null);
      await loadClassData();
    } catch (err) {
      console.error("Error doing bulk verification:", err);
      toast.error("Gagal melakukan verifikasi massal.");
    } finally {
      setLoadingData(false);
    }
  };

  // Individual Unverification Submit handler
  const handleUnverifySubmit = async () => {
    if (!unverifyingProgress || !activePackage) return;
    const { student, field, progress } = unverifyingProgress;

    // Authorization check
    const activeClass = classes.find(c => c.id === selectedClassId);
    const hasAccess = canTeacherVerifySubject(currentUser, activeClass, field);
    if (!hasAccess) {
      toast.error(`Akses ditolak: Anda tidak berwenang membatalkan verifikasi bidang ${CATEGORY_CONFIG[field].label}.`);
      setUnverifyingProgress(null);
      return;
    }

    setLoadingData(true);
    try {
      if (activePackage.id.startsWith('level_week_')) {
        const targetBatch = taskBatches.find(b => 
          b.weekStartDate === activePackage.weekStartDate && 
          b.subjectKey === field &&
          b.targetClassIds.includes(selectedClassId)
        );
        if (!targetBatch) {
          toast.error("Gagal menemukan batch tugas level-based.");
          setUnverifyingProgress(null);
          setLoadingData(false);
          return;
        }

        const assignmentId = generateDeterministicAssignmentId(targetBatch.id, student.id, field);
        const existingAsg = loadedAssignments.find(a => a.id === assignmentId);

        const newHistoryEntry: LpuAssignmentHistoryEntry = {
          action: 'ASSIGN',
          performedByUid: currentUser.uid,
          performedByName: currentUser.displayName || currentUser.email || 'Guru',
          performedByRole: currentUser.role,
          timestamp: new Date(),
          note: "Pembatalan verifikasi tugas manual."
        };

        const updatedHistory = existingAsg ? [...(existingAsg.history || []), newHistoryEntry] : [newHistoryEntry];

        const assignmentUpdate = {
          status: 'ASSIGNED',
          verifiedAt: null,
          verifiedBy: null,
          verifiedByName: null,
          verifiedByEmail: null,
          verificationMethod: null,
          history: updatedHistory,
          updatedAt: serverTimestamp()
        };

        await setDoc(doc(db, 'learning_power_up_assignments', assignmentId), assignmentUpdate, { merge: true });
        toast.success(`Berhasil membatalkan verifikasi tugas ${CATEGORY_CONFIG[field].label} untuk ${student.name}!`);
        setUnverifyingProgress(null);
        await loadClassData();
        return;
      }

      const progressId = progress.id;
      const currentHistory = progress.history || [];
      const nowStr = new Date().toLocaleString('id-ID', { hour12: false });

      const newHistoryItem: TaskProgressHistory = {
        timestamp: nowStr,
        action: 'UNVERIFY' as const,
        actorName: currentUser.displayName || currentUser.email || "Guru/Coach",
        note: "Pembatalan verifikasi tugas manual."
      };

      const updatedProgress = {
        id: progressId,
        status: 'NOT_STARTED' as const,
        verifiedByUserId: null,
        verifiedByEmail: null,
        verifiedByName: null,
        verifiedBy: null,
        verifiedAt: null,
        verificationMethod: null,

        lastUnverifiedByUserId: currentUser.uid || null,
        lastUnverifiedByEmail: currentUser.email || null,
        lastUnverifiedAt: serverTimestamp(),
        unverifyReason: "manual_correction",
        
        updatedAt: serverTimestamp(),
        history: [...currentHistory, newHistoryItem]
      };

      await setDoc(doc(db, 'learning_power_up_progress', progressId), updatedProgress, { merge: true });
      toast.success(`Berhasil membatalkan verifikasi tugas ${CATEGORY_CONFIG[field].label} untuk ${student.name}!`);
      setUnverifyingProgress(null);
      await loadClassData();
    } catch (err) {
      console.error("Error un-verifying task:", err);
      toast.error("Gagal membatalkan verifikasi.");
    } finally {
      setLoadingData(false);
    }
  };

  // Bulk Unverification Click handler
  const handleBulkUnverifyClick = (field: 'bahasaIndonesia' | 'english' | 'mengaji' | 'numerasi') => {
    const activeClass = classes.find(c => c.id === selectedClassId);
    const hasAccess = canTeacherVerifySubject(currentUser, activeClass, field);
    if (!hasAccess) {
      toast.error(`Akses Ditolak: Anda tidak memiliki wewenang untuk pembatalan verifikasi massal pada bidang ${CATEGORY_CONFIG[field].label}.`);
      return;
    }

    setBulkUnverifyConfirm({
      field,
      studentCount: students.length
    });
  };

  // Bulk Unverification Submit handler
  const handleBulkUnverifySubmit = async () => {
    if (!bulkUnverifyConfirm || !activePackage) return;
    const { field } = bulkUnverifyConfirm;
    
    // Authorization check
    const activeClass = classes.find(c => c.id === selectedClassId);
    const hasAccess = canTeacherVerifySubject(currentUser, activeClass, field);
    if (!hasAccess) {
      toast.error(`Akses ditolak: Anda tidak berwenang melakukan pembatalan verifikasi massal bidang ${CATEGORY_CONFIG[field].label}.`);
      setBulkUnverifyConfirm(null);
      return;
    }

    setLoadingData(true);
    try {
      if (activePackage.id.startsWith('level_week_')) {
        const targetBatch = taskBatches.find(b => 
          b.weekStartDate === activePackage.weekStartDate && 
          b.subjectKey === field &&
          b.targetClassIds.includes(selectedClassId)
        );
        if (!targetBatch) {
          toast.error("Gagal menemukan batch tugas level-based.");
          setBulkUnverifyConfirm(null);
          setLoadingData(false);
          return;
        }

        const batch = writeBatch(db);
        for (const student of students) {
          const assignmentId = generateDeterministicAssignmentId(targetBatch.id, student.id, field);
          const existingAsg = loadedAssignments.find(a => a.id === assignmentId);
          if (!existingAsg) continue;

          const newHistoryEntry: LpuAssignmentHistoryEntry = {
            action: 'ASSIGN',
            performedByUid: currentUser.uid,
            performedByName: currentUser.displayName || currentUser.email || 'Guru',
            performedByRole: currentUser.role,
            timestamp: new Date(),
            note: "Pembatalan verifikasi massal oleh guru."
          };

          const updatedHistory = [...(existingAsg.history || []), newHistoryEntry];
          const assignmentUpdate = {
            status: 'ASSIGNED',
            verifiedAt: null,
            verifiedBy: null,
            verifiedByName: null,
            verifiedByEmail: null,
            verificationMethod: null,
            history: updatedHistory,
            updatedAt: serverTimestamp()
          };

          batch.set(doc(db, 'learning_power_up_assignments', assignmentId), assignmentUpdate, { merge: true });
        }

        await batch.commit();
        toast.success(`Berhasil membatalkan verifikasi massal untuk seluruh siswa kelas pada bidang ${CATEGORY_CONFIG[field].label}!`);
        setBulkUnverifyConfirm(null);
        await loadClassData();
        return;
      }

      const batch = writeBatch(db);
      const nowStr = new Date().toLocaleString('id-ID', { hour12: false });

      for (const student of students) {
        const existingProgress = findProgress(student.id, activePackage.id, field);
        if (!existingProgress) continue;
        const progressId = existingProgress.id;
        const currentHistory = existingProgress.history || [];

        const newHistoryItem: TaskProgressHistory = {
          timestamp: nowStr,
          action: 'UNVERIFY' as const,
          actorName: currentUser.displayName || currentUser.email || "Guru/Coach",
          note: "Pembatalan verifikasi massal oleh guru."
        };

        const updatedProgress = {
          id: progressId,
          status: 'NOT_STARTED' as const,
          verifiedByUserId: null,
          verifiedByEmail: null,
          verifiedByName: null,
          verifiedBy: null,
          verifiedAt: null,
          verificationMethod: null,

          lastUnverifiedByUserId: currentUser.uid || null,
          lastUnverifiedByEmail: currentUser.email || null,
          lastUnverifiedAt: serverTimestamp(),
          unverifyReason: "manual_correction",
          
          updatedAt: serverTimestamp(),
          history: [...currentHistory, newHistoryItem]
        };

        batch.set(doc(db, 'learning_power_up_progress', progressId), updatedProgress, { merge: true });
      }

      await batch.commit();
      toast.success(`Berhasil membatalkan verifikasi massal untuk seluruh siswa kelas pada bidang ${CATEGORY_CONFIG[field].label}!`);
      setBulkUnverifyConfirm(null);
      await loadClassData();
    } catch (err) {
      console.error("Error doing bulk unverification:", err);
      toast.error("Gagal melakukan pembatalan verifikasi massal.");
    } finally {
      setLoadingData(false);
    }
  };

  const canEditBatch = (batch: LearningPowerUpTaskBatch) => {
    if (!currentUser || !batch) return false;
    if (['SUPER_ADMIN', 'HEAD_JUNIOR'].includes(currentUser.role)) return true;
    return batch.createdBy === currentUser.uid;
  };

  if (loadingMetadata) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-12 h-12 text-[#109E58] animate-spin" />
        <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Memuat Otoritas Kelas...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8" id="learning-power-up-teacher-root">
      
      {/* Header Panel */}
      <div className="bg-white rounded-[2rem] border border-slate-100 p-8 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <span className="px-3 py-1 bg-[#109E58]/10 text-[#109E58] text-[10px] font-black uppercase tracking-widest rounded-full border border-[#109E58]/20">
            Lumina Junior High — Coach Workspace
          </span>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">
            Learning Power-Up Tracker
          </h1>
          <p className="text-sm text-gray-500 font-semibold">
            Kelola tugas dan verifikasi penyelesaian tugas siswa secara terpadu.
          </p>
          
          <div className="flex flex-wrap gap-x-4 gap-y-2 pt-2 text-xs font-bold text-gray-500">
            <span className="bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100">
              Guru: <strong className="text-gray-950">{currentUser.displayName || currentUser.email}</strong>
            </span>
            <span className="bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100">
              Tahun Ajaran Aktif: <strong className="text-gray-950">{activeYear}</strong>
            </span>
          </div>
        </div>

        {/* Class selector */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Pilih Kelas</label>
            {classes.length > 0 ? (
              <div className="flex flex-col gap-1">
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="bg-white border border-slate-200 text-gray-700 font-bold text-sm px-4 py-2.5 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-[#109E58]/20 focus:border-[#109E58] min-w-[200px]"
                >
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {classes.find(c => c.id === selectedClassId) && (
                  <span className="text-xs text-gray-500 font-bold" id="selected-class-student-count-display">
                    Terpilih: {classes.find(c => c.id === selectedClassId)?.name} ({students.length} siswa)
                  </span>
                )}
              </div>
            ) : (
              <div className="text-xs font-bold text-red-500 bg-red-50 border border-red-100 p-2.5 rounded-xl">
                Tidak ada kelas terhubung SMP
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs Menu Navigation */}
      <div className="flex border-b border-slate-100 gap-6">
        <button
          onClick={() => setActiveTab('TRACKER')}
          className={cn(
            "pb-4 text-sm font-black uppercase tracking-wider relative transition-all",
            activeTab === 'TRACKER' ? "text-[#109E58]" : "text-gray-400 hover:text-gray-600"
          )}
        >
          Tracker Progres Kelas
          {activeTab === 'TRACKER' && (
            <motion.div layoutId="teacherTabUnderline" className="absolute bottom-0 inset-x-0 h-1 bg-[#109E58] rounded-t-full" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('MANAGE_TASKS')}
          className={cn(
            "pb-4 text-sm font-black uppercase tracking-wider relative transition-all flex items-center gap-1.5",
            activeTab === 'MANAGE_TASKS' ? "text-[#109E58]" : "text-gray-400 hover:text-gray-600"
          )}
        >
          Kelola Tugas
          {activeTab === 'MANAGE_TASKS' && (
            <motion.div layoutId="teacherTabUnderline" className="absolute bottom-0 inset-x-0 h-1 bg-[#109E58] rounded-t-full" />
          )}
        </button>
      </div>

      {/* TAB 1 — SPREADSHEET TRACKER */}
      {activeTab === 'TRACKER' && (
        <div className="space-y-6">
          {/* Tracker Filters Control Bar */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-100">
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Periode:</span>
                {packages.length > 0 ? (
                  <select
                    value={selectedWeek}
                    onChange={(e) => setSelectedWeek(e.target.value)}
                    className="bg-white border border-slate-200 text-gray-700 font-bold text-xs px-3 py-2 rounded-lg"
                  >
                    {packages.map(p => (
                      <option key={p.id} value={p.id}>{formatDateRange(p.weekStartDate, p.weekEndDate)}</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs font-bold text-gray-400 italic">
                    Belum ada tugas aktif untuk kelas {classes.find(c => c.id === selectedClassId)?.name || 'terpilih'} pada periode ini.
                  </span>
                )}
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showArchivedCancelled}
                  onChange={(e) => setShowArchivedCancelled(e.target.checked)}
                  className="rounded border-slate-200 text-[#109E58] focus:ring-[#109E58]"
                />
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                  Tampilkan Riwayat (Arsip & Batal)
                </span>
              </label>
            </div>

            {/* Student Search */}
            <div className="relative md:w-80">
              <span className="absolute inset-y-0 left-3 flex items-center text-slate-400">
                <Search size={16} />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama atau NIS siswa..."
                className="w-full pl-10 pr-4 py-2.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#109E58]/20 focus:border-[#109E58]"
              />
            </div>
          </div>

          {/* Tracker Main Spreadsheet Table */}
          {loadingData ? (
            <div className="min-h-[30vh] flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-10 h-10 text-[#109E58] animate-spin" />
              <p className="text-xs text-gray-400 font-bold">Memuat data tracker...</p>
            </div>
          ) : students.length > 0 ? (
            <div className="bg-white rounded-[2rem] border border-slate-100 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[900px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black text-gray-400 uppercase tracking-wider">
                      <th className="py-4 px-6 text-center w-12">No</th>
                      <th className="py-4 px-6 min-w-[200px]">Nama Siswa</th>
                      {activeFields.length > 0 ? (
                        activeFields.map(field => (
                          <th key={field} className="py-4 px-6 text-center align-middle">
                            <div className="flex flex-col items-center gap-1.5 justify-center">
                              <span className="text-gray-900 font-bold">{CATEGORY_CONFIG[field].label}</span>
                              {isFieldAllVerified(field) ? (
                                <button
                                  onClick={() => handleBulkUnverifyClick(field)}
                                  className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white text-[9px] font-black uppercase tracking-widest rounded-md shadow-sm transition-all whitespace-nowrap"
                                  title={`Batalkan verifikasi seluruh siswa untuk bidang ${CATEGORY_CONFIG[field].label}`}
                                >
                                  Batalkan Semua
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleBulkVerifyClick(field)}
                                  className="px-2 py-1 bg-[#109E58] hover:bg-[#0d854a] text-white text-[9px] font-black uppercase tracking-widest rounded-md shadow-sm transition-all whitespace-nowrap"
                                  title={`Verifikasi seluruh siswa untuk bidang ${CATEGORY_CONFIG[field].label}`}
                                >
                                  Selesai Semua
                                </button>
                              )}
                            </div>
                          </th>
                        ))
                      ) : (
                        <th className="py-4 px-6 text-center text-slate-400 font-semibold italic">
                          Tidak Ada Tugas Aktif
                        </th>
                      )}
                      <th className="py-4 px-6 text-center">Ringkasan Selesai</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm font-medium text-gray-700">
                    {filteredStudents.map((student, idx) => {
                      let verifiedInWeekCount = 0;
                      let totalWeekTasksCount = activeFields.length;

                      return (
                        <tr key={student.id} className="hover:bg-slate-50/40 transition-all">
                          <td className="py-4 px-6 text-center text-xs font-bold text-gray-400">
                            {idx + 1}
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex flex-col">
                              <span className="font-bold text-gray-950">{student.name}</span>
                              <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">
                                NIS: {student.nis || "-"}
                              </span>
                            </div>
                          </td>

                          {activeFields.map(field => {
                            const progress = findProgress(student.id, selectedWeek, field);
                            const status = progress?.status || 'NOT_STARTED';

                            if (status === 'VERIFIED') {
                              verifiedInWeekCount++;
                            }

                            // If selected week is level-based, look up the assignment levelSnapshot
                            const isLevelBased = selectedWeek.startsWith('level_week_');
                            const asg = isLevelBased ? loadedAssignments.find(a => 
                              a.studentId === student.id && 
                              `level_week_${a.weekStartDate}` === selectedWeek && 
                              a.subjectKey === field
                            ) : null;
                            const levelSnapshot = asg ? asg.levelSnapshot : null;

                            return (
                              <td 
                                key={field} 
                                className="py-4 px-6 text-center align-middle relative group"
                              >
                                <div className="flex flex-col items-center gap-1.5 justify-center">
                                  {levelSnapshot && (
                                    <span className="text-[9px] font-extrabold text-violet-700 bg-violet-50 border border-violet-100 px-1.5 py-0.5 rounded-md uppercase tracking-wider block">
                                      {levelSnapshot}
                                    </span>
                                  )}
                                  
                                  <button
                                    onClick={() => handleCellClick(student, field)}
                                    className="inline-flex items-center justify-center p-1 rounded-xl transition-all hover:bg-slate-100 focus:outline-none"
                                    disabled={status === 'CANCELLED' as any}
                                  >
                                    {status === 'VERIFIED' && (
                                      <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center border border-emerald-200">
                                        <Check size={18} strokeWidth={3} />
                                      </div>
                                    )}
                                    {status === 'SUBMITTED' && (
                                      <div className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1 text-[10px] font-black uppercase animate-pulse">
                                        <Clock size={12} className="text-amber-500" />
                                        Menunggu Verifikasi Guru
                                      </div>
                                    )}
                                    {status === 'REVISION_REQUIRED' && (
                                      <div className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1 text-[10px] font-black uppercase">
                                        <AlertTriangle size={12} className="text-rose-500" />
                                        Belum Tuntas
                                      </div>
                                    )}
                                    {status === ('CANCELLED' as any) && (
                                      <div className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-500 border border-slate-200 flex items-center gap-1 text-[10px] font-black uppercase" title="Tugas Dibatalkan">
                                        <AlertCircle size={12} className="text-slate-400" />
                                        Batal
                                      </div>
                                    )}
                                    {status === 'NOT_STARTED' && (
                                      <div className="w-8 h-8 rounded-lg border border-slate-200/60 bg-slate-50 flex items-center justify-center text-slate-300 hover:border-slate-400 transition-all">
                                        <div className="w-4 h-4 rounded-sm border border-slate-200" />
                                      </div>
                                    )}
                                  </button>
                                </div>

                                {status === 'VERIFIED' && (
                                  <div className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-slate-900 text-white text-[11px] p-2.5 rounded-xl shadow-lg z-30 w-48 text-center font-bold leading-normal">
                                    <p className="text-emerald-400">
                                      Verified by: {
                                        progress?.verifiedByEmail || 
                                        progress?.verifiedByName || 
                                        (progress?.verifiedBy && !/^[a-zA-Z0-9]{20,30}$/.test(progress.verifiedBy) && !/^[0-9a-fA-F-]{36}$/.test(progress.verifiedBy) ? progress.verifiedBy : null) || 
                                        'Guru Lumina'
                                      }
                                    </p>
                                    {progress?.verificationMethod === 'BULK' && (
                                      <p className="text-slate-300 text-[10px] font-medium">Bulk verification</p>
                                    )}
                                    <p className="text-slate-400 text-[10px] mt-0.5">{formatVerificationTime(progress?.verifiedAt || progress?.updatedAt)}</p>
                                  </div>
                                )}
                              </td>
                            );
                          })}

                          {activeFields.length === 0 && (
                            <td className="py-4 px-6 text-center text-xs text-gray-400 italic">
                              -
                            </td>
                          )}

                          <td className="py-4 px-6 text-center">
                            <span className={cn(
                              "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-black",
                              verifiedInWeekCount === totalWeekTasksCount && totalWeekTasksCount > 0
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                : "bg-slate-50 text-slate-600 border border-slate-100"
                            )}>
                              {verifiedInWeekCount} / {totalWeekTasksCount}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-100 rounded-[2rem] p-12 text-center max-w-xl mx-auto space-y-4">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 mx-auto">
                <Users size={32} />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black text-gray-900">Belum Ada Roster Siswa</h3>
                <p className="text-sm text-gray-500 font-semibold leading-relaxed">
                  Roster siswa untuk kelas ini belum terdaftar di tahun ajaran {activeYear}. Hubungi admin kurikulum untuk memverifikasi pendaftaran enrollment kelas.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2 — KELOLA TUGAS */}
      {/* TAB 2 — KELOLA TUGAS */}
      {activeTab === 'MANAGE_TASKS' && (() => {
        const allSubjects: Array<{ key: LpuSubjectKey; label: string }> = [
          { key: 'bahasaIndonesia', label: 'Bahasa Indonesia' },
          { key: 'english', label: 'English Reading' },
          { key: 'mengaji', label: 'Mengaji' },
          { key: 'numerasi', label: 'Numerasi' }
        ];

        const authorizedClassesForSelectedSubject = classes.filter(c => {
          if (!newSubject) return false;
          const auth = resolveTeacherAuthorizedScope(currentUser, c, newSubject, true);
          return auth.isAuthorized;
        });

        return (
          <div className="space-y-8">
            
            {/* Main Form: Atur Tugas */}
            <div className="bg-white rounded-[2rem] border border-slate-100 p-8 shadow-sm space-y-6 animate-fadeIn">
              <div className="border-b border-slate-100 pb-4">
                <h2 className="text-xl font-bold text-gray-900">
                  {editingBatchId ? 'Edit Tugas LPU (Laju Pemahaman)' : 'Buat Tugas LPU Baru (Laju Pemahaman)'}
                </h2>
                <p className="text-xs font-semibold text-gray-400">Atur tugas berorientasi level kemampuan secara subject-first, multi-class, dan task-per-level.</p>
              </div>

              {/* Subject Dropdown Selector */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Subject Saya</label>
                  <select
                    value={newSubject}
                    disabled={!!editingBatchId}
                    onChange={(e) => {
                      setNewSubject(e.target.value as LpuSubjectKey);
                      setNewTargetClassIds([]); // Reset selected classes on subject change
                    }}
                    className="w-full bg-slate-50 border border-slate-200 text-sm px-4 py-3 rounded-xl focus:outline-none font-bold disabled:opacity-60"
                  >
                    <option value="">-- Pilih Subject --</option>
                    {allSubjects.filter(sub => {
                      if (['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'PRINCIPAL', 'VICE_PRINCIPAL', 'COORDINATOR'].includes(currentUser.role)) {
                        return true;
                      }
                      return classes.some(c => resolveTeacherAuthorizedScope(currentUser, c, sub.key, true).isAuthorized);
                    }).map(sub => (
                      <option key={sub.key} value={sub.key}>
                        {CATEGORY_CONFIG[sub.key]?.label || sub.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Semester Choice */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Semester</label>
                  <select
                    value={newSemester}
                    disabled={editingBatchStatus === 'PUBLISHED' && editingBatchHasActivity}
                    onChange={(e) => setNewSemester(e.target.value as '1' | '2')}
                    className="w-full bg-slate-50 border border-slate-200 text-sm px-4 py-3 rounded-xl focus:outline-none font-bold disabled:opacity-60"
                  >
                    <option value="1">Semester 1</option>
                    <option value="2">Semester 2</option>
                  </select>
                </div>
              </div>

              {/* Kelas Target (Multi-Select checkboxes) */}
              {newSubject && (
                <div className="space-y-2.5 p-4 bg-slate-50/50 border border-slate-200/50 rounded-2xl">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block">Kelas Target (Pilih satu atau lebih)</label>
                  {authorizedClassesForSelectedSubject.length > 0 ? (
                    <div className="flex flex-wrap gap-3">
                      {authorizedClassesForSelectedSubject.map(cls => (
                        <label
                          key={cls.id}
                          className={cn(
                            "flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all select-none",
                            newTargetClassIds.includes(cls.id)
                              ? "bg-violet-500 border-violet-500 text-white shadow-sm"
                              : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50",
                            (editingBatchStatus === 'PUBLISHED' && editingBatchHasActivity) && "opacity-60 cursor-not-allowed"
                          )}
                        >
                          <input
                            type="checkbox"
                            className="hidden"
                            checked={newTargetClassIds.includes(cls.id)}
                            disabled={editingBatchStatus === 'PUBLISHED' && editingBatchHasActivity}
                            onChange={() => {
                              if (newTargetClassIds.includes(cls.id)) {
                                setNewTargetClassIds(prev => prev.filter(id => id !== cls.id));
                              } else {
                                setNewTargetClassIds(prev => [...prev, cls.id]);
                              }
                            }}
                          />
                          {cls.name}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-rose-500 font-bold">Anda tidak memiliki hak akses/wewenang mengajar di kelas mana pun untuk mata pelajaran ini.</p>
                  )}
                </div>
              )}

              {/* Date Pickers & Week Label */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Tanggal Mulai</label>
                  <input
                    type="date"
                    required
                    value={newWeekStartDate}
                    disabled={editingBatchStatus === 'PUBLISHED' && editingBatchHasActivity}
                    onChange={(e) => {
                      const start = e.target.value;
                      setNewWeekStartDate(start);
                      if (start) {
                        const d = new Date(start);
                        d.setDate(d.getDate() + 6);
                        const end = d.toISOString().split('T')[0];
                        setNewWeekEndDate(end);
                        setNewWeekLabel(`Pekan (${formatDateShort(start)} - ${formatDateShort(end)})`);
                      }
                    }}
                    className="w-full bg-slate-50 border border-slate-200 text-sm px-4 py-3 rounded-xl focus:outline-none font-bold disabled:opacity-60"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Tanggal Selesai</label>
                  <input
                    type="date"
                    required
                    value={newWeekEndDate}
                    onChange={(e) => setNewWeekEndDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-sm px-4 py-3 rounded-xl focus:outline-none font-bold"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Label Pekan (Opsional)</label>
                  <input
                    type="text"
                    placeholder="Misal: Pekan UTS"
                    value={newWeekLabel}
                    onChange={(e) => setNewWeekLabel(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-sm px-4 py-3 rounded-xl focus:outline-none font-bold"
                  />
                </div>
              </div>

              {/* Tugas per Level & Roster Table */}
              {newSubject && newTargetClassIds.length > 0 && (
                <div className="space-y-6 border-t border-slate-100 pt-6">
                  {loadingRosterLevels ? (
                    <div className="flex flex-col items-center justify-center py-10 space-y-2">
                      <Loader2 size={24} className="animate-spin text-slate-400" />
                      <p className="text-xs text-slate-400 font-bold">Memuat level kemampuan roster...</p>
                    </div>
                  ) : (
                    <>
                      {/* Tugas per Level input fields */}
                      <div className="space-y-4">
                        <h3 className="text-sm font-black text-gray-800 uppercase tracking-wider">Tugas per Level</h3>
                        {Object.keys(levelTasks).length > 0 ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {Object.keys(levelTasks).map((levelKey) => (
                              <div key={levelKey} className="p-5 bg-slate-50/60 border border-slate-200/50 rounded-[1.5rem] space-y-3 shadow-sm hover:border-slate-300 transition-all">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                  <span className="text-[10px] font-black text-violet-700 bg-violet-50 border border-violet-100 px-3 py-1 rounded-full uppercase">
                                    Level: {levelKey}
                                  </span>
                                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                                    {rosterLevels.filter(r => r.level === levelKey).length} Siswa
                                  </span>
                                </div>
                                <div className="space-y-3">
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 block">Judul Tugas</label>
                                    <input
                                      type="text"
                                      placeholder={`Judul tugas untuk Level ${levelKey}`}
                                      value={levelTasks[levelKey]?.title || ''}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setLevelTasks(prev => ({
                                          ...prev,
                                          [levelKey]: { ...prev[levelKey], title: val }
                                        }));
                                      }}
                                      className="w-full bg-white border border-slate-200 text-xs px-3.5 py-2.5 rounded-xl focus:outline-none font-bold"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 block">Instruksi Tugas</label>
                                    <textarea
                                      rows={3}
                                      placeholder={`Tulis langkah pengerjaan tugas level ${levelKey}...`}
                                      value={levelTasks[levelKey]?.instructions || ''}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setLevelTasks(prev => ({
                                          ...prev,
                                          [levelKey]: { ...prev[levelKey], instructions: val }
                                        }));
                                      }}
                                      className="w-full bg-white border border-slate-200 text-xs px-3.5 py-2.5 rounded-xl focus:outline-none font-medium leading-relaxed"
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="p-8 bg-slate-50/50 border border-dashed border-slate-200 rounded-3xl text-center text-xs text-slate-400 font-bold">
                            Tidak ada level kemampuan yang saat ini dimiliki oleh siswa di kelas-kelas yang dipilih.
                          </div>
                        )}
                      </div>

                      {/* Read-only Roster Table */}
                      <div className="border-t border-slate-100 pt-6 space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-black text-gray-800 uppercase tracking-wider">
                            Daftar Siswa & Level Terpilih
                          </h3>
                          <span className="text-xs font-black text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                            {rosterLevels.length} Siswa
                          </span>
                        </div>
                        
                        <div className="max-h-72 overflow-y-auto border border-slate-100 rounded-[1.5rem] bg-white">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="bg-slate-50/80 text-slate-400 font-bold border-b border-slate-100 uppercase tracking-wider text-[10px]">
                                <th className="py-3 px-5">Siswa</th>
                                <th className="py-3 px-5">Kelas</th>
                                <th className="py-3 px-5">Level Subject</th>
                                <th className="py-3 px-5">Status Penerbitan</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {rosterLevels.map(({ student, className, level, resolved }, idx) => (
                                <tr key={`${student.id}-${idx}`} className="hover:bg-slate-50/40">
                                  <td className="py-3 px-5 font-bold text-gray-900">{student.name}</td>
                                  <td className="py-3 px-5 text-gray-500 font-semibold">{className}</td>
                                  <td className="py-3 px-5 font-black">
                                    {resolved ? (
                                      <span className="text-violet-700 bg-violet-50 px-2.5 py-1 rounded-full border border-violet-100 uppercase tracking-wider text-[10px]">
                                        {level}
                                      </span>
                                    ) : (
                                      <span className="text-rose-600 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-100 uppercase tracking-wider text-[10px]">
                                        Belum Ada Level
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3 px-5 font-bold">
                                    {resolved ? (
                                      levelTasks[level]?.title?.trim() && levelTasks[level]?.instructions?.trim() ? (
                                        <span className="text-[#109E58] flex items-center gap-1.5">
                                          <CheckCircle2 size={14} /> Ready
                                        </span>
                                      ) : (
                                        <span className="text-amber-600 flex items-center gap-1.5">
                                          <AlertCircle size={14} /> No Level Task
                                        </span>
                                      )
                                    ) : (
                                      <span className="text-rose-500 flex items-center gap-1.5">
                                        <X size={14} /> Skipped
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {editingBatchStatus === 'PUBLISHED' && editingBatchHasActivity && (
                <div className="space-y-1.5 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                  <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
                    Catatan Perubahan (Wajib)
                  </label>
                  <p className="text-[11px] text-amber-800 font-medium mb-2">
                    Siswa akan melihat catatan ini untuk mengetahui apa saja bagian tugas yang telah Anda perbarui.
                  </p>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Mengubah instruksi tugas langkah ke-3 dan memperpanjang batas waktu pengumpulan."
                    value={changeNote}
                    onChange={(e) => setChangeNote(e.target.value)}
                    className="w-full bg-white border border-amber-300 text-xs px-4 py-3 rounded-xl focus:outline-none font-bold placeholder-amber-900/40 text-amber-950"
                  />
                </div>
              )}

              {/* Actions for creating/editing */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                {editingBatchId && (
                  <button
                    type="button"
                    onClick={resetNewBatchForm}
                    className="px-5 py-3 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-black uppercase tracking-wider rounded-xl transition-all"
                  >
                    Batal Edit
                  </button>
                )}
                {editingBatchStatus === 'PUBLISHED' ? (
                  <button
                    type="button"
                    onClick={handleSavePublishedChanges}
                    disabled={loadingData || !newSubject || newTargetClassIds.length === 0}
                    className="px-5 py-3 bg-[#109E58] hover:bg-[#0d854a] text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
                  >
                    {loadingData ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                    Simpan Perubahan
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => handleSaveNewBatchDraft()}
                      disabled={loadingData || !newSubject || newTargetClassIds.length === 0}
                      className="px-5 py-3 border border-[#109E58] text-[#109E58] hover:bg-[#109E58]/5 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                      {loadingData ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                      Simpan Draft
                    </button>
                    <button
                      type="button"
                      onClick={handlePublishPreflight}
                      disabled={loadingData || !newSubject || newTargetClassIds.length === 0}
                      className="px-5 py-3 bg-[#109E58] hover:bg-[#0d854a] text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
                    >
                      <Send size={16} />
                      Terbitkan Tugas
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* List of Created Task Batches */}
            <div className="space-y-4">
              <div className="border-b border-slate-100 pb-2">
                <h3 className="text-md font-black text-gray-900">Daftar Tugas LPU</h3>
                <p className="text-xs font-semibold text-gray-400">Daftar tugas berorientasi level kemampuan siswa.</p>
              </div>

              {taskBatches.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {taskBatches.map(batch => (
                    <div key={batch.id} className="bg-white border border-slate-100 rounded-[2rem] p-6 shadow-sm flex flex-col justify-between space-y-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className={cn(
                            "text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider border",
                            batch.status === 'PUBLISHED'
                              ? "text-[#109E58] bg-[#109E58]/10 border-[#109E58]/20"
                              : batch.status === 'CANCELLED'
                              ? "text-rose-700 bg-rose-50 border-rose-200"
                              : batch.status === 'ARCHIVED'
                              ? "text-slate-500 bg-slate-50 border-slate-200"
                              : "text-amber-700 bg-amber-50 border-amber-200"
                          )}>
                            {batch.status === 'PUBLISHED' ? 'Terbit (Published)' : batch.status === 'CANCELLED' ? 'Dibatalkan' : batch.status === 'ARCHIVED' ? 'Arsip' : 'Draft'}
                          </span>
                          
                          <div className="flex gap-1 items-center">
                            {(batch.status === 'DRAFT' || batch.status === 'PUBLISHED') && canEditBatch(batch) && (
                              <button
                                onClick={() => handleEditBatch(batch)}
                                className="p-1.5 hover:bg-slate-50 text-gray-500 hover:text-[#109E58] rounded-lg transition-all"
                                title={batch.status === 'PUBLISHED' ? "Edit Tugas Terbit" : "Edit Draft"}
                              >
                                <Edit size={16} />
                              </button>
                            )}
                            {batch.status === 'DRAFT' && canEditBatch(batch) && (
                              <button
                                onClick={() => handleDeleteBatchClick(batch)}
                                className="p-1.5 hover:bg-rose-50 text-gray-500 hover:text-rose-600 rounded-lg transition-all"
                                title="Hapus Draft"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                            {batch.status === 'PUBLISHED' && canEditBatch(batch) && (
                              <button
                                onClick={() => handleCancelBatchClick(batch)}
                                className="px-2.5 py-1 text-[10px] font-black text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-all"
                                title="Batalkan Tugas Ini"
                              >
                                Batalkan Tugas
                              </button>
                            )}
                            {batch.status !== 'DRAFT' && canDeleteBatch(batch) && (
                              <button
                                onClick={() => handleDeleteBatchClick(batch)}
                                className="px-2.5 py-1 text-[10px] font-black text-rose-700 bg-rose-100 hover:bg-rose-200 border border-rose-200 rounded-lg transition-all flex items-center gap-1"
                                title="Hapus Tugas Permanen"
                              >
                                <Trash2 size={12} /> Hapus Tugas
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <h4 className="text-md font-black text-gray-900 tracking-tight leading-snug">
                            {CATEGORY_CONFIG[batch.subjectKey]?.label || batch.subjectKey}
                          </h4>
                          <p className="text-[10px] text-gray-500 font-bold uppercase">
                            {batch.targetClassIds.map(cid => classes.find(c => c.id === cid)?.name || cid).join(', ')}
                          </p>
                          <p className="text-[10px] text-gray-400 font-bold uppercase">
                            {batch.weekLabel}
                          </p>
                        </div>

                        {/* Configured levels with tasks */}
                        <div className="pt-2 border-t border-slate-100 space-y-1.5">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Tugas per Level:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {Object.keys(batch.levelTasks).map(lvl => (
                              <span key={lvl} className="text-[9px] font-bold text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full border border-violet-100 uppercase" title={batch.levelTasks[lvl].title}>
                                {lvl}
                              </span>
                            ))}
                          </div>
                        </div>

                        {batch.status === 'CANCELLED' && (
                          <div className="pt-2.5 border-t border-rose-100 bg-rose-50/40 p-3 rounded-2xl space-y-1">
                            <span className="text-[10px] font-black text-rose-700 uppercase tracking-wider block">Detail Pembatalan:</span>
                            <p className="text-xs text-rose-900 font-bold">
                              Alasan: <span className="text-rose-700 font-semibold">{(batch as any).cancellationReason || '-'}</span>
                            </p>
                            {(batch as any).cancellationNote && (
                              <p className="text-[11px] text-rose-800 italic bg-white/60 p-1.5 rounded-lg border border-rose-100/40">
                                "{(batch as any).cancellationNote}"
                              </p>
                            )}
                            <p className="text-[9px] text-gray-400 font-bold uppercase mt-1">
                              Oleh: {(batch as any).cancelledBy || '-'} • {formatLpuDateTime((batch as any).cancelledAt)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-100 rounded-[2rem] p-12 text-center max-w-xl mx-auto space-y-4">
                  <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 mx-auto">
                    <FileText size={32} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-black text-gray-900">Belum Ada Tugas LPU Baru</h3>
                    <p className="text-sm text-gray-500 font-semibold leading-relaxed">
                      Gunakan form di atas untuk membuat draf atau menerbitkan tugas per level LPU yang baru.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Legacy Packages (Tugas Lama) */}
            {packages.length > 0 && (
              <div className="space-y-4 border-t border-slate-100 pt-8">
                <div className="pb-2">
                  <h3 className="text-md font-black text-slate-400 uppercase tracking-wider">Daftar Paket Tugas Kelas (Legacy / Lama)</h3>
                  <p className="text-xs font-semibold text-slate-400">Paket tugas lama sebelum transisi LPU multi-class berorientasi level.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {packages.map(pkg => (
                    <div key={pkg.id} className="bg-white border border-slate-100 rounded-[2rem] p-6 shadow-sm flex flex-col justify-between space-y-4 opacity-75 hover:opacity-100 transition-all">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black text-gray-500 bg-gray-100 border border-gray-200 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                            SMP JUNIOR HIGH (LEGACY)
                          </span>
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleEditPackage(pkg)}
                              className="p-1.5 hover:bg-slate-50 text-gray-500 hover:text-[#109E58] rounded-lg transition-all"
                              title="Edit Tugas Lama"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              onClick={() => handleDeletePackage(pkg.id)}
                              className="p-1.5 hover:bg-rose-50 text-gray-500 hover:text-rose-600 rounded-lg transition-all"
                              title="Hapus Tugas Lama"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <h4 className="text-md font-black text-gray-900 tracking-tight leading-snug">
                            {formatDateRange(pkg.weekStartDate, pkg.weekEndDate)}
                          </h4>
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                            Mulai: {formatDateFull(pkg.weekStartDate)}
                          </p>
                        </div>

                        <div className="space-y-2 pt-2 border-t border-slate-100">
                          {pkg.tasks.bahasaIndonesia && (
                            <div className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                              <BookOpen size={14} className="text-blue-500" />
                              <span>Bahasa Indonesia</span>
                            </div>
                          )}
                          {pkg.tasks.english && (
                            <div className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                              <Languages size={14} className="text-violet-500" />
                              <span>English</span>
                            </div>
                          )}
                          {pkg.tasks.mengaji && (
                            <div className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                              <BookMarked size={14} className="text-emerald-500" />
                              <span>Mengaji</span>
                            </div>
                          )}
                          {pkg.tasks.numerasi && (
                            <div className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                              <Calculator size={14} className="text-amber-500" />
                              <span>Numerasi</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}


      {/* VERIFICATION DIALOG MODAL */}
      <AnimatePresence>
        {verifyingProgress && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto" id="teacher-verification-overlay">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-[2.5rem] shadow-2xl max-w-4xl w-full overflow-hidden flex flex-col md:flex-row relative"
              id="teacher-verification-body"
            >
              {/* Close Button */}
              <button 
                onClick={() => setVerifyingProgress(null)}
                className="absolute top-6 right-6 p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-all z-10"
              >
                <X size={18} />
              </button>

              {/* Kiri - Submission info */}
              <div className="flex-1 p-8 md:p-10 border-r border-slate-100 space-y-6">
                <div>
                  <span className="px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[9px] font-black uppercase tracking-widest rounded-full inline-block mb-3">
                    VERIFIKASI GURU SMP
                  </span>
                  <h3 className="text-2xl font-black text-gray-900 tracking-tight leading-tight">
                    {verifyingProgress.student.name}
                  </h3>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">
                    Kelas: {classes.find(c => c.id === selectedClassId)?.name} • NIS: {verifyingProgress.student.nis || '-'}
                  </p>
                </div>

                {/* Task Details */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Kategori:</span>
                    <span className="text-xs font-black text-slate-700 bg-white border px-2 py-0.5 rounded-md">
                      {CATEGORY_CONFIG[verifyingProgress.field].label}
                    </span>
                  </div>
                  <h4 className="font-bold text-sm text-gray-900 leading-snug">
                    Tugas Penguatan {CATEGORY_CONFIG[verifyingProgress.field].label}
                  </h4>
                  <p className="text-xs font-medium text-gray-500 italic max-h-24 overflow-y-auto leading-relaxed border-t border-slate-200/50 pt-2 mt-1">
                    "{verifyingProgress.taskDescription}"
                  </p>
                </div>

                {/* Submission Status badge info */}
                <div className="space-y-3">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Status Pengajuan</span>
                  <div className="flex flex-wrap gap-2">
                    {verifyingProgress.progress ? (
                      verifyingProgress.progress.status === 'VERIFIED' ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 size={14} className="text-emerald-500" />
                          Selesai
                        </span>
                      ) : verifyingProgress.progress.status === 'SUBMITTED' ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <Clock size={14} className="text-amber-500 animate-pulse" />
                          Menunggu Verifikasi Guru
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          <AlertTriangle size={14} className="text-rose-500" />
                          Belum Tuntas
                        </span>
                      )
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-slate-50 text-slate-500 border border-slate-200">
                        <CheckSquare size={14} className="text-slate-400" />
                        Belum Dikerjakan
                      </span>
                    )}
                  </div>
                </div>

                {/* Action buttons panel */}
                <div className="pt-4 border-t border-slate-100 space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                      Catatan Guru / Feedback Revisi (Wajib jika Belum Tuntas)
                    </label>
                    <textarea
                      rows={3}
                      value={verificationNote}
                      onChange={(e) => setVerificationNote(e.target.value)}
                      placeholder="Tuliskan catatan perbaikan atau feedback untuk siswa..."
                      className="w-full bg-slate-50 border border-slate-200 text-xs px-4 py-3 rounded-xl focus:outline-none font-medium leading-relaxed focus:ring-2 focus:ring-[#109E58]/20 focus:border-[#109E58]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <button
                      type="button"
                      disabled={isSavingVerification}
                      onClick={() => handleVerificationSave(false)}
                      className="py-3 bg-rose-50 hover:bg-rose-100 disabled:bg-rose-50/50 text-rose-700 border border-rose-200 font-black text-xs uppercase tracking-widest rounded-xl transition-all"
                    >
                      Belum Tuntas
                    </button>
                    <button
                      type="button"
                      disabled={isSavingVerification}
                      onClick={() => handleVerificationSave(true)}
                      className="py-3 bg-[#109E58] hover:bg-[#0d854a] disabled:bg-[#109E58]/50 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5"
                    >
                      <Check size={16} strokeWidth={3} />
                      Selesai
                    </button>
                  </div>
                </div>
              </div>

              {/* Kanan - Submission timeline log history */}
              <div className="flex-1 p-8 md:p-10 bg-slate-50 space-y-6">
                <div>
                  <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Riwayat Pengajuan</h4>
                  <h3 className="text-lg font-black text-gray-900">Linimasa & Log Kerja</h3>
                  <p className="text-xs font-semibold text-gray-400">Semua aktivitas kiriman, revisi, dan status.</p>
                </div>

                <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
                  {verifyingProgress.progress?.history && verifyingProgress.progress.history.length > 0 ? (
                    verifyingProgress.progress.history.map((h, idx) => (
                      <div key={idx} className="flex gap-3 text-xs">
                        <div className="flex flex-col items-center">
                          <div className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-white font-black text-[10px]",
                            h.action === 'VERIFY' ? "bg-emerald-500" :
                            h.action === 'REVISION_REQUEST' ? "bg-rose-500" : "bg-blue-500"
                          )}>
                            {idx + 1}
                          </div>
                          {idx < verifyingProgress.progress!.history!.length - 1 && (
                            <div className="w-0.5 bg-slate-200 flex-1 min-h-[20px]" />
                          )}
                        </div>

                        <div className="bg-white p-3 rounded-xl border border-slate-100 flex-1 space-y-1">
                          <div className="flex items-center justify-between text-[10px] font-semibold text-gray-400">
                            <span>{formatLpuDateTime(h.timestamp)}</span>
                            <span className="font-bold text-gray-500">{h.actorName}</span>
                          </div>
                          <p className="font-bold text-gray-800 text-xs">
                            {h.action === 'SUBMIT' && "Mengirim tugas untuk diperiksa."}
                            {h.action === 'RESUBMIT' && "Mengirim ulang tugas setelah revisi."}
                            {h.action === 'REVISION_REQUEST' && "Guru meminta revisi tugas."}
                            {h.action === 'VERIFY' && "Guru memverifikasi tugas selesai."}
                          </p>
                          {h.note && (
                            <p className="text-[11px] text-gray-500 italic leading-normal bg-slate-50 px-2 py-1.5 rounded border border-slate-100 mt-1">
                              "{h.note}"
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-10 text-xs text-gray-400 font-semibold bg-white rounded-xl border border-slate-200/50">
                      Belum ada aktivitas tercatat untuk tugas ini.
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PUBLISH PREFLIGHT CONFIRMATION DIALOG MODAL */}
      <AnimatePresence>
        {publishPreflight && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto" id="publish-preflight-overlay">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[2rem] shadow-2xl max-w-lg w-full p-8 space-y-6 relative border border-slate-100 flex flex-col max-h-[90vh] overflow-hidden"
              id="publish-preflight-body"
            >
              <button 
                onClick={() => setPublishPreflight(null)}
                className="absolute top-6 right-6 p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-all z-10"
              >
                <X size={16} />
              </button>

              <div className="space-y-2 shrink-0">
                <span className="px-3 py-1 bg-amber-50 text-amber-700 text-[9px] font-black uppercase tracking-widest rounded-full border border-amber-200 inline-block">
                  Preflight Penerbitan Tugas
                </span>
                <h3 className="text-xl font-black text-gray-900 tracking-tight">
                  Konfirmasi Penerbitan LPU
                </h3>
                <p className="text-xs text-gray-400 font-semibold leading-relaxed">
                  Harap verifikasi parameter target dan sebaran level sebelum menerbitkan tugas.
                </p>
              </div>

              {/* Preflight Scrollable Details */}
              <div className="flex-1 overflow-y-auto space-y-5 pr-1 py-1">
                {/* General Scope */}
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-2.5 text-xs font-semibold text-gray-600">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-200/50">
                    <span className="text-gray-400 font-bold uppercase tracking-wider text-[9px]">Mata Pelajaran</span>
                    <span className="text-gray-900 font-black uppercase">{CATEGORY_CONFIG[publishPreflight.batch.subjectKey!]?.label || publishPreflight.batch.subjectKey}</span>
                  </div>
                  <div className="flex justify-between items-start pb-2 border-b border-slate-200/50">
                    <span className="text-gray-400 font-bold uppercase tracking-wider text-[9px]">Target Kelas</span>
                    <span className="text-gray-900 font-black text-right max-w-[60%]">{publishPreflight.classesNames.join(', ')}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 font-bold uppercase tracking-wider text-[9px]">Periode Pekan</span>
                    <span className="text-gray-900 font-black">{publishPreflight.batch.weekLabel}</span>
                  </div>
                </div>

                {/* Recipients per level */}
                <div className="space-y-2">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Sebaran Penerima per Level:</span>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(publishPreflight.recipientsCountByLevel).map(([lvl, count]) => (
                      <div key={lvl} className="p-3 bg-slate-50 border border-slate-150 rounded-xl flex items-center justify-between">
                        <span className="text-[10px] font-black text-violet-700 bg-violet-50 border border-violet-100 px-2 py-0.5 rounded-full uppercase">{lvl}</span>
                        <span className="text-xs font-black text-gray-900">{count} Siswa</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Students without level warning */}
                {publishPreflight.studentsWithoutLevel.length > 0 && (
                  <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl space-y-2 text-xs">
                    <span className="font-black text-rose-700 flex items-center gap-1.5 uppercase text-[10px] tracking-wider">
                      <AlertTriangle size={14} /> Siswa Tanpa Level ({publishPreflight.studentsWithoutLevel.length})
                    </span>
                    <p className="text-[11px] text-rose-600 font-semibold leading-relaxed">
                      Siswa berikut tidak terdaftar level kemampuannya dalam database, sehingga TIDAK akan menerima tugas individu ini:
                    </p>
                    <div className="max-h-24 overflow-y-auto bg-white/60 rounded-xl p-2.5 text-[11px] text-rose-700 font-bold space-y-1 divide-y divide-rose-100/50">
                      {publishPreflight.studentsWithoutLevel.map(({ student, className }, idx) => (
                        <div key={idx} className="pt-1 first:pt-0">
                          {student.name} ({className})
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Students skipped due to no level task warning */}
                {publishPreflight.studentsSkippedNoTask.length > 0 && (
                  <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl space-y-2 text-xs">
                    <span className="font-black text-amber-700 flex items-center gap-1.5 uppercase text-[10px] tracking-wider">
                      <AlertCircle size={14} /> Siswa Dilewati Karena Tugas Level Kosong ({publishPreflight.studentsSkippedNoTask.length})
                    </span>
                    <p className="text-[11px] text-amber-600 font-semibold leading-relaxed">
                      Siswa berikut memiliki level kemampuan, tetapi tugas untuk level mereka belum diisi/dikosongkan, sehingga mereka TIDAK akan menerima tugas:
                    </p>
                    <div className="max-h-24 overflow-y-auto bg-white/60 rounded-xl p-2.5 text-[11px] text-amber-700 font-bold space-y-1 divide-y divide-amber-100/50">
                      {publishPreflight.studentsSkippedNoTask.map(({ student, className, level }, idx) => (
                        <div key={idx} className="pt-1 first:pt-0">
                          {student.name} ({className}) - Level: {level}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Static warning notice */}
                <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-xl text-[10px] text-blue-600 font-semibold leading-relaxed flex gap-2">
                  <Info size={14} className="shrink-0 text-blue-500 mt-0.5" />
                  <span>
                    <strong>Penting:</strong> Setelah diterbitkan, tugas bersifat <strong>tetap (fixed)</strong> untuk masing-masing siswa dan tidak akan berubah secara dinamis meskipun level siswa diubah di kemudian hari.
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3 pt-2 shrink-0">
                <button
                  type="button"
                  disabled={isPublishing}
                  onClick={() => setPublishPreflight(null)}
                  className="py-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-black text-xs uppercase tracking-widest rounded-xl transition-all"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isPublishing}
                  onClick={executePublishBatch}
                  className="py-3 bg-[#109E58] hover:bg-[#0d854a] text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5"
                >
                  {isPublishing ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <>
                      <Check size={16} strokeWidth={3} />
                      Konfirmasi & Terbitkan
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* BULK VERIFICATION CONFIRMATION MODAL */}
      <AnimatePresence>
        {bulkConfirm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50" id="bulk-verify-confirm-overlay">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[2rem] shadow-2xl max-w-md w-full p-8 space-y-6 relative border border-slate-100"
              id="bulk-verify-confirm-body"
            >
              <button 
                onClick={() => setBulkConfirm(null)}
                className="absolute top-6 right-6 p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-all z-10"
              >
                <X size={16} />
              </button>

              <div className="space-y-2">
                <span className="px-3 py-1 bg-[#109E58]/10 text-[#109E58] text-[9px] font-black uppercase tracking-widest rounded-full border border-[#109E58]/20 inline-block">
                  Konfirmasi Verifikasi Massal
                </span>
                <h3 className="text-xl font-black text-gray-900 tracking-tight">
                  Selesaikan Semua Tugas?
                </h3>
                <p className="text-xs text-gray-400 font-semibold leading-relaxed">
                  Tindakan ini akan menandai seluruh siswa aktif di kelas ini sebagai <strong className="text-emerald-600 uppercase">Selesai (Verified)</strong> untuk bidang studi terpilih.
                </p>
              </div>

              {/* Details list */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-3.5 text-xs font-semibold text-gray-600">
                <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                  <span className="text-gray-400 font-bold uppercase tracking-wider text-[9px]">Bidang Studi</span>
                  <span className="text-gray-900 font-black">{CATEGORY_CONFIG[bulkConfirm.field].label}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                  <span className="text-gray-400 font-bold uppercase tracking-wider text-[9px]">Kelas</span>
                  <span className="text-gray-900 font-black">{classes.find(c => c.id === selectedClassId)?.name}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                  <span className="text-gray-400 font-bold uppercase tracking-wider text-[9px]">Rentang Tanggal</span>
                  <span className="text-gray-900 font-black">
                    {activePackage ? formatDateRange(activePackage.weekStartDate, activePackage.weekEndDate) : '-'}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                  <span className="text-gray-400 font-bold uppercase tracking-wider text-[9px]">Jumlah Siswa</span>
                  <span className="text-gray-900 font-black">{bulkConfirm.studentCount} Siswa</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 font-bold uppercase tracking-wider text-[9px]">Diverifikasi Oleh</span>
                  <span className="text-gray-900 font-black">{currentUser.displayName || currentUser.email}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setBulkConfirm(null)}
                  className="py-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-black text-xs uppercase tracking-widest rounded-xl transition-all"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleBulkVerifySubmit}
                  className="py-3 bg-[#109E58] hover:bg-[#0d854a] text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5"
                >
                  <Check size={16} strokeWidth={3} />
                  Ya, Selesai Semua
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* INDIVIDUAL UNVERIFICATION CONFIRMATION DIALOG MODAL */}
      <AnimatePresence>
        {unverifyingProgress && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50" id="individual-unverify-confirm-overlay">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[2rem] shadow-2xl max-w-md w-full p-8 space-y-6 relative border border-slate-100"
              id="individual-unverify-confirm-body"
            >
              <button 
                onClick={() => setUnverifyingProgress(null)}
                className="absolute top-6 right-6 p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-all z-10"
              >
                <X size={16} />
              </button>

              <div className="space-y-2">
                <span className="px-3 py-1 bg-rose-50 text-rose-700 text-[9px] font-black uppercase tracking-widest rounded-full border border-rose-200 inline-block">
                  Batalkan Verifikasi Tugas
                </span>
                <h3 className="text-xl font-black text-gray-900 tracking-tight leading-snug">
                  Batalkan verifikasi tugas {CATEGORY_CONFIG[unverifyingProgress.field].label} untuk {unverifyingProgress.student.name}?
                </h3>
                <p className="text-xs text-gray-400 font-semibold leading-relaxed">
                  Status tugas akan kembali menjadi <span className="text-rose-600 font-bold uppercase">Belum Selesai (Not Started)</span>. Reminder tugas akan kembali aktif di akun siswa.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setUnverifyingProgress(null)}
                  className="py-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-black text-xs uppercase tracking-widest rounded-xl transition-all"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleUnverifySubmit}
                  className="py-3 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5"
                >
                  Ya, Batalkan Verifikasi
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* BULK UNVERIFICATION CONFIRMATION DIALOG MODAL */}
      <AnimatePresence>
        {bulkUnverifyConfirm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50" id="bulk-unverify-confirm-overlay">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[2rem] shadow-2xl max-w-md w-full p-8 space-y-6 relative border border-slate-100"
              id="bulk-unverify-confirm-body"
            >
              <button 
                onClick={() => setBulkUnverifyConfirm(null)}
                className="absolute top-6 right-6 p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-all z-10"
              >
                <X size={16} />
              </button>

              <div className="space-y-2">
                <span className="px-3 py-1 bg-rose-50 text-rose-700 text-[9px] font-black uppercase tracking-widest rounded-full border border-rose-200 inline-block">
                  Konfirmasi Pembatalan Massal
                </span>
                <h3 className="text-xl font-black text-gray-900 tracking-tight leading-snug">
                  Batalkan Semua Verifikasi?
                </h3>
                <p className="text-xs text-gray-400 font-semibold leading-relaxed">
                  Tindakan ini akan mengembalikan tugas seluruh siswa aktif di kelas ini pada bidang <strong className="text-rose-600 font-bold uppercase">{CATEGORY_CONFIG[bulkUnverifyConfirm.field].label}</strong> menjadi <strong className="text-gray-600 font-bold uppercase">Belum Selesai (Not Started)</strong>.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setBulkUnverifyConfirm(null)}
                  className="py-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-black text-xs uppercase tracking-widest rounded-xl transition-all"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleBulkUnverifySubmit}
                  className="py-3 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5"
                >
                  Ya, Batalkan Semua
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* TASK BATCH DELETION DIALOG MODAL */}
      <AnimatePresence>
        {deletingBatch && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50" id="task-deletion-overlay">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[2rem] shadow-2xl max-w-lg w-full p-8 space-y-6 relative border border-slate-100"
              id="task-deletion-body"
            >
              <button 
                onClick={() => { setDeletingBatch(null); setDeletingBatchStats(null); }}
                className="absolute top-6 right-6 p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-all z-10"
              >
                <X size={16} />
              </button>

              <div className="space-y-2">
                <span className="px-3 py-1 bg-rose-50 text-rose-700 text-[9px] font-black uppercase tracking-widest rounded-full border border-rose-200 inline-block">
                  Hapus Penugasan Level-Based LPU
                </span>
                <h3 className="text-xl font-black text-gray-900 tracking-tight leading-snug">
                  Hapus tugas ini untuk semua siswa?
                </h3>
              </div>

              {/* Statistics & Metadata */}
              {deletingBatchStats && (
                <div className="space-y-4">
                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl space-y-2 text-xs font-semibold text-slate-700">
                    <div>
                      Subject: <strong className="font-bold text-gray-950">{CATEGORY_CONFIG[deletingBatch.subjectKey]?.label || deletingBatch.subjectKey}</strong>
                    </div>
                    <div>
                      Kelas: <strong className="font-bold text-gray-950">
                        {deletingBatch.targetClassIds.map(cid => classes.find(c => c.id === cid)?.name || cid).join(', ')}
                      </strong>
                    </div>
                    <div>
                      Periode: <strong className="font-bold text-gray-950">{deletingBatch.weekLabel}</strong>
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-2.5">
                    <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">Statistik Tugas Saat Ini:</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-white p-2.5 rounded-xl border border-slate-100 text-center">
                        <p className="text-[10px] text-gray-400 font-bold uppercase">Total Tugas</p>
                        <p className="text-lg font-black text-slate-800">{deletingBatchStats.totalAssignments}</p>
                      </div>
                      <div className="bg-white p-2.5 rounded-xl border border-slate-100 text-center">
                        <p className="text-[10px] text-gray-400 font-bold uppercase">Belum Mulai</p>
                        <p className="text-lg font-black text-slate-500">{deletingBatchStats.notStarted}</p>
                      </div>
                      <div className="bg-white p-2.5 rounded-xl border border-slate-100 text-center text-amber-600">
                        <p className="text-[10px] text-gray-400 font-bold uppercase">Submitted</p>
                        <p className="text-lg font-black">{deletingBatchStats.submitted}</p>
                      </div>
                      <div className="bg-white p-2.5 rounded-xl border border-slate-100 text-center text-emerald-600">
                        <p className="text-[10px] text-gray-400 font-bold uppercase">Selesai</p>
                        <p className="text-lg font-black">{deletingBatchStats.verified}</p>
                      </div>
                    </div>

                    {/* Strong Warning if submitted/verified > 0 */}
                    {(deletingBatchStats.submitted > 0 || deletingBatchStats.verified > 0) ? (
                      <div className="p-3.5 bg-rose-50 text-rose-800 rounded-xl border border-rose-200 flex flex-col gap-3 text-xs font-semibold leading-normal">
                        <div className="flex gap-2 items-start">
                          <AlertTriangle size={18} className="text-rose-600 shrink-0 mt-0.5 animate-pulse" />
                          <div>
                            <p className="font-black text-rose-950 uppercase tracking-wide text-[10px] mb-0.5">Peringatan Keras!</p>
                            <p>
                              Tugas ini memiliki <strong className="font-bold text-rose-950">{deletingBatchStats.submitted} tugas diserahkan</strong> dan/atau <strong className="font-bold text-rose-950">{deletingBatchStats.verified} tugas selesai/diverifikasi</strong>. Menghapus tugas ini akan menghapus riwayat pekerjaan dan nilai siswa secara permanen dan tidak dapat dibatalkan!
                            </p>
                          </div>
                        </div>
                        
                        <label className="flex items-start gap-2 p-2.5 bg-white rounded-xl border border-rose-200 hover:bg-rose-50/50 cursor-pointer select-none transition-all">
                          <input 
                            type="checkbox"
                            checked={deleteSecondConfirmChecked}
                            onChange={(e) => setDeleteSecondConfirmChecked(e.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded border-rose-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                          />
                          <span className="text-[11px] text-rose-900 font-black">
                            Saya memahami bahwa riwayat tugas siswa akan dihapus.
                          </span>
                        </label>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => { setDeletingBatch(null); setDeletingBatchStats(null); }}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs uppercase tracking-widest rounded-xl transition-all border border-slate-200 disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isDeleting || ((deletingBatchStats && (deletingBatchStats.submitted > 0 || deletingBatchStats.verified > 0)) && !deleteSecondConfirmChecked)}
                  onClick={handleDeleteBatchSubmit}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isDeleting ? "Menghapus..." : "Hapus Tugas Permanen"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* TASK BATCH CANCELLATION DIALOG MODAL */}
      <AnimatePresence>
        {cancellingBatch && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50" id="task-cancellation-overlay">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[2rem] shadow-2xl max-w-lg w-full p-8 space-y-6 relative border border-slate-100"
              id="task-cancellation-body"
            >
              <button 
                onClick={() => { setCancellingBatch(null); setCancellingBatchStats(null); }}
                className="absolute top-6 right-6 p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-all z-10"
              >
                <X size={16} />
              </button>

              <div className="space-y-2">
                <span className="px-3 py-1 bg-rose-50 text-rose-700 text-[9px] font-black uppercase tracking-widest rounded-full border border-rose-200 inline-block">
                  Batalkan Penugasan Level-Based LPU
                </span>
                <h3 className="text-xl font-black text-gray-900 tracking-tight leading-snug">
                  Batalkan Tugas {CATEGORY_CONFIG[cancellingBatch.subjectKey]?.label || cancellingBatch.subjectKey}?
                </h3>
                <p className="text-xs text-gray-500 font-semibold leading-relaxed">
                  Periode: {cancellingBatch.weekLabel}
                </p>
              </div>

              {/* Preflight Statistics */}
              {cancellingBatchStats && (
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-2.5">
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">Statistik Distribusi Tugas Saat Ini:</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-white p-2.5 rounded-xl border border-slate-100 text-center">
                      <p className="text-[10px] text-gray-400 font-bold uppercase">Total Tugas</p>
                      <p className="text-lg font-black text-slate-800">{cancellingBatchStats.totalAssignments}</p>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-slate-100 text-center">
                      <p className="text-[10px] text-gray-400 font-bold uppercase">Belum Mulai</p>
                      <p className="text-lg font-black text-slate-500">{cancellingBatchStats.notStarted}</p>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-slate-100 text-center text-amber-600">
                      <p className="text-[10px] text-gray-400 font-bold uppercase">Submisi/Pending</p>
                      <p className="text-lg font-black">{cancellingBatchStats.submitted}</p>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-slate-100 text-center text-emerald-600">
                      <p className="text-[10px] text-gray-400 font-bold uppercase">Diverifikasi</p>
                      <p className="text-lg font-black">{cancellingBatchStats.verified}</p>
                    </div>
                  </div>
                  {cancellingBatchStats.verified > 0 && (
                    <div className="p-2.5 bg-amber-50 text-amber-800 rounded-xl border border-amber-200/50 flex gap-2 items-start text-xs font-semibold leading-normal">
                      <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                      <p>
                        Perhatian: Sebanyak <strong className="font-bold text-rose-700">{cancellingBatchStats.verified} siswa</strong> telah menyelesaikan dan diverifikasi untuk tugas ini. Membatalkan tugas akan membatalkan seluruh status penugasan tersebut secara aman (data riwayat tidak akan dihapus).
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Form Input */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-gray-700 uppercase tracking-wider block">Alasan Pembatalan <span className="text-rose-500">*</span></label>
                  <select
                    value={cancellationReason}
                    onChange={(e: any) => setCancellationReason(e.target.value)}
                    className="w-full bg-white border border-slate-200 text-xs font-semibold rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                  >
                    <option value="">-- Pilih Alasan --</option>
                    <option value="Salah kelas">Salah kelas target</option>
                    <option value="Salah periode">Salah periode / pekan</option>
                    <option value="Konten perlu diperbaiki">Konten tugas perlu direvisi / diperbaiki</option>
                    <option value="Duplikat">Penugasan ganda / duplikat</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black text-gray-700 uppercase tracking-wider block">Catatan Tambahan (Siswa dapat melihat catatan ini)</label>
                  <textarea
                    value={cancellationNote}
                    onChange={(e) => setCancellationNote(e.target.value)}
                    placeholder="Berikan keterangan detail mengapa tugas ini dibatalkan agar siswa mengerti..."
                    rows={3}
                    className="w-full bg-slate-50 border border-slate-200 text-xs font-semibold rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setCancellingBatch(null); setCancellingBatchStats(null); }}
                  className="py-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-black text-xs uppercase tracking-widest rounded-xl transition-all"
                  disabled={isCancelling}
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleCancelBatchSubmit}
                  disabled={isCancelling || !cancellationReason}
                  className="py-3 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-100 disabled:border-slate-200 disabled:text-slate-400 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5"
                >
                  {isCancelling ? (
                    <>
                      <Loader2 size={16} className="animate-spin animate-spin-slow" />
                      Membatalkan...
                    </>
                  ) : (
                    "Ya, Batalkan Tugas"
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
