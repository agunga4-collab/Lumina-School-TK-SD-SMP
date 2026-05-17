import * as React from 'react';
import { motion } from 'motion/react';
import { 
  Clock, AlertCircle, Calendar, Search, 
  Save, History, Bell, MessageSquare, ArrowRight,
  TrendingUp, UserCheck, Loader2
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { toast } from 'sonner';

import StudentSearch from '../../components/StudentSearch';

interface LatenessRecord {
  id: string;
  name: string;
  arrivalTime: string;
  reason: string;
  parentNote: boolean;
  countThisMonth: number;
}

export default function Lateness() {
  const [records, setRecords] = React.useState<LatenessRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [classes, setClasses] = React.useState<any[]>([]);
  const [selectedClass, setSelectedClass] = React.useState('');
  const threshold = 3;

  React.useEffect(() => {
    const fetchClasses = async () => {
      try {
        const q = query(collection(db, 'classes'));
        const snap = await getDocs(q);
        const classList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setClasses(classList);
        if (classList.length > 0) {
          setSelectedClass(classList[0].id);
        }
      } catch (err) {
        console.error('Error fetching classes:', err);
      }
    };
    fetchClasses();
  }, []);

  React.useEffect(() => {
    if (!selectedClass) {
      setLoading(false);
      return;
    }

    const loadStudents = async () => {
      setLoading(true);
      try {
        // Query students from roleInvites or users?
        // Let's use the 'users' collection with role 'STUDENT'
        const q = query(
          collection(db, 'users'), 
          where('role', '==', 'STUDENT'), 
          where('jobTitle', '==', classes.find(c => c.id === selectedClass)?.name || '')
        );
        const snap = await getDocs(q);
        
        const studentList: LatenessRecord[] = snap.docs.map(doc => ({
          id: doc.id,
          name: doc.data().displayName || doc.data().name || 'Unknown Student',
          arrivalTime: '',
          reason: '',
          parentNote: false,
          countThisMonth: 0 // In real app, would fetch from a stats collection
        }));
        
        setRecords(studentList);
      } catch (err) {
        console.error('Error loading students for lateness:', err);
        toast.error('Gagal memuat data siswa');
      } finally {
        setLoading(false);
      }
    };

    loadStudents();
  }, [selectedClass, classes]);

  const updateTime = (id: string, arrivalTime: string) => {
    setRecords(records.map(r => r.id === id ? { ...r, arrivalTime } : r));
  };

  const updateReason = (id: string, reason: string) => {
    setRecords(records.map(r => r.id === id ? { ...r, reason } : r));
  };

  const toggleNote = (id: string) => {
    setRecords(records.map(r => r.id === id ? { ...r, parentNote: !r.parentNote } : r));
  };

  const handleSave = async () => {
    const lateEntries = records.filter(r => r.arrivalTime !== '');
    if (lateEntries.length === 0) {
      toast.error('Tidak ada data kedatangan yang diisi');
      return;
    }

    setSaving(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      for (const entry of lateEntries) {
        const docId = `LATE_${today}_${entry.id}`;
        await setDoc(doc(db, 'lateness_records', docId), {
          studentId: entry.id,
          studentName: entry.name,
          date: today,
          arrivalTime: entry.arrivalTime,
          reason: entry.reason,
          parentNote: entry.parentNote,
          recordedAt: serverTimestamp(),
          classId: selectedClass
        });
      }
      toast.success('Data keterlambatan berhasil disimpan');
    } catch (err) {
      console.error('Error saving lateness:', err);
      toast.error('Gagal menyimpan data');
    } finally {
      setSaving(true); // Should be false, fixed in logic
      setSaving(false);
    }
  };

  const filteredRecords = records.filter(r => 
    r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Data Keterlambatan</h1>
          <p className="text-gray-500 font-medium">Lumina Elementary - Jam Masuk: 07:15 WIB</p>
        </div>
        <div className="bg-blue-50 px-4 py-2 rounded-xl border border-blue-100 flex items-center gap-2">
           <Calendar className="text-blue-600" size={18} />
           <span className="text-sm font-bold text-blue-800">{new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}</span>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Input Section */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
             <div className="p-6 border-b border-gray-50 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4">
                  <h2 className="font-bold text-gray-900 flex items-center gap-2 whitespace-nowrap">
                     <Clock size={18} className="text-orange-500" />
                     Input Kedatangan
                  </h2>
                  <select 
                    value={selectedClass}
                    onChange={(e) => setSelectedClass(e.target.value)}
                    className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-1.5 text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Pilih Kelas</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="relative flex-1 max-w-xs">
                  <StudentSearch 
                    placeholder="Cari nama/panggilan..."
                    onSelect={(student) => {
                      // Check if already in list
                      if (records.some(r => r.id === student.id)) {
                        toast.info(`${student.name} sudah ada di daftar`);
                        return;
                      }
                      
                      const newRecord: LatenessRecord = {
                        id: student.id,
                        name: student.name,
                        arrivalTime: '',
                        reason: '',
                        parentNote: false,
                        countThisMonth: 0
                      };
                      setRecords([newRecord, ...records]);
                      
                      // Also update class to the student's class if available
                      if (student.classId) {
                        setSelectedClass(student.classId);
                      }
                    }}
                  />
                </div>
             </div>
             
             <div className="overflow-x-auto">
                {loading ? (
                  <div className="p-12 flex flex-col items-center justify-center gap-2 text-gray-400">
                    <Loader2 size={24} className="animate-spin text-blue-500" />
                    <p className="text-xs font-medium uppercase tracking-widest">Memuat daftar siswa...</p>
                  </div>
                ) : filteredRecords.length === 0 ? (
                  <div className="p-12 text-center text-gray-400">
                    <p className="text-sm italic">Tidak ada siswa ditemukan di kelas ini.</p>
                  </div>
                ) : (
                  <table className="w-full text-left">
                    <thead className="bg-gray-50/50">
                        <tr>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Siswa</th>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Waktu Tiba</th>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Alasan / Keterangan</th>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Izin Ortu</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {filteredRecords.map(record => (
                          <tr key={record.id} className="hover:bg-gray-50/50 transition-colors">
                              <td className="px-6 py-4">
                                <p className="font-bold text-gray-900 text-sm">{record.name}</p>
                                <div className="flex items-center gap-1 mt-1">
                                    {record.countThisMonth >= threshold ? (
                                      <span className="flex items-center gap-1 text-[9px] font-black text-red-500 bg-red-50 px-1.5 py-0.5 rounded uppercase border border-red-100">
                                          <AlertCircle size={10} />
                                          Sering Terlambat ({record.countThisMonth}x)
                                      </span>
                                    ) : (
                                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Frekuensi: {record.countThisMonth}x bulan ini</span>
                                    )}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <input 
                                    type="time" 
                                    className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-1.5 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
                                    value={record.arrivalTime}
                                    onChange={(e) => updateTime(record.id, e.target.value)}
                                />
                              </td>
                              <td className="px-6 py-4">
                                <input 
                                    type="text" 
                                    placeholder="Tulis alasan..."
                                    className="w-full bg-transparent border-b border-transparent focus:border-blue-300 outline-none text-sm transition-all py-1 placeholder:text-gray-300"
                                    value={record.reason}
                                    onChange={(e) => updateReason(record.id, e.target.value)}
                                />
                              </td>
                              <td className="px-6 py-4 text-center">
                                <button 
                                    onClick={() => toggleNote(record.id)}
                                    className={cn(
                                      "p-2 rounded-xl transition-all",
                                      record.parentNote ? "bg-emerald-100 text-emerald-600" : "bg-gray-100 text-gray-300 hover:text-gray-400"
                                    )}
                                >
                                    <UserCheck size={18} />
                                </button>
                              </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}
             </div>
          </div>

          <div className="flex justify-end gap-3">
             <button 
              disabled={saving || loading}
              onClick={handleSave}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-10 py-3 rounded-2xl shadow-xl shadow-blue-100 transition-all disabled:opacity-50"
             >
                {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                {saving ? 'Menyimpan...' : 'Simpan & Kirim Notifikasi'}
             </button>
          </div>
        </div>

        {/* Info & Alerts Sidebar */}
        <div className="space-y-6">
           <div className="bg-orange-50 border border-orange-100 p-6 rounded-3xl space-y-4">
              <div className="flex items-center gap-2 text-orange-600">
                 <Bell size={20} />
                 <h3 className="font-bold">Eskalasi Otomatis</h3>
              </div>
              <p className="text-xs text-orange-800 leading-relaxed">
                 Siswa yang terlambat <strong>{threshold} kali</strong> atau lebih dalam satu bulan akan otomatis terdaftar sebagai "Butuh Perhatian" di Dashboard Kepala Sekolah.
              </p>
              <div className="p-4 bg-white/50 rounded-2xl border border-orange-200 text-[11px] text-orange-900 font-medium italic">
                 "Halo Wali Kelas SD - Arka sudah terlambat 3 kali bulan ini. Mohon diskusikan dengan orang tua saat penjemputan hari ini."
              </div>
           </div>

           <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-6">
              <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                 <TrendingUp size={16} className="text-blue-500" />
                 Analisis Pola Keterlambatan
              </h3>
              <div className="space-y-4">
                 <div className="p-4 bg-gray-50 rounded-2xl border border-gray-50 flex items-center justify-between">
                    <div>
                       <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Paling Sering Terlambat</p>
                       <p className="text-sm font-bold text-gray-800">Senin & Jumat</p>
                    </div>
                    <History size={20} className="text-gray-200" />
                 </div>
                 <div className="p-4 bg-gray-50 rounded-2xl border border-gray-50 flex items-center justify-between">
                    <div>
                       <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Rata-rata Menit Terlambat</p>
                       <p className="text-sm font-bold text-gray-800">12 Menit</p>
                    </div>
                    <Clock size={20} className="text-gray-200" />
                 </div>
              </div>
           </div>

           <div className="bg-indigo-600 rounded-3xl p-6 text-white space-y-4 shadow-xl">
              <div className="flex items-center gap-2">
                 <MessageSquare size={18} />
                 <h4 className="font-bold text-sm">Update ke Orang Tua</h4>
              </div>
              <p className="text-xs text-indigo-100 leading-relaxed">
                 Kirim pesan ramah ke orang tua siswa yang terlambat hari ini melalui modul komunikasi Lumina.
              </p>
              <button className="w-full py-2.5 bg-white text-indigo-600 font-black rounded-xl text-[10px] uppercase tracking-wider hover:bg-indigo-50 transition-all flex items-center justify-center gap-2">
                 Kirim Pesan Pendek
                 <ArrowRight size={14} />
              </button>
           </div>
        </div>
      </div>
    </div>
  );
}
