import * as React from 'react';
import { toast } from 'sonner';
import { 
  X, 
  FileSpreadsheet, 
  Link as LinkIcon, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle, 
  ArrowRight, 
  Save, 
  Trash2, 
  Check, 
  Search, 
  ChevronRight, 
  HelpCircle,
  Clock,
  UserCheck,
  Eye,
  SlidersHorizontal
} from 'lucide-react';
import { 
  AssessmentBookOptions, 
  JHAssessmentLO, 
  LearningGoal, 
  Student 
} from '../../../../types';
import { 
  JHSheetSourceConfig, 
  JHSheetColumnMapping, 
  JHParsedSheetRow, 
  JHSheetLevelResolution, 
  JHSheetSyncLog 
} from '../../../../types/jhSheetSync';
import { 
  extractSpreadsheetId, 
  fetchSpreadsheetMetadata, 
  fetchSheetValues, 
  detectHeaderRow, 
  proposeColumnMappings, 
  parseAndMatchSheetRows, 
  getSavedSheetSources, 
  saveSheetSource, 
  deleteSheetSource, 
  executeSheetSync,
  cleanText
} from '../../../../services/googleSheetsAssessmentService';
import { getTodayWIB, formatDateWIB, getFormativeEntries } from '../../../../services/juniorHighAssessmentBookService';
import { useAuth } from '../../../../context/AuthContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  lo: JHAssessmentLO;
  lg: LearningGoal;
  students: Student[];
  classId: string;
  subjectId: string;
  academicYear: string;
  semester: string;
  isUAMode?: boolean;
  options: AssessmentBookOptions;
  teacherId: string;
  teacherName: string;
  onSuccess: () => void;
}

export function ImportLOSheetModal(props: Props) {
  const {
    isOpen,
    onClose,
    lo,
    lg,
    students,
    classId,
    subjectId,
    academicYear,
    semester,
    isUAMode = false,
    options,
    teacherId,
    teacherName,
    onSuccess
  } = props;

  const { getGoogleSheetsToken } = useAuth();

  // Wizard Steps: 1: SUMBER -> 2: MAPPING -> 3: VALIDASI & PREVIEW
  const [step, setStep] = React.useState<1 | 2 | 3>(1);

  // Saved Sources
  const [savedSources, setSavedSources] = React.useState<JHSheetSourceConfig[]>([]);
  const [loadingSavedSources, setLoadingSavedSources] = React.useState(false);
  const [selectedSourceId, setSelectedSourceId] = React.useState<string>('');

  // Source configuration
  const [sheetUrl, setSheetUrl] = React.useState('');
  const [sourceTitle, setSourceTitle] = React.useState('');
  const [rememberSource, setRememberSource] = React.useState(true);
  const [spreadsheetTitle, setSpreadsheetTitle] = React.useState('');
  const [availableTabs, setAvailableTabs] = React.useState<string[]>([]);
  const [selectedTab, setSelectedTab] = React.useState('');
  const [headerRow, setHeaderRow] = React.useState<number>(1);
  const [rawSheetRows, setRawSheetRows] = React.useState<string[][]>([]);

  // Detected headers & mapping
  const [sheetHeaders, setSheetHeaders] = React.useState<string[]>([]);
  const [columnMapping, setColumnMapping] = React.useState<JHSheetColumnMapping>({
    studentNameColumn: '',
    comprehensionLevelColumn: ''
  });

  // Level alias overrides & student pairings
  const [customAliases, setCustomAliases] = React.useState<Record<string, JHSheetLevelResolution>>({});
  const [confirmedPairs, setConfirmedPairs] = React.useState<Record<string, string>>({});
  const [excludedNames, setExcludedNames] = React.useState<string[]>([]);

  // Session options
  const [assessmentDate, setAssessmentDate] = React.useState(getTodayWIB());
  const [defaultTask, setDefaultTask] = React.useState(options.formativeTasks[0] || 'Latihan Mandiri');
  const [defaultNextActionAchieved, setDefaultNextActionAchieved] = React.useState(options.nextActions[0] || 'Lanjut ke LO Berikutnya');
  const [defaultNextActionNotAchieved, setDefaultNextActionNotAchieved] = React.useState(options.nextActions[3] || 'Bimbingan Personal Guru');

  // Parsed rows
  const [parsedRows, setParsedRows] = React.useState<JHParsedSheetRow[]>([]);
  const [ambiguousLevels, setAmbiguousLevels] = React.useState<string[]>([]);

  // UI state
  const [loadingSheet, setLoadingSheet] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const [searchFilter, setSearchFilter] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('ALL');

  // Existing entries for diff preview
  const [existingEntriesMap, setExistingEntriesMap] = React.useState<Record<string, any>>({});
  const [loadingExisting, setLoadingExisting] = React.useState(false);

  // Load saved sources on open
  React.useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setSheetUrl('');
    setSpreadsheetTitle('');
    setAvailableTabs([]);
    setSelectedTab('');
    setRawSheetRows([]);
    setParsedRows([]);
    setSelectedSourceId('');
    setAssessmentDate(getTodayWIB());

    loadSavedSources();
    loadExistingEntries();
  }, [isOpen, lo.id, classId, subjectId, academicYear, semester]);

  const loadSavedSources = async () => {
    setLoadingSavedSources(true);
    try {
      const list = await getSavedSheetSources({
        academicYear,
        semester,
        subjectId,
        classId,
        isUAMode,
        unitActivityId: lo.unitActivityId
      });
      setSavedSources(list);
    } catch (err) {
      console.error('Failed to load saved sources:', err);
    } finally {
      setLoadingSavedSources(false);
    }
  };

  const loadExistingEntries = async () => {
    setLoadingExisting(true);
    try {
      const entries = await getFormativeEntries({
        classId,
        subjectId,
        academicYear,
        semester,
        lgId: lg.id,
        isUAMode,
        unitActivityId: lo.unitActivityId,
        unitActivityName: lo.unitActivityName,
        unitActivityCategory: lo.unitActivityCategory,
        assessmentGroupId: lo.assessmentGroupId,
        targetGrade: lo.targetGrade
      });
      const map: Record<string, any> = {};
      entries.filter(e => e.loId === lo.id).forEach(e => {
        map[`${e.studentId}|${e.date}`] = e;
      });
      setExistingEntriesMap(map);
    } catch (err) {
      console.warn('Gagal memuat entri lama:', err);
    } finally {
      setLoadingExisting(false);
    }
  };

  // When teacher selects a saved source
  const handleSelectSavedSource = async (source: JHSheetSourceConfig) => {
    setSelectedSourceId(source.id);
    setSheetUrl(source.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${source.spreadsheetId}`);
    setSourceTitle(source.title);
    setHeaderRow(source.headerRow || 1);
    setColumnMapping(source.columnMapping);
    setCustomAliases(source.levelAliases || {});
    setConfirmedPairs(source.confirmedStudentPairs || {});
    setExcludedNames(source.excludedNames || []);

    // Fetch tabs and data
    await handleFetchSheet(source.spreadsheetId, source.tabName, source.headerRow || 1, source.columnMapping, source.levelAliases, source.confirmedStudentPairs, source.excludedNames);
  };

  // Fetch sheet from URL/ID
  const handleFetchSheet = async (
    explicitId?: string, 
    tabToSelect?: string, 
    explicitHeaderRow?: number,
    explicitMapping?: JHSheetColumnMapping,
    explicitAliases?: Record<string, JHSheetLevelResolution>,
    explicitPairs?: Record<string, string>,
    explicitExcludes?: string[]
  ) => {
    const sId = explicitId || extractSpreadsheetId(sheetUrl);
    if (!sId) {
      toast.error('Format tautan atau ID Google Sheet tidak valid.');
      return;
    }

    setLoadingSheet(true);
    try {
      const token = await getGoogleSheetsToken();
      if (!token) {
        toast.error('Gagal mendapatkan izin akses Google Sheets.');
        return;
      }

      const meta = await fetchSpreadsheetMetadata(sId, token);
      setSpreadsheetTitle(meta.title);
      setAvailableTabs(meta.tabs);

      const targetTab = tabToSelect && meta.tabs.includes(tabToSelect) ? tabToSelect : meta.tabs[0];
      setSelectedTab(targetTab);

      // Fetch values for the chosen tab
      const rows = await fetchSheetValues(sId, targetTab, token);
      setRawSheetRows(rows);

      if (rows.length === 0) {
        toast.error(`Tab '${targetTab}' tidak memiliki data.`);
        return;
      }

      // Auto detect header row if not specified
      const hRow = explicitHeaderRow || detectHeaderRow(rows);
      setHeaderRow(hRow);

      const headers = rows[hRow - 1] || [];
      setSheetHeaders(headers);

      // Auto propose column mappings if not specified
      const mapping = explicitMapping || proposeColumnMappings(headers);
      setColumnMapping(mapping);

      // Process initial matching
      const result = parseAndMatchSheetRows({
        rows,
        headerRowNumber: hRow,
        mapping,
        roster: students,
        confirmedPairs: explicitPairs || confirmedPairs,
        excludedNames: explicitExcludes || excludedNames,
        customAliases: explicitAliases || customAliases
      });

      setParsedRows(result.parsedRows);
      setAmbiguousLevels(result.uniqueAmbiguousLevels);

      if (!sourceTitle) {
        setSourceTitle(`${meta.title} - ${targetTab}`);
      }

      toast.success(`Berhasil memuat ${result.parsedRows.length} baris dari tab '${targetTab}'.`);
      setStep(2);
    } catch (err: any) {
      toast.error(err.message || 'Gagal membaca spreadsheet');
    } finally {
      setLoadingSheet(false);
    }
  };

  // Re-parse when tab or header row changes
  const handleTabChange = async (tabName: string) => {
    setSelectedTab(tabName);
    const sId = extractSpreadsheetId(sheetUrl);
    if (!sId) return;

    setLoadingSheet(true);
    try {
      const token = await getGoogleSheetsToken();
      if (!token) return;
      const rows = await fetchSheetValues(sId, tabName, token);
      setRawSheetRows(rows);

      const hRow = detectHeaderRow(rows);
      setHeaderRow(hRow);
      const headers = rows[hRow - 1] || [];
      setSheetHeaders(headers);
      const mapping = proposeColumnMappings(headers);
      setColumnMapping(mapping);

      const result = parseAndMatchSheetRows({
        rows,
        headerRowNumber: hRow,
        mapping,
        roster: students,
        confirmedPairs,
        excludedNames,
        customAliases
      });
      setParsedRows(result.parsedRows);
      setAmbiguousLevels(result.uniqueAmbiguousLevels);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoadingSheet(false);
    }
  };

  const handleHeaderRowChange = (newRowNumber: number) => {
    setHeaderRow(newRowNumber);
    if (newRowNumber > 0 && newRowNumber <= rawSheetRows.length) {
      const headers = rawSheetRows[newRowNumber - 1] || [];
      setSheetHeaders(headers);
      const mapping = proposeColumnMappings(headers);
      setColumnMapping(mapping);

      const result = parseAndMatchSheetRows({
        rows: rawSheetRows,
        headerRowNumber: newRowNumber,
        mapping,
        roster: students,
        confirmedPairs,
        excludedNames,
        customAliases
      });
      setParsedRows(result.parsedRows);
      setAmbiguousLevels(result.uniqueAmbiguousLevels);
    }
  };

  const handleUpdateMapping = (field: keyof JHSheetColumnMapping, value: string) => {
    const updated = { ...columnMapping, [field]: value };
    setColumnMapping(updated);
    const result = parseAndMatchSheetRows({
      rows: rawSheetRows,
      headerRowNumber: headerRow,
      mapping: updated,
      roster: students,
      confirmedPairs,
      excludedNames,
      customAliases
    });
    setParsedRows(result.parsedRows);
    setAmbiguousLevels(result.uniqueAmbiguousLevels);
  };

  const handleSetCustomAlias = (rawVal: string, resolution: JHSheetLevelResolution) => {
    const updated = { ...customAliases, [rawVal.toLowerCase().trim()]: resolution };
    setCustomAliases(updated);
    const result = parseAndMatchSheetRows({
      rows: rawSheetRows,
      headerRowNumber: headerRow,
      mapping: columnMapping,
      roster: students,
      confirmedPairs,
      excludedNames,
      customAliases: updated
    });
    setParsedRows(result.parsedRows);
    setAmbiguousLevels(result.uniqueAmbiguousLevels);
  };

  const handleManualPairStudent = (rowNumber: number, studentId: string, persistPair: boolean) => {
    const row = parsedRows.find(r => r.rowNumber === rowNumber);
    if (!row) return;

    const chosenStudent = students.find(s => s.id === studentId);
    if (!chosenStudent) return;

    const cleanSheetName = cleanText(row.sheetName);
    let updatedPairs = { ...confirmedPairs };
    if (persistPair) {
      updatedPairs[cleanSheetName] = studentId;
      setConfirmedPairs(updatedPairs);
    }

    setParsedRows(prev => prev.map(r => {
      if (r.rowNumber === rowNumber) {
        return {
          ...r,
          matchStatus: 'CONFIRMED_MATCH',
          matchedStudentId: chosenStudent.id,
          matchedStudentName: chosenStudent.name,
          matchedStudentNIS: (chosenStudent as any).nis || chosenStudent.nisn,
          matchedStudentClass: (chosenStudent as any).className || chosenStudent.classId,
          manualOverrideStudentId: chosenStudent.id,
          validationError: undefined
        };
      }
      return r;
    }));
  };

  const handleToggleExcludeRow = (rowNumber: number) => {
    setParsedRows(prev => prev.map(r => {
      if (r.rowNumber === rowNumber) {
        const nextExcluded = !r.isExcluded;
        const cleanName = cleanText(r.sheetName);
        if (nextExcluded) {
          setExcludedNames(curr => [...new Set([...curr, cleanName])]);
        } else {
          setExcludedNames(curr => curr.filter(n => n !== cleanName));
        }
        return {
          ...r,
          isExcluded: nextExcluded,
          matchStatus: nextExcluded ? 'EXCLUDED' : (r.matchedStudentId ? 'EXACT_MATCH' : 'UNMATCHED'),
          validationError: undefined
        };
      }
      return r;
    }));
  };

  const handleDeleteSavedSource = async (sourceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Hapus konfigurasi spreadsheet tersimpan ini?')) return;
    try {
      await deleteSheetSource(sourceId);
      toast.success('Konfigurasi spreadsheet dihapus.');
      setSavedSources(prev => prev.filter(s => s.id !== sourceId));
      if (selectedSourceId === sourceId) {
        setSelectedSourceId('');
      }
    } catch (err) {
      toast.error('Gagal menghapus konfigurasi');
    }
  };

  // Sync execution
  const handleExecuteSync = async () => {
    // 1. Validation check
    const blockingRows = parsedRows.filter(r => 
      !r.isExcluded && (
        r.matchStatus === 'UNMATCHED' || 
        r.matchStatus === 'AMBIGUOUS' || 
        r.matchStatus === 'DUPLICATE' ||
        r.normalizedLevel === 'AMBIGUOUS'
      )
    );

    if (blockingRows.length > 0) {
      toast.error(`Ada ${blockingRows.length} baris dengan nama ambigu/tak cocok atau nilai belum dipetakan. Perbaiki atau centang "Lewati" sebelum sinkronisasi.`);
      return;
    }

    const sId = extractSpreadsheetId(sheetUrl);
    if (!sId) {
      toast.error('Spreadsheet ID tidak valid.');
      return;
    }

    setSyncing(true);
    try {
      // Save source configuration if checked
      let sourceConfigId = selectedSourceId;
      if (rememberSource) {
        sourceConfigId = await saveSheetSource({
          id: selectedSourceId || undefined,
          title: sourceTitle || spreadsheetTitle || 'Sumber Sheet Formatif',
          spreadsheetUrl: sheetUrl,
          spreadsheetId: sId,
          tabName: selectedTab,
          headerRow,
          academicYear,
          semester,
          subjectId,
          classId,
          isUAMode,
          unitActivityId: lo.unitActivityId,
          unitActivityName: lo.unitActivityName,
          unitActivityCategory: lo.unitActivityCategory,
          loId: lo.id,
          lgId: lg.id,
          columnMapping,
          levelAliases: customAliases,
          confirmedStudentPairs: confirmedPairs,
          excludedNames,
          createdBy: teacherId,
          createdByName: teacherName
        });
      }

      const activeSourceConfig: JHSheetSourceConfig = {
        id: sourceConfigId,
        title: sourceTitle || spreadsheetTitle || 'Sumber Sheet Formatif',
        spreadsheetUrl: sheetUrl,
        spreadsheetId: sId,
        tabName: selectedTab,
        headerRow,
        academicYear,
        semester,
        subjectId,
        classId,
        isUAMode,
        unitActivityId: lo.unitActivityId,
        unitActivityName: lo.unitActivityName,
        unitActivityCategory: lo.unitActivityCategory,
        loId: lo.id,
        lgId: lg.id,
        columnMapping,
        levelAliases: customAliases,
        confirmedStudentPairs: confirmedPairs,
        excludedNames,
        createdBy: teacherId,
        createdByName: teacherName,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      const result = await executeSheetSync({
        sourceConfig: activeSourceConfig,
        targetLO: lo,
        targetLGId: lg.id,
        classId,
        subjectId,
        academicYear,
        semester,
        assessmentDate,
        defaultTask,
        defaultNextActionAchieved,
        defaultNextActionNotAchieved,
        parsedRows,
        teacherId,
        teacherName,
        isUAMode
      });

      toast.success(
        `Sinkronisasi berhasil! Baru: ${result.stats.createdCount}, Koreksi: ${result.stats.updatedCount}, Tidak Berubah: ${result.stats.unchangedCount}, Dilewati: ${result.stats.skippedCount}`
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Gagal melakukan sinkronisasi data');
    } finally {
      setSyncing(false);
    }
  };

  // Filtered rows for UI
  const filteredRows = parsedRows.filter(r => {
    const textMatch = 
      r.sheetName.toLowerCase().includes(searchFilter.toLowerCase()) ||
      (r.matchedStudentName && r.matchedStudentName.toLowerCase().includes(searchFilter.toLowerCase())) ||
      (r.sheetNIS && r.sheetNIS.includes(searchFilter)) ||
      (r.sheetClass && r.sheetClass.toLowerCase().includes(searchFilter.toLowerCase()));

    if (!textMatch) return false;

    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'READY') return !r.isExcluded && (r.matchStatus === 'EXACT_MATCH' || r.matchStatus === 'CONFIRMED_MATCH') && r.normalizedLevel !== 'AMBIGUOUS';
    if (statusFilter === 'ATTENTION') return !r.isExcluded && (r.matchStatus === 'AMBIGUOUS' || r.matchStatus === 'UNMATCHED' || r.matchStatus === 'DUPLICATE' || r.normalizedLevel === 'AMBIGUOUS');
    if (statusFilter === 'EXCLUDED') return r.isExcluded;
    return true;
  });

  // Calculate statistics
  const totalCount = parsedRows.length;
  const readyCount = parsedRows.filter(r => !r.isExcluded && (r.matchStatus === 'EXACT_MATCH' || r.matchStatus === 'CONFIRMED_MATCH') && r.normalizedLevel !== 'AMBIGUOUS').length;
  const attentionCount = parsedRows.filter(r => !r.isExcluded && (r.matchStatus === 'AMBIGUOUS' || r.matchStatus === 'UNMATCHED' || r.matchStatus === 'DUPLICATE' || r.normalizedLevel === 'AMBIGUOUS')).length;
  const excludedCount = parsedRows.filter(r => r.isExcluded).length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* MODAL HEADER */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <FileSpreadsheet size={18} />
              </span>
              <h2 className="text-base sm:text-lg font-bold truncate">
                Ambil dari Google Sheet ke LO
              </h2>
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-500/30 text-purple-200 border border-purple-400/30">
                {lo.code}
              </span>
            </div>
            <p className="text-xs text-purple-100/90 font-medium line-clamp-1">
              {lo.title}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-purple-200/80">
              <span>LG: <strong className="text-white">{lg.code}</strong></span>
              <span>•</span>
              <span>Konteks: <strong className="text-white">{isUAMode ? `Unit Aktivitas (${lo.unitActivityName})` : `Kelas ${classId}`}</strong></span>
              <span>•</span>
              <span>Periode: <strong className="text-white">{academicYear} Sem {semester}</strong></span>
              <span>•</span>
              <span>Total Roster: <strong className="text-white">{students.length} siswa</strong></span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-purple-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* STEPPER BAR */}
        <div className="bg-slate-50 border-b border-slate-200 px-5 py-2.5 flex items-center justify-between text-xs font-semibold">
          <div className="flex items-center gap-2 sm:gap-4 overflow-x-auto">
            <button
              type="button"
              onClick={() => setStep(1)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                step === 1 
                  ? 'bg-purple-600 text-white shadow-xs' 
                  : 'text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px]">1</span>
              <span>Pilih Sumber Sheet</span>
            </button>
            <ChevronRight size={14} className="text-slate-400 shrink-0" />
            <button
              type="button"
              onClick={() => rawSheetRows.length > 0 && setStep(2)}
              disabled={rawSheetRows.length === 0}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all ${
                rawSheetRows.length === 0 ? 'opacity-50 cursor-not-allowed text-slate-400' : 'cursor-pointer'
              } ${
                step === 2 
                  ? 'bg-purple-600 text-white shadow-xs' 
                  : 'text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px]">2</span>
              <span>Pemetaan Kolom & Sesi</span>
            </button>
            <ChevronRight size={14} className="text-slate-400 shrink-0" />
            <button
              type="button"
              onClick={() => parsedRows.length > 0 && setStep(3)}
              disabled={parsedRows.length === 0}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all ${
                parsedRows.length === 0 ? 'opacity-50 cursor-not-allowed text-slate-400' : 'cursor-pointer'
              } ${
                step === 3 
                  ? 'bg-purple-600 text-white shadow-xs' 
                  : 'text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px]">3</span>
              <span>Validasi Siswa & Sinkronisasi</span>
            </button>
          </div>

          <div className="hidden md:flex items-center gap-1 text-[11px] text-slate-500">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1"></span>
            Sinkronisasi satu arah dipicu guru
          </div>
        </div>

        {/* MODAL BODY */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/40">
          {/* ================= STEP 1: PILIH SUMBER ================= */}
          {step === 1 && (
            <div className="space-y-6">
              {/* SAVED SOURCES FOR THIS CONTEXT */}
              {savedSources.length > 0 && (
                <div className="bg-white p-4 rounded-xl border border-purple-100 shadow-2xs">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center justify-between">
                    <span>Sumber Spreadsheet Tersimpan ({savedSources.length})</span>
                    <span className="text-[11px] font-normal text-slate-500">Dapat dipakai ulang untuk LO ini</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {savedSources.map(s => (
                      <div
                        key={s.id}
                        onClick={() => handleSelectSavedSource(s)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                          selectedSourceId === s.id
                            ? 'bg-purple-50/70 border-purple-400 ring-2 ring-purple-300'
                            : 'bg-slate-50/80 hover:bg-slate-100 border-slate-200'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-xs text-slate-900 truncate">
                            {s.title}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate mt-0.5">
                            Tab: <strong className="text-slate-700">{s.tabName}</strong> · Kolom Nama: {s.columnMapping.studentNameColumn}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-1">
                            Diperbarui: {new Date(s.updatedAt).toLocaleDateString('id-ID')} oleh {s.createdByName || 'Guru'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={e => handleDeleteSavedSource(s.id, e)}
                            className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Hapus sumber tersimpan"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* INPUT LINK / SPREADSHEET URL */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <LinkIcon size={16} className="text-purple-600" />
                    Masukkan Tautan Google Spreadsheet
                  </h3>
                  <span className="text-xs text-slate-500">Izin baca: spreadsheets.readonly</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tautan Lengkap atau ID Spreadsheet
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={sheetUrl}
                      onChange={e => setSheetUrl(e.target.value)}
                      placeholder="Contoh: https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit..."
                      className="flex-1 px-3.5 py-2.5 text-xs border border-slate-300 rounded-xl bg-white hover:border-slate-400 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                    />
                    <button
                      type="button"
                      disabled={loadingSheet || !sheetUrl.trim()}
                      onClick={() => handleFetchSheet()}
                      className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold text-xs flex items-center gap-2 cursor-pointer shadow-xs active:scale-95 transition-all"
                    >
                      {loadingSheet ? <RefreshCw size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                      Baca Spreadsheet
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    Tips: Pastikan spreadsheet dapat diakses oleh akun Google Anda. Tidak ada data yang langsung tersimpan saat membaca spreadsheet.
                  </p>
                </div>

                {spreadsheetTitle && (
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                        <CheckCircle2 size={15} className="text-emerald-600" />
                        Terhubung: {spreadsheetTitle}
                      </p>
                      <p className="text-[11px] text-emerald-700 mt-0.5">
                        Ditemukan {availableTabs.length} tab lembar kerja.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-2xs cursor-pointer flex items-center gap-1"
                    >
                      Lanjut ke Pemetaan Kolom <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================= STEP 2: PEMETAAN KOLOM & PENGATURAN ================= */}
          {step === 2 && (
            <div className="space-y-6">
              {/* TAB & HEADER SELECTION */}
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Pilih Tab / Lembar Kerja
                  </label>
                  <select
                    value={selectedTab}
                    onChange={e => handleTabChange(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-purple-500"
                  >
                    {availableTabs.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Baris Judul Kolom (Header)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={headerRow}
                      onChange={e => handleHeaderRowChange(Number(e.target.value) || 1)}
                      className="w-24 px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-purple-500"
                    />
                    <span className="text-[11px] text-slate-500">
                      Baris data dimulai dari baris #{headerRow + 1}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Beri Nama Konfigurasi Sumber
                  </label>
                  <input
                    type="text"
                    value={sourceTitle}
                    onChange={e => setSourceTitle(e.target.value)}
                    placeholder="Contoh: Formatif Pekan 3 - Grade 7"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              {/* COLUMN MAPPING */}
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center justify-between">
                  <span>Pemetaan Kolom Spreadsheet</span>
                  <span className="text-[11px] font-normal text-purple-700">
                    * Wajib diisi agar data siswa dan capaian terbaca
                  </span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
                  {/* Student Name */}
                  <div className="p-3 bg-purple-50/50 rounded-xl border border-purple-200">
                    <label className="block text-xs font-bold text-purple-900 mb-1">
                      Nama Siswa <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={columnMapping.studentNameColumn}
                      onChange={e => handleUpdateMapping('studentNameColumn', e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs border border-purple-300 rounded-lg bg-white focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">-- Pilih Kolom --</option>
                      {sheetHeaders.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  {/* Comprehension Level */}
                  <div className="p-3 bg-purple-50/50 rounded-xl border border-purple-200">
                    <label className="block text-xs font-bold text-purple-900 mb-1">
                      Nilai Capaian LO <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={columnMapping.comprehensionLevelColumn}
                      onChange={e => handleUpdateMapping('comprehensionLevelColumn', e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs border border-purple-300 rounded-lg bg-white focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">-- Pilih Kolom --</option>
                      {sheetHeaders.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  {/* NIS / NISN */}
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      NIS / NISN (Opsional)
                    </label>
                    <select
                      value={columnMapping.nisColumn || ''}
                      onChange={e => handleUpdateMapping('nisColumn', e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">-- Tidak Dipetakan --</option>
                      {sheetHeaders.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  {/* Class Column */}
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Kelas Siswa (Opsional)
                    </label>
                    <select
                      value={columnMapping.classColumn || ''}
                      onChange={e => handleUpdateMapping('classColumn', e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">-- Tidak Dipetakan --</option>
                      {sheetHeaders.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  {/* Formative Task Column */}
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Kolom Tugas Formatif (Opsional)
                    </label>
                    <select
                      value={columnMapping.formativeTaskColumn || ''}
                      onChange={e => handleUpdateMapping('formativeTaskColumn', e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">-- Gunakan Input Default --</option>
                      {sheetHeaders.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  {/* Next Action Column */}
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Kolom Tindak Lanjut (Opsional)
                    </label>
                    <select
                      value={columnMapping.nextActionColumn || ''}
                      onChange={e => handleUpdateMapping('nextActionColumn', e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">-- Gunakan Input Default --</option>
                      {sheetHeaders.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  {/* Date Column */}
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Kolom Tanggal (Opsional)
                    </label>
                    <select
                      value={columnMapping.dateColumn || ''}
                      onChange={e => handleUpdateMapping('dateColumn', e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">-- Gunakan Tanggal Sesi --</option>
                      {sheetHeaders.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* SESI ASESMEN & DEFAULT VALUES */}
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Pengaturan Sesi & Tindak Lanjut
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Tanggal Asesmen Sesi
                    </label>
                    <input
                      type="date"
                      value={assessmentDate}
                      onChange={e => setAssessmentDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-purple-500"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      {formatDateWIB(assessmentDate)}
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Tugas Formatif Default
                    </label>
                    <input
                      type="text"
                      value={defaultTask}
                      onChange={e => setDefaultTask(e.target.value)}
                      placeholder="Contoh: Lembar Kerja (LKPD)"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Tindak Lanjut jika Achieved
                    </label>
                    <input
                      type="text"
                      value={defaultNextActionAchieved}
                      onChange={e => setDefaultNextActionAchieved(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Tindak Lanjut jika Not Achieved
                    </label>
                    <input
                      type="text"
                      value={defaultNextActionNotAchieved}
                      onChange={e => setDefaultNextActionNotAchieved(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
              </div>

              {/* AMBIGUOUS LEVEL RESOLUTION (IF ANY) */}
              {ambiguousLevels.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl shadow-xs space-y-3">
                  <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                    <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                    <span>Ditemukan nilai capaian ambigu/tak standar pada sheet:</span>
                  </div>
                  <p className="text-[11px] text-amber-800">
                    Nilai berikut tidak cocok secara otomatis dengan standar Achieved/Not Achieved. Tentukan pemetaan makna nilai tersebut:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {ambiguousLevels.map(rawVal => (
                      <div key={rawVal} className="p-2.5 bg-white rounded-xl border border-amber-200 flex items-center justify-between gap-2">
                        <span className="font-mono font-bold text-xs text-amber-950 px-2 py-1 bg-amber-100 rounded">
                          "{rawVal}"
                        </span>
                        <select
                          value={customAliases[rawVal] || ''}
                          onChange={e => handleSetCustomAlias(rawVal, e.target.value as any)}
                          className="px-2 py-1 text-xs border border-amber-300 rounded-lg bg-white focus:ring-2 focus:ring-amber-500"
                        >
                          <option value="">-- Pilih Pemetaan --</option>
                          <option value="Achieved">Achieved (Tercapai)</option>
                          <option value="Not Achieved">Not Achieved (Belum)</option>
                          <option value="SKIP">Lewati (Jangan Dinilai)</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* PROCEED TO STEP 3 */}
              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Kembali ke Sumber
                </button>
                <button
                  type="button"
                  disabled={!columnMapping.studentNameColumn || !columnMapping.comprehensionLevelColumn}
                  onClick={() => setStep(3)}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                >
                  Lanjut ke Validasi Siswa ({parsedRows.length} baris) <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* ================= STEP 3: VALIDASI SISWA & SINKRONISASI ================= */}
          {step === 3 && (
            <div className="space-y-4">
              {/* STATS TILES */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div 
                  onClick={() => setStatusFilter('ALL')}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    statusFilter === 'ALL' ? 'bg-purple-50 border-purple-400 ring-2 ring-purple-300' : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <p className="text-[10px] font-bold text-slate-500 uppercase">Total Baris Data</p>
                  <p className="text-lg font-black text-slate-800">{totalCount}</p>
                  <p className="text-[10px] text-slate-400">Dari lembar Sheet</p>
                </div>

                <div 
                  onClick={() => setStatusFilter('READY')}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    statusFilter === 'READY' ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-300' : 'bg-white border-slate-200 hover:bg-emerald-50/50'
                  }`}
                >
                  <p className="text-[10px] font-bold text-emerald-700 uppercase">Siap Disinkronkan</p>
                  <p className="text-lg font-black text-emerald-700">{readyCount}</p>
                  <p className="text-[10px] text-emerald-600">Siswa & nilai valid</p>
                </div>

                <div 
                  onClick={() => setStatusFilter('ATTENTION')}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    statusFilter === 'ATTENTION' ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-300' : 'bg-white border-slate-200 hover:bg-amber-50/50'
                  }`}
                >
                  <p className="text-[10px] font-bold text-amber-700 uppercase">Perlu Tindakan Guru</p>
                  <p className="text-lg font-black text-amber-700">{attentionCount}</p>
                  <p className="text-[10px] text-amber-600">Ambigu, tak cocok, duplikat</p>
                </div>

                <div 
                  onClick={() => setStatusFilter('EXCLUDED')}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    statusFilter === 'EXCLUDED' ? 'bg-slate-200 border-slate-400 ring-2 ring-slate-300' : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <p className="text-[10px] font-bold text-slate-500 uppercase">Dilewati / Diabaikan</p>
                  <p className="text-lg font-black text-slate-600">{excludedCount}</p>
                  <p className="text-[10px] text-slate-400">Tidak ditulis ke rapor</p>
                </div>
              </div>

              {/* SEARCH & FILTERS */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                <div className="relative flex-1 min-w-[200px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={e => setSearchFilter(e.target.value)}
                    placeholder="Cari nama siswa di sheet atau nama resmi..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-medium">Filter Status:</span>
                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="ALL">Semua Baris ({totalCount})</option>
                    <option value="READY">Siap ({readyCount})</option>
                    <option value="ATTENTION">Perlu Tindakan ({attentionCount})</option>
                    <option value="EXCLUDED">Dilewati ({excludedCount})</option>
                  </select>
                </div>
              </div>

              {/* ATTENTION WARNING IF BLOCKING */}
              {attentionCount > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl flex items-start gap-2.5 text-amber-900 text-xs">
                  <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block font-bold">
                      Terdapat {attentionCount} baris yang memerlukan konfirmasi Anda.
                    </strong>
                    <span>
                      Sistem tidak pernah otomatis menebak nama yang ambigu atau tak ditemukan. Pilih pasangan siswa resmi yang benar melalui menu dropdown, atau klik tombol <strong>"Lewati"</strong> pada baris tersebut.
                    </span>
                  </div>
                </div>
              )}

              {/* ROWS TABLE */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="overflow-x-auto max-h-[46vh]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50/90 sticky top-0 z-10 border-b border-slate-200 text-slate-700">
                      <tr>
                        <th className="p-2.5 w-12 text-center font-bold">#Baris</th>
                        <th className="p-2.5 font-bold min-w-[160px]">Nama di Google Sheet</th>
                        <th className="p-2.5 font-bold w-24">Nilai Sheet</th>
                        <th className="p-2.5 font-bold min-w-[200px]">Pasangan Siswa Resmi (LUMINA)</th>
                        <th className="p-2.5 font-bold w-28">Status & Diff</th>
                        <th className="p-2.5 font-bold w-24 text-center">Aksi Baris</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRows.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-slate-400">
                            Tidak ada baris yang sesuai dengan filter pencarian.
                          </td>
                        </tr>
                      ) : (
                        filteredRows.map(row => {
                          const existingForStudent = row.matchedStudentId 
                            ? existingEntriesMap[`${row.matchedStudentId}|${row.rawDate || assessmentDate}`]
                            : undefined;

                          const isDiff = existingForStudent && existingForStudent.comprehensionLevel !== row.normalizedLevel;
                          const isSame = existingForStudent && existingForStudent.comprehensionLevel === row.normalizedLevel;

                          return (
                            <tr 
                              key={row.rowNumber}
                              className={`transition-colors ${
                                row.isExcluded 
                                  ? 'bg-slate-100/60 opacity-60 text-slate-400'
                                  : row.matchStatus === 'AMBIGUOUS' || row.matchStatus === 'UNMATCHED' || row.matchStatus === 'DUPLICATE'
                                  ? 'bg-amber-50/40 hover:bg-amber-50/80'
                                  : 'hover:bg-slate-50/80'
                              }`}
                            >
                              <td className="p-2.5 text-center font-mono text-slate-400 align-middle">
                                {row.rowNumber}
                              </td>

                              <td className="p-2.5 align-middle">
                                <span className="font-semibold text-slate-900 block">
                                  {row.sheetName}
                                </span>
                                {(row.sheetNIS || row.sheetClass) && (
                                  <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">
                                    {row.sheetClass ? `Kelas ${row.sheetClass} · ` : ''}NIS: {row.sheetNIS || '-'}
                                  </span>
                                )}
                              </td>

                              <td className="p-2.5 align-middle font-mono">
                                <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                                  row.normalizedLevel === 'Achieved' 
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : row.normalizedLevel === 'Not Achieved'
                                    ? 'bg-red-100 text-red-800'
                                    : row.normalizedLevel === 'UNASSESSED'
                                    ? 'bg-slate-100 text-slate-500'
                                    : 'bg-amber-100 text-amber-900'
                                }`}>
                                  {row.rawLevel || '(Kosong)'}
                                </span>
                              </td>

                              <td className="p-2.5 align-middle">
                                {row.isExcluded ? (
                                  <span className="italic text-slate-400 text-[11px]">Dilewati oleh guru</span>
                                ) : (
                                  <div className="space-y-1">
                                    <select
                                      value={row.manualOverrideStudentId || row.matchedStudentId || ''}
                                      onChange={e => handleManualPairStudent(row.rowNumber, e.target.value, true)}
                                      className={`w-full px-2 py-1 text-xs border rounded-lg bg-white ${
                                        row.matchStatus === 'EXACT_MATCH' || row.matchStatus === 'CONFIRMED_MATCH'
                                          ? 'border-emerald-300 text-emerald-950 font-medium'
                                          : 'border-amber-400 text-amber-950 bg-amber-50/40'
                                      }`}
                                    >
                                      <option value="">-- Pilih Siswa Resmi --</option>
                                      {students.map(st => (
                                        <option key={st.id} value={st.id}>
                                          {st.name} ({st.nisn || (st as any).nis || st.id})
                                        </option>
                                      ))}
                                    </select>

                                    {row.candidateStudents && row.candidateStudents.length > 0 && !row.matchedStudentId && (
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        <span className="text-[10px] text-slate-400">Usulan:</span>
                                        {row.candidateStudents.map(cand => (
                                          <button
                                            key={cand.id}
                                            type="button"
                                            onClick={() => handleManualPairStudent(row.rowNumber, cand.id, true)}
                                            className="px-1.5 py-0.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 text-[10px] font-semibold transition-colors"
                                          >
                                            {cand.name} ({Math.round(cand.confidence * 100)}%)
                                          </button>
                                        ))}
                                      </div>
                                    )}

                                    {row.validationError && (
                                      <p className="text-[10px] text-red-600 font-medium mt-0.5">
                                        {row.validationError}
                                      </p>
                                    )}
                                  </div>
                                )}
                              </td>

                              <td className="p-2.5 align-middle">
                                {row.isExcluded ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-600">
                                    Dilewati
                                  </span>
                                ) : isDiff ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800" title={`Sebelumnya: ${existingForStudent.comprehensionLevel} -> Baru: ${row.normalizedLevel}`}>
                                    Koreksi Nilai
                                  </span>
                                ) : isSame ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                                    Sama (Tidak Berubah)
                                  </span>
                                ) : row.matchedStudentId && row.normalizedLevel !== 'UNASSESSED' && row.normalizedLevel !== 'AMBIGUOUS' ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                    Baru
                                  </span>
                                ) : row.normalizedLevel === 'UNASSESSED' ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500">
                                    Tetap Kosong
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800">
                                    Belum Valid
                                  </span>
                                )}
                              </td>

                              <td className="p-2.5 text-center align-middle">
                                <button
                                  type="button"
                                  onClick={() => handleToggleExcludeRow(row.rowNumber)}
                                  className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                                    row.isExcluded
                                      ? 'bg-purple-100 text-purple-800 hover:bg-purple-200'
                                      : 'bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-700'
                                  }`}
                                >
                                  {row.isExcluded ? 'Pulihkan' : 'Lewati'}
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* BOTTOM ACTION BAR */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberSource}
                      onChange={e => setRememberSource(e.target.checked)}
                      className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                    />
                    <span>Ingat tautan, tab, mapping, dan pencocokan nama untuk LO ini</span>
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
                  >
                    Ubah Pemetaan Kolom
                  </button>
                  <button
                    type="button"
                    disabled={syncing || attentionCount > 0}
                    onClick={handleExecuteSync}
                    className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold shadow-md inline-flex items-center gap-2 cursor-pointer active:scale-95 transition-all"
                  >
                    {syncing ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        <span>Menyimpan ke Firestore...</span>
                      </>
                    ) : (
                      <>
                        <Check size={14} />
                        <span>Sinkronkan ke Rapor ({readyCount} Siswa)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
