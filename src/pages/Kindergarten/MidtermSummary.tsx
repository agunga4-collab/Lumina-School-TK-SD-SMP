import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, Loader2, Save, Smile, Meh, Frown, Angry, AlertCircle, CheckCircle2,
  Calendar, Edit3, BookOpen, Clock, Heart, ShieldAlert, ArrowRight, Eye, RefreshCw, 
  ChevronDown, ChevronUp, Check, Trash2, ClipboardList, ChevronLeft, ChevronRight,
  FileSpreadsheet, Send, FileText, HelpCircle, CheckSquare, XSquare, History
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
import { collection, query, where, getDocs, doc, setDoc, getDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
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

  heightCm?: number | null;
  weightKg?: number | null;
  physicalDataUpdatedAt?: any;
  physicalDataUpdatedBy?: string | null;

  learningGoals?: {
    nilaiAgamaBudiPekerti: string;
    jatiDiri: string;
    dasarLiterasiSteam: string;
  };

  status: 'DRAFT' | 'READY_FOR_REVIEW' | 'PERLU_REVISI' | 'APPROVED' | 'PUBLISHED';

  reviewNote?: string;

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

interface MidtermSummaryHistoryLog {
  id?: string;
  studentId: string;
  classId: string;
  academicYear: string;
  semester: number;
  periodKey: string;
  version: number;
  action: 'CREATED' | 'EDITED' | 'SUBMITTED_FOR_REVIEW' | 'RETURNED_FOR_REVISION' | 'APPROVED' | 'PUBLISHED';
  narrativeBefore: string;
  narrativeAfter: string;
  actorEmail: string;
  actorName: string;
  actorRole: string;
  timestamp: number;
  reviewNote?: string;
}

export default function MidtermSummary() {
  // --- A. ROUTER, AUTH, AND CONTEXT HOOKS ---
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const paramClassId = searchParams.get('classId');
  const paramDate = searchParams.get('date');

  const { activeYear } = useAcademicYear();
  const { currentUser } = useOutletContext<{ currentUser: any }>() || {};
  const { profile, getGoogleDriveToken } = useAuth();

  // Custom class assignment hook
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

  // --- B. STATE HOOKS (useState) ---
  const [selectedClassId, setSelectedClassId] = React.useState<string>('');
  const [students, setStudents] = React.useState<any[]>(() => DEFAULT_STUDENTS);
  const [selectedStudentId, setSelectedStudentId] = React.useState<string>('');
  const [semester, setSemester] = React.useState<number>(1);
  const [activeTab, setActiveTab] = React.useState<'kompilasi' | 'editor' | 'review' | 'publish'>('kompilasi');
  const [midtermDrafts, setMidtermDrafts] = React.useState<Record<string, MidtermSummaryDraft>>({});

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

  const [publishedReports, setPublishedReports] = React.useState<Record<string, any>>({});
  const [isFetchingPublished, setIsFetchingPublished] = React.useState(false);
  const [isPublishing, setIsPublishing] = React.useState(false);
  const [publishStatus, setPublishStatus] = React.useState("");
  
  const [resolvedSignatureUrl, setResolvedSignatureUrl] = React.useState<string | null>(null);
  const [resolvedTeacherName, setResolvedTeacherName] = React.useState<string | null>(null);
  const [resolvedTeacherNiy, setResolvedTeacherNiy] = React.useState<string>('-');
  const [isSignatureLoading, setIsSignatureLoading] = React.useState<boolean>(false);
  const [resolvedLogoUrl, setResolvedLogoUrl] = React.useState<string | null>(null);

  const [realAttendanceList, setRealAttendanceList] = React.useState<any[]>([]);
  const [isFetchingRealAttendance, setIsFetchingRealAttendance] = React.useState(false);

  const [shouldMoveSignaturesToPage3, setShouldMoveSignaturesToPage3] = React.useState(false);

  const [kindySignatory, setKindySignatory] = React.useState<{
    principalName: string;
    principalTitle: string;
    principalSignatureUrl: string | null;
    principalNiy: string;
  } | null>(null);

  const [reviewNotes, setReviewNotes] = React.useState<Record<string, string>>({});
  const [selectedAuditStudent, setSelectedAuditStudent] = React.useState<any | null>(null);
  const [auditLogs, setAuditLogs] = React.useState<any[]>([]);
  const [isFetchingAuditLogs, setIsFetchingAuditLogs] = React.useState(false);

  const [classLearningGoals, setClassLearningGoals] = React.useState<any | null>(null);
  const [isFetchingClassGoals, setIsFetchingClassGoals] = React.useState(false);
  const [isSavingClassGoals, setIsSavingClassGoals] = React.useState(false);

  const [classGoalsInput, setClassGoalsInput] = React.useState<{
    nilaiAgamaBudiPekerti: string;
    jatiDiri: string;
    dasarLiterasiSteam: string;
    signingDate: string;
  }>({
    nilaiAgamaBudiPekerti: '',
    jatiDiri: '',
    dasarLiterasiSteam: '',
    signingDate: ''
  });

  const [classGoalsStatus, setClassGoalsStatus] = React.useState<'DRAFT' | 'READY'>('DRAFT');
  const [hasUnsavedClassGoals, setHasUnsavedClassGoals] = React.useState(false);

  const [isFetchingWeeklySources, setIsFetchingWeeklySources] = React.useState(false);
  const [weeklySources, setWeeklySources] = React.useState<any[]>([]);

  const [isFetchingDrafts, setIsFetchingDrafts] = React.useState(false);
  const [isSavingDraft, setIsSavingDraft] = React.useState(false);

  const [localComment, setLocalComment] = React.useState<string>('');
  const [localHeight, setLocalHeight] = React.useState<string>('');
  const [localWeight, setLocalWeight] = React.useState<string>('');
  const [isSavingPhysicalData, setIsSavingPhysicalData] = React.useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false);

  const [pendingSelection, setPendingSelection] = React.useState<{
    type: 'student' | 'class' | 'tab' | 'semester' | 'dates';
    targetValue: string;
  } | null>(null);

  const [recompileConfirm, setRecompileConfirm] = React.useState<{
    oldSourcesCount: number;
    newSourcesCount: number;
    newSources: CompiledWeeklySource[];
  } | null>(null);

  const [isRefining, setIsRefining] = React.useState(false);
  const [refineReview, setRefineReview] = React.useState<{
    studentId: string;
    studentName: string;
    originalText: string;
    refinedText: string;
  } | null>(null);

  // --- C. UTILITIES AND MEMOIZED/DERIVED VARIABLES (useMemo) ---
  const toTitleCase = React.useCallback((str: string | undefined | null): string => {
    if (!str) return '';
    return str
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }, []);

  const isStudentInClass = React.useCallback((studClassId: string, activeClass: { id: string; name: string }) => {
    const sClass = (studClassId || '').trim().toLowerCase();
    const actId = (activeClass.id || '').trim().toLowerCase();
    const actName = (activeClass.name || '').trim().toLowerCase();
    
    if (!sClass) return false;
    if (sClass === actId || sClass === actName) return true;
    
    const norm = (str: string) => str.replace(/[\s\-_]+/g, '').toLowerCase();
    const normS = norm(sClass);
    const normId = norm(actId);
    const normName = norm(actName);
    
    if (normS === normName || normS === normId) return true;
    
    // Check for specific sub-classes
    const hasKoala = (str: string) => str.includes('koala');
    const hasPanda = (str: string) => str.includes('panda');
    const hasCaterpillar = (str: string) => str.includes('caterpillar');
    const hasButterfly = (str: string) => str.includes('butterfly');
    const hasCenderawasih = (str: string) => str.includes('cenderawasih');
    const hasElang = (str: string) => str.includes('elang');
    const hasKakatua = (str: string) => str.includes('kakatua');
    const hasBadak = (str: string) => str.includes('badak');
    const hasKomodo = (str: string) => str.includes('komodo');
    const hasTapir = (str: string) => str.includes('tapir');
    const hasBaluran = (str: string) => str.includes('baluran');
    const hasBunaken = (str: string) => str.includes('bunaken');
    
    if (hasKoala(normS) && hasKoala(normName)) return true;
    if (hasPanda(normS) && hasPanda(normName)) return true;
    if (hasCaterpillar(normS) && hasCaterpillar(normName)) return true;
    if (hasButterfly(normS) && hasButterfly(normName)) return true;
    if (hasCenderawasih(normS) && hasCenderawasih(normName)) return true;
    if (hasElang(normS) && hasElang(normName)) return true;
    if (hasKakatua(normS) && hasKakatua(normName)) return true;
    if (hasBadak(normS) && hasBadak(normName)) return true;
    if (hasKomodo(normS) && hasKomodo(normName)) return true;
    if (hasTapir(normS) && hasTapir(normName)) return true;
    if (hasBaluran(normS) && hasBaluran(normName)) return true;
    if (hasBunaken(normS) && hasBunaken(normName)) return true;

    // Prevent generic "tka" from loosely matching specific sub-classes
    const specificClassWords = [
      'koala', 'panda', 'caterpillar', 'butterfly',
      'cenderawasih', 'elang', 'kakatua', 'badak', 'komodo', 'tapir',
      'baluran', 'bunaken'
    ];
    const hasSpecS = specificClassWords.some(w => normS.includes(w));
    const hasSpecAct = specificClassWords.some(w => normId.includes(w) || normName.includes(w));
    
    if (hasSpecAct && !hasSpecS) {
      return false; // student is general, but active class is specific
    }
    
    if (normId.includes(normS) || normS.includes(normId)) return true;
    
    return false;
  }, []);

  const activeDraft = React.useMemo(() => {
    return midtermDrafts[selectedStudentId] || null;
  }, [midtermDrafts, selectedStudentId]);

  const activeClassObj = React.useMemo(() => {
    return classes.find(c => c.id === selectedClassId);
  }, [classes, selectedClassId]);

  const classStudents = React.useMemo(() => {
    if (!selectedClassId || !activeClassObj) return [];
    return students.filter(student => isStudentInClass(student.classId, activeClassObj));
  }, [students, selectedClassId, activeClassObj, isStudentInClass]);

  const selectedStudentObj = React.useMemo(() => {
    return classStudents.find(s => s.id === selectedStudentId);
  }, [classStudents, selectedStudentId]);

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

  const formattedSigningDate = React.useMemo(() => {
    const rawDate = classGoalsInput.signingDate || classLearningGoals?.signingDate;
    if (!rawDate) return '....................';
    try {
      const parts = rawDate.split('-');
      if (parts.length !== 3) return '....................';
      const year = Number(parts[0]);
      const month = Number(parts[1]);
      const day = Number(parts[2]);
      if (isNaN(year) || isNaN(month) || isNaN(day)) return '....................';
      
      const monthsIndo = [
        'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
      ];
      return `${day} ${monthsIndo[month - 1]} ${year}`;
    } catch (err) {
      return '....................';
    }
  }, [classGoalsInput.signingDate, classLearningGoals?.signingDate]);

  const extractedLearningGoals = React.useMemo(() => {
    const agamaGoals = new Set<string>();
    const jatiDiriGoals = new Set<string>();
    const literasiSteamGoals = new Set<string>();

    weeklySources.forEach(src => {
      if (src.weeklyObservationItems && Array.isArray(src.weeklyObservationItems)) {
        src.weeklyObservationItems.forEach((item: any) => {
          const objectiveText = item.objective || item.notes || '';
          if (!objectiveText || objectiveText.trim() === '') return;

          const domain = (item.domain || '').trim().toLowerCase();
          
          if (domain.includes('agama') || domain.includes('budi pekerti') || domain === 'agama_budi_pekerti') {
            agamaGoals.add(objectiveText.trim());
          } else if (
            domain.includes('sosial') || 
            domain.includes('emosional') || 
            domain.includes('jati diri') || 
            domain.includes('motorik') || 
            domain.includes('fisik') ||
            domain === 'sosial_emosional' ||
            domain === 'fisik_motorik'
          ) {
            jatiDiriGoals.add(objectiveText.trim());
          } else {
            // Bahasa, Kognitif, Seni, STEAM
            literasiSteamGoals.add(objectiveText.trim());
          }
        });
      }
    });

    return {
      agama: Array.from(agamaGoals),
      jatiDiri: Array.from(jatiDiriGoals),
      literasiSteam: Array.from(literasiSteamGoals)
    };
  }, [weeklySources]);

  // Normalized Academic Year String
  const normalizedYear = React.useMemo(() => {
    return (activeYear || '2026/2027').replace(/\//g, '-');
  }, [activeYear]);

  // --- D. ACTION HANDLERS AND HELPER CALLBACKS (useCallback / Functions) ---
  const handleStartDateChange = (val: string) => {
    setStartDateStr(val);
    sessionStorage.setItem('kindy_midterm_start', val);
  };

  const handleEndDateChange = (val: string) => {
    setEndDateStr(val);
    sessionStorage.setItem('kindy_midterm_end', val);
  };

  // Calculate Deterministic Midterm Draft Doc ID
  const getMidtermDraftId = React.useCallback((studId: string) => {
    if (!studId) return '';
    const periodKey = `${startDateStr}_${endDateStr}`;
    return `${studId}_${normalizedYear}_S${semester}_MIDTERM_${periodKey}`;
  }, [normalizedYear, semester, startDateStr, endDateStr]);

  // Calculate Deterministic Class Learning Goals Doc ID
  const getClassGoalsDocId = React.useCallback(() => {
    if (!selectedClassId) return '';
    const periodKey = `${startDateStr}_${endDateStr}`;
    return `${selectedClassId}_${normalizedYear}_S${semester}_${periodKey}`;
  }, [selectedClassId, normalizedYear, semester, startDateStr, endDateStr]);

  const fetchClassLearningGoals = React.useCallback(async () => {
    const docId = getClassGoalsDocId();
    if (!docId) {
      setClassLearningGoals(null);
      setClassGoalsInput({
        nilaiAgamaBudiPekerti: '',
        jatiDiri: '',
        dasarLiterasiSteam: '',
        signingDate: ''
      });
      setClassGoalsStatus('DRAFT');
      setHasUnsavedClassGoals(false);
      return;
    }
    setIsFetchingClassGoals(true);
    try {
      const docRef = doc(db, 'kindy_midterm_class_learning_goals', docId);
      const snap = await getDoc(docRef);
      logFirestoreRead('attendanceReports', 1);
      if (snap.exists()) {
        const data = snap.data();
        setClassLearningGoals(data);
        setClassGoalsInput({
          nilaiAgamaBudiPekerti: data.nilaiAgamaBudiPekerti || '',
          jatiDiri: data.jatiDiri || '',
          dasarLiterasiSteam: data.dasarLiterasiSteam || '',
          signingDate: data.signingDate || ''
        });
        setClassGoalsStatus(data.status || 'DRAFT');
      } else {
        setClassLearningGoals(null);
        setClassGoalsInput({
          nilaiAgamaBudiPekerti: '',
          jatiDiri: '',
          dasarLiterasiSteam: '',
          signingDate: ''
        });
        setClassGoalsStatus('DRAFT');
      }
      setHasUnsavedClassGoals(false);
    } catch (err) {
      console.error('Error fetching class learning goals:', err);
    } finally {
      setIsFetchingClassGoals(false);
    }
  }, [getClassGoalsDocId]);

  const handleSaveClassLearningGoals = async () => {
    const docId = getClassGoalsDocId();
    if (!docId || !selectedClassId || !activeClassObj) {
      toast.error('Kelas atau rentang tanggal belum valid.');
      return;
    }

    const isAllGoalsFilled = 
      classGoalsInput.nilaiAgamaBudiPekerti.trim().length > 0 &&
      classGoalsInput.jatiDiri.trim().length > 0 &&
      classGoalsInput.dasarLiterasiSteam.trim().length > 0;

    const finalStatus = isAllGoalsFilled ? 'READY' : 'DRAFT';

    const payload = {
      classId: selectedClassId,
      academicYear: activeYear || '2026/2027',
      semester,
      midtermPeriodKey: `${startDateStr}_${endDateStr}`,
      nilaiAgamaBudiPekerti: classGoalsInput.nilaiAgamaBudiPekerti,
      jatiDiri: classGoalsInput.jatiDiri,
      dasarLiterasiSteam: classGoalsInput.dasarLiterasiSteam,
      signingDate: classGoalsInput.signingDate,
      status: finalStatus,
      updatedAt: Date.now(),
      updatedBy: profile?.email || 'System'
    } as any;

    if (!classLearningGoals) {
      payload.createdAt = Date.now();
      payload.createdBy = profile?.email || 'System';
    } else {
      payload.createdAt = classLearningGoals.createdAt || Date.now();
      payload.createdBy = classLearningGoals.createdBy || profile?.email || 'System';
    }

    setIsSavingClassGoals(true);
    const toastId = toast.loading('Menyimpan Learning Goals Kelas...');
    try {
      await setDoc(doc(db, 'kindy_midterm_class_learning_goals', docId), payload);
      setClassLearningGoals(payload);
      setClassGoalsStatus(finalStatus);
      setHasUnsavedClassGoals(false);
      toast.success('Learning Goals Kelas berhasil disimpan! ✨', { id: toastId });
    } catch (err) {
      console.error('Error saving class learning goals:', err);
      toast.error('Gagal menyimpan Learning Goals Kelas.', { id: toastId });
    } finally {
      setIsSavingClassGoals(false);
    }
  };

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
      const notesMap: Record<string, string> = {};
      snap.docs.forEach(docSnap => {
        const data = docSnap.data() as MidtermSummaryDraft;
        draftsMap[data.studentId] = {
          ...data,
          id: docSnap.id
        };
        notesMap[data.studentId] = data.reviewNote || '';
      });
      setMidtermDrafts(draftsMap);
      setReviewNotes(notesMap);

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

  const saveAuditHistory = async (
    studentId: string,
    action: 'CREATED' | 'EDITED' | 'SUBMITTED_FOR_REVIEW' | 'RETURNED_FOR_REVISION' | 'APPROVED' | 'PUBLISHED',
    narrativeBefore: string,
    narrativeAfter: string,
    note?: string
  ) => {
    try {
      const q = query(
        collection(db, 'midterm_summary_history'),
        where('studentId', '==', studentId),
        where('semester', '==', semester),
        where('periodKey', '==', `${startDateStr}_${endDateStr}`)
      );
      const snap = await getDocs(q);
      let maxVersion = 0;
      snap.docs.forEach(docSnap => {
        const v = docSnap.data().version || 0;
        if (v > maxVersion) maxVersion = v;
      });
      const nextVersion = maxVersion + 1;

      const historyPayload: MidtermSummaryHistoryLog = {
        studentId,
        classId: selectedClassId,
        academicYear: activeYear || '2026/2027',
        semester,
        periodKey: `${startDateStr}_${endDateStr}`,
        version: nextVersion,
        action,
        narrativeBefore,
        narrativeAfter,
        actorEmail: profile?.email || 'system',
        actorName: profile?.displayName || profile?.name || 'System User',
        actorRole: profile?.role || 'TEACHER',
        timestamp: Date.now(),
        reviewNote: note || ''
      };

      const docRef = doc(collection(db, 'midterm_summary_history'));
      await setDoc(docRef, historyPayload);
    } catch (err) {
      console.error('[MidtermSummary] Failed to save audit history:', err);
    }
  };

  const fetchAuditLogsForStudent = async (studentId: string) => {
    setIsFetchingAuditLogs(true);
    try {
      const q = query(
        collection(db, 'midterm_summary_history'),
        where('studentId', '==', studentId),
        where('semester', '==', semester),
        where('periodKey', '==', `${startDateStr}_${endDateStr}`)
      );
      const snap = await getDocs(q);
      const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Sort logs by version descending (most recent first)
      logs.sort((a: any, b: any) => b.version - a.version);
      setAuditLogs(logs);
    } catch (err) {
      console.error('[MidtermSummary] Error fetching audit logs:', err);
      toast.error('Gagal mengambil riwayat audit.');
    } finally {
      setIsFetchingAuditLogs(false);
    }
  };

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

  const checkHasUnsavedChanges = (
    comment: string
  ) => {
    const activeDraft = midtermDrafts[selectedStudentId];
    const originalComment = activeDraft?.midtermGeneralComment || '';

    const isChanged = comment !== originalComment;

    setHasUnsavedChanges(isChanged);
  };

  // Handle local comment input edits
  const handleCommentChange = (text: string) => {
    setLocalComment(text);
    checkHasUnsavedChanges(text);
  };

  // Handle class goals changes
  const handleClassGoalChange = (field: 'nilaiAgamaBudiPekerti' | 'jatiDiri' | 'dasarLiterasiSteam' | 'signingDate', value: string) => {
    const updated = { ...classGoalsInput, [field]: value };
    setClassGoalsInput(updated);
    setHasUnsavedClassGoals(true);
  };

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
    if (hasUnsavedChanges || hasUnsavedClassGoals) {
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
    setHasUnsavedClassGoals(false);
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

  // --- E. LIFECYCLE EFFECTS (useEffect) ---
  // Real Attendance fetch hook matching requested formula:
  // startDate = tanggal mulai Midterm
  // endDate = minimum(tanggal akhir Midterm, tanggal hari ini)
  React.useEffect(() => {
    if (!selectedClassId || !startDateStr || !endDateStr) return;
    
    async function fetchRealAttendanceData() {
      setIsFetchingRealAttendance(true);
      try {
        const todayStr = new Date().toISOString().split('T')[0];
        const minEndDateStr = endDateStr < todayStr ? endDateStr : todayStr;
        
        console.log(`[Attendance Sync] Querying attendance from ${startDateStr} to ${minEndDateStr}`);
        const q = query(
          collection(db, 'attendance'),
          where('classId', '==', selectedClassId),
          where('date', '>=', startDateStr),
          where('date', '<=', minEndDateStr)
        );
        
        const snap = await getDocs(q);
        logFirestoreRead('attendanceReports', snap.docs.length || 1);
        
        const docs = snap.docs.map(docSnap => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            date: data.date,
            students: data.students || []
          };
        });
        
        setRealAttendanceList(docs);
      } catch (err) {
        console.error('Error fetching real attendance:', err);
      } finally {
        setIsFetchingRealAttendance(false);
      }
    }
    
    fetchRealAttendanceData();
  }, [selectedClassId, startDateStr, endDateStr]);

  // Measuring comments height effect to decide whether to move signatures to Page 3
  React.useEffect(() => {
    const checkOverflow = () => {
      const el = document.getElementById('preview-comments-container');
      if (el) {
        // Natural comments text height check
        if (el.scrollHeight > 350) {
          setShouldMoveSignaturesToPage3(true);
        } else {
          setShouldMoveSignaturesToPage3(false);
        }
      }
    };
    
    // Check after slight delay to ensure fonts & content have fully rendered
    const timer = setTimeout(checkOverflow, 250);
    return () => clearTimeout(timer);
  }, [selectedStudentId, activeDraft?.midtermGeneralComment, activeTab]);

  React.useEffect(() => {
    const fetchLogo = async () => {
      try {
        const logoDoc = await getDoc(doc(db, 'settings', 'logos'));
        if (logoDoc.exists()) {
          const data = logoDoc.data() as any;
          if (data?.KINDERGARTEN?.reportHeaderLogo?.originalUrl) {
            setResolvedLogoUrl(data.KINDERGARTEN.reportHeaderLogo.originalUrl);
          } else if (data?.KINDERGARTEN?.rectangular) {
            setResolvedLogoUrl(data.KINDERGARTEN.rectangular);
          }
        } else {
          const localLogos = localStorage.getItem('lumina_school_logos');
          if (localLogos) {
            const parsed = JSON.parse(localLogos);
            if (parsed?.KINDERGARTEN?.reportHeaderLogo?.originalUrl) {
              setResolvedLogoUrl(parsed.KINDERGARTEN.reportHeaderLogo.originalUrl);
            } else if (parsed?.KINDERGARTEN?.rectangular) {
              setResolvedLogoUrl(parsed.KINDERGARTEN.rectangular);
            }
          }
        }
      } catch (err) {
        console.warn("Failed to fetch Kindergarten school logo in MidtermSummary:", err);
      }
    };
    fetchLogo();
  }, []);

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
        console.log('[MidtermSummary] Requesting cached Kindergarten students for year:', activeYear);
        const cached = await getKindergartenStudents(activeYear || '2026/2027');
        if (cached && cached.length > 0) {
          setStudents(cached);
          saveStoredStudents(cached);
        } else {
          const local = getStoredStudents();
          if (local && local.length > 0) {
            setStudents(local);
          }
        }
      } catch (err) {
        console.error('Error loading Kindergarten students:', err);
      }
    }
    loadKindergartenStudentsData();
  }, [activeYear]);

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

  React.useEffect(() => {
    fetchClassLearningGoals();
  }, [fetchClassLearningGoals]);

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
            principalSignatureUrl: data.principalSignatureUrl || null,
            principalNiy: data.principalNIY || data.principalNiy || '-'
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
          
          let resolvedName: string | null = null;
          let teacherNiyVal = '';

          const isEmail = (val?: string | null) => !!val && val.includes('@');

          if (data.homeroomTeacherName && !isEmail(data.homeroomTeacherName)) {
            resolvedName = data.homeroomTeacherName;
          }

          if (data.homeroomTeacherId) {
            try {
              const userSnap = await getDoc(doc(db, 'users', data.homeroomTeacherId));
              if (userSnap.exists()) {
                const uData = userSnap.data();
                teacherNiyVal = uData.niy || '';
              }
            } catch (e) {
              console.error("Error fetching teacher details from user doc:", e);
            }
          }

          setResolvedTeacherName(resolvedName || 'Homeroom Teacher');
          setResolvedTeacherNiy(teacherNiyVal || '-');
        } else if (active) {
          const fallbackClass = classes.find(c => c.id === studentCanonicalClassId) || activeClassObj;
          setResolvedSignatureUrl(fallbackClass?.teacherSignatureUrl || null);
          
          let resolvedName: string | null = null;
          const isEmail = (val?: string | null) => !!val && val.includes('@');

          if (fallbackClass?.homeroomTeacherName && !isEmail(fallbackClass.homeroomTeacherName)) {
            resolvedName = fallbackClass.homeroomTeacherName;
          }

          setResolvedTeacherName(resolvedName || 'Homeroom Teacher');
          setResolvedTeacherNiy(fallbackClass?.teacherNiy || fallbackClass?.homeroomTeacherNiy || '-');
        }
      } catch (err) {
        console.error("Error fetching class signature from Firestore:", err);
        if (active) {
          const fallbackClass = classes.find(c => c.id === studentCanonicalClassId) || activeClassObj;
          setResolvedSignatureUrl(fallbackClass?.teacherSignatureUrl || null);
          setResolvedTeacherName(fallbackClass?.homeroomTeacherName || null);
          setResolvedTeacherNiy(fallbackClass?.teacherNiy || fallbackClass?.homeroomTeacherNiy || '-');
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

  // Synchronize local editors when selectedStudentId or midtermDrafts changes
  React.useEffect(() => {
    if (selectedStudentId) {
      const activeDraft = midtermDrafts[selectedStudentId];
      setLocalComment(activeDraft?.midtermGeneralComment || '');
      setLocalHeight(activeDraft?.heightCm !== undefined && activeDraft?.heightCm !== null ? String(activeDraft.heightCm) : '');
      setLocalWeight(activeDraft?.weightKg !== undefined && activeDraft?.weightKg !== null ? String(activeDraft.weightKg) : '');
      setHasUnsavedChanges(false);
    } else {
      setLocalComment('');
      setLocalHeight('');
      setLocalWeight('');
      setHasUnsavedChanges(false);
    }
  }, [selectedStudentId, midtermDrafts]);

  // Load audit logs automatically when student or tab changes to review
  React.useEffect(() => {
    if (selectedStudentId && activeTab === 'review') {
      fetchAuditLogsForStudent(selectedStudentId);
    }
  }, [selectedStudentId, activeTab]);

  // Browser reload/navigation warning
  React.useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges || hasUnsavedClassGoals) {
        e.preventDefault();
        e.returnValue = 'Anda memiliki perubahan yang belum disimpan. Apakah Anda yakin ingin membuang perubahan ini?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges, hasUnsavedClassGoals]);

  React.useEffect(() => {
    fetchWeeklySourcesForStudent();
  }, [fetchWeeklySourcesForStudent]);

  // --- F. ROLE PROTECTION EARLY RETURN ---
  // (Safely positioned after all hook declarations to strictly prevent conditional hook issues)
  if (profile?.role === 'kindergarten_subject_teacher') {
    return (
      <div className="p-8 text-center max-w-2xl mx-auto my-12 bg-white rounded-3xl border border-gray-150 p-12">
        <h1 className="text-xl font-bold text-red-600 font-sans">Akses Ditolak</h1>
        <p className="text-gray-500 mt-2 font-sans">Anda tidak memiliki izin untuk membuka halaman Midterm Report ini.</p>
      </div>
    );
  }

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

      // Log in audit history
      await saveAuditHistory(
        selectedStudentId,
        activeDraft ? 'EDITED' : 'CREATED',
        activeDraft?.midtermGeneralComment || '',
        midtermComment,
        'Draf disimpan melalui kompilasi mingguan.'
      );

      toast.success('Kompilasi mingguan berhasil disimpan! Mengalihkan ke tab Editor...', { id: toastId });
      setActiveTab('editor');
    } catch (err) {
      console.error('[MidtermSummary] Error compiling:', err);
      toast.error('Gagal menyimpan kompilasi.', { id: toastId });
    } finally {
      setRecompileConfirm(null);
    }
  };

  // Save Draft Action (Status remains unchanged unless previously APPROVED, which resets to READY_FOR_REVIEW)
  const handleSaveDraft = async () => {
    if (!selectedStudentObj || !activeClassObj) return;
    setIsSavingDraft(true);
    
    const draftId = getMidtermDraftId(selectedStudentId);
    const activeDraft = midtermDrafts[selectedStudentId];
    const currentStatus = activeDraft?.status || 'DRAFT';
    let newStatus = currentStatus;
    const wasApproved = currentStatus === 'APPROVED';

    if (wasApproved) {
      newStatus = 'READY_FOR_REVIEW';
    }

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
      status: newStatus,
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

      // Log in audit history
      await saveAuditHistory(
        selectedStudentId,
        wasApproved ? 'SUBMITTED_FOR_REVIEW' : 'EDITED',
        activeDraft?.midtermGeneralComment || '',
        localComment,
        wasApproved ? 'Otomatis diajukan kembali karena narasi diubah setelah ACC.' : 'Draf disimpan oleh guru.'
      );

      setHasUnsavedChanges(false);
      if (wasApproved) {
        toast.warning('Narasi telah diubah setelah ACC dan otomatis diajukan kembali untuk review.', { id: toastId, duration: 6000 });
      } else {
        toast.success('Draf berhasil disimpan! ✨', { id: toastId });
      }
    } catch (err) {
      console.error('[MidtermSummary] Save error:', err);
      toast.error('Gagal menyimpan draf.', { id: toastId });
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Save Physical Data (Tinggi & Berat Badan)
  const handleSavePhysicalData = async () => {
    if (!selectedStudentId || !selectedStudentObj || !activeClassObj) {
      toast.error('Siswa atau Kelas belum dipilih.');
      return;
    }
    
    setIsSavingPhysicalData(true);
    const draftId = getMidtermDraftId(selectedStudentId);
    const activeDraft = midtermDrafts[selectedStudentId];

    const trimmedHeight = localHeight.trim();
    const trimmedWeight = localWeight.trim();

    const parsedHeight = trimmedHeight !== '' ? parseFloat(trimmedHeight) : null;
    const parsedWeight = trimmedWeight !== '' ? parseFloat(trimmedWeight) : null;

    if (trimmedHeight !== '' && isNaN(parsedHeight!)) {
      toast.error('Tinggi Badan harus berupa angka atau desimal.');
      setIsSavingPhysicalData(false);
      return;
    }
    if (trimmedWeight !== '' && isNaN(parsedWeight!)) {
      toast.error('Berat Badan harus berupa angka atau desimal.');
      setIsSavingPhysicalData(false);
      return;
    }

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
      
      heightCm: parsedHeight,
      weightKg: parsedWeight,
      physicalDataUpdatedAt: serverTimestamp(),
      physicalDataUpdatedBy: currentUser?.uid || profile?.uid || 'System',
      updatedAt: Date.now(),
      updatedBy: profile?.email || 'System'
    };

    if (!activeDraft) {
      payload.createdAt = Date.now();
      payload.createdBy = profile?.email || 'System';
      payload.midtermGeneralComment = '';
      payload.status = 'DRAFT';
      payload.compiledWeeklySources = [];
    }

    const toastId = toast.loading('Menyimpan Data Fisik Siswa...');
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

      toast.success('Data Fisik Siswa berhasil disimpan! ✨', { id: toastId });
    } catch (err) {
      console.error('[MidtermSummary] Save physical data error:', err);
      toast.error('Gagal menyimpan Data Fisik Siswa.', { id: toastId });
    } finally {
      setIsSavingPhysicalData(false);
    }
  };

  // Submit for Review Action (Status changes to READY_FOR_REVIEW)
  const handleSubmitForReview = async () => {
    if (!selectedStudentObj || !activeClassObj) return;
    
    const isAllGoalsFilled = 
      classGoalsInput.nilaiAgamaBudiPekerti.trim().length > 0 &&
      classGoalsInput.jatiDiri.trim().length > 0 &&
      classGoalsInput.dasarLiterasiSteam.trim().length > 0;

    if (!isAllGoalsFilled) {
      toast.error('Draf hanya dapat diajukan jika seluruh 3 Learning Goals Kelas telah terisi!');
      return;
    }

    if (!localComment.trim()) {
      toast.error('Draf hanya dapat diajukan jika General Comments siswa telah terisi.');
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

      // Log in audit history
      await saveAuditHistory(
        selectedStudentId,
        'SUBMITTED_FOR_REVIEW',
        activeDraft?.midtermGeneralComment || '',
        localComment,
        'Diajukan untuk review oleh guru.'
      );

      setHasUnsavedChanges(false);
      toast.success('Review berhasil diajukan! 🚀', { id: toastId });
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

      // 3. Render pages to Canvas & PDF
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      const pageIds = ["midterm-report-page-1", "midterm-report-page-2"];
      if (document.getElementById("midterm-report-page-3")) {
        pageIds.push("midterm-report-page-3");
      }

      let renderedAny = false;

      for (let i = 0; i < pageIds.length; i++) {
        const elId = pageIds[i];
        const el = document.getElementById(elId);
        if (!el) continue;

        if (renderedAny) {
          pdf.addPage();
        }
        renderedAny = true;

        const originalStyle = el.getAttribute('style') || '';

        el.style.width = '794px';
        el.style.height = '1123px';
        el.style.minWidth = '794px';
        el.style.minHeight = '1123px';
        el.style.maxWidth = '794px';
        el.style.maxHeight = '1123px';
        el.style.boxSizing = 'border-box';

        const canvas = await html2canvasWithModernColors(el, {
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

        el.setAttribute('style', originalStyle);

        const imgData = canvas.toDataURL('image/jpeg', 0.85);
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
      }

      if (!renderedAny) {
        toast.dismiss(toastId);
        toast.error("Elemen halaman laporan tidak ditemukan.");
        setIsPublishing(false);
        setPublishStatus("");
        return;
      }

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

      // Filename standard matching 'S1 - Zac Jaden Kotahatuhaha - Midterm Report.pdf'
      const filename = `S${semester} - ${selectedStudentObj?.name} - Midterm Report.pdf`;

      setPublishStatus("Menyiapkan folder Google Drive...");
      toast.loading("Menyiapkan folder Google Drive...", { id: toastId });

      const parentWeeklyFolderId = '1IBy2Ly_h72v3znKod3rXLLgx1IaeoGqO';

      // Helper function to find a folder by name inside a parent on Google Drive
      const findFolderOnDrive = async (tok: string, name: string, parentId: string): Promise<string | null> => {
        const escapedName = name.replace(/'/g, "\\'");
        const q = `name = '${escapedName}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
        const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name)`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${tok}` }
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Gagal mencari folder '${name}' di Google Drive: ${text}`);
        }
        const data = await res.json();
        if (data.files && data.files.length > 0) {
          return data.files[0].id;
        }
        return null;
      };

      // Helper function to create a folder on Google Drive
      const createFolderOnDrive = async (tok: string, name: string, parentId: string): Promise<string> => {
        const url = `https://www.googleapis.com/drive/v3/files?supportsAllDrives=true`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tok}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId]
          })
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Gagal membuat folder '${name}' di Google Drive: ${text}`);
        }
        const data = await res.json();
        return data.id;
      };

      // Resolve Midterm Reports parent folder and class folder
      let classMidtermFolderId = '';
      let midtermRootFolderId = '';
      const className = activeClassObj?.name || 'Class';

      // 1. Try to fetch from local Firestore cache first to satisfy "Identitas folder kelas harus disimpan berdasarkan classId"
      const folderMetaRef = doc(db, 'midterm_folders', selectedClassId);
      const folderMetaSnap = await getDoc(folderMetaRef);

      if (folderMetaSnap.exists()) {
        const metaData = folderMetaSnap.data();
        classMidtermFolderId = metaData.classMidtermFolderId || '';
        midtermRootFolderId = metaData.midtermRootFolderId || '';

        // Verify folder still exists on Drive
        if (classMidtermFolderId) {
          try {
            const checkRes = await fetch(`https://www.googleapis.com/drive/v3/files/${classMidtermFolderId}?supportsAllDrives=true`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (!checkRes.ok) {
              classMidtermFolderId = '';
              midtermRootFolderId = '';
            }
          } catch (err) {
            classMidtermFolderId = '';
            midtermRootFolderId = '';
          }
        }
      }

      // 2. Find-or-create folders on Google Drive if not loaded from cache
      if (!classMidtermFolderId) {
        setPublishStatus("Mencari folder utama Midterm Reports...");
        midtermRootFolderId = await findFolderOnDrive(token, 'Midterm Reports', parentWeeklyFolderId) || '';
        if (!midtermRootFolderId) {
          setPublishStatus("Membuat folder utama Midterm Reports...");
          midtermRootFolderId = await createFolderOnDrive(token, 'Midterm Reports', parentWeeklyFolderId);
        }

        setPublishStatus(`Mencari folder kelas ${className}...`);
        classMidtermFolderId = await findFolderOnDrive(token, className, midtermRootFolderId) || '';
        if (!classMidtermFolderId) {
          setPublishStatus(`Membuat folder kelas ${className}...`);
          classMidtermFolderId = await createFolderOnDrive(token, className, midtermRootFolderId);
        }

        // Save metadata to Firestore 'midterm_folders' collection
        await setDoc(folderMetaRef, {
          parentWeeklyFolderId,
          midtermRootFolderId,
          classId: selectedClassId,
          className: className,
          classMidtermFolderId,
          updatedAt: Date.now()
        }, { merge: true });
      }

      // 3. Search and delete any existing files with the exact same name inside the class midterm folder to prevent duplicate file entries on Google Drive
      try {
        setPublishStatus("Mengecek file lama...");
        const escapedFilename = filename.replace(/'/g, "\\'");
        const qSearch = `name = '${escapedFilename}' and '${classMidtermFolderId}' in parents and trashed = false`;
        const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(qSearch)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id)`;
        const searchRes = await fetch(searchUrl, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          if (searchData.files && searchData.files.length > 0) {
            setPublishStatus("Mengganti file lama di Google Drive...");
            for (const oldFile of searchData.files) {
              await fetch(`https://www.googleapis.com/drive/v3/files/${oldFile.id}?supportsAllDrives=true`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
              });
            }
          }
        }
      } catch (err) {
        console.warn("Error while searching/deleting old midterm report on Google Drive:", err);
      }

      setPublishStatus("Mengunggah ke Google Drive...");
      toast.loading("Mengunggah ke Google Drive...", { id: toastId });

      const boundary = 'foo_bar_boundary';
      const delimiter = `\r\n--${boundary}\r\n`;
      const close_delim = `\r\n--${boundary}--`;

      const metadata = {
        name: filename,
        mimeType: 'application/pdf',
        parents: [classMidtermFolderId],
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

      // 4. Grant read permissions to anyone on the newly created file so it is publicly accessible
      try {
        await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}/permissions?supportsAllDrives=true`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            role: 'reader',
            type: 'anyone'
          })
        });
      } catch (permErr) {
        console.warn("Failed to grant public permissions for the published PDF on Google Drive:", permErr);
      }

      setPublishStatus("Menyimpan publikasi...");
      toast.loading("Menyimpan publikasi...", { id: toastId });

      // Calculate versions
      const existingVersions = Object.values(publishedReports).filter((r: any) => {
        return r.studentId === selectedStudentId && r.semester === semester;
      });
      let maxVersion = 0;
      for (const r of (existingVersions as any[])) {
        const v = r.version || 1;
        if (v > maxVersion) {
          maxVersion = v;
        }
      }
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
        driveFolderId: classMidtermFolderId,
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
          learningGoals: {
            nilaiAgamaBudiPekerti: classGoalsInput.nilaiAgamaBudiPekerti || classLearningGoals?.nilaiAgamaBudiPekerti || '',
            jatiDiri: classGoalsInput.jatiDiri || classLearningGoals?.jatiDiri || '',
            dasarLiterasiSteam: classGoalsInput.dasarLiterasiSteam || classLearningGoals?.dasarLiterasiSteam || ''
          },
          signatories: {
            principal: {
              name: toTitleCase(kindySignatory?.principalName || ''),
              title: kindySignatory?.principalTitle || 'Principal',
              signatureUrl: kindySignatory?.principalSignatureUrl || null
            },
            classTeacher: {
              name: toTitleCase(resolvedTeacherName || ''),
              title: 'Class Teacher',
              signatureUrl: resolvedSignatureUrl || null
            }
          },
          attendanceSummary: getAttendance(),
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

      // Log in audit history
      await saveAuditHistory(
        selectedStudentId,
        'PUBLISHED',
        activeDraft.midtermGeneralComment || '',
        activeDraft.midtermGeneralComment || '',
        `Laporan Midterm dipublikasikan (v${nextVersion}).`
      );

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

  const handleApproveStudentDraft = async (studentId: string, note: string) => {
    const activeDraft = midtermDrafts[studentId];
    if (!activeDraft) {
      toast.error("Draft Midterm belum dibuat untuk siswa ini.");
      return;
    }

    if (!isAuthorizer) {
      toast.error("Hanya Kepala TK atau Super Admin yang dapat menyetujui draf.");
      return;
    }

    if (profile?.email === activeDraft.createdBy) {
      toast.error("Guru yang membuat draf ini tidak dapat menyetujui draf miliknya sendiri.");
      return;
    }

    const studObj = classStudents.find(s => s.id === studentId);

    if (!window.confirm(`Apakah Anda yakin ingin menyetujui (ACC) draf Midterm Report untuk ${studObj?.name || 'siswa ini'}?`)) {
      return;
    }

    const draftId = getMidtermDraftId(studentId);
    const toastId = toast.loading("Menyetujui draf...");
    try {
      await setDoc(doc(db, 'midterm_summary_drafts', draftId), { 
        status: 'APPROVED',
        approvedAt: Date.now(),
        approvedBy: profile?.email || 'System',
        reviewNote: note || ''
      }, { merge: true });
      
      setMidtermDrafts(prev => ({
        ...prev,
        [studentId]: {
          ...prev[studentId],
          status: 'APPROVED',
          approvedAt: Date.now(),
          approvedBy: profile?.email || 'System',
          reviewNote: note || ''
        } as MidtermSummaryDraft
      }));

      // Log in audit history
      await saveAuditHistory(
        studentId,
        'APPROVED',
        activeDraft.midtermGeneralComment || '',
        activeDraft.midtermGeneralComment || '',
        note || 'Disetujui oleh reviewer.'
      );

      toast.success("Draf berhasil disetujui! Status kini APPROVED.", { id: toastId });
    } catch (err: any) {
      console.error("Error approving draft:", err);
      toast.error(`Gagal menyetujui draf: ${err.message}`, { id: toastId });
    }
  };

  const handleRejectStudentDraft = async (studentId: string, note: string) => {
    const activeDraft = midtermDrafts[studentId];
    if (!activeDraft) {
      toast.error("Draft Midterm belum dibuat untuk siswa ini.");
      return;
    }

    if (!isAuthorizer) {
      toast.error("Hanya Kepala TK atau Super Admin yang dapat menolak draf.");
      return;
    }

    if (!note.trim()) {
      toast.error("Wajib menyertakan Catatan Proofreading sebelum mengembalikan untuk revisi.");
      return;
    }

    const studObj = classStudents.find(s => s.id === studentId);

    if (!window.confirm(`Apakah Anda yakin ingin mengembalikan draf ${studObj?.name || 'siswa ini'} untuk revisi?`)) {
      return;
    }

    const draftId = getMidtermDraftId(studentId);
    const toastId = toast.loading("Mengembalikan draf...");
    try {
      await setDoc(doc(db, 'midterm_summary_drafts', draftId), { 
        status: 'PERLU_REVISI',
        reviewNote: note
      }, { merge: true });
      
      setMidtermDrafts(prev => ({
        ...prev,
        [studentId]: {
          ...prev[studentId],
          status: 'PERLU_REVISI',
          reviewNote: note
        } as MidtermSummaryDraft
      }));

      // Log in audit history
      await saveAuditHistory(
        studentId,
        'RETURNED_FOR_REVISION',
        activeDraft.midtermGeneralComment || '',
        activeDraft.midtermGeneralComment || '',
        note
      );

      toast.success("Draf berhasil dikembalikan dengan status PERLU_REVISI.", { id: toastId });
    } catch (err: any) {
      console.error("Error returning draft:", err);
      toast.error(`Gagal mengembalikan draf: ${err.message}`, { id: toastId });
    }
  };

  const handleRejectDraft = async () => {
    if (!selectedStudentId) return;
    const note = window.prompt("Wajib menyertakan Catatan Proofreading sebelum mengembalikan untuk revisi:") || "";
    if (!note.trim()) {
      toast.error("Catatan revisi tidak boleh kosong.");
      return;
    }
    await handleRejectStudentDraft(selectedStudentId, note);
  };

  const handleApproveDraft = async () => {
    if (!selectedStudentId) return;
    await handleApproveStudentDraft(selectedStudentId, "");
  };

  // Helper to determine student roster dot status color
  const getStudentStatusBadge = (studId: string) => {
    const published = publishedReports[studId];
    if (published) {
      return {
        label: 'Published',
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
        label: 'Published',
        dotColor: 'bg-blue-500',
        textColor: 'text-blue-700 bg-blue-50 border-blue-150'
      };
    }
    if (draft.status === 'APPROVED') {
      return {
        label: 'ACC',
        dotColor: 'bg-purple-500',
        textColor: 'text-purple-700 bg-purple-50 border-purple-150'
      };
    }
    if (draft.status === 'READY_FOR_REVIEW') {
      return {
        label: 'Menunggu Review',
        dotColor: 'bg-emerald-500 animate-pulse',
        textColor: 'text-emerald-700 bg-emerald-50 border-emerald-150'
      };
    }
    if (draft.status === 'PERLU_REVISI') {
      return {
        label: 'Perlu Revisi',
        dotColor: 'bg-rose-500',
        textColor: 'text-rose-700 bg-rose-50 border-rose-150'
      };
    }
    return {
      label: 'Draft',
      dotColor: 'bg-amber-500',
      textColor: 'text-amber-700 bg-amber-50 border-amber-150'
    };
  };

  const getCompilationStatus = (studId: string) => {
    const draft = midtermDrafts[studId];
    if (!draft || !draft.compiledWeeklySources || draft.compiledWeeklySources.length === 0) {
      return {
        label: 'Belum ada kompilasi',
        color: 'text-amber-700 bg-amber-50/70 border-amber-200'
      };
    }
    return {
      label: 'Kompilasi Tersedia',
      color: 'text-emerald-700 bg-emerald-50/70 border-emerald-200'
    };
  };

  const currentStudentStatus = getStudentStatusBadge(selectedStudentId);
  const isLockedForEditing = (
    midtermDrafts[selectedStudentId]?.status === 'PUBLISHED' || 
    !!publishedReports[selectedStudentId]
  ) && profile?.role !== 'SUPER_ADMIN' && profile?.role !== 'HEAD_UNIT' && profile?.role !== 'kindergarten_head';

  const publishedReportObj = publishedReports[selectedStudentId];

  const computedAttendance = React.useMemo(() => {
    const summary = {
      present: 0,
      sick: 0,
      izin: 0,
      noNews: 0,
      total: 0
    };
    
    if (!selectedStudentId || realAttendanceList.length === 0) return summary;
    
    realAttendanceList.forEach(doc => {
      const studentRecord = doc.students?.find((s: any) => s.studentId === selectedStudentId);
      if (studentRecord) {
        const status = (studentRecord.status || '').toLowerCase();
        const emotion = (studentRecord.emotion || '').toLowerCase();
        
        if (status === 'sakit' || emotion === 'sick') {
          summary.sick++;
        } else if (status === 'izin' || emotion === 'izin') {
          summary.izin++;
        } else if (
          status === 'tanpa_kabar' || 
          status === 'alpha' || 
          status === 'tanpa keterangan' || 
          emotion === 'nonews' || 
          status === 'no_news' ||
          status === 'no news'
        ) {
          summary.noNews++;
        } else {
          summary.present++;
        }
      }
    });
    
    summary.total = summary.sick + summary.izin + summary.noNews;
    return summary;
  }, [selectedStudentId, realAttendanceList]);

  // Getters for PDF rendering
  const getAgamaGoalText = () => {
    if (publishedReportObj?.reportSnapshot?.learningGoals?.nilaiAgamaBudiPekerti !== undefined) {
      return publishedReportObj.reportSnapshot.learningGoals.nilaiAgamaBudiPekerti;
    }
    return classGoalsInput.nilaiAgamaBudiPekerti || classLearningGoals?.nilaiAgamaBudiPekerti || '';
  };

  const getJatiDiriGoalText = () => {
    if (publishedReportObj?.reportSnapshot?.learningGoals?.jatiDiri !== undefined) {
      return publishedReportObj.reportSnapshot.learningGoals.jatiDiri;
    }
    return classGoalsInput.jatiDiri || classLearningGoals?.jatiDiri || '';
  };

  const getSteamGoalText = () => {
    if (publishedReportObj?.reportSnapshot?.learningGoals?.dasarLiterasiSteam !== undefined) {
      return publishedReportObj.reportSnapshot.learningGoals.dasarLiterasiSteam;
    }
    return classGoalsInput.dasarLiterasiSteam || classLearningGoals?.dasarLiterasiSteam || '';
  };

  const getGeneralCommentText = () => {
    if (publishedReportObj?.reportSnapshot?.midtermGeneralComment !== undefined) {
      return publishedReportObj.reportSnapshot.midtermGeneralComment;
    }
    return activeDraft?.midtermGeneralComment || '';
  };

  const getAttendance = () => {
    return computedAttendance;
  };

  const isAuthorizer = profile?.role === 'SUPER_ADMIN' || profile?.role === 'HEAD_UNIT' || profile?.role === 'kindergarten_head';

  const isValidHomeroomSignature = !!(resolvedSignatureUrl && 
    resolvedSignatureUrl !== "none" && 
    resolvedSignatureUrl !== "null" && 
    resolvedSignatureUrl !== "" &&
    (resolvedSignatureUrl.startsWith("data:") || resolvedSignatureUrl.startsWith("http://") || resolvedSignatureUrl.startsWith("https://") || resolvedSignatureUrl.startsWith("/")));

  const isValidPrincipalSignature = !!(kindySignatory?.principalSignatureUrl && 
    kindySignatory.principalSignatureUrl !== "none" && 
    kindySignatory.principalSignatureUrl !== "null" && 
    kindySignatory.principalSignatureUrl !== "" &&
    (kindySignatory.principalSignatureUrl.startsWith("data:") || kindySignatory.principalSignatureUrl.startsWith("http://") || kindySignatory.principalSignatureUrl.startsWith("https://") || kindySignatory.principalSignatureUrl.startsWith("/")));

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

      {/* PANEL LEARNING GOALS KELAS */}
      <div className="bg-white p-6 rounded-[2rem] border border-gray-150 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-3 border-b border-gray-100 gap-3">
          <div className="space-y-0.5">
            <h2 className="text-sm font-black text-gray-900 font-sans uppercase tracking-tight flex items-center gap-2">
              <BookOpen size={16} className="text-[#109E58]" />
              Learning Goals Kelas: {activeClassObj?.name || 'Pilih Kelas'}
            </h2>
            <p className="text-[11px] text-gray-500 font-medium">
              Target pembelajaran tengah semester yang berlaku untuk seluruh siswa di kelas ini.
            </p>
          </div>
          
          <div className="flex items-center gap-3 shrink-0">
            {hasUnsavedClassGoals && (
              <span className="flex items-center gap-1 text-[10px] bg-amber-50 text-amber-700 font-bold border border-amber-200 rounded-lg px-2 py-1 font-sans animate-pulse">
                <AlertCircle size={10} />
                Belum Disimpan
              </span>
            )}
            {!hasUnsavedClassGoals && classLearningGoals && (
              <span className="flex items-center gap-1 text-[10px] bg-emerald-50 text-[#109E58] font-bold border border-emerald-200 rounded-lg px-2 py-1 font-sans">
                <Check size={10} />
                Tersimpan ({classGoalsStatus})
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* LEFT COLUMN: WEEKLY GOALS REFERENCE */}
          <div className="lg:col-span-4 bg-gray-50 border border-gray-150 p-4 rounded-2xl flex flex-col max-h-[350px] overflow-y-auto">
            <div className="flex items-center gap-1.5 pb-2 border-b border-gray-200 mb-3">
              <ClipboardList size={12} className="text-gray-500" />
              <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-wider font-sans">
                Referensi Target Mingguan Kelas
              </h3>
            </div>
            
            <div className="space-y-4 pr-1">
              {/* Category 1: Agama */}
              <div className="space-y-2">
                <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider block bg-emerald-50 px-2 py-1 rounded">
                  Nilai Agama & Budi Pekerti
                </span>
                {extractedLearningGoals.agama.length === 0 ? (
                  <p className="text-[11px] text-gray-400 italic pl-2 font-sans">Tidak ada target mingguan.</p>
                ) : (
                  <div className="space-y-1.5 pl-1">
                    {extractedLearningGoals.agama.map((goal, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          const currentText = classGoalsInput.nilaiAgamaBudiPekerti;
                          const separator = currentText ? '\n' : '';
                          handleClassGoalChange('nilaiAgamaBudiPekerti', currentText + separator + goal);
                        }}
                        className="w-full text-left bg-white hover:bg-emerald-50/40 border border-gray-150 rounded-lg p-2 text-xs text-gray-750 leading-relaxed transition-all cursor-pointer flex items-start gap-1.5 font-sans"
                        title="Klik untuk menyalin"
                      >
                        <span className="text-emerald-500 font-bold shrink-0">+</span>
                        <span className="flex-1">{goal}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Category 2: Jati Diri */}
              <div className="space-y-2">
                <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider block bg-emerald-50 px-2 py-1 rounded">
                  Jati Diri
                </span>
                {extractedLearningGoals.jatiDiri.length === 0 ? (
                  <p className="text-[11px] text-gray-400 italic pl-2 font-sans">Tidak ada target mingguan.</p>
                ) : (
                  <div className="space-y-1.5 pl-1">
                    {extractedLearningGoals.jatiDiri.map((goal, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          const currentText = classGoalsInput.jatiDiri;
                          const separator = currentText ? '\n' : '';
                          handleClassGoalChange('jatiDiri', currentText + separator + goal);
                        }}
                        className="w-full text-left bg-white hover:bg-emerald-50/40 border border-gray-150 rounded-lg p-2 text-xs text-gray-750 leading-relaxed transition-all cursor-pointer flex items-start gap-1.5 font-sans"
                        title="Klik untuk menyalin"
                      >
                        <span className="text-emerald-500 font-bold shrink-0">+</span>
                        <span className="flex-1">{goal}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Category 3: Literasi & STEAM */}
              <div className="space-y-2">
                <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider block bg-emerald-50 px-2 py-1 rounded">
                  Dasar-dasar Literasi & STEAM
                </span>
                {extractedLearningGoals.literasiSteam.length === 0 ? (
                  <p className="text-[11px] text-gray-400 italic pl-2 font-sans">Tidak ada target mingguan.</p>
                ) : (
                  <div className="space-y-1.5 pl-1">
                    {extractedLearningGoals.literasiSteam.map((goal, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          const currentText = classGoalsInput.dasarLiterasiSteam;
                          const separator = currentText ? '\n' : '';
                          handleClassGoalChange('dasarLiterasiSteam', currentText + separator + goal);
                        }}
                        className="w-full text-left bg-white hover:bg-emerald-50/40 border border-gray-150 rounded-lg p-2 text-xs text-gray-750 leading-relaxed transition-all cursor-pointer flex items-start gap-1.5 font-sans"
                        title="Klik untuk menyalin"
                      >
                        <span className="text-emerald-500 font-bold shrink-0">+</span>
                        <span className="flex-1">{goal}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: THREE TEXT AREAS AND BUTTON */}
          <div className="lg:col-span-8 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Nilai Agama & Budi Pekerti */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-emerald-800 uppercase tracking-wider block font-sans">
                  Nilai Agama & Budi Pekerti
                </label>
                <textarea
                  value={classGoalsInput.nilaiAgamaBudiPekerti}
                  onChange={(e) => handleClassGoalChange('nilaiAgamaBudiPekerti', e.target.value)}
                  disabled={isSavingClassGoals}
                  placeholder="Tulis target pembelajaran Nilai Agama & Budi Pekerti..."
                  className="w-full min-h-[140px] border border-gray-200 rounded-xl p-3 text-xs font-serif leading-relaxed outline-none focus:border-[#109E58] focus:ring-1 focus:ring-[#109E58]/35 focus:ring-offset-0 transition-all resize-y text-gray-800 bg-white"
                />
              </div>

              {/* Jati Diri */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-emerald-800 uppercase tracking-wider block font-sans">
                  Jati Diri
                </label>
                <textarea
                  value={classGoalsInput.jatiDiri}
                  onChange={(e) => handleClassGoalChange('jatiDiri', e.target.value)}
                  disabled={isSavingClassGoals}
                  placeholder="Tulis target pembelajaran Jati Diri..."
                  className="w-full min-h-[140px] border border-gray-200 rounded-xl p-3 text-xs font-serif leading-relaxed outline-none focus:border-[#109E58] focus:ring-1 focus:ring-[#109E58]/35 focus:ring-offset-0 transition-all resize-y text-gray-800 bg-white"
                />
              </div>

              {/* Dasar-dasar Literasi & STEAM */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-emerald-800 uppercase tracking-wider block font-sans">
                  Dasar-dasar Literasi & STEAM
                </label>
                <textarea
                  value={classGoalsInput.dasarLiterasiSteam}
                  onChange={(e) => handleClassGoalChange('dasarLiterasiSteam', e.target.value)}
                  disabled={isSavingClassGoals}
                  placeholder="Tulis target pembelajaran Dasar-dasar Literasi & STEAM..."
                  className="w-full min-h-[140px] border border-gray-200 rounded-xl p-3 text-xs font-serif leading-relaxed outline-none focus:border-[#109E58] focus:ring-1 focus:ring-[#109E58]/35 focus:ring-offset-0 transition-all resize-y text-gray-800 bg-white"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1.5 max-w-xs w-full">
                <label className="text-[10px] font-black text-[#109E58] uppercase tracking-wider block font-sans">
                  Tanggal Penandatanganan Rapor
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 font-bold font-sans">Depok,</span>
                  <input
                    type="date"
                    value={classGoalsInput.signingDate || ''}
                    onChange={(e) => handleClassGoalChange('signingDate', e.target.value)}
                    disabled={isSavingClassGoals}
                    className="flex-1 bg-white border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-bold outline-none text-gray-700 cursor-pointer focus:border-[#109E58] focus:ring-1 focus:ring-[#109E58]/35 focus:ring-offset-0 transition-all"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => handleSaveClassLearningGoals()}
                  disabled={isSavingClassGoals || !hasUnsavedClassGoals}
                  className="flex items-center gap-1.5 bg-[#109E58] hover:bg-emerald-700 disabled:opacity-40 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl cursor-pointer transition-all shadow-md shadow-[#109E58]/10 disabled:cursor-not-allowed"
                >
                  {isSavingClassGoals ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  Simpan Learning Goals & Tanggal
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* INTERNAL WORKFLOW TAB NAVIGATION */}
      <div className="flex border-b border-gray-250 shrink-0 gap-1.5 overflow-x-auto">
        <button
          onClick={() => confirmNavigation('tab', 'kompilasi')}
          className={cn(
            "px-5 py-3 text-xs font-black transition-all cursor-pointer border-b-2 -mb-[2px] tracking-tight whitespace-nowrap",
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
            "px-5 py-3 text-xs font-black transition-all cursor-pointer border-b-2 -mb-[2px] tracking-tight whitespace-nowrap",
            activeTab === 'editor'
              ? "border-[#109E58] text-[#109E58]"
              : "border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-200"
          )}
        >
          2. Buat & Edit GenCom
        </button>
        <button
          onClick={() => confirmNavigation('tab', 'review')}
          className={cn(
            "px-5 py-3 text-xs font-black transition-all cursor-pointer border-b-2 -mb-[2px] tracking-tight whitespace-nowrap",
            activeTab === 'review'
              ? "border-[#109E58] text-[#109E58]"
              : "border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-200"
          )}
        >
          3. Review & ACC GenCom
        </button>
        <button
          onClick={() => confirmNavigation('tab', 'publish')}
          className={cn(
            "px-5 py-3 text-xs font-black transition-all cursor-pointer border-b-2 -mb-[2px] tracking-tight flex items-center gap-1.5 whitespace-nowrap",
            activeTab === 'publish'
              ? "border-[#109E58] text-[#109E58]"
              : "border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-200"
          )}
        >
          4. Publish PDF
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
                        <p className="text-[10px] text-gray-400 font-medium flex items-center gap-1.5">
                          <span>No. Absen: {stud.attendanceNumber || stud.noAbsen || '-'}</span>
                        </p>
                        <div className="pt-0.5">
                          <span className={cn("px-1.5 py-0.5 rounded text-[8px] font-black tracking-tight border", getCompilationStatus(stud.id).color)}>
                            {getCompilationStatus(stud.id).label}
                          </span>
                        </div>
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
                
                {/* READ-ONLY REFERENSI LEARNING GOALS KELAS */}
                <div className="bg-emerald-50/40 border border-emerald-150 p-5 rounded-2xl space-y-3.5 shadow-sm">
                  <div className="flex justify-between items-center pb-2 border-b border-emerald-100/60">
                    <div>
                      <h4 className="text-xs font-black text-emerald-900 uppercase tracking-tight flex items-center gap-1.5">
                        <BookOpen size={13} className="text-[#109E58]" />
                        Learning Goals Kelas
                      </h4>
                      <p className="text-[10px] text-gray-500 font-medium">Berlaku untuk seluruh siswa di kelas ini.</p>
                    </div>
                    {classLearningGoals ? (
                      <span className="text-[9px] font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded font-sans uppercase">
                        {classGoalsStatus}
                      </span>
                    ) : (
                      <span className="text-[9px] font-black text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-sans uppercase">
                        Belum Diisi
                      </span>
                    )}
                  </div>
                  
                  {!classLearningGoals ? (
                    <div className="p-4 text-center bg-white border border-gray-150 rounded-xl text-xs text-gray-400 italic font-sans">
                      Learning Goals kelas belum diisi.
                    </div>
                  ) : (
                    <div className="space-y-3 bg-white border border-gray-150 p-4 rounded-xl text-xs text-gray-750 leading-relaxed font-serif">
                      <div className="space-y-1">
                        <span className="text-[9px] font-black text-emerald-800 uppercase tracking-wider block font-sans">Nilai Agama & Budi Pekerti:</span>
                        <p className="whitespace-pre-wrap pl-2 border-l-2 border-emerald-100">{classLearningGoals.nilaiAgamaBudiPekerti || <span className="text-gray-400 italic font-sans text-[11px]">Belum diisi</span>}</p>
                      </div>
                      <div className="space-y-2 pt-1 border-t border-gray-50">
                        <span className="text-[9px] font-black text-emerald-800 uppercase tracking-wider block font-sans">Jati Diri:</span>
                        <p className="whitespace-pre-wrap pl-2 border-l-2 border-emerald-100">{classLearningGoals.jatiDiri || <span className="text-gray-400 italic font-sans text-[11px]">Belum diisi</span>}</p>
                      </div>
                      <div className="space-y-2 pt-1 border-t border-gray-50">
                        <span className="text-[9px] font-black text-emerald-800 uppercase tracking-wider block font-sans">Dasar-dasar Literasi & STEAM:</span>
                        <p className="whitespace-pre-wrap pl-2 border-l-2 border-emerald-100">{classLearningGoals.dasarLiterasiSteam || <span className="text-gray-400 italic font-sans text-[11px]">Belum diisi</span>}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* DATA FISIK SISWA */}
                <div className="bg-white border border-gray-150 p-5 rounded-2xl shadow-sm space-y-4">
                  <div className="pb-2.5 border-b border-gray-100">
                    <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider font-sans">Data Fisik Siswa</h3>
                    <p className="text-[10px] text-gray-400 font-medium">Data diisi khusus untuk rapor Midterm siswa ini.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block font-sans">Tinggi Badan (cm)</label>
                      <input
                        type="text"
                        value={localHeight}
                        onChange={(e) => setLocalHeight(e.target.value)}
                        placeholder="Contoh: 105.5"
                        disabled={isSavingPhysicalData || isLockedForEditing}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-sans outline-none focus:border-[#109E58] focus:ring-1 focus:ring-[#109E58]/35 focus:ring-offset-0 transition-all text-gray-800 bg-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block font-sans">Berat Badan (kg)</label>
                      <input
                        type="text"
                        value={localWeight}
                        onChange={(e) => setLocalWeight(e.target.value)}
                        placeholder="Contoh: 17.2"
                        disabled={isSavingPhysicalData || isLockedForEditing}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-sans outline-none focus:border-[#109E58] focus:ring-1 focus:ring-[#109E58]/35 focus:ring-offset-0 transition-all text-gray-800 bg-white"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-2 border-t border-gray-100">
                    <button
                      onClick={handleSavePhysicalData}
                      disabled={isSavingPhysicalData || isLockedForEditing}
                      className="flex items-center gap-1.5 bg-[#109E58] hover:bg-emerald-700 disabled:opacity-40 text-white font-extrabold text-xs px-4 py-2 rounded-xl cursor-pointer transition-all shadow-md shadow-[#109E58]/10 disabled:cursor-not-allowed"
                    >
                      {isSavingPhysicalData ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                      Simpan Data Fisik
                    </button>
                  </div>
                </div>

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

          {/* TAB 3: REVIEW & ACC GENCOM CONTENT */}
          {activeTab === 'review' && (
            <div className="space-y-6 lg:col-span-9">
              
              <div className="bg-gradient-to-r from-purple-500/5 to-indigo-500/5 p-6 rounded-3xl border border-purple-500/10 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-purple-100 rounded-xl text-purple-700 mt-0.5">
                    <CheckSquare size={18} />
                  </div>
                  <div className="space-y-1 flex-1">
                    <h2 className="text-sm font-black text-purple-900 font-sans">Review & ACC General Comments Midterm</h2>
                    <p className="text-xs text-gray-500 font-medium leading-relaxed font-sans">
                      Tinjau hasil penyusunan draf General Comments Midterm untuk siswa <b>{selectedStudentObj?.name || 'Pilih Siswa'}</b>.
                      Kepala Sekolah atau Reviewer berwenang memberikan persetujuan (ACC) atau mengembalikan draf disertai catatan proofreading untuk direvisi oleh guru kelas.
                    </p>
                  </div>
                </div>

                {/* Class Review Summary Metrics Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-2 border-t border-purple-100/60 text-xs">
                  <div className="bg-white/80 p-2.5 rounded-2xl border border-purple-100 text-center">
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">Total Siswa</span>
                    <span className="text-sm font-black text-gray-800">{classStudents.length}</span>
                  </div>
                  <div className="bg-amber-50/70 p-2.5 rounded-2xl border border-amber-150 text-center">
                    <span className="text-[9px] font-black text-amber-700 uppercase tracking-wider block">Draft</span>
                    <span className="text-sm font-black text-amber-800">
                      {classStudents.filter(s => !midtermDrafts[s.id] || midtermDrafts[s.id]?.status === 'DRAFT').length}
                    </span>
                  </div>
                  <div className="bg-emerald-50/70 p-2.5 rounded-2xl border border-emerald-150 text-center">
                    <span className="text-[9px] font-black text-emerald-700 uppercase tracking-wider block">Menunggu Review</span>
                    <span className="text-sm font-black text-emerald-800">
                      {classStudents.filter(s => midtermDrafts[s.id]?.status === 'READY_FOR_REVIEW').length}
                    </span>
                  </div>
                  <div className="bg-rose-50/70 p-2.5 rounded-2xl border border-rose-150 text-center">
                    <span className="text-[9px] font-black text-rose-700 uppercase tracking-wider block">Perlu Revisi</span>
                    <span className="text-sm font-black text-rose-800">
                      {classStudents.filter(s => midtermDrafts[s.id]?.status === 'PERLU_REVISI').length}
                    </span>
                  </div>
                  <div className="bg-purple-50/70 p-2.5 rounded-2xl border border-purple-150 text-center">
                    <span className="text-[9px] font-black text-purple-700 uppercase tracking-wider block">ACC</span>
                    <span className="text-sm font-black text-purple-800">
                      {classStudents.filter(s => midtermDrafts[s.id]?.status === 'APPROVED').length}
                    </span>
                  </div>
                  <div className="bg-blue-50/70 p-2.5 rounded-2xl border border-blue-150 text-center">
                    <span className="text-[9px] font-black text-blue-700 uppercase tracking-wider block">Published</span>
                    <span className="text-sm font-black text-blue-800">
                      {classStudents.filter(s => midtermDrafts[s.id]?.status === 'PUBLISHED' || publishedReports[s.id]).length}
                    </span>
                  </div>
                </div>
              </div>

              {!activeDraft ? (
                <div className="bg-white p-8 rounded-3xl border border-gray-150 text-center space-y-3">
                  <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto text-gray-400">
                    <FileText size={20} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-xs font-black text-gray-700 font-sans uppercase">Belum Ada Draf</h3>
                    <p className="text-xs text-gray-400 max-w-sm mx-auto font-sans leading-relaxed">
                      Siswa ini belum memiliki draf General Comments Midterm. Guru kelas harus menyusun draf terlebih dahulu di tab <b>Buat & Edit GenCom</b>.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  
                  {/* Status, Author, and Narrative Display */}
                  <div className="bg-white p-6 rounded-3xl border border-gray-150 shadow-sm space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-100">
                      <div className="space-y-1">
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">Status Saat Ini</span>
                        <div className="flex items-center gap-2">
                          <span className={cn("px-2.5 py-1 rounded-full text-xs font-black border", currentStudentStatus.textColor)}>
                            {currentStudentStatus.label}
                          </span>
                        </div>
                      </div>

                      <div className="text-right space-y-1 text-xs text-gray-400 font-sans">
                        <p>Dibuat oleh: <span className="font-bold text-gray-700">{activeDraft.createdBy || 'Guru'}</span></p>
                        <p>Terakhir diperbarui: <span className="font-bold text-gray-700">{new Date(activeDraft.updatedAt).toLocaleString('id-ID')}</span></p>
                      </div>
                    </div>

                    {/* General Comment Text Display */}
                    <div className="space-y-2">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Isi General Comments Midterm</span>
                      <div className="bg-gray-50/50 border border-gray-150 rounded-2xl p-4 text-xs text-gray-750 font-sans leading-relaxed whitespace-pre-wrap max-h-[350px] overflow-y-auto">
                        {activeDraft.midtermGeneralComment || <span className="italic text-gray-400">(Belum terisi)</span>}
                      </div>
                    </div>

                    {/* Proofreading Action Form for Reviewer */}
                    <div className="space-y-4 pt-3 border-t border-gray-100">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block">
                          Catatan Proofreading / Revisi {isAuthorizer && <span className="text-rose-500">* (Wajib jika menolak/revisi)</span>}
                        </label>
                        <textarea
                          rows={3}
                          value={reviewNotes[selectedStudentId] || ''}
                          onChange={(e) => setReviewNotes(prev => ({ ...prev, [selectedStudentId]: e.target.value }))}
                          disabled={!isAuthorizer}
                          placeholder={
                            isAuthorizer
                              ? "Berikan arahan perbaikan yang spesifik jika Anda meminta revisi, atau catatan pujian/tambahan sebelum menyetujui draf..."
                              : "Hanya Kepala TK atau Super Admin yang dapat mengisi catatan review ini."
                          }
                          className="w-full bg-white hover:bg-gray-50/30 focus:bg-white border border-gray-250 focus:border-purple-500 rounded-2xl p-3.5 text-xs text-gray-800 leading-relaxed outline-none transition-all placeholder:text-gray-300 font-sans focus:ring-2 focus:ring-purple-100"
                        />
                      </div>

                      {isAuthorizer ? (
                        <div className="flex items-center justify-end gap-3 pt-1">
                          <button
                            type="button"
                            onClick={() => handleRejectStudentDraft(selectedStudentId, reviewNotes[selectedStudentId] || '')}
                            disabled={!reviewNotes[selectedStudentId]?.trim()}
                            className="flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100/75 text-rose-700 font-extrabold text-xs px-4.5 py-2.5 rounded-xl border border-rose-150 cursor-pointer transition-all disabled:opacity-45 disabled:cursor-not-allowed"
                          >
                            <XSquare size={12} />
                            Kembalikan untuk Revisi
                          </button>
                          
                          <button
                            type="button"
                            onClick={() => handleApproveStudentDraft(selectedStudentId, reviewNotes[selectedStudentId] || '')}
                            className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs px-4.5 py-2.5 rounded-xl border border-purple-500 cursor-pointer transition-all shadow-md shadow-purple-600/10"
                          >
                            <CheckSquare size={12} />
                            ACC & Setujui Draf
                          </button>
                        </div>
                      ) : (
                        <div className="bg-amber-50/40 border border-amber-150 rounded-xl p-3 text-xs text-amber-700 font-sans leading-relaxed">
                          Anda masuk sebagai Guru Kelas. Anda tidak memiliki hak akses untuk menyetujui atau menolak draf Midterm ini. Silakan tunggu peninjauan dari Kepala TK atau Super Admin.
                        </div>
                      )}
                    </div>

                  </div>

                  {/* Historical logs for selected student */}
                  {selectedStudentId && (
                    <div className="pt-2">
                      <div className="bg-white p-6 rounded-3xl border border-gray-150 shadow-sm space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                          <div className="flex items-center gap-2">
                            <History size={16} className="text-gray-500" />
                            <h3 className="text-xs font-black text-gray-800 uppercase tracking-tight font-sans">
                              Audit Trail: Riwayat Perubahan & Review
                            </h3>
                          </div>
                          <button
                            type="button"
                            onClick={() => fetchAuditLogsForStudent(selectedStudentId)}
                            className="text-[10px] font-black text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100 transition-all cursor-pointer"
                          >
                            Refresh Riwayat
                          </button>
                        </div>

                        {isFetchingAuditLogs ? (
                          <div className="py-8 text-center text-xs text-gray-400 italic">
                            Mengambil riwayat audit...
                          </div>
                        ) : auditLogs.length === 0 ? (
                          <div className="py-8 text-center text-xs text-gray-400 italic">
                            Belum ada riwayat aktivitas yang tercatat untuk siswa ini.
                          </div>
                        ) : (
                          <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                            {auditLogs.map((log: any, idx) => {
                              let actionBadgeColor = "bg-gray-100 text-gray-650";
                              let actionLabel = log.action;
                              if (log.action === 'CREATED') {
                                actionBadgeColor = "bg-blue-50 text-blue-750 border-blue-150";
                                actionLabel = "Draf Dibuat";
                              } else if (log.action === 'EDITED') {
                                actionBadgeColor = "bg-amber-50 text-amber-700 border-amber-150";
                                actionLabel = "Draf Diperbarui";
                              } else if (log.action === 'SUBMITTED_FOR_REVIEW') {
                                actionBadgeColor = "bg-emerald-50 text-emerald-700 border-emerald-150";
                                actionLabel = "Diajukan Review";
                              } else if (log.action === 'RETURNED_FOR_REVISION') {
                                actionBadgeColor = "bg-rose-50 text-rose-750 border-rose-150";
                                actionLabel = "Perlu Revisi";
                              } else if (log.action === 'APPROVED') {
                                actionBadgeColor = "bg-purple-50 text-purple-750 border-purple-150";
                                actionLabel = "Disetujui (ACC)";
                              } else if (log.action === 'PUBLISHED') {
                                actionBadgeColor = "bg-teal-50 text-teal-700 border-teal-150";
                                actionLabel = "Diterbitkan";
                              }

                              return (
                                <div key={log.id || idx} className="border border-gray-100 rounded-xl p-3.5 space-y-2.5 bg-gray-50/40 text-xs">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] font-black text-gray-400 font-mono">
                                        v{log.version}
                                      </span>
                                      <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-black tracking-wider uppercase border", actionBadgeColor)}>
                                        {actionLabel}
                                      </span>
                                    </div>
                                    <span className="text-[10px] text-gray-400 font-mono">
                                      {new Date(log.timestamp).toLocaleString('id-ID')}
                                    </span>
                                  </div>

                                  <div className="text-gray-500 space-y-0.5">
                                    <p>Oleh: <span className="font-extrabold text-gray-700">{log.actorName}</span> ({log.actorEmail})</p>
                                    <p>Peran: <span className="font-bold text-gray-650">{log.actorRole}</span></p>
                                  </div>

                                  {log.reviewNote && (
                                    <div className="bg-rose-50/50 border border-rose-100 rounded-lg p-2.5 text-xs text-rose-850">
                                      <p className="font-black text-[10px] uppercase tracking-wide text-rose-800 mb-0.5">Catatan Reviewer:</p>
                                      <p className="font-medium whitespace-pre-wrap">{log.reviewNote}</p>
                                    </div>
                                  )}

                                  {log.narrativeAfter && log.narrativeAfter !== log.narrativeBefore && (
                                    <details className="cursor-pointer group">
                                      <summary className="text-[10px] font-black text-emerald-600 hover:text-emerald-700 select-none outline-none">
                                        Lihat Perubahan Narasi
                                      </summary>
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2 pt-2 border-t border-gray-150 text-[11px] leading-relaxed">
                                        <div className="space-y-1">
                                          <span className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Sebelumnya</span>
                                          <div className="bg-white border border-gray-150 rounded-lg p-2 text-gray-400 max-h-[100px] overflow-y-auto whitespace-pre-wrap font-sans">
                                            {log.narrativeBefore || <span className="italic">(Kosong)</span>}
                                          </div>
                                        </div>
                                        <div className="space-y-1">
                                          <span className="text-[9px] font-black uppercase text-[#109E58] tracking-wider">Sesudahnya</span>
                                          <div className="bg-emerald-50/20 border border-emerald-100 rounded-lg p-2 text-gray-750 max-h-[100px] overflow-y-auto whitespace-pre-wrap font-sans">
                                            {log.narrativeAfter}
                                          </div>
                                        </div>
                                      </div>
                                    </details>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                </div>
              )}

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

                          {/* If status is PERLU_REVISI */}
                          {activeDraft.status === 'PERLU_REVISI' && (
                            <div className="text-xs text-rose-700 bg-rose-50 px-3 py-2.5 rounded-xl border border-rose-150 font-semibold flex items-center gap-1.5 flex-1">
                              <AlertCircle size={14} className="shrink-0" />
                              <span>Draf dikembalikan oleh Reviewer untuk direvisi. Silakan perbaiki di tab "Buat & Edit GenCom" sesuai catatan revisi.</span>
                            </div>
                          )}

                          {/* If status is DRAFT */}
                          {activeDraft.status === 'DRAFT' && (
                            <div className="text-xs text-amber-700 bg-amber-50 px-3 py-2.5 rounded-xl border border-amber-150 font-semibold flex items-center gap-1.5 flex-1">
                              <Clock size={14} className="shrink-0" />
                              <span>Draf sedang dikerjakan oleh guru. Silakan selesaikan di tab "Buat & Edit GenCom" lalu klik "Ajukan Review".</span>
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
                  <div className="overflow-x-auto bg-gray-100 p-4 md:p-8 rounded-[2rem] border border-gray-200 shadow-inner flex flex-col items-center gap-8">
                    
                    {/* PAGE 1 — IDENTITY, ATTENDANCE & LEARNING GOALS */}
                    <div className="bg-white px-8 py-6 md:px-12 md:py-8 shadow-md border border-gray-200 text-gray-950 mx-auto w-full max-w-[794px] min-[794px]:w-[794px] min-[794px]:h-[1123px] min-[794px]:min-h-[1123px] font-sans flex flex-col justify-between print:border-none print:shadow-none print:p-0 print:m-0" id="midterm-report-page-1">
                      
                      <div className="space-y-4">
                        {/* School branding banner */}
                        <div className="bg-[#109E58] py-4 px-5 text-white relative flex flex-col justify-between rounded-sm">
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-white/20 pb-3 mb-3 gap-3">
                            <div className="flex items-center gap-3">
                              {resolvedLogoUrl ? (
                                <div className="bg-white p-1.5 rounded-lg shrink-0 flex items-center justify-center" style={{ height: '56px' }}>
                                  <img 
                                    src={resolvedLogoUrl} 
                                    alt="Lazuardi Kindergarten Logo" 
                                    className="h-10 w-auto object-contain"
                                    crossOrigin={resolvedLogoUrl.startsWith("data:") ? undefined : "anonymous"}
                                  />
                                </div>
                              ) : (
                                <>
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
                                </>
                              )}
                            </div>

                            <div className="text-right sm:text-right w-full sm:w-auto flex flex-col items-end justify-center">
                              <span className="block text-[10px] font-sans font-black tracking-widest text-emerald-100 uppercase mb-1">
                                LAZUARDI GCS KINDERGARTEN
                              </span>
                              <h1 className="text-xs font-sans font-black tracking-wider text-white uppercase leading-none mt-1 text-right">
                                LAPORAN PERKEMBANGAN TENGAH SEMESTER PESERTA DIDIK
                              </h1>
                              <h2 className="text-[10px] font-sans font-bold tracking-widest text-emerald-100 uppercase mt-0.5 text-right">
                                PRA-TK/TK LAZUARDI GCS
                              </h2>
                            </div>
                          </div>

                          {/* Student Metadata Grid */}
                          <div className="grid grid-cols-2 gap-x-8 text-[10px] font-sans">
                            <div className="space-y-1">
                              <div className="grid grid-cols-12 leading-none">
                                <span className="col-span-4 font-bold text-emerald-100">Student Name</span>
                                <span className="col-span-1 text-emerald-100/70 text-center">:</span>
                                <span className="col-span-7 font-extrabold text-white text-[11px] -mt-0.5">{selectedStudentObj?.name || '-'}</span>
                              </div>
                              <div className="grid grid-cols-12 leading-none">
                                <span className="col-span-4 font-bold text-emerald-100">Student ID</span>
                                <span className="col-span-1 text-emerald-100/70 text-center">:</span>
                                <span className="col-span-7 font-bold text-white">{selectedStudentObj?.studentId || selectedStudentObj?.id || '-'}</span>
                              </div>
                              <div className="grid grid-cols-12 leading-none">
                                <span className="col-span-4 font-bold text-emerald-100">Height</span>
                                <span className="col-span-1 text-emerald-100/70 text-center">:</span>
                                <span className="col-span-7 font-bold text-white">
                                  {activeDraft?.heightCm !== undefined && activeDraft?.heightCm !== null && activeDraft?.heightCm !== '' && !isNaN(Number(activeDraft.heightCm)) ? `${activeDraft.heightCm} cm` : '-'}
                                </span>
                              </div>
                              <div className="grid grid-cols-12 leading-none">
                                <span className="col-span-4 font-bold text-emerald-100">Weight</span>
                                <span className="col-span-1 text-emerald-100/70 text-center">:</span>
                                <span className="col-span-7 font-bold text-white">
                                  {activeDraft?.weightKg !== undefined && activeDraft?.weightKg !== null && activeDraft?.weightKg !== '' && !isNaN(Number(activeDraft.weightKg)) ? `${activeDraft.weightKg} kg` : '-'}
                                </span>
                              </div>
                            </div>

                            <div className="space-y-1 sm:pl-4">
                              <div className="grid grid-cols-12 leading-none">
                                <span className="col-span-4 font-bold text-emerald-100">Teachers</span>
                                <span className="col-span-1 text-emerald-100/70 text-center">:</span>
                                <span className="col-span-7 font-bold text-white">{toTitleCase(resolvedTeacherName) || '-'}</span>
                              </div>
                              <div className="grid grid-cols-12 leading-none">
                                <span className="col-span-4 font-bold text-emerald-100">Group</span>
                                <span className="col-span-1 text-emerald-100/70 text-center">:</span>
                                <span className="col-span-7 font-bold text-white">{activeClassObj?.name || '-'}</span>
                              </div>
                              <div className="grid grid-cols-12 leading-none">
                                <span className="col-span-4 font-bold text-emerald-100">Semester</span>
                                <span className="col-span-1 text-emerald-100/70 text-center">:</span>
                                <span className="col-span-7 font-bold text-white">{semester === 1 ? '1 (Ganjil)' : '2 (Genap)'}</span>
                              </div>
                              <div className="grid grid-cols-12 leading-none">
                                <span className="col-span-4 font-bold text-emerald-100">Academic Year</span>
                                <span className="col-span-1 text-emerald-100/70 text-center">:</span>
                                <span className="col-span-7 font-bold text-white">{activeYear || '-'}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Semester Learning Goals */}
                        <div className="space-y-2">
                          <h4 className="text-[11px] font-black text-emerald-800 uppercase tracking-widest border-b border-dashed border-emerald-600 pb-1 text-center font-sans">
                            {semester === 1 || semester === '1' ? '1st' : '2nd'} Semester Learning Goals
                          </h4>
                          <div className="grid grid-cols-3 gap-3">
                            {/* Column 1: Nilai Agama & Budi Pekerti */}
                            <div className="border border-emerald-100 rounded-lg p-3 bg-emerald-50/10 flex flex-col h-[730px]">
                              <span className="text-[9px] font-black text-emerald-800 block text-center border-b border-emerald-100 pb-1.5 mb-2 font-sans">
                                Nilai Agama & Budi Pekerti
                              </span>
                              <div className="overflow-y-auto flex-1 pr-1 custom-scrollbar text-[9.5px] text-gray-700 leading-relaxed space-y-1.5 font-serif whitespace-pre-wrap">
                                {getAgamaGoalText() ? (
                                  getAgamaGoalText()
                                ) : (
                                  <p className="text-gray-400 italic text-center pt-12">Belum diisi.</p>
                                )}
                              </div>
                            </div>

                            {/* Column 2: Jati Diri */}
                            <div className="border border-emerald-100 rounded-lg p-3 bg-emerald-50/10 flex flex-col h-[730px]">
                              <span className="text-[9px] font-black text-emerald-800 block text-center border-b border-emerald-100 pb-1.5 mb-2 font-sans">
                                Jati Diri
                              </span>
                              <div className="overflow-y-auto flex-1 pr-1 custom-scrollbar text-[9.5px] text-gray-700 leading-relaxed space-y-1.5 font-serif whitespace-pre-wrap">
                                {getJatiDiriGoalText() ? (
                                  getJatiDiriGoalText()
                                ) : (
                                  <p className="text-gray-400 italic text-center pt-12">Belum diisi.</p>
                                )}
                              </div>
                            </div>

                            {/* Column 3: Dasar-dasar Literasi & STEAM */}
                            <div className="border border-emerald-100 rounded-lg p-3 bg-emerald-50/10 flex flex-col h-[730px]">
                              <span className="text-[9px] font-black text-emerald-800 block text-center border-b border-emerald-100 pb-1.5 mb-2 font-sans">
                                Dasar-dasar Literasi & STEAM
                              </span>
                              <div className="overflow-y-auto flex-1 pr-1 custom-scrollbar text-[9.5px] text-gray-700 leading-relaxed space-y-1.5 font-serif whitespace-pre-wrap">
                                {getSteamGoalText() ? (
                                  getSteamGoalText()
                                ) : (
                                  <p className="text-gray-400 italic text-center pt-12">Belum diisi.</p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-between items-center text-[8px] text-gray-400 font-sans mt-4">
                        <span>Lazuardi GCS Kindergarten</span>
                        <span>Halaman 1 dari {shouldMoveSignaturesToPage3 ? '3' : '2'}</span>
                      </div>
                    </div>

                     {/* PAGE 2 — COMMENTS & ATTENDANCE TABLE */}
                     <div className="bg-white px-8 py-6 md:px-12 md:py-8 shadow-md border border-gray-200 text-gray-950 mx-auto w-full max-w-[794px] min-[794px]:w-[794px] min-[794px]:h-[1123px] min-[794px]:min-h-[1123px] font-sans flex flex-col justify-start print:border-none print:shadow-none print:p-0 print:m-0" id="midterm-report-page-2">
                       
                       <div className="space-y-4 flex-1 flex flex-col justify-start">
                         <div>
                           {/* Section: General Comments */}
                           <div className="space-y-2">
                             <h3 className="text-xs font-black text-emerald-800 uppercase tracking-widest border-b border-dashed border-emerald-600 pb-1 text-center font-sans">
                               General Comments (Catatan Umum)
                             </h3>
                             <div id="preview-comments-container" className="bg-emerald-50/10 border border-emerald-100 p-4 rounded-xl text-[11px] text-gray-800 font-serif leading-relaxed whitespace-pre-wrap">
                               {getGeneralCommentText() || "Komentar evaluasi tengah semester belum dimasukkan."}
                             </div>
                           </div>

                           {/* Section: Catatan Ketidakhadiran */}
                           <div className="space-y-1.5 mt-6">
                             <h4 className="text-[10px] font-black text-emerald-800 uppercase tracking-widest border-b border-dashed border-emerald-600 pb-0.5 font-sans">
                               Catatan Ketidakhadiran
                             </h4>
                             <table className="w-full border-collapse text-left text-[9.5px] font-sans">
                               <thead>
                                 <tr className="bg-emerald-50 text-emerald-800 border border-emerald-100">
                                   <th className="p-1.5 font-black border border-emerald-100 text-center w-12 font-sans">No</th>
                                   <th className="p-1.5 font-black border border-emerald-100 font-sans">Alasan</th>
                                   <th className="p-1.5 font-black border border-emerald-100 text-center w-24 font-sans">Jumlah</th>
                                   <th className="p-1.5 font-black border border-emerald-100 font-sans">Keterangan</th>
                                 </tr>
                               </thead>
                               <tbody>
                                 <tr className="border border-gray-150">
                                   <td className="p-1.5 text-center border border-gray-150 font-sans">1</td>
                                   <td className="p-1.5 border border-gray-150 font-medium font-sans">Sakit</td>
                                   <td className="p-1.5 text-center border border-gray-150 font-extrabold font-sans">{getAttendance().sick} Hari</td>
                                   <td className="p-1.5 border border-gray-150 text-gray-400 font-sans">-</td>
                                 </tr>
                                 <tr className="border border-gray-150">
                                   <td className="p-1.5 text-center border border-gray-150 font-sans">2</td>
                                   <td className="p-1.5 border border-gray-150 font-medium font-sans">Izin</td>
                                   <td className="p-1.5 text-center border border-gray-150 font-extrabold font-sans">{getAttendance().izin} Hari</td>
                                   <td className="p-1.5 border border-gray-150 text-gray-400 font-sans">-</td>
                                 </tr>
                                 <tr className="border border-gray-150">
                                   <td className="p-1.5 text-center border border-gray-150 font-sans">3</td>
                                   <td className="p-1.5 border border-gray-150 font-medium font-sans">Tanpa Keterangan</td>
                                   <td className="p-1.5 text-center border border-gray-150 font-extrabold font-sans">{getAttendance().noNews} Hari</td>
                                   <td className="p-1.5 border border-gray-150 text-gray-400 font-sans">-</td>
                                 </tr>
                                 <tr className="border border-emerald-100 bg-emerald-50/20">
                                   <td className="p-1.5 text-center border border-emerald-100 font-extrabold font-sans" colSpan={2}>Total Ketidakhadiran</td>
                                   <td className="p-1.5 text-center border border-emerald-100 font-black text-emerald-800 font-sans">{getAttendance().sick + getAttendance().izin + getAttendance().noNews} Hari</td>
                                   <td className="p-1.5 border border-emerald-100 text-gray-400 font-sans">-</td>
                                 </tr>
                               </tbody>
                             </table>
                           </div>
                         </div>

                         {/* Signatures Area - Rendered here on Page 2 ONLY if they do NOT overflow to Page 3 */}
                          {!shouldMoveSignaturesToPage3 && (
                            <div className="pt-6 border-t border-dashed border-gray-200 mt-8 shrink-0">
                              <div className="text-right text-[9.5px] font-sans text-gray-800 pr-8 mb-4">
                                Depok, {formattedSigningDate}
                              </div>
                              <div className="grid grid-cols-2 gap-8 text-center">
                                {/* Principal */}
                                <div className="flex flex-col items-center justify-between h-[100px]">
                                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider leading-none font-sans">
                                    Kepala Pra-TK/TK Lazuardi GCS
                                  </span>
                                  <div className="h-12 flex items-center justify-center">
                                    {isValidPrincipalSignature ? (
                                      <img 
                                        src={kindySignatory!.principalSignatureUrl!} 
                                        alt="Signature" 
                                        className="h-10 w-auto object-contain"
                                        referrerPolicy="no-referrer"
                                        crossOrigin={kindySignatory!.principalSignatureUrl!.startsWith("data:") ? undefined : "anonymous"}
                                      />
                                    ) : (
                                      <div className="text-[9px] text-gray-400 italic font-sans">Verified Digitally</div>
                                    )}
                                  </div>
                                  <div className="text-center font-sans leading-none">
                                    <span className="text-[10px] font-extrabold text-gray-800 leading-none underline block">
                                      {toTitleCase(kindySignatory?.principalName) || "Nama Kepala Unit"}
                                    </span>
                                    {kindySignatory?.principalNiy && kindySignatory.principalNiy !== '-' && kindySignatory.principalNiy !== '' && (
                                      <span className="text-[8px] text-gray-400 block mt-1 font-sans">
                                        NIY: {kindySignatory.principalNiy}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Homeroom Teacher */}
                                <div className="flex flex-col items-center justify-between h-[100px]">
                                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider leading-none font-sans">Guru Kelas</span>
                                  <div className="h-12 flex items-center justify-center">
                                    {isValidHomeroomSignature ? (
                                      <img 
                                        src={resolvedSignatureUrl!} 
                                        alt="Signature" 
                                        className="h-10 w-auto object-contain"
                                        referrerPolicy="no-referrer"
                                        crossOrigin={resolvedSignatureUrl!.startsWith("data:") ? undefined : "anonymous"}
                                      />
                                    ) : (
                                      <div className="text-[9px] text-gray-400 italic font-sans">Verified Digitally</div>
                                    )}
                                  </div>
                                  <div className="text-center font-sans leading-none">
                                    <span className="text-[10px] font-extrabold text-gray-800 leading-none underline block">
                                      {toTitleCase(resolvedTeacherName) || "Nama Guru Kelas"}
                                    </span>
                                    <span className="text-[8px] text-gray-400 block mt-1 font-sans">
                                      NIY: {(!resolvedTeacherNiy || resolvedTeacherNiy === '-') ? '-' : resolvedTeacherNiy}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                       </div>

                       {/* Footer */}
                       <div className="flex justify-between items-center text-[8px] text-gray-400 font-sans mt-auto pt-2 border-t border-gray-100">
                         <span>Lazuardi GCS Kindergarten</span>
                         <span>Halaman 2 dari {shouldMoveSignaturesToPage3 ? '3' : '2'}</span>
                       </div>
                     </div>

                     {/* PAGE 3 — CONDITIONAL SIGNATURES PAGE */}
                     {shouldMoveSignaturesToPage3 && (
                        <div className="bg-white px-8 py-6 md:px-12 md:py-8 shadow-md border border-gray-200 text-gray-950 mx-auto w-full max-w-[794px] min-[794px]:w-[794px] min-[794px]:h-[1123px] min-[794px]:min-h-[1123px] font-sans flex flex-col justify-between print:border-none print:shadow-none print:p-0 print:m-0" id="midterm-report-page-3">
                          
                          <div className="space-y-4 flex-1 flex flex-col justify-start">
                            {/* School/Report info context header */}
                            <div className="border-b border-gray-200 pb-2.5 mb-6">
                              <div className="flex justify-between items-center text-[9px] font-sans font-black text-gray-400 uppercase tracking-widest">
                                <span>Lazuardi GCS Kindergarten</span>
                                <span>Midterm Progress Report - Page 3</span>
                              </div>
                              <div className="text-[10px] text-gray-800 font-bold mt-1.5">
                                Nama Siswa: {selectedStudentObj?.name} | Kelas: {activeClassObj?.name}
                              </div>
                            </div>

                            <div className="text-[11px] text-gray-500 italic mb-8 font-sans leading-relaxed">
                              Lembar Tanda Tangan Pengesahan (Signature Endorsement Page). Bagian ini dipisahkan secara otomatis karena halaman sebelumnya telah terisi penuh oleh komentar evaluasi.
                            </div>

                            {/* Signatures Area */}
                            <div className="pt-10 border-t border-dashed border-gray-200 shrink-0">
                              <div className="text-right text-[9.5px] font-sans text-gray-800 pr-8 mb-4">
                                Depok, {formattedSigningDate}
                              </div>
                              <div className="grid grid-cols-2 gap-8 text-center">
                                {/* Principal */}
                                <div className="flex flex-col items-center justify-between h-[100px]">
                                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider leading-none font-sans">
                                    Kepala Pra-TK/TK Lazuardi GCS
                                  </span>
                                  <div className="h-12 flex items-center justify-center">
                                    {isValidPrincipalSignature ? (
                                      <img 
                                        src={kindySignatory!.principalSignatureUrl!} 
                                        alt="Signature" 
                                        className="h-10 w-auto object-contain"
                                        referrerPolicy="no-referrer"
                                        crossOrigin={kindySignatory!.principalSignatureUrl!.startsWith("data:") ? undefined : "anonymous"}
                                      />
                                    ) : (
                                      <div className="text-[9px] text-gray-400 italic font-sans">Verified Digitally</div>
                                    )}
                                  </div>
                                  <div className="text-center font-sans leading-none">
                                    <span className="text-[10px] font-extrabold text-gray-800 leading-none underline block">
                                      {toTitleCase(kindySignatory?.principalName) || "Nama Kepala Unit"}
                                    </span>
                                    {kindySignatory?.principalNiy && kindySignatory.principalNiy !== '-' && kindySignatory.principalNiy !== '' && (
                                      <span className="text-[8px] text-gray-400 block mt-1 font-sans">
                                        NIY: {kindySignatory.principalNiy}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Homeroom Teacher */}
                                <div className="flex flex-col items-center justify-between h-[100px]">
                                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider leading-none font-sans">Guru Kelas</span>
                                  <div className="h-12 flex items-center justify-center">
                                    {isValidHomeroomSignature ? (
                                      <img 
                                        src={resolvedSignatureUrl!} 
                                        alt="Signature" 
                                        className="h-10 w-auto object-contain"
                                        referrerPolicy="no-referrer"
                                        crossOrigin={resolvedSignatureUrl!.startsWith("data:") ? undefined : "anonymous"}
                                      />
                                    ) : (
                                      <div className="text-[9px] text-gray-400 italic font-sans">Verified Digitally</div>
                                    )}
                                  </div>
                                  <div className="text-center font-sans leading-none">
                                    <span className="text-[10px] font-extrabold text-gray-800 leading-none underline block">
                                      {toTitleCase(resolvedTeacherName) || "Nama Guru Kelas"}
                                    </span>
                                    <span className="text-[8px] text-gray-400 block mt-1 font-sans">
                                      NIY: {(!resolvedTeacherNiy || resolvedTeacherNiy === '-') ? '-' : resolvedTeacherNiy}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Footer */}
                          <div className="flex justify-between items-center text-[8px] text-gray-400 font-sans mt-auto pt-2 border-t border-gray-100">
                            <span>Lazuardi GCS Kindergarten</span>
                            <span>Halaman 3 dari 3</span>
                          </div>
                        </div>
                      )}
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
