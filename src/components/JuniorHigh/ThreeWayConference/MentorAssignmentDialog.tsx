import React, { useState, useEffect } from 'react';
import { X, UserPlus, ShieldAlert, Loader2, RefreshCw, Trash2, User } from 'lucide-react';
import { threeWayConferenceService } from '../../../services/threeWayConferenceService';
import { MentorAssignmentHistory } from './MentorAssignmentHistory';
import type { Student, MentorAssignment, User as AppUser } from '../../../types';

interface MentorAssignmentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  currentAssignment: MentorAssignment | null;
  onSaveSuccess: () => void;
}

export const MentorAssignmentDialog: React.FC<MentorAssignmentDialogProps> = ({
  isOpen,
  onClose,
  student,
  currentAssignment,
  onSaveSuccess,
}) => {
  const [eligibleMentors, setEligibleMentors] = useState<AppUser[]>([]);
  const [selectedMentorId, setSelectedMentorId] = useState<string>('');
  const [noteOrReason, setNoteOrReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isLoadingMentors, setIsLoadingMentors] = useState<boolean>(false);
  const [showRemovalConfirm, setShowRemovalConfirm] = useState<boolean>(false);
  const [removalReason, setRemovalReason] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const activeMentor = currentAssignment?.status !== 'REMOVED' ? currentAssignment : null;

  // Load eligible mentors on open
  useEffect(() => {
    if (isOpen) {
      const loadMentors = async () => {
        setIsLoadingMentors(true);
        setError(null);
        try {
          const mentors = await threeWayConferenceService.getEligibleJuniorHighMentors();
          setEligibleMentors(mentors);
          if (activeMentor) {
            setSelectedMentorId(activeMentor.mentorId);
          } else {
            setSelectedMentorId('');
          }
          setNoteOrReason('');
          setRemovalReason('');
          setShowRemovalConfirm(false);
        } catch (err: any) {
          setError(err.message || 'Failed to load eligible mentor teachers.');
        } finally {
          setIsLoadingMentors(false);
        }
      };
      loadMentors();
    }
  }, [isOpen, activeMentor]);

  if (!isOpen || !student) return null;

  const handleAssign = async () => {
    if (!selectedMentorId) {
      setError('Please select a mentor teacher.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const periodId = currentAssignment?.periodId || window.location.pathname.split('/').pop() || '';
      if (!periodId || periodId === 'workspace') {
        // Fallback or dynamically fetch period ID
        throw new Error('Could not resolve active conference period ID. Please try again.');
      }

      if (activeMentor) {
        // Change/Reassign mentor
        await threeWayConferenceService.reassignMentorForStudent(
          periodId,
          student.id,
          selectedMentorId,
          noteOrReason
        );
      } else {
        // New Assignment
        await threeWayConferenceService.assignMentorToStudent(
          periodId,
          student.id,
          selectedMentorId,
          noteOrReason
        );
      }
      onSaveSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update mentor assignment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const periodId = currentAssignment?.periodId || '';
      if (!periodId) throw new Error('Missing Period ID');

      await threeWayConferenceService.removeMentorFromStudent(
        periodId,
        student.id,
        removalReason
      );
      onSaveSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to remove mentor.');
    } finally {
      setIsSubmitting(false);
      setShowRemovalConfirm(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true" id="mentor-assignment-modal">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* Backdrop overlay */}
        <div className="fixed inset-0 bg-gray-500/75 backdrop-blur-sm transition-opacity" aria-hidden="true" onClick={onClose} />

        {/* Modal panel container */}
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full border border-gray-100">
          
          {/* Header */}
          <div className="bg-gray-50/70 px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-blue-600" />
              <h3 className="text-lg font-bold text-gray-900" id="modal-title">
                {activeMentor ? 'Change Mentor Assignment' : 'Assign Mentor Teacher'}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 hover:bg-gray-100 p-1.5 rounded-lg transition"
              id="close-assignment-modal-btn"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-6 max-h-[75vh] overflow-y-auto">
            {/* Student card info */}
            <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
                {student.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-gray-900 truncate">{student.name}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-gray-500 font-medium">
                  <span>ID / NIS: <strong className="text-gray-700 font-mono">{student.nis || student.id}</strong></span>
                  <span>•</span>
                  <span>Class: <strong className="text-gray-700">{student.classId}</strong></span>
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex gap-3 text-red-700 text-sm">
                <ShieldAlert className="h-5 w-5 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {/* Removal Confirmation Mode */}
            {showRemovalConfirm ? (
              <div className="space-y-4 bg-red-50/30 border border-red-100 rounded-xl p-5" id="removal-confirm-container">
                <div className="flex items-center gap-2 text-red-700">
                  <ShieldAlert className="h-5 w-5" />
                  <h4 className="font-bold text-sm uppercase tracking-wider">Confirm Mentor Removal</h4>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Are you sure you want to remove <strong className="text-gray-900">{activeMentor?.mentorName}</strong> as mentor for <strong className="text-gray-900">{student.name}</strong>?
                  This will change their status to <strong className="text-gray-900">Unassigned</strong> but will preserve the historical tracking logs.
                </p>
                <div>
                  <label htmlFor="removal-reason-input" className="block text-xs font-bold text-red-700 uppercase tracking-wider mb-1.5">
                    Reason for Removal (Optional)
                  </label>
                  <textarea
                    id="removal-reason-input"
                    rows={2}
                    value={removalReason}
                    onChange={(e) => setRemovalReason(e.target.value)}
                    placeholder="Provide a brief explanation for removing this mentor assignment..."
                    className="block w-full px-3 py-2 border border-red-200 rounded-lg text-sm placeholder-red-400/70 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 bg-white"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    id="cancel-removal-btn"
                    type="button"
                    onClick={() => setShowRemovalConfirm(false)}
                    className="px-4 py-2 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    id="confirm-removal-btn"
                    type="button"
                    onClick={handleRemove}
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-1.5 px-4 py-2 border border-transparent rounded-lg text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition shadow-sm disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Removing...
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-3.5 w-3.5" />
                        Confirm Removal
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* Regular Assignment / Reassignment Form */
              <div className="space-y-4">
                {/* Select Mentor */}
                <div>
                  <label htmlFor="mentor-teacher-select" className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                    Choose Eligible Mentor Teacher
                  </label>
                  {isLoadingMentors ? (
                    <div className="flex items-center gap-2 py-2 text-sm text-gray-500">
                      <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                      Loading eligible junior high staff...
                    </div>
                  ) : (
                    <select
                      id="mentor-teacher-select"
                      value={selectedMentorId}
                      onChange={(e) => setSelectedMentorId(e.target.value)}
                      className="block w-full py-2.5 px-3 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">-- Select Teacher --</option>
                      {eligibleMentors.map((m) => (
                        <option key={m.uid} value={m.uid}>
                          {m.displayName} ({m.email} - {m.role})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Assignment Note / Reason */}
                <div>
                  <label htmlFor="assignment-note-textarea" className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                    {activeMentor ? 'Reason for Reassignment' : 'Assignment Note / Remark (Optional)'}
                  </label>
                  <textarea
                    id="assignment-note-textarea"
                    rows={3}
                    value={noteOrReason}
                    onChange={(e) => setNoteOrReason(e.target.value)}
                    placeholder={
                      activeMentor
                        ? 'Why are you changing mentor for this student? (Required for logging)'
                        : 'Any optional notes regarding this initial assignment...'
                    }
                    className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Removal Option for Current Assignments */}
                {activeMentor && (
                  <div className="pt-3 border-t border-gray-100 flex items-center justify-between" id="remove-assignment-box">
                    <div className="text-xs text-gray-500">
                      <span>Current Mentor: </span>
                      <strong className="text-gray-700">{activeMentor.mentorName}</strong>
                    </div>
                    <button
                      id="trigger-removal-btn"
                      type="button"
                      onClick={() => setShowRemovalConfirm(true)}
                      className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100/70 border border-red-100 px-3 py-1.5 rounded-lg transition"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove Mentor
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Read-only History Timeline */}
            {currentAssignment && (
              <div className="pt-5 border-t border-gray-100">
                <MentorAssignmentHistory assignment={currentAssignment} />
              </div>
            )}
          </div>

          {/* Footer */}
          {!showRemovalConfirm && (
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button
                id="cancel-assignment-dialog-btn"
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                id="submit-assignment-btn"
                type="button"
                onClick={handleAssign}
                disabled={isSubmitting || isLoadingMentors || !selectedMentorId}
                className="inline-flex items-center gap-1.5 px-4 py-2 border border-transparent rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition shadow-sm disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    {activeMentor ? <RefreshCw className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
                    {activeMentor ? 'Change Assignment' : 'Assign Mentor'}
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
