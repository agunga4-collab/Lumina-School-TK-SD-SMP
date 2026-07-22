import * as React from 'react';
import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, Legend
} from 'recharts';
import { 
  AlertTriangle, CheckCircle, Clock, ChevronRight, ShieldAlert, Activity, 
  LayoutGrid, Timer, Loader2, BarChart3, Users, Calendar, Filter, Search, 
  UserX, Info, ArrowUpRight, ArrowDownRight, BookOpen, ThumbsUp, AlertCircle,
  TrendingUp, FileSpreadsheet, Plus, CornerDownRight, MessageSquare, CheckSquare,
  Sparkles, X, Star, FileText
} from 'lucide-react';
import { Link, useOutletContext } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { collection, query, where, getDocs, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UnitType } from '../../types';
import { useAcademicYear } from '../../context/AcademicYearContext';

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

  // --- Navigation & Modal UI ---
  const [activeAnalysisTab, setActiveAnalysisTab] = useState<'daily_insights' | 'keterlambatan' | 'kehadiran' | 'academic' | 'behavior' | 'goals'>('daily_insights');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalData, setModalData] = useState<any[]>([]);
  const [modalType, setModalType] = useState<string>('');
  const [modalSearch, setModalSearch] = useState('');

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
          literacySnap
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
          getDocs(collection(db, 'junior_high_literacy_numeracy_records'))
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

  // --- Dynamic Filtering Helpers ---
  const isStudentInClass = (studentClassId: string, targetClassId: string) => {
    if (targetClassId === 'ALL') return true;
    if (!studentClassId) return false;
    if (studentClassId === targetClassId) return true;
    
    const targetClass = classes.find(c => c.id === targetClassId || c.name === targetClassId);
    if (targetClass && (studentClassId === targetClass.name || studentClassId === targetClass.id)) {
      return true;
    }
    const studentClass = classes.find(c => c.id === studentClassId || c.name === studentClassId);
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
      const cls = classes.find(c => c.id === s.classId || c.name === s.classId);
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
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      if (selectedCohort !== 'ALL') {
        const studentGrade = getStudentGrade(s);
        if (studentGrade !== parseInt(selectedCohort)) return false;
      }
      if (selectedClassId !== 'ALL' && !isStudentInClass(s.classId, selectedClassId)) return false;
      return true;
    });
  }, [students, selectedClassId, selectedCohort, classes]);

  const activeStudentIds = useMemo(() => new Set(filteredStudents.map(s => s.id)), [filteredStudents]);
  const isStudentFiltered = (sid: string) => activeStudentIds.has(sid);

  // --- Unified Lateness Records ---
  const unifiedLateness = useMemo(() => {
    // 1. Get all lateness records matching JUNIOR_HIGH or filtered students
    const jhl = latenessRecords.filter(r => r.unitId === 'JUNIOR_HIGH' || isStudentFiltered(r.studentId));
    
    // Create a set of studentId_date keys from lateness_records to avoid duplicates
    const existingKeys = new Set(jhl.map(r => `${r.studentId}_${r.date}`));
    
    // 2. Add LATE records from attendance_records that don't already have an entry in lateness_records
    const attendanceLates = attendanceRecords
      .filter(r => r.status === 'LATE' && isStudentFiltered(r.studentId))
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
          className: classes.find(c => c.id === r.classId)?.name || r.classId,
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
    const jhClasses = classes.filter(c => {
      if (selectedClassId !== 'ALL' && c.id !== selectedClassId) return false;
      if (selectedCohort !== 'ALL' && !isClassInCohort(c, selectedCohort)) return false;
      return true;
    });
    return jhClasses.map(cls => {
      const clsStudents = students.filter(s => isStudentInClass(s.classId, cls.id));
      const recsToday = attendanceRecords.filter(r => isStudentInClass(r.classId, cls.id) && r.date === todayStr);
      
      const hadir = recsToday.filter(r => r.status === 'HADIR' || r.status === 'LATE').length;
      const sakit = recsToday.filter(r => r.status === 'SAKIT').length;
      const izin = recsToday.filter(r => r.status === 'IZIN').length;
      const alpa = recsToday.filter(r => r.status === 'ALPA').length;
      
      const isCompleted = clsStudents.length === 0 || recsToday.length >= clsStudents.length;
      return { classId: cls.id, className: cls.name, teacher: cls.homeroomTeacherName || 'Guru', totalStudents: clsStudents.length, recsCount: recsToday.length, hadir, sakit, izin, alpa, isCompleted };
    });
  }, [classes, students, attendanceRecords, todayStr, selectedClassId, selectedCohort]);

  // 3. Daily Case Record (Individual Case Record - created today)
  const todayCases = useMemo(() => {
    const tStart = new Date(todayStr + 'T00:00:00').getTime();
    const tEnd = new Date(todayStr + 'T23:59:59.999').getTime();
    const casesToday = behaviorCases.filter(c => c.createdAt >= tStart && c.createdAt <= tEnd && isStudentFiltered(c.studentId));
    
    return {
      total: casesToday.length,
      open: casesToday.filter(c => c.status === 'OPEN').length,
      review: casesToday.filter(c => c.status === 'UNDER_REVIEW').length,
      closed: casesToday.filter(c => c.status === 'CLOSED').length,
      raw: casesToday
    };
  }, [behaviorCases, isStudentFiltered, todayStr]);

  // 4. Incident Report Hari Ini (Concerns logged today)
  const todayIncidents = useMemo(() => {
    const jhCaseIds = new Set(behaviorCases.filter(c => isStudentFiltered(c.studentId)).map(c => c.id));
    const incidents = concerns.filter(con => {
      if (!jhCaseIds.has(con.caseId)) return false;
      const conDate = con.date || (con.createdAt ? new Date(con.createdAt).toISOString().split('T')[0] : '');
      return conDate === todayStr;
    });

    const categoryMap = { Disiplin: 0, Sikap: 0, Kerapihan: 0, Sosial: 0, Lainnya: 0 };
    incidents.forEach(inc => {
      const desc = inc.description.toLowerCase();
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
    const activeCaseIds = new Set(behaviorCases.filter(c => isStudentFiltered(c.studentId)).map(c => c.id));
    const pendingConcerns = concerns.filter(con => {
      if (!activeCaseIds.has(con.caseId)) return false;
      return !con.isDone && con.nextStepDueDate && con.nextStepDueDate <= todayStr;
    });

    const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const stagnantAcademic = academicCases.filter(c => c.status !== 'CLOSED' && c.updatedAt < fourteenDaysAgo && isStudentFiltered(c.studentId));
    const stagnantBehavior = behaviorCases.filter(c => c.status !== 'CLOSED' && c.lastUpdatedAt < fourteenDaysAgo && isStudentFiltered(c.studentId));

    return {
      pendingConcerns,
      stagnantAcademic,
      stagnantBehavior,
      total: pendingConcerns.length + stagnantAcademic.length + stagnantBehavior.length
    };
  }, [concerns, behaviorCases, academicCases, isStudentFiltered, todayStr]);

  // 6. Data Belum Lengkap
  const incompleteData = useMemo(() => {
    const uncompletedClasses = todayClassAttendance.filter(c => !c.isCompleted);
    
    // Goal missing mentor
    const mentorsMap = new Set(mentorAssignments.filter(asg => asg.status === 'ACTIVE').map(asg => asg.studentId));
    const goalsNoMentor = goalResponses.filter(r => (r.goals || []).length > 0 && !mentorsMap.has(r.studentId) && isStudentFiltered(r.studentId));

    // No goal check-ins
    const responsesWithGoals = goalResponses.filter(r => (r.goals || []).length > 0 && isStudentFiltered(r.studentId));
    const studentsCheckedIn = new Set(filteredGoalTrackers.map(t => t.studentId));
    const goalsNoCheckIn = responsesWithGoals.filter(r => !studentsCheckedIn.has(r.studentId));

    return {
      uncompletedClasses,
      goalsNoMentor,
      goalsNoCheckIn,
      total: uncompletedClasses.length + goalsNoMentor.length + goalsNoCheckIn.length
    };
  }, [todayClassAttendance, goalResponses, mentorAssignments, filteredGoalTrackers, isStudentFiltered]);

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
      const className = classes.find(c => c.id === r.classId || c.name === r.classId)?.name || r.classId;
      classCounts[className] = (classCounts[className] || 0) + 1;
    });
    const classRank = Object.entries(classCounts).map(([name, count]) => ({ name, count })).sort((a,b) => b.count - a.count);

    // Repeated students
    const studentCounts: Record<string, { name: string, className: string, count: number, totalMin: number }> = {};
    records.forEach(r => {
      if (!studentCounts[r.studentId]) {
        const clsName = classes.find(c => c.id === r.classId || c.name === r.classId)?.name || r.classId;
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
  }, [filteredLateness, classes]);

  // 2. Kehadiran Tab Analysis
  const attendanceAnalysis = useMemo(() => {
    const recs = filteredAttendance;
    const total = recs.length;
    const hadir = recs.filter(r => r.status === 'HADIR' || r.status === 'LATE').length;
    const sakit = recs.filter(r => r.status === 'SAKIT').length;
    const izin = recs.filter(r => r.status === 'IZIN').length;
    const alpa = recs.filter(r => r.status === 'ALPA').length;
    
    const rate = total > 0 ? Math.round((hadir / total) * 100) : 0;

    // Cohort rate
    const cohorts: Record<string, { present: number, total: number }> = { '7': { present: 0, total: 0 }, '8': { present: 0, total: 0 }, '9': { present: 0, total: 0 } };
    recs.forEach(r => {
      let g = '';
      const s = students.find(stud => stud.id === r.studentId);
      if (s) {
        const gradeVal = getStudentGrade(s);
        if (gradeVal) g = String(gradeVal);
      }
      if (!g && r.classId) {
        const cls = classes.find(c => c.id === r.classId || c.name === r.classId);
        if (cls && cls.name) {
          const gradeVal = parseInt(cls.name);
          if (!isNaN(gradeVal)) g = String(gradeVal);
        } else {
          const numericMatch = r.classId.match(/\d+/);
          if (numericMatch) g = numericMatch[0];
        }
      }
      if (cohorts[g]) {
        cohorts[g].total++;
        if (r.status === 'HADIR' || r.status === 'LATE') cohorts[g].present++;
      }
    });
    const cohortRates = Object.entries(cohorts).map(([g, d]) => ({
      cohort: `Grade ${g}`,
      rate: d.total > 0 ? Math.round((d.present / d.total) * 100) : 0
    }));

    // Class Rate
    const classMap: Record<string, { present: number, total: number }> = {};
    recs.forEach(r => {
      const cls = classes.find(c => c.id === r.classId || c.name === r.classId);
      const cid = cls ? cls.id : r.classId;
      if (!cid) return;
      if (!classMap[cid]) classMap[cid] = { present: 0, total: 0 };
      classMap[cid].total++;
      if (r.status === 'HADIR' || r.status === 'LATE') classMap[cid].present++;
    });
    const classRates = Object.entries(classMap).map(([cid, d]) => ({
      classId: cid,
      name: classes.find(c => c.id === cid)?.name || cid,
      rate: d.total > 0 ? Math.round((d.present / d.total) * 100) : 0
    })).sort((a,b) => b.rate - a.rate);

    // Low presence (< 90%)
    const studentMap: Record<string, { name: string, classId: string, present: number, total: number }> = {};
    recs.forEach(r => {
      if (!studentMap[r.studentId]) studentMap[r.studentId] = { name: r.studentName, classId: r.classId, present: 0, total: 0 };
      studentMap[r.studentId].total++;
      if (r.status === 'HADIR' || r.status === 'LATE') studentMap[r.studentId].present++;
    });
    const lowPresence = Object.entries(studentMap).map(([id, d]) => ({
      id, name: d.name, className: classes.find(c => c.id === d.classId || c.name === d.classId)?.name || d.classId, rate: d.total > 0 ? Math.round((d.present / d.total) * 100) : 0, total: d.total
    })).filter(s => s.rate < 90 && s.total >= 3).sort((a,b) => a.rate - b.rate);

    const classesFollowUp = classRates.filter(c => c.rate < 95);

    // Trends of status over days
    const dailyMap: Record<string, { hadir: number, sakit: number, izin: number, alpa: number }> = {};
    recs.forEach(r => {
      if (!dailyMap[r.date]) dailyMap[r.date] = { hadir: 0, sakit: 0, izin: 0, alpa: 0 };
      if (r.status === 'HADIR' || r.status === 'LATE') dailyMap[r.date].hadir++;
      else if (r.status === 'SAKIT') dailyMap[r.date].sakit++;
      else if (r.status === 'IZIN') dailyMap[r.date].izin++;
      else if (r.status === 'ALPA') dailyMap[r.date].alpa++;
    });
    const trendData = Object.entries(dailyMap).map(([date, val]) => ({
      date,
      displayDate: date.substring(5),
      ...val
    })).sort((a,b) => a.date.localeCompare(b.date));

    return { rate, sakit, izin, alpa, cohortRates, classRates, lowPresence, classesFollowUp, trendData };
  }, [filteredAttendance, classes, students]);

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
      const desc = con.description.toLowerCase();
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
    if (!modalSearch) return modalData;
    const term = modalSearch.toLowerCase();
    return modalData.filter(item => {
      const valuesStr = Object.values(item).map(v => String(v).toLowerCase()).join(' ');
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
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
                        type: 'Daily Case Record (ICR)',
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
              
              {/* KPIs Row */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
                <div className="bg-slate-50 p-5 rounded-2xl border border-gray-100">
                  <p className="text-[10px] font-black uppercase text-gray-400">Persentase Kehadiran</p>
                  <p className="text-2xl font-black text-emerald-600 tracking-tight mt-1">{attendanceAnalysis.rate}%</p>
                </div>
                <div className="bg-slate-50 p-5 rounded-2xl border border-gray-100">
                  <p className="text-[10px] font-black uppercase text-gray-400">Total Sakit (S)</p>
                  <p className="text-2xl font-black text-[#002366] tracking-tight mt-1">{attendanceAnalysis.sakit} Siswa</p>
                </div>
                <div className="bg-slate-50 p-5 rounded-2xl border border-gray-100">
                  <p className="text-[10px] font-black uppercase text-gray-400">Total Izin (I)</p>
                  <p className="text-2xl font-black text-blue-600 tracking-tight mt-1">{attendanceAnalysis.izin} Siswa</p>
                </div>
                <div className="bg-slate-50 p-5 rounded-2xl border border-gray-100">
                  <p className="text-[10px] font-black uppercase text-gray-400">Total Alpa (A)</p>
                  <p className="text-2xl font-black text-red-600 tracking-tight mt-1">{attendanceAnalysis.alpa} Siswa</p>
                </div>
              </div>

              {/* Cohort & Classes */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Cohort presence rates */}
                <div className="bg-white border border-gray-100 rounded-3xl p-6 flex flex-col justify-between h-[300px]">
                  <h4 className="text-xs font-black uppercase text-gray-400 mb-4">Persentase Kehadiran per Cohort</h4>
                  <div className="space-y-4 flex-1 flex flex-col justify-center">
                    {attendanceAnalysis.cohortRates.map(cohort => (
                      <div key={cohort.cohort} className="space-y-1">
                        <div className="flex justify-between text-xs font-black text-gray-700">
                          <span>{cohort.cohort}</span>
                          <span>{cohort.rate}%</span>
                        </div>
                        <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                          <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${cohort.rate}%` }}></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Trend Chart */}
                <div className="bg-white border border-gray-100 rounded-3xl p-6 h-[300px] flex flex-col">
                  <h4 className="text-xs font-black uppercase text-gray-400 mb-4">Tren Hadir, Sakit, Izin, Alpa</h4>
                  <div className="flex-1 min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={attendanceAnalysis.trendData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="displayDate" tick={{ fontSize: 9, fill: '#9ca3af' }} />
                        <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} />
                        <Tooltip />
                        <Area type="monotone" dataKey="hadir" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.1} />
                        <Area type="monotone" dataKey="sakit" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} />
                        <Area type="monotone" dataKey="izin" stackId="1" stroke="#6366f1" fill="#6366f1" fillOpacity={0.1} />
                        <Area type="monotone" dataKey="alpa" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.1} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

              </div>

              {/* Low Attendance & Follow-up */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Students with low attendance */}
                <div className="bg-white border border-gray-100 rounded-3xl p-6">
                  <h4 className="text-xs font-black uppercase text-gray-400 mb-4">Siswa dengan Kehadiran Rendah (&lt; 90%)</h4>
                  <div className="overflow-y-auto max-h-[250px] space-y-2">
                    {attendanceAnalysis.lowPresence.length > 0 ? attendanceAnalysis.lowPresence.map(s => (
                      <div key={s.id} className="flex justify-between items-center bg-rose-50/50 p-3 rounded-xl border border-rose-100">
                        <div>
                          <p className="text-xs font-black text-gray-900">{s.name}</p>
                          <p className="text-[10px] text-gray-400 font-bold">Kelas: {s.className}</p>
                        </div>
                        <span className="text-xs font-black text-red-600 bg-red-100 px-2.5 py-1 rounded-lg">{s.rate}% Presensi</span>
                      </div>
                    )) : (
                      <div className="text-center py-8 text-gray-400 text-xs font-bold uppercase tracking-wider opacity-60">Tidak ada siswa berisiko kehadiran rendah</div>
                    )}
                  </div>
                </div>

                {/* Highlight classes need follow-up */}
                <div className="bg-white border border-gray-100 rounded-3xl p-6">
                  <h4 className="text-xs font-black uppercase text-gray-400 mb-4">Highlight Kelas Butuh Intervensi (&lt; 95%)</h4>
                  <div className="overflow-y-auto max-h-[250px] space-y-2">
                    {attendanceAnalysis.classesFollowUp.length > 0 ? attendanceAnalysis.classesFollowUp.map(c => (
                      <div key={c.classId} className="flex justify-between items-center bg-amber-50/50 p-3 rounded-xl border border-amber-100">
                        <div>
                          <p className="text-xs font-black text-gray-900">{c.name}</p>
                          <p className="text-[10px] text-gray-400 font-bold">SMP Homeroom</p>
                        </div>
                        <span className="text-xs font-black text-amber-700 bg-amber-100 px-2.5 py-1 rounded-lg">{c.rate}% Presensi</span>
                      </div>
                    )) : (
                      <div className="text-center py-8 text-gray-400 text-xs font-bold uppercase tracking-wider opacity-60">Semua kelas memenuhi target kehadiran 95%</div>
                    )}
                  </div>
                </div>

              </div>

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
          Individual Case Record
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
      </AnimatePresence>

    </div>
  );
}
