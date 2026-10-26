import React, { useState, useEffect } from 'react';
import { useMTSSCases } from '../../hooks/useMTSSCases';
import MTSSCaseTable from './components/MTSSCaseTable';
import CoachingLogDrawer from './components/CoachingLogDrawer';
import { elementaryMTSSService, resolveCaseForStudent } from '../../services/elementaryMTSSService';
import { useAuth } from '../../context/AuthContext';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { getClasses, getActiveStudents } from '../../lib/firebase';
import { 
  ElementaryMTSSCase, 
  MTSSBatchSheet, 
  MTSSBlockConfig, 
  MTSSStudentRowData, 
  MTSSMeetingValue, 
  MTSSAssessmentValue 
} from '../../types/elementaryMTSS';
import { 
  GraduationCap, 
  Sparkles, 
  Search, 
  RefreshCw, 
  Award, 
  ShieldAlert, 
  Layers, 
  TrendingUp, 
  BookOpen, 
  MessageSquare,
  FileSpreadsheet,
  Plus,
  Trash,
  ChevronUp,
  ChevronDown,
  Save,
  Check,
  X,
  FileText,
  Calendar,
  User,
  AlertCircle,
  ClipboardList
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';

// Status / Progress options for Meetings
const MEETING_STATUS_OPTIONS = [
  'Beginning',
  'Developing',
  'Achieved',
  'Continue Coaching',
  'Passed Tier 2',
  'Ongoing MTSS',
  'Sick',
  'Absent',
  'Task / Assignment'
];

// Diagnosis / Outcome options
const DIAGNOSIS_OPTIONS = [
  'Active',
  'Achieved',
  'Passed Tier 2',
  'Needs Support',
  'Refer to SN',
  'Exit MTSS',
  'Beginning',
  'Developing',
  'Ongoing Tier 2'
];

export default function MTSSAcademicDashboard() {
  const { profile } = useAuth();
  const { activeYear } = useAcademicYear();
  const { cases, loading: casesLoading, error: casesError } = useMTSSCases();

  // Active Main tab state: 'cases' or 'spreadsheet'
  const [activeMainTab, setActiveMainTab] = useState<'cases' | 'spreadsheet'>('cases');

  // Single-student history drawer state
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [selectedCase, setSelectedCase] = useState<{
    id: string;
    studentId: string;
    studentName: string;
    subject: string;
    tier: string;
    academicYear?: string;
  } | null>(null);

  // Sync / Refresh key state
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [subjectFilter, setSubjectFilter] = useState<string>('All');
  const [tierFilter, setTierFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('Active');

  // BATCH SPREADSHEET STATES
  const [batchSheets, setBatchSheets] = useState<MTSSBatchSheet[]>([]);
  const [loadingSheets, setLoadingSheets] = useState<boolean>(false);
  const [sheetViewState, setSheetViewState] = useState<'LIST' | 'SETUP' | 'EDIT'>('LIST');

  // SETUP FORM STATE
  const [classesList, setClassesList] = useState<any[]>([]);
  const [studentsInClass, setStudentsInClass] = useState<any[]>([]);
  const [loadingStudents, setLoadingStudents] = useState<boolean>(false);

  const [setupYear, setSetupYear] = useState<string>('');
  const [setupSemester, setSetupSemester] = useState<string>('Semester 1');
  const [setupSubject, setSetupSubject] = useState<string>('Bahasa Indonesia');
  const [setupTier, setSetupTier] = useState<string>('Tier 2');
  const [setupClassIds, setSetupClassIds] = useState<string[]>([]);
  const [setupTeacherName, setSetupTeacherName] = useState<string>('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [setupBlocks, setSetupBlocks] = useState<MTSSBlockConfig[]>([]);

  // EDIT SHEET STATE
  const [editingSheetId, setEditingSheetId] = useState<string | undefined>(undefined);
  const [editBlocks, setEditBlocks] = useState<MTSSBlockConfig[]>([]);
  const [editStudentsData, setEditStudentsData] = useState<Record<string, MTSSStudentRowData>>({});
  const [editStudentIds, setEditStudentIds] = useState<string[]>([]);
  const [isSavingSheet, setIsSavingSheet] = useState<boolean>(false);

  // Track modified status
  const [isSheetModified, setIsSheetModified] = useState<boolean>(false);

  const [selectedYear, setSelectedYear] = useState<string>('2026/2027');

  // Sync setupYear when selectedYear changes
  useEffect(() => {
    setSetupYear(selectedYear);
  }, [selectedYear]);

  // Load elementary classes for Setup dropdown
  useEffect(() => {
    const loadClasses = async () => {
      try {
        const allClasses = await getClasses() || [];
        const elementaryClasses = allClasses.filter(
          c => c.unitId === 'ELEMENTARY' && c.status !== 'archived' && c.academicYear === selectedYear
        );
        setClassesList(elementaryClasses);
        if (elementaryClasses.length > 0 && setupClassIds.length === 0) {
          setSetupClassIds([elementaryClasses[0].id]);
        }
      } catch (err) {
        console.error('Error loading elementary classes:', err);
      }
    };
    loadClasses();
  }, [selectedYear]);

  // Fetch all batch sheets from Firestore
  const loadBatchSheets = async () => {
    try {
      setLoadingSheets(true);
      const res = await elementaryMTSSService.fetchBatchSheets();
      setBatchSheets(res);
    } catch (err) {
      console.error('Error loading batch sheets:', err);
      toast.error('Gagal memuat daftar spreadsheet tersimpan');
    } finally {
      setLoadingSheets(false);
    }
  };

  useEffect(() => {
    loadBatchSheets();
  }, [refreshKey]);

  // Load students belonging to selected setup classes
  useEffect(() => {
    const loadStudents = async () => {
      if (setupClassIds.length === 0 || !setupYear) {
        setStudentsInClass([]);
        setSelectedStudentIds([]);
        return;
      }
      try {
        setLoadingStudents(true);
        const promises = setupClassIds.map(classId => getActiveStudents(classId, setupYear));
        const results = await Promise.all(promises);

        const allStudents: any[] = [];
        results.forEach((res, index) => {
          const classId = setupClassIds[index];
          const className = classesList.find(c => c.id === classId)?.name || '';
          if (res) {
            res.forEach((student: any) => {
              allStudents.push({
                ...student,
                classId,
                className
              });
            });
          }
        });

        const sortedStudents = allStudents.sort((a, b) => {
          const classCompare = (a.className || '').localeCompare(b.className || '');
          if (classCompare !== 0) return classCompare;
          return a.name.localeCompare(b.name);
        });

        setStudentsInClass(sortedStudents);

        // Auto-select students that have active MTSS cases for selected subject & tier across chosen classes
        const activeStudentIds = cases
          .filter(c => 
            setupClassIds.includes(c.classId) && 
            c.subject === setupSubject && 
            c.tier === setupTier &&
            c.status !== 'Achieved'
          )
          .map(c => c.studentId);

        setSelectedStudentIds(activeStudentIds);
      } catch (err) {
        console.error('Error fetching students:', err);
      } finally {
        setLoadingStudents(false);
      }
    };
    if (sheetViewState === 'SETUP') {
      loadStudents();
    }
  }, [setupClassIds, setupYear, setupSubject, setupTier, sheetViewState, cases, classesList]);

  // Run auto-reconciliation on mount
  useEffect(() => {
    const autoSync = async () => {
      try {
        await elementaryMTSSService.reconcileAllMTSSCases();
      } catch (err) {
        console.error('Failed to run background auto-reconciliation:', err);
      }
    };
    autoSync();
  }, []);

  const handleManualSync = async () => {
    try {
      setIsSyncing(true);
      const updatedCount = await elementaryMTSSService.reconcileAllMTSSCases();
      triggerRefresh();
      toast.success(`Sinkronisasi berhasil! Menyinkronkan ${updatedCount} data kasus dari evaluasi Literasi & Numerasi.`);
    } catch (err) {
      console.error('Failed to manually reconcile cases:', err);
      toast.error('Gagal melakukan sinkronisasi data.');
    } finally {
      setIsSyncing(false);
    }
  };

  const triggerRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  const handleOpenCoaching = (
    caseId: string,
    studentName: string,
    subject: string,
    tier: string,
    studentId?: string,
    academicYear?: string
  ) => {
    let resolvedStudentId = studentId;
    if (!resolvedStudentId) {
      const match = cases.find((c) => c.id === caseId);
      resolvedStudentId = match ? match.studentId : caseId.split('_')[0];
    }
    const resolvedYear = academicYear || setupYear || selectedYear;

    setSelectedCase({
      id: caseId,
      studentId: resolvedStudentId || '',
      studentName,
      subject,
      tier,
      academicYear: resolvedYear
    });
    setDrawerOpen(true);
  };

  // Open coaching log drawer directly from batch spreadsheet student row
  const handleOpenCoachingFromSpreadsheet = (studentId: string, studentName: string) => {
    if (!studentId) {
      toast.error('Data ID Siswa tidak valid.');
      return;
    }
    const resolved = resolveCaseForStudent(cases, studentId, setupSubject, setupTier, studentName);
    handleOpenCoaching(resolved.caseId, resolved.studentName, resolved.subject, resolved.tier, studentId, setupYear);
  };

  // Compute related spreadsheets for currently selected student case
  const relatedSheets = React.useMemo(() => {
    if (!selectedCase?.studentId) return [];
    return batchSheets.filter((sheet) => {
      const hasStudent = Array.isArray(sheet.studentIds) && sheet.studentIds.includes(selectedCase.studentId);
      const hasSubject = sheet.subject === selectedCase.subject;
      const matchesYear = selectedCase.academicYear
        ? sheet.academicYear === selectedCase.academicYear
        : true;
      return hasStudent && hasSubject && matchesYear;
    });
  }, [batchSheets, selectedCase]);

  const handleOpenBatchSheetFromDrawer = async (sheetId: string) => {
    // If user is currently editing another sheet with unsaved changes, prompt confirmation
    if (sheetViewState === 'EDIT' && isSheetModified && editingSheetId !== sheetId) {
      const confirmSwitch = window.confirm(
        'Perubahan pada spreadsheet saat ini belum disimpan. Apakah Anda yakin ingin beralih ke spreadsheet lain dan membuang perubahan belum tersimpan?'
      );
      if (!confirmSwitch) {
        return;
      }
    }

    // If user clicks to open the sheet that is already open on screen, just close drawer to preserve edits
    if (editingSheetId && sheetId === editingSheetId && sheetViewState === 'EDIT') {
      setDrawerOpen(false);
      setSelectedCase(null);
      toast.info('Spreadsheet ini sedang dibuka di layar.');
      return;
    }

    let sheet = batchSheets.find((s) => s.id === sheetId);
    if (!sheet) {
      try {
        const fetched = await elementaryMTSSService.fetchBatchSheetById(sheetId);
        if (fetched) sheet = fetched;
      } catch (err) {
        console.warn('Gagal memuat spreadsheet sumber by ID:', err);
      }
    }

    if (sheet) {
      setDrawerOpen(false);
      setSelectedCase(null);
      setActiveMainTab('spreadsheet');
      handleOpenSavedSheet(sheet);
      toast.info(`Membuka spreadsheet: ${sheet.subject} (${sheet.className || sheet.classId})`);
    } else {
      toast.error('Spreadsheet sumber tidak lagi tersedia di database. Catatan ini tetap tersimpan sebagai riwayat baca-saja.');
    }
  };

  // Stats calculation
  const stats = React.useMemo(() => {
    const validClassIds = classesList.map(c => c.id);
    const yearCases = cases.filter(c => validClassIds.includes(c.classId));

    const total = yearCases.length;
    const active = yearCases.filter(c => c.status !== 'Achieved').length;
    const achieved = yearCases.filter(c => c.status === 'Achieved').length;
    const tier2 = yearCases.filter(c => c.tier === 'Tier 2' && c.status !== 'Achieved').length;
    const tier3 = yearCases.filter(c => c.tier === 'Tier 3' && c.status !== 'Achieved').length;
    const sn = yearCases.filter(c => c.tier === 'SN' && c.status !== 'Achieved').length;

    const bahasaCount = yearCases.filter(c => c.subject === 'Bahasa Indonesia' && c.status !== 'Achieved').length;
    const englishCount = yearCases.filter(c => c.subject === 'English' && c.status !== 'Achieved').length;
    const numeracyCount = yearCases.filter(c => c.subject === 'Numeracy' && c.status !== 'Achieved').length;
    const mengajiCount = yearCases.filter(c => c.subject === 'Mengaji' && c.status !== 'Achieved').length;

    return {
      total,
      active,
      achieved,
      tier2,
      tier3,
      sn,
      subjects: {
        'Bahasa Indonesia': bahasaCount,
        'English': englishCount,
        'Numeracy': numeracyCount,
        'Mengaji': mengajiCount
      }
    };
  }, [cases, classesList, refreshKey]);

  // Filter cases
  const filteredCases = React.useMemo(() => {
    const validClassIds = classesList.map(c => c.id);
    return cases.filter((c) => {
      // Only include cases belonging to classes in the selected academic year
      if (!validClassIds.includes(c.classId)) return false;

      const matchSearch = c.studentName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          c.studentId?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchSubject = subjectFilter === 'All' || c.subject === subjectFilter;
      const matchTier = tierFilter === 'All' || c.tier === tierFilter;
      
      const realStatus = c.status || 'Active';
      const matchStatus = statusFilter === 'All'
        ? true
        : statusFilter === 'Active'
          ? realStatus !== 'Achieved'
          : realStatus === 'Achieved';

      return matchSearch && matchSubject && matchTier && matchStatus;
    });
  }, [cases, classesList, searchTerm, subjectFilter, tierFilter, statusFilter, refreshKey]);


  // ==========================================
  // BATCH SPREADSHEET BUILDER & ACTIONS
  // ==========================================

  // Launch New Spreadsheet Wizard
  const handleStartSetup = () => {
    // Generate default blocks: Meeting 1, Meeting 2, Assessment 1, Meeting 3, Meeting 4, Assessment 2 (Final Outcome)
    const initialBlocks: MTSSBlockConfig[] = [
      { id: 'block_m1', type: 'MEETING', label: 'Meeting 1' },
      { id: 'block_m2', type: 'MEETING', label: 'Meeting 2' },
      { id: 'block_a1', type: 'ASSESSMENT', label: 'Assessment 1' },
      { id: 'block_m3', type: 'MEETING', label: 'Meeting 3' },
      { id: 'block_m4', type: 'MEETING', label: 'Meeting 4' },
      { id: 'block_a2', type: 'ASSESSMENT', label: 'Assessment 2' }
    ];
    setSetupBlocks(initialBlocks);
    setEditingSheetId(undefined);
    setSetupClassIds([]);
    setSetupTeacherName('');
    setSelectedStudentIds([]);
    setIsSheetModified(false);
    setSheetViewState('SETUP');
  };

  // Add block to setup
  const addBlockToSetup = (type: 'MEETING' | 'ASSESSMENT') => {
    const blockCount = setupBlocks.filter(b => b.type === type).length + 1;
    const label = type === 'MEETING' ? `Meeting ${blockCount}` : `Assessment ${blockCount}`;
    const id = `block_${type.toLowerCase()}_${Date.now()}`;
    setSetupBlocks([...setupBlocks, { id, type, label }]);
  };

  // Remove block from setup
  const removeBlockFromSetup = (id: string) => {
    setSetupBlocks(setupBlocks.filter(b => b.id !== id));
  };

  // Reorder blocks in setup
  const moveBlock = (index: number, direction: 'UP' | 'DOWN') => {
    if (direction === 'UP' && index === 0) return;
    if (direction === 'DOWN' && index === setupBlocks.length - 1) return;

    const swapIndex = direction === 'UP' ? index - 1 : index + 1;
    const newBlocks = [...setupBlocks];
    const temp = newBlocks[index];
    newBlocks[index] = newBlocks[swapIndex];
    newBlocks[swapIndex] = temp;
    setSetupBlocks(newBlocks);
  };

  // Toggle student selection
  const handleToggleStudent = (studentId: string) => {
    if (selectedStudentIds.includes(studentId)) {
      setSelectedStudentIds(selectedStudentIds.filter(id => id !== studentId));
    } else {
      setSelectedStudentIds([...selectedStudentIds, studentId]);
    }
  };

  // Select all / None students
  const handleSelectAllStudents = () => {
    if (selectedStudentIds.length === studentsInClass.length) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(studentsInClass.map(s => s.id));
    }
  };

  // Generate Spreadsheet from Setup
  const handleGenerateSpreadsheet = () => {
    if (selectedStudentIds.length === 0) {
      toast.error('Harap pilih minimal satu siswa untuk spreadsheet batch coaching!');
      return;
    }
    if (setupBlocks.length === 0) {
      toast.error('Harap tambahkan minimal satu kolom (Meeting atau Assessment) pada spreadsheet Anda.');
      return;
    }

    const selectedClasses = classesList.filter(c => setupClassIds.includes(c.id));
    const className = selectedClasses.map(c => c.name).join(', ') || 'SD';
    const initialStudentsData: Record<string, MTSSStudentRowData> = {};

    selectedStudentIds.forEach(stId => {
      const studentObj = studentsInClass.find(s => s.id === stId);
      const studentClassId = studentObj?.classId || setupClassIds[0] || '';
      const studentClassName = classesList.find(c => c.id === studentClassId)?.name || 'SD';
      const caseId = `${stId}_${setupSubject === 'Bahasa Indonesia' ? 'BAHASA_INDONESIA' : setupSubject === 'English' ? 'ENGLISH_READING' : setupSubject === 'Mengaji' ? 'MENGAJI' : 'NUMERACY'}`;
      const existingCase = cases.find(c => c.id === caseId);

      // Prepopulate row fields
      initialStudentsData[stId] = {
        studentId: stId,
        studentName: studentObj?.name || 'Siswa',
        classId: studentClassId,
        className: studentClassName,
        goal: existingCase?.baselineScore || '',
        teachers: setupTeacherName,
        baseline: existingCase?.baselineScore || '',
        current: '',
        target: existingCase?.targetScore || '',
        blocks: {},
        dateAssessed: '',
        finalDiagnosis: 'Active',
        notes: ''
      };

      // Set empty values for each block
      setupBlocks.forEach(b => {
        if (b.type === 'MEETING') {
          initialStudentsData[stId].blocks[b.id] = { date: '', status: '' };
        } else {
          initialStudentsData[stId].blocks[b.id] = { result: '', dateAssessed: '', note: '' };
        }
      });
    });

    setEditBlocks(setupBlocks);
    setEditStudentsData(initialStudentsData);
    setEditStudentIds(selectedStudentIds);
    setEditingSheetId(undefined); // brand new
    setIsSheetModified(true);
    setSheetViewState('EDIT');
  };

  // Load Saved Sheet for Editing
  const handleOpenSavedSheet = async (sheet: MTSSBatchSheet) => {
    try {
      setEditBlocks(sheet.orderedBlocks);
      setEditStudentsData(sheet.studentsData);
      setEditStudentIds(sheet.studentIds);
      setEditingSheetId(sheet.id);
      
      // Keep track of metadata inside setup form in case they re-configure
      setSetupYear(sheet.academicYear);
      setSetupSemester(sheet.semester);
      setSetupSubject(sheet.subject);
      setSetupTier(sheet.tier);
      
      if (sheet.classId?.includes(',')) {
        setSetupClassIds(sheet.classId.split(','));
      } else if (sheet.classId) {
        setSetupClassIds([sheet.classId]);
      } else {
        setSetupClassIds([]);
      }
      
      setSetupTeacherName(sheet.teacherName || '');
      setSelectedStudentIds(sheet.studentIds);
      setSetupBlocks(sheet.orderedBlocks);

      setIsSheetModified(false);
      setSheetViewState('EDIT');
    } catch (err) {
      console.error('Error loading saved spreadsheet:', err);
      toast.error('Gagal memuat spreadsheet.');
    }
  };

  // Delete batch sheet
  const handleDeleteSheet = async (sheetId: string) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus data spreadsheet batch ini? Riwayat intervensi siswa yang telah tercatat dari spreadsheet ini akan tetap dipertahankan sebagai riwayat baca-saja.')) return;
    try {
      await elementaryMTSSService.deleteBatchSheet(sheetId);
      toast.success('Spreadsheet berhasil dihapus! Riwayat intervensi siswa tetap tersimpan.');
      loadBatchSheets();
    } catch (err) {
      console.error(err);
      toast.error('Gagal menghapus spreadsheet.');
    }
  };

  // Modify cell values inside spreadsheet
  const handleEditCell = (studentId: string, blockId: string, field: string, value: any) => {
    setIsSheetModified(true);
    setEditStudentsData(prev => {
      const row = prev[studentId];
      if (!row) return prev;

      const blockVal = row.blocks[blockId] || {};
      return {
        ...prev,
        [studentId]: {
          ...row,
          blocks: {
            ...row.blocks,
            [blockId]: {
              ...blockVal,
              [field]: value
            }
          }
        }
      };
    });
  };

  // Modify row values (e.g. baseline, goal, finalOutcome, etc.)
  const handleEditRowField = (studentId: string, field: keyof MTSSStudentRowData, value: any) => {
    setIsSheetModified(true);
    setEditStudentsData(prev => {
      const row = prev[studentId];
      if (!row) return prev;
      return {
        ...prev,
        [studentId]: {
          ...row,
          [field]: value
        }
      };
    });
  };

  // Add block on the fly inside edit screen
  const handleAddBlockOnTheFly = (type: 'MEETING' | 'ASSESSMENT') => {
    const blockCount = editBlocks.filter(b => b.type === type).length + 1;
    const label = type === 'MEETING' ? `Meeting ${blockCount}` : `Assessment ${blockCount}`;
    const id = `block_${type.toLowerCase()}_${Date.now()}`;
    const newBlock: MTSSBlockConfig = { id, type, label };

    setEditBlocks([...editBlocks, newBlock]);
    setIsSheetModified(true);

    // Populate empty values for all student rows
    setEditStudentsData(prev => {
      const updated = { ...prev };
      editStudentIds.forEach(id => {
        if (updated[id]) {
          updated[id] = {
            ...updated[id],
            blocks: {
              ...updated[id].blocks,
              [newBlock.id]: type === 'MEETING' 
                ? { date: '', status: '' }
                : { result: '', dateAssessed: '', note: '' }
            }
          };
        }
      });
      return updated;
    });

    toast.success(`Berhasil menambahkan kolom ${label}!`);
  };

  // Remove block on the fly from edit screen
  const handleRemoveBlockOnTheFly = (blockId: string, label: string) => {
    if (!window.confirm(`Hapus kolom "${label}"? Data di kolom ini akan hilang.`)) return;

    setEditBlocks(editBlocks.filter(b => b.id !== blockId));
    setIsSheetModified(true);

    setEditStudentsData(prev => {
      const updated = { ...prev };
      editStudentIds.forEach(id => {
        if (updated[id]) {
          const blocksCopy = { ...updated[id].blocks };
          delete blocksCopy[blockId];
          updated[id] = {
            ...updated[id],
            blocks: blocksCopy
          };
        }
      });
      return updated;
    });

    toast.success(`Kolom ${label} berhasil dihapus.`);
  };

  // Save Spreadsheet (Create/Update in DB + sync individual cases)
  const handleSaveSpreadsheet = async () => {
    try {
      setIsSavingSheet(true);
      const selectedClasses = classesList.filter(c => setupClassIds.includes(c.id));
      const className = selectedClasses.map(c => c.name).join(', ') || 'SD';
      const classId = setupClassIds.join(',');

      const payload: Omit<MTSSBatchSheet, 'id' | 'createdAt' | 'updatedAt'> = {
        academicYear: setupYear,
        semester: setupSemester,
        subject: setupSubject,
        tier: setupTier,
        classId,
        className,
        teacherName: setupTeacherName,
        orderedBlocks: editBlocks,
        studentsData: editStudentsData,
        studentIds: editStudentIds
      };

      const docId = await elementaryMTSSService.saveBatchSheet(payload, editingSheetId);
      setEditingSheetId(docId);
      setIsSheetModified(false);
      toast.success('Spreadsheet dan data intervensi siswa berhasil disimpan!');
      
      // Refresh dashboard cases lists
      triggerRefresh();
      
      // Return to sheets listing
      setSheetViewState('LIST');
    } catch (err) {
      console.error('Error saving batch spreadsheet:', err);
      toast.error('Gagal menyimpan spreadsheet batch coaching');
    } finally {
      setIsSavingSheet(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
      {/* HEADER SECTION */}
      <div className="bg-gradient-to-r from-emerald-950 via-teal-900 to-emerald-900 rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden shadow-lg border border-teal-800/40">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 bg-teal-500/10 w-96 h-96 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -translate-x-12 translate-y-12 bg-emerald-500/10 w-96 h-96 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 text-[10px] font-black uppercase tracking-wider">
              <Sparkles size={12} />
              SD Unit - Lazuardi GCS
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight flex items-center gap-2">
              <GraduationCap size={28} className="text-emerald-400" />
              MTSS Academic Elementary
            </h1>
          </div>
          
          <div className="flex items-end gap-3 self-start md:self-auto shrink-0">
            <div className="flex flex-col gap-1">
              <span className="text-[9px] font-black uppercase tracking-widest text-emerald-300">Tahun Ajaran</span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="bg-emerald-900/50 text-white border border-emerald-700/60 rounded-xl px-3.5 py-2 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="2025/2026" className="text-slate-800 font-bold">2025/2026</option>
                <option value="2026/2027" className="text-slate-800 font-bold">2026/2027</option>
              </select>
            </div>

            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 disabled:bg-white/5 border border-white/10 hover:border-white/20 text-white rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer shadow-sm shrink-0 h-[38px]"
            >
              <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
              {isSyncing ? "Mensinkronisasikan..." : "Sinc Kasus Baru"}
            </button>
          </div>
        </div>
      </div>

      {/* MAIN NAVIGATION TABS */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveMainTab('cases')}
          className={`py-3 px-6 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            activeMainTab === 'cases'
              ? 'border-emerald-600 text-emerald-700 font-extrabold'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <ShieldAlert size={15} />
          Panel Kasus Aktif
        </button>
        <button
          onClick={() => setActiveMainTab('spreadsheet')}
          className={`py-3 px-6 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            activeMainTab === 'spreadsheet'
              ? 'border-emerald-600 text-emerald-700 font-extrabold'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <FileSpreadsheet size={15} className="text-emerald-600" />
          Spreadsheet Batch Coaching
        </button>
      </div>

      {/* MAIN TAB CONTENT */}
      <AnimatePresence mode="wait">
        {activeMainTab === 'cases' && (
          <motion.div
            key="cases-tab-content"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* QUICK BENTO STATISTICS SECTION */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-3xl p-5 border border-slate-200/60 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl border border-rose-100">
                  <ShieldAlert size={22} />
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-black tracking-widest text-slate-400">Kasus Aktif</span>
                  <h3 className="text-xl font-extrabold text-slate-800">{stats.active} Kasus</h3>
                </div>
              </div>

              <div className="bg-white rounded-3xl p-5 border border-slate-200/60 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl border border-amber-100">
                  <Layers size={22} />
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-black tracking-widest text-slate-400">Tier 2 (Monitor)</span>
                  <h3 className="text-xl font-extrabold text-slate-800">{stats.tier2} Siswa</h3>
                </div>
              </div>

              <div className="bg-white rounded-3xl p-5 border border-slate-200/60 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-red-50 text-red-600 rounded-2xl border border-red-100">
                  <TrendingUp size={22} />
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-black tracking-widest text-slate-400">Tier 3 (Intensif)</span>
                  <h3 className="text-xl font-extrabold text-slate-800">{stats.tier3} Siswa</h3>
                </div>
              </div>

              <div className="bg-white rounded-3xl p-5 border border-slate-200/60 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100">
                  <Award size={22} />
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-black tracking-widest text-slate-400">Lulus / Achieved</span>
                  <h3 className="text-xl font-extrabold text-slate-800">{stats.achieved} Kasus</h3>
                </div>
              </div>
            </div>

            {/* STATISTICS BY SUBJECT DOMAIN */}
            <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5">
              <h3 className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                <BookOpen size={12} className="text-indigo-500" />
                Distribusi Kasus Aktif per Area Pembelajaran
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(stats.subjects).map(([subject, count]) => (
                  <div key={subject} className="bg-white rounded-2xl p-4 border border-slate-100/80 shadow-sm flex flex-col justify-center">
                    <span className="text-[10px] font-bold text-slate-500 mb-0.5">{subject}</span>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xl font-black text-slate-800">{count}</span>
                      <span className="text-[9px] font-bold text-slate-400">siswa aktif</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* SEARCH AND FILTERS TOOLBAR */}
            <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-sm space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <span className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                  <FileSpreadsheet size={14} className="text-emerald-600" />
                  Saringan Kasus Akademis ({filteredCases.length})
                </span>
                <div className="relative w-full md:w-80">
                  <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Cari nama atau ID siswa..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-10 pr-4 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                {/* Filter Subject */}
                <div>
                  <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">
                    Bidang Studi
                  </label>
                  <select
                    value={subjectFilter}
                    onChange={(e) => setSubjectFilter(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-700 cursor-pointer"
                  >
                    <option value="All">Semua Bidang Studi</option>
                    <option value="Bahasa Indonesia">Bahasa Indonesia</option>
                    <option value="English">English</option>
                    <option value="Numeracy">Numeracy</option>
                    <option value="Mengaji">Mengaji</option>
                  </select>
                </div>

                {/* Filter Tier */}
                <div>
                  <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">
                    Rekomendasi Tier
                  </label>
                  <select
                    value={tierFilter}
                    onChange={(e) => setTierFilter(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-700 cursor-pointer"
                  >
                    <option value="All">Semua Tingkat Tier</option>
                    <option value="Tier 2">Tier 2 (Monitor)</option>
                    <option value="Tier 3">Tier 3 (Intensif)</option>
                  </select>
                </div>

                {/* Filter Status */}
                <div>
                  <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">
                    Status Kasus
                  </label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-700 cursor-pointer"
                  >
                    <option value="All">Semua Status</option>
                    <option value="Active">🔴 Kasus Aktif (Active)</option>
                    <option value="Achieved">🟢 Lulus (Achieved)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* CASE TABLE */}
            {casesLoading ? (
              <div className="flex flex-col items-center justify-center p-20 gap-3 border border-slate-100 rounded-3xl bg-white shadow-sm">
                <RefreshCw size={28} className="text-slate-400 animate-spin" />
                <span className="text-xs text-slate-500 italic">Memuat daftar kasus MTSS...</span>
              </div>
            ) : casesError ? (
              <div className="bg-red-50 text-red-700 p-6 rounded-3xl border border-red-200">
                <p className="font-bold text-sm">Gagal Sinkronisasi Kasus MTSS</p>
                <p className="text-xs mt-1">{casesError}</p>
              </div>
            ) : (
              <MTSSCaseTable 
                cases={filteredCases} 
                onLogCoaching={handleOpenCoaching} 
                onRefresh={triggerRefresh}
                classesList={classesList}
              />
            )}
          </motion.div>
        )}

        {/* BATCH SPREADSHEET SYSTEM VIEW */}
        {activeMainTab === 'spreadsheet' && (
          <motion.div
            key="spreadsheet-tab-content"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* STATE 1: LIST SHEET VIEW */}
            {sheetViewState === 'LIST' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-black text-slate-800">Daftar Spreadsheet Batch Tersimpan</h3>
                    <p className="text-xs text-slate-450 mt-1 font-semibold">Silakan buat atau edit spreadsheet bimbingan massal untuk kelompok belajar tertentu.</p>
                  </div>
                  <button
                    onClick={handleStartSetup}
                    className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black uppercase tracking-wider py-2.5 px-4 rounded-xl shadow transition-all cursor-pointer"
                  >
                    <Plus size={16} />
                    Desain Spreadsheet Baru
                  </button>
                </div>

                {loadingSheets ? (
                  <div className="flex flex-col items-center justify-center p-20 gap-2 border border-dashed border-slate-200 rounded-3xl bg-white">
                    <RefreshCw size={24} className="animate-spin text-slate-400" />
                    <span className="text-xs text-slate-450 italic">Memuat daftar spreadsheet...</span>
                  </div>
                ) : batchSheets.filter(sheet => sheet.academicYear === selectedYear).length === 0 ? (
                  <div className="p-16 text-center border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50 flex flex-col items-center justify-center gap-3">
                    <FileSpreadsheet size={48} className="text-slate-300" />
                    <p className="text-sm font-black text-slate-650 uppercase tracking-wider">Belum Ada Spreadsheet Tersimpan</p>
                    <p className="text-xs text-slate-450 max-w-md">Catat progres bimbingan multi-siswa dengan mendesain lembar bimbingan baru sesuai kebutuhan kelompok atau kelas Anda untuk tahun ajaran {selectedYear}.</p>
                    <button
                      onClick={handleStartSetup}
                      className="mt-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black uppercase tracking-wider py-2.5 px-5 rounded-xl shadow-sm transition-all cursor-pointer"
                    >
                      Mulai Desain Sekarang
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {batchSheets.filter(sheet => sheet.academicYear === selectedYear).map((sheet) => (
                      <div key={sheet.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 hover:shadow transition-shadow flex flex-col justify-between space-y-4">
                        <div className="space-y-2">
                          <div className="flex justify-between items-start gap-2">
                            <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-black uppercase tracking-wider rounded-md">
                              {sheet.subject}
                            </span>
                            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-800 text-[10px] font-bold rounded-md">
                              {sheet.tier}
                            </span>
                          </div>
                          
                          <h4 className="text-base font-black text-slate-800 leading-tight">
                            Spreadsheet Batch - Kelas {sheet.className}
                          </h4>
                          
                          <div className="text-xs font-semibold text-slate-500 space-y-1">
                            <p className="flex items-center gap-1.5">
                              <Calendar size={13} className="text-slate-400" />
                              Tahun {sheet.academicYear} ({sheet.semester})
                            </p>
                            <p className="flex items-center gap-1.5">
                              <User size={13} className="text-slate-400" />
                              Guru: {sheet.teacherName}
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-2 pt-2 text-center font-mono text-[10px] font-bold text-slate-500">
                            <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                              <p className="text-[8px] text-slate-450 uppercase">Siswa</p>
                              <p className="text-xs font-black text-slate-700 mt-0.5">{sheet.studentIds.length} Siswa</p>
                            </div>
                            <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                              <p className="text-[8px] text-slate-450 uppercase">Sesi / Kolom</p>
                              <p className="text-xs font-black text-slate-700 mt-0.5">{sheet.orderedBlocks.length} Blok</p>
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2 pt-2 border-t border-slate-100">
                          <button
                            onClick={() => handleOpenSavedSheet(sheet)}
                            className="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-extrabold py-2 rounded-xl transition-all cursor-pointer text-center"
                          >
                            Buka Spreadsheet
                          </button>
                          <button
                            onClick={() => handleDeleteSheet(sheet.id)}
                            className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl transition-all cursor-pointer"
                            title="Hapus Spreadsheet"
                          >
                            <Trash size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* STATE 2: SETUP WIZARD VIEW */}
            {sheetViewState === 'SETUP' && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-8">
                <div>
                  <h3 className="text-lg font-black text-slate-800">Desain Struktur Spreadsheet Baru</h3>
                  <p className="text-xs text-slate-400 font-bold mt-1 uppercase tracking-wider">Konfigurasikan sasaran siswa, jumlah sesi pertemuan, dan evaluasi sela</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* LEFT PARAMETERS COLUMN */}
                  <div className="space-y-4 lg:col-span-1 border-r border-slate-100 lg:pr-8">
                    <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block border-b border-indigo-100 pb-1">
                      1. Parameter Lembar Kerja
                    </span>

                    {/* Class Selection (Multi-select) */}
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">
                        Kelas (Pilih Satu atau Lebih)
                      </label>
                      <div className="max-h-40 overflow-y-auto space-y-1.5 p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                        {classesList.map(c => {
                          const isSelected = setupClassIds.includes(c.id);
                          return (
                            <label
                              key={c.id}
                              className={`flex items-center gap-2 p-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                                isSelected ? 'bg-emerald-50 text-emerald-950' : 'hover:bg-slate-100 text-slate-700'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  if (isSelected) {
                                    // Make sure they can't de-select the last remaining class to avoid empty state issues
                                    if (setupClassIds.length > 1) {
                                      setSetupClassIds(setupClassIds.filter(id => id !== c.id));
                                    } else {
                                      toast.warning('Pilih minimal satu kelas!');
                                    }
                                  } else {
                                    setSetupClassIds([...setupClassIds, c.id]);
                                  }
                                }}
                                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer h-3.5 w-3.5"
                              />
                              <span>{c.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {/* Academic Year */}
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">
                        Tahun Ajaran
                      </label>
                      <select
                        value={setupYear}
                        onChange={(e) => setSetupYear(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold focus:outline-none text-slate-800 cursor-pointer"
                      >
                        <option value="2025/2026">2025/2026</option>
                        <option value="2026/2027">2026/2027</option>
                      </select>
                    </div>

                    {/* Semester */}
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">
                        Semester
                      </label>
                      <select
                        value={setupSemester}
                        onChange={(e) => setSetupSemester(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold focus:outline-none text-slate-800 cursor-pointer"
                      >
                        <option value="Semester 1">Semester 1</option>
                        <option value="Semester 2">Semester 2</option>
                      </select>
                    </div>

                    {/* Subject */}
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">
                        Bidang Studi / Subject
                      </label>
                      <select
                        value={setupSubject}
                        onChange={(e) => setSetupSubject(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold focus:outline-none text-slate-800 cursor-pointer"
                      >
                        <option value="Bahasa Indonesia">Bahasa Indonesia</option>
                        <option value="English">English</option>
                        <option value="Numeracy">Numeracy</option>
                        <option value="Mengaji">Mengaji</option>
                      </select>
                    </div>

                    {/* Tier */}
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">
                        Tier Level
                      </label>
                      <select
                        value={setupTier}
                        onChange={(e) => setSetupTier(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold focus:outline-none text-slate-800 cursor-pointer"
                      >
                        <option value="Tier 2">Tier 2 (Monitor)</option>
                        <option value="Tier 3">Tier 3 (Intensif)</option>
                      </select>
                    </div>

                    {/* Teacher Name */}
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">
                        Nama Guru Pengajar
                      </label>
                      <input
                        type="text"
                        value={setupTeacherName}
                        onChange={(e) => setSetupTeacherName(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold focus:outline-none text-slate-800"
                        required
                      />
                    </div>
                  </div>

                  {/* MIDDLE STUDENTS SELECTION COLUMN */}
                  <div className="space-y-4 lg:col-span-1 border-r border-slate-100 lg:px-8">
                    <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
                      <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block">
                        2. Pilih Siswa ({selectedStudentIds.length})
                      </span>
                      <select
                        onChange={(e) => {
                          const action = e.target.value;
                          if (action === 'all') {
                            setSelectedStudentIds(studentsInClass.map(s => s.id));
                          } else if (action === 'tier2') {
                            let t2Ids = studentsInClass
                              .filter(st => cases.some(c => c.studentId === st.id && c.subject === setupSubject && c.tier === 'Tier 2' && c.status !== 'Achieved'))
                              .map(st => st.id);
                            if (t2Ids.length === 0) {
                              t2Ids = studentsInClass
                                .filter(st => cases.some(c => c.studentId === st.id && c.tier === 'Tier 2' && c.status !== 'Achieved'))
                                .map(st => st.id);
                            }
                            setSelectedStudentIds(t2Ids);
                            if (t2Ids.length === 0) {
                              toast.info('Tidak ada siswa aktif Tier 2 di kelas ini.');
                            }
                          } else if (action === 'tier3') {
                            let t3Ids = studentsInClass
                              .filter(st => cases.some(c => c.studentId === st.id && c.subject === setupSubject && c.tier === 'Tier 3' && c.status !== 'Achieved'))
                              .map(st => st.id);
                            if (t3Ids.length === 0) {
                              t3Ids = studentsInClass
                                .filter(st => cases.some(c => c.studentId === st.id && c.tier === 'Tier 3' && c.status !== 'Achieved'))
                                .map(st => st.id);
                            }
                            setSelectedStudentIds(t3Ids);
                            if (t3Ids.length === 0) {
                              toast.info('Tidak ada siswa aktif Tier 3 di kelas ini.');
                            }
                          } else if (action === 'none') {
                            setSelectedStudentIds([]);
                          }
                          // Reset selection index
                          e.target.value = '';
                        }}
                        defaultValue=""
                        className="text-[10px] font-bold bg-slate-50 border border-slate-200 text-slate-700 px-2 py-1 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                      >
                        <option value="" disabled>Pilih Cepat...</option>
                        <option value="all">Pilih Semua</option>
                        <option value="tier2">Pilih Tier 2</option>
                        <option value="tier3">Pilih Tier 3</option>
                        <option value="none">Bersihkan Pilihan</option>
                      </select>
                    </div>

                    {loadingStudents ? (
                      <div className="flex items-center justify-center p-8 text-xs text-slate-400 italic">
                        <RefreshCw size={14} className="animate-spin mr-1.5" />
                        Memuat siswa kelas...
                      </div>
                    ) : studentsInClass.filter(st => cases.some(
                      c => c.studentId === st.id && 
                      c.subject === setupSubject && 
                      c.tier === setupTier &&
                      c.status !== 'Achieved'
                    )).length === 0 ? (
                      <div className="p-8 text-center bg-amber-50/50 border border-amber-100 rounded-2xl text-xs text-amber-700 italic font-medium">
                        Tidak ada siswa dengan kasus aktif {setupTier} ({setupSubject}) di kelas ini.
                      </div>
                    ) : (
                      <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
                        {studentsInClass
                          .filter(st => cases.some(
                            c => c.studentId === st.id && 
                            c.subject === setupSubject && 
                            c.tier === setupTier &&
                            c.status !== 'Achieved'
                          ))
                          .map((st) => {
                            const hasActiveCase = cases.some(
                              c => c.studentId === st.id && 
                              c.subject === setupSubject && 
                              c.tier === setupTier &&
                              c.status !== 'Achieved'
                            );

                            return (
                              <label
                                key={st.id}
                                className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-colors text-xs font-semibold ${
                                  selectedStudentIds.includes(st.id)
                                    ? 'bg-emerald-50/50 border-emerald-200 text-emerald-950'
                                    : 'bg-white border-slate-150 hover:bg-slate-50/50 text-slate-700'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={selectedStudentIds.includes(st.id)}
                                    onChange={() => handleToggleStudent(st.id)}
                                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer h-3.5 w-3.5"
                                  />
                                  <span>{st.name}</span>
                                </div>
                                {hasActiveCase && (
                                  <span className="bg-rose-50 text-rose-700 border border-rose-100 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded">
                                    Kasus MTSS
                                  </span>
                                )}
                              </label>
                            );
                          })}
                      </div>
                    )}
                  </div>

                  {/* RIGHT SEQUENCE BUILDER COLUMN */}
                  <div className="space-y-4 lg:col-span-1 lg:pl-8">
                    <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block border-b border-indigo-100 pb-1">
                      3. Sequence Struktur Tabel
                    </span>

                    <p className="text-[10px] text-slate-400 font-bold leading-normal">
                      Susun kolom secara fleksibel. Tambahkan bimbingan (Meeting) atau sisipkan penilaian (Assessment) di mana saja di antara pertemuan.
                    </p>

                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {setupBlocks.map((block, index) => (
                        <div
                          key={block.id}
                          className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 text-xs font-bold transition-all ${
                            block.type === 'MEETING'
                              ? 'bg-blue-50/60 border-blue-100 text-blue-900'
                              : 'bg-purple-50/60 border-purple-100 text-purple-900'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${block.type === 'MEETING' ? 'bg-blue-500' : 'bg-purple-500'}`} />
                            <span>{block.label}</span>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => moveBlock(index, 'UP')}
                              disabled={index === 0}
                              className="p-1 hover:bg-white rounded text-slate-400 hover:text-slate-600 disabled:opacity-30 cursor-pointer"
                            >
                              <ChevronUp size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveBlock(index, 'DOWN')}
                              disabled={index === setupBlocks.length - 1}
                              className="p-1 hover:bg-white rounded text-slate-400 hover:text-slate-600 disabled:opacity-30 cursor-pointer"
                            >
                              <ChevronDown size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeBlockFromSetup(block.id)}
                              className="p-1 hover:bg-white rounded text-slate-400 hover:text-rose-600 cursor-pointer"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => addBlockToSetup('MEETING')}
                        className="flex items-center justify-center gap-1 border border-dashed border-blue-300 hover:border-blue-500 bg-blue-50/20 text-blue-700 py-2 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all"
                      >
                        <Plus size={12} />
                        + Pertemuan
                      </button>
                      <button
                        type="button"
                        onClick={() => addBlockToSetup('ASSESSMENT')}
                        className="flex items-center justify-center gap-1 border border-dashed border-purple-300 hover:border-purple-500 bg-purple-50/20 text-purple-700 py-2 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all"
                      >
                        <Plus size={12} />
                        + Evaluasi
                      </button>
                    </div>
                  </div>
                </div>

                {/* BOTTOM WIZARD ACTIONS */}
                <div className="flex items-center justify-between border-t border-slate-100 pt-6">
                  <button
                    type="button"
                    onClick={() => setSheetViewState('LIST')}
                    className="py-2.5 px-5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateSpreadsheet}
                    className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black uppercase tracking-wider py-2.5 px-6 rounded-xl shadow-md transition-all cursor-pointer"
                  >
                    Generate & Buka Spreadsheet
                  </button>
                </div>
              </div>
            )}

            {/* STATE 3: EDIT SHEET VIEW */}
            {sheetViewState === 'EDIT' && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                
                {/* FLOATING TOP BAR WITH CONTROLS */}
                <div className="bg-slate-900 text-white p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="bg-emerald-600 text-[10px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider animate-pulse">
                        Mode Edit Spreadsheet
                      </span>
                      <span className="text-[11px] font-bold text-slate-400">
                        {setupYear} - {setupSemester}
                      </span>
                    </div>
                    <h3 className="text-base font-black tracking-tight text-white leading-none">
                      Lembar Coaching Batch: {setupSubject} ({setupTier})
                    </h3>
                    <p className="text-[10px] font-medium text-slate-400">
                      Pengajar: <b>{setupTeacherName}</b> | Jumlah Siswa: <b>{editStudentIds.length}</b> siswa
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleAddBlockOnTheFly('MEETING')}
                      className="bg-white/10 hover:bg-white/15 border border-white/10 text-[10px] font-black uppercase tracking-wider py-1.5 px-3 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Plus size={11} />
                      + Sesi Pertemuan
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddBlockOnTheFly('ASSESSMENT')}
                      className="bg-white/10 hover:bg-white/15 border border-white/10 text-[10px] font-black uppercase tracking-wider py-1.5 px-3 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Plus size={11} />
                      + Sesi Evaluasi
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveSpreadsheet}
                      disabled={isSavingSheet}
                      className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-750 text-white text-[10px] font-black uppercase tracking-wider py-1.5 px-4 rounded-lg flex items-center gap-1 shadow cursor-pointer transition-colors"
                    >
                      <Save size={12} />
                      {isSavingSheet ? 'Menyimpan...' : 'Simpan Semua'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSheetViewState('LIST');
                      }}
                      className="bg-slate-850 hover:bg-slate-800 text-[10px] font-black uppercase tracking-wider py-1.5 px-3 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <X size={12} />
                      Tutup
                    </button>
                  </div>
                </div>

                {/* HORIZONTALLY SCROLLABLE BATCH SPREADSHEET */}
                <div className="overflow-x-auto w-full max-h-[60vh] overflow-y-auto">
                  <table className="w-full text-left border-collapse font-sans text-xs">
                    <thead>
                      {/* LEVEL 1: GROUP HEADERS */}
                      <tr className="bg-slate-100 text-slate-700 uppercase text-[9px] font-black tracking-wider border-b border-slate-200">
                        {/* Identitas (Left sticky) */}
                        <th colSpan={3} className="py-2 px-3 text-center border-r border-slate-200 sticky left-0 bg-slate-100 z-10">
                          Identitas Siswa
                        </th>
                        {/* MTSS Context */}
                        <th colSpan={6} className="py-2 px-3 text-center border-r border-slate-200 bg-slate-50/50">
                          MTSS Konteks Akademik
                        </th>
                        {/* Dynamic Sesi blocks */}
                        {editBlocks.map((block) => (
                          <th
                            key={block.id}
                            colSpan={block.type === 'MEETING' ? 2 : 3}
                            className={`py-2 px-3 text-center border-r border-slate-200 text-white relative ${
                              block.type === 'MEETING' ? 'bg-blue-900' : 'bg-purple-900'
                            }`}
                          >
                            <div className="flex items-center justify-center gap-1.5">
                              <span>{block.label}</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveBlockOnTheFly(block.id, block.label)}
                                className="text-white/60 hover:text-white transition-colors cursor-pointer"
                                title="Hapus kolom ini"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          </th>
                        ))}
                        {/* Outcome (Right) */}
                        <th colSpan={3} className="py-2 px-3 text-center bg-indigo-950 text-white">
                          Evaluasi Akhir / Outcomes
                        </th>
                      </tr>

                      {/* LEVEL 2: COLUMN HEADERS */}
                      <tr className="bg-slate-50 text-slate-600 uppercase text-[8px] font-black tracking-wider border-b border-slate-200 sticky top-0 bg-white z-10 shadow-sm">
                        {/* Sticky left */}
                        <th className="py-2 px-2 text-center border-r border-slate-200 sticky left-0 bg-slate-50 z-20 w-10">No</th>
                        <th className="py-2 px-3 border-r border-slate-200 sticky left-10 bg-slate-50 z-20 w-60 min-w-[240px]">Nama Siswa</th>
                        <th className="py-2 px-2 text-center border-r border-slate-200 sticky left-[17.5rem] bg-slate-50 z-20 w-20">Kelas</th>
                        
                        {/* Context info */}
                        <th className="py-2 px-3 border-r border-slate-200 bg-white min-w-[240px]">Goal / Sasaran</th>
                        <th className="py-2 px-2 text-center border-r border-slate-200 bg-white min-w-[90px]">Diagnosis</th>
                        <th className="py-2 px-3 border-r border-slate-200 bg-white min-w-[120px]">Tim Pengajar</th>
                        <th className="py-2 px-2 text-center border-r border-slate-200 bg-white min-w-[160px]">Baseline</th>
                        <th className="py-2 px-2 text-center border-r border-slate-200 bg-white min-w-[160px]">Current</th>
                        <th className="py-2 px-2 text-center border-r border-slate-200 bg-white min-w-[160px]">Target</th>

                        {/* Dynamic Block subheaders */}
                        {editBlocks.map((block) => (
                          <React.Fragment key={`sub-${block.id}`}>
                            {block.type === 'MEETING' ? (
                              <>
                                <th className="py-2 px-2 border-r border-slate-200 min-w-[120px] bg-blue-50/40 text-blue-900">Tanggal</th>
                                <th className="py-2 px-2 border-r border-slate-200 min-w-[120px] bg-blue-50/40 text-blue-900 text-center">Status / Progress</th>
                              </>
                            ) : (
                              <>
                                <th className="py-2 px-2 border-r border-slate-200 min-w-[80px] bg-purple-50/40 text-purple-900 text-center">Hasil</th>
                                <th className="py-2 px-2 border-r border-slate-200 min-w-[90px] bg-purple-50/40 text-purple-900">Tanggal</th>
                                <th className="py-2 px-2 border-r border-slate-200 min-w-[120px] bg-purple-50/40 text-purple-900">Catatan</th>
                              </>
                            )}
                          </React.Fragment>
                        ))}

                        {/* Right headers */}
                        <th className="py-2 px-2 border-r border-indigo-900 min-w-[90px] bg-indigo-50 text-indigo-950">Tgl Penilaian</th>
                        <th className="py-2 px-2 border-r border-indigo-900 min-w-[110px] bg-indigo-50 text-indigo-950 text-center">Diagnosis Akhir</th>
                        <th className="py-2 px-3 bg-indigo-50 text-indigo-950 min-w-[150px]">Catatan Akhir</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {editStudentIds.map((stId, sIdx) => {
                        const row = editStudentsData[stId];
                        if (!row) return null;

                        const resolvedCase = resolveCaseForStudent(cases, stId, setupSubject, setupTier, row.studentName);
                        const displayTier = resolvedCase.tier;

                        return (
                          <tr key={stId} className="hover:bg-slate-50/60 font-semibold text-slate-800 transition-colors">
                            {/* Sticky Identitas */}
                            <td className="py-2.5 px-2 text-center border-r border-slate-200 sticky left-0 bg-white z-10 font-mono text-[10px] text-slate-450 w-10">
                              {sIdx + 1}
                            </td>
                            <td className="py-2.5 px-3 border-r border-slate-200 sticky left-10 bg-white z-10 w-60 min-w-[240px]">
                              <div className="flex flex-col gap-1.5">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-extrabold text-xs text-slate-900 truncate" title={row.studentName}>
                                    {row.studentName}
                                  </span>
                                  {stId && (
                                    <span className="text-[9px] font-mono text-slate-400 font-semibold shrink-0">
                                      ID: {stId}
                                    </span>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleOpenCoachingFromSpreadsheet(stId, row.studentName)}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-900 border border-indigo-200/70 rounded-lg text-[10px] font-bold cursor-pointer transition-colors shadow-2xs w-fit"
                                  title="Buka Riwayat & Catatan Individu Siswa"
                                >
                                  <ClipboardList size={12} className="shrink-0 text-indigo-600" />
                                  <span>Riwayat & Catatan Individu</span>
                                </button>
                              </div>
                            </td>
                            <td className="py-2.5 px-2 text-center border-r border-slate-200 sticky left-[17.5rem] bg-white z-10 font-black text-slate-600 w-20">
                              {row.className}
                            </td>

                            {/* Context Column Inputs */}
                            {/* Goal */}
                            <td className="py-1.5 px-2 border-r border-slate-200">
                              <textarea
                                value={row.goal}
                                onChange={(e) => handleEditRowField(stId, 'goal', e.target.value)}
                                className="w-full h-20 bg-slate-50 border border-slate-200 hover:border-slate-300 focus:bg-white rounded px-2 py-1 text-xs font-semibold focus:outline-none resize-none"
                                placeholder="Tujuan target"
                              />
                            </td>
                            {/* Diagnosis / Tier (Read-only status) */}
                            <td className="py-2.5 px-2 text-center border-r border-slate-200 whitespace-nowrap">
                              <span className={`px-2 py-0.5 text-[9px] font-black uppercase rounded border ${
                                displayTier === 'Tier 2' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                                displayTier === 'Tier 3' ? 'bg-rose-50 text-rose-800 border-rose-200' :
                                'bg-purple-50 text-purple-800 border-purple-200'
                              }`}>
                                {displayTier}
                              </span>
                            </td>
                            {/* Tim Pengajar */}
                            <td className="py-1.5 px-2 border-r border-slate-200">
                              <textarea
                                value={row.teachers}
                                onChange={(e) => handleEditRowField(stId, 'teachers', e.target.value)}
                                className="w-full h-20 bg-slate-50 border border-slate-200 hover:border-slate-300 focus:bg-white rounded px-2 py-1 text-xs font-semibold focus:outline-none resize-none"
                                placeholder="Nama mentor"
                              />
                            </td>
                            {/* Baseline */}
                            <td className="py-1.5 px-2 border-r border-slate-200">
                              <textarea
                                value={row.baseline}
                                onChange={(e) => handleEditRowField(stId, 'baseline', e.target.value)}
                                className="w-full h-20 text-center bg-slate-50 border border-slate-200 hover:border-slate-300 focus:bg-white rounded px-2 py-1 text-xs font-semibold focus:outline-none resize-none"
                                placeholder="Baseline"
                              />
                            </td>
                            {/* Current */}
                            <td className="py-1.5 px-2 border-r border-slate-200">
                              <textarea
                                value={row.current}
                                onChange={(e) => handleEditRowField(stId, 'current', e.target.value)}
                                className="w-full h-20 text-center bg-slate-50 border border-slate-200 hover:border-slate-300 focus:bg-white rounded px-2 py-1 text-xs font-semibold focus:outline-none resize-none"
                                placeholder="Current"
                              />
                            </td>
                            {/* Target */}
                            <td className="py-1.5 px-2 border-r border-slate-200">
                              <textarea
                                value={row.target}
                                onChange={(e) => handleEditRowField(stId, 'target', e.target.value)}
                                className="w-full h-20 text-center bg-slate-50 border border-slate-200 hover:border-slate-300 focus:bg-white rounded px-2 py-1 text-xs font-semibold focus:outline-none resize-none"
                                placeholder="Target"
                              />
                            </td>

                            {/* Dynamic Sesi blocks cell inputs */}
                            {editBlocks.map((block) => {
                              const blockVal = row.blocks[block.id] || {};

                              if (block.type === 'MEETING') {
                                const mVal = blockVal as MTSSMeetingValue;
                                return (
                                  <React.Fragment key={`cell-${stId}-${block.id}`}>
                                    {/* Date */}
                                    <td className="py-1.5 px-1.5 border-r border-slate-200 bg-blue-50/5">
                                      <input
                                        type="date"
                                        value={mVal.date || mVal.date1 || ''}
                                        onChange={(e) => handleEditCell(stId, block.id, 'date', e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded px-1.5 py-1 text-xs font-semibold focus:outline-none focus:bg-white"
                                      />
                                    </td>
                                    {/* Status dropdown */}
                                    <td className="py-1.5 px-1.5 border-r border-slate-200 bg-blue-50/5 text-center">
                                      <select
                                        value={mVal.status || ''}
                                        onChange={(e) => handleEditCell(stId, block.id, 'status', e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-bold focus:outline-none cursor-pointer"
                                      >
                                        <option value="">Pilih Status</option>
                                        {MEETING_STATUS_OPTIONS.map(opt => (
                                          <option key={opt} value={opt}>{opt}</option>
                                        ))}
                                      </select>
                                    </td>
                                  </React.Fragment>
                                );
                              } else {
                                const aVal = blockVal as MTSSAssessmentValue;
                                return (
                                  <React.Fragment key={`cell-${stId}-${block.id}`}>
                                    {/* Result */}
                                    <td className="py-1.5 px-1.5 border-r border-slate-200 bg-purple-50/5">
                                      <input
                                        type="text"
                                        value={aVal.result || ''}
                                        onChange={(e) => handleEditCell(stId, block.id, 'result', e.target.value)}
                                        placeholder="Skor"
                                        className="w-full text-center bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-semibold focus:outline-none focus:bg-white"
                                      />
                                    </td>
                                    {/* Date */}
                                    <td className="py-1.5 px-1.5 border-r border-slate-200 bg-purple-50/5">
                                      <input
                                        type="date"
                                        value={aVal.dateAssessed || ''}
                                        onChange={(e) => handleEditCell(stId, block.id, 'dateAssessed', e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded px-1.5 py-1 text-xs font-semibold focus:outline-none focus:bg-white"
                                      />
                                    </td>
                                    {/* Note */}
                                    <td className="py-1.5 px-1.5 border-r border-slate-200 bg-purple-50/5">
                                      <input
                                        type="text"
                                        value={aVal.note || ''}
                                        onChange={(e) => handleEditCell(stId, block.id, 'note', e.target.value)}
                                        placeholder="Catatan hasil"
                                        className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-semibold focus:outline-none focus:bg-white"
                                      />
                                    </td>
                                  </React.Fragment>
                                );
                              }
                            })}

                            {/* Sticky Right outcome columns */}
                            {/* Date Assessed */}
                            <td className="py-1.5 px-1.5 border-r border-slate-200 bg-slate-50/40">
                              <input
                                type="date"
                                value={row.dateAssessed || ''}
                                onChange={(e) => handleEditRowField(stId, 'dateAssessed', e.target.value)}
                                className="w-full bg-slate-55 border border-slate-200 rounded px-1.5 py-1 text-xs font-semibold focus:outline-none focus:bg-white"
                              />
                            </td>
                            {/* Final Diagnosis */}
                            <td className="py-1.5 px-1.5 border-r border-slate-200 bg-slate-50/40 text-center">
                              <select
                                value={row.finalDiagnosis || 'Active'}
                                onChange={(e) => handleEditRowField(stId, 'finalDiagnosis', e.target.value)}
                                className={`w-full rounded px-2 py-1 text-xs font-black cursor-pointer focus:outline-none border ${
                                  row.finalDiagnosis === 'Achieved' || row.finalDiagnosis === 'Passed Tier 2'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-250'
                                    : 'bg-rose-50 text-rose-800 border-rose-250'
                                }`}
                              >
                                {DIAGNOSIS_OPTIONS.map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </td>
                            {/* Notes */}
                            <td className="py-1.5 px-2 bg-slate-50/40">
                              <input
                                type="text"
                                value={row.notes || ''}
                                onChange={(e) => handleEditRowField(stId, 'notes', e.target.value)}
                                placeholder="Evaluasi harian guru..."
                                className="w-full bg-slate-55 border border-slate-200 rounded px-2 py-1 text-xs font-semibold focus:outline-none focus:bg-white"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* BOTTOM COMPONENT SAVE FOOTER */}
                <div className="bg-slate-50 border-t border-slate-200 p-5 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-bold">
                    <AlertCircle size={14} className="text-amber-500 shrink-0" />
                    Setiap aksi "Simpan" otomatis mengupdate dashboard individual siswa dan riwayat bimbingannya di timeline.
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSheetViewState('LIST');
                      }}
                      className="py-2 px-4 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveSpreadsheet}
                      disabled={isSavingSheet}
                      className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black uppercase tracking-wider py-2 px-6 rounded-xl shadow-md transition-all cursor-pointer"
                    >
                      <Save size={14} />
                      {isSavingSheet ? 'Menyimpan...' : 'Simpan Semua Data'}
                    </button>
                  </div>
                </div>

              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* SINGLE-STUDENT HISTORY DRAWER */}
      {selectedCase && (
        <CoachingLogDrawer
          isOpen={drawerOpen}
          caseId={selectedCase.id}
          studentName={selectedCase.studentName}
          subject={selectedCase.subject}
          tier={selectedCase.tier}
          onClose={() => {
            setDrawerOpen(false);
            setSelectedCase(null);
          }}
          onSessionLogged={triggerRefresh}
          onOpenBatchSheet={handleOpenBatchSheetFromDrawer}
          relatedSheets={relatedSheets}
        />
      )}
    </div>
  );
}
