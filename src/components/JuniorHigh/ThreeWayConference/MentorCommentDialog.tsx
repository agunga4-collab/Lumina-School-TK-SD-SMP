import React from 'react';
import { SmartGoalTrackerEntry, Student } from '../../../types';
import { X, Save, MessageSquare, AlertCircle } from 'lucide-react';

interface MentorCommentDialogProps {
  entry: (SmartGoalTrackerEntry & { studentDetail?: Student }) | null;
  onClose: () => void;
  onSave: (comment: string) => Promise<void>;
}

export const MentorCommentDialog: React.FC<MentorCommentDialogProps> = ({
  entry,
  onClose,
  onSave
}) => {
  if (!entry) return null;

  const [comment, setComment] = React.useState(entry.mentorComment || '');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    if (!comment.trim()) {
      setError('Mentor comment cannot be empty.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await onSave(comment.trim());
    } catch (err: any) {
      setError(err.message || 'Failed to save mentor comment.');
    } finally {
      setSaving(false);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" id="mentor-comment-dialog-overlay">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-blue-500" />
            <h3 className="text-base font-bold text-gray-900">
              {entry.mentorComment ? 'Edit Mentor Comment' : 'Add Mentor Comment'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5 hover:bg-gray-100 rounded-lg transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 flex-1">
          
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 text-red-800 rounded-lg text-xs">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Student Goal Read-Only Context */}
          <div className="p-3.5 bg-gray-50 border border-gray-100 rounded-xl space-y-2 text-[11px] text-gray-600">
            <div>
              <span className="text-gray-400 uppercase font-bold text-[9px] tracking-wider block">Student</span>
              <span className="font-bold text-gray-900 text-xs">
                {entry.studentDetail?.name}
              </span>
            </div>
            <div>
              <span className="text-gray-400 uppercase font-bold text-[9px] tracking-wider block">Goal ({entry.goalStrand})</span>
              <p className="font-semibold text-gray-800 line-clamp-2 mt-0.5">
                {entry.goalSnapshot?.goal}
              </p>
            </div>
            <div>
              <span className="text-gray-400 uppercase font-bold text-[9px] tracking-wider block">Update Entry Date</span>
              <span className="font-bold text-gray-700">
                {formatDate(entry.entryDate)}
              </span>
            </div>
          </div>

          {/* Comment Field */}
          <div className="space-y-1.5">
            <label htmlFor="mentor-comment-textarea" className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
              Mentor Comment <span className="text-red-500">*</span>
            </label>
            <textarea
              id="mentor-comment-textarea"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={5}
              placeholder="Write clear, supportive feedback, guidance, or plans for this progress entry..."
              className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white"
              required
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 hover:text-gray-900 transition disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white transition rounded-lg shadow disabled:opacity-50 cursor-pointer"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Comment'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
