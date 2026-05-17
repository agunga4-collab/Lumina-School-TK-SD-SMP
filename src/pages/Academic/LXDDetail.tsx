import * as React from 'react';
import { motion } from 'motion/react';
import { 
  Plus, Search, Filter, Trash2, Edit2, BookOpen, 
  ChevronLeft, AlertCircle, Loader2, Calendar, User, 
  Tag, Clock, CheckCircle2, FileText, Layers, Map,
  CheckCircle, Target, Smile, Brain, Sparkles, Footprints,
  Type, Download, Share2, Globe, Lock
} from 'lucide-react';
import { useOutletContext, useNavigate, useParams, Link } from 'react-router-dom';
import { getLXDById, deleteLXD, updateLXD, getLearningGoals } from '../../lib/firebase';
import { LXD, User as AppUser, UnitType, LXDType, LearningGoal } from '../../types';
import { cn } from '../../lib/utils';

const STRAND_ICONS = {
  moralSpiritual: <Smile size={23} className="text-pink-500" />,
  imaginal: <Sparkles size={23} className="text-purple-500" />,
  rational: <Brain size={23} className="text-blue-500" />,
  materialPhysical: <Footprints size={23} className="text-emerald-500" />
};

export default function LXDDetail() {
  const { currentUser } = useOutletContext<{ currentUser: AppUser }>();
  const { id } = useParams();
  const navigate = useNavigate();
  const [lx, setLx] = React.useState<LXD | null>(null);
  const [lgs, setLgs] = React.useState<LearningGoal[]>([]);
  const [loading, setLoading] = React.useState(true);

  const fetchData = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data = await getLXDById(id);
      if (data) {
        setLx(data);
        // Fetch LG texts
        const lgIds = data.type !== 'LEARNING_JOURNEY' 
          ? (data.linkedGoals as string[]) 
          : (data.linkedGoals as any[]).map(x => x.goalId);
        
        if (lgIds.length > 0) {
           const allLgs = await getLearningGoals({ unitId: data.unitId });
           setLgs(allLgs.filter(g => lgIds.includes(g.id)));
        }
      }
    } catch (error) {
      console.error("Error fetching LXD:", error);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchData();
  }, [id]);

  const handleDelete = async () => {
    if (!lx || !confirm("Hapus LXD ini secara permanen?")) return;
    try {
      await deleteLXD(lx.id);
      navigate('/academic/lxd');
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleToggleStatus = async () => {
    if (!lx) return;
    const nextStatus = lx.status === 'DRAFT' ? 'PUBLISHED' : 'DRAFT';
    try {
      await updateLXD(lx.id, { status: nextStatus });
      fetchData();
    } catch (error: any) {
      alert(error.message);
    }
  };

  if (loading) return (
     <div className="py-40 text-center">
        <Loader2 size={40} className="text-blue-100 animate-spin mx-auto mb-4" />
        <p className="text-gray-400 font-bold uppercase tracking-widest text-sm">Menampilkan Detail LXD...</p>
     </div>
  );

  if (!lx) return (
    <div className="py-40 text-center space-y-6">
       <AlertCircle size={64} className="text-gray-100 mx-auto" />
       <h2 className="text-2xl font-black text-gray-300 uppercase tracking-tighter italic">LXD Tidak Ditemukan</h2>
       <button onClick={() => navigate('/academic/lxd')} className="px-8 py-4 bg-gray-50 text-gray-400 rounded-3xl font-bold uppercase text-xs">Kembali ke Daftar</button>
    </div>
  );

  const canEdit = currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'HEAD_UNIT' || lx.createdBy === currentUser.email;

  return (
    <div className="max-w-6xl mx-auto space-y-10 animate-in fade-in duration-500 pb-20">
      {/* Detail Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-8">
        <div className="flex items-start gap-6">
           <button 
             onClick={() => navigate('/academic/lxd')}
             className="p-4 bg-white rounded-3xl border border-gray-100 shadow-sm hover:scale-105 active:scale-95 transition-all text-gray-400"
           >
              <ChevronLeft size={24} />
           </button>
           <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                 <span className={cn(
                   "px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest",
                   lx.status === 'PUBLISHED' ? "bg-emerald-50 text-emerald-600" : "bg-orange-50 text-orange-600"
                 )}>
                   {lx.status}
                 </span>
                 <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black uppercase tracking-widest">
                   {lx.type.replace('_', ' ')}
                 </span>
                 <span className="px-3 py-1 bg-gray-100 text-gray-500 rounded-lg text-[10px] font-black uppercase tracking-widest">
                   Class {lx.grade || lx.grades?.join(', ')}
                 </span>
              </div>
              <h1 className="text-4xl font-black tracking-tight italic uppercase text-gray-900 leading-[1.1]">
                {lx.title}
              </h1>
              <div className="flex items-center gap-4 text-xs font-bold text-gray-400">
                 <div className="flex items-center gap-2">
                    <User size={14} /> 
                    <span>Created by {lx.createdBy}</span>
                 </div>
                 <span>•</span>
                 <span>Updated {new Date(lx.updatedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
              </div>
           </div>
        </div>

        <div className="flex flex-wrap gap-2">
           {canEdit && (
             <>
               <button 
                 onClick={handleToggleStatus}
                 className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-100 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-600 hover:bg-gray-50 transition-all shadow-sm"
               >
                  {lx.status === 'DRAFT' ? <Globe size={14} /> : <Lock size={14} />}
                  {lx.status === 'DRAFT' ? 'Publish' : 'Make Draft'}
               </button>
               <Link 
                 to={`/academic/lxd/edit/${lx.id}`}
                 className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-100 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-600 hover:bg-gray-50 transition-all shadow-sm"
               >
                  <Edit2 size={14} /> Edit
               </Link>
               <button 
                 onClick={handleDelete}
                 className="flex items-center gap-2 px-6 py-3 bg-red-50 text-red-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-red-100 transition-all"
               >
                  <Trash2 size={14} /> Delete
               </button>
             </>
           )}
        </div>
      </div>

      {/* Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
         {/* Sidebar Stats */}
         <div className="space-y-8">
            <div className="p-8 bg-white rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
               <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Quick Info</h3>
               <div className="space-y-4">
                  <InfoItem icon={<Calendar size={18} />} label="Academic Year" value={lx.academicYear} />
                  <InfoItem icon={<Tag size={18} />} label="Semester" value={`Semester ${lx.semester}`} />
                  <InfoItem icon={<Clock size={18} />} label="Duration" value={lx.duration || lx.dateRange || "-"} />
                  {lx.subject && <InfoItem icon={<BookOpen size={18} />} label="Subject" value={lx.subject} />}
                  {lx.lessonTopic && <InfoItem icon={<Target size={18} />} label="Topic" value={lx.lessonTopic} />}
               </div>
            </div>

            {lx.type === 'LEARNING_JOURNEY' && lx.teachers && (
               <div className="p-8 bg-blue-50/50 rounded-[2.5rem] border border-blue-100 space-y-6">
                  <h3 className="text-xs font-black text-blue-400 uppercase tracking-[0.2em]">Project Team</h3>
                  <div className="space-y-4">
                     {lx.teachers.map((t, i) => (
                        <div key={i} className="flex flex-col">
                           <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">{t.subject}</span>
                           <span className="text-xs font-bold text-gray-600 truncate">{t.email}</span>
                        </div>
                     ))}
                  </div>
               </div>
            )}
            
            <div className="p-8 bg-emerald-50/30 rounded-[2.5rem] border border-emerald-100 space-y-6">
               <h3 className="text-xs font-black text-emerald-500 uppercase tracking-[0.2em]">Learning Goals</h3>
               <div className="space-y-3">
                  {lgs.map((lg) => (
                    <div key={lg.id} className="p-4 bg-white rounded-2xl border border-emerald-50 space-y-1">
                       <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">{lg.code}</span>
                       <p className="text-xs font-bold text-gray-700 leading-relaxed">{lg.goalText}</p>
                    </div>
                  ))}
               </div>
            </div>
         </div>

         {/* Main Narrative */}
         <div className="lg:col-span-2 space-y-10">
            {/* Essential Question */}
            <div className="p-10 bg-[#002366] text-white rounded-[3rem] shadow-xl shadow-blue-100 relative overflow-hidden">
               <div className="absolute -top-10 -right-10 w-40 h-40 bg-blue-400/10 rounded-full blur-3xl" />
               <div className="relative space-y-4">
                  <h3 className="text-[10px] font-black text-blue-200 uppercase tracking-[0.3em] flex items-center gap-2">
                    <Sparkles size={14} /> Essential Question
                  </h3>
                  <p className="text-2xl font-black italic tracking-tight leading-snug">
                    "{lx.essentialQuestion || lx.lessonTopic || lx.title}"
                  </p>
               </div>
            </div>

            {lx.learningExperienceOverview && (
              <div className="space-y-4">
                 <SectionTitle title="Learning Journey Overview" />
                 <p className="text-gray-600 leading-relaxed font-medium bg-white p-8 rounded-[2.5rem] border border-gray-50">
                    {lx.learningExperienceOverview}
                 </p>
              </div>
            )}

            {/* Integral Strands */}
            <div className="space-y-6">
               <SectionTitle title="The 4 Integral Strands" />
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {lx.integralStrands && (Object.keys(lx.integralStrands) as Array<keyof typeof STRAND_ICONS>).map(strand => (
                    <div key={strand} className="p-8 bg-white rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col gap-4">
                       <div className="flex items-center gap-3">
                          {STRAND_ICONS[strand]}
                          <h4 className="text-xs font-black uppercase tracking-widest text-gray-900">{strand.replace(/([A-Z])/g, ' $1')}</h4>
                       </div>
                       <div className="flex flex-wrap gap-2">
                          {(lx.integralStrands as any)[strand].indicators.map((ind: string) => (
                             <span key={ind} className="px-2 py-0.5 bg-gray-50 text-gray-400 rounded-md text-[9px] font-bold uppercase tracking-wider">{ind}</span>
                          ))}
                       </div>
                       <p className="text-xs text-gray-500 italic leading-relaxed">
                          {(lx.integralStrands as any)[strand].narrative}
                       </p>
                    </div>
                  ))}
               </div>
            </div>

            {/* Meetings Structure */}
            <div className="space-y-8">
               <SectionTitle title="Lesson Flow & Meetings" />
               {lx.type === 'WEEKLY_LESSONS' && lx.meetings?.map(m => <MeetingDetail key={m.meetingNumber} meeting={m} />)}
               
               {lx.type === 'UNIT_AKTIVITAS' && lx.subUnits?.map(ua => (
                 <div key={ua.uaNumber} className="space-y-6">
                    <div className="flex items-center gap-4 pl-4 pt-4">
                       <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-xs">UA{ua.uaNumber}</div>
                       <h3 className="text-lg font-black uppercase italic text-gray-400">{ua.uaTitle}</h3>
                    </div>
                    {ua.meetings.map((m: any) => <MeetingDetail key={m.meetingNumber} meeting={m} />)}
                 </div>
               ))}

               {lx.type === 'LEARNING_JOURNEY' && lx.milestones?.map(ml => (
                 <div key={ml.milestoneNumber} className="space-y-6">
                    <div className="flex items-center gap-4 pl-4 pt-4">
                       <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black text-xs">ML{ml.milestoneNumber}</div>
                       <h3 className="text-lg font-black uppercase italic text-gray-400">{ml.milestoneTitle}</h3>
                    </div>
                    {ml.meetings.map((m: any) => <MeetingDetail key={m.meetingNumber} meeting={m} />)}
                 </div>
               ))}
            </div>

            {/* Differentiation Section */}
            {lx.differentiatedInstruction && (
              <div className="space-y-6">
                 <SectionTitle title="Differentiated Instruction" />
                 <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {Object.entries(lx.differentiatedInstruction).map(([key, val]) => (
                      <div key={key} className="p-6 bg-gray-50 rounded-3xl border border-gray-100 flex flex-col gap-2">
                         <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">{key}</span>
                         <p className="text-[11px] font-bold text-gray-600 leading-relaxed truncate hover:whitespace-normal transition-all">{val as string}</p>
                      </div>
                    ))}
                 </div>
              </div>
            )}

            {/* Rubric View */}
            <div className="space-y-6">
               <SectionTitle title="Assessment Rubric" />
               <div className="space-y-4">
                  {lx.rubric.map((row, idx) => {
                    const lg = lgs.find(g => g.id === row.goalId);
                    return (
                      <div key={idx} className="bg-white rounded-[2.5rem] border border-gray-100 overflow-hidden shadow-sm">
                         <div className="px-8 py-4 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                               <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">{lg?.code || 'LG'}</span>
                               <span className="text-[10px] font-bold text-gray-400">{row.criteriaLabel}</span>
                            </div>
                            <span className="text-[10px] font-black text-emerald-500 uppercase">Assessed in M{row.assessedInMeeting}</span>
                         </div>
                         <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-8">
                            <RubricCell label="Beginning" color="red" text={row.beginning} />
                            <RubricCell label="Developing" color="orange" text={row.developing} />
                            <RubricCell label="Achieved" color="emerald" text={row.achieved} />
                         </div>
                      </div>
                    );
                  })}
               </div>
            </div>
         </div>
      </div>
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
   return (
      <div className="flex items-center gap-4 ml-2">
         <div className="w-1.5 h-6 bg-blue-600 rounded-full" />
         <h2 className="text-sm font-black text-gray-400 uppercase tracking-[0.2em]">{title}</h2>
      </div>
   );
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode, label: string, value: string }) {
   return (
      <div className="flex gap-4">
         <div className="text-gray-300">{icon}</div>
         <div>
            <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest leading-none mb-1">{label}</p>
            <p className="text-xs font-black text-gray-700 uppercase tracking-wider">{value}</p>
         </div>
      </div>
   );
}

function MeetingDetail({ meeting }: { meeting: any; key?: any }) {
   return (
      <div className="p-8 bg-white rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
         <div className="flex items-center justify-between">
            <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center gap-3">
               <span className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-[10px] text-gray-400">#{meeting.meetingNumber}</span>
               {meeting.title}
            </h4>
            <div className="flex flex-wrap gap-2 justify-end">
               {meeting.assessmentType?.map((t: string) => <span key={t} className="px-2 py-0.5 bg-amber-50 text-amber-600 rounded text-[9px] font-black uppercase tracking-wider">{t}</span>)}
            </div>
         </div>
         
         <div className="space-y-4">
            <div className="flex items-start gap-2">
               <Target size={14} className="text-blue-500 mt-1 shrink-0" />
               <div className="flex flex-wrap gap-2">
                  {meeting.learningObjective.map((lo: string, i: number) => (
                    <span key={i} className="px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-[10px] font-bold leading-tight">{lo}</span>
                  ))}
               </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
               <MeetingStage label="Opening" text={meeting.opening} />
               <MeetingStage label="Main Activities" text={meeting.mainActivities} />
               <MeetingStage label="Closing" text={meeting.closing} />
            </div>

            <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-50">
               {meeting.instructionalStrategies?.map((s: string) => (
                 <span key={s} className="px-2 py-1 bg-purple-50 text-purple-600 rounded-lg text-[9px] font-black uppercase tracking-widest">#{s}</span>
               ))}
            </div>
         </div>
      </div>
   );
}

function MeetingStage({ label, text }: { label: string, text: string }) {
   return (
      <div className="space-y-2">
         <h5 className="text-[9px] font-black text-gray-300 uppercase tracking-widest">{label}</h5>
         <p className="text-xs text-gray-600 leading-relaxed line-clamp-4">{text}</p>
      </div>
   );
}

function RubricCell({ label, color, text }: { label: string, color: string, text: string }) {
   const colorMap: any = {
      red: "text-red-400",
      orange: "text-orange-400",
      emerald: "text-emerald-500"
   };
   return (
      <div className="space-y-2">
         <h5 className={cn("text-[10px] font-black uppercase tracking-widest", colorMap[color])}>{label}</h5>
         <p className="text-xs text-gray-500 font-medium leading-relaxed italic">{text || "-"}</p>
      </div>
   );
}
