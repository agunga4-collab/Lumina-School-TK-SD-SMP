import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Search, Filter, Trash2, Edit2, BookOpen, 
  ChevronRight, AlertCircle, Loader2, Calendar, User, 
  Tag, Clock, CheckCircle2, X, ChevronLeft, Save, 
  Info, Target, Smile, Brain, Sparkles, Footprints,
  Type, HelpCircle, LayoutGrid, Milestone
} from 'lucide-react';
import { useOutletContext, useNavigate, useParams } from 'react-router-dom';
import { 
  getLXDById, addLXD, updateLXD, 
  getLearningGoals 
} from '../../lib/firebase';
import { 
  LXD, User as AppUser, UnitType, LXDType, 
  LearningGoal, LXDMeeting, RubricRow, IntegralStrands 
} from '../../types';
import { cn } from '../../lib/utils';
import { ACADEMIC_SUBJECTS, ACADEMIC_YEARS, ACADEMIC_GRADES } from '../../constants';

// --- Constants ---
const ASSESSMENT_TYPES = ["Formative", "AaL", "AfL", "AoL", "Exit Ticket", "Quiz", "Project", "Observation", "Self-Assessment", "Peer-Assessment"];
const INSTRUCTIONAL_STRATEGIES = ["Think-Pair-Share", "Gallery Walk", "Socratic Seminar", "Jigsaw", "Flipped Classroom", "Direct Instruction", "Inquiry-based", "Experiential Learning"];
const INTEGRAL_INDICATORS = {
  moralSpiritual: ["Self-awareness", "Empathy", "Integrity", "Justice", "Compassion", "Service"],
  imaginal: ["Creativity", "Visualisation", "Aesthetics", "Intuition", "Playfulness"],
  rational: ["Critical Thinking", "Problem Solving", "Logic", "Analysis", "Evaluation"],
  materialPhysical: ["Physical Literacy", "Sustainability", "Wellness", "Precision", "Technical Skill"]
};

const STRAND_ICONS = {
  moralSpiritual: <Smile size={20} className="text-pink-500" />,
  imaginal: <Sparkles size={20} className="text-purple-500" />,
  rational: <Brain size={20} className="text-blue-500" />,
  materialPhysical: <Footprints size={20} className="text-emerald-500" />
};

export default function LXDForm() {
  const { currentUser, activeUnit } = useOutletContext<{ currentUser: AppUser, activeUnit: UnitType }>();
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [loading, setLoading] = React.useState(isEdit);
  const [submitting, setSubmitting] = React.useState(false);
  const [step, setStep] = React.useState(0);
  const [lxdType, setLxdType] = React.useState<LXDType>("WEEKLY_LESSONS");
  
  // Bank LGs for selection
  const [bankLgs, setBankLgs] = React.useState<LearningGoal[]>([]);
  const [lgSearch, setLgSearch] = React.useState('');

  // Main Form State
  const [formData, setFormData] = React.useState<Partial<LXD>>({
    title: "",
    unitId: activeUnit as any,
    academicYear: "2025/2026",
    semester: "1",
    status: "DRAFT",
    linkedGoals: [],
    integralStrands: {
      moralSpiritual: { indicators: [], narrative: "" },
      imaginal: { indicators: [], narrative: "" },
      rational: { indicators: [], narrative: "" },
      materialPhysical: { indicators: [], narrative: "" }
    },
    differentiatedInstruction: {
      content: "", process: "", product: "", environment: ""
    },
    rubric: [],
    // Initial specific fields
    meetings: [],
    subUnits: [],
    milestones: []
  });

  // Fetch initial data if edit
  React.useEffect(() => {
    if (isEdit && id) {
      getLXDById(id).then(data => {
        if (data) {
          setFormData(data);
          setLxdType(data.type);
        }
        setLoading(false);
      });
    }
  }, [id, isEdit]);

  // Fetch LGs based on filters
  React.useEffect(() => {
    const fetchLgs = async () => {
      // For WL/UA, fetch by single subject. For LJ, fetch all in unit/grade.
      const data = await getLearningGoals({
        unitId: formData.unitId,
        isActive: true
      });
      setBankLgs(data);
    };
    fetchLgs();
  }, [formData.unitId]);

  const steps = lxdType === 'LEARNING_JOURNEY' 
    ? ["Basic Info", "Project Details", "Learning Goals", "Prerequisite Skills", "Integral Strands", "Milestones & Meetings", "Differentiation", "Assessment Rubric"]
    : ["Basic Info", "Learning Goals", "Integral Strands", lxdType === 'WEEKLY_LESSONS' ? "Meetings" : "Sub-Units & Meetings", "Differentiation", "Assessment Rubric"];

  const handleNext = () => {
    if (step < steps.length - 1) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      const payload = {
        ...formData,
        type: lxdType,
        createdBy: currentUser.email,
        unitId: activeUnit as any
      } as Omit<LXD, 'id' | 'createdAt' | 'updatedAt'>;

      if (isEdit && id) {
        await updateLXD(id, payload);
      } else {
        await addLXD(payload);
      }
      navigate('/academic/lxd');
    } catch (error: any) {
      alert(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Helper: Add Meeting
  const addMeeting = (container?: any) => {
    const newMeeting: LXDMeeting = {
      meetingNumber: (container?.meetings?.length || formData.meetings?.length || 0) + 1,
      title: "",
      learningObjective: [""],
      opening: "",
      mainActivities: "",
      closing: "",
      assessmentNotes: "",
      assessmentType: [],
      differentiationNotes: { content: "", product: "", process: "" },
      instructionalStrategies: []
    };

    if (lxdType === 'WEEKLY_LESSONS') {
      setFormData({ ...formData, meetings: [...(formData.meetings || []), newMeeting] });
    } else if (lxdType === 'UNIT_AKTIVITAS') {
      const newSubUnits = [...(formData.subUnits || [])];
      const idx = newSubUnits.findIndex(u => u.uaNumber === container.uaNumber);
      newSubUnits[idx].meetings.push(newMeeting);
      setFormData({ ...formData, subUnits: newSubUnits });
    } else {
      const newMilestones = [...(formData.milestones || [])];
      const idx = newMilestones.findIndex(m => m.milestoneNumber === container.milestoneNumber);
      newMilestones[idx].meetings.push(newMeeting);
      setFormData({ ...formData, milestones: newMilestones });
    }
  };

  if (loading) {
    return (
      <div className="py-40 text-center">
         <Loader2 size={40} className="text-blue-100 animate-spin mx-auto mb-4" />
         <p className="text-gray-400 font-bold uppercase tracking-widest text-sm">Menyiapkan Form LXD...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-10 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-6">
           <button 
             onClick={() => navigate('/academic/lxd')}
             className="p-4 bg-white rounded-3xl border border-gray-100 shadow-sm hover:scale-105 active:scale-95 transition-all text-gray-400"
           >
              <ChevronLeft size={24} />
           </button>
           <div className="space-y-1">
              <h1 className="text-3xl font-black tracking-tight italic uppercase text-gray-900">
                {isEdit ? "Edit LXD" : "Desain Pembelajaran Baru"}
              </h1>
              <div className="flex items-center gap-2">
                 <Type size={14} className="text-blue-500" />
                 <span className="text-xs font-black text-blue-500 uppercase tracking-widest">{lxdType.replace('_', ' ')}</span>
              </div>
           </div>
        </div>

        {!isEdit && step === 0 && (
           <div className="flex p-1 bg-gray-100/50 rounded-2xl">
             {(["WEEKLY_LESSONS", "UNIT_AKTIVITAS", "LEARNING_JOURNEY"] as LXDType[]).map((t) => (
               <button
                 key={t}
                 onClick={() => {
                   setLxdType(t);
                   setStep(0);
                 }}
                 className={cn(
                   "px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                   lxdType === t ? "bg-white text-blue-600 shadow-sm" : "text-gray-400"
                 )}
               >
                 {t.split('_')[0]}
               </button>
             ))}
           </div>
        )}
      </div>

      {/* Stepper */}
      <div className="relative">
         <div className="absolute top-1/2 left-0 w-full h-0.5 bg-gray-100 -translate-y-1/2 -z-10" />
         <div className="flex justify-between items-center px-2">
            {steps.map((s, i) => (
              <div key={s} className="flex flex-col items-center gap-3">
                 <div className={cn(
                   "w-10 h-10 rounded-full flex items-center justify-center font-black text-sm transition-all border-4",
                   step === i 
                     ? "bg-[#002366] text-white border-blue-100 ring-4 ring-[#002366]/5" 
                     : step > i ? "bg-emerald-500 text-white border-white" : "bg-white text-gray-300 border-gray-50"
                 )}>
                    {step > i ? <CheckCircle2 size={16} /> : i + 1}
                 </div>
                 <span className={cn(
                   "hidden md:block text-[9px] font-black uppercase tracking-widest",
                   step === i ? "text-blue-600" : "text-gray-400"
                 )}>{s}</span>
              </div>
            ))}
         </div>
      </div>

      {/* Form Content */}
      <div className="bg-white rounded-[3rem] border border-gray-100 shadow-2xl shadow-blue-50/50 overflow-hidden min-h-[600px]">
         {/* Step Content Wrapper */}
         <div className="p-12">
            <AnimatePresence mode="wait">
               <motion.div
                 key={step}
                 initial={{ opacity: 0, x: 20 }}
                 animate={{ opacity: 1, x: 0 }}
                 exit={{ opacity: 0, x: -20 }}
                 className="space-y-10"
               >
                  {/* Step Title Decoration */}
                  <div className="flex items-center gap-3">
                     <div className="w-1.5 h-8 bg-blue-600 rounded-full" />
                     <h2 className="text-xl font-black text-gray-900 tracking-tight italic uppercase">{steps[step]}</h2>
                  </div>

                  {/* Render based on step and type */}
                  {step === 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                       <FormField label="Judul LXD / Proyek">
                          <input 
                            type="text" 
                            className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl font-bold" 
                            placeholder="Contoh: Haji & Umrah, Eksplorasi Ekosistem..."
                            value={formData.title}
                            onChange={e => setFormData({...formData, title: e.target.value})}
                            required
                          />
                       </FormField>

                       <FormField label="Tahun Akademik">
                          <select 
                            className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl font-black"
                            value={formData.academicYear}
                            onChange={e => setFormData({...formData, academicYear: e.target.value})}
                          >
                             {ACADEMIC_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                          </select>
                       </FormField>

                       <FormField label="Semester">
                          <div className="flex gap-2">
                             {['1', '2'].map(s => (
                               <button
                                 key={s}
                                 type="button"
                                 onClick={() => setFormData({...formData, semester: s as any})}
                                 className={cn(
                                   "flex-1 py-3 rounded-2xl text-xs font-black transition-all",
                                   formData.semester === s ? "bg-blue-600 text-white shadow-xl shadow-blue-200" : "bg-gray-50 text-gray-400"
                                 )}
                               >
                                 Semester {s}
                               </button>
                             ))}
                          </div>
                       </FormField>

                       {lxdType !== 'LEARNING_JOURNEY' && (
                         <>
                           <FormField label="Kelas (Grade)">
                              <select 
                                className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl font-black"
                                value={formData.grade}
                                onChange={e => setFormData({...formData, grade: e.target.value})}
                                required
                              >
                                 <option value="">Pilih Kelas</option>
                                 {ACADEMIC_GRADES[formData.unitId as any]?.map(g => <option key={g} value={g}>Kelas {g}</option>)}
                              </select>
                           </FormField>

                           <FormField label="Mata Pelajaran">
                              <select 
                                className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl font-black"
                                value={formData.subject}
                                onChange={e => setFormData({...formData, subject: e.target.value})}
                                required
                              >
                                 <option value="">Pilih Mapel</option>
                                 {ACADEMIC_SUBJECTS[formData.unitId as any]?.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                              </select>
                           </FormField>

                           <FormField label="Weeks">
                              <input 
                                type="text" 
                                className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl font-bold" 
                                placeholder="e.g. 1-4"
                                value={formData.weeks}
                                onChange={e => setFormData({...formData, weeks: e.target.value})}
                              />
                           </FormField>

                           <FormField label="Duration">
                              <input 
                                type="text" 
                                className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl font-bold" 
                                placeholder="e.g. 4 Meetings (8x40m)"
                                value={formData.duration}
                                onChange={e => setFormData({...formData, duration: e.target.value})}
                              />
                           </FormField>

                           <FormField label="Essential Question" className="md:col-span-2">
                             <textarea 
                                className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl font-bold min-h-[100px]" 
                                placeholder="Pertanyaan pemantik utama..."
                                value={formData.essentialQuestion}
                                onChange={e => setFormData({...formData, essentialQuestion: e.target.value})}
                             />
                           </FormField>
                         </>
                       )}

                       {lxdType === 'LEARNING_JOURNEY' && (
                         <>
                           <FormField label="Date Range">
                              <input 
                                type="text" 
                                className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl font-bold" 
                                placeholder="e.g. 9 April - 16 May 2025"
                                value={formData.dateRange}
                                onChange={e => setFormData({...formData, dateRange: e.target.value})}
                              />
                           </FormField>
                           <FormField label="Number of Meetings">
                              <input 
                                type="number" 
                                className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl font-bold" 
                                value={formData.numberOfMeetings || 0}
                                onChange={e => setFormData({...formData, numberOfMeetings: parseInt(e.target.value)})}
                              />
                           </FormField>
                         </>
                       )}
                    </div>
                  )}

                  {/* Subject and Teachers for LJ (Specific Step) */}
                  {lxdType === 'LEARNING_JOURNEY' && step === 1 && (
                    <div className="space-y-10">
                       <FormField label="Project Theme & Overview">
                          <textarea 
                            className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl font-bold min-h-[120px]" 
                            placeholder="Narasi umum pengalaman belajar proyek ini..."
                            value={formData.learningExperienceOverview}
                            onChange={e => setFormData({...formData, learningExperienceOverview: e.target.value})}
                          />
                       </FormField>

                       <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <FormField label="Materials & Resources">
                             <textarea 
                                className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl font-bold min-h-[100px]" 
                                placeholder="Daftar buku, link, alat, dll..."
                                value={formData.materialsAndResources}
                                onChange={e => setFormData({...formData, materialsAndResources: e.target.value})}
                             />
                          </FormField>
                          <FormField label="Meet the Expert / Visit (Optional)">
                             <textarea 
                                className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl font-bold min-h-[100px]" 
                                placeholder="Rencana kunjungan atau narasumber..."
                                value={formData.meetTheExpert}
                                onChange={e => setFormData({...formData, meetTheExpert: e.target.value})}
                             />
                          </FormField>
                       </div>

                       <div className="space-y-4">
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Interdisciplinary Subjects & Teachers</label>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             {ACADEMIC_SUBJECTS[formData.unitId as any]?.map(s => {
                               const isSelected = formData.interdisciplinarySubjects?.includes(s.name);
                               return (
                                 <button
                                   key={s.name}
                                   type="button"
                                   onClick={() => {
                                      const current = formData.interdisciplinarySubjects || [];
                                      const next = isSelected ? current.filter(x => x !== s.name) : [...current, s.name];
                                      setFormData({...formData, interdisciplinarySubjects: next});
                                   }}
                                   className={cn(
                                     "p-4 rounded-[1.5rem] flex items-center justify-between transition-all border-2",
                                     isSelected ? "border-blue-600 bg-blue-50 text-blue-700 shadow-lg shadow-blue-100/50 scale-[1.02]" : "border-gray-50 text-gray-500 hover:border-gray-200"
                                   )}
                                 >
                                    <span className="text-xs font-bold uppercase tracking-wider">{s.name}</span>
                                    {isSelected ? <CheckCircle2 size={16} /> : <div className="w-4 h-4 rounded-full border-2 border-gray-100" />}
                                 </button>
                               );
                             })}
                          </div>
                       </div>
                    </div>
                  )}

                  {/* Learning Goals Step */}
                  {((lxdType !== 'LEARNING_JOURNEY' && step === 1) || (lxdType === 'LEARNING_JOURNEY' && step === 2)) && (
                    <div className="space-y-8">
                       <div className="relative">
                          <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                          <input 
                            type="text" 
                            placeholder="Cari dalam Bank Learning Goals..."
                            value={lgSearch}
                            onChange={e => setLgSearch(e.target.value)}
                            className="w-full pl-16 pr-6 py-5 bg-gray-50 border-none rounded-[1.5rem] font-bold text-sm focus:ring-4 focus:ring-blue-100/30"
                          />
                       </div>

                       <div className="grid grid-cols-1 gap-4 max-h-[500px] overflow-y-auto pr-4 custom-scrollbar">
                          {bankLgs.filter(lg => {
                             const matchesSearch = lg.goalText.toLowerCase().includes(lgSearch.toLowerCase()) || lg.code.toLowerCase().includes(lgSearch.toLowerCase());
                             // Filter by subject for non-LJ
                             const matchesSubject = lxdType !== 'LEARNING_JOURNEY' ? lg.subject === formData.subject : formData.interdisciplinarySubjects?.includes(lg.subject);
                             const matchesGrade = lxdType !== 'LEARNING_JOURNEY' ? lg.grade === formData.grade : true; // LJ allows multi grade
                             return matchesSearch && matchesSubject && matchesGrade;
                          }).map(lg => {
                             const isSelected = lxdType !== 'LEARNING_JOURNEY' 
                                ? (formData.linkedGoals as string[]).includes(lg.id)
                                : (formData.linkedGoals as any[]).some(x => x.goalId === lg.id);

                             return (
                               <button
                                 key={lg.id}
                                 type="button"
                                 onClick={() => {
                                    if (lxdType !== 'LEARNING_JOURNEY') {
                                       const current = formData.linkedGoals as string[];
                                       const next = isSelected ? current.filter(id => id !== lg.id) : [...current, lg.id];
                                       setFormData({...formData, linkedGoals: next});
                                    } else {
                                       const current = formData.linkedGoals as any[];
                                       const next = isSelected ? current.filter(x => x.goalId !== lg.id) : [...current, { goalId: lg.id, subject: lg.subject }];
                                       setFormData({...formData, linkedGoals: next});
                                    }
                                 }}
                                 className={cn(
                                   "p-6 rounded-[2rem] border-2 transition-all flex items-start gap-6 text-left group",
                                   isSelected ? "border-blue-600 bg-blue-50/50 shadow-lg shadow-blue-100/30" : "border-gray-50 hover:border-gray-200"
                                 )}
                               >
                                  <div className={cn(
                                    "mt-1 w-6 h-6 rounded-lg flex items-center justify-center transition-all",
                                    isSelected ? "bg-blue-600 text-white" : "bg-gray-100 text-transparent"
                                  )}>
                                     <CheckCircle2 size={16} />
                                  </div>
                                  <div className="flex-1 space-y-1">
                                     <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">{lg.code}</span>
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">•</span>
                                        <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">{lg.subject} Class {lg.grade}</span>
                                     </div>
                                     <p className="text-sm font-bold text-gray-700 leading-relaxed group-hover:text-blue-900">{lg.goalText}</p>
                                  </div>
                               </button>
                             );
                          })}
                       </div>
                    </div>
                  )}

                  {/* Prerequisite Skills (LJ only) */}
                  {lxdType === 'LEARNING_JOURNEY' && step === 3 && (
                    <div className="space-y-8">
                       {formData.interdisciplinarySubjects?.map((subj, idx) => (
                         <div key={subj} className="p-8 bg-gray-50/50 rounded-[2.5rem] space-y-4 border border-gray-100">
                            <div className="flex items-center gap-3">
                               <div className="px-3 py-1 bg-blue-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest">{subj}</div>
                               <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Prerequisite Skills</h3>
                            </div>
                            <textarea 
                              className="w-full px-6 py-4 bg-white border-none rounded-2xl font-bold min-h-[80px]" 
                              placeholder={`Apa yang harus sudah dikuasai siswa di mapel ${subj} sebelum proyek ini?`}
                              value={formData.prerequisiteSkills?.find(p => p.subject === subj)?.skills.join('\n') || ""}
                              onChange={e => {
                                 const current = formData.prerequisiteSkills || [];
                                 const existIdx = current.findIndex(p => p.subject === subj);
                                 const next = [...current];
                                 const skillArr = e.target.value.split('\n').filter(s => s.trim() !== "");
                                 if (existIdx > -1) {
                                    next[existIdx] = { ...next[existIdx], skills: skillArr };
                                 } else {
                                    next.push({ subject: subj, skills: skillArr });
                                 }
                                 setFormData({...formData, prerequisiteSkills: next});
                              }}
                            />
                         </div>
                       ))}
                    </div>
                  )}

                  {/* Integral Strands */}
                  {((lxdType !== 'LEARNING_JOURNEY' && step === 2) || (lxdType === 'LEARNING_JOURNEY' && step === 4)) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                       {(Object.keys(INTEGRAL_INDICATORS) as Array<keyof typeof INTEGRAL_INDICATORS>).map(strand => (
                         <div key={strand} className="p-8 bg-gray-50/50 rounded-[3rem] border border-gray-100 space-y-6">
                            <div className="flex items-center justify-between">
                               <div className="flex items-center gap-3">
                                  {STRAND_ICONS[strand]}
                                  <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">{strand.replace(/([A-Z])/g, ' $1')}</h3>
                               </div>
                            </div>

                            <div className="space-y-2">
                               <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Indicators</label>
                               <div className="flex flex-wrap gap-2">
                                  {INTEGRAL_INDICATORS[strand].map(ind => {
                                     const isSelected = formData.integralStrands?.[strand]?.indicators.includes(ind);
                                     return (
                                       <button
                                         key={ind}
                                         type="button"
                                         onClick={() => {
                                            const current = formData.integralStrands || ({} as IntegralStrands);
                                            const strandData = current[strand] || { indicators: [], narrative: "" };
                                            const nextInd = isSelected ? strandData.indicators.filter(x => x !== ind) : [...strandData.indicators, ind];
                                            setFormData({
                                               ...formData,
                                               integralStrands: { ...current, [strand]: { ...strandData, indicators: nextInd } }
                                            });
                                         }}
                                         className={cn(
                                           "px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border-2",
                                           isSelected ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-400 border-gray-100 hover:border-blue-200"
                                         )}
                                       >
                                         {ind}
                                       </button>
                                     );
                                  })}
                               </div>
                            </div>

                            <div className="space-y-2">
                               <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Narrative Journey</label>
                               <textarea 
                                 className="w-full px-5 py-4 bg-white border-none rounded-2xl text-xs font-bold italic h-32 focus:ring-2 focus:ring-blue-100"
                                 placeholder="Apa yang akan siswa alami terkait strand ini?"
                                 value={formData.integralStrands?.[strand]?.narrative || ""}
                                 onChange={e => {
                                    const current = formData.integralStrands || ({} as IntegralStrands);
                                    const strandData = current[strand] || { indicators: [], narrative: "" };
                                    setFormData({
                                       ...formData,
                                       integralStrands: { ...current, [strand]: { ...strandData, narrative: e.target.value } }
                                    });
                                 }}
                               />
                            </div>
                         </div>
                       ))}
                    </div>
                  )}

                  {/* Meetings Step (Generic Wrapper) */}
                  {((lxdType === 'WEEKLY_LESSONS' && step === 3) || 
                    (lxdType === 'UNIT_AKTIVITAS' && step === 3) || 
                    (lxdType === 'LEARNING_JOURNEY' && step === 5)) && (
                    <div className="space-y-12">
                       {/* Milestone/Sub-Unit Management */}
                       {lxdType === 'UNIT_AKTIVITAS' && (
                         <div className="space-y-8">
                            {formData.subUnits?.map((ua, uIdx) => (
                              <SubUnitBlock 
                                key={ua.uaNumber} 
                                ua={ua} 
                                onAddMeeting={() => addMeeting(ua)}
                                onUpdateMeeting={(mIdx, mData) => {
                                   const next = [...(formData.subUnits || [])];
                                   next[uIdx].meetings[mIdx] = mData;
                                   setFormData({...formData, subUnits: next});
                                }}
                                onRemoveMeeting={(mIdx) => {
                                   const next = [...(formData.subUnits || [])];
                                   next[uIdx].meetings.splice(mIdx, 1);
                                   setFormData({...formData, subUnits: next});
                                }}
                                onRemoveUA={() => {
                                   const next = formData.subUnits?.filter(x => x.uaNumber !== ua.uaNumber);
                                   setFormData({...formData, subUnits: next});
                                }}
                              />
                            ))}
                            <button 
                              onClick={() => {
                                 const nextNum = (formData.subUnits?.length || 0) + 1;
                                 setFormData({
                                    ...formData, 
                                    subUnits: [...(formData.subUnits || []), { uaNumber: nextNum, uaTitle: `UA ${nextNum}`, meetings: [] }]
                                 });
                              }}
                              className="w-full py-8 border-4 border-dashed border-gray-100 rounded-[3rem] text-gray-300 font-black uppercase tracking-[0.2em] flex items-center justify-center gap-4 hover:border-blue-100 hover:text-blue-400 transition-all"
                            >
                               <Plus size={32} /> Tambah Sub-Unit (UA)
                            </button>
                         </div>
                       )}

                       {lxdType === 'LEARNING_JOURNEY' && (
                         <div className="space-y-8">
                            {formData.milestones?.map((ml, mIdx) => (
                              <MilestoneBlock 
                                key={ml.milestoneNumber} 
                                ml={ml} 
                                onAddMeeting={() => addMeeting(ml)}
                                onUpdateMeeting={(mtIdx, mData) => {
                                   const next = [...(formData.milestones || [])];
                                   next[mIdx].meetings[mtIdx] = mData;
                                   setFormData({...formData, milestones: next});
                                }}
                                onRemoveMeeting={(mtIdx) => {
                                   const next = [...(formData.milestones || [])];
                                   next[mIdx].meetings.splice(mtIdx, 1);
                                   setFormData({...formData, milestones: next});
                                }}
                                onRemoveML={() => {
                                   const next = formData.milestones?.filter(x => x.milestoneNumber !== ml.milestoneNumber);
                                   setFormData({...formData, milestones: next});
                                }}
                              />
                            ))}
                            <button 
                              onClick={() => {
                                 const nextNum = (formData.milestones?.length || 0) + 1;
                                 setFormData({
                                    ...formData, 
                                    milestones: [...(formData.milestones || []), { milestoneNumber: nextNum, milestoneTitle: "", meetings: [] }]
                                 });
                              }}
                              className="w-full py-8 border-4 border-dashed border-gray-100 rounded-[3rem] text-gray-300 font-black uppercase tracking-[0.2em] flex items-center justify-center gap-4 hover:border-blue-100 hover:text-blue-400 transition-all"
                            >
                               <Plus size={32} /> Tambah Milestone Proyek
                            </button>
                         </div>
                       )}

                       {lxdType === 'WEEKLY_LESSONS' && (
                         <div className="space-y-8">
                            {formData.meetings?.map((m, mIdx) => (
                              <MeetingBlock 
                                key={m.meetingNumber} 
                                meeting={m} 
                                showMilestone={false}
                                onUpdate={(data) => {
                                   const next = [...(formData.meetings || [])];
                                   next[mIdx] = data;
                                   setFormData({...formData, meetings: next});
                                }}
                                onRemove={() => {
                                   const next = formData.meetings?.filter(x => x.meetingNumber !== m.meetingNumber);
                                   setFormData({...formData, meetings: next});
                                }}
                              />
                            ))}
                            <button 
                              onClick={() => addMeeting()}
                              className="w-full py-8 border-4 border-dashed border-gray-100 rounded-[3rem] text-gray-300 font-black uppercase tracking-[0.2em] flex items-center justify-center gap-4 hover:border-blue-100 hover:text-blue-400 transition-all"
                            >
                               <Plus size={32} /> Tambah Pertemuan (Meeting)
                            </button>
                         </div>
                       )}
                    </div>
                  )}

                  {/* Differentiated Instruction */}
                  {((lxdType !== 'LEARNING_JOURNEY' && step === 4) || (lxdType === 'LEARNING_JOURNEY' && step === 6)) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                       {['content', 'process', 'product', 'environment'].map((field) => (
                         <FormField key={field} label={`Differentiated ${field.charAt(0).toUpperCase() + field.slice(1)}`}>
                            <textarea 
                              className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl font-bold min-h-[120px]" 
                              placeholder={`Jelaskan penyesuaian untuk ${field}...`}
                              value={(formData.differentiatedInstruction as any)?.[field]}
                              onChange={e => setFormData({
                                ...formData, 
                                differentiatedInstruction: { ...formData.differentiatedInstruction, [field]: e.target.value } as any
                              })}
                            />
                         </FormField>
                       ))}
                    </div>
                  )}

                  {/* Rubric Step */}
                  {((lxdType !== 'LEARNING_JOURNEY' && step === 5) || (lxdType === 'LEARNING_JOURNEY' && step === 7)) && (
                    <div className="space-y-8">
                       <div className="flex items-center justify-between">
                          <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">Generate Rubrik bersadarkan Learning Goals terpilih</p>
                          <button 
                            type="button"
                            onClick={() => {
                               const lgIds = lxdType !== 'LEARNING_JOURNEY' 
                                 ? (formData.linkedGoals as string[]) 
                                 : (formData.linkedGoals as any[]).map(x => x.goalId);
                               
                               const selectedLgs = bankLgs.filter(lg => lgIds.includes(lg.id));
                               const newRubric: RubricRow[] = selectedLgs.map(lg => ({
                                  goalId: lg.id,
                                  goalSubject: lg.subject,
                                  criteriaLabel: "Penguasaan Materi",
                                  beginning: "",
                                  developing: "",
                                  achieved: "",
                                  assessedInMeeting: 1
                               }));
                               setFormData({...formData, rubric: newRubric});
                            }}
                            className="px-6 py-3 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-100 transition-all"
                          >
                             Generate Sesuai LG
                          </button>
                       </div>

                       <div className="space-y-8">
                          {formData.rubric?.map((row, rIdx) => {
                             const lg = bankLgs.find(x => x.id === row.goalId);
                             return (
                               <div key={rIdx} className="bg-gray-50/50 rounded-[2.5rem] border border-gray-100 overflow-hidden shadow-sm">
                                  <div className="p-6 bg-white border-b border-gray-50 flex items-start justify-between">
                                     <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                           <span className="px-2 py-0.5 bg-blue-600 text-white rounded text-[8px] font-black">{lg?.code || 'LG'}</span>
                                           <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{lg?.subject}</span>
                                        </div>
                                        <p className="text-sm font-bold text-gray-700 italic">"{lg?.goalText}"</p>
                                     </div>
                                     <button 
                                       onClick={() => {
                                          const next = [...(formData.rubric || [])];
                                          next.splice(rIdx, 1);
                                          setFormData({...formData, rubric: next});
                                       }}
                                       className="p-2 text-gray-300 hover:text-red-500 rounded-lg"
                                     >
                                        <Trash2 size={16} />
                                     </button>
                                  </div>
                                  
                                  <div className="p-8 grid grid-cols-1 md:grid-cols-4 gap-6">
                                     <FormField label="Criteria Title">
                                        <input 
                                          type="text" 
                                          className="w-full px-4 py-3 bg-white border-none rounded-xl text-xs font-bold" 
                                          value={row.criteriaLabel}
                                          onChange={e => {
                                             const next = [...(formData.rubric || [])];
                                             next[rIdx].criteriaLabel = e.target.value;
                                             setFormData({...formData, rubric: next});
                                          }}
                                        />
                                     </FormField>
                                     <FormField label="Assessed in Meeting #">
                                        <input 
                                          type="number" 
                                          className="w-full px-4 py-3 bg-white border-none rounded-xl text-xs font-bold" 
                                          value={row.assessedInMeeting}
                                          onChange={e => {
                                             const next = [...(formData.rubric || [])];
                                             next[rIdx].assessedInMeeting = parseInt(e.target.value);
                                             setFormData({...formData, rubric: next});
                                          }}
                                        />
                                     </FormField>

                                     <div className="md:col-span-4 grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-white">
                                        <FormField label="Beginning" labelClass="text-red-400">
                                           <textarea 
                                             className="w-full px-4 py-3 bg-white border-none rounded-xl text-xs font-bold min-h-[80px]" 
                                             value={row.beginning}
                                             onChange={e => {
                                                const next = [...(formData.rubric || [])];
                                                next[rIdx].beginning = e.target.value;
                                                setFormData({...formData, rubric: next});
                                             }}
                                           />
                                        </FormField>
                                        <FormField label="Developing" labelClass="text-orange-400">
                                           <textarea 
                                             className="w-full px-4 py-3 bg-white border-none rounded-xl text-xs font-bold min-h-[80px]" 
                                             value={row.developing}
                                             onChange={e => {
                                                const next = [...(formData.rubric || [])];
                                                next[rIdx].developing = e.target.value;
                                                setFormData({...formData, rubric: next});
                                             }}
                                           />
                                        </FormField>
                                        <FormField label="Achieved" labelClass="text-emerald-500">
                                           <textarea 
                                             className="w-full px-4 py-3 bg-white border-none rounded-xl text-xs font-bold min-h-[80px]" 
                                             value={row.achieved}
                                             onChange={e => {
                                                const next = [...(formData.rubric || [])];
                                                next[rIdx].achieved = e.target.value;
                                                setFormData({...formData, rubric: next});
                                             }}
                                           />
                                        </FormField>
                                     </div>
                                  </div>
                               </div>
                             );
                          })}
                       </div>
                    </div>
                  )}
               </motion.div>
            </AnimatePresence>
         </div>

         {/* Navigation Bar */}
         <div className="px-12 py-8 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
            <button
               onClick={handleBack}
               disabled={step === 0}
               className="px-8 py-4 text-xs font-black text-gray-400 uppercase tracking-widest hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed group flex items-center gap-2"
            >
               <ChevronLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
               Halaman Sebelumnya
            </button>

            <div className="flex items-center gap-4">
              <select 
                value={formData.status}
                onChange={e => setFormData({...formData, status: e.target.value as any})}
                className="px-6 py-4 bg-white border border-gray-100 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest text-gray-500 outline-none focus:ring-4 focus:ring-blue-100 shadow-sm"
              >
                 <option value="DRAFT">Simpan Sebagai Draft</option>
                 <option value="PUBLISHED">Publikasikan Langsung</option>
              </select>

              {step === steps.length - 1 ? (
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="px-12 py-5 bg-[#002366] text-white rounded-[1.5rem] font-bold text-sm uppercase tracking-widest flex items-center gap-3 shadow-xl shadow-blue-100 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                >
                   {submitting ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                   {isEdit ? "Update LXD Final" : "Simpan Dokumen LXD"}
                </button>
              ) : (
                <button
                  onClick={handleNext}
                  className="px-12 py-5 bg-blue-600 text-white rounded-[1.5rem] font-bold text-sm uppercase tracking-widest flex items-center gap-3 shadow-xl shadow-blue-200 hover:scale-[1.02] active:scale-95 transition-all group"
                >
                   Berikutnya
                   <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </button>
              )}
            </div>
         </div>
      </div>
    </div>
  );
}

// --- Internal Helper Components ---

function FormField({ label, children, className, labelClass, key }: { label: string, children: React.ReactNode, className?: string, labelClass?: string, key?: any }) {
  return (
    <div className={cn("space-y-2", className)}>
       <label className={cn("text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1", labelClass)}>{label}</label>
       {children}
    </div>
  );
}

function SubUnitBlock({ ua, onAddMeeting, onUpdateMeeting, onRemoveMeeting, onRemoveUA }: any) {
  return (
    <div className="p-8 bg-gray-50 rounded-[3rem] border border-gray-100 space-y-8">
       <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
             <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center font-black text-sm shadow-lg shadow-blue-200">
                {ua.uaNumber}
             </div>
             <div>
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Sub-Unit (UA)</h3>
                <input 
                  type="text" 
                  value={ua.uaTitle} 
                  onChange={e => {}} // Handle UA Title change
                  className="bg-transparent border-none p-0 text-xs font-bold text-blue-600 focus:ring-0 uppercase tracking-widest"
                />
             </div>
          </div>
          <button onClick={onRemoveUA} className="p-2 text-gray-300 hover:text-red-500 rounded-lg">
             <Trash2 size={18} />
          </button>
       </div>

       <div className="space-y-6">
          {ua.meetings.map((m: any, idx: number) => (
             <MeetingBlock 
               key={idx} 
               meeting={m} 
               onUpdate={(data) => onUpdateMeeting(idx, data)}
               onRemove={() => onRemoveMeeting(idx)}
             />
          ))}
          <button 
            onClick={onAddMeeting}
            className="w-full py-4 border-2 border-dashed border-gray-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-400 hover:border-blue-200 hover:text-blue-500 transition-all flex items-center justify-center gap-2"
          >
             <Plus size={14} /> Tambah Pertemuan di UA ini
          </button>
       </div>
    </div>
  );
}

function MilestoneBlock({ ml, onAddMeeting, onUpdateMeeting, onRemoveMeeting, onRemoveML }: any) {
  return (
    <div className="p-8 bg-emerald-50/30 rounded-[3rem] border border-emerald-100 space-y-8">
       <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
             <div className="w-12 h-12 bg-emerald-600 text-white rounded-2xl flex items-center justify-center font-black text-sm shadow-lg shadow-emerald-200">
                {ml.milestoneNumber}
             </div>
             <div>
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Milestone</h3>
                <input 
                  type="text" 
                  value={ml.milestoneTitle} 
                  placeholder="Nama milestone..."
                  onChange={e => {}} // Handle ML title
                  className="bg-transparent border-none p-0 text-xs font-bold text-emerald-600 focus:ring-0 uppercase tracking-widest placeholder:text-emerald-300"
                />
             </div>
          </div>
          <button onClick={onRemoveML} className="p-2 text-gray-300 hover:text-red-500 rounded-lg">
             <Trash2 size={18} />
          </button>
       </div>

       <div className="space-y-6">
          {ml.meetings.map((m: any, idx: number) => (
             <MeetingBlock 
               key={idx} 
               meeting={m} 
               onUpdate={(data) => onUpdateMeeting(idx, data)}
               onRemove={() => onRemoveMeeting(idx)}
             />
          ))}
          <button 
            onClick={onAddMeeting}
            className="w-full py-4 border-2 border-dashed border-emerald-100 rounded-2xl text-[10px] font-black uppercase tracking-widest text-emerald-400 hover:border-emerald-300 hover:text-emerald-600 transition-all flex items-center justify-center gap-2"
          >
             <Plus size={14} /> Tambah Pertemuan di Milestone ini
          </button>
       </div>
    </div>
  );
}

function MeetingBlock({ meeting, onUpdate, onRemove, key, showMilestone }: { meeting: LXDMeeting, onUpdate: (data: LXDMeeting) => void, onRemove: () => void, key?: any, showMilestone?: boolean }) {
  const [isExpanded, setIsExpanded] = React.useState(false);

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden transition-all">
       <div 
         className={cn(
           "p-4 flex items-center justify-between cursor-pointer group",
           isExpanded ? "bg-gray-50 border-b border-gray-100" : ""
         )}
         onClick={() => setIsExpanded(!isExpanded)}
       >
          <div className="flex items-center gap-4">
             <span className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-[10px] font-black text-gray-500">M{meeting.meetingNumber}</span>
             <span className="text-xs font-black uppercase tracking-widest text-gray-700">{meeting.title || "Untitled Meeting"}</span>
          </div>
          <div className="flex items-center gap-2">
             <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(); }} className="p-2 text-gray-300 hover:text-red-500">
                <Trash2 size={14} />
             </button>
             <ChevronRight size={18} className={cn("text-gray-300 transition-transform", isExpanded ? "rotate-90" : "")} />
          </div>
       </div>

       <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="p-8 space-y-8"
            >
               <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <FormField label="Meeting Title">
                     <input 
                       type="text" 
                       className="w-full px-5 py-3 bg-gray-50 border-none rounded-xl text-xs font-bold" 
                       value={meeting.title}
                       onChange={e => onUpdate({ ...meeting, title: e.target.value })}
                     />
                  </FormField>
                  <FormField label="Learning Objectives (Enter to add)">
                     <div className="space-y-2">
                        {meeting.learningObjective.map((lo, idx) => (
                           <div key={idx} className="flex gap-2">
                              <input 
                                type="text" 
                                className="flex-1 px-4 py-2 bg-gray-50 border-none rounded-lg text-xs font-bold" 
                                value={lo}
                                onChange={e => {
                                   const next = [...meeting.learningObjective];
                                   next[idx] = e.target.value;
                                   onUpdate({ ...meeting, learningObjective: next });
                                }}
                              />
                              <button 
                                type="button"
                                onClick={() => {
                                   const next = meeting.learningObjective.filter((_, i) => i !== idx);
                                   onUpdate({ ...meeting, learningObjective: next });
                                }}
                                className="text-red-300 hover:text-red-500"
                              >
                                 <Trash2 size={12} />
                              </button>
                           </div>
                        ))}
                        <button 
                          type="button"
                          onClick={() => onUpdate({ ...meeting, learningObjective: [...meeting.learningObjective, ""] })}
                          className="text-[9px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1"
                        >
                           <Plus size={12} /> Add Objective
                        </button>
                     </div>
                  </FormField>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <FormField label="Opening">
                     <textarea 
                       className="w-full px-5 py-3 bg-gray-50 border-none rounded-xl text-xs font-bold min-h-[100px]" 
                       value={meeting.opening}
                       onChange={e => onUpdate({ ...meeting, opening: e.target.value })}
                     />
                  </FormField>
                  <FormField label="Main Activities">
                     <textarea 
                       className="w-full px-5 py-3 bg-gray-50 border-none rounded-xl text-xs font-bold min-h-[100px]" 
                       value={meeting.mainActivities}
                       onChange={e => onUpdate({ ...meeting, mainActivities: e.target.value })}
                     />
                  </FormField>
                  <FormField label="Closing & Reflection">
                     <textarea 
                       className="w-full px-5 py-3 bg-gray-50 border-none rounded-xl text-xs font-bold min-h-[100px]" 
                       value={meeting.closing}
                       onChange={e => onUpdate({ ...meeting, closing: e.target.value })}
                     />
                  </FormField>
               </div>

               <div className="space-y-4">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Assessment Type & Strategies</label>
                  <div className="flex flex-wrap gap-4">
                     <div className="flex-1 space-y-2">
                        <span className="text-[9px] font-bold text-gray-300 uppercase tracking-widest">Assessment:</span>
                        <div className="flex flex-wrap gap-2">
                           {ASSESSMENT_TYPES.map(tag => (
                             <button
                               key={tag}
                               type="button"
                               onClick={() => {
                                  const current = meeting.assessmentType || [];
                                  const next = current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag];
                                  onUpdate({ ...meeting, assessmentType: next });
                               }}
                               className={cn(
                                 "px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase transition-all tracking-wider",
                                 meeting.assessmentType?.includes(tag) ? "bg-amber-100 text-amber-700" : "bg-gray-50 text-gray-400"
                               )}
                             >
                               {tag}
                             </button>
                           ))}
                        </div>
                     </div>
                     <div className="flex-1 space-y-2">
                        <span className="text-[9px] font-bold text-gray-300 uppercase tracking-widest">Strategies:</span>
                        <div className="flex flex-wrap gap-2">
                           {INSTRUCTIONAL_STRATEGIES.map(tag => (
                             <button
                               key={tag}
                               type="button"
                               onClick={() => {
                                  const current = meeting.instructionalStrategies || [];
                                  const next = current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag];
                                  onUpdate({ ...meeting, instructionalStrategies: next });
                               }}
                               className={cn(
                                 "px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase transition-all tracking-wider",
                                 meeting.instructionalStrategies?.includes(tag) ? "bg-purple-100 text-purple-700" : "bg-gray-50 text-gray-400"
                               )}
                             >
                               {tag}
                             </button>
                           ))}
                        </div>
                     </div>
                  </div>
               </div>
            </motion.div>
          )}
       </AnimatePresence>
    </div>
  );
}
