import * as React from 'react';
import { 
  FileCheck2, Eye, Download, Send, CheckCircle2, 
  AlertCircle, RefreshCw, User, Sparkles, X, Printer,
  Check, Clock, FileText, AlertTriangle, BookOpen,
  ChevronDown, ChevronUp, Info, HelpCircle, ExternalLink
} from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { ElementaryMidtermPdfTemplate } from './ElementaryMidtermPdfTemplate';
import { 
  publishElementaryMidtermReport,
  fetchElementaryStudentUnitActivityEnrollment
} from '../../../services/elementaryMidtermService';
import { 
  ElementaryMidtermMasterGoalDoc, 
  ElementaryMidtermStudentDataDoc,
  PublishedElementaryMidtermReport,
  ElementaryMidtermReportSnapshot,
  getActiveMasterGoals,
  ELEMENTARY_OFFICIAL_SUBJECTS,
  normalizeElementarySubjectName,
  normalizePerformingArtsUa,
  isPerformingArtsUaMatch,
  extractPerformingArtsUaFromKey
} from '../../../types/elementaryMidtermReport';
import type { Student, Class, ReportConfig, User as UserType } from '../../../types';
import { toast } from 'sonner';
import { useAuth } from '../../../context/AuthContext';
import {
  normalizeElementaryMidtermFilename,
  generateElementaryMidtermPdfBlob,
  ensureElementaryDriveFolders,
  uploadElementaryMidtermPdfToDrive
} from '../../../lib/elementaryMidtermReportPdf';

interface ElementaryMidtermPublishPdfTabProps {
  selectedClassId: string;
  selectedClass: Class | null;
  selectedYear: string;
  selectedSemester: string;
  selectedTerm: string;
  students: Student[];
  masterGoalsMap: Record<string, ElementaryMidtermMasterGoalDoc>;
  studentDataMap: Record<string, ElementaryMidtermStudentDataDoc>;
  publishedReports: PublishedElementaryMidtermReport[];
  reportConfig: ReportConfig | null;
  logoUrl?: string | null;
  homeroomTeacherProfile: { displayName: string; niy?: string; signatureUrl?: string | null } | null;
  onRefreshData: () => Promise<void>;
  currentUser: UserType | null;
  signingDateRaw: string;
  cutoffDateRaw: string;
  reportSigningDate: string;
  attendanceCutoffDate: string;
  showAttendanceRecap?: boolean;
  onSwitchTab?: (tab: 'GOALS' | 'COMMENTS' | 'REVIEW' | 'PUBLISH' | 'REKAP') => void;
}

export const ElementaryMidtermPublishPdfTab: React.FC<ElementaryMidtermPublishPdfTabProps> = ({
  selectedClassId,
  selectedClass,
  selectedYear,
  selectedSemester,
  selectedTerm,
  students,
  masterGoalsMap,
  studentDataMap,
  publishedReports,
  reportConfig,
  logoUrl,
  homeroomTeacherProfile,
  onRefreshData,
  currentUser,
  signingDateRaw,
  cutoffDateRaw,
  reportSigningDate,
  attendanceCutoffDate,
  showAttendanceRecap,
  onSwitchTab
}) => {
  const { getGoogleDriveToken } = useAuth();

  // Modal Preview state
  const [previewStudent, setPreviewStudent] = React.useState<Student | null>(null);

  // Modal Detail Learning Goals State (View-Only)
  const [detailStudent, setDetailStudent] = React.useState<Student | null>(null);
  const [showDebug, setShowDebug] = React.useState<boolean>(false);

  // Publishing State
  const [publishingStudentId, setPublishingStudentId] = React.useState<string | null>(null);
  const [publishStatusText, setPublishStatusText] = React.useState<string>('');
  const [publishMessage, setPublishMessage] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Student currently being generated into hidden PDF DOM
  const [generatingStudent, setGeneratingStudent] = React.useState<Student | null>(null);

  // Student Unit Activity Map: studentId -> UA Name (e.g. "Choir")
  const [studentUaMap, setStudentUaMap] = React.useState<Record<string, string>>({});

  // Attendance Records for cutoff recalculation
  const [attendanceRecords, setAttendanceRecords] = React.useState<any[]>([]);

  // Fetch attendance records on load
  React.useEffect(() => {
    if (!selectedClassId || !selectedYear) return;
    const fetchAttendanceRecords = async () => {
      try {
        const qSnap = await getDocs(query(
          collection(db, 'attendance_records'),
          where('classId', '==', selectedClassId),
          where('academicYear', '==', selectedYear)
        ));
        setAttendanceRecords(qSnap.docs.map(d => d.data()));
      } catch (e) {
        console.error("Error fetching attendance records for cutoff calc:", e);
      }
    };
    fetchAttendanceRecords();
  }, [selectedClassId, selectedYear]);

  // Recalculate attendance up to cutoff date (inclusive)
  const getDynamicAttendanceForStudent = React.useCallback((studentId: string, originalAttendance: { sakit: number | null, izin: number | null, tanpaKeterangan: number | null }) => {
    if (!cutoffDateRaw) {
      return originalAttendance || { sakit: 0, izin: 0, tanpaKeterangan: 0 };
    }

    const matched = attendanceRecords.filter(r => {
      const recStudentId = r.studentId || '';
      const recDate = r.date || '';
      const recSemester = String(r.semester || '');
      
      return (
        recStudentId === studentId &&
        recSemester === String(selectedSemester) &&
        recDate <= cutoffDateRaw
      );
    });

    let sakit = 0;
    let izin = 0;
    let tanpaKeterangan = 0;

    matched.forEach(r => {
      const status = (r.status || '').toUpperCase();
      if (status === 'SAKIT') sakit++;
      else if (status === 'IZIN') izin++;
      else if (status === 'ALPA') tanpaKeterangan++;
    });

    return { sakit, izin, tanpaKeterangan };
  }, [attendanceRecords, cutoffDateRaw, selectedSemester]);

  // Date picker & configuration validations
  const dateConfigError = React.useMemo(() => {
    if (!signingDateRaw || !cutoffDateRaw) {
      return "Lengkapi Tanggal Titimangsa dan Tanggal Cut Off Kehadiran terlebih dahulu.";
    }
    if (new Date(cutoffDateRaw) > new Date(signingDateRaw)) {
      return "Tanggal Cut Off Kehadiran tidak boleh lebih besar dari Tanggal Titimangsa.";
    }
    return null;
  }, [signingDateRaw, cutoffDateRaw]);

  // Fetch UA enrollments for students
  React.useEffect(() => {
    const loadUaEnrollments = async () => {
      if (!students || students.length === 0) return;
      const map: Record<string, string> = {};
      await Promise.all(
        students.map(async (st) => {
          if (!st.id) return;
          try {
            const enr = await fetchElementaryStudentUnitActivityEnrollment(st.id, selectedYear, selectedSemester);
            if (enr) {
              map[st.id] = enr.normalizedUaName || enr.sourceUaName || '';
            }
          } catch (e) {
            console.warn("Could not fetch UA for student:", st.id, e);
          }
        })
      );
      setStudentUaMap(map);
    };
    loadUaEnrollments();
  }, [students, selectedYear, selectedSemester]);

  // Calculate Published Map: studentId -> Latest Published Report
  const publishedMap = React.useMemo(() => {
    const map: Record<string, PublishedElementaryMidtermReport> = {};
    (publishedReports || []).forEach(rep => {
      if (rep && rep.studentId) {
        if (!map[rep.studentId] || (rep.version || 0) > (map[rep.studentId].version || 0)) {
          map[rep.studentId] = rep;
        }
      }
    });
    return map;
  }, [publishedReports]);

  // Calculate Learning Goals Progress for a specific student dynamically
  const calculateStudentGoalsProgress = React.useCallback((student: Student) => {
    if (!student) {
      return {
        totalGoalsCount: 0,
        filledGoalsCount: 0,
        isComplete: true,
        applicableSubjects: [],
        unfilledGoalsList: [],
        systemBreakdown: [],
        debugInfo: {
          activeClassId: selectedClassId,
          activeAcademicYear: selectedYear,
          activeSemester: selectedSemester,
          activePeriod: selectedTerm === '2' ? 'Midterm 2' : 'Midterm 1',
          studentId: '',
          studentName: '',
          studentUa: '',
          totalGoalIdsCount: 0,
          allCountedGoalIds: [],
          filledGoalIds: [],
          unfilledGoalIds: [],
          logs: []
        }
      };
    }

    const stData = studentDataMap[student.id];
    const studentUa = (stData?.performingArtsUA || studentUaMap[student.id] || '').trim();

    const logs: string[] = [];
    const allCountedGoalIds: string[] = [];
    const filledGoalIds: string[] = [];
    const unfilledGoalIds: string[] = [];
    const unfilledGoalsList: Array<{ subjectName: string; goalId: string; goalText: string }> = [];

    const applicableSubjects: Array<{
      subjectKey: string;
      displayName: string;
      category: 'SUBJECTS' | 'PROJECTS';
      totalCount: number;
      filledCount: number;
      goals: Array<{
        id: string;
        text: string;
        order: number;
        remark: string;
        isFilled: boolean;
      }>;
    }> = [];

    const systemBreakdownMap: Record<string, number> = {};

    // Sort master goal docs by official elementary subjects order
    const sortedSubjKeys = Object.keys(masterGoalsMap || {}).sort((aKey, bKey) => {
      const docA = masterGoalsMap[aKey];
      const docB = masterGoalsMap[bKey];
      const normA = normalizeElementarySubjectName(docA?.subjectKey || aKey);
      const normB = normalizeElementarySubjectName(docB?.subjectKey || bKey);
      const idxA = ELEMENTARY_OFFICIAL_SUBJECTS.indexOf(normA as any);
      const idxB = ELEMENTARY_OFFICIAL_SUBJECTS.indexOf(normB as any);
      return (idxA >= 0 ? idxA : 99) - (idxB >= 0 ? idxB : 99);
    });

    sortedSubjKeys.forEach(subjKey => {
      const doc = masterGoalsMap[subjKey];
      if (!doc) return;

      const normName = normalizeElementarySubjectName(doc.subjectKey || subjKey);
      if (!normName) {
        logs.push(`[EXCLUDE] Key "${subjKey}" could not be normalized.`);
        return;
      }

      const rawKey = doc.subjectKey || subjKey;

      // Performing Arts UA filtering
      if (normName === 'Performing Arts') {
        const docUa = extractPerformingArtsUaFromKey(rawKey);
        if (docUa && studentUa) {
          if (!isPerformingArtsUaMatch(docUa, studentUa)) {
            logs.push(`[EXCLUDE] "${rawKey}" skipped for ${student.name}: student UA is "${studentUa}", doc UA is "${docUa}".`);
            return;
          }
        }
      }

      const activeGoals = getActiveMasterGoals(doc);
      if (activeGoals.length === 0) {
        logs.push(`[EXCLUDE] "${rawKey}" has 0 active goals selected.`);
        return;
      }

      let displayName = normName;
      if (normName === 'Performing Arts') {
        const uaName = studentUa || extractPerformingArtsUaFromKey(rawKey) || '';
        if (uaName) displayName = `Performing Arts (${uaName})`;
      }

      let subjFilledCount = 0;
      const goalsList = activeGoals.map((g, gIdx) => {
        const rawRemark = stData?.remarks?.[g.id];
        const remarkClean = (rawRemark || '').trim().toUpperCase();
        const isFilled = ['A', 'D', 'B'].includes(remarkClean);

        allCountedGoalIds.push(g.id);
        if (isFilled) {
          filledGoalIds.push(g.id);
          subjFilledCount++;
        } else {
          unfilledGoalIds.push(g.id);
          unfilledGoalsList.push({
            subjectName: displayName,
            goalId: g.id,
            goalText: g.text || `Goal #${gIdx + 1}`
          });
        }

        return {
          id: g.id,
          text: g.text || `Goal #${gIdx + 1}`,
          order: g.order || gIdx + 1,
          remark: isFilled ? remarkClean : '',
          isFilled
        };
      });

      const category: 'SUBJECTS' | 'PROJECTS' = (doc.category === 'PROJECTS' || normName === 'Projects') ? 'PROJECTS' : 'SUBJECTS';

      applicableSubjects.push({
        subjectKey: rawKey,
        displayName,
        category,
        totalCount: goalsList.length,
        filledCount: subjFilledCount,
        goals: goalsList
      });

      systemBreakdownMap[displayName] = goalsList.length;
      logs.push(`[INCLUDE] "${displayName}" added with ${goalsList.length} active goals (${subjFilledCount} filled).`);
    });

    const totalGoalsCount = allCountedGoalIds.length;
    const filledGoalsCount = filledGoalIds.length;
    const isComplete = totalGoalsCount === 0 || filledGoalsCount >= totalGoalsCount;

    const systemBreakdown = Object.keys(systemBreakdownMap).map(k => ({
      categoryOrSubject: k,
      count: systemBreakdownMap[k]
    }));

    return {
      totalGoalsCount,
      filledGoalsCount,
      isComplete,
      applicableSubjects,
      unfilledGoalsList,
      systemBreakdown,
      debugInfo: {
        activeClassId: selectedClassId,
        activeAcademicYear: selectedYear,
        activeSemester: selectedSemester,
        activePeriod: selectedTerm === '2' ? 'Midterm 2' : 'Midterm 1',
        studentId: student.id,
        studentName: student.name,
        studentUa,
        totalGoalIdsCount: totalGoalsCount,
        allCountedGoalIds,
        filledGoalIds,
        unfilledGoalIds,
        logs
      }
    };
  }, [masterGoalsMap, studentDataMap, studentUaMap, selectedClassId, selectedYear, selectedSemester, selectedTerm]);

  // Publish Individual Report Function (with PDF Generation & Google Drive Upload)
  const handlePublishStudentReport = async (student: Student) => {
    if (!student || !selectedClass) return;
    if (dateConfigError) {
      toast.error(dateConfigError);
      return;
    }

    const toastId = `pub-${student.id}`;
    setPublishingStudentId(student.id);
    setPublishMessage(null);
    setPublishStatusText('Menyiapkan PDF…');
    toast.loading('Menyiapkan PDF…', { id: toastId });

    let uploadedDriveFileId = '';

    try {
      // 1. Prepare student for hidden PDF generator DOM
      setGeneratingStudent(student);

      // Allow DOM to render and fonts to settle
      await new Promise(r => setTimeout(r, 450));
      if (typeof document !== 'undefined' && (document as any).fonts && (document as any).fonts.ready) {
        await (document as any).fonts.ready;
      }

      // Query PDF page elements
      const container = document.getElementById('elem-pdf-generator-container');
      let pageElements = Array.from(container?.querySelectorAll('.pdf-page') || []) as HTMLElement[];
      if (pageElements.length === 0) {
        const previewEl = document.querySelector('.printable-container');
        if (previewEl) {
          pageElements = Array.from(previewEl.querySelectorAll('.pdf-page')) as HTMLElement[];
        }
      }

      if (pageElements.length === 0) {
        throw new Error('Elemen halaman laporan PDF tidak ditemukan.');
      }

      // 2. Generate PDF Blob
      setPublishStatusText('Menghasilkan file PDF…');
      toast.loading('Menghasilkan file PDF…', { id: toastId });
      const pdfBlob = await generateElementaryMidtermPdfBlob(pageElements);
      const fileName = normalizeElementaryMidtermFilename(student.name, selectedTerm, selectedYear);

      // 3. Connect to Google Drive (OAuth)
      setPublishStatusText('Menghubungkan ke Google Drive…');
      toast.loading('Menghubungkan ke Google Drive…', { id: toastId });
      const token = await getGoogleDriveToken();
      if (!token) {
        throw new Error('Gagal mendapatkan token akses Google Drive. Silakan berikan izin Google Drive untuk melanjutkan.');
      }

      // 4. Ensure hierarchy in official Elementary root folder
      setPublishStatusText('Menyiapkan folder Google Drive…');
      toast.loading('Menyiapkan folder Google Drive…', { id: toastId });
      const { classFolderId } = await ensureElementaryDriveFolders(
        token,
        selectedYear,
        selectedClass.name,
        selectedTerm
      );

      // 5. Upload PDF Blob to Google Drive
      setPublishStatusText('Mengunggah PDF ke Google Drive…');
      toast.loading('Mengunggah PDF ke Google Drive…', { id: toastId });
      const { driveFileId, driveFileUrl } = await uploadElementaryMidtermPdfToDrive(
        pdfBlob,
        fileName,
        classFolderId,
        token
      );

      if (!driveFileId || !driveFileUrl) {
        throw new Error('Upload PDF ke Google Drive gagal: URL atau File ID tidak valid.');
      }

      uploadedDriveFileId = driveFileId;

      // 6. Build Snapshot Categories using student's progress calculation
      setPublishStatusText('Menyimpan metadata laporan…');
      toast.loading('Menyimpan metadata laporan…', { id: toastId });

      const studentDataDoc = studentDataMap[student.id];
      const progress = calculateStudentGoalsProgress(student);

      const subjectsList = progress.applicableSubjects.map(s => ({
        name: s.displayName,
        goals: s.goals.map(g => ({
          id: g.id,
          text: g.text,
          remark: g.remark || '-'
        }))
      }));

      const categoriesSnapshot = [
        { name: 'SUBJECTS', subjects: subjectsList.filter(s => !s.name.includes('Projects')) },
        { name: 'PROJECTS', subjects: subjectsList.filter(s => s.name.includes('Projects')) }
      ];

      const approvedGenCom = studentDataDoc?.generalCommentReviewStatus === 'APPROVED' || studentDataDoc?.generalComment?.isFinal
        ? (studentDataDoc?.generalComment?.finalComment || studentDataDoc?.generalComment?.aiDraft || '')
        : '';

      const dynamicAttendance = getDynamicAttendanceForStudent(
        student.id,
        studentDataDoc?.attendance || { sakit: 0, izin: 0, tanpaKeterangan: 0 }
      );

      const snapshot: ElementaryMidtermReportSnapshot = {
        student: {
          id: student.id,
          name: student.name,
          nisn: student.nisn || (student as any)?.nis || '-',
          className: selectedClass.name,
          grade: selectedClass.grade || ''
        },
        academicYear: selectedYear,
        semester: selectedSemester,
        midtermTerm: selectedTerm,
        categories: categoriesSnapshot,
        generalComment: approvedGenCom,
        attendance: dynamicAttendance,
        signatory: {
          principalName: reportConfig?.principalName || 'Principal',
          principalTitle: reportConfig?.principalTitle || 'Principal',
          principalNiy: reportConfig?.principalNIY || '',
          principalSignatureUrl: reportConfig?.principalSignatureUrl || null,
          homeroomTeacherName: (() => {
            const isEmail = (val?: string | null) => !!val && val.includes('@');
            if (selectedClass.homeroomTeacherName && !isEmail(selectedClass.homeroomTeacherName)) {
              return selectedClass.homeroomTeacherName;
            }
            return 'Homeroom Teacher';
          })(),
          homeroomTeacherNiy: homeroomTeacherProfile?.niy || '',
          homeroomTeacherSignatureUrl: homeroomTeacherProfile?.signatureUrl || (selectedClass as any)?.teacherSignatureUrl || null
        },
        logoUrl: logoUrl || null,
        reportSigningDate: reportSigningDate,
        reportSigningLocation: 'Depok',
        attendanceCutoffDate: attendanceCutoffDate,
        midtermPeriod: selectedTerm,
        showAttendanceRecap: showAttendanceRecap !== false
      };

      // 7. Save metadata to Firestore (elem_midterm_published_reports)
      let publishedDoc: PublishedElementaryMidtermReport;
      try {
        publishedDoc = await publishElementaryMidtermReport({
          studentId: student.id,
          studentName: student.name,
          nisn: student.nisn || (student as any)?.nis || '-',
          classId: selectedClassId,
          className: selectedClass.name,
          grade: selectedClass.grade || '',
          academicYear: selectedYear,
          semester: selectedSemester,
          midtermTerm: selectedTerm,
          reportSnapshot: snapshot,
          driveFolderId: classFolderId,
          driveFileId,
          driveFileUrl,
          fileName,
          user: currentUser
        });
      } catch (saveErr: any) {
        console.error('[CRITICAL] Firestore metadata save failed after Drive upload. driveFileId:', uploadedDriveFileId, saveErr);
        throw new Error(`Upload ke Google Drive berhasil (File ID: ${uploadedDriveFileId}), tetapi gagal menyimpan metadata ke database: ${saveErr.message || saveErr}`);
      }

      setPublishStatusText('Rapor berhasil diterbitkan.');
      toast.success(`Rapor Midterm ${student.name} (v${publishedDoc.version}) berhasil diterbitkan ke Google Drive!`, { id: toastId });
      setPublishMessage({
        type: 'success',
        text: `Rapor Midterm ${student.name} (v${publishedDoc.version}) berhasil diterbitkan dan tersimpan di Google Drive!`
      });

      await onRefreshData();
      setTimeout(() => setPublishMessage(null), 5000);
    } catch (e: any) {
      console.error("Error publishing report:", e);
      const errMsg = e.message || `Gagal mempublikasikan rapor ${student.name}. Coba lagi.`;
      toast.error(errMsg, { id: toastId });
      setPublishMessage({
        type: 'error',
        text: errMsg
      });
    } finally {
      setPublishingStudentId(null);
      setGeneratingStudent(null);
      setPublishStatusText('');
    }
  };

  const handlePrintPdf = () => {
    window.print();
  };

  const formatPublishDate = (ts?: number) => {
    if (!ts) return '-';
    try {
      return new Date(ts).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return String(ts);
    }
  };

  return (
    <div className="space-y-6">
      {/* Date validation warning banner */}
      {dateConfigError && (
        <div className="p-4 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold rounded-2xl flex items-center gap-2.5 animate-in fade-in duration-200">
          <AlertTriangle size={18} className="text-amber-600 shrink-0" />
          <span>{dateConfigError}</span>
        </div>
      )}

      {/* HEADER & SUMMARY STATS BAR */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
            <FileCheck2 size={20} className="text-emerald-600" />
            <span>Publish PDF Report — Elementary</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium pt-0.5">
            Cek kelengkapan data siswa, pratinjau format rapor PDF, dan publikasikan rapor Midterm ke Google Drive resmi.
          </p>
        </div>

        {/* Global Stats */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-center">
            <span className="block text-[10px] font-extrabold uppercase text-slate-400">Total Siswa</span>
            <span className="text-sm font-black text-slate-900">{students.length}</span>
          </div>
          <div className="px-3.5 py-2 bg-emerald-50 border border-emerald-100 rounded-2xl text-center">
            <span className="block text-[10px] font-extrabold uppercase text-emerald-600">Published</span>
            <span className="text-sm font-black text-emerald-800">{Object.keys(publishedMap).length}</span>
          </div>
        </div>
      </div>

      {/* PUBLISH NOTIFICATION MESSAGE */}
      {publishMessage && (
        <div className={`p-4 rounded-2xl border text-xs font-bold flex items-center gap-2.5 animate-in fade-in duration-200 ${
          publishMessage.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {publishMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <span>{publishMessage.text}</span>
        </div>
      )}

      {/* STUDENT PUBLISH ROSTER TABLE */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-900 text-white font-extrabold uppercase text-xs tracking-wider flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User size={16} className="text-emerald-400" />
            <span>Daftar Siswa & Status Rapor ({students.length})</span>
          </div>
          <span className="text-[10.5px] font-medium text-slate-400">
            Klik angka Learning Goals untuk memeriksa rincian pengisian
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-extrabold uppercase text-[10.5px] tracking-wider border-b border-slate-200">
                <th className="p-3.5 text-center w-12 border-r border-slate-200">No</th>
                <th className="p-3.5 border-r border-slate-200 min-w-[180px]">Nama Siswa</th>
                <th className="p-3.5 border-r border-slate-200 w-32">NISN</th>
                <th className="p-3.5 border-r border-slate-200 w-44 text-center">Learning Goals</th>
                <th className="p-3.5 border-r border-slate-200 w-40 text-center">General Comments</th>
                <th className="p-3.5 border-r border-slate-200 w-44 text-center">Status Rapor</th>
                <th className="p-3.5 text-center min-w-[200px]">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {students.map((st, idx) => {
                const stData = studentDataMap[st.id];
                const publishedRep = publishedMap[st.id];
                const isPub = Boolean(publishedRep);

                // Calculate goals count dynamically
                const progress = calculateStudentGoalsProgress(st);
                const isGoalsComplete = progress.isComplete;

                // General Comments Review Status
                const genComReviewStatus = stData?.generalCommentReviewStatus || 'DRAFT';
                const isGenComApproved = genComReviewStatus === 'APPROVED';
                const isGenComPending = genComReviewStatus === 'SUBMITTED_FOR_REVIEW' || (genComReviewStatus as string) === 'PENDING_REVIEW';

                // Can publish check with date config constraint
                const canPublish = isGenComApproved && isGoalsComplete && !dateConfigError;
                const isPublishingThis = publishingStudentId === st.id;

                return (
                  <tr key={st.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5 text-center font-bold text-slate-400 border-r border-slate-100">
                      {idx + 1}
                    </td>

                    <td className="p-3.5 border-r border-slate-100">
                      <div className="font-extrabold text-slate-900">{st.name}</div>
                      {studentUaMap[st.id] && (
                        <span className="inline-block mt-0.5 px-2 py-0.5 bg-purple-50 text-purple-700 font-bold text-[9.5px] rounded-md border border-purple-100">
                          UA: {studentUaMap[st.id]}
                        </span>
                      )}
                    </td>

                    <td className="p-3.5 border-r border-slate-100 font-semibold text-slate-600 font-mono text-[11px]">
                      {st.nisn || (st as any)?.nis || '-'}
                    </td>

                    {/* Learning Goals Column */}
                    <td className="p-3.5 border-r border-slate-100 text-center">
                      <button
                        onClick={() => setDetailStudent(st)}
                        className="group inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-black transition-all cursor-pointer hover:scale-105"
                        title="Klik untuk melihat Detail & Rincian Learning Goals"
                      >
                        {progress.totalGoalsCount === 0 ? (
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-500 font-bold rounded-full">
                            Belum set goals
                          </span>
                        ) : isGoalsComplete ? (
                          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 font-black rounded-full inline-flex items-center gap-1 group-hover:bg-emerald-100 shadow-2xs">
                            <Check size={12} /> Lengkap ({progress.filledGoalsCount}/{progress.totalGoalsCount})
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 font-bold rounded-full inline-flex items-center gap-1 group-hover:bg-amber-100 shadow-2xs">
                            <Clock size={12} /> ({progress.filledGoalsCount}/{progress.totalGoalsCount} Terisi)
                          </span>
                        )}
                      </button>
                    </td>

                    {/* General Comments Column */}
                    <td className="p-3.5 border-r border-slate-100 text-center">
                      {isGenComApproved ? (
                        <span className="px-2.5 py-1 bg-emerald-100 text-emerald-900 border border-emerald-300 font-black text-[10.5px] rounded-full inline-flex items-center gap-1">
                          <CheckCircle2 size={12} /> Approved
                        </span>
                      ) : isGenComPending ? (
                        <span className="px-2.5 py-1 bg-blue-50 text-blue-800 border border-blue-200 font-bold text-[10.5px] rounded-full">
                          Menunggu Review
                        </span>
                      ) : genComReviewStatus === 'REVISION_REQUESTED' ? (
                        <span className="px-2.5 py-1 bg-red-50 text-red-800 border border-red-200 font-bold text-[10.5px] rounded-full">
                          Perlu Revisi
                        </span>
                      ) : (stData?.generalComment?.finalComment || stData?.generalComment?.aiDraft) ? (
                        <span className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 font-bold text-[10.5px] rounded-full">
                          Draft
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-400 font-medium text-[10.5px] rounded-full">
                          Belum Ada
                        </span>
                      )}
                    </td>

                    {/* Status Rapor Column */}
                    <td className="p-3.5 border-r border-slate-100 text-center">
                      {isPub ? (
                        <div className="space-y-1">
                          <span className="px-2.5 py-1 bg-emerald-800 text-white font-extrabold text-[10px] rounded-full inline-flex items-center gap-1 shadow-2xs uppercase tracking-wider">
                            <CheckCircle2 size={11} /> Published (v{publishedRep.version || 1})
                          </span>
                          <div className="text-[10px] text-slate-500 font-medium space-y-0.5">
                            <div>{formatPublishDate(publishedRep.generatedAt || (publishedRep as any).updatedAt)}</div>
                            {publishedRep.generatedByName && (
                              <div className="text-slate-400 truncate max-w-[130px] mx-auto" title={publishedRep.generatedByName}>
                                Oleh: {publishedRep.generatedByName}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-500 font-bold text-[10.5px] rounded-full">
                          Belum Published
                        </span>
                      )}
                    </td>

                    {/* Action Column */}
                    <td className="p-3.5 text-center">
                      <div className="flex flex-wrap items-center justify-center gap-1.5">
                        {/* Preview Button */}
                        <button
                          onClick={() => setPreviewStudent(st)}
                          className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[10.5px] font-bold flex items-center gap-1 cursor-pointer transition-all shadow-2xs"
                          title="Lihat Pratinjau Rapor Midterm Elementary"
                        >
                          <Eye size={13} />
                          <span>Preview</span>
                        </button>

                        {/* Buka PDF di Google Drive Button (if published) */}
                        {isPub && (
                          publishedRep.driveFileUrl ? (
                            <a
                              href={publishedRep.driveFileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10.5px] font-extrabold flex items-center gap-1 cursor-pointer transition-all shadow-2xs"
                              title="Buka PDF di Google Drive"
                            >
                              <ExternalLink size={13} />
                              <span>Buka PDF</span>
                            </a>
                          ) : (
                            <span className="text-[9.5px] text-amber-700 italic block py-0.5">
                              PDF Drive belum tersedia
                            </span>
                          )
                        )}

                        {/* Publish / Terbitkan Ulang Button */}
                        <button
                          onClick={() => handlePublishStudentReport(st)}
                          disabled={!canPublish || isPublishingThis}
                          className={`px-2.5 py-1.5 rounded-xl text-[10.5px] font-extrabold flex items-center gap-1 transition-all ${
                            canPublish
                              ? isPub 
                                ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-2xs cursor-pointer'
                                : 'bg-emerald-800 hover:bg-emerald-900 text-white shadow-2xs cursor-pointer'
                              : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60'
                          }`}
                          title={
                            dateConfigError
                              ? dateConfigError
                              : !canPublish 
                                ? !isGenComApproved 
                                  ? 'General comment belum diapprove' 
                                  : 'Learning goals belum lengkap'
                                : isPub
                                  ? 'Terbitkan Ulang versi baru ke Google Drive'
                                  : 'Publikasikan PDF Rapor Siswa ke Google Drive'
                          }
                        >
                          {isPublishingThis ? (
                            <RefreshCw size={13} className="animate-spin" />
                          ) : (
                            <Send size={13} />
                          )}
                          <span>
                            {isPublishingThis ? (publishStatusText || 'Memproses…') : isPub ? 'Terbitkan Ulang' : 'Publish'}
                          </span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Hidden PDF Generator Container */}
      {generatingStudent && (
        <div
          id="elem-pdf-generator-container"
          style={{
            position: 'fixed',
            left: '-9999px',
            top: 0,
            width: '210mm',
            zIndex: -50,
            opacity: 0,
            pointerEvents: 'none'
          }}
        >
          <ElementaryMidtermPdfTemplate
            student={generatingStudent}
            currentClass={selectedClass}
            academicYear={selectedYear}
            semester={selectedSemester}
            midtermTerm={selectedTerm}
            masterGoalsMap={masterGoalsMap}
            studentDataDoc={studentDataMap[generatingStudent.id]}
            reportConfig={reportConfig}
            logoUrl={logoUrl}
            homeroomTeacherProfile={homeroomTeacherProfile || undefined}
            studentUaName={studentUaMap[generatingStudent.id]}
            attendance={getDynamicAttendanceForStudent(generatingStudent.id, studentDataMap[generatingStudent.id]?.attendance || { sakit: 0, izin: 0, tanpaKeterangan: 0 })}
            reportSigningDate={reportSigningDate}
            reportSigningLocation="Depok"
            attendanceCutoffDate={attendanceCutoffDate}
            showAttendanceRecap={showAttendanceRecap}
          />
        </div>
      )}

      {/* MODAL DETAIL LEARNING GOALS (VIEW-ONLY) */}
      {detailStudent && (() => {
        const progress = calculateStudentGoalsProgress(detailStudent);
        return (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 z-50 overflow-y-auto">
            <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 font-sans text-slate-800">
              
              {/* Modal Header Bar */}
              <div className="p-5 bg-slate-900 text-white border-b border-slate-800 flex items-center justify-between gap-4 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black text-base border border-emerald-500/30 shrink-0">
                    <BookOpen size={20} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-black text-white uppercase tracking-tight truncate">
                      Detail Learning Goals — {detailStudent.name}
                    </h3>
                    <p className="text-xs text-slate-400 font-medium truncate">
                      Kelas {selectedClass?.name || ''} • NISN: {detailStudent.nisn || (detailStudent as any)?.nis || '-'} • {selectedYear} S{selectedSemester} (Midterm {selectedTerm})
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      setDetailStudent(null);
                      if (onSwitchTab) {
                        onSwitchTab('GOALS');
                      } else {
                        const p = new URLSearchParams(window.location.search);
                        p.set('tab', 'learning-goals');
                        window.location.search = p.toString();
                      }
                    }}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                  >
                    <BookOpen size={14} />
                    <span>Buka Learning Goals & Remarks</span>
                  </button>

                  <button
                    onClick={() => setDetailStudent(null)}
                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Modal Scrollable Body */}
              <div className="p-6 overflow-y-auto space-y-6">

                {/* Summary Banner */}
                <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  progress.isComplete
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}>
                  <div className="flex items-center gap-2.5">
                    {progress.isComplete ? (
                      <CheckCircle2 size={22} className="text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle size={22} className="text-amber-600 shrink-0" />
                    )}
                    <div>
                      <span className="text-sm font-black uppercase tracking-tight block">
                        {progress.filledGoalsCount} dari {progress.totalGoalsCount} Learning Goals telah dinilai
                      </span>
                      <p className="text-xs font-medium opacity-80 pt-0.5">
                        {progress.isComplete
                          ? 'Semua Learning Goals aktif sudah memiliki nilai A/D/B valid.'
                          : `Terdapat ${progress.unfilledGoalsList.length} Learning Goal yang belum diisi nilai (A/D/B).`}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0">
                    <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                      progress.isComplete
                        ? 'bg-emerald-600 text-white'
                        : 'bg-amber-600 text-white'
                    }`}>
                      {progress.isComplete ? '100% Lengkap' : `${progress.unfilledGoalsList.length} Belum Diisi`}
                    </span>
                  </div>
                </div>

                {/* Unfilled Goals Banner List (If Any) */}
                {progress.unfilledGoalsList.length > 0 && (
                  <div className="p-4 bg-red-50/70 border border-red-200 rounded-2xl space-y-3">
                    <div className="flex items-center gap-2 text-red-900 font-extrabold text-xs uppercase tracking-wider">
                      <AlertTriangle size={16} className="text-red-600" />
                      <span>Daftar Learning Goals Belum Diisi ({progress.unfilledGoalsList.length})</span>
                    </div>
                    <div className="space-y-2">
                      {progress.unfilledGoalsList.map((ug, uIdx) => (
                        <div key={`unfilled-${uIdx}`} className="p-3 bg-white rounded-xl border border-red-100 flex items-start justify-between gap-3 text-xs shadow-2xs">
                          <div className="space-y-0.5">
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-bold text-[10px] rounded-md">
                              {ug.subjectName}
                            </span>
                            <p className="font-semibold text-slate-800 leading-relaxed pt-1">
                              • {ug.goalText}
                            </p>
                          </div>
                          <span className="px-2.5 py-1 bg-amber-100 text-amber-800 font-extrabold text-[10px] rounded-full shrink-0 flex items-center gap-1">
                            <Clock size={11} /> Belum Diisi
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Grouped By Subject Detail */}
                <div className="space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2 border-b border-slate-200 pb-2">
                    <BookOpen size={16} className="text-emerald-600" />
                    <span>Status Pengisian Per Mata Pelajaran</span>
                  </h4>

                  <div className="space-y-4">
                    {progress.applicableSubjects.map((subj, sIdx) => (
                      <div key={`subj-detail-${sIdx}`} className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 space-y-3">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-200/80">
                          <span className="font-black text-slate-900 text-xs uppercase tracking-tight">
                            {subj.displayName}
                          </span>
                          <span className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-extrabold ${
                            subj.filledCount === subj.totalCount
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {subj.displayName}: {subj.filledCount}/{subj.totalCount} Terisi
                          </span>
                        </div>

                        <div className="space-y-2">
                          {subj.goals.map((g) => (
                            <div key={g.id} className="p-2.5 bg-white rounded-xl border border-slate-200/60 flex items-center justify-between gap-3 text-xs">
                              <div className="flex items-start gap-2 min-w-0">
                                <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] mt-0.5 ${
                                  g.isFilled
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {g.isFilled ? '✓' : '!'}
                                </span>
                                <span className="font-medium text-slate-800 leading-relaxed">
                                  {g.text}
                                </span>
                              </div>

                              <div className="shrink-0">
                                {g.isFilled ? (
                                  <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 font-extrabold text-[10.5px] rounded-lg inline-flex items-center gap-1">
                                    ✓ Nilai: {g.remark}
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 font-bold text-[10.5px] rounded-lg inline-flex items-center gap-1">
                                    <Clock size={11} /> Belum Diisi
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* LG yang Dihitung Sistem */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                        <Info size={15} className="text-blue-600" />
                        <span>LG yang Dihitung Sistem (Total: {progress.totalGoalsCount})</span>
                      </h4>
                      <p className="text-[11px] text-slate-500 pt-0.5">
                        Rincian jumlah Learning Goals aktif yang relevan untuk konteks kelas, semester, dan unit activity saat ini.
                      </p>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden text-xs">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200">
                          <th className="p-2.5">Mata Pelajaran / Activity</th>
                          <th className="p-2.5 text-center">Kategori</th>
                          <th className="p-2.5 text-center">Jumlah Active Goal</th>
                          <th className="p-2.5 text-center">Status Terisi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {progress.applicableSubjects.map((s, idx) => (
                          <tr key={`sys-breakdown-${idx}`} className="hover:bg-slate-50/60">
                            <td className="p-2.5 font-bold text-slate-800">{s.displayName}</td>
                            <td className="p-2.5 text-center text-slate-500 text-[10.5px]">{s.category}</td>
                            <td className="p-2.5 text-center font-extrabold text-slate-900">{s.totalCount}</td>
                            <td className="p-2.5 text-center">
                              <span className={`font-bold text-[10.5px] ${s.filledCount === s.totalCount ? 'text-emerald-700' : 'text-amber-700'}`}>
                                {s.filledCount}/{s.totalCount}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-900 text-white font-black uppercase text-xs">
                          <td className="p-2.5" colSpan={2}>Total Learning Goals Systems</td>
                          <td className="p-2.5 text-center text-emerald-400">{progress.totalGoalsCount}</td>
                          <td className="p-2.5 text-center">{progress.filledGoalsCount}/{progress.totalGoalsCount} Terisi</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Development Debug Section */}
                <div className="border border-slate-300 rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setShowDebug(!showDebug)}
                    className="w-full p-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <span>🔧 Temporary Dev Debug Information</span>
                      <span className="px-2 py-0.5 bg-slate-200 text-slate-800 text-[9.5px] rounded-md font-mono">
                        Internal Logs
                      </span>
                    </span>
                    {showDebug ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>

                  {showDebug && (
                    <div className="p-4 bg-slate-950 text-slate-200 text-[11px] font-mono space-y-3 overflow-x-auto">
                      <div>
                        <span className="text-emerald-400 font-bold">// Active Context:</span>
                        <div className="text-slate-300 pt-0.5">
                          classId: "{progress.debugInfo.activeClassId}" | year: "{progress.debugInfo.activeAcademicYear}" | semester: "{progress.debugInfo.activeSemester}" | period: "{progress.debugInfo.activePeriod}"
                        </div>
                        <div className="text-slate-300">
                          studentId: "{progress.debugInfo.studentId}" | studentName: "{progress.debugInfo.studentName}" | studentUa: "{progress.debugInfo.studentUa || 'N/A'}"
                        </div>
                      </div>

                      <div>
                        <span className="text-emerald-400 font-bold">// Calculated Summary:</span>
                        <div className="text-slate-300 pt-0.5">
                          totalLG: {progress.debugInfo.totalGoalIdsCount} | filledLG: {progress.debugInfo.filledGoalIds.length} | unfilledLG: {progress.debugInfo.unfilledGoalIds.length}
                        </div>
                      </div>

                      <div>
                        <span className="text-emerald-400 font-bold">// Counted Active Goal IDs ({progress.debugInfo.allCountedGoalIds.length}):</span>
                        <div className="text-slate-400 pt-0.5 max-h-24 overflow-y-auto break-all bg-slate-900 p-2 rounded-lg">
                          {JSON.stringify(progress.debugInfo.allCountedGoalIds)}
                        </div>
                      </div>

                      <div>
                        <span className="text-emerald-400 font-bold">// Filled Goal IDs ({progress.debugInfo.filledGoalIds.length}):</span>
                        <div className="text-emerald-300/80 pt-0.5 max-h-24 overflow-y-auto break-all bg-slate-900 p-2 rounded-lg">
                          {JSON.stringify(progress.debugInfo.filledGoalIds)}
                        </div>
                      </div>

                      <div>
                        <span className="text-emerald-400 font-bold">// Unfilled Goal IDs ({progress.debugInfo.unfilledGoalIds.length}):</span>
                        <div className="text-amber-300/80 pt-0.5 max-h-24 overflow-y-auto break-all bg-slate-900 p-2 rounded-lg">
                          {JSON.stringify(progress.debugInfo.unfilledGoalIds)}
                        </div>
                      </div>

                      <div>
                        <span className="text-emerald-400 font-bold">// Subject Inclusion / Exclusion Reason Logs:</span>
                        <div className="text-slate-300 pt-0.5 space-y-0.5 bg-slate-900 p-2.5 rounded-lg max-h-36 overflow-y-auto">
                          {progress.debugInfo.logs.map((log, lIdx) => (
                            <div key={`log-${lIdx}`} className={log.startsWith('[EXCLUDE]') ? 'text-amber-400' : 'text-slate-300'}>
                              {log}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

              </div>

            </div>
          </div>
        );
      })()}

      {/* MODAL PREVIEW RAPOR MIDTERM ELEMENTARY */}
      {previewStudent && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 z-50 overflow-y-auto">
          <div className="bg-slate-900 rounded-3xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header Bar */}
            <div className="p-4 sm:p-5 bg-slate-900 text-white border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black text-base border border-emerald-500/30">
                  <Eye size={20} />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-white uppercase tracking-tight flex items-center gap-2">
                    Preview Rapor Midterm Elementary
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">
                    {previewStudent.name} • Kelas {selectedClass?.name || ''} • NISN: {previewStudent.nisn || (previewStudent as any)?.nis || '-'}
                  </p>
                </div>
              </div>

              {/* Action Buttons inside Preview Header */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handlePrintPdf}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs border border-slate-700"
                >
                  <Printer size={14} />
                  <span>Cetak PDF</span>
                </button>

                {publishedMap[previewStudent.id]?.driveFileUrl && (
                  <a
                    href={publishedMap[previewStudent.id].driveFileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                  >
                    <ExternalLink size={14} />
                    <span>Buka PDF di Drive</span>
                  </a>
                )}

                <button
                  onClick={() => handlePublishStudentReport(previewStudent)}
                  disabled={publishingStudentId === previewStudent.id || Boolean(dateConfigError)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all ${
                    !dateConfigError
                      ? publishedMap[previewStudent.id]
                        ? 'bg-amber-600 hover:bg-amber-500 text-white cursor-pointer shadow-2xs'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-2xs'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                  }`}
                  title={dateConfigError || (publishedMap[previewStudent.id] ? "Terbitkan Ulang ke Google Drive" : "Publish Rapor ke Google Drive")}
                >
                  {publishingStudentId === previewStudent.id ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <Send size={14} />
                  )}
                  <span>
                    {publishingStudentId === previewStudent.id 
                      ? (publishStatusText || 'Memproses…')
                      : publishedMap[previewStudent.id] 
                        ? 'Terbitkan Ulang' 
                        : 'Publish Rapor'}
                  </span>
                </button>

                <button
                  onClick={() => setPreviewStudent(null)}
                  className="p-2 bg-slate-800 hover:bg-red-900/80 text-slate-400 hover:text-white rounded-xl transition-all cursor-pointer ml-1"
                  title="Tutup Preview"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Body: Render PDF Template */}
            <div className="p-6 overflow-y-auto bg-slate-200 flex-1 flex flex-col items-center">
              <ElementaryMidtermPdfTemplate
                snapshot={publishedMap[previewStudent.id]?.reportSnapshot}
                student={previewStudent}
                currentClass={selectedClass}
                academicYear={selectedYear}
                semester={selectedSemester}
                midtermTerm={selectedTerm}
                masterGoalsMap={masterGoalsMap}
                studentDataDoc={studentDataMap[previewStudent.id]}
                reportConfig={reportConfig}
                logoUrl={logoUrl}
                homeroomTeacherProfile={homeroomTeacherProfile || undefined}
                studentUaName={studentUaMap[previewStudent.id]}
                attendance={getDynamicAttendanceForStudent(previewStudent.id, studentDataMap[previewStudent.id]?.attendance || { sakit: 0, izin: 0, tanpaKeterangan: 0 })}
                reportSigningDate={reportSigningDate}
                reportSigningLocation="Depok"
                attendanceCutoffDate={attendanceCutoffDate}
                showAttendanceRecap={showAttendanceRecap}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
