import * as React from 'react';
import { useState } from 'react';
import { 
  MTSSAcademicCase, 
  MTSSAcademicGoal, 
  MTSSAcademicPlan,
  MTSSAcademicDomain 
} from '../../../types';
import { 
  Target, 
  Plus, 
  Trash2, 
  Edit3, 
  CheckCircle2, 
  AlertCircle,
  TrendingUp,
  Brain,
  Sparkles,
  BookOpen
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { addMTSSAcademicGoal } from '../../../lib/firebase';

interface Props {
  mtssCase: MTSSAcademicCase;
  goals: MTSSAcademicGoal[];
  plans: MTSSAcademicPlan[];
  onUpdate: () => void;
}

export default function GoalSetting({ mtssCase, goals, plans, onUpdate }: Props) {
  const [isAddingGoal, setIsAddingGoal] = useState(false);
  const activePlan = plans.find(p => p.status === 'ACTIVE');

  return (
    <div className="space-y-8">
      {/* Active Intervention Plan Summary */}
      <div className="bg-gradient-to-br from-indigo-700 to-indigo-800 rounded-3xl p-8 text-white shadow-xl shadow-indigo-100 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 text-white opacity-10">
          <Target size={180} />
        </div>
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-black mb-1">Intervention Strategy</h2>
              <p className="text-indigo-100 font-medium">Currently active program for {mtssCase.studentName}</p>
            </div>
            {activePlan && (
              <div className="bg-white/20 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/30 text-sm font-black uppercase tracking-widest">
                Tier {activePlan.tier.split(' ')[1]} Program
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <PlanCard 
              icon={<TrendingUp size={24} />}
              label="Frequency"
              value={activePlan ? `${activePlan.frequencyPerWeek}x / week` : 'Not Set'}
              subValue={activePlan ? `${activePlan.durationMinutes} min sessions` : 'Pending plan'}
            />
            <PlanCard 
              icon={<BookOpen size={24} />}
              label="Domain Focus"
              value={activePlan?.domain || mtssCase.subjectDomains.join(' & ')}
              subValue="Priority areas"
            />
            <PlanCard 
              icon={<Brain size={24} />}
              label="Home Support"
              value={activePlan?.supportAtHomeRequired ? 'REQUIRED' : 'NOT REQUIRED'}
              subValue="Family involvement"
            />
          </div>
        </div>
      </div>

      {/* Goals Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-black text-slate-800 flex items-center gap-3">
              <Target className="text-indigo-600" size={24} />
              SMART Goals
            </h3>
            <p className="text-sm text-slate-500 font-medium italic">Specific, Measurable, Achievable, Relevant, Time-bound</p>
          </div>
          <button 
            onClick={() => setIsAddingGoal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-indigo-600 font-bold rounded-xl hover:bg-slate-50 transition-all shadow-sm"
          >
            <Plus size={18} />
            Add New Goal
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AnimatePresence>
            {goals.map(goal => (
              <div key={goal.id}>
                <GoalCard goal={goal} />
              </div>
            ))}
            {goals.length === 0 && !isAddingGoal && (
              <div className="md:col-span-2 py-12 bg-white rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400">
                <Sparkles size={48} className="opacity-20 mb-4" />
                <p className="font-bold">No goals defined yet</p>
                <p className="text-xs">Start by defining measurable targets for intervention</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {isAddingGoal && (
          <AddGoalModal 
            caseId={mtssCase.id} 
            domains={mtssCase.subjectDomains}
            onClose={() => setIsAddingGoal(false)} 
            onSuccess={() => {
              setIsAddingGoal(false);
              onUpdate();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function PlanCard({ icon, label, value, subValue }: { icon: React.ReactNode; label: string; value: string; subValue: string }) {
  return (
    <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/20">
      <div className="p-2 bg-white/20 rounded-xl w-fit mb-3">{icon}</div>
      <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">{label}</p>
      <p className="text-lg font-black">{value}</p>
      <p className="text-xs opacity-70 mt-1">{subValue}</p>
    </div>
  );
}

function GoalCard({ goal }: { goal: MTSSAcademicGoal }) {
  const statusColors = {
    ACTIVE: 'bg-indigo-100 text-indigo-700',
    ACHIEVED: 'bg-emerald-100 text-emerald-700',
    PARTIAL: 'bg-amber-100 text-amber-700',
    NOT_ACHIEVED: 'bg-rose-100 text-rose-700',
    REPLACED: 'bg-slate-100 text-slate-500'
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm group hover:border-indigo-300 transition-all relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
        <button className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
          <Edit3 size={18} />
        </button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${statusColors[goal.status]}`}>
          {goal.status}
        </div>
        <div className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-widest">
          {goal.domain}
        </div>
      </div>

      <h4 className="text-lg font-black text-slate-900 mb-2">{goal.title}</h4>
      <p className="text-sm text-slate-600 line-clamp-3 mb-4 leading-relaxed">{goal.description}</p>
      
      <div className="bg-slate-50 p-4 rounded-2xl flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Target</p>
          <p className="text-sm font-bold text-slate-700">{goal.measurableTarget}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Baseline</p>
          <p className="text-sm font-bold text-slate-700">{goal.baselineSummary}</p>
        </div>
      </div>
    </motion.div>
  );
}

function AddGoalModal({ caseId, domains, onClose, onSuccess }: { caseId: string; domains: MTSSAcademicDomain[]; onClose: () => void; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    domain: domains[0] || 'ENGLISH',
    measurableTarget: '',
    baselineSummary: '',
    skillCategory: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await addMTSSAcademicGoal(caseId, {
        domain: formData.domain as MTSSAcademicDomain,
        skillCategory: formData.skillCategory,
        skillCode: null,
        goalType: 'CURRENT',
        title: formData.title,
        description: formData.description,
        measurableTarget: formData.measurableTarget,
        baselineSummary: formData.baselineSummary,
        targetMetric: { type: 'CUSTOM', value: null, unit: null },
        status: 'ACTIVE'
      });
      onSuccess();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden"
      >
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-xl font-black text-slate-900">Define New Academic Goal</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400">
            <Plus size={24} className="rotate-45" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Domain</label>
              <select 
                value={formData.domain}
                onChange={(e) => setFormData({ ...formData, domain: e.target.value as any })}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
              >
                {domains.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Category</label>
              <input 
                type="text"
                placeholder="e.g. Reading Fluency"
                value={formData.skillCategory}
                onChange={(e) => setFormData({ ...formData, skillCategory: e.target.value })}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Goal Title</label>
            <input 
              required
              type="text"
              placeholder="e.g. Master long vowel patterns"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Measureable Target</label>
            <textarea 
              required
              rows={2}
              placeholder="e.g. Read 80 words per minute with 95% accuracy"
              value={formData.measurableTarget}
              onChange={(e) => setFormData({ ...formData, measurableTarget: e.target.value })}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Current Baseline</label>
            <textarea 
              required
              rows={2}
              placeholder="e.g. Currently reading 45 words per minute"
              value={formData.baselineSummary}
              onChange={(e) => setFormData({ ...formData, baselineSummary: e.target.value })}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none resize-none"
            />
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
              {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : 'Create Goal'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
