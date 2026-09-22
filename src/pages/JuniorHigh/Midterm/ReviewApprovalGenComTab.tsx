import * as React from 'react';
import { 
  Check, X, Search, Eye, History, User, Calendar, 
  AlertCircle, CheckCircle2, Clock, MessageSquare, ShieldAlert 
} from 'lucide-react';
import { 
  approveMidtermGeneralComment, 
  requestRevisionMidtermGeneralComment 
} from '../../../services/juniorHighMidtermService';
import type { MidtermStudentDataDoc, MidtermGenComReviewStatus } from '../../../types/midtermReport';
import type { Student, Class, User as AppUser } from '../../../types';

interface ReviewApprovalGenComTabProps {
  currentUser: AppUser;
  selectedClass: Class | null;
  students: Student[];
  academicYear: string;
  semester: string;
  midtermTerm: string;
  studentDataMap: Record<string, MidtermStudentDataDoc>;
  onRefreshData: () => Promise<void>;
  loading: boolean;
}

export function ReviewApprovalGenComTab({
  currentUser,
  selectedClass,
  students,
  academicYear,
  semester,
  midtermTerm,
  studentDataMap,
  onRefreshData,
  loading
}: ReviewApprovalGenComTabProps) {
  // Local Filters
  const [statusFilter, setStatusFilter] = React.useState<string>('ALL');
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  
  // Selected Student for the review drawer
  const [selectedStudentId, setSelectedStudentId] = React.useState<string | null>(null);
  const [feedbackText, setFeedbackText] = React.useState<string>('');
  const [actionLoading, setActionLoading] = React.useState<boolean>(false);
  const [toast, setToast] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Helper roles
  const userRoleStr = currentUser.role || '';
  const isApprover = ['SUPER_ADMIN', 'PRINCIPAL', 'HEAD_UNIT', 'HEAD_JUNIOR'].includes(userRoleStr);

  // Filter students based on state & search query
  const filteredStudents = React.useMemo(() => {
    return students.filter(student => {
      const dataDoc = studentDataMap[student.id];
      const reviewStatus = dataDoc?.generalCommentReviewStatus || 'DRAFT';
      
      const matchesStatus = statusFilter === 'ALL' || reviewStatus === statusFilter;
      
      const searchLower = searchQuery.toLowerCase();
      const nameMatch = student.name?.toLowerCase().includes(searchLower);
      const nisnMatch = student.nisn?.toLowerCase().includes(searchLower);
      const matchesSearch = !searchQuery || nameMatch || nisnMatch;
      
      return matchesStatus && matchesSearch;
    });
  }, [students, studentDataMap, statusFilter, searchQuery]);

  // Summary Metrics per class
  const summary = React.useMemo(() => {
    let total = students.length;
    let draft = 0;
    let pending = 0;
    let revision = 0;
    let approved = 0;

    students.forEach(student => {
      const dataDoc = studentDataMap[student.id];
      const status = dataDoc?.generalCommentReviewStatus || 'DRAFT';
      if (status === 'DRAFT') draft++;
      else if (status === 'SUBMITTED_FOR_REVIEW') pending++;
      else if (status === 'REVISION_REQUESTED') revision++;
      else if (status === 'APPROVED') approved++;
    });

    return { total, draft, pending, revision, approved };
  }, [students, studentDataMap]);

  const activeStudentData = selectedStudentId ? studentDataMap[selectedStudentId] : null;
  const activeStudentObj = selectedStudentId ? students.find(s => s.id === selectedStudentId) : null;

  const handleApprove = async (studentId: string, studentName: string) => {
    const dataDoc = studentDataMap[studentId];
    if (!dataDoc) return;

    // Check self-approval
    if (dataDoc.updatedBy === currentUser.uid || selectedClass?.homeroomTeacherId === currentUser.uid) {
      showToast('Anda tidak dapat menyetujui General Comments yang Anda buat sendiri.', 'error');
      return;
    }

    const confirmApprove = window.confirm(`Apakah Anda yakin ingin menyetujui General Comments untuk siswa ${studentName}?`);
    if (!confirmApprove) return;

    setActionLoading(true);
    try {
      await approveMidtermGeneralComment(
        studentId,
        selectedClass?.id || '',
        academicYear,
        semester,
        midtermTerm,
        currentUser.uid,
        currentUser.displayName || (currentUser as any).name || 'Principal',
        currentUser.role || 'Principal',
        dataDoc.generalComment?.finalComment || ''
      );
      showToast(`General Comments ${studentName} berhasil disetujui.`, 'success');
      await onRefreshData();
      if (selectedStudentId === studentId) {
        setSelectedStudentId(null);
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal menyetujui komentar.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestRevision = async (studentId: string, studentName: string) => {
    const dataDoc = studentDataMap[studentId];
    if (!dataDoc) return;

    if (!feedbackText.trim()) {
      showToast('Feedback revisi wajib diisi.', 'error');
      return;
    }

    // Check self-revision
    if (dataDoc.updatedBy === currentUser.uid || selectedClass?.homeroomTeacherId === currentUser.uid) {
      showToast('Anda tidak dapat meminta revisi untuk General Comments yang Anda buat sendiri.', 'error');
      return;
    }

    const confirmRevision = window.confirm(`Apakah Anda yakin ingin meminta revisi untuk siswa ${studentName}?`);
    if (!confirmRevision) return;

    setActionLoading(true);
    try {
      await requestRevisionMidtermGeneralComment(
        studentId,
        selectedClass?.id || '',
        academicYear,
        semester,
        midtermTerm,
        currentUser.uid,
        currentUser.displayName || (currentUser as any).name || 'Principal',
        currentUser.role || 'Principal',
        feedbackText.trim(),
        dataDoc.generalComment?.finalComment || ''
      );
      showToast(`Revisi General Comments ${studentName} berhasil diajukan.`, 'success');
      setFeedbackText('');
      await onRefreshData();
      if (selectedStudentId === studentId) {
        setSelectedStudentId(null);
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal mengajukan revisi.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const getBadgeClass = (status: MidtermGenComReviewStatus) => {
    switch (status) {
      case 'DRAFT':
        return 'bg-slate-100 text-slate-600 border border-slate-200';
      case 'SUBMITTED_FOR_REVIEW':
        return 'bg-amber-50 text-amber-700 border border-amber-200 animate-pulse';
      case 'REVISION_REQUESTED':
        return 'bg-rose-50 text-rose-700 border border-rose-200';
      case 'APPROVED':
        return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
      default:
        return 'bg-slate-50 text-slate-500';
    }
  };

  const getStatusLabel = (status: MidtermGenComReviewStatus) => {
    switch (status) {
      case 'DRAFT': return 'DRAFT';
      case 'SUBMITTED_FOR_REVIEW': return 'MENUNGGU REVIEW';
      case 'REVISION_REQUESTED': return 'PERLU REVISI';
      case 'APPROVED': return 'DISETUJUI';
      default: return 'DRAFT';
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl shadow-lg border text-xs font-bold transition-all ${
          toast.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
            : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}>
          {toast.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
          {toast.message}
        </div>
      )}

      {/* Summary Matrix Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-1 shadow-xs">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Siswa</p>
          <p className="text-xl font-black text-slate-900">{summary.total}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-1 shadow-xs">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-slate-500">Draft</p>
          <p className="text-xl font-black text-slate-700">{summary.draft}</p>
        </div>
        <div className="bg-amber-50/50 rounded-2xl border border-amber-200 p-4 space-y-1 shadow-xs">
          <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Menunggu Review</p>
          <p className="text-xl font-black text-amber-700">{summary.pending}</p>
        </div>
        <div className="bg-rose-50/50 rounded-2xl border border-rose-200 p-4 space-y-1 shadow-xs">
          <p className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">Perlu Revisi</p>
          <p className="text-xl font-black text-rose-700">{summary.revision}</p>
        </div>
        <div className="bg-emerald-50/50 rounded-2xl border border-emerald-200 p-4 space-y-1 shadow-xs">
          <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Disetujui</p>
          <p className="text-xl font-black text-emerald-700">{summary.approved}</p>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row items-center gap-4 justify-between">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Status Filter */}
          <div className="flex flex-col min-w-[150px]">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Status Review</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs font-bold px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none"
            >
              <option value="ALL">Semua Status</option>
              <option value="DRAFT">Draft</option>
              <option value="SUBMITTED_FOR_REVIEW">Menunggu Review</option>
              <option value="REVISION_REQUESTED">Perlu Revisi</option>
              <option value="APPROVED">Disetujui</option>
            </select>
          </div>

          {/* Search Input */}
          <div className="flex flex-col w-full md:w-[220px]">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Cari Nama / NISN</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Cari siswa..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="text-xs font-semibold px-3 py-2 pl-8 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none w-full"
              />
              <Search size={14} className="absolute left-2.5 top-3 text-slate-400" />
            </div>
          </div>
        </div>

        {/* Info label */}
        <div className="text-right text-slate-500 text-xs font-semibold">
          Homeroom Teacher: <span className="font-bold text-slate-800">{selectedClass?.homeroomTeacherName || 'Belum ditugaskan'}</span>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-4 px-5 w-12">No.</th>
                <th className="py-4 px-4 w-44">Nama Siswa</th>
                <th className="py-4 px-4 w-28">NISN</th>
                <th className="py-4 px-4 w-28">Kelas</th>
                <th className="py-4 px-4 w-40">Homeroom Teacher</th>
                <th className="py-4 px-4">Preview General Comment</th>
                <th className="py-4 px-4 w-36 text-center">Status</th>
                <th className="py-4 px-4 w-32">Diajukan Pada</th>
                <th className="py-4 px-4 w-36">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 font-bold">
                    Tidak ada siswa yang cocok dengan filter.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student, idx) => {
                  const docData = studentDataMap[student.id];
                  const reviewStatus = docData?.generalCommentReviewStatus || 'DRAFT';
                  const commentText = docData?.generalComment?.finalComment || '';
                  const previewText = commentText.length > 80 ? `${commentText.substring(0, 80)}...` : (commentText || '-');
                  
                  return (
                    <tr key={student.id} className="hover:bg-slate-50 transition-all">
                      <td className="py-4 px-5 font-bold text-slate-400">{idx + 1}</td>
                      <td className="py-4 px-4 font-bold text-slate-900">{student.name}</td>
                      <td className="py-4 px-4 font-semibold text-slate-500">{student.nisn || '-'}</td>
                      <td className="py-4 px-4 font-bold text-slate-600">{selectedClass?.name || '-'}</td>
                      <td className="py-4 px-4 text-slate-500">{selectedClass?.homeroomTeacherName || '-'}</td>
                      <td className="py-4 px-4 italic text-slate-500 pr-6">{previewText}</td>
                      <td className="py-4 px-4 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${getBadgeClass(reviewStatus)}`}>
                          {getStatusLabel(reviewStatus)}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-slate-400 font-semibold">
                        {docData?.submittedForReviewAt ? new Date(docData.submittedForReviewAt).toLocaleDateString('id-ID', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric'
                        }) : '-'}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedStudentId(student.id);
                              setFeedbackText('');
                            }}
                            className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg transition-all"
                            title="Buka & Review"
                          >
                            <Eye size={15} />
                          </button>

                          {isApprover && reviewStatus === 'SUBMITTED_FOR_REVIEW' && (
                            <>
                              <button
                                onClick={() => handleApprove(student.id, student.name || 'Siswa')}
                                disabled={actionLoading}
                                className="p-1.5 hover:bg-emerald-50 text-emerald-600 rounded-lg transition-all"
                                title="Setujui"
                              >
                                <Check size={15} />
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedStudentId(student.id);
                                  setFeedbackText('');
                                  setTimeout(() => {
                                    const el = document.getElementById('feedback-textarea');
                                    el?.focus();
                                  }, 100);
                                }}
                                disabled={actionLoading}
                                className="p-1.5 hover:bg-rose-50 text-rose-600 rounded-lg transition-all"
                                title="Minta Revisi"
                              >
                                <X size={15} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review Modal / Drawer */}
      {selectedStudentId && activeStudentObj && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/40 backdrop-blur-xs transition-all animate-fade-in">
          <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col transition-transform animate-slide-in p-6 overflow-y-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Review General Comment</h3>
                <p className="text-xs text-slate-500 font-semibold mt-0.5">
                  Siswa: {activeStudentObj.name} ({activeStudentObj.nisn || 'No NISN'})
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedStudentId(null);
                  setFeedbackText('');
                }}
                className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Profile Info Cards */}
            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Kelas</p>
                <p className="font-bold text-slate-800 mt-0.5">{selectedClass?.name}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Homeroom Teacher</p>
                <p className="font-bold text-slate-800 mt-0.5">{selectedClass?.homeroomTeacherName || '-'}</p>
              </div>
            </div>

            {/* Selected Categories details */}
            <div className="space-y-3">
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">Kategori Terpilih</h4>
              
              <div className="space-y-2">
                <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Strength / Developmental Progress</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {activeStudentData?.generalComment?.strengths && activeStudentData.generalComment.strengths.length > 0 ? (
                      activeStudentData.generalComment.strengths.map((s, idx) => (
                        <span key={idx} className="bg-emerald-50 text-emerald-800 text-[10px] font-bold px-2.5 py-1 rounded-full border border-emerald-100">
                          {s}
                        </span>
                      ))
                    ) : <span className="text-xs text-slate-400 italic">Tidak ada</span>}
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Achievement</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {activeStudentData?.generalComment?.achievements && activeStudentData.generalComment.achievements.length > 0 ? (
                      activeStudentData.generalComment.achievements.map((s, idx) => (
                        <span key={idx} className="bg-blue-50 text-blue-800 text-[10px] font-bold px-2.5 py-1 rounded-full border border-blue-100">
                          {s}
                        </span>
                      ))
                    ) : <span className="text-xs text-slate-400 italic">Tidak ada</span>}
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Needs Improvement</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {activeStudentData?.generalComment?.needsImprovement && activeStudentData.generalComment.needsImprovement.length > 0 ? (
                      activeStudentData.generalComment.needsImprovement.map((s, idx) => (
                        <span key={idx} className="bg-amber-50 text-amber-800 text-[10px] font-bold px-2.5 py-1 rounded-full border border-amber-100">
                          {s}
                        </span>
                      ))
                    ) : <span className="text-xs text-slate-400 italic">Tidak ada</span>}
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Catatan Tambahan Guru</p>
                  <p className="text-xs text-slate-700 mt-1">
                    {activeStudentData?.commentBuilder?.manualNotes || activeStudentData?.generalComment?.manualNotes || <span className="text-xs text-slate-400 italic">Tidak ada</span>}
                  </p>
                </div>
              </div>
            </div>

            {/* General Comment Text Container */}
            <div className="space-y-2">
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">Narasi Komentar Lengkap</h4>
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs font-semibold leading-relaxed text-slate-800 whitespace-pre-wrap italic">
                {activeStudentData?.generalComment?.finalComment || 'Komentar kosong / belum diisi.'}
              </div>
            </div>

            {/* Audit History Logs */}
            {activeStudentData?.reviewHistory && activeStudentData.reviewHistory.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <History size={14} className="text-slate-400" />
                  Riwayat Submit & Review
                </h4>
                <div className="relative border-l border-slate-200 pl-4 space-y-4">
                  {activeStudentData.reviewHistory.map((h, hIdx) => {
                    const actColor = h.action === 'APPROVED' ? 'text-emerald-600' : h.action === 'REVISION_REQUESTED' ? 'text-rose-600' : 'text-slate-600';
                    return (
                      <div key={hIdx} className="relative space-y-1">
                        <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-slate-200 border-2 border-white ring-4 ring-slate-100" />
                        <div className="flex items-center justify-between">
                          <p className={`text-xs font-bold uppercase tracking-tight ${actColor}`}>{h.action.replace(/_/g, ' ')}</p>
                          <span className="text-[10px] text-slate-400 font-bold">{new Date(h.timestamp).toLocaleString('id-ID')}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 font-semibold">
                          Aktor: {h.actorName} ({h.actorRole})
                        </p>
                        {h.feedback && (
                          <div className="bg-rose-50 border border-rose-100 rounded-xl p-2.5 text-[11px] text-rose-700 font-medium">
                            Feedback: {h.feedback}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Action Panel for Approver */}
            {isApprover && activeStudentData?.generalCommentReviewStatus === 'SUBMITTED_FOR_REVIEW' && (
              <div className="border-t border-slate-100 pt-5 space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="feedback-textarea" className="text-xs font-black text-slate-900 uppercase tracking-wider">
                    Feedback / Catatan Revisi <span className="text-rose-500 font-bold">*</span>
                  </label>
                  <textarea
                    id="feedback-textarea"
                    placeholder="Wajib diisi jika Anda menolak/meminta revisi..."
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    className="w-full h-24 text-xs font-medium px-3.5 py-2.5 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  />
                </div>

                {/* Self-approval prevention warning */}
                {(activeStudentData.updatedBy === currentUser.uid || selectedClass?.homeroomTeacherId === currentUser.uid) ? (
                  <div className="bg-amber-50 border border-amber-200 p-3 rounded-2xl flex items-center gap-2 text-[11px] font-bold text-amber-800">
                    <ShieldAlert size={16} />
                    Anda tidak dapat menyetujui atau meminta revisi karena General Comments ini dibuat oleh Anda sendiri.
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleApprove(activeStudentObj.id, activeStudentObj.name || 'Siswa')}
                      disabled={actionLoading}
                      className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl transition-all cursor-pointer text-xs uppercase tracking-wider"
                    >
                      Setujui Komentar
                    </button>
                    <button
                      onClick={() => handleRequestRevision(activeStudentObj.id, activeStudentObj.name || 'Siswa')}
                      disabled={actionLoading || !feedbackText.trim()}
                      className={`flex-1 py-3 font-bold rounded-2xl transition-all cursor-pointer text-xs uppercase tracking-wider ${
                        feedbackText.trim()
                          ? 'bg-rose-600 hover:bg-rose-700 text-white'
                          : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      Minta Revisi
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
