import * as React from 'react';
import { 
  Sparkles, Save, CheckCircle2, AlertCircle, Wand2, 
  User as UserIcon, Plus, X, Lock, RefreshCw, Check, Clock
} from 'lucide-react';
import { toast } from 'sonner';
import { 
  STRENGTH_PROGRESS_BANK, 
  ACHIEVEMENT_BANK, 
  NEEDS_IMPROVEMENT_BANK,
  canUserEditMidtermGeneralComments,
  saveMidtermStudentGeneralComment,
  generateMidtermGeneralCommentAI,
  refineMidtermGeneralCommentAI,
  getMidtermClassCommentsConfig,
  saveMidtermClassCommentsConfig,
  submitMidtermGeneralCommentForReview
} from '../../../services/juniorHighMidtermService';
import type { 
  MidtermStudentDataDoc, 
  MidtermGeneralCommentData,
  MidtermGenComReviewStatus
} from '../../../types/midtermReport';
import type { Student, Class, User } from '../../../types';

interface MidtermGeneralCommentsTabProps {
  currentUser: User;
  selectedClass: Class | null;
  students: Student[];
  academicYear: string;
  semester: string;
  midtermTerm: string;
  studentDataMap: Record<string, MidtermStudentDataDoc>;
  onRefreshData: () => Promise<void>;
  loading: boolean;
}

export const MidtermGeneralCommentsTab: React.FC<MidtermGeneralCommentsTabProps> = ({
  currentUser,
  selectedClass,
  students,
  academicYear,
  semester,
  midtermTerm,
  studentDataMap,
  onRefreshData,
  loading
}) => {
  const safeStudents = Array.isArray(students) ? students.filter(Boolean) : [];
  const safeStudentDataMap = studentDataMap && typeof studentDataMap === 'object' ? studentDataMap : {};

  const [selectedStudentId, setSelectedStudentId] = React.useState<string>(safeStudents[0]?.id || '');
  
  // Active editing state for current selected student
  const [nickname, setNickname] = React.useState<string>('');
  const [gender, setGender] = React.useState<'MALE' | 'FEMALE'>('MALE');
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

  const canEdit = canUserEditMidtermGeneralComments(currentUser, selectedClass);
  const [submittingForReview, setSubmittingForReview] = React.useState<boolean>(false);

  // Load custom configs for this class context
  React.useEffect(() => {
    if (!selectedClass) return;

    const loadConfig = async () => {
      setLoadingConfig(true);
      try {
        const config = await getMidtermClassCommentsConfig(
          selectedClass.id,
          academicYear,
          semester,
          midtermTerm
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
  }, [selectedClass?.id, academicYear, semester, midtermTerm]);

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

  const combinedStrengths = mergeBanks(STRENGTH_PROGRESS_BANK, customStrengths);
  const combinedAchievements = mergeBanks(ACHIEVEMENT_BANK, customAchievements);
  const combinedNeedsImprovement = mergeBanks(NEEDS_IMPROVEMENT_BANK, customNeedsImprovement);

  // Handle adding custom items
  const handleAddCustomItem = async (
    category: 'STRENGTH' | 'ACHIEVEMENT' | 'NEED',
    itemText: string,
    setCustomInput: (v: string) => void,
    selectedList: string[],
    setSelectedList: (v: string[]) => void
  ) => {
    const trimmed = itemText.trim();
    if (!trimmed || !selectedClass) return;

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

      await saveMidtermClassCommentsConfig(
        selectedClass.id,
        academicYear,
        semester,
        midtermTerm,
        fieldToUpdate,
        currentUser.uid
      );

      if (category === 'STRENGTH') {
        setCustomStrengths(updatedCustom);
      } else if (category === 'ACHIEVEMENT') {
        setCustomAchievements(updatedCustom);
      } else {
        setCustomNeedsImprovement(updatedCustom);
      }

      if (!selectedList.includes(trimmed)) {
        setSelectedList([...selectedList, trimmed]);
      }

      setCustomInput('');
      toast.success('Custom item berhasil ditambahkan ke kelas ini.');
    } catch (err: any) {
      console.error(err);
      toast.error('Gagal menyimpan custom item: ' + (err.message || 'Error'));
    }
  };

  // Auto-select first student if none selected
  React.useEffect(() => {
    if ((!selectedStudentId || !safeStudents.some(s => s && s.id === selectedStudentId)) && safeStudents.length > 0) {
      setSelectedStudentId(safeStudents[0].id);
    }
  }, [safeStudents, selectedStudentId]);

  const selectedStudent = safeStudents.find(s => s && s.id === selectedStudentId) || safeStudents[0] || null;

  const studentData = selectedStudent ? safeStudentDataMap[selectedStudent.id] : null;
  const currentReviewStatus: MidtermGenComReviewStatus = studentData?.generalCommentReviewStatus || 'DRAFT';
  const isEditorLocked = !canEdit || currentReviewStatus === 'SUBMITTED_FOR_REVIEW' || currentReviewStatus === 'APPROVED';

  // Sync form when student changes or studentDataMap updates
  React.useEffect(() => {
    if (!selectedStudent) return;
    const sData = safeStudentDataMap[selectedStudent.id];
    const gc = sData?.generalComment;

    const sName = selectedStudent.name || '';
    const detectedGender = (selectedStudent.gender === 'P' || selectedStudent.gender === 'FEMALE') ? 'FEMALE' : 'MALE';

    setNickname(gc?.nickname || (selectedStudent.nickname as any) || sName.split(' ')[0] || '');
    setGender(gc?.gender || detectedGender);
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
      const generated = await generateMidtermGeneralCommentAI({
        studentName: selectedStudent.name,
        nickname: nickname.trim() || undefined,
        gender,
        strengths: strengthsEnabled ? selectedStrengths : [],
        achievements: achievementsEnabled ? selectedAchievements : [],
        needsImprovement: needsImprovementEnabled ? selectedNeedsImprovement : [],
        manualNotes: manualNotes.trim() || undefined
      });

      setAiDraft(generated);
      // If final comment is empty or was previous AI draft, update it as well
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
      const polished = await refineMidtermGeneralCommentAI({
        originalComment: finalComment,
        draftText: finalComment,
        gender,
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
    if (!selectedStudent || !selectedClass) return;
    setSaving(true);
    try {
      const payload: MidtermGeneralCommentData = {
        studentName: selectedStudent.name,
        nickname: nickname.trim(),
        gender,
        strengths: selectedStrengths,
        achievements: selectedAchievements,
        needsImprovement: selectedNeedsImprovement,
        manualNotes: manualNotes.trim(),
        aiDraft: aiDraft.trim(),
        finalComment: finalComment.trim(),
        isFinal: markFinal || isFinal,
      };

      await saveMidtermStudentGeneralComment(
        selectedStudent.id,
        selectedStudent.name,
        selectedClass.id,
        academicYear,
        semester,
        midtermTerm,
        payload,
        currentUser.uid,
        currentUser.displayName || currentUser.name || 'Guru',
        currentUser.role || 'Homeroom Teacher'
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
    if (!selectedStudent || !selectedClass) return;
    
    const confirmSubmit = window.confirm('Apakah Anda yakin ingin mengajukan General Comments ini untuk direview oleh Kepala Sekolah? Setelah diajukan, komentar akan terkunci.');
    if (!confirmSubmit) return;

    setSubmittingForReview(true);
    try {
      // First save the current form values as a draft to make sure they are up-to-date!
      const payload: MidtermGeneralCommentData = {
        studentName: selectedStudent.name,
        nickname: nickname.trim(),
        gender,
        strengths: selectedStrengths,
        achievements: selectedAchievements,
        needsImprovement: selectedNeedsImprovement,
        manualNotes: manualNotes.trim(),
        aiDraft: aiDraft.trim(),
        finalComment: finalComment.trim(),
        isFinal: true, // Auto mark final when submitting
      };

      await saveMidtermStudentGeneralComment(
        selectedStudent.id,
        selectedStudent.name,
        selectedClass.id,
        academicYear,
        semester,
        midtermTerm,
        payload,
        currentUser.uid,
        currentUser.displayName || currentUser.name || 'Guru',
        currentUser.role || 'Homeroom Teacher'
      );

      // Now call submit function
      await submitMidtermGeneralCommentForReview(
        selectedStudent.id,
        selectedClass.id,
        academicYear,
        semester,
        midtermTerm,
        currentUser.uid,
        currentUser.displayName || currentUser.name || 'Guru',
        currentUser.role || 'Homeroom Teacher',
        finalComment.trim()
      );

      await onRefreshData();
      toast.success('General Comments berhasil diajukan untuk review.');
    } catch (err: any) {
      console.error(err);
      toast.error('Gagal mengajukan review: ' + (err.message || 'Error'));
    } finally {
      setSubmittingForReview(false);
    }
  };

  const wordCount = countWords(finalComment);
  const isWordCountExceeded = wordCount > 120;

  return (
    <div className="space-y-6">
      {!canEdit && (
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2.5 text-xs text-amber-900 font-medium">
          <Lock size={16} className="text-amber-600 shrink-0" />
          <span>
            Hanya <strong>Wali Kelas</strong> dari kelas ini atau <strong>Kepala Sekolah / Super Admin</strong> yang dapat mengedit dan memfinalisasi General Comments. Anda dalam mode lihat (Read-Only).
          </span>
        </div>
      )}

      {/* Main Grid: Student Selector Sidebar + Comment Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Students List (4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
              Daftar Siswa ({safeStudents.length})
            </h3>
            <span className="text-[11px] text-slate-500 font-medium">
              Pilih siswa
            </span>
          </div>

          <div className="space-y-1.5 max-h-[620px] overflow-y-auto pr-1">
            {safeStudents.map((student, idx) => {
              if (!student) return null;
              const sData = safeStudentDataMap[student.id];
              const gc = sData?.generalComment;
              const hasFinal = Boolean(gc?.finalComment?.trim());
              const isMarkedFinal = Boolean(gc?.isFinal);
              const isSelected = student.id === selectedStudent?.id;

              return (
                <button
                  key={student.id}
                  onClick={() => setSelectedStudentId(student.id)}
                  className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between gap-2.5 cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 text-white shadow-sm ring-2 ring-slate-900/10'
                      : 'bg-slate-50 text-slate-800 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black shrink-0 ${
                        isSelected ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <div className="truncate">
                      <div className="text-xs font-bold uppercase truncate">{student.name}</div>
                      <div className={`text-[10px] ${isSelected ? 'text-slate-400' : 'text-slate-500'}`}>
                        NISN: {student.nisn || (student as any).nis || '-'}
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0">
                    {(() => {
                      const reviewStatus: MidtermGenComReviewStatus = sData?.generalCommentReviewStatus || 'DRAFT';
                      if (reviewStatus === 'APPROVED') {
                        return (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-100 text-emerald-800">
                            <Check size={10} /> Disetujui
                          </span>
                        );
                      } else if (reviewStatus === 'SUBMITTED_FOR_REVIEW') {
                        return (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-amber-100 text-amber-800 animate-pulse">
                            Review
                          </span>
                        );
                      } else if (reviewStatus === 'REVISION_REQUESTED') {
                        return (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-rose-100 text-rose-800">
                            Revisi
                          </span>
                        );
                      } else {
                        return (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-slate-200 text-slate-600">
                            {hasFinal ? 'Draft' : 'Kosong'}
                          </span>
                        );
                      }
                    })()}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Editor Panel (8 cols) */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
          {/* Header Info */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <UserIcon className="text-emerald-600" size={18} />
                <h3 className="text-base font-extrabold text-slate-900 uppercase">
                  {selectedStudent?.name || 'Pilih Siswa'}
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Input narasi perkembangan akademik & karakter siswa untuk Midterm Report.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {(() => {
                if (currentReviewStatus === 'APPROVED') {
                  return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-100 text-emerald-800">
                      <CheckCircle2 size={14} /> DISETUJUI
                    </span>
                  );
                } else if (currentReviewStatus === 'SUBMITTED_FOR_REVIEW') {
                  return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider bg-amber-100 text-amber-800 animate-pulse">
                      <Clock size={14} /> MENUNGGU REVIEW KEPALA SEKOLAH
                    </span>
                  );
                } else if (currentReviewStatus === 'REVISION_REQUESTED') {
                  return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider bg-rose-100 text-rose-800">
                      <AlertCircle size={14} /> PERLU REVISI
                    </span>
                  );
                } else {
                  return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider bg-slate-100 text-slate-600">
                      <AlertCircle size={14} /> DRAFT
                    </span>
                  );
                }
              })()}
            </div>
          </div>

          {/* Conditional Review/Status Banners */}
          {currentReviewStatus === 'SUBMITTED_FOR_REVIEW' && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col gap-1 text-xs text-amber-900 font-medium leading-normal">
              <div className="flex items-center gap-2 font-bold">
                <Clock size={16} className="text-amber-600 shrink-0" />
                <span>Menunggu Review Kepala Sekolah</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                Komentar diajukan pada {studentData?.submittedForReviewAt ? new Date(studentData.submittedForReviewAt).toLocaleString('id-ID') : '-'} oleh {studentData?.submittedForReviewByName || 'Guru'}. Seluruh editor terkunci selama proses review.
              </p>
            </div>
          )}

          {currentReviewStatus === 'REVISION_REQUESTED' && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex flex-col gap-1.5 text-xs text-rose-900 leading-normal">
              <div className="flex items-center gap-2 font-black uppercase text-rose-700 tracking-tight">
                <AlertCircle size={16} className="text-rose-600 shrink-0" />
                <span>Perlu Revisi dari Kepala Sekolah</span>
              </div>
              <div className="bg-white border border-rose-100 rounded-xl p-3 text-xs font-semibold text-rose-800 italic">
                "{studentData?.revisionFeedback || 'Silakan revisi bagian narasi komentar.'}"
              </div>
              <p className="text-[10px] text-slate-400 font-bold mt-1">
                Diminta oleh: {studentData?.revisionRequestedByName || 'Kepala Sekolah'} | Tanggal: {studentData?.revisionRequestedAt ? new Date(studentData.revisionRequestedAt).toLocaleString('id-ID') : '-'}
              </p>
            </div>
          )}

          {currentReviewStatus === 'APPROVED' && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex flex-col gap-1 text-xs text-emerald-900 font-medium leading-normal">
              <div className="flex items-center gap-2 font-black uppercase text-emerald-700 tracking-tight">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                <span>Disetujui oleh Kepala Sekolah</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                Disetujui oleh: {studentData?.approvedByName || 'Kepala Sekolah'} | Tanggal: {studentData?.approvedAt ? new Date(studentData.approvedAt).toLocaleString('id-ID') : '-'}
              </p>
            </div>
          )}

          {/* Student Profile Inputs: Nickname & Gender */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Nama Panggilan (Nickname)
              </label>
              <input
                type="text"
                disabled={isEditorLocked}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Contoh: Budi / Sarah"
                className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Gender (Pronouns He/She)
              </label>
              <div className="flex items-center gap-3 pt-1">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="radio"
                    name="gender"
                    disabled={isEditorLocked}
                    checked={gender === 'MALE'}
                    onChange={() => setGender('MALE')}
                    className="text-slate-900 focus:ring-slate-900"
                  />
                  <span>Laki-laki (He/Him/His)</span>
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="radio"
                    name="gender"
                    disabled={isEditorLocked}
                    checked={gender === 'FEMALE'}
                    onChange={() => setGender('FEMALE')}
                    className="text-slate-900 focus:ring-slate-900"
                  />
                  <span>Perempuan (She/Her/Hers)</span>
                </label>
              </div>
            </div>
          </div>

          {/* 3 Phrase Banks (Strength, Achievement, Needs Improvement) */}
          <div className="space-y-4">
            {/* 1. Strength / Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between pb-1">
                <span className="text-xs font-black text-slate-900 uppercase tracking-wider">
                  1. Strength / Developmental Progress
                </span>
                
                <div className="flex items-center gap-4">
                  {strengthsEnabled && (
                    <span className="text-[11px] font-semibold text-slate-500">
                      {selectedStrengths.length} dipilih
                    </span>
                  )}
                  {canEdit ? (
                    <label className="inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={strengthsEnabled}
                        onChange={async (e) => {
                          const val = e.target.checked;
                          setStrengthsEnabled(val);
                          try {
                            await saveMidtermClassCommentsConfig(
                              selectedClass!.id,
                              academicYear,
                              semester,
                              midtermTerm,
                              { strengthsEnabled: val },
                              currentUser.uid
                            );
                            toast.success(`Kategori Strength berhasil di-${val ? 'aktifkan' : 'nonaktifkan'} untuk kelas ini.`);
                          } catch (err: any) {
                            console.error(err);
                            toast.error('Gagal menyimpan status toggle: ' + err.message);
                          }
                        }}
                        className="sr-only peer"
                      />
                      <div className="relative w-7 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-600"></div>
                      <span className="ms-1.5 text-[10px] font-bold text-slate-500 uppercase">
                        {strengthsEnabled ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </label>
                  ) : (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${strengthsEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
                      {strengthsEnabled ? 'AKTIF' : 'NONAKTIF'}
                    </span>
                  )}
                </div>
              </div>

              {!strengthsEnabled ? (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 italic">
                  Kategori disembunyikan untuk kelas ini.
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {combinedStrengths.map((item) => {
                      const isChecked = selectedStrengths.includes(item);
                      return (
                        <button
                          key={item}
                          type="button"
                          disabled={!canEdit}
                          onClick={() => toggleItem(selectedStrengths, setSelectedStrengths, item)}
                          className={`text-[11px] font-medium px-2.5 py-1.5 rounded-lg border transition-all text-left ${
                            isChecked
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {isChecked ? '✓ ' : '+ '} {item}
                        </button>
                      );
                    })}
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        value={customStrength}
                        onChange={(e) => setCustomStrength(e.target.value)}
                        placeholder="+ Tambah custom strength/progress..."
                        className="flex-1 text-xs p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCustomItem('STRENGTH', customStrength, setCustomStrength, selectedStrengths, setSelectedStrengths);
                          }
                        }}
                      />
                      <button
                        type="button"
                        disabled={!customStrength.trim()}
                        onClick={() => handleAddCustomItem('STRENGTH', customStrength, setCustomStrength, selectedStrengths, setSelectedStrengths)}
                        className="px-3 py-2 bg-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-300 disabled:opacity-50"
                      >
                        Tambah
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* 2. Achievement */}
            <div className="space-y-2">
              <div className="flex items-center justify-between pb-1">
                <span className="text-xs font-black text-slate-900 uppercase tracking-wider">
                  2. Achievement (Prestasi / Pencapaian Tertentu)
                </span>
                
                <div className="flex items-center gap-4">
                  {achievementsEnabled && (
                    <span className="text-[11px] font-semibold text-slate-500">
                      {selectedAchievements.length} dipilih
                    </span>
                  )}
                  {canEdit ? (
                    <label className="inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={achievementsEnabled}
                        onChange={async (e) => {
                          const val = e.target.checked;
                          setAchievementsEnabled(val);
                          try {
                            await saveMidtermClassCommentsConfig(
                              selectedClass!.id,
                              academicYear,
                              semester,
                              midtermTerm,
                              { achievementsEnabled: val },
                              currentUser.uid
                            );
                            toast.success(`Kategori Achievement berhasil di-${val ? 'aktifkan' : 'nonaktifkan'} untuk kelas ini.`);
                          } catch (err: any) {
                            console.error(err);
                            toast.error('Gagal menyimpan status toggle: ' + err.message);
                          }
                        }}
                        className="sr-only peer"
                      />
                      <div className="relative w-7 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-600"></div>
                      <span className="ms-1.5 text-[10px] font-bold text-slate-500 uppercase">
                        {achievementsEnabled ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </label>
                  ) : (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${achievementsEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
                      {achievementsEnabled ? 'AKTIF' : 'NONAKTIF'}
                    </span>
                  )}
                </div>
              </div>

              {!achievementsEnabled ? (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 italic">
                  Kategori disembunyikan untuk kelas ini.
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {combinedAchievements.map((item) => {
                      const isChecked = selectedAchievements.includes(item);
                      return (
                        <button
                          key={item}
                          type="button"
                          disabled={!canEdit}
                          onClick={() => toggleItem(selectedAchievements, setSelectedAchievements, item)}
                          className={`text-[11px] font-medium px-2.5 py-1.5 rounded-lg border transition-all text-left ${
                            isChecked
                              ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {isChecked ? '✓ ' : '+ '} {item}
                        </button>
                      );
                    })}
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        value={customAchievement}
                        onChange={(e) => setCustomAchievement(e.target.value)}
                        placeholder="+ Tambah custom achievement..."
                        className="flex-1 text-xs p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCustomItem('ACHIEVEMENT', customAchievement, setCustomAchievement, selectedAchievements, setSelectedAchievements);
                          }
                        }}
                      />
                      <button
                        type="button"
                        disabled={!customAchievement.trim()}
                        onClick={() => handleAddCustomItem('ACHIEVEMENT', customAchievement, setCustomAchievement, selectedAchievements, setSelectedAchievements)}
                        className="px-3 py-2 bg-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-300 disabled:opacity-50"
                      >
                        Tambah
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* 3. Needs Improvement */}
            <div className="space-y-2">
              <div className="flex items-center justify-between pb-1">
                <span className="text-xs font-black text-slate-900 uppercase tracking-wider">
                  3. Needs Improvement (Area Pengembangan)
                </span>
                
                <div className="flex items-center gap-4">
                  {needsImprovementEnabled && (
                    <span className="text-[11px] font-semibold text-slate-500">
                      {selectedNeedsImprovement.length} dipilih
                    </span>
                  )}
                  {canEdit ? (
                    <label className="inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={needsImprovementEnabled}
                        onChange={async (e) => {
                          const val = e.target.checked;
                          setNeedsImprovementEnabled(val);
                          try {
                            await saveMidtermClassCommentsConfig(
                              selectedClass!.id,
                              academicYear,
                              semester,
                              midtermTerm,
                              { needsImprovementEnabled: val },
                              currentUser.uid
                            );
                            toast.success(`Kategori Needs Improvement berhasil di-${val ? 'aktifkan' : 'nonaktifkan'} untuk kelas ini.`);
                          } catch (err: any) {
                            console.error(err);
                            toast.error('Gagal menyimpan status toggle: ' + err.message);
                          }
                        }}
                        className="sr-only peer"
                      />
                      <div className="relative w-7 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-600"></div>
                      <span className="ms-1.5 text-[10px] font-bold text-slate-500 uppercase">
                        {needsImprovementEnabled ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </label>
                  ) : (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${needsImprovementEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
                      {needsImprovementEnabled ? 'AKTIF' : 'NONAKTIF'}
                    </span>
                  )}
                </div>
              </div>

              {!needsImprovementEnabled ? (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 italic">
                  Kategori disembunyikan untuk kelas ini.
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {combinedNeedsImprovement.map((item) => {
                      const isChecked = selectedNeedsImprovement.includes(item);
                      return (
                        <button
                          key={item}
                          type="button"
                          disabled={!canEdit}
                          onClick={() => toggleItem(selectedNeedsImprovement, setSelectedNeedsImprovement, item)}
                          className={`text-[11px] font-medium px-2.5 py-1.5 rounded-lg border transition-all text-left ${
                            isChecked
                              ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {isChecked ? '✓ ' : '+ '} {item}
                        </button>
                      );
                    })}
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        value={customNeed}
                        onChange={(e) => setCustomNeed(e.target.value)}
                        placeholder="+ Tambah custom improvement..."
                        className="flex-1 text-xs p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCustomItem('NEED', customNeed, setCustomNeed, selectedNeedsImprovement, setSelectedNeedsImprovement);
                          }
                        }}
                      />
                      <button
                        type="button"
                        disabled={!customNeed.trim()}
                        onClick={() => handleAddCustomItem('NEED', customNeed, setCustomNeed, selectedNeedsImprovement, setSelectedNeedsImprovement)}
                        className="px-3 py-2 bg-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-300 disabled:opacity-50"
                      >
                        Tambah
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Manual Notes */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase">
                Catatan Tambahan Guru (Opsional)
              </label>
              <textarea
                disabled={isEditorLocked}
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                rows={2}
                placeholder="Tambahkan observasi khusus dari wali kelas..."
                className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-100"
              />
            </div>
          </div>

          {/* AI Generator Action Button */}
          {canEdit && !isEditorLocked && (
            <div className="pt-2">
              <button
                type="button"
                onClick={handleGenerateAI}
                disabled={generatingAI || isEditorLocked}
                className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm hover:from-emerald-700 hover:to-teal-700 transition-all disabled:opacity-50 cursor-pointer"
              >
                <Sparkles size={16} className={generatingAI ? 'animate-spin' : ''} />
                {generatingAI ? 'Sedang Menyusun dengan AI...' : 'Generate Komentar dengan AI (Gemini)'}
              </button>
            </div>
          )}

          {/* AI Draft Display (if exists) */}
          {aiDraft && (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                  Draf AI Terakhir
                </span>
                {!isEditorLocked && (
                  <button
                    onClick={() => setFinalComment(aiDraft)}
                    className="text-[11px] text-emerald-600 font-bold hover:underline"
                  >
                    Salin ke Final Comment
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-700 italic leading-relaxed">
                "{aiDraft}"
              </p>
            </div>
          )}

          {/* Final Comment Textarea & Polish with AI */}
          <div className="space-y-2 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-black text-slate-900 uppercase tracking-wider">
                Final Comment (Dicetak pada Rapor)
              </label>

              <div className="flex items-center gap-3">
                <span
                  className={`text-xs font-bold ${
                    isWordCountExceeded ? 'text-rose-600 font-black' : 'text-slate-500'
                  }`}
                >
                  {wordCount} / 120 kata {isWordCountExceeded && '(Melebihi batas maksimal 120 kata!)'}
                </span>

                {canEdit && !isEditorLocked && (
                  <button
                    type="button"
                    onClick={handlePolishAI}
                    disabled={polishingAI || !finalComment.trim() || isEditorLocked}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-teal-50 text-teal-700 border border-teal-200 rounded-lg text-xs font-bold hover:bg-teal-100 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <Wand2 size={13} className={polishingAI ? 'animate-spin' : ''} />
                    {polishingAI ? 'Merapikan...' : 'Rapikan dengan AI'}
                  </button>
                )}
              </div>
            </div>

            <textarea
              disabled={isEditorLocked}
              value={finalComment}
              onChange={(e) => setFinalComment(e.target.value)}
              rows={4}
              placeholder="Tulis narasi komentar atau gunakan hasil generate AI di atas..."
              className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-100 leading-relaxed font-sans"
            />
          </div>

          {/* Action Footer: State-based workflow buttons */}
          {canEdit && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
              <div className="text-slate-500 text-xs font-semibold">
                Status: <span className="font-bold text-slate-800">{currentReviewStatus.replace(/_/g, ' ')}</span>
              </div>

              <div className="flex items-center gap-2">
                {currentReviewStatus === 'DRAFT' && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleSave(false)}
                      disabled={saving}
                      className="px-4 py-2 bg-slate-100 text-slate-800 hover:bg-slate-200 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                    >
                      <Save size={13} />
                      {saving ? 'Menyimpan...' : 'Simpan Draf'}
                    </button>

                    <button
                      type="button"
                      onClick={handleSubmitForReview}
                      disabled={saving || submittingForReview || !finalComment.trim() || isWordCountExceeded}
                      className="px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50 cursor-pointer"
                    >
                      <CheckCircle2 size={14} />
                      {submittingForReview ? 'Mengajukan...' : 'Ajukan untuk Review'}
                    </button>
                  </>
                )}

                {currentReviewStatus === 'SUBMITTED_FOR_REVIEW' && (
                  <button
                    type="button"
                    disabled
                    className="px-4 py-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all"
                  >
                    <Clock size={13} />
                    Menunggu Review Kepala Sekolah
                  </button>
                )}

                {currentReviewStatus === 'REVISION_REQUESTED' && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleSave(false)}
                      disabled={saving}
                      className="px-4 py-2 bg-slate-100 text-slate-800 hover:bg-slate-200 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                    >
                      <Save size={13} />
                      {saving ? 'Menyimpan...' : 'Simpan Draf Revisi'}
                    </button>

                    <button
                      type="button"
                      onClick={handleSubmitForReview}
                      disabled={saving || submittingForReview || !finalComment.trim() || isWordCountExceeded}
                      className="px-4 py-2 bg-rose-600 text-white hover:bg-rose-700 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50 cursor-pointer"
                    >
                      <CheckCircle2 size={14} />
                      {submittingForReview ? 'Mengajukan Ulang...' : 'Ajukan Ulang untuk Review'}
                    </button>
                  </>
                )}

                {currentReviewStatus === 'APPROVED' && (
                  <button
                    type="button"
                    disabled
                    className="px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all"
                  >
                    <CheckCircle2 size={13} />
                    Disetujui - Terkunci
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
