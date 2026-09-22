import * as React from 'react';
import { 
  CheckCircle2, AlertCircle, RefreshCw, MessageSquare, 
  User, Check, X, Clock, Send, ShieldCheck
} from 'lucide-react';
import { 
  updateElementaryGenComReviewStatus 
} from '../../../services/elementaryMidtermService';
import type { 
  ElementaryMidtermStudentDataDoc,
  ElementaryMidtermGenComReviewStatus
} from '../../../types/elementaryMidtermReport';
import type { Student, Class, User as UserType } from '../../../types';

interface ElementaryReviewApprovalGenComTabProps {
  selectedClassId: string;
  selectedClass: Class | null;
  selectedYear: string;
  selectedSemester: string;
  selectedTerm: string;
  students: Student[];
  studentDataMap: Record<string, ElementaryMidtermStudentDataDoc>;
  onRefreshData: () => Promise<void>;
  currentUser: UserType | null;
}

export const ElementaryReviewApprovalGenComTab: React.FC<ElementaryReviewApprovalGenComTabProps> = ({
  selectedClassId,
  selectedClass,
  selectedYear,
  selectedSemester,
  selectedTerm,
  students,
  studentDataMap,
  onRefreshData,
  currentUser
}) => {
  const [selectedStudentId, setSelectedStudentId] = React.useState<string>(students[0]?.id || '');
  const [revisionFeedback, setRevisionFeedback] = React.useState<string>('');
  const [isProcessing, setIsProcessing] = React.useState<boolean>(false);

  const activeStudent = students.find(s => s.id === selectedStudentId) || students[0] || null;
  const currentStudentData = activeStudent ? studentDataMap[activeStudent.id] : null;

  const currentStatus: ElementaryMidtermGenComReviewStatus = 
    currentStudentData?.generalCommentReviewStatus || 'DRAFT';

  const commentText = 
    currentStudentData?.generalComment?.finalComment || 
    currentStudentData?.generalComment?.aiDraft || 
    '';

  const handleAction = async (action: 'SUBMIT_REVIEW' | 'APPROVE' | 'REQUEST_REVISION' | 'RESET_DRAFT') => {
    if (!activeStudent || !currentUser) return;
    setIsProcessing(true);

    try {
      await updateElementaryGenComReviewStatus(
        activeStudent.id,
        selectedClassId,
        selectedYear,
        selectedSemester,
        selectedTerm,
        action,
        currentUser,
        revisionFeedback,
        commentText
      );

      setRevisionFeedback('');
      await onRefreshData();
    } catch (e) {
      console.error("Error updating review status:", e);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Student List */}
      <div className="lg:col-span-4 bg-white p-4 rounded-3xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between px-2 pb-2 border-b border-slate-100">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <ShieldCheck size={16} className="text-emerald-600" />
            <span>Status Approval GenCom</span>
          </h3>
        </div>

        <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
          {students.map((st, idx) => {
            const isSelected = st.id === selectedStudentId;
            const stData = studentDataMap[st.id];
            const status: ElementaryMidtermGenComReviewStatus = stData?.generalCommentReviewStatus || 'DRAFT';

            return (
              <button
                key={st.id}
                onClick={() => setSelectedStudentId(st.id)}
                className={`w-full p-3 rounded-2xl text-left transition-all flex items-center justify-between cursor-pointer ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-xl font-extrabold flex items-center justify-center text-[10px] ${
                    isSelected ? 'bg-emerald-500 text-slate-950' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {idx + 1}
                  </span>
                  <div>
                    <p className={`text-xs font-bold leading-tight ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                      {st.name}
                    </p>
                    <span className={`text-[10px] font-bold ${
                      status === 'APPROVED' ? 'text-emerald-400' :
                      status === 'SUBMITTED_FOR_REVIEW' ? 'text-amber-400' :
                      status === 'REVISION_REQUESTED' ? 'text-red-400' : 'text-slate-400'
                    }`}>
                      {status === 'APPROVED' ? '✓ Approved' :
                       status === 'SUBMITTED_FOR_REVIEW' ? '• Menunggu Review' :
                       status === 'REVISION_REQUESTED' ? '✕ Perlu Revisi' : 'Draft'}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Review Box */}
      <div className="lg:col-span-8 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-6">
        {activeStudent ? (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                  <ShieldCheck size={18} className="text-emerald-600" />
                  <span>Review GenCom: {activeStudent.name}</span>
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  Kelas {selectedClass?.name || ''} — Status: <strong className="text-slate-800">{currentStatus}</strong>
                </p>
              </div>

              <div className="flex items-center gap-2">
                {currentStatus === 'APPROVED' ? (
                  <span className="px-3 py-1.5 bg-emerald-100 text-emerald-800 font-extrabold text-xs rounded-xl flex items-center gap-1.5">
                    <CheckCircle2 size={14} /> Approved
                  </span>
                ) : (
                  <span className="px-3 py-1.5 bg-amber-100 text-amber-800 font-extrabold text-xs rounded-xl flex items-center gap-1.5">
                    <Clock size={14} /> {currentStatus}
                  </span>
                )}
              </div>
            </div>

            {/* Display General Comment */}
            <div className="space-y-2">
              <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                Isi General Comments Siswa:
              </label>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs leading-relaxed font-medium text-slate-800 min-h-[140px] whitespace-pre-wrap">
                {commentText || <span className="text-slate-400 italic">Belum ada komentar tertulis.</span>}
              </div>
            </div>

            {/* Revision Feedback Box if needed */}
            {currentStatus === 'REVISION_REQUESTED' && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs space-y-1">
                <span className="font-extrabold text-red-700 uppercase tracking-wider block">Catatan Revisi Sebelumnya:</span>
                <p className="text-red-900 font-medium">{currentStudentData?.revisionFeedback || '-'}</p>
              </div>
            )}

            {/* Reviewer Action Buttons */}
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  Catatan Feedback (Optional untuk Revisi):
                </label>
                <input
                  type="text"
                  value={revisionFeedback}
                  onChange={(e) => setRevisionFeedback(e.target.value)}
                  placeholder="Berikan saran atau bagian yang perlu disesuaikan..."
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3">
                <button
                  onClick={() => handleAction('SUBMIT_REVIEW')}
                  disabled={isProcessing}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all"
                >
                  <Send size={14} />
                  <span>Submit Review</span>
                </button>

                <button
                  onClick={() => handleAction('REQUEST_REVISION')}
                  disabled={isProcessing}
                  className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all"
                >
                  <X size={14} />
                  <span>Minta Revisi</span>
                </button>

                <button
                  onClick={() => handleAction('APPROVE')}
                  disabled={isProcessing}
                  className="px-6 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white font-extrabold rounded-xl text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all shadow-sm"
                >
                  {isProcessing ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                  <span>Approve Comment</span>
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="p-12 text-center text-slate-400 font-medium text-xs">
            Pilih siswa pada daftar di samping untuk melakukan review dan approval.
          </div>
        )}
      </div>
    </div>
  );
};
