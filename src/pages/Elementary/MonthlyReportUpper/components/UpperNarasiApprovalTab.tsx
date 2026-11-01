import * as React from 'react';
import { 
  FileText, CheckCircle2, Clock, AlertCircle, Sparkles, 
  Send, Save, ArrowLeft, ArrowRight, UserCheck, ShieldAlert,
  Edit2, Trash2, Globe, AlertTriangle, BookOpen, Layers, RefreshCw, Wand2
} from 'lucide-react';
import type { 
  ElementaryUpperStudentNarrativesDoc,
  ElementaryUpperCurriculumDoc,
  ElementaryUpperStudentDataDoc,
  ElementaryUpperLitNumRecordDoc,
  ElementaryUpperLitNumClassConfigDoc,
  UpperReviewStatus,
  UpperLitNumSubjectField,
  UpperLitNumPredicate
} from '../../../../types/elementaryMonthlyUpperReport';
import { 
  calculateUpperLitNumPredicate,
  compileLitNumNarrative,
  DEFAULT_LITNUM_TEMPLATES,
  UPPER_LITNUM_FIELDS
} from '../../../../types/elementaryMonthlyUpperReport';
import { 
  fetchUpperStudentNarrativesMap,
  saveUpperStudentNarratives,
  reviewUpperStudentNarrativePackage,
  batchReviewUpperStudentNarrativePackage,
  buildUpperNarrativesDocId,
  isElementaryUpperHeadOrSuperAdmin,
  computeUpperMonthlyScoresHash,
  computeUpperLitNumHash
} from '../../../../services/elementaryMonthlyUpperReportService';
import type { Student, Class, User } from '../../../../types';
import { toast } from 'sonner';

interface UpperNarasiApprovalTabProps {
  curriculumDoc: ElementaryUpperCurriculumDoc | null;
  studentDataMap: Record<string, ElementaryUpperStudentDataDoc>;
  classConfig?: ElementaryUpperLitNumClassConfigDoc | null;
  litNumRecordsMap?: Record<string, ElementaryUpperLitNumRecordDoc>;
  students: Student[];
  selectedClass: Class | null;
  selectedYear: string;
  selectedSemester: string;
  selectedMonth: string;
  monthLabel: string;
  currentUser: User;
  onRefreshData?: () => void;
}

export const UpperNarasiApprovalTab: React.FC<UpperNarasiApprovalTabProps> = ({
  curriculumDoc,
  studentDataMap,
  classConfig,
  litNumRecordsMap = {},
  students,
  selectedClass,
  selectedYear,
  selectedSemester,
  selectedMonth,
  monthLabel,
  currentUser,
  onRefreshData
}) => {
  const isApprover = isElementaryUpperHeadOrSuperAdmin(currentUser);

  // Selected Student
  const [selectedStudentId, setSelectedStudentId] = React.useState<string>(students[0]?.id || '');
  const selectedStudent = students.find(s => s.id === selectedStudentId) || students[0] || null;

  // Narratives Map
  const [narrativesMap, setNarrativesMap] = React.useState<Record<string, ElementaryUpperStudentNarrativesDoc>>({});
  const [loading, setLoading] = React.useState<boolean>(true);

  // Batch Review Modal
  const [batchModalOpen, setBatchModalOpen] = React.useState<boolean>(false);
  const [batchPackageType, setBatchPackageType] = React.useState<'MONTHLY_PROGRESS' | 'LITERACY_NUMERACY'>('MONTHLY_PROGRESS');
  const [batchDecision, setBatchDecision] = React.useState<'APPROVED' | 'NEEDS_REVISION'>('APPROVED');
  const [batchNotes, setBatchNotes] = React.useState<string>('');

  // Confirmation modal for overwriting manual narrative
  const [confirmModal, setConfirmModal] = React.useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Sync selected student
  React.useEffect(() => {
    if (students.length > 0 && (!selectedStudentId || !students.some(s => s.id === selectedStudentId))) {
      setSelectedStudentId(students[0].id);
    }
  }, [students, selectedStudentId]);

  // Load Narratives
  const loadNarratives = React.useCallback(async () => {
    if (!selectedClass || !selectedYear || !selectedSemester || !selectedMonth) return;
    setLoading(true);
    try {
      const data = await fetchUpperStudentNarrativesMap(selectedClass.id, selectedYear, selectedSemester, selectedMonth);
      setNarrativesMap(data);
    } catch (e) {
      console.error('Error loading narratives:', e);
      toast.error('Gagal memuat narasi siswa.');
    } finally {
      setLoading(false);
    }
  }, [selectedClass, selectedYear, selectedSemester, selectedMonth]);

  React.useEffect(() => {
    loadNarratives();
  }, [loadNarratives]);

  // Active student narrative doc
  const currentNarrative: ElementaryUpperStudentNarrativesDoc = React.useMemo(() => {
    if (!selectedStudent || !selectedClass) {
      return {
        id: '',
        studentId: '',
        studentName: '',
        classId: '',
        academicYear: selectedYear,
        semester: selectedSemester,
        month: selectedMonth,
        monthlyGeneralComment: '',
        monthlyProgressReview: { reviewStatus: 'DRAFT' },
        bahasaIndonesiaNarrative: '',
        englishNarrative: '',
        mathematicsNarrative: '',
        litNumReview: { reviewStatus: 'DRAFT' },
        narrativeLanguage: 'ID',
        createdAt: 0,
        createdBy: '',
        updatedAt: 0,
        updatedBy: ''
      };
    }

    const existing = narrativesMap[selectedStudent.id];
    if (existing) return existing;

    const docId = buildUpperNarrativesDocId(selectedStudent.id, selectedClass.id, selectedYear, selectedSemester, selectedMonth);
    return {
      id: docId,
      studentId: selectedStudent.id,
      studentName: selectedStudent.name,
      classId: selectedClass.id,
      academicYear: selectedYear,
      semester: selectedSemester,
      month: selectedMonth,
      monthlyGeneralComment: '',
      monthlyProgressReview: { reviewStatus: 'DRAFT' },
      bahasaIndonesiaNarrative: '',
      englishNarrative: '',
      mathematicsNarrative: '',
      litNumReview: { reviewStatus: 'DRAFT' },
      narrativeLanguage: 'ID',
      createdAt: Date.now(),
      createdBy: currentUser.uid || 'system',
      updatedAt: Date.now(),
      updatedBy: currentUser.uid || 'system'
    };
  }, [selectedStudent, selectedClass, narrativesMap, selectedYear, selectedSemester, selectedMonth, currentUser]);

  // Local editing state for textareas
  const [monthlyComment, setMonthlyComment] = React.useState<string>('');
  const [biNarrative, setBiNarrative] = React.useState<string>('');
  const [engNarrative, setEngNarrative] = React.useState<string>('');
  const [mathNarrative, setMathNarrative] = React.useState<string>('');
  const [langPreference, setLangPreference] = React.useState<'ID' | 'EN'>('ID');

  // Single review note state
  const [reviewNoteInput, setReviewNoteInput] = React.useState<string>('');

  React.useEffect(() => {
    setMonthlyComment(currentNarrative.monthlyGeneralComment || '');
    setBiNarrative(currentNarrative.bahasaIndonesiaNarrative || '');
    setEngNarrative(currentNarrative.englishNarrative || '');
    setMathNarrative(currentNarrative.mathematicsNarrative || '');
    setLangPreference(currentNarrative.narrativeLanguage || 'ID');
  }, [currentNarrative]);

  // Helper: LitNum data analysis for selected student
  const studentLitNumDoc = selectedStudent ? litNumRecordsMap[selectedStudent.id] : null;

  const getFieldLitNumStats = React.useCallback((field: UpperLitNumSubjectField) => {
    const entry = studentLitNumDoc?.periodScores?.[field]?.[selectedMonth];
    const scoreVal = entry?.score !== undefined && entry?.score !== null ? entry.score : null;
    const std = classConfig?.standards?.[field] ?? (field === 'english' ? 55 : 70);
    const th = classConfig?.thresholds?.[field] ?? (field === 'english' ? { minA: 78, minD: 55 } : { minA: 85, minD: 70 });
    const predicate = calculateUpperLitNumPredicate(scoreVal, th);
    const template = classConfig?.narrativeTemplates?.[field]?.[predicate || 'D'] || DEFAULT_LITNUM_TEMPLATES[field][predicate || 'D'];
    const fieldLabel = field === 'bahasa_indonesia' ? 'Bahasa Indonesia' : field === 'english' ? 'English' : 'Mathematics';

    const compiledTemplate = predicate && selectedStudent ? compileLitNumNarrative(template, {
      studentName: selectedStudent.name,
      monthLabel,
      fieldLabel,
      score: scoreVal,
      predicate
    }) : '';

    return {
      score: scoreVal,
      standard: std,
      thresholds: th,
      predicate,
      fieldLabel,
      compiledTemplate
    };
  }, [studentLitNumDoc, selectedMonth, classConfig, monthLabel, selectedStudent]);

  const biStats = React.useMemo(() => getFieldLitNumStats('bahasa_indonesia'), [getFieldLitNumStats]);
  const engStats = React.useMemo(() => getFieldLitNumStats('english'), [getFieldLitNumStats]);
  const mathStats = React.useMemo(() => getFieldLitNumStats('mathematics'), [getFieldLitNumStats]);

  // Check Stale Hashes
  const studentScoresDoc = selectedStudent ? studentDataMap[selectedStudent.id] : null;
  const currentScoresHash = computeUpperMonthlyScoresHash(studentScoresDoc);
  const isMonthlyStale = currentNarrative.monthlyProgressReview?.sourceHash && 
    currentNarrative.monthlyProgressReview.sourceHash !== currentScoresHash;

  const currentLitNumHash = computeUpperLitNumHash(studentLitNumDoc);
  const isLitNumStale = currentNarrative.litNumReview?.sourceHash &&
    currentNarrative.litNumReview.sourceHash !== currentLitNumHash;

  // Save Text Changes
  const handleSaveTextChanges = async () => {
    if (!selectedStudent || !selectedClass) return;
    const docToSave: ElementaryUpperStudentNarrativesDoc = {
      ...currentNarrative,
      monthlyGeneralComment: monthlyComment,
      bahasaIndonesiaNarrative: biNarrative,
      englishNarrative: engNarrative,
      mathematicsNarrative: mathNarrative,
      narrativeLanguage: langPreference
    };

    try {
      await saveUpperStudentNarratives(docToSave, currentUser);
      setNarrativesMap(prev => ({
        ...prev,
        [selectedStudent.id]: docToSave
      }));
      toast.success(`Draf narasi ${selectedStudent.name} berhasil disimpan.`);
    } catch (e: any) {
      toast.error('Gagal menyimpan draf narasi.');
    }
  };

  // Deterministic LitNum Template Mapper (NO AI)
  const applyTemplateToField = (field: UpperLitNumSubjectField, force: boolean = false) => {
    const stats = field === 'bahasa_indonesia' ? biStats : field === 'english' ? engStats : mathStats;
    const currentText = field === 'bahasa_indonesia' ? biNarrative : field === 'english' ? engNarrative : mathNarrative;
    const setText = field === 'bahasa_indonesia' ? setBiNarrative : field === 'english' ? setEngNarrative : setMathNarrative;

    if (stats.score === null || !stats.predicate) {
      toast.error(`Nilai ${stats.fieldLabel} belum diinput. Tidak dapat memetakan predikat.`);
      return;
    }

    if (!stats.compiledTemplate) {
      toast.error(`Template untuk ${stats.fieldLabel} belum dikonfigurasi.`);
      return;
    }

    if (currentText.trim() && currentText.trim() !== stats.compiledTemplate.trim() && !force) {
      // Prompt confirmation before replacing teacher's manual edits
      setConfirmModal({
        isOpen: true,
        title: `Konfirmasi Penggantian Narasi (${stats.fieldLabel})`,
        message: `Anda sudah pernah menyunting narasi ${stats.fieldLabel}. Apakah Anda yakin ingin menggantinya dengan template otomatis untuk Predikat ${stats.predicate} (${stats.score}/100)? Perubahan manual Anda akan diganti.`,
        onConfirm: () => {
          setText(stats.compiledTemplate);
          setConfirmModal(null);
          toast.success(`Narasi ${stats.fieldLabel} diperbarui ke template Predikat ${stats.predicate}.`);
        }
      });
      return;
    }

    setText(stats.compiledTemplate);
    toast.success(`Narasi ${stats.fieldLabel} berhasil dipetakan dari template Predikat ${stats.predicate}.`);
  };

  // Bulk Apply Templates to All 3 LitNum Fields
  const handleBulkApplyLitNum = () => {
    let populatedCount = 0;
    const targets: Array<{ field: UpperLitNumSubjectField; stats: any; currentText: string; setText: (s: string) => void }> = [
      { field: 'bahasa_indonesia', stats: biStats, currentText: biNarrative, setText: setBiNarrative },
      { field: 'english', stats: engStats, currentText: engNarrative, setText: setEngNarrative },
      { field: 'mathematics', stats: mathStats, currentText: mathNarrative, setText: setMathNarrative }
    ];

    const hasAnyExistingManual = targets.some(t => t.currentText.trim() && t.currentText.trim() !== t.stats.compiledTemplate.trim());

    const doApply = () => {
      for (const t of targets) {
        if (t.stats.score !== null && t.stats.compiledTemplate) {
          t.setText(t.stats.compiledTemplate);
          populatedCount++;
        }
      }
      setConfirmModal(null);
      if (populatedCount > 0) {
        toast.success(`${populatedCount} bidang Literasi & Numerasi berhasil dipetakan dari template.`);
      } else {
        toast.info('Belum ada nilai yang diinput pada tab Literasi & Numerasi.');
      }
    };

    if (hasAnyExistingManual) {
      setConfirmModal({
        isOpen: true,
        title: 'Konfirmasi Petakan Semua Narasi Litnum',
        message: 'Beberapa bidang sudah memiliki narasi yang telah disunting. Apakah Anda yakin ingin menimpa semuanya dengan template predikat terbaru?',
        onConfirm: doApply
      });
      return;
    }

    doApply();
  };

  // Submit Package for Review
  const handleSubmitPackage = async (packageType: 'MONTHLY_PROGRESS' | 'LITERACY_NUMERACY') => {
    if (!selectedStudent || !selectedClass) return;
    try {
      // First save current text
      await handleSaveTextChanges();

      const sourceHash = packageType === 'MONTHLY_PROGRESS' ? currentScoresHash : currentLitNumHash;
      await reviewUpperStudentNarrativePackage(
        {
          studentId: selectedStudent.id,
          classId: selectedClass.id,
          academicYear: selectedYear,
          semester: selectedSemester,
          month: selectedMonth,
          packageType,
          decision: 'SUBMITTED',
          sourceHash
        },
        currentUser
      );

      toast.success(`Paket ${packageType === 'MONTHLY_PROGRESS' ? 'Monthly Progress' : 'Literasi & Numerasi'} berhasil diajukan.`);
      loadNarratives();
    } catch (e: any) {
      toast.error(e.message || 'Gagal mengajukan paket narasi.');
    }
  };

  // Review Package (Approve / Return for Revision)
  const handleReviewPackage = async (
    packageType: 'MONTHLY_PROGRESS' | 'LITERACY_NUMERACY',
    decision: 'APPROVED' | 'NEEDS_REVISION'
  ) => {
    if (!selectedStudent || !selectedClass) return;
    try {
      const sourceHash = packageType === 'MONTHLY_PROGRESS' ? currentScoresHash : currentLitNumHash;
      await reviewUpperStudentNarrativePackage(
        {
          studentId: selectedStudent.id,
          classId: selectedClass.id,
          academicYear: selectedYear,
          semester: selectedSemester,
          month: selectedMonth,
          packageType,
          decision,
          reviewNotes: reviewNoteInput,
          sourceHash
        },
        currentUser
      );

      toast.success(`Paket ${packageType === 'MONTHLY_PROGRESS' ? 'Monthly Progress' : 'Literasi & Numerasi'} ${decision === 'APPROVED' ? 'disetujui' : 'dikembalikan untuk revisi'}.`);
      setReviewNoteInput('');
      loadNarratives();
    } catch (e: any) {
      toast.error(e.message || 'Gagal memproses review.');
    }
  };

  // Monthly Progress (Package 1) Simple Draft Generator
  const handleGenerateMonthlyComment = () => {
    const scores = studentScoresDoc?.scores || {};
    const subjs = curriculumDoc?.subjects || [];
    let highCount = 0;
    let needGuidanceCount = 0;

    for (const sub of subjs) {
      for (const lg of sub.learningGoals || []) {
        const sc = scores[lg.learningObjectives?.[0]?.id || ''];
        if (typeof sc === 'number') {
          if (sc >= 85) highCount++;
          else if (sc < (sub.kkm || 70)) needGuidanceCount++;
        }
      }
    }

    let draft = `Ananda ${selectedStudent?.name || 'Siswa'} menunjukkan perkembangan belajar yang positif pada bulan ${monthLabel}. `;
    if (highCount > 0) {
      draft += `Ananda memperlihatkan penguasaan yang sangat memuaskan pada materi pembelajaran reguler dan menunjukkan komitmen dalam menyelesaikan tugas secara mandiri. `;
    }
    if (needGuidanceCount > 0) {
      draft += `Guru terus memberikan pendampingan personal agar pemahaman konsep pada aspek yang belum tuntas dapat ditingkatkan. `;
    }
    draft += `Dalam kegiatan proyek kolaboratif, ananda mampu berpartisipasi aktif dan menghargai masukan teman kelompoknya.`;

    setMonthlyComment(draft);
    toast.success('Draf narasi Monthly Progress berhasil dibuat.');
  };

  const isMonthlyLocked = currentNarrative.monthlyProgressReview?.reviewStatus === 'SUBMITTED' ||
    currentNarrative.monthlyProgressReview?.reviewStatus === 'APPROVED';

  const isLitNumLocked = currentNarrative.litNumReview?.reviewStatus === 'SUBMITTED' ||
    currentNarrative.litNumReview?.reviewStatus === 'APPROVED';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Left Column: Student Navigation List */}
      <div className="lg:col-span-1 bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
            Daftar Siswa ({students.length})
          </h3>
          <span className="text-[10px] text-slate-400 font-semibold">{monthLabel}</span>
        </div>

        <div className="space-y-1.5 max-h-[640px] overflow-y-auto">
          {students.map((st, idx) => {
            const nar = narrativesMap[st.id];
            const mStatus = nar?.monthlyProgressReview?.reviewStatus || 'DRAFT';
            const lStatus = nar?.litNumReview?.reviewStatus || 'DRAFT';
            const isSelected = selectedStudent?.id === st.id;

            return (
              <button
                key={st.id}
                type="button"
                onClick={() => setSelectedStudentId(st.id)}
                className={`w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                  isSelected
                    ? 'border-indigo-600 bg-indigo-50/60 shadow-xs'
                    : 'border-slate-200/80 hover:bg-slate-50'
                }`}
              >
                <div className="truncate">
                  <div className={`text-xs font-bold truncate ${isSelected ? 'text-indigo-950' : 'text-slate-800'}`}>
                    {idx + 1}. {st.name}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    NISN: {(st as any).nisn || '-'}
                  </div>
                </div>

                <div className="flex flex-col gap-1 items-end shrink-0">
                  <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full ${
                    mStatus === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                    mStatus === 'SUBMITTED' ? 'bg-blue-100 text-blue-800' :
                    mStatus === 'NEEDS_REVISION' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-600'
                  }`}>
                    M: {mStatus}
                  </span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full ${
                    lStatus === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                    lStatus === 'SUBMITTED' ? 'bg-blue-100 text-blue-800' :
                    lStatus === 'NEEDS_REVISION' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-600'
                  }`}>
                    LN: {lStatus}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Column: 4 Narratives & Dual Review Packages */}
      <div className="lg:col-span-3 space-y-6">
        {/* Top Student Header Bar */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-slate-900 tracking-tight">
                {selectedStudent?.name}
              </h2>
              <span className="text-slate-300">·</span>
              <span className="text-xs text-slate-500 font-semibold">{selectedClass?.name}</span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Nilai sumber → rata-rata → predikat A/D/B otomatis → draf terisi tanpa AI. Guru dapat menyunting teks final.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Language Selector */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
              <Globe size={13} className="text-slate-500 ml-1" />
              <button
                type="button"
                onClick={() => setLangPreference('ID')}
                className={`px-2 py-1 rounded-lg font-bold text-[11px] cursor-pointer ${
                  langPreference === 'ID' ? 'bg-white text-indigo-950 shadow-2xs' : 'text-slate-600'
                }`}
              >
                Bahasa (ID)
              </button>
              <button
                type="button"
                onClick={() => setLangPreference('EN')}
                className={`px-2 py-1 rounded-lg font-bold text-[11px] cursor-pointer ${
                  langPreference === 'EN' ? 'bg-white text-indigo-950 shadow-2xs' : 'text-slate-600'
                }`}
              >
                English (EN)
              </button>
            </div>

            <button
              type="button"
              onClick={handleSaveTextChanges}
              className="px-3.5 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors cursor-pointer"
            >
              Simpan Perubahan
            </button>
          </div>
        </div>

        {/* PACKAGE 1: MONTHLY PROGRESS NARRATIVE */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center">
                1
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Paket 1: Komentar Umum Rapor Bulanan (Monthly Progress)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Mencakup capaian pelajaran reguler, kinerja proyek, dan sikap keseharian siswa.
                </p>
              </div>
            </div>

            {/* Status Badge */}
            <div className="flex items-center gap-2">
              {isMonthlyStale && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full" title="Nilai LO siswa telah diubah setelah approval">
                  <AlertTriangle size={11} />
                  <span>Stale (Nilai Berubah)</span>
                </span>
              )}

              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                currentNarrative.monthlyProgressReview?.reviewStatus === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                currentNarrative.monthlyProgressReview?.reviewStatus === 'SUBMITTED' ? 'bg-blue-100 text-blue-800' :
                currentNarrative.monthlyProgressReview?.reviewStatus === 'NEEDS_REVISION' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-600'
              }`}>
                Status: {currentNarrative.monthlyProgressReview?.reviewStatus || 'DRAFT'}
              </span>
            </div>
          </div>

          {/* Feedback note banner */}
          {currentNarrative.monthlyProgressReview?.reviewStatus === 'NEEDS_REVISION' && currentNarrative.monthlyProgressReview?.reviewNotes && (
            <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-xs text-red-800 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <AlertCircle size={14} />
                <span>Catatan Revisi dari Reviewer:</span>
              </div>
              <p>{currentNarrative.monthlyProgressReview.reviewNotes}</p>
            </div>
          )}

          {/* Textarea */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">Teks Komentar Umum</label>
              <button
                type="button"
                onClick={handleGenerateMonthlyComment}
                disabled={isMonthlyLocked}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 disabled:opacity-40 cursor-pointer"
              >
                <Sparkles size={12} />
                <span>Susun Draf Komentar</span>
              </button>
            </div>
            <textarea
              rows={4}
              value={monthlyComment}
              onChange={(e) => setMonthlyComment(e.target.value)}
              disabled={isMonthlyLocked}
              placeholder="Tuliskan catatan kemajuan siswa untuk periode ini..."
              className="w-full p-3 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100"
            />
          </div>

          {/* Action Footer for Package 1 */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <div className="text-[11px] text-slate-500">
              {currentNarrative.monthlyProgressReview?.reviewedByName && (
                <span>Direview oleh: <strong>{currentNarrative.monthlyProgressReview.reviewedByName}</strong></span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {!isApprover && (
                <button
                  type="button"
                  onClick={() => handleSubmitPackage('MONTHLY_PROGRESS')}
                  disabled={isMonthlyLocked || !monthlyComment.trim()}
                  className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
                >
                  <Send size={12} />
                  <span>Ajukan Paket 1</span>
                </button>
              )}

              {isApprover && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={reviewNoteInput}
                    onChange={(e) => setReviewNoteInput(e.target.value)}
                    placeholder="Catatan revisi jika dikembalikan..."
                    className="text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg w-52"
                  />
                  <button
                    type="button"
                    onClick={() => handleReviewPackage('MONTHLY_PROGRESS', 'NEEDS_REVISION')}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 cursor-pointer"
                  >
                    Perlu Revisi
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReviewPackage('MONTHLY_PROGRESS', 'APPROVED')}
                    className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                  >
                    Setujui (Approve)
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* PACKAGE 2: LITERACY & NUMERACY NARRATIVES */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-800 font-bold text-xs flex items-center justify-center">
                2
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Paket 2: Narasi Literasi &amp; Numerasi (3 Bidang)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Nilai sumber → rata-rata → predikat A/D/B otomatis → draf terisi tanpa AI. Guru dapat menyunting teks final.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isLitNumStale && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                  <AlertTriangle size={11} />
                  <span>Nilai Sumber Berubah</span>
                </span>
              )}

              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                currentNarrative.litNumReview?.reviewStatus === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                currentNarrative.litNumReview?.reviewStatus === 'SUBMITTED' ? 'bg-blue-100 text-blue-800' :
                currentNarrative.litNumReview?.reviewStatus === 'NEEDS_REVISION' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-600'
              }`}>
                Status: {currentNarrative.litNumReview?.reviewStatus || 'DRAFT'}
              </span>

              <button
                type="button"
                onClick={handleBulkApplyLitNum}
                disabled={isLitNumLocked}
                className="px-2.5 py-1 text-xs font-bold rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
              >
                <Wand2 size={12} />
                <span>Petakan Otomatis (3 Bidang)</span>
              </button>
            </div>
          </div>

          {/* Feedback note banner */}
          {currentNarrative.litNumReview?.reviewStatus === 'NEEDS_REVISION' && currentNarrative.litNumReview?.reviewNotes && (
            <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-xs text-red-800 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <AlertCircle size={14} />
                <span>Catatan Revisi dari Reviewer:</span>
              </div>
              <p>{currentNarrative.litNumReview.reviewNotes}</p>
            </div>
          )}

          {/* 3 Fields Textareas with Source & Predicate Info */}
          <div className="space-y-4">
            {/* Field A: Bahasa Indonesia */}
            <div className="space-y-2 p-3.5 rounded-xl border border-blue-200 bg-blue-50/20">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-blue-950">1. Narasi Bahasa Indonesia</span>
                  {/* Source Score & Predicate Pill */}
                  {biStats.score !== null ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-800 bg-blue-100 border border-blue-200 px-2 py-0.5 rounded-full">
                      Nilai: {biStats.score} · Rata-rata: {biStats.score} · Predikat: {biStats.predicate} ({biStats.predicate === 'A' ? 'Achieved' : biStats.predicate === 'D' ? 'Developing' : 'Beginning'})
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                      Nilai belum diinput
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => applyTemplateToField('bahasa_indonesia')}
                  disabled={isLitNumLocked || biStats.score === null}
                  className="text-[11px] font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1 disabled:opacity-40 cursor-pointer"
                >
                  <Wand2 size={12} />
                  <span>Petakan Template {biStats.predicate ? `(${biStats.predicate})` : ''}</span>
                </button>
              </div>

              {biStats.score === null && (
                <div className="text-[11px] text-amber-700 font-medium bg-amber-50 p-2 rounded-lg border border-amber-200">
                  Nilai asesmen Bahasa Indonesia belum diisi di tab Literasi &amp; Numerasi. Predikat dan narasi capaian positif tidak dihasilkan sebelum ada nilai sah.
                </div>
              )}

              <textarea
                rows={3}
                value={biNarrative}
                onChange={(e) => setBiNarrative(e.target.value)}
                disabled={isLitNumLocked}
                placeholder="Tulis atau petakan deskripsi capaian membaca, menulis, dan tata bahasa Indonesia..."
                className="w-full p-2.5 text-xs border border-slate-300 rounded-lg bg-white disabled:bg-slate-100"
              />
            </div>

            {/* Field B: English */}
            <div className="space-y-2 p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/20">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-emerald-950">2. English Literacy Narrative</span>
                  {/* Source Score & Predicate Pill */}
                  {engStats.score !== null ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full">
                      Score: {engStats.score} · Average: {engStats.score} · Predicate: {engStats.predicate} ({engStats.predicate === 'A' ? 'Achieved' : engStats.predicate === 'D' ? 'Developing' : 'Beginning'})
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                      Score not assessed
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => applyTemplateToField('english')}
                  disabled={isLitNumLocked || engStats.score === null}
                  className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 disabled:opacity-40 cursor-pointer"
                >
                  <Wand2 size={12} />
                  <span>Petakan Template {engStats.predicate ? `(${engStats.predicate})` : ''}</span>
                </button>
              </div>

              {engStats.score === null && (
                <div className="text-[11px] text-amber-700 font-medium bg-amber-50 p-2 rounded-lg border border-amber-200">
                  English assessment score has not been recorded in Literacy &amp; Numeracy tab. Predicate and auto narrative cannot be compiled.
                </div>
              )}

              <textarea
                rows={3}
                value={engNarrative}
                onChange={(e) => setEngNarrative(e.target.value)}
                disabled={isLitNumLocked}
                placeholder="Reading, writing, and comprehension progress in English..."
                className="w-full p-2.5 text-xs border border-slate-300 rounded-lg bg-white disabled:bg-slate-100"
              />
            </div>

            {/* Field C: Mathematics */}
            <div className="space-y-2 p-3.5 rounded-xl border border-purple-200 bg-purple-50/20">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-purple-950">3. Mathematics Numeracy Narrative</span>
                  {/* Source Score & Predicate Pill */}
                  {mathStats.score !== null ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-800 bg-purple-100 border border-purple-200 px-2 py-0.5 rounded-full">
                      Nilai: {mathStats.score} · Rata-rata: {mathStats.score} · Predikat: {mathStats.predicate} ({mathStats.predicate === 'A' ? 'Achieved' : mathStats.predicate === 'D' ? 'Developing' : 'Beginning'})
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                      Nilai belum diinput
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => applyTemplateToField('mathematics')}
                  disabled={isLitNumLocked || mathStats.score === null}
                  className="text-[11px] font-bold text-purple-700 hover:text-purple-900 flex items-center gap-1 disabled:opacity-40 cursor-pointer"
                >
                  <Wand2 size={12} />
                  <span>Petakan Template {mathStats.predicate ? `(${mathStats.predicate})` : ''}</span>
                </button>
              </div>

              {mathStats.score === null && (
                <div className="text-[11px] text-amber-700 font-medium bg-amber-50 p-2 rounded-lg border border-amber-200">
                  Nilai asesmen Matematika belum diisi di tab Literasi &amp; Numerasi. Predikat dan narasi capaian positif tidak dihasilkan sebelum ada nilai sah.
                </div>
              )}

              <textarea
                rows={3}
                value={mathNarrative}
                onChange={(e) => setMathNarrative(e.target.value)}
                disabled={isLitNumLocked}
                placeholder="Deskripsi penalaran numerasi, operasi hitung, dan pemecahan masalah matematika..."
                className="w-full p-2.5 text-xs border border-slate-300 rounded-lg bg-white disabled:bg-slate-100"
              />
            </div>
          </div>

          {/* Action Footer for Package 2 */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <div className="text-[11px] text-slate-500">
              {currentNarrative.litNumReview?.reviewedByName && (
                <span>Direview oleh: <strong>{currentNarrative.litNumReview.reviewedByName}</strong></span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {!isApprover && (
                <button
                  type="button"
                  onClick={() => handleSubmitPackage('LITERACY_NUMERACY')}
                  disabled={isLitNumLocked || !biNarrative.trim() || !engNarrative.trim() || !mathNarrative.trim()}
                  className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
                >
                  <Send size={12} />
                  <span>Ajukan Paket 2</span>
                </button>
              )}

              {isApprover && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={reviewNoteInput}
                    onChange={(e) => setReviewNoteInput(e.target.value)}
                    placeholder="Catatan revisi jika dikembalikan..."
                    className="text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg w-52"
                  />
                  <button
                    type="button"
                    onClick={() => handleReviewPackage('LITERACY_NUMERACY', 'NEEDS_REVISION')}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 cursor-pointer"
                  >
                    Perlu Revisi
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReviewPackage('LITERACY_NUMERACY', 'APPROVED')}
                    className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                  >
                    Setujui (Approve)
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Overwriting Manual Edits */}
      {confirmModal && confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-2 text-amber-600 font-bold text-sm">
              <AlertTriangle size={18} />
              <span>{confirmModal.title}</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              {confirmModal.message}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmModal.onConfirm}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-amber-600 hover:bg-amber-700 text-white shadow-xs cursor-pointer"
              >
                Ya, Ganti dengan Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
