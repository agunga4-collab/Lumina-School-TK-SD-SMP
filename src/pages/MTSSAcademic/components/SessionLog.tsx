import * as React from 'react';
import { useEffect, useState } from 'react';
import { 
  MTSSAcademicCase, 
  MTSSAcademicSession, 
  MTSSAcademicDomain 
} from '../../../types';
import { 
  Plus, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  FileText,
  MessageSquare,
  History,
  MoreVertical,
  Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { saveMTSSAcademicDraft, getMTSSAcademicDraft, deleteMTSSAcademicDraft } from '../../../services/mtssAcademicDraftService';
import { logMTSSAcademicSessionHardened } from '../../../services/mtssAcademicOperationalService';
import { useAuth } from '../../../context/AuthContext';

interface Props {
  mtssCase: MTSSAcademicCase;
  sessions: MTSSAcademicSession[];
  onUpdate: () => void;
}

export default function SessionLog({ mtssCase, sessions, onUpdate }: Props) {
  const [isAddingSession, setIsAddingSession] = useState(false);
  const [filterDomain, setFilterDomain] = useState<MTSSAcademicDomain | 'ALL'>('ALL');

  const filteredSessions = sessions.filter(s => filterDomain === 'ALL' || s.domain === filterDomain);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-black text-slate-800 flex items-center gap-3">
            <History className="text-indigo-600" size={24} />
            Intervention Session Log
          </h3>
          <p className="text-sm text-slate-500 font-medium">Record and track academic coaching progress</p>
        </div>
        <div className="flex items-center gap-3">
          <select 
            value={filterDomain}
            onChange={(e) => setFilterDomain(e.target.value as any)}
            className="p-2 border border-slate-200 rounded-xl text-xs font-bold bg-white text-slate-600 focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="ALL">All Domains</option>
            {mtssCase.subjectDomains.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <button 
            onClick={() => setIsAddingSession(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
          >
            <Plus size={18} />
            Log Session
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {filteredSessions.length === 0 ? (
          <div className="py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400">
            <Calendar size={48} className="opacity-20 mb-4" />
            <p className="font-bold">No sessions logged yet</p>
            <p className="text-xs">Start recording intervention sessions for {mtssCase.studentName}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredSessions.map((session, index) => (
              <div key={session.id}>
                <SessionCard session={session} isLatest={index === 0} />
              </div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {isAddingSession && (
          <AddSessionModal 
            caseId={mtssCase.id} 
            domains={mtssCase.subjectDomains}
            nextSessionNo={(sessions[0]?.sessionNo || 0) + 1}
            onClose={() => setIsAddingSession(false)} 
            onSuccess={() => {
              setIsAddingSession(false);
              onUpdate();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function SessionCard({ session, isLatest }: { session: MTSSAcademicSession; isLatest: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div 
      layout
      className={`bg-white rounded-3xl border ${isLatest ? 'border-indigo-200 shadow-md ring-4 ring-indigo-50/50' : 'border-slate-100 shadow-sm'} overflow-hidden transition-all`}
    >
      <div className="p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center font-black ${isLatest ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
              <span className="text-[10px] leading-none opacity-70 mb-0.5">SESS</span>
              <span className="text-lg leading-none">{session.sessionNo}</span>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[9px] font-black text-slate-500 uppercase tracking-widest">{session.domain}</span>
                {session.performanceMark && (
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${
                    session.performanceMark === 'A' ? 'bg-emerald-100 text-emerald-700' :
                    session.performanceMark === 'B' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    Progress: {session.performanceMark}
                  </span>
                )}
              </div>
              <h4 className="font-black text-slate-900">{session.topic}</h4>
              <p className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                <Calendar size={12} /> {format(session.date, 'eeee, dd MMM yyyy')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden md:block">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Attendance</p>
              <p className={`text-sm font-bold ${session.attendanceStatus === 'PRESENT' ? 'text-emerald-600' : 'text-rose-600'}`}>
                {session.attendanceStatus}
              </p>
            </div>
            <button 
              onClick={() => setExpanded(!expanded)}
              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
            >
              <Plus size={20} className={`transition-transform duration-300 ${expanded ? 'rotate-45' : ''}`} />
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
              <div className="pt-6 mt-6 border-t border-slate-50 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                       <FileText size={12} /> Activity Summary
                    </p>
                    <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100 italic">
                      {session.activitySummary}
                    </p>
                  </div>
                  {session.materialTitle && (
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Materials Used</p>
                      <p className="text-sm font-bold text-slate-700 bg-white border border-slate-100 px-3 py-2 rounded-xl w-fit">
                        {session.materialTitle}
                      </p>
                    </div>
                  )}
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                       <MessageSquare size={12} /> Teacher Observation
                    </p>
                    <p className="text-sm text-slate-600 leading-relaxed bg-indigo-50/30 p-4 rounded-2xl border border-indigo-100/50">
                      {session.teacherObservation}
                    </p>
                  </div>
                  {session.score !== null && (
                    <div className="flex items-center gap-4">
                      <div className="bg-indigo-600 text-white px-4 py-2 rounded-2xl shadow-lg shadow-indigo-100 flex items-center gap-3">
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-70">Focus Score</span>
                        <span className="text-xl font-black">{session.score}/100</span>
                      </div>
                      {session.homeworkAssigned && (
                        <div className="flex items-center gap-2 text-amber-600 font-black text-[10px] uppercase tracking-widest bg-amber-50 px-3 py-2 rounded-2xl border border-amber-100">
                          <CheckCircle2 size={12} /> HW Assigned
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function AddSessionModal({ caseId, domains, nextSessionNo, onClose, onSuccess }: { caseId: string; domains: MTSSAcademicDomain[]; nextSessionNo: number; onClose: () => void; onSuccess: () => void }) {
  const { user: currentUser } = useAuth();
  const fullUser = currentUser;
  const [loading, setLoading] = useState(false);
  const [draftStatus, setDraftStatus] = useState<'IDLE' | 'SAVING' | 'SAVED' | 'FAILED'>('IDLE');
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    domain: domains[0] || 'ENGLISH',
    topic: '',
    materialTitle: '',
    activitySummary: '',
    attendanceStatus: 'PRESENT' as any,
    teacherObservation: '',
    score: '',
    performanceMark: 'B' as any,
    homeworkAssigned: false
  });

  // Draft Recovery
  React.useEffect(() => {
    if (currentUser) {
      getMTSSAcademicDraft(currentUser.uid, 'SESSION', caseId).then(draft => {
        if (draft && draft.content) {
          setFormData(draft.content);
        }
      });
    }
  }, [currentUser, caseId]);

  // Autosave
  React.useEffect(() => {
    if (!currentUser || (!formData.topic && !formData.activitySummary)) return;

    const timer = setTimeout(async () => {
      setDraftStatus('SAVING');
      try {
        await saveMTSSAcademicDraft({
          userId: currentUser.uid,
          caseId,
          type: 'SESSION',
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
      await logMTSSAcademicSessionHardened(caseId, {
        sessionNo: nextSessionNo,
        date: new Date(formData.date).getTime(),
        domain: formData.domain as MTSSAcademicDomain,
        topic: formData.topic,
        materialTitle: formData.materialTitle,
        activitySummary: formData.activitySummary,
        attendanceStatus: formData.attendanceStatus,
        latenessMinutes: null,
        teacherObservation: formData.teacherObservation,
        performanceMark: formData.performanceMark,
        score: formData.score ? parseInt(formData.score) : null,
        homeworkAssigned: formData.homeworkAssigned,
        homeworkStatus: formData.homeworkAssigned ? 'NOT_DONE' : null,
        notes: '',
        createdBy: currentUser?.uid || ''
      }, fullUser as any);
      
      if (currentUser) await deleteMTSSAcademicDraft(currentUser.uid, 'SESSION', caseId);
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
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-xl font-black text-slate-900">Log Intervention Session</h2>
            <div className="flex items-center gap-2 mt-1">
               <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Session No. {nextSessionNo}</p>
               {draftStatus === 'SAVING' && <span className="text-[8px] font-black text-amber-500 uppercase animate-pulse">Autosaving...</span>}
               {draftStatus === 'SAVED' && <span className="text-[8px] font-black text-emerald-500 uppercase">Draft Saved</span>}
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-xl text-slate-400">
            <Plus size={24} className="rotate-45" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Session Date</label>
              <input 
                required
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Domain</label>
              <select 
                value={formData.domain}
                onChange={(e) => setFormData({ ...formData, domain: e.target.value as any })}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none"
              >
                {domains.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Session Topic / Objective</label>
              <input 
                required
                type="text"
                placeholder="e.g. Master Long Division"
                value={formData.topic}
                onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Materials / Toolkit Used</label>
              <input 
                type="text"
                placeholder="e.g. Literacy Box A, Level 4"
                value={formData.materialTitle}
                onChange={(e) => setFormData({ ...formData, materialTitle: e.target.value })}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Activity Summary</label>
            <textarea 
              required
              rows={2}
              placeholder="What specifically did you work on today?"
              value={formData.activitySummary}
              onChange={(e) => setFormData({ ...formData, activitySummary: e.target.value })}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Teacher Observation (The 'Vibe' of Learning)</label>
            <textarea 
              required
              rows={2}
              placeholder="How was the student's motivation, focus, and grasp of the material?"
              value={formData.teacherObservation}
              onChange={(e) => setFormData({ ...formData, teacherObservation: e.target.value })}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
             <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Attendance</label>
              <select 
                value={formData.attendanceStatus}
                onChange={(e) => setFormData({ ...formData, attendanceStatus: e.target.value as any })}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none"
              >
                <option value="PRESENT">Present</option>
                <option value="ABSENT">Absent</option>
                <option value="LATE">Late</option>
                <option value="SICK">Sick</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Progress</label>
              <select 
                value={formData.performanceMark}
                onChange={(e) => setFormData({ ...formData, performanceMark: e.target.value as any })}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none"
              >
                <option value="A">A - Ahead</option>
                <option value="B">B - Progressing</option>
                <option value="D">D - Delay</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Score (Opt)</label>
              <input 
                type="number"
                placeholder="0-100"
                value={formData.score}
                onChange={(e) => setFormData({ ...formData, score: e.target.value })}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none"
              />
            </div>
            <div className="flex flex-col justify-end pb-3">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input 
                  type="checkbox"
                  checked={formData.homeworkAssigned}
                  onChange={(e) => setFormData({ ...formData, homeworkAssigned: e.target.checked })}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                />
                <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest group-hover:text-indigo-600 transition-colors">Has HW</span>
              </label>
            </div>
          </div>

          <div className="pt-6 flex gap-4">
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
              {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : 'Log Session Success'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
