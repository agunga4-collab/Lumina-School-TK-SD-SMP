import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, CheckSquare, Sparkles, BookOpen, 
  Languages, BookMarked, Calculator, Clock, 
  AlertTriangle, Check, ShieldAlert, Plus, 
  Calendar, Search, Filter, Loader2, Info, 
  Eye, Edit, Trash2, Send, Save, ArrowRight, CornerDownLeft, FileText, CheckCircle2,
  X, AlertCircle
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
  addDoc, 
  serverTimestamp, 
  writeBatch 
} from 'firebase/firestore';
import { toast } from 'sonner';
import { isTeacherAssignedToClass } from '../../services/classTeacherAssignmentService';

interface LearningPowerUpTask {
  id: string;
  unit: 'JUNIOR_HIGH';
  academicYearId: string;
  classId: string;
  weekId: string;
  weekLabel: string;
  category: 'LITERASI_BAHASA' | 'LITERASI_ENGLISH' | 'MENGAJI' | 'NUMERASI';
  title: string;
  instruction: string;
  dueDate: string;
  isActive: boolean;
  createdBy: string;
  createdAt: any;
}

interface TaskProgressHistory {
  timestamp: string;
  action: 'SUBMIT' | 'REVISION_REQUEST' | 'RESUBMIT' | 'VERIFY';
  note?: string | null;
  actorName: string;
}

interface TaskProgress {
  id: string;
  taskId: string;
  studentId: string;
  classId: string;
  academicYearId: string;
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
  LITERASI_BAHASA: {
    label: 'Literasi Bahasa',
    icon: BookOpen,
    colorClass: 'text-blue-600 bg-blue-50 border-blue-200',
    accentColor: 'blue'
  },
  LITERASI_ENGLISH: {
    label: 'Literasi English',
    icon: Languages,
    colorClass: 'text-violet-600 bg-violet-50 border-violet-200',
    accentColor: 'violet'
  },
  MENGAJI: {
    label: 'Mengaji',
    icon: BookMarked,
    colorClass: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    accentColor: 'emerald'
  },
  NUMERASI: {
    label: 'Numerasi',
    icon: Calculator,
    colorClass: 'text-amber-600 bg-amber-50 border-amber-200',
    accentColor: 'amber'
  }
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
  const [tasks, setTasks] = React.useState<LearningPowerUpTask[]>([]);
  const [progresses, setProgresses] = React.useState<TaskProgress[]>([]);

  // Loading states
  const [loadingMetadata, setLoadingMetadata] = React.useState(true);
  const [loadingData, setLoadingData] = React.useState(false);

  // Search filter inside table
  const [searchQuery, setSearchQuery] = React.useState<string>('');

  // Task Creation states
  const [isCreatingTask, setIsCreatingTask] = React.useState(false);
  const [taskForm, setTaskForm] = React.useState({
    category: 'LITERASI_BAHASA' as LearningPowerUpTask['category'],
    title: '',
    instruction: '',
    weekId: '',
    weekLabel: '',
    dueDate: ''
  });

  // Verification modal states
  const [verifyingProgress, setVerifyingProgress] = React.useState<{
    student: Student;
    category: LearningPowerUpTask['category'];
    task: LearningPowerUpTask;
    progress: TaskProgress | null;
  } | null>(null);
  const [verificationNote, setVerificationNote] = React.useState('');
  const [isSavingVerification, setIsSavingVerification] = React.useState(false);

  // Load Classes on mount
  React.useEffect(() => {
    const loadClassesList = async () => {
      setLoadingMetadata(true);
      try {
        const allClasses = await getClasses() || [];
        // Filter classes: must be JUNIOR_HIGH and from the active year
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

  // Load tasks, progress, and student roster for the selected class
  const loadClassData = async () => {
    if (!selectedClassId || !activeYear) return;
    setLoadingData(true);
    try {
      // 1. Load active student roster
      const roster = await getActiveStudents(selectedClassId, activeYear) || [];
      setStudents(roster);

      // 2. Load tasks for this class & year
      const qTasks = query(
        collection(db, 'learning_power_up_tasks'),
        where('classId', '==', selectedClassId),
        where('academicYearId', '==', activeYear),
        where('unit', '==', 'JUNIOR_HIGH')
      );
      const tasksSnap = await getDocs(qTasks);
      const loadedTasks = tasksSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as LearningPowerUpTask[];

      // Sort by due date
      loadedTasks.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
      setTasks(loadedTasks);

      // Extract unique week ids & pick the latest by default if none selected
      const uniqueWeeks = Array.from(new Set(loadedTasks.map(t => t.weekId)));
      if (uniqueWeeks.length > 0 && !selectedWeek) {
        setSelectedWeek(uniqueWeeks[uniqueWeeks.length - 1]);
      } else if (uniqueWeeks.length > 0 && !uniqueWeeks.includes(selectedWeek)) {
        setSelectedWeek(uniqueWeeks[uniqueWeeks.length - 1]);
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

  // Get unique week options
  const uniqueWeeksList = Array.from(
    new Set(tasks.map(t => JSON.stringify({ id: t.weekId, label: t.weekLabel })))
  ).map((s: any) => JSON.parse(s) as { id: string; label: string });

  // Filter tasks to show in the spreadsheet column titles
  const activeWeekTasks = tasks.filter(t => t.weekId === selectedWeek && t.isActive);

  // Filter student roster by name search
  const filteredStudents = students.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.nis && s.nis.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Helper: Find progress record for student & task
  const findProgress = (studentId: string, taskId: string): TaskProgress | null => {
    return progresses.find(p => p.studentId === studentId && p.taskId === taskId) || null;
  };

  // Helper: Find task by category in current active week
  const findTaskByCategory = (category: LearningPowerUpTask['category']): LearningPowerUpTask | undefined => {
    return activeWeekTasks.find(t => t.category === category);
  };

  // Handle cell click -> opens Verification Modal
  const handleCellClick = (student: Student, category: LearningPowerUpTask['category']) => {
    const task = findTaskByCategory(category);
    if (!task) {
      toast.error(`Belum ada tugas aktif untuk kategori ${CATEGORY_CONFIG[category].label} pekan ini.`);
      return;
    }
    const progress = findProgress(student.id, task.id);
    setVerifyingProgress({ student, category, task, progress });
    setVerificationNote(progress?.revisionNote || '');
  };

  // Save teacher verification action (Approve / Request Revision)
  const handleVerificationSave = async (isApproved: boolean) => {
    if (!verifyingProgress) return;
    const { student, task, progress } = verifyingProgress;
    
    if (!isApproved && !verificationNote.trim()) {
      toast.error("Catatan revisi wajib diisi jika Anda meminta perbaikan tugas!");
      return;
    }

    setIsSavingVerification(true);
    try {
      const progressId = progress?.id || `progress_${task.id}_${student.id}`;
      const currentHistory = progress?.history || [];
      const nowStr = new Date().toLocaleString('id-ID', { hour12: false });

      const newHistoryItem: TaskProgressHistory = {
        timestamp: nowStr,
        action: isApproved ? 'VERIFY' : 'REVISION_REQUEST',
        actorName: (currentUser as any).name || "Guru/Coach",
        note: isApproved ? "Guru memverifikasi tugas selesai." : `Guru meminta revisi: "${verificationNote}"`
      };

      const updatedProgress: Partial<TaskProgress> = {
        taskId: task.id,
        studentId: student.id,
        classId: selectedClassId,
        academicYearId: activeYear,
        status: isApproved ? 'VERIFIED' : 'REVISION_REQUIRED',
        verifiedAt: isApproved ? serverTimestamp() : (progress?.verifiedAt || null),
        verifiedBy: isApproved ? currentUser.uid : (progress?.verifiedBy || null),
        revisionNote: isApproved ? null : verificationNote,
        updatedAt: serverTimestamp(),
        history: [...currentHistory, newHistoryItem]
      };

      await setDoc(doc(db, 'learning_power_up_progress', progressId), updatedProgress, { merge: true });
      toast.success(isApproved ? "Tugas berhasil diverifikasi selesai!" : "Revisi berhasil diajukan ke siswa.");
      
      // Close modal & reload data
      setVerifyingProgress(null);
      await loadClassData();
    } catch (err) {
      console.error("Error saving verification:", err);
      toast.error("Gagal menyimpan hasil verifikasi.");
    } finally {
      setIsSavingVerification(false);
    }
  };

  // Submit task creation
  const handleCreateTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClassId || !activeYear) return;
    if (!taskForm.title || !taskForm.instruction || !taskForm.dueDate || !taskForm.weekId || !taskForm.weekLabel) {
      toast.error("Harap lengkapi semua kolom tugas!");
      return;
    }

    setLoadingData(true);
    try {
      const taskId = `learning_power_up_task_${Date.now()}`;
      const newTask: LearningPowerUpTask = {
        id: taskId,
        unit: 'JUNIOR_HIGH',
        academicYearId: activeYear,
        classId: selectedClassId,
        weekId: taskForm.weekId,
        weekLabel: taskForm.weekLabel,
        category: taskForm.category,
        title: taskForm.title,
        instruction: taskForm.instruction,
        dueDate: taskForm.dueDate,
        isActive: true,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp()
      };

      await setDoc(doc(db, 'learning_power_up_tasks', taskId), newTask);
      toast.success("Tugas penguatan berhasil dibuat!");
      
      // Reset form & state
      setTaskForm({
        category: 'LITERASI_BAHASA',
        title: '',
        instruction: '',
        weekId: '',
        weekLabel: '',
        dueDate: ''
      });
      setIsCreatingTask(false);
      setSelectedWeek(newTask.weekId);
      await loadClassData();
    } catch (err) {
      console.error("Error creating task:", err);
      toast.error("Gagal membuat tugas baru.");
    } finally {
      setLoadingData(false);
    }
  };

  // Toggle task activation status
  const handleToggleTaskActive = async (taskId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'learning_power_up_tasks', taskId), {
        isActive: !currentStatus
      });
      toast.success(!currentStatus ? "Tugas diaktifkan!" : "Tugas dinonaktifkan!");
      await loadClassData();
    } catch (err) {
      console.error("Error toggling task active status:", err);
      toast.error("Gagal memperbarui status tugas.");
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

  // Pre-configured default categories order
  const categories: Array<LearningPowerUpTask['category']> = ['LITERASI_BAHASA', 'LITERASI_ENGLISH', 'MENGAJI', 'NUMERASI'];

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
            Kelola, buat, dan verifikasi tugas penguatan belajar siswa SMP secara terpadu.
          </p>
          
          <div className="flex flex-wrap gap-x-4 gap-y-2 pt-2 text-xs font-bold text-gray-500">
            <span className="bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100">
              Guru: <strong className="text-gray-950">{(currentUser as any).name || currentUser.email}</strong>
            </span>
            <span className="bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100">
              Tahun Ajaran Aktif: <strong className="text-gray-950">{activeYear}</strong>
            </span>
          </div>
        </div>

        {/* Action controls / class list selector */}
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
          Kelola Tugas Mingguan
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
              {/* Select Week */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Pekan:</span>
                {uniqueWeeksList.length > 0 ? (
                  <select
                    value={selectedWeek}
                    onChange={(e) => setSelectedWeek(e.target.value)}
                    className="bg-white border border-slate-200 text-gray-700 font-bold text-xs px-3 py-2 rounded-lg"
                  >
                    {uniqueWeeksList.map(w => (
                      <option key={w.id} value={w.id}>{w.label}</option>
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
                      {categories.map(cat => (
                        <th key={cat} className="py-4 px-6 text-center">
                          {CATEGORY_CONFIG[cat].label}
                        </th>
                      ))}
                      <th className="py-4 px-6 text-center">Ringkasan Selesai</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm font-medium text-gray-700">
                    {filteredStudents.map((student, idx) => {
                      // Calculate completed category targets for this student
                      let verifiedInWeekCount = 0;
                      let totalWeekTasksCount = 0;

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

                          {categories.map(cat => {
                            const task = findTaskByCategory(cat);
                            const progress = task ? findProgress(student.id, task.id) : null;
                            const status = progress?.status || 'NOT_STARTED';

                            if (task) {
                              totalWeekTasksCount++;
                              if (status === 'VERIFIED') verifiedInWeekCount++;
                            }

                            return (
                              <td 
                                key={cat} 
                                className="py-4 px-6 text-center align-middle"
                              >
                                {task ? (
                                  <button
                                    onClick={() => handleCellClick(student, cat)}
                                    className="inline-flex items-center justify-center p-1 rounded-xl transition-all hover:bg-slate-100 focus:outline-none"
                                    title={`Klik untuk verifikasi ${student.name} - ${CATEGORY_CONFIG[cat].label}`}
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
                                ) : (
                                  <span className="text-[10px] text-gray-300 font-bold italic">
                                    Tidak Ada Tugas
                                  </span>
                                )}
                              </td>
                            );
                          })}

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

      {/* TAB 2 — KELOLA TUGAS MINGGUAN */}
      {activeTab === 'MANAGE_TASKS' && (
        <div className="space-y-8">
          {/* Header Action Row */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-gray-900">Tugas Penguatan Terdaftar</h2>
              <p className="text-xs font-semibold text-gray-400">Buat atau aktifkan instruksi tugas mingguan kelas.</p>
            </div>
            
            <button
              onClick={() => setIsCreatingTask(true)}
              className="px-5 py-3 bg-[#109E58] hover:bg-[#0d854a] text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md flex items-center gap-2"
            >
              <Plus size={16} />
              Buat Tugas Baru
            </button>
          </div>

          {/* Task Creation Form panel */}
          <AnimatePresence>
            {isCreatingTask && (
              <motion.form 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                onSubmit={handleCreateTaskSubmit}
                className="bg-white rounded-[2rem] border border-slate-100 p-8 shadow-sm space-y-6 overflow-hidden"
              >
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <h3 className="text-md font-black text-gray-900 flex items-center gap-2">
                    <Plus size={18} className="text-[#109E58]" />
                    Form Pembuatan Tugas Penguatan
                  </h3>
                  <button 
                    type="button"
                    onClick={() => setIsCreatingTask(false)}
                    className="p-1.5 rounded-full bg-slate-50 text-gray-400 hover:text-gray-600 hover:bg-slate-100"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Category select */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Kategori Tugas</label>
                    <select
                      value={taskForm.category}
                      onChange={(e) => setTaskForm(prev => ({ ...prev, category: e.target.value as LearningPowerUpTask['category'] }))}
                      className="w-full bg-slate-50 border border-slate-200 font-bold text-sm px-4 py-3 rounded-xl focus:outline-none"
                    >
                      {categories.map(c => (
                        <option key={c} value={c}>{CATEGORY_CONFIG[c].label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Week ID */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">ID Pekan (Contoh: 2026-W32)</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 2026-W32"
                      value={taskForm.weekId}
                      onChange={(e) => setTaskForm(prev => ({ ...prev, weekId: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 text-sm px-4 py-3 rounded-xl focus:outline-none font-bold"
                    />
                  </div>

                  {/* Week Label */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Label Pekan (Visual Siswa)</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Pekan 2 (7 Agt - 14 Agt)"
                      value={taskForm.weekLabel}
                      onChange={(e) => setTaskForm(prev => ({ ...prev, weekLabel: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 text-sm px-4 py-3 rounded-xl focus:outline-none font-semibold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Title */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Judul Tugas</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Literasi Bahasa Pekan 2"
                      value={taskForm.title}
                      onChange={(e) => setTaskForm(prev => ({ ...prev, title: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 text-sm px-4 py-3 rounded-xl focus:outline-none font-bold"
                    />
                  </div>

                  {/* Due Date */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Batas Waktu (Due Date)</label>
                    <input
                      type="date"
                      required
                      value={taskForm.dueDate}
                      onChange={(e) => setTaskForm(prev => ({ ...prev, dueDate: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 text-sm px-4 py-3 rounded-xl focus:outline-none font-semibold"
                    />
                  </div>
                </div>

                {/* Instruction */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Instruksi Tugas</label>
                  <textarea
                    rows={3}
                    required
                    placeholder="Tuliskan detail instruksi tugas belajar untuk pekan ini agar siswa dapat membacanya..."
                    value={taskForm.instruction}
                    onChange={(e) => setTaskForm(prev => ({ ...prev, instruction: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 text-sm px-4 py-3 rounded-xl focus:outline-none font-medium leading-relaxed"
                  />
                </div>

                {/* Submit Action */}
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsCreatingTask(false)}
                    className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-gray-600 text-xs font-black uppercase tracking-widest rounded-xl transition-all"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-3 bg-[#109E58] hover:bg-[#0d854a] text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md flex items-center gap-1.5"
                  >
                    <Save size={16} />
                    Simpan Tugas
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>

          {/* List of Tasks */}
          {tasks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="manage-tasks-grid">
              {tasks.map(task => {
                const cfg = CATEGORY_CONFIG[task.category] || CATEGORY_CONFIG.LITERASI_BAHASA;
                const IconComp = cfg.icon;

                return (
                  <div 
                    key={task.id}
                    className={cn(
                      "bg-white border rounded-[2rem] p-6 shadow-sm flex flex-col justify-between space-y-6 relative overflow-hidden",
                      task.isActive ? "border-slate-100 bg-white" : "border-slate-200 bg-slate-50/50 opacity-75"
                    )}
                  >
                    <div className="space-y-4">
                      {/* Icon header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={cn("w-10 h-10 rounded-xl border flex items-center justify-center shrink-0", cfg.colorClass)}>
                            <IconComp size={20} />
                          </div>
                          <div>
                            <span className="text-[9px] font-black text-gray-400 block leading-none">KATEGORI</span>
                            <span className="text-xs font-black text-gray-700 block">{cfg.label}</span>
                          </div>
                        </div>

                        {/* Status Toggle Badge */}
                        <button
                          onClick={() => handleToggleTaskActive(task.id, task.isActive)}
                          className={cn(
                            "px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border",
                            task.isActive 
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" 
                              : "bg-slate-200 text-slate-500 border-slate-300 hover:bg-slate-300"
                          )}
                        >
                          {task.isActive ? "Aktif" : "Nonaktif"}
                        </button>
                      </div>

                      <div className="space-y-1">
                        <h3 className="text-md font-black text-gray-900 tracking-tight leading-snug">
                          {task.title}
                        </h3>
                        <p className="text-xs text-gray-400 font-bold">
                          ID Pekan: <strong className="text-gray-600">{task.weekId}</strong>
                        </p>
                        <p className="text-xs text-gray-400 font-bold">
                          Label Pekan: <strong className="text-gray-600">{task.weekLabel}</strong>
                        </p>
                      </div>

                      <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100 text-xs font-medium text-slate-600 leading-relaxed max-h-24 overflow-y-auto">
                        {task.instruction}
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar size={14} />
                        Due: {new Date(task.dueDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>

                      <span className="text-[10px] text-gray-400 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        SMP JUNIOR HIGH
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-100 rounded-[2rem] p-12 text-center max-w-xl mx-auto space-y-4">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 mx-auto">
                <FileText size={32} />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black text-gray-900">Belum Ada Tugas Dibuat</h3>
                <p className="text-sm text-gray-500 font-semibold leading-relaxed">
                  Gunakan tombol "Buat Tugas Baru" di pojok kanan atas untuk memicu target penguatan belajar bagi kelas {classes.find(c => c.id === selectedClassId)?.name || 'SMP'}.
                </p>
              </div>
            </div>
          )}
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
                      {CATEGORY_CONFIG[verifyingProgress.category].label}
                    </span>
                  </div>
                  <h4 className="font-bold text-sm text-gray-900 leading-snug">
                    {verifyingProgress.task.title}
                  </h4>
                  <p className="text-xs font-medium text-gray-500 italic max-h-24 overflow-y-auto leading-relaxed border-t border-slate-200/50 pt-2 mt-1">
                    "{verifyingProgress.task.instruction}"
                  </p>
                </div>

                {/* Submision Status badge info */}
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

                    {/* Overdue check */}
                    {new Date().toISOString().split('T')[0] > verifyingProgress.task.dueDate && 
                      (!verifyingProgress.progress || verifyingProgress.progress.status !== 'VERIFIED') && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">
                          <AlertCircle size={14} className="text-red-500" />
                          Terlambat
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

    </div>
  );
}
