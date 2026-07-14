import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, Languages, Heart, Calculator, Search, 
  History, ChevronRight, Save, User as UserIcon, 
  Calendar, RefreshCw, CheckCircle2, AlertCircle, FileText, X, Sparkles, Sliders,
  HelpCircle, Info
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { db, handleFirestoreError, getStudents, getClasses, getActiveStudents } from '../../lib/firebase';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { collection, query, where, getDocs, doc, setDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import { ACADEMIC_YEARS } from '../../constants';
import JuniorHighLiteracyOverview from './components/JuniorHighLiteracyOverview';
import { juniorHighLiteracyService } from '../../services/juniorHighLiteracyService';
import { 
  JuniorHighArea, 
  JuniorHighPeriod, 
  JuniorHighProgressRecord, 
  JuniorHighSupportStatus 
} from '../../types/juniorHighLiteracyNumeracy';
import { 
  calculateWpm, 
  getReadingSupportStatus, 
  getMengajiSupportStatus, 
  getSupportStatusLabel, 
  getAreaLabel, 
  getPeriodLabel 
} from '../../constants/juniorHighLiteracyBenchmarks';

// Selection lists in theme palette for SMP
const AREAS: { id: JuniorHighArea; label: string; icon: React.ReactNode; colorClass: string; activeColor: string }[] = [
  { id: 'BAHASA_INDONESIA', label: 'Bahasa Indonesia', icon: <BookOpen className="w-4 h-4" />, colorClass: 'text-blue-600 bg-blue-50 border-blue-100', activeColor: 'bg-blue-600 text-white' },
  { id: 'ENGLISH_READING', label: 'English Reading', icon: <Languages className="w-4 h-4" />, colorClass: 'text-indigo-600 bg-indigo-50 border-indigo-100', activeColor: 'bg-indigo-600 text-white' },
  { id: 'MENGAJI', label: 'Mengaji', icon: <Heart className="w-4 h-4" />, colorClass: 'text-emerald-600 bg-emerald-50 border-emerald-100', activeColor: 'bg-emerald-600 text-white' },
  { id: 'NUMERACY', label: 'Numerasi (Math)', icon: <Calculator className="w-4 h-4" />, colorClass: 'text-purple-600 bg-purple-50 border-purple-100', activeColor: 'bg-purple-600 text-white' },
];

const PERIODS: { value: JuniorHighPeriod; label: string }[] = [
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

export interface JuniorHighStudent {
  id: string; // NIS
  name: string;
  classId: string;
  className: string;
}

export default function JuniorHighLiteracyNumeracy() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { activeYear } = useAcademicYear();
  
  // Filters State
  const [selectedArea, setSelectedArea] = React.useState<JuniorHighArea>('BAHASA_INDONESIA');
  const [selectedClassId, setSelectedClassId] = React.useState<string>('');
  const [selectedGradeLevel, setSelectedGradeLevel] = React.useState<number>(7);
  const [selectedYear, setSelectedYear] = React.useState<string>(activeYear || '2025/2026');
  const [selectedPeriod, setSelectedPeriod] = React.useState<JuniorHighPeriod>('JUL_OCT');
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const [activeView, setActiveView] = React.useState<'input' | 'overview'>('input');

  // Loaded students & metadata
  const [classes, setClasses] = React.useState<any[]>([]);
  const [students, setStudents] = React.useState<JuniorHighStudent[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [loadingStudents, setLoadingStudents] = React.useState<boolean>(false);
  const [isSaving, setIsSaving] = React.useState<boolean>(false);

  // Per-student form record map linking student ID to draft values
  const [studentRecords, setStudentRecords] = React.useState<Record<string, Partial<JuniorHighProgressRecord>>>({});
  const [modifiedIds, setModifiedIds] = React.useState<Set<string>>(new Set());

  // Bulk input help
  const [bulkTopic, setBulkTopic] = React.useState<string>('');
  const [bulkMathLevel, setBulkMathLevel] = React.useState<string>('');

  // Class History modal
  const [showHistory, setShowHistory] = React.useState<boolean>(false);
  const [historyRecords, setHistoryRecords] = React.useState<JuniorHighProgressRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = React.useState<boolean>(false);

  // Track specifically clicked single student history drawer
  const [selectedStudentForDrawer, setSelectedStudentForDrawer] = React.useState<{ id: string; name: string } | null>(null);

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
          c => c.unitId === 'JUNIOR_HIGH' && c.status !== 'archived'
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
  }, [profile]);

  // Parse Junior High grade level from the active class selection name
  React.useEffect(() => {
    if (selectedClassId && classes.length > 0) {
      const activeClass = classes.find(c => c.id === selectedClassId);
      if (activeClass) {
        const match = activeClass.name.match(/\d+/);
        if (match) {
          setSelectedGradeLevel(Number(match[0]));
        } else {
          // Default fallback for SMP
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
              return s.currentUnit === 'JUNIOR_HIGH' && (matchesId || matchesName);
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

  // Handle cell changes with live status evaluation
  const handleCellChange = (studentId: string, field: string, value: any) => {
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

  return (
    <div className="space-y-6 pb-16">
      {/* HEADER SECTION */}
      <header className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 text-[9px] uppercase tracking-widest font-black bg-indigo-50 text-indigo-700 rounded-lg">JUNIOR HIGH UNIT</span>
            <span className="text-gray-300">•</span>
            <span className="text-xs font-bold text-gray-500">Pusat Penilaian Akademik SMP</span>
          </div>
          <h1 className="text-2xl font-black text-gray-950 tracking-tight flex items-center gap-2 italic uppercase">
            LUMINA LITERASI & NUMERASI SMP
          </h1>
          <p className="text-gray-500 text-xs font-medium">Panel input pencatatan perkembangan Bahasa Indonesia, English, Mengaji, & Matematika siswa SMP.</p>
        </div>
        
        {/* FILTERS TOOLBAR */}
        <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
          {/* Class Select Dropdown */}
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 p-1.5 rounded-2xl text-xs font-bold text-gray-600">
            <Sliders size={14} className="text-gray-400 ml-1" />
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
              onChange={(e) => setSelectedPeriod(e.target.value as JuniorHighPeriod)}
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
            {AREAS.map((ar) => {
              const isActive = selectedArea === ar.id;
              return (
                <button
                  key={ar.id}
                  type="button"
                  onClick={() => setSelectedArea(ar.id)}
                  className={cn(
                    "flex items-center justify-between p-4 rounded-2xl border transition-all text-left relative overflow-hidden cursor-pointer",
                    isActive 
                      ? "bg-slate-900 border-slate-900 text-white shadow-lg shadow-slate-950/5 font-extrabold" 
                      : "bg-white border-gray-100 text-slate-700 hover:bg-slate-50/50"
                  )}
                >
                  <div className="space-y-1 z-10">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">
                      Area Pembelajaran
                    </span>
                    <span className="text-xs sm:text-sm block font-black">{ar.label}</span>
                  </div>
                  <div className={cn("p-2 rounded-xl z-10", isActive ? "bg-white/10" : "bg-slate-50/80")}>
                    {ar.icon}
                  </div>
                </button>
              );
            })}
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
                  <span className="text-sm font-semibold text-[#9d9da6]">/ {students.length} Siswa SMP</span>
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
                      placeholder="Contoh: Aljabar Linear"
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
                      placeholder="Contoh: Level SMP-3"
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
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            {/* Table Search & Header */}
            <div className="p-5 border-b border-gray-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="p-1 px-2.5 bg-slate-50 text-slate-700 rounded-lg text-xs font-black">
                  {filteredStudents.length} Siswa SMP
                </div>
                <h2 className="text-xs font-black text-slate-800 uppercase tracking-widest">
                  SPREADSHEET PENILAIAN SMP: {getAreaLabel(selectedArea)} ({getPeriodLabel(selectedPeriod)})
                </h2>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3.5 top-2.5 text-slate-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Cari siswa SMP..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-100 text-xs px-9 py-2 rounded-xl outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>
            </div>

            {/* SPREADSHEET TABLE IMPLEMENTATION */}
            {loadingStudents ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-3 text-slate-400">
                <RefreshCw size={32} className="animate-spin text-indigo-600" />
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
                      <th className="py-3 px-4 w-40 sticky left-0 bg-slate-50 z-10 border-r border-slate-100 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">Nama Siswa SMP</th>
                      
                      {/* DYNAMIC AREA COLS */}
                      {selectedArea === 'BAHASA_INDONESIA' && (
                        <>
                          <th className="py-3 px-2 w-20 text-center">Words Read</th>
                          <th className="py-3 px-2 w-20 text-center">Errors</th>
                          <th className="py-3 px-2 w-16 text-center">WPM</th>
                          <th className="py-3 px-2 w-28 text-center">Reading Level</th>
                          <th className="py-3 px-2 w-28 text-center">Comprehension</th>
                        </>
                      )}

                      {selectedArea === 'ENGLISH_READING' && (
                        <>
                          <th className="py-3 px-2 w-20 text-center">Words Read</th>
                          <th className="py-3 px-2 w-20 text-center">Errors</th>
                          <th className="py-3 px-2 w-16 text-center">WPM</th>
                          <th className="py-3 px-2 w-32 text-center">Reading Level</th>
                          <th className="py-3 px-2 w-28 text-center">Comprehension</th>
                        </>
                      )}

                      {selectedArea === 'MENGAJI' && (
                        <>
                          <th className="py-3 px-2 w-24 text-center">Level</th>
                          <th className="py-3 px-2 w-28 text-center">Current Checkpoint</th>
                          <th className="py-3 px-2 w-24 text-center">Target Level</th>
                          <th className="py-3 px-2 w-32 text-center">Status Kelulusan</th>
                          <th className="py-3 px-2 w-36 text-center">Catatan Huruf</th>
                          <th className="py-3 px-2 w-36 text-center">Catatan Tajwid</th>
                        </>
                      )}

                      {selectedArea === 'NUMERACY' && (
                        <>
                          <th className="py-3 px-2 w-28 text-center">Math Level</th>
                          <th className="py-3 px-2 w-44 text-center">Topik</th>
                          <th className="py-3 px-2 w-24 text-center">Accuracy (%)</th>
                        </>
                      )}

                      <th className="py-3 px-4 w-32 text-center">
                        <div className="flex flex-col items-center gap-1.5">
                          <span>Intervensi</span>
                          <button
                            type="button"
                            onClick={applyBulkTier1}
                            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/60 px-1.5 py-0.5 rounded-lg text-[8px] font-black tracking-wider uppercase transition-colors cursor-pointer whitespace-nowrap block"
                            title="Set seluruh siswa menjadi Tier 1"
                          >
                            Set Tier 1 Semua
                          </button>
                        </div>
                      </th>
                      <th className="py-3 px-4 w-44 text-center">Catatan Tambahan</th>
                      <th className="py-3 px-4 w-24 text-center">Aksi Save Baris</th>
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
                            isModified ? "bg-amber-50/20" : ""
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
                              <td className="py-3 px-2 text-center">
                                <input
                                  type="number"
                                  min="0"
                                  value={record.wordsRead ?? ''}
                                  onChange={e => handleCellChange(st.id, 'wordsRead', e.target.value === '' ? '' : Number(e.target.value))}
                                  className="w-16 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-1 text-center font-bold"
                                />
                              </td>
                              <td className="py-3 px-2 text-center">
                                <input
                                  type="number"
                                  min="0"
                                  value={record.errors ?? ''}
                                  onChange={e => handleCellChange(st.id, 'errors', e.target.value === '' ? '' : Number(e.target.value))}
                                  className="w-16 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-1 text-center font-bold"
                                />
                              </td>
                              <td className="py-3 px-2 font-black text-slate-700 text-center">
                                {(record.wpm !== undefined && record.wpm !== null && record.wpm !== '') ? record.wpm : '-'}
                              </td>
                              <td className="py-3 px-2 text-center">
                                <select
                                  value={record.readingLevel || 'IR'}
                                  onChange={e => handleCellChange(st.id, 'readingLevel', e.target.value)}
                                  className="w-24 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-1 font-bold cursor-pointer"
                                >
                                  {READING_LEVEL_OPTIONS.map(lvl => (
                                    <option key={lvl} value={lvl}>{lvl}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="py-3 px-2">
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
                                    className="bg-slate-50 border border-slate-200 rounded-lg px-1 py-1 text-[10px] font-bold cursor-pointer outline-none"
                                  >
                                    <option value="DATA">Data</option>
                                    <option value="NA">N/A</option>
                                  </select>
                                  <div className="flex items-center gap-0.5">
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      disabled={record.comprehensionScore === 'N/A' || record.comprehensionScore === null}
                                      value={(record.comprehensionScore === 'N/A' || record.comprehensionScore === null || record.comprehensionScore === undefined) ? '' : record.comprehensionScore}
                                      onChange={e => handleCellChange(st.id, 'comprehensionScore', e.target.value === '' ? '' : Number(e.target.value))}
                                      className={cn(
                                        "w-11 border rounded-lg px-1 py-1 text-center font-bold text-[11px]",
                                        (record.comprehensionScore === 'N/A' || record.comprehensionScore === null) 
                                          ? "bg-slate-100 border-slate-200 text-slate-300 cursor-not-allowed" 
                                          : "bg-slate-50/60 border-slate-200 text-slate-800"
                                      )}
                                      placeholder={record.comprehensionScore === 'N/A' || record.comprehensionScore === null ? 'N/A' : ''}
                                    />
                                    <span className="text-[9px] text-slate-400 font-bold">%</span>
                                  </div>
                                </div>
                              </td>
                            </>
                          )}

                          {/* --- ENGLISH READING --- */}
                          {selectedArea === 'ENGLISH_READING' && (
                            <>
                              <td className="py-3 px-2 text-center">
                                <input
                                  type="number"
                                  min="0"
                                  value={record.wordsRead ?? ''}
                                  onChange={e => handleCellChange(st.id, 'wordsRead', e.target.value === '' ? '' : Number(e.target.value))}
                                  className="w-16 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-1 text-center font-bold"
                                />
                              </td>
                              <td className="py-3 px-2 text-center">
                                <input
                                  type="number"
                                  min="0"
                                  value={record.errors ?? ''}
                                  onChange={e => handleCellChange(st.id, 'errors', e.target.value === '' ? '' : Number(e.target.value))}
                                  className="w-16 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-1 text-center font-bold"
                                />
                              </td>
                              <td className="py-3 px-2 font-black text-slate-700 text-center">
                                {(record.wpm !== undefined && record.wpm !== null && record.wpm !== '') ? record.wpm : '-'}
                              </td>
                              <td className="py-3 px-2 text-center">
                                <select
                                  value={record.readingLevel || 'IR'}
                                  onChange={e => handleCellChange(st.id, 'readingLevel', e.target.value)}
                                  className="w-28 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-1 font-bold cursor-pointer"
                                >
                                  {READING_LEVEL_OPTIONS.map(lvl => (
                                    <option key={lvl} value={lvl}>{lvl}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="py-3 px-2">
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
                                    className="bg-slate-50 border border-slate-200 rounded-lg px-1 py-1 text-[10px] font-bold cursor-pointer outline-none"
                                  >
                                    <option value="DATA">Data</option>
                                    <option value="NA">N/A</option>
                                  </select>
                                  <div className="flex items-center gap-0.5">
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      disabled={record.comprehensionScore === 'N/A' || record.comprehensionScore === null}
                                      value={(record.comprehensionScore === 'N/A' || record.comprehensionScore === null || record.comprehensionScore === undefined) ? '' : record.comprehensionScore}
                                      onChange={e => handleCellChange(st.id, 'comprehensionScore', e.target.value === '' ? '' : Number(e.target.value))}
                                      className={cn(
                                        "w-11 border rounded-lg px-1 py-1 text-center font-bold text-[11px]",
                                        (record.comprehensionScore === 'N/A' || record.comprehensionScore === null) 
                                          ? "bg-slate-100 border-slate-200 text-slate-300 cursor-not-allowed" 
                                          : "bg-slate-50/60 border-slate-200 text-slate-800"
                                      )}
                                      placeholder={record.comprehensionScore === 'N/A' || record.comprehensionScore === null ? 'N/A' : ''}
                                    />
                                    <span className="text-[9px] text-slate-400 font-bold">%</span>
                                  </div>
                                </div>
                              </td>
                            </>
                          )}

                          {/* --- MENGAJI --- */}
                          {selectedArea === 'MENGAJI' && (
                            <>
                              <td className="py-3 px-2 text-center">
                                <input
                                  type="text"
                                  placeholder=""
                                  value={record.iqroCurrentLevel ?? ''}
                                  onChange={e => handleCellChange(st.id, 'iqroCurrentLevel', e.target.value)}
                                  className="w-16 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-1 text-center font-bold"
                                />
                              </td>
                              <td className="py-3 px-2 text-center">
                                <textarea
                                  rows={getRows(record.iqroCurrentCheckpoint || '')}
                                  placeholder=""
                                  value={record.iqroCurrentCheckpoint || ''}
                                  onChange={e => handleCellChange(st.id, 'iqroCurrentCheckpoint', e.target.value)}
                                  className="w-24 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-1 font-bold text-center resize-y text-[11px] focus:ring-1 focus:ring-slate-900 focus:bg-white"
                                />
                              </td>
                              <td className="py-3 px-2 text-center">
                                <input
                                  type="text"
                                  placeholder=""
                                  value={record.targetIqroLevel ?? ''}
                                  onChange={e => handleCellChange(st.id, 'targetIqroLevel', e.target.value)}
                                  className="w-16 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-1 text-center font-bold"
                                />
                              </td>
                              <td className="py-3 px-2 text-center">
                                <select
                                  value={record.completionStatus || ''}
                                  onChange={e => handleCellChange(st.id, 'completionStatus', e.target.value)}
                                  className="w-28 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-1 font-bold cursor-pointer text-[10px]"
                                >
                                  <option value="">-- Pilih --</option>
                                  <option value="BELUM_DINILAI">Belum Dinilai</option>
                                  <option value="ON_PROGRESS">On Progress</option>
                                  <option value="LULUS">Lulus</option>
                                  <option value="TIDAK_LULUS">Belum Lulus</option>
                                </select>
                              </td>
                              <td className="py-3 px-2 text-center">
                                <textarea
                                  rows={getRows(record.letterRecognitionNote || '')}
                                  placeholder=""
                                  value={record.letterRecognitionNote || ''}
                                  onChange={e => handleCellChange(st.id, 'letterRecognitionNote', e.target.value)}
                                  className="w-32 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-1 font-medium text-[11px] resize-y focus:ring-1 focus:ring-slate-900 focus:bg-white"
                                />
                              </td>
                              <td className="py-3 px-2 text-center">
                                <textarea
                                  rows={getRows(record.tajwidNote || '')}
                                  placeholder=""
                                  value={record.tajwidNote || ''}
                                  onChange={e => handleCellChange(st.id, 'tajwidNote', e.target.value)}
                                  className="w-32 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-1 font-medium text-[11px] resize-y focus:ring-1 focus:ring-slate-900 focus:bg-white"
                                />
                              </td>
                            </>
                          )}

                          {/* --- NUMERACY (MATH) --- */}
                          {selectedArea === 'NUMERACY' && (
                            <>
                              <td className="py-3 px-2 text-center">
                                <input
                                  type="text"
                                  placeholder="Level"
                                  value={record.mathLevel || ''}
                                  onChange={e => handleCellChange(st.id, 'mathLevel', e.target.value)}
                                  className="w-24 bg-slate-50/60 border border-slate-200 rounded-lg px-2.5 py-1 font-bold text-center"
                                />
                              </td>
                              <td className="py-3 px-2 text-center">
                                <textarea
                                  rows={getRows(record.topic || '')}
                                  placeholder=""
                                  value={record.topic || ''}
                                  onChange={e => handleCellChange(st.id, 'topic', e.target.value)}
                                  className="w-40 bg-slate-50/60 border border-slate-200 rounded-lg px-2.5 py-1 font-medium text-[11px] resize-y focus:ring-1 focus:ring-slate-900 focus:bg-white"
                                />
                              </td>
                              <td className="py-3 px-2 text-center">
                                <div className="flex items-center gap-0.5 justify-center">
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={record.accuracy ?? ''}
                                    onChange={e => handleCellChange(st.id, 'accuracy', e.target.value === '' ? '' : Number(e.target.value))}
                                    className="w-14 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-1 text-center font-bold"
                                  />
                                  <span className="text-[10px] text-slate-400 font-bold">%</span>
                                </div>
                              </td>
                            </>
                          )}

                          {/* INTERVENSI SELECT dropdown */}
                          <td className="py-3 px-4 text-center font-bold">
                            <select
                              value={record.supportStatus || 'INCOMPLETE_DATA'}
                              onChange={e => handleCellChange(st.id, 'supportStatus', e.target.value)}
                              className={cn(
                                "text-[11px] font-black tracking-wider uppercase rounded-xl px-2.5 py-1 text-center outline-none cursor-pointer border w-36 transition-colors",
                                record.supportStatus === 'ON_TRACK' && "bg-emerald-50 text-emerald-700 border-emerald-200 focus:ring-1 focus:ring-emerald-500",
                                record.supportStatus === 'MONITOR' && "bg-yellow-50 text-yellow-700 border-yellow-200 focus:ring-1 focus:ring-yellow-500",
                                record.supportStatus === 'NEEDS_SUPPORT' && "bg-orange-50 text-orange-700 border-orange-200 focus:ring-1 focus:ring-orange-500",
                                record.supportStatus === 'INTERVENTION_RECOMMENDED' && "bg-purple-50 text-purple-700 border-purple-200 focus:ring-1 focus:ring-purple-500",
                                (record.supportStatus === 'INCOMPLETE_DATA' || !record.supportStatus) && "bg-slate-50 text-slate-500 border-slate-200 focus:ring-1 focus:ring-slate-400"
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
                          <td className="py-3 px-4">
                            <textarea
                              rows={getRows(record.notes || '')}
                              placeholder="Ketik catatan di sini..."
                              value={record.notes || ''}
                              onChange={e => handleCellChange(st.id, 'notes', e.target.value)}
                              className="w-44 bg-slate-50/60 hover:bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-[11px] outline-none font-medium resize-y focus:ring-1 focus:ring-slate-900 focus:bg-white"
                            />
                          </td>

                          {/* ACTION BUTTON COLUMN */}
                          <td className="py-3 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => handleSaveRow(st.id)}
                              className={cn(
                                "flex items-center gap-1.5 justify-center mx-auto px-3 py-1.5 rounded-xl text-[10px] uppercase font-black tracking-wider transition-all cursor-pointer",
                                isModified 
                                  ? "bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/10" 
                                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
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
                      SIMPAN SEMUA ({filteredStudents.length} SISWA SMP)
                    </>
                  )
                  }
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
                    <span>RIWAYAT KELAS SMP</span>
                    <span>•</span>
                    <span className="text-slate-900">{classes.find(c => c.id === selectedClassId)?.name || 'SMP'}</span>
                  </div>
                  <h3 className="text-base font-black text-slate-950 uppercase tracking-wider italic">
                    Ringkasan Penilaian {getAreaLabel(selectedArea)} (SMP)
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
                    <p className="text-[10px] text-gray-400 mt-1 max-w-xs leading-normal">Belum ada siswa di kelas SMP ini yang dinilai untuk area dan periode terpilih.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-gray-100">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-gray-100 text-slate-500 uppercase tracking-wider font-black text-[9px]">
                          <th className="py-3 px-4">Nama Siswa SMP</th>
                          
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

    </div>
  );
}
