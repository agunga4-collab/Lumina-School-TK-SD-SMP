import * as React from 'react';
import { motion } from 'motion/react';
import { 
  Users, UserPlus, CheckCircle, 
  Trash2, AlertTriangle, ChevronRight, School,
  Sparkles, Loader2, RefreshCw, GraduationCap, Info, HelpCircle
} from 'lucide-react';
import { useOutletContext, Link, useNavigate } from 'react-router-dom';
import { 
  User as AppUser, 
  Student, 
  ParentStudentLink 
} from '../../types';
import { 
  getParentStudentLinks,
  getStudentById,
  db
} from '../../lib/firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc 
} from 'firebase/firestore';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';

export default function ParentStudents() {
  const { currentUser } = useOutletContext<{ currentUser: AppUser }>();
  const navigate = useNavigate();

  const [linkedStudents, setLinkedStudents] = React.useState<Student[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [linkingInProgress, setLinkingInProgress] = React.useState(false);
  const [refreshTrigger, setRefreshTrigger] = React.useState(0);

  // Link child via manual form
  const [manualId, setManualId] = React.useState('');

  // Fetch current parent linkages (fully synchronized)
  React.useEffect(() => {
    const fetchLinkedStudents = async () => {
      if (!currentUser?.email) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const linkData = await getParentStudentLinks(currentUser.email);
        
        let fetchedIds: string[] = [];
        if (linkData && linkData.studentIds) {
          fetchedIds = [...linkData.studentIds];
        }
        
        // Also combine with currentUser.linkedStudents
        if (currentUser.linkedStudents && Array.isArray(currentUser.linkedStudents)) {
          fetchedIds = [...fetchedIds, ...currentUser.linkedStudents];
        }

        const uniqueIds = Array.from(new Set(fetchedIds.filter(Boolean)));

        if (uniqueIds.length > 0) {
          const promises = uniqueIds.map(id => getStudentById(id));
          const results = await Promise.all(promises);
          const valid = results.filter(s => s !== null) as Student[];
          
          // Deduplicate
          const map = new Map<string, Student>();
          valid.forEach(s => {
            const sid = (s as any).luminaId || s.id;
            map.set(sid, { ...s, id: sid });
          });
          setLinkedStudents(Array.from(map.values()));
        } else {
          setLinkedStudents([]);
        }
      } catch (err) {
        console.error("Gagal memuat siswa terhubung:", err);
        toast.error("Gagal mendapatkan daftar siswa terhubung.");
      } finally {
        setLoading(false);
      }
    };

    fetchLinkedStudents();
  }, [currentUser, refreshTrigger]);

  // Function to attach student link to parent account
  const handleConnectStudent = async (student: Student) => {
    if (!currentUser?.email) {
      toast.error("Format email pengguna tidak valid.");
      return;
    }
    const targetStudentId = (student as any).luminaId || student.id;

    try {
      // 1. Get existing links for email
      const linkData = await getParentStudentLinks(currentUser.email);
      const currentIds = linkData?.studentIds || [];
      const updatedIds = Array.from(new Set([...currentIds, targetStudentId]));

      const isAlreadyLinked = linkedStudents.some(s => s.id === targetStudentId || (s as any).luminaId === targetStudentId);
      if (isAlreadyLinked) {
        toast.info(`Ananda ${student.name || 'Siswa'} sudah terhubung.`);
        return;
      }

      const emailKey = currentUser.email.toLowerCase().trim();

      // 2. Save/Update parentStudentLinks document
      await setDoc(doc(db, 'parentStudentLinks', emailKey), {
        parentId: emailKey,
        studentIds: updatedIds,
        createdAt: Date.now(),
        createdBy: 'parent_self_service_link'
      });

      // 3. Try to update current user document if available
      try {
        const userRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userRef, {
          linkedStudents: Array.from(new Set([...(currentUser.linkedStudents || []), targetStudentId]))
        });
      } catch (userErr) {
        console.warn("Could not write inside /users profile directly:", userErr);
      }

      toast.success(`Selamat! Akun Anda berhasil terhubung dengan ${student.name || 'Ananda'}! 🎉`);
      setManualId('');
      setRefreshTrigger(prev => prev + 1);
      
      // Dispatch layout event to notify layout context to reload
      window.dispatchEvent(new Event('parent_student_linked_changed'));
    } catch (err: any) {
      console.error("Gagal menghubungkan siswa:", err);
      toast.error(`Koneksi gagal: ${err.message}`);
    }
  };

  // Function to disconnect/remove a student link
  const handleDisconnectStudent = async (studentId: string, studentName: string) => {
    if (!currentUser?.email) {
      toast.error("Format email pengguna tidak valid.");
      return;
    }
    if (window.confirm(`Apakah Anda yakin ingin melepas sambungan dengan ${studentName}?`)) {
      setLinkingInProgress(true);
      try {
        const linkData = await getParentStudentLinks(currentUser.email);
        const currentIds = linkData?.studentIds || [];
        const updatedIds = currentIds.filter(id => id !== studentId);

        const emailKey = currentUser.email.toLowerCase().trim();

        // Update parentStudentLinks
        await setDoc(doc(db, 'parentStudentLinks', emailKey), {
          parentId: emailKey,
          studentIds: updatedIds,
          createdAt: Date.now(),
          createdBy: 'parent_self_service_unlink'
        });

        // Update user profile
        try {
          const userRef = doc(db, 'users', currentUser.uid);
          await updateDoc(userRef, {
            linkedStudents: (currentUser.linkedStudents || []).filter(id => id !== studentId)
          });
        } catch (userErr) {
          console.warn("Could not clear user linked uid profile directly:", userErr);
        }

        toast.success(`Sambungan dengan ${studentName} berhasil dilepas.`);
        setRefreshTrigger(prev => prev + 1);
        window.dispatchEvent(new Event('parent_student_linked_changed'));
      } catch (err: any) {
        console.error("Gagal melepas sambungan:", err);
        toast.error(`Gagal melepas sambungan: ${err.message}`);
      } finally {
        setLinkingInProgress(false);
      }
    }
  };

  // Manual link submit via Direct ID Lookup
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = manualId.trim();
    if (!cleanId) return;

    setLinkingInProgress(true);
    try {
      const student = await getStudentById(cleanId);
      if (student) {
        // Double check if already linked
        const isAlreadyLinked = linkedStudents.some(s => s.id === student.id || (s as any).luminaId === student.id);
        if (isAlreadyLinked) {
          toast.info(`Ananda ${student.name || 'Siswa'} sudah terhubung dengan akun Anda.`);
          setManualId('');
          return;
        }

        await handleConnectStudent(student);
      } else {
        toast.error(`Siswa dengan NIS/Lumina ID "${cleanId}" tidak ditemukan. Pastikan karakter, format, dan tanda hubung sudah sesuai.`);
      }
    } catch (err: any) {
      console.error("Error looking up student:", err);
      toast.error("Terjadi kesalahan saat memverifikasi NIS siswa.");
    } finally {
      setLinkingInProgress(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-12 pb-24 animate-in fade-in duration-500">
      
      {/* Header Banner */}
      <div className="bg-white p-12 rounded-[3.5rem] border border-gray-100 shadow-sm relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
        
        <div className="space-y-4">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
                <Users size={20} />
             </div>
             <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">Validasi Hubungan Anak</span>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 leading-none">
            DATA SISWA & <span className="text-emerald-600 uppercase italic">KONEKSI ORTU</span>
          </h1>
          <p className="text-gray-400 font-bold max-w-xl">
            Sistem mandiri orang tua untuk memantau, memverifikasi, dan menghubungkan akun Anda langsung dengan data siswa ananda secara real-time.
          </p>
        </div>

        <button
          onClick={() => {
            setRefreshTrigger(p => p + 1);
            toast.success("Daftar terhubung disinkronkan langsung!");
          }}
          className="flex items-center gap-2 px-6 py-3.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-2xl text-xs font-black uppercase tracking-widest transition-all"
        >
          <RefreshCw size={14} className={cn(loading && "animate-spin")} />
          Sinkronkan
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Linked Students (List) */}
        <div className="lg:col-span-7 space-y-8">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-black text-gray-900 uppercase italic tracking-tighter">
              Ananda Yang Terhubung ({linkedStudents.length})
            </h2>
          </div>

          {loading ? (
            <div className="p-16 bg-white rounded-[3rem] border border-gray-50 flex flex-col items-center justify-center space-y-4 shadow-sm">
              <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" />
              <p className="text-gray-400 text-sm font-bold">Mengambil data relasi dari cloud...</p>
            </div>
          ) : linkedStudents.length > 0 ? (
            <div className="space-y-6">
              {linkedStudents.map((child) => (
                <div 
                  key={child.id}
                  className="bg-white border border-gray-100 rounded-[2.5rem] p-8 shadow-sm relative overflow-hidden hover:shadow-xl hover:shadow-emerald-500/5 transition-all group"
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none group-hover:scale-125 transition-transform" />

                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-gray-50">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 font-extrabold text-xl">
                        {child.name ? child.name[0].toUpperCase() : 'A'}
                      </div>
                      <div>
                        <h3 className="text-xl font-extrabold text-gray-900 leading-tight">
                          {child.name || child.fullName}
                        </h3>
                        <p className="text-xs text-gray-400 font-semibold uppercase mt-0.5">NIS: {child.id}</p>
                      </div>
                    </div>

                    <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 border border-emerald-100 w-fit">
                      <CheckCircle size={12} /> Terhubung
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 py-6 text-sm">
                    <div className="p-4 bg-gray-50/50 rounded-2xl">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Unit Sekolah</p>
                      <p className="font-extrabold text-gray-800 mt-0.5">
                        {child.unitId || child.currentUnit || "Tidak Ditentukan"}
                      </p>
                    </div>
                    <div className="p-4 bg-gray-50/50 rounded-2xl">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Kelas / Rombel</p>
                      <p className="font-extrabold text-gray-800 mt-0.5">
                        {child.classId || "Belum Ditentukan"}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4 pt-4">
                    <Link
                      to={`/parent/reports?studentId=${child.id}`}
                      className="flex items-center gap-2 px-6 py-3 bg-gray-900 hover:bg-emerald-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all"
                    >
                      Buka Rapor Ananda
                      <ChevronRight size={14} />
                    </Link>

                    <button
                      disabled={linkingInProgress}
                      onClick={() => handleDisconnectStudent(child.id, child.name || '')}
                      className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100/50 px-5 py-3 rounded-2xl transition-all"
                    >
                      <Trash2 size={14} />
                      Putus Sambungan
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-16 bg-amber-50/50 border border-amber-100 rounded-[3rem] text-center space-y-6">
              <div className="w-20 h-20 bg-amber-100/60 rounded-[2rem] flex items-center justify-center mx-auto text-amber-600 animate-bounce">
                <AlertTriangle size={36} />
              </div>
              <div className="space-y-4">
                <h3 className="text-xl font-black text-amber-900 uppercase tracking-wide">Belum Ada Siswa Terkoneksi</h3>
                <p className="text-amber-700/80 font-bold max-w-md mx-auto leading-relaxed text-sm">
                  Akun email Anda ({currentUser?.email || 'N/A'}) belum memiliki data murid yang terhubung di sistem mandiri.
                </p>
                <div className="p-5 bg-white border border-amber-200 rounded-2xl text-xs text-amber-800 font-medium max-w-md mx-auto space-y-1">
                  <p className="font-bold">👉 Cara menyambungkan akun:</p>
                  <p>Masukkan Nomor Induk Siswa (NIS / ID) ananda pada kolom "Hubungkan dengan NIS" di panel sebelah kanan.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Connection Form & Privacy Instructions */}
        <div className="lg:col-span-5 space-y-8">
          
          {/* Quick Connect Manual ID Option */}
          <div className="bg-white border border-gray-100 p-8 rounded-[3rem] shadow-sm space-y-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl pointer-events-none" />
            
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                <Sparkles size={18} />
              </div>
              <div>
                <h3 className="text-lg font-black uppercase tracking-tight text-gray-900 leading-none">Hubungkan dengan NIS</h3>
                <p className="text-xs text-gray-400 font-bold mt-1">Gunakan Nomor Induk Siswa langsung</p>
              </div>
            </div>

            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Nomor Induk Siswa (NIS/ID)</label>
                <input
                  type="text"
                  placeholder="Contoh: LMN-1780736085523-000"
                  value={manualId}
                  onChange={(e) => setManualId(e.target.value)}
                  className="w-full px-5 py-4 bg-gray-50 border border-gray-100 focus:bg-white focus:ring-2 focus:ring-emerald-500 rounded-2xl text-sm font-medium outline-none transition-all placeholder:text-gray-400"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={linkingInProgress || !manualId.trim()}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50 shadow-md shadow-emerald-600/10"
              >
                {linkingInProgress ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <UserPlus size={16} />
                )}
                Hubungkan Sekarang
              </button>
            </form>
          </div>

          {/* Secure & Privacy Infobox */}
          <div className="bg-white border border-gray-100 p-8 rounded-[3rem] shadow-sm space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-50 text-emerald-600 rounded-2xl flex items-center justify-center">
                <Info size={18} />
              </div>
              <h3 className="text-md font-black uppercase tracking-tight text-gray-900">
                Kebijakan Privasi
              </h3>
            </div>

            <div className="space-y-4 text-xs font-medium text-gray-500 leading-relaxed">
              <p>
                Untuk alasan **keamanan dan perlindungan privasi data murid**, sistem kami melarang pencarian publik atau daftar direktori bebas data siswa di portal orang tua.
              </p>
              <div className="p-4 bg-gray-50 rounded-2xl space-y-2 text-[11px]">
                <p className="font-extrabold text-gray-700 flex items-center gap-1">
                  <HelpCircle size={14} className="text-emerald-600" /> Di mana menemukan NIS/Lumina ID?
                </p>
                <ul className="list-disc pl-4 space-y-1 text-gray-500 font-medium">
                  <li>Dicetak pada lembar sampul/identitas **Rapor Cetak** ananda.</li>
                  <li>Tercantum pada kartu pelajar atau invoice pembayaran sekolah.</li>
                  <li>Dapat ditanyakan langsung secara privat ke **Wali Kelas** atau tata usaha sekolah.</li>
                </ul>
              </div>
              <p className="text-[10px] text-gray-400 border-t border-gray-50 pt-3">
                Keamanan data siswa adalah prioritas utama kami. Terima kasih atas pengertian dan kolaborasi Anda.
              </p>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}
