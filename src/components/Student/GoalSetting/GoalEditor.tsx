import * as React from 'react';
import { 
  Trash2, ChevronDown, ChevronUp, AlertTriangle, 
  HelpCircle, Calendar, Target, Shield 
} from 'lucide-react';
import { SmartGoal } from '../../../types';

interface GoalEditorProps {
  key?: string;
  goal: SmartGoal;
  disabled: boolean;
  onUpdate: (updatedGoal: SmartGoal) => void;
  onRemove: () => void;
}

export default function GoalEditor({ goal, disabled, onUpdate, onRemove }: GoalEditorProps) {
  const [isSmartCollapsed, setIsSmartCollapsed] = React.useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);

  const handleFieldChange = (field: keyof SmartGoal, value: any) => {
    onUpdate({
      ...goal,
      [field]: value,
      updatedAt: Date.now()
    });
  };

  // Convert millis to 'YYYY-MM-DD' string for input
  const msToDateString = (ms: number | null) => {
    if (!ms) return '';
    try {
      return new Date(ms).toISOString().split('T')[0];
    } catch (e) {
      return '';
    }
  };

  // Convert 'YYYY-MM-DD' string to millis
  const dateStringToMs = (val: string) => {
    if (!val) return null;
    try {
      const parsed = new Date(val);
      return isNaN(parsed.getTime()) ? null : parsed.getTime();
    } catch (e) {
      return null;
    }
  };

  return (
    <div className="bg-white rounded-[2rem] border border-gray-100 p-6 md:p-8 space-y-6 shadow-sm transition-all duration-300 hover:border-blue-100">
      
      {/* Goal Title / Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
            <Target size={20} />
          </div>
          <div>
            <h3 className="font-black text-gray-800 uppercase italic text-sm tracking-tight">Goal Configuration</h3>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Status: <span className="text-amber-500">{goal.status || 'DRAFT'}</span></p>
          </div>
        </div>

        {/* Actions / Remove */}
        {!disabled && (
          <div className="relative">
            {!showDeleteConfirm ? (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors"
              >
                <Trash2 size={14} /> Remove Goal
              </button>
            ) : (
              <div className="flex items-center gap-2 p-1.5 bg-rose-50 border border-rose-200 rounded-xl animate-in fade-in duration-200">
                <span className="text-[9px] font-black text-rose-700 uppercase px-2">Remove goal?</span>
                <button
                  type="button"
                  onClick={onRemove}
                  className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white text-[9px] font-black uppercase rounded-lg transition-colors"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3 py-1 bg-white hover:bg-gray-100 text-gray-500 text-[9px] font-black uppercase rounded-lg border border-gray-200 transition-colors"
                >
                  No
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Primary Goal Text */}
      <div className="space-y-2">
        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">
          My Goal <span className="text-red-500">*</span>
        </label>
        <textarea
          disabled={disabled}
          value={goal.goal || ''}
          onChange={(e) => handleFieldChange('goal', e.target.value)}
          placeholder="State your main objective clearly here..."
          className="w-full min-h-[80px] p-4 bg-gray-50 hover:bg-gray-100/50 focus:bg-white rounded-xl border border-transparent focus:border-blue-500 outline-none transition-all duration-200 text-sm font-bold text-gray-700 leading-relaxed resize-none disabled:opacity-75 disabled:hover:bg-gray-50"
        />
      </div>

      {/* Dates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Start Date */}
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-1.5">
            <Calendar size={12} className="text-blue-500" /> Start Date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            disabled={disabled}
            value={msToDateString(goal.startDate)}
            onChange={(e) => handleFieldChange('startDate', dateStringToMs(e.target.value))}
            className="w-full p-4 bg-gray-50 hover:bg-gray-100/50 focus:bg-white rounded-xl border border-transparent focus:border-blue-500 outline-none transition-all duration-200 text-sm font-bold text-gray-700 disabled:opacity-75"
          />
        </div>

        {/* Target Date */}
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-1.5">
            <Calendar size={12} className="text-rose-500" /> Target Date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            disabled={disabled}
            value={msToDateString(goal.targetDate)}
            onChange={(e) => handleFieldChange('targetDate', dateStringToMs(e.target.value))}
            className="w-full p-4 bg-gray-50 hover:bg-gray-100/50 focus:bg-white rounded-xl border border-transparent focus:border-blue-500 outline-none transition-all duration-200 text-sm font-bold text-gray-700 disabled:opacity-75"
          />
        </div>
      </div>

      {/* Collapsible SMART Details Section */}
      <div className="border border-gray-100 rounded-2xl overflow-hidden bg-gray-50/50">
        <button
          type="button"
          onClick={() => setIsSmartCollapsed(!isSmartCollapsed)}
          className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors border-b border-gray-100"
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-xs tracking-wider uppercase">
              SMART
            </div>
            <span className="text-xs font-black text-gray-700 uppercase tracking-wider">SMART Reflective Details</span>
          </div>
          {isSmartCollapsed ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronUp size={16} className="text-gray-400" />}
        </button>

        {!isSmartCollapsed && (
          <div className="p-6 space-y-6 bg-white animate-in slide-in-from-top-2 duration-200">
            {/* Specific */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-indigo-600 flex items-center gap-1">
                S • Specific <span className="text-red-500">*</span>
                <span className="text-[9px] text-gray-400 font-medium normal-case ml-1">- What exactly do I want to achieve?</span>
              </label>
              <textarea
                disabled={disabled}
                value={goal.smartSpecific || ''}
                onChange={(e) => handleFieldChange('smartSpecific', e.target.value)}
                placeholder="Detail exactly what you want to achieve..."
                className="w-full min-h-[60px] p-3 bg-gray-50 focus:bg-white rounded-lg border border-transparent focus:border-indigo-500 outline-none transition-all text-xs font-medium text-gray-700 resize-none disabled:opacity-75"
              />
            </div>

            {/* Measurable */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-indigo-600 flex items-center gap-1">
                M • Measurable <span className="text-red-500">*</span>
                <span className="text-[9px] text-gray-400 font-medium normal-case ml-1">- How will I know that I am making progress?</span>
              </label>
              <textarea
                disabled={disabled}
                value={goal.smartMeasurable || ''}
                onChange={(e) => handleFieldChange('smartMeasurable', e.target.value)}
                placeholder="Explain the metrics or signs that prove your progress..."
                className="w-full min-h-[60px] p-3 bg-gray-50 focus:bg-white rounded-lg border border-transparent focus:border-indigo-500 outline-none transition-all text-xs font-medium text-gray-700 resize-none disabled:opacity-75"
              />
            </div>

            {/* Achievable */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-indigo-600 flex items-center gap-1">
                A • Achievable <span className="text-red-500">*</span>
                <span className="text-[9px] text-gray-400 font-medium normal-case ml-1">- Why is this goal realistic for me?</span>
              </label>
              <textarea
                disabled={disabled}
                value={goal.smartAchievable || ''}
                onChange={(e) => handleFieldChange('smartAchievable', e.target.value)}
                placeholder="Why are you confident that you can achieve this?..."
                className="w-full min-h-[60px] p-3 bg-gray-50 focus:bg-white rounded-lg border border-transparent focus:border-indigo-500 outline-none transition-all text-xs font-medium text-gray-700 resize-none disabled:opacity-75"
              />
            </div>

            {/* Relevant */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-indigo-600 flex items-center gap-1">
                R • Relevant <span className="text-red-500">*</span>
                <span className="text-[9px] text-gray-400 font-medium normal-case ml-1">- Why is this goal meaningful to me?</span>
              </label>
              <textarea
                disabled={disabled}
                value={goal.smartRelevant || ''}
                onChange={(e) => handleFieldChange('smartRelevant', e.target.value)}
                placeholder="Why is this goal important to your personal growth?..."
                className="w-full min-h-[60px] p-3 bg-gray-50 focus:bg-white rounded-lg border border-transparent focus:border-indigo-500 outline-none transition-all text-xs font-medium text-gray-700 resize-none disabled:opacity-75"
              />
            </div>

            {/* Time-Bound */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-indigo-600 flex items-center gap-1">
                T • Time-Bound <span className="text-red-500">*</span>
                <span className="text-[9px] text-gray-400 font-medium normal-case ml-1">- When do I aim to achieve this goal?</span>
              </label>
              <textarea
                disabled={disabled}
                value={goal.smartTimeBound || ''}
                onChange={(e) => handleFieldChange('smartTimeBound', e.target.value)}
                placeholder="State the deadline or milestones clearly..."
                className="w-full min-h-[60px] p-3 bg-gray-50 focus:bg-white rounded-lg border border-transparent focus:border-indigo-500 outline-none transition-all text-xs font-medium text-gray-700 resize-none disabled:opacity-75"
              />
            </div>
          </div>
        )}
      </div>

      {/* Goal Action Plan */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-emerald-50/20 p-6 rounded-[2rem] border border-emerald-500/10">
        {/* Things I Have to Do to Achieve My Goal */}
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
            Things I Have to Do to Achieve My Goal <span className="text-red-500">*</span>
          </label>
          <textarea
            disabled={disabled}
            value={goal.actions || ''}
            onChange={(e) => handleFieldChange('actions', e.target.value)}
            placeholder="Write clear steps or tasks you need to perform..."
            className="w-full min-h-[100px] p-4 bg-white rounded-xl border border-transparent focus:border-emerald-500 shadow-sm outline-none transition-all duration-200 text-xs font-bold text-gray-700 leading-relaxed resize-none disabled:opacity-75"
          />
        </div>

        {/* Proof That My Effort Is Working */}
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
            Proof That My Effort Is Working <span className="text-red-500">*</span>
          </label>
          <textarea
            disabled={disabled}
            value={goal.evidence || ''}
            onChange={(e) => handleFieldChange('evidence', e.target.value)}
            placeholder="What concrete evidence or signs will prove your steps are succeeding?..."
            className="w-full min-h-[100px] p-4 bg-white rounded-xl border border-transparent focus:border-emerald-500 shadow-sm outline-none transition-all duration-200 text-xs font-bold text-gray-700 leading-relaxed resize-none disabled:opacity-75"
          />
        </div>
      </div>

    </div>
  );
}
