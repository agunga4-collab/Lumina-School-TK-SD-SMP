import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CheckCircle2, AlertCircle, Clock, UserX, Search, Filter, 
  Save, Calendar, ChevronRight, AlertTriangle, MessageSquare, 
  Settings2, BarChart3, Bell, RefreshCw
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { db, auth } from '../../lib/firebase';
import { collection, query, where, getDocs, setDoc, doc, serverTimestamp, getDoc } from 'firebase/firestore';
import { AttendanceStatus, AttendanceRecord, Student } from '../../types';
import { attendanceSyncService } from '../../services/attendanceBackupConfigService';
import { toast } from 'sonner';

interface StudentAttendance {
  id: string;
  name: string;
  status: AttendanceStatus;
  note: string;
  absencesThisMonth: number;
}

const mockStudents: StudentAttendance[] = [];

export default function Attendance() {
  const navigate = useNavigate();
  const [view, setView] = React.useState<'INPUT' | 'RECAP' | 'ALERTS'>('INPUT');
  const [students, setStudents] = React.useState<StudentAttendance[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [recapStats, setRecapStats] = React.useState({
    hadir: 0,
    sakit: 0,
    izin: 0,
    alpa: 0,
    attendanceRate: 0
  });
  const [threshold, setThreshold] = React.useState(3);

  // Calculate recap stats based on loaded students or fetch from DB
  React.useEffect(() => {
    if (students.length === 0) return;
    
    // In a real app, this would be an aggregate query
    // For now, let's just use current students list snapshot
    const total = students.length;
    const hadir = students.filter(s => s.status === 'HADIR').length;
    const sakit = students.filter(s => s.status === 'SAKIT').length;
    const izin = students.filter(s => s.status === 'IZIN').length;
    const alpa = students.filter(s => s.status === 'ALPA').length;
    
    setRecapStats({
      hadir,
      sakit,
      izin,
      alpa,
      attendanceRate: total > 0 ? Math.round((hadir / total) * 100) : 0
    });
  }, [students]);
  const [selectedClass, setSelectedClass] = React.useState('8-A');
  const [selectedDate, setSelectedDate] = React.useState(new Date().toISOString().split('T')[0]);
  const [userProfile, setUserProfile] = React.useState<any>(null); // In real app, from AuthContext

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
      try {
        // Query students in selected class
        const q = query(collection(db, 'users'), where('role', '==', 'STUDENT'), where('jobTitle', '==', selectedClass));
        const snap = await getDocs(q);
        
        const studentList: StudentAttendance[] = snap.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name,
          status: 'HADIR',
          note: '',
          absencesThisMonth: 0 // In real app, calculate from recent records
        }));

        // Load existing records for today
        const recordsQ = query(
          collection(db, 'attendance_records'),
          where('classId', '==', selectedClass),
          where('date', '==', selectedDate)
        );
        const recordsSnap = await getDocs(recordsQ);
        const recordsMap = new Map(recordsSnap.docs.map(d => [d.data().studentId, d.data().status]));
        const notesMap = new Map(recordsSnap.docs.map(d => [d.data().studentId, d.data().note]));

        if (studentList.length > 0) {
          setStudents(studentList.map(s => ({
            ...s,
            status: (recordsMap.get(s.id) as AttendanceStatus) || 'HADIR',
            note: notesMap.get(s.id) || ''
          })));
        } else {
          // No students found in this class
          setStudents([]);
        }
      } catch (err) {
        console.error('Error loading students:', err);
        setStudents([]);
      } finally {
        setLoading(false);
      }
    };

    loadStudents();
  }, [selectedClass, selectedDate]);

  const handleStatusChange = (id: string, newStatus: AttendanceStatus) => {
    setStudents(students.map(s => s.id === id ? { ...s, status: newStatus } : s));
  };

  const handleNoteChange = (id: string, note: string) => {
    setStudents(students.map(s => s.id === id ? { ...s, note } : s));
  };
  
  const handleSaveAll = async () => {
    setSaving(true);
    let successCount = 0;
    let syncCount = 0;

    try {
      const userEmail = auth.currentUser?.email || 'unknown_teacher';

      for (const student of students) {
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

        // 2. Real-time Backup Sync (Fire and Forget or Sequential?)
        // Sequential for more feedback in this turn
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
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Manajemen Kehadiran</h1>
          <div className="flex items-center gap-2">
            <p className="text-gray-500 font-medium">Lumina Junior High - Unit Dashboard</p>
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
                   <select 
                    value={selectedClass}
                    onChange={(e) => setSelectedClass(e.target.value)}
                    className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-bold outline-none cursor-pointer hover:border-blue-300 transition-colors"
                   >
                    <option value="8-A">8-A</option>
                    <option value="8-B">8-B</option>
                    <option value="7-A">7-A</option>
                    <option value="9-A">9-A</option>
                  </select>
                </div>
                <div className="flex flex-col">
                   <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Tanggal</span>
                   <input 
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold outline-none cursor-pointer"
                   />
                </div>
             </div>
             <div className="flex gap-2">
                <button 
                  onClick={() => setStudents(students.map(s => ({ ...s, status: 'HADIR' })))}
                  className="px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-sm font-bold border border-blue-100 hover:bg-blue-100 transition-all active:scale-95"
                >
                  Cek Semua Hadir
                </button>
             </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-gray-50/50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Nama Siswa</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status Kehadiran</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Catatan Tambahan</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Risiko</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {students.map((student) => (
                  <tr key={student.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-bold text-gray-900 text-sm">{student.name}</p>
                      <p className="text-[10px] text-gray-400 font-medium">#{student.id}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
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
                      <input 
                        type="text" 
                        placeholder="Tambahkan catatan..."
                        className="w-full bg-transparent border-b border-transparent focus:border-blue-300 outline-none text-sm transition-all py-1 placeholder:text-gray-300"
                        value={student.note}
                        onChange={(e) => handleNoteChange(student.id, e.target.value)}
                      />
                    </td>
                    <td className="px-6 py-4">
                      {student.absencesThisMonth >= threshold ? (
                        <div className="flex items-center gap-1.5 text-red-500 bg-red-50 px-2 py-1 rounded-md border border-red-100 w-fit">
                           <AlertTriangle size={12} />
                           <span className="text-[10px] font-black uppercase">Risiko Tinggi</span>
                        </div>
                      ) : (
                        <span className="text-[10px] font-bold text-gray-300 uppercase">Normal</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end pt-4">
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
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <RecapCard title="Tingkat Hadir" value={`${recapStats.attendanceRate}%`} icon={<CheckCircle2 className="text-green-600" />} />
            <RecapCard title="Total Sakit" value={recapStats.sakit.toString()} icon={<Clock className="text-blue-600" />} />
            <RecapCard title="Total Izin" value={recapStats.izin.toString()} icon={<AlertCircle className="text-yellow-600" />} />
            <RecapCard title="Total Alpa" value={recapStats.alpa.toString()} icon={<UserX className="text-red-600" />} />
          </div>

          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <BarChart3 size={18} className="text-blue-500" />
                Rekap Kehadiran Bulan April
              </h3>
              <div className="flex gap-2">
                 <button 
                  onClick={() => attendanceSyncService.downloadPdfRecap(selectedClass, activeAcademicYear, activeSemester)}
                  className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-100 active:scale-95 transition-all"
                 >
                  Cetak Laporan (PDF)
                 </button>
              </div>
            </div>
            
            <div className="space-y-4">
              {students.map(s => (
                <div key={s.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                   <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center font-bold text-blue-600 border border-blue-50">
                        {s.name[0]}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-900">{s.name}</p>
                        <p className="text-xs text-gray-500">Status Hari Ini: {s.status}</p>
                      </div>
                   </div>
                   <div className="flex gap-8">
                      <Stats label="H" value={s.status === 'HADIR' ? '1' : '0'} color="green" />
                      <Stats label="S" value={s.status === 'SAKIT' ? '1' : '0'} color="blue" />
                      <Stats label="A" value={s.status === 'ALPA' ? '1' : '0'} color="red" />
                   </div>
                </div>
              ))}
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
  const colors = {
    HADIR: active ? 'bg-green-500 text-white shadow-lg' : 'text-gray-400 hover:bg-green-50 hover:text-green-500',
    SAKIT: active ? 'bg-blue-500 text-white shadow-lg' : 'text-gray-400 hover:bg-blue-50 hover:text-blue-500',
    IZIN: active ? 'bg-yellow-500 text-white shadow-lg' : 'text-gray-400 hover:bg-yellow-50 hover:text-yellow-500',
    ALPA: active ? 'bg-red-500 text-white shadow-lg' : 'text-gray-400 hover:bg-red-50 hover:text-red-500',
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
