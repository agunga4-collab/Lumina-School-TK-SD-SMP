import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Search, Filter, Trash2, Edit2, Archive, CheckCircle2, 
  X, Loader2, BookOpen, ChevronRight, AlertCircle, RefreshCw,
  FileSpreadsheet, Cloud
} from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import { 
  getLearningGoals, addLearningGoal, updateLearningGoal, 
  deleteLearningGoal, getLearningGoalCountBySubject 
} from '../../lib/firebase';
import { LearningGoal, User, UnitType } from '../../types';
import { cn } from '../../lib/utils';
import { ACADEMIC_SUBJECTS, ACADEMIC_GRADES, ACADEMIC_YEARS } from '../../constants';

export default function LearningGoalsPage() {
  const { currentUser, activeUnit } = useOutletContext<{ currentUser: User, activeUnit: UnitType }>();
  const [lgs, setLgs] = React.useState<LearningGoal[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchTerm, setSearchTerm] = React.useState('');
  
  // Filters
  const [filterUnit, setFilterUnit] = React.useState<string>(currentUser.role === 'SUPER_ADMIN' ? 'ELEMENTARY' : (activeUnit || 'ELEMENTARY'));
  const [filterGrade, setFilterGrade] = React.useState<string>('ALL');
  const [filterSubject, setFilterSubject] = React.useState<string>('ALL');
  const [filterYear, setFilterYear] = React.useState<string>('2025/2026');
  const [filterActive, setFilterActive] = React.useState<string>('ALL');

  // Loading states for actions
  const [exportingId, setExportingId] = React.useState<string | null>(null);
  const [backingUpId, setBackingUpId] = React.useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [formLoading, setFormLoading] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [formData, setFormData] = React.useState({
    unitId: (currentUser.role === 'SUPER_ADMIN' ? 'ELEMENTARY' : activeUnit || 'ELEMENTARY') as any,
    grade: '',
    subject: '',
    strand: '',
    goalText: '',
    academicYear: '2025/2026',
    isActive: true
  });

  const canEdit = currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'HEAD_UNIT' || currentUser.role === 'TEACHER';
  const canDelete = currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'HEAD_UNIT';

  const fetchData = async () => {
    try {
      setLoading(true);
      const data = await getLearningGoals({
        unitId: filterUnit === 'ALL' ? undefined : filterUnit,
        grade: filterGrade === 'ALL' ? undefined : filterGrade,
        subject: filterSubject === 'ALL' ? undefined : filterSubject,
        academicYear: filterYear,
        isActive: filterActive === 'ALL' ? undefined : (filterActive === 'TRUE')
      });
      setLgs(data);
    } catch (error) {
      console.error("Error fetching LGs:", error);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchData();
  }, [filterUnit, filterGrade, filterSubject, filterYear, filterActive]);

  const filteredLgs = lgs.filter(lg => 
    lg.goalText.toLowerCase().includes(searchTerm.toLowerCase()) ||
    lg.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.unitId || !formData.grade || !formData.subject || !formData.goalText) return;
    
    setFormLoading(true);
    try {
      if (editingId) {
        await updateLearningGoal(editingId, {
          strand: formData.strand,
          goalText: formData.goalText,
          isActive: formData.isActive
        });
      } else {
        // Generate Code: LG-{SUBJECT_CODE}-{GRADE}-{INCREMENT}
        const subjectsList = ACADEMIC_SUBJECTS[formData.unitId as 'ELEMENTARY' | 'JUNIOR_HIGH'];
        const subjectCode = subjectsList.find(s => s.name === formData.subject)?.code || 'UNK';
        const count = await getLearningGoalCountBySubject(formData.subject, formData.grade);
        const increment = String(count + 1).padStart(3, '0');
        const code = `LG-${subjectCode}-${formData.grade}-${increment}`;

        await addLearningGoal({
          ...formData,
          code,
          createdBy: currentUser.email,
          unitId: formData.unitId as any
        });
      }
      setIsModalOpen(false);
      setEditingId(null);
      setFormData({
        ...formData,
        strand: '',
        goalText: '',
        isActive: true
      });
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
             Kelola daftar tujuan pembelajaran berdasarkan unit, mata pelajaran, dan jenjang kelas untuk Lazuardi Elementary & Junior High.
           </p>
        </div>

        {canEdit && (
          <button 
            onClick={() => {
              setEditingId(null);
              setFormData({
                unitId: (currentUser.role === 'SUPER_ADMIN' ? 'ELEMENTARY' : activeUnit || 'ELEMENTARY') as any,
                grade: '',
                subject: '',
                strand: '',
                goalText: '',
                academicYear: '2025/2026',
                isActive: true
              });
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

            {/* Unit Filter */}
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

            {/* Subject Filter */}
            <select 
              value={filterSubject}
              onChange={(e) => setFilterSubject(e.target.value)}
              className="px-6 py-3 bg-gray-50 border-none rounded-2xl text-xs font-bold uppercase tracking-wider focus:ring-2 focus:ring-blue-100"
            >
              <option value="ALL">Semua Mapel</option>
              {filterUnit !== 'ALL' && ACADEMIC_SUBJECTS[filterUnit as 'ELEMENTARY' | 'JUNIOR_HIGH'].map(s => (
                <option key={s.name} value={s.name}>{s.name}</option>
              ))}
            </select>

            {/* Grade Filter */}
            <select 
              value={filterGrade}
              onChange={(e) => setFilterGrade(e.target.value)}
              className="px-6 py-3 bg-gray-50 border-none rounded-2xl text-xs font-bold uppercase tracking-wider focus:ring-2 focus:ring-blue-100"
            >
              <option value="ALL">Semua Kelas</option>
              {filterUnit !== 'ALL' && ACADEMIC_GRADES[filterUnit as 'ELEMENTARY' | 'JUNIOR_HIGH'].map(g => (
                <option key={g} value={g}>Kelas {g}</option>
              ))}
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

         {/* Badges for active filters */}
         <div className="flex flex-wrap gap-2 px-2">
            {filterUnit !== 'ALL' && (
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
                  <span className="px-3 py-1 bg-gray-50 text-gray-500 rounded-lg text-[10px] font-black uppercase tracking-widest">{lg.subject}</span>
                  <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-black uppercase tracking-widest">Kelas {lg.grade}</span>
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
                        setFormData({
                          unitId: lg.unitId,
                          grade: lg.grade,
                          subject: lg.subject,
                          strand: lg.strand || '',
                          goalText: lg.goalText,
                          academicYear: lg.academicYear,
                          isActive: lg.isActive
                        });
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
                     {/* UnitSelection (Immutable on edit) */}
                     <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Unit Pendidikan</label>
                        <select 
                          disabled={!!editingId}
                          value={formData.unitId}
                          onChange={(e) => setFormData({...formData, unitId: e.target.value as any, grade: '', subject: ''})}
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
                           {ACADEMIC_SUBJECTS[formData.unitId as 'ELEMENTARY' | 'JUNIOR_HIGH'].map(s => (
                             <option key={s.name} value={s.name}>{s.name}</option>
                           ))}
                        </select>
                     </div>

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
                           {ACADEMIC_GRADES[formData.unitId as 'ELEMENTARY' | 'JUNIOR_HIGH'].map(g => (
                             <option key={g} value={g}>Kelas {g}</option>
                           ))}
                        </select>
                     </div>

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
