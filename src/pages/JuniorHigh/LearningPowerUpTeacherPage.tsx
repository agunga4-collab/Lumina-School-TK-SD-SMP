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
  getActiveStudents 
} from '../../lib/firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  serverTimestamp, 
  writeBatch 
} from 'firebase/firestore';
import { toast } from 'sonner';
import { isTeacherAssignedToClass } from '../../services/classTeacherAssignmentService';

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
  if (!timestamp) return '';
  let d: Date;
  if (timestamp.toDate && typeof timestamp.toDate === 'function') {
    d = timestamp.toDate();
  } else {
    d = new Date(timestamp);
  }
  if (isNaN(d.getTime())) return '';
  const idMonths = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const day = d.getDate();
  const month = idMonths[d.getMonth()];
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year}, ${hours}.${minutes}`;
};

const canTeacherVerifySubject = (
  user: AppUser, 
  classData: any, 
  subjectField: 'bahasaIndonesia' | 'english' | 'mengaji' | 'numerasi'
): boolean => {
  if (!user || !classData) return false;
  
  const role = user.role;
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

export default function LearningPowerUpTeacherPage() {
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

  // Load Classes on mount
  React.useEffect(() => {
    const loadClassesList = async () => {
      setLoadingMetadata(true);
      try {
        const allClasses = await getClasses() || [];
        const jhClasses = allClasses.filter(
          c => c.unitId === 'JUNIOR_HIGH' && c.status !== 'archived' && c.academicYear === activeYear
        );

        // Filter based on roles
        const isHeadOrAdmin = ['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'COORDINATOR'].includes((currentUser?.role as string) || '');
        let filteredClasses = jhClasses;
        
        if (!isHeadOrAdmin) {
          filteredClasses = jhClasses.filter(c => isTeacherAssignedToClass(c, currentUser?.uid));
        }

        setClasses(filteredClasses);

        if (filteredClasses.length > 0) {
          setSelectedClassId(filteredClasses[0].id);
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
    setLoadingData(true);
    try {
      // 1. Load active student roster
      const roster = await getActiveStudents(selectedClassId, activeYear) || [];
      setStudents(roster);

      // 2. Load packages for this class & year
      const qPackages = query(
        collection(db, 'learning_power_up_tasks'),
        where('classId', '==', selectedClassId),
        where('academicYearId', '==', activeYear),
        where('unit', '==', 'JUNIOR_HIGH')
      );
      const packagesSnap = await getDocs(qPackages);
      const loadedPackages = packagesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as LearningPowerUpPackage[];

      // Sort by start date descending
      loadedPackages.sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate));
      setPackages(loadedPackages);

      if (loadedPackages.length > 0 && !selectedWeek) {
        setSelectedWeek(loadedPackages[0].id);
      } else if (loadedPackages.length > 0 && !loadedPackages.some(p => p.id === selectedWeek)) {
        setSelectedWeek(loadedPackages[0].id);
      }

      // 3. Load progress records for this class & year
      const qProgress = query(
        collection(db, 'learning_power_up_progress'),
        where('classId', '==', selectedClassId),
        where('academicYearId', '==', activeYear)
      );
      const progressSnap = await getDocs(qProgress);
      const loadedProgresses = progressSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as TaskProgress[];
      setProgresses(loadedProgresses);

    } catch (err) {
      console.error("Error loading class data for tracker:", err);
      toast.error("Gagal memuat data tracker kelas.");
    } finally {
      setLoadingData(false);
    }
  };

  React.useEffect(() => {
    if (selectedClassId && activeYear) {
      loadClassData();
    }
  }, [selectedClassId, activeYear]);

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
      toast.error("Catatan revisi wajib diisi jika Anda meminta perbaikan tugas!");
      return;
    }

    setIsSavingVerification(true);
    try {
      const progressId = progress?.id || `progress_${activePackage.id}_${student.id}_${field}`;
      const currentHistory = progress?.history || [];
      const nowStr = new Date().toLocaleString('id-ID', { hour12: false });

      const newHistoryItem: TaskProgressHistory = {
        timestamp: nowStr,
        action: isApproved ? 'VERIFY' : 'REVISION_REQUEST',
        actorName: currentUser.displayName || currentUser.email || "Guru/Coach",
        note: isApproved ? "Guru memverifikasi tugas selesai." : `Guru meminta revisi: "${verificationNote}"`
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
      toast.success(isApproved ? "Tugas berhasil diverifikasi selesai!" : "Revisi berhasil diajukan ke siswa.");
      
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
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="bg-white border border-slate-200 text-gray-700 font-bold text-sm px-4 py-2.5 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-[#109E58]/20 focus:border-[#109E58] min-w-[200px]"
              >
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
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
            <div className="flex flex-wrap items-center gap-4">
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
                  <span className="text-xs font-bold text-gray-400 italic">Belum ada tugas dibuat</span>
                )}
              </div>
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
                                NIS: {student.nis || "N/A"}
                              </span>
                            </div>
                          </td>

                          {activeFields.map(field => {
                            const progress = findProgress(student.id, selectedWeek, field);
                            const status = progress?.status || 'NOT_STARTED';

                            if (status === 'VERIFIED') {
                              verifiedInWeekCount++;
                            }

                            return (
                              <td 
                                key={field} 
                                className="py-4 px-6 text-center align-middle relative group"
                              >
                                <button
                                  onClick={() => handleCellClick(student, field)}
                                  className="inline-flex items-center justify-center p-1 rounded-xl transition-all hover:bg-slate-100 focus:outline-none"
                                >
                                  {status === 'VERIFIED' && (
                                    <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center border border-emerald-200">
                                      <Check size={18} strokeWidth={3} />
                                    </div>
                                  )}
                                  {status === 'SUBMITTED' && (
                                    <div className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1 text-[10px] font-black uppercase animate-pulse">
                                      <Clock size={12} className="text-amber-500" />
                                      Butuh Verifikasi
                                    </div>
                                  )}
                                  {status === 'REVISION_REQUIRED' && (
                                    <div className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1 text-[10px] font-black uppercase">
                                      <AlertTriangle size={12} className="text-rose-500" />
                                      Revisi
                                    </div>
                                  )}
                                  {status === 'NOT_STARTED' && (
                                    <div className="w-8 h-8 rounded-lg border border-slate-200/60 bg-slate-50 flex items-center justify-center text-slate-300 hover:border-slate-400 transition-all">
                                      <div className="w-4 h-4 rounded-sm border border-slate-200" />
                                    </div>
                                  )}
                                </button>

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
      {activeTab === 'MANAGE_TASKS' && (
        <div className="space-y-8">
          
          {/* Main Form: Atur Tugas */}
          <form onSubmit={handleSavePackage} className="bg-white rounded-[2rem] border border-slate-100 p-8 shadow-sm space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-xl font-bold text-gray-900">Atur Tugas</h2>
              <p className="text-xs font-semibold text-gray-400">Atur paket tugas untuk seluruh bidang studi aktif sekaligus berdasarkan rentang tanggal.</p>
            </div>

            {/* Date Pickers */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Tanggal Mulai</label>
                <input
                  type="date"
                  required
                  value={weekStartDate}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-sm px-4 py-3 rounded-xl focus:outline-none font-bold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Tanggal Selesai</label>
                <input
                  type="date"
                  required
                  value={weekEndDate}
                  onChange={(e) => setWeekEndDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-sm px-4 py-3 rounded-xl focus:outline-none font-bold"
                />
              </div>
            </div>

            {/* Copy Feature */}
            {packages.length > 0 && (
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="text-xs font-black text-gray-700 flex items-center gap-1.5">
                    <Copy size={14} className="text-[#109E58]" />
                    Salin Tugas dari Periode Sebelumnya
                  </h4>
                  <p className="text-[10px] text-gray-400 font-bold leading-none">Menyalin teks instruksi tugas per bidang. Tidak menyalin progres siswa.</p>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  <select
                    value={copiedFromWeekId}
                    onChange={(e) => setCopiedFromWeekId(e.target.value)}
                    className="bg-white border border-slate-200 text-xs px-3 py-2 rounded-lg font-semibold flex-1 sm:flex-initial"
                  >
                    <option value="">-- Pilih Periode --</option>
                    {packages.map(p => (
                      <option key={p.id} value={p.id}>{formatDateRange(p.weekStartDate, p.weekEndDate)}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleCopyFromPrevious}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-black uppercase tracking-wider rounded-lg transition-all"
                  >
                    Salin Tugas
                  </button>
                </div>
              </div>
            )}

            {/* 4 Textareas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              <div className="space-y-1.5 border border-slate-100 bg-slate-50/20 p-4 rounded-2xl">
                <label className="text-xs font-black text-blue-700 flex items-center gap-2">
                  <BookOpen size={16} />
                  Bahasa Indonesia (Opsional)
                </label>
                <textarea
                  rows={4}
                  placeholder="Tulis instruksi tugas Bahasa Indonesia..."
                  value={tasksForm.bahasaIndonesia}
                  onChange={(e) => setTasksForm(prev => ({ ...prev, bahasaIndonesia: e.target.value }))}
                  className="w-full bg-white border border-slate-200 text-xs px-4 py-3 rounded-xl focus:outline-none font-medium leading-relaxed"
                />
              </div>

              <div className="space-y-1.5 border border-slate-100 bg-slate-50/20 p-4 rounded-2xl">
                <label className="text-xs font-black text-violet-700 flex items-center gap-2">
                  <Languages size={16} />
                  English (Opsional)
                </label>
                <textarea
                  rows={4}
                  placeholder="Tulis instruksi tugas English..."
                  value={tasksForm.english}
                  onChange={(e) => setTasksForm(prev => ({ ...prev, english: e.target.value }))}
                  className="w-full bg-white border border-slate-200 text-xs px-4 py-3 rounded-xl focus:outline-none font-medium leading-relaxed"
                />
              </div>

              <div className="space-y-1.5 border border-slate-100 bg-slate-50/20 p-4 rounded-2xl">
                <label className="text-xs font-black text-emerald-700 flex items-center gap-2">
                  <BookMarked size={16} />
                  Mengaji (Opsional)
                </label>
                <textarea
                  rows={4}
                  placeholder="Tulis instruksi tugas Mengaji..."
                  value={tasksForm.mengaji}
                  onChange={(e) => setTasksForm(prev => ({ ...prev, mengaji: e.target.value }))}
                  className="w-full bg-white border border-slate-200 text-xs px-4 py-3 rounded-xl focus:outline-none font-medium leading-relaxed"
                />
              </div>

              <div className="space-y-1.5 border border-slate-100 bg-slate-50/20 p-4 rounded-2xl">
                <label className="text-xs font-black text-amber-700 flex items-center gap-2">
                  <Calculator size={16} />
                  Numerasi (Opsional)
                </label>
                <textarea
                  rows={4}
                  placeholder="Tulis instruksi tugas Numerasi..."
                  value={tasksForm.numerasi}
                  onChange={(e) => setTasksForm(prev => ({ ...prev, numerasi: e.target.value }))}
                  className="w-full bg-white border border-slate-200 text-xs px-4 py-3 rounded-xl focus:outline-none font-medium leading-relaxed"
                />
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button
                type="submit"
                disabled={loadingData}
                className="px-6 py-3.5 bg-[#109E58] hover:bg-[#0d854a] text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md flex items-center gap-2"
              >
                {loadingData ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Simpan Tugas
              </button>
            </div>
          </form>

          {/* List of Created Packages */}
          <div className="space-y-4">
            <div className="border-b border-slate-100 pb-2">
              <h3 className="text-md font-black text-gray-900">Daftar Tugas</h3>
              <p className="text-xs font-semibold text-gray-400">Daftar tugas berdasarkan rentang tanggal.</p>
            </div>

            {packages.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {packages.map(pkg => (
                  <div key={pkg.id} className="bg-white border border-slate-100 rounded-[2rem] p-6 shadow-sm flex flex-col justify-between space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-[#109E58] bg-[#109E58]/10 border border-[#109E58]/20 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                          SMP JUNIOR HIGH
                        </span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleEditPackage(pkg)}
                            className="p-1.5 hover:bg-slate-50 text-gray-500 hover:text-[#109E58] rounded-lg transition-all"
                            title="Edit Tugas"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => handleDeletePackage(pkg.id)}
                            className="p-1.5 hover:bg-rose-50 text-gray-500 hover:text-rose-600 rounded-lg transition-all"
                            title="Hapus Tugas"
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

                      {/* Display task list with counts */}
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
            ) : (
              <div className="bg-slate-50 border border-slate-100 rounded-[2rem] p-12 text-center max-w-xl mx-auto space-y-4">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 mx-auto">
                  <FileText size={32} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-black text-gray-900">Belum Ada Tugas</h3>
                  <p className="text-sm text-gray-500 font-semibold leading-relaxed">
                    Gunakan form di atas untuk mengatur tugas penguatan belajar bagi siswa berdasarkan rentang tanggal.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
                    Kelas: {classes.find(c => c.id === selectedClassId)?.name} • NIS: {verifyingProgress.student.nis || 'N/A'}
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
                          Terverifikasi Selesai
                        </span>
                      ) : verifyingProgress.progress.status === 'SUBMITTED' ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <Clock size={14} className="text-amber-500 animate-pulse" />
                          Menunggu Verifikasi Guru
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          <AlertTriangle size={14} className="text-rose-500" />
                          Perlu Revisi
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
                      Catatan Guru / Feedback Revisi (Wajib jika Minta Revisi)
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
                      Minta Revisi
                    </button>
                    <button
                      type="button"
                      disabled={isSavingVerification}
                      onClick={() => handleVerificationSave(true)}
                      className="py-3 bg-[#109E58] hover:bg-[#0d854a] disabled:bg-[#109E58]/50 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5"
                    >
                      <Check size={16} strokeWidth={3} />
                      Verifikasi Selesai
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
                            <span>{h.timestamp}</span>
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

    </div>
  );
}
