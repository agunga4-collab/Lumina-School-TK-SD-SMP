import * as React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, Languages, Heart, Calculator, Search, 
  Filter, History, ChevronRight, Save, User as UserIcon, 
  Calendar, RefreshCw, CheckCircle2, AlertCircle, FileText, X, Sparkles, Sliders,
  HelpCircle, Info, Lock, Plus
} from 'lucide-react';
import { isTeacherAssignedToClass } from '../../services/classTeacherAssignmentService';
import { cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { db, handleFirestoreError, getStudents, getClasses, getActiveStudents } from '../../lib/firebase';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { collection, query, where, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import { ACADEMIC_YEARS } from '../../constants';
import ElementaryLiteracyOverview from './components/ElementaryLiteracyOverview';
import { elementaryLiteracyService } from '../../services/elementaryLiteracyService';
import { elementaryMTSSService } from '../../services/elementaryMTSSService';
import { 
  ElementaryArea, 
  ElementaryPeriod, 
  ElementaryProgressRecord, 
  ElementarySupportStatus 
} from '../../types/elementaryLiteracyNumeracy';
import { 
  calculateWpm, 
  getReadingSupportStatus, 
  getMengajiSupportStatus, 
  getSupportStatusLabel, 
  getAreaLabel, 
  getPeriodLabel 
} from '../../constants/elementaryLiteracyBenchmarks';

// Selection lists in theme palette
const AREAS: { id: ElementaryArea; label: string; icon: React.ReactNode; colorClass: string; activeColor: string }[] = [
  { id: 'BAHASA_INDONESIA', label: 'Bahasa Indonesia', icon: <BookOpen className="w-4 h-4" />, colorClass: 'text-blue-600 bg-blue-50 border-blue-100', activeColor: 'bg-blue-600 text-white' },
  { id: 'ENGLISH_READING', label: 'English Reading', icon: <Languages className="w-4 h-4" />, colorClass: 'text-indigo-600 bg-indigo-50 border-indigo-100', activeColor: 'bg-indigo-600 text-white' },
  { id: 'MENGAJI', label: 'Mengaji', icon: <Heart className="w-4 h-4" />, colorClass: 'text-teal-600 bg-teal-50 border-teal-100', activeColor: 'bg-teal-600 text-white' },
  { id: 'NUMERACY', label: 'Numerasi (Math)', icon: <Calculator className="w-4 h-4" />, colorClass: 'text-amber-600 bg-amber-50 border-amber-100', activeColor: 'bg-amber-600 text-white' },
];

const areaColors: Record<ElementaryArea, {
  primary: string;
  text: string;
  bg: string;
  border: string;
  badge: string;
  button: string;
  accent: string;
  ring: string;
  activeRow: string;
}> = {
  BAHASA_INDONESIA: {
    primary: 'blue',
    text: 'text-blue-600',
    bg: 'bg-blue-50/50',
    border: 'border-blue-100',
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
    button: 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/15 focus:ring-blue-500',
    accent: 'bg-blue-500/10 text-blue-700',
    ring: 'focus:ring-blue-500 focus:border-blue-500',
    activeRow: 'bg-blue-50/30 border-l-4 border-l-blue-500'
  },
  ENGLISH_READING: {
    primary: 'indigo',
    text: 'text-indigo-600',
    bg: 'bg-indigo-50/50',
    border: 'border-indigo-100',
    badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    button: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/15 focus:ring-indigo-500',
    accent: 'bg-indigo-500/10 text-indigo-700',
    ring: 'focus:ring-indigo-500 focus:border-indigo-500',
    activeRow: 'bg-indigo-50/30 border-l-4 border-l-indigo-500'
  },
  MENGAJI: {
    primary: 'teal',
    text: 'text-teal-600',
    bg: 'bg-teal-50/50',
    border: 'border-teal-100',
    badge: 'bg-teal-50 text-teal-700 border-teal-200',
    button: 'bg-teal-600 hover:bg-teal-700 text-white shadow-teal-600/15 focus:ring-teal-500',
    accent: 'bg-teal-500/10 text-teal-700',
    ring: 'focus:ring-teal-500 focus:border-teal-500',
    activeRow: 'bg-teal-50/30 border-l-4 border-l-teal-500'
  },
  NUMERACY: {
    primary: 'amber',
    text: 'text-amber-600',
    bg: 'bg-amber-50/50',
    border: 'border-amber-100',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    button: 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/15 focus:ring-amber-500',
    accent: 'bg-amber-500/10 text-amber-700',
    ring: 'focus:ring-amber-500 focus:border-amber-500',
    activeRow: 'bg-amber-50/30 border-l-4 border-l-amber-500'
  }
};

const PERIODS: { value: ElementaryPeriod; label: string }[] = [
  { value: 'JUL_OCT', label: 'Juli - Oktober' },
  { value: 'NOV_FEB', label: 'November - Februari' },
  { value: 'MAR_JUN', label: 'Maret - Juni' }
];

const READING_LEVEL_OPTIONS = ['IR+', 'IR', 'IR-', 'IR-EN', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

const getRows = (val: string) => {
  if (!val) return 1;
  const lines = val.split('\n').length;
  return Math.min(5, lines);
};

export type RowSaveStatus =
  | 'dirty'
  | 'saving'
  | 'success_auto'
  | 'success_manual'
  | 'offline'
  | 'error';

export interface ElementaryStudent {
  id: string; // NIS
  name: string;
  classId: string;
  className: string;
}

export default function ElementaryLiteracyNumeracy() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();
  const { activeYear } = useAcademicYear();
  
  // Load state from location if available
  const locState = location.state as {
    initialClassId?: string;
    initialArea?: ElementaryArea;
    initialPeriod?: ElementaryPeriod;
    searchQuery?: string;
  } | null;

  // Filters State
  const [selectedArea, setSelectedArea] = React.useState<ElementaryArea>(() => locState?.initialArea || 'BAHASA_INDONESIA');
  const [selectedClassId, setSelectedClassId] = React.useState<string>(() => locState?.initialClassId || '');
  const [selectedGradeLevel, setSelectedGradeLevel] = React.useState<number>(1);
  const [selectedYear, setSelectedYear] = React.useState<string>(activeYear || '2025/2026');
  const [selectedPeriod, setSelectedPeriod] = React.useState<ElementaryPeriod>(() => locState?.initialPeriod || 'JUL_OCT');
  const [searchQuery, setSearchQuery] = React.useState<string>(() => locState?.searchQuery || '');
  const [activeView, setActiveView] = React.useState<'input' | 'overview'>('input');

  // Loaded students & metadata
  const [classes, setClasses] = React.useState<any[]>([]);
  const [students, setStudents] = React.useState<ElementaryStudent[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [loadingStudents, setLoadingStudents] = React.useState<boolean>(false);
  const [isSaving, setIsSaving] = React.useState<boolean>(false);

  // Per-student form record map linking student ID to draft values
  const [studentRecords, setStudentRecords] = React.useState<Record<string, Partial<ElementaryProgressRecord>>>({});
  const [modifiedIds, setModifiedIds] = React.useState<Set<string>>(new Set());

  // Bulk input help
  const [bulkTopic, setBulkTopic] = React.useState<string>('');
  const [bulkMathLevel, setBulkMathLevel] = React.useState<string>('');

  // Class History modal
  const [showHistory, setShowHistory] = React.useState<boolean>(false);
  const [historyRecords, setHistoryRecords] = React.useState<ElementaryProgressRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = React.useState<boolean>(false);

  // Track specifically clicked single student history drawer
  const [selectedStudentForDrawer, setSelectedStudentForDrawer] = React.useState<{ id: string; name: string } | null>(null);

  // Google Sheets Sync States
  const [showSheetsSync, setShowSheetsSync] = React.useState<boolean>(false);
  const [sheetsUrl, setSheetsUrl] = React.useState<string>('');
  const [sheetsTabName, setSheetsTabName] = React.useState<string>('Sheet1');
  const [syncStep, setSyncStep] = React.useState<'initial' | 'preview' | 'history'>('initial');
  const [previewRows, setPreviewRows] = React.useState<any[]>([]);
  const [selectedSyncIds, setSelectedSyncIds] = React.useState<Set<string>>(new Set());
  const [isCreatingTemplate, setIsCreatingTemplate] = React.useState<boolean>(false);
  const [isPreviewing, setIsPreviewing] = React.useState<boolean>(false);
  const [isSyncing, setIsSyncing] = React.useState<boolean>(false);
  const [isLoadingLogs, setIsLoadingLogs] = React.useState<boolean>(false);
  const [syncLogs, setSyncLogs] = React.useState<any[]>([]);
  const [isRollingBack, setIsRollingBack] = React.useState<boolean>(false);
  const [createdTemplateUrl, setCreatedTemplateUrl] = React.useState<string>('');

  // Automated Google Sheet Configuration Fetching
  const [loadingSheetConfig, setLoadingSheetConfig] = React.useState<boolean>(false);
  const [sheetConfigError, setSheetConfigError] = React.useState<string | null>(null);

  // --- AUTOSAVE & MENGAJI NOTES DRAWER STATE & REFS ---
  const [rowStatuses, setRowStatuses] = React.useState<Record<string, { status: RowSaveStatus; time?: string }>>({});
  const [activeNotesStudentId, setActiveNotesStudentId] = React.useState<string | null>(null);
  const [activeNotesForm, setActiveNotesForm] = React.useState({
    letterRecognitionNote: '',
    tajwidNote: '',
    notes: ''
  });

  const debounceTimersRef = React.useRef<Record<string, NodeJS.Timeout>>({});
  const inFlightSavesRef = React.useRef<Record<string, boolean>>({});
  const followUpSaveRef = React.useRef<Record<string, boolean>>({});
  const studentRecordsRef = React.useRef<Record<string, Partial<ElementaryProgressRecord>>>({});
  
  const activeFiltersRef = React.useRef({
    classId: selectedClassId,
    year: selectedYear,
    period: selectedPeriod,
    area: selectedArea
  });

  React.useEffect(() => {
    activeFiltersRef.current = {
      classId: selectedClassId,
      year: selectedYear,
      period: selectedPeriod,
      area: selectedArea
    };
  }, [selectedClassId, selectedYear, selectedPeriod, selectedArea]);

  React.useEffect(() => {
    studentRecordsRef.current = studentRecords;
  }, [studentRecords]);

  React.useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasDirty = Object.values(rowStatuses).some((r: any) => r?.status === 'dirty');
      if (hasDirty) {
        e.preventDefault();
        e.returnValue = 'Anda memiliki perubahan yang belum disimpan. Apakah Anda yakin ingin meninggalkan halaman?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [rowStatuses]);

  React.useEffect(() => {
    return () => {
      cancelAllTimers();
    };
  }, []);

  const cancelAllTimers = () => {
    Object.keys(debounceTimersRef.current).forEach(id => {
      clearTimeout(debounceTimersRef.current[id]);
      delete debounceTimersRef.current[id];
    });
  };

  const triggerAutosave = (studentId: string) => {
    if (inFlightSavesRef.current[studentId]) {
      followUpSaveRef.current[studentId] = true;
      setRowStatuses(prev => ({
        ...prev,
        [studentId]: { status: 'dirty' }
      }));
      return;
    }

    if (debounceTimersRef.current[studentId]) {
      clearTimeout(debounceTimersRef.current[studentId]);
    }

    setRowStatuses(prev => ({
      ...prev,
      [studentId]: { status: 'dirty' }
    }));

    debounceTimersRef.current[studentId] = setTimeout(async () => {
      delete debounceTimersRef.current[studentId];
      await saveRowInternal(studentId, false);

      if (followUpSaveRef.current[studentId]) {
        followUpSaveRef.current[studentId] = false;
        triggerAutosave(studentId);
      }
    }, 1200);
  };

  const saveRowInternal = async (studentId: string, isManual: boolean): Promise<boolean> => {
    if (inFlightSavesRef.current[studentId]) {
      return false;
    }

    if (debounceTimersRef.current[studentId]) {
      clearTimeout(debounceTimersRef.current[studentId]);
      delete debounceTimersRef.current[studentId];
    }

    const raw = studentRecordsRef.current[studentId];
    if (!raw) {
      return false;
    }

    const currentFilters = {
      classId: selectedClassId,
      year: selectedYear,
      period: selectedPeriod,
      area: selectedArea
    };

    setRowStatuses(prev => ({
      ...prev,
      [studentId]: { status: 'saving' }
    }));
    inFlightSavesRef.current[studentId] = true;

    try {
      if (
        currentFilters.classId !== activeFiltersRef.current.classId ||
        currentFilters.year !== activeFiltersRef.current.year ||
        currentFilters.period !== activeFiltersRef.current.period ||
        currentFilters.area !== activeFiltersRef.current.area
      ) {
        inFlightSavesRef.current[studentId] = false;
        return false;
      }

      const validated = validateAndEnrichRecord(raw);
      await elementaryLiteracyService.saveProgressRecord(validated);
      await elementaryMTSSService.syncProgressRecordToMTSS(validated as any);

      if (
        currentFilters.classId !== activeFiltersRef.current.classId ||
        currentFilters.year !== activeFiltersRef.current.year ||
        currentFilters.period !== activeFiltersRef.current.period ||
        currentFilters.area !== activeFiltersRef.current.area
      ) {
        inFlightSavesRef.current[studentId] = false;
        return false;
      }

      const isOffline = !navigator.onLine;
      const finalStatus = isOffline ? 'offline' : (isManual ? 'success_manual' : 'success_auto');
      const timeStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

      setRowStatuses(prev => ({
        ...prev,
        [studentId]: { status: finalStatus, time: timeStr }
      }));

      setModifiedIds(prev => {
        const copy = new Set(prev);
        copy.delete(studentId);
        return copy;
      });

      inFlightSavesRef.current[studentId] = false;
      return true;
    } catch (err) {
      console.error('Error in saveRowInternal:', err);
      
      if (
        currentFilters.classId === activeFiltersRef.current.classId &&
        currentFilters.year === activeFiltersRef.current.year &&
        currentFilters.period === activeFiltersRef.current.period &&
        currentFilters.area === activeFiltersRef.current.area
      ) {
        setRowStatuses(prev => ({
          ...prev,
          [studentId]: { status: 'error' }
        }));
      }

      inFlightSavesRef.current[studentId] = false;
      return false;
    }
  };

  const handleManualSave = async (studentId: string) => {
    if (inFlightSavesRef.current[studentId]) return;
    followUpSaveRef.current[studentId] = false;

    const success = await saveRowInternal(studentId, true);
    if (success) {
      const raw = studentRecordsRef.current[studentId];
      toast.success(`Berhasil menyimpan penilaian untuk ${raw?.studentName || 'Siswa'}`);
    } else {
      toast.error('Gagal menyimpan nilai untuk baris ini');
    }
  };

  const flushPendingChanges = async (): Promise<boolean> => {
    const dirtyStudentIds = Object.keys(rowStatuses).filter(
      id => rowStatuses[id]?.status === 'dirty'
    );

    if (dirtyStudentIds.length === 0) {
      return true;
    }

    let allSuccessful = true;
    const promises = dirtyStudentIds.map(async (studentId) => {
      const success = await saveRowInternal(studentId, false);
      if (!success) {
        allSuccessful = false;
      }
    });

    await Promise.all(promises);
    return allSuccessful;
  };

  const handleClassChange = async (newClassId: string) => {
    const success = await flushPendingChanges();
    if (!success) {
      toast.warning('Beberapa perubahan draf tidak dapat disimpan secara otomatis sebelum pindah kelas.');
    }
    cancelAllTimers();
    setSelectedClassId(newClassId);
  };

  const handleYearChange = async (newYear: string) => {
    const success = await flushPendingChanges();
    if (!success) {
      toast.warning('Beberapa perubahan draf tidak dapat disimpan secara otomatis sebelum ganti tahun ajaran.');
    }
    cancelAllTimers();
    setSelectedYear(newYear);
  };

  const handlePeriodChange = async (newPeriod: ElementaryPeriod) => {
    const success = await flushPendingChanges();
    if (!success) {
      toast.warning('Beberapa perubahan draf tidak dapat disimpan secara otomatis sebelum ganti periode.');
    }
    cancelAllTimers();
    setSelectedPeriod(newPeriod);
  };

  const handleAreaChange = async (newArea: ElementaryArea) => {
    const success = await flushPendingChanges();
    if (!success) {
      toast.warning('Beberapa perubahan draf tidak dapat disimpan secara otomatis sebelum ganti area pembelajaran.');
    }
    cancelAllTimers();
    setSelectedArea(newArea);
  };

  const handleOpenNotes = (studentId: string) => {
    const record = studentRecords[studentId] || {};
    setActiveNotesStudentId(studentId);
    setActiveNotesForm({
      letterRecognitionNote: record.letterRecognitionNote || '',
      tajwidNote: record.tajwidNote || '',
      notes: record.notes || ''
    });
  };

  const applyMengajiNotes = (studentId: string, letterNote: string, tajwidNote: string, additionalNote: string) => {
    setStudentRecords(prev => {
      const current = prev[studentId] || {};
      const updated = {
        ...current,
        letterRecognitionNote: letterNote,
        tajwidNote: tajwidNote,
        notes: additionalNote
      };
      studentRecordsRef.current[studentId] = updated;
      triggerAutosave(studentId);
      return {
        ...prev,
        [studentId]: updated
      };
    });

    setModifiedIds(prev => {
      const copy = new Set(prev);
      copy.add(studentId);
      return copy;
    });
  };

  const getRowStatusElement = (studentId: string, supportStatus: any) => {
    const rowState = rowStatuses[studentId];
    if (!rowState) {
      if (!supportStatus || supportStatus === 'INCOMPLETE_DATA') {
        return <span className="text-slate-400 font-medium text-xs">Belum diisi</span>;
      }
      return <span className="text-slate-500 font-medium text-xs">Tersimpan</span>;
    }

    switch (rowState.status) {
      case 'dirty':
        return <span className="text-amber-600 font-bold text-xs animate-pulse">Perubahan belum tersimpan</span>;
      case 'saving':
        return (
          <span className="text-indigo-600 font-bold text-xs flex items-center gap-1.5 justify-center">
            <RefreshCw size={12} className="animate-spin" /> Menyimpan...
          </span>
        );
      case 'success_auto':
        return <span className="text-emerald-600 font-bold text-xs">✓ Tersimpan otomatis · {rowState.time}</span>;
      case 'success_manual':
        return <span className="text-emerald-600 font-bold text-xs">✓ Tersimpan manual · {rowState.time}</span>;
      case 'offline':
        return <span className="text-slate-500 font-medium text-xs">Menunggu koneksi</span>;
      case 'error':
        return <span className="text-red-600 font-black text-xs">Gagal menyimpan</span>;
      default:
        if (!supportStatus || supportStatus === 'INCOMPLETE_DATA') {
          return <span className="text-slate-400 font-medium text-xs">Belum diisi</span>;
        }
        return <span className="text-slate-500 font-medium text-xs">Tersimpan</span>;
    }
  };

  const getButtonProps = (studentId: string) => {
    const rowState = rowStatuses[studentId];
    const isSaving = rowState?.status === 'saving';
    const isDirty = rowState?.status === 'dirty';
    const isError = rowState?.status === 'error';

    let label = 'Simpan';
    let buttonClass = 'bg-slate-100 hover:bg-slate-200 text-slate-700';

    if (isSaving) {
      label = 'Menyimpan...';
      buttonClass = 'bg-slate-200 text-slate-400 cursor-not-allowed';
    } else if (isDirty) {
      label = 'Simpan Sekarang';
      buttonClass = 'bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/15';
    } else if (isError) {
      label = 'Simpan Ulang';
      buttonClass = 'bg-red-500 hover:bg-red-600 text-white shadow-md shadow-red-500/15';
    } else if (rowState?.status === 'success_auto' || rowState?.status === 'success_manual') {
      label = 'Tersimpan';
      buttonClass = 'bg-emerald-50 text-emerald-700 border border-emerald-100';
    }

    return { label, buttonClass, disabled: isSaving };
  };

  React.useEffect(() => {
    if (!showSheetsSync || !selectedClassId || !selectedYear) return;

    const fetchSheetConfig = async () => {
      try {
        setLoadingSheetConfig(true);
        setSheetConfigError(null);
        
        const configId = `${selectedYear.replace(/\//g, "-")}__${selectedClassId}`;
        const docRef = doc(db, "elementaryLiteracyNumeracySheetConfigs", configId);
        const snap = await getDoc(docRef);
        
        if (snap.exists()) {
          const data = snap.data();
          if (data.isActive) {
            setSheetsUrl(data.spreadsheetUrl || "");
            const periodId = selectedPeriod === 'JUL_OCT' ? 'P1' : (selectedPeriod === 'NOV_FEB' ? 'P2' : 'P3');
            const tabKeyVal = `${periodId}_${selectedArea}`;
            setSheetsTabName(data.tabs?.[tabKeyVal] || "");
          } else {
            setSheetsUrl("");
            setSheetsTabName("");
            setSheetConfigError("Konfigurasi Google Sheet resmi untuk kelas ini dinonaktifkan oleh Admin.");
          }
        } else {
          setSheetsUrl("");
          setSheetsTabName("");
          setSheetConfigError("Konfigurasi Google Sheet resmi untuk kelas dan tahun ajaran ini belum diatur oleh Admin.");
        }
      } catch (err: any) {
        console.error("Error fetching sheet config:", err);
        setSheetConfigError("Gagal memuat konfigurasi Google Sheet resmi.");
      } finally {
        setLoadingSheetConfig(false);
      }
    };

    fetchSheetConfig();
  }, [showSheetsSync, selectedClassId, selectedYear, selectedPeriod, selectedArea]);

  // Fetch Sync History logs
  const fetchSyncLogs = async () => {
    if (!selectedClassId) return;
    try {
      setIsLoadingLogs(true);
      const authResult = await import('../../lib/firebase');
      const idToken = await authResult.auth.currentUser?.getIdToken();
      const periodId = selectedPeriod === 'JUL_OCT' ? 'P1' : (selectedPeriod === 'NOV_FEB' ? 'P2' : 'P3');
      const response = await fetch(`/api/elementary/sheets/sync-logs?classId=${selectedClassId}&area=${selectedArea}&periodId=${periodId}&academicYear=${encodeURIComponent(selectedYear)}`, {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Gagal memuat log sinkronisasi');
      }
      const data = await response.json();
      setSyncLogs(data);
    } catch (err: any) {
      console.error('Error fetching sync logs:', err);
      toast.error(err.message || 'Gagal memuat riwayat sinkronisasi');
    } finally {
      setIsLoadingLogs(false);
    }
  };

  // Create Template Google Sheet
  const handleCreateTemplate = async () => {
    try {
      setIsCreatingTemplate(true);
      setCreatedTemplateUrl('');
      const authResult = await import('../../lib/firebase');
      const idToken = await authResult.auth.currentUser?.getIdToken();
      const periodId = selectedPeriod === 'JUL_OCT' ? 'P1' : (selectedPeriod === 'NOV_FEB' ? 'P2' : 'P3');
      
      const response = await fetch('/api/elementary/sheets/create-template', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          classId: selectedClassId,
          area: selectedArea,
          academicYear: selectedYear,
          periodId
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Gagal membuat draf template Google Sheet');
      }

      setCreatedTemplateUrl(data.spreadsheetUrl);
      setSheetsUrl(data.spreadsheetUrl);
      toast.success('Berhasil membuat template Google Sheet pre-filled!');
    } catch (err: any) {
      console.error('Error creating template:', err);
      toast.error(err.message || 'Gagal membuat draf template');
    } finally {
      setIsCreatingTemplate(false);
    }
  };

  // Fetch Preview Comparison from Sheet
  const handleFetchPreview = async () => {
    if (!sheetsUrl.trim()) {
      toast.error('Masukkan URL Google Sheet terlebih dahulu');
      return;
    }
    try {
      setIsPreviewing(true);
      setPreviewRows([]);
      const authResult = await import('../../lib/firebase');
      const idToken = await authResult.auth.currentUser?.getIdToken();
      const periodId = selectedPeriod === 'JUL_OCT' ? 'P1' : (selectedPeriod === 'NOV_FEB' ? 'P2' : 'P3');

      const response = await fetch('/api/elementary/sheets/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
         },
         body: JSON.stringify({
           spreadsheetUrl: sheetsUrl,
           sheetName: sheetsTabName,
           classId: selectedClassId,
           area: selectedArea,
           periodId,
           academicYear: selectedYear
         })
       });

       const data = await response.json();
       if (!response.ok) {
         throw new Error(data.error || 'Gagal menganalisis pratinjau data');
       }

       setPreviewRows(data.matchedRows || []);
       
       // Pre-select rows that have modifications or are new
       const changeIds = new Set<string>();
       (data.matchedRows || []).forEach((row: any) => {
         if (row.status === 'new' || row.status === 'modified') {
           changeIds.add(row.studentId);
         }
       });
       setSelectedSyncIds(changeIds);
       
       setSyncStep('preview');
       toast.success('Pratinjau data Google Sheet berhasil dimuat!');
     } catch (err: any) {
       console.error('Error loading preview:', err);
       toast.error(err.message || 'Gagal mengambil pratinjau data');
     } finally {
       setIsPreviewing(false);
     }
  };

  // Confirm Sync to Firestore
  const handleConfirmSync = async () => {
    if (selectedSyncIds.size === 0) {
      toast.error('Pilih minimal satu siswa untuk disinkronisasi');
      return;
    }
    try {
      setIsSyncing(true);
      const authResult = await import('../../lib/firebase');
      const idToken = await authResult.auth.currentUser?.getIdToken();
      const periodId = selectedPeriod === 'JUL_OCT' ? 'P1' : (selectedPeriod === 'NOV_FEB' ? 'P2' : 'P3');

      const response = await fetch('/api/elementary/sheets/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          spreadsheetUrl: sheetsUrl,
          sheetName: sheetsTabName,
          classId: selectedClassId,
          area: selectedArea,
          periodId,
          academicYear: selectedYear,
          studentIdsToSync: Array.from(selectedSyncIds)
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Gagal menyinkronkan data');
      }

      toast.success(`Berhasil menyinkronkan data ${data.count} siswa SD ke Firestore!`);
      setShowSheetsSync(false);
      
      // Reload local records
      setSelectedClassId('');
      setTimeout(() => setSelectedClassId(selectedClassId), 50);
    } catch (err: any) {
      console.error('Error confirming sync:', err);
      toast.error(err.message || 'Gagal menyelesaikan sinkronisasi');
    } finally {
      setIsSyncing(false);
    }
  };

  // Rollback Sync Log
  const handleRollbackSync = async (logId: string) => {
    if (!window.confirm('Apakah Anda yakin ingin membatalkan (rollback) sinkronisasi ini? Semua data pada sinkronisasi ini akan dikembalikan ke kondisi sebelumnya.')) {
      return;
    }
    try {
      setIsRollingBack(true);
      const authResult = await import('../../lib/firebase');
      const idToken = await authResult.auth.currentUser?.getIdToken();
      const response = await fetch('/api/elementary/sheets/rollback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ syncLogId: logId })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Gagal melakukan rollback');
      }

      toast.success(`Sukses membatalkan sinkronisasi! ${data.count} rekaman berhasil dikembalikan.`);
      fetchSyncLogs(); // Refresh logs
      
      // Reload local records
      setSelectedClassId('');
      setTimeout(() => setSelectedClassId(selectedClassId), 50);
    } catch (err: any) {
      console.error('Error rollback sync:', err);
      toast.error(err.message || 'Gagal memproses rollback');
    } finally {
      setIsRollingBack(false);
    }
  };


  // Sync default school year
  React.useEffect(() => {
    if (activeYear) {
      setSelectedYear(activeYear);
    }
  }, [activeYear]);

  // Load elementary classes on mount
  React.useEffect(() => {
    const loadMetadata = async () => {
      try {
        setLoading(true);
        const allClasses = await getClasses() || [];
        const elementaryClasses = allClasses.filter(
          c => c.unitId === 'ELEMENTARY' && c.status !== 'archived' && c.academicYear === activeYear
        );
        setClasses(elementaryClasses);

        let defaultClassId = locState?.initialClassId || '';
        if (!defaultClassId && (profile?.role === 'HOMEROOM_TEACHER' || profile?.role === 'TEACHER')) {
          const homeroomClass = elementaryClasses.find(c => isTeacherAssignedToClass(c, profile?.uid));
          if (homeroomClass) {
            defaultClassId = homeroomClass.id;
          }
        }

        if (!defaultClassId && elementaryClasses.length > 0) {
          defaultClassId = elementaryClasses[0].id;
        }

        setSelectedClassId(defaultClassId);
      } catch (err) {
        console.error('Error loading elementary classes:', err);
        toast.error('Gagal memuat daftar kelas SD');
      } finally {
        setLoading(false);
      }
    };

    if (profile) {
      loadMetadata();
    }
  }, [profile, activeYear]);

  // Parse elementary grade level from the active class selection name
  React.useEffect(() => {
    if (selectedClassId && classes.length > 0) {
      const activeClass = classes.find(c => c.id === selectedClassId);
      if (activeClass) {
        const match = activeClass.name.match(/\d+/);
        if (match) {
          setSelectedGradeLevel(Number(match[0]));
        } else {
          // Default fallback
          setSelectedGradeLevel(1);
        }
      }
    }
  }, [selectedClassId, classes]);

  // Fetch active students and retrieve existing progress records
  React.useEffect(() => {
    const loadClassAndRecords = async () => {
      if (!selectedClassId) return;
      try {
        setLoadingStudents(true);
        setModifiedIds(new Set());

        // 1. Fetch Students
        let classStudents: ElementaryStudent[] = [];
        const activeS = await getActiveStudents(selectedClassId, selectedYear);
        if (activeS && activeS.length > 0) {
          classStudents = activeS.map(s => ({
            id: s.id,
            name: s.name,
            classId: s.classId,
            className: classes.find(c => c.id === s.classId)?.name || 'SD'
          }));
        } else {
          const allStudents = await getStudents() || [];
          classStudents = allStudents
            .filter(s => s.currentUnit === 'ELEMENTARY' && s.classId === selectedClassId)
            .filter(s => {
              const nameLower = s.name.toLowerCase();
              return !(
                nameLower.includes('dika ramadhan') ||
                nameLower.includes('alya putri') ||
                nameLower.includes('farez rahadian') ||
                nameLower.includes('siti aminah')
              );
            })
            .map(s => ({
              id: s.id,
              name: s.name,
              classId: s.classId || selectedClassId,
              className: classes.find(c => c.id === (s.classId || selectedClassId))?.name || 'SD'
            }));
        }

        classStudents.sort((a, b) => a.name.localeCompare(b.name));
        setStudents(classStudents);

        // 2. Fetch records from canonical collection
        const existingRecords = await elementaryLiteracyService.getRecordsByClass(
          selectedYear,
          selectedGradeLevel,
          selectedClassId,
          selectedPeriod,
          selectedArea
        );

        const recordMap: Record<string, ElementaryProgressRecord> = {};
        existingRecords.forEach(rec => {
          recordMap[rec.studentId] = rec;
        });

        // 3. Populate default empty entries - NO prefilled 0, 1, or 6
        const initialStates: Record<string, Partial<ElementaryProgressRecord>> = {};
        classStudents.forEach(st => {
          const existing = recordMap[st.id];
          if (existing) {
            initialStates[st.id] = { ...existing };
          } else {
            const base: Omit<ElementaryProgressRecord, 'updatedAt'> = {
              studentId: st.id,
              studentName: st.name,
              classId: selectedClassId,
              gradeLevel: selectedGradeLevel,
              schoolYear: selectedYear,
              period: selectedPeriod,
              area: selectedArea,
              teacherId: profile?.uid || profile?.id || 'unknown',
              supportStatus: 'INCOMPLETE_DATA',
              notes: ''
            };

            if (selectedArea === 'BAHASA_INDONESIA') {
              initialStates[st.id] = {
                ...base,
                wordsRead: '',
                errors: '',
                wpm: '',
                readingLevel: 'IR',
                comprehensionScore: 'N/A',
                libraryBorrowStatus: 'BELUM_MEMINJAM',
                oneDayOneBookStatus: 'KURANG_AKTIF'
              } as any;
            } else if (selectedArea === 'ENGLISH_READING') {
              initialStates[st.id] = {
                ...base,
                wordsRead: '',
                errors: '',
                wpm: '',
                readingLevel: 'IR',
                comprehensionScore: 'N/A'
              } as any;
            } else if (selectedArea === 'MENGAJI') {
              initialStates[st.id] = {
                ...base,
                iqroCurrentLevel: '',
                iqroCurrentCheckpoint: '',
                targetIqroLevel: '',
                completionStatus: '',
                letterRecognitionNote: '',
                tajwidNote: ''
              } as any;
            } else if (selectedArea === 'NUMERACY') {
              initialStates[st.id] = {
                ...base,
                mathLevel: '',
                topic: '',
                accuracy: '',
                speed: ''
              } as any;
            }
          }
        });

        setStudentRecords(initialStates);
        setRowStatuses({});
        cancelAllTimers();
        inFlightSavesRef.current = {};
        followUpSaveRef.current = {};
        studentRecordsRef.current = { ...initialStates };
      } catch (err) {
        console.error('Error loading class lists or data:', err);
        toast.error('Gagal mensinkronisasikan daftar peserta didik');
      } finally {
        setLoadingStudents(false);
      }
    };

    if (selectedClassId) {
      loadClassAndRecords();
    }
  }, [selectedYear, selectedGradeLevel, selectedClassId, selectedPeriod, selectedArea, classes, profile]);

  // Handle cell changes with live status evaluation
  const handleCellChange = (studentId: string, field: string, value: any) => {
    const shouldTrigger = true;

    setStudentRecords(prev => {
      const current = prev[studentId] || {};
      const updated = { ...current, [field]: value } as any;

      if (selectedArea === 'BAHASA_INDONESIA' || selectedArea === 'ENGLISH_READING') {
        const wordsRaw = field === 'wordsRead' ? value : updated.wordsRead;
        const errsRaw = field === 'errors' ? value : updated.errors;

        const hasWords = wordsRaw !== '' && wordsRaw !== undefined && wordsRaw !== null;
        const hasErrs = errsRaw !== '' && errsRaw !== undefined && errsRaw !== null;
        
        let comp: number | 'N/A' | null = 'N/A';
        const currentComp = field === 'comprehensionScore' ? value : updated.comprehensionScore;
        
        if (currentComp === 'N/A' || currentComp === null || currentComp === '') {
          comp = 'N/A';
        } else {
          comp = Number(currentComp);
        }
        
        if (hasWords && hasErrs) {
          const wpmVal = calculateWpm(Number(wordsRaw), Number(errsRaw));
          updated.wpm = wpmVal;
        } else {
          updated.wpm = '';
        }
        updated.wordsRead = wordsRaw;
        updated.errors = errsRaw;
        updated.comprehensionScore = currentComp;
      }

      studentRecordsRef.current[studentId] = updated;

      if (shouldTrigger) {
        triggerAutosave(studentId);
      }

      return {
        ...prev,
        [studentId]: updated
      };
    });

    setModifiedIds(prev => {
      const copy = new Set(prev);
      copy.add(studentId);
      return copy;
    });
  };

  // Pre-fill helpers
  const applyBulkTopic = () => {
    if (!bulkTopic.trim()) {
      toast.error('Gunakan topik yang valid untuk bulk pre-fill');
      return;
    }
    students.forEach(st => {
      handleCellChange(st.id, 'topic', bulkTopic);
    });
    toast.success(`Berhasil menerapkan topik "${bulkTopic}" untuk seluruh siswa`);
    setBulkTopic('');
  };

  const applyBulkMathLevel = () => {
    if (!bulkMathLevel.trim()) {
      toast.error('Gunakan level Matematika yang valid untuk bulk pre-fill');
      return;
    }
    students.forEach(st => {
      handleCellChange(st.id, 'mathLevel', bulkMathLevel);
    });
    toast.success(`Berhasil menerapkan level "${bulkMathLevel}" untuk seluruh siswa`);
    setBulkMathLevel('');
  };

  const applyBulkTier1 = () => {
    if (students.length === 0) {
      toast.error('Tidak ada siswa di kelas ini');
      return;
    }
    students.forEach(st => {
      handleCellChange(st.id, 'supportStatus', 'ON_TRACK');
    });
    toast.success('Berhasil mengisi Tier 1 untuk seluruh siswa secara massal (belum disimpan, silakan simpan bila selesai)');
  };

  // Unify validate & enrich record values before Firestore submission
  const validateAndEnrichRecord = (rawRecord: any) => {
    const rec = { ...rawRecord };
    
    if (!rec.supportStatus) {
      rec.supportStatus = 'INCOMPLETE_DATA';
    }

    if (selectedArea === 'BAHASA_INDONESIA' || selectedArea === 'ENGLISH_READING') {
      const hasWords = rec.wordsRead !== '' && rec.wordsRead !== undefined && rec.wordsRead !== null;
      const hasErrs = rec.errors !== '' && rec.errors !== undefined && rec.errors !== null;
      
      if (hasWords && hasErrs) {
        rec.wordsRead = Number(rec.wordsRead);
        rec.errors = Number(rec.errors);
        rec.wpm = calculateWpm(rec.wordsRead, rec.errors);
      } else {
        rec.wordsRead = null;
        rec.errors = null;
        rec.wpm = null;
      }
      
      const compRaw = rec.comprehensionScore;
      if (compRaw === 'N/A') {
        rec.comprehensionScore = 'N/A';
      } else if (compRaw === '' || compRaw === null || compRaw === undefined) {
        rec.comprehensionScore = null;
      } else {
        rec.comprehensionScore = Number(compRaw);
      }
    } else if (selectedArea === 'MENGAJI') {
      const parseVal = (val: any) => {
        if (val === '' || val === null || val === undefined) return null;
        const num = Number(val);
        return isNaN(num) ? val : num;
      };
      rec.iqroCurrentLevel = parseVal(rec.iqroCurrentLevel);
      rec.targetIqroLevel = parseVal(rec.targetIqroLevel);
      rec.completionStatus = rec.completionStatus || '';
    } else if (selectedArea === 'NUMERACY') {
      const hasAcc = rec.accuracy !== '' && rec.accuracy !== undefined && rec.accuracy !== null;
      
      rec.accuracy = hasAcc ? Number(rec.accuracy) : null;
      rec.speed = null;
    }

    return rec;
  };

  // Save single student's record
  const handleSaveRow = async (studentId: string) => {
    try {
      const raw = studentRecords[studentId];
      if (!raw) {
        toast.error('Record data draf tidak terekam');
        return;
      }

      const validated = validateAndEnrichRecord(raw);
      await elementaryLiteracyService.saveProgressRecord(validated);
      await elementaryMTSSService.syncProgressRecordToMTSS(validated as any);
      
      toast.success(`Berhasil menyimpan penilaian untuk ${validated.studentName}`);
      
      setModifiedIds(prev => {
        const copy = new Set(prev);
        copy.delete(studentId);
        return copy;
      });
    } catch (err) {
      console.error('Error saving row:', err);
      toast.error('Gagal menyimpan nilai untuk baris ini');
    }
  };

  // Save whole class batch
  const handleSaveAll = async () => {
    if (students.length === 0) {
      toast.error('Tidak ada baris siswa untuk disimpan');
      return;
    }

    try {
      setIsSaving(true);
      const recordsToSave = Object.values(studentRecords).map(rec => validateAndEnrichRecord(rec));
      await elementaryLiteracyService.bulkUpsertRecords(recordsToSave);
      await elementaryMTSSService.syncBulkRecordsToMTSS(recordsToSave as any);
      
      toast.success(`Berhasil menyimpan penilaian massal untuk ${recordsToSave.length} siswa!`);
      setModifiedIds(new Set());
    } catch (err) {
      console.error('Error batch saving:', err);
      toast.error('Gagal melakukan simpan semua massal');
    } finally {
      setIsSaving(false);
    }
  };

  // Fetch Class History for modal (aggregates chronological records of standard collection)
  const fetchClassHistory = async () => {
    if (!selectedClassId) return;
    try {
      setLoadingHistory(true);
      const docs = await elementaryLiteracyService.getRecordsByClass(
        selectedYear,
        selectedGradeLevel,
        selectedClassId,
        selectedPeriod,
        selectedArea
      );
      setHistoryRecords(docs);
    } catch (err) {
      console.error('Error fetching class summary records list:', err);
      toast.error('Gagal mengambil rangkuman riwayat kelas');
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleOpenHistory = () => {
    setShowHistory(true);
    fetchClassHistory();
  };

  // Filter local student listing during search
  const filteredStudents = React.useMemo(() => {
    return students.filter(s => {
      const matchSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.id.includes(searchQuery);
      return matchSearch;
    });
  }, [students, searchQuery]);

  // Statistics summaries
  const { completedCount, needsSupportCount } = React.useMemo(() => {
    let completed = 0;
    let support = 0;
    filteredStudents.forEach(st => {
      const rec = studentRecords[st.id];
      if (rec) {
        if (rec.supportStatus && rec.supportStatus !== 'INCOMPLETE_DATA') {
          completed++;
        }
        if (rec.supportStatus === 'MONITOR' || rec.supportStatus === 'NEEDS_SUPPORT') {
          support++;
        }
      }
    });
    return { completedCount: completed, needsSupportCount: support };
  }, [filteredStudents, studentRecords]);

  // Helper styles
  const isHomeroom = profile?.role === 'HOMEROOM_TEACHER';

  return (
    <div className="space-y-6 pb-16">
      {/* HEADER SECTION */}
      <header className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 text-[9px] uppercase tracking-widest font-black bg-indigo-50 text-indigo-700 rounded-lg">ELEMENTARY UNIT</span>
            <span className="text-gray-300">•</span>
            <span className="text-xs font-bold text-gray-500">Pusat Penilaian Akademik</span>
          </div>
          <h1 className="text-2xl font-black text-gray-950 tracking-tight flex items-center gap-2 italic uppercase">
            LUMINA LITERASI & NUMERASI
          </h1>
          <p className="text-gray-500 text-xs font-medium">Panel input pencatatan perkembangan Bahasa Indonesia, English, Mengaji, & Matematika siswa SD.</p>
        </div>
        
        {/* FILTERS TOOLBAR */}
        <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
          {/* Class Select Dropdown */}
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 p-1.5 rounded-2xl text-xs font-bold text-gray-600">
            <Sliders size={14} className="text-gray-400 ml-1" />
            <select 
              value={selectedClassId} 
              onChange={(e) => handleClassChange(e.target.value)}
              className="bg-transparent font-black text-gray-800 outline-none pr-2 cursor-pointer"
            >
              <option value="" disabled>-- Pilih Kelas SD --</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* School Year Selector */}
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 p-1.5 rounded-2xl text-xs font-bold text-gray-600">
            <select 
              value={selectedYear} 
              onChange={(e) => handleYearChange(e.target.value)}
              className="bg-transparent font-black text-gray-800 outline-none pr-1 cursor-pointer"
            >
              {ACADEMIC_YEARS.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Period Selector */}
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 p-1.5 rounded-2xl text-xs font-bold text-gray-600">
            <select 
              value={selectedPeriod} 
              onChange={(e) => handlePeriodChange(e.target.value as ElementaryPeriod)}
              className="bg-transparent font-black text-gray-800 outline-none pr-1.5 cursor-pointer"
            >
              {PERIODS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* History modal button */}
          <button 
            type="button"
            onClick={handleOpenHistory}
            disabled={!selectedClassId}
            className="flex items-center gap-2 bg-slate-950 hover:bg-slate-800 text-white disabled:bg-slate-200 disabled:text-slate-400 shadow-md px-4 py-2 text-xs font-black tracking-wider uppercase transition-all rounded-xl cursor-pointer"
          >
            <History size={13} />
            RIWAYAT KELAS
          </button>

          {/* Google Sheets Sync button */}
          <button 
            type="button"
            onClick={() => {
              setShowSheetsSync(true);
              setSyncStep('initial');
              setCreatedTemplateUrl('');
              setPreviewRows([]);
            }}
            disabled={!selectedClassId}
            className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white disabled:bg-slate-200 disabled:text-slate-400 shadow-md px-4 py-2 text-xs font-black tracking-wider uppercase transition-all rounded-xl cursor-pointer"
          >
            <FileText size={13} />
            SINKRONISASI SHEET
          </button>
        </div>
      </header>

      {/* DASHBOARD TAB CONTROLLER VIEW SWITCHER */}
      <div className="flex items-center gap-1.5 bg-white p-1 pb-1 px-1 rounded-2xl w-fit border border-gray-100 shadow-sm">
        <button
          type="button"
          onClick={() => setActiveView('input')}
          className={cn(
            "px-4 py-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all cursor-pointer",
            activeView === 'input' 
              ? "bg-slate-900 text-white shadow-md shadow-slate-900/10" 
              : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
          )}
        >
          Pencatatan Penilaian
        </button>
        <button
          type="button"
          onClick={() => setActiveView('overview')}
          className={cn(
            "px-4 py-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all cursor-pointer",
            activeView === 'overview' 
              ? "bg-slate-900 text-white shadow-md shadow-slate-900/10" 
              : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
          )}
        >
          Dasbor Ringkasan Analitik
        </button>
      </div>

      {activeView === 'overview' ? (
        <div className="bg-white rounded-[2.5rem] p-6 border border-gray-100 shadow-sm">
          <ElementaryLiteracyOverview 
            schoolYear={selectedYear}
            period={selectedPeriod}
          />
        </div>
      ) : (
        <div className="space-y-6">
          {/* AREA SELECTOR TABS */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {AREAS.map((ar) => {
              const isActive = selectedArea === ar.id;
              const colorInfo = areaColors[ar.id];
              return (
                <button
                  key={ar.id}
                  type="button"
                  onClick={() => handleAreaChange(ar.id)}
                  className={cn(
                    "flex items-center justify-between p-4 rounded-2xl border transition-all text-left relative overflow-hidden cursor-pointer",
                    isActive 
                      ? `${colorInfo.button} border-transparent font-extrabold shadow-lg` 
                      : "bg-white border-gray-100 text-slate-700 hover:bg-slate-50/50"
                  )}
                >
                  <div className="space-y-1 z-10">
                    <span className={cn("text-[10px] font-bold block uppercase tracking-wider", isActive ? "text-white/80" : "text-slate-400")}>
                      Area Pembelajaran
                    </span>
                    <span className="text-xs sm:text-sm block font-black">{ar.label}</span>
                  </div>
                  <div className={cn("p-2 rounded-xl z-10", isActive ? "bg-white/20" : "bg-slate-50/80")}>
                    {ar.icon}
                  </div>
                </button>
              );
            })}
          </div>

          {/* VISUALLY PROMINENT CONTEXT PANEL */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs font-black text-slate-500 uppercase tracking-widest">
                <span>Lumina Literasi & Numerasi</span>
                <span>•</span>
                <span className={cn("font-bold px-2.5 py-0.5 rounded-lg text-[10px] border uppercase", areaColors[selectedArea].badge)}>
                  {getAreaLabel(selectedArea)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Kelas Aktif:</span>
                <h2 className={cn("text-3xl font-black tracking-tight uppercase italic", areaColors[selectedArea].text)}>
                  {classes.find(c => c.id === selectedClassId)?.name || 'Belum Pilih Kelas'}
                </h2>
              </div>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs font-bold text-slate-600">
              <div className="bg-slate-50/50 p-3 rounded-xl border border-slate-100/80">
                <span className="block text-[10px] text-slate-400 uppercase font-black tracking-wider mb-0.5">Tahun Ajaran</span>
                <span className="text-sm font-extrabold text-slate-800">{selectedYear}</span>
              </div>
              <div className="bg-slate-50/50 p-3 rounded-xl border border-slate-100/80">
                <span className="block text-[10px] text-slate-400 uppercase font-black tracking-wider mb-0.5">Periode Laporan</span>
                <span className="text-sm font-extrabold text-slate-800">{getPeriodLabel(selectedPeriod)}</span>
              </div>
              <div className="bg-slate-50/50 p-3 rounded-xl border border-slate-100/80 col-span-2 sm:col-span-1">
                <span className="block text-[10px] text-slate-400 uppercase font-black tracking-wider mb-0.5">Jumlah Siswa</span>
                <span className="text-sm font-extrabold text-slate-800">{students.length} Siswa SD</span>
              </div>
            </div>
          </div>

          {/* MINI OVERVIEW METRICS ROWS */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className={cn(
              "bg-slate-900 text-white rounded-3xl p-5 flex items-center justify-between shadow-xl shadow-slate-900/10",
              selectedArea === "NUMERACY" ? "md:col-span-6" : "md:col-span-12"
            )}>
              <div className="space-y-1.5">
                <span className="text-[10px] font-black tracking-widest text-[#9d9da6] uppercase">Rasio Entri Selesai</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black font-mono tracking-tight text-white">{completedCount}</span>
                  <span className="text-sm font-semibold text-[#9d9da6]">/ {students.length} Siswa SD</span>
                </div>
                <p className="text-[10px] text-slate-400 font-mono">
                  ({students.length - completedCount} siswa belum lengkap datanya)
                </p>
              </div>

              <div className="h-10 w-px bg-slate-800 hidden sm:block"></div>

              <div className="text-right space-y-1">
                <p className="text-[10px] font-black text-amber-450 uppercase tracking-widest flex items-center justify-end gap-1 font-mono">
                  <AlertCircle size={10} className="text-amber-400" />
                  NEEDS INTERVENTION
                </p>
                <div className="text-3xl font-black text-amber-400 font-mono">{needsSupportCount}</div>
              </div>
            </div>

            {/* DYNAMIC BULK PREFILL TOOL */}
            {selectedArea === "NUMERACY" && (
              <div className="md:col-span-6 bg-slate-50 rounded-3xl p-5 border border-slate-200/50 flex flex-col justify-center gap-3">
                <div className="flex items-center gap-2 text-slate-800 font-black text-[10px] uppercase tracking-wider">
                  <Sparkles size={12} className="text-indigo-500" />
                  Isi Massal Numerasi
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="flex gap-1.5 items-center">
                    <input
                      type="text"
                      placeholder="Contoh: Perkalian Pecahan"
                      value={bulkTopic}
                      onChange={e => setBulkTopic(e.target.value)}
                      className="bg-white border border-gray-200 text-xs px-3 py-1.5 rounded-xl flex-grow font-medium text-slate-800"
                    />
                    <button
                      type="button"
                      onClick={applyBulkTopic}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] px-2.5 py-1.5 rounded-xl font-bold uppercase shrink-0 cursor-pointer"
                    >
                      Topik
                    </button>
                  </div>

                  <div className="flex gap-1.5 items-center">
                    <input
                      type="text"
                      placeholder="Contoh: Level 3B"
                      value={bulkMathLevel}
                      onChange={e => setBulkMathLevel(e.target.value)}
                      className="bg-white border border-gray-200 text-xs px-3 py-1.5 rounded-xl flex-grow font-medium text-slate-800"
                    />
                    <button
                      type="button"
                      onClick={applyBulkMathLevel}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] px-2.5 py-1.5 rounded-xl font-bold uppercase shrink-0 cursor-pointer"
                    >
                      Level
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* DYNAMIC STUDENTS ASSESSMENT SPREADSHEET TABLE */}
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
            {/* Informational Autosave Strip */}
            <div className="bg-amber-50/50 border-b border-amber-100/60 px-5 py-3 flex items-center gap-2.5 text-amber-850 text-xs font-bold">
              <Sparkles size={14} className="text-amber-500 shrink-0" />
              <span>Perubahan disimpan otomatis per baris. Hindari mengedit siswa yang sama pada waktu yang sama dengan guru lain.</span>
            </div>

            {/* Table Search & Header */}
            <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/40">
              <div className="flex items-center gap-2">
                <div className={cn("px-3 py-1 bg-slate-100 rounded-lg text-xs font-black border", areaColors[selectedArea].badge)}>
                  {filteredStudents.length} Siswa SD
                </div>
                <h2 className="text-xs font-black text-slate-800 uppercase tracking-widest">
                  SPREADSHEET PENILAIAN: {getAreaLabel(selectedArea)} ({getPeriodLabel(selectedPeriod)})
                </h2>
              </div>

              <div className="relative w-full sm:w-80">
                <Search className="absolute left-4 top-[14px] text-slate-500 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Cari nama atau NIS siswa SD..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-100/50 hover:bg-slate-100 border border-slate-200 text-sm pl-11 pr-4 h-11 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white text-slate-800 font-medium transition-all"
                />
              </div>
            </div>

            {/* SPREADSHEET TABLE IMPLEMENTATION */}
            {loadingStudents ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-3 text-slate-400">
                <RefreshCw size={32} className="animate-spin text-indigo-600" />
                <span className="text-xs font-black uppercase tracking-wider">Mensinkronisasikan berkas siswa...</span>
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-2 text-slate-400">
                <AlertCircle size={32} className="text-slate-300" />
                <span className="text-sm font-bold">Tidak ada daftar siswa yang ditemukan.</span>
                <p className="text-[11px]">Silakan pilih kombinasi filter atau periksa daftar siswa di tingkatan kelas SD ini.</p>
              </div>
            ) : (
              <div className="overflow-auto max-h-[720px] scroll-smooth">
                {/* STICKY CONTEXT STRIP DURING VERTICAL SCROLL */}
                <div className="sticky top-0 z-40 bg-slate-950 text-white px-6 py-3.5 text-xs font-bold tracking-wide flex items-center justify-between border-b border-slate-800 shadow-md">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <span className={cn("px-2.5 py-0.5 rounded text-[10px] font-black uppercase border", areaColors[selectedArea].badge)}>
                      {getAreaLabel(selectedArea)}
                    </span>
                    <span className="text-slate-600">•</span>
                    <span className="font-extrabold text-white">Kelas {classes.find(c => c.id === selectedClassId)?.name || 'SD'}</span>
                    <span className="text-slate-600">•</span>
                    <span className="text-slate-300">{getPeriodLabel(selectedPeriod)}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono hidden sm:block">
                    {filteredStudents.length} Siswa SD · Lumina Literasi & Numerasi
                  </div>
                </div>

                <table className="w-full text-left border-collapse min-w-[1000px] relative">
                  <thead>
                    {/* Row 1: Group Headers */}
                    <tr className="bg-slate-100 border-b border-slate-200 text-[10px] font-black text-slate-700 uppercase tracking-widest text-center select-none sticky top-0 z-30">
                      <th rowSpan={2} className="py-2.5 px-2 bg-slate-100 border-r border-slate-200 w-12 text-center text-slate-800">No.</th>
                      <th rowSpan={2} className="py-2.5 px-4 sticky left-0 bg-slate-100 z-30 border-r border-slate-200 w-[260px] max-w-[280px] min-w-[240px] text-left text-slate-800">Nama Siswa SD</th>
                      
                      {selectedArea === 'BAHASA_INDONESIA' && (
                        <>
                          <th colSpan={3} className="py-2.5 px-2 bg-blue-50/80 border-r border-slate-200 text-blue-800">Reading Fluency</th>
                          <th colSpan={2} className="py-2.5 px-2 bg-indigo-50/80 border-r border-slate-200 text-indigo-850">Reading Comprehension</th>
                        </>
                      )}

                      {selectedArea === 'ENGLISH_READING' && (
                        <>
                          <th colSpan={3} className="py-2.5 px-2 bg-indigo-50/80 border-r border-slate-200 text-indigo-800">Reading Fluency</th>
                          <th colSpan={2} className="py-2.5 px-2 bg-blue-50/80 border-r border-slate-200 text-blue-850">Comprehension</th>
                        </>
                      )}

                      {selectedArea === 'MENGAJI' && (
                        <>
                          <th colSpan={1} className="py-2.5 px-2 bg-teal-50/80 border-r border-slate-200 text-teal-800">Current Progress</th>
                          <th colSpan={1} className="py-2.5 px-2 bg-indigo-50/80 border-r border-slate-200 text-indigo-850">Target / Outcome</th>
                          <th colSpan={1} className="py-2.5 px-2 bg-emerald-50/80 border-r border-slate-200 text-emerald-850">Teacher Notes</th>
                        </>
                      )}

                      {selectedArea === 'NUMERACY' && (
                        <>
                          <th colSpan={1} className="py-2.5 px-2 bg-amber-50/80 border-r border-slate-200 text-amber-800">Numeracy Assessment</th>
                          <th colSpan={2} className="py-2.5 px-2 bg-indigo-50/80 border-r border-slate-200 text-indigo-850">Diagnostic / Outcome</th>
                        </>
                      )}

                      {selectedArea !== 'MENGAJI' && (
                        <th colSpan={2} className="py-2.5 px-4 bg-orange-50/85 border-r border-slate-200 text-orange-800">Intervention & Notes</th>
                      )}
                      <th rowSpan={2} className="py-2.5 px-4 sticky right-0 bg-slate-100 z-30 text-slate-800 border-l border-slate-200 shadow-[-2px_0_5px_rgba(0,0,0,0.02)]">Status / Simpan</th>
                    </tr>

                    {/* Row 2: Sub-headers */}
                    <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-bold text-slate-600 uppercase tracking-wider sticky top-[37px] z-30">
                      {selectedArea === 'BAHASA_INDONESIA' && (
                        <>
                          <th className="py-3 px-2 w-24 text-center border-r border-slate-100 bg-slate-50">Words Read</th>
                          <th className="py-3 px-2 w-24 text-center border-r border-slate-100 bg-slate-50">Errors</th>
                          <th className="py-3 px-2 w-20 text-center border-r border-slate-100 bg-slate-50">WPM</th>
                          <th className="py-3 px-2 w-32 text-center border-r border-slate-100 bg-slate-50">Reading Level</th>
                          <th className="py-3 px-2 w-36 text-center border-r border-slate-100 bg-slate-50">Comprehension</th>
                        </>
                      )}

                      {selectedArea === 'ENGLISH_READING' && (
                        <>
                          <th className="py-3 px-2 w-24 text-center border-r border-slate-100 bg-slate-50">Words Read</th>
                          <th className="py-3 px-2 w-24 text-center border-r border-slate-100 bg-slate-50">Errors</th>
                          <th className="py-3 px-2 w-20 text-center border-r border-slate-100 bg-slate-50">WPM</th>
                          <th className="py-3 px-2 w-36 text-center border-r border-slate-100 bg-slate-50">Reading Level</th>
                          <th className="py-3 px-2 w-36 text-center border-r border-slate-100 bg-slate-50">Comprehension</th>
                        </>
                      )}

                      {selectedArea === 'MENGAJI' && (
                        <>
                          <th className="py-3 px-2 w-32 text-center border-r border-slate-100 bg-slate-50">Level Saat Ini</th>
                          <th className="py-3 px-2 w-32 text-center border-r border-slate-100 bg-slate-50">Level Target</th>
                          <th className="py-3 px-2 w-48 text-center border-r border-slate-100 bg-slate-50 font-bold">Catatan Guru</th>
                        </>
                      )}

                      {selectedArea === 'NUMERACY' && (
                        <>
                          <th className="py-3 px-2 w-32 text-center border-r border-slate-100 bg-slate-50">Math Level</th>
                          <th className="py-3 px-2 w-52 text-center border-r border-slate-100 bg-slate-50">Topik</th>
                          <th className="py-3 px-2 w-28 text-center border-r border-slate-100 bg-slate-50">Accuracy (%)</th>
                        </>
                      )}

                      {selectedArea !== 'MENGAJI' && (
                        <>
                          <th className="py-3 px-4 w-44 text-center border-r border-slate-100 bg-slate-50">
                            <div className="flex flex-col items-center gap-1.5">
                              <span>Intervensi</span>
                              <button
                                type="button"
                                onClick={applyBulkTier1}
                                className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/60 px-2 py-0.5 rounded-lg text-[9px] font-black tracking-wider uppercase transition-colors cursor-pointer whitespace-nowrap block"
                                title="Set seluruh siswa menjadi Tier 1"
                              >
                                Set Tier 1 Semua
                              </button>
                            </div>
                          </th>
                          <th className="py-3 px-4 w-48 text-center border-r border-slate-100 bg-slate-50">Catatan Tambahan</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  
                  <tbody className="divide-y divide-slate-150 text-sm bg-white">
                    {filteredStudents.map((st, index) => {
                      const record = studentRecords[st.id] || {};
                      const isModified = modifiedIds.has(st.id);

                      return (
                        <tr
                          key={st.id}
                          className={cn(
                            "group/row transition-colors border-b border-slate-100",
                            isModified 
                              ? "bg-amber-50/20 hover:bg-amber-50/30" 
                              : "hover:bg-slate-50/60"
                          )}
                        >
                          {/* No. Column */}
                          <td className="py-4 px-2 text-center text-slate-500 font-bold border-r border-slate-100 bg-slate-50/10">
                            {index + 1}
                          </td>

                          {/* Student Identity Column: Sticky Left */}
                          <td className={cn(
                            "py-4 px-4 font-black text-slate-800 sticky left-0 z-10 border-r border-slate-100 shadow-[2px_0_5px_rgba(0,0,0,0.02)] transition-colors w-[260px] max-w-[280px] min-w-[240px]",
                            isModified 
                              ? "bg-amber-50/30 group-hover/row:bg-amber-50/40" 
                              : "bg-white group-hover/row:bg-slate-50/80"
                          )}>
                            <div className="flex flex-col select-none" title={st.name}>
                              <span className="text-base font-bold text-slate-900 leading-snug line-clamp-2 break-words whitespace-normal">{st.name}</span>
                              <span className="text-xs text-slate-500 font-mono uppercase mt-0.5">NIS: {st.id}</span>
                            </div>
                          </td>

                          {/* --- BAHASA INDONESIA --- */}
                          {selectedArea === 'BAHASA_INDONESIA' && (
                            <>
                              <td className="py-4 px-2 text-center border-r border-slate-100">
                                <input
                                  type="number"
                                  min="0"
                                  value={record.wordsRead ?? ''}
                                  onChange={e => handleCellChange(st.id, 'wordsRead', e.target.value === '' ? '' : Number(e.target.value))}
                                  className="w-20 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-2 h-11 text-center font-bold text-base focus:ring-2 focus:ring-slate-900 focus:border-slate-900 focus:bg-white outline-none transition-all"
                                />
                              </td>
                              <td className="py-4 px-2 text-center border-r border-slate-100">
                                <input
                                  type="number"
                                  min="0"
                                  value={record.errors ?? ''}
                                  onChange={e => handleCellChange(st.id, 'errors', e.target.value === '' ? '' : Number(e.target.value))}
                                  className="w-20 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-2 h-11 text-center font-bold text-base focus:ring-2 focus:ring-slate-900 focus:border-slate-900 focus:bg-white outline-none transition-all"
                                />
                              </td>
                              <td className="py-4 px-2 font-black text-slate-700 text-center text-base border-r border-slate-100">
                                {(record.wpm !== undefined && record.wpm !== null && record.wpm !== '') ? record.wpm : '-'}
                              </td>
                              <td className="py-4 px-2 text-center border-r border-slate-100">
                                <select
                                  value={record.readingLevel || 'IR'}
                                  onChange={e => handleCellChange(st.id, 'readingLevel', e.target.value)}
                                  className="w-28 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-2 h-11 font-bold text-base cursor-pointer focus:ring-2 focus:ring-slate-900 focus:border-slate-900 focus:bg-white outline-none transition-all"
                                >
                                  {READING_LEVEL_OPTIONS.map(lvl => (
                                    <option key={lvl} value={lvl}>{lvl}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="py-4 px-2 border-r border-slate-100">
                                <div className="flex items-center gap-1.5 justify-center">
                                  <select
                                    value={record.comprehensionScore === 'N/A' || record.comprehensionScore === null ? 'NA' : 'DATA'}
                                    onChange={e => {
                                      if (e.target.value === 'NA') {
                                        handleCellChange(st.id, 'comprehensionScore', 'N/A');
                                      } else {
                                        handleCellChange(st.id, 'comprehensionScore', '');
                                      }
                                    }}
                                    className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 h-11 text-sm font-bold cursor-pointer outline-none focus:ring-2 focus:ring-slate-900"
                                  >
                                    <option value="DATA">Data</option>
                                    <option value="NA">N/A</option>
                                  </select>
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      disabled={record.comprehensionScore === 'N/A' || record.comprehensionScore === null}
                                      value={(record.comprehensionScore === 'N/A' || record.comprehensionScore === null || record.comprehensionScore === undefined) ? '' : record.comprehensionScore}
                                      onChange={e => handleCellChange(st.id, 'comprehensionScore', e.target.value === '' ? '' : Number(e.target.value))}
                                      className={cn(
                                        "w-16 border rounded-lg px-1 py-2 h-11 text-center font-bold text-base transition-all outline-none",
                                        (record.comprehensionScore === 'N/A' || record.comprehensionScore === null) 
                                          ? "bg-slate-100 border-slate-200 text-slate-300 cursor-not-allowed" 
                                          : "bg-slate-50/60 border-slate-200 text-slate-800 focus:ring-2 focus:ring-slate-900 focus:border-slate-900 focus:bg-white"
                                      )}
                                      placeholder={record.comprehensionScore === 'N/A' || record.comprehensionScore === null ? 'N/A' : ''}
                                    />
                                    <span className="text-xs text-slate-400 font-bold">%</span>
                                  </div>
                                </div>
                              </td>
                            </>
                          )}

                          {/* --- ENGLISH READING --- */}
                          {selectedArea === 'ENGLISH_READING' && (
                            <>
                              <td className="py-4 px-2 text-center border-r border-slate-100">
                                <input
                                  type="number"
                                  min="0"
                                  value={record.wordsRead ?? ''}
                                  onChange={e => handleCellChange(st.id, 'wordsRead', e.target.value === '' ? '' : Number(e.target.value))}
                                  className="w-20 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-2 h-11 text-center font-bold text-base focus:ring-2 focus:ring-slate-900 focus:border-slate-900 focus:bg-white outline-none transition-all"
                                />
                              </td>
                              <td className="py-4 px-2 text-center border-r border-slate-100">
                                <input
                                  type="number"
                                  min="0"
                                  value={record.errors ?? ''}
                                  onChange={e => handleCellChange(st.id, 'errors', e.target.value === '' ? '' : Number(e.target.value))}
                                  className="w-20 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-2 h-11 text-center font-bold text-base focus:ring-2 focus:ring-slate-900 focus:border-slate-900 focus:bg-white outline-none transition-all"
                                />
                              </td>
                              <td className="py-4 px-2 font-black text-slate-700 text-center text-base border-r border-slate-100">
                                {(record.wpm !== undefined && record.wpm !== null && record.wpm !== '') ? record.wpm : '-'}
                              </td>
                              <td className="py-4 px-2 text-center border-r border-slate-100">
                                <select
                                  value={record.readingLevel || 'IR'}
                                  onChange={e => handleCellChange(st.id, 'readingLevel', e.target.value)}
                                  className="w-32 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-2 h-11 font-bold text-base cursor-pointer focus:ring-2 focus:ring-slate-900 focus:border-slate-900 focus:bg-white outline-none transition-all"
                                >
                                  {READING_LEVEL_OPTIONS.map(lvl => (
                                    <option key={lvl} value={lvl}>{lvl}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="py-4 px-2 border-r border-slate-100">
                                <div className="flex items-center gap-1.5 justify-center">
                                  <select
                                    value={record.comprehensionScore === 'N/A' || record.comprehensionScore === null ? 'NA' : 'DATA'}
                                    onChange={e => {
                                      if (e.target.value === 'NA') {
                                        handleCellChange(st.id, 'comprehensionScore', 'N/A');
                                      } else {
                                        handleCellChange(st.id, 'comprehensionScore', '');
                                      }
                                    }}
                                    className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 h-11 text-sm font-bold cursor-pointer outline-none focus:ring-2 focus:ring-slate-900"
                                  >
                                    <option value="DATA">Data</option>
                                    <option value="NA">N/A</option>
                                  </select>
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      disabled={record.comprehensionScore === 'N/A' || record.comprehensionScore === null}
                                      value={(record.comprehensionScore === 'N/A' || record.comprehensionScore === null || record.comprehensionScore === undefined) ? '' : record.comprehensionScore}
                                      onChange={e => handleCellChange(st.id, 'comprehensionScore', e.target.value === '' ? '' : Number(e.target.value))}
                                      className={cn(
                                        "w-16 border rounded-lg px-1 py-2 h-11 text-center font-bold text-base transition-all outline-none",
                                        (record.comprehensionScore === 'N/A' || record.comprehensionScore === null) 
                                          ? "bg-slate-100 border-slate-200 text-slate-300 cursor-not-allowed" 
                                          : "bg-slate-50/60 border-slate-200 text-slate-800 focus:ring-2 focus:ring-slate-900 focus:border-slate-900 focus:bg-white"
                                      )}
                                      placeholder={record.comprehensionScore === 'N/A' || record.comprehensionScore === null ? 'N/A' : ''}
                                    />
                                    <span className="text-xs text-slate-400 font-bold">%</span>
                                  </div>
                                </div>
                              </td>
                            </>
                          )}

                          {/* --- MENGAJI --- */}
                          {selectedArea === 'MENGAJI' && (
                            <>
                              <td className="py-4 px-2 text-center border-r border-slate-100">
                                <input
                                  type="text"
                                  placeholder=""
                                  value={record.iqroCurrentLevel ?? ''}
                                  onChange={e => handleCellChange(st.id, 'iqroCurrentLevel', e.target.value)}
                                  className="w-24 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-2 h-11 text-center font-bold text-base focus:ring-2 focus:ring-slate-900 focus:border-slate-900 focus:bg-white outline-none transition-all"
                                />
                              </td>
                              <td className="py-4 px-2 text-center border-r border-slate-100">
                                <input
                                  type="text"
                                  placeholder=""
                                  value={record.targetIqroLevel ?? ''}
                                  onChange={e => handleCellChange(st.id, 'targetIqroLevel', e.target.value)}
                                  className="w-24 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-2 h-11 text-center font-bold text-base focus:ring-2 focus:ring-slate-900 focus:border-slate-900 focus:bg-white outline-none transition-all"
                                />
                              </td>
                              <td className="py-4 px-2 text-center border-r border-slate-100">
                                <div className="flex flex-col items-center justify-center gap-1">
                                  {(!record.letterRecognitionNote && !record.tajwidNote && !record.notes) ? (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenNotes(st.id)}
                                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-teal-600 bg-teal-50 hover:bg-teal-100 border border-teal-200/50 rounded-xl transition-all"
                                    >
                                      <Plus size={12} />
                                      Tambah catatan
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenNotes(st.id)}
                                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/50 rounded-xl transition-all"
                                    >
                                      <FileText size={12} />
                                      Lihat/Edit catatan
                                    </button>
                                  )}
                                  {/* Small snippet preview of notes if exists */}
                                  <div className="text-[10px] text-slate-400 max-w-[150px] truncate">
                                    {[record.letterRecognitionNote, record.tajwidNote, record.notes].filter(Boolean).join(' · ')}
                                  </div>
                                </div>
                              </td>
                            </>
                          )}

                          {/* --- NUMERACY (MATH) --- */}
                          {selectedArea === 'NUMERACY' && (
                            <>
                              <td className="py-4 px-2 text-center border-r border-slate-100">
                                <input
                                  type="text"
                                  placeholder="Level"
                                  value={record.mathLevel || ''}
                                  onChange={e => handleCellChange(st.id, 'mathLevel', e.target.value)}
                                  className="w-28 bg-slate-50/60 border border-slate-200 rounded-lg px-2.5 py-2 h-11 font-bold text-center text-base focus:ring-2 focus:ring-slate-900 focus:border-slate-900 focus:bg-white outline-none transition-all"
                                />
                              </td>
                              <td className="py-4 px-2 text-center border-r border-slate-100">
                                <textarea
                                  rows={getRows(record.topic || '')}
                                  placeholder=""
                                  value={record.topic || ''}
                                  onChange={e => handleCellChange(st.id, 'topic', e.target.value)}
                                  className="w-48 bg-slate-50/60 border border-slate-200 rounded-lg px-2.5 py-2 font-medium text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 focus:bg-white outline-none transition-all resize-y min-h-[44px]"
                                />
                              </td>
                              <td className="py-4 px-2 text-center border-r border-slate-100">
                                <div className="flex items-center gap-1 justify-center">
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={record.accuracy ?? ''}
                                    onChange={e => handleCellChange(st.id, 'accuracy', e.target.value === '' ? '' : Number(e.target.value))}
                                    className="w-16 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-2 h-11 text-center font-bold text-base focus:ring-2 focus:ring-slate-900 focus:border-slate-900 focus:bg-white outline-none transition-all"
                                  />
                                  <span className="text-xs text-slate-400 font-bold">%</span>
                                </div>
                              </td>
                            </>
                          )}

                          {/* INTERVENSI SELECT dropdown */}
                          {selectedArea !== 'MENGAJI' && (
                            <>
                              <td className="py-4 px-4 text-center border-r border-slate-100 font-bold">
                                <select
                                  value={record.supportStatus || 'INCOMPLETE_DATA'}
                                  onChange={e => handleCellChange(st.id, 'supportStatus', e.target.value)}
                                  className={cn(
                                    "text-xs font-black tracking-wider uppercase rounded-xl px-2.5 py-2 h-11 text-center outline-none cursor-pointer border w-40 transition-colors focus:ring-2",
                                    record.supportStatus === 'ON_TRACK' && "bg-emerald-50 text-emerald-700 border-emerald-200 focus:ring-emerald-500 focus:border-emerald-500",
                                    record.supportStatus === 'MONITOR' && "bg-yellow-50 text-yellow-700 border-yellow-200 focus:ring-yellow-500 focus:border-yellow-500",
                                    record.supportStatus === 'NEEDS_SUPPORT' && "bg-orange-50 text-orange-700 border-orange-200 focus:ring-orange-500 focus:border-orange-500",
                                    record.supportStatus === 'INTERVENTION_RECOMMENDED' && "bg-purple-50 text-purple-700 border-purple-200 focus:ring-purple-500 focus:border-purple-500",
                                    (record.supportStatus === 'INCOMPLETE_DATA' || !record.supportStatus) && "bg-slate-50 text-slate-500 border-slate-200 focus:ring-slate-400 focus:border-slate-400"
                                  )}
                                >
                                  <option value="INCOMPLETE_DATA">Belum diisi</option>
                                  <option value="ON_TRACK">Tier 1</option>
                                  <option value="MONITOR">Tier 2</option>
                                  <option value="NEEDS_SUPPORT">Tier 3</option>
                                  <option value="INTERVENTION_RECOMMENDED">SN (Special Needs)</option>
                                </select>
                              </td>

                              {/* LOCAL NOTES */}
                              <td className="py-4 px-4 border-r border-slate-100">
                                <textarea
                                  rows={getRows(record.notes || '')}
                                  placeholder="Ketik catatan di sini..."
                                  value={record.notes || ''}
                                  onChange={e => handleCellChange(st.id, 'notes', e.target.value)}
                                  className="w-48 bg-slate-50/60 hover:bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-sm outline-none font-medium resize-y focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all min-h-[44px]"
                                />
                              </td>
                            </>
                          )}

                          {/* ACTION BUTTON COLUMN: Sticky Right */}
                          <td className={cn(
                            "py-4 px-4 text-center sticky right-0 z-10 border-l border-slate-100 shadow-[-2px_0_5px_rgba(0,0,0,0.02)] transition-colors w-32 min-w-[128px]",
                            isModified 
                              ? "bg-amber-50/30 group-hover/row:bg-amber-50/40" 
                              : "bg-white group-hover/row:bg-slate-50/80"
                          )}>
                            <div className="flex flex-col items-center justify-center gap-1.5">
                              {/* Status Element */}
                              <div className="h-5 flex items-center justify-center">
                                {getRowStatusElement(st.id, record.supportStatus)}
                              </div>
                              
                              {/* Manual Save Button */}
                              {(() => {
                                const btnProps = getButtonProps(st.id);
                                return (
                                  <button
                                    type="button"
                                    disabled={btnProps.disabled}
                                    onClick={() => handleManualSave(st.id)}
                                    className={cn(
                                      "flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer",
                                      btnProps.buttonClass
                                    )}
                                  >
                                    <Save size={11} />
                                    {btnProps.label}
                                  </button>
                                );
                              })()}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* MASTER BOTTOM MULTI ACTION SECTION */}
            <div className="p-5 bg-slate-50/50 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                <HelpCircle size={13} className="text-slate-400" />
                Draft baris ditandai oranye muda jika ada perubahan. Gunakan tombol 'Simpan Semua' untuk sinkronisasi massal satu kelas.
              </div>

              <div className="flex items-center gap-3 self-end md:self-auto">
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Apakah Anda yakin ingin membuang semua draf dan mengambil ulang data terbaru dari Firestore?')) {
                      // Trigger reloading
                      setSelectedClassId('');
                      setTimeout(() => setSelectedClassId(selectedClassId), 50);
                      toast.success('Draft berhasil dibatalkan');
                    }
                  }}
                  className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                >
                  BATALKAN DRAFT
                </button>
                <button
                  type="button"
                  onClick={handleSaveAll}
                  disabled={isSaving || students.length === 0}
                  className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-emerald-600/15 transition-all cursor-pointer"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      MENYIMPAN...
                    </>
                  ) : (
                    <>
                      <Save size={14} />
                      SIMPAN SEMUA ({filteredStudents.length} SISWA SD)
                    </>
                  )}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* CLASS HISTORY MODAL SUMMARY DIAGRAM */}
      <AnimatePresence>
        {showHistory && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2.5rem] shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col border border-gray-100"
            >
              <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-slate-50/50">
                <div>
                  <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                    <span>RIWAYAT KELAS SD</span>
                    <span>•</span>
                    <span className="text-slate-900">{classes.find(c => c.id === selectedClassId)?.name || 'SD'}</span>
                  </div>
                  <h3 className="text-base font-black text-slate-950 uppercase tracking-wider italic">
                    Ringkasan Penilaian {getAreaLabel(selectedArea)}
                  </h3>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Periode: {getPeriodLabel(selectedPeriod)}</p>
                </div>
                <button 
                  type="button"
                  onClick={() => setShowHistory(false)}
                  className="p-2.5 rounded-2xl bg-white border border-gray-100 hover:bg-gray-50 text-gray-400 hover:text-slate-900 transition-all shadow-sm cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-auto p-6">
                {loadingHistory ? (
                  <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2">
                    <RefreshCw className="animate-spin text-indigo-500" size={24} />
                    <span className="text-xs font-black uppercase tracking-widest">Membaca Data Riwayat...</span>
                  </div>
                ) : historyRecords.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-gray-400 text-center">
                    <FileText size={40} className="text-gray-200 mb-3" />
                    <p className="text-xs font-black uppercase tracking-widest">Belum ada data terekam</p>
                    <p className="text-[10px] text-gray-400 mt-1 max-w-xs leading-normal">Belum ada siswa di kelas SD ini yang dinilai untuk area dan periode terpilih.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-gray-100">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-gray-100 text-slate-500 uppercase tracking-wider font-black text-[9px]">
                          <th className="py-3 px-4">Nama Siswa SD</th>
                          
                          {/* BI & ENG COLUMNS */}
                          {(selectedArea === 'BAHASA_INDONESIA' || selectedArea === 'ENGLISH_READING') && (
                            <>
                              <th className="py-3 px-4 text-center">Words Read</th>
                              <th className="py-3 px-4 text-center">Errors</th>
                              <th className="py-3 px-4 text-center">WPM</th>
                              <th className="py-3 px-4 text-center">Reading Level</th>
                              <th className="py-3 px-4 text-center">Comprehension</th>
                            </>
                          )}

                          {/* MENGAJI COLUMNS */}
                          {selectedArea === 'MENGAJI' && (
                            <>
                              <th className="py-3 px-4 text-center">Level</th>
                              <th className="py-3 px-4 text-center">Checkpoint</th>
                              <th className="py-3 px-4 text-center">Target Level</th>
                              <th className="py-3 px-4 text-center">Status Kelulusan</th>
                            </>
                          )}

                          {/* MATH COLUMNS */}
                          {selectedArea === 'NUMERACY' && (
                            <>
                              <th className="py-3 px-4 text-center">Math Level</th>
                              <th className="py-3 px-4 text-center">Topik</th>
                              <th className="py-3 px-4 text-center">Akurasi</th>
                            </>
                          )}

                          <th className="py-3 px-4 text-center">Intervensi</th>
                          <th className="py-3 px-4 text-center">Terakhir Update</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 text-gray-700 font-medium">
                        {students.map(student => {
                          const record = historyRecords.find(r => r.studentId === student.id);
                          return (
                            <tr key={student.id} className="hover:bg-gray-50/50 transition-colors">
                              <td className="py-3.5 px-4 font-black text-slate-900 border-r border-slate-50">
                                <div>{student.name}</div>
                                <div className="text-[9px] text-gray-400 mt-0.5">NIS: {student.id}</div>
                              </td>

                              {/* BI & ENG RECORDS */}
                              {(selectedArea === 'BAHASA_INDONESIA' || selectedArea === 'ENGLISH_READING') && (
                                <>
                                  <td className="py-3.5 px-4 text-center font-bold">{(record as any)?.wordsRead !== undefined && (record as any)?.wordsRead !== null ? (record as any)?.wordsRead : '-'}</td>
                                  <td className="py-3.5 px-4 text-center text-red-500 font-bold">{(record as any)?.errors !== undefined && (record as any)?.errors !== null ? (record as any)?.errors : '-'}</td>
                                  <td className="py-3.5 px-4 text-center text-emerald-600 font-extrabold">{(record as any)?.wpm !== undefined && (record as any)?.wpm !== null ? `${(record as any)?.wpm} wpm` : '-'}</td>
                                  <td className="py-3.5 px-4 text-center font-black">
                                    {(record as any)?.readingLevel ? (
                                      <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[9px] font-black">{(record as any)?.readingLevel}</span>
                                    ) : '-'}
                                  </td>
                                  <td className="py-3.5 px-4 text-center font-bold">
                                    {(record as any)?.comprehensionScore !== undefined && (record as any)?.comprehensionScore !== null ? (
                                      `${(record as any)?.comprehensionScore}%`
                                    ) : '-'}
                                  </td>
                                </>
                              )}

                              {/* MENGAJI RECORDS */}
                              {selectedArea === 'MENGAJI' && (
                                <>
                                  <td className="py-3.5 px-4 text-center font-black text-slate-800">{(record as any)?.iqroCurrentLevel || '-'}</td>
                                  <td className="py-3.5 px-4 text-center font-bold">{(record as any)?.iqroCurrentCheckpoint || '-'}</td>
                                  <td className="py-3.5 px-4 text-center font-bold">{(record as any)?.targetIqroLevel || '-'}</td>
                                  <td className="py-3.5 px-4 text-center text-[10px] font-black text-indigo-600">{(record as any)?.completionStatus || '-'}</td>
                                </>
                              )}

                              {/* MATH RECORDS */}
                              {selectedArea === 'NUMERACY' && (
                                <>
                                  <td className="py-3.5 px-4 text-center font-bold">{(record as any)?.mathLevel || '-'}</td>
                                  <td className="py-3.5 px-4 text-center text-slate-600 max-w-[124px] truncate">{(record as any)?.topic || '-'}</td>
                                  <td className="py-3.5 px-4 text-center font-extrabold text-[#7c3aed]">{(record as any)?.accuracy !== undefined && (record as any)?.accuracy !== null ? `${(record as any)?.accuracy}%` : '-'}</td>
                                </>
                              )}

                              <td className="py-3.5 px-4 text-center">
                                <span
                                  className={cn(
                                    "px-2 py-0.5 rounded-lg text-[9px] font-extrabold tracking-wider uppercase border inline-block whitespace-nowrap",
                                    record?.supportStatus === 'ON_TRACK' && "bg-emerald-50 text-emerald-700 border-emerald-100",
                                    record?.supportStatus === 'MONITOR' && "bg-yellow-50 text-yellow-700 border-yellow-105",
                                    record?.supportStatus === 'NEEDS_SUPPORT' && "bg-orange-50 text-orange-700 border-orange-100",
                                    record?.supportStatus === 'INTERVENTION_RECOMMENDED' && "bg-red-50 text-red-700 border-red-100",
                                    (!record?.supportStatus || record?.supportStatus === 'INCOMPLETE_DATA') && "bg-slate-50 text-slate-500 border-slate-100"
                                  )}
                                >
                                  {getSupportStatusLabel(record?.supportStatus || 'INCOMPLETE_DATA')}
                                </span>
                              </td>

                              <td className="py-3.5 px-4 text-center text-[10px] text-gray-400 font-bold">
                                {record?.updatedAt ? new Date(record.updatedAt).toLocaleDateString('id-ID') : '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* GOOGLE SHEETS SYNC INTEGRATION MODAL */}
      <AnimatePresence>
        {showSheetsSync && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2.5rem] shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-gray-100"
            >
              {/* Header */}
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-slate-50/50">
                <div>
                  <div className="flex items-center gap-2 text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">
                    <FileText size={10} className="text-emerald-500" />
                    <span>Integrasi Google Sheets</span>
                    <span>•</span>
                    <span className="text-slate-900">{classes.find(c => c.id === selectedClassId)?.name || 'SD'}</span>
                  </div>
                  <h3 className="text-base font-black text-slate-950 uppercase tracking-wider italic">
                    Sinkronisasi Data: {getAreaLabel(selectedArea)} ({getPeriodLabel(selectedPeriod)})
                  </h3>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">
                    Tahun Ajaran: {selectedYear} • Periode ID: {selectedPeriod === 'JUL_OCT' ? 'P1' : (selectedPeriod === 'NOV_FEB' ? 'P2' : 'P3')}
                  </p>
                </div>
                <button 
                  type="button"
                  onClick={() => setShowSheetsSync(false)}
                  className="p-2.5 rounded-2xl bg-white border border-gray-100 hover:bg-gray-50 text-gray-400 hover:text-slate-900 transition-all shadow-sm cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Step & Tabs Selector */}
              <div className="px-6 py-3 border-b border-gray-50 bg-white flex gap-1.5 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setSyncStep('initial')}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap",
                    syncStep === 'initial'
                      ? "bg-slate-900 text-white shadow-md shadow-slate-900/10"
                      : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                  )}
                >
                  1. Draf & Input Sheet
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (previewRows.length > 0) setSyncStep('preview');
                  }}
                  disabled={previewRows.length === 0}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap",
                    syncStep === 'preview'
                      ? "bg-slate-900 text-white shadow-md shadow-slate-900/10"
                      : "text-slate-400 disabled:opacity-50 hover:text-slate-800 hover:bg-slate-50"
                  )}
                >
                  2. Pratinjau Perubahan ({previewRows.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSyncStep('history');
                    fetchSyncLogs();
                  }}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap",
                    syncStep === 'history'
                      ? "bg-slate-900 text-white shadow-md shadow-slate-900/10"
                      : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                  )}
                >
                  3. Riwayat Audit & Rollback
                </button>
              </div>

              {/* Main Content Areas */}
              <div className="flex-1 overflow-auto p-6 bg-slate-50/20">
                {syncStep === 'initial' && (
                  <div className="space-y-6 max-w-3xl mx-auto py-4">
                    {/* OPTION 1: CREATE TEMPLATE */}
                    <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-4">
                      <div className="flex items-start gap-4">
                        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl shrink-0">
                          <Sparkles size={20} />
                        </div>
                        <div>
                          <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider">Opsi A: Buat Template Baru dengan Data Siswa</h4>
                          <p className="text-xs text-slate-500 mt-1">
                            Sistem akan otomatis membuat file Google Spreadsheet baru di Google Drive Anda. Nama dan NIS/ID seluruh siswa kelas <b>{classes.find(c => c.id === selectedClassId)?.name}</b> akan dimasukkan secara urut, lengkap dengan kolom penulisan indikator area <b>{getAreaLabel(selectedArea)}</b>.
                          </p>
                        </div>
                      </div>

                      <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                        <button
                          type="button"
                          onClick={handleCreateTemplate}
                          disabled={isCreatingTemplate}
                          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider shadow-md shadow-indigo-600/10 transition-all cursor-pointer"
                        >
                          {isCreatingTemplate ? (
                            <>
                              <RefreshCw size={13} className="animate-spin" />
                              Membuat Berkas...
                            </>
                          ) : (
                            <>
                              <Plus size={13} />
                              Buat Template Sheet Baru
                            </>
                          )}
                        </button>

                        {createdTemplateUrl && (
                          <a
                            href={createdTemplateUrl}
                            target="_blank"
                            referrerPolicy="no-referrer"
                            className="w-full sm:w-auto text-center flex items-center justify-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200/50 hover:bg-emerald-100 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                          >
                            Buka Google Sheet ↗
                          </a>
                        )}
                      </div>

                      {createdTemplateUrl && (
                        <div className="bg-emerald-50/40 border border-emerald-100 rounded-2xl p-4 mt-2 space-y-2">
                          <p className="text-[11px] text-emerald-800 font-bold flex items-center gap-1.5">
                            <CheckCircle2 size={13} className="text-emerald-600" />
                            File template berhasil dibuat dan dibagikan secara aman!
                          </p>
                          <p className="text-[10px] text-slate-500 leading-normal">
                            Silakan buka tautan di atas untuk mengedit nilai-nilai perkembangan Literasi dan Numerasi siswa Anda. Setelah selesai menginput data guru di sana, masukkan URL file tersebut pada input di bawah untuk menyinkronkannya kembali ke Firestore.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* OPTION 2: ENTER EXISTING GOOGLE SHEET URL */}
                    <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-4">
                      <div className="flex items-start gap-4">
                        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl shrink-0">
                          <FileText size={20} />
                        </div>
                        <div>
                          <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider">Opsi B: Analisis & Sinkronisasi Dari Google Sheet</h4>
                          <p className="text-xs text-slate-500 mt-1">
                            Tempelkan URL link tautan Google Spreadsheet Anda untuk menganalisis data. Kolom <b>ID Siswa (NIS)</b> akan dipetakan sebagai pencocok utama.
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3 pt-2">
                        {loadingSheetConfig ? (
                          <div className="flex items-center justify-center p-6 gap-2 text-slate-500 text-xs font-bold uppercase">
                            <RefreshCw size={14} className="animate-spin text-slate-500" />
                            Memuat Konfigurasi Google Sheet Resmi...
                          </div>
                        ) : sheetConfigError ? (
                          <div className="bg-amber-50/60 border border-amber-100 p-4 rounded-2xl flex items-start gap-2.5 text-amber-900 text-xs leading-normal">
                            <span className="font-bold text-amber-600 shrink-0 uppercase tracking-wider block mt-0.5">⚠️ Perhatian:</span>
                            <div>
                              <p className="font-bold">{sheetConfigError}</p>
                              <p className="text-[10px] text-slate-500 mt-0.5 leading-normal">
                                Hubungi Administrator untuk mengatur pemetaan Google Sheet resmi bagi kelas ini di panel Admin.
                              </p>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                              <div className="md:col-span-3 space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Tautan URL Google Sheet (Resmi - Read Only)</label>
                                <input
                                  type="text"
                                  value={sheetsUrl}
                                  readOnly
                                  disabled
                                  className="w-full bg-slate-100 border border-slate-200 text-xs px-3 py-2.5 rounded-xl outline-none font-medium text-slate-500 cursor-not-allowed select-all"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Tab Terpilih (Read Only)</label>
                                <input
                                  type="text"
                                  value={sheetsTabName}
                                  readOnly
                                  disabled
                                  className="w-full bg-slate-100 border border-slate-200 text-xs px-3 py-2.5 rounded-xl outline-none font-bold text-slate-500 cursor-not-allowed"
                                />
                              </div>
                            </div>

                            <div className="pt-2 flex justify-end">
                              <button
                                type="button"
                                onClick={handleFetchPreview}
                                disabled={isPreviewing || !sheetsUrl}
                                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-md shadow-emerald-600/10"
                              >
                                {isPreviewing ? (
                                  <>
                                    <RefreshCw size={13} className="animate-spin" />
                                    Menganalisis Berkas...
                                  </>
                                ) : (
                                  <>
                                    <FileText size={13} />
                                    Analisis & Lihat Pratinjau
                                  </>
                                )}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {syncStep === 'preview' && (
                  <div className="space-y-4">
                    {/* Summary statistics & action */}
                    <div className="bg-slate-900 text-white rounded-3xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg">
                      <div className="space-y-1">
                        <span className="text-[9px] font-black tracking-widest text-[#9d9da6] uppercase">Hasil Perbandingan Data</span>
                        <h4 className="text-sm font-black text-white uppercase tracking-wider">Pratinjau Sinkronisasi Terdeteksi</h4>
                        <p className="text-[11px] text-slate-400">
                          Total data dari Google Sheet: <b>{previewRows.length} baris</b>. Beri tanda centang pada siswa yang ingin Anda simpan.
                        </p>
                      </div>

                      {/* Select all changes option */}
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2 bg-slate-800 border border-slate-700 p-2.5 rounded-2xl text-xs font-bold text-slate-300 cursor-pointer select-none hover:bg-slate-700 transition-colors">
                          <input
                            type="checkbox"
                            checked={
                              previewRows.length > 0 &&
                              previewRows.filter(row => row.status === 'new' || row.status === 'modified').every(row => selectedSyncIds.has(row.studentId))
                            }
                            onChange={e => {
                              const changes = previewRows.filter(row => row.status === 'new' || row.status === 'modified');
                              setSelectedSyncIds(prev => {
                                const next = new Set(prev);
                                if (e.target.checked) {
                                  changes.forEach(row => next.add(row.studentId));
                                } else {
                                  changes.forEach(row => next.delete(row.studentId));
                                }
                                return next;
                              });
                            }}
                            className="accent-emerald-500 rounded cursor-pointer"
                          />
                          <span>Pilih Semua Perubahan</span>
                        </label>

                        <button
                          type="button"
                          onClick={handleConfirmSync}
                          disabled={isSyncing || selectedSyncIds.size === 0}
                          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 disabled:text-slate-400 text-white px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider shadow-md transition-all cursor-pointer"
                        >
                          {isSyncing ? (
                            <>
                              <RefreshCw size={13} className="animate-spin" />
                              Menyimpan...
                            </>
                          ) : (
                            <>
                              <CheckCircle2 size={13} />
                              SINKRONKAN ({selectedSyncIds.size} SISWA)
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Preview Table */}
                    <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-50 border-b border-gray-100 text-slate-400 uppercase tracking-wider font-black text-[9px] py-3">
                              <th className="py-3 px-4 w-12 text-center">Sync</th>
                              <th className="py-3 px-4 w-48">Nama Siswa SD</th>
                              <th className="py-3 px-2 w-28 text-center">Status</th>
                              <th className="py-3 px-4">Perbandingan Perubahan Nilai</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50 text-gray-700 font-medium">
                            {previewRows.map((row) => {
                              const isSelected = selectedSyncIds.has(row.studentId);
                              const isEditable = row.status === 'new' || row.status === 'modified';

                              return (
                                <tr key={row.studentId} className={cn("hover:bg-slate-50/30 transition-colors", isSelected ? "bg-emerald-50/10" : "")}>
                                  <td className="py-4 px-4 text-center">
                                    <input
                                      type="checkbox"
                                      disabled={!isEditable}
                                      checked={isSelected}
                                      onChange={() => {
                                        setSelectedSyncIds(prev => {
                                          const next = new Set(prev);
                                          if (next.has(row.studentId)) {
                                            next.delete(row.studentId);
                                          } else {
                                            next.add(row.studentId);
                                          }
                                          return next;
                                        });
                                      }}
                                      className="accent-emerald-500 rounded cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                    />
                                  </td>
                                  <td className="py-4 px-4">
                                    <span className="font-black text-slate-900 block">{row.studentName}</span>
                                    <span className="text-[10px] text-slate-400 block font-mono">NIS: {row.studentId}</span>
                                  </td>
                                  <td className="py-4 px-2 text-center">
                                    <span
                                      className={cn(
                                        "px-2.5 py-0.5 rounded-lg text-[9px] font-extrabold tracking-wider uppercase border inline-block",
                                        row.status === 'new' && "bg-emerald-50 text-emerald-700 border-emerald-100",
                                        row.status === 'modified' && "bg-amber-50 text-amber-700 border-amber-100",
                                        row.status === 'no_change' && "bg-slate-50 text-slate-500 border-slate-100",
                                        row.status === 'missing_in_sheet' && "bg-slate-100 text-slate-600 border-slate-200"
                                      )}
                                    >
                                      {row.status === 'new' && 'BARU'}
                                      {row.status === 'modified' && 'DIUBAH'}
                                      {row.status === 'no_change' && 'SAMA'}
                                      {row.status === 'missing_in_sheet' && 'TIDAK DI SHEET'}
                                    </span>
                                  </td>
                                  <td className="py-4 px-4 text-[11px] leading-normal font-mono text-slate-600">
                                    {row.status === 'missing_in_sheet' && (
                                      <span className="text-slate-400 italic">Siswa terdaftar di kelas tetapi barisnya kosong di Google Sheet. Data lama di Firestore tetap aman dan tidak akan dihapus.</span>
                                    )}
                                    {row.status === 'no_change' && (
                                      <span className="text-slate-400">Nilai di Google Sheet sama persis dengan database Firestore.</span>
                                    )}
                                    {isEditable && (
                                      <div className="space-y-1">
                                        {/* Display specific fields for preview */}
                                        {selectedArea === 'NUMERACY' && (
                                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                            <div>
                                              <span className="text-[9px] text-slate-400 block font-sans uppercase font-bold">Math Level:</span>
                                              <span className="text-slate-400 line-through">{(row.previousData?.mathLevel) || '(kosong)'}</span>
                                              <span className="text-emerald-600 font-bold ml-1">➔ {row.newData?.mathLevel || '(kosong)'}</span>
                                            </div>
                                            <div>
                                              <span className="text-[9px] text-slate-400 block font-sans uppercase font-bold">Topik:</span>
                                              <span className="text-slate-400 truncate max-w-[100px] inline-block align-bottom line-through">{(row.previousData?.topic) || '(kosong)'}</span>
                                              <span className="text-emerald-600 font-bold ml-1">➔ {row.newData?.topic || '(kosong)'}</span>
                                            </div>
                                            <div>
                                              <span className="text-[9px] text-slate-400 block font-sans uppercase font-bold">Accuracy:</span>
                                              <span className="text-slate-400 line-through">{row.previousData?.accuracy !== undefined && row.previousData?.accuracy !== null ? `${row.previousData.accuracy}%` : '(kosong)'}</span>
                                              <span className="text-emerald-600 font-bold ml-1">➔ {row.newData?.accuracy !== undefined && row.newData?.accuracy !== null ? `${row.newData.accuracy}%` : '(kosong)'}</span>
                                            </div>
                                          </div>
                                        )}

                                        {(selectedArea === 'BAHASA_INDONESIA' || selectedArea === 'ENGLISH_READING') && (
                                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                            <div>
                                              <span className="text-[9px] text-slate-400 block font-sans uppercase font-bold">Words Read/Errors/WPM:</span>
                                              <span className="text-slate-400 line-through">
                                                {row.previousData?.wordsRead ?? '-'}/{row.previousData?.errors ?? '-'}/{row.previousData?.wpm ?? '-'}
                                              </span>
                                              <span className="text-emerald-600 font-bold ml-1">
                                                ➔ {row.newData?.wordsRead ?? '-'}/{row.newData?.errors ?? '-'}/{row.newData?.wpm ?? '-'}
                                              </span>
                                            </div>
                                            <div>
                                              <span className="text-[9px] text-slate-400 block font-sans uppercase font-bold">Reading Level:</span>
                                              <span className="text-slate-400 line-through">{row.previousData?.readingLevel || '-'}</span>
                                              <span className="text-emerald-600 font-bold ml-1">➔ {row.newData?.readingLevel || '-'}</span>
                                            </div>
                                            <div>
                                              <span className="text-[9px] text-slate-400 block font-sans uppercase font-bold">Comprehension:</span>
                                              <span className="text-slate-400 line-through">{row.previousData?.comprehensionScore !== undefined && row.previousData?.comprehensionScore !== null ? `${row.previousData.comprehensionScore}%` : '-'}</span>
                                              <span className="text-emerald-600 font-bold ml-1">➔ {row.newData?.comprehensionScore !== undefined && row.newData?.comprehensionScore !== null ? `${row.newData.comprehensionScore}%` : '-'}</span>
                                            </div>
                                          </div>
                                        )}

                                        {selectedArea === 'MENGAJI' && (
                                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                                            <div>
                                              <span className="text-[9px] text-slate-400 block font-sans uppercase font-bold">Level:</span>
                                              <span className="text-slate-400 line-through">{row.previousData?.iqroCurrentLevel || '-'}</span>
                                              <span className="text-emerald-600 font-bold ml-1">➔ {row.newData?.iqroCurrentLevel || '-'}</span>
                                            </div>
                                            <div>
                                              <span className="text-[9px] text-slate-400 block font-sans uppercase font-bold">Checkpoint:</span>
                                              <span className="text-slate-400 line-through">{row.previousData?.iqroCurrentCheckpoint || '-'}</span>
                                              <span className="text-emerald-600 font-bold ml-1">➔ {row.newData?.iqroCurrentCheckpoint || '-'}</span>
                                            </div>
                                            <div>
                                              <span className="text-[9px] text-slate-400 block font-sans uppercase font-bold">Target:</span>
                                              <span className="text-slate-400 line-through">{row.previousData?.targetIqroLevel || '-'}</span>
                                              <span className="text-emerald-600 font-bold ml-1">➔ {row.newData?.targetIqroLevel || '-'}</span>
                                            </div>
                                            <div>
                                              <span className="text-[9px] text-slate-400 block font-sans uppercase font-bold">Kelulusan:</span>
                                              <span className="text-slate-400 line-through">{row.previousData?.completionStatus || '-'}</span>
                                              <span className="text-emerald-600 font-bold ml-1">➔ {row.newData?.completionStatus || '-'}</span>
                                            </div>
                                          </div>
                                        )}

                                        {/* Display support status changes */}
                                        <div className="text-[10px] text-slate-500 font-sans mt-1 bg-slate-50 p-1.5 rounded-lg border border-slate-100 flex items-center gap-1.5 w-fit">
                                          <span>Intervensi:</span>
                                          <span className="line-through text-slate-400">{getSupportStatusLabel(row.previousData?.supportStatus || 'INCOMPLETE_DATA')}</span>
                                          <span>➔</span>
                                          <span className="text-emerald-700 font-black">{getSupportStatusLabel(row.newData?.supportStatus || 'INCOMPLETE_DATA')}</span>
                                        </div>
                                      </div>
                                    )}
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

                {syncStep === 'history' && (
                  <div className="space-y-4">
                    {isLoadingLogs ? (
                      <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
                        <RefreshCw className="animate-spin text-indigo-500" size={24} />
                        <span className="text-xs font-black uppercase tracking-widest">Memuat Log Audit...</span>
                      </div>
                    ) : syncLogs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 text-slate-400 text-center bg-white rounded-3xl border border-gray-100">
                        <FileText size={40} className="text-slate-200 mb-3" />
                        <p className="text-xs font-black uppercase tracking-widest">Belum ada riwayat sinkronisasi</p>
                        <p className="text-[10px] text-slate-400 mt-1 max-w-xs leading-normal">Belum ada aktivitas sinkronisasi Google Sheet yang tercatat untuk kelas dan area terpilih.</p>
                      </div>
                    ) : (
                      <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="bg-slate-50 border-b border-gray-100 text-slate-400 uppercase tracking-wider font-black text-[9px] py-3">
                                <th className="py-3 px-4">Tanggal Sinkronisasi</th>
                                <th className="py-3 px-4">Oleh Pengguna</th>
                                <th className="py-3 px-4">Tautan Berkas & Tab</th>
                                <th className="py-3 px-4 text-center">Jumlah Baris</th>
                                <th className="py-3 px-4 text-center">Aksi Batal (Rollback)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 text-gray-700 font-medium">
                              {syncLogs.map((log) => (
                                <tr key={log.id} className="hover:bg-slate-50/20 transition-colors">
                                  <td className="py-4 px-4 font-mono font-bold text-slate-800">
                                    {new Date(log.timestamp).toLocaleString('id-ID', {
                                      dateStyle: 'medium',
                                      timeStyle: 'short'
                                    })}
                                  </td>
                                  <td className="py-4 px-4">
                                    <span className="font-bold text-slate-950 block">{log.teacherName || 'Guru SD'}</span>
                                    <span className="text-[10px] text-slate-400 block">{log.teacherEmail}</span>
                                  </td>
                                  <td className="py-4 px-4 max-w-xs truncate">
                                    <a
                                      href={log.spreadsheetUrl}
                                      target="_blank"
                                      referrerPolicy="no-referrer"
                                      className="text-indigo-600 hover:underline font-bold block truncate"
                                      title={log.spreadsheetUrl}
                                    >
                                      Buka Spreadsheet ↗
                                    </a>
                                    <span className="text-[10px] text-slate-400 block font-bold">Tab: {log.sheetName}</span>
                                  </td>
                                  <td className="py-4 px-4 text-center font-bold text-indigo-600">{log.syncedStudentIds?.length || 0} Siswa</td>
                                  <td className="py-4 px-4 text-center">
                                    {log.isRolledBack ? (
                                      <span className="px-2.5 py-1 bg-slate-100 border border-slate-200 text-slate-500 rounded-xl text-[9px] font-black uppercase tracking-wider">
                                        TELAH DI-ROLLBACK
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleRollbackSync(log.id)}
                                        disabled={isRollingBack}
                                        className="inline-flex items-center gap-1.5 bg-red-50 hover:bg-red-100 disabled:bg-slate-50 text-red-700 border border-red-200/50 px-3 py-1.5 rounded-xl text-[9px] font-black tracking-wider uppercase transition-all cursor-pointer"
                                      >
                                        <History size={10} />
                                        ROLLBACK
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CATATAN GURU DRAWER FOR MENGAJI */}
      <AnimatePresence>
        {activeNotesStudentId && (
          <div className="fixed inset-0 z-50 overflow-hidden">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveNotesStudentId(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />

            <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="w-screen max-w-md bg-white shadow-2xl flex flex-col h-full border-l border-slate-100"
              >
                {/* Drawer Header */}
                <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-[10px] font-black text-teal-600 uppercase tracking-widest mb-1">
                      <Heart size={10} className="text-teal-500 fill-teal-500/20" />
                      <span>Catatan Mengaji</span>
                      <span>•</span>
                      <span className="text-slate-900">
                        {students.find(s => s.id === activeNotesStudentId)?.name || 'Siswa'}
                      </span>
                    </div>
                    <h3 className="text-base font-black text-slate-950 uppercase tracking-wider italic">
                      Detail Catatan Guru
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveNotesStudentId(null)}
                    className="p-2 hover:bg-slate-100 rounded-xl transition-all cursor-pointer text-slate-400 hover:text-slate-600"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Drawer Body - Form */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-500 block">
                      Catatan Pengenalan Huruf
                    </label>
                    <textarea
                      rows={3}
                      value={activeNotesForm.letterRecognitionNote}
                      onChange={e => setActiveNotesForm(prev => ({ ...prev, letterRecognitionNote: e.target.value }))}
                      placeholder="Contoh: Belum konsisten membedakan huruf dzal dan za..."
                      className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 rounded-xl px-3.5 py-3 text-sm outline-none font-medium focus:ring-2 focus:ring-slate-900 transition-all resize-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-500 block">
                      Catatan Tajwid
                    </label>
                    <textarea
                      rows={3}
                      value={activeNotesForm.tajwidNote}
                      onChange={e => setActiveNotesForm(prev => ({ ...prev, tajwidNote: e.target.value }))}
                      placeholder="Contoh: Mad thobi'i dibaca terlalu panjang..."
                      className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 rounded-xl px-3.5 py-3 text-sm outline-none font-medium focus:ring-2 focus:ring-slate-900 transition-all resize-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-500 block">
                      Catatan Tambahan
                    </label>
                    <textarea
                      rows={4}
                      value={activeNotesForm.notes}
                      onChange={e => setActiveNotesForm(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="Contoh: Sangat kooperatif dan bersemangat hari ini..."
                      className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 rounded-xl px-3.5 py-3 text-sm outline-none font-medium focus:ring-2 focus:ring-slate-900 transition-all resize-none"
                    />
                  </div>
                </div>

                {/* Drawer Footer */}
                <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveNotesStudentId(null)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs uppercase font-black tracking-wider text-slate-500 hover:bg-slate-100 transition-all cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (activeNotesStudentId) {
                        applyMengajiNotes(
                          activeNotesStudentId,
                          activeNotesForm.letterRecognitionNote,
                          activeNotesForm.tajwidNote,
                          activeNotesForm.notes
                        );
                        setActiveNotesStudentId(null);
                        toast.success('Catatan berhasil diperbarui ke draf');
                      }
                    }}
                    className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs uppercase font-black tracking-wider shadow-md shadow-teal-600/10 transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <Save size={13} />
                    Simpan Catatan
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
