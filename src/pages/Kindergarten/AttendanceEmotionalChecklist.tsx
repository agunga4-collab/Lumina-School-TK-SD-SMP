import * as React from 'react';
import { 
  CheckCircle2, Clock, AlertCircle, UserX, 
  Smile, Meh, Frown, Angry, Save, Calendar, Search, 
  Users, ChevronLeft, ChevronRight, RotateCcw, Trash2,
  FileSpreadsheet, AlertTriangle, X, Check, CalendarDays, ClipboardPaste
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import type { KGAttendanceStatus, KGEmotionStatus } from '../../types';
import { 
  getStoredStudents, 
  saveStoredStudents 
} from '../../lib/kindergartenWeeklyReport';
import { collection, query, where, getDocs, doc, setDoc, getDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { normalizeStudentName, buildStudentNameIndex, resolveAttendanceStudent } from '../../lib/namecentricResolver';
import { getKindergartenClasses, getKindergartenStudents, logFirestoreRead } from '../../lib/kindergartenMetadataCache';

const getMonthlyStudentCell = (monthlyMap: any, student: any, dateStr: string) => {
  if (!monthlyMap) return undefined;
  let rec = monthlyMap[student.id]?.[dateStr];
  if (!rec && student.oldLuminaId) rec = monthlyMap[student.oldLuminaId]?.[dateStr];
  if (!rec && student.nis) rec = monthlyMap[student.nis]?.[dateStr];
  if (!rec && student.name) {
    const normStudentName = normalizeStudentName(student.name);
    const matchingKey = Object.keys(monthlyMap).find(k => {
      return normalizeStudentName(k) === normStudentName;
    });
    if (matchingKey) rec = monthlyMap[matchingKey]?.[dateStr];
  }
  return rec;
};

export default function AttendanceEmotionalChecklist() {
  const { activeYear } = useAcademicYear();
  const [students, setStudents] = React.useState<any[]>(() => getStoredStudents());
  const [classes, setClasses] = React.useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = React.useState<string>('');

  // Smart Paste states
  const [isImportModalOpen, setIsImportModalOpen] = React.useState(false);
  const [pastedText, setPastedText] = React.useState('');
  const [conflictAction, setConflictAction] = React.useState<'overwrite' | 'skip'>('skip');
  const [conflictDates, setConflictDates] = React.useState<string[]>([]);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [pasteSelectedMonth, setPasteSelectedMonth] = React.useState<number>(() => new Date().getMonth());
  const [pasteSelectedYear, setPasteSelectedYear] = React.useState<string>(() => '2026');
  const [isAutoDetectPeriod, setIsAutoDetectPeriod] = React.useState<boolean>(false);
  const [recapViewMode, setRecapViewMode] = React.useState<'emoji' | 'text'>('emoji');
  
  // Mode toggle: Harian vs Lihat Bulanan
  const [checklistMode, setChecklistMode] = React.useState<'daily' | 'monthly'>('daily');
  const [monthlySelectedMonth, setMonthlySelectedMonth] = React.useState<number>(() => new Date().getMonth());
  const [monthlySelectedYear, setMonthlySelectedYear] = React.useState<string>(() => '2026');
  const [monthlyRecords, setMonthlyRecords] = React.useState<any[]>([]);
  const [isLoadingMonthly, setIsLoadingMonthly] = React.useState(false);
  
  const acadYearsList = React.useMemo(() => {
    if (!activeYear) return ['2026'];
    const parts = activeYear.split('/');
    return parts.length === 2 ? parts : [activeYear];
  }, [activeYear]);
  
  const [selectedYear, setSelectedYear] = React.useState<string>(() => {
    return acadYearsList[acadYearsList.length - 1] || '2026';
  });

  // Auto-adjust monthly selected year and selectedYear based on selected month and academic year
  React.useEffect(() => {
    if (!activeYear) return;
    const parts = activeYear.split('/');
    if (parts.length === 2) {
      const yearStart = parts[0];
      const yearEnd = parts[1];
      if (monthlySelectedMonth >= 6) {
        setMonthlySelectedYear(yearStart);
        setSelectedYear(yearStart);
      } else {
        setMonthlySelectedYear(yearEnd);
        setSelectedYear(yearEnd);
      }
    } else if (parts.length === 1 && parts[0]) {
      setMonthlySelectedYear(parts[0]);
      setSelectedYear(parts[0]);
    }
  }, [monthlySelectedMonth, activeYear]);

  const [previewData, setPreviewData] = React.useState<any[] | null>(null);
  const [importResult, setImportResult] = React.useState<{
    successCount: number;
    skipCount: number;
    overwrittenCount: number;
    unmappedCount: number;
  } | null>(null);
  const [isImporting, setIsImporting] = React.useState(false);

  // Load students and classes from cache-enhanced Firestore service
  React.useEffect(() => {
    async function loadKindergartenData() {
      try {
        console.log('[Checklist Page] Requesting cached Kindergarten data for year:', activeYear);
        
        // 1. Fetch classes through the deduplicating caching system
        const fetchedClasses = await getKindergartenClasses(activeYear || '2025/2026');
        setClasses(fetchedClasses);
        
        if (fetchedClasses.length > 0) {
          setSelectedClassId(fetchedClasses[0].id);
        }

        // 2. Fetch joined student list through caching system
        const fetchedStudents = await getKindergartenStudents(activeYear || '2025/2026');
        
        if (fetchedStudents.length > 0) {
          setStudents(fetchedStudents);
          saveStoredStudents(fetchedStudents);
        } else {
          const local = getStoredStudents();
          if (local && local.length > 0) {
            setStudents(local);
          }
        }
      } catch (err) {
        console.error('Error loading Kindergarten students from Firestore:', err);
      }
    }

    loadKindergartenData();
  }, [activeYear]);

  const [selectedDate, setSelectedDate] = React.useState<Date>(new Date());
  const [isSaving, setIsSaving] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');

  const getDateKey = (date: Date) => {
    const yr = date.getFullYear();
    const mo = String(date.getMonth() + 1).padStart(2, '0');
    const da = String(date.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${da}`;
  };

  // State to hold record mappings keyed by "YYYY-MM-DD"
  const [recordsByDate, setRecordsByDate] = React.useState<Record<string, Record<string, { attendance: KGAttendanceStatus | null; emotion: KGEmotionStatus | null }>>>(() => {
    const saved = localStorage.getItem('kg_checklist_records');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return {};
  });

  // Automatic clean up of misplaced June 2026 data — optimized to filter by date and run only once per session
  React.useEffect(() => {
    const runAutomaticJune2026Cleanup = async () => {
      // Prevent running multiple times in the same session
      if (sessionStorage.getItem('kg_june_2026_cleaned')) return;
      sessionStorage.setItem('kg_june_2026_cleaned', 'true');

      try {
        console.log('[Cleanup] Running highly-optimized date-filtered check for misplaced June 2026 data...');
        const q = query(
          collection(db, 'attendance'),
          where('date', '>=', '2026-06-01'),
          where('date', '<=', '2026-06-30')
        );
        const querySnap = await getDocs(q);
        const batch = writeBatch(db);
        let count = 0;
        
        querySnap.docs.forEach(docSnap => {
          batch.delete(docSnap.ref);
          count++;
        });
        
        if (count > 0) {
          await batch.commit();
          console.log(`[Cleanup] Deleted ${count} misplaced June 2026 documents.`);
          
          setRecordsByDate(prev => {
            const updated = { ...prev };
            Object.keys(updated).forEach(dateKey => {
              if (dateKey.startsWith('2026-06-')) {
                delete updated[dateKey];
              }
            });
            localStorage.setItem('kg_checklist_records', JSON.stringify(updated));
            return updated;
          });
          setRefreshKey(prev => prev + 1);
          toast.success(`Sistem otomatis mendeteksi dan membersihkan ${count} laporan salah rekam di Juni 2026! 🧹`);
        }
      } catch (err) {
        console.error('[Cleanup Error] Failed to auto delete June 2026 data:', err);
      }
    };
    runAutomaticJune2026Cleanup();
  }, []);

  const mapValToSystem = (status: string): { attendance: KGAttendanceStatus | null; emotion: KGEmotionStatus | null } => {
    switch (status) {
      case 'happy':
        return { attendance: 'PRESENT', emotion: 'HAPPY' };
      case 'sad':
        return { attendance: 'PRESENT', emotion: 'SAD' };
      case 'ok':
        return { attendance: 'PRESENT', emotion: 'OK' };
      case 'angry':
        return { attendance: 'PRESENT', emotion: 'ANGRY' };
      case 'noNews':
        return { attendance: 'NO_NEWS', emotion: null };
      case 'sick':
        return { attendance: 'SICK', emotion: null };
      case 'izin':
        return { attendance: 'PERMISSION', emotion: null };
      case 'earlyLeave':
        return { attendance: 'PRESENT', emotion: 'OK' };
      default:
        return { attendance: null, emotion: null };
    }
  };

  const mapSystemToFirestore = (attendance: KGAttendanceStatus | null, emotion: KGEmotionStatus | null) => {
    if (!attendance) return null;
    if (attendance === 'SICK') return { emotion: 'sick', status: 'sakit' };
    if (attendance === 'PERMISSION') return { emotion: 'izin', status: 'izin' };
    if (attendance === 'NO_NEWS') return { emotion: 'noNews', status: 'tanpa_kabar' };
    
    // PRESENT
    const emo = (emotion || 'OK').toLowerCase();
    const validEmotions = ['happy', 'sad', 'ok', 'angry'];
    const finalEmo = validEmotions.includes(emo) ? emo : 'ok';
    return { emotion: finalEmo, status: 'hadir' };
  };

  const getEmojiForStatus = (emotion: string, status: string) => {
    if (emotion === 'happy') return { emoji: '😊', label: 'Happy' };
    if (emotion === 'sad') return { emoji: '😢', label: 'Sad' };
    if (emotion === 'angry') return { emoji: '😠', label: 'Angry' };
    if (emotion === 'ok') return { emoji: '😐', label: 'OK' };
    if (emotion === 'earlyLeave') return { emoji: '🚪', label: 'Early Leave' };
    if (emotion === 'sick' || status === 'sakit') return { emoji: '🤒', label: 'Sakit' };
    if (emotion === 'izin' || status === 'izin') return { emoji: '📋', label: 'Izin' };
    if (emotion === 'noNews' || status === 'tanpa_kabar') return { emoji: '❓', label: 'Tanpa Kabar' };
    if (status === 'hadir') return { emoji: '😐', label: 'OK' };
    return null;
  };

  const getTextForStatus = (emotion: string, status: string) => {
    if (emotion === 'happy') return 'Hpy';
    if (emotion === 'sad') return 'Sad';
    if (emotion === 'angry') return 'Ang';
    if (emotion === 'ok') return 'OK';
    if (emotion === 'earlyLeave') return 'EL';
    if (emotion === 'sick' || status === 'sakit') return 'Skt';
    if (emotion === 'izin' || status === 'izin') return 'Izn';
    if (emotion === 'noNews' || status === 'tanpa_kabar') return 'Alp';
    if (status === 'hadir') return 'OK';
    return '';
  };

  const isWeekend = (dayNum: number, yearNum: number, monthNum: number) => {
    const d = new Date(yearNum, monthNum, dayNum);
    const dayOfWeek = d.getDay();
    return dayOfWeek === 0 || dayOfWeek === 6;
  };

  // Synchronize: Load attendance for single day from Firestore when changed
  React.useEffect(() => {
    if (!selectedClassId) return;
    const fetchAttendance = async () => {
      try {
        const dateStr = getDateKey(selectedDate);
        const docId = `${selectedClassId}_${dateStr}`;
        const docRef = doc(db, 'attendance', docId);
        const docSnap = await getDoc(docRef);
        
        // Audit log: 1 document read
        logFirestoreRead('attendanceReports', 1);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          const studentsList = data.students || [];
          
          const tempRecords: Record<string, { attendance: KGAttendanceStatus | null; emotion: KGEmotionStatus | null }> = {};
          studentsList.forEach((s: any) => {
            tempRecords[s.studentId] = mapValToSystem(s.emotion);
          });
          
          setRecordsByDate(prev => {
            const updated = {
              ...prev,
              [dateStr]: tempRecords
            };
            localStorage.setItem('kg_checklist_records', JSON.stringify(updated));
            return updated;
          });
        }
      } catch (err) {
        console.error('Error fetching single attendance:', err);
      }
    };
    fetchAttendance();
  }, [selectedClassId, selectedDate]);

  // Fetch monthly attendance documents
  React.useEffect(() => {
    if (checklistMode !== 'monthly' || !selectedClassId) return;
    
    const fetchMonthlyData = async () => {
      setIsLoadingMonthly(true);
      try {
        const monthStr = String(monthlySelectedMonth + 1).padStart(2, '0');
        const startOfRange = `${monthlySelectedYear}-${monthStr}-01`;
        const endOfRange = `${monthlySelectedYear}-${monthStr}-31`;
        
        console.log(`[Monthly Fetch] Loading class: ${selectedClassId}, From: ${startOfRange} To: ${endOfRange}`);
        
        const q = query(
          collection(db, 'attendance'),
          where('classId', '==', 'KINDERGARTEN_DUMMY_NONE_YET') // We can query by classId and date range directly to save read operations!
        );
        
        // Wait, why are we querying ALL docs of classId and filtering client-side?
        // Let's optimize this too! We should query only documents of that classId starting with date range to save reads!
        const qOptimized = query(
          collection(db, 'attendance'),
          where('classId', '==', selectedClassId),
          where('date', '>=', startOfRange),
          where('date', '<=', endOfRange)
        );
        
        const querySnap = await getDocs(qOptimized);
        const docCount = querySnap.docs.length;
        
        // Audit log: Count actual documents returned
        logFirestoreRead('attendanceReports', docCount || 1);
        
        const docs = querySnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setMonthlyRecords(docs);
      } catch (err) {
        console.error('Error loading monthly attendance:', err);
        toast.error('Gagal memuat rekap bulanan.');
      } finally {
        setIsLoadingMonthly(false);
      }
    };
    
    fetchMonthlyData();
  }, [checklistMode, selectedClassId, monthlySelectedMonth, monthlySelectedYear, refreshKey]);

  const dateKey = getDateKey(selectedDate);
  const dateRecords = recordsByDate[dateKey] || {};

  // Build reactive students visible list
  const studentsWithStatus = students.map(s => {
    let status = dateRecords[s.id];
    if (!status && s.oldLuminaId && dateRecords[s.oldLuminaId]) {
      status = dateRecords[s.oldLuminaId];
    }
    if (!status && s.nis && dateRecords[s.nis]) {
      status = dateRecords[s.nis];
    }
    if (!status && s.name) {
      const normSName = normalizeStudentName(s.name);
      const matchNameKey = Object.keys(dateRecords).find(k => normalizeStudentName(k) === normSName);
      if (matchNameKey) {
        status = dateRecords[matchNameKey];
      }
    }
    const finalStatus = status || { attendance: null, emotion: null };
    return {
      ...s,
      attendance: finalStatus.attendance,
      emotion: finalStatus.emotion
    };
  });

  const getActiveOption = (student: { attendance: KGAttendanceStatus | null; emotion: KGEmotionStatus | null }): string => {
    if (!student.attendance) return '';
    if (student.attendance === 'NO_NEWS') return 'NO_NEWS';
    if (student.attendance === 'SICK') return 'SICK';
    if (student.attendance === 'PERMISSION') return 'EXCUSED';
    return student.emotion || 'OK';
  };

  const handleUpdateOption = (studentId: string, option: string | null) => {
    setRecordsByDate(prev => {
      const currentOfDate = prev[dateKey] || {};
      let newStatus: { attendance: KGAttendanceStatus | null; emotion: KGEmotionStatus | null };

      if (option === null) {
        newStatus = { attendance: null, emotion: null };
      } else {
        switch (option) {
          case 'HAPPY':
            newStatus = { attendance: 'PRESENT', emotion: 'HAPPY' };
            break;
          case 'SAD':
            newStatus = { attendance: 'PRESENT', emotion: 'SAD' };
            break;
          case 'OK':
            newStatus = { attendance: 'PRESENT', emotion: 'OK' };
            break;
          case 'ANGRY':
            newStatus = { attendance: 'PRESENT', emotion: 'ANGRY' };
            break;
          case 'NO_NEWS':
            newStatus = { attendance: 'NO_NEWS', emotion: null };
            break;
          case 'SICK':
            newStatus = { attendance: 'SICK', emotion: null };
            break;
          case 'EXCUSED':
            newStatus = { attendance: 'PERMISSION', emotion: null };
            break;
          default:
            newStatus = { attendance: null, emotion: null };
        }
      }

      const updated = {
        ...prev,
        [dateKey]: {
          ...currentOfDate,
          [studentId]: newStatus
        }
      };

      localStorage.setItem('kg_checklist_records', JSON.stringify(updated));
      return updated;
    });
  };

  const isStudentInClass = (studClassId: string, activeClassObj: { id: string; name: string }) => {
    const sClass = (studClassId || '').trim().toLowerCase();
    const actId = (activeClassObj.id || '').trim().toLowerCase();
    const actName = (activeClassObj.name || '').trim().toLowerCase();
    
    if (!sClass) return false;
    if (sClass === actId || sClass === actName) return true;
    
    const norm = (str: string) => str.replace(/[\s\-_]+/g, '').toLowerCase();
    const normS = norm(sClass);
    const normId = norm(actId);
    const normName = norm(actName);
    
    if (normS === normName || normS === normId) return true;
    
    // Check for specific sub-classes
    const hasKoala = (str: string) => str.includes('koala');
    const hasPanda = (str: string) => str.includes('panda');
    const hasCaterpillar = (str: string) => str.includes('caterpillar');
    const hasButterfly = (str: string) => str.includes('butterfly');
    const hasCenderawasih = (str: string) => str.includes('cenderawasih');
    const hasElang = (str: string) => str.includes('elang');
    const hasKakatua = (str: string) => str.includes('kakatua');
    const hasBadak = (str: string) => str.includes('badak');
    const hasKomodo = (str: string) => str.includes('komodo');
    const hasTapir = (str: string) => str.includes('tapir');
    
    if (hasKoala(normS) && hasKoala(normName)) return true;
    if (hasPanda(normS) && hasPanda(normName)) return true;
    if (hasCaterpillar(normS) && hasCaterpillar(normName)) return true;
    if (hasButterfly(normS) && hasButterfly(normName)) return true;
    if (hasCenderawasih(normS) && hasCenderawasih(normName)) return true;
    if (hasElang(normS) && hasElang(normName)) return true;
    if (hasKakatua(normS) && hasKakatua(normName)) return true;
    if (hasBadak(normS) && hasBadak(normName)) return true;
    if (hasKomodo(normS) && hasKomodo(normName)) return true;
    if (hasTapir(normS) && hasTapir(normName)) return true;

    // Prevent generic "tka" from loosely matching specific sub-classes
    const specificClassWords = [
      'koala', 'panda', 'caterpillar', 'butterfly',
      'cenderawasih', 'elang', 'kakatua', 'badak', 'komodo', 'tapir'
    ];
    const hasSpecS = specificClassWords.some(w => normS.includes(w));
    const hasSpecAct = specificClassWords.some(w => normId.includes(w) || normName.includes(w));
    
    if (hasSpecAct && !hasSpecS) {
      return false; // student is general, but active class is specific
    }
    
    if (normId.includes(normS) || normS.includes(normId)) return true;
    
    return false;
  };

  // Filter students belonging to the currently selected class
  const filteredClassStudents = studentsWithStatus.filter(s => {
    if (selectedClassId && selectedClassId !== 'ALL') {
      const activeClassObj = classes.find(c => c.id === selectedClassId);
      if (activeClassObj) {
        return isStudentInClass(s.classId, activeClassObj);
      }
    }
    return true;
  });

  const handleHappySemua = () => {
    setRecordsByDate(prev => {
      const currentOfDate = prev[dateKey] || {};
      const localUpdated = { ...currentOfDate };

      filteredClassStudents.forEach(s => {
        if (!localUpdated[s.id] || localUpdated[s.id].attendance === null) {
          localUpdated[s.id] = { attendance: 'PRESENT', emotion: 'HAPPY' };
        }
      });

      const updated = {
        ...prev,
        [dateKey]: localUpdated
      };

      localStorage.setItem('kg_checklist_records', JSON.stringify(updated));
      return updated;
    });

    toast.success('Semua si kecil yang tampil ke-update berstatus Happy! 😊');
  };

  const handlePrevDate = () => {
    setSelectedDate(prev => {
      const next = new Date(prev);
      next.setDate(next.getDate() - 1);
      return next;
    });
  };

  const handleNextDate = () => {
    setSelectedDate(prev => {
      const next = new Date(prev);
      next.setDate(next.getDate() + 1);
      return next;
    });
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) {
      setSelectedDate(new Date(e.target.value));
    }
  };

  // Match Excel Student with active class students list safely
  const matchStudent = (excelFullName: string, excelNickname: string) => {
    const fullName = excelFullName.trim().toLowerCase();
    const nickname = excelNickname.trim().toLowerCase();
    
    if (!fullName && !nickname) return null;
    
    const result = filteredClassStudents.find(s => {
      const sFull = (s.fullName || s.name || '').trim().toLowerCase();
      const sNick = (s.nickname || s.nickName || '').trim().toLowerCase();
      
      const isFullMatch = fullName && sFull && sFull === fullName;
      const isNickMatch = nickname && sNick && sNick === nickname;
      const isNickToFullMatch = nickname && sFull && sFull === nickname;
      const isFullToNickMatch = fullName && sNick && sNick === fullName;
      
      return isFullMatch || isNickMatch || isNickToFullMatch || isFullToNickMatch;
    });

    console.log(`[Import Match] "${excelFullName}" / "${excelNickname}" -> ${result ? result.name : 'MISMATCH'}`);
    return result;
  };

  // Smart Paste mapping functions
  const mapPasteStatus = (val: any): string => {
    if (val === undefined || val === null) return '';
    const v = String(val).trim().toLowerCase();
    if (!v || v === '-' || v === '.') return '';
    
    if (v === 'happy' || v === 'h' || v.includes('😊') || v.includes('🙂')) return 'happy';
    if (v === 'sad' || v === 'sedih' || v.includes('😢') || v.includes('🙁')) return 'sad';
    if (v === 'angry' || v === 'marah' || v.includes('😠') || v.includes('😡')) return 'angry';
    if (v === 'ok' || v === 'hadir' || v === 'present' || v.includes('😐') || v === 'yes') return 'ok';
    
    if (v === 'sick' || v === 'sakit' || v === 's' || v.includes('🤒')) return 'sick';
    if (v === 'izin' || v === 'i' || v === 'permission' || v === 'excused' || v === 'excuse' || v.includes('📋')) return 'izin';
    if (v === 'alpa' || v === 'alpha' || v === 'a' || v === 'no news' || v === 'nonews' || v === 'tanpa kabar' || v === 'tk' || v.includes('❓')) return 'noNews';
    if (v === 'early leave' || v === 'earlyleave' || v.includes('🚪')) return 'earlyLeave';
    
    return '';
  };

  const handleParsePastedText = async () => {
    if (!pastedText.trim()) {
      toast.error('Silakan paste data spreadsheet Anda terlebih dahulu.');
      return;
    }

    try {
      const rawLines = pastedText.split(/\r?\n/);
      const lines = rawLines.map(line => line.split('\t'));

      // 1. Detect month and year
      const englishMonths = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
      const indonesianMonths = ['januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september', 'oktober', 'november', 'desember'];
      
      let detectedMonthIdx = pasteSelectedMonth; // Fallback to currently selected month in Smart Paste dropdown
      let detectedYear = parseInt(pasteSelectedYear || selectedYear || monthlySelectedYear || '2026', 10); // Fallback to chosen year
      
      if (isAutoDetectPeriod) {
        // Search all cells for Month & Year strings (e.g. "February 2026", "Februari 2026")
        for (const line of lines) {
          for (const cell of line) {
            const val = cell.trim().toLowerCase();
            if (!val) continue;

            // Check if it has a 4 digit year
            const yrMatch = val.match(/\b(20\d{2})\b/);
            let cellYear = yrMatch ? parseInt(yrMatch[1], 10) : null;

            // Look for month name in cell
            let foundMonthIdx = -1;
            for (let m = 0; m < 12; m++) {
              const eng = englishMonths[m];
              const ind = indonesianMonths[m];
              
              const regexEng = new RegExp('\\b' + eng + '\\b', 'i');
              const regexInd = new RegExp('\\b' + ind + '\\b', 'i');
              
              if (regexEng.test(val) || regexInd.test(val)) {
                foundMonthIdx = m;
                break;
              }
            }

            if (foundMonthIdx === -1) {
              // Check short names
              for (let m = 0; m < 12; m++) {
                const engShort = englishMonths[m].substring(0, 3);
                const indShort = indonesianMonths[m].substring(0, 3);
                const regexEng = new RegExp('\\b' + engShort + '\\b', 'i');
                const regexInd = new RegExp('\\b' + indShort + '\\b', 'i');
                if (regexEng.test(val) || regexInd.test(val)) {
                  foundMonthIdx = m;
                  break;
                }
              }
            }

            if (foundMonthIdx !== -1) {
              detectedMonthIdx = foundMonthIdx;
              if (cellYear) {
                detectedYear = cellYear;
              }
              console.log(`[Parser Month/Year Detect] Found month: ${englishMonths[detectedMonthIdx]}, Year: ${detectedYear}`);
              break;
            }
          }
        }
      }

      let detectedMonth = englishMonths[detectedMonthIdx].charAt(0).toUpperCase() + englishMonths[detectedMonthIdx].slice(1);

      // 2. Identify header line containing day names (Monday, Tuesday...)
      const isWeekdayName = (val: string): boolean => {
        const cleaned = val.toLowerCase().trim();
        const weekdays = [
          'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
          'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun',
          'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu'
        ];
        return weekdays.some(w => cleaned.includes(w));
      };

      let headerRowIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const hasWeekday = line.some((cell, colIdx) => colIdx >= 3 && isWeekdayName(cell));
        if (hasWeekday) {
          headerRowIdx = i;
          console.log(`[Parser Header Detect] Found header at line ${i}`);
          break;
        }
      }

      if (headerRowIdx === -1) {
        // Fallback: search for row with sequence of numbers on cols indices >= 3
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          let numericColCount = 0;
          for (let c = 3; c < line.length; c++) {
            if (/^\d+$/.test(line[c]?.trim())) {
              numericColCount++;
            }
          }
          if (numericColCount >= 5) {
            headerRowIdx = i;
            break;
          }
        }
      }

      if (headerRowIdx === -1) {
        toast.error("Baris header tanggal (yang mengandung nama hari / nomor tanggal) tidak terdeteksi. Pastikan header di-copy.");
        return;
      }

      // Helper to extract clean day number on 1-31 range
      const extractDayNumber = (text: string): number => {
        const cleaned = text.trim();
        if (!cleaned) return -1;
        const tokens = cleaned.match(/\d+/g);
        if (tokens) {
          for (const token of tokens) {
            const num = parseInt(token, 10);
            if (num >= 1 && num <= 31) {
              return num;
            }
          }
        }
        return -1;
      };

      // 3. Match and map Date Column numbers
      const dateCols: { colIdx: number; dayNum: number; dateStr: string; dateObj: Date }[] = [];
      const headerRow = lines[headerRowIdx];
      const rowBelow = lines[headerRowIdx + 1] || [];
      const rowAbove = lines[headerRowIdx - 1] || [];

      for (let c = 3; c < headerRow.length; c++) {
        const cellVal = headerRow[c]?.trim() || '';
        const lVal = cellVal.toLowerCase();

        // Stop on rekap, happy, sad, or similar columns
        const stopKeywords = ['happy', 'sad', 'ok', 'angry', 'jumlah', 'total', 'rekap', 'average', 'rata', 'percentage', 'prosentase', 'hadir', 'sakit', 'izin', 'alpa', '%'];
        if (stopKeywords.some(kw => lVal.includes(kw))) {
          console.log(`[Parser Header Stop] Met stop keyword "${cellVal}" at col index ${c}`);
          break;
        }

        let dayNum = -1;
        const cellDay = extractDayNumber(cellVal);
        const belowDay = extractDayNumber(rowBelow[c] || '');
        const aboveDay = extractDayNumber(rowAbove[c] || '');

        if (cellDay !== -1) {
          dayNum = cellDay;
        } else if (belowDay !== -1) {
          dayNum = belowDay;
        } else if (aboveDay !== -1) {
          dayNum = aboveDay;
        }

        if (dayNum >= 1 && dayNum <= 31) {
          const dateObj = new Date(detectedYear, detectedMonthIdx, dayNum);
          const yStr = dateObj.getFullYear();
          const mStr = String(dateObj.getMonth() + 1).padStart(2, '0');
          const dStr = String(dateObj.getDate()).padStart(2, '0');
          dateCols.push({
            colIdx: c,
            dayNum,
            dateStr: `${yStr}-${mStr}-${dStr}`,
            dateObj
          });
        } else {
          // If weekday is there but day number is not, or field is empty and we have parsed previously, sequential auto-increment
          if (dateCols.length > 0) {
            const nextDayNum = dateCols[dateCols.length - 1].dayNum + 1;
            if (nextDayNum <= 31) {
              const dateObj = new Date(detectedYear, detectedMonthIdx, nextDayNum);
              const yStr = dateObj.getFullYear();
              const mStr = String(dateObj.getMonth() + 1).padStart(2, '0');
              const dStr = String(dateObj.getDate()).padStart(2, '0');
              dateCols.push({
                colIdx: c,
                dayNum: nextDayNum,
                dateStr: `${yStr}-${mStr}-${dStr}`,
                dateObj
              });
              continue;
            }
          }
          console.log(`[Parser Header Stop] Could not parse day number for column index ${c}.`);
          break;
        }
      }

      if (dateCols.length === 0) {
        toast.error("Kolom tanggal (1 - 31) tidak terdeteksi di baris header terpilih.");
        return;
      }

      // 4. Parse Student rows
      const combinedMap: Record<string, {
        fullName: string;
        nickname: string;
        matchedStudent: any;
        attendances: any[];
        totalDays: number;
        filledDays: number;
      }> = {};

      for (let r = headerRowIdx + 1; r < lines.length; r++) {
        const line = lines[r];
        if (!line || line.length < 3) continue;

        const firstCell = line[0]?.trim();
        // Index 0 must be an integer sequence (1, 2, 3...)
        if (!/^\d+$/.test(firstCell)) {
          continue;
        }

        const fullName = line[1]?.trim() || '';
        const nickname = line[2]?.trim() || '';
        if (!fullName) continue;

        const studentAttendances: any[] = [];
        dateCols.forEach(d => {
          if (d.colIdx < line.length) {
            const cellVal = line[d.colIdx];
            const mappedStatus = mapPasteStatus(cellVal);
            studentAttendances.push({
              dateStr: d.dateStr,
              rawStatus: cellVal || '',
              status: mappedStatus
            });
          }
        });

        const matchedStudentObj = matchStudent(fullName, nickname);
        const key = matchedStudentObj ? matchedStudentObj.id : `unmatched_${fullName.toLowerCase()}`;

        if (!combinedMap[key]) {
          combinedMap[key] = {
            fullName,
            nickname,
            matchedStudent: matchedStudentObj || null,
            attendances: [...studentAttendances],
            totalDays: dateCols.length,
            filledDays: studentAttendances.filter(a => a.status !== '').length
          };
        }
      }

      const mergedList = Object.values(combinedMap);
      if (mergedList.length === 0) {
        toast.error("Tidak ada baris siswa yang diawali angka sequence (1, 2, 3...) yang terdeteksi.");
        return;
      }

      // Check conflicts in Firestore
      const parsedDates = Array.from(new Set(mergedList.flatMap(item => item.attendances.map((a: any) => a.dateStr))));
      if (parsedDates.length > 0) {
        const startD = parsedDates.reduce((a, b) => a < b ? a : b);
        const endD = parsedDates.reduce((a, b) => a > b ? a : b);
        
        const qOptimized = query(
          collection(db, 'attendance'),
          where('classId', '==', selectedClassId),
          where('date', '>=', startD),
          where('date', '<=', endD)
        );
        const qSnap = await getDocs(qOptimized);
        logFirestoreRead('attendanceReports', qSnap.docs.length || 1);
        
        const existingDates = qSnap.docs
          .map(doc => doc.data())
          .map((data: any) => data.date);
        
        setConflictDates(existingDates);
      } else {
        setConflictDates([]);
      }

      setPreviewData(mergedList);
      setImportResult(null);
      toast.success(`Terdeteksi ${mergedList.length} siswa & ${dateCols.length} kolom tanggal untuk periode ${detectedMonth} ${detectedYear}!`);
    } catch (err) {
      console.error(err);
      toast.error(`Gagal parsing pasted text: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const getAttendanceStatusInIndonesian = (emotionVal: string): string => {
    if (emotionVal === 'sick') return 'sakit';
    if (emotionVal === 'izin') return 'izin';
    if (emotionVal === 'noNews' || emotionVal === 'alpa') return 'tanpa_kabar';
    return 'hadir';
  };

  const handleImportToSystem = async () => {
    if (!previewData || previewData.length === 0) {
      toast.error("Tidak ada data preview untuk di-import.");
      return;
    }
    
    setIsImporting(true);
    try {
      const datesSet = new Set<string>();
      previewData.forEach(item => {
        item.attendances.forEach((a: any) => {
          if (a.dateStr) datesSet.add(a.dateStr);
        });
      });
      
      const uniqueDates = Array.from(datesSet).sort();
      
      let importedDays = 0;
      let skippedDays = 0;
      let overwrittenDays = 0;
      const unmappedStudentsCount = previewData.filter(item => !item.matchedStudent).length;
      
      const localUpdates: Record<string, Record<string, { attendance: KGAttendanceStatus | null; emotion: KGEmotionStatus | null }>> = {};
      const batch = writeBatch(db);
      
      for (const dateStr of uniqueDates) {
        const hasConflict = conflictDates.includes(dateStr);
        if (hasConflict && conflictAction === 'skip') {
          skippedDays++;
          continue;
        }
        
        const dateStudentsList: any[] = [];
        previewData.forEach(item => {
          if (item.matchedStudent) {
            const attForDate = item.attendances.find((a: any) => a.dateStr === dateStr);
            if (attForDate && attForDate.status) {
              const emotionVal = attForDate.status;
              dateStudentsList.push({
                studentId: item.matchedStudent.id,
                studentName: item.matchedStudent.name,
                emotion: emotionVal,
                status: getAttendanceStatusInIndonesian(emotionVal),
                notes: ''
              });

              if (!localUpdates[dateStr]) {
                localUpdates[dateStr] = {};
              }
              localUpdates[dateStr][item.matchedStudent.id] = mapValToSystem(emotionVal);
            }
          }
        });
        
        if (dateStudentsList.length > 0) {
          const docId = `${selectedClassId}_${dateStr}`;
          const docRef = doc(db, 'attendance', docId);
          
          batch.set(docRef, {
            classId: selectedClassId,
            date: dateStr,
            academicYear: activeYear || '2025/2026',
            students: dateStudentsList,
            importedFrom: "smart_paste",
            importedAt: new Date()
          });

          if (hasConflict) {
            overwrittenDays++;
          } else {
            importedDays++;
          }
        }
      }

      await batch.commit();
      
      setRecordsByDate(prev => {
        const updated = { ...prev };
        Object.keys(localUpdates).forEach(dStr => {
          updated[dStr] = {
            ...(updated[dStr] || {}),
            ...localUpdates[dStr]
          };
        });
        localStorage.setItem('kg_checklist_records', JSON.stringify(updated));
        return updated;
      });

      // Instantly trigger synchronization of monthly active tab
      setRefreshKey(prev => prev + 1);

      setImportResult({
        successCount: importedDays,
        skipCount: skippedDays,
        overwrittenCount: overwrittenDays,
        unmappedCount: unmappedStudentsCount
      });
      
      toast.success("Selesai mengimpor data ke Firestore!");
    } catch (err) {
      console.error(err);
      toast.error(`Gagal menyimpan data import: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsImporting(false);
    }
  };

  const handleSave = async () => {
    if (!selectedClassId) {
      toast.error('Gagal menyimpan: Kelas belum dipilih.');
      return;
    }
    setIsSaving(true);
    try {
      const dateStr = getDateKey(selectedDate);
      const docId = `${selectedClassId}_${dateStr}`;
      const docRef = doc(db, 'attendance', docId);
      
      const dateStudentsList: any[] = [];
      
      filteredClassStudents.forEach(s => {
        const localStatus = dateRecords[s.id];
        if (localStatus && localStatus.attendance) {
          const mapped = mapSystemToFirestore(localStatus.attendance, localStatus.emotion);
          if (mapped) {
            dateStudentsList.push({
              studentId: s.id,
              studentName: s.name,
              emotion: mapped.emotion,
              status: mapped.status,
              notes: ''
            });
          }
        }
      });
      
      await setDoc(docRef, {
        classId: selectedClassId,
        date: dateStr,
        academicYear: activeYear || '2025/2026',
        students: dateStudentsList,
        updatedAt: new Date()
      });
      
      setRefreshKey(prev => prev + 1);
      
      toast.success('Checklist Kehadiran Harian disimpan ke server! ❤️', {
        description: `Tanggal: ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(selectedDate)}`
      });
    } catch (err) {
      console.error('Error saving manual checklist:', err);
      toast.error(`Gagal menyimpan: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteMonthlyData = async () => {
    if (!selectedClassId) {
      toast.error('Gagal menghapus: Kelas belum dipilih.');
      return;
    }
    
    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const confirmMessage = `Apakah Anda yakin ingin menghapus seluruh data rekap kehadiran & emosi untuk bulan ${monthNames[monthlySelectedMonth]} ${monthlySelectedYear} di kelas ${selectedClassName}?

Tindakan ini tidak dapat dibatalkan.`;
    
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setIsLoadingMonthly(true);
    try {
      const monthStr = String(monthlySelectedMonth + 1).padStart(2, '0');
      const startOfRange = `${monthlySelectedYear}-${monthStr}-01`;
      const endOfRange = `${monthlySelectedYear}-${monthStr}-31`;
      
      const qOptimized = query(
        collection(db, 'attendance'),
        where('classId', '==', selectedClassId),
        where('date', '>=', startOfRange),
        where('date', '<=', endOfRange)
      );
      
      const querySnap = await getDocs(qOptimized);
      logFirestoreRead('attendanceReports', querySnap.docs.length || 1);
      const batch = writeBatch(db);
      let deleteCount = 0;
      
      querySnap.docs.forEach(docSnap => {
        batch.delete(docSnap.ref);
        deleteCount++;
      });
      
      if (deleteCount > 0) {
        await batch.commit();
        
        // Update local state by removing items from recordsByDate
        setRecordsByDate(prev => {
          const updated = { ...prev };
          Object.keys(updated).forEach(dateStr => {
            if (dateStr >= startOfRange && dateStr <= endOfRange) {
              delete updated[dateStr];
            }
          });
          localStorage.setItem('kg_checklist_records', JSON.stringify(updated));
          return updated;
        });
        
        setRefreshKey(prev => prev + 1);
        toast.success(`Berhasil menghapus ${deleteCount} dokumen rekap kehadiran bulanan.`);
      } else {
        toast.info("Tidak ada data rekap untuk bulan ini di database.");
      }
    } catch (err) {
      console.error('Error deleting monthly records:', err);
      toast.error('Gagal menghapus data laporan rekap bulanan.');
    } finally {
      setIsLoadingMonthly(false);
    }
  };

  // State filtering logic for search query
  const filteredStudents = studentsWithStatus.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (selectedClassId && selectedClassId !== 'ALL') {
      const activeClassObj = classes.find(c => c.id === selectedClassId);
      if (activeClassObj) {
        return matchesSearch && isStudentInClass(s.classId, activeClassObj);
      }
    }
    return matchesSearch;
  });

  const daysInMonth = React.useMemo(() => {
    const yearNum = parseInt(monthlySelectedYear, 10) || new Date().getFullYear();
    const monthNum = monthlySelectedMonth; 
    return new Date(yearNum, monthNum + 1, 0).getDate();
  }, [monthlySelectedMonth, monthlySelectedYear]);

  const monthlyDataMap = React.useMemo(() => {
    const map: Record<string, Record<string, { emotion: string; status: string }>> = {};
    const nameIndex = buildStudentNameIndex(filteredClassStudents);
    
    // 1. Load from database records
    monthlyRecords.forEach((docData) => {
      const dStr = docData.date; 
      const studentsList = docData.students || [];
      studentsList.forEach((s: any) => {
        // Resolve student name/ID dynamically matching existing records to master identity
        const resolved = resolveAttendanceStudent({
          originalStudentId: s.studentId || '',
          originalStudentName: s.studentName || s.name || '',
          activeStudents: filteredClassStudents,
          nameIndex: nameIndex
        });

        const keyId = resolved.resolvedStudentId || s.studentId;
        if (keyId) {
          if (!map[keyId]) {
            map[keyId] = {};
          }
          map[keyId][dStr] = {
            emotion: s.emotion || '',
            status: s.status || ''
          };
        }
      });
    });

    // Helper map internal react status to monthly format
    const mapSystemToMonthlyCell = (rec: { attendance: KGAttendanceStatus | null; emotion: KGEmotionStatus | null }) => {
      if (!rec || !rec.attendance) return null;
      if (rec.attendance === 'SICK') return { emotion: 'sick', status: 'sakit' };
      if (rec.attendance === 'PERMISSION') return { emotion: 'izin', status: 'izin' };
      if (rec.attendance === 'NO_NEWS') return { emotion: 'noNews', status: 'tanpa_kabar' };
      
      const emo = (rec.emotion || 'OK').toLowerCase();
      const validEmotions = ['happy', 'sad', 'ok', 'angry'];
      const finalEmo = validEmotions.includes(emo) ? emo : 'ok';
      return { emotion: finalEmo, status: 'hadir' };
    };

    // 2. Override with real-time local state modifications (including trash/cleared statuses)
    Object.entries(recordsByDate).forEach(([dStr, studentMap]) => {
      const parts = dStr.split('-');
      if (parts.length === 3) {
        const year = parts[0];
        const monthIndex = parseInt(parts[1], 10) - 1; // 0-11 index
        
        if (year === monthlySelectedYear && monthIndex === monthlySelectedMonth) {
          Object.entries(studentMap).forEach(([studentId, rec]) => {
            // Local edits are keyed by studentId; resolve them dynamically
            const resolved = resolveAttendanceStudent({
              originalStudentId: studentId,
              originalStudentName: '',
              activeStudents: filteredClassStudents,
              nameIndex: nameIndex
            });
            const keyId = resolved.resolvedStudentId || studentId;

            if (!map[keyId]) {
              map[keyId] = {};
            }
            
            const cellVal = mapSystemToMonthlyCell(rec);
            if (cellVal) {
              map[keyId][dStr] = cellVal;
            } else {
              // Deleted / cleared via trash button
              delete map[keyId][dStr];
            }
          });
        }
      }
    });

    return map;
  }, [monthlyRecords, recordsByDate, monthlySelectedMonth, monthlySelectedYear, filteredClassStudents]);

  const totalHadirPerTanggal = React.useMemo(() => {
    const totals: Record<number, number> = {};
    const yearNum = parseInt(monthlySelectedYear, 10) || new Date().getFullYear();
    const monthStr = String(monthlySelectedMonth + 1).padStart(2, '0');
    
    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = String(day).padStart(2, '0');
      const dateStr = `${yearNum}-${monthStr}-${dayStr}`;
      
      let count = 0;
      filteredClassStudents.forEach(student => {
        const record = getMonthlyStudentCell(monthlyDataMap, student, dateStr);
        const isStudentHadir = record && (record.status === 'hadir' || ['happy', 'sad', 'ok', 'angry', 'earlyLeave'].includes(record.emotion));
        if (isStudentHadir) {
          count++;
        }
      });
      totals[day] = count;
    }
    return totals;
  }, [filteredClassStudents, monthlyDataMap, daysInMonth, monthlySelectedMonth, monthlySelectedYear]);

  const studentRecapMap = React.useMemo(() => {
    const recap: Record<string, { hadir: number; sakit: number; izin: number; alpa: number }> = {};
    const yearNum = parseInt(monthlySelectedYear, 10) || new Date().getFullYear();
    const monthStr = String(monthlySelectedMonth + 1).padStart(2, '0');
    
    filteredClassStudents.forEach(student => {
      let hadir = 0;
      let sakit = 0;
      let izin = 0;
      let alpa = 0;
      
      for (let day = 1; day <= daysInMonth; day++) {
        const dayStr = String(day).padStart(2, '0');
        const dateStr = `${yearNum}-${monthStr}-${dayStr}`;
        
        const record = getMonthlyStudentCell(monthlyDataMap, student, dateStr);
        if (record) {
          const isStudentHadir = record.status === 'hadir' || ['happy', 'sad', 'ok', 'angry', 'earlyLeave'].includes(record.emotion);
          if (isStudentHadir) {
            hadir++;
          } else if (record.emotion === 'sick' || record.status === 'sakit') {
            sakit++;
          } else if (record.emotion === 'izin' || record.status === 'izin') {
            izin++;
          } else if (record.emotion === 'noNews' || record.status === 'tanpa_kabar') {
            alpa++;
          }
        }
      }
      recap[student.id] = { hadir, sakit, izin, alpa };
    });
    
    return recap;
  }, [filteredClassStudents, monthlyDataMap, daysInMonth, monthlySelectedMonth, monthlySelectedYear]);

  if (classes.length === 0) {
    return (
      <div id="kg-checklist-empty-wrapper" className="max-w-5xl mx-auto space-y-8 pb-12">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
             <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Attendance & Emotional Checklist</h1>
             <p className="text-gray-500 font-medium text-sm mt-1">
                Catat kehadiran dan kondisi emosional siswa
             </p>
          </div>
        </header>

        <div className="bg-white p-12 rounded-[2rem] border border-emerald-100/50 shadow-xl shadow-emerald-50/50 text-center space-y-4">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle size={32} />
          </div>
          <p className="text-gray-655 font-bold text-lg max-w-md mx-auto">
            Belum ada kelas Kindergarten yang terdaftar. Silakan buat kelas di Panel Admin terlebih dahulu.
          </p>
        </div>
      </div>
    );
  }

  const selectedClassName = classes.find(c => c.id === selectedClassId)?.name || '';

  // Precise statistics calculations for daily
  const totalStudents = filteredClassStudents.length;
  const countBelumDiisi = filteredClassStudents.filter(s => s.attendance === null).length;
  const countHadir = filteredClassStudents.filter(s => s.attendance === 'PRESENT').length;
  const countSakit = filteredClassStudents.filter(s => s.attendance === 'SICK').length;
  const countIzin = filteredClassStudents.filter(s => s.attendance === 'PERMISSION').length;
  const countAlpha = filteredClassStudents.filter(s => s.attendance === 'NO_NEWS').length;

  const countHappy = filteredClassStudents.filter(s => s.attendance === 'PRESENT' && s.emotion === 'HAPPY').length;
  const countOk = filteredClassStudents.filter(s => s.attendance === 'PRESENT' && s.emotion === 'OK').length;
  const countSad = filteredClassStudents.filter(s => s.attendance === 'PRESENT' && s.emotion === 'SAD').length;
  const countAngry = filteredClassStudents.filter(s => s.attendance === 'PRESENT' && s.emotion === 'ANGRY').length;

  return (
    <div id="kg-checklist-container" className="max-w-5xl mx-auto space-y-8 pb-12">
      {/* HEADER SECTION */}
      <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
           <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Attendance & Emotional Checklist</h1>
           <p className="text-gray-500 font-medium text-sm mt-0.5">
              Catat kehadiran dan kondisi emosional dengan mudah & stabil
           </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full lg:w-auto">
          {/* TAB TOGGLE: HARIAN vs BULANAN */}
          <div id="checklist-mode-tabs" className="flex bg-emerald-50 p-1.5 rounded-2xl border border-emerald-100/60 grow sm:grow-0">
            <button
              id="tab-harian"
              onClick={() => setChecklistMode('daily')}
              className={cn(
                "flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border-none grow sm:grow-0 whitespace-nowrap",
                checklistMode === 'daily'
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-100"
                  : "text-emerald-700 hover:text-emerald-950 bg-transparent"
              )}
            >
              <Calendar size={14} />
              Harian
            </button>
            <button
              id="tab-bulanan"
              onClick={() => setChecklistMode('monthly')}
              className={cn(
                "flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border-none grow sm:grow-0 whitespace-nowrap",
                checklistMode === 'monthly'
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-100"
                  : "text-emerald-700 hover:text-emerald-950 bg-transparent"
              )}
            >
              <CalendarDays size={14} />
              Lihat Bulanan
            </button>
          </div>

          {checklistMode === 'daily' && (
            /* DATEPICKER CHEVRONS */
            <div id="datepicker-toolbar" className="flex items-center justify-between sm:justify-start gap-2 bg-white px-3 py-2 rounded-2xl shadow-sm border border-emerald-100/60">
               <button 
                 id="btn-prev-date"
                 onClick={handlePrevDate}
                 className="p-2 hover:bg-emerald-50 rounded-xl text-gray-500 hover:text-emerald-700 transition-all cursor-pointer bg-transparent border-none"
                 title="Kemarin"
               >
                 <ChevronLeft size={16} />
               </button>

               <div className="flex items-center gap-2 px-2 text-emerald-700 font-bold relative group">
                  <Calendar size={16} className="text-emerald-400 shrink-0" />
                  <input 
                    type="date"
                    value={getDateKey(selectedDate)}
                    onChange={handleDateChange}
                    className="font-bold text-sm text-gray-700 outline-none cursor-pointer bg-transparent border-none py-1 absolute inset-0 opacity-0 z-10 w-full"
                    title="Pilih Tanggal Bebas"
                  />
                  <span className="text-sm select-none border-b border-dashed border-emerald-300 pb-0.5 cursor-pointer leading-tight whitespace-nowrap">
                    {new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(selectedDate)}
                  </span>
               </div>

               <button 
                 id="btn-next-date"
                 onClick={handleNextDate}
                 className="p-2 hover:bg-emerald-50 rounded-xl text-gray-500 hover:text-emerald-700 transition-all cursor-pointer bg-transparent border-none"
                 title="Besok"
               >
                 <ChevronRight size={16} />
               </button>
            </div>
          )}
        </div>
      </header>

      {/* CLASS DROPDOWN CARD */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-[2rem] border border-emerald-100/50 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-gray-700">Pilih Kelas:</span>
            <select
              id="select-class-dropdown"
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="px-4 py-2.5 bg-emerald-50/40 border border-emerald-100 rounded-2xl text-sm font-bold text-emerald-800 focus:ring-2 focus:ring-emerald-300 outline-none transition-all cursor-pointer min-w-[250px]"
            >
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name} ({cls.grade})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="pl-4">
          <h2 className="text-sm font-extrabold text-emerald-700 italic tracking-tight">
            Daftar Anak — {selectedClassName}
          </h2>
        </div>
      </div>

      {checklistMode === 'daily' && (
        <>
          {/* QUICK TOOLBAR & PASTE ACTION */}
          <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-white p-5 rounded-[2rem] border border-emerald-100/50 shadow-sm">
            <div className="relative flex-1">
               <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-300" size={16} />
               <input 
                 id="search-children"
                 type="text" 
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 placeholder="Cari nama si kecil yang ceria..." 
                 className="pl-11 pr-4 py-2.5 w-full bg-emerald-50/10 border border-emerald-100 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-emerald-300 focus:border-transparent transition-all placeholder:text-emerald-300" 
               />
            </div>

            <div className="flex items-center gap-2">
               <button 
                 id="btn-happy-semua"
                 onClick={handleHappySemua}
                 className="flex items-center justify-center gap-2 bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-white font-bold text-xs py-2.5 px-5 rounded-2xl shadow-md shadow-amber-100 hover:shadow-lg hover:shadow-amber-200/50 transition-all cursor-pointer border-none"
                >
                  <Smile size={16} />
                  Set Happy Semua
                </button>
                <button 
                  id="btn-paste-spreadsheet"
                  onClick={() => {
                    setPastedText('');
                    setPreviewData(null);
                    setImportResult(null);
                    setConflictDates([]);
                    setPasteSelectedMonth(monthlySelectedMonth);
                    setPasteSelectedYear(monthlySelectedYear);
                    setIsImportModalOpen(true);
                  }}
                  className="flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold text-xs py-2.5 px-5 rounded-2xl shadow-md hover:shadow-lg transition-all cursor-pointer whitespace-nowrap border-none"
                >
                  <ClipboardPaste size={16} />
                  Paste dari Spreadsheet
                </button>
            </div>
          </div>

          {/* ATTENDANCE TABLE */}
          <div className="bg-white rounded-[2rem] shadow-xl shadow-emerald-50/50 border border-emerald-100/50 overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-500/5 to-teal-500/5 p-6 border-b border-emerald-50 flex items-center justify-between">
               <div className="flex items-center gap-2 text-emerald-700">
                  <Users size={18} />
                  <span className="font-bold text-sm tracking-tight">
                    Daftar Checklist Kehadiran — {filteredStudents.length} Siswa
                  </span>
               </div>
            </div>

            <div className="overflow-x-auto">
              <table id="daily-attendance-table" className="w-full text-left min-w-[950px] table-fixed border-collapse">
                <thead>
                  <tr className="text-emerald-700 text-[10px] font-black uppercase tracking-[0.2em] border-b border-emerald-100 bg-emerald-50/10">
                    <th className="px-6 py-4 w-[240px]">Anak Hebat</th>
                    <th className="px-6 py-4 text-center">Attendance & Emotional Checklist</th>
                    <th className="px-6 py-4 text-center w-[100px]">Reset Hapus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-50/50">
                  {filteredStudents.map((student) => {
                    const activeOption = getActiveOption(student);
                    const hasSelected = activeOption !== '';

                    return (
                      <tr key={student.id} className={cn("transition-colors", hasSelected ? "bg-white" : "bg-gray-50/10 hover:bg-emerald-50/10")}>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-4">
                             <div className={cn(
                               "w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm shadow-sm border transition-all",
                               activeOption === 'HAPPY' && "bg-yellow-50 text-yellow-600 border-yellow-200 scale-105",
                               activeOption === 'SAD' && "bg-blue-50 text-blue-600 border-blue-200 scale-105",
                               activeOption === 'OK' && "bg-emerald-50 text-emerald-600 border-emerald-200 scale-105",
                               activeOption === 'ANGRY' && "bg-red-50 text-red-600 border-red-200 scale-105",
                               activeOption === 'SICK' && "bg-indigo-50 text-indigo-600 border-indigo-200 scale-105",
                               activeOption === 'EXCUSED' && "bg-orange-50 text-orange-600 border-orange-200 scale-105",
                               activeOption === 'NO_NEWS' && "bg-slate-50 text-slate-500 border-slate-200 scale-105",
                               !hasSelected && "from-emerald-50 to-teal-50 bg-gradient-to-br text-emerald-700 border-white"
                             )}>
                                {student.name[0]}
                             </div>
                             <div>
                                <p className="font-bold text-gray-900 text-sm tracking-tight">{student.name}</p>
                                <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest">
                                   {hasSelected ? (
                                      <span className="inline-flex items-center gap-1 transition-all">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                        Sudah Terisi
                                      </span>
                                   ) : (
                                      <span className="text-gray-400 font-medium">Belum Diisi</span>
                                   )}
                                </p>
                             </div>
                           </div>
                        </td>

                        <td className="px-6 py-5">
                          <div className="flex flex-wrap gap-2 justify-center items-center">
                             <ChecklistButton 
                               option="HAPPY"
                               active={activeOption === 'HAPPY'}
                               onClick={() => handleUpdateOption(student.id, 'HAPPY')}
                             />
                             <ChecklistButton 
                               option="SAD"
                               active={activeOption === 'SAD'}
                               onClick={() => handleUpdateOption(student.id, 'SAD')}
                             />
                             <ChecklistButton 
                               option="OK"
                               active={activeOption === 'OK'}
                               onClick={() => handleUpdateOption(student.id, 'OK')}
                             />
                             <ChecklistButton 
                               option="ANGRY"
                               active={activeOption === 'ANGRY'}
                               onClick={() => handleUpdateOption(student.id, 'ANGRY')}
                             />
                             <span className="w-[1px] h-5 bg-emerald-100 hidden sm:inline-block" />
                             <ChecklistButton 
                               option="NO_NEWS"
                               active={activeOption === 'NO_NEWS'}
                               onClick={() => handleUpdateOption(student.id, 'NO_NEWS')}
                             />
                             <ChecklistButton 
                               option="SICK"
                               active={activeOption === 'SICK'}
                               onClick={() => handleUpdateOption(student.id, 'SICK')}
                             />
                             <ChecklistButton 
                               option="EXCUSED"
                               active={activeOption === 'EXCUSED'}
                               onClick={() => handleUpdateOption(student.id, 'EXCUSED')}
                             />
                          </div>
                        </td>

                        <td className="px-6 py-5 text-center">
                          {hasSelected ? (
                            <button 
                              onClick={() => handleUpdateOption(student.id, null)}
                              className="p-2 hover:bg-rose-50 text-rose-400 hover:text-rose-600 rounded-xl transition-all border border-transparent hover:border-rose-100 cursor-pointer inline-flex items-center justify-center bg-transparent"
                              title="Hapus / Kosongkan Pilihan"
                            >
                              <Trash2 size={16} />
                            </button>
                          ) : (
                            <span className="text-xs text-gray-350 font-medium select-none">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredStudents.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-6 py-12 text-center text-gray-400 text-sm font-bold">
                        Si kecil yang dicari tidak ditemukan 😢
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {checklistMode === 'daily' && (
        <div className="bg-white p-6 rounded-3xl border border-emerald-100/70 shadow-sm space-y-6">
         {/* Live Dynamic Counters */}
         <div className="flex flex-wrap items-center justify-start gap-3 select-none">
            <div className={cn(
               "flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all",
               countBelumDiisi > 0 ? "bg-orange-50 text-orange-800 border-orange-200" : "bg-teal-50 text-teal-800 border-teal-200"
            )}>
               <div className={cn("w-2 h-2 rounded-full", countBelumDiisi > 0 ? "bg-orange-500 animate-pulse" : "bg-teal-500")} />
               BELUM DIISI: {countBelumDiisi} / {totalStudents}
            </div>

            <div className="flex items-center gap-2 bg-emerald-50 text-emerald-850 px-3 py-1.5 rounded-xl border border-emerald-100 text-xs font-bold">
               <div className="w-2 h-2 rounded-full bg-emerald-500" />
               HADIR: {countHadir}
            </div>

            <div className="flex items-center gap-2 bg-teal-50 text-teal-850 px-3 py-1.5 rounded-xl border border-teal-100 text-xs font-bold">
               <div className="w-2 h-2 rounded-full bg-teal-500" />
               IZIN: {countIzin} 
            </div>

            <div className="flex items-center gap-2 bg-indigo-50 text-indigo-850 px-3 py-1.5 rounded-xl border border-indigo-100 text-xs font-bold">
               <div className="w-2 h-2 rounded-full bg-indigo-500" />
               SAKIT: {countSakit}
            </div>

            <div className="flex items-center gap-2 bg-slate-50 text-slate-850 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold">
               <div className="w-2 h-2 rounded-full bg-slate-500" />
               TANPA KABAR: {countAlpha}
            </div>
         </div>

         {/* Detailed Emotion breakdown card */}
         <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-dashed border-emerald-100/60 font-medium">
            <div className="bg-yellow-50/40 p-3 rounded-2xl border border-yellow-100/50 text-center select-none">
               <p className="text-[10px] text-yellow-600 font-extrabold uppercase tracking-widest mb-1">😊 Happy</p>
               <span className="text-xl font-black text-yellow-700">{countHappy}</span>
            </div>
            <div className="bg-emerald-50/40 p-3 rounded-2xl border border-emerald-100/50 text-center select-none">
               <p className="text-[10px] text-emerald-600 font-extrabold uppercase tracking-widest mb-1">😐 OK / Biasa</p>
               <span className="text-xl font-black text-emerald-700">{countOk}</span>
            </div>
            <div className="bg-blue-50/40 p-3 rounded-2xl border border-blue-100/50 text-center select-none">
               <p className="text-[10px] text-blue-600 font-extrabold uppercase tracking-widest mb-1">😢 Sad / Sedih</p>
               <span className="text-xl font-black text-blue-700">{countSad}</span>
            </div>
            <div className="bg-red-50/40 p-3 rounded-2xl border border-red-100/50 text-center select-none">
               <p className="text-[10px] text-red-500 font-extrabold uppercase tracking-widest mb-1">😠 Angry / Marah</p>
               <span className="text-xl font-black text-red-600">{countAngry}</span>
            </div>
         </div>

         {/* Main save manual checklist */}
         <div className="flex justify-end pt-4 border-t border-emerald-50">
           <button 
             id="btn-save-manual-daily"
             onClick={handleSave}
             disabled={isSaving}
             className="flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-heavy px-8 py-3.5 rounded-2xl shadow-lg hover:shadow-xl hover:shadow-emerald-100 transition-all active:scale-95 disabled:opacity-50 cursor-pointer text-xs font-bold border-none"
           >
             {isSaving ? <Clock className="animate-spin" size={16} /> : <Save size={16} />}
             Simpan Laporan Harian
           </button>
         </div>
      </div>
      )}

      {/* MONTHLY REKAP MODE VIEW */}
      {checklistMode === 'monthly' && (
        <>
          {/* MONTHLY VIEW DROPDOWNS CONTROLS */}
          <div id="monthly-filter-controls" className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-[2rem] border border-emerald-100/50 shadow-sm">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 text-emerald-850 font-bold text-sm">
                <Users size={16} className="text-emerald-500 shrink-0" />
                <span>Rekap Kelas: {selectedClassName}</span>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-500">Bulan:</span>
                <select
                  id="monthly-month-picker"
                  value={monthlySelectedMonth}
                  onChange={(e) => setMonthlySelectedMonth(parseInt(e.target.value, 10))}
                  className="px-3 py-1.5 bg-emerald-50/40 border border-emerald-100 rounded-xl text-xs font-bold text-emerald-800 focus:ring-1 focus:ring-emerald-300 outline-none cursor-pointer"
                >
                  {['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'].map((mName, idx) => (
                    <option key={idx} value={idx}>{mName}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-500">Tahun:</span>
                <select
                  id="monthly-year-picker"
                  value={monthlySelectedYear}
                  onChange={(e) => setMonthlySelectedYear(e.target.value)}
                  className="px-3 py-1.5 bg-emerald-50/40 border border-emerald-100 rounded-xl text-xs font-bold text-emerald-800 focus:ring-1 focus:ring-emerald-300 outline-none cursor-pointer"
                >
                  {['2025', '2026', '2027', '2028', '2029'].map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 pl-2 border-l border-gray-200">
                <span className="text-xs font-bold text-gray-500">Tampilan Sel:</span>
                <div className="inline-flex rounded-xl p-0.5 bg-gray-100 border border-gray-200 shadow-inner">
                  <button
                    type="button"
                    onClick={() => setRecapViewMode('emoji')}
                    className={cn(
                      "px-3 py-1 text-[11px] font-extrabold rounded-lg transition-all border-none cursor-pointer",
                      recapViewMode === 'emoji' ? "bg-white text-emerald-800 shadow-sm" : "text-gray-500 hover:text-gray-700 bg-transparent"
                    )}
                  >
                    🌻 Emoji
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecapViewMode('text')}
                    className={cn(
                      "px-3 py-1 text-[11px] font-extrabold rounded-lg transition-all border-none cursor-pointer",
                      recapViewMode === 'text' ? "bg-white text-emerald-800 shadow-sm" : "text-gray-500 hover:text-gray-700 bg-transparent"
                    )}
                  >
                    📄 Teks
                  </button>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                id="btn-delete-monthly-recap"
                onClick={handleDeleteMonthlyData}
                className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-700 border border-rose-200/50 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Trash2 size={13} />
                Hapus Rekap Bulan Ini
              </button>
              <div className="text-xs font-bold text-gray-550 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-100 select-none">
                Total {filteredClassStudents.length} Siswa
              </div>
            </div>
          </div>

          {/* MONTHLY TABLE DISPLAY CARD */}
          <div className="bg-white rounded-[2rem] shadow-xl shadow-emerald-50/50 border border-emerald-100/50 overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-500/5 to-teal-500/5 p-6 border-b border-emerald-50 flex items-center justify-between">
               <div className="flex items-center gap-2 text-emerald-700">
                  <CalendarDays size={18} />
                  <span className="font-bold text-sm tracking-tight">
                    Tabel Rekap Kehadiran Bulanan — {selectedClassName}
                  </span>
               </div>
            </div>

            {isLoadingMonthly ? (
              <div className="p-16 text-center space-y-4">
                <Clock className="w-10 h-10 text-emerald-500 animate-spin mx-auto" />
                <p className="text-sm font-bold text-gray-550">Memuat data rekap dari database...</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table id="monthly-recap-table" className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-emerald-50/10 border-b border-emerald-100 text-emerald-800 font-extrabold uppercase tracking-wider text-[10px]">
                      <th className="px-4 py-3 sticky left-0 bg-emerald-50 font-bold z-10 border-r border-emerald-100 w-[180px] shrink-0">Anak Hebat</th>
                      {Array.from({ length: daysInMonth }).map((_, i) => {
                        const day = i + 1;
                        const weekend = isWeekend(day, parseInt(monthlySelectedYear, 10), monthlySelectedMonth);
                        return (
                          <th 
                            key={day} 
                            className={cn(
                              "py-2 text-center font-bold border-r border-emerald-100/30 w-[32px] min-w-[32px] max-w-[32px]", 
                              weekend ? "bg-red-50 text-red-600" : "text-gray-700"
                            )}
                          >
                            {day}
                          </th>
                        );
                      })}
                      <th className="px-2 py-3 text-center border-l-2 border-emerald-200 bg-emerald-50 font-bold text-emerald-950 w-[35px]">H</th>
                      <th className="px-2 py-3 text-center bg-indigo-50 font-bold text-indigo-950 w-[35px]">S</th>
                      <th className="px-2 py-3 text-center bg-teal-50 font-bold text-teal-950 w-[35px]">I</th>
                      <th className="px-2 py-3 text-center bg-slate-100 font-bold text-slate-150 w-[35px]">A</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100/80">
                    {filteredClassStudents.length === 0 ? (
                      <tr>
                        <td colSpan={daysInMonth + 5} className="px-6 py-12 text-center text-gray-400 font-bold">
                          Tidak ada data siswa untuk kelas ini.
                        </td>
                      </tr>
                    ) : (
                      filteredClassStudents.map((student) => {
                        const recap = studentRecapMap[student.id] || { hadir: 0, sakit: 0, izin: 0, alpa: 0 };
                        
                        return (
                          <tr key={student.id} className="hover:bg-emerald-50/5 transition-colors">
                            <td className="px-4 py-2.5 font-bold text-gray-800 sticky left-0 bg-white z-10 border-r border-emerald-100 w-[180px] truncate max-w-[180px] shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                              {student.name}
                            </td>
                            
                            {Array.from({ length: daysInMonth }).map((_, i) => {
                              const day = i + 1;
                              const dayStr = String(day).padStart(2, '0');
                              const monthStr = String(monthlySelectedMonth + 1).padStart(2, '0');
                              const dateStr = `${monthlySelectedYear}-${monthStr}-${dayStr}`;
                              
                              const record = getMonthlyStudentCell(monthlyDataMap, student, dateStr);
                              const emojiData = record ? getEmojiForStatus(record.emotion, record.status) : null;
                              const weekend = isWeekend(day, parseInt(monthlySelectedYear, 10), monthlySelectedMonth);
                              
                              return (
                                <td 
                                  key={day} 
                                  className={cn(
                                    "py-1.5 text-center border-r border-gray-100 text-sm select-none",
                                    weekend ? "bg-red-50/10" : ""
                                  )}
                                  title={record ? `Tanggal ${day}: ${emojiData?.label || record.status}` : undefined}
                                >
                                  {recapViewMode === 'emoji' ? (
                                    emojiData?.emoji || ''
                                  ) : record ? (
                                    <span className={cn(
                                      "font-extrabold text-[10px] uppercase tracking-tighter",
                                      record.emotion === 'happy' && "text-amber-500",
                                      record.emotion === 'ok' && "text-emerald-500",
                                      record.emotion === 'sad' && "text-blue-500",
                                      record.emotion === 'angry' && "text-rose-500",
                                      record.emotion === 'earlyLeave' && "text-yellow-600",
                                      (record.emotion === 'sick' || record.status === 'sakit') && "text-red-500",
                                      (record.emotion === 'izin' || record.status === 'izin') && "text-teal-600",
                                      (record.emotion === 'noNews' || record.status === 'tanpa_kabar') && "text-gray-400"
                                    )}>
                                      {getTextForStatus(record.emotion, record.status)}
                                    </span>
                                  ) : (
                                    ''
                                  )}
                                </td>
                              );
                            })}

                            <td className="py-2 text-center font-black bg-emerald-50/20 text-emerald-750 border-l-2 border-emerald-250">
                              {recap.hadir || '-'}
                            </td>
                            <td className="py-2 text-center font-black bg-indigo-50/20 text-indigo-750">
                              {recap.sakit || '-'}
                            </td>
                            <td className="py-2 text-center font-black bg-teal-50/20 text-teal-750">
                              {recap.izin || '-'}
                            </td>
                            <td className="py-2 text-center font-black bg-slate-100/20 text-slate-750">
                              {recap.alpa || '-'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                    
                    {filteredClassStudents.length > 0 && (
                      <tr className="bg-emerald-50/20 font-bold border-t border-emerald-100 text-xs">
                        <td className="px-4 py-3 sticky left-0 bg-emerald-50 z-10 border-r border-emerald-100 font-black text-emerald-950 w-[180px] shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                          Total Hadir
                        </td>
                        {Array.from({ length: daysInMonth }).map((_, i) => {
                          const day = i + 1;
                          const count = totalHadirPerTanggal[day] || 0;
                          const weekend = isWeekend(day, parseInt(monthlySelectedYear, 10), monthlySelectedMonth);
                          return (
                            <td 
                              key={day} 
                              className={cn(
                                "py-1 text-center font-black border-r border-emerald-100/50 text-[11px]",
                                count > 0 ? "text-emerald-800 bg-emerald-50/50" : "text-gray-400 font-medium",
                                weekend && count === 0 ? "bg-red-50/10" : ""
                              )}
                            >
                              {count || '-'}
                            </td>
                          );
                        })}
                        <td colSpan={4} className="bg-emerald-50/30"></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* LEGEND BLOCK */}
            <div className="bg-gray-50 p-5 border-t border-gray-100 select-none text-[10px] text-gray-500 font-semibold space-y-2 text-left">
              <p className="font-extrabold uppercase text-gray-650 tracking-wider">Keterangan Ikon Kehadiran:</p>
              <div className="flex flex-wrap gap-x-5 gap-y-2.5">
                <span className="flex items-center gap-1">😊 <strong className="text-gray-700 font-bold">Happy</strong></span>
                <span className="flex items-center gap-1">😢 <strong className="text-gray-700 font-bold">Sad</strong></span>
                <span className="flex items-center gap-1">😠 <strong className="text-gray-700 font-bold">Angry</strong></span>
                <span className="flex items-center gap-1">😐 <strong className="text-gray-700 font-bold">OK</strong></span>
                <span className="flex items-center gap-1">❓ <strong className="text-gray-700 font-bold">No News (Alpa)</strong></span>
                <span className="flex items-center gap-1">🤒 <strong className="text-gray-700 font-bold">Sick (Sakit)</strong></span>
                <span className="flex items-center gap-1">📋 <strong className="text-gray-700 font-bold">Izin</strong></span>
                <span className="flex items-center gap-1">🚪 <strong className="text-gray-700 font-bold">Early Leave</strong></span>
              </div>
              
              <p className="font-extrabold uppercase text-gray-650 tracking-wider pt-2 border-t border-dashed border-gray-200">Keterangan Kolom Ringkasan:</p>
              <div className="flex flex-wrap gap-5 text-gray-650">
                <span><strong className="text-emerald-700 font-black">H</strong> = Total Hari Hadir (Present)</span>
                <span><strong className="text-indigo-750 font-black">S</strong> = Total Hari Sakit (Sick)</span>
                <span><strong className="text-teal-750 font-black">I</strong> = Total Hari Izin (Excuse)</span>
                <span><strong className="text-slate-800 font-black">A</strong> = Total Alpha (No News)</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* SMART PASTE MODAL */}
      {isImportModalOpen && (
        <div id="smart-paste-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto font-sans text-left">
          <div className="bg-white rounded-[2rem] w-full max-w-4xl shadow-2xl border border-emerald-100 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-6 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="w-8 h-8 opacity-90" />
                <div>
                  <h3 className="text-xl font-bold">Smart Paste dari Spreadsheet</h3>
                  <p className="text-xs text-emerald-100 font-medium">Tempel data dari Google Sheets / Excel | Tahun: {selectedYear}</p>
                </div>
              </div>
              <button 
                id="btn-close-modal-top"
                onClick={() => setIsImportModalOpen(false)}
                className="p-1.5 hover:bg-white/20 rounded-full transition-all cursor-pointer shadow-none border-none bg-transparent text-white"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-left">
              {!importResult ? (
                <>
                  <div className="space-y-4">
                    <p className="text-xs text-gray-600 leading-relaxed font-semibold">
                      Cara Pakai: Salin seluruh area baris rekap dari Excel atau Google Sheets (termasuk baris nama hari/tanggal) lalu paste di bawah. Logika parser akan otomatis mendeteksi nama anak, kolom tanggal, dan menetapkan status kehadiran masing-masing tanggal secara presisi.
                    </p>

                    {/* Textarea Input area */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-black text-emerald-800 uppercase tracking-wider block">Spreadsheet Copied Text:</label>
                      <textarea
                        id="modal-textarea-paste"
                        value={pastedText}
                        onChange={(e) => setPastedText(e.target.value)}
                        placeholder="Paste di sini... Contoh baris content: Monday   Tuesday   Wednesday&#10;1   2   3&#10;1   Ahmad Dani   Dani   H   S   -&#10;2   Budi Setiawan   Budi   😊   🤒   I"
                        className="w-full h-44 p-4 font-mono text-xs bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-300 focus:border-transparent transition-all"
                      />
                    </div>
                  </div>

                  <div className="bg-emerald-50/25 p-5 rounded-3xl border border-emerald-100/50 space-y-4">
                    <p className="text-xs font-black text-emerald-900 border-b border-emerald-100/85 pb-2 uppercase tracking-wide">Pengaturan Periode & Impor</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* Month Target */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-black text-emerald-800 uppercase tracking-wider block">Bulan Target Input</label>
                        <select
                          id="modal-month-paste-target"
                          value={pasteSelectedMonth}
                          onChange={(e) => {
                            setPasteSelectedMonth(parseInt(e.target.value, 10));
                            setPreviewData(null);
                          }}
                          className="w-full px-4 py-2.5 bg-white border border-emerald-100 rounded-xl text-xs font-bold text-gray-700 focus:ring-2 focus:ring-emerald-300 outline-none cursor-pointer"
                        >
                          {['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'].map((mName, idx) => (
                            <option key={idx} value={idx}>{mName}</option>
                          ))}
                        </select>
                      </div>

                      {/* Year Target */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-black text-emerald-800 uppercase tracking-wider block">Tahun Target Input</label>
                        <select
                          id="modal-year-paste-target"
                          value={pasteSelectedYear}
                          onChange={(e) => {
                            setPasteSelectedYear(e.target.value);
                            setPreviewData(null);
                          }}
                          className="w-full px-4 py-2.5 bg-white border border-emerald-100 rounded-xl text-xs font-bold text-gray-700 focus:ring-2 focus:ring-emerald-300 outline-none cursor-pointer"
                        >
                          {['2025', '2026', '2027', '2028', '2029'].map((y) => (
                            <option key={y} value={y}>{y}</option>
                          ))}
                        </select>
                      </div>

                      {/* Conflict Resolution Settings */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-black text-emerald-800 uppercase tracking-wider block">Resolusi Konflik</label>
                        <div className="flex gap-4 pt-2">
                          <label className="flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer">
                            <input 
                              type="radio" 
                              name="conflictAction"
                              checked={conflictAction === 'skip'} 
                              onChange={() => setConflictAction('skip')} 
                              className="text-emerald-600 focus:ring-emerald-500 w-4 h-4" 
                            />
                            Skip (Lewati)
                          </label>
                          <label className="flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer">
                            <input 
                              type="radio" 
                              name="conflictAction"
                              checked={conflictAction === 'overwrite'} 
                              onChange={() => setConflictAction('overwrite')} 
                              className="text-emerald-400 focus:ring-emerald-400 w-4 h-4" 
                            />
                            Overwrite (Timpa)
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2.5 border-t border-emerald-100/50 flex items-center justify-between">
                      <label className="flex items-center gap-2.5 text-xs font-black text-teal-850 hover:text-teal-950 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isAutoDetectPeriod}
                          onChange={(e) => {
                            setIsAutoDetectPeriod(e.target.checked);
                            setPreviewData(null);
                          }}
                          className="w-4 h-4 rounded text-emerald-600 border-emerald-350 focus:ring-emerald-500 cursor-pointer"
                        />
                        Aktifkan Pendeteksi Bulan / Tahun Otomatis dari Teks Spreadsheet
                      </label>
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      id="btn-process-pasted-text"
                      type="button"
                      onClick={handleParsePastedText}
                      className={cn(
                        "px-6 py-2.5 rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer border-none",
                        pastedText.trim()
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white' 
                          : 'bg-gray-100 text-gray-400 border border-gray-200'
                      )}
                    >
                      Baca &amp; Generate Preview
                    </button>
                  </div>

                  {/* PREVIEW CONTAINER */}
                  {previewData && (
                    <div className="space-y-3 pt-4 border-t border-gray-100 animate-fadeIn">
                      <div className="flex justify-between items-center">
                        <h4 className="text-sm font-extrabold text-emerald-800 tracking-tight">Preview Hasil Parse Siswa ({previewData.length})</h4>
                        {conflictDates.length > 0 && (
                          <span className="bg-orange-50 text-orange-700 text-[10px] px-2.5 py-1 rounded-full font-bold border border-orange-100">
                            Konflik: {conflictDates.length} Tanggal Sudah Ada ({conflictAction === 'skip' ? 'Diabaikan' : 'Ditimpa'})
                          </span>
                        )}
                      </div>

                      <div className="border border-emerald-100/50 rounded-2xl overflow-hidden max-h-[290px] overflow-y-auto">
                        <table id="preview-student-table" className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-emerald-50/50 text-emerald-800 uppercase font-black tracking-wider border-b border-emerald-100">
                              <th className="p-3">Nama Lengkap</th>
                              <th className="p-3">Panggilan</th>
                              <th className="p-3 text-center">Hasil Matching</th>
                              <th className="p-3 text-center">Data Terisi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-emerald-50/20">
                            {previewData.map((item, idx) => (
                              <tr key={idx} className="hover:bg-emerald-50/10">
                                <td className="p-3 font-bold text-gray-850">{item.fullName}</td>
                                <td className="p-3 text-gray-600">{item.nickname}</td>
                                <td className="p-3 text-center">
                                  {item.matchedStudent ? (
                                    <span className="inline-flex items-center gap-1 text-emerald-600 font-bold bg-emerald-50 px-2.5 py-0.5 rounded-full">
                                      <Check size={12} />
                                      {item.matchedStudent.name}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-red-500 font-bold bg-rose-50 px-2.5 py-0.5 rounded-full">
                                      <X size={12} />
                                      Tidak Ketemu
                                    </span>
                                  )}
                                </td>
                                <td className="p-3 text-center font-bold text-gray-700">
                                  {item.filledDays} / {item.totalDays} Kolom
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="flex justify-end pt-4 border-t border-gray-150">
                        <button
                          id="btn-confirm-import-to-system"
                          type="button"
                          onClick={handleImportToSystem}
                          disabled={isImporting || previewData.filter(item => item.matchedStudent).length === 0}
                          className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer border-none"
                        >
                          {isImporting ? <Clock className="animate-spin" size={16} /> : <Save size={16} />}
                          Simpan
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* RESULTS SCREEN */
                <div className="p-8 text-center space-y-6">
                  <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto border border-emerald-100 shadow-inner">
                    <CheckCircle2 size={36} />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-xl font-bold text-gray-900">Import Selesai dengan Sukses!</h4>
                    <p className="text-gray-550 text-xs max-w-md mx-auto leading-relaxed">
                      Laporan dari Smart Paste berhasil direkam ke database Firebase Firestore untuk Kelas <strong>{selectedClassName}</strong>.
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-4 gap-4 max-w-xl mx-auto pt-4">
                    <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-150 text-center">
                      <p className="text-[10px] uppercase font-black tracking-widest text-emerald-800 mb-1">Sukses Baru</p>
                      <span className="text-xl font-black text-emerald-700">{importResult.successCount} hari</span>
                    </div>
                    <div className="bg-amber-50 p-4 rounded-2xl border border-amber-150 text-center">
                      <p className="text-[10px] uppercase font-black tracking-widest text-amber-800 mb-1">Ditabrak (Overwrite)</p>
                      <span className="text-xl font-black text-amber-700">{importResult.overwrittenCount} hari</span>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-2xl border border-blue-150 text-center">
                      <p className="text-[10px] uppercase font-black tracking-widest text-blue-800 mb-1">Dilewati (Skip)</p>
                      <span className="text-xl font-black text-blue-700">{importResult.skipCount} hari</span>
                    </div>
                    <div className="bg-rose-50 p-4 rounded-2xl border border-rose-150 text-center">
                      <p className="text-[10px] uppercase font-black tracking-widest text-rose-800 mb-1">Siswa Mismatch</p>
                      <span className="text-xl font-black text-rose-700">{importResult.unmappedCount} anak</span>
                    </div>
                  </div>

                  <p className="text-[10px] text-gray-400 italic">
                    Database Firestore disinkronkan secara real-time. Anda bisa mengecek rekam jejaknya di Tab "Lihat Bulanan".
                  </p>

                  <div className="pt-6">
                    <button
                      id="btn-close-modal-result"
                      type="button"
                      onClick={() => {
                        setIsImportModalOpen(false);
                        // Refresh monthly view if we are on it
                        if (checklistMode === 'monthly') {
                          // toggling trick or state update triggers monthly re-fetch
                          setChecklistMode('daily');
                          setTimeout(() => setChecklistMode('monthly'), 50);
                        }
                      }}
                      className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-750 rounded-xl text-xs font-bold transition-all cursor-pointer border-none"
                    >
                      Tutup Ringkasan
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
}

function ChecklistButton({ option, active, onClick }: { option: string; active: boolean; onClick: () => void }) {
  const configs: Record<string, { label: string; icon: React.ReactNode; activeClasses: string; inactiveClasses: string }> = {
    HAPPY: { 
      label: 'Happy', 
      icon: <Smile size={14} />, 
      activeClasses: 'bg-yellow-400 text-white border-yellow-400 shadow-md scale-[1.03] px-3.5', 
      inactiveClasses: 'text-yellow-600 hover:bg-yellow-50/60 border-yellow-100 bg-yellow-50/10 shadow-none' 
    },
    SAD: { 
      label: 'Sad', 
      icon: <Frown size={14} />, 
      activeClasses: 'bg-blue-400 text-white border-blue-400 shadow-md scale-[1.03] px-3.5', 
      inactiveClasses: 'text-blue-600 hover:bg-blue-50/60 border-blue-100 bg-blue-50/10 shadow-none' 
    },
    OK: { 
      label: 'OK', 
      icon: <Meh size={14} />, 
      activeClasses: 'bg-emerald-400 text-white border-emerald-400 shadow-md scale-[1.03] px-3.5', 
      inactiveClasses: 'text-emerald-600 hover:bg-emerald-50/60 border-emerald-100 bg-emerald-50/10 shadow-none' 
    },
    ANGRY: { 
      label: 'Angry', 
      icon: <Angry size={14} />, 
      activeClasses: 'bg-red-500 text-white border-red-500 shadow-md scale-[1.03] px-3.5', 
      inactiveClasses: 'text-red-500 hover:bg-red-50/60 border-red-100 bg-red-50/10 shadow-none' 
    },
    NO_NEWS: { 
      label: 'No News', 
      icon: <UserX size={14} />, 
      activeClasses: 'bg-slate-500 text-white border-slate-500 shadow-md scale-[1.03] px-3.5', 
      inactiveClasses: 'text-slate-500 hover:bg-slate-50 border-slate-100 bg-slate-50/10 shadow-none' 
    },
    SICK: { 
      label: 'Sick', 
      icon: <AlertCircle size={14} />, 
      activeClasses: 'bg-indigo-500 text-white border-indigo-500 shadow-md scale-[1.03] px-3.5', 
      inactiveClasses: 'text-indigo-600 hover:bg-indigo-50 border-indigo-100 bg-indigo-50/10 shadow-none' 
    },
    EXCUSED: { 
      label: 'Excused', 
      icon: <CheckCircle2 size={14} />, 
      activeClasses: 'bg-orange-400 text-white border-orange-400 shadow-md scale-[1.03] px-3.5', 
      inactiveClasses: 'text-orange-600 hover:bg-orange-50 border-orange-100 bg-orange-50/10 shadow-none' 
    },
  };

  const current = configs[option];
  if (!current) return null;

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border shadow-sm cursor-pointer select-none",
        active ? current.activeClasses : current.inactiveClasses
      )}
    >
      {current.icon}
      <span>{current.label}</span>
    </button>
  );
}
