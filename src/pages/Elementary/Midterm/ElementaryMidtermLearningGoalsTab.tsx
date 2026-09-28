import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Plus, Edit2, Trash2, CheckCircle2, AlertCircle, RefreshCw, 
  Sparkles, Layers, BookOpen, User, Music, PlusCircle, FolderPlus,
  Upload, FileCheck2, Check
} from 'lucide-react';
import { 
  saveElementaryMidtermMasterGoals, 
  saveElementaryMidtermActiveGoalIds,
  saveBulkElementaryMidtermMasterGoalForClasses,
  saveElementaryMidtermStudentRemark,
  saveBulkElementaryMidtermStudentRemarks,
  fetchElementaryStudentUnitActivityEnrollment,
  saveElementaryMidtermStudentPerformingArtsUa,
  saveBulkElementaryMidtermStudentPerformingArtsUa,
  fetchElementaryMidtermCustomUas,
  saveElementaryMidtermCustomUas,
  fetchElementaryMidtermMasterGoals
} from '../../../services/elementaryMidtermService';
import { getLearningGoals, getActiveStudents } from '../../../lib/firebase';
import { 
  ElementaryMidtermMasterGoalDoc, 
  ElementaryMidtermStudentDataDoc,
  ElementaryMidtermGoalItem,
  ELEMENTARY_OFFICIAL_SUBJECTS,
  normalizeElementarySubjectName,
  getGradeLevelNumber,
  getDefaultPerformingArtsUAs,
  getActiveMasterGoals
} from '../../../types/elementaryMidtermReport';
import type { Student, Class, User as UserType, UnitActivityEnrollment } from '../../../types';

interface ElementaryMidtermLearningGoalsTabProps {
  selectedClassId: string;
  selectedClass: Class | null;
  allElementaryClasses?: Class[];
  selectedYear: string;
  selectedSemester: string;
  selectedTerm: string;
  students: Student[];
  masterGoalsMap: Record<string, ElementaryMidtermMasterGoalDoc>;
  studentDataMap: Record<string, ElementaryMidtermStudentDataDoc>;
  onRefreshData: (silent?: boolean) => Promise<void>;
  currentUser: UserType | null;
}

export const ElementaryMidtermLearningGoalsTab: React.FC<ElementaryMidtermLearningGoalsTabProps> = ({
  selectedClassId,
  selectedClass,
  allElementaryClasses = [],
  selectedYear,
  selectedSemester,
  selectedTerm,
  students,
  masterGoalsMap,
  studentDataMap,
  onRefreshData,
  currentUser
}) => {
  // Official subjects for Elementary
  const elementarySubjects = ELEMENTARY_OFFICIAL_SUBJECTS;

  const SUBJECT_KEY_MAP: Record<string, string> = {
    'ISLAMIC_STUDIES': 'Islamic Studies',
    'QURAN_RECITING': "Qur'an Reciting",
    'BAHASA_INDONESIA': 'Bahasa Indonesia',
    'MATHEMATICS': 'Mathematics',
    'ENGLISH': 'English',
    'ARTS_AND_CRAFTS': 'Arts and Crafts',
    'PERFORMING_ARTS': 'Performing Arts',
    'PHYSICAL_EDUCATION': 'Physical Education',
    'ICT': 'Information and Communications Technology',
    'PROJECTS': 'Projects'
  };

  const OFFICIAL_TO_KEY_MAP: Record<string, string> = {
    'Islamic Studies': 'ISLAMIC_STUDIES',
    "Qur'an Reciting": 'QURAN_RECITING',
    'Bahasa Indonesia': 'BAHASA_INDONESIA',
    'Mathematics': 'MATHEMATICS',
    'English': 'ENGLISH',
    'Arts and Crafts': 'ARTS_AND_CRAFTS',
    'Performing Arts': 'PERFORMING_ARTS',
    'Physical Education': 'PHYSICAL_EDUCATION',
    'Information and Communications Technology': 'ICT',
    'Projects': 'PROJECTS'
  };

  const [searchParams, setSearchParams] = useSearchParams();
  const urlSubject = searchParams.get('subject') || '';
  const activeSubject = SUBJECT_KEY_MAP[urlSubject.toUpperCase()] || elementarySubjects[0];

  const setActiveSubject = (newSubj: string) => {
    const key = OFFICIAL_TO_KEY_MAP[newSubj] || 'ISLAMIC_STUDIES';
    const newParams = new URLSearchParams(searchParams);
    newParams.set('subject', key);
    setSearchParams(newParams, { replace: true });
  };

  // Grade level detection (1 to 6)
  const gradeNum = React.useMemo(() => getGradeLevelNumber(selectedClass), [selectedClass]);

  // Default Unit Activities for this grade level
  const defaultUas = React.useMemo(() => getDefaultPerformingArtsUAs(gradeNum), [gradeNum]);

  // Custom UAs added by teachers for this class
  const [customUas, setCustomUas] = React.useState<string[]>([]);

  // Combined Active UAs for this grade level/class
  const activeGradeUas = React.useMemo(() => {
    const combined = [...defaultUas];
    customUas.forEach(u => {
      if (!combined.includes(u)) combined.push(u);
    });
    return combined;
  }, [defaultUas, customUas]);

  // Active Performing Arts Unit Activity Sub-tab
  const [activeUaTab, setActiveUaTab] = React.useState<string>('');

  // Find all active classes on the same grade level
  const sameGradeClasses = React.useMemo(() => {
    if (!selectedClass) return [];
    const targetGrade = getGradeLevelNumber(selectedClass);
    const matched = (allElementaryClasses || []).filter(c => c && getGradeLevelNumber(c) === targetGrade);
    if (selectedClass && !matched.some(c => c.id === selectedClass.id)) {
      matched.push(selectedClass);
    }
    return matched;
  }, [selectedClass, allElementaryClasses]);

  // Selected target class IDs for multi-class Goal application
  const [selectedTargetClassIds, setSelectedTargetClassIds] = React.useState<string[]>([]);
  const [showAddGoalConfirmModal, setShowAddGoalConfirmModal] = React.useState<boolean>(false);
  const [bulkGoalSuccessMsg, setBulkGoalSuccessMsg] = React.useState<string | null>(null);

  // Synchronize default selected target classes when grade or selected class changes
  React.useEffect(() => {
    if (sameGradeClasses.length > 0) {
      setSelectedTargetClassIds(sameGradeClasses.map(c => c.id));
    } else if (selectedClassId) {
      setSelectedTargetClassIds([selectedClassId]);
    }
  }, [selectedClassId, sameGradeClasses]);

  // Keep activeUaTab valid when grade level or UAs change
  React.useEffect(() => {
    if (activeGradeUas.length > 0 && (!activeUaTab || !activeGradeUas.includes(activeUaTab))) {
      setActiveUaTab(activeGradeUas[0]);
    }
  }, [activeGradeUas, activeUaTab]);

  // Load custom UAs for current class
  React.useEffect(() => {
    const loadCustomUas = async () => {
      if (!selectedClassId) return;
      const uas = await fetchElementaryMidtermCustomUas(selectedClassId, selectedYear, selectedSemester, selectedTerm);
      setCustomUas(uas);
    };
    loadCustomUas();
  }, [selectedClassId, selectedYear, selectedSemester, selectedTerm]);

  // Effective Subject Key for Firestore storage and lookup
  const effectiveSubjectKey = React.useMemo(() => {
    if (activeSubject === 'Performing Arts' && activeUaTab) {
      return `Performing Arts - ${activeUaTab}`;
    }
    return activeSubject;
  }, [activeSubject, activeUaTab]);

  // Lookup master doc for selected active subject and UA
  const currentSubjectMasterDoc = React.useMemo(() => {
    if (masterGoalsMap[effectiveSubjectKey]) return masterGoalsMap[effectiveSubjectKey];

    const foundKey = Object.keys(masterGoalsMap).find(key => {
      if (activeSubject === 'Performing Arts') {
        return key === `Performing Arts - ${activeUaTab}` || key === `Performing Arts::${activeUaTab}`;
      }
      return normalizeElementarySubjectName(key) === activeSubject;
    });

    return foundKey ? masterGoalsMap[foundKey] : undefined;
  }, [masterGoalsMap, effectiveSubjectKey, activeSubject, activeUaTab]);

  const [goals, setGoals] = React.useState<ElementaryMidtermGoalItem[]>([]);
  const [activeGoalIds, setActiveGoalIds] = React.useState<string[]>([]);
  const [useForMidtermNewGoal, setUseForMidtermNewGoal] = React.useState<boolean>(true);
  const [editingGoalId, setEditingGoalId] = React.useState<string | null>(null);
  const [goalTextInput, setGoalTextInput] = React.useState<string>('');
  const [savingGoals, setSavingGoals] = React.useState<boolean>(false);

  // Uncheck confirmation modal state when unchecking goal with existing student grades
  const [uncheckConfirmModal, setUncheckConfirmModal] = React.useState<{
    isOpen: boolean;
    goalId: string;
    goalText: string;
  }>({
    isOpen: false,
    goalId: '',
    goalText: ''
  });

  // Student remarks map: studentId -> { goalId -> 'A' | 'D' | 'B' }
  const [localRemarks, setLocalRemarks] = React.useState<Record<string, Record<string, string>>>({});
  
  // Student Performing Arts UA selection map: studentId -> UA string
  const [studentUaSelection, setStudentUaSelection] = React.useState<Record<string, string>>({});
  const [savedStudentUaSelection, setSavedStudentUaSelection] = React.useState<Record<string, string>>({});
  const [uaSaveStatus, setUaSaveStatus] = React.useState<'saved' | 'saving' | 'error' | null>(null);

  const [goalsLoadError, setGoalsLoadError] = React.useState<boolean>(false);

  // Active students for input remarks table (filtered by UA if subject is Performing Arts)
  const activeStudentsForGrading = React.useMemo(() => {
    if (activeSubject === 'Performing Arts') {
      return students.filter(st => studentUaSelection[st.id] === activeUaTab);
    }
    return students;
  }, [students, activeSubject, studentUaSelection, activeUaTab]);

  // Import Peserta Unit Activity Modal State
  const [showImportUaModal, setShowImportUaModal] = React.useState<boolean>(false);
  const [selectedImportUa, setSelectedImportUa] = React.useState<string>('');
  const [importRawText, setImportRawText] = React.useState<string>('');
  const [overwriteExisting, setOverwriteExisting] = React.useState<boolean>(false);
  const [importStudentsList, setImportStudentsList] = React.useState<Array<Student & { className?: string }>>([]);
  const [loadingImportRoster, setLoadingImportRoster] = React.useState<boolean>(false);
  const [importSuccessMsg, setImportSuccessMsg] = React.useState<string | null>(null);

  // Modal State for adding custom UA
  const [showAddUaModal, setShowAddUaModal] = React.useState<boolean>(false);
  const [newUaInput, setNewUaInput] = React.useState<string>('');
  const [savingCustomUa, setSavingCustomUa] = React.useState<boolean>(false);

  const handleAddCustomUa = async () => {
    if (!newUaInput.trim() || !selectedClassId || !selectedYear) return;
    setSavingCustomUa(true);
    try {
      const updated = Array.from(new Set([...customUas, newUaInput.trim()]));
      await saveElementaryMidtermCustomUas(
        selectedClassId,
        selectedClass?.name || '',
        selectedYear,
        selectedSemester,
        selectedTerm,
        updated,
        currentUser
      );
      setCustomUas(updated);
      setActiveUaTab(newUaInput.trim());
      setNewUaInput('');
      setShowAddUaModal(false);
      await onRefreshData();
    } catch (e) {
      console.error("Error adding custom UA:", e);
    } finally {
      setSavingCustomUa(false);
    }
  };

  // Save status indicator: 'saved' | 'saving' | 'error' | null
  const [saveStatus, setSaveStatus] = React.useState<'saved' | 'saving' | 'error' | null>(null);

  // Learning Goals Save status indicator: 'saved' | 'saving' | 'error' | null
  const [lgSaveStatus, setLgSaveStatus] = React.useState<'saved' | 'saving' | 'error' | null>('saved');

  // Bulk Confirmation Modal State
  const [bulkModal, setBulkModal] = React.useState<{
    isOpen: boolean;
    goalId: string;
    goalText: string;
    value: 'A' | 'D' | 'B';
  }>({
    isOpen: false,
    goalId: '',
    goalText: '',
    value: 'D'
  });

  // Derived list of Learning Goals selected for current Midterm
  const activeGoalsForMidterm = React.useMemo(() => {
    const activeSet = new Set(activeGoalIds);
    return goals.filter(g => g && activeSet.has(g.id));
  }, [goals, activeGoalIds]);

  // Import Remarks Modal States
  const [isImportRemarksModalOpen, setIsImportRemarksModalOpen] = React.useState<boolean>(false);
  const [importRemarksMode, setImportRemarksMode] = React.useState<'single' | 'multi'>('single');
  const [singleTargetGoalId, setSingleTargetGoalId] = React.useState<string>('');
  const [remarksRawInput, setRemarksRawInput] = React.useState<string>('');
  const [remarksParsedRows, setRemarksParsedRows] = React.useState<any[]>([]);
  const [remarksHeaders, setRemarksHeaders] = React.useState<string[]>([]);
  const [remarksColumnMapping, setRemarksColumnMapping] = React.useState<Record<number, string>>({});
  const [remarksOverwrite, setRemarksOverwrite] = React.useState<boolean>(false);
  const [importRemarksSaving, setImportRemarksSaving] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (activeGoalsForMidterm.length > 0 && !singleTargetGoalId) {
      setSingleTargetGoalId(activeGoalsForMidterm[0].id);
    }
  }, [activeGoalsForMidterm, singleTargetGoalId]);

  const handleParseRemarksInput = () => {
    if (goalsLoadError || goals.length === 0) {
      toast.error('Daftar master goals belum siap.');
      return;
    }

    if (!remarksRawInput.trim()) {
      toast.error('Silakan paste data nilai terlebih dahulu.');
      return;
    }

    const lines = remarksRawInput.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
    if (lines.length === 0) {
      toast.error('Tidak ada data yang ditemukan.');
      return;
    }

    let isTsv = true;
    let headers = lines[0].split('\t');
    if (headers.length <= 1) {
      headers = lines[0].split(/,|;/);
      isTsv = false;
    }

    const cleanHeader = (h: string) => h.trim().toLowerCase().replace(/[\s_\-]/g, '');
    const isFullnameHeader = (h: string) => ['namalengkap', 'fullname', 'nama', 'studentname'].includes(cleanHeader(h));

    let fullnameColIndex = -1;
    headers.forEach((h, idx) => {
      if (isFullnameHeader(h)) fullnameColIndex = idx;
    });

    if (fullnameColIndex === -1) {
      toast.error("Header kolom nama tidak terdeteksi. Pastikan baris pertama tabel memiliki judul 'Nama Lengkap'.");
      return;
    }

    setRemarksHeaders(headers);

    const initialMapping: Record<number, string> = {};
    if (importRemarksMode === 'single') {
      const valColIdx = headers.findIndex((h, idx) => idx !== fullnameColIndex && cleanHeader(h) !== 'no' && cleanHeader(h) !== 'nomor');
      if (valColIdx !== -1 && singleTargetGoalId) {
        initialMapping[valColIdx] = singleTargetGoalId;
      }
    } else {
      headers.forEach((h, idx) => {
        if (idx === fullnameColIndex) return;
        if (cleanHeader(h) === 'no' || cleanHeader(h) === 'nomor') return;

        const cleanH = cleanHeader(h);
        const matchGoal = activeGoalsForMidterm.find(g => 
          g.id.toLowerCase() === cleanH || 
          g.text.toLowerCase().includes(h.trim().toLowerCase()) ||
          cleanH === `g${activeGoalsForMidterm.indexOf(g) + 1}`
        );

        if (matchGoal) {
          initialMapping[idx] = matchGoal.id;
        }
      });
    }

    setRemarksColumnMapping(initialMapping);

    const dataLines = lines.slice(1);
    const normalizeName = (n: string) => {
      if (!n) return '';
      return n.trim().toLowerCase().replace(/\s+/g, ' ');
    };

    const parsed = dataLines.map((line, lineIdx) => {
      const cells = isTsv ? line.split('\t') : line.split(/,|;/);
      const rawName = (cells[fullnameColIndex] || '').trim();
      
      const targetNormal = normalizeName(rawName);
      const matches = activeStudentsForGrading.filter(s => normalizeName(s.name) === targetNormal);

      let matchedStudent: Student | null = null;
      let nameStatus: 'VALID' | 'NAMA_TIDAK_DITEMUKAN' | 'AMBIGU' = 'VALID';

      if (matches.length === 1) {
        matchedStudent = matches[0];
      } else if (matches.length > 1) {
        nameStatus = 'AMBIGU';
      } else {
        nameStatus = 'NAMA_TIDAK_DITEMUKAN';
      }

      const valuesMap: Record<number, string> = {};
      cells.forEach((val, colIdx) => {
        if (colIdx !== fullnameColIndex) {
          valuesMap[colIdx] = val.trim();
        }
      });

      return {
        lineIndex: lineIdx + 2,
        rawName,
        matchedStudent,
        nameStatus,
        valuesMap
      };
    });

    setRemarksParsedRows(parsed);
    toast.success(`Berhasil memproses ${parsed.length} baris.`);
  };

  const evaluatedRows = React.useMemo(() => {
    return remarksParsedRows.map(row => {
      const colEntries = Object.entries(remarksColumnMapping);
      const goalsEvaluations = colEntries.map(([colIdxStr, goalId]) => {
        const colIdx = parseInt(colIdxStr, 10);
        const rawVal = (row.valuesMap[colIdx] || '').trim().toUpperCase();
        
        let status: 'VALID' | 'NILAI_TIDAK_VALID' | 'NAMA_TIDAK_DITEMUKAN' | 'NAMA_AMBIGU' | 'LG_AMBIGU' | 'HEADER_LG_TIDAK_DIKENALI' | 'SUDAH_ADA_NILAI' | 'KOSONG' = 'VALID';
        
        if (row.nameStatus === 'NAMA_TIDAK_DITEMUKAN') {
          status = 'NAMA_TIDAK_DITEMUKAN';
        } else if (row.nameStatus === 'AMBIGU') {
          status = 'NAMA_AMBIGU';
        } else if (!goalId) {
          status = 'HEADER_LG_TIDAK_DIKENALI';
        } else if (rawVal === '') {
          status = 'KOSONG';
        } else if (rawVal !== 'A' && rawVal !== 'D' && rawVal !== 'B') {
          status = 'NILAI_TIDAK_VALID';
        } else {
          if (row.matchedStudent) {
            const currentGrade = localRemarks[row.matchedStudent.id]?.[goalId] || studentDataMap[row.matchedStudent.id]?.remarks?.[goalId];
            if (currentGrade && currentGrade !== rawVal) {
              status = 'SUDAH_ADA_NILAI';
            }
          }
        }

        const targetGoal = activeGoalsForMidterm.find(g => g.id === goalId);

        return {
          goalId,
          goalText: targetGoal?.text || 'Goal',
          val: rawVal,
          status,
          currentGrade: row.matchedStudent ? (localRemarks[row.matchedStudent.id]?.[goalId] || studentDataMap[row.matchedStudent.id]?.remarks?.[goalId] || '-') : '-'
        };
      }).filter(Boolean);

      let overallStatus: 'VALID' | 'NILAI_TIDAK_VALID' | 'NAMA_TIDAK_DITEMUKAN' | 'NAMA_AMBIGU' | 'HEADER_LG_TIDAK_DIKENALI' | 'SUDAH_ADA_NILAI' | 'KOSONG' = 'VALID';
      
      if (row.nameStatus === 'NAMA_TIDAK_DITEMUKAN') {
        overallStatus = 'NAMA_TIDAK_DITEMUKAN';
      } else if (row.nameStatus === 'AMBIGU') {
        overallStatus = 'NAMA_AMBIGU';
      } else if (goalsEvaluations.length === 0) {
        overallStatus = 'HEADER_LG_TIDAK_DIKENALI';
      } else if (goalsEvaluations.some(g => g.status === 'NILAI_TIDAK_VALID')) {
        overallStatus = 'NILAI_TIDAK_VALID';
      } else if (goalsEvaluations.some(g => g.status === 'HEADER_LG_TIDAK_DIKENALI')) {
        overallStatus = 'HEADER_LG_TIDAK_DIKENALI';
      } else if (goalsEvaluations.every(g => g.status === 'KOSONG')) {
        overallStatus = 'KOSONG';
      } else if (goalsEvaluations.some(g => g.status === 'SUDAH_ADA_NILAI')) {
        overallStatus = 'SUDAH_ADA_NILAI';
      }

      const checked = (overallStatus === 'VALID' || (overallStatus === 'SUDAH_ADA_NILAI' && remarksOverwrite)) && row.nameStatus === 'VALID';

      return {
        ...row,
        goalsEvaluations,
        overallStatus,
        checked
      };
    });
  }, [remarksParsedRows, remarksColumnMapping, remarksOverwrite, localRemarks, studentDataMap, activeGoalsForMidterm]);

  const handleSaveRemarksImport = async () => {
    const targets = evaluatedRows.filter(r => r.checked && r.matchedStudent);
    if (targets.length === 0) {
      toast.error('Tidak ada baris valid yang dicentang.');
      return;
    }

    setImportRemarksSaving(true);
    let successCount = 0;
    let skipCount = 0;

    try {
      const batch = writeBatch(db);

      for (const row of targets) {
        if (!row.matchedStudent) continue;
        const studentId = row.matchedStudent.id;
        const docId = `${studentId}_${selectedYear.replace(/\//g, '_')}_S${selectedSemester}_T${selectedTerm}`;
        const docRef = doc(db, 'elem_midterm_student_data', docId);

        const existingData = studentDataMap[studentId];
        const currentRemarks = existingData?.remarks && typeof existingData.remarks === 'object'
          ? { ...existingData.remarks }
          : {};

        if (localRemarks[studentId]) {
          Object.assign(currentRemarks, localRemarks[studentId]);
        }

        let updatedAny = false;
        row.goalsEvaluations.forEach(ge => {
          if (ge.status === 'KOSONG') return;
          
          if (ge.status === 'SUDAH_ADA_NILAI' && !remarksOverwrite) {
            skipCount++;
            return;
          }

          currentRemarks[ge.goalId] = ge.val;
          updatedAny = true;
        });

        if (updatedAny) {
          batch.set(docRef, {
            id: docId,
            studentId,
            studentName: row.matchedStudent.name,
            classId: selectedClassId,
            academicYear: selectedYear,
            semester: selectedSemester,
            midtermTerm: selectedTerm,
            remarks: currentRemarks,
            updatedAt: Date.now(),
            updatedBy: currentUser?.uid || (currentUser as any)?.id || 'system'
          }, { merge: true });

          setLocalRemarks(prev => ({
            ...prev,
            [studentId]: {
              ...(prev[studentId] || {}),
              ...currentRemarks
            }
          }));

          successCount++;
        }
      }

      await batch.commit();
      toast.success(`Berhasil mengimpor nilai untuk ${successCount} siswa.`);
      if (skipCount > 0) {
        toast.info(`${skipCount} nilai dilewati karena sudah memiliki nilai sebelumnya.`);
      }

      setIsImportRemarksModalOpen(false);
      setRemarksParsedRows([]);
      setRemarksRawInput('');
      await onRefreshData(true);
    } catch (err: any) {
      console.error(err);
      toast.error('Gagal mengimpor nilai: ' + err.message);
    } finally {
      setImportRemarksSaving(false);
    }
  };

  // Synchronize master goals when effectiveSubjectKey or masterGoalsMap changes
  React.useEffect(() => {
    if (currentSubjectMasterDoc && Array.isArray(currentSubjectMasterDoc.goals)) {
      setGoals(currentSubjectMasterDoc.goals);
      if (Array.isArray(currentSubjectMasterDoc.activeGoalIds)) {
        setActiveGoalIds(currentSubjectMasterDoc.activeGoalIds);
      } else {
        // Default to all goals active for backwards compatibility
        setActiveGoalIds(currentSubjectMasterDoc.goals.map(g => g.id));
      }
      setGoalsLoadError(false);
    } else {
      // Offline/Default fallback if no master doc exists in cache/DB
      const loadDefaultGoals = async () => {
        try {
          const defaultGoalsMap = await fetchElementaryMidtermMasterGoals(
            selectedClassId,
            selectedYear,
            selectedSemester,
            selectedTerm
          );
          const masterGoalDoc = defaultGoalsMap && defaultGoalsMap[effectiveSubjectKey];
          if (masterGoalDoc && Array.isArray(masterGoalDoc.goals)) {
            const mapped = masterGoalDoc.goals.map((g: any, idx: number) => ({
              id: g.id || g.code || `goal_${idx + 1}`,
              text: g.text || g.goalText || `Goal ${idx + 1}`,
              order: idx + 1
            }));
            setGoals(mapped);
            setActiveGoalIds(mapped.map(g => g.id));
            setGoalsLoadError(false);
          } else {
            setGoals([]);
            setActiveGoalIds([]);
            setGoalsLoadError(false);
          }
        } catch (e) {
          console.warn("Could not fetch default system goals:", e);
          setGoals([]);
          setActiveGoalIds([]);
          setGoalsLoadError(true);
        }
      };
      loadDefaultGoals();
    }
  }, [effectiveSubjectKey, currentSubjectMasterDoc, selectedClass, selectedYear, activeSubject]);

  // Check if a goal has existing student grades recorded
  const checkGoalHasGrades = (goalId: string): boolean => {
    const allStudentIds = Array.from(new Set([...Object.keys(localRemarks), ...Object.keys(studentDataMap)]));
    for (const sId of allStudentIds) {
      const remark = localRemarks[sId]?.[goalId] || studentDataMap[sId]?.remarks?.[goalId];
      if (remark && ['A', 'D', 'B'].includes(remark)) {
        return true;
      }
    }
    return false;
  };

  // Update activeGoalIds in Firestore for current class and subject
  const updateActiveGoalIdsInDb = async (newActiveIds: string[]) => {
    const previousActiveIds = [...activeGoalIds];
    setActiveGoalIds(newActiveIds);
    setLgSaveStatus('saving');
    try {
      await saveElementaryMidtermActiveGoalIds(
        selectedClassId,
        selectedYear,
        selectedSemester,
        selectedTerm,
        effectiveSubjectKey,
        newActiveIds,
        currentUser
      );
      setLgSaveStatus('saved');
      await onRefreshData(true); // Silent reload in background
    } catch (err) {
      console.error("Error updating active goal IDs:", err);
      setActiveGoalIds(previousActiveIds); // Rollback state!
      setLgSaveStatus('error');
    }
  };

  // Toggle goal active state in Bank
  const handleToggleGoalActive = async (goal: ElementaryMidtermGoalItem) => {
    const isCurrentlyActive = activeGoalIds.includes(goal.id);

    if (isCurrentlyActive) {
      if (checkGoalHasGrades(goal.id)) {
        setUncheckConfirmModal({
          isOpen: true,
          goalId: goal.id,
          goalText: goal.text
        });
        return;
      }
      const newActive = activeGoalIds.filter(id => id !== goal.id);
      await updateActiveGoalIdsInDb(newActive);
    } else {
      const newActive = [...activeGoalIds, goal.id];
      await updateActiveGoalIdsInDb(newActive);
    }
  };

  // Confirm unchecking a goal that already has student grades
  const confirmUncheckGoalWithGrades = async () => {
    const { goalId } = uncheckConfirmModal;
    if (!goalId) return;
    setUncheckConfirmModal({ isOpen: false, goalId: '', goalText: '' });
    const newActive = activeGoalIds.filter(id => id !== goalId);
    await updateActiveGoalIdsInDb(newActive);
  };

  // Keep selectedImportUa in sync with active UAs
  React.useEffect(() => {
    if (activeGradeUas.length > 0 && (!selectedImportUa || !activeGradeUas.includes(selectedImportUa))) {
      setSelectedImportUa(activeUaTab || activeGradeUas[0]);
    }
  }, [activeGradeUas, activeUaTab, selectedImportUa]);

  // Synchronize studentRemarks and studentUaSelection from props into local state
  React.useEffect(() => {
    const remarksMap: Record<string, Record<string, string>> = {};
    const uasMap: Record<string, string> = {};

    Object.keys(studentDataMap).forEach(sId => {
      remarksMap[sId] = { ...(studentDataMap[sId]?.remarks || {}) };
      if (studentDataMap[sId]?.performingArtsUA) {
        uasMap[sId] = studentDataMap[sId].performingArtsUA;
      }
    });

    setLocalRemarks(remarksMap);
    setStudentUaSelection(uasMap);
    setSavedStudentUaSelection(uasMap);
  }, [studentDataMap]);

  // Check for unsaved local student UA changes
  const hasPendingUaChanges = React.useMemo(() => {
    const allKeys = Array.from(new Set([...Object.keys(studentUaSelection), ...Object.keys(savedStudentUaSelection)]));
    return allKeys.some(k => (studentUaSelection[k] || '') !== (savedStudentUaSelection[k] || ''));
  }, [studentUaSelection, savedStudentUaSelection]);

  // Handle Student UA assignment local change (NO auto save, NO page refresh)
  const handleStudentUaChange = (studentId: string, studentName: string, selectedUa: string) => {
    setStudentUaSelection(prev => ({ ...prev, [studentId]: selectedUa }));
    setUaSaveStatus(null);
  };

  // Handle saving all Student UA changes in batch to Firestore
  const handleSaveAllStudentUas = async () => {
    setUaSaveStatus('saving');
    try {
      const assignments: Array<{
        studentId: string;
        studentName: string;
        classId: string;
        performingArtsUA: string;
      }> = [];

      // Include all current class students
      students.forEach(st => {
        assignments.push({
          studentId: st.id,
          studentName: st.name,
          classId: selectedClassId,
          performingArtsUA: studentUaSelection[st.id] || ''
        });
      });

      // Include any other imported students from other classes
      importStudentsList.forEach(st => {
        if (st.id && studentUaSelection[st.id] !== undefined) {
          if (!assignments.some(a => a.studentId === st.id)) {
            assignments.push({
              studentId: st.id,
              studentName: st.name,
              classId: (st as any).classId || selectedClassId,
              performingArtsUA: studentUaSelection[st.id] || ''
            });
          }
        }
      });

      await saveBulkElementaryMidtermStudentPerformingArtsUa(
        assignments,
        selectedYear,
        selectedSemester,
        selectedTerm,
        currentUser
      );

      setSavedStudentUaSelection({ ...studentUaSelection });
      setUaSaveStatus('saved');
    } catch (e) {
      console.error("Error saving bulk student UAs:", e);
      setUaSaveStatus('error');
    }
  };

  // Load student roster across same grade classes for import matching
  const loadImportRoster = React.useCallback(async () => {
    setLoadingImportRoster(true);
    try {
      const combined: Array<Student & { className?: string }> = [];
      const seenIds = new Set<string>();

      students.forEach(st => {
        if (st && st.id) {
          seenIds.add(st.id);
          combined.push({ ...st, className: selectedClass?.name || '' });
        }
      });

      const otherClasses = sameGradeClasses.filter(c => c && c.id !== selectedClassId);
      if (otherClasses.length > 0) {
        const results = await Promise.all(
          otherClasses.map(c => getActiveStudents(c.id, selectedYear).catch(() => []))
        );
        results.forEach((stList, idx) => {
          const clsName = otherClasses[idx]?.name || '';
          if (Array.isArray(stList)) {
            stList.forEach(st => {
              if (st && st.id && !seenIds.has(st.id)) {
                seenIds.add(st.id);
                combined.push({ ...st, className: clsName });
              }
            });
          }
        });
      }

      setImportStudentsList(combined);
    } catch (err) {
      console.warn("Could not load full import roster:", err);
    } finally {
      setLoadingImportRoster(false);
    }
  }, [students, selectedClass, sameGradeClasses, selectedClassId, selectedYear]);

  // Compute live import preview matching
  const importPreview = React.useMemo(() => {
    if (!importRawText.trim()) {
      return { matchedList: [], unmatchedList: [], matchedCount: 0, duplicateCount: 0, overwriteCount: 0 };
    }

    const lines = importRawText.split('\n').map(l => l.trim()).filter(Boolean);
    const matchedList: Array<{ student: Student & { className?: string }; willChange: boolean; reason: string }> = [];
    const unmatchedList: Array<{ rawName: string; rawClass: string }> = [];

    let duplicateCount = 0;
    let overwriteCount = 0;

    const roster = importStudentsList.length > 0
      ? importStudentsList
      : students.map(s => ({ ...s, className: selectedClass?.name || '' }));

    lines.forEach(line => {
      const lowerLine = line.toLowerCase();
      if (lowerLine.startsWith('nama') || lowerLine.startsWith('student') || lowerLine.includes('nama siswa\t')) {
        return;
      }

      let parts = line.split('\t');
      if (parts.length < 2) {
        if (line.includes(',')) parts = line.split(',');
        else if (/\s{2,}/.test(line)) parts = line.split(/\s{2,}/);
      }

      const rawName = (parts[0] || '').trim();
      const rawClass = (parts[1] || '').trim();

      if (!rawName) return;

      const normInputName = rawName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const normInputClass = rawClass.toLowerCase().replace(/grade|kelas|elementary|sd/gi, '').replace(/[^a-z0-9]/g, '');

      const match = roster.find(st => {
        const stNormName = (st.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const stNormClass = (st.className || '').toLowerCase().replace(/grade|kelas|elementary|sd/gi, '').replace(/[^a-z0-9]/g, '');

        if (!stNormName) return false;
        const isNameMatched = stNormName === normInputName || stNormName.includes(normInputName) || normInputName.includes(stNormName);

        if (!isNameMatched) return false;

        if (normInputClass) {
          return stNormClass.includes(normInputClass) || normInputClass.includes(stNormClass);
        }
        return true;
      });

      if (match) {
        const existingUa = studentUaSelection[match.id] || '';
        let willChange = false;
        let reason = 'NEW';

        if (existingUa === selectedImportUa) {
          duplicateCount++;
          reason = 'DUPLICATE';
        } else if (existingUa) {
          if (overwriteExisting) {
            willChange = true;
            overwriteCount++;
            reason = 'OVERWRITE';
          } else {
            reason = 'SKIP_EXISTS';
          }
        } else {
          willChange = true;
          reason = 'NEW';
        }

        matchedList.push({ student: match, willChange, reason });
      } else {
        unmatchedList.push({ rawName, rawClass });
      }
    });

    const validMatchedCount = matchedList.filter(m => m.willChange || m.reason === 'DUPLICATE').length;

    return {
      matchedList,
      unmatchedList,
      matchedCount: validMatchedCount,
      duplicateCount,
      overwriteCount
    };
  }, [importRawText, importStudentsList, students, selectedClass, studentUaSelection, selectedImportUa, overwriteExisting]);

  const executeApplyImport = () => {
    if (importPreview.matchedList.length === 0) return;

    const updatedSelection = { ...studentUaSelection };
    let appliedCount = 0;

    importPreview.matchedList.forEach(m => {
      if (m.willChange) {
        updatedSelection[m.student.id] = selectedImportUa;
        appliedCount++;
      }
    });

    setStudentUaSelection(updatedSelection);
    setShowImportUaModal(false);
    setImportRawText('');

    setImportSuccessMsg(`✓ Hasil import berhasil diterapkan (${appliedCount} siswa). Klik 'Simpan Perubahan' untuk menyimpan.`);
    setTimeout(() => {
      setImportSuccessMsg(null);
    }, 8000);
  };

  // Handle adding or editing a Goal
  const handleSaveGoal = async () => {
    if (!goalTextInput.trim()) return;

    if (editingGoalId) {
      // Editing existing goal for current selected class
      const previousGoals = [...goals];
      const updatedGoals = goals.map(g => g.id === editingGoalId ? { ...g, text: goalTextInput.trim() } : g);
      setGoals(updatedGoals);
      setGoalTextInput('');
      setEditingGoalId(null);
      setLgSaveStatus('saving');
      try {
        const category = activeSubject === 'Projects' ? 'PROJECTS' : 'SUBJECTS';
        await saveElementaryMidtermMasterGoals(
          selectedClassId,
          selectedClass?.name || '',
          selectedYear,
          selectedSemester,
          selectedTerm,
          effectiveSubjectKey,
          category,
          updatedGoals,
          currentUser,
          activeGoalIds
        );
        setLgSaveStatus('saved');
        await onRefreshData(true); // Silent reload in background
      } catch (e) {
        console.error("Error editing goal:", e);
        setGoals(previousGoals); // Rollback
        setLgSaveStatus('error');
      }
    } else {
      // Adding new goal -> check selected target classes & open confirmation modal
      if (selectedTargetClassIds.length === 0) {
        alert("Pilih minimal satu kelas untuk menerapkan Learning Goal.");
        return;
      }
      setShowAddGoalConfirmModal(true);
    }
  };

  // Execute bulk save of new Learning Goal across all selected target classes
  const executeAddGoalBulk = async () => {
    if (!goalTextInput.trim() || selectedTargetClassIds.length === 0) return;

    const goalText = goalTextInput.trim();
    const tempGoalId = `goal_temp_${Date.now()}`;
    const newGoalItem: ElementaryMidtermGoalItem = {
      id: tempGoalId,
      text: goalText,
      order: goals.length + 1
    };

    const previousGoals = [...goals];
    const previousActiveIds = [...activeGoalIds];

    // Optimistic state update for current class if selected
    const currentClassIsTarget = selectedTargetClassIds.includes(selectedClassId);
    if (currentClassIsTarget) {
      setGoals(prev => [...prev, newGoalItem]);
      if (useForMidtermNewGoal) {
        setActiveGoalIds(prev => [...prev, tempGoalId]);
      }
    }

    setSavingGoals(true);
    setLgSaveStatus('saving');
    setShowAddGoalConfirmModal(false);

    try {
      const category = activeSubject === 'Projects' ? 'PROJECTS' : 'SUBJECTS';
      const targetClassesToApply = sameGradeClasses.filter(c => selectedTargetClassIds.includes(c.id));

      await saveBulkElementaryMidtermMasterGoalForClasses(
        targetClassesToApply,
        selectedYear,
        selectedSemester,
        selectedTerm,
        effectiveSubjectKey,
        category,
        goalText,
        currentUser,
        useForMidtermNewGoal
      );

      const count = selectedTargetClassIds.length;
      setBulkGoalSuccessMsg(`✓ Learning Goal berhasil diterapkan ke ${count} kelas.`);
      setGoalTextInput('');
      setLgSaveStatus('saved');

      await onRefreshData(true); // Silent reload in background

      setTimeout(() => {
        setBulkGoalSuccessMsg(null);
      }, 6000);
    } catch (e) {
      console.error("Error bulk adding learning goal:", e);
      // Rollback on error
      if (currentClassIsTarget) {
        setGoals(previousGoals);
        setActiveGoalIds(previousActiveIds);
      }
      setLgSaveStatus('error');
    } finally {
      setSavingGoals(false);
    }
  };

  const handleDeleteGoal = async (goalId: string) => {
    if (!confirm("Apakah Anda yakin ingin menghapus Goal ini dari Bank?")) return;
    const previousGoals = [...goals];
    const previousActiveIds = [...activeGoalIds];

    const updatedGoals = goals.filter(g => g.id !== goalId);
    const updatedActiveIds = activeGoalIds.filter(id => id !== goalId);

    setGoals(updatedGoals);
    setActiveGoalIds(updatedActiveIds);
    setSavingGoals(true);
    setLgSaveStatus('saving');

    try {
      const category = activeSubject === 'Projects' ? 'PROJECTS' : 'SUBJECTS';
      await saveElementaryMidtermMasterGoals(
        selectedClassId,
        selectedClass?.name || '',
        selectedYear,
        selectedSemester,
        selectedTerm,
        effectiveSubjectKey,
        category,
        updatedGoals,
        currentUser,
        updatedActiveIds
      );
      setLgSaveStatus('saved');
      await onRefreshData(true); // Silent reload in background
    } catch (e) {
      console.error("Error deleting goal:", e);
      setGoals(previousGoals);
      setActiveGoalIds(previousActiveIds);
      setLgSaveStatus('error');
    } finally {
      setSavingGoals(false);
    }
  };

  // Handle Individual Remark Click
  const handleRemarkChange = async (studentId: string, studentName: string, goalId: string, value: 'A' | 'D' | 'B') => {
    // Immediate optimistic local update
    setLocalRemarks(prev => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        [goalId]: value
      }
    }));

    setSaveStatus('saving');
    try {
      await saveElementaryMidtermStudentRemark(
        studentId,
        studentName,
        selectedClassId,
        selectedYear,
        selectedSemester,
        selectedTerm,
        goalId,
        value,
        currentUser
      );
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2500);
    } catch (e) {
      console.error("Error saving remark:", e);
      setSaveStatus('error');
    }
  };

  // Confirm and Execute Bulk Action
  const executeBulkRemark = async () => {
    const { goalId, value } = bulkModal;
    if (!goalId || !value) return;

    // Local optimistic update for active students for this goalId ONLY
    setLocalRemarks(prev => {
      const updated = { ...prev };
      activeStudentsForGrading.forEach(st => {
        if (st.id) {
          updated[st.id] = {
            ...(updated[st.id] || {}),
            [goalId]: value
          };
        }
      });
      return updated;
    });

    setSaveStatus('saving');
    setBulkModal(prev => ({ ...prev, isOpen: false }));

    try {
      const studentList = activeStudentsForGrading.map(s => ({ id: s.id, name: s.name }));
      await saveBulkElementaryMidtermStudentRemarks(
        selectedClassId,
        selectedYear,
        selectedSemester,
        selectedTerm,
        goalId,
        value,
        studentList,
        currentUser
      );
      setSaveStatus('saved');
      await onRefreshData();
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (e) {
      console.error("Error executing bulk action:", e);
      setSaveStatus('error');
    }
  };

  return (
    <div className="space-y-8">
      {/* Subject Navigation Tabs */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2 text-slate-800 font-black uppercase text-xs tracking-wider">
            <BookOpen size={16} className="text-emerald-600" />
            <span>Pilih Mata Pelajaran / Subjek:</span>
          </div>
          {saveStatus && (
            <div className="flex items-center gap-2 text-xs font-bold transition-all">
              {saveStatus === 'saving' && (
                <span className="text-amber-600 flex items-center gap-1.5 animate-pulse">
                  <RefreshCw size={14} className="animate-spin" />
                  Menyimpan...
                </span>
              )}
              {saveStatus === 'saved' && (
                <span className="text-emerald-600 flex items-center gap-1.5">
                  <CheckCircle2 size={14} />
                  Semua perubahan tersimpan
                </span>
              )}
              {saveStatus === 'error' && (
                <span className="text-red-600 flex items-center gap-1.5">
                  <AlertCircle size={14} />
                  Gagal menyimpan. Coba lagi.
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {elementarySubjects.map(subj => {
            const isActive = activeSubject === subj;
            const isProject = subj === 'Projects';
            return (
              <button
                key={subj}
                onClick={() => setActiveSubject(subj)}
                className={`px-4 py-2 rounded-2xl text-xs font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
                  isActive
                    ? isProject
                      ? 'bg-purple-900 text-white shadow-sm ring-2 ring-purple-300'
                      : 'bg-emerald-800 text-white shadow-sm ring-2 ring-emerald-300'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                {subj}
              </button>
            );
          })}
        </div>

        {/* Performing Arts Unit Activity Sub-Tabs */}
        {activeSubject === 'Performing Arts' && (
          <div className="mt-4 pt-3 border-t border-slate-100 bg-purple-50/60 p-4 rounded-2xl border border-purple-100 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-purple-950 font-black text-xs uppercase tracking-wider">
                <Music size={16} className="text-purple-700" />
                <span>Unit Activity Performing Arts (Kelas {selectedClass?.name || ''} — Level Grade {gradeNum}):</span>
              </div>
              <span className="text-[11px] font-semibold text-purple-700">
                Unit Activity khusus tingkat Kelas {gradeNum <= 2 ? '1–2' : gradeNum <= 4 ? '3–4' : '5–6'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {activeGradeUas.map(ua => {
                const isUaActive = activeUaTab === ua;
                return (
                  <button
                    key={ua}
                    onClick={() => setActiveUaTab(ua)}
                    className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                      isUaActive
                        ? 'bg-purple-900 text-white shadow-sm ring-2 ring-purple-300'
                        : 'bg-white text-purple-900 hover:bg-purple-100 border border-purple-200'
                    }`}
                  >
                    {ua}
                  </button>
                );
              })}

              <button
                onClick={() => setShowAddUaModal(true)}
                className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs"
              >
                <Plus size={14} />
                <span>+ Tambah Unit Activity</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 1: BANK LEARNING GOALS & SELECTION FOR MIDTERM */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center flex-wrap gap-2 text-emerald-800 text-xs font-black uppercase tracking-wider mb-1">
              <BookOpen size={16} />
              <span>Bank Learning Goals — {activeSubject} {activeSubject === 'Performing Arts' && activeUaTab ? `(${activeUaTab})` : ''}</span>
              
              {lgSaveStatus === 'saving' && (
                <span className="inline-flex items-center gap-1 text-[11px] font-black text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full animate-pulse transition-all">
                  <RefreshCw size={11} className="animate-spin text-amber-500" />
                  Menyimpan...
                </span>
              )}
              {lgSaveStatus === 'saved' && (
                <span className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full transition-all animate-in fade-in duration-300">
                  ✓ Semua perubahan tersimpan
                </span>
              )}
              {lgSaveStatus === 'error' && (
                <span className="inline-flex items-center gap-1 text-[11px] font-black text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full transition-all">
                  Gagal menyimpan. Coba lagi.
                </span>
              )}
            </div>
            <h2 className="text-base font-black text-slate-900 tracking-tight">
              Daftar Semua Learning Goals Terdaftar ({goals.length})
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Centang Learning Goals yang dipakai untuk Midterm {selectedTerm} (Tahun Ajaran {selectedYear}, Semester {selectedSemester}). Goal yang tidak dicentang tetap tersimpan di Bank.
            </p>
          </div>

          {/* Counter Summary Badge & Quick Selection Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="px-3.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-950 text-xs font-black flex items-center gap-1.5 shadow-2xs">
              <CheckCircle2 size={15} className="text-emerald-600" />
              <span>{activeGoalsForMidterm.length} dari {goals.length} Learning Goals dipakai pada Midterm {selectedTerm}</span>
            </div>

            {goals.length > 0 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => updateActiveGoalIdsInDb(goals.map(g => g.id))}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold rounded-lg transition-all cursor-pointer"
                  title="Pilih semua goal untuk Midterm"
                >
                  Pilih Semua
                </button>
                <button
                  type="button"
                  onClick={() => updateActiveGoalIdsInDb([])}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-bold rounded-lg transition-all cursor-pointer"
                  title="Kosongkan pilihan Midterm"
                >
                  Kosongkan
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 1. BANK LEARNING GOALS LIST WITH CHECKBOXES */}
        <div className="space-y-3">
          <div className="text-xs font-black uppercase tracking-wider text-slate-500">
            Bank Learning Goals:
          </div>
          {goalsLoadError ? (
            <div className="p-6 bg-red-50 text-red-800 rounded-2xl border border-red-200 text-center text-xs font-bold space-y-1">
              <p>Learning Goals belum dapat dimuat. Silakan coba Refresh Data.</p>
              <button 
                type="button" 
                onClick={() => onRefreshData()}
                className="mt-2 px-3 py-1 bg-red-100 hover:bg-red-200 text-red-900 rounded-lg text-[10.5px] uppercase font-black tracking-wider transition-all cursor-pointer font-bold"
              >
                Refresh Data
              </button>
            </div>
          ) : goals.length === 0 ? (
            <div className="p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center text-xs text-slate-400 font-medium">
              Belum ada Learning Goals di Bank untuk {activeSubject === 'Performing Arts' ? `Performing Arts (${activeUaTab})` : activeSubject}. Tambahkan di bawah.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5">
              {goals.map((goal, idx) => {
                const isSelected = activeGoalIds.includes(goal.id);
                const hasGrades = checkGoalHasGrades(goal.id);

                return (
                  <div 
                    key={goal.id} 
                    className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all text-xs ${
                      isSelected
                        ? 'bg-emerald-50/70 border-emerald-200 shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100/80 border-slate-200/80'
                    }`}
                  >
                    <div className="flex items-start gap-3 flex-1 mr-2">
                      <label className="flex items-start gap-3 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleGoalActive(goal)}
                          className="w-4 h-4 mt-0.5 rounded text-emerald-700 focus:ring-emerald-500 border-slate-300 cursor-pointer"
                        />
                        <div className="space-y-0.5">
                          <p className={`font-semibold leading-relaxed ${isSelected ? 'text-emerald-950 font-bold' : 'text-slate-700'}`}>
                            {goal.text}
                          </p>
                          <div className="flex items-center gap-2 pt-0.5">
                            {isSelected ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md">
                                <Check size={11} /> Dipakai untuk Midterm {selectedTerm}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 bg-slate-200/60 px-2 py-0.5 rounded-md">
                                Tersimpan di Bank (Tidak tampil di Rapor)
                              </span>
                            )}
                            {hasGrades && (
                              <span className="text-[10px] font-extrabold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md" title="Goal ini memiliki nilai siswa yang sudah diinput">
                                ★ Ada Nilai
                              </span>
                            )}
                          </div>
                        </div>
                      </label>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingGoalId(goal.id);
                          setGoalTextInput(goal.text);
                        }}
                        className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl transition-all cursor-pointer"
                        title="Edit Goal"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteGoal(goal.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all cursor-pointer"
                        title="Hapus Goal dari Bank"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 2. LEARNING GOALS DIPAKAI UNTUK MIDTERM ACTIVE SUMMARY BOX */}
        <div className="bg-emerald-900/5 p-4 rounded-2xl border border-emerald-200/80 space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black text-emerald-950 uppercase tracking-wider flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600" />
              <span>Learning Goals Dipakai untuk Midterm {selectedTerm} ({activeGoalsForMidterm.length})</span>
            </h3>
            <span className="text-[11px] font-bold text-emerald-800">
              {activeGoalsForMidterm.length} Goal Tampil di Tabel & PDF
            </span>
          </div>

          {activeGoalsForMidterm.length === 0 ? (
            <p className="text-xs text-amber-800 font-semibold bg-amber-50 p-3 rounded-xl border border-amber-200">
              Belum ada Learning Goal yang dicentang untuk Midterm {selectedTerm}. Silakan centang goal pada Bank Learning Goals di atas.
            </p>
          ) : (
            <div className="space-y-1.5">
              {activeGoalsForMidterm.map((g, idx) => (
                <div key={g.id} className="flex items-center gap-2.5 text-xs bg-white p-2.5 rounded-xl border border-emerald-200/60 shadow-2xs">
                  <span className="w-5 h-5 rounded-lg bg-emerald-800 text-white font-black text-[10px] flex items-center justify-center shrink-0">
                    G{idx + 1}
                  </span>
                  <span className="font-bold text-slate-800">{g.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bulk Success Alert Message */}
        {bulkGoalSuccessMsg && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-2xl text-xs font-extrabold text-emerald-900 flex items-center justify-between shadow-2xs animate-in fade-in duration-200">
            <span className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              {bulkGoalSuccessMsg}
            </span>
            <button
              onClick={() => setBulkGoalSuccessMsg(null)}
              className="text-emerald-700 hover:text-emerald-900 font-black text-xs px-2 py-0.5 rounded-lg hover:bg-emerald-100 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Add/Edit Goal Input Box */}
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
          <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider">
            {editingGoalId ? 'Edit Learning Goal' : `+ Tambah Learning Goal Baru (${activeSubject === 'Performing Arts' ? activeUaTab : activeSubject})`}
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={goalTextInput}
              onChange={(e) => setGoalTextInput(e.target.value)}
              placeholder="Tulis kalimat indikator Learning Goal..."
              className="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <div className="flex gap-2">
              <button
                onClick={handleSaveGoal}
                disabled={savingGoals || !goalTextInput.trim() || (!editingGoalId && selectedTargetClassIds.length === 0)}
                className="px-5 py-2.5 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all"
              >
                {savingGoals ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                <span>{editingGoalId ? 'Simpan Edit' : 'Tambah'}</span>
              </button>
              {editingGoalId && (
                <button
                  onClick={() => {
                    setEditingGoalId(null);
                    setGoalTextInput('');
                  }}
                  className="px-4 py-2.5 bg-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-300 transition-all cursor-pointer"
                >
                  Batal
                </button>
              )}
            </div>
          </div>

          {!editingGoalId && (
            <div className="flex items-center gap-2 pt-1">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={useForMidtermNewGoal}
                  onChange={(e) => setUseForMidtermNewGoal(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-700 focus:ring-emerald-500 border-slate-300 cursor-pointer"
                />
                <span>Langsung gunakan Goal ini untuk Midterm {selectedTerm}</span>
              </label>
            </div>
          )}

          {/* Multi-select Checkboxes for Target Classes */}
          {!editingGoalId && sameGradeClasses.length > 0 && (
            <div className="pt-3 border-t border-slate-200/80 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                  Terapkan ke Kelas:
                </label>
                <div className="flex items-center gap-2 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setSelectedTargetClassIds(sameGradeClasses.map(c => c.id))}
                    className="text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
                  >
                    Pilih Semua Kelas Grade {gradeNum}
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => setSelectedTargetClassIds([selectedClassId])}
                    className="text-slate-500 hover:text-slate-700 hover:underline cursor-pointer"
                  >
                    Hanya {selectedClass?.name || 'Kelas Ini'}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2.5 p-3 bg-white rounded-xl border border-slate-200">
                {sameGradeClasses.map(cls => {
                  const isChecked = selectedTargetClassIds.includes(cls.id);
                  return (
                    <label
                      key={cls.id}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                        isChecked
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-900 shadow-2xs ring-1 ring-emerald-200'
                          : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedTargetClassIds(prev => [...prev, cls.id]);
                          } else {
                            setSelectedTargetClassIds(prev => prev.filter(id => id !== cls.id));
                          }
                        }}
                        className="w-4 h-4 rounded text-emerald-700 focus:ring-emerald-500 border-slate-300 cursor-pointer"
                      />
                      <span>{cls.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SECTION 2 (SPECIAL): TABEL PENETAPAN UNIT ACTIVITY SISWA (PERFORMING ARTS) */}
      {activeSubject === 'Performing Arts' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                <User size={18} className="text-purple-600" />
                <span>Tabel Penetapan Unit Activity Performing Arts Siswa</span>
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Pilih Unit Activity untuk tiap siswa pada kelas {selectedClass?.name || ''}. Data diubah di tampilan lokal terlebih dahulu, lalu klik 'Simpan Perubahan'.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {/* Import Peserta UA Button */}
              <button
                onClick={() => {
                  setShowImportUaModal(true);
                  loadImportRoster();
                }}
                className="px-4 py-2 bg-purple-100 hover:bg-purple-200 text-purple-950 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all border border-purple-200 shadow-2xs"
              >
                <Upload size={14} className="text-purple-700" />
                <span>Import Peserta UA</span>
              </button>

              {/* Simpan Perubahan Button */}
              <button
                onClick={handleSaveAllStudentUas}
                disabled={uaSaveStatus === 'saving' || (!hasPendingUaChanges && uaSaveStatus !== 'error')}
                className={`px-5 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-sm ${
                  hasPendingUaChanges
                    ? 'bg-emerald-800 hover:bg-emerald-900 text-white ring-2 ring-emerald-300 animate-pulse'
                    : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                }`}
              >
                {uaSaveStatus === 'saving' ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} />
                    <span>Simpan Perubahan</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Status Indicators & Notification Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
            <div className="text-xs font-bold flex items-center gap-2">
              {hasPendingUaChanges ? (
                <span className="text-amber-800 bg-amber-50 border border-amber-300 px-3 py-1 rounded-xl flex items-center gap-1.5 shadow-2xs">
                  <AlertCircle size={14} className="text-amber-600 shrink-0 animate-pulse" />
                  Perubahan belum disimpan
                </span>
              ) : uaSaveStatus === 'saved' ? (
                <span className="text-emerald-800 bg-emerald-50 border border-emerald-300 px-3 py-1 rounded-xl flex items-center gap-1.5 shadow-2xs">
                  <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                  ✓ Perubahan peserta Unit Activity berhasil disimpan
                </span>
              ) : uaSaveStatus === 'error' ? (
                <span className="text-red-800 bg-red-50 border border-red-300 px-3 py-1 rounded-xl flex items-center gap-1.5">
                  <AlertCircle size={14} className="text-red-600 shrink-0" />
                  Gagal menyimpan. Coba lagi.
                </span>
              ) : (
                <span className="text-slate-500 font-semibold flex items-center gap-1.5 text-[11px]">
                  <CheckCircle2 size={14} className="text-emerald-600" />
                  ✓ Semua perubahan tersimpan
                </span>
              )}
            </div>

            {importSuccessMsg && (
              <span className="text-emerald-800 bg-emerald-50 border border-emerald-200 text-[11px] font-extrabold px-3 py-1 rounded-xl flex items-center gap-1.5">
                {importSuccessMsg}
              </span>
            )}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white font-extrabold uppercase text-[11px] tracking-wider">
                  <th className="p-3 w-12 text-center border-r border-slate-800">No</th>
                  <th className="p-3 border-r border-slate-800">Nama Siswa</th>
                  <th className="p-3 w-64 text-center">Unit Activity Selected</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {students.map((st, sIdx) => {
                  const currentUa = studentUaSelection[st.id] || '';
                  return (
                    <tr key={st.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 text-center font-bold text-slate-400 border-r border-slate-100">
                        {sIdx + 1}
                      </td>
                      <td className="p-3 border-r border-slate-100 font-bold text-slate-900">
                        {st.name}
                      </td>
                      <td className="p-3 text-center">
                        <select
                          value={currentUa}
                          onChange={(e) => handleStudentUaChange(st.id, st.name, e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-extrabold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
                        >
                          <option value="">-- Pilih Unit Activity --</option>
                          {activeGradeUas.map(ua => (
                            <option key={ua} value={ua}>
                              {ua}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL IMPORT PESERTA UNIT ACTIVITY DARI GOOGLE SHEETS */}
      {showImportUaModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-2xl w-full shadow-2xl space-y-5 border border-slate-100 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-900 flex items-center justify-center font-black">
                  <Upload size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">
                    Import Peserta Unit Activity
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Copy-paste data siswa dan kelas dari Google Sheets / Excel
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowImportUaModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer font-extrabold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* 1. Target Unit Activity Dropdown */}
              <div className="space-y-1.5">
                <label className="block font-extrabold text-slate-800 uppercase tracking-wider text-[11px]">
                  1. Pilih Unit Activity Tujuan:
                </label>
                <select
                  value={selectedImportUa}
                  onChange={(e) => setSelectedImportUa(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-extrabold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
                >
                  {activeGradeUas.map(ua => (
                    <option key={ua} value={ua}>
                      {ua}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Textarea for Google Sheets Copy-Paste */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block font-extrabold text-slate-800 uppercase tracking-wider text-[11px]">
                    2. Paste Data dari Google Sheets (Format: Nama Siswa [TAB] Kelas):
                  </label>
                  <span className="text-[10.5px] text-purple-700 font-semibold">
                    Contoh: Ahmad Zewail [TAB] 1 Fuji
                  </span>
                </div>
                <textarea
                  value={importRawText}
                  onChange={(e) => setImportRawText(e.target.value)}
                  rows={6}
                  placeholder={`Ahmad Zewail Ryoutaziz Tahir\t1 Fuji\nAlexein Alvarendra Sudwi\t1 Fuji\nDamar Handaru\t1 Fuji`}
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-2xl font-mono text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y"
                />
              </div>

              {/* 3. Checkbox Option: Ganti peserta UA yang sudah ada */}
              <div className="p-3.5 bg-purple-50/70 rounded-2xl border border-purple-200 space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={overwriteExisting}
                    onChange={(e) => setOverwriteExisting(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded text-purple-700 focus:ring-purple-500 border-purple-300 cursor-pointer"
                  />
                  <div className="space-y-0.5">
                    <span className="font-extrabold text-purple-950 text-xs">
                      Ganti peserta UA yang sudah ada
                    </span>
                    <p className="text-[11px] text-purple-800 leading-snug">
                      {overwriteExisting
                        ? '• Dicentang: Siswa yang cocok dan sudah memiliki UA lain akan DIGANTI dengan UA terpilih.'
                        : '• Tidak dicentang: Hanya menambahkan/mengisi siswa yang belum memiliki Unit Activity.'}
                    </p>
                  </div>
                </label>
              </div>

              {/* 4. Live Matching Preview */}
              {importRawText.trim() && (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <h4 className="font-black text-slate-900 uppercase tracking-tight text-[11.5px] flex items-center gap-1.5">
                    <FileCheck2 size={16} className="text-purple-600" />
                    <span>Pratinjau Hasil Pencocokan Data ({selectedImportUa})</span>
                  </h4>

                  {loadingImportRoster ? (
                    <div className="flex items-center gap-2 text-slate-500 font-bold py-2">
                      <RefreshCw size={14} className="animate-spin" />
                      Memuat roster siswa...
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Stats Summary Badges */}
                      <div className="grid grid-cols-3 gap-2 text-center font-extrabold">
                        <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-950">
                          <div className="text-lg font-black text-emerald-800">{importPreview.matchedCount}</div>
                          <div className="text-[10px] uppercase">Berhasil Cocok</div>
                        </div>
                        <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-red-950">
                          <div className="text-lg font-black text-red-700">{importPreview.unmatchedList.length}</div>
                          <div className="text-[10px] uppercase">Tidak Ditemukan</div>
                        </div>
                        <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-950">
                          <div className="text-lg font-black text-amber-800">{importPreview.duplicateCount}</div>
                          <div className="text-[10px] uppercase">Duplikat / Tetap</div>
                        </div>
                      </div>

                      {/* Overwrite Warning Banner */}
                      {overwriteExisting && importPreview.overwriteCount > 0 && (
                        <div className="p-2.5 bg-amber-100/80 border border-amber-300 rounded-xl text-amber-950 text-[11px] font-bold flex items-center gap-2">
                          <AlertCircle size={14} className="text-amber-700 shrink-0" />
                          <span>Konfirmasi: {importPreview.overwriteCount} siswa yang sudah memiliki UA lain akan diganti menjadi "{selectedImportUa}".</span>
                        </div>
                      )}

                      {/* List of Unmatched Students if any */}
                      {importPreview.unmatchedList.length > 0 && (
                        <div className="p-3 bg-red-50/80 rounded-xl border border-red-200/90 text-[11px] space-y-1.5">
                          <div className="font-extrabold text-red-950 flex items-center justify-between">
                            <span className="flex items-center gap-1">
                              <AlertCircle size={13} className="text-red-600" />
                              Nama / Kelas Tidak Ditemukan ({importPreview.unmatchedList.length} baris):
                            </span>
                            <span className="text-[10px] text-red-700 font-normal">* Baris ini akan dilewati</span>
                          </div>
                          <div className="max-h-28 overflow-y-auto space-y-1 pr-1 font-mono text-[10.5px] text-red-900">
                            {importPreview.unmatchedList.map((un, idx) => (
                              <div key={idx} className="bg-white/80 px-2 py-1 rounded border border-red-200/60 flex justify-between">
                                <span>{un.rawName}</span>
                                <span className="font-bold text-red-700">{un.rawClass || 'Kelas ?'}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowImportUaModal(false)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={executeApplyImport}
                disabled={!importRawText.trim() || importPreview.matchedCount === 0}
                className="px-5 py-2.5 bg-purple-900 hover:bg-purple-950 disabled:opacity-40 text-white text-xs font-extrabold rounded-xl transition-all uppercase tracking-wider cursor-pointer shadow-sm flex items-center gap-2"
              >
                <CheckCircle2 size={15} />
                <span>Terapkan {importPreview.matchedCount} Siswa Valid</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3: INPUT REMARK SISWA TABLE WITH BULK ACTIONS */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-6 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
              <User size={18} className="text-emerald-600" />
              <span>Input Remark Siswa — {activeSubject} {activeSubject === 'Performing Arts' ? `(${activeUaTab})` : ''}</span>
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Pilih nilai <strong className="text-slate-800">A (Achieved)</strong>, <strong className="text-slate-800">D (Developing)</strong>, atau <strong className="text-slate-800">B (Beginning)</strong> untuk tiap siswa.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setIsImportRemarksModalOpen(true);
                if (activeGoalsForMidterm.length > 0) {
                  setSingleTargetGoalId(activeGoalsForMidterm[0].id);
                }
              }}
              disabled={activeGoalsForMidterm.length === 0 || goalsLoadError || goals.length === 0}
              className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-40 text-emerald-800 border border-emerald-200 hover:border-emerald-300 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <Upload size={14} />
              <span>Import Nilai dari Sheet</span>
            </button>
          </div>
        </div>

        {activeGoalsForMidterm.length === 0 ? (
          <div className="p-8 text-center text-xs text-amber-800 font-semibold bg-amber-50 rounded-2xl border border-dashed border-amber-300 space-y-1">
            <p>Belum ada Learning Goal yang dicentang untuk Midterm {selectedTerm}.</p>
            <p className="text-[11px] text-amber-700 font-normal">Silakan centang Learning Goal pada Bank Learning Goals di atas untuk menampilkan kolom nilai siswa.</p>
          </div>
        ) : activeSubject === 'Performing Arts' && activeStudentsForGrading.length === 0 ? (
          <div className="p-8 text-center text-xs text-purple-700 font-bold bg-purple-50/80 rounded-2xl border border-dashed border-purple-200 space-y-1">
            <p>Belum ada siswa yang memilih Unit Activity "{activeUaTab}".</p>
            <p className="text-[11px] text-purple-600 font-normal">Silakan tetapkan Unit Activity siswa pada Tabel Penetapan Unit Activity di atas.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white font-extrabold uppercase text-[11px] tracking-wider">
                  <th className="p-3 w-12 text-center border-r border-slate-800">No</th>
                  <th className="p-3 w-48 border-r border-slate-800">Nama Siswa</th>
                  {activeGoalsForMidterm.map((g, idx) => (
                    <th key={g.id} className="p-3 min-w-[220px] border-r border-slate-800 space-y-2 align-top">
                      <div className="text-[10.5px] font-bold text-slate-200 leading-snug line-clamp-2">
                        G{idx + 1}: {g.text}
                      </div>

                      {/* Bulk Action Buttons Header for this Goal */}
                      <div className="flex items-center gap-1 pt-1 border-t border-slate-800">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight mr-1">
                          Bulk:
                        </span>
                        <button
                          onClick={() => setBulkModal({ isOpen: true, goalId: g.id, goalText: g.text, value: 'A' })}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-300 rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all border border-slate-700"
                          title="Set semua siswa pada Goal ini ke nilai A"
                        >
                          Set Semua A
                        </button>
                        {/* Primary default quick action: Set Semua D */}
                        <button
                          onClick={() => setBulkModal({ isOpen: true, goalId: g.id, goalText: g.text, value: 'D' })}
                          className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-lg text-[10px] uppercase tracking-wider cursor-pointer transition-all shadow-xs ring-1 ring-amber-300"
                          title="Set semua siswa pada Goal ini ke nilai D"
                        >
                          ★ Set Semua D
                        </button>
                        <button
                          onClick={() => setBulkModal({ isOpen: true, goalId: g.id, goalText: g.text, value: 'B' })}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-blue-300 rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all border border-slate-700"
                          title="Set semua siswa pada Goal ini ke nilai B"
                        >
                          Set Semua B
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {activeStudentsForGrading.map((st, sIdx) => {
                  return (
                    <tr key={st.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 text-center font-bold text-slate-400 border-r border-slate-100">
                        {sIdx + 1}
                      </td>
                      <td className="p-3 border-r border-slate-100 font-bold text-slate-900">
                        {st.name}
                      </td>
                      {activeGoalsForMidterm.map((g) => {
                        const currentVal = localRemarks[st.id]?.[g.id] || '';
                        return (
                          <td key={g.id} className="p-3 border-r border-slate-100 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {(['A', 'D', 'B'] as const).map((val) => {
                                const isSelected = currentVal === val;
                                return (
                                  <button
                                    key={val}
                                    onClick={() => handleRemarkChange(st.id, st.name, g.id, val)}
                                    className={`w-9 h-8 rounded-xl font-extrabold text-xs transition-all cursor-pointer flex items-center justify-center ${
                                      isSelected
                                        ? val === 'A'
                                          ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-300'
                                          : val === 'D'
                                          ? 'bg-amber-500 text-slate-950 shadow-sm ring-2 ring-amber-300'
                                          : 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-300'
                                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800'
                                    }`}
                                  >
                                    {val}
                                  </button>
                                );
                              })}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: TAMBAH CUSTOM UNIT ACTIVITY */}
      {showAddUaModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center font-black text-lg">
              <FolderPlus size={24} />
            </div>

            <div className="space-y-2">
              <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">
                Tambah Unit Activity Performing Arts
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                Tambahkan nama Unit Activity baru khusus untuk kelas {selectedClass?.name || ''} (Grade Level {gradeNum}):
              </p>
            </div>

            <input
              type="text"
              value={newUaInput}
              onChange={(e) => setNewUaInput(e.target.value)}
              placeholder="Contoh: Theatre, Angklung Ensemble, Modern Dance..."
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-purple-500"
              autoFocus
            />

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setShowAddUaModal(false);
                  setNewUaInput('');
                }}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleAddCustomUa}
                disabled={savingCustomUa || !newUaInput.trim()}
                className="px-5 py-2.5 bg-purple-900 hover:bg-purple-800 disabled:opacity-50 text-white text-xs font-extrabold rounded-xl transition-all uppercase tracking-wider cursor-pointer shadow-sm flex items-center gap-2"
              >
                {savingCustomUa && <RefreshCw size={14} className="animate-spin" />}
                <span>Tambah UA</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BULK ACTION CONFIRMATION MODAL */}
      {bulkModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-black text-lg">
              <Sparkles size={24} />
            </div>

            <div className="space-y-2">
              <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">
                Konfirmasi Bulk Nilai
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                Terapkan nilai <strong className="text-amber-700 font-black">{bulkModal.value}</strong> untuk semua ({activeStudentsForGrading.length}) siswa pada Goal ini?
              </p>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 italic">
                "{bulkModal.goalText}"
              </div>
            </div>

            <p className="text-[11px] text-slate-400 font-medium">
              * Perubahan hanya berlaku untuk Goal ini. Anda tetap dapat mengubah nilai tiap siswa satu per satu setelahnya.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setBulkModal(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={executeBulkRemark}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold rounded-xl transition-all uppercase tracking-wider cursor-pointer shadow-sm"
              >
                Terapkan Nilai
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL: TERAPKAN LEARNING GOAL KE BEBERAPA KELAS */}
      {showAddGoalConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-black text-lg">
              <Layers size={24} />
            </div>

            <div className="space-y-3">
              <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">
                Konfirmasi Terapkan Learning Goal
              </h3>
              
              <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-200/80 text-emerald-950 font-black text-sm">
                Terapkan Learning Goal ini ke {selectedTargetClassIds.length} kelas?
              </div>

              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs font-medium text-slate-800 space-y-2">
                <div>
                  <span className="font-bold text-slate-900">Mata Pelajaran: </span>
                  <span className="font-semibold text-slate-700">{activeSubject} {activeSubject === 'Performing Arts' ? `(${activeUaTab})` : ''}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-900">Learning Goal: </span>
                  <p className="italic text-slate-700 bg-white p-2.5 rounded-xl border border-slate-200/80 mt-1">
                    "{goalTextInput.trim()}"
                  </p>
                </div>
                <div>
                  <span className="font-bold text-slate-900">Kelas Terpilih ({selectedTargetClassIds.length}):</span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {sameGradeClasses
                      .filter(c => selectedTargetClassIds.includes(c.id))
                      .map(c => (
                        <span key={c.id} className="px-2.5 py-1 bg-emerald-100 text-emerald-900 rounded-lg font-black text-[11px] border border-emerald-200">
                          {c.name}
                        </span>
                      ))}
                  </div>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
              * Learning goal tidak akan diduplikasi jika sudah ada pada kelas sasaran. Nilai atau remark siswa yang sudah ada tidak akan diubah.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowAddGoalConfirmModal(false)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={executeAddGoalBulk}
                disabled={savingGoals}
                className="px-5 py-2.5 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white text-xs font-extrabold rounded-xl transition-all uppercase tracking-wider cursor-pointer shadow-sm flex items-center gap-2"
              >
                {savingGoals && <RefreshCw size={14} className="animate-spin" />}
                <span>Terapkan</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL: UNCHECK GOAL THAT HAS EXISTING STUDENT GRADES */}
      {uncheckConfirmModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 border border-slate-100">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center font-black shrink-0">
                <AlertCircle size={22} />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-black text-slate-900 leading-snug">
                  Learning Goal ini sudah memiliki nilai siswa. Hapus dari Midterm ini?
                </h3>
                <p className="text-xs text-slate-600 font-medium leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-slate-200 line-clamp-3">
                  &ldquo;{uncheckConfirmModal.goalText}&rdquo;
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed font-medium">
              Nilai A/D/B yang sudah diinput untuk goal ini tidak akan dihapus dan tetap tersimpan sebagai riwayat history, tetapi goal tidak akan ditampilkan pada tabel nilai, kelengkapan rapor, preview, maupun PDF Midterm.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setUncheckConfirmModal({ isOpen: false, goalId: '', goalText: '' })}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmUncheckGoalWithGrades}
                className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold rounded-xl transition-all shadow-sm cursor-pointer"
              >
                Hapus dari Midterm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IMPORT REMARKS MODAL */}
      {isImportRemarksModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-[2rem] w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden text-slate-800">
            {/* Modal Header */}
            <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="p-2.5 bg-emerald-100 text-emerald-800 rounded-2xl flex items-center justify-center shadow-2xs">
                  <Upload size={18} />
                </span>
                <div>
                  <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Import Nilai Remark A/D/B</h3>
                  <p className="text-[11px] text-slate-500 font-bold mt-0.5 uppercase tracking-wide">
                    Copy-Paste Nilai Siswa dari Google Sheets / Excel
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsImportRemarksModalOpen(false);
                  setRemarksParsedRows([]);
                  setRemarksRawInput('');
                }}
                className="p-2 hover:bg-slate-200 text-slate-400 hover:text-slate-700 rounded-xl transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              {/* Context Summary Bar */}
              <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs font-bold text-emerald-950">
                <div>
                  <span className="block text-[9px] text-emerald-700 uppercase font-black tracking-wider">Kelas / Unit</span>
                  <span>{selectedClass?.name || selectedClassId} (ELEMENTARY)</span>
                </div>
                <div>
                  <span className="block text-[9px] text-emerald-700 uppercase font-black tracking-wider">Tahun / Semester</span>
                  <span>{selectedYear} • S{selectedSemester}</span>
                </div>
                <div>
                  <span className="block text-[9px] text-emerald-700 uppercase font-black tracking-wider">Periode Midterm</span>
                  <span>Mid Term {selectedTerm}</span>
                </div>
                <div>
                  <span className="block text-[9px] text-emerald-700 uppercase font-black tracking-wider">Mata Pelajaran</span>
                  <span>{activeSubject}</span>
                </div>
              </div>

              {remarksParsedRows.length === 0 ? (
                /* STEP 1: Paste Input and Mode Selection */
                <div className="space-y-6">
                  {/* Mode Selector */}
                  <div className="space-y-2">
                    <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">Mode Import</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <button
                        type="button"
                        onClick={() => setImportRemarksMode('single')}
                        className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between h-24 cursor-pointer ${
                          importRemarksMode === 'single'
                            ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-300/30'
                            : 'bg-white border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <span className="font-extrabold text-slate-900 text-xs uppercase tracking-wide">1. Satu Learning Goal</span>
                        <p className="text-[11px] text-slate-500 font-medium">Hanya mengimpor nilai untuk 1 target Learning Goal terpilih.</p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setImportRemarksMode('multi')}
                        className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between h-24 cursor-pointer ${
                          importRemarksMode === 'multi'
                            ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-300/30'
                            : 'bg-white border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <span className="font-extrabold text-slate-900 text-xs uppercase tracking-wide">2. Beberapa Learning Goal sekaligus</span>
                        <p className="text-[11px] text-slate-500 font-medium">Mengimpor nilai ke beberapa Learning Goal berdasarkan kolom tabel.</p>
                      </button>
                    </div>
                  </div>

                  {/* Single Mode Target Goal Dropdown */}
                  {importRemarksMode === 'single' && (
                    <div className="space-y-2">
                      <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">Pilih Target Learning Goal</label>
                      <select
                        value={singleTargetGoalId}
                        onChange={(e) => setSingleTargetGoalId(e.target.value)}
                        className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 animate-none"
                      >
                        {activeGoalsForMidterm.map((g, idx) => (
                          <option key={g.id} value={g.id}>
                            G{idx + 1}: {g.text.substring(0, 80)}{g.text.length > 80 ? '...' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Format Instructions Banner */}
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-800 text-xs font-medium space-y-1.5 leading-relaxed">
                    <p className="font-extrabold uppercase tracking-wide flex items-center gap-1.5">
                      <AlertCircle size={14} />
                      Format Salinan Google Sheets:
                    </p>
                    {importRemarksMode === 'single' ? (
                      <p>Pastikan baris pertama tabel memiliki judul kolom <strong>Nama Lengkap</strong> dan satu kolom nilai (misal: <strong>Nilai</strong> atau <strong>G1</strong>). Baris setelahnya berisi nama siswa dan nilai remark: <strong>A</strong>, <strong>D</strong>, atau <strong>B</strong>.</p>
                    ) : (
                      <p>Pastikan baris pertama memiliki kolom <strong>Nama Lengkap</strong> beserta kolom-kolom untuk setiap goal (misal: <strong>G1</strong>, <strong>G2</strong>, <strong>G3</strong>). Anda akan dapat memetakan setiap kolom ke Learning Goal target pada langkah berikutnya.</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">Paste Data di Sini</label>
                    <textarea
                      value={remarksRawInput}
                      onChange={(e) => setRemarksRawInput(e.target.value)}
                      placeholder={
                        importRemarksMode === 'single'
                          ? "Nama Lengkap\tNilai\nSiswa A\tA\nSiswa B\tD"
                          : "Nama Lengkap\tG1\tG2\nSiswa A\tA\tD\nSiswa B\tB\tA"
                      }
                      rows={8}
                      className="w-full text-xs p-4 bg-slate-50 border border-slate-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-mono"
                    />
                  </div>

                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={handleParseRemarksInput}
                      className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold uppercase tracking-wider rounded-2xl shadow-sm cursor-pointer transition-all"
                    >
                      Proses & Pratinjau
                    </button>
                  </div>
                </div>
              ) : (
                /* STEP 2: Preview, Columns Mapping and Confirmation */
                <div className="space-y-6">
                  {/* Column Mapping Section for Multi Mode */}
                  {importRemarksMode === 'multi' && (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                      <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">Pemetaan Kolom Nilai</h4>
                      <p className="text-[11px] text-slate-500">Petakan setiap kolom dari Sheet Anda ke Learning Goal aktif di sistem:</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {remarksHeaders.map((header, colIdx) => {
                          const cleanH = header.trim().toLowerCase().replace(/[\s_\-]/g, '');
                          if (['namalengkap', 'fullname', 'nama', 'studentname', 'no', 'nomor'].includes(cleanH)) return null;

                          return (
                            <div key={colIdx} className="flex items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200">
                              <span className="font-bold text-xs text-slate-700 truncate max-w-[150px]" title={header}>
                                Kolom: <strong className="text-slate-950 font-black">{header}</strong>
                              </span>
                              <select
                                value={remarksColumnMapping[colIdx] || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setRemarksColumnMapping(prev => ({ ...prev, [colIdx]: val }));
                                }}
                                className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-[11px] font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                              >
                                <option value="">-- Lewati Kolom --</option>
                                {activeGoalsForMidterm.map((g, idx) => (
                                  <option key={g.id} value={g.id}>
                                    G{idx + 1}: {g.text.substring(0, 40)}...
                                  </option>
                                ))}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Overwrite Choice */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-tight">Opsi Penanganan Nilai Existing:</h4>
                      <p className="text-[10px] font-medium text-slate-500 mt-0.5">Tentukan tindakan jika siswa sudah memiliki nilai untuk Goal ini di sistem.</p>
                    </div>

                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                        <input
                          type="radio"
                          name="remarksOverwriteOption"
                          checked={!remarksOverwrite}
                          onChange={() => setRemarksOverwrite(false)}
                          className="text-emerald-600 focus:ring-emerald-500"
                        />
                        <span>Lewati nilai yang sudah ada (Default)</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                        <input
                          type="radio"
                          name="remarksOverwriteOption"
                          checked={remarksOverwrite}
                          onChange={() => {
                            const count = evaluatedRows.filter(r => r.overallStatus === 'SUDAH_ADA_NILAI').length;
                            if (count > 0) {
                              const confirmText = `Peringatan: Terdapat sekitar ${count} siswa yang sudah memiliki nilai di sistem. Apakah Anda yakin ingin mengaktifkan opsi timpa nilai?`;
                              if (window.confirm(confirmText)) {
                                setRemarksOverwrite(true);
                              }
                            } else {
                              setRemarksOverwrite(true);
                            }
                          }}
                          className="text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-rose-600 font-extrabold">Timpa nilai yang sudah ada</span>
                      </label>
                    </div>
                  </div>

                  {/* Preview Table */}
                  <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-[350px] overflow-y-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-100 text-slate-600 font-extrabold uppercase tracking-wider text-[10px] sticky top-0 z-10 border-b border-slate-200">
                          <th className="p-3 w-12 text-center bg-slate-100">Aktif</th>
                          <th className="p-3 bg-slate-100">Nama Sheet</th>
                          <th className="p-3 bg-slate-100">Siswa Cocok</th>
                          <th className="p-3 bg-slate-100">Target Goal & Nilai</th>
                          <th className="p-3 bg-slate-100">Status Row</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {evaluatedRows.map((row) => {
                          let overallBadge = 'bg-emerald-50 text-emerald-700 border border-emerald-100';
                          let statusLabel = 'Valid';

                          if (row.nameStatus === 'NAMA_TIDAK_DITEMUKAN') {
                            statusLabel = 'Nama Tidak Ditemukan';
                            overallBadge = 'bg-rose-50 text-rose-700 border border-rose-100';
                          } else if (row.nameStatus === 'AMBIGU') {
                            statusLabel = 'Nama Ambigu';
                            overallBadge = 'bg-amber-50 text-amber-700 border border-amber-100';
                          } else if (row.overallStatus === 'NILAI_TIDAK_VALID') {
                            statusLabel = 'Nilai Tidak Valid';
                            overallBadge = 'bg-rose-50 text-rose-700 border border-rose-100';
                          } else if (row.overallStatus === 'HEADER_LG_TIDAK_DIKENALI') {
                            statusLabel = 'Belum Ada Pemetaan';
                            overallBadge = 'bg-slate-100 text-slate-500 border border-slate-200';
                          } else if (row.overallStatus === 'SUDAH_ADA_NILAI') {
                            statusLabel = 'Sudah Ada Nilai';
                            overallBadge = 'bg-amber-50 text-amber-700 border border-amber-100';
                          } else if (row.overallStatus === 'KOSONG') {
                            statusLabel = 'Semua Kolom Kosong';
                            overallBadge = 'bg-slate-100 text-slate-400 border border-slate-200';
                          }

                          return (
                            <tr key={row.lineIndex} className="hover:bg-slate-50/50">
                              <td className="p-3 text-center">
                                <input
                                  type="checkbox"
                                  disabled={row.nameStatus !== 'VALID' || (row.overallStatus === 'SUDAH_ADA_NILAI' && !remarksOverwrite) || row.overallStatus === 'KOSONG'}
                                  checked={row.checked}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setRemarksParsedRows(prev => prev.map(r => r.lineIndex === row.lineIndex ? { ...r, checked } : r));
                                  }}
                                  className="rounded text-emerald-600 focus:ring-emerald-500 disabled:opacity-30"
                                />
                              </td>
                              <td className="p-3 font-semibold text-slate-800">{row.rawName}</td>
                              <td className="p-3 font-bold text-emerald-950">
                                {row.matchedStudent ? row.matchedStudent.name : <span className="text-slate-400 font-normal italic">-</span>}
                              </td>
                              <td className="p-3 space-y-1">
                                {row.goalsEvaluations.map((ge, gIdx) => {
                                  let subColor = 'text-slate-600';
                                  if (ge.status === 'NILAI_TIDAK_VALID') subColor = 'text-red-600 font-bold';
                                  else if (ge.status === 'SUDAH_ADA_NILAI') subColor = 'text-amber-700 font-bold';
                                  else if (ge.status === 'KOSONG') subColor = 'text-slate-400 italic';
                                  else if (ge.status === 'VALID') subColor = 'text-emerald-700 font-bold';

                                  return (
                                    <div key={gIdx} className="text-[10.5px] leading-tight flex items-center justify-between border-b border-slate-50 pb-0.5">
                                      <span className="text-slate-400 truncate max-w-[120px]" title={ge.goalText}>
                                        {ge.goalId}: {ge.goalText}
                                      </span>
                                      <span className={subColor}>
                                        {ge.status === 'KOSONG' ? 'Lewati' : `Nilai: ${ge.val} (Lama: ${ge.currentGrade})`}
                                      </span>
                                    </div>
                                  );
                                })}
                              </td>
                              <td className="p-3">
                                <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg uppercase tracking-wider ${overallBadge}`}>
                                  {statusLabel}
                                </span>
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
                      type="button"
                      onClick={() => {
                        setRemarksParsedRows([]);
                        setRemarksRawInput('');
                      }}
                      className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                    >
                      Kembali / Edit Input
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveRemarksImport}
                      disabled={importRemarksSaving || !evaluatedRows.some(r => r.checked)}
                      className="px-6 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {importRemarksSaving ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : (
                        <Check size={14} />
                      )}
                      <span>Simpan ({evaluatedRows.filter(r => r.checked).length} Siswa)</span>
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
