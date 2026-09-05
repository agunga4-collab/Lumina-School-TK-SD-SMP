import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, Calendar, Users, Save, CheckCircle2, RefreshCw, Plus, Trash2, 
  ChevronUp, ChevronDown, Sparkles, BookOpen, Layers, AlertCircle, Info, Check,
  Search, X, CheckSquare, Square, ChevronRight, Copy
} from 'lucide-react';
import { db, getClasses } from '../../lib/firebase';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { toast } from 'sonner';
import { isTeacherAssignedToClass } from '../../services/classTeacherAssignmentService';
import type { Class, ClassReportSummary } from '../../types';

interface ReportItem {
  id: string;
  order: number;
  category: 'WEEKLY_LESSON' | 'UNIT_ACTIVITY';
  title: string;
  summary: string;
}

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

enum PreflightClassStatus {
  NEW = 'NEW',
  EMPTY_DRAFT = 'EMPTY_DRAFT',
  FILLED_DRAFT = 'FILLED_DRAFT',
  READY_OR_LOCKED = 'READY_OR_LOCKED'
}

interface PreflightResult {
  classId: string;
  className: string;
  classification: PreflightClassStatus;
  existingDoc?: ClassReportSummary;
  statusLabel?: string;
}

interface SaveSummaryResult {
  saved: string[];
  skipped: string[];
  locked: string[];
  failed: { name: string; reason: string }[];
}

interface ReadyValidationResult {
  classId: string;
  className: string;
  eligible: boolean;
  reason?: string;
  existingDoc?: ClassReportSummary;
}

interface ReadySummaryResult {
  marked: string[];
  skipped: string[];
  failed: { name: string; reason: string }[];
}

export default function MonthlyReportSummaryPage() {
  const { profile } = useAuth();
  const { activeYear, activeSemester } = useAcademicYear();

  // Selected parameters
  const [selectedYear, setSelectedYear] = React.useState<string>('2026/2027');
  const [selectedSemester, setSelectedSemester] = React.useState<string>('1');
  const [selectedMonth, setSelectedMonth] = React.useState<string>('');
  
  // Replace single selectedClassId with multi-class select state
  const [selectedClassIds, setSelectedClassIds] = React.useState<string[]>([]);
  
  // Transition and warning states
  const [pendingClassIds, setPendingClassIds] = React.useState<string[] | null>(null);
  const [showConfirmSwitchModal, setShowConfirmSwitchModal] = React.useState<boolean>(false);
  const skipNextLoad = React.useRef<boolean>(false);

  // Searchable dropdown state
  const [isClassDropdownOpen, setIsClassDropdownOpen] = React.useState(false);
  const [classSearchTerm, setClassSearchTerm] = React.useState('');
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Expanded list view for selected target labels
  const [isClassesListExpanded, setIsClassesListExpanded] = React.useState(false);

  // Dropdown list
  const [classesList, setClassesList] = React.useState<Class[]>([]);
  const [loadingClasses, setLoadingClasses] = React.useState<boolean>(false);

  // Form states
  const [learningTitle, setLearningTitle] = React.useState<string>('');
  const [learningSummary, setLearningSummary] = React.useState<string>('');
  const [reportItems, setReportItems] = React.useState<ReportItem[]>([]);
  const [draftStatus, setDraftStatus] = React.useState<'DRAFT' | 'READY'>('DRAFT');

  // Async states
  const [isLoadingDraft, setIsLoadingDraft] = React.useState<boolean>(false);
  const [isSaving, setIsSaving] = React.useState<boolean>(false);

  // Keep track of loaded or saved content to detect changes
  const lastLoadedContent = React.useRef({
    title: '',
    summary: '',
    items: [] as ReportItem[]
  });

  // Preflight and Overwrite States
  const [isPrechecking, setIsPrechecking] = React.useState(false);
  const [preflightData, setPreflightData] = React.useState<PreflightResult[]>([]);
  const [showPreflightConfirmModal, setShowPreflightConfirmModal] = React.useState(false);
  const [showConflictModal, setShowConflictModal] = React.useState(false);
  const [overwriteOption, setOverwriteOption] = React.useState<'SKIP' | 'OVERWRITE' | null>(null);
  const [showSecondOverwriteConfirm, setShowSecondOverwriteConfirm] = React.useState(false);

  // Save Outcomes
  const [saveSummary, setSaveSummary] = React.useState<SaveSummaryResult | null>(null);
  const [showSaveResultModal, setShowSaveResultModal] = React.useState(false);

  // Mark Ready States
  const [isValidatingReady, setIsValidatingReady] = React.useState(false);
  const [readyValidationData, setReadyValidationData] = React.useState<ReadyValidationResult[]>([]);
  const [showReadyConfirmModal, setShowReadyConfirmModal] = React.useState(false);
  const [readySummary, setReadySummary] = React.useState<ReadySummaryResult | null>(null);
  const [showReadyResultModal, setShowReadyResultModal] = React.useState(false);

  // Copy From Action
  const [showCopyFromModal, setShowCopyFromModal] = React.useState(false);
  const [copyClassId, setCopyClassId] = React.useState('');

  // single selected class id helper
  const selectedClassId = selectedClassIds.length === 1 ? selectedClassIds[0] : '';

  // Initialize dates and lists
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

        let jhClasses = (all || []).filter(c => {
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
        if (profile?.role === 'TEACHER' || profile?.role === 'HOMEROOM_TEACHER') {
          jhClasses = jhClasses.filter(c => isTeacherAssignedToClass(c, profile?.uid || ''));
        }

        setClassesList(jhClasses);

        // Filter valid selectedClassIds against newly loaded jhClasses
        setSelectedClassIds(prev => {
          const validIds = prev.filter(id => jhClasses.some(c => c.id === id));
          return validIds;
        });

      } catch (err) {
        console.error('Error loading Junior High classes:', err);
        toast.error('Gagal memuat daftar kelas');
      } finally {
        setLoadingClasses(false);
      }
    };
    fetchJHClasses();
  }, [selectedYear, profile]);

  // Handle outside click to close dropdown
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsClassDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Compute deterministic ID helper
  const getDeterministicId = (classIdToUse: string) => {
    if (!classIdToUse || !selectedYear || !selectedSemester || !selectedMonth) return '';
    const academicYearNormalized = selectedYear.replace(/\//g, '-');
    return `JUNIOR_HIGH_MONTHLY_PROGRESS_${classIdToUse}_${academicYearNormalized}_${selectedSemester}_${selectedMonth}`;
  };

  // Check if content is edited / unsaved
  const isContentDirty = () => {
    const original = lastLoadedContent.current;
    if (learningTitle !== original.title) return true;
    if (learningSummary !== original.summary) return true;
    if (reportItems.length !== original.items.length) return true;
    for (let i = 0; i < reportItems.length; i++) {
      const item = reportItems[i];
      const origItem = original.items[i];
      if (!origItem) return true;
      if (item.category !== origItem.category) return true;
      if (item.title !== origItem.title) return true;
      if (item.summary !== origItem.summary) return true;
    }
    return false;
  };

  // Handle checkbox or toggle selections with dirty detection
  const handleToggleClass = (classId: string) => {
    let nextIds = [...selectedClassIds];
    if (nextIds.includes(classId)) {
      nextIds = nextIds.filter(id => id !== classId);
    } else {
      nextIds.push(classId);
    }
    nextIds = Array.from(new Set(nextIds));
    processSelectionChange(nextIds);
  };

  const processSelectionChange = (nextIds: string[]) => {
    // If switching to exactly one class and there are unsaved changes:
    if (nextIds.length === 1 && selectedClassIds.length !== 1 && isContentDirty()) {
      setPendingClassIds(nextIds);
      setShowConfirmSwitchModal(true);
    } else {
      setSelectedClassIds(nextIds);
    }
  };

  const handleKeepCurrentContent = () => {
    if (pendingClassIds) {
      skipNextLoad.current = true;
      setSelectedClassIds(pendingClassIds);
    }
    setShowConfirmSwitchModal(false);
    setPendingClassIds(null);
  };

  const handleLoadClassDraft = () => {
    if (pendingClassIds) {
      setSelectedClassIds(pendingClassIds);
    }
    setShowConfirmSwitchModal(false);
    setPendingClassIds(null);
  };

  const handleCancelSwitch = () => {
    setShowConfirmSwitchModal(false);
    setPendingClassIds(null);
  };

  // Load draft automatically when selection changes to exactly one class
  const loadDraft = async () => {
    const activeId = selectedClassId;
    if (!activeId) return;

    setIsLoadingDraft(true);
    try {
      const docId = getDeterministicId(activeId);
      const docRef = doc(db, 'class_report_summaries', docId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data() as ClassReportSummary;
        const fetchedTitle = data.sections?.learningJourney?.title || '';
        const fetchedSummary = data.sections?.learningJourney?.summary || '';
        
        const sortedItems = [...(data.sections?.weeklyLessonsAndUnitActivities || [])]
          .sort((a, b) => a.order - b.order)
          .map((item, idx) => ({
            ...item,
            order: item.order ?? idx
          }));

        setLearningTitle(fetchedTitle);
        setLearningSummary(fetchedSummary);
        setReportItems(sortedItems);
        setDraftStatus(data.status || 'DRAFT');

        lastLoadedContent.current = {
          title: fetchedTitle,
          summary: fetchedSummary,
          items: sortedItems
        };
      } else {
        // Clear to empty defaults if document doesn't exist
        setLearningTitle('');
        setLearningSummary('');
        setReportItems([]);
        setDraftStatus('DRAFT');

        lastLoadedContent.current = {
          title: '',
          summary: '',
          items: []
        };
      }
    } catch (err) {
      console.error('Error loading report summary:', err);
      toast.error('Gagal memuat draft ringkasan kelas');
    } finally {
      setIsLoadingDraft(false);
    }
  };

  React.useEffect(() => {
    if (skipNextLoad.current) {
      skipNextLoad.current = false;
      return;
    }

    if (selectedClassId && selectedYear && selectedSemester && selectedMonth) {
      loadDraft();
    } else if (selectedClassIds.length !== 1) {
      // Clear form only when transitioning to 0 selected classes
      if (selectedClassIds.length === 0) {
        setLearningTitle('');
        setLearningSummary('');
        setReportItems([]);
        setDraftStatus('DRAFT');
        lastLoadedContent.current = {
          title: '',
          summary: '',
          items: []
        };
      }
    }
  }, [selectedClassId, selectedClassIds, selectedYear, selectedSemester, selectedMonth]);

  // Run Pre-flight Check
  const runPreflightCheck = async (): Promise<PreflightResult[]> => {
    const academicYearNormalized = selectedYear.replace(/\//g, '-');
    const results: PreflightResult[] = [];

    for (const classId of selectedClassIds) {
      const clsObj = classesList.find(c => c.id === classId);
      const className = clsObj?.name || classId;
      const docId = `JUNIOR_HIGH_MONTHLY_PROGRESS_${classId}_${academicYearNormalized}_${selectedSemester}_${selectedMonth}`;
      
      const docRef = doc(db, 'class_report_summaries', docId);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        results.push({
          classId,
          className,
          classification: PreflightClassStatus.NEW
        });
      } else {
        const data = docSnap.data() as ClassReportSummary;
        const hasLearningJourney = !!(data.sections?.learningJourney?.title || data.sections?.learningJourney?.summary);
        const hasItems = !!(data.sections?.weeklyLessonsAndUnitActivities && data.sections?.weeklyLessonsAndUnitActivities.length > 0);
        
        const isReadyOrLocked = data.status === 'READY';
        
        if (isReadyOrLocked) {
          results.push({
            classId,
            className,
            classification: PreflightClassStatus.READY_OR_LOCKED,
            existingDoc: data,
            statusLabel: data.status
          });
        } else if (!hasLearningJourney && !hasItems) {
          results.push({
            classId,
            className,
            classification: PreflightClassStatus.EMPTY_DRAFT,
            existingDoc: data
          });
        } else {
          results.push({
            classId,
            className,
            classification: PreflightClassStatus.FILLED_DRAFT,
            existingDoc: data
          });
        }
      }
    }
    return results;
  };

  // Initiate Save draft check
  const handleInitiateSaveDraft = async () => {
    if (selectedClassIds.length === 0) {
      toast.error('Harap pilih setidaknya satu kelas target');
      return;
    }

    setIsPrechecking(true);
    try {
      const results = await runPreflightCheck();
      setPreflightData(results);

      const hasFilled = results.some(r => r.classification === PreflightClassStatus.FILLED_DRAFT);
      
      if (hasFilled) {
        setOverwriteOption('SKIP'); // default option
        setShowConflictModal(true);
      } else {
        setShowPreflightConfirmModal(true);
      }
    } catch (err) {
      console.error('Pre-flight check failed:', err);
      toast.error('Gagal melakukan pemeriksaan pra-simpan');
    } finally {
      setIsPrechecking(false);
    }
  };

  // Execute Save Draft
  const executeSaveDraft = async (option: 'SKIP' | 'OVERWRITE') => {
    setIsSaving(true);
    setShowPreflightConfirmModal(false);
    setShowConflictModal(false);
    setShowSecondOverwriteConfirm(false);

    const saved: string[] = [];
    const skipped: string[] = [];
    const locked: string[] = [];
    const failed: { name: string; reason: string }[] = [];

    const periodLabel = getIndonesianMonthLabel(selectedMonth);
    const academicYearNormalized = selectedYear.replace(/\//g, '-');

    const finalizedItems = reportItems.map((item, idx) => ({
      id: item.id || `item_${Date.now()}_${idx}`,
      order: idx,
      category: item.category,
      title: item.title,
      summary: item.summary
    }));

    for (const result of preflightData) {
      const { classId, className, classification, existingDoc } = result;

      if (classification === PreflightClassStatus.READY_OR_LOCKED) {
        locked.push(className);
        continue;
      }

      if (option === 'SKIP' && classification === PreflightClassStatus.FILLED_DRAFT) {
        skipped.push(className);
        continue;
      }

      try {
        const docId = `JUNIOR_HIGH_MONTHLY_PROGRESS_${classId}_${academicYearNormalized}_${selectedSemester}_${selectedMonth}`;
        const docRef = doc(db, 'class_report_summaries', docId);

        const payload: ClassReportSummary = {
          unit: 'JUNIOR_HIGH',
          reportType: 'MONTHLY_PROGRESS',
          classId,
          academicYear: selectedYear,
          semester: selectedSemester,
          periodKey: selectedMonth,
          periodLabel,
          sections: {
            learningJourney: {
              title: learningTitle,
              summary: learningSummary
            },
            weeklyLessonsAndUnitActivities: finalizedItems
          },
          status: 'DRAFT',
          createdBy: existingDoc?.createdBy || profile?.email || 'unknown',
          createdAt: existingDoc?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          
          // Audit tracking metadata
          batchAppliedAt: new Date().toISOString(),
          batchAppliedByUid: profile?.uid || 'unknown',
          batchAppliedByName: profile?.displayName || 'unknown',
          batchAppliedByEmail: profile?.email || 'unknown',
          batchOperationId: `batch_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
        } as any;

        await setDoc(docRef, payload);
        saved.push(className);
      } catch (err: any) {
        console.error(`Failed to save draft for class ${className}:`, err);
        failed.push({
          name: className,
          reason: err.message || 'Error Firestore'
        });
      }
    }

    setSaveSummary({ saved, skipped, locked, failed });
    setShowSaveResultModal(true);
    setIsSaving(false);

    // Update local state if single class is updated
    if (selectedClassIds.length === 1 && saved.length === 1) {
      setDraftStatus('DRAFT');
      setReportItems(finalizedItems);
      lastLoadedContent.current = {
        title: learningTitle,
        summary: learningSummary,
        items: finalizedItems
      };
    } else {
      lastLoadedContent.current = {
        title: learningTitle,
        summary: learningSummary,
        items: finalizedItems
      };
    }
  };

  // Initiate validation check for "Tandai Siap untuk Rapor"
  const handleInitiateReadyCheck = async () => {
    if (selectedClassIds.length === 0) {
      toast.error('Harap pilih setidaknya satu kelas target');
      return;
    }

    setIsValidatingReady(true);
    try {
      const academicYearNormalized = selectedYear.replace(/\//g, '-');
      const validationList: ReadyValidationResult[] = [];

      for (const classId of selectedClassIds) {
        const clsObj = classesList.find(c => c.id === classId);
        const className = clsObj?.name || classId;
        const docId = `JUNIOR_HIGH_MONTHLY_PROGRESS_${classId}_${academicYearNormalized}_${selectedSemester}_${selectedMonth}`;
        
        const docRef = doc(db, 'class_report_summaries', docId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          validationList.push({
            classId,
            className,
            eligible: false,
            reason: 'Draft belum disimpan.'
          });
        } else {
          const data = docSnap.data() as ClassReportSummary;
          
          if (data.status === 'READY') {
            validationList.push({
              classId,
              className,
              eligible: false,
              reason: 'Sudah berstatus SIAP.',
              existingDoc: data
            });
            continue;
          }
          
          const hasTitle = !!data.sections?.learningJourney?.title;
          const hasSummary = !!data.sections?.learningJourney?.summary;
          const hasItems = !!(data.sections?.weeklyLessonsAndUnitActivities && data.sections?.weeklyLessonsAndUnitActivities.length > 0);
          const itemsValid = hasItems && !data.sections.weeklyLessonsAndUnitActivities.some(i => !i.title || !i.summary);

          if (!hasTitle || !hasSummary) {
            validationList.push({
              classId,
              className,
              eligible: false,
              reason: 'Judul/ringkasan Learning Journey kosong.',
              existingDoc: data
            });
          } else if (!hasItems) {
            validationList.push({
              classId,
              className,
              eligible: false,
              reason: 'Belum memiliki Weekly Lesson / Unit Activity.',
              existingDoc: data
            });
          } else if (!itemsValid) {
            validationList.push({
              classId,
              className,
              eligible: false,
              reason: 'Terdapat judul/isi aktivitas kosong.',
              existingDoc: data
            });
          } else {
            validationList.push({
              classId,
              className,
              eligible: true,
              existingDoc: data
            });
          }
        }
      }

      setReadyValidationData(validationList);
      setShowReadyConfirmModal(true);
    } catch (err) {
      console.error('Error validating readiness:', err);
      toast.error('Gagal melakukan pemeriksaan kesiapan rapor');
    } finally {
      setIsValidatingReady(false);
    }
  };

  // Execute Mark Ready
  const executeMarkReady = async () => {
    setIsSaving(true);
    setShowReadyConfirmModal(false);

    const marked: string[] = [];
    const skipped: string[] = [];
    const failed: { name: string; reason: string }[] = [];

    const academicYearNormalized = selectedYear.replace(/\//g, '-');

    for (const item of readyValidationData) {
      const { classId, className, eligible, existingDoc, reason } = item;

      if (!eligible) {
        skipped.push(`${className} (${reason})`);
        continue;
      }

      try {
        const docId = `JUNIOR_HIGH_MONTHLY_PROGRESS_${classId}_${academicYearNormalized}_${selectedSemester}_${selectedMonth}`;
        const docRef = doc(db, 'class_report_summaries', docId);

        if (!existingDoc) {
          skipped.push(`${className} (Draft tidak ditemukan)`);
          continue;
        }

        const payload: ClassReportSummary = {
          ...existingDoc,
          status: 'READY',
          updatedAt: new Date().toISOString()
        };

        await setDoc(docRef, payload);
        marked.push(className);
      } catch (err: any) {
        console.error(`Failed to mark ready for ${className}:`, err);
        failed.push({
          name: className,
          reason: err.message || 'Error Firestore'
        });
      }
    }

    setReadySummary({ marked, skipped, failed });
    setShowReadyResultModal(true);
    setIsSaving(false);

    if (selectedClassIds.length === 1 && marked.length === 1) {
      setDraftStatus('READY');
    }
  };

  // Copy/Apply content action handler
  const handleCopyFromClass = async (fromClassId: string) => {
    if (!fromClassId) return;
    const academicYearNormalized = selectedYear.replace(/\//g, '-');
    const docId = `JUNIOR_HIGH_MONTHLY_PROGRESS_${fromClassId}_${academicYearNormalized}_${selectedSemester}_${selectedMonth}`;
    
    setIsLoadingDraft(true);
    try {
      const docRef = doc(db, 'class_report_summaries', docId);
      const docSnap = await getDoc(docRef);
      const clsName = classesList.find(c => c.id === fromClassId)?.name || fromClassId;

      if (docSnap.exists()) {
        const data = docSnap.data() as ClassReportSummary;
        const fetchedTitle = data.sections?.learningJourney?.title || '';
        const fetchedSummary = data.sections?.learningJourney?.summary || '';
        
        const sortedItems = [...(data.sections?.weeklyLessonsAndUnitActivities || [])]
          .sort((a, b) => a.order - b.order)
          .map((item, idx) => ({
            ...item,
            order: item.order ?? idx
          }));

        setLearningTitle(fetchedTitle);
        setLearningSummary(fetchedSummary);
        setReportItems(sortedItems);
        setDraftStatus('DRAFT');

        // Reset memory loaded reference so it is marked dirty for current save targets
        lastLoadedContent.current = {
          title: '',
          summary: '',
          items: []
        };
        
        toast.success(`Berhasil menyalin konten dari kelas ${clsName}`);
      } else {
        toast.error(`Kelas ${clsName} belum memiliki draft ringkasan disimpan.`);
      }
    } catch (err) {
      console.error('Error copying class draft:', err);
      toast.error('Gagal menyalin draft kelas');
    } finally {
      setIsLoadingDraft(false);
      setShowCopyFromModal(false);
    }
  };

  // Add Item to list
  const handleAddItem = (category: 'WEEKLY_LESSON' | 'UNIT_ACTIVITY') => {
    const newItem: ReportItem = {
      id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      order: reportItems.length,
      category,
      title: '',
      summary: ''
    };
    setReportItems([...reportItems, newItem]);
    toast.success(`${category === 'WEEKLY_LESSON' ? 'Weekly Lesson' : 'Unit Activity'} ditambahkan`);
  };

  // Remove Item
  const handleRemoveItem = (id: string) => {
    const filtered = reportItems.filter(item => item.id !== id);
    const reordered = filtered.map((item, index) => ({
      ...item,
      order: index
    }));
    setReportItems(reordered);
  };

  // Move Item Up or Down
  const handleMoveItem = (index: number, direction: 'UP' | 'DOWN') => {
    if (direction === 'UP' && index === 0) return;
    if (direction === 'DOWN' && index === reportItems.length - 1) return;

    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    const updated = [...reportItems];
    
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;

    const reordered = updated.map((item, idx) => ({
      ...item,
      order: idx
    }));

    setReportItems(reordered);
  };

  // Handle Item Input changes
  const handleItemChange = (id: string, field: 'title' | 'summary' | 'category', value: string) => {
    const updated = reportItems.map(item => {
      if (item.id === id) {
        return { ...item, [field]: value };
      }
      return item;
    });
    setReportItems(updated);
  };

  // Toggle All authorized classes
  const isAllSelected = classesList.length > 0 && selectedClassIds.length === classesList.length;
  
  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      processSelectionChange([]);
    } else {
      processSelectionChange(classesList.map(c => c.id));
    }
  };

  const handleClearSelection = () => {
    processSelectionChange([]);
  };

  // Search filtered classes
  const filteredClassesList = classesList.filter(c => 
    c.name.toLowerCase().includes(classSearchTerm.toLowerCase())
  );

  const selectedClassNames = selectedClassIds
    .map(id => classesList.find(c => c.id === id)?.name)
    .filter(Boolean) as string[];

  return (
    <div id="monthly-report-summary-page" className="min-h-screen bg-slate-50/50 p-6">
      
      {/* Header Area */}
      <div className="mx-auto max-w-6xl mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#002366]/10 text-[#002366] border border-[#002366]/20">
                JUNIOR HIGH ONLY
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <FileText className="text-[#002366]" size={26} />
              Workspace Rapor Bulanan Kelas (Summary)
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Kelola ringkasan pembelajaran kelas dan aktivitas unit bulanan yang akan diterapkan ke seluruh siswa kelas terpilih.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-center">
            {selectedClassIds.length > 1 && (
              <button
                onClick={() => setShowCopyFromModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                title="Salin isi dari draft kelas lain"
              >
                <Copy size={15} />
                Salin dari Kelas Lain
              </button>
            )}

            <button
              onClick={loadDraft}
              disabled={isLoadingDraft || isSaving || selectedClassIds.length !== 1}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
              title="Memuat ulang data kelas dari database (Hanya aktif untuk mode 1 kelas)"
            >
              <RefreshCw size={15} className={isLoadingDraft ? 'animate-spin' : ''} />
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

          {/* Searchable Multi-Select Dropdown Component */}
          <div className="relative" ref={dropdownRef}>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center justify-between gap-1">
              <span className="flex items-center gap-1">
                <Users size={13} className="text-[#002366]" /> Kelas Target
              </span>
              {selectedClassIds.length > 0 && (
                <span className="text-[10px] font-bold text-[#002366] px-1.5 py-0.2 bg-blue-50 border border-blue-200 rounded">
                  {selectedClassIds.length} dipilih
                </span>
              )}
            </label>

            {loadingClasses ? (
              <div className="h-10 flex items-center px-3 bg-slate-50 rounded-lg text-xs text-slate-400">
                <RefreshCw size={14} className="animate-spin mr-2 text-slate-400" />
                Memuat kelas...
              </div>
            ) : (
              <div>
                <button
                  type="button"
                  onClick={() => setIsClassDropdownOpen(!isClassDropdownOpen)}
                  className="w-full text-left flex items-center justify-between px-3 py-2 text-sm bg-slate-50/50 border border-slate-200 rounded-lg focus:border-[#002366] focus:ring-1 focus:ring-[#002366] font-medium text-slate-700 min-h-10"
                >
                  <span className="truncate">
                    {selectedClassIds.length === 0 
                      ? "-- Pilih Kelas Target --" 
                      : selectedClassIds.length === 1 
                        ? classesList.find(c => c.id === selectedClassIds[0])?.name || "1 Kelas Terpilih"
                        : `${selectedClassIds.length} Kelas Terpilih`
                    }
                  </span>
                  <ChevronDown size={16} className={`text-slate-400 transition-transform duration-200 ${isClassDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Popover */}
                <AnimatePresence>
                  {isClassDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 5 }}
                      className="absolute z-50 w-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden flex flex-col max-h-[340px]"
                    >
                      {/* Search & Actions Bar */}
                      <div className="p-2 border-b border-slate-100 bg-slate-50/50 flex flex-col gap-2">
                        <div className="relative">
                          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                          <input
                            type="text"
                            value={classSearchTerm}
                            onChange={(e) => setClassSearchTerm(e.target.value)}
                            placeholder="Cari kelas..."
                            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md focus:border-[#002366] focus:ring-[#002366]"
                          />
                        </div>

                        <div className="flex items-center justify-between text-[11px] font-bold px-1">
                          <button
                            type="button"
                            onClick={handleToggleSelectAll}
                            className="text-[#002366] hover:underline flex items-center gap-1"
                          >
                            {isAllSelected ? 'Batal Pilih Semua' : 'Pilih Semua Kelas'}
                          </button>
                          {selectedClassIds.length > 0 && (
                            <button
                              type="button"
                              onClick={handleClearSelection}
                              className="text-rose-500 hover:underline"
                            >
                              Hapus Pilihan
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Items List */}
                      <div className="overflow-y-auto py-1 flex-1 max-h-[200px]">
                        {filteredClassesList.length === 0 ? (
                          <div className="py-4 px-3 text-center text-xs text-slate-400">
                            Tidak ada kelas ditemukan
                          </div>
                        ) : (
                          filteredClassesList.map(c => {
                            const isChecked = selectedClassIds.includes(c.id);
                            return (
                              <button
                                type="button"
                                key={c.id}
                                onClick={() => handleToggleClass(c.id)}
                                className="w-full text-left px-3 py-2 text-xs flex items-center gap-2.5 hover:bg-slate-50 transition-colors"
                              >
                                {isChecked ? (
                                  <CheckSquare size={15} className="text-[#002366] shrink-0" />
                                ) : (
                                  <Square size={15} className="text-slate-300 shrink-0" />
                                )}
                                <span className={`font-medium ${isChecked ? 'text-slate-900 font-bold' : 'text-slate-600'}`}>
                                  {c.name}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

        </div>

        {/* Display removable selected chips */}
        {selectedClassIds.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-slate-100">
            {selectedClassIds.map(id => {
              const cls = classesList.find(c => c.id === id);
              if (!cls) return null;
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-[#002366] border border-blue-100 hover:bg-blue-100 transition-colors"
                >
                  {cls.name}
                  <button
                    type="button"
                    onClick={() => handleToggleClass(id)}
                    className="hover:bg-blue-200 text-blue-900 rounded-full p-0.5 transition-colors font-bold shrink-0 text-[10px] w-4 h-4 inline-flex items-center justify-center"
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {!loadingClasses && classesList.length === 0 && (
          <div className="mt-4 p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0" />
            <span>Tidak ada kelas aktif dengan siswa terdaftar pada konteks ini.</span>
          </div>
        )}

        {/* Selected Summary Metadata */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-4 pt-4 border-t border-slate-100 text-xs text-slate-500">
          <div>
            Kelas Target:{' '}
            {selectedClassIds.length === 0 ? (
              <span className="text-rose-500 font-semibold">Belum ada kelas terpilih</span>
            ) : selectedClassIds.length > 3 ? (
              <span>
                <strong className="text-slate-800">{selectedClassIds.length} kelas dipilih</strong>
                <button
                  type="button"
                  onClick={() => setIsClassesListExpanded(!isClassesListExpanded)}
                  className="ml-2 text-xs text-[#002366] hover:underline font-bold"
                >
                  {isClassesListExpanded ? 'Sembunyikan' : 'Lihat Semua'}
                </button>
                {isClassesListExpanded && (
                  <div className="mt-1.5 p-2 bg-slate-50 border border-slate-100 rounded-lg max-h-32 overflow-y-auto font-medium text-slate-700">
                    {selectedClassNames.join(', ')}
                  </div>
                )}
              </span>
            ) : (
              <strong className="text-slate-800">{selectedClassNames.join(', ')}</strong>
            )}
          </div>
          <div>
            Periode: <strong className="text-slate-800">{selectedMonth ? getIndonesianMonthLabel(selectedMonth) : '-'}</strong>
          </div>
          <div>
            Tahun Ajaran/Sem: <strong className="text-slate-800">{selectedYear} (Semester {selectedSemester})</strong>
          </div>
          
          <div className="ml-auto flex items-center gap-1.5">
            <span>Status Draft:</span>
            {selectedClassIds.length > 1 ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                MULTI-CLASS MODE
              </span>
            ) : draftStatus === 'READY' ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Check size={12} /> SIAP UNTUK RAPOR
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                DRAFT
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Mode multi-class notice banner */}
      {selectedClassIds.length > 1 && (
        <div className="mx-auto max-w-6xl mb-6 p-4 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center gap-2.5">
          <Info size={16} className="text-amber-700 shrink-0" />
          <div className="font-semibold">
            Mode multi-kelas aktif: isi di bawah akan diterapkan ke {selectedClassIds.length} kelas target saat Anda menyimpan draft. 
            Masing-masing kelas target akan mempertahankan data drafnya secara independen.
          </div>
        </div>
      )}

      {/* Main Workspace */}
      <div className="mx-auto max-w-6xl">
        {isLoadingDraft ? (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-12 text-center flex flex-col items-center justify-center">
            <RefreshCw size={32} className="animate-spin text-[#002366] mb-3" />
            <p className="text-slate-600 font-medium">Memuat data dari database...</p>
            <p className="text-xs text-slate-400 mt-1">Harap tunggu sebentar</p>
          </div>
        ) : (
          <div className="space-y-6">
            
            {/* 1. Learning Journey Card */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-4 flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-[#002366]/5 text-[#002366]">
                  <BookOpen size={18} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800">1. Learning Journey (Perjalanan Pembelajaran)</h2>
                  <p className="text-xs text-slate-500">Judul utama dan ringkasan aktivitas akademik/proyek sepanjang bulan ini.</p>
                </div>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Judul Perjalanan Pembelajaran <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={learningTitle}
                    onChange={(e) => setLearningTitle(e.target.value)}
                    placeholder="Contoh: Eksplorasi Sains & Desain Kreatif"
                    className="w-full rounded-lg border-slate-200 focus:border-[#002366] focus:ring-[#002366] text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Ringkasan Narasi <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    value={learningSummary}
                    onChange={(e) => setLearningSummary(e.target.value)}
                    rows={4}
                    placeholder="Berikan gambaran lengkap petualangan belajar kelas di bulan ini..."
                    className="w-full rounded-lg border-slate-200 focus:border-[#002366] focus:ring-[#002366] text-sm"
                  />
                </div>
              </div>
            </div>

            {/* 2. Weekly Lessons & Unit Activity Card */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-[#002366]/5 text-[#002366]">
                    <Layers size={18} />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-800">2. Weekly Lessons & Unit Activity (Pembelajaran & Unit Aktivitas)</h2>
                    <p className="text-xs text-slate-500">Kelola dan urutkan aktivitas mingguan atau program khusus kelas.</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    onClick={() => handleAddItem('WEEKLY_LESSON')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#002366] text-xs font-semibold border border-blue-200 transition-colors"
                  >
                    <Plus size={14} /> + Lesson
                  </button>
                  <button
                    onClick={() => handleAddItem('UNIT_ACTIVITY')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-semibold border border-purple-200 transition-colors"
                  >
                    <Plus size={14} /> + Unit Activity
                  </button>
                </div>
              </div>

              <div className="p-5">
                {reportItems.length === 0 ? (
                  <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center bg-slate-50/30">
                    <Info size={28} className="mx-auto text-slate-400 mb-2" />
                    <p className="text-sm font-semibold text-slate-600">Belum ada item ditambahkan</p>
                    <p className="text-xs text-slate-400 mt-1 mb-4">Tambahkan setidaknya satu item Weekly Lesson atau Unit Activity menggunakan tombol di kanan atas.</p>
                    <div className="flex items-center justify-center gap-3">
                      <button
                        onClick={() => handleAddItem('WEEKLY_LESSON')}
                        className="flex items-center gap-1 px-4 py-2 rounded-lg bg-[#002366] text-white text-xs font-semibold hover:bg-[#002366]/90 transition-all"
                      >
                        <Plus size={14} /> Tambah Weekly Lesson
                      </button>
                      <button
                        onClick={() => handleAddItem('UNIT_ACTIVITY')}
                        className="flex items-center gap-1 px-4 py-2 rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 transition-all"
                      >
                        <Plus size={14} /> Tambah Unit Activity
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <AnimatePresence initial={false}>
                      {reportItems.map((item, index) => (
                        <motion.div
                          key={item.id}
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.18 }}
                          className={`border rounded-xl shadow-xs overflow-hidden transition-all ${
                            item.category === 'WEEKLY_LESSON' ? 'border-blue-100' : 'border-purple-100'
                          }`}
                        >
                          {/* Item Header Control panel */}
                          <div className={`px-4 py-2.5 flex items-center justify-between border-b ${
                            item.category === 'WEEKLY_LESSON' ? 'bg-blue-50/40 border-blue-100' : 'bg-purple-50/30 border-purple-100'
                          }`}>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-400">#{index + 1}</span>
                              {item.category === 'WEEKLY_LESSON' ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                                  WEEKLY LESSON
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                                  UNIT ACTIVITY
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5">
                              {/* Reordering actions */}
                              <button
                                onClick={() => handleMoveItem(index, 'UP')}
                                disabled={index === 0}
                                className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 transition-colors"
                                title="Pindahkan ke atas"
                              >
                                <ChevronUp size={16} />
                              </button>
                              <button
                                onClick={() => handleMoveItem(index, 'DOWN')}
                                disabled={index === reportItems.length - 1}
                                className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 transition-colors"
                                title="Pindahkan ke bawah"
                              >
                                <ChevronDown size={16} />
                              </button>
                              <div className="w-px h-4 bg-slate-200 mx-1" />
                              <button
                                onClick={() => handleRemoveItem(item.id)}
                                className="p-1 rounded-md text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                                title="Hapus item"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>

                          {/* Item Inputs */}
                          <div className="p-4 bg-white grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="md:col-span-1">
                              <label className="block text-xs font-semibold text-slate-600 mb-1">
                                Kategori
                              </label>
                              <select
                                value={item.category}
                                onChange={(e) => handleItemChange(item.id, 'category', e.target.value as any)}
                                className="w-full text-xs rounded-lg border-slate-200 focus:border-[#002366] focus:ring-[#002366] py-1.5 bg-slate-50/50"
                              >
                                <option value="WEEKLY_LESSON">Weekly Lesson</option>
                                <option value="UNIT_ACTIVITY">Unit Activity</option>
                              </select>

                              <div className="mt-3">
                                <label className="block text-xs font-semibold text-slate-600 mb-1">
                                  Judul Aktivitas <span className="text-rose-500">*</span>
                                </label>
                                <input
                                  type="text"
                                  value={item.title}
                                  onChange={(e) => handleItemChange(item.id, 'title', e.target.value)}
                                  placeholder="Contoh: Minggu 1: Introduction"
                                  className="w-full text-xs rounded-lg border-slate-200 focus:border-[#002366] focus:ring-[#002366] py-1.5"
                                />
                              </div>
                            </div>

                            <div className="md:col-span-2">
                              <label className="block text-xs font-semibold text-slate-600 mb-1">
                                Ringkasan Pembelajaran / Aktivitas <span className="text-rose-500">*</span>
                              </label>
                              <textarea
                                value={item.summary}
                                onChange={(e) => handleItemChange(item.id, 'summary', e.target.value)}
                                rows={4}
                                placeholder="Tuliskan ringkasan detail aktivitas yang dilakukan pada minggu atau unit ini..."
                                className="w-full text-xs rounded-lg border-slate-200 focus:border-[#002366] focus:ring-[#002366]"
                              />
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Actions Area */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-xs p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <AlertCircle size={15} className="text-[#002366]" />
                <span>Harap simpan draft secara berkala. Perubahan belum tersimpan sampai Anda menekan tombol simpan.</span>
              </div>

              <div className="flex items-center gap-3 justify-end">
                <button
                  type="button"
                  onClick={handleInitiateSaveDraft}
                  disabled={isSaving || isLoadingDraft || selectedClassIds.length === 0}
                  className="flex items-center gap-1.5 px-6 py-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 transition-all disabled:opacity-50"
                >
                  <Save size={16} />
                  {isSaving ? 'Menyimpan...' : 'Simpan Draft'}
                </button>

                <button
                  type="button"
                  onClick={handleInitiateReadyCheck}
                  disabled={isSaving || isLoadingDraft || selectedClassIds.length === 0 || !learningTitle || reportItems.some(i => !i.title)}
                  className="flex items-center gap-1.5 px-6 py-2.5 rounded-lg bg-[#002366] hover:bg-[#002366]/90 text-white text-sm font-semibold shadow-sm transition-all disabled:opacity-50"
                  title={(!learningTitle || reportItems.some(i => !i.title)) ? "Lengkapi judul Learning Journey & judul semua item untuk menandai siap." : ""}
                >
                  <CheckCircle2 size={16} />
                  {isSaving ? 'Menyimpan...' : 'Tandai Siap untuk Rapor'}
                </button>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* --- ALL FLOW MODALS --- */}

      {/* 1. Modal: Confirm Transition Switch */}
      <AnimatePresence>
        {showConfirmSwitchModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={handleCancelSwitch} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-md w-full shadow-xl relative z-10 overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <AlertCircle className="text-amber-500" size={20} />
                  Perubahan Belum Tersimpan
                </h3>
                <p className="text-sm text-slate-500 mt-2">
                  Anda memiliki draf yang diedit di dalam editor. Memilih satu kelas akan mengganti isi editor dengan draft tersimpan kelas tersebut.
                </p>
              </div>
              <div className="p-6 bg-slate-50/50 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleKeepCurrentContent}
                  className="w-full text-left p-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 transition-colors text-xs text-slate-700 font-semibold"
                >
                  <span className="block text-slate-900 font-bold">Tetap gunakan isi saat ini</span>
                  Gunakan konten editor saat ini untuk kelas target yang baru.
                </button>
                <button
                  type="button"
                  onClick={handleLoadClassDraft}
                  className="w-full text-left p-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 transition-colors text-xs text-slate-700 font-semibold"
                >
                  <span className="block text-slate-900 font-bold">Muat draft kelas</span>
                  Buang isi editor saat ini dan muat draft tersimpan kelas terpilih.
                </button>
              </div>
              <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={handleCancelSwitch}
                  className="px-4 py-2 text-sm text-slate-500 hover:text-slate-800 font-medium"
                >
                  Batal
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 2. Modal: Preflight Simple Confirmation (No Conflict) */}
      <AnimatePresence>
        {showPreflightConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setShowPreflightConfirmModal(false)} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-lg w-full shadow-xl relative z-10 overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100">
                <h3 className="text-lg font-bold text-slate-900">
                  Konfirmasi Simpan Draft
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  Konten summary ini akan disimpan ke kelas target berikut:
                </p>
              </div>
              <div className="p-6 max-h-[220px] overflow-y-auto space-y-2 bg-slate-50/50">
                {preflightData.map(r => (
                  <div key={r.classId} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 bg-white">
                    <span className="text-xs font-semibold text-slate-800">{r.className}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                      Draft Baru / Kosong
                    </span>
                  </div>
                ))}
              </div>
              <div className="p-6 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowPreflightConfirmModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 font-medium"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => executeSaveDraft('OVERWRITE')}
                  className="px-5 py-2.5 bg-[#002366] hover:bg-[#002366]/90 text-white rounded-lg text-sm font-semibold"
                >
                  Simpan Draft
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 3. Modal: Conflict Overwrite Dialog */}
      <AnimatePresence>
        {showConflictModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setShowConflictModal(false)} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-lg w-full shadow-xl relative z-10 overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 bg-amber-50/30">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <AlertCircle className="text-amber-500" size={20} />
                  Deteksi Konflik Draf Berisi
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  Beberapa kelas target sudah memiliki draft berisi dari pengeditan sebelumnya.
                </p>
              </div>

              <div className="p-6 max-h-[250px] overflow-y-auto space-y-3 bg-slate-50/50">
                {/* Locked / Ready status cannot be overwritten */}
                {preflightData.some(r => r.classification === PreflightClassStatus.READY_OR_LOCKED) && (
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                      Tidak Dapat Diperbarui Melalui Batch (Siap / Terkunci):
                    </span>
                    {preflightData
                      .filter(r => r.classification === PreflightClassStatus.READY_OR_LOCKED)
                      .map(r => (
                        <div key={r.classId} className="flex items-center justify-between p-2 rounded-lg border border-red-100 bg-red-50/30 text-xs">
                          <span className="font-semibold text-slate-800">{r.className}</span>
                          <span className="text-[10px] font-bold text-red-700 px-2 py-0.5 bg-red-100/50 rounded-full">
                            {r.statusLabel || 'SIAP'} (Dilewati)
                          </span>
                        </div>
                      ))}
                  </div>
                )}

                {/* Conflict classes */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                    Sudah Memiliki Isi (Konflik):
                  </span>
                  {preflightData
                    .filter(r => r.classification === PreflightClassStatus.FILLED_DRAFT)
                    .map(r => (
                      <div key={r.classId} className="flex items-center justify-between p-2 rounded-lg border border-amber-100 bg-amber-50/30 text-xs">
                        <span className="font-semibold text-slate-800">{r.className}</span>
                        <span className="text-[10px] font-bold text-amber-700 px-2 py-0.5 bg-amber-100/50 rounded-full">
                          DRAFT BERISI
                        </span>
                      </div>
                    ))}
                </div>

                {/* New / Safe targets */}
                {preflightData.some(r => r.classification === PreflightClassStatus.NEW || r.classification === PreflightClassStatus.EMPTY_DRAFT) && (
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                      Kelas Baru / Kosong (Aman Disimpan):
                    </span>
                    {preflightData
                      .filter(r => r.classification === PreflightClassStatus.NEW || r.classification === PreflightClassStatus.EMPTY_DRAFT)
                      .map(r => (
                        <div key={r.classId} className="flex items-center justify-between p-2 rounded-lg border border-slate-100 bg-white text-xs">
                          <span className="font-semibold text-slate-800">{r.className}</span>
                          <span className="text-[10px] font-bold text-emerald-700 px-2 py-0.5 bg-emerald-50 rounded-full">
                            Aman
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* Selection Choices */}
              <div className="p-6 border-t border-slate-100 space-y-4">
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-600 block">Pilih Tindakan Penyimpanan:</span>
                  
                  <button
                    type="button"
                    onClick={() => setOverwriteOption('SKIP')}
                    className={`w-full text-left p-3 rounded-lg border transition-all text-xs flex items-center justify-between ${
                      overwriteOption === 'SKIP'
                        ? 'border-[#002366] bg-blue-50/30 font-bold text-[#002366]'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    <span>
                      <strong className="block text-slate-800 text-xs mb-0.5">Lewati kelas yang sudah berisi (Rekomendasi)</strong>
                      Hanya simpan draft ke kelas yang kosong/baru.
                    </span>
                    {overwriteOption === 'SKIP' && <Check size={16} className="text-[#002366]" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setOverwriteOption('OVERWRITE')}
                    className={`w-full text-left p-3 rounded-lg border transition-all text-xs flex items-center justify-between ${
                      overwriteOption === 'OVERWRITE'
                        ? 'border-amber-500 bg-amber-50/10 font-bold text-amber-800'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    <span>
                      <strong className="block text-slate-800 text-xs mb-0.5">Timpa draft berisi</strong>
                      Ganti konten draft pada kelas berisi dengan isi editor saat ini.
                    </span>
                    {overwriteOption === 'OVERWRITE' && <Check size={16} className="text-amber-600" />}
                  </button>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowConflictModal(false)}
                    className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 font-medium"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (overwriteOption === 'OVERWRITE') {
                        setShowSecondOverwriteConfirm(true);
                      } else {
                        executeSaveDraft('SKIP');
                      }
                    }}
                    className="px-5 py-2.5 bg-[#002366] hover:bg-[#002366]/90 text-white rounded-lg text-sm font-semibold"
                  >
                    Lanjutkan
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 4. Modal: Second-stage explicit confirmation for overwriting */}
      <AnimatePresence>
        {showSecondOverwriteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs" onClick={() => setShowSecondOverwriteConfirm(false)} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-md w-full shadow-2xl relative z-10 overflow-hidden border border-amber-200"
            >
              <div className="p-6 bg-amber-50 border-b border-amber-200">
                <h3 className="text-lg font-bold text-amber-900 flex items-center gap-2">
                  <AlertCircle size={22} className="text-amber-600" />
                  Konfirmasi Tindakan Bahaya!
                </h3>
                <p className="text-xs text-amber-800 mt-2 font-medium">
                  Tindakan ini akan menimpa dan menghapus data draf kustom pada kelas-kelas target berikut secara permanen:
                </p>
              </div>
              <div className="p-5 max-h-[160px] overflow-y-auto bg-slate-50/50">
                <ul className="list-disc list-inside space-y-1.5 text-xs font-semibold text-slate-700">
                  {preflightData
                    .filter(r => r.classification === PreflightClassStatus.FILLED_DRAFT)
                    .map(r => (
                      <li key={r.classId} className="text-amber-800">{r.className}</li>
                    ))}
                </ul>
              </div>
              <div className="p-5 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowSecondOverwriteConfirm(false)}
                  className="px-4 py-2 text-xs text-slate-500 hover:text-slate-800 font-bold uppercase tracking-wider"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => executeSaveDraft('OVERWRITE')}
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold uppercase tracking-wider"
                >
                  Ya, Timpa Draft Berisi
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 5. Modal: Save Outcome Result Dialog */}
      <AnimatePresence>
        {showSaveResultModal && saveSummary && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setShowSaveResultModal(false)} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-lg w-full shadow-xl relative z-10 overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="text-emerald-500" size={22} />
                  Hasil Penyimpanan Batch
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Penyimpanan selesai. Berikut rincian hasil operasi penyimpanan draf kelas:
                </p>
              </div>

              <div className="p-6 max-h-[280px] overflow-y-auto space-y-3 bg-slate-50/50 text-xs">
                {/* Saved list */}
                {saveSummary.saved.length > 0 && (
                  <div className="space-y-1">
                    <span className="font-bold text-emerald-700 block">Berhasil Disimpan ({saveSummary.saved.length}):</span>
                    <div className="p-2.5 bg-white border border-emerald-100 rounded-lg text-slate-700 font-medium leading-relaxed">
                      {saveSummary.saved.join(', ')}
                    </div>
                  </div>
                )}

                {/* Skipped list */}
                {saveSummary.skipped.length > 0 && (
                  <div className="space-y-1">
                    <span className="font-bold text-amber-700 block">Dilewati/Sudah Berisi ({saveSummary.skipped.length}):</span>
                    <div className="p-2.5 bg-white border border-amber-100 rounded-lg text-slate-600 font-medium leading-relaxed">
                      {saveSummary.skipped.join(', ')}
                    </div>
                  </div>
                )}

                {/* Locked list */}
                {saveSummary.locked.length > 0 && (
                  <div className="space-y-1">
                    <span className="font-bold text-red-700 block">Dilewati karena Siap/Terkunci ({saveSummary.locked.length}):</span>
                    <div className="p-2.5 bg-white border border-red-100 rounded-lg text-slate-500 font-medium leading-relaxed">
                      {saveSummary.locked.join(', ')}
                    </div>
                  </div>
                )}

                {/* Failed list */}
                {saveSummary.failed.length > 0 && (
                  <div className="space-y-1">
                    <span className="font-bold text-rose-700 block">Gagal Disimpan ({saveSummary.failed.length}):</span>
                    <div className="space-y-1">
                      {saveSummary.failed.map((f, i) => (
                        <div key={i} className="p-2 bg-rose-50 border border-rose-100 rounded-md font-semibold text-rose-800">
                          {f.name}: {f.reason}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowSaveResultModal(false)}
                  className="px-5 py-2.5 bg-[#002366] hover:bg-[#002366]/90 text-white text-sm font-semibold rounded-lg shadow-sm"
                >
                  Selesai
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 6. Modal: Ready Check Validations */}
      <AnimatePresence>
        {showReadyConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setShowReadyConfirmModal(false)} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-xl w-full shadow-xl relative z-10 overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="text-[#002366]" size={22} />
                  Kesiapan Rapor Bulanan Kelas
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Hanya draft yang telah disimpan dan memenuhi seluruh syarat kelengkapan konten yang dapat ditandai SIAP.
                </p>
              </div>

              <div className="p-6 max-h-[280px] overflow-y-auto space-y-3 bg-slate-50/50 text-xs">
                {/* Eligible targets */}
                <div className="space-y-1.5">
                  <span className="font-bold text-[#002366] block">Layak Ditandai Siap ({readyValidationData.filter(v => v.eligible).length}):</span>
                  {readyValidationData.filter(v => v.eligible).length === 0 ? (
                    <div className="p-3 bg-white border border-slate-200 rounded-lg text-slate-400 font-semibold text-center">
                      Tidak ada kelas yang siap ditandai siap rapor.
                    </div>
                  ) : (
                    readyValidationData.filter(v => v.eligible).map(v => (
                      <div key={v.classId} className="flex items-center justify-between p-2 rounded-lg border border-emerald-100 bg-white font-semibold text-emerald-800">
                        <span>{v.className}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-50 rounded-full">Memenuhi Syarat</span>
                      </div>
                    ))
                  )}
                </div>

                {/* Ineligible targets */}
                {readyValidationData.some(v => !v.eligible) && (
                  <div className="space-y-1.5">
                    <span className="font-bold text-slate-500 block">Belum Layak / Dilewati ({readyValidationData.filter(v => !v.eligible).length}):</span>
                    {readyValidationData.filter(v => !v.eligible).map(v => (
                      <div key={v.classId} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-white text-slate-700">
                        <span className="font-bold">{v.className}</span>
                        <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-100 max-w-[240px] truncate" title={v.reason}>
                          {v.reason}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowReadyConfirmModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 font-medium"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={executeMarkReady}
                  disabled={readyValidationData.filter(v => v.eligible).length === 0}
                  className="px-5 py-2.5 bg-[#002366] hover:bg-[#002366]/90 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
                >
                  Tandai Siap untuk Rapor
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 7. Modal: Ready Outcome Result Dialog */}
      <AnimatePresence>
        {showReadyResultModal && readySummary && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setShowReadyResultModal(false)} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-lg w-full shadow-xl relative z-10 overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="text-emerald-500" size={22} />
                  Hasil Pembaruan Status Siap
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Berikut detail hasil operasi penandaan SIAP rapor:
                </p>
              </div>

              <div className="p-6 max-h-[280px] overflow-y-auto space-y-3 bg-slate-50/50 text-xs">
                {/* Marked success list */}
                {readySummary.marked.length > 0 && (
                  <div className="space-y-1">
                    <span className="font-bold text-emerald-700 block">Berhasil Diubah Menjadi SIAP ({readySummary.marked.length}):</span>
                    <div className="p-2.5 bg-white border border-emerald-100 rounded-lg text-slate-700 font-medium leading-relaxed">
                      {readySummary.marked.join(', ')}
                    </div>
                  </div>
                )}

                {/* Skipped list */}
                {readySummary.skipped.length > 0 && (
                  <div className="space-y-1">
                    <span className="font-bold text-slate-500 block">Dilewati / Tidak Memenuhi Syarat ({readySummary.skipped.length}):</span>
                    <div className="p-2.5 bg-white border border-slate-200 rounded-lg text-slate-600 font-medium leading-relaxed max-h-32 overflow-y-auto">
                      {readySummary.skipped.join(', ')}
                    </div>
                  </div>
                )}

                {/* Failed list */}
                {readySummary.failed.length > 0 && (
                  <div className="space-y-1">
                    <span className="font-bold text-rose-700 block">Gagal Operasi ({readySummary.failed.length}):</span>
                    <div className="space-y-1">
                      {readySummary.failed.map((f, i) => (
                        <div key={i} className="p-2 bg-rose-50 border border-rose-100 rounded-md font-semibold text-rose-800">
                          {f.name}: {f.reason}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowReadyResultModal(false)}
                  className="px-5 py-2.5 bg-[#002366] hover:bg-[#002366]/90 text-white text-sm font-semibold rounded-lg shadow-sm"
                >
                  Selesai
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 8. Modal: Safe Copy From Class */}
      <AnimatePresence>
        {showCopyFromModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setShowCopyFromModal(false)} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-md w-full shadow-xl relative z-10 overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Copy size={20} className="text-[#002366]" />
                  Salin Draft Kelas Lain
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Gunakan konten draf yang sudah disimpan di kelas lain sebagai basis awal pengerjaan untuk multi-kelas ini.
                </p>
              </div>

              <div className="p-6 bg-slate-50/50 space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Pilih Kelas Sumber Konten:
                  </label>
                  <select
                    value={copyClassId}
                    onChange={(e) => setCopyClassId(e.target.value)}
                    className="w-full text-sm rounded-lg border-slate-200 focus:border-[#002366] focus:ring-[#002366] py-2 bg-white font-medium"
                  >
                    <option value="">-- Pilih Kelas Sumber --</option>
                    {classesList.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCopyFromModal(false)}
                  className="px-4 py-2 text-sm text-slate-500 hover:text-slate-800 font-medium"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => handleCopyFromClass(copyClassId)}
                  disabled={!copyClassId}
                  className="px-5 py-2.5 bg-[#002366] hover:bg-[#002366]/90 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
                >
                  Salin Konten
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
