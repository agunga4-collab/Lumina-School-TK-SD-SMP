import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar, Users, Download, AlertTriangle, CheckCircle2, 
  ArrowLeft, Search, FileText, Loader2, RefreshCw, BarChart2,
  TrendingUp, Award, UserX, Printer
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { startOfMonth, endOfMonth, format, eachDayOfInterval, isWeekend as isDateWeekend } from 'date-fns';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAcademicYear } from '../../context/AcademicYearContext';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

interface StudentAggregatedData {
  id: string;
  name: string;
  nickName: string;
  classId: string;
  H: number;
  S: number;
  I: number;
  A: number;
  totalLogged: number;
  attendancePercentage: number;
}

export default function AttendanceSummaryReport() {
  const navigate = useNavigate();
  const { activeYear } = useAcademicYear();

  // Filter States
  const [classes, setClasses] = React.useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = React.useState<string>('');
  const [selectedMonth, setSelectedMonth] = React.useState<number>(() => new Date().getMonth());
  const [selectedYear, setSelectedYear] = React.useState<string>(() => {
    if (!activeYear) return '2026';
    const parts = activeYear.split('/');
    return parts[parts.length - 1] || '2026';
  });
  const [searchQuery, setSearchQuery] = React.useState<string>('' );

  // Period filter states: 'monthly' | 'semester' | 'yearly' | 'custom'
  const [reportPeriodType, setReportPeriodType] = React.useState<'monthly' | 'semester' | 'yearly' | 'custom'>('monthly');
  const [selectedSemester, setSelectedSemester] = React.useState<'ganjil' | 'genap'>('ganjil');
  const [customStartDate, setCustomStartDate] = React.useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}-01`;
  });
  const [customEndDate, setCustomEndDate] = React.useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}-28`;
  });

  // Data States
  const [students, setStudents] = React.useState<any[]>([]);
  const [attendanceDocs, setAttendanceDocs] = React.useState<any[]>([]);
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const [isExporting, setIsExporting] = React.useState<boolean>(false);

  // Time options list
  const months = [
    { value: 0, label: 'Januari' },
    { value: 1, label: 'Februari' },
    { value: 2, label: 'Maret' },
    { value: 3, label: 'April' },
    { value: 4, label: 'Mei' },
    { value: 5, label: 'Juni' },
    { value: 6, label: 'Juli' },
    { value: 7, label: 'Agustus' },
    { value: 8, label: 'September' },
    { value: 9, label: 'Oktober' },
    { value: 10, label: 'November' },
    { value: 11, label: 'Desember' }
  ];

  // Derive static year options based on activeYear
  const yearOptions = React.useMemo(() => {
    if (!activeYear) return ['2025', '2026', '2027'];
    const parts = activeYear.split('/');
    if (parts.length === 2) {
      return parts;
    }
    return [activeYear, '2025', '2026', '2027'].filter((v, i, a) => a.indexOf(v) === i);
  }, [activeYear]);

  // Load Classes and Students (just once or when activeYear changes)
  React.useEffect(() => {
    async function loadKindergartenData() {
      if (!activeYear) return;
      setIsLoading(true);
      try {
        // 1. Fetch Kindergarten classes
        const qClasses = query(
          collection(db, 'classes'),
          where('unitId', '==', 'KINDERGARTEN'),
          where('academicYear', '==', activeYear)
        );
        const classesSnap = await getDocs(qClasses);
        const fetchedClasses = classesSnap.docs.map(docSnap => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            name: data.name || '',
            grade: data.grade || '',
            unitId: data.unitId || '',
            academicYear: data.academicYear || ''
          };
        }).sort((a, b) => a.name.localeCompare(b.name));

        setClasses(fetchedClasses);
        if (fetchedClasses.length > 0) {
          setSelectedClassId(fetchedClasses[0].id);
        }

        // 2. Fetch Kindergarten Students & Enrollments
        const qStudents = query(
          collection(db, 'students'),
          where('unitId', '==', 'KINDERGARTEN')
        );
        const qEnrollments = query(
          collection(db, 'enrollments'),
          where('unitId', '==', 'KINDERGARTEN'),
          where('academicYear', '==', activeYear)
        );

        const [studentsSnap, enrollmentsSnap] = await Promise.all([
          getDocs(qStudents),
          getDocs(qEnrollments)
        ]);

        const enrollmentClassMap = new Map<string, string>();
        enrollmentsSnap.docs.forEach(docSnap => {
          const data = docSnap.data();
          if (data.studentId && data.classId) {
            enrollmentClassMap.set(data.studentId, data.classId);
          }
        });

        const studentsMap = new Map<string, any>();
        studentsSnap.docs.forEach(docSnap => {
          const data = docSnap.data();
          
          if (data.academicYear && data.academicYear !== activeYear) {
            const isEnrolledInActiveYear = enrollmentsSnap.docs.some(eDoc => eDoc.data().studentId === docSnap.id);
            if (!isEnrolledInActiveYear) {
              return; // Skip student registered in different year
            }
          }

          const studentId = data.luminaId || docSnap.id;
          const classId = enrollmentClassMap.get(docSnap.id) || enrollmentClassMap.get(studentId) || enrollmentClassMap.get(data.luminaId || '') || data.classId || '';
          
          studentsMap.set(studentId, {
            id: studentId,
            name: data.fullName || data.name || 'Siswa Tanpa Nama',
            nickName: data.nickname || data.nickName || data.name?.split(' ')[0] || 'Siswa',
            classId: classId
          });
        });

        const fetchedStudents = Array.from(studentsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
        setStudents(fetchedStudents);
      } catch (err) {
        console.error('Error loading Kindergarten data for report:', err);
        toast.error('Gagal memuat data dasar kelas & siswa.');
      } finally {
        setIsLoading(false);
      }
    }

    loadKindergartenData();
  }, [activeYear]);

  // Fetch Attendance Records for the entire selected period
  const fetchAttendanceDocs = React.useCallback(async () => {
    if (!selectedClassId) return;
    setIsLoading(true);
    try {
      let startOfRange = '';
      let endOfRange = '';

      if (reportPeriodType === 'monthly') {
        const monthStr = String(selectedMonth + 1).padStart(2, '0');
        startOfRange = `${selectedYear}-${monthStr}-01`;
        endOfRange = `${selectedYear}-${monthStr}-31`;
      } else if (reportPeriodType === 'semester') {
        if (selectedSemester === 'ganjil') {
          startOfRange = `${selectedYear}-07-01`;
          endOfRange = `${selectedYear}-12-31`;
        } else {
          startOfRange = `${selectedYear}-01-01`;
          endOfRange = `${selectedYear}-06-30`;
        }
      } else if (reportPeriodType === 'yearly') {
        startOfRange = `${selectedYear}-01-01`;
        endOfRange = `${selectedYear}-12-31`;
      } else if (reportPeriodType === 'custom') {
        startOfRange = customStartDate || `${selectedYear}-01-01`;
        endOfRange = customEndDate || `${selectedYear}-12-31`;
      }

      console.log(`[Report Fetch] Loading attendance for class: ${selectedClassId}, range: ${startOfRange} to: ${endOfRange}`);

      const q = query(
        collection(db, 'attendance'),
        where('classId', '==', selectedClassId)
      );

      const querySnap = await getDocs(q);
      const docs = querySnap.docs
        .map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data()
        }))
        .filter((docData: any) => {
          return docData.date && docData.date >= startOfRange && docData.date <= endOfRange;
        });

      setAttendanceDocs(docs);
    } catch (err) {
      console.error('Error loading attendance documents:', err);
      toast.error('Gagal mengambil data absensi.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedClassId, selectedMonth, selectedYear, reportPeriodType, selectedSemester, customStartDate, customEndDate]);

  React.useEffect(() => {
    fetchAttendanceDocs();
  }, [fetchAttendanceDocs]);

  // Matching helper function (same logic as checklist to resolve student to active class)
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
    
    // Check for specific sub-classes
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

    // Prevent generic "tka" from loosely matching specific sub-classes
    const specificClassWords = [
      'koala', 'panda', 'caterpillar', 'butterfly',
      'cenderawasih', 'elang', 'kakatua', 'badak', 'komodo', 'tapir'
    ];
    const hasSpecS = specificClassWords.some(w => normS.includes(w));
    const hasSpecAct = specificClassWords.some(w => normId.includes(w) || normName.includes(w));
    
    if (hasSpecAct && !hasSpecS) {
      return false; // student is general, but active class is specific
    }
    
    if (normId.includes(normS) || normS.includes(normId)) return true;
    
    return false;
  };

  // Get active class details
  const activeClassObj = React.useMemo(() => {
    return classes.find(c => c.id === selectedClassId) || null;
  }, [classes, selectedClassId]);

  // Filter students belonging to the currently selected class
  const classStudents = React.useMemo(() => {
    if (!activeClassObj) return [];
    return students.filter(s => isStudentInClass(s.classId, activeClassObj));
  }, [students, activeClassObj]);

  // Status mapping to HSIA
  const mapStatusToHSIA = React.useCallback((emotionVal: string | undefined | null, statusVal: string | undefined | null): 'H' | 'S' | 'I' | 'A' | null => {
    const emo = (emotionVal || '').trim().toLowerCase();
    const stat = (statusVal || '').trim().toLowerCase();

    // SIK
    if (emo === 'sick' || stat === 'sakit' || stat === 'sick') return 'S';
    // IZIN
    if (emo === 'izin' || stat === 'izin' || stat === 'excused' || stat === 'permission') return 'I';
    // ALPA / TANPA KABAR
    if (
      emo === 'nonews' || 
      emo === 'no_news' || 
      emo === 'absent' || 
      emo === 'alpha' || 
      emo === 'alpa' ||
      stat === 'tanpa_kabar' || 
      stat === 'tanpa kabar' || 
      stat === 'alpa' || 
      stat === 'absent'
    ) return 'A';
    // HADIR
    if (
      emo === 'happy' || 
      emo === 'sad' || 
      emo === 'ok' || 
      emo === 'neutral' || 
      emo === 'angry' || 
      emo === 'present' || 
      emo === 'earlyleave' || 
      stat === 'hadir'
    ) return 'H';

    // Backups
    if (stat === 'hadir') return 'H';
    if (stat === 'sakit') return 'S';
    if (stat === 'izin') return 'I';
    if (stat === 'tanpa_kabar') return 'A';

    return null;
  }, []);

  // Compute aggregated stats for each student in class
  const aggregatedDataList = React.useMemo<StudentAggregatedData[]>(() => {
    if (classStudents.length === 0) return [];

    // Initialize map of stats per student
    const statsMap: Record<string, { H: number; S: number; I: number; A: number }> = {};
    classStudents.forEach(s => {
      statsMap[s.id] = { H: 0, S: 0, I: 0, A: 0 };
    });

    // Populate stats from each fetched attendance document
    attendanceDocs.forEach((docData: any) => {
      const studentListInDoc = docData.students || [];
      studentListInDoc.forEach((sVal: any) => {
        const sId = sVal.studentId;
        if (sId && statsMap[sId]) {
          const category = mapStatusToHSIA(sVal.emotion, sVal.status);
          if (category) {
            statsMap[sId][category] += 1;
          }
        }
      });
    });

    // Structure with student profile and percentage calculations
    return classStudents.map(s => {
      const { H, S, I, A } = statsMap[s.id] || { H: 0, S: 0, I: 0, A: 0 };
      const totalLogged = H + S + I + A;
      const attendancePercentage = totalLogged > 0 ? Math.round((H / totalLogged) * 100) : 100;

      return {
        id: s.id,
        name: s.name,
        nickName: s.nickName,
        classId: s.classId,
        H,
        S,
        I,
        A,
        totalLogged,
        attendancePercentage
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [classStudents, attendanceDocs, mapStatusToHSIA]);

  // Derived filter based on query search
  const filteredAggregatedData = React.useMemo(() => {
    if (!searchQuery.trim()) return aggregatedDataList;
    const cleanQuery = searchQuery.toLowerCase().trim();
    return aggregatedDataList.filter(item => 
      item.name.toLowerCase().includes(cleanQuery) || 
      item.nickName.toLowerCase().includes(cleanQuery)
    );
  }, [aggregatedDataList, searchQuery]);

  // Header Details (for PDF / Titles)
  const currentMonthName = React.useMemo(() => {
    const match = months.find(m => m.value === selectedMonth);
    return match ? match.label : 'Bulan';
  }, [selectedMonth]);

  const currentPeriodLabel = React.useMemo(() => {
    if (reportPeriodType === 'monthly') {
      return `${currentMonthName} ${selectedYear}`;
    }
    if (reportPeriodType === 'semester') {
      return `Semester ${selectedSemester === 'ganjil' ? 'Ganjil' : 'Genap'} ${selectedYear}`;
    }
    if (reportPeriodType === 'yearly') {
      return `Tahun ${selectedYear}`;
    }
    if (reportPeriodType === 'custom') {
      return `${customStartDate} s/d ${customEndDate}`;
    }
    return '';
  }, [reportPeriodType, currentMonthName, selectedYear, selectedSemester, customStartDate, customEndDate]);

  const activeClassName = React.useMemo(() => {
    return activeClassObj ? activeClassObj.name : 'Semua Kelas';
  }, [activeClassObj]);

  // Calculate Overall Averages for stats banner
  const averageAttendanceRate = React.useMemo(() => {
    if (aggregatedDataList.length === 0) return 0;
    const sum = aggregatedDataList.reduce((acc, curr) => acc + curr.attendancePercentage, 0);
    return Math.round(sum / aggregatedDataList.length);
  }, [aggregatedDataList]);

  const totalAlpaWarningCount = React.useMemo(() => {
    return aggregatedDataList.filter(s => s.A > 3).length;
  }, [aggregatedDataList]);

  // ----------------------------------------------------
  // EXPORTER IMPLEMENTATIONS
  // ----------------------------------------------------

  // 1. Export Excel using xlsx library
  const handleExportExcel = () => {
    if (aggregatedDataList.length === 0) {
      toast.error('Tidak ada data yang dapat diekspor!');
      return;
    }

    try {
      const dataToExport = aggregatedDataList.map((item, index) => ({
        'No': index + 1,
        'Nama Siswa': item.name,
        'Nama Panggilan': item.nickName,
        'Hadir (H)': item.H,
        'Sakit (S)': item.S,
        'Izin (I)': item.I,
        'Alpa (A)': item.A,
        'Total Logged (Hari)': item.totalLogged,
        'Persentase Kehadiran (%)': `${item.attendancePercentage}%`
      }));

      const worksheet = XLSX.utils.json_to_sheet([]);
      
      // Add custom header titles
      XLSX.utils.sheet_add_aoa(worksheet, [
        ['LAPORAN REKAPITULASI ABSENSI SISWA (H/S/I/A)'],
        [`Lumina Kindergarten - Tahun Ajaran ${activeYear}`],
        [`Kelas: ${activeClassName} | Periode Laporan: ${currentPeriodLabel}`],
        [], // spacing
      ], { origin: 'A1' });

      // Add actual data
      XLSX.utils.sheet_add_json(worksheet, dataToExport, { origin: 'A5', skipHeader: false });

      // Set styles options (autofit column widths)
      const maxColLengths = [5, 30, 15, 10, 10, 10, 10, 15, 25];
      worksheet['!cols'] = maxColLengths.map(w => ({ wch: w }));

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Laporan Rekap Absensi');
      
      const fileSafeClassName = activeClassName.replace(/[^a-zA-Z0-9]/g, '_');
      const fileSafePeriod = currentPeriodLabel.replace(/[^a-zA-Z0-9]/g, '_');
      XLSX.writeFile(workbook, `Rekap_Absensi_${fileSafeClassName}_${fileSafePeriod}.xlsx`);
      toast.success('Laporan Excel berhasil diunduh!');
    } catch (err) {
      console.error('Error generating Excel file:', err);
      toast.error('Terjadi kesalahan saat memexport Excel.');
    }
  };

  // 2. Export PDF with high-DPI canvas capture
  const handleExportPDF = async () => {
    const element = document.getElementById('attendance-report-pdf-capture');
    if (!element) {
      toast.error('Gagal melacak target visual tabel rekap.');
      return;
    }

    setIsExporting(true);
    toast.info('Menyiapkan file PDF, mohon tunggu sebentar...', { duration: 2500 });
    
    try {
      // Calculate optimized high density canvas
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#FFFFFF',
        windowWidth: 1200 // secure nice widths layout inside capture container
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = 210; // A4 standard width mm
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
      
      const fileSafeClassName = activeClassName.replace(/[^a-zA-Z0-9]/g, '_');
      const fileSafePeriod = currentPeriodLabel.replace(/[^a-zA-Z0-9]/g, '_');
      pdf.save(`Rekap_Absensi_${fileSafeClassName}_${fileSafePeriod}.pdf`);
      toast.success('Laporan PDF berhasil diunduh!');
    } catch (err) {
      console.error('Error exporting PDF:', err);
      toast.error('Gagal membungkus berkas PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div id="attendance-summary-container" className="min-h-screen bg-[#FAFDFB] p-4 lg:p-8">
      
      {/* Page Header */}
      <div className="max-w-7xl mx-auto mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button 
            id="back-to-checklist-btn"
            onClick={() => navigate('/kindy/checklist')}
            className="p-3 bg-white border border-emerald-100 text-emerald-800 rounded-2xl hover:bg-emerald-50 transition-all shadow-sm group"
            title="Kembali ke Checklist"
          >
            <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
          </button>
          
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1.5 bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                <BarChart2 size={12} /> REKAP STATUS
              </span>
              <span className="text-xs text-gray-400">TA: {activeYear}</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">Rekapitulasi Kehadiran</h1>
          </div>
        </div>

        {/* Action Download Buttons */}
        <div className="flex items-center gap-3 self-end sm:self-center">
          <button
            id="download-excel-btn"
            onClick={handleExportExcel}
            disabled={aggregatedDataList.length === 0 || isLoading}
            className="flex items-center gap-2 px-4 py-3 bg-white text-emerald-800 border border-emerald-100 rounded-2xl font-bold text-sm shadow-sm hover:bg-emerald-50/50 disabled:opacity-50 disabled:hover:bg-white transition-all cursor-pointer"
          >
            <Download size={16} /> Export Excel
          </button>
          
          <button
            id="download-pdf-btn"
            onClick={handleExportPDF}
            disabled={aggregatedDataList.length === 0 || isLoading || isExporting}
            className="flex items-center gap-2 px-5 py-3 bg-emerald-800 text-white rounded-2xl font-bold text-sm shadow-md hover:bg-emerald-900 disabled:opacity-50 transition-all cursor-pointer"
          >
            {isExporting ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Sedang Mengunduh...
              </>
            ) : (
              <>
                <Printer size={16} /> Download PDF
              </>
            )}
          </button>
        </div>
      </div>

      {/* Overview Analytics Bar */}
      <div className="max-w-7xl mx-auto mb-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Students Card */}
        <div className="bg-white rounded-3xl p-5 border border-emerald-100/50 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">Total Siswa Aktif</p>
            <h3 className="text-2xl font-black text-gray-900">{aggregatedDataList.length} Anak</h3>
            <p className="text-[10px] text-gray-400 mt-1">Siswa terdaftar di {activeClassName}</p>
          </div>
          <div className="w-12 h-12 bg-emerald-50 text-emerald-800 rounded-2xl flex items-center justify-center">
            <Users size={20} />
          </div>
        </div>

        {/* Average Attendance Rate */}
        <div className="bg-white rounded-3xl p-5 border border-emerald-100/50 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">Rata-Rata Kehadiran</p>
            <h3 className="text-2xl font-black text-emerald-800">{averageAttendanceRate}%</h3>
            <p className="text-[10px] text-gray-400 mt-1">Persentase kehadiran ({currentPeriodLabel})</p>
          </div>
          <div className="w-12 h-12 bg-emerald-50 text-emerald-800 rounded-2xl flex items-center justify-center">
            <TrendingUp size={20} />
          </div>
        </div>

        {/* Alpa Warning Alert Card */}
        <div className="bg-white rounded-3xl p-5 border border-emerald-100/50 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">Waspada Alpa ({`>3`} Hari)</p>
            <h3 className="text-2xl font-black text-red-600">{totalAlpaWarningCount} Anak</h3>
            <p className="text-[10px] text-gray-400 mt-1">Butuh perhatian & bina keluarga</p>
          </div>
          <div className="w-12 h-12 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center">
            <UserX size={20} />
          </div>
        </div>
      </div>

      {/* FILTER PANEL */}
      <div className="max-w-7xl mx-auto mb-8 bg-white rounded-3xl p-6 border border-emerald-100/50 shadow-sm">
        <h4 className="text-sm font-extrabold text-gray-900 mb-4 flex items-center gap-2">
          <span>⚙️ Filter Laporan</span>
        </h4>

        {/* Period Selector Tabs */}
        <div className="flex flex-wrap gap-2 mb-6 border-b border-emerald-50 pb-4">
          <button
            type="button"
            onClick={() => setReportPeriodType('monthly')}
            className={cn(
              "px-4 py-2 text-xs font-extrabold rounded-xl transition-all cursor-pointer border",
              reportPeriodType === 'monthly'
                ? "bg-emerald-800 text-white border-emerald-800 shadow-sm"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            )}
          >
            🗓️ Bulanan
          </button>
          <button
            type="button"
            onClick={() => setReportPeriodType('semester')}
            className={cn(
              "px-4 py-2 text-xs font-extrabold rounded-xl transition-all cursor-pointer border",
              reportPeriodType === 'semester'
                ? "bg-emerald-800 text-white border-emerald-800 shadow-sm"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            )}
          >
            🏫 Semesteran
          </button>
          <button
            type="button"
            onClick={() => setReportPeriodType('yearly')}
            className={cn(
              "px-4 py-2 text-xs font-extrabold rounded-xl transition-all cursor-pointer border",
              reportPeriodType === 'yearly'
                ? "bg-emerald-800 text-white border-emerald-800 shadow-sm"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            )}
          >
            🎓 Tahunan
          </button>
          <button
            type="button"
            onClick={() => setReportPeriodType('custom')}
            className={cn(
              "px-4 py-2 text-xs font-extrabold rounded-xl transition-all cursor-pointer border",
              reportPeriodType === 'custom'
                ? "bg-emerald-800 text-white border-emerald-800 shadow-sm"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            )}
          >
            📐 Rentang Tanggal
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          
          {/* Class Select Dropdown */}
          <div className="space-y-1.5 col-span-1">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Pilih Kelas</label>
            <div className="relative">
              <Users size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <select
                id="class-selector"
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-xl py-2.5 pl-10 pr-4 text-sm font-medium text-gray-800 focus:outline-none focus:border-emerald-800 transition-all cursor-pointer"
              >
                {classes.length === 0 ? (
                  <option value="">Memuat kelas...</option>
                ) : (
                  classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* DYNAMIC PERIOD CONTROLS */}
          {reportPeriodType === 'monthly' && (
            <>
              {/* Month Picker Selection */}
              <div className="space-y-1.5 col-span-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Bulan</label>
                <div className="relative">
                  <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <select
                    id="month-selector"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="w-full bg-white border border-gray-200 rounded-xl py-2.5 pl-10 pr-4 text-sm font-medium text-gray-800 focus:outline-none focus:border-emerald-800 transition-all cursor-pointer"
                  >
                    {months.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Year Select Filter */}
              <div className="space-y-1.5 col-span-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Tahun</label>
                <div className="relative">
                  <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <select
                    id="year-selector"
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl py-2.5 pl-10 pr-4 text-sm font-medium text-gray-800 focus:outline-none focus:border-emerald-800 transition-all cursor-pointer"
                  >
                    {yearOptions.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          {reportPeriodType === 'semester' && (
            <>
              {/* Semester Selector */}
              <div className="space-y-1.5 col-span-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Semester</label>
                <div className="relative">
                  <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <select
                    id="semester-selector"
                    value={selectedSemester}
                    onChange={(e) => setSelectedSemester(e.target.value as 'ganjil' | 'genap')}
                    className="w-full bg-white border border-gray-200 rounded-xl py-2.5 pl-10 pr-4 text-sm font-medium text-gray-800 focus:outline-none focus:border-emerald-800 transition-all cursor-pointer"
                  >
                    <option value="ganjil">Semester Ganjil (Jul - Des)</option>
                    <option value="genap">Semester Genap (Jan - Jun)</option>
                  </select>
                </div>
              </div>

              {/* Year Select Filter */}
              <div className="space-y-1.5 col-span-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Tahun</label>
                <div className="relative">
                  <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <select
                    id="year-selector"
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl py-2.5 pl-10 pr-4 text-sm font-medium text-gray-800 focus:outline-none focus:border-emerald-800 transition-all cursor-pointer"
                  >
                    {yearOptions.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          {reportPeriodType === 'yearly' && (
            <>
              {/* Year Select Filter */}
              <div className="space-y-1.5 col-span-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Pilih Tahun</label>
                <div className="relative">
                  <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <select
                    id="year-selector"
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl py-2.5 pl-10 pr-4 text-sm font-medium text-gray-800 focus:outline-none focus:border-emerald-800 transition-all cursor-pointer"
                  >
                    {yearOptions.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="hidden md:block col-span-1"></div>
            </>
          )}

          {reportPeriodType === 'custom' && (
            <>
              {/* Start Date */}
              <div className="space-y-1.5 col-span-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Tanggal Mulai</label>
                <div className="relative">
                  <input
                    id="custom-start-date"
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl py-2 text-sm font-medium text-gray-800 focus:outline-none focus:border-emerald-800 transition-all px-3"
                  />
                </div>
              </div>

              {/* End Date */}
              <div className="space-y-1.5 col-span-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Tanggal Selesai</label>
                <div className="relative">
                  <input
                    id="custom-end-date"
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl py-2 text-sm font-medium text-gray-800 focus:outline-none focus:border-emerald-800 transition-all px-3"
                  />
                </div>
              </div>
            </>
          )}

          {/* Quick Search Student Field */}
          <div className="space-y-1.5 col-span-1">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Cari Siswa</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                id="student-search-input"
                type="text"
                placeholder="Kata kunci nama..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-xl py-2.5 pl-10 pr-4 text-sm text-gray-800 focus:outline-none focus:border-emerald-800 transition-all"
              />
            </div>
          </div>

        </div>
      </div>

      {/* TABLE VISUAL SECTION */}
      <div className="max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          {isLoading ? (
            /* Loading Spinner visual overlay */
            <motion.div 
              key="loading-spinner"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center p-16 bg-white border border-emerald-50 rounded-[2rem] shadow-sm text-center"
            >
              <Loader2 size={36} className="animate-spin text-emerald-800 mb-4" />
              <p className="text-sm font-bold text-emerald-800 tracking-wider uppercase animate-pulse">Menghitung Data Absensi...</p>
              <p className="text-xs text-gray-400 mt-1">Mengambil riwayat dari koleksi Firestore dan mengagregasikan...</p>
            </motion.div>
          ) : filteredAggregatedData.length === 0 ? (
            /* Empty state placeholder */
            <motion.div 
              key="empty-state"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="bg-white border border-emerald-100 rounded-[2rem] p-16 text-center shadow-sm space-y-4 max-w-2xl mx-auto"
            >
              <div className="w-16 h-16 bg-emerald-50 rounded-2xl mx-auto flex items-center justify-center text-emerald-800 pointer-events-none">
                <FileText size={28} />
              </div>
              <div>
                <h3 className="text-lg font-black text-gray-900">Belum Ada Rekapitulasi</h3>
                <p className="text-sm text-gray-500 mt-2 leading-relaxed">
                  Tidak ditemukan record absen untuk kelas <strong>{activeClassName}</strong> pada periode <strong>{currentPeriodLabel}</strong>. Silakan isi checklist harian terlebih dahulu.
                </p>
              </div>
              <button
                onClick={() => navigate('/kindy/checklist')}
                className="px-5 py-2.5 bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-md hover:bg-emerald-900 transition-all cursor-pointer"
              >
                Isi Log Checklist Sekarang
              </button>
            </motion.div>
          ) : (
            /* Report content rendering */
            <motion.div
              key="table-content animate"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="bg-white border border-emerald-100 rounded-[2rem] shadow-lg overflow-hidden"
            >
              
              {/* Visual print packaging capture wrapper */}
              <div id="attendance-report-pdf-capture" className="p-8">
                
                {/* PDF Print Header (Hidden on normal web rendering but captured by html2canvas) */}
                <div className="mb-6 pb-6 border-b border-gray-100">
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-2xl font-black text-[#002366] tracking-tight uppercase">Lumina Kindergarten</h2>
                      <p className="text-xs text-gray-500 font-medium">Laporan Rekapitulasi Absensi Siswa (H/S/I/A)</p>
                      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-600 font-bold">
                        <p>Kelas: <span className="text-emerald-800">{activeClassName}</span></p>
                        <p>Periode: <span className="text-emerald-800">{currentPeriodLabel}</span></p>
                        <p>Tahun Ajaran: <span className="text-emerald-800">{activeYear}</span></p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="inline-block px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-xl text-[10px] font-black uppercase tracking-wider">
                        LAPORAN RESMI
                      </span>
                      <p className="text-[10px] text-gray-400 mt-1">Dicetak pada: {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                    </div>
                  </div>
                </div>

                {/* Table Layout */}
                <div className="overflow-x-auto">
                  <table id="recap-table" className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-emerald-100/50 text-emerald-800 font-bold text-xs uppercase tracking-wider">
                        <th className="py-4 px-4 text-center w-12">No.</th>
                        <th className="py-4 px-4">Nama Lengkap Siswa</th>
                        <th className="py-4 px-4 w-28">Nama Panggilan</th>
                        <th className="py-4 px-4 text-center w-24">Hadir (H)</th>
                        <th className="py-4 px-4 text-center w-24">Sakit (S)</th>
                        <th className="py-4 px-4 text-center w-24">Izin (I)</th>
                        <th className="py-4 px-4 text-center w-24">Alpa (A)</th>
                        <th className="py-4 px-4 text-center w-36">% Kehadiran</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-sm">
                      {filteredAggregatedData.map((item, idx) => {
                        const totalLogged = item.totalLogged;
                        // Alpa Warning visual triggers
                        const isAlpaAlert = item.A > 3;

                        return (
                          <tr 
                            key={item.id} 
                            id={`row-student-${item.id}`}
                            className={cn(
                              "hover:bg-slate-50/50 transition-colors",
                              isAlpaAlert && "bg-red-50/10 hover:bg-red-50/25"
                            )}
                          >
                            <td className="py-3 px-4 text-center font-mono text-xs text-gray-400">
                              {idx + 1}
                            </td>
                            <td className="py-3 px-4 font-bold text-gray-900">
                              <div>
                                {item.name}
                                {isAlpaAlert && (
                                  <span className="ml-2 inline-flex items-center gap-1 text-[10px] bg-red-100 text-red-700 font-extrabold px-2 py-0.5 rounded-full">
                                    <AlertTriangle size={10} /> Alpa &gt; 3 Hari!
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4 font-semibold text-gray-600">
                              {item.nickName}
                            </td>
                            <td className="py-3 px-4 text-center font-bold text-emerald-800">
                              {item.H}
                            </td>
                            <td className="py-3 px-4 text-center font-bold text-amber-600">
                              {item.S}
                            </td>
                            <td className="py-3 px-4 text-center font-bold text-blue-600">
                              {item.I}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span 
                                id={`alpa-count-${item.id}`}
                                className={cn(
                                  "font-bold px-2.5 py-1 rounded-lg text-sm",
                                  isAlpaAlert 
                                    ? "text-red-700 bg-red-100 font-extrabold shadow-sm border border-red-200" 
                                    : "text-gray-500 bg-slate-100"
                                )}
                              >
                                {item.A}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <span className={cn(
                                  "font-black tracking-tight",
                                  item.attendancePercentage >= 90 ? "text-emerald-800" :
                                  item.attendancePercentage >= 75 ? "text-amber-600" :
                                  "text-red-600"
                                )}>
                                  {item.attendancePercentage}%
                                </span>
                                <span className="text-[10px] text-gray-400">({totalLogged}d)</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Print Signatures and Legends Footer */}
                <div className="mt-12 pt-8 border-t border-dashed border-gray-100 grid grid-cols-2 gap-8 text-xs text-gray-500">
                  <div>
                    <h5 className="font-extrabold text-gray-800 mb-2">💡 Legenda & Keterangan</h5>
                    <ul className="space-y-1">
                      <li>• <strong>Hadir (H):</strong> Mencakup Hadir dengan emosi (Happy/Sad/OK/Angry) & Early Leave.</li>
                      <li>• <strong>Sakit (S):</strong> Rekam kondisi sakit siswa.</li>
                      <li>• <strong>Izin (I):</strong> Rekam absensi dengan izin resmi/excused.</li>
                      <li>• <strong>Alpa (A):</strong> Tanpa keterangan / Tanpa berita (No News).</li>
                      <li>• <strong>Peringatan Alpa (A &gt; 3 Hari):</strong> Diberi lampu merah untuk evaluasi wali murid.</li>
                    </ul>
                  </div>
                  <div className="text-right flex flex-col justify-between h-28 pr-6">
                    <p className="font-bold text-gray-700">Wali Kelas / Guru Lumina,</p>
                    <div className="mt-auto">
                      <div className="h-0.5 bg-slate-200 w-44 ml-auto mb-1"></div>
                      <p className="font-black text-gray-900">Staff Unit Kindergarten</p>
                    </div>
                  </div>
                </div>

              </div>

            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </div>
  );
}
