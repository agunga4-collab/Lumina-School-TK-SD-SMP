import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, Languages, Heart, BookMarked, Calculator, Search, 
  History, Save, Calendar, RefreshCw, AlertCircle, FileText, X, HelpCircle, Info
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
import { 
  getOralReadingFluencyRiskLevel,
  isJuniorHighOrfGrade,
  parseGradeFromClassName,
  OralReadingRiskLevel,
  JuniorHighOrfGrade
} from '../../config/oralReadingFluencyRiskThresholds';
import { 
  JuniorHighArea, 
  JuniorHighSessionKey, 
  JuniorHighProgressRecord 
} from '../../types/juniorHighLiteracyNumeracy';
import { 
  calculateWpm, 
  getAreaLabel, 
  getPeriodLabel 
} from '../../constants/juniorHighLiteracyBenchmarks';

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

  const isSpring3 = selectedPeriod === 'SPRING_ASSESSMENT_3';
  if (!isSpring3) {
    return (
      <span className="text-[10px] font-bold uppercase text-slate-400">
        Tidak berlaku untuk periode ini
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
  const [studentRecords, setStudentRecords] = React.useState<Record<string, Partial<JuniorHighProgressRecord>>>({});
  const [modifiedIds, setModifiedIds] = React.useState<Set<string>>(new Set());

  // Class History modal
  const [showHistory, setShowHistory] = React.useState<boolean>(false);
  const [historyRecords, setHistoryRecords] = React.useState<JuniorHighProgressRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = React.useState<boolean>(false);

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
        if (profile?.role === 'HOMEROOM_TEACHER') {
          const homeroomClass = juniorHighClasses.find(c => c.homeroomTeacherId === profile?.uid);
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

        // 2. Fetch records from canonical collection for SMP
        const existingRecords = await juniorHighLiteracyService.getRecordsByClass(
          selectedYear,
          selectedGradeLevel,
          selectedClassId,
          selectedPeriod,
          selectedArea
        );

        const recordMap: Record<string, JuniorHighProgressRecord> = {};
        existingRecords.forEach(rec => {
          recordMap[rec.studentId] = rec;
        });

        // 3. Populate default empty entries
        const initialStates: Record<string, Partial<JuniorHighProgressRecord>> = {};
        classStudents.forEach(st => {
          const existing = recordMap[st.id];
          if (existing) {
            initialStates[st.id] = { ...existing };
          } else {
            const base: Omit<JuniorHighProgressRecord, 'updatedAt'> = {
              unit: 'JUNIOR_HIGH',
              studentId: st.id,
              studentName: st.name,
              classId: selectedClassId,
              gradeLevel: selectedGradeLevel,
              schoolYear: selectedYear,
              sessionKey: selectedPeriod,
              sessionLabel: getPeriodLabel(selectedPeriod),
              subjectArea: selectedArea,
              updatedBy: profile?.uid || profile?.id || 'unknown',
              notes: '',
              // Backward compatibility fields
              period: selectedPeriod,
              area: selectedArea,
              teacherId: profile?.uid || profile?.id || 'unknown'
            };

            if (selectedArea === 'BAHASA_INDONESIA') {
              initialStates[st.id] = {
                ...base,
                subjectArea: 'BAHASA_INDONESIA',
                readingLevel: '',
                readingComprehension: ''
              } as any;
            } else if (selectedArea === 'ENGLISH_READING') {
              initialStates[st.id] = {
                ...base,
                subjectArea: 'ENGLISH_READING',
                wordsRead: '',
                errors: '',
                wpm: '',
                readingLevel: '',
                comprehension: ''
              } as any;
            } else if (selectedArea === 'MENGAJI') {
              initialStates[st.id] = {
                ...base,
                subjectArea: 'MENGAJI',
                level: '',
                targetLevel: ''
              } as any;
            } else if (selectedArea === 'NUMERACY') {
              initialStates[st.id] = {
                ...base,
                subjectArea: 'NUMERACY',
                mathLevel: '',
                accuracy: ''
              } as any;
            }
          }
        });

        setStudentRecords(initialStates);
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
  }, [selectedYear, selectedGradeLevel, selectedClassId, selectedPeriod, selectedArea, classes, profile]);

  // Handle cell changes
  const handleCellChange = (studentId: string, field: string, value: any) => {
    setStudentRecords(prev => {
      const current = prev[studentId] || {};
      const updated = { ...current, [field]: value } as any;

      if (selectedArea === 'ENGLISH_READING') {
        const wordsRaw = field === 'wordsRead' ? value : updated.wordsRead;
        const errsRaw = field === 'errors' ? value : updated.errors;

        const hasWords = wordsRaw !== '' && wordsRaw !== undefined && wordsRaw !== null;
        const hasErrs = errsRaw !== '' && errsRaw !== undefined && errsRaw !== null;
        
        if (hasWords && hasErrs) {
          const wpmVal = calculateWpm(Number(wordsRaw), Number(errsRaw));
          updated.wpm = wpmVal;
        } else {
          updated.wpm = '';
        }
        updated.wordsRead = wordsRaw;
        updated.errors = errsRaw;

        // Auto-calculate live Risk Level if in English Reading & Spring Assessment 3
        const studentGrade = updated.gradeLevel || selectedGradeLevel;
        const wpmVal = (updated.wpm !== '' && updated.wpm !== undefined && updated.wpm !== null) ? Number(updated.wpm) : null;
        if (selectedPeriod === 'SPRING_ASSESSMENT_3' && isJuniorHighOrfGrade(studentGrade) && wpmVal !== null) {
          updated.riskLevel = getOralReadingFluencyRiskLevel(studentGrade, wpmVal);
          updated.riskBenchmark = 'SPRING_ASSESSMENT_3';
          updated.riskGrade = studentGrade;
          updated.riskCalculatedAt = Date.now();
        } else {
          updated.riskLevel = null;
          updated.riskBenchmark = null;
          updated.riskGrade = null;
          updated.riskCalculatedAt = null;
        }
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

  // Unify validate & enrich record values before Firestore submission
  const validateAndEnrichRecord = (rawRecord: any) => {
    const rec = { ...rawRecord };
    
    rec.unit = 'JUNIOR_HIGH';
    rec.sessionKey = selectedPeriod;
    rec.sessionLabel = getPeriodLabel(selectedPeriod);
    rec.subjectArea = selectedArea;
    rec.updatedBy = profile?.uid || profile?.id || 'unknown';

    // Backwards compatibility mappings
    rec.period = selectedPeriod;
    rec.area = selectedArea;
    rec.teacherId = rec.updatedBy;

    if (selectedArea === 'BAHASA_INDONESIA') {
      rec.readingLevel = rec.readingLevel || '';
      rec.readingComprehension = rec.readingComprehension !== '' && rec.readingComprehension !== undefined && rec.readingComprehension !== null
        ? Math.min(100, Math.max(0, Number(rec.readingComprehension)))
        : '';
    } else if (selectedArea === 'ENGLISH_READING') {
      const hasWords = rec.wordsRead !== '' && rec.wordsRead !== undefined && rec.wordsRead !== null;
      const hasErrs = rec.errors !== '' && rec.errors !== undefined && rec.errors !== null;
      
      if (hasWords && hasErrs) {
        rec.wordsRead = Number(rec.wordsRead);
        rec.errors = Number(rec.errors);
        rec.wpm = calculateWpm(rec.wordsRead, rec.errors);
      } else {
        rec.wordsRead = '';
        rec.errors = '';
        rec.wpm = '';
      }
      
      // Auto-calculate live Risk Level if in English Reading & Spring Assessment 3
      const studentGrade = rec.gradeLevel || selectedGradeLevel;
      const wpmVal = (rec.wpm !== '' && rec.wpm !== undefined && rec.wpm !== null) ? Number(rec.wpm) : null;
      if (selectedPeriod === 'SPRING_ASSESSMENT_3' && isJuniorHighOrfGrade(studentGrade) && wpmVal !== null) {
        rec.riskLevel = getOralReadingFluencyRiskLevel(studentGrade, wpmVal);
        rec.riskBenchmark = 'SPRING_ASSESSMENT_3';
        rec.riskGrade = studentGrade;
        rec.riskCalculatedAt = Date.now();
      } else {
        rec.riskLevel = null;
        rec.riskBenchmark = null;
        rec.riskGrade = null;
        rec.riskCalculatedAt = null;
      }
      
      rec.readingLevel = rec.readingLevel || '';
      rec.comprehension = rec.comprehension !== '' && rec.comprehension !== undefined && rec.comprehension !== null
        ? Math.min(100, Math.max(0, Number(rec.comprehension)))
        : '';
    } else if (selectedArea === 'MENGAJI') {
      rec.level = rec.level || '';
      rec.targetLevel = rec.targetLevel || '';
    } else if (selectedArea === 'NUMERACY') {
      rec.mathLevel = rec.mathLevel || '';
      rec.accuracy = rec.accuracy !== '' && rec.accuracy !== undefined && rec.accuracy !== null
        ? Math.min(100, Math.max(0, Number(rec.accuracy)))
        : '';
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
      await juniorHighLiteracyService.saveProgressRecord(validated);
      
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
      await juniorHighLiteracyService.bulkUpsertRecords(recordsToSave);
      
      toast.success(`Berhasil menyimpan penilaian massal untuk ${recordsToSave.length} siswa!`);
      setModifiedIds(new Set());
    } catch (err) {
      console.error('Error batch saving:', err);
      toast.error('Gagal melakukan simpan semua massal');
    } finally {
      setIsSaving(false);
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
          <p className="text-gray-500 text-xs font-medium">Panel input pencatatan perkembangan Bahasa Indonesia, English Reading, Mengaji, & Matematika siswa SMP.</p>
        </div>
        
        {/* FILTERS TOOLBAR */}
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

          {/* Period Selector */}
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 p-1.5 rounded-2xl text-xs font-bold text-gray-600">
            <select 
              value={selectedPeriod} 
              onChange={(e) => setSelectedPeriod(e.target.value as JuniorHighSessionKey)}
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
            className="flex items-center gap-2 bg-slate-950 hover:bg-slate-800 text-white disabled:bg-slate-200 disabled:text-slate-400 shadow-md px-4 py-2 text-xs font-black tracking-wider uppercase transition-all rounded-xl"
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

          {/* MINI OVERVIEW METRICS ROW */}
          <div className="grid grid-cols-1 gap-4">
            <div className="bg-slate-900 text-white rounded-3xl p-5 flex items-center justify-between shadow-xl shadow-slate-900/10 col-span-12">
              <div className="space-y-1.5">
                <span className="text-[10px] font-black tracking-widest text-[#9d9da6] uppercase">Rasio Entri Selesai</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black font-mono tracking-tight text-white">{completedCount}</span>
                  <span className="text-sm font-semibold text-[#9d9da6]">/ {students.length} Siswa SMP</span>
                </div>
                <p className="text-[10px] text-slate-400 font-mono">
                  ({students.length - completedCount} siswa belum lengkap datanya)
                </p>
              </div>

              <div className="h-10 w-px bg-slate-800 hidden sm:block"></div>

              <div className="text-right space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center justify-end gap-1 font-mono">
                  Sesi Aktif
                </p>
                <div className="text-sm font-black text-emerald-400 font-mono uppercase">{getPeriodLabel(selectedPeriod)}</div>
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
                  SPREADSHEET PENILAIAN SMP: {getAreaLabel(selectedArea).toUpperCase()} — {getPeriodLabel(selectedPeriod).toUpperCase()}
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
                <table className="w-full text-left border-collapse min-w-[900px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-[9px] font-black text-slate-400 uppercase tracking-wider">
                      <th className="py-3 px-4 w-48 sticky left-0 bg-slate-50 z-10 border-r border-slate-100 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">Nama Siswa SMP</th>
                      
                      {/* DYNAMIC AREA COLS */}
                      {selectedArea === 'BAHASA_INDONESIA' && (
                        <>
                          <th className="py-3 px-4 text-center">Level Membaca</th>
                          <th className="py-3 px-4 text-center">Pemahaman Bacaan</th>
                        </>
                      )}

                      {selectedArea === 'ENGLISH_READING' && (
                        <>
                          <th className="py-3 px-2 text-center w-24">Grade</th>
                          <th className="py-3 px-2 text-center w-24">Words Read</th>
                          <th className="py-3 px-2 text-center w-24">Errors</th>
                          <th className="py-3 px-2 text-center w-20">WPM</th>
                          <th className="py-3 px-6 text-center w-48 relative">
                            <div className="flex items-center justify-center gap-1">
                              <span>Risk Level</span>
                              <div className="relative group inline-block ml-1">
                                <Info size={14} className="text-slate-400 hover:text-slate-600 cursor-help" />
                                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-72 bg-slate-800 text-white text-[10px] leading-relaxed p-3 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none font-medium normal-case">
                                  <div className="font-bold border-b border-slate-700 pb-1 mb-1.5 text-xs text-center text-indigo-300">Spring Assessment 3 Benchmarks</div>
                                  <div className="space-y-1">
                                    <div className="flex justify-between"><span className="font-black">Grade 7:</span> <span>High (0-119) | Med (120-146) | Low (147+)</span></div>
                                    <div className="flex justify-between"><span className="font-black">Grade 8:</span> <span>High (0-121) | Med (122-146) | Low (147+)</span></div>
                                    <div className="flex justify-between"><span className="font-black">Grade 9:</span> <span>High (0-121) | Med (122-146) | Low (147+)</span></div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </th>
                          <th className="py-3 px-4 text-center">Reading Level</th>
                          <th className="py-3 px-4 text-center">Comprehension</th>
                        </>
                      )}

                      {selectedArea === 'MENGAJI' && (
                        <>
                          <th className="py-3 px-4 text-center">Level</th>
                          <th className="py-3 px-4 text-center">Target Level</th>
                        </>
                      )}

                      {selectedArea === 'NUMERACY' && (
                        <>
                          <th className="py-3 px-4 text-center">Level Math</th>
                          <th className="py-3 px-4 text-center">Accuracy (%)</th>
                        </>
                      )}

                      <th className="py-3 px-4 text-center w-64">Catatan Tambahan</th>
                      <th className="py-3 px-4 text-center w-36">Aksi Simpan Baris</th>
                    </tr>
                  </thead>
                  
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredStudents.map((st) => {
                      const record = studentRecords[st.id] || {};
                      const isModified = modifiedIds.has(st.id);

                      return (
                        <tr
                          key={st.id}
                          className={cn(
                            "hover:bg-slate-50/50 transition-colors",
                            isModified ? "bg-amber-50/10" : ""
                          )}
                        >
                          {/* Name Column Fixed left */}
                          <td className="py-3 px-4 font-black text-slate-800 sticky left-0 bg-white z-10 border-r border-slate-100 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                            <div className="flex flex-col">
                              <span className="truncate max-w-[140px] block">{st.name}</span>
                              <span className="text-[9px] text-slate-400 font-mono uppercase font-semibold">NIS: {st.id}</span>
                            </div>
                          </td>

                          {/* --- BAHASA INDONESIA --- */}
                          {selectedArea === 'BAHASA_INDONESIA' && (
                            <>
                              <td className="py-3 px-4 text-center">
                                <select
                                  value={record.readingLevel || ''}
                                  onChange={e => handleCellChange(st.id, 'readingLevel', e.target.value)}
                                  className={cn("w-56 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-1 font-bold cursor-pointer text-xs focus:outline-none focus:ring-1 focus:bg-white", activeConfig.focusRing)}
                                >
                                  <option value="">-- Pilih Level Membaca --</option>
                                  {BAHASA_INDONESIA_LEVELS.map(lvl => (
                                    <option key={lvl} value={lvl}>{lvl}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="py-3 px-4 text-center">
                                <div className="flex items-center gap-0.5 justify-center">
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={record.readingComprehension ?? ''}
                                    onChange={e => {
                                      const val = e.target.value === '' ? '' : Math.min(100, Math.max(0, Number(e.target.value)));
                                      handleCellChange(st.id, 'readingComprehension', val);
                                    }}
                                    className={cn("w-24 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-1 text-center font-bold focus:outline-none focus:ring-1 focus:bg-white", activeConfig.focusRing)}
                                    placeholder="0-100"
                                  />
                                  <span className="text-[10px] text-slate-400 font-bold">%</span>
                                </div>
                              </td>
                            </>
                          )}

                          {/* --- ENGLISH READING --- */}
                          {selectedArea === 'ENGLISH_READING' && (
                            <>
                              <td className="py-3 px-2 text-center text-xs font-bold text-slate-500">
                                {record.gradeLevel || parseGradeFromClassName(st.className) || selectedGradeLevel ? `Grade ${record.gradeLevel || parseGradeFromClassName(st.className) || selectedGradeLevel}` : 'Grade tidak tersedia'}
                              </td>
                              <td className="py-3 px-2 text-center">
                                <input
                                  type="number"
                                  min="0"
                                  value={record.wordsRead ?? ''}
                                  onChange={e => handleCellChange(st.id, 'wordsRead', e.target.value === '' ? '' : Number(e.target.value))}
                                  className={cn("w-20 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-1 text-center font-bold focus:outline-none focus:ring-1 focus:bg-white", activeConfig.focusRing)}
                                />
                              </td>
                              <td className="py-3 px-2 text-center">
                                <input
                                  type="number"
                                  min="0"
                                  value={record.errors ?? ''}
                                  onChange={e => handleCellChange(st.id, 'errors', e.target.value === '' ? '' : Number(e.target.value))}
                                  className={cn("w-20 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-1 text-center font-bold focus:outline-none focus:ring-1 focus:bg-white", activeConfig.focusRing)}
                                />
                              </td>
                              <td className="py-3 px-2 font-black text-slate-700 text-center">
                                {(record.wpm !== undefined && record.wpm !== null && record.wpm !== '') ? record.wpm : '-'}
                              </td>
                              <td className="py-3 px-4 text-center">
                                {renderRiskLevelBadge(record, selectedPeriod, selectedGradeLevel, st)}
                              </td>
                              <td className="py-3 px-4 text-center">
                                <select
                                  value={record.readingLevel || ''}
                                  onChange={e => handleCellChange(st.id, 'readingLevel', e.target.value)}
                                  className={cn("w-36 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-1 font-bold cursor-pointer text-xs focus:outline-none focus:ring-1 focus:bg-white", activeConfig.focusRing)}
                                >
                                  <option value="">-- Pilih Level --</option>
                                  {ENGLISH_READING_LEVELS.map(lvl => (
                                    <option key={lvl} value={lvl}>{lvl}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="py-3 px-4 text-center">
                                <div className="flex items-center gap-0.5 justify-center">
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={record.comprehension ?? ''}
                                    onChange={e => {
                                      const val = e.target.value === '' ? '' : Math.min(100, Math.max(0, Number(e.target.value)));
                                      handleCellChange(st.id, 'comprehension', val);
                                    }}
                                    className={cn("w-24 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-1 text-center font-bold focus:outline-none focus:ring-1 focus:bg-white", activeConfig.focusRing)}
                                    placeholder="0-100"
                                  />
                                  <span className="text-[10px] text-slate-400 font-bold">%</span>
                                </div>
                              </td>
                            </>
                          )}

                          {/* --- MENGAJI --- */}
                          {selectedArea === 'MENGAJI' && (
                            <>
                              <td className="py-3 px-4 text-center">
                                <select
                                  value={record.level || ''}
                                  onChange={e => handleCellChange(st.id, 'level', e.target.value)}
                                  className={cn("w-40 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-1 font-bold cursor-pointer text-xs focus:outline-none focus:ring-1 focus:bg-white", activeConfig.focusRing)}
                                >
                                  <option value="">-- Pilih Level --</option>
                                  {MENGAJI_LEVELS.map(lvl => (
                                    <option key={lvl} value={lvl}>{lvl}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="py-3 px-4 text-center">
                                <select
                                  value={record.targetLevel || ''}
                                  onChange={e => handleCellChange(st.id, 'targetLevel', e.target.value)}
                                  className={cn("w-40 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-1 font-bold cursor-pointer text-xs focus:outline-none focus:ring-1 focus:bg-white", activeConfig.focusRing)}
                                >
                                  <option value="">-- Pilih Target --</option>
                                  {MENGAJI_LEVELS.map(lvl => (
                                    <option key={lvl} value={lvl}>{lvl}</option>
                                  ))}
                                </select>
                              </td>
                            </>
                          )}

                          {/* --- NUMERACY --- */}
                          {selectedArea === 'NUMERACY' && (
                            <>
                              <td className="py-3 px-4 text-center">
                                <select
                                  value={record.mathLevel || ''}
                                  onChange={e => handleCellChange(st.id, 'mathLevel', e.target.value)}
                                  className={cn("w-44 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-1 font-bold cursor-pointer text-xs focus:outline-none focus:ring-1 focus:bg-white", activeConfig.focusRing)}
                                >
                                  <option value="">-- Pilih Level Math --</option>
                                  {NUMERACY_LEVELS.map(lvl => (
                                    <option key={lvl} value={lvl}>{lvl}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="py-3 px-4 text-center">
                                <div className="flex items-center gap-0.5 justify-center">
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={record.accuracy ?? ''}
                                    onChange={e => {
                                      const val = e.target.value === '' ? '' : Math.min(100, Math.max(0, Number(e.target.value)));
                                      handleCellChange(st.id, 'accuracy', val);
                                    }}
                                    className={cn("w-24 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-1 text-center font-bold focus:outline-none focus:ring-1 focus:bg-white", activeConfig.focusRing)}
                                    placeholder="0-100"
                                  />
                                  <span className="text-[10px] text-slate-400 font-bold">%</span>
                                </div>
                              </td>
                            </>
                          )}

                          {/* CATATAN TAMBAHAN */}
                          <td className="py-3 px-4">
                            <textarea
                              rows={1}
                              placeholder="Ketik catatan di sini..."
                              value={record.notes || ''}
                              onChange={e => handleCellChange(st.id, 'notes', e.target.value)}
                              className={cn("w-full bg-slate-50/60 hover:bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-[11px] outline-none font-medium resize-y focus:ring-1 focus:bg-white min-h-[32px]", activeConfig.focusRing)}
                            />
                          </td>

                          {/* ACTION BUTTON COLUMN */}
                          <td className="py-3 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => handleSaveRow(st.id)}
                              className={cn(
                                "flex items-center gap-1.5 justify-center mx-auto px-4 py-1.5 rounded-xl text-[10px] uppercase font-black tracking-wider transition-all duration-150 cursor-pointer w-full focus:outline-none focus:ring-2",
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

</div>
);
}
