import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MessageSquare, Calendar, Users, Save, CheckCircle2, RefreshCw, 
  AlertCircle, Info, Check, Search, X, Edit3, UserCheck, Eye, EyeOff, Sparkles,
  Copy, Clipboard, Download, Upload, AlertTriangle, Wand2, BookOpen, Layers
} from 'lucide-react';
import { db, getClasses, getActiveStudents } from '../../lib/firebase';
import { doc, getDoc, getDocs, setDoc, query, collection, where, writeBatch } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { toast } from 'sonner';
import type { Class, Student, JuniorHighMonthlyReportComment } from '../../types';
import * as XLSX from 'xlsx';
import { isTeacherAssignedToClass } from '../../services/classTeacherAssignmentService';

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

export default function MonthlyReportCommentsPage() {
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

  const handleOpenGenerator = (student: Student) => {
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
  };

  const handleGenerateDraftNarrative = () => {
    if (!generatorStudent) return;
    const callName = genNickname.trim() || generatorStudent.name.split(' ')[0] || generatorStudent.name;

    if (genStrengths.length === 0 && genAchievements.length === 0 && genNeeds.length === 0 && !genManualNotes.trim()) {
      toast.error('Silakan pilih minimal satu aspek perkembangan atau tulis catatan khusus untuk siswa.');
      return;
    }

    let opening = '';
    if (selectedTemplateId === 'ACADEMIC_INDEPENDENCE') {
      opening = `Alhamdulillah, selama periode bulan ini, ananda ${callName} menunjukkan capaian belajar dan kemandirian yang sangat baik.`;
    } else if (selectedTemplateId === 'ACTIVE_COLLABORATION') {
      opening = `Alhamdulillah, ananda ${callName} memperlihatkan perkembangan yang positif dalam interaksi sosial dan keaktifan pembelajaran di kelas.`;
    } else if (selectedTemplateId === 'GUIDANCE_FOCUS') {
      opening = `Alhamdulillah, proses pembelajaran ananda ${callName} bulan ini terus menunjukkan kemajuan yang patut diapresiasi.`;
    } else if (selectedTemplateId === 'ISLAMIC_CHARACTER') {
      opening = `Alhamdulillah, ananda ${callName} senantiasa menunjukkan akhlak terpuji, budi pekerti yang baik, dan semangat kebersamaan.`;
    } else {
      opening = `Alhamdulillah, ananda ${callName} menunjukkan kesungguhan dan dedikasi dalam mengikuti seluruh kegiatan belajar.`;
    }

    const sentences: string[] = [opening];

    if (genStrengths.length > 0) {
      const sJoin = genStrengths.map(s => s.toLowerCase()).join(', serta ');
      sentences.push(`${callName} senantiasa ${sJoin}.`);
    }

    if (genAchievements.length > 0) {
      const aJoin = genAchievements.map(a => a.toLowerCase()).join(', dan ');
      sentences.push(`Dalam aspek capaian akademik, ${callName} berhasil ${aJoin}.`);
    }

    if (genNeeds.length > 0) {
      const nJoin = genNeeds.map(n => n.toLowerCase()).join(', serta ');
      sentences.push(`Untuk terus mengoptimalkan potensi belajarnya ke depan, ${callName} diharapkan dapat ${nJoin}.`);
    }

    if (genManualNotes.trim()) {
      sentences.push(genManualNotes.trim());
    }

    sentences.push(`Semoga ananda ${callName} senantiasa istiqomah dalam meraih prestasi dan kebaikan.`);

    const result = sentences.join(' ');
    setGenDraftText(result);
    toast.success('Draf komentar berhasil dirangkai. Silakan tinjau dan sesuaikan di bawah.');
  };

  const handleApplyGeneratedToEditor = () => {
    if (!genDraftText.trim()) {
      toast.error('Draf komentar masih kosong. Klik tombol "Rangkai Draf Komentar" terlebih dahulu.');
      return;
    }

    if (generatorStudent) {
      if (editingStudent?.id === generatorStudent.id) {
        setCommentText(genDraftText.trim());
      } else {
        const existing = commentsMap[generatorStudent.id];
        setEditingStudent(generatorStudent);
        setCommentText(genDraftText.trim());
        setEditorStatus(existing?.status || 'DRAFT');
        setInitialCommentText(existing?.generalComment || '');
        setInitialEditorStatus(existing?.status || 'DRAFT');
        setShowWarning(existing?.status === 'FINAL');
      }
    }
    setShowGeneratorModal(false);
    toast.success('Draf komentar berhasil diterapkan ke form komentar.');
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
        updatedBy: profile?.email || 'unknown',
        updatedAt: new Date().toISOString()
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
  const filteredStudents = students.filter(student => 
    student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (student.id && student.id.toLowerCase().includes(searchQuery.toLowerCase()))
  );

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

      {/* Roster & Grid Table list */}
      <div className="mx-auto max-w-6xl bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {/* Roster Toolbar */}
        <div className="p-4 bg-slate-50/50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-700">Roster Siswa ({filteredStudents.length})</span>
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
        ) : filteredStudents.length === 0 ? (
          <div className="p-16 text-center">
            <AlertCircle size={32} className="text-slate-300 mx-auto mb-2" />
            <p className="text-slate-600 font-medium">Tidak ada siswa ditemukan</p>
            <p className="text-xs text-slate-400 mt-1">Harap ganti pilihan filter kelas atau sesuaikan pencarian Anda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/30 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-5 w-16 text-center">No</th>
                  <th className="py-3 px-5 w-28">NIS</th>
                  <th className="py-3 px-5">Nama Siswa</th>
                  <th className="py-3 px-5 w-32 text-center">Grade</th>
                  <th className="py-3 px-5 text-slate-500 font-bold text-center">
                    Attendance Preview
                    <span className="block text-[9px] font-normal text-slate-400 lowercase italic">sick / excused / absent</span>
                  </th>
                  <th className="py-3 px-5 w-32 text-center">Status</th>
                  <th className="py-3 px-5 w-40 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.map((student, idx) => {
                  const comment = commentsMap[student.id];
                  const absNum = student.attendanceNumber ?? student.noAbsen ?? student.rollNumber ?? student.rosterNumber ?? (idx + 1);
                  const isDraft = comment?.status === 'DRAFT';
                  const isFinal = comment?.status === 'FINAL';

                  return (
                    <tr key={student.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-5 text-center font-medium text-slate-400 text-xs">{absNum}</td>
                      <td className="py-3.5 px-5 font-mono text-xs text-slate-500">{student.id}</td>
                      <td className="py-3.5 px-5">
                        <div className="font-semibold text-slate-800">{student.name}</div>
                      </td>
                      <td className="py-3.5 px-5 text-center text-xs font-medium text-slate-600">
                        {selectedClassObj?.gradeLevel ? `Grade ${selectedClassObj.gradeLevel}` : `Grade ${student.grade || 'JH'}`}
                      </td>
                      <td className="py-3.5 px-5">
                        <div className="flex items-center justify-center gap-2.5 text-xs">
                          <span className="inline-flex items-center gap-1 text-slate-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                            Sick Leave: <strong className="text-slate-600 font-semibold">-</strong>
                          </span>
                          <span className="inline-flex items-center gap-1 text-slate-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                            Excused Leave: <strong className="text-slate-600 font-semibold">-</strong>
                          </span>
                          <span className="inline-flex items-center gap-1 text-slate-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                            Absent: <strong className="text-slate-600 font-semibold">-</strong>
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-5 text-center">
                        {isFinal ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                            <Check size={12} /> Final
                          </span>
                        ) : isDraft ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-100">
                            Draft
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-400 border border-slate-200">
                            Belum Diisi
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleOpenEditor(student)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border shadow-xs transition-all ${
                              isFinal
                                ? 'bg-[#002366] text-white border-[#002366] hover:bg-[#002366]/90'
                                : isDraft
                                ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <Edit3 size={13} />
                            {isFinal || isDraft ? 'Edit' : 'Tulis'}
                          </button>
                          <button
                            onClick={() => handleOpenGenerator(student)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 shadow-xs transition-all"
                            title="Bantu buat komentar otomatis berbahasa Indonesia"
                          >
                            <Sparkles size={13} />
                            Generator
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
    </div>
  );
}
