import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Search, Filter, Trash2, Edit2, Archive, CheckCircle2, 
  X, Loader2, BookOpen, ChevronRight, AlertCircle, RefreshCw,
  FileSpreadsheet, Cloud
} from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { toast } from 'sonner';
import { 
  getLearningGoals, addLearningGoal, updateLearningGoal, 
  deleteLearningGoal, getLearningGoalCountBySubject 
} from '../../lib/firebase';
import { LearningGoal, User, UnitType } from '../../types';
import { cn } from '../../lib/utils';
import { ACADEMIC_SUBJECTS, ACADEMIC_GRADES, ACADEMIC_YEARS } from '../../constants';
import {
  getLGGrades,
  isLGForGrade,
  formatLGGradesLabel,
  countActiveAssessmentsForLGInGrades
} from '../../services/juniorHighAssessmentBookService';
import {
  JH_SUBJECT_CATALOG,
  getJHSubjectLabel,
  findCatalogEntry,
  isSameJHSubject
} from '../../constants/juniorHighSubjectCatalog';

export default function LearningGoalsPage() {
  const { currentUser, activeUnit } = useOutletContext<{ currentUser: User, activeUnit: UnitType }>();
  const isJHPortal = activeUnit === 'JUNIOR_HIGH';

  const [lgs, setLgs] = React.useState<LearningGoal[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchTerm, setSearchTerm] = React.useState('');
  
  const { activeYear } = useAcademicYear();
  
  // Filters: Jika unit portal adalah JUNIOR_HIGH, kunci selalu ke JUNIOR_HIGH
  const [filterUnit, setFilterUnit] = React.useState<string>(() => {
    if (activeUnit === 'JUNIOR_HIGH') return 'JUNIOR_HIGH';
    return currentUser.role === 'SUPER_ADMIN' ? 'ELEMENTARY' : (activeUnit || 'ELEMENTARY');
  });
  const [filterGrade, setFilterGrade] = React.useState<string>('ALL');
  const [filterSubject, setFilterSubject] = React.useState<string>('ALL');
  const [filterYear, setFilterYear] = React.useState<string>(activeYear || '2025/2026');
  const [filterActive, setFilterActive] = React.useState<string>('ALL');

  const effectiveFilterUnit = isJHPortal ? 'JUNIOR_HIGH' : filterUnit;

  // Loading states for actions
  const [exportingId, setExportingId] = React.useState<string | null>(null);
  const [backingUpId, setBackingUpId] = React.useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [formLoading, setFormLoading] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [modalSubjectKey, setModalSubjectKey] = React.useState<string>('');
  const [modalCustomSubject, setModalCustomSubject] = React.useState<string>('');
  const [selectedGrades, setSelectedGrades] = React.useState<string[]>(['7']);
  const [originalGrades, setOriginalGrades] = React.useState<string[]>([]);

  const [formData, setFormData] = React.useState({
    unitId: (isJHPortal ? 'JUNIOR_HIGH' : (currentUser.role === 'SUPER_ADMIN' ? 'ELEMENTARY' : activeUnit || 'ELEMENTARY')) as any,
    grade: '',
    subject: '',
    strand: '',
    goalText: '',
    academicYear: activeYear || '2025/2026',
    isActive: true
  });

  React.useEffect(() => {
    if (activeYear) {
      setFilterYear(activeYear);
      setFormData(prev => ({ ...prev, academicYear: activeYear }));
    }
  }, [activeYear]);

  React.useEffect(() => {
    if (isJHPortal) {
      setFilterUnit('JUNIOR_HIGH');
    }
  }, [isJHPortal]);

  const canEdit = currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'HEAD_UNIT' || currentUser.role === 'TEACHER';
  const canDelete = currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'HEAD_UNIT';

  const fetchData = async () => {
    try {
      setLoading(true);
      const isJuniorHigh = effectiveFilterUnit === 'JUNIOR_HIGH';
      // Untuk Junior High, query subject Firestore tidak difilter ketat agar variasi
      // alias/legacy cocok via client-side normalizer isSameJHSubject
      const data = await getLearningGoals({
        unitId: effectiveFilterUnit === 'ALL' ? undefined : effectiveFilterUnit,
        grade: filterGrade === 'ALL' ? undefined : filterGrade,
        subject: isJuniorHigh ? undefined : (filterSubject === 'ALL' ? undefined : filterSubject),
        academicYear: filterYear,
        isActive: filterActive === 'ALL' ? undefined : (filterActive === 'TRUE')
      });

      let mappedData = (data || []).map(lg => ({
        ...lg,
        status: lg.status || 'PUBLISHED',
        reviewStatus: lg.reviewStatus || 'SUDAH_SESUAI',
        isActive: lg.isActive !== false
      }));

      if (isJuniorHigh && filterSubject !== 'ALL') {
        mappedData = mappedData.filter(lg => isSameJHSubject(lg.subject, filterSubject));
      }

      setLgs(mappedData);
    } catch (error) {
      console.error("Error fetching LGs:", error);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchData();
  }, [effectiveFilterUnit, filterGrade, filterSubject, filterYear, filterActive]);

  // Daftar mapel non-katalog (custom/legacy) yang ditemukan di database untuk filter Junior High
  const extraSubjects = React.useMemo(() => {
    if (effectiveFilterUnit !== 'JUNIOR_HIGH') return [];
    const extra = new Set<string>();
    lgs.forEach(lg => {
      const entry = findCatalogEntry(lg.subject);
      if (!entry && lg.subject && lg.subject.trim()) {
        extra.add(lg.subject.trim());
      }
    });
    return Array.from(extra);
  }, [effectiveFilterUnit, lgs]);

  const filteredLgs = lgs.filter(lg => {
    const matchesSearch = lg.goalText.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lg.code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesGrade = filterGrade === 'ALL' || isLGForGrade(lg, filterGrade);
    return matchesSearch && matchesGrade;
  });

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    let finalSubject = formData.subject;
    if (formData.unitId === 'JUNIOR_HIGH') {
      if (modalSubjectKey === '__OTHER__') {
        finalSubject = modalCustomSubject.trim();
      } else {
        const entry = JH_SUBJECT_CATALOG.find(c => c.key === modalSubjectKey);
        finalSubject = entry ? entry.legacyValue : modalCustomSubject.trim();
      }
    }

    let finalGrades: string[] = [];
    let finalGrade = '';
    if (formData.unitId === 'JUNIOR_HIGH') {
      if (selectedGrades.length === 0) {
        toast.warning('Pilih minimal satu kelas (grade 7, 8, atau 9) untuk Learning Goal.');
        return;
      }
      finalGrades = [...selectedGrades].sort();
      finalGrade = finalGrades.join(', ');
    } else {
      if (!formData.grade) return;
      finalGrade = formData.grade;
      finalGrades = [formData.grade];
    }

    if (!formData.unitId || !finalGrade || !finalSubject || !formData.goalText) return;
    
    setFormLoading(true);
    try {
      if (editingId) {
        if (formData.unitId === 'JUNIOR_HIGH' && originalGrades.length > 0) {
          const removed = originalGrades.filter(g => !finalGrades.includes(g));
          if (removed.length > 0) {
            const activeCount = await countActiveAssessmentsForLGInGrades(editingId, removed, formData.academicYear);
            if (activeCount > 0) {
              const confirmed = window.confirm(
                `Peringatan: Grade ${removed.join(', ')} akan dihapus dari cakupan LG ini, namun terdapat ${activeCount} LO aktif pada kelas tersebut. Menghapus grade ini akan memutus akses kelas terhadap LG ini. Apakah Anda yakin ingin melanjutkan?`
              );
              if (!confirmed) {
                setFormLoading(false);
                return;
              }
            }
          }
        }

        await updateLearningGoal(editingId, {
          grade: finalGrade,
          grades: finalGrades,
          strand: formData.strand,
          goalText: formData.goalText,
          isActive: formData.isActive
        });
        toast.success('Learning Goal berhasil diperbarui.');
      } else {
        let subjectCode = 'UNK';
        if (formData.unitId === 'JUNIOR_HIGH') {
          const entry = findCatalogEntry(finalSubject);
          if (entry) {
            subjectCode = (entry.legacyValue || entry.label).slice(0, 3).toUpperCase();
          } else {
            subjectCode = finalSubject.slice(0, 3).toUpperCase() || 'UNK';
          }
        } else {
          const subjectsList = ACADEMIC_SUBJECTS[formData.unitId as 'ELEMENTARY' | 'JUNIOR_HIGH'];
          subjectCode = subjectsList?.find(s => s.name === finalSubject)?.code || 'UNK';
        }
        const count = await getLearningGoalCountBySubject(finalSubject, finalGrades[0]);
        const increment = String(count + 1).padStart(3, '0');
        const gradesSegment = finalGrades.join('-');
        const code = `LG-${subjectCode}-${gradesSegment}-${increment}`;

        await addLearningGoal({
          ...formData,
          grade: finalGrade,
          grades: finalGrades,
          subject: finalSubject,
          code,
          createdBy: currentUser.email,
          unitId: formData.unitId as any
        });
        toast.success('Learning Goal baru berhasil ditambahkan.');
      }
      setIsModalOpen(false);
      setEditingId(null);
      setSelectedGrades(['7']);
      setOriginalGrades([]);
      setFormData({
        ...formData,
        strand: '',
        goalText: '',
        isActive: true
      });
      setModalSubjectKey('');
      setModalCustomSubject('');
      fetchData();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus Learning Goal ini secara permanen?")) return;
    try {
      await deleteLearningGoal(id);
      fetchData();
    } catch (error: any) {
      alert(error.message);
    }
  };

  const toggleArchive = async (lg: LearningGoal) => {
    try {
      await updateLearningGoal(lg.id, { isActive: !lg.isActive });
      fetchData();
    } catch (error) {
      console.error("Archive error:", error);
    }
  };

  const handleBackup = async (lgId: string) => {
    try {
      setBackingUpId(lgId);
      const response = await fetch('/api/lg-backup-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lgId }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to backup Learning Goal");
      }
      toast.success("Backup Successful", { description: result.message });
      fetchData();
    } catch (error: any) {
      toast.error("Backup Failed", { description: error.message });
    } finally {
      setBackingUpId(null);
    }
  };

  const handleExportToSheet = async (lgId: string) => {
    try {
      setExportingId(lgId);
      const response = await fetch("/api/lg-export-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lgId })
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Failed to export Learning Goal to Sheet");
      }

      if (result.spreadsheetUrl) {
        window.open(result.spreadsheetUrl, "_blank", "noopener,noreferrer");
      }

      toast.success("Export Successful", { description: result.message || "Learning Goal exported to Sheet" });
    } catch (error: any) {
      toast.error("Export Failed", { description: error.message || "Failed to export Learning Goal to Sheet" });
    } finally {
      setExportingId(null);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
           <div className="flex items-center gap-3 text-blue-600 mb-1">
              <BookOpen size={24} className="stroke-[2.5px]" />
              <h1 className="text-3xl font-black tracking-tight italic uppercase">Bank Learning Goals</h1>
           </div>
           <p className="text-gray-500 font-medium max-w-xl">
             {isJHPortal
               ? "Kelola daftar tujuan pembelajaran berdasarkan mata pelajaran dan jenjang kelas untuk Lazuardi Junior High"
               : "Kelola daftar tujuan pembelajaran berdasarkan unit, mata pelajaran, dan jenjang kelas untuk Lazuardi Elementary & Junior High."}
           </p>
        </div>

        {canEdit && (
          <button 
            onClick={() => {
              setEditingId(null);
              setFormData({
                unitId: (isJHPortal ? 'JUNIOR_HIGH' : (currentUser.role === 'SUPER_ADMIN' ? 'ELEMENTARY' : activeUnit || 'ELEMENTARY')) as any,
                grade: '',
                subject: '',
                strand: '',
                goalText: '',
                academicYear: activeYear || '2025/2026',
                isActive: true
              });
              setModalSubjectKey('');
              setModalCustomSubject('');
              setSelectedGrades(['7']);
              setOriginalGrades([]);
              setIsModalOpen(true);
            }}
            className="group flex items-center gap-3 px-8 py-4 bg-[#002366] text-white rounded-[1.5rem] font-bold shadow-xl shadow-blue-100 hover:scale-[1.02] active:scale-95 transition-all text-sm uppercase tracking-widest"
          >
            <Plus size={18} className="group-hover:rotate-90 transition-transform duration-300" />
            Tambah Goal Baru
          </button>
        )}
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-[2rem] border border-gray-100 shadow-sm space-y-4">
         <div className="flex flex-wrap gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
               <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
               <input 
                 type="text" 
                 placeholder="Cari deskripsi atau kode LG..." 
                 value={searchTerm}
                 onChange={(e) => setSearchTerm(e.target.value)}
                 className="w-full pl-12 pr-4 py-3 bg-gray-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-blue-100 transition-all font-medium"
               />
            </div>

            {/* Unit Filter: disembunyikan bila portal aktif adalah JUNIOR_HIGH */}
            {!isJHPortal && (
              <select 
                value={filterUnit}
                onChange={(e) => {
                  setFilterUnit(e.target.value);
                  setFilterGrade('ALL');
                  setFilterSubject('ALL');
                }}
                className="px-6 py-3 bg-gray-50 border-none rounded-2xl text-xs font-bold uppercase tracking-wider focus:ring-2 focus:ring-blue-100"
              >
                <option value="ALL">Semua Unit</option>
                <option value="ELEMENTARY">SD (Elementary)</option>
                <option value="JUNIOR_HIGH">SMP (Junior High)</option>
              </select>
            )}

            {/* Subject Filter: memakai katalog mapel Lazuardi untuk Junior High */}
            <select 
              value={filterSubject}
              onChange={(e) => setFilterSubject(e.target.value)}
              className="px-6 py-3 bg-gray-50 border-none rounded-2xl text-xs font-bold uppercase tracking-wider focus:ring-2 focus:ring-blue-100"
            >
              <option value="ALL">Semua Mapel</option>
              {effectiveFilterUnit === 'JUNIOR_HIGH' ? (
                <>
                  {JH_SUBJECT_CATALOG.map(entry => (
                    <option key={entry.key} value={entry.label}>{entry.label}</option>
                  ))}
                  {extraSubjects.map(subj => (
                    <option key={subj} value={subj}>{subj}</option>
                  ))}
                </>
              ) : (
                filterUnit !== 'ALL' && ACADEMIC_SUBJECTS[filterUnit as 'ELEMENTARY' | 'JUNIOR_HIGH']?.map(s => (
                  <option key={s.name} value={s.name}>{s.name}</option>
                ))
              )}
            </select>

            {/* Grade Filter: dibatasi ke 7-9 untuk Junior High */}
            <select 
              value={filterGrade}
              onChange={(e) => setFilterGrade(e.target.value)}
              className="px-6 py-3 bg-gray-50 border-none rounded-2xl text-xs font-bold uppercase tracking-wider focus:ring-2 focus:ring-blue-100"
            >
              <option value="ALL">Semua Kelas</option>
              {isJHPortal || effectiveFilterUnit === 'JUNIOR_HIGH' ? (
                ['7', '8', '9'].map(g => (
                  <option key={g} value={g}>Kelas {g}</option>
                ))
              ) : (
                filterUnit !== 'ALL' && ACADEMIC_GRADES[filterUnit as keyof typeof ACADEMIC_GRADES]?.map(g => (
                  <option key={g} value={g}>Kelas {g}</option>
                ))
              )}
            </select>

            {/* Year Filter */}
            <select 
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="px-6 py-3 bg-gray-50 border-none rounded-2xl text-xs font-bold uppercase tracking-wider focus:ring-2 focus:ring-blue-100"
            >
              {ACADEMIC_YEARS.map(y => (
                <option key={y} value={y}>TA {y}</option>
              ))}
            </select>
         </div>

         {/* Badges for active filters: sembunyikan chip JUNIOR_HIGH saat di portal JH */}
         <div className="flex flex-wrap gap-2 px-2">
            {!isJHPortal && filterUnit !== 'ALL' && (
              <FilterBadge label={filterUnit} onRemove={() => setFilterUnit('ALL')} />
            )}
            {filterGrade !== 'ALL' && (
              <FilterBadge label={`Kelas ${filterGrade}`} onRemove={() => setFilterGrade('ALL')} />
            )}
            {filterSubject !== 'ALL' && (
              <FilterBadge label={filterSubject} onRemove={() => setFilterSubject('ALL')} />
            )}
         </div>
      </div>

      {/* Main List */}
      <div className="grid grid-cols-1 gap-4">
        {loading ? (
          <div className="py-20 text-center space-y-4">
             <Loader2 size={40} className="text-gray-200 animate-spin mx-auto" />
             <p className="text-sm text-gray-400 font-bold uppercase tracking-widest">Memuat database...</p>
          </div>
        ) : filteredLgs.length === 0 ? (
          <div className="py-20 text-center bg-white rounded-[3rem] border border-dashed border-gray-200">
             <AlertCircle size={48} className="text-gray-200 mx-auto mb-4" />
             <h3 className="text-lg font-bold text-gray-400">Tidak ada Learning Goal ditemukan</h3>
             <p className="text-sm text-gray-400 mt-1">Coba sesuaikan filter atau tambahkan data baru.</p>
          </div>
        ) : filteredLgs.map((lg) => (
          <motion.div 
            key={lg.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "group bg-white p-6 rounded-[2rem] border transition-all flex flex-col md:flex-row md:items-center justify-between gap-6",
              lg.isActive ? "border-gray-100 shadow-sm hover:shadow-md" : "border-gray-50 opacity-60 grayscale"
            )}
          >
            <div className="flex-1 space-y-2">
               <div className="flex flex-wrap items-center gap-3">
                  <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black uppercase tracking-widest">{lg.code}</span>
                  <span className="px-3 py-1 bg-gray-50 text-gray-500 rounded-lg text-[10px] font-black uppercase tracking-widest">
                    {lg.unitId === 'JUNIOR_HIGH' ? getJHSubjectLabel(lg.subject) : lg.subject}
                  </span>
                  <span className={cn(
                    "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border",
                    getLGGrades(lg).length > 1
                      ? "bg-purple-50 text-purple-700 border-purple-200"
                      : "bg-emerald-50 text-emerald-600 border-emerald-200"
                  )}>
                    {formatLGGradesLabel(lg)}
                  </span>
                  {lg.unitId === 'JUNIOR_HIGH' && lg.status === 'DRAFT' && (
                    <span className="px-3 py-1 bg-amber-50 text-amber-700 rounded-lg text-[10px] font-black uppercase tracking-widest">
                      {lg.reviewStatus === 'SUDAH_SESUAI' ? 'Sudah Sesuai' : 'Draf (Menunggu Persetujuan)'}
                    </span>
                  )}
                  {lg.strand && (
                    <span className="px-3 py-1 border border-gray-100 text-gray-400 rounded-lg text-[10px] font-black uppercase tracking-widest leading-relaxed">{lg.strand}</span>
                  )}
                  {!lg.isActive && (
                    <span className="px-3 py-1 bg-red-50 text-red-500 rounded-lg text-[10px] font-black uppercase tracking-widest italic">Archived</span>
                  )}
               </div>
               <p className={cn(
                 "text-sm font-bold text-gray-700 leading-relaxed",
                 !lg.isActive && "line-through text-gray-300"
               )}>
                 {lg.goalText}
               </p>
            </div>

            <div className="flex items-center gap-2">
               {canEdit && (
                 <>
                   <button 
                     onClick={() => handleBackup(lg.id)}
                     disabled={backingUpId === lg.id || exportingId === lg.id}
                     title="Backup ke Google Drive"
                     className={cn(
                       "flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-100 transition-all",
                       backingUpId === lg.id && "opacity-50"
                     )}
                   >
                      {backingUpId === lg.id ? <Loader2 size={14} className="animate-spin" /> : <Cloud size={14} />}
                      {backingUpId === lg.id ? "Backing up..." : "Backup"}
                   </button>
                   <button 
                     onClick={() => handleExportToSheet(lg.id)}
                     disabled={backingUpId === lg.id || exportingId === lg.id}
                     title="Export ke Google Sheet"
                     className={cn(
                        "flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all",
                        exportingId === lg.id && "opacity-50"
                     )}
                   >
                      {exportingId === lg.id ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
                      {exportingId === lg.id ? "Exporting..." : "Export to Sheet"}
                   </button>
                   <div className="w-[1px] h-6 bg-gray-100 mx-1" />
                   <button 
                     onClick={() => {
                        setEditingId(lg.id);
                        const exGrades = getLGGrades(lg);
                        setSelectedGrades(exGrades.length > 0 ? exGrades : (lg.grade ? [String(lg.grade)] : ['7']));
                        setOriginalGrades(exGrades.length > 0 ? exGrades : (lg.grade ? [String(lg.grade)] : []));
                        setFormData({
                          unitId: lg.unitId,
                          grade: lg.grade,
                          subject: lg.subject,
                          strand: lg.strand || '',
                          goalText: lg.goalText,
                          academicYear: lg.academicYear,
                          isActive: lg.isActive !== false
                        });
                        if (lg.unitId === 'JUNIOR_HIGH') {
                          const entry = findCatalogEntry(lg.subject);
                          if (entry) {
                            setModalSubjectKey(entry.key);
                            setModalCustomSubject('');
                          } else {
                            setModalSubjectKey('__OTHER__');
                            setModalCustomSubject(lg.subject || '');
                          }
                        } else {
                          setModalSubjectKey('');
                          setModalCustomSubject('');
                        }
                        setIsModalOpen(true);
                     }}
                     className="p-3 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                   >
                      <Edit2 size={18} />
                   </button>
                   <button 
                     onClick={() => toggleArchive(lg)}
                     title={lg.isActive ? "Arsipkan" : "Aktifkan Kembali"}
                     className={cn(
                       "p-3 rounded-xl transition-all",
                       lg.isActive ? "text-gray-400 hover:text-orange-500 hover:bg-orange-50" : "text-emerald-500 hover:bg-emerald-50"
                     )}
                   >
                      <Archive size={18} />
                   </button>
                 </>
               )}
               {canDelete && (
                 <button 
                   onClick={() => handleDelete(lg.id)}
                   className="p-3 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                 >
                    <Trash2 size={18} />
                 </button>
               )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Modal Form */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-md" 
              onClick={() => setIsModalOpen(false)} 
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl relative z-10 overflow-hidden"
            >
               <form onSubmit={handleCreateOrUpdate} className="p-10 space-y-8">
                  <div className="flex items-center justify-between">
                     <div className="space-y-1">
                        <h2 className="text-2xl font-black text-gray-900 tracking-tight italic uppercase">
                          {editingId ? "Edit Learning Goal" : "Tambah Goal Baru"}
                        </h2>
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Akademik & Kurikulum</p>
                     </div>
                     <button type="button" onClick={() => setIsModalOpen(false)} className="p-3 hover:bg-gray-50 rounded-full transition-colors text-gray-400">
                        <X size={24} />
                     </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     {/* UnitSelection (Immutable on edit or when locked to Junior High portal) */}
                     <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Unit Pendidikan</label>
                        <select 
                          disabled={isJHPortal || !!editingId}
                          value={formData.unitId}
                          onChange={(e) => {
                            setFormData({...formData, unitId: e.target.value as any, grade: '', subject: ''});
                            setModalSubjectKey('');
                            setModalCustomSubject('');
                          }}
                          className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-100 disabled:opacity-50"
                        >
                           <option value="ELEMENTARY">ELEMENTARY (SD)</option>
                           <option value="JUNIOR_HIGH">JUNIOR HIGH (SMP)</option>
                        </select>
                     </div>

                     <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Tahun Akademik</label>
                        <select 
                          value={formData.academicYear}
                          onChange={(e) => setFormData({...formData, academicYear: e.target.value})}
                          className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer"
                        >
                           {ACADEMIC_YEARS.map(y => (
                             <option key={y} value={y}>{y}</option>
                           ))}
                        </select>
                     </div>

                     {formData.unitId === 'JUNIOR_HIGH' ? (
                       <>
                         <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Mata Pelajaran (Lazuardi)</label>
                            <select 
                              disabled={!!editingId}
                              value={modalSubjectKey}
                              onChange={(e) => {
                                const key = e.target.value;
                                setModalSubjectKey(key);
                                if (key !== '__OTHER__') {
                                  const entry = JH_SUBJECT_CATALOG.find(c => c.key === key);
                                  setFormData(prev => ({ ...prev, subject: entry ? entry.legacyValue : '' }));
                                } else {
                                  setFormData(prev => ({ ...prev, subject: modalCustomSubject }));
                                }
                              }}
                              className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer disabled:opacity-50"
                              required
                            >
                               <option value="">Pilih Mapel</option>
                               {JH_SUBJECT_CATALOG.map(s => (
                                 <option key={s.key} value={s.key}>{s.label}</option>
                               ))}
                               <option value="__OTHER__">Lainnya (ketik sendiri)</option>
                            </select>
                         </div>

                         {modalSubjectKey === '__OTHER__' && (
                           <div className="space-y-2 md:col-span-2">
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Nama Mata Pelajaran (Ketik Sendiri)</label>
                              <input 
                                disabled={!!editingId}
                                type="text" 
                                value={modalCustomSubject}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setModalCustomSubject(val);
                                  setFormData(prev => ({ ...prev, subject: val }));
                                }}
                                className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-100 disabled:opacity-50"
                                placeholder="misal: Robotika, Desain Grafis..."
                                required
                              />
                           </div>
                         )}
                       </>
                     ) : (
                       <div className="space-y-2">
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Mata Pelajaran</label>
                          <select 
                            disabled={!!editingId}
                            value={formData.subject}
                            onChange={(e) => setFormData({...formData, subject: e.target.value})}
                            className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer disabled:opacity-50"
                            required
                          >
                             <option value="">Pilih Mapel</option>
                             {ACADEMIC_SUBJECTS[formData.unitId as 'ELEMENTARY' | 'JUNIOR_HIGH']?.map(s => (
                               <option key={s.name} value={s.name}>{s.name}</option>
                             ))}
                          </select>
                       </div>
                     )}

                     {formData.unitId === 'JUNIOR_HIGH' ? (
                       <div className="space-y-2">
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                            Cakupan Kelas (Grade) — Multi-Grade
                          </label>
                          <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-2xl border border-gray-100">
                            {['7', '8', '9'].map(g => {
                              const checked = selectedGrades.includes(g);
                              return (
                                <label
                                  key={g}
                                  className={cn(
                                    "flex-1 flex items-center justify-center gap-1.5 py-3 px-2 rounded-xl border text-xs font-bold cursor-pointer transition-all select-none",
                                    checked
                                      ? "bg-purple-600 border-purple-600 text-white shadow-xs"
                                      : "bg-white border-gray-200 text-gray-700 hover:bg-gray-100"
                                  )}
                                >
                                  <input
                                    type="checkbox"
                                    className="sr-only"
                                    checked={checked}
                                    onChange={() => {
                                      setSelectedGrades(prev =>
                                        prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g].sort()
                                      );
                                    }}
                                  />
                                  <span>Kelas {g}</span>
                                </label>
                              );
                            })}
                          </div>
                          <p className="text-[10px] text-gray-400 ml-1 font-medium">
                            {selectedGrades.length > 0
                              ? `Berlaku untuk: ${selectedGrades.map(g => `Kelas ${g}`).join(', ')}`
                              : 'Pilih minimal satu grade untuk cakupan LG ini'}
                          </p>
                       </div>
                     ) : (
                       <div className="space-y-2">
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Kelas (Grade)</label>
                          <select 
                            disabled={!!editingId}
                            value={formData.grade}
                            onChange={(e) => setFormData({...formData, grade: e.target.value})}
                            className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer disabled:opacity-50"
                            required
                          >
                             <option value="">Pilih Kelas</option>
                             {ACADEMIC_GRADES[formData.unitId as keyof typeof ACADEMIC_GRADES]?.map(g => (
                               <option key={g} value={g}>Kelas {g}</option>
                             ))}
                          </select>
                       </div>
                     )}

                     <div className="space-y-2 md:col-span-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Tema / Strand (Opsional)</label>
                        <input 
                          type="text" 
                          value={formData.strand}
                          onChange={(e) => setFormData({...formData, strand: e.target.value})}
                          className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold italic focus:ring-2 focus:ring-blue-100"
                          placeholder="e.g. Aljabar, Ekosistem, World History..."
                        />
                     </div>

                     <div className="space-y-2 md:col-span-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Deskripsi Tujuan Pembelajaran (Goal Text)</label>
                        <textarea 
                          value={formData.goalText}
                          onChange={(e) => setFormData({...formData, goalText: e.target.value})}
                          className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold leading-relaxed focus:ring-2 focus:ring-blue-100 min-h-[120px]"
                          placeholder="Deskripsikan apa yang siswa akan capai..."
                          required
                        />
                     </div>
                  </div>

                  <div className="flex flex-col md:flex-row gap-4 pt-4 border-t border-gray-50">
                     <button 
                       type="button" 
                       onClick={() => setIsModalOpen(false)}
                       className="flex-1 py-4 text-xs font-black text-gray-400 uppercase tracking-widest"
                     >
                       Batal
                     </button>
                     <button 
                       type="submit" 
                       disabled={formLoading}
                       className="flex-[2] py-5 bg-[#002366] text-white rounded-2xl font-bold flex items-center justify-center gap-3 shadow-xl shadow-blue-100 hover:opacity-90 active:scale-95 transition-all text-sm uppercase tracking-widest"
                     >
                        {formLoading ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                        {editingId ? "Update LG" : "Simpan LG"}
                     </button>
                  </div>
               </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FilterBadge({ label, onRemove }: { label: string, onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest ring-1 ring-blue-100">
      {label}
      <button onClick={onRemove} className="hover:text-blue-800">
        <X size={12} className="stroke-[3px]" />
      </button>
    </div>
  );
}
