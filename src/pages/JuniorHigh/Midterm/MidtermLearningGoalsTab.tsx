import * as React from 'react';
import { 
  Plus, Trash2, Edit2, Check, AlertCircle, Save, 
  Layers, CheckCircle2, ChevronRight, BookOpen, Clock, Loader2,
  Upload, X, RefreshCw
} from 'lucide-react';
import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { toast } from 'sonner';
import { 
  JH_MIDTERM_CATEGORIES, 
  type MidtermMasterGoalDoc, 
  type MidtermStudentDataDoc,
  type MidtermGoalItem
} from '../../../types/midtermReport';
import { 
  MIDTERM_REMARKS_CONFIG, 
  SPIRITUAL_HEALTH_OPTIONS,
  canUserEditMidtermGoals,
  saveMidtermMasterGoal,
  saveBulkMidtermMasterGoalForClasses,
  getJHGradeLevelNumber,
  saveMidtermStudentRemark,
  saveBulkMidtermStudentRemarks,
  getStudentDataDocId
} from '../../../services/juniorHighMidtermService';
import type { Student, Class, User } from '../../../types';

interface MidtermLearningGoalsTabProps {
  currentUser: User;
  selectedClass: Class | null;
  allJuniorHighClasses?: Class[];
  students: Student[];
  academicYear: string;
  semester: string;
  midtermTerm: string;
  masterGoalsMap: Record<string, MidtermMasterGoalDoc>;
  studentDataMap: Record<string, MidtermStudentDataDoc>;
  onRefreshData: () => Promise<void>;
  loading: boolean;
}

export const MidtermLearningGoalsTab: React.FC<MidtermLearningGoalsTabProps> = ({
  currentUser,
  selectedClass,
  allJuniorHighClasses = [],
  students,
  academicYear,
  semester,
  midtermTerm,
  masterGoalsMap,
  studentDataMap,
  onRefreshData,
  loading
}) => {
  const safeStudents = Array.isArray(students) ? students.filter(Boolean) : [];
  const safeMasterGoalsMap = masterGoalsMap && typeof masterGoalsMap === 'object' ? masterGoalsMap : {};
  const safeStudentDataMap = studentDataMap && typeof studentDataMap === 'object' ? studentDataMap : {};
  const categoriesList = Array.isArray(JH_MIDTERM_CATEGORIES) ? JH_MIDTERM_CATEGORIES : [];

  const [selectedCategoryIndex, setSelectedCategoryIndex] = React.useState<number>(0);
  const [selectedSubject, setSelectedSubject] = React.useState<string>('Bahasa Indonesia');
  
  // Master Goal editing state
  const [isAddingGoal, setIsAddingGoal] = React.useState<boolean>(false);
  const [newGoalText, setNewGoalText] = React.useState<string>('');
  const [editingGoalId, setEditingGoalId] = React.useState<string | null>(null);
  const [editingGoalText, setEditingGoalText] = React.useState<string>('');
  const [savingMaster, setSavingMaster] = React.useState<boolean>(false);

  // Multi-Class Goal Application State ("Terapkan ke Kelas")
  const sameGradeClasses = React.useMemo(() => {
    if (!selectedClass) return [];
    const targetGrade = getJHGradeLevelNumber(selectedClass);
    const matched = (allJuniorHighClasses || []).filter(c => c && getJHGradeLevelNumber(c) === targetGrade);
    if (selectedClass && !matched.some(c => c.id === selectedClass.id)) {
      matched.push(selectedClass);
    }
    return matched;
  }, [selectedClass, allJuniorHighClasses]);

  const [selectedTargetClassIds, setSelectedTargetClassIds] = React.useState<string[]>([]);
  const [showAddGoalConfirmModal, setShowAddGoalConfirmModal] = React.useState<boolean>(false);
  const [bulkGoalSuccessMsg, setBulkGoalSuccessMsg] = React.useState<string | null>(null);

  // Synchronize default selected target classes when grade or selected class changes
  const sameGradeClassIds = React.useMemo(() => sameGradeClasses.map(c => c.id).join(','), [sameGradeClasses]);
  React.useEffect(() => {
    if (sameGradeClasses.length > 0) {
      const ids = sameGradeClasses.map(c => c.id);
      setSelectedTargetClassIds(prev => {
        if (prev.join(',') === ids.join(',')) return prev;
        return ids;
      });
    } else if (selectedClass?.id) {
      const singleId = [selectedClass.id];
      setSelectedTargetClassIds(prev => {
        if (prev.length === 1 && prev[0] === selectedClass.id) return prev;
        return singleId;
      });
    }
  }, [selectedClass?.id, sameGradeClassIds]);

  // Reset form states on mount and whenever context changes
  const classId = selectedClass?.id;
  React.useEffect(() => {
    setIsAddingGoal(false);
    setNewGoalText('');
    setEditingGoalId(null);
    setEditingGoalText('');
    setSaveStatus('SAVED');
    setBulkConfirmModal(null);
    setIsImportModalOpen(false);
  }, [classId, academicYear, semester, midtermTerm]);

  // Remarks saving state
  const [savingRemarkKey, setSavingRemarkKey] = React.useState<string | null>(null);

  // Save status indicator state
  const [saveStatus, setSaveStatus] = React.useState<'SAVED' | 'DIRTY' | 'SAVING' | 'ERROR'>('SAVED');

  // Bulk grade confirmation modal state
  const [bulkConfirmModal, setBulkConfirmModal] = React.useState<{
    goal: MidtermGoalItem;
    goalIndex: number;
    grade: 'A' | 'D' | 'B';
  } | null>(null);

  // Import states & logic
  const [isImportModalOpen, setIsImportModalOpen] = React.useState<boolean>(false);
  const [importMode, setImportMode] = React.useState<'SINGLE' | 'MULTI'>('SINGLE');
  const [selectedGoalId, setSelectedGoalId] = React.useState<string>('');
  const [rawInput, setRawInput] = React.useState<string>('');
  const [parsedRows, setParsedRows] = React.useState<any[]>([]);
  const [allowOverwrite, setAllowOverwrite] = React.useState<boolean>(false);
  const [importing, setImporting] = React.useState<boolean>(false);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = React.useState<boolean>(false);

  // Parse Google Sheets copy-paste data
  const parsePastedData = (text: string): { headers: string[], rows: string[][] } => {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let inQuotes = false;

    const hasTab = text.includes('\t');
    const separator = hasTab ? '\t' : (text.includes(';') && !text.includes(',') ? ';' : ',');

    let i = 0;
    while (i < text.length) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentCell += '"';
          i += 2;
          continue;
        } else {
          inQuotes = !inQuotes;
          i++;
          continue;
        }
      }

      if (!inQuotes) {
        if (char === separator) {
          currentRow.push(currentCell);
          currentCell = '';
          i++;
          continue;
        }
        if (char === '\r' && nextChar === '\n') {
          currentRow.push(currentCell);
          rows.push(currentRow);
          currentRow = [];
          currentCell = '';
          i += 2;
          continue;
        }
        if (char === '\n') {
          currentRow.push(currentCell);
          rows.push(currentRow);
          currentRow = [];
          currentCell = '';
          i++;
          continue;
        }
      }

      currentCell += char;
      i++;
    }

    if (currentCell !== '' || currentRow.length > 0) {
      currentRow.push(currentCell);
      rows.push(currentRow);
    }

    const filteredRows = rows.filter(row => row.some(cell => cell.trim() !== ''));

    if (filteredRows.length === 0) {
      return { headers: [], rows: [] };
    }

    const headers = filteredRows[0].map(h => h.trim());
    const dataRows = filteredRows.slice(1);

    return { headers, rows: dataRows };
  };

  const cleanHeader = (h: string) => h.trim().toLowerCase().replace(/\s+/g, '').replace(/[\-_\s]/g, '');
  const isFullnameHeader = (h: string) => [
    'namalengkap', 'fullname', 'nama', 'studentname', 'name', 'namasiswa', 'student', 'siswa'
  ].includes(cleanHeader(h));

  const getGoalIndexFromHeader = (h: string): number => {
    const clean = h.trim().toLowerCase().replace(/\s+/g, '');
    const match = clean.match(/^(?:g|goal)(\d+)$/);
    if (match) {
      return parseInt(match[1], 10) - 1; // 0-based index
    }
    return -1;
  };

  const normalizeStudentName = (n: string) => {
    if (!n) return '';
    return n.trim().toLowerCase().replace(/\s+/g, ' ');
  };

  const handleParseInput = () => {
    if (!rawInput.trim()) {
      toast.error('Silakan paste data terlebih dahulu.');
      return;
    }

    if (importMode === 'SINGLE' && !selectedGoalId) {
      toast.error('Silakan pilih target Learning Goal terlebih dahulu.');
      return;
    }

    const { headers, rows: rawRows } = parsePastedData(rawInput);

    if (headers.length === 0 || rawRows.length === 0) {
      toast.error('Tidak ada data yang ditemukan.');
      return;
    }

    // Identify name column
    let nameIdx = headers.findIndex(h => isFullnameHeader(h));
    
    // Fallback if name column not matched automatically
    if (nameIdx === -1 && headers.length >= 2) {
      nameIdx = 0;
      toast.info("Header nama tidak terdeteksi otomatis. Kolom 1 diasumsikan Nama.");
    }

    if (nameIdx === -1) {
      toast.error("Kolom nama tidak terdeteksi. Pastikan baris pertama memiliki header nama ('Nama Lengkap'/'Full Name'/'Nama'/'Student Name'/'Name').");
      return;
    }

    const seenNames = new Set<string>();

    if (importMode === 'SINGLE') {
      // Find the value column
      let valIdx = headers.findIndex((h, idx) => idx !== nameIdx);
      if (valIdx === -1) {
        toast.error("Kolom nilai tidak ditemukan. Pastikan ada minimal 2 kolom (Nama dan Nilai).");
        return;
      }

      const activeGoal = goals.find(g => g.id === selectedGoalId);
      if (!activeGoal) {
        toast.error("Target Learning Goal terpilih tidak valid.");
        return;
      }

      const rows = rawRows.map((cells, idx) => {
        const rawName = (cells[nameIdx] || '').trim();
        const rawValue = (cells[valIdx] || '').trim().toUpperCase();

        let status: any = 'READY';
        let statusLabel = 'Siap Diimpor';
        let badgeColor = 'bg-emerald-50 text-emerald-700 border border-emerald-100';
        let matchedStudent: Student | null = null;

        if (!rawName) {
          status = 'NOT_FOUND';
          statusLabel = 'Siswa Tidak Ditemukan';
          badgeColor = 'bg-rose-50 text-rose-700 border border-rose-100';
        } else {
          const targetNormal = normalizeStudentName(rawName);
          const matches = safeStudents.filter(s => normalizeStudentName(s.name) === targetNormal);

          if (matches.length === 1) {
            matchedStudent = matches[0];
            const studentKey = matchedStudent.id;

            if (seenNames.has(studentKey)) {
              status = 'DUPLICATE_FILE';
              statusLabel = 'Duplikat di File';
              badgeColor = 'bg-rose-50 text-rose-700 border border-rose-100';
            } else {
              seenNames.add(studentKey);
            }
          } else if (matches.length > 1) {
            status = 'AMBIGU';
            statusLabel = 'Nama Ambigu';
            badgeColor = 'bg-amber-50 text-amber-700 border border-amber-100';
          } else {
            status = 'NOT_FOUND';
            statusLabel = 'Siswa Tidak Ditemukan';
            badgeColor = 'bg-rose-50 text-rose-700 border border-rose-100';
          }
        }

        // Validate value
        if (status === 'READY') {
          if (!rawValue) {
            status = 'EXISTING_SKIP';
            statusLabel = 'Nilai Kosong — Dilewati';
            badgeColor = 'bg-slate-100 text-slate-500 border border-slate-200';
          } else if (!['A', 'D', 'B'].includes(rawValue)) {
            status = 'INVALID_VALUE';
            statusLabel = 'Nilai Tidak Valid';
            badgeColor = 'bg-rose-50 text-rose-700 border border-rose-100';
          } else if (matchedStudent) {
            const existingVal = safeStudentDataMap[matchedStudent.id]?.remarks?.[selectedGoalId];
            if (existingVal) {
              if (allowOverwrite) {
                status = 'EXISTING_OVERWRITE';
                statusLabel = 'Nilai Sudah Ada — Akan Ditimpa';
                badgeColor = 'bg-amber-50 text-amber-700 border border-amber-200';
              } else {
                status = 'EXISTING_SKIP';
                statusLabel = 'Nilai Sudah Ada — Akan Dilewati';
                badgeColor = 'bg-slate-100 text-slate-500 border border-slate-200';
              }
            }
          }
        }

        return {
          index: idx + 2,
          rawName,
          rawValue,
          matchedStudent,
          status,
          statusLabel,
          badgeColor,
          goalId: selectedGoalId,
          goalText: activeGoal.text
        };
      });

      setParsedRows(rows);
      toast.success(`Berhasil memproses ${rows.length} baris.`);
    } else {
      const goalCols: { colIdx: number, goalIdx: number, goalId: string, goalText: string, isValid: boolean, h: string }[] = [];

      headers.forEach((h, idx) => {
        if (idx === nameIdx) return;
        const goalIdx = getGoalIndexFromHeader(h);
        if (goalIdx !== -1) {
          const goalItem = goals[goalIdx];
          if (goalItem) {
            goalCols.push({
              colIdx: idx,
              goalIdx,
              goalId: goalItem.id,
              goalText: goalItem.text,
              isValid: true,
              h
            });
          } else {
            goalCols.push({
              colIdx: idx,
              goalIdx,
              goalId: '',
              goalText: '',
              isValid: false,
              h
            });
          }
        }
      });

      if (goalCols.length === 0) {
        toast.error("Kolom Goal tidak ditemukan. Pastikan ada kolom berkode 'G1', 'G2', 'G3' dst.");
        return;
      }

      const rows = rawRows.map((cells, idx) => {
        const rawName = (cells[nameIdx] || '').trim();

        let status: any = 'READY';
        let statusLabel = 'Siap Diimpor';
        let badgeColor = 'bg-emerald-50 text-emerald-700 border border-emerald-100';
        let matchedStudent: Student | null = null;

        if (!rawName) {
          status = 'NOT_FOUND';
          statusLabel = 'Siswa Tidak Ditemukan';
          badgeColor = 'bg-rose-50 text-rose-700 border border-rose-100';
        } else {
          const targetNormal = normalizeStudentName(rawName);
          const matches = safeStudents.filter(s => normalizeStudentName(s.name) === targetNormal);

          if (matches.length === 1) {
            matchedStudent = matches[0];
            const studentKey = matchedStudent.id;

            if (seenNames.has(studentKey)) {
              status = 'DUPLICATE_FILE';
              statusLabel = 'Duplikat di File';
              badgeColor = 'bg-rose-50 text-rose-700 border border-rose-100';
            } else {
              seenNames.add(studentKey);
            }
          } else if (matches.length > 1) {
            status = 'AMBIGU';
            statusLabel = 'Nama Ambigu';
            badgeColor = 'bg-amber-50 text-amber-700 border border-amber-100';
          } else {
            status = 'NOT_FOUND';
            statusLabel = 'Siswa Tidak Ditemukan';
            badgeColor = 'bg-rose-50 text-rose-700 border border-rose-100';
          }
        }

        const goalsData = goalCols.map(col => {
          const rawValue = (cells[col.colIdx] || '').trim().toUpperCase();
          let cellStatus: 'READY' | 'INVALID_VALUE' | 'EXISTING_SKIP' | 'EXISTING_OVERWRITE' | 'INVALID_GOAL_COL' = 'READY';
          let cellStatusLabel = 'Siap';
          let cellBadgeColor = 'bg-emerald-50 text-emerald-700';

          if (!col.isValid) {
            cellStatus = 'INVALID_GOAL_COL';
            cellStatusLabel = 'Kolom Goal Tidak Valid';
            cellBadgeColor = 'bg-rose-50 text-rose-700';
          } else if (!rawValue) {
            cellStatus = 'EXISTING_SKIP';
            cellStatusLabel = 'Kosong';
            cellBadgeColor = 'bg-slate-100 text-slate-500';
          } else if (!['A', 'D', 'B'].includes(rawValue)) {
            cellStatus = 'INVALID_VALUE';
            cellStatusLabel = 'Nilai Tidak Valid';
            cellBadgeColor = 'bg-rose-50 text-rose-700';
          } else if (matchedStudent) {
            const existingVal = safeStudentDataMap[matchedStudent.id]?.remarks?.[col.goalId];
            if (existingVal) {
              if (allowOverwrite) {
                cellStatus = 'EXISTING_OVERWRITE';
                cellStatusLabel = 'Timpa';
                cellBadgeColor = 'bg-amber-50 text-amber-700';
              } else {
                cellStatus = 'EXISTING_SKIP';
                cellStatusLabel = 'Dilewati';
                cellBadgeColor = 'bg-slate-100 text-slate-500';
              }
            }
          }

          return {
            goalId: col.goalId,
            goalText: col.goalText,
            header: col.h,
            rawValue,
            status: cellStatus,
            statusLabel: cellStatusLabel,
            badgeColor: cellBadgeColor
          };
        });

        if (status === 'READY') {
          if (goalsData.every(gd => gd.status === 'EXISTING_SKIP')) {
            status = 'EXISTING_SKIP';
            statusLabel = 'Semua Nilai Dilewati';
            badgeColor = 'bg-slate-100 text-slate-500 border border-slate-200';
          } else if (goalsData.some(gd => gd.status === 'INVALID_VALUE')) {
            status = 'INVALID_VALUE';
            statusLabel = 'Ada Nilai Tidak Valid';
            badgeColor = 'bg-rose-50 text-rose-700 border border-rose-100';
          } else if (goalsData.some(gd => gd.status === 'INVALID_GOAL_COL')) {
            status = 'INVALID_GOAL_COL';
            statusLabel = 'Ada Kolom Goal Tidak Valid';
            badgeColor = 'bg-rose-50 text-rose-700 border border-rose-100';
          } else if (goalsData.some(gd => gd.status === 'EXISTING_OVERWRITE')) {
            status = 'EXISTING_OVERWRITE';
            statusLabel = 'Ada Nilai Ditimpa';
            badgeColor = 'bg-amber-50 text-amber-700 border border-amber-200';
          }
        }

        return {
          index: idx + 2,
          rawName,
          matchedStudent,
          status,
          statusLabel,
          badgeColor,
          goalsData
        };
      });

      setParsedRows(rows);
      toast.success(`Berhasil memproses ${rows.length} baris.`);
    }
  };

  const importSummary = React.useMemo(() => {
    let readySiswa = 0;
    let readyNilai = 0;
    let overwriteNilai = 0;
    const overwriteDetails: { name: string, goal: string, from: string, to: string }[] = [];

    parsedRows.forEach(row => {
      if (!row.matchedStudent) return;
      if (row.status === 'NOT_FOUND' || row.status === 'AMBIGU' || row.status === 'DUPLICATE_FILE') return;

      if (importMode === 'SINGLE') {
        const hasVal = ['A', 'D', 'B'].includes(row.rawValue);
        if (hasVal) {
          if (row.status === 'READY') {
            readySiswa++;
            readyNilai++;
          } else if (row.status === 'EXISTING_OVERWRITE') {
            readySiswa++;
            readyNilai++;
            overwriteNilai++;
            const currentVal = safeStudentDataMap[row.matchedStudent.id]?.remarks?.[row.goalId] || '';
            overwriteDetails.push({
              name: row.matchedStudent.name,
              goal: row.goalText,
              from: currentVal,
              to: row.rawValue
            });
          }
        }
      } else {
        let rowHasReady = false;
        (row.goalsData || []).forEach((gd: any) => {
          const hasVal = ['A', 'D', 'B'].includes(gd.rawValue);
          if (hasVal) {
            if (gd.status === 'READY') {
              readyNilai++;
              rowHasReady = true;
            } else if (gd.status === 'EXISTING_OVERWRITE') {
              readyNilai++;
              overwriteNilai++;
              rowHasReady = true;
              const currentVal = safeStudentDataMap[row.matchedStudent.id]?.remarks?.[gd.goalId] || '';
              overwriteDetails.push({
                name: row.matchedStudent.name,
                goal: gd.goalText,
                from: currentVal,
                to: gd.rawValue
              });
            }
          }
        });
        if (rowHasReady) {
          readySiswa++;
        }
      }
    });

    return {
      readySiswa,
      readyNilai,
      overwriteNilai,
      overwriteDetails
    };
  }, [parsedRows, importMode, safeStudentDataMap]);

  const handleSaveImport = async () => {
    if (importSummary.readyNilai === 0) {
      toast.error('Tidak ada nilai valid yang siap diimpor.');
      return;
    }

    if (importSummary.overwriteNilai > 0 && !showOverwriteConfirm) {
      setShowOverwriteConfirm(true);
      return;
    }

    setImporting(true);
    let fillCount = 0;
    let overwriteCount = 0;
    let skipCount = 0;

    try {
      const batchSize = 400;
      const studentRemarksToSave: Record<string, { studentName: string, remarks: Record<string, string> }> = {};

      parsedRows.forEach(row => {
        if (!row.matchedStudent) {
          if (row.rawName) skipCount++;
          return;
        }

        const studentId = row.matchedStudent.id;
        const studentName = row.matchedStudent.name;

        if (importMode === 'SINGLE') {
          if (row.status === 'READY') {
            if (!studentRemarksToSave[studentId]) {
              studentRemarksToSave[studentId] = { studentName, remarks: {} };
            }
            studentRemarksToSave[studentId].remarks[row.goalId] = row.rawValue;
            fillCount++;
          } else if (row.status === 'EXISTING_OVERWRITE') {
            if (!studentRemarksToSave[studentId]) {
              studentRemarksToSave[studentId] = { studentName, remarks: {} };
            }
            studentRemarksToSave[studentId].remarks[row.goalId] = row.rawValue;
            overwriteCount++;
          } else {
            skipCount++;
          }
        } else {
          (row.goalsData || []).forEach((gd: any) => {
            if (gd.status === 'READY') {
              if (!studentRemarksToSave[studentId]) {
                studentRemarksToSave[studentId] = { studentName, remarks: {} };
              }
              studentRemarksToSave[studentId].remarks[gd.goalId] = gd.rawValue;
              fillCount++;
            } else if (gd.status === 'EXISTING_OVERWRITE') {
              if (!studentRemarksToSave[studentId]) {
                studentRemarksToSave[studentId] = { studentName, remarks: {} };
              }
              studentRemarksToSave[studentId].remarks[gd.goalId] = gd.rawValue;
              overwriteCount++;
            } else {
              skipCount++;
            }
          });
        }
      });

      const studentIds = Object.keys(studentRemarksToSave);
      
      for (let i = 0; i < studentIds.length; i += batchSize) {
        const batch = writeBatch(db);
        const subIds = studentIds.slice(i, i + batchSize);

        subIds.forEach(studentId => {
          const { studentName, remarks: newRemarks } = studentRemarksToSave[studentId];
          const docId = getStudentDataDocId(studentId, selectedClass?.id || '', academicYear, semester, midtermTerm);
          const docRef = doc(db, 'jh_midterm_student_data', docId);

          const existingData = safeStudentDataMap[studentId];
          const currentRemarks = existingData?.remarks || {};
          const updatedRemarks = {
            ...currentRemarks,
            ...newRemarks
          };

          const payload: any = {
            studentId,
            studentName,
            classId: selectedClass?.id || '',
            academicYear,
            semester: String(semester),
            midtermTerm: String(midtermTerm),
            remarks: updatedRemarks,
            updatedAt: Date.now(),
            updatedBy: currentUser.uid,
            updatedByName: currentUser.displayName || (currentUser as any).name || 'Guru',
            inputSource: "JH_MIDTERM_ADB_IMPORT"
          };

          if (!existingData) {
            payload.status = 'DRAFT';
            payload.generalComment = {
              strengths: [],
              achievements: [],
              needsImprovement: []
            };
          }

          batch.set(docRef, payload, { merge: true });
        });

        await batch.commit();
      }

      await onRefreshData();
      toast.success(`Berhasil menyimpan ${fillCount + overwriteCount} nilai.`);
      
      setIsImportModalOpen(false);
      setParsedRows([]);
      setRawInput('');
      setShowOverwriteConfirm(false);

      alert(`Berhasil mengisi ${fillCount} nilai baru, menimpa ${overwriteCount} nilai lama, dan melewati ${skipCount} nilai.`);
    } catch (err: any) {
      console.error('Error importing student remarks:', err);
      toast.error('Gagal mengimpor nilai: ' + (err.message || 'Error'));
    } finally {
      setImporting(false);
    }
  };

  const currentCategory = categoriesList[selectedCategoryIndex] || categoriesList[0];
  const currentCategorySubjects = Array.isArray(currentCategory?.subjects) ? currentCategory.subjects : [];

  // Auto sync selected subject when category changes
  React.useEffect(() => {
    if (currentCategorySubjects.length > 0 && !currentCategorySubjects.includes(selectedSubject)) {
      setSelectedSubject(currentCategorySubjects[0]);
    }
  }, [selectedCategoryIndex, currentCategory, selectedSubject, currentCategorySubjects]);

  // Reset save status on subject or category change
  React.useEffect(() => {
    if (saveStatus !== 'SAVING') {
      setSaveStatus('SAVED');
    }
  }, [selectedSubject, selectedCategoryIndex]);

  const canEdit = canUserEditMidtermGoals(currentUser, selectedClass, selectedSubject);
  const currentMasterGoalDoc = safeMasterGoalsMap[selectedSubject];
  const goals: MidtermGoalItem[] = Array.isArray(currentMasterGoalDoc?.goals) ? currentMasterGoalDoc.goals.filter(Boolean) : [];

  const handleAddGoalClick = () => {
    if (!newGoalText.trim() || !selectedClass) return;
    if (selectedTargetClassIds.length === 0) {
      alert("Pilih minimal satu kelas untuk menerapkan Learning Goal.");
      return;
    }
    setShowAddGoalConfirmModal(true);
  };

  const executeAddGoalBulk = async () => {
    if (!newGoalText.trim() || !selectedClass || selectedTargetClassIds.length === 0) return;
    setSavingMaster(true);
    setShowAddGoalConfirmModal(false);

    try {
      const targetClassesToApply = sameGradeClasses.filter(c => selectedTargetClassIds.includes(c.id));

      await saveBulkMidtermMasterGoalForClasses(
        targetClassesToApply,
        academicYear,
        semester,
        midtermTerm,
        currentCategory.name,
        selectedSubject,
        newGoalText.trim(),
        currentUser
      );

      const count = selectedTargetClassIds.length;
      const successMessage = `✓ Learning Goal berhasil diterapkan ke ${count} kelas.`;
      setBulkGoalSuccessMsg(successMessage);
      toast.success(successMessage);
      setNewGoalText('');
      setIsAddingGoal(false);
      await onRefreshData();

      setTimeout(() => {
        setBulkGoalSuccessMsg(null);
      }, 6000);
    } catch (err: any) {
      console.error("Error bulk adding learning goal:", err);
      toast.error('Gagal menambahkan learning goal: ' + (err.message || 'Error'));
    } finally {
      setSavingMaster(false);
    }
  };

  const handleUpdateGoal = async (goalId: string) => {
    if (!editingGoalText.trim() || !selectedClass) return;
    setSavingMaster(true);
    try {
      const updatedGoals = goals.map(g => 
        g.id === goalId ? { ...g, text: editingGoalText.trim() } : g
      );

      await saveMidtermMasterGoal({
        classId: selectedClass.id,
        className: selectedClass.name,
        academicYear,
        semester,
        midtermTerm,
        category: currentCategory.name,
        subjectKey: selectedSubject,
        goals: updatedGoals,
        updatedBy: currentUser.uid,
        updatedByName: currentUser.displayName || (currentUser as any).name || 'Guru'
      });

      setEditingGoalId(null);
      setEditingGoalText('');
      await onRefreshData();
      toast.success('Learning goal berhasil diperbarui.');
    } catch (err: any) {
      console.error(err);
      toast.error('Gagal memperbarui learning goal: ' + (err.message || 'Error'));
    } finally {
      setSavingMaster(false);
    }
  };

  const handleDeleteGoal = async (goalId: string) => {
    if (!selectedClass) return;
    if (!window.confirm('Yakin ingin menghapus learning goal ini? Remark siswa yang terkait akan dinonaktifkan.')) {
      return;
    }
    setSavingMaster(true);
    try {
      const updatedGoals = goals.filter(g => g.id !== goalId).map((g, idx) => ({ ...g, order: idx + 1 }));
      await saveMidtermMasterGoal({
        classId: selectedClass.id,
        className: selectedClass.name,
        academicYear,
        semester,
        midtermTerm,
        category: currentCategory.name,
        subjectKey: selectedSubject,
        goals: updatedGoals,
        updatedBy: currentUser.uid,
        updatedByName: currentUser.displayName || (currentUser as any).name || 'Guru'
      });

      await onRefreshData();
      toast.success('Learning goal berhasil dihapus.');
    } catch (err: any) {
      console.error(err);
      toast.error('Gagal menghapus learning goal: ' + (err.message || 'Error'));
    } finally {
      setSavingMaster(false);
    }
  };

  const handleRemarkChange = async (student: Student, goalId: string, remarkValue: string) => {
    if (!selectedClass || !canEdit) return;
    const remarkKey = `${student.id}_${goalId}`;
    setSavingRemarkKey(remarkKey);
    setSaveStatus('DIRTY');
    setSaveStatus('SAVING');

    try {
      const isSpiritual = selectedSubject === 'Spiritual Health';
      await saveMidtermStudentRemark(
        student.id,
        student.name,
        selectedClass.id,
        academicYear,
        semester,
        midtermTerm,
        goalId,
        remarkValue,
        currentUser.uid,
        isSpiritual
      );
      await onRefreshData();
      setSaveStatus('SAVED');
    } catch (err: any) {
      console.error(err);
      setSaveStatus('ERROR');
      toast.error('Gagal menyimpan remark: ' + (err.message || 'Error'));
    } finally {
      setSavingRemarkKey(null);
    }
  };

  const handleOpenBulkConfirm = (goal: MidtermGoalItem, goalIndex: number, grade: 'A' | 'D' | 'B') => {
    if (!canEdit) return;
    setBulkConfirmModal({ goal, goalIndex, grade });
  };

  const handleApplyBulkGrade = async () => {
    if (!bulkConfirmModal || !selectedClass || !canEdit) return;
    const { goal, grade } = bulkConfirmModal;
    setBulkConfirmModal(null);

    setSaveStatus('DIRTY');
    setSaveStatus('SAVING');

    try {
      const isSpiritual = selectedSubject === 'Spiritual Health';
      const studentsPayload = safeStudents.map(s => ({
        id: s.id,
        name: s.name || 'Siswa'
      }));

      await saveBulkMidtermStudentRemarks(
        studentsPayload,
        selectedClass.id,
        academicYear,
        semester,
        midtermTerm,
        goal.id,
        grade,
        currentUser.uid,
        safeStudentDataMap,
        isSpiritual
      );

      await onRefreshData();
      setSaveStatus('SAVED');
      toast.success(`✓ Nilai ${grade} berhasil diterapkan dan tersimpan untuk semua siswa pada Goal ini.`);
    } catch (err: any) {
      console.error('Error applying bulk grade:', err);
      setSaveStatus('ERROR');
      toast.error('Gagal menyimpan. Coba lagi.');
    }
  };

  const isSpiritualHealth = selectedSubject === 'Spiritual Health';

  return (
    <div className="space-y-6">
      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {JH_MIDTERM_CATEGORIES.map((cat, idx) => {
          const isActive = idx === selectedCategoryIndex;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategoryIndex(idx)}
              className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
                isActive
                  ? 'bg-slate-900 text-white shadow-sm ring-2 ring-slate-900/10'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Layers size={14} className={isActive ? 'text-emerald-400' : 'text-slate-400'} />
              {cat.name}
            </button>
          );
        })}
      </div>

      {/* Subject Pills within Category */}
      <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-1">
          Mata Pelajaran:
        </span>
        {currentCategorySubjects.map(subj => {
          const isCurrent = subj === selectedSubject;
          const master = safeMasterGoalsMap[subj];
          const count = Array.isArray(master?.goals) ? master.goals.length : 0;
          return (
            <button
              key={subj}
              onClick={() => setSelectedSubject(subj)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                isCurrent
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              <span>{subj}</span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${
                  isCurrent ? 'bg-emerald-700 text-white' : count > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {count} Goal{count !== 1 ? 's' : ''}
              </span>
            </button>
          );
        })}
      </div>

      {/* Success Notification for Bulk Goal Application */}
      {bulkGoalSuccessMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 text-emerald-900 font-bold text-xs shadow-xs animate-fadeIn">
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
          <span>{bulkGoalSuccessMsg}</span>
        </div>
      )}

      {/* Master Learning Goals Management Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <BookOpen className="text-emerald-600" size={18} />
              <h3 className="text-base font-extrabold text-slate-900 uppercase">
                Learning Goals: {selectedSubject}
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Definisikan learning goals untuk {selectedClass?.name || 'kelas'} pada semester {semester}, Midterm {midtermTerm}.
            </p>
          </div>

          {canEdit && !isAddingGoal && (
            <button
              onClick={() => {
                setIsAddingGoal(true);
                setNewGoalText('');
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-slate-800 transition-all cursor-pointer shadow-sm"
            >
              <Plus size={14} />
              Tambah Goal
            </button>
          )}
        </div>

        {/* Learning Goals List */}
        {goals.length === 0 ? (
          <div className="p-8 border border-dashed border-amber-300 rounded-xl bg-amber-50/50 text-center space-y-2">
            <AlertCircle className="mx-auto text-amber-600" size={24} />
            <div className="text-xs font-bold text-amber-900 uppercase">
              Belum Ada Learning Goal untuk {selectedSubject}
            </div>
            <p className="text-xs text-amber-700 max-w-md mx-auto">
              Silakan tambahkan minimal 1 learning goal untuk mata pelajaran ini agar dapat menginput remark siswa dan memenuhi syarat publikasi rapor.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {goals.map((g, idx) => (
              <div
                key={g.id}
                className="flex items-start justify-between gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100/70 transition-colors"
              >
                <div className="flex items-start gap-3 flex-1">
                  <span className="w-6 h-6 rounded-lg bg-slate-200 text-slate-800 flex items-center justify-center text-xs font-black shrink-0 mt-0.5">
                    {idx + 1}
                  </span>

                  {editingGoalId === g.id ? (
                    <div className="flex-1 space-y-2">
                      <textarea
                        value={editingGoalText}
                        onChange={(e) => setEditingGoalText(e.target.value)}
                        rows={2}
                        className="w-full text-xs p-2.5 bg-white border border-emerald-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        placeholder="Ketik learning goal..."
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleUpdateGoal(g.id)}
                          disabled={savingMaster}
                          className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <Check size={12} /> Simpan
                        </button>
                        <button
                          onClick={() => setEditingGoalId(null)}
                          className="px-3 py-1 bg-slate-200 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-300"
                        >
                          Batal
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs font-medium text-slate-900 leading-relaxed pt-0.5">
                      {g.text}
                    </div>
                  )}
                </div>

                {canEdit && editingGoalId !== g.id && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => {
                        setEditingGoalId(g.id);
                        setEditingGoalText(g.text);
                      }}
                      className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-white rounded-lg transition-colors"
                      title="Edit Goal"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteGoal(g.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-white rounded-lg transition-colors"
                      title="Hapus Goal"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add Goal Input Area with Multi-Class Selection */}
        {isAddingGoal && (
          <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-4">
            <label className="block text-xs font-bold text-emerald-950 uppercase tracking-wider">
              Tambah Learning Goal Baru ({selectedSubject})
            </label>
            
            <textarea
              value={newGoalText}
              onChange={(e) => setNewGoalText(e.target.value)}
              rows={2}
              placeholder={`Ketik learning goal untuk ${selectedSubject}...`}
              className="w-full text-xs p-3 bg-white border border-emerald-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />

            {/* Terapkan ke Kelas Section */}
            {sameGradeClasses.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-emerald-200/60">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Terapkan ke Kelas:
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedTargetClassIds(sameGradeClasses.map(c => c.id))}
                      className="px-2.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer"
                    >
                      Pilih Semua Kelas Grade {getJHGradeLevelNumber(selectedClass)}
                    </button>
                    <button
                      type="button"
                      onClick={() => selectedClass && setSelectedTargetClassIds([selectedClass.id])}
                      className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer"
                    >
                      Hanya {selectedClass?.name}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
                  {sameGradeClasses.map(cls => {
                    const isChecked = selectedTargetClassIds.includes(cls.id);
                    return (
                      <label
                        key={cls.id}
                        className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all select-none ${
                          isChecked
                            ? 'bg-white border-emerald-500 text-emerald-950 shadow-xs'
                            : 'bg-slate-50/80 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTargetClassIds(prev => Array.from(new Set([...prev, cls.id])));
                            } else {
                              setSelectedTargetClassIds(prev => prev.filter(id => id !== cls.id));
                            }
                          }}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span>{cls.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleAddGoalClick}
                disabled={savingMaster || !newGoalText.trim()}
                className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 hover:bg-emerald-700 transition-all disabled:opacity-50 cursor-pointer"
              >
                <Save size={13} />
                {savingMaster ? 'Menyimpan...' : 'Simpan Goal'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAddingGoal(false);
                  setNewGoalText('');
                }}
                className="px-3.5 py-2 bg-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-300 transition-all cursor-pointer"
              >
                Batal
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Student Remarks Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="text-base font-extrabold text-slate-900 uppercase">
                Input Remark Siswa: {selectedSubject}
              </h3>

              {/* Status Penyimpanan Badge */}
              <div className="inline-flex items-center transition-all">
                {saveStatus === 'SAVING' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold">
                    <Loader2 className="animate-spin text-amber-600" size={13} />
                    <span>Menyimpan...</span>
                  </span>
                )}
                {saveStatus === 'SAVED' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
                    <CheckCircle2 className="text-emerald-600" size={13} />
                    <span>✓ Semua perubahan tersimpan</span>
                  </span>
                )}
                {saveStatus === 'DIRTY' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold">
                    <Clock className="text-slate-500" size={13} />
                    <span>Perubahan belum tersimpan</span>
                  </span>
                )}
                {saveStatus === 'ERROR' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 text-rose-800 border border-rose-200 text-xs font-bold">
                    <AlertCircle className="text-rose-600" size={13} />
                    <span>Gagal menyimpan. Coba lagi.</span>
                  </span>
                )}
              </div>
            </div>

            <p className="text-xs text-slate-500 mt-0.5">
              {isSpiritualHealth 
                ? 'Pilih evaluasi Spiritual Health: Sangat Baik, Baik, atau Cukup.'
                : 'Pilih status ketercapaian: A (Achieved), D (Developing), B (Beginning).'}
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-bold flex-wrap">
            {!isSpiritualHealth && (
              <div className="flex items-center gap-3 bg-slate-100 px-3 py-1.5 rounded-xl text-slate-700 text-[11px]">
                <span><strong className="text-emerald-700">A</strong>: Achieved</span>
                <span><strong className="text-amber-700">D</strong>: Developing</span>
                <span><strong className="text-rose-700">B</strong>: Beginning</span>
              </div>
            )}
            {canEdit && !isSpiritualHealth && goals.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setIsImportModalOpen(true);
                  setParsedRows([]);
                  setRawInput('');
                  setSelectedGoalId(goals[0]?.id || '');
                }}
                className="px-4 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 hover:border-emerald-300 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
              >
                <Upload size={14} />
                <span>Import Nilai A/D/B</span>
              </button>
            )}
          </div>
        </div>

        {goals.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400 font-medium">
            Tambahkan minimal 1 learning goal di atas sebelum menginput remark siswa.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-slate-100 text-slate-700 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                  <th className="p-3 w-12 text-center align-top">No</th>
                  <th className="p-3 w-48 align-top">Nama Siswa</th>
                  <th className="p-3 w-28 align-top">NISN</th>
                  {goals.map((g, idx) => (
                    <th key={g.id} className="p-3 text-center min-w-[200px] align-top">
                      <div className="space-y-2">
                        <div className="line-clamp-2 max-w-[220px] mx-auto text-slate-800 normal-case text-xs font-bold leading-snug" title={g.text}>
                          Goal {idx + 1}: {g.text}
                        </div>

                        {canEdit && !isSpiritualHealth && (
                          <div className="pt-1.5 border-t border-slate-200/80 flex flex-col items-center gap-1">
                            <div className="flex items-center justify-center gap-1 flex-wrap">
                              <button
                                type="button"
                                disabled={saveStatus === 'SAVING'}
                                onClick={() => handleOpenBulkConfirm(g, idx + 1, 'A')}
                                className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-slate-200/90 hover:bg-emerald-100 text-emerald-800 transition-all cursor-pointer disabled:opacity-50 border border-slate-300/50"
                                title={`Set Semua A untuk Goal ${idx + 1}`}
                              >
                                Set Semua A
                              </button>

                              {/* Set Semua D - Default / Prominent Choice */}
                              <button
                                type="button"
                                disabled={saveStatus === 'SAVING'}
                                onClick={() => handleOpenBulkConfirm(g, idx + 1, 'D')}
                                className="px-2.5 py-0.5 rounded text-[10px] font-black bg-amber-500 hover:bg-amber-600 text-white shadow-xs transition-all cursor-pointer disabled:opacity-50 ring-2 ring-amber-400/50"
                                title={`Set Semua D (Pilihan Cepat) untuk Goal ${idx + 1}`}
                              >
                                Set Semua D
                              </button>

                              <button
                                type="button"
                                disabled={saveStatus === 'SAVING'}
                                onClick={() => handleOpenBulkConfirm(g, idx + 1, 'B')}
                                className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-slate-200/90 hover:bg-rose-100 text-rose-800 transition-all cursor-pointer disabled:opacity-50 border border-slate-300/50"
                                title={`Set Semua B untuk Goal ${idx + 1}`}
                              >
                                Set Semua B
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {safeStudents.map((student, sIdx) => {
                  if (!student) return null;
                  const sData = safeStudentDataMap[student.id];
                  const remarks = (sData?.remarks && typeof sData.remarks === 'object') ? sData.remarks : {};

                  return (
                    <tr key={student.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 text-center font-bold text-slate-400">{sIdx + 1}</td>
                      <td className="p-3 font-bold text-slate-900 uppercase">
                        {student.name || '-'}
                      </td>
                      <td className="p-3 font-medium text-slate-500">
                        {student.nisn || (student as any).nis || '-'}
                      </td>

                      {goals.map((g) => {
                        if (!g) return null;
                        const currentVal = remarks[g.id] || (isSpiritualHealth ? sData?.spiritualHealthRemark : '') || '';
                        const isSavingThis = savingRemarkKey === `${student.id}_${g.id}`;

                        return (
                          <td key={g.id} className="p-3 text-center align-middle">
                            {isSpiritualHealth ? (
                              /* Spiritual Health Select or Chips */
                              <div className="flex items-center justify-center gap-1">
                                {SPIRITUAL_HEALTH_OPTIONS.map((opt) => {
                                  const isSelected = currentVal.toLowerCase() === opt.toLowerCase();
                                  return (
                                    <button
                                      key={opt}
                                      disabled={!canEdit || isSavingThis || saveStatus === 'SAVING'}
                                      onClick={() => handleRemarkChange(student, g.id, opt)}
                                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                                        isSelected
                                          ? 'bg-emerald-600 text-white shadow-sm'
                                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                      } ${!canEdit ? 'opacity-60 cursor-not-allowed' : ''}`}
                                    >
                                      {opt}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              /* Standard Subject Remark A / D / B */
                              <div className="flex items-center justify-center gap-1.5">
                                {MIDTERM_REMARKS_CONFIG.map((rem) => {
                                  const isSelected = currentVal === rem.code;
                                  const colorActive =
                                    rem.code === 'A'
                                      ? 'bg-emerald-600 text-white'
                                      : rem.code === 'D'
                                      ? 'bg-amber-500 text-white'
                                      : 'bg-rose-600 text-white';

                                  return (
                                    <button
                                      key={rem.code}
                                      disabled={!canEdit || isSavingThis || saveStatus === 'SAVING'}
                                      onClick={() => handleRemarkChange(student, g.id, rem.code)}
                                      title={`${rem.label} - ${rem.description}`}
                                      className={`w-7 h-7 rounded-lg text-xs font-black uppercase transition-all cursor-pointer ${
                                        isSelected
                                          ? `${colorActive} shadow-sm scale-105 ring-2 ring-slate-900/10`
                                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                      } ${!canEdit ? 'opacity-60 cursor-not-allowed' : ''}`}
                                    >
                                      {rem.code}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
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

      {/* Confirmation Modal for Multi-Class Goal Application */}
      {showAddGoalConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl shrink-0 bg-emerald-100 text-emerald-700">
                <BookOpen size={22} />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-extrabold text-slate-900 leading-snug">
                  Terapkan Learning Goal ini ke {selectedTargetClassIds.length} kelas?
                </h4>
                <p className="text-xs text-slate-500 font-medium line-clamp-2">
                  Goal: &ldquo;{newGoalText}&rdquo;
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 space-y-1">
              <p className="font-bold text-slate-800">Kelas Tujuan ({selectedTargetClassIds.length}):</p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {sameGradeClasses
                  .filter(c => selectedTargetClassIds.includes(c.id))
                  .map(c => (
                    <span key={c.id} className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-extrabold rounded-md">
                      {c.name}
                    </span>
                  ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAddGoalConfirmModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-bold text-xs transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={executeAddGoalBulk}
                disabled={savingMaster}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                {savingMaster ? 'Menyimpan...' : 'Terapkan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Bulk Grade Application */}
      {bulkConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className={`p-2.5 rounded-xl shrink-0 ${
                bulkConfirmModal.grade === 'A' 
                  ? 'bg-emerald-100 text-emerald-700' 
                  : bulkConfirmModal.grade === 'D' 
                  ? 'bg-amber-100 text-amber-700' 
                  : 'bg-rose-100 text-rose-700'
              }`}>
                <AlertCircle size={22} />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-extrabold text-slate-900 leading-snug">
                  Terapkan nilai {bulkConfirmModal.grade} untuk semua siswa pada Goal ini?
                </h4>
                <p className="text-xs text-slate-500">
                  Goal {bulkConfirmModal.goalIndex}: <span className="font-semibold text-slate-700">{bulkConfirmModal.goal.text}</span>
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 space-y-1">
              <p className="font-bold text-slate-800">Detail Penerapan Bulk:</p>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-600">
                <li>Nilai <strong>{bulkConfirmModal.grade}</strong> akan diisikan ke seluruh <strong>{safeStudents.length} siswa</strong> pada Goal ini.</li>
                <li>Goal lain, remark, dan data Midterm lain tidak akan diubah.</li>
                <li>Anda tetap dapat mengubah nilai tiap siswa secara individu kapan saja.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setBulkConfirmModal(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-bold text-xs transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleApplyBulkGrade}
                className={`px-4 py-2 rounded-xl text-white font-black text-xs shadow-md transition-all cursor-pointer ${
                  bulkConfirmModal.grade === 'A'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : bulkConfirmModal.grade === 'D'
                    ? 'bg-amber-500 hover:bg-amber-600'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                Terapkan Nilai {bulkConfirmModal.grade}
              </button>
            </div>
          </div>
        </div>
      )}

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
                  <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Import Nilai Remark A/D/B</h3>
                  <p className="text-[11px] text-slate-500 font-bold mt-0.5 uppercase tracking-wide">
                    Copy-paste nilai siswa dari Google Sheets / Excel
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsImportModalOpen(false);
                  setParsedRows([]);
                  setRawInput('');
                  setShowOverwriteConfirm(false);
                }}
                className="p-2 hover:bg-slate-200 text-slate-400 hover:text-slate-700 rounded-xl transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              {/* Context Information Header */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl text-[11px] font-bold">
                <div>
                  <span className="block text-slate-400 uppercase tracking-wider text-[9px]">Kelas Aktif</span>
                  <span className="text-emerald-950 font-black">{selectedClass?.name || '-'}</span>
                </div>
                <div>
                  <span className="block text-slate-400 uppercase tracking-wider text-[9px]">Tahun & Semester</span>
                  <span className="text-emerald-950 font-black">{academicYear} — S{semester}</span>
                </div>
                <div>
                  <span className="block text-slate-400 uppercase tracking-wider text-[9px]">Periode Midterm</span>
                  <span className="text-emerald-950 font-black">Term {midtermTerm}</span>
                </div>
                <div>
                  <span className="block text-slate-400 uppercase tracking-wider text-[9px]">Mata Pelajaran</span>
                  <span className="text-emerald-950 font-black">{selectedSubject}</span>
                </div>
              </div>

              {parsedRows.length === 0 ? (
                /* Step 1: Input Area */
                <div className="space-y-6">
                  {/* Select Mode */}
                  <div className="space-y-3">
                    <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">
                      Pilih Mode Import
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <label className={`p-4 rounded-2xl border-2 flex flex-col gap-1 cursor-pointer transition-all ${
                        importMode === 'SINGLE'
                          ? 'border-emerald-600 bg-emerald-50/20'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}>
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="importMode"
                            checked={importMode === 'SINGLE'}
                            onChange={() => setImportMode('SINGLE')}
                            className="text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="text-xs font-black text-slate-800 uppercase tracking-tight">1. SATU LEARNING GOAL</span>
                        </div>
                        <p className="text-[10px] text-slate-500 font-medium pl-5 leading-relaxed">
                          Hanya mengimpor nilai untuk 1 target Learning Goal terpilih. Spreadsheet hanya membutuhkan kolom nama siswa dan satu kolom nilai.
                        </p>
                      </label>

                      <label className={`p-4 rounded-2xl border-2 flex flex-col gap-1 cursor-pointer transition-all ${
                        importMode === 'MULTI'
                          ? 'border-emerald-600 bg-emerald-50/20'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}>
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="importMode"
                            checked={importMode === 'MULTI'}
                            onChange={() => setImportMode('MULTI')}
                            className="text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="text-xs font-black text-slate-800 uppercase tracking-tight">2. BEBERAPA LEARNING GOAL SEKALIGUS</span>
                        </div>
                        <p className="text-[10px] text-slate-500 font-medium pl-5 leading-relaxed">
                          Mengimpor nilai ke beberapa Learning Goal berdasarkan kolom tabel (G1, G2, dst.). Header goal harus cocok dengan kode goal yang ditampilkan sistem.
                        </p>
                      </label>
                    </div>
                  </div>

                  {/* Mode Specific Inputs */}
                  {importMode === 'SINGLE' ? (
                    <div className="space-y-2">
                      <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">
                        Pilih Target Learning Goal
                      </label>
                      <select
                        value={selectedGoalId}
                        onChange={(e) => setSelectedGoalId(e.target.value)}
                        className="w-full text-xs p-3 bg-slate-50 border border-slate-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-bold text-slate-800"
                      >
                        <option value="">-- Pilih Target Learning Goal --</option>
                        {goals.map((g, idx) => (
                          <option key={g.id} value={g.id}>
                            Goal {idx + 1}: {g.text}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">
                        Daftar Kode Learning Goal Aktif (Legend)
                      </label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[150px] overflow-y-auto border border-slate-200 p-3 rounded-2xl">
                        {goals.map((g, idx) => (
                          <div key={g.id} className="text-xs bg-slate-50 p-2 rounded-xl border border-slate-100 flex items-start gap-2">
                            <strong className="text-slate-900 bg-slate-200 px-1.5 py-0.5 rounded text-[10px] font-black shrink-0">G{idx + 1}</strong>
                            <span className="text-slate-600 font-medium leading-relaxed text-[11px] line-clamp-2">{g.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Paste Box Instructions */}
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 text-xs font-medium leading-relaxed space-y-1">
                    <p className="font-extrabold uppercase tracking-wide flex items-center gap-1.5">
                      <AlertCircle size={14} />
                      Petunjuk Format Paste:
                    </p>
                    {importMode === 'SINGLE' ? (
                      <>
                        <p>Format kolom wajib: <strong>Nama Lengkap</strong> dan <strong>Nilai</strong>.</p>
                        <p className="font-mono text-[10px] bg-white/60 p-2 rounded border border-amber-200 font-bold">
                          Nama Lengkap&lt;TAB&gt;Nilai<br />
                          Ahmad Budi&lt;TAB&gt;A<br />
                          Siti Aisyah&lt;TAB&gt;D
                        </p>
                      </>
                    ) : (
                      <>
                        <p>Format kolom wajib: <strong>Nama Lengkap</strong> dan kolom kode goal seperti <strong>G1</strong>, <strong>G2</strong>, dst.</p>
                        <p className="font-mono text-[10px] bg-white/60 p-2 rounded border border-amber-200 font-bold">
                          Nama Lengkap&lt;TAB&gt;G1&lt;TAB&gt;G2<br />
                          Ahmad Budi&lt;TAB&gt;A&lt;TAB&gt;D<br />
                          Siti Aisyah&lt;TAB&gt;D&lt;TAB&gt;B
                        </p>
                      </>
                    )}
                    <p>Header nama didukung: <em>Nama Lengkap, Full Name, Nama, Student Name, Name</em>. Nilai yang sah hanya <strong>A, D, atau B</strong>.</p>
                  </div>

                  {/* Textarea */}
                  <div className="space-y-2">
                    <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">
                      Area Paste Data
                    </label>
                    <textarea
                      value={rawInput}
                      onChange={(e) => setRawInput(e.target.value)}
                      placeholder="Tempel (Paste) baris-baris tabel Excel / Google Sheets Anda di sini..."
                      rows={8}
                      className="w-full text-xs p-4 bg-slate-50 border border-slate-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-mono leading-relaxed"
                    />
                  </div>

                  {/* Overwrite Choice Step 1 */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-tight">Opsi Penanganan Nilai Sudah Ada:</h4>
                      <p className="text-[10px] font-medium text-slate-500 mt-0.5">Tentukan tindakan jika siswa sudah memiliki nilai yang terisi di sistem.</p>
                    </div>

                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                        <input
                          type="radio"
                          name="overwriteOptionJH"
                          checked={!allowOverwrite}
                          onChange={() => setAllowOverwrite(false)}
                          className="text-emerald-600 focus:ring-emerald-500"
                        />
                        <span>Lewati nilai yang sudah ada (Default)</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                        <input
                          type="radio"
                          name="overwriteOptionJH"
                          checked={allowOverwrite}
                          onChange={() => setAllowOverwrite(true)}
                          className="text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-rose-600 font-extrabold">Timpa nilai yang sudah ada</span>
                      </label>
                    </div>
                  </div>

                  {/* Process button */}
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
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
                  {/* Summary Counts */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-center">
                      <span className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Total Baris</span>
                      <strong className="text-lg font-black text-slate-900">{parsedRows.length}</strong>
                    </div>
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-center">
                      <span className="block text-[10px] font-extrabold text-emerald-600 uppercase tracking-wider">Siswa Cocok</span>
                      <strong className="text-lg font-black text-emerald-800">
                        {parsedRows.filter(r => r.matchedStudent).length}
                      </strong>
                    </div>
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl text-center">
                      <span className="block text-[10px] font-extrabold text-blue-600 uppercase tracking-wider">Nilai Siap Impor</span>
                      <strong className="text-lg font-black text-blue-800">{importSummary.readyNilai}</strong>
                    </div>
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-center">
                      <span className="block text-[10px] font-extrabold text-amber-600 uppercase tracking-wider">Nilai Ditimpa</span>
                      <strong className="text-lg font-black text-amber-800">{importSummary.overwriteNilai}</strong>
                    </div>
                  </div>

                  {/* Overwrite Choice Step 2 */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-tight">Opsi Penanganan Nilai Sudah Ada:</h4>
                      <p className="text-[10px] font-medium text-slate-500 mt-0.5">Tentukan tindakan jika siswa sudah memiliki nilai yang terisi di sistem.</p>
                    </div>

                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                        <input
                          type="radio"
                          name="overwriteOptionJH2"
                          checked={!allowOverwrite}
                          onChange={() => {
                            setAllowOverwrite(false);
                            // Re-trigger parse with new option
                            setTimeout(() => handleParseInput(), 50);
                          }}
                          className="text-emerald-600 focus:ring-emerald-500"
                        />
                        <span>Lewati nilai yang sudah ada (Default)</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                        <input
                          type="radio"
                          name="overwriteOptionJH2"
                          checked={allowOverwrite}
                          onChange={() => {
                            setAllowOverwrite(true);
                            // Re-trigger parse with new option
                            setTimeout(() => handleParseInput(), 50);
                          }}
                          className="text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-rose-600 font-extrabold">Timpa nilai yang sudah ada</span>
                      </label>
                    </div>
                  </div>

                  {/* Preview Table */}
                  <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-[300px] overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500 sticky top-0 z-10">
                          <th className="p-3 w-12 text-center bg-slate-50">Baris</th>
                          <th className="p-3 bg-slate-50">Nama dari Sheet</th>
                          <th className="p-3 bg-slate-50">Siswa Terdeteksi</th>
                          {importMode === 'SINGLE' ? (
                            <>
                              <th className="p-3 text-center bg-slate-50">Nilai</th>
                              <th className="p-3 bg-slate-50">Status</th>
                            </>
                          ) : (
                            <>
                              {parsedRows[0]?.goalsData?.map((gd: any, idx: number) => (
                                <th key={idx} className="p-3 text-center bg-slate-50">{gd.header}</th>
                              ))}
                              <th className="p-3 bg-slate-50">Status</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {parsedRows.map((row) => (
                          <tr key={row.index} className="hover:bg-slate-50/50">
                            <td className="p-3 text-center font-bold text-slate-400">{row.index}</td>
                            <td className="p-3 font-semibold text-slate-800">{row.rawName}</td>
                            <td className="p-3 font-bold text-emerald-950">
                              {row.matchedStudent ? (
                                row.matchedStudent.name
                              ) : (
                                <span className="text-slate-400 italic">Tidak Ditemukan</span>
                              )}
                            </td>
                            {importMode === 'SINGLE' ? (
                              <>
                                <td className="p-3 text-center font-black">
                                  {row.rawValue ? (
                                    <span className={`px-2 py-1 rounded ${
                                      row.rawValue === 'A' ? 'bg-emerald-100 text-emerald-800' :
                                      row.rawValue === 'D' ? 'bg-amber-100 text-amber-800' :
                                      'bg-rose-100 text-rose-800'
                                    }`}>{row.rawValue}</span>
                                  ) : (
                                    <span className="text-slate-300">-</span>
                                  )}
                                </td>
                                <td className="p-3">
                                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg border ${row.badgeColor}`}>
                                    {row.statusLabel}
                                  </span>
                                </td>
                              </>
                            ) : (
                              <>
                                {row.goalsData?.map((gd: any, idx: number) => (
                                  <td key={idx} className="p-3 text-center font-black">
                                    <div className="flex flex-col items-center gap-0.5">
                                      {gd.rawValue ? (
                                        <span className={`px-2 py-0.5 rounded text-[10px] ${
                                          gd.rawValue === 'A' ? 'bg-emerald-100 text-emerald-800' :
                                          gd.rawValue === 'D' ? 'bg-amber-100 text-amber-800' :
                                          'bg-rose-100 text-rose-800'
                                        }`}>{gd.rawValue}</span>
                                      ) : (
                                        <span className="text-slate-300">-</span>
                                      )}
                                      <span className="text-[9px] font-bold text-slate-400 scale-90">{gd.statusLabel}</span>
                                    </div>
                                  </td>
                                ))}
                                <td className="p-3">
                                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg border ${row.badgeColor}`}>
                                    {row.statusLabel}
                                  </span>
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Overwrite Confirmation Panel if needed */}
                  {showOverwriteConfirm && importSummary.overwriteNilai > 0 && (
                    <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl space-y-3">
                      <div className="flex items-start gap-2.5 text-amber-900">
                        <AlertCircle className="shrink-0 mt-0.5 text-amber-700" size={16} />
                        <div>
                          <h4 className="text-xs font-black uppercase tracking-wider">Konfirmasi Menimpa Nilai</h4>
                          <p className="text-[11px] font-medium leading-relaxed mt-0.5">
                            Sebanyak <strong>{importSummary.overwriteNilai} nilai</strong> yang sudah tersimpan di sistem akan ditimpa dengan nilai baru dari spreadsheet Anda. Detail siswa & goal yang terdampak:
                          </p>
                        </div>
                      </div>

                      <div className="max-h-[120px] overflow-y-auto border border-amber-200 bg-white/70 p-2.5 rounded-xl space-y-1 text-[10px] font-bold text-slate-700">
                        {importSummary.overwriteDetails.map((det, idx) => (
                          <div key={idx} className="flex items-center justify-between border-b border-amber-100/50 pb-1 last:border-b-0">
                            <div>
                              <span className="text-slate-900">{det.name}</span>
                              <span className="text-slate-400 font-medium ml-2">({det.goal})</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-slate-400">{det.from || '-'}</span>
                              <span>➔</span>
                              <span className="text-rose-700">{det.to}</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      <label className="flex items-center gap-2 text-xs font-black text-rose-700 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          className="rounded text-rose-600 focus:ring-rose-500"
                          id="explicitOverwriteCheckbox"
                        />
                        <span>Saya yakin dan menyetujui untuk menimpa {importSummary.overwriteNilai} nilai lama tersebut</span>
                      </label>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-4 border-t border-slate-100 gap-4">
                    <div className="text-xs font-black text-slate-700 uppercase tracking-tight">
                      Ringkasan: <span className="text-emerald-800">{importSummary.readySiswa} siswa</span> dan <span className="text-emerald-800">{importSummary.readyNilai} nilai</span> siap diimpor.
                    </div>

                    <div className="flex items-center gap-3 self-end">
                      <button
                        type="button"
                        onClick={() => {
                          setParsedRows([]);
                          setRawInput('');
                          setShowOverwriteConfirm(false);
                        }}
                        className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                      >
                        Kembali / Edit Input
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (showOverwriteConfirm && importSummary.overwriteNilai > 0) {
                            const isChecked = (document.getElementById('explicitOverwriteCheckbox') as HTMLInputElement)?.checked;
                            if (!isChecked) {
                              toast.error('Harap centang kotak konfirmasi sebelum menyimpan nilai.');
                              return;
                            }
                          }
                          handleSaveImport();
                        }}
                        disabled={importing || importSummary.readyNilai === 0}
                        className="px-6 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                      >
                        {importing ? (
                          <RefreshCw size={14} className="animate-spin" />
                        ) : (
                          <Check size={14} />
                        )}
                        <span>Simpan {importSummary.readyNilai} Nilai</span>
                      </button>
                    </div>
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

