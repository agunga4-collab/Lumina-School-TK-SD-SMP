import * as React from 'react';
import { SmartGoal, SmartGoalTrackerEntry, ConferencePeriod } from '../../../types';
import { Calendar, Save, X, AlertCircle } from 'lucide-react';

interface TrackerEntryFormProps {
  goals: SmartGoal[];
  period: ConferencePeriod;
  editingEntry: SmartGoalTrackerEntry | null;
  preselectedGoalId: string | null;
  onSave: (payload: {
    goalId: string;
    entryDate: number;
    actionsTaken: string;
    progressMade: string;
    hinderingBehaviors: string;
    improvementPlan: string;
  }) => Promise<void>;
  onCancel: () => void;
}

export default function TrackerEntryForm({
  goals,
  period,
  editingEntry,
  preselectedGoalId,
  onSave,
  onCancel
}: TrackerEntryFormProps) {
  // Setup fields
  const [goalId, setGoalId] = React.useState<string>(
    editingEntry?.goalId || preselectedGoalId || ''
  );
  
  // Format Date for datetime-local or date input
  const toDateInputString = (timestamp: number) => {
    const d = new Date(timestamp);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getInitialDate = () => {
    if (editingEntry) return toDateInputString(editingEntry.entryDate);
    
    const now = Date.now();
    // If today is after close, default to close date (or today clipped)
    // We clip to active tracker window constraints
    let defaultTime = now;
    if (period.trackerCloseDate && now > period.trackerCloseDate) {
      defaultTime = period.trackerCloseDate;
    }
    if (period.trackerOpenDate && now < period.trackerOpenDate) {
      defaultTime = period.trackerOpenDate;
    }
    return toDateInputString(defaultTime);
  };

  const [entryDateStr, setEntryDateStr] = React.useState<string>(getInitialDate());
  const [actionsTaken, setActionsTaken] = React.useState(editingEntry?.actionsTaken || '');
  const [progressMade, setProgressMade] = React.useState(editingEntry?.progressMade || '');
  const [hinderingBehaviors, setHinderingBehaviors] = React.useState(editingEntry?.hinderingBehaviors || '');
  const [improvementPlan, setImprovementPlan] = React.useState(editingEntry?.improvementPlan || '');

  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  // Derive goal details when goalId changes
  const selectedGoal = goals.find(g => g.id === goalId);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!goalId) {
      newErrors.goalId = 'Please select a goal to track.';
    }
    
    if (!entryDateStr) {
      newErrors.entryDate = 'Date is required.';
    } else {
      const selectedTime = new Date(entryDateStr).getTime();
      const now = Date.now();
      
      if (selectedTime > now) {
        newErrors.entryDate = 'Date cannot be in the future.';
      }
      if (period.trackerOpenDate && selectedTime < period.trackerOpenDate) {
        newErrors.entryDate = `Date cannot be before the tracker window open date (${new Date(period.trackerOpenDate).toLocaleDateString()}).`;
      }
      if (period.trackerCloseDate && selectedTime > period.trackerCloseDate) {
        newErrors.entryDate = `Date cannot be after the tracker window close date (${new Date(period.trackerCloseDate).toLocaleDateString()}).`;
      }
    }

    if (!actionsTaken.trim()) {
      newErrors.actionsTaken = 'This field is required.';
    }
    if (!progressMade.trim()) {
      newErrors.progressMade = 'This field is required.';
    }
    if (!hinderingBehaviors.trim()) {
      newErrors.hinderingBehaviors = 'This field is required.';
    }
    if (!improvementPlan.trim()) {
      newErrors.improvementPlan = 'This field is required.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    if (!validate()) return;

    try {
      setSaving(true);
      const entryTime = new Date(entryDateStr).getTime();
      await onSave({
        goalId,
        entryDate: entryTime,
        actionsTaken,
        progressMade,
        hinderingBehaviors,
        improvementPlan
      });
    } catch (err: any) {
      setErrors(prev => ({ ...prev, submit: err.message || 'Failed to save entry' }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-6" id="tracker-entry-form">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div>
          <h3 className="text-lg font-bold text-gray-900">
            {editingEntry ? 'Edit Progress Update' : 'New Progress Update'}
          </h3>
          <p className="text-xs text-gray-500">
            Provide details of the small steps you have taken towards your goal.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-600 transition p-1.5 hover:bg-gray-50 rounded-lg cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {errors.submit && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 text-red-800 rounded-lg text-sm">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{errors.submit}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Goal Selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
            Select Goal <span className="text-red-500">*</span>
          </label>
          {editingEntry ? (
            <div className="p-3 bg-gray-50 border border-gray-100 rounded-lg text-sm text-gray-700">
              <span className="font-bold block text-xs text-gray-500 uppercase">
                [{existingGoalStrand(editingEntry.goalStrand)}]
              </span>
              {editingEntry.goalSnapshot?.goal}
            </div>
          ) : (
            <select
              value={goalId}
              onChange={(e) => setGoalId(e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 ${
                errors.goalId ? 'border-red-300 focus:ring-red-100' : 'border-gray-200 focus:ring-blue-100'
              }`}
            >
              <option value="">-- Choose Goal --</option>
              {goals.map(g => (
                <option key={g.id} value={g.id}>
                  [{g.strand}] {g.goal.substring(0, 80)}{g.goal.length > 80 ? '...' : ''}
                </option>
              ))}
            </select>
          )}
          {errors.goalId && <span className="text-xs text-red-500">{errors.goalId}</span>}
        </div>

        {/* Date Input */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
            Date <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="date"
              value={entryDateStr}
              max={toDateInputString(Date.now())}
              onChange={(e) => setEntryDateStr(e.target.value)}
              className={`w-full pl-10 pr-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 ${
                errors.entryDate ? 'border-red-300 focus:ring-red-100' : 'border-gray-200 focus:ring-blue-100'
              }`}
            />
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          </div>
          {errors.entryDate && <span className="text-xs text-red-500 block">{errors.entryDate}</span>}
        </div>
      </div>

      {selectedGoal && (
        <div className="p-4 bg-blue-50/50 border border-blue-100/30 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
              Selected Goal Details ({selectedGoal.strand})
            </span>
            {selectedGoal.status && (
              <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                {selectedGoal.status.replace('_', ' ')}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-900 font-medium">
            {selectedGoal.goal}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 text-xs text-gray-600 border-t border-blue-100/55">
            <div>
              <span className="font-semibold block text-gray-500">Actions / Strategies</span>
              {selectedGoal.actions || '-'}
            </div>
            <div>
              <span className="font-semibold block text-gray-500">Evidence / Deliverables</span>
              {selectedGoal.evidence || '-'}
            </div>
          </div>
        </div>
      )}

      {/* Form Fields matching the document intent */}
      <div className="space-y-5">
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
            Things I Have Done to Achieve My Goal <span className="text-red-500">*</span>
          </label>
          <textarea
            value={actionsTaken}
            onChange={(e) => setActionsTaken(e.target.value)}
            rows={3}
            placeholder="List specific tasks, steps, or practices you did."
            className={`w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 ${
              errors.actionsTaken ? 'border-red-300 focus:ring-red-100' : 'border-gray-200 focus:ring-blue-100'
            }`}
          />
          {errors.actionsTaken && <span className="text-xs text-red-500">{errors.actionsTaken}</span>}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
            Progress I Have Made <span className="text-red-500">*</span>
          </label>
          <textarea
            value={progressMade}
            onChange={(e) => setProgressMade(e.target.value)}
            rows={3}
            placeholder="Describe any improvements, results, or milestones achieved."
            className={`w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 ${
              errors.progressMade ? 'border-red-300 focus:ring-red-100' : 'border-gray-200 focus:ring-blue-100'
            }`}
          />
          {errors.progressMade && <span className="text-xs text-red-500">{errors.progressMade}</span>}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
            What Behavior Hinders My Goal <span className="text-red-500">*</span>
          </label>
          <textarea
            value={hinderingBehaviors}
            onChange={(e) => setHinderingBehaviors(e.target.value)}
            rows={3}
            placeholder="Identify obstacles, habits, or distractions that get in the way."
            className={`w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 ${
              errors.hinderingBehaviors ? 'border-red-300 focus:ring-red-100' : 'border-gray-200 focus:ring-blue-100'
            }`}
          />
          {errors.hinderingBehaviors && <span className="text-xs text-red-500">{errors.hinderingBehaviors}</span>}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
            My Improvement Plan <span className="text-red-500">*</span>
          </label>
          <textarea
            value={improvementPlan}
            onChange={(e) => setImprovementPlan(e.target.value)}
            rows={3}
            placeholder="What adjustments or routines will you focus on to overcome hindering behaviors?"
            className={`w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 ${
              errors.improvementPlan ? 'border-red-300 focus:ring-red-100' : 'border-gray-200 focus:ring-blue-100'
            }`}
          />
          {errors.improvementPlan && <span className="text-xs text-red-500">{errors.improvementPlan}</span>}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2 text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition disabled:opacity-50 cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition rounded-lg shadow disabled:opacity-50 cursor-pointer"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Save Progress Update'}
        </button>
      </div>
    </form>
  );
}

function existingGoalStrand(strand: string) {
  return strand;
}
