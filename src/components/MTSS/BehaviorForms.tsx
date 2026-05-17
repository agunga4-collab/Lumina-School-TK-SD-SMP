import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Save, User, Calendar, MessageSquare, 
  Plus, CheckCircle2, AlertCircle, Search,
  ChevronRight, ChevronLeft, Target, ShieldCheck,
  Star, Briefcase, FileText, Loader2, Trash2
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { 
  getTeachers, getStudentsByClass, getActiveCaseForStudent,
  createMTSSCase, addMTSSConcern, updateMTSSCase, closeMTSSCase,
  saveCICOGoalConfig, createBehaviorAlert, getMTSSConcerns
} from '../../lib/firebase';
import type { 
  MTSSCase, MTSSConcern, MTSSTier, User as AppUser, Student, CICOGoal, BehaviorNotification 
} from '../../types';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}

const Modal = ({ isOpen, onClose, title, children, footer, width = "max-w-3xl" }: ModalProps) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className={cn("bg-white rounded-[2.5rem] shadow-3xl w-full relative z-10 flex flex-col overflow-hidden max-h-[90vh]", width)}
      >
        <div className="p-8 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h3 className="text-xl font-black uppercase italic tracking-tighter text-blue-900">{title}</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-all">
            <X size={20} className="text-gray-400" />
          </button>
        </div>
        <div className="p-8 overflow-y-auto overflow-x-hidden">
          {children}
        </div>
        {footer && (
          <div className="p-8 border-t border-gray-100 shrink-0">
            {footer}
          </div>
        )}
      </motion.div>
    </div>
  );
};

// --- Form 1: Lapor Kasus Baru ---
export const NewCaseForm = ({ isOpen, onClose, onSuccess }: { isOpen: boolean, onClose: () => void, onSuccess: (caseId: string) => void }) => {
  const { profile } = useAuth();
  const [loading, setLoading] = React.useState(false);
  const [students, setStudents] = React.useState<Student[]>([]);
  const [teachers, setTeachers] = React.useState<AppUser[]>([]);
  const [activeCaseWarning, setActiveCaseWarning] = React.useState<MTSSCase | null>(null);
  
  const [formData, setFormData] = React.useState({
    studentId: '',
    date: new Date().toISOString().split('T')[0],
    description: '',
    interventionsTried: '',
    progressNotes: '',
    nextSteps: '',
    nextStepDueDate: '',
    responsibleParties: [] as string[],
    studentAsset: ''
  });

  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    const loadBatch = async () => {
      // For demo, load all students or filter by class if available
      const s = await getStudentsByClass(profile?.classId || '7A', '2025/2026');
      setStudents(s || []);
      const t = await getTeachers();
      setTeachers(t);
    };
    if (isOpen) loadBatch();
  }, [isOpen]);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.studentId) newErrors.studentId = "Pilih siswa wajib";
    if (formData.description.length < 50) newErrors.description = "Behavior concern minimal 50 karakter";
    if (!formData.studentAsset) newErrors.studentAsset = "Student asset wajib diisi (Positive Discipline)";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleStudentSelect = async (studentId: string) => {
    setFormData(prev => ({ ...prev, studentId }));
    const activeCase = await getActiveCaseForStudent(studentId);
    setActiveCaseWarning(activeCase);
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const student = students.find(s => s.id === formData.studentId);
      const teacherIds = [...formData.responsibleParties, profile?.uid || ''];
      
      const caseId = await createMTSSCase({
        studentId: formData.studentId,
        studentName: student?.name || 'Unknown',
        classId: student?.classId || 'Unknown',
        academicYear: '2025/2026',
        tier: 'Tier 1',
        status: 'OPEN',
        picId: profile?.uid || '',
        picName: profile?.displayName || '',
        initialAssets: formData.studentAsset,
        totalConcerns: 1,
        lastConcernSummary: formData.description.slice(0, 50) + '...',
        lastConcernDate: Date.now()
      });

      await addMTSSConcern(caseId, {
        date: formData.date,
        description: formData.description,
        reporterId: profile?.uid || '',
        reporterName: profile?.displayName || '',
        interventionsTried: formData.interventionsTried.split(',').map(i => i.trim()),
        nextSteps: formData.nextSteps,
        nextStepDueDate: formData.nextStepDueDate,
        progressNotes: formData.progressNotes,
        isDone: false
      });

      onSuccess(caseId);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Lapor Kasus Perilaku Baru">
      <div className="space-y-8">
        {activeCaseWarning && (
          <div className="p-6 bg-amber-50 rounded-2xl border border-amber-100 flex gap-4">
            <AlertCircle className="text-amber-600 shrink-0" size={24} />
            <div>
               <p className="text-sm font-black text-amber-900 uppercase italic tracking-tighter">Siswa ini sudah punya kasus aktif!</p>
               <p className="text-xs font-bold text-amber-700 mt-1 uppercase tracking-widest leading-relaxed">
                  Ditemukan Kasus Active (Tier: {activeCaseWarning.tier}). Ingin menambah data baru ke kasus yang ada?
               </p>
               <button 
                 onClick={() => onSuccess(activeCaseWarning.id)}
                 className="mt-4 px-6 py-2 bg-amber-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest"
               >
                  Buka Kasus Existing
               </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
           <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Pilih Siswa</label>
              <select 
                value={formData.studentId}
                onChange={(e) => handleStudentSelect(e.target.value)}
                className={cn("w-full px-6 py-4 rounded-xl bg-gray-50 border transition-all font-bold text-sm uppercase tracking-tighter", errors.studentId ? "border-rose-300" : "border-transparent focus:border-blue-300")}
              >
                <option value="">Cari Siswa...</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.classId})</option>)}
              </select>
              {errors.studentId && <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mt-1 ml-2">{errors.studentId}</p>}
           </div>
           <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Tanggal Kejadian</label>
              <input 
                type="date"
                value={formData.date}
                onChange={(e) => setFormData(p=>({...p, date: e.target.value}))}
                className="w-full px-6 py-4 rounded-xl bg-gray-50 border border-transparent focus:border-blue-300 transition-all font-bold text-sm"
              />
           </div>
        </div>

        <div className="space-y-2">
           <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Behavior Concern (Min 50 Karakter)</label>
           <textarea 
             value={formData.description}
             onChange={(e) => setFormData(p=>({...p, description: e.target.value}))}
             placeholder="Jelaskan perilaku yang menjadi kekhawatiran secara spesifik..."
             rows={3}
             className={cn("w-full px-6 py-4 rounded-xl bg-gray-50 border transition-all font-medium text-sm leading-relaxed", errors.description ? "border-rose-300" : "border-transparent focus:border-blue-300")}
           />
           <div className="flex justify-between mt-1 px-2">
              <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">{formData.description.length} / 50 characters</p>
              {errors.description && <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">{errors.description}</p>}
           </div>
        </div>

        <div className="space-y-2">
           <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Student Asset / Kekuatan Siswa (Positive Discipline)</label>
           <textarea 
             value={formData.studentAsset}
             onChange={(e) => setFormData(p=>({...p, studentAsset: e.target.value}))}
             placeholder="Sebutkan setidaknya 1-2 kekuatan atau hal positif yang dimiliki siswa ini..."
             rows={2}
             className={cn("w-full px-6 py-4 rounded-xl bg-gray-50 border transition-all font-medium text-sm leading-relaxed", errors.studentAsset ? "border-rose-300" : "border-transparent focus:border-blue-300")}
           />
           {errors.studentAsset && <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mt-1 ml-2">{errors.studentAsset}</p>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
           <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Interventions Already Tried</label>
              <textarea 
                value={formData.interventionsTried}
                onChange={(e) => setFormData(p=>({...p, interventionsTried: e.target.value}))}
                placeholder="Apa yang sudah guru lakukan? (pisahkan dengan koma)"
                rows={2}
                className="w-full px-6 py-4 rounded-xl bg-gray-50 border border-transparent focus:border-blue-300 transition-all font-medium text-sm"
              />
           </div>
           <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Progress After Intervention</label>
              <textarea 
                value={formData.progressNotes}
                onChange={(e) => setFormData(p=>({...p, progressNotes: e.target.value}))}
                placeholder="Bagaimana perkembangan siswanya?"
                rows={2}
                className="w-full px-6 py-4 rounded-xl bg-gray-50 border border-transparent focus:border-blue-300 transition-all font-medium text-sm"
              />
           </div>
        </div>

        <div className="space-y-2">
           <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Next Steps Plan</label>
           <textarea 
             value={formData.nextSteps}
             onChange={(e) => setFormData(p=>({...p, nextSteps: e.target.value}))}
             placeholder="Rencana tindak lanjut apa yang akan dilakukan?"
             rows={2}
             className="w-full px-6 py-4 rounded-xl bg-gray-50 border border-transparent focus:border-blue-300 transition-all font-medium text-sm"
           />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
           <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Target Selesai Next Steps</label>
              <input 
                type="date"
                value={formData.nextStepDueDate}
                onChange={(e) => setFormData(p=>({...p, nextStepDueDate: e.target.value}))}
                className="w-full px-6 py-4 rounded-xl bg-gray-50 border border-transparent focus:border-blue-300 transition-all font-bold text-sm"
              />
           </div>
           <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Person Responsible</label>
              <select 
                multiple
                value={formData.responsibleParties}
                onChange={(e) => setFormData(p=>({...p, responsibleParties: Array.from(e.target.selectedOptions, option => (option as HTMLOptionElement).value)}))}
                className="w-full px-6 py-4 rounded-xl bg-gray-50 border border-transparent focus:border-blue-300 transition-all font-bold text-sm"
              >
                {teachers.map(t => <option key={t.uid} value={t.uid}>{t.displayName}</option>)}
              </select>
              <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest mt-1 ml-2">Tahan Ctrl/Cmd untuk pilih multiple</p>
           </div>
        </div>

        <div className="pt-6 flex justify-end gap-4">
           <button 
             onClick={onClose}
             className="px-10 py-4 rounded-xl text-xs font-black uppercase tracking-widest text-gray-400 hover:text-gray-900 transition-all"
           >
              Batal
           </button>
           <button 
             onClick={handleSubmit}
             disabled={loading}
             className="px-12 py-4 bg-[#002366] text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-xl hover:scale-105 transition-all flex items-center gap-3 disabled:opacity-50"
           >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              Lapor & Buat Kasus
           </button>
        </div>
      </div>
    </Modal>
  );
};

// --- Form 2: Tambah Data Baru ke Kasus Existing ---
export const AddDataForm = ({ isOpen, onClose, mtssCase }: { isOpen: boolean, onClose: () => void, mtssCase: MTSSCase }) => {
  const { profile } = useAuth();
  const [loading, setLoading] = React.useState(false);
  const [formData, setFormData] = React.useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    interventionsTried: '',
    progressNotes: '',
    nextSteps: '',
    nextStepDueDate: '',
    triggerEscalation: false
  });

  const handleSubmit = async () => {
    if (!formData.description) return;
    setLoading(true);
    try {
      await addMTSSConcern(mtssCase.id, {
        date: formData.date,
        description: formData.description,
        reporterId: profile?.uid || '',
        reporterName: profile?.displayName || '',
        interventionsTried: formData.interventionsTried.split(',').map(i => i.trim()),
        nextSteps: formData.nextSteps,
        nextStepDueDate: formData.nextStepDueDate,
        progressNotes: formData.progressNotes,
        isDone: false
      });

      // ALERT-T1-02: Potensi Eskalasi - Data Banyak (5+ in 1 month)
      if (mtssCase.tier === 'Tier 1' && mtssCase.status !== 'ESCALATED') {
        const lastMonth = new Date();
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        const recentConcerns = await getMTSSConcerns(mtssCase.id); 
        const monthCount = recentConcerns.filter(c => c.createdAt > lastMonth.getTime()).length;

        if (monthCount >= 5) {
          // Send alert to Counselors & Principal
          const targetRoles = ['BK_MENTOR', 'HEAD_JUNIOR', 'SUPER_ADMIN'];
          const teachers = await getTeachers();
          const targetUserIds = teachers.filter(t => targetRoles.includes(t.role)).map(t => t.uid);

          await createBehaviorAlert({
            type: 'ALERT-T1-02', 
            severity: 'HIGH',
            title: 'Potensi Eskalasi - Record Concern Tinggi',
            message: `${mtssCase.studentName} sudah memiliki ${monthCount} catatan concern bulan ini. Pertimbangkan eskalasi ke Tier 2.`,
            caseId: mtssCase.id,
            studentId: mtssCase.studentId,
            studentName: mtssCase.studentName,
            targetUserIds,
            actionUrl: `/mtss/cases/${mtssCase.id}`
          });
        }
      }

      if (formData.triggerEscalation) {
        await updateMTSSCase(mtssCase.id, { status: 'UNDER_REVIEW' });
      }

      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Tambah Data: ${mtssCase.studentName}`}>
      <div className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
           <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Tanggal Kejadian</label>
              <input 
                type="date"
                value={formData.date}
                onChange={(e) => setFormData(p=>({...p, date: e.target.value}))}
                className="w-full px-6 py-4 rounded-xl bg-gray-50 border border-transparent focus:border-blue-300 transition-all font-bold text-sm"
              />
           </div>
           <div className="flex items-center gap-4 px-6 py-4 bg-rose-50 rounded-xl border border-rose-100 mt-6">
              <input 
                type="checkbox"
                id="escalation"
                checked={formData.triggerEscalation}
                onChange={(e) => setFormData(p=>({...p, triggerEscalation: e.target.checked}))}
                className="w-5 h-5 rounded-md text-rose-600 focus:ring-rose-500"
              />
              <label htmlFor="escalation" className="text-[10px] font-black text-rose-900 uppercase tracking-widest">Picu Eskalasi ke Tier 2?</label>
           </div>
        </div>

        <div className="space-y-2">
           <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Behavior Concern</label>
           <textarea 
             value={formData.description}
             onChange={(e) => setFormData(p=>({...p, description: e.target.value}))}
             rows={3}
             className="w-full px-6 py-4 rounded-xl bg-gray-50 border border-transparent focus:border-blue-300 transition-all font-medium text-sm leading-relaxed"
           />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
           <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Interventions Tried</label>
              <textarea 
                value={formData.interventionsTried}
                onChange={(e) => setFormData(p=>({...p, interventionsTried: e.target.value}))}
                rows={2}
                className="w-full px-6 py-4 rounded-xl bg-gray-50 border border-transparent focus:border-blue-300 transition-all font-medium text-sm"
              />
           </div>
           <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Next Steps Plan</label>
              <textarea 
                value={formData.nextSteps}
                onChange={(e) => setFormData(p=>({...p, nextSteps: e.target.value}))}
                rows={2}
                className="w-full px-6 py-4 rounded-xl bg-gray-50 border border-transparent focus:border-blue-300 transition-all font-medium text-sm"
              />
           </div>
        </div>

        <div className="pt-6 flex justify-end gap-4">
           <button onClick={onClose} className="px-10 py-4 text-xs font-black uppercase tracking-widest text-gray-400 transition-all">Cancel</button>
           <button 
             onClick={handleSubmit}
             disabled={loading}
             className="px-12 py-4 bg-gray-900 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-xl flex items-center gap-3"
           >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              Simpan Data
           </button>
        </div>
      </div>
    </Modal>
  );
};

// --- Form 3: Initial Meeting Tier 2 (Wizard) ---
export const Tier2MeetingForm = ({ isOpen, onClose, mtssCase }: { isOpen: boolean, onClose: () => void, mtssCase: MTSSCase }) => {
  const { profile } = useAuth();
  const [step, setStep] = React.useState(1);
  const [loading, setLoading] = React.useState(false);
  const [formData, setFormData] = React.useState({
    meetingDate: new Date().toISOString().split('T')[0],
    parentName: '',
    age: '',
    backgroundInfo: '',
    studentAsset: mtssCase.initialAssets || '',
    problemDefinition: '',
    desiredOutcome: '',
    parentContacted: false,
    parentContactDate: '',
    interventionLetterDate: '',
    interventionDescription: '',
    frequency: 'Daily',
    responsibleParties: [] as string[],
    accommodations: '',
    meetingNotes: '',
    cicoGoals: [
      { id: 'g1', label: 'Coming to class on time' },
      { id: 'g2', label: 'Completing assigned work' },
      { id: 'g3', label: 'Following instructions' },
      { id: 'g4', label: 'Respecting peers & teachers' }
    ]
  });

  const nextStep = () => setStep(s => Math.min(s+1, 4));
  const prevStep = () => setStep(s => Math.max(s-1, 1));

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await updateMTSSCase(mtssCase.id, {
        tier: 'Tier 2',
        status: 'IN_PROGRESS',
        tier2Meeting: {
          meetingDate: formData.meetingDate,
          parentName: formData.parentName,
          backgroundInfo: formData.backgroundInfo,
          problemDefinition: formData.problemDefinition,
          desiredOutcome: formData.desiredOutcome,
          parentContacted: formData.parentContacted,
          parentContactDate: formData.parentContactDate,
          interventionLetterDate: formData.interventionLetterDate,
          interventionDescription: formData.interventionDescription,
          frequency: formData.frequency,
          responsibleParties: formData.responsibleParties,
          accommodations: formData.accommodations,
          meetingNotes: formData.meetingNotes,
          cicoGoals: formData.cicoGoals
        }
      });

      // Initialize CICO Config
      await saveCICOGoalConfig({
        caseId: mtssCase.id,
        goals: formData.cicoGoals,
        targetPercentage: 80,
        updatedAt: Date.now()
      });

      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Initial Meeting Tier 2" width="max-w-5xl">
      <div className="space-y-10">
        {/* Wizard Progress */}
        <div className="flex items-center justify-between px-10">
           {[1, 2, 3, 4].map(s => (
              <div key={s} className="flex items-center gap-2">
                 <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center text-xs font-black transition-all",
                    step === s ? "bg-blue-600 text-white shadow-xl scale-110" : step > s ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-400"
                 )}>
                    {step > s ? <CheckCircle2 size={16} /> : s}
                 </div>
                 {s < 4 && <div className={cn("w-12 h-[2px] rounded-full", step > s ? "bg-emerald-500" : "bg-gray-100")} />}
              </div>
           ))}
        </div>

        {step === 1 && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
             <div className="p-8 bg-blue-50 border border-blue-100 rounded-[2.5rem] flex items-center gap-6">
                <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-blue-600 shadow-sm"><User size={28} /></div>
                <div>
                   <h4 className="text-sm font-black italic tracking-tighter uppercase text-gray-900">Step 1: Identity & Background</h4>
                   <p className="text-[10px] font-bold text-blue-700 uppercase tracking-widest mt-1">Siswa: {mtssCase.studentName} ({mtssCase.classId})</p>
                </div>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Nama Orang Tua/Wali</label>
                   <input 
                     type="text"
                     value={formData.parentName}
                     onChange={(e) => setFormData(p=>({...p, parentName: e.target.value}))}
                     className="w-full px-6 py-4 rounded-xl bg-gray-50 border border-transparent focus:border-blue-300 transition-all font-bold text-sm"
                   />
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Tanggal Pertemuan</label>
                   <input 
                     type="date"
                     value={formData.meetingDate}
                     onChange={(e) => setFormData(p=>({...p, meetingDate: e.target.value}))}
                     className="w-full px-6 py-4 rounded-xl bg-gray-50 border border-transparent focus:border-blue-300 transition-all font-bold text-sm"
                   />
                </div>
             </div>
             <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Relevant Background Information</label>
                <textarea 
                  value={formData.backgroundInfo}
                  onChange={(e) => setFormData(p=>({...p, backgroundInfo: e.target.value}))}
                  rows={3}
                  className="w-full px-6 py-4 rounded-xl bg-gray-50 border border-transparent focus:border-blue-300 transition-all font-medium text-sm leading-relaxed"
                />
             </div>
             <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Strengths / Assets (Positive Discipline)</label>
                <textarea 
                  value={formData.studentAsset}
                  onChange={(e) => setFormData(p=>({...p, studentAsset: e.target.value}))}
                  rows={2}
                  className="w-full px-6 py-4 rounded-xl bg-gray-50 border border-transparent focus:border-blue-300 transition-all font-medium text-sm leading-relaxed"
                />
             </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
             <div className="p-8 bg-amber-50 border border-amber-100 rounded-[2.5rem] flex items-center gap-6">
                <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-amber-600 shadow-sm"><AlertCircle size={28} /></div>
                <div>
                   <h4 className="text-sm font-black italic tracking-tighter uppercase text-gray-900">Step 2: Case Analysis</h4>
                   <p className="text-[10px] font-bold text-amber-700 uppercase tracking-widest mt-1">Definition of Behavior Concerns</p>
                </div>
             </div>
             <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Definition of Problem (Specific & Measurable)</label>
                <textarea 
                  value={formData.problemDefinition}
                  onChange={(e) => setFormData(p=>({...p, problemDefinition: e.target.value}))}
                  rows={3}
                  className="w-full px-6 py-4 rounded-xl bg-gray-50 border border-transparent focus:border-blue-300 transition-all font-medium text-sm leading-relaxed"
                />
             </div>
             <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Desired Outcome / Goal</label>
                <textarea 
                  value={formData.desiredOutcome}
                  onChange={(e) => setFormData(p=>({...p, desiredOutcome: e.target.value}))}
                  rows={2}
                  className="w-full px-6 py-4 rounded-xl bg-gray-50 border border-transparent focus:border-blue-300 transition-all font-medium text-sm leading-relaxed"
                />
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4 px-6 py-4 bg-gray-50 rounded-xl border border-gray-100">
                   <div className="flex items-center gap-4">
                      <input 
                        type="checkbox"
                        checked={formData.parentContacted}
                        onChange={(e) => setFormData(p=>({...p, parentContacted: e.target.checked}))}
                        className="w-5 h-5"
                      />
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-600">Orang tua sudah dihubungi?</label>
                   </div>
                   {formData.parentContacted && (
                     <input 
                       type="date"
                       value={formData.parentContactDate}
                       onChange={(e) => setFormData(p=>({...p, parentContactDate: e.target.value}))}
                       className="w-full bg-white px-4 py-2 rounded-lg text-xs"
                     />
                   )}
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Tanggal Surat Intervensi Dikirim</label>
                   <input 
                     type="date"
                     value={formData.interventionLetterDate}
                     onChange={(e) => setFormData(p=>({...p, interventionLetterDate: e.target.value}))}
                     className="w-full px-6 py-4 rounded-xl bg-gray-50 border border-transparent focus:border-blue-300 transition-all font-bold text-sm"
                   />
                </div>
             </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
             <div className="p-8 bg-emerald-50 border border-emerald-100 rounded-[2.5rem] flex items-center gap-6">
                <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-emerald-600 shadow-sm"><Target size={28} /></div>
                <div>
                   <h4 className="text-sm font-black italic tracking-tighter uppercase text-gray-900">Step 3: Intervention Plan</h4>
                   <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest mt-1">CICO Strategy & Accommodations</p>
                </div>
             </div>
             
             <div className="space-y-6">
                <h5 className="text-[10px] font-black uppercase text-blue-900 tracking-widest px-2">CICO Goal Customization (Max 4)</h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   {formData.cicoGoals.map((g, idx) => (
                      <div key={idx} className="relative">
                         <input 
                           type="text"
                           value={g.label}
                           onChange={(e) => {
                             const newGoals = [...formData.cicoGoals];
                             newGoals[idx].label = e.target.value;
                             setFormData(p=>({...p, cicoGoals: newGoals}));
                           }}
                           className="w-full px-6 py-4 rounded-xl bg-gray-50 border border-transparent focus:border-blue-300 font-bold text-[11px] uppercase tracking-widest"
                         />
                         <div className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-600 opacity-40"><Target size={14} /></div>
                      </div>
                   ))}
                </div>
             </div>

             <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Description of Intervention Planned</label>
                <textarea 
                  value={formData.interventionDescription}
                  onChange={(e) => setFormData(p=>({...p, interventionDescription: e.target.value}))}
                  rows={3}
                  className="w-full px-6 py-4 rounded-xl bg-gray-50 border border-transparent focus:border-blue-300 transition-all font-medium text-sm leading-relaxed"
                />
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                   <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Responsible Parties</label>
                   <div className="grid grid-cols-2 gap-3">
                      {['Class Teacher', 'Counselor', 'Principal', 'Parents'].map(p => (
                         <button 
                           key={p}
                           onClick={() => {
                              const newParties = formData.responsibleParties.includes(p) 
                                ? formData.responsibleParties.filter(x => x !== p)
                                : [...formData.responsibleParties, p];
                              setFormData(prev => ({ ...prev, responsibleParties: newParties }));
                           }}
                           className={cn(
                              "px-4 py-3 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all text-left flex items-center justify-between",
                              formData.responsibleParties.includes(p) ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-400 border-gray-100 hover:border-blue-100 hover:text-blue-600"
                           )}
                         >
                            {p}
                            {formData.responsibleParties.includes(p) && <CheckCircle2 size={12} />}
                         </button>
                      ))}
                   </div>
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Accommodations / Special Needs</label>
                   <textarea 
                     value={formData.accommodations}
                     onChange={(e) => setFormData(p=>({...p, accommodations: e.target.value}))}
                     rows={3}
                     className="w-full px-6 py-4 rounded-xl bg-gray-50 border border-transparent focus:border-blue-300 transition-all font-medium text-sm leading-relaxed"
                   />
                </div>
             </div>
          </motion.div>
        )}

        {step === 4 && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-8">
             <div className="p-10 bg-gray-900 text-white rounded-[3rem] shadow-3xl space-y-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10 rotate-12"><CheckCircle2 size={140} /></div>
                <div className="relative z-10">
                   <h3 className="text-3xl font-black italic tracking-tighter uppercase leading-none">Review Final Strategy</h3>
                   <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em] mt-2">Pastikan semua data sudah sesuai kesepakatan pertemuan</p>
                </div>
                
                <div className="relative z-10 grid grid-cols-2 gap-10">
                   <div className="space-y-6">
                      <div>
                         <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Problem Definition</p>
                         <p className="text-sm font-bold mt-1 text-white/90 italic leading-relaxed">{formData.problemDefinition || 'Not defined'}</p>
                      </div>
                      <div>
                         <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">CICO Calibration</p>
                         <div className="flex flex-wrap gap-2 mt-2">
                            {formData.cicoGoals.map((g, i) => (
                               <span key={i} className="px-4 py-2 bg-white/10 rounded-lg text-[9px] font-bold uppercase">{g.label}</span>
                            ))}
                         </div>
                      </div>
                   </div>
                   <div className="space-y-6">
                      <div>
                         <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Intervention</p>
                         <p className="text-sm font-bold mt-1 text-white/90 italic leading-relaxed">{formData.interventionDescription || 'Not defined'}</p>
                      </div>
                      <div>
                         <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Responsible Parties</p>
                         <p className="text-xs font-black uppercase text-blue-300 mt-1 italic tracking-tighter">{formData.responsibleParties.join(', ')}</p>
                      </div>
                   </div>
                </div>
             </div>
             
             <div className="p-8 bg-emerald-50 border border-emerald-100 rounded-[2rem] flex items-center justify-between gap-10">
                <div className="flex items-center gap-6">
                   <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-emerald-600 shadow-sm"><ShieldCheck size={28} /></div>
                   <div>
                      <h4 className="text-[11px] font-black uppercase tracking-widest text-gray-900 leading-none">Confirmation</h4>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1 italic">Case will escalate to Tier 2 & CICO Modules will activate for this student.</p>
                   </div>
                </div>
             </div>
          </motion.div>
        )}

        <div className={cn("pt-6 shrink-0 flex items-center gap-4", step === 4 ? "flex-col" : "justify-between")}>
           <div className="flex gap-4">
              {step > 1 && (
                <button 
                  onClick={prevStep}
                  className="px-8 py-4 rounded-xl text-xs font-black uppercase tracking-widest text-gray-400 hover:text-gray-900 flex items-center gap-2"
                >
                   <ChevronLeft size={16} /> Back
                </button>
              )}
           </div>
           
           {step < 4 ? (
              <button 
                onClick={nextStep}
                className="px-12 py-5 bg-[#002366] text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-xl flex items-center gap-3 hover:scale-105 transition-all"
              >
                 Lanjut <ChevronRight size={18} />
              </button>
           ) : (
              <button 
                onClick={handleSubmit}
                disabled={loading}
                className="w-full py-6 bg-emerald-600 text-white rounded-2xl text-sm font-black uppercase tracking-[0.2em] shadow-2xl flex items-center justify-center gap-4 hover:bg-emerald-700 transition-all disabled:opacity-50"
              >
                 {loading ? <Loader2 className="animate-spin" size={24} /> : <CheckCircle2 size={24} />}
                 Mulai Tier 2 & Aktifkan CICO
              </button>
           )}
        </div>
      </div>
    </Modal>
  );
};

// --- Form 4: Close Case Form ---
export const CloseCaseForm = ({ isOpen, onClose, mtssCase }: { isOpen: boolean, onClose: () => void, mtssCase: MTSSCase }) => {
  const { profile } = useAuth();
  const [loading, setLoading] = React.useState(false);
  const [formData, setFormData] = React.useState({
    reason: '',
    notes: '',
    generateReport: true,
    confirmClose: false
  });

  const REASONS = [
    'Perilaku tidak muncul selama 1 bulan (Tier 1)',
    'Intervensi Tier 2 berhasil',
    'Intervensi Tier 3 berhasil',
    'Siswa pindah sekolah',
    'Lainnya'
  ];

  const handleSubmit = async () => {
    if (!formData.reason || !formData.confirmClose) return;
    setLoading(true);
    try {
      await closeMTSSCase(mtssCase.id, {
        reason: formData.reason,
        notes: formData.notes,
        closedAt: Date.now(),
        closedBy: profile?.displayName || 'System'
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Tutup Kasus Perilaku">
      <div className="space-y-10">
         <div className="p-8 bg-rose-50 border border-rose-100 rounded-[2.5rem] flex items-center gap-6">
            <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-rose-600 shadow-sm"><Trash2 size={28} /></div>
            <div>
               <h4 className="text-sm font-black italic tracking-tighter uppercase text-rose-900 leading-none">Menutup Kasus: {mtssCase.studentName}</h4>
               <p className="text-[10px] font-bold text-rose-700 uppercase tracking-widest mt-1">Status saat ini: {mtssCase.tier} ({mtssCase.status})</p>
            </div>
         </div>

         <div className="space-y-8">
            <div className="space-y-4">
               <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Alasan Penutupan</label>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {REASONS.map(r => (
                     <button
                       key={r}
                       onClick={() => setFormData(p=>({...p, reason: r}))}
                       className={cn(
                          "px-6 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest text-left border transition-all",
                          formData.reason === r ? "bg-rose-600 text-white border-rose-600 shadow-xl" : "bg-white text-gray-400 border-gray-100 hover:border-rose-100 hover:text-rose-600"
                       )}
                     >
                        {r}
                     </button>
                  ))}
               </div>
            </div>

            <div className="space-y-2">
               <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Catatan Penutupan</label>
               <textarea 
                 value={formData.notes}
                 onChange={(e) => setFormData(p=>({...p, notes: e.target.value}))}
                 rows={3}
                 className="w-full px-6 py-4 rounded-xl bg-gray-50 border border-transparent focus:border-rose-300 transition-all font-medium text-sm leading-relaxed"
                 placeholder="Tuliskan evaluasi akhir singkat..."
               />
            </div>

            <div className="space-y-4 pt-6 border-t border-gray-50">
               <div className="flex items-center gap-4">
                  <input 
                    type="checkbox"
                    id="genReport"
                    checked={formData.generateReport}
                    onChange={(e) => setFormData(p=>({...p, generateReport: e.target.checked}))}
                    className="w-6 h-6 rounded-lg text-blue-600"
                  />
                  <label htmlFor="genReport" className="text-xs font-black uppercase tracking-widest text-gray-600">Simpan sebagai PDF Summary Report?</label>
               </div>
               <div className="flex items-center gap-4 p-6 bg-gray-900 rounded-2xl text-white">
                  <input 
                    type="checkbox"
                    id="confirm"
                    checked={formData.confirmClose}
                    onChange={(e) => setFormData(p=>({...p, confirmClose: e.target.checked}))}
                    className="w-6 h-6 rounded-lg text-emerald-500 bg-white"
                  />
                  <label htmlFor="confirm" className="text-[10px] font-black uppercase tracking-widest">Saya yakin kasus ini sudah bisa ditutup dan intervensi dihentikan.</label>
               </div>
            </div>
         </div>

         <div className="flex justify-end gap-4">
            <button onClick={onClose} className="px-10 py-4 text-xs font-black uppercase tracking-widest text-gray-400">Cancel</button>
            <button 
              onClick={handleSubmit}
              disabled={loading || !formData.confirmClose || !formData.reason}
              className="px-12 py-5 bg-rose-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-xl flex items-center gap-3 disabled:opacity-50 hover:bg-rose-700 transition-all"
            >
               {loading ? <Loader2 className="animate-spin" size={18} /> : <Trash2 size={18} />}
               Tutup Kasus Permanen
            </button>
         </div>
      </div>
    </Modal>
  );
};
