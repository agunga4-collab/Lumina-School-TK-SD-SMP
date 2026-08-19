import * as React from 'react';
import { motion } from 'motion/react';
import { 
  Smile, Meh, Frown, Angry, AlertCircle, Calendar, ChevronLeft, ChevronRight, 
  Printer, BookOpen, Clock, Heart, ShieldAlert, FileText, ArrowRight, Sparkles, ChevronDown,
  Loader2, CheckCircle2, FileDown, Trash2, Send, RefreshCw, Upload, Archive,
  Image as ImageIcon
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  DEFAULT_STUDENTS, 
  getMonday, 
  formatDateToKey,
  getStoredStudents,
  saveStoredStudents,
  aggregateKGWeeklyReportForPeriod
} from '../../lib/kindergartenWeeklyReport';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, updateDoc, getDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { useAuth } from '../../context/AuthContext';
import { useTeacherAssignedClasses } from '../../hooks/useTeacherAssignedClasses';
import { logFirestoreRead, getKindergartenClasses, getKindergartenStudents, resolveCanonicalClassId } from '../../lib/kindergartenMetadataCache';
import { toast } from 'sonner';
import { html2canvasWithModernColors } from '../../lib/html2canvasPatch';
import { jsPDF } from 'jspdf';

const formatIndonesianDateTime = (val: any) => {
  if (!val) return '';
  const date = val.toDate ? val.toDate() : new Date(val);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }) + ' WIB';
};

export default function WeeklyReview() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const paramClassId = searchParams.get('classId');
  const paramDate = searchParams.get('date');
  const paramStudentId = searchParams.get('studentId');

  const { activeYear } = useAcademicYear();
  const { getGoogleDriveToken } = useAuth();

  const [tkLogoUrl, setTkLogoUrl] = React.useState<string>(() => {
    return localStorage.getItem("weekly_report_tk_logo") || "";
  });

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        localStorage.setItem("weekly_report_tk_logo", base64String);
        setTkLogoUrl(base64String);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLogoReset = () => {
    localStorage.removeItem("weekly_report_tk_logo");
    setTkLogoUrl("");
  };

  const { profile } = useAuth();

  if (profile?.role === 'kindergarten_subject_teacher') {
    return (
      <div className="p-8 text-center">
        <h1 className="text-xl font-bold text-red-600">Akses Ditolak</h1>
        <p className="text-gray-500 mt-2">Anda tidak memiliki izin untuk membuka halaman ini.</p>
      </div>
    );
  }

  // Class Selection states using useTeacherAssignedClasses
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

  // Helper to resolve classId from students within the observations map of an unscoped document
  const getLegacyDocClassId = (observationsField: Record<string, any>, globalStudents: any[]): string | null => {
    if (!observationsField) return null;
    const observationKeys = Object.keys(observationsField);
    for (const key of observationKeys) {
      const foundStudent = globalStudents.find(s => s.id === key || s.oldLuminaId === key || s.nis === key);
      if (foundStudent && foundStudent.classId) {
        return foundStudent.classId;
      }
    }
    return null;
  };

  // Check if a document matches the selected class (including legacy documents)
  const isDocForClass = (
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
  };

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
        console.log('Loading Kindergarten students from Firestore via cache manager for year:', activeYear);
        
        const fetchedStudents = await getKindergartenStudents(activeYear);

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

  const activeClassObj = classes.find(c => c.id === selectedClassId);
  const filteredStudents = React.useMemo(() => {
    if (!selectedClassId || !activeClassObj) {
      return students;
    }
    return students.filter(student => isStudentInClass(student.classId, activeClassObj));
  }, [students, selectedClassId, activeClassObj]);

  const [selectedStudentId, setSelectedStudentId] = React.useState<string>(paramStudentId || '');

  React.useEffect(() => {
    if (filteredStudents.length > 0) {
      const exists = filteredStudents.some(s => s.id === selectedStudentId);
      if (!exists) {
        setSelectedStudentId(filteredStudents[0].id);
      }
    }
  }, [filteredStudents, selectedStudentId]);

  const [resolvedSignatureUrl, setResolvedSignatureUrl] = React.useState<string | null>(null);
  const [resolvedTeacherName, setResolvedTeacherName] = React.useState<string | null>(null);
  const [isSignatureLoading, setIsSignatureLoading] = React.useState<boolean>(false);

  React.useEffect(() => {
    let active = true;
    const currentStudentObj = students.find(s => s.id === selectedStudentId);
    const studentClassIdRaw = currentStudentObj?.classId || selectedClassId || "";
    const studentCanonicalClassId = resolveCanonicalClassId(studentClassIdRaw, classes) || studentClassIdRaw;

    if (!studentCanonicalClassId) {
      setResolvedSignatureUrl(null);
      setResolvedTeacherName(null);
      return;
    }

    async function fetchClassSignature() {
      setIsSignatureLoading(true);
      try {
        const classRef = doc(db, 'classes', studentCanonicalClassId);
        const classSnap = await getDoc(classRef);
        logFirestoreRead('classes', 1);
        
        if (classSnap.exists() && active) {
          const data = classSnap.data();
          setResolvedSignatureUrl(data.teacherSignatureUrl || null);
          setResolvedTeacherName(data.homeroomTeacherName || null);
        } else if (active) {
          const fallbackClass = classes.find(c => c.id === studentCanonicalClassId) || activeClassObj;
          setResolvedSignatureUrl(fallbackClass?.teacherSignatureUrl || null);
          setResolvedTeacherName(fallbackClass?.homeroomTeacherName || null);
        }
      } catch (err) {
        console.error("Error fetching class signature from Firestore:", err);
        if (active) {
          const fallbackClass = classes.find(c => c.id === studentCanonicalClassId) || activeClassObj;
          setResolvedSignatureUrl(fallbackClass?.teacherSignatureUrl || null);
          setResolvedTeacherName(fallbackClass?.homeroomTeacherName || null);
        }
      } finally {
        if (active) {
          setIsSignatureLoading(false);
        }
      }
    }

    fetchClassSignature();

    return () => {
      active = false;
    };
  }, [selectedStudentId, selectedClassId, students, classes, activeClassObj]);

  // Load start and end date from sessionStorage or use current week's Mon-Fri
  const [startDateStr, setStartDateStr] = React.useState<string>(() => {
    if (paramDate) {
      const parsed = new Date(paramDate);
      if (!isNaN(parsed.getTime())) {
        const mon = getMonday(parsed);
        return formatDateToKey(mon);
      }
    }
    const fromSession = sessionStorage.getItem('kindy_report_start');
    if (fromSession) return fromSession;
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
    const fromSession = sessionStorage.getItem('kindy_report_end');
    if (fromSession) return fromSession;
    const mon = getMonday(new Date());
    const fri = new Date(mon);
    fri.setDate(mon.getDate() + 4);
    return formatDateToKey(fri);
  });

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
        console.log(`[WeeklyReview Firestore Sync] Fetching for class ${selectedClassId} from ${startDateStr} to ${endDateStr}`);

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
          console.warn("[WeeklyReview] Attendance query list permission denied or failed, trying getDoc fallback.", err);
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
            console.error("[WeeklyReview] Error calculating dates in range:", e);
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
          console.warn("[WeeklyReview] Observations list query fell back to empty due to potential rules limits/permissions:", err);
        }

        // 3. Fetch Daily Contexts
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
          console.warn("[WeeklyReview] Daily contexts query fell back or failed:", err);
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
            console.error("[WeeklyReview] Fallback daily context loading failed:", fallbackErr);
          }
        }

        if (active) {
          setFirestoreAttendance(fetchedAtt);
          setFirestoreObservations(fetchedObs);
          setFirestoreDailyContexts(fetchedContexts);
          console.log(`[WeeklyReview Firestore Sync] Set ${fetchedAtt.length} attendance docs, ${fetchedObs.length} observations, and ${fetchedContexts.length} daily contexts`);
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

    if (isRestrictedToAssignedClasses && classes.length === 0 && !isLoadingClasses) {
    return (
      <div className="max-w-4xl mx-auto space-y-8 pb-20 px-4 md:px-0 font-sans">
        {/* 1. TOPBAR CONTROLS */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-[2rem] border border-gray-150 shadow-sm">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-black uppercase tracking-wider">Tahap 2</span>
              <span className="text-xs text-gray-400 font-bold">Pratinjau Rapor Laporan Mingguan</span>
            </div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight font-sans">Weekly Review & PDF Report</h1>
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

  return () => {
      active = false;
    };
  }, [selectedClassId, startDateStr, endDateStr]);

  const [classTheme, setClassTheme] = React.useState<string>('');
  const [classWeek, setClassWeek] = React.useState<string>('');

  React.useEffect(() => {
    if (!selectedClassId) {
      setClassTheme('');
      setClassWeek('');
      return;
    }

    let active = true;
    async function fetchClassThemeAndWeek() {
      let loadedTheme = '';
      let loadedWeek = '';

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
          console.error('Error fetching class theme/week:', err);
        }
      }

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

      if (active) {
        setClassTheme(loadedTheme);
        setClassWeek(loadedWeek);
      }
    }

    fetchClassThemeAndWeek();

    return () => {
      active = false;
    };
  }, [selectedClassId, startDateStr, endDateStr]);

  const [loadedDraft, setLoadedDraft] = React.useState<any | null>(null);
  const [isFetchingDraft, setIsFetchingDraft] = React.useState(false);

   const [teacherNip, setTeacherNip] = React.useState<string>(() => {
    return localStorage.getItem('kg_teacher_nip') || '';
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

  // Sync date ranges to sessionStorage when changed
  React.useEffect(() => {
    sessionStorage.setItem('kindy_report_start', startDateStr);
    sessionStorage.setItem('kindy_report_end', endDateStr);
  }, [startDateStr, endDateStr]);

  // Load the draft based on selected student and custom period
  React.useEffect(() => {
    if (!selectedStudentId) {
      setLoadedDraft(null);
      return;
    }

    let active = true;

    async function loadStudentDraft() {
      setIsFetchingDraft(true);
      try {
        let savedParsed: any = null;

        // A. Primary: Try to fetch from Firestore weekly_summary_drafts
        const docId = `${selectedStudentId}_${startDateStr}_${endDateStr}`;
        const docRef = doc(db, 'weekly_summary_drafts', docId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists() && active) {
          const data = docSnap.data();
          savedParsed = {
            ...data,
            attendanceCommentTeacherEdited: data.socialEmotional || data.attendanceCommentTeacherEdited || '',
            observationCommentTeacherEdited: data.weeklyComments || data.observationCommentTeacherEdited || ''
          };
          console.log('[WeeklyReview Firestore Sync] Successfully loaded draft from Firestore database!');
        } else {
          // B. Secondary (Fallback): Try local storage
          const summaryKey = `kg_weekly_summary_${selectedStudentId}_${startDateStr}_${endDateStr}`;
          const savedSummary = localStorage.getItem(summaryKey);

          if (savedSummary) {
            try {
              savedParsed = JSON.parse(savedSummary);
            } catch (e) {
              console.error('Error parsing loaded summary draft:', e);
            }
          } else {
            // C. Tertiary (Fallback): Backwards compatibility fallback strategy (using standard weekKey)
            const mon = new Date(startDateStr);
            const startMon = getMonday(mon);
            const firstDay = new Date(startMon.getFullYear(), startMon.getMonth(), 1);
            const firstMon = getMonday(firstDay);
            const weekDiff = Math.floor((startMon.getTime() - firstMon.getTime()) / (7 * 24 * 60 * 60 * 1000));
            const weekNumber = Math.max(1, weekDiff + 1);
            const weekKey = `${startMon.getFullYear()}_W${weekNumber}`;
            const legacyKey = `kg_weekly_report_${selectedStudentId}_${weekKey}`;
            const savedLegacy = localStorage.getItem(legacyKey);

            if (savedLegacy) {
              try {
                savedParsed = JSON.parse(savedLegacy);
              } catch (e) {
                console.error('Error parsing legacy draft:', e);
              }
            }
          }
        }

        // Always fetch latest real-time checklist and observation telemetry and merge
        const liveData = aggregateKGWeeklyReportForPeriod(
          selectedStudentId, 
          startDateStr, 
          endDateStr,
          firestoreAttendance,
          firestoreObservations,
          students,
          firestoreDailyContexts,
          classes
        );
        const studentObj = students.find(s => s.id === selectedStudentId);
        
        const merged = {
          ...liveData,
          ...savedParsed,
          studentName: studentObj ? studentObj.name : (savedParsed?.studentName || liveData.studentName || 'Siswa'),
          classGroup: activeClassObj ? activeClassObj.name : (savedParsed?.classGroup || liveData.classGroup || ''),
          // Ensure live-aggregated statistics are always dynamically updated
          attendanceSummary: liveData.attendanceSummary,
          weeklyObservationItems: liveData.weeklyObservationItems,
          groupedObservationSummary: liveData.groupedObservationSummary,
          dailySnapshots: liveData.dailySnapshots,
        };

        if (active) {
          setLoadedDraft(merged);
        }
      } catch (err) {
        console.error("Error loading/aggregating draft for period:", err);
      } finally {
        if (active) {
          setIsFetchingDraft(false);
        }
      }
    }

    loadStudentDraft();

    return () => {
      active = false;
    };
  }, [selectedStudentId, startDateStr, endDateStr, students, activeClassObj, firestoreAttendance, firestoreObservations]);

  const [publishedReports, setPublishedReports] = React.useState<any[]>([]);
  const [archivedReports, setArchivedReports] = React.useState<any[]>([]);
  const [publishedSubTab, setPublishedSubTab] = React.useState<'READY_TO_SEND' | 'SENT' | 'ARCHIVED'>('READY_TO_SEND');
  
  const [archiveModalOpen, setArchiveModalOpen] = React.useState(false);
  const [reportToArchive, setReportToArchive] = React.useState<any | null>(null);
  const [archiveReason, setArchiveReason] = React.useState('');
  const [isArchiving, setIsArchiving] = React.useState(false);
  const [expandedReasons, setExpandedReasons] = React.useState<Record<string, boolean>>({});

  const [sendConfirmModalOpen, setSendConfirmModalOpen] = React.useState(false);
  const [reportToSend, setReportToSend] = React.useState<any | null>(null);
  const [isSending, setIsSending] = React.useState(false);

  const [isPublishing, setIsPublishing] = React.useState(false);

  const [publishedClassFilter, setPublishedClassFilter] = React.useState<string>('ALL');
  const [publishedSearchQuery, setPublishedSearchQuery] = React.useState<string>('');

  const [imageRatios, setImageRatios] = React.useState<Record<string, 'landscape' | 'portrait'>>({});
  const [imageErrors, setImageErrors] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    setImageErrors({});
    setImageRatios({});
  }, [selectedStudentId, startDateStr]);

  const getPeriodLabel = React.useCallback((report: any) => {
    const weekVal = report.week ? String(report.week).trim() : '';
    const dateRange = `${report.startDate} s/d ${report.endDate}`;
    if (!weekVal) return dateRange;
    if (weekVal.toLowerCase().includes('pekan') || weekVal.toLowerCase().includes('week')) {
      return `${weekVal} (${dateRange})`;
    }
    return `Pekan ${weekVal} (${dateRange})`;
  }, []);

  const uniquePublishedClasses = React.useMemo(() => {
    const map = new Map<string, string>();
    publishedReports.forEach(r => {
      if (r.classId) {
        map.set(r.classId, r.className || 'Unknown');
      } else if (r.className) {
        map.set(r.className, r.className);
      }
    });
    classes.forEach(c => {
      map.set(c.id, c.name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [publishedReports, classes]);

  const filteredPublishedReports = React.useMemo(() => {
    return publishedReports.filter(report => {
      const expectedStatus = publishedSubTab === 'READY_TO_SEND' ? 'ready_to_send' : 'sent';
      if (report.status !== expectedStatus) {
        return false;
      }
      if (publishedClassFilter !== 'ALL' && report.classId !== publishedClassFilter && report.className !== publishedClassFilter) {
        return false;
      }
      if (publishedSearchQuery.trim()) {
        const q = publishedSearchQuery.toLowerCase();
        const studentNameMatches = report.studentName?.toLowerCase().includes(q);
        const classNameMatches = report.className?.toLowerCase().includes(q);
        const weekMatches = report.week && String(report.week).toLowerCase().includes(q);
        if (!studentNameMatches && !classNameMatches && !weekMatches) {
          return false;
        }
      }
      return true;
    });
  }, [publishedReports, publishedSubTab, publishedClassFilter, publishedSearchQuery]);

  const filteredArchivedReports = React.useMemo(() => {
    return archivedReports.filter(report => {
      if (publishedClassFilter !== 'ALL' && report.classId !== publishedClassFilter && report.className !== publishedClassFilter) {
        return false;
      }
      if (publishedSearchQuery.trim()) {
        const q = publishedSearchQuery.toLowerCase();
        const studentNameMatches = report.studentName?.toLowerCase().includes(q);
        const classNameMatches = report.className?.toLowerCase().includes(q);
        const weekMatches = report.week && String(report.week).toLowerCase().includes(q);
        if (!studentNameMatches && !classNameMatches && !weekMatches) {
          return false;
        }
      }
      return true;
    });
  }, [archivedReports, publishedClassFilter, publishedSearchQuery]);

  const readyToSendReportsCount = React.useMemo(() => {
    return publishedReports.filter(r => r.status === 'ready_to_send').length;
  }, [publishedReports]);

  const sentReportsCount = React.useMemo(() => {
    return publishedReports.filter(r => r.status === 'sent').length;
  }, [publishedReports]);

  const groupedPublishedReports = React.useMemo(() => {
    const groups: { [key: string]: { label: string; startDate: string; reports: any[] } } = {};
    
    filteredPublishedReports.forEach(report => {
      const label = getPeriodLabel(report);
      const key = `${report.startDate}_${report.endDate}_${report.week || ''}`;
      if (!groups[key]) {
        groups[key] = {
          label,
          startDate: report.startDate || '',
          reports: []
        };
      }
      groups[key].reports.push(report);
    });
    
    return Object.values(groups).sort((a, b) => b.startDate.localeCompare(a.startDate));
  }, [filteredPublishedReports, getPeriodLabel]);

  const groupedArchivedReports = React.useMemo(() => {
    const groups: { [key: string]: { label: string; startDate: string; reports: any[] } } = {};
    
    filteredArchivedReports.forEach(report => {
      const label = getPeriodLabel(report);
      const key = `${report.startDate}_${report.endDate}_${report.week || ''}`;
      if (!groups[key]) {
        groups[key] = {
          label,
          startDate: report.startDate || '',
          reports: []
        };
      }
      groups[key].reports.push(report);
    });
    
    return Object.values(groups).sort((a, b) => b.startDate.localeCompare(a.startDate));
  }, [filteredArchivedReports, getPeriodLabel]);

  const fetchPublishedReports = React.useCallback(async () => {
    try {
      const q = query(
        collection(db, 'published_kg_reports'),
        where('academicYear', '==', activeYear)
      );
      const snap = await getDocs(q);
      const list = snap.docs.map(docSnap => {
        const data = docSnap.data();
        let status = data.status;
        if (!status || status === 'published' || status === 'PUBLISHED') {
          status = data.sentToParent ? 'sent' : 'ready_to_send';
        }
        return {
          id: docSnap.id,
          ...data,
          status
        };
      }).sort((a: any, b: any) => b.publishedAt - a.publishedAt);
      
      setPublishedReports(list);

      // Background self-healing audit for legacy records to align physical DB states
      const legacyDocs = snap.docs.filter(docSnap => {
        const data = docSnap.data();
        return !data.status || data.status === 'published' || data.status === 'PUBLISHED';
      });

      if (legacyDocs.length > 0) {
        console.log(`[Audit] Found ${legacyDocs.length} legacy Kindergarten reports. Performing status alignment.`);
        for (const docSnap of legacyDocs) {
          const data = docSnap.data();
          const targetStatus = data.sentToParent ? 'sent' : 'ready_to_send';
          try {
            await updateDoc(doc(db, 'published_kg_reports', docSnap.id), {
              status: targetStatus
            });
            console.log(`[Audit] Successfully corrected Firestore report ID ${docSnap.id} to status: "${targetStatus}"`);
          } catch (auditErr) {
            console.error(`[Audit] Failed to correct report ID ${docSnap.id}:`, auditErr);
          }
        }
      }
    } catch (err) {
      console.error("Error fetching published reports:", err);
    }
  }, [activeYear]);

  const fetchArchivedReports = React.useCallback(async () => {
    try {
      const q = query(
        collection(db, 'archived_kg_reports'),
        where('academicYear', '==', activeYear)
      );
      const snap = await getDocs(q);
      const list = snap.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      })).sort((a: any, b: any) => {
        const atA = a.archivedAt?.seconds ? a.archivedAt.seconds * 1000 : (Number(a.archivedAt) || 0);
        const atB = b.archivedAt?.seconds ? b.archivedAt.seconds * 1000 : (Number(b.archivedAt) || 0);
        return atB - atA;
      });
      setArchivedReports(list);
    } catch (err) {
      console.error("Error fetching archived reports:", err);
    }
  }, [activeYear]);

  React.useEffect(() => {
    fetchPublishedReports();
    fetchArchivedReports();
  }, [fetchPublishedReports, fetchArchivedReports]);

  const handlePrint = () => {
    window.print();
  };

  const handlePrevWeek = () => {
    try {
      const s = new Date(startDateStr);
      const e = new Date(endDateStr);
      s.setDate(s.getDate() - 7);
      e.setDate(e.getDate() - 7);
      setStartDateStr(formatDateToKey(s));
      setEndDateStr(formatDateToKey(e));
    } catch (err) {
      console.error(err);
    }
  };

  const handleNextWeek = () => {
    try {
      const s = new Date(startDateStr);
      const e = new Date(endDateStr);
      s.setDate(s.getDate() + 7);
      e.setDate(e.getDate() + 7);
      setStartDateStr(formatDateToKey(s));
      setEndDateStr(formatDateToKey(e));
    } catch (err) {
      console.error(err);
    }
  };

  const handlePublish = async () => {
    if (!loadedDraft) {
      toast.error("Laporan mingguan siswa belum siap.");
      return;
    }
    
    setIsPublishing(true);
    try {
      // 1. Authorize list (opens Google Drive permissions popup if not loaded yet)
      toast.loading("Menghubungkan ke Google Drive...", { id: "publish-kg" });
      const token = await getGoogleDriveToken();
      if (!token) {
        toast.dismiss("publish-kg");
        toast.error("Gagal mendapatkan akses Google Drive.");
        setIsPublishing(false);
        return;
      }

      // 2. Locate report container pages
      toast.loading("Membuat file PDF dari laporan...", { id: "publish-kg" });
      const page1Element = document.getElementById("weekly-report-page-1");
      const page2Element = document.getElementById("weekly-report-page-2");
      if (!page1Element || !page2Element) {
        toast.dismiss("publish-kg");
        toast.error("Elemen halaman laporan tidak lengkap.");
        setIsPublishing(false);
        return;
      }

      // 3. Render pages to Canvas & PDF
      const canvas1 = await html2canvasWithModernColors(page1Element, {
        scale: 2,
        useCORS: true,
        logging: false,
        windowWidth: 1200,
        windowHeight: 1600,
        onclone: (clonedDoc, clonedElement) => {
          if (clonedElement) {
            clonedElement.style.fontFamily = '"Inter", sans-serif';
            clonedElement.style.width = '794px';
            clonedElement.style.height = '1123px';
            clonedElement.style.minWidth = '794px';
            clonedElement.style.minHeight = '1123px';
            clonedElement.style.maxWidth = '794px';
            clonedElement.style.maxHeight = '1123px';
            clonedElement.style.boxSizing = 'border-box';
          }
        }
      });

      const canvas2 = await html2canvasWithModernColors(page2Element, {
        scale: 2,
        useCORS: true,
        logging: false,
        windowWidth: 1200,
        windowHeight: 1600,
        onclone: (clonedDoc, clonedElement) => {
          if (clonedElement) {
            clonedElement.style.fontFamily = '"Inter", sans-serif';
            clonedElement.style.width = '794px';
            clonedElement.style.height = '1123px';
            clonedElement.style.minWidth = '794px';
            clonedElement.style.minHeight = '1123px';
            clonedElement.style.maxWidth = '794px';
            clonedElement.style.maxHeight = '1123px';
            clonedElement.style.boxSizing = 'border-box';
          }
        }
      });

      const imgData1 = canvas1.toDataURL('image/jpeg', 0.8);
      const imgData2 = canvas2.toDataURL('image/jpeg', 0.8);

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      // Page 1
      pdf.addImage(imgData1, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
      
      // Page 2
      pdf.addPage();
      pdf.addImage(imgData2, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
      
      const pdfBlob = pdf.output('blob');

      // 4. Transform blob to base64
      const getBase64 = (blob: Blob): Promise<string> => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onload = () => {
            const base64String = (reader.result as string).split(',')[1];
            resolve(base64String);
          };
          reader.onerror = error => reject(error);
        });
      };

      const base64Data = await getBase64(pdfBlob);

      // 5. Config Name: Periode - Nama Siswa - Nama Kelas - Weekly Report
      const filename = `${startDateStr} s.d ${endDateStr} - ${loadedDraft.studentName} - ${activeClassObj?.name || 'Class'} - Weekly Report.pdf`;

      toast.loading("Mengunggah PDF ke Shared Drive Sekolah...", { id: "publish-kg" });

      const boundary = 'foo_bar_boundary';
      const delimiter = `\r\n--${boundary}\r\n`;
      const close_delim = `\r\n--${boundary}--`;

      const metadata = {
        name: filename,
        mimeType: 'application/pdf',
        parents: ['1IBy2Ly_h72v3znKod3rXLLgx1IaeoGqO'],
      };

      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/pdf\r\n' +
        'Content-Transfer-Encoding: base64\r\n\r\n' +
        base64Data +
        close_delim;

      // Make direct Google Drive multipart/related file creation call (supportsAllDrives is critical for Shared Drives)
      const driveResponse = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body: multipartRequestBody,
        }
      );

      if (!driveResponse.ok) {
        const errText = await driveResponse.text();
        throw new Error(`Google Drive API returned status ${driveResponse.status}: ${errText}`);
      }

      const driveData = await driveResponse.json();
      const driveFileId = driveData.id || '';
      const driveFileUrl = driveFileId ? `https://drive.google.com/file/d/${driveFileId}/view` : '';

      toast.loading("Menyimpan arsip publikasi...", { id: "publish-kg" });

      const attPresent = (finalAttendance.happy || 0) + (finalAttendance.sad || 0) + (finalAttendance.angry || 0) + (finalAttendance.ok || 0);
      const attSick = finalAttendance.sick || 0;
      const attPermission = finalAttendance.izin || 0;
      const attAbsentWithoutNotice = finalAttendance.noNews || 0;
      const attTotalSchoolDays = attPresent + attSick + attPermission + attAbsentWithoutNotice;

      const getDayDateStr = (mondayStr: string, addDays: number): string => {
        try {
          const d = new Date(mondayStr);
          d.setDate(d.getDate() + addDays);
          const yr = d.getFullYear();
          const mo = String(d.getMonth() + 1).padStart(2, '0');
          const da = String(d.getDate()).padStart(2, '0');
          return `${yr}-${mo}-${da}`;
        } catch (e) {
          return '';
        }
      };

      const buildDayDocumentation = (dayKey: string, addDays: number, dayNameEn: string) => {
        const snap = finalSnapshots?.find((s: any) => s.dayKey?.toUpperCase() === dayKey.toUpperCase());
        const captionVal = getCaptionForDay(dayKey);
        
        const items = (loadedDraft?.weeklyObservationItems || []).filter((item: any) => {
          const itemDay = item.dayLabel || '';
          return itemDay.toUpperCase() === dayKey.toUpperCase() || 
                 (dayKey === 'MONDAY' && (itemDay === 'Monday' || itemDay === 'Senin')) ||
                 (dayKey === 'TUESDAY' && (itemDay === 'Tuesday' || itemDay === 'Selasa')) ||
                 (dayKey === 'WEDNESDAY' && (itemDay === 'Wednesday' || itemDay === 'Rabu')) ||
                 (dayKey === 'THURSDAY' && (itemDay === 'Thursday' || itemDay === 'Kamis')) ||
                 (dayKey === 'FRIDAY' && (itemDay === 'Friday' || itemDay === 'Jumat'));
        });
        
        const activities = items.map((i: any) => i.activity).filter(Boolean);
        const activityName = activities.length > 0 ? Array.from(new Set(activities)).join(', ') : null;
        
        const rawUrls: string[] = [];
        if (snap?.photoUrl) {
          rawUrls.push(snap.photoUrl);
        }
        items.forEach((item: any) => {
          if (item.photoUrl) rawUrls.push(item.photoUrl);
          if (item.generalPhotoUrl) rawUrls.push(item.generalPhotoUrl);
        });
        const imageUrls = Array.from(new Set(rawUrls)).filter(Boolean);
        const imageUrl = imageUrls.length > 0 ? imageUrls[0] : null;

        const hasDocumentation = imageUrls.length > 0 || (captionVal !== null && captionVal.trim() !== '');

        return {
          date: getDayDateStr(startDateStr, addDays),
          dayLabel: dayNameEn,
          activityName: hasDocumentation ? (activityName || null) : null,
          caption: hasDocumentation ? (captionVal || null) : null,
          imageUrl: hasDocumentation ? (imageUrl || null) : null,
          imageUrls: hasDocumentation ? imageUrls : [],
          hasDocumentation
        };
      };

      const reportPayload = {
        classId: selectedClassId,
        className: activeClassObj?.name || 'Unknown Class',
        academicYear: activeYear,
        studentId: selectedStudentId,
        studentName: loadedDraft.studentName,
        startDate: startDateStr,
        endDate: endDateStr,
        theme: finalTheme,
        week: finalWeek,
        weeklyComments: finalWeeklyComments,
        socialEmotional: finalSocialEmotional,
        publishedAt: Date.now(),
        driveFileId,
        driveFileUrl,

        // Metadata publisher
        publishedBy: profile?.uid || 'Unknown',
        publishedByEmail: profile?.email || 'Unknown',
        status: 'ready_to_send',

        // Snapshot data
        reportSnapshot: {
          version: 1,
          createdAt: Date.now(),

          student: {
            id: selectedStudentId,
            name: loadedDraft.studentName,
            classId: selectedClassId,
            className: activeClassObj?.name || 'Unknown Class'
          },

          period: {
            startDate: startDateStr,
            endDate: endDateStr,
            month: loadedDraft?.monthLabel || formattedMonth || '',
            weekLabel: String(finalWeek),
            theme: finalTheme
          },

          weeklyComments: finalWeeklyComments,
          socialEmotionalComment: finalSocialEmotional,

          attendanceSummary: {
            present: attPresent,
            sick: attSick,
            permission: attPermission,
            absentWithoutNotice: attAbsentWithoutNotice,
            totalSchoolDays: attTotalSchoolDays
          },

          moodSummary: {
            happy: finalAttendance.happy || 0,
            okay: finalAttendance.ok || 0,
            sad: finalAttendance.sad || 0,
            angry: finalAttendance.angry || 0,
            other: finalAttendance.earlyLeave || 0
          },

          dailyDocumentation: {
            monday: buildDayDocumentation('MONDAY', 0, 'Monday'),
            tuesday: buildDayDocumentation('TUESDAY', 1, 'Tuesday'),
            wednesday: buildDayDocumentation('WEDNESDAY', 2, 'Wednesday'),
            thursday: buildDayDocumentation('THURSDAY', 3, 'Thursday'),
            friday: buildDayDocumentation('FRIDAY', 4, 'Friday')
          }
        }
      };
      
      await addDoc(collection(db, 'published_kg_reports'), reportPayload);
      toast.success(`PDF berhasil dibuat & disimpan sebagai draft untuk ${loadedDraft.studentName}! 🎉`, { id: "publish-kg" });
      
      await fetchPublishedReports();
    } catch (err: any) {
      console.error("Error publishing report:", err);
      toast.dismiss("publish-kg");
      toast.error(`Gagal mempublikasikan laporan: ${err.message}`);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDeletePublished = async (reportId: string, name: string) => {
    if (window.confirm(`Apakah Anda yakin ingin menghapus arsip publikasi untuk ${name}?`)) {
      try {
        await deleteDoc(doc(db, 'published_kg_reports', reportId));
        toast.success(`Arsip publikasi untuk ${name} berhasil dihapus.`);
        fetchPublishedReports();
      } catch (err: any) {
        toast.error(`Gagal menghapus arsip: ${err.message}`);
      }
    }
  };

  const handleArchiveReport = async () => {
    if (!reportToArchive || !archiveReason.trim()) return;
    setIsArchiving(true);
    const toastId = toast.loading("Sedang mengarsipkan laporan...");
    try {
      const batch = writeBatch(db);
      
      const newArchivedRef = doc(db, 'archived_kg_reports', reportToArchive.id);
      const originalRef = doc(db, 'published_kg_reports', reportToArchive.id);
      
      const archivePayload = {
        ...reportToArchive,
        originalReportId: reportToArchive.id,
        archivedAt: serverTimestamp(),
        archivedBy: profile?.uid || 'Unknown',
        archivedByEmail: profile?.email || 'Unknown',
        archiveReason: archiveReason.trim(),
        archiveSource: "published_kg_reports",
        archiveVersion: 1
      };
      
      // Remove local UI 'id' property if present to keep Firestore clean
      delete archivePayload.id;
      
      batch.set(newArchivedRef, archivePayload);
      batch.delete(originalRef);
      
      await batch.commit();
      
      toast.success("Laporan berhasil diarsipkan! 🎉", { id: toastId });
      setArchiveModalOpen(false);
      setReportToArchive(null);
      setArchiveReason('');
      
      fetchPublishedReports();
      fetchArchivedReports();
    } catch (err: any) {
      console.error("Error archiving report:", err);
      toast.error(`Gagal mengarsipkan laporan: ${err.message}`, { id: toastId });
    } finally {
      setIsArchiving(false);
    }
  };

  const handleConfirmSendToParent = async () => {
    if (!reportToSend) return;
    setIsSending(true);
    const toastId = toast.loading("Mengirim laporan ke akun orang tua...");
    try {
      await updateDoc(doc(db, 'published_kg_reports', reportToSend.id), {
        status: 'sent',
        sentToParent: true,
        sentAt: Date.now(),
        sentBy: profile?.uid || 'Unknown',
        sentByName: profile?.displayName || profile?.email || 'Unknown'
      });
      toast.success(`Weekly Report untuk ${reportToSend.studentName} berhasil dikirim ke orang tua! 🎉`, { id: toastId });
      setSendConfirmModalOpen(false);
      setReportToSend(null);
      fetchPublishedReports();
    } catch (err: any) {
      console.error("Error sending to parent:", err);
      toast.error(`Gagal mengirim laporan: ${err.message}`, { id: toastId });
    } finally {
      setIsSending(false);
    }
  };

  const handleViewAndPrintPublished = (report: any) => {
    setSelectedClassId(report.classId);
    setStartDateStr(report.startDate);
    setEndDateStr(report.endDate);
    setSelectedStudentId(report.studentId);
    
    toast.info(`Memuat laporan untuk ${report.studentName}...`);
    setTimeout(() => {
      window.print();
    }, 500);
  };

  // Compute week
  const computedWeek = React.useMemo(() => {
    try {
      const s = new Date(startDateStr);
      const jan1 = new Date(s.getFullYear(), 0, 1);
      const days = Math.floor((s.getTime() - jan1.getTime()) / (24 * 60 * 60 * 1000));
      return Math.ceil((days + jan1.getDay() + 1) / 7);
    } catch {
      return '18';
    }
  }, [startDateStr]);

  // Safe checks and extracted properties
  const hasDraft = !!loadedDraft;
  const finalWeeklyComments = loadedDraft?.observationCommentTeacherEdited || loadedDraft?.observationCommentAiDraft || loadedDraft?.teacherEditedWeeklyComments || loadedDraft?.aiWeeklyCommentsDraft || '';
  const finalSocialEmotional = loadedDraft?.attendanceCommentTeacherEdited || loadedDraft?.attendanceCommentAiDraft || loadedDraft?.teacherEditedSocialEmotional || loadedDraft?.aiSocialEmotionalDraft || '';
  const finalTheme = (loadedDraft?.theme && loadedDraft.theme.trim() !== '') 
    ? loadedDraft.theme 
    : (classTheme && classTheme.trim() !== '') 
      ? classTheme 
      : 'Tema Belum Ditentukan';
  const finalWeek = (loadedDraft?.week !== undefined && String(loadedDraft.week).trim() !== '') 
    ? loadedDraft.week 
    : (classWeek !== undefined && String(classWeek).trim() !== '') 
      ? classWeek 
      : '';
  const finalSnapshots = loadedDraft?.dailySnapshots || [];
  const finalAttendance = loadedDraft?.attendanceSummary || { happy: 0, sad: 0, angry: 0, ok: 0, noNews: 0, sick: 0, izin: 0, earlyLeave: 0 };
  const finalObsSummary = loadedDraft?.groupedObservationSummary || [];

  // Format Month
  const formattedMonth = React.useMemo(() => {
    try {
      const d = new Date(startDateStr);
      return d.toLocaleDateString('en-US', { month: 'long' });
    } catch {
      return 'May';
    }
  }, [startDateStr]);

  // Format Date range
  const formattedDateRange = React.useMemo(() => {
    try {
      const s = new Date(startDateStr);
      const e = new Date(endDateStr);
      const sDay = s.getDate();
      const sMonth = s.toLocaleDateString('en-US', { month: 'short' });
      const eDay = e.getDate();
      const eMonth = e.toLocaleDateString('en-US', { month: 'short' });
      if (sMonth === eMonth) {
        return `${sDay} - ${eDay} ${sMonth}`;
      }
      return `${sDay} ${sMonth} - ${eDay} ${eMonth}`;
    } catch {
      return '18 - 22 May';
    }
  }, [startDateStr, endDateStr]);

  // Format Signature Date label
  const formattedSignDate = React.useMemo(() => {
    try {
      const d = new Date(endDateStr);
      const day = d.getDate();
      const month = d.toLocaleDateString('en-US', { month: 'long' });
      const year = d.getFullYear();
      return `DEPOK, ${day} ${month} ${year}`.toUpperCase();
    } catch {
      return 'DEPOK, 22 MAY 2026';
    }
  }, [endDateStr]);

  const getSnapForDay = (dayKey: string) => {
    return finalSnapshots?.find((s: any) => s.dayKey?.toUpperCase() === dayKey.toUpperCase());
  };

  const getCaptionForDay = (dayKey: string) => {
    if (!loadedDraft?.weeklyObservationItems) return null;
    const items = loadedDraft.weeklyObservationItems.filter((item: any) => {
      const itemDay = item.dayLabel || '';
      return itemDay.toUpperCase() === dayKey.toUpperCase() || 
             (dayKey === 'MONDAY' && (itemDay === 'Monday' || itemDay === 'Senin')) ||
             (dayKey === 'TUESDAY' && (itemDay === 'Tuesday' || itemDay === 'Selasa')) ||
             (dayKey === 'WEDNESDAY' && (itemDay === 'Wednesday' || itemDay === 'Rabu')) ||
             (dayKey === 'THURSDAY' && (itemDay === 'Thursday' || itemDay === 'Kamis')) ||
             (dayKey === 'FRIDAY' && (itemDay === 'Friday' || itemDay === 'Jumat'));
    });
    
    if (items.length === 0) return null;
    const notesList = items.map((i: any) => i.notes || i.activity).filter(Boolean);
    if (notesList.length === 0) return null;
    return notesList.join('; ');
  };

  const handleImageLoad = (dayKey: string, event: React.SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget;
    const isPortrait = img.naturalHeight > img.naturalWidth;
    setImageRatios(prev => ({
      ...prev,
      [dayKey]: isPortrait ? 'portrait' : 'landscape'
    }));
  };

  const handleImageError = (dayKey: string) => {
    setImageErrors(prev => ({
      ...prev,
      [dayKey]: true
    }));
  };

  const renderSnapshotCard = (dayKey: string, snap: any) => {
    const isPortrait = imageRatios[dayKey] === 'portrait';
    const hasError = imageErrors[dayKey];
    const caption = getCaptionForDay(dayKey);

    return (
      <div className="border-2 border-[#109E58] rounded-sm overflow-hidden bg-white flex flex-col h-full shadow-sm">
        <div className="bg-[#109E58] text-white text-center flex items-center justify-center h-[23px] font-bold text-[12px] leading-[1.2] tracking-wider uppercase">
          SNAPSHOT – {dayKey}
        </div>
        <div className="p-1.5 flex-1 flex flex-col justify-start bg-white gap-2">
          {snap?.photoUrl && !hasError ? (
            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '160px',
                minHeight: '0',
                backgroundColor: 'white',
                overflow: 'visible',
                padding: '12px',
                boxSizing: 'border-box'
              }}
              className="mx-auto rounded-sm border border-gray-100"
            >
              <img 
                src={snap.photoUrl} 
                alt={`Snapshot ${dayKey}`} 
                onLoad={(e) => handleImageLoad(dayKey, e)}
                onError={() => handleImageError(dayKey)}
                style={{
                  display: 'block',
                  width: 'auto',
                  height: 'auto',
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  objectPosition: 'center',
                }}
                referrerPolicy="no-referrer"
                crossOrigin="anonymous"
              />
            </div>
          ) : (
            <div 
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '160px',
                minHeight: '0',
                backgroundColor: '#f9fafb',
              }}
              className="mx-auto border border-dashed border-gray-200 p-2 text-center rounded-sm"
            >
              <ImageIcon className="w-5 h-5 text-gray-400 mb-1" />
              <span className="text-[10px] text-gray-500 font-bold leading-tight">Dokumentasi belum tersedia</span>
              <span className="text-[8.5px] text-gray-400 font-medium leading-tight mt-0.5 max-w-[130px]">
                Foto kegiatan untuk kelas ini belum diunggah atau tidak dapat dimuat.
              </span>
            </div>
          )}
          
          <div className="min-h-[26px] px-2 py-[5px] flex items-center justify-center">
            {caption && caption.trim() !== '' ? (
              <p className="text-[10.5px] leading-[1.3] text-gray-600 italic font-medium text-center line-clamp-2" title={caption}>
                {caption}
              </p>
            ) : (
              <span className="text-[9.5px] text-gray-300 italic">-</span>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (isRestrictedToAssignedClasses && classes.length === 0 && !isLoadingClasses) {
    return (
      <div className="max-w-4xl mx-auto space-y-8 pb-20 px-4 md:px-0 font-sans">
        {/* 1. TOPBAR CONTROLS */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-[2rem] border border-gray-150 shadow-sm">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-black uppercase tracking-wider">Tahap 2</span>
              <span className="text-xs text-gray-400 font-bold">Pratinjau Rapor Laporan Mingguan</span>
            </div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight font-sans">Weekly Review & PDF Report</h1>
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
    <div className="max-w-4xl mx-auto space-y-8 pb-20 px-4 md:px-0 font-sans">
      
      {/* 1. TOPBAR CONTROLS (Hidden in Print) */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-[2rem] border border-gray-150 shadow-sm print:hidden">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-black uppercase tracking-wider">Tahap 2</span>
            <span className="text-xs text-gray-400 font-bold">Pratinjau Rapor Laporan Mingguan</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Weekly Report Final View</h1>
        </div>

        {hasDraft && (
          <div className="flex flex-col gap-2.5 shrink-0 w-full md:w-auto">
            <div className="flex flex-wrap gap-2.5">
              <button 
                onClick={handlePrint}
                className="flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-extrabold text-xs px-5 py-3.5 rounded-2xl transition-all active:scale-95 cursor-pointer flex-1 md:flex-initial"
              >
                <Printer size={14} />
                Cetak Langsung
              </button>
              <button 
                onClick={handlePublish}
                disabled={isPublishing}
                className="flex items-center justify-center gap-2 bg-[#109E58] hover:bg-emerald-700 text-white font-extrabold text-xs px-5 py-3.5 rounded-2xl shadow-lg transition-all active:scale-95 cursor-pointer flex-1 md:flex-initial disabled:opacity-50"
              >
                {isPublishing ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    Memproses...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={13} />
                    Buat PDF & Simpan Draft
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 bg-emerald-50/50 border border-emerald-100/85 p-2.5 rounded-2xl text-left">
              <div className="flex-1">
                <p className="text-[10px] font-black text-emerald-850 uppercase tracking-wider">Logo Rapor TK</p>
                <p className="text-[9px] text-gray-550 font-medium">Format persegi panjang</p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <label className="flex items-center gap-1 bg-white hover:bg-gray-50 text-gray-700 font-bold text-[10px] px-2.5 py-1.5 rounded-lg border border-gray-200 cursor-pointer transition-all">
                  <Upload size={10} className="text-emerald-600" />
                  Upload Logo
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleLogoUpload} 
                    className="hidden" 
                  />
                </label>
                {tkLogoUrl && (
                  <button 
                    onClick={handleLogoReset}
                    className="flex items-center gap-1 bg-red-50 hover:bg-red-100 text-red-650 font-bold text-[10px] px-2 py-1.5 rounded-lg border border-red-100 cursor-pointer transition-all"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      {isFetchingFirestore && (
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 text-emerald-955 rounded-3xl p-5 flex items-center justify-between shadow-sm print:hidden">
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
        </div>
      )}

      {/* 2. FILTER & SELECTIONS (Hidden in Print) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 bg-white p-6 rounded-[2rem] border border-gray-150 shadow-sm print:hidden">
        
        {/* Class and Student Selection Block */}
        <div className="lg:col-span-7 space-y-4">
          
          {/* A. Class selection dropdown */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-emerald-700 uppercase tracking-wider block">Pilih Kelas</label>
            <div className="relative">
              <select
                value={selectedClassId}
                onChange={(e) => {
                  setSelectedClassId(e.target.value);
                  setLastSelectedClassId(e.target.value);
                }}
                disabled={isRestrictedToAssignedClasses && classes.length <= 1}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-xs font-bold outline-none text-gray-700 appearance-none pr-8 cursor-pointer hover:bg-gray-100/50 disabled:opacity-75 disabled:cursor-not-allowed"
              >
                {isLoadingClasses ? (
                  <option value="">Memuat kelas...</option>
                ) : classes.length === 0 ? (
                  <option value="">Belum ada kelas</option>
                ) : (
                  classes.map(cls => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name} ({cls.grade || 'K'})
                    </option>
                  ))
                )}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* B. Filtered Students dropdown and navigation */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-emerald-700 uppercase tracking-wider block">Pilih Siswa</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const currentIndex = filteredStudents.findIndex(s => s.id === selectedStudentId);
                  if (currentIndex > 0) {
                    setSelectedStudentId(filteredStudents[currentIndex - 1].id);
                  }
                }}
                disabled={filteredStudents.length <= 1 || filteredStudents.findIndex(s => s.id === selectedStudentId) <= 0}
                className="flex items-center justify-center p-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 hover:text-[#109E58] disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-gray-600 transition-all cursor-pointer shrink-0"
                title="Siswa Sebelumnya"
              >
                <ChevronLeft size={16} />
              </button>

              <div className="relative flex-1">
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-xs font-bold outline-none text-gray-750 appearance-none pr-8 cursor-pointer hover:bg-gray-100/50"
                >
                  {filteredStudents.length === 0 ? (
                    <option value="">Tidak ada siswa terdaftar di kelas ini</option>
                  ) : (
                    filteredStudents.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))
                  )}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>

              <button
                type="button"
                onClick={() => {
                  const currentIndex = filteredStudents.findIndex(s => s.id === selectedStudentId);
                  if (currentIndex !== -1 && currentIndex < filteredStudents.length - 1) {
                    setSelectedStudentId(filteredStudents[currentIndex + 1].id);
                  }
                }}
                disabled={filteredStudents.length <= 1 || filteredStudents.findIndex(s => s.id === selectedStudentId) === -1 || filteredStudents.findIndex(s => s.id === selectedStudentId) >= filteredStudents.length - 1}
                className="flex items-center justify-center p-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 hover:text-[#109E58] disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-gray-600 transition-all cursor-pointer shrink-0"
                title="Siswa Berikutnya"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

        </div>

        {/* Date / Period Controls */}
        <div className="lg:col-span-5 space-y-2 flex flex-col justify-between">
          <div>
            <label className="text-[10px] font-black text-emerald-700 uppercase tracking-wider block">Periode Tanggal Evaluasi</label>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              <input 
                type="date"
                value={startDateStr}
                onChange={(e) => handleStartDateChange(e.target.value)}
                className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold outline-none text-gray-700 cursor-pointer"
              />
              <input 
                type="date"
                value={endDateStr}
                onChange={(e) => handleEndDateChange(e.target.value)}
                className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold outline-none text-gray-700 cursor-pointer"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 bg-gray-50 border border-gray-150 rounded-xl p-1 mt-2.5">
            <button
              onClick={handlePrevWeek}
              className="p-1 px-2 hover:bg-white rounded-lg text-gray-500 hover:text-emerald-800 transition-all cursor-pointer"
              title="7 Hari Sebelumnya"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex-1 text-center text-[10.5px] font-black text-gray-600 uppercase">
              Minggu Lompat Pekan
            </div>
            <button
              onClick={handleNextWeek}
              className="p-1 px-2 hover:bg-white rounded-lg text-gray-500 hover:text-emerald-800 transition-all cursor-pointer"
              title="7 Hari Selanjutnya"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

      </div>

      {/* 3. FALLBACK BLOCK IF DRAFT DOESN'T EXIST */}
      {!hasDraft ? (
        <div className="bg-white rounded-[2rem] border border-gray-150 p-12 text-center space-y-5 shadow-sm print:hidden">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto text-red-550 border border-red-100">
            <AlertCircle size={30} className="text-red-500" />
          </div>

          <div className="space-y-2 max-w-sm mx-auto">
            <h2 className="text-base font-black text-gray-900 uppercase">Weekly Summary belum disiapkan</h2>
            <p className="text-xs text-gray-500 leading-relaxed font-medium">
              Data mingguan dan komentar untuk anak hebat ini belum disiapkan oleh Guru di modul summary. Silakan klik tombol di bawah untuk mengisi data dan komentar.
            </p>
          </div>

          <button 
            onClick={() => navigate('/kindy/weekly-summary')}
            className="inline-flex items-center gap-2 bg-[#109E58] hover:bg-emerald-700 text-white font-black text-xs px-6 py-3.5 rounded-2xl shadow-lg transition-all active:scale-95 cursor-pointer"
          >
            <Sparkles size={14} />
            Buka Halaman Weekly Summary
            <ArrowRight size={14} />
          </button>
        </div>
      ) : (
        /* 4. FORMAL REPORT DOCUMENT PRINTABLE VIEW */
        <div id="formal-weekly-report" className="space-y-6 print:space-y-0 w-full flex flex-col items-center bg-transparent">
          
          <style dangerouslySetInnerHTML={{__html: `
            @media print {
              body {
                background: white !important;
                color: black !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .print-hidden {
                display: none !important;
              }
              #formal-weekly-report {
                background: transparent !important;
                border: none !important;
                box-shadow: none !important;
                padding: 0 !important;
                margin: 0 !important;
                width: 100% !important;
                max-width: 100% !important;
                display: block !important;
              }
              .weekly-report-page {
                border: none !important;
                box-shadow: none !important;
                padding: 0 !important;
                margin: 0 !important;
                width: 100% !important;
                height: 297mm !important;
                max-height: 297mm !important;
                page-break-after: always !important;
                break-after: page !important;
                overflow: hidden !important;
                display: flex !important;
                flex-direction: column !important;
                justify-content: space-between !important;
              }
              @page {
                size: A4 portrait;
                margin: 0.6cm 1cm 0.6cm 1cm;
              }
            }
          `}} />

          {/* PAGE 1 — DOKUMENTASI KEGIATAN MINGGUAN */}
          <div className="weekly-report-page page-1 bg-white px-8 py-4 md:px-12 md:py-6 shadow-sm border border-gray-200 text-gray-950 mx-auto w-full max-w-[794px] min-[794px]:w-[794px] min-[794px]:h-[1123px] min-[794px]:min-h-[1123px] font-sans flex flex-col justify-between gap-3.5 print:border-none print:shadow-none print:p-0 print:m-0" id="weekly-report-page-1">
            
            {/* Lazuardi school design banner */}
            <div className="bg-[#109E58] py-3.5 px-4 text-white relative flex flex-col justify-between rounded-sm">
              {/* Top row with Logo and Title */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-white/20 pb-2.5 mb-2.5 gap-2">
                
                {/* Left Column: Logo & Name */}
                <div className="flex items-center gap-2.5">
                  {tkLogoUrl ? (
                    <img 
                      src={tkLogoUrl} 
                      alt="Logo Rapor" 
                      className="h-12 w-auto object-contain"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <>
                      <div className="bg-white/10 p-1.5 rounded-lg shrink-0">
                        <svg className="w-8 h-8 text-white" viewBox="0 0 100 100" fill="currentColor">
                          <path d="M50 10 C42 35 25 45 10 50 C25 55 42 65 50 90 C58 65 75 55 90 50 C75 45 58 35 50 10 Z" />
                          <path d="M50 25 C45 40 35 48 25 50 C35 52 45 60 50 75 C55 60 65 52 75 50 C65 48 55 40 50 25 Z" fill="#109E58" />
                        </svg>
                      </div>
                      <div className="text-left leading-none">
                        <span className="block font-sans text-base font-black tracking-widest text-white m-0">Lazuardi</span>
                        <span className="block font-sans text-[9px] font-bold tracking-[0.25em] text-emerald-100 m-0 uppercase leading-none mt-0.5">KINDERGARTEN</span>
                        <span className="block font-sans text-[6.5px] text-emerald-200 mt-0.5 uppercase tracking-wider leading-none font-semibold">Global Compassionate School</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Right Column: Large report title */}
                <div className="text-right sm:text-right w-full sm:w-auto flex flex-col items-end justify-center">
                  <span className="block text-[10px] font-sans font-black tracking-widest text-emerald-100 uppercase mb-1">
                    LAZUARDI GCS KINDERGARTEN
                  </span>
                  <h1 className="text-base sm:text-lg font-sans font-black tracking-wider text-white uppercase leading-none mt-1">
                    STUDENT'S WEEKLY REPORT
                  </h1>
                </div>

              </div>

              {/* Bottom row: Student Metadata details grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1.5 gap-x-12 text-[10px] font-sans">
                <div className="space-y-1">
                  <div className="grid grid-cols-12 leading-none">
                    <span className="col-span-4 font-bold text-emerald-100">Student's name</span>
                    <span className="col-span-1 text-emerald-100/70 text-center">:</span>
                    <span className="col-span-7 font-extrabold text-white text-[11px] -mt-0.5">{loadedDraft.studentName}</span>
                  </div>
                  <div className="grid grid-cols-12 leading-none">
                    <span className="col-span-4 font-bold text-emerald-100">Class</span>
                    <span className="col-span-1 text-emerald-100/70 text-center">:</span>
                    <span className="col-span-7 font-bold text-white">
                      {loadedDraft?.classGroup || loadedDraft?.className || (DEFAULT_STUDENTS.find(s => s.id === selectedStudentId)?.ageGroup === 'TK_B' ? 'TK-B Butterfly' : 'TK-A Caterpillar')}
                    </span>
                  </div>
                  <div className="grid grid-cols-12 leading-none">
                    <span className="col-span-4 font-bold text-emerald-100">Theme</span>
                    <span className="col-span-1 text-emerald-100/70 text-center">:</span>
                    <span className="col-span-7 font-bold text-white leading-normal">{finalTheme}</span>
                  </div>
                </div>

                <div className="space-y-1 sm:pl-8">
                  <div className="grid grid-cols-12 leading-none">
                    <span className="col-span-3 font-bold text-emerald-100">Month</span>
                    <span className="col-span-1 text-emerald-100/70 text-center">:</span>
                    <span className="col-span-8 font-bold text-white">{formattedMonth}</span>
                  </div>
                  <div className="grid grid-cols-12 leading-none">
                    <span className="col-span-3 font-bold text-emerald-100">Week</span>
                    <span className="col-span-1 text-emerald-100/70 text-center">:</span>
                    <span className="col-span-8 font-bold text-white">{finalWeek}</span>
                  </div>
                  <div className="grid grid-cols-12 leading-none">
                    <span className="col-span-3 font-bold text-emerald-100">Date</span>
                    <span className="col-span-1 text-emerald-100/70 text-center">:</span>
                    <span className="col-span-8 font-bold text-white">{formattedDateRange}</span>
                  </div>
                </div>
              </div>

            </div>

            {/* Section Banner: WEEKLY ACTIVITY DOCUMENTATION */}
            <div className="border-b border-dashed border-emerald-600 pb-1 mt-1 text-center">
              <h2 className="text-xs font-black text-emerald-800 uppercase tracking-widest">WEEKLY ACTIVITY DOCUMENTATION</h2>
            </div>

            {/* Five snapshot cards */}
            <div className="flex-1 flex flex-col justify-start gap-4 pt-5 pb-2">
              {/* Row 1 & 2: Monday, Tuesday, Wednesday, Thursday */}
              <div className="grid grid-cols-2 gap-4">
                {renderSnapshotCard('MONDAY', getSnapForDay('MONDAY'))}
                {renderSnapshotCard('TUESDAY', getSnapForDay('TUESDAY'))}
                {renderSnapshotCard('WEDNESDAY', getSnapForDay('WEDNESDAY'))}
                {renderSnapshotCard('THURSDAY', getSnapForDay('THURSDAY'))}
              </div>
              
              {/* Row 3: Friday centered with identical width */}
              <div className="w-full flex justify-center">
                <div style={{ width: 'calc((100% - 16px) / 2)' }}>
                  {renderSnapshotCard('FRIDAY', getSnapForDay('FRIDAY'))}
                </div>
              </div>
            </div>

            {/* FOOTER BLOCK: Exact matching of Griya Cinere school contacts */}
            <div className="bg-[#109E58] text-white text-center py-2 px-4 text-[8px] font-sans rounded-sm border-t border-emerald-300">
              <div className="font-bold tracking-wide uppercase">{`Griya Cinere I, Jl. Garuda Ujung No. 35, Cinere, Kec Limo, Kota Depok, Jawa Barat 16515`}</div>
              <div className="text-[7.5px] mt-0.5 opacity-90 font-medium">{`Telp. (021) 753 4841   Email: information@lazuardi.sch.id   WhatsApp: +62 813 8925 7784`}</div>
            </div>

          </div>

          {/* PAGE 2 — TEACHER COMMENTS & SOCIAL-EMOTIONAL LEARNING DEVELOPMENT */}
          <div className="weekly-report-page page-2 bg-white px-8 py-4 md:px-12 md:py-6 shadow-sm border border-gray-200 text-gray-950 mx-auto w-full max-w-[794px] min-[794px]:w-[794px] min-[794px]:h-[1123px] min-[794px]:min-h-[1123px] font-sans flex flex-col justify-start gap-0 print:border-none print:shadow-none print:p-0 print:m-0" id="weekly-report-page-2">
            
            {/* Header ringkas */}
            <div className="border-b-2 border-emerald-600 pb-2 flex justify-between items-center text-xs">
              <div className="flex items-center gap-2">
                {tkLogoUrl ? (
                  <img src={tkLogoUrl} alt="Logo" className="h-8 w-auto object-contain" referrerPolicy="no-referrer" />
                ) : (
                  <div className="flex items-center gap-1.5">
                    <div className="bg-[#109E58] p-1 rounded">
                      <svg className="w-4 h-4 text-white" viewBox="0 0 100 100" fill="currentColor">
                        <path d="M50 10 C42 35 25 45 10 50 C25 55 42 65 50 90 C58 65 75 55 90 50 C75 45 58 35 50 10 Z" />
                      </svg>
                    </div>
                    <span className="font-extrabold text-[#109E58] text-[11px] tracking-wide">LAZUARDI SCHOOL</span>
                  </div>
                )}
              </div>
              <div className="text-right leading-tight">
                <span className="block font-black text-emerald-800 uppercase text-[9.5px] tracking-wider">STUDENT'S WEEKLY REPORT</span>
                <span className="block font-bold text-gray-500 text-[8.5px] mt-0.5 uppercase">{loadedDraft.studentName} • {loadedDraft?.classGroup || loadedDraft?.className || 'Class'} • {formattedDateRange}</span>
              </div>
            </div>

            {/* Section pertama: WEEKLY COMMENTS */}
            <div className="border-2 border-[#109E58] rounded-sm overflow-hidden bg-white flex flex-col min-h-[145px] mt-4">
              <div className="bg-[#109E58] text-white text-center flex items-center justify-center h-[27px] font-bold text-[13px] leading-[1.2] tracking-wider uppercase">
                WEEKLY COMMENTS
              </div>
              <div className="px-[16px] py-[14px] text-[14px] leading-[1.58] text-left text-gray-900 bg-white flex-1 whitespace-pre-wrap font-normal">
                {finalWeeklyComments || (
                  <span className="text-[13px] text-gray-400 italic">Komentar perkembangan mingguan belum diisi oleh guru.</span>
                )}
              </div>
            </div>

            {/* Spasi antara komentar */}
            <div className="h-[22px]"></div>

            {/* Section kedua: SOCIAL-EMOTIONAL LEARNING DEVELOPMENT */}
            <div className={`border-2 border-[#109E58] rounded-sm overflow-hidden bg-white flex flex-col ${finalSocialEmotional ? 'min-h-[145px]' : 'min-h-[150px]'}`}>
              <div className="bg-[#109E58] text-white text-center flex items-center justify-center h-[27px] font-bold text-[13px] leading-[1.2] tracking-wider uppercase">
                SOCIAL-EMOTIONAL LEARNING DEVELOPMENT
              </div>
              <div className="px-[16px] py-[14px] text-left text-gray-900 bg-white flex-1 whitespace-pre-wrap font-normal">
                {finalSocialEmotional ? (
                  <div className="text-[14px] leading-[1.55]">{finalSocialEmotional}</div>
                ) : (
                  <span className="text-[13px] text-gray-400 italic block">Komentar sosial-emosional belum diisi oleh guru.</span>
                )}
              </div>
            </div>

            {/* Area Tanda Tangan: Guru Kelas Centered */}
            <div className="w-full flex justify-center mt-8 mb-4">
              <div className="flex flex-col items-center text-center text-xs w-64">
                <span className="font-bold text-gray-500 text-[10px]">{formattedSignDate}</span>
                <span className="font-bold text-gray-600 text-[10.5px] mt-0.5">Guru Kelas</span>
                
                <div className="h-[68px] flex items-center justify-center my-2">
                  {isSignatureLoading ? (
                    <div className="flex items-center gap-1 text-[9px] text-gray-400">
                      <Loader2 className="animate-spin" size={10} />
                      <span>Memuat...</span>
                    </div>
                  ) : resolvedSignatureUrl ? (
                    <img
                      src={resolvedSignatureUrl}
                      alt="Tanda Tangan Guru"
                      className="max-h-[64px] object-contain mix-blend-multiply"
                      style={{ objectFit: 'contain' }}
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="text-[9px] text-gray-400 italic select-none leading-tight">
                      Tanda tangan belum diatur
                    </span>
                  )}
                </div>

                <div className="text-center font-sans flex flex-col items-center gap-0.5 w-full">
                  <span className="text-center font-extrabold text-[11px] text-gray-900 border-b border-solid border-gray-900 w-44 pb-0.5 mx-auto uppercase">
                    {resolvedTeacherName ? resolvedTeacherName.replace(/^\s*\(UNDANGAN\)\s*/i, "") : (
                      <span className="text-gray-400 italic font-bold text-[10px]">Guru Kelas Belum Diatur</span>
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* FOOTER BLOCK: Exact matching of Griya Cinere school contacts */}
            <div className="bg-[#109E58] text-white text-center py-2 px-4 text-[8px] font-sans rounded-sm border-t border-emerald-300 mt-auto">
              <div className="font-bold tracking-wide uppercase">{`Griya Cinere I, Jl. Garuda Ujung No. 35, Cinere, Kec Limo, Kota Depok, Jawa Barat 16515`}</div>
              <div className="text-[7.5px] mt-0.5 opacity-90 font-medium">{`Telp. (021) 753 4841   Email: information@lazuardi.sch.id   WhatsApp: +62 813 8925 7784`}</div>
            </div>

          </div>

        </div>
      )}

      {/* 5. PUBLISHED WEEKLY REPORTS PANEL */}
      <section className="bg-white p-6 rounded-[2rem] border border-gray-150 shadow-sm print:hidden space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-gray-100 pb-4 gap-4">
          <div className="space-y-1">
            <h2 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
              <FileText className="text-[#109E58]" size={18} />
              Published Weekly Reports
            </h2>
            <p className="text-[11px] text-gray-500 font-bold">
              Arsip laporan mingguan terbit yang tersimpan di server Google Drive & Firestore
            </p>
          </div>
          <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-black uppercase shrink-0 self-start md:self-center">
            {publishedSubTab === 'READY_TO_SEND' ? `${readyToSendReportsCount} Siap Dikirim` : 
             publishedSubTab === 'SENT' ? `${sentReportsCount} Terkirim` : 
             `${archivedReports.length} Diarsipkan`}
          </span>
        </div>

        {/* Sub-tab Switcher */}
        <div className="flex border-b border-gray-150 -mt-2">
          <button
            onClick={() => setPublishedSubTab('READY_TO_SEND')}
            className={cn(
              "px-5 py-2.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2",
              publishedSubTab === 'READY_TO_SEND'
                ? "border-emerald-600 text-emerald-700 font-black"
                : "border-transparent text-gray-400 hover:text-gray-600"
            )}
          >
            <Clock size={13} />
            Siap Dikirim ({readyToSendReportsCount})
          </button>
          <button
            onClick={() => setPublishedSubTab('SENT')}
            className={cn(
              "px-5 py-2.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2",
              publishedSubTab === 'SENT'
                ? "border-emerald-600 text-emerald-700 font-black"
                : "border-transparent text-gray-400 hover:text-gray-600"
            )}
          >
            <Send size={13} />
            Terkirim ({sentReportsCount})
          </button>
          <button
            onClick={() => setPublishedSubTab('ARCHIVED')}
            className={cn(
              "px-5 py-2.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2",
              publishedSubTab === 'ARCHIVED'
                ? "border-amber-600 text-amber-700 font-black"
                : "border-transparent text-gray-400 hover:text-gray-600"
            )}
          >
            <Archive size={13} />
            Arsip ({archivedReports.length})
          </button>
        </div>

        {/* Filters and Search Bar */}
        {(publishedReports.length > 0 || archivedReports.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-50 p-4 rounded-2xl border border-gray-150">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-emerald-700 uppercase tracking-wider block">Filter Kelas</label>
              <select
                value={publishedClassFilter}
                onChange={(e) => setPublishedClassFilter(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold outline-none text-gray-700 cursor-pointer hover:bg-gray-50"
              >
                <option value="ALL">Semua Kelas ({uniquePublishedClasses.length})</option>
                {uniquePublishedClasses.map(cls => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-emerald-700 uppercase tracking-wider block">Cari Nama Siswa</label>
              <input
                type="text"
                value={publishedSearchQuery}
                onChange={(e) => setPublishedSearchQuery(e.target.value)}
                placeholder="Ketik nama siswa..."
                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold outline-none text-gray-700 placeholder-gray-400"
              />
            </div>
          </div>
        )}

        {publishedSubTab === 'READY_TO_SEND' || publishedSubTab === 'SENT' ? (
          publishedReports.filter(r => r.status === (publishedSubTab === 'READY_TO_SEND' ? 'ready_to_send' : 'sent')).length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-xs italic bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
              {publishedSubTab === 'READY_TO_SEND' 
                ? "Belum ada laporan mingguan siap dikirim." 
                : "Belum ada laporan mingguan terkirim."}
            </div>
          ) : filteredPublishedReports.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-xs italic bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
              Tidak ada laporan yang cocok dengan filter atau pencarian Anda.
            </div>
          ) : (
            <div className="space-y-6">
              {groupedPublishedReports.map((group) => (
                <div key={group.label} className="space-y-3">
                  {/* Section Header for the period/week */}
                  <div className="bg-emerald-50/70 border border-emerald-100/50 text-emerald-900 px-4 py-2.5 rounded-xl flex items-center justify-between font-extrabold text-xs">
                    <span className="flex items-center gap-2">
                      <Calendar size={14} className="text-[#109E58]" />
                      {group.label}
                    </span>
                    <span className="text-[10px] bg-white text-emerald-800 font-extrabold px-2.5 py-0.5 rounded-full border border-emerald-100">
                      {group.reports.length} Laporan
                    </span>
                  </div>
                  
                  {/* Table for students in this period */}
                  <div className="overflow-x-auto rounded-xl border border-gray-150">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        {publishedSubTab === 'READY_TO_SEND' ? (
                          <tr className="bg-gray-50/50 border-b border-gray-150 font-black text-gray-500 uppercase tracking-wider text-[10px]">
                            <th className="p-3.5">Nama Siswa</th>
                            <th className="p-3.5">Status Laporan</th>
                            <th className="p-3.5 text-right">File PDF / Tindakan</th>
                          </tr>
                        ) : (
                          <tr className="bg-gray-50/50 border-b border-gray-150 font-black text-gray-500 uppercase tracking-wider text-[10px]">
                            <th className="p-3.5">Nama Siswa</th>
                            <th className="p-3.5">Status Dilihat</th>
                            <th className="p-3.5">Status Laporan</th>
                            <th className="p-3.5 text-right">File PDF / Tindakan</th>
                          </tr>
                        )}
                      </thead>
                      <tbody className="divide-y divide-gray-100 font-bold text-gray-700">
                        {group.reports.map((report) => (
                          <tr key={report.id} className="hover:bg-gray-50/30 transition-colors">
                            <td className="p-3.5">
                              <div className="flex flex-col gap-1">
                                <span className="font-extrabold text-gray-900 text-sm">{report.studentName}</span>
                                <div className="flex items-center flex-wrap gap-2">
                                  <span className="text-[9px] bg-emerald-100 text-emerald-800 font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                                    {report.className}
                                  </span>
                                  {publishedSubTab === 'READY_TO_SEND' ? (
                                    report.publishedAt && (
                                      <span className="text-[9.5px] text-gray-400 font-medium whitespace-nowrap">
                                        PDF dibuat: {new Date(report.publishedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                    )
                                  ) : (
                                    report.sentAt && (
                                      <span className="text-[9.5px] text-gray-400 font-medium whitespace-nowrap">
                                        Dikirim: {new Date(report.sentAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                    )
                                  )}
                                </div>
                              </div>
                            </td>
                            {publishedSubTab === 'SENT' && (
                              <td className="p-3.5 text-left">
                                {(() => {
                                  const hasViewed = !!report.studentViewedAt;
                                  const hasPdfOpened = !!report.pdfOpenedAt;
                                  
                                  return (
                                    <div className="flex flex-col gap-1.5 max-w-[240px]">
                                      <div className="flex items-start gap-1 flex-col">
                                        {hasViewed ? (
                                          <>
                                            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border border-emerald-100">
                                              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                                              Sudah Dilihat
                                            </span>
                                            <div className="text-[10px] text-gray-500 font-bold space-y-0.5 mt-0.5 leading-tight">
                                              <div>Pertama: <span className="text-gray-700">{formatIndonesianDateTime(report.studentViewedAt)}</span></div>
                                              {report.lastStudentViewedAt && (
                                                <div>Terakhir: <span className="text-gray-700">{formatIndonesianDateTime(report.lastStudentViewedAt)}</span></div>
                                              )}
                                              {report.viewCount !== undefined && report.viewCount > 0 && (
                                                <div className="text-[9.5px] text-emerald-600 font-extrabold bg-emerald-50/50 px-1.5 py-0.2 rounded w-fit mt-0.5">
                                                  Dibuka {report.viewCount}×
                                                </div>
                                              )}
                                            </div>
                                          </>
                                        ) : (
                                          <>
                                            <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-500 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border border-gray-200">
                                              Belum Dilihat
                                            </span>
                                            <span className="text-[10px] text-gray-400 font-medium leading-tight mt-0.5">
                                              Belum dibuka oleh siswa.
                                            </span>
                                          </>
                                        )}
                                      </div>
                                      {hasPdfOpened && (
                                        <div className="border-t border-dashed border-gray-150 pt-1 mt-1 text-[10px] text-blue-700 font-semibold leading-tight">
                                          <div className="flex items-center gap-1">
                                            <span className="inline-block w-1 h-1 bg-blue-500 rounded-full" />
                                            <span>PDF dibuka: <span className="font-extrabold">{formatIndonesianDateTime(report.pdfOpenedAt)}</span></span>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                              </td>
                            )}
                            <td className="p-3.5 text-left">
                              {publishedSubTab === 'READY_TO_SEND' ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[10px] font-black uppercase tracking-wider">
                                  <Clock size={11} className="text-amber-500" />
                                  Siap Dikirim
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[10px] font-black uppercase tracking-wider">
                                  <CheckCircle2 size={11} className="text-emerald-500" />
                                  Terkirim
                                </span>
                              )}
                            </td>
                            <td className="p-3.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {report.driveFileUrl && (
                                  <>
                                    <a
                                      href={report.driveFileUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 px-2.5 py-1.5 rounded-lg text-[10.5px] font-black transition-all cursor-pointer"
                                      title="Buka dokumen di Google Drive"
                                    >
                                      <FileText size={12} className="text-blue-500" />
                                      Drive
                                    </a>
                                    {publishedSubTab === 'READY_TO_SEND' && (
                                      <button
                                        onClick={() => {
                                          setReportToSend(report);
                                          setSendConfirmModalOpen(true);
                                        }}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10.5px] font-black bg-orange-50 hover:bg-orange-100 text-orange-700 transition-all cursor-pointer"
                                        title="Kirim link laporan ini ke akun orang tua"
                                      >
                                        <Send size={12} className="text-orange-500" />
                                        Kirim ke Orang Tua
                                      </button>
                                    )}
                                  </>
                                )}
                                <button
                                  onClick={() => {
                                    setReportToArchive(report);
                                    setArchiveReason('');
                                    setArchiveModalOpen(true);
                                  }}
                                  className="p-1.5 hover:bg-amber-50 text-amber-600 hover:text-amber-800 rounded-lg transition-all cursor-pointer"
                                  title="Arsipkan laporan agar tidak dapat dilihat siswa."
                                >
                                  <Archive size={13} />
                                </button>
                                <button
                                  onClick={() => handleDeletePublished(report.id, report.studentName)}
                                  className="p-1.5 hover:bg-red-50 text-red-500 hover:text-red-700 rounded-lg transition-all cursor-pointer"
                                  title="Hapus Publikasi"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          archivedReports.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-xs italic bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
              Belum ada laporan mingguan yang diarsipkan.
            </div>
          ) : filteredArchivedReports.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-xs italic bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
              Tidak ada arsip laporan yang cocok dengan filter atau pencarian Anda.
            </div>
          ) : (
            <div className="space-y-6">
              {groupedArchivedReports.map((group) => (
                <div key={group.label} className="space-y-3">
                  {/* Section Header for the period/week */}
                  <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-2.5 rounded-xl flex items-center justify-between font-extrabold text-xs">
                    <span className="flex items-center gap-2">
                      <Calendar size={14} className="text-amber-600" />
                      {group.label}
                    </span>
                    <span className="text-[10px] bg-white text-amber-800 font-extrabold px-2.5 py-0.5 rounded-full border border-amber-200">
                      {group.reports.length} Diarsipkan
                    </span>
                  </div>
                  
                  {/* Table for students in this period */}
                  <div className="overflow-x-auto rounded-xl border border-gray-150">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-gray-50/50 border-b border-gray-150 font-black text-gray-500 uppercase tracking-wider text-[10px]">
                          <th className="p-3.5">Nama Siswa</th>
                          <th className="p-3.5">Detail Arsip</th>
                          <th className="p-3.5">Alasan Pengarsipan</th>
                          <th className="p-3.5 text-right">File PDF</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 font-bold text-gray-700">
                        {group.reports.map((report) => {
                          const isExpanded = !!expandedReasons[report.id];
                          const reasonText = report.archiveReason || '';
                          const needsExpansion = reasonText.length > 60;
                          const displayText = isExpanded ? reasonText : (needsExpansion ? reasonText.substring(0, 60) + '...' : reasonText);

                          return (
                            <tr key={report.id} className="hover:bg-gray-50/30 transition-colors">
                              <td className="p-3.5">
                                <div className="flex flex-col gap-1">
                                  <span className="font-extrabold text-gray-900 text-sm">{report.studentName}</span>
                                  <div className="flex items-center flex-wrap gap-2">
                                    <span className="text-[9px] bg-amber-100 text-amber-800 font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                                      {report.className}
                                    </span>
                                    <span className="text-[10px] bg-amber-50 text-amber-700 px-2.5 py-0.5 rounded-full border border-amber-100 uppercase tracking-wider font-extrabold flex items-center gap-1">
                                      <Archive size={10} />
                                      Diarsipkan
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className="p-3.5 text-left text-[11.5px] text-gray-600 leading-relaxed font-semibold">
                                <div className="space-y-1">
                                  <div>
                                    <span className="text-gray-400 font-medium">Dipublish awal: </span>
                                    <span className="text-gray-700 font-extrabold">
                                      {report.publishedAt ? new Date(report.publishedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-gray-400 font-medium">Diarsipkan: </span>
                                    <span className="text-gray-700 font-extrabold">
                                      {formatIndonesianDateTime(report.archivedAt)}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-gray-400 font-medium">Oleh: </span>
                                    <span className="text-gray-700 font-extrabold">{report.archivedByEmail || report.archivedBy || 'Guru'}</span>
                                  </div>
                                </div>
                              </td>
                              <td className="p-3.5 text-left text-[11.5px] max-w-[300px]">
                                <p className="text-gray-700 whitespace-pre-wrap font-medium leading-relaxed italic">
                                  "{displayText}"
                                </p>
                                {needsExpansion && (
                                  <button
                                    onClick={() => setExpandedReasons(prev => ({ ...prev, [report.id]: !prev[report.id] }))}
                                    className="text-blue-600 hover:text-blue-800 font-extrabold underline text-[10.5px] mt-1 inline-block cursor-pointer"
                                  >
                                    {isExpanded ? 'Sembunyikan' : 'Lihat Lengkap'}
                                  </button>
                                )}
                              </td>
                              <td className="p-3.5 text-right">
                                {report.driveFileUrl && (
                                  <a
                                    href={report.driveFileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-2 rounded-lg text-xs font-black transition-all cursor-pointer"
                                    title="Lihat PDF Drive"
                                  >
                                    <FileText size={13} className="text-blue-500" />
                                    Lihat PDF Drive
                                  </a>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </section>

      {/* ARCHIVE CONFIRMATION MODAL */}
      {archiveModalOpen && reportToArchive && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[9999] p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-5 animate-scale-up">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
              <div className="p-2.5 bg-amber-50 rounded-2xl text-amber-600">
                <Archive size={24} />
              </div>
              <div>
                <h3 className="text-base font-black text-gray-900 leading-snug">Konfirmasi Arsipkan Laporan</h3>
                <p className="text-[10.5px] text-gray-500 font-bold uppercase tracking-wider mt-0.5">Unit Kindergarten (TK)</p>
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-150 space-y-2 text-xs font-bold text-gray-700">
              <div className="grid grid-cols-3 gap-1">
                <span className="text-gray-400">Nama Siswa:</span>
                <span className="col-span-2 text-gray-900 font-extrabold">{reportToArchive.studentName}</span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <span className="text-gray-400">Kelas:</span>
                <span className="col-span-2 text-gray-900 font-extrabold">{reportToArchive.className}</span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <span className="text-gray-400">Periode:</span>
                <span className="col-span-2 text-gray-900 font-extrabold">{getPeriodLabel(reportToArchive)}</span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <span className="text-gray-400">Tgl Terbit:</span>
                <span className="col-span-2 text-gray-900 font-extrabold">
                  {reportToArchive.publishedAt ? new Date(reportToArchive.publishedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}
                </span>
              </div>
            </div>

            <div className="p-3.5 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-2.5 text-[11.5px] text-red-800 font-bold leading-relaxed">
              <ShieldAlert className="text-red-500 shrink-0 mt-0.5" size={16} />
              <div>
                Peringatan: Laporan akan hilang dari Rapor Saya siswa dan Mobile View Lumina. Data laporan tetap tersimpan di Arsip.
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10.5px] font-black text-gray-500 uppercase tracking-wider block">
                Alasan Pengarsipan <span className="text-red-500">*</span>
              </label>
              <textarea
                value={archiveReason}
                onChange={(e) => setArchiveReason(e.target.value)}
                placeholder="Contoh: Terdapat kesalahan dokumentasi/foto. Laporan akan diterbitkan ulang."
                rows={3}
                required
                className="w-full bg-white border border-gray-200 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl p-3 text-xs font-semibold text-gray-800 outline-none placeholder-gray-400 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setArchiveModalOpen(false);
                  setReportToArchive(null);
                  setArchiveReason('');
                }}
                disabled={isArchiving}
                className="px-4 py-2 text-xs font-black uppercase tracking-wider text-gray-500 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl cursor-pointer disabled:opacity-50 transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleArchiveReport}
                disabled={isArchiving || !archiveReason.trim()}
                className="px-4 py-2 text-xs font-black uppercase tracking-wider text-white bg-amber-600 hover:bg-amber-700 rounded-xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all inline-flex items-center gap-1.5 shadow-sm"
              >
                {isArchiving && <Loader2 size={12} className="animate-spin" />}
                Arsipkan Laporan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SEND TO PARENT CONFIRMATION MODAL */}
      {sendConfirmModalOpen && reportToSend && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[9999] p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-5 animate-scale-up">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
              <div className="p-2.5 bg-emerald-50 rounded-2xl text-emerald-600">
                <Send size={24} />
              </div>
              <div>
                <h3 className="text-base font-black text-gray-900 leading-snug">Kirim Weekly Report?</h3>
                <p className="text-[10.5px] text-gray-500 font-bold uppercase tracking-wider mt-0.5">Unit Kindergarten (TK)</p>
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-150 space-y-2 text-xs font-bold text-gray-700 leading-relaxed">
              <p>
                Weekly Report <span className="text-gray-900 font-extrabold">{reportToSend.studentName}</span> untuk periode <span className="text-gray-900 font-extrabold">{getPeriodLabel(reportToSend)}</span> akan diterbitkan dan dapat dilihat oleh siswa/orang tua.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setSendConfirmModalOpen(false);
                  setReportToSend(null);
                }}
                disabled={isSending}
                className="px-4 py-2 text-xs font-black uppercase tracking-wider text-gray-500 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl cursor-pointer disabled:opacity-50 transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmSendToParent}
                disabled={isSending}
                className="px-4 py-2 text-xs font-black uppercase tracking-wider text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl cursor-pointer disabled:opacity-50 transition-all inline-flex items-center gap-1.5 shadow-sm"
              >
                {isSending && <Loader2 size={12} className="animate-spin" />}
                Kirim Laporan
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

