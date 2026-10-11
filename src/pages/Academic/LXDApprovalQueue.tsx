import * as React from 'react';
import { 
  collection, 
  query, 
  where, 
  getDocs 
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { LXD, LearningGoal, LGReviewStatus } from '../../types';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { 
  FileText, 
  ChevronRight, 
  User, 
  BookOpen, 
  Clock, 
  ArrowRight,
  Target,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Sparkles,
  Layers,
  Send,
  X
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { 
  getPendingProposedLGs, 
  approveProposedLG, 
  requestRevisionProposedLG 
} from '../../services/juniorHighAssessmentBookService';
import { toast } from 'sonner';

export default function LXDApprovalQueue() {
  const { currentUser } = useOutletContext<{ currentUser: any }>();
  const navigate = useNavigate();
  
  // Tab state
  const [activeMainTab, setActiveMainTab] = React.useState<'LXD' | 'LEARNING_GOALS'>('LXD');
  
  // LXD state
  const [lxds, setLxds] = React.useState<LXD[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filterType, setFilterType] = React.useState<string>('ALL');

  // Learning Goals state
  const [pendingLGs, setPendingLGs] = React.useState<LearningGoal[]>([]);
  const [loadingLGs, setLoadingLGs] = React.useState(false);
  const [lgSearch, setLgSearch] = React.useState('');
  const [selectedGrade, setSelectedGrade] = React.useState<string>('ALL');
  
  // Revision modal state
  const [revisionModal, setRevisionModal] = React.useState<{
    isOpen: boolean;
    goal: LearningGoal | null;
    reviewStatus: 'REVISI_MINOR' | 'REVISI_MAYOR';
    notes: string;
    submitting: boolean;
  }>({
    isOpen: false,
    goal: null,
    reviewStatus: 'REVISI_MINOR',
    notes: '',
    submitting: false
  });

  // Action loading state
  const [processingLGId, setProcessingLGId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!currentUser) return;

    if (currentUser.role && currentUser.role !== 'SUPER_ADMIN' && currentUser.role !== 'HEAD_UNIT' && currentUser.role !== 'HEAD_JUNIOR') {
      navigate('/academic/lxd');
      return;
    }

    if (currentUser.role) {
      fetchPendingLXDs();
      fetchPendingLearningGoals();
    }
  }, [currentUser]);

  const fetchPendingLXDs = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'lxd'),
        where('status', '==', 'PENDING_APPROVAL')
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LXD));
      
      const sortedData = [...data].sort((a, b) => {
        const timeA = a.approval?.submittedAt || 0;
        const timeB = b.approval?.submittedAt || 0;
        return timeB - timeA;
      });
      
      setLxds(sortedData);
    } catch (error) {
      console.error("Error fetching approval queue:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingLearningGoals = async () => {
    setLoadingLGs(true);
    try {
      const goals = await getPendingProposedLGs();
      // Sort newest first
      goals.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setPendingLGs(goals);
    } catch (error) {
      console.error("Error fetching pending LGs:", error);
    } finally {
      setLoadingLGs(false);
    }
  };

  const handleApproveLG = async (goal: LearningGoal) => {
    if (!window.confirm(`Setujui dan publikasikan "${goal.code}: ${goal.goalText}" ke Bank Learning Goals?`)) {
      return;
    }
    setProcessingLGId(goal.id);
    try {
      await approveProposedLG(goal.id);
      toast.success(`Learning Goal ${goal.code} berhasil disetujui dan dipublikasikan!`);
      await fetchPendingLearningGoals();
    } catch (err: any) {
      console.error("Gagal menyetujui LG:", err);
      toast.error(`Gagal menyetujui: ${err.message || 'Terjadi kesalahan'}`);
    } finally {
      setProcessingLGId(null);
    }
  };

  const handleOpenRevisionModal = (goal: LearningGoal) => {
    setRevisionModal({
      isOpen: true,
      goal,
      reviewStatus: 'REVISI_MINOR',
      notes: goal.notes || '',
      submitting: false
    });
  };

  const handleSubmitRevision = async () => {
    if (!revisionModal.goal) return;
    setRevisionModal(prev => ({ ...prev, submitting: true }));
    try {
      await requestRevisionProposedLG(
        revisionModal.goal.id,
        revisionModal.reviewStatus,
        revisionModal.notes
      );
      toast.success(`Catatan revisi untuk ${revisionModal.goal.code} berhasil dikirim ke guru pengusul.`);
      setRevisionModal({
        isOpen: false,
        goal: null,
        reviewStatus: 'REVISI_MINOR',
        notes: '',
        submitting: false
      });
      await fetchPendingLearningGoals();
    } catch (err: any) {
      console.error("Gagal meminta revisi:", err);
      toast.error(`Gagal menyimpan: ${err.message || 'Terjadi kesalahan'}`);
      setRevisionModal(prev => ({ ...prev, submitting: false }));
    }
  };

  const filteredLxds = filterType === 'ALL' 
    ? lxds 
    : lxds.filter(l => l.type === filterType);

  const filteredLGs = pendingLGs.filter(g => {
    const matchGrade = selectedGrade === 'ALL' || g.grade === selectedGrade;
    const matchQuery = !lgSearch.trim() || 
      g.code.toLowerCase().includes(lgSearch.toLowerCase()) ||
      g.goalText.toLowerCase().includes(lgSearch.toLowerCase()) ||
      g.subject.toLowerCase().includes(lgSearch.toLowerCase()) ||
      g.strand.toLowerCase().includes(lgSearch.toLowerCase());
    return matchGrade && matchQuery;
  });

  if (loading && loadingLGs) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-gray-500 font-bold animate-pulse uppercase tracking-widest text-xs">Memuat Antrean Approval...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm relative overflow-hidden group">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-blue-50 rounded-full opacity-50 group-hover:scale-110 transition-transform duration-500" />
        <div className="relative">
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Antrean Approval Akademik</h1>
          <p className="text-gray-500 font-medium mt-1">Review dan persetujuan dokumen LXD dan usulan Learning Goals guru.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-5 py-3 bg-blue-50 rounded-2xl border border-blue-100 flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
            <span className="text-sm font-black text-blue-700 tracking-tight">
              {lxds.length + pendingLGs.length} Total Menunggu
            </span>
          </div>
        </div>
      </div>

      {/* Main Tabs (LXD vs Learning Goals) */}
      <div className="flex items-center gap-3 border-b border-gray-200 pb-3">
        <button
          onClick={() => setActiveMainTab('LXD')}
          className={cn(
            "flex items-center gap-2.5 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all",
            activeMainTab === 'LXD'
              ? "bg-blue-600 text-white shadow-md shadow-blue-200"
              : "bg-white text-gray-600 hover:text-gray-900 hover:bg-gray-50 border border-gray-200"
          )}
        >
          <BookOpen size={16} />
          <span>Dokumen LXD</span>
          {lxds.length > 0 && (
            <span className={cn(
              "px-2 py-0.5 rounded-full text-[10px] font-black",
              activeMainTab === 'LXD' ? "bg-white/20 text-white" : "bg-blue-100 text-blue-700"
            )}>
              {lxds.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveMainTab('LEARNING_GOALS')}
          className={cn(
            "flex items-center gap-2.5 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all",
            activeMainTab === 'LEARNING_GOALS'
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-200"
              : "bg-white text-gray-600 hover:text-gray-900 hover:bg-gray-50 border border-gray-200"
          )}
        >
          <Target size={16} />
          <span>Learning Goals (Assessment Book)</span>
          {pendingLGs.length > 0 && (
            <span className={cn(
              "px-2 py-0.5 rounded-full text-[10px] font-black",
              activeMainTab === 'LEARNING_GOALS' ? "bg-white/20 text-white" : "bg-indigo-100 text-indigo-700"
            )}>
              {pendingLGs.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab Content: LXD */}
      {activeMainTab === 'LXD' && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            {(['ALL', 'WEEKLY_LESSONS', 'UNIT_AKTIVITAS', 'LEARNING_JOURNEY'] as const).map(type => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={cn(
                  "px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                  filterType === type
                    ? "bg-gray-900 text-white shadow-lg"
                    : "bg-white text-gray-400 hover:text-gray-900 hover:bg-gray-50 border border-transparent"
                )}
              >
                {type.replace('_', ' ')}
              </button>
            ))}
          </div>

          {/* Table/List Section */}
          <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
            {filteredLxds.length === 0 ? (
              <div className="p-20 text-center space-y-6">
                <div className="w-24 h-24 bg-gray-50 rounded-[2rem] flex items-center justify-center mx-auto text-gray-200">
                  <FileText size={48} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-gray-900 tracking-tight">Tidak Ada Antrean LXD</h3>
                  <p className="text-gray-500 font-medium max-w-sm mx-auto mt-2">
                    Selamat! Semua dokumen LXD telah ditinjau. Tidak ada dokumen yang menunggu approval saat ini.
                  </p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {filteredLxds.map((lxd) => (
                  <div 
                    key={lxd.id}
                    className="group p-6 hover:bg-gray-50/80 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
                  >
                    <div className="flex items-start gap-5 flex-1 min-w-0">
                      <div className={cn(
                        "w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm shrink-0 border-2 border-white ring-1 ring-gray-100",
                        lxd.type === 'WEEKLY_LESSONS' ? "bg-indigo-50 text-indigo-600" :
                        lxd.type === 'UNIT_AKTIVITAS' ? "bg-blue-50 text-blue-600" :
                        "bg-amber-50 text-amber-600"
                      )}>
                        <BookOpen size={24} />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn(
                            "text-[10px] font-black uppercase tracking-[0.15em] px-2 py-0.5 rounded-lg border",
                            lxd.type === 'WEEKLY_LESSONS' ? "bg-indigo-50 text-indigo-700 border-indigo-100" :
                            lxd.type === 'UNIT_AKTIVITAS' ? "bg-blue-50 text-blue-700 border-blue-100" :
                            "bg-amber-50 text-amber-700 border-amber-100"
                          )}>
                            {lxd.type.replace('_', ' ')}
                          </span>
                        </div>
                        <h3 className="text-lg font-black text-gray-900 tracking-tight truncate group-hover:text-blue-600 transition-colors">
                          {lxd.title}
                        </h3>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-bold text-gray-400">
                          <div className="flex items-center gap-1.5">
                            <User size={14} className="text-gray-300" />
                            <span>{lxd.subject}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <ChevronRight size={14} className="text-gray-200" />
                            <span>Kelas {lxd.grade}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Clock size={14} className="text-gray-300" />
                            <span>Disubmit: {lxd.approval?.submittedAt ? format(lxd.approval.submittedAt, 'dd MMM yyyy, HH:mm', { locale: id }) : '-'}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="md:text-right space-y-3 w-full md:w-auto">
                      <div className="flex items-center gap-2 md:justify-end">
                        <span className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-black ring-2 ring-white shadow-sm overflow-hidden border border-blue-200">
                          {lxd.approval?.submittedByName?.[0] || '?'}
                        </span>
                        <span className="text-xs font-bold text-gray-600">Disubmit oleh {lxd.approval?.submittedByName}</span>
                      </div>
                      <button 
                        onClick={() => navigate(`/academic/lxd/${lxd.id}`)}
                        className="w-full md:w-auto px-6 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all flex items-center justify-center gap-2"
                      >
                        Review Document
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab Content: Learning Goals */}
      {activeMainTab === 'LEARNING_GOALS' && (
        <div className="space-y-6">
          {/* Controls & Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Tingkat:</span>
              {(['ALL', '7', '8', '9'] as const).map(gr => (
                <button
                  key={gr}
                  onClick={() => setSelectedGrade(gr)}
                  className={cn(
                    "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all",
                    selectedGrade === gr
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
                  )}
                >
                  {gr === 'ALL' ? 'Semua Tingkat' : `Kelas ${gr}`}
                </button>
              ))}
            </div>

            <div className="w-full sm:w-72">
              <input
                type="text"
                placeholder="Cari kode, mapel, strand, atau teks LG..."
                value={lgSearch}
                onChange={e => setLgSearch(e.target.value)}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
              />
            </div>
          </div>

          {/* List of Pending LGs */}
          <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
            {filteredLGs.length === 0 ? (
              <div className="p-20 text-center space-y-6">
                <div className="w-24 h-24 bg-indigo-50 rounded-[2rem] flex items-center justify-center mx-auto text-indigo-300">
                  <Target size={48} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-gray-900 tracking-tight">Tidak Ada Usulan Learning Goal</h3>
                  <p className="text-gray-500 font-medium max-w-sm mx-auto mt-2">
                    Semua usulan LG dari Assessment Book telah ditinjau atau belum ada usulan baru berstatus DRAFT.
                  </p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredLGs.map((lg) => {
                  const isProcessing = processingLGId === lg.id;
                  return (
                    <div 
                      key={lg.id}
                      className="p-6 sm:p-7 hover:bg-slate-50/70 transition-all flex flex-col lg:flex-row items-start justify-between gap-6"
                    >
                      {/* Left: Detail LG */}
                      <div className="flex-1 min-w-0 space-y-3">
                        {/* Badges */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2.5 py-1 bg-indigo-100 text-indigo-800 rounded-lg text-xs font-black">
                            {lg.code}
                          </span>
                          <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold">
                            Kelas {lg.grade}
                          </span>
                          <span className="px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-xs font-bold">
                            {lg.subject}
                          </span>
                          {lg.strand && (
                            <span className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-xs font-medium">
                              Strand: {lg.strand}
                            </span>
                          )}
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md text-[11px] font-semibold">
                            v{lg.version || 1}
                          </span>
                          {lg.parentGoalId && (
                            <span className="px-2 py-0.5 bg-teal-50 text-teal-700 border border-teal-200 rounded-md text-[11px] font-semibold flex items-center gap-1">
                              <Sparkles size={11} />
                              Versi Pembaruan
                            </span>
                          )}
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-md text-[10px] font-bold">
                            DRAFT - MENUNGGU PERSETUJUAN
                          </span>
                        </div>

                        {/* Text LG */}
                        <div>
                          <p className="text-base sm:text-lg font-bold text-gray-900 leading-snug">
                            {lg.goalText}
                          </p>
                        </div>

                        {/* Notes if revision requested previously */}
                        {lg.notes && (
                          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
                            <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                            <div>
                              <span className="font-bold">Catatan Sebelumnya:</span> {lg.notes}
                            </div>
                          </div>
                        )}

                        {/* Metadata */}
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-gray-500 font-medium pt-1">
                          <div className="flex items-center gap-1.5">
                            <User size={13} className="text-gray-400" />
                            <span>Diusulkan oleh: <strong className="text-gray-700">{lg.createdBy || 'Guru'}</strong></span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Clock size={13} className="text-gray-400" />
                            <span>
                              {lg.createdAt ? format(lg.createdAt, 'dd MMMM yyyy, HH:mm', { locale: id }) : '-'}
                            </span>
                          </div>
                          <div>
                            <span>Tahun Ajaran: <strong>{lg.academicYear}</strong></span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex flex-row lg:flex-col items-center lg:items-end gap-2.5 shrink-0 w-full lg:w-auto pt-2 lg:pt-0 border-t lg:border-t-0 border-gray-100">
                        <button
                          onClick={() => handleApproveLG(lg)}
                          disabled={isProcessing}
                          className="flex-1 lg:flex-initial px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                        >
                          <CheckCircle2 size={16} />
                          <span>Setujui & Publikasikan</span>
                        </button>

                        <button
                          onClick={() => handleOpenRevisionModal(lg)}
                          disabled={isProcessing}
                          className="flex-1 lg:flex-initial px-5 py-2.5 bg-white hover:bg-amber-50 text-amber-700 border border-amber-300 disabled:opacity-50 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <AlertCircle size={16} />
                          <span>Minta Revisi</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Revision Modal */}
      {revisionModal.isOpen && revisionModal.goal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-gray-100 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <AlertCircle className="text-amber-600" size={20} />
                <h3 className="text-base font-black text-gray-900">
                  Minta Revisi Usulan Learning Goal
                </h3>
              </div>
              <button
                onClick={() => setRevisionModal(prev => ({ ...prev, isOpen: false }))}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-700 space-y-1">
                <div className="font-bold text-gray-900">{revisionModal.goal.code} - {revisionModal.goal.subject} (Kelas {revisionModal.goal.grade})</div>
                <div className="text-gray-600 italic">"{revisionModal.goal.goalText}"</div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Tingkat Revisi:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRevisionModal(prev => ({ ...prev, reviewStatus: 'REVISI_MINOR' }))}
                    className={cn(
                      "py-2 px-3 rounded-xl text-xs font-bold border transition-all text-center",
                      revisionModal.reviewStatus === 'REVISI_MINOR'
                        ? "bg-amber-100 border-amber-300 text-amber-900 shadow-xs"
                        : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                    )}
                  >
                    Revisi Minor (Kecil)
                  </button>
                  <button
                    type="button"
                    onClick={() => setRevisionModal(prev => ({ ...prev, reviewStatus: 'REVISI_MAYOR' }))}
                    className={cn(
                      "py-2 px-3 rounded-xl text-xs font-bold border transition-all text-center",
                      revisionModal.reviewStatus === 'REVISI_MAYOR'
                        ? "bg-rose-100 border-rose-300 text-rose-900 shadow-xs"
                        : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                    )}
                  >
                    Revisi Mayor (Besar)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Catatan Masukan / Alasan Revisi untuk Guru:
                </label>
                <textarea
                  rows={4}
                  value={revisionModal.notes}
                  onChange={e => setRevisionModal(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Tuliskan catatan perbaikan kalimat, kata kerja operasional (KKO), atau kesesuaian strand..."
                  className="w-full p-3 bg-white border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 p-6 border-t border-gray-100 bg-gray-50/50">
              <button
                type="button"
                onClick={() => setRevisionModal(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSubmitRevision}
                disabled={revisionModal.submitting}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black shadow-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <Send size={14} />
                <span>{revisionModal.submitting ? 'Menyimpan...' : 'Kirim Catatan Revisi'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
