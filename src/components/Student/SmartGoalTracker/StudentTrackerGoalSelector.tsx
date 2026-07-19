import * as React from 'react';
import { SmartGoal, ConferenceGoalStrand, SmartGoalTrackerEntry } from '../../../types';
import { Compass, BookOpen, Brain, Heart, ChevronRight } from 'lucide-react';

interface StudentTrackerGoalSelectorProps {
  goals: SmartGoal[];
  trackerEntries: SmartGoalTrackerEntry[];
  selectedGoalId: string | null;
  onSelectGoal: (goalId: string | null) => void;
}

export default function StudentTrackerGoalSelector({
  goals,
  trackerEntries,
  selectedGoalId,
  onSelectGoal
}: StudentTrackerGoalSelectorProps) {
  
  const getStrandIcon = (strand: ConferenceGoalStrand) => {
    switch (strand) {
      case 'SPIRITUAL':
        return <Heart className="h-5 w-5 text-emerald-500" />;
      case 'IMAGINAL':
        return <Compass className="h-5 w-5 text-purple-500" />;
      case 'RATIONAL':
        return <Brain className="h-5 w-5 text-blue-500" />;
      case 'MATERIAL_PHYSICAL':
        return <BookOpen className="h-5 w-5 text-amber-500" />;
      default:
        return <Compass className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStrandBg = (strand: ConferenceGoalStrand) => {
    switch (strand) {
      case 'SPIRITUAL': return 'bg-emerald-50 border-emerald-100 hover:bg-emerald-100/50';
      case 'IMAGINAL': return 'bg-purple-50 border-purple-100 hover:bg-purple-100/50';
      case 'RATIONAL': return 'bg-blue-50 border-blue-100 hover:bg-blue-100/50';
      case 'MATERIAL_PHYSICAL': return 'bg-amber-50 border-amber-100 hover:bg-amber-100/50';
      default: return 'bg-gray-50 border-gray-100 hover:bg-gray-100/50';
    }
  };

  const getSelectedBorder = (strand: ConferenceGoalStrand) => {
    switch (strand) {
      case 'SPIRITUAL': return 'border-2 border-emerald-500 ring-2 ring-emerald-100';
      case 'IMAGINAL': return 'border-2 border-purple-500 ring-2 ring-purple-100';
      case 'RATIONAL': return 'border-2 border-blue-500 ring-2 ring-blue-100';
      case 'MATERIAL_PHYSICAL': return 'border-2 border-amber-500 ring-2 ring-amber-100';
      default: return 'border-2 border-blue-500 ring-2 ring-blue-100';
    }
  };

  const formatDate = (ts: number | null) => {
    if (!ts) return '-';
    return new Date(ts).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const getEntriesCountForGoal = (goalId: string) => {
    return trackerEntries.filter(entry => entry.goalId === goalId).length;
  };

  // Group goals by strands in a defined order
  const strandsOrder: ConferenceGoalStrand[] = ['SPIRITUAL', 'IMAGINAL', 'RATIONAL', 'MATERIAL_PHYSICAL'];
  
  return (
    <div className="space-y-4" id="tracker-goal-selector">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Choose a Goal to Track</h3>
        {selectedGoalId && (
          <button
            onClick={() => onSelectGoal(null)}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
          >
            Show All Goals
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {strandsOrder.map(strand => {
          const strandGoals = goals.filter(g => g.strand === strand);
          if (strandGoals.length === 0) return null;

          return strandGoals.map(goal => {
            const isSelected = selectedGoalId === goal.id;
            const entriesCount = getEntriesCountForGoal(goal.id);

            return (
              <div
                key={goal.id}
                id={`goal-card-${goal.id}`}
                onClick={() => onSelectGoal(isSelected ? null : goal.id)}
                className={`flex flex-col p-4 rounded-xl border transition cursor-pointer relative justify-between min-h-[140px] ${
                  isSelected ? getSelectedBorder(goal.strand) : `border-gray-100 ${getStrandBg(goal.strand)}`
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {getStrandIcon(goal.strand)}
                      <span className="text-xs font-bold uppercase tracking-wider text-gray-700">
                        {goal.strand.replace('_', '/')}
                      </span>
                    </div>
                    {goal.status && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        goal.status === 'COMPLETED' 
                          ? 'bg-emerald-100 text-emerald-800' 
                          : goal.status === 'ACTIVE' 
                          ? 'bg-blue-100 text-blue-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {goal.status.replace('_', ' ')}
                      </span>
                    )}
                  </div>
                  
                  <p className="text-sm text-gray-900 font-medium line-clamp-2">
                    {goal.goal}
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-black/5">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-gray-400">Target Period</span>
                    <span className="font-medium">
                      {formatDate(goal.startDate)} - {formatDate(goal.targetDate)}
                    </span>
                  </div>
                  <div className="bg-white/80 border border-black/5 rounded-full px-2.5 py-1 text-xs font-bold text-gray-700">
                    {entriesCount} {entriesCount === 1 ? 'entry' : 'entries'}
                  </div>
                </div>
              </div>
            );
          });
        })}
      </div>
    </div>
  );
}
