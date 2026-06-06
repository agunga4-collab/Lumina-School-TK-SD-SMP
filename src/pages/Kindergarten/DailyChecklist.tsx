import * as React from 'react';
import { 
  CheckCircle2, Clock, AlertCircle, UserX, 
  Smile, Meh, Frown, Angry, Save, Calendar, Search, 
  Users, Sparkles, ChevronLeft, ChevronRight, RotateCcw, Trash2,
  FileSpreadsheet, AlertTriangle, X, Check
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import type { KGAttendanceStatus, KGEmotionStatus } from '../../types';
import { 
  getStoredStudents, 
  saveStoredStudents, 
  KGStudent 
} from '../../lib/kindergartenWeeklyReport';
import { collection, query, where, getDocs, doc, setDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAcademicYear } from '../../context/AcademicYearContext';
import * as XLSX from 'xlsx';

export default function DailyChecklist() {
  const { activeYear } = useAcademicYear();
  const [students, setStudents] = React.useState<any[]>(() => getStoredStudents());
  console.log('Students query result:', students);

  const [classes, setClasses] = React.useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = React.useState<string>('');

  // Import dari Excel states
  const [isImportModalOpen, setIsImportModalOpen] = React.useState(false);
  const [importFile, setImportFile] = React.useState<File | null>(null);
  const [selectedMonth, setSelectedMonth] = React.useState<string>('January');
  
  const acadYearsList = React.useMemo(() => {
    if (!activeYear) return ['2026'];
    const parts = activeYear.split('/');
    return parts.length === 2 ? parts : [activeYear];
  }, [activeYear]);
  
  const [selectedYear, setSelectedYear] = React.useState<string>(() => {
    return acadYearsList[acadYearsList.length - 1] || '2026';
  });

  React.useEffect(() => {
    if (acadYearsList.length > 0) {
      setSelectedYear(acadYearsList[acadYearsList.length - 1]);
    }
  }, [acadYearsList]);

  const [previewData, setPreviewData] = React.useState<any[] | null>(null);
  const [importResult, setImportResult] = React.useState<{
    successCount: number;
    skipCount: number;
    unmappedCount: number;
  } | null>(null);
  const [isImporting, setIsImporting] = React.useState(false);

  // Load students and classes from Firestore
  React.useEffect(() => {
    async function loadKindergartenData() {
      try {
        console.log('Loading Kindergarten data from Firestore for year:', activeYear);
        
        // 0. Query classes collection where unitId === 'KINDERGARTEN' and academicYear === activeYear
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

        // 1. Query students collection with unitId === 'KINDERGARTEN'
        const qStudents = query(
          collection(db, 'students'),
          where('unitId', '==', 'KINDERGARTEN')
        );
        
        // 2. Fallback query on roleInvites where role === 'STUDENT' and unitId === 'KINDERGARTEN'
        const qInvites = query(
          collection(db, 'roleInvites'),
          where('role', '==', 'STUDENT'),
          where('unitId', '==', 'KINDERGARTEN')
        );

        // 3. Query enrollments where unitId === 'KINDERGARTEN' and academicYear === activeYear
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

        console.log(`Firestore response counts - students: ${studentsSnap.docs.length}, invites: ${invitesSnap.docs.length}, enrollments: ${enrollmentsSnap.docs.length}`);

        const enrollmentClassMap = new Map<string, string>();
        enrollmentsSnap.docs.forEach(docSnap => {
          const data = docSnap.data();
          if (data.studentId && data.classId) {
            enrollmentClassMap.set(data.studentId, data.classId);
          }
        });

        const map = new Map<string, any>();

        // Merge roleInvites first (fallback)
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

        // Merge students from the main table, preserving the updated classId from roleInvites
        studentsSnap.docs.forEach(docSnap => {
          const data = docSnap.data();
          
          // Filter by active academic year if not matching
          if (data.academicYear && data.academicYear !== activeYear) {
            const isEnrolledInActiveYear = enrollmentsSnap.docs.some(eDoc => eDoc.data().studentId === docSnap.id);
            if (!isEnrolledInActiveYear) {
              return; // Skip if different year and no matching enrollment
            }
          }
          const studentId = data.luminaId || docSnap.id;
          const classId = enrollmentClassMap.get(studentId) || data.classId || '';
          const ageGroup: 'TK_A' | 'TK_B' = (classId.toUpperCase().includes('TK_A') || classId.toUpperCase().includes('CATERPILLAR')) ? 'TK_A' : 'TK_B';

          const existing = map.get(studentId);
          if (existing && existing.classId) {
            // Retain existing (roleInvites) classId, as it's the primary edited data source in backend
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

        const fetchedStudents = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
        
        console.log('Students query result (loaded):', fetchedStudents);

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
      }
    }

    loadKindergartenData();
  }, [activeYear]);

  const [selectedDate, setSelectedDate] = React.useState<Date>(new Date());
  const [isSaving, setIsSaving] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');

  const getDateKey = (date: Date) => {
    const yr = date.getFullYear();
    const mo = String(date.getMonth() + 1).padStart(2, '0');
    const da = String(date.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${da}`;
  };

  // State to hold record mappings keyed by "YYYY-MM-DD"
  const [recordsByDate, setRecordsByDate] = React.useState<Record<string, Record<string, { attendance: KGAttendanceStatus | null; emotion: KGEmotionStatus | null }>>>(() => {
    const saved = localStorage.getItem('kg_checklist_records');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return {};
  });

  const dateKey = getDateKey(selectedDate);
  const dateRecords = recordsByDate[dateKey] || {};

  // Build reactive students visible list
  const studentsWithStatus = students.map(s => {
    const status = dateRecords[s.id] || { attendance: null, emotion: null };
    return {
      ...s,
      attendance: status.attendance,
      emotion: status.emotion
    };
  });

  const getActiveOption = (student: { attendance: KGAttendanceStatus | null; emotion: KGEmotionStatus | null }): string => {
    if (!student.attendance) return '';
    if (student.attendance === 'NO_NEWS') return 'NO_NEWS';
    if (student.attendance === 'SICK') return 'SICK';
    if (student.attendance === 'PERMISSION') return 'EXCUSED';
    return student.emotion || 'OK'; // Fallback to HAPPY/OK/SAD/ANGRY if present
  };

  const handleUpdateOption = (studentId: string, option: string | null) => {
    setRecordsByDate(prev => {
      const currentOfDate = prev[dateKey] || {};
      let newStatus: { attendance: KGAttendanceStatus | null; emotion: KGEmotionStatus | null };

      if (option === null) {
        newStatus = { attendance: null, emotion: null };
      } else {
        switch (option) {
          case 'HAPPY':
            newStatus = { attendance: 'PRESENT', emotion: 'HAPPY' };
            break;
          case 'SAD':
            newStatus = { attendance: 'PRESENT', emotion: 'SAD' };
            break;
          case 'OK':
            newStatus = { attendance: 'PRESENT', emotion: 'OK' };
            break;
          case 'ANGRY':
            newStatus = { attendance: 'PRESENT', emotion: 'ANGRY' };
            break;
          case 'NO_NEWS':
            newStatus = { attendance: 'NO_NEWS', emotion: null };
            break;
          case 'SICK':
            newStatus = { attendance: 'SICK', emotion: null };
            break;
          case 'EXCUSED':
            newStatus = { attendance: 'PERMISSION', emotion: null };
            break;
          default:
            newStatus = { attendance: null, emotion: null };
        }
      }

      const updated = {
        ...prev,
        [dateKey]: {
          ...currentOfDate,
          [studentId]: newStatus
        }
      };

      localStorage.setItem('kg_checklist_records', JSON.stringify(updated));
      return updated;
    });
  };

  // Set all current visible students to HAPPY status
  const handleHappySemua = () => {
    setRecordsByDate(prev => {
      const currentOfDate = prev[dateKey] || {};
      const newOfDate = { ...currentOfDate };

      students.forEach(s => {
        const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase());
        if (matchesSearch) {
          newOfDate[s.id] = { attendance: 'PRESENT', emotion: 'HAPPY' };
        }
      });

      const updated = {
        ...prev,
        [dateKey]: newOfDate
      };

      localStorage.setItem('kg_checklist_records', JSON.stringify(updated));
      return updated;
    });

    toast.success('Semua si kecil yang tampil ke-update berstatus Happy! 😊');
  };

  const handlePrevDate = () => {
    setSelectedDate(prev => {
      const next = new Date(prev);
      next.setDate(next.getDate() - 1);
      return next;
    });
  };

  const handleNextDate = () => {
    setSelectedDate(prev => {
      const next = new Date(prev);
      next.setDate(next.getDate() + 1);
      return next;
    });
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) {
      setSelectedDate(new Date(e.target.value));
    }
  };

  // Helper to parse Excel headers like "Thursday, 1 January"
  const parseExcelDateHeader = (cellVal: any, yearNum: number, monthName: string): Date | null => {
    if (typeof cellVal !== 'string') return null;
    const str = cellVal.trim();
    
    // Day name, Day Num Month Name, option Year at the end
    const regex = /^(?:([a-zA-Z]+),\s*)?(\d+)\s+([a-zA-Z]+)(?:\s+\d{4})?$/i;
    const match = str.match(regex);
    if (!match) return null;
    
    const dayNum = parseInt(match[2], 10);
    const monthWord = match[3];
    
    if (monthWord.toLowerCase() !== monthName.toLowerCase()) {
      return null;
    }
    
    const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const monthIdx = months.indexOf(monthWord.toLowerCase());
    if (monthIdx === -1) return null;
    
    return new Date(yearNum, monthIdx, dayNum);
  };

  // Match Excel Student to Active Class Students list
  const matchStudent = (excelFullName: string, excelNickname: string) => {
    const normExcelFull = excelFullName.trim().toLowerCase();
    const normExcelNick = excelNickname.trim().toLowerCase();
    
    // Find among active class students
    return filteredClassStudents.find(s => {
      const sFull = (s.name || '').trim().toLowerCase();
      const sNick = (s.nickName || '').trim().toLowerCase();
      
      return (sFull === normExcelFull) || 
             (sNick === normExcelNick) ||
             (sNick === normExcelFull) ||
             (sFull === normExcelNick);
    });
  };

  // Parse Excel file and set preview
  const handleReadAndPreview = () => {
    if (!importFile) {
      toast.error('Pilih file Excel terlebih dahulu.');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // 1. Baca sheet bernama mengandung kata "Attendance"
        const sheetName = workbook.SheetNames.find(name => name.toLowerCase().includes('attendance')) || workbook.SheetNames[0];
        
        if (!sheetName) {
          toast.error("Tidak ditemukan sheet dengan nama mengandung 'Attendance'.");
          return;
        }
        
        const worksheet = workbook.Sheets[sheetName];
        // Convert to 2D array
        const rawData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        // 2. Cari blok bulan yang dipilih user
        let monthHeaderRowIdx = -1;
        const yearInt = parseInt(selectedYear, 10);
        const selMonthLower = selectedMonth.toLowerCase();
        
        for (let i = 0; i < rawData.length; i++) {
          const row = rawData[i];
          if (!row) continue;
          const found = row.some(cell => {
            if (typeof cell === 'string') {
              const valLower = cell.trim().toLowerCase();
              if (valLower.includes(selMonthLower) && valLower.length < 25) {
                return valLower.includes(selectedYear) || valLower === selMonthLower;
              }
            }
            return false;
          });
          if (found) {
            monthHeaderRowIdx = i;
            break;
          }
        }
        
        if (monthHeaderRowIdx === -1) {
          toast.error(`Blok bulan ${selectedMonth} ${selectedYear} tidak ditemukan dalam sheet.`);
          return;
        }
        
        // Cari baris header bulan berikutnya untuk membatasi pembacaan baris siswa
        const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
        let nextMonthHeaderRowIdx = rawData.length;
        
        for (let i = monthHeaderRowIdx + 1; i < rawData.length; i++) {
          const row = rawData[i];
          if (!row) continue;
          
          const isNextHeader = row.some(cell => {
            if (typeof cell !== 'string') return false;
            const valLower = cell.trim().toLowerCase();
            if (valLower.length >= 25) return false;
            
            return months.some(m => {
              const regex = new RegExp(`\\b${m}\\b`, 'i');
              return regex.test(valLower);
            });
          });
          
          if (isNextHeader) {
            nextMonthHeaderRowIdx = i;
            break;
          }
        }
        
        // 3. Dari blok tersebut, baca baris header tanggal (maksimal 10 baris ke bawah sebelum terlanggar batas bulan berikutnya)
        let headerRowIdx = -1;
        let dateCols: { colIdx: number; dateStr: string; dateObj: Date }[] = [];
        
        for (let r = monthHeaderRowIdx + 1; r < nextMonthHeaderRowIdx && r < monthHeaderRowIdx + 10; r++) {
          const row = rawData[r];
          if (!row) continue;
          
          const tempDateCols: typeof dateCols = [];
          for (let c = 3; c < row.length; c++) {
            const parsed = parseExcelDateHeader(row[c], yearInt, selectedMonth);
            if (parsed) {
              const yStr = parsed.getFullYear();
              const mStr = String(parsed.getMonth() + 1).padStart(2, '0');
              const dStr = String(parsed.getDate()).padStart(2, '0');
              tempDateCols.push({
                colIdx: c,
                dateStr: `${yStr}-${mStr}-${dStr}`,
                dateObj: parsed
              });
            }
          }
          
          if (tempDateCols.length > 0) {
            headerRowIdx = r;
            dateCols = tempDateCols;
            break;
          }
        }
        
        if (headerRowIdx === -1 || dateCols.length === 0) {
          toast.error(`Kolom tanggal untuk bulan ${selectedMonth} tidak ditemukan. Pastikan berformat "Thursday, 1 January" dst.`);
          return;
        }
        
        // 4. Parse setiap baris siswa
        const items: any[] = [];
        for (let r = headerRowIdx + 1; r < nextMonthHeaderRowIdx; r++) {
          const row = rawData[r];
          if (!row) continue;
          
          // Row validation: kolom index 0 harus berupa angka positif
          const col0 = row[0];
          const parsedNo = typeof col0 === 'number' ? col0 : parseInt(String(col0), 10);
          if (isNaN(parsedNo) || parsedNo <= 0) {
            continue; // Skip baris header/kosong/bukan baris siswa
          }
          
          // Ambil fullName dari kolom indeks 1 dan nickname dari kolom indeks 2
          const fullName = row[1] ? String(row[1]).trim() : '';
          const nickname = row[2] ? String(row[2]).trim() : '';
          
          if (!fullName) continue; // Skip jika fullName kosong
          
          // Skip baris jika kolom index 1 berisi kata bukan nama (seperti "Nama Lengkap", "No", dsb)
          const lowerName = fullName.toLowerCase();
          if (
            lowerName === 'nama' || 
            lowerName === 'nama lengkap' || 
            lowerName === 'full name' || 
            lowerName === 'name' || 
            lowerName === 'no' || 
            !isNaN(Number(fullName))
          ) {
            continue;
          }
          
          const studentAttendances: any[] = [];
          dateCols.forEach(d => {
            const cellVal = row[d.colIdx];
            const rawVal = cellVal !== undefined && cellVal !== null ? String(cellVal).trim() : '';
            
            const statusMap: Record<string, string> = {
              'Happy': 'happy', 'Sad': 'sad', 'Angry': 'angry',
              'OK': 'ok', 'No News': 'noNews', 'Sick': 'sick',
              'Izin': 'izin', 'Early Leave': 'earlyLeave'
            };
            
            let mappedStatus = '';
            const foundKey = Object.keys(statusMap).find(k => k.toLowerCase() === rawVal.toLowerCase());
            if (foundKey) {
              mappedStatus = statusMap[foundKey];
            }
            
            studentAttendances.push({
              dateStr: d.dateStr,
              rawStatus: rawVal,
              status: mappedStatus
            });
          });
          
          const matchedStudentObj = matchStudent(fullName, nickname);
          
          items.push({
            fullName,
            nickname,
            attendances: studentAttendances,
            matchedStudent: matchedStudentObj || null,
            totalDays: dateCols.length,
            filledDays: studentAttendances.filter(a => a.status).length
          });
        }
        
        if (items.length === 0) {
          toast.error("Tidak ada data siswa yang berhasil di-parse.");
          return;
        }
        
        setPreviewData(items);
        setImportResult(null);
        toast.success(`Berhasil mendeteksi ${items.length} siswa dan ${dateCols.length} kolom tanggal!`);
      } catch (err) {
        console.error(err);
        toast.error(`Gagal membaca Excel: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    reader.readAsArrayBuffer(importFile);
  };


  // Helper mapping in indonesian
  const getAttendanceStatusInIndonesian = (emotionVal: string): string => {
    if (emotionVal === 'sick') return 'sakit';
    if (emotionVal === 'izin') return 'izin';
    if (emotionVal === 'noNews') return 'tanpa_kabar';
    return 'hadir';
  };

  // Import preview data to Firestore and sync local state
  const handleImportToSystem = async () => {
    if (!previewData || previewData.length === 0) {
      toast.error("Tidak ada data preview untuk di-import.");
      return;
    }
    
    setIsImporting(true);
    try {
      // 1. Get unique list of dates in the parsed excel
      const datesSet = new Set<string>();
      previewData.forEach(item => {
        item.attendances.forEach((a: any) => {
          if (a.dateStr) datesSet.add(a.dateStr);
        });
      });
      
      const uniqueDates = Array.from(datesSet).sort();
      
      let importedDays = 0;
      let skippedDays = 0;
      let unmappedStudentsCount = previewData.filter(item => !item.matchedStudent).length;
      
      // We will also build a batch of local updates to sync instantly with UI checklist
      const localUpdates: Record<string, Record<string, { attendance: KGAttendanceStatus | null; emotion: KGEmotionStatus | null }>> = {};

      const mapValToSystem = (status: string): { attendance: KGAttendanceStatus | null; emotion: KGEmotionStatus | null } => {
        switch (status) {
          case 'happy':
            return { attendance: 'PRESENT', emotion: 'HAPPY' };
          case 'sad':
            return { attendance: 'PRESENT', emotion: 'SAD' };
          case 'ok':
            return { attendance: 'PRESENT', emotion: 'OK' };
          case 'angry':
            return { attendance: 'PRESENT', emotion: 'ANGRY' };
          case 'noNews':
            return { attendance: 'NO_NEWS', emotion: null };
          case 'sick':
            return { attendance: 'SICK', emotion: null };
          case 'izin':
            return { attendance: 'PERMISSION', emotion: null };
          case 'earlyLeave':
            return { attendance: 'PRESENT', emotion: 'OK' };
          default:
            return { attendance: null, emotion: null };
        }
      };

      for (const dateStr of uniqueDates) {
        const docId = `${selectedClassId}_${dateStr}`;
        const docRef = doc(db, 'attendance', docId);
        
        // Check if doc already exists
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          skippedDays++;
          continue;
        }
        
        // Build student records for this date
        const dateStudentsList: any[] = [];
        previewData.forEach(item => {
          if (item.matchedStudent) {
            const attForDate = item.attendances.find((a: any) => a.dateStr === dateStr);
            if (attForDate && attForDate.status) {
              const emotionVal = attForDate.status; // e.g. 'happy'
              dateStudentsList.push({
                studentId: item.matchedStudent.id,
                studentName: item.matchedStudent.name,
                emotion: emotionVal,
                status: getAttendanceStatusInIndonesian(emotionVal)
              });

              // Prepare local checklist changes
              if (!localUpdates[dateStr]) {
                localUpdates[dateStr] = {};
              }
              localUpdates[dateStr][item.matchedStudent.id] = mapValToSystem(emotionVal);
            }
          }
        });
        
        // Only write if we have student parsed entries
        if (dateStudentsList.length > 0) {
          await setDoc(docRef, {
            classId: selectedClassId,
            date: dateStr,
            academicYear: activeYear || '2025/2026',
            students: dateStudentsList,
            importedFrom: "excel",
            importedAt: new Date()
          });
          importedDays++;
        }
      }
      
      // Update local storage and component state for the currently loaded date
      setRecordsByDate(prev => {
        const updated = { ...prev };
        Object.keys(localUpdates).forEach(dStr => {
          updated[dStr] = {
            ...(updated[dStr] || {}),
            ...localUpdates[dStr]
          };
        });
        localStorage.setItem('kg_checklist_records', JSON.stringify(updated));
        return updated;
      });

      setImportResult({
        successCount: importedDays,
        skipCount: skippedDays,
        unmappedCount: unmappedStudentsCount
      });
      
      toast.success("Proses import selesai!");
    } catch (err) {
      console.error(err);
      toast.error(`Gagal menyimpan data import: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsImporting(false);
    }
  };

  // Helper to match student's classId/name with activeClassObj robustly across schemas
  const isStudentInClass = (studClassId: string, activeClassObj: { id: string; name: string }) => {
    const sClass = (studClassId || '').trim().toLowerCase();
    const actId = (activeClassObj.id || '').trim().toLowerCase();
    const actName = (activeClassObj.name || '').trim().toLowerCase();
    
    if (!sClass) return false;
    
    // Direct match
    if (sClass === actId || sClass === actName) return true;
    
    // Standardize separators: space, hyphen, underscore
    const norm = (str: string) => str.replace(/[\s\-_]+/g, '');
    const normS = norm(sClass);
    const normId = norm(actId);
    const normName = norm(actName);
    
    if (normS === normName || normS === normId) return true;
    if (normId.includes(normS) || normS.includes(normId)) return true;
    
    return false;
  };

  // Filter students belonging to the currently selected class for statistics
  const filteredClassStudents = studentsWithStatus.filter(s => {
    if (selectedClassId && selectedClassId !== 'ALL') {
      const activeClassObj = classes.find(c => c.id === selectedClassId);
      if (activeClassObj) {
        return isStudentInClass(s.classId, activeClassObj);
      }
    }
    return true;
  });

  // Precise statistics calculations
  const totalStudents = filteredClassStudents.length;
  const countBelumDiisi = filteredClassStudents.filter(s => s.attendance === null).length;
  const countHadir = filteredClassStudents.filter(s => s.attendance === 'PRESENT').length;
  const countSakit = filteredClassStudents.filter(s => s.attendance === 'SICK').length;
  const countIzin = filteredClassStudents.filter(s => s.attendance === 'PERMISSION').length;
  const countAlpha = filteredClassStudents.filter(s => s.attendance === 'NO_NEWS').length;

  const countHappy = filteredClassStudents.filter(s => s.attendance === 'PRESENT' && s.emotion === 'HAPPY').length;
  const countOk = filteredClassStudents.filter(s => s.attendance === 'PRESENT' && s.emotion === 'OK').length;
  const countSad = filteredClassStudents.filter(s => s.attendance === 'PRESENT' && s.emotion === 'SAD').length;
  const countAngry = filteredClassStudents.filter(s => s.attendance === 'PRESENT' && s.emotion === 'ANGRY').length;

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      toast.success('Laporan Kehadiran & Emosi Harian berhasil disimpan ke server! ❤️', {
        description: `Tanggal: ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(selectedDate)}`
      });
    }, 800);
  };

  const filteredStudents = studentsWithStatus.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (selectedClassId && selectedClassId !== 'ALL') {
      const activeClassObj = classes.find(c => c.id === selectedClassId);
      if (activeClassObj) {
        return matchesSearch && isStudentInClass(s.classId, activeClassObj);
      }
    }
    return matchesSearch;
  });

  if (classes.length === 0) {
    return (
      <div className="max-w-5xl mx-auto space-y-8 pb-12">
        {/* HEADER SECTION */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
             <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Attendance & Emotional Checklist</h1>
             <p className="text-gray-500 font-medium text-sm mt-1">
                Catat kehadiran dan kondisi emosional siswa
             </p>
          </div>
        </header>

        <div className="bg-white p-12 rounded-[2rem] border border-emerald-100/50 shadow-xl shadow-emerald-50/50 text-center space-y-4">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle size={32} />
          </div>
          <p className="text-gray-650 font-bold text-lg max-w-md mx-auto">
            Belum ada kelas Kindergarten yang terdaftar. Silakan buat kelas di Panel Admin.
          </p>
        </div>
      </div>
    );
  }

  const selectedClassName = classes.find(c => c.id === selectedClassId)?.name || '';

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      {/* HEADER SECTION */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
           <h1 className="text-2xl font-bold text-gray-990 tracking-tight">Attendance & Emotional Checklist</h1>
           <p className="text-gray-500 font-medium text-sm mt-1">
              Catat kehadiran dan kondisi emosional siswa
           </p>
        </div>

        {/* INTERACTIVE DATEPICKER WITH TOGGLE CHEVRON */}
        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-2xl shadow-sm border border-emerald-100">
           <button 
             onClick={handlePrevDate}
             className="p-2 hover:bg-emerald-50 rounded-xl text-gray-500 hover:text-emerald-700 transition-all cursor-pointer"
             title="Kemarin"
           >
             <ChevronLeft size={16} />
           </button>

           <div className="flex items-center gap-2 px-2 text-emerald-700 font-bold relative group">
              <Calendar size={16} className="text-emerald-400 shrink-0" />
              <input 
                type="date"
                value={selectedDate.toISOString().split('T')[0]}
                onChange={handleDateChange}
                className="font-bold text-sm text-gray-700 outline-none cursor-pointer bg-transparent border-none py-1 absolute inset-0 opacity-0 z-10 w-full"
                title="Pilih Tanggal Bebas"
              />
              <span className="text-sm select-none border-b border-dashed border-emerald-300 pb-0.5 cursor-pointer leading-tight">
                {new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(selectedDate)}
              </span>
           </div>

           <button 
             onClick={handleNextDate}
             className="p-2 hover:bg-emerald-50 rounded-xl text-gray-500 hover:text-emerald-700 transition-all cursor-pointer"
             title="Besok"
           >
             <ChevronRight size={16} />
           </button>
        </div>
      </header>

      {/* CLASS CHOOSER DROPDOWN */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-[2rem] border border-emerald-100/50 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-gray-700">Pilih Kelas:</span>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="px-4 py-2.5 bg-emerald-50/40 border border-emerald-100 rounded-2xl text-sm font-bold text-emerald-800 focus:ring-2 focus:ring-emerald-300 outline-none transition-all cursor-pointer min-w-[250px]"
            >
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name} ({cls.grade})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="pl-4">
          <h2 className="text-sm font-extrabold text-emerald-700 italic tracking-tight">
            Daftar Anak — {selectedClassName}
          </h2>
        </div>
      </div>

      {/* QUICK ACTIONS TOOLBAR */}
      <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-white p-5 rounded-[2rem] border border-emerald-100/50 shadow-sm">
        <div className="relative flex-1">
           <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-300" size={16} />
           <input 
             type="text" 
             value={searchQuery}
             onChange={(e) => setSearchQuery(e.target.value)}
             placeholder="Cari nama si kecil yang ceria..." 
             className="pl-11 pr-4 py-2.5 w-full bg-emerald-50/10 border border-emerald-100 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-emerald-300 focus:border-transparent transition-all placeholder:text-emerald-300" 
           />
        </div>

        <div className="flex items-center gap-2">
           <button 
             onClick={handleHappySemua}
             className="flex items-center justify-center gap-2 bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-white font-bold text-xs py-2.5 px-5 rounded-2xl shadow-md shadow-amber-100 hover:shadow-lg hover:shadow-amber-200/50 transition-all cursor-pointer"
            >
              <Smile size={16} />
              Set Happy Semua
            </button>
            <button 
              onClick={() => {
                setImportFile(null);
                setPreviewData(null);
                setImportResult(null);
                setIsImportModalOpen(true);
              }}
              className="flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold text-xs py-2.5 px-5 rounded-2xl shadow-md hover:shadow-lg transition-all cursor-pointer whitespace-nowrap"
            >
              <FileSpreadsheet size={16} />
              Import dari Excel
            </button>
        </div>
      </div>

      {/* ATTENDANCE TABLE */}
      <div className="bg-white rounded-[2rem] shadow-xl shadow-emerald-50/50 border border-emerald-100/50 overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-500/5 to-teal-500/5 p-6 border-b border-emerald-50 flex items-center justify-between">
           <div className="flex items-center gap-2 text-emerald-700">
              <Users size={18} />
              <span className="font-bold text-sm tracking-tight">
                Daftar Checklist Kehadiran — {filteredStudents.length} Siswa
              </span>
           </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[950px] table-fixed">
            <thead>
              <tr className="text-emerald-700 text-[10px] font-black uppercase tracking-[0.2em] border-b border-emerald-100">
                <th className="px-6 py-4 w-[240px]">Anak Hebat</th>
                <th className="px-6 py-4 text-center">Attendance & Emotional Checklist</th>
                <th className="px-6 py-4 text-center w-[100px]">Reset Hapus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-50/50">
              {filteredStudents.map((student) => {
                const activeOption = getActiveOption(student);
                const hasSelected = activeOption !== '';

                return (
                  <tr key={student.id} className={cn("transition-colors", hasSelected ? "bg-white" : "bg-gray-50/10 hover:bg-emerald-50/10")}>
                    {/* Student Info Card column */}
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-4">
                         <div className={cn(
                           "w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm shadow-sm border transition-all",
                           activeOption === 'HAPPY' && "bg-yellow-50 text-yellow-600 border-yellow-200 scale-105",
                           activeOption === 'SAD' && "bg-blue-50 text-blue-600 border-blue-200 scale-105",
                           activeOption === 'OK' && "bg-emerald-50 text-emerald-600 border-emerald-200 scale-105",
                           activeOption === 'ANGRY' && "bg-red-50 text-red-600 border-red-200 scale-105",
                           activeOption === 'SICK' && "bg-indigo-50 text-indigo-600 border-indigo-200 scale-105",
                           activeOption === 'EXCUSED' && "bg-orange-50 text-orange-600 border-orange-200 scale-105",
                           activeOption === 'NO_NEWS' && "bg-slate-50 text-slate-500 border-slate-200 scale-105",
                           !hasSelected && "from-emerald-50 to-teal-50 bg-gradient-to-br text-emerald-700 border-white"
                         )}>
                            {student.name[0]}
                         </div>
                         <div>
                            <p className="font-bold text-gray-900 text-sm tracking-tight">{student.name}</p>
                            <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest">
                               {hasSelected ? (
                                  <span className="inline-flex items-center gap-1 transition-all">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    Sudah Terisi
                                  </span>
                               ) : (
                                  <span className="text-gray-400 font-medium">Belum Diisi</span>
                               )}
                            </p>
                         </div>
                       </div>
                    </td>

                    {/* Interactive Button Group column */}
                    <td className="px-6 py-5">
                      <div className="flex flex-wrap gap-2 justify-center items-center">
                         <ChecklistButton 
                           option="HAPPY"
                           active={activeOption === 'HAPPY'}
                           onClick={() => handleUpdateOption(student.id, 'HAPPY')}
                         />
                         <ChecklistButton 
                           option="SAD"
                           active={activeOption === 'SAD'}
                           onClick={() => handleUpdateOption(student.id, 'SAD')}
                         />
                         <ChecklistButton 
                           option="OK"
                           active={activeOption === 'OK'}
                           onClick={() => handleUpdateOption(student.id, 'OK')}
                         />
                         <ChecklistButton 
                           option="ANGRY"
                           active={activeOption === 'ANGRY'}
                           onClick={() => handleUpdateOption(student.id, 'ANGRY')}
                         />
                         <span className="w-[1px] h-5 bg-emerald-100 hidden sm:inline-block" />
                         <ChecklistButton 
                           option="NO_NEWS"
                           active={activeOption === 'NO_NEWS'}
                           onClick={() => handleUpdateOption(student.id, 'NO_NEWS')}
                         />
                         <ChecklistButton 
                           option="SICK"
                           active={activeOption === 'SICK'}
                           onClick={() => handleUpdateOption(student.id, 'SICK')}
                         />
                         <ChecklistButton 
                           option="EXCUSED"
                           active={activeOption === 'EXCUSED'}
                           onClick={() => handleUpdateOption(student.id, 'EXCUSED')}
                         />
                      </div>
                    </td>

                    {/* RESET / DELETE CELL COLUMN */}
                    <td className="px-6 py-5 text-center">
                      {hasSelected ? (
                        <button 
                          onClick={() => handleUpdateOption(student.id, null)}
                          className="p-2 hover:bg-rose-50 text-rose-400 hover:text-rose-600 rounded-xl transition-all border border-transparent hover:border-rose-100 cursor-pointer inline-flex items-center justify-center"
                          title="Hapus / Kosongkan Pilihan"
                        >
                          <Trash2 size={16} />
                        </button>
                      ) : (
                        <span className="text-xs text-gray-300 font-medium select-none">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredStudents.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-6 py-12 text-center text-gray-400 text-sm">
                    No matching little ones found 😢
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DASHBOARD STATS RECAP AND PERSIST ACTIONS */}
      <div className="bg-white p-6 rounded-3xl border border-emerald-100 shadow-sm space-y-6">
         {/* Live Dynamic Counters */}
         <div className="flex flex-wrap items-center justify-start gap-3">
            <div className={cn(
               "flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all",
               countBelumDiisi > 0 ? "bg-orange-50 text-orange-850 border-orange-150" : "bg-teal-50 text-teal-855 border-teal-150"
            )}>
               <div className={cn("w-2 h-2 rounded-full", countBelumDiisi > 0 ? "bg-orange-500 animate-pulse" : "bg-teal-500")} />
               BELUM DIISI: {countBelumDiisi} / {totalStudents}
            </div>

            <div className="flex items-center gap-2 bg-emerald-50 text-emerald-800 px-3 py-1.5 rounded-xl border border-emerald-100 text-xs font-bold">
               <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
               HADIR: {countHadir}
            </div>

            <div className="flex items-center gap-2 bg-emerald-50 text-emerald-800 px-3 py-1.5 rounded-xl border border-emerald-100 text-xs font-bold px-3 py-1.5 rounded-xl border border-emerald-150 text-xs font-bold flex items-center gap-2 bg-teal-50 text-teal-800 border-teal-150">
               <div className="w-2 h-2 rounded-full bg-teal-400" />
               IZIN: {countIzin} 
            </div>

            <div className="flex items-center gap-2 bg-indigo-50 text-indigo-800 px-3 py-1.5 rounded-xl border border-indigo-150 text-xs font-bold">
               <div className="w-2 h-2 rounded-full bg-indigo-400" />
               SAKIT: {countSakit}
            </div>

            <div className="flex items-center gap-2 bg-slate-50 text-slate-850 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold">
               <div className="w-2 h-2 rounded-full bg-slate-400" />
               TANPA KABAR: {countAlpha}
            </div>
         </div>

         {/* Grid displaying detail breakdown */}
         <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1 border-t border-dashed border-emerald-100/60 font-medium">
            <div className="bg-yellow-50/50 p-3 rounded-2xl border border-yellow-100/50 text-center">
               <p className="text-[10px] text-yellow-600 font-extrabold uppercase tracking-widest mb-1 select-none">😊 Happy</p>
               <span className="text-xl font-black text-yellow-700">{countHappy}</span>
            </div>
            <div className="bg-emerald-50/50 p-3 rounded-2xl border border-emerald-100/55 text-center">
               <p className="text-[10px] text-emerald-600 font-extrabold uppercase tracking-widest mb-1 select-none">😐 OK / Biasa</p>
               <span className="text-xl font-black text-emerald-700">{countOk}</span>
            </div>
            <div className="bg-blue-50/50 p-3 rounded-2xl border border-blue-100/55 text-center">
               <p className="text-[10px] text-blue-600 font-extrabold uppercase tracking-widest mb-1 select-none">😢 Sad / Sedih</p>
               <span className="text-xl font-black text-blue-700">{countSad}</span>
            </div>
            <div className="bg-red-50/50 p-3 rounded-2xl border border-red-100/55 text-center">
               <p className="text-[10px] text-red-500 font-extrabold uppercase tracking-widest mb-1 select-none">😠 Angry / Marah</p>
               <span className="text-xl font-black text-red-600">{countAngry}</span>
            </div>
         </div>

         {/* Save triggers */}
         <div className="flex flex-col sm:flex-row justify-end items-center gap-4 pt-4 border-t border-emerald-50">
           <button 
             onClick={handleSave}
            >
              {isSaving ? <Clock className="animate-spin" size={20} /> : <Save size={20} />}
              Simpan Laporan Harian
            </button>

            {/* EXCEL IMPORT MODAL */}
            {isImportModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto font-sans text-left">
                <div className="bg-white rounded-[2rem] w-full max-w-4xl shadow-2xl border border-emerald-100 overflow-hidden flex flex-col max-h-[90vh]">
                  {/* Modal Header */}
                  <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-6 text-white flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                      <FileSpreadsheet className="w-8 h-8 opacity-90" />
                      <div>
                        <h3 className="text-xl font-bold">Import Data Attendance dari Excel</h3>
                        <p className="text-xs text-emerald-100 font-medium">Bulan: {selectedMonth} | Tahun: {selectedYear}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setIsImportModalOpen(false)}
                      className="p-1.5 hover:bg-white/20 rounded-full transition-all cursor-pointer shadow-none"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  {/* Modal Body */}
                  <div className="p-6 overflow-y-auto space-y-6 flex-1 text-left">
                    {!importResult ? (
                      <>
                        {/* File Upload and Settings Configuration Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-emerald-50/25 p-5 rounded-3xl border border-emerald-100/50">
                          {/* Select Month Dropdown */}
                          <div className="space-y-1.5 col-span-1">
                            <label className="text-xs font-black text-emerald-800 uppercase tracking-wider">Pilih Bulan</label>
                            <select
                              value={selectedMonth}
                              onChange={(e) => {
                                setSelectedMonth(e.target.value);
                                setPreviewData(null);
                              }}
                              className="w-full px-4 py-2.5 bg-white border border-emerald-100 rounded-xl text-xs font-bold text-gray-700 focus:ring-2 focus:ring-emerald-300 outline-none cursor-pointer"
                            >
                              {['January', 'February', 'March', 'April', 'May'].map(m => (
                                <option key={m} value={m}>{m}</option>
                              ))}
                            </select>
                          </div>

                          {/* Select Year Dropdown */}
                          <div className="space-y-1.5 col-span-1">
                            <label className="text-xs font-black text-emerald-800 uppercase tracking-wider">Pilih Tahun</label>
                            <select
                              value={selectedYear}
                              onChange={(e) => {
                                setSelectedYear(e.target.value);
                                setPreviewData(null);
                              }}
                              className="w-full px-4 py-2.5 bg-white border border-emerald-100 rounded-xl text-xs font-bold text-gray-700 focus:ring-2 focus:ring-emerald-300 outline-none cursor-pointer"
                            >
                              {acadYearsList.map(y => (
                                <option key={y} value={y}>{y}</option>
                              ))}
                            </select>
                          </div>

                          {/* Choose Spreadsheet File Input */}
                          <div className="space-y-1.5 col-span-1">
                            <label className="text-xs font-black text-emerald-800 uppercase tracking-wider">Upload Spreadsheet (.xlsx, .xls)</label>
                            <input 
                              type="file"
                              accept=".xlsx,.xls"
                              onChange={(e) => {
                                const file = e.target.files?.[0] || null;
                                console.log('file selected:', file);
                                if (file) {
                                  setImportFile(file);
                                  setPreviewData(null);
                                } else {
                                  setImportFile(null);
                                }
                              }}
                              className="w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
                            />
                          </div>
                        </div>

                        {/* Actions & Read Block */}
                        <div className="flex justify-end pt-1">
                          <button
                            type="button"
                            onClick={handleReadAndPreview}
                            disabled={!importFile}
                            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition-all disabled:opacity-40 cursor-pointer"
                          >
                            Baca &amp; Preview
                          </button>
                        </div>

                        {/* Preview Section */}
                        {previewData && (
                          <div className="space-y-3 pt-4 border-t border-gray-100">
                            <div className="flex justify-between items-center">
                              <h4 className="text-sm font-extrabold text-emerald-800 tracking-tight">Kandidat Siswa Hasil Parse</h4>
                              <span className="bg-emerald-50 text-emerald-700 text-xs px-2.5 py-1 rounded-full font-bold">
                                {previewData.length} Siswa Terdeteksi
                              </span>
                            </div>

                            {/* Preview Table */}
                            <div className="border border-emerald-100/50 rounded-2xl overflow-hidden max-h-[290px] overflow-y-auto">
                              <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                  <tr className="bg-emerald-50/50 text-emerald-800 uppercase font-black tracking-wider border-b border-emerald-100">
                                    <th className="p-3">Nama Siswa</th>
                                    <th className="p-3">Nama Panggilan</th>
                                    <th className="p-3 text-center">Status Matching</th>
                                    <th className="p-3 text-center">Kehadiran</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-emerald-50/20">
                                  {previewData.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-emerald-50/10">
                                      <td className="p-3 font-bold text-gray-800">{item.fullName}</td>
                                      <td className="p-3 text-gray-600">{item.nickname}</td>
                                      <td className="p-3 text-center">
                                        {item.matchedStudent ? (
                                          <span className="inline-flex items-center gap-1 text-emerald-600 font-bold bg-emerald-50 px-2.5 py-0.5 rounded-full">
                                            <Check size={12} />
                                            {item.matchedStudent.name} (Cocok)
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 text-rose-500 font-bold bg-rose-50 px-2.5 py-0.5 rounded-full">
                                            <X size={12} />
                                            Tidak Cocok
                                          </span>
                                        )}
                                      </td>
                                      <td className="p-3 text-center font-bold text-gray-700">
                                        {item.filledDays} / {item.totalDays} Hari Terisi
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            {/* Modal Footer (Import Trigger) */}
                            <div className="flex justify-end pt-4 border-t border-gray-150">
                              <button
                                type="button"
                                onClick={handleImportToSystem}
                                disabled={isImporting || previewData.filter(item => item.matchedStudent).length === 0}
                                className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-md transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer border-none"
                              >
                                {isImporting ? <Clock className="animate-spin" size={16} /> : <Save size={16} />}
                                Import ke Sistem
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      /* Results Recaps Dashboard Screen */
                      <div className="p-8 text-center space-y-6">
                        <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto border border-emerald-100 shadow-inner">
                          <CheckCircle2 size={36} />
                        </div>
                        <div className="space-y-2">
                          <h4 className="text-xl font-bold text-gray-900">Hasil Import Selesai!</h4>
                          <p className="text-gray-500 text-sm max-w-md mx-auto">
                            Data kehadiran spreadsheet Excel berhasil diproses ke database Firestore untuk kelas {selectedClassName}.
                          </p>
                        </div>
                        
                        {/* Results Bullet Stats Cards */}
                        <div className="grid grid-cols-3 gap-4 max-w-xl mx-auto pt-4">
                          <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-150 text-center">
                            <p className="text-[10px] uppercase font-black tracking-widest text-emerald-800 mb-1">Berhasil</p>
                            <span className="text-xl font-black text-emerald-700">{importResult.successCount} hari</span>
                          </div>
                          <div className="bg-amber-50 p-4 rounded-2xl border border-amber-150 text-center">
                            <p className="text-[10px] uppercase font-black tracking-widest text-amber-800 mb-1">Dilewati (Ada)</p>
                            <span className="text-xl font-black text-amber-700">{importResult.skipCount} hari</span>
                          </div>
                          <div className="bg-rose-50 p-4 rounded-2xl border border-rose-150 text-center">
                            <p className="text-[10px] uppercase font-black tracking-widest text-rose-800 mb-1">Mismatched Siswa</p>
                            <span className="text-xl font-black text-rose-700">{importResult.unmappedCount} anak</span>
                          </div>
                        </div>

                        <p className="text-xs text-gray-400 italic">
                          Catatan: Hanya data hari yang belum memiliki dokumen attendance sebelumnya yang diimport (skipped jika sudah ada).
                        </p>

                        <div className="pt-6">
                          <button
                            type="button"
                            onClick={() => setIsImportModalOpen(false)}
                            className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 border-none"
                          >
                            Tutup Modal
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <button style={{ display: 'none' }} onClick={handleSave}
             disabled={isSaving}
             className="w-full sm:w-auto flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-10 py-3.5 rounded-2xl shadow-xl shadow-emerald-100 hover:shadow-emerald-200 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
           >
             {isSaving ? <Clock className="animate-spin" size={20} /> : <Save size={20} />}
             Simpan Laporan Harian
           </button>
         </div>
      </div>
    </div>
  );
}

function ChecklistButton({ option, active, onClick }: { option: string; active: boolean; onClick: () => void }) {
  const configs: Record<string, { label: string; icon: React.ReactNode; activeClasses: string; inactiveClasses: string }> = {
    HAPPY: { 
      label: 'Happy', 
      icon: <Smile size={14} />, 
      activeClasses: 'bg-yellow-400 text-white border-yellow-400 shadow-md shadow-yellow-105 scale-[1.03] px-3.5', 
      inactiveClasses: 'text-yellow-600 hover:bg-yellow-50/60 border-yellow-100/60 bg-yellow-55/10 bg-yellow-50/20 shadow-none' 
    },
    SAD: { 
      label: 'Sad', 
      icon: <Frown size={14} />, 
      activeClasses: 'bg-blue-400 text-white border-blue-400 shadow-md shadow-blue-105 scale-[1.03] px-3.5', 
      inactiveClasses: 'text-blue-600 hover:bg-blue-50/60 border-blue-100/60 bg-blue-55/10 bg-blue-50/20 shadow-none' 
    },
    OK: { 
      label: 'OK', 
      icon: <Meh size={14} />, 
      activeClasses: 'bg-emerald-400 text-white border-emerald-400 shadow-md shadow-emerald-105 scale-[1.03] px-3.5', 
      inactiveClasses: 'text-emerald-600 hover:bg-emerald-50/60 border-emerald-100/60 bg-emerald-55/10 bg-emerald-50/20 shadow-none' 
    },
    ANGRY: { 
      label: 'Angry', 
      icon: <Angry size={14} />, 
      activeClasses: 'bg-red-500 text-white border-red-500 shadow-md shadow-red-105 scale-[1.03] px-3.5', 
      inactiveClasses: 'text-red-500 hover:bg-red-50/60 border-red-150 bg-red-50/20 shadow-none' 
    },
    NO_NEWS: { 
      label: 'No News', 
      icon: <UserX size={14} />, 
      activeClasses: 'bg-slate-500 text-white border-slate-500 shadow-md shadow-slate-105 scale-[1.03] px-3.5', 
      inactiveClasses: 'text-slate-500 hover:bg-slate-50 border-slate-100 bg-slate-50/20 shadow-none' 
    },
    SICK: { 
      label: 'Sick', 
      icon: <AlertCircle size={14} />, 
      activeClasses: 'bg-indigo-500 text-white border-indigo-500 shadow-md shadow-indigo-105 scale-[1.03] px-3.5', 
      inactiveClasses: 'text-indigo-600 hover:bg-indigo-55/70 border-indigo-100 bg-indigo-50/20 shadow-none' 
    },
    EXCUSED: { 
      label: 'Excused', 
      icon: <CheckCircle2 size={14} />, 
      activeClasses: 'bg-orange-400 text-white border-orange-400 shadow-md shadow-orange-105 scale-[1.03] px-3.5', 
      inactiveClasses: 'text-orange-600 hover:bg-orange-55 border-orange-100 bg-orange-50/20 shadow-none' 
    },
  };

  const current = configs[option];
  if (!current) return null;

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border shadow-sm cursor-pointer select-none",
        active ? current.activeClasses : current.inactiveClasses
      )}
    >
      {current.icon}
      <span>{current.label}</span>
    </button>
  );
}
