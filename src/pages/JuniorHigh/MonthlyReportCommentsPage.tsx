import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MessageSquare, Calendar, Users, Save, CheckCircle2, RefreshCw, 
  AlertCircle, Info, Check, Search, X, Edit3, UserCheck, Eye, EyeOff, Sparkles,
  Copy, Clipboard, Download, Upload, AlertTriangle, Wand2, BookOpen, Layers,
  CheckSquare, Square, CheckCheck, Send, RotateCcw, ShieldCheck, Lock, Unlock, FileText, Clock
} from 'lucide-react';
import { db, getClasses, getActiveStudents } from '../../lib/firebase';
import { doc, getDoc, getDocs, setDoc, query, collection, where, writeBatch } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { toast } from 'sonner';
import type { Class, Student, JuniorHighMonthlyReportComment, MonthlyGenComReviewStatus } from '../../types';
import * as XLSX from 'xlsx';
import { isTeacherAssignedToClass } from '../../services/classTeacherAssignmentService';
import { 
  generateMonthlyGeneralCommentAI, 
  refineMonthlyGeneralCommentAI, 
  generateDeterministicMonthlyComment,
  isJuniorHighApprover,
  submitMonthlyCommentsForReview,
  approveMonthlyComments,
  requestRevisionMonthlyComments,
  openRevisionMonthlyComment,
  fetchStudentPreviousGencomHistory,
  PreviousGencomHistoryItem
} from '../../services/juniorHighMonthlyReportService';

export const JH_MONTHLY_TEMPLATES = [
  {
    id: 'ACADEMIC_INDEPENDENCE',
    title: 'Prestasi & Kemandirian Belajar',
    desc: 'Fokus pada penguasaan tujuan pembelajaran (LO), inisiatif, dan ketuntasan tugas mandiri.'
  },
  {
    id: 'ACTIVE_COLLABORATION',
    title: 'Perkembangan & Keaktifan Kolaborasi',
    desc: 'Fokus pada interaksi positif, keaktifan bertanya, dan kerja sama tim.'
  },
  {
    id: 'GUIDANCE_FOCUS',
    title: 'Pendampingan & Peningkatan Fokus',
    desc: 'Fokus pada konsistensi fokus belajar, manajemen waktu, dan ketelitian.'
  },
  {
    id: 'ISLAMIC_CHARACTER',
    title: 'Karakter Islami & Kepemimpinan',
    desc: 'Fokus pada akhlak mulia, adab islami, empati, dan kepedulian sosial.'
  }
];

export const JH_MONTHLY_STRENGTHS_BANK = [
  'Aktif dan antusias dalam mengikuti proses pembelajaran di kelas',
  'Menunjukkan rasa ingin tahu yang tinggi dan daya nalar kritis',
  'Disiplin, bertanggung jawab, dan tepat waktu dalam menuntaskan tugas',
  'Memiliki inisiatif belajar mandiri dan adaptasi yang sangat baik',
  'Mampu bekerja sama dan menghargai pandangan teman dalam kerja kelompok',
  'Menunjukkan adab sopan santun dan kepedulian sosial yang konsisten'
];

export const JH_MONTHLY_ACHIEVEMENTS_BANK = [
  'Memahami tujuan pembelajaran (LO) bulan ini dengan penguasaan yang sangat baik',
  'Menunjukkan peningkatan signifikan dalam penyelesaian tugas dan proyek kelas',
  'Mampu mempresentasikan hasil belajar dan gagasan dengan percaya diri',
  'Konsisten dalam mengaplikasikan konsep pelajaran pada pemecahan masalah',
  'Aktif berpartisipasi dalam aktivitas eksplorasi dan unjuk bakat siswa'
];

export const JH_MONTHLY_NEEDS_IMPROVEMENT_BANK = [
  'mempertahankan konsistensi fokus selama sesi pengerjaan tugas mandiri',
  'lebih percaya diri dalam mengungkapkan pendapat dan mengajukan pertanyaan di kelas',
  'meningkatkan ketelitian dengan memeriksa kembali hasil kerja sebelum dikumpulkan',
  'mengoptimalkan manajemen waktu dalam menyelesaikan setiap rangkaian aktivitas belajar',
  'lebih aktif berkonsultasi dengan guru saat menemui materi atau tugas yang menantang'
];

const indonesianMonths = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

function getIndonesianMonthLabel(periodKey: string): string {
  if (!periodKey || !periodKey.includes('-')) return '';
  const [year, month] = periodKey.split('-');
  const monthIdx = parseInt(month, 10) - 1;
  if (monthIdx >= 0 && monthIdx < 12) {
    return `${indonesianMonths[monthIdx]} ${year}`;
  }
  return periodKey;
}

export function formatDateTime(isoString?: string | null): string {
  if (!isoString) return 'Belum tercatat';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return 'Belum tercatat';
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return 'Belum tercatat';
  }
}

// Helper to compute previous month code in format YYYY-MM
const getPreviousMonthKey = (periodKey: string): string => {
  if (!periodKey || !periodKey.includes('-')) return '';
  const [yearStr, monthStr] = periodKey.split('-');
  let year = parseInt(yearStr, 15); // Wait, base 10 is better
  year = parseInt(yearStr, 10);
  let month = parseInt(monthStr, 10);
  month -= 1;
  if (month === 0) {
    month = 12;
    year -= 1;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
};

// Normalize column headers case-insensitively and strip underscores
const normalizeHeaderKey = (key: string): string => {
  return String(key || '').trim().toLowerCase().replace(/_/g, '');
};

// Parse TSV with double-quote cell support
const parsePastedTSV = (text: string): { identifier: string; comment: string; nameSnapshot?: string }[] => {
  if (!text.trim()) return [];
  
  const parsed: { identifier: string; comment: string; nameSnapshot?: string }[] = [];
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === '\t' && !inQuotes) {
      currentRow.push(currentField);
      currentField = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }
  
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }
  
  if (rows.length === 0) return [];
  
  let startIdx = 0;
  const firstRow = rows[0];
  if (firstRow.length >= 2) {
    const col0Norm = normalizeHeaderKey(firstRow[0]);
    const col1Norm = normalizeHeaderKey(firstRow[1]);
    const isIdHeader = col0Norm.includes('studentid') || col0Norm === 'nis' || col0Norm.includes('idor');
    const isCommentHeader = col1Norm.includes('comment') || col1Norm.includes('komentar');
    if (isIdHeader || isCommentHeader) {
      startIdx = 1;
    }
  }
  
  for (let i = startIdx; i < rows.length; i++) {
    const r = rows[i];
    if (r.every(cell => !cell.trim())) continue;
    
    const identifier = r[0]?.trim() || '';
    const comment = r[1]?.trim() || '';
    const nameSnapshot = r[2]?.trim() || '';
    
    if (identifier || comment) {
      parsed.push({ identifier, comment, nameSnapshot });
    }
  }
  
  return parsed;
};

function MonthlyReportCommentsContent() {
  const { profile } = useAuth();
  const { activeYear, activeSemester } = useAcademicYear();

  // Selected parameters
  const [selectedYear, setSelectedYear] = React.useState<string>('2026/2027');
  const [selectedSemester, setSelectedSemester] = React.useState<string>('1');
  const [selectedMonth, setSelectedMonth] = React.useState<string>('');
  const [selectedClassId, setSelectedClassId] = React.useState<string>('');

  // Dropdown list & student roster
  const [classesList, setClassesList] = React.useState<Class[]>([]);
  const [loadingClasses, setLoadingClasses] = React.useState<boolean>(false);
  const [students, setStudents] = React.useState<Student[]>([]);
  const [loadingStudents, setLoadingStudents] = React.useState<boolean>(false);
  const [searchQuery, setSearchQuery] = React.useState<string>('');

  // Comment records map (studentId -> Comment object)
  const [commentsMap, setCommentsMap] = React.useState<Record<string, JuniorHighMonthlyReportComment>>({});
  const [loadingComments, setLoadingComments] = React.useState<boolean>(false);

  // Editor modal states
  const [editingStudent, setEditingStudent] = React.useState<Student | null>(null);
  const [commentText, setCommentText] = React.useState<string>('');
  const [editorStatus, setEditorStatus] = React.useState<'DRAFT' | 'FINAL'>('DRAFT');
  const [isSavingComment, setIsSavingComment] = React.useState<boolean>(false);
  const [showWarning, setShowWarning] = React.useState<boolean>(false);

  // Unsaved changes protection states
  const [initialCommentText, setInitialCommentText] = React.useState<string>('');
  const [initialEditorStatus, setInitialEditorStatus] = React.useState<'DRAFT' | 'FINAL'>('DRAFT');
  const [showUnsavedDialog, setShowUnsavedDialog] = React.useState<boolean>(false);
  const [unsavedChangesAction, setUnsavedChangesAction] = React.useState<(() => void) | null>(null);

  // Copy previous comments states
  const [showCopyModal, setShowCopyModal] = React.useState<boolean>(false);
  const [sourceYear, setSourceYear] = React.useState<string>('2026/2027');
  const [sourceSemester, setSourceSemester] = React.useState<string>('1');
  const [sourceMonth, setSourceMonth] = React.useState<string>('');
  const [sourceClassId, setSourceClassId] = React.useState<string>('');
  const [sourceClasses, setSourceClasses] = React.useState<Class[]>([]);
  const [loadingSourceClasses, setLoadingSourceClasses] = React.useState<boolean>(false);
  const [sourceCommentsMap, setSourceCommentsMap] = React.useState<Record<string, JuniorHighMonthlyReportComment>>({});
  const [loadingSourceComments, setLoadingSourceComments] = React.useState<boolean>(false);
  const [overwriteDraftComments, setOverwriteDraftComments] = React.useState<boolean>(false);
  const [isCopying, setIsCopying] = React.useState<boolean>(false);

  // Import / Paste comments states
  const [showImportModal, setShowImportModal] = React.useState<boolean>(false);
  const [importMode, setImportMode] = React.useState<'UPLOAD' | 'PASTE'>('UPLOAD');
  const [importText, setImportText] = React.useState<string>('');
  const [parsedRows, setParsedRows] = React.useState<{ identifier: string; comment: string; nameSnapshot?: string }[]>([]);
  const [importFile, setImportFile] = React.useState<File | null>(null);
  const [showDraftOverwriteOption, setShowDraftOverwriteOption] = React.useState<boolean>(false);
  const [isImporting, setIsImporting] = React.useState<boolean>(false);

  // Indonesian Comment Generator States
  // Indonesian Comment Generator States (Midterm Pattern)
  const [showGeneratorModal, setShowGeneratorModal] = React.useState<boolean>(false);
  const [generatorStudent, setGeneratorStudent] = React.useState<Student | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<string>('ACADEMIC_INDEPENDENCE');
  const [genNickname, setGenNickname] = React.useState<string>('');
  const [genGender, setGenGender] = React.useState<'MALE' | 'FEMALE'>('MALE');
  const [genStrengths, setGenStrengths] = React.useState<string[]>([]);
  const [genAchievements, setGenAchievements] = React.useState<string[]>([]);
  const [genNeeds, setGenNeeds] = React.useState<string[]>([]);
  const [genManualNotes, setGenManualNotes] = React.useState<string>('');
  const [genDraftText, setGenDraftText] = React.useState<string>('');
  const [genAttendance, setGenAttendance] = React.useState<{ sickLeave: number; excusedLeave: number; absent: number } | null>(null);
  const [genLearningJourney, setGenLearningJourney] = React.useState<string>('');
  const [genReflection, setGenReflection] = React.useState<string>('');
  const [loadingContextData, setLoadingContextData] = React.useState<boolean>(false);
  const [isGeneratingAI, setIsGeneratingAI] = React.useState<boolean>(false);
  const [isPolishingAI, setIsPolishingAI] = React.useState<boolean>(false);

  // Approver role check (Super Admin OR Kepala Unit SMP)
  const isApprover = React.useMemo(() => {
    return isJuniorHighApprover(profile);
  }, [profile]);

  // Inline history states (Eye toggle, NOT popup)
  const [expandedHistoryStudentIds, setExpandedHistoryStudentIds] = React.useState<Record<string, boolean>>({});
  const [historyDataMap, setHistoryDataMap] = React.useState<Record<string, PreviousGencomHistoryItem[]>>({});
  const [loadingHistoryMap, setLoadingHistoryMap] = React.useState<Record<string, boolean>>({});

  const toggleStudentHistory = async (studentId: string) => {
    const isCurrentlyExpanded = !!expandedHistoryStudentIds[studentId];
    if (isCurrentlyExpanded) {
      setExpandedHistoryStudentIds(prev => ({ ...prev, [studentId]: false }));
      return;
    }

    setExpandedHistoryStudentIds(prev => ({ ...prev, [studentId]: true }));

    // Fetch history if not already loaded
    if (!historyDataMap[studentId]) {
      setLoadingHistoryMap(prev => ({ ...prev, [studentId]: true }));
      try {
        const history = await fetchStudentPreviousGencomHistory(
          studentId,
          selectedYear,
          selectedMonth,
          selectedSemester
        );
        setHistoryDataMap(prev => ({ ...prev, [studentId]: history }));
      } catch (err) {
        console.error('Error fetching student gencom history:', err);
        toast.error('Gagal memuat riwayat komentar sebelumnya.');
      } finally {
        setLoadingHistoryMap(prev => ({ ...prev, [studentId]: false }));
      }
    }
  };

  // Review & Approval Checkbox selection states
  const [selectedStudentIds, setSelectedStudentIds] = React.useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = React.useState<'ALL' | 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REVISION_REQUESTED'>('ALL');

  // Revision Modal states (Mandatory feedback, applied to all selected students)
  const [showRevisionModal, setShowRevisionModal] = React.useState<boolean>(false);
  const [revisionFeedbackText, setRevisionFeedbackText] = React.useState<string>('');
  const [pendingRevisionTargetIds, setPendingRevisionTargetIds] = React.useState<string[]>([]);
  const [isSubmittingRevision, setIsSubmittingRevision] = React.useState<boolean>(false);
  const [isProcessingBulkAction, setIsProcessingBulkAction] = React.useState<boolean>(false);

  const handleToggleSelectStudent = (studentId: string) => {
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  };

  const handleSelectAllFiltered = (studentsToSelect: Student[]) => {
    const allSelected = studentsToSelect.length > 0 && studentsToSelect.every(s => selectedStudentIds.has(s.id));
    if (allSelected) {
      setSelectedStudentIds(new Set());
    } else {
      setSelectedStudentIds(new Set(studentsToSelect.map(s => s.id)));
    }
  };

  // Bulk Submit for Review (DRAFT / REVISION_REQUESTED -> SUBMITTED)
  const handleBulkSubmitForReview = async () => {
    const eligibleComments = Array.from(selectedStudentIds)
      .map(id => commentsMap[id])
      .filter((c): c is JuniorHighMonthlyReportComment => {
        if (!c || !c.generalComment || !c.generalComment.trim()) return false;
        const rev = c.reviewStatus || 'DRAFT';
        return rev === 'DRAFT' || rev === 'REVISION_REQUESTED';
      });

    if (eligibleComments.length === 0) {
      toast.error('Tidak ada komentar terpilih yang memenuhi syarat untuk diajukan (harus berisi teks dan berstatus Draft/Perlu Revisi).');
      return;
    }

    setIsProcessingBulkAction(true);
    try {
      const res = await submitMonthlyCommentsForReview(eligibleComments, {
        uid: profile?.uid || 'unknown',
        displayName: profile?.displayName || profile?.email || 'Guru',
        email: profile?.email || 'unknown',
        role: profile?.role || 'TEACHER'
      });

      if (res.successCount > 0) {
        toast.success(`Berhasil mengajukan ${res.successCount} komentar untuk review.`);
        await loadRosterAndComments();
        setSelectedStudentIds(new Set());
      }
      if (res.errors.length > 0) {
        toast.error(`Beberapa komentar gagal diajukan: ${res.errors.join(', ')}`);
      }
    } catch (err: any) {
      console.error('Error submitting comments for review:', err);
      toast.error(err.message || 'Gagal mengajukan komentar.');
    } finally {
      setIsProcessingBulkAction(false);
    }
  };

  // Bulk Approve (SUBMITTED -> APPROVED)
  const handleBulkApprove = async () => {
    if (!isApprover) {
      toast.error('Hanya Kepala Unit SMP atau Super Admin yang dapat menyetujui komentar.');
      return;
    }

    const eligibleComments = Array.from(selectedStudentIds)
      .map(id => commentsMap[id])
      .filter((c): c is JuniorHighMonthlyReportComment => {
        if (!c) return false;
        return c.reviewStatus === 'SUBMITTED';
      });

    if (eligibleComments.length === 0) {
      toast.error('Tidak ada komentar terpilih yang berstatus Diajukan (SUBMITTED).');
      return;
    }

    setIsProcessingBulkAction(true);
    try {
      const res = await approveMonthlyComments(eligibleComments, {
        uid: profile?.uid || 'unknown',
        displayName: profile?.displayName || profile?.email || 'Reviewer',
        email: profile?.email || 'unknown',
        role: profile?.role || 'HEAD_JUNIOR'
      });

      if (res.successCount > 0) {
        toast.success(`Berhasil menyetujui (Approve) ${res.successCount} komentar siswa.`);
        await loadRosterAndComments();
        setSelectedStudentIds(new Set());
      }
      if (res.errors.length > 0) {
        toast.error(`Beberapa komentar gagal disetujui: ${res.errors.join(', ')}`);
      }
    } catch (err: any) {
      console.error('Error approving comments:', err);
      toast.error(err.message || 'Gagal menyetujui komentar.');
    } finally {
      setIsProcessingBulkAction(false);
    }
  };

  // Open Revision Modal (Single or Bulk)
  const handleOpenRevisionModal = (targetStudentIds: string[]) => {
    if (!isApprover) {
      toast.error('Hanya Kepala Unit SMP atau Super Admin yang dapat meminta revisi komentar.');
      return;
    }
    setPendingRevisionTargetIds(targetStudentIds);
    setRevisionFeedbackText('');
    setShowRevisionModal(true);
  };

  // Confirm Revision (Mandatory Feedback)
  const handleConfirmRevision = async () => {
    const feedback = revisionFeedbackText.trim();
    if (!feedback) {
      toast.error('Catatan/feedback revisi wajib diisi agar guru mengetahui bagian yang perlu diperbaiki.');
      return;
    }

    const targetComments = pendingRevisionTargetIds
      .map(id => commentsMap[id])
      .filter((c): c is JuniorHighMonthlyReportComment => Boolean(c));

    if (targetComments.length === 0) {
      toast.error('Komentar siswa tidak ditemukan.');
      setShowRevisionModal(false);
      return;
    }

    setIsSubmittingRevision(true);
    try {
      const res = await requestRevisionMonthlyComments(targetComments, feedback, {
        uid: profile?.uid || 'unknown',
        displayName: profile?.displayName || profile?.email || 'Reviewer',
        email: profile?.email || 'unknown',
        role: profile?.role || 'HEAD_JUNIOR'
      });

      if (res.successCount > 0) {
        toast.success(`Permintaan revisi berhasil dikirim untuk ${res.successCount} siswa.`);
        await loadRosterAndComments();
        setShowRevisionModal(false);
        setSelectedStudentIds(new Set());
        setPendingRevisionTargetIds([]);
        setRevisionFeedbackText('');
      }
    } catch (err: any) {
      console.error('Error requesting revision:', err);
      toast.error(err.message || 'Gagal mengirim permintaan revisi.');
    } finally {
      setIsSubmittingRevision(false);
    }
  };

  // Single Action: Open Revision (Unlock approved/submitted comment)
  const handleOpenRevision = async (studentId: string) => {
    const comment = commentsMap[studentId];
    if (!comment) return;

    if (!isApprover) {
      toast.error('Hanya Kepala Unit SMP atau Super Admin yang dapat membuka revisi.');
      return;
    }

    const confirmOpen = window.confirm(`Buka revisi komentar siswa ${comment.studentNameSnapshot}? Komentar akan dapat diedit kembali oleh guru.`);
    if (!confirmOpen) return;

    try {
      await openRevisionMonthlyComment(comment, {
        uid: profile?.uid || 'unknown',
        displayName: profile?.displayName || profile?.email || 'Reviewer',
        email: profile?.email || 'unknown',
        role: profile?.role || 'HEAD_JUNIOR'
      });
      toast.success(`Revisi dibuka untuk ${comment.studentNameSnapshot}. Guru dapat mengedit komentar kembali.`);
      await loadRosterAndComments();
    } catch (err: any) {
      console.error('Error opening revision:', err);
      toast.error(err.message || 'Gagal membuka revisi.');
    }
  };

  // Single Action: Submit for review
  const handleSingleSubmit = async (studentId: string) => {
    const comment = commentsMap[studentId];
    if (!comment || !comment.generalComment?.trim()) {
      toast.error('Komentar masih kosong. Tulis atau generate komentar terlebih dahulu.');
      return;
    }

    try {
      await submitMonthlyCommentsForReview([comment], {
        uid: profile?.uid || 'unknown',
        displayName: profile?.displayName || profile?.email || 'Guru',
        email: profile?.email || 'unknown',
        role: profile?.role || 'TEACHER'
      });
      toast.success(`Komentar ${comment.studentNameSnapshot} berhasil diajukan untuk review.`);
      await loadRosterAndComments();
    } catch (err: any) {
      console.error('Error submitting comment:', err);
      toast.error(err.message || 'Gagal mengajukan komentar.');
    }
  };

  // Single Action: Approve
  const handleSingleApprove = async (studentId: string) => {
    const comment = commentsMap[studentId];
    if (!comment) return;

    if (!isApprover) {
      toast.error('Hanya Kepala Unit SMP atau Super Admin yang dapat menyetujui komentar.');
      return;
    }

    try {
      await approveMonthlyComments([comment], {
        uid: profile?.uid || 'unknown',
        displayName: profile?.displayName || profile?.email || 'Reviewer',
        email: profile?.email || 'unknown',
        role: profile?.role || 'HEAD_JUNIOR'
      });
      toast.success(`Komentar ${comment.studentNameSnapshot} disetujui (APPROVED).`);
      await loadRosterAndComments();
    } catch (err: any) {
      console.error('Error approving comment:', err);
      toast.error(err.message || 'Gagal menyetujui komentar.');
    }
  };

  // Helper to count words in comment draft
  const countWords = (text: string) => {
    const trimmed = text.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  };

  const handleOpenGenerator = async (student: Student) => {
    setGeneratorStudent(student);
    const existing = commentsMap[student.id]?.generalComment || '';
    const sName = student.name || '';
    const firstName = sName.split(' ')[0] || sName;
    const detectedGender = (student.gender === 'P' || student.gender === 'FEMALE') ? 'FEMALE' : 'MALE';

    setGenNickname(firstName);
    setGenGender(detectedGender);
    setSelectedTemplateId('ACADEMIC_INDEPENDENCE');
    setGenStrengths([JH_MONTHLY_STRENGTHS_BANK[0]]);
    setGenAchievements([JH_MONTHLY_ACHIEVEMENTS_BANK[0]]);
    setGenNeeds([JH_MONTHLY_NEEDS_IMPROVEMENT_BANK[0]]);
    setGenManualNotes('');
    setGenDraftText(existing);
    setShowGeneratorModal(true);

    // Ingest authentic student monthly context
    setLoadingContextData(true);
    try {
      // 1. Fetch Class Summary
      let summaryText = '';
      if (selectedClassId && selectedMonth) {
        const summaryDocId = `${selectedClassId}_${selectedYear.replace(/\//g, '-')}_${selectedSemester}_${selectedMonth}`;
        const summarySnap = await getDoc(doc(db, 'class_report_summaries', summaryDocId));
        if (summarySnap.exists()) {
          const sData = summarySnap.data();
          const ljTitle = sData?.sections?.learningJourney?.title || '';
          const ljSummary = sData?.sections?.learningJourney?.summary || '';
          summaryText = `${ljTitle}: ${ljSummary}`.trim();
        }
      }
      setGenLearningJourney(summaryText);

      // 2. Fetch Attendance for selected month
      let attData = null;
      try {
        const attSnap = await getDoc(doc(db, 'jh_monthly_attendance', `${student.id}_${selectedMonth}`));
        if (attSnap.exists()) {
          const data = attSnap.data();
          attData = {
            sickLeave: data.sickLeave ?? 0,
            excusedLeave: data.excusedLeave ?? 0,
            absent: data.absent ?? 0,
          };
        }
      } catch (attErr) {
        console.warn('Could not load monthly attendance record:', attErr);
      }
      setGenAttendance(attData);

      // 3. Fetch Self-Exploration approved reflection
      let reflText = '';
      try {
        const qRefl = query(
          collection(db, 'seMonthlyReflections'),
          where('studentId', '==', student.id),
          where('periodKey', '==', selectedMonth),
          where('status', '==', 'APPROVED')
        );
        const reflSnap = await getDocs(qRefl);
        if (!reflSnap.empty) {
          const docs = reflSnap.docs.map(d => d.data());
          reflText = docs.map(d => `${d.activityNameSnapshot || 'Eksplorasi'}: ${d.reflectionText || ''}`).join('; ');
        }
      } catch (reflErr) {
        console.warn('Could not load self-exploration reflections:', reflErr);
      }
      setGenReflection(reflText);
    } catch (loadErr) {
      console.warn('Error ingesting monthly report context:', loadErr);
    } finally {
      setLoadingContextData(false);
    }
  };

  const handleGenerateAI = async () => {
    if (!generatorStudent) return;
    setIsGeneratingAI(true);
    try {
      const attSummary = genAttendance
        ? `Sakit: ${genAttendance.sickLeave}, Izin: ${genAttendance.excusedLeave}, Alpa: ${genAttendance.absent}`
        : 'Kehadiran tertib';

      const generated = await generateMonthlyGeneralCommentAI({
        studentName: generatorStudent.name,
        nickname: genNickname.trim() || undefined,
        gender: genGender,
        monthPeriod: selectedMonth ? getIndonesianMonthLabel(selectedMonth) : undefined,
        learningContext: genLearningJourney || undefined,
        attendanceSummary: attSummary,
        reflectionSummary: genReflection || undefined,
        strengths: genStrengths,
        achievements: genAchievements,
        needsImprovement: genNeeds,
        manualNotes: genManualNotes.trim() || undefined,
      });

      setGenDraftText(generated);
      toast.success('Draf komentar berhasil di-generate dengan AI (Bahasa Indonesia).');
    } catch (err: any) {
      console.error('AI Generation error:', err);
      toast.error(err.message || 'Gagal generate AI. Menggunakan penyusunan narasi terstruktur...');
      // Deterministic fallback if API endpoint errors
      handleGenerateDraftNarrative();
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handlePolishAI = async () => {
    if (!genDraftText.trim()) {
      toast.error('Ketik atau generate draf komentar terlebih dahulu sebelum merapikan.');
      return;
    }
    setIsPolishingAI(true);
    try {
      const polished = await refineMonthlyGeneralCommentAI({
        studentName: generatorStudent?.name,
        nickname: genNickname.trim() || undefined,
        originalComment: genDraftText,
      });
      setGenDraftText(polished);
      toast.success('Komentar berhasil dirapikan dan disempurnakan oleh AI.');
    } catch (err: any) {
      console.error('Polish AI error:', err);
      toast.error(err.message || 'Gagal merapikan dengan AI.');
    } finally {
      setIsPolishingAI(false);
    }
  };

  const handleGenerateDraftNarrative = () => {
    if (!generatorStudent) return;
    const callName = genNickname.trim() || generatorStudent.name.split(' ')[0] || generatorStudent.name;

    if (genStrengths.length === 0 && genAchievements.length === 0 && genNeeds.length === 0 && !genManualNotes.trim()) {
      toast.error('Silakan pilih minimal satu aspek perkembangan atau tulis catatan khusus untuk siswa.');
      return;
    }

    const attSummary = genAttendance
      ? `Sakit: ${genAttendance.sickLeave}, Izin: ${genAttendance.excusedLeave}, Alpa: ${genAttendance.absent}`
      : 'Kehadiran tertib';

    const result = generateDeterministicMonthlyComment({
      studentName: generatorStudent.name,
      nickname: callName,
      gender: genGender,
      templateId: selectedTemplateId,
      learningContext: genLearningJourney,
      attendanceSummary: attSummary,
      reflectionSummary: genReflection,
      strengths: genStrengths,
      achievements: genAchievements,
      needsImprovement: genNeeds,
      manualNotes: genManualNotes.trim() || undefined,
    });

    setGenDraftText(result);
    toast.success('Draf komentar naratif berhasil dirangkai.');
  };

  const handleApplyGeneratedToEditor = () => {
    if (!genDraftText.trim()) {
      toast.error('Draf komentar masih kosong. Klik tombol Generate AI atau Rangkai Narasi terlebih dahulu.');
      return;
    }

    if (!generatorStudent) return;
    const existing = commentsMap[generatorStudent.id];

    // Protection rule 1: Never overwrite FINAL comments
    if (existing?.status === 'FINAL') {
      toast.error('Komentar siswa ini sudah berstatus FINAL (Terkunci). Buka status menjadi DRAFT terlebih dahulu jika ingin merevisi.');
      return;
    }

    // Protection rule 2: Confirm before overwriting filled draft
    if (existing?.status === 'DRAFT' && existing.generalComment.trim().length > 0) {
      const confirmReplace = window.confirm(
        `Siswa "${generatorStudent.name}" sudah memiliki draf komentar:\n\n"${existing.generalComment.slice(0, 100)}..."\n\nApakah Anda yakin ingin menimpanya dengan draf hasil generate baru?`
      );
      if (!confirmReplace) return;
    }

    // Apply to editor state
    setEditingStudent(generatorStudent);
    setCommentText(genDraftText.trim());
    setEditorStatus('DRAFT');
    setInitialCommentText(existing?.generalComment || '');
    setInitialEditorStatus(existing?.status || 'DRAFT');
    setShowWarning(false);
    setShowGeneratorModal(false);
    toast.success('Draf komentar berhasil dipindahkan ke editor. Silakan periksa dan Simpan Draft.');
  };


  // Initialize dates and default values
  React.useEffect(() => {
    if (activeYear) setSelectedYear(activeYear);
    if (activeSemester) setSelectedSemester(String(activeSemester));

    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(currentMonthStr);
  }, [activeYear, activeSemester]);

  // Fetch Junior High Classes
  React.useEffect(() => {
    const fetchJHClasses = async () => {
      setLoadingClasses(true);
      try {
        const [all, enrollmentsSnap] = await Promise.all([
          getClasses(),
          getDocs(query(
            collection(db, 'enrollments'),
            where('academicYear', '==', selectedYear),
            where('status', '==', 'active')
          ))
        ]);

        const activeClassKeys = new Set<string>();
        enrollmentsSnap.docs.forEach(d => {
          const e = d.data();
          if (e.classId) {
            activeClassKeys.add(e.classId);
          }
        });

        const jhClasses = (all || []).filter(c => {
          const isJH = c.unitId === 'JUNIOR_HIGH';
          const isActiveYear = c.academicYear === selectedYear;
          const isNotArchived = c.status !== 'archived';
          
          if (!isJH || !isActiveYear || !isNotArchived) return false;

          const hasEnrolledStudent = activeClassKeys.has(c.id) || 
                                     activeClassKeys.has(c.name) || 
                                     ((c as any).classId && activeClassKeys.has((c as any).classId));
          return hasEnrolledStudent;
        });

        // Filter based on teacher role assignments if applicable
        let filteredClasses = jhClasses;
        if (profile?.role === 'TEACHER' || profile?.role === 'HOMEROOM_TEACHER') {
          filteredClasses = jhClasses.filter(c => isTeacherAssignedToClass(c, profile?.uid || ''));
        }

        setClassesList(filteredClasses);

        // Selection Behavior:
        // Clear if not valid in the new context, otherwise keep it
        if (selectedClassId) {
          const isStillEligible = filteredClasses.some(c => c.id === selectedClassId);
          if (!isStillEligible) {
            setSelectedClassId('');
          }
        } else {
          setSelectedClassId('');
        }
      } catch (err) {
        console.error('Error loading Junior High classes:', err);
        toast.error('Gagal memuat daftar kelas');
      } finally {
        setLoadingClasses(false);
      }
    };
    fetchJHClasses();
  }, [selectedYear, profile]);

  // Fetch Students & Comments when filters change
  const loadRosterAndComments = async () => {
    if (!selectedClassId || !selectedYear) {
      setStudents([]);
      setCommentsMap({});
      return;
    }

    setLoadingStudents(true);
    setLoadingComments(true);
    try {
      // 1. Fetch active students in class
      const list = await getActiveStudents(selectedClassId, selectedYear);
      
      // Sort: attendanceNumber/noAbsen/rollNumber/rosterNumber, fallback to name A-Z
      const sorted = (list || []).sort((a, b) => {
        const numA = a.attendanceNumber ?? a.noAbsen ?? a.rollNumber ?? a.rosterNumber ?? 999;
        const numB = b.attendanceNumber ?? b.noAbsen ?? b.rollNumber ?? b.rosterNumber ?? 999;
        if (numA !== numB) {
          return numA - numB;
        }
        return a.name.localeCompare(b.name);
      });
      setStudents(sorted);

      // 2. Fetch comments for this context
      const q = query(
        collection(db, 'junior_high_monthly_report_comments'),
        where('classId', '==', selectedClassId),
        where('academicYear', '==', selectedYear),
        where('semester', '==', selectedSemester),
        where('periodKey', '==', selectedMonth)
      );
      const snap = await getDocs(q);
      const map: Record<string, JuniorHighMonthlyReportComment> = {};
      snap.docs.forEach(doc => {
        const data = doc.data() as JuniorHighMonthlyReportComment;
        if (data.studentId) {
          map[data.studentId] = { ...data, id: doc.id };
        }
      });
      setCommentsMap(map);
    } catch (err) {
      console.error('Error loading roster and comments:', err);
      toast.error('Gagal memuat data siswa atau komentar');
    } finally {
      setLoadingStudents(false);
      setLoadingComments(false);
    }
  };

  React.useEffect(() => {
    if (selectedClassId && selectedYear && selectedSemester && selectedMonth) {
      loadRosterAndComments();
    } else {
      setStudents([]);
      setCommentsMap({});
    }
  }, [selectedClassId, selectedYear, selectedSemester, selectedMonth]);

  // Check if current edited comment has unsaved changes
  const hasUnsavedChanges = React.useMemo(() => {
    if (!editingStudent) return false;
    return commentText !== initialCommentText || editorStatus !== initialEditorStatus;
  }, [editingStudent, commentText, initialCommentText, editorStatus, initialEditorStatus]);

  // Guard transition callback
  const confirmTransition = (action: () => void) => {
    if (hasUnsavedChanges) {
      setUnsavedChangesAction(() => action);
      setShowUnsavedDialog(true);
    } else {
      action();
    }
  };

  // Register browser beforeunload event for unsaved changes
  React.useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (editingStudent && hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = 'Perubahan belum disimpan.';
        return 'Perubahan belum disimpan.';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [editingStudent, hasUnsavedChanges]);

  // Open Comment Editor Modal
  const handleOpenEditor = (student: Student) => {
    const existing = commentsMap[student.id];
    if (existing?.reviewStatus === 'SUBMITTED' || existing?.reviewStatus === 'APPROVED') {
      toast.error('Komentar ini telah diajukan atau disetujui dan dikunci. Buka revisi terlebih dahulu melalui Kepala Unit/Admin.');
      return;
    }

    setEditingStudent(student);
    const text = existing ? existing.generalComment : '';
    const status = existing ? existing.status : 'DRAFT';
    setCommentText(text);
    setEditorStatus(status);
    setInitialCommentText(text);
    setInitialEditorStatus(status);
    // If status is FINAL, show a caution warning block
    setShowWarning(status === 'FINAL');
  };

  // Close Editor Modal
  const handleCloseEditor = () => {
    setEditingStudent(null);
    setCommentText('');
    setEditorStatus('DRAFT');
    setShowWarning(false);
    setInitialCommentText('');
    setInitialEditorStatus('DRAFT');
  };

  // Save Comment to Firestore
  const handleSaveComment = async (targetStatus: 'DRAFT' | 'FINAL') => {
    if (!editingStudent || !selectedClassId || !selectedMonth) return;

    const selectedClassObj = classesList.find(c => c.id === selectedClassId);
    if (profile?.role === 'TEACHER' || profile?.role === 'HOMEROOM_TEACHER') {
      const authorized = selectedClassObj ? isTeacherAssignedToClass(selectedClassObj, profile?.uid || '') : false;
      if (!authorized) {
        toast.error('Anda tidak memiliki otorisasi untuk mengelola kelas ini.');
        return;
      }
    }

    setIsSavingComment(true);
    try {
      const studentId = editingStudent.id;
      const academicYearNormalized = selectedYear.replace(/\//g, '-');
      const docId = `JUNIOR_HIGH_MONTHLY_COMMENT_${studentId}_${selectedClassId}_${academicYearNormalized}_${selectedSemester}_${selectedMonth}`;
      
      const gradeStr = selectedClassObj?.gradeLevel !== undefined 
        ? `Grade ${selectedClassObj.gradeLevel}` 
        : (editingStudent.grade !== undefined ? `Grade ${editingStudent.grade}` : 'Junior High');

      const docRef = doc(db, 'junior_high_monthly_report_comments', docId);
      const existingDoc = commentsMap[studentId];

      const actorName = profile?.displayName || profile?.email || 'Guru';
      const actorUid = profile?.uid || 'unknown';

      const payload: JuniorHighMonthlyReportComment = {
        unit: 'JUNIOR_HIGH',
        reportType: 'MONTHLY_PROGRESS',
        studentId,
        studentNameSnapshot: editingStudent.name,
        classId: selectedClassId,
        classNameSnapshot: selectedClassObj?.name || '',
        gradeSnapshot: gradeStr,
        academicYear: selectedYear,
        semester: selectedSemester,
        periodKey: selectedMonth,
        periodLabel: getIndonesianMonthLabel(selectedMonth),
        generalComment: commentText,
        status: targetStatus,
        createdBy: existingDoc?.createdBy || profile?.email || 'unknown',
        createdAt: existingDoc?.createdAt || new Date().toISOString(),
        createdByName: existingDoc?.createdByName || actorName,
        createdByUid: existingDoc?.createdByUid || actorUid,
        updatedBy: profile?.email || 'unknown',
        updatedAt: new Date().toISOString(),
        updatedByName: actorName,
        updatedByUid: actorUid,
        version: (existingDoc?.version || 1) + 1,
        reviewStatus: existingDoc?.reviewStatus || 'DRAFT'
      };

      await setDoc(docRef, payload);

      // Update local state map
      setCommentsMap(prev => ({
        ...prev,
        [studentId]: { ...payload, id: docId }
      }));

      toast.success(
        targetStatus === 'FINAL' 
          ? `Komentar ${editingStudent.name} berhasil disimpan sebagai FINAL!` 
          : `Draft komentar ${editingStudent.name} berhasil disimpan.`
      );
      handleCloseEditor();
    } catch (err) {
      console.error('Error saving student comment:', err);
      toast.error('Gagal menyimpan komentar siswa');
    } finally {
      setIsSavingComment(false);
    }
  };

  // Helper chunked batch saver (up to 100 docs per chunk for absolute safety)
  const saveInBatches = async (payloads: { docRef: any; data: any }[]) => {
    const CHUNK_SIZE = 100;
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < payloads.length; i += CHUNK_SIZE) {
      const chunk = payloads.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach(p => {
        batch.set(p.docRef, p.data);
      });
      try {
        await batch.commit();
        successCount += chunk.length;
      } catch (err) {
        console.error('Error committing batch chunk:', err);
        failCount += chunk.length;
      }
    }
    return { successCount, failCount };
  };

  // Initialize Copy Modal States
  const handleOpenCopyModal = () => {
    setSourceYear(selectedYear);
    setSourceSemester(selectedSemester);
    const prevMonth = getPreviousMonthKey(selectedMonth) || selectedMonth;
    setSourceMonth(prevMonth);
    setSourceClassId(selectedClassId);
    setOverwriteDraftComments(false);
    setShowCopyModal(true);
  };

  // Fetch Source Classes
  React.useEffect(() => {
    if (!showCopyModal) return;
    const fetchSourceClasses = async () => {
      setLoadingSourceClasses(true);
      try {
        const all = await getClasses();
        const jhClasses = (all || []).filter(c => 
          c.unitId === 'JUNIOR_HIGH' && 
          c.academicYear === sourceYear && 
          c.status !== 'archived'
        );
        let filtered = jhClasses;
        if (profile?.role === 'TEACHER' || profile?.role === 'HOMEROOM_TEACHER') {
          filtered = jhClasses.filter(c => isTeacherAssignedToClass(c, profile?.uid || ''));
        }
        setSourceClasses(filtered);
        if (!filtered.some(c => c.id === sourceClassId)) {
          setSourceClassId(filtered[0]?.id || '');
        }
      } catch (err) {
        console.error('Error fetching source classes:', err);
      } finally {
        setLoadingSourceClasses(false);
      }
    };
    fetchSourceClasses();
  }, [sourceYear, showCopyModal, profile]);

  // Fetch Source Comments
  React.useEffect(() => {
    if (!showCopyModal || !sourceClassId || !sourceYear || !sourceSemester || !sourceMonth) {
      setSourceCommentsMap({});
      return;
    }
    const fetchSourceComments = async () => {
      setLoadingSourceComments(true);
      try {
        const q = query(
          collection(db, 'junior_high_monthly_report_comments'),
          where('classId', '==', sourceClassId),
          where('academicYear', '==', sourceYear),
          where('semester', '==', sourceSemester),
          where('periodKey', '==', sourceMonth)
        );
        const snap = await getDocs(q);
        const map: Record<string, JuniorHighMonthlyReportComment> = {};
        snap.docs.forEach(doc => {
          const data = doc.data() as JuniorHighMonthlyReportComment;
          if (data.studentId) {
            map[data.studentId] = { ...data, id: doc.id };
          }
        });
        setSourceCommentsMap(map);
      } catch (err) {
        console.error('Error fetching source comments:', err);
      } finally {
        setLoadingSourceComments(false);
      }
    };
    fetchSourceComments();
  }, [sourceYear, sourceSemester, sourceMonth, sourceClassId, showCopyModal]);

  // Live matching & preview calculations for Copy operation
  const copyPreviewList = React.useMemo(() => {
    return students.map(student => {
      const sourceComment = sourceCommentsMap[student.id];
      const targetComment = commentsMap[student.id];
      const sourceText = sourceComment?.generalComment || '';
      const hasSource = sourceText.trim().length > 0;
      
      let status: 'VALID' | 'WARNING' | 'ERROR' | 'LOCKED' = 'VALID';
      let message = '';
      let tindakan: 'Siap diimpor' | 'Lewati' | 'Terkunci' = 'Siap diimpor';
      let actionType: 'READY' | 'READY_OVERWRITE' | 'SKIP_EMPTY_SOURCE' | 'SKIP_DRAFT_FILLED' | 'LOCKED_FINAL' = 'READY';

      if (!hasSource) {
        status = 'WARNING';
        message = 'Sumber komentar kosong';
        tindakan = 'Lewati';
        actionType = 'SKIP_EMPTY_SOURCE';
      } else if (targetComment?.status === 'FINAL') {
        status = 'LOCKED';
        message = 'Komentar target sudah FINAL (Terkunci)';
        tindakan = 'Terkunci';
        actionType = 'LOCKED_FINAL';
      } else if (targetComment?.status === 'DRAFT' && targetComment.generalComment.trim().length > 0) {
        if (overwriteDraftComments) {
          status = 'WARNING';
          message = 'Menimpa komentar DRAFT yang ada';
          tindakan = 'Siap diimpor';
          actionType = 'READY_OVERWRITE';
        } else {
          status = 'WARNING';
          message = 'Target sudah memiliki DRAFT (Dilewati)';
          tindakan = 'Lewati';
          actionType = 'SKIP_DRAFT_FILLED';
        }
      } else {
        status = 'VALID';
        message = 'Siap disalin';
        tindakan = 'Siap diimpor';
        actionType = 'READY';
      }

      return {
        student,
        sourceComment,
        targetComment,
        status,
        message,
        tindakan,
        actionType,
        sourceText
      };
    });
  }, [students, sourceCommentsMap, commentsMap, overwriteDraftComments]);

  // Live statistics for copy modal
  const copyStats = React.useMemo(() => {
    let ready = 0;
    let readyOverwrite = 0;
    let skipEmpty = 0;
    let skipDraft = 0;
    let lockedFinal = 0;

    copyPreviewList.forEach(item => {
      if (item.actionType === 'READY') ready++;
      else if (item.actionType === 'READY_OVERWRITE') readyOverwrite++;
      else if (item.actionType === 'SKIP_EMPTY_SOURCE') skipEmpty++;
      else if (item.actionType === 'SKIP_DRAFT_FILLED') skipDraft++;
      else if (item.actionType === 'LOCKED_FINAL') lockedFinal++;
    });

    return { ready, readyOverwrite, skipEmpty, skipDraft, lockedFinal };
  }, [copyPreviewList]);

  // Execute Copy Comments to Target
  const handleExecuteCopy = async () => {
    const itemsToCopy = copyPreviewList.filter(
      item => item.actionType === 'READY' || item.actionType === 'READY_OVERWRITE'
    );

    if (itemsToCopy.length === 0) {
      toast.error('Tidak ada komentar yang memenuhi syarat untuk disalin.');
      return;
    }

    const selectedClassObj = classesList.find(c => c.id === selectedClassId);
    if (profile?.role === 'TEACHER' || profile?.role === 'HOMEROOM_TEACHER') {
      const authorized = selectedClassObj ? isTeacherAssignedToClass(selectedClassObj, profile?.uid || '') : false;
      if (!authorized) {
        toast.error('Anda tidak memiliki otorisasi untuk mengelola kelas ini.');
        return;
      }
    }

    setIsCopying(true);
    try {
      const gradeStr = selectedClassObj?.gradeLevel !== undefined 
        ? `Grade ${selectedClassObj.gradeLevel}` 
        : 'Junior High';

      const payloads: { docRef: any; data: JuniorHighMonthlyReportComment; studentId: string }[] = [];

      itemsToCopy.forEach(item => {
        const studentId = item.student.id;
        const academicYearNormalized = selectedYear.replace(/\//g, '-');
        const docId = `JUNIOR_HIGH_MONTHLY_COMMENT_${studentId}_${selectedClassId}_${academicYearNormalized}_${selectedSemester}_${selectedMonth}`;
        const docRef = doc(db, 'junior_high_monthly_report_comments', docId);

        const payload: JuniorHighMonthlyReportComment = {
          unit: 'JUNIOR_HIGH',
          reportType: 'MONTHLY_PROGRESS',
          studentId,
          studentNameSnapshot: item.student.name,
          classId: selectedClassId,
          classNameSnapshot: selectedClassObj?.name || '',
          gradeSnapshot: gradeStr,
          academicYear: selectedYear,
          semester: selectedSemester,
          periodKey: selectedMonth,
          periodLabel: getIndonesianMonthLabel(selectedMonth),
          generalComment: item.sourceText,
          status: 'DRAFT', // copies are stored as DRAFT by default
          createdBy: item.targetComment?.createdBy || profile?.email || 'unknown',
          createdAt: item.targetComment?.createdAt || new Date().toISOString(),
          updatedBy: profile?.email || 'unknown',
          updatedAt: new Date().toISOString(),
          // Audit fields
          copiedFromCommentId: item.sourceComment?.id || '',
          copiedFromPeriodKey: sourceMonth,
          copiedAt: new Date().toISOString(),
          copiedBy: profile?.email || 'unknown'
        } as any;

        payloads.push({ docRef, data: payload, studentId });
      });

      const { successCount, failCount } = await saveInBatches(payloads);
      await loadRosterAndComments();

      if (failCount === 0) {
        toast.success(`Berhasil menyalin ${successCount} komentar siswa ke kelas target.`);
      } else {
        toast.warning(`Berhasil menyalin ${successCount} komentar, tetapi ${failCount} gagal.`);
      }

      setShowCopyModal(false);
    } catch (err) {
      console.error('Error executing copy comments:', err);
      toast.error('Gagal menyalin komentar');
    } finally {
      setIsCopying(false);
    }
  };

  // Excel / Template Downloads
  const handleDownloadTemplate = () => {
    const headers = ['studentId_or_NIS', 'studentName', 'generalComment'];
    const sampleData = students.map((s, idx) => {
      return {
        studentId_or_NIS: s.id, // ID is the NIS
        studentName: s.name,
        generalComment: `Komentar untuk ${s.name} bulan ini...`
      };
    });
    
    if (sampleData.length === 0) {
      sampleData.push({
        studentId_or_NIS: '2621009',
        studentName: 'Aisyah Larasati',
        generalComment: 'Aisyah menunjukkan perkembangan yang baik dalam...'
      });
    }

    const worksheet = XLSX.utils.json_to_sheet(sampleData, { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template_Komentar');
    XLSX.writeFile(workbook, 'Template_Import_Komentar_Rapor.xlsx');
    toast.success('Template impor berhasil diunduh.');
  };

  // Excel File upload processor
  const handleXLSXUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          toast.error('Gagal membaca berkas Excel.');
          return;
        }
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });

        if (json.length === 0) {
          toast.error('Berkas Excel kosong.');
          return;
        }

        const firstRowKeys = Object.keys(json[0]);
        let idKey = '';
        let commentKey = '';

        firstRowKeys.forEach(key => {
          const norm = normalizeHeaderKey(key);
          if (norm.includes('studentid') || norm === 'nis' || norm.includes('idor')) {
            idKey = key;
          } else if (norm.includes('comment') || norm.includes('komentar')) {
            commentKey = key;
          }
        });

        if (!idKey) {
          toast.error('Kolom identifier (ID/NIS) tidak ditemukan. Pastikan judul kolom sesuai template.');
          return;
        }
        if (!commentKey) {
          toast.error('Kolom komentar tidak ditemukan. Pastikan judul kolom berisi kata "comment" atau "komentar".');
          return;
        }

        const rows = json.map(item => ({
          identifier: String(item[idKey] || '').trim(),
          comment: String(item[commentKey] || '').trim(),
          nameSnapshot: item['studentName'] || item['nama'] || ''
        }));

        setParsedRows(rows);
        toast.success(`Berhasil memproses ${rows.length} baris dari Excel.`);
      } catch (err) {
        console.error('Error parsing Excel:', err);
        toast.error('Format berkas tidak valid atau tidak terbaca.');
      }
    };
    reader.readAsBinaryString(file);
  };

  // Paste spreadsheets handler
  const handlePasteParse = () => {
    if (!importText.trim()) {
      toast.error('Harap tempel data dari spreadsheet terlebih dahulu.');
      return;
    }
    const rows = parsePastedTSV(importText);
    if (rows.length === 0) {
      toast.error('Tidak ada data baris yang valid terdeteksi.');
      return;
    }
    setParsedRows(rows);
    toast.success(`Berhasil mengurai ${rows.length} baris dari tempelan.`);
  };

  // Live validations calculations for Import / Paste
  const importValidatedRows = React.useMemo(() => {
    const counts: Record<string, number> = {};
    parsedRows.forEach(r => {
      const id = r.identifier.trim();
      if (id) {
        counts[id] = (counts[id] || 0) + 1;
      }
    });

    return importValidatedRowsList(parsedRows, counts);

    function importValidatedRowsList(rows: typeof parsedRows, idCounts: Record<string, number>) {
      return rows.map((row, index) => {
        const lineNum = index + 2;
        const rawId = row.identifier.trim();
        const rawComment = row.comment.trim();

        let status: 'VALID' | 'WARNING' | 'ERROR' = 'VALID';
        let message = 'Siap diimpor';
        let tindakan: 'Siap diimpor' | 'Lewati' | 'Terkunci' | 'Error' = 'Siap diimpor';
        let studentName = row.nameSnapshot || '—';
        let studentId = '';
        let canImport = true;
        let isDraftOverlap = false;

        if (!rawId) {
          status = 'ERROR';
          message = 'NIS (ID Siswa) kosong';
          tindakan = 'Error';
          canImport = false;
        } else if (idCounts[rawId] > 1) {
          status = 'ERROR';
          message = 'NIS duplikat dalam berkas';
          tindakan = 'Error';
          canImport = false;
        } else {
          const matched = students.find(s => s.id === rawId || s.nis === rawId);
          if (!matched) {
            status = 'ERROR';
            message = 'Siswa tidak terdaftar di kelas aktif';
            tindakan = 'Error';
            canImport = false;
          } else {
            studentId = matched.id;
            studentName = matched.name;
            
            const targetComment = commentsMap[studentId];
            if (!rawComment) {
              status = 'WARNING';
              message = 'Komentar kosong (akan dilewati)';
              tindakan = 'Lewati';
              canImport = false;
            } else if (targetComment?.status === 'FINAL') {
              status = 'WARNING';
              message = 'Komentar target sudah FINAL (Terkunci)';
              tindakan = 'Terkunci';
              canImport = false;
            } else if (targetComment?.status === 'DRAFT' && targetComment.generalComment.trim().length > 0) {
              isDraftOverlap = true;
              if (showDraftOverwriteOption) {
                status = 'WARNING';
                message = 'Akan menimpa DRAFT yang ada';
                tindakan = 'Siap diimpor';
                canImport = true;
              } else {
                status = 'WARNING';
                message = 'Target sudah memiliki DRAFT (Dilewati)';
                tindakan = 'Lewati';
                canImport = false;
              }
            }
          }
        }

        return {
          lineNum,
          identifier: rawId,
          comment: rawComment,
          studentId,
          studentName,
          status,
          message,
          tindakan,
          canImport,
          isDraftOverlap
        };
      });
    }
  }, [parsedRows, students, commentsMap, showDraftOverwriteOption]);

  // Live stats calculation for Import Modal
  const importStats = React.useMemo(() => {
    let errorCount = 0;
    let warningCount = 0;
    let validCount = 0;
    let skipCount = 0;
    let draftOverlapCount = 0;

    importValidatedRows.forEach(r => {
      if (r.status === 'ERROR') errorCount++;
      else if (r.status === 'WARNING') {
        warningCount++;
        if (r.isDraftOverlap) draftOverlapCount++;
        if (!r.canImport) skipCount++;
      }
      
      if (r.canImport) {
        validCount++;
      }
    });

    return { errorCount, warningCount, validCount, skipCount, draftOverlapCount };
  }, [importValidatedRows]);

  // Execute Import comments
  const handleExecuteImport = async () => {
    const itemsToImport = importValidatedRows.filter(r => r.canImport);
    if (itemsToImport.length === 0) {
      toast.error('Tidak ada baris valid yang siap diimpor.');
      return;
    }

    const selectedClassObj = classesList.find(c => c.id === selectedClassId);
    if (profile?.role === 'TEACHER' || profile?.role === 'HOMEROOM_TEACHER') {
      const authorized = selectedClassObj ? isTeacherAssignedToClass(selectedClassObj, profile?.uid || '') : false;
      if (!authorized) {
        toast.error('Anda tidak memiliki otorisasi untuk mengelola kelas ini.');
        return;
      }
    }

    setIsImporting(true);
    try {
      const gradeStr = selectedClassObj?.gradeLevel !== undefined 
        ? `Grade ${selectedClassObj.gradeLevel}` 
        : 'Junior High';

      const payloads: { docRef: any; data: JuniorHighMonthlyReportComment; studentId: string }[] = [];

      itemsToImport.forEach(item => {
        const studentId = item.studentId;
        const academicYearNormalized = selectedYear.replace(/\//g, '-');
        const docId = `JUNIOR_HIGH_MONTHLY_COMMENT_${studentId}_${selectedClassId}_${academicYearNormalized}_${selectedSemester}_${selectedMonth}`;
        const docRef = doc(db, 'junior_high_monthly_report_comments', docId);

        const targetComment = commentsMap[studentId];

        const payload: JuniorHighMonthlyReportComment = {
          unit: 'JUNIOR_HIGH',
          reportType: 'MONTHLY_PROGRESS',
          studentId,
          studentNameSnapshot: item.studentName,
          classId: selectedClassId,
          classNameSnapshot: selectedClassObj?.name || '',
          gradeSnapshot: gradeStr,
          academicYear: selectedYear,
          semester: selectedSemester,
          periodKey: selectedMonth,
          periodLabel: getIndonesianMonthLabel(selectedMonth),
          generalComment: item.comment,
          status: 'DRAFT', // all imported comments are stored as DRAFT by default
          createdBy: targetComment?.createdBy || profile?.email || 'unknown',
          createdAt: targetComment?.createdAt || new Date().toISOString(),
          updatedBy: profile?.email || 'unknown',
          updatedAt: new Date().toISOString(),
          // Audit fields
          importedAt: new Date().toISOString(),
          importedBy: profile?.email || 'unknown',
          importSource: importMode === 'UPLOAD' ? 'Excel File' : 'Paste Sheets'
        } as any;

        payloads.push({ docRef, data: payload, studentId });
      });

      const { successCount, failCount } = await saveInBatches(payloads);
      await loadRosterAndComments();

      if (failCount === 0) {
        toast.success(`Berhasil mengimpor ${successCount} komentar siswa.`);
      } else {
        toast.warning(`Berhasil mengimpor ${successCount} komentar, tetapi ${failCount} gagal.`);
      }

      setParsedRows([]);
      setImportText('');
      setImportFile(null);
      setShowImportModal(false);
    } catch (err) {
      console.error('Error executing import comments:', err);
      toast.error('Gagal mengimpor komentar');
    } finally {
      setIsImporting(false);
    }
  };

  // Filter students based on search query
  const filteredStudents = React.useMemo(() => {
    return students.filter(student => 
      student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (student.id && student.id.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [students, searchQuery]);

  // Filter students based on status tabs (ALL, DRAFT, SUBMITTED, APPROVED, REVISION_REQUESTED)
  const filteredStudentsByStatus = React.useMemo(() => {
    return filteredStudents.filter(student => {
      if (statusFilter === 'ALL') return true;
      const comment = commentsMap[student.id];
      const rev = comment?.reviewStatus || 'DRAFT';
      return rev === statusFilter;
    });
  }, [filteredStudents, commentsMap, statusFilter]);

  const selectedClassObj = classesList.find(c => c.id === selectedClassId);

  return (
    <div id="monthly-report-comments-page" className="min-h-screen bg-slate-50/50 p-6">
      {/* Header Area */}
      <div className="mx-auto max-w-6xl mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#002366]/10 text-[#002366] border border-[#002366]/20">
                JUNIOR HIGH ONLY
              </span>
              <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                <Sparkles size={12} /> Komentar Umum Siswa
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <MessageSquare className="text-[#002366]" size={26} />
              Komentar Umum Siswa (General Comments)
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Input komentar deskriptif bulanan per siswa secara manual untuk rapor Monthly Progress Junior High.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-center">
            <button
              onClick={loadRosterAndComments}
              disabled={loadingStudents || loadingComments}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={15} className={(loadingStudents || loadingComments) ? 'animate-spin' : ''} />
              Muat Ulang
            </button>
          </div>
        </div>
      </div>

      {/* Control Panel Filter Card */}
      <div className="mx-auto max-w-6xl bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
              <Calendar size={13} className="text-[#002366]" /> Tahun Ajaran
            </label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full text-sm rounded-lg border-slate-200 focus:border-[#002366] focus:ring-[#002366] py-2 bg-slate-50/50"
            >
              <option value="2025/2026">2025/2026</option>
              <option value="2026/2027">2026/2027</option>
              <option value="2027/2028">2027/2028</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Semester
            </label>
            <div className="grid grid-cols-2 gap-2">
              {['1', '2'].map((sem) => (
                <button
                  key={sem}
                  onClick={() => setSelectedSemester(sem)}
                  className={`py-2 text-sm font-semibold rounded-lg border transition-all ${
                    selectedSemester === sem
                      ? 'bg-[#002366] text-white border-[#002366] shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Sem {sem}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
              <Calendar size={13} className="text-[#002366]" /> Periode Bulan
            </label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full text-sm rounded-lg border-slate-200 focus:border-[#002366] focus:ring-[#002366] py-1.5 bg-slate-50/50"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
              <Users size={13} className="text-[#002366]" /> Kelas Junior High
            </label>
            {loadingClasses ? (
              <div className="h-10 flex items-center px-3 bg-slate-50 rounded-lg text-xs text-slate-400">
                <RefreshCw size={14} className="animate-spin mr-2" />
                Memuat kelas...
              </div>
            ) : (
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="w-full text-sm rounded-lg border-slate-200 focus:border-[#002366] focus:ring-[#002366] py-2 bg-slate-50/50 font-medium"
              >
                <option value="" disabled>
                  {classesList.length === 0 
                    ? "Tidak ada kelas aktif" 
                    : "-- Pilih Kelas --"}
                </option>
                {classesList.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {!loadingClasses && classesList.length === 0 && (
          <div className="mt-4 p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0" />
            <span>Tidak ada kelas aktif dengan siswa terdaftar pada konteks ini.</span>
          </div>
        )}
      </div>

      {/* Action Toolbar Card (BULK OPERATIONS) */}
      <div className="mx-auto max-w-6xl bg-white border border-slate-200 rounded-xl shadow-sm p-4 mb-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-slate-800">Alat Pengelolaan Komentar Masal</h4>
            <p className="text-xs text-slate-400">Salin dari laporan sebelumnya atau impor komentar rapor dari spreadsheet Excel.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => {
                if (!selectedClassId) {
                  toast.error('Harap pilih Kelas terlebih dahulu.');
                  return;
                }
                handleOpenCopyModal();
              }}
              disabled={!selectedClassId}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-[#002366] disabled:opacity-50 disabled:hover:bg-white disabled:hover:text-slate-700 transition-all shadow-xs"
            >
              <Copy size={14} className="text-slate-500" />
              Salin Komentar
            </button>
            <button
              onClick={() => {
                if (!selectedClassId) {
                  toast.error('Harap pilih Kelas terlebih dahulu.');
                  return;
                }
                setShowImportModal(true);
              }}
              disabled={!selectedClassId}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg bg-[#002366] hover:bg-[#002366]/95 text-white disabled:opacity-50 transition-all shadow-sm"
            >
              <Upload size={14} />
              Impor / Tempel Komentar
            </button>
          </div>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="mx-auto max-w-6xl mb-4 flex flex-wrap items-center gap-2">
        {(['ALL', 'DRAFT', 'SUBMITTED', 'APPROVED', 'REVISION_REQUESTED'] as const).map(tabKey => {
          const labelMap = {
            ALL: 'Semua Status',
            DRAFT: 'Draft',
            SUBMITTED: 'Diajukan',
            APPROVED: 'Disetujui',
            REVISION_REQUESTED: 'Perlu Revisi'
          };
          const isActive = statusFilter === tabKey;
          return (
            <button
              key={tabKey}
              onClick={() => setStatusFilter(tabKey)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                isActive
                  ? 'bg-[#002366] text-white border-[#002366] shadow-xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {labelMap[tabKey]}
            </button>
          );
        })}
      </div>

      {/* Bulk Action Bar */}
      {selectedStudentIds.size > 0 && (
        <div className="mx-auto max-w-6xl mb-4 bg-[#002366] text-white px-5 py-3 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-md">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <CheckSquare size={16} className="text-amber-300" />
            <span>{selectedStudentIds.size} siswa terpilih</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleBulkSubmitForReview}
              disabled={isProcessingBulkAction}
              className="px-3.5 py-1.5 bg-white/10 hover:bg-white/20 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 border border-white/20"
            >
              <Send size={13} /> Ajukan untuk Review
            </button>
            {isApprover && (
              <>
                <button
                  onClick={handleBulkApprove}
                  disabled={isProcessingBulkAction}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
                >
                  <ShieldCheck size={13} /> Setujui (Approve)
                </button>
                <button
                  onClick={() => handleOpenRevisionModal(Array.from(selectedStudentIds))}
                  disabled={isProcessingBulkAction}
                  className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
                >
                  <RotateCcw size={13} /> Minta Revisi
                </button>
              </>
            )}
            <button
              onClick={() => setSelectedStudentIds(new Set())}
              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-xs font-medium rounded-lg transition-colors"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* Roster & Grid Table list */}
      <div className="mx-auto max-w-6xl bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {/* Roster Toolbar */}
        <div className="p-4 bg-slate-50/50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleSelectAllFiltered(filteredStudentsByStatus)}
              className="text-xs font-semibold text-[#002366] hover:underline flex items-center gap-1"
            >
              <CheckSquare size={14} /> Pilih Semua ({filteredStudentsByStatus.length})
            </button>
            <span className="text-sm font-semibold text-slate-700">Roster Siswa ({filteredStudentsByStatus.length})</span>
            <div className="text-xs text-slate-400">
              Kelas: <span className="font-semibold text-slate-600">{selectedClassObj?.name || '-'}</span>
            </div>
          </div>

          {/* Search box */}
          <div className="relative max-w-xs w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Cari nama atau NIS siswa..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-9 pr-8 py-2 rounded-lg border-slate-200 focus:border-[#002366] focus:ring-[#002366]"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>

        {/* Loading / Empty States */}
        {loadingStudents || loadingComments ? (
          <div className="p-16 text-center">
            <RefreshCw size={30} className="animate-spin text-[#002366] mx-auto mb-3" />
            <p className="text-slate-500 text-sm font-medium">Memuat daftar siswa & komentar...</p>
          </div>
        ) : filteredStudentsByStatus.length === 0 ? (
          <div className="p-16 text-center">
            <AlertCircle size={32} className="text-slate-300 mx-auto mb-2" />
            <p className="text-slate-600 font-medium">Tidak ada siswa ditemukan sesuai filter</p>
            <p className="text-xs text-slate-400 mt-1">Harap ganti pilihan filter status atau pencarian Anda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/30 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4 w-12 text-center">
                    <span className="sr-only">Pilih</span>
                  </th>
                  <th className="py-3 px-3 w-12 text-center">No</th>
                  <th className="py-3 px-4 w-28">NIS / Nama</th>
                  <th className="py-3 px-4">Komentar Umum (Gencom) & Riwayat</th>
                  <th className="py-3 px-4 w-36 text-center">Status Review</th>
                  <th className="py-3 px-4 w-44 text-center">Aksi & Kontrol</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudentsByStatus.map((student, idx) => {
                  const comment = commentsMap[student.id];
                  const absNum = student.attendanceNumber ?? student.noAbsen ?? student.rollNumber ?? student.rosterNumber ?? (idx + 1);
                  const isSelected = selectedStudentIds.has(student.id);
                  const isExpanded = !!expandedHistoryStudentIds[student.id];

                  const hasText = Boolean(comment?.generalComment && comment.generalComment.trim());
                  const reviewStat = comment?.reviewStatus || 'DRAFT';
                  const isFinal = comment?.status === 'FINAL';

                  return (
                    <React.Fragment key={student.id}>
                      <tr className={`hover:bg-slate-50/60 transition-colors ${isSelected ? 'bg-blue-50/40' : ''}`}>
                        <td className="py-4 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleSelectStudent(student.id)}
                            className="text-slate-400 hover:text-[#002366]"
                          >
                            {isSelected ? <CheckSquare size={16} className="text-[#002366]" /> : <Square size={16} />}
                          </button>
                        </td>
                        <td className="py-4 px-3 text-center font-medium text-slate-400 text-xs">{absNum}</td>
                        <td className="py-4 px-4 align-top">
                          <div className="font-bold text-slate-800 text-sm">{student.name}</div>
                          <div className="font-mono text-xs text-slate-400 mt-0.5">{student.id}</div>
                          <div className="text-[10px] text-slate-500 mt-1">
                            {selectedClassObj?.gradeLevel ? `Grade ${selectedClassObj.gradeLevel}` : `Grade ${student.grade || 'JH'}`}
                          </div>
                        </td>
                        <td className="py-4 px-4 align-top">
                          {hasText ? (
                            <div className="space-y-1.5">
                              <p className="text-xs text-slate-800 font-sans leading-relaxed bg-slate-50/80 p-3 rounded-lg border border-slate-200/70 whitespace-pre-wrap">
                                {comment.generalComment}
                              </p>
                              {comment.reviewFeedback && (
                                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-1.5">
                                  <AlertTriangle size={13} className="text-amber-600 shrink-0 mt-0.5" />
                                  <div>
                                    <strong className="font-bold">Feedback Revisi:</strong> {comment.reviewFeedback}
                                  </div>
                                </div>
                              )}
                              <div className="text-[10px] text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-0.5 pt-0.5">
                                <span>Dibuat oleh: <strong className="text-slate-600">{comment.createdByName || comment.createdBy || 'Belum tercatat'}</strong></span>
                                <span>•</span>
                                <span>Terakhir diedit: <strong className="text-slate-600">{comment.updatedByName || comment.updatedBy || 'Belum tercatat'} ({formatDateTime(comment.updatedAt)})</strong></span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-lg border border-dashed border-slate-200">
                              Belum ada Gencom. Klik Tulis atau Generator untuk menyusun komentar bulanan.
                            </div>
                          )}
                        </td>
                        <td className="py-4 px-4 text-center align-top">
                          <div className="flex flex-col items-center gap-1.5">
                            {reviewStat === 'APPROVED' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <ShieldCheck size={13} /> Disetujui
                              </span>
                            ) : reviewStat === 'SUBMITTED' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                <Send size={12} /> Diajukan
                              </span>
                            ) : reviewStat === 'REVISION_REQUESTED' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                <RotateCcw size={12} /> Perlu Revisi
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                Draft
                              </span>
                            )}

                            {isFinal && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium">
                                Final Report
                              </span>
                            )}

                            {comment?.reviewedByName && (
                              <span className="text-[10px] text-slate-400 mt-1 max-w-[140px] truncate" title={`Oleh ${comment.reviewedByName}`}>
                                Rev: {comment.reviewedByName}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-4 text-center align-top">
                          <div className="flex flex-col items-center gap-2">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => handleOpenEditor(student)}
                                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border shadow-2xs transition-all ${
                                  isFinal
                                    ? 'bg-[#002366] text-white border-[#002366] hover:bg-[#002366]/90'
                                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                }`}
                                title={comment?.reviewStatus === 'SUBMITTED' || comment?.reviewStatus === 'APPROVED' ? 'Terkunci (memerlukan buka revisi)' : 'Edit Komentar'}
                              >
                                <Edit3 size={12} />
                                {isFinal || hasText ? 'Edit' : 'Tulis'}
                              </button>

                              <button
                                onClick={() => handleOpenGenerator(student)}
                                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 shadow-2xs transition-all"
                                title="Generator AI / Narasi"
                              >
                                <Sparkles size={12} />
                              </button>

                              <button
                                onClick={() => toggleStudentHistory(student.id)}
                                className={`p-1.5 rounded-lg border text-xs transition-all ${
                                  isExpanded 
                                    ? 'bg-[#002366] text-white border-[#002366]' 
                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                }`}
                                title={isExpanded ? 'Tutup riwayat inline' : 'Lihat riwayat Gencom sebelumnya'}
                              >
                                {isExpanded ? <EyeOff size={14} /> : <Eye size={14} />}
                              </button>
                            </div>

                            {/* Quick Review Action Buttons */}
                            <div className="flex flex-wrap items-center justify-center gap-1 pt-1 border-t border-slate-100 w-full">
                              {(reviewStat === 'DRAFT' || reviewStat === 'REVISION_REQUESTED') && hasText && (
                                <button
                                  onClick={() => handleSingleSubmit(student.id)}
                                  className="text-[10px] font-bold px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
                                >
                                  Ajukan
                                </button>
                              )}

                              {isApprover && reviewStat === 'SUBMITTED' && (
                                <>
                                  <button
                                    onClick={() => handleSingleApprove(student.id)}
                                    className="text-[10px] font-bold px-2 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handleOpenRevisionModal([student.id])}
                                    className="text-[10px] font-bold px-2 py-1 rounded bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
                                  >
                                    Revisi
                                  </button>
                                </>
                              )}

                              {isApprover && (reviewStat === 'APPROVED' || reviewStat === 'SUBMITTED') && (
                                <button
                                  onClick={() => handleOpenRevision(student.id)}
                                  className="text-[10px] font-bold px-2 py-1 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300"
                                  title="Buka kembali agar guru dapat mengedit"
                                >
                                  Buka Revisi
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>

                      {/* Inline History Expandable Row */}
                      {isExpanded && (
                        <tr className="bg-slate-50/90 border-b border-slate-200">
                          <td colSpan={6} className="p-4 pl-14">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                                  <Clock size={14} className="text-[#002366]" />
                                  <span>Riwayat Gencom Sebelumnya — {student.name} (Tahun Ajaran {selectedYear})</span>
                                </div>
                                <span className="text-[11px] text-slate-400">Read-only · Periode sebelumnya</span>
                              </div>

                              {loadingHistoryMap[student.id] ? (
                                <div className="p-4 text-center text-xs text-slate-400">
                                  <RefreshCw size={14} className="animate-spin inline mr-1.5 text-[#002366]" /> Memuat riwayat...
                                </div>
                              ) : (!historyDataMap[student.id] || historyDataMap[student.id].length === 0) ? (
                                <div className="p-4 bg-white border border-slate-200 rounded-lg text-xs text-slate-400 italic text-center">
                                  Belum ada riwayat Gencom pada periode sebelumnya dalam tahun ajaran ini.
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  {historyDataMap[student.id].map((hist, hIdx) => (
                                    <div key={hIdx} className="bg-white border border-slate-200 rounded-lg p-3 shadow-2xs space-y-2">
                                      <div className="flex items-center justify-between text-[11px]">
                                        <span className="font-bold text-[#002366] px-2 py-0.5 bg-[#002366]/5 rounded">
                                          {hist.periodLabel}
                                        </span>
                                        <span className="text-slate-400 font-mono">
                                          {hist.source === 'MONTHLY' ? 'Monthly' : 'Midterm'} · Status: {hist.status}
                                        </span>
                                      </div>
                                      <p className="text-xs text-slate-700 leading-relaxed font-sans bg-slate-50 p-2.5 rounded border border-slate-100">
                                        {hist.commentText}
                                      </p>
                                      <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1">
                                        <span>Diedit oleh: {hist.updatedByName || 'Guru'}</span>
                                        <span>{formatDateTime(hist.updatedAt)}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Revision Feedback Modal */}
      <AnimatePresence>
        {showRevisionModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden"
            >
              <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-amber-50 text-amber-700">
                    <RotateCcw size={18} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800">Minta Revisi Komentar</h3>
                    <p className="text-xs text-slate-400">Berikan catatan feedback wajib untuk {pendingRevisionTargetIds.length} siswa terpilih</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowRevisionModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                    Catatan / Feedback Revisi <span className="text-rose-500">*wajib</span>
                  </label>
                  <textarea
                    value={revisionFeedbackText}
                    onChange={(e) => setRevisionFeedbackText(e.target.value)}
                    rows={4}
                    placeholder="Tuliskan bagian mana yang perlu direvisi atau diperbaiki oleh guru..."
                    className="w-full text-xs leading-relaxed rounded-xl border-slate-200 focus:border-[#002366] focus:ring-[#002366] p-3"
                  />
                  <span className="text-[10px] text-slate-400 block mt-1">
                    Feedback ini akan tercatat pada profil komentar masing-masing siswa terpilih.
                  </span>
                </div>
              </div>

              <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowRevisionModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRevision}
                  disabled={isSubmittingRevision || !revisionFeedbackText.trim()}
                  className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold rounded-xl bg-amber-600 hover:bg-amber-500 text-white shadow-sm disabled:opacity-50 transition-all cursor-pointer"
                >
                  {isSubmittingRevision ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" /> Mengirim...
                    </>
                  ) : (
                    <>
                      <RotateCcw size={14} /> Kirim Permintaan Revisi
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Editor dialog / modal */}
      <AnimatePresence>
        {editingStudent && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.18 }}
              className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-2xl overflow-hidden"
            >
              {/* Modal Header */}
              <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-[#002366]/5 text-[#002366]">
                    <MessageSquare size={18} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800">Edit Komentar Umum Rapor</h3>
                    <p className="text-xs text-slate-400">Monthly Progress Report</p>
                  </div>
                </div>
                <button 
                  onClick={() => confirmTransition(handleCloseEditor)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6 space-y-4">
                {/* Readonly identity cards */}
                <div className="grid grid-cols-2 gap-4 bg-slate-50 border border-slate-150 rounded-xl p-3 text-xs">
                  <div>
                    <span className="block text-slate-400">Nama Siswa</span>
                    <strong className="text-slate-800 text-sm">{editingStudent.name}</strong>
                  </div>
                  <div>
                    <span className="block text-slate-400">NIS (ID)</span>
                    <strong className="text-slate-800 text-sm font-mono">{editingStudent.id}</strong>
                  </div>
                  <div>
                    <span className="block text-slate-400">Kelas / Grade</span>
                    <strong className="text-slate-800">
                      {selectedClassObj?.name || '-'} / {selectedClassObj?.gradeLevel ? `Grade ${selectedClassObj.gradeLevel}` : `Grade ${editingStudent.grade || 'JH'}`}
                    </strong>
                  </div>
                  <div>
                    <span className="block text-slate-400">Periode</span>
                    <strong className="text-slate-800">
                      {selectedMonth ? getIndonesianMonthLabel(selectedMonth) : '-'}
                    </strong>
                  </div>
                </div>

                {/* Final state warning display */}
                {showWarning && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex items-start gap-2">
                    <AlertCircle size={15} className="mt-0.5 text-amber-600 shrink-0" />
                    <div>
                      <strong className="font-semibold block mb-0.5">Peringatan: Komentar Berstatus FINAL</strong>
                      Komentar ini telah ditandai sebagai final. Anda masih dapat mengeditnya, tetapi harap pastikan perubahan telah disetujui atau dikoordinasikan.
                    </div>
                  </div>
                )}

                {/* Main comments editor */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold uppercase text-slate-500">Komentar Wali Kelas</label>
                    <span className="text-[11px] text-slate-400">{commentText.length} Karakter</span>
                  </div>
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    rows={8}
                    placeholder="Tulis komentar deskriptif untuk perkembangan siswa di bulan ini secara manual..."
                    className="w-full text-sm rounded-lg border-slate-200 focus:border-[#002366] focus:ring-[#002366]"
                  />
                  <span className="text-[10px] text-slate-400 block mt-1 italic">
                    * Harap periksa kembali tata bahasa dan ejaan sebelum menandai sebagai final.
                  </span>
                </div>
              </div>

              {/* Modal Footer actions */}
              <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between">
                <button
                  onClick={() => confirmTransition(handleCloseEditor)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
                >
                  Batal
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleSaveComment('DRAFT')}
                    disabled={isSavingComment || !commentText.trim()}
                    className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors disabled:opacity-50"
                  >
                    Simpan Draft
                  </button>

                  <button
                    onClick={() => handleSaveComment('FINAL')}
                    disabled={isSavingComment || !commentText.trim()}
                    className="flex items-center gap-1 px-4 py-2 text-xs font-semibold rounded-lg bg-[#002366] hover:bg-[#002366]/90 text-white shadow-sm transition-colors disabled:opacity-50"
                  >
                    <CheckCircle2 size={13} />
                    Simpan Final
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Copy Previous Comments Modal */}
      <AnimatePresence>
        {showCopyModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-4xl overflow-hidden"
            >
              <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-[#002366]/5 text-[#002366]">
                    <Copy size={18} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800">Salin Komentar dari Periode Sebelumnya</h3>
                    <p className="text-xs text-slate-400">Salin massal dengan pencocokan identitas siswa (NIS) yang aman</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowCopyModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                {/* Destination Header Alert Info */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800 flex items-center gap-2">
                  <Info size={15} className="shrink-0 text-blue-600" />
                  <span>
                    Komentar akan disalin ke target: <strong>{selectedClassObj?.name} ({getIndonesianMonthLabel(selectedMonth)})</strong>. Status komentar hasil salinan adalah <strong>DRAFT</strong>.
                  </span>
                </div>

                {/* Source Selectors Panel */}
                <div className="bg-slate-50 border border-slate-150 rounded-xl p-4">
                  <h4 className="text-xs font-bold uppercase text-slate-500 mb-3 tracking-wider">Sumber Laporan Komentar</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Tahun Ajaran</label>
                      <select
                        value={sourceYear}
                        onChange={(e) => setSourceYear(e.target.value)}
                        className="w-full text-xs rounded-lg border-slate-200 py-1.5"
                      >
                        <option value="2025/2026">2025/2026</option>
                        <option value="2026/2027">2026/2027</option>
                        <option value="2027/2028">2027/2028</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Semester</label>
                      <select
                        value={sourceSemester}
                        onChange={(e) => setSourceSemester(e.target.value)}
                        className="w-full text-xs rounded-lg border-slate-200 py-1.5"
                      >
                        <option value="1">Semester 1</option>
                        <option value="2">Semester 2</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Bulan</label>
                      <input
                        type="month"
                        value={sourceMonth}
                        onChange={(e) => setSourceMonth(e.target.value)}
                        className="w-full text-xs rounded-lg border-slate-200 py-1"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Kelas Junior High</label>
                      {loadingSourceClasses ? (
                        <div className="h-8 flex items-center px-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-400">
                          <RefreshCw size={12} className="animate-spin mr-1.5" />
                          Memuat...
                        </div>
                      ) : (
                        <select
                          value={sourceClassId}
                          onChange={(e) => setSourceClassId(e.target.value)}
                          className="w-full text-xs rounded-lg border-slate-200 py-1.5"
                        >
                          {sourceClasses.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>

                  {/* Overwrite toggle option */}
                  <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="overwrite-drafts-copy"
                      checked={overwriteDraftComments}
                      onChange={(e) => setOverwriteDraftComments(e.target.checked)}
                      className="rounded border-slate-300 text-[#002366] focus:ring-[#002366] h-4 w-4"
                    />
                    <label htmlFor="overwrite-drafts-copy" className="text-xs font-medium text-slate-600 select-none cursor-pointer">
                      Izinkan menimpa (overwrite) komentar target yang masih berstatus <strong className="text-amber-700">DRAFT</strong>
                    </label>
                  </div>
                </div>

                {/* Validation and Match Preview Grid */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Preview Pencocokan & Validasi Rapor</h4>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1 text-slate-500">
                        Total: <strong>{copyPreviewList.length}</strong>
                      </span>
                      <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                        Siap: <strong>{copyStats.ready + copyStats.readyOverwrite}</strong>
                      </span>
                      <span className="flex items-center gap-1 text-rose-600 font-semibold">
                        Terkunci: <strong>{copyStats.lockedFinal}</strong>
                      </span>
                      <span className="flex items-center gap-1 text-slate-400">
                        Dilewati: <strong>{copyStats.skipEmpty + copyStats.skipDraft}</strong>
                      </span>
                    </div>
                  </div>

                  {loadingSourceComments ? (
                    <div className="p-8 text-center bg-slate-50 rounded-lg border border-slate-200">
                      <RefreshCw size={24} className="animate-spin text-[#002366] mx-auto mb-2" />
                      <p className="text-xs text-slate-500">Menghubungkan & menganalisis komentar sumber...</p>
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="max-h-[250px] overflow-y-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold sticky top-0">
                              <th className="p-2.5 w-12 text-center">No</th>
                              <th className="p-2.5 w-24">NIS</th>
                              <th className="p-2.5 w-40">Nama Siswa</th>
                              <th className="p-2.5">Pratinjau Komentar Sumber</th>
                              <th className="p-2.5 w-44">Tindakan</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-150">
                            {copyPreviewList.map((item, idx) => {
                              const isErr = item.status === 'ERROR';
                              const isWarn = item.status === 'WARNING';
                              const isLocked = item.status === 'LOCKED';

                              return (
                                <tr key={item.student.id} className="hover:bg-slate-50/50">
                                  <td className="p-2.5 text-center text-slate-400 font-medium">{idx + 1}</td>
                                  <td className="p-2.5 font-mono text-slate-500">{item.student.id}</td>
                                  <td className="p-2.5 font-semibold text-slate-700">{item.student.name}</td>
                                  <td className="p-2.5 text-slate-600 truncate max-w-xs font-mono italic text-[11px]">
                                    {item.sourceText || <span className="text-slate-300 font-normal">Tidak ada komentar</span>}
                                  </td>
                                  <td className="p-2.5">
                                    <div className="flex flex-col gap-0.5">
                                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold ${
                                        isLocked 
                                          ? 'text-rose-600'
                                          : isErr
                                          ? 'text-rose-500'
                                          : isWarn && item.tindakan === 'Lewati'
                                          ? 'text-slate-400'
                                          : isWarn
                                          ? 'text-amber-600'
                                          : 'text-emerald-600'
                                      }`}>
                                        {isLocked && <AlertTriangle size={11} />}
                                        {item.message || 'Siap'}
                                      </span>
                                      <span className="text-[9px] text-slate-400">
                                        Hasil: <strong>{item.tindakan}</strong>
                                      </span>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between">
                <button
                  onClick={() => setShowCopyModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
                >
                  Tutup
                </button>

                <button
                  onClick={handleExecuteCopy}
                  disabled={isCopying || loadingSourceComments || (copyStats.ready + copyStats.readyOverwrite === 0)}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-[#002366] hover:bg-[#002366]/90 text-white shadow-sm disabled:opacity-50 transition-colors"
                >
                  {isCopying ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" />
                      Sedang Menyalin...
                    </>
                  ) : (
                    <>
                      <Check size={14} />
                      Salin Komentar ({copyStats.ready + copyStats.readyOverwrite} Siswa)
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Import / Paste Comments Modal */}
      <AnimatePresence>
        {showImportModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-4xl overflow-hidden"
            >
              <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-[#002366]/5 text-[#002366]">
                    <Upload size={18} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800">Impor / Tempel Komentar Rapor</h3>
                    <p className="text-xs text-slate-400">Impor komentar massal via file excel atau tempel langsung dari spreadsheet</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setParsedRows([]);
                    setImportText('');
                    setImportFile(null);
                    setShowImportModal(false);
                  }}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                {/* Method selector tabs */}
                <div className="flex items-center gap-2 border-b border-slate-200">
                  <button
                    onClick={() => {
                      setImportMode('UPLOAD');
                      setParsedRows([]);
                    }}
                    className={`pb-2.5 text-xs font-bold transition-all px-2 border-b-2 ${
                      importMode === 'UPLOAD'
                        ? 'border-[#002366] text-[#002366]'
                        : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    Unggah Berkas Excel (.xlsx, .xls)
                  </button>
                  <button
                    onClick={() => {
                      setImportMode('PASTE');
                      setParsedRows([]);
                    }}
                    className={`pb-2.5 text-xs font-bold transition-all px-2 border-b-2 ${
                      importMode === 'PASTE'
                        ? 'border-[#002366] text-[#002366]'
                        : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    Tempel Data Spreadsheet (Google Sheets)
                  </button>
                </div>

                {/* Sub-panel depending on selected tab */}
                {importMode === 'UPLOAD' ? (
                  <div className="space-y-4">
                    {/* Template downloader area */}
                    <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                      <div className="space-y-0.5">
                        <strong className="font-semibold text-slate-700 block">Unduh Template Impor</strong>
                        <span className="text-slate-400 text-[11px]">Gunakan template excel ini untuk pengisian yang terstruktur dan aman.</span>
                      </div>
                      <button
                        onClick={handleDownloadTemplate}
                        className="flex items-center gap-1 px-3 py-1.5 font-semibold text-xs border border-slate-200 bg-white hover:bg-slate-50 rounded-lg text-slate-700 shadow-xs shrink-0"
                      >
                        <Download size={13} className="text-slate-500" />
                        Unduh Template (.xlsx)
                      </button>
                    </div>

                    {/* Drag and Drop Zone */}
                    <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-[#002366]/40 hover:bg-slate-50/45 transition-all">
                      <input
                        type="file"
                        id="excel-file-uploader"
                        accept=".xlsx, .xls"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setImportFile(file);
                            handleXLSXUpload(file);
                          }
                        }}
                        className="hidden"
                      />
                      <label htmlFor="excel-file-uploader" className="cursor-pointer block space-y-2">
                        <Upload size={28} className="text-slate-400 mx-auto" />
                        <div className="text-xs">
                          <span className="font-bold text-[#002366] hover:underline">Klik untuk mengunggah</span> atau seret berkas ke sini
                        </div>
                        <p className="text-[10px] text-slate-400">Hanya berkas Excel (.xlsx / .xls) yang didukung</p>
                      </label>
                      {importFile && (
                        <div className="mt-3 text-xs font-mono inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#002366]/5 rounded-full text-[#002366] border border-[#002366]/10">
                          <Check size={12} />
                          {importFile.name}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-xs text-slate-500">
                      Langkah-langkah:
                      <ol className="list-decimal list-inside space-y-0.5 mt-1 ml-1 text-slate-400">
                        <li>Buka spreadsheet (Excel/Google Sheets) yang berisi daftar komentar.</li>
                        <li>Salin (Copy) setidaknya 2 kolom: <strong>NIS (ID Siswa)</strong> dan <strong>Komentar</strong>.</li>
                        <li>Tempelkan (Paste) data tersebut langsung ke area teks di bawah ini.</li>
                      </ol>
                    </div>

                    <textarea
                      value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                      rows={6}
                      placeholder="Tempel kolom NIS (ID Siswa) dan Komentar di sini..."
                      className="w-full text-xs font-mono rounded-lg border-slate-200 focus:border-[#002366] focus:ring-[#002366]"
                    />

                    <div className="flex justify-end">
                      <button
                        onClick={handlePasteParse}
                        disabled={!importText.trim()}
                        className="flex items-center gap-1 px-3.5 py-1.5 text-xs font-bold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-all shadow-xs"
                      >
                        <Clipboard size={13} className="text-slate-500" />
                        Proses & Urai Data Tempel
                      </button>
                    </div>
                  </div>
                )}

                {/* Overwrite option toggle */}
                {parsedRows.length > 0 && (
                  <div className="pt-3 border-t border-slate-200/60 flex items-center gap-2 bg-amber-50/50 p-2.5 rounded-lg border border-amber-100">
                    <input
                      type="checkbox"
                      id="overwrite-drafts-import"
                      checked={showDraftOverwriteOption}
                      onChange={(e) => setShowDraftOverwriteOption(e.target.checked)}
                      className="rounded border-slate-300 text-[#002366] focus:ring-[#002366] h-4 w-4"
                    />
                    <label htmlFor="overwrite-drafts-import" className="text-xs font-semibold text-slate-700 select-none cursor-pointer">
                      Izinkan menimpa (overwrite) komentar target yang sudah ada berstatus <strong className="text-amber-800">DRAFT</strong>
                    </label>
                  </div>
                )}

                {/* Validation and Match Preview Grid */}
                {parsedRows.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Hasil Validasi Identitas Siswa</h4>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="flex items-center gap-1 text-slate-500">
                          Total Baris: <strong>{importValidatedRows.length}</strong>
                        </span>
                        <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                          Valid: <strong>{importStats.validCount}</strong>
                        </span>
                        <span className="flex items-center gap-1 text-rose-600 font-semibold">
                          Error: <strong>{importStats.errorCount}</strong>
                        </span>
                        <span className="flex items-center gap-1 text-slate-400">
                          Dilewati: <strong>{importStats.skipCount}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="max-h-[220px] overflow-y-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold sticky top-0">
                              <th className="p-2.5 w-12 text-center">Baris</th>
                              <th className="p-2.5 w-24">NIS Input</th>
                              <th className="p-2.5 w-40">Nama Siswa Terpeta</th>
                              <th className="p-2.5">Pratinjau Komentar</th>
                              <th className="p-2.5 w-44">Status Validasi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-150">
                            {importValidatedRows.map((item, idx) => {
                              const isErr = item.status === 'ERROR';
                              const isWarn = item.status === 'WARNING';

                              return (
                                <tr key={idx} className={`hover:bg-slate-50/50 ${isErr ? 'bg-rose-50/20' : ''}`}>
                                  <td className="p-2.5 text-center text-slate-400 font-medium">{item.lineNum}</td>
                                  <td className="p-2.5 font-mono text-slate-500">{item.identifier || <span className="text-rose-400">Kosong</span>}</td>
                                  <td className="p-2.5 font-semibold text-slate-700">{item.studentName}</td>
                                  <td className="p-2.5 text-slate-600 truncate max-w-xs font-mono italic text-[11px]">
                                    {item.comment || <span className="text-slate-300 font-normal">Tidak ada komentar</span>}
                                  </td>
                                  <td className="p-2.5">
                                    <div className="flex flex-col gap-0.5">
                                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold ${
                                        isErr
                                          ? 'text-rose-500'
                                          : isWarn && item.tindakan === 'Lewati'
                                          ? 'text-slate-400'
                                          : isWarn
                                          ? 'text-amber-600'
                                          : 'text-emerald-600'
                                      }`}>
                                        {isErr && <AlertCircle size={11} />}
                                        {item.message}
                                      </span>
                                      <span className="text-[9px] text-slate-400">
                                        Hasil: <strong>{item.tindakan}</strong>
                                      </span>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between">
                <button
                  onClick={() => {
                    setParsedRows([]);
                    setImportText('');
                    setImportFile(null);
                    setShowImportModal(false);
                  }}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
                >
                  Tutup
                </button>

                <button
                  onClick={handleExecuteImport}
                  disabled={isImporting || parsedRows.length === 0 || (importStats.validCount === 0)}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-[#002366] hover:bg-[#002366]/90 text-white shadow-sm disabled:opacity-50 transition-colors"
                >
                  {isImporting ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" />
                      Sedang Mengimpor...
                    </>
                  ) : (
                    <>
                      <Check size={14} />
                      Simpan Komentar ({importStats.validCount} Baris Valid)
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Unsaved Changes Dialog / Modal */}
      <AnimatePresence>
        {showUnsavedDialog && (
          <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden p-6 space-y-4"
            >
              <div className="flex items-center gap-3 text-amber-600">
                <AlertTriangle size={24} className="shrink-0" />
                <h4 className="font-bold text-slate-800 text-base">Perubahan Belum Disimpan!</h4>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Anda memiliki pengeditan komentar yang belum disimpan. Jika Anda melanjutkan sekarang, semua perubahan yang baru saja Anda buat akan hilang secara permanen.
              </p>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => {
                    setShowUnsavedDialog(false);
                    setUnsavedChangesAction(null);
                  }}
                  className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors"
                >
                  Kembali Mengedit
                </button>
                <button
                  onClick={() => {
                    setShowUnsavedDialog(false);
                    if (unsavedChangesAction) {
                      unsavedChangesAction();
                    }
                    setUnsavedChangesAction(null);
                  }}
                  className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-colors"
                >
                  Buang Perubahan
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Indonesian Comment Generator Modal (Midterm Pattern) */}
      <AnimatePresence>
        {showGeneratorModal && generatorStudent && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.18 }}
              className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden max-h-[92vh] flex flex-col"
            >
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-[#002366] to-[#003399] px-6 py-4 flex items-center justify-between text-white shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-white/10 text-amber-300">
                    <Sparkles size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-base tracking-tight text-white">Generator Komentar Rapor Bulanan</h3>
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-white/20 text-white tracking-wider">
                        Bahasa Indonesia
                      </span>
                    </div>
                    <p className="text-xs text-blue-150 mt-0.5">
                      {generatorStudent.name} ({generatorStudent.id}) · {selectedClassObj?.name || 'Junior High'} · {selectedMonth ? getIndonesianMonthLabel(selectedMonth) : ''}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowGeneratorModal(false)}
                  className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Body - Scrollable */}
              <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-700">
                
                {/* 1. Context Data Indicator Banner */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-700 flex items-center gap-1.5 uppercase text-[10px] tracking-wider text-[#002366]">
                      <Info size={14} className="text-[#002366]" /> Konteks Data Terdeteksi Bulan Ini
                    </span>
                    {loadingContextData && (
                      <span className="flex items-center gap-1 text-[11px] text-blue-600 font-medium">
                        <RefreshCw size={12} className="animate-spin" /> Membaca data siswa...
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1">
                    <div className="p-2.5 bg-white rounded-lg border border-slate-200/80">
                      <span className="block text-[10px] font-semibold text-slate-400 uppercase">Kehadiran Periode</span>
                      <strong className="text-slate-800 text-xs">
                        {genAttendance 
                          ? `Sakit: ${genAttendance.sickLeave} · Izin: ${genAttendance.excusedLeave} · Alpa: ${genAttendance.absent}`
                          : 'Kehadiran tertib / nihil catatan'}
                      </strong>
                    </div>
                    <div className="p-2.5 bg-white rounded-lg border border-slate-200/80">
                      <span className="block text-[10px] font-semibold text-slate-400 uppercase">Materi Pembelajaran Kelas</span>
                      <strong className="text-slate-800 text-xs truncate block" title={genLearningJourney || 'Belum diisi'}>
                        {genLearningJourney ? genLearningJourney.slice(0, 45) + '...' : <span className="text-slate-400 italic">Belum diisi di ringkasan</span>}
                      </strong>
                    </div>
                    <div className="p-2.5 bg-white rounded-lg border border-slate-200/80">
                      <span className="block text-[10px] font-semibold text-slate-400 uppercase">Eksplorasi Diri (Refleksi)</span>
                      <strong className="text-slate-800 text-xs truncate block" title={genReflection || 'Belum ada refleksi'}>
                        {genReflection ? genReflection.slice(0, 40) + '...' : <span className="text-slate-400 italic">Tidak ada catatan</span>}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* 2. Focus Template Selector */}
                <div>
                  <label className="block font-bold uppercase tracking-wider text-slate-600 text-[11px] mb-2 flex items-center gap-1.5">
                    <Layers size={13} className="text-[#002366]" /> 1. Pilih Aspek Fokus / Gaya Komentar
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {JH_MONTHLY_TEMPLATES.map((tmpl) => {
                      const isSelected = selectedTemplateId === tmpl.id;
                      return (
                        <div
                          key={tmpl.id}
                          onClick={() => setSelectedTemplateId(tmpl.id)}
                          className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-blue-50/70 border-[#002366] shadow-xs'
                              : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className={`font-bold text-xs ${isSelected ? 'text-[#002366]' : 'text-slate-800'}`}>
                              {tmpl.title}
                            </span>
                            {isSelected && <CheckCircle2 size={15} className="text-[#002366] shrink-0" />}
                          </div>
                          <p className="text-[11px] text-slate-500 leading-relaxed">{tmpl.desc}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Student Calling Name & Gender */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Nama Panggilan Siswa
                    </label>
                    <input
                      type="text"
                      value={genNickname}
                      onChange={(e) => setGenNickname(e.target.value)}
                      placeholder="Nama panggilan siswa"
                      className="w-full bg-white text-xs rounded-lg border-slate-200 py-1.5 px-3 focus:border-[#002366] focus:ring-[#002366]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Jenis Kelamin
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setGenGender('MALE')}
                        className={`py-1.5 px-2 text-xs font-semibold rounded-lg border transition-all ${
                          genGender === 'MALE'
                            ? 'bg-[#002366] text-white border-[#002366]'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        Laki-laki
                      </button>
                      <button
                        type="button"
                        onClick={() => setGenGender('FEMALE')}
                        className={`py-1.5 px-2 text-xs font-semibold rounded-lg border transition-all ${
                          genGender === 'FEMALE'
                            ? 'bg-[#002366] text-white border-[#002366]'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        Perempuan
                      </button>
                    </div>
                  </div>
                </div>

                {/* 4. Strengths & Progress Bank */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="font-bold uppercase tracking-wider text-slate-600 text-[11px]">
                      2. Kekuatan & Perkembangan Siswa ({genStrengths.length} terpilih)
                    </label>
                    <button
                      type="button"
                      onClick={() => setGenStrengths([])}
                      className="text-[10px] text-slate-400 hover:text-slate-600"
                    >
                      Reset
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {JH_MONTHLY_STRENGTHS_BANK.map((item, idx) => {
                      const isSel = genStrengths.includes(item);
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            if (isSel) setGenStrengths(genStrengths.filter(s => s !== item));
                            else setGenStrengths([...genStrengths, item]);
                          }}
                          className={`text-left text-[11px] px-2.5 py-1.5 rounded-lg border transition-all ${
                            isSel
                              ? 'bg-blue-50 border-[#002366] text-[#002366] font-semibold'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {isSel ? '✓ ' : '+ '} {item}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 5. Achievements Bank */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="font-bold uppercase tracking-wider text-slate-600 text-[11px]">
                      3. Capaian & Prestasi Spesifik ({genAchievements.length} terpilih)
                    </label>
                    <button
                      type="button"
                      onClick={() => setGenAchievements([])}
                      className="text-[10px] text-slate-400 hover:text-slate-600"
                    >
                      Reset
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {JH_MONTHLY_ACHIEVEMENTS_BANK.map((item, idx) => {
                      const isSel = genAchievements.includes(item);
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            if (isSel) setGenAchievements(genAchievements.filter(a => a !== item));
                            else setGenAchievements([...genAchievements, item]);
                          }}
                          className={`text-left text-[11px] px-2.5 py-1.5 rounded-lg border transition-all ${
                            isSel
                              ? 'bg-emerald-50 border-emerald-600 text-emerald-800 font-semibold'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {isSel ? '✓ ' : '+ '} {item}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 6. Needs Improvement Bank */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="font-bold uppercase tracking-wider text-slate-600 text-[11px]">
                      4. Area Peningkatan & Rekomendasi ({genNeeds.length} terpilih)
                    </label>
                    <button
                      type="button"
                      onClick={() => setGenNeeds([])}
                      className="text-[10px] text-slate-400 hover:text-slate-600"
                    >
                      Reset
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {JH_MONTHLY_NEEDS_IMPROVEMENT_BANK.map((item, idx) => {
                      const isSel = genNeeds.includes(item);
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            if (isSel) setGenNeeds(genNeeds.filter(n => n !== item));
                            else setGenNeeds([...genNeeds, item]);
                          }}
                          className={`text-left text-[11px] px-2.5 py-1.5 rounded-lg border transition-all ${
                            isSel
                              ? 'bg-amber-50 border-amber-500 text-amber-900 font-semibold'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {isSel ? '✓ ' : '+ '} {item}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 7. Additional Teacher Notes */}
                <div>
                  <label className="block font-bold uppercase tracking-wider text-slate-600 text-[11px] mb-1">
                    5. Catatan Tambahan Guru (Opsional)
                  </label>
                  <textarea
                    value={genManualNotes}
                    onChange={(e) => setGenManualNotes(e.target.value)}
                    rows={2}
                    placeholder="Tuliskan catatan khusus atau konteks unik siswa yang perlu dimasukkan ke dalam narasi..."
                    className="w-full text-xs rounded-lg border-slate-200 focus:border-[#002366] focus:ring-[#002366] py-2 px-3"
                  />
                </div>

                {/* Action Trigger Buttons Bar */}
                <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={handleGenerateAI}
                    disabled={isGeneratingAI}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#002366] text-white hover:bg-[#002366]/90 shadow-sm disabled:opacity-50 cursor-pointer transition-all"
                  >
                    {isGeneratingAI ? (
                      <>
                        <RefreshCw size={13} className="animate-spin" />
                        Menyusun dengan AI...
                      </>
                    ) : (
                      <>
                        <Sparkles size={14} className="text-amber-300" />
                        Generate Draf AI (Bahasa Indonesia)
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleGenerateDraftNarrative}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 shadow-xs cursor-pointer transition-all"
                  >
                    <Wand2 size={13} className="text-purple-600" />
                    Rangkai Narasi Terstruktur
                  </button>

                  <button
                    type="button"
                    onClick={handlePolishAI}
                    disabled={isPolishingAI || !genDraftText.trim()}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 shadow-xs disabled:opacity-50 cursor-pointer transition-all"
                  >
                    {isPolishingAI ? (
                      <>
                        <RefreshCw size={13} className="animate-spin text-blue-600" />
                        Merapikan draf...
                      </>
                    ) : (
                      <>
                        <Edit3 size={13} className="text-blue-600" />
                        Rapikan Draf dengan AI
                      </>
                    )}
                  </button>
                </div>

                {/* 8. Draft Result & Review Editor */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <label className="font-bold uppercase tracking-wider text-slate-700 text-[11px] flex items-center gap-1">
                      <BookOpen size={13} className="text-[#002366]" /> Pratinjau & Sunting Draf Narasi
                    </label>
                    <div className="flex items-center gap-3 text-[11px]">
                      <span className="font-medium text-slate-400">
                        Kata: <strong className="text-slate-700">{countWords(genDraftText)}</strong> (Target: 60 - 110 kata)
                      </span>
                      <span className="font-medium text-slate-400">
                        Karakter: <strong className="text-slate-700">{genDraftText.length}</strong>
                      </span>
                    </div>
                  </div>

                  <textarea
                    value={genDraftText}
                    onChange={(e) => setGenDraftText(e.target.value)}
                    rows={4}
                    placeholder="Hasil generate narasi komentar akan tampil di sini. Anda dapat langsung menyunting teks sebelum menerapkannya..."
                    className="w-full text-xs leading-relaxed rounded-xl border-slate-200 focus:border-[#002366] focus:ring-[#002366] p-3 font-sans bg-white"
                  />

                  {/* Protection notices */}
                  {commentsMap[generatorStudent.id]?.status === 'FINAL' && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
                      <AlertCircle size={15} className="text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <strong className="block font-bold">Komentar Siswa Ini Sudah FINAL</strong>
                        Komentar berstatus FINAL dilindungi dan tidak dapat ditimpa langsung. Buka status ke DRAFT di tabel jika ingin merevisi.
                      </div>
                    </div>
                  )}

                  {commentsMap[generatorStudent.id]?.status === 'DRAFT' && commentsMap[generatorStudent.id]?.generalComment?.trim() && (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 flex items-center gap-2">
                      <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                      <span>Siswa ini sudah memiliki draf. Menerapkan draf baru akan menimpa draf sebelumnya setelah konfirmasi.</span>
                    </div>
                  )}
                </div>

              </div>

              {/* Modal Footer */}
              <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
                <button
                  type="button"
                  onClick={() => setShowGeneratorModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer"
                >
                  Tutup
                </button>

                <button
                  type="button"
                  onClick={handleApplyGeneratedToEditor}
                  disabled={!genDraftText.trim() || commentsMap[generatorStudent.id]?.status === 'FINAL'}
                  className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold rounded-xl bg-[#002366] hover:bg-[#002366]/90 text-white shadow-sm disabled:opacity-50 transition-all cursor-pointer"
                >
                  <Check size={14} />
                  Terapkan ke Komentar Siswa (DRAFT)
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

class MonthlyReportCommentsErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("MonthlyReportCommentsPage Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 max-w-xl mx-auto my-12 bg-white rounded-2xl border border-red-200 shadow-sm text-center space-y-4">
          <div className="w-14 h-14 bg-red-50 text-red-600 rounded-xl flex items-center justify-center mx-auto">
            <AlertCircle size={28} />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-slate-800">Terjadi Kendala Memuat Komentar</h3>
            <p className="text-xs text-slate-500">
              {this.state.error?.message || 'Terjadi kesalahan saat memuat halaman komentar rapor bulanan.'}
            </p>
          </div>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            className="px-4 py-2 bg-[#002366] text-white text-xs font-semibold rounded-lg hover:bg-[#002366]/90 transition-all cursor-pointer"
          >
            Muat Ulang Halaman
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function MonthlyReportCommentsPage() {
  return (
    <MonthlyReportCommentsErrorBoundary>
      <MonthlyReportCommentsContent />
    </MonthlyReportCommentsErrorBoundary>
  );
}
