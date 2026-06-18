import * as React from 'react';
import { useEffect, useState } from 'react';
import { 
  MTSSAcademicCase, 
  MTSSAcademicMeeting 
} from '../../../types';
import { 
  Users, 
  Plus, 
  Calendar, 
  FileText, 
  ChevronRight, 
  CheckCircle2,
  MoreVertical,
  Target,
  AlertCircle,
  FileDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { saveMTSSAcademicDraft, getMTSSAcademicDraft, deleteMTSSAcademicDraft } from '../../../services/mtssAcademicDraftService';
import { scheduleMTSSAcademicMeetingHardened } from '../../../services/mtssAcademicOperationalService';
import { generateInitialMeetingPdf, generateFollowUpMeetingPdf } from '../../../services/mtssAcademicPdfService';
import { saveMTSSAcademicDocumentRecord } from '../../../services/mtssAcademicDocumentService';
import { useAuth } from '../../../context/AuthContext';
import { toast } from 'sonner';

interface Props {
  mtssCase: MTSSAcademicCase;
  meetings: MTSSAcademicMeeting[];
  onUpdate: () => void;
}

export default function MeetingMinutes({ mtssCase, meetings, onUpdate }: Props) {
  const { profile } = useAuth();
  const [isAddingMeeting, setIsAddingMeeting] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);

  const handleGeneratePdf = async (meeting: MTSSAcademicMeeting) => {
    setGenerating(meeting.id);
    try {
      const isInitial = meeting.meetingType === 'INITIAL';
      const pdf = isInitial 
        ? await generateInitialMeetingPdf(mtssCase.id, meeting.id)
        : await generateFollowUpMeetingPdf(mtssCase.id, meeting.id);
      
      const type = isInitial ? 'INITIAL_MEETING_PDF' : 'FOLLOW_UP_MEETING_PDF';
      const fileName = `${isInitial ? 'Initial' : 'FollowUp'}_Meeting_${mtssCase.studentName}_${format(new Date(), 'yyyyMMdd')}.pdf`;
      
      await saveMTSSAcademicDocumentRecord({
        caseId: mtssCase.id,
        studentId: mtssCase.studentId,
        type,
        fileName,
        generatedAt: Date.now(),
        generatedBy: profile?.uid || 'system',
        relatedMeetingId: meeting.id
      });

      pdf.save(fileName);
      toast.success('Document generated successfully');
      onUpdate();
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate PDF');
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-black text-slate-800 flex items-center gap-3">
            <Users className="text-indigo-600" size={24} />
            MTSS Meeting Minutes
          </h3>
          <p className="text-sm text-slate-500 font-medium">Collaboration logs between teachers, counselors, and leadership</p>
        </div>
        <button 
          onClick={() => setIsAddingMeeting(true)}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-indigo-600 font-bold rounded-xl hover:bg-slate-50 transition-all shadow-sm"
        >
          <Plus size={18} />
          New Meeting Record
        </button>
      </div>

      <div className="space-y-4">
        {meetings.length === 0 ? (
          <div className="py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400">
            <Users size={48} className="opacity-20 mb-4" />
            <p className="font-bold">No meetings recorded yet</p>
            <p className="text-xs">Schedule an initial meeting to discuss {mtssCase.studentName}'s support needs</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {meetings.map((meeting) => (
              <div key={meeting.id}>
                <MeetingCard 
                  meeting={meeting} 
                  onGeneratePdf={() => handleGeneratePdf(meeting)}
                  isGenerating={generating === meeting.id}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {isAddingMeeting && (
          <AddMeetingModal 
            caseId={mtssCase.id} 
            onClose={() => setIsAddingMeeting(false)} 
            onSuccess={() => {
              setIsAddingMeeting(false);
              onUpdate();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function MeetingCard({ 
  meeting, 
  onGeneratePdf, 
  isGenerating 
}: { 
  meeting: MTSSAcademicMeeting; 
  onGeneratePdf: () => void;
  isGenerating: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const getTypeStyles = (type: string) => {
    switch (type) {
      case 'INITIAL': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'FOLLOW_UP': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
      case 'REVIEW': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'TIER_3_PLANNING': return 'bg-rose-100 text-rose-700 border-rose-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <motion.div 
      layout
      className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden hover:border-indigo-200 transition-all"
    >
      <div className="p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black ${getTypeStyles(meeting.meetingType)} border`}>
              {meeting.meetingType === 'INITIAL' && <Target size={24} />}
              {meeting.meetingType === 'FOLLOW_UP' && <Calendar size={24} />}
              {meeting.meetingType === 'REVIEW' && <CheckCircle2 size={24} />}
              {meeting.meetingType === 'TIER_3_PLANNING' && <AlertCircle size={24} />}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${getTypeStyles(meeting.meetingType)}`}>
                  {meeting.meetingType.replace('_', ' ')}
                </span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                  {format(meeting.date, 'dd MMM yyyy')}
                </span>
              </div>
              <h4 className="font-black text-slate-900">{meeting.participants.length} Participants • {meeting.meetingType === 'INITIAL' ? 'Case Launch' : 'Progress Discussion'}</h4>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onGeneratePdf();
              }}
              disabled={isGenerating}
              className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all disabled:opacity-50"
              title="Generate PDF Minutes"
            >
              {isGenerating ? (
                <div className="w-5 h-5 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin" />
              ) : (
                <FileDown size={20} />
              )}
            </button>
            <button 
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-2 px-4 py-2 text-indigo-600 font-bold text-sm bg-indigo-50 rounded-xl hover:bg-indigo-100 transition-all"
            >
              {expanded ? 'Hide Details' : 'View Minutes'}
              <ChevronRight size={16} className={`transition-transform duration-300 ${expanded ? 'rotate-90' : ''}`} />
            </button>
          </div>
        </div>

        <AnimatePresence>
          {expanded && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-6 mt-6 border-t border-slate-50 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <section>
                      <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Problem Definition</h5>
                      <p className="text-sm text-slate-600 leading-relaxed italic bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        "{meeting.definitionOfProblem}"
                      </p>
                    </section>
                    <section>
                      <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Relevant Background / Strengths</h5>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        {meeting.relevantBackground || meeting.strengths}
                      </p>
                    </section>
                  </div>
                  <div className="space-y-4">
                    <section>
                      <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Team Recommendations</h5>
                      <div className="space-y-2">
                        {meeting.recommendations.map((rec, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm text-slate-700 bg-white border border-indigo-100 px-3 py-2 rounded-xl">
                            <span className="text-indigo-600 font-black">•</span>
                            {rec}
                          </div>
                        ))}
                      </div>
                    </section>
                    <section>
                      <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Participants</h5>
                      <div className="flex flex-wrap gap-2">
                        {meeting.participants.map((p, i) => (
                          <span key={i} className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold border border-slate-200">
                            {p.name} ({p.role})
                          </span>
                        ))}
                      </div>
                    </section>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function AddMeetingModal({ caseId, onClose, onSuccess }: { caseId: string; onClose: () => void; onSuccess: () => void }) {
  const { user: currentUser } = useAuth();
  const fullUser = currentUser;
  const [loading, setLoading] = useState(false);
  const [draftStatus, setDraftStatus] = useState<'IDLE' | 'SAVING' | 'SAVED' | 'FAILED'>('IDLE');
  const [formData, setFormData] = useState({
    meetingType: 'INITIAL' as any,
    date: format(new Date(), 'yyyy-MM-dd'),
    definitionOfProblem: '',
    relevantBackground: '',
    strengths: '',
    recommendations: '',
    participants: [
      { name: 'Teacher Agung', role: 'Homeroom' },
      { name: 'Counselor Maya', role: 'Counselor' }
    ]
  });

  // Draft Recovery
  useEffect(() => {
    if (currentUser) {
      getMTSSAcademicDraft(currentUser.uid, 'INITIAL_MEETING', caseId).then(draft => {
        if (draft && draft.content) {
          setFormData(draft.content);
        }
      });
    }
  }, [currentUser, caseId]);

  // Autosave
  useEffect(() => {
    if (!currentUser || (!formData.definitionOfProblem && !formData.recommendations)) return;

    const timer = setTimeout(async () => {
      setDraftStatus('SAVING');
      try {
        await saveMTSSAcademicDraft({
          userId: currentUser.uid,
          caseId,
          type: 'INITIAL_MEETING',
          content: formData,
          status: 'SAVED'
        });
        setDraftStatus('SAVED');
      } catch (err) {
        setDraftStatus('FAILED');
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [formData, currentUser, caseId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await scheduleMTSSAcademicMeetingHardened(caseId, {
        meetingType: formData.meetingType,
        date: new Date(formData.date).getTime(),
        participants: formData.participants.map(p => ({ userId: null, ...p })),
        summaryCurrentData: '',
        relevantBackground: formData.relevantBackground,
        strengths: formData.strengths,
        pastConcerns: '',
        currentConcerns: '',
        definitionOfProblem: formData.definitionOfProblem,
        recommendations: formData.recommendations.split('\n').filter(r => r.trim()),
        nextReviewDate: null,
        notes: ''
      }, fullUser as any);

      if (currentUser) await deleteMTSSAcademicDraft(currentUser.uid, 'INITIAL_MEETING', caseId);
      onSuccess();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm overflow-y-auto">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-3xl shadow-xl w-full max-w-2xl overflow-hidden my-auto"
      >
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-900">Record MTSS Meeting</h2>
            <div className="flex items-center gap-2 mt-1">
               {draftStatus === 'SAVING' && <span className="text-[8px] font-black text-amber-500 uppercase animate-pulse">Autosaving...</span>}
               {draftStatus === 'SAVED' && <span className="text-[8px] font-black text-emerald-500 uppercase">Draft Saved</span>}
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400">
            <Plus size={24} className="rotate-45" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Meeting Date</label>
              <input 
                required
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Meeting Type</label>
              <select 
                value={formData.meetingType}
                onChange={(e) => setFormData({ ...formData, meetingType: e.target.value as any })}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none"
              >
                <option value="INITIAL">Initial Referral Meeting</option>
                <option value="FOLLOW_UP">Follow-up Discussion</option>
                <option value="REVIEW">Progress Review Meeting</option>
                <option value="TIER_3_PLANNING">Tier 3 Intensive Planning</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Problem Definition</label>
            <textarea 
              required
              rows={2}
              placeholder="State the core academic challenge clearly..."
              value={formData.definitionOfProblem}
              onChange={(e) => setFormData({ ...formData, definitionOfProblem: e.target.value })}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Relevant Background</label>
              <textarea 
                rows={3}
                placeholder="Past performance, history..."
                value={formData.relevantBackground}
                onChange={(e) => setFormData({ ...formData, relevantBackground: e.target.value })}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Student Strengths</label>
              <textarea 
                rows={3}
                placeholder="What is the student good at?"
                value={formData.strengths}
                onChange={(e) => setFormData({ ...formData, strengths: e.target.value })}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Recommendations (One per line)</label>
            <textarea 
              required
              rows={3}
              placeholder="List specific actions or interventions agreed upon..."
              value={formData.recommendations}
              onChange={(e) => setFormData({ ...formData, recommendations: e.target.value })}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none"
            />
          </div>

          <div className="pt-4 flex gap-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-6 border border-slate-200 text-slate-600 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-slate-50 transition-all"
            >
              Cancel
            </button>
            <button
              disabled={loading}
              className="flex-[2] py-3 px-6 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all flex items-center justify-center gap-2"
            >
              {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : 'Save Meeting Minutes'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
