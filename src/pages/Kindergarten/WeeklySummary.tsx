import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, Loader2, Save, Smile, Meh, Frown, Angry, AlertCircle, CheckCircle2,
  Calendar, Edit3, BookOpen, Clock, Heart, ShieldAlert, ArrowRight, Eye, RefreshCw, ChevronDown, ChevronUp, Check, Trash2, ClipboardList
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { 
  DEFAULT_STUDENTS, 
  aggregateKGWeeklyReportForPeriod, 
  formatDateToKey, 
  getMonday,
  getStoredStudents,
  saveStoredStudents
} from '../../lib/kindergartenWeeklyReport';
import { collection, query, where, getDocs, doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { logFirestoreRead, getKindergartenClasses, getKindergartenStudents } from '../../lib/kindergartenMetadataCache';
import { useOutletContext } from 'react-router-dom';

// Define draft key generator
export function getSummaryKey(studentId: string, startDate: string, endDate: string): string {
  return `kg_weekly_summary_${studentId}_${startDate}_${endDate}`;
}

export default function WeeklySummary() {
  const navigate = useNavigate();
  const { activeYear } = useAcademicYear();
  const { currentUser } = useOutletContext<{ currentUser: any }>() || {};

  // Class Selection states
  const [classes, setClasses] = React.useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = React.useState<string>('');
  const [students, setStudents] = React.useState<any[]>(() => DEFAULT_STUDENTS);
  const [isLoadingClasses, setIsLoadingClasses] = React.useState(true);

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

  // Load students and classes from Firestore
  React.useEffect(() => {
    async function loadKindergartenData() {
      try {
        setIsLoadingClasses(true);
        if (process.env.NODE_ENV !== 'production') {
          console.log('Loading Kindergarten data from Firestore for year:', activeYear);
        }
        
        const fetchedClasses = await getKindergartenClasses(activeYear || '2025/2026');
        setClasses(fetchedClasses);
        if (fetchedClasses.length > 0) {
          setSelectedClassId(prev => prev || fetchedClasses[0].id);
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
      } finally {
        setIsLoadingClasses(false);
      }
    }

    loadKindergartenData();
  }, [activeYear]);

  // 1. Period states - Default to current week Monday to Friday
  const [startDateStr, setStartDateStr] = React.useState<string>(() => {
    const mon = getMonday(new Date());
    return formatDateToKey(mon);
  });
  const [endDateStr, setEndDateStr] = React.useState<string>(() => {
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

  // Theme of the current period
  const [globalTheme, setGlobalTheme] = React.useState<string>('');

  // Trigger recalculation trigger (For manual syncs or wholesale loads)
  const [reloadCounter, setReloadCounter] = React.useState<number>(0);

  // States to keep track of loaded student drafts
  const [studentDrafts, setStudentDrafts] = React.useState<Record<string, any>>({});
  const [dbDrafts, setDbDrafts] = React.useState<Record<string, any>>({});
  const [savingStatus, setSavingStatus] = React.useState<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({});

  // States to hold Firestore Attendance and Observations for the active date range
  const [firestoreAttendance, setFirestoreAttendance] = React.useState<any[]>([]);
  const [firestoreObservations, setFirestoreObservations] = React.useState<any[]>([]);
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
          fetchedObs = snapObs.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
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

        if (active) {
          setFirestoreAttendance(fetchedAtt);
          setFirestoreObservations(fetchedObs);
          setDbDrafts(fetchedDraftsMap);
          if (process.env.NODE_ENV !== 'production') {
            console.log(`[WeeklySummary Firestore Sync] Set ${fetchedAtt.length} attendance, ${fetchedObs.length} observations, and ${snapDraftsLen} drafts`);
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
        students
      );
    });
    return cache;
  }, [filteredStudents, startDateStr, endDateStr, firestoreAttendance, firestoreObservations, students]);

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
          attendanceCommentTeacherEdited: dbDraft.socialEmotional || dbDraft.attendanceCommentTeacherEdited || savedParsed.attendanceCommentTeacherEdited || '',
          observationCommentTeacherEdited: dbDraft.weeklyComments || dbDraft.observationCommentTeacherEdited || savedParsed.observationCommentTeacherEdited || '',
          theme: dbDraft.theme || savedParsed.theme || '',
        };
      }

      // Final draft state
      drafts[s.id] = {
        ...liveData,
        ...savedParsed,
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

      const dbPayload = {
        studentId,
        studentName: studentObj?.name || mergedDraft.studentName || 'Siswa',
        classId: selectedClassId,
        className: activeClassObj?.name || mergedDraft.className || mergedDraft.classGroup || '',
        academicYear: activeYear || '2025/2026',
        startDate: startDateStr,
        endDate: endDateStr,
        theme: mergedDraft.theme || '',
        socialEmotional: mergedDraft.attendanceCommentTeacherEdited || mergedDraft.socialEmotional || '',
        weeklyComments: mergedDraft.observationCommentTeacherEdited || mergedDraft.weeklyComments || '',
        attendanceCommentAiDraft: mergedDraft.attendanceCommentAiDraft || '',
        attendanceCommentTeacherEdited: mergedDraft.attendanceCommentTeacherEdited || '',
        observationCommentAiDraft: mergedDraft.observationCommentAiDraft || '',
        observationCommentTeacherEdited: mergedDraft.observationCommentTeacherEdited || '',
        updatedAt: Date.now(),
        updatedBy: currentUser?.email || 'Teacher'
      };

      await setDoc(docRef, dbPayload, { merge: true });

      // Update dbDrafts cache in active memory instantly to keep it synced
      // and skip making a full firestore refetch cycle!
      setDbDrafts(prev => ({
        ...prev,
        [studentId]: {
          id: docId,
          ...dbPayload,
          attendanceCommentTeacherEdited: dbPayload.attendanceCommentTeacherEdited || '',
          observationCommentTeacherEdited: dbPayload.observationCommentTeacherEdited || ''
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

  const handleManualSave = (studentId: string, customTheme?: string) => {
    const draft = studentDrafts[studentId];
    const themeToSave = customTheme || draft?.theme || globalTheme;
    
    if (!draft) {
      // If no aggregated data existing, aggregate first
      const rawAggregation = aggregateKGWeeklyReportForPeriod(
        studentId, 
        startDateStr, 
        endDateStr,
        firestoreAttendance,
        firestoreObservations,
        students
      );
      saveIndividualStudentDraft(studentId, {
        ...rawAggregation,
        theme: themeToSave,
        attendanceCommentTeacherEdited: '',
        observationCommentTeacherEdited: ''
      });
    } else {
      saveIndividualStudentDraft(studentId, {
        theme: themeToSave
      });
    }
    toast.success('Komentar & Tema siswa telah berhasil disimpan! 💾');
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
        students
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
        throw new Error('Gagal memanggil API Guru AI Lumina');
      }

      const data = await response.json();
      const generatedText = data.text || '';

      await saveIndividualStudentDraft(studentId, {
        ...currentDraft,
        theme: currentDraft.theme || globalTheme,
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
        attendanceCommentAiDraft: fallbackText,
        attendanceCommentTeacherEdited: fallbackText
      });
      toast.error(`Gagal menghubungkan Guru AI Lumina. Silakan isi draf secara manual.`);
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
        students
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
        throw new Error('Gagal memanggil API Guru AI Lumina');
      }

      const data = await response.json();
      const generatedText = data.text || '';

      await saveIndividualStudentDraft(studentId, {
        ...currentDraft,
        theme: currentDraft.theme || globalTheme,
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
        observationCommentAiDraft: fallbackText,
        observationCommentTeacherEdited: fallbackText
      });
      toast.error(`Gagal menghubungkan Guru AI Lumina. Silakan isi draf secara manual.`);
    } finally {
      setGeneratingWeeklyId(null);
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
          <div className="flex items-center gap-2 font-sans">
            <div className="flex-1 relative">
              <input 
                type="date"
                value={startDateStr}
                onChange={(e) => handleStartDateChange(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:ring-1 focus:ring-emerald-400 text-gray-700 font-sans"
              />
            </div>
            <span className="text-xs text-gray-400 font-bold">s/d</span>
            <div className="flex-1 relative">
              <input 
                type="date"
                value={endDateStr}
                onChange={(e) => handleEndDateChange(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:ring-1 focus:ring-emerald-400 text-gray-700 font-sans"
              />
            </div>
          </div>
          <span className="text-[10px] text-gray-400 leading-tight block">
            * Atur tanggal awal dan akhir periode pengamatan (bisa 1 minggu atau beberapa minggu).
          </span>
        </div>

        {/* Global Monthly Theme */}
        <div className="lg:col-span-4 space-y-1.5">
          <label className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Tema Pembelajaran</label>
          <input 
            type="text" 
            value={globalTheme} 
            onChange={(e) => setGlobalTheme(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:ring-1 focus:ring-emerald-400 text-gray-700"
            placeholder="Contoh: Aku dan Lingkunganku, Tanaman Sayur, dll"
          />
        </div>

        {/* Class Selection Dropdown */}
        <div className="lg:col-span-4 space-y-1.5">
          <label className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Pilih Kelas</label>
          <div className="relative font-sans">
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:ring-1 focus:ring-emerald-400 text-gray-700 appearance-none cursor-pointer"
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
              <tr className="bg-gray-100/70 text-gray-800 text-[11px] font-black uppercase tracking-wider border-b border-gray-150">
                <th className="py-4 pl-6 pr-3 w-12 text-center font-sans">No</th>
                <th className="py-4 px-4 min-w-[150px] font-sans">Student Info</th>
                <th className="py-4 px-4 min-w-[210px] bg-yellow-50/20 font-sans">Attendance Checklist Data</th>
                <th className="py-4 px-4 min-w-[150px] text-center font-sans">SEL Comments</th>
                <th className="py-4 px-4 min-w-[210px] bg-emerald-50/10 font-sans">Observation Data Summary</th>
                <th className="py-4 px-4 min-w-[150px] text-center font-sans">Observation Comments</th>
                <th className="py-4 pr-6 pl-2 w-12 text-center font-sans">Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-150">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-400 font-bold bg-white font-sans">
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
                          <div className="font-extrabold text-gray-900 leading-tight uppercase font-sans">{student.name}</div>
                          <div className="text-[10px] text-gray-500 font-bold mt-0.5 uppercase tracking-tight font-sans">
                            Id: {student.id} | Level: {student.ageGroup === 'TK_B' ? 'TK B1 (5-6 Th)' : student.ageGroup === 'TK_A' ? 'TK A1 (4-5 Th)' : 'Pra TK (2-4 Th)'}
                          </div>
                          {draft?.theme && (
                            <div className="mt-1 inline-block text-[9px] px-1.5 py-0.5 rounded bg-gray-100 font-bold text-gray-600 line-clamp-1 italic max-w-[140px] font-sans">
                              Theme: "{draft.theme}"
                            </div>
                          )}
                        </td>

                        {/* 3. Attendance raw indicators */}
                        <td className="py-5 px-4 bg-yellow-50/10 font-sans">
                          <div className="flex flex-wrap gap-1 items-center">
                            <span className="inline-flex items-center gap-0.5 bg-yellow-50 text-yellow-800 text-[10px] font-extrabold px-1.5 py-1 rounded border border-yellow-200/50 font-sans">
                              <Smile size={10} className="text-yellow-600" />
                              H:{att.happy || 0}
                            </span>
                            <span className="inline-flex items-center gap-0.5 bg-emerald-50 text-emerald-800 text-[10px] font-extrabold px-1.5 py-1 rounded border border-emerald-200/50 font-sans">
                              <Meh size={10} className="text-emerald-600" />
                              OK:{att.ok || 0}
                            </span>
                            <span className="inline-flex items-center gap-0.5 bg-blue-50 text-blue-800 text-[10px] font-extrabold px-1.5 py-1 rounded border border-blue-200/50 font-sans">
                              <Frown size={10} className="text-blue-600" />
                              S:{att.sad || 0}
                            </span>
                            <span className="inline-flex items-center gap-0.5 bg-red-50 text-red-800 text-[10px] font-extrabold px-1.5 py-1 rounded border border-red-200/50 font-sans">
                              <Angry size={10} className="text-red-600" />
                              A:{att.angry || 0}
                            </span>
                          </div>
                          <div className="text-[9px] text-gray-400 mt-1.5 font-bold space-x-2 font-sans">
                            <span>Sakit: {att.sick || 0}d</span>
                            <span>•</span>
                            <span>Izin: {att.izin || 0}d</span>
                            <span>•</span>
                            <span>Tanpa Kabar: {att.noNews || 0}d</span>
                          </div>
                        </td>

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
                        <td className="py-5 px-4 bg-emerald-50/5 font-sans">
                          {obsItemsCount === 0 ? (
                            <div className="text-[10px] text-gray-400 italic">No observation logs found</div>
                          ) : (
                            <div className="space-y-1">
                              <div className="text-[10.5px] text-gray-800 font-extrabold">
                                {obsItemsCount} log(s) di pekan ini
                              </div>
                              <div className="flex flex-wrap gap-1 pt-0.5">
                                {obsDomains.map((dom: string, i: number) => (
                                  <span key={i} className="text-[8.5px] font-extrabold bg-gray-50 text-gray-600 px-1 rounded border border-gray-200 leading-none py-0.5">
                                    {dom.slice(0, 15)}...
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
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
                          <td colSpan={7} className="py-5 px-8 border-b border-gray-200 font-sans">
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
                                
                                <div className="flex items-center gap-3 w-full sm:w-auto">
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

                              {/* Double Comments Row */}
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
                                    rows={4}
                                    className="w-full bg-gray-50/50 p-3 rounded-xl border border-gray-200 outline-none focus:bg-white text-xs text-gray-800 leading-relaxed font-serif resize-none"
                                    placeholder="Ketikan masukan guru atau generate via tombol AI di atas..."
                                  />
                                  {draft?.attendanceCommentAiDraft && (draft?.attendanceCommentTeacherEdited === draft?.attendanceCommentAiDraft) && (
                                    <span className="text-[8px] bg-sky-50 text-sky-700 border border-sky-100 rounded px-1.5 py-0.5 font-bold tracking-wide font-sans">
                                      Original AI Draft Drafted
                                    </span>
                                  )}
                                </div>

                                {/* 2. Observation Comment block */}
                                <div className="bg-white p-4 rounded-2xl border border-gray-150 space-y-2 font-sans">
                                  <div className="flex justify-between items-center">
                                    <span className="text-[10.5px] font-black text-gray-700 flex items-center gap-1">
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
                                    rows={4}
                                    className="w-full bg-gray-50/50 p-3 rounded-xl border border-gray-200 outline-none focus:bg-white text-xs text-gray-800 leading-relaxed font-serif resize-none"
                                    placeholder="Tuliskan catatan akademik atau generate melalui tombol AI diatas..."
                                  />
                                  {draft?.observationCommentAiDraft && (draft?.observationCommentTeacherEdited === draft?.observationCommentAiDraft) && (
                                    <span className="text-[8px] bg-sky-50 text-sky-700 border border-sky-100 rounded px-1.5 py-0.5 font-bold tracking-wide font-sans">
                                      Original AI Draft Drafted
                                    </span>
                                  )}
                                </div>

                              </div>

                              {/* Work snap preview inside workspace */}
                              {draft?.dailySnapshots?.length > 0 && (
                                <div className="bg-white p-3.5 rounded-2xl border border-gray-100 space-y-2 font-sans">
                                  <span className="text-[9.5px] uppercase font-black text-gray-400 tracking-wider block font-sans">Preserved Work snaps (Monday - Friday):</span>
                                  <div className="grid grid-cols-5 gap-2.5">
                                    {draft.dailySnapshots.map((snap: any, idx: number) => (
                                      <div key={idx} className="bg-gray-50/75 p-2 rounded-xl text-center border border-gray-150 relative">
                                        <span className="block text-[10px] font-black text-gray-700 mb-1 border-b border-gray-200 pb-0.5 font-sans">{snap.dayKey}</span>
                                        {snap.photoUrl ? (
                                          <div className="w-12 h-12 rounded bg-white border border-gray-250 mx-auto overflow-hidden">
                                            <img src={snap.photoUrl} alt="work piece" className="w-full h-full object-cover" referrerpolicy="no-referrer" crossOrigin="anonymous" />
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

    </div>
  );
}
