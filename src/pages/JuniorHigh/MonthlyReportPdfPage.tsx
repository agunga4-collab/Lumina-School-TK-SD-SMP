import * as React from 'react';
import { motion } from 'motion/react';
import { 
  FileText, Calendar, Users, RefreshCw, AlertCircle, Info, CheckCircle2, 
  ArrowRight, ExternalLink, Loader2
} from 'lucide-react';
import { db, getClasses, getActiveStudents } from '../../lib/firebase';
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

export default function MonthlyReportPdfPage() {
  const { profile, currentUser } = useAuth();
  const { activeYear, activeSemester } = useAcademicYear();

  // Context Filter states
  const [selectedYear, setSelectedYear] = React.useState<string>('2026/2027');
  const [selectedSemester, setSelectedSemester] = React.useState<string>('1');
  const [selectedMonth, setSelectedMonth] = React.useState<string>('');
  const [selectedClassId, setSelectedClassId] = React.useState<string>('');

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
      if (!selectedYear || !selectedSemester) return;
      setLoadingUaData(true);
      try {
        const [enrollSnap, summariesSnap] = await Promise.all([
          getDocs(query(
            collection(db, 'junior_high_unit_activity'),
            where('academicYear', '==', selectedYear),
            where('semester', '==', parseInt(selectedSemester) || 1),
            where('status', '==', 'CONFIRMED')
          )),
          getDocs(query(
            collection(db, 'junior_high_unit_activity_semester_summaries'),
            where('academicYear', '==', selectedYear),
            where('semester', '==', selectedSemester)
          ))
        ]);

        const enrollmentsList = enrollSnap.docs.map(docSnap => docSnap.data());
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
  }, [selectedYear, selectedSemester]);

  // Find selected class object
  const selectedClassObj = React.useMemo(() => {
    return classesList.find(c => c.id === selectedClassId);
  }, [classesList, selectedClassId]);

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

      // Page 1
      pdf.addImage(imgData1, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
      
      // Page 2
      pdf.addPage();
      pdf.addImage(imgData2, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');

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
          summary: desc
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
              padding: '40px',
              boxSizing: 'border-box',
              backgroundColor: '#ffffff',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              fontFamily: 'system-ui, sans-serif'
            }}
          >
            {/* School / Document Header */}
            <div className="flex justify-between items-end border-b-2 border-[#002366] pb-3 mb-6">
              <div>
                <h1 className="text-xl font-black tracking-tight text-[#002366] leading-none mb-1">LUMINA ACADEMY</h1>
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold leading-none">Junior High School Division</p>
              </div>
              <div className="text-right">
                <h2 className="text-lg font-extrabold tracking-tight text-slate-800 leading-none mb-1">Monthly Report</h2>
                <p className="text-[10px] font-bold text-slate-500 leading-none">Academic Year {selectedYear}</p>
              </div>
            </div>

            {/* Student Identity Metadata */}
            <div className="grid grid-cols-2 gap-4 bg-slate-50 border border-slate-200/60 rounded-lg p-3.5 mb-6 text-[11px]">
              <div className="space-y-1.5">
                <div className="flex"><span className="w-24 font-bold text-slate-500">Student Name:</span><span className="font-semibold text-slate-800">{generatingStudent.name}</span></div>
                <div className="flex"><span className="w-24 font-bold text-slate-500">Class / Grade:</span><span className="font-semibold text-slate-800">{selectedClassObj?.name} / Grade {generatingStudent.grade}</span></div>
                {generatingStudent.attendanceNumber !== undefined && (
                  <div className="flex"><span className="w-24 font-bold text-slate-500">No. Absen:</span><span className="font-semibold text-slate-800">{generatingStudent.attendanceNumber}</span></div>
                )}
              </div>
              <div className="space-y-1.5">
                <div className="flex"><span className="w-24 font-bold text-slate-500">Academic Year:</span><span className="font-semibold text-slate-800">{selectedYear}</span></div>
                <div className="flex"><span className="w-24 font-bold text-slate-500">Semester:</span><span className="font-semibold text-slate-800">Semester {selectedSemester}</span></div>
                <div className="flex"><span className="w-24 font-bold text-slate-500">Period:</span><span className="font-semibold text-slate-800">{getIndonesianMonthLabel(selectedMonth)}</span></div>
              </div>
            </div>

            {/* Section 3: Learning Journey */}
            <div className="mb-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#002366] border-b border-[#002366]/20 pb-1 mb-2">Learning Journey</h3>
              <div className="bg-[#002366]/5 border border-[#002366]/10 rounded-lg p-3">
                <h4 className="text-[11px] font-bold text-slate-800 mb-1">{classSummary?.sections?.learningJourney?.title || 'No Title'}</h4>
                <p className="text-[10.5px] text-slate-600 leading-normal whitespace-pre-wrap">{classSummary?.sections?.learningJourney?.summary || 'No Summary'}</p>
              </div>
            </div>

            {/* Section 4: Weekly Lessons */}
            <div className="mb-5 flex-1 overflow-hidden">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#002366] border-b border-[#002366]/20 pb-1 mb-2">Weekly Lessons</h3>
              <div className="space-y-2">
                {weeklyLessons.map((item, idx) => (
                  <div key={idx} className="bg-slate-50/50 border border-slate-150 rounded-lg p-2.5 text-[10.5px]">
                    <h4 className="font-bold text-slate-800 mb-0.5">{item.title}</h4>
                    <p className="text-slate-600 leading-normal whitespace-pre-wrap">{item.summary}</p>
                  </div>
                ))}
                {weeklyLessons.length === 0 && (
                  <p className="text-[10.5px] text-slate-400 italic">No weekly lessons recorded for this period.</p>
                )}
              </div>
            </div>

            {/* Footer at absolute bottom of page 1 */}
            <div className="absolute bottom-5 left-10 right-10 flex justify-between items-center text-[9px] text-slate-400 border-t border-slate-100 pt-2">
              <span>Page 1 of 2</span>
              <span>Generated from Lumina on {new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}.</span>
            </div>
          </div>

          {/* Page 2 */}
          <div 
            id="jh-pdf-page-2"
            style={{
              width: '794px',
              height: '1123px',
              padding: '40px',
              boxSizing: 'border-box',
              backgroundColor: '#ffffff',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              fontFamily: 'system-ui, sans-serif'
            }}
          >
            {/* Header Mini */}
            <div className="flex justify-between items-end border-b border-[#002366]/20 pb-1.5 mb-5">
              <span className="text-[10px] font-bold text-[#002366]">Lumina Academy — Monthly Report</span>
              <span className="text-[9px] text-slate-400">{generatingStudent.name} ({selectedClassObj?.name})</span>
            </div>

            {/* Section 5: Unit Activities */}
            <div className="mb-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#002366] border-b border-[#002366]/20 pb-1 mb-2">Unit Activities</h3>
              <div className="space-y-2">
                {unitActivities.map((item, idx) => (
                  <div key={idx} className="bg-slate-50/50 border border-slate-150 rounded-lg p-2.5 text-[10.5px]">
                    <h4 className="font-bold text-slate-800 mb-0.5">{item.title}</h4>
                    <p className="text-slate-600 leading-normal whitespace-pre-wrap">{item.summary}</p>
                  </div>
                ))}
                {unitActivities.length === 0 && (
                  <p className="text-[10.5px] text-slate-400 italic">No unit activities recorded for this period.</p>
                )}
              </div>
            </div>

            {/* Section 6: Attendance */}
            <div className="mb-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#002366] border-b border-[#002366]/20 pb-1 mb-2">Attendance</h3>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="bg-slate-50 border border-slate-150 rounded-lg py-2">
                  <span className="block text-[9px] font-bold text-slate-400 uppercase">Sick Leave</span>
                  <strong className="text-[14px] font-extrabold text-slate-800">
                    {Number(studentAttendanceMap[generatingStudent.id]?.sickLeave ?? 0)}
                  </strong>
                </div>
                <div className="bg-slate-50 border border-slate-150 rounded-lg py-2">
                  <span className="block text-[9px] font-bold text-slate-400 uppercase">Excused Leave</span>
                  <strong className="text-[14px] font-extrabold text-slate-800">
                    {Number(studentAttendanceMap[generatingStudent.id]?.excusedLeave ?? 0)}
                  </strong>
                </div>
                <div className="bg-slate-50 border border-slate-150 rounded-lg py-2">
                  <span className="block text-[9px] font-bold text-slate-400 uppercase">Absent</span>
                  <strong className="text-[14px] font-extrabold text-slate-800">
                    {Number(studentAttendanceMap[generatingStudent.id]?.absent ?? 0)}
                  </strong>
                </div>
              </div>
            </div>

            {/* Section 7: Self-Exploration Reflection */}
            {approvedSelfExplorationSlots.length > 0 && (
              <div className="mb-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#002366] border-b border-[#002366]/20 pb-1 mb-2">Self-Exploration Reflection</h3>
                <div className="space-y-2">
                  {approvedSelfExplorationSlots.map((slot: any) => (
                    <div key={slot.slot} className="bg-slate-50/50 border border-slate-150 rounded-lg p-2.5 text-[10px]">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="px-1 py-0.2 bg-blue-100 text-blue-800 text-[8px] font-extrabold rounded">Slot {slot.slot}</span>
                        <span className="font-bold text-slate-800">{slot.strandNameSnapshot} — {slot.activityNameSnapshot}</span>
                      </div>
                      <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">{slot.reflectionText}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Section 8: General Comments */}
            <div className="mb-5 flex-1 overflow-hidden">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#002366] border-b border-[#002366]/20 pb-1 mb-2">General Comments</h3>
              <div className="bg-slate-50 border border-slate-150 rounded-lg p-3 text-[10.5px] leading-normal text-slate-700 whitespace-pre-wrap">
                {commentsMap[generatingStudent.id]?.generalComment}
              </div>
            </div>

            {/* Footer at absolute bottom of page 2 */}
            <div className="absolute bottom-5 left-10 right-10 flex justify-between items-center text-[9px] text-slate-400 border-t border-slate-100 pt-2">
              <span>Page 2 of 2</span>
              <span>Generated from Lumina on {new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}.</span>
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
                          disabled={!isGlobalReady || !studentReadiness || !!generatingStudent}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-all cursor-pointer ${
                            isGlobalReady && studentReadiness && !generatingStudent
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
