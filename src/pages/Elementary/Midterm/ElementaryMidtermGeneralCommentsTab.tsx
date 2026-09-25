import * as React from 'react';
import { 
  Sparkles, Save, CheckCircle2, AlertCircle, Wand2, 
  Plus, X, Lock, RefreshCw, Check, Clock, MessageSquare, ShieldCheck, User as UserIcon
} from 'lucide-react';
import { toast } from 'sonner';
import { 
  ELEM_STRENGTH_PROGRESS_BANK, 
  ELEM_ACHIEVEMENT_BANK, 
  ELEM_NEEDS_IMPROVEMENT_BANK,
  isHomeroomTeacherOfClass,
  saveElementaryMidtermGeneralComment,
  generateElementaryMidtermGeneralCommentAI,
  refineElementaryMidtermGeneralCommentAI,
  getElementaryMidtermClassCommentsConfig,
  saveElementaryMidtermClassCommentsConfig,
  submitElementaryMidtermGeneralCommentForReview
} from '../../../services/elementaryMidtermService';
import type { 
  ElementaryMidtermStudentDataDoc, 
  ElementaryMidtermGeneralCommentData,
  ElementaryMidtermGenComReviewStatus
} from '../../../types/elementaryMidtermReport';
import type { Student, Class, User } from '../../../types';

interface ElementaryMidtermGeneralCommentsTabProps {
  selectedClassId: string;
  selectedClass: Class | null;
  selectedYear: string;
  selectedSemester: string;
  selectedTerm: string;
  students: Student[];
  studentDataMap: Record<string, ElementaryMidtermStudentDataDoc>;
  onRefreshData: () => Promise<void>;
  currentUser: User | null;
}

export const ElementaryMidtermGeneralCommentsTab: React.FC<ElementaryMidtermGeneralCommentsTabProps> = ({
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
  const safeStudents = Array.isArray(students) ? students.filter(Boolean) : [];
  const safeStudentDataMap = studentDataMap && typeof studentDataMap === 'object' ? studentDataMap : {};

  const [selectedStudentId, setSelectedStudentId] = React.useState<string>(safeStudents[0]?.id || '');
  
  // Active editing state for current selected student
  const [nickname, setNickname] = React.useState<string>('');
  const [selectedStrengths, setSelectedStrengths] = React.useState<string[]>([]);
  const [selectedAchievements, setSelectedAchievements] = React.useState<string[]>([]);
  const [selectedNeedsImprovement, setSelectedNeedsImprovement] = React.useState<string[]>([]);
  const [customStrength, setCustomStrength] = React.useState<string>('');
  const [customAchievement, setCustomAchievement] = React.useState<string>('');
  const [customNeed, setCustomNeed] = React.useState<string>('');
  const [manualNotes, setManualNotes] = React.useState<string>('');
  const [aiDraft, setAiDraft] = React.useState<string>('');
  const [finalComment, setFinalComment] = React.useState<string>('');
  const [isFinal, setIsFinal] = React.useState<boolean>(false);

  // Class-level custom comment configuration states
  const [customStrengths, setCustomStrengths] = React.useState<string[]>([]);
  const [customAchievements, setCustomAchievements] = React.useState<string[]>([]);
  const [customNeedsImprovement, setCustomNeedsImprovement] = React.useState<string[]>([]);
  const [strengthsEnabled, setStrengthsEnabled] = React.useState<boolean>(true);
  const [achievementsEnabled, setAchievementsEnabled] = React.useState<boolean>(true);
  const [needsImprovementEnabled, setNeedsImprovementEnabled] = React.useState<boolean>(true);
  const [loadingConfig, setLoadingConfig] = React.useState<boolean>(false);

  // Loading flags
  const [generatingAI, setGeneratingAI] = React.useState<boolean>(false);
  const [polishingAI, setPolishingAI] = React.useState<boolean>(false);
  const [saving, setSaving] = React.useState<boolean>(false);
  const [submittingForReview, setSubmittingForReview] = React.useState<boolean>(false);

  const canEdit = currentUser ? (
    currentUser.role === 'SUPER_ADMIN' ||
    currentUser.role === 'PRINCIPAL' ||
    currentUser.role === 'HEAD_UNIT' ||
    currentUser.role === 'VICE_PRINCIPAL' ||
    currentUser.role === 'COORDINATOR' ||
    currentUser.role === 'SECRETARY_ELEM' ||
    isHomeroomTeacherOfClass(currentUser, selectedClass)
  ) : false;

  // Sync selected student ID if empty
  React.useEffect(() => {
    if (safeStudents.length > 0 && (!selectedStudentId || !safeStudents.some(s => s.id === selectedStudentId))) {
      setSelectedStudentId(safeStudents[0].id);
    }
  }, [safeStudents, selectedStudentId]);

  // Load custom configs for this class context
  React.useEffect(() => {
    if (!selectedClassId) return;

    const loadConfig = async () => {
      setLoadingConfig(true);
      try {
        const config = await getElementaryMidtermClassCommentsConfig(
          selectedClassId,
          selectedYear,
          selectedSemester,
          selectedTerm
        );

        if (config) {
          setCustomStrengths(Array.isArray(config.customStrengths) ? config.customStrengths : []);
          setCustomAchievements(Array.isArray(config.customAchievements) ? config.customAchievements : []);
          setCustomNeedsImprovement(Array.isArray(config.customNeedsImprovement) ? config.customNeedsImprovement : []);
          setStrengthsEnabled(config.strengthsEnabled !== false);
          setAchievementsEnabled(config.achievementsEnabled !== false);
          setNeedsImprovementEnabled(config.needsImprovementEnabled !== false);
        } else {
          setCustomStrengths([]);
          setCustomAchievements([]);
          setCustomNeedsImprovement([]);
          setStrengthsEnabled(true);
          setAchievementsEnabled(true);
          setNeedsImprovementEnabled(true);
        }
      } catch (err) {
        console.error('Error loading class comments config:', err);
      } finally {
        setLoadingConfig(false);
      }
    };

    loadConfig();
  }, [selectedClassId, selectedYear, selectedSemester, selectedTerm]);

  // Helper to merge banks and avoid case-insensitive/trimmed duplicates
  const mergeBanks = (defaultBank: string[], customBank: string[]) => {
    const merged = [...defaultBank];
    const lowercaseDefaults = defaultBank.map(item => item.trim().toLowerCase());

    if (Array.isArray(customBank)) {
      customBank.forEach(item => {
        const trimmed = item.trim();
        if (trimmed && !lowercaseDefaults.includes(trimmed.toLowerCase())) {
          merged.push(trimmed);
        }
      });
    }

    return merged;
  };

  const combinedStrengths = mergeBanks(ELEM_STRENGTH_PROGRESS_BANK, customStrengths);
  const combinedAchievements = mergeBanks(ELEM_ACHIEVEMENT_BANK, customAchievements);
  const combinedNeedsImprovement = mergeBanks(ELEM_NEEDS_IMPROVEMENT_BANK, customNeedsImprovement);

  // Handle adding custom items
  const handleAddCustomItem = async (
    category: 'STRENGTH' | 'ACHIEVEMENT' | 'NEED',
    itemText: string,
    setCustomInput: (v: string) => void,
    selectedList: string[],
    setSelectedList: (v: string[]) => void
  ) => {
    const trimmed = itemText.trim();
    if (!trimmed || !selectedClassId || !currentUser) return;

    let existingCombined: string[] = [];
    let currentCustom: string[] = [];
    if (category === 'STRENGTH') {
      existingCombined = combinedStrengths;
      currentCustom = customStrengths;
    } else if (category === 'ACHIEVEMENT') {
      existingCombined = combinedAchievements;
      currentCustom = customAchievements;
    } else {
      existingCombined = combinedNeedsImprovement;
      currentCustom = customNeedsImprovement;
    }

    const lowerTrimmed = trimmed.toLowerCase();
    const isDuplicate = existingCombined.some(item => item.trim().toLowerCase() === lowerTrimmed);

    if (isDuplicate) {
      toast.error('Item tersebut sudah ada di daftar.');
      return;
    }

    const updatedCustom = [...currentCustom, trimmed];
    
    try {
      const fieldToUpdate = 
        category === 'STRENGTH' ? { customStrengths: updatedCustom } :
        category === 'ACHIEVEMENT' ? { customAchievements: updatedCustom } :
        { customNeedsImprovement: updatedCustom };

      await saveElementaryMidtermClassCommentsConfig(
        selectedClassId,
        selectedYear,
        selectedSemester,
        selectedTerm,
        fieldToUpdate,
        currentUser.uid || (currentUser as any).id
      );

      if (category === 'STRENGTH') {
        setCustomStrengths(updatedCustom);
      } else if (category === 'ACHIEVEMENT') {
        setCustomAchievements(updatedCustom);
      } else {
        setCustomNeedsImprovement(updatedCustom);
      }

      // Auto select the newly added item
      setSelectedList([...selectedList, trimmed]);
      setCustomInput('');
      toast.success('Pilihan baru berhasil ditambahkan.');
    } catch (err) {
      console.error(err);
      toast.error('Gagal menambahkan pilihan baru.');
    }
  };

  const selectedStudent = safeStudents.find(s => s && s.id === selectedStudentId) || safeStudents[0] || null;
  const studentData = selectedStudent ? safeStudentDataMap[selectedStudent.id] : null;
  const currentReviewStatus: ElementaryMidtermGenComReviewStatus = studentData?.generalCommentReviewStatus || 'DRAFT';
  const isEditorLocked = !canEdit || currentReviewStatus === 'SUBMITTED_FOR_REVIEW' || currentReviewStatus === 'APPROVED';

  // Sync form when student changes or studentDataMap updates
  React.useEffect(() => {
    if (!selectedStudent) return;
    const sData = safeStudentDataMap[selectedStudent.id];
    const gc = sData?.generalComment;

    const sName = selectedStudent.name || '';

    setNickname(gc?.nickname || (selectedStudent.nickname as any) || sName.split(' ')[0] || '');
    setSelectedStrengths(Array.isArray(gc?.strengths) ? gc.strengths : []);
    setSelectedAchievements(Array.isArray(gc?.achievements) ? gc.achievements : []);
    setSelectedNeedsImprovement(Array.isArray(gc?.needsImprovement) ? gc.needsImprovement : []);
    setManualNotes(gc?.manualNotes || '');
    setAiDraft(gc?.aiDraft || '');
    setFinalComment(gc?.finalComment || gc?.aiDraft || '');
    setIsFinal(Boolean(gc?.isFinal));
  }, [selectedStudent?.id, safeStudentDataMap]);

  // Helper to toggle bank items
  const toggleItem = (list: string[], setList: (v: string[]) => void, item: string) => {
    if (list.includes(item)) {
      setList(list.filter(i => i !== item));
    } else {
      setList([...list, item]);
    }
  };

  // Helper to count words
  const countWords = (text: string) => {
    const trimmed = text.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  };

  const handleGenerateAI = async () => {
    if (!selectedStudent) return;
    setGeneratingAI(true);
    try {
      const generated = await generateElementaryMidtermGeneralCommentAI({
        studentName: selectedStudent.name,
        nickname: nickname.trim() || undefined,
        strengths: strengthsEnabled ? selectedStrengths : [],
        achievements: achievementsEnabled ? selectedAchievements : [],
        needsImprovement: needsImprovementEnabled ? selectedNeedsImprovement : [],
        manualNotes: manualNotes.trim() || undefined
      });

      setAiDraft(generated);
      if (!finalComment.trim() || finalComment === aiDraft) {
        setFinalComment(generated);
      }
      toast.success('Draf komentar berhasil di-generate oleh AI.');
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Gagal generate AI.');
    } finally {
      setGeneratingAI(false);
    }
  };

  const handlePolishAI = async () => {
    if (!finalComment.trim()) {
      toast.error('Ketik atau generate draf komentar terlebih dahulu.');
      return;
    }
    setPolishingAI(true);
    try {
      const polished = await refineElementaryMidtermGeneralCommentAI({
        originalComment: finalComment,
        draftText: finalComment,
        studentName: selectedStudent?.name,
        nickname: nickname.trim() || undefined,
      });

      setFinalComment(polished);
      toast.success('Komentar berhasil dirapikan oleh AI.');
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Gagal merapikan dengan AI.');
    } finally {
      setPolishingAI(false);
    }
  };

  const handleSave = async (markFinal = false) => {
    if (!selectedStudent || !selectedClassId || !currentUser) return;
    setSaving(true);
    try {
      const payload: ElementaryMidtermGeneralCommentData = {
        studentName: selectedStudent.name,
        nickname: nickname.trim(),
        strengths: selectedStrengths,
        achievements: selectedAchievements,
        needsImprovement: selectedNeedsImprovement,
        manualNotes: manualNotes.trim(),
        aiDraft: aiDraft.trim(),
        finalComment: finalComment.trim(),
        isFinal: markFinal || isFinal,
      };

      await saveElementaryMidtermGeneralComment(
        selectedStudent.id,
        selectedStudent.name,
        selectedClassId,
        selectedYear,
        selectedSemester,
        selectedTerm,
        payload,
        currentUser
      );

      if (markFinal) {
        setIsFinal(true);
      }

      await onRefreshData();
      toast.success(markFinal ? 'Komentar berhasil ditandai FINAL dan disimpan.' : 'Draf komentar berhasil disimpan.');
    } catch (err: any) {
      console.error(err);
      toast.error('Gagal menyimpan komentar: ' + (err.message || 'Error'));
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitForReview = async () => {
    if (!selectedStudent || !selectedClassId || !currentUser) return;
    
    const confirmSubmit = window.confirm('Apakah Anda yakin ingin mengajukan General Comments ini untuk direview oleh Kepala Sekolah? Setelah diajukan, komentar akan terkunci.');
    if (!confirmSubmit) return;

    setSubmittingForReview(true);
    try {
      // First save the current form values as a draf to make sure they are up-to-date!
      const payload: ElementaryMidtermGeneralCommentData = {
        studentName: selectedStudent.name,
        nickname: nickname.trim(),
        strengths: selectedStrengths,
        achievements: selectedAchievements,
        needsImprovement: selectedNeedsImprovement,
        manualNotes: manualNotes.trim(),
        aiDraft: aiDraft.trim(),
        finalComment: finalComment.trim(),
        isFinal: true, // Auto mark final when submitting
      };

      await saveElementaryMidtermGeneralComment(
        selectedStudent.id,
        selectedStudent.name,
        selectedClassId,
        selectedYear,
        selectedSemester,
        selectedTerm,
        payload,
        currentUser
      );

      // Now call submit function
      await submitElementaryMidtermGeneralCommentForReview(
        selectedStudent.id,
        selectedClassId,
        selectedYear,
        selectedSemester,
        selectedTerm,
        currentUser.uid || (currentUser as any).id,
        currentUser.displayName || (currentUser as any).name || 'Guru',
        currentUser.role || 'Homeroom Teacher',
        finalComment.trim()
      );

      await onRefreshData();
      toast.success('Komentar berhasil diajukan untuk review.');
    } catch (err: any) {
      console.error(err);
      toast.error('Gagal mengajukan review: ' + (err.message || 'Error'));
    } finally {
      setSubmittingForReview(false);
    }
  };

  const finalCommentWordCount = countWords(finalComment);
  const isWordCountExceeded = finalCommentWordCount > 120;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Sidebar: Students List */}
      <div className="lg:col-span-4 bg-white p-4 rounded-3xl border border-slate-200 shadow-xs flex flex-col h-full min-h-[500px]">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3 px-1">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <UserIcon size={16} className="text-emerald-600" />
            <span>Daftar Siswa ({safeStudents.length})</span>
          </h3>
        </div>

        <div className="space-y-1.5 overflow-y-auto max-h-[700px] flex-1 pr-1">
          {safeStudents.map((st, index) => {
            const isSelected = st.id === selectedStudentId;
            const stData = safeStudentDataMap[st.id];
            const revStatus = stData?.generalCommentReviewStatus || 'DRAFT';
            const hasDraft = Boolean(stData?.generalComment?.finalComment || stData?.generalComment?.aiDraft);

            let statusBadgeColor = 'bg-slate-100 text-slate-700';
            if (revStatus === 'SUBMITTED_FOR_REVIEW') {
              statusBadgeColor = 'bg-blue-50 text-blue-700 border border-blue-100';
            } else if (revStatus === 'APPROVED') {
              statusBadgeColor = 'bg-emerald-50 text-emerald-700 border border-emerald-100';
            } else if (revStatus === 'REVISION_REQUESTED') {
              statusBadgeColor = 'bg-amber-50 text-amber-700 border border-amber-100';
            }

            return (
              <button
                key={st.id}
                onClick={() => setSelectedStudentId(st.id)}
                className={`w-full p-3.5 rounded-2xl text-left transition-all flex items-center justify-between gap-2 cursor-pointer ${
                  isSelected 
                    ? 'bg-slate-900 text-white shadow-sm' 
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-xl font-extrabold flex items-center justify-center text-[10px] ${
                    isSelected ? 'bg-emerald-500 text-slate-950' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {index + 1}
                  </span>
                  <div>
                    <h4 className={`text-xs font-bold leading-tight ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                      {st.name}
                    </h4>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-lg ${statusBadgeColor}`}>
                        {revStatus}
                      </span>
                    </div>
                  </div>
                </div>

                {hasDraft ? (
                  <CheckCircle2 size={16} className={isSelected ? 'text-emerald-400' : 'text-emerald-600'} />
                ) : (
                  <Clock size={16} className={isSelected ? 'text-slate-500' : 'text-slate-300'} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Column: AI & Editor Workspace */}
      <div className="lg:col-span-8 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-6">
        {selectedStudent ? (
          <>
            {/* Review Banner Alert if not draft */}
            {currentReviewStatus === 'SUBMITTED_FOR_REVIEW' && (
              <div className="p-4 bg-blue-50 text-blue-800 rounded-2xl border border-blue-200 flex items-start gap-3">
                <Clock className="text-blue-600 shrink-0 mt-0.5" size={18} />
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider">Sedang Ditinjau (Locked)</h4>
                  <p className="text-[11px] font-medium text-blue-700 mt-1 leading-relaxed">
                    Komentar telah diajukan untuk review Kepala Sekolah pada tanggal {studentData?.submittedForReviewAt ? new Date(studentData.submittedForReviewAt).toLocaleDateString('id-ID') : '-'} oleh {studentData?.submittedForReviewByName || 'Guru'}. Penyuntingan terkunci sementara.
                  </p>
                </div>
              </div>
            )}

            {currentReviewStatus === 'APPROVED' && (
              <div className="p-4 bg-emerald-50 text-emerald-800 rounded-2xl border border-emerald-200 flex items-start gap-3">
                <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={18} />
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider">Telah Disetujui (Approved)</h4>
                  <p className="text-[11px] font-medium text-emerald-700 mt-1 leading-relaxed">
                    Komentar telah disetujui oleh Kepala Sekolah pada {studentData?.approvedAt ? new Date(studentData.approvedAt).toLocaleDateString('id-ID') : '-'} dan siap dicetak ke dalam draf PDF rapor. Penyuntingan terkunci.
                  </p>
                </div>
              </div>
            )}

            {currentReviewStatus === 'REVISION_REQUESTED' && (
              <div className="p-4 bg-amber-50 text-amber-800 rounded-2xl border border-amber-200 flex items-start gap-3">
                <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={18} />
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider">Perlu Revisi (Revision Requested)</h4>
                  <p className="text-[11px] font-bold text-amber-900 mt-1 leading-relaxed">
                    Masukan Reviewer: "{studentData?.revisionFeedback || 'Silakan perbaiki struktur kalimat.'}"
                  </p>
                  <p className="text-[10px] text-amber-700 mt-1 font-medium">
                    Diminta oleh {studentData?.revisionRequestedByName || 'Reviewer'} pada {studentData?.revisionRequestedAt ? new Date(studentData.revisionRequestedAt).toLocaleDateString('id-ID') : '-'}.
                  </p>
                </div>
              </div>
            )}

            {/* Header Metadata */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg">
                  Midterm Elementary
                </span>
                <h2 className="text-lg font-black text-slate-900 mt-1 uppercase tracking-tight">
                  {selectedStudent.name}
                </h2>
                <p className="text-xs text-slate-500 font-bold mt-0.5">
                  Kelas {selectedClass?.name || 'Unknown'} — S{selectedSemester} T{selectedTerm}
                </p>
              </div>

              {/* Student Nickname Input */}
              <div className="flex items-center gap-2 max-w-[200px]">
                <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider shrink-0">
                  Nama Panggilan:
                </label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  disabled={isEditorLocked}
                  placeholder="Panggilan"
                  className="w-full px-2.5 py-1 text-xs border border-slate-200 rounded-xl font-bold bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-100"
                />
              </div>
            </div>

            {/* Editor Locked Prompt Banner */}
            {!canEdit && (
              <div className="p-3.5 bg-slate-100 text-slate-700 rounded-2xl border border-slate-200 flex items-center gap-2.5">
                <Lock size={16} className="text-slate-500" />
                <span className="text-xs font-bold leading-tight">
                  Hanya Wali Kelas dari kelas ini atau Kepala Sekolah / Super Admin yang berhak menyunting General Comments.
                </span>
              </div>
            )}

            {/* Phrase Banks Category Selections */}
            <div className="space-y-6">
              {/* Category 1: Perkembangan Positif (Strength) */}
              <div className="border border-slate-200/80 rounded-2xl overflow-hidden shadow-2xs">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-lg bg-emerald-500 text-slate-950 text-[10px] font-black flex items-center justify-center">1</span>
                    <span className="text-xs font-black text-slate-800 uppercase tracking-wider">Perkembangan Positif / Kekuatan</span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-200 px-2 py-0.5 rounded-lg">
                    {selectedStrengths.length} dipilih
                  </span>
                </div>

                <div className="p-4 space-y-4">
                  {strengthsEnabled ? (
                    <div className="grid grid-cols-1 gap-2">
                      {combinedStrengths.map((item) => {
                        const isChecked = selectedStrengths.includes(item);
                        return (
                          <button
                            key={item}
                            disabled={isEditorLocked}
                            onClick={() => toggleItem(selectedStrengths, setSelectedStrengths, item)}
                            className={`w-full p-2.5 rounded-xl text-left text-xs transition-all flex items-start gap-2.5 ${
                              isChecked
                                ? 'bg-slate-900 border border-slate-900 text-white font-bold shadow-xs'
                                : 'bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700'
                            }`}
                          >
                            <span className={`w-4 h-4 rounded-md border shrink-0 mt-0.5 flex items-center justify-center text-[10px] font-extrabold ${
                              isChecked ? 'bg-emerald-400 border-emerald-400 text-slate-950' : 'bg-white border-slate-300 text-transparent'
                            }`}>
                              ✓
                            </span>
                            <span className="leading-tight">{item}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 font-medium italic">Kategori ini dinonaktifkan untuk kelas ini.</p>
                  )}

                  {canEdit && !isEditorLocked && strengthsEnabled && (
                    <div className="flex gap-2 pt-1 border-t border-slate-100">
                      <input
                        type="text"
                        value={customStrength}
                        onChange={(e) => setCustomStrength(e.target.value)}
                        placeholder="Tambah pilihan perkembangan positif kustom kelas..."
                        className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-medium"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCustomItem('STRENGTH', customStrength, setCustomStrength, selectedStrengths, setSelectedStrengths);
                          }
                        }}
                      />
                      <button
                        onClick={() => handleAddCustomItem('STRENGTH', customStrength, setCustomStrength, selectedStrengths, setSelectedStrengths)}
                        disabled={!customStrength.trim()}
                        className="px-3 py-2 bg-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-300 disabled:opacity-50"
                      >
                        Tambah
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Category 2: Pencapaian (Achievement) */}
              <div className="border border-slate-200/80 rounded-2xl overflow-hidden shadow-2xs">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-lg bg-emerald-500 text-slate-950 text-[10px] font-black flex items-center justify-center">2</span>
                    <span className="text-xs font-black text-slate-800 uppercase tracking-wider">Pencapaian (Achievements)</span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-200 px-2 py-0.5 rounded-lg">
                    {selectedAchievements.length} dipilih
                  </span>
                </div>

                <div className="p-4 space-y-4">
                  {achievementsEnabled ? (
                    <div className="grid grid-cols-1 gap-2">
                      {combinedAchievements.map((item) => {
                        const isChecked = selectedAchievements.includes(item);
                        return (
                          <button
                            key={item}
                            disabled={isEditorLocked}
                            onClick={() => toggleItem(selectedAchievements, setSelectedAchievements, item)}
                            className={`w-full p-2.5 rounded-xl text-left text-xs transition-all flex items-start gap-2.5 ${
                              isChecked
                                ? 'bg-slate-900 border border-slate-900 text-white font-bold shadow-xs'
                                : 'bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700'
                            }`}
                          >
                            <span className={`w-4 h-4 rounded-md border shrink-0 mt-0.5 flex items-center justify-center text-[10px] font-extrabold ${
                              isChecked ? 'bg-emerald-400 border-emerald-400 text-slate-950' : 'bg-white border-slate-300 text-transparent'
                            }`}>
                              ✓
                            </span>
                            <span className="leading-tight">{item}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 font-medium italic">Kategori ini dinonaktifkan untuk kelas ini.</p>
                  )}

                  {canEdit && !isEditorLocked && achievementsEnabled && (
                    <div className="flex gap-2 pt-1 border-t border-slate-100">
                      <input
                        type="text"
                        value={customAchievement}
                        onChange={(e) => setCustomAchievement(e.target.value)}
                        placeholder="Tambah pilihan pencapaian kustom kelas..."
                        className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-medium"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCustomItem('ACHIEVEMENT', customAchievement, setCustomAchievement, selectedAchievements, setSelectedAchievements);
                          }
                        }}
                      />
                      <button
                        onClick={() => handleAddCustomItem('ACHIEVEMENT', customAchievement, setCustomAchievement, selectedAchievements, setSelectedAchievements)}
                        disabled={!customAchievement.trim()}
                        className="px-3 py-2 bg-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-300 disabled:opacity-50"
                      >
                        Tambah
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Category 3: Area Pengembangan (Needs Improvement) */}
              <div className="border border-slate-200/80 rounded-2xl overflow-hidden shadow-2xs">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-lg bg-emerald-500 text-slate-950 text-[10px] font-black flex items-center justify-center">3</span>
                    <span className="text-xs font-black text-slate-800 uppercase tracking-wider">Area Pengembangan (Needs Improvement)</span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-200 px-2 py-0.5 rounded-lg">
                    {selectedNeedsImprovement.length} dipilih
                  </span>
                </div>

                <div className="p-4 space-y-4">
                  {needsImprovementEnabled ? (
                    <div className="grid grid-cols-1 gap-2">
                      {combinedNeedsImprovement.map((item) => {
                        const isChecked = selectedNeedsImprovement.includes(item);
                        return (
                          <button
                            key={item}
                            disabled={isEditorLocked}
                            onClick={() => toggleItem(selectedNeedsImprovement, setSelectedNeedsImprovement, item)}
                            className={`w-full p-2.5 rounded-xl text-left text-xs transition-all flex items-start gap-2.5 ${
                              isChecked
                                ? 'bg-slate-900 border border-slate-900 text-white font-bold shadow-xs'
                                : 'bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700'
                            }`}
                          >
                            <span className={`w-4 h-4 rounded-md border shrink-0 mt-0.5 flex items-center justify-center text-[10px] font-extrabold ${
                              isChecked ? 'bg-emerald-400 border-emerald-400 text-slate-950' : 'bg-white border-slate-300 text-transparent'
                            }`}>
                              ✓
                            </span>
                            <span className="leading-tight">{item}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 font-medium italic">Kategori ini dinonaktifkan untuk kelas ini.</p>
                  )}

                  {canEdit && !isEditorLocked && needsImprovementEnabled && (
                    <div className="flex gap-2 pt-1 border-t border-slate-100">
                      <input
                        type="text"
                        value={customNeed}
                        onChange={(e) => setCustomNeed(e.target.value)}
                        placeholder="Tambah area pengembangan kustom kelas..."
                        className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-medium"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCustomItem('NEED', customNeed, setCustomNeed, selectedNeedsImprovement, setSelectedNeedsImprovement);
                          }
                        }}
                      />
                      <button
                        onClick={() => handleAddCustomItem('NEED', customNeed, setCustomNeed, selectedNeedsImprovement, setSelectedNeedsImprovement)}
                        disabled={!customNeed.trim()}
                        className="px-3 py-2 bg-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-300 disabled:opacity-50"
                      >
                        Tambah
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Category 4: Catatan Tambahan (Manual Notes) */}
              <div className="space-y-2">
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">
                  4. Catatan Tambahan Guru (Opsional)
                </label>
                <textarea
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  disabled={isEditorLocked}
                  rows={3}
                  placeholder="Ketik poin tambahan khusus atau instruksi spesifik untuk siswa di paruh semester ini..."
                  className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-100"
                />
              </div>

              {/* AI Generative Engine Trigger Button */}
              {canEdit && !isEditorLocked && (
                <button
                  onClick={handleGenerateAI}
                  disabled={generatingAI || isEditorLocked}
                  className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm hover:from-emerald-700 hover:to-teal-700 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {generatingAI ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <Sparkles size={14} />
                  )}
                  <span>Generate Draf Komentar AI</span>
                </button>
              )}

              {/* Workspace Final Comment Area */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <MessageSquare size={14} className="text-emerald-600" />
                    <span>Pratinjau / Hasil Komentar Final</span>
                  </label>

                  {canEdit && !isEditorLocked && (
                    <button
                      onClick={handlePolishAI}
                      disabled={polishingAI || !finalComment.trim() || isEditorLocked}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-teal-50 text-teal-700 border border-teal-200 rounded-lg text-xs font-bold hover:bg-teal-100 transition-all disabled:opacity-50 cursor-pointer"
                    >
                      {polishingAI ? <RefreshCw size={12} className="animate-spin" /> : <Wand2 size={12} />}
                      <span>Rapikan Kalimat (AI)</span>
                    </button>
                  )}
                </div>

                <textarea
                  value={finalComment}
                  onChange={(e) => setFinalComment(e.target.value)}
                  disabled={isEditorLocked}
                  rows={5}
                  placeholder="Ketik narasi komentar rapor final atau klik Generate AI untuk menyusunnya otomatis..."
                  className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-100 leading-relaxed font-sans"
                />

                {/* Wordcount Indicator */}
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className={isWordCountExceeded ? 'text-rose-600' : 'text-slate-400'}>
                    Panjang Karakter: {finalComment.length} | Jumlah Kata: {finalCommentWordCount} / 120 kata
                  </span>
                  {isWordCountExceeded && (
                    <span className="text-rose-600 flex items-center gap-1">
                      <AlertCircle size={12} />
                      Jumlah kata melebihi batas maksimal 120 kata!
                    </span>
                  )}
                </div>
              </div>

              {/* Save, Submit and Status Actions Area */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-xl flex items-center gap-1 ${
                    currentReviewStatus === 'SUBMITTED_FOR_REVIEW' ? 'bg-blue-50 text-blue-700' :
                    currentReviewStatus === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' :
                    currentReviewStatus === 'REVISION_REQUESTED' ? 'bg-amber-50 text-amber-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {currentReviewStatus === 'SUBMITTED_FOR_REVIEW' && <Clock size={12} />}
                    {currentReviewStatus === 'APPROVED' && <Check size={12} />}
                    {currentReviewStatus === 'REVISION_REQUESTED' && <AlertCircle size={12} />}
                    <span>Status: {currentReviewStatus}</span>
                  </span>

                  {isFinal && (
                    <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 bg-teal-50 text-teal-700 rounded-xl flex items-center gap-1">
                      <CheckCircle2 size={12} />
                      Sudah Ditandai Final
                    </span>
                  )}
                </div>

                {canEdit && (
                  <div className="flex items-center gap-2 sm:self-end">
                    {/* Save Draft */}
                    <button
                      onClick={() => handleSave(false)}
                      disabled={saving || isEditorLocked}
                      className="px-4 py-2 bg-slate-100 text-slate-800 hover:bg-slate-200 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                    >
                      {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                      <span>Simpan Draft</span>
                    </button>

                    {/* Submit Review */}
                    {currentReviewStatus !== 'SUBMITTED_FOR_REVIEW' && currentReviewStatus !== 'APPROVED' ? (
                      <button
                        onClick={handleSubmitForReview}
                        disabled={saving || submittingForReview || !finalComment.trim() || isWordCountExceeded}
                        className="px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50 cursor-pointer"
                      >
                        {submittingForReview ? (
                          <RefreshCw size={14} className="animate-spin" />
                        ) : (
                          <CheckCircle2 size={14} />
                        )}
                        <span>Ajukan Review</span>
                      </button>
                    ) : (
                      <button
                        disabled
                        className="px-4 py-2 bg-slate-100 text-slate-400 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-not-allowed"
                      >
                        <Lock size={14} />
                        <span>Terkunci</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center p-12 text-slate-400 border border-dashed border-slate-200 rounded-3xl min-h-[300px]">
            <MessageSquare size={36} className="text-slate-300 mb-2" />
            <p className="text-xs font-medium">Pilih siswa pada daftar di samping untuk memasukkan General Comments.</p>
          </div>
        )}
      </div>
    </div>
  );
};
