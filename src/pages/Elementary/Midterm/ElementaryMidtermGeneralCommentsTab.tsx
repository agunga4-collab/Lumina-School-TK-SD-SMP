import * as React from 'react';
import { 
  Sparkles, Save, CheckCircle2, AlertCircle, Wand2, 
  Plus, X, Lock, RefreshCw, Check, Clock, MessageSquare, ShieldCheck, User as UserIcon, Upload
} from 'lucide-react';
import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
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

  // Import from Sheets states
  interface ImportRow {
    index: number;
    rawName: string;
    rawNickname: string;
    rawComment: string;
    status: 'VALID' | 'NAMA_TIDAK_DITEMUKAN' | 'AMBIGU' | 'KOMENTAR_KOSONG' | 'SUDAH_ADA_DRAFT' | 'WORKFLOW_LOCKED';
    matchedStudent: Student | null;
    existingStatus?: string;
    checked: boolean;
  }

  const [isImportModalOpen, setIsImportModalOpen] = React.useState<boolean>(false);
  const [rawInput, setRawInput] = React.useState<string>('');
  const [parsedRows, setParsedRows] = React.useState<ImportRow[]>([]);
  const [allowOverwrite, setAllowOverwrite] = React.useState<boolean>(false);
  const [importing, setImporting] = React.useState<boolean>(false);

  const handleParseInput = () => {
    if (!rawInput.trim()) {
      toast.error('Silakan paste data terlebih dahulu.');
      return;
    }

    const lines = rawInput.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
    if (lines.length === 0) {
      toast.error('Tidak ada data yang ditemukan.');
      return;
    }

    // Try splitting by tab first, fallback to comma/semicolon if tab doesn't produce multiple columns
    let isTsv = true;
    let headers = lines[0].split('\t');
    if (headers.length <= 1) {
      headers = lines[0].split(/,|;/);
      isTsv = false;
    }

    // Normalise helpers
    const cleanHeader = (h: string) => h.trim().toLowerCase().replace(/[\s_\-]/g, '');
    const isFullnameHeader = (h: string) => ['namalengkap', 'fullname', 'nama', 'studentname'].includes(cleanHeader(h));
    const isNicknameHeader = (h: string) => ['namapanggilan', 'nickname', 'nicknam', 'nickname'].includes(cleanHeader(h));
    const isCommentHeader = (h: string) => ['komentar', 'narrativereport', 'narrative', 'generalcomment', 'catatanperkembangan', 'finalcomment'].includes(cleanHeader(h));

    let fullnameIndex = -1;
    let nicknameIndex = -1;
    let commentIndex = -1;

    // Search header row
    headers.forEach((h, idx) => {
      if (isFullnameHeader(h)) fullnameIndex = idx;
      else if (isNicknameHeader(h)) nicknameIndex = idx;
      else if (isCommentHeader(h)) commentIndex = idx;
    });

    let dataLines = lines.slice(1);
    
    // If no header detected, alert and stop
    if (fullnameIndex === -1 || commentIndex === -1) {
      toast.error("Header kolom tidak terdeteksi. Pastikan baris pertama tabel memiliki judul 'Nama Lengkap' dan 'Komentar'.");
      return;
    }

    const normalizeName = (n: string) => {
      if (!n) return '';
      return n.trim().toLowerCase().replace(/\s+/g, ' ');
    };

    const rows: ImportRow[] = dataLines.map((line, idx) => {
      const cells = isTsv ? line.split('\t') : line.split(/,|;/);
      const rawName = (cells[fullnameIndex] || '').trim();
      const rawNickname = nicknameIndex !== -1 ? (cells[nicknameIndex] || '').trim() : '';
      const rawComment = (cells[commentIndex] || '').trim();

      let status: ImportRow['status'] = 'VALID';
      let matchedStudent: Student | null = null;
      let existingStatus = 'DRAFT';

      const targetNormal = normalizeName(rawName);
      const matches = safeStudents.filter(s => normalizeName(s.name) === targetNormal);

      if (matches.length === 1) {
        matchedStudent = matches[0];
      } else if (matches.length > 1) {
        status = 'AMBIGU';
      } else {
        status = 'NAMA_TIDAK_DITEMUKAN';
      }

      if (status === 'VALID' && !rawComment) {
        status = 'KOMENTAR_KOSONG';
      }

      if (status === 'VALID' && matchedStudent) {
        const sData = safeStudentDataMap[matchedStudent.id];
        const existingComment = sData?.generalComment?.finalComment || sData?.generalComment?.aiDraft;
        const reviewStatus = sData?.generalCommentReviewStatus || 'DRAFT';
        existingStatus = reviewStatus;

        if (existingComment) {
          if (reviewStatus === 'DRAFT' || reviewStatus === 'REVISION_REQUESTED') {
            status = 'SUDAH_ADA_DRAFT';
          } else {
            status = 'WORKFLOW_LOCKED';
          }
        }
      }

      return {
        index: idx + 2, // Excel row index is 1-based and includes header (idx + 2)
        rawName,
        rawNickname,
        rawComment,
        status,
        matchedStudent,
        existingStatus,
        checked: status === 'VALID'
      };
    });

    setParsedRows(rows);
    toast.success(`Berhasil memproses ${rows.length} baris.`);
  };

  const handleSaveImport = async () => {
    const selectedRows = parsedRows.filter(r => r.checked && (r.status === 'VALID' || (allowOverwrite && r.status === 'SUDAH_ADA_DRAFT')));
    if (selectedRows.length === 0) {
      toast.error('Tidak ada baris valid yang dicentang.');
      return;
    }

    setImporting(true);
    let successCount = 0;

    try {
      // Firebase Firestore limits batch to 500 writes
      const batchSize = 400;
      for (let i = 0; i < selectedRows.length; i += batchSize) {
        const chunk = selectedRows.slice(i, i + batchSize);
        const batch = writeBatch(db);

        chunk.forEach(row => {
          if (!row.matchedStudent) return;
          const docId = `${row.matchedStudent.id}_${selectedYear.replace(/\//g, '_')}_S${selectedSemester}_T${selectedTerm}`;
          const docRef = doc(db, 'elem_midterm_student_data', docId);

          const existingData = safeStudentDataMap[row.matchedStudent.id];
          const newPayload: any = {
            id: docId,
            studentId: row.matchedStudent.id,
            studentName: row.matchedStudent.name,
            classId: selectedClassId,
            academicYear: selectedYear,
            semester: selectedSemester,
            midtermTerm: selectedTerm,
            generalComment: {
              studentName: row.matchedStudent.name,
              nickname: row.rawNickname.trim() || row.matchedStudent.nickname || row.matchedStudent.name.split(' ')[0],
              finalComment: row.rawComment.trim(),
              isFinal: false,
              strengths: existingData?.generalComment?.strengths || [],
              achievements: existingData?.generalComment?.achievements || [],
              needsImprovement: existingData?.generalComment?.needsImprovement || [],
              manualNotes: existingData?.generalComment?.manualNotes || '',
              aiDraft: existingData?.generalComment?.aiDraft || '',
            },
            generalCommentReviewStatus: 'DRAFT',
            updatedAt: Date.now(),
            updatedBy: currentUser?.uid || (currentUser as any)?.id || 'system'
          };

          batch.set(docRef, newPayload, { merge: true });
        });

        await batch.commit();
        successCount += chunk.length;
      }

      toast.success(`Berhasil mengimpor ${successCount} komentar sebagai DRAFT.`);
      setIsImportModalOpen(false);
      setParsedRows([]);
      setRawInput('');
      await onRefreshData();
    } catch (err: any) {
      console.error(err);
      toast.error('Gagal memproses import: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

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
        <div className="flex flex-col gap-2.5 pb-3 border-b border-slate-100 mb-3 px-1">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <UserIcon size={16} className="text-emerald-600" />
              <span>Daftar Siswa ({safeStudents.length})</span>
            </h3>
          </div>
          {canEdit && (
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="w-full py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 hover:border-emerald-300 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <Upload size={14} />
              <span>Import dari Google Sheets</span>
            </button>
          )}
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

      {/* Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-[2rem] w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="p-2.5 bg-emerald-100 text-emerald-800 rounded-2xl flex items-center justify-center shadow-2xs">
                  <Upload size={18} />
                </span>
                <div>
                  <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Import General Comments</h3>
                  <p className="text-[11px] text-slate-500 font-bold mt-0.5 uppercase tracking-wide">
                    Copy-Paste dari Google Sheets / Excel
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsImportModalOpen(false);
                  setParsedRows([]);
                  setRawInput('');
                }}
                className="p-2 hover:bg-slate-200 text-slate-400 hover:text-slate-700 rounded-xl transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              {parsedRows.length === 0 ? (
                /* Step 1: Input Area */
                <div className="space-y-4">
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-800 text-xs font-medium space-y-1.5 leading-relaxed">
                    <p className="font-extrabold uppercase tracking-wide flex items-center gap-1.5">
                      <AlertCircle size={14} />
                      Petunjuk Format Tabel:
                    </p>
                    <p>
                      Pastikan tabel Anda memiliki baris header (judul kolom) di bagian paling atas dengan kolom minimal wajib:
                    </p>
                    <ul className="list-disc pl-5 font-bold space-y-0.5">
                      <li>Nama Lengkap (atau: Full Name, Nama, Student Name)</li>
                      <li>Komentar (atau: Narrative Report, Narrative, General Comment, Catatan Perkembangan, Final Comment)</li>
                    </ul>
                    <p>Kolom opsional: <strong>Nama Panggilan</strong> (atau: Nickname, Nick Name).</p>
                    <p>Contoh: Salin (Ctrl+C) seluruh baris dan kolom tabel Anda dari Google Sheets, lalu tempel (Ctrl+V) di area bawah.</p>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">
                      Area Paste Data
                    </label>
                    <textarea
                      value={rawInput}
                      onChange={(e) => setRawInput(e.target.value)}
                      placeholder="Tempel (Paste) baris-baris tabel Google Sheets Anda di sini..."
                      rows={10}
                      className="w-full text-xs p-4 bg-slate-50 border border-slate-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-mono leading-relaxed"
                    />
                  </div>

                  <div className="flex items-center justify-end">
                    <button
                      onClick={handleParseInput}
                      className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold uppercase tracking-wider rounded-2xl shadow-sm cursor-pointer transition-all"
                    >
                      Proses & Pratinjau
                    </button>
                  </div>
                </div>
              ) : (
                /* Step 2: Preview Area */
                <div className="space-y-6">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
                      <span className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Total Baris</span>
                      <strong className="text-lg font-black text-slate-900">{parsedRows.length}</strong>
                    </div>
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
                      <span className="block text-[10px] font-extrabold text-emerald-600 uppercase tracking-wider">Valid</span>
                      <strong className="text-lg font-black text-emerald-800">
                        {parsedRows.filter(r => r.status === 'VALID').length}
                      </strong>
                    </div>
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-center">
                      <span className="block text-[10px] font-extrabold text-amber-600 uppercase tracking-wider">Sudah Ada Draft</span>
                      <strong className="text-lg font-black text-amber-800">
                        {parsedRows.filter(r => r.status === 'SUDAH_ADA_DRAFT').length}
                      </strong>
                    </div>
                    <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-center">
                      <span className="block text-[10px] font-extrabold text-rose-600 uppercase tracking-wider">Tidak Cocok</span>
                      <strong className="text-lg font-black text-rose-800">
                        {parsedRows.filter(r => r.status === 'NAMA_TIDAK_DITEMUKAN').length}
                      </strong>
                    </div>
                    <div className="p-3 bg-slate-100 border border-slate-200 rounded-xl text-center">
                      <span className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Ambigu</span>
                      <strong className="text-lg font-black text-slate-700">
                        {parsedRows.filter(r => r.status === 'AMBIGU').length}
                      </strong>
                    </div>
                    <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-center">
                      <span className="block text-[10px] font-extrabold text-rose-600 tracking-wider">Terkunci</span>
                      <strong className="text-lg font-black text-rose-800">
                        {parsedRows.filter(r => r.status === 'WORKFLOW_LOCKED').length}
                      </strong>
                    </div>
                  </div>

                  {/* Overwrite Choice */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-tight">Opsi Penanganan Data Ganda:</h4>
                      <p className="text-[10px] font-medium text-slate-500 mt-0.5">Tentukan tindakan jika siswa di kelas aktif sudah memiliki catatan komentar.</p>
                    </div>

                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                        <input
                          type="radio"
                          name="overwriteOption"
                          checked={!allowOverwrite}
                          onChange={() => {
                            setAllowOverwrite(false);
                            // Uncheck all SUDAH_ADA_DRAFT
                            setParsedRows(prev => prev.map(r => r.status === 'SUDAH_ADA_DRAFT' ? { ...r, checked: false } : r));
                          }}
                          className="text-emerald-600 focus:ring-emerald-500"
                        />
                        <span>Lewati komentar yang sudah ada (Default)</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                        <input
                          type="radio"
                          name="overwriteOption"
                          checked={allowOverwrite}
                          onChange={() => {
                            setAllowOverwrite(true);
                            // Auto check all SUDAH_ADA_DRAFT as option is chosen
                            setParsedRows(prev => prev.map(r => r.status === 'SUDAH_ADA_DRAFT' ? { ...r, checked: true } : r));
                          }}
                          className="text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-rose-600">Timpa draft yang sudah ada</span>
                      </label>
                    </div>
                  </div>

                  {/* Preview Table */}
                  <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-[400px] overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500 sticky top-0 z-10">
                          <th className="p-3 w-12 text-center bg-slate-50">
                            <input
                              type="checkbox"
                              checked={parsedRows.every(r => {
                                if (r.status === 'VALID') return r.checked;
                                if (r.status === 'SUDAH_ADA_DRAFT' && allowOverwrite) return r.checked;
                                return true;
                              }) && parsedRows.some(r => r.checked)}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setParsedRows(prev => prev.map(r => {
                                  if (r.status === 'VALID' || (r.status === 'SUDAH_ADA_DRAFT' && allowOverwrite)) {
                                    return { ...r, checked };
                                  }
                                  return r;
                                }));
                              }}
                              className="rounded text-emerald-600 focus:ring-emerald-500"
                            />
                          </th>
                          <th className="p-3 w-12 text-center bg-slate-50">Baris</th>
                          <th className="p-3 bg-slate-50">Nama di Sheet</th>
                          <th className="p-3 bg-slate-50">Siswa Hasil Cocok</th>
                          <th className="p-3 bg-slate-50">Status</th>
                          <th className="p-3 bg-slate-50">Preview Komentar</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {parsedRows.map((row) => {
                          let statusText = 'Valid';
                          let badgeColor = 'bg-emerald-50 text-emerald-700 border border-emerald-100';
                          
                          if (row.status === 'NAMA_TIDAK_DITEMUKAN') {
                            statusText = 'Nama Tidak Ditemukan';
                            badgeColor = 'bg-rose-50 text-rose-700 border border-rose-100';
                          } else if (row.status === 'AMBIGU') {
                            statusText = 'Nama Ambigu';
                            badgeColor = 'bg-amber-50 text-amber-700 border border-amber-100';
                          } else if (row.status === 'KOMENTAR_KOSONG') {
                            statusText = 'Komentar Kosong';
                            badgeColor = 'bg-slate-50 text-slate-500 border border-slate-200';
                          } else if (row.status === 'SUDAH_ADA_DRAFT') {
                            statusText = `Sudah Ada Draft (${row.existingStatus})`;
                            badgeColor = 'bg-amber-50 text-amber-700 border border-amber-100';
                          } else if (row.status === 'WORKFLOW_LOCKED') {
                            statusText = `Locked (${row.existingStatus})`;
                            badgeColor = 'bg-rose-100 text-rose-800 border border-rose-200';
                          }

                          const canCheck = row.status === 'VALID' || (row.status === 'SUDAH_ADA_DRAFT' && allowOverwrite);

                          return (
                            <tr key={row.index} className="hover:bg-slate-50/50">
                              <td className="p-3 text-center">
                                <input
                                  type="checkbox"
                                  disabled={!canCheck}
                                  checked={row.checked}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setParsedRows(prev => prev.map(r => r.index === row.index ? { ...r, checked } : r));
                                  }}
                                  className="rounded text-emerald-600 focus:ring-emerald-500 disabled:opacity-30"
                                />
                              </td>
                              <td className="p-3 text-center font-bold text-slate-400">{row.index}</td>
                              <td className="p-3 font-semibold text-slate-800">{row.rawName}</td>
                              <td className="p-3 font-bold text-emerald-900">
                                {row.matchedStudent ? row.matchedStudent.name : <span className="text-slate-400 font-normal italic">-</span>}
                              </td>
                              <td className="p-3">
                                <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg ${badgeColor} uppercase tracking-wider`}>
                                  {statusText}
                                </span>
                              </td>
                              <td className="p-3 max-w-xs truncate text-slate-600 animate-pulse" title={row.rawComment}>
                                {row.rawComment}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                    <button
                      onClick={() => {
                        setParsedRows([]);
                        setRawInput('');
                      }}
                      className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                    >
                      Kembali / Edit Input
                    </button>

                    <button
                      onClick={handleSaveImport}
                      disabled={importing || !parsedRows.some(r => r.checked)}
                      className="px-6 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {importing ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : (
                        <Check size={14} />
                      )}
                      <span>Simpan ({parsedRows.filter(r => r.checked).length} Komentar)</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
