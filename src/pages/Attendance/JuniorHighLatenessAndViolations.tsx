import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Clock, AlertCircle, Calendar, Search, Save, History, TrendingUp, 
  Loader2, Trash2, Check, X, Edit2, ClipboardList, BarChart3, 
  User, BookOpen, ArrowUpRight, ShieldAlert, Filter, CheckCircle2, 
  Info, Settings, Plus, LayoutDashboard, ChevronRight
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { db, getActiveStudents } from '../../lib/firebase';
import { 
  collection, query, where, getDocs, doc, setDoc, 
  serverTimestamp, deleteDoc, onSnapshot, updateDoc, addDoc 
} from 'firebase/firestore';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'sonner';
import { useOutletContext, useSearchParams, useNavigate } from 'react-router-dom';
import { UnitType } from '../../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// Default reasons for lateness
const JUNIOR_HIGH_REASONS = [
  'Macet',
  'Bangun kesiangan',
  'Menunggu anggota keluarga',
  'Sakit perut',
  'Hujan'
];

// Helper to get JKT current time
const getCurrentTimeStr = () => {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  return formatter.format(new Date());
};

// Helper to get JKT current date in YYYY-MM-DD
const getCurrentDateStr = () => {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(new Date());
};

const getFormattedDateLong = (dateStr: string) => {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
};

export default function JuniorHighLatenessAndViolations() {
  const navigate = useNavigate();
  const [searchParams, setSearchParamsState] = useSearchParams();
  const { activeUnit } = useOutletContext<{ activeUnit: UnitType }>();
  const { activeYear, activeSemester } = useAcademicYear();
  const { profile } = useAuth();

  // Role permissions
  const currentUserRole = profile?.role || 'GUEST';
  const isStudentOrParent = ['STUDENT', 'PARENT'].includes(currentUserRole);

  // Active Tab: 'lateness' | 'violations' | 'rekap'
  const [activeTab, setActiveTab] = React.useState<'lateness' | 'violations' | 'rekap'>('lateness');

  // Master Data State
  const [classes, setClasses] = React.useState<any[]>([]);
  const [students, setStudents] = React.useState<any[]>([]);
  const [loadingClasses, setLoadingClasses] = React.useState(true);
  const loadingMetadata = loadingClasses;

  // Common selected date & class
  const [selectedClassId, setSelectedClassId] = React.useState<string>(searchParams.get('classId') || '');

  // ----------------------------------------------------
  // TAB 1: KETERLAMBATAN (Tardiness existing)
  // ----------------------------------------------------
  const [latenessRecords, setLatenessRecords] = React.useState<any[]>([]);
  const [latenessClassStudents, setLatenessClassStudents] = React.useState<any[]>([]);
  const [latenessTodaySaved, setLatenessTodaySaved] = React.useState<any[]>([]);
  const [latenessDate, setLatenessDate] = React.useState<string>(getCurrentDateStr());
  const [latenessSearch, setLatenessSearch] = React.useState('');
  const [savingLateness, setSavingLateness] = React.useState(false);
  const [loadingLateness, setLoadingLateness] = React.useState(false);
  const [loadingTodayLateness, setLoadingTodayLateness] = React.useState(false);
  const [highlightedStudentId, setHighlightedStudentId] = React.useState<string | null>(null);
  
  // Custom reasons for current unsaved entries
  const [latenessCustomReasons, setLatenessCustomReasons] = React.useState<Record<string, boolean>>({});

  // Inline edit states for saved lateness
  const [editingLatenessId, setEditingLatenessId] = React.useState<string | null>(null);
  const [editingLatenessReason, setEditingLatenessReason] = React.useState('');
  const [editingLatenessCustom, setEditingLatenessCustom] = React.useState(false);
  const [updatingLatenessId, setUpdatingLatenessId] = React.useState<string | null>(null);

  // Stats
  const [mostFrequentDay, setMostFrequentDay] = React.useState('-');
  const [avgLateMinutes, setAvgLateMinutes] = React.useState('-');

  // ----------------------------------------------------
  // TAB 2: PELANGGARAN RINGAN
  // ----------------------------------------------------
  const [violationDate, setViolationDate] = React.useState<string>(getCurrentDateStr());
  const [selectedViolationStudentId, setSelectedViolationStudentId] = React.useState('');
  const [violationType, setViolationType] = React.useState('');
  const [violationNotes, setViolationNotes] = React.useState('');
  const [savingViolation, setSavingViolation] = React.useState(false);
  const [loadingTodayViolations, setLoadingTodayViolations] = React.useState(false);
  const [todayViolations, setTodayViolations] = React.useState<any[]>([]);
  const [violationSearch, setViolationSearch] = React.useState('');
  const [violationClassFilter, setViolationClassFilter] = React.useState('');
  const [studentSearchInput, setStudentSearchInput] = React.useState('');
  const [showStudentDropdown, setShowStudentDropdown] = React.useState(false);

  // Inline edit states for saved violations
  const [editingViolationId, setEditingViolationId] = React.useState<string | null>(null);
  const [editingViolationType, setEditingViolationType] = React.useState('');
  const [editingViolationNotes, setEditingViolationNotes] = React.useState('');
  const [updatingViolationId, setUpdatingViolationId] = React.useState<string | null>(null);

  // ----------------------------------------------------
  // TAB 3: RECAP & LEADERBOARD
  // ----------------------------------------------------
  const [rekapStartDate, setRekapStartDate] = React.useState<string>(() => {
    // Start of current week (Monday)
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(today.setDate(diff));
    return monday.toISOString().split('T')[0];
  });
  const [rekapEndDate, setRekapEndDate] = React.useState<string>(getCurrentDateStr());
  const [rekapClassFilter, setRekapClassFilter] = React.useState('all');
  const [rekapDataType, setRekapDataType] = React.useState<'all' | 'lateness' | 'violations'>('all');
  const [rekapAcademicYear, setRekapAcademicYear] = React.useState(activeYear || '');
  const [rekapSemester, setRekapSemester] = React.useState(activeSemester || 1);
  const [loadingRekap, setLoadingRekap] = React.useState(false);
  const [rekapLatenessData, setRekapLatenessData] = React.useState<any[]>([]);
  const [rekapViolationData, setRekapViolationData] = React.useState<any[]>([]);
  const [rekapError, setRekapError] = React.useState<string | null>(null);

  // Sync rekapAcademicYear & rekapSemester with activeYear & activeSemester
  React.useEffect(() => {
    if (activeYear) setRekapAcademicYear(activeYear);
    if (activeSemester) setRekapSemester(activeSemester);
  }, [activeYear, activeSemester]);

  // Selected student timeline modal
  const [selectedTimelineStudent, setSelectedTimelineStudent] = React.useState<any | null>(null);
  const [studentTimeline, setStudentTimeline] = React.useState<any[]>([]);
  const [loadingTimeline, setLoadingTimeline] = React.useState(false);

  // ----------------------------------------------------
  // INITIAL LOAD & CONFIG SEEDING
  // ----------------------------------------------------
  const classesCacheRef = React.useRef<Map<string, any[]>>(new Map());

  // Dedicated function to fetch Junior High active classes for a specific academic year
  const getActiveJuniorHighClasses = React.useCallback(async (academicYear: string) => {
    const cacheKey = `unit:JUNIOR_HIGH,academicYear:${academicYear}`;
    if (classesCacheRef.current.has(cacheKey)) {
      return classesCacheRef.current.get(cacheKey) || [];
    }

    const q = query(
      collection(db, 'classes'),
      where('unitId', '==', 'JUNIOR_HIGH'),
      where('academicYear', '==', academicYear)
    );
    const snap = await getDocs(q);
    const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
    
    // Sort classes alphabetically
    list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    // status aktif bila field status tersedia
    const filteredList = list.filter((c: any) => {
      if (c.status !== undefined) {
        return c.status === 'active' || c.status === true;
      }
      if (c.active !== undefined) {
        return c.active === true;
      }
      return true;
    });

    classesCacheRef.current.set(cacheKey, filteredList);
    return filteredList;
  }, []);

  // Hook/Effect triggered when activeYear changes
  React.useEffect(() => {
    let isMounted = true;
    async function loadYearClasses() {
      if (!activeYear) return;
      
      // 1. Kosongkan class list lama
      setClasses([]);
      // 2. Tampilkan loading pada dropdown
      setLoadingClasses(true);
      // 4. Set class filter ke 'all'
      setRekapClassFilter('all');

      try {
        // 3. Ambil kelas untuk tahun baru
        const classesList = await getActiveJuniorHighClasses(activeYear);
        
        if (isMounted) {
          setClasses(classesList);
          
          // Bersihkan selectedClassId jika tidak ada lagi pada daftar kelas periode aktif
          if (selectedClassId && !classesList.some(c => c.id === selectedClassId)) {
            setSelectedClassId(classesList[0]?.id || '');
          } else if (!selectedClassId && classesList.length > 0) {
            setSelectedClassId(classesList[0].id);
          }

          setLoadingClasses(false);
        }
      } catch (err) {
        console.error('Error loading academic year classes:', err);
        if (isMounted) {
          setLoadingClasses(false);
          toast.error(`Gagal memuat kelas untuk tahun ajaran ${activeYear}.`);
        }
      }
    }

    loadYearClasses();
    return () => { isMounted = false; };
  }, [activeYear, getActiveJuniorHighClasses]);

  // Whenever selectedClassId changes, fetch students list
  React.useEffect(() => {
    if (!selectedClassId) return;
    
    let isMounted = true;
    async function loadStudents() {
      try {
        const fetchedS = await getActiveStudents(selectedClassId, activeYear);
        if (isMounted) {
          const mappedS = fetchedS.map(s => ({
            id: s.id,
            name: s.name,
            nickname: s.nickname || (s as any).panggilan || (s as any).nicknameStr || ''
          }));
          mappedS.sort((a, b) => a.name.localeCompare(b.name));
          setStudents(mappedS);
          
          // Clear active student in violation form when class changes
          setSelectedViolationStudentId('');
          setStudentSearchInput('');
        }
      } catch (err) {
        console.warn('Failed to load active students:', err);
      }
    }
    loadStudents();
    return () => { isMounted = false; };
  }, [selectedClassId, activeYear]);

  // ----------------------------------------------------
  // TAB 1: LATENESS LISTENERS & ACTIONS
  // ----------------------------------------------------
  // Load monthly lateness stats for records
  React.useEffect(() => {
    if (!selectedClassId) return;

    // We fetch current month's lateness count for each student
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0,0,0,0);
    const startStr = startOfMonth.toISOString().split('T')[0];

    const q = query(
      collection(db, 'lateness_records'),
      where('classId', '==', selectedClassId),
      where('date', '>=', startStr)
    );

    const unsub = onSnapshot(q, (snap) => {
      const counts: Record<string, number> = {};
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.studentId) {
          counts[data.studentId] = (counts[data.studentId] || 0) + 1;
        }
      });

      // Map to classStudentsList
      const rosterList = students.map(s => ({
        id: s.id,
        name: s.name,
        nickname: s.nickname,
        arrivalTime: '',
        reason: '',
        parentNote: false,
        countThisMonth: counts[s.id] || 0,
        classId: selectedClassId,
        className: classes.find(c => c.id === selectedClassId)?.name || ''
      }));

      setLatenessClassStudents(rosterList);
    });

    return unsub;
  }, [selectedClassId, students, classes]);

  // Load Lateness Records saved for selected date
  React.useEffect(() => {
    setLoadingTodayLateness(true);
    const q = query(
      collection(db, 'lateness_records'),
      where('date', '==', latenessDate),
      where('classId', '==', selectedClassId)
    );

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      list.sort((a, b) => {
        const timeA = a.arrivalTime || '00:00';
        const timeB = b.arrivalTime || '00:00';
        return timeB.localeCompare(timeA);
      });
      setLatenessTodaySaved(list);
      setLoadingTodayLateness(false);
    }, (err) => {
      console.error(err);
      setLoadingTodayLateness(false);
    });

    return unsub;
  }, [selectedClassId, latenessDate]);

  // Load pattern analysis stats for side bar
  React.useEffect(() => {
    if (!selectedClassId) return;
    
    const q = query(
      collection(db, 'lateness_records'),
      where('classId', '==', selectedClassId)
    );

    const unsub = onSnapshot(q, (snap) => {
      if (snap.empty) {
        setMostFrequentDay('-');
        setAvgLateMinutes('-');
        return;
      }

      const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
      const dayCounts: Record<string, number> = {};
      let totalMinutes = 0;
      let lateRecordsCount = 0;

      snap.docs.forEach(doc => {
        const data = doc.data();
        if (data.date) {
          const d = new Date(data.date);
          const dayName = days[d.getDay()];
          dayCounts[dayName] = (dayCounts[dayName] || 0) + 1;
        }
        
        // Calculate minutes late relative to 07:30 JKT threshold
        if (data.arrivalTime) {
          const [h, m] = data.arrivalTime.split(':').map(Number);
          const arrivalMin = h * 60 + m;
          const limitMin = 7 * 60 + 30; // 07:30
          if (arrivalMin > limitMin) {
            totalMinutes += (arrivalMin - limitMin);
            lateRecordsCount++;
          }
        }
      });

      // Most frequent day
      let maxDay = '-';
      let maxCount = 0;
      Object.entries(dayCounts).forEach(([day, count]) => {
        if (count > maxCount) {
          maxCount = count;
          maxDay = day;
        }
      });

      setMostFrequentDay(maxDay !== '-' ? `${maxDay} (${maxCount}x)` : '-');
      setAvgLateMinutes(lateRecordsCount > 0 ? `${Math.round(totalMinutes / lateRecordsCount)} menit` : '0 menit');
    });

    return unsub;
  }, [selectedClassId]);

  // Update lateness input state for a student
  const updateLatenessTime = (studentId: string, val: string) => {
    setLatenessClassStudents(prev => prev.map(s => s.id === studentId ? { ...s, arrivalTime: val } : s));
  };

  const updateLatenessReason = (studentId: string, val: string) => {
    setLatenessClassStudents(prev => prev.map(s => s.id === studentId ? { ...s, reason: val } : s));
  };

  const removeLatenessDraft = (studentId: string) => {
    setLatenessClassStudents(prev => prev.map(s => s.id === studentId ? { ...s, arrivalTime: '', reason: '' } : s));
  };

  // Save lateness logs
  const handleSaveLateness = async () => {
    const toSave = latenessClassStudents.filter(s => s.arrivalTime !== '');
    if (toSave.length === 0) {
      toast.error('Harap masukkan minimal satu waktu tiba siswa.');
      return;
    }

    setSavingLateness(true);
    try {
      const selectedClassObj = classes.find(c => c.id === selectedClassId);
      const className = selectedClassObj?.name || 'Kelas Lain';

      const promises = toSave.map(async (record) => {
        const recordId = `${latenessDate}_${record.id}`;
        await setDoc(doc(db, 'lateness_records', recordId), {
          studentId: record.id,
          studentName: record.name,
          classId: selectedClassId,
          className: className,
          date: latenessDate,
          arrivalTime: record.arrivalTime,
          reason: record.reason || '',
          parentNote: false,
          recordedAt: serverTimestamp(),
          academicYear: activeYear,
          semester: activeSemester,
          unitId: 'JUNIOR_HIGH'
        });
      });

      await Promise.all(promises);
      toast.success(`Berhasil menyimpan ${toSave.length} catatan keterlambatan & notifikasi terkirim.`);
      
      // Clear draft forms
      setLatenessClassStudents(prev => prev.map(s => ({ ...s, arrivalTime: '', reason: '' })));
      setLatenessCustomReasons({});
    } catch (err) {
      console.error(err);
      toast.error('Gagal menyimpan data keterlambatan.');
    } finally {
      setSavingLateness(false);
    }
  };

  // Update saved reason
  const handleUpdateSavedLatenessReason = async (recordId: string) => {
    setUpdatingLatenessId(recordId);
    try {
      await updateDoc(doc(db, 'lateness_records', recordId), {
        reason: editingLatenessReason,
        updatedAt: serverTimestamp()
      });
      toast.success('Alasan keterlambatan berhasil diperbarui.');
      setEditingLatenessId(null);
    } catch (err) {
      console.error(err);
      toast.error('Gagal memperbarui alasan.');
    } finally {
      setUpdatingLatenessId(null);
    }
  };

  const handleDeleteSavedLateness = async (id: string) => {
    if (window.confirm('Apakah Anda yakin ingin menghapus data keterlambatan ini?')) {
      try {
        await deleteDoc(doc(db, 'lateness_records', id));
        toast.success('Catatan keterlambatan berhasil dihapus.');
      } catch (err) {
        console.error(err);
        toast.error('Gagal menghapus data.');
      }
    }
  };

  // ----------------------------------------------------
  // TAB 2: PELANGGARAN RINGAN ACTIONS
  // ----------------------------------------------------
  // Load today's saved violations
  React.useEffect(() => {
    setLoadingTodayViolations(true);
    const q = query(
      collection(db, 'minor_violations'),
      where('date', '==', violationDate),
      where('unit', '==', 'JUNIOR_HIGH')
    );

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      list.sort((a, b) => {
        const timeA = a.createdAt?.toMillis?.() || 0;
        const timeB = b.createdAt?.toMillis?.() || 0;
        return timeB - timeA;
      });
      setTodayViolations(list);
      setLoadingTodayViolations(false);
    }, (err) => {
      console.error(err);
      setLoadingTodayViolations(false);
    });

    return unsub;
  }, [violationDate]);

  // Save new violation
  const handleSaveViolation = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedViolationStudentId) {
      toast.error('Pilih siswa terlebih dahulu.');
      return;
    }
    if (!violationType.trim()) {
      toast.error('Isi jenis pelanggaran terlebih dahulu.');
      return;
    }

    setSavingViolation(true);
    try {
      const studentObj = students.find(s => s.id === selectedViolationStudentId);
      const classObj = classes.find(c => c.id === selectedClassId);

      if (!studentObj) {
        toast.error('Siswa tidak ditemukan.');
        setSavingViolation(false);
        return;
      }

      const payload = {
        unit: 'JUNIOR_HIGH',
        studentId: studentObj.id,
        studentName: studentObj.name,
        classId: selectedClassId,
        className: classObj?.name || 'Kelas Lain',
        date: violationDate,
        violationType: violationType.trim(),
        notes: violationNotes.trim(),
        recordedByUid: profile?.uid || 'system',
        recordedByName: profile?.displayName || 'Guru / Staff',
        createdAt: new Date(), // Local fallback for instant sync
        updatedAt: new Date(),
        academicYear: activeYear,
        semester: activeSemester
      };

      // Add to Firestore (let Firestore generate document ID)
      await addDoc(collection(db, 'minor_violations'), {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      toast.success('Catatan pelanggaran ringan berhasil disimpan.');

      // Reset student selection and inputs, KEEP date and class
      setSelectedViolationStudentId('');
      setStudentSearchInput('');
      setViolationType('');
      setViolationNotes('');
    } catch (err) {
      console.error('Error saving minor violation:', err);
      toast.error('Gagal menyimpan catatan pelanggaran ringan.');
    } finally {
      setSavingViolation(false);
    }
  };

  // Update minor violation
  const handleUpdateViolation = async (violationId: string) => {
    if (!editingViolationType.trim()) {
      toast.error('Jenis pelanggaran wajib diisi.');
      return;
    }
    setUpdatingViolationId(violationId);
    try {
      await updateDoc(doc(db, 'minor_violations', violationId), {
        violationType: editingViolationType.trim(),
        notes: editingViolationNotes,
        updatedAt: serverTimestamp()
      });
      toast.success('Catatan pelanggaran ringan berhasil diperbarui.');
      setEditingViolationId(null);
    } catch (err) {
      console.error(err);
      toast.error('Gagal memperbarui catatan.');
    } finally {
      setUpdatingViolationId(null);
    }
  };

  // Delete minor violation
  const handleDeleteViolation = async (violationId: string) => {
    if (window.confirm('Apakah Anda yakin ingin menghapus catatan pelanggaran ringan ini?')) {
      try {
        await deleteDoc(doc(db, 'minor_violations', violationId));
        toast.success('Catatan pelanggaran ringan berhasil dihapus.');
      } catch (err) {
        console.error(err);
        toast.error('Gagal menghapus catatan.');
      }
    }
  };

  // Search filtered violations for table
  const filteredViolationsList = React.useMemo(() => {
    return todayViolations.filter(v => {
      const matchClass = violationClassFilter ? v.classId === violationClassFilter : true;
      const matchSearch = violationSearch 
        ? (v.studentName || '').toLowerCase().includes(violationSearch.toLowerCase()) 
        : true;
      return matchClass && matchSearch;
    });
  }, [todayViolations, violationClassFilter, violationSearch]);

  // Sidebar Today Violation statistics
  const violationTodayStats = React.useMemo(() => {
    const total = todayViolations.length;
    const uniqueStudents = new Set(todayViolations.map(v => v.studentId)).size;
    
    // Most frequent violation type today
    const typeCounts: Record<string, number> = {};
    const originalLabels: Record<string, string> = {}; // to preserve original casing

    todayViolations.forEach(v => {
      const typeStr = (v.violationType || '').trim();
      if (typeStr) {
        const normalized = typeStr.toLowerCase();
        typeCounts[normalized] = (typeCounts[normalized] || 0) + 1;
        if (!originalLabels[normalized]) {
          originalLabels[normalized] = typeStr;
        }
      }
    });

    let mostFreqType = '-';
    let maxCount = 0;
    Object.entries(typeCounts).forEach(([norm, count]) => {
      if (count > maxCount) {
        maxCount = count;
        mostFreqType = originalLabels[norm];
      }
    });

    return {
      total,
      uniqueStudents,
      mostFreqType: mostFreqType !== '-' ? `${mostFreqType} (${maxCount}x)` : '-'
    };
  }, [todayViolations]);

  // ----------------------------------------------------
  // TAB 3: RECAP & LEADERBOARD LOGIC
  // ----------------------------------------------------
  const normalizeTardinessRecord = React.useCallback((r: any) => {
    // Normalize date to YYYY-MM-DD
    let normDate = '';
    const rawDate = r.date || r.attendanceDate || r.recordDate || r.createdAt;
    if (rawDate) {
      if (typeof rawDate === 'string') {
        if (rawDate.includes('-')) {
          normDate = rawDate.split('T')[0];
        } else if (rawDate.includes('/')) {
          const parts = rawDate.split('/');
          if (parts[0].length === 4) {
            normDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
          } else {
            normDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          }
        }
      } else if (rawDate.seconds !== undefined && rawDate.nanoseconds !== undefined) {
        // Firestore Timestamp
        const d = new Date(rawDate.seconds * 1000);
        const formatter = new Intl.DateTimeFormat('sv-SE', {
          timeZone: 'Asia/Jakarta',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        normDate = formatter.format(d);
      } else if (rawDate instanceof Date) {
        const formatter = new Intl.DateTimeFormat('sv-SE', {
          timeZone: 'Asia/Jakarta',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        normDate = formatter.format(rawDate);
      }
    }

    if (!normDate) {
      normDate = getCurrentDateStr();
    }

    const studentId = r.studentId || '';
    const studentName = r.studentName || r.name || 'Siswa';
    const classId = r.classId || '';
    const className = r.className || r.class || 'Kelas Lain';
    const arrivalTime = r.arrivalTime || r.time || r.arrivalAt || '00:00';
    const reason = r.reason || r.notes || r.description || '';
    const unitId = r.unitId || r.unit || '';

    return {
      id: r.id || '',
      studentId,
      studentName,
      classId,
      className,
      date: normDate,
      arrivalTime,
      reason,
      academicYear: r.academicYear,
      semester: r.semester ? Number(r.semester) : undefined,
      unitId
    };
  }, []);

  const isJuniorHighRecord = React.useCallback((r: any, classesList: any[]) => {
    // 1. If explicit unitId/unit exists
    const u = (r.unitId || r.unit || '').toUpperCase();
    if (u) {
      return u === 'JUNIOR_HIGH';
    }

    // 2. Try matching with known active classes
    if (r.classId && classesList.some(c => c.id === r.classId)) {
      return true;
    }

    // 3. Fallback name-based detection
    const nameLower = (r.className || r.class || '').toLowerCase();
    const idLower = (r.classId || '').toLowerCase();
    
    const isSmp = nameLower.includes('smp') || 
                  nameLower.includes('junior') || 
                  nameLower.includes('al-jazari') || 
                  nameLower.includes('al jazari') ||
                  nameLower.includes('grade 7') || 
                  nameLower.includes('grade 8') || 
                  nameLower.includes('grade 9') ||
                  nameLower.includes('kelas 7') || 
                  nameLower.includes('kelas 8') || 
                  nameLower.includes('kelas 9') ||
                  /\b(7|8|9)\b/.test(nameLower) ||
                  /\b(7|8|9)\b/.test(idLower) ||
                  nameLower.startsWith('7') ||
                  nameLower.startsWith('8') ||
                  nameLower.startsWith('9');

    if (isSmp) return true;

    return false;
  }, []);

  const fetchRekapData = async () => {
    if (!rekapAcademicYear) return;
    setLoadingRekap(true);
    setRekapError(null);
    try {
      // Query lateness records for selected date range
      const latenessQ = query(
        collection(db, 'lateness_records'),
        where('date', '>=', rekapStartDate),
        where('date', '<=', rekapEndDate)
      );

      // Query minor violations for selected date range
      const violationQ = query(
        collection(db, 'minor_violations'),
        where('date', '>=', rekapStartDate),
        where('date', '<=', rekapEndDate)
      );

      const [latenessSnap, violationSnap] = await Promise.all([
        getDocs(latenessQ),
        getDocs(violationQ)
      ]);

      const rawLateness = latenessSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
      const rawViolations = violationSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

      // Normalisasi data Tardiness dengan adapter
      const normalizedLateness = rawLateness.map(normalizeTardinessRecord).filter(r => isJuniorHighRecord(r, classes));
      
      // Filter minor violations to unit == 'JUNIOR_HIGH'
      const juniorHighViolations = rawViolations.filter(v => 
        (v.unit || v.unitId || '').toUpperCase() === 'JUNIOR_HIGH' || 
        classes.some(c => c.id === v.classId)
      );

      setRekapLatenessData(normalizedLateness);
      setRekapViolationData(juniorHighViolations);

      console.log('Rekap fetch successful:', {
        activeAcademicYear: rekapAcademicYear,
        semester: rekapSemester,
        startDate: rekapStartDate,
        endDate: rekapEndDate,
        selectedClassId: rekapClassFilter,
        collections: ['lateness_records', 'minor_violations'],
        rawLatenessCount: rawLateness.length,
        normalizedLatenessCount: normalizedLateness.length,
        rawViolationsCount: rawViolations.length,
        filteredViolationsCount: juniorHighViolations.length
      });

    } catch (err: any) {
      console.error('Error fetching rekap data:', {
        activeAcademicYear: rekapAcademicYear,
        semester: rekapSemester,
        startDate: rekapStartDate,
        endDate: rekapEndDate,
        selectedClassId: rekapClassFilter,
        error: err?.message || err
      });
      setRekapError('Data keterlambatan tidak dapat dimuat. Coba muat ulang.');
      toast.error('Data keterlambatan tidak dapat dimuat. Coba muat ulang.');
    } finally {
      setLoadingRekap(false);
    }
  };

  // Safe and reactive filter on retrieved collections
  const filteredLateness = React.useMemo(() => {
    if (rekapDataType === 'violations') return [];
    return rekapLatenessData.filter(r => {
      // 1. Date range filter
      if (r.date < rekapStartDate || r.date > rekapEndDate) return false;
      
      // 2. Class filter
      if (rekapClassFilter !== 'all') {
        const classObj = classes.find(c => c.id === rekapClassFilter);
        const matchesId = r.classId === rekapClassFilter;
        const matchesName = classObj && r.className && r.className.toLowerCase() === classObj.name.toLowerCase();
        if (!matchesId && !matchesName) return false;
      }

      // 3. Academic Year & Semester if fields exist on record, else pass
      if (r.academicYear && r.academicYear !== rekapAcademicYear) return false;
      if (r.semester && Number(r.semester) !== Number(rekapSemester)) return false;
      return true;
    });
  }, [rekapLatenessData, rekapStartDate, rekapEndDate, rekapClassFilter, rekapAcademicYear, rekapSemester, rekapDataType, classes]);

  const filteredViolations = React.useMemo(() => {
    if (rekapDataType === 'lateness') return [];
    return rekapViolationData.filter(r => {
      // 1. Date range filter
      if (r.date < rekapStartDate || r.date > rekapEndDate) return false;
      
      // 2. Class filter
      if (rekapClassFilter !== 'all') {
        const classObj = classes.find(c => c.id === rekapClassFilter);
        const matchesId = r.classId === rekapClassFilter;
        const matchesName = classObj && r.className && r.className.toLowerCase() === classObj.name.toLowerCase();
        if (!matchesId && !matchesName) return false;
      }

      // 3. Academic Year & Semester must match
      if (r.academicYear && r.academicYear !== rekapAcademicYear) return false;
      if (r.semester && Number(r.semester) !== Number(rekapSemester)) return false;
      return true;
    });
  }, [rekapViolationData, rekapStartDate, rekapEndDate, rekapClassFilter, rekapAcademicYear, rekapSemester, rekapDataType, classes]);

  // Trigger rekap fetch on tab mount or filter changes
  React.useEffect(() => {
    if (activeTab === 'rekap' && !loadingClasses) {
      fetchRekapData();
    }
  }, [activeTab, rekapStartDate, rekapEndDate, rekapClassFilter, rekapAcademicYear, rekapSemester, loadingClasses]);

  const handleApplyRekapFilters = () => {
    fetchRekapData();
  };

  const handleResetRekapFilters = () => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(today.setDate(diff));
    setRekapStartDate(monday.toISOString().split('T')[0]);
    setRekapEndDate(getCurrentDateStr());
    setRekapClassFilter('all');
    setRekapDataType('all');
    setRekapAcademicYear(activeYear || '');
    setRekapSemester(activeSemester || 1);
  };

  // Compile Leaderboard from filtered records
  const leaderboardList = React.useMemo(() => {
    const studentMap: Record<string, {
      studentId: string;
      studentName: string;
      className: string;
      classId: string;
      latenessCount: number;
      violationCount: number;
      totalCount: number;
      lastRecordedDate: string;
    }> = {};

    // Helper to log or update student entry
    const touchStudent = (studentId: string, name: string, className: string, classId: string, date: string) => {
      if (!studentMap[studentId]) {
        studentMap[studentId] = {
          studentId,
          studentName: name,
          className,
          classId,
          latenessCount: 0,
          violationCount: 0,
          totalCount: 0,
          lastRecordedDate: date
        };
      } else {
        if (date > studentMap[studentId].lastRecordedDate) {
          studentMap[studentId].lastRecordedDate = date;
        }
      }
    };

    // Aggregate lateness
    if (rekapDataType === 'all' || rekapDataType === 'lateness') {
      filteredLateness.forEach(r => {
        if (!r.studentId) return;
        touchStudent(r.studentId, r.studentName, r.className || 'Kelas Lain', r.classId, r.date);
        studentMap[r.studentId].latenessCount++;
        studentMap[r.studentId].totalCount++;
      });
    }

    // Aggregate violations
    if (rekapDataType === 'all' || rekapDataType === 'violations') {
      filteredViolations.forEach(r => {
        if (!r.studentId) return;
        touchStudent(r.studentId, r.studentName, r.className || 'Kelas Lain', r.classId, r.date);
        studentMap[r.studentId].violationCount++;
        studentMap[r.studentId].totalCount++;
      });
    }

    // Convert map to array
    const result = Object.values(studentMap);

    result.sort((a, b) => {
      const scoreA = rekapDataType === 'lateness' ? a.latenessCount : rekapDataType === 'violations' ? a.violationCount : a.totalCount;
      const scoreB = rekapDataType === 'lateness' ? b.latenessCount : rekapDataType === 'violations' ? b.violationCount : b.totalCount;
      
      if (scoreB !== scoreA) {
        return scoreB - scoreA; // Descending count
      }
      return b.lastRecordedDate.localeCompare(a.lastRecordedDate); // Tied -> most recent first
    });

    return result;
  }, [filteredLateness, filteredViolations, rekapDataType]);

  // Aggregate Metrics for cards
  const rekapMetrics = React.useMemo(() => {
    const list = leaderboardList;
    const totalLateness = filteredLateness.length;
    const totalViolations = filteredViolations.length;
    
    let maxStudentName = '-';
    let maxStudentCount = 0;
    list.forEach(s => {
      const count = rekapDataType === 'lateness' ? s.latenessCount : rekapDataType === 'violations' ? s.violationCount : s.totalCount;
      if (count > maxStudentCount) {
        maxStudentCount = count;
        maxStudentName = s.studentName;
      }
    });

    // Find class with most records
    const classCounts: Record<string, number> = {};
    if (rekapDataType === 'all' || rekapDataType === 'lateness') {
      filteredLateness.forEach(r => {
        if (r.className) classCounts[r.className] = (classCounts[r.className] || 0) + 1;
      });
    }
    if (rekapDataType === 'all' || rekapDataType === 'violations') {
      filteredViolations.forEach(r => {
        if (r.className) classCounts[r.className] = (classCounts[r.className] || 0) + 1;
      });
    }

    let maxClassName = '-';
    let maxClassCount = 0;
    Object.entries(classCounts).forEach(([name, count]) => {
      if (count > maxClassCount) {
        maxClassCount = count;
        maxClassName = name;
      }
    });

    return {
      totalLateness,
      totalViolations,
      topStudent: maxStudentCount > 0 ? `${maxStudentName} (${maxStudentCount}x)` : '-',
      topClass: maxClassCount > 0 ? `${maxClassName} (${maxClassCount}x)` : '-'
    };
  }, [leaderboardList, filteredLateness, filteredViolations, rekapDataType]);

  // Chart Data compilation (Catatan per Kelas)
  const chartData = React.useMemo(() => {
    const classesMap: Record<string, { name: string; Keterlambatan: number; 'Pelanggaran Ringan': number }> = {};
    
    // Pre-populate with our classes list for consistent layout
    classes.forEach(c => {
      classesMap[c.id] = { name: c.name, Keterlambatan: 0, 'Pelanggaran Ringan': 0 };
    });

    if (rekapDataType === 'all' || rekapDataType === 'lateness') {
      filteredLateness.forEach(r => {
        if (r.classId && classesMap[r.classId]) {
          classesMap[r.classId].Keterlambatan++;
        }
      });
    }

    if (rekapDataType === 'all' || rekapDataType === 'violations') {
      filteredViolations.forEach(v => {
        if (v.classId && classesMap[v.classId]) {
          classesMap[v.classId]['Pelanggaran Ringan']++;
        }
      });
    }

    return Object.values(classesMap);
  }, [classes, filteredLateness, filteredViolations, rekapDataType]);

  // Open Student History Timeline derived from currently filtered active dataset
  const handleOpenStudentHistory = (student: any) => {
    setSelectedTimelineStudent(student);
    setLoadingTimeline(true);
    try {
      const historyList: any[] = [];
      const studentLateness = filteredLateness.filter(r => r.studentId === student.studentId);
      const studentViolations = filteredViolations.filter(r => r.studentId === student.studentId);

      studentLateness.forEach(data => {
        historyList.push({
          id: data.id,
          type: 'lateness',
          title: 'Keterlambatan',
          timeLabel: data.arrivalTime || 'Tiba',
          category: data.arrivalTime > '07:30' ? 'Terlambat' : 'Tepat Waktu',
          reason: data.reason || 'Tanpa keterangan',
          recordedBy: data.recordedByName || 'Guru / Staff',
          date: data.date,
          color: 'blue'
        });
      });

      studentViolations.forEach(data => {
        historyList.push({
          id: data.id,
          type: 'violation',
          title: 'Pelanggaran Ringan',
          timeLabel: 'Pelanggaran',
          category: data.violationType || 'Pelanggaran',
          reason: data.notes || 'Tanpa keterangan',
          recordedBy: data.recordedByName || 'Guru / Staff',
          date: data.date,
          color: 'amber'
        });
      });

      // Sort timeline descending
      historyList.sort((a, b) => b.date.localeCompare(a.date));
      setStudentTimeline(historyList);
    } catch (err) {
      console.error(err);
      toast.error('Gagal memuat timeline siswa.');
    } finally {
      setLoadingTimeline(false);
    }
  };

  // Navigate to create MTSS Case
  const handleCreateMTSSCase = (studentId: string) => {
    navigate(`/junior-high/behavior/mtss/cases/new?studentId=${studentId}`);
  };

  // Nav to student portfolio
  const handleOpenPortfolio = () => {
    navigate(`/child/passport`);
  };

  // ----------------------------------------------------
  // SUB-RENDER: TAB 1 KETERLAMBATAN Form & Table
  // ----------------------------------------------------
  const filteredLatenessClassStudents = latenessClassStudents.filter(s => 
    s.name.toLowerCase().includes(latenessSearch.toLowerCase()) || 
    (s.nickname && s.nickname.toLowerCase().includes(latenessSearch.toLowerCase()))
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Keterlambatan & Pelanggaran Ringan</h1>
          <p className="text-sm font-medium text-gray-500 mt-1">Pencatatan harian dan rekap disiplin siswa SMP</p>
        </div>
        {/* Unit Selector Context display */}
        <div className="flex items-center gap-2 bg-blue-50/50 text-blue-700 px-4 py-2.5 rounded-2xl border border-blue-100">
          <BookOpen size={16} />
          <span className="text-xs font-black uppercase tracking-wider">Unit: SMP (Junior High)</span>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 pb-1">
        <button
          onClick={() => setActiveTab('lateness')}
          className={cn(
            "flex items-center gap-2 px-5 py-3 rounded-t-2xl font-black text-xs uppercase tracking-wider transition-all border-b-2 cursor-pointer",
            activeTab === 'lateness' 
              ? "bg-blue-50/50 text-blue-600 border-blue-600 shadow-sm shadow-blue-50/30" 
              : "text-gray-400 border-transparent hover:text-gray-600"
          )}
        >
          <Clock size={16} />
          Keterlambatan
        </button>
        <button
          onClick={() => setActiveTab('violations')}
          className={cn(
            "flex items-center gap-2 px-5 py-3 rounded-t-2xl font-black text-xs uppercase tracking-wider transition-all border-b-2 cursor-pointer",
            activeTab === 'violations' 
              ? "bg-amber-50/50 text-amber-600 border-amber-500 shadow-sm shadow-amber-50/30" 
              : "text-gray-400 border-transparent hover:text-gray-600"
          )}
        >
          <ClipboardList size={16} />
          Pelanggaran Ringan
        </button>
        {!isStudentOrParent && (
          <button
            onClick={() => setActiveTab('rekap')}
            className={cn(
              "flex items-center gap-2 px-5 py-3 rounded-t-2xl font-black text-xs uppercase tracking-wider transition-all border-b-2 cursor-pointer",
              activeTab === 'rekap' 
                ? "bg-violet-50/50 text-violet-600 border-violet-600 shadow-sm shadow-violet-50/30" 
                : "text-gray-400 border-transparent hover:text-gray-600"
            )}
          >
            <BarChart3 size={16} />
            Rekap & Leaderboard
          </button>
        )}
      </div>

      {/* ---------------------------------------------------- */}
      {/* TAB CONTENT: KETERLAMBATAN (TARDINESS) */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'lateness' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Column 1 & 2: Form Input */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Form Card */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-50 text-blue-600 rounded-2xl border border-blue-100">
                      <Clock size={18} />
                    </div>
                    <div>
                      <h2 className="font-black text-gray-900 text-sm">Catat Kedatangan Siswa</h2>
                      <p className="text-xs text-gray-400 mt-0.5">Waktu kedatangan di bawah jam 07:30 dianggap tepat waktu</p>
                    </div>
                  </div>
                  
                  {/* Date & Class Selectors */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="date"
                      value={latenessDate}
                      onChange={(e) => setLatenessDate(e.target.value)}
                      className="bg-gray-50/70 border border-gray-100 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                    <select
                      value={selectedClassId}
                      onChange={(e) => setSelectedClassId(e.target.value)}
                      className="bg-gray-50/70 border border-gray-100 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
                    >
                      {classes.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Search Bar inside form */}
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                    <Search size={16} />
                  </span>
                  <input
                    type="text"
                    placeholder="Cari siswa dalam kelas ini..."
                    value={latenessSearch}
                    onChange={(e) => setLatenessSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50/50 border border-gray-100 rounded-2xl text-xs outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                  />
                </div>

                {/* Entry Table */}
                <div className="overflow-x-auto rounded-2xl border border-gray-50">
                  {loadingMetadata ? (
                    <div className="p-12 flex flex-col items-center justify-center gap-2 text-gray-400">
                      <Loader2 size={24} className="animate-spin text-blue-500" />
                      <p className="text-xs font-black uppercase tracking-wider">Memuat data kelas...</p>
                    </div>
                  ) : filteredLatenessClassStudents.length === 0 ? (
                    <div className="p-12 text-center text-gray-400">
                      <p className="text-sm italic font-medium">Tidak ada siswa ditemukan di kelas ini.</p>
                    </div>
                  ) : (
                    <table className="w-full text-left">
                      <thead className="bg-gray-50/50">
                        <tr>
                          <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Siswa</th>
                          <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Waktu Tiba</th>
                          <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Alasan / Keterangan</th>
                          <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50/50">
                        {filteredLatenessClassStudents.map(student => (
                          <tr key={student.id} className="hover:bg-gray-50/30 transition-all">
                            <td className="px-5 py-3.5">
                              <p className="font-bold text-gray-900 text-sm">{student.name}</p>
                              <p className="text-[10px] font-semibold text-gray-400 mt-0.5 uppercase tracking-wider">
                                Frekuensi bulan ini: {student.countThisMonth}x
                              </p>
                            </td>
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="time"
                                  value={student.arrivalTime}
                                  onChange={(e) => updateLatenessTime(student.id, e.target.value)}
                                  className="bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5 text-xs font-black text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-24"
                                />
                                <button
                                  type="button"
                                  onClick={() => updateLatenessTime(student.id, getCurrentTimeStr())}
                                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                  title="Set jam saat ini"
                                >
                                  <Clock size={14} />
                                </button>
                              </div>
                            </td>
                            <td className="px-5 py-3.5">
                              {(() => {
                                const isCustom = latenessCustomReasons[student.id] || 
                                  (student.reason !== '' && !JUNIOR_HIGH_REASONS.includes(student.reason));

                                if (isCustom) {
                                  return (
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="text"
                                        placeholder="Tulis alasan..."
                                        value={student.reason}
                                        onChange={(e) => updateLatenessReason(student.id, e.target.value)}
                                        className="bg-transparent border-b border-gray-200 focus:border-blue-500 outline-none text-xs py-1 placeholder:text-gray-300 font-bold text-gray-700 w-full"
                                        autoFocus
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setLatenessCustomReasons(prev => ({ ...prev, [student.id]: false }));
                                          updateLatenessReason(student.id, '');
                                        }}
                                        className="text-[10px] font-black text-gray-400 hover:text-blue-600 uppercase tracking-wider"
                                      >
                                        Batal
                                      </button>
                                    </div>
                                  );
                                }

                                return (
                                  <select
                                    value={student.reason}
                                    onChange={(e) => {
                                      if (e.target.value === 'custom') {
                                        setLatenessCustomReasons(prev => ({ ...prev, [student.id]: true }));
                                        updateLatenessReason(student.id, '');
                                      } else {
                                        updateLatenessReason(student.id, e.target.value);
                                      }
                                    }}
                                    className="bg-transparent border-b border-gray-100 hover:border-gray-200 focus:border-blue-500 outline-none text-xs py-1.5 font-bold text-gray-700 cursor-pointer w-full"
                                  >
                                    <option value="">-- Pilih Alasan --</option>
                                    {JUNIOR_HIGH_REASONS.map(r => (
                                      <option key={r} value={r}>{r}</option>
                                    ))}
                                    <option value="custom" className="text-blue-600 font-bold">Lainnya...</option>
                                  </select>
                                );
                              })()}
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              <button
                                type="button"
                                onClick={() => removeLatenessDraft(student.id)}
                                className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                title="Reset"
                                disabled={!student.arrivalTime}
                              >
                                <X size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Save Button */}
                <div className="flex justify-end pt-2">
                  <button
                    disabled={savingLateness || loadingMetadata}
                    onClick={handleSaveLateness}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-black px-8 py-3 rounded-2xl shadow-lg shadow-blue-100 transition-all disabled:opacity-50 text-xs uppercase tracking-wider cursor-pointer"
                  >
                    {savingLateness ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    {savingLateness ? 'Menyimpan...' : 'Simpan & Kirim Notifikasi'}
                  </button>
                </div>
              </div>

              {/* Lateness Today List Card */}
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                      <Clock size={18} />
                    </div>
                    <div>
                      <h2 className="font-black text-gray-900 text-sm">Keterlambatan Hari Ini</h2>
                      <p className="text-xs text-gray-400 mt-0.5">Siswa yang terdata pada {getFormattedDateLong(latenessDate)}</p>
                    </div>
                  </div>
                  <span className="bg-blue-50 text-blue-700 text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider">
                    {latenessTodaySaved.length} Siswa
                  </span>
                </div>

                <div className="overflow-x-auto">
                  {loadingTodayLateness ? (
                    <div className="p-12 flex flex-col items-center justify-center gap-2 text-gray-400">
                      <Loader2 size={24} className="animate-spin text-blue-500" />
                      <p className="text-xs font-medium uppercase tracking-widest">Memuat data keterlambatan...</p>
                    </div>
                  ) : latenessTodaySaved.length === 0 ? (
                    <div className="p-12 text-center text-gray-400">
                      <p className="text-sm italic">Belum ada data keterlambatan yang disimpan hari ini.</p>
                    </div>
                  ) : (
                    <table className="w-full text-left">
                      <thead className="bg-gray-50/50">
                        <tr>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Siswa</th>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Kelas</th>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Waktu Tiba</th>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Alasan / Keterangan</th>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {latenessTodaySaved.map(record => (
                          <tr key={record.id} className="hover:bg-gray-50/30 transition-all">
                            <td className="px-6 py-4">
                              <p className="font-bold text-gray-900 text-sm">{record.studentName}</p>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg uppercase tracking-wider">
                                {record.className}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-xs font-black text-red-600 bg-red-50 border border-red-100 px-2.5 py-1 rounded-lg">
                                {record.arrivalTime}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              {editingLatenessId === record.id ? (
                                <div className="flex items-center gap-2">
                                  {editingLatenessCustom ? (
                                    <div className="flex items-center gap-2 w-full">
                                      <input
                                        type="text"
                                        value={editingLatenessReason}
                                        onChange={(e) => setEditingLatenessReason(e.target.value)}
                                        className="bg-transparent border-b border-gray-300 focus:border-blue-500 outline-none text-xs font-bold text-gray-700 py-1"
                                        autoFocus
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingLatenessCustom(false);
                                          setEditingLatenessReason('');
                                        }}
                                        className="text-[10px] font-black text-gray-400 hover:text-blue-600 uppercase tracking-wider"
                                      >
                                        Batal
                                      </button>
                                    </div>
                                  ) : (
                                    <select
                                      value={editingLatenessReason}
                                      onChange={(e) => {
                                        if (e.target.value === 'custom') {
                                          setEditingLatenessCustom(true);
                                          setEditingLatenessReason('');
                                        } else {
                                          setEditingLatenessReason(e.target.value);
                                        }
                                      }}
                                      className="bg-transparent border-b border-gray-200 outline-none text-xs font-bold text-gray-700 py-1"
                                    >
                                      <option value="">-- Pilih Alasan --</option>
                                      {JUNIOR_HIGH_REASONS.map(r => (
                                        <option key={r} value={r}>{r}</option>
                                      ))}
                                      <option value="custom" className="text-blue-600 font-bold">Lainnya...</option>
                                    </select>
                                  )}
                                </div>
                              ) : (
                                <p className="text-sm text-gray-600">{record.reason || <span className="text-gray-300 italic">Tidak ada alasan</span>}</p>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right">
                              {editingLatenessId === record.id ? (
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => handleUpdateSavedLatenessReason(record.id)}
                                    disabled={updatingLatenessId === record.id}
                                    className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                                  >
                                    {updatingLatenessId === record.id ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingLatenessId(null);
                                      setEditingLatenessReason('');
                                      setEditingLatenessCustom(false);
                                    }}
                                    className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                                  >
                                    <X size={16} />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => {
                                      setEditingLatenessId(record.id);
                                      setEditingLatenessReason(record.reason || '');
                                      const isPreset = JUNIOR_HIGH_REASONS.includes(record.reason || '') || (record.reason || '') === '';
                                      setEditingLatenessCustom(!isPreset);
                                    }}
                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                  >
                                    <Edit2 size={15} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteSavedLateness(record.id)}
                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>

            {/* Sidebar Column: Stats */}
            <div className="space-y-6">
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-6">
                <h3 className="font-black text-gray-900 text-sm flex items-center gap-2">
                  <TrendingUp size={16} className="text-blue-500" />
                  Analisis Pola Keterlambatan
                </h3>
                <div className="space-y-4">
                  <div className="p-4 bg-gray-50/50 rounded-2xl border border-gray-50 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Hari Paling Sering</p>
                      <p className="text-sm font-bold text-gray-800 mt-0.5">{mostFrequentDay}</p>
                    </div>
                    <History size={18} className="text-gray-300" />
                  </div>
                  <div className="p-4 bg-gray-50/50 rounded-2xl border border-gray-50 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Rerata Menit Terlambat</p>
                      <p className="text-sm font-bold text-gray-800 mt-0.5">{avgLateMinutes}</p>
                    </div>
                    <Clock size={18} className="text-gray-300" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB CONTENT: PELANGGARAN RINGAN */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'violations' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Main Column: Form input */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-amber-50 text-amber-600 rounded-2xl border border-amber-100">
                      <ClipboardList size={18} />
                    </div>
                    <div>
                      <h2 className="font-black text-gray-900 text-sm">Catat Pelanggaran Ringan</h2>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={violationDate}
                      onChange={(e) => setViolationDate(e.target.value)}
                      className="bg-gray-50/70 border border-gray-100 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 outline-none"
                    />
                    <select
                      value={selectedClassId}
                      onChange={(e) => setSelectedClassId(e.target.value)}
                      className="bg-gray-50/70 border border-gray-100 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 outline-none cursor-pointer"
                    >
                      {classes.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <form onSubmit={handleSaveViolation} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    
                    {/* Student Selector */}
                    <div className="space-y-2 relative">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Siswa *</label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder={students.length === 0 ? "Memuat siswa..." : "Cari & Pilih Siswa..."}
                          value={studentSearchInput}
                          onChange={(e) => {
                            setStudentSearchInput(e.target.value);
                            setShowStudentDropdown(true);
                          }}
                          onFocus={() => setShowStudentDropdown(true)}
                          className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-xs outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-bold"
                          disabled={students.length === 0}
                        />
                        <Search size={14} className="absolute right-3 top-3.5 text-gray-400" />
                      </div>

                      {/* Search Autocomplete Dropdown */}
                      {showStudentDropdown && students.length > 0 && (
                        <div className="absolute z-30 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-gray-100 shadow-xl rounded-xl divide-y divide-gray-50">
                          {(() => {
                            const filteredSList = students.filter(s => 
                              s.name.toLowerCase().includes(studentSearchInput.toLowerCase()) ||
                              (s.nickname && s.nickname.toLowerCase().includes(studentSearchInput.toLowerCase()))
                            );
                            
                            if (filteredSList.length === 0) {
                              return <div className="p-3 text-xs text-gray-400 italic">Siswa tidak ditemukan</div>;
                            }

                            return filteredSList.map(s => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => {
                                  setSelectedViolationStudentId(s.id);
                                  setStudentSearchInput(s.name);
                                  setShowStudentDropdown(false);
                                }}
                                className="w-full text-left px-4 py-2.5 hover:bg-amber-50/50 text-xs font-bold text-gray-700 block transition-all"
                              >
                                {s.name} {s.nickname ? `(${s.nickname})` : ''}
                              </button>
                            ));
                          })()}
                        </div>
                      )}
                      {showStudentDropdown && (
                        <div 
                          className="fixed inset-0 z-20" 
                          onClick={() => setShowStudentDropdown(false)}
                        />
                      )}
                    </div>

                    {/* Violation Type Selector */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Jenis Pelanggaran *</label>
                      <input
                        type="text"
                        placeholder="Contoh: Seragam tidak lengkap"
                        value={violationType}
                        onChange={(e) => setViolationType(e.target.value.slice(0, 100))}
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-xs outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-bold"
                        maxLength={100}
                        required
                      />
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                        Keterangan Singkat
                      </label>
                      <span className="text-[10px] font-bold text-gray-400">{violationNotes.length}/300</span>
                    </div>
                    <textarea
                      placeholder="Tulis catatan tambahan di sini (Opsional)..."
                      value={violationNotes}
                      onChange={(e) => setViolationNotes(e.target.value.slice(0, 300))}
                      rows={3}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl p-4 text-xs outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
                    />
                  </div>

                  {/* Recorded By */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Dicatat Oleh</label>
                      <div className="bg-gray-100/50 border border-gray-100 rounded-xl px-4 py-3 text-xs font-black text-gray-500 flex items-center gap-2">
                        <User size={14} />
                        {profile?.displayName || 'Guru / Staff'}
                      </div>
                    </div>

                    <div className="flex items-end">
                      <button
                        type="submit"
                        disabled={savingViolation}
                        className="w-full bg-amber-500 hover:bg-amber-600 text-white font-black py-3 px-8 rounded-xl shadow-lg shadow-amber-50 transition-all text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {savingViolation ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        {savingViolation ? 'Menyimpan...' : 'Simpan Catatan Pelanggaran'}
                      </button>
                    </div>
                  </div>
                </form>
              </div>

              {/* Today's Violations List */}
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-50 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                      <ClipboardList size={18} />
                    </div>
                    <div>
                      <h2 className="font-black text-gray-900 text-sm">Catatan Pelanggaran Hari Ini</h2>
                      <p className="text-xs text-gray-400 mt-0.5">Log pelanggaran ringan tanggal {getFormattedDateLong(violationDate)}</p>
                    </div>
                  </div>

                  {/* Filter & Search list */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={violationClassFilter}
                      onChange={(e) => setViolationClassFilter(e.target.value)}
                      className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-1.5 text-xs font-bold text-gray-700 outline-none cursor-pointer"
                    >
                      <option value="">Semua Kelas</option>
                      {classes.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>

                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Cari siswa..."
                        value={violationSearch}
                        onChange={(e) => setViolationSearch(e.target.value)}
                        className="bg-gray-50 border border-gray-100 rounded-xl pl-8 pr-3 py-1.5 text-xs font-bold text-gray-700 outline-none w-36"
                      />
                      <Search size={12} className="absolute left-2.5 top-2.5 text-gray-400" />
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  {loadingTodayViolations ? (
                    <div className="p-12 flex flex-col items-center justify-center gap-2 text-gray-400">
                      <Loader2 size={24} className="animate-spin text-amber-500" />
                      <p className="text-xs font-medium uppercase tracking-widest">Memuat catatan...</p>
                    </div>
                  ) : filteredViolationsList.length === 0 ? (
                    <div className="p-12 text-center text-gray-400">
                      <p className="text-sm italic">Belum ada catatan pelanggaran ringan pada tanggal ini.</p>
                    </div>
                  ) : (
                    <table className="w-full text-left">
                      <thead className="bg-gray-50/50">
                        <tr>
                          <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Siswa</th>
                          <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Kelas</th>
                          <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Jenis Pelanggaran</th>
                          <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Keterangan</th>
                          <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Dicatat Oleh</th>
                          <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {filteredViolationsList.map(record => (
                          <tr key={record.id} className="hover:bg-gray-50/30 transition-all">
                            <td className="px-5 py-4">
                              <p className="font-bold text-gray-900 text-xs">{record.studentName}</p>
                            </td>
                            <td className="px-5 py-4">
                              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase tracking-wider">
                                {record.className}
                              </span>
                            </td>
                            <td className="px-5 py-4">
                              {editingViolationId === record.id ? (
                                <input
                                  type="text"
                                  value={editingViolationType}
                                  onChange={(e) => setEditingViolationType(e.target.value.slice(0, 100))}
                                  className="bg-transparent border-b border-gray-300 focus:border-amber-500 outline-none text-xs font-bold text-gray-700 py-1 w-full"
                                  maxLength={100}
                                />
                              ) : (
                                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                                  {record.violationType}
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-4 max-w-xs">
                              {editingViolationId === record.id ? (
                                <input
                                  type="text"
                                  value={editingViolationNotes}
                                  onChange={(e) => setEditingViolationNotes(e.target.value)}
                                  className="w-full bg-transparent border-b border-gray-300 focus:border-amber-500 outline-none text-xs font-bold text-gray-700 py-1"
                                />
                              ) : (
                                <p className="text-xs text-gray-500 break-words font-medium">{record.notes || <span className="text-gray-300 italic">-</span>}</p>
                              )}
                            </td>
                            <td className="px-5 py-4">
                              <p className="text-[10px] font-bold text-gray-500">{record.recordedByName || 'Guru'}</p>
                            </td>
                            <td className="px-5 py-4 text-right">
                              {editingViolationId === record.id ? (
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => handleUpdateViolation(record.id)}
                                    disabled={updatingViolationId === record.id}
                                    className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                                  >
                                    {updatingViolationId === record.id ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingViolationId(null);
                                      setEditingViolationNotes('');
                                    }}
                                    className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                                  >
                                    <X size={16} />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => {
                                      setEditingViolationId(record.id);
                                      setEditingViolationType(record.violationType || '');
                                      setEditingViolationNotes(record.notes || '');
                                    }}
                                    className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
                                  >
                                    <Edit2 size={14} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteViolation(record.id)}
                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>

            {/* Tab 2 Sidebar: stats & master categories manager */}
            <div className="space-y-6">
              
              {/* Stats Card */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-6">
                <h3 className="font-black text-gray-900 text-sm flex items-center gap-2">
                  <TrendingUp size={16} className="text-amber-500" />
                  Ringkasan Hari Ini
                </h3>
                <div className="space-y-4">
                  <div className="p-4 bg-gray-50/50 rounded-2xl border border-gray-50 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Catatan</p>
                      <p className="text-sm font-bold text-gray-800 mt-0.5">{violationTodayStats.total} kejadian</p>
                    </div>
                    <ClipboardList size={18} className="text-gray-300" />
                  </div>
                  <div className="p-4 bg-gray-50/50 rounded-2xl border border-gray-50 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Siswa Terlibat</p>
                      <p className="text-sm font-bold text-gray-800 mt-0.5">{violationTodayStats.uniqueStudents} siswa</p>
                    </div>
                    <User size={18} className="text-gray-300" />
                  </div>
                  <div className="p-4 bg-gray-50/50 rounded-2xl border border-gray-50">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Jenis Pelanggaran Terbanyak</p>
                    <p className="text-xs font-bold text-gray-800 mt-1 break-words leading-relaxed">{violationTodayStats.mostFreqType}</p>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB CONTENT: REKAP & LEADERBOARD */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'rekap' && !isStudentOrParent && (
        <div className="space-y-6">
          
          {rekapError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-xs font-semibold flex items-center gap-2 shadow-sm animate-fade-in">
              <AlertCircle size={16} className="text-red-500 shrink-0" />
              <span>{rekapError}</span>
            </div>
          )}
          
          {/* Controls / Filter Panel Card */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-5">
            <h3 className="font-black text-gray-900 text-sm flex items-center gap-2">
              <Filter size={16} className="text-violet-600" />
              Filter Rekap Keterlambatan dan Pelanggaran Ringan
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              
              {/* Date Range Start */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Mulai Tanggal</label>
                <input
                  type="date"
                  value={rekapStartDate}
                  onChange={(e) => setRekapStartDate(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-2.5 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-violet-500/15"
                />
              </div>

              {/* Date Range End */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Sampai Tanggal</label>
                <input
                  type="date"
                  value={rekapEndDate}
                  onChange={(e) => setRekapEndDate(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-2.5 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-violet-500/15"
                />
              </div>

              {/* Class filter */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Kelas ({rekapAcademicYear})</label>
                <select
                  value={rekapClassFilter}
                  onChange={(e) => setRekapClassFilter(e.target.value)}
                  disabled={loadingClasses}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-2.5 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-violet-500/15 cursor-pointer disabled:opacity-50"
                >
                  {loadingClasses ? (
                    <option value="all">Memuat kelas {rekapAcademicYear}...</option>
                  ) : (
                    <>
                      <option value="all">Semua Kelas</option>
                      {classes.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </>
                  )}
                </select>
                {!loadingClasses && classes.length === 0 && (
                  <p className="text-[10px] text-amber-600 font-bold mt-1 leading-normal">
                    Belum ada kelas Junior High untuk tahun ajaran {rekapAcademicYear}.
                  </p>
                )}
              </div>

              {/* Data Type filter */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Jenis Catatan</label>
                <select
                  value={rekapDataType}
                  onChange={(e) => setRekapDataType(e.target.value as any)}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-2.5 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-violet-500/15 cursor-pointer"
                >
                  <option value="all">Semua Catatan</option>
                  <option value="lateness">Hanya Keterlambatan</option>
                  <option value="violations">Hanya Pelanggaran Ringan</option>
                </select>
              </div>

              {/* Year & Semester Context */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Tahun Ajaran</label>
                  <input
                    type="text"
                    value={rekapAcademicYear}
                    disabled
                    className="w-full bg-gray-100 border border-gray-100 text-gray-400 rounded-xl px-2 py-2.5 text-[10px] font-bold text-center"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Semester</label>
                  <input
                    type="text"
                    value={`SM ${rekapSemester}`}
                    disabled
                    className="w-full bg-gray-100 border border-gray-100 text-gray-400 rounded-xl px-2 py-2.5 text-[10px] font-bold text-center"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleResetRekapFilters}
                className="bg-gray-100 hover:bg-gray-200 text-gray-600 font-black px-6 py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={handleApplyRekapFilters}
                className="bg-violet-600 hover:bg-violet-700 text-white font-black px-8 py-2.5 rounded-xl shadow-md shadow-violet-50 transition-all text-xs uppercase tracking-wider cursor-pointer"
              >
                Terapkan Filter
              </button>
            </div>
          </div>

          {/* Aggregate Metrics Cards (4 columns) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Card 1 */}
            <div 
              onClick={() => setRekapDataType('lateness')}
              className={cn(
                "bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between cursor-pointer hover:border-violet-300 transition-all",
                rekapDataType === 'lateness' && "ring-2 ring-violet-600/30 border-violet-400 bg-violet-50/10"
              )}
            >
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Keterlambatan</p>
                {loadingRekap ? (
                  <div className="h-6 w-16 bg-gray-100 animate-pulse rounded mt-2" />
                ) : (
                  <p className="text-xl font-black text-blue-600 mt-1">{rekapMetrics.totalLateness}x</p>
                )}
              </div>
              <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                <Clock size={20} />
              </div>
            </div>

            {/* Card 2 */}
            <div 
              onClick={() => setRekapDataType('violations')}
              className={cn(
                "bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between cursor-pointer hover:border-violet-300 transition-all",
                rekapDataType === 'violations' && "ring-2 ring-violet-600/30 border-violet-400 bg-violet-50/10"
              )}
            >
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Pelanggaran Ringan</p>
                {loadingRekap ? (
                  <div className="h-6 w-16 bg-gray-100 animate-pulse rounded mt-2" />
                ) : (
                  <p className="text-xl font-black text-amber-600 mt-1">{rekapMetrics.totalViolations}x</p>
                )}
              </div>
              <div className="p-3 bg-amber-50 text-amber-500 rounded-2xl">
                <ClipboardList size={20} />
              </div>
            </div>

            {/* Card 3 */}
            <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between">
              <div className="max-w-[70%]">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Siswa dengan Catatan Terbanyak</p>
                {loadingRekap ? (
                  <div className="h-4 w-32 bg-gray-100 animate-pulse rounded mt-2" />
                ) : (
                  <p className="text-xs font-bold text-gray-700 mt-1 truncate leading-relaxed">{rekapMetrics.topStudent}</p>
                )}
              </div>
              <div className="p-3 bg-violet-50 text-violet-600 rounded-2xl">
                <User size={20} />
              </div>
            </div>

            {/* Card 4 */}
            <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between">
              <div className="max-w-[70%]">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Kelas dengan Catatan Terbanyak</p>
                {loadingRekap ? (
                  <div className="h-4 w-32 bg-gray-100 animate-pulse rounded mt-2" />
                ) : (
                  <p className="text-xs font-bold text-gray-700 mt-1 truncate leading-relaxed">{rekapMetrics.topClass}</p>
                )}
              </div>
              <div className="p-3 bg-gray-50 text-gray-500 rounded-2xl">
                <LayoutDashboard size={20} />
              </div>
            </div>
          </div>

          {/* Visual Chart Section */}
          <div className="w-full bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6 animate-fade-in">
            <div>
              <h3 className="font-black text-gray-900 text-sm">Pola Catatan per Kelas</h3>
            </div>

            {loadingRekap ? (
              <div className="h-64 flex flex-col items-center justify-center gap-2 text-gray-400">
                <Loader2 size={24} className="animate-spin text-violet-500" />
                <p className="text-xs font-medium">Menyusun data pola...</p>
              </div>
            ) : chartData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-gray-400 italic text-xs">
                Tidak ada data untuk rentang filter saat ini
              </div>
            ) : (
              <div className="h-64 w-full text-xs">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: '#9ca3af', fontWeight: 'bold' }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: '#9ca3af', fontWeight: 'bold' }} />
                    <Tooltip 
                      contentStyle={{ background: '#ffffff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      itemStyle={{ fontWeight: 'bold', fontSize: '11px' }}
                    />
                     <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'black', textTransform: 'uppercase', letterSpacing: '0.05em' }} />
                    {(rekapDataType === 'all' || rekapDataType === 'lateness') && (
                      <Bar dataKey="Keterlambatan" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    )}
                    {(rekapDataType === 'all' || rekapDataType === 'violations') && (
                      <Bar dataKey="Pelanggaran Ringan" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Main Leaderboard Table */}
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-50 flex items-center justify-between">
              <div>
                <h2 className="font-black text-gray-900 text-sm">Tabel Rekapitulasi Catatan Siswa</h2>
              </div>
              <span className="bg-violet-50 text-violet-700 text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider">
                {leaderboardList.length} Siswa Terdata
              </span>
            </div>

            <div className="overflow-x-auto">
              {loadingRekap ? (
                <div className="p-12 flex flex-col items-center justify-center gap-2 text-gray-400">
                  <Loader2 size={24} className="animate-spin text-violet-500" />
                  <p className="text-xs font-medium uppercase tracking-widest">Menyusun data rekap...</p>
                </div>
              ) : leaderboardList.length === 0 ? (
                <div className="p-12 text-center text-gray-400">
                  <p className="text-sm italic">Tidak ada catatan yang cocok dengan filter aktif.</p>
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead className="bg-gray-50/50">
                    <tr>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Urutan</th>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Siswa</th>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Kelas</th>
                      {(rekapDataType === 'all' || rekapDataType === 'lateness') && (
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Jumlah Keterlambatan</th>
                      )}
                      {(rekapDataType === 'all' || rekapDataType === 'violations') && (
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Jumlah Pelanggaran Ringan</th>
                      )}
                      {rekapDataType === 'all' && (
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Total Akumulasi</th>
                      )}
                      <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Terakhir Tercatat</th>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {leaderboardList.map((item, index) => (
                      <tr key={item.studentId} className="hover:bg-gray-50/30 transition-all duration-200">
                        <td className="px-6 py-4">
                          <span className="text-xs font-bold text-gray-400">Rekap #{index + 1}</span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-bold text-gray-900 text-sm">{item.studentName}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase tracking-wider">
                            {item.className}
                          </span>
                        </td>
                        {(rekapDataType === 'all' || rekapDataType === 'lateness') && (
                          <td className="px-6 py-4 text-center">
                            <span className={cn(
                              "text-xs font-bold px-2 py-0.5 rounded-md",
                              item.latenessCount > 0 ? "text-blue-600 bg-blue-50" : "text-gray-300"
                            )}>
                              {item.latenessCount}x
                            </span>
                          </td>
                        )}
                        {(rekapDataType === 'all' || rekapDataType === 'violations') && (
                          <td className="px-6 py-4 text-center">
                            <span className={cn(
                              "text-xs font-bold px-2 py-0.5 rounded-md",
                              item.violationCount > 0 ? "text-amber-600 bg-amber-50" : "text-gray-300"
                            )}>
                              {item.violationCount}x
                            </span>
                          </td>
                        )}
                        {rekapDataType === 'all' && (
                          <td className="px-6 py-4 text-center">
                            <span className="text-xs font-black text-violet-600 bg-violet-50 px-2.5 py-1 rounded-md">
                              {item.totalCount} Catatan
                            </span>
                          </td>
                        )}
                        <td className="px-6 py-4">
                          <p className="text-xs text-gray-500 font-medium">{item.lastRecordedDate}</p>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleOpenStudentHistory(item)}
                            className="flex items-center gap-1 bg-violet-50 hover:bg-violet-100 text-violet-600 font-black px-4 py-1.5 rounded-xl text-[10px] uppercase tracking-wider ml-auto cursor-pointer"
                          >
                            Lihat Riwayat
                            <ArrowUpRight size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* TIMELINE DETAILS MODAL / SIDE PANEL */}
      {/* ---------------------------------------------------- */}
      <AnimatePresence>
        {selectedTimelineStudent && (
          <div className="fixed inset-0 z-50 flex justify-end">
            
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedTimelineStudent(null)}
              className="absolute inset-0 bg-black/60"
            />

            {/* Panel */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col z-10"
            >
              {/* Panel Header */}
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-violet-50/10">
                <div>
                  <span className="text-[9px] font-black text-violet-600 uppercase tracking-widest bg-violet-50 px-2.5 py-1 rounded-full">
                    Log Keterlambatan & Pelanggaran Ringan
                  </span>
                  <h3 className="text-lg font-black text-gray-900 mt-2">{selectedTimelineStudent.studentName}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Kelas: {selectedTimelineStudent.className} • Periode: {rekapAcademicYear} SM {rekapSemester}</p>
                </div>
                <button
                  onClick={() => setSelectedTimelineStudent(null)}
                  className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Panel Body / Timeline */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {loadingTimeline ? (
                  <div className="py-24 flex flex-col items-center justify-center gap-2 text-gray-400">
                    <Loader2 size={24} className="animate-spin text-violet-500" />
                    <p className="text-xs font-medium uppercase tracking-widest">Menyusun timeline...</p>
                  </div>
                ) : studentTimeline.length === 0 ? (
                  <div className="py-24 text-center text-gray-400 italic text-xs">
                    Tidak ditemukan log untuk range filter ini.
                  </div>
                ) : (
                  <div className="relative border-l border-gray-100 ml-3 pl-6 space-y-6">
                    {studentTimeline.map((item) => (
                      <div key={item.id} className="relative">
                        
                        {/* Dot indicator */}
                        <div className={cn(
                          "absolute -left-[31px] top-1 p-1.5 rounded-full border-2 bg-white",
                          item.type === 'lateness' ? "text-blue-500 border-blue-500" : "text-amber-500 border-amber-500"
                        )}>
                          {item.type === 'lateness' ? <Clock size={10} /> : <ClipboardList size={10} />}
                        </div>

                        {/* Card Content */}
                        <div className="bg-gray-50/70 p-4 rounded-2xl border border-gray-50 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className={cn(
                              "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md",
                              item.type === 'lateness' ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"
                            )}>
                              {item.title}
                            </span>
                            <span className="text-[10px] font-bold text-gray-400">
                              {getFormattedDateLong(item.date)}
                            </span>
                          </div>

                          <p className="text-xs font-bold text-gray-800">
                            {item.category} {item.type === 'lateness' ? `(${item.timeLabel})` : ''}
                          </p>

                          <div className="bg-white/80 p-2.5 rounded-xl border border-gray-50 text-xs text-gray-600 font-medium leading-relaxed italic">
                            &ldquo;{item.reason}&rdquo;
                          </div>

                          <p className="text-[10px] font-bold text-gray-400">
                            Dicatat oleh: {item.recordedBy}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Panel Footer Actions */}
              <div className="p-6 border-t border-gray-100 bg-gray-50/50">
                <button
                  type="button"
                  onClick={handleOpenPortfolio}
                  className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-black px-4 py-3 rounded-2xl shadow-lg shadow-violet-100 text-xs uppercase tracking-wider cursor-pointer"
                >
                  <BookOpen size={14} />
                  Buka Student Portfolio
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
