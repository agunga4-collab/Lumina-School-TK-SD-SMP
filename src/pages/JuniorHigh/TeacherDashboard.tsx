import * as React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  AlertTriangle, CheckCircle2, Clock, ChevronRight, Loader2, 
  Calendar, Filter, Search, UserX, Info, ArrowRight, Bell, 
  BookOpen, ShieldAlert, CheckSquare, FileText, Check, ExternalLink,
  AlertCircle, Sparkles, BookMarked, UserCheck, MessageSquare
} from 'lucide-react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { 
  db, 
  getActiveStudents, 
  getNotifications, 
  markNotificationAsRead,
  getSEPeriods,
  getSEEnrollmentsByClass
} from '../../lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, orderBy } from 'firebase/firestore';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { threeWayConferenceService } from '../../services/threeWayConferenceService';
import { 
  Class, Student, AttendanceRecord, MTSSCase, MTSSAcademicCase, 
  StudentConferenceResponse, MentorAssignment, AppNotification, SEPeriod, SEEnrollment 
} from '../../types';
import { toast } from 'sonner';

export default function TeacherDashboard() {
  const navigate = useNavigate();
  const { activeYear, activeSemester } = useAcademicYear();
  const { currentUser } = useOutletContext<{ currentUser: any }>();

  // Tabs visibility and state
  const [hasHomeroom, setHasHomeroom] = useState<boolean>(false);
  const [hasMentor, setHasMentor] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'GURU_KELAS' | 'MENTOR'>('GURU_KELAS');

  // Master lists
  const [homeroomClasses, setHomeroomClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [students, setStudents] = useState<Student[]>([]);
  const [activePeriod, setActivePeriod] = useState<any | null>(null);

  // Loading states
  const [loadingInitial, setLoadingInitial] = useState<boolean>(true);
  const [loadingClassData, setLoadingClassData] = useState<boolean>(false);

  // Class data lists
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [latenessRecords, setLatenessRecords] = useState<any[]>([]);
  const [behaviorCases, setBehaviorCases] = useState<MTSSCase[]>([]);
  const [academicCases, setAcademicCases] = useState<MTSSAcademicCase[]>([]);
  const [twcResponses, setTwcResponses] = useState<StudentConferenceResponse[]>([]);
  const [seEnrollments, setSeEnrollments] = useState<SEEnrollment[]>([]);
  const [activeSePeriod, setActiveSePeriod] = useState<SEPeriod | null>(null);

  // Mentor tab data
  const [mentorAssignments, setMentorAssignments] = useState<MentorAssignment[]>([]);
  const [mentorMenteesData, setMentorMenteesData] = useState<any[]>([]);
  const [loadingMentorData, setLoadingMentorData] = useState<boolean>(false);

  // Notifications
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loadingNotifs, setLoadingNotifs] = useState<boolean>(false);

  // Generate 14 school days
  const last14SchoolDays = useMemo(() => {
    const dates: string[] = [];
    const curr = new Date();
    let checked = 0;
    while (dates.length < 14 && checked < 30) {
      const day = curr.getDay();
      if (day !== 0 && day !== 6) { // Exclude Sat/Sun
        dates.push(curr.toISOString().split('T')[0]);
      }
      curr.setDate(curr.getDate() - 1);
      checked++;
    }
    return dates;
  }, []);

  const todayStr = useMemo(() => {
    return new Date().toISOString().split('T')[0];
  }, []);

  // Check roles, homeroom classes, and mentor assignments on mount / context change
  useEffect(() => {
    const initDashboard = async () => {
      if (!currentUser?.uid || !activeYear) return;
      setLoadingInitial(true);
      try {
        // 1. Check Homeroom classes
        const classesRef = collection(db, 'classes');
        const homeroomQuery = query(
          classesRef,
          where('academicYear', '==', activeYear),
          where('homeroomTeacherId', '==', currentUser.uid)
        );
        const homeroomSnap = await getDocs(homeroomQuery);
        const classesList = homeroomSnap.docs.map(d => ({ id: d.id, ...d.data() } as Class));
        setHomeroomClasses(classesList);
        const isHomeroomTeacher = classesList.length > 0;
        setHasHomeroom(isHomeroomTeacher);

        if (isHomeroomTeacher) {
          setSelectedClassId(classesList[0].id);
        }

        // 2. Fetch Active TWC Period
        const period = await threeWayConferenceService.getCurrentConferencePeriod(activeYear, activeSemester);
        setActivePeriod(period);

        // 3. Check Mentor Assignments
        let isMentor = false;
        if (period) {
          const assignmentsQuery = query(
            collection(db, 'mentorAssignments'),
            where('mentorId', '==', currentUser.uid),
            where('periodId', '==', period.id),
            where('status', '==', 'ACTIVE')
          );
          const assignmentsSnap = await getDocs(assignmentsQuery);
          const activeAssignments = assignmentsSnap.docs.map(doc => doc.data() as MentorAssignment);
          setMentorAssignments(activeAssignments);
          isMentor = activeAssignments.length > 0;
          setHasMentor(isMentor);
        }

        // Set default active tab
        if (isHomeroomTeacher) {
          setActiveTab('GURU_KELAS');
        } else if (isMentor) {
          setActiveTab('MENTOR');
        } else {
          setActiveTab('GURU_KELAS'); // fallback
        }

      } catch (err) {
        console.error('Error initializing teacher dashboard:', err);
        toast.error('Gagal memuat data awal dashboard.');
      } finally {
        setLoadingInitial(false);
      }
    };

    initDashboard();
  }, [currentUser?.uid, activeYear, activeSemester]);

  // Fetch data for Selected Class
  useEffect(() => {
    const fetchClassDetails = async () => {
      if (!selectedClassId || !activeYear) {
        setStudents([]);
        return;
      }
      setLoadingClassData(true);
      try {
        // A. Fetch active students in class
        const activeStudents = await getActiveStudents(selectedClassId, activeYear);
        setStudents(activeStudents);

        if (activeStudents.length === 0) {
          setAttendanceRecords([]);
          setLatenessRecords([]);
          setBehaviorCases([]);
          setAcademicCases([]);
          setTwcResponses([]);
          setSeEnrollments([]);
          setLoadingClassData(false);
          return;
        }

        // B. Fetch attendance records
        const attRef = collection(db, 'attendance_records');
        const attQuery = query(
          attRef,
          where('classId', '==', selectedClassId),
          where('academicYear', '==', activeYear),
          where('semester', '==', activeSemester)
        );
        const attSnap = await getDocs(attQuery);
        const attList = attSnap.docs.map(doc => doc.data() as AttendanceRecord);
        setAttendanceRecords(attList);

        // C. Fetch lateness records for the last 14 days
        const lateRef = collection(db, 'lateness_records');
        const lateQuery = query(
          lateRef,
          where('classId', '==', selectedClassId),
          where('academicYear', '==', activeYear)
        );
        const lateSnap = await getDocs(lateQuery);
        const lateList = lateSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setLatenessRecords(lateList);

        // D. Fetch Active MTSS Academic cases
        const acadRef = collection(db, 'juniorhigh_mtss_academic_cases');
        const acadQuery = query(
          acadRef,
          where('classId', '==', selectedClassId),
          where('academicYear', '==', activeYear)
        );
        const acadSnap = await getDocs(acadQuery);
        const activeAcadCases = acadSnap.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as MTSSAcademicCase))
          .filter(c => c.status !== 'CLOSED');
        setAcademicCases(activeAcadCases);

        // E. Fetch Active MTSS Behavior cases
        const behavRef = collection(db, 'behaviorCases');
        const behavQuery = query(
          behavRef,
          where('classId', '==', selectedClassId),
          where('academicYear', '==', activeYear)
        );
        const behavSnap = await getDocs(behavQuery);
        const activeBehavCases = behavSnap.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as MTSSCase))
          .filter(c => c.status !== 'CLOSED');
        setBehaviorCases(activeBehavCases);

        // F. Fetch TWC responses
        if (activePeriod) {
          const respRef = collection(db, 'studentConferenceResponses');
          const respQuery = query(
            respRef,
            where('periodId', '==', activePeriod.id),
            where('classId', '==', selectedClassId)
          );
          const respSnap = await getDocs(respQuery);
          const activeResponses = respSnap.docs.map(doc => doc.data() as StudentConferenceResponse);
          setTwcResponses(activeResponses);
        } else {
          setTwcResponses([]);
        }

        // G. Fetch Self-Exploration
        try {
          const periods = await getSEPeriods('JUNIOR_HIGH');
          const activeSe = periods.find(p => p.isActive);
          setActiveSePeriod(activeSe || null);

          if (activeSe) {
            const seData = await getSEEnrollmentsByClass(selectedClassId, activeSe.id);
            setSeEnrollments(seData || []);
          } else {
            setSeEnrollments([]);
          }
        } catch (seErr) {
          console.warn('Could not read Self-Exploration data:', seErr);
          setActiveSePeriod(null);
          setSeEnrollments([]);
        }

      } catch (err) {
        console.error('Error fetching class details:', err);
        toast.error('Gagal memuat rincian data kelas.');
      } finally {
        setLoadingClassData(false);
      }
    };

    fetchClassDetails();
  }, [selectedClassId, activeYear, activeSemester, activePeriod]);

  // Fetch Mentor Tab details
  useEffect(() => {
    const fetchMentorMentees = async () => {
      if (activeTab !== 'MENTOR' || mentorAssignments.length === 0 || !activePeriod) {
        setMentorMenteesData([]);
        return;
      }
      setLoadingMentorData(true);
      try {
        const menteesRows = await Promise.all(
          mentorAssignments.map(async (assignment) => {
            // Fetch student TWC response
            const response = await threeWayConferenceService.getStudentConferenceResponse(
              activePeriod.id,
              assignment.studentId
            );
            return {
              assignment,
              response
            };
          })
        );
        setMentorMenteesData(menteesRows);
      } catch (err) {
        console.error('Error loading mentor mentees data:', err);
        toast.error('Gagal memuat data mentee.');
      } finally {
        setLoadingMentorData(false);
      }
    };

    fetchMentorMentees();
  }, [activeTab, mentorAssignments, activePeriod]);

  // Fetch Notifications
  useEffect(() => {
    const fetchUserNotifications = async () => {
      const email = currentUser?.email;
      if (!email) return;
      setLoadingNotifs(true);
      try {
        const notifs = await getNotifications(email);
        setNotifications(notifs ? notifs.slice(0, 5) : []);
      } catch (err) {
        console.error('Error fetching notifications:', err);
      } finally {
        setLoadingNotifs(false);
      }
    };

    fetchUserNotifications();
  }, [currentUser, activeTab]);

  const handleNotificationClick = async (notif: AppNotification) => {
    try {
      await markNotificationAsRead(notif.id);
      setNotifications(prev => prev.filter(n => n.id !== notif.id));
      if (notif.link) {
        navigate(notif.link);
      }
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  // Calculations for Attendance Section
  const todayAttendanceIncompleteCount = useMemo(() => {
    if (students.length === 0) return 0;
    const todayRecords = attendanceRecords.filter(r => r.date === todayStr);
    return Math.max(0, students.length - todayRecords.length);
  }, [students, attendanceRecords, todayStr]);

  const missedAttendanceDays = useMemo(() => {
    if (students.length === 0) return [];
    // Filter school days before today
    const pastSchoolDays = last14SchoolDays.filter(d => d < todayStr);
    const missedList: { date: string; unstatusCount: number }[] = [];

    pastSchoolDays.forEach(dateStr => {
      const recordsForDay = attendanceRecords.filter(r => r.date === dateStr);
      if (recordsForDay.length < students.length) {
        missedList.push({
          date: dateStr,
          unstatusCount: students.length - recordsForDay.length
        });
      }
    });

    return missedList;
  }, [students, attendanceRecords, last14SchoolDays, todayStr]);

  // Calculations for Tardiness Section
  const tardyStudentsList = useMemo(() => {
    if (students.length === 0) return [];
    // Get past 7 school days
    const last7Days = last14SchoolDays.slice(0, 7);
    const results: { studentId: string; studentName: string; totalLate: number; lastLateDate: string }[] = [];

    students.forEach(student => {
      const studentLates = latenessRecords.filter(r => r.studentId === student.id && last7Days.includes(r.date));
      if (studentLates.length > 0) {
        // Find latest date
        const sortedLates = [...studentLates].sort((a, b) => b.date.localeCompare(a.date));
        results.push({
          studentId: student.id,
          studentName: student.name,
          totalLate: studentLates.length,
          lastLateDate: sortedLates[0].date
        });
      }
    });

    return results;
  }, [students, latenessRecords, last14SchoolDays]);

  // Combined MTSS active cases list
  const combinedMtsCases = useMemo(() => {
    const list: { id: string; studentName: string; type: 'Academic' | 'Behavior'; tier: string; status: string; lastUpdate: number; raw: any }[] = [];

    academicCases.forEach(c => {
      list.push({
        id: c.id,
        studentName: c.studentName,
        type: 'Academic',
        tier: c.currentTier || '-',
        status: c.status,
        lastUpdate: c.updatedAt || 0,
        raw: c
      });
    });

    behaviorCases.forEach(c => {
      list.push({
        id: c.id,
        studentName: c.studentName,
        type: 'Behavior',
        tier: c.tier || '-',
        status: c.status,
        lastUpdate: c.lastUpdatedAt || c.createdAt || 0,
        raw: c
      });
    });

    return list.sort((a, b) => b.lastUpdate - a.lastUpdate);
  }, [academicCases, behaviorCases]);

  // TWC actions list
  const twcPendingActions = useMemo(() => {
    if (students.length === 0 || !activePeriod) return [];
    const list: { studentId: string; studentName: string; responseId: string; status: string; unapprovedSectionCount: number; lastUpdate: number }[] = [];

    students.forEach(student => {
      const resp = twcResponses.find(r => r.studentId === student.id);
      if (resp) {
        const status = resp.overallStatus;
        if (['SUBMITTED', 'PARTIALLY_APPROVED', 'REVISION_REQUIRED'].includes(status)) {
          // Count section reviews with revision status
          let unapprovedCount = 0;
          if (resp.sectionReviews) {
            Object.values(resp.sectionReviews).forEach((review: any) => {
              if (review && review.status === 'REVISION_REQUIRED') {
                unapprovedCount++;
              }
            });
          }
          list.push({
            studentId: student.id,
            studentName: student.name,
            responseId: resp.id,
            status,
            unapprovedSectionCount: unapprovedCount,
            lastUpdate: resp.updatedAt || resp.submittedAt || 0
          });
        }
      }
    });

    return list.sort((a, b) => b.lastUpdate - a.lastUpdate);
  }, [students, twcResponses, activePeriod]);

  // Self-Exploration actions list
  const sePendingActions = useMemo(() => {
    if (seEnrollments.length === 0) return [];
    const list: { studentId: string; studentName: string; enrollId: string; reason: string }[] = [];

    seEnrollments.forEach(enroll => {
      const studentName = enroll.studentName || 'Siswa';
      const pendingApproval = enroll.choices && enroll.choices.some(c => c.approvalStatus === 'PENDING');
      const needsRevision = enroll.status === 'REVISION_REQUESTED';

      if (pendingApproval) {
        list.push({
          studentId: enroll.studentId,
          studentName,
          enrollId: enroll.id,
          reason: 'Pilihan Butuh Persetujuan'
        });
      } else if (needsRevision) {
        list.push({
          studentId: enroll.studentId,
          studentName,
          enrollId: enroll.id,
          reason: 'Perlu Revisi Eksplorasi'
        });
      }
    });

    return list;
  }, [seEnrollments]);

  if (loadingInitial) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
        <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Menyiapkan Dashboard Operasional...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      
      {/* Dynamic Header & Tab Controls */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-gray-100 pb-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight italic uppercase">Dashboard Operasional</h1>
          <p className="text-sm text-gray-500 font-medium mt-1">Pantau dan tindaklanjuti tugas operasional harian Anda.</p>
        </div>

        {/* Tab Buttons if user has both roles */}
        <div className="flex bg-gray-100 p-1.5 rounded-[1.5rem] self-start md:self-auto shadow-inner">
          {hasHomeroom && (
            <button
              onClick={() => setActiveTab('GURU_KELAS')}
              className={cn(
                "px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all",
                activeTab === 'GURU_KELAS' 
                  ? "bg-white text-gray-900 shadow-md" 
                  : "text-gray-500 hover:text-gray-900"
              )}
            >
              Guru Kelas
            </button>
          )}
          {hasMentor && (
            <button
              onClick={() => setActiveTab('MENTOR')}
              className={cn(
                "px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all",
                activeTab === 'MENTOR' 
                  ? "bg-white text-gray-900 shadow-md" 
                  : "text-gray-500 hover:text-gray-900"
              )}
            >
              Mentor
            </button>
          )}
        </div>
      </div>

      {activeTab === 'GURU_KELAS' ? (
        // ==========================================
        // GURU KELAS TAB CONTENT
        // ==========================================
        <div className="space-y-10">
          
          {/* Class Selector Dropdown */}
          {homeroomClasses.length > 1 && (
            <div className="flex items-center gap-3 bg-white p-4 rounded-3xl border border-gray-100 shadow-sm w-fit">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 pl-2">Pilih Kelas Asuhan:</span>
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="h-10 px-4 bg-gray-50 rounded-xl border-none font-black text-xs uppercase tracking-wider text-gray-700 focus:ring-2 focus:ring-blue-600"
              >
                {homeroomClasses.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {loadingClassData ? (
            <div className="py-20 text-center space-y-4">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin inline-block" />
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Memuat data operasional kelas...</p>
            </div>
          ) : students.length === 0 ? (
            <div className="p-16 bg-white rounded-[2rem] border-2 border-dashed border-gray-100 text-center max-w-xl mx-auto space-y-4">
              <UserX className="w-12 h-12 text-gray-300 mx-auto" />
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">Tidak ada siswa aktif</h3>
              <p className="text-xs text-gray-400 font-medium leading-relaxed">
                Belum ada siswa aktif terdaftar di kelas asuhan Anda pada tahun ajaran ini. Silakan hubungi admin untuk sinkronisasi kelas.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Left & Middle Column: Task Lists */}
              <div className="lg:col-span-2 space-y-8">
                
                {/* 1. SECTION ABSENSI */}
                <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
                  <div className="p-8 border-b border-gray-50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                        <CheckSquare size={20} />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">Operasional Kehadiran</h3>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Checklist Harian Kelas</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-8 space-y-6">
                    {/* Today Attendance alert */}
                    {todayAttendanceIncompleteCount > 0 ? (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-amber-50 rounded-2xl border border-amber-100">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={18} />
                          <div>
                            <h4 className="text-xs font-black text-amber-900 uppercase tracking-wider">Absensi Hari Ini Belum Lengkap</h4>
                            <p className="text-xs text-amber-700 font-medium mt-1">
                              Terdapat <span className="font-bold">{todayAttendanceIncompleteCount}</span> siswa belum terisi status kehadiran untuk hari ini.
                            </p>
                          </div>
                        </div>
                        <Link
                          to={`/attendance?classId=${selectedClassId}&date=${todayStr}`}
                          className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm shrink-0 text-center"
                        >
                          Isi Kehadiran
                        </Link>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 p-6 bg-emerald-50 rounded-2xl border border-emerald-100">
                        <CheckCircle2 className="text-emerald-600" size={18} />
                        <div>
                          <h4 className="text-xs font-black text-emerald-900 uppercase tracking-wider">Absensi Hari Ini Selesai</h4>
                          <p className="text-xs text-emerald-700 font-medium mt-1">Semua siswa di kelas asuhan Anda telah tercatat hari ini.</p>
                        </div>
                      </div>
                    )}

                    {/* Missed Attendance list */}
                    <div>
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4 px-1">Daftar Absensi Tertinggal</h4>
                      {missedAttendanceDays.length > 0 ? (
                        <div className="space-y-3">
                          {missedAttendanceDays.map((miss, idx) => (
                            <div key={idx} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                              <div className="flex items-center gap-3">
                                <Calendar size={14} className="text-gray-400" />
                                <span className="text-xs font-bold text-gray-700">
                                  {new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(miss.date))}
                                </span>
                                <span className="px-2.5 py-0.5 text-[9px] font-black uppercase bg-red-100 text-red-700 rounded-full tracking-wider">
                                  {miss.unstatusCount} Belum Diabsen
                                </span>
                              </div>
                              <Link
                                to={`/attendance?classId=${selectedClassId}&date=${miss.date}`}
                                className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:translate-x-1 transition-transform flex items-center gap-1"
                              >
                                Lengkapi <ChevronRight size={14} />
                              </Link>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 italic px-1 font-medium">Tidak ada tugas absensi yang tertinggal dalam 14 hari terakhir.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. SECTION TARDINESS */}
                <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
                  <div className="p-8 border-b border-gray-50">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-pink-50 text-pink-600 rounded-2xl">
                        <Clock size={20} />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">Kasus Keterlambatan</h3>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">7 Hari Sekolah Terakhir</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-8">
                    {tardyStudentsList.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-gray-100 text-[9px] font-black uppercase tracking-widest text-gray-400">
                              <th className="pb-3 pl-2">Siswa</th>
                              <th className="pb-3 text-center">Frekuensi</th>
                              <th className="pb-3 text-center">Tanggal Terakhir</th>
                              <th className="pb-3 text-right pr-2">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50 text-xs font-medium text-gray-700">
                            {tardyStudentsList.map((tardy, idx) => (
                              <tr key={idx} className="hover:bg-gray-50/50">
                                <td className="py-4 font-bold pl-2">{tardy.studentName}</td>
                                <td className="py-4 text-center">
                                  <span className={cn(
                                    "px-2.5 py-1 rounded-full font-black text-[10px]",
                                    tardy.totalLate >= 3 ? "bg-red-50 text-red-700" : "bg-orange-50 text-orange-700"
                                  )}>
                                    {tardy.totalLate} Kali
                                  </span>
                                </td>
                                <td className="py-4 text-center font-semibold text-gray-500">
                                  {new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(new Date(tardy.lastLateDate))}
                                </td>
                                <td className="py-4 text-right pr-2">
                                  <Link
                                    to={`/lateness?classId=${selectedClassId}`}
                                    className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-blue-600 hover:translate-x-1 transition-transform"
                                  >
                                    Tinjau <ArrowRight size={12} />
                                  </Link>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-center py-6 text-gray-400 space-y-2">
                        <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                        <p className="text-xs font-medium italic">Tidak ada keterlambatan tercatat di kelas ini dalam 7 hari terakhir.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. SECTION MTSS */}
                <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
                  <div className="p-8 border-b border-gray-50">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-orange-50 text-orange-600 rounded-2xl">
                        <ShieldAlert size={20} />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">Kasus Aktif MTSS</h3>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Akademik & Perilaku</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-8">
                    {combinedMtsCases.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-gray-100 text-[9px] font-black uppercase tracking-widest text-gray-400">
                              <th className="pb-3 pl-2">Siswa</th>
                              <th className="pb-3">Jenis</th>
                              <th className="pb-3 text-center">Tier/Status</th>
                              <th className="pb-3 text-center">Update Terakhir</th>
                              <th className="pb-3 text-right pr-2">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50 text-xs font-medium text-gray-700">
                            {combinedMtsCases.map((caseItem, idx) => (
                              <tr key={idx} className="hover:bg-gray-50/50">
                                <td className="py-4 font-bold pl-2">{caseItem.studentName}</td>
                                <td className="py-4 font-semibold text-gray-500">
                                  <span className={cn(
                                    "px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide",
                                    caseItem.type === 'Academic' ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                                  )}>
                                    {caseItem.type}
                                  </span>
                                </td>
                                <td className="py-4 text-center">
                                  <span className="font-bold uppercase text-[10px] text-gray-700">
                                    {caseItem.tier} ({caseItem.status})
                                  </span>
                                </td>
                                <td className="py-4 text-center font-semibold text-gray-400">
                                  {caseItem.lastUpdate ? new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(new Date(caseItem.lastUpdate)) : '-'}
                                </td>
                                <td className="py-4 text-right pr-2">
                                  <Link
                                    to={caseItem.type === 'Academic' 
                                      ? `/junior-high/academic/mtss/cases/${caseItem.id}` 
                                      : `/junior-high/behavior/mtss/cases/${caseItem.id}`
                                    }
                                    className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-blue-600 hover:translate-x-1 transition-transform"
                                  >
                                    Detail <ArrowRight size={12} />
                                  </Link>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-center py-6 text-gray-400 space-y-2">
                        <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                        <p className="text-xs font-medium italic">Tidak ada kasus MTSS aktif di kelas asuhan Anda.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* 4. SECTION THREE-WAY CONFERENCE (TWC) */}
                <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
                  <div className="p-8 border-b border-gray-50">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl">
                        <BookOpen size={20} />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">Three-Way Conference (TWC)</h3>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Respons Siswa Perlu Tindakan</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-8">
                    {twcPendingActions.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-gray-100 text-[9px] font-black uppercase tracking-widest text-gray-400">
                              <th className="pb-3 pl-2">Siswa</th>
                              <th className="pb-3">Status TWC</th>
                              <th className="pb-3 text-center">Revisi Section</th>
                              <th className="pb-3 text-center">Update</th>
                              <th className="pb-3 text-right pr-2">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50 text-xs font-medium text-gray-700">
                            {twcPendingActions.map((action, idx) => (
                              <tr key={idx} className="hover:bg-gray-50/50">
                                <td className="py-4 font-bold pl-2">{action.studentName}</td>
                                <td className="py-4">
                                  <span className={cn(
                                    "px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider",
                                    action.status === 'SUBMITTED' ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                                  )}>
                                    {action.status.replace(/_/g, ' ')}
                                  </span>
                                </td>
                                <td className="py-4 text-center font-semibold">
                                  {action.unapprovedSectionCount > 0 ? (
                                    <span className="text-red-600 font-bold">{action.unapprovedSectionCount} Bagian</span>
                                  ) : (
                                    <span className="text-gray-400 font-medium">0</span>
                                  )}
                                </td>
                                <td className="py-4 text-center font-semibold text-gray-400">
                                  {action.lastUpdate ? new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(new Date(action.lastUpdate)) : '-'}
                                </td>
                                <td className="py-4 text-right pr-2">
                                  <Link
                                    to={`/junior-high/conference/workspace?studentId=${action.studentId}&classId=${selectedClassId}`}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all"
                                  >
                                    Buka Respons
                                  </Link>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-center py-6 text-gray-400 space-y-2">
                        <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                        <p className="text-xs font-medium italic">Tidak ada respon TWC yang membutuhkan tindakan tinjauan Anda.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* 5. SECTION SELF-EXPLORATION */}
                {activeSePeriod && sePendingActions.length > 0 && (
                  <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-8 border-b border-gray-50">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                          <Sparkles size={20} />
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">Self-Exploration</h3>
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{activeSePeriod.label || 'Sesi Aktif'}</p>
                        </div>
                      </div>
                    </div>

                    <div className="p-8">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-gray-100 text-[9px] font-black uppercase tracking-widest text-gray-400">
                              <th className="pb-3 pl-2">Siswa</th>
                              <th className="pb-3">Keterangan Tugas</th>
                              <th className="pb-3 text-right pr-2">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50 text-xs font-medium text-gray-700">
                            {sePendingActions.map((seAction, idx) => (
                              <tr key={idx} className="hover:bg-gray-50/50">
                                <td className="py-4 font-bold pl-2">{seAction.studentName}</td>
                                <td className="py-4 font-semibold text-gray-500">{seAction.reason}</td>
                                <td className="py-4 text-right pr-2">
                                  <Link
                                    to={`/self-exploration/class/${selectedClassId}`}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all"
                                  >
                                    Tinjau Pilihan
                                  </Link>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

              </div>

              {/* Right Column: Notification Service & Sidebar */}
              <div className="space-y-8">
                
                {/* NOTIFICATIONS CONTAINER */}
                <div className="bg-white rounded-[2rem] border border-gray-100 p-8 shadow-sm">
                  <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-2">
                      <Bell size={16} className="text-gray-400" />
                      <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Notifikasi Terbaru</h3>
                    </div>
                    {notifications.length > 0 && (
                      <span className="w-2.5 h-2.5 bg-blue-600 rounded-full animate-pulse" />
                    )}
                  </div>

                  {loadingNotifs ? (
                    <div className="py-8 text-center">
                      <Loader2 className="w-6 h-6 text-blue-600 animate-spin inline-block" />
                    </div>
                  ) : notifications.length > 0 ? (
                    <div className="space-y-4">
                      {notifications.map((notif) => (
                        <div
                          key={notif.id}
                          onClick={() => handleNotificationClick(notif)}
                          className="p-4 rounded-2xl bg-gray-50 hover:bg-blue-50/50 border border-gray-50 hover:border-blue-100 transition-all cursor-pointer space-y-2 relative overflow-hidden"
                        >
                          <p className="text-xs text-gray-800 font-semibold leading-relaxed pl-1">{notif.message}</p>
                          <div className="flex items-center justify-between pl-1">
                            <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wide">
                              {new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(new Date(notif.createdAt))}
                            </span>
                            {notif.link && (
                              <span className="text-[9px] text-blue-600 font-black uppercase tracking-widest flex items-center gap-0.5">
                                Tindak <ChevronRight size={10} />
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-400 space-y-2">
                      <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                      <p className="text-xs font-medium italic">Tidak ada notifikasi baru.</p>
                    </div>
                  )}
                </div>

                {/* HELPFUL QUICK STATS WIDGET */}
                <div className="bg-gradient-to-br from-gray-900 to-slate-900 rounded-[2.5rem] p-8 text-white space-y-6">
                  <div>
                    <span className="px-3 py-1 rounded-full bg-white/10 text-[9px] font-black uppercase tracking-widest text-slate-300">Konstruksi</span>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider mt-3">Ringkasan Operasional</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-left">
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <p className="text-2xl font-black italic">{students.length}</p>
                      <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mt-1">Siswa Asuhan</p>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <p className="text-2xl font-black italic text-red-400">{combinedMtsCases.length}</p>
                      <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mt-1">Kasus MTSS</p>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5 col-span-2">
                      <p className="text-xl font-black italic text-amber-400">{twcPendingActions.length} Siswa</p>
                      <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mt-1">Tinjauan TWC Menunggu</p>
                    </div>
                  </div>
                </div>

              </div>

            </div>
          )}

        </div>
      ) : (
        // ==========================================
        // MENTOR TAB CONTENT
        // ==========================================
        <div className="space-y-8">
          
          <div className="bg-white rounded-[2rem] border border-gray-100 p-8 shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                <UserCheck size={20} />
              </div>
              <div>
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">Mentorship Overview</h3>
                <p className="text-xs text-gray-500 font-medium">Periode TWC: <span className="font-bold">{activePeriod?.label || 'Tidak Aktif'}</span></p>
              </div>
            </div>
          </div>

          {loadingMentorData ? (
            <div className="py-20 text-center space-y-4">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin inline-block" />
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Memuat rincian data mentee...</p>
            </div>
          ) : mentorMenteesData.length === 0 ? (
            <div className="p-16 bg-white rounded-[2rem] border-2 border-dashed border-gray-100 text-center max-w-xl mx-auto space-y-4">
              <UserX className="w-12 h-12 text-gray-300 mx-auto" />
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">Tidak ada mentee aktif</h3>
              <p className="text-xs text-gray-400 font-medium leading-relaxed">
                Anda tidak memiliki tugas pendampingan mentor aktif untuk periode Three-Way Conference ini.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-8 border-b border-gray-50">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Daftar Mentee & Status TWC</h3>
              </div>

              <div className="p-8">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-100 text-[9px] font-black uppercase tracking-widest text-gray-400">
                        <th className="pb-3 pl-2">Siswa Mentee</th>
                        <th className="pb-3">Kelas</th>
                        <th className="pb-3 text-center">Status TWC</th>
                        <th className="pb-3 text-center">Revisi Perlu Tindakan</th>
                        <th className="pb-3 text-right pr-2">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-xs font-medium text-gray-700">
                      {mentorMenteesData.map((row, idx) => {
                        const studentName = row.assignment.studentName || 'Siswa';
                        const className = row.assignment.className || 'Kelas';
                        const status = row.response ? row.response.overallStatus : 'DRAFT';
                        
                        // Check unapproved section count
                        let unapprovedCount = 0;
                        if (row.response && row.response.sectionReviews) {
                          Object.values(row.response.sectionReviews).forEach((review: any) => {
                            if (review && review.status === 'REVISION_REQUIRED') {
                              unapprovedCount++;
                            }
                          });
                        }

                        return (
                          <tr key={idx} className="hover:bg-gray-50/50">
                            <td className="py-4 font-bold pl-2">{studentName}</td>
                            <td className="py-4 font-semibold text-gray-500">{className}</td>
                            <td className="py-4 text-center">
                              <span className={cn(
                                "px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
                                status === 'APPROVED' ? "bg-emerald-50 text-emerald-700" :
                                status === 'SUBMITTED' ? "bg-amber-50 text-amber-700" :
                                status === 'REVISION_REQUIRED' ? "bg-red-50 text-red-700" :
                                "bg-gray-50 text-gray-600"
                              )}>
                                {status.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="py-4 text-center font-bold">
                              {unapprovedCount > 0 ? (
                                <span className="text-red-600">{unapprovedCount} Section</span>
                              ) : (
                                <span className="text-gray-400 font-medium">0</span>
                              )}
                            </td>
                            <td className="py-4 text-right pr-2">
                              <Link
                                to={`/junior-high/conference/workspace?studentId=${row.assignment.studentId}&classId=${row.assignment.classId}`}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all"
                              >
                                Tinjau Respons
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

        </div>
      )}

    </div>
  );
}
