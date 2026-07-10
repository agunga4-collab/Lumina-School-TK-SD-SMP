import * as React from 'react';
import { motion } from 'motion/react';
import { 
  Smile, Meh, Frown, Angry, AlertCircle, Calendar, ChevronLeft, ChevronRight, 
  Printer, BookOpen, Clock, Heart, ShieldAlert, FileText, ArrowRight, Sparkles, ChevronDown,
  Loader2, CheckCircle2, FileDown, Trash2, Send, RefreshCw, Upload
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useNavigate } from 'react-router-dom';
import { 
  DEFAULT_STUDENTS, 
  getMonday, 
  formatDateToKey,
  getStoredStudents,
  saveStoredStudents,
  aggregateKGWeeklyReportForPeriod
} from '../../lib/kindergartenWeeklyReport';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { useAuth } from '../../context/AuthContext';
import { logFirestoreRead } from '../../lib/kindergartenMetadataCache';
import { toast } from 'sonner';
import { html2canvasWithModernColors } from '../../lib/html2canvasPatch';
import { jsPDF } from 'jspdf';

export default function WeeklyReview() {
  const navigate = useNavigate();
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

  // Class Selection states
  const [classes, setClasses] = React.useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = React.useState<string>('');
  const [students, setStudents] = React.useState<any[]>(() => DEFAULT_STUDENTS);
  const [isLoadingClasses, setIsLoadingClasses] = React.useState(true);

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

  const activeClassObj = classes.find(c => c.id === selectedClassId);
  const filteredStudents = React.useMemo(() => {
    if (!selectedClassId || !activeClassObj) {
      return students;
    }
    return students.filter(student => isStudentInClass(student.classId, activeClassObj));
  }, [students, selectedClassId, activeClassObj]);

  const [selectedStudentId, setSelectedStudentId] = React.useState<string>('');

  React.useEffect(() => {
    if (filteredStudents.length > 0) {
      const exists = filteredStudents.some(s => s.id === selectedStudentId);
      if (!exists) {
        setSelectedStudentId(filteredStudents[0].id);
      }
    }
  }, [filteredStudents, selectedStudentId]);

  // Load start and end date from sessionStorage or use current week's Mon-Fri
  const [startDateStr, setStartDateStr] = React.useState<string>(() => {
    const fromSession = sessionStorage.getItem('kindy_report_start');
    if (fromSession) return fromSession;
    const mon = getMonday(new Date());
    return formatDateToKey(mon);
  });
  const [endDateStr, setEndDateStr] = React.useState<string>(() => {
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
          fetchedObs = snapObs.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
        } catch (err: any) {
          console.warn("[WeeklyReview] Observations list query fell back to empty due to potential rules limits/permissions:", err);
        }

        if (active) {
          setFirestoreAttendance(fetchedAtt);
          setFirestoreObservations(fetchedObs);
          console.log(`[WeeklyReview Firestore Sync] Set ${fetchedAtt.length} attendance docs and ${fetchedObs.length} observations`);
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
          students
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
  const [isPublishing, setIsPublishing] = React.useState(false);

  const [publishedClassFilter, setPublishedClassFilter] = React.useState<string>('ALL');
  const [publishedSearchQuery, setPublishedSearchQuery] = React.useState<string>('');

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
  }, [publishedReports, publishedClassFilter, publishedSearchQuery]);

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

  const fetchPublishedReports = React.useCallback(async () => {
    try {
      const q = query(
        collection(db, 'published_kg_reports'),
        where('academicYear', '==', activeYear)
      );
      const snap = await getDocs(q);
      const list = snap.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      })).sort((a: any, b: any) => b.publishedAt - a.publishedAt);
      setPublishedReports(list);
    } catch (err) {
      console.error("Error fetching published reports:", err);
    }
  }, [activeYear]);

  React.useEffect(() => {
    fetchPublishedReports();
  }, [fetchPublishedReports]);

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

      // 2. Locate report container
      toast.loading("Membuat file PDF dari laporan...", { id: "publish-kg" });
      const element = document.getElementById("formal-weekly-report");
      if (!element) {
        toast.dismiss("publish-kg");
        toast.error("Elemen laporan (#formal-weekly-report) tidak ditemukan.");
        setIsPublishing(false);
        return;
      }

      // 3. Render container to Canvas & PDF
      const canvas = await html2canvasWithModernColors(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        onclone: (clonedDoc, clonedElement) => {
          if (clonedElement) {
            clonedElement.style.fontFamily = '"Inter", sans-serif';
          }
        }
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
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
        driveFileUrl
      };
      
      await addDoc(collection(db, 'published_kg_reports'), reportPayload);
      toast.success(`Berhasil dipublikasikan & diunggah ke Shared Drive untuk ${loadedDraft.studentName}! 🎉`, { id: "publish-kg" });
      
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

  const handleSendToParent = async (reportId: string, currentStatus: boolean) => {
    if (currentStatus) return;
    const toastId = toast.loading("Mengirim laporan ke akun orang tua...");
    try {
      await updateDoc(doc(db, 'published_kg_reports', reportId), {
        sentToParent: true,
        sentAt: Date.now()
      });
      toast.success("Laporan berhasil dikirim ke akun orang tua! 🎉", { id: toastId });
      fetchPublishedReports();
    } catch (err: any) {
      console.error("Error sending to parent:", err);
      toast.error(`Gagal mengirim laporan: ${err.message}`, { id: toastId });
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

  const renderSnapshotCard = (dayKey: string, snap: any) => {
    return (
      <div className="border-2 border-[#109E58] rounded-sm overflow-hidden bg-white flex flex-col h-full">
        <div className="bg-[#109E58] text-white text-center py-1 font-extrabold text-[10.5px] tracking-wider uppercase">
          SNAPSHOT - {dayKey}
        </div>
        <div className="p-1.5 flex-1 flex flex-col justify-center bg-white min-h-[120px]">
          {snap?.photoUrl ? (
            <div className="w-full h-[110px] overflow-hidden rounded-sm border border-gray-100">
              <img 
                src={snap.photoUrl} 
                alt={`Snapshot ${dayKey}`} 
                className="w-full h-full object-cover" 
                referrerPolicy="no-referrer"
                crossOrigin="anonymous"
              />
            </div>
          ) : (
            <div className="w-full h-[110px] bg-[#fdfdfd] border border-dashed border-gray-200 flex items-center justify-center p-2 text-center">
              <span className="text-[9px] text-gray-400 font-bold italic leading-tight">No Documentation</span>
            </div>
          )}
        </div>
      </div>
    );
  };

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
                    Publish PDF
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
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-xs font-bold outline-none text-gray-700 appearance-none pr-8 cursor-pointer hover:bg-gray-100/50"
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
        <div className="bg-white px-8 py-4 md:px-12 md:py-6 shadow-sm border border-gray-200 text-gray-950 mx-auto w-full max-w-[794px] min-[794px]:w-[794px] min-[794px]:h-[1123px] min-[794px]:min-h-[1123px] font-sans flex flex-col justify-between gap-3.5 print:border-none print:shadow-none print:p-0 print:m-0" id="formal-weekly-report">
          
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
                border: none !important;
                box-shadow: none !important;
                padding: 0 !important;
                margin: 0 !important;
                width: 100% !important;
                max-width: 100% !important;
              }
              @page {
                size: A4 portrait;
                margin: 0.4cm 1cm 0.4cm 1cm;
              }
            }
          `}} />

          {/* Lazuardi school design banner (Height reduced to 75% of original) */}
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

          {/* SECTION I: WEEKLY COMMENTS */}
          <div className="border-2 border-[#109E58] rounded-sm overflow-hidden bg-white min-h-[168px] flex flex-col">
            <div className="bg-[#109E58] text-white text-center py-1 font-extrabold text-[10.5px] tracking-wider uppercase">
              WEEKLY COMMENTS
            </div>
            <div className="p-3.5 text-[11px] leading-relaxed text-left text-gray-800 bg-white flex-1">
              {finalWeeklyComments || (
                <span className="text-gray-400 italic">Komentar perkembangan mingguan belum diisi oleh guru.</span>
              )}
            </div>
          </div>

          {/* SECTION II: SNAPSHOTS GRID ROUND 1 (Monday, Tuesday, Wednesday) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {renderSnapshotCard('MONDAY', getSnapForDay('MONDAY'))}
            {renderSnapshotCard('TUESDAY', getSnapForDay('TUESDAY'))}
            {renderSnapshotCard('WEDNESDAY', getSnapForDay('WEDNESDAY'))}
          </div>

          {/* SECTION II.B: SNAPSHOTS GRID ROUND 2 (Thursday, Friday - Centered & exactly same size as Row 1) */}
          <div className="flex flex-col sm:flex-row justify-center gap-3">
            <div className="w-full sm:w-[calc((100%-24px)/3)]">
              {renderSnapshotCard('THURSDAY', getSnapForDay('THURSDAY'))}
            </div>
            <div className="w-full sm:w-[calc((100%-24px)/3)]">
              {renderSnapshotCard('FRIDAY', getSnapForDay('FRIDAY'))}
            </div>
          </div>

          {/* SECTION III & IV: COHESIVE LOWER GRID (Uneven 8:4 of 12 col grid for wider Social-Emotional and narrowed Signature) */}
          <div className="grid grid-cols-12 gap-3 items-stretch">
            
            {/* Column A (Left): Social Emotional progress (col-span-8, widened) */}
            <div className="col-span-8 flex flex-col">
              {/* SOCIAL-EMOTIONAL LEARNING DEVELOPMENT (Height reduced to 75%) */}
              <div className="border-2 border-[#109E58] rounded-sm overflow-hidden bg-white flex flex-col flex-1 min-h-[105px] md:min-h-[112px]">
                <div className="bg-[#109E58] text-white text-center py-1 font-extrabold text-[10.5px] tracking-wider uppercase">
                  SOCIAL-EMOTIONAL LEARNING DEVELOPMENT
                </div>
                <div className="p-2.5 bg-white flex-1 flex flex-col justify-start">
                  <p className="text-[10.5px] leading-normal text-left text-gray-800 font-sans whitespace-pre-wrap">
                    {finalSocialEmotional || (
                      <span className="text-gray-400 italic block">Komentar sosial emosional belum diisi oleh guru.</span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Column B (Right): Teacher Signature area (col-span-4, narrowed) */}
            <div className="col-span-4 flex flex-col">
              {/* Signature block with date (Height reduced to 75%) */}
              <div className="border-2 border-[#109E58] rounded-sm overflow-hidden bg-white flex flex-col flex-1 min-h-[105px] md:min-h-[112px]">
                <div className="bg-[#109E58] text-white text-center py-1 font-extrabold text-[10.5px] tracking-wider uppercase">
                  {formattedSignDate}
                </div>
                <div className="p-2 bg-white flex-1 flex flex-col items-center justify-center min-h-[75px] py-1">
                  <div className="h-10 flex items-center justify-center">
                    {activeClassObj?.teacherSignatureUrl ? (
                      <img
                        src={activeClassObj.teacherSignatureUrl}
                        alt="Tanda Tangan Guru"
                        className="max-h-10 max-w-[140px] object-contain mix-blend-multiply"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="text-[8px] text-red-550 italic font-bold select-none py-1 block text-center leading-tight">
                        Tanda tangan guru belum diunggah
                      </span>
                    )}
                  </div>
                  <div className="text-center font-sans mt-1 flex flex-col items-center gap-0.5 w-full">
                    <span className="text-center font-extrabold text-[10px] text-gray-900 border-b border-solid border-gray-900 w-36 pb-0.5 mx-auto uppercase">
                      {activeClassObj?.homeroomTeacherName || (
                        <span className="text-red-550 italic font-bold">Wali Kelas Belum Diatur</span>
                      )}
                    </span>
                    <input 
                      type="text"
                      value={teacherNip}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTeacherNip(val);
                        localStorage.setItem('kg_teacher_nip', val);
                      }}
                      placeholder="NIP / No Registrasi"
                      className="text-center text-[8.5px] text-gray-500 font-bold uppercase w-32 outline-none border-b border-dotted border-gray-200 focus:border-solid focus:border-emerald-500 print:border-none print:p-0 print:m-0"
                    />
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* FOOTER BLOCK: Exact matching of Griya Cinere school contacts */}
          <div className="bg-[#109E58] text-white text-center py-2 px-4 text-[8px] font-sans rounded-sm mt-3 border-t border-emerald-300">
            <div className="font-bold tracking-wide uppercase">{`Griya Cinere I, Jl. Garuda Ujung No. 35, Cinere, Kec Limo, Kota Depok, Jawa Barat 16515`}</div>
            <div className="text-[7.5px] mt-0.5 opacity-90 font-medium">{`Telp. (021) 753 4841   Email: information@lazuardi.sch.id   WhatsApp: +62 813 8925 7784`}</div>
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
            {publishedReports.length} Terpublikasi
          </span>
        </div>

        {/* Filters and Search Bar */}
        {publishedReports.length > 0 && (
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

        {publishedReports.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-xs italic bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
            Belum ada laporan mingguan yang dipublikasikan dalam tahun ajaran ini.
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
                      <tr className="bg-gray-50/50 border-b border-gray-150 font-black text-gray-500 uppercase tracking-wider text-[10px]">
                        <th className="p-3.5">Nama Siswa</th>
                        <th className="p-3.5 text-right">File PDF / Tindakan</th>
                      </tr>
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
                                {report.publishedAt && (
                                  <span className="text-[9.5px] text-gray-400 font-medium whitespace-nowrap">
                                    Dipublish: {new Date(report.publishedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                )}
                              </div>
                            </div>
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
                                  <button
                                    onClick={() => handleSendToParent(report.id, report.sentToParent || false)}
                                    disabled={report.sentToParent || false}
                                    className={cn(
                                      "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10.5px] font-black transition-all cursor-pointer",
                                      report.sentToParent
                                        ? "bg-emerald-50 text-emerald-700 opacity-80 cursor-default"
                                        : "bg-orange-50 hover:bg-orange-100 text-orange-700"
                                    )}
                                    title={report.sentToParent ? "Laporan sudah dikirim ke orang tua" : "Kirim link laporan ini ke akun orang tua"}
                                  >
                                    <Send size={12} className={report.sentToParent ? "text-emerald-500" : "text-orange-500"} />
                                    {report.sentToParent ? "Terkirim" : "Kirim ke Orang Tua"}
                                  </button>
                                </>
                              )}
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
        )}
      </section>

    </div>
  );
}

