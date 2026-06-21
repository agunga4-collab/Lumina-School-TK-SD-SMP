import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, Languages, Heart, Calculator, Search, 
  Filter, History, ChevronRight, Save, User as UserIcon, 
  Calendar, RefreshCw, CheckCircle2, AlertCircle, FileText, X, Sparkles, Sliders
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { db, handleFirestoreError, getStudents, getClasses, getActiveStudents } from '../../lib/firebase';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { collection, query, where, getDocs, addDoc, doc, updateDoc, orderBy } from 'firebase/firestore';
import { toast } from 'sonner';
import { ACADEMIC_YEARS } from '../../constants';
import ElementaryLiteracyOverview from './components/ElementaryLiteracyOverview';

// Types for local component
export type AreaType = 'BAHASA' | 'ENGLISH' | 'MENGAJI' | 'MATH';

export interface ElementaryStudent {
  id: string; // NIS
  name: string;
  classId: string;
  className: string;
}

export interface AssessmentRecord {
  id?: string;
  studentId: string;
  classId: string;
  schoolUnit: 'ELEMENTARY';
  academicYear: string;
  termSemester: string;
  area: AreaType;
  period: string;
  
  // BI & ENG
  wordsRead?: number;
  errors?: number;
  wpm?: number;
  readingLevel?: string;
  interventionTier?: string;
  readingComprehensionScore?: number;
  readingComprehensionNotes?: string;
  
  // BI Only
  libraryBorrowStatus?: string;
  oneDayOneBookStatus?: string;
  followUpAction?: string;
  
  // Mengaji
  iqroLevel?: string;
  currentSurah?: string;
  fluency?: string;
  tajwid?: string;
  
  // Math
  mathLevel?: string;
  topic?: string;
  accuracy?: number;
  speed?: string;
  
  notes?: string;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

const AREAS: { id: AreaType; label: string; icon: React.ReactNode; colorClass: string; activeColor: string }[] = [
  { id: 'BAHASA', label: 'Bahasa Indonesia', icon: <BookOpen className="w-5 h-5" />, colorClass: 'text-blue-600 bg-blue-50 border-blue-100', activeColor: 'bg-blue-600 text-white' },
  { id: 'ENGLISH', label: 'English Reading', icon: <Languages className="w-5 h-5" />, colorClass: 'text-indigo-600 bg-indigo-50 border-indigo-100', activeColor: 'bg-indigo-600 text-white' },
  { id: 'MENGAJI', label: 'Mengaji', icon: <Heart className="w-5 h-5" />, colorClass: 'text-emerald-600 bg-emerald-50 border-emerald-100', activeColor: 'bg-emerald-600 text-white' },
  { id: 'MATH', label: 'Numerasi (Math)', icon: <Calculator className="w-5 h-5" />, colorClass: 'text-purple-600 bg-purple-50 border-purple-100', activeColor: 'bg-purple-600 text-white' },
];

const PERIODS = [
  { value: 'july-october', label: 'Juli - Oktober' },
  { value: 'november-february', label: 'November - Februari' },
  { value: 'march-june', label: 'Maret - Juni' }
];

export default function ElementaryLiteracyNumeracy() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { activeYear, activeSemester } = useAcademicYear();
  
  // Global filters
  const [selectedArea, setSelectedArea] = React.useState<AreaType>('BAHASA');
  const [selectedClassId, setSelectedClassId] = React.useState<string>('');
  const [selectedYear, setSelectedYear] = React.useState<string>(activeYear || '2025/2026');
  const [selectedSemester, setSelectedSemester] = React.useState<string>(String(activeSemester || '1'));
  const [selectedPeriod, setSelectedPeriod] = React.useState<string>('july-october');
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const [activeView, setActiveView] = React.useState<'input' | 'overview'>('input');

  React.useEffect(() => {
    if (activeYear) {
      setSelectedYear(activeYear);
      setSelectedSemester(String(activeSemester));
    }
  }, [activeYear, activeSemester]);

  // Loaded collections
  const [classes, setClasses] = React.useState<any[]>([]);
  const [students, setStudents] = React.useState<ElementaryStudent[]>([]);
  const [selectedStudent, setSelectedStudent] = React.useState<ElementaryStudent | null>(null);
  
  // Form and assessment state
  const [isSaving, setIsSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [activeRecord, setActiveRecord] = React.useState<AssessmentRecord | null>(null);

  // Form Field States
  // BI & ENG fields
  const [wordsRead, setWordsRead] = React.useState<number | ''>('');
  const [errors, setErrors] = React.useState<number | ''>('');
  const [readingLevel, setReadingLevel] = React.useState<string>('IR');
  const [interventionTier, setInterventionTier] = React.useState<string>('Tier 1');
  const [comprehensionScore, setComprehensionScore] = React.useState<number | ''>('');
  const [comprehensionNotes, setComprehensionNotes] = React.useState<string>('');
  
  // BI only fields
  const [libraryBorrowStatus, setLibraryBorrowStatus] = React.useState<string>('Belum meminjam');
  const [oneDayOneBookStatus, setOneDayOneBookStatus] = React.useState<string>('Belum Aktif');
  const [followUpAction, setFollowUpAction] = React.useState<string>('');
  
  // Mengaji fields
  const [iqroLevel, setIqroLevel] = React.useState<string>('Iqro 1');
  const [currentSurah, setCurrentSurah] = React.useState<string>('');
  const [fluency, setFluency] = React.useState<string>('Cukup Lancar');
  const [tajwid, setTajwid] = React.useState<string>('Cukup');
  
  // Math fields
  const [mathLevel, setMathLevel] = React.useState<string>('');
  const [topic, setTopic] = React.useState<string>('');
  const [accuracy, setAccuracy] = React.useState<number | ''>('');
  const [speed, setSpeed] = React.useState<string>('Sedang');
  
  const [notes, setNotes] = React.useState<string>('');

  // Class History modal
  const [showHistory, setShowHistory] = React.useState(false);
  const [historyRecords, setHistoryRecords] = React.useState<AssessmentRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = React.useState(false);

  // Calculate WPM
  const wpm = React.useMemo(() => {
    if (wordsRead === '') return 0;
    const numWords = Number(wordsRead);
    const numErrors = Number(errors || 0);
    return Math.max(0, numWords - numErrors);
  }, [wordsRead, errors]);

  // Load Classes and initial selection on Mount
  React.useEffect(() => {
    const loadMetadata = async () => {
      try {
        setLoading(true);
        const allClasses = await getClasses() || [];

        // Filter Elementary active classes
        const elementaryClasses = allClasses.filter(c => c.unitId === 'ELEMENTARY' && c.status !== 'archived');
        setClasses(elementaryClasses);

        // Determine accessible classes based on role
        let allowedClassIds = elementaryClasses.map(c => c.id);
        const isSystemAdmin = profile?.role === 'SUPER_ADMIN' || profile?.role === 'HEAD_UNIT' || profile?.role === 'PRINCIPAL' || profile?.role === 'VICE_PRINCIPAL';
        
        if (!isSystemAdmin && profile?.role === 'HOMEROOM_TEACHER') {
          const myClassIds = elementaryClasses.filter(c => c.homeroomTeacherId === profile?.uid).map(c => c.id);
          if (myClassIds.length > 0) {
            allowedClassIds = myClassIds;
          }
        }
        
        // Auto-select class ID
        if (allowedClassIds.length > 0) {
          setSelectedClassId(allowedClassIds[0]);
        }
      } catch (err) {
        console.error('Failed to load elementary configuration data:', err);
        toast.error('Gagal mengambil data kelas');
      } finally {
        setLoading(false);
      }
    };

    if (profile) {
      loadMetadata();
    }
  }, [profile]);

  // Load dynamic active students for the selected class and selected year
  React.useEffect(() => {
    const loadClassStudents = async () => {
      if (!selectedClassId) return;
      try {
        // Fetch using the official active year dynamic query
        const activeS = await getActiveStudents(selectedClassId, selectedYear);
        if (activeS && activeS.length > 0) {
          const mapped = activeS.map(s => ({
            id: s.id,
            name: s.name,
            classId: s.classId,
            className: classes.find(c => c.id === s.classId)?.name || 'Elementary Student'
          }));
          setStudents(mapped);
        } else {
          // Graceful fallback to legacy getStudents if enrollments collections are unpopulated
          const allStudents = await getStudents() || [];
          const filtered = allStudents
            .filter(s => s.currentUnit === 'ELEMENTARY' && s.classId === selectedClassId)
            .filter(s => {
              const lowerName = s.name.toLowerCase();
              return !(
                lowerName.includes('dika ramadhan') ||
                lowerName.includes('alya putri') ||
                lowerName.includes('farez rahadian') ||
                lowerName.includes('siti aminah')
              );
            })
            .map(s => ({
              id: s.id,
              name: s.name,
              classId: s.classId,
              className: classes.find(c => c.id === s.classId)?.name || 'Elementary Student'
            }));
          setStudents(filtered);
        }
      } catch (err) {
        console.error('Failed to load active elementary students:', err);
      }
    };

    if (selectedClassId && classes.length > 0) {
      loadClassStudents();
    }
  }, [selectedClassId, selectedYear, classes]);

  // Fetch assessment history for class summaries
  const fetchClassHistory = async () => {
    if (!selectedClassId) return;
    setLoadingHistory(true);
    try {
      const q = query(
        collection(db, 'elementary_literacy_numeracy'),
        where('classId', '==', selectedClassId),
        where('area', '==', selectedArea),
        where('period', '==', selectedPeriod),
        where('academicYear', '==', selectedYear)
      );
      const snap = await getDocs(q);
      const records = snap.docs.map(d => ({ id: d.id, ...d.data() } as AssessmentRecord));
      setHistoryRecords(records);
    } catch (err) {
      console.error('Error fetching class history:', err);
      toast.error('Gagal mengambil riwayat kelas');
    } finally {
      setLoadingHistory(false);
    }
  };

  // Open modal & fetch history
  const handleOpenHistory = () => {
    setShowHistory(true);
    fetchClassHistory();
  };

  // Filter students based on active class selection and search query
  const filteredStudents = React.useMemo(() => {
    return students.filter(s => {
      const matchesClass = s.classId === selectedClassId;
      const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.id.includes(searchQuery);
      return matchesClass && matchesSearch;
    });
  }, [students, selectedClassId, searchQuery]);

  // Fetch active record when student, area, period, or academicYear changes
  React.useEffect(() => {
    const fetchRecord = async () => {
      if (!selectedStudent) {
        setActiveRecord(null);
        resetFormFields();
        return;
      }
      try {
        const q = query(
          collection(db, 'elementary_literacy_numeracy'),
          where('studentId', '==', selectedStudent.id),
          where('area', '==', selectedArea),
          where('period', '==', selectedPeriod),
          where('academicYear', '==', selectedYear)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          // Find latest based on timestamps
          const sorted = snap.docs
            .map(d => ({ id: d.id, ...d.data() } as AssessmentRecord))
            .sort((a, b) => b.createdAt - a.createdAt);
          
          const latest = sorted[0];
          setActiveRecord(latest);
          populateFormWithRecord(latest);
        } else {
          setActiveRecord(null);
          resetFormFields();
        }
      } catch (err: any) {
        console.error('Error fetching assessment record:', err);
        handleFirestoreError(err, 'get', `elementary_literacy_numeracy/${selectedStudent.id}`);
      }
    };
    fetchRecord();
  }, [selectedStudent, selectedArea, selectedPeriod, selectedYear]);

  // Reset form properties to empty states or defaults
  const resetFormFields = () => {
    setWordsRead('');
    setErrors('');
    setReadingLevel('IR');
    setInterventionTier('Tier 1');
    setComprehensionScore('');
    setComprehensionNotes('');
    setLibraryBorrowStatus('Belum meminjam');
    setOneDayOneBookStatus('Belum Aktif');
    setFollowUpAction('');
    
    setIqroLevel('Iqro 1');
    setCurrentSurah('');
    setFluency('Cukup Lancar');
    setTajwid('Cukup');
    
    setMathLevel('');
    setTopic('');
    setAccuracy('');
    setSpeed('Sedang');
    setNotes('');
  };

  // Populate active form
  const populateFormWithRecord = (record: AssessmentRecord) => {
    setWordsRead(record.wordsRead !== undefined ? record.wordsRead : '');
    setErrors(record.errors !== undefined ? record.errors : '');
    setReadingLevel(record.readingLevel || 'IR');
    setInterventionTier(record.interventionTier || 'Tier 1');
    setComprehensionScore(record.readingComprehensionScore !== undefined ? record.readingComprehensionScore : '');
    setComprehensionNotes(record.readingComprehensionNotes || '');
    setLibraryBorrowStatus(record.libraryBorrowStatus || 'Belum meminjam');
    setOneDayOneBookStatus(record.oneDayOneBookStatus || 'Belum Aktif');
    setFollowUpAction(record.followUpAction || '');
    
    setIqroLevel(record.iqroLevel || 'Iqro 1');
    setCurrentSurah(record.currentSurah || '');
    setFluency(record.fluency || 'Cukup Lancar');
    setTajwid(record.tajwid || 'Cukup');
    
    setMathLevel(record.mathLevel || '');
    setTopic(record.topic || '');
    setAccuracy(record.accuracy !== undefined ? record.accuracy : '');
    setSpeed(record.speed || 'Sedang');
    setNotes(record.notes || '');
  };

  // Submit Penilaian to firestore
  const handleSaveAssessment = async (forceNew = false) => {
    if (!selectedStudent || !profile) return;
    setIsSaving(true);
    
    const baseRecord: Partial<AssessmentRecord> = {
      studentId: selectedStudent.id,
      classId: selectedStudent.classId,
      schoolUnit: 'ELEMENTARY',
      academicYear: selectedYear,
      termSemester: selectedSemester,
      area: selectedArea,
      period: selectedPeriod,
      notes: notes,
      updatedAt: Date.now(),
    };

    // Populate dynamic areas
    if (selectedArea === 'BAHASA' || selectedArea === 'ENGLISH') {
      baseRecord.wordsRead = wordsRead !== '' ? Number(wordsRead) : undefined;
      baseRecord.errors = errors !== '' ? Number(errors) : undefined;
      baseRecord.wpm = wpm;
      baseRecord.readingLevel = readingLevel;
      baseRecord.interventionTier = interventionTier;
      baseRecord.readingComprehensionScore = comprehensionScore !== '' ? Number(comprehensionScore) : undefined;
      baseRecord.readingComprehensionNotes = comprehensionNotes;
      
      if (selectedArea === 'BAHASA') {
        baseRecord.libraryBorrowStatus = libraryBorrowStatus;
        baseRecord.oneDayOneBookStatus = oneDayOneBookStatus;
        baseRecord.followUpAction = followUpAction;
      }
    } else if (selectedArea === 'MENGAJI') {
      baseRecord.iqroLevel = iqroLevel;
      baseRecord.currentSurah = currentSurah;
      baseRecord.fluency = fluency;
      baseRecord.tajwid = tajwid;
    } else if (selectedArea === 'MATH') {
      baseRecord.mathLevel = mathLevel;
      baseRecord.topic = topic;
      baseRecord.accuracy = accuracy !== '' ? Number(accuracy) : undefined;
      baseRecord.speed = speed;
      baseRecord.interventionTier = interventionTier;
    }

    try {
      if (activeRecord?.id && !forceNew) {
        // Perform updateDoc to save over existing document of same period
        await updateDoc(doc(db, 'elementary_literacy_numeracy', activeRecord.id), {
          ...baseRecord,
          updatedAt: Date.now()
        });
        toast.success(`Data penilaian ${AREAS.find(a => a.id === selectedArea)?.label} berhasil diperbarui!`);
      } else {
        // Create a brand new document record
        const docRef = await addDoc(collection(db, 'elementary_literacy_numeracy'), {
          ...baseRecord,
          createdAt: Date.now(),
          createdBy: profile.displayName || profile.email
        });
        
        const newRecordFull = { id: docRef.id, ...baseRecord, createdAt: Date.now(), createdBy: profile.displayName || profile.email } as AssessmentRecord;
        setActiveRecord(newRecordFull);
        toast.success(`Data penilaian baru ${AREAS.find(a => a.id === selectedArea)?.label} berhasil disimpan!`);
      }
    } catch (err: any) {
      console.error('Error saving assessment record:', err);
      toast.error('Gagal menyimpan penilaian: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-1 text-[10px] uppercase tracking-widest font-black bg-emerald-50 text-emerald-700 rounded-lg">ELEMENTARY UNIT</span>
            <span className="text-gray-300">•</span>
            <span className="text-xs font-bold text-gray-500">Pusat Penilaian Akademik</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2 italic">
            LITERASI & NUMERASI
          </h1>
          <p className="text-gray-500 text-xs font-medium">Panel penilaian membaca, menulis, menghitung, dan mengaji untuk SD.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Class Selector */}
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 p-1.5 rounded-2xl text-xs font-bold text-gray-600">
            <Sliders size={14} className="text-gray-400 ml-1" />
            <select 
              value={selectedClassId} 
              onChange={(e) => {
                setSelectedClassId(e.target.value);
                setSelectedStudent(null);
              }}
              className="bg-transparent font-black text-gray-800 outline-none pr-2 cursor-pointer"
            >
              <option value="" disabled>Pilih Kelas</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Academic Year Selector */}
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 p-1.5 rounded-2xl text-xs font-bold text-gray-600">
            <select 
              value={selectedYear} 
              onChange={(e) => {
                setSelectedYear(e.target.value);
                setSelectedStudent(null);
              }}
              className="bg-transparent font-black text-gray-800 outline-none pr-2 cursor-pointer"
            >
              {ACADEMIC_YEARS.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <button 
            onClick={() => navigate('/elementary/literasi-numerasi/input')}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/10 px-4 py-2.5 rounded-2xl text-xs font-black tracking-wider uppercase transition-all"
          >
            <Sliders size={14} />
            INPUT PER KELAS
          </button>

          <button 
            onClick={handleOpenHistory}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white shadow-md shadow-slate-900/10 px-4 py-2.5 rounded-2xl text-xs font-black tracking-wider uppercase transition-all"
          >
            <History size={14} />
            RIWAYAT KELAS
          </button>
        </div>
      </header>

      {/* Tab Selector Switcher */}
      <div className="flex items-center gap-1.5 bg-white p-1 pb-1 px-1 rounded-2xl w-fit border border-gray-100 shadow-sm">
        <button
          onClick={() => setActiveView('input')}
          className={cn(
            "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer",
            activeView === 'input' 
              ? "bg-slate-900 text-white shadow-md shadow-slate-900/10" 
              : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
          )}
        >
          Pencatatan Penilaian
        </button>
        <button
          onClick={() => setActiveView('overview')}
          className={cn(
            "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer",
            activeView === 'overview' 
              ? "bg-slate-900 text-white shadow-md shadow-slate-900/10" 
              : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
          )}
        >
          Dasbor Ringkasan Analitik
        </button>
      </div>

      {activeView === 'overview' ? (
        <ElementaryLiteracyOverview 
          schoolYear={selectedYear}
          period={selectedPeriod === 'november-february' ? 'NOV_FEB' : selectedPeriod === 'march-june' ? 'MAR_JUN' : 'JUL_OCT'}
        />
      ) : (
        /* Main Grid View (3 Panels Layout) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* PANEL KIRI (Pilih Area) */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex flex-col gap-3">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 mb-1">PILIH AREA PENILAIAN</p>
            <div className="flex flex-col gap-2">
              {AREAS.map(area => {
                const isActive = selectedArea === area.id;
                return (
                  <button
                    key={area.id}
                    onClick={() => setSelectedArea(area.id)}
                    className={cn(
                      "flex items-center gap-3 p-3.5 rounded-2xl text-left font-black transition-all text-xs uppercase tracking-wider border",
                      isActive 
                        ? "bg-slate-900 border-slate-900 text-white shadow-lg shadow-slate-900/15 scale-[1.02]" 
                        : "bg-white border-gray-100 text-gray-600 hover:bg-gray-50 hover:border-gray-200"
                    )}
                  >
                    <div className={cn(
                      "p-1.5 rounded-xl",
                      isActive ? "bg-white/10 text-white" : area.colorClass
                    )}>
                      {area.icon}
                    </div>
                    <span>{area.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* PANEL TENGAH (Daftar Siswa) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col h-[600px]">
            <div className="p-5 border-b border-gray-50 flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest italic">
                  DAFTAR SISWA
                </h3>
                <span className="px-2 py-0.5 text-[9px] font-black bg-blue-50 text-blue-600 rounded-full">
                  {filteredStudents.length} SISWA
                </span>
              </div>
              
              {/* Student Search */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Cari nama siswa..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-100 text-xs rounded-xl focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none transition-all placeholder-gray-400 font-medium text-gray-700"
                />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1.5 custom-scrollbar">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                  <RefreshCw className="animate-spin text-gray-400" size={20} />
                  <span className="text-xs font-bold uppercase tracking-wider">Memuat siswa...</span>
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 px-4 text-center">
                  <AlertCircle size={24} className="mb-2 text-gray-300" />
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Tidak ada siswa ditemukan</p>
                  <p className="text-[10px] text-gray-400 mt-1">Ganti filter kelas atau cari dengan keyword berbeda.</p>
                </div>
              ) : (
                filteredStudents.map(student => {
                  const isSelected = selectedStudent?.id === student.id;
                  return (
                    <button
                      key={student.id}
                      onClick={() => setSelectedStudent(student)}
                      className={cn(
                        "w-full flex items-center justify-between p-3 rounded-2xl transition-all border text-left",
                        isSelected
                          ? "bg-slate-50 border-slate-200 shadow-sm"
                          : "bg-white border-transparent hover:bg-gray-50 hover:border-gray-100"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shadow-inner",
                          isSelected ? "bg-slate-900 text-white" : "bg-gray-100 text-gray-500"
                        )}>
                          {student.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-xs font-black text-gray-900 leading-tight uppercase tracking-wider">{student.name}</p>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">{student.className} • NIS: {student.id}</p>
                        </div>
                      </div>
                      <ChevronRight size={14} className={cn("transition-transform duration-200", isSelected ? "text-slate-900 translate-x-1" : "text-gray-300")} />
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* PANEL KANAN (Form Input / Detail Tampilan) */}
        <div className="lg:col-span-5">
          <AnimatePresence mode="wait">
            {!selectedStudent ? (
              <motion.div 
                key="placeholder"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8 text-center flex flex-col items-center justify-center h-[600px] text-gray-400"
              >
                <div className="w-16 h-16 rounded-3xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 mb-4 shadow-sm">
                  <UserIcon size={24} />
                </div>
                <h4 className="text-xs font-black text-gray-800 uppercase tracking-widest italic mb-1">Pilih Siswa</h4>
                <p className="text-xs text-gray-400 max-w-xs font-medium">Klik nama siswa pada daftar untuk memulai penginputan dan melihat catatan penilaian.</p>
              </motion.div>
            ) : (
              <motion.div
                key={selectedStudent.id + '_' + selectedArea}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col min-h-[600px]"
              >
                {/* Form Header */}
                <div className="p-5 border-b border-gray-50 bg-slate-50/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                      <span className="font-black text-slate-800">{AREAS.find(a => a.id === selectedArea)?.label}</span>
                      <span>/</span>
                      <span>Penilaian Siswa</span>
                    </div>
                    <h3 className="text-sm font-black text-slate-950 uppercase tracking-widest italic leading-none">{selectedStudent.name}</h3>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{selectedStudent.className} • NIS: {selectedStudent.id}</p>
                  </div>
                  
                  {/* Period Selection */}
                  <div className="flex flex-col gap-1 w-full md:w-auto">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Periode Rentang Bulan</label>
                    <select
                      value={selectedPeriod}
                      onChange={(e) => setSelectedPeriod(e.target.value)}
                      className="text-xs font-black text-slate-900 bg-white border border-gray-200 px-2.5 py-1.5 rounded-xl cursor-pointer"
                    >
                      {PERIODS.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Database State Badge */}
                {activeRecord && (
                  <div className="px-5 py-3 bg-emerald-50 border-b border-emerald-100 flex items-center gap-2 text-emerald-800 text-[10px] font-bold uppercase tracking-wider">
                    <CheckCircle2 size={14} className="text-emerald-600" />
                    <span>SUDAH DINILAI (DIUPDATE: {new Date(activeRecord.updatedAt).toLocaleDateString('id-ID')})</span>
                  </div>
                )}

                {/* Form Content */}
                <div className="flex-1 p-6 space-y-6 overflow-y-auto max-h-[500px] custom-scrollbar">
                  
                  {/* BAHASA INDONESIA & ENGLISH READING FORMS */}
                  {(selectedArea === 'BAHASA' || selectedArea === 'ENGLISH') && (
                    <div className="space-y-6">
                      <div className="bg-slate-50/30 border border-slate-100 p-4 rounded-3xl space-y-4">
                        <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                          <BookOpen size={14} className="text-slate-500" />
                          <p className="text-[10px] font-black tracking-widest uppercase text-slate-500 font-sans">Reading Level Data</p>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Jumlah Kata (Words Read)</label>
                            <input
                              type="number"
                              placeholder="0"
                              value={wordsRead}
                              onChange={(e) => setWordsRead(e.target.value === '' ? '' : Number(e.target.value))}
                              className="w-full px-3 py-2 bg-white border border-gray-200 text-xs rounded-xl focus:border-slate-500 font-bold"
                            />
                          </div>
                          
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Jumlah Kesalahan (Errors)</label>
                            <input
                              type="number"
                              placeholder="0"
                              value={errors}
                              onChange={(e) => setErrors(e.target.value === '' ? '' : Number(e.target.value))}
                              className="w-full px-3 py-2 bg-white border border-gray-200 text-xs rounded-xl focus:border-slate-500 font-bold"
                            />
                          </div>
                        </div>

                        {/* WPM Display */}
                        <div className="flex justify-between items-center bg-slate-100/50 p-2.5 rounded-xl border border-slate-100">
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">WPM (Words Per Minute)</span>
                          <span className="text-xs font-black text-slate-900 bg-white px-3 py-1 rounded-lg border border-slate-200">{wpm} WPM</span>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Reading Level Category</label>
                            <select
                              value={readingLevel}
                              onChange={(e) => setReadingLevel(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-gray-200 text-xs rounded-xl focus:border-slate-500 font-black cursor-pointer"
                            >
                              <option value="IR+">IR+ (Independent Reader High)</option>
                              <option value="IR">IR (Independent Reader)</option>
                              <option value="IR-">IR- (Independent Reader Low)</option>
                              <option value="IR-EN">IR-EN (Needs Enhancement)</option>
                            </select>
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Intervention Tier</label>
                            <select
                              value={interventionTier}
                              onChange={(e) => setInterventionTier(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-gray-200 text-xs rounded-xl focus:border-slate-500 font-black cursor-pointer"
                            >
                              <option value="Tier 1">Tier 1 (Universal)</option>
                              <option value="Tier 2">Tier 2 (Targeted)</option>
                              <option value="Tier 4">Tier 4 (Intensive Special)</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Reading Comprehension Section & Annual detailed points */}
                      <div className="bg-slate-50/30 border border-slate-100 p-4 rounded-3xl space-y-4">
                        <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                          <Sparkles size={14} className="text-slate-500" />
                          <p className="text-[10px] font-black tracking-widest uppercase text-slate-500">Capaian Evaluasi & Semesteran</p>
                        </div>
                        
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Skor Pemahaman Membaca (0-100)</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            placeholder="Score"
                            value={comprehensionScore}
                            onChange={(e) => setComprehensionScore(e.target.value === '' ? '' : Math.min(100, Math.max(0, Number(e.target.value))))}
                            className="w-full px-3 py-2 bg-white border border-gray-200 text-xs rounded-xl focus:border-slate-500 font-bold"
                          />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Catatan Pemahaman Membaca</label>
                          <textarea
                            placeholder="Tuliskan catatan pemahaman detail di sini..."
                            value={comprehensionNotes}
                            onChange={(e) => setComprehensionNotes(e.target.value)}
                            rows={2}
                            className="w-full px-3 py-2 bg-white border border-gray-200 text-xs rounded-xl focus:border-slate-500 font-medium"
                          />
                        </div>

                        {/* BAHASA INDONESIA ONLY EXTRA SCHEMAS */}
                        {selectedArea === 'BAHASA' && (
                          <div className="space-y-4 pt-2 border-t border-dashed border-slate-100">
                            <div className="grid grid-cols-2 gap-4">
                              <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Status Pinjam Perpustakaan</label>
                                <select
                                  value={libraryBorrowStatus}
                                  onChange={(e) => setLibraryBorrowStatus(e.target.value)}
                                  className="w-full px-3 py-2 bg-white border border-gray-200 text-xs rounded-xl focus:border-slate-500 font-black cursor-pointer"
                                >
                                  <option value="Aktif">Aktif meminjam</option>
                                  <option value="Belum meminjam">Belum meminjam</option>
                                </select>
                              </div>

                              <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider">One Day One Book</label>
                                <select
                                  value={oneDayOneBookStatus}
                                  onChange={(e) => setOneDayOneBookStatus(e.target.value)}
                                  className="w-full px-3 py-2 bg-white border border-gray-200 text-xs rounded-xl focus:border-slate-500 font-black cursor-pointer"
                                >
                                  <option value="Aktif">Aktif</option>
                                  <option value="Cukup Aktif">Cukup Aktif</option>
                                  <option value="Kurang Aktif">Kurang Aktif</option>
                                  <option value="Belum Aktif">Belum Aktif</option>
                                </select>
                              </div>
                            </div>

                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Follow Up / Tindak Lanjut</label>
                              <textarea
                                placeholder="Langkah intervensi atau rencana asisten tindak lanjut harian..."
                                value={followUpAction}
                                onChange={(e) => setFollowUpAction(e.target.value)}
                                rows={2}
                                className="w-full px-3 py-2 bg-white border border-gray-200 text-xs rounded-xl focus:border-slate-500 font-medium"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* MENGAJI FORM */}
                  {selectedArea === 'MENGAJI' && (
                    <div className="space-y-4 bg-slate-50/30 border border-slate-100 p-4 rounded-3xl">
                      <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                        <Heart size={14} className="text-emerald-600" />
                        <p className="text-[10px] font-black tracking-widest uppercase text-emerald-600">Islamic Mengaji Progress</p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Level Iqro / Quran</label>
                          <select
                            value={iqroLevel}
                            onChange={(e) => setIqroLevel(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-gray-200 text-xs rounded-xl focus:border-slate-500 font-black cursor-pointer"
                          >
                            <option value="Iqro 1">Iqro 1</option>
                            <option value="Iqro 2">Iqro 2</option>
                            <option value="Iqro 3">Iqro 3</option>
                            <option value="Iqro 4">Iqro 4</option>
                            <option value="Iqro 5">Iqro 5</option>
                            <option value="Iqro 6">Iqro 6</option>
                            <option value="Juz Amma">Juz Amma</option>
                            <option value="Al-Quran">Al-Quran</option>
                          </select>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Surah & Ayat / Halaman</label>
                          <input
                            type="text"
                            placeholder="Khusus Al-Quran / surah"
                            value={currentSurah}
                            onChange={(e) => setCurrentSurah(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-gray-200 text-xs rounded-xl focus:border-slate-500 font-bold"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Kelancaran (Fluency)</label>
                          <select
                            value={fluency}
                            onChange={(e) => setFluency(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-gray-200 text-xs rounded-xl focus:border-slate-500 font-black cursor-pointer"
                          >
                            <option value="Lancar">Lancar</option>
                            <option value="Cukup Lancar">Cukup Lancar</option>
                            <option value="Perlu Bimbingan">Perlu Bimbingan</option>
                          </select>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Tajwid & Makhorijul</label>
                          <select
                            value={tajwid}
                            onChange={(e) => setTajwid(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-gray-200 text-xs rounded-xl focus:border-slate-500 font-black cursor-pointer"
                          >
                            <option value="Baik">Baik</option>
                            <option value="Cukup">Cukup</option>
                            <option value="Perlu Bimbingan">Perlu Bimbingan</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* MATH NUMERACY FORM */}
                  {selectedArea === 'MATH' && (
                    <div className="space-y-4 bg-slate-50/30 border border-slate-100 p-4 rounded-3xl">
                      <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                        <Calculator size={14} className="text-purple-600" />
                        <p className="text-[10px] font-black tracking-widest uppercase text-purple-600">Mathematics & Numerasi</p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Math Level (e.g. Standard 3)</label>
                          <input
                            type="text"
                            placeholder="Standard Level"
                            value={mathLevel}
                            onChange={(e) => setMathLevel(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-gray-200 text-xs rounded-xl focus:border-slate-500 font-bold"
                          />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Topik Pembelajaran</label>
                          <input
                            type="text"
                            placeholder="Materi utama"
                            value={topic}
                            onChange={(e) => setTopic(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-gray-200 text-xs rounded-xl focus:border-slate-500 font-bold"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Akurasi (Score 0-100)</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            placeholder="0-100"
                            value={accuracy}
                            onChange={(e) => setAccuracy(e.target.value === '' ? '' : Math.min(100, Math.max(0, Number(e.target.value))))}
                            className="w-full px-3 py-2 bg-white border border-gray-200 text-xs rounded-xl focus:border-slate-500 font-bold"
                          />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Kecepatan Pengerjaan</label>
                          <select
                            value={speed}
                            onChange={(e) => setSpeed(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-gray-200 text-xs rounded-xl focus:border-slate-500 font-black cursor-pointer"
                          >
                            <option value="Cepat">Cepat</option>
                            <option value="Sedang">Sedang</option>
                            <option value="Lambat">Lambat</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5 text-left">
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Intervention Tier</label>
                        <select
                          value={interventionTier}
                          onChange={(e) => setInterventionTier(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-gray-200 text-xs rounded-xl focus:border-slate-500 font-black cursor-pointer"
                        >
                          <option value="Tier 1">Tier 1 (Universal)</option>
                          <option value="Tier 2">Tier 2 (Targeted Help)</option>
                          <option value="Tier 4">Tier 4 (Intensive Specialist)</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {/* COMMON NOTES FIELD */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">CATATAN DAN KETERANGAN UMUM</label>
                    <textarea
                      placeholder="Masukkan catatan spesifik mengenai progres belajar harian atau hambatan..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 bg-white border border-gray-200 text-xs rounded-2xl focus:border-slate-500 font-medium"
                    />
                  </div>

                </div>

                {/* Form Footer Action panel */}
                <div className="p-5 border-t border-gray-50 bg-slate-50/50 flex flex-wrap gap-2.5 justify-end">
                  {activeRecord && (
                    <button
                      onClick={() => handleSaveAssessment(true)} // forceNew snapshot
                      disabled={isSaving}
                      className="flex items-center gap-2 bg-white hover:bg-gray-50 border border-gray-200 px-4 py-2.5 rounded-2xl text-xs font-bold text-gray-700 transition-colors disabled:opacity-50"
                    >
                      Simpan Riwayat Baru
                    </button>
                  )}
                  
                  <button
                    onClick={() => handleSaveAssessment(false)} // standard Save / Update
                    disabled={isSaving}
                    className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white shadow-md shadow-slate-900/10 px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-colors disabled:opacity-50"
                  >
                    {isSaving ? (
                      <>
                        <RefreshCw className="animate-spin w-4 h-4" />
                        <span>Menyimpan...</span>
                      </>
                    ) : (
                      <>
                        <Save size={14} />
                        <span>{activeRecord ? 'Update Penilaian' : 'Simpan Penilaian'}</span>
                      </>
                    )}
                  </button>
                </div>

              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
      )}

      {/* Class History modal summary table */}
      <AnimatePresence>
        {showHistory && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2.5rem] shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col border border-gray-100"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-slate-50/50">
                <div>
                  <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                    <span>RIWAYAT KELAS</span>
                    <span>•</span>
                    <span className="text-slate-900">{classes.find(c => c.id === selectedClassId)?.name || 'Semua Kelas'}</span>
                  </div>
                  <h3 className="text-base font-black text-slate-950 uppercase tracking-wider italic">
                    Ringkasan Penilaian {AREAS.find(a => a.id === selectedArea)?.label}
                  </h3>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Periode: {PERIODS.find(p => p.value === selectedPeriod)?.label}</p>
                </div>
                <button 
                  onClick={() => setShowHistory(false)}
                  className="p-2.5 rounded-2xl bg-white border border-gray-100 hover:bg-gray-50 text-gray-400 hover:text-slate-900 transition-all shadow-sm"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Content Table */}
              <div className="flex-1 overflow-auto p-6">
                {loadingHistory ? (
                  <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2">
                    <RefreshCw className="animate-spin text-gray-400" size={24} />
                    <span className="text-xs font-black uppercase tracking-widest">Membaca Data Riwayat...</span>
                  </div>
                ) : historyRecords.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-gray-400 text-center">
                    <FileText size={40} className="text-gray-200 mb-3" />
                    <p className="text-xs font-black uppercase tracking-widest">Belum ada data terekam</p>
                    <p className="text-[10px] text-gray-400 mt-1 max-w-xs leading-normal">Belum ada siswa di kelas ini yang dinilai untuk area dan rentang bulan ini.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-gray-100">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-gray-100 text-slate-500 uppercase tracking-wider font-black text-[9px]">
                          <th className="py-3 px-4">Nama Siswa</th>
                          
                          {/* BI & ENG COLUMNS */}
                          {(selectedArea === 'BAHASA' || selectedArea === 'ENGLISH') && (
                            <>
                              <th className="py-3 px-4">Words Read</th>
                              <th className="py-3 px-4">Errors</th>
                              <th className="py-3 px-4">WPM</th>
                              <th className="py-3 px-4">Reading Level</th>
                              <th className="py-3 px-4">Intervention</th>
                              <th className="py-3 px-4">Comprehension</th>
                            </>
                          )}

                          {/* BI Only extra columns */}
                          {selectedArea === 'BAHASA' && (
                            <>
                              <th className="py-3 px-4">One Book</th>
                              <th className="py-3 px-4">Library</th>
                            </>
                          )}

                          {/* MENGAJI COLUMNS */}
                          {selectedArea === 'MENGAJI' && (
                            <>
                              <th className="py-3 px-4">Iqro/Quran Level</th>
                              <th className="py-3 px-4">Surah/Ayat</th>
                              <th className="py-3 px-4">Kelancaran</th>
                              <th className="py-3 px-4">Tajwid</th>
                            </>
                          )}

                          {/* MATH COLUMNS */}
                          {selectedArea === 'MATH' && (
                            <>
                              <th className="py-3 px-4">Math Level</th>
                              <th className="py-3 px-4">Topik</th>
                              <th className="py-3 px-4">Akurasi</th>
                              <th className="py-3 px-4">Kecepatan</th>
                              <th className="py-3 px-4">Tier</th>
                            </>
                          )}

                          <th className="py-3 px-4">Terakhir Update</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 text-gray-700 font-medium">
                        {filteredStudents.map(student => {
                          const record = historyRecords.find(r => r.studentId === student.id);
                          return (
                            <tr key={student.id} className="hover:bg-gray-50/50 transition-colors">
                              <td className="py-3.5 px-4">
                                <div className="font-extrabold text-gray-900 uppercase tracking-wider text-[11px]">{student.name}</div>
                                <div className="text-[9px] text-gray-400 mt-0.5">NIS: {student.id}</div>
                              </td>

                              {/* BI & ENG RECORDS */}
                              {(selectedArea === 'BAHASA' || selectedArea === 'ENGLISH') && (
                                <>
                                  <td className="py-3.5 px-4 font-bold">{record?.wordsRead !== undefined ? record.wordsRead : '-'}</td>
                                  <td className="py-3.5 px-4 text-red-500 font-bold">{record?.errors !== undefined ? record.errors : '-'}</td>
                                  <td className="py-3.5 px-4 text-emerald-600 font-extrabold">{record?.wpm !== undefined ? `${record.wpm} wpm` : '-'}</td>
                                  <td className="py-3.5 px-4 font-black">
                                    {record?.readingLevel ? (
                                      <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[9px] font-black">{record.readingLevel}</span>
                                    ) : '-'}
                                  </td>
                                  <td className="py-3.5 px-4">
                                    {record?.interventionTier ? (
                                      <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-[9px] font-bold">{record.interventionTier}</span>
                                    ) : '-'}
                                  </td>
                                  <td className="py-3.5 px-4">
                                    {record?.readingComprehensionScore !== undefined ? (
                                      <div>
                                        <div className="font-bold">{record.readingComprehensionScore}/100</div>
                                        {record.readingComprehensionNotes && (
                                          <div className="text-[9px] text-gray-400 overflow-hidden text-ellipsis max-w-[120px] whitespace-nowrap mt-0.5">{record.readingComprehensionNotes}</div>
                                        )}
                                      </div>
                                    ) : '-'}
                                  </td>
                                </>
                              )}

                              {/* BI Only columns in list */}
                              {selectedArea === 'BAHASA' && (
                                <>
                                  <td className="py-3.5 px-4">
                                    {record?.oneDayOneBookStatus ? (
                                      <span className="px-2 py-0.5 bg-teal-50 text-teal-700 rounded text-[9px] font-bold">{record.oneDayOneBookStatus}</span>
                                    ) : '-'}
                                  </td>
                                  <td className="py-3.5 px-4 font-bold text-gray-500">{record?.libraryBorrowStatus || '-'}</td>
                                </>
                              )}

                              {/* MENGAJI RECORDS */}
                              {selectedArea === 'MENGAJI' && (
                                <>
                                  <td className="py-3.5 px-4 font-black text-slate-800">{record?.iqroLevel || '-'}</td>
                                  <td className="py-3.5 px-4 font-bold">{record?.currentSurah || '-'}</td>
                                  <td className="py-3.5 px-4">
                                    {record?.fluency ? (
                                      <span className="px-2 py-0.5 bg-teal-50 text-teal-700 rounded text-[9px] font-bold">{record.fluency}</span>
                                    ) : '-'}
                                  </td>
                                  <td className="py-3.5 px-4">
                                    {record?.tajwid ? (
                                      <span className="px-2 py-0.5 bg-orange-50 text-orange-700 rounded text-[9px] font-bold">{record.tajwid}</span>
                                    ) : '-'}
                                  </td>
                                </>
                              )}

                              {/* MATH RECORDS */}
                              {selectedArea === 'MATH' && (
                                <>
                                  <td className="py-3.5 px-4 font-bold">{record?.mathLevel || '-'}</td>
                                  <td className="py-3.5 px-4 font-bold text-gray-500 max-w-[100px] overflow-hidden text-ellipsis whitespace-nowrap">{record?.topic || '-'}</td>
                                  <td className="py-3.5 px-4 font-extrabold text-blue-600">{record?.accuracy !== undefined ? `${record.accuracy}/100` : '-'}</td>
                                  <td className="py-3.5 px-4 font-bold">{record?.speed || '-'}</td>
                                  <td className="py-3.5 px-4 font-black">
                                    {record?.interventionTier ? (
                                      <span className="px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded text-[9px]">{record.interventionTier}</span>
                                    ) : '-'}
                                  </td>
                                </>
                              )}

                              <td className="py-3.5 px-4 text-[10px] text-gray-400 font-bold">
                                {record?.updatedAt ? new Date(record.updatedAt).toLocaleDateString('id-ID') : '-'}
                                {record?.createdBy && <div className="text-[9px] text-gray-300 font-medium overflow-hidden text-ellipsis whitespace-nowrap max-w-[80px]">By: {record.createdBy}</div>}
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
