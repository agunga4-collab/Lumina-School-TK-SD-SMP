import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  Filter,
  Loader2,
  CheckCircle,
  Search,
  RefreshCw,
  AlertCircle,
  Sparkles,
  ChevronRight,
  BookOpen,
  Languages,
  Heart,
  Calculator,
  User as UserIcon,
  HelpCircle,
  TrendingUp
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { getClasses, getActiveStudents, getStudents } from '../../lib/firebase';
import { ACADEMIC_YEARS } from '../../constants';
import {
  ElementaryProgressRecord,
  ElementaryArea,
  ElementaryPeriod,
  ElementarySupportStatus,
  BahasaIndonesiaProgress,
  EnglishReadingProgress,
  MengajiProgress,
  NumeracyProgress,
  ELEMENTARY_AREAS,
  ELEMENTARY_PERIODS
} from '../../types/elementaryLiteracyNumeracy';
import {
  calculateWpm,
  getReadingSupportStatus,
  getMengajiSupportStatus,
  getAreaLabel,
  getPeriodLabel,
  getSupportStatusLabel
} from '../../constants/elementaryLiteracyBenchmarks';
import { elementaryLiteracyService } from '../../services/elementaryLiteracyService';
import { toast } from 'sonner';

// Standard Reading Levels available for selection
const READING_LEVEL_OPTIONS = ['IR+', 'IR', 'IR-', 'IR-EN', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

export default function ElementaryLiteracyInputPage() {
  const { profile } = useAuth();
  const { activeYear } = useAcademicYear();
  const navigate = useNavigate();

  // Filters State
  const [selectedSchoolYear, setSelectedSchoolYear] = React.useState<string>(activeYear || '2025/2026');
  const [selectedGradeLevel, setSelectedGradeLevel] = React.useState<number>(1);
  const [selectedClassId, setSelectedClassId] = React.useState<string>('');
  const [selectedPeriod, setSelectedPeriod] = React.useState<ElementaryPeriod>('JUL_OCT');
  const [selectedArea, setSelectedArea] = React.useState<ElementaryArea>('BAHASA_INDONESIA');
  const [searchQuery, setSearchQuery] = React.useState<string>('');

  // Loaded metadata
  const [classes, setClasses] = React.useState<any[]>([]);
  const [students, setStudents] = React.useState<any[]>([]);
  
  // Loading & Saving States
  const [loadingMetadata, setLoadingMetadata] = React.useState<boolean>(true);
  const [loadingStudents, setLoadingStudents] = React.useState<boolean>(false);
  const [isSaving, setIsSaving] = React.useState<boolean>(false);

  // Per-student input forms state record mapping studentId to their form entry
  const [studentRecords, setStudentRecords] = React.useState<Record<string, Partial<ElementaryProgressRecord>>>({});
  // Track modified student ids to display stats and prevent accidental page exits
  const [modifiedIds, setModifiedIds] = React.useState<Set<string>>(new Set());

  // Bulk action pre-fill helpers
  const [bulkTopic, setBulkTopic] = React.useState<string>('');
  const [bulkMathLevel, setBulkMathLevel] = React.useState<string>('');

  // Sync default school year when global context updates
  React.useEffect(() => {
    if (activeYear) {
      setSelectedSchoolYear(activeYear);
    }
  }, [activeYear]);

  // Load elementary classes on mount
  React.useEffect(() => {
    const loadMetadata = async () => {
      try {
        setLoadingMetadata(true);
        const allClasses = await getClasses() || [];
        const elementaryClasses = allClasses.filter(
          c => c.unitId === 'ELEMENTARY' && c.status !== 'archived'
        );
        setClasses(elementaryClasses);

        // Auto-select class ID based on role or take the first one
        let defaultClassId = '';
        if (profile?.role === 'HOMEROOM_TEACHER') {
          const homeroomClass = elementaryClasses.find(c => c.homeroomTeacherId === profile?.uid);
          if (homeroomClass) {
            defaultClassId = homeroomClass.id;
            // Determine corresponding grade level from class name if possible
            const match = homeroomClass.name.match(/\d+/);
            if (match) {
              setSelectedGradeLevel(Number(match[0]));
            }
          }
        }

        if (!defaultClassId && elementaryClasses.length > 0) {
          defaultClassId = elementaryClasses[0].id;
          const match = elementaryClasses[0].name.match(/\d+/);
          if (match) {
            setSelectedGradeLevel(Number(match[0]));
          }
        }

        setSelectedClassId(defaultClassId);
      } catch (err) {
        console.error('Error fetching class metadata:', err);
        toast.error('Gagal mengambil metadata kelas');
      } finally {
        setLoadingMetadata(false);
      }
    };

    if (profile) {
      loadMetadata();
    }
  }, [profile]);

  // Handle grade level selection to automatically suggest associated classrooms
  const handleGradeChange = (grade: number) => {
    setSelectedGradeLevel(grade);
    // Find first classroom in metadata that matches the grade number
    const matchingClass = classes.find(c => c.name.toLowerCase().includes(`grade ${grade}`) || c.name.includes(String(grade)));
    if (matchingClass) {
      setSelectedClassId(matchingClass.id);
    }
  };

  // Load students and their existing records whenever filters change
  React.useEffect(() => {
    const loadClassAndRecords = async () => {
      if (!selectedClassId) return;
      try {
        setLoadingStudents(true);
        setModifiedIds(new Set());

        // 1. Fetch Students (using dynamic active registry query, fallback to global list filtered locally)
        let classStudents: any[] = [];
        const activeS = await getActiveStudents(selectedClassId, selectedSchoolYear);
        if (activeS && activeS.length > 0) {
          classStudents = activeS.map(s => ({
            id: s.id,
            name: s.name,
            classId: s.classId
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
              classId: s.classId || selectedClassId
            }));
        }

        // Sort students alphabetically
        classStudents.sort((a, b) => a.name.localeCompare(b.name));
        setStudents(classStudents);

        // 2. Fetch existing progress records for the filtered selection
        const existingRecords = await elementaryLiteracyService.getRecordsByClass(
          selectedSchoolYear,
          selectedGradeLevel,
          selectedClassId,
          selectedPeriod,
          selectedArea
        );

        // Convert existing records list to student ID mapping
        const recordMap: Record<string, ElementaryProgressRecord> = {};
        existingRecords.forEach(rec => {
          recordMap[rec.studentId] = rec;
        });

        // 3. Initialize default structures for each student in local form state
        const initialStates: Record<string, Partial<ElementaryProgressRecord>> = {};
        classStudents.forEach(st => {
          const existing = recordMap[st.id];

          if (existing) {
            initialStates[st.id] = { ...existing };
          } else {
            // Build fresh blank records reflecting specific schema defaults
            const base: Omit<ElementaryProgressRecord, 'updatedAt'> = {
              studentId: st.id,
              studentName: st.name,
              classId: selectedClassId,
              gradeLevel: selectedGradeLevel,
              schoolYear: selectedSchoolYear,
              period: selectedPeriod,
              area: selectedArea,
              teacherId: profile?.uid || profile?.id || 'unknown',
              supportStatus: 'INCOMPLETE_DATA',
              notes: ''
            };

            if (selectedArea === 'BAHASA_INDONESIA') {
              initialStates[st.id] = {
                ...base,
                wordsRead: 0,
                errors: 0,
                wpm: 0,
                readingLevel: 'IR',
                comprehensionScore: 0,
                libraryBorrowStatus: 'BELUM_MEMINJAM',
                oneDayOneBookStatus: 'KURANG_AKTIF'
              } as BahasaIndonesiaProgress;
            } else if (selectedArea === 'ENGLISH_READING') {
              initialStates[st.id] = {
                ...base,
                wordsRead: 0,
                errors: 0,
                wpm: 0,
                readingLevel: 'IR',
                comprehensionScore: 0
              } as EnglishReadingProgress;
            } else if (selectedArea === 'MENGAJI') {
              initialStates[st.id] = {
                ...base,
                iqroCurrentLevel: 1,
                iqroCurrentCheckpoint: '',
                targetIqroLevel: 6,
                completionStatus: 'BELUM_DINILAI',
                letterRecognitionNote: '',
                tajwidNote: ''
              } as MengajiProgress;
            } else if (selectedArea === 'NUMERACY') {
              initialStates[st.id] = {
                ...base,
                mathLevel: '',
                topic: '',
                accuracy: 0,
                speed: 0
              } as NumeracyProgress;
            }
          }
        });

        setStudentRecords(initialStates);
      } catch (err) {
        console.error('Error loading class records:', err);
        toast.error('Gagal memuat catatan belajar siswa');
      } finally {
        setLoadingStudents(false);
      }
    };

    loadClassAndRecords();
  }, [selectedSchoolYear, selectedGradeLevel, selectedClassId, selectedPeriod, selectedArea, profile]);

  // Live change updates inside localized record table cell
  const handleCellChange = (studentId: string, field: string, value: any) => {
    setStudentRecords(prev => {
      const current = prev[studentId] || {};
      const updated = { ...current, [field]: value } as any;

      // Recalculate WPM or support details on-the-fly depending on field updates
      if (selectedArea === 'BAHASA_INDONESIA' || selectedArea === 'ENGLISH_READING') {
        const words = field === 'wordsRead' ? Number(value || 0) : Number(updated.wordsRead || 0);
        const errs = field === 'errors' ? Number(value || 0) : Number(updated.errors || 0);
        const comp = field === 'comprehensionScore' ? Number(value || 0) : Number(updated.comprehensionScore || 0);
        
        const wpmVal = calculateWpm(words, errs);
        updated.wpm = wpmVal;
        updated.wordsRead = words;
        updated.errors = errs;
        updated.comprehensionScore = comp;

        updated.supportStatus = getReadingSupportStatus(
          selectedGradeLevel,
          selectedPeriod,
          wpmVal,
          comp
        );
      } else if (selectedArea === 'MENGAJI' && field === 'completionStatus') {
        updated.supportStatus = getMengajiSupportStatus(value);
      } else if (selectedArea === 'NUMERACY') {
        // Evaluate math level & accuracy support status
        const acc = field === 'accuracy' ? Number(value || 0) : Number(updated.accuracy || 0);
        if (acc >= 80) {
          updated.supportStatus = 'ON_TRACK';
        } else if (acc >= 60) {
          updated.supportStatus = 'MONITOR';
        } else if (acc > 0) {
          updated.supportStatus = 'NEEDS_SUPPORT';
        } else {
          updated.supportStatus = 'INCOMPLETE_DATA';
        }
      }

      return {
        ...prev,
        [studentId]: updated
      };
    });

    // Mark student ID as modified
    setModifiedIds(prev => {
      const copy = new Set(prev);
      copy.add(studentId);
      return copy;
    });
  };

  // Bulk prefill actions
  const applyBulkTopic = () => {
    if (!bulkTopic.trim()) {
      toast.error('Masukkan topik terlebih dahulu');
      return;
    }
    students.forEach(st => {
      handleCellChange(st.id, 'topic', bulkTopic);
    });
    toast.success(`Berhasil menerapkan topik "${bulkTopic}" untuk seluruh siswa!`);
    setBulkTopic('');
  };

  const applyBulkMathLevel = () => {
    if (!bulkMathLevel.trim()) {
      toast.error('Masukkan level Matematika terlebih dahulu');
      return;
    }
    students.forEach(st => {
      handleCellChange(st.id, 'mathLevel', bulkMathLevel);
    });
    toast.success(`Berhasil menerapkan level "${bulkMathLevel}" untuk seluruh siswa!`);
    setBulkMathLevel('');
  };

  // Perform bulk batch save
  const handleSaveAllChanges = async () => {
    if (students.length === 0) {
      toast.error('Tidak ada data siswa untuk disimpan');
      return;
    }

    try {
      setIsSaving(true);
      // Collect all form values from local state
      const recordsToSave = Object.values(studentRecords) as any[];

      // Final fallback field calculation & validation mapping
      const validatedRecords = recordsToSave.map(rec => {
        const enriched = { ...rec };
        
        // Ensure values are numbers where appropriate
        if (selectedArea === 'BAHASA_INDONESIA' || selectedArea === 'ENGLISH_READING') {
          enriched.wordsRead = Number(enriched.wordsRead || 0);
          enriched.errors = Number(enriched.errors || 0);
          enriched.comprehensionScore = Number(enriched.comprehensionScore || 0);
          enriched.wpm = calculateWpm(enriched.wordsRead, enriched.errors);
          enriched.supportStatus = getReadingSupportStatus(
            selectedGradeLevel,
            selectedPeriod,
            enriched.wpm,
            enriched.comprehensionScore
          );
        } else if (selectedArea === 'MENGAJI') {
          enriched.iqroCurrentLevel = Number(enriched.iqroCurrentLevel || 1);
          enriched.targetIqroLevel = Number(enriched.targetIqroLevel || 6);
          enriched.supportStatus = getMengajiSupportStatus(enriched.completionStatus || 'BELUM_DINILAI');
        } else if (selectedArea === 'NUMERACY') {
          enriched.accuracy = Number(enriched.accuracy || 0);
          enriched.speed = Number(enriched.speed || 0);
          if (enriched.accuracy >= 80) {
            enriched.supportStatus = 'ON_TRACK';
          } else if (enriched.accuracy >= 60) {
            enriched.supportStatus = 'MONITOR';
          } else if (enriched.accuracy > 0) {
            enriched.supportStatus = 'NEEDS_SUPPORT';
          } else {
            enriched.supportStatus = 'INCOMPLETE_DATA';
          }
        }
        return enriched;
      });

      await elementaryLiteracyService.bulkUpsertRecords(validatedRecords);
      toast.success(`Berhasil menyimpan progres ${getAreaLabel(selectedArea)} untuk kelas ${classes.find(c => c.id === selectedClassId)?.name || ''}!`);
      
      // Clear modified tracks
      setModifiedIds(new Set());
    } catch (err: any) {
      console.error('Bulk save failed:', err);
      toast.error('Gagal menyimpan perubahan massal: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Filter dynamic search query
  const filteredStudents = React.useMemo(() => {
    return students.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [students, searchQuery]);

  // Counters for changed status states
  const completedCount = Object.values(studentRecords).filter(
    (rec: any) => rec.supportStatus && rec.supportStatus !== 'INCOMPLETE_DATA'
  ).length;

  const needsSupportCount = Object.values(studentRecords).filter(
    (rec: any) => rec.supportStatus === 'NEEDS_SUPPORT' || rec.supportStatus === 'INTERVENTION_RECOMMENDED'
  ).length;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 px-4 md:px-6">
      
      {/* 20. Elegant Desktop-First Breadcrumbs & Title Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <button
            onClick={() => navigate('/elementary/literasi-numerasi')}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors uppercase tracking-wider mb-2"
          >
            <ArrowLeft size={14} />
            KEMBALI KE REKAP LITERASI & NUMERASI
          </button>
          
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-slate-800 to-slate-900 text-white p-2.5 rounded-2xl shadow-md">
              <TrendingUp size={22} className="text-emerald-400" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                Input Capaian Kelas Elementary
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Pencatatan perkembangan literasi-numerasi secara serentak per kelas secara dinamis.
              </p>
            </div>
          </div>
        </div>

        {/* Global Save Trigger and Actions */}
        <div className="flex items-center gap-2">
          {modifiedIds.size > 0 && (
            <span className="text-xs px-3 py-1.5 bg-yellow-50 text-yellow-700 border border-yellow-100 rounded-xl font-bold animate-pulse">
              {modifiedIds.size} Baris Diubah
            </span>
          )}
          <button
            onClick={handleSaveAllChanges}
            disabled={isSaving || students.length === 0}
            className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg shadow-emerald-600/10 transition-all cursor-pointer"
          >
            {isSaving ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                MENYIMPAN...
              </>
            ) : (
              <>
                <Save size={15} />
                SIMPAN SEMUA DATA
              </>
            )}
          </button>
        </div>
      </div>

      {/* FILTER PANEL */}
      <div className="bg-white rounded-3xl border border-gray-100 p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-slate-900 font-black text-xs tracking-wider uppercase mb-1 border-b border-gray-50 pb-2">
          <Filter size={14} className="text-slate-400" />
          Filter Data Entry Kelas
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {/* School Year Select */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Tahun Pelajaran</label>
            <select
              value={selectedSchoolYear}
              onChange={e => setSelectedSchoolYear(e.target.value)}
              className="w-full bg-slate-50 border border-slate-100 text-xs font-bold rounded-xl px-3 py-2 text-slate-800 focus:ring-2 focus:ring-slate-900/10 outline-none cursor-pointer"
            >
              {ACADEMIC_YEARS.map(yr => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>
          </div>

          {/* Grade Level Select */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Tingkatan Madid</label>
            <select
              value={selectedGradeLevel}
              onChange={e => handleGradeChange(Number(e.target.value))}
              className="w-full bg-slate-50 border border-slate-100 text-xs font-bold rounded-xl px-3 py-2 text-slate-800 focus:ring-2 focus:ring-slate-900/10 outline-none cursor-pointer"
            >
              {[1, 2, 3, 4, 5, 6].map(num => (
                <option key={num} value={num}>Grade {num}</option>
              ))}
            </select>
          </div>

          {/* Classroom Selector */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Kelas</label>
            <select
              value={selectedClassId}
              onChange={e => setSelectedClassId(e.target.value)}
              disabled={loadingMetadata}
              className="w-full bg-slate-50 border border-slate-100 text-xs font-bold rounded-xl px-3 py-2 text-slate-800 focus:ring-2 focus:ring-slate-900/10 outline-none disabled:opacity-50 cursor-pointer"
            >
              <option value="">-- Pilih Kelas --</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Assessment Period */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Periode Penilaian</label>
            <select
              value={selectedPeriod}
              onChange={e => setSelectedPeriod(e.target.value as ElementaryPeriod)}
              className="w-full bg-slate-50 border border-slate-100 text-xs font-bold rounded-xl px-3 py-2 text-slate-800 focus:ring-2 focus:ring-slate-900/10 outline-none cursor-pointer"
            >
              {ELEMENTARY_PERIODS.map(p => (
                <option key={p} value={p}>{getPeriodLabel(p)}</option>
              ))}
            </select>
          </div>

          {/* Assessment Area */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Area Penilaian</label>
            <select
              value={selectedArea}
              onChange={e => setSelectedArea(e.target.value as ElementaryArea)}
              className="w-full bg-slate-50 border border-slate-100 text-xs font-bold rounded-xl px-3 py-2 text-slate-800 focus:ring-2 focus:ring-slate-900/10 outline-none cursor-pointer text-emerald-600"
            >
              {ELEMENTARY_AREAS.map(a => (
                <option key={a} value={a}>{getAreaLabel(a)}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* QUICK STATS & OPTIONAL PRE-FILL UTILITIES */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Helper Stats Summary */}
        <div className="md:col-span-6 bg-slate-900 text-white rounded-3xl p-5 flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Informasi Penginputan</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black">{completedCount}</span>
              <span className="text-xs text-slate-400">/ {students.length} Siswa Terisi</span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium">
              ({students.length - completedCount} siswa belum lengkap datanya)
            </p>
          </div>

          <div className="h-10 w-px bg-slate-800 hidden sm:block"></div>

          <div className="text-right space-y-1">
            <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest flex items-center justify-end gap-1">
              <AlertCircle size={10} />
              Butuh Pendampingan
            </p>
            <div className="text-2xl font-black text-amber-400">{needsSupportCount}</div>
            <p className="text-[10px] text-slate-400 font-medium font-mono">NEEDS SUPPORT / INTERVENTION</p>
          </div>
        </div>

        {/* Dynamic Prefill Panel (Only for certain fields like Numeracy Topic to speed up entry!) */}
        <div className="md:col-span-6 bg-slate-50 rounded-3xl p-5 border border-slate-200/50 flex flex-col justify-center gap-3">
          <div className="flex items-center gap-2 text-slate-800 font-black text-[10px] uppercase tracking-wider">
            <Sparkles size={12} className="text-indigo-500" />
            Asisten Entri Data Massal (Bulk Pre-Fill)
          </div>

          {selectedArea === 'NUMERACY' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="flex gap-1.5 items-center">
                <input
                  type="text"
                  placeholder="Contoh: Perkalian Pecahan"
                  value={bulkTopic}
                  onChange={e => setBulkTopic(e.target.value)}
                  className="bg-white border border-gray-200 text-xs px-3 py-1.5 rounded-xl flex-grow font-medium"
                />
                <button
                  type="button"
                  onClick={applyBulkTopic}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] px-2.5 py-1.5 rounded-xl font-bold uppercase shrink-0"
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
                  className="bg-white border border-gray-200 text-xs px-3 py-1.5 rounded-xl flex-grow font-medium"
                />
                <button
                  type="button"
                  onClick={applyBulkMathLevel}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] px-2.5 py-1.5 rounded-xl font-bold uppercase shrink-0"
                >
                  Level
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic">
              Entri data massal aktif saat memilih area penilaian dengan bidang text berulang seperti Numeracy.
            </p>
          )}
        </div>
      </div>

      {/* DYNAMIC STUDENTS DATA TABLE LIST */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        
        {/* Table Search & Title Header */}
        <div className="p-5 border-b border-gray-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="p-1 px-2.5 bg-slate-50 text-slate-700 rounded-lg text-xs font-black">
              {filteredStudents.length} Siswa
            </div>
            <h2 className="text-xs font-black text-slate-800 uppercase tracking-widest">
              Daftar Progres: {getAreaLabel(selectedArea)} ({getPeriodLabel(selectedPeriod)})
            </h2>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3.5 top-2.5 text-slate-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Cari nama siswa..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-100 text-xs px-9 py-2 rounded-xl outline-none focus:ring-1 focus:ring-slate-900"
            />
          </div>
        </div>

        {/* LOADING STATE */}
        {loadingStudents ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3 text-slate-400">
            <Loader2 size={32} className="animate-spin text-emerald-500" />
            <span className="text-xs font-black uppercase tracking-wider">Memuat daftar siswa & riwayat data...</span>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-2 text-slate-400">
            <AlertCircle size={32} className="text-slate-300" />
            <span className="text-sm font-bold">Tidak ada daftar siswa yang ditemukan.</span>
            <p className="text-[11px]">Silakan pilih kombinasi filter atau periksa daftar siswa di tingkatan kelas ini.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4 w-48 shrink-0">Nama Siswa</th>
                  
                  {/* Dynamic Area Header Column */}
                  {selectedArea === 'BAHASA_INDONESIA' && (
                    <>
                      <th className="py-3 px-2 w-20">Words Read</th>
                      <th className="py-3 px-2 w-20">Errors</th>
                      <th className="py-3 px-2 w-16">WPM</th>
                      <th className="py-3 px-2 w-28">Reading Level</th>
                      <th className="py-3 px-2 w-24">Comprehension</th>
                      <th className="py-3 px-2 w-28">Perpustakaan</th>
                      <th className="py-3 px-2 w-28">1 Day 1 Book</th>
                    </>
                  )}

                  {selectedArea === 'ENGLISH_READING' && (
                    <>
                      <th className="py-3 px-2 w-20">Words Read</th>
                      <th className="py-3 px-2 w-20">Errors</th>
                      <th className="py-3 px-2 w-16">WPM</th>
                      <th className="py-3 px-2 w-32">Reading Level</th>
                      <th className="py-3 px-2 w-24">Comprehension</th>
                    </>
                  )}

                  {selectedArea === 'MENGAJI' && (
                    <>
                      <th className="py-3 px-2 w-24">Iqro Level</th>
                      <th className="py-3 px-2 w-28">Current Checkpoint</th>
                      <th className="py-3 px-2 w-24">Target Level</th>
                      <th className="py-3 px-2 w-32">Status Kelulusan</th>
                      <th className="py-3 px-2 w-36">Catatan Huruf</th>
                      <th className="py-3 px-2 w-36">Catatan Tajwid</th>
                    </>
                  )}

                  {selectedArea === 'NUMERACY' && (
                    <>
                      <th className="py-3 px-2 w-28">Math Level</th>
                      <th className="py-3 px-2 w-44">Topik</th>
                      <th className="py-3 px-2 w-24">Accuracy (%)</th>
                      <th className="py-3 px-2 w-32">Speed (Detik)</th>
                    </>
                  )}

                  <th className="py-3 px-4 w-28">Support Status</th>
                  <th className="py-3 px-4 w-44">Catatan Tambahan</th>
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
                      {/* Name Col */}
                      <td className="py-3.5 px-4 font-black text-slate-800">
                        <div className="flex flex-col">
                          <span className="truncate max-w-[160px]">{st.name}</span>
                          <span className="text-[9px] text-slate-400 font-mono tracking-wider uppercase font-semibold">NIS: {st.id}</span>
                        </div>
                      </td>

                      {/* --- AREA BAHASA INDONESIA --- */}
                      {selectedArea === 'BAHASA_INDONESIA' && (
                        <>
                          <td className="py-3 px-2">
                            <input
                              type="number"
                              min="0"
                              value={record.wordsRead === undefined ? '' : record.wordsRead}
                              onChange={e => handleCellChange(st.id, 'wordsRead', e.target.value === '' ? '' : Number(e.target.value))}
                              className="w-16 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-1 text-center font-bold"
                            />
                          </td>
                          <td className="py-3 px-2">
                            <input
                              type="number"
                              min="0"
                              value={record.errors === undefined ? '' : record.errors}
                              onChange={e => handleCellChange(st.id, 'errors', e.target.value === '' ? '' : Number(e.target.value))}
                              className="w-16 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-1 text-center font-bold"
                            />
                          </td>
                          <td className="py-3 px-2 font-black text-slate-700 text-center">
                            {record.wpm !== undefined ? record.wpm : 0}
                          </td>
                          <td className="py-3 px-2">
                            <select
                              value={record.readingLevel || 'IR'}
                              onChange={e => handleCellChange(st.id, 'readingLevel', e.target.value)}
                              className="w-24 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-1 font-bold select-none cursor-pointer"
                            >
                              {READING_LEVEL_OPTIONS.map(lvl => (
                                <option key={lvl} value={lvl}>{lvl}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={record.comprehensionScore === undefined ? '' : record.comprehensionScore}
                                onChange={e => handleCellChange(st.id, 'comprehensionScore', e.target.value === '' ? '' : Number(e.target.value))}
                                className="w-14 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-1 text-center font-bold"
                              />
                              <span className="text-[10px] text-slate-400 font-bold">%</span>
                            </div>
                          </td>
                          <td className="py-3 px-2">
                            <select
                              value={record.libraryBorrowStatus || 'BELUM_MEMINJAM'}
                              onChange={e => handleCellChange(st.id, 'libraryBorrowStatus', e.target.value)}
                              className="w-28 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-1 font-bold cursor-pointer text-[11px]"
                            >
                              <option value="BELUM_MEMINJAM">Belum Meminjam</option>
                              <option value="AKTIF">Aktif Meminjam</option>
                            </select>
                          </td>
                          <td className="py-3 px-2">
                            <select
                              value={record.oneDayOneBookStatus || 'KURANG_AKTIF'}
                              onChange={e => handleCellChange(st.id, 'oneDayOneBookStatus', e.target.value)}
                              className="w-28 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-1 font-bold cursor-pointer text-[11px]"
                            >
                              <option value="KURANG_AKTIF">Kurang Aktif</option>
                              <option value="AKTIF">Aktif</option>
                            </select>
                          </td>
                        </>
                      )}

                      {/* --- AREA ENGLISH READING --- */}
                      {selectedArea === 'ENGLISH_READING' && (
                        <>
                          <td className="py-3 px-2">
                            <input
                              type="number"
                              min="0"
                              value={record.wordsRead === undefined ? '' : record.wordsRead}
                              onChange={e => handleCellChange(st.id, 'wordsRead', e.target.value === '' ? '' : Number(e.target.value))}
                              className="w-16 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-1 text-center font-bold"
                            />
                          </td>
                          <td className="py-3 px-2">
                            <input
                              type="number"
                              min="0"
                              value={record.errors === undefined ? '' : record.errors}
                              onChange={e => handleCellChange(st.id, 'errors', e.target.value === '' ? '' : Number(e.target.value))}
                              className="w-16 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-1 text-center font-bold"
                            />
                          </td>
                          <td className="py-3 px-2 font-black text-slate-700 text-center">
                            {record.wpm !== undefined ? record.wpm : 0}
                          </td>
                          <td className="py-3 px-2">
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
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={record.comprehensionScore === undefined ? '' : record.comprehensionScore}
                                onChange={e => handleCellChange(st.id, 'comprehensionScore', e.target.value === '' ? '' : Number(e.target.value))}
                                className="w-14 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-1 text-center font-bold"
                              />
                              <span className="text-[10px] text-slate-400 font-bold">%</span>
                            </div>
                          </td>
                        </>
                      )}

                      {/* --- AREA MENGAJI --- */}
                      {selectedArea === 'MENGAJI' && (
                        <>
                          <td className="py-3 px-2">
                            <input
                              type="number"
                              min="1"
                              max="6"
                              placeholder="Iqra 1-6"
                              value={record.iqroCurrentLevel === undefined ? '' : record.iqroCurrentLevel}
                              onChange={e => handleCellChange(st.id, 'iqroCurrentLevel', e.target.value === '' ? '' : Number(e.target.value))}
                              className="w-16 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-1 text-center font-bold"
                            />
                          </td>
                          <td className="py-3 px-2">
                            <input
                              type="text"
                              placeholder="Misal: 2/40"
                              value={record.iqroCurrentCheckpoint || ''}
                              onChange={e => handleCellChange(st.id, 'iqroCurrentCheckpoint', e.target.value)}
                              className="w-24 bg-slate-50/60 border border-slate-200 rounded-lg px-2.5 py-1 font-bold"
                            />
                          </td>
                          <td className="py-3 px-2">
                            <input
                              type="number"
                              min="1"
                              max="6"
                              value={record.targetIqroLevel === undefined ? '' : record.targetIqroLevel}
                              onChange={e => handleCellChange(st.id, 'targetIqroLevel', e.target.value === '' ? '' : Number(e.target.value))}
                              className="w-16 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-1 text-center font-bold"
                            />
                          </td>
                          <td className="py-3 px-2">
                            <select
                              value={record.completionStatus || 'BELUM_DINILAI'}
                              onChange={e => handleCellChange(st.id, 'completionStatus', e.target.value)}
                              className="w-28 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-1 font-bold cursor-pointer text-[10px]"
                            >
                              <option value="BELUM_DINILAI">Belum Dinilai</option>
                              <option value="ON_PROGRESS">On Progress</option>
                              <option value="LULUS">Lulus</option>
                              <option value="TIDAK_LULUS">Belum Lulus</option>
                            </select>
                          </td>
                          <td className="py-3 px-2">
                            <input
                              type="text"
                              placeholder="Kelemahan makhraz..."
                              value={record.letterRecognitionNote || ''}
                              onChange={e => handleCellChange(st.id, 'letterRecognitionNote', e.target.value)}
                              className="w-32 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-1 font-medium text-[11px]"
                            />
                          </td>
                          <td className="py-3 px-2">
                            <input
                              type="text"
                              placeholder="Masalah tajwid..."
                              value={record.tajwidNote || ''}
                              onChange={e => handleCellChange(st.id, 'tajwidNote', e.target.value)}
                              className="w-32 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-1 font-medium text-[11px]"
                            />
                          </td>
                        </>
                      )}

                      {/* --- AREA NUMERACY --- */}
                      {selectedArea === 'NUMERACY' && (
                        <>
                          <td className="py-3 px-2">
                            <input
                              type="text"
                              placeholder="Misal: Level 2A"
                              value={record.mathLevel || ''}
                              onChange={e => handleCellChange(st.id, 'mathLevel', e.target.value)}
                              className="w-24 bg-slate-50/60 border border-slate-200 rounded-lg px-2.5 py-1 font-bold"
                            />
                          </td>
                          <td className="py-3 px-2">
                            <input
                              type="text"
                              placeholder="Contoh: Pembagian 1-10"
                              value={record.topic || ''}
                              onChange={e => handleCellChange(st.id, 'topic', e.target.value)}
                              className="w-40 bg-slate-50/60 border border-slate-200 rounded-lg px-2.5 py-1 font-bold"
                            />
                          </td>
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={record.accuracy === undefined ? '' : record.accuracy}
                                onChange={e => handleCellChange(st.id, 'accuracy', e.target.value === '' ? '' : Number(e.target.value))}
                                className="w-14 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-1 text-center font-bold"
                              />
                              <span className="text-[10px] text-slate-400 font-bold">%</span>
                            </div>
                          </td>
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                value={record.speed === undefined ? '' : record.speed}
                                onChange={e => handleCellChange(st.id, 'speed', e.target.value === '' ? '' : Number(e.target.value))}
                                className="w-16 bg-slate-50/60 border border-slate-200 rounded-lg px-2 py-1 text-center font-bold"
                              />
                              <span className="text-[10px] text-slate-400 font-bold">Detik</span>
                            </div>
                          </td>
                        </>
                      )}

                      {/* Support Status Gauge (Interactive Calculated Read-Only) */}
                      <td className="py-3.5 px-4 font-bold max-w-[120px] truncate">
                        <span
                          className={cn(
                            "px-2.5 py-1 rounded-xl text-[9px] font-black tracking-wider uppercase border inline-block whitespace-nowrap",
                            record.supportStatus === 'ON_TRACK' && "bg-emerald-50 text-emerald-700 border-emerald-100",
                            record.supportStatus === 'MONITOR' && "bg-yellow-50 text-yellow-700 border-yellow-105",
                            record.supportStatus === 'NEEDS_SUPPORT' && "bg-orange-50 text-orange-700 border-orange-100",
                            record.supportStatus === 'INTERVENTION_RECOMMENDED' && "bg-red-50 text-red-700 border-red-100",
                            (record.supportStatus === 'INCOMPLETE_DATA' || !record.supportStatus) && "bg-slate-50 text-slate-500 border-slate-100"
                          )}
                        >
                          {getSupportStatusLabel(record.supportStatus || 'INCOMPLETE_DATA')}
                        </span>
                      </td>

                      {/* Notes Input */}
                      <td className="py-3 px-4">
                        <textarea
                          rows={1}
                          placeholder="Tambahkan catatan khusus progres..."
                          value={record.notes || ''}
                          onChange={e => handleCellChange(st.id, 'notes', e.target.value)}
                          className="w-44 bg-slate-50/60 hover:bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-[11px] outline-none font-medium resize-y focus:ring-1 focus:ring-slate-900 focus:bg-white"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* FOOTER MULTI ENTRY DATA TRIGGER */}
        <div className="p-5 bg-slate-50/50 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
            <HelpCircle size={13} className="text-slate-400" />
            Semua perubahan baris draf tersimpan secara otomatis di memori lokal. Gunakan tombol 'Simpan Semua' untuk menyimpan ke server Firestore.
          </div>

          <div className="flex items-center gap-3 self-end md:self-auto">
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Apakah Anda yakin ingin membatalkan semua entri draf yang belum disimpan?')) {
                  setSelectedClassId(selectedClassId); // Reloading triggers useeffects
                  toast.success('Berhasil membuang draft data.');
                }
              }}
              className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
            >
              BUANG DRAF
            </button>
            <button
              onClick={handleSaveAllChanges}
              disabled={isSaving || students.length === 0}
              className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-emerald-600/15 transition-all"
            >
              {isSaving ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  MENGIRIM CATATAN...
                </>
              ) : (
                <>
                  <Save size={14} />
                  SIMPAN ALL DATA ({filteredStudents.length} SISWA)
                </>
              )}
            </button>
          </div>
        </div>

      </div>

    </div>
  );
}
