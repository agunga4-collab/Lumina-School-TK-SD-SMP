import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, Loader2, Save, Smile, Meh, Frown, Angry, AlertCircle, CheckCircle2,
  Calendar, Edit3, BookOpen, Clock, Heart, ShieldAlert, ArrowRight, Eye, RefreshCw, ChevronDown, ChevronUp, Check, Trash2, ClipboardList,
  ChevronLeft, ChevronRight, Mic, MicOff
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  DEFAULT_STUDENTS, 
  aggregateKGWeeklyReportForPeriod, 
  formatDateToKey, 
  getMonday,
  getStoredStudents,
  saveStoredStudents,
  resolveKindergartenCommentFormat,
  KINDY_GENERAL_COMMENTS_CUTOVER_DATE
} from '../../lib/kindergartenWeeklyReport';
import { collection, query, where, getDocs, doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { useAuth } from '../../context/AuthContext';
import { useTeacherAssignedClasses } from '../../hooks/useTeacherAssignedClasses';
import { logFirestoreRead, getKindergartenClasses, getKindergartenStudents } from '../../lib/kindergartenMetadataCache';
import { useOutletContext } from 'react-router-dom';

// Define draft key generator
export function getSummaryKey(studentId: string, startDate: string, endDate: string): string {
  return `kg_weekly_summary_${studentId}_${startDate}_${endDate}`;
}

export default function WeeklySummary() {
  const navigate = useNavigate();

  const renderObservationDataSummary = (obsItems: any[]) => {
    if (!obsItems || obsItems.length === 0) {
      return <div className="text-[10px] text-gray-400 italic font-sans">Belum ada data observasi pada periode ini.</div>;
    }

    // Group items by domain
    const domainGroups: Record<string, any[]> = {};
    obsItems.forEach(item => {
      const dom = item.domain || 'Lainnya';
      if (!domainGroups[dom]) {
        domainGroups[dom] = [];
      }
      domainGroups[dom].push(item);
    });

    const domains = Object.keys(domainGroups);

    const shortGrade = (g: string) => {
      const clean = (g || '').trim().toUpperCase();
      if (clean === 'BB') return 'BB';
      if (clean === 'MB') return 'MB';
      if (clean === 'BSH') return 'BSH';
      if (clean === 'BSB') return 'BSB';
      if (clean === 'ABSENT') return 'ABSENT';
      if (clean === 'NOT_PARTICIPATING') return 'NOT_PARTICIPATING';
      return g;
    };

    const longGrade = (g: string) => {
      const clean = (g || '').trim().toUpperCase();
      if (clean === 'BB') return 'Belum Berkembang (BB)';
      if (clean === 'MB') return 'Mulai Berkembang (MB)';
      if (clean === 'BSH') return 'Berkembang Sesuai Harapan (BSH)';
      if (clean === 'BSB') return 'Berkembang Sangat Baik (BSB)';
      if (clean === 'ABSENT') return 'Tidak Masuk (ABSENT)';
      if (clean === 'NOT_PARTICIPATING') return 'Tidak Mengikuti Kegiatan (NOT_PARTICIPATING)';
      return g;
    };

    if (domains.length === 1) {
      const dom = domains[0];
      const items = domainGroups[dom];
      const totalCount = items.length;

      const activities = Array.from(new Set(items.map(i => i.activity).filter(Boolean)));
      const activityStr = activities.length > 0 ? ` melalui sesi ${activities.join(', ')}` : '';

      const gradeCounts: Record<string, number> = {};
      items.forEach(item => {
        const g = item.grade;
        if (g) {
          gradeCounts[g] = (gradeCounts[g] || 0) + 1;
        }
      });

      return (
        <div className="space-y-1.5 text-xs text-gray-800 leading-relaxed font-sans">
          <div className="font-extrabold text-gray-800">
            {totalCount} observasi pada domain <span className="text-emerald-700">{dom}</span>{activityStr}:
          </div>
          <ul className="list-disc pl-4 space-y-0.5">
            {Object.entries(gradeCounts).map(([g, count]) => (
              <li key={g} className="font-medium text-gray-600">
                <span className="font-bold text-gray-800">{count} kali</span> {longGrade(g)}
              </li>
            ))}
            {Object.entries(gradeCounts).length === 0 && (
              <li className="text-gray-400 italic">Belum ada grading yang tersimpan.</li>
            )}
          </ul>
        </div>
      );
    }

    const totalCount = obsItems.length;
    return (
      <div className="space-y-1.5 text-xs text-gray-800 leading-relaxed font-sans">
        <div className="font-extrabold text-gray-800">
          Total {totalCount} observasi:
        </div>
        <ul className="list-disc pl-4 space-y-1">
          {domains.map(dom => {
            const items = domainGroups[dom];
            const activities = Array.from(new Set(items.map(i => i.activity).filter(Boolean)));
            const activityStr = activities.length > 0 ? ` (via ${activities.join(', ')})` : '';

            const gradeCounts: Record<string, number> = {};
            items.forEach(item => {
              const g = item.grade;
              if (g) {
                gradeCounts[g] = (gradeCounts[g] || 0) + 1;
              }
            });

            const gradeListStr = Object.entries(gradeCounts)
              .map(([g, count]) => `${shortGrade(g)} (${count}x)`)
              .join(', ');

            return (
              <li key={dom} className="font-semibold text-gray-800">
                <span className="text-emerald-700 font-bold">{dom}</span>{activityStr}:{' '}
                <span className="font-normal text-gray-600">{gradeListStr || 'Tanpa grading'}</span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };
  const [searchParams] = useSearchParams();
  const paramClassId = searchParams.get('classId');
  const paramDate = searchParams.get('date');

  const { activeYear } = useAcademicYear();
  const { currentUser } = useOutletContext<{ currentUser: any }>() || {};
  const { profile } = useAuth();

  if (profile?.role === 'kindergarten_subject_teacher') {
    return (
      <div className="p-8 text-center">
        <h1 className="text-xl font-bold text-red-600">Akses Ditolak</h1>
        <p className="text-gray-500 mt-2">Anda tidak memiliki izin untuk membuka halaman ini.</p>
      </div>
    );
  }

  // Class Selection states using centralized hook
  const {
    assignedClasses: classes,
    assignedClassIds,
    primaryClassId,
    isRestrictedToAssignedClasses,
    loading: isLoadingClasses,
    setLastSelectedClassId
  } = useTeacherAssignedClasses({
    userId: profile?.uid,
    academicYearId: activeYear || '2026/2027'
  });

  const [selectedClassId, setSelectedClassId] = React.useState<string>('');
  const [students, setStudents] = React.useState<any[]>(() => DEFAULT_STUDENTS);

  // Copy-Paste Import states
  const [isImportOpen, setIsImportOpen] = React.useState(false);
  const [importType, setImportType] = React.useState<'SEL' | 'OBS'>('SEL');
  const [pastedText, setPastedText] = React.useState('');
  const [overrideMatches, setOverrideMatches] = React.useState<Record<number, { id: string; name: string }>>({});

  const normalizeString = (str: string): string => {
    return (str || '')
      .toLowerCase()
      .replace(/[.\-_,]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const activeClassObj = React.useMemo(() => {
    return classes.find(c => c.id === selectedClassId);
  }, [classes, selectedClassId]);

  // Helper mapping helper logic from Observation.tsx
  const isStudentInClass = React.useCallback((studClassId: string, activeClass: { id: string; name: string }) => {
    const sClass = (studClassId || '').trim().toLowerCase();
    const actId = (activeClass.id || '').trim().toLowerCase();
    const actName = (activeClass.name || '').trim().toLowerCase();
    
    if (!sClass) return false;
    if (sClass === actId || sClass === actName) return true;
    
    const norm = (str: string) => str.replace(/[\s\-_]+/g, '').toLowerCase();
    const normS = norm(sClass);
    const normId = norm(actId);
    const normName = norm(actName);
    
    if (normS === normName || normS === normId) return true;
    
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

    const specificClassWords = [
      'koala', 'panda', 'caterpillar', 'butterfly',
      'cenderawasih', 'elang', 'kakatua', 'badak', 'komodo', 'tapir'
    ];
    const hasSpecS = specificClassWords.some(w => normS.includes(w));
    const hasSpecAct = specificClassWords.some(w => normId.includes(w) || normName.includes(w));
    
    if (hasSpecAct && !hasSpecS) {
      return false;
    }
    
    if (normId.includes(normS) || normS.includes(normId)) return true;
    
    return false;
  }, []);

  // Helper to resolve classId from students within the observations map of an unscoped document
  const getLegacyDocClassId = React.useCallback((observationsField: Record<string, any>, globalStudents: any[]): string | null => {
    if (!observationsField) return null;
    const observationKeys = Object.keys(observationsField);
    for (const key of observationKeys) {
      const foundStudent = globalStudents.find(s => s.id === key || s.oldLuminaId === key || s.nis === key);
      if (foundStudent && foundStudent.classId) {
        return foundStudent.classId;
      }
    }
    return null;
  }, []);

  // Check if a document matches the selected class (including legacy documents)
  const isDocForClass = React.useCallback((
    d: any,
    targetClassId: string,
    activeClass: any,
    globalStudents: any[]
  ): boolean => {
    if (!targetClassId) return false;

    // Strict match if classId exists on document
    if (d.classId && d.classId !== 'unassigned') {
      return d.classId === targetClassId;
    }

    // Specific override for "Pra TK Test Kelas" on 11 August
    const docDate = d.date || d.observationDate;
    const isAug11 = docDate === '2026-08-11' || docDate === '2025-08-11' || docDate?.includes('08-11');
    const isPraTKTest = d.generalPhotoUrl?.includes('Pra%20TK') || d.generalPhoto?.includes('Pra%20TK') || d.title?.includes('Pra TK') || d.caption?.includes('Pra TK');

    if (isAug11 && isPraTKTest) {
      const className = (activeClass?.name || '').toLowerCase();
      return className.includes('pra tk') || className.includes('pratk');
    }

    // Fallback: check if students inside observations match the selected class
    if (d.observations && Object.keys(d.observations).length > 0) {
      const resolvedClassId = getLegacyDocClassId(d.observations, globalStudents);
      if (resolvedClassId) {
        return resolvedClassId === targetClassId;
      }
    }

    return false;
  }, [getLegacyDocClassId]);

  const filteredStudents = React.useMemo(() => {
    if (!selectedClassId || !activeClassObj) {
      return students;
    }
    return students.filter(student => isStudentInClass(student.classId, activeClassObj));
  }, [students, selectedClassId, activeClassObj, isStudentInClass]);

  const parsedImportRows = React.useMemo(() => {
    if (!pastedText.trim()) return [];
    
    // Calculate activeStudents ONCE outside the row-by-row loop to prevent catastrophic performance degradation
    const activeStudentsList = activeClassObj 
      ? students.filter(student => isStudentInClass(student.classId, activeClassObj))
      : students;

    const lines = pastedText.split('\n');
    return lines.map((line, index) => {
      const rawLine = line;

      // 0. Check manual override first
      const overrideSelected = overrideMatches[index];
      if (overrideSelected && line.trim()) {
        let parts = line.split('|');
        if (parts.length < 2 && line.includes('\t')) {
          parts = line.split('\t');
        }
        const pastedName = parts[0]?.trim() || '';
        const pastedComment = parts.slice(1).join('|').trim();
        return {
          index,
          rawLine,
          pastedName,
          pastedComment,
          status: 'success' as const,
          matchedStudentId: overrideSelected.id,
          matchedStudentName: overrideSelected.name
        };
      }

      if (!line.trim()) {
        return {
          index,
          rawLine,
          pastedName: '',
          pastedComment: '',
          status: 'invalid_format' as const
        };
      }

      // Split by pipe '|', or tab '\t'
      let parts = line.split('|');
      if (parts.length < 2 && line.includes('\t')) {
        parts = line.split('\t');
      }
      
      if (parts.length < 2) {
        return {
          index,
          rawLine,
          pastedName: line.trim(),
          pastedComment: '',
          status: 'invalid_format' as const
        };
      }

      const pastedName = parts[0].trim();
      const pastedComment = parts.slice(1).join('|').trim();

      if (!pastedName) {
        return {
          index,
          rawLine,
          pastedName: '',
          pastedComment,
          status: 'invalid_format' as const
        };
      }

      if (!pastedComment) {
        return {
          index,
          rawLine,
          pastedName,
          pastedComment: '',
          status: 'empty_comment' as const
        };
      }

      // Match student using pre-calculated active class students
      const normalizedQuery = normalizeString(pastedName);
      
      // 1. Exact match on normalized full name in active class students
      const perfectMatches = activeStudentsList.filter(s => normalizeString(s.name) === normalizedQuery);
      
      if (perfectMatches.length === 1) {
        return {
          index,
          rawLine,
          pastedName,
          pastedComment,
          status: 'success' as const,
          matchedStudentId: perfectMatches[0].id,
          matchedStudentName: perfectMatches[0].name
        };
      }

      // 2. Exact match on normalized nickName or partial overlap check in active class students
      const partialMatches = activeStudentsList.filter(s => {
        const sNormName = normalizeString(s.name);
        const sNormNick = normalizeString(s.nickName || '');
        return sNormName.includes(normalizedQuery) || normalizedQuery.includes(sNormName) || sNormNick === normalizedQuery;
      });

      if (partialMatches.length === 1) {
        return {
          index,
          rawLine,
          pastedName,
          pastedComment,
          status: 'success' as const,
          matchedStudentId: partialMatches[0].id,
          matchedStudentName: partialMatches[0].name
        };
      } else if (partialMatches.length > 1) {
        return {
          index,
          rawLine,
          pastedName,
          pastedComment,
          status: 'multiple_matches' as const,
          possibleMatches: partialMatches
        };
      }

      // 3. Fallback check: exists in active year's students database, but not in current class
      const allStudentsMatches = students.filter(s => {
        const sNormName = normalizeString(s.name);
        const sNormNick = normalizeString(s.nickName || '');
        return sNormName.includes(normalizedQuery) || normalizedQuery.includes(sNormName) || sNormNick === normalizedQuery;
      });

      if (allStudentsMatches.length > 0) {
        return {
          index,
          rawLine,
          pastedName,
          pastedComment,
          status: 'not_in_active_class' as const,
          matchedOutsideClass: allStudentsMatches[0]
        };
      }

      // Completely not found
      return {
        index,
        rawLine,
        pastedName,
        pastedComment,
        status: 'not_found' as const
      };
    });
  }, [pastedText, students, overrideMatches, activeClassObj, isStudentInClass]);

  // Set default selection and handle URL/storage redirection rules
  React.useEffect(() => {
    if (!isLoadingClasses && classes.length > 0) {
      const validParamClassId = paramClassId && assignedClassIds.includes(paramClassId) ? paramClassId : null;
      const defaultClassId = validParamClassId || primaryClassId;
      if (defaultClassId) {
        setSelectedClassId(defaultClassId);
      }
    }
  }, [classes, assignedClassIds, primaryClassId, paramClassId, isLoadingClasses]);

  // Real-time access check
  React.useEffect(() => {
    if (!isLoadingClasses && isRestrictedToAssignedClasses && selectedClassId) {
      if (assignedClassIds.length > 0 && !assignedClassIds.includes(selectedClassId)) {
        toast.error('Anda tidak memiliki hak akses untuk kelas ini. Mengembalikan ke kelas penugasan Anda.');
        setSelectedClassId(primaryClassId || '');
      }
    }
  }, [selectedClassId, isRestrictedToAssignedClasses, assignedClassIds, primaryClassId, isLoadingClasses]);

  // Load students from cache-enhanced Firestore service
  React.useEffect(() => {
    async function loadKindergartenStudentsData() {
      try {
        if (process.env.NODE_ENV !== 'production') {
          console.log('Loading Kindergarten students from Firestore Cache for year:', activeYear);
        }
        
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
        console.error('Error loading Kindergarten students from Firestore Cache:', err);
      }
    }

    loadKindergartenStudentsData();
  }, [activeYear]);

  // 1. Period states - Default to current week Monday to Friday
  const [startDateStr, setStartDateStr] = React.useState<string>(() => {
    if (paramDate) {
      const parsed = new Date(paramDate);
      if (!isNaN(parsed.getTime())) {
        const mon = getMonday(parsed);
        return formatDateToKey(mon);
      }
    }
    const mon = getMonday(new Date());
    return formatDateToKey(mon);
  });
  const [endDateStr, setEndDateStr] = React.useState<string>(() => {
    if (paramDate) {
      const parsed = new Date(paramDate);
      if (!isNaN(parsed.getTime())) {
        const mon = getMonday(parsed);
        const fri = new Date(mon);
        fri.setDate(mon.getDate() + 4);
        return formatDateToKey(fri);
      }
    }
    const mon = getMonday(new Date());
    const fri = new Date(mon);
    fri.setDate(mon.getDate() + 4);
    return formatDateToKey(fri);
  });

  const handleStartDateChange = (valStr: string) => {
    if (!valStr) return;
    const [yr, mo, dy] = valStr.split('-').map(Number);
    const chosenDate = new Date(yr, mo - 1, dy);
    const mon = getMonday(chosenDate);
    const fri = new Date(mon);
    fri.setDate(mon.getDate() + 4);
    setStartDateStr(formatDateToKey(mon));
    setEndDateStr(formatDateToKey(fri));
  };

  const handleEndDateChange = (valStr: string) => {
    if (!valStr) return;
    const [yr, mo, dy] = valStr.split('-').map(Number);
    const chosenDate = new Date(yr, mo - 1, dy);
    const mon = getMonday(chosenDate);
    const fri = new Date(mon);
    fri.setDate(mon.getDate() + 4);
    setStartDateStr(formatDateToKey(mon));
    setEndDateStr(formatDateToKey(fri));
  };

  const handlePrevWeek = () => {
    if (!startDateStr) return;
    const [yr, mo, dy] = startDateStr.split('-').map(Number);
    const currentDate = new Date(yr, mo - 1, dy);
    currentDate.setDate(currentDate.getDate() - 7);
    
    const mon = getMonday(currentDate);
    const fri = new Date(mon);
    fri.setDate(mon.getDate() + 4);
    
    setStartDateStr(formatDateToKey(mon));
    setEndDateStr(formatDateToKey(fri));
  };

  const handleNextWeek = () => {
    if (!startDateStr) return;
    const [yr, mo, dy] = startDateStr.split('-').map(Number);
    const currentDate = new Date(yr, mo - 1, dy);
    currentDate.setDate(currentDate.getDate() + 7);
    
    const mon = getMonday(currentDate);
    const fri = new Date(mon);
    fri.setDate(mon.getDate() + 4);
    
    setStartDateStr(formatDateToKey(mon));
    setEndDateStr(formatDateToKey(fri));
  };

  const [isSavingTheme, setIsSavingTheme] = React.useState(false);

  const handleSaveWeeklyTheme = async () => {
    if (!selectedClassId) {
      toast.error('Silakan pilih kelas terlebih dahulu.');
      return;
    }
    setIsSavingTheme(true);
    const themeDocId = `theme_${selectedClassId}_${startDateStr}_${endDateStr}`;
    const storageKey = `kg_weekly_theme_${selectedClassId}_${startDateStr}_${endDateStr}`;
    const weekStorageKey = `kg_weekly_week_${selectedClassId}_${startDateStr}_${endDateStr}`;
    
    try {
      localStorage.setItem(storageKey, globalTheme);
      localStorage.setItem(weekStorageKey, globalWeek);

      const docRef = doc(db, 'weekly_summary_drafts', themeDocId);
      await setDoc(docRef, {
        themeId: themeDocId,
        classId: selectedClassId,
        startDate: startDateStr,
        endDate: endDateStr,
        theme: globalTheme,
        week: globalWeek,
        type: 'weekly_theme',
        updatedAt: new Date().toISOString()
      }, { merge: true });

      setStudentDrafts(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(studentId => {
          updated[studentId] = {
            ...updated[studentId],
            theme: globalTheme,
            week: globalWeek
          };
          const studentKey = getSummaryKey(studentId, startDateStr, endDateStr);
          const localDraftStr = localStorage.getItem(studentKey);
          if (localDraftStr) {
            try {
              const localDraft = JSON.parse(localDraftStr);
              localDraft.theme = globalTheme;
              localDraft.week = globalWeek;
              localStorage.setItem(studentKey, JSON.stringify(localDraft));
            } catch (e) {
              // ignore
            }
          }
        });
        return updated;
      });

      toast.success('Tema & Pekan pembelajaran berhasil disimpan.');
    } catch (err) {
      console.error('Error saving weekly theme & week:', err);
      toast.error('Gagal menyimpan tema & pekan pembelajaran.');
    } finally {
      setIsSavingTheme(false);
    }
  };

  // Theme of the current period
  const [globalTheme, setGlobalTheme] = React.useState<string>('');
  // Week of the current period (manual week input)
  const [globalWeek, setGlobalWeek] = React.useState<string>('');

  // Trigger recalculation trigger (For manual syncs or wholesale loads)
  const [reloadCounter, setReloadCounter] = React.useState<number>(0);

  // States to keep track of loaded student drafts
  const [studentDrafts, setStudentDrafts] = React.useState<Record<string, any>>({});
  const [dbDrafts, setDbDrafts] = React.useState<Record<string, any>>({});
  const [savingStatus, setSavingStatus] = React.useState<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({});

  // States to hold Firestore Attendance and Observations for the active date range
  const [firestoreAttendance, setFirestoreAttendance] = React.useState<any[]>([]);
  const [firestoreObservations, setFirestoreObservations] = React.useState<any[]>([]);
  const [firestoreDailyContexts, setFirestoreDailyContexts] = React.useState<any[]>([]);
  const [isFetchingFirestore, setIsFetchingFirestore] = React.useState(false);

  // Automatically fetch attendance and observations from Firestore when selection changes
  React.useEffect(() => {
    if (!selectedClassId) return;

    let active = true;
    async function loadData() {
      try {
        setIsFetchingFirestore(true);
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[WeeklySummary Firestore Sync] Fetching for class ${selectedClassId} from ${startDateStr} to ${endDateStr}`);
        }

        // 1. Fetch attendance reports
        let fetchedAtt: any[] = [];
        try {
          const qAtt = query(
            collection(db, 'attendance'),
            where('classId', '==', selectedClassId),
            where('date', '>=', startDateStr),
            where('date', '<=', endDateStr)
          );
          const snapAtt = await getDocs(qAtt);
          logFirestoreRead('attendanceReports', snapAtt.docs.length || 1);
          fetchedAtt = snapAtt.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
        } catch (err: any) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn("[WeeklySummary] Attendance query list permission denied or failed, trying getDoc fallback.", err);
          }
          const datesList: string[] = [];
          try {
            let start = new Date(startDateStr + 'T00:00:00');
            const end = new Date(endDateStr + 'T00:00:00');
            while (start <= end) {
              const yyyy = start.getFullYear();
              const mm = String(start.getMonth() + 1).padStart(2, '0');
              const dd = String(start.getDate()).padStart(2, '0');
              datesList.push(`${yyyy}-${mm}-${dd}`);
              start.setDate(start.getDate() + 1);
            }
          } catch (e) {
            console.error("[WeeklySummary] Error calculating dates in range:", e);
          }

          if (datesList.length > 0) {
            const attDocs = await Promise.all(
              datesList.map(async (dStr) => {
                try {
                  const docId = `${selectedClassId}_${dStr}`;
                  const docSnap = await getDoc(doc(db, 'attendance', docId));
                  if (docSnap.exists()) {
                    return { id: docSnap.id, ...docSnap.data() };
                  }
                } catch (e) {
                  // ignore individual read failures
                }
                return null;
              })
            );
            fetchedAtt = attDocs.filter(Boolean) as any[];
          }
        }

        // 2. Fetch Observations
        let fetchedObs: any[] = [];
        try {
          const qObs = query(
            collection(db, 'observations'),
            where('date', '>=', startDateStr),
            where('date', '<=', endDateStr)
          );
          const snapObs = await getDocs(qObs);
          logFirestoreRead('observations', snapObs.docs.length || 1);
          const rawObsList = snapObs.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          fetchedObs = rawObsList.filter(item => isDocForClass(item, selectedClassId, activeClassObj, students));
        } catch (err: any) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn("[WeeklySummary] Observations list query fell back to empty due to potential rules limits/permissions:", err);
          }
        }

        // 3. Fetch weekly summary drafts from Firestore
        const fetchedDraftsMap: Record<string, any> = {};
        let snapDraftsLen = 0;
        try {
          const qDrafts = query(
            collection(db, 'weekly_summary_drafts'),
            where('startDate', '==', startDateStr),
            where('endDate', '==', endDateStr)
          );
          const snapDrafts = await getDocs(qDrafts);
          logFirestoreRead('attendanceReports', snapDrafts.docs.length || 1);
          snapDraftsLen = snapDrafts.docs.length;
          snapDrafts.docs.forEach(docSnap => {
            const data = docSnap.data();
            fetchedDraftsMap[data.studentId] = {
              id: docSnap.id,
              ...data,
              generalComments: data.generalComments || '',
              commentFormat: data.commentFormat || 'LEGACY_TWO_COMMENTS',
              templateVersion: data.templateVersion || 'KINDY_WEEKLY_V1_LEGACY',
              // Map the custom backend fields to standard frontend state fields
              attendanceCommentTeacherEdited: data.socialEmotional || data.attendanceCommentTeacherEdited || '',
              observationCommentTeacherEdited: data.weeklyComments || data.observationCommentTeacherEdited || ''
            };
          });
        } catch (err: any) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn("[WeeklySummary] Drafts fetch fell back to empty/local due to permission limits:", err);
          }
        }

        // 4. Fetch the weekly theme for this class and date range
        let loadedTheme = '';
        let loadedWeek = '';
        if (selectedClassId) {
          const themeDocId = `theme_${selectedClassId}_${startDateStr}_${endDateStr}`;
          try {
            const themeSnap = await getDoc(doc(db, 'weekly_summary_drafts', themeDocId));
            if (themeSnap.exists()) {
              const themeData = themeSnap.data();
              loadedTheme = themeData.theme || '';
              loadedWeek = themeData.week || '';
            }
          } catch (err) {
            if (process.env.NODE_ENV !== 'production') {
              console.warn('[WeeklySummary] Error fetching weekly theme:', err);
            }
          }

          // Also check localStorage as a fallback
          if (!loadedTheme) {
            const localTheme = localStorage.getItem(`kg_weekly_theme_${selectedClassId}_${startDateStr}_${endDateStr}`);
            if (localTheme) {
              loadedTheme = localTheme;
            }
          }
          if (!loadedWeek) {
            const localWeek = localStorage.getItem(`kg_weekly_week_${selectedClassId}_${startDateStr}_${endDateStr}`);
            if (localWeek) {
              loadedWeek = localWeek;
            }
          }
        }

        // 5. Fetch Daily Contexts
        let fetchedContexts: any[] = [];
        try {
          const qContexts = query(
            collection(db, 'kindergarten_observation_daily_contexts'),
            where('classId', '==', selectedClassId),
            where('observationDate', '>=', startDateStr),
            where('observationDate', '<=', endDateStr)
          );
          const snapContexts = await getDocs(qContexts);
          logFirestoreRead('dailyContexts', snapContexts.docs.length || 1);
          fetchedContexts = snapContexts.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
        } catch (err: any) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn("[WeeklySummary] Daily contexts query fell back or failed:", err);
          }
          try {
            const datesList: string[] = [];
            let start = new Date(startDateStr + 'T00:00:00');
            const end = new Date(endDateStr + 'T00:00:00');
            while (start <= end) {
              const yyyy = start.getFullYear();
              const mm = String(start.getMonth() + 1).padStart(2, '0');
              const dd = String(start.getDate()).padStart(2, '0');
              datesList.push(`${yyyy}-${mm}-${dd}`);
              start.setDate(start.getDate() + 1);
            }
            const contextDocs = await Promise.all(
              datesList.map(async (dStr) => {
                try {
                  const docId = `${selectedClassId}_${dStr}`;
                  const docSnap = await getDoc(doc(db, 'kindergarten_observation_daily_contexts', docId));
                  if (docSnap.exists()) {
                    return { id: docSnap.id, ...docSnap.data() };
                  }
                } catch (e) {
                  // ignore
                }
                return null;
              })
            );
            fetchedContexts = contextDocs.filter(Boolean) as any[];
          } catch (fallbackErr) {
            console.error("[WeeklySummary] Fallback daily context loading failed:", fallbackErr);
          }
        }

        if (active) {
          setFirestoreAttendance(fetchedAtt);
          setFirestoreObservations(fetchedObs);
          setFirestoreDailyContexts(fetchedContexts);
          setDbDrafts(fetchedDraftsMap);
          setGlobalTheme(loadedTheme);
          setGlobalWeek(loadedWeek);
          if (process.env.NODE_ENV !== 'production') {
            console.log(`[WeeklySummary Firestore Sync] Set ${fetchedAtt.length} attendance, ${fetchedObs.length} observations, ${fetchedContexts.length} daily contexts, ${snapDraftsLen} drafts, theme "${loadedTheme}", and week "${loadedWeek}"`);
          }
        }
      } catch (err) {
        console.error('Error fetching range data from Firestore:', err);
      } finally {
        if (active) {
          setIsFetchingFirestore(false);
        }
      }
    }

    loadData();

    return () => {
      active = false;
    };
  }, [selectedClassId, startDateStr, endDateStr, reloadCounter]);

  // Collapsed states for student edit compartments
  const [expandedStudentId, setExpandedStudentId] = React.useState<string | null>(null);

  // Specific loading states for per-student actions
  const [generatingSelId, setGeneratingSelId] = React.useState<string | null>(null);
  const [generatingWeeklyId, setGeneratingWeeklyId] = React.useState<string | null>(null);
  const [generatingGeneralId, setGeneratingGeneralId] = React.useState<string | null>(null);

  // Speech-to-text and AI Refinement states
  interface RefineState {
    studentId: string;
    studentName: string;
    fieldType: 'social_emotional' | 'weekly_domains' | 'general_comments';
    originalText: string;
    refinedText: string;
  }

  const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  const [activeRecording, setActiveRecording] = React.useState<{ studentId: string; fieldType: 'social_emotional' | 'weekly_domains' | 'general_comments' } | null>(null);
  const [refineReview, setRefineReview] = React.useState<RefineState | null>(null);
  const [refiningField, setRefiningField] = React.useState<{ studentId: string; fieldType: 'social_emotional' | 'weekly_domains' | 'general_comments' } | null>(null);

  const recognitionRef = React.useRef<any>(null);
  const recordingStateRef = React.useRef<{
    studentId: string;
    fieldType: 'social_emotional' | 'weekly_domains' | 'general_comments';
    baseText: string;
    finalTranscript: string;
    interimTranscript: string;
  } | null>(null);

  const localNormalize = (text: string): string => {
    let cleaned = text.replace(/\s+/g, " ").trim();
    if (cleaned.length === 0) return "";
    // Capitalize first letter
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    // Add ending dot if it doesn't end with a punctuation mark
    if (!/[.!?]$/.test(cleaned)) {
      cleaned += ".";
    }
    return cleaned;
  };

  const finishRecording = () => {
    if (!recordingStateRef.current) return;
    const { studentId, fieldType, baseText, finalTranscript } = recordingStateRef.current;
    
    // Normalize final transcript
    const combinedFinal = `${baseText} ${finalTranscript}`.replace(/\s+/g, ' ').trim();
    const normalized = localNormalize(combinedFinal);

    if (fieldType === 'social_emotional') {
      handleLocalDraftChange(studentId, { attendanceCommentTeacherEdited: normalized });
    } else {
      handleLocalDraftChange(studentId, { observationCommentTeacherEdited: normalized });
    }

    recordingStateRef.current = null;
    setActiveRecording(null);
    recognitionRef.current = null;
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch (e) {
        console.warn(e);
      }
    }
    finishRecording();
  };

  const startRecording = (studentId: string, fieldType: 'social_emotional' | 'weekly_domains' | 'general_comments', currentVal: string) => {
    if (recognitionRef.current) {
      stopRecording();
    }

    if (!SpeechRecognitionAPI) {
      toast.error("Transkripsi suara tidak didukung oleh browser Anda.");
      return;
    }

    try {
      const recognition = new SpeechRecognitionAPI();
      recognition.lang = 'id-ID';
      recognition.continuous = true;
      recognition.interimResults = true;

      recordingStateRef.current = {
        studentId,
        fieldType,
        baseText: currentVal,
        finalTranscript: '',
        interimTranscript: ''
      };

      recognition.onstart = () => {
        setActiveRecording({ studentId, fieldType });
      };

      recognition.onresult = (event: any) => {
        if (!recordingStateRef.current) return;
        
        let interim = '';
        let final = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }

        const state = recordingStateRef.current;
        state.finalTranscript += final;
        state.interimTranscript = interim;

        // Combine
        const combined = `${state.baseText} ${state.finalTranscript} ${state.interimTranscript}`
          .replace(/\s+/g, ' ')
          .trim();

        // Update local state in real-time
        if (state.fieldType === 'social_emotional') {
          handleLocalDraftChange(state.studentId, { attendanceCommentTeacherEdited: combined });
        } else if (state.fieldType === 'general_comments') {
          handleLocalDraftChange(state.studentId, { generalComments: combined });
        } else {
          handleLocalDraftChange(state.studentId, { observationCommentTeacherEdited: combined });
        }
      };

      recognition.onend = () => {
        finishRecording();
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        if (event.error === 'not-allowed') {
          toast.error("Izin microphone belum diberikan.");
        } else {
          toast.error(`Error transkripsi: ${event.error}`);
        }
        stopRecording();
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      console.error(err);
      toast.error("Gagal memulai microphone: " + err.message);
    }
  };

  const handleRefineComment = async (studentId: string, studentName: string, fieldType: 'social_emotional' | 'weekly_domains' | 'general_comments', currentText: string) => {
    if (!currentText || currentText.trim() === "") {
      toast.error("Teks komentar kosong.");
      return;
    }

    setRefiningField({ studentId, fieldType });
    const toastId = toast.loading("Lumina AI sedang merapikan komentar...");
    try {
      const studentDraft = studentDrafts[studentId];
      const classLevel = studentDraft?.ageGroup || 'TK_A';
      const theme = studentDraft?.theme || globalTheme || '';
      const week = studentDraft?.week || globalWeek || '';

      const response = await fetch('/api/kindergarten/weekly-summary/refine-comment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: currentText,
          fieldType,
          studentName,
          classLevel,
          theme,
          week
        })
      });

      if (!response.ok) {
        let errMsg = 'Gagal memanggil API AI';
        try {
          const errData = await response.json();
          errMsg = errData.error || errMsg;
        } catch (_) {}
        throw new Error(errMsg);
      }

      const data = await response.json();
      const refinedText = data.refinedText || '';

      toast.success("Komentar berhasil dirapikan! ✨", { id: toastId });
      setRefineReview({
        studentId,
        studentName,
        fieldType,
        originalText: currentText,
        refinedText
      });
    } catch (err: any) {
      console.error(err);
      toast.error("Gagal merapikan komentar. Teks asli Anda tetap aman dan dapat didraf secara manual.", { id: toastId });
    } finally {
      setRefiningField(null);
    }
  };

  React.useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onend = null;
          recognitionRef.current.stop();
        } catch (_) {}
      }
    };
  }, []);

  // Cache/Memoize the expensive aggregateKGWeeklyReportForPeriod function per student
  // to prevent running aggregate computations for ALL (or even active) students in each sub-character typed
  const aggregatedReportCache = React.useMemo(() => {
    const cache: Record<string, any> = {};
    filteredStudents.forEach(s => {
      cache[s.id] = aggregateKGWeeklyReportForPeriod(
        s.id, 
        startDateStr, 
        endDateStr, 
        firestoreAttendance, 
        firestoreObservations, 
        students,
        firestoreDailyContexts,
        classes
      );
    });
    return cache;
  }, [filteredStudents, startDateStr, endDateStr, firestoreAttendance, firestoreObservations, students, firestoreDailyContexts, classes]);

  // Load drafts merging the aggregated data, local storage and firefighting states
  const loadAllStudentDrafts = React.useCallback(() => {
    const drafts: Record<string, any> = {};
    
    // Only process filtered students (instead of iterating all students in database!)
    filteredStudents.forEach(s => {
      // 1. Fetch raw weekly aggregation from the memoized cache (ultra efficient)
      const liveData = aggregatedReportCache[s.id] || {
        studentId: s.id,
        studentName: s.name,
        nickName: s.nickName || s.name.split(' ')[0],
        ageGroup: s.ageGroup || 'TK_A',
        attendanceSummary: { happy: 0, sad: 0, angry: 0, ok: 0, sick: 0, izin: 0, noNews: 0 },
        weeklyObservationItems: [],
        groupedObservationSummary: [],
        dailySnapshots: []
      };

      // 2. Load custom edits saved locally 
      const storageKey = getSummaryKey(s.id, startDateStr, endDateStr);
      const saved = localStorage.getItem(storageKey);
      
      let savedParsed: any = {};
      if (saved) {
        try {
          savedParsed = JSON.parse(saved);
        } catch (e) {
          if (process.env.NODE_ENV !== 'production') {
            console.error(`Error parsing draft for ${s.name}:`, e);
          }
        }
      }

      // Merge with Firestore draft (primary database state) if it exists
      const dbDraft = dbDrafts[s.id];
      if (dbDraft) {
        savedParsed = {
          ...savedParsed,
          ...dbDraft,
          generalComments: dbDraft.generalComments || savedParsed.generalComments || '',
          attendanceCommentTeacherEdited: dbDraft.socialEmotional || dbDraft.attendanceCommentTeacherEdited || savedParsed.attendanceCommentTeacherEdited || '',
          observationCommentTeacherEdited: dbDraft.weeklyComments || dbDraft.observationCommentTeacherEdited || savedParsed.observationCommentTeacherEdited || '',
          theme: dbDraft.theme || savedParsed.theme || '',
          week: dbDraft.week || savedParsed.week || '',
        };
      }

      const hasDbDraft = dbDraft && Object.keys(dbDraft).length > 0;
      const hasSavedParsed = savedParsed && Object.keys(savedParsed).length > 0;

      const format = resolveKindergartenCommentFormat({
        report: hasDbDraft ? dbDraft : (hasSavedParsed ? savedParsed : undefined),
        isNewUnsavedDraft: !hasDbDraft && !hasSavedParsed,
        periodStartDate: startDateStr
      });

      // Prefill rules if genuinely new eligible draft and legacy values are present
      if (format === 'GENERAL_COMMENT' && !dbDraft?.generalComments && !savedParsed?.generalComments) {
        const weeklyCommentsPrefill = dbDraft?.weeklyComments || savedParsed?.observationCommentTeacherEdited || '';
        const socialEmotionalPrefill = dbDraft?.socialEmotional || savedParsed?.attendanceCommentTeacherEdited || '';
        if (weeklyCommentsPrefill && socialEmotionalPrefill) {
          savedParsed.generalComments = `${weeklyCommentsPrefill}\n\n${socialEmotionalPrefill}`.trim();
        }
      }

      // Final draft state
      drafts[s.id] = {
        ...liveData,
        ...savedParsed,
        commentFormat: format,
        templateVersion: format === 'GENERAL_COMMENT' ? 'KINDY_WEEKLY_V2_GENERAL_COMMENT' : 'KINDY_WEEKLY_V1_LEGACY',
        generalComments: savedParsed.generalComments || '',
        attendanceSummary: liveData.attendanceSummary,
        weeklyObservationItems: liveData.weeklyObservationItems,
        groupedObservationSummary: liveData.groupedObservationSummary,
        dailySnapshots: liveData.dailySnapshots,
      };
    });
    setStudentDrafts(drafts);
  }, [filteredStudents, startDateStr, endDateStr, dbDrafts, aggregatedReportCache]);

  React.useEffect(() => {
    loadAllStudentDrafts();
  }, [loadAllStudentDrafts]);

  // Help calculate standard summary labels
  const dateRangeLabel = React.useMemo(() => {
    try {
      const start = new Date(startDateStr);
      const end = new Date(endDateStr);
      return `${start.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} - ${end.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    } catch {
      return `${startDateStr} - ${endDateStr}`;
    }
  }, [startDateStr, endDateStr]);

  // ----------------------------------------------------
  // LOCAL DRAFT CHANGE PROCESSOR (PREVENTS GLOBAL RERENDER CRASH)
  // ----------------------------------------------------
  const handleLocalDraftChange = (studentId: string, updatedPayload: any) => {
    setStudentDrafts(prev => {
      const existing = prev[studentId] || {};
      const newDraft = {
        ...existing,
        ...updatedPayload,
      };
      
      // Persist locally
      const key = getSummaryKey(studentId, startDateStr, endDateStr);
      localStorage.setItem(key, JSON.stringify(newDraft));
      
      return {
        ...prev,
        [studentId]: newDraft
      };
    });
  };

  // ----------------------------------------------------
  // INDIVIDUAL SAVE & GENERATE PROCESSORS
  // ----------------------------------------------------

  const saveWeeklyComments = async (studentId: string, updatedPayload: any) => {
    setSavingStatus(prev => ({ ...prev, [studentId]: 'saving' }));
    try {
      const studentObj = students.find(s => s.id === studentId);
      const existing = studentDrafts[studentId] || {};
      
      const mergedDraft = {
        ...existing,
        ...updatedPayload,
      };

      const docId = `${studentId}_${startDateStr}_${endDateStr}`;
      const docRef = doc(db, 'weekly_summary_drafts', docId);

      const format = mergedDraft.commentFormat || 'LEGACY_TWO_COMMENTS';

      const dbPayload: any = {
        studentId,
        studentName: studentObj?.name || mergedDraft.studentName || 'Siswa',
        classId: selectedClassId,
        className: activeClassObj?.name || mergedDraft.className || mergedDraft.classGroup || '',
        academicYear: activeYear || '2025/2026',
        startDate: startDateStr,
        endDate: endDateStr,
        theme: mergedDraft.theme || '',
        week: mergedDraft.week || globalWeek || '',
        updatedAt: Date.now(),
        updatedBy: currentUser?.email || 'Teacher'
      };

      if (format === 'GENERAL_COMMENT') {
        dbPayload.generalComments = mergedDraft.generalComments || '';
        dbPayload.commentFormat = 'GENERAL_COMMENT';
        dbPayload.templateVersion = 'KINDY_WEEKLY_V2_GENERAL_COMMENT';
        // Ensure legacy fields are cleared on save
        dbPayload.socialEmotional = '';
        dbPayload.weeklyComments = '';
        dbPayload.attendanceCommentAiDraft = '';
        dbPayload.attendanceCommentTeacherEdited = '';
        dbPayload.observationCommentAiDraft = '';
        dbPayload.observationCommentTeacherEdited = '';
      } else {
        dbPayload.socialEmotional = mergedDraft.attendanceCommentTeacherEdited || mergedDraft.socialEmotional || '';
        dbPayload.weeklyComments = mergedDraft.observationCommentTeacherEdited || mergedDraft.weeklyComments || '';
        dbPayload.attendanceCommentAiDraft = mergedDraft.attendanceCommentAiDraft || '';
        dbPayload.attendanceCommentTeacherEdited = mergedDraft.attendanceCommentTeacherEdited || '';
        dbPayload.observationCommentAiDraft = mergedDraft.observationCommentAiDraft || '';
        dbPayload.observationCommentTeacherEdited = mergedDraft.observationCommentTeacherEdited || '';
        dbPayload.commentFormat = 'LEGACY_TWO_COMMENTS';
        dbPayload.templateVersion = 'KINDY_WEEKLY_V1_LEGACY';
      }

      await setDoc(docRef, dbPayload, { merge: true });

      // Update dbDrafts cache in active memory instantly to keep it synced
      // and skip making a full firestore refetch cycle!
      setDbDrafts(prev => ({
        ...prev,
        [studentId]: {
          id: docId,
          ...dbPayload,
          attendanceCommentTeacherEdited: dbPayload.attendanceCommentTeacherEdited || '',
          observationCommentTeacherEdited: dbPayload.observationCommentTeacherEdited || '',
          generalComments: dbPayload.generalComments || ''
        }
      }));

      setSavingStatus(prev => ({ ...prev, [studentId]: 'saved' }));
      setTimeout(() => {
        setSavingStatus(prev => ({ ...prev, [studentId]: 'idle' }));
      }, 3000);

      return true;
    } catch (error) {
      console.error(`[WeeklySummary Firestore Save] Error saving draft for student ${studentId}:`, error);
      setSavingStatus(prev => ({ ...prev, [studentId]: 'error' }));
      toast.error('Gagal menyimpan draf ke database. Silakan coba lagi.');
      return false;
    }
  };

  const saveIndividualStudentDraft = async (studentId: string, updatedPayload: any) => {
    // 1. Apply to active local state first for instantaneous visual feedback
    handleLocalDraftChange(studentId, updatedPayload);
    
    // 2. Safely perform back-end save asynchronously (without reloading global states)
    await saveWeeklyComments(studentId, updatedPayload);
  };

  const handleManualSave = (studentId: string, customTheme?: string, customWeek?: string) => {
    const draft = studentDrafts[studentId];
    const themeToSave = customTheme !== undefined ? customTheme : (draft?.theme || globalTheme);
    const weekToSave = customWeek !== undefined ? customWeek : (draft?.week || globalWeek);
    
    if (!draft) {
      // If no aggregated data existing, aggregate first
      const rawAggregation = aggregateKGWeeklyReportForPeriod(
        studentId, 
        startDateStr, 
        endDateStr,
        firestoreAttendance,
        firestoreObservations,
        students,
        firestoreDailyContexts,
        classes
      );
      saveIndividualStudentDraft(studentId, {
        ...rawAggregation,
        theme: themeToSave,
        week: weekToSave,
        attendanceCommentTeacherEdited: '',
        observationCommentTeacherEdited: ''
      });
    } else {
      saveIndividualStudentDraft(studentId, {
        theme: themeToSave,
        week: weekToSave
      });
    }
    toast.success('Komentar, Tema & Pekan siswa telah berhasil disimpan! 💾');
  };

  const handleGenerateSelIndividual = async (studentId: string) => {
    let currentDraft = studentDrafts[studentId];
    if (!currentDraft) {
      // First aggregate raw data
      currentDraft = aggregateKGWeeklyReportForPeriod(
        studentId, 
        startDateStr, 
        endDateStr,
        firestoreAttendance,
        firestoreObservations,
        students,
        firestoreDailyContexts,
        classes
      );
    }

    setGeneratingSelId(studentId);
    try {
      const response = await fetch('/api/kindergarten/generate-sel-comment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          studentName: currentDraft.studentName,
          nickName: currentDraft.nickName || currentDraft.studentName.split(' ')[0],
          ageGroup: currentDraft.ageGroup || 'TK_A',
          attendanceSummary: currentDraft.attendanceSummary
        })
      });

      if (!response.ok) {
        let errorMessage = 'Gagal memanggil API Guru AI Lumina';
        try {
          const errData = await response.json();
          errorMessage = errData.error || errorMessage;
        } catch (_) {}
        throw new Error(errorMessage);
      }

      const data = await response.json();
      const generatedText = data.text || '';

      await saveIndividualStudentDraft(studentId, {
        ...currentDraft,
        theme: currentDraft.theme || globalTheme,
        week: currentDraft.week || globalWeek,
        attendanceCommentAiDraft: generatedText,
        attendanceCommentTeacherEdited: generatedText
      });

      toast.success(`Komentar Sosial Emosional untuk ${currentDraft.studentName} berhasil digenerate! ✨`);
    } catch (e: any) {
      console.error(e);
      const fallbackText = '';
      
      await saveIndividualStudentDraft(studentId, {
        ...currentDraft,
        theme: currentDraft.theme || globalTheme,
        week: currentDraft.week || globalWeek,
        attendanceCommentAiDraft: fallbackText,
        attendanceCommentTeacherEdited: fallbackText
      });
      toast.error(e.message || `Gagal menghubungkan Guru AI Lumina. Silakan isi draf secara manual.`);
    } finally {
      setGeneratingSelId(null);
    }
  };

  const handleGenerateWeeklyIndividual = async (studentId: string) => {
    let currentDraft = studentDrafts[studentId];
    if (!currentDraft) {
      currentDraft = aggregateKGWeeklyReportForPeriod(
        studentId, 
        startDateStr, 
        endDateStr,
        firestoreAttendance,
        firestoreObservations,
        students,
        firestoreDailyContexts,
        classes
      );
    }

    setGeneratingWeeklyId(studentId);
    try {
      const response = await fetch('/api/kindergarten/generate-weekly-comment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          studentName: currentDraft.studentName,
          nickName: currentDraft.nickName || currentDraft.studentName.split(' ')[0],
          ageGroup: currentDraft.ageGroup || 'TK_A',
          observationSummary: currentDraft.groupedObservationSummary || []
        })
      });

      if (!response.ok) {
        let errorMessage = 'Gagal memanggil API Guru AI Lumina';
        try {
          const errData = await response.json();
          errorMessage = errData.error || errorMessage;
        } catch (_) {}
        throw new Error(errorMessage);
      }

      const data = await response.json();
      const generatedText = data.text || '';

      await saveIndividualStudentDraft(studentId, {
        ...currentDraft,
        theme: currentDraft.theme || globalTheme,
        week: currentDraft.week || globalWeek,
        observationCommentAiDraft: generatedText,
        observationCommentTeacherEdited: generatedText
      });

      toast.success(`Weekly Comments (Observasi) untuk ${currentDraft.studentName} berhasil digenerate! ✨`);
    } catch (e: any) {
      console.error(e);
      const sampleNotes = (currentDraft.groupedObservationSummary || [])
        .map((obs: any) => obs.mergedNotes?.join(' '))
        .filter(Boolean)
        .join('. ');

      const fallbackText = sampleNotes || '';
      
      await saveIndividualStudentDraft(studentId, {
        ...currentDraft,
        theme: currentDraft.theme || globalTheme,
        week: currentDraft.week || globalWeek,
        observationCommentAiDraft: fallbackText,
        observationCommentTeacherEdited: fallbackText
      });
      toast.error(e.message || `Gagal menghubungkan Guru AI Lumina. Silakan isi draf secara manual.`);
    } finally {
      setGeneratingWeeklyId(null);
    }
  };

  const handleGenerateGeneralIndividual = async (studentId: string) => {
    let currentDraft = studentDrafts[studentId];
    if (!currentDraft) {
      currentDraft = aggregateKGWeeklyReportForPeriod(
        studentId, 
        startDateStr, 
        endDateStr,
        firestoreAttendance,
        firestoreObservations,
        students,
        firestoreDailyContexts,
        classes
      );
    }

    setGeneratingGeneralId(studentId);
    try {
      const response = await fetch('/api/kindergarten/generate-general-comment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          studentName: currentDraft.studentName,
          nickName: currentDraft.nickName || currentDraft.studentName.split(' ')[0],
          ageGroup: currentDraft.ageGroup || 'TK_A',
          observationSummary: currentDraft.groupedObservationSummary || [],
          attendanceSummary: currentDraft.attendanceSummary
        })
      });

      if (!response.ok) {
        let errorMessage = 'Gagal memanggil API Guru AI Lumina';
        try {
          const errData = await response.json();
          errorMessage = errData.error || errorMessage;
        } catch (_) {}
        throw new Error(errorMessage);
      }

      const data = await response.json();
      const generatedText = data.text || '';

      await saveIndividualStudentDraft(studentId, {
        ...currentDraft,
        theme: currentDraft.theme || globalTheme,
        week: currentDraft.week || globalWeek,
        generalComments: generatedText
      });

      toast.success(`General Comments untuk ${currentDraft.studentName} berhasil digenerate! ✨`);
    } catch (e: any) {
      console.error(e);
      const sampleNotes = (currentDraft.groupedObservationSummary || [])
        .map((obs: any) => obs.mergedNotes?.join(' '))
        .filter(Boolean)
        .join('. ');

      const fallbackText = sampleNotes || '';
      
      await saveIndividualStudentDraft(studentId, {
        ...currentDraft,
        theme: currentDraft.theme || globalTheme,
        week: currentDraft.week || globalWeek,
        generalComments: fallbackText
      });
      toast.error(e.message || `Gagal menghubungkan Guru AI Lumina. Silakan isi draf secara manual.`);
    } finally {
      setGeneratingGeneralId(null);
    }
  };

  const handleClearAllPeriodDrafts = async () => {
    if (window.confirm('Apakah Anda yakin ingin menghapus seluruh draft summary pada periode ini dari lokal & database?')) {
      const toastId = toast.loading('Menghapus seluruh draf dari database...');
      try {
        for (const student of filteredStudents) {
          const key = getSummaryKey(student.id, startDateStr, endDateStr);
          localStorage.removeItem(key);

          const docId = `${student.id}_${startDateStr}_${endDateStr}`;
          try {
            await deleteDoc(doc(db, 'weekly_summary_drafts', docId));
          } catch (e) {
            // Non-blocking single deletion log
          }
        }
        toast.success('Pembersihan data periode selesai.', { id: toastId });
        setReloadCounter(prev => prev + 1);
      } catch (err: any) {
        console.error('[WeeklySummary Clear Drafts] Error:', err);
        toast.error(`Gagal menghapus draf di database: ${err.message}`, { id: toastId });
      }
    }
  };

  const handleSaveImport = async () => {
    const successRows = parsedImportRows.filter(r => r.status === 'success');
    if (successRows.length === 0) {
      toast.error('Tidak ada baris data valid yang siap diimpor!');
      return;
    }

    let saveCount = 0;
    const toastId = toast.loading('Mengimpor draf komentar ke database Firestore...');
    try {
      // Deep clone local memory first so we can apply incremental updates gracefully
      const clonedDrafts = { ...studentDrafts };
      const updatedDbDrafts = { ...dbDrafts };

      for (const row of successRows) {
        if (!row.matchedStudentId) continue;

        const studentId = row.matchedStudentId;
        const key = getSummaryKey(studentId, startDateStr, endDateStr);
        const existing = clonedDrafts[studentId] || {};

        let payload: any = {};
        if (importType === 'SEL') {
          payload = {
            attendanceCommentTeacherEdited: row.pastedComment,
            attendanceCommentAiDraft: existing.attendanceCommentAiDraft || row.pastedComment
          };
        } else {
          payload = {
            observationCommentTeacherEdited: row.pastedComment,
            observationCommentAiDraft: existing.observationCommentAiDraft || row.pastedComment
          };
        }

        const finalPayload = {
          ...existing,
          ...payload,
          theme: existing.theme || globalTheme,
          week: existing.week || globalWeek,
          studentId,
          startDate: startDateStr,
          endDate: endDateStr,
          updatedAt: Date.now()
        };

        // 1. Fallback to localStorage
        localStorage.setItem(key, JSON.stringify(finalPayload));

        // 2. Direct write to Firestore Doc
        const docId = `${studentId}_${startDateStr}_${endDateStr}`;
        const docRef = doc(db, 'weekly_summary_drafts', docId);

        const dbPayload = {
          studentId,
          studentName: existing.studentName || students.find(s => s.id === studentId)?.name || 'Siswa',
          classId: selectedClassId,
          className: activeClassObj?.name || existing.className || existing.classGroup || '',
          academicYear: activeYear || '2025/2026',
          startDate: startDateStr,
          endDate: endDateStr,
          theme: finalPayload.theme || '',
          week: finalPayload.week || '',
          socialEmotional: finalPayload.attendanceCommentTeacherEdited || '',
          weeklyComments: finalPayload.observationCommentTeacherEdited || '',
          attendanceCommentAiDraft: finalPayload.attendanceCommentAiDraft || '',
          attendanceCommentTeacherEdited: finalPayload.attendanceCommentTeacherEdited || '',
          observationCommentAiDraft: finalPayload.observationCommentAiDraft || '',
          observationCommentTeacherEdited: finalPayload.observationCommentTeacherEdited || '',
          updatedAt: Date.now(),
          updatedBy: currentUser?.email || 'Teacher'
        };

        await setDoc(docRef, dbPayload, { merge: true });

        // Apply locally inside loops
        clonedDrafts[studentId] = {
          ...clonedDrafts[studentId],
          ...finalPayload
        };
        updatedDbDrafts[studentId] = {
          id: docId,
          ...dbPayload,
          attendanceCommentTeacherEdited: dbPayload.attendanceCommentTeacherEdited || '',
          observationCommentTeacherEdited: dbPayload.observationCommentTeacherEdited || ''
        };

        saveCount++;
      }

      // Bulk render the complete state to optimize painting
      setStudentDrafts(clonedDrafts);
      setDbDrafts(updatedDbDrafts);

      toast.success(`Berhasil mengimpor ${saveCount} komentar ${importType === 'SEL' ? 'Social-Emotional' : 'Observation Progress'}! 💾`, { id: toastId });
      setIsImportOpen(false);
      setPastedText('');
    } catch (err: any) {
      console.error('[WeeklySummary Import Firestore] Error saving imported drafts:', err);
      toast.error(`Gagal menyimpan beberapa komentar ke Firestore: ${err.message}`, { id: toastId });
    }
  };

  if (isRestrictedToAssignedClasses && classes.length === 0 && !isLoadingClasses) {
    return (
      <div className="max-w-7xl mx-auto space-y-8 pb-20 px-4 md:px-0 font-sans">
        {/* 1. Page Title & Action Headers */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-emerald-600 to-teal-700 p-6 rounded-[2rem] text-white shadow-xl">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-[10px] font-black uppercase tracking-wider">Tahap 1</span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/30 text-[10px] font-bold tracking-wide">Kindergarten Unit</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight font-sans">Weekly Summary</h1>
            <p className="text-emerald-100 font-medium text-xs mt-0.5 font-sans">
              Otomasi komentar mingguan berdasarkan data harian Checklist & Observasi
            </p>
          </div>
        </header>

        <div className="max-w-4xl mx-auto my-12 p-12 bg-white border border-gray-150 rounded-3xl shadow-sm text-center">
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="p-4 bg-amber-50 text-amber-600 rounded-full">
              <AlertCircle size={36} />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Belum Ada Kelas Ditugaskan</h2>
            <p className="text-gray-600 max-w-md">
              Belum ada kelas aktif yang ditugaskan kepada Anda pada Tahun Ajaran {activeYear || '2026/2027'}. Hubungi Kepala Unit atau admin untuk memperbarui assignment kelas.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20 px-4 md:px-0 font-sans">
      
      {/* 1. Page Title & Action Headers */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-emerald-600 to-teal-700 p-6 rounded-[2rem] text-white shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-[10px] font-black uppercase tracking-wider">Tahap 1</span>
            <span className="text-xs text-emerald-100 font-bold">Lumina Kindergarten Workspace</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight font-sans">Weekly Summary</h1>
        </div>

        <button 
          onClick={() => {
            sessionStorage.setItem('kindy_report_start', startDateStr);
            sessionStorage.setItem('kindy_report_end', endDateStr);
            navigate('/kindy/weekly-review');
          }}
          className="flex items-center gap-2 bg-white hover:bg-emerald-50 text-emerald-900 font-extrabold text-xs px-6 py-3.5 rounded-2xl shadow-lg transition-all active:scale-95 cursor-pointer shrink-0"
        >
          <Eye size={15} />
          Buka Rapor Final (Tahap 2)
          <ArrowRight size={14} />
        </button>
      </header>

      {isFetchingFirestore && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 text-emerald-955 rounded-3xl p-5 flex items-center justify-between shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500 rounded-full animate-pulse text-white">
              <RefreshCw className="animate-spin" size={14} />
            </div>
            <div className="text-xs">
              <p className="font-extrabold text-emerald-900 uppercase tracking-widest text-[9px]">Sinkronisasi Aktif</p>
              <p className="text-emerald-700 mt-0.5 font-bold">Lumina Guru AI sedang mengimpor presensi & observasi teranyar dari server Firestore...</p>
            </div>
          </div>
          <span className="text-[10px] bg-emerald-100 text-emerald-800 font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider block">Real-time</span>
        </motion.div>
      )}

      {/* 2. Control Row: Date Period & Theme Config */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 bg-white p-6 rounded-[2rem] border border-gray-150 shadow-sm">
        
        {/* Date Filters */}
        <div className="lg:col-span-4 space-y-1.5">
          <label className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Pilih Rentang Tanggal Pengamatan (Periode)</label>
          <div className="flex items-center gap-1.5 font-sans">
            <button
              onClick={handlePrevWeek}
              className="p-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 hover:border-emerald-300 hover:text-emerald-700 rounded-xl transition-all cursor-pointer text-gray-500 flex items-center justify-center shrink-0"
              title="Minggu Sebelumnya"
            >
              <ChevronLeft size={15} />
            </button>
            
            <div className="flex-1 min-w-0">
              <input 
                type="date"
                value={startDateStr}
                onChange={(e) => handleStartDateChange(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-xl px-2 py-2.5 text-[11px] font-bold outline-none focus:ring-1 focus:ring-emerald-400 text-gray-700 font-sans text-center"
              />
            </div>
            <span className="text-[10px] text-gray-400 font-bold shrink-0">s/d</span>
            <div className="flex-1 min-w-0">
              <input 
                type="date"
                value={endDateStr}
                onChange={(e) => handleEndDateChange(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-xl px-2 py-2.5 text-[11px] font-bold outline-none focus:ring-1 focus:ring-emerald-400 text-gray-700 font-sans text-center"
              />
            </div>

            <button
              onClick={handleNextWeek}
              className="p-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 hover:border-emerald-300 hover:text-emerald-700 rounded-xl transition-all cursor-pointer text-gray-500 flex items-center justify-center shrink-0"
              title="Minggu Berikutnya"
            >
              <ChevronRight size={15} />
            </button>
          </div>
          <span className="text-[10px] text-gray-400 leading-tight block">
            * Atur tanggal awal dan akhir periode pengamatan (bisa 1 minggu atau beberapa minggu).
          </span>
        </div>

        {/* Global Monthly Theme & Manual Week */}
        <div className="lg:col-span-4 space-y-3">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Tema Pembelajaran</label>
            <input 
              type="text" 
              value={globalTheme} 
              onChange={(e) => setGlobalTheme(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:ring-1 focus:ring-emerald-400 text-gray-700"
              placeholder="Contoh: Aku dan Lingkunganku, Tanaman Sayur, dll"
            />
          </div>
          
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Pekan Pembelajaran (Week)</label>
            <div className="flex gap-1.5">
              <input 
                type="text" 
                value={globalWeek} 
                onChange={(e) => setGlobalWeek(e.target.value)}
                className="flex-1 bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:ring-1 focus:ring-emerald-400 text-gray-700"
                placeholder="Contoh: 1, 2, Pekan 3, Week 4, dll"
              />
              <button
                onClick={handleSaveWeeklyTheme}
                disabled={isSavingTheme}
                className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 px-3.5 rounded-xl transition-all cursor-pointer shadow-sm disabled:opacity-50 shrink-0"
                title="Simpan tema & pekan pembelajaran untuk minggu ini"
              >
                {isSavingTheme ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Save size={13} />
                )}
                <span>Simpan</span>
              </button>
            </div>
          </div>
        </div>

        {/* Class Selection Dropdown */}
        <div className="lg:col-span-4 space-y-1.5">
          <label className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Pilih Kelas</label>
          <div className="relative font-sans">
            <select
              value={selectedClassId}
              onChange={(e) => {
                setSelectedClassId(e.target.value);
                setLastSelectedClassId(e.target.value);
              }}
              disabled={isRestrictedToAssignedClasses && classes.length <= 1}
              className="w-full bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:ring-1 focus:ring-emerald-400 text-gray-700 appearance-none cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
            >
              {classes.map((cls) => {
                const classStudentsCount = students.filter(s => isStudentInClass(s.classId, cls)).length;
                return (
                  <option key={cls.id} value={cls.id}>
                    {cls.name} ({classStudentsCount} Siswa)
                  </option>
                );
              })}
              {classes.length === 0 && (
                <option value="">{isLoadingClasses ? "Memuat Kelas..." : "Tidak ada kelas aktif"}</option>
              )}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-500">
              <ChevronDown size={14} />
            </div>
          </div>
        </div>

        {/* Utilities block */}
        <div className="lg:col-span-12 flex justify-end gap-2 pt-3 border-t border-gray-100">
          <button 
            onClick={() => {
              setPastedText('');
              setIsImportOpen(true);
            }}
            className="flex items-center gap-1.5 bg-emerald-55/10 hover:bg-emerald-55/20 text-emerald-800 border border-emerald-200 font-bold text-xs py-2 px-4 rounded-xl transition-all cursor-pointer shadow-sm font-sans"
            title="Import komentar massal dari copy-paste Excel/Word"
          >
            <ClipboardList size={13} />
            Import Copy-Paste
          </button>
          <button 
            onClick={() => setReloadCounter(p => p + 1)}
            className="flex items-center gap-1.5 border border-gray-200 hover:bg-gray-50 text-gray-600 font-bold text-xs py-2 px-4 rounded-xl transition-all cursor-pointer font-sans"
            title="Muat ulang matriks dari database log lokal"
          >
            <RefreshCw size={13} />
            Muat Ulang
          </button>
          <button 
            onClick={handleClearAllPeriodDrafts}
            className="flex items-center gap-1.5 text-red-500 hover:bg-red-50 border border-red-150 font-bold text-xs py-2 px-4 rounded-xl transition-all cursor-pointer font-sans"
            title="Reset Draft Periode"
          >
            <Trash2 size={13} />
            Reset Draf
          </button>
        </div>

      </div>

      {/* 4. MAIN STUDENTS WORKSPACE TABLE */}
      <div className="bg-white rounded-[2rem] border border-gray-150 overflow-hidden shadow-sm">
        
        {/* Table layout */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              {startDateStr >= KINDY_GENERAL_COMMENTS_CUTOVER_DATE ? (
                <tr className="bg-gray-100/70 text-gray-800 text-[11px] font-black uppercase tracking-wider border-b border-gray-150">
                  <th className="py-4 pl-6 pr-3 w-12 text-center font-sans">No</th>
                  <th className="py-4 px-4 min-w-[150px] font-sans">Student Info</th>
                  <th className="py-4 px-4 min-w-[210px] bg-yellow-50/20 font-sans">Attendance Checklist Data</th>
                  <th className="py-4 px-4 min-w-[210px] bg-emerald-50/10 font-sans">Observation Data Summary</th>
                  <th className="py-4 px-4 min-w-[150px] text-center font-sans">General Comments</th>
                  <th className="py-4 pr-6 pl-2 w-12 text-center font-sans">Edit</th>
                </tr>
              ) : (
                <tr className="bg-gray-100/70 text-gray-800 text-[11px] font-black uppercase tracking-wider border-b border-gray-150">
                  <th className="py-4 pl-6 pr-3 w-12 text-center font-sans">No</th>
                  <th className="py-4 px-4 min-w-[150px] font-sans">Student Info</th>
                  <th className="py-4 px-4 min-w-[210px] bg-yellow-50/20 font-sans">Attendance Checklist Data</th>
                  <th className="py-4 px-4 min-w-[150px] text-center font-sans">SEL Comments</th>
                  <th className="py-4 px-4 min-w-[210px] bg-emerald-50/10 font-sans">Observation Data Summary</th>
                  <th className="py-4 px-4 min-w-[150px] text-center font-sans">Observation Comments</th>
                  <th className="py-4 pr-6 pl-2 w-12 text-center font-sans">Edit</th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-gray-150">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={startDateStr >= KINDY_GENERAL_COMMENTS_CUTOVER_DATE ? 6 : 7} className="py-12 text-center text-gray-400 font-bold bg-white font-sans">
                    <div className="flex flex-col items-center justify-center gap-2.5">
                      <AlertCircle className="text-gray-300" size={32} />
                      <div>
                        <p className="text-xs font-extrabold text-gray-700 uppercase tracking-wider font-sans">Tidak Ada Siswa Terdaftar</p>
                        <p className="text-[11px] text-gray-400 font-medium mt-1 font-sans">
                          Belum ada siswa yang masuk ke dalam kategori kelas ini di kelompok belajar Lumina Kindergarten.
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student, index) => {
                  const draft = studentDrafts[student.id];
                  const isExpanded = expandedStudentId === student.id;

                  // Extract or default values
                  const att = draft?.attendanceSummary || { happy: 0, sad: 0, angry: 0, ok: 0, sick: 0, izin: 0, noNews: 0 };
                  const obsItemsCount = draft?.weeklyObservationItems?.length || 0;
                  const obsDomains = draft?.groupedObservationSummary?.map((d: any) => d.domain) || [];

                  // Comment existence indicators
                  const hasSelComment = draft?.attendanceCommentTeacherEdited || draft?.attendanceCommentAiDraft;
                  const hasWeeklyComment = draft?.observationCommentTeacherEdited || draft?.observationCommentAiDraft;
                  const hasGeneralComment = draft?.generalComments?.trim();

                  const isGeneralCommentsPeriod = startDateStr >= KINDY_GENERAL_COMMENTS_CUTOVER_DATE;

                  return (
                    <React.Fragment key={student.id}>
                      
                      {/* Standard Table Row */}
                      <tr className={cn(
                        "group hover:bg-gray-50/50 transition-colors text-xs font-sans",
                        isExpanded ? "bg-emerald-55/5" : ""
                      )}>
                        
                        {/* 1. No */}
                        <td className="py-5 pl-6 pr-3 text-center font-bold text-gray-400">
                          {index + 1}
                        </td>

                        {/* 2. Name / level */}
                        <td className="py-5 px-4 font-sans">
                          <div className="font-extrabold text-gray-900 text-sm leading-snug uppercase font-sans">{student.name}</div>
                          <div className="text-[11px] text-gray-500 font-bold mt-1 uppercase tracking-tight font-sans">
                            Id: {student.id} | Level: {student.ageGroup === 'TK_B' ? 'TK B1 (5-6 Th)' : student.ageGroup === 'TK_A' ? 'TK A1 (4-5 Th)' : 'Pra TK (2-4 Th)'}
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {draft?.theme && (
                              <div className="inline-block text-[10px] px-2 py-0.5 rounded bg-gray-100 font-bold text-gray-600 italic max-w-[160px] font-sans">
                                Theme: "{draft.theme}"
                              </div>
                            )}
                            {draft?.week && (
                              <div className="inline-block text-[10px] px-2 py-0.5 rounded bg-gray-100 font-bold text-gray-600 italic max-w-[160px] font-sans">
                                Week: "{draft.week}"
                              </div>
                            )}
                          </div>
                        </td>

                        {/* 3. Attendance raw indicators */}
                        <td className="py-5 px-4 bg-yellow-50/10 font-sans">
                          <div className="flex flex-wrap gap-1.5 items-center">
                            <span className="inline-flex items-center gap-1 bg-yellow-50 text-yellow-850 text-xs font-bold px-2 py-1 rounded-lg border border-yellow-200/60 font-sans">
                              <Smile size={12} className="text-yellow-600 shrink-0" />
                              Hadir: {att.happy || 0}
                            </span>
                            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-850 text-xs font-bold px-2 py-1 rounded-lg border border-emerald-200/60 font-sans">
                              <Meh size={12} className="text-emerald-600 shrink-0" />
                              OK: {att.ok || 0}
                            </span>
                            <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-850 text-xs font-bold px-2 py-1 rounded-lg border border-blue-200/60 font-sans">
                              <Frown size={12} className="text-blue-600 shrink-0" />
                              Sakit: {att.sad || 0}
                            </span>
                            <span className="inline-flex items-center gap-1 bg-red-50 text-red-850 text-xs font-bold px-2 py-1 rounded-lg border border-red-200/60 font-sans">
                              <Angry size={12} className="text-red-600 shrink-0" />
                              Alpa: {att.angry || 0}
                            </span>
                          </div>
                          <div className="text-[10.5px] text-gray-500 mt-2 font-bold space-x-2 font-sans leading-normal">
                            <span>Sakit: {att.sick || 0} hari</span>
                            <span>•</span>
                            <span>Izin: {att.izin || 0} hari</span>
                            <span>•</span>
                            <span>Alpa / Tanpa Kabar: {att.noNews || 0} hari</span>
                          </div>
                        </td>

                        {isGeneralCommentsPeriod ? (
                          <>
                            {/* 4. Observation Summary */}
                            <td className="py-5 px-4 bg-emerald-50/5 font-sans min-w-[200px]">
                              {renderObservationDataSummary(draft?.weeklyObservationItems)}
                            </td>

                            {/* 5. General Comment Actions */}
                            <td className="py-5 px-4 text-center">
                              <div className="flex flex-col items-center gap-1.5 justify-center">
                                {hasGeneralComment ? (
                                  <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 text-[10px] font-extrabold px-2 py-1 rounded border border-green-200 select-none font-sans">
                                    <CheckCircle2 size={11} /> Ready
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 bg-gray-50 text-gray-400 text-[9px] font-extrabold px-2 py-1 rounded border border-gray-150 select-none font-sans">
                                    No comment
                                  </span>
                                )}

                                <button
                                  onClick={() => handleGenerateGeneralIndividual(student.id)}
                                  disabled={generatingGeneralId === student.id}
                                  className="text-[9.5px] font-black text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100/80 transition-all border border-emerald-200 px-2.5 py-1 rounded-lg cursor-pointer disabled:opacity-50 font-sans"
                                >
                                  {generatingGeneralId === student.id ? (
                                    <Loader2 className="animate-spin inline-block mr-1" size={10} />
                                  ) : (
                                    <Sparkles className="inline-block mr-1 text-emerald-600" size={10} />
                                  )}
                                  {hasGeneralComment ? 'Re-Generate' : 'Generate'}
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            {/* 4. Generate Comment Actions (SEL) */}
                            <td className="py-5 px-4 text-center">
                              <div className="flex flex-col items-center gap-1.5 justify-center">
                                {hasSelComment ? (
                                  <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 text-[10px] font-extrabold px-2 py-1 rounded border border-green-200 select-none font-sans">
                                    <CheckCircle2 size={11} /> Ready
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 bg-gray-50 text-gray-400 text-[9px] font-extrabold px-2 py-1 rounded border border-gray-150 select-none font-sans">
                                    No comment
                                  </span>
                                )}

                                <button
                                  onClick={() => handleGenerateSelIndividual(student.id)}
                                  disabled={generatingSelId === student.id}
                                  className="text-[9.5px] font-black text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100/80 transition-all border border-emerald-200 px-2.5 py-1 rounded-lg cursor-pointer disabled:opacity-50 font-sans"
                                >
                                  {generatingSelId === student.id ? (
                                    <Loader2 className="animate-spin inline-block mr-1" size={10} />
                                  ) : (
                                    <Sparkles className="inline-block mr-1 text-emerald-600" size={10} />
                                  )}
                                  {hasSelComment ? 'Re-Generate' : 'Generate'}
                                </button>
                              </div>
                            </td>

                            {/* 5. Observation Summary */}
                            <td className="py-5 px-4 bg-emerald-50/5 font-sans min-w-[200px]">
                              {renderObservationDataSummary(draft?.weeklyObservationItems)}
                            </td>

                            {/* 6. Generate Comment Actions (Observation) */}
                            <td className="py-5 px-4 text-center">
                              <div className="flex flex-col items-center gap-1.5 justify-center">
                                {hasWeeklyComment ? (
                                  <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 text-[10px] font-extrabold px-2 py-1 rounded border border-green-200 select-none font-sans">
                                    <CheckCircle2 size={11} /> Ready
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 bg-gray-50 text-gray-400 text-[9px] font-extrabold px-2 py-1 rounded border border-gray-150 select-none font-sans">
                                    No comment
                                  </span>
                                )}

                                <button
                                  onClick={() => handleGenerateWeeklyIndividual(student.id)}
                                  disabled={generatingWeeklyId === student.id}
                                  className="text-[9.5px] font-black text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100/80 transition-all border border-emerald-200 px-2.5 py-1 rounded-lg cursor-pointer disabled:opacity-50 font-sans"
                                >
                                  {generatingWeeklyId === student.id ? (
                                    <Loader2 className="animate-spin inline-block mr-1" size={10} />
                                  ) : (
                                    <Sparkles className="inline-block mr-1 text-emerald-600" size={10} />
                                  )}
                                  {hasWeeklyComment ? 'Re-Generate' : 'Generate'}
                                </button>
                              </div>
                            </td>
                          </>
                        )}

                        {/* Expand control */}
                        <td className="py-5 pr-6 pl-2 text-center">
                          <button
                            onClick={() => setExpandedStudentId(isExpanded ? null : student.id)}
                            className={cn(
                              "p-1.5 rounded-full hover:bg-gray-100 text-gray-500 hover:text-emerald-700 transition-all cursor-pointer",
                              isExpanded ? "bg-emerald-50 text-emerald-700" : ""
                            )}
                            title="Tampilkan Panel Editor"
                          >
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                        </td>

                      </tr>

                      {/* Collapsible Edit Panel (Draft textareas per student) */}
                      {isExpanded && (
                        <tr className="bg-emerald-50/15">
                          <td colSpan={isGeneralCommentsPeriod ? 6 : 7} className="py-5 px-8 border-b border-gray-200 font-sans">
                            <motion.div 
                              initial={{ opacity: 0, y: -8 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="space-y-5"
                            >
                              
                              {/* Inner Header with instructions */}
                              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-gray-200/65 pb-2">
                                <div>
                                  <span className="text-[10px] uppercase font-black tracking-wider text-emerald-800">Direct Workspace Editor</span>
                                  <h4 className="text-sm font-black text-gray-800">Menyunting Laporan: {student.name}</h4>
                                </div>
                                
                                <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                                  <div className="flex items-center gap-1.5 text-xs text-gray-500 font-bold bg-white px-3 py-1.5 border border-gray-200 rounded-xl">
                                    <span>Tema Siswa:</span>
                                    <input 
                                      type="text"
                                      value={draft?.theme || globalTheme}
                                      onChange={(e) => {
                                        handleLocalDraftChange(student.id, { theme: e.target.value });
                                      }}
                                      className="bg-transparent border-none outline-none font-extrabold text-emerald-800 text-xs px-1 w-36 hover:bg-gray-55 focus:bg-gray-55"
                                    />
                                  </div>

                                  <div className="flex items-center gap-1.5 text-xs text-gray-500 font-bold bg-white px-3 py-1.5 border border-gray-200 rounded-xl">
                                    <span>Pekan:</span>
                                    <input 
                                      type="text"
                                      value={draft?.week || globalWeek}
                                      onChange={(e) => {
                                        handleLocalDraftChange(student.id, { week: e.target.value });
                                      }}
                                      className="bg-transparent border-none outline-none font-extrabold text-emerald-800 text-xs px-1 w-16 hover:bg-gray-55 focus:bg-gray-55"
                                      placeholder="Week"
                                    />
                                  </div>

                                  <button
                                    onClick={() => handleManualSave(student.id)}
                                    disabled={savingStatus[student.id] === 'saving'}
                                    className={cn(
                                      "flex items-center gap-1.5 text-white font-extrabold text-[10px] px-4 py-2 rounded-xl transition-all shadow-md cursor-pointer font-sans",
                                      savingStatus[student.id] === 'saving' && "bg-amber-500 hover:bg-amber-500 cursor-not-allowed",
                                      savingStatus[student.id] === 'saved' && "bg-emerald-700 hover:bg-emerald-700",
                                      savingStatus[student.id] === 'error' && "bg-rose-650 hover:bg-rose-700",
                                      (!savingStatus[student.id] || savingStatus[student.id] === 'idle') && "bg-emerald-600 hover:bg-emerald-700 hover:scale-102"
                                    )}
                                  >
                                    {savingStatus[student.id] === 'saving' ? (
                                      <>
                                        <Loader2 className="animate-spin" size={12} />
                                        Menyimpan...
                                      </>
                                    ) : savingStatus[student.id] === 'saved' ? (
                                      <>
                                        <CheckCircle2 size={12} className="text-white" />
                                        Tersimpan! 💾
                                      </>
                                    ) : savingStatus[student.id] === 'error' ? (
                                      <>
                                        <AlertCircle size={12} />
                                        Gagal Menyimpan
                                      </>
                                    ) : (
                                      <>
                                        <Save size={12} />
                                        Simpan Draf Siswa
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>

                              {/* Comments Section (Conditional) */}
                              {draft?.commentFormat === 'GENERAL_COMMENT' ? (
                                /* Unified General Comments Block */
                                <div className="bg-white p-4 rounded-2xl border border-gray-150 space-y-2">
                                  <div className="flex justify-between items-center">
                                    <span className="text-[10.5px] font-black text-gray-700 flex items-center gap-1 font-sans">
                                      <BookOpen size={13} className="text-emerald-500" />
                                      General Comments (Unified Progress)
                                    </span>
                                    <button
                                      onClick={() => handleGenerateGeneralIndividual(student.id)}
                                      disabled={generatingGeneralId === student.id}
                                      className="text-[9.5px] font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded px-2 py-0.5 cursor-pointer font-sans"
                                    >
                                      {generatingGeneralId === student.id ? <Loader2 className="animate-spin inline mr-1" size={9} /> : <Sparkles className="inline mr-1" size={9} />}
                                      Refill AI
                                    </button>
                                  </div>

                                  <textarea
                                    value={draft?.generalComments || ''}
                                    onChange={(e) => {
                                      handleLocalDraftChange(student.id, { generalComments: e.target.value });
                                    }}
                                    rows={5}
                                    className="w-full bg-gray-50/50 p-3.5 rounded-xl border border-gray-200 outline-none focus:bg-white text-xs sm:text-sm text-gray-900 leading-relaxed font-serif resize-y min-h-[110px]"
                                    placeholder="Tuliskan draf komentar umum siswa atau generate via tombol AI di atas..."
                                  />
                                  <div className="flex flex-wrap items-center justify-between gap-2 mt-1.5 pt-1 border-t border-gray-100 font-sans">
                                    <div className="flex items-center gap-1.5 font-sans">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const isRec = activeRecording?.studentId === student.id && activeRecording?.fieldType === 'general_comments';
                                          if (isRec) {
                                            stopRecording();
                                          } else {
                                            startRecording(
                                              student.id,
                                              'general_comments',
                                              draft?.generalComments || ''
                                            );
                                          }
                                        }}
                                        className={cn(
                                          "flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded transition-all cursor-pointer",
                                          activeRecording?.studentId === student.id && activeRecording?.fieldType === 'general_comments'
                                            ? "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 animate-pulse font-sans"
                                            : "bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 font-sans"
                                        )}
                                      >
                                        {activeRecording?.studentId === student.id && activeRecording?.fieldType === 'general_comments' ? (
                                          <>
                                            <MicOff size={11} className="text-red-600" />
                                            <span>Berhenti</span>
                                          </>
                                        ) : (
                                          <>
                                            <Mic size={11} className="text-gray-600" />
                                            <span>Dikte</span>
                                          </>
                                        )}
                                      </button>
                                      {activeRecording?.studentId === student.id && activeRecording?.fieldType === 'general_comments' && (
                                        <span className="text-[10px] text-red-500 font-bold italic animate-pulse font-sans">
                                          Mendengarkan...
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-2 font-sans">
                                      <button
                                        type="button"
                                        onClick={() => handleRefineComment(
                                          student.id,
                                          student.name,
                                          'general_comments',
                                          draft?.generalComments || ''
                                        )}
                                        disabled={
                                          !(draft?.generalComments || '').trim() ||
                                          (refiningField?.studentId === student.id && refiningField?.fieldType === 'general_comments')
                                        }
                                        className="flex items-center gap-1 text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed px-2.5 py-1 rounded transition-all cursor-pointer font-sans"
                                      >
                                        {refiningField?.studentId === student.id && refiningField?.fieldType === 'general_comments' ? (
                                          <Loader2 size={11} className="animate-spin text-indigo-600" />
                                        ) : (
                                          <Sparkles size={11} className="text-indigo-600" />
                                        )}
                                        <span>Rapikan dengan AI</span>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                /* Double Comments Row */
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                  
                                  {/* 1. SEL Comment block */}
                                  <div className="bg-white p-4 rounded-2xl border border-gray-150 space-y-2">
                                    <div className="flex justify-between items-center">
                                      <span className="text-[10.5px] font-black text-gray-700 flex items-center gap-1">
                                        <Smile size={13} className="text-yellow-500" />
                                        Social-Emotional Development Comment
                                      </span>
                                      <button
                                        onClick={() => handleGenerateSelIndividual(student.id)}
                                        disabled={generatingSelId === student.id}
                                        className="text-[9.5px] font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded px-2 py-0.5 cursor-pointer font-sans"
                                      >
                                        {generatingSelId === student.id ? <Loader2 className="animate-spin inline mr-1" size={9} /> : <Sparkles className="inline mr-1" size={9} />}
                                        Refill AI
                                      </button>
                                    </div>

                                    <textarea
                                      value={draft?.attendanceCommentTeacherEdited || draft?.attendanceCommentAiDraft || ''}
                                      onChange={(e) => {
                                        handleLocalDraftChange(student.id, { attendanceCommentTeacherEdited: e.target.value });
                                      }}
                                      rows={5}
                                      className="w-full bg-gray-50/50 p-3.5 rounded-xl border border-gray-200 outline-none focus:bg-white text-xs sm:text-sm text-gray-900 leading-relaxed font-serif resize-y min-h-[110px]"
                                      placeholder="Ketikan masukan guru atau generate via tombol AI di atas..."
                                    />
                                    <div className="flex flex-wrap items-center justify-between gap-2 mt-1.5 pt-1 border-t border-gray-100 font-sans">
                                      <div className="flex items-center gap-1.5 font-sans">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const isRec = activeRecording?.studentId === student.id && activeRecording?.fieldType === 'social_emotional';
                                            if (isRec) {
                                              stopRecording();
                                            } else {
                                              startRecording(
                                                student.id,
                                                'social_emotional',
                                                draft?.attendanceCommentTeacherEdited || draft?.attendanceCommentAiDraft || ''
                                              );
                                            }
                                          }}
                                          className={cn(
                                            "flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded transition-all cursor-pointer font-sans",
                                            activeRecording?.studentId === student.id && activeRecording?.fieldType === 'social_emotional'
                                              ? "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 animate-pulse"
                                              : "bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200"
                                          )}
                                        >
                                          {activeRecording?.studentId === student.id && activeRecording?.fieldType === 'social_emotional' ? (
                                            <>
                                              <MicOff size={11} className="text-red-600" />
                                              <span>Berhenti</span>
                                            </>
                                          ) : (
                                            <>
                                              <Mic size={11} className="text-gray-600" />
                                              <span>Dikte</span>
                                            </>
                                          )}
                                        </button>
                                        {activeRecording?.studentId === student.id && activeRecording?.fieldType === 'social_emotional' && (
                                          <span className="text-[10px] text-red-500 font-bold italic animate-pulse font-sans">
                                            Mendengarkan...
                                          </span>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-2 font-sans">
                                        {draft?.attendanceCommentAiDraft && (draft?.attendanceCommentTeacherEdited === draft?.attendanceCommentAiDraft) && (
                                          <span className="text-[8px] bg-sky-50 text-sky-700 border border-sky-100 rounded px-1.5 py-0.5 font-bold tracking-wide font-sans">
                                            Original AI Draft Drafted
                                          </span>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => handleRefineComment(
                                            student.id,
                                            student.name,
                                            'social_emotional',
                                            draft?.attendanceCommentTeacherEdited || draft?.attendanceCommentAiDraft || ''
                                          )}
                                          disabled={
                                            !(draft?.attendanceCommentTeacherEdited || draft?.attendanceCommentAiDraft || '').trim() ||
                                            (refiningField?.studentId === student.id && refiningField?.fieldType === 'social_emotional')
                                          }
                                          className="flex items-center gap-1 text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed px-2.5 py-1 rounded transition-all cursor-pointer font-sans"
                                        >
                                          {refiningField?.studentId === student.id && refiningField?.fieldType === 'social_emotional' ? (
                                            <Loader2 size={11} className="animate-spin text-indigo-600" />
                                          ) : (
                                            <Sparkles size={11} className="text-indigo-600" />
                                          )}
                                          <span>Rapikan dengan AI</span>
                                        </button>
                                      </div>
                                    </div>
                                  </div>

                                  {/* 2. Observation Comment block */}
                                  <div className="bg-white p-4 rounded-2xl border border-gray-150 space-y-2 font-sans">
                                    <div className="flex justify-between items-center">
                                      <span className="text-[10.5px] font-black text-gray-700 flex items-center gap-1 font-sans">
                                        <BookOpen size={13} className="text-emerald-500" />
                                        Weekly Comments (6 Domains Progress)
                                      </span>
                                      <button
                                        onClick={() => handleGenerateWeeklyIndividual(student.id)}
                                        disabled={generatingWeeklyId === student.id}
                                        className="text-[9.5px] font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded px-2 py-0.5 cursor-pointer font-sans"
                                      >
                                        {generatingWeeklyId === student.id ? <Loader2 className="animate-spin inline mr-1" size={9} /> : <Sparkles className="inline mr-1" size={9} />}
                                        Refill AI
                                      </button>
                                    </div>

                                    <textarea
                                      value={draft?.observationCommentTeacherEdited || draft?.observationCommentAiDraft || ''}
                                      onChange={(e) => {
                                        handleLocalDraftChange(student.id, { observationCommentTeacherEdited: e.target.value });
                                      }}
                                      rows={5}
                                      className="w-full bg-gray-50/50 p-3.5 rounded-xl border border-gray-200 outline-none focus:bg-white text-xs sm:text-sm text-gray-900 leading-relaxed font-serif resize-y min-h-[110px]"
                                      placeholder="Tuliskan catatan akademik atau generate melalui tombol AI diatas..."
                                    />
                                    <div className="flex flex-wrap items-center justify-between gap-2 mt-1.5 pt-1 border-t border-gray-100 font-sans">
                                      <div className="flex items-center gap-1.5 font-sans">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const isRec = activeRecording?.studentId === student.id && activeRecording?.fieldType === 'weekly_domains';
                                            if (isRec) {
                                              stopRecording();
                                            } else {
                                              startRecording(
                                                student.id,
                                                'weekly_domains',
                                                draft?.observationCommentTeacherEdited || draft?.observationCommentAiDraft || ''
                                              );
                                            }
                                          }}
                                          className={cn(
                                            "flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded transition-all cursor-pointer font-sans",
                                            activeRecording?.studentId === student.id && activeRecording?.fieldType === 'weekly_domains'
                                              ? "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 animate-pulse"
                                              : "bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200"
                                          )}
                                        >
                                          {activeRecording?.studentId === student.id && activeRecording?.fieldType === 'weekly_domains' ? (
                                            <>
                                              <MicOff size={11} className="text-red-600" />
                                              <span>Berhenti</span>
                                            </>
                                          ) : (
                                            <>
                                              <Mic size={11} className="text-gray-600" />
                                              <span>Dikte</span>
                                            </>
                                          )}
                                        </button>
                                        {activeRecording?.studentId === student.id && activeRecording?.fieldType === 'weekly_domains' && (
                                          <span className="text-[10px] text-red-500 font-bold italic animate-pulse font-sans">
                                            Mendengarkan...
                                          </span>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-2 font-sans">
                                        {draft?.observationCommentAiDraft && (draft?.observationCommentTeacherEdited === draft?.observationCommentAiDraft) && (
                                          <span className="text-[8px] bg-sky-50 text-sky-700 border border-sky-100 rounded px-1.5 py-0.5 font-bold tracking-wide font-sans">
                                            Original AI Draft Drafted
                                          </span>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => handleRefineComment(
                                            student.id,
                                            student.name,
                                            'weekly_domains',
                                            draft?.observationCommentTeacherEdited || draft?.observationCommentAiDraft || ''
                                          )}
                                          disabled={
                                            !(draft?.observationCommentTeacherEdited || draft?.observationCommentAiDraft || '').trim() ||
                                            (refiningField?.studentId === student.id && refiningField?.fieldType === 'weekly_domains')
                                          }
                                          className="flex items-center gap-1 text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed px-2.5 py-1 rounded transition-all cursor-pointer font-sans"
                                        >
                                          {refiningField?.studentId === student.id && refiningField?.fieldType === 'weekly_domains' ? (
                                            <Loader2 size={11} className="animate-spin text-indigo-600" />
                                          ) : (
                                            <Sparkles size={11} className="text-indigo-600" />
                                          )}
                                          <span>Rapikan dengan AI</span>
                                        </button>
                                      </div>
                                    </div>
                                  </div>

                                </div>
                              )}

                              {/* Work snap preview inside workspace */}
                              {draft?.dailySnapshots?.length > 0 && (
                                <div className="bg-white p-3.5 rounded-2xl border border-gray-100 space-y-2 font-sans">
                                  <span className="text-[9.5px] uppercase font-black text-gray-400 tracking-wider block font-sans">Preserved Work snaps (Monday - Friday):</span>
                                  <div className="grid grid-cols-5 gap-2.5">
                                    {draft.dailySnapshots.map((snap: any, idx: number) => (
                                      <div key={idx} className="bg-gray-50/75 p-2 rounded-xl text-center border border-gray-150 relative">
                                        <span className="block text-[10px] font-black text-gray-700 mb-1 border-b border-gray-200 pb-0.5 font-sans">{snap.dayKey}</span>
                                        {snap.photoUrl ? (
                                          <div className="w-12 h-12 rounded bg-white border border-gray-250 mx-auto overflow-hidden flex items-center justify-center">
                                            <img src={snap.photoUrl} alt="work piece" className="max-w-full max-h-full w-auto h-auto object-contain" referrerpolicy="no-referrer" crossOrigin="anonymous" />
                                          </div>
                                        ) : (
                                          <div className="w-12 h-12 bg-white/50 border border-dashed border-gray-200 flex items-center justify-center mx-auto text-[7.5px] text-gray-400 p-0.5 font-sans">
                                            No Snapshot
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                            </motion.div>
                          </td>
                        </tr>
                      )}

                    </React.Fragment>
                  );
                }))}
            </tbody>
          </table>
        </div>

      </div>

      {/* 5. COPY PASTE BULK IMPORT MODAL */}
      <AnimatePresence>
        {isImportOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto font-sans">
            
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsImportOpen(false)}
              className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm cursor-pointer"
            />

            {/* Modal Body */}
            <div className="flex min-h-screen items-center justify-center p-4 sm:p-6 lg:p-8 font-sans">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                className="relative w-full max-w-4xl bg-white rounded-[2rem] shadow-2xl border border-gray-150 overflow-hidden flex flex-col max-h-[90vh]"
              >
                
                {/* Header */}
                <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-6 text-white flex justify-between items-center shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="bg-white/10 p-2.5 rounded-2xl">
                      <ClipboardList size={22} />
                    </div>
                    <div>
                      <h3 className="text-lg font-black tracking-tight font-sans">Bulk Import Copy-Paste Komentar</h3>
                      <p className="text-xs text-emerald-100 font-medium">Impor komentar massal dengan menyalin data teks dari Spreadsheet atau dokumen Word.</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsImportOpen(false)}
                    className="p-1.5 rounded-full hover:bg-white/15 transition-all text-white/85 hover:text-white cursor-pointer font-extrabold text-sm w-7 h-7 flex items-center justify-center bg-white/5"
                  >
                    ✕
                  </button>
                </div>

                {/* Content Body - Scrollable */}
                <div className="p-6 overflow-y-auto space-y-6 flex-1 font-sans">
                  
                  {/* Step 1: Selection & Format info */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-gray-700 font-sans">
                    
                    {/* Import Type Selector */}
                    <div className="space-y-2 p-4 bg-gray-50 rounded-2xl border border-gray-200">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block font-sans">Pilih Jenis Komentar</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setImportType('SEL');
                            setOverrideMatches({});
                          }}
                          className={cn(
                            "py-2.5 px-3 rounded-xl font-extrabold text-xs border text-center transition-all cursor-pointer font-sans",
                            importType === 'SEL'
                              ? "bg-white border-emerald-500 text-emerald-800 shadow-sm"
                              : "bg-gray-100 border-transparent text-gray-500 hover:bg-gray-200/80"
                          )}
                        >
                          SEL Comments
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setImportType('OBS');
                            setOverrideMatches({});
                          }}
                          className={cn(
                            "py-2.5 px-3 rounded-xl font-extrabold text-xs border text-center transition-all cursor-pointer font-sans",
                            importType === 'OBS'
                              ? "bg-white border-emerald-500 text-emerald-800 shadow-sm"
                              : "bg-gray-100 border-transparent text-gray-500 hover:bg-gray-200/80"
                          )}
                        >
                          Observation Comments
                        </button>
                      </div>
                      <span className="text-[10px] text-gray-400 leading-tight block pt-1 font-sans">
                        * <b>SEL</b>: Draf diletakkan pada kolom Social-Emotional Development.<br />
                        * <b>Observation</b>: Draf diletakkan pada kolom Weekly Progress (6 Domain).
                      </span>
                    </div>

                    {/* Guidelines */}
                    <div className="bg-emerald-50/40 p-4 rounded-2xl border border-emerald-100/80 text-xs text-gray-650 leading-relaxed space-y-1.5 font-sans">
                      <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider block font-sans">Aturan Penulisan Data:</span>
                      <ul className="list-disc pl-4 space-y-1 text-[11px] font-medium text-emerald-900 font-sans">
                        <li>Gunakan format separator <b>pipa (|)</b> atau salin langsung dari <b>Excel / Sheets (Tab)</b>.</li>
                        <li>Format: <code className="bg-emerald-55/20 px-1 py-0.5 rounded text-emerald-800 font-bold font-mono">Nama | Komentar</code></li>
                        <li>Contoh baris: <code className="block bg-white border border-emerald-100 text-[10px] p-1 rounded font-mono mt-1 text-gray-500">Alex Setiawan | Ananda Alex menunjukkan perkembangan emosi yang sangat matang pekan ini.</code></li>
                        <li>Sistem otomatis mencocokkan nama dengan daftar siswa aktif kelas saat ini.</li>
                      </ul>
                    </div>

                  </div>

                  {/* Textarea Paste Area */}
                  <div className="space-y-1.5 font-sans">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block font-sans">Area Tempel (Paste Area)</label>
                      {pastedText && (
                        <button 
                          onClick={() => { setPastedText(''); setOverrideMatches({}); }}
                          className="text-[9.5px] font-extrabold text-red-500 hover:text-red-700 bg-red-50 px-2 py-0.5 rounded-lg cursor-pointer transition-colors font-sans"
                        >
                          Clear Text
                        </button>
                      )}
                    </div>
                    <textarea
                      value={pastedText}
                      onChange={(e) => {
                        setPastedText(e.target.value);
                        setOverrideMatches({});
                      }}
                      rows={5}
                      className="w-full bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-2xl p-4 text-xs font-mono outline-none focus:bg-white focus:ring-1 focus:ring-emerald-400 text-gray-700 placeholder-gray-400"
                      placeholder="Tempel data Excel/Word di sini (Contoh: Budi Setiawan | Budi menunjukkan inisiatif yang baik...)"
                    />
                  </div>

                  {/* Preview Metrics & Rows */}
                  {parsedImportRows.length > 0 && (
                    <div className="space-y-3.5 pt-2 font-sans">
                      
                      {/* Metric Widgets */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-55 p-4 rounded-2xl border border-gray-150 font-sans">
                        <div className="text-center bg-white p-2.5 rounded-xl border border-gray-100 shadow-sm font-sans">
                          <span className="block text-[10px] font-black text-gray-400 uppercase tracking-tight font-sans">Total Baris</span>
                          <span className="text-base font-black text-gray-800 font-sans">{parsedImportRows.length}</span>
                        </div>
                        <div className="text-center bg-green-50/40 p-2.5 rounded-xl border border-green-150 shadow-sm font-sans">
                          <span className="block text-[10px] font-black text-green-700 uppercase tracking-tight font-sans">Siap Impor (Cocok)</span>
                          <span className="text-base font-black text-green-700 font-sans">
                            {parsedImportRows.filter(r => r.status === 'success').length}
                          </span>
                        </div>
                        <div className="text-center bg-yellow-50/50 p-2.5 rounded-xl border border-yellow-250 shadow-sm font-sans">
                          <span className="block text-[10px] font-black text-yellow-700 uppercase tracking-tight font-sans">Perlu Perbaikan</span>
                          <span className="text-base font-black text-yellow-700 font-sans">
                            {parsedImportRows.filter(r => ['multiple_matches', 'not_in_active_class', 'empty_comment'].includes(r.status)).length}
                          </span>
                        </div>
                        <div className="text-center bg-red-50/40 p-2.5 rounded-xl border border-red-150 shadow-sm font-sans">
                          <span className="block text-[10px] font-black text-red-650 uppercase tracking-tight font-sans font-extrabold">Tidak Ditemukan</span>
                          <span className="text-base font-black text-red-600 font-sans">
                            {parsedImportRows.filter(r => ['not_found', 'invalid_format'].includes(r.status)).length}
                          </span>
                        </div>
                      </div>

                      {/* Detail Rows Audit Table */}
                      <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm bg-white max-h-[240px] overflow-y-auto font-sans">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-gray-100 text-gray-700 text-[10px] uppercase font-black border-b border-gray-200">
                              <th className="py-2.5 px-3 w-12 text-center font-sans">Baris</th>
                              <th className="py-2.5 px-3 font-sans">Input Nama</th>
                              <th className="py-2.5 px-3 font-sans">Status / Pencocokan Laporan</th>
                              <th className="py-2.5 px-3 min-w-[200px] font-sans">Komentar</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-150">
                            {parsedImportRows.map((row) => (
                              <tr key={row.index} className="hover:bg-gray-50/30 transition-colors font-sans">
                                <td className="py-3 px-3 text-center font-bold text-gray-400">
                                  {row.index + 1}
                                </td>
                                <td className="py-3 px-3 font-sans">
                                  {row.pastedName ? (
                                    <div className="font-sans">
                                      <span className="font-extrabold text-xs text-gray-800 font-sans">{row.pastedName}</span>
                                      {row.status === 'success' && (
                                        <div className="text-[9.5px] text-gray-400 mt-0.5 leading-none font-sans">
                                          ID: {row.matchedStudentId}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-red-400 italic text-[11px] font-bold font-sans">Kosong</span>
                                  )}
                                </td>
                                <td className="py-3 px-3 font-sans">
                                  {row.status === 'success' && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-green-700 bg-green-50 border border-green-150 px-2.5 py-0.5 rounded font-sans">
                                      ✓ Siswa: {row.matchedStudentName}
                                    </span>
                                  )}
                                  {row.status === 'not_found' && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-red-650 bg-red-50 border border-red-150 px-2.5 py-0.5 rounded font-sans">
                                      Siswa Tidak Ditemukan
                                    </span>
                                  )}
                                  {row.status === 'not_in_active_class' && (
                                    <div className="space-y-1.5 font-sans">
                                      <span className="inline-flex items-center gap-0.5 text-[9.5px] font-extrabold text-yellow-750 bg-yellow-50 border border-yellow-250 px-2 py-0.5 rounded font-sans">
                                        Ada di Kelas Lain
                                      </span>
                                      <div className="text-[9.5px] text-gray-500 font-medium leading-none font-sans">
                                        Terdaftar di kelas: <b>{row.matchedOutsideClass?.classId || 'Lainnya'}</b>
                                      </div>
                                    </div>
                                  )}
                                  {row.status === 'empty_comment' && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-orange-600 bg-orange-50 border border-orange-150 px-2.5 py-0.5 rounded font-sans">
                                      Komentar Kosong
                                    </span>
                                  )}
                                  {row.status === 'invalid_format' && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-gray-500 bg-gray-55 border border-gray-150 px-2.5 py-0.5 rounded font-sans">
                                      Format Salah
                                    </span>
                                  )}
                                  {row.status === 'multiple_matches' && (
                                    <div className="space-y-1.5 p-1 bg-teal-50/20 border border-teal-150/40 rounded-lg font-sans">
                                      <span className="inline-flex items-center gap-1 text-[9.5px] font-extrabold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded font-sans">
                                        Nama Ganda (Multi-match)
                                      </span>
                                      <div className="text-[9px] text-gray-500 font-bold leading-none font-sans">Pilih siswa yang tepat:</div>
                                      <div className="flex flex-col gap-1 font-sans">
                                        {row.possibleMatches?.map((candid: any) => (
                                          <button
                                            key={candid.id}
                                            onClick={() => setOverrideMatches(prev => ({
                                              ...prev,
                                              [row.index]: { id: candid.id, name: candid.name }
                                            }))}
                                            className="text-[9.5px] font-extrabold text-left bg-white hover:bg-emerald-50 text-emerald-800 border border-gray-200 hover:border-emerald-300 rounded px-1.5 py-1 cursor-pointer transition-all leading-tight block w-full font-sans"
                                          >
                                            + {candid.name} ({candid.classId || 'Tidak Ada Kelas'})
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </td>
                                <td className="py-3 px-3">
                                  <div className="text-[11px] text-gray-650 tracking-tight leading-relaxed max-w-sm line-clamp-2 italic font-serif">
                                    {row.pastedComment ? `"${row.pastedComment}"` : '-'}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                    </div>
                  )}

                </div>

                {/* Footer Actions */}
                <div className="bg-gray-50 p-6 border-t border-gray-150 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shrink-0 font-sans">
                  <div className="text-[10px] text-gray-400 font-bold block">
                    * Data draf aktif akan disimpan untuk periode: <span className="text-emerald-700 font-extrabold font-sans">{dateRangeLabel}</span>
                  </div>
                  <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end font-sans">
                    <button
                      type="button"
                      onClick={() => setIsImportOpen(false)}
                      className="border border-gray-200 hover:bg-gray-100 text-gray-600 font-extrabold text-xs py-2.5 px-5 rounded-xl transition-all cursor-pointer font-sans"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveImport}
                      disabled={parsedImportRows.filter(r => r.status === 'success').length === 0}
                      className={cn(
                        "font-extrabold text-xs py-2.5 px-5 rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer font-sans",
                        parsedImportRows.filter(r => r.status === 'success').length > 0
                          ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/10"
                          : "bg-gray-200 text-gray-400 border border-gray-300 shadow-none cursor-not-allowed"
                      )}
                    >
                      <Save size={13} />
                      Simpan & Impor ({parsedImportRows.filter(r => r.status === 'success').length} Data)
                    </button>
                  </div>
                </div>

              </motion.div>
            </div>

          </div>
        )}
      </AnimatePresence>

      {/* REVIEW AI REFINE RESULT MODAL */}
      <AnimatePresence>
        {refineReview && (
          <div className="fixed inset-0 z-50 overflow-y-auto font-sans">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setRefineReview(null)}
              className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm cursor-pointer"
            />

            {/* Modal Container */}
            <div className="flex min-h-screen items-center justify-center p-4 sm:p-6 lg:p-8 font-sans">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-gray-150 overflow-hidden flex flex-col max-h-[90vh] font-sans"
              >
                {/* Header */}
                <div className="bg-gradient-to-r from-indigo-600 to-violet-700 p-6 text-white flex justify-between items-center shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="bg-white/10 p-2.5 rounded-2xl">
                      <Sparkles size={22} className="text-yellow-300" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black tracking-tight font-sans">Review Hasil AI - {refineReview.studentName}</h3>
                      <p className="text-xs text-indigo-100 font-medium font-sans">Silakan periksa perbandingan teks sebelum menerapkan saran perbaikan AI.</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setRefineReview(null)}
                    className="p-1.5 rounded-full hover:bg-white/15 transition-all text-white/85 hover:text-white cursor-pointer font-extrabold text-sm w-7 h-7 flex items-center justify-center bg-white/5"
                  >
                    ✕
                  </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto space-y-5 flex-1 font-sans">
                  {/* Left-Right or Top-Bottom Comparison */}
                  <div className="space-y-4 font-sans">
                    
                    {/* Original Teks */}
                    <div className="space-y-1.5 font-sans">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block font-sans">Komentar Asli Anda:</span>
                      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 text-xs text-gray-750 font-serif leading-relaxed italic whitespace-pre-wrap">
                        "{refineReview.originalText}"
                      </div>
                    </div>

                    {/* Arrow Indicator */}
                    <div className="flex justify-center font-sans">
                      <div className="bg-indigo-50 text-indigo-600 p-2 rounded-full border border-indigo-100 shadow-sm">
                        <ArrowRight size={16} className="rotate-90 md:rotate-0" />
                      </div>
                    </div>

                    {/* AI Refined Teks */}
                    <div className="space-y-1.5 font-sans">
                      <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider block font-sans">Hasil Rapian AI (Lumina):</span>
                      <div className="bg-indigo-50/35 border border-indigo-150 rounded-2xl p-4 text-xs text-gray-800 font-serif leading-relaxed whitespace-pre-wrap">
                        {refineReview.refinedText}
                      </div>
                    </div>

                  </div>

                  <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-2xl text-[11px] text-amber-900 leading-relaxed font-sans font-medium">
                    ⚠️ <b>Penting:</b> AI hanya memperbaiki tata bahasa, ejaan, tanda baca, dan susunan kalimat agar lebih profesional tanpa mengubah atau menambahkan fakta observasi baru dari Anda.
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="bg-gray-55 p-5 border-t border-gray-150 flex flex-wrap gap-2.5 justify-end items-center shrink-0 font-sans">
                  <button
                    type="button"
                    onClick={() => setRefineReview(null)}
                    className="border border-gray-250 hover:bg-gray-100 text-gray-650 font-extrabold text-xs py-2.5 px-4.5 rounded-xl transition-all cursor-pointer font-sans"
                  >
                    Pertahankan Teks Asli
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const { studentId, fieldType, refinedText } = refineReview;
                      if (fieldType === 'social_emotional') {
                        handleLocalDraftChange(studentId, { attendanceCommentTeacherEdited: refinedText });
                      } else if (fieldType === 'general_comments') {
                        handleLocalDraftChange(studentId, { generalComments: refinedText });
                      } else {
                        handleLocalDraftChange(studentId, { observationCommentTeacherEdited: refinedText });
                      }
                      setRefineReview(null);
                      toast.info("Teks asli telah digantikan dengan hasil AI. Anda masih dapat mengeditnya secara manual sebelum menyimpan draf.");
                    }}
                    className="border border-indigo-250 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-extrabold text-xs py-2.5 px-4.5 rounded-xl transition-all cursor-pointer font-sans"
                  >
                    Edit Lagi
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const { studentId, fieldType, refinedText } = refineReview;
                      if (fieldType === 'social_emotional') {
                        handleLocalDraftChange(studentId, { attendanceCommentTeacherEdited: refinedText });
                      } else if (fieldType === 'general_comments') {
                        handleLocalDraftChange(studentId, { generalComments: refinedText });
                      } else {
                        handleLocalDraftChange(studentId, { observationCommentTeacherEdited: refinedText });
                      }
                      setRefineReview(null);
                      toast.success("Hasil AI berhasil diterapkan! Silakan klik 'Simpan Draf Siswa' di baris siswa untuk menyimpannya permanen.");
                    }}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs py-2.5 px-5 rounded-xl transition-all shadow-md shadow-indigo-600/10 cursor-pointer font-sans"
                  >
                    Gunakan Hasil AI
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
