import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CheckCircle2, AlertCircle, Clock, UserX, Search, Filter, 
  Save, Calendar, ChevronRight, ChevronLeft, AlertTriangle, MessageSquare, 
  Settings2, BarChart3, Bell, RefreshCw, Layers, Trash2
} from 'lucide-react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { db, auth } from '../../lib/firebase';
import { collection, query, where, getDocs, setDoc, doc, serverTimestamp, getDoc, orderBy, deleteDoc } from 'firebase/firestore';
import { AttendanceStatus, AttendanceRecord, Student, UnitType, Class } from '../../types';
import { attendanceSyncService } from '../../services/attendanceBackupConfigService';
import { toast } from 'sonner';
import StudentSearch from '../../components/StudentSearch';

interface StudentAttendance {
  id: string;
  name: string;
  status: AttendanceStatus | null;
  note: string;
  absencesThisMonth: number;
}

const mockStudents: StudentAttendance[] = [];

export default function Attendance() {
  const navigate = useNavigate();
  const { activeUnit } = useOutletContext<{ activeUnit: UnitType }>();
  const [view, setView] = React.useState<'INPUT' | 'RECAP' | 'ALERTS'>('INPUT');
  const [students, setStudents] = React.useState<StudentAttendance[]>([]);
  const [classes, setClasses] = React.useState<Class[]>([]);
  const [loadingClasses, setLoadingClasses] = React.useState(true);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [lastSaved, setLastSaved] = React.useState<{date: string, classId: string} | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [recapStats, setRecapStats] = React.useState({
    hadir: 0,
    sakit: 0,
    izin: 0,
    alpa: 0,
    late: 0,
    attendanceRate: 0
  });
  const [selectedClass, setSelectedClass] = React.useState('');
  const [selectedDate, setSelectedDate] = React.useState(new Date().toISOString().split('T')[0]);
  
  const now = new Date();
  const [recapMonth, setRecapMonth] = React.useState((now.getMonth() + 1).toString().padStart(2, '0'));
  const [recapYear, setRecapYear] = React.useState(now.getFullYear().toString());
  const [recapData, setRecapData] = React.useState<Record<string, { hadir: number, sakit: number, izin: number, alpa: number, late: number }>>({});
  const [recapMatrix, setRecapMatrix] = React.useState<Record<string, Record<string, string>>>({});
  const [recapViewMode, setRecapViewMode] = React.useState<'SUMMARY' | 'MATRIX'>('SUMMARY');
  const [loadingRecap, setLoadingRecap] = React.useState(false);

  const [threshold, setThreshold] = React.useState(3);
  const [userProfile, setUserProfile] = React.useState<any>(null); // In real app, from AuthContext

  // Fetch classes for active unit
  React.useEffect(() => {
    const fetchClasses = async () => {
      setLoadingClasses(true);
      try {
        const q = query(
          collection(db, 'classes'),
          where('unitId', '==', activeUnit),
          orderBy('name', 'asc')
        );
        const snap = await getDocs(q);
        const classList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Class));
        setClasses(classList);
        if (classList.length > 0 && !selectedClass) {
          setSelectedClass(classList[0].id); // Use ID instead of Name
        }
      } catch (err) {
        console.error('Error fetching classes:', err);
      } finally {
        setLoadingClasses(false);
      }
    };
    fetchClasses();
  }, [activeUnit]);

  // Real App context would come from a global config or active semester hook
  const activeAcademicYear = '2025/2026';
  const activeSemester = '2' as const;

  React.useEffect(() => {
    // Fetch profile role for visibility check
    const checkRole = async () => {
      const user = auth.currentUser;
      if (user) {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) setUserProfile(snap.data());
      }
    };
    checkRole();
  }, []);

  const isAdmin = ['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'PRINCIPAL', 'VICE_PRINCIPAL'].includes(userProfile?.role);

  React.useEffect(() => {
    const loadStudents = async () => {
      setLoading(true);
      setError(null);
      try {
        // Get the actual class name for fallback queries
        const currentClassEntity = classes.find(c => c.id === selectedClass || c.name === selectedClass);
        const className = currentClassEntity?.name || selectedClass;
        const classId = currentClassEntity?.id || selectedClass;

        // Query students in selected class - check users, roleInvites, and students collections
        // We check BOTH id and name for classId field in Firestore to be safe
        const qByClassId = query(collection(db, 'users'), where('role', '==', 'STUDENT'), where('classId', '==', classId));
        const qByClassName = query(collection(db, 'users'), where('role', '==', 'STUDENT'), where('classId', '==', className));
        const qByJobTitle = query(collection(db, 'users'), where('role', '==', 'STUDENT'), where('jobTitle', 'in', [classId, className]));
        
        const qInvitesId = query(collection(db, 'roleInvites'), where('role', '==', 'STUDENT'), where('classId', '==', classId));
        const qInvitesName = query(collection(db, 'roleInvites'), where('role', '==', 'STUDENT'), where('classId', '==', className));
        
        const qStudentsId = query(collection(db, 'students'), where('classId', '==', classId));
        const qStudentsName = query(collection(db, 'students'), where('classId', '==', className));
        
        const [snap1, snap2, snap3, snap4, snap5, snap6, snap7] = await Promise.all([
          getDocs(qByClassId), 
          getDocs(qByClassName),
          getDocs(qByJobTitle),
          getDocs(qInvitesId),
          getDocs(qInvitesName),
          getDocs(qStudentsId),
          getDocs(qStudentsName)
        ]);
        
        // Merge results and remove duplicates (using ID or luminaId as key)
        const combinedDocs = [...snap1.docs, ...snap2.docs, ...snap3.docs, ...snap4.docs, ...snap5.docs, ...snap6.docs, ...snap7.docs];
        const uniqueDocsMap = new Map();
        
        combinedDocs.forEach(d => {
          const data = d.data();
          // Use NIS/LuminaID if available, else doc ID
          const studentId = data.luminaId || data.nis || data.nisn || d.id;
          
          if (!uniqueDocsMap.has(studentId)) {
            uniqueDocsMap.set(studentId, { docId: d.id, ...data });
          } else {
            const existing = uniqueDocsMap.get(studentId);
            uniqueDocsMap.set(studentId, { ...existing, ...data });
          }
        });

        const studentList: StudentAttendance[] = Array.from(uniqueDocsMap.values()).map(data => ({
          id: data.luminaId || data.nis || data.docId,
          name: data.name || data.displayName || data.fullName || "Siswa Tanpa Nama",
          status: null,
          note: '',
          absencesThisMonth: 0 
        })).sort((a, b) => (a.name || "").localeCompare(b.name || ""));

        // Load existing records for today
        const recordsQ = query(
          collection(db, 'attendance_records'),
          where('classId', 'in', [classId, className]),
          where('date', '==', selectedDate)
        );
        const recordsSnap = await getDocs(recordsQ);
        const recordsMap = new Map(recordsSnap.docs.map(d => [d.data().studentId, d.data().status]));
        const notesMap = new Map(recordsSnap.docs.map(d => [d.data().studentId, d.data().note]));

        if (studentList.length > 0) {
          setStudents(studentList.map(s => ({
            ...s,
            status: (recordsMap.get(s.id) as AttendanceStatus) || null,
            note: notesMap.get(s.id) || ''
          })));
        } else {
          // No students found in this class
          setStudents([]);
        }
      } catch (err: any) {
        console.error('Error loading students:', err);
        setError(err.message || 'Gagal memuat data siswa. Pastikan koneksi internet stabil.');
        setStudents([]);
      } finally {
        setLoading(false);
      }
    };

    loadStudents();
  }, [selectedClass, selectedDate]);

  const handleDeleteOne = async (studentId: string) => {
    if (!window.confirm('Hapus data kehadiran untuk siswa ini?')) return;
    
    setDeleting(true);
    try {
      const recordId = `${selectedClass}_${selectedDate}_${studentId}`;
      await deleteDoc(doc(db, 'attendance_records', recordId));
      
      setStudents(students.map(s => s.id === studentId ? { ...s, status: null, note: '' } : s));
      toast.success('Data dihapus', { description: 'Kehadiran individu berhasil dihapus' });
    } catch (err) {
      console.error('Delete error:', err);
      toast.error('Gagal menghapus data');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteAll = async () => {
    const hasData = students.some(s => s.status !== null);
    if (!hasData) {
      toast.error('Tidak ada data untuk dihapus');
      return;
    }

    if (!window.confirm(`Hapus SEMUA data kehadiran untuk kelas ini pada tanggal ${selectedDate}? Tindakan ini tidak dapat dibatalkan.`)) return;
    
    setDeleting(true);
    try {
      const currentClassEntity = classes.find(c => c.id === selectedClass || c.name === selectedClass);
      const className = currentClassEntity?.name || selectedClass;
      const classId = currentClassEntity?.id || selectedClass;

      const q = query(
        collection(db, 'attendance_records'),
        where('classId', 'in', [classId, className]),
        where('date', '==', selectedDate)
      );

      const snap = await getDocs(q);
      const deletePromises = snap.docs.map(d => deleteDoc(d.ref));
      await Promise.all(deletePromises);
      
      setStudents(students.map(s => ({ ...s, status: null, note: '' })));
      toast.success('Pembersihan Selesai', { description: `Semua data kehadiran tanggal ${selectedDate} telah dihapus.` });
    } catch (err) {
      console.error('Delete error:', err);
      toast.error('Gagal menghapus semua data');
    } finally {
      setDeleting(false);
    }
  };

  // Load Monthly Recap Data
  React.useEffect(() => {
    if (view !== 'RECAP' || !selectedClass) return;

    const loadMonthlyRecap = async () => {
      setLoadingRecap(true);
      try {
        const currentClassEntity = classes.find(c => c.id === selectedClass || c.name === selectedClass);
        const className = currentClassEntity?.name || selectedClass;
        const classId = currentClassEntity?.id || selectedClass;

        const monthPrefix = `${recapYear}-${recapMonth}`;
        
        // Query all records for this month
        // We might need to use >= and <= for date if we want to be more precise, 
        // but '==' with string prefix only works if we query the whole collection.
        // Better: use where('date', '>=', `${monthPrefix}-01`) and where('date', '<=', `${monthPrefix}-31`)
        const q = query(
          collection(db, 'attendance_records'),
          where('classId', 'in', [classId, className]),
          where('date', '>=', `${monthPrefix}-01`),
          where('date', '<=', `${monthPrefix}-31`)
        );

        const snap = await getDocs(q);
        const agg: Record<string, { hadir: number, sakit: number, izin: number, alpa: number, late: number }> = {};
        const matrix: Record<string, Record<string, string>> = {};
        
        let totalHadir = 0;
        let totalSakit = 0;
        let totalIzin = 0;
        let totalAlpa = 0;
        let totalLate = 0;

        snap.docs.forEach(doc => {
          const data = doc.data();
          const sId = data.studentId;
          const status = data.status;
          const date = data.date; // YYYY-MM-DD

          if (!agg[sId]) agg[sId] = { hadir: 0, sakit: 0, izin: 0, alpa: 0, late: 0 };
          if (!matrix[sId]) matrix[sId] = {};
          
          matrix[sId][date] = status;
          
          if (status === 'HADIR') { agg[sId].hadir++; totalHadir++; }
          else if (status === 'SAKIT') { agg[sId].sakit++; totalSakit++; }
          else if (status === 'IZIN') { agg[sId].izin++; totalIzin++; }
          else if (status === 'ALPA') { agg[sId].alpa++; totalAlpa++; }
          else if (status === 'LATE') { agg[sId].late++; totalLate++; }
        });

        setRecapData(agg);
        setRecapMatrix(matrix);
        
        const totalRecords = snap.docs.length;
        const studentCount = students.length || 1;
        
        setRecapStats({
          hadir: totalHadir,
          sakit: totalSakit,
          izin: totalIzin,
          alpa: totalAlpa,
          late: totalLate,
          attendanceRate: totalRecords > 0 ? Math.round((totalHadir / totalRecords) * 100) : 0
        });

      } catch (err) {
        console.error('Error loading monthly recap:', err);
      } finally {
        setLoadingRecap(false);
      }
    };

    loadMonthlyRecap();
  }, [view, selectedClass, recapMonth, recapYear, students.length]);

  const handlePrevDate = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const handleNextDate = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const setDateToToday = () => {
    setSelectedDate(new Date().toISOString().split('T')[0]);
  };

  const setDateToYesterday = () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    setSelectedDate(yesterday.toISOString().split('T')[0]);
  };

  const handleStatusChange = (id: string, newStatus: AttendanceStatus) => {
    setStudents(students.map(s => s.id === id ? { ...s, status: newStatus } : s));
  };

  const handleNoteChange = (id: string, note: string) => {
    setStudents(students.map(s => s.id === id ? { ...s, note } : s));
  };
  
  const handleSaveAll = async () => {
    const unselectedCount = students.filter(s => s.status === null).length;
    if (unselectedCount > 0) {
      const confirmSave = window.confirm(`${unselectedCount} siswa belum memiliki status kehadiran. Lanjutkan simpan? (Siswa tanpa status tidak akan disimpan/dianggap belum diabsen)`);
      if (!confirmSave) return;
    }

    setSaving(true);
    let successCount = 0;
    let syncCount = 0;

    try {
      const userEmail = auth.currentUser?.email || 'unknown_teacher';

      for (const student of students) {
        if (student.status === null) continue;

        const recordId = `${selectedClass}_${selectedDate}_${student.id}`;
        const record: AttendanceRecord = {
          id: recordId,
          studentId: student.id,
          studentName: student.name,
          classId: selectedClass,
          academicYear: activeAcademicYear,
          semester: activeSemester,
          date: selectedDate,
          status: student.status,
          note: student.note,
          latenessMinutes: null,
          recordedBy: userEmail,
          recordedAt: Date.now(),
          updatedAt: Date.now(),
          syncStatus: 'PENDING',
          lastSyncAt: null,
          syncError: null,
          retryCount: 0
        };

        // 1. Save to Firestore
        await setDoc(doc(db, 'attendance_records', recordId), {
          ...record,
          recordedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }, { merge: true });
        
        successCount++;

        // 2. Real-time Backup Sync
        const syncResult = await attendanceSyncService.triggerSync(record);
        if (syncResult.success) {
          syncCount++;
          // Update local Firestore status
          await setDoc(doc(db, 'attendance_records', recordId), {
            syncStatus: 'SYNCED',
            lastSyncAt: Date.now(),
            syncError: null
          }, { merge: true });
        } else {
          console.error(`Sync failed for ${recordId}:`, syncResult.error);
          await setDoc(doc(db, 'attendance_records', recordId), {
            syncStatus: 'FAILED',
            syncError: syncResult.error,
            retryCount: 1
          }, { merge: true });
        }
      }

      setLastSaved({ date: selectedDate, classId: selectedClass });
      toast.success('Kehadiran Disimpan', {
        description: `${successCount} data berhasil disimpan. ${syncCount} berhasil di-backup ke Google Sheets.`
      });

    } catch (err) {
      console.error('Save error:', err);
      toast.error('Gagal Simpan', {
        description: 'Terjadi kesalahan saat menyimpan data ke database.'
      });
    } finally {
      setSaving(false);
    }
  };

  const getStatusIcon = (status: AttendanceStatus) => {
    switch (status) {
      case 'HADIR': return <CheckCircle2 size={18} />;
      case 'SAKIT': return <Clock size={18} />;
      case 'IZIN': return <AlertCircle size={18} />;
      case 'ALPA': return <UserX size={18} />;
      default: return null;
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Manajemen Kehadiran</h1>
          <div className="flex items-center gap-2">
            <p className="text-gray-500 font-medium">{activeUnit?.replace('_', ' ')} - Unit Dashboard</p>
            {isAdmin && (
              <button 
                onClick={() => navigate('backup-config')}
                className="p-1.5 bg-gray-100 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                title="Backup Settings"
              >
                <Settings2 size={16} />
              </button>
            )}
          </div>
        </div>
        <div className="flex bg-gray-100 p-1 rounded-xl">
          <ViewButton active={view === 'INPUT'} onClick={() => setView('INPUT')} label="Input Harian" />
          <ViewButton active={view === 'RECAP'} onClick={() => setView('RECAP')} label="Rekap Bulanan" />
          <ViewButton active={view === 'ALERTS'} onClick={() => setView('ALERTS')} label="Alert Risiko" />
        </div>
      </header>

      {view === 'INPUT' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-wrap items-center justify-between gap-4">
             <div className="flex items-center gap-4">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Kelas</span>
                  <div className="relative">
                    <select 
                      value={selectedClass}
                      disabled={loadingClasses}
                      onChange={(e) => setSelectedClass(e.target.value)}
                      className="bg-gray-50 border border-gray-200 rounded-lg pl-3 pr-8 py-1.5 text-sm font-bold outline-none cursor-pointer hover:border-blue-300 transition-colors appearance-none min-w-[120px]"
                    >
                      {loadingClasses ? (
                        <option>Loading...</option>
                      ) : classes.length === 0 ? (
                        <option>No Classes</option>
                      ) : (
                        classes.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))
                      )}
                    </select>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                      <Layers size={14} />
                    </div>
                  </div>
                </div>
                <div className="flex flex-col">
                   <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Tanggal</span>
                   <div className="flex items-center gap-1">
                     <button 
                       onClick={handlePrevDate}
                       className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-lg transition-all"
                       title="Tanggal Sebelumnya"
                     >
                       <ChevronLeft size={16} />
                     </button>
                     <input 
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold outline-none cursor-pointer hover:border-blue-300 transition-colors"
                     />
                     <button 
                       onClick={handleNextDate}
                       className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-lg transition-all"
                       title="Tanggal Berikutnya"
                     >
                       <ChevronRight size={16} />
                     </button>
                     <div className="flex items-center gap-1 ml-2">
                        <button 
                          onClick={setDateToToday}
                          className="px-2 py-1.5 text-[10px] font-bold bg-gray-100 text-gray-500 rounded-lg hover:bg-blue-50 hover:text-blue-600 transition-all whitespace-nowrap"
                        >
                          Hari Ini
                        </button>
                        <button 
                          onClick={setDateToYesterday}
                          className="px-2 py-1.5 text-[10px] font-bold bg-gray-100 text-gray-500 rounded-lg hover:bg-orange-50 hover:text-orange-600 transition-all whitespace-nowrap"
                        >
                          Kemarin
                        </button>
                     </div>
                   </div>
                </div>
             </div>
             <div className="flex gap-2">
                <button 
                  onClick={() => setStudents(students.map(s => ({ ...s, status: 'HADIR' })))}
                  className="px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-sm font-bold border border-blue-100 hover:bg-blue-100 transition-all active:scale-95"
                >
                  Cek Semua Hadir
                </button>
                <button 
                  onClick={handleDeleteAll}
                  disabled={deleting}
                  className="px-4 py-2 bg-red-50 text-red-600 rounded-xl text-sm font-bold border border-red-100 hover:bg-red-100 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
                >
                  {deleting ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Hapus Semua Data Hari Ini
                </button>
             </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {error && (
              <div className="p-4 bg-red-50 border-b border-red-100 flex items-center gap-3 text-red-600 text-sm font-medium">
                <AlertTriangle size={18} />
                {error}
              </div>
            )}
            <table className="w-full text-left">
              <thead className="bg-gray-50/50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Nama Siswa</th>
                  <th className="px-1 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Status Kehadiran</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Catatan Tambahan</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Tindakan</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Eskalasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                   <tr>
                     <td colSpan={4} className="px-6 py-12 text-center text-gray-400 font-medium">
                        <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-blue-500" />
                        Memuat data siswa...
                     </td>
                   </tr>
                ) : students.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-gray-400 font-medium italic">
                       {selectedClass ? 'Tidak ada siswa yang ditemukan di kelas ini.' : 'Pilih kelas terlebih dahulu.'}
                    </td>
                  </tr>
                ) : students.map((student) => (
                  <tr key={student.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-bold text-gray-900 text-sm whitespace-nowrap">{student.name}</p>
                      <p className="text-[10px] text-gray-400 font-medium">#{student.id}</p>
                    </td>
                    <td className="px-2 py-4">
                      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit mx-auto">
                        <StatusBtn 
                          active={student.status === 'HADIR'} 
                          type="HADIR" 
                          onClick={() => handleStatusChange(student.id, 'HADIR')} 
                        />
                        <StatusBtn 
                          active={student.status === 'SAKIT'} 
                          type="SAKIT" 
                          onClick={() => handleStatusChange(student.id, 'SAKIT')} 
                        />
                        <StatusBtn 
                          active={student.status === 'IZIN'} 
                          type="IZIN" 
                          onClick={() => handleStatusChange(student.id, 'IZIN')} 
                        />
                        <StatusBtn 
                          active={student.status === 'ALPA'} 
                          type="ALPA" 
                          onClick={() => handleStatusChange(student.id, 'ALPA')} 
                        />
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="relative group">
                        <MessageSquare size={14} className="absolute left-0 top-1/2 -translate-y-1/2 text-gray-300 group-hover:text-blue-400 transition-colors" />
                        <input 
                          type="text" 
                          placeholder="Tambahkan catatan..."
                          className="w-full bg-transparent border-b border-transparent focus:border-blue-300 outline-none text-sm transition-all py-1 pl-6 placeholder:text-gray-300"
                          value={student.note}
                          onChange={(e) => handleNoteChange(student.id, e.target.value)}
                        />
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center">
                        {student.status && (
                          <button 
                            onClick={() => handleDeleteOne(student.id)}
                            className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                            title="Hapus Kehadiran Siswa Ini"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {student.absencesThisMonth >= threshold ? (
                        <div className="flex items-center justify-end gap-1.5 text-red-500 font-black">
                           <AlertTriangle size={14} />
                           <span className="text-[10px] uppercase tracking-tighter">High Risk</span>
                        </div>
                      ) : (
                        <span className="text-[10px] font-bold text-emerald-500 uppercase">Aman</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end items-center gap-4 pt-4">
             {lastSaved && lastSaved.date === selectedDate && lastSaved.classId === selectedClass && (
               <div className="flex items-center gap-1.5 text-emerald-600 font-bold text-sm bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-100 animate-in fade-in slide-in-from-right-2">
                 <CheckCircle2 size={16} />
                 Data Sudah Disimpan
               </div>
             )}
             <button 
              onClick={handleSaveAll}
              disabled={saving}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-10 py-3 rounded-xl shadow-xl shadow-blue-100 transition-all active:scale-95 disabled:opacity-50"
             >
                {saving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
                {saving ? 'Menyimpan...' : 'Simpan Kehadiran Hari Ini'}
             </button>
          </div>
        </div>
      )}

      {view === 'RECAP' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-wrap items-center gap-6">
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Kelas</span>
              <select 
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-bold outline-none cursor-pointer hover:border-blue-300 transition-colors"
                disabled={loadingClasses}
              >
                <option value="">Pilih Kelas</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Bulan</span>
              <select 
                value={recapMonth}
                onChange={(e) => setRecapMonth(e.target.value)}
                className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-bold outline-none cursor-pointer hover:border-blue-300 transition-colors"
              >
                {['01','02','03','04','05','06','07','08','09','10','11','12'].map(m => (
                  <option key={m} value={m}>{new Date(2000, parseInt(m)-1).toLocaleString('id-ID', { month: 'long' })}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Tahun</span>
              <select 
                value={recapYear}
                onChange={(e) => setRecapYear(e.target.value)}
                className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-bold outline-none cursor-pointer hover:border-blue-300 transition-colors"
              >
                {[2024, 2025, 2026].map(y => (
                  <option key={y} value={y.toString()}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <RecapCard title="Tingkat Hadir" value={`${recapStats.attendanceRate}%`} icon={<CheckCircle2 className="text-green-600" />} />
            <RecapCard title="Total Sakit" value={recapStats.sakit.toString()} icon={<Clock className="text-blue-600" />} />
            <RecapCard title="Total Izin" value={recapStats.izin.toString()} icon={<AlertCircle className="text-yellow-600" />} />
            <RecapCard title="Total Alpa" value={recapStats.alpa.toString()} icon={<UserX className="text-red-600" />} />
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex flex-wrap justify-between items-center gap-4">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <BarChart3 size={18} className="text-blue-500" />
                Rekap {new Date(parseInt(recapYear), parseInt(recapMonth)-1).toLocaleString('id-ID', { month: 'long', year: 'numeric' })}
              </h3>
              <div className="flex bg-gray-100 p-1 rounded-xl">
                <button 
                  onClick={() => setRecapViewMode('SUMMARY')}
                  className={cn(
                    "px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
                    recapViewMode === 'SUMMARY' ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  Ringkasan
                </button>
                <button 
                  onClick={() => setRecapViewMode('MATRIX')}
                  className={cn(
                    "px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
                    recapViewMode === 'MATRIX' ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  Tabel Harian
                </button>
              </div>
              <div className="flex gap-2">
                 <button 
                  onClick={() => attendanceSyncService.downloadPdfRecap(selectedClass, activeAcademicYear, activeSemester)}
                  className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-100 active:scale-95 transition-all"
                 >
                  Cetak (PDF)
                 </button>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              {recapViewMode === 'SUMMARY' ? (
                <table className="w-full text-left">
                  <thead className="bg-gray-50/50 border-b border-gray-100">
                    <tr>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Nama Siswa</th>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Hadir</th>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Sakit</th>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Izin</th>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Alpa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {loadingRecap ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-gray-400 font-medium">
                          <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
                          Memuat data rekap...
                        </td>
                      </tr>
                    ) : students.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-gray-400 font-medium">
                          Tidak ada data siswa.
                        </td>
                      </tr>
                    ) : students.map((s) => {
                      const stats = recapData[s.id] || { hadir: 0, sakit: 0, izin: 0, alpa: 0, late: 0 };
                      return (
                        <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <p className="font-bold text-gray-900 text-sm">{s.name}</p>
                            <p className="text-[10px] text-gray-400 font-medium">#{s.id}</p>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <StatsBadge value={stats.hadir} color="green" />
                          </td>
                          <td className="px-6 py-4 text-center">
                            <StatsBadge value={stats.sakit} color="blue" />
                          </td>
                          <td className="px-6 py-4 text-center">
                            <StatsBadge value={stats.izin} color="yellow" />
                          </td>
                          <td className="px-6 py-4 text-center">
                            <StatsBadge value={stats.alpa} color="red" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="relative">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50/50 border-b border-gray-100">
                      <tr>
                        <th className="sticky left-0 z-10 bg-gray-50 px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-r border-gray-100 min-w-[200px]">
                          Nama Siswa
                        </th>
                        {Array.from({ length: new Date(parseInt(recapYear), parseInt(recapMonth), 0).getDate() }, (_, i) => i + 1).map(day => (
                          <th key={day} className="px-3 py-4 text-[10px] font-bold text-gray-400 text-center border-r border-gray-50 min-w-[40px]">
                            {day}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {loadingRecap ? (
                        <tr>
                          <td colSpan={32} className="px-6 py-12 text-center text-gray-400 font-medium">
                            <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
                            Memuat tabel harian...
                          </td>
                        </tr>
                      ) : students.map((s) => {
                        const daysInMonth = new Date(parseInt(recapYear), parseInt(recapMonth), 0).getDate();
                        const studentMatrix = recapMatrix[s.id] || {};
                        
                        return (
                          <tr key={s.id} className="hover:bg-gray-50/30 transition-colors">
                            <td className="sticky left-0 z-10 bg-white px-6 py-3 border-r border-gray-100 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                              <p className="font-bold text-gray-900 text-xs truncate max-w-[150px]">{s.name}</p>
                            </td>
                            {Array.from({ length: daysInMonth }, (_, i) => {
                              const day = i + 1;
                              const dateStr = `${recapYear}-${recapMonth}-${day.toString().padStart(2, '0')}`;
                              const status = studentMatrix[dateStr];
                              
                              let symbol = '-';
                              let colorClass = 'text-gray-200';
                              
                              if (status === 'HADIR') { symbol = 'H'; colorClass = 'text-green-600 font-black'; }
                              else if (status === 'SAKIT') { symbol = 'S'; colorClass = 'text-blue-600 font-black'; }
                              else if (status === 'IZIN') { symbol = 'I'; colorClass = 'text-yellow-600 font-black'; }
                              else if (status === 'ALPA') { symbol = 'A'; colorClass = 'text-red-600 font-black'; }

                              return (
                                <td key={day} className={cn("px-3 py-3 text-center text-xs border-r border-gray-50", colorClass)}>
                                  {symbol}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {view === 'ALERTS' && (
        <div className="space-y-6">
           <div className="bg-red-50 border border-red-100 p-6 rounded-3xl flex items-start gap-4">
              <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center text-red-600 shrink-0">
                 <Settings2 size={24} />
              </div>
              <div className="space-y-2">
                 <h3 className="font-bold text-red-900">Konfigurasi Threshold Risiko</h3>
                 <p className="text-sm text-red-800 opacity-80">
                   Tentukan jumlah ketidakhadiran (Sakit/Alpa) dalam satu bulan yang akan men-trigger status RISIKO TINGGI untuk eskalasi MTSS.
                 </p>
                 <div className="flex items-center gap-4 pt-2">
                    <input 
                      type="range" min="1" max="10" step="1" 
                      value={threshold} 
                      onChange={(e) => setThreshold(parseInt(e.target.value))}
                      className="accent-red-600 h-2 bg-red-200 rounded-lg cursor-pointer" 
                    />
                    <span className="font-bold text-red-600">{threshold} Hari/Bulan</span>
                 </div>
              </div>
           </div>

           <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 space-y-6">
                 <h3 className="font-bold text-gray-900 flex items-center gap-2">
                    <Bell size={18} className="text-orange-500" />
                    Siswa dengan Kehadiran Rendah
                 </h3>
                 <div className="space-y-3">
                    {students.filter(s => s.absencesThisMonth >= threshold).map(s => (
                      <div key={s.id} className="p-4 bg-red-50/50 rounded-2xl border border-red-100 flex justify-between items-center group hover:bg-red-50 transition-all">
                        <div className="flex items-center gap-3">
                           <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center font-bold text-xs">
                              {s.name[0]}
                           </div>
                           <div>
                              <p className="text-sm font-bold text-gray-900">{s.name}</p>
                              <p className="text-[10px] text-red-600 font-bold uppercase tracking-widest">{s.absencesThisMonth} Hari Absen</p>
                           </div>
                        </div>
                        <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-red-600 border border-red-200 rounded-lg text-[10px] font-bold hover:bg-red-600 hover:text-white transition-all shadow-sm">
                           Eskalasi ke MTSS
                           <ChevronRight size={12} />
                        </button>
                      </div>
                    ))}
                 </div>
              </div>

              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-4">
                 <h3 className="font-bold text-gray-900 flex items-center gap-2">
                    <MessageSquare size={18} className="text-blue-500" />
                    Ringkasan Otomatis Orang Tua
                 </h3>
                 <p className="text-xs text-gray-500 leading-relaxed italic">
                   "Lumina akan secara otomatis mengirimkan notifikasi ke aplikasi orang tua apabila siswa tidak hadir tanpa keterangan (ALPA) saat jam masuk pertama."
                 </p>
                 <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 space-y-3">
                    <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Preview Pesan</p>
                    <div className="bg-white p-3 rounded-xl shadow-sm border border-blue-50 text-xs text-gray-600 leading-relaxed">
                      "Pemberitahuan Lumina: Ananda <strong>[Nama Siswa]</strong> belum tercatat hadir di sekolah hingga pukul 08:30 WIB tanpa keterangan sebelumnya. Mohon segera konfirmasi melalui portal Lumina atau hubungi sekolah."
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}

function StatsBadge({ value, color }: { value: number; color: 'green' | 'blue' | 'yellow' | 'red' | 'orange' }) {
  const colors = {
    green: 'bg-green-50 text-green-700 border-green-100',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-100',
    red: 'bg-red-50 text-red-700 border-red-100',
    orange: 'bg-orange-50 text-orange-700 border-orange-100',
  };
  
  return (
    <span className={cn(
      "inline-flex items-center justify-center w-8 h-8 rounded-lg border font-bold text-xs",
      colors[color],
      value === 0 && "opacity-30 border-transparent bg-transparent text-gray-300"
    )}>
      {value}
    </span>
  );
}

function ViewButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "px-6 py-2 rounded-lg text-sm font-bold transition-all",
        active ? "bg-white text-blue-600 shadow-sm" : "text-gray-400 hover:text-gray-600"
      )}
    >
      {label}
    </button>
  );
}

function StatusBtn({ active, type, onClick }: { active: boolean; type: AttendanceStatus; onClick: () => void }) {
  if (type === 'LATE') return null;

  const colors = {
    HADIR: active ? 'bg-green-500 text-white shadow-lg' : 'text-gray-400 hover:bg-green-50 hover:text-green-500',
    SAKIT: active ? 'bg-blue-500 text-white shadow-lg' : 'text-gray-400 hover:bg-blue-50 hover:text-blue-500',
    IZIN: active ? 'bg-yellow-500 text-white shadow-lg' : 'text-gray-400 hover:bg-yellow-50 hover:text-yellow-500',
    ALPA: active ? 'bg-red-500 text-white shadow-lg' : 'text-gray-400 hover:bg-red-50 hover:text-red-500',
    LATE: '', // Hidden anyway
  };

  return (
    <button 
      onClick={onClick}
      title={type}
      className={cn(
        "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
        colors[type]
      )}
    >
      <span className="text-[10px] font-black">{type[0]}</span>
    </button>
  );
}

function RecapCard({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
      <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center">{icon}</div>
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{title}</p>
        <p className="text-xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

function Stats({ label, value, color }: { label: string; value: string; color: string }) {
  const bgColors = {
    green: 'bg-green-50 border-green-100 text-green-700',
    blue: 'bg-blue-50 border-blue-100 text-blue-700',
    red: 'bg-red-50 border-red-100 text-red-700',
  };
  return (
    <div className={cn("px-3 py-1 rounded-lg border flex items-center gap-2", (bgColors as any)[color])}>
      <span className="text-[10px] font-black">{label}:</span>
      <span className="text-sm font-bold">{value}</span>
    </div>
  );
}
