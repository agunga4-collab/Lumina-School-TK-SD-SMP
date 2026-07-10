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

  return (
    <div className="max-w-5xl mx-auto space-y-4 pb-12 animate-in fade-in duration-500">
      
      {/* Header Banner: More Compact */}
      <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-2xl -mr-16 -mt-16 pointer-events-none" />
        
        <div className="space-y-1.5 z-10">
          <div className="flex items-center gap-2">
             <div className="w-7 h-7 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600">
                <Users size={14} />
             </div>
             <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Koneksi Ortu</span>
          </div>
          <h1 className="text-lg font-extrabold tracking-tight text-gray-900 leading-none uppercase">
            Data Siswa & <span className="text-emerald-600 italic">Koneksi Ortu</span>
          </h1>
          <p className="text-xs text-gray-400 font-bold max-w-xl">
            Sistem verifikasi mandiri orang tua untuk memantau dan menyambungkan akun Anda dengan data siswa ananda secara real-time.
          </p>
        </div>

        <button
          onClick={() => {
            setRefreshTrigger(p => p + 1);
            toast.success("Daftar terhubung disinkronkan langsung!");
          }}
          className="flex items-center gap-1.5 px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shrink-0 border border-gray-100"
        >
          <RefreshCw size={12} className={cn(loading && "animate-spin")} />
          Sinkronkan
        </button>
      </div>

      <div className="max-w-3xl mx-auto space-y-4">
        
        {/* Linked Students Section */}
        <div className="space-y-3">
          <div className="flex justify-between items-center px-1">
            <h2 className="text-sm font-extrabold text-gray-900 uppercase tracking-wider">
              Ananda Yang Terhubung ({linkedStudents.length})
            </h2>
          </div>

          {loading ? (
            <div className="p-10 bg-white rounded-2xl border border-gray-150 flex flex-col items-center justify-center space-y-2 shadow-sm">
              <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
              <p className="text-gray-400 text-xs font-bold">Mengambil data relasi dari cloud...</p>
            </div>
          ) : linkedStudents.length > 0 ? (
            <div className="space-y-3">
              {linkedStudents.map((child) => (
                <div 
                  key={child.id}
                  className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm relative overflow-hidden hover:border-emerald-200 transition-all group"
                >
                  <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/5 rounded-full blur-xl pointer-events-none group-hover:scale-110 transition-transform" />

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 font-extrabold text-base">
                        {child.name ? child.name[0].toUpperCase() : 'A'}
                      </div>
                      <div>
                        <h3 className="text-base font-extrabold text-gray-900 leading-tight">
                          {child.name || child.fullName}
                        </h3>
                        <p className="text-[10px] text-gray-400 font-semibold uppercase mt-0.5">NIS: {child.id}</p>
                      </div>
                    </div>

                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider text-emerald-600 bg-emerald-50 border border-emerald-100 w-fit">
                      <CheckCircle size={10} /> Terhubung
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 py-3 text-xs">
                    <div className="p-3 bg-gray-50/50 rounded-xl border border-gray-100">
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Unit Sekolah</p>
                      <p className="font-extrabold text-gray-800 mt-0.5">
                        {child.unitId || child.currentUnit || "Tidak Ditentukan"}
                      </p>
                    </div>
                    <div className="p-3 bg-gray-50/50 rounded-xl border border-gray-100">
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Kelas / Rombel</p>
                      <p className="font-extrabold text-gray-800 mt-0.5">
                        {child.classId || "Belum Ditentukan"}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
                    <Link
                      to={`/parent/reports?studentId=${child.id}`}
                      className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 hover:bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
                    >
                      Buka Rapor Ananda
                      <ChevronRight size={12} />
                    </Link>

                    <button
                      disabled={linkingInProgress}
                      onClick={() => handleDisconnectStudent(child.id, child.name || '')}
                      className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100/50 px-4 py-2 rounded-xl transition-all cursor-pointer"
                    >
                      <Trash2 size={12} />
                      Putus Sambungan
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 bg-amber-50/50 border border-amber-100 rounded-2xl text-center space-y-4">
              <div className="w-12 h-12 bg-amber-100/60 rounded-xl flex items-center justify-center mx-auto text-amber-600">
                <AlertTriangle size={24} />
              </div>
              <div className="space-y-3">
                <h3 className="text-sm font-extrabold text-amber-900 uppercase tracking-wide">Belum Ada Siswa Terkoneksi</h3>
                <p className="text-amber-700/80 font-bold max-w-md mx-auto leading-relaxed text-xs">
                  Akun email Anda ({currentUser?.email || 'N/A'}) belum memiliki data murid yang terhubung di sistem mandiri.
                </p>
                <div className="p-4 bg-white border border-amber-150 rounded-xl text-left text-[11px] text-amber-800 font-medium max-w-md mx-auto space-y-1.5 leading-relaxed">
                  <p className="font-extrabold">👉 Hubungan Akun:</p>
                  <p>1. Pastikan Anda login dengan email yang terdaftar resmi di sekolah.</p>
                  <p>2. Jika data murid tidak muncul, segera hubungi Wali Kelas atau Tata Usaha untuk melingkar data murid ke email Anda.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
