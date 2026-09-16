import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, Loader2, Save, Smile, Meh, Frown, Angry, AlertCircle, CheckCircle2,
  Calendar, Edit3, BookOpen, Clock, Heart, ShieldAlert, ArrowRight, Eye, RefreshCw, 
  ChevronDown, ChevronUp, Check, Trash2, ClipboardList, ChevronLeft, ChevronRight,
  FileSpreadsheet, Send, FileText, HelpCircle
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  DEFAULT_STUDENTS, 
  formatDateToKey, 
  getMonday,
  getStoredStudents,
  saveStoredStudents
} from '../../lib/kindergartenWeeklyReport';
import { collection, query, where, getDocs, doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { useAuth } from '../../context/AuthContext';
import { useTeacherAssignedClasses } from '../../hooks/useTeacherAssignedClasses';
import { logFirestoreRead, getKindergartenClasses, getKindergartenStudents, resolveCanonicalClassId } from '../../lib/kindergartenMetadataCache';
import { html2canvasWithModernColors } from '../../lib/html2canvasPatch';
import { jsPDF } from 'jspdf';
import { useOutletContext } from 'react-router-dom';

// Type definitions for compiled weekly source
interface CompiledWeeklySource {
  weeklyDraftId: string;
  startDate: string;
  endDate: string;
  theme: string;
  generalComments: string;
  sourceUpdatedAt: number | null;
}

// Type definitions for midterm summary draft
interface MidtermSummaryDraft {
  id?: string;
  unit: 'KINDERGARTEN';
  reportType: 'KINDY_MIDTERM_REPORT';

  studentId: string;
  studentNameSnapshot: string;

  classId: string;
  classNameSnapshot: string;

  academicYear: string;
  semester: number;

  periodKey: string;
  startDate: string;
  endDate: string;
  periodLabel: string;

  midtermGeneralComment: string;

  status: 'DRAFT' | 'READY_FOR_REVIEW' | 'APPROVED' | 'PUBLISHED';

  compiledWeeklySources: CompiledWeeklySource[];

  compilationUpdatedAt?: number;
  compilationUpdatedBy?: string;

  createdAt?: number;
  createdBy?: string;
  updatedAt?: number;
  updatedBy?: string;

  submittedForReviewAt?: number | null;
  submittedForReviewBy?: string | null;
}

export default function MidtermSummary() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const paramClassId = searchParams.get('classId');
  const paramDate = searchParams.get('date');

  const { activeYear } = useAcademicYear();
  const { currentUser } = useOutletContext<{ currentUser: any }>() || {};
  const { profile, getGoogleDriveToken } = useAuth();

  // Publishing & Signatory States
  const [publishedReports, setPublishedReports] = React.useState<Record<string, any>>({});
  const [isFetchingPublished, setIsFetchingPublished] = React.useState(false);
  const [isPublishing, setIsPublishing] = React.useState(false);
  const [publishStatus, setPublishStatus] = React.useState("");
  
  const [resolvedSignatureUrl, setResolvedSignatureUrl] = React.useState<string | null>(null);
  const [resolvedTeacherName, setResolvedTeacherName] = React.useState<string | null>(null);
  const [isSignatureLoading, setIsSignatureLoading] = React.useState<boolean>(false);

  const [kindySignatory, setKindySignatory] = React.useState<{
    principalName: string;
    principalTitle: string;
    principalSignatureUrl: string | null;
  } | null>(null);

  // Role Protection
  if (profile?.role === 'kindergarten_subject_teacher') {
    return (
      <div className="p-8 text-center max-w-2xl mx-auto my-12 bg-white rounded-3xl border border-gray-150 p-12">
        <h1 className="text-xl font-bold text-red-600 font-sans">Akses Ditolak</h1>
        <p className="text-gray-500 mt-2 font-sans">Anda tidak memiliki izin untuk membuka halaman Midterm Report ini.</p>
      </div>
    );
  }

  // Active Semester Context (Defaults to S1, can toggle)
  const [semester, setSemester] = React.useState<number>(1);

  // Class Selection using centralized hook
  const {
    assignedClasses: classes,
    primaryClassId,
    isRestrictedToAssignedClasses,
    loading: isLoadingClasses,
    setLastSelectedClassId
  } = useTeacherAssignedClasses({
    userId: profile?.uid,
    academicYearId: activeYear || '2026/2027'
  });

  const [selectedClassId, setSelectedClassId] = React.useState<string>('');
  const [students, setStudents] = React.useState<any[]>(() => DEFAULT_STUDENTS);

  // Auto-select Class
  React.useEffect(() => {
    if (classes.length > 0) {
      if (paramClassId && classes.some(c => c.id === paramClassId)) {
        setSelectedClassId(paramClassId);
      } else if (primaryClassId) {
        setSelectedClassId(primaryClassId);
      } else {
        setSelectedClassId(classes[0].id);
      }
    }
  }, [classes, paramClassId, primaryClassId]);

  // Load students data from cache/Firestore
  React.useEffect(() => {
    async function loadKindergartenStudentsData() {
      try {
        const cached = await getKindergartenStudents(activeYear || '2026/2027');
        if (cached && cached.length > 0) {
          setStudents(cached);
        }
      } catch (err) {
        console.error('Error loading Kindergarten students:', err);
      }
    }
    loadKindergartenStudentsData();
  }, []);

  const activeClassObj = React.useMemo(() => {
    return classes.find(c => c.id === selectedClassId);
  }, [classes, selectedClassId]);

  const isStudentInClass = React.useCallback((studClassId: string, activeClass: { id: string; name: string }) => {
    const sClass = (studClassId || '').trim().toLowerCase();
    const actId = (activeClass.id || '').trim().toLowerCase();
    if (sClass === actId) return true;
    
    // Fallback checks
    const activeNameLower = (activeClass.name || '').toLowerCase();
    if (activeNameLower.includes('butterfly') && sClass.includes('butterfly')) return true;
    if (activeNameLower.includes('caterpillar') && sClass.includes('caterpillar')) return true;
    
    return false;
  }, []);

  const classStudents = React.useMemo(() => {
    if (!selectedClassId || !activeClassObj) return [];
    return students.filter(student => isStudentInClass(student.classId, activeClassObj));
  }, [students, selectedClassId, activeClassObj, isStudentInClass]);

  // Selected Student Selection
  const [selectedStudentId, setSelectedStudentId] = React.useState<string>('');

  React.useEffect(() => {
    if (classStudents.length > 0) {
      // Keep selected student if they are still in the active class
      if (!selectedStudentId || !classStudents.some(s => s.id === selectedStudentId)) {
        setSelectedStudentId(classStudents[0].id);
      }
    } else {
      setSelectedStudentId('');
    }
  }, [classStudents, selectedStudentId]);

  const selectedStudentObj = React.useMemo(() => {
    return classStudents.find(s => s.id === selectedStudentId);
  }, [classStudents, selectedStudentId]);

  // Date selections - Default to Monday 6 weeks ago and Friday of this week
  const [startDateStr, setStartDateStr] = React.useState<string>(() => {
    const fromSession = sessionStorage.getItem('kindy_midterm_start');
    if (fromSession) return fromSession;
    const d = new Date();
    d.setDate(d.getDate() - 42); // Approx 6 weeks
    const mon = getMonday(d);
    return formatDateToKey(mon);
  });

  const [endDateStr, setEndDateStr] = React.useState<string>(() => {
    const fromSession = sessionStorage.getItem('kindy_midterm_end');
    if (fromSession) return fromSession;
    const mon = getMonday(new Date());
    const fri = new Date(mon);
    fri.setDate(mon.getDate() + 4);
    return formatDateToKey(fri);
  });

  const handleStartDateChange = (val: string) => {
    setStartDateStr(val);
    sessionStorage.setItem('kindy_midterm_start', val);
  };

  const handleEndDateChange = (val: string) => {
    setEndDateStr(val);
    sessionStorage.setItem('kindy_midterm_end', val);
  };

  const formattedPeriodRangeIndo = React.useMemo(() => {
    if (!startDateStr || !endDateStr) return '';
    const monthsIndo = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    
    const parseDate = (dStr: string) => {
      const [y, m, d] = dStr.split('-').map(Number);
      return new Date(y, m - 1, d);
    };

    const sDate = parseDate(startDateStr);
    const eDate = parseDate(endDateStr);

    return `${sDate.getDate()} ${monthsIndo[sDate.getMonth()]} ${sDate.getFullYear()} - ${eDate.getDate()} ${monthsIndo[eDate.getMonth()]} ${eDate.getFullYear()}`;
  }, [startDateStr, endDateStr]);

  // Tabs layout selection
  // Tabs: 'kompilasi' (Kompilasi Mingguan) | 'editor' (Buat GenCom Midterm) | 'publish' (Publish PDF)
  const [activeTab, setActiveTab] = React.useState<'kompilasi' | 'editor' | 'publish'>('kompilasi');

  // Firestore Draft and Weekly Source State
  const [isFetchingWeeklySources, setIsFetchingWeeklySources] = React.useState(false);
  const [weeklySources, setWeeklySources] = React.useState<any[]>([]);
  const [midtermDrafts, setMidtermDrafts] = React.useState<Record<string, MidtermSummaryDraft>>({});
  const [isFetchingDrafts, setIsFetchingDrafts] = React.useState(false);
  const [isSavingDraft, setIsSavingDraft] = React.useState(false);

  // Unsaved changes tracking
  const [localComment, setLocalComment] = React.useState<string>('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false);

  // Confirmation dialogs
  const [pendingSelection, setPendingSelection] = React.useState<{
    type: 'student' | 'class' | 'tab' | 'semester' | 'dates';
    targetValue: string;
  } | null>(null);

  const [recompileConfirm, setRecompileConfirm] = React.useState<{
    oldSourcesCount: number;
    newSourcesCount: number;
    newSources: CompiledWeeklySource[];
  } | null>(null);

  // AI Refinement states
  const [isRefining, setIsRefining] = React.useState(false);
  const [refineReview, setRefineReview] = React.useState<{
    studentId: string;
    studentName: string;
    originalText: string;
    refinedText: string;
  } | null>(null);

  // Normalized Academic Year String
  const normalizedYear = React.useMemo(() => {
    return (activeYear || '2026/2027').replace(/\//g, '-');
  }, [activeYear]);

  // Calculate Deterministic Midterm Draft Doc ID
  const getMidtermDraftId = React.useCallback((studId: string) => {
    if (!studId) return '';
    const periodKey = `${startDateStr}_${endDateStr}`;
    return `${studId}_${normalizedYear}_S${semester}_MIDTERM_${periodKey}`;
  }, [normalizedYear, semester, startDateStr, endDateStr]);

  // Load all midterm drafts for the selected class to map the status dots of students
  const fetchMidtermDraftsForClass = React.useCallback(async () => {
    if (!selectedClassId) return;
    setIsFetchingDrafts(true);
    try {
      const q = query(
        collection(db, 'midterm_summary_drafts'),
        where('classId', '==', selectedClassId),
        where('academicYear', '==', activeYear || '2026/2027'),
        where('semester', '==', semester),
        where('startDate', '==', startDateStr),
        where('endDate', '==', endDateStr)
      );
      const snap = await getDocs(q);
      logFirestoreRead('attendanceReports', snap.docs.length || 1);
      
      const draftsMap: Record<string, MidtermSummaryDraft> = {};
      snap.docs.forEach(docSnap => {
        const data = docSnap.data() as MidtermSummaryDraft;
        draftsMap[data.studentId] = {
          ...data,
          id: docSnap.id
        };
      });
      setMidtermDrafts(draftsMap);

      // Initialize local editor comment if the active student has a draft
      if (selectedStudentId) {
        const activeDraft = draftsMap[selectedStudentId];
        setLocalComment(activeDraft?.midtermGeneralComment || '');
        setHasUnsavedChanges(false);
      }
    } catch (err) {
      console.error('[MidtermSummary] Error fetching midterm drafts:', err);
    } finally {
      setIsFetchingDrafts(false);
    }
  }, [selectedClassId, activeYear, semester, startDateStr, endDateStr, selectedStudentId]);

  const fetchPublishedReportsForClass = React.useCallback(async () => {
    if (!selectedClassId) return;
    setIsFetchingPublished(true);
    try {
      const q = query(
        collection(db, 'published_kg_reports'),
        where('classId', '==', selectedClassId),
        where('academicYear', '==', activeYear || '2026/2027'),
        where('semester', '==', semester),
        where('reportType', '==', 'KINDY_MIDTERM_REPORT')
      );
      const snap = await getDocs(q);
      logFirestoreRead('attendanceReports', snap.docs.length || 1);
      
      const publishedMap: Record<string, any> = {};
      snap.docs.forEach(docSnap => {
        const data = docSnap.data();
        const studentId = data.studentId;
        const existing = publishedMap[studentId];
        if (!existing || (data.version || 1) > (existing.version || 1)) {
          publishedMap[studentId] = {
            ...data,
            id: docSnap.id
          };
        }
      });
      setPublishedReports(publishedMap);
    } catch (err) {
      console.error('[MidtermSummary] Error fetching published reports:', err);
    } finally {
      setIsFetchingPublished(false);
    }
  }, [selectedClassId, activeYear, semester]);

  React.useEffect(() => {
    fetchMidtermDraftsForClass();
    fetchPublishedReportsForClass();
  }, [fetchMidtermDraftsForClass, fetchPublishedReportsForClass]);

  React.useEffect(() => {
    let active = true;
    const fetchKindySignatory = async () => {
      try {
        const snap = await getDoc(doc(db, 'reportConfig', 'KINDERGARTEN'));
        if (snap.exists() && active) {
          const data = snap.data();
          setKindySignatory({
            principalName: data.principalName || '',
            principalTitle: data.principalTitle || 'Principal',
            principalSignatureUrl: data.principalSignatureUrl || null
          });
        }
      } catch (err) {
        console.error("Error fetching Kindergarten signatory config:", err);
      }
    };
    fetchKindySignatory();
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    let active = true;
    const currentStudentObj = students.find(s => s.id === selectedStudentId);
    const studentClassIdRaw = currentStudentObj?.classId || selectedClassId || "";
    const studentCanonicalClassId = resolveCanonicalClassId(studentClassIdRaw, classes) || studentClassIdRaw;

    if (!studentCanonicalClassId) {
      setResolvedSignatureUrl(null);
      setResolvedTeacherName(null);
      return;
    }

    async function fetchClassSignature() {
      setIsSignatureLoading(true);
      try {
        const classRef = doc(db, 'classes', studentCanonicalClassId);
        const classSnap = await getDoc(classRef);
        logFirestoreRead('classes', 1);
        
        if (classSnap.exists() && active) {
          const data = classSnap.data();
          setResolvedSignatureUrl(data.teacherSignatureUrl || null);
          setResolvedTeacherName(data.homeroomTeacherName || null);
        } else if (active) {
          const fallbackClass = classes.find(c => c.id === studentCanonicalClassId) || activeClassObj;
          setResolvedSignatureUrl(fallbackClass?.teacherSignatureUrl || null);
          setResolvedTeacherName(fallbackClass?.homeroomTeacherName || null);
        }
      } catch (err) {
        console.error("Error fetching class signature from Firestore:", err);
        if (active) {
          const fallbackClass = classes.find(c => c.id === studentCanonicalClassId) || activeClassObj;
          setResolvedSignatureUrl(fallbackClass?.teacherSignatureUrl || null);
          setResolvedTeacherName(fallbackClass?.homeroomTeacherName || null);
        }
      } finally {
        if (active) {
          setIsSignatureLoading(false);
        }
      }
    }

    fetchClassSignature();
    return () => {
      active = false;
    };
  }, [selectedStudentId, selectedClassId, classes, activeClassObj, students]);

  // Handle local comment input edits
  const handleCommentChange = (text: string) => {
    setLocalComment(text);
    const activeDraft = midtermDrafts[selectedStudentId];
    const originalText = activeDraft?.midtermGeneralComment || '';
    setHasUnsavedChanges(text !== originalText);
  };

  // Browser reload/navigation warning
  React.useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = 'Anda memiliki perubahan yang belum disimpan. Apakah Anda yakin ingin membuang perubahan ini?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  // Navigation intercepts with warnings
  const confirmNavigation = (
    type: 'student' | 'class' | 'tab' | 'semester' | 'dates',
    targetValue: string
  ) => {
    if (type === 'dates') {
      const activeDraft = midtermDrafts[selectedStudentId];
      const hasExistingDraft = !!activeDraft || localComment.trim().length > 0;
      if (hasExistingDraft) {
        setPendingSelection({ type, targetValue });
        return;
      }
    }
    if (hasUnsavedChanges) {
      setPendingSelection({ type, targetValue });
    } else {
      executeNavigation(type, targetValue);
    }
  };

  const executeNavigation = (
    type: 'student' | 'class' | 'tab' | 'semester' | 'dates',
    targetValue: string
  ) => {
    setHasUnsavedChanges(false);
    if (type === 'student') {
      setSelectedStudentId(targetValue);
      const activeDraft = midtermDrafts[targetValue];
      setLocalComment(activeDraft?.midtermGeneralComment || '');
    } else if (type === 'class') {
      setSelectedClassId(targetValue);
      setLastSelectedClassId(targetValue);
    } else if (type === 'tab') {
      setActiveTab(targetValue as any);
    } else if (type === 'semester') {
      setSemester(Number(targetValue));
    } else if (type === 'dates') {
      const [start, end] = targetValue.split('|');
      handleStartDateChange(start);
      handleEndDateChange(end);
    }
    setPendingSelection(null);
  };

  // Fetch weekly summary drafts of current student inside selected range
  const fetchWeeklySourcesForStudent = React.useCallback(async () => {
    if (!selectedStudentId || !selectedClassId) {
      setWeeklySources([]);
      return;
    }
    setIsFetchingWeeklySources(true);
    try {
      const q = query(
        collection(db, 'weekly_summary_drafts'),
        where('studentId', '==', selectedStudentId),
        where('classId', '==', selectedClassId),
        where('academicYear', '==', activeYear || '2026/2027')
      );
      const snap = await getDocs(q);
      logFirestoreRead('attendanceReports', snap.docs.length || 1);
      
      const filteredSources: any[] = [];
      snap.docs.forEach(docSnap => {
        const data = docSnap.data();
        
        // Date overlap check: weekly report start or end date falls within midterm range
        const wStart = data.startDate;
        const wEnd = data.endDate;

        const overlaps = wStart && wEnd && (wStart <= endDateStr && wEnd >= startDateStr);
        if (overlaps) {
          filteredSources.push({
            id: docSnap.id,
            ...data
          });
        }
      });

      // Sort chronologically by startDate
      filteredSources.sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
      setWeeklySources(filteredSources);
    } catch (err) {
      console.error('[MidtermSummary] Error fetching weekly sources:', err);
      toast.error('Gagal mengambil data draf mingguan.');
    } finally {
      setIsFetchingWeeklySources(false);
    }
  }, [selectedStudentId, selectedClassId, startDateStr, endDateStr, activeYear]);

  React.useEffect(() => {
    fetchWeeklySourcesForStudent();
  }, [fetchWeeklySourcesForStudent]);

  // Compilation Action
  const handleCompileWeekly = async () => {
    if (!selectedStudentObj || !selectedClassId || !activeClassObj) return;

    if (startDateStr > endDateStr) {
      toast.error('Tanggal Mulai tidak boleh lebih besar dari Tanggal Selesai.');
      return;
    }

    const newSources: CompiledWeeklySource[] = weeklySources.map(w => {
      const comments = w.generalComments || [w.socialEmotional, w.weeklyComments].filter(Boolean).join('\n\n') || '';
      return {
        weeklyDraftId: w.id,
        startDate: w.startDate || '',
        endDate: w.endDate || '',
        theme: w.theme || '',
        generalComments: comments,
        sourceUpdatedAt: w.updatedAt || null
      };
    });

    const activeDraft = midtermDrafts[selectedStudentId];

    if (activeDraft && activeDraft.compiledWeeklySources && activeDraft.compiledWeeklySources.length > 0) {
      // Show Confirmation Dialog for recompiling
      setRecompileConfirm({
        oldSourcesCount: activeDraft.compiledWeeklySources.length,
        newSourcesCount: newSources.length,
        newSources
      });
    } else {
      await executeCompilation(newSources);
    }
  };

  const executeCompilation = async (sources: CompiledWeeklySource[]) => {
    if (!selectedStudentObj || !activeClassObj) return;

    const draftId = getMidtermDraftId(selectedStudentId);
    const activeDraft = midtermDrafts[selectedStudentId];

    const midtermComment = activeDraft?.midtermGeneralComment || '';

    const payload: MidtermSummaryDraft = {
      unit: 'KINDERGARTEN',
      reportType: 'KINDY_MIDTERM_REPORT',
      studentId: selectedStudentId,
      studentNameSnapshot: selectedStudentObj.name,
      classId: selectedClassId,
      classNameSnapshot: activeClassObj.name,
      academicYear: activeYear || '2026/2027',
      semester,
      periodKey: `${startDateStr}_${endDateStr}`,
      startDate: startDateStr,
      endDate: endDateStr,
      periodLabel: formattedPeriodRangeIndo,
      midtermGeneralComment: midtermComment,
      status: activeDraft?.status || 'DRAFT',
      compiledWeeklySources: sources,
      compilationUpdatedAt: Date.now(),
      compilationUpdatedBy: profile?.email || 'System',
      updatedAt: Date.now(),
      updatedBy: profile?.email || 'System'
    };

    if (!activeDraft) {
      payload.createdAt = Date.now();
      payload.createdBy = profile?.email || 'System';
    }

    const toastId = toast.loading('Mengompilasi draf mingguan...');
    try {
      await setDoc(doc(db, 'midterm_summary_drafts', draftId), payload, { merge: true });
      
      // Update local midtermDrafts cache state
      setMidtermDrafts(prev => ({
        ...prev,
        [selectedStudentId]: {
          ...payload,
          id: draftId
        }
      }));

      toast.success('Kompilasi mingguan berhasil disimpan! Mengalihkan ke tab Editor...', { id: toastId });
      setActiveTab('editor');
    } catch (err) {
      console.error('[MidtermSummary] Error compiling:', err);
      toast.error('Gagal menyimpan kompilasi.', { id: toastId });
    } finally {
      setRecompileConfirm(null);
    }
  };

  // Save Draft Action (Status remains DRAFT)
  const handleSaveDraft = async () => {
    if (!selectedStudentObj || !activeClassObj) return;
    setIsSavingDraft(true);
    
    const draftId = getMidtermDraftId(selectedStudentId);
    const activeDraft = midtermDrafts[selectedStudentId];

    const payload: Partial<MidtermSummaryDraft> = {
      unit: 'KINDERGARTEN',
      reportType: 'KINDY_MIDTERM_REPORT',
      studentId: selectedStudentId,
      studentNameSnapshot: selectedStudentObj.name,
      classId: selectedClassId,
      classNameSnapshot: activeClassObj.name,
      academicYear: activeYear || '2026/2027',
      semester,
      periodKey: `${startDateStr}_${endDateStr}`,
      startDate: startDateStr,
      endDate: endDateStr,
      periodLabel: formattedPeriodRangeIndo,
      midtermGeneralComment: localComment,
      status: 'DRAFT',
      compiledWeeklySources: activeDraft?.compiledWeeklySources || [],
      updatedAt: Date.now(),
      updatedBy: profile?.email || 'System'
    };

    if (!activeDraft) {
      payload.createdAt = Date.now();
      payload.createdBy = profile?.email || 'System';
    }

    const toastId = toast.loading('Menyimpan draf...');
    try {
      await setDoc(doc(db, 'midterm_summary_drafts', draftId), payload, { merge: true });
      
      // Sync local midtermDrafts cache state
      setMidtermDrafts(prev => ({
        ...prev,
        [selectedStudentId]: {
          ...(prev[selectedStudentId] || {}),
          ...payload,
          id: draftId
        } as MidtermSummaryDraft
      }));

      setHasUnsavedChanges(false);
      toast.success('Draf berhasil disimpan! ✨', { id: toastId });
    } catch (err) {
      console.error('[MidtermSummary] Save error:', err);
      toast.error('Gagal menyimpan draf.', { id: toastId });
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Submit for Review Action (Status changes to READY_FOR_REVIEW)
  const handleSubmitForReview = async () => {
    if (!selectedStudentObj || !activeClassObj) return;
    if (!localComment.trim()) {
      toast.error('Komentar Midterm tidak boleh kosong untuk diajukan review.');
      return;
    }
    
    setIsSavingDraft(true);
    const draftId = getMidtermDraftId(selectedStudentId);
    const activeDraft = midtermDrafts[selectedStudentId];

    const payload: Partial<MidtermSummaryDraft> = {
      unit: 'KINDERGARTEN',
      reportType: 'KINDY_MIDTERM_REPORT',
      studentId: selectedStudentId,
      studentNameSnapshot: selectedStudentObj.name,
      classId: selectedClassId,
      classNameSnapshot: activeClassObj.name,
      academicYear: activeYear || '2026/2027',
      semester,
      periodKey: `${startDateStr}_${endDateStr}`,
      startDate: startDateStr,
      endDate: endDateStr,
      periodLabel: formattedPeriodRangeIndo,
      midtermGeneralComment: localComment,
      status: 'READY_FOR_REVIEW',
      compiledWeeklySources: activeDraft?.compiledWeeklySources || [],
      updatedAt: Date.now(),
      updatedBy: profile?.email || 'System',
      submittedForReviewAt: Date.now(),
      submittedForReviewBy: profile?.email || 'System'
    };

    if (!activeDraft) {
      payload.createdAt = Date.now();
      payload.createdBy = profile?.email || 'System';
    }

    const toastId = toast.loading('Mengajukan review ke admin...');
    try {
      await setDoc(doc(db, 'midterm_summary_drafts', draftId), payload, { merge: true });
      
      // Sync local midtermDrafts cache state
      setMidtermDrafts(prev => ({
        ...prev,
        [selectedStudentId]: {
          ...(prev[selectedStudentId] || {}),
          ...payload,
          id: draftId
        } as MidtermSummaryDraft
      }));

      setHasUnsavedChanges(false);
      toast.success('Review berhasil diajukan dan draf dikunci! 🚀', { id: toastId });
    } catch (err) {
      console.error('[MidtermSummary] Submit error:', err);
      toast.error('Gagal mengajukan review.', { id: toastId });
    } finally {
      setIsSavingDraft(false);
    }
  };

  // AI Refine Action
  const handleRefineWithAI = async () => {
    if (!localComment.trim()) {
      toast.error('Tulis beberapa komentar terlebih dahulu untuk dirapikan oleh AI.');
      return;
    }

    setIsRefining(true);
    const toastId = toast.loading("Lumina AI sedang merapikan komentar Midterm...");
    try {
      const response = await fetch('/api/kindergarten/weekly-summary/refine-comment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: localComment,
          fieldType: 'general_comments',
          studentName: selectedStudentObj?.name || 'Siswa',
          classLevel: selectedStudentObj?.ageGroup || 'TK_A',
          theme: 'Laporan Midterm',
          week: 'Midterm'
        })
      });

      if (!response.ok) {
        let errMsg = 'Gagal merapikan komentar menggunakan AI';
        try {
          const errData = await response.json();
          errMsg = errData.error || errMsg;
        } catch (_) {}
        throw new Error(errMsg);
      }

      const data = await response.json();
      const refinedText = data.refinedText || '';

      toast.success("Komentar berhasil dirapikan! ✨", { id: toastId });
      setRefineReview({
        studentId: selectedStudentId,
        studentName: selectedStudentObj?.name || 'Siswa',
        originalText: localComment,
        refinedText
      });
    } catch (err: any) {
      console.error('[MidtermSummary] AI Refine error:', err);
      toast.error("Gagal merapikan komentar menggunakan AI. Teks asli Anda tetap aman.", { id: toastId });
    } finally {
      setIsRefining(false);
    }
  };

  const handlePublishMidterm = async () => {
    const activeDraft = midtermDrafts[selectedStudentId];
    if (!activeDraft) {
      toast.error("Draft Midterm belum dibuat.");
      return;
    }

    setIsPublishing(true);
    setPublishStatus("Menyiapkan dokumen...");
    const toastId = "publish-midterm";
    toast.loading("Menyiapkan dokumen...", { id: toastId });

    try {
      // 1. Get Google Drive token
      const token = await getGoogleDriveToken();
      if (!token) {
        toast.dismiss(toastId);
        toast.error("Gagal mendapatkan akses Google Drive.");
        setIsPublishing(false);
        setPublishStatus("");
        return;
      }

      // 2. Preload images & wait for layout
      setPublishStatus("Membuat PDF...");
      toast.loading("Membuat PDF...", { id: toastId });

      if (typeof document !== 'undefined' && (document as any).fonts && (document as any).fonts.ready) {
        await (document as any).fonts.ready;
      }
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      });

      // 3. Render page to Canvas & PDF
      const pageElement = document.getElementById("midterm-report-page-1");
      if (!pageElement) {
        toast.dismiss(toastId);
        toast.error("Elemen halaman laporan tidak ditemukan.");
        setIsPublishing(false);
        setPublishStatus("");
        return;
      }

      const originalStyle = pageElement.getAttribute('style') || '';

      pageElement.style.width = '794px';
      pageElement.style.height = '1123px';
      pageElement.style.minWidth = '794px';
      pageElement.style.minHeight = '1123px';
      pageElement.style.maxWidth = '794px';
      pageElement.style.maxHeight = '1123px';
      pageElement.style.boxSizing = 'border-box';

      const canvas = await html2canvasWithModernColors(pageElement, {
        scale: 2,
        useCORS: true,
        logging: false,
        windowWidth: 1200,
        windowHeight: 1600,
        onclone: (clonedDoc, clonedElement) => {
          if (clonedElement) {
            clonedElement.style.fontFamily = '"Inter", sans-serif';
            clonedElement.style.width = '794px';
            clonedElement.style.height = '1123px';
            clonedElement.style.minWidth = '794px';
            clonedElement.style.minHeight = '1123px';
            clonedElement.style.maxWidth = '794px';
            clonedElement.style.maxHeight = '1123px';
            clonedElement.style.boxSizing = 'border-box';
          }
        }
      });

      pageElement.setAttribute('style', originalStyle);

      const imgData = canvas.toDataURL('image/jpeg', 0.85);

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
      
      const pdfBlob = pdf.output('blob');

      const getBase64 = (blob: Blob): Promise<string> => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onload = () => {
            const base64String = (reader.result as string).split(',')[1];
            resolve(base64String);
          };
          reader.onerror = error => reject(error);
        });
      };

      const base64Data = await getBase64(pdfBlob);

      // Filename standard
      const filename = `S${semester} - ${selectedStudentObj?.name} - ${activeClassObj?.name || 'Class'} - Midterm Report.pdf`;

      setPublishStatus("Mengunggah ke Google Drive...");
      toast.loading("Mengunggah ke Google Drive...", { id: toastId });

      const boundary = 'foo_bar_boundary';
      const delimiter = `\r\n--${boundary}\r\n`;
      const close_delim = `\r\n--${boundary}--`;

      const metadata = {
        name: filename,
        mimeType: 'application/pdf',
        parents: ['1IBy2Ly_h72v3znKod3rXLLgx1IaeoGqO'],
      };

      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/pdf\r\n' +
        'Content-Transfer-Encoding: base64\r\n\r\n' +
        base64Data +
        close_delim;

      const driveResponse = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body: multipartRequestBody,
        }
      );

      if (!driveResponse.ok) {
        const errText = await driveResponse.text();
        throw new Error(`Google Drive API returned status ${driveResponse.status}: ${errText}`);
      }

      const driveData = await driveResponse.json();
      const driveFileId = driveData.id || '';
      const driveFileUrl = driveFileId ? `https://drive.google.com/file/d/${driveFileId}/view` : '';

      setPublishStatus("Menyimpan publikasi...");
      toast.loading("Menyimpan publikasi...", { id: toastId });

      // Calculate versions
      const existingVersions = Object.values(publishedReports).filter((r: any) => {
        return r.studentId === selectedStudentId && r.semester === semester;
      });
      const maxVersion = existingVersions.reduce((max, r: any) => {
        const v = r.version || 1;
        return v > max ? v : max;
      }, 0);
      const nextVersion = maxVersion > 0 ? maxVersion + 1 : 1;

      const reportPayload = {
        classId: selectedClassId,
        className: activeClassObj?.name || 'Unknown Class',
        academicYear: activeYear || '2026/2027',
        studentId: selectedStudentId,
        studentName: selectedStudentObj?.name || 'Unknown Student',
        startDate: startDateStr,
        endDate: endDateStr,
        semester,
        reportType: 'KINDY_MIDTERM_REPORT',
        publishedAt: Date.now(),
        driveFileId,
        driveFileUrl,
        version: nextVersion,
        publishedBy: profile?.uid || 'Unknown',
        publishedByEmail: profile?.email || 'Unknown',
        status: 'ready_to_send',

        reportSnapshot: {
          version: nextVersion,
          createdAt: Date.now(),
          student: {
            id: selectedStudentId,
            name: selectedStudentObj?.name,
            classId: selectedClassId,
            className: activeClassObj?.name
          },
          period: {
            startDate: startDateStr,
            endDate: endDateStr,
            periodLabel: formattedPeriodRangeIndo,
            semester
          },
          midtermGeneralComment: activeDraft.midtermGeneralComment,
          signatories: {
            principal: {
              name: kindySignatory?.principalName || '',
              title: kindySignatory?.principalTitle || 'Principal',
              signatureUrl: kindySignatory?.principalSignatureUrl || null
            },
            classTeacher: {
              name: resolvedTeacherName || '',
              title: 'Class Teacher',
              signatureUrl: resolvedSignatureUrl || null
            }
          },
          attendanceSummary: computedAttendance,
          compiledWeeks: activeDraft.compiledWeeklySources || []
        }
      };

      // Save to published_kg_reports
      const publishedDocId = `${selectedStudentId}_S${semester}_MIDTERM_V${nextVersion}`;
      await setDoc(doc(db, 'published_kg_reports', publishedDocId), reportPayload);

      // Update source draft status to 'PUBLISHED'
      const draftId = getMidtermDraftId(selectedStudentId);
      await setDoc(doc(db, 'midterm_summary_drafts', draftId), { status: 'PUBLISHED' }, { merge: true });

      // Update local states
      setMidtermDrafts(prev => ({
        ...prev,
        [selectedStudentId]: {
          ...prev[selectedStudentId],
          status: 'PUBLISHED'
        } as MidtermSummaryDraft
      }));

      await fetchPublishedReportsForClass();

      toast.success(`Midterm Report berhasil dipublikasikan untuk ${selectedStudentObj?.name}! 🎉`, { id: toastId });
    } catch (err: any) {
      console.error("Error publishing midterm report:", err);
      toast.error(`Gagal mempublikasikan: ${err.message}`, { id: toastId });
    } finally {
      setIsPublishing(false);
      setPublishStatus("");
    }
  };

  const handleRejectDraft = async () => {
    if (!selectedStudentId) return;
    const activeDraft = midtermDrafts[selectedStudentId];
    if (!activeDraft) return;

    if (!window.confirm(`Apakah Anda yakin ingin mengembalikan draf ini ke status DRAFT untuk diperbaiki oleh guru kelas?`)) {
      return;
    }

    const draftId = getMidtermDraftId(selectedStudentId);
    const toastId = toast.loading("Mengembalikan draf...");
    try {
      await setDoc(doc(db, 'midterm_summary_drafts', draftId), { status: 'DRAFT' }, { merge: true });
      
      setMidtermDrafts(prev => ({
        ...prev,
        [selectedStudentId]: {
          ...prev[selectedStudentId],
          status: 'DRAFT'
        } as MidtermSummaryDraft
      }));
      toast.success("Draf berhasil dikembalikan ke status DRAFT.", { id: toastId });
    } catch (err: any) {
      console.error("Error returning draft:", err);
      toast.error(`Gagal memproses: ${err.message}`, { id: toastId });
    }
  };

  const handleApproveDraft = async () => {
    if (!selectedStudentId) return;
    const activeDraft = midtermDrafts[selectedStudentId];
    if (!activeDraft) return;

    if (!isAuthorizer) {
      toast.error("Hanya Kepala TK atau Super Admin yang dapat menyetujui draf.");
      return;
    }

    if (profile?.email === activeDraft.createdBy) {
      toast.error("Guru yang membuat draf ini tidak dapat menyetujui draf miliknya sendiri.");
      return;
    }

    if (!window.confirm(`Apakah Anda yakin ingin menyetujui draf Midterm Report untuk ${selectedStudentObj?.name}?`)) {
      return;
    }

    const draftId = getMidtermDraftId(selectedStudentId);
    const toastId = toast.loading("Menyetujui draf...");
    try {
      await setDoc(doc(db, 'midterm_summary_drafts', draftId), { 
        status: 'APPROVED',
        approvedAt: Date.now(),
        approvedBy: profile?.email || 'System'
      }, { merge: true });
      
      setMidtermDrafts(prev => ({
        ...prev,
        [selectedStudentId]: {
          ...prev[selectedStudentId],
          status: 'APPROVED',
          approvedAt: Date.now(),
          approvedBy: profile?.email || 'System'
        } as MidtermSummaryDraft
      }));
      toast.success("Draf berhasil disetujui! Status kini APPROVED. Guru atau Admin sekarang dapat menerbitkan PDF.", { id: toastId });
    } catch (err: any) {
      console.error("Error approving draft:", err);
      toast.error(`Gagal menyetujui draf: ${err.message}`, { id: toastId });
    }
  };

  // Helper to determine student roster dot status color
  const getStudentStatusBadge = (studId: string) => {
    const published = publishedReports[studId];
    if (published) {
      return {
        label: 'Terbit',
        dotColor: 'bg-blue-500',
        textColor: 'text-blue-700 bg-blue-50 border-blue-150'
      };
    }
    const draft = midtermDrafts[studId];
    if (!draft) {
      return {
        label: 'Belum dibuat',
        dotColor: 'bg-gray-300',
        textColor: 'text-gray-500 bg-gray-50 border-gray-150'
      };
    }
    if (draft.status === 'PUBLISHED') {
      return {
        label: 'Terbit',
        dotColor: 'bg-blue-500',
        textColor: 'text-blue-700 bg-blue-50 border-blue-150'
      };
    }
    if (draft.status === 'APPROVED') {
      return {
        label: 'Disetujui',
        dotColor: 'bg-purple-500',
        textColor: 'text-purple-700 bg-purple-50 border-purple-150'
      };
    }
    if (draft.status === 'READY_FOR_REVIEW') {
      return {
        label: 'Siap ditinjau',
        dotColor: 'bg-emerald-500 animate-pulse',
        textColor: 'text-emerald-700 bg-emerald-50 border-emerald-150'
      };
    }
    return {
      label: 'Draft',
      dotColor: 'bg-amber-500',
      textColor: 'text-amber-700 bg-amber-50 border-amber-150'
    };
  };

  const currentStudentStatus = getStudentStatusBadge(selectedStudentId);
  const isLockedForEditing = (
    midtermDrafts[selectedStudentId]?.status === 'READY_FOR_REVIEW' || 
    midtermDrafts[selectedStudentId]?.status === 'APPROVED' || 
    midtermDrafts[selectedStudentId]?.status === 'PUBLISHED' || 
    !!publishedReports[selectedStudentId]
  ) && profile?.role !== 'SUPER_ADMIN' && profile?.role !== 'HEAD_UNIT' && profile?.role !== 'kindergarten_head';

  const activeDraft = midtermDrafts[selectedStudentId];
  const publishedReportObj = publishedReports[selectedStudentId];

  const computedAttendance = React.useMemo(() => {
    const summary = {
      present: 0,
      sick: 0,
      izin: 0,
      noNews: 0,
      total: 0
    };

    if (activeDraft?.compiledWeeklySources) {
      activeDraft.compiledWeeklySources.forEach(source => {
        const matchingWeekly = weeklySources.find(w => w.id === source.weeklyDraftId);
        const att = matchingWeekly?.attendanceSummary || {};
        const present = (att.happy || 0) + (att.sad || 0) + (att.angry || 0) + (att.ok || 0);
        const sick = att.sick || 0;
        const izin = att.izin || 0;
        const noNews = att.noNews || 0;

        summary.present += present;
        summary.sick += sick;
        summary.izin += izin;
        summary.noNews += noNews;
      });
    }
    summary.total = summary.present + summary.sick + summary.izin + summary.noNews;
    return summary;
  }, [activeDraft, weeklySources]);

  const isAuthorizer = profile?.role === 'SUPER_ADMIN' || profile?.role === 'HEAD_UNIT' || profile?.role === 'kindergarten_head';

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20 px-4 font-sans">
      
      {/* HEADER SECTION */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-[2rem] border border-gray-150 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-[#109E58]/10 text-[#109E58] text-[10px] font-black uppercase tracking-wider">Midterm</span>
            <span className="text-xs text-gray-400 font-bold">Konsolidasi & Evaluasi Tengah Semester</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Kindergarten Midterm Report</h1>
        </div>

        {/* Semester Context Toggle */}
        <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 p-1 rounded-xl">
          <button
            onClick={() => confirmNavigation('semester', '1')}
            className={cn(
              "px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer",
              semester === 1 
                ? "bg-white text-gray-900 shadow-sm border border-gray-200/50" 
                : "text-gray-400 hover:text-gray-600"
            )}
          >
            Semester I
          </button>
          <button
            onClick={() => confirmNavigation('semester', '2')}
            className={cn(
              "px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer",
              semester === 2 
                ? "bg-white text-gray-900 shadow-sm border border-gray-200/50" 
                : "text-gray-400 hover:text-gray-600"
            )}
          >
            Semester II
          </button>
        </div>
      </header>

      {/* FILTER & PERIOD SELECTOR CARD */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-6 rounded-[2rem] border border-gray-150 shadow-sm">
        
        {/* Class Selection Dropdown */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-[#109E58] uppercase tracking-wider block">Pilih Kelas</label>
          <div className="relative">
            <select
              value={selectedClassId}
              onChange={(e) => confirmNavigation('class', e.target.value)}
              disabled={isRestrictedToAssignedClasses && classes.length <= 1}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none text-gray-700 appearance-none pr-8 cursor-pointer hover:bg-gray-100/50 disabled:opacity-75 disabled:cursor-not-allowed"
            >
              {isLoadingClasses ? (
                <option value="">Memuat kelas...</option>
              ) : classes.length === 0 ? (
                <option value="">Belum ada kelas</option>
              ) : (
                classes.map(cls => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name} ({cls.grade || 'K'})
                  </option>
                ))
              )}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Start Date Picker */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-[#109E58] uppercase tracking-wider block">Tanggal Mulai</label>
          <div className="relative">
            <input
              type="date"
              value={startDateStr}
              onChange={(e) => confirmNavigation('dates', `${e.target.value}|${endDateStr}`)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-bold outline-none text-gray-700 cursor-pointer"
            />
          </div>
        </div>

        {/* End Date Picker */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-[#109E58] uppercase tracking-wider block">Tanggal Selesai</label>
          <div className="relative">
            <input
              type="date"
              value={endDateStr}
              onChange={(e) => confirmNavigation('dates', `${startDateStr}|${e.target.value}`)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-bold outline-none text-gray-700 cursor-pointer"
            />
          </div>
        </div>

        {/* Current Date Range Information Visual */}
        <div className="space-y-1.5">
          <span className="text-[10px] font-black text-[#109E58] uppercase tracking-wider block">Rentang Terpilih (S{semester})</span>
          <div className="flex items-center gap-2 bg-[#109E58]/5 border border-[#109E58]/10 text-gray-700 rounded-xl px-3.5 py-2 text-xs font-bold min-h-[38px]">
            <Calendar size={14} className="text-[#109E58] shrink-0" />
            <span className="truncate leading-tight">{formattedPeriodRangeIndo || "Pilih rentang tanggal"}</span>
          </div>
        </div>

      </div>

      {/* INTERNAL WORKFLOW TAB NAVIGATION */}
      <div className="flex border-b border-gray-250 shrink-0 gap-1.5">
        <button
          onClick={() => confirmNavigation('tab', 'kompilasi')}
          className={cn(
            "px-5 py-3 text-xs font-black transition-all cursor-pointer border-b-2 -mb-[2px] tracking-tight",
            activeTab === 'kompilasi'
              ? "border-[#109E58] text-[#109E58]"
              : "border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-200"
          )}
        >
          1. Kompilasi Mingguan
        </button>
        <button
          onClick={() => confirmNavigation('tab', 'editor')}
          className={cn(
            "px-5 py-3 text-xs font-black transition-all cursor-pointer border-b-2 -mb-[2px] tracking-tight",
            activeTab === 'editor'
              ? "border-[#109E58] text-[#109E58]"
              : "border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-200"
          )}
        >
          2. Buat GenCom Midterm
        </button>
        <button
          onClick={() => confirmNavigation('tab', 'publish')}
          className={cn(
            "px-5 py-3 text-xs font-black transition-all cursor-pointer border-b-2 -mb-[2px] tracking-tight flex items-center gap-1.5",
            activeTab === 'publish'
              ? "border-[#109E58] text-[#109E58]"
              : "border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-200"
          )}
        >
          3. Publish PDF
        </button>
      </div>

      {/* DETAILED WORKFLOW BODY (SPLIT VIEW) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT COLUMN: Student Roster Sidebar with status markers */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white p-5 rounded-3xl border border-gray-150 shadow-sm space-y-4">
            
            <div className="flex justify-between items-center pb-2.5 border-b border-gray-100">
              <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider font-sans">Roster Kelas</h3>
              <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-bold">
                {classStudents.length} Siswa
              </span>
            </div>

            {/* Student selection cards */}
            <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
              {classStudents.length === 0 ? (
                <div className="p-4 text-center text-xs text-gray-400 italic">
                  Tidak ada siswa di kelas ini.
                </div>
              ) : (
                classStudents.map((stud) => {
                  const isSelected = stud.id === selectedStudentId;
                  const stat = getStudentStatusBadge(stud.id);
                  return (
                    <button
                      key={stud.id}
                      onClick={() => confirmNavigation('student', stud.id)}
                      className={cn(
                        "w-full text-left p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 cursor-pointer",
                        isSelected
                          ? "bg-emerald-50/55 border-emerald-200 shadow-sm"
                          : "bg-white hover:bg-gray-50 border-gray-150"
                      )}
                    >
                      <div className="space-y-0.5 min-w-0">
                        <p className={cn(
                          "text-xs font-bold truncate",
                          isSelected ? "text-emerald-900" : "text-gray-800"
                        )}>
                          {stud.name}
                        </p>
                        <p className="text-[10px] text-gray-400 font-medium">
                          No. Absen: {stud.attendanceNumber || stud.noAbsen || '-'}
                        </p>
                      </div>
                      
                      {/* Status indicator dot */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className={cn("w-2 h-2 rounded-full", stat.dotColor)} />
                        <span className="text-[9px] text-gray-450 font-black uppercase tracking-wider hidden sm:inline">
                          {stat.label.split(' ')[0]}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

          </div>
        </div>

        {/* RIGHT COLUMN: Active Workspace Area */}
        <div className="lg:col-span-9 space-y-6">
          
          {/* Quick Roster Nav header bar */}
          <div className="bg-white px-5 py-3 rounded-2xl border border-gray-150 shadow-sm flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-[10px] font-black">
                {selectedStudentObj?.attendanceNumber || selectedStudentObj?.noAbsen || '01'}
              </span>
              <p className="text-xs font-bold text-gray-800 font-sans">{selectedStudentObj?.name || "Pilih Siswa"}</p>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                disabled={classStudents.length <= 1 || classStudents.findIndex(s => s.id === selectedStudentId) <= 0}
                onClick={() => {
                  const idx = classStudents.findIndex(s => s.id === selectedStudentId);
                  if (idx > 0) confirmNavigation('student', classStudents[idx - 1].id);
                }}
                className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-[#109E58] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                disabled={classStudents.length <= 1 || classStudents.findIndex(s => s.id === selectedStudentId) === -1 || classStudents.findIndex(s => s.id === selectedStudentId) >= classStudents.length - 1}
                onClick={() => {
                  const idx = classStudents.findIndex(s => s.id === selectedStudentId);
                  if (idx !== -1 && idx < classStudents.length - 1) confirmNavigation('student', classStudents[idx + 1].id);
                }}
                className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-[#109E58] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          {/* TAB 1: KOMPILASI MINGGUAN CONTENT */}
          {activeTab === 'kompilasi' && (
            <div className="space-y-6">
              
              <div className="bg-gradient-to-r from-emerald-500/5 to-teal-500/5 p-6 rounded-3xl border border-emerald-500/10 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-emerald-100 rounded-xl text-emerald-700 mt-0.5">
                    <ClipboardList size={18} />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-sm font-black text-emerald-900 font-sans">Kompilasi Laporan Mingguan ke Midterm</h2>
                    <p className="text-xs text-gray-500 font-medium leading-relaxed font-sans">
                      Halaman ini menampilkan seluruh General Comments mingguan dari <b>{selectedStudentObj?.name}</b> pada rentang tanggal terpilih secara kronologis. Anda dapat mengompilasi seluruh catatan mingguan ini ke dalam snapshot referensi Midterm sebagai panduan menyusun narasi komparatif.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 pt-2 items-center justify-between">
                  <div className="text-[11px] text-gray-400 font-bold font-sans">
                    Ditemukan: <span className="text-[#109E58] font-black">{weeklySources.length} Laporan Mingguan</span>
                  </div>

                  <button
                    disabled={weeklySources.length === 0}
                    onClick={handleCompileWeekly}
                    className="flex items-center justify-center gap-2 bg-[#109E58] hover:bg-emerald-700 text-white font-extrabold text-xs px-5 py-3 rounded-xl shadow-md cursor-pointer transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
                  >
                    <Sparkles size={14} />
                    {midtermDrafts[selectedStudentId]?.compiledWeeklySources?.length ? 'Perbarui Referensi Mingguan' : 'Kompilasi ke Draft Midterm'}
                  </button>
                </div>
              </div>

              {/* Weekly Timeline Display */}
              <div className="space-y-4">
                {isFetchingWeeklySources ? (
                  <div className="flex items-center justify-center py-16 gap-3 text-gray-400 text-xs">
                    <Loader2 size={16} className="animate-spin" />
                    Memuat draf mingguan siswa...
                  </div>
                ) : weeklySources.length === 0 ? (
                  <div className="text-center py-16 bg-white border border-gray-150 rounded-3xl shadow-sm text-gray-400 text-xs italic font-sans px-8">
                    Belum ada General Comments mingguan untuk siswa ini pada rentang yang dipilih.
                  </div>
                ) : (
                  <div className="relative border-l-2 border-gray-150 pl-6 ml-3 space-y-6 pt-2">
                    {weeklySources.map((w, index) => {
                      const comments = w.generalComments || [w.socialEmotional, w.weeklyComments].filter(Boolean).join('\n\n') || '';
                      return (
                        <div key={w.id || index} className="relative">
                          {/* Dot Badge timeline node */}
                          <div className="absolute -left-[31px] top-1 bg-white border-2 border-emerald-500 w-3 h-3 rounded-full" />
                          
                          <div className="bg-white border border-gray-150 rounded-2xl p-5 shadow-sm space-y-3">
                            <div className="flex justify-between items-center gap-2 flex-wrap">
                              <div>
                                <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 text-[10px] font-black uppercase tracking-wider block sm:inline font-sans">
                                  {w.week || `Minggu ${index + 1}`}
                                </span>
                                <span className="text-[10px] text-gray-400 font-extrabold ml-0 sm:ml-2 font-sans">
                                  {w.startDate} s/d {w.endDate}
                                </span>
                              </div>
                              {w.theme && (
                                <span className="text-xs text-gray-600 font-extrabold font-sans">
                                  Tema: {w.theme}
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-gray-700 font-serif leading-relaxed whitespace-pre-wrap pl-1 border-l border-gray-100">
                              {comments || <span className="text-gray-400 italic font-sans text-[11px]">Draf disimpan tanpa narasi General Comment.</span>}
                            </p>

                            {w.updatedBy && (
                              <div className="flex justify-end text-[9px] text-gray-400 font-semibold font-sans">
                                Diperbarui oleh: {w.updatedBy} {w.updatedAt ? `pada ${new Date(w.updatedAt).toLocaleDateString('id-ID')}` : ''}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* TAB 2: BUAT GENCOM MIDTERM CONTENT (SPLIT SCREEN LAYOUT) */}
          {activeTab === 'editor' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              
              {/* LEFT HALF: READ-ONLY COMPILED REFERENCE TIMELINE */}
              <div className="md:col-span-5 space-y-4">
                <div className="bg-gray-50 border border-gray-150 p-4 rounded-2xl h-full flex flex-col min-h-[400px]">
                  <div className="flex justify-between items-center pb-2.5 border-b border-gray-200 mb-4 shrink-0">
                    <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-wider flex items-center gap-1.5 font-sans">
                      <BookOpen size={12} />
                      Referensi Kompilasi
                    </h3>
                    <span className="text-[10px] bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded font-black font-sans">
                      {midtermDrafts[selectedStudentId]?.compiledWeeklySources?.length || 0} Minggu
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-3.5 max-h-[500px] pr-1">
                    {!midtermDrafts[selectedStudentId]?.compiledWeeklySources || midtermDrafts[selectedStudentId].compiledWeeklySources.length === 0 ? (
                      <div className="h-full flex flex-col justify-center items-center text-center p-4 text-gray-400 text-xs italic font-sans space-y-3">
                        <AlertCircle size={20} className="text-gray-300" />
                        <p>Belum ada referensi kompilasi yang disimpan.</p>
                        <button
                          onClick={() => setActiveTab('kompilasi')}
                          className="text-xs text-[#109E58] hover:underline font-bold cursor-pointer font-sans"
                        >
                          Klik ke Tab 1 untuk Kompilasi
                        </button>
                      </div>
                    ) : (
                      midtermDrafts[selectedStudentId].compiledWeeklySources.map((source, idx) => (
                        <div key={idx} className="bg-white border border-gray-150 rounded-xl p-3.5 shadow-sm space-y-2">
                          <div className="flex justify-between items-center text-[9px] text-gray-400 font-extrabold font-sans">
                            <span>{source.startDate} - {source.endDate}</span>
                            {source.theme && <span className="text-gray-600 truncate max-w-[120px]">Tema: {source.theme}</span>}
                          </div>
                          <p className="text-xs text-gray-750 font-serif leading-relaxed whitespace-pre-wrap leading-tight">
                            {source.generalComments || <span className="text-gray-400 italic font-sans text-[10px]">Tanpa narasi komentar.</span>}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* RIGHT HALF: PRIMARY TEXT AREA RICH EDITOR WORKSPACE */}
              <div className="md:col-span-7 space-y-4">
                <div className="bg-white border border-gray-150 p-5 rounded-2xl shadow-sm space-y-4">
                  
                  <div className="flex justify-between items-center pb-2.5 border-b border-gray-100 flex-wrap gap-2">
                    <div className="space-y-0.5">
                      <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider font-sans">General Comments Midterm</h3>
                      <div className="flex items-center gap-1.5">
                        <span className={cn("inline-block w-2 h-2 rounded-full", currentStudentStatus.dotColor)} />
                        <span className="text-[10px] text-gray-500 font-bold font-sans">Status: {currentStudentStatus.label}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isLockedForEditing ? (
                        <span className="flex items-center gap-1 text-[10px] bg-amber-50 text-amber-700 font-black border border-amber-200 rounded px-2 py-0.5 font-sans">
                          <ShieldAlert size={10} />
                          Draf Dikunci
                        </span>
                      ) : (
                        <button
                          onClick={handleRefineWithAI}
                          disabled={isRefining || !localComment.trim()}
                          className="flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[10px] px-2.5 py-1.5 rounded-lg border border-indigo-150 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isRefining ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                          Rapikan dengan AI
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="relative">
                    <textarea
                      value={localComment}
                      onChange={(e) => handleCommentChange(e.target.value)}
                      disabled={isLockedForEditing || isSavingDraft}
                      placeholder={isLockedForEditing ? "Komentar dikunci karena sudah diajukan untuk review." : "Masukkan ringkasan komentar tengah semester di sini..."}
                      className={cn(
                        "w-full min-h-[300px] border border-gray-200 rounded-xl p-4 text-xs font-serif leading-relaxed outline-none focus:border-[#109E58] focus:ring-1 focus:ring-[#109E58]/35 focus:ring-offset-0 transition-all resize-y whitespace-pre-wrap text-gray-800 bg-white",
                        isLockedForEditing && "bg-gray-50 text-gray-500 border-gray-100 cursor-not-allowed"
                      )}
                    />
                    
                    {/* Character Counts */}
                    <div className="absolute bottom-2.5 right-3 text-[10px] text-gray-450 font-black font-sans tracking-wide">
                      {localComment.length} Karakter
                    </div>
                  </div>

                  {/* Save Draft & Submit Review controls */}
                  <div className="flex justify-between items-center pt-2.5 border-t border-gray-100 gap-3">
                    <div className="text-[10px] text-gray-400 font-bold font-sans">
                      {hasUnsavedChanges && !isLockedForEditing && (
                        <span className="text-amber-600 flex items-center gap-1">
                          <AlertCircle size={10} />
                          Belum disimpan
                        </span>
                      )}
                      {!hasUnsavedChanges && !isLockedForEditing && (
                        <span className="text-gray-400 flex items-center gap-1">
                          <Check size={10} />
                          Teks tersimpan
                        </span>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveDraft}
                        disabled={isSavingDraft || isLockedForEditing || !hasUnsavedChanges}
                        className="flex items-center gap-1.5 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-extrabold text-xs px-4 py-2.5 rounded-xl cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Save size={12} />
                        Simpan Draft
                      </button>
                      <button
                        onClick={handleSubmitForReview}
                        disabled={isSavingDraft || isLockedForEditing || !localComment.trim()}
                        className="flex items-center gap-1.5 bg-[#109E58] hover:bg-emerald-700 text-white font-extrabold text-xs px-4.5 py-2.5 rounded-xl cursor-pointer transition-all shadow-md shadow-[#109E58]/10 disabled:opacity-45 disabled:cursor-not-allowed"
                      >
                        <Send size={12} />
                        Ajukan Review
                      </button>
                    </div>
                  </div>

                </div>
              </div>

            </div>
          )}

          {/* TAB 3: PUBLISH PDF CONTENT */}
          {activeTab === 'publish' && (
            <div className="space-y-6 lg:col-span-9">
              {/* Action and Control Dashboard */}
              <div className="bg-white p-6 rounded-3xl border border-gray-150 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-3 border-b border-gray-100">
                  <div>
                    <h2 className="text-sm font-black text-gray-900 font-sans uppercase tracking-tight">
                      Publish Workspace: {selectedStudentObj?.name || 'Pilih Siswa'}
                    </h2>
                    <p className="text-[11px] text-gray-400 font-medium">
                      Status Laporan: <span className="font-extrabold text-emerald-700">{currentStudentStatus.label}</span>
                    </p>
                  </div>
                  
                  {publishedReportObj && (
                    <div className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-xl border border-blue-150 text-[10px] font-black uppercase tracking-wider">
                      <Check size={12} /> Terbit (v{publishedReportObj.version || 1})
                    </div>
                  )}
                </div>

                {/* Status-specific action buttons */}
                <div className="flex flex-wrap gap-2.5">
                  {/* Case 1: Already published */}
                  {publishedReportObj ? (
                    <>
                      <a
                        href={publishedReportObj.driveFileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl flex items-center gap-1.5 shadow-md shadow-blue-600/10 cursor-pointer"
                      >
                        <Eye size={14} /> Buka PDF di Google Drive
                      </a>
                      
                      {isAuthorizer && (
                        <button
                          onClick={handlePublishMidterm}
                          disabled={isPublishing}
                          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl flex items-center gap-1.5 shadow-md cursor-pointer"
                        >
                          <RefreshCw size={14} className={isPublishing ? "animate-spin" : ""} />
                          {isPublishing ? "Menerbitkan Ulang..." : "Terbitkan Ulang (vUbah)"}
                        </button>
                      )}
                    </>
                  ) : (
                    /* Case 2: Not yet published */
                    <>
                      {activeDraft ? (
                        <>
                          {/* If status is READY_FOR_REVIEW */}
                          {activeDraft.status === 'READY_FOR_REVIEW' && (
                            <>
                              {isAuthorizer ? (
                                <>
                                  {profile?.email === activeDraft.createdBy ? (
                                    <div className="text-xs text-amber-700 bg-amber-50 px-3 py-2.5 rounded-xl border border-amber-150 font-semibold flex items-center gap-1.5">
                                      <Clock size={14} /> Anda adalah pembuat draf ini. Sesuai aturan, Anda tidak dapat menyetujui draf buatan sendiri.
                                    </div>
                                  ) : (
                                    <>
                                      <button
                                        onClick={handleApproveDraft}
                                        className="bg-[#109E58] hover:bg-[#0e8a4d] text-white font-extrabold text-xs px-4.5 py-2.5 rounded-xl flex items-center gap-1.5 shadow-md shadow-emerald-600/10 cursor-pointer"
                                      >
                                        <CheckCircle2 size={14} />
                                        <span>Setujui Draf (APPROVED)</span>
                                      </button>

                                      <button
                                        onClick={handleRejectDraft}
                                        className="border border-gray-250 hover:bg-gray-50 text-gray-700 font-extrabold text-xs px-4 py-2.5 rounded-xl flex items-center gap-1.5 cursor-pointer"
                                      >
                                        <Edit3 size={14} /> Kembalikan untuk Revisi
                                      </button>
                                    </>
                                  )}
                                </>
                              ) : (
                                <div className="text-xs text-amber-700 bg-amber-50 px-3 py-2.5 rounded-xl border border-amber-150 font-semibold flex items-center gap-1.5">
                                  <Clock size={14} /> Menunggu Peninjauan Kepala TK / Admin (Status: READY_FOR_REVIEW)
                                </div>
                              )}
                            </>
                          )}

                          {/* If status is APPROVED */}
                          {activeDraft.status === 'APPROVED' && (
                            <>
                              <button
                                onClick={handlePublishMidterm}
                                disabled={isPublishing}
                                className="bg-[#109E58] hover:bg-[#0e8a4d] disabled:opacity-50 text-white font-extrabold text-xs px-4.5 py-2.5 rounded-xl flex items-center gap-1.5 shadow-md shadow-emerald-600/10 cursor-pointer"
                              >
                                {isPublishing ? (
                                  <>
                                    <Loader2 size={14} className="animate-spin" />
                                    <span>{publishStatus || "Menerbitkan..."}</span>
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 size={14} />
                                    <span>Terbitkan PDF</span>
                                  </>
                                )}
                              </button>

                              {isAuthorizer && (
                                <button
                                  onClick={handleRejectDraft}
                                  className="border border-gray-250 hover:bg-gray-50 text-gray-700 font-extrabold text-xs px-4 py-2.5 rounded-xl flex items-center gap-1.5 cursor-pointer"
                                >
                                  <Edit3 size={14} /> Kembalikan ke DRAFT
                                </button>
                              )}
                            </>
                          )}

                          {/* If status is DRAFT */}
                          {activeDraft.status === 'DRAFT' && (
                            <div className="text-xs text-amber-700 bg-amber-50 px-3 py-2.5 rounded-xl border border-amber-150 font-semibold flex items-center gap-1.5">
                              Draf sedang dikerjakan oleh guru. Silakan selesaikan di tab "Buat GenCom Midterm" lalu klik "Ajukan Review ke Admin".
                            </div>
                          )}

                          {/* Allow switching back to Editor if not published */}
                          {activeDraft.status !== 'PUBLISHED' && (
                            <button
                              onClick={() => confirmNavigation('tab', 'editor')}
                              className="border border-gray-200 hover:bg-gray-50 text-gray-600 font-extrabold text-xs px-4 py-2.5 rounded-xl flex items-center gap-1.5 cursor-pointer ml-auto"
                            >
                              <Edit3 size={14} /> Edit Narasi & Komentar
                            </button>
                          )}
                        </>
                      ) : (
                        <div className="text-xs text-gray-400 italic py-1">
                          Guru harus menyelesaikan kompilasi dan komentar terlebih dahulu sebelum melakukan peninjauan.
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Preview Document Paper Shell */}
              <div className="space-y-2">
                <div className="flex justify-between items-center px-2 text-gray-500 text-[10px] font-black uppercase tracking-wider font-sans">
                  <span>Pratinjau Dokumen Cetak (Ukuran A4)</span>
                  {isSignatureLoading && <span className="text-emerald-600 animate-pulse">Memuat Tanda Tangan...</span>}
                </div>

                {activeDraft ? (
                  <div className="overflow-x-auto bg-gray-100 p-4 md:p-8 rounded-[2rem] border border-gray-200 shadow-inner flex justify-center">
                    {/* PAGE 1 — DOKUMENTASI & EVALUASI MIDTERM */}
                    <div className="bg-white px-8 py-6 md:px-12 md:py-8 shadow-md border border-gray-200 text-gray-950 mx-auto w-full max-w-[794px] min-[794px]:w-[794px] min-[794px]:h-[1123px] min-[794px]:min-h-[1123px] font-sans flex flex-col justify-between print:border-none print:shadow-none print:p-0 print:m-0" id="midterm-report-page-1">
                      
                      <div className="space-y-4">
                        {/* School branding banner */}
                        <div className="bg-[#109E58] py-4 px-5 text-white relative flex flex-col justify-between rounded-sm">
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-white/20 pb-3 mb-3 gap-3">
                            <div className="flex items-center gap-3">
                              <div className="bg-white/10 p-2 rounded-lg shrink-0">
                                <svg className="w-8 h-8 text-white" viewBox="0 0 100 100" fill="currentColor">
                                  <path d="M50 10 C42 35 25 45 10 50 C25 55 42 65 50 90 C58 65 75 55 90 50 C75 45 58 35 50 10 Z" />
                                  <path d="M50 25 C45 40 35 48 25 50 C35 52 45 60 50 75 C55 60 65 52 75 50 C65 48 55 40 50 25 Z" fill="#109E58" />
                                </svg>
                              </div>
                              <div className="text-left leading-none">
                                <span className="block font-sans text-base font-black tracking-widest text-white m-0">Lazuardi</span>
                                <span className="block font-sans text-[10px] font-bold tracking-[0.25em] text-emerald-100 m-0 uppercase leading-none mt-0.5">KINDERGARTEN</span>
                                <span className="block font-sans text-[7px] text-emerald-200 mt-0.5 uppercase tracking-wider leading-none font-semibold">Global Compassionate School</span>
                              </div>
                            </div>

                            <div className="text-right sm:text-right w-full sm:w-auto flex flex-col items-end justify-center">
                              <span className="block text-[10px] font-sans font-black tracking-widest text-emerald-100 uppercase mb-1">
                                LAZUARDI GCS KINDERGARTEN
                              </span>
                              <h1 className="text-lg font-sans font-black tracking-wider text-white uppercase leading-none mt-1">
                                STUDENT'S MIDTERM REPORT
                              </h1>
                            </div>
                          </div>

                          {/* Student Metadata Grid */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1.5 gap-x-12 text-[10px] font-sans">
                            <div className="space-y-1">
                              <div className="grid grid-cols-12 leading-none">
                                <span className="col-span-4 font-bold text-emerald-100">Student's name</span>
                                <span className="col-span-1 text-emerald-100/70 text-center">:</span>
                                <span className="col-span-7 font-extrabold text-white text-[11px] -mt-0.5">{selectedStudentObj?.name}</span>
                              </div>
                              <div className="grid grid-cols-12 leading-none">
                                <span className="col-span-4 font-bold text-emerald-100">Class</span>
                                <span className="col-span-1 text-emerald-100/70 text-center">:</span>
                                <span className="col-span-7 font-bold text-white">
                                  {activeClassObj?.name || 'Class'}
                                </span>
                              </div>
                            </div>

                            <div className="space-y-1 sm:pl-8">
                              <div className="grid grid-cols-12 leading-none">
                                <span className="col-span-4 font-bold text-emerald-100">Semester</span>
                                <span className="col-span-1 text-emerald-100/70 text-center">:</span>
                                <span className="col-span-7 font-bold text-white">{semester} ({activeYear || '2026/2027'})</span>
                              </div>
                              <div className="grid grid-cols-12 leading-none">
                                <span className="col-span-4 font-bold text-emerald-100">Date Range</span>
                                <span className="col-span-1 text-emerald-100/70 text-center">:</span>
                                <span className="col-span-7 font-bold text-white">{formattedPeriodRangeIndo}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Narrative Area */}
                        <div className="space-y-2 pt-2">
                          <h3 className="text-xs font-black text-emerald-800 uppercase tracking-widest border-b border-dashed border-emerald-600 pb-1 text-center font-sans">
                            MIDTERM GENERAL EVALUATION
                          </h3>
                          <div className="bg-emerald-50/10 border border-emerald-100/30 p-4 rounded-xl min-h-[180px] flex flex-col justify-between">
                            <p className="text-[11px] text-gray-800 font-serif leading-relaxed whitespace-pre-wrap">
                              {activeDraft?.midtermGeneralComment || "Komentar evaluasi tengah semester belum dimasukkan."}
                            </p>
                          </div>
                        </div>

                        {/* Attendance Recap */}
                        <div className="space-y-2 pt-2">
                          <h3 className="text-xs font-black text-emerald-800 uppercase tracking-widest border-b border-dashed border-emerald-600 pb-1 text-center font-sans">
                            ATTENDANCE RECAP
                          </h3>
                          <div className="grid grid-cols-5 gap-3 pt-1">
                            {/* Present */}
                            <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-2.5 text-center space-y-0.5">
                              <span className="text-[9px] font-bold text-emerald-700 uppercase tracking-wider block font-sans">Hadir</span>
                              <span className="text-sm font-black text-emerald-900 block font-sans">{computedAttendance.present}</span>
                              <span className="text-[8px] text-gray-400 block font-sans">Hari</span>
                            </div>
                            {/* Sick */}
                            <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-2.5 text-center space-y-0.5">
                              <span className="text-[9px] font-bold text-amber-700 uppercase tracking-wider block font-sans">Sakit</span>
                              <span className="text-sm font-black text-amber-900 block font-sans">{computedAttendance.sick}</span>
                              <span className="text-[8px] text-gray-400 block font-sans">Hari</span>
                            </div>
                            {/* Izin */}
                            <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-2.5 text-center space-y-0.5">
                              <span className="text-[9px] font-bold text-blue-700 uppercase tracking-wider block font-sans">Izin</span>
                              <span className="text-sm font-black text-blue-900 block font-sans">{computedAttendance.izin}</span>
                              <span className="text-[8px] text-gray-400 block font-sans">Hari</span>
                            </div>
                            {/* Absent without notice */}
                            <div className="bg-red-50/50 border border-red-100 rounded-xl p-2.5 text-center space-y-0.5">
                              <span className="text-[9px] font-bold text-red-700 uppercase tracking-wider block font-sans">Tanpa Keterangan</span>
                              <span className="text-sm font-black text-red-900 block font-sans">{computedAttendance.noNews}</span>
                              <span className="text-[8px] text-gray-400 block font-sans">Hari</span>
                            </div>
                            {/* Total */}
                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-center space-y-0.5">
                              <span className="text-[9px] font-bold text-gray-700 uppercase tracking-wider block font-sans">Total</span>
                              <span className="text-sm font-black text-gray-900 block font-sans">{computedAttendance.total}</span>
                              <span className="text-[8px] text-gray-400 block font-sans">Hari</span>
                            </div>
                          </div>
                        </div>

                        {/* Weekly Themes Timeline */}
                        <div className="space-y-2 pt-2">
                          <h3 className="text-xs font-black text-emerald-800 uppercase tracking-widest border-b border-dashed border-emerald-600 pb-1 text-center font-sans">
                            COMPILED WEEKLY THEMES & TOPICS
                          </h3>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                            {(!activeDraft?.compiledWeeklySources || activeDraft.compiledWeeklySources.length === 0) ? (
                              <div className="col-span-2 text-center text-[10px] text-gray-400 italic py-2 font-sans">
                                Belum ada mingguan yang dikompilasi ke dalam draf ini.
                              </div>
                            ) : (
                              activeDraft.compiledWeeklySources.slice(0, 4).map((source, idx) => (
                                <div key={idx} className="bg-gray-50/50 border border-gray-150 rounded-xl p-2.5 space-y-1">
                                  <div className="flex justify-between items-center text-[8px] text-emerald-800 font-extrabold uppercase tracking-wider font-sans">
                                    <span>Minggu {idx + 1} ({source.startDate})</span>
                                    {source.theme && <span className="text-gray-500 font-black truncate max-w-[120px]">Tema: {source.theme}</span>}
                                  </div>
                                  <p className="text-[9.5px] text-gray-600 font-serif leading-tight line-clamp-3">
                                    {source.generalComments || "Tanpa komentar mingguan."}
                                  </p>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Signatures Area */}
                      <div className="grid grid-cols-2 gap-8 pt-6 border-t border-dashed border-gray-200 text-center shrink-0">
                        {/* Homeroom Teacher */}
                        <div className="flex flex-col items-center justify-between h-[90px]">
                          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider leading-none font-sans">Class Homeroom Teacher</span>
                          <div className="h-10 flex items-center justify-center">
                            {resolvedSignatureUrl ? (
                              <img 
                                src={resolvedSignatureUrl} 
                                alt="Signature" 
                                className="h-10 w-auto object-contain"
                                referrerPolicy="no-referrer"
                                crossOrigin="anonymous"
                              />
                            ) : (
                              <div className="text-[9px] text-gray-300 italic font-sans">Belum bertanda tangan</div>
                            )}
                          </div>
                          <span className="text-[10px] font-extrabold text-gray-800 leading-none underline font-sans">
                            {resolvedTeacherName || "Nama Guru Kelas"}
                          </span>
                        </div>

                        {/* Principal */}
                        <div className="flex flex-col items-center justify-between h-[90px]">
                          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider leading-none font-sans">
                            {kindySignatory?.principalTitle || 'Principal'}
                          </span>
                          <div className="h-10 flex items-center justify-center">
                            {kindySignatory?.principalSignatureUrl ? (
                              <img 
                                src={kindySignatory.principalSignatureUrl} 
                                alt="Signature" 
                                className="h-10 w-auto object-contain"
                                referrerPolicy="no-referrer"
                                crossOrigin="anonymous"
                              />
                            ) : (
                              <div className="text-[9px] text-gray-300 italic font-sans">Belum bertanda tangan</div>
                            )}
                          </div>
                          <span className="text-[10px] font-extrabold text-gray-800 leading-none underline font-sans">
                            {kindySignatory?.principalName || "Nama Kepala Unit"}
                          </span>
                        </div>
                      </div>

                    </div>
                  </div>
                ) : (
                  <div className="bg-white p-12 border border-gray-150 rounded-3xl shadow-sm text-center">
                    <p className="text-xs text-gray-400 italic font-medium font-sans">
                      Silakan pilih siswa di daftar kiri yang memiliki draf Midterm Report untuk melihat pratinjau dokumen.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

      </div>

      {/* CONFIRMATION MODALS & DIALOG BACKDROPS */}
      <AnimatePresence>
        
        {/* Unsaved changes confirmation dialog */}
        {pendingSelection && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPendingSelection(null)}
              className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm cursor-pointer"
            />
            <div className="flex min-h-screen items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative w-full max-w-md bg-white rounded-3xl p-6 shadow-xl border border-gray-150 font-sans space-y-5"
              >
                <div className="flex items-start gap-3 text-amber-600">
                  <AlertCircle size={24} className="shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h3 className="text-sm font-black text-gray-900">
                      {pendingSelection.type === 'dates' ? 'Ubah Rentang Tanggal' : 'Perubahan Belum Disimpan'}
                    </h3>
                    <p className="text-xs text-gray-500 font-medium leading-relaxed whitespace-pre-line">
                      {pendingSelection.type === 'dates' ? (
                        `Mengubah rentang tanggal akan membuat konteks Draft Midterm yang berbeda.
Draft untuk rentang sebelumnya tidak akan dihapus.`
                      ) : (
                        'Komentar Midterm siswa ini telah diubah tetapi belum disimpan. Apakah Anda yakin ingin membuang perubahan ini dan berpindah?'
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex justify-end gap-2.5 pt-2.5">
                  <button
                    onClick={() => setPendingSelection(null)}
                    className="border border-gray-200 hover:bg-gray-50 text-gray-700 font-extrabold text-xs px-4 py-2.5 rounded-xl cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    onClick={() => executeNavigation(pendingSelection.type, pendingSelection.targetValue)}
                    className="bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs px-4.5 py-2.5 rounded-xl cursor-pointer shadow-md shadow-red-600/10"
                  >
                    {pendingSelection.type === 'dates' ? 'Tetap Ubah Rentang' : 'Ya, Buang Perubahan'}
                  </button>
                </div>
              </motion.div>
            </div>
          </div>
        )}

        {/* Recompile confirmation dialog */}
        {recompileConfirm && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setRecompileConfirm(null)}
              className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm cursor-pointer"
            />
            <div className="flex min-h-screen items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative w-full max-w-md bg-white rounded-3xl p-6 shadow-xl border border-gray-150 font-sans space-y-5"
              >
                <div className="flex items-start gap-3 text-indigo-600">
                  <HelpCircle size={24} className="shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h3 className="text-sm font-black text-gray-900">Perbarui Referensi Mingguan?</h3>
                    <p className="text-xs text-gray-500 font-medium leading-relaxed">
                      Anda sudah memiliki snapshot referensi mingguan yang dikompilasi sebelumnya. Memperbarui kompilasi akan mengganti referensi lama dengan data terbaru.
                    </p>
                  </div>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 text-xs font-bold text-gray-700 space-y-2">
                  <div className="flex justify-between items-center">
                    <span>Jumlah Sumber Lama:</span>
                    <span className="text-red-600 font-black">{recompileConfirm.oldSourcesCount} Minggu</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Jumlah Sumber Baru:</span>
                    <span className="text-emerald-600 font-black">{recompileConfirm.newSourcesCount} Minggu</span>
                  </div>
                  <div className="text-[10px] text-gray-400 font-extrabold border-t border-gray-200 pt-1.5 uppercase tracking-wide">
                    ⚠️ Komentar Midterm manual tidak akan diubah
                  </div>
                </div>

                <div className="flex justify-end gap-2.5">
                  <button
                    onClick={() => setRecompileConfirm(null)}
                    className="border border-gray-200 hover:bg-gray-50 text-gray-700 font-extrabold text-xs px-4 py-2.5 rounded-xl cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    onClick={() => executeCompilation(recompileConfirm.newSources)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs px-4.5 py-2.5 rounded-xl cursor-pointer shadow-md shadow-indigo-600/10"
                  >
                    Ya, Perbarui
                  </button>
                </div>
              </motion.div>
            </div>
          </div>
        )}

        {/* AI Refinement modal review */}
        {refineReview && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setRefineReview(null)}
              className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm cursor-pointer"
            />
            <div className="flex min-h-screen items-center justify-center p-4 sm:p-6 md:p-8">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative w-full max-w-2xl bg-white rounded-3xl overflow-hidden shadow-2xl border border-gray-150 flex flex-col max-h-[90vh]"
              >
                {/* Header */}
                <div className="bg-gradient-to-r from-indigo-600 to-violet-700 p-5 text-white flex justify-between items-center shrink-0">
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-black tracking-tight font-sans">Review Hasil AI - {refineReview.studentName}</h3>
                    <p className="text-[11px] text-indigo-100 font-medium font-sans">Silakan periksa perbandingan teks sebelum menerapkan saran perbaikan AI.</p>
                  </div>
                  <button 
                    onClick={() => setRefineReview(null)}
                    className="p-1.5 rounded-full hover:bg-white/15 transition-all text-white bg-white/5 cursor-pointer font-extrabold text-xs"
                  >
                    ✕
                  </button>
                </div>

                {/* Scrollable Content comparison view */}
                <div className="p-6 overflow-y-auto space-y-4 flex-1">
                  
                  {/* Original Comments */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block font-sans">Komentar Asli Anda:</span>
                    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 text-xs text-gray-700 font-serif leading-relaxed italic whitespace-pre-wrap">
                      "{refineReview.originalText}"
                    </div>
                  </div>

                  {/* Arrow separator indicator */}
                  <div className="flex justify-center">
                    <div className="bg-indigo-50 text-indigo-600 p-1.5 rounded-full border border-indigo-100">
                      <ArrowRight size={14} className="rotate-90 md:rotate-0" />
                    </div>
                  </div>

                  {/* AI Refined Teks */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider block font-sans">Hasil Rapian AI (Lumina):</span>
                    <div className="bg-indigo-50/35 border border-indigo-150 rounded-2xl p-4 text-xs text-gray-800 font-serif leading-relaxed whitespace-pre-wrap">
                      {refineReview.refinedText}
                    </div>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 p-3 rounded-2xl text-[10px] text-amber-900 leading-relaxed font-sans font-medium">
                    ⚠️ <b>Penting:</b> AI hanya memperbaiki tata bahasa, ejaan, tanda baca, dan susunan kalimat agar lebih profesional tanpa mengubah atau menambahkan fakta observasi baru dari Anda.
                  </div>

                </div>

                {/* Footer buttons */}
                <div className="bg-gray-50 p-4 border-t border-gray-150 flex gap-2 justify-end items-center shrink-0">
                  <button
                    type="button"
                    onClick={() => setRefineReview(null)}
                    className="border border-gray-250 hover:bg-gray-100 text-gray-650 font-extrabold text-[10px] py-2 px-3.5 rounded-xl cursor-pointer transition-all font-sans"
                  >
                    Pertahankan Teks Asli
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLocalComment(refineReview.refinedText);
                      setHasUnsavedChanges(true);
                      setRefineReview(null);
                      toast.success("Hasil AI berhasil diterapkan! Pastikan Anda menyimpan atau mengajukan draft setelah selesai.");
                    }}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-[10px] py-2 px-4 rounded-xl cursor-pointer transition-all shadow-md font-sans"
                  >
                    Gunakan Hasil AI
                  </button>
                </div>

              </motion.div>
            </div>
          </div>
        )}

      </AnimatePresence>

    </div>
  );
}
