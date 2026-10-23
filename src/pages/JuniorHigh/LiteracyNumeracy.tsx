import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, Languages, Heart, BookMarked, Calculator, Search, 
  History, Save, Calendar, RefreshCw, AlertCircle, FileText, X, HelpCircle, Info,
  Plus, Target, ShieldCheck, Check, Trash2, Sparkles, AlertTriangle
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { getClasses, getActiveStudents, getStudents } from '../../lib/firebase';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { toast } from 'sonner';
import { ACADEMIC_YEARS } from '../../constants';
import JuniorHighLiteracyOverview from './components/JuniorHighLiteracyOverview';
import { juniorHighLiteracyService } from '../../services/juniorHighLiteracyService';
import { isTeacherAssignedToClass } from '../../services/classTeacherAssignmentService';
import { 
  getOralReadingFluencyRiskLevel,
  isJuniorHighOrfGrade,
  parseGradeFromClassName,
  OralReadingRiskLevel,
  JuniorHighOrfGrade,
  isOralReadingFluencyRiskApplicable
} from '../../config/oralReadingFluencyRiskThresholds';
import { 
  JuniorHighArea, 
  JuniorHighSessionKey, 
  JuniorHighProgressRecord,
  LitnumCustomColumn,
  LitnumCellValue,
  LpuSubjectReference
} from '../../types/juniorHighLiteracyNumeracy';
import { 
  calculateWpm, 
  getAreaLabel, 
  getPeriodLabel 
} from '../../constants/juniorHighLiteracyBenchmarks';
import {
  CANONICAL_MENGAJI_OPTIONS,
  CANONICAL_NUMERASI_OPTIONS,
  normalizeMengajiLevel,
  normalizeNumerasiLevel,
  formatMengajiDisplay,
  formatNumerasiDisplay
} from '../../utils/litnumLevelNormalizer';

// Selection lists in theme palette for SMP
export interface JuniorHighAreaConfig {
  id: JuniorHighArea;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  primaryColor: string;
  primaryBg: string;
  primaryBgHover: string;
  softBg: string;
  softBgHover: string;
  borderActive: string;
  borderSoft: string;
  focusRing: string;
  textDark: string;
  textPrimary: string;
  saveButtonActive: string;
  headingBadge: string;
}

export const JUNIOR_HIGH_AREA_CONFIGS: Record<JuniorHighArea, JuniorHighAreaConfig> = {
  BAHASA_INDONESIA: {
    id: 'BAHASA_INDONESIA',
    label: 'Bahasa Indonesia',
    icon: BookOpen,
    primaryColor: 'text-blue-600',
    primaryBg: 'bg-blue-600',
    primaryBgHover: 'bg-blue-700',
    softBg: 'bg-blue-50',
    softBgHover: 'hover:bg-blue-100',
    borderActive: 'border-blue-500',
    borderSoft: 'border-blue-200',
    focusRing: 'focus:ring-blue-600 focus:border-blue-500',
    textDark: 'text-blue-900',
    textPrimary: 'text-blue-600',
    saveButtonActive: 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/10 focus:ring-blue-500',
    headingBadge: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  ENGLISH_READING: {
    id: 'ENGLISH_READING',
    label: 'English Reading',
    icon: Languages,
    primaryColor: 'text-violet-600',
    primaryBg: 'bg-violet-600',
    primaryBgHover: 'bg-violet-700',
    softBg: 'bg-violet-50',
    softBgHover: 'hover:bg-violet-100',
    borderActive: 'border-violet-500',
    borderSoft: 'border-violet-200',
    focusRing: 'focus:ring-violet-600 focus:border-violet-500',
    textDark: 'text-violet-900',
    textPrimary: 'text-violet-600',
    saveButtonActive: 'bg-violet-600 hover:bg-violet-700 text-white shadow-violet-500/10 focus:ring-violet-500',
    headingBadge: 'bg-violet-50 text-violet-700 border-violet-200',
  },
  MENGAJI: {
    id: 'MENGAJI',
    label: 'Mengaji',
    icon: BookMarked,
    primaryColor: 'text-emerald-600',
    primaryBg: 'bg-emerald-600',
    primaryBgHover: 'bg-emerald-700',
    softBg: 'bg-emerald-50',
    softBgHover: 'hover:bg-emerald-100',
    borderActive: 'border-emerald-500',
    borderSoft: 'border-emerald-200',
    focusRing: 'focus:ring-emerald-600 focus:border-emerald-500',
    textDark: 'text-emerald-900',
    textPrimary: 'text-emerald-600',
    saveButtonActive: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/10 focus:ring-emerald-500',
    headingBadge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  NUMERACY: {
    id: 'NUMERACY',
    label: 'Numerasi (Math)',
    icon: Calculator,
    primaryColor: 'text-amber-700',
    primaryBg: 'bg-amber-600',
    primaryBgHover: 'bg-amber-700',
    softBg: 'bg-amber-50',
    softBgHover: 'hover:bg-amber-100',
    borderActive: 'border-amber-500',
    borderSoft: 'border-amber-200',
    focusRing: 'focus:ring-amber-600 focus:border-amber-500',
    textDark: 'text-amber-900',
    textPrimary: 'text-amber-700',
    saveButtonActive: 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-500/10 focus:ring-amber-500',
    headingBadge: 'bg-amber-50 text-amber-800 border-amber-200',
  },
};

const PERIODS: { value: JuniorHighSessionKey; label: string }[] = [
  { value: 'SEMESTER_1_START', label: 'Awal Semester 1' },
  { value: 'SEMESTER_1_END', label: 'Akhir Semester 1' },
  { value: 'SEMESTER_2_START', label: 'Awal Semester 2' },
  { value: 'SEMESTER_2_END', label: 'Akhir Semester 2' },
  { value: 'SPRING_ASSESSMENT_3', label: 'Spring Assessment 3' }
];

const BAHASA_INDONESIA_LEVELS = [
  'Perlu Pendampingan Intensif',
  'Perlu Penguatan Terarah',
  'Siap Berkembang',
  'Siap Lanjut'
];

const ENGLISH_READING_LEVELS = [
  'IR+',
  'ER',
  'ER EN'
];

const MENGAJI_LEVELS = [
  'Iqra 1',
  'Iqra 2',
  'Iqra 3',
  'Iqra 4',
  'Iqra 5',
  'Iqra 6',
  'Juz Amma',
  'Alquran'
];

const NUMERACY_LEVELS = [
  'Trailhead',
  'Ascent',
  'Ridge',
  'Summit'
];

export interface JuniorHighStudent {
  id: string; // NIS
  name: string;
  classId: string;
  className: string;
}

const renderRiskLevelBadge = (record: any, selectedPeriod: string, selectedGradeLevel: number, st: any) => {
  if (!record) {
    return (
      <span className="text-[10px] font-bold uppercase text-slate-400">
        —
      </span>
    );
  }

  const grade = record.gradeLevel || parseGradeFromClassName(st.className) || selectedGradeLevel;
  if (!grade) {
    return (
      <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase bg-slate-100 text-slate-500 border border-slate-200">
        Grade tidak tersedia
      </span>
    );
  }

  if (grade !== 7 && grade !== 8 && grade !== 9) {
    return (
      <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase bg-slate-100 text-slate-500 border border-slate-200">
        Benchmark tidak tersedia untuk grade ini.
      </span>
    );
  }

  const wpmVal = (record.wpm !== undefined && record.wpm !== null && record.wpm !== '') ? Number(record.wpm) : null;
  if (wpmVal === null) {
    return (
      <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase bg-slate-100 text-slate-500 border border-slate-200">
        Belum dinilai
      </span>
    );
  }

  const risk = record.riskLevel || getOralReadingFluencyRiskLevel(grade, wpmVal);

  if (risk === 'HIGH_RISK') {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-black uppercase bg-red-50 text-red-700 border border-red-200 shadow-sm">
        High Risk
      </span>
    );
  } else if (risk === 'MEDIUM_RISK') {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-black uppercase bg-amber-50 text-amber-700 border border-amber-200 shadow-sm">
        Medium Risk
      </span>
    );
  } else if (risk === 'LOW_RISK') {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-black uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm">
        Low Risk
      </span>
    );
  }

  return (
    <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase bg-slate-100 text-slate-500 border border-slate-200">
      Belum dinilai
    </span>
  );
};

export default function JuniorHighLiteracyNumeracy() {
  const { profile } = useAuth();
  const { activeYear } = useAcademicYear();
  
  // Filters State
  const [selectedArea, setSelectedArea] = React.useState<JuniorHighArea>('BAHASA_INDONESIA');
  const [selectedClassId, setSelectedClassId] = React.useState<string>('');
  const [selectedGradeLevel, setSelectedGradeLevel] = React.useState<number>(7);
  const [selectedYear, setSelectedYear] = React.useState<string>(activeYear || '2025/2026');
  const [selectedPeriod, setSelectedPeriod] = React.useState<JuniorHighSessionKey>('SEMESTER_1_START');
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const [activeView, setActiveView] = React.useState<'input' | 'overview'>('input');

  // Loaded students & metadata
  const [classes, setClasses] = React.useState<any[]>([]);
  const [students, setStudents] = React.useState<JuniorHighStudent[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [loadingStudents, setLoadingStudents] = React.useState<boolean>(false);
  const [isSaving, setIsSaving] = React.useState<boolean>(false);

  const activeConfig = JUNIOR_HIGH_AREA_CONFIGS[selectedArea];
  const [allLegacyRecords, setAllLegacyRecords] = React.useState<Record<string, Record<string, Partial<JuniorHighProgressRecord>>>>({});
  const [studentRecords, setStudentRecords] = React.useState<Record<string, Partial<JuniorHighProgressRecord>>>({});
  const [customColumns, setCustomColumns] = React.useState<LitnumCustomColumn[]>([]);
  const [cellValues, setCellValues] = React.useState<Record<string, LitnumCellValue>>({});
  const [activeLpuRef, setActiveLpuRef] = React.useState<LpuSubjectReference | null>(null);
  const [modifiedIds, setModifiedIds] = React.useState<Set<string>>(new Set());

  // Class History modal
  const [showHistory, setShowHistory] = React.useState<boolean>(false);
  const [historyRecords, setHistoryRecords] = React.useState<JuniorHighProgressRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = React.useState<boolean>(false);

  // Add Custom Column modal
  const [showAddColModal, setShowAddColModal] = React.useState<boolean>(false);
  const [newColTitle, setNewColTitle] = React.useState<string>('');
  const [newColDate, setNewColDate] = React.useState<string>('');
  const [newColNotes, setNewColNotes] = React.useState<string>('');
  const [isSubmittingCol, setIsSubmittingCol] = React.useState<boolean>(false);

  // Set LPU Reference modal
  const [showLpuModal, setShowLpuModal] = React.useState<boolean>(false);
  const [selectedRefSourceType, setSelectedRefSourceType] = React.useState<'SESSION' | 'CUSTOM_COLUMN'>('SESSION');
  const [selectedRefSourceId, setSelectedRefSourceId] = React.useState<string>('SEMESTER_1_START');
  const [isApplyingLpu, setIsApplyingLpu] = React.useState<boolean>(false);

  // Sync default school year
  React.useEffect(() => {
    if (activeYear) {
      setSelectedYear(activeYear);
    }
  }, [activeYear]);

  // Load Junior High classes on mount
  React.useEffect(() => {
    const loadMetadata = async () => {
      try {
        setLoading(true);
        const allClasses = await getClasses() || [];
        const juniorHighClasses = allClasses.filter(
          c => c.unitId === 'JUNIOR_HIGH' && c.status !== 'archived' && c.academicYear === activeYear
        );
        setClasses(juniorHighClasses);

        let defaultClassId = '';
        if (profile?.role === 'HOMEROOM_TEACHER' || profile?.role === 'TEACHER') {
          const homeroomClass = juniorHighClasses.find(c => isTeacherAssignedToClass(c, profile?.uid));
          if (homeroomClass) {
            defaultClassId = homeroomClass.id;
          }
        }

        if (!defaultClassId && juniorHighClasses.length > 0) {
          defaultClassId = juniorHighClasses[0].id;
        }

        setSelectedClassId(defaultClassId);
      } catch (err) {
        console.error('Error loading Junior High classes:', err);
        toast.error('Gagal memuat daftar kelas SMP');
      } finally {
        setLoading(false);
      }
    };

    if (profile) {
      loadMetadata();
    }
  }, [profile, activeYear]);

  // Parse Junior High grade level from the active class selection name
  React.useEffect(() => {
    if (selectedClassId && classes.length > 0) {
      const activeClass = classes.find(c => c.id === selectedClassId);
      if (activeClass) {
        const match = activeClass.name.match(/\d+/);
        if (match) {
          setSelectedGradeLevel(Number(match[0]));
        } else {
          setSelectedGradeLevel(7);
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
        let classStudents: JuniorHighStudent[] = [];
        const activeS = await getActiveStudents(selectedClassId, selectedYear);
        if (activeS && activeS.length > 0) {
          classStudents = activeS.map(s => ({
            id: s.id,
            name: s.name,
            classId: s.classId,
            className: classes.find(c => c.id === s.classId || (s.classId && c.name.toLowerCase() === s.classId.toLowerCase()))?.name || 'SMP'
          }));
        } else {
          const allStudents = await getStudents() || [];
          classStudents = allStudents
            .filter(s => {
              const matchesId = s.classId === selectedClassId;
              const activeClass = classes.find(c => c.id === selectedClassId);
              const matchesName = activeClass && s.classId && s.classId.toLowerCase() === activeClass.name.toLowerCase();
              return (s.unitId === 'JUNIOR_HIGH' || s.currentUnit === 'JUNIOR_HIGH') && (matchesId || matchesName);
            })
            .map(s => {
              const targetId = s.classId || selectedClassId;
              return {
                id: s.id,
                name: s.name,
                classId: targetId,
                className: classes.find(c => c.id === targetId || (targetId && c.name.toLowerCase() === targetId.toLowerCase()))?.name || 'SMP'
              };
            });
        }

        classStudents.sort((a, b) => a.name.localeCompare(b.name));
        setStudents(classStudents);

        // 2. Load legacy records, custom columns, cell values, and active LPU reference independently
        let existingRecords: JuniorHighProgressRecord[] = [];
        try {
          existingRecords = await juniorHighLiteracyService.getAllRecordsByClass(selectedYear, selectedClassId, selectedArea);
        } catch (err) {
          console.error('Error loading legacy records:', err);
          toast.error('Gagal memuat rekam jejak penilaian kelas');
        }

        let customCols: LitnumCustomColumn[] = [];
        try {
          customCols = await juniorHighLiteracyService.loadLitnumCustomColumns(selectedYear, selectedClassId, selectedArea);
        } catch (err) {
          console.warn('Error loading custom columns:', err);
        }

        let customCells: LitnumCellValue[] = [];
        try {
          customCells = await juniorHighLiteracyService.loadLitnumCellValues(selectedYear, selectedClassId, selectedArea);
        } catch (err) {
          console.warn('Error loading custom cell values:', err);
        }

        let lpuRef: LpuSubjectReference | null = null;
        try {
          lpuRef = await juniorHighLiteracyService.loadLpuSubjectReference(selectedYear, selectedClassId, selectedArea);
        } catch (err) {
          console.warn('Error loading LPU reference:', err);
        }

        // Map legacy records by studentId -> sessionKey -> record
        const legacyMap: Record<string, Record<string, Partial<JuniorHighProgressRecord>>> = {};
        const legacyBySelectedPeriod: Record<string, Partial<JuniorHighProgressRecord>> = {};

        (existingRecords || []).forEach(rec => {
          const sId = rec.studentId;
          const sKey = (rec.sessionKey || (rec as any).period) as JuniorHighSessionKey;
          if (!sId || !sKey) return;

          if (!legacyMap[sId]) {
            legacyMap[sId] = {};
          }
          legacyMap[sId][sKey] = rec;
          if (sKey === selectedPeriod) {
            legacyBySelectedPeriod[sId] = rec;
          }
        });

        // Initialize empty slots for legacy records so editors never hit undefined, NEVER overwriting existing records
        classStudents.forEach(st => {
          if (!legacyMap[st.id]) legacyMap[st.id] = {};
          PERIODS.forEach(p => {
            if (!legacyMap[st.id][p.value]) {
              legacyMap[st.id][p.value] = {
                unit: 'JUNIOR_HIGH',
                studentId: st.id,
                studentName: st.name,
                classId: selectedClassId,
                gradeLevel: selectedGradeLevel,
                schoolYear: selectedYear,
                sessionKey: p.value,
                sessionLabel: p.label,
                subjectArea: selectedArea,
                updatedBy: profile?.uid || profile?.id || 'unknown'
              };
            }
          });
        });

        setAllLegacyRecords(legacyMap);
        setStudentRecords(legacyBySelectedPeriod);

        // Map custom cell values by columnId_studentId
        const cellMap: Record<string, LitnumCellValue> = {};
        (customCells || []).forEach((cell: any) => {
          cellMap[`${cell.columnId}_${cell.studentId}`] = cell;
        });
        setCellValues(cellMap);

        setCustomColumns(customCols || []);
        setActiveLpuRef((lpuRef as LpuSubjectReference) || null);

      } catch (err) {
        console.error('Error loading Junior High class lists or data:', err);
        toast.error('Gagal mensinkronisasikan daftar peserta didik');
      } finally {
        setLoadingStudents(false);
      }
    };

    if (selectedClassId) {
      loadClassAndRecords();
    }
  }, [selectedYear, selectedGradeLevel, selectedClassId, selectedArea, selectedPeriod, classes, profile]);

  // Level options per subject area
  const getLevelOptions = React.useCallback(() => {
    if (selectedArea === 'BAHASA_INDONESIA') {
      return BAHASA_INDONESIA_LEVELS.map(lvl => ({ value: lvl, label: lvl }));
    }
    if (selectedArea === 'ENGLISH_READING') {
      return ENGLISH_READING_LEVELS.map(lvl => ({ value: lvl, label: lvl }));
    }
    if (selectedArea === 'MENGAJI') {
      return CANONICAL_MENGAJI_OPTIONS.map(opt => ({ value: opt.value, label: opt.label }));
    }
    if (selectedArea === 'NUMERACY') {
      return CANONICAL_NUMERASI_OPTIONS.map(opt => ({ value: opt.value, label: opt.label }));
    }
    return [];
  }, [selectedArea]);

  // Helper to read student level for any column (legacy session or custom column)
  const getStudentLevelForColumn = React.useCallback((
    studentId: string,
    sourceType: 'SESSION' | 'CUSTOM_COLUMN',
    sourceId: string
  ): string => {
    if (sourceType === 'SESSION') {
      const rec = allLegacyRecords[studentId]?.[sourceId];
      if (!rec) return '';
      if (selectedArea === 'BAHASA_INDONESIA' || selectedArea === 'ENGLISH_READING') {
        return rec.readingLevel || '';
      }
      if (selectedArea === 'MENGAJI') {
        return rec.mengajiLevel || rec.level || '';
      }
      if (selectedArea === 'NUMERACY') {
        return rec.numerasiLevel || rec.mathLevel || '';
      }
      return '';
    } else {
      const key = `${sourceId}_${studentId}`;
      return cellValues[key]?.level || '';
    }
  }, [allLegacyRecords, cellValues, selectedArea]);

  // Helper to format level display
  const formatLevelDisplay = React.useCallback((rawLevel: string) => {
    if (!rawLevel) return '';
    if (selectedArea === 'MENGAJI') {
      return formatMengajiDisplay(rawLevel);
    }
    if (selectedArea === 'NUMERACY') {
      return formatNumerasiDisplay(rawLevel);
    }
    return rawLevel;
  }, [selectedArea]);

  // Helper to resolve active LPU level
  const getActiveLpuLevel = React.useCallback((studentId: string): { level: string; sourceLabel: string; isFallback: boolean } => {
    if (activeLpuRef) {
      const lvl = getStudentLevelForColumn(studentId, activeLpuRef.sourceType, activeLpuRef.sourceId);
      return {
        level: lvl,
        sourceLabel: activeLpuRef.sourceLabel,
        isFallback: false
      };
    }
    // Fallback: reverse priority order
    const prioritySessions: JuniorHighSessionKey[] = [
      'SEMESTER_2_END',
      'SPRING_ASSESSMENT_3',
      'SEMESTER_2_START',
      'SEMESTER_1_END',
      'SEMESTER_1_START'
    ];
    for (const sKey of prioritySessions) {
      const lvl = getStudentLevelForColumn(studentId, 'SESSION', sKey);
      if (lvl) {
        return {
          level: lvl,
          sourceLabel: `${getPeriodLabel(sKey)} (Otomatis)`,
          isFallback: true
        };
      }
    }
    return { level: '', sourceLabel: 'Belum ada data', isFallback: true };
  }, [activeLpuRef, getStudentLevelForColumn]);

  // Handle field change in a legacy session record
  const handleLegacyFieldChange = (studentId: string, sessionKey: JuniorHighSessionKey, field: string, value: any) => {
    setAllLegacyRecords(prev => {
      const studentSessions = prev[studentId] ? { ...prev[studentId] } : {};
      const current = studentSessions[sessionKey] || {
        unit: 'JUNIOR_HIGH',
        studentId,
        studentName: students.find(s => s.id === studentId)?.name || '',
        classId: selectedClassId,
        gradeLevel: selectedGradeLevel,
        schoolYear: selectedYear,
        sessionKey,
        sessionLabel: getPeriodLabel(sessionKey),
        subjectArea: selectedArea
      };

      const updated = { ...current, [field]: value };

      // Auto-calculate WPM if wordsRead or errors change for ENGLISH_READING
      if (selectedArea === 'ENGLISH_READING' && (field === 'wordsRead' || field === 'errors')) {
        const wr = field === 'wordsRead' ? value : updated.wordsRead;
        const er = field === 'errors' ? value : updated.errors;
        if (wr !== '' && wr !== undefined && wr !== null && er !== '' && er !== undefined && er !== null) {
          updated.wpm = calculateWpm(Number(wr), Number(er));
        }
      }

      studentSessions[sessionKey] = updated;
      return { ...prev, [studentId]: studentSessions };
    });

    setModifiedIds(prev => new Set(prev).add(studentId));
  };

  // Handle field change in a custom column cell
  const handleCustomFieldChange = (studentId: string, columnId: string, field: string, value: any) => {
    const key = `${columnId}_${studentId}`;
    setCellValues(prev => {
      const studentName = students.find(s => s.id === studentId)?.name || '';
      const current = prev[key] || {
        id: key,
        columnId,
        studentId,
        studentName,
        classId: selectedClassId,
        schoolYear: selectedYear,
        subjectArea: selectedArea,
        updatedBy: profile?.uid || 'unknown',
        updatedAt: Date.now()
      };

      const updated = { ...current, [field]: value, updatedAt: Date.now() };

      // Auto-calculate WPM if wordsRead or errors change for ENGLISH_READING
      if (selectedArea === 'ENGLISH_READING' && (field === 'wordsRead' || field === 'errors')) {
        const wr = field === 'wordsRead' ? value : updated.wordsRead;
        const er = field === 'errors' ? value : updated.errors;
        if (wr !== '' && wr !== undefined && wr !== null && er !== '' && er !== undefined && er !== null) {
          updated.wpm = calculateWpm(Number(wr), Number(er));
        }
      }

      return { ...prev, [key]: updated };
    });

    setModifiedIds(prev => new Set(prev).add(studentId));
  };

  // Helper to determine if a record contains non-empty input
  const hasRecordContent = (rec: any) => {
    if (!rec) return false;
    return (
      Boolean(rec.id) ||
      (rec.readingLevel !== undefined && rec.readingLevel !== '' && rec.readingLevel !== null) ||
      (rec.readingComprehension !== undefined && rec.readingComprehension !== '' && rec.readingComprehension !== null) ||
      (rec.wordsRead !== undefined && rec.wordsRead !== '' && rec.wordsRead !== null) ||
      (rec.errors !== undefined && rec.errors !== '' && rec.errors !== null) ||
      (rec.wpm !== undefined && rec.wpm !== '' && rec.wpm !== null) ||
      (rec.comprehension !== undefined && rec.comprehension !== '' && rec.comprehension !== null) ||
      (rec.level !== undefined && rec.level !== '' && rec.level !== null) ||
      (rec.mengajiLevel !== undefined && rec.mengajiLevel !== '' && rec.mengajiLevel !== null) ||
      (rec.mengajiTarget !== undefined && rec.mengajiTarget !== '' && rec.mengajiTarget !== null) ||
      (rec.targetLevel !== undefined && rec.targetLevel !== '' && rec.targetLevel !== null) ||
      (rec.mathLevel !== undefined && rec.mathLevel !== '' && rec.mathLevel !== null) ||
      (rec.numerasiLevel !== undefined && rec.numerasiLevel !== '' && rec.numerasiLevel !== null) ||
      (rec.accuracy !== undefined && rec.accuracy !== '' && rec.accuracy !== null) ||
      (rec.notes !== undefined && rec.notes !== '' && rec.notes !== null && rec.notes.trim() !== '')
    );
  };

  // Save single student's row (both legacy sessions and custom columns)
  const handleSaveRow = async (studentId: string) => {
    try {
      // 1. Save modified legacy sessions
      const studentSessions = allLegacyRecords[studentId];
      if (studentSessions) {
        for (const sKey of Object.keys(studentSessions)) {
          const rec = studentSessions[sKey];
          if (hasRecordContent(rec)) {
            const enriched = {
              ...rec,
              unit: 'JUNIOR_HIGH',
              sessionKey: sKey as JuniorHighSessionKey,
              sessionLabel: getPeriodLabel(sKey as JuniorHighSessionKey),
              subjectArea: selectedArea,
              updatedBy: profile?.uid || 'unknown',
              period: sKey,
              area: selectedArea,
              teacherId: profile?.uid || 'unknown'
            };
            await juniorHighLiteracyService.saveProgressRecord(enriched as any);
          }
        }
      }

      // 2. Save custom cells for this student
      const cellsToSave = Object.values(cellValues).filter(c => c.studentId === studentId && hasRecordContent(c));
      if (cellsToSave.length > 0) {
        await juniorHighLiteracyService.saveLitnumCellValues(cellsToSave);
      }

      const stName = students.find(s => s.id === studentId)?.name || 'Siswa';
      toast.success(`Berhasil menyimpan penilaian untuk ${stName}`);

      setModifiedIds(prev => {
        const copy = new Set(prev);
        copy.delete(studentId);
        return copy;
      });
    } catch (err) {
      console.error('Error saving row:', err);
      toast.error('Gagal menyimpan penilaian untuk baris ini');
    }
  };

  // Save all modified students
  const handleSaveAll = async () => {
    const modifiedStudents = students.filter(st => modifiedIds.has(st.id));
    if (modifiedStudents.length === 0) {
      toast.info('Tidak ada perubahan baru untuk disimpan');
      return;
    }

    try {
      setIsSaving(true);
      const legacyToSave: any[] = [];
      modifiedStudents.forEach(st => {
        const studentSessions = allLegacyRecords[st.id];
        if (studentSessions) {
          Object.keys(studentSessions).forEach(sKey => {
            const rec = studentSessions[sKey];
            if (hasRecordContent(rec)) {
              legacyToSave.push({
                ...rec,
                unit: 'JUNIOR_HIGH',
                sessionKey: sKey,
                sessionLabel: getPeriodLabel(sKey as JuniorHighSessionKey),
                subjectArea: selectedArea,
                updatedBy: profile?.uid || 'unknown',
                period: sKey,
                area: selectedArea,
                teacherId: profile?.uid || 'unknown'
              });
            }
          });
        }
      });

      if (legacyToSave.length > 0) {
        await juniorHighLiteracyService.bulkUpsertRecords(legacyToSave);
      }

      // 2. Save custom cells for modified students only
      const modifiedStudentIds = new Set(modifiedStudents.map(s => s.id));
      const cellsToSave = Object.values(cellValues).filter(c => modifiedStudentIds.has(c.studentId) && hasRecordContent(c));
      if (cellsToSave.length > 0) {
        await juniorHighLiteracyService.saveLitnumCellValues(cellsToSave);
      }

      toast.success(`Berhasil menyimpan perubahan untuk ${modifiedStudents.length} siswa SMP!`);
      setModifiedIds(new Set());
    } catch (err) {
      console.error('Error batch saving:', err);
      toast.error('Gagal melakukan simpan semua massal');
    } finally {
      setIsSaving(false);
    }
  };

  // Create custom assessment column
  const handleCreateCustomColumn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColTitle.trim()) {
      toast.error('Judul kolom penilaian wajib diisi');
      return;
    }

    try {
      setIsSubmittingCol(true);
      const newCol: Partial<LitnumCustomColumn> = {
        unit: 'JUNIOR_HIGH',
        schoolYear: selectedYear,
        classId: selectedClassId,
        subjectArea: selectedArea,
        title: newColTitle.trim(),
        assessmentDate: newColDate || undefined,
        notes: newColNotes || undefined,
        createdBy: profile?.uid || 'unknown',
        order: customColumns.length + 1
      };

      const docId = await juniorHighLiteracyService.saveLitnumCustomColumn(newCol);
      const savedCol = { ...newCol, id: docId, createdAt: Date.now(), updatedAt: Date.now() } as LitnumCustomColumn;
      setCustomColumns(prev => [...prev, savedCol]);

      toast.success(`Kolom "${newColTitle}" berhasil ditambahkan`);
      setNewColTitle('');
      setNewColDate('');
      setNewColNotes('');
      setShowAddColModal(false);
    } catch (err) {
      console.error('Error creating custom column:', err);
      toast.error('Gagal membuat kolom penilaian kustom');
    } finally {
      setIsSubmittingCol(false);
    }
  };

  // Archive custom assessment column
  const handleArchiveColumn = async (colId: string, colTitle: string) => {
    if (!window.confirm(`Apakah Anda yakin ingin menghapus/mengarsipkan kolom "${colTitle}"? Data nilai yang sudah tersimpan tidak akan dihapus permanen.`)) {
      return;
    }
    try {
      await juniorHighLiteracyService.archiveLitnumCustomColumn(colId);
      setCustomColumns(prev => prev.filter(c => c.id !== colId));
      if (activeLpuRef?.sourceId === colId) {
        setActiveLpuRef(null);
      }
      toast.success(`Kolom "${colTitle}" berhasil diarsipkan`);
    } catch (err) {
      console.error('Error archiving column:', err);
      toast.error('Gagal mengarsipkan kolom penilaian');
    }
  };

  // LPU modal validation across full roster of the class
  const lpuMissingStudents = React.useMemo(() => {
    return students.filter(st => {
      const lvl = getStudentLevelForColumn(st.id, selectedRefSourceType, selectedRefSourceId);
      return !lvl || lvl.trim() === '';
    });
  }, [students, selectedRefSourceType, selectedRefSourceId, getStudentLevelForColumn]);

  const isLpuSourceValid = lpuMissingStudents.length === 0 && students.length > 0;

  // Apply LPU Reference
  const handleApplyLpuReference = async () => {
    if (!isLpuSourceValid) {
      toast.error('Semua siswa harus memiliki nilai pada kolom terpilih sebelum dapat dijadikan acuan LPU');
      return;
    }

    let sourceLabel = '';
    if (selectedRefSourceType === 'SESSION') {
      sourceLabel = getPeriodLabel(selectedRefSourceId as JuniorHighSessionKey);
    } else {
      const c = customColumns.find(col => col.id === selectedRefSourceId);
      sourceLabel = c ? c.title : 'Kolom Kustom';
    }

    try {
      setIsApplyingLpu(true);
      const payload: LpuSubjectReference = {
        unit: 'JUNIOR_HIGH',
        classId: selectedClassId,
        schoolYear: selectedYear,
        subjectArea: selectedArea,
        sourceType: selectedRefSourceType,
        sourceId: selectedRefSourceId,
        sourceLabel,
        appliedBy: profile?.uid || 'unknown',
        appliedAt: Date.now()
      };

      await juniorHighLiteracyService.saveLpuSubjectReference(payload);
      setActiveLpuRef(payload);
      toast.success(`Kolom "${sourceLabel}" berhasil ditetapkan sebagai acuan level LPU kelas!`);
      setShowLpuModal(false);
    } catch (err) {
      console.error('Error applying LPU reference:', err);
      toast.error('Gagal menerapkan acuan level LPU');
    } finally {
      setIsApplyingLpu(false);
    }
  };

  // Fetch Class History for modal
  const fetchClassHistory = async () => {
    if (!selectedClassId) return;
    try {
      setLoadingHistory(true);
      const docs = await juniorHighLiteracyService.getRecordsByClass(
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
      return s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.id.includes(searchQuery);
    });
  }, [students, searchQuery]);

  // Statistics summaries
  const { completedCount } = React.useMemo(() => {
    let completed = 0;
    filteredStudents.forEach(st => {
      const rec = studentRecords[st.id];
      if (rec) {
        if (selectedArea === 'BAHASA_INDONESIA') {
          if (rec.readingLevel || (rec.readingComprehension !== '' && rec.readingComprehension !== undefined && rec.readingComprehension !== null)) {
            completed++;
          }
        } else if (selectedArea === 'ENGLISH_READING') {
          if (rec.readingLevel || (rec.comprehension !== '' && rec.comprehension !== undefined && rec.comprehension !== null)) {
            completed++;
          }
        } else if (selectedArea === 'MENGAJI') {
          if (rec.level || rec.targetLevel) {
            completed++;
          }
        } else if (selectedArea === 'NUMERACY') {
          if (rec.mathLevel || (rec.accuracy !== '' && rec.accuracy !== undefined && rec.accuracy !== null)) {
            completed++;
          }
        }
      }
    });
    return { completedCount: completed };
  }, [filteredStudents, studentRecords, selectedArea]);

  const subColCount = selectedArea === 'ENGLISH_READING' ? 8 : 3;

  const renderSubHeaders = (keyPrefix: string) => {
    if (selectedArea === 'BAHASA_INDONESIA') {
      return (
        <React.Fragment key={keyPrefix}>
          <th className="py-2 px-2 text-center text-[9px] font-bold text-slate-500 min-w-[140px] border-r border-slate-100">Reading Level</th>
          <th className="py-2 px-2 text-center text-[9px] font-bold text-slate-500 min-w-[85px] border-r border-slate-100">Pemahaman (%)</th>
          <th className="py-2 px-2 text-center text-[9px] font-bold text-slate-500 min-w-[125px] border-r border-slate-200">Catatan</th>
        </React.Fragment>
      );
    }
    if (selectedArea === 'ENGLISH_READING') {
      return (
        <React.Fragment key={keyPrefix}>
          <th className="py-2 px-1 text-center text-[9px] font-bold text-slate-500 min-w-[65px] border-r border-slate-100">Grade</th>
          <th className="py-2 px-1 text-center text-[9px] font-bold text-slate-500 min-w-[75px] border-r border-slate-100">Words Read</th>
          <th className="py-2 px-1 text-center text-[9px] font-bold text-slate-500 min-w-[65px] border-r border-slate-100">Errors</th>
          <th className="py-2 px-1 text-center text-[9px] font-bold text-slate-500 min-w-[60px] border-r border-slate-100">WPM</th>
          <th className="py-2 px-2 text-center text-[9px] font-bold text-slate-500 min-w-[105px] border-r border-slate-100">Risk Level</th>
          <th className="py-2 px-2 text-center text-[9px] font-bold text-slate-500 min-w-[130px] border-r border-slate-100">Reading Level</th>
          <th className="py-2 px-1 text-center text-[9px] font-bold text-slate-500 min-w-[85px] border-r border-slate-100">Pemahaman (%)</th>
          <th className="py-2 px-2 text-center text-[9px] font-bold text-slate-500 min-w-[125px] border-r border-slate-200">Catatan</th>
        </React.Fragment>
      );
    }
    if (selectedArea === 'MENGAJI') {
      return (
        <React.Fragment key={keyPrefix}>
          <th className="py-2 px-2 text-center text-[9px] font-bold text-slate-500 min-w-[135px] border-r border-slate-100">Level</th>
          <th className="py-2 px-2 text-center text-[9px] font-bold text-slate-500 min-w-[135px] border-r border-slate-100">Target</th>
          <th className="py-2 px-2 text-center text-[9px] font-bold text-slate-500 min-w-[125px] border-r border-slate-200">Catatan</th>
        </React.Fragment>
      );
    }
    if (selectedArea === 'NUMERACY') {
      return (
        <React.Fragment key={keyPrefix}>
          <th className="py-2 px-2 text-center text-[9px] font-bold text-slate-500 min-w-[135px] border-r border-slate-100">Math Level</th>
          <th className="py-2 px-2 text-center text-[9px] font-bold text-slate-500 min-w-[85px] border-r border-slate-100">Akurasi (%)</th>
          <th className="py-2 px-2 text-center text-[9px] font-bold text-slate-500 min-w-[125px] border-r border-slate-200">Catatan</th>
        </React.Fragment>
      );
    }
    return null;
  };

  const renderSessionCells = (
    st: JuniorHighStudent,
    colKey: string,
    data: any,
    isLegacy: boolean
  ) => {
    const isRef = activeLpuRef && (
      (isLegacy && activeLpuRef.sourceType === 'SESSION' && activeLpuRef.sourceId === colKey) ||
      (!isLegacy && activeLpuRef.sourceType === 'CUSTOM_COLUMN' && activeLpuRef.sourceId === colKey)
    );
    const cellBg = isRef ? "bg-indigo-50/20" : "";

    if (selectedArea === 'BAHASA_INDONESIA') {
      return (
        <React.Fragment key={colKey}>
          <td className={cn("py-2 px-2 text-center border-r border-slate-100", cellBg)}>
            <select
              value={data.readingLevel || ''}
              onChange={e => isLegacy
                ? handleLegacyFieldChange(st.id, colKey as JuniorHighSessionKey, 'readingLevel', e.target.value)
                : handleCustomFieldChange(st.id, colKey, 'readingLevel', e.target.value)
              }
              className={cn("w-full min-w-[135px] bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold focus:outline-none focus:ring-1", activeConfig.focusRing)}
            >
              <option value="">-- Pilih Level --</option>
              {BAHASA_INDONESIA_LEVELS.map(lvl => (
                <option key={lvl} value={lvl}>{lvl}</option>
              ))}
            </select>
          </td>
          <td className={cn("py-2 px-2 text-center border-r border-slate-100", cellBg)}>
            <div className="flex items-center gap-0.5 justify-center">
              <input
                type="number"
                min="0"
                max="100"
                value={data.readingComprehension !== undefined && data.readingComprehension !== null && data.readingComprehension !== '' ? data.readingComprehension : ''}
                onChange={e => {
                  const val = e.target.value === '' ? '' : Math.min(100, Math.max(0, Number(e.target.value)));
                  isLegacy
                    ? handleLegacyFieldChange(st.id, colKey as JuniorHighSessionKey, 'readingComprehension', val)
                    : handleCustomFieldChange(st.id, colKey, 'readingComprehension', val);
                }}
                placeholder="0-100"
                className={cn("w-16 bg-white border border-slate-200 rounded-lg px-1.5 py-1 text-center font-bold text-xs focus:outline-none focus:ring-1", activeConfig.focusRing)}
              />
              <span className="text-[10px] text-slate-400 font-bold">%</span>
            </div>
          </td>
          <td className={cn("py-2 px-2 text-center border-r border-slate-200", cellBg)}>
            <input
              type="text"
              placeholder="Catatan..."
              value={data.notes || ''}
              onChange={e => isLegacy
                ? handleLegacyFieldChange(st.id, colKey as JuniorHighSessionKey, 'notes', e.target.value)
                : handleCustomFieldChange(st.id, colKey, 'notes', e.target.value)
              }
              className={cn("w-full min-w-[115px] bg-white border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-medium focus:outline-none focus:ring-1", activeConfig.focusRing)}
            />
          </td>
        </React.Fragment>
      );
    }

    if (selectedArea === 'ENGLISH_READING') {
      const gradeDisplay = data.gradeLevel || parseGradeFromClassName(st.className) || selectedGradeLevel;
      const wpmDisplay = (data.wpm !== undefined && data.wpm !== null && data.wpm !== '') ? data.wpm : '-';

      return (
        <React.Fragment key={colKey}>
          <td className={cn("py-2 px-1 text-center text-xs font-bold text-slate-500 border-r border-slate-100", cellBg)}>
            {gradeDisplay ? `Grade ${gradeDisplay}` : '-'}
          </td>
          <td className={cn("py-2 px-1 text-center border-r border-slate-100", cellBg)}>
            <input
              type="number"
              min="0"
              value={data.wordsRead !== undefined && data.wordsRead !== null && data.wordsRead !== '' ? data.wordsRead : ''}
              onChange={e => {
                const val = e.target.value === '' ? '' : Number(e.target.value);
                isLegacy
                  ? handleLegacyFieldChange(st.id, colKey as JuniorHighSessionKey, 'wordsRead', val)
                  : handleCustomFieldChange(st.id, colKey, 'wordsRead', val);
              }}
              className={cn("w-16 bg-white border border-slate-200 rounded-lg px-1.5 py-1 text-center font-bold text-xs focus:outline-none focus:ring-1", activeConfig.focusRing)}
            />
          </td>
          <td className={cn("py-2 px-1 text-center border-r border-slate-100", cellBg)}>
            <input
              type="number"
              min="0"
              value={data.errors !== undefined && data.errors !== null && data.errors !== '' ? data.errors : ''}
              onChange={e => {
                const val = e.target.value === '' ? '' : Number(e.target.value);
                isLegacy
                  ? handleLegacyFieldChange(st.id, colKey as JuniorHighSessionKey, 'errors', val)
                  : handleCustomFieldChange(st.id, colKey, 'errors', val);
              }}
              className={cn("w-14 bg-white border border-slate-200 rounded-lg px-1.5 py-1 text-center font-bold text-xs focus:outline-none focus:ring-1", activeConfig.focusRing)}
            />
          </td>
          <td className={cn("py-2 px-1 text-center font-black text-slate-700 text-xs border-r border-slate-100", cellBg)}>
            {wpmDisplay}
          </td>
          <td className={cn("py-2 px-2 text-center border-r border-slate-100", cellBg)}>
            {renderRiskLevelBadge(data, isLegacy ? (colKey as JuniorHighSessionKey) : undefined, gradeDisplay, st)}
          </td>
          <td className={cn("py-2 px-2 text-center border-r border-slate-100", cellBg)}>
            <select
              value={data.readingLevel || ''}
              onChange={e => isLegacy
                ? handleLegacyFieldChange(st.id, colKey as JuniorHighSessionKey, 'readingLevel', e.target.value)
                : handleCustomFieldChange(st.id, colKey, 'readingLevel', e.target.value)
              }
              className={cn("w-full min-w-[125px] bg-white border border-slate-200 rounded-lg px-1.5 py-1 text-xs font-bold focus:outline-none focus:ring-1", activeConfig.focusRing)}
            >
              <option value="">-- Pilih Level --</option>
              {ENGLISH_READING_LEVELS.map(lvl => (
                <option key={lvl} value={lvl}>{lvl}</option>
              ))}
            </select>
          </td>
          <td className={cn("py-2 px-1 text-center border-r border-slate-100", cellBg)}>
            <div className="flex items-center gap-0.5 justify-center">
              <input
                type="number"
                min="0"
                max="100"
                value={data.comprehension !== undefined && data.comprehension !== null && data.comprehension !== '' ? data.comprehension : ''}
                onChange={e => {
                  const val = e.target.value === '' ? '' : Math.min(100, Math.max(0, Number(e.target.value)));
                  isLegacy
                    ? handleLegacyFieldChange(st.id, colKey as JuniorHighSessionKey, 'comprehension', val)
                    : handleCustomFieldChange(st.id, colKey, 'comprehension', val);
                }}
                placeholder="0-100"
                className={cn("w-16 bg-white border border-slate-200 rounded-lg px-1.5 py-1 text-center font-bold text-xs focus:outline-none focus:ring-1", activeConfig.focusRing)}
              />
              <span className="text-[10px] text-slate-400 font-bold">%</span>
            </div>
          </td>
          <td className={cn("py-2 px-2 text-center border-r border-slate-200", cellBg)}>
            <input
              type="text"
              placeholder="Catatan..."
              value={data.notes || ''}
              onChange={e => isLegacy
                ? handleLegacyFieldChange(st.id, colKey as JuniorHighSessionKey, 'notes', e.target.value)
                : handleCustomFieldChange(st.id, colKey, 'notes', e.target.value)
              }
              className={cn("w-full min-w-[115px] bg-white border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-medium focus:outline-none focus:ring-1", activeConfig.focusRing)}
            />
          </td>
        </React.Fragment>
      );
    }

    if (selectedArea === 'MENGAJI') {
      const rawLevel = data.mengajiLevel || data.level || '';
      const normLevel = normalizeMengajiLevel(rawLevel) || '';
      const rawTarget = data.mengajiTarget || data.targetLevel || '';
      const normTarget = normalizeMengajiLevel(rawTarget) || '';

      return (
        <React.Fragment key={colKey}>
          <td className={cn("py-2 px-2 text-center border-r border-slate-100", cellBg)}>
            <select
              value={normLevel}
              onChange={e => {
                const val = e.target.value;
                const n = normalizeMengajiLevel(val);
                if (isLegacy) {
                  handleLegacyFieldChange(st.id, colKey as JuniorHighSessionKey, 'mengajiLevel', n || val);
                  handleLegacyFieldChange(st.id, colKey as JuniorHighSessionKey, 'level', n ? formatMengajiDisplay(n) : val);
                } else {
                  handleCustomFieldChange(st.id, colKey, 'level', n ? formatMengajiDisplay(n) : val);
                }
              }}
              className={cn("w-full min-w-[130px] bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold focus:outline-none focus:ring-1", activeConfig.focusRing)}
            >
              <option value="">-- Pilih Level --</option>
              {CANONICAL_MENGAJI_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </td>
          <td className={cn("py-2 px-2 text-center border-r border-slate-100", cellBg)}>
            <select
              value={normTarget}
              onChange={e => {
                const val = e.target.value;
                const n = normalizeMengajiLevel(val);
                if (isLegacy) {
                  handleLegacyFieldChange(st.id, colKey as JuniorHighSessionKey, 'mengajiTarget', n || val);
                  handleLegacyFieldChange(st.id, colKey as JuniorHighSessionKey, 'targetLevel', n ? formatMengajiDisplay(n) : val);
                } else {
                  handleCustomFieldChange(st.id, colKey, 'targetLevel', n ? formatMengajiDisplay(n) : val);
                }
              }}
              className={cn("w-full min-w-[130px] bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold focus:outline-none focus:ring-1", activeConfig.focusRing)}
            >
              <option value="">-- Pilih Target --</option>
              {CANONICAL_MENGAJI_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </td>
          <td className={cn("py-2 px-2 text-center border-r border-slate-200", cellBg)}>
            <input
              type="text"
              placeholder="Catatan..."
              value={data.notes || ''}
              onChange={e => isLegacy
                ? handleLegacyFieldChange(st.id, colKey as JuniorHighSessionKey, 'notes', e.target.value)
                : handleCustomFieldChange(st.id, colKey, 'notes', e.target.value)
              }
              className={cn("w-full min-w-[115px] bg-white border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-medium focus:outline-none focus:ring-1", activeConfig.focusRing)}
            />
          </td>
        </React.Fragment>
      );
    }

    if (selectedArea === 'NUMERACY') {
      const rawLevel = data.numerasiLevel || data.mathLevel || '';
      const normLevel = normalizeNumerasiLevel(rawLevel) || '';

      return (
        <React.Fragment key={colKey}>
          <td className={cn("py-2 px-2 text-center border-r border-slate-100", cellBg)}>
            <select
              value={normLevel}
              onChange={e => {
                const val = e.target.value;
                const n = normalizeNumerasiLevel(val);
                if (isLegacy) {
                  handleLegacyFieldChange(st.id, colKey as JuniorHighSessionKey, 'numerasiLevel', n || val);
                  handleLegacyFieldChange(st.id, colKey as JuniorHighSessionKey, 'mathLevel', n ? formatNumerasiDisplay(n) : val);
                } else {
                  handleCustomFieldChange(st.id, colKey, 'mathLevel', n ? formatNumerasiDisplay(n) : val);
                }
              }}
              className={cn("w-full min-w-[130px] bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold focus:outline-none focus:ring-1", activeConfig.focusRing)}
            >
              <option value="">-- Pilih Level --</option>
              {CANONICAL_NUMERASI_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </td>
          <td className={cn("py-2 px-2 text-center border-r border-slate-100", cellBg)}>
            <div className="flex items-center gap-0.5 justify-center">
              <input
                type="number"
                min="0"
                max="100"
                value={data.accuracy !== undefined && data.accuracy !== null && data.accuracy !== '' ? data.accuracy : ''}
                onChange={e => {
                  const val = e.target.value === '' ? '' : Math.min(100, Math.max(0, Number(e.target.value)));
                  isLegacy
                    ? handleLegacyFieldChange(st.id, colKey as JuniorHighSessionKey, 'accuracy', val)
                    : handleCustomFieldChange(st.id, colKey, 'accuracy', val);
                }}
                placeholder="0-100"
                className={cn("w-16 bg-white border border-slate-200 rounded-lg px-1.5 py-1 text-center font-bold text-xs focus:outline-none focus:ring-1", activeConfig.focusRing)}
              />
              <span className="text-[10px] text-slate-400 font-bold">%</span>
            </div>
          </td>
          <td className={cn("py-2 px-2 text-center border-r border-slate-200", cellBg)}>
            <input
              type="text"
              placeholder="Catatan..."
              value={data.notes || ''}
              onChange={e => isLegacy
                ? handleLegacyFieldChange(st.id, colKey as JuniorHighSessionKey, 'notes', e.target.value)
                : handleCustomFieldChange(st.id, colKey, 'notes', e.target.value)
              }
              className={cn("w-full min-w-[115px] bg-white border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-medium focus:outline-none focus:ring-1", activeConfig.focusRing)}
            />
          </td>
        </React.Fragment>
      );
    }

    return null;
  };

  return (
    <div className="space-y-6 pb-16">
      {/* HEADER SECTION */}
      <header className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 text-[9px] uppercase tracking-widest font-black bg-blue-50 text-blue-700 rounded-lg">JUNIOR HIGH UNIT</span>
            <span className="text-gray-300">•</span>
            <span className="text-xs font-bold text-gray-500">Pusat Penilaian Akademik SMP</span>
          </div>
          <h1 className="text-2xl font-black text-gray-950 tracking-tight flex items-center gap-2 italic uppercase">
            LUMINA LITERASI & NUMERASI SMP
          </h1>
          <p className="text-gray-500 text-xs font-medium">Tabel penilaian fleksibel per kelas, tahun ajaran, dan pelajaran dengan penetapan acuan level Learning Power-Up.</p>
        </div>
        
        {/* FILTERS & ACTIONS TOOLBAR */}
        <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
          {/* Class Select Dropdown */}
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 p-1.5 rounded-2xl text-xs font-bold text-gray-600">
            <select 
              value={selectedClassId} 
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="bg-transparent font-black text-gray-800 outline-none pr-2 cursor-pointer"
            >
              <option value="" disabled>-- Pilih Kelas SMP --</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* School Year Selector */}
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 p-1.5 rounded-2xl text-xs font-bold text-gray-600">
            <select 
              value={selectedYear} 
              onChange={(e) => setSelectedYear(e.target.value)}
              className="bg-transparent font-black text-gray-800 outline-none pr-1 cursor-pointer"
            >
              {ACADEMIC_YEARS.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Action: + Tambah Kolom Penilaian */}
          <button
            type="button"
            onClick={() => setShowAddColModal(true)}
            disabled={!selectedClassId}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-slate-200 disabled:text-slate-400 shadow-sm px-3.5 py-2 text-xs font-black tracking-wider uppercase transition-all rounded-xl cursor-pointer"
          >
            <Plus size={14} />
            TAMBAH KOLOM PENILAIAN
          </button>

          {/* Action: Atur Acuan Level LPU */}
          <button
            type="button"
            onClick={() => {
              if (activeLpuRef) {
                setSelectedRefSourceType(activeLpuRef.sourceType);
                setSelectedRefSourceId(activeLpuRef.sourceId);
              } else {
                setSelectedRefSourceType('SESSION');
                setSelectedRefSourceId('SEMESTER_1_START');
              }
              setShowLpuModal(true);
            }}
            disabled={!selectedClassId}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white disabled:bg-slate-200 disabled:text-slate-400 shadow-sm px-3.5 py-2 text-xs font-black tracking-wider uppercase transition-all rounded-xl cursor-pointer"
          >
            <Target size={14} />
            ATUR ACUAN LEVEL LPU
            {activeLpuRef && (
              <span className="ml-1 px-1.5 py-0.5 rounded bg-indigo-800 text-[9px] font-mono tracking-tight uppercase">
                {activeLpuRef.sourceLabel}
              </span>
            )}
          </button>

          {/* History modal button */}
          <button 
            type="button"
            onClick={handleOpenHistory}
            disabled={!selectedClassId}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white disabled:bg-slate-200 disabled:text-slate-400 shadow-sm px-3.5 py-2 text-xs font-black tracking-wider uppercase transition-all rounded-xl cursor-pointer"
          >
            <History size={13} />
            RIWAYAT KELAS
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
          Pencatatan Penilaian (Multi-Kolom)
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
          <JuniorHighLiteracyOverview 
            schoolYear={selectedYear}
            period={selectedPeriod}
          />
        </div>
      ) : (
        <div className="space-y-6">
          {/* AREA SELECTOR TABS */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.values(JUNIOR_HIGH_AREA_CONFIGS).map((ar) => {
              const isActive = selectedArea === ar.id;
              const IconComponent = ar.icon;
              return (
                <button
                  key={ar.id}
                  type="button"
                  onClick={() => setSelectedArea(ar.id)}
                  className={cn(
                    "flex items-center justify-between p-4 rounded-2xl border transition-all duration-150 text-left relative overflow-hidden cursor-pointer",
                    isActive 
                      ? `${ar.softBg} ${ar.borderActive} ${ar.textDark} ring-1 ${ar.borderActive} font-extrabold shadow-sm` 
                      : "bg-white border-gray-100 text-slate-700 hover:bg-slate-50/50"
                  )}
                  aria-label={`Pilih Area ${ar.label}`}
                >
                  <div className="space-y-1 z-10">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">
                      Area Pembelajaran
                    </span>
                    <span className="text-xs sm:text-sm block font-black">{ar.label}</span>
                  </div>
                  <div className={cn("p-2 rounded-xl z-10 transition-colors", isActive ? `${ar.primaryBg} text-white` : `${ar.softBg} ${ar.primaryColor}`)}>
                    <IconComponent className="w-4 h-4" aria-hidden="true" />
                  </div>
                </button>
              );
            })}
          </div>

          {/* OVERVIEW METRICS ROW */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-900 text-white rounded-3xl p-5 flex items-center justify-between shadow-xl shadow-slate-900/10">
              <div className="space-y-1.5">
                <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">Siswa Terdaftar</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black font-mono tracking-tight text-white">{students.length}</span>
                  <span className="text-xs font-semibold text-slate-400">Siswa SMP</span>
                </div>
                <p className="text-[10px] text-slate-400 font-mono">Kelas: {classes.find(c => c.id === selectedClassId)?.name || 'SMP'}</p>
              </div>
            </div>

            <div className="bg-slate-900 text-white rounded-3xl p-5 flex items-center justify-between shadow-xl shadow-slate-900/10">
              <div className="space-y-1.5">
                <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">Total Kolom Penilaian</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black font-mono tracking-tight text-white">{5 + customColumns.filter(c => !c.archived).length}</span>
                  <span className="text-xs font-semibold text-slate-400">Kolom Berdampingan</span>
                </div>
                <p className="text-[10px] text-emerald-400 font-mono">5 Sesi Standar + {customColumns.filter(c => !c.archived).length} Kustom</p>
              </div>
            </div>

            <div className="bg-slate-900 text-white rounded-3xl p-5 flex items-center justify-between shadow-xl shadow-slate-900/10">
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">Acuan Level LPU Aktif</span>
                  <span className="px-1.5 py-0.2 rounded text-[8px] font-black bg-indigo-500/30 text-indigo-300 border border-indigo-400/30">LPU SYNC</span>
                </div>
                <div className="text-lg font-black text-indigo-300 tracking-tight truncate max-w-[220px]">
                  {activeLpuRef ? activeLpuRef.sourceLabel : 'Sumber Otomatis'}
                </div>
                <p className="text-[10px] text-slate-400 font-mono">
                  {activeLpuRef ? 'Ditetapkan secara manual untuk kelas ini' : 'Fallback otomatis dari sesi standar'}
                </p>
              </div>
            </div>
          </div>

          {/* ASSESSMENT SPREADSHEET TABLE */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            {/* Table Search & Header */}
            <div className="p-5 border-b border-gray-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/30">
              <div className="flex items-center gap-2">
                <div className={cn("p-1 px-2.5 rounded-lg text-xs font-black border", activeConfig.headingBadge)}>
                  {filteredStudents.length} Siswa SMP
                </div>
                <h2 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  <span className={cn("w-1.5 h-4 rounded-full", activeConfig.primaryBg)} />
                  SPREADSHEET PENILAIAN SMP: {getAreaLabel(selectedArea).toUpperCase()} (TABEL LENGKAP BERDAMPINGAN)
                </h2>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3.5 top-2.5 text-slate-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Cari siswa SMP..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className={cn("w-full bg-white border border-slate-200 text-xs px-9 py-2 rounded-xl outline-none focus:ring-1", activeConfig.focusRing)}
                />
              </div>
            </div>

            {/* SPREADSHEET TABLE IMPLEMENTATION */}
            {loadingStudents ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-3 text-slate-400">
                <RefreshCw size={32} className={cn("animate-spin", activeConfig.textPrimary)} />
                <span className="text-xs font-black uppercase tracking-wider">Mensinkronisasikan berkas siswa SMP...</span>
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-2 text-slate-400">
                <AlertCircle size={32} className="text-slate-300" />
                <span className="text-sm font-bold">Tidak ada daftar siswa yang ditemukan.</span>
                <p className="text-[11px]">Silakan pilih kombinasi filter atau periksa daftar siswa di tingkatan kelas SMP ini.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[1000px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-[9px] font-black text-slate-400 uppercase tracking-wider">
                      <th rowSpan={2} className="py-3 px-4 w-48 sticky left-0 bg-slate-50 z-20 border-r border-slate-200 shadow-[2px_0_5px_rgba(0,0,0,0.02)] align-middle">
                        Nama Siswa SMP
                      </th>

                      {/* 5 STANDAR SESSIONS */}
                      {PERIODS.map(p => {
                        const isRef = activeLpuRef?.sourceType === 'SESSION' && activeLpuRef?.sourceId === p.value;
                        return (
                          <th key={p.value} colSpan={subColCount} className={cn("py-2.5 px-3 text-center border-r border-slate-200", isRef ? "bg-indigo-100/70 text-indigo-900 border-indigo-200" : "bg-slate-50")}>
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="font-black text-[10px] text-slate-700">{p.label}</span>
                              {isRef && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-black bg-indigo-600 text-white shadow-xs">
                                  <Sparkles size={8} /> ACUAN LPU
                                </span>
                              )}
                            </div>
                          </th>
                        );
                      })}

                      {/* CUSTOM COLUMNS */}
                      {customColumns.filter(c => !c.archived).map(col => {
                        const isRef = activeLpuRef?.sourceType === 'CUSTOM_COLUMN' && activeLpuRef?.sourceId === col.id;
                        return (
                          <th key={col.id} colSpan={subColCount} className={cn("py-2.5 px-3 text-center border-r border-slate-200", isRef ? "bg-indigo-100/70 text-indigo-900 border-indigo-200" : "bg-slate-50")}>
                            <div className="flex flex-col items-center gap-0.5">
                              <div className="flex items-center gap-1 justify-center">
                                <span className="font-black text-[10px] text-slate-700 truncate max-w-[120px]">{col.title}</span>
                                <button
                                  type="button"
                                  onClick={() => handleArchiveColumn(col.id, col.title)}
                                  title="Arsipkan kolom ini"
                                  className="text-slate-300 hover:text-red-500 transition-colors cursor-pointer"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                              {col.assessmentDate && (
                                <span className="text-[8px] text-slate-400 font-normal">{col.assessmentDate}</span>
                              )}
                              {isRef && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-black bg-indigo-600 text-white shadow-xs">
                                  <Sparkles size={8} /> ACUAN LPU
                                </span>
                              )}
                            </div>
                          </th>
                        );
                      })}

                      {/* ACTIVE LPU LEVEL COLUMN */}
                      <th rowSpan={2} className="py-3 px-4 text-center min-w-[140px] bg-indigo-50/80 border-r border-indigo-100 text-indigo-950 align-middle">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="flex items-center gap-1 text-[10px] font-black text-indigo-900">
                            <Target size={11} className="text-indigo-600" /> LEVEL AKTIF LPU
                          </span>
                          <span className="text-[8px] font-medium text-indigo-600 truncate max-w-[130px]">
                            {activeLpuRef ? activeLpuRef.sourceLabel : 'Sumber Otomatis'}
                          </span>
                        </div>
                      </th>

                      {/* ROW SAVE ACTION */}
                      <th rowSpan={2} className="py-3 px-4 text-center w-32 align-middle">Aksi Simpan</th>
                    </tr>

                    {/* SUB-HEADERS ROW 2 */}
                    <tr className="bg-slate-100/60 border-b border-slate-200 text-[8px] font-black text-slate-500 uppercase tracking-wider">
                      {PERIODS.map(p => renderSubHeaders(`p_sub_${p.value}`))}
                      {customColumns.filter(c => !c.archived).map(col => renderSubHeaders(`col_sub_${col.id}`))}
                    </tr>
                  </thead>
                  
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredStudents.map((st) => {
                      const isModified = modifiedIds.has(st.id);
                      const lpuInfo = getActiveLpuLevel(st.id);

                      return (
                        <tr
                          key={st.id}
                          className={cn(
                            "hover:bg-slate-50/50 transition-colors",
                            isModified ? "bg-amber-50/15" : ""
                          )}
                        >
                          {/* Name Column Fixed left */}
                          <td className="py-2.5 px-4 font-black text-slate-800 sticky left-0 bg-white z-10 border-r border-slate-200 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                            <div className="flex flex-col">
                              <span className="truncate max-w-[140px] block">{st.name}</span>
                              <span className="text-[9px] text-slate-400 font-mono uppercase font-semibold">NIS: {st.id}</span>
                            </div>
                          </td>

                          {/* 5 STANDAR SESSIONS */}
                          {PERIODS.map(p => {
                            const rec = allLegacyRecords[st.id]?.[p.value] || {};
                            return renderSessionCells(st, p.value, rec, true);
                          })}

                          {/* CUSTOM COLUMNS */}
                          {customColumns.filter(c => !c.archived).map(col => {
                            const cell = cellValues[`${col.id}_${st.id}`] || {};
                            return renderSessionCells(st, col.id, cell, false);
                          })}

                          {/* LEVEL AKTIF LPU */}
                          <td className="py-2.5 px-3 text-center bg-indigo-50/30 border-r border-indigo-100 font-bold">
                            {lpuInfo.level ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-black bg-indigo-600 text-white shadow-xs">
                                  {formatLevelDisplay(lpuInfo.level)}
                                </span>
                                <span className="text-[9px] text-slate-400 font-normal truncate max-w-[120px]">{lpuInfo.sourceLabel}</span>
                              </div>
                            ) : (
                              <span className="text-slate-300 text-[11px] italic font-medium">Belum ada</span>
                            )}
                          </td>

                          {/* ACTION BUTTON COLUMN */}
                          <td className="py-2.5 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleSaveRow(st.id)}
                              className={cn(
                                "flex items-center gap-1.5 justify-center mx-auto px-3 py-1.5 rounded-xl text-[10px] uppercase font-black tracking-wider transition-all duration-150 cursor-pointer w-full focus:outline-none focus:ring-2",
                                isModified 
                                  ? activeConfig.saveButtonActive
                                  : `${activeConfig.softBg} hover:${activeConfig.softBgHover} ${activeConfig.textPrimary}`
                              )}
                            >
                              <Save size={11} />
                              {isModified ? 'SIMPAN DRAF' : 'SIMPAN'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* MASTER BOTTOM ACTIONS */}
            <div className="p-5 bg-slate-50/50 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                Draft baris ditandai oranye muda jika ada perubahan. Gunakan tombol 'Simpan Semua' untuk sinkronisasi massal satu kelas.
              </div>

              <div className="flex items-center gap-3 self-end md:self-auto">
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Apakah Anda yakin ingin membuang semua draf dan mengambil ulang data terbaru dari Firestore?')) {
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
                  className={cn(
                    "flex items-center justify-center gap-2 text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-150 cursor-pointer shadow-md",
                    isSaving || students.length === 0
                      ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                      : `${activeConfig.primaryBg} hover:${activeConfig.primaryBgHover} shadow-${selectedArea === 'BAHASA_INDONESIA' ? 'blue' : selectedArea === 'ENGLISH_READING' ? 'violet' : selectedArea === 'MENGAJI' ? 'emerald' : 'amber'}-550/15`
                  )}
                >
                  {isSaving ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      MENYIMPAN...
                    </>
                  ) : (
                    <>
                      <Save size={14} />
                      SIMPAN SEMUA ({filteredStudents.length} SISWA SMP)
                    </>
                  )}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* CLASS HISTORY MODAL SUMMARY */}
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
                    <span>RIWAYAT KELAS SMP</span>
                    <span>•</span>
                    <span className="text-slate-900">{classes.find(c => c.id === selectedClassId)?.name || 'SMP'}</span>
                  </div>
                  <h3 className="text-base font-black text-slate-950 uppercase tracking-wider italic">
                    Ringkasan Penilaian {getAreaLabel(selectedArea).toUpperCase()} (SMP)
                  </h3>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Sesi: {getPeriodLabel(selectedPeriod)}</p>
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
                    <p className="text-[10px] text-gray-400 mt-1 max-w-xs leading-normal">Belum ada siswa di kelas SMP ini yang dinilai untuk area dan sesi terpilih.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-gray-100">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-gray-100 text-slate-500 uppercase tracking-wider font-black text-[9px]">
                          <th className="py-3 px-4">Nama Siswa SMP</th>
                          
                          {/* BI COLUMNS */}
                          {selectedArea === 'BAHASA_INDONESIA' && (
                            <>
                              <th className="py-3 px-4 text-center">Level Membaca</th>
                              <th className="py-3 px-4 text-center">Pemahaman Bacaan</th>
                            </>
                          )}

                          {/* ENG COLUMNS */}
                          {selectedArea === 'ENGLISH_READING' && (
                            <>
                              <th className="py-3 px-4 text-center">Words Read</th>
                              <th className="py-3 px-4 text-center">Errors</th>
                              <th className="py-3 px-4 text-center">WPM</th>
                              <th className="py-3 px-4 text-center">Risk Level</th>
                              <th className="py-3 px-4 text-center">Reading Level</th>
                              <th className="py-3 px-4 text-center">Comprehension</th>
                            </>
                          )}

                          {/* MENGAJI COLUMNS */}
                          {selectedArea === 'MENGAJI' && (
                            <>
                              <th className="py-3 px-4 text-center">Level</th>
                              <th className="py-3 px-4 text-center">Target Level</th>
                            </>
                          )}

                          {/* MATH COLUMNS */}
                          {selectedArea === 'NUMERACY' && (
                            <>
                              <th className="py-3 px-4 text-center">Math Level</th>
                              <th className="py-3 px-4 text-center">Akurasi</th>
                            </>
                          )}

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

                              {/* BI RECORDS */}
                              {selectedArea === 'BAHASA_INDONESIA' && (
                                <>
                                  <td className="py-3.5 px-4 text-center font-bold">{(record as any)?.readingLevel || '-'}</td>
                                  <td className="py-3.5 px-4 text-center font-bold">
                                    {(record as any)?.readingComprehension !== undefined && (record as any)?.readingComprehension !== '' && (record as any)?.readingComprehension !== null ? (
                                      `${(record as any)?.readingComprehension}%`
                                    ) : '-'}
                                  </td>
                                </>
                              )}

                              {/* ENG RECORDS */}
                              {selectedArea === 'ENGLISH_READING' && (
                                <>
                                  <td className="py-3.5 px-4 text-center font-bold">{(record as any)?.wordsRead !== undefined && (record as any)?.wordsRead !== null ? (record as any)?.wordsRead : '-'}</td>
                                  <td className="py-3.5 px-4 text-center text-red-500 font-bold">{(record as any)?.errors !== undefined && (record as any)?.errors !== null ? (record as any)?.errors : '-'}</td>
                                  <td className="py-3.5 px-4 text-center text-emerald-600 font-extrabold">{(record as any)?.wpm !== undefined && (record as any)?.wpm !== null ? `${(record as any)?.wpm} wpm` : '-'}</td>
                                  <td className="py-3.5 px-4 text-center">
                                    {renderRiskLevelBadge(record, selectedPeriod, selectedGradeLevel, student)}
                                  </td>
                                  <td className="py-3.5 px-4 text-center font-black">
                                    {(record as any)?.readingLevel ? (
                                      <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[9px] font-black">{(record as any)?.readingLevel}</span>
                                    ) : '-'}
                                  </td>
                                  <td className="py-3.5 px-4 text-center font-bold">
                                    {(record as any)?.comprehension !== undefined && (record as any)?.comprehension !== '' && (record as any)?.comprehension !== null ? (
                                      `${(record as any)?.comprehension}%`
                                    ) : '-'}
                                  </td>
                                </>
                              )}

                              {/* MENGAJI RECORDS */}
                              {selectedArea === 'MENGAJI' && (
                                <>
                                  <td className="py-3.5 px-4 text-center font-black text-slate-800">{(record as any)?.level || '-'}</td>
                                  <td className="py-3.5 px-4 text-center font-bold">{(record as any)?.targetLevel || '-'}</td>
                                </>
                              )}

                              {/* MATH RECORDS */}
                              {selectedArea === 'NUMERACY' && (
                                <>
                                  <td className="py-3.5 px-4 text-center font-bold">{(record as any)?.mathLevel || '-'}</td>
                                  <td className="py-3.5 px-4 text-center font-extrabold text-[#7c3aed]">{(record as any)?.accuracy !== undefined && (record as any)?.accuracy !== '' && (record as any)?.accuracy !== null ? `${(record as any)?.accuracy}%` : '-'}</td>
                                </>
                              )}

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

      {/* MODAL: TAMBAH KOLOM PENILAIAN BARU */}
      <AnimatePresence>
        {showAddColModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-100 flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                    <Plus size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Tambah Kolom Penilaian</h3>
                    <p className="text-[11px] text-slate-500 font-medium">Buat kolom asesmen kustom baru untuk kelas ini</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddColModal(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                    Judul Kolom Asesmen <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newColTitle}
                    onChange={e => setNewColTitle(e.target.value)}
                    placeholder="Contoh: Asesmen Oktober, Kuis Bab 3, dsb."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                    Tanggal Pelaksanaan (Opsional)
                  </label>
                  <input
                    type="date"
                    value={newColDate}
                    onChange={e => setNewColDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                    Catatan Kolom (Opsional)
                  </label>
                  <textarea
                    rows={2}
                    value={newColNotes}
                    onChange={e => setNewColNotes(e.target.value)}
                    placeholder="Keterangan cakupan materi atau indikator..."
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-[11px] text-slate-500 font-medium">
                  Kolom baru ini akan otomatis muncul berdampingan di spreadsheet kelas dan dapat dipilih sebagai acuan level LPU jika seluruh siswa sudah dinilai.
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 flex items-center justify-end gap-2.5 bg-slate-50/30">
                <button
                  type="button"
                  onClick={() => setShowAddColModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleCreateCustomColumn}
                  disabled={isSubmittingCol || !newColTitle.trim()}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-wider disabled:bg-slate-300 disabled:cursor-not-allowed shadow-sm cursor-pointer flex items-center gap-1.5"
                >
                  {isSubmittingCol ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                  Simpan Kolom
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: ATUR ACUAN LEVEL LPU */}
      <AnimatePresence>
        {showLpuModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-indigo-50/50">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-xs">
                    <Target size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Atur Acuan Level LPU</h3>
                    <p className="text-[11px] text-indigo-700 font-semibold">{getAreaLabel(selectedArea)} • {classes.find(c => c.id === selectedClassId)?.name || 'SMP'}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLpuModal(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-white transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 space-y-4 overflow-y-auto">
                <p className="text-xs text-slate-600 font-medium leading-relaxed">
                  Pilih satu kolom penilaian sebagai sumber level resmi untuk <strong>Learning Power-Up (LPU)</strong> seluruh siswa kelas ini.
                  Yang disamakan adalah <em>sumber asesmen</em>, sedangkan level masing-masing siswa tetap sesuai hasil yang diperoleh.
                </p>

                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-2">
                    Pilih Kolom Penilaian:
                  </label>
                  
                  <div className="space-y-2">
                    {/* Legacy sessions options */}
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Sesi Standar:</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {PERIODS.map(p => {
                        const isSelected = selectedRefSourceType === 'SESSION' && selectedRefSourceId === p.value;
                        return (
                          <button
                            key={p.value}
                            type="button"
                            onClick={() => {
                              setSelectedRefSourceType('SESSION');
                              setSelectedRefSourceId(p.value);
                            }}
                            className={cn(
                              "p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between",
                              isSelected
                                ? "border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-500/20"
                                : "border-slate-200 hover:border-slate-300 bg-white"
                            )}
                          >
                            <div>
                              <div className="text-xs font-bold text-slate-800">{p.label}</div>
                              <div className="text-[10px] text-slate-400">Sesi Standar</div>
                            </div>
                            {isSelected && <Check size={14} className="text-indigo-600" />}
                          </button>
                        );
                      })}
                    </div>

                    {/* Custom columns options */}
                    {customColumns.filter(c => !c.archived).length > 0 && (
                      <>
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-4">Kolom Kustom:</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {customColumns.filter(c => !c.archived).map(col => {
                            const isSelected = selectedRefSourceType === 'CUSTOM_COLUMN' && selectedRefSourceId === col.id;
                            return (
                              <button
                                key={col.id}
                                type="button"
                                onClick={() => {
                                  setSelectedRefSourceType('CUSTOM_COLUMN');
                                  setSelectedRefSourceId(col.id);
                                }}
                                className={cn(
                                  "p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between",
                                  isSelected
                                    ? "border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-500/20"
                                    : "border-slate-200 hover:border-slate-300 bg-white"
                                )}
                              >
                                <div className="truncate pr-2">
                                  <div className="text-xs font-bold text-slate-800 truncate">{col.title}</div>
                                  <div className="text-[10px] text-slate-400">{col.assessmentDate || 'Kolom Kustom'}</div>
                                </div>
                                {isSelected && <Check size={14} className="text-indigo-600 shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Validation Status against full class roster */}
                <div className="mt-4">
                  {isLpuSourceValid ? (
                    <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3 text-emerald-800">
                      <ShieldCheck size={20} className="text-emerald-600 shrink-0 mt-0.5" />
                      <div className="text-xs">
                        <div className="font-black uppercase tracking-wider mb-0.5">Kelengkapan Roster 100% Terpenuhi</div>
                        <p className="font-medium">
                          Seluruh <strong>{students.length} siswa</strong> pada kelas ini telah memiliki level penilaian pada kolom terpilih. Siap dijadikan acuan LPU resmi!
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-amber-900">
                      <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
                      <div className="text-xs space-y-1">
                        <div className="font-black uppercase tracking-wider">Belum Lengkap: {lpuMissingStudents.length} dari {students.length} Siswa Belum Dinilai</div>
                        <p className="font-medium">
                          Sebelum dapat diterapkan sebagai acuan LPU, seluruh siswa pada kelas harus memiliki nilai level pada kolom ini.
                        </p>
                        <div className="text-[11px] font-semibold text-amber-700 bg-amber-100/60 p-2 rounded-lg mt-1">
                          Belum terisi: {lpuMissingStudents.slice(0, 5).map(s => s.name).join(', ')}
                          {lpuMissingStudents.length > 5 ? ` (+${lpuMissingStudents.length - 5} lainnya)` : ''}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-[10px] text-slate-400 font-medium">
                  Aturan Keamanan: Penetapan acuan LPU bersifat aditif. Sistem tidak menghapus atau mengubah data riwayat penilaian yang sudah tersimpan.
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 flex items-center justify-end gap-2.5 bg-slate-50/30">
                <button
                  type="button"
                  onClick={() => setShowLpuModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleApplyLpuReference}
                  disabled={!isLpuSourceValid || isApplyingLpu}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-wider disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  {isApplyingLpu ? <RefreshCw size={14} className="animate-spin" /> : <Target size={14} />}
                  Terapkan sebagai Acuan LPU
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
