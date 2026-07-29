import * as React from 'react';
import { motion } from 'motion/react';
import { 
  Clock, AlertCircle, Calendar, Search, 
  Save, History, Bell, MessageSquare, ArrowRight,
  TrendingUp, UserCheck, Loader2, Trash2, ChevronDown, Check,
  X, Edit2
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { db, getActiveStudents } from '../../lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp, getDoc, deleteDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { toast } from 'sonner';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { UnitType } from '../../types';

import StudentSearch from '../../components/StudentSearch';
import JuniorHighLatenessAndViolations from './JuniorHighLatenessAndViolations';

interface LatenessRecord {
  id: string;
  name: string;
  nickname?: string;
  arrivalTime: string;
  reason: string;
  parentNote: boolean;
  countThisMonth: number;
  className?: string;
  classId?: string;
  isManual?: boolean;
}

const getCurrentTimeStr = () => {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  return formatter.format(new Date());
};

const getFormattedSelectedDate = (dateStr: string) => {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
};

const JUNIOR_HIGH_REASONS = [
  'Macet',
  'Bangun kesiangan',
  'Menunggu anggota keluarga',
  'Sakit perut',
  'Hujan'
];

export default function Lateness() {
  const [searchParams] = useSearchParams();
  const { activeUnit } = useOutletContext<{ activeUnit: UnitType }>();

  const currentUnit: string = activeUnit;
  if (currentUnit === 'JUNIOR_HIGH') {
    return <JuniorHighLatenessAndViolations />;
  }

  const { activeYear } = useAcademicYear();
  const [records, setRecords] = React.useState<LatenessRecord[]>([]);
  const [classStudentsList, setClassStudentsList] = React.useState<LatenessRecord[]>([]);
  const [classRoster, setClassRoster] = React.useState<{ id: string; name: string; nickname?: string }[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [classes, setClasses] = React.useState<any[]>([]);
  const [selectedClass, setSelectedClass] = React.useState(searchParams.get('classId') || '');
  const [mostFrequentDay, setMostFrequentDay] = React.useState('-');
  const [avgLateMinutes, setAvgLateMinutes] = React.useState('-');
  const [selectedDate, setSelectedDate] = React.useState<string>(() => {
    const formatter = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(new Date());
  });
  const [highlightedStudentId, setHighlightedStudentId] = React.useState<string | null>(null);
  const threshold = 3;

  const [todaySavedRecords, setTodaySavedRecords] = React.useState<any[]>([]);
  const [loadingTodayRecords, setLoadingTodayRecords] = React.useState(false);
  const [unitClasses, setUnitClasses] = React.useState<any[]>([]);
  const [customReasons, setCustomReasons] = React.useState<Record<string, boolean>>({});

  // Edit saved reason state
  const [editingRecordId, setEditingRecordId] = React.useState<string | null>(null);
  const [editingReason, setEditingReason] = React.useState<string>('');
  const [editingCustomReason, setEditingCustomReason] = React.useState<boolean>(false);
  const [updatingReasonId, setUpdatingReasonId] = React.useState<string | null>(null);

  const handleUpdateReason = async (recordId: string) => {
    setUpdatingReasonId(recordId);
    try {
      const docRef = doc(db, 'lateness_records', recordId);
      await updateDoc(docRef, {
        reason: editingReason,
        updatedAt: serverTimestamp()
      });
      toast.success('Alasan keterlambatan berhasil diperbarui');
      setEditingRecordId(null);
      setEditingReason('');
      setEditingCustomReason(false);
    } catch (err) {
      console.error('Error updating lateness reason:', err);
      toast.error('Gagal memperbarui alasan keterlambatan');
    } finally {
      setUpdatingReasonId(null);
    }
  };

  React.useEffect(() => {
    const q = query(
      collection(db, 'classes'),
      where('unitId', '==', activeUnit || 'JUNIOR_HIGH')
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));
      setUnitClasses(list);
    }, (err) => {
      console.error('Error listening to unit classes:', err);
    });
    return () => unsubscribe();
  }, [activeUnit]);

  React.useEffect(() => {
    setLoadingTodayRecords(true);
    
    const q = query(
      collection(db, 'lateness_records'),
      where('date', '==', selectedDate)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const normalizeKey = (str: string) => {
        if (!str) return '';
        return str.toLowerCase().replace(/[^a-z0-9]/g, '');
      };

      const classKeys = unitClasses.flatMap(c => [c.id, c.name].filter(Boolean));
      const currentClassKeys = classes.flatMap(c => [c.id, c.name].filter(Boolean));
      const allKeys = Array.from(new Set([...classKeys, ...currentClassKeys]));
      const normalizedAllKeys = allKeys.map(k => normalizeKey(k));

      const recordsList = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() as any }))
        .filter((r: any) => {
          const unitToCompare = (activeUnit || 'JUNIOR_HIGH').toUpperCase();
          
          // 1. If explicit unitId exists and matches (case-insensitive)
          if (r.unitId) {
            return r.unitId.toUpperCase() === unitToCompare;
          }
          
          // 2. Try normalized classId/className matching
          const normClassId = normalizeKey(r.classId);
          const normClassName = normalizeKey(r.className);
          
          const matchesKey = (
            (normClassId && normalizedAllKeys.includes(normClassId)) ||
            (normClassName && normalizedAllKeys.includes(normClassName))
          );
          if (matchesKey) return true;

          // 3. Fallback name-based unit detection for safety (in case class maps are not loaded yet or legacy data)
          const isJuniorHigh = unitToCompare === 'JUNIOR_HIGH';
          const isElementary = unitToCompare === 'ELEMENTARY';
          const isKindergarten = unitToCompare === 'KINDERGARTEN';
          
          const nameLower = (r.className || '').toLowerCase();
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

          const isSd = nameLower.includes('sd') || 
                       nameLower.includes('elementary') || 
                       nameLower.includes('grade 1') || 
                       nameLower.includes('grade 2') || 
                       nameLower.includes('grade 3') || 
                       nameLower.includes('grade 4') || 
                       nameLower.includes('grade 5') || 
                       nameLower.includes('grade 6') ||
                       nameLower.includes('kelas 1') || 
                       nameLower.includes('kelas 2') || 
                       nameLower.includes('kelas 3') || 
                       nameLower.includes('kelas 4') || 
                       nameLower.includes('kelas 5') || 
                       nameLower.includes('kelas 6') ||
                       /\b(1|2|3|4|5|6)\b/.test(nameLower) ||
                       /\b(1|2|3|4|5|6)\b/.test(idLower) ||
                       nameLower.startsWith('1') ||
                       nameLower.startsWith('2') ||
                       nameLower.startsWith('3') ||
                       nameLower.startsWith('4') ||
                       nameLower.startsWith('5') ||
                       nameLower.startsWith('6');

          const isTk = nameLower.includes('tk') || 
                       nameLower.includes('kindergarten') || 
                       nameLower.includes('pra tk') || 
                       nameLower.includes('playgroup');

          if (isJuniorHigh && isSmp) return true;
          if (isElementary && isSd) return true;
          if (isKindergarten && isTk) return true;

          return false;
        });
      
      const mappedRecords = recordsList.map((r: any) => {
        const matchingClass = [...unitClasses, ...classes].find(c => 
          c.id === r.classId || 
          (r.classId && c.id.toLowerCase() === r.classId.toLowerCase()) || 
          c.name === r.classId || 
          (r.className && c.name.toLowerCase() === r.className.toLowerCase())
        );
        return {
          ...r,
          className: matchingClass?.name || r.className || 'Kelas Lain'
        };
      });

      if (activeUnit === 'JUNIOR_HIGH') {
        const getMillis = (r: any) => {
          if (!r.recordedAt) {
            return Date.now();
          }
          if (typeof r.recordedAt.toMillis === 'function') {
            return r.recordedAt.toMillis();
          }
          if (r.recordedAt.seconds) {
            return r.recordedAt.seconds * 1000;
          }
          if (r.recordedAt instanceof Date) {
            return r.recordedAt.getTime();
          }
          return 0;
        };
        mappedRecords.sort((a, b) => getMillis(b) - getMillis(a));
      } else {
        mappedRecords.sort((a, b) => (a.studentName || "").localeCompare(b.studentName || ""));
      }
      setTodaySavedRecords(mappedRecords);
      setLoadingTodayRecords(false);
    }, (err) => {
      console.error('Error listening today\'s lateness records:', err);
      setLoadingTodayRecords(false);
    });

    return () => unsubscribe();
  }, [selectedDate, classes, unitClasses, activeUnit]);

  const handleDeleteSavedRecord = async (id: string) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus data keterlambatan ini?')) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'lateness_records', id));
      toast.success('Data keterlambatan berhasil dihapus');
    } catch (err) {
      console.error('Error deleting lateness record:', err);
      toast.error('Gagal menghapus data keterlambatan');
    }
  };

  // Custom Dropdown States & Refs
  const [isClassDropdownOpen, setIsClassDropdownOpen] = React.useState(false);
  const classDropdownRef = React.useRef<HTMLDivElement>(null);
  const [isStudentDropdownOpen, setIsStudentDropdownOpen] = React.useState(false);
  const studentDropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (classDropdownRef.current && !classDropdownRef.current.contains(event.target as Node)) {
        setIsClassDropdownOpen(false);
      }
      if (studentDropdownRef.current && !studentDropdownRef.current.contains(event.target as Node)) {
        setIsStudentDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  React.useEffect(() => {
    const fetchClasses = async () => {
      try {
        const q = query(
          collection(db, 'classes'),
          where('unitId', '==', activeUnit)
        );
        const snap = await getDocs(q);
        const classList = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter((c: any) => c.academicYear === activeYear && c.status !== 'archived');
        
        setClasses(classList);
        setSelectedClass(prev => {
          if (prev && classList.some((c: any) => c.id === prev)) {
            return prev;
          }
          return classList[0]?.id || '';
        });
      } catch (err) {
        console.error('Error fetching classes:', err);
      }
    };
    fetchClasses();
  }, [activeUnit, activeYear]);

  React.useEffect(() => {
    if (!selectedClass) {
      setClassRoster([]);
      setLoading(false);
      return;
    }

    const loadRoster = async () => {
      setLoading(true);
      try {
        const currentClass = classes.find(c => c.id === selectedClass);
        const className = currentClass?.name || selectedClass;
        const classId = currentClass?.id || selectedClass;

        let fetchedStudents: { id: string; name: string; nickname?: string }[] = [];

        // 1. Try to load from active students enrollments
        try {
          const activeS = await getActiveStudents(classId, activeYear);
          if (activeS && activeS.length > 0) {
            fetchedStudents = activeS.map(s => ({
              id: s.id,
              name: s.name,
              nickname: s.nickname || (s as any).panggilan || (s as any).nicknameStr || ''
            }));
          }
        } catch (activeErr) {
          console.warn('Failed to load active students via helper in Lateness:', activeErr);
        }

        // 2. Fallback to querying multiple collections if no active students found
        if (fetchedStudents.length === 0) {
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
          
          const combinedDocs = [...snap1.docs, ...snap2.docs, ...snap3.docs, ...snap4.docs, ...snap5.docs, ...snap6.docs, ...snap7.docs];
          const uniqueDocsMap = new Map();

          combinedDocs.forEach(d => {
            const data = d.data();
            const studentId = data.luminaId || data.nis || data.nisn || d.id;
            
            if (!uniqueDocsMap.has(studentId)) {
              uniqueDocsMap.set(studentId, { 
                docId: d.id, 
                name: data.name || data.displayName || data.fullName,
                nickname: data.nickname || data.panggilan || data.nicknameStr || ''
              });
            }
          });

          fetchedStudents = Array.from(uniqueDocsMap.values()).map(data => ({
            id: data.docId,
            name: data.name || "Siswa Tanpa Nama",
            nickname: data.nickname || ''
          }));
        }

        const filteredStudents = fetchedStudents.filter(student => {
          const lowerName = student.name.toLowerCase();
          const isClassPlaceholder = 
            lowerName === 'gc smp' || 
            lowerName.includes('grade ') || 
            lowerName.includes('kelas ') ||
            lowerName.includes('general class') ||
            lowerName.includes('placeholder') ||
            lowerName.includes('test student');
          return !isClassPlaceholder && student.name.trim().length > 1;
        });

        setClassRoster(filteredStudents);
      } catch (err) {
        console.error('Error loading roster:', err);
        toast.error('Gagal memuat roster siswa');
      } finally {
        setLoading(false);
      }
    };

    loadRoster();
  }, [selectedClass, classes, activeYear]);

  React.useEffect(() => {
    if (!selectedClass) {
      setClassStudentsList([]);
      return;
    }

    const currentClass = classes.find(c => c.id === selectedClass);
    const className = currentClass?.name || selectedClass;
    const classId = currentClass?.id || selectedClass;

    const classKeys = [classId];
    if (className && className !== classId) {
      classKeys.push(className);
    }

    const latenessQuery = query(
      collection(db, 'lateness_records'),
      where('classId', 'in', classKeys)
    );

    const unsubscribe = onSnapshot(latenessQuery, (snap) => {
      const allRecords = snap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

      // 1. Calculate this month's records
      const todayObj = new Date(selectedDate);
      const startOfMonth = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, '0')}-01`;
      const thisMonthRecords = allRecords.filter(r => r.date >= startOfMonth);

      const latenessCountMap: Record<string, number> = {};
      thisMonthRecords.forEach(r => {
        if (r.studentId) {
          latenessCountMap[r.studentId] = (latenessCountMap[r.studentId] || 0) + 1;
        }
      });

      // 2. Calculate statistics (most frequent day & average late minutes)
      const getDayName = (dateStr: string) => {
        if (!dateStr) return '';
        const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        const [year, month, day] = dateStr.split('-').map(Number);
        const d = new Date(year, month - 1, day);
        return days[d.getDay()];
      };

      const dayCounts: Record<string, number> = {};
      allRecords.forEach(d => {
        const dayName = getDayName(d.date);
        if (dayName) {
          dayCounts[dayName] = (dayCounts[dayName] || 0) + 1;
        }
      });

      let maxCount = 0;
      let mostFrequentDays: string[] = [];
      Object.entries(dayCounts).forEach(([day, count]) => {
        if (count > maxCount) {
          maxCount = count;
          mostFrequentDays = [day];
        } else if (count === maxCount) {
          mostFrequentDays.push(day);
        }
      });

      const info = getUnitInfo();
      const timeToMinutes = (t: string) => {
        if (!t || !t.includes(':')) return 0;
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
      };

      let totalLateMinutes = 0;
      let lateRecordsWithTimeCount = 0;
      const targetTime = info.time;

      allRecords.forEach(d => {
        if (d.arrivalTime) {
          const minutesLate = timeToMinutes(d.arrivalTime) - timeToMinutes(targetTime);
          if (minutesLate > 0) {
            totalLateMinutes += minutesLate;
            lateRecordsWithTimeCount++;
          }
        }
      });

      const calculatedMostFrequentDay = mostFrequentDays.length > 0 ? mostFrequentDays.join(' & ') : '-';
      const calculatedAvgMinutes = lateRecordsWithTimeCount > 0 ? `${Math.round(totalLateMinutes / lateRecordsWithTimeCount)} Menit` : '-';

      setMostFrequentDay(calculatedMostFrequentDay);
      setAvgLateMinutes(calculatedAvgMinutes);

      // 3. Create a map of existing lateness records for today to check if we should pre-fill them
      const todayRecordsMap: Record<string, any> = {};
      allRecords.forEach(r => {
        if (r.studentId && r.date === selectedDate) {
          todayRecordsMap[r.studentId] = r;
        }
      });

      // 4. Update student list
      let studentList: LatenessRecord[] = classRoster.map(student => {
        const todayRecord = todayRecordsMap[student.id];
        return {
          id: student.id,
          name: student.name,
          nickname: student.nickname || '',
          arrivalTime: todayRecord ? todayRecord.arrivalTime : '',
          reason: todayRecord ? todayRecord.reason : '',
          parentNote: todayRecord ? todayRecord.parentNote || false : false,
          countThisMonth: latenessCountMap[student.id] || 0,
          className: className,
          classId: classId
        };
      });

      if (activeUnit === 'JUNIOR_HIGH') {
        studentList = studentList.filter(s => !todayRecordsMap[s.id]);
      }

      setRecords(prev => {
        // Keep records that have unsaved changes or are marked as manual
        const recordsToKeep = prev.filter(r => {
          const saved = todayRecordsMap[r.id];
          if (saved) {
            if (activeUnit === 'JUNIOR_HIGH') return false;
            return r.arrivalTime !== saved.arrivalTime || r.reason !== saved.reason || r.parentNote !== saved.parentNote;
          } else {
            return r.arrivalTime !== '' || r.reason !== '' || r.isManual;
          }
        });
        
        const manualRecords = recordsToKeep.filter(r => !studentList.some(s => s.id === r.id));
        const alreadyFilledRecords = studentList.filter(s => s.arrivalTime !== '');
        
        return [...manualRecords, ...alreadyFilledRecords.map(s => {
          const existing = recordsToKeep.find(r => r.id === s.id);
          return existing ? { ...s, ...existing, countThisMonth: s.countThisMonth } : s;
        })];
      });

      setClassStudentsList(studentList);
    }, (err) => {
      console.error('Error listening to lateness records:', err);
    });

    return () => unsubscribe();
  }, [selectedClass, classes, selectedDate, classRoster]);

  const updateTime = (id: string, arrivalTime: string) => {
    setRecords(records.map(r => r.id === id ? { ...r, arrivalTime } : r));
  };

  const updateReason = (id: string, reason: string) => {
    setRecords(records.map(r => r.id === id ? { ...r, reason } : r));
  };

  const toggleNote = (id: string) => {
    setRecords(records.map(r => r.id === id ? { ...r, parentNote: !r.parentNote } : r));
  };

  const removeRecord = (id: string) => {
    setRecords(records.filter(r => r.id !== id));
    toast.info('Siswa dihapus dari daftar input');
  };

  const handleSave = async () => {
    const filledEntries = records.filter(r => r.arrivalTime !== '');
    if (filledEntries.length === 0) {
      toast.error('Tidak ada data kedatangan yang diisi');
      return;
    }

    const lateEntries = filledEntries.filter(r => r.arrivalTime > unitInfo.time);
    const onTimeEntries = filledEntries.filter(r => r.arrivalTime <= unitInfo.time);

    if (lateEntries.length === 0 && onTimeEntries.length > 0) {
      toast.error('Semua data kedatangan yang diisi adalah Tepat Waktu (tidak terlambat). Data keterlambatan tidak perlu disimpan.');
      return;
    }

    setSaving(true);
    try {
      const today = selectedDate;
      const currentClassObj = classes.find(c => c.id === selectedClass) || { id: selectedClass, name: selectedClass };
      const defaultClassName = currentClassObj.name || selectedClass;

      for (const entry of lateEntries) {
        const docId = `LATE_${today}_${entry.id}`;
        
        const studentClassId = entry.classId || selectedClass;
        const studentClassName = entry.className || defaultClassName;

        await setDoc(doc(db, 'lateness_records', docId), {
          studentId: entry.id,
          studentName: entry.name,
          date: today,
          arrivalTime: entry.arrivalTime,
          reason: entry.reason,
          parentNote: entry.parentNote,
          recordedAt: serverTimestamp(),
          classId: studentClassId,
          className: studentClassName,
          academicYear: activeYear,
          unitId: activeUnit
        });
      }

      let message = `Data keterlambatan berhasil disimpan untuk ${lateEntries.length} siswa.`;
      if (onTimeEntries.length > 0) {
        message += ` (${onTimeEntries.length} siswa tepat waktu diabaikan dari pencatatan keterlambatan)`;
      }
      toast.success(message);

      const hasNotificationTrigger = lateEntries.some(e => {
        if (activeUnit === 'JUNIOR_HIGH') {
          return e.countThisMonth >= threshold;
        }
        return e.parentNote || e.countThisMonth >= threshold;
      });

      if (hasNotificationTrigger) {
        toast.info('Notifikasi telah dikirim ke orang tua via WhatsApp/Email', {
          description: 'Sistem Lumina otomatis mengirimkan pesan untuk siswa dengan catatan khusus.'
        });
      }

      // Clear the saved late records from the screen
      setRecords(prev => prev.filter(r => !lateEntries.some(le => le.id === r.id)));
    } catch (err) {
      console.error('Error saving lateness:', err);
      toast.error('Gagal menyimpan data');
    } finally {
      setSaving(false);
    }
  };

  const filteredRecords = records.filter(r => 
    r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.nickname && r.nickname.toLowerCase().includes(searchTerm.toLowerCase())) ||
    r.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getUnitInfo = () => {
    switch(activeUnit) {
      case 'KINDERGARTEN': return { name: 'Kindergarten', time: '08:00', label: 'TK' };
      case 'ELEMENTARY': return { name: 'Elementary', time: '07:30', label: 'SD' };
      case 'JUNIOR_HIGH': return { name: 'Junior High', time: '07:30', label: 'SMP' };
      default: return { name: 'Academy', time: '07:30', label: 'Sekolah' };
    }
  };

  const unitInfo = getUnitInfo();

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Data Keterlambatan</h1>
          <p className="text-gray-500 font-medium">Lumina {unitInfo.name} - Jam Masuk: {unitInfo.time} WIB</p>
        </div>
        <div className="bg-blue-50 px-4 py-2 rounded-xl border border-blue-100 flex items-center gap-2">
           <Calendar className="text-blue-600" size={18} />
           <input 
             type="date"
             value={selectedDate}
             onChange={(e) => setSelectedDate(e.target.value)}
             className="bg-transparent border-none outline-none text-sm font-bold text-blue-800 cursor-pointer focus:ring-0"
           />
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Input Section */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100">
             <div className="p-6 border-b border-gray-50 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="font-bold text-gray-900 flex items-center gap-2 whitespace-nowrap">
                     <Clock size={18} className="text-orange-500" />
                     Input Kedatangan
                  </h2>
                  <div className="relative" ref={classDropdownRef}>
                    <button
                      type="button"
                      onClick={() => {
                        setIsClassDropdownOpen(!isClassDropdownOpen);
                        setIsStudentDropdownOpen(false);
                      }}
                      className="bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-lg px-3 py-1.5 text-xs font-bold text-gray-700 outline-none focus:ring-1 focus:ring-blue-500 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <span>{classes.find(c => c.id === selectedClass)?.name || 'Pilih Kelas'}</span>
                      <ChevronDown size={14} className={cn("text-gray-400 transition-transform duration-200", isClassDropdownOpen && "rotate-180")} />
                    </button>
                    
                    {isClassDropdownOpen && (
                      <div className="absolute left-0 mt-1 w-48 bg-white border border-gray-100 rounded-xl shadow-lg py-1.5 z-50 max-h-60 overflow-y-auto focus:outline-none">
                        {classes.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-gray-400 italic">Tidak ada kelas</div>
                        ) : (
                          classes.map(c => {
                            const isSelected = c.id === selectedClass;
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => {
                                  setSelectedClass(c.id);
                                  setIsClassDropdownOpen(false);
                                }}
                                className={cn(
                                  "w-full text-left px-3 py-2 text-xs font-medium transition-colors flex items-center justify-between",
                                  isSelected ? "bg-blue-50 text-blue-700 font-bold" : "text-gray-700 hover:bg-gray-50"
                                )}
                              >
                                <span>{c.name}</span>
                                {isSelected && <Check size={12} className="text-blue-600" />}
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>

                  {selectedClass && (() => {
                    return (
                      <div className="relative" ref={studentDropdownRef}>
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => {
                            setIsStudentDropdownOpen(!isStudentDropdownOpen);
                            setIsClassDropdownOpen(false);
                          }}
                          className="bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-lg px-3 py-1.5 text-xs font-bold text-gray-700 outline-none focus:ring-1 focus:ring-blue-500 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <span className="truncate max-w-[120px]">
                            Pilih Siswa ({classStudentsList.length})
                          </span>
                          <ChevronDown size={14} className={cn("text-gray-400 transition-transform duration-200 flex-shrink-0", isStudentDropdownOpen && "rotate-180")} />
                        </button>

                        {isStudentDropdownOpen && (
                          <div className="absolute left-0 mt-1 w-64 bg-white border border-gray-100 rounded-xl shadow-lg py-1.5 z-50 max-h-60 overflow-y-auto focus:outline-none">
                            {loading ? (
                              <div className="px-3 py-2 text-xs text-gray-400 italic">Memuat siswa...</div>
                            ) : classStudentsList.length === 0 ? (
                              <div className="px-3 py-2 text-xs text-gray-400 italic">Tidak ada siswa</div>
                            ) : (
                              [...classStudentsList]
                                .sort((a, b) => a.name.localeCompare(b.name))
                                .map(s => {
                                  const isAdded = records.some(r => r.id === s.id);
                                  return (
                                    <button
                                      key={s.id}
                                      type="button"
                                      onClick={() => {
                                        const studentId = s.id;
                                        
                                        // Ensure the student exists in records and has arrivalTime initialized
                                        setRecords(prev => {
                                          const exists = prev.some(r => r.id === studentId);
                                          if (exists) {
                                            return prev.map(r => {
                                              if (r.id === studentId) {
                                                return { 
                                                  ...r, 
                                                  arrivalTime: r.arrivalTime || getCurrentTimeStr() 
                                                };
                                              }
                                              return r;
                                            });
                                          } else {
                                            // Add back from classStudentsList
                                            const originalStudent = classStudentsList.find(cs => cs.id === studentId);
                                            if (originalStudent) {
                                              return [
                                                { 
                                                  ...originalStudent, 
                                                  arrivalTime: getCurrentTimeStr() 
                                                },
                                                ...prev
                                              ];
                                            }
                                            return prev;
                                          }
                                        });

                                        setHighlightedStudentId(studentId);
                                        setIsStudentDropdownOpen(false);
                                        
                                        setTimeout(() => {
                                          const rowElement = document.getElementById(`student-row-${studentId}`);
                                          if (rowElement) {
                                            rowElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                          }
                                          const timeInputElement = document.getElementById(`time-input-${studentId}`);
                                          if (timeInputElement) {
                                            (timeInputElement as HTMLInputElement).focus();
                                          }
                                        }, 100);

                                        setTimeout(() => {
                                          setHighlightedStudentId(null);
                                        }, 3000);
                                      }}
                                      className={cn(
                                        "w-full text-left px-3 py-2 text-xs font-medium transition-colors flex items-center justify-between gap-2 truncate",
                                        isAdded ? "bg-blue-50/70 text-blue-700 font-bold" : "text-gray-700 hover:bg-gray-50"
                                      )}
                                    >
                                      <span className="truncate">{s.name}</span>
                                      {isAdded && <Check size={12} className="text-blue-600 flex-shrink-0" />}
                                    </button>
                                  );
                                })
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div className="relative flex-1 max-w-xs">
                   <StudentSearch 
                     placeholder="Cari nama/panggilan..."
                     unitId={activeUnit}
                     academicYear={activeYear}
                     onSelect={(student) => {
                       // Check if already in list
                       if (records.some(r => r.id === student.id)) {
                         toast.info(`${student.name} sudah ada di daftar`);
                         return;
                       }

                       // Prevent selecting already recorded late students for Junior High
                       if (activeUnit === 'JUNIOR_HIGH' && todaySavedRecords.some(r => r.studentId === student.id)) {
                         toast.error(`${student.name} sudah tercatat terlambat hari ini`);
                         return;
                       }

                       // Automatically identify class if student has it
                       let finalClassId = selectedClass;
                       const studentClassId = student.classId;
                       const studentClassName = student.className;

                       // Find the class in the currently loaded unit's active classes
                       const foundClass = classes.find(c => 
                         (studentClassId && (c.id === studentClassId || c.name.toLowerCase() === studentClassId.toLowerCase() || c.id.toLowerCase().includes(studentClassId.toLowerCase()))) ||
                         (studentClassName && (c.name.toLowerCase() === studentClassName.toLowerCase() || studentClassName.toLowerCase().includes(c.name.toLowerCase())))
                       );

                       if (foundClass) {
                         finalClassId = foundClass.id;
                         setSelectedClass(foundClass.id);
                       } else if (studentClassId) {
                         finalClassId = studentClassId;
                         setSelectedClass(studentClassId);
                       } else if (studentClassName) {
                         // Try to find class by name (exact or loose match)
                         const foundClassByLabel = classes.find(c => 
                           c.name.toLowerCase() === studentClassName.toLowerCase() ||
                           studentClassName.toLowerCase().includes(c.name.toLowerCase())
                         );
                         if (foundClassByLabel) {
                           finalClassId = foundClassByLabel.id;
                           setSelectedClass(foundClassByLabel.id);
                         }
                       }
                       
                       // Try to resolve class name from ID if still missing
                       const resolvedClassName = studentClassName || classes.find(c => c.id === finalClassId)?.name;

                       const newRecord: LatenessRecord = {
                         id: student.id,
                         name: student.name,
                         nickname: student.nickname || "",
                         arrivalTime: getCurrentTimeStr(), // Auto-detect current time when searched/added
                         reason: '',
                         parentNote: false,
                         countThisMonth: 0,
                         className: resolvedClassName,
                         classId: finalClassId,
                         isManual: true
                       };
                       
                       setRecords(prev => [newRecord, ...prev.filter(r => r.id !== student.id)]);
                       toast.success(`${student.name} ditambahkan (${resolvedClassName || 'Tanpa Kelas'})`);
                     }}
                   />
                </div>
             </div>
             
             <div className="overflow-x-auto rounded-b-3xl">
                {loading ? (
                  <div className="p-12 flex flex-col items-center justify-center gap-2 text-gray-400">
                    <Loader2 size={24} className="animate-spin text-blue-500" />
                    <p className="text-xs font-medium uppercase tracking-widest">Memuat daftar siswa...</p>
                  </div>
                ) : filteredRecords.length === 0 ? (
                  <div className="p-12 text-center text-gray-400">
                    <p className="text-sm italic">Tidak ada siswa ditemukan di kelas ini.</p>
                  </div>
                ) : (
                  <table className="w-full text-left">
                    <thead className="bg-gray-50/50">
                        <tr>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Siswa</th>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Waktu Tiba</th>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Alasan / Keterangan</th>
                          {activeUnit !== 'JUNIOR_HIGH' && (
                            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Izin Ortu</th>
                          )}
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Batal</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {filteredRecords.map(record => (
                          <tr 
                            key={record.id} 
                            id={`student-row-${record.id}`}
                            className={cn(
                              "hover:bg-gray-50/50 transition-all duration-300", 
                              record.id === highlightedStudentId ? "bg-amber-50 ring-2 ring-amber-500/30" : ""
                            )}
                          >
                              <td className="px-6 py-4">
                                <div className="flex flex-col">
                                  <p className="font-bold text-gray-900 text-sm">{record.name}</p>
                                  {record.className && (
                                    <p className="text-[10px] font-medium text-blue-500 bg-blue-50 w-fit px-1 rounded-sm mt-0.5">{record.className}</p>
                                  )}
                                  {!record.className && (
                                    <p className="text-[10px] font-medium text-gray-400 italic">Kelas belum teridentifikasi</p>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 mt-1">
                                    {record.countThisMonth >= threshold ? (
                                      <span className="flex items-center gap-1 text-[9px] font-black text-red-500 bg-red-50 px-1.5 py-0.5 rounded uppercase border border-red-100">
                                          <AlertCircle size={10} />
                                          Sering Terlambat ({record.countThisMonth}x)
                                      </span>
                                    ) : (
                                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Frekuensi: {record.countThisMonth}x bulan ini</span>
                                    )}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex flex-col gap-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <input 
                                        type="time" 
                                        id={`time-input-${record.id}`}
                                        className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-1.5 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500 w-32"
                                        value={record.arrivalTime}
                                        onChange={(e) => updateTime(record.id, e.target.value)}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => updateTime(record.id, getCurrentTimeStr())}
                                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all shrink-0"
                                      title="Set jam saat ini"
                                    >
                                      <Clock size={16} />
                                    </button>
                                  </div>
                                  {record.arrivalTime && (
                                    <span className={cn(
                                      "text-[10px] font-bold px-1.5 py-0.5 rounded w-fit uppercase tracking-wider",
                                      record.arrivalTime > unitInfo.time 
                                        ? "bg-red-50 text-red-600 border border-red-100" 
                                        : "bg-emerald-50 text-emerald-600 border border-emerald-100"
                                    )}>
                                      {record.arrivalTime > unitInfo.time ? 'Terlambat' : 'Tepat Waktu'}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                {activeUnit === 'JUNIOR_HIGH' ? (
                                  (() => {
                                    const isPreset = JUNIOR_HIGH_REASONS.includes(record.reason) || record.reason === '';
                                    const isCustom = customReasons[record.id] || (record.reason !== '' && !isPreset);

                                    if (isCustom) {
                                      return (
                                        <div className="flex items-center gap-2 w-full">
                                          <input 
                                              type="text" 
                                              placeholder="Tulis alasan..."
                                              className="flex-1 bg-transparent border-b border-gray-300 focus:border-blue-500 outline-none text-sm transition-all py-1 placeholder:text-gray-300 font-medium"
                                              value={record.reason}
                                              onChange={(e) => updateReason(record.id, e.target.value)}
                                              autoFocus
                                          />
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setCustomReasons(prev => ({ ...prev, [record.id]: false }));
                                              updateReason(record.id, '');
                                            }}
                                            className="text-xs font-black text-gray-400 hover:text-blue-600 uppercase tracking-wider shrink-0"
                                            title="Kembali ke pilihan"
                                          >
                                            Batal
                                          </button>
                                        </div>
                                      );
                                    }

                                    return (
                                      <select
                                        value={record.reason}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          if (val === 'custom') {
                                            setCustomReasons(prev => ({ ...prev, [record.id]: true }));
                                            updateReason(record.id, '');
                                          } else {
                                            updateReason(record.id, val);
                                          }
                                        }}
                                        className="w-full bg-transparent border-b border-gray-200 hover:border-gray-300 focus:border-blue-500 outline-none text-sm py-1 font-medium text-gray-700 cursor-pointer"
                                      >
                                        <option value="" className="text-gray-400">-- Pilih Alasan --</option>
                                        {JUNIOR_HIGH_REASONS.map(r => (
                                          <option key={r} value={r} className="text-gray-700 font-medium">{r}</option>
                                        ))}
                                        <option value="custom" className="text-blue-600 font-bold">Lainnya (Tulis manual)...</option>
                                      </select>
                                    );
                                  })()
                                ) : (
                                  <input 
                                      type="text" 
                                      placeholder="Tulis alasan..."
                                      className="w-full bg-transparent border-b border-transparent focus:border-blue-300 outline-none text-sm transition-all py-1 placeholder:text-gray-300"
                                      value={record.reason}
                                      onChange={(e) => updateReason(record.id, e.target.value)}
                                  />
                                )}
                              </td>
                              {activeUnit !== 'JUNIOR_HIGH' && (
                                <td className="px-6 py-4 text-center">
                                  <button 
                                      onClick={() => toggleNote(record.id)}
                                      className={cn(
                                        "p-2 rounded-xl transition-all",
                                        record.parentNote ? "bg-emerald-100 text-emerald-600" : "bg-gray-100 text-gray-300 hover:text-gray-400"
                                      )}
                                  >
                                      <UserCheck size={18} />
                                  </button>
                                </td>
                              )}
                              <td className="px-6 py-4 text-right">
                                <button 
                                    onClick={() => removeRecord(record.id)}
                                    className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                    title="Hapus dari daftar"
                                >
                                    <Trash2 size={18} />
                                </button>
                              </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}
             </div>
          </div>

          <div className="flex justify-end gap-3">
             <button 
              disabled={saving || loading}
              onClick={handleSave}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-10 py-3 rounded-2xl shadow-xl shadow-blue-100 transition-all disabled:opacity-50"
             >
                {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                {saving ? 'Menyimpan...' : 'Simpan & Kirim Notifikasi'}
             </button>
          </div>

          {/* Keterlambatan Hari Ini Section */}
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
             <div className="p-6 border-b border-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                   <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                      <Clock size={20} />
                   </div>
                   <div>
                      <h2 className="font-bold text-gray-900 text-sm">Keterlambatan Hari Ini</h2>
                      <p className="text-xs text-gray-500">Daftar siswa yang tercatat terlambat pada {getFormattedSelectedDate(selectedDate)}</p>
                   </div>
                </div>
                <span className="bg-amber-50 text-amber-700 text-xs font-bold px-2.5 py-1 rounded-full">
                   {todaySavedRecords.length} Siswa
                </span>
             </div>

             <div className="overflow-x-auto">
                {loadingTodayRecords ? (
                  <div className="p-8 flex flex-col items-center justify-center gap-2 text-gray-400">
                    <Loader2 size={24} className="animate-spin text-blue-500" />
                    <p className="text-xs font-medium uppercase tracking-widest">Memuat data keterlambatan...</p>
                  </div>
                ) : todaySavedRecords.length === 0 ? (
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
                          {activeUnit !== 'JUNIOR_HIGH' && (
                            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Izin Ortu</th>
                          )}
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Aksi</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {todaySavedRecords.map((record) => (
                          <tr key={record.id} className="hover:bg-gray-50/30 transition-all duration-200">
                              <td className="px-6 py-4">
                                <p className="font-bold text-gray-900 text-sm">{record.studentName}</p>
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-xs font-medium text-blue-500 bg-blue-50 px-2 py-0.5 rounded-sm">
                                  {record.className}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded-sm">
                                  {record.arrivalTime}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                {editingRecordId === record.id ? (
                                  activeUnit === 'JUNIOR_HIGH' ? (
                                    (() => {
                                      if (editingCustomReason) {
                                        return (
                                          <div className="flex items-center gap-2 w-full">
                                            <input 
                                                type="text" 
                                                placeholder="Tulis alasan..."
                                                className="flex-1 bg-transparent border-b border-gray-300 focus:border-blue-500 outline-none text-sm transition-all py-1 placeholder:text-gray-300 font-medium"
                                                value={editingReason}
                                                onChange={(e) => setEditingReason(e.target.value)}
                                                autoFocus
                                            />
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setEditingCustomReason(false);
                                                setEditingReason('');
                                              }}
                                              className="text-xs font-black text-gray-400 hover:text-blue-600 uppercase tracking-wider shrink-0"
                                              title="Kembali ke pilihan"
                                            >
                                              Batal
                                            </button>
                                          </div>
                                        );
                                      }

                                      return (
                                        <select
                                          value={editingReason}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            if (val === 'custom') {
                                              setEditingCustomReason(true);
                                              setEditingReason('');
                                            } else {
                                              setEditingReason(val);
                                            }
                                          }}
                                          className="w-full bg-transparent border-b border-gray-200 hover:border-gray-300 focus:border-blue-500 outline-none text-sm py-1 font-medium text-gray-700 cursor-pointer"
                                        >
                                          <option value="" className="text-gray-400">-- Pilih Alasan --</option>
                                          {JUNIOR_HIGH_REASONS.map(r => (
                                            <option key={r} value={r} className="text-gray-700 font-medium">{r}</option>
                                          ))}
                                          <option value="custom" className="text-blue-600 font-bold">Lainnya (Tulis manual)...</option>
                                        </select>
                                      );
                                    })()
                                  ) : (
                                    <input 
                                        type="text" 
                                        placeholder="Tulis alasan..."
                                        className="w-full bg-transparent border-b border-gray-300 focus:border-blue-500 outline-none text-sm transition-all py-1 placeholder:text-gray-300"
                                        value={editingReason}
                                        onChange={(e) => setEditingReason(e.target.value)}
                                        autoFocus
                                    />
                                  )
                                ) : (
                                  <div className="flex items-center gap-2 group min-h-[32px]">
                                    <p className="text-sm text-gray-600">{record.reason || <span className="text-gray-300 italic">-</span>}</p>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingRecordId(record.id);
                                        setEditingReason(record.reason || '');
                                        const isPreset = JUNIOR_HIGH_REASONS.includes(record.reason || '') || (record.reason || '') === '';
                                        setEditingCustomReason(!isPreset);
                                      }}
                                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-blue-500 rounded transition-all shrink-0 cursor-pointer"
                                      title="Edit Alasan"
                                    >
                                      <Edit2 size={12} />
                                    </button>
                                  </div>
                                )}
                              </td>
                              {activeUnit !== 'JUNIOR_HIGH' && (
                                <td className="px-6 py-4 text-center">
                                  <span className={cn(
                                    "inline-flex p-1.5 rounded-lg text-xs font-semibold",
                                    record.parentNote ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-gray-50 text-gray-400 border border-gray-100"
                                  )}>
                                    {record.parentNote ? 'Ada Izin' : 'Tanpa Izin'}
                                  </span>
                                </td>
                              )}
                              <td className="px-6 py-4 text-right">
                                {editingRecordId === record.id ? (
                                  <div className="flex items-center justify-end gap-1">
                                    <button 
                                        onClick={() => handleUpdateReason(record.id)}
                                        disabled={updatingReasonId === record.id}
                                        className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all cursor-pointer"
                                        title="Simpan Perubahan"
                                    >
                                        {updatingReasonId === record.id ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                    </button>
                                    <button 
                                        onClick={() => {
                                          setEditingRecordId(null);
                                          setEditingReason('');
                                          setEditingCustomReason(false);
                                        }}
                                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all cursor-pointer"
                                        title="Batal"
                                    >
                                        <X size={16} />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-end gap-1">
                                    <button 
                                        onClick={() => {
                                          setEditingRecordId(record.id);
                                          setEditingReason(record.reason || '');
                                          const isPreset = JUNIOR_HIGH_REASONS.includes(record.reason || '') || (record.reason || '') === '';
                                          setEditingCustomReason(!isPreset);
                                        }}
                                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all cursor-pointer"
                                        title="Edit Alasan"
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                    <button 
                                        onClick={() => handleDeleteSavedRecord(record.id)}
                                        className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
                                        title="Hapus Keterlambatan"
                                    >
                                        <Trash2 size={16} />
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

        {/* Info & Alerts Sidebar */}
        <div className="space-y-6">

           <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-6">
              <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                 <TrendingUp size={16} className="text-blue-500" />
                 Analisis Pola Keterlambatan
              </h3>
              <div className="space-y-4">
                 <div className="p-4 bg-gray-50 rounded-2xl border border-gray-50 flex items-center justify-between">
                    <div>
                       <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Paling Sering Terlambat</p>
                       <p className="text-sm font-bold text-gray-800">{mostFrequentDay}</p>
                    </div>
                    <History size={20} className="text-gray-200" />
                 </div>
                 <div className="p-4 bg-gray-50 rounded-2xl border border-gray-50 flex items-center justify-between">
                    <div>
                       <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Rata-rata Menit Terlambat</p>
                       <p className="text-sm font-bold text-gray-800">{avgLateMinutes}</p>
                    </div>
                    <Clock size={20} className="text-gray-200" />
                 </div>
              </div>
           </div>


        </div>
      </div>
    </div>
  );
}
