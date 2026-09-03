import * as React from 'react';
import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, Legend
} from 'recharts';
import { 
  AlertTriangle, CheckCircle, Clock, ChevronRight, ChevronLeft, ShieldAlert, Activity, 
  LayoutGrid, Timer, Loader2, BarChart3, Users, Calendar, Filter, Search, 
  UserX, Info, ArrowUpRight, ArrowDownRight, BookOpen, ThumbsUp, AlertCircle,
  TrendingUp, FileSpreadsheet, Plus, CornerDownRight, MessageSquare, CheckSquare,
  Sparkles, X, Star, FileText, CheckCircle2, ArrowRight
} from 'lucide-react';
import { Link, useOutletContext } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { collection, query, where, getDocs, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UnitType } from '../../types';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { getDhuhurAttendanceRecords, calculateDhuhurRecap } from '../../services/dhuhurAttendanceService';

export default function HeadDashboard() {
  const { activeUnit } = useOutletContext<{ activeUnit: UnitType }>();
  const { activeYear, activeSemester } = useAcademicYear();

  // --- Filter Global ---
  const [selectedYear, setSelectedYear] = useState('2025/2026');
  const [selectedSemester, setSelectedSemester] = useState<number>(2);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedClassId, setSelectedClassId] = useState('ALL');
  const [selectedCohort, setSelectedCohort] = useState('ALL');

  // --- App State ---
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [dhuhurAttendanceRecords, setDhuhurAttendanceRecords] = useState<any[]>([]);
  const [loadingDhuhur, setLoadingDhuhur] = useState(false);
  const [latenessRecords, setLatenessRecords] = useState<any[]>([]);
  const [behaviorCases, setBehaviorCases] = useState<any[]>([]);
  const [academicCases, setAcademicCases] = useState<any[]>([]);
  const [concerns, setConcerns] = useState<any[]>([]);
  const [bipPlans, setBipPlans] = useState<any[]>([]);
  const [cicoSessions, setCicoSessions] = useState<any[]>([]);
  const [goalResponses, setGoalResponses] = useState<any[]>([]);
  const [goalTrackers, setGoalTrackers] = useState<any[]>([]);
  const [mentorAssignments, setMentorAssignments] = useState<any[]>([]);
  const [literacyRecords, setLiteracyRecords] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);

  // --- Navigation & Modal UI ---
  const [activeAnalysisTab, setActiveAnalysisTab] = useState<'daily_insights' | 'keterlambatan' | 'kehadiran' | 'academic' | 'behavior' | 'goals'>('daily_insights');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalData, setModalData] = useState<any[]>([]);
  const [modalType, setModalType] = useState<string>('');
  const [modalSearch, setModalSearch] = useState('');

  // --- Junior High Kehadiran Tab UI States ---
  const [attendanceSubTab, setAttendanceSubTab] = useState<'SCHOOL' | 'DHUHUR'>('SCHOOL');
  const [schoolHolidays, setSchoolHolidays] = useState<string[]>([]);
  const [jhSearchTerm, setJhSearchTerm] = useState('');
  const [jhCurrentPage, setJhCurrentPage] = useState(1);
  const [selectedClassForMissingDates, setSelectedClassForMissingDates] = useState<any | null>(null);
  const [selectedStudentForAttendanceDetail, setSelectedStudentForAttendanceDetail] = useState<any | null>(null);

  // --- Initial Sync of academic context ---
  useEffect(() => {
    if (activeYear) setSelectedYear(activeYear);
    if (activeSemester) setSelectedSemester(activeSemester);
  }, [activeYear, activeSemester]);

  // --- Fetch Data ---
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [
          classesSnap,
          studentsSnap,
          attendanceSnap,
          latenessSnap,
          behaviorSnap,
          academicSnap,
          bipSnap,
          cicoSnap,
          responsesSnap,
          trackersSnap,
          assignmentsSnap,
          literacySnap,
          enrollmentsSnap,
          holidaysSnap
        ] = await Promise.all([
          getDocs(query(collection(db, 'classes'), where('unitId', '==', 'JUNIOR_HIGH'))),
          Promise.all([
            getDocs(query(collection(db, 'students'), where('unitId', '==', 'JUNIOR_HIGH'))),
            getDocs(query(collection(db, 'students'), where('currentUnit', '==', 'JUNIOR_HIGH')))
          ]),
          getDocs(collection(db, 'attendance_records')),
          getDocs(collection(db, 'lateness_records')),
          getDocs(collection(db, 'behaviorCases')),
          getDocs(collection(db, 'juniorhigh_mtss_academic_cases')),
          getDocs(collection(db, 'bipPlans')),
          getDocs(collection(db, 'cicoSessions')),
          getDocs(collection(db, 'studentConferenceResponses')),
          getDocs(collection(db, 'smartGoalTrackerEntries')),
          getDocs(collection(db, 'mentorAssignments')),
          getDocs(collection(db, 'junior_high_literacy_numeracy_records')),
          getDocs(query(collection(db, 'enrollments'), where('unitId', '==', 'JUNIOR_HIGH'))),
          getDocs(collection(db, 'school_holidays')).catch(err => {
            console.warn('Failed to fetch school_holidays:', err);
            return { docs: [] } as any;
          })
        ]);

        const loadedClasses = classesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const loadedStudentsMap = new Map();
        (studentsSnap as any).forEach((snap: any) => {
          snap.docs.forEach((doc: any) => {
            loadedStudentsMap.set(doc.id, { id: doc.id, ...doc.data() });
          });
        });
        const loadedStudents = Array.from(loadedStudentsMap.values());
        const loadedAttendance = attendanceSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const loadedLateness = latenessSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const loadedBehavior = behaviorSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const loadedAcademic = academicSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const loadedBip = bipSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const loadedCico = cicoSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const loadedResponses = responsesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const loadedTrackers = trackersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const loadedAssignments = assignmentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const loadedLiteracy = literacySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const loadedEnrollments = enrollmentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const loadedHolidays = holidaysSnap.docs.map((doc: any) => doc.data().date || doc.id).filter(Boolean);

        setClasses(loadedClasses);
        setStudents(loadedStudents);
        setAttendanceRecords(loadedAttendance);
        setLatenessRecords(loadedLateness);
        setBehaviorCases(loadedBehavior);
        setAcademicCases(loadedAcademic);
        setBipPlans(loadedBip);
        setCicoSessions(loadedCico);
        setGoalResponses(loadedResponses);
        setGoalTrackers(loadedTrackers);
        setMentorAssignments(loadedAssignments);
        setLiteracyRecords(loadedLiteracy);
        setEnrollments(loadedEnrollments);
        setSchoolHolidays(loadedHolidays);

        // Batch Concerns retrieval
        const loadedConcerns: any[] = [];
        const caseIds = loadedBehavior.map(c => c.id);
        const chunkPromises = [];
        for (let i = 0; i < caseIds.length; i += 30) {
          const chunk = caseIds.slice(i, i + 30);
          const batchPromises = chunk.map(async (caseId) => {
            try {
              const subSnap = await getDocs(collection(db, 'behaviorCases', caseId, 'concerns'));
              return subSnap.docs.map(d => ({ id: d.id, caseId, ...d.data() }));
            } catch (e) {
              return [];
            }
          });
          chunkPromises.push(Promise.all(batchPromises));
        }
        const resolvedChunks = await Promise.all(chunkPromises);
        resolvedChunks.forEach(batch => {
          batch.forEach(arr => loadedConcerns.push(...arr));
        });
        setConcerns(loadedConcerns);

      } catch (err) {
        console.error("Error loading dashboard data:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // --- Fetch Dhuhur Data Reactively ---
  useEffect(() => {
    const fetchDhuhurDataForDashboard = async () => {
      setLoadingDhuhur(true);
      try {
        const { records, sourceDocumentCount } = await getDhuhurAttendanceRecords({
          unit: "JUNIOR_HIGH",
          academicYear: selectedYear,
          semester: Number(selectedSemester),
          startDate: startDate,
          endDate: endDate
        });

        // Diagnostics
        if (process.env.NODE_ENV !== 'production') {
          console.log('[DEV DIAGNOSTICS] HeadDashboard Dhuhur Query:', {
            dateRange: { startDate, endDate },
            selectedYear,
            selectedSemester,
            sourceDocumentCount,
            normalizedRecordsCount: records.length
          });
        }

        setDhuhurAttendanceRecords(records);
      } catch (err) {
        console.error("Error loading Dhuhur attendance for dashboard:", err);
      } finally {
        setLoadingDhuhur(false);
      }
    };

    fetchDhuhurDataForDashboard();
  }, [startDate, endDate, selectedYear, selectedSemester]);

  // --- Dynamic Filtering Helpers ---
  const filteredClasses = useMemo(() => {
    return classes.filter(c => !c.academicYear || c.academicYear === selectedYear);
  }, [classes, selectedYear]);

  const findClass = (idOrName: string) => {
    if (!idOrName) return undefined;
    return classes.find(c => 
      (c.id === idOrName || c.name === idOrName) && 
      (!c.academicYear || c.academicYear === selectedYear)
    );
  };

  const isStudentInClass = (studentClassId: string, targetClassId: string) => {
    if (targetClassId === 'ALL') return true;
    if (!studentClassId) return false;
    if (studentClassId === targetClassId) return true;
    
    const targetClass = findClass(targetClassId);
    if (targetClass && (studentClassId === targetClass.name || studentClassId === targetClass.id)) {
      return true;
    }
    const studentClass = findClass(studentClassId);
    if (studentClass && (studentClass.name === targetClassId || studentClass.id === targetClassId)) {
      return true;
    }
    return false;
  };

  const getStudentGrade = (s: any) => {
    if (s.grade) {
      const g = parseInt(s.grade);
      if (!isNaN(g)) return g;
    }
    if (s.classId) {
      const cls = findClass(s.classId);
      if (cls && cls.name) {
        const g = parseInt(cls.name);
        if (!isNaN(g)) return g;
      }
      const g = parseInt(s.classId);
      if (!isNaN(g)) return g;
    }
    return 0;
  };

  const isClassInCohort = (cls: any, cohort: string) => {
    if (cohort === 'ALL') return true;
    if (cls && cls.name) {
      const g = parseInt(cls.name);
      return g === parseInt(cohort);
    }
    return false;
  };

  // --- Dynamic Filtering Logic ---
  const resolvedStudents = useMemo(() => {
    return students.map(s => {
      // Find active enrollment for the selectedYear
      const activeEnrollment = enrollments.find(e => 
        (e.studentId === s.id || e.studentId === s.luminaId) && 
        e.academicYear === selectedYear && 
        e.status === 'active'
      );

      if (activeEnrollment) {
        return {
          ...s,
          classId: activeEnrollment.classId,
          academicYear: selectedYear,
          originalClassId: s.classId || ''
        };
      }
      return s;
    });
  }, [students, enrollments, selectedYear]);

  const filteredStudents = useMemo(() => {
    return resolvedStudents.filter(s => {
      if (s.academicYear && s.academicYear !== selectedYear) return false;
      if (selectedCohort !== 'ALL') {
        const studentGrade = getStudentGrade(s);
        if (studentGrade !== parseInt(selectedCohort)) return false;
      }
      if (selectedClassId !== 'ALL' && !isStudentInClass(s.classId, selectedClassId)) return false;
      return true;
    });
  }, [resolvedStudents, selectedClassId, selectedCohort, classes, selectedYear]);

  const activeStudentIds = useMemo(() => new Set(filteredStudents.map(s => s.id)), [filteredStudents]);
  const isStudentFiltered = (sid: string) => activeStudentIds.has(sid);

  // --- Unified Lateness Records ---
  const unifiedLateness = useMemo(() => {
    // 1. Get all lateness records matching JUNIOR_HIGH or filtered students
    const jhl = latenessRecords.filter(r => {
      if (r.academicYear && r.academicYear !== selectedYear) return false;
      return r.unitId === 'JUNIOR_HIGH' || isStudentFiltered(r.studentId);
    });
    
    // Create a set of studentId_date keys from lateness_records to avoid duplicates
    const existingKeys = new Set(jhl.map(r => `${r.studentId}_${r.date}`));
    
    // 2. Add LATE records from attendance_records that don't already have an entry in lateness_records
    const attendanceLates = attendanceRecords
      .filter(r => r.status === 'LATE' && isStudentFiltered(r.studentId) && (!r.academicYear || r.academicYear === selectedYear))
      .map(r => {
        const key = `${r.studentId}_${r.date}`;
        if (existingKeys.has(key)) return null;
        
        return {
          id: r.id,
          studentId: r.studentId,
          studentName: r.studentName,
          date: r.date,
          arrivalTime: r.arrivalTime || '07:45',
          latenessMinutes: r.latenessMinutes || 15,
          reason: r.note || 'Terlambat presensi kelas',
          parentNote: r.parentNote || '',
          classId: r.classId,
          className: findClass(r.classId)?.name || r.classId,
          academicYear: r.academicYear || selectedYear,
          unitId: 'JUNIOR_HIGH'
        };
      })
      .filter(Boolean) as any[];

    return [...jhl, ...attendanceLates];
  }, [latenessRecords, attendanceRecords, isStudentFiltered, classes, selectedYear]);

  const getLatenessMinutes = (r: any) => {
    if (r.latenessMinutes !== undefined && r.latenessMinutes !== null) return r.latenessMinutes;
    if (r.arrivalTime) {
      const timeToMinutes = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        if (isNaN(h) || isNaN(m)) return 450;
        return h * 60 + m;
      };
      const arrival = timeToMinutes(r.arrivalTime);
      const target = timeToMinutes('07:30');
      const diff = arrival - target;
      return diff > 0 ? diff : 0;
    }
    return 15;
  };

  const filteredAttendance = useMemo(() => {
    return attendanceRecords.filter(r => {
      if (r.academicYear && r.academicYear !== selectedYear) return false;
      if (r.semester && String(r.semester) !== String(selectedSemester)) return false;
      if (!isStudentFiltered(r.studentId)) return false;
      if (r.date < startDate || r.date > endDate) return false;
      return true;
    });
  }, [attendanceRecords, selectedYear, selectedSemester, isStudentFiltered, startDate, endDate]);

  const filteredLateness = useMemo(() => {
    return unifiedLateness.filter(r => {
      if (r.academicYear && r.academicYear !== selectedYear) return false;
      if (!isStudentFiltered(r.studentId)) return false;
      if (r.date < startDate || r.date > endDate) return false;
      return true;
    });
  }, [unifiedLateness, selectedYear, isStudentFiltered, startDate, endDate]);

  const filteredBehaviorCases = useMemo(() => {
    return behaviorCases.filter(c => {
      if (c.academicYear !== selectedYear) return false;
      if (!isStudentFiltered(c.studentId)) return false;
      return true;
    });
  }, [behaviorCases, selectedYear, isStudentFiltered]);

  const filteredAcademicCases = useMemo(() => {
    return academicCases.filter(c => {
      if (c.academicYear !== selectedYear) return false;
      if (String(c.semester) !== String(selectedSemester)) return false;
      if (!isStudentFiltered(c.studentId)) return false;
      return true;
    });
  }, [academicCases, selectedYear, selectedSemester, isStudentFiltered]);

  const filteredConcerns = useMemo(() => {
    const activeCaseIds = new Set(filteredBehaviorCases.map(c => c.id));
    return concerns.filter(con => {
      if (!activeCaseIds.has(con.caseId)) return false;
      const conDate = con.date || (con.createdAt ? new Date(con.createdAt).toISOString().split('T')[0] : '');
      if (conDate && (conDate < startDate || conDate > endDate)) return false;
      return true;
    });
  }, [concerns, filteredBehaviorCases, startDate, endDate]);

  const filteredGoalsResponses = useMemo(() => {
    return goalResponses.filter(r => {
      if (r.academicYear !== selectedYear) return false;
      if (String(r.semester) !== String(selectedSemester)) return false;
      if (!isStudentFiltered(r.studentId)) return false;
      return true;
    });
  }, [goalResponses, selectedYear, selectedSemester, isStudentFiltered]);

  const filteredGoalTrackers = useMemo(() => {
    return goalTrackers.filter(t => {
      if (!isStudentFiltered(t.studentId)) return false;
      const tDate = new Date(t.createdAt || t.entryDate).toISOString().split('T')[0];
      if (tDate < startDate || tDate > endDate) return false;
      return true;
    });
  }, [goalTrackers, isStudentFiltered, startDate, endDate]);

  const filteredLiteracy = useMemo(() => {
    return literacyRecords.filter(r => {
      if (r.schoolYear !== selectedYear) return false;
      if (!isStudentFiltered(r.studentId)) return false;
      return true;
    });
  }, [literacyRecords, selectedYear, isStudentFiltered]);

  // --- DAILY INSIGHTS COMPUTATION (CONNECTED TO ENDDATE FILTER) ---
  const todayStr = useMemo(() => endDate || new Date().toISOString().split('T')[0], [endDate]);

  // 1. Keterlambatan Hari Ini
  const todayLateness = useMemo(() => {
    const recordsToday = unifiedLateness.filter(r => r.date === todayStr && isStudentFiltered(r.studentId));
    const count = recordsToday.length;
    const totalMin = recordsToday.reduce((sum, r) => sum + getLatenessMinutes(r), 0);
    const avgMinutes = count > 0 ? Math.round(totalMin / count) : 0;
    
    // Repeated late in last 30 days
    const d30 = new Date(todayStr); d30.setDate(d30.getDate() - 30);
    const d30Str = d30.toISOString().split('T')[0];
    
    const repeated = recordsToday.map(rec => {
      const hist = unifiedLateness.filter(r => r.studentId === rec.studentId && r.date >= d30Str && r.date <= todayStr);
      return { studentId: rec.studentId, name: rec.studentName, classId: rec.classId, count: hist.length };
    }).filter(st => st.count > 1);

    return { count, avgMinutes, repeated, raw: recordsToday };
  }, [unifiedLateness, isStudentFiltered, todayStr]);

  // 2. Kehadiran per Kelas Hari Ini
  const todayClassAttendance = useMemo(() => {
    const jhClasses = filteredClasses.filter(c => {
      if (selectedClassId !== 'ALL' && c.id !== selectedClassId) return false;
      if (selectedCohort !== 'ALL' && !isClassInCohort(c, selectedCohort)) return false;
      return true;
    });
    return jhClasses.map(cls => {
      const clsStudents = resolvedStudents.filter(s => {
        if (s.academicYear && s.academicYear !== selectedYear) return false;
        return isStudentInClass(s.classId, cls.id);
      });
      const recsToday = attendanceRecords.filter(r => {
        if (r.academicYear && r.academicYear !== selectedYear) return false;
        return isStudentInClass(r.classId, cls.id) && r.date === todayStr;
      });
      
      const hadir = recsToday.filter(r => r.status === 'HADIR' || r.status === 'LATE').length;
      const sakit = recsToday.filter(r => r.status === 'SAKIT').length;
      const izin = recsToday.filter(r => r.status === 'IZIN').length;
      const alpa = recsToday.filter(r => r.status === 'ALPA').length;
      
      const isCompleted = clsStudents.length === 0 || recsToday.length >= clsStudents.length;
      return { classId: cls.id, className: cls.name, teacher: cls.homeroomTeacherName || 'Guru', totalStudents: clsStudents.length, recsCount: recsToday.length, hadir, sakit, izin, alpa, isCompleted };
    });
  }, [filteredClasses, resolvedStudents, attendanceRecords, todayStr, selectedClassId, selectedCohort, selectedYear]);

  // 3. Daily Case Record (Behavior Intervention Records - created today)
  const todayCases = useMemo(() => {
    const tStart = new Date(todayStr + 'T00:00:00').getTime();
    const tEnd = new Date(todayStr + 'T23:59:59.999').getTime();
    const casesToday = behaviorCases.filter(c => c.academicYear === selectedYear && c.createdAt >= tStart && c.createdAt <= tEnd && isStudentFiltered(c.studentId));
    
    return {
      total: casesToday.length,
      open: casesToday.filter(c => c.status === 'OPEN').length,
      review: casesToday.filter(c => c.status === 'UNDER_REVIEW').length,
      closed: casesToday.filter(c => c.status === 'CLOSED').length,
      raw: casesToday
    };
  }, [behaviorCases, isStudentFiltered, todayStr, selectedYear]);

  // 4. Incident Report Hari Ini (Concerns logged today)
  const todayIncidents = useMemo(() => {
    const jhCaseIds = new Set(behaviorCases.filter(c => c.academicYear === selectedYear && isStudentFiltered(c.studentId)).map(c => c.id));
    const incidents = concerns.filter(con => {
      if (!jhCaseIds.has(con.caseId)) return false;
      const conDate = con.date || (con.createdAt ? new Date(con.createdAt).toISOString().split('T')[0] : '');
      return conDate === todayStr;
    });

    const categoryMap = { Disiplin: 0, Sikap: 0, Kerapihan: 0, Sosial: 0, Lainnya: 0 };
    incidents.forEach(inc => {
      const desc = (inc.description || '').toLowerCase();
      if (desc.includes('telat') || desc.includes('bolos')) categoryMap.Disiplin++;
      else if (desc.includes('ribut') || desc.includes('kasar')) categoryMap.Sikap++;
      else if (desc.includes('seragam') || desc.includes('rambut')) categoryMap.Kerapihan++;
      else if (desc.includes('bully') || desc.includes('teman')) categoryMap.Sosial++;
      else categoryMap.Lainnya++;
    });

    return { total: incidents.length, categoryMap, raw: incidents };
  }, [concerns, behaviorCases, isStudentFiltered, todayStr]);

  // 5. Follow-up Hari Ini (Pending reviews & stagnant cases)
  const todayFollowUps = useMemo(() => {
    const activeCaseIds = new Set(behaviorCases.filter(c => c.academicYear === selectedYear && isStudentFiltered(c.studentId)).map(c => c.id));
    const pendingConcerns = concerns.filter(con => {
      if (!activeCaseIds.has(con.caseId)) return false;
      return !con.isDone && con.nextStepDueDate && con.nextStepDueDate <= todayStr;
    });

    const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const stagnantAcademic = academicCases.filter(c => c.academicYear === selectedYear && c.status !== 'CLOSED' && c.updatedAt < fourteenDaysAgo && isStudentFiltered(c.studentId));
    const stagnantBehavior = behaviorCases.filter(c => c.academicYear === selectedYear && c.status !== 'CLOSED' && c.lastUpdatedAt < fourteenDaysAgo && isStudentFiltered(c.studentId));

    return {
      pendingConcerns,
      stagnantAcademic,
      stagnantBehavior,
      total: pendingConcerns.length + stagnantAcademic.length + stagnantBehavior.length
    };
  }, [concerns, behaviorCases, academicCases, isStudentFiltered, todayStr, selectedYear]);

  // 6. Data Belum Lengkap
  const incompleteData = useMemo(() => {
    const uncompletedClasses = todayClassAttendance.filter(c => !c.isCompleted);
    
    // Goal missing mentor
    const mentorsMap = new Set(mentorAssignments.filter(asg => asg.status === 'ACTIVE').map(asg => asg.studentId));
    const goalsNoMentor = filteredGoalsResponses.filter(r => (r.goals || []).length > 0 && !mentorsMap.has(r.studentId));

    // No goal check-ins
    const responsesWithGoals = filteredGoalsResponses.filter(r => (r.goals || []).length > 0);
    const studentsCheckedIn = new Set(filteredGoalTrackers.map(t => t.studentId));
    const goalsNoCheckIn = responsesWithGoals.filter(r => !studentsCheckedIn.has(r.studentId));

    return {
      uncompletedClasses,
      goalsNoMentor,
      goalsNoCheckIn,
      total: uncompletedClasses.length + goalsNoMentor.length + goalsNoCheckIn.length
    };
  }, [todayClassAttendance, filteredGoalsResponses, mentorAssignments, filteredGoalTrackers]);

  const allIncompleteToday = useMemo(() => {
    const list: any[] = [];
    incompleteData.uncompletedClasses.forEach(c => {
      list.push({ tipe: 'Belum Input Presensi', objek: c.className, keterangan: `Homeroom: ${c.teacher}` });
    });
    incompleteData.goalsNoMentor.forEach(g => {
      list.push({ tipe: 'Goal Tanpa Mentor', objek: g.studentName, keterangan: `Kelas: ${g.className}` });
    });
    incompleteData.goalsNoCheckIn.forEach(g => {
      list.push({ tipe: 'Belum Check-in/Refleksi', objek: g.studentName, keterangan: `Kelas: ${g.className}` });
    });
    return list;
  }, [incompleteData]);


  // --- ANALISIS SECTIONS COMPUTATIONS ---

  // 1. Keterlambatan Tab Analysis
  const latenessAnalysis = useMemo(() => {
    const records = filteredLateness;
    const totalCount = records.length;
    const avgMin = totalCount > 0 ? Math.round(records.reduce((sum, r) => sum + getLatenessMinutes(r), 0) / totalCount) : 0;

    // Day of week mapping
    const dayCounts: Record<string, number> = { 'Senin': 0, 'Selasa': 0, 'Rabu': 0, 'Kamis': 0, 'Jumat': 0 };
    const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    records.forEach(r => {
      const dayName = dayNames[new Date(r.date).getDay()];
      if (dayCounts[dayName] !== undefined) dayCounts[dayName]++;
    });
    const topDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0];

    // Class ranks
    const classCounts: Record<string, number> = {};
    records.forEach(r => {
      const className = findClass(r.classId)?.name || r.classId;
      classCounts[className] = (classCounts[className] || 0) + 1;
    });
    const classRank = Object.entries(classCounts).map(([name, count]) => ({ name, count })).sort((a,b) => b.count - a.count);

    // Repeated students
    const studentCounts: Record<string, { name: string, className: string, count: number, totalMin: number }> = {};
    records.forEach(r => {
      if (!studentCounts[r.studentId]) {
        const clsName = findClass(r.classId)?.name || r.classId;
        studentCounts[r.studentId] = { name: r.studentName, className: clsName, count: 0, totalMin: 0 };
      }
      studentCounts[r.studentId].count++;
      studentCounts[r.studentId].totalMin += getLatenessMinutes(r);
    });
    const studentRank = Object.entries(studentCounts).map(([id, s]) => ({
      id,
      name: s.name,
      className: s.className,
      count: s.count,
      avgMinutes: Math.round(s.totalMin / s.count)
    })).sort((a,b) => b.count - a.count);

    // Timeline Chart Trend
    const trendMap: Record<string, number> = {};
    records.forEach(r => {
      trendMap[r.date] = (trendMap[r.date] || 0) + 1;
    });
    const chartData = Object.entries(trendMap).map(([date, count]) => ({
      date,
      displayDate: date.substring(5),
      count
    })).sort((a, b) => a.date.localeCompare(b.date));

    return { totalCount, avgMin, topDayName: topDay ? topDay[0] : '-', topDayCount: topDay ? topDay[1] : 0, classRank, studentRank, chartData };
  }, [filteredLateness, classes, selectedYear]);

  // 2. Kehadiran Tab Analysis (Junior High Revised version)
  
  // Convert date string "YYYY-MM-DD" to working days count
  const getWorkingDaysCount = (startStr: string, endStr: string, holidays: string[]): number => {
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return 0;
    
    let count = 0;
    const current = new Date(start);
    while (current <= end) {
      const day = current.getDay();
      if (day !== 0 && day !== 6) { // 0 = Sunday, 6 = Saturday
        const dateStr = current.getFullYear() + '-' + 
                        String(current.getMonth() + 1).padStart(2, '0') + '-' + 
                        String(current.getDate()).padStart(2, '0');
        if (!holidays.includes(dateStr)) {
          count++;
        }
      }
      current.setDate(current.getDate() + 1);
    }
    return count;
  };

  const jhWorkingDaysForAnalysis = useMemo(() => {
    return getWorkingDaysCount(startDate, endDate, schoolHolidays);
  }, [startDate, endDate, schoolHolidays]);

  // Audit Range definition
  const auditStartDate = '2026-07-20';
  const auditEndDate = useMemo(() => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const yesterdayStr = yesterday.getFullYear() + '-' + 
                         String(yesterday.getMonth() + 1).padStart(2, '0') + '-' + 
                         String(yesterday.getDate()).padStart(2, '0');
    
    return endDate < yesterdayStr ? endDate : yesterdayStr;
  }, [endDate]);

  const auditWorkingDaysCount = useMemo(() => {
    return getWorkingDaysCount(auditStartDate, auditEndDate, schoolHolidays);
  }, [auditEndDate, schoolHolidays]);

  const isAuditValid = useMemo(() => {
    return auditEndDate >= auditStartDate;
  }, [auditEndDate]);

  // Generate audit dates
  const auditDates = useMemo(() => {
    if (!isAuditValid) return [];
    
    const dates: string[] = [];
    const start = new Date(auditStartDate);
    const end = new Date(auditEndDate);
    const temp = new Date(start);
    
    while (temp <= end) {
      const day = temp.getDay();
      const isWeekend = day === 0 || day === 6;
      const dateStr = temp.getFullYear() + '-' + 
                      String(temp.getMonth() + 1).padStart(2, '0') + '-' + 
                      String(temp.getDate()).padStart(2, '0');
      
      const isHoliday = schoolHolidays.includes(dateStr);
      if (!isWeekend && !isHoliday) {
        dates.push(dateStr);
      }
      temp.setDate(temp.getDate() + 1);
    }
    return dates;
  }, [auditEndDate, schoolHolidays, isAuditValid]);

  // Students list ignored by selectedCohort filter
  const jhFilteredStudentsForAttendance = useMemo(() => {
    return resolvedStudents.filter(s => {
      if (s.academicYear && s.academicYear !== selectedYear) return false;
      if (selectedClassId !== 'ALL' && !isStudentInClass(s.classId, selectedClassId)) return false;
      return true;
    });
  }, [resolvedStudents, selectedClassId, selectedYear]);

  const jhFilteredStudentIdsForAttendance = useMemo(() => new Set(jhFilteredStudentsForAttendance.map(s => s.id)), [jhFilteredStudentsForAttendance]);
  const isStudentFilteredForAttendance = (sid: string) => jhFilteredStudentIdsForAttendance.has(sid);

  const jhRekapPengisian = useMemo(() => {
    return filteredClasses.map(cls => {
      // Get roster of active students for this class in selected year
      const roster = resolvedStudents.filter(s => {
        if (s.academicYear && s.academicYear !== selectedYear) return false;
        return isStudentInClass(s.classId, cls.id);
      });

      const rosterIds = new Set(roster.map(s => s.id));
      const rosterCount = roster.length;

      // Group records of this class by date
      const classKeys = [cls.id, cls.name].filter(Boolean);
      
      const classRecordsForAudit = attendanceRecords.filter(rec => {
        if (rec.academicYear && rec.academicYear !== selectedYear) return false;
        if (rec.semester && String(rec.semester) !== String(selectedSemester)) return false;
        if (!classKeys.includes(rec.classId)) return false;
        return rec.date >= auditStartDate && rec.date <= auditEndDate;
      });

      const dateRecordsMap = new Map<string, any[]>();
      classRecordsForAudit.forEach(rec => {
        if (rec.date) {
          if (!dateRecordsMap.has(rec.date)) {
            dateRecordsMap.set(rec.date, []);
          }
          dateRecordsMap.get(rec.date)!.push(rec);
        }
      });

      const missingDatesList: string[] = [];
      
      auditDates.forEach(dateStr => {
        const dayRecords = dateRecordsMap.get(dateStr) || [];
        
        const filledStudentsCount = dayRecords.filter(rec => {
          if (!rosterIds.has(rec.studentId)) return false;
          const hasStatus = rec.status && typeof rec.status === 'string' && rec.status.trim() !== '';
          const isDraftStatus = rec.status === 'DRAFT' || rec.isDraft;
          return hasStatus && !isDraftStatus;
        }).length;

        if (rosterCount === 0 || filledStudentsCount < rosterCount) {
          missingDatesList.push(dateStr);
        }
      });

      missingDatesList.sort((a, b) => a.localeCompare(b));

      let clsPresent = 0;
      let clsTotal = 0;
      
      attendanceRecords
        .filter(rec => {
          if (rec.academicYear && rec.academicYear !== selectedYear) return false;
          if (rec.semester && String(rec.semester) !== String(selectedSemester)) return false;
          if (!classKeys.includes(rec.classId)) return false;
          return rec.date >= startDate && rec.date <= endDate;
        })
        .forEach(rec => {
          if (!rec.status) return;
          const s = String(rec.status).toUpperCase();
          if (['HADIR', 'LATE', 'H', 'T'].includes(s)) {
            clsPresent++;
            clsTotal++;
          } else if (['SAKIT', 'IZIN', 'ALPA', 'S', 'I', 'A'].includes(s)) {
            clsTotal++;
          }
        });

      const attendanceRate = clsTotal > 0 ? Math.min(100, Math.round((clsPresent / clsTotal) * 100)) : 100;
      const filledDaysCount = Math.max(0, auditWorkingDaysCount - missingDatesList.length);

      return {
        id: cls.id,
        name: cls.name,
        teacher: cls.homeroomTeacherName || 'Guru',
        filledDaysCount,
        missingDates: missingDatesList,
        rate: attendanceRate,
        rosterCount
      };
    }).sort((a, b) => b.missingDates.length - a.missingDates.length);
  }, [filteredClasses, resolvedStudents, attendanceRecords, selectedYear, selectedSemester, auditDates, auditWorkingDaysCount, startDate, endDate]);

  const jhRekapPengisianDhuhur = useMemo(() => {
    // Build a fast lookup map for Salat Dhuhur records: key: studentId_date
    const dhuhurLookup = new Map<string, string>();
    dhuhurAttendanceRecords.forEach(rec => {
      dhuhurLookup.set(`${rec.studentId}_${rec.date}`, rec.status);
    });

    return filteredClasses.map(cls => {
      const roster = resolvedStudents.filter(s => {
        if (s.academicYear && s.academicYear !== selectedYear) return false;
        return isStudentInClass(s.classId, cls.id);
      });

      const rosterCount = roster.length;
      const classKeys = [cls.id, cls.name].filter(Boolean);

      // We still need class school records for checking if a student is absent/sick/etc on a given date
      const schoolRecordsForAudit = attendanceRecords.filter(rec => {
        if (rec.academicYear && rec.academicYear !== selectedYear) return false;
        if (rec.semester && String(rec.semester) !== String(selectedSemester)) return false;
        if (!classKeys.includes(rec.classId)) return false;
        return rec.date >= auditStartDate && rec.date <= auditEndDate;
      });

      const schoolRecordsMap = new Map<string, any>(); // key: `${studentId}_${date}`
      schoolRecordsForAudit.forEach(rec => {
        if (rec.studentId && rec.date) {
          schoolRecordsMap.set(`${rec.studentId}_${rec.date}`, rec);
        }
      });

      const missingDatesList: string[] = [];
      
      auditDates.forEach(dateStr => {
        const incompleteForDay = roster.some(st => {
          // If the student has a school absence/sick/etc record for this date, they are excused from Salat Dhuhur
          const schoolRec = schoolRecordsMap.get(`${st.id}_${dateStr}`);
          const schoolStatus = schoolRec?.status;
          if (schoolStatus && ['SAKIT', 'IZIN', 'ALPA', 'S', 'I', 'A'].includes(String(schoolStatus).toUpperCase())) {
            return false;
          }

          // Look up their Salat Dhuhur status
          const shalatStatus = dhuhurLookup.get(`${st.id}_${dateStr}`) || 'BELUM_DIISI';
          return shalatStatus === 'BELUM_DIISI';
        });

        if (rosterCount > 0 && incompleteForDay) {
          missingDatesList.push(dateStr);
        }
      });

      missingDatesList.sort((a, b) => a.localeCompare(b));

      let clsSalatBerjamaah = 0;
      let clsSalatTotal = 0;

      // Filter dhuhurAttendanceRecords for this class and date range
      dhuhurAttendanceRecords.forEach(rec => {
        // Must belong to this class roster & date range
        if (rec.date < startDate || rec.date > endDate) return;
        const isInRoster = roster.some(st => st.id === rec.studentId);
        if (!isInRoster) return;

        const status = rec.status;
        if (status === 'SALAT_BERJAMAAH') {
          clsSalatBerjamaah++;
          clsSalatTotal++;
        } else if (status === 'BERHALANGAN' || status === 'IZIN' || status === 'TIDAK_MENGIKUTI') {
          clsSalatTotal++;
        }
      });

      const salatRate = clsSalatTotal > 0 ? Math.min(100, Math.round((clsSalatBerjamaah / clsSalatTotal) * 100)) : 100;
      const filledDaysCount = Math.max(0, auditWorkingDaysCount - missingDatesList.length);

      return {
        id: cls.id,
        name: cls.name,
        teacher: cls.homeroomTeacherName || 'Guru',
        filledDaysCount,
        missingDates: missingDatesList,
        rate: salatRate,
        rosterCount
      };
    }).sort((a, b) => b.missingDates.length - a.missingDates.length);
  }, [filteredClasses, resolvedStudents, attendanceRecords, dhuhurAttendanceRecords, selectedYear, selectedSemester, auditDates, auditWorkingDaysCount, startDate, endDate, auditStartDate, auditEndDate]);

  const lowestClassAuditDhuhur = useMemo(() => {
    if (!isAuditValid || auditWorkingDaysCount === 0 || jhRekapPengisianDhuhur.length === 0) {
      return '—';
    }
    const lowest = jhRekapPengisianDhuhur[0];
    if (lowest.missingDates.length === 0) {
      return 'Semua kelas lengkap';
    }
    return `${lowest.name} (${lowest.filledDaysCount}/${auditWorkingDaysCount} Hari)`;
  }, [jhRekapPengisianDhuhur, auditWorkingDaysCount, isAuditValid]);

  const jhAverageSalat = useMemo(() => {
    let jamaahCount = 0;
    let totalCount = 0;

    dhuhurAttendanceRecords.forEach(rec => {
      // Must be filtered for attendance
      if (!isStudentFilteredForAttendance(rec.studentId)) return;
      if (rec.date < startDate || rec.date > endDate) return;

      const status = rec.status;
      if (status === 'SALAT_BERJAMAAH') {
        jamaahCount++;
        totalCount++;
      } else if (status === 'BERHALANGAN' || status === 'IZIN' || status === 'TIDAK_MENGIKUTI') {
        totalCount++;
      }
    });

    return totalCount > 0 ? Math.min(100, Math.round((jamaahCount / totalCount) * 100)) : 100;
  }, [dhuhurAttendanceRecords, isStudentFilteredForAttendance, startDate, endDate]);

  const jhSalatBreakdown = useMemo(() => {
    let jamaah = 0;
    let berhalangan = 0;
    let izin = 0;
    let tidakMengikuti = 0;

    dhuhurAttendanceRecords.forEach(rec => {
      if (!isStudentFilteredForAttendance(rec.studentId)) return;
      if (rec.date < startDate || rec.date > endDate) return;

      const status = rec.status;
      if (status === 'SALAT_BERJAMAAH') jamaah++;
      else if (status === 'BERHALANGAN') berhalangan++;
      else if (status === 'IZIN') izin++;
      else if (status === 'TIDAK_MENGIKUTI') tidakMengikuti++;
    });

    return { jamaah, berhalangan, izin, tidakMengikuti };
  }, [dhuhurAttendanceRecords, isStudentFilteredForAttendance, startDate, endDate]);

  const lowestClassAudit = useMemo(() => {
    if (!isAuditValid || auditWorkingDaysCount === 0 || jhRekapPengisian.length === 0) {
      return '—';
    }
    
    const lowest = jhRekapPengisian[0];
    
    if (lowest.missingDates.length === 0) {
      return 'Semua kelas lengkap';
    }
    
    return `${lowest.name} (${lowest.filledDaysCount}/${auditWorkingDaysCount} Hari)`;
  }, [jhRekapPengisian, auditWorkingDaysCount, isAuditValid]);

  const jhAverageAttendance = useMemo(() => {
    let presentCount = 0;
    let totalCount = 0;
    
    attendanceRecords.forEach(rec => {
      if (!isStudentFilteredForAttendance(rec.studentId)) return;
      if (rec.academicYear && rec.academicYear !== selectedYear) return;
      if (rec.semester && String(rec.semester) !== String(selectedSemester)) return;
      if (rec.date < startDate || rec.date > endDate) return;
      
      if (!rec.status) return;
      const s = String(rec.status).toUpperCase();
      if (['HADIR', 'LATE', 'H', 'T'].includes(s)) {
        presentCount++;
        totalCount++;
      } else if (['SAKIT', 'IZIN', 'ALPA', 'S', 'I', 'A'].includes(s)) {
        totalCount++;
      }
    });
    
    return totalCount > 0 ? Math.min(100, Math.round((presentCount / totalCount) * 100)) : 100;
  }, [attendanceRecords, isStudentFilteredForAttendance, selectedYear, selectedSemester, startDate, endDate]);

  const jhAttentionStudents = useMemo(() => {
    const studentStatsMap = new Map<string, { hadir: number; sakit: number; izin: number; alpa: number; total: number }>();
    
    // Helper to resolve student info strictly following the mandatory data flow
    const resolveStudentInfo = (studentId: string, attendanceRecord?: any) => {
      // Find active enrollment for the selectedYear
      const activeEnrollment = enrollments.find(e => 
        (e.studentId === studentId) && 
        e.academicYear === selectedYear && 
        e.status === 'active'
      );

      // Find student profile in students (filtered to JUNIOR_HIGH in fetch)
      const studentProfile = students.find(s => 
        s.id === studentId || 
        s.luminaId === studentId || 
        (activeEnrollment && (s.id === activeEnrollment.studentId || s.luminaId === activeEnrollment.studentId))
      );

      // Fallback display values
      const studentName =
        studentProfile?.fullName ||
        studentProfile?.name ||
        attendanceRecord?.studentName ||
        "Siswa tidak ditemukan";

      const studentNis =
        studentProfile?.nis ||
        attendanceRecord?.nis ||
        "-";

      if (studentId && !studentProfile) {
        console.warn(`[WARNING] Profil tidak ditemukan untuk studentId: ${studentId}. Relasi data perlu diperbaiki.`);
      }

      // Class resolution
      const classId = activeEnrollment?.classId || studentProfile?.classId || attendanceRecord?.classId;
      const classObj = classes.find(c => c.id === classId || c.name === classId);
      const className = classObj?.name || '—';

      return {
        id: studentId,
        name: studentName,
        nis: studentNis,
        classId: classId || '',
        className: className,
        isProfileFound: !!studentProfile
      };
    };

    // 1. Initialize with all filtered students
    jhFilteredStudentsForAttendance.forEach(st => {
      studentStatsMap.set(st.id, { hadir: 0, sakit: 0, izin: 0, alpa: 0, total: 0 });
    });

    // 2. Accumulate attendance record stats
    attendanceRecords.forEach(rec => {
      if (!rec.studentId || !rec.status) return;
      
      // Filter by academic year, semester, date range
      if (rec.academicYear && rec.academicYear !== selectedYear) return;
      if (rec.semester && String(rec.semester) !== String(selectedSemester)) return;
      if (rec.date < startDate || rec.date > endDate) return;

      // If not yet in map, check if this is a JUNIOR_HIGH student that should be in the stats
      if (!studentStatsMap.has(rec.studentId)) {
        const resolved = resolveStudentInfo(rec.studentId, rec);
        // Is it part of the filtered class?
        const isClassMatched = selectedClassId === 'ALL' || resolved.classId === selectedClassId;
        
        // Is it part of Junior High? Yes, if resolved in Junior High students or class
        const isJuniorHigh = resolved.isProfileFound || classes.some(c => c.id === resolved.classId);
        
        if (isJuniorHigh && isClassMatched) {
          studentStatsMap.set(rec.studentId, { hadir: 0, sakit: 0, izin: 0, alpa: 0, total: 0 });
        } else {
          return; // Skip this record if not matching our JUNIOR_HIGH filters
        }
      }

      const current = studentStatsMap.get(rec.studentId)!;
      const s = String(rec.status).toUpperCase();
      
      if (['HADIR', 'LATE', 'H', 'T'].includes(s)) {
        current.hadir++;
        current.total++;
      } else if (['SAKIT', 'S'].includes(s)) {
        current.sakit++;
        current.total++;
      } else if (['IZIN', 'I'].includes(s)) {
        current.izin++;
        current.total++;
      } else if (['ALPA', 'A'].includes(s)) {
        current.alpa++;
        current.total++;
      }
    });

    const list: any[] = [];
    studentStatsMap.forEach((stats, studentId) => {
      // Resolve student profile & class metadata for final list
      const resolved = resolveStudentInfo(studentId);

      const rate = stats.total > 0 ? Math.min(100, Math.round((stats.hadir / stats.total) * 100)) : 100;
      const totalAbsence = stats.sakit + stats.izin + stats.alpa;
      const needsAttention = stats.alpa > 1 || totalAbsence > 3;

      if (needsAttention) {
        list.push({
          id: studentId,
          name: resolved.name,
          nis: resolved.nis,
          classId: resolved.classId,
          className: resolved.className,
          ...stats,
          totalAbsence,
          rate
        });
      }
    });

    return list;
  }, [jhFilteredStudentsForAttendance, attendanceRecords, enrollments, students, classes, selectedYear, selectedSemester, startDate, endDate, selectedClassId]);

  const absentDatesForSelectedStudent = useMemo(() => {
    if (!selectedStudentForAttendanceDetail) return [];
    
    return attendanceRecords
      .filter(rec => {
        if (rec.studentId !== selectedStudentForAttendanceDetail.id) return false;
        if (rec.academicYear && rec.academicYear !== selectedYear) return false;
        if (rec.semester && String(rec.semester) !== String(selectedSemester)) return false;
        if (rec.date < startDate || rec.date > endDate) return false;
        
        const s = String(rec.status || '').toUpperCase();
        return ['SAKIT', 'S', 'IZIN', 'I', 'ALPA', 'A'].includes(s);
      })
      .map(rec => {
        let statusLabel = 'Belum Diketahui';
        let statusColor = 'text-gray-600 bg-gray-50 border-gray-100';
        const s = String(rec.status).toUpperCase();
        if (['SAKIT', 'S'].includes(s)) {
          statusLabel = 'Sakit';
          statusColor = 'text-amber-700 bg-amber-50 border-amber-100';
        } else if (['IZIN', 'I'].includes(s)) {
          statusLabel = 'Izin';
          statusColor = 'text-blue-700 bg-blue-50 border-blue-100';
        } else if (['ALPA', 'A'].includes(s)) {
          statusLabel = 'Alpa (Tanpa Keterangan)';
          statusColor = 'text-red-700 bg-red-50 border-red-100';
        }
        
        return {
          date: rec.date,
          statusLabel,
          statusColor,
          note: rec.note || rec.reason || rec.keterangan || '—'
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [selectedStudentForAttendanceDetail, attendanceRecords, selectedYear, selectedSemester, startDate, endDate]);

  const salatHistoryForSelectedStudent = useMemo(() => {
    if (!selectedStudentForAttendanceDetail || !selectedStudentForAttendanceDetail.isSalat) return [];
    
    return attendanceRecords
      .filter(rec => {
        if (rec.studentId !== selectedStudentForAttendanceDetail.id) return false;
        if (rec.academicYear && rec.academicYear !== selectedYear) return false;
        if (rec.semester && String(rec.semester) !== String(selectedSemester)) return false;
        if (rec.date < startDate || rec.date > endDate) return false;
        return true;
      })
      .map(rec => {
        const shalatStatus = rec.dhuhrPrayerStatus?.status || 'BELUM_DIISI';
        let statusLabel = 'Belum Diisi';
        let statusColor = 'text-gray-600 bg-gray-50 border-gray-100';

        if (shalatStatus === 'SALAT_BERJAMAAH') {
          statusLabel = 'Salat Berjamaah';
          statusColor = 'text-emerald-700 bg-emerald-50 border-emerald-100';
        } else if (shalatStatus === 'BERHALANGAN') {
          statusLabel = 'Berhalangan';
          statusColor = 'text-amber-700 bg-amber-50 border-amber-100';
        } else if (shalatStatus === 'IZIN') {
          statusLabel = 'Izin';
          statusColor = 'text-blue-700 bg-blue-50 border-blue-100';
        } else if (shalatStatus === 'TIDAK_MENGIKUTI') {
          statusLabel = 'Tidak Mengikuti';
          statusColor = 'text-red-700 bg-red-50 border-red-100';
        }

        return {
          date: rec.date,
          statusLabel,
          statusColor,
          note: rec.dhuhrPrayerStatus?.reason || rec.dhuhrPrayerStatus?.keterangan || '—'
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [selectedStudentForAttendanceDetail, attendanceRecords, selectedYear, selectedSemester, startDate, endDate]);

  const filteredJhAttentionStudents = useMemo(() => {
    const term = (jhSearchTerm || '').trim().toLowerCase();
    const safeAttentionStudents = Array.isArray(jhAttentionStudents) ? jhAttentionStudents : [];
    return safeAttentionStudents.filter(item => {
      if (!item) return false;
      const studentName = (item.name || '').toString().toLowerCase();
      const className = (item.className || '').toString().toLowerCase();
      return studentName.includes(term) || className.includes(term);
    }).sort((a, b) => (b.alpa || 0) - (a.alpa || 0) || (a.rate || 0) - (b.rate || 0));
  }, [jhAttentionStudents, jhSearchTerm]);

  const jhItemsPerPage = 10;
  const jhTotalPages = Math.max(1, Math.ceil(filteredJhAttentionStudents.length / jhItemsPerPage));
  const paginatedJhAttentionStudents = useMemo(() => {
    const start = (jhCurrentPage - 1) * jhItemsPerPage;
    return filteredJhAttentionStudents.slice(start, start + jhItemsPerPage);
  }, [filteredJhAttentionStudents, jhCurrentPage]);

  const jhSalatAttentionStudents = useMemo(() => {
    const studentStatsMap = new Map<string, { jamaah: number; berhalangan: number; izin: number; tidakMengikuti: number; totalRequired: number }>();
    
    const resolveStudentInfoLocal = (studentId: string, attendanceRecord?: any) => {
      const activeEnrollment = enrollments.find(e => 
        (e.studentId === studentId) && 
        e.academicYear === selectedYear && 
        e.status === 'active'
      );

      const studentProfile = students.find(s => 
        s.id === studentId || 
        s.luminaId === studentId || 
        (activeEnrollment && (s.id === activeEnrollment.studentId || s.luminaId === activeEnrollment.studentId))
      );

      const studentName =
        studentProfile?.fullName ||
        studentProfile?.name ||
        attendanceRecord?.studentName ||
        "Siswa tidak ditemukan";

      const studentNis =
        studentProfile?.nis ||
        attendanceRecord?.nis ||
        "-";

      const classId = activeEnrollment?.classId || studentProfile?.classId || attendanceRecord?.classId;
      const classObj = classes.find(c => c.id === classId || c.name === classId);
      const className = classObj?.name || '—';

      return {
        id: studentId,
        name: studentName,
        nis: studentNis,
        classId: classId || '',
        className: className,
        isProfileFound: !!studentProfile
      };
    };

    // Initialize with all filtered students
    jhFilteredStudentsForAttendance.forEach(st => {
      studentStatsMap.set(st.id, { jamaah: 0, berhalangan: 0, izin: 0, tidakMengikuti: 0, totalRequired: 0 });
    });

    // Accumulate Salat Zuhur record stats
    attendanceRecords.forEach(rec => {
      if (!rec.studentId) return;
      if (rec.academicYear && rec.academicYear !== selectedYear) return;
      if (rec.semester && String(rec.semester) !== String(selectedSemester)) return;
      if (rec.date < startDate || rec.date > endDate) return;

      if (!studentStatsMap.has(rec.studentId)) {
        const resolved = resolveStudentInfoLocal(rec.studentId, rec);
        const isClassMatched = selectedClassId === 'ALL' || resolved.classId === selectedClassId;
        const isJuniorHigh = resolved.isProfileFound || classes.some(c => c.id === resolved.classId);
        if (isJuniorHigh && isClassMatched) {
          studentStatsMap.set(rec.studentId, { jamaah: 0, berhalangan: 0, izin: 0, tidakMengikuti: 0, totalRequired: 0 });
        } else {
          return;
        }
      }

      const current = studentStatsMap.get(rec.studentId)!;
      const shalatStatus = rec.dhuhrPrayerStatus?.status || 'BELUM_DIISI';
      if (shalatStatus === 'SALAT_BERJAMAAH') {
        current.jamaah++;
        current.totalRequired++;
      } else if (shalatStatus === 'TIDAK_MENGIKUTI') {
        current.tidakMengikuti++;
        current.totalRequired++;
      } else if (shalatStatus === 'BERHALANGAN') {
        current.berhalangan++;
      } else if (shalatStatus === 'IZIN') {
        current.izin++;
      }
    });

    const list: any[] = [];
    studentStatsMap.forEach((stats, studentId) => {
      const resolved = resolveStudentInfoLocal(studentId);
      const rate = stats.totalRequired > 0 ? Math.min(100, Math.round((stats.jamaah / stats.totalRequired) * 100)) : 100;
      const needsAttention = stats.tidakMengikuti > 1 || (stats.totalRequired >= 3 && rate < 85);

      if (needsAttention) {
        list.push({
          id: studentId,
          name: resolved.name,
          nis: resolved.nis,
          classId: resolved.classId,
          className: resolved.className,
          ...stats,
          rate
        });
      }
    });

    return list;
  }, [jhFilteredStudentsForAttendance, attendanceRecords, enrollments, students, classes, selectedYear, selectedSemester, startDate, endDate, selectedClassId]);

  const filteredJhSalatAttentionStudents = useMemo(() => {
    const term = (jhSearchTerm || '').trim().toLowerCase();
    const safeAttentionStudents = Array.isArray(jhSalatAttentionStudents) ? jhSalatAttentionStudents : [];
    return safeAttentionStudents.filter(item => {
      if (!item) return false;
      const studentName = (item.name || '').toString().toLowerCase();
      const className = (item.className || '').toString().toLowerCase();
      return studentName.includes(term) || className.includes(term);
    }).sort((a, b) => (b.tidakMengikuti || 0) - (a.tidakMengikuti || 0) || (a.rate || 0) - (b.rate || 0));
  }, [jhSalatAttentionStudents, jhSearchTerm]);

  const jhSalatTotalPages = Math.max(1, Math.ceil(filteredJhSalatAttentionStudents.length / jhItemsPerPage));
  const paginatedJhSalatAttentionStudents = useMemo(() => {
    const start = (jhCurrentPage - 1) * jhItemsPerPage;
    return filteredJhSalatAttentionStudents.slice(start, start + jhItemsPerPage);
  }, [filteredJhSalatAttentionStudents, jhCurrentPage]);

  const isAttendanceDataEmpty = useMemo(() => {
    const rangeRecords = attendanceRecords.filter(rec => {
      if (!isStudentFilteredForAttendance(rec.studentId)) return false;
      if (rec.academicYear && rec.academicYear !== selectedYear) return false;
      if (rec.semester && String(rec.semester) !== String(selectedSemester)) return false;
      return rec.date >= startDate && rec.date <= endDate;
    });
    return rangeRecords.length === 0;
  }, [attendanceRecords, isStudentFilteredForAttendance, selectedYear, selectedSemester, startDate, endDate]);

  // 3. MTSS Academic Tab Analysis
  const academicAnalysis = useMemo(() => {
    const cases = filteredAcademicCases;
    const t1 = cases.filter(c => c.currentTier === 'Tier 1' && c.status !== 'CLOSED').length;
    const t2 = cases.filter(c => c.currentTier === 'Tier 2' && c.status !== 'CLOSED').length;
    const t3 = cases.filter(c => c.currentTier === 'Tier 3' && c.status !== 'CLOSED').length;
    const active = cases.filter(c => c.status === 'ACTIVE').length;
    const screening = cases.filter(c => c.status === 'SCREENING').length;
    
    const stagnant = cases.filter(c => c.status !== 'CLOSED' && c.updatedAt < (Date.now() - 14 * 24 * 60 * 60 * 1000));

    // Literacy Trend analysis
    const litGroup: Record<string, { sum: number, count: number }> = {};
    filteredLiteracy.forEach(rec => {
      const area = rec.area || 'LITERACY';
      const score = rec.overallScore || rec.score || 0;
      if (score) {
        if (!litGroup[area]) litGroup[area] = { sum: 0, count: 0 };
        litGroup[area].sum += score;
        litGroup[area].count++;
      }
    });
    const literacyTrends = Object.entries(litGroup).map(([name, data]) => ({
      name: name.replace('_', ' '),
      score: data.count > 0 ? Math.round((data.sum / data.count) * 10) / 10 : 0
    }));

    return { t1, t2, t3, active, screening, stagnant, literacyTrends, raw: cases };
  }, [filteredAcademicCases, filteredLiteracy]);

  // 4. MTSS Behavior Tab Analysis
  const behaviorAnalysis = useMemo(() => {
    const cases = filteredBehaviorCases;
    const t1 = cases.filter(c => c.tier === 'Tier 1' && c.status !== 'CLOSED').length;
    const t2 = cases.filter(c => c.tier === 'Tier 2' && c.status !== 'CLOSED').length;
    const t3 = cases.filter(c => c.tier === 'Tier 3' && c.status !== 'CLOSED').length;
    const activeCount = cases.filter(c => c.status !== 'CLOSED').length;

    // Categories frequencies
    const freq = { 'Disiplin': 0, 'Sikap': 0, 'Kerapihan': 0, 'Sosial': 0, 'Lainnya': 0 };
    filteredConcerns.forEach(con => {
      const desc = (con.description || '').toLowerCase();
      if (desc.includes('telat') || desc.includes('bolos')) freq.Disiplin++;
      else if (desc.includes('ribut') || desc.includes('kasar')) freq.Sikap++;
      else if (desc.includes('seragam') || desc.includes('rambut')) freq.Kerapihan++;
      else if (desc.includes('bully') || desc.includes('teman')) freq.Sosial++;
      else freq.Lainnya++;
    });
    const categoryData = Object.entries(freq).map(([name, value]) => ({ name, value }));

    // Stagnant > 30 days
    const stagnantCount = cases.filter(c => c.status !== 'CLOSED' && c.createdAt < (Date.now() - 30 * 24 * 60 * 60 * 1000)).length;
    const activeBip = bipPlans.filter(p => cases.some(c => c.id === p.caseId && c.status !== 'CLOSED')).length;

    return { t1, t2, t3, activeCount, categoryData, stagnantCount, activeBip, raw: cases };
  }, [filteredBehaviorCases, filteredConcerns, bipPlans]);

  // 5. Smart Goal Progress Tab Analysis
  const smartGoalAnalysis = useMemo(() => {
    const resps = filteredGoalsResponses;
    let total = 0, completed = 0, active = 0, draft = 0;
    
    const mentors = new Map<string, string>();
    mentorAssignments.forEach(asg => { if (asg.status === 'ACTIVE') mentors.set(asg.studentId, asg.mentorName); });

    resps.forEach(r => {
      const g = r.goals || [];
      total += g.length;
      g.forEach(item => {
        if (item.status === 'COMPLETED') completed++;
        else if (item.status === 'ACTIVE') active++;
        else draft++;
      });
    });

    const missingMentor = resps.filter(r => (r.goals || []).length > 0 && !mentors.has(r.studentId));
    const studentsWithCheckIn = new Set(filteredGoalTrackers.map(t => t.studentId));
    const missingCheckIn = resps.filter(r => (r.goals || []).length > 0 && !studentsWithCheckIn.has(r.studentId));

    // Stagnant goals (> 14 days)
    const stagnantGoals: any[] = [];
    resps.forEach(r => {
      (r.goals || []).forEach(g => {
        if (g.status === 'ACTIVE') {
          const tList = goalTrackers.filter(t => t.goalId === g.id);
          const lastTime = tList.length > 0 ? tList.sort((a,b) => b.createdAt - a.createdAt)[0].createdAt : g.updatedAt;
          if (lastTime < (Date.now() - 14 * 24 * 60 * 60 * 1000)) {
            stagnantGoals.push({ studentName: r.studentName, className: r.className, goal: g.goal, mentor: mentors.get(r.studentId) || 'Belum Ada Mentor' });
          }
        }
      });
    });

    // Progress per mentor
    const mentorMap: Record<string, { total: number, completed: number }> = {};
    resps.forEach(r => {
      const m = mentors.get(r.studentId);
      if (m) {
        if (!mentorMap[m]) mentorMap[m] = { total: 0, completed: 0 };
        const gList = r.goals || [];
        mentorMap[m].total += gList.length;
        mentorMap[m].completed += gList.filter(g => g.status === 'COMPLETED').length;
      }
    });
    const mentorProgress = Object.entries(mentorMap).map(([name, d]) => ({
      name,
      rate: d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0,
      total: d.total
    })).sort((a,b) => b.rate - a.rate);

    return { total, completed, active, draft, missingMentor, missingCheckIn, stagnantGoals, mentorProgress };
  }, [filteredGoalsResponses, mentorAssignments, filteredGoalTrackers, goalTrackers]);

  // --- INTERACTIVE CLICK TO MODAL HELPER ---
  const handleOpenDetailModal = (type: string, title: string, data: any[]) => {
    setModalType(type);
    setModalTitle(title);
    setModalData(data);
    setModalSearch('');
    setModalOpen(true);
  };

  const filteredModalData = useMemo(() => {
    const term = (modalSearch || '').trim().toLowerCase();
    if (!term) return modalData;
    const safeModalData = Array.isArray(modalData) ? modalData : [];
    return safeModalData.filter(item => {
      if (!item) return false;
      const valuesStr = Object.values(item)
        .map(v => (v !== null && v !== undefined ? String(v).toLowerCase() : ''))
        .join(' ');
      return valuesStr.includes(term);
    });
  }, [modalData, modalSearch]);

  if (loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center space-y-4 bg-slate-50">
        <Loader2 className="w-12 h-12 text-[#002366] animate-spin" />
        <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">Memuat Dashboard Analisis...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-8 space-y-6 overflow-y-auto pb-24">
      
      {/* Compact Header */}
      <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            Analisis Unit
          </h1>
          <p className="text-xs text-gray-500 font-medium">Pusat monitoring Junior High</p>
        </div>

        {/* Global Filter Form (All in one single row!) */}
        <div className="flex flex-wrap items-end gap-3 w-full lg:w-auto shrink-0 bg-slate-50/50 p-3 rounded-xl border border-gray-200">
          <div className="flex-1 min-w-[120px] sm:flex-initial">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Academic Year</span>
            <select 
              value={selectedYear} 
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1 text-xs font-semibold text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-600"
            >
              <option value="2024/2025">2024/2025</option>
              <option value="2025/2026">2025/2026</option>
              <option value="2026/2027">2026/2027</option>
            </select>
          </div>

          <div className="flex-1 min-w-[100px] sm:flex-initial">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Semester</span>
            <select 
              value={selectedSemester} 
              onChange={(e) => setSelectedSemester(parseInt(e.target.value))}
              className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1 text-xs font-semibold text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-600"
            >
              <option value={1}>Semester 1</option>
              <option value={2}>Semester 2</option>
            </select>
          </div>

          <div className="flex-1 min-w-[120px] sm:flex-initial">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Kelas</span>
            <select 
              value={selectedClassId} 
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1 text-xs font-semibold text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-600"
            >
              <option value="ALL">Semua Kelas</option>
              {filteredClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="flex-1 min-w-[110px] sm:flex-initial">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Cohort</span>
            <select 
              value={selectedCohort} 
              onChange={(e) => setSelectedCohort(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1 text-xs font-semibold text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-600"
            >
              <option value="ALL">Semua Grade</option>
              <option value="7">Grade 7</option>
              <option value="8">Grade 8</option>
              <option value="9">Grade 9</option>
            </select>
          </div>

          <div className="w-full sm:w-auto">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Date Range</span>
            <div className="flex items-center gap-1">
              <input 
                type="date" 
                value={startDate} 
                onChange={(e) => setStartDate(e.target.value)} 
                className="bg-white border border-gray-200 rounded-lg px-2 py-1 text-xs font-semibold text-gray-700 focus:outline-none"
              />
              <span className="text-gray-400 text-xs">-</span>
              <input 
                type="date" 
                value={endDate} 
                onChange={(e) => setEndDate(e.target.value)} 
                className="bg-white border border-gray-200 rounded-lg px-2 py-1 text-xs font-semibold text-gray-700 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </header>

      {/* Under Header Tab bar */}
      <div className="flex flex-wrap bg-white p-1 rounded-2xl border border-gray-200 shadow-sm gap-1">
        {[
          { id: 'daily_insights', label: 'Daily Insights', icon: Clock },
          { id: 'keterlambatan', label: 'Keterlambatan', icon: Timer },
          { id: 'kehadiran', label: 'Kehadiran', icon: Users },
          { id: 'academic', label: 'MTSS Academic', icon: BookOpen },
          { id: 'behavior', label: 'MTSS Behavior', icon: ShieldAlert },
          { id: 'goals', label: 'Smart Goal Progress', icon: Sparkles }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveAnalysisTab(tab.id as any)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all",
              activeAnalysisTab === tab.id 
                ? "bg-[#002366] text-white shadow-sm font-bold" 
                : "text-gray-500 hover:text-gray-900 hover:bg-slate-50"
            )}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Tab Panels Content */}
      <div className="space-y-6 flex-1">
        
        {/* TAB: DAILY INSIGHTS */}
        {activeAnalysisTab === 'daily_insights' && (
          <div className="space-y-6">
            
            {/* 4 KPI Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              
              {/* 1. Keterlambatan Hari Ini */}
              <div 
                onClick={() => handleOpenDetailModal('lateness_today', 'Detail Keterlambatan Hari Ini', todayLateness.raw)}
                className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md hover:border-blue-200 transition-all cursor-pointer"
              >
                <div className="flex justify-between items-start">
                  <div className="p-2.5 bg-amber-50 rounded-xl text-amber-600">
                    <Timer size={20} />
                  </div>
                  <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Real-time</span>
                </div>
                <div className="mt-3">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Keterlambatan Hari Ini</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {todayLateness.count} <span className="text-xs font-normal text-gray-500">Siswa</span>
                  </p>
                  <div className="flex justify-between text-xs text-gray-500 font-medium pt-2 border-t border-gray-100 mt-2">
                    <span>Rata-rata: <strong className="text-amber-600">{todayLateness.avgMinutes} mnt</strong></span>
                    <span>Berulang: <strong className="text-red-500">{todayLateness.repeated.length} siswa</strong></span>
                  </div>
                </div>
              </div>

              {/* 2. Kehadiran Hari Ini */}
              <div 
                onClick={() => handleOpenDetailModal('attendance_class_today', 'Kehadiran per Kelas Hari Ini', todayClassAttendance)}
                className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md hover:border-blue-200 transition-all cursor-pointer"
              >
                <div className="flex justify-between items-start">
                  <div className="p-2.5 bg-emerald-50 rounded-xl text-emerald-600">
                    <Users size={20} />
                  </div>
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Roster</span>
                </div>
                <div className="mt-3">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Kehadiran Hari Ini</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {(() => {
                      const totalHadirToday = todayClassAttendance.reduce((sum, c) => sum + c.hadir, 0);
                      const totalStudentsToday = todayClassAttendance.reduce((sum, c) => sum + c.totalStudents, 0);
                      const attendanceRateToday = totalStudentsToday > 0 ? Math.round((totalHadirToday / totalStudentsToday) * 100) : 0;
                      return `${attendanceRateToday}%`;
                    })()} <span className="text-xs font-normal text-gray-500">Presensi</span>
                  </p>
                  <div className="flex justify-between text-xs text-gray-500 font-medium pt-2 border-t border-gray-100 mt-2">
                    <span>
                      S:{todayClassAttendance.reduce((sum, c) => sum + c.sakit, 0)} | 
                      I:{todayClassAttendance.reduce((sum, c) => sum + c.izin, 0)} | 
                      A:{todayClassAttendance.reduce((sum, c) => sum + c.alpa, 0)}
                    </span>
                    <span className="text-gray-400 font-bold">
                      {todayClassAttendance.filter(c => !c.isCompleted).length > 0 ? "⚠️ Roster parsial" : "Lengkap"}
                    </span>
                  </div>
                </div>
              </div>

              {/* 3. Kasus Aktif (ICR) */}
              <div 
                onClick={() => handleOpenDetailModal('daily_cases_today', 'Detail Kasus Baru Hari Ini', todayCases.raw)}
                className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md hover:border-blue-200 transition-all cursor-pointer"
              >
                <div className="flex justify-between items-start">
                  <div className="p-2.5 bg-indigo-50 rounded-xl text-indigo-600">
                    <FileSpreadsheet size={20} />
                  </div>
                  <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">Case Log</span>
                </div>
                <div className="mt-3">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Kasus Baru (ICR)</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {todayCases.total} <span className="text-xs font-normal text-gray-500">Kasus</span>
                  </p>
                  <div className="flex gap-2 text-[10px] text-gray-500 font-bold pt-2 border-t border-gray-100 mt-2">
                    <span className="text-red-600">Open: {todayCases.open}</span>
                    <span className="text-amber-600">Review: {todayCases.review}</span>
                    <span className="text-emerald-600">Closed: {todayCases.closed}</span>
                  </div>
                </div>
              </div>

              {/* 4. Follow-up Hari Ini */}
              <div 
                onClick={() => handleOpenDetailModal('followup_today', 'Pekerjaan Follow-up Jatuh Tempo', todayFollowUps.pendingConcerns)}
                className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md hover:border-blue-200 transition-all cursor-pointer"
              >
                <div className="flex justify-between items-start">
                  <div className="p-2.5 bg-purple-50 rounded-xl text-purple-600">
                    <Activity size={20} />
                  </div>
                  <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">Tindak Lanjut</span>
                </div>
                <div className="mt-3">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Follow-up Hari Ini</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {todayFollowUps.total} <span className="text-xs font-normal text-gray-500">Kasus</span>
                  </p>
                  <div className="flex gap-2 text-[10px] text-gray-500 font-bold pt-2 border-t border-gray-100 mt-2">
                    <span className="text-purple-600">Intervensi: {todayFollowUps.pendingConcerns.length}</span>
                    <span className="text-red-600">Stagnan: {todayFollowUps.stagnantAcademic.length + todayFollowUps.stagnantBehavior.length}</span>
                  </div>
                </div>
              </div>

            </div>

            {/* Grid 2-column: Perhatian dan Kelengkapan */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Column 1: Perhatian */}
              <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                  <AlertCircle className="text-red-500 shrink-0" size={18} />
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">Perhatian</h3>
                    <p className="text-[11px] text-gray-500">Kasus stagnan atau intervensi yang overdue</p>
                  </div>
                </div>

                <div className="space-y-3 overflow-y-auto max-h-[300px] pr-1">
                  {/* List pending concerns first */}
                  {todayFollowUps.pendingConcerns.map((con, idx) => (
                    <div key={`con-${idx}`} className="p-3 bg-red-50/50 rounded-xl border border-red-100/80 flex justify-between items-start gap-3">
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <span className="text-[9px] font-bold text-red-600 uppercase tracking-wider">Intervensi Overdue</span>
                        <p className="text-xs font-bold text-gray-900">{con.studentName || 'Siswa'}</p>
                        <p className="text-[11px] text-gray-600 line-clamp-1 italic">"{con.description}"</p>
                        <p className="text-[10px] text-gray-400">Jatuh tempo: {con.nextStepDueDate || 'Hari ini'}</p>
                      </div>
                      <span className="text-[10px] font-semibold text-gray-500 bg-white border border-gray-200 px-2 py-0.5 rounded-lg shrink-0">
                        PJ: {con.nextStepPicName?.split(' ')[0] || 'Unassigned'}
                      </span>
                    </div>
                  ))}

                  {/* List stagnant behavior cases */}
                  {todayFollowUps.stagnantBehavior.map((c, idx) => (
                    <div key={`stb-${idx}`} className="p-3 bg-amber-50/50 rounded-xl border border-amber-100 flex justify-between items-start gap-3">
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <span className="text-[9px] font-bold text-amber-700 uppercase tracking-wider">Perilaku Stagnan (&gt;14 hari)</span>
                        <p className="text-xs font-bold text-gray-900">{c.studentName || 'Siswa'}</p>
                        <p className="text-[11px] text-gray-500">Status: {c.status} • Tier: {c.tier}</p>
                      </div>
                      <Link 
                        to={`/junior-high/behavior/mtss/cases/${c.id}`} 
                        className="text-[10px] font-bold text-blue-600 hover:underline shrink-0 bg-white border border-blue-100 px-2 py-0.5 rounded-lg"
                      >
                        Buka Log
                      </Link>
                    </div>
                  ))}

                  {/* List stagnant academic cases */}
                  {todayFollowUps.stagnantAcademic.map((c, idx) => (
                    <div key={`sta-${idx}`} className="p-3 bg-yellow-50/50 rounded-xl border border-yellow-100 flex justify-between items-start gap-3">
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <span className="text-[9px] font-bold text-yellow-700 uppercase tracking-wider">Akademis Stagnan (&gt;14 hari)</span>
                        <p className="text-xs font-bold text-gray-900">{c.studentName || 'Siswa'}</p>
                        <p className="text-[11px] text-gray-500">Domain: {c.subjectDomains?.join(', ') || 'Umum'} • {c.currentTier}</p>
                      </div>
                      <span className="text-[10px] font-semibold text-gray-500 bg-white border border-gray-200 px-2 py-0.5 rounded-lg shrink-0">
                        {c.status}
                      </span>
                    </div>
                  ))}

                  {todayFollowUps.total === 0 && (
                    <div className="py-12 text-center text-gray-400 text-xs font-medium italic">
                      Semua penanganan terpantau aktif dan tepat waktu.
                    </div>
                  )}
                </div>
              </div>

              {/* Column 2: Kelengkapan */}
              <div 
                onClick={() => handleOpenDetailModal('incomplete_data_today', 'Data Administrasi Belum Lengkap', allIncompleteToday)}
                className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4 cursor-pointer hover:border-blue-100 transition-all"
              >
                <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                  <CheckSquare className="text-blue-600 shrink-0" size={18} />
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">Kelengkapan</h3>
                    <p className="text-[11px] text-gray-500">Kelas atau guru yang belum mengisi data administrasi</p>
                  </div>
                </div>

                <div className="space-y-3 overflow-y-auto max-h-[300px] pr-1">
                  
                  {/* Uncompleted attendance classes */}
                  {incompleteData.uncompletedClasses.map((cls, idx) => (
                    <div key={`ucl-${idx}`} className="p-3 bg-rose-50/50 rounded-xl border border-rose-100/80 flex justify-between items-center gap-3">
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <span className="text-[9px] font-bold text-rose-600 uppercase tracking-wider">Belum Input Presensi</span>
                        <p className="text-xs font-bold text-gray-900">{cls.className}</p>
                        <p className="text-[11px] text-gray-500">Homeroom: {cls.teacher}</p>
                      </div>
                      <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg shrink-0">
                        Belum Kirim
                      </span>
                    </div>
                  ))}

                  {/* Goals without mentor */}
                  {incompleteData.goalsNoMentor.map((goal, idx) => (
                    <div key={`gnm-${idx}`} className="p-3 bg-slate-50 rounded-xl border border-gray-200 flex justify-between items-center gap-3">
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Goal Tanpa Mentor</span>
                        <p className="text-xs font-bold text-gray-900">{goal.studentName}</p>
                        <p className="text-[11px] text-gray-500">Kelas: {goal.className} • {goal.goals?.length || 0} Goal dibuat</p>
                      </div>
                      <span className="text-[10px] font-semibold text-gray-500 bg-white border border-gray-200 px-2 py-0.5 rounded-lg shrink-0">
                        Butuh Mentor
                      </span>
                    </div>
                  ))}

                  {/* Goals with no checkins */}
                  {incompleteData.goalsNoCheckIn.map((goal, idx) => (
                    <div key={`gnc-${idx}`} className="p-3 bg-amber-50/30 rounded-xl border border-amber-100 flex justify-between items-center gap-3">
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <span className="text-[9px] font-bold text-amber-700 uppercase tracking-wider">Belum Check-in/Refleksi</span>
                        <p className="text-xs font-bold text-gray-900">{goal.studentName}</p>
                        <p className="text-[11px] text-gray-500">Kelas: {goal.className}</p>
                      </div>
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg shrink-0">
                        Belum Check-In
                      </span>
                    </div>
                  ))}

                  {incompleteData.total === 0 && (
                    <div className="py-12 text-center text-gray-400 text-xs font-medium italic">
                      Seluruh administrasi kelas dan bimbingan terisi lengkap.
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Aktivitas Hari Ini Table */}
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Aktivitas Hari Ini</h3>
                <p className="text-[11px] text-gray-500">Aliran log aktivitas kasus baru dan insiden yang terlaporkan hari ini</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-400 uppercase tracking-wider font-bold font-black">
                      <th className="py-2 px-3">Tipe Aktivitas</th>
                      <th className="py-2 px-3">Siswa</th>
                      <th className="py-2 px-3">Uraian / Deskripsi</th>
                      <th className="py-2 px-3">Status / Tindakan</th>
                      <th className="py-2 px-3 text-right">PIC / Reporter</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {/* Combine new behavior cases created today and incidents */}
                    {(() => {
                      const caseActivities = todayCases.raw.map(c => ({
                        type: 'Behavior Intervention Record (BIR)',
                        typeColor: 'bg-indigo-50 text-indigo-700 border-indigo-100',
                        student: c.studentName || 'Siswa',
                        classId: c.classId || 'SMP',
                        description: `Pembukaan Kasus Perilaku baru (Tier: ${c.tier})`,
                        action: c.status,
                        pic: c.picName || 'Unassigned',
                        timestamp: c.createdAt || Date.now()
                      }));

                      const incidentActivities = todayIncidents.raw.map(inc => ({
                        type: 'Incident Report',
                        typeColor: 'bg-red-50 text-red-700 border-red-100',
                        student: inc.studentName || 'Siswa',
                        classId: inc.classId || 'SMP',
                        description: inc.description,
                        action: inc.nextSteps || 'Menunggu tindak lanjut',
                        pic: inc.reporterName || 'Guru',
                        timestamp: inc.createdAt || Date.now()
                      }));

                      const combinedActivities = [...caseActivities, ...incidentActivities].sort((a, b) => b.timestamp - a.timestamp);

                      if (combinedActivities.length === 0) {
                        return (
                          <tr>
                            <td colSpan={5} className="py-10 text-center text-gray-400 italic">
                              Tidak ada aktivitas kasus atau insiden yang dilaporkan hari ini.
                            </td>
                          </tr>
                        );
                      }

                      return combinedActivities.map((act, i) => (
                        <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3 px-3">
                            <span className={cn("inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border", act.typeColor)}>
                              {act.type}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-bold text-gray-900">
                            {act.student} <span className="text-[10px] text-gray-400 font-normal">({act.classId})</span>
                          </td>
                          <td className="py-3 px-3 text-gray-600 max-w-sm whitespace-normal leading-relaxed">
                            {act.description}
                          </td>
                          <td className="py-3 px-3">
                            <span className="font-bold text-[10px] text-slate-700">
                              {act.action}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right font-medium text-gray-500">
                            {act.pic}
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* TAB CONTENT BLOCKS */}
          {activeAnalysisTab === 'keterlambatan' && (
            <div className="space-y-6">
              
              {/* KPIs Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="bg-slate-50 p-5 rounded-2xl border border-gray-100">
                  <p className="text-[10px] font-black uppercase text-gray-400">Total Kejadian Terlambat</p>
                  <p className="text-2xl font-black text-gray-900 tracking-tight mt-1">{latenessAnalysis.totalCount} Kali</p>
                </div>
                <div className="bg-slate-50 p-5 rounded-2xl border border-gray-100">
                  <p className="text-[10px] font-black uppercase text-gray-400">Rata-rata Menit Terlambat</p>
                  <p className="text-2xl font-black text-gray-900 tracking-tight mt-1">{latenessAnalysis.avgMin} Menit</p>
                </div>
                <div className="bg-slate-50 p-5 rounded-2xl border border-gray-100">
                  <p className="text-[10px] font-black uppercase text-gray-400">Hari Terbanyak Terlambat</p>
                  <p className="text-2xl font-black text-red-600 tracking-tight mt-1">
                    {latenessAnalysis.topDayName} <span className="text-xs text-gray-400 not-italic font-bold">({latenessAnalysis.topDayCount}x)</span>
                  </p>
                </div>
              </div>

              {/* Charts Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Lateness Trend Chart */}
                <div className="bg-white border border-gray-100 rounded-3xl p-6 flex flex-col h-[320px]">
                  <h4 className="text-xs font-black uppercase text-gray-400 mb-4 flex items-center gap-2">
                    <TrendingUp size={14} />
                    Tren Keterlambatan Mingguan & Harian
                  </h4>
                  <div className="flex-1 min-h-0">
                    {latenessAnalysis.chartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={latenessAnalysis.chartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                          <XAxis dataKey="displayDate" tick={{ fontSize: 9, fill: '#9ca3af', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 9, fill: '#9ca3af', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                          <Bar dataKey="count" fill="#d97706" radius={[4, 4, 0, 0]} barSize={24} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-gray-400 text-xs font-bold uppercase tracking-wider">Tidak ada data keterlambatan</div>
                    )}
                  </div>
                </div>

                {/* Class Rankings */}
                <div className="bg-white border border-gray-100 rounded-3xl p-6 flex flex-col h-[320px]">
                  <h4 className="text-xs font-black uppercase text-gray-400 mb-4 flex items-center gap-2">
                    <LayoutGrid size={14} />
                    Kelas dengan Keterlambatan Tertinggi
                  </h4>
                  <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                    {latenessAnalysis.classRank.length > 0 ? latenessAnalysis.classRank.map((cls, index) => (
                      <div key={cls.name} className="flex justify-between items-center bg-slate-50 p-3 rounded-xl">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-slate-200 text-[10px] font-black text-gray-700 flex items-center justify-center">{index + 1}</span>
                          <span className="text-xs font-black text-gray-800">{cls.name}</span>
                        </div>
                        <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg">{cls.count} Keterlambatan</span>
                      </div>
                    )) : (
                      <div className="h-full flex flex-col items-center justify-center text-gray-400 text-xs font-bold uppercase tracking-wider">Data tidak ditemukan</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Student Rankings - Repeated offenders */}
              <div className="bg-white border border-gray-100 rounded-3xl p-6">
                <h4 className="text-xs font-black uppercase text-gray-400 mb-4">Siswa Terlambat Berulang (Leaderboard)</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-gray-100 text-gray-400 uppercase tracking-wider font-black">
                        <th className="py-2.5">Siswa</th>
                        <th className="py-2.5">Kelas</th>
                        <th className="py-2.5 text-center">Jumlah Terlambat</th>
                        <th className="py-2.5 text-right">Rata-rata Menit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {latenessAnalysis.studentRank.slice(0, 10).map((st) => (
                        <tr key={st.id} className="border-b border-gray-50 hover:bg-slate-50 transition-colors">
                          <td className="py-3 font-black text-gray-800">{st.name}</td>
                          <td className="py-3 text-gray-500 font-bold">{st.className}</td>
                          <td className="py-3 text-center">
                            <span className="bg-red-50 text-red-600 font-black px-2.5 py-1 rounded-lg text-[10px]">
                              {st.count}x Terlambat
                            </span>
                          </td>
                          <td className="py-3 text-right font-bold text-gray-700">{st.avgMinutes} menit</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: KEHADIRAN */}
          {activeAnalysisTab === 'kehadiran' && (
            <div className="space-y-6">
              {isAttendanceDataEmpty ? (
                <div className="text-center py-12 text-slate-400 font-bold text-xs uppercase tracking-wider bg-white rounded-3xl border border-gray-100 shadow-sm">
                  Belum ada data kehadiran untuk periode yang dipilih.
                </div>
              ) : (
                <>
                  {/* Elegant Sub-tabs Switcher */}
                  <div className="flex gap-2 p-1 bg-slate-100/80 rounded-2xl max-w-md border border-slate-200/50">
                    <button
                      onClick={() => {
                        setAttendanceSubTab('SCHOOL');
                        setJhCurrentPage(1);
                      }}
                      className={`flex-1 text-center py-2.5 px-4 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                        attendanceSubTab === 'SCHOOL'
                          ? 'bg-white text-blue-600 shadow-sm border border-slate-200/30'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      Presensi Sekolah
                    </button>
                    <button
                      onClick={() => {
                        setAttendanceSubTab('DHUHUR');
                        setJhCurrentPage(1);
                      }}
                      className={`flex-1 text-center py-2.5 px-4 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                        attendanceSubTab === 'DHUHUR'
                          ? 'bg-white text-blue-600 shadow-sm border border-slate-200/30'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      Salat Zuhur
                    </button>
                  </div>

                  {attendanceSubTab === 'DHUHUR' && loadingDhuhur ? (
                    <div className="p-12 bg-white rounded-3xl border border-slate-100 shadow-sm flex flex-col items-center justify-center space-y-3 mt-6 animate-pulse">
                      <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
                      <p className="text-xs font-bold text-slate-500">Memuat analisis data Kehadiran Shalat Dhuhur...</p>
                    </div>
                  ) : (
                    <>
                      {/* Summary Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    {/* Average Attendance Card */}
                    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between">
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {attendanceSubTab === 'SCHOOL' ? 'Rata-rata Kehadiran' : 'Rata-rata Shalat Berjamaah'}
                        </span>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-3xl font-black text-slate-900 tracking-tight">
                            {attendanceSubTab === 'SCHOOL' ? `${jhAverageAttendance}%` : `${jhAverageSalat}%`}
                          </span>
                          <span className="text-[10px] font-semibold text-slate-500">
                            {attendanceSubTab === 'SCHOOL' ? 'kehadiran siswa' : 'salat berjamaah'}
                          </span>
                        </div>
                      </div>
                      <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600">
                        {attendanceSubTab === 'SCHOOL' ? <Users size={22} /> : <Activity size={22} />}
                      </div>
                    </div>

                    {/* Effective Working Days / Shalat Breakdown Card */}
                    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between">
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {attendanceSubTab === 'SCHOOL' ? 'Hari Kerja Efektif' : 'Detail Status Salat'}
                        </span>
                        {attendanceSubTab === 'SCHOOL' ? (
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-3xl font-black text-slate-900 tracking-tight">{jhWorkingDaysForAnalysis}</span>
                            <span className="text-[10px] font-semibold text-slate-500">Hari Sekolah</span>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-0.5 pt-0.5">
                            <span className="text-xs font-bold text-emerald-700">
                              {jhSalatBreakdown.jamaah}x Berjamaah
                            </span>
                            <span className="text-[10px] font-medium text-slate-500">
                              {jhSalatBreakdown.berhalangan}x Berhalangan • {jhSalatBreakdown.tidakMengikuti}x Tidak Ikut
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="p-3 bg-blue-50 rounded-2xl text-blue-600">
                        <Calendar size={22} />
                      </div>
                    </div>

                    {/* Lowest Input Card */}
                    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between">
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {attendanceSubTab === 'SCHOOL' ? 'Pengisian Terendah' : 'Pengisian Salat Terendah'}
                        </span>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-sm font-black text-slate-900 tracking-tight block max-w-[180px] truncate">
                            {attendanceSubTab === 'SCHOOL' ? lowestClassAudit : lowestClassAuditDhuhur}
                          </span>
                        </div>
                      </div>
                      <div className={`p-3 rounded-2xl ${
                        (attendanceSubTab === 'SCHOOL' ? lowestClassAudit : lowestClassAuditDhuhur).includes('Semua') || 
                        (attendanceSubTab === 'SCHOOL' ? lowestClassAudit : lowestClassAuditDhuhur) === '—' 
                          ? 'bg-emerald-50 text-emerald-600' 
                          : 'bg-orange-50 text-orange-600'
                      }`}>
                        {(attendanceSubTab === 'SCHOOL' ? lowestClassAudit : lowestClassAuditDhuhur).includes('Semua') || 
                        (attendanceSubTab === 'SCHOOL' ? lowestClassAudit : lowestClassAuditDhuhur) === '—' 
                          ? <CheckCircle2 size={22} /> 
                          : <AlertTriangle size={22} />}
                      </div>
                    </div>
                  </div>

                  {/* Audit and Recap Panels */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Left Panel: Rekap Pengisian */}
                    <div className="lg:col-span-5 bg-white border border-gray-100 rounded-3xl p-6 shadow-sm flex flex-col space-y-4">
                      <div>
                        <h4 className="text-sm font-black text-slate-900">
                          {attendanceSubTab === 'SCHOOL' ? 'Rekap Pengisian Kehadiran' : 'Rekap Pengisian Salat Zuhur'}
                        </h4>
                        <p className="text-[11px] text-slate-400 font-bold leading-relaxed">
                          {attendanceSubTab === 'SCHOOL' 
                            ? 'Memastikan kelengkapan input kehadiran guru kelas Junior High sejak 20 Juli 2026.' 
                            : 'Memastikan kelengkapan input partisipasi Salat Zuhur berjamaah siswa.'}
                        </p>
                      </div>

                      {!isAuditValid ? (
                        <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100 text-orange-700 space-y-1">
                          <div className="flex items-center gap-2 font-bold text-xs">
                            <AlertCircle size={14} />
                            <span>Audit Belum Dimulai</span>
                          </div>
                          <p className="text-[10px] font-semibold">
                            Audit kelengkapan input dimulai pada 20 Juli 2026. Sila ubah filter Tanggal Sampai untuk melihat audit pengisian.
                          </p>
                        </div>
                      ) : (attendanceSubTab === 'SCHOOL' ? jhRekapPengisian.length : jhRekapPengisianDhuhur.length) === 0 ? (
                        <div className="text-center py-12 text-slate-400 font-bold text-xs uppercase tracking-wider">
                          Tidak ada kelas Junior High yang terdaftar.
                        </div>
                      ) : (
                        <div className="space-y-3 overflow-y-auto max-h-[500px] pr-1">
                          {(attendanceSubTab === 'SCHOOL' ? jhRekapPengisian : jhRekapPengisianDhuhur).map((cls) => {
                            const isComplete = cls.missingDates.length === 0;
                            return (
                              <div 
                                key={cls.id}
                                onClick={() => {
                                  setSelectedClassId(cls.id);
                                  setSelectedClassForMissingDates(cls);
                                }}
                                className="group cursor-pointer p-3.5 rounded-2xl border border-gray-50 hover:border-blue-100 hover:bg-slate-50/50 transition-all duration-200 flex flex-col space-y-2"
                              >
                                <div className="flex justify-between items-start">
                                  <div>
                                    <h5 className="text-xs font-black text-slate-900 group-hover:text-blue-600 transition-colors">
                                      Kelas {cls.name}
                                    </h5>
                                    <p className="text-[10px] text-slate-400 font-bold">
                                      Wali Kelas: {cls.teacher}
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black tracking-wide uppercase ${isComplete ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-orange-50 text-orange-600 border border-orange-100'}`}>
                                      {isComplete ? (
                                        <>
                                          <CheckCircle2 size={10} />
                                          <span>Lengkap</span>
                                        </>
                                      ) : (
                                        <>
                                          <AlertTriangle size={10} />
                                          <span>Belum Lengkap</span>
                                        </>
                                      )}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex justify-between items-center text-[10px] font-bold text-slate-500">
                                  <span>
                                    {isComplete 
                                      ? 'Semua hari sekolah terisi' 
                                      : `${cls.missingDates.length} hari belum diisi`
                                    }
                                  </span>
                                  <span className="text-slate-600">
                                    {cls.filledDaysCount} / {auditWorkingDaysCount} Hari Terisi
                                  </span>
                                </div>

                                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full rounded-full transition-all duration-500 ${isComplete ? 'bg-emerald-500' : 'bg-orange-500'}`}
                                    style={{ width: `${auditWorkingDaysCount > 0 ? (cls.filledDaysCount / auditWorkingDaysCount) * 100 : 100}%` }}
                                  ></div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Right Panel: Siswa yang Butuh Perhatian */}
                    <div className="lg:col-span-7 bg-white border border-gray-100 rounded-3xl p-6 shadow-sm flex flex-col space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-black text-slate-900">Siswa yang Butuh Perhatian</h4>
                          <p className="text-[11px] text-slate-400 font-bold leading-relaxed">
                            {attendanceSubTab === 'SCHOOL' 
                              ? 'Siswa dengan Alpa > 1 hari atau total tidak hadir > 3 hari pada rentang filter tanggal.' 
                              : 'Siswa dengan "Tidak Mengikuti" Salat Zuhur > 1 hari pada rentang filter.'}
                          </p>
                        </div>
                        <div className="relative min-w-[180px]">
                          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                          <input
                            type="text"
                            placeholder="Cari siswa..."
                            value={jhSearchTerm}
                            onChange={(e) => setJhSearchTerm(e.target.value)}
                            className="w-full bg-slate-50 border border-gray-100 rounded-xl pl-9 pr-4 py-2 text-xs font-semibold text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-600"
                          />
                        </div>
                      </div>

                      <div className="flex-1 overflow-x-auto">
                        {attendanceSubTab === 'SCHOOL' ? (
                          filteredJhAttentionStudents.length === 0 ? (
                            <div className="text-center py-16 space-y-3">
                              <div className="inline-flex p-3 bg-emerald-50 rounded-full text-emerald-500">
                                <CheckCircle2 size={24} />
                              </div>
                              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                                Tidak ada siswa yang membutuhkan perhatian kehadiran pada periode ini.
                              </p>
                            </div>
                          ) : (
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="border-b border-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                  <th className="py-3 px-4">Nama Siswa</th>
                                  <th className="py-3 px-2">Kelas</th>
                                  <th className="py-3 px-2 text-center">S</th>
                                  <th className="py-3 px-2 text-center">I</th>
                                  <th className="py-3 px-2 text-center">A</th>
                                  <th className="py-3 px-2 text-center">Tidak Hadir</th>
                                  <th className="py-3 px-2 text-center">Rasio</th>
                                  <th className="py-3 px-4 text-right">Aksi</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50 text-xs font-semibold text-slate-700">
                                {paginatedJhAttentionStudents.map((student) => {
                                  let badgeColor = 'bg-emerald-50 text-emerald-600 border-emerald-100';
                                  if (student.rate < 90) {
                                    badgeColor = 'bg-red-50 text-red-600 border-red-100';
                                  } else if (student.rate < 95) {
                                    badgeColor = 'bg-amber-50 text-amber-600 border-amber-100';
                                  }

                                  return (
                                    <tr key={student.id} className="hover:bg-slate-50/50 transition-colors font-medium text-slate-600">
                                      <td className="py-3 px-4 font-bold text-slate-900">
                                        {student.name}
                                      </td>
                                      <td className="py-3 px-2 text-slate-500">
                                        {student.className}
                                      </td>
                                      <td className="py-3 px-2 text-center font-bold">
                                        {student.sakit}
                                      </td>
                                      <td className="py-3 px-2 text-center font-bold">
                                        {student.izin}
                                      </td>
                                      <td className="py-3 px-2 text-center font-black text-red-600">
                                        {student.alpa}
                                      </td>
                                      <td className="py-3 px-2 text-center font-bold text-slate-700">
                                        {student.totalAbsence}
                                      </td>
                                      <td className="py-3 px-2 text-center">
                                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold border ${badgeColor}`}>
                                          {student.rate}%
                                        </span>
                                      </td>
                                      <td className="py-3 px-4 text-right">
                                        <button
                                          onClick={() => setSelectedStudentForAttendanceDetail(student)}
                                          className="inline-flex items-center gap-1 px-2.5 py-1.5 hover:bg-slate-100 text-blue-600 rounded-lg text-[10px] font-bold transition-all"
                                        >
                                          <span>Detail Siswa</span>
                                          <ArrowRight size={10} />
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )
                        ) : (
                          filteredJhSalatAttentionStudents.length === 0 ? (
                            <div className="text-center py-16 space-y-3">
                              <div className="inline-flex p-3 bg-emerald-50 rounded-full text-emerald-500">
                                <CheckCircle2 size={24} />
                              </div>
                              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                                Tidak ada siswa yang membutuhkan perhatian Salat Zuhur pada periode ini.
                              </p>
                            </div>
                          ) : (
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="border-b border-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                  <th className="py-3 px-4">Nama Siswa</th>
                                  <th className="py-3 px-2">Kelas</th>
                                  <th className="py-3 px-2 text-center">Berjamaah</th>
                                  <th className="py-3 px-2 text-center">Berhalangan</th>
                                  <th className="py-3 px-2 text-center">Izin</th>
                                  <th className="py-3 px-2 text-center text-red-600">Alpa Salat</th>
                                  <th className="py-3 px-2 text-center">Rasio</th>
                                  <th className="py-3 px-4 text-right">Aksi</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50 text-xs font-semibold text-slate-700">
                                {paginatedJhSalatAttentionStudents.map((student) => {
                                  let badgeColor = 'bg-emerald-50 text-emerald-600 border-emerald-100';
                                  if (student.rate < 85) {
                                    badgeColor = 'bg-red-50 text-red-600 border-red-100';
                                  } else if (student.rate < 95) {
                                    badgeColor = 'bg-amber-50 text-amber-600 border-amber-100';
                                  }

                                  return (
                                    <tr key={student.id} className="hover:bg-slate-50/50 transition-colors font-medium text-slate-600">
                                      <td className="py-3 px-4 font-bold text-slate-900">
                                        {student.name}
                                      </td>
                                      <td className="py-3 px-2 text-slate-500">
                                        {student.className}
                                      </td>
                                      <td className="py-3 px-2 text-center font-bold text-emerald-700">
                                        {student.jamaah}
                                      </td>
                                      <td className="py-3 px-2 text-center text-slate-500">
                                        {student.berhalangan}
                                      </td>
                                      <td className="py-3 px-2 text-center text-slate-500">
                                        {student.izin}
                                      </td>
                                      <td className="py-3 px-2 text-center font-black text-red-600">
                                        {student.tidakMengikuti}
                                      </td>
                                      <td className="py-3 px-2 text-center">
                                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold border ${badgeColor}`}>
                                          {student.rate}%
                                        </span>
                                      </td>
                                      <td className="py-3 px-4 text-right">
                                        <button
                                          onClick={() => setSelectedStudentForAttendanceDetail({ ...student, isSalat: true })}
                                          className="inline-flex items-center gap-1 px-2.5 py-1.5 hover:bg-slate-100 text-blue-600 rounded-lg text-[10px] font-bold transition-all"
                                        >
                                          <span>Detail Salat</span>
                                          <ArrowRight size={10} />
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )
                        )}
                      </div>

                      {/* Pagination Footer */}
                      {(attendanceSubTab === 'SCHOOL' ? filteredJhAttentionStudents.length : filteredJhSalatAttentionStudents.length) > jhItemsPerPage && (
                        <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                            Menampilkan {Math.min(
                              attendanceSubTab === 'SCHOOL' ? filteredJhAttentionStudents.length : filteredJhSalatAttentionStudents.length,
                              (jhCurrentPage - 1) * jhItemsPerPage + 1
                            )}-{Math.min(
                              attendanceSubTab === 'SCHOOL' ? filteredJhAttentionStudents.length : filteredJhSalatAttentionStudents.length,
                              jhCurrentPage * jhItemsPerPage
                            )} dari {attendanceSubTab === 'SCHOOL' ? filteredJhAttentionStudents.length : filteredJhSalatAttentionStudents.length} siswa
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setJhCurrentPage(prev => Math.max(1, prev - 1))}
                              disabled={jhCurrentPage === 1}
                              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                            >
                              <ChevronLeft size={14} />
                            </button>
                            <span className="text-xs font-bold text-slate-600">
                              {jhCurrentPage} / {attendanceSubTab === 'SCHOOL' ? jhTotalPages : jhSalatTotalPages}
                            </span>
                            <button
                              onClick={() => setJhCurrentPage(prev => Math.min(attendanceSubTab === 'SCHOOL' ? jhTotalPages : jhSalatTotalPages, prev + 1))}
                              disabled={jhCurrentPage === (attendanceSubTab === 'SCHOOL' ? jhTotalPages : jhSalatTotalPages)}
                              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                            >
                              <ChevronRight size={14} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  </>
                )}
                </>
              )}
            </div>
          )}

          {/* TAB 3: MTSS ACADEMIC */}
          {activeAnalysisTab === 'academic' && (
            <div className="space-y-6">
              
              {/* KPIs Row */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
                <div className="bg-slate-50 p-5 rounded-2xl border border-gray-100">
                  <p className="text-[10px] font-black uppercase text-gray-400">Total Kasus Aktif</p>
                  <p className="text-2xl font-black text-gray-900 tracking-tight mt-1">{academicAnalysis.active} Kasus</p>
                </div>
                <div className="bg-slate-50 p-5 rounded-2xl border border-gray-100 text-emerald-700">
                  <p className="text-[10px] font-black uppercase text-gray-400">Kasus Tier 1</p>
                  <p className="text-2xl font-black tracking-tight mt-1">{academicAnalysis.t1} Kasus</p>
                </div>
                <div className="bg-slate-50 p-5 rounded-2xl border border-gray-100 text-amber-700">
                  <p className="text-[10px] font-black uppercase text-gray-400">Kasus Tier 2</p>
                  <p className="text-2xl font-black tracking-tight mt-1">{academicAnalysis.t2} Kasus</p>
                </div>
                <div className="bg-slate-50 p-5 rounded-2xl border border-gray-100 text-red-700">
                  <p className="text-[10px] font-black uppercase text-gray-400">Kasus Tier 3</p>
                  <p className="text-2xl font-black tracking-tight mt-1">{academicAnalysis.t3} Kasus</p>
                </div>
              </div>

              {/* Case progression and stagnant alerts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Active and candidates lists */}
                <div className="bg-white border border-gray-100 rounded-3xl p-6">
                  <h4 className="text-xs font-black uppercase text-gray-400 mb-4">Kasus Stagnan (Tanpa Update &gt; 14 Hari)</h4>
                  <div className="overflow-y-auto max-h-[220px] space-y-2">
                    {academicAnalysis.stagnant.length > 0 ? academicAnalysis.stagnant.map(c => (
                      <div key={c.id} className="flex justify-between items-center bg-yellow-50 p-3 rounded-xl border border-yellow-100">
                        <div>
                          <p className="text-xs font-black text-gray-900">{c.studentName}</p>
                          <p className="text-[10px] text-gray-400 font-bold">{c.className} | Domain: {c.subjectDomains?.join(', ') || '-'}</p>
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-wider bg-yellow-100 text-yellow-800 px-2 py-1 rounded-md">{c.currentTier}</span>
                      </div>
                    )) : (
                      <div className="text-center py-8 text-gray-400 text-xs font-bold uppercase tracking-wider opacity-60">Tidak ada kasus akademis stagnan</div>
                    )}
                  </div>
                </div>

                {/* Literacy & Numeracy Trends */}
                <div className="bg-white border border-gray-100 rounded-3xl p-6 flex flex-col justify-between h-[280px]">
                  <h4 className="text-xs font-black uppercase text-gray-400 mb-4">Tren Literasi & Numerasi SMP (Rata-rata Skor)</h4>
                  <div className="flex-1 min-h-0">
                    {academicAnalysis.literacyTrends.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={academicAnalysis.literacyTrends}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                          <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#9ca3af', fontWeight: 'bold' }} />
                          <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} />
                          <Tooltip />
                          <Bar dataKey="score" fill="#4f46e5" radius={[4, 4, 0, 0]} barSize={36}>
                            {academicAnalysis.literacyTrends.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#4f46e5' : '#10b981'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-gray-400 text-xs font-bold uppercase tracking-wider opacity-50">Belum ada data nilai literasi & numerasi</div>
                    )}
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* TAB 4: MTSS BEHAVIOR */}
          {activeAnalysisTab === 'behavior' && (
            <div className="space-y-6">
              
              {/* KPIs Row */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
                <div className="bg-slate-50 p-5 rounded-2xl border border-gray-100">
                  <p className="text-[10px] font-black uppercase text-gray-400">Total Kasus Perilaku</p>
                  <p className="text-2xl font-black text-gray-900 tracking-tight mt-1">{behaviorAnalysis.activeCount} Kasus</p>
                </div>
                <div className="bg-slate-50 p-5 rounded-2xl border border-gray-100 text-emerald-700">
                  <p className="text-[10px] font-black uppercase text-gray-400">Behavior Tier 1</p>
                  <p className="text-2xl font-black tracking-tight mt-1">{behaviorAnalysis.t1} Kasus</p>
                </div>
                <div className="bg-slate-50 p-5 rounded-2xl border border-gray-100 text-amber-700">
                  <p className="text-[10px] font-black uppercase text-gray-400">Behavior Tier 2 (CICO)</p>
                  <p className="text-2xl font-black tracking-tight mt-1">{behaviorAnalysis.t2} Kasus</p>
                </div>
                <div className="bg-slate-50 p-5 rounded-2xl border border-gray-100 text-red-700">
                  <p className="text-[10px] font-black uppercase text-gray-400">Behavior Tier 3 (BIP)</p>
                  <p className="text-2xl font-black tracking-tight mt-1">{behaviorAnalysis.t3} Kasus</p>
                </div>
              </div>

              {/* Categories & Interventions */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Behavior category frequency */}
                <div className="bg-white border border-gray-100 rounded-3xl p-6 h-[300px] flex flex-col">
                  <h4 className="text-xs font-black uppercase text-gray-400 mb-4">Kategori Perilaku Paling Sering Muncul</h4>
                  <div className="flex-1 min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={behaviorAnalysis.categoryData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6b7280', fontWeight: 'bold' }} />
                        <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} />
                        <Tooltip />
                        <Bar dataKey="value" fill="#ec4899" radius={[4, 4, 0, 0]} barSize={40}>
                          {behaviorAnalysis.categoryData.map((entry, idx) => (
                            <Cell key={`cell-${idx}`} fill={['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#6b7280'][idx % 5]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Plans progress */}
                <div className="bg-white border border-gray-100 rounded-3xl p-6 flex flex-col justify-between">
                  <h4 className="text-xs font-black uppercase text-gray-400 mb-4">Progres Intervention Plan (BIP & CICO)</h4>
                  <div className="space-y-4">
                    <div className="bg-slate-50 p-4 rounded-2xl border border-gray-100 flex justify-between items-center">
                      <div>
                        <p className="text-xs font-black text-gray-800">Behavior Intervention Plans (BIP)</p>
                        <p className="text-[10px] text-gray-400 font-bold">Rencana aksi tervalidasi untuk siswa Tier 3</p>
                      </div>
                      <span className="text-xl font-black text-red-600 bg-red-50 px-3 py-1.5 rounded-xl">{behaviorAnalysis.activeBip} Aktif</span>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-2xl border border-gray-100 flex justify-between items-center">
                      <div>
                        <p className="text-xs font-black text-gray-800">Check-In / Check-Out (CICO)</p>
                        <p className="text-[10px] text-gray-400 font-bold">Daily monitoring behavior untuk siswa Tier 2</p>
                      </div>
                      <span className="text-xl font-black text-amber-600 bg-amber-50 px-3 py-1.5 rounded-xl">{behaviorAnalysis.activeCicoCount} Aktif</span>
                    </div>

                    <div className="bg-yellow-50 p-4 rounded-2xl border border-yellow-100 flex justify-between items-center">
                      <div>
                        <p className="text-xs font-black text-yellow-800">Kasus Terbuka &gt; 30 Hari</p>
                        <p className="text-[10px] text-yellow-600 font-semibold">Tindakan follow-up segera direkomendasikan</p>
                      </div>
                      <span className="text-xl font-black text-yellow-800 bg-yellow-100 px-3 py-1.5 rounded-xl">{behaviorAnalysis.stagnantCount} Kasus</span>
                    </div>
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* TAB 5: SMART GOAL PROGRESS */}
          {activeAnalysisTab === 'goals' && (
            <div className="space-y-6">
              
              {/* KPIs Row */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
                <div className="bg-slate-50 p-5 rounded-2xl border border-gray-100">
                  <p className="text-[10px] font-black uppercase text-gray-400">Total Goal Siswa</p>
                  <p className="text-2xl font-black text-gray-900 tracking-tight mt-1">{smartGoalAnalysis.total} Goals</p>
                </div>
                <div className="bg-slate-50 p-5 rounded-2xl border border-gray-100 text-emerald-600">
                  <p className="text-[10px] font-black uppercase text-gray-400">Goals Selesai (Completed)</p>
                  <p className="text-2xl font-black tracking-tight mt-1">{smartGoalAnalysis.completed} Selesai</p>
                </div>
                <div className="bg-slate-50 p-5 rounded-2xl border border-gray-100 text-blue-600">
                  <p className="text-[10px] font-black uppercase text-gray-400">Goals Aktif (On Track)</p>
                  <p className="text-2xl font-black tracking-tight mt-1">{smartGoalAnalysis.active} On Track</p>
                </div>
                <div className="bg-slate-50 p-5 rounded-2xl border border-gray-100 text-gray-500">
                  <p className="text-[10px] font-black uppercase text-gray-400">Goals Draft</p>
                  <p className="text-2xl font-black tracking-tight mt-1">{smartGoalAnalysis.draft} Draft</p>
                </div>
              </div>

              {/* Alerts: Missing mentor or checkins */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Missing mentor list */}
                <div className="bg-white border border-gray-100 rounded-3xl p-6">
                  <h4 className="text-xs font-black uppercase text-gray-400 mb-4 flex justify-between items-center">
                    <span>Goal Tanpa Mentor Pendamping</span>
                    <span className="bg-red-50 text-red-600 text-[10px] font-black px-2.5 py-0.5 rounded-full">{smartGoalAnalysis.missingMentor.length} Siswa</span>
                  </h4>
                  <div className="overflow-y-auto max-h-[220px] space-y-2">
                    {smartGoalAnalysis.missingMentor.length > 0 ? smartGoalAnalysis.missingMentor.map(r => (
                      <div key={r.id} className="bg-red-50/50 p-3 rounded-xl border border-red-100 flex justify-between items-center">
                        <div>
                          <p className="text-xs font-black text-gray-900">{r.studentName}</p>
                          <p className="text-[10px] text-gray-400 font-bold">{r.className}</p>
                        </div>
                        <span className="text-[10px] font-black text-red-700 bg-red-100 px-2 py-0.5 rounded-md">{r.goals?.length} Goals</span>
                      </div>
                    )) : (
                      <div className="text-center py-8 text-gray-400 text-xs font-bold uppercase tracking-wider opacity-60">Semua goal memiliki mentor pendamping</div>
                    )}
                  </div>
                </div>

                {/* Stagnant goals list */}
                <div className="bg-white border border-gray-100 rounded-3xl p-6">
                  <h4 className="text-xs font-black uppercase text-gray-400 mb-4 flex justify-between items-center">
                    <span>Goal Stagnan (&gt; 14 Hari Tanpa Check-In)</span>
                    <span className="bg-amber-50 text-amber-700 text-[10px] font-black px-2.5 py-0.5 rounded-full">{smartGoalAnalysis.stagnantGoals.length} Goals</span>
                  </h4>
                  <div className="overflow-y-auto max-h-[220px] space-y-2">
                    {smartGoalAnalysis.stagnantGoals.length > 0 ? smartGoalAnalysis.stagnantGoals.map((g, idx) => (
                      <div key={idx} className="bg-amber-50/50 p-3 rounded-xl border border-amber-100">
                        <div className="flex justify-between">
                          <p className="text-xs font-black text-gray-900">{g.studentName} ({g.className})</p>
                          <span className="text-[10px] text-amber-800 font-black">{g.daysSinceUpdate} Hari</span>
                        </div>
                        <p className="text-[10px] text-gray-500 font-bold truncate mt-1">Goal: {g.goal}</p>
                        <p className="text-[9px] text-gray-400 font-semibold">Mentor: {g.mentor}</p>
                      </div>
                    )) : (
                      <div className="text-center py-8 text-gray-400 text-xs font-bold uppercase tracking-wider opacity-60">Semua goal aktif ter-update berkala</div>
                    )}
                  </div>
                </div>

              </div>

              {/* Progress per mentor */}
              <div className="bg-white border border-gray-100 rounded-3xl p-6">
                <h4 className="text-xs font-black uppercase text-gray-400 mb-4">Tingkat Keberhasilan Goals per Mentor Pendamping</h4>
                <div className="overflow-y-auto max-h-[260px] space-y-3">
                  {smartGoalAnalysis.mentorProgress.map(m => (
                    <div key={m.name} className="flex items-center justify-between bg-slate-50 p-3.5 rounded-2xl">
                      <div>
                        <p className="text-xs font-black text-gray-800">{m.name}</p>
                        <p className="text-[10px] text-gray-400 font-bold">Total bimbingan: {m.total} goals</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-xs font-black text-[#002366]">{m.rate}% Selesai</p>
                        </div>
                        <div className="w-16 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${m.rate}%` }}></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

        </div>

      {/* FLOATING ACTION BOTTOM NAV (QUICK ACCESS TO ACTUAL FORMS/PAGES) */}
      <footer className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-[#002366]/90 backdrop-blur-md px-6 py-3.5 rounded-full flex gap-6 shadow-2xl items-center border border-white/10 z-30">
        <span className="text-[9px] font-black uppercase tracking-wider text-white/50 border-r border-white/10 pr-6 mr-1 italic">Akses Pintasan:</span>
        <Link to="/junior-high/behavior/mtss/cases" className="text-xs font-black text-white hover:text-blue-300 transition-colors uppercase tracking-widest italic flex items-center gap-1.5">
          <ShieldAlert size={14} className="text-blue-300" />
          Behavior Intervention Records
        </Link>
        <div className="w-px h-4 bg-white/10"></div>
        <Link to="/junior-high/behavior/mtss/spreadsheet" className="text-xs font-black text-white hover:text-emerald-300 transition-colors uppercase tracking-widest italic flex items-center gap-1.5">
          <FileSpreadsheet size={14} className="text-emerald-300" />
          Spreadsheet
        </Link>
        <div className="w-px h-4 bg-white/10"></div>
        <Link to="/junior-high/behavior/mtss/analytics" className="text-xs font-black text-white hover:text-purple-300 transition-colors uppercase tracking-widest italic flex items-center gap-1.5">
          <BarChart3 size={14} className="text-purple-300" />
          Analytics
        </Link>
      </footer>

      {/* FULLY INTERACTIVE DETAIL MODAL */}
      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white w-full max-w-4xl max-h-[85vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col border border-slate-100"
            >
              
              {/* Modal Header */}
              <div className="p-6 md:p-8 bg-slate-50 border-b border-gray-100 flex justify-between items-center">
                <div className="space-y-1">
                  <h3 className="text-lg font-black text-gray-900 uppercase italic tracking-tight">{modalTitle}</h3>
                  <p className="text-[11px] text-gray-400 font-medium">Menampilkan sumber data granular untuk penelaahan Unit Head.</p>
                </div>
                <button 
                  onClick={() => setModalOpen(false)}
                  className="w-10 h-10 rounded-full bg-slate-200/50 hover:bg-slate-200 text-gray-600 transition-colors flex items-center justify-center"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Controls */}
              <div className="px-6 md:px-8 py-4 border-b border-gray-50 flex items-center gap-3">
                <Search size={16} className="text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Cari kata kunci dalam tabel detail ini..."
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  className="flex-1 text-xs font-bold text-gray-700 bg-transparent border-none outline-none placeholder-gray-400"
                />
                {modalSearch && (
                  <button onClick={() => setModalSearch('')} className="text-xs text-gray-400 font-bold hover:text-gray-600">Reset</button>
                )}
              </div>

              {/* Modal Content / Table */}
              <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
                
                {filteredModalData.length > 0 ? (
                  <div className="overflow-x-auto">
                    
                    {/* Render table based on Modal Type */}
                    {modalType === 'lateness_today' && (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-gray-100 text-gray-400 uppercase tracking-wider font-black">
                            <th className="py-2.5">Siswa</th>
                            <th className="py-2.5">Kelas</th>
                            <th className="py-2.5">Durasi Terlambat</th>
                            <th className="py-2.5">Sumber / Petugas</th>
                            <th className="py-2.5 text-right">Keterangan / Alasan</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredModalData.map((row, idx) => {
                            const clsName = classes.find(c => c.id === row.classId || c.name === row.classId)?.name || row.className || row.classId || 'SMP';
                            const lateMin = getLatenessMinutes(row);
                            const arrivalStr = row.arrivalTime ? ` (${row.arrivalTime})` : '';
                            const recorder = row.recordedBy ? row.recordedBy.split('@')[0] : (row.arrivalTime ? 'Lateness App' : 'Absensi Kelas');
                            const reasons = row.reason || row.note || '-';
                            return (
                              <tr key={idx} className="border-b border-gray-50 hover:bg-slate-50 transition-colors">
                                <td className="py-3 font-black text-gray-900">{row.studentName}</td>
                                <td className="py-3 font-semibold text-gray-500">{clsName}</td>
                                <td className="py-3">
                                  <span className="bg-amber-50 text-amber-700 font-black px-2 py-0.5 rounded text-[10px]">
                                    {lateMin} menit{arrivalStr}
                                  </span>
                                </td>
                                <td className="py-3 text-gray-400 font-semibold">{recorder}</td>
                                <td className="py-3 text-right font-medium text-gray-600">{reasons}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}

                    {modalType === 'attendance_class_today' && (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-gray-100 text-gray-400 uppercase tracking-wider font-black">
                            <th className="py-2.5">Kelas</th>
                            <th className="py-2.5">Homeroom Teacher</th>
                            <th className="py-2.5 text-center">Roster Kehadiran</th>
                            <th className="py-2.5 text-center">Sakit / Izin / Alpa</th>
                            <th className="py-2.5 text-right">Status Input</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredModalData.map((row, idx) => (
                            <tr key={idx} className="border-b border-gray-50 hover:bg-slate-50 transition-colors">
                              <td className="py-3 font-black text-gray-900">{row.className}</td>
                              <td className="py-3 font-semibold text-gray-500">{row.teacher}</td>
                              <td className="py-3 text-center font-bold">{row.hadir}/{row.totalStudents} Hadir</td>
                              <td className="py-3 text-center font-bold text-gray-500">S:{row.sakit} | I:{row.izin} | A:{row.alpa}</td>
                              <td className="py-3 text-right">
                                <span className={cn(
                                  "px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
                                  row.isCompleted ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                                )}>
                                  {row.isCompleted ? "Lengkap" : "⚠️ Belum Lengkap"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {modalType === 'daily_cases_today' && (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-gray-100 text-gray-400 uppercase tracking-wider font-black">
                            <th className="py-2.5">Siswa</th>
                            <th className="py-2.5">Kelas</th>
                            <th className="py-2.5">Behavior Tier</th>
                            <th className="py-2.5">PIC Pendamping</th>
                            <th className="py-2.5 text-right">Status Kasus</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredModalData.map((row, idx) => (
                            <tr key={idx} className="border-b border-gray-50 hover:bg-slate-50 transition-colors">
                              <td className="py-3 font-black text-gray-900">{row.studentName}</td>
                              <td className="py-3 font-semibold text-gray-500">{row.classId}</td>
                              <td className="py-3"><span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-black">{row.tier}</span></td>
                              <td className="py-3 text-gray-500 font-bold">{row.picName || 'Belum Ada'}</td>
                              <td className="py-3 text-right">
                                <span className="bg-red-50 text-red-700 font-black px-2 py-0.5 rounded text-[10px]">
                                  {row.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {modalType === 'incident_report_today' && (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-gray-100 text-gray-400 uppercase tracking-wider font-black">
                            <th className="py-2.5">Tanggal / Jam</th>
                            <th className="py-2.5">Reporter</th>
                            <th className="py-2.5">Uraian Kejadian/Insiden</th>
                            <th className="py-2.5 text-right">Rencana Tindak Lanjut</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredModalData.map((row, idx) => (
                            <tr key={idx} className="border-b border-gray-50 hover:bg-slate-50 transition-colors">
                              <td className="py-3 font-semibold text-gray-500">{row.date || new Date(row.createdAt).toLocaleDateString()}</td>
                              <td className="py-3 font-black text-gray-800">{row.reporterName}</td>
                              <td className="py-3 text-gray-600 font-medium max-w-sm whitespace-normal leading-normal">{row.description}</td>
                              <td className="py-3 text-right font-black text-indigo-700">{row.nextSteps || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {modalType === 'followup_today' && (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-gray-100 text-gray-400 uppercase tracking-wider font-black">
                            <th className="py-2.5">Jatuh Tempo</th>
                            <th className="py-2.5">Reporter / PIC</th>
                            <th className="py-2.5">Tugas / Intervensi</th>
                            <th className="py-2.5 text-right">Rencana Tindakan</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredModalData.map((row, idx) => (
                            <tr key={idx} className="border-b border-gray-50 hover:bg-slate-50 transition-colors">
                              <td className="py-3 text-red-600 font-black">{row.nextStepDueDate || 'Hari ini'}</td>
                              <td className="py-3 font-black text-gray-800">{row.reporterName || row.nextStepPicName}</td>
                              <td className="py-3 text-gray-600 max-w-xs whitespace-normal leading-normal">{row.description}</td>
                              <td className="py-3 text-right font-black text-blue-950">{row.nextSteps}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {modalType === 'incomplete_data_today' && (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-gray-100 text-gray-400 uppercase tracking-wider font-black">
                            <th className="py-2.5">Jenis Administrasi</th>
                            <th className="py-2.5">Kelas / Siswa Terkait</th>
                            <th className="py-2.5 text-right">Rincian Informasi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredModalData.map((row, idx) => (
                            <tr key={idx} className="border-b border-gray-50 hover:bg-slate-50 transition-colors">
                              <td className="py-3 font-black text-rose-600">{row.tipe}</td>
                              <td className="py-3 font-black text-gray-900">{row.objek}</td>
                              <td className="py-3 text-right text-gray-500 font-semibold">{row.keterangan}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                  </div>
                ) : (
                  <div className="h-60 flex flex-col items-center justify-center text-gray-400 text-xs font-black uppercase tracking-wider gap-3">
                    <Search size={32} className="opacity-30" />
                    Hasil pencarian kosong atau belum ada data masuk.
                  </div>
                )}

              </div>

              {/* Modal Footer */}
              <div className="p-6 md:p-8 bg-slate-50 border-t border-gray-100 flex justify-end">
                <button 
                  onClick={() => setModalOpen(false)}
                  className="bg-[#002366] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-900 transition-colors shadow-lg"
                >
                  Selesai Penelaahan
                </button>
              </div>

            </motion.div>
          </div>
        )}

        {selectedClassForMissingDates && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col border border-slate-100"
            >
              {/* Modal Header */}
              <div className="p-6 md:p-8 bg-slate-50 border-b border-gray-100 flex justify-between items-center">
                <div className="space-y-1">
                  <h3 className="text-base font-black text-slate-900 uppercase italic tracking-tight">
                    Kelengkapan Input Kelas {selectedClassForMissingDates.name}
                  </h3>
                  <p className="text-[11px] text-slate-400 font-bold">
                    Wali Kelas: {selectedClassForMissingDates.teacher}
                  </p>
                </div>
                <button 
                  onClick={() => setSelectedClassForMissingDates(null)}
                  className="w-10 h-10 rounded-full bg-slate-200/50 hover:bg-slate-200 text-gray-600 transition-colors flex items-center justify-center"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6 md:p-8 overflow-y-auto max-h-[60vh] space-y-6">
                {/* Stats row */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Persentase Pengisian</p>
                    <p className="text-lg font-black text-slate-900 mt-1">
                      {auditWorkingDaysCount > 0 ? Math.round((selectedClassForMissingDates.filledDaysCount / auditWorkingDaysCount) * 100) : 100}%
                    </p>
                    <p className="text-[10px] text-slate-500 font-semibold mt-0.5">
                      {selectedClassForMissingDates.filledDaysCount} dari {auditWorkingDaysCount} Hari Efektif
                    </p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Kehadiran Kelas</p>
                    <p className="text-lg font-black text-emerald-600 mt-1">{selectedClassForMissingDates.rate}%</p>
                    <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Rata-rata presensi terisi</p>
                  </div>
                </div>

                {/* Missing Dates List */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <AlertTriangle size={14} className="text-orange-500" />
                    <span>Daftar Hari Sekolah Belum Diinput ({selectedClassForMissingDates.missingDates.length})</span>
                  </h4>
                  {selectedClassForMissingDates.missingDates.length === 0 ? (
                    <div className="p-6 text-center bg-emerald-50 rounded-2xl border border-emerald-100 space-y-2">
                      <CheckCircle2 size={32} className="text-emerald-500 mx-auto" />
                      <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Sempurna & Lengkap!</p>
                      <p className="text-[10px] text-emerald-600 font-semibold">Semua hari sekolah beroperasi telah diisi dan dilaporkan oleh wali kelas.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[250px] overflow-y-auto pr-1">
                      {selectedClassForMissingDates.missingDates.map((dateStr: string) => {
                        const dateObj = new Date(dateStr);
                        const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
                        const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
                        const formatted = !isNaN(dateObj.getTime()) 
                          ? `${days[dateObj.getDay()]}, ${dateObj.getDate()} ${months[dateObj.getMonth()]} ${dateObj.getFullYear()}`
                          : dateStr;

                        return (
                          <div key={dateStr} className="p-3 bg-red-50/50 border border-red-100 rounded-xl flex items-center justify-between">
                            <span className="text-xs font-bold text-red-700">{formatted}</span>
                            <span className="text-[10px] font-black text-red-500 uppercase tracking-wider">Belum Isi</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-6 md:p-8 bg-slate-50 border-t border-gray-100 flex justify-end">
                <button 
                  onClick={() => setSelectedClassForMissingDates(null)}
                  className="bg-[#002366] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-900 transition-colors shadow-lg"
                >
                  Tutup
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {selectedStudentForAttendanceDetail && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col border border-slate-100"
            >
              {/* Modal Header */}
              <div className="p-6 md:p-8 bg-slate-50 border-b border-gray-100 flex justify-between items-center">
                <div className="space-y-1">
                  <h3 className="text-base font-black text-slate-900 uppercase italic tracking-tight">
                    Detail Kehadiran Siswa
                  </h3>
                  <p className="text-[11px] text-slate-400 font-bold">
                    Unit: Junior High • Tahun Ajaran: {selectedYear} • Semester: {selectedSemester}
                  </p>
                </div>
                <button 
                  onClick={() => setSelectedStudentForAttendanceDetail(null)}
                  className="w-10 h-10 rounded-full bg-slate-200/50 hover:bg-slate-200 text-gray-600 transition-colors flex items-center justify-center"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6 md:p-8 overflow-y-auto max-h-[60vh] space-y-6">
                
                {/* Profile header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 gap-3">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Identitas Siswa</p>
                    <p className="text-sm font-black text-slate-900">{selectedStudentForAttendanceDetail.name}</p>
                    <p className="text-xs text-slate-500 font-bold">NIS: {selectedStudentForAttendanceDetail.nis || '-'}</p>
                  </div>
                  <div className="text-left sm:text-right space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Kelas</p>
                    <span className="inline-flex px-3 py-1 bg-blue-50 text-blue-800 text-xs font-black rounded-full border border-blue-100">
                      Kelas {selectedStudentForAttendanceDetail.className}
                    </span>
                  </div>
                </div>

                {/* Stats Summary Grid */}
                {selectedStudentForAttendanceDetail.isSalat ? (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100 text-center">
                      <p className="text-[9px] font-black text-emerald-700 uppercase">Berjamaah</p>
                      <p className="text-sm font-black text-emerald-800 mt-0.5">{selectedStudentForAttendanceDetail.jamaah}</p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                      <p className="text-[9px] font-black text-slate-400 uppercase">Berhalangan</p>
                      <p className="text-sm font-black text-slate-800 mt-0.5">{selectedStudentForAttendanceDetail.berhalangan}</p>
                    </div>
                    <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100 text-center">
                      <p className="text-[9px] font-black text-blue-700 uppercase">Izin</p>
                      <p className="text-sm font-black text-blue-800 mt-0.5">{selectedStudentForAttendanceDetail.izin}</p>
                    </div>
                    <div className="bg-red-50/50 p-3 rounded-xl border border-red-100 text-center">
                      <p className="text-[9px] font-black text-red-700 uppercase">Alpa Salat</p>
                      <p className="text-sm font-black text-red-800 mt-0.5">{selectedStudentForAttendanceDetail.tidakMengikuti}</p>
                    </div>
                    <div className="col-span-2 sm:col-span-1 bg-[#002366]/5 p-3 rounded-xl border border-[#002366]/10 text-center">
                      <p className="text-[9px] font-black text-[#002366] uppercase">Rasio</p>
                      <p className="text-sm font-black text-[#002366] mt-0.5">{selectedStudentForAttendanceDetail.rate}%</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                      <p className="text-[9px] font-black text-slate-400 uppercase">Hadir</p>
                      <p className="text-sm font-black text-slate-800 mt-0.5">{selectedStudentForAttendanceDetail.hadir}</p>
                    </div>
                    <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-100 text-center">
                      <p className="text-[9px] font-black text-amber-700 uppercase">Sakit</p>
                      <p className="text-sm font-black text-amber-800 mt-0.5">{selectedStudentForAttendanceDetail.sakit}</p>
                    </div>
                    <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100 text-center">
                      <p className="text-[9px] font-black text-blue-700 uppercase">Izin</p>
                      <p className="text-sm font-black text-blue-800 mt-0.5">{selectedStudentForAttendanceDetail.izin}</p>
                    </div>
                    <div className="bg-red-50/50 p-3 rounded-xl border border-red-100 text-center">
                      <p className="text-[9px] font-black text-red-700 uppercase">Alpa</p>
                      <p className="text-sm font-black text-red-800 mt-0.5">{selectedStudentForAttendanceDetail.alpa}</p>
                    </div>
                    <div className="col-span-2 sm:col-span-1 bg-[#002366]/5 p-3 rounded-xl border border-[#002366]/10 text-center">
                      <p className="text-[9px] font-black text-[#002366] uppercase">Rasio</p>
                      <p className="text-sm font-black text-[#002366] mt-0.5">{selectedStudentForAttendanceDetail.rate}%</p>
                    </div>
                  </div>
                )}

                {/* History List */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <Calendar size={14} className="text-blue-600" />
                    <span>
                      {selectedStudentForAttendanceDetail.isSalat 
                        ? `Riwayat Shalat Zuhur (${salatHistoryForSelectedStudent.length})` 
                        : `Daftar Ketidakhadiran (${absentDatesForSelectedStudent.length})`}
                    </span>
                  </h4>
                  
                  {selectedStudentForAttendanceDetail.isSalat ? (
                    salatHistoryForSelectedStudent.length === 0 ? (
                      <div className="p-6 text-center bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                        <CheckCircle2 size={32} className="text-slate-400 mx-auto" />
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tidak Ada Data</p>
                        <p className="text-[10px] text-slate-400 font-semibold">Belum ada riwayat shalat yang diinput pada rentang periode ini.</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                        {salatHistoryForSelectedStudent.map((row: any, idx: number) => {
                          const dateObj = new Date(row.date);
                          const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
                          const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
                          const formattedDate = !isNaN(dateObj.getTime()) 
                            ? `${days[dateObj.getDay()]} ${dateObj.getDate()} ${months[dateObj.getMonth()]} ${dateObj.getFullYear()}`
                            : row.date;

                          return (
                            <div key={idx} className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div className="space-y-1">
                                <span className="text-xs font-black text-slate-800">{formattedDate}</span>
                                <p className="text-[10px] font-semibold text-slate-500">Keterangan: {row.note}</p>
                              </div>
                              <span className={cn("px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border self-start sm:self-auto", row.statusColor)}>
                                {row.statusLabel}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )
                  ) : (
                    absentDatesForSelectedStudent.length === 0 ? (
                      <div className="p-6 text-center bg-emerald-50 rounded-2xl border border-emerald-100 space-y-2">
                        <CheckCircle2 size={32} className="text-emerald-500 mx-auto" />
                        <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Hadir Sempurna!</p>
                        <p className="text-[10px] text-emerald-600 font-semibold">Siswa ini tercatat hadir penuh tanpa ketidakhadiran pada rentang filter ini.</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                        {absentDatesForSelectedStudent.map((row: any, idx: number) => {
                          const dateObj = new Date(row.date);
                          const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
                          const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
                          const formattedDate = !isNaN(dateObj.getTime()) 
                            ? `${days[dateObj.getDay()]} ${dateObj.getDate()} ${months[dateObj.getMonth()]} ${dateObj.getFullYear()}`
                            : row.date;

                          return (
                            <div key={idx} className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div className="space-y-1">
                                <span className="text-xs font-black text-slate-800">{formattedDate}</span>
                                <p className="text-[10px] font-semibold text-slate-500">Keterangan: {row.note}</p>
                              </div>
                              <span className={cn("px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border self-start sm:self-auto", row.statusColor)}>
                                {row.statusLabel}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )
                  )}
                </div>

              </div>

              {/* Modal Footer */}
              <div className="p-6 md:p-8 bg-slate-50 border-t border-gray-100 flex justify-end">
                <button 
                  onClick={() => setSelectedStudentForAttendanceDetail(null)}
                  className="bg-[#002366] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-900 transition-colors shadow-lg"
                >
                  Tutup
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
