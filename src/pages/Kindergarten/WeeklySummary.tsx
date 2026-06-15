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
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { logFirestoreRead } from '../../lib/kindergartenMetadataCache';

// Define draft key generator
export function getSummaryKey(studentId: string, startDate: string, endDate: string): string {
  return `kg_weekly_summary_${studentId}_${startDate}_${endDate}`;
}

export default function WeeklySummary() {
  const navigate = useNavigate();
  const { activeYear } = useAcademicYear();

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

  const parsedImportRows = React.useMemo(() => {
    if (!pastedText.trim()) return [];
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

      // Match student using active class students (filteredStudents)
      const normalizedQuery = normalizeString(pastedName);
      
      // Get filtered list for active class students
      const activeClassObjInternal = classes.find(c => c.id === selectedClassId);
      const activeStudents = students.filter(student => {
        // inline isStudentInClass check
        const sClass = (student.classId || '').trim().toLowerCase();
        if (!activeClassObjInternal) return false;
        const actId = (activeClassObjInternal.id || '').trim().toLowerCase();
        const actName = (activeClassObjInternal.name || '').trim().toLowerCase();
        
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
        
        if (hasSpecAct && !hasSpecS) return false;
        if (normId.includes(normS) || normS.includes(normId)) return true;
        return false;
      });

      // 1. Exact match on normalized full name in active students
      const perfectMatches = activeStudents.filter(s => normalizeString(s.name) === normalizedQuery);
      
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

      // 2. Exact match on normalized nickName or partial overlap check in active students
      const partialMatches = activeStudents.filter(s => {
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
  }, [pastedText, students, selectedClassId, classes]);

  // Helper mapping helper logic from Observation.tsx
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
  };

  // Load students and classes from Firestore
  React.useEffect(() => {
    async function loadKindergartenData() {
      try {
        setIsLoadingClasses(true);
        console.log('Loading Kindergarten data from Firestore for year:', activeYear);
        
        const qClasses = query(
          collection(db, 'classes'),
          where('unitId', '==', 'KINDERGARTEN'),
          where('academicYear', '==', activeYear)
        );
        const classesSnap = await getDocs(qClasses).catch(e => {
          console.warn('Classes query failed:', e);
          return { docs: [] };
        });

        const fetchedClasses = classesSnap.docs.map(docSnap => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            name: data.name,
            grade: data.grade,
            unitId: data.unitId,
            academicYear: data.academicYear
          };
        }).sort((a, b) => a.name.localeCompare(b.name));

        setClasses(fetchedClasses);
        if (fetchedClasses.length > 0) {
          setSelectedClassId(fetchedClasses[0].id);
        }

        const qStudents = query(
          collection(db, 'students'),
          where('unitId', '==', 'KINDERGARTEN')
        );
        
        const qInvites = query(
          collection(db, 'roleInvites'),
          where('role', '==', 'STUDENT'),
          where('unitId', '==', 'KINDERGARTEN')
        );

        const qEnrollments = query(
          collection(db, 'enrollments'),
          where('unitId', '==', 'KINDERGARTEN'),
          where('academicYear', '==', activeYear)
        );

        const [studentsSnap, invitesSnap, enrollmentsSnap] = await Promise.all([
          getDocs(qStudents).catch(e => { console.warn('Students query failed:', e); return { docs: [] }; }),
          getDocs(qInvites).catch(e => { console.warn('Invites query failed:', e); return { docs: [] }; }),
          getDocs(qEnrollments).catch(e => { console.warn('Enrollments query failed:', e); return { docs: [] }; })
        ]);

        const enrollmentClassMap = new Map<string, string>();
        enrollmentsSnap.docs.forEach(docSnap => {
          const data = docSnap.data();
          if (data.studentId && data.classId) {
            enrollmentClassMap.set(data.studentId, data.classId);
          }
        });

        const map = new Map<string, any>();

        invitesSnap.docs.forEach(docSnap => {
          const data = docSnap.data();
          const studentId = data.luminaId || data.id || docSnap.id;
          const classId = data.classId || data.jobTitle || '';
          const ageGroup: 'TK_A' | 'TK_B' = (classId.toUpperCase().includes('TK_A') || classId.toUpperCase().includes('CATERPILLAR')) ? 'TK_A' : 'TK_B';
          
          if (studentId) {
            map.set(studentId, {
              id: studentId,
              name: data.fullName || data.name || 'Siswa Tanpa Nama',
              nickName: data.nickname || data.name?.split(' ')[0] || 'Siswa',
              ageGroup: ageGroup,
              classId: classId
            });
          }
        });

        studentsSnap.docs.forEach(docSnap => {
          const data = docSnap.data();
          
          if (data.academicYear && data.academicYear !== activeYear) {
            const isEnrolledInActiveYear = enrollmentsSnap.docs.some(eDoc => eDoc.data().studentId === docSnap.id);
            if (!isEnrolledInActiveYear) {
              return;
            }
          }
          const studentId = data.luminaId || docSnap.id;
          const classId = enrollmentClassMap.get(docSnap.id) || enrollmentClassMap.get(studentId) || enrollmentClassMap.get(data.luminaId || '') || data.classId || '';
          const ageGroup: 'TK_A' | 'TK_B' = (classId.toUpperCase().includes('TK_A') || classId.toUpperCase().includes('CATERPILLAR')) ? 'TK_A' : 'TK_B';

          const existing = map.get(studentId);
          if (existing && existing.classId) {
            map.set(studentId, {
              ...existing,
              name: existing.name || data.fullName || data.name || 'Siswa Tanpa Nama',
              nickName: existing.nickName || data.nickname || data.nickName || data.fullName?.split(' ')[0] || 'Siswa'
            });
          } else {
            map.set(studentId, {
              id: studentId,
              name: data.fullName || data.name || 'Siswa Tanpa Nama',
              nickName: data.nickname || data.nickName || data.fullName?.split(' ')[0] || 'Siswa',
              ageGroup: ageGroup,
              classId: classId
            });
          }
        });

        const uniqueStudentsMap = new Map<string, any>();
        Array.from(map.values()).forEach(stud => {
          const normName = stud.name.trim().toLowerCase();
          const existing = uniqueStudentsMap.get(normName);
          if (!existing) {
            uniqueStudentsMap.set(normName, stud);
          } else {
            // Prefer registered/official students over invites if both exist
            const existingIsInvite = existing.id && (existing.id.startsWith('INVITE_') || existing.id.includes('_') || existing.id.length > 15);
            const currentIsInvite = stud.id && (stud.id.startsWith('INVITE_') || stud.id.includes('_') || stud.id.length > 15);
            if (existingIsInvite && !currentIsInvite) {
              uniqueStudentsMap.set(normName, stud);
            }
          }
        });

        const fetchedStudents = Array.from(uniqueStudentsMap.values()).sort((a, b) => a.name.localeCompare(b.name));

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

  // Trigger recalculation trigger
  const [reloadCounter, setReloadCounter] = React.useState<number>(0);

  // States to keep track of loaded student drafts
  // Format: key studentId -> Draft Object
  const [studentDrafts, setStudentDrafts] = React.useState<Record<string, any>>({});

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
        console.log(`[WeeklySummary Firestore Sync] Fetching for class ${selectedClassId} from ${startDateStr} to ${endDateStr}`);

        // 1. Fetch attendance reports
        const qAtt = query(
          collection(db, 'attendance'),
          where('classId', '==', selectedClassId),
          where('date', '>=', startDateStr),
          where('date', '<=', endDateStr)
        );
        const snapAtt = await getDocs(qAtt);
        logFirestoreRead('attendanceReports', snapAtt.docs.length || 1);
        const fetchedAtt = snapAtt.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        // 2. Fetch Observations
        const qObs = query(
          collection(db, 'observations'),
          where('date', '>=', startDateStr),
          where('date', '<=', endDateStr)
        );
        const snapObs = await getDocs(qObs);
        logFirestoreRead('observations', snapObs.docs.length || 1);
        const fetchedObs = snapObs.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        if (active) {
          setFirestoreAttendance(fetchedAtt);
          setFirestoreObservations(fetchedObs);
          console.log(`[WeeklySummary Firestore Sync] Set ${fetchedAtt.length} attendance docs and ${fetchedObs.length} observations`);
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

  const activeClassObj = classes.find(c => c.id === selectedClassId);
  const filteredStudents = React.useMemo(() => {
    if (!selectedClassId || !activeClassObj) {
      return students;
    }
    return students.filter(student => isStudentInClass(student.classId, activeClassObj));
  }, [students, selectedClassId, activeClassObj]);

  // Load drafts for all students on start or when date / reload counter changes
  const loadAllStudentDrafts = React.useCallback(() => {
    const drafts: Record<string, any> = {};
    students.forEach(s => {
      // 1. Calculate live properties on the fly from attendance checklists and observations (with Firestore integration)
      const liveData = aggregateKGWeeklyReportForPeriod(
        s.id, 
        startDateStr, 
        endDateStr, 
        firestoreAttendance, 
        firestoreObservations, 
        students
      );

      // 2. Load draft/saved info if it exists
      const storageKey = getSummaryKey(s.id, startDateStr, endDateStr);
      const saved = localStorage.getItem(storageKey);
      
      let savedParsed = {};
      if (saved) {
        try {
          savedParsed = JSON.parse(saved);
        } catch (e) {
          console.error(`Error parsing draft for ${s.name}:`, e);
        }
      }

      // Merge them. The saved comments, custom theme etc, should OVERWRITE the live defaults.
      // But live data (like attendanceSummary, weeklyObservationItems, groupedObservationSummary) should be fresh!
      drafts[s.id] = {
        ...liveData,
        ...savedParsed,
        // Make sure we carry forward the latest fresh attendance/observation stats
        attendanceSummary: liveData.attendanceSummary,
        weeklyObservationItems: liveData.weeklyObservationItems,
        groupedObservationSummary: liveData.groupedObservationSummary,
        dailySnapshots: liveData.dailySnapshots,
      };
    });
    setStudentDrafts(drafts);
  }, [students, startDateStr, endDateStr, reloadCounter, firestoreAttendance, firestoreObservations]);

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
  // INDIVIDUAL SAVE & GENERATE PROCESSORS
  // ----------------------------------------------------

  const saveIndividualStudentDraft = (studentId: string, updatedPayload: any) => {
    const key = getSummaryKey(studentId, startDateStr, endDateStr);
    const existing = studentDrafts[studentId] || {};
    const finalPayload = {
      ...existing,
      ...updatedPayload,
      studentId,
      startDate: startDateStr,
      endDate: endDateStr,
      updatedAt: Date.now()
    };
    
    localStorage.setItem(key, JSON.stringify(finalPayload));
    setReloadCounter(prev => prev + 1);
  };

  const handleManualSave = (studentId: string, customTheme?: string) => {
    const draft = studentDrafts[studentId];
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
        theme: customTheme || globalTheme,
        teacherEditedWeeklyComments: '',
        teacherEditedSocialEmotional: ''
      });
    } else {
      saveIndividualStudentDraft(studentId, {
        theme: customTheme || draft.theme || globalTheme
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

      saveIndividualStudentDraft(studentId, {
        ...currentDraft,
        theme: currentDraft.theme || globalTheme,
        attendanceCommentAiDraft: generatedText,
        attendanceCommentTeacherEdited: generatedText
      });

      toast.success(`Komentar Sosial Emosional untuk ${currentDraft.studentName} berhasil digenerate! ✨`);
    } catch (e: any) {
      console.error(e);
      // Fallback - Neutral Empty State
      const fallbackText = '';
      
      saveIndividualStudentDraft(studentId, {
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

      saveIndividualStudentDraft(studentId, {
        ...currentDraft,
        theme: currentDraft.theme || globalTheme,
        observationCommentAiDraft: generatedText,
        observationCommentTeacherEdited: generatedText
      });

      toast.success(`Weekly Comments (Observasi) untuk ${currentDraft.studentName} berhasil digenerate! ✨`);
    } catch (e: any) {
      console.error(e);
      // Fallback - Extract actual documented observations from the week, or keep empty (no fake stories)
      const sampleNotes = (currentDraft.groupedObservationSummary || [])
        .map((obs: any) => obs.mergedNotes?.join(' '))
        .filter(Boolean)
        .join('. ');

      const fallbackText = sampleNotes || '';
      
      saveIndividualStudentDraft(studentId, {
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

  const handleClearAllPeriodDrafts = () => {
    if (window.confirm('Apakah Anda yakin ingin menghapus seluruh draft summary pada periode ini?')) {
      students.forEach(student => {
        const key = getSummaryKey(student.id, startDateStr, endDateStr);
        localStorage.removeItem(key);
      });
      setReloadCounter(prev => prev + 1);
      toast.success('Pembersihan data periode selesai.');
    }
  };

  const handleSaveImport = () => {
    const successRows = parsedImportRows.filter(r => r.status === 'success');
    if (successRows.length === 0) {
      toast.error('Tidak ada baris data valid yang siap diimpor!');
      return;
    }

    let saveCount = 0;
    successRows.forEach(row => {
      if (!row.matchedStudentId) return;

      const studentId = row.matchedStudentId;
      const key = getSummaryKey(studentId, startDateStr, endDateStr);
      const existing = studentDrafts[studentId] || {};

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

      localStorage.setItem(key, JSON.stringify(finalPayload));
      saveCount++;
    });

    setReloadCounter(p => p + 1);
    toast.success(`Berhasil mengimpor ${saveCount} komentar ${importType === 'SEL' ? 'Social-Emotional' : 'Observation Progress'}! 💾`);
    setIsImportOpen(false);
    setPastedText('');
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
          <h1 className="text-2xl font-black tracking-tight">Weekly Summary</h1>
        </div>

        <button 
          onClick={() => {
            // Put active date configuration in sessionStorage so final report page can pick it up
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
                className="w-full bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:ring-1 focus:ring-emerald-400 text-gray-700"
              />
            </div>
            <span className="text-xs text-gray-400 font-bold">s/d</span>
            <div className="flex-1 relative">
              <input 
                type="date"
                value={endDateStr}
                onChange={(e) => handleEndDateChange(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:ring-1 focus:ring-emerald-400 text-gray-700"
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
          <div className="relative">
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
            className="flex items-center gap-1.5 bg-emerald-55/10 hover:bg-emerald-55/20 text-emerald-800 border border-emerald-200 font-bold text-xs py-2 px-4 rounded-xl transition-all cursor-pointer shadow-sm"
            title="Import komentar massal dari copy-paste Excel/Word"
          >
            <ClipboardList size={13} />
            Import Copy-Paste
          </button>
          <button 
            onClick={() => setReloadCounter(p => p + 1)}
            className="flex items-center gap-1.5 border border-gray-200 hover:bg-gray-50 text-gray-600 font-bold text-xs py-2 px-4 rounded-xl transition-all cursor-pointer"
            title="Muat ulang matriks dari database log lokal"
          >
            <RefreshCw size={13} />
            Muat Ulang
          </button>
          <button 
            onClick={handleClearAllPeriodDrafts}
            className="flex items-center gap-1.5 text-red-500 hover:bg-red-50 border border-red-150 font-bold text-xs py-2 px-4 rounded-xl transition-all cursor-pointer"
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
                <th className="py-4 pl-6 pr-3 w-12 text-center">No</th>
                <th className="py-4 px-4 min-w-[150px]">Student Info</th>
                <th className="py-4 px-4 min-w-[210px] bg-yellow-50/20">Attendance Checklist Data</th>
                <th className="py-4 px-4 min-w-[150px] text-center">SEL Comments</th>
                <th className="py-4 px-4 min-w-[210px] bg-emerald-50/10">Observation Data Summary</th>
                <th className="py-4 px-4 min-w-[150px] text-center">Observation Comments</th>
                <th className="py-4 pr-6 pl-2 w-12 text-center">Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-150">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-400 font-bold bg-white">
                    <div className="flex flex-col items-center justify-center gap-2.5">
                      <AlertCircle className="text-gray-300" size={32} />
                      <div>
                        <p className="text-xs font-extrabold text-gray-700 uppercase tracking-wider">Tidak Ada Siswa Terdaftar</p>
                        <p className="text-[11px] text-gray-400 font-medium mt-1">
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
                      "group hover:bg-gray-50/50 transition-colors text-xs",
                      isExpanded ? "bg-emerald-55/5" : ""
                    )}>
                      
                      {/* 1. No */}
                      <td className="py-5 pl-6 pr-3 text-center font-bold text-gray-400">
                        {index + 1}
                      </td>

                      {/* 2. Name / level */}
                      <td className="py-5 px-4">
                        <div className="font-extrabold text-gray-900 leading-tight uppercase">{student.name}</div>
                        <div className="text-[10px] text-gray-500 font-bold mt-0.5 uppercase tracking-tight">
                          Id: {student.id} | Level: {student.ageGroup === 'TK_B' ? 'TK B1 (5-6 Th)' : student.ageGroup === 'TK_A' ? 'TK A1 (4-5 Th)' : 'Pra TK (2-4 Th)'}
                        </div>
                        {draft?.theme && (
                          <div className="mt-1 inline-block text-[9px] px-1.5 py-0.5 rounded bg-gray-100 font-bold text-gray-600 line-clamp-1 italic max-w-[140px]">
                            Theme: "{draft.theme}"
                          </div>
                        )}
                      </td>

                      {/* 3. Attendance raw indicators */}
                      <td className="py-5 px-4 bg-yellow-50/10">
                        <div className="flex flex-wrap gap-1 items-center">
                          <span className="inline-flex items-center gap-0.5 bg-yellow-50 text-yellow-800 text-[10px] font-extrabold px-1.5 py-1 rounded border border-yellow-200/50">
                            <Smile size={10} className="text-yellow-600" />
                            H:{att.happy || 0}
                          </span>
                          <span className="inline-flex items-center gap-0.5 bg-emerald-50 text-emerald-800 text-[10px] font-extrabold px-1.5 py-1 rounded border border-emerald-200/50">
                            <Meh size={10} className="text-emerald-600" />
                            OK:{att.ok || 0}
                          </span>
                          <span className="inline-flex items-center gap-0.5 bg-blue-50 text-blue-800 text-[10px] font-extrabold px-1.5 py-1 rounded border border-blue-200/50">
                            <Frown size={10} className="text-blue-600" />
                            S:{att.sad || 0}
                          </span>
                          <span className="inline-flex items-center gap-0.5 bg-red-50 text-red-800 text-[10px] font-extrabold px-1.5 py-1 rounded border border-red-200/50">
                            <Angry size={10} className="text-red-600" />
                            A:{att.angry || 0}
                          </span>
                        </div>
                        <div className="text-[9px] text-gray-400 mt-1.5 font-bold space-x-2">
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
                            <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 text-[10px] font-extrabold px-2 py-1 rounded border border-green-200 select-none">
                              <CheckCircle2 size={11} /> Ready
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-gray-50 text-gray-400 text-[9px] font-extrabold px-2 py-1 rounded border border-gray-150 select-none">
                              No comment
                            </span>
                          )}

                          <button
                            onClick={() => handleGenerateSelIndividual(student.id)}
                            disabled={generatingSelId === student.id}
                            className="text-[9.5px] font-black text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100/80 transition-all border border-emerald-200 px-2.5 py-1 rounded-lg cursor-pointer disabled:opacity-50"
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
                      <td className="py-5 px-4 bg-emerald-50/5">
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
                            <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 text-[10px] font-extrabold px-2 py-1 rounded border border-green-200 select-none">
                              <CheckCircle2 size={11} /> Ready
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-gray-50 text-gray-400 text-[9px] font-extrabold px-2 py-1 rounded border border-gray-150 select-none">
                              No comment
                            </span>
                          )}

                          <button
                            onClick={() => handleGenerateWeeklyIndividual(student.id)}
                            disabled={generatingWeeklyId === student.id}
                            className="text-[9.5px] font-black text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100/80 transition-all border border-emerald-200 px-2.5 py-1 rounded-lg cursor-pointer disabled:opacity-50"
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
                        <td colSpan={7} className="py-5 px-8 border-b border-gray-200">
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
                                      const key = getSummaryKey(student.id, startDateStr, endDateStr);
                                      const existing = studentDrafts[student.id] || {};
                                      localStorage.setItem(key, JSON.stringify({
                                        ...existing,
                                        theme: e.target.value
                                      }));
                                      setReloadCounter(p => p + 1);
                                    }}
                                    className="bg-transparent border-none outline-none font-extrabold text-emerald-800 text-xs px-1 w-36 hover:bg-gray-50 focus:bg-gray-50"
                                  />
                                </div>

                                <button
                                  onClick={() => handleManualSave(student.id)}
                                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] px-4 py-2 rounded-xl transition-all shadow-md shadow-emerald-55/3 hover:shadow-emerald-55 hover:scale-102 cursor-pointer"
                                >
                                  <Save size={12} />
                                  Simpan Draf Siswa
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
                                    className="text-[9.5px] font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded px-2 py-0.5 cursor-pointer"
                                  >
                                    {generatingSelId === student.id ? <Loader2 className="animate-spin inline mr-1" size={9} /> : <Sparkles className="inline mr-1" size={9} />}
                                    Refill AI
                                  </button>
                                </div>

                                <textarea
                                  value={draft?.attendanceCommentTeacherEdited || draft?.attendanceCommentAiDraft || ''}
                                  onChange={(e) => {
                                    const key = getSummaryKey(student.id, startDateStr, endDateStr);
                                    const existing = studentDrafts[student.id] || {};
                                    localStorage.setItem(key, JSON.stringify({
                                      ...existing,
                                      attendanceCommentTeacherEdited: e.target.value
                                    }));
                                    setReloadCounter(p => p + 1);
                                  }}
                                  rows={4}
                                  className="w-full bg-gray-50/50 p-3 rounded-xl border border-gray-200 outline-none focus:bg-white text-xs text-gray-800 leading-relaxed font-serif resize-none"
                                  placeholder="Ketikan masukan guru atau generate via tombol AI di atas..."
                                />
                                {draft?.attendanceCommentAiDraft && (draft?.attendanceCommentTeacherEdited === draft?.attendanceCommentAiDraft) && (
                                  <span className="text-[8px] bg-sky-50 text-sky-700 border border-sky-100 rounded px-1.5 py-0.5 font-bold tracking-wide">
                                    Original AI Draft Drafted
                                  </span>
                                )}
                              </div>

                              {/* 2. Observation Comment block */}
                              <div className="bg-white p-4 rounded-2xl border border-gray-150 space-y-2">
                                <div className="flex justify-between items-center">
                                  <span className="text-[10.5px] font-black text-gray-700 flex items-center gap-1">
                                    <BookOpen size={13} className="text-emerald-500" />
                                    Weekly Comments (6 Domains Progress)
                                  </span>
                                  <button
                                    onClick={() => handleGenerateWeeklyIndividual(student.id)}
                                    disabled={generatingWeeklyId === student.id}
                                    className="text-[9.5px] font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded px-2 py-0.5 cursor-pointer"
                                  >
                                    {generatingWeeklyId === student.id ? <Loader2 className="animate-spin inline mr-1" size={9} /> : <Sparkles className="inline mr-1" size={9} />}
                                    Refill AI
                                  </button>
                                </div>

                                <textarea
                                  value={draft?.observationCommentTeacherEdited || draft?.observationCommentAiDraft || ''}
                                  onChange={(e) => {
                                    const key = getSummaryKey(student.id, startDateStr, endDateStr);
                                    const existing = studentDrafts[student.id] || {};
                                    localStorage.setItem(key, JSON.stringify({
                                      ...existing,
                                      observationCommentTeacherEdited: e.target.value
                                    }));
                                    setReloadCounter(p => p + 1);
                                  }}
                                  rows={4}
                                  className="w-full bg-gray-50/50 p-3 rounded-xl border border-gray-200 outline-none focus:bg-white text-xs text-gray-800 leading-relaxed font-serif resize-none"
                                  placeholder="Tuliskan catatan akademik atau generate melalui tombol AI diatas..."
                                />
                                {draft?.observationCommentAiDraft && (draft?.observationCommentTeacherEdited === draft?.observationCommentAiDraft) && (
                                  <span className="text-[8px] bg-sky-50 text-sky-700 border border-sky-100 rounded px-1.5 py-0.5 font-bold tracking-wide">
                                    Original AI Draft Drafted
                                  </span>
                                )}
                              </div>

                            </div>

                            {/* Work snap preview inside workspace */}
                            {draft?.dailySnapshots?.length > 0 && (
                              <div className="bg-white p-3.5 rounded-2xl border border-gray-100 space-y-2">
                                <span className="text-[9.5px] uppercase font-black text-gray-400 tracking-wider block">Preserved Work snaps (Monday - Friday):</span>
                                <div className="grid grid-cols-5 gap-2.5">
                                  {draft.dailySnapshots.map((snap: any, idx: number) => (
                                    <div key={idx} className="bg-gray-50/75 p-2 rounded-xl text-center border border-gray-150 relative">
                                      <span className="block text-[10px] font-black text-gray-700 mb-1 border-b border-gray-200 pb-0.5">{snap.dayKey}</span>
                                      {snap.photoUrl ? (
                                        <div className="w-12 h-12 rounded bg-white border border-gray-250 mx-auto overflow-hidden">
                                          <img src={snap.photoUrl} alt="work piece" className="w-full h-full object-cover" />
                                        </div>
                                      ) : (
                                        <div className="w-12 h-12 bg-white/50 border border-dashed border-gray-200 flex items-center justify-center mx-auto text-[7.5px] text-gray-400 p-0.5">
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
            <div className="flex min-h-screen items-center justify-center p-4 sm:p-6 lg:p-8">
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
                      <h3 className="text-lg font-black tracking-tight">Bulk Import Copy-Paste Komentar</h3>
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
                <div className="p-6 overflow-y-auto space-y-6 flex-1">
                  
                  {/* Step 1: Selection & Format info */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    
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
                            "py-2.5 px-3 rounded-xl font-extrabold text-xs border text-center transition-all cursor-pointer",
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
                            "py-2.5 px-3 rounded-xl font-extrabold text-xs border text-center transition-all cursor-pointer",
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
                    <div className="bg-emerald-50/40 p-4 rounded-2xl border border-emerald-100/80 text-xs text-gray-600 leading-relaxed space-y-1.5">
                      <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider block">Aturan Penulisan Data:</span>
                      <ul className="list-disc pl-4 space-y-1 text-[11px] font-medium text-emerald-900 font-sans">
                        <li>Gunakan format separator <b>pipa (|)</b> atau salin langsung dari <b>Excel / Sheets (Tab)</b>.</li>
                        <li>Format: <code className="bg-emerald-55/20 px-1 py-0.5 rounded text-emerald-800 font-bold">Nama | Komentar</code></li>
                        <li>Contoh baris: <code className="block bg-white border border-emerald-100 text-[10px] p-1 rounded font-mono mt-1 text-gray-500">Alex Setiawan | Ananda Alex menunjukkan perkembangan emosi yang sangat matang pekan ini.</code></li>
                        <li>Sistem otomatis mencocokkan nama dengan daftar siswa aktif kelas saat ini.</li>
                      </ul>
                    </div>

                  </div>

                  {/* Textarea Paste Area */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block font-sans">Area Tempel (Paste Area)</label>
                      {pastedText && (
                        <button 
                          onClick={() => { setPastedText(''); setOverrideMatches({}); }}
                          className="text-[9.5px] font-extrabold text-red-500 hover:text-red-700 bg-red-50 px-2 py-0.5 rounded-lg cursor-pointer transition-colors"
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
                    <div className="space-y-3.5 pt-2">
                      
                      {/* Metric Widgets */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50 p-4 rounded-2xl border border-gray-150">
                        <div className="text-center bg-white p-2.5 rounded-xl border border-gray-100 shadow-sm">
                          <span className="block text-[10px] font-black text-gray-400 uppercase tracking-tight">Total Baris</span>
                          <span className="text-base font-black text-gray-800">{parsedImportRows.length}</span>
                        </div>
                        <div className="text-center bg-green-50/40 p-2.5 rounded-xl border border-green-150 shadow-sm">
                          <span className="block text-[10px] font-black text-green-700 uppercase tracking-tight font-sans">Siap Impor (Cocok)</span>
                          <span className="text-base font-black text-green-700">
                            {parsedImportRows.filter(r => r.status === 'success').length}
                          </span>
                        </div>
                        <div className="text-center bg-yellow-50/50 p-2.5 rounded-xl border border-yellow-250 shadow-sm">
                          <span className="block text-[10px] font-black text-yellow-700 uppercase tracking-tight font-sans">Perlu Perbaikan</span>
                          <span className="text-base font-black text-yellow-700">
                            {parsedImportRows.filter(r => ['multiple_matches', 'not_in_active_class', 'empty_comment'].includes(r.status)).length}
                          </span>
                        </div>
                        <div className="text-center bg-red-50/40 p-2.5 rounded-xl border border-red-150 shadow-sm">
                          <span className="block text-[10px] font-black text-red-600 uppercase tracking-tight font-sans font-extrabold">Tidak Ditemukan</span>
                          <span className="text-base font-black text-red-600">
                            {parsedImportRows.filter(r => ['not_found', 'invalid_format'].includes(r.status)).length}
                          </span>
                        </div>
                      </div>

                      {/* Detail Rows Audit Table */}
                      <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm bg-white max-h-[240px] overflow-y-auto">
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
                              <tr key={row.index} className="hover:bg-gray-50/30 transition-colors">
                                <td className="py-3 px-3 text-center font-bold text-gray-400">
                                  {row.index + 1}
                                </td>
                                <td className="py-3 px-3">
                                  {row.pastedName ? (
                                    <div>
                                      <span className="font-extrabold text-xs text-gray-800">{row.pastedName}</span>
                                      {row.status === 'success' && (
                                        <div className="text-[9.5px] text-gray-400 mt-0.5 leading-none">
                                          ID: {row.matchedStudentId}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-red-400 italic text-[11px] font-bold">Kosong</span>
                                  )}
                                </td>
                                <td className="py-3 px-3 font-sans">
                                  {row.status === 'success' && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-green-700 bg-green-50 border border-green-150 px-2.5 py-0.5 rounded">
                                      ✓ Siswa: {row.matchedStudentName}
                                    </span>
                                  )}
                                  {row.status === 'not_found' && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-red-650 bg-red-50 border border-red-150 px-2.5 py-0.5 rounded">
                                      Siswa Tidak Ditemukan
                                    </span>
                                  )}
                                  {row.status === 'not_in_active_class' && (
                                    <div className="space-y-1.5">
                                      <span className="inline-flex items-center gap-0.5 text-[9.5px] font-extrabold text-yellow-750 bg-yellow-50 border border-yellow-250 px-2 py-0.5 rounded">
                                        Ada di Kelas Lain
                                      </span>
                                      <div className="text-[9.5px] text-gray-500 font-medium leading-none">
                                        Terdaftar di kelas: <b>{row.matchedOutsideClass?.classId || 'Lainnya'}</b>
                                      </div>
                                    </div>
                                  )}
                                  {row.status === 'empty_comment' && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-orange-600 bg-orange-50 border border-orange-150 px-2.5 py-0.5 rounded">
                                      Komentar Kosong
                                    </span>
                                  )}
                                  {row.status === 'invalid_format' && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-gray-500 bg-gray-50 border border-gray-150 px-2.5 py-0.5 rounded">
                                      Format Salah
                                    </span>
                                  )}
                                  {row.status === 'multiple_matches' && (
                                    <div className="space-y-1.5 p-1 bg-teal-50/20 border border-teal-150/40 rounded-lg">
                                      <span className="inline-flex items-center gap-1 text-[9.5px] font-extrabold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded">
                                        Nama Ganda (Multi-match)
                                      </span>
                                      <div className="text-[9px] text-gray-500 font-bold leading-none">Pilih siswa yang tepat:</div>
                                      <div className="flex flex-col gap-1">
                                        {row.possibleMatches?.map((candid: any) => (
                                          <button
                                            key={candid.id}
                                            onClick={() => setOverrideMatches(prev => ({
                                              ...prev,
                                              [row.index]: { id: candid.id, name: candid.name }
                                            }))}
                                            className="text-[9.5px] font-extrabold text-left bg-white hover:bg-emerald-50 text-emerald-800 border border-gray-200 hover:border-emerald-300 rounded px-1.5 py-1 cursor-pointer transition-all leading-tight block w-full"
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
                <div className="bg-gray-50 p-6 border-t border-gray-150 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shrink-0">
                  <div className="text-[10px] text-gray-400 font-bold block">
                    * Data draf aktif akan disimpan untuk periode: <span className="text-emerald-700 font-extrabold">{dateRangeLabel}</span>
                  </div>
                  <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                    <button
                      type="button"
                      onClick={() => setIsImportOpen(false)}
                      className="border border-gray-200 hover:bg-gray-100 text-gray-600 font-extrabold text-xs py-2.5 px-5 rounded-xl transition-all cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveImport}
                      disabled={parsedImportRows.filter(r => r.status === 'success').length === 0}
                      className={cn(
                        "font-extrabold text-xs py-2.5 px-5 rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer",
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
