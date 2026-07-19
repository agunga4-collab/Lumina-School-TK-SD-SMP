import * as React from 'react';
import { SmartGoalTrackerEntry } from '../../../types';
import TrackerEntryCard from './TrackerEntryCard';
import { ClipboardList, Filter } from 'lucide-react';

interface StudentTrackerTimelineProps {
  entries: SmartGoalTrackerEntry[];
  selectedGoalId: string | null;
  onClearFilter: () => void;
  canEditEntries: boolean;
  onEditEntry: (entry: SmartGoalTrackerEntry) => void;
}

export default function StudentTrackerTimeline({
  entries,
  selectedGoalId,
  onClearFilter,
  canEditEntries,
  onEditEntry
}: StudentTrackerTimelineProps) {
  
  const filteredEntries = selectedGoalId
    ? entries.filter(e => e.goalId === selectedGoalId)
    : entries;

  if (entries.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center space-y-3" id="timeline-empty">
        <div className="mx-auto w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-500">
          <ClipboardList className="h-6 w-6" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-gray-900">No progress updates found</h4>
          <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
            You haven't added any progress updates for this conference period yet. Click "Add Progress Update" to begin.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" id="tracker-timeline-section">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
          <Filter className="h-4 w-4 text-gray-400" />
          <span>Timeline Updates ({filteredEntries.length})</span>
        </div>
        {selectedGoalId && (
          <button
            onClick={onClearFilter}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
          >
            Clear Goal Filter
          </button>
        )}
      </div>

      {filteredEntries.length === 0 ? (
        <div className="p-6 text-center border border-dashed border-gray-200 rounded-xl bg-gray-50 text-xs text-gray-500">
          No entries found for the selected goal.
        </div>
      ) : (
        <div className="space-y-4 relative before:absolute before:left-6 before:top-4 before:bottom-4 before:w-0.5 before:bg-gray-100">
          {filteredEntries.map(entry => (
            <div key={entry.id} className="relative pl-10">
              {/* Timeline bubble */}
              <div className="absolute left-[19px] top-6 w-3 h-3 rounded-full bg-blue-500 border-2 border-white ring-4 ring-blue-50" />
              
              <TrackerEntryCard
                entry={entry}
                canEdit={canEditEntries}
                onEdit={onEditEntry}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
