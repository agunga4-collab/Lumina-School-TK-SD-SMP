import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, UserPlus, ShieldAlert, Loader2, RefreshCw, Trash2, UserCheck, Calendar } from 'lucide-react';
import { threeWayConferenceService } from '../../../services/threeWayConferenceService';
import { MentorAssignmentHistory } from './MentorAssignmentHistory';
import type { Student, MentorAssignment, User as AppUser } from '../../../types';
import { toast } from 'sonner';

interface MentorAssignmentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  periodId: string;
  student: Student | null;
  currentAssignment: MentorAssignment | null;
  onSaveSuccess: () => void;
}

export const MentorAssignmentDialog: React.FC<MentorAssignmentDialogProps> = ({
  isOpen,
  onClose,
  periodId,
  student,
  currentAssignment,
  onSaveSuccess,
}) => {
  const [eligibleMentors, setEligibleMentors] = useState<AppUser[]>([]);
  const [selectedMentorId, setSelectedMentorId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [noteOrReason, setNoteOrReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isLoadingMentors, setIsLoadingMentors] = useState<boolean>(false);
  const [studentResponse, setStudentResponse] = useState<any | null>(null);
  const [showRemovalConfirm, setShowRemovalConfirm] = useState<boolean>(false);
  const [removalReason, setRemovalReason] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const activeMentor = currentAssignment?.status !== 'REMOVED' ? currentAssignment : null;

  // Prevent background body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle escape key to close dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, isSubmitting]);

  // Focus the search input when open
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Use primitive dependencies to prevent infinite re-renders
  const studentId = student?.id;
  const currentAssignmentMentorId = currentAssignment?.mentorId;
  const currentAssignmentStatus = currentAssignment?.status;

  useEffect(() => {
    if (isOpen && studentId) {
      const loadDetails = async () => {
        setIsLoadingMentors(true);
        setError(null);
        try {
          // 1. Fetch eligible mentors
          const mentors = await threeWayConferenceService.getEligibleJuniorHighMentors();
          setEligibleMentors(mentors);
          
          const isActive = currentAssignmentStatus && currentAssignmentStatus !== 'REMOVED';
          if (isActive && currentAssignmentMentorId) {
            setSelectedMentorId(currentAssignmentMentorId);
          } else {
            setSelectedMentorId('');
          }
          setNoteOrReason('');
          setRemovalReason('');
          setShowRemovalConfirm(false);
          setSearchQuery('');

          // 2. Fetch student conference response details
          if (periodId && periodId !== 'workspace') {
            const resp = await threeWayConferenceService.getStudentConferenceResponse(periodId, studentId);
            setStudentResponse(resp);
          } else {
            setStudentResponse(null);
          }
        } catch (err: any) {
          setError(err.message || 'Gagal memuat detail data assignment.');
        } finally {
          setIsLoadingMentors(false);
        }
      };
      loadDetails();
    }
  }, [isOpen, studentId, periodId, currentAssignmentStatus, currentAssignmentMentorId]);

  if (!isOpen || !student) return null;

  // Filter & Sort Mentors
  const filteredMentors = eligibleMentors
    .filter((m) => {
      const name = (m.displayName || m.email || '').toLowerCase();
      return name.includes(searchQuery.toLowerCase());
    })
    .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));

  const handleAssign = async () => {
    const pId = periodId || currentAssignment?.periodId || '';
    if (!pId || pId === 'workspace') {
      setError('Gagal mendeteksi Periode Konferensi aktif. Harap muat ulang halaman.');
      return;
    }

    if (!selectedMentorId) {
      setError('Harap pilih guru mentor terlebih dahulu.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      if (activeMentor) {
        // Change/Reassign mentor
        await threeWayConferenceService.reassignMentorForStudent(
          pId,
          student.id,
          selectedMentorId,
          noteOrReason
        );
      } else {
        // New Assignment
        await threeWayConferenceService.assignMentorToStudent(
          pId,
          student.id,
          selectedMentorId,
          noteOrReason
        );
      }
      
      toast.success('Mentor berhasil ditugaskan.');
      onSaveSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Gagal menyimpan penugasan mentor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async () => {
    const pId = periodId || currentAssignment?.periodId || '';
    if (!pId || pId === 'workspace') {
      setError('ID Periode Konferensi tidak ditemukan.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await threeWayConferenceService.removeMentorFromStudent(
        pId,
        student.id,
        removalReason
      );
      
      toast.success('Penugasan mentor berhasil dihapus.');
      onSaveSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Gagal menghapus penugasan mentor.');
    } finally {
      setIsSubmitting(false);
      setShowRemovalConfirm(false);
    }
  };

  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-red-500/10" 
      id="mentor-assignment-modal-wrapper"
    >
      {/* Backdrop overlay */}
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm cursor-default" 
        aria-hidden="true" 
        onClick={isSubmitting ? undefined : onClose} 
      />

      {/* Modal content panel - custom solid, centered, white dialog */}
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="mentor-assignment-title"
        className="relative w-full max-w-xl bg-white text-slate-900 border-2 border-blue-500 shadow-[0_24px_80px_rgba(15,23,42,0.28)] rounded-2xl min-h-[320px] max-h-[85vh] overflow-hidden flex flex-col z-50 animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-blue-600" />
            <h3 className="text-base font-extrabold text-slate-900" id="mentor-assignment-title">
              {activeMentor ? 'Ganti Mentor' : 'Tugaskan Mentor'}
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded-lg transition disabled:opacity-50"
            id="close-assignment-modal-btn"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          
          {/* Student identity card */}
          <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-base uppercase shrink-0">
              {student.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-slate-900 truncate">{student.name}</p>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                NIS: <span className="font-bold text-slate-700">{student.nis || student.id}</span>
              </p>
            </div>
          </div>

          {/* Request Details Metadata */}
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-slate-400 font-bold uppercase tracking-wider block text-[10px]">Kelas</span>
              <span className="text-slate-900 font-semibold text-sm">{studentResponse?.className || student.classId || '—'}</span>
            </div>
            <div>
              <span className="text-slate-400 font-bold uppercase tracking-wider block text-[10px]">Status Request</span>
              <span className="text-slate-900 font-semibold text-sm">
                {studentResponse?.status === 'SUBMITTED' ? (
                  <span className="text-blue-600 font-bold">Submitted</span>
                ) : studentResponse?.status === 'CONFERENCE_COMPLETED' ? (
                  <span className="text-emerald-600 font-bold">Completed</span>
                ) : studentResponse?.status === 'DRAFT' ? (
                  <span className="text-amber-600 font-bold">Draft</span>
                ) : (
                  <span className="text-slate-500">Not Started</span>
                )}
              </span>
            </div>
            <div>
              <span className="text-slate-400 font-bold uppercase tracking-wider block text-[10px]">Jumlah Goals</span>
              <span className="text-slate-900 font-semibold text-sm">{studentResponse?.goals?.length || 0} Goal(s)</span>
            </div>
            <div>
              <span className="text-slate-400 font-bold uppercase tracking-wider block text-[10px]">Waktu Request Dibuat</span>
              <span className="text-slate-900 font-semibold text-sm flex items-center gap-1 mt-0.5">
                <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                {studentResponse?.createdAt ? new Date(studentResponse.createdAt).toLocaleDateString('id-ID', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric'
                }) : '—'}
              </span>
            </div>
            {activeMentor && (
              <div className="col-span-2 border-t border-slate-200 pt-2.5 mt-1">
                <span className="text-slate-400 font-bold uppercase tracking-wider block text-[10px]">Mentor Saat Ini</span>
                <div className="flex items-center gap-2 mt-1">
                  <div className="h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-[10px] font-bold uppercase shrink-0">
                    {activeMentor.mentorPhotoURL ? (
                      <img src={activeMentor.mentorPhotoURL} alt={activeMentor.mentorName} className="h-6 w-6 rounded-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      activeMentor.mentorName?.charAt(0) || 'M'
                    )}
                  </div>
                  <span className="text-slate-900 font-bold text-xs">
                    {activeMentor.mentorName} <span className="font-normal text-slate-500">({activeMentor.mentorEmail})</span>
                  </span>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex gap-3 text-red-700 text-sm">
              <ShieldAlert className="h-5 w-5 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold">Terjadi Kesalahan</p>
                <p className="mt-0.5 text-xs text-red-600">{error}</p>
                <button 
                  type="button"
                  onClick={() => {
                    setError(null);
                    // Re-trigger load
                    const prevId = selectedMentorId;
                    setSelectedMentorId('');
                    setTimeout(() => setSelectedMentorId(prevId), 10);
                  }}
                  className="mt-2 text-xs font-bold text-red-700 underline hover:text-red-800"
                >
                  Muat Ulang
                </button>
              </div>
            </div>
          )}

          {/* Removal Confirmation Mode */}
          {showRemovalConfirm ? (
            <div className="space-y-4 bg-red-50/30 border border-red-100 rounded-xl p-5" id="removal-confirm-container">
              <div className="flex items-center gap-2 text-red-700">
                <ShieldAlert className="h-5 w-5" />
                <h4 className="font-bold text-sm uppercase tracking-wider">Konfirmasi Hapus Mentor</h4>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                Apakah Anda yakin ingin menghapus <strong className="text-slate-900">{activeMentor?.mentorName}</strong> sebagai mentor untuk <strong className="text-slate-900">{student.name}</strong>? Status siswa akan kembali menjadi <strong className="text-slate-900">Unassigned</strong>.
              </p>
              <div>
                <label htmlFor="removal-reason-input" className="block text-xs font-bold text-red-700 uppercase tracking-wider mb-1.5">
                  Alasan Penghapusan (Opsional)
                </label>
                <textarea
                  id="removal-reason-input"
                  rows={2}
                  value={removalReason}
                  onChange={(e) => setRemovalReason(e.target.value)}
                  placeholder="Tuliskan penjelasan singkat menghapus mentor..."
                  className="block w-full px-3 py-2 border border-red-200 rounded-lg text-sm placeholder-red-400/70 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 bg-white"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  id="cancel-removal-btn"
                  type="button"
                  onClick={() => setShowRemovalConfirm(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 transition"
                >
                  Batal
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
                      Menghapus...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-3.5 w-3.5" />
                      Hapus Penugasan
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* Regular Assignment Form */
            <div className="space-y-4">
              {/* Search Field */}
              <div className="space-y-1.5">
                <label htmlFor="mentor-search-input" className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Cari & Pilih Mentor
                </label>
                <input
                  ref={searchInputRef}
                  type="text"
                  id="mentor-search-input"
                  placeholder="Cari nama mentor..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="block w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* scrollable list of eligible mentors */}
              <div className="border border-slate-200 rounded-xl max-h-56 overflow-y-auto divide-y divide-slate-100 bg-white" id="mentor-list-container">
                {isLoadingMentors ? (
                  <div className="flex items-center justify-center py-10 text-xs text-slate-400 gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                    <span>Memuat daftar mentor...</span>
                  </div>
                ) : filteredMentors.length === 0 ? (
                  <div className="text-center py-10 text-xs text-slate-400">
                    Tidak ada mentor Junior High yang dapat dipilih.
                  </div>
                ) : (
                  filteredMentors.map((m) => {
                    const isSelected = selectedMentorId === m.uid;
                    return (
                      <button
                        key={m.uid}
                        type="button"
                        onClick={() => setSelectedMentorId(m.uid)}
                        className={`w-full text-left px-4 py-3 flex items-center justify-between transition ${
                          isSelected ? 'bg-blue-50/70 hover:bg-blue-50' : 'hover:bg-slate-50/50'
                        }`}
                        id={`mentor-option-${m.uid}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs uppercase shrink-0">
                            {m.photoURL ? (
                              <img src={m.photoURL} alt={m.displayName} className="h-8 w-8 rounded-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              (m.displayName || m.email || '?').charAt(0)
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className={`text-xs font-bold truncate ${isSelected ? 'text-blue-900' : 'text-slate-900'}`}>
                              {m.displayName || m.email}
                            </p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[9px] font-black tracking-wide text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded uppercase">
                                {m.role === 'SUPER_ADMIN' ? 'Super Admin' : m.role.replace('_', ' ')}
                              </span>
                              <span className="text-[9px] font-black tracking-wide text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded uppercase">
                                Junior High
                              </span>
                            </div>
                          </div>
                        </div>
                        {isSelected && (
                          <div className="h-2.5 w-2.5 rounded-full bg-blue-600 mr-1 shrink-0" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              {/* Assignment Note / Reason */}
              <div className="space-y-1.5">
                <label htmlFor="assignment-note-textarea" className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                  {activeMentor ? 'Alasan Ganti Mentor' : 'Catatan Penugasan (Opsional)'}
                </label>
                <textarea
                  id="assignment-note-textarea"
                  rows={3}
                  value={noteOrReason}
                  onChange={(e) => setNoteOrReason(e.target.value)}
                  placeholder={
                    activeMentor
                      ? 'Tuliskan alasan mengapa Anda mengubah penugasan mentor untuk siswa ini...'
                      : 'Tuliskan instruksi atau catatan khusus jika ada...'
                  }
                  className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Removal Option for Current Assignments */}
              {activeMentor && (
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between animate-fade-in" id="remove-assignment-box">
                  <div className="text-xs text-slate-500">
                    <span>Mentor saat ini: </span>
                    <strong className="text-slate-700">{activeMentor.mentorName}</strong>
                  </div>
                  <button
                    id="trigger-removal-btn"
                    type="button"
                    onClick={() => setShowRemovalConfirm(true)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100/70 border border-red-100 px-3 py-1.5 rounded-lg transition"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Hapus Mentor
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Read-only History Timeline */}
          {currentAssignment && !showRemovalConfirm && (
            <div className="pt-5 border-t border-slate-100">
              <MentorAssignmentHistory assignment={currentAssignment} />
            </div>
          )}
        </div>

        {/* Footer */}
        {!showRemovalConfirm && (
          <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-end gap-3 shrink-0">
            <button
              id="cancel-assignment-dialog-btn"
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 transition disabled:opacity-50"
            >
              Batal
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
                  Menyimpan...
                </>
              ) : (
                <>
                  {activeMentor ? <RefreshCw className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
                  {activeMentor ? 'Simpan Perubahan' : 'Tugaskan Mentor'}
                </>
              )}
            </button>
          </div>
        )}
      </section>
    </div>,
    document.body
  );
};
