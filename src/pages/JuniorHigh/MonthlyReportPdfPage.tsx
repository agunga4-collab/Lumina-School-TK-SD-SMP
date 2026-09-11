import * as React from 'react';
import { motion } from 'motion/react';
import { 
  FileText, Calendar, Users, RefreshCw, AlertCircle, Info, CheckCircle2, 
  ArrowRight, ExternalLink, Loader2
} from 'lucide-react';
import { db, getClasses, getActiveStudents, getReportConfig } from '../../lib/firebase';
import { doc, getDoc, getDocs, query, collection, where } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { toast } from 'sonner';
import { useJHReportAttendance } from '../../hooks/useJHReportAttendance';
import type { Class, Student, ClassReportSummary, JuniorHighMonthlyReportComment } from '../../types';
import { validateReportReadiness } from './MonthlyReportReadinessHelper';
import { html2canvasWithModernColors } from '../../lib/html2canvasPatch';
import { jsPDF } from 'jspdf';
import { uploadJuniorHighMonthlyReportPdf } from '../../lib/juniorHighMonthlyReportDrive';
import { 
  normalizeFilename, 
  getNextReportVersion, 
  savePublishedReportMetadata, 
  getLatestPublishedReport,
  PublishedReportMetadata
} from '../../lib/juniorHighMonthlyReportPdf';

const indonesianMonths = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

function getIndonesianMonthLabel(periodKey: string): string {
  if (!periodKey || !periodKey.includes('-')) return '';
  const [year, month] = periodKey.split('-');
  const monthIdx = parseInt(month, 10) - 1;
  if (monthIdx >= 0 && monthIdx < 12) {
    return `${indonesianMonths[monthIdx]} ${year}`;
  }
  return periodKey;
}

const englishMonths = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function getEnglishPeriodDetails(periodKey: string) {
  if (!periodKey || !periodKey.includes('-')) {
    return { day: '31', monthName: 'August', year: '2026' };
  }
  const [yearStr, monthStr] = periodKey.split('-');
  const yearVal = parseInt(yearStr, 10);
  const monthVal = parseInt(monthStr, 10);
  const monthIdx = monthVal - 1;
  const monthName = (monthIdx >= 0 && monthIdx < 12) ? englishMonths[monthIdx] : 'August';
  
  // Get last day of the month
  const lastDay = new Date(yearVal, monthVal, 0).getDate();
  
  return {
    day: String(lastDay),
    monthName,
    year: String(yearVal)
  };
}

export default function MonthlyReportPdfPage() {
  const { profile, user: currentUser } = useAuth();
  const { activeYear, activeSemester } = useAcademicYear();

  // Context Filter states
  const [selectedYear, setSelectedYear] = React.useState<string>('2026/2027');
  const [selectedSemester, setSelectedSemester] = React.useState<string>('1');
  const [selectedMonth, setSelectedMonth] = React.useState<string>('');
  const [selectedClassId, setSelectedClassId] = React.useState<string>('');

  // Logos and configs
  const [logos, setLogos] = React.useState<any>(null);
  const [reportConfig, setReportConfig] = React.useState<any>(null);
  const [isPrincipalConfigMissing, setIsPrincipalConfigMissing] = React.useState<boolean>(false);
  const [homeroomTeacherProfile, setHomeroomTeacherProfile] = React.useState<any>(null);

  React.useEffect(() => {
    const fetchLogosAndConfig = async () => {
      try {
        const logoDoc = await getDoc(doc(db, "settings", "logos"));
        if (logoDoc.exists()) {
          setLogos(logoDoc.data() as any);
        }
      } catch (err) {
        console.warn("Failed to load school logos in PDF page:", err);
      }

      try {
        setIsPrincipalConfigMissing(false);
        const q = query(collection(db, "reportConfig"), where("status", "==", "active"));
        const snap = await getDocs(q);
        const configs = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));

        // Required lookup priority:
        // 1. Active exact JUNIOR_HIGH + MONTHLY_PROGRESS + academicYear configuration
        let resolved = configs.find(c => 
          (c.unit === 'JUNIOR_HIGH' || c.unitId === 'JUNIOR_HIGH') &&
          c.reportType === 'MONTHLY_PROGRESS' &&
          c.academicYear === selectedYear
        );

        // 2. Active JUNIOR_HIGH + MONTHLY_PROGRESS default
        if (!resolved) {
          resolved = configs.find(c => 
            (c.unit === 'JUNIOR_HIGH' || c.unitId === 'JUNIOR_HIGH') &&
            c.reportType === 'MONTHLY_PROGRESS' &&
            (!c.academicYear || c.academicYear === '')
          );
        }

        // 3. Active JUNIOR_HIGH default
        if (!resolved) {
          resolved = configs.find(c => 
            (c.unit === 'JUNIOR_HIGH' || c.unitId === 'JUNIOR_HIGH') &&
            (!c.reportType || c.reportType === '' || c.reportType === 'DEFAULT')
          );
        }

        // Fallback by ID 'JUNIOR_HIGH' if active and correct unit
        if (!resolved) {
          const defaultDoc = configs.find(c => c.id === 'JUNIOR_HIGH');
          if (defaultDoc && (defaultDoc.unit === 'JUNIOR_HIGH' || defaultDoc.unitId === 'JUNIOR_HIGH')) {
            resolved = defaultDoc;
          }
        }

        if (resolved) {
          setReportConfig(resolved);
        } else {
          setReportConfig(null);
          setIsPrincipalConfigMissing(true);
        }
      } catch (err) {
        console.warn("Failed to resolve JUNIOR_HIGH principal config:", err);
        setReportConfig(null);
        setIsPrincipalConfigMissing(true);
      }
    };
    fetchLogosAndConfig();
  }, [selectedYear]);

  // Loaded data states
  const [classesList, setClassesList] = React.useState<Class[]>([]);
  const [loadingClasses, setLoadingClasses] = React.useState<boolean>(false);
  const [students, setStudents] = React.useState<Student[]>([]);
  const [loadingStudents, setLoadingStudents] = React.useState<boolean>(false);
  const [classSummary, setClassSummary] = React.useState<ClassReportSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = React.useState<boolean>(false);
  const [commentsMap, setCommentsMap] = React.useState<Record<string, JuniorHighMonthlyReportComment>>({});
  const [loadingComments, setLoadingComments] = React.useState<boolean>(false);

  // Error boundary tracking
  const [studentsError, setStudentsError] = React.useState<boolean>(false);
  const [summaryError, setSummaryError] = React.useState<boolean>(false);
  const [commentsError, setCommentsError] = React.useState<boolean>(false);

  // Self-Exploration tracker
  const [resolvedCycle, setResolvedCycle] = React.useState<any>(null);
  const [reflectionMap, setReflectionMap] = React.useState<Record<string, any>>({});
  const [loadingSelfExploration, setLoadingSelfExploration] = React.useState<boolean>(false);

  // Published report tracking (history list)
  const [publishedReportsMap, setPublishedReportsMap] = React.useState<Record<string, PublishedReportMetadata>>({});
  const [loadingPublished, setLoadingPublished] = React.useState<boolean>(false);

  // Current generating context
  const [generatingStudent, setGeneratingStudent] = React.useState<Student | null>(null);

  // Dynamic Semester Unit Activities
  const [unitActivityEnrollments, setUnitActivityEnrollments] = React.useState<any[]>([]);
  const [semesterSummariesMap, setSemesterSummariesMap] = React.useState<Record<string, string>>({});
  const [loadingUaData, setLoadingUaData] = React.useState<boolean>(false);

  // Fetch active Unit Activity enrollments and semester summaries
  React.useEffect(() => {
    const fetchUaData = async () => {
      if (!selectedYear || !selectedSemester || !selectedMonth) return;
      setLoadingUaData(true);
      try {
        const [enrollSnap, summariesSnap] = await Promise.all([
          getDocs(query(
            collection(db, 'junior_high_unit_activity_enrollments'),
            where('academicYear', '==', selectedYear),
            where('status', '==', 'CONFIRMED')
          )),
          getDocs(query(
            collection(db, 'junior_high_unit_activity_semester_summaries'),
            where('academicYear', '==', selectedYear),
            where('semester', '==', selectedSemester),
            where('month', '==', selectedMonth)
          ))
        ]);

        const enrollmentsList = enrollSnap.docs
          .map(docSnap => docSnap.data())
          .filter(e => String(e.semester) === String(selectedSemester));
        setUnitActivityEnrollments(enrollmentsList);

        const sMap: Record<string, string> = {};
        summariesSnap.docs.forEach(docSnap => {
          const data = docSnap.data();
          if (data.normalizedUaName) {
            sMap[data.normalizedUaName] = data.summary || '';
          }
        });
        setSemesterSummariesMap(sMap);
      } catch (err) {
        console.error('[MonthlyReportPdfPage] Error fetching UA master data:', err);
      } finally {
        setLoadingUaData(false);
      }
    };
    fetchUaData();
  }, [selectedYear, selectedSemester, selectedMonth]);

  // Find selected class object
  const selectedClassObj = React.useMemo(() => {
    return classesList.find(c => c.id === selectedClassId);
  }, [classesList, selectedClassId]);

  React.useEffect(() => {
    const fetchHomeroomTeacher = async () => {
      if (!selectedClassObj?.homeroomTeacherId) {
        setHomeroomTeacherProfile(null);
        return;
      }
      try {
        const userDoc = await getDoc(doc(db, 'users', selectedClassObj.homeroomTeacherId));
        if (userDoc.exists()) {
          setHomeroomTeacherProfile(userDoc.data());
        } else {
          setHomeroomTeacherProfile(null);
        }
      } catch (err) {
        console.warn("Failed to fetch homeroom teacher profile for signatures:", err);
        setHomeroomTeacherProfile(null);
      }
    };
    fetchHomeroomTeacher();
  }, [selectedClassObj]);

  // Map student IDs
  const activeStudentIds = React.useMemo(() => {
    return students.map(s => s.id);
  }, [students]);

  // Hook for read-only monthly attendance resolution
  const {
    loading: loadingAttendance,
    error: attendanceError,
    attendanceAvailableForPeriod,
    studentAttendanceMap,
  } = useJHReportAttendance({
    selectedClassId,
    selectedClassName: selectedClassObj?.name,
    selectedYear,
    selectedSemester,
    selectedMonth,
    studentIds: activeStudentIds,
  });

  // Initial parameters
  React.useEffect(() => {
    if (activeYear) setSelectedYear(activeYear);
    if (activeSemester) setSelectedSemester(String(activeSemester));

    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(currentMonthStr);
  }, [activeYear, activeSemester]);

  // Fetch classes
  React.useEffect(() => {
    const fetchJHClasses = async () => {
      setLoadingClasses(true);
      try {
        const [all, enrollmentsSnap] = await Promise.all([
          getClasses(),
          getDocs(query(
            collection(db, 'enrollments'),
            where('academicYear', '==', selectedYear),
            where('status', '==', 'active')
          ))
        ]);

        const activeClassKeys = new Set<string>();
        enrollmentsSnap.docs.forEach(d => {
          const e = d.data();
          if (e.classId) {
            activeClassKeys.add(e.classId);
          }
        });

        const jhClasses = (all || []).filter(c => {
          const isJH = c.unitId === 'JUNIOR_HIGH';
          const isActiveYear = c.academicYear === selectedYear;
          const isNotArchived = c.status !== 'archived';
          
          if (!isJH || !isActiveYear || !isNotArchived) return false;

          const hasEnrolledStudent = activeClassKeys.has(c.id) || 
                                     activeClassKeys.has(c.name) || 
                                     ((c as any).classId && activeClassKeys.has((c as any).classId));
          return hasEnrolledStudent;
        });

        setClassesList(jhClasses);

        // Selection Behavior:
        // Clear if not valid in the new context, otherwise keep it
        if (selectedClassId) {
          const isStillEligible = jhClasses.some(c => c.id === selectedClassId);
          if (!isStillEligible) {
            setSelectedClassId('');
          }
        } else {
          setSelectedClassId('');
        }
      } catch (err) {
        console.error('[MonthlyReportPdfPage] Error loading Junior High classes:', err);
        toast.error('Gagal memuat daftar kelas');
      } finally {
        setLoadingClasses(false);
      }
    };
    fetchJHClasses();
  }, [selectedYear]);

  // Cleanup selection on context filter change
  React.useEffect(() => {
    setStudents([]);
    setClassSummary(null);
    setCommentsMap({});
    setReflectionMap({});
    setPublishedReportsMap({});
    setResolvedCycle(null);
    setStudentsError(false);
    setSummaryError(false);
    setCommentsError(false);
    setGeneratingStudent(null);
  }, [selectedClassId, selectedYear, selectedSemester, selectedMonth]);

  // Secondary Data Source fetchers
  const loadReportData = async () => {
    if (!selectedClassId || !selectedYear || !selectedSemester || !selectedMonth) return;

    setLoadingStudents(true);
    setLoadingSummary(true);
    setLoadingComments(true);
    setLoadingSelfExploration(true);
    setLoadingPublished(true);
    setStudentsError(false);
    setSummaryError(false);
    setCommentsError(false);

    // 1. Fetch Students
    try {
      const list = await getActiveStudents(selectedClassId, selectedYear);
      const sorted = (list || []).sort((a, b) => {
        const numA = a.attendanceNumber ?? a.noAbsen ?? a.rollNumber ?? a.rosterNumber ?? 999;
        const numB = b.attendanceNumber ?? b.noAbsen ?? b.rollNumber ?? b.rosterNumber ?? 999;
        if (numA !== numB) {
          return numA - numB;
        }
        return a.name.localeCompare(b.name);
      });
      setStudents(sorted);
    } catch (err) {
      console.error('[MonthlyReportPdfPage] Error fetching students:', err);
      setStudentsError(true);
    } finally {
      setLoadingStudents(false);
    }

    // 2. Fetch Class Summary (Phase 1)
    try {
      const academicYearNormalized = selectedYear.replace(/\//g, '-');
      const summaryId = `JUNIOR_HIGH_MONTHLY_PROGRESS_${selectedClassId}_${academicYearNormalized}_${selectedSemester}_${selectedMonth}`;
      const summaryRef = doc(db, 'class_report_summaries', summaryId);
      const summarySnap = await getDoc(summaryRef);
      if (summarySnap.exists()) {
        setClassSummary(summarySnap.data() as ClassReportSummary);
      } else {
        setClassSummary(null);
      }
    } catch (err) {
      console.error('[MonthlyReportPdfPage] Error fetching class summary:', err);
      setSummaryError(true);
    } finally {
      setLoadingSummary(false);
    }

    // 3. Fetch Student General Comments
    try {
      const q = query(
        collection(db, 'junior_high_monthly_report_comments'),
        where('classId', '==', selectedClassId),
        where('academicYear', '==', selectedYear),
        where('semester', '==', selectedSemester),
        where('periodKey', '==', selectedMonth)
      );
      const snap = await getDocs(q);
      const map: Record<string, JuniorHighMonthlyReportComment> = {};
      snap.docs.forEach(docSnap => {
        const data = docSnap.data() as JuniorHighMonthlyReportComment;
        if (data.studentId) {
          map[data.studentId] = { ...data, id: docSnap.id };
        }
      });
      setCommentsMap(map);
    } catch (err) {
      console.error('[MonthlyReportPdfPage] Error fetching comments:', err);
      setCommentsError(true);
    } finally {
      setLoadingComments(false);
    }

    // 4. Fetch Self Exploration Cycle and Reflections
    try {
      const cycleQuery = query(
        collection(db, 'seReflectionCycles'),
        where('unit', '==', 'JUNIOR_HIGH'),
        where('academicYear', '==', selectedYear),
        where('semester', '==', selectedSemester),
        where('periodKey', '==', selectedMonth)
      );
      const cycleSnap = await getDocs(cycleQuery);
      if (!cycleSnap.empty) {
        const cycleObj = { id: cycleSnap.docs[0].id, ...cycleSnap.docs[0].data() };
        setResolvedCycle(cycleObj);

        // Fetch all reflections for this cycle in this class
        const reflectionsQuery = query(
          collection(db, 'seMonthlyReflections'),
          where('unit', '==', 'JUNIOR_HIGH'),
          where('reflectionCycleId', '==', cycleObj.id),
          where('classId', '==', selectedClassId)
        );
        const reflectionsSnap = await getDocs(reflectionsQuery);
        const rMap: Record<string, any> = {};
        reflectionsSnap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.studentId) {
            rMap[data.studentId] = { id: docSnap.id, ...data };
          }
        });
        setReflectionMap(rMap);
      } else {
        setResolvedCycle(null);
        setReflectionMap({});
      }
    } catch (err) {
      console.error('[MonthlyReportPdfPage] Error loading self-exploration data:', err);
      setResolvedCycle(null);
      setReflectionMap({});
    } finally {
      setLoadingSelfExploration(false);
    }

    // 5. Fetch previous published PDF report versions
    try {
      const publishedQuery = query(
        collection(db, 'published_junior_high_monthly_reports'),
        where('unit', '==', 'JUNIOR_HIGH'),
        where('reportType', '==', 'MONTHLY_REPORT'),
        where('classId', '==', selectedClassId),
        where('academicYear', '==', selectedYear),
        where('semester', '==', selectedSemester),
        where('periodKey', '==', selectedMonth)
      );
      const publishedSnap = await getDocs(publishedQuery);
      const pMap: Record<string, PublishedReportMetadata> = {};
      publishedSnap.docs.forEach((d) => {
        const data = d.data() as PublishedReportMetadata;
        const sId = data.studentId;
        // Keep the latest version in the map to render on UI
        if (!pMap[sId] || data.version > pMap[sId].version) {
          pMap[sId] = { id: d.id, ...data };
        }
      });
      setPublishedReportsMap(pMap);
    } catch (err) {
      console.error('[MonthlyReportPdfPage] Error loading published reports:', err);
      setPublishedReportsMap({});
    } finally {
      setLoadingPublished(false);
    }
  };

  React.useEffect(() => {
    if (selectedClassId && selectedYear && selectedSemester && selectedMonth) {
      loadReportData();
    }
  }, [selectedClassId, selectedYear, selectedSemester, selectedMonth]);

  // Compute readiness stats (Shared helper validation logic)
  const readinessResult = React.useMemo(() => {
    return validateReportReadiness(
      {
        classId: selectedClassId,
        academicYear: selectedYear,
        semester: selectedSemester,
        periodKey: selectedMonth,
        unit: 'JUNIOR_HIGH',
        reportType: 'MONTHLY_PROGRESS',
      },
      {
        loadingClasses,
        loadingStudents,
        loadingSummary,
        loadingComments,
        loadingAttendance,
      },
      {
        studentsError,
        summaryError,
        commentsError,
        attendanceError: !!attendanceError,
      },
      {
        students,
        classSummary,
        commentsMap,
        attendanceAvailableForPeriod,
      }
    );
  }, [
    selectedClassId,
    selectedYear,
    selectedSemester,
    selectedMonth,
    loadingClasses,
    loadingStudents,
    loadingSummary,
    loadingComments,
    loadingAttendance,
    studentsError,
    summaryError,
    commentsError,
    attendanceError,
    students,
    classSummary,
    commentsMap,
    attendanceAvailableForPeriod,
  ]);

  const { overallState } = readinessResult;
  const isGlobalReady = overallState === 'READY FOR FUTURE PUBLISH';

  // Handle single student PDF generation and upload
  const { getGoogleDriveToken } = useAuth();

  const handleGeneratePdf = async (student: Student) => {
    if (isPrincipalConfigMissing || !reportConfig) {
      toast.error('Konfigurasi Principal Monthly Report SMP belum tersedia.');
      return;
    }

    if (!isGlobalReady) {
      toast.error('Lengkapi seluruh validasi report sebelum membuat PDF.');
      return;
    }

    // Double check comment and attendance is fully present
    const commentObj = commentsMap[student.id];
    if (!commentObj || commentObj.status !== 'FINAL') {
      toast.error(`Komentar umum siswa ${student.name} belum final.`);
      return;
    }

    if (!attendanceAvailableForPeriod || !studentAttendanceMap[student.id]) {
      toast.error(`Data kehadiran siswa ${student.name} belum terekam.`);
      return;
    }

    const attObj = studentAttendanceMap[student.id];
    const isValidAttendanceValue = (val: any): boolean => {
      if (val === null || val === undefined || val === '') return false;
      if (typeof val === 'object') return false;
      const num = Number(val);
      return !isNaN(num) && Number.isFinite(num) && num >= 0;
    };

    if (
      !attObj ||
      !isValidAttendanceValue(attObj.sickLeave) ||
      !isValidAttendanceValue(attObj.excusedLeave) ||
      !isValidAttendanceValue(attObj.absent)
    ) {
      toast.error(`Attendance data is incomplete for this student. PDF cannot be generated.`);
      return;
    }

    try {
      // 1. Toast Memeriksa kelengkapan laporan
      toast.loading("Memeriksa kelengkapan laporan...", { id: "jh-publish" });
      setGeneratingStudent(student);

      // Give React a small tick to render the hidden frame
      await new Promise(resolve => setTimeout(resolve, 300));

      // 2. Toast Menghubungkan Google Drive
      toast.loading("Menghubungkan Google Drive...", { id: "jh-publish" });
      const token = await getGoogleDriveToken();
      if (!token) {
        throw new Error('AUTH_DENIED: Gagal mendapatkan akses Google Drive. Harap beri izin integrasi.');
      }

      // 3. Toast Merender Monthly Report
      toast.loading("Merender Monthly Report...", { id: "jh-publish" });
      const page1El = document.getElementById("jh-pdf-page-1");
      const page2El = document.getElementById("jh-pdf-page-2");

      if (!page1El || !page2El) {
        throw new Error('Halaman layout render PDF tidak ditemukan.');
      }

      // Render Page 1 to Canvas
      const canvas1 = await html2canvasWithModernColors(page1El, {
        scale: 2,
        useCORS: true,
        logging: false,
        windowWidth: 794,
        windowHeight: 1123,
        onclone: (clonedDoc, clonedElement) => {
          if (clonedElement) {
            clonedElement.style.width = '794px';
            clonedElement.style.height = '1123px';
            clonedElement.style.minWidth = '794px';
            clonedElement.style.minHeight = '1123px';
            clonedElement.style.boxSizing = 'border-box';
          }
        }
      });

      // Render Page 2 to Canvas
      const canvas2 = await html2canvasWithModernColors(page2El, {
        scale: 2,
        useCORS: true,
        logging: false,
        windowWidth: 794,
        windowHeight: 1123,
        onclone: (clonedDoc, clonedElement) => {
          if (clonedElement) {
            clonedElement.style.width = '794px';
            clonedElement.style.height = '1123px';
            clonedElement.style.minWidth = '794px';
            clonedElement.style.minHeight = '1123px';
            clonedElement.style.boxSizing = 'border-box';
          }
        }
      });

      const imgData1 = canvas1.toDataURL('image/jpeg', 0.85);
      const imgData2 = canvas2.toDataURL('image/jpeg', 0.85);

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      const periodDetails = getEnglishPeriodDetails(selectedMonth);
      const studentReflectionDoc = reflectionMap[student.id];
      const studentApprovedSlots = (studentReflectionDoc?.overallStatus === 'APPROVED')
        ? (studentReflectionDoc.slots || [])
            .filter((slot: any) => slot.status === 'APPROVED' && slot.reflectionText?.trim())
            .sort((a: any, b: any) => a.slot - b.slot)
        : [];

      // Page 1
      pdf.addImage(imgData1, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
      
      // Invisible selectable/searchable text overlay for Page 1
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(1);
      pdf.text(`STUDENT'S MONTHLY PROGRESS REPORT`, 10, 10);
      pdf.text(`Student's name : ${student.name}`, 10, 12);
      pdf.text(`Class : ${selectedClassObj?.name || ''}`, 10, 14);
      pdf.text(`Period : ${periodDetails.monthName} ${periodDetails.year}`, 10, 16);
      pdf.text(`LEARNING JOURNEY: ${classSummary?.sections?.learningJourney?.title || ''} - ${classSummary?.sections?.learningJourney?.summary || ''}`, 10, 18);
      weeklyLessons.forEach((item, index) => {
        pdf.text(`WEEKLY LESSONS ${index + 1}: ${item.title} - ${item.summary}`, 10, 20 + (index * 2));
      });
      pdf.text(`Griya Cinere I, Jl. Garuda Ujung No. 35, Cinere, Kec Limo, Kota Depok, Jawa barat 16515`, 10, 200);
      pdf.text(`Telp. (021) 753 4841 Email: information@lazuardi.sch.id WhatsApp: +62 813 8925 7784`, 10, 202);
      
      // Page 2
      pdf.addPage();
      pdf.addImage(imgData2, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');

      // Invisible selectable/searchable text overlay for Page 2
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(1);
      pdf.text(`Student's name : ${student.name}`, 10, 10);
      pdf.text(`SELF EXPLORATION & MONTHLY REFLECTIONS`, 10, 12);
      studentApprovedSlots.forEach((slot, index) => {
        pdf.text(`Slot ${slot.slot}: ${slot.strandNameSnapshot} - ${slot.activityNameSnapshot} - ${slot.reflectionText}`, 10, 14 + (index * 2));
      });
      pdf.text(`Attendance: Sick Leave : ${studentAttendanceMap[student.id]?.sickLeave ?? 0}, Excused Leave : ${studentAttendanceMap[student.id]?.excusedLeave ?? 0}, Absent : ${studentAttendanceMap[student.id]?.absent ?? 0}`, 10, 40);
      pdf.text(`GENERAL COMMENTS: ${commentsMap[student.id]?.generalComment || ''}`, 10, 45);
      pdf.text(`Acknowledged by Principal ${reportConfig?.principalName || ""} Homeroom Teacher ${selectedClassObj?.homeroomTeacherName || "Wali Kelas"}`, 10, 60);
      pdf.text(`Griya Cinere I, Jl. Garuda Ujung No. 35, Cinere, Kec Limo, Kota Depok, Jawa barat 16515`, 10, 200);
      pdf.text(`Telp. (021) 753 4841 Email: information@lazuardi.sch.id WhatsApp: +62 813 8925 7784`, 10, 202);

      const pdfBlob = pdf.output('blob');

      // 4. Toast Mengunggah PDF ke Google Drive
      toast.loading("Mengunggah PDF ke Google Drive...", { id: "jh-publish" });
      const filename = normalizeFilename(selectedClassObj?.name || 'Class', student.name, selectedMonth);

      const uploadRes = await uploadJuniorHighMonthlyReportPdf(pdfBlob, filename, token);
      if (!uploadRes.driveFileId) {
        throw new Error('Gagal mengunggah file ke Google Drive (ID kosong).');
      }

      // 5. Toast Menyimpan riwayat PDF
      toast.loading("Menyimpan riwayat PDF...", { id: "jh-publish" });

      // Atomically calculate next version strictly within client transaction logic representation
      const nextVersion = await getNextReportVersion(
        student.id,
        selectedClassId,
        selectedYear,
        selectedSemester,
        selectedMonth
      );

      const attendanceNumberSnapshot = student.attendanceNumber ?? student.noAbsen ?? student.rollNumber ?? student.rosterNumber ?? 0;

      const metadataPayload = {
        unit: "JUNIOR_HIGH" as const,
        reportType: "MONTHLY_REPORT" as const,

        studentId: student.id,
        studentNameSnapshot: student.name,
        classId: selectedClassId,
        classNameSnapshot: selectedClassObj?.name || '',
        gradeSnapshot: student.grade || 7,
        attendanceNumberSnapshot,

        academicYear: selectedYear,
        semester: selectedSemester,
        periodKey: selectedMonth,
        periodLabel: getIndonesianMonthLabel(selectedMonth),

        version: nextVersion,

        driveFolderId: "1mjxXJKaKSCfn0RNpJWQTsI65DwnhiyqK",
        driveFileId: uploadRes.driveFileId,
        driveFileUrl: uploadRes.driveFileUrl,
        fileName: filename,

        generatedBy: currentUser?.uid || '',
        generatedAt: Date.now()
      };

      await savePublishedReportMetadata(metadataPayload);

      // Update local state map instantly to make the "View PDF" action visible
      setPublishedReportsMap(prev => ({
        ...prev,
        [student.id]: {
          ...metadataPayload,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      }));

      // 6. Success message with action
      toast.success(
        <div className="flex flex-col gap-1">
          <span className="font-bold">PDF berhasil dibuat dan disimpan ke Google Drive.</span>
          <a 
            href={uploadRes.driveFileUrl} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline font-semibold"
          >
            Buka File di Drive <ExternalLink size={12} />
          </a>
        </div>,
        { id: "jh-publish", duration: 7000 }
      );

    } catch (err: any) {
      // Structured logging for Firestore Permission Error
      console.error('[DEV DEBUG] PDF GENERATION FAILURE DETECTED', {
        operationName: 'generate_pdf_or_save_metadata',
        collectionPath: 'published_junior_high_monthly_reports',
        operationType: 'create', // setting metadata
        authenticatedUid: currentUser?.uid || 'N/A',
        authenticatedRole: profile?.role || 'N/A',
        selectedClassId: selectedClassId,
        studentId: student.id,
        academicYear: selectedYear,
        semester: selectedSemester,
        periodKey: selectedMonth,
        firebaseErrorCode: err?.code || 'N/A',
        firebaseErrorMessage: err?.message || String(err),
      });

      console.error('[MonthlyReportPdfPage] PDF Generation/Upload Error:', err);
      if (err.message && err.message.startsWith('AUTH_DENIED')) {
        toast.error("Akses Google Drive ditolak. Silakan login kembali dengan memberikan izin akses Google Drive.", { id: "jh-publish", duration: 6000 });
      } else {
        toast.error("PDF tidak dapat dibuat. Silakan coba lagi.", { id: "jh-publish" });
      }
    } finally {
      setGeneratingStudent(null);
    }
  };

  // Pre-calculate weekly and unit activities elements for generatingStudent
  const weeklyLessons = React.useMemo(() => {
    if (!classSummary) return [];
    return (classSummary.sections?.weeklyLessonsAndUnitActivities || [])
      .filter(item => item.category === 'WEEKLY_LESSON')
      .sort((a, b) => a.order - b.order);
  }, [classSummary]);

  const isUaActive = React.useMemo(() => {
    if (!selectedYear || !selectedSemester || !selectedMonth) return false;
    const currentFirstYear = parseInt(selectedYear.split('/')[0]) || 0;
    const activationFirstYear = 2026;

    if (currentFirstYear > activationFirstYear) {
      return true;
    }
    if (currentFirstYear < activationFirstYear) {
      return false;
    }

    if (selectedSemester === '2') {
      return true;
    }
    if (selectedSemester === '1') {
      if (selectedMonth >= '2026-08') {
        return true;
      }
    }
    return false;
  }, [selectedYear, selectedSemester, selectedMonth]);

  const unitActivities = React.useMemo(() => {
    if (isUaActive) {
      if (!generatingStudent) return [];
      const studentEnrollments = unitActivityEnrollments.filter(
        e => e.studentId === generatingStudent.id && e.status === 'CONFIRMED'
      );
      return studentEnrollments.map((e, index) => {
        const desc = semesterSummariesMap[e.normalizedUaName] || '';
        return {
          id: `ua_dyn_${e.normalizedUaName}_${index}`,
          category: 'UNIT_ACTIVITY',
          title: e.normalizedUaName,
          summary: desc.trim() || '[PERINGATAN STAF: Deskripsi narasi bulanan belum diisi di menu Unit Aktivitas. Orang tua tidak akan melihat bagian kosong ini.]'
        };
      }).sort((a, b) => a.title.localeCompare(b.title));
    }

    if (!classSummary) return [];
    return (classSummary.sections?.weeklyLessonsAndUnitActivities || [])
      .filter(item => item.category === 'UNIT_ACTIVITY')
      .sort((a, b) => a.order - b.order);
  }, [isUaActive, generatingStudent, unitActivityEnrollments, semesterSummariesMap, classSummary]);

  // Pre-calculate approved self exploration reflection content for generatingStudent
  const approvedSelfExplorationSlots = React.useMemo(() => {
    if (!generatingStudent) return [];
    const reflectionDoc = reflectionMap[generatingStudent.id];
    if (reflectionDoc?.overallStatus !== 'APPROVED') return [];
    return (reflectionDoc.slots || [])
      .filter((slot: any) => slot.status === 'APPROVED' && slot.reflectionText?.trim())
      .sort((a: any, b: any) => a.slot - b.slot);
  }, [generatingStudent, reflectionMap]);

  const periodDetails = getEnglishPeriodDetails(selectedMonth);

  return (
    <div className="min-h-screen bg-slate-50/50 p-6">
      {/* Hidden Render Template Zone */}
      {generatingStudent && (
        <div id="hidden-pdf-render-root" style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '794px' }}>
          {/* Page 1 */}
          <div 
            id="jh-pdf-page-1"
            style={{
              width: '794px',
              height: '1123px',
              padding: '24px',
              boxSizing: 'border-box',
              backgroundColor: '#ffffff',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              fontFamily: 'system-ui, sans-serif'
            }}
          >
            {/* Page Frame */}
            <div 
              style={{
                flex: 1,
                border: '3px solid #129A95',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxSizing: 'border-box',
                position: 'relative'
              }}
            >
              {/* Header Container */}
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    {logos?.JUNIOR_HIGH?.rectangular ? (
                      <img 
                        src={logos.JUNIOR_HIGH.rectangular} 
                        alt="Lazuardi Junior High Logo" 
                        style={{ height: '60px', width: 'auto', objectFit: 'contain' }}
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="text-sm font-bold text-[#129A95] uppercase">
                        Lazuardi Junior High
                      </div>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-800 space-y-0.5 text-right font-medium">
                    <div>Student's name : <span className="font-bold">{generatingStudent.name}</span></div>
                    <div>Class : <span className="font-bold">{selectedClassObj?.name}</span></div>
                    <div>Period : <span className="font-bold">{periodDetails.monthName} {periodDetails.year}</span></div>
                  </div>
                </div>

                {/* Main Title */}
                <div className="text-center my-4">
                  <h1 className="text-sm font-black tracking-wider text-[#002366]">
                    STUDENT'S MONTHLY PROGRESS REPORT
                  </h1>
                </div>

                {/* Blue Header Band */}
                <div style={{ height: '5px', backgroundColor: '#002366', width: '100%' }} className="mb-6" />

                {/* Table 1: Learning Journey & Summary */}
                <div className="mb-6">
                  <table className="w-full text-left border-collapse" style={{ tableLayout: 'fixed' }}>
                    <thead>
                      <tr className="bg-[#002366] text-white text-[10px] font-bold uppercase tracking-wider">
                        <th className="border border-slate-300 p-2.5 w-[35%]">LEARNING JOURNEY</th>
                        <th className="border border-slate-300 p-2.5 w-[65%]">SUMMARY</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="bg-white text-[10.5px]">
                        <td className="border border-slate-200 p-3 font-bold align-top text-slate-800">
                          {classSummary?.sections?.learningJourney?.title || 'Learning Journey'}
                        </td>
                        <td className="border border-slate-200 p-3 text-slate-600 align-top leading-normal whitespace-pre-wrap">
                          {classSummary?.sections?.learningJourney?.summary || 'No summary available.'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Table 2: Weekly Lessons & Summary */}
                <div className="overflow-hidden">
                  <table className="w-full text-left border-collapse" style={{ tableLayout: 'fixed' }}>
                    <thead>
                      <tr className="bg-[#002366] text-white text-[10px] font-bold uppercase tracking-wider">
                        <th className="border border-slate-300 p-2.5 w-[35%]">WEEKLY LESSONS</th>
                        <th className="border border-slate-300 p-2.5 w-[65%]">SUMMARY</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weeklyLessons.map((item, idx) => (
                        <tr key={idx} className="bg-white text-[10px]">
                          <td className="border border-slate-200 p-2.5 font-bold align-top text-slate-800">
                            {item.title}
                          </td>
                          <td className="border border-slate-200 p-2.5 text-slate-600 align-top leading-normal whitespace-pre-wrap">
                            {item.summary}
                          </td>
                        </tr>
                      ))}
                      {weeklyLessons.length === 0 && (
                        <tr className="bg-white text-[10px]">
                          <td colSpan={2} className="border border-slate-200 p-4 text-center text-slate-400 italic">
                            No weekly lessons recorded for this period.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Green Footer Strip */}
              <div 
                style={{
                  backgroundColor: '#002366',
                  margin: 'auto -24px -24px -24px',
                  height: '28px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxSizing: 'border-box',
                  gap: '1px'
                }}
              >
                <div style={{ fontSize: '7px', color: '#ffffff', fontWeight: 600, textTransform: 'none', lineHeight: 1.1, textAlign: 'center' }}>
                  Griya Cinere I, Jl. Garuda Ujung No. 35, Cinere, Kec Limo, Kota Depok, Jawa barat 16515
                </div>
                <div style={{ fontSize: '7px', color: '#ffffff', fontWeight: 600, textTransform: 'none', lineHeight: 1.1, textAlign: 'center' }}>
                  Telp. (021) 753 4841 Email: information@lazuardi.sch.id WhatsApp: +62 813 8925 7784
                </div>
              </div>
            </div>
          </div>

          {/* Page 2 */}
          <div 
            id="jh-pdf-page-2"
            style={{
              width: '794px',
              height: '1123px',
              padding: '24px',
              boxSizing: 'border-box',
              backgroundColor: '#ffffff',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              fontFamily: 'system-ui, sans-serif'
            }}
          >
            {/* Page Frame */}
            <div 
              style={{
                flex: 1,
                border: '3px solid #129A95',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxSizing: 'border-box',
                position: 'relative'
              }}
            >
              {/* Header & Content Container */}
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    {logos?.JUNIOR_HIGH?.rectangular ? (
                      <img 
                        src={logos.JUNIOR_HIGH.rectangular} 
                        alt="Lazuardi Junior High Logo" 
                        style={{ height: '60px', width: 'auto', objectFit: 'contain' }}
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="text-sm font-bold text-[#129A95] uppercase">
                        Lazuardi Junior High
                      </div>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-800 space-y-0.5 text-right font-medium">
                    <div>Student's name : <span className="font-bold">{generatingStudent.name}</span></div>
                    <div>Class : <span className="font-bold">{selectedClassObj?.name}</span></div>
                    <div>Period : <span className="font-bold">{periodDetails.monthName} {periodDetails.year}</span></div>
                  </div>
                </div>

                {/* Main Title (Optional but keeps consistent header size) */}
                <div className="text-center my-4">
                  <h1 className="text-sm font-black tracking-wider text-[#002366]">
                    STUDENT'S MONTHLY PROGRESS REPORT
                  </h1>
                </div>

                {/* Blue Header Band */}
                <div style={{ height: '5px', backgroundColor: '#002366', width: '100%' }} className="mb-6" />

                {/* Table 1: Self Exploration & Reflections */}
                <div className="mb-6">
                  <table className="w-full text-left border-collapse" style={{ tableLayout: 'fixed' }}>
                    <thead>
                      <tr className="bg-[#002366] text-white text-[10px] font-bold uppercase tracking-wider">
                        <th className="border border-slate-300 p-2.5 w-[35%]">SELF EXPLORATION</th>
                        <th className="border border-slate-300 p-2.5 w-[65%]">MONTHLY REFLECTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {approvedSelfExplorationSlots.map((slot: any) => (
                        <tr key={slot.slot} className="bg-white text-[10px]">
                          <td className="border border-slate-200 p-2.5 align-top text-slate-800">
                            <div className="font-bold text-[#002366] mb-0.5">Slot {slot.slot}</div>
                            <div className="font-semibold text-slate-700">{slot.strandNameSnapshot}</div>
                            <div className="text-[9px] text-slate-500 mt-0.5">{slot.activityNameSnapshot}</div>
                          </td>
                          <td className="border border-slate-200 p-2.5 text-slate-600 align-top leading-normal whitespace-pre-wrap">
                            {slot.reflectionText}
                          </td>
                        </tr>
                      ))}
                      {approvedSelfExplorationSlots.length === 0 && (
                        <tr className="bg-white text-[10px]">
                          <td colSpan={2} className="border border-slate-200 p-4 text-center text-slate-400 italic">
                            No self-exploration reflections approved for this period.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Table 2: Attendance & General Comments */}
                <div className="mb-6">
                  <table className="w-full text-left border-collapse" style={{ tableLayout: 'fixed' }}>
                    <thead>
                      <tr className="bg-[#002366] text-white text-[10px] font-bold uppercase tracking-wider">
                        <th className="border border-slate-300 p-2.5 w-[35%]">Attendance</th>
                        <th className="border border-slate-300 p-2.5 w-[65%]">GENERAL COMMENTS</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="bg-white text-[10px]">
                        <td className="border border-slate-200 p-3 align-top text-slate-800 font-semibold space-y-1">
                          <div>Sick Leave : <span className="font-bold text-slate-950">{Number(studentAttendanceMap[generatingStudent.id]?.sickLeave ?? 0)}</span></div>
                          <div>Excused Leave : <span className="font-bold text-slate-950">{Number(studentAttendanceMap[generatingStudent.id]?.excusedLeave ?? 0)}</span></div>
                          <div>Absent : <span className="font-bold text-slate-950">{Number(studentAttendanceMap[generatingStudent.id]?.absent ?? 0)}</span></div>
                        </td>
                        <td className="border border-slate-200 p-3 text-slate-700 align-top leading-normal whitespace-pre-wrap text-[10px]">
                          {commentsMap[generatingStudent.id]?.generalComment || 'No general comments recorded.'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Signature Area */}
                <div className="pt-2">
                  <div className="text-[10px] font-medium text-slate-800 mb-1">
                    Depok, {periodDetails.day} {periodDetails.monthName} {periodDetails.year}
                  </div>
                  <div className="text-[10px] font-semibold text-slate-800 mb-2">
                    Acknowledged by,
                  </div>
                  
                  <div className="grid grid-cols-2 gap-12 mt-2">
                    {/* Left Column: Principal */}
                    <div className="flex flex-col justify-between" style={{ minHeight: '80px' }}>
                      <div className="text-[10px] font-bold text-slate-800">Principal</div>
                      <div style={{ height: '30px' }} className="flex items-center">
                        {reportConfig?.principalSignatureUrl ? (
                          <img 
                            src={reportConfig.principalSignatureUrl} 
                            alt="Principal Signature" 
                            style={{ height: '30px', width: 'auto', objectFit: 'contain' }}
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div style={{ height: '30px' }} />
                        )}
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-slate-900 underline leading-tight">
                          {reportConfig?.principalName || ""}
                        </div>
                        <div className="text-[8.5px] text-slate-500 leading-tight">
                          NIY: {reportConfig?.principalNIY || ""}
                        </div>
                      </div>
                    </div>

                    {/* Right Column: Homeroom Teacher */}
                    <div className="flex flex-col justify-between" style={{ minHeight: '80px' }}>
                      <div className="text-[10px] font-bold text-slate-800">Homeroom Teacher</div>
                      <div style={{ height: '30px' }} className="flex items-center">
                        {homeroomTeacherProfile?.signatureUrl ? (
                          <img 
                            src={homeroomTeacherProfile.signatureUrl} 
                            alt="Homeroom Teacher Signature" 
                            style={{ height: '30px', width: 'auto', objectFit: 'contain' }}
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div style={{ height: '30px' }} />
                        )}
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-slate-900 underline leading-tight">
                          {selectedClassObj?.homeroomTeacherName || homeroomTeacherProfile?.displayName || "Wali Kelas"}
                        </div>
                        <div className="text-[8.5px] text-slate-500 leading-tight">
                          NIY: {homeroomTeacherProfile?.niy || "-"}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Green Footer Strip */}
              <div 
                style={{
                  backgroundColor: '#002366',
                  margin: 'auto -24px -24px -24px',
                  height: '28px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxSizing: 'border-box',
                  gap: '1px'
                }}
              >
                <div style={{ fontSize: '7px', color: '#ffffff', fontWeight: 600, textTransform: 'none', lineHeight: 1.1, textAlign: 'center' }}>
                  Griya Cinere I, Jl. Garuda Ujung No. 35, Cinere, Kec Limo, Kota Depok, Jawa barat 16515
                </div>
                <div style={{ fontSize: '7px', color: '#ffffff', fontWeight: 600, textTransform: 'none', lineHeight: 1.1, textAlign: 'center' }}>
                  Telp. (021) 753 4841 Email: information@lazuardi.sch.id WhatsApp: +62 813 8925 7784
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main UI Header */}
      <div className="mx-auto max-w-6xl mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#002366]/10 text-[#002366] border border-[#002366]/20">
                JUNIOR HIGH ONLY
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <FileText className="text-[#002366]" size={26} />
              Monthly Report PDF
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Generate individual Monthly Report PDFs for students.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-center">
            <button
              onClick={loadReportData}
              disabled={loadingStudents || loadingSummary || loadingComments}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50 shadow-sm cursor-pointer"
            >
              <RefreshCw size={15} className={(loadingStudents || loadingSummary || loadingComments) ? 'animate-spin' : ''} />
              Muat Ulang
            </button>
          </div>
        </div>
      </div>

      {/* Context Filters */}
      <div className="mx-auto max-w-6xl bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
              <Calendar size={13} className="text-[#002366]" /> Tahun Ajaran
            </label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full text-sm rounded-lg border-slate-200 focus:border-[#002366] focus:ring-[#002366] py-2 bg-slate-50/50 font-medium"
            >
              <option value="2025/2026">2025/2026</option>
              <option value="2026/2027">2026/2027</option>
              <option value="2027/2028">2027/2028</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Semester
            </label>
            <div className="grid grid-cols-2 gap-2">
              {['1', '2'].map((sem) => (
                <button
                  key={sem}
                  onClick={() => setSelectedSemester(sem)}
                  className={`py-2 text-sm font-semibold rounded-lg border transition-all cursor-pointer ${
                    selectedSemester === sem
                      ? 'bg-[#002366] text-white border-[#002366] shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Sem {sem}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
              <Calendar size={13} className="text-[#002366]" /> Periode Bulan
            </label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full text-sm rounded-lg border-slate-200 focus:border-[#002366] focus:ring-[#002366] py-1.5 bg-slate-50/50 font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
              <Users size={13} className="text-[#002366]" /> Kelas Junior High
            </label>
            {loadingClasses ? (
              <div className="h-10 flex items-center px-3 bg-slate-50 rounded-lg text-xs text-slate-400">
                <RefreshCw size={14} className="animate-spin mr-2" />
                Memuat kelas...
              </div>
            ) : (
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="w-full text-sm rounded-lg border-slate-200 focus:border-[#002366] focus:ring-[#002366] py-2 bg-slate-50/50 font-medium"
              >
                <option value="" disabled>
                  {classesList.length === 0 
                    ? "Tidak ada kelas aktif" 
                    : "-- Pilih Kelas --"}
                </option>
                {classesList.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {!loadingClasses && classesList.length === 0 && (
          <div className="mt-4 p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0" />
            <span>Tidak ada kelas aktif dengan siswa terdaftar pada konteks ini.</span>
          </div>
        )}
      </div>

      {/* Principal Configuration Missing Warning Banner */}
      {isPrincipalConfigMissing && (
        <div className="mx-auto max-w-6xl bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex gap-3">
          <AlertCircle className="text-red-600 shrink-0 mt-0.5" size={18} />
          <div>
            <strong className="text-red-800 text-sm font-bold block mb-0.5">Konfigurasi Principal Error</strong>
            <p className="text-red-700 text-xs leading-relaxed">
              Konfigurasi Principal Monthly Report SMP belum tersedia.
            </p>
          </div>
        </div>
      )}

      {/* Global Readiness Warning Banner */}
      {!loadingStudents && !loadingSummary && !loadingComments && students.length > 0 && !isGlobalReady && (
        <div className="mx-auto max-w-6xl bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex gap-3">
          <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={18} />
          <div>
            <strong className="text-amber-800 text-sm font-bold block mb-0.5">Rapor Belum Siap Sepenuhnya</strong>
            <p className="text-amber-700 text-xs leading-relaxed">
              Lengkapi seluruh validasi report sebelum membuat PDF. Pastikan ringkasan kelas berstatus READY, seluruh siswa memiliki komentar umum FINAL, dan presensi terekam.
            </p>
          </div>
        </div>
      )}

      {/* Student Roster Area */}
      <div className="mx-auto max-w-6xl bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="border-b border-slate-150 bg-slate-50/50 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-[#002366]" />
            <h3 className="text-sm font-bold text-slate-800">Daftar Roster Siswa & Riwayat PDF</h3>
          </div>
          <span className="text-[11px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full">
            Total {students.length} Siswa
          </span>
        </div>

        {loadingStudents || loadingSummary || loadingComments || loadingSelfExploration || loadingPublished ? (
          <div className="py-16 text-center">
            <Loader2 size={32} className="animate-spin text-slate-400 mx-auto mb-3" />
            <span className="text-xs text-slate-500 font-medium">Memuat data report dan roster siswa...</span>
          </div>
        ) : students.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs">
            Tidak ada siswa ditemukan atau pilih parameter filter terlebih dahulu.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/30 border-b border-slate-150 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="pl-6 py-3.5 w-16">No.</th>
                  <th className="py-3.5 pl-4">Nama Siswa</th>
                  <th className="py-3.5 w-24 text-center">Grade</th>
                  <th className="py-3.5 w-40 text-center">Validasi Report</th>
                  <th className="py-3.5 w-44 text-center">Self-Exploration</th>
                  <th className="py-3.5 w-36 text-center">Riwayat PDF</th>
                  <th className="pr-6 py-3.5 w-40 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {students.map((student) => {
                  const hasComment = commentsMap[student.id]?.status === 'FINAL';
                  const hasAttendance = attendanceAvailableForPeriod && studentAttendanceMap[student.id];
                  const studentReadiness = hasComment && hasAttendance && classSummary?.status === 'READY';

                  // Determine Self Exploration Badge
                  let seBadgeLabel = 'Unavailable';
                  let seBadgeStyle = 'bg-slate-50 text-slate-500 border-slate-250';
                  
                  if (!resolvedCycle) {
                    seBadgeLabel = 'Unavailable';
                    seBadgeStyle = 'bg-slate-100 text-slate-500 border-slate-200';
                  } else {
                    const rObj = reflectionMap[student.id];
                    if (!rObj) {
                      seBadgeLabel = 'Not Started';
                      seBadgeStyle = 'bg-slate-100 text-slate-600 border-slate-200';
                    } else if (rObj.overallStatus === 'APPROVED') {
                      seBadgeLabel = 'Approved';
                      seBadgeStyle = 'bg-emerald-50 text-emerald-700 border-emerald-100';
                    } else {
                      seBadgeLabel = 'Not Approved';
                      seBadgeStyle = 'bg-amber-50 text-amber-700 border-amber-100';
                    }
                  }

                  // Determine previous generated PDF version
                  const prevRecord = publishedReportsMap[student.id];

                  return (
                    <tr key={student.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="pl-6 py-4 font-bold text-slate-400">
                        {student.attendanceNumber ?? student.noAbsen ?? student.rollNumber ?? student.rosterNumber ?? '-'}
                      </td>
                      <td className="py-4 pl-4">
                        <strong className="text-slate-800 text-xs font-semibold block">{student.name}</strong>
                        <span className="text-[10px] text-slate-400 mt-0.5 block font-mono">ID: {student.id}</span>
                      </td>
                      <td className="py-4 text-center font-bold text-slate-600">
                        {student.grade || 7}
                      </td>
                      <td className="py-4 text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                          studentReadiness
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                            : 'bg-amber-50 text-amber-700 border-amber-150'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${studentReadiness ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                          {studentReadiness ? 'Ready' : 'Needs Attention'}
                        </span>
                      </td>
                      <td className="py-4 text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${seBadgeStyle}`}>
                          {seBadgeLabel}
                        </span>
                      </td>
                      <td className="py-4 text-center">
                        {prevRecord ? (
                          <div className="inline-flex flex-col items-center">
                            <a 
                              href={prevRecord.driveFileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-650 hover:underline"
                            >
                              View PDF <ExternalLink size={10} />
                            </a>
                            <span className="text-[9px] font-bold text-slate-400 mt-0.5 bg-slate-100 px-1.5 py-0.2 rounded-full">
                              Versi {prevRecord.version}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-medium italic">Belum dibuat</span>
                        )}
                      </td>
                      <td className="pr-6 py-4 text-right">
                        <button
                          onClick={() => handleGeneratePdf(student)}
                          disabled={!isGlobalReady || !studentReadiness || !!generatingStudent || isPrincipalConfigMissing || !reportConfig}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-all cursor-pointer ${
                            isGlobalReady && studentReadiness && !generatingStudent && !isPrincipalConfigMissing && reportConfig
                              ? 'bg-[#002366] text-white hover:bg-[#002366]/90'
                              : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed shadow-none'
                          }`}
                        >
                          {generatingStudent?.id === student.id ? (
                            <>
                              <Loader2 size={13} className="animate-spin" />
                              Membuat...
                            </>
                          ) : (
                            <>
                              Generate PDF
                              <ArrowRight size={13} />
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
