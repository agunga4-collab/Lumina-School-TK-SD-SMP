import * as React from 'react';
import { 
  MessageSquare, Sparkles, Wand2, Save, Send, CheckCircle2, 
  AlertCircle, RefreshCw, Users, FileText, Check, X, Lock, 
  Unlock, ShieldCheck, Clock, RotateCcw, Upload, HelpCircle, Heart, BookOpen
} from 'lucide-react';
import type { 
  ElementaryMonthlyCurriculumDoc,
  ElementaryMonthlyStudentScoreDoc,
  ElementaryMonthlyStudentNarrativeDoc,
  ElementaryMonthlyReviewStatus
} from '../../../../types/elementaryMonthlyReport';
import { calculateLGAverageAndPredicate } from '../../../../types/elementaryMonthlyReport';
import type { Student, Class, User } from '../../../../types';
import { 
  fetchElementaryMonthlyStudentNarratives,
  saveElementaryMonthlyStudentNarrativeDoc,
  submitElementaryMonthlyNarrativeForReview,
  bulkSubmitElementaryMonthlyNarratives,
  reviewElementaryMonthlyNarrative,
  bulkApproveElementaryMonthlyNarratives,
  unlockElementaryMonthlyNarrativeForEdit,
  computeStudentScoresHash,
  isElementaryHeadOrSuperAdmin,
  generateElementaryMonthlyAcademicCommentAI,
  generateElementaryMonthlySelProfileAI,
  refineElementaryMonthlyNarrativeAI
} from '../../../../services/elementaryMonthlyReportService';
import { toast } from 'sonner';

interface NarrativeAndApprovalTabProps {
  curriculumDoc: ElementaryMonthlyCurriculumDoc | null;
  studentScoresMap: Record<string, ElementaryMonthlyStudentScoreDoc>;
  students: Student[];
  selectedClass: Class | null;
  selectedYear: string;
  selectedSemester: string;
  selectedMonth: string;
  monthLabel: string;
  currentUser: User | null;
  onRefreshData?: () => Promise<void>;
}

export const NarrativeAndApprovalTab: React.FC<NarrativeAndApprovalTabProps> = ({
  curriculumDoc,
  studentScoresMap,
  students,
  selectedClass,
  selectedYear,
  selectedSemester,
  selectedMonth,
  monthLabel,
  currentUser
}) => {
  const classId = selectedClass?.id || '';
  const canReview = isElementaryHeadOrSuperAdmin(currentUser);

  // Narratives Map
  const [narrativesMap, setNarrativesMap] = React.useState<Record<string, ElementaryMonthlyStudentNarrativeDoc>>({});
  const [loadingNarratives, setLoadingNarratives] = React.useState<boolean>(false);

  // Active Selected Student
  const [activeStudentId, setActiveStudentId] = React.useState<string>(students[0]?.id || '');
  const activeStudent = students.find(s => s.id === activeStudentId) || students[0] || null;

  // Active Student Form States
  const activeNarrative = activeStudent ? narrativesMap[activeStudent.id] : null;
  const [academicComment, setAcademicComment] = React.useState<string>('');
  const [selProfile, setSelProfile] = React.useState<string>('');
  const [savingNarrative, setSavingNarrative] = React.useState<boolean>(false);

  // Status and Stale Source Detection
  const currentStatus: ElementaryMonthlyReviewStatus = activeNarrative?.reviewStatus || 'DRAFT';
  const isLocked = currentStatus === 'SUBMITTED' || currentStatus === 'APPROVED';

  const activeScoresDoc = activeStudent ? studentScoresMap[activeStudent.id] || null : null;
  const currentScoresHash = React.useMemo(() => computeStudentScoresHash(activeScoresDoc), [activeScoresDoc]);
  const isScoresStale = React.useMemo(() => {
    if (!activeNarrative || currentStatus === 'DRAFT') return false;
    if (activeNarrative.isSourceStale) return true;
    if (activeNarrative.lastScoresHash && activeNarrative.lastScoresHash !== currentScoresHash) {
      return true;
    }
    return false;
  }, [activeNarrative, currentStatus, currentScoresHash]);

  // AI Helper States for Academic Comments
  const [isAcademicAiOpen, setIsAcademicAiOpen] = React.useState<boolean>(false);
  const [academicTeacherNotes, setAcademicTeacherNotes] = React.useState<string>('');
  const [generatingAcademicAi, setGeneratingAcademicAi] = React.useState<boolean>(false);
  const [refiningAcademicAi, setRefiningAcademicAi] = React.useState<boolean>(false);
  const [academicAiDraft, setAcademicAiDraft] = React.useState<string>('');

  // AI Helper States for SEL Profile
  const [isSelAiOpen, setIsSelAiOpen] = React.useState<boolean>(false);
  const [selFocusAreas, setSelFocusAreas] = React.useState<string[]>([
    'Kemandirian & Tanggung Jawab',
    'Kolaborasi & Kerja Sama'
  ]);
  const [selObservations, setSelObservations] = React.useState<string>('');
  const [generatingSelAi, setGeneratingSelAi] = React.useState<boolean>(false);
  const [refiningSelAi, setRefiningSelAi] = React.useState<boolean>(false);
  const [selAiDraft, setSelAiDraft] = React.useState<string>('');

  // Review Revision Modal State
  const [isRevisionModalOpen, setIsRevisionModalOpen] = React.useState<boolean>(false);
  const [revisionNotesInput, setRevisionNotesInput] = React.useState<string>('');
  const [processingReview, setProcessingReview] = React.useState<boolean>(false);

  // Paste / Bulk Import Modal
  const [isImportModalOpen, setIsImportModalOpen] = React.useState<boolean>(false);
  const [importRawText, setImportRawText] = React.useState<string>('');
  const [importTargetType, setImportTargetType] = React.useState<'both' | 'academic' | 'sel'>('both');

  // Filter & Search
  const [statusFilter, setStatusFilter] = React.useState<string>('ALL');
  const [searchStudent, setSearchStudent] = React.useState<string>('');

  // Load Narratives
  const loadNarratives = React.useCallback(async () => {
    if (!classId || !selectedYear || !selectedSemester || !selectedMonth) return;
    setLoadingNarratives(true);
    try {
      const data = await fetchElementaryMonthlyStudentNarratives(classId, selectedYear, selectedSemester, selectedMonth);
      setNarrativesMap(data);
    } catch (err) {
      console.error('Error loading narratives:', err);
      toast.error('Gagal memuat narasi siswa.');
    } finally {
      setLoadingNarratives(false);
    }
  }, [classId, selectedYear, selectedSemester, selectedMonth]);

  React.useEffect(() => {
    loadNarratives();
  }, [loadNarratives]);

  // Sync active student form
  React.useEffect(() => {
    if (!activeStudent) return;
    const doc = narrativesMap[activeStudent.id];
    setAcademicComment(doc?.academicComment || '');
    setSelProfile(doc?.selProfile || '');
  }, [activeStudentId, narrativesMap]);

  // Default active student
  React.useEffect(() => {
    if (students.length > 0 && (!activeStudentId || !students.some(s => s.id === activeStudentId))) {
      setActiveStudentId(students[0].id);
    }
  }, [students, activeStudentId]);

  // Computed summary of subjects & LGs for active student (used for AI & preview)
  const studentSubjectSummaries = React.useMemo(() => {
    if (!curriculumDoc || !curriculumDoc.subjects || !activeScoresDoc) return [];
    return curriculumDoc.subjects.map(sub => {
      const lgTitles = (sub.learningGoals || []).map(lg => lg.title);
      // Calculate overall average for subject
      let allLOs: any[] = [];
      (sub.learningGoals || []).forEach(lg => {
        allLOs = allLOs.concat(lg.learningObjectives || []);
      });
      const res = calculateLGAverageAndPredicate(activeScoresDoc.scores || {}, allLOs, sub.kkm);
      return {
        subjectName: sub.name,
        lgTitles,
        average: res.average,
        predicate: res.predicate
      };
    });
  }, [curriculumDoc, activeScoresDoc]);

  // Save Narrative as Draft
  const handleSaveDraft = async () => {
    if (!activeStudent || !selectedClass) return;
    setSavingNarrative(true);
    try {
      await saveElementaryMonthlyStudentNarrativeDoc({
        studentId: activeStudent.id,
        studentName: activeStudent.name,
        classId,
        academicYear: selectedYear,
        semester: selectedSemester,
        month: selectedMonth,
        academicComment: academicComment.trim(),
        selProfile: selProfile.trim(),
        reviewStatus: activeNarrative?.reviewStatus === 'NEEDS_REVISION' ? 'DRAFT' : (activeNarrative?.reviewStatus || 'DRAFT'),
        lastScoresHash: currentScoresHash,
        isSourceStale: false
      }, currentUser);

      toast.success(`Draf narasi ${activeStudent.name} berhasil disimpan.`);
      await loadNarratives();
    } catch (err: any) {
      console.error('Error saving narrative:', err);
      toast.error('Gagal menyimpan draf: ' + (err.message || ''));
    } finally {
      setSavingNarrative(false);
    }
  };

  // Submit Single Student for Review
  const handleSubmitForReview = async () => {
    if (!activeStudent) return;
    if (!academicComment.trim() || !selProfile.trim()) {
      toast.error('Harap lengkapi Komentar Akademik dan Profil Sosial Emosional sebelum mengajukan review.');
      return;
    }

    setSavingNarrative(true);
    try {
      // First save current edits
      await saveElementaryMonthlyStudentNarrativeDoc({
        studentId: activeStudent.id,
        studentName: activeStudent.name,
        classId,
        academicYear: selectedYear,
        semester: selectedSemester,
        month: selectedMonth,
        academicComment: academicComment.trim(),
        selProfile: selProfile.trim(),
        reviewStatus: 'SUBMITTED',
        lastScoresHash: currentScoresHash,
        isSourceStale: false
      }, currentUser);

      // Submit
      await submitElementaryMonthlyNarrativeForReview({
        studentId: activeStudent.id,
        studentName: activeStudent.name,
        classId,
        academicYear: selectedYear,
        semester: selectedSemester,
        month: selectedMonth,
        currentScoresHash,
        user: currentUser
      });

      toast.success(`Narasi ${activeStudent.name} berhasil diajukan untuk ditinjau Head Unit.`);
      await loadNarratives();
    } catch (err: any) {
      console.error('Error submitting narrative:', err);
      toast.error('Gagal mengajukan narasi: ' + (err.message || ''));
    } finally {
      setSavingNarrative(false);
    }
  };

  // Bulk Submit All Drafts
  const handleBulkSubmitClass = async () => {
    const readyStudents = students.filter(s => {
      const doc = narrativesMap[s.id];
      return doc?.academicComment?.trim() && doc?.selProfile?.trim() && doc?.reviewStatus !== 'APPROVED';
    });

    if (readyStudents.length === 0) {
      toast.error('Tidak ada narasi siswa yang siap diajukan (pastikan kedua narasi sudah terisi).');
      return;
    }

    if (!confirm(`Ajukan narasi review untuk ${readyStudents.length} siswa yang sudah terisi lengkap?`)) {
      return;
    }

    setSavingNarrative(true);
    try {
      const count = await bulkSubmitElementaryMonthlyNarratives({
        classId,
        academicYear: selectedYear,
        semester: selectedSemester,
        month: selectedMonth,
        studentIds: readyStudents.map(s => s.id),
        scoresMap: studentScoresMap,
        user: currentUser
      });

      toast.success(`Berhasil mengajukan ${count} paket narasi siswa untuk ditinjau.`);
      await loadNarratives();
    } catch (err: any) {
      console.error('Error bulk submitting:', err);
      toast.error('Gagal mengajukan massal: ' + (err.message || ''));
    } finally {
      setSavingNarrative(false);
    }
  };

  // Unlock For Edit (Teacher or Head Unit)
  const handleUnlockForEdit = async () => {
    if (!activeStudent) return;
    if (!confirm(`Buka kunci paket narasi ${activeStudent.name}? Status akan kembali ke DRAFT agar dapat diedit.`)) {
      return;
    }

    setSavingNarrative(true);
    try {
      await unlockElementaryMonthlyNarrativeForEdit({
        studentId: activeStudent.id,
        classId,
        academicYear: selectedYear,
        semester: selectedSemester,
        month: selectedMonth,
        user: currentUser
      });

      toast.success(`Paket narasi ${activeStudent.name} telah dibuka kuncinya.`);
      await loadNarratives();
    } catch (err: any) {
      console.error('Error unlocking narrative:', err);
      toast.error('Gagal membuka kunci: ' + (err.message || ''));
    } finally {
      setSavingNarrative(false);
    }
  };

  // Review Action: Approve
  const handleApprove = async () => {
    if (!activeStudent || !canReview) return;
    setProcessingReview(true);
    try {
      await reviewElementaryMonthlyNarrative({
        studentId: activeStudent.id,
        classId,
        academicYear: selectedYear,
        semester: selectedSemester,
        month: selectedMonth,
        action: 'APPROVE',
        reviewer: currentUser
      });

      toast.success(`Paket narasi ${activeStudent.name} disetujui (Approved).`);
      await loadNarratives();
    } catch (err: any) {
      console.error('Error approving:', err);
      toast.error('Gagal menyetujui: ' + (err.message || ''));
    } finally {
      setProcessingReview(false);
    }
  };

  // Review Action: Request Revision
  const handleExecuteRequestRevision = async () => {
    if (!activeStudent || !canReview) return;
    if (!revisionNotesInput.trim()) {
      toast.error('Catatan revisi wajib diisi.');
      return;
    }

    setProcessingReview(true);
    try {
      await reviewElementaryMonthlyNarrative({
        studentId: activeStudent.id,
        classId,
        academicYear: selectedYear,
        semester: selectedSemester,
        month: selectedMonth,
        action: 'REQUEST_REVISION',
        reviewNotes: revisionNotesInput.trim(),
        reviewer: currentUser
      });

      toast.success(`Permintaan revisi untuk ${activeStudent.name} berhasil dikirim ke guru kelas.`);
      setIsRevisionModalOpen(false);
      setRevisionNotesInput('');
      await loadNarratives();
    } catch (err: any) {
      console.error('Error requesting revision:', err);
      toast.error('Gagal meminta revisi: ' + (err.message || ''));
    } finally {
      setProcessingReview(false);
    }
  };

  // Bulk Approve Class
  const handleBulkApproveClass = async () => {
    if (!canReview) return;
    const submittedStudentIds = students
      .filter(s => narrativesMap[s.id]?.reviewStatus === 'SUBMITTED')
      .map(s => s.id);

    if (submittedStudentIds.length === 0) {
      toast.error('Tidak ada narasi berstatus "Diajukan" di kelas ini.');
      return;
    }

    if (!confirm(`Setujui (Approve) sekaligus ${submittedStudentIds.length} narasi siswa yang telah diajukan?`)) {
      return;
    }

    setProcessingReview(true);
    try {
      const count = await bulkApproveElementaryMonthlyNarratives({
        classId,
        academicYear: selectedYear,
        semester: selectedSemester,
        month: selectedMonth,
        studentIds: submittedStudentIds,
        reviewer: currentUser
      });

      toast.success(`Berhasil menyetujui ${count} narasi siswa.`);
      await loadNarratives();
    } catch (err: any) {
      console.error('Error bulk approving:', err);
      toast.error('Gagal menyetujui massal: ' + (err.message || ''));
    } finally {
      setProcessingReview(false);
    }
  };

  // AI Generation Handlers for Academic Comments
  const handleGenerateAcademicAi = async () => {
    if (!activeStudent) return;
    setGeneratingAcademicAi(true);
    try {
      const draft = await generateElementaryMonthlyAcademicCommentAI({
        studentName: activeStudent.name,
        nickname: (activeStudent as any).nickname || '',
        monthLabel,
        gradeLevel: (selectedClass as any)?.gradeLevel || 1,
        subjectSummaries: studentSubjectSummaries,
        teacherNotes: academicTeacherNotes
      });
      setAcademicAiDraft(draft);
      toast.success('Draf komentar akademik berhasil dibuat.');
    } catch (err: any) {
      toast.error('Gagal membuat draf AI: ' + (err.message || ''));
    } finally {
      setGeneratingAcademicAi(false);
    }
  };

  const handleRefineAcademicAi = async () => {
    if (!academicAiDraft.trim() && !academicComment.trim()) return;
    setRefiningAcademicAi(true);
    try {
      const textToRefine = academicAiDraft.trim() || academicComment.trim();
      const refined = await refineElementaryMonthlyNarrativeAI({
        originalText: textToRefine,
        narrativeType: 'academic',
        studentName: activeStudent?.name || '',
        nickname: (activeStudent as any)?.nickname || ''
      });
      setAcademicAiDraft(refined);
      toast.success('Kalimat berhasil dirapikan.');
    } catch (err: any) {
      toast.error('Gagal merapikan draf: ' + (err.message || ''));
    } finally {
      setRefiningAcademicAi(false);
    }
  };

  // AI Generation Handlers for SEL Profile
  const handleGenerateSelAi = async () => {
    if (!activeStudent) return;
    setGeneratingSelAi(true);
    try {
      const draft = await generateElementaryMonthlySelProfileAI({
        studentName: activeStudent.name,
        nickname: (activeStudent as any).nickname || '',
        monthLabel,
        gradeLevel: (selectedClass as any)?.gradeLevel || 1,
        focusAreas: selFocusAreas,
        observations: selObservations
      });
      setSelAiDraft(draft);
      toast.success('Draf profil sosial emosional berhasil dibuat.');
    } catch (err: any) {
      toast.error('Gagal membuat draf SEL: ' + (err.message || ''));
    } finally {
      setGeneratingSelAi(false);
    }
  };

  const handleRefineSelAi = async () => {
    if (!selAiDraft.trim() && !selProfile.trim()) return;
    setRefiningSelAi(true);
    try {
      const textToRefine = selAiDraft.trim() || selProfile.trim();
      const refined = await refineElementaryMonthlyNarrativeAI({
        originalText: textToRefine,
        narrativeType: 'sel',
        studentName: activeStudent?.name || '',
        nickname: (activeStudent as any)?.nickname || ''
      });
      setSelAiDraft(refined);
      toast.success('Kalimat SEL berhasil dirapikan.');
    } catch (err: any) {
      toast.error('Gagal merapikan draf SEL: ' + (err.message || ''));
    } finally {
      setRefiningSelAi(false);
    }
  };

  // Paste / Bulk Import Parser
  const handleProcessImport = async () => {
    if (!importRawText.trim()) {
      toast.error('Teks input impor tidak boleh kosong.');
      return;
    }

    const lines = importRawText.split('\n').map(l => l.trim()).filter(Boolean);
    let matchedCount = 0;

    for (const line of lines) {
      // Split by tab or pipe
      const parts = line.includes('\t') ? line.split('\t') : line.split('|');
      if (parts.length >= 2) {
        const studentQuery = parts[0].trim().toLowerCase();
        const matched = students.find(s => 
          s.name.toLowerCase() === studentQuery || 
          s.name.toLowerCase().includes(studentQuery) ||
          (s.nis && s.nis === parts[0].trim())
        );

        if (matched) {
          matchedCount++;
          const academicPart = parts[1]?.trim() || '';
          const selPart = parts[2]?.trim() || '';

          const existingDoc = narrativesMap[matched.id];
          const payload = {
            studentId: matched.id,
            studentName: matched.name,
            classId,
            academicYear: selectedYear,
            semester: selectedSemester,
            month: selectedMonth,
            academicComment: importTargetType === 'sel' ? (existingDoc?.academicComment || '') : (academicPart || existingDoc?.academicComment || ''),
            selProfile: importTargetType === 'academic' ? (existingDoc?.selProfile || '') : (selPart || existingDoc?.selProfile || ''),
            reviewStatus: existingDoc?.reviewStatus || ('DRAFT' as ElementaryMonthlyReviewStatus)
          };

          await saveElementaryMonthlyStudentNarrativeDoc(payload, currentUser);
        }
      }
    }

    if (matchedCount > 0) {
      toast.success(`Berhasil mengimpor narasi untuk ${matchedCount} siswa.`);
      setIsImportModalOpen(false);
      setImportRawText('');
      await loadNarratives();
    } else {
      toast.error('Tidak ada nama siswa yang cocok. Pastikan format: "Nama Siswa [TAB/PIPE] Narasi Akademik [TAB/PIPE] Narasi SEL"');
    }
  };

  // Filtered students list
  const filteredStudents = React.useMemo(() => {
    return students.filter(s => {
      const matchSearch = !searchStudent.trim() || 
        s.name.toLowerCase().includes(searchStudent.toLowerCase()) || 
        (s.nis && s.nis.includes(searchStudent));

      const doc = narrativesMap[s.id];
      const status = doc?.reviewStatus || 'DRAFT';

      if (statusFilter === 'ALL') return matchSearch;
      if (statusFilter === 'DRAFT') return matchSearch && status === 'DRAFT';
      if (statusFilter === 'SUBMITTED') return matchSearch && status === 'SUBMITTED';
      if (statusFilter === 'APPROVED') return matchSearch && status === 'APPROVED';
      if (statusFilter === 'NEEDS_REVISION') return matchSearch && status === 'NEEDS_REVISION';
      return matchSearch;
    });
  }, [students, searchStudent, statusFilter, narrativesMap]);

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
            <MessageSquare size={22} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Narasi &amp; Approval Paket Bulanan ({monthLabel})
            </h2>
            <p className="text-xs text-slate-500">
              Komentar Akademik &amp; Profil Sosial Emosional siswa kelas {selectedClass?.name}.
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <Upload size={14} />
            <span>Impor / Paste Narasi</span>
          </button>

          <button
            type="button"
            onClick={handleBulkSubmitClass}
            disabled={savingNarrative}
            className="px-3.5 py-2 text-xs font-bold rounded-xl border border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Send size={14} />
            <span>Ajukan Semua yang Lengkap</span>
          </button>

          {canReview && (
            <button
              type="button"
              onClick={handleBulkApproveClass}
              disabled={processingReview}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-700 text-white hover:bg-emerald-800 flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
            >
              <ShieldCheck size={14} />
              <span>Setujui Semua yang Diajukan</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Grid: Student List & Detail Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Students Sidebar (4 Cols) */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-blue-700" />
              <span className="text-xs font-bold text-slate-800">Daftar Siswa ({students.length})</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={searchStudent}
              onChange={(e) => setSearchStudent(e.target.value)}
              placeholder="Cari siswa..."
              className="text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg bg-slate-50/50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs px-2 py-1.5 border border-slate-300 rounded-lg bg-slate-50/50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-semibold"
            >
              <option value="ALL">Semua Status</option>
              <option value="DRAFT">Draft</option>
              <option value="SUBMITTED">Diajukan</option>
              <option value="APPROVED">Disetujui</option>
              <option value="NEEDS_REVISION">Perlu Revisi</option>
            </select>
          </div>

          <div className="max-h-[640px] overflow-y-auto space-y-1.5 pr-1">
            {filteredStudents.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">Tidak ada siswa sesuai filter.</p>
            ) : (
              filteredStudents.map((s, idx) => {
                const sDoc = narrativesMap[s.id];
                const status: ElementaryMonthlyReviewStatus = sDoc?.reviewStatus || 'DRAFT';
                const isSelected = s.id === activeStudentId;

                const statusBadge = 
                  status === 'APPROVED' ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center gap-1">
                      <CheckCircle2 size={10} /> Disetujui
                    </span>
                  ) : status === 'SUBMITTED' ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold flex items-center gap-1">
                      <Clock size={10} /> Diajukan
                    </span>
                  ) : status === 'NEEDS_REVISION' ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-bold flex items-center gap-1">
                      <AlertCircle size={10} /> Revisi
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-semibold">
                      Draft
                    </span>
                  );

                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setActiveStudentId(s.id)}
                    className={`w-full text-left p-2.5 rounded-xl transition-all flex items-center justify-between cursor-pointer border ${
                      isSelected
                        ? 'bg-blue-50/80 border-blue-400 text-blue-950 font-bold shadow-2xs'
                        : 'bg-white hover:bg-slate-50 border-transparent text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[11px] font-mono text-slate-400 w-5">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span className="text-xs truncate">{s.name}</span>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      {statusBadge}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Active Student Narrative Editor & Review Package (8 Cols) */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-6">
          {activeStudent ? (
            <>
              {/* Header & Status Banner */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{activeStudent.name}</h3>
                    <p className="text-xs text-slate-500">
                      NIS: {activeStudent.nis || '-'} · Kelas {selectedClass?.name}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Lock / Unlock status indicator */}
                    {isLocked ? (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 border border-slate-200">
                          <Lock size={12} className="text-slate-500" />
                          <span>Terkunci ({currentStatus === 'APPROVED' ? 'Disetujui' : 'Diajukan'})</span>
                        </span>
                        <button
                          type="button"
                          onClick={handleUnlockForEdit}
                          className="px-3 py-1.5 text-xs font-bold rounded-xl border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <Unlock size={12} />
                          <span>Buka Kunci untuk Edit</span>
                        </button>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-xl bg-slate-100 text-slate-600">
                        <Unlock size={12} />
                        <span>Mode Edit Draf</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Status Callout Banner */}
                {currentStatus === 'NEEDS_REVISION' && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-1.5">
                    <div className="flex items-center gap-2 text-red-800 font-bold text-xs">
                      <AlertCircle size={16} />
                      <span>Catatan Revisi dari Head Unit:</span>
                    </div>
                    <p className="text-xs text-red-900 font-medium whitespace-pre-wrap pl-6">
                      {activeNarrative?.reviewNotes || 'Harap periksa dan sesuaikan kembali narasi ini.'}
                    </p>
                  </div>
                )}

                {isScoresStale && (
                  <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs flex items-center gap-2.5">
                    <AlertCircle size={16} className="text-amber-700 flex-shrink-0" />
                    <span>
                      <strong>Perhatian:</strong> Nilai sumber LO/LG siswa telah diperbarui sejak narasi ini diajukan atau disetujui. Pertimbangkan untuk menyesuaikan narasi akademik.
                    </span>
                  </div>
                )}
              </div>

              {/* SECTION A: Academic Comments Editor */}
              <div className="space-y-3 p-4 bg-slate-50/50 rounded-2xl border border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <BookOpen size={16} className="text-blue-700" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      1. Academic Comments (Komentar Akademik)
                    </h4>
                  </div>

                  {!isLocked && (
                    <button
                      type="button"
                      onClick={() => setIsAcademicAiOpen(!isAcademicAiOpen)}
                      className="text-xs font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1 self-start sm:self-auto cursor-pointer"
                    >
                      <Sparkles size={14} className="text-blue-600" />
                      <span>{isAcademicAiOpen ? 'Tutup Asisten AI' : 'Bantuan AI Akademik'}</span>
                    </button>
                  )}
                </div>

                {/* AI Assistant Drawer for Academic Comments */}
                {isAcademicAiOpen && !isLocked && (
                  <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-200 space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold text-blue-900">
                      <span>Asisten AI Komentar Akademik</span>
                      <span className="text-[11px] font-normal text-blue-700">
                        Merujuk pada capaian LG &amp; nilai LO siswa bulan {monthLabel}
                      </span>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Catatan Khusus Guru (Opsional)
                      </label>
                      <input
                        type="text"
                        value={academicTeacherNotes}
                        onChange={(e) => setAcademicTeacherNotes(e.target.value)}
                        placeholder="Misal: Sangat aktif dalam sesi presentasi kelompok..."
                        className="w-full text-xs px-3 py-2 border border-blue-200 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleGenerateAcademicAi}
                        disabled={generatingAcademicAi}
                        className="px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-50"
                      >
                        {generatingAcademicAi ? <RefreshCw size={12} className="animate-spin" /> : <Wand2 size={12} />}
                        <span>Buat Draf AI</span>
                      </button>

                      {academicAiDraft && (
                        <>
                          <button
                            type="button"
                            onClick={handleRefineAcademicAi}
                            disabled={refiningAcademicAi}
                            className="px-3 py-1.5 text-xs font-bold rounded-lg border border-blue-300 bg-white text-blue-700 hover:bg-blue-50 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            {refiningAcademicAi ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
                            <span>Rapikan Kalimat</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setAcademicComment(academicAiDraft);
                              setIsAcademicAiOpen(false);
                              toast.success('Draf AI disalin ke kolom komentar.');
                            }}
                            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1.5 cursor-pointer shadow-2xs"
                          >
                            <Check size={12} />
                            <span>Gunakan Draf Ini</span>
                          </button>
                        </>
                      )}
                    </div>

                    {academicAiDraft && (
                      <div className="p-3 bg-white rounded-lg border border-blue-200 text-xs text-slate-800 leading-relaxed">
                        <span className="font-bold text-[10px] text-blue-700 block mb-1">Pratinjau Draf:</span>
                        {academicAiDraft}
                      </div>
                    )}
                  </div>
                )}

                <textarea
                  rows={4}
                  value={academicComment}
                  onChange={(e) => setAcademicComment(e.target.value)}
                  disabled={isLocked}
                  placeholder="Uraikan refleksi capaian akademik siswa di bulan ini, mencakup keunggulan materi dan hal yang perlu ditingkatkan..."
                  className="w-full text-xs p-3 border border-slate-300 rounded-xl bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-600 resize-y"
                />
              </div>

              {/* SECTION B: Social Emotional Profile (SEL) Editor */}
              <div className="space-y-3 p-4 bg-slate-50/50 rounded-2xl border border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <Heart size={16} className="text-rose-600" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      2. Social Emotional Profile (SEL)
                    </h4>
                  </div>

                  {!isLocked && (
                    <button
                      type="button"
                      onClick={() => setIsSelAiOpen(!isSelAiOpen)}
                      className="text-xs font-bold text-rose-700 hover:text-rose-900 flex items-center gap-1 self-start sm:self-auto cursor-pointer"
                    >
                      <Sparkles size={14} className="text-rose-600" />
                      <span>{isSelAiOpen ? 'Tutup Asisten AI' : 'Bantuan AI SEL'}</span>
                    </button>
                  )}
                </div>

                {/* AI Assistant Drawer for SEL Profile */}
                {isSelAiOpen && !isLocked && (
                  <div className="p-3.5 bg-rose-50/60 rounded-xl border border-rose-200 space-y-3">
                    <div className="text-xs font-bold text-rose-900">
                      <span>Asisten AI Profil Sosial Emosional</span>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Pilih Fokus Karakter Bulanan:
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          'Kemandirian & Tanggung Jawab',
                          'Kolaborasi & Kerja Sama',
                          'Regulasi Emosi & Ketekunan',
                          'Rasa Ingin Tahu & Inisiatif',
                          'Empati & Sopan Santun'
                        ].map((focus) => {
                          const isSelected = selFocusAreas.includes(focus);
                          return (
                            <button
                              key={focus}
                              type="button"
                              onClick={() => {
                                setSelFocusAreas(prev => 
                                  isSelected ? prev.filter(f => f !== focus) : [...prev, focus]
                                );
                              }}
                              className={`text-[11px] px-2.5 py-1 rounded-lg border font-semibold transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-rose-100 border-rose-400 text-rose-900'
                                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              {focus}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Observasi Tambahan Guru (Opsional)
                      </label>
                      <input
                        type="text"
                        value={selObservations}
                        onChange={(e) => setSelObservations(e.target.value)}
                        placeholder="Misal: Selalu siap membantu teman merapikan peralatan..."
                        className="w-full text-xs px-3 py-2 border border-rose-200 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-rose-500"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleGenerateSelAi}
                        disabled={generatingSelAi}
                        className="px-3 py-1.5 text-xs font-bold rounded-lg bg-rose-600 text-white hover:bg-rose-700 flex items-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-50"
                      >
                        {generatingSelAi ? <RefreshCw size={12} className="animate-spin" /> : <Wand2 size={12} />}
                        <span>Buat Draf SEL</span>
                      </button>

                      {selAiDraft && (
                        <>
                          <button
                            type="button"
                            onClick={handleRefineSelAi}
                            disabled={refiningSelAi}
                            className="px-3 py-1.5 text-xs font-bold rounded-lg border border-rose-300 bg-white text-rose-700 hover:bg-rose-50 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            {refiningSelAi ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
                            <span>Rapikan Kalimat</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setSelProfile(selAiDraft);
                              setIsSelAiOpen(false);
                              toast.success('Draf SEL disalin ke kolom profil.');
                            }}
                            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1.5 cursor-pointer shadow-2xs"
                          >
                            <Check size={12} />
                            <span>Gunakan Draf Ini</span>
                          </button>
                        </>
                      )}
                    </div>

                    {selAiDraft && (
                      <div className="p-3 bg-white rounded-lg border border-rose-200 text-xs text-slate-800 leading-relaxed">
                        <span className="font-bold text-[10px] text-rose-700 block mb-1">Pratinjau Draf:</span>
                        {selAiDraft}
                      </div>
                    )}
                  </div>
                )}

                <textarea
                  rows={4}
                  value={selProfile}
                  onChange={(e) => setSelProfile(e.target.value)}
                  disabled={isLocked}
                  placeholder="Uraikan perkembangan profil karakter, kemandirian, dan interaksi sosial emosional siswa di lingkungan sekolah..."
                  className="w-full text-xs p-3 border border-slate-300 rounded-xl bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500 disabled:bg-slate-100 disabled:text-slate-600 resize-y"
                />
              </div>

              {/* Action Buttons Footer */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <div className="text-xs text-slate-500">
                  {activeNarrative?.updatedByName && (
                    <span>Terakhir diubah oleh <strong>{activeNarrative.updatedByName}</strong></span>
                  )}
                  {activeNarrative?.reviewedByName && currentStatus === 'APPROVED' && (
                    <span> · Disetujui oleh <strong>{activeNarrative.reviewedByName}</strong></span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {!isLocked && (
                    <>
                      <button
                        type="button"
                        onClick={handleSaveDraft}
                        disabled={savingNarrative}
                        className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-50"
                      >
                        {savingNarrative ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                        <span>Simpan Draf</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleSubmitForReview}
                        disabled={savingNarrative}
                        className="px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                      >
                        <Send size={14} />
                        <span>Ajukan Review</span>
                      </button>
                    </>
                  )}

                  {/* Reviewer Action Buttons (Head Unit) */}
                  {canReview && currentStatus === 'SUBMITTED' && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setRevisionNotesInput('');
                          setIsRevisionModalOpen(true);
                        }}
                        disabled={processingReview}
                        className="px-4 py-2 text-xs font-bold rounded-xl border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <AlertCircle size={14} />
                        <span>Minta Revisi...</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleApprove}
                        disabled={processingReview}
                        className="px-5 py-2 text-xs font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                      >
                        {processingReview ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                        <span>Setujui (Approve)</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="p-12 text-center text-slate-400">Pilih siswa di sebelah kiri untuk melihat narasi.</div>
          )}
        </div>
      </div>

      {/* MODAL 1: Request Revision Modal */}
      {isRevisionModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-red-100 text-red-700 flex items-center justify-center">
                  <AlertCircle size={18} />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Minta Revisi Narasi Siswa</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsRevisionModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                Catatan Feedback Revisi bagi Guru Kelas <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={4}
                value={revisionNotesInput}
                onChange={(e) => setRevisionNotesInput(e.target.value)}
                placeholder="Tuliskan bagian yang perlu diperbaiki atau disesuaikan..."
                className="w-full text-xs p-3 border border-slate-300 rounded-xl bg-white focus:outline-hidden focus:ring-2 focus:ring-red-500 resize-y"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsRevisionModalOpen(false)}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleExecuteRequestRevision}
                disabled={processingReview || !revisionNotesInput.trim()}
                className="px-5 py-2 text-xs font-bold rounded-xl bg-red-600 text-white hover:bg-red-700 flex items-center gap-1.5 shadow-xs disabled:opacity-50"
              >
                {processingReview ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                <span>Kirim Permintaan Revisi</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Bulk Import / Paste Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                  <Upload size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Impor / Tempel Narasi Masal</h3>
                  <p className="text-xs text-slate-500">Tempel data dari spreadsheet atau teks terstruktur.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700">Target Kolom:</label>
              <div className="flex gap-2">
                <label className="text-xs flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="importTarget"
                    checked={importTargetType === 'both'}
                    onChange={() => setImportTargetType('both')}
                  />
                  <span>Keduanya (Akademik &amp; SEL)</span>
                </label>
                <label className="text-xs flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="importTarget"
                    checked={importTargetType === 'academic'}
                    onChange={() => setImportTargetType('academic')}
                  />
                  <span>Hanya Akademik</span>
                </label>
                <label className="text-xs flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="importTarget"
                    checked={importTargetType === 'sel'}
                    onChange={() => setImportTargetType('sel')}
                  />
                  <span>Hanya SEL</span>
                </label>
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700">
                Data Teks (Format: Nama Siswa [TAB / | ] Komentar Akademik [TAB / | ] Profil SEL):
              </label>
              <textarea
                rows={8}
                value={importRawText}
                onChange={(e) => setImportRawText(e.target.value)}
                placeholder="Ahmad Pratama	Ananda sangat tekun dalam belajar...	Ananda menunjukkan kemandirian yang baik..."
                className="w-full text-xs font-mono p-3 border border-slate-300 rounded-xl bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 resize-y"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleProcessImport}
                disabled={!importRawText.trim()}
                className="px-5 py-2 text-xs font-bold rounded-xl bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1.5 shadow-xs disabled:opacity-50"
              >
                <Check size={14} />
                <span>Proses Impor</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
