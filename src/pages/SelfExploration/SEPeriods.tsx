import * as React from 'react';
import { 
  Plus, Calendar, Trash2, CheckCircle2, XCircle, 
  ChevronRight, AlertCircle, Clock, Info, Edit, FileText, Check, Settings
} from 'lucide-react';
import { 
  getSEPeriods, saveSEPeriod, toggleSEPeriodActive, deleteSEPeriod, 
  sendNotification, db, getSEReflectionCycles, saveSEReflectionCycle
} from '../../lib/firebase';
import { SEPeriod, SEReflectionCycle } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import { collection, getDocs, query, where, doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';

export default function SEPeriods() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = React.useState<'periods' | 'reflection_cycles'>('periods');
  
  // SE Periods States
  const [periods, setPeriods] = React.useState<SEPeriod[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showModal, setShowModal] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [editingPeriod, setEditingPeriod] = React.useState<SEPeriod | null>(null);

  const [formData, setFormData] = React.useState({
    academicYear: '2026/2027',
    semester: '1' as '1' | '2',
    periodNumber: 1 as 1 | 2,
    label: '',
    startDate: '',
    endDate: '',
    totalSessions: 9,
    planningDeadline: '',
    exhibitionDate: ''
  });

  // SE Cycles States
  const [cycles, setCycles] = React.useState<SEReflectionCycle[]>([]);
  const [cyclesLoading, setCyclesLoading] = React.useState(false);
  const [showCycleModal, setShowCycleModal] = React.useState(false);
  const [cycleSubmitting, setCycleSubmitting] = React.useState(false);
  const [editingCycle, setEditingCycle] = React.useState<SEReflectionCycle | null>(null);
  const [completionCounts, setCompletionCounts] = React.useState<Record<string, { total: number, completed: number }>>({});

  const [cycleFormData, setCycleFormData] = React.useState({
    sePeriodId: '',
    title: '',
    periodKey: '',
    startDate: '',
    dueDate: '',
    eligibleGrades: [7, 8, 9] as number[],
    requiredSlotsGrade7: 2,
    requiredSlotsGrade8: 2,
    requiredSlotsGrade9: 1,
    sentenceStemsIndo: '',
    sentenceStemsEng: '',
    introductoryMessage: ''
  });

  const formatDateToInput = (timestamp: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const fetchPeriods = React.useCallback(async () => {
    const data = await getSEPeriods('JUNIOR_HIGH');
    setPeriods(data || []);
    setLoading(false);
  }, []);

  const fetchCycles = React.useCallback(async () => {
    setCyclesLoading(true);
    try {
      const data = await getSEReflectionCycles();
      setCycles(data || []);
      
      // Fetch counts in background
      if (data && data.length > 0) {
        const counts: Record<string, { total: number, completed: number }> = {};
        for (const item of data) {
          if (item.id) {
            const snap = await getDocs(query(collection(db, 'seMonthlyReflections'), where('reflectionCycleId', '==', item.id)));
            let tot = 0;
            let comp = 0;
            snap.docs.forEach(docSnap => {
              const r = docSnap.data();
              tot++;
              if (r.overallStatus === 'APPROVED' || r.overallStatus === 'SUBMITTED') {
                comp++;
              }
            });
            counts[item.id] = { total: tot, completed: comp };
          }
        }
        setCompletionCounts(counts);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setCyclesLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchPeriods();
    fetchCycles();
  }, [fetchPeriods, fetchCycles]);

  const handleCreateClick = () => {
    setEditingPeriod(null);
    setFormData({
      academicYear: '2026/2027',
      semester: '1',
      periodNumber: 1,
      label: '',
      startDate: '',
      endDate: '',
      totalSessions: 9,
      planningDeadline: '',
      exhibitionDate: ''
    });
    setShowModal(true);
  };

  const handleEditClick = (period: SEPeriod) => {
    setEditingPeriod(period);
    setFormData({
      academicYear: period.academicYear,
      semester: period.semester,
      periodNumber: period.periodNumber,
      label: period.label,
      startDate: formatDateToInput(period.startDate),
      endDate: formatDateToInput(period.endDate),
      totalSessions: period.totalSessions,
      planningDeadline: formatDateToInput(period.planningDeadline),
      exhibitionDate: formatDateToInput(period.exhibitionDate)
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingPeriod) {
        const updatedData = {
          ...editingPeriod,
          academicYear: formData.academicYear,
          semester: formData.semester,
          periodNumber: formData.periodNumber,
          label: formData.label,
          startDate: new Date(formData.startDate).getTime(),
          endDate: new Date(formData.endDate).getTime(),
          totalSessions: formData.totalSessions,
          planningDeadline: new Date(formData.planningDeadline).getTime(),
          exhibitionDate: new Date(formData.exhibitionDate).getTime()
        };
        await setDoc(doc(db, 'sePeriods', editingPeriod.id), updatedData, { merge: true });
        alert("Periode berhasil diperbarui.");
      } else {
        await saveSEPeriod({
          unitId: 'JUNIOR_HIGH',
          academicYear: formData.academicYear,
          semester: formData.semester,
          periodNumber: formData.periodNumber,
          label: formData.label,
          startDate: new Date(formData.startDate).getTime(),
          endDate: new Date(formData.endDate).getTime(),
          totalSessions: formData.totalSessions,
          planningDeadline: new Date(formData.planningDeadline).getTime(),
          exhibitionDate: new Date(formData.exhibitionDate).getTime(),
          isActive: false,
          createdBy: profile?.email || ''
        });
        alert("Periode berhasil dibuat.");
      }
      setShowModal(false);
      setEditingPeriod(null);
      fetchPeriods();
    } catch (err: any) {
      console.error(err);
      alert("Gagal menyimpan periode: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (id: string, current: boolean) => {
    if (!current) {
      if (!confirm("Aktifkan periode ini? Periode lain akan otomatis dinonaktifkan.")) return;
    }
    await toggleSEPeriodActive(id, !current, 'JUNIOR_HIGH');
    
    if (!current) {
      const studentsSnap = await getDocs(query(collection(db, 'users'), where('unitId', '==', 'JUNIOR_HIGH'), where('role', '==', 'STUDENT')));
      studentsSnap.docs.forEach(d => {
        const userData = d.data();
        if (userData.email) {
          sendNotification({
            userId: userData.email,
            type: 'SE_PERIOD_OPEN',
            message: `Periode SE baru telah dibuka! Segera pilih kegiatanmu.`,
            link: '/self-exploration/my'
          });
        }
      });
    }
    
    fetchPeriods();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus periode ini? Tindakan ini tidak dapat dibatalkan.")) return;
    await deleteSEPeriod(id);
    fetchPeriods();
  };

  // SE Reflection Cycle Actions
  const handleCreateCycleClick = () => {
    setEditingCycle(null);
    const activePeriod = periods.find(p => p.isActive);
    setCycleFormData({
      sePeriodId: activePeriod?.id || periods[0]?.id || '',
      title: '',
      periodKey: new Date().toISOString().substring(0, 7), // YYYY-MM
      startDate: '',
      dueDate: '',
      eligibleGrades: [7, 8, 9],
      requiredSlotsGrade7: 2,
      requiredSlotsGrade8: 2,
      requiredSlotsGrade9: 1,
      sentenceStemsIndo: '',
      sentenceStemsEng: '',
      introductoryMessage: ''
    });
    setShowCycleModal(true);
  };

  const handleEditCycleClick = (cycle: SEReflectionCycle) => {
    if (cycle.status !== 'DRAFT') {
      alert("Siklus hanya dapat dikonfigurasi saat status masih DRAFT.");
      return;
    }
    setEditingCycle(cycle);
    setCycleFormData({
      sePeriodId: cycle.sePeriodId,
      title: cycle.title,
      periodKey: cycle.periodKey,
      startDate: cycle.startDate,
      dueDate: cycle.dueDate,
      eligibleGrades: cycle.eligibleGrades,
      requiredSlotsGrade7: cycle.requiredSlotsByGrade[7]?.length || 2,
      requiredSlotsGrade8: cycle.requiredSlotsByGrade[8]?.length || 2,
      requiredSlotsGrade9: cycle.requiredSlotsByGrade[9]?.length || 1,
      sentenceStemsIndo: cycle.sentenceStemsIndo || '',
      sentenceStemsEng: cycle.sentenceStemsEng || '',
      introductoryMessage: cycle.introductoryMessage || ''
    });
    setShowCycleModal(true);
  };

  const handleCycleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cycleFormData.sePeriodId) {
      alert("Pilih Periode SE terlebih dahulu.");
      return;
    }
    const parentPeriod = periods.find(p => p.id === cycleFormData.sePeriodId);
    if (!parentPeriod) {
      alert("Periode induk tidak ditemukan.");
      return;
    }

    setCycleSubmitting(true);
    try {
      const getSlotsArray = (num: number) => {
        if (num === 1) return [1];
        return [1, 2];
      };

      const newCycle: SEReflectionCycle = {
        id: editingCycle?.id,
        sePeriodId: cycleFormData.sePeriodId,
        unit: 'JUNIOR_HIGH',
        academicYear: parentPeriod.academicYear,
        semester: parentPeriod.semester,
        title: cycleFormData.title,
        periodKey: cycleFormData.periodKey,
        startDate: cycleFormData.startDate,
        dueDate: cycleFormData.dueDate,
        status: editingCycle ? editingCycle.status : 'DRAFT',
        eligibleGrades: cycleFormData.eligibleGrades,
        requiredSlotsByGrade: {
          7: getSlotsArray(cycleFormData.requiredSlotsGrade7),
          8: getSlotsArray(cycleFormData.requiredSlotsGrade8),
          9: getSlotsArray(cycleFormData.requiredSlotsGrade9)
        },
        sentenceStemsIndo: cycleFormData.sentenceStemsIndo,
        sentenceStemsEng: cycleFormData.sentenceStemsEng,
        introductoryMessage: cycleFormData.introductoryMessage,
        createdBy: profile?.email || '',
        createdAt: editingCycle ? editingCycle.createdAt : Date.now(),
        updatedAt: Date.now()
      };

      await saveSEReflectionCycle(newCycle);
      alert(editingCycle ? "Siklus refleksi diperbarui!" : "Siklus refleksi berhasil dibuat!");
      setShowCycleModal(false);
      fetchCycles();
    } catch (err: any) {
      alert("Gagal menyimpan siklus: " + err.message);
    } finally {
      setCycleSubmitting(false);
    }
  };

  const handleToggleCycleGrade = (grade: number) => {
    setCycleFormData(prev => {
      const current = prev.eligibleGrades;
      const next = current.includes(grade) 
        ? current.filter(g => g !== grade)
        : [...current, grade].sort();
      return { ...prev, eligibleGrades: next };
    });
  };

  const handleActivateCycle = async (cycle: SEReflectionCycle) => {
    if (!confirm(`Aktifkan siklus "${cycle.title}"? Siklus aktif lain dalam periode, tahun ajaran, semester, dan tingkatan yang sama akan otomatis ditutup.`)) return;
    try {
      // Find all cycles
      const allCycles = await getSEReflectionCycles(cycle.sePeriodId);
      const batchRef = writeBatch(db);
      
      for (const item of allCycles) {
        if (item.id === cycle.id) {
          batchRef.update(doc(db, 'seReflectionCycles', cycle.id), {
            status: 'ACTIVE',
            updatedAt: Date.now()
          });
        } else if (item.status === 'ACTIVE') {
          // Check if there is overlap in eligible grades
          const hasOverlap = item.eligibleGrades.some(g => cycle.eligibleGrades.includes(g));
          if (hasOverlap) {
            batchRef.update(doc(db, 'seReflectionCycles', item.id), {
              status: 'CLOSED',
              updatedAt: Date.now()
            });
          }
        }
      }
      await batchRef.commit();
      alert("Siklus refleksi diaktifkan!");
      fetchCycles();
    } catch (err: any) {
      alert("Gagal mengaktifkan: " + err.message);
    }
  };

  const handleCloseCycle = async (cycleId: string) => {
    if (!confirm("Tutup siklus refleksi ini? Siswa tidak akan dapat membuat/mengirim refleksi baru.")) return;
    try {
      await setDoc(doc(db, 'seReflectionCycles', cycleId), {
        status: 'CLOSED',
        updatedAt: Date.now()
      }, { merge: true });
      alert("Siklus refleksi ditutup.");
      fetchCycles();
    } catch (err: any) {
      alert("Gagal menutup siklus: " + err.message);
    }
  };

  const handleDeleteCycle = async (cycleId: string) => {
    if (!confirm("Hapus siklus ini secara permanen?")) return;
    try {
      const snap = await getDocs(query(collection(db, 'seMonthlyReflections'), where('reflectionCycleId', '==', cycleId)));
      if (!snap.empty) {
        alert("Tidak dapat menghapus siklus karena siswa sudah mulai mengisi/menyimpan refleksi di dalamnya. Harap gunakan status TUTUP (CLOSED) untuk menonaktifkan.");
        return;
      }
      await deleteDoc(doc(db, 'seReflectionCycles', cycleId));
      alert("Siklus refleksi berhasil dihapus.");
      fetchCycles();
    } catch (err: any) {
      alert("Gagal menghapus siklus: " + err.message);
    }
  };

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
           <h1 className="text-3xl font-black text-gray-900 tracking-tight italic uppercase">Konfigurasi Self-Exploration</h1>
           <p className="text-sm text-gray-500 font-medium mt-1">Kelola penjadwalan periode dan siklus refleksi mandiri junior high.</p>
        </div>
        {activeTab === 'periods' ? (
          <button 
            onClick={handleCreateClick}
            className="flex items-center gap-3 bg-blue-600 text-white px-8 py-4 rounded-[2rem] font-black uppercase text-[10px] tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 active:scale-95 animate-fade-in"
          >
            <Plus size={16} /> Buat Periode Baru
          </button>
        ) : (
          <button 
            onClick={handleCreateCycleClick}
            className="flex items-center gap-3 bg-amber-600 text-white px-8 py-4 rounded-[2rem] font-black uppercase text-[10px] tracking-widest hover:bg-amber-700 transition-all shadow-xl shadow-amber-100 active:scale-95 animate-fade-in"
          >
            <Plus size={16} /> Konfigurasi Siklus Refleksi
          </button>
        )}
      </div>

      {/* Tabs Switcher */}
      <div className="flex border-b border-gray-100 pb-1 gap-6">
        <button
          onClick={() => setActiveTab('periods')}
          className={cn(
            "flex items-center gap-2 text-xs font-black uppercase tracking-widest pb-3 px-2 border-b-2 transition-all",
            activeTab === 'periods' ? "border-blue-600 text-blue-600" : "border-transparent text-gray-400 hover:text-gray-600"
          )}
        >
          <Calendar size={14} /> Daftar Periode SE
        </button>
        <button
          onClick={() => setActiveTab('reflection_cycles')}
          className={cn(
            "flex items-center gap-2 text-xs font-black uppercase tracking-widest pb-3 px-2 border-b-2 transition-all",
            activeTab === 'reflection_cycles' ? "border-amber-600 text-amber-600" : "border-transparent text-gray-400 hover:text-gray-600"
          )}
        >
          <FileText size={14} /> Siklus Refleksi SE
        </button>
      </div>

      {/* Content Panels */}
      {activeTab === 'periods' ? (
        <div className="grid grid-cols-1 gap-6">
          {loading ? (
            <div className="p-20 text-center">
              <Clock className="w-12 h-12 text-blue-200 animate-spin mx-auto mb-4" />
              <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Memuat Periode...</p>
            </div>
          ) : periods.length === 0 ? (
            <div className="p-20 bg-gray-50 rounded-[3rem] border-2 border-dashed border-gray-200 text-center">
               <Calendar className="w-16 h-16 text-gray-200 mx-auto mb-6" />
               <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Belum ada periode yang dibuat.</p>
            </div>
          ) : (
            periods.map(period => (
              <div 
                key={period.id}
                className={cn(
                  "group relative bg-white p-8 rounded-[3rem] border-2 transition-all hover:shadow-2xl hover:shadow-gray-100",
                  period.isActive ? "border-blue-600" : "border-gray-50"
                )}
              >
                 {period.isActive && (
                   <div className="absolute -top-4 left-10 bg-blue-600 text-white text-[9px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-lg">
                      Aktif Sekarang
                   </div>
                 )}

                 <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                    <div className="space-y-4 flex-grow">
                       <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                             <Calendar size={24} />
                          </div>
                          <div>
                             <h3 className="text-lg font-black text-gray-900 italic uppercase leading-none">{period.label}</h3>
                             <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mt-1">
                                {period.academicYear} • Semester {period.semester}
                             </p>
                          </div>
                       </div>

                       <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                          <InfoItem icon={<Calendar size={12} />} label="Mulai" value={new Date(period.startDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} />
                          <InfoItem icon={<Calendar size={12} />} label="Selesai" value={new Date(period.endDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} />
                          <InfoItem icon={<Clock size={12} />} label="Sesi" value={`${period.totalSessions} Sesi`} />
                          <InfoItem icon={<AlertCircle size={12} />} label="Deadline Rencana" value={new Date(period.planningDeadline).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} />
                       </div>
                    </div>

                    <div className="flex items-center gap-3 lg:border-l lg:border-gray-100 lg:pl-8 shrink-0">
                       <button 
                          onClick={() => handleToggleActive(period.id, period.isActive)}
                          className={cn(
                            "flex items-center gap-2 px-6 py-3 rounded-2xl font-black uppercase text-[9px] tracking-widest transition-all",
                            period.isActive 
                              ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100" 
                              : "bg-gray-100 text-gray-400 hover:bg-blue-600 hover:text-white"
                          )}
                       >
                          {period.isActive ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                          {period.isActive ? "Aktif" : "Aktifkan"}
                       </button>
                       <button 
                          onClick={() => handleEditClick(period)}
                          className="flex items-center gap-2 px-6 py-3 rounded-2xl font-black uppercase text-[9px] tracking-widest bg-amber-50 text-amber-600 hover:bg-amber-100 transition-all border border-amber-200"
                       >
                          <Edit size={14} />
                          Edit
                       </button>
                       <button 
                          onClick={() => handleDelete(period.id)}
                          className="w-12 h-12 flex items-center justify-center rounded-2xl bg-gray-50 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-all border border-transparent hover:border-red-200"
                       >
                          <Trash2 size={18} />
                       </button>
                    </div>
                 </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {cyclesLoading ? (
            <div className="p-20 text-center">
              <Clock className="w-12 h-12 text-amber-200 animate-spin mx-auto mb-4" />
              <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Memuat Siklus Refleksi...</p>
            </div>
          ) : cycles.length === 0 ? (
            <div className="p-20 bg-gray-50 rounded-[3rem] border-2 border-dashed border-gray-200 text-center">
               <FileText className="w-16 h-16 text-gray-200 mx-auto mb-6" />
               <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Belum ada siklus refleksi yang dibuat.</p>
               <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">Klik tombol di atas untuk membuat konfigurasi penulisan refleksi mandiri siswa.</p>
            </div>
          ) : (
            cycles.map(cycle => {
              const count = completionCounts[cycle.id || ''] || { total: 0, completed: 0 };
              const parentLabel = periods.find(p => p.id === cycle.sePeriodId)?.label || 'Periode SE Induk';
              return (
                <div 
                  key={cycle.id}
                  className={cn(
                    "group relative bg-white p-8 rounded-[3rem] border-2 transition-all hover:shadow-2xl hover:shadow-gray-100",
                    cycle.status === 'ACTIVE' ? "border-amber-500 shadow-xl" : "border-gray-50"
                  )}
                >
                  <div className="absolute top-8 right-8 flex items-center gap-2">
                    <span className={cn(
                      "text-[9px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-sm",
                      cycle.status === 'ACTIVE' ? "bg-emerald-500 text-white" :
                      cycle.status === 'CLOSED' ? "bg-red-500 text-white" : "bg-gray-100 text-gray-500"
                    )}>
                      {cycle.status === 'ACTIVE' ? 'AKTIF' : cycle.status === 'CLOSED' ? 'DITUTUP' : 'DRAFT'}
                    </span>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600">
                        <FileText size={24} />
                      </div>
                      <div>
                        <h3 className="text-lg font-black text-gray-900 italic uppercase leading-none">{cycle.title}</h3>
                        <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mt-1">
                          {cycle.academicYear} • Sem {cycle.semester} • Period Key: {cycle.periodKey}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6 pt-2">
                      <InfoItem icon={<Calendar size={12} />} label="Mulai Pengisian" value={new Date(cycle.startDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })} />
                      <InfoItem icon={<Calendar size={12} />} label="Batas Pengisian (Due)" value={new Date(cycle.dueDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })} />
                      <InfoItem icon={<Settings size={12} />} label="Tingkatan Sasaran" value={`Grade ${cycle.eligibleGrades.join(', ')}`} />
                      <InfoItem icon={<Info size={12} />} label="Aturan Slot Refleksi" value={`Gr 7/8: ${cycle.requiredSlotsByGrade[7]?.length || 2} slot, Gr 9: ${cycle.requiredSlotsByGrade[9]?.length || 1} slot`} />
                      
                      <div className="space-y-1">
                        <span className="flex items-center gap-2 text-[9px] font-black text-gray-400 uppercase tracking-widest">
                          <CheckCircle2 size={12} /> Pengisian Siswa
                        </span>
                        <p className="text-xs font-bold text-gray-700">
                          {count.completed} dikirim / {count.total} total
                        </p>
                      </div>
                    </div>

                    <div className="text-xs text-gray-400 bg-gray-50 p-4 rounded-2xl">
                      <span className="font-bold text-gray-500 uppercase text-[9px] tracking-wider block mb-1">Periode SE Induk:</span>
                      {parentLabel}
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-50">
                      {cycle.status === 'DRAFT' && (
                        <button 
                          onClick={() => handleActivateCycle(cycle)}
                          className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-emerald-600 text-white font-black uppercase text-[9px] tracking-widest hover:bg-emerald-700 transition-all"
                        >
                          <Check size={12} /> Aktifkan Siklus
                        </button>
                      )}
                      
                      {cycle.status === 'ACTIVE' && (
                        <button 
                          onClick={() => handleCloseCycle(cycle.id || '')}
                          className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-red-600 text-white font-black uppercase text-[9px] tracking-widest hover:bg-red-700 transition-all"
                        >
                          <XCircle size={12} /> Tutup Siklus
                        </button>
                      )}

                      {cycle.status === 'DRAFT' && (
                        <button 
                          onClick={() => handleEditCycleClick(cycle)}
                          className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-amber-50 text-amber-600 hover:bg-amber-100 transition-all border border-amber-200 font-black uppercase text-[9px] tracking-widest"
                        >
                          <Edit size={12} /> Edit Config
                        </button>
                      )}

                      <button 
                        onClick={() => handleDeleteCycle(cycle.id || '')}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-gray-50 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-all border border-transparent font-black uppercase text-[9px] tracking-widest"
                      >
                        <Trash2 size={12} /> Hapus
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Period Modal (Existing) */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => setShowModal(false)}
               className="absolute inset-0 bg-gray-900/40 backdrop-blur-md"
            />
            <motion.div 
               initial={{ opacity: 0, scale: 0.95, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.95, y: 20 }}
               className="relative w-full max-w-2xl bg-white rounded-[3rem] shadow-2xl overflow-hidden"
            >
               <div className="p-10 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-black text-gray-900 uppercase italic tracking-tight">
                      {editingPeriod ? 'Edit Periode SE' : 'Buat Periode Baru'}
                    </h2>
                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mt-1">
                      {editingPeriod ? 'Perbarui parameter jadwal SE' : 'Input parameter jadwal SE'}
                    </p>
                  </div>
                  <button onClick={() => setShowModal(false)} className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-white transition-all text-gray-400">
                     <Plus size={24} className="rotate-45" />
                  </button>
               </div>

               <form onSubmit={handleSubmit} className="p-10 space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <FormField label="Tahun Akademik">
                       <input 
                         type="text" 
                         value={formData.academicYear}
                         onChange={e => setFormData({...formData, academicYear: e.target.value})}
                         className="w-full h-14 px-6 bg-gray-50 rounded-2xl border-none font-bold focus:ring-2 focus:ring-blue-600 transition-all"
                         required
                       />
                    </FormField>
                    <FormField label="Semester">
                       <select 
                         value={formData.semester}
                         onChange={e => setFormData({...formData, semester: e.target.value as '1' | '2'})}
                         className="w-full h-14 px-6 bg-gray-50 rounded-2xl border-none font-bold focus:ring-2 focus:ring-blue-600 transition-all"
                       >
                         <option value="1">Semester 1</option>
                         <option value="2">Semester 2</option>
                       </select>
                    </FormField>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <FormField label="Nomor Periode (1 atau 2)">
                       <select 
                         value={formData.periodNumber}
                         onChange={e => setFormData({...formData, periodNumber: parseInt(e.target.value) as 1 | 2})}
                         className="w-full h-14 px-6 bg-gray-50 rounded-2xl border-none font-bold focus:ring-2 focus:ring-blue-600 transition-all"
                       >
                         <option value={1}>Periode 1</option>
                         <option value={2}>Periode 2</option>
                       </select>
                    </FormField>
                    <FormField label="Total Sesi">
                       <input 
                         type="number" 
                         value={formData.totalSessions}
                         onChange={e => setFormData({...formData, totalSessions: parseInt(e.target.value)})}
                         className="w-full h-14 px-6 bg-gray-50 rounded-2xl border-none font-bold focus:ring-2 focus:ring-blue-600 transition-all"
                         min="1"
                       />
                    </FormField>
                  </div>

                  <FormField label="Nama Label Periode">
                     <input 
                       type="text" 
                       placeholder="Contoh: Periode 1 — Juli s.d. September 2025"
                       value={formData.label}
                       onChange={e => setFormData({...formData, label: e.target.value})}
                       className="w-full h-14 px-6 bg-gray-50 rounded-2xl border-none font-bold focus:ring-2 focus:ring-blue-600 transition-all"
                       required
                     />
                  </FormField>

                  <div className="grid grid-cols-2 gap-6">
                    <FormField label="Tanggal Mulai">
                       <input type="date" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} className="w-full h-14 px-6 bg-gray-50 rounded-2xl border-none font-bold focus:ring-2 focus:ring-blue-600" required />
                    </FormField>
                    <FormField label="Tanggal Selesai">
                       <input type="date" value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})} className="w-full h-14 px-6 bg-gray-50 rounded-2xl border-none font-bold focus:ring-2 focus:ring-blue-600" required />
                    </FormField>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <FormField label="Deadline Perencanaan">
                       <input type="date" value={formData.planningDeadline} onChange={e => setFormData({...formData, planningDeadline: e.target.value})} className="w-full h-14 px-6 bg-gray-50 rounded-2xl border-none font-bold focus:ring-2 focus:ring-blue-600" required />
                    </FormField>
                    <FormField label="Tanggal Exhibition">
                       <input type="date" value={formData.exhibitionDate} onChange={e => setFormData({...formData, exhibitionDate: e.target.value})} className="w-full h-14 px-6 bg-gray-50 rounded-2xl border-none font-bold focus:ring-2 focus:ring-blue-600" required />
                    </FormField>
                  </div>

                  <button 
                    disabled={submitting}
                    className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest translate-y-2 hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 disabled:opacity-50"
                  >
                    {submitting ? 'Menyimpan...' : (editingPeriod ? 'Simpan Perubahan' : 'Simpan Periode Baru')}
                  </button>
               </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Cycle Configuration Modal */}
      <AnimatePresence>
        {showCycleModal && (
          <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 overflow-y-auto">
            <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => setShowCycleModal(false)}
               className="absolute inset-0 bg-gray-900/40 backdrop-blur-md"
            />
            <motion.div 
               initial={{ opacity: 0, scale: 0.95, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.95, y: 20 }}
               className="relative w-full max-w-3xl bg-white rounded-[3rem] shadow-2xl overflow-hidden my-8"
            >
               <div className="p-8 bg-amber-50/50 border-b border-amber-100 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-black text-gray-900 uppercase italic tracking-tight">
                      {editingCycle ? 'Edit Siklus Refleksi SE' : 'Buat Siklus Refleksi Baru'}
                    </h2>
                    <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest mt-1">
                      {editingCycle ? 'Konfigurasi paramater siklus penulisan' : 'Konfigurasi parameter penulisan baru'}
                    </p>
                  </div>
                  <button onClick={() => setShowCycleModal(false)} className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-white transition-all text-gray-400">
                     <Plus size={24} className="rotate-45" />
                  </button>
               </div>

               <form onSubmit={handleCycleSubmit} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
                  <FormField label="Periode SE Induk (Menentukan Tahun Ajaran & Semester)">
                    <select 
                      value={cycleFormData.sePeriodId}
                      onChange={e => setCycleFormData({...cycleFormData, sePeriodId: e.target.value})}
                      className="w-full h-14 px-6 bg-gray-50 rounded-2xl border-none font-bold focus:ring-2 focus:ring-amber-600 transition-all"
                      required
                    >
                      {periods.map(p => (
                        <option key={p.id} value={p.id}>{p.label} ({p.academicYear} Sem {p.semester})</option>
                      ))}
                    </select>
                  </FormField>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField label="Judul Siklus Refleksi">
                      <input 
                        type="text" 
                        placeholder="Contoh: Refleksi Self-Exploration Agustus 2026"
                        value={cycleFormData.title}
                        onChange={e => setCycleFormData({...cycleFormData, title: e.target.value})}
                        className="w-full h-14 px-6 bg-gray-50 rounded-2xl border-none font-bold focus:ring-2 focus:ring-amber-600 transition-all"
                        required
                      />
                    </FormField>

                    <FormField label="Period Key (Misal: 2026-08)">
                      <input 
                        type="text" 
                        placeholder="Contoh: 2026-08"
                        value={cycleFormData.periodKey}
                        onChange={e => setCycleFormData({...cycleFormData, periodKey: e.target.value})}
                        className="w-full h-14 px-6 bg-gray-50 rounded-2xl border-none font-bold focus:ring-2 focus:ring-amber-600 transition-all"
                        required
                      />
                    </FormField>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField label="Tanggal Mulai Pengisian">
                      <input type="date" value={cycleFormData.startDate} onChange={e => setCycleFormData({...cycleFormData, startDate: e.target.value})} className="w-full h-14 px-6 bg-gray-50 rounded-2xl border-none font-bold focus:ring-2 focus:ring-amber-600" required />
                    </FormField>
                    <FormField label="Tanggal Batas Pengisian (Due)">
                      <input type="date" value={cycleFormData.dueDate} onChange={e => setCycleFormData({...cycleFormData, dueDate: e.target.value})} className="w-full h-14 px-6 bg-gray-50 rounded-2xl border-none font-bold focus:ring-2 focus:ring-amber-600" required />
                    </FormField>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Tingkatan Sasaran (Eligible Grades)</label>
                    <div className="flex gap-4">
                      {[7, 8, 9].map(grade => (
                        <button
                          type="button"
                          key={grade}
                          onClick={() => handleToggleCycleGrade(grade)}
                          className={cn(
                            "px-6 py-3 rounded-xl font-bold transition-all border",
                            cycleFormData.eligibleGrades.includes(grade)
                              ? "bg-amber-600 text-white border-transparent shadow-md"
                              : "bg-gray-50 text-gray-500 border-gray-100 hover:bg-gray-100"
                          )}
                        >
                          Grade {grade}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4 bg-gray-50 p-6 rounded-[2rem] border border-gray-100">
                    <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest leading-none mb-2">Konfigurasi Aturan Slot Per Tingkatan</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <FormField label="Slot Wajib Grade 7">
                        <select 
                          value={cycleFormData.requiredSlotsGrade7}
                          onChange={e => setCycleFormData({...cycleFormData, requiredSlotsGrade7: parseInt(e.target.value)})}
                          className="w-full h-12 px-4 bg-white rounded-xl border-none font-bold focus:ring-2 focus:ring-amber-600"
                        >
                          <option value={1}>1 Slot</option>
                          <option value={2}>2 Slot</option>
                        </select>
                      </FormField>

                      <FormField label="Slot Wajib Grade 8">
                        <select 
                          value={cycleFormData.requiredSlotsGrade8}
                          onChange={e => setCycleFormData({...cycleFormData, requiredSlotsGrade8: parseInt(e.target.value)})}
                          className="w-full h-12 px-4 bg-white rounded-xl border-none font-bold focus:ring-2 focus:ring-amber-600"
                        >
                          <option value={1}>1 Slot</option>
                          <option value={2}>2 Slot</option>
                        </select>
                      </FormField>

                      <FormField label="Slot Wajib Grade 9">
                        <select 
                          value={cycleFormData.requiredSlotsGrade9}
                          onChange={e => setCycleFormData({...cycleFormData, requiredSlotsGrade9: parseInt(e.target.value)})}
                          className="w-full h-12 px-4 bg-white rounded-xl border-none font-bold focus:ring-2 focus:ring-amber-600"
                        >
                          <option value={1}>1 Slot</option>
                          <option value={2}>2 Slot</option>
                        </select>
                      </FormField>
                    </div>
                  </div>

                  <FormField label="Pesan Pengantar / Arahan (Optional)">
                    <textarea 
                      placeholder="Masukkan panduan pengisian refleksi bagi siswa di sini..."
                      value={cycleFormData.introductoryMessage}
                      onChange={e => setCycleFormData({...cycleFormData, introductoryMessage: e.target.value})}
                      className="w-full min-h-[80px] p-4 bg-gray-50 rounded-2xl border-none font-bold focus:ring-2 focus:ring-amber-600 transition-all text-sm"
                    />
                  </FormField>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField label="Sentence Stems - Bahasa Indonesia (Optional)">
                      <textarea 
                        placeholder="Contoh: Saya merasa bangga karena... / Hambatan yang saya temukan..."
                        value={cycleFormData.sentenceStemsIndo}
                        onChange={e => setCycleFormData({...cycleFormData, sentenceStemsIndo: e.target.value})}
                        className="w-full min-h-[120px] p-4 bg-gray-50 rounded-2xl border-none font-medium focus:ring-2 focus:ring-amber-600 transition-all text-xs"
                      />
                    </FormField>

                    <FormField label="Sentence Stems - English (Optional)">
                      <textarea 
                        placeholder="Example: I feel proud because... / The challenges I encountered was..."
                        value={cycleFormData.sentenceStemsEng}
                        onChange={e => setCycleFormData({...cycleFormData, sentenceStemsEng: e.target.value})}
                        className="w-full min-h-[120px] p-4 bg-gray-50 rounded-2xl border-none font-medium focus:ring-2 focus:ring-amber-600 transition-all text-xs"
                      />
                    </FormField>
                  </div>

                  <button 
                    disabled={cycleSubmitting}
                    className="w-full py-5 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl font-black uppercase text-xs tracking-widest translate-y-2 transition-all shadow-xl shadow-amber-100 disabled:opacity-50"
                  >
                    {cycleSubmitting ? 'Menyimpan...' : (editingCycle ? 'Simpan Perubahan' : 'Buat Siklus Baru')}
                  </button>
               </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FormField({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{label}</label>
      {children}
    </div>
  );
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode, label: string, value: string }) {
  return (
    <div className="space-y-1">
       <span className="flex items-center gap-2 text-[9px] font-black text-gray-400 uppercase tracking-widest">
          {icon} {label}
       </span>
       <p className="text-xs font-bold text-gray-700">{value}</p>
    </div>
  );
}
