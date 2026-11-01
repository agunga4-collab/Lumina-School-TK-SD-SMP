import { SELTemplateConfigModal } from './SELTemplateConfigModal';
import { SELRubricEditor } from './SELRubricEditor';
import { selSourceFingerprint } from '../../../../lib/elementaryMonthlySELBank';
import * as React from 'react';
import { 
  MessageSquare, Sparkles, Save, Send, CheckCircle2, 
  AlertCircle, RefreshCw, Users, Check, X, Lock, 
  Unlock, ShieldCheck, Clock, Upload, Heart, BookOpen, 
  PenLine, AlertTriangle
} from 'lucide-react';
import type { 
  ElementaryMonthlyCurriculumDoc,
  ElementaryMonthlyStudentScoreDoc,
  ElementaryMonthlyStudentNarrativeDoc,
  ElementaryMonthlyReviewStatus,
  ElementaryMonthlyAcademicSource,
  ElementaryMonthlySelSource,
  ElementaryMonthlySelAspectSelection
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
  refineElementaryMonthlyNarrativeAI
} from '../../../../services/elementaryMonthlyReportService';
import {
  getOfficialElementaryLowerGrade,
  assembleDeterministicAcademicNarrative
} from '../../../../lib/elementaryMonthlySELBank';
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

type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error';

// In-memory recovery keeps unsaved drafts separated by account, class, period and student.
// Nothing is auto-written when navigating away or stored as school data until Save succeeds.
const pendingNarrativeDrafts = new Map<string, any>();
export const NarrativeAndApprovalTab: React.FC<NarrativeAndApprovalTabProps> = props => {
  const contextKey = JSON.stringify([props.currentUser?.uid, props.selectedClass?.id, props.selectedYear, props.selectedSemester, props.selectedMonth]);
  return <NarrativeAndApprovalTabInner key={contextKey} {...props} />;
};
const NarrativeAndApprovalTabInner: React.FC<NarrativeAndApprovalTabProps> = ({
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
  const [showSELConfig, setShowSELConfig] = React.useState(false);
  const classId = selectedClass?.id || '';
  const contextKey = JSON.stringify([currentUser?.uid, classId, selectedYear, selectedSemester, selectedMonth]);
  const draftKey = (studentId: string) => `${contextKey}:${studentId}`;
  const alive = React.useRef(true);
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const saveInFlight = React.useRef<Promise<void> | null>(null);
  const loadGeneration = React.useRef(0);
  const [loadError, setLoadError] = React.useState('');
  const [selMetadata, setSelMetadata] = React.useState<ElementaryMonthlySelSource>({});
  const [formRevision, setFormRevision] = React.useState(0);
  const canReview = isElementaryHeadOrSuperAdmin(currentUser);

  // Official Lower Grade: 1, 2, or 3 (strictly no silent fallback to 1)
  const officialGrade = React.useMemo(() => {
    return getOfficialElementaryLowerGrade(selectedClass);
  }, [selectedClass]);

  // Narratives Map in Firestore
  const [narrativesMap, setNarrativesMap] = React.useState<Record<string, ElementaryMonthlyStudentNarrativeDoc>>({});
  const [loadingNarratives, setLoadingNarratives] = React.useState<boolean>(true);

  // Active Selected Student
  const [activeStudentId, setActiveStudentId] = React.useState<string>(students[0]?.id || '');
  const [hydratedStudentId, setHydratedStudentId] = React.useState('');
  const [saveErrorMessage, setSaveErrorMessage] = React.useState('');
  const activeStudent = students.find(s => s.id === activeStudentId) || null;

  // Active Student Narrative Doc
  const activeNarrative = activeStudent ? narrativesMap[activeStudent.id] : null;
  const currentStatus: ElementaryMonthlyReviewStatus = activeNarrative?.reviewStatus || 'DRAFT';
  const isLocked = currentStatus === 'SUBMITTED' || currentStatus === 'APPROVED';

  // Save Status
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>('idle');
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState<boolean>(false);

  // ==========================================
  // SECTION 1: ACADEMIC COMMENTS STATE
  // ==========================================
  const defaultAcademicOpening = React.useMemo(() => {
    return `Pada bulan ${monthLabel}, perkembangan capaian pembelajaran ananda ${activeStudent?.name || 'siswa'} adalah sebagai berikut:`;
  }, [monthLabel, activeStudent?.name]);

  const defaultAcademicClosing = `Dukungan dan apresiasi berkelanjutan di rumah senantiasa menjadi penyemangat ananda untuk terus berkembang secara optimal.`;

  const [academicOpening, setAcademicOpening] = React.useState<string>(defaultAcademicOpening);
  const [academicSubjectComments, setAcademicSubjectComments] = React.useState<Record<string, string>>({});
  const [academicClosing, setAcademicClosing] = React.useState<string>(defaultAcademicClosing);
  const [academicComment, setAcademicComment] = React.useState<string>('');
  const [lastAssembledAcademic, setLastAssembledAcademic] = React.useState<string>('');
  const [isAcademicManuallyEdited, setIsAcademicManuallyEdited] = React.useState<boolean>(false);

  // Optional AI polisher for academic comments
  const [isAcademicAiOpen, setIsAcademicAiOpen] = React.useState<boolean>(false);
  const [refiningAcademicAi, setRefiningAcademicAi] = React.useState<boolean>(false);
  const [academicAiRefinedDraft, setAcademicAiRefinedDraft] = React.useState<string>('');

  // ==========================================
  // SECTION 2: SEL PROFILE STATE (DETERMINISTIC)
  // ==========================================
  const defaultSelOpening = '';
  const defaultSelClosing = '';

  const [selOpening, setSelOpening] = React.useState<string>(defaultSelOpening);
  const [selAspects, setSelAspects] = React.useState<Record<string, ElementaryMonthlySelAspectSelection>>({});
  const [selClosing, setSelClosing] = React.useState<string>(defaultSelClosing);
  const [selProfile, setSelProfile] = React.useState<string>('');
  const [lastAssembledSel, setLastAssembledSel] = React.useState<string>('');
  const [isSelManuallyEdited, setIsSelManuallyEdited] = React.useState<boolean>(false);

  // Confirmation modal state before overwriting manually edited text
  const [overwriteConfirm, setOverwriteConfirm] = React.useState<{
    isOpen: boolean;
    type: 'academic' | 'sel';
    newText: string;
  } | null>(null);

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

  // Stale scores detection
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

  // Subjects from curriculum
  const curriculumSubjects = React.useMemo(() => {
    return (curriculumDoc?.subjects || []).slice().sort((a, b) => a.order - b.order);
  }, [curriculumDoc]);

  // Computed summary of subjects & LGs for active student (reference only)
  const studentSubjectSummaries = React.useMemo(() => {
    if (!curriculumDoc || !curriculumDoc.subjects || !activeScoresDoc) return {};
    const resMap: Record<string, { lgTitles: string[]; average: number | null; predicate: string | null }> = {};
    for (const sub of curriculumDoc.subjects) {
      const lgTitles = (sub.learningGoals || []).map(lg => lg.title);
      let allLOs: any[] = [];
      (sub.learningGoals || []).forEach(lg => {
        allLOs = allLOs.concat(lg.learningObjectives || []);
      });
      const res = calculateLGAverageAndPredicate(activeScoresDoc.scores || {}, allLOs, sub.kkm);
      resMap[sub.id] = {
        lgTitles,
        average: res.average,
        predicate: res.predicate
      };
    }
    return resMap;
  }, [curriculumDoc, activeScoresDoc]);

  // Keep ref of current active student form data to protect drafts on switch
  const currentStudentFormRef = React.useRef({
    studentId: hydratedStudentId,
    academicOpening,
    academicSubjectComments,
    academicClosing,
    academicComment,
    lastAssembledAcademic,
    isAcademicManuallyEdited,
    selOpening,
    selAspects,
    selClosing,
    selProfile,
    lastAssembledSel,
    isSelManuallyEdited,
    selMetadata,
    formRevision,
    hasUnsavedChanges
  });

  React.useLayoutEffect(() => {
    currentStudentFormRef.current = {
      studentId: hydratedStudentId,
      academicOpening,
      academicSubjectComments,
      academicClosing,
      academicComment,
      lastAssembledAcademic,
      isAcademicManuallyEdited,
      selOpening,
      selAspects,
      selClosing,
      selProfile,
      lastAssembledSel,
      isSelManuallyEdited,
      selMetadata,
      formRevision,
      hasUnsavedChanges
    };
  }, [
    hydratedStudentId,
    academicOpening,
    academicSubjectComments,
    academicClosing,
    academicComment,
    lastAssembledAcademic,
    isAcademicManuallyEdited,
    selOpening,
    selAspects,
    selClosing,
    selProfile,
    lastAssembledSel,
    isSelManuallyEdited,
    selMetadata,
    formRevision,
    hasUnsavedChanges
  ]);

  React.useLayoutEffect(() => {
    const form = currentStudentFormRef.current;
    if (form.hasUnsavedChanges && form.studentId) pendingNarrativeDrafts.set(draftKey(form.studentId), { ...form });
  });
  React.useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (pendingNarrativeDrafts.size) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  // Load Narratives
  const loadNarratives = React.useCallback(async () => {
    if (!classId || !selectedYear || !selectedSemester || !selectedMonth) return;
    const generation = ++loadGeneration.current;
    setLoadingNarratives(true); setLoadError('');
    try {
      const data = await fetchElementaryMonthlyStudentNarratives(classId, selectedYear, selectedSemester, selectedMonth);
      if (alive.current && generation === loadGeneration.current) setNarrativesMap(data);
    } catch (err) {
      console.error('Error loading narratives:', err);
      if (alive.current && generation === loadGeneration.current) setLoadError('Gagal memuat narasi. Coba muat ulang sebelum menyunting.');
    } finally {
      if (alive.current && generation === loadGeneration.current) setLoadingNarratives(false);
    }
  }, [classId, selectedYear, selectedSemester, selectedMonth]);

  React.useEffect(() => {
    loadNarratives();
  }, [loadNarratives]);

  // Sync active student form when student changes or narratives reload
  const populateFormForStudent = React.useCallback((studentId: string, doc?: ElementaryMonthlyStudentNarrativeDoc | null) => {
    setHydratedStudentId(studentId);
    const sDoc = doc || narrativesMap[studentId];
    const stu = students.find(s => s.id === studentId);
    const stuName = stu?.name || 'siswa';

    // Academic
    if (sDoc?.academicSource) {
      setAcademicOpening(sDoc.academicSource.opening ?? `Pada bulan ${monthLabel}, perkembangan capaian pembelajaran ananda ${stuName} adalah sebagai berikut:`);
      setAcademicSubjectComments(sDoc.academicSource.subjectComments || {});
      setAcademicClosing(sDoc.academicSource.closing ?? defaultAcademicClosing);
      setLastAssembledAcademic(sDoc.academicSource.lastAssembledText || '');
      setIsAcademicManuallyEdited(sDoc.academicSource.isManuallyEdited ?? (sDoc.academicComment !== sDoc.academicSource.lastAssembledText));
    } else {
      setAcademicOpening(`Pada bulan ${monthLabel}, perkembangan capaian pembelajaran ananda ${stuName} adalah sebagai berikut:`);
      setAcademicSubjectComments({});
      setAcademicClosing(defaultAcademicClosing);
      setLastAssembledAcademic('');
      setIsAcademicManuallyEdited(false);
    }
    setAcademicComment(sDoc?.academicComment || '');

    // SEL
    if (sDoc?.selSource) {
      setSelOpening(sDoc.selSource.opening ?? '');
      setSelAspects(sDoc.selSource.aspects || {});
      setSelClosing(sDoc.selSource.closing ?? defaultSelClosing);
      setLastAssembledSel(sDoc.selSource.lastAssembledText || '');
      setIsSelManuallyEdited(sDoc.selSource.isManuallyEdited ?? (sDoc.selProfile !== sDoc.selSource.lastAssembledText));
    } else {
      setSelOpening('');
      setSelAspects({});
      setSelClosing(defaultSelClosing);
      setLastAssembledSel('');
      setIsSelManuallyEdited(!!sDoc?.selProfile?.trim());
    }
    setSelProfile(sDoc?.selProfile || '');

    setSelMetadata(sDoc?.selSource || {});
    setFormRevision(sDoc?.revision || 0);
    const cached = pendingNarrativeDrafts.get(draftKey(studentId));
    if (cached) {
      setAcademicOpening(cached.academicOpening); setAcademicSubjectComments(cached.academicSubjectComments);
      setAcademicClosing(cached.academicClosing); setAcademicComment(cached.academicComment);
      setLastAssembledAcademic(cached.lastAssembledAcademic); setIsAcademicManuallyEdited(cached.isAcademicManuallyEdited);
      setSelOpening(cached.selOpening); setSelAspects(cached.selAspects); setSelClosing(cached.selClosing);
      setSelProfile(cached.selProfile); setLastAssembledSel(cached.lastAssembledSel); setIsSelManuallyEdited(cached.isSelManuallyEdited);
      setSelMetadata(cached.selMetadata || {}); setFormRevision(cached.formRevision || 0);
    }
    setSaveStatus(cached ? 'unsaved' : sDoc ? 'saved' : 'idle');
    setHasUnsavedChanges(!!cached);
    setIsAcademicAiOpen(false);
    setAcademicAiRefinedDraft('');
  }, [narrativesMap, students, monthLabel, defaultAcademicClosing, defaultSelClosing]);

  // Initial student selection
  React.useEffect(() => {
    if (students.length > 0 && (!activeStudentId || !students.some(s => s.id === activeStudentId))) {
      setActiveStudentId(students[0].id);
    }
  }, [students, activeStudentId]);

  // Populate on student change
  React.useEffect(() => {
    if (!activeStudentId || loadingNarratives || loadError) return;
    populateFormForStudent(activeStudentId);
  }, [activeStudentId, loadingNarratives]);

  // Source change detection for Academic
  const candidateAssembledAcademic = React.useMemo(() => {
    if (!activeStudent) return '';
    return assembleDeterministicAcademicNarrative({
      studentName: activeStudent.name,
      monthLabel,
      opening: academicOpening,
      closing: academicClosing,
      subjects: curriculumSubjects.map(s => ({ id: s.id, name: s.name })),
      subjectComments: academicSubjectComments
    });
  }, [activeStudent, monthLabel, academicOpening, academicClosing, curriculumSubjects, academicSubjectComments]);

  const isAcademicSourceModified = React.useMemo(() => {
    if (!isAcademicManuallyEdited || !lastAssembledAcademic) return false;
    return candidateAssembledAcademic !== lastAssembledAcademic;
  }, [isAcademicManuallyEdited, lastAssembledAcademic, candidateAssembledAcademic]);

  const currentSelSource: ElementaryMonthlySelSource = {
    ...selMetadata, opening: selOpening, closing: selClosing, aspects: selAspects,
    lastAssembledText: lastAssembledSel, isManuallyEdited: isSelManuallyEdited
  };
  const isSelSourceModified = selMetadata.schemaVersion === 2 &&
    selMetadata.assembledFingerprint !== selSourceFingerprint(currentSelSource);

  // ==========================================
  // SAVE & PROTECT DRAFT
  // ==========================================
  const executeSaveDraft = React.useCallback(async (
    targetStudent: Student,
    data: {
      academicOpening: string;
      academicSubjectComments: Record<string, string>;
      academicClosing: string;
      academicComment: string;
      lastAssembledAcademic: string;
      isAcademicManuallyEdited: boolean;
      selOpening: string;
      selAspects: Record<string, ElementaryMonthlySelAspectSelection>;
      selClosing: string;
      selProfile: string;
      lastAssembledSel: string;
      isSelManuallyEdited: boolean;
      selMetadata: ElementaryMonthlySelSource;
      formRevision: number;
    }
  ) => {
    if (!targetStudent || targetStudent.id !== hydratedStudentId || !classId || loadingNarratives || loadError) throw new Error('Konteks narasi belum berhasil dimuat.');
    if (saveInFlight.current) return saveInFlight.current;
    
    // Explicit student binding
    const sId = targetStudent.id;
    const sName = targetStudent.name;
    const existingDoc = narrativesMap[sId];

    const academicSource: ElementaryMonthlyAcademicSource = {
      opening: data.academicOpening.trim(),
      subjectComments: data.academicSubjectComments,
      closing: data.academicClosing.trim(),
      lastAssembledText: data.lastAssembledAcademic,
      isManuallyEdited: data.isAcademicManuallyEdited
    };

    const selSource: ElementaryMonthlySelSource = {
      ...data.selMetadata,
      ...(officialGrade ? { gradeLevel: officialGrade } : {}),
      opening: data.selMetadata.schemaVersion === 2 ? data.selOpening : data.selOpening.trim(),
      aspects: data.selAspects,
      closing: data.selMetadata.schemaVersion === 2 ? data.selClosing : data.selClosing.trim(),
      lastAssembledText: data.lastAssembledSel,
      isManuallyEdited: data.isSelManuallyEdited
    };

    const payload: Parameters<typeof saveElementaryMonthlyStudentNarrativeDoc>[0] = {
      revision: data.formRevision,
      studentId: sId,
      studentName: sName,
      classId,
      academicYear: selectedYear,
      semester: selectedSemester,
      month: selectedMonth,
      academicComment: data.academicComment.trim(),
      academicSource,
      selProfile: data.selProfile.trim(),
      selSource,
      reviewStatus: existingDoc?.reviewStatus === 'NEEDS_REVISION' ? 'DRAFT' : (existingDoc?.reviewStatus || 'DRAFT'),
      lastScoresHash: currentScoresHash,
      isSourceStale: false
    };

    setSaveErrorMessage('');
    const draftAtSave = JSON.stringify(pendingNarrativeDrafts.get(draftKey(sId)));
    try {
      const saving = saveElementaryMonthlyStudentNarrativeDoc(payload, currentUser);
      saveInFlight.current = saving;
      await saving;
      if (JSON.stringify(pendingNarrativeDrafts.get(draftKey(sId))) === draftAtSave) pendingNarrativeDrafts.delete(draftKey(sId));
      if (!alive.current) return;
      
      // Update local state map
      setNarrativesMap(prev => ({
        ...prev,
        [sId]: {
          ...(prev[sId] || {}),
          ...payload,
          updatedAt: Date.now(),
          updatedByName: currentUser?.displayName || 'Guru'
        } as ElementaryMonthlyStudentNarrativeDoc
      }));

      if (currentStudentFormRef.current.studentId === sId) {
        setFormRevision(payload.revision || 0);
        setSaveStatus('saved');
        setHasUnsavedChanges(false);
      }
    } catch (err: any) {
      console.error(`Error saving draft for ${sName}:`, err);
      if (currentStudentFormRef.current.studentId === sId) {
        setSaveStatus('error');
        setSaveErrorMessage(err.message || 'Gagal menyimpan.');
      }
      throw err;
    } finally { saveInFlight.current = null; }
  }, [hydratedStudentId, loadingNarratives, loadError, classId, selectedYear, selectedSemester, selectedMonth, officialGrade, currentScoresHash, currentUser, narrativesMap]);

  // Explicit Save Draft Button Click
  const handleSaveDraft = async () => {
    if (!activeStudent || !selectedClass) return;
    setSaveStatus('saving');
    try {
      await executeSaveDraft(activeStudent, {
        academicOpening,
        academicSubjectComments,
        academicClosing,
        academicComment,
        lastAssembledAcademic,
        isAcademicManuallyEdited,
        selOpening,
        selAspects,
        selClosing,
        selProfile,
        lastAssembledSel,
        isSelManuallyEdited,
        selMetadata,
        formRevision
      });
      toast.success(`Draf narasi ${activeStudent.name} berhasil disimpan.`);
    } catch (err: any) {
      toast.error('Gagal menyimpan draf: ' + (err.message || ''));
    }
  };

  // Safe student switcher that saves pending edits before switching
  const handleSelectStudent = async (newStudentId: string) => {
    if (newStudentId === activeStudentId) return;

    // Check if current student has unsaved edits
    const prevForm = currentStudentFormRef.current;
    if (prevForm.hasUnsavedChanges && activeStudent && !isLocked) {
      setSaveStatus('saving');
      try { await executeSaveDraft(activeStudent, {
        academicOpening: prevForm.academicOpening,
        academicSubjectComments: prevForm.academicSubjectComments,
        academicClosing: prevForm.academicClosing,
        academicComment: prevForm.academicComment,
        lastAssembledAcademic: prevForm.lastAssembledAcademic,
        isAcademicManuallyEdited: prevForm.isAcademicManuallyEdited,
        selOpening: prevForm.selOpening,
        selAspects: prevForm.selAspects,
        selClosing: prevForm.selClosing,
        selProfile: prevForm.selProfile,
        lastAssembledSel: prevForm.lastAssembledSel,
        isSelManuallyEdited: prevForm.isSelManuallyEdited,
        selMetadata: prevForm.selMetadata,
        formRevision: prevForm.formRevision
      }); } catch (e) { toast.error('Gagal menyimpan; tetap pada siswa ini. Draf dipertahankan.'); return; }
    }

    setActiveStudentId(newStudentId);
  };

  // ==========================================
  // DETERMINISTIC NARRATIVE ASSEMBLY
  // ==========================================
  const handleTriggerAssembleAcademic = () => {
    if (!activeStudent) return;
    const newText = assembleDeterministicAcademicNarrative({
      studentName: activeStudent.name,
      monthLabel,
      opening: academicOpening,
      closing: academicClosing,
      subjects: curriculumSubjects.map(s => ({ id: s.id, name: s.name })),
      subjectComments: academicSubjectComments
    });

    if (!newText.trim()) {
      toast.warning('Isi komentar minimal untuk satu mata pelajaran sebelum menyusun narasi akademik.');
      return;
    }

    // Protection: If final text was manually edited, ask for confirmation
    if (isAcademicManuallyEdited && academicComment.trim() && academicComment.trim() !== newText) {
      setOverwriteConfirm({
        isOpen: true,
        type: 'academic',
        newText
      });
      return;
    }

    // Apply directly
    setAcademicComment(newText);
    setLastAssembledAcademic(newText);
    setIsAcademicManuallyEdited(false);
    setSaveStatus('unsaved');
    setHasUnsavedChanges(true);
    toast.success('Narasi akademik berhasil disusun dari komentar per mata pelajaran.');
  };

  const handleRubricAssemble = (newText: string) => {
    if (isSelManuallyEdited && selProfile.trim() && selProfile.trim() !== newText) {
      setOverwriteConfirm({ isOpen: true, type: 'sel', newText });
      return;
    }
    setSelProfile(newText); setLastAssembledSel(newText); setIsSelManuallyEdited(false);
    setSelMetadata(prev => ({ ...prev, assembledFingerprint: selSourceFingerprint(currentSelSource) }));
    setSaveStatus('unsaved'); setHasUnsavedChanges(true);
  };

  const handleConfirmOverwrite = () => {
    if (!overwriteConfirm) return;
    if (overwriteConfirm.type === 'academic') {
      setAcademicComment(overwriteConfirm.newText);
      setLastAssembledAcademic(overwriteConfirm.newText);
      setIsAcademicManuallyEdited(false);
      setSaveStatus('unsaved');
      setHasUnsavedChanges(true);
      toast.success('Narasi final akademik berhasil diperbarui dari susunan sumber.');
    } else {
      setSelMetadata(prev => ({ ...prev, assembledFingerprint: selSourceFingerprint(currentSelSource) }));
      setSelProfile(overwriteConfirm.newText);
      setLastAssembledSel(overwriteConfirm.newText);
      setIsSelManuallyEdited(false);
      setSaveStatus('unsaved');
      setHasUnsavedChanges(true);
      toast.success('Narasi final SEL berhasil diperbarui dari susunan observasi.');
    }
    setOverwriteConfirm(null);
  };

  // Optional AI polisher for Academic comments
  const handleRefineAcademicAi = async () => {
    const textToRefine = academicComment.trim() || candidateAssembledAcademic.trim();
    if (!textToRefine) {
      toast.warning('Tulis atau susun narasi akademik terlebih dahulu sebelum merapikan bahasa.');
      return;
    }
    const requestedStudent = activeStudentId;
    setRefiningAcademicAi(true);
    try {
      const refined = await refineElementaryMonthlyNarrativeAI({
        originalText: textToRefine,
        narrativeType: 'academic',
        studentName: activeStudent?.name || '',
        nickname: (activeStudent as any)?.nickname || ''
      });
      if (!alive.current || currentStudentFormRef.current.studentId !== requestedStudent) return;
      setAcademicAiRefinedDraft(refined);
      toast.success('Bahasa berhasil dirapikan. Periksa pratinjau sebelum menerapkan.');
    } catch (err: any) {
      toast.error('Gagal merapikan kalimat: ' + (err.message || ''));
    } finally {
      setRefiningAcademicAi(false);
    }
  };

  // ==========================================
  // SUBMISSION & REVIEW WORKFLOWS
  // ==========================================
  const handleSubmitForReview = async () => {
    if (!activeStudent) return;
    if (!academicComment.trim() || !selProfile.trim()) {
      toast.error('Harap lengkapi Narasi Final Akademik dan Profil Sosial Emosional sebelum mengajukan review.');
      return;
    }
    if (academicComment.trim().length < 15 || selProfile.trim().length < 15) {
      toast.error('Narasi masih terlalu singkat atau berupa placeholder.');
      return;
    }

    setSaveStatus('saving');
    try {
      // 1. Save current state
      await executeSaveDraft(activeStudent, {
        academicOpening,
        academicSubjectComments,
        academicClosing,
        academicComment,
        lastAssembledAcademic,
        isAcademicManuallyEdited,
        selOpening,
        selAspects,
        selClosing,
        selProfile,
        lastAssembledSel,
        isSelManuallyEdited,
        selMetadata,
        formRevision
      });

      // 2. Submit for review
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

      toast.success(`Paket narasi ${activeStudent.name} berhasil diajukan untuk ditinjau Head Unit.`);
      await loadNarratives();
    } catch (err: any) {
      console.error('Error submitting narrative:', err);
      toast.error('Gagal mengajukan narasi: ' + (err.message || ''));
      setSaveStatus('error');
    }
  };

  // Bulk Submit
  const handleBulkSubmitClass = async () => {
    if (hasUnsavedChanges) { toast.error('Simpan draf aktif sebelum pengajuan massal.'); return; }
    const readyStudents = students.filter(s => {
      const doc = narrativesMap[s.id];
      const hasAcademic = (doc?.academicComment?.trim().length || 0) >= 15;
      const hasSel = (doc?.selProfile?.trim().length || 0) >= 15;
      const notApproved = doc?.reviewStatus !== 'APPROVED';
      const notSubmitted = doc?.reviewStatus !== 'SUBMITTED';
      return hasAcademic && hasSel && notApproved && notSubmitted;
    });

    if (readyStudents.length === 0) {
      toast.error('Tidak ada narasi siswa yang siap diajukan (pastikan kedua narasi sudah diisi minimal 15 karakter dan belum diajukan).');
      return;
    }

    if (!confirm(`Ajukan narasi review untuk ${readyStudents.length} siswa yang sudah terisi lengkap?`)) {
      return;
    }

    setSaveStatus('saving');
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
      await loadNarratives();
    } finally {
      setSaveStatus(hasUnsavedChanges ? 'unsaved' : 'idle');
    }
  };

  // Unlock for Edit
  const handleUnlockForEdit = async () => {
    if (!activeStudent) return;
    if (!confirm(`Buka kunci paket narasi ${activeStudent.name}? Status akan kembali ke DRAFT agar dapat diedit.`)) {
      return;
    }

    setSaveStatus('saving');
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
      setSaveStatus(hasUnsavedChanges ? 'unsaved' : 'idle');
    }
  };

  // Head Unit: Approve
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

      toast.success(`Paket narasi ${activeStudent.name} telah disetujui (Approved).`);
      await loadNarratives();
    } catch (err: any) {
      console.error('Error approving:', err);
      toast.error('Gagal menyetujui: ' + (err.message || ''));
    } finally {
      setProcessingReview(false);
    }
  };

  // Head Unit: Request Revision
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

      toast.success(`Permintaan revisi berhasil dikirim ke guru kelas.`);
      setIsRevisionModalOpen(false);
      setRevisionNotesInput('');
      await loadNarratives();
    } catch (err: any) {
      console.error('Error requesting revision:', err);
      toast.error('Gagal mengirim revisi: ' + (err.message || ''));
    } finally {
      setProcessingReview(false);
    }
  };

  // Head Unit: Bulk Approve
  const handleBulkApproveClass = async () => {
    if (!canReview) return;
    const submittedStudents = students.filter(s => {
      const doc = narrativesMap[s.id];
      return doc?.reviewStatus === 'SUBMITTED';
    });

    if (submittedStudents.length === 0) {
      toast.error('Tidak ada narasi berstatus SUBMITTED yang dapat disetujui.');
      return;
    }

    if (!confirm(`Setujui (Approve) ${submittedStudents.length} narasi siswa yang sedang diajukan?`)) {
      return;
    }

    setProcessingReview(true);
    try {
      const count = await bulkApproveElementaryMonthlyNarratives({
        classId,
        academicYear: selectedYear,
        semester: selectedSemester,
        month: selectedMonth,
        studentIds: submittedStudents.map(s => s.id),
        reviewer: currentUser
      });

      toast.success(`Berhasil menyetujui ${count} paket narasi siswa.`);
      await loadNarratives();
    } catch (err: any) {
      console.error('Error bulk approving:', err);
      toast.error('Gagal menyetujui massal: ' + (err.message || ''));
      await loadNarratives();
    } finally {
      setProcessingReview(false);
    }
  };

  // Paste / Bulk Import
  const handleProcessImport = async () => {
    if (!importRawText.trim()) {
      toast.error('Teks input impor tidak boleh kosong.');
      return;
    }

    if (hasUnsavedChanges) { toast.error('Simpan draf aktif sebelum impor.'); return; }
    try {
    const lines = importRawText.split('\n').map(l => l.trim()).filter(Boolean);
    let matchedCount = 0;

    for (const line of lines) {
      const parts = line.includes('\t') ? line.split('\t') : line.split('|');
      if (parts.length >= 2) {
        const studentQuery = parts[0].trim().toLowerCase();
        const matched = students.find(s => 
          s.name.toLowerCase() === studentQuery || 
          s.name.toLowerCase().includes(studentQuery) ||
          (s.nis && s.nis === parts[0].trim())
        );

        if (matched) {

          const academicPart = parts[1]?.trim() || '';
          const selPart = parts[2]?.trim() || '';

          const existingDoc = narrativesMap[matched.id];
          if (existingDoc && ['SUBMITTED', 'APPROVED'].includes(existingDoc.reviewStatus)) throw new Error(`${matched.name}: narasi terkunci; buka kunci terlebih dahulu.`);
          const payload = {
            revision: existingDoc?.revision || 0,
            ...(existingDoc?.selSource ? { selSource: { ...existingDoc.selSource, isManuallyEdited: true } } : {}),
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
          matchedCount++;
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
    } catch (e) { toast.error('Impor berhenti: ' + (e as Error).message + ' Muat ulang status sebelum melanjutkan.'); await loadNarratives(); }
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
      {loadError && <p role="alert" className="text-red-700">{loadError} <button onClick={loadNarratives}>Coba muat ulang</button></p>}
      {hasUnsavedChanges && <p className="text-amber-800">Draf belum tersimpan. Draf dipertahankan per siswa/kelas/periode selama sesi ini; jangan tutup browser sebelum simpan berhasil.</p>}
      {saveErrorMessage && <div className="p-3 border border-red-300 rounded-xl text-sm space-y-2"><p className="text-red-800">{saveErrorMessage}</p><button onClick={loadNarratives}>Muat ulang status tersimpan (draf lokal tetap dipertahankan)</button><details><summary>Bandingkan narasi tersimpan terakhir yang dimuat</summary><p>Akademik: {activeNarrative?.academicComment || '(kosong)'}</p><p>SEL: {activeNarrative?.selProfile || '(kosong)'}</p><p>Revisi tersimpan: {activeNarrative?.revision || 0}; revisi dasar draf lokal: {formRevision}</p></details>{activeNarrative && !isLocked && activeNarrative.revision !== formRevision && <button onClick={() => { if (confirm('Gunakan draf lokal di atas revisi tersimpan ini? Bandingkan kedua versi terlebih dahulu. Isi sekolah baru diganti setelah Anda klik Simpan Draf.')) { setFormRevision(activeNarrative.revision || 0); setSaveErrorMessage(''); setSaveStatus('unsaved'); setHasUnsavedChanges(true); } }}>Gunakan draf lokal di atas revisi terbaru yang dimuat</button>}</div>}
      <fieldset disabled={loadingNarratives || hydratedStudentId !== activeStudentId || !!loadError || saveStatus === 'saving' || processingReview || refiningAcademicAi} className="space-y-6 min-w-0">
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
              Komentar Akademik per Mapel &amp; Profil SEL Lower Grade 1–3 · Kelas {selectedClass?.name || '-'}.
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {canReview && officialGrade && <button className="px-3 py-2 text-xs border rounded-xl" onClick={() => setShowSELConfig(true)}>Pengaturan Rubrik SEL</button>}
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
            disabled={saveStatus === 'saving'}
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

      {/* Warning banner if official grade is missing */}
      {!officialGrade && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl text-amber-900 text-xs flex items-center gap-3 shadow-xs">
          <AlertCircle size={22} className="text-amber-700 flex-shrink-0" />
          <div>
            <strong className="block text-sm font-bold text-amber-950">Konfigurasi Tingkat Kelas Belum Ditemukan</strong>
            <span>
              Kelas {selectedClass?.name || '-'} belum memiliki atribut tingkat kelas resmi (grade 1, 2, atau 3) pada basis data kelas.
              Harap periksa pengaturan data kelas di Master Kelas agar aspek SEL resmi (Kelas 1: Disiplin Diri &amp; Keterlibatan Sosial; Kelas 2: Komunikasi, Kerja Sama Tim, &amp; Disiplin Diri; Kelas 3: Empati, Motivasi Diri, &amp; Komunikasi) dapat dimuat dengan akurat.
            </span>
          </div>
        </div>
      )}

      {/* Main Grid: Student List & Detail Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Students Sidebar (4 Cols) */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-blue-700" />
              <span className="text-xs font-bold text-slate-800">Daftar Siswa ({students.length})</span>
            </div>
            {loadingNarratives && <RefreshCw size={12} className="animate-spin text-slate-400" />}
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
                    onClick={() => handleSelectStudent(s.id)}
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
                      NIS: {activeStudent.nis || '-'} · Kelas {selectedClass?.name || '-'} {officialGrade ? `(Tingkat ${officialGrade})` : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Live Save Status Indicator */}
                    {saveStatus === 'saving' ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-xl bg-blue-50 text-blue-700 border border-blue-200">
                        <RefreshCw size={12} className="animate-spin text-blue-600" />
                        <span>Menyimpan...</span>
                      </span>
                    ) : saveStatus === 'unsaved' ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-xl bg-amber-50 text-amber-700 border border-amber-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        <span>Belum disimpan</span>
                      </span>
                    ) : saveStatus === 'error' ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-xl bg-red-50 text-red-700 border border-red-200">
                        <AlertCircle size={12} />
                        <span>Gagal simpan</span>
                      </span>
                    ) : saveStatus === 'saved' ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 size={12} />
                        <span>Tersimpan</span>
                      </span>
                    ) : <span className="text-xs text-slate-500">{activeNarrative ? 'Data dimuat' : 'Draf baru'}</span>}

                    {/* Lock / Unlock indicator */}
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
                      <strong>Perhatian:</strong> Nilai sumber LO/LG siswa telah diperbarui sejak narasi ini diajukan atau disetujui. Pertimbangkan untuk menyesuaikan komentar akademik.
                    </span>
                  </div>
                )}
              </div>

              {/* ========================================================= */}
              {/* SECTION A: Academic Comments (Per Mata Pelajaran)        */}
              {/* ========================================================= */}
              <div className="space-y-4 p-4 bg-slate-50/70 rounded-2xl border border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                  <div className="flex items-center gap-2">
                    <BookOpen size={17} className="text-blue-700" />
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                        1. Academic Comments (Komentar per Mata Pelajaran)
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Tulis evaluasi per mapel, lalu klik &quot;Susun Narasi Akademik&quot; untuk menghasilkan narasi final.
                      </p>
                    </div>
                  </div>

                  {!isLocked && (
                    <button
                      type="button"
                      onClick={() => setIsAcademicAiOpen(!isAcademicAiOpen)}
                      className="text-xs font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1 self-start sm:self-auto cursor-pointer"
                    >
                      <Sparkles size={14} className="text-blue-600" />
                      <span>{isAcademicAiOpen ? 'Tutup Bantuan Bahasa' : 'Rapikan Bahasa (Opsional AI)'}</span>
                    </button>
                  )}
                </div>

                {/* Optional AI Polish Drawer for Academic Comments */}
                {isAcademicAiOpen && !isLocked && (
                  <div className="p-3.5 bg-blue-50/70 rounded-xl border border-blue-200 space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold text-blue-900">
                      <span>Bantuan AI: Merapikan Tata Bahasa Komentar Guru</span>
                      <span className="text-[11px] font-normal text-blue-700">
                        Hanya merapikan diksi &amp; kalimat; tidak menambahkan klaim capaian baru.
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleRefineAcademicAi}
                        disabled={refiningAcademicAi}
                        className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-50"
                      >
                        {refiningAcademicAi ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
                        <span>Rapikan Bahasa Narasi Saat Ini</span>
                      </button>

                      {academicAiRefinedDraft && (
                        <button
                          type="button"
                          onClick={() => {
                            setAcademicComment(academicAiRefinedDraft);
                            setIsAcademicManuallyEdited(true);
                            setSaveStatus('unsaved');
                            setHasUnsavedChanges(true);
                            setIsAcademicAiOpen(false);
                            toast.success('Hasil rapian disalin ke Narasi Final Akademik.');
                          }}
                          className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        >
                          <Check size={12} />
                          <span>Gunakan Hasil Rapian Ini</span>
                        </button>
                      )}
                    </div>

                    {academicAiRefinedDraft && (
                      <div className="p-3 bg-white rounded-lg border border-blue-200 text-xs text-slate-800 leading-relaxed space-y-1">
                        <span className="font-bold text-[10px] text-blue-800 block">Saran Kalimat yang Telah Dirapikan:</span>
                        <p>{academicAiRefinedDraft}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Structured Form: Pembuka, List of Subjects, Penutup */}
                <div className="space-y-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                  {/* Pembuka Akademik */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Kalimat Pembuka Akademik:
                    </label>
                    <input
                      type="text"
                      value={academicOpening}
                      onChange={(e) => {
                        setAcademicOpening(e.target.value);
                        setSaveStatus('unsaved');
                        setHasUnsavedChanges(true);
                      }}
                      disabled={isLocked}
                      placeholder="Pada bulan ini, capaian pembelajaran ananda adalah sebagai berikut:"
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100"
                    />
                  </div>

                  {/* Per-Subject Textarea Grid */}
                  <div className="space-y-3 pt-1">
                    <label className="block text-[11px] font-bold text-slate-800">
                      Komentar per Mata Pelajaran ({curriculumSubjects.length} Mata Pelajaran Terdaftar):
                    </label>

                    {curriculumSubjects.length === 0 ? (
                      <div className="p-3 text-center bg-slate-50 border border-dashed border-slate-200 rounded-lg text-xs text-slate-500">
                        Belum ada mata pelajaran pada kurikulum kelas bulan ini. Harap konfigurasikan kurikulum pada tab Learning Goals.
                      </div>
                    ) : (
                      curriculumSubjects.map((sub) => {
                        const summary = studentSubjectSummaries[sub.id];
                        const currentVal = academicSubjectComments[sub.id] || '';

                        return (
                          <div key={sub.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50/40 space-y-2">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-800">{sub.name}</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-200 text-slate-700 font-mono">
                                  KKM: {sub.kkm}
                                </span>
                              </div>

                              {/* Reference Score & LGs (Reference only, no auto-formula) */}
                              {summary && summary.average !== null && (
                                <div className="text-[11px] text-slate-500 flex items-center gap-2">
                                  <span>Rata-rata: <strong>{summary.average.toFixed(1)}</strong></span>
                                  <span>Predikat: <strong>{summary.predicate || '-'}</strong></span>
                                  <span className="text-slate-400">({summary.lgTitles.length} LG)</span>
                                </div>
                              )}
                            </div>

                            {/* Reference Learning Goals */}
                            {sub.learningGoals && sub.learningGoals.length > 0 && (
                              <div className="text-[11px] text-slate-500 bg-white p-2 rounded-lg border border-slate-200">
                                <span className="font-semibold text-slate-600 block mb-0.5">Topik/LG Bulan Ini:</span>
                                <span className="text-slate-600 italic">
                                  {sub.learningGoals.map(lg => lg.title).join('; ')}
                                </span>
                              </div>
                            )}

                            {/* Quick Starter Chips */}
                            {!isLocked && (
                              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                <span className="text-[10px] text-slate-500 font-semibold">Bantuan Kalimat Awal:</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const starter = `menunjukkan pemahaman konsep yang baik pada materi bulan ini, serta antusias dalam aktivitas belajar.`;
                                    const updated = currentVal ? `${currentVal} ${starter}` : starter;
                                    setAcademicSubjectComments(prev => ({ ...prev, [sub.id]: updated }));
                                    setSaveStatus('unsaved');
                                    setHasUnsavedChanges(true);
                                  }}
                                  className="text-[10px] px-2 py-0.5 rounded-md bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 cursor-pointer"
                                >
                                  + Pemahaman Baik
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const starter = `mampu menguasai materi dasar dengan baik, perlu latihan pengulangan mandiri untuk meningkatkan ketelitian.`;
                                    const updated = currentVal ? `${currentVal} ${starter}` : starter;
                                    setAcademicSubjectComments(prev => ({ ...prev, [sub.id]: updated }));
                                    setSaveStatus('unsaved');
                                    setHasUnsavedChanges(true);
                                  }}
                                  className="text-[10px] px-2 py-0.5 rounded-md bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 cursor-pointer"
                                >
                                  + Perlu Latihan Mandiri
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const starter = `memerlukan bimbingan berkelanjutan dan penguatan konsep dasar secara bertahap.`;
                                    const updated = currentVal ? `${currentVal} ${starter}` : starter;
                                    setAcademicSubjectComments(prev => ({ ...prev, [sub.id]: updated }));
                                    setSaveStatus('unsaved');
                                    setHasUnsavedChanges(true);
                                  }}
                                  className="text-[10px] px-2 py-0.5 rounded-md bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 cursor-pointer"
                                >
                                  + Perlu Bimbingan
                                </button>
                              </div>
                            )}

                            <textarea
                              rows={2}
                              value={currentVal}
                              onChange={(e) => {
                                const val = e.target.value;
                                setAcademicSubjectComments(prev => ({ ...prev, [sub.id]: val }));
                                setSaveStatus('unsaved');
                                setHasUnsavedChanges(true);
                              }}
                              disabled={isLocked}
                              placeholder="Panduan: Apa yang sudah berkembang, apa yang perlu dilatih, dan dukungan/langkah berikutnya..."
                              className="w-full text-xs p-2.5 border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 resize-y"
                            />
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Penutup Akademik */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Kalimat Penutup Akademik:
                    </label>
                    <input
                      type="text"
                      value={academicClosing}
                      onChange={(e) => {
                        setAcademicClosing(e.target.value);
                        setSaveStatus('unsaved');
                        setHasUnsavedChanges(true);
                      }}
                      disabled={isLocked}
                      placeholder="Dukungan berkelanjutan di rumah senantiasa menjadi penyemangat ananda..."
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100"
                    />
                  </div>

                  {/* Assembly Action Button */}
                  {!isLocked && (
                    <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-slate-100">
                      <span className="text-[11px] text-slate-500">
                        Klik tombol untuk merangkai komentar per mapel ke kotak Narasi Final Akademik di bawah.
                      </span>
                      <button
                        type="button"
                        onClick={handleTriggerAssembleAcademic}
                        className="px-4 py-1.5 text-xs font-bold rounded-xl bg-blue-700 text-white hover:bg-blue-800 flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <PenLine size={13} />
                        <span>Susun Narasi Akademik</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Final Narasi Akademik Textarea */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-800">
                      Narasi Final Akademik (Dicetak pada Rapor Bulanan &amp; Pratinjau):
                    </label>
                    {isAcademicManuallyEdited && (
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-semibold">
                        Diedit Manual oleh Guru
                      </span>
                    )}
                  </div>

                  {isAcademicSourceModified && (
                    <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 text-xs flex items-center gap-2">
                      <AlertTriangle size={15} className="text-amber-700 flex-shrink-0" />
                      <span>
                        <strong>Perhatian:</strong> Isian komentar per mapel telah berubah sejak narasi final terakhir disusun. Klik <em>&quot;Susun Narasi Akademik&quot;</em> jika ingin memperbarui narasi final.
                      </span>
                    </div>
                  )}

                  <textarea
                    rows={4}
                    value={academicComment}
                    onChange={(e) => {
                      setAcademicComment(e.target.value);
                      setIsAcademicManuallyEdited(true);
                      setSaveStatus('unsaved');
                      setHasUnsavedChanges(true);
                    }}
                    disabled={isLocked}
                    placeholder="Narasi final akademik hasil susunan atau editan guru. Teks ini yang akan ditampilkan pada dokumen rapor..."
                    className="w-full text-xs p-3 border border-slate-300 rounded-xl bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-600 resize-y"
                  />
                </div>
              </div>

              {/* ========================================================= */}
              {/* SECTION B: Social Emotional Profile (SEL - NO AI)         */}
              {/* ========================================================= */}
              <div className="space-y-4 p-4 bg-slate-50/70 rounded-2xl border border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Heart size={17} className="text-rose-600" />
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                        2. Social Emotional Profile (SEL Lower Grade 1–3)
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Capaian per aspek berdasarkan rubrik admin, disusun deterministik tanpa AI.
                      </p>
                    </div>
                  </div>

                  {officialGrade && (
                    <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800 border border-rose-200">
                      Fokus Kelas {officialGrade}
                    </span>
                  )}
                </div>

                <SELRubricEditor
                  key={activeStudent.id}
                  context={{ classId, academicYear: selectedYear, semester: selectedSemester, month: selectedMonth }}
                  gradeLevel={officialGrade || 0} studentName={activeStudent.name}
                  nickname={(activeStudent as any).nickname || (activeStudent as any).nickName || activeStudent.name}
                  className={selectedClass?.name || ''} monthLabel={monthLabel}
                  source={currentSelSource} locked={isLocked} finalText={selProfile}
                  onChange={source => {
                    setSelMetadata(source); setSelOpening(source.opening || ''); setSelClosing(source.closing || '');
                    setSelAspects(source.aspects || {});
                    if (source.lastAssembledText !== undefined) setLastAssembledSel(source.lastAssembledText);
                    if (source.isManuallyEdited !== undefined) setIsSelManuallyEdited(source.isManuallyEdited);
                    setSaveStatus('unsaved'); setHasUnsavedChanges(true);
                  }} onAssemble={handleRubricAssemble}
                />

                {/* Final Narasi SEL Textarea */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-800">
                      Narasi Final SEL (Dicetak pada Rapor Bulanan &amp; Pratinjau):
                    </label>
                    {isSelManuallyEdited && (
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-semibold">
                        Diedit Manual oleh Guru
                      </span>
                    )}
                  </div>

                  {isSelSourceModified && (
                    <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 text-xs flex items-center gap-2">
                      <AlertTriangle size={15} className="text-amber-700 flex-shrink-0" />
                      <span>
                        <strong>Perhatian:</strong> Pilihan observasi karakter telah berubah sejak narasi final terakhir disusun. Klik <em>&quot;Susun Narasi SEL&quot;</em> jika ingin memperbarui narasi final.
                      </span>
                    </div>
                  )}

                  <textarea
                    rows={4}
                    value={selProfile}
                    onChange={(e) => {
                      setSelProfile(e.target.value);
                      setIsSelManuallyEdited(true);
                      setSaveStatus('unsaved');
                      setHasUnsavedChanges(true);
                    }}
                    disabled={isLocked}
                    placeholder="Uraikan perkembangan profil karakter, kemandirian, dan interaksi sosial emosional siswa di lingkungan sekolah..."
                    className="w-full text-xs p-3 border border-slate-300 rounded-xl bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500 disabled:bg-slate-100 disabled:text-slate-600 resize-y"
                  />
                </div>
              </div>

              {/* Action Buttons Footer */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <div className="text-xs text-slate-500">
                  {activeNarrative?.updatedByName && (
                    <span>Terakhir disimpan oleh <strong>{activeNarrative.updatedByName}</strong></span>
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
                        disabled={saveStatus === 'saving'}
                        className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-50"
                      >
                        {saveStatus === 'saving' ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                        <span>Simpan Draf</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleSubmitForReview}
                        disabled={saveStatus === 'saving'}
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

      </fieldset>
      {showSELConfig && <SELTemplateConfigModal academicYear={selectedYear} semester={selectedSemester} month={selectedMonth} gradeLevel={officialGrade || 1} onClose={() => setShowSELConfig(false)} onApplied={() => { toast.success('Rubrik diterapkan. Pada form siswa, muat ulang rubrik untuk melihat versi aktif.'); }} />}
      {/* MODAL: Overwrite Confirmation Modal */}
      {overwriteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-amber-800">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Konfirmasi Timpa Narasi Final</h3>
                <p className="text-xs text-slate-500">Narasi final sebelumnya telah Anda edit secara manual.</p>
              </div>
            </div>

            <p className="text-xs text-slate-700 leading-relaxed bg-amber-50/60 p-3 rounded-xl border border-amber-200">
              Apakah Anda yakin ingin menimpa narasi final {overwriteConfirm.type === 'academic' ? 'Akademik' : 'SEL'} dengan hasil susunan baru dari isian komponen? Perubahan manual Anda sebelumnya pada kotak narasi final akan digantikan.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setOverwriteConfirm(null)}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Batal (Pertahankan Editan)
              </button>
              <button
                type="button"
                onClick={handleConfirmOverwrite}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-amber-600 text-white hover:bg-amber-700 cursor-pointer shadow-xs"
              >
                Ya, Ganti Narasi Final
              </button>
            </div>
          </div>
        </div>
      )}

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
