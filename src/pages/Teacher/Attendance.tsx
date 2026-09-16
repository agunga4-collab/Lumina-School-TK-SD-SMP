import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CheckCircle2, AlertCircle, Clock, UserX, Search, Filter, 
  Save, Calendar, ChevronRight, ChevronLeft, AlertTriangle, MessageSquare, 
  Settings2, BarChart3, Bell, RefreshCw, Layers, Trash2, ExternalLink, X, Copy,
  ArrowUp, ArrowDown, ArrowUpDown
} from 'lucide-react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';

// Custom Mosque SVG Icon matching official Lucide path specification
const Mosque = ({ size = 24, className, ...props }: { size?: number; className?: string; [key: string]: any }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M20 21v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2H6a2 2 0 0 0-2 2v4" />
      <path d="M2 21h20" />
      <path d="M10 5a2 2 0 0 1 4 0v3h-4V5z" />
      <path d="M12 2v3" />
      <path d="M4 10h4v11H4V10z" />
      <path d="M16 10h4v11h-4V10z" />
      <path d="M6 6V10" />
      <path d="M18 6V10" />
      <path d="M6 3h0" />
      <path d="M18 3h0" />
    </svg>
  );
};
import { cn } from '../../lib/utils';
import { db, auth, getActiveStudents } from '../../lib/firebase';
import { collection, query, where, getDocs, setDoc, doc, serverTimestamp, getDoc, orderBy, deleteDoc, writeBatch, onSnapshot } from 'firebase/firestore';
import { AttendanceStatus, AttendanceRecord, Student, UnitType, Class } from '../../types';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { attendanceSyncService, attendanceBackupConfigService } from '../../services/attendanceBackupConfigService';
import { toast } from 'sonner';
import { getDhuhurAttendanceRecords, calculateDhuhurRecap } from '../../services/dhuhurAttendanceService';
import StudentSearch from '../../components/StudentSearch';
import AttendanceStatusSelector from '../../components/AttendanceStatusSelector';
import AttendanceStudentCard from '../../components/AttendanceStudentCard';
import { isAttendanceSchoolDay } from '../../lib/attendanceCalendar';

interface StudentAttendance {
  id: string;
  name: string;
  status: AttendanceStatus | null;
  note: string;
  absencesThisMonth: number;
  emotion?: 'happy' | 'neutral' | 'sad' | null;
}

const mockStudents: StudentAttendance[] = [];

interface ExtractedRecord {
  studentId: string;
  status: string;
  note?: string;
  schoolAttendanceStatus?: string;
}

function extractRecordsFromDoc(docData: any): ExtractedRecord[] {
  const list: ExtractedRecord[] = [];
  if (!docData) return list;
  
  // 1. Single student document format
  if (docData.studentId) {
    const status = docData.status || docData.dhuhrPrayerStatus?.status;
    if (status) {
      list.push({
        studentId: docData.studentId,
        status: status,
        note: docData.note || docData.dhuhrPrayerStatus?.note || "",
        schoolAttendanceStatus: docData.schoolAttendanceStatus || docData.dhuhrPrayerStatus?.schoolAttendanceStatus || ""
      });
    }
  }
  
  // 2. Class per date nested list format (e.g. 'students' or 'records' or 'attendance')
  const arrayCandidates = [docData.students, docData.records, docData.attendance];
  for (const candidate of arrayCandidates) {
    if (Array.isArray(candidate)) {
      candidate.forEach((item: any) => {
        if (item && item.studentId) {
          const status = item.status || item.dhuhrPrayerStatus?.status;
          if (status) {
            list.push({
              studentId: item.studentId,
              status: status,
              note: item.note || item.dhuhrPrayerStatus?.note || "",
              schoolAttendanceStatus: item.schoolAttendanceStatus || item.dhuhrPrayerStatus?.schoolAttendanceStatus || ""
            });
          }
        }
      });
    }
  }
  
  const mapCandidates = [docData.students, docData.records, docData.attendance];
  for (const candidate of mapCandidates) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      Object.entries(candidate).forEach(([key, val]: [string, any]) => {
        if (val && typeof val === 'object') {
          const status = val.status || val.dhuhrPrayerStatus?.status;
          if (status) {
            list.push({
              studentId: val.studentId || key,
              status: status,
              note: val.note || val.dhuhrPrayerStatus?.note || "",
              schoolAttendanceStatus: val.schoolAttendanceStatus || val.dhuhrPrayerStatus?.schoolAttendanceStatus || ""
            });
          }
        } else if (typeof val === 'string') {
          list.push({
            studentId: key,
            status: val
          });
        }
      });
    }
  }
  
  return list;
}

export default function Attendance() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { activeUnit } = useOutletContext<{ activeUnit: UnitType }>();
  const { activeYear, activeSemester: contextSemester } = useAcademicYear();

  // Real App context would come from a global config or active semester hook
  const activeAcademicYear = activeYear;
  const activeSemester = String(contextSemester) as any;

  const [view, setView] = React.useState<'INPUT' | 'RECAP' | 'ALERTS'>('INPUT');
  const [students, setStudents] = React.useState<StudentAttendance[]>([]);
  const [classes, setClasses] = React.useState<Class[]>([]);
  const [loadingClasses, setLoadingClasses] = React.useState(true);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [backingUp, setBackingUp] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [lastSaved, setLastSaved] = React.useState<{date: string, classId: string} | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [recapStats, setRecapStats] = React.useState({
    hadir: 0,
    sakit: 0,
    izin: 0,
    alpa: 0,
    late: 0,
    attendanceRate: 0
  });
  const [selectedClass, setSelectedClass] = React.useState(searchParams.get('classId') || '');
  const [selectedDate, setSelectedDate] = React.useState(searchParams.get('date') || new Date().toISOString().split('T')[0]);
  const [isSchoolDay, setIsSchoolDay] = React.useState<boolean>(true);
  
  const [searchTerm, setSearchTerm] = React.useState('');
  const [isFiltersExpanded, setIsFiltersExpanded] = React.useState(false);

  const [dhuhurSortConfig, setDhuhurSortConfig] = React.useState<{
    key: 'name' | 'hadir' | 'late' | 'alpa' | 'rate';
    direction: 'asc' | 'desc';
  }>({ key: 'name', direction: 'asc' });

  const sortedStudentsForRecap = React.useMemo(() => {
    if (attendanceType !== 'DHUHUR') return students;

    const studentsWithStats = students.map(s => {
      const stats = recapData[s.id] || { hadir: 0, sakit: 0, izin: 0, alpa: 0, late: 0 };
      const total = stats.hadir + stats.late + stats.izin + stats.alpa;
      const rate = total > 0 ? (stats.hadir / total) * 100 : -1;
      return {
        student: s,
        stats,
        rate,
        total
      };
    });

    const key = dhuhurSortConfig.key;
    const direction = dhuhurSortConfig.direction;

    studentsWithStats.sort((a, b) => {
      let comparison = 0;

      if (key === 'name') {
        comparison = (a.student.name || '').localeCompare(b.student.name || '', 'id-ID');
      } else if (key === 'hadir') {
        comparison = a.stats.hadir - b.stats.hadir;
      } else if (key === 'late') {
        comparison = a.stats.late - b.stats.late;
      } else if (key === 'alpa') {
        comparison = a.stats.alpa - b.stats.alpa;
      } else if (key === 'rate') {
        comparison = a.rate - b.rate;
      }

      if (comparison !== 0) {
        return direction === 'asc' ? comparison : -comparison;
      }

      // Tie breaker: ALWAYS sort by student Name A-Z
      return (a.student.name || '').localeCompare(b.student.name || '', 'id-ID');
    });

    return studentsWithStats.map(item => item.student);
  }, [students, recapData, dhuhurSortConfig, attendanceType]);

  const handleDhuhurSort = (columnKey: 'name' | 'hadir' | 'late' | 'alpa' | 'rate') => {
    setDhuhurSortConfig(prev => {
      if (prev.key === columnKey) {
        return {
          key: columnKey,
          direction: prev.direction === 'asc' ? 'desc' : 'asc'
        };
      } else {
        const defaultDirection = columnKey === 'name' ? 'asc' : 'desc';
        return {
          key: columnKey,
          direction: defaultDirection
        };
      }
    });
  };

  const filteredStudents = React.useMemo(() => {
    if (!searchTerm.trim()) return students;
    const term = searchTerm.toLowerCase().trim();
    return students.filter(s => 
      (s.name || '').toLowerCase().includes(term) || 
      (s.id || '').toLowerCase().includes(term)
    );
  }, [students, searchTerm]);
  
  const now = new Date();
  const [recapMonth, setRecapMonth] = React.useState((now.getMonth() + 1).toString().padStart(2, '0'));
  const [recapYear, setRecapYear] = React.useState(now.getFullYear().toString());
  const [recapData, setRecapData] = React.useState<Record<string, { hadir: number, sakit: number, izin: number, alpa: number, late: number }>>({});
  const [recapMatrix, setRecapMatrix] = React.useState<Record<string, Record<string, string>>>({});
  const [recapViewMode, setRecapViewMode] = React.useState<'SUMMARY' | 'MATRIX'>('SUMMARY');
  const [recapPeriodMode, setRecapPeriodMode] = React.useState<'MONTHLY' | 'RANGE'>('MONTHLY');
  const [recapStartDate, setRecapStartDate] = React.useState<string>(() => {
    return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-01`;
  });
  const [recapEndDate, setRecapEndDate] = React.useState<string>(() => {
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${lastDay.toString().padStart(2, '0')}`;
  });
  const [tempStartDate, setTempStartDate] = React.useState<string>(() => {
    return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-01`;
  });
  const [tempEndDate, setTempEndDate] = React.useState<string>(() => {
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${lastDay.toString().padStart(2, '0')}`;
  });
  const [recapRangeError, setRecapRangeError] = React.useState<string>('');
  const [recapError, setRecapError] = React.useState<'permission' | 'generic' | null>(null);

  // Helper to generate dates in range (max 62 days to avoid heavy rendering)
  const getDatesInRange = React.useCallback((startStr: string, endStr: string) => {
    const dates: string[] = [];
    if (!startStr || !endStr) return dates;
    const start = new Date(startStr);
    const end = new Date(endStr);
    const temp = new Date(start);
    let count = 0;
    while (temp <= end && count < 62) {
      dates.push(temp.toISOString().split('T')[0]);
      temp.setDate(temp.getDate() + 1);
      count++;
    }
    return dates;
  }, []);

  const datesToRender = React.useMemo(() => {
    if (recapPeriodMode === 'MONTHLY') {
      const daysInMonth = new Date(parseInt(recapYear), parseInt(recapMonth), 0).getDate();
      return Array.from({ length: daysInMonth }, (_, i) => {
        const dayStr = (i + 1).toString().padStart(2, '0');
        return {
          dateStr: `${recapYear}-${recapMonth}-${dayStr}`,
          label: (i + 1).toString()
        };
      });
    } else {
      const dates = getDatesInRange(recapStartDate, recapEndDate);
      return dates.map(d => {
        const parts = d.split('-');
        return {
          dateStr: d,
          label: `${parts[2]}/${parts[1]}` // e.g., "12/08"
        };
      });
    }
  }, [recapPeriodMode, recapMonth, recapYear, recapStartDate, recapEndDate, getDatesInRange]);

  const handleSwitchPeriodMode = (mode: 'MONTHLY' | 'RANGE') => {
    setRecapPeriodMode(mode);
    if (mode === 'RANGE') {
      const lastDay = new Date(parseInt(recapYear), parseInt(recapMonth), 0).getDate();
      const start = `${recapYear}-${recapMonth}-01`;
      const end = `${recapYear}-${recapMonth}-${lastDay.toString().padStart(2, '0')}`;
      setTempStartDate(start);
      setTempEndDate(end);
      setRecapStartDate(start);
      setRecapEndDate(end);
      setRecapRangeError('');
    }
  };

  const handleApplyRange = () => {
    if (!tempStartDate || !tempEndDate) {
      setRecapRangeError('Tanggal Mulai dan Tanggal Selesai harus diisi.');
      return;
    }
    if (tempStartDate > tempEndDate) {
      setRecapRangeError('Tanggal Mulai tidak boleh lebih lambat dari Tanggal Selesai.');
      return;
    }
    setRecapRangeError('');
    setRecapStartDate(tempStartDate);
    setRecapEndDate(tempEndDate);
  };
  const [loadingRecap, setLoadingRecap] = React.useState(false);
  const [fileMap, setFileMap] = React.useState<any | null>(null);
  const [elementaryBackupJob, setElementaryBackupJob] = React.useState<any | null>(null);
  const [attendanceType, setAttendanceType] = React.useState<'DAILY' | 'DHUHUR'>('DAILY');
  const [refreshTrigger, setRefreshTrigger] = React.useState(0);
  const [threshold, setThreshold] = React.useState(3);
  const [userProfile, setUserProfile] = React.useState<any>(null); // In real app, from AuthContext

  React.useEffect(() => {
    const loadFileMap = async () => {
      if (activeAcademicYear && activeSemester && activeUnit === 'JUNIOR_HIGH') {
        if (attendanceType === 'DHUHUR') {
          const mapId = `dhuhur_JUNIOR_HIGH_${activeAcademicYear.replace(/\//g, '-')}_S${activeSemester}`;
          const docRef = doc(db, 'attendance_backup_file_maps', mapId);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            setFileMap(snap.data());
          } else {
            setFileMap(null);
          }
        } else if (selectedClass) {
          const map = await attendanceBackupConfigService.getFileMap(selectedClass, activeAcademicYear, activeSemester as any);
          setFileMap(map);
        } else {
          setFileMap(null);
        }
      } else if (activeAcademicYear && activeUnit === 'ELEMENTARY' && selectedClass) {
        const mapId = `elementary_${activeAcademicYear.replace(/\//g, '-')}_${selectedClass}`;
        const docRef = doc(db, 'attendance_backup_file_maps', mapId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setFileMap(snap.data());
        } else {
          setFileMap(null);
        }
      } else {
        setFileMap(null);
      }
    };
    loadFileMap();
  }, [selectedClass, activeAcademicYear, activeSemester, activeUnit, attendanceType]);

  React.useEffect(() => {
    if (activeUnit !== 'ELEMENTARY' || !selectedClass || !selectedDate || !activeAcademicYear) {
      setElementaryBackupJob(null);
      return;
    }

    if (!userProfile) {
      return;
    }

    const isUserAdmin = ['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'PRINCIPAL', 'VICE_PRINCIPAL'].includes(userProfile.role) ||
                       ['agunga4@gmail.com', 'agunga4@lazuardi.sch.id'].includes(auth.currentUser?.email || '');

    if (!isUserAdmin) {
      setElementaryBackupJob(null);
      return;
    }

    const schoolYearId = activeAcademicYear.replace(/\//g, '-');
    const jobDocId = `attendance_elementary_${schoolYearId}_${selectedClass}_${selectedDate}`;
    const docRef = doc(db, 'system_backup_jobs', jobDocId);

    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setElementaryBackupJob(docSnap.data());
      } else {
        setElementaryBackupJob(null);
      }
    }, (err) => {
      // Ignore listening errors silently
    });

    return () => unsubscribe();
  }, [activeUnit, selectedClass, selectedDate, activeAcademicYear, userProfile]);
  // Fetch classes for active unit
  React.useEffect(() => {
    const fetchClasses = async () => {
      setLoadingClasses(true);
      try {
        const q = query(
          collection(db, 'classes'),
          where('unitId', '==', activeUnit),
          orderBy('name', 'asc')
        );
        const snap = await getDocs(q);
        const classList = snap.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as Class))
          .filter(c => c.academicYear === activeYear && c.status !== 'archived');
        setClasses(classList);
        setSelectedClass('');
      } catch (err) {
        console.error('Error fetching classes:', err);
        setSelectedClass('');
      } finally {
        setLoadingClasses(false);
      }
    };
    fetchClasses();
  }, [activeUnit, activeYear]);

  React.useEffect(() => {
    // Fetch profile role for visibility check
    const checkRole = async () => {
      const user = auth.currentUser;
      if (user) {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) setUserProfile(snap.data());
      }
    };
    checkRole();
  }, []);

  const isAdmin = ['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'PRINCIPAL', 'VICE_PRINCIPAL'].includes(userProfile?.role);

  React.useEffect(() => {
    const loadStudents = async () => {
      // Check if selected date is a school day for the active unit
      let schoolDayVal = true;
      try {
        schoolDayVal = await isAttendanceSchoolDay(selectedDate, activeUnit as any);
        setIsSchoolDay(schoolDayVal);
      } catch (calErr) {
        console.warn('Failed to check if selected date is a school day:', calErr);
        setIsSchoolDay(true); // default to true on error to avoid blocking teachers
      }

      if (!selectedClass) {
        setStudents([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        // Get the actual class name for fallback queries
        const currentClassEntity = classes.find(c => c.id === selectedClass || c.name === selectedClass);
        const className = currentClassEntity?.name || selectedClass;
        const classId = currentClassEntity?.id || selectedClass;

        // Query students in selected class - check users, roleInvites, and students collections
        let studentList: StudentAttendance[] = [];
        try {
          const activeS = await getActiveStudents(classId, activeAcademicYear);
          if (activeS && activeS.length > 0) {
            studentList = activeS.map(s => ({
              id: s.id,
              name: s.name,
              status: null,
              note: '',
              absencesThisMonth: 0
            }));
          }
        } catch (activeErr) {
          console.warn('Failed to load active students via helper:', activeErr);
        }

        if (studentList.length === 0) {
          // Fallback legacy queries in case enrollments are unpopulated
          const qByClassId = query(collection(db, 'users'), where('role', '==', 'STUDENT'), where('classId', '==', classId));
          const qByClassName = query(collection(db, 'users'), where('role', '==', 'STUDENT'), where('classId', '==', className));
          const qByJobTitle = query(collection(db, 'users'), where('role', '==', 'STUDENT'), where('jobTitle', 'in', [classId, className]));
          
          const qInvitesId = query(collection(db, 'roleInvites'), where('role', '==', 'STUDENT'), where('classId', '==', classId));
          const qInvitesName = query(collection(db, 'roleInvites'), where('role', '==', 'STUDENT'), where('classId', '==', className));
          
          const qStudentsId = query(collection(db, 'students'), where('classId', '==', classId));
          const qStudentsName = query(collection(db, 'students'), where('classId', '==', className));
          
          const snapPromises = [
            getDocs(qByClassId).catch(err => { console.warn("Failed to query users by classId:", err); return { docs: [] }; }),
            getDocs(qByClassName).catch(err => { console.warn("Failed to query users by className:", err); return { docs: [] }; }),
            getDocs(qByJobTitle).catch(err => { console.warn("Failed to query users by jobTitle:", err); return { docs: [] }; }),
            getDocs(qInvitesId).catch(err => { console.warn("Failed to query roleInvites by classId:", err); return { docs: [] }; }),
            getDocs(qInvitesName).catch(err => { console.warn("Failed to query roleInvites by className:", err); return { docs: [] }; }),
            getDocs(qStudentsId).catch(err => { console.warn("Failed to query students by classId:", err); return { docs: [] }; }),
            getDocs(qStudentsName).catch(err => { console.warn("Failed to query students by className:", err); return { docs: [] }; })
          ];
          
          const [snap1, snap2, snap3, snap4, snap5, snap6, snap7] = await Promise.all(snapPromises);
          
          // Merge results and remove duplicates (using ID or luminaId as key)
          const combinedDocs = [...snap1.docs, ...snap2.docs, ...snap3.docs, ...snap4.docs, ...snap5.docs, ...snap6.docs, ...snap7.docs];
          const uniqueDocsMap = new Map();
          
          combinedDocs.forEach(d => {
            const data = d.data();
            // Use NIS/LuminaID if available, else doc ID
            const studentId = data.luminaId || data.nis || data.nisn || d.id;
            
            if (!uniqueDocsMap.has(studentId)) {
              uniqueDocsMap.set(studentId, { docId: d.id, ...data });
            } else {
              const existing = uniqueDocsMap.get(studentId);
              uniqueDocsMap.set(studentId, { ...existing, ...data });
            }
          });

          studentList = Array.from(uniqueDocsMap.values()).map(data => ({
            id: data.luminaId || data.nis || data.docId,
            name: data.name || data.displayName || data.fullName || "Siswa Tanpa Nama",
            status: null,
            note: '',
            absencesThisMonth: 0 
          })).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        }

        // Load existing records for today depending on type
        let recordsMap = new Map<string, string>();
        let notesMap = new Map<string, string>();
        let emotionsMap = new Map<string, any>();
        let dhuhrStatusMap = new Map<string, any>();
        let lastSavedFound = false;

        if (attendanceType === 'DHUHUR') {
          // 1. Fetch from dhuhur_attendance_records
          const dhuhurQ = query(
            collection(db, 'dhuhur_attendance_records'),
            where('classId', 'in', [classId, className]),
            where('date', '==', selectedDate)
          );
          const dhuhurSnap = await getDocs(dhuhurQ);
          
          // 2. Fetch from attendance_records to get schoolStatus (for SAKIT, IZIN, ALPA checks)
          const schoolQ = query(
            collection(db, 'attendance_records'),
            where('classId', 'in', [classId, className]),
            where('date', '==', selectedDate)
          );
          const schoolSnap = await getDocs(schoolQ);
          const schoolStatusMap = new Map(schoolSnap.docs.map(d => [d.data().studentId, d.data().status]));

          // Extracted records from dhuhur_attendance_records
          const extractedList: ExtractedRecord[] = [];
          dhuhurSnap.docs.forEach(doc => {
            extractedList.push(...extractRecordsFromDoc(doc.data()));
          });

          const extractedStatusMap = new Map(extractedList.map(item => [item.studentId, item.status]));
          const extractedNotesMap = new Map(extractedList.map(item => [item.studentId, item.note || ""]));
          const extractedSchoolStatusMap = new Map(extractedList.map(item => [item.studentId, item.schoolAttendanceStatus || ""]));

          if (extractedList.length > 0) {
            lastSavedFound = true;
          }

          // Map students
          if (studentList.length > 0) {
            setStudents(studentList.map(s => {
              let schoolStatus = schoolStatusMap.get(s.id) || null;
              const shalatStatus = extractedStatusMap.get(s.id) || null; // e.g. SALAT_BERJAMAAH, BERHALANGAN, IZIN, TIDAK_MENGIKUTI
              const shalatNote = extractedNotesMap.get(s.id) || "";

              if (!schoolStatus && shalatStatus === 'TIDAK_BERLAKU') {
                schoolStatus = extractedSchoolStatusMap.get(s.id) || null;
              }

              let normalizedShalatStatus = shalatStatus;
              if (shalatStatus === 'SALAT_BERJAMAAH' || shalatStatus === 'HADIR') {
                normalizedShalatStatus = 'H';
              } else if (shalatStatus === 'BERHALANGAN' || shalatStatus === 'TERLAMBAT') {
                normalizedShalatStatus = 'T';
              } else if (shalatStatus === 'TIDAK_MENGIKUTI' || shalatStatus === 'ALPA') {
                normalizedShalatStatus = 'A';
              }

              let finalStatus = null;
              if (activeUnit === 'JUNIOR_HIGH') {
                if (!schoolDayVal) {
                  finalStatus = 'TIDAK_BERLAKU';
                } else if (schoolStatus && ['SAKIT', 'IZIN', 'ALPA'].includes(schoolStatus)) {
                  finalStatus = 'TIDAK_BERLAKU';
                } else {
                  finalStatus = normalizedShalatStatus || 'BELUM_DIISI';
                }
              } else {
                finalStatus = normalizedShalatStatus || null;
              }

              return {
                ...s,
                status: finalStatus as any,
                note: shalatNote,
                emotion: null,
                schoolStatus,
                dhuhrPrayerStatus: shalatStatus ? { status: shalatStatus } : null
              };
            }));
          } else {
            setStudents([]);
          }

          if (lastSavedFound) {
            setLastSaved({ date: selectedDate, classId: selectedClass });
          } else {
            setLastSaved(null);
          }

          // Development logging for Salat Dhuhur query:
          console.log('[DEV LOG] Daily Shalat Dhuhur Query Result:', {
            activeClassId: classId,
            selectedDate,
            academicYear: activeAcademicYear,
            dhuhurDocsReturned: dhuhurSnap.size,
            extractedListSize: extractedList.length,
            schoolDocsReturned: schoolSnap.size,
            mappedStudentsCount: studentList.length
          });

        } else {
          // Standard Attendance
          const recordsQ = query(
            collection(db, 'attendance_records'),
            where('classId', 'in', [classId, className]),
            where('date', '==', selectedDate)
          );
          const recordsSnap = await getDocs(recordsQ);
          recordsMap = new Map(recordsSnap.docs.map(d => [d.data().studentId, d.data().status]));
          notesMap = new Map(recordsSnap.docs.map(d => [d.data().studentId, d.data().note]));
          emotionsMap = new Map(recordsSnap.docs.map(d => [d.data().studentId, d.data().emotion]));
          dhuhrStatusMap = new Map(recordsSnap.docs.map(d => [d.data().studentId, d.data().dhuhrPrayerStatus]));

          if (recordsSnap.size > 0) {
            setLastSaved({ date: selectedDate, classId: selectedClass });
          } else {
            setLastSaved(null);
          }

          if (studentList.length > 0) {
            setStudents(studentList.map(s => {
              const schoolStatus = recordsMap.get(s.id) || null;
              const dhuhrObj = dhuhrStatusMap.get(s.id) || null;
              
              let finalStatus = schoolStatus;

              return {
                ...s,
                status: finalStatus as any,
                note: notesMap.get(s.id) || '',
                emotion: emotionsMap.get(s.id) || null,
                schoolStatus,
                dhuhrPrayerStatus: dhuhrObj
              };
            }));
          } else {
            setStudents([]);
          }
        }
      } catch (err: any) {
        console.error('Error loading students:', err);
        setError(err.message || 'Gagal memuat data siswa. Pastikan koneksi internet stabil.');
        setStudents([]);
      } finally {
        setLoading(false);
      }
    };

    loadStudents();
  }, [selectedClass, selectedDate, classes, activeAcademicYear, attendanceType, refreshTrigger]);

  const handleDeleteOne = async (studentId: string) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    if (activeUnit === 'JUNIOR_HIGH' && attendanceType === 'DHUHUR') {
      if (!window.confirm(`Hapus kehadiran Shalat Dhuhur ${student.name} pada ${selectedDate}?`)) return;
      
      setDeleting(true);
      try {
        const recordId = `${selectedClass}_${selectedDate}_${studentId}`;
        const docRef = doc(db, 'attendance_records', recordId);
        await setDoc(docRef, {
          dhuhrPrayerStatus: {
            status: 'BELUM_DIISI',
            updatedAt: serverTimestamp()
          }
        }, { merge: true });
        
        setStudents(students.map(s => s.id === studentId ? { ...s, status: 'BELUM_DIISI' as any, dhuhrPrayerStatus: { status: 'BELUM_DIISI' } } : s));
        toast.success('Kehadiran Shalat Dhuhur Direset', { 
          description: `Kehadiran Shalat Dhuhur untuk ${student.name} berhasil direset.` 
        });
      } catch (err) {
        console.error('Delete error:', err);
        toast.error('Gagal mereset data');
      } finally {
        setDeleting(false);
      }
      return;
    }

    if (attendanceType === 'DHUHUR') {
      if (!window.confirm(`Hapus kehadiran Shalat Dhuhur ${student.name} pada ${selectedDate}?`)) return;
      
      setDeleting(true);
      try {
        const recordId = `dhuhur_${selectedClass}_${selectedDate}_${studentId}`;
        const docRef = doc(db, 'dhuhur_attendance_records', recordId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          await deleteDoc(docRef);
        }
        
        setStudents(students.map(s => s.id === studentId ? { ...s, status: null, note: '' } : s));
        toast.success('Kehadiran Shalat Dhuhur Dihapus', { 
          description: `Kehadiran Shalat Dhuhur untuk ${student.name} berhasil dihapus.` 
        });
      } catch (err) {
        console.error('Delete error:', err);
        toast.error('Gagal menghapus data');
      } finally {
        setDeleting(false);
      }
    } else {
      if (!window.confirm('Hapus data kehadiran untuk siswa ini?')) return;
      
      setDeleting(true);
      try {
        const recordId = `${selectedClass}_${selectedDate}_${studentId}`;
        await deleteDoc(doc(db, 'attendance_records', recordId));
        
        setStudents(students.map(s => s.id === studentId ? { ...s, status: null, note: '' } : s));
        toast.success('Data dihapus', { description: 'Kehadiran individu berhasil dihapus' });
      } catch (err) {
        console.error('Delete error:', err);
        toast.error('Gagal menghapus data');
      } finally {
        setDeleting(false);
      }
    }
  };

  const handleDeleteAll = async () => {
    const hasData = students.some(s => s.status !== null);
    if (!hasData) {
      toast.error('Tidak ada data untuk dihapus');
      return;
    }

    const currentClassEntity = classes.find(c => c.id === selectedClass || c.name === selectedClass);
    const className = currentClassEntity?.name || selectedClass;
    const classId = currentClassEntity?.id || selectedClass;

    if (activeUnit === 'JUNIOR_HIGH' && attendanceType === 'DHUHUR') {
      const count = students.filter(s => s.status !== null && s.status !== 'BELUM_DIISI').length;
      if (!window.confirm(`Anda akan mereset ${count} data Kehadiran Salat Zuhur kelas ${className} pada ${selectedDate}. Tindakan ini tidak dapat dibatalkan.`)) return;
      
      setDeleting(true);
      try {
        const batch = writeBatch(db);
        students.forEach(s => {
          const recordId = `${selectedClass}_${selectedDate}_${s.id}`;
          batch.set(doc(db, 'attendance_records', recordId), {
            dhuhrPrayerStatus: {
              status: 'BELUM_DIISI',
              updatedAt: serverTimestamp()
            }
          }, { merge: true });
        });
        await batch.commit();
        
        setStudents(students.map(s => ({ ...s, status: 'BELUM_DIISI' as any, dhuhrPrayerStatus: { status: 'BELUM_DIISI' } })));
        setRefreshTrigger(prev => prev + 1);
        toast.success('Pembersihan Selesai', { 
          description: `Semua data Kehadiran Salat Zuhur berhasil direset.` 
        });
      } catch (err) {
        console.error('Delete error:', err);
        toast.error('Gagal mereset semua data');
      } finally {
        setDeleting(false);
      }
      return;
    }

    if (attendanceType === 'DHUHUR') {
      const count = students.filter(s => s.status !== null).length;
      if (!window.confirm(`Anda akan menghapus ${count} data Kehadiran Shalat Dhuhur kelas ${className} pada ${selectedDate}. Tindakan ini tidak dapat dibatalkan.`)) return;
      
      setDeleting(true);
      try {
        const q = query(
          collection(db, 'dhuhur_attendance_records'),
          where('classId', 'in', [classId, className]),
          where('date', '==', selectedDate)
        );

        const snap = await getDocs(q);
        if (!snap.empty) {
          const docs = snap.docs;
          const BATCH_LIMIT = 500;
          for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
            const chunk = docs.slice(i, i + BATCH_LIMIT);
            const batch = writeBatch(db);
            chunk.forEach(docSnap => {
              batch.delete(docSnap.ref);
            });
            await batch.commit();
          }
        }
        
        setStudents(students.map(s => ({ ...s, status: null, note: '' })));
        setRefreshTrigger(prev => prev + 1);
        toast.success('Pembersihan Selesai', { 
          description: `${snap.size} data Kehadiran Shalat Dhuhur berhasil dihapus.` 
        });
      } catch (err) {
        console.error('Delete error:', err);
        toast.error('Gagal menghapus semua data');
      } finally {
        setDeleting(false);
      }
    } else {
      if (!window.confirm(`Hapus SEMUA data kehadiran untuk kelas ini pada tanggal ${selectedDate}? Tindakan ini tidak dapat dibatalkan.`)) return;
      
      setDeleting(true);
      try {
        const q = query(
          collection(db, 'attendance_records'),
          where('classId', 'in', [classId, className]),
          where('date', '==', selectedDate)
        );

        const snap = await getDocs(q);
        const deletePromises = snap.docs.map(d => deleteDoc(d.ref));
        await Promise.all(deletePromises);
        
        setStudents(students.map(s => ({ ...s, status: null, note: '' })));
        toast.success('Pembersihan Selesai', { description: `Semua data kehadiran tanggal ${selectedDate} telah dihapus.` });
      } catch (err) {
        console.error('Delete error:', err);
        toast.error('Gagal menghapus semua data');
      } finally {
        setDeleting(false);
      }
    }
  };

  // Load Monthly/Range Recap Data
  React.useEffect(() => {
    if (view !== 'RECAP' || !selectedClass) return;

    const loadMonthlyRecap = async () => {
      // Clear stale data immediately on load
      setRecapData({});
      setRecapMatrix({});
      setRecapStats({ hadir: 0, sakit: 0, izin: 0, alpa: 0, late: 0, attendanceRate: '—' });
      setRecapError(null);

      // Validate range if in RANGE mode
      if (recapPeriodMode === 'RANGE') {
        if (!recapStartDate || !recapEndDate) {
          setRecapRangeError('Tanggal Mulai dan Tanggal Selesai harus diisi.');
          return;
        }
        if (recapStartDate > recapEndDate) {
          setRecapRangeError('Tanggal Mulai tidak boleh lebih lambat dari Tanggal Selesai.');
          return;
        }
      }

      setLoadingRecap(true);
      try {
        const currentClassEntity = classes.find(c => c.id === selectedClass || c.name === selectedClass);
        const className = currentClassEntity?.name || selectedClass;
        const classId = currentClassEntity?.id || selectedClass;

        let startLimit = '';
        let endLimit = '';
        if (recapPeriodMode === 'MONTHLY') {
          const lastDay = new Date(parseInt(recapYear), parseInt(recapMonth), 0).getDate();
          startLimit = `${recapYear}-${recapMonth}-01`;
          endLimit = `${recapYear}-${recapMonth}-${lastDay.toString().padStart(2, '0')}`;
        } else {
          startLimit = recapStartDate;
          endLimit = recapEndDate;
        }

        if (activeUnit === 'JUNIOR_HIGH' && attendanceType === 'DHUHUR') {
          const { records, sourceDocumentCount } = await getDhuhurAttendanceRecords({
            unit: "JUNIOR_HIGH",
            classId: classId,
            className: className,
            academicYear: activeAcademicYear,
            semester: parseInt(activeSemester, 10),
            startDate: startLimit,
            endDate: endLimit
          });

          // Pure recap calculation
          const recap = calculateDhuhurRecap(records);

          // Generate student aggregates & daily matrix
          const agg: Record<string, { hadir: number, sakit: number, izin: number, alpa: number, late: number }> = {};
          const matrix: Record<string, Record<string, string>> = {};

          // Warm-up states for active class students
          students.forEach(s => {
            agg[s.id] = { hadir: 0, sakit: 0, izin: 0, alpa: 0, late: 0 };
            matrix[s.id] = {};
          });

          let unknownStatusCount = 0;

          records.forEach(entry => {
            const sId = entry.studentId;
            const date = entry.date;
            const status = entry.status;

            const isInRoster = students.some(st => st.id === sId);
            if (!isInRoster) return;

            if (!agg[sId]) agg[sId] = { hadir: 0, sakit: 0, izin: 0, alpa: 0, late: 0 };
            if (!matrix[sId]) matrix[sId] = {};

            matrix[sId][date] = status;

            if (status === 'SALAT_BERJAMAAH') {
              agg[sId].hadir++;
            } else if (status === 'BERHALANGAN') {
              agg[sId].late++;
            } else if (status === 'IZIN') {
              agg[sId].izin++;
            } else if (status === 'TIDAK_MENGIKUTI') {
              agg[sId].alpa++;
            } else if (status === 'BELUM_DIISI' || status === 'TIDAK_BERLAKU') {
              // no counters
            } else {
              unknownStatusCount++;
            }
          });

          const denom = recap.salatBerjamaah + recap.berhalangan + recap.izin + recap.tidakMengikuti;
          const rateVal = denom > 0 ? Math.round((recap.salatBerjamaah / denom) * 100) : null;

          // Compact development-only diagnostics block
          if (process.env.NODE_ENV !== 'production') {
            console.log('[DEV DIAGNOSTICS] Salat Dhuhur Recap:', {
              selectedClassId: classId,
              selectedAcademicYear: activeAcademicYear,
              selectedSemester: activeSemester,
              dateRange: { startLimit, endLimit },
              firestoreDocumentCount: sourceDocumentCount,
              normalizedEntryCount: records.length,
              unknownStatusCount,
              computedRecapResult: recap
            });
          }

          if (records.length > 0) {
            setRecapData(agg);
            setRecapMatrix(matrix);
            setRecapStats({
              hadir: recap.salatBerjamaah,
              sakit: 0,
              izin: recap.izin,
              alpa: recap.tidakMengikuti,
              late: recap.berhalangan,
              attendanceRate: rateVal !== null ? rateVal : '—'
            });
          } else {
            setRecapData({});
            setRecapMatrix({});
            setRecapStats({
              hadir: 0,
              sakit: 0,
              izin: 0,
              alpa: 0,
              late: 0,
              attendanceRate: '—'
            });
          }

        } else {
          // Query all records for this period (Standard School/Legacy)
          const recordsCollection = attendanceType === 'DHUHUR' ? 'dhuhur_attendance_records' : 'attendance_records';
          const q = query(
            collection(db, recordsCollection),
            where('classId', 'in', [classId, className]),
            where('date', '>=', startLimit),
            where('date', '<=', endLimit)
          );

          const snap = await getDocs(q);
          const agg: Record<string, { hadir: number, sakit: number, izin: number, alpa: number, late: number }> = {};
          const matrix: Record<string, Record<string, string>> = {};
          
          let totalHadir = 0;
          let totalSakit = 0;
          let totalIzin = 0;
          let totalAlpa = 0;
          let totalLate = 0;

          // Defensive extraction from Firestore documents
          const extractedMonthlyList: { studentId: string; date: string; status: string }[] = [];
          snap.docs.forEach(doc => {
            const docData = doc.data();
            const date = docData.date;
            if (!date) return;
            const records = extractRecordsFromDoc(docData);
            records.forEach(r => {
              extractedMonthlyList.push({
                studentId: r.studentId,
                date: date,
                status: r.status
              });
            });
          });

          const hasRecords = extractedMonthlyList.length > 0;
          if (hasRecords) {
            students.forEach(s => {
              agg[s.id] = { hadir: 0, sakit: 0, izin: 0, alpa: 0, late: 0 };
              matrix[s.id] = {};
            });
          }

          extractedMonthlyList.forEach(item => {
            const sId = item.studentId;
            const date = item.date;

            const isInRoster = students.some(st => st.id === sId);
            if (!isInRoster) return;

            if (!agg[sId]) agg[sId] = { hadir: 0, sakit: 0, izin: 0, alpa: 0, late: 0 };
            if (!matrix[sId]) matrix[sId] = {};
            
            const status = item.status;
            matrix[sId][date] = status;
            
            if (status === 'H') { agg[sId].hadir++; totalHadir++; }
            else if (status === 'T') { agg[sId].late++; totalLate++; }
            else if (status === 'A') { agg[sId].alpa++; totalAlpa++; }
            else {
              if (status === 'HADIR') { agg[sId].hadir++; totalHadir++; }
              else if (status === 'SAKIT') { agg[sId].sakit++; totalSakit++; }
              else if (status === 'IZIN') { agg[sId].izin++; totalIzin++; }
              else if (status === 'ALPA') { agg[sId].alpa++; totalAlpa++; }
              else if (status === 'LATE') { agg[sId].late++; totalLate++; }
            }
          });

          if (hasRecords) {
            setRecapData(agg);
            setRecapMatrix(matrix);
            
            let rateVal: number | null = null;
            if (attendanceType === 'DHUHUR') {
              const denom = totalHadir + totalLate + totalAlpa;
              rateVal = denom > 0 ? Math.round(((totalHadir + totalLate) / denom) * 100) : null;
            } else {
              const denom = totalHadir + totalLate + totalSakit + totalIzin + totalAlpa;
              rateVal = denom > 0 ? Math.round(((totalHadir + totalLate) / denom) * 100) : null;
            }

            setRecapStats({
              hadir: totalHadir,
              sakit: totalSakit,
              izin: totalIzin,
              alpa: totalAlpa,
              late: totalLate,
              attendanceRate: rateVal !== null ? rateVal : '—'
            });
          } else {
            setRecapData({});
            setRecapMatrix({});
            setRecapStats({
              hadir: 0,
              sakit: 0,
              izin: 0,
              alpa: 0,
              late: 0,
              attendanceRate: '—'
            });
          }
        }
      } catch (err: any) {
        console.error('Error loading monthly recap:', err);
        const isPerm = err?.code === 'permission-denied' || err?.message?.toLowerCase().includes('permission') || err?.message?.toLowerCase().includes('denied');
        setRecapError(isPerm ? 'permission' : 'generic');
      } finally {
        setLoadingRecap(false);
      }
    };

    loadMonthlyRecap();
  }, [view, selectedClass, recapMonth, recapYear, recapPeriodMode, recapStartDate, recapEndDate, students.length, attendanceType, activeAcademicYear, activeSemester]);

  const handlePrevDate = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const handleNextDate = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const setDateToToday = () => {
    setSelectedDate(new Date().toISOString().split('T')[0]);
  };

  const setDateToYesterday = () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    setSelectedDate(yesterday.toISOString().split('T')[0]);
  };

  const handleStatusChange = (id: string, newStatus: AttendanceStatus | 'H' | 'T' | 'A') => {
    setStudents(students.map(s => {
      if (s.id !== id) return s;

      if (activeUnit === 'JUNIOR_HIGH') {
        if (attendanceType === 'DAILY') {
          const isNonPresent = ['SAKIT', 'IZIN', 'ALPA'].includes(newStatus as string);
          let updatedDhuhr = s.dhuhrPrayerStatus;
          
          if (isNonPresent) {
            updatedDhuhr = {
              ...(s.dhuhrPrayerStatus || {}),
              status: 'TIDAK_BERLAKU',
              updatedAt: new Date() as any
            };
          } else if (s.dhuhrPrayerStatus?.status === 'TIDAK_BERLAKU') {
            updatedDhuhr = {
              ...s.dhuhrPrayerStatus,
              status: 'BELUM_DIISI',
              updatedAt: new Date() as any
            };
          }
          
          return {
            ...s,
            status: newStatus as any,
            schoolStatus: newStatus as any,
            dhuhrPrayerStatus: updatedDhuhr
          };
        } else {
          // DHUHUR mode
          const isNonPresent = s.schoolStatus && ['SAKIT', 'IZIN', 'ALPA'].includes(s.schoolStatus);
          if (isNonPresent) {
            return {
              ...s,
              status: 'TIDAK_BERLAKU' as any,
              dhuhrPrayerStatus: {
                ...(s.dhuhrPrayerStatus || {}),
                status: 'TIDAK_BERLAKU' as any
              }
            };
          }
          return {
            ...s,
            status: newStatus as any,
            dhuhrPrayerStatus: {
              ...(s.dhuhrPrayerStatus || {}),
              status: newStatus as any
            }
          };
        }
      }

      return { ...s, status: newStatus };
    }));
  };

  const handleNoteChange = (id: string, note: string) => {
    setStudents(students.map(s => s.id === id ? { ...s, note } : s));
  };

  const handleEmotionChange = (id: string, emotion: 'happy' | 'neutral' | 'sad' | null) => {
    setStudents(students.map(s => s.id === id ? { ...s, emotion } : s));
  };
  
  const handleSaveFirestore = async () => {
    const unselectedCount = students.filter(s => s.status === null).length;
    if (unselectedCount > 0) {
      const confirmSave = window.confirm(`${unselectedCount} siswa belum memiliki status kehadiran. Lanjutkan simpan? (Siswa tanpa status tidak akan disimpan/dianggap belum diabsen)`);
      if (!confirmSave) return;
    }

    setSaving(true);
    let successCount = 0;

    try {
      const userEmail = auth.currentUser?.email || 'unknown_teacher';

      for (const student of students) {
        if (student.status === null) continue;

        const recordId = `${selectedClass}_${selectedDate}_${student.id}`;
        const record: AttendanceRecord & { emotion?: 'happy' | 'neutral' | 'sad' | null } = {
          id: recordId,
          studentId: student.id,
          studentName: student.name,
          classId: selectedClass,
          academicYear: activeAcademicYear,
          semester: activeSemester,
          date: selectedDate,
          status: student.status,
          note: student.note,
          emotion: student.emotion || null,
          latenessMinutes: null,
          recordedBy: userEmail,
          recordedAt: Date.now(),
          updatedAt: Date.now(),
          syncStatus: 'PENDING',
          lastSyncAt: null,
          syncError: null,
          retryCount: 0
        };

        // Save to Firestore with unit support
        const recordData: any = {
          ...record,
          recordedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        if (activeUnit === 'ELEMENTARY') {
          recordData.unit = 'ELEMENTARY';
          recordData.schoolYear = activeAcademicYear;
        } else if (activeUnit === 'JUNIOR_HIGH') {
          recordData.unit = 'JUNIOR_HIGH';
          if (student.dhuhrPrayerStatus) {
            recordData.dhuhrPrayerStatus = {
              ...student.dhuhrPrayerStatus,
              updatedAt: serverTimestamp()
            };
          }
        }

        await setDoc(doc(db, 'attendance_records', recordId), recordData, { merge: true });
        
        successCount++;
      }

      setLastSaved({ date: selectedDate, classId: selectedClass });
      toast.success('Kehadiran Disimpan', {
        description: `${successCount} data berhasil disimpan ke Firestore.`
      });

    } catch (err) {
      console.error('Save Firestore error:', err);
      toast.error('Gagal Simpan', {
        description: 'Terjadi kesalahan saat menyimpan data ke Firestore.'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleBackupGoogleSheets = async () => {
    const unselectedCount = students.filter(s => s.status === null).length;
    if (unselectedCount > 0) {
      const confirmBackup = window.confirm(`${unselectedCount} siswa belum memiliki status kehadiran. Lanjutkan backup? (Hanya siswa dengan status kehadiran yang akan diekspor)`);
      if (!confirmBackup) return;
    }

    const studentsToBackup = students.filter(s => s.status !== null);
    if (studentsToBackup.length === 0) {
      toast.error('Tidak ada data kehadiran yang siap diekspor.');
      return;
    }

    setBackingUp(true);
    let successCount = 0;

    try {
      const user = auth.currentUser;
      const userEmail = user?.email || 'unknown_teacher';
      const academicYearId = activeAcademicYear.replace(/\//g, '-');
      const recordIds: string[] = [];

      // 1. Save to Firestore first to make sure it's up to date
      for (const student of studentsToBackup) {
        const recordId = `${selectedClass}_${selectedDate}_${student.id}`;
        recordIds.push(recordId);

        const record: AttendanceRecord = {
          id: recordId,
          studentId: student.id,
          studentName: student.name,
          classId: selectedClass,
          academicYear: activeAcademicYear,
          semester: activeSemester,
          date: selectedDate,
          status: student.status!,
          note: student.note,
          latenessMinutes: null,
          recordedBy: userEmail,
          recordedAt: Date.now(),
          updatedAt: Date.now(),
          syncStatus: 'PENDING',
          lastSyncAt: null,
          syncError: null,
          retryCount: 0
        };

        await setDoc(doc(db, 'attendance_records', recordId), {
          ...record,
          recordedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }, { merge: true });

        successCount++;
      }

      // 2. Call the batch sync API
      const idToken = await user?.getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
      }

      const response = await fetch('/api/attendance/sync-batch', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          academicYearId,
          semester: activeSemester,
          classId: selectedClass,
          date: selectedDate,
          recordIds
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Gagal mem-backup ke Google Sheets via server API.');
      }

      const syncResult = await response.json();
      
      setLastSaved({ date: selectedDate, classId: selectedClass });
      
      if (syncResult.summary?.failed > 0) {
        toast.warning('Backup Selesai dengan Sebagian Gagal', {
          description: `${syncResult.summary.success} berhasil, ${syncResult.summary.failed} gagal diekspor.`
        });
      } else {
        toast.success('Backup Selesai', {
          description: `Semua ${syncResult.summary.success} data berhasil diekspor ke Google Sheets.`
        });
      }

    } catch (err: any) {
      console.error('Backup error:', err);
      toast.error('Gagal Ekspor Backup', {
        description: err.message || 'Terjadi kesalahan saat mengekspor data ke Google Sheets.'
      });
    } finally {
      setBackingUp(false);
    }
  };

  const handleBackupElementaryGoogleSheets = async () => {
    const unselectedCount = students.filter(s => s.status === null).length;
    if (unselectedCount > 0) {
      const confirmBackup = window.confirm(`${unselectedCount} siswa belum memiliki status kehadiran. Lanjutkan backup? (Hanya siswa dengan status kehadiran yang akan diekspor)`);
      if (!confirmBackup) return;
    }

    const studentsToBackup = students.filter(s => s.status !== null);
    if (studentsToBackup.length === 0) {
      toast.error('Tidak ada data kehadiran yang siap diekspor.');
      return;
    }

    setBackingUp(true);
    try {
      const user = auth.currentUser;
      const idToken = await user?.getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
      }

      const response = await fetch('/api/backup/elementary-sync', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          classId: selectedClass,
          date: selectedDate,
          schoolYear: activeAcademicYear,
          semester: activeSemester,
          mode: 'START'
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Gagal mengekspor data.');
      }

      const resData = await response.json();
      toast.success('Backup Selesai', {
        description: `Semua ${resData.summary?.success || 0} data berhasil diekspor ke Google Sheets.`
      });
      setRefreshTrigger(prev => prev + 1);

    } catch (err: any) {
      console.error('Backup error:', err);
      toast.error('Gagal Ekspor Backup', {
        description: err.message || 'Terjadi kesalahan saat mengekspor data ke Google Sheets.'
      });
    } finally {
      setBackingUp(false);
    }
  };

  const handleSaveDhuhurFirestore = async () => {
    if (activeUnit === 'JUNIOR_HIGH') {
      const unselectedCount = students.filter(s => s.status === null || s.status === 'BELUM_DIISI').length;
      if (unselectedCount > 0) {
        const confirmSave = window.confirm(`${unselectedCount} siswa belum memiliki status Salat Zuhur. Lanjutkan simpan?`);
        if (!confirmSave) return;
      }

      setSaving(true);
      let successCount = 0;

      try {
        const user = auth.currentUser;
        const userEmail = user?.email || 'unknown_teacher';
        const userName = userProfile?.name || userProfile?.displayName || user?.displayName || 'Guru';
        const userUid = user?.uid || 'unknown_uid';

        const currentClassEntity = classes.find(c => c.id === selectedClass || c.name === selectedClass);
        const className = currentClassEntity?.name || selectedClass;
        const classId = currentClassEntity?.id || selectedClass;

        for (const student of students) {
          if ((student.status === null || student.status === 'BELUM_DIISI') && !student.dhuhrPrayerStatus) {
            continue;
          }

          const recordId = `${selectedClass}_${selectedDate}_${student.id}`;
          
          const existingDhuhr = student.dhuhrPrayerStatus;
          const isNew = !existingDhuhr || !existingDhuhr.status || existingDhuhr.status === 'BELUM_DIISI';

          const dhuhrPrayerStatus = {
            status: student.status || 'BELUM_DIISI',
            schoolAttendanceStatus: student.schoolStatus || null,
            recordedBy: isNew ? userUid : (existingDhuhr?.recordedBy || userUid),
            recordedByName: isNew ? userName : (existingDhuhr?.recordedByName || userName),
            recordedByEmail: isNew ? userEmail : (existingDhuhr?.recordedByEmail || userEmail),
            recordedAt: isNew ? serverTimestamp() : (existingDhuhr?.recordedAt || serverTimestamp()),
            
            updatedBy: userUid,
            updatedByName: userName,
            updatedByEmail: userEmail,
            updatedAt: serverTimestamp()
          };

          const recordData: any = {
            id: recordId,
            studentId: student.id,
            studentName: student.name,
            classId: selectedClass,
            academicYear: activeAcademicYear,
            semester: activeSemester,
            date: selectedDate,
            unit: 'JUNIOR_HIGH',
            dhuhrPrayerStatus,
            updatedAt: serverTimestamp()
          };

          await setDoc(doc(db, 'attendance_records', recordId), recordData, { merge: true });

          // Also save to dhuhur_attendance_records to ensure perfect sync
          const academicYearId = activeAcademicYear.replace(/\//g, '-');
          const dhuhurRecordId = `dhuhur_${selectedClass}_${selectedDate}_${student.id}`;
          const dhuhurRecord = {
            id: dhuhurRecordId,
            studentId: student.id,
            classId: selectedClass,
            date: selectedDate,
            unit: 'JUNIOR_HIGH',
            status: student.status || 'BELUM_DIISI',
            schoolAttendanceStatus: student.schoolStatus || null,
            note: student.note || "",
            academicYearId,
            academicYear: activeAcademicYear,
            semester: parseInt(activeSemester, 10),
            studentNameSnapshot: student.name,
            classNameSnapshot: className,
            recordedByUid: userUid,
            recordedByEmail: userEmail,
            recordedAt: isNew ? serverTimestamp() : (existingDhuhr?.recordedAt || serverTimestamp()),
            updatedAt: serverTimestamp(),
            backupType: 'DHUHUR_ATTENDANCE',
            syncStatus: 'PENDING',
            lastSyncAt: null,
            syncError: null,
            retryCount: 0
          };
          await setDoc(doc(db, 'dhuhur_attendance_records', dhuhurRecordId), dhuhurRecord, { merge: true });

          successCount++;
        }

        setLastSaved({ date: selectedDate, classId: selectedClass });
        toast.success('Kehadiran Shalat Dhuhur Disimpan', {
          description: `${successCount} data Salat Zuhur berhasil disimpan.`
        });
        setRefreshTrigger(prev => prev + 1);

      } catch (err: any) {
        console.error('Save Dhuhur error:', err);
        toast.error('Gagal Simpan', {
          description: err.message || 'Terjadi kesalahan saat menyimpan data Salat Zuhur.'
        });
      } finally {
        setSaving(false);
      }
      return;
    }

    const unselectedCount = students.filter(s => s.status === null).length;
    if (unselectedCount > 0) {
      const confirmSave = window.confirm(`${unselectedCount} siswa belum memiliki status kehadiran shalat Dhuhur. Lanjutkan simpan? (Siswa tanpa status tidak akan disimpan)`);
      if (!confirmSave) return;
    }

    setSaving(true);
    let successCount = 0;

    try {
      const user = auth.currentUser;
      const userEmail = user?.email || 'unknown_teacher';
      const userUid = user?.uid || 'unknown_uid';

      const currentClassEntity = classes.find(c => c.id === selectedClass || c.name === selectedClass);
      const className = currentClassEntity?.name || selectedClass;
      const academicYearId = activeAcademicYear.replace(/\//g, '-');

      for (const student of students) {
        if (student.status === null) continue;

        const recordId = `dhuhur_${selectedClass}_${selectedDate}_${student.id}`;
        
        const record = {
          id: recordId,
          studentId: student.id,
          classId: selectedClass,
          date: selectedDate,
          unit: 'JUNIOR_HIGH',
          status: student.status, // 'H' | 'T' | 'A'
          note: student.note || "",
          academicYearId,
          academicYear: activeAcademicYear,
          semester: parseInt(activeSemester, 10),
          studentNameSnapshot: student.name,
          classNameSnapshot: className,
          recordedByUid: userUid,
          recordedByEmail: userEmail,
          recordedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          backupType: 'DHUHUR_ATTENDANCE',
          syncStatus: 'PENDING',
          lastSyncAt: null,
          syncError: null,
          retryCount: 0
        };

        // Save to Firestore with merge
        await setDoc(doc(db, 'dhuhur_attendance_records', recordId), record, { merge: true });
        successCount++;
      }

      setLastSaved({ date: selectedDate, classId: selectedClass });
      toast.success('Kehadiran Shalat Dhuhur Disimpan', {
        description: `${successCount} data berhasil disimpan ke Firestore.`
      });

    } catch (err: any) {
      console.error('Save Dhuhur Firestore error:', err);
      toast.error('Gagal Simpan', {
        description: err.message || 'Terjadi kesalahan saat menyimpan data ke Firestore.'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleBackupDhuhurGoogleSheets = async () => {
    const unselectedCount = students.filter(s => s.status === null).length;
    if (unselectedCount > 0) {
      const confirmBackup = window.confirm(`${unselectedCount} siswa belum memiliki status kehadiran shalat Dhuhur. Lanjutkan backup? (Hanya siswa dengan status yang akan diekspor)`);
      if (!confirmBackup) return;
    }

    const studentsToBackup = students.filter(s => s.status !== null);
    if (studentsToBackup.length === 0) {
      toast.error('Tidak ada data kehadiran yang siap diekspor.');
      return;
    }

    setBackingUp(true);
    let successCount = 0;

    try {
      const user = auth.currentUser;
      const userEmail = user?.email || 'unknown_teacher';
      const userUid = user?.uid || 'unknown_uid';

      const currentClassEntity = classes.find(c => c.id === selectedClass || c.name === selectedClass);
      const className = currentClassEntity?.name || selectedClass;
      const academicYearId = activeAcademicYear.replace(/\//g, '-');

      const recordIds: string[] = [];

      // 1. Save all to Firestore first as PENDING
      for (const student of studentsToBackup) {
        const recordId = `dhuhur_${selectedClass}_${selectedDate}_${student.id}`;
        recordIds.push(recordId);

        const record = {
          id: recordId,
          studentId: student.id,
          classId: selectedClass,
          date: selectedDate,
          unit: 'JUNIOR_HIGH',
          status: student.status!, // 'H' | 'T' | 'A'
          note: student.note || "",
          academicYearId,
          academicYear: activeAcademicYear,
          semester: parseInt(activeSemester, 10),
          studentNameSnapshot: student.name,
          classNameSnapshot: className,
          recordedByUid: userUid,
          recordedByEmail: userEmail,
          recordedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          backupType: 'DHUHUR_ATTENDANCE',
          syncStatus: 'PENDING',
          lastSyncAt: null,
          syncError: null,
          retryCount: 0
        };

        await setDoc(doc(db, 'dhuhur_attendance_records', recordId), record, { merge: true });
        successCount++;
      }

      // 2. Call the batch sync API
      const idToken = await user?.getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
      }

      const response = await fetch('/api/attendance/dhuhur/sync-batch', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          academicYearId,
          semester: activeSemester,
          classId: selectedClass,
          date: selectedDate,
          recordIds
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Gagal mem-backup ke Google Sheets via server API.');
      }

      const syncResult = await response.json();
      
      setLastSaved({ date: selectedDate, classId: selectedClass });
      
      if (syncResult.summary?.failed > 0) {
        toast.warning('Backup Selesai dengan Sebagian Gagal', {
          description: `${syncResult.summary.success} berhasil, ${syncResult.summary.failed} gagal diekspor.`
        });
      } else {
        toast.success('Backup Selesai', {
          description: `Semua ${syncResult.summary.success} data berhasil diekspor ke Google Sheets.`
        });
      }

    } catch (err: any) {
      console.error('Backup Dhuhur error:', err);
      toast.error('Gagal Ekspor Backup', {
        description: err.message || 'Terjadi kesalahan saat mengekspor data ke Google Sheets.'
      });
    } finally {
      setBackingUp(false);
    }
  };

  const handleSaveAll = async () => {
    const unselectedCount = students.filter(s => s.status === null).length;
    if (unselectedCount > 0) {
      const confirmSave = window.confirm(`${unselectedCount} siswa belum memiliki status kehadiran. Lanjutkan simpan? (Siswa tanpa status tidak akan disimpan/dianggap belum diabsen)`);
      if (!confirmSave) return;
    }

    setSaving(true);
    let successCount = 0;

    try {
      const user = auth.currentUser;
      const userEmail = user?.email || 'unknown_teacher';
      const academicYearId = activeAcademicYear.replace(/\//g, '-');
      const recordIds: string[] = [];

      for (const student of students) {
        if (student.status === null) continue;

        const recordId = `${selectedClass}_${selectedDate}_${student.id}`;
        recordIds.push(recordId);

        const record: AttendanceRecord = {
          id: recordId,
          studentId: student.id,
          studentName: student.name,
          classId: selectedClass,
          academicYear: activeAcademicYear,
          semester: activeSemester,
          date: selectedDate,
          status: student.status,
          note: student.note,
          latenessMinutes: null,
          recordedBy: userEmail,
          recordedAt: Date.now(),
          updatedAt: Date.now(),
          syncStatus: 'PENDING',
          lastSyncAt: null,
          syncError: null,
          retryCount: 0
        };

        // 1. Save to Firestore
        await setDoc(doc(db, 'attendance_records', recordId), {
          ...record,
          recordedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }, { merge: true });
        
        successCount++;
      }

      if (recordIds.length === 0) {
        toast.error('Tidak ada data kehadiran yang siap disimpan.');
        return;
      }

      // 2. Call batch sync API
      const idToken = await user?.getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
      }

      const response = await fetch('/api/attendance/sync-batch', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          academicYearId,
          semester: activeSemester,
          classId: selectedClass,
          date: selectedDate,
          recordIds
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Gagal mem-backup ke Google Sheets via server API.');
      }

      const syncResult = await response.json();

      setLastSaved({ date: selectedDate, classId: selectedClass });
      
      if (syncResult.summary?.failed > 0) {
        toast.warning('Kehadiran Disimpan dengan Sebagian Gagal Backup', {
          description: `${successCount} data disimpan. ${syncResult.summary.success} berhasil di-backup, ${syncResult.summary.failed} gagal.`
        });
      } else {
        toast.success('Kehadiran Disimpan & Di-backup', {
          description: `${successCount} data berhasil disimpan dan di-backup ke Google Sheets.`
        });
      }

    } catch (err: any) {
      console.error('Save error:', err);
      toast.error('Gagal Simpan', {
        description: err.message || 'Terjadi kesalahan saat menyimpan data ke database.'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCopySIA = async (withHeader: boolean) => {
    if (!students || students.length === 0 || Object.keys(recapData).length === 0) {
      toast.error('Tidak ada data kehadiran yang dapat disalin.');
      return;
    }

    const rows: string[] = [];
    if (withHeader) {
      rows.push('Sakit\tIzin\tAlfa');
    }

    students.forEach(s => {
      const stats = recapData[s.id] || { sakit: 0, izin: 0, alpa: 0 };
      const sakit = stats.sakit ?? 0;
      const izin = stats.izin ?? 0;
      const alpa = stats.alpa ?? 0;
      rows.push(`${sakit}\t${izin}\t${alpa}`);
    });

    const clipboardText = rows.join('\n');
    try {
      await navigator.clipboard.writeText(clipboardText);
      toast.success(`Data S/I/A untuk ${students.length} siswa berhasil disalin.`);
    } catch (err) {
      console.error('Failed to copy text to clipboard:', err);
      toast.error('Gagal menyalin data ke clipboard.');
    }
  };

  const getStatusIcon = (status: AttendanceStatus) => {
    switch (status) {
      case 'HADIR': return <CheckCircle2 size={18} />;
      case 'SAKIT': return <Clock size={18} />;
      case 'IZIN': return <AlertCircle size={18} />;
      case 'ALPA': return <UserX size={18} />;
      default: return null;
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Manajemen Kehadiran</h1>
          <div className="flex items-center gap-2">
            <p className="text-gray-500 font-medium">{activeUnit?.replace('_', ' ')} - Unit Dashboard</p>
            {isAdmin && (
              <button 
                onClick={() => navigate('backup-config')}
                className="p-1.5 bg-gray-100 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                title="Backup Settings"
              >
                <Settings2 size={16} />
              </button>
            )}
          </div>
        </div>
        <div className="flex bg-gray-100 p-1 rounded-xl">
          <ViewButton active={view === 'INPUT'} onClick={() => setView('INPUT')} label="Input Harian" />
          <ViewButton active={view === 'RECAP'} onClick={() => setView('RECAP')} label="Rekap Kehadiran" />
          <ViewButton active={view === 'ALERTS'} onClick={() => setView('ALERTS')} label="Alert Risiko" />
        </div>
      </header>

      {activeUnit === 'JUNIOR_HIGH' && (
        <div className="flex border-b border-gray-100 pb-1.5 gap-6">
          <button 
            onClick={() => {
              setAttendanceType('DAILY');
              setStudents([]);
            }}
            className={cn(
              "pb-2 text-sm font-bold border-b-2 px-1 transition-all",
              attendanceType === 'DAILY' ? "border-blue-600 text-blue-600" : "border-transparent text-gray-400 hover:text-gray-600"
            )}
          >
            Kehadiran Harian
          </button>
          <button 
            onClick={() => {
              setAttendanceType('DHUHUR');
              setStudents([]);
            }}
            className={cn(
              "pb-2 text-sm font-bold border-b-2 px-3 transition-all flex items-center gap-2 relative group",
              attendanceType === 'DHUHUR' 
                ? "border-blue-600 text-blue-600 bg-blue-50/50 rounded-t-lg" 
                : "border-transparent text-gray-400 hover:text-blue-500 hover:bg-blue-50/10 rounded-t-lg"
            )}
            aria-label="Kehadiran Shalat Dhuhur"
          >
            <Mosque 
              size={16} 
              className={cn(
                "transition-colors",
                attendanceType === 'DHUHUR' ? "text-blue-600" : "text-gray-400 group-hover:text-blue-400"
              )} 
              aria-hidden="true"
            />
            <span className="truncate">Kehadiran Shalat Dhuhur</span>
          </button>
        </div>
      )}

      {activeUnit === 'JUNIOR_HIGH' && attendanceType === 'DHUHUR' && (
        <div className="bg-blue-50/40 border border-blue-100 rounded-2xl p-5 flex items-center justify-between gap-4 animate-in fade-in duration-300">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-md shadow-blue-100">
              <Mosque size={22} aria-label="Ikon Shalat Dhuhur" title="Ikon Shalat Dhuhur" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-blue-900 flex items-center gap-2">
                Kehadiran Shalat Dhuhur
              </h2>
            </div>
          </div>
          <span className="px-2.5 py-1 bg-blue-100 text-blue-800 text-[10px] font-black rounded-full uppercase tracking-widest whitespace-nowrap hidden sm:inline-block">
            Sistem Shalat Dhuhur
          </span>
        </div>
      )}

      {view === 'INPUT' && (
        <div className="space-y-6">
          <div className={cn(
            "p-4 sm:p-6 rounded-2xl shadow-sm border flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 transition-all",
            attendanceType === 'DHUHUR' ? "bg-blue-50/10 border-blue-100 shadow-blue-50/10" : "bg-white border-gray-100"
          )}>
             {/* Left Column: Kelas and Tanggal */}
             <div className="flex flex-col sm:flex-row sm:items-center gap-4 w-full lg:w-auto">
                {/* Search Input for Desktop */}
                <div className="hidden md:flex flex-col w-[200px]" id="desktop-search-container">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1.5">Cari Siswa</span>
                  <div className="relative w-full">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Nama / ID..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="bg-gray-50 border border-gray-200 rounded-lg pl-8 pr-7 py-2 text-sm font-bold outline-none focus:border-blue-300 w-full placeholder:text-gray-400 focus:bg-white transition-colors"
                    />
                    {searchTerm && (
                      <button
                        onClick={() => setSearchTerm('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Dropdown Kelas */}
                <div className="flex flex-col w-full sm:w-auto sm:min-w-[150px]">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1.5">Kelas</span>
                  <div className="relative w-full">
                    <select 
                      value={selectedClass}
                      disabled={loadingClasses}
                      onChange={(e) => setSelectedClass(e.target.value)}
                      className={cn(
                        "bg-gray-50 border rounded-lg pl-3 pr-8 py-2 text-sm font-bold outline-none cursor-pointer transition-colors appearance-none w-full",
                        attendanceType === 'DHUHUR'
                          ? "border-blue-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-blue-900"
                          : "border-gray-200 hover:border-blue-300"
                      )}
                    >
                      {loadingClasses ? (
                        <option>Loading...</option>
                      ) : (
                        <>
                          <option value="">Pilih Kelas</option>
                          {classes.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </>
                      )}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                      <Layers size={14} />
                    </div>
                  </div>
                </div>

                {/* Tanggal Controls */}
                <div className="flex flex-col w-full sm:w-auto">
                   <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1.5">Tanggal</span>
                   <div className="flex items-center gap-1.5 w-full">
                     <button 
                       onClick={handlePrevDate}
                       className="p-2.5 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-lg transition-all shrink-0 h-10 w-10 flex items-center justify-center"
                       title="Tanggal Sebelumnya"
                     >
                       <ChevronLeft size={18} />
                     </button>
                     <input 
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className={cn(
                        "px-3 py-2 bg-gray-50 border rounded-lg text-sm font-bold outline-none cursor-pointer transition-all flex-1 sm:flex-initial h-10",
                        attendanceType === 'DHUHUR'
                          ? "border-blue-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-blue-900"
                          : "border-gray-200 hover:border-blue-300"
                      )}
                     />
                     <button 
                       onClick={handleNextDate}
                       className="p-2.5 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-lg transition-all shrink-0 h-10 w-10 flex items-center justify-center"
                       title="Tanggal Berikutnya"
                     >
                       <ChevronRight size={18} />
                     </button>
                     
                     <div className="hidden xs:flex sm:flex items-center gap-1 ml-1.5">
                        <button 
                          onClick={setDateToToday}
                          className="px-2.5 py-2 text-[10px] font-bold bg-gray-100 text-gray-600 rounded-lg hover:bg-blue-50 hover:text-blue-600 transition-all whitespace-nowrap h-10"
                        >
                          Hari Ini
                        </button>
                        <button 
                          onClick={setDateToYesterday}
                          className="px-2.5 py-2 text-[10px] font-bold bg-gray-100 text-gray-600 rounded-lg hover:bg-orange-50 hover:text-orange-600 transition-all whitespace-nowrap h-10"
                        >
                          Kemarin
                        </button>
                     </div>
                   </div>
                   
                   {/* Mobile Today/Yesterday Shortcuts */}
                   <div className="flex xs:hidden gap-1.5 mt-2 w-full">
                     <button 
                       onClick={setDateToToday}
                       className="flex-1 py-2 text-[10px] font-black bg-gray-100 text-gray-600 rounded-lg hover:bg-blue-50 hover:text-blue-600 transition-all text-center h-9"
                     >
                       Hari Ini
                     </button>
                     <button 
                       onClick={setDateToYesterday}
                       className="flex-1 py-2 text-[10px] font-black bg-gray-100 text-gray-600 rounded-lg hover:bg-orange-50 hover:text-orange-600 transition-all text-center h-9"
                     >
                       Kemarin
                     </button>
                   </div>
                </div>
             </div>

             {/* Right Column: Actions (Cek Semua Hadir & Hapus Data Hari Ini) */}
             <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto sm:justify-end lg:self-end">
                <button 
                  onClick={() => setStudents(students.map(s => {
                    if (attendanceType === 'DHUHUR') {
                      const isNonPresent = s.schoolStatus && ['SAKIT', 'IZIN', 'ALPA'].includes(s.schoolStatus);
                      return {
                        ...s,
                        status: isNonPresent ? 'TIDAK_BERLAKU' : 'H'
                      };
                    } else {
                      return {
                        ...s,
                        status: 'HADIR'
                      };
                    }
                  }))}
                  className="px-4 py-2.5 bg-blue-50 text-blue-600 rounded-xl text-xs font-bold border border-blue-100 hover:bg-blue-100 transition-all active:scale-95 text-center h-11 sm:h-auto"
                >
                  Cek Semua Hadir
                </button>
                <button 
                  onClick={handleDeleteAll}
                  disabled={deleting}
                  className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm h-11 sm:h-auto"
                >
                  {deleting ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  <span>Hapus Semua Data Hari Ini</span>
                </button>
             </div>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 text-sm font-medium animate-in fade-in duration-200">
              <AlertTriangle size={18} />
              {error}
            </div>
          )}

          {/* Mobile view cards sticky filter header & container (visible only on screen < md) */}
          <div className="block md:hidden sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-gray-100 shadow-xs -mx-4 px-4 py-3 space-y-2.5 transition-all mb-4" id="mobile-sticky-filter-header">
            {/* Summary Bar */}
            <div className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-700">
              <div className="flex items-center gap-1.5 truncate">
                <span className="bg-blue-600 text-white rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase">
                  {classes.find(c => c.id === selectedClass)?.name || "Pilih Kelas"}
                </span>
                <span className="text-gray-300">|</span>
                <span className="truncate">
                  {new Date(selectedDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
                className="text-blue-600 hover:text-blue-700 font-extrabold flex items-center gap-1 shrink-0"
              >
                <span>{isFiltersExpanded ? "Tutup" : "Ubah"}</span>
                <Filter size={12} className={cn("transition-transform", isFiltersExpanded && "rotate-180")} />
              </button>
            </div>

            {/* Collapsible Full Filters (Class & Date) */}
            <AnimatePresence>
              {isFiltersExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden space-y-3 pb-2"
                >
                  <div className="grid grid-cols-1 gap-3 pt-1">
                    {/* Class Select */}
                    <div className="flex flex-col">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Kelas</label>
                      <div className="relative">
                        <select
                          value={selectedClass}
                          disabled={loadingClasses}
                          onChange={(e) => {
                            setSelectedClass(e.target.value);
                            setIsFiltersExpanded(false); // Auto close on select
                          }}
                          className="bg-gray-50 border border-gray-200 rounded-xl pl-3 pr-8 py-2 text-xs font-extrabold outline-none cursor-pointer w-full text-slate-800"
                        >
                          {loadingClasses ? (
                            <option>Loading...</option>
                          ) : (
                            <>
                              <option value="">Pilih Kelas</option>
                              {classes.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </>
                          )}
                        </select>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                          <Layers size={12} />
                        </div>
                      </div>
                    </div>

                    {/* Date Picker */}
                    <div className="flex flex-col">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Tanggal</label>
                      <div className="flex items-center gap-1.5">
                        <button 
                          onClick={handlePrevDate}
                          className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-xl h-9 w-9 flex items-center justify-center border border-gray-200/40"
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <input 
                          type="date"
                          value={selectedDate}
                          onChange={(e) => setSelectedDate(e.target.value)}
                          className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-extrabold outline-none cursor-pointer flex-1 text-center h-9 text-slate-800"
                        />
                        <button 
                          onClick={handleNextDate}
                          className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-xl h-9 w-9 flex items-center justify-center border border-gray-200/40"
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Search Row */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Cari nama atau ID siswa..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2 pl-9 pr-8 text-xs font-bold focus:border-blue-300 focus:bg-white outline-none transition-all placeholder:text-gray-400 text-slate-800"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                    aria-label="Bersihkan pencarian"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
                className={cn(
                  "p-2 rounded-xl border flex items-center justify-center h-9 w-9 transition-all",
                  isFiltersExpanded 
                    ? "bg-blue-50 border-blue-200 text-blue-600" 
                    : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                )}
                title="Tampilkan filter"
              >
                <Filter size={14} />
              </button>
            </div>
          </div>

          {!isSchoolDay && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center space-y-2 mb-6">
              <div className="mx-auto bg-amber-100 h-12 w-12 rounded-full flex items-center justify-center text-amber-600 mb-2">
                <AlertTriangle size={24} />
              </div>
              <h3 className="font-bold text-amber-900 text-lg">Libur / Bukan Hari Presensi</h3>
              <p className="text-amber-800 text-sm font-semibold max-w-lg mx-auto">
                Libur / bukan hari presensi — presensi tidak diperlukan pada tanggal ini.
              </p>
              {students.some(s => s.status !== null) && (
                <p className="text-amber-700 text-xs mt-1 max-w-md mx-auto">
                  Tanggal ini telah ditandai sebagai hari libur di Kalender Kehadiran, tetapi memiliki data presensi tersimpan. Data presensi ini dikecualikan dari perhitungan harian efektif.
                </p>
              )}
            </div>
          )}

          <div className="block md:hidden space-y-4" id="attendance-student-cards-mobile">
            {loading ? (
              <div className="bg-white p-12 text-center text-gray-400 font-medium border border-gray-100 rounded-2xl shadow-sm">
                <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-blue-500" />
                Memuat data siswa...
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="bg-white p-12 text-center text-gray-400 font-medium italic border border-gray-100 rounded-2xl shadow-sm">
                {searchTerm ? 'Tidak ada siswa yang cocok dengan pencarian.' : (selectedClass ? 'Tidak ada siswa yang ditemukan di kelas ini.' : 'Pilih kelas terlebih dahulu.')}
              </div>
            ) : (
              filteredStudents.map((student) => (
                <AttendanceStudentCard
                  key={student.id}
                  student={student}
                  attendanceType={attendanceType}
                  onStatusChange={(newStatus) => handleStatusChange(student.id, newStatus)}
                  onNoteChange={(newNote) => handleNoteChange(student.id, newNote)}
                  onEmotionChange={(newEmotion) => handleEmotionChange(student.id, newEmotion)}
                  onDeleteOne={() => handleDeleteOne(student.id)}
                  deleting={deleting}
                  threshold={threshold}
                  disabled={saving || deleting || !isSchoolDay}
                />
              ))
            )}
          </div>

          {/* Desktop view table (visible only on screen >= md) */}
          <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden" id="attendance-student-table-desktop">
            <table className="w-full text-left">
              <thead className="bg-gray-50/50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Nama Siswa</th>
                  <th className="px-1 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Status Kehadiran</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Catatan Tambahan</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Tindakan</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Eskalasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                   <tr>
                     <td colSpan={5} className="px-6 py-12 text-center text-gray-400 font-medium">
                        <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-blue-500" />
                        Memuat data siswa...
                     </td>
                   </tr>
                ) : filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-400 font-medium italic">
                       {searchTerm ? 'Tidak ada siswa yang cocok dengan pencarian.' : (selectedClass ? 'Tidak ada siswa yang ditemukan di kelas ini.' : 'Pilih kelas terlebih dahulu.')}
                    </td>
                  </tr>
                ) : filteredStudents.map((student) => (
                  <tr key={student.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 min-w-0">
                      <p className="font-bold text-gray-900 text-sm break-words leading-tight max-w-[280px]">{student.name}</p>
                      <p className="text-[10px] text-gray-400 font-medium mt-0.5">#{student.id}</p>
                    </td>
                    <td className="px-2 py-4">
                      <AttendanceStatusSelector
                        value={student.status}
                        onChange={(newStatus) => handleStatusChange(student.id, newStatus)}
                        attendanceType={attendanceType}
                        layout="desktop"
                        disabled={saving || deleting || !isSchoolDay}
                        schoolStatus={student.schoolStatus}
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="relative group max-w-[240px]">
                        <MessageSquare size={14} className="absolute left-0 top-1/2 -translate-y-1/2 text-gray-300 group-hover:text-blue-400 transition-colors" />
                        <input 
                          type="text" 
                          placeholder={!isSchoolDay ? "" : "Tambahkan catatan..."}
                          className="w-full bg-transparent border-b border-transparent focus:border-blue-300 outline-none text-sm transition-all py-1 pl-6 placeholder:text-gray-300"
                          value={student.note}
                          onChange={(e) => handleNoteChange(student.id, e.target.value)}
                          disabled={saving || deleting || !isSchoolDay}
                        />
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center">
                        {student.status && (
                          <button 
                            onClick={() => handleDeleteOne(student.id)}
                            disabled={deleting || !isSchoolDay}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all disabled:opacity-50"
                            title="Hapus Kehadiran Siswa Ini"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {student.absencesThisMonth >= threshold ? (
                        <div className="flex items-center justify-end gap-1.5 text-red-500 font-black">
                           <AlertTriangle size={14} />
                           <span className="text-[10px] uppercase tracking-tighter">High Risk</span>
                        </div>
                      ) : (
                        <span className="text-[10px] font-bold text-emerald-500 uppercase">Aman</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {isSchoolDay && (
            <div className="flex flex-col sm:flex-row justify-end items-stretch sm:items-center gap-3 pt-4 w-full">
             {lastSaved && lastSaved.date === selectedDate && lastSaved.classId === selectedClass && (
               <div className={cn(
                 "flex items-center justify-center gap-1.5 font-bold text-sm px-4 py-2 rounded-xl border animate-in fade-in slide-in-from-right-2 self-stretch sm:self-auto",
                 attendanceType === 'DHUHUR' 
                   ? "text-blue-600 bg-blue-50 border-blue-100" 
                   : "text-emerald-600 bg-emerald-50 border-emerald-100"
               )}>
                 <CheckCircle2 size={16} />
                 Data Sudah Disimpan
               </div>
             )}
             {activeUnit === 'ELEMENTARY' ? (
                <div className="w-full flex flex-col gap-4">
                  {/* Warning if not saved to Lumina */}
                  {!lastSaved || lastSaved.date !== selectedDate || lastSaved.classId !== selectedClass ? (
                    <div className="text-red-500 font-semibold text-xs bg-red-50 border border-red-100 px-4 py-2.5 rounded-xl self-stretch sm:self-end text-center sm:text-left">
                      Simpan data ke Lumina terlebih dahulu sebelum melakukan backup Google Sheets.
                    </div>
                  ) : null}

                  {/* Real-time backup progress information */}
                  {elementaryBackupJob && (
                    <div className="bg-gray-50 border border-gray-100 p-4 rounded-xl space-y-2 mt-2 w-full animate-in fade-in zoom-in-95 duration-200 text-left">
                      <div className="flex items-center justify-between text-sm font-bold text-gray-700">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
                          <span>Status Backup Google Sheets</span>
                        </div>
                        <span className="text-gray-400 uppercase tracking-wider text-[11px]">
                          {elementaryBackupJob.status}
                        </span>
                      </div>

                      <div className="text-xs text-gray-600 space-y-1">
                        {/* Status descriptions */}
                        {(elementaryBackupJob.status === 'IN_PROGRESS' || elementaryBackupJob.status === 'PREPARING') && (
                          <p className="font-semibold text-blue-600">
                            [{elementaryBackupJob.processedRows || 0}] dari [{elementaryBackupJob.totalRows || 0}] data dibackup.
                          </p>
                        )}
                        
                        {elementaryBackupJob.status === 'COMPLETED' && (
                          <p className="font-semibold text-emerald-600 flex items-center gap-1.5">
                            <CheckCircle2 size={14} />
                            Backup selesai: [{elementaryBackupJob.successRows || 0}] data tersimpan ke Google Sheets.
                          </p>
                        )}

                        {elementaryBackupJob.status === 'PARTIAL' && (
                          <div className="space-y-2">
                            <p className="font-semibold text-amber-600">
                              Backup selesai sebagian: [{elementaryBackupJob.successRows || 0}] berhasil, [{elementaryBackupJob.failedRows || 0}] perlu diulang.
                            </p>
                            <button
                              onClick={handleBackupElementaryGoogleSheets}
                              disabled={saving || backingUp}
                              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg transition-all"
                            >
                              Ulangi Data Gagal
                            </button>
                          </div>
                        )}

                        {elementaryBackupJob.status === 'RETRYING' && elementaryBackupJob.nextRetryAt && (
                          <p className="font-semibold text-purple-600">
                            Kuota Google sedang penuh. Sistem akan mencoba lagi pada {new Date(elementaryBackupJob.nextRetryAt).toLocaleTimeString()}.
                          </p>
                        )}

                        {elementaryBackupJob.status === 'FAILED' && (
                          <div className="space-y-1">
                            {elementaryBackupJob.lastErrorCode === 429 ? (
                              <p className="font-semibold text-red-600">
                                Kuota Google sedang penuh. Sistem akan mencoba lagi nanti.
                              </p>
                            ) : (
                              <p className="font-semibold text-red-600">
                                Backup gagal karena koneksi. Coba lagi saat jaringan stabil. (Detail: {elementaryBackupJob.lastErrorMessage || 'Koneksi terputus'})
                              </p>
                            )}
                            <button
                              onClick={handleBackupElementaryGoogleSheets}
                              disabled={saving || backingUp}
                              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-all mt-1"
                            >
                              Coba Lagi
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Display Link if spreadsheetUrl is available */}
                      {fileMap?.spreadsheetUrl && (
                        <div className="pt-2 border-t border-gray-100 flex justify-between items-center">
                          <a
                            href={fileMap.spreadsheetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 font-bold text-xs flex items-center gap-1 hover:underline"
                          >
                            <ExternalLink size={12} />
                            Buka Google Sheet ({fileMap.sheetName || 'Rekap'})
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Buttons controls */}
                  <div className="flex flex-col sm:flex-row justify-end items-stretch sm:items-center gap-3 w-full">
                    <button 
                      onClick={handleSaveFirestore}
                      disabled={saving || backingUp || (elementaryBackupJob && ['IN_PROGRESS', 'PREPARING', 'RETRYING'].includes(elementaryBackupJob.status))}
                      className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 py-3 rounded-xl shadow-xl shadow-blue-100 transition-all active:scale-95 disabled:opacity-50 w-full sm:w-auto"
                    >
                      {saving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
                      {saving ? 'Menyimpan...' : 'Simpan (Lumina)'}
                    </button>
                    <button 
                      onClick={handleBackupElementaryGoogleSheets}
                      disabled={saving || backingUp || !lastSaved || lastSaved.date !== selectedDate || lastSaved.classId !== selectedClass || (elementaryBackupJob && ['IN_PROGRESS', 'PREPARING', 'RETRYING'].includes(elementaryBackupJob.status))}
                      className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-8 py-3 rounded-xl shadow-xl shadow-emerald-100 transition-all active:scale-95 disabled:opacity-50 w-full sm:w-auto"
                    >
                      {backingUp || (elementaryBackupJob && ['IN_PROGRESS', 'PREPARING', 'RETRYING'].includes(elementaryBackupJob.status)) ? (
                        <>
                          <RefreshCw size={18} className="animate-spin" />
                          <span>Backup Berlangsung…</span>
                        </>
                      ) : (
                        <>
                          <ExternalLink size={18} />
                          <span>Back Up (Google Sheets)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
             ) : activeUnit === 'JUNIOR_HIGH' ? (
               attendanceType === 'DHUHUR' ? (
                 <>
                   <button 
                    onClick={handleSaveDhuhurFirestore}
                    disabled={saving || backingUp}
                    className="flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 text-white font-bold px-8 py-3 rounded-xl shadow-xl shadow-blue-100 transition-all active:scale-95 disabled:opacity-50 w-full sm:w-auto"
                   >
                      {saving ? <RefreshCw size={18} className="animate-spin" /> : (
                        <div className="flex items-center gap-1">
                          <Save size={18} />
                          <Mosque size={14} className="opacity-90" aria-label="Ikon Shalat Dhuhur" title="Ikon Shalat Dhuhur" />
                        </div>
                      )}
                      <span>{saving ? 'Menyimpan...' : 'Simpan Kehadiran Dhuhur'}</span>
                   </button>
                   <button 
                    onClick={handleBackupDhuhurGoogleSheets}
                     disabled={saving || backingUp}
                     className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 py-3 rounded-xl shadow-xl shadow-blue-100 transition-all active:scale-95 disabled:opacity-50 w-full sm:w-auto"
                   >
                      {backingUp ? <RefreshCw size={18} className="animate-spin" /> : (
                        <div className="flex items-center gap-1">
                          <ExternalLink size={18} />
                          <Mosque size={14} className="opacity-90" aria-label="Ikon Shalat Dhuhur" title="Ikon Shalat Dhuhur" />
                        </div>
                      )}
                      <span>{backingUp ? 'Mengekspor...' : 'Back Up Dhuhur (Google Sheets)'}</span>
                   </button>
                 </>
               ) : (
                 <>
                   <button 
                    onClick={handleSaveFirestore}
                     disabled={saving || backingUp}
                     className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 py-3 rounded-xl shadow-xl shadow-blue-100 transition-all active:scale-95 disabled:opacity-50 w-full sm:w-auto"
                   >
                      {saving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
                      {saving ? 'Menyimpan...' : 'Simpan (Lumina)'}
                   </button>
                   <button 
                    onClick={handleBackupGoogleSheets}
                    disabled={saving || backingUp}
                    className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-8 py-3 rounded-xl shadow-xl shadow-emerald-100 transition-all active:scale-95 disabled:opacity-50 w-full sm:w-auto"
                   >
                      {backingUp ? <RefreshCw size={18} className="animate-spin" /> : <ExternalLink size={18} />}
                      {backingUp ? 'Mengekspor...' : 'Back Up (Google Sheets)'}
                   </button>
                 </>
               )
             ) : (
               <button 
                onClick={handleSaveAll}
                disabled={saving}
                className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-10 py-3 rounded-xl shadow-xl shadow-blue-100 transition-all active:scale-95 disabled:opacity-50 w-full sm:w-auto"
               >
                  {saving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
                  {saving ? 'Menyimpan...' : 'Simpan Kehadiran Hari Ini'}
               </button>
             )}
          </div>
          )}
        </div>
      )}

      {view === 'RECAP' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-wrap items-center gap-6">
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Kelas</span>
              <select 
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-bold outline-none cursor-pointer hover:border-blue-300 transition-colors"
                disabled={loadingClasses}
              >
                <option value="">Pilih Kelas</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Mode Period Selector */}
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Periode</span>
              <div className="flex bg-gray-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => handleSwitchPeriodMode('MONTHLY')}
                  className={cn(
                    "px-3 py-1.5 text-xs font-bold rounded-lg transition-all",
                    recapPeriodMode === 'MONTHLY' ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  Bulanan
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchPeriodMode('RANGE')}
                  className={cn(
                    "px-3 py-1.5 text-xs font-bold rounded-lg transition-all",
                    recapPeriodMode === 'RANGE' ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  Rentang Tanggal
                </button>
              </div>
            </div>

            {recapPeriodMode === 'MONTHLY' ? (
              <>
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Bulan</span>
                  <select 
                    value={recapMonth}
                    onChange={(e) => setRecapMonth(e.target.value)}
                    className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-bold outline-none cursor-pointer hover:border-blue-300 transition-colors"
                  >
                    {['01','02','03','04','05','06','07','08','09','10','11','12'].map(m => (
                      <option key={m} value={m}>{new Date(2000, parseInt(m)-1).toLocaleString('id-ID', { month: 'long' })}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Tahun</span>
                  <select 
                    value={recapYear}
                    onChange={(e) => setRecapYear(e.target.value)}
                    className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-bold outline-none cursor-pointer hover:border-blue-300 transition-colors"
                  >
                    {[2024, 2025, 2026].map(y => (
                      <option key={y} value={y.toString()}>{y}</option>
                    ))}
                  </select>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Tanggal Mulai</span>
                  <input
                    type="date"
                    value={tempStartDate}
                    onChange={(e) => setTempStartDate(e.target.value)}
                    className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-bold outline-none hover:border-blue-300 transition-colors"
                  />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Tanggal Selesai</span>
                  <input
                    type="date"
                    value={tempEndDate}
                    onChange={(e) => setTempEndDate(e.target.value)}
                    className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-bold outline-none hover:border-blue-300 transition-colors"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleApplyRange}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-sm transition-all active:scale-95 cursor-pointer self-end h-[34px] flex items-center"
                >
                  Terapkan
                </button>
              </>
            )}

            {(activeUnit === 'JUNIOR_HIGH' || activeUnit === 'ELEMENTARY') && (fileMap?.spreadsheetId || fileMap?.spreadsheetUrl) && (
              <div className="ml-auto flex items-center">
                <a
                  href={fileMap.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${fileMap.spreadsheetId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-sm transition-colors cursor-pointer"
                >
                  <ExternalLink size={14} />
                  Buka Google Sheet
                </a>
              </div>
            )}
          </div>

          {recapRangeError && (
            <div className="bg-red-50 text-red-600 px-4 py-2.5 rounded-xl text-xs font-semibold border border-red-100 flex items-center gap-2">
              <AlertCircle size={14} />
              {recapRangeError}
            </div>
          )}

          {activeUnit === 'JUNIOR_HIGH' && attendanceType === 'DHUHUR' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <RecapCard title="Partisipasi Shalat" value={(loadingRecap || loading) ? 'Loading...' : (recapError || Object.keys(recapData).length === 0 || recapStats.attendanceRate === '—' ? '—' : `${recapStats.attendanceRate}%`)} icon={<CheckCircle2 className="text-green-600" />} />
              <RecapCard title="Shalat Berjamaah" value={(loadingRecap || loading) ? 'Loading...' : (recapError || Object.keys(recapData).length === 0 ? '—' : recapStats.hadir.toString())} icon={<CheckCircle2 className="text-emerald-500" />} />
              <RecapCard title="Berhalangan" value={(loadingRecap || loading) ? 'Loading...' : (recapError || Object.keys(recapData).length === 0 ? '—' : recapStats.late.toString())} icon={<AlertCircle className="text-amber-500" />} />
              <RecapCard title="Izin" value={(loadingRecap || loading) ? 'Loading...' : (recapError || Object.keys(recapData).length === 0 ? '—' : recapStats.izin.toString())} icon={<Clock className="text-blue-500" />} />
              <RecapCard title="Tidak Mengikuti" value={(loadingRecap || loading) ? 'Loading...' : (recapError || Object.keys(recapData).length === 0 ? '—' : recapStats.alpa.toString())} icon={<UserX className="text-red-600" />} />
            </div>
          ) : attendanceType === 'DHUHUR' ? (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <RecapCard title="Tingkat Tepat Waktu" value={loadingRecap ? 'Loading...' : (recapError || Object.keys(recapData).length === 0 || recapStats.attendanceRate === '—' ? '—' : `${recapStats.attendanceRate}%`)} icon={<CheckCircle2 className="text-green-600" />} />
              <RecapCard title="Total Hadir" value={loadingRecap ? 'Loading...' : (recapError || Object.keys(recapData).length === 0 ? '—' : recapStats.hadir.toString())} icon={<CheckCircle2 className="text-emerald-500" />} />
              <RecapCard title="Total Terlambat" value={loadingRecap ? 'Loading...' : (recapError || Object.keys(recapData).length === 0 ? '—' : recapStats.late.toString())} icon={<Clock className="text-orange-600" />} />
              <RecapCard title="Total Absen" value={loadingRecap ? 'Loading...' : (recapError || Object.keys(recapData).length === 0 ? '—' : recapStats.alpa.toString())} icon={<UserX className="text-red-600" />} />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              <RecapCard title="Tingkat Hadir" value={loadingRecap ? 'Loading...' : (recapError || Object.keys(recapData).length === 0 || recapStats.attendanceRate === '—' ? '—' : `${recapStats.attendanceRate}%`)} icon={<CheckCircle2 className="text-green-600" />} />
              <RecapCard title="Total Hadir" value={loadingRecap ? 'Loading...' : (recapError || Object.keys(recapData).length === 0 ? '—' : recapStats.hadir.toString())} icon={<CheckCircle2 className="text-emerald-500" />} />
              <RecapCard title="Total Sakit" value={loadingRecap ? 'Loading...' : (recapError || Object.keys(recapData).length === 0 ? '—' : recapStats.sakit.toString())} icon={<Clock className="text-blue-600" />} />
              <RecapCard title="Total Izin" value={loadingRecap ? 'Loading...' : (recapError || Object.keys(recapData).length === 0 ? '—' : recapStats.izin.toString())} icon={<AlertCircle className="text-yellow-600" />} />
              <RecapCard title="Total Alpa" value={loadingRecap ? 'Loading...' : (recapError || Object.keys(recapData).length === 0 ? '—' : recapStats.alpa.toString())} icon={<UserX className="text-red-600" />} />
              <RecapCard title="Total Terlambat" value={loadingRecap ? 'Loading...' : (recapError || Object.keys(recapData).length === 0 ? '—' : recapStats.late.toString())} icon={<Clock className="text-orange-500" />} />
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex flex-wrap justify-between items-center gap-4">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <BarChart3 size={18} className="text-blue-500" />
                {recapPeriodMode === 'MONTHLY' ? (
                  `Rekap ${new Date(parseInt(recapYear), parseInt(recapMonth)-1).toLocaleString('id-ID', { month: 'long', year: 'numeric' })} · ${classes.find(c => c.id === selectedClass)?.name || '-'}`
                ) : (
                  `Rekap ${recapStartDate ? new Date(recapStartDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'} – ${recapEndDate ? new Date(recapEndDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'} · ${classes.find(c => c.id === selectedClass)?.name || '-'}`
                )}
              </h3>
              <div className="flex bg-gray-100 p-1 rounded-xl">
                <button 
                  onClick={() => setRecapViewMode('SUMMARY')}
                  className={cn(
                    "px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
                    recapViewMode === 'SUMMARY' ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  Ringkasan Siswa
                </button>
                <button 
                  onClick={() => setRecapViewMode('MATRIX')}
                  className={cn(
                    "px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
                    recapViewMode === 'MATRIX' ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  Tabel Harian
                </button>
              </div>
              {attendanceType !== 'DHUHUR' && (
                <div className="flex flex-wrap gap-2">
                   <button 
                    onClick={() => attendanceSyncService.downloadPdfRecap(selectedClass, activeAcademicYear, activeSemester)}
                    className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-100 active:scale-95 transition-all"
                   >
                    Cetak (PDF)
                   </button>
                   <button 
                    onClick={() => handleCopySIA(false)}
                    disabled={!students || students.length === 0 || Object.keys(recapData).length === 0}
                    className="px-4 py-2 bg-blue-50 border border-blue-200 rounded-xl text-sm font-bold text-blue-600 hover:bg-blue-100 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                    title={(!students || students.length === 0 || Object.keys(recapData).length === 0) ? "Tidak ada data S/I/A yang dapat disalin" : "Salin data S/I/A tanpa baris header untuk langsung dipaste ke Google Sheets"}
                   >
                    <Copy size={16} />
                    Salin S / I / A untuk Google Sheets
                   </button>
                   <button 
                    onClick={() => handleCopySIA(true)}
                    disabled={!students || students.length === 0 || Object.keys(recapData).length === 0}
                    className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-100 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                    title={(!students || students.length === 0 || Object.keys(recapData).length === 0) ? "Tidak ada data S/I/A yang dapat disalin" : "Salin dengan baris header 'Sakit Izin Alfa'"}
                   >
                    <Copy size={16} />
                    Salin dengan Header
                   </button>
                </div>
              )}
            </div>
            
            <div className="overflow-x-auto">
              {recapError ? (
                <div className="p-12 text-center max-w-md mx-auto">
                  <div className="inline-flex p-3 bg-red-50 text-red-600 rounded-2xl mb-3">
                    <AlertCircle size={24} />
                  </div>
                  <h4 className="font-bold text-gray-900 text-sm mb-1">
                    {recapError === 'permission' ? 'Akses Ditolak' : 'Gagal Memuat Data'}
                  </h4>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    {recapError === 'permission' 
                      ? 'Anda tidak memiliki hak akses yang diperlukan untuk melihat rekap kehadiran kelas ini.'
                      : 'Terjadi kesalahan saat memproses data kehadiran. Silakan muat ulang halaman atau coba lagi nanti.'}
                  </p>
                </div>
              ) : (loadingRecap || loading) ? (
                <div className="px-6 py-12 text-center text-gray-400 font-medium">
                  <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-blue-500" />
                  Memuat data rekap...
                </div>
              ) : !selectedClass ? (
                <div className="px-6 py-12 text-center text-gray-400 font-medium">
                  Silakan pilih kelas terlebih dahulu untuk melihat rekap kehadiran.
                </div>
              ) : Object.keys(recapData).length === 0 ? (
                <div className="p-12 text-center max-w-sm mx-auto">
                  <div className="inline-flex p-3 bg-gray-50 text-gray-400 rounded-2xl mb-3">
                    <UserX size={24} />
                  </div>
                  <h4 className="font-bold text-gray-900 text-sm mb-1">Tidak Ada Data</h4>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    {attendanceType === 'DHUHUR'
                      ? 'Belum ada data Kehadiran Shalat Dhuhur tersimpan untuk kelas dan periode ini.'
                      : 'Tidak ditemukan catatan kehadiran untuk kelas dan periode yang Anda pilih.'}
                  </p>
                </div>
              ) : recapViewMode === 'SUMMARY' ? (
                <table className="w-full text-left">
                  <thead className="bg-gray-50/50 border-b border-gray-100">
                    {attendanceType === 'DHUHUR' ? (
                      <tr>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center w-16">No</th>
                        <th 
                          onClick={() => handleDhuhurSort('name')}
                          className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest cursor-pointer select-none hover:text-blue-600 transition-colors group"
                        >
                          <div className="flex items-center gap-1">
                            <span>Nama Siswa</span>
                            {dhuhurSortConfig.key === 'name' ? (
                              dhuhurSortConfig.direction === 'asc' ? <ArrowUp size={12} className="text-blue-600" /> : <ArrowDown size={12} className="text-blue-600" />
                            ) : (
                              <ArrowUpDown size={12} className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                            )}
                          </div>
                        </th>
                        <th 
                          onClick={() => handleDhuhurSort('hadir')}
                          className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center cursor-pointer select-none hover:text-blue-600 transition-colors group"
                        >
                          <div className="flex items-center justify-center gap-1">
                            <span>Hadir</span>
                            {dhuhurSortConfig.key === 'hadir' ? (
                              dhuhurSortConfig.direction === 'asc' ? <ArrowUp size={12} className="text-blue-600" /> : <ArrowDown size={12} className="text-blue-600" />
                            ) : (
                              <ArrowUpDown size={12} className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                            )}
                          </div>
                        </th>
                        <th 
                          onClick={() => handleDhuhurSort('late')}
                          className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center cursor-pointer select-none hover:text-blue-600 transition-colors group"
                        >
                          <div className="flex items-center justify-center gap-1">
                            <span>Terlambat</span>
                            {dhuhurSortConfig.key === 'late' ? (
                              dhuhurSortConfig.direction === 'asc' ? <ArrowUp size={12} className="text-blue-600" /> : <ArrowDown size={12} className="text-blue-600" />
                            ) : (
                              <ArrowUpDown size={12} className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                            )}
                          </div>
                        </th>
                        <th 
                          onClick={() => handleDhuhurSort('alpa')}
                          className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center cursor-pointer select-none hover:text-blue-600 transition-colors group"
                        >
                          <div className="flex items-center justify-center gap-1">
                            <span>Absen / Tidak Mengikuti</span>
                            {dhuhurSortConfig.key === 'alpa' ? (
                              dhuhurSortConfig.direction === 'asc' ? <ArrowUp size={12} className="text-blue-600" /> : <ArrowDown size={12} className="text-blue-600" />
                            ) : (
                              <ArrowUpDown size={12} className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                            )}
                          </div>
                        </th>
                        <th 
                          onClick={() => handleDhuhurSort('rate')}
                          className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center cursor-pointer select-none hover:text-blue-600 transition-colors group"
                        >
                          <div className="flex items-center justify-center gap-1">
                            <span>Kehadiran (%)</span>
                            {dhuhurSortConfig.key === 'rate' ? (
                              dhuhurSortConfig.direction === 'asc' ? <ArrowUp size={12} className="text-blue-600" /> : <ArrowDown size={12} className="text-blue-600" />
                            ) : (
                              <ArrowUpDown size={12} className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                            )}
                          </div>
                        </th>
                      </tr>
                    ) : (
                      <tr>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center w-16">No</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Nama Siswa</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center font-bold text-emerald-600">Hadir</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center font-bold text-blue-600">Sakit</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center font-bold text-yellow-600">Izin</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center font-bold text-red-600">Alpa</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center font-bold text-orange-600">Terlambat</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Kehadiran</th>
                      </tr>
                    )}
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {sortedStudentsForRecap.map((s, idx) => {
                      const stats = recapData[s.id] || { hadir: 0, sakit: 0, izin: 0, alpa: 0, late: 0 };
                      const studentTotal = attendanceType === 'DHUHUR' 
                        ? (stats.hadir + stats.late + stats.izin + stats.alpa)
                        : (stats.hadir + stats.sakit + stats.izin + stats.alpa + stats.late);
                      let studentRate = '—';
                      if (studentTotal > 0) {
                        studentRate = attendanceType === 'DHUHUR'
                          ? `${Math.round((stats.hadir / studentTotal) * 100)}%`
                          : `${Math.round(((stats.hadir + stats.late) / studentTotal) * 100)}%`;
                      }

                      return (
                        <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4 text-center font-bold text-xs text-gray-400">{idx + 1}</td>
                          <td className="px-6 py-4">
                            <p className="font-bold text-gray-900 text-sm">{s.name}</p>
                            <p className="text-[10px] text-gray-400 font-medium">#{s.id}</p>
                          </td>
                          {attendanceType === 'DHUHUR' ? (
                            <>
                              <td className="px-6 py-4 text-center">
                                <StatsBadge value={stats.hadir} color="green" />
                              </td>
                              <td className="px-6 py-4 text-center">
                                <StatsBadge value={stats.late} color="orange" />
                              </td>
                              <td className="px-6 py-4 text-center">
                                <StatsBadge value={stats.alpa} color="red" />
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-6 py-4 text-center">
                                <StatsBadge value={stats.hadir} color="green" />
                              </td>
                              <td className="px-6 py-4 text-center">
                                <StatsBadge value={stats.sakit} color="blue" />
                              </td>
                              <td className="px-6 py-4 text-center">
                                <StatsBadge value={stats.izin} color="yellow" />
                              </td>
                              <td className="px-6 py-4 text-center">
                                <StatsBadge value={stats.alpa} color="red" />
                              </td>
                              <td className="px-6 py-4 text-center">
                                <StatsBadge value={stats.late} color="orange" />
                              </td>
                            </>
                          )}
                          <td className="px-6 py-4 text-center font-black text-sm text-blue-600">
                            {studentRate}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="relative">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50/50 border-b border-gray-100">
                      <tr>
                        <th className="sticky left-0 z-10 bg-gray-50 px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-r border-gray-100 min-w-[200px]">
                          Nama Siswa
                        </th>
                        {datesToRender.map(item => (
                          <th key={item.dateStr} className="px-3 py-4 text-[10px] font-bold text-gray-400 text-center border-r border-gray-50 min-w-[40px]" title={item.dateStr}>
                            {item.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {students.map((s) => {
                        const studentMatrix = recapMatrix[s.id] || {};
                        
                        return (
                          <tr key={s.id} className="hover:bg-gray-50/30 transition-colors">
                            <td className="sticky left-0 z-10 bg-white px-6 py-3 border-r border-gray-100 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                              <p className="font-bold text-gray-900 text-xs truncate max-w-[150px]">{s.name}</p>
                            </td>
                            {datesToRender.map(item => {
                              const status = studentMatrix[item.dateStr];
                              
                              let symbol = '-';
                              let colorClass = 'text-gray-200';
                              
                              if (attendanceType === 'DHUHUR') {
                                if (status === 'H' || status === 'SALAT_BERJAMAAH' || status === 'SHALAT_BERJAMAAH') { 
                                  symbol = 'H'; 
                                  colorClass = 'text-emerald-600 font-black'; 
                                } else if (status === 'T' || status === 'BERHALANGAN' || status === 'BERHALANGAN_SHALAT' || status === 'TERLAMBAT') { 
                                  symbol = 'T'; 
                                  colorClass = 'text-orange-500 font-black'; 
                                } else if (status === 'I' || status === 'IZIN') { 
                                  symbol = 'I'; 
                                  colorClass = 'text-blue-500 font-black'; 
                                } else if (status === 'A' || status === 'TIDAK_MENGIKUTI' || status === 'ALPA') { 
                                  symbol = 'A'; 
                                  colorClass = 'text-red-600 font-black'; 
                                } else if (status === 'TIDAK_BERLAKU') {
                                  symbol = '-';
                                  colorClass = 'text-gray-300 font-normal';
                                }
                              } else {
                                if (status === 'HADIR') { symbol = 'H'; colorClass = 'text-green-600 font-black'; }
                                else if (status === 'SAKIT') { symbol = 'S'; colorClass = 'text-blue-600 font-black'; }
                                else if (status === 'IZIN') { symbol = 'I'; colorClass = 'text-yellow-600 font-black'; }
                                else if (status === 'ALPA') { symbol = 'A'; colorClass = 'text-red-600 font-black'; }
                                else if (status === 'LATE') { symbol = 'T'; colorClass = 'text-orange-500 font-black'; }
                              }

                              return (
                                <td key={item.dateStr} className={cn("px-3 py-3 text-center text-xs border-r border-gray-50", colorClass)}>
                                  {symbol}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {view === 'ALERTS' && (
        <div className="space-y-6">
           <div className="bg-red-50 border border-red-100 p-6 rounded-3xl flex items-start gap-4">
              <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center text-red-600 shrink-0">
                 <Settings2 size={24} />
              </div>
              <div className="space-y-2">
                 <h3 className="font-bold text-red-900">Konfigurasi Threshold Risiko</h3>
                 <p className="text-sm text-red-800 opacity-80">
                   Tentukan jumlah ketidakhadiran (Sakit/Alpa) dalam satu bulan yang akan men-trigger status RISIKO TINGGI untuk eskalasi MTSS.
                 </p>
                 <div className="flex items-center gap-4 pt-2">
                    <input 
                      type="range" min="1" max="10" step="1" 
                      value={threshold} 
                      onChange={(e) => setThreshold(parseInt(e.target.value))}
                      className="accent-red-600 h-2 bg-red-200 rounded-lg cursor-pointer" 
                    />
                    <span className="font-bold text-red-600">{threshold} Hari/Bulan</span>
                 </div>
              </div>
           </div>

           <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 space-y-6">
                 <h3 className="font-bold text-gray-900 flex items-center gap-2">
                    <Bell size={18} className="text-orange-500" />
                    Siswa dengan Kehadiran Rendah
                 </h3>
                 <div className="space-y-3">
                    {students.filter(s => s.absencesThisMonth >= threshold).map(s => (
                      <div key={s.id} className="p-4 bg-red-50/50 rounded-2xl border border-red-100 flex justify-between items-center group hover:bg-red-50 transition-all">
                        <div className="flex items-center gap-3">
                           <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center font-bold text-xs">
                              {s.name[0]}
                           </div>
                           <div>
                              <p className="text-sm font-bold text-gray-900">{s.name}</p>
                              <p className="text-[10px] text-red-600 font-bold uppercase tracking-widest">{s.absencesThisMonth} Hari Absen</p>
                           </div>
                        </div>
                        <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-red-600 border border-red-200 rounded-lg text-[10px] font-bold hover:bg-red-600 hover:text-white transition-all shadow-sm">
                           Eskalasi ke MTSS
                           <ChevronRight size={12} />
                        </button>
                      </div>
                    ))}
                 </div>
              </div>

              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-4">
                 <h3 className="font-bold text-gray-900 flex items-center gap-2">
                    <MessageSquare size={18} className="text-blue-500" />
                    Ringkasan Otomatis Orang Tua
                 </h3>
                 <p className="text-xs text-gray-500 leading-relaxed italic">
                   "Lumina akan secara otomatis mengirimkan notifikasi ke aplikasi orang tua apabila siswa tidak hadir tanpa keterangan (ALPA) saat jam masuk pertama."
                 </p>
                 <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 space-y-3">
                    <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Preview Pesan</p>
                    <div className="bg-white p-3 rounded-xl shadow-sm border border-blue-50 text-xs text-gray-600 leading-relaxed">
                      "Pemberitahuan Lumina: Ananda <strong>[Nama Siswa]</strong> belum tercatat hadir di sekolah hingga pukul 08:30 WIB tanpa keterangan sebelumnya. Mohon segera konfirmasi melalui portal Lumina atau hubungi sekolah."
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}

function StatsBadge({ value, color }: { value: number; color: 'green' | 'blue' | 'yellow' | 'red' | 'orange' }) {
  const colors = {
    green: 'bg-green-50 text-green-700 border-green-100',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-100',
    red: 'bg-red-50 text-red-700 border-red-100',
    orange: 'bg-orange-50 text-orange-700 border-orange-100',
  };
  
  return (
    <span className={cn(
      "inline-flex items-center justify-center w-8 h-8 rounded-lg border font-bold text-xs",
      colors[color],
      value === 0 && "opacity-30 border-transparent bg-transparent text-gray-300"
    )}>
      {value}
    </span>
  );
}

function ViewButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "px-6 py-2 rounded-lg text-sm font-bold transition-all",
        active ? "bg-white text-blue-600 shadow-sm" : "text-gray-400 hover:text-gray-600"
      )}
    >
      {label}
    </button>
  );
}

function StatusBtn({ active, type, onClick }: { active: boolean; type: AttendanceStatus; onClick: () => void }) {
  if (type === 'LATE') return null;

  const colors = {
    HADIR: active ? 'bg-green-500 text-white shadow-lg' : 'text-gray-400 hover:bg-green-50 hover:text-green-500',
    SAKIT: active ? 'bg-blue-500 text-white shadow-lg' : 'text-gray-400 hover:bg-blue-50 hover:text-blue-500',
    IZIN: active ? 'bg-yellow-500 text-white shadow-lg' : 'text-gray-400 hover:bg-yellow-50 hover:text-yellow-500',
    ALPA: active ? 'bg-red-500 text-white shadow-lg' : 'text-gray-400 hover:bg-red-50 hover:text-red-500',
    LATE: '', // Hidden anyway
  };

  return (
    <button 
      onClick={onClick}
      title={type}
      className={cn(
        "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
        colors[type]
      )}
    >
      <span className="text-[10px] font-black">{type[0]}</span>
    </button>
  );
}

function StatusBtnDhuhur({ active, type, label, title, onClick }: { active: boolean; type: 'H' | 'T' | 'A'; label: string; title: string; onClick: () => void }) {
  const colors = {
    H: active ? 'bg-green-500 text-white shadow-lg' : 'text-gray-400 hover:bg-green-50 hover:text-green-500',
    T: active ? 'bg-orange-500 text-white shadow-lg' : 'text-gray-400 hover:bg-orange-50 hover:text-orange-500',
    A: active ? 'bg-red-500 text-white shadow-lg' : 'text-gray-400 hover:bg-red-50 hover:text-red-500',
  };

  return (
    <button 
      onClick={onClick}
      title={title}
      className={cn(
        "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
        colors[type]
      )}
    >
      <span className="text-[10px] font-black">{label}</span>
    </button>
  );
}

function RecapCard({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  const isLoading = value === 'Loading...';
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
      <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{title}</p>
        {isLoading ? (
          <div className="h-6 w-16 bg-gray-200 animate-pulse rounded mt-1" />
        ) : (
          <p className="text-xl font-bold text-gray-900 truncate">{value}</p>
        )}
      </div>
    </div>
  );
}

function Stats({ label, value, color }: { label: string; value: string; color: string }) {
  const bgColors = {
    green: 'bg-green-50 border-green-100 text-green-700',
    blue: 'bg-blue-50 border-blue-100 text-blue-700',
    red: 'bg-red-50 border-red-100 text-red-700',
  };
  return (
    <div className={cn("px-3 py-1 rounded-lg border flex items-center gap-2", (bgColors as any)[color])}>
      <span className="text-[10px] font-black">{label}:</span>
      <span className="text-sm font-bold">{value}</span>
    </div>
  );
}
