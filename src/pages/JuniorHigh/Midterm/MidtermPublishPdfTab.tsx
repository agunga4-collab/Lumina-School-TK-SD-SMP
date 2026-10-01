import * as React from 'react';
import { 
  FileText, CheckCircle2, AlertCircle, Eye, Upload, 
  ExternalLink, Download, RefreshCw, AlertTriangle, X, Check, Lock
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../context/AuthContext';
import { db } from '../../../lib/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { 
  evaluateStudentMidtermStatus,
  canUserPublishMidterm,
  getNextMidtermReportVersion,
  savePublishedMidtermReport,
  fetchPublishedMidtermReports
} from '../../../services/juniorHighMidtermService';
import { 
  normalizeMidtermFilename,
  generateMidtermPdfBlob,
  blobToBase64,
  ensureJuniorHighMidtermDriveFolders,
  uploadJuniorHighMidtermPdfToDrive,
  JUNIOR_HIGH_MIDTERM_ROOT_FOLDER_ID
} from '../../../lib/juniorHighMidtermReportPdf';
import { MidtermPdfTemplate } from './MidtermPdfTemplate';
import type { 
  MidtermMasterGoalDoc, 
  MidtermStudentDataDoc,
  PublishedMidtermReport,
  MidtermReportSnapshot
} from '../../../types/midtermReport';
import { JH_MIDTERM_CATEGORIES } from '../../../types/midtermReport';
import type { Student, Class, User, ReportConfig } from '../../../types';

interface MidtermPublishPdfTabProps {
  currentUser: User;
  selectedClass: Class | null;
  students: Student[];
  academicYear: string;
  semester: string;
  midtermTerm: string;
  masterGoalsMap: Record<string, MidtermMasterGoalDoc>;
  studentDataMap: Record<string, MidtermStudentDataDoc>;
  publishedReportsMap: Record<string, PublishedMidtermReport>;
  studentAttendanceMap: Record<string, { sickLeave?: number; excusedLeave?: number; absent?: number }>;
  reportConfig: ReportConfig | null;
  homeroomTeacherProfile: { displayName: string; niy?: string; signatureUrl?: string | null } | null;
  onRefreshData: () => Promise<void>;
  loading: boolean;
  reportSigningLocation?: string;
  reportSigningDate?: string;
  attendanceCutoffDate?: string;
  signingDateRaw?: string;
  cutoffDateRaw?: string;
}

export const MidtermPublishPdfTab: React.FC<MidtermPublishPdfTabProps> = ({
  currentUser,
  selectedClass,
  students,
  academicYear,
  semester,
  midtermTerm,
  masterGoalsMap,
  studentDataMap,
  publishedReportsMap,
  studentAttendanceMap,
  reportConfig,
  homeroomTeacherProfile,
  onRefreshData,
  loading,
  reportSigningLocation = 'Depok',
  reportSigningDate,
  attendanceCutoffDate,
  signingDateRaw,
  cutoffDateRaw,
}) => {
  const safeStudents = Array.isArray(students) ? students.filter(Boolean) : [];
  const safeStudentDataMap = studentDataMap && typeof studentDataMap === 'object' ? studentDataMap : {};
  const safePublishedReportsMap = publishedReportsMap && typeof publishedReportsMap === 'object' ? publishedReportsMap : {};
  const safeMasterGoalsMap = masterGoalsMap && typeof masterGoalsMap === 'object' ? masterGoalsMap : {};
  const safeStudentAttendanceMap = studentAttendanceMap && typeof studentAttendanceMap === 'object' ? studentAttendanceMap : {};

  const { getGoogleDriveToken } = useAuth();
  const [filterStatus, setFilterStatus] = React.useState<'ALL' | 'READY' | 'PUBLISHED' | 'DRAFT'>('ALL');
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  
  // Modal Preview state
  const [previewStudent, setPreviewStudent] = React.useState<Student | null>(null);
  const [previewSnapshot, setPreviewSnapshot] = React.useState<MidtermReportSnapshot | null>(null);
  const [isPreviewReady, setIsPreviewReady] = React.useState<boolean>(false);

  // Publishing in progress
  const [publishingStudentId, setPublishingStudentId] = React.useState<string | null>(null);
  const [bulkPublishing, setBulkPublishing] = React.useState<boolean>(false);
  const [publishProgress, setPublishProgress] = React.useState<{ current: number; total: number } | null>(null);

  // Background rendering elements for PDF creation
  const [activeGeneratingStudent, setActiveGeneratingStudent] = React.useState<Student | null>(null);
  const [logoUrl, setLogoUrl] = React.useState<string | null>(null);

  const [cutoffAttendanceMap, setCutoffAttendanceMap] = React.useState<Record<string, { sickLeave: number | null; excusedLeave: number | null; absent: number | null }>>({});
  const [loadingAttendance, setLoadingAttendance] = React.useState<boolean>(false);

  const isDatesValid = React.useMemo(() => {
    if (!signingDateRaw || !cutoffDateRaw) return false;
    return cutoffDateRaw <= signingDateRaw;
  }, [signingDateRaw, cutoffDateRaw]);

  const studentsKey = React.useMemo(() => {
    return safeStudents.map(s => s.id).join(',');
  }, [safeStudents]);

  const handlePreviewReadyChange = React.useCallback((ready: boolean) => {
    setIsPreviewReady(ready);
  }, []);

  // Reset preview state on mount and whenever context changes
  const classId = selectedClass?.id;
  React.useEffect(() => {
    setPreviewStudent(null);
    setPreviewSnapshot(null);
    setIsPreviewReady(false);
    setPublishingStudentId(null);
  }, [classId, academicYear, semester, midtermTerm]);

  React.useEffect(() => {
    if (!selectedClass || !academicYear || !semester || !cutoffDateRaw || safeStudents.length === 0) {
      setCutoffAttendanceMap({});
      return;
    }

    let isCancelled = false;

    const fetchCutoffAttendance = async () => {
      setLoadingAttendance(true);
      try {
        const classIdentifiers = [selectedClass.id];
        if (selectedClass.name && selectedClass.name !== selectedClass.id) {
          classIdentifiers.push(selectedClass.name);
        }

        const attQuery = query(
          collection(db, 'attendance_records'),
          where('classId', 'in', classIdentifiers),
          where('academicYear', '==', academicYear)
        );

        const snap = await getDocs(attQuery);
        const docs = snap.docs.map(d => d.data());

        if (isCancelled) return;

        const rosterSet = new Set(safeStudents.map(s => s.id));
        const map: Record<string, { sickLeave: number | null; excusedLeave: number | null; absent: number | null }> = {};

        // Initialize everyone to 0
        safeStudents.forEach(st => {
          map[st.id] = { sickLeave: 0, excusedLeave: 0, absent: 0 };
        });

        docs.forEach(record => {
          const recStudentId = record.studentId || '';
          const recSemester = String(record.semester || '');
          const recordDate = record.date || ''; // YYYY-MM-DD
          const recStatus = record.status || '';

          if (
            rosterSet.has(recStudentId) &&
            recSemester === String(semester) &&
            recordDate <= cutoffDateRaw &&
            ['HADIR', 'SAKIT', 'IZIN', 'ALPA', 'LATE'].includes(recStatus)
          ) {
            if (recStatus === 'SAKIT') {
              map[recStudentId].sickLeave = (map[recStudentId].sickLeave || 0) + 1;
            } else if (recStatus === 'IZIN') {
              map[recStudentId].excusedLeave = (map[recStudentId].excusedLeave || 0) + 1;
            } else if (recStatus === 'ALPA') {
              map[recStudentId].absent = (map[recStudentId].absent || 0) + 1;
            }
          }
        });

        setCutoffAttendanceMap(map);
      } catch (err) {
        if (!isCancelled) console.error("Error fetching cutoff attendance:", err);
      } finally {
        if (!isCancelled) setLoadingAttendance(false);
      }
    };

    fetchCutoffAttendance();

    return () => {
      isCancelled = true;
    };
  }, [selectedClass?.id, academicYear, semester, cutoffDateRaw, studentsKey]);

  React.useEffect(() => {
    const fetchLogo = async () => {
      try {
        const logoDoc = await getDoc(doc(db, 'settings', 'logos'));
        if (logoDoc.exists()) {
          const data = logoDoc.data() as any;
          if (data?.JUNIOR_HIGH?.reportHeaderLogo?.originalUrl) {
            setLogoUrl(data.JUNIOR_HIGH.reportHeaderLogo.originalUrl);
          } else if (data?.JUNIOR_HIGH?.rectangular) {
            setLogoUrl(data.JUNIOR_HIGH.rectangular);
          }
        } else {
          const localLogos = localStorage.getItem('lumina_school_logos');
          if (localLogos) {
            const parsed = JSON.parse(localLogos);
            if (parsed?.JUNIOR_HIGH?.reportHeaderLogo?.originalUrl) {
              setLogoUrl(parsed.JUNIOR_HIGH.reportHeaderLogo.originalUrl);
            } else if (parsed?.JUNIOR_HIGH?.rectangular) {
              setLogoUrl(parsed.JUNIOR_HIGH.rectangular);
            }
          }
        }
      } catch (e) {
        console.warn("Failed to fetch Junior High logo in PublishPdfTab:", e);
      }
    };
    fetchLogo();
  }, []);

  const canPublish = canUserPublishMidterm(currentUser, selectedClass);

  // Filter students
  const filteredStudents = React.useMemo(() => {
    return safeStudents.filter(student => {
      if (!student || !student.id) return false;
      const sData = safeStudentDataMap[student.id];
      const published = safePublishedReportsMap[student.id];
      const isPublished = Boolean(published);
      const evalStatus = evaluateStudentMidtermStatus(student, safeMasterGoalsMap, sData, isPublished);

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const studentName = typeof student.name === 'string' ? student.name : '';
        const matchesName = studentName.toLowerCase().includes(q);
        const matchesNisn = String(student.nisn || (student as any).nis || '').toLowerCase().includes(q);
        if (!matchesName && !matchesNisn) return false;
      }

      if (filterStatus === 'PUBLISHED') return isPublished;
      if (filterStatus === 'READY') return !isPublished && evalStatus.isReady;
      if (filterStatus === 'DRAFT') return !isPublished && !evalStatus.isReady;
      return true;
    });
  }, [safeStudents, safeStudentDataMap, safePublishedReportsMap, safeMasterGoalsMap, filterStatus, searchQuery]);

  // Build snapshot object from live data
  const buildLiveSnapshot = (student: Student): MidtermReportSnapshot => {
    if (!student) throw new Error('Data siswa tidak valid.');
    const sData = safeStudentDataMap[student.id];
    
    // Use real-time cutoff attendance if available, fallback to full attendance map or zeros
    const att = cutoffAttendanceMap[student.id] || safeStudentAttendanceMap[student.id] || { sickLeave: 0, excusedLeave: 0, absent: 0 };
    const categoriesList = Array.isArray(JH_MIDTERM_CATEGORIES) ? JH_MIDTERM_CATEGORIES : [];

    const categories = categoriesList.map(cat => ({
      name: cat.name,
      subjects: (Array.isArray(cat?.subjects) ? cat.subjects : []).map(subjName => {
        const master = safeMasterGoalsMap[subjName];
        const rawGoals = Array.isArray(master?.goals) ? master.goals : [];
        const goals = rawGoals.map(g => ({
          id: g.id,
          text: g.text,
          remark: sData?.remarks?.[g.id] || (subjName === 'Spiritual Health' ? (sData?.spiritualHealthRemark || '') : '') || '-'
        }));
        return {
          name: subjName,
          goals
        };
      })
    }));

    return {
      student: {
        id: student.id,
        name: student.name || 'Siswa',
        nisn: student.nisn || (student as any).nis || '-',
        className: selectedClass?.name || '',
        grade: student.grade || 7
      },
      academicYear,
      semester,
      midtermTerm,
      categories,
      generalComment: sData?.generalComment?.finalComment || sData?.generalComment?.aiDraft || '',
      attendance: {
        sakit: att.sickLeave ?? 0,
        izin: att.excusedLeave ?? 0,
        tanpaKeterangan: att.absent ?? 0
      },
      signatory: {
        principalName: reportConfig?.principalName || 'Principal',
        principalNiy: reportConfig?.principalNIY || '',
        principalSignatureUrl: reportConfig?.principalSignatureUrl || null,
        homeroomTeacherName: (() => {
          const isEmail = (val?: string | null) => !!val && val.includes('@');
          if (selectedClass?.homeroomTeacherName && !isEmail(selectedClass.homeroomTeacherName)) {
            return selectedClass.homeroomTeacherName;
          }
          return 'Homeroom Teacher';
        })(),
        homeroomTeacherNiy: homeroomTeacherProfile?.niy || '',
        homeroomTeacherSignatureUrl: selectedClass?.teacherSignatureUrl || null
      },
      logoUrl: logoUrl || null,
      reportSigningLocation: reportSigningLocation || 'Depok',
      reportSigningDate: reportSigningDate || '',
      attendanceCutoffDate: attendanceCutoffDate || ''
    };
  };

  const handleOpenPreview = (student: Student) => {
    if (!student || !student.id || !(student.name && student.name.trim())) {
      toast.error('Pratinjau tidak dapat dibuka: Data nama atau ID siswa wajib diisi.');
      return;
    }
    if (!selectedClass || !(selectedClass.name && selectedClass.name.trim())) {
      toast.error('Pratinjau tidak dapat dibuka: Data nama kelas wajib diisi.');
      return;
    }
    const published = publishedReportsMap[student.id];
    if (published && published.reportSnapshot) {
      setPreviewSnapshot(published.reportSnapshot);
      setPreviewStudent(student);
    } else {
      try {
        setPreviewSnapshot(buildLiveSnapshot(student));
        setPreviewStudent(student);
      } catch (err: any) {
        console.error('Error building live snapshot for preview:', err);
        toast.error(`Gagal menyiapkan pratinjau: ${err?.message || 'Data tidak lengkap.'}`);
      }
    }
  };

  const executePublishStudent = async (student: Student) => {
    if (!student || !student.id || !(student.name && student.name.trim())) {
      throw new Error('Data wajib siswa (ID atau Nama) tidak lengkap.');
    }
    if (!selectedClass || !(selectedClass.name && selectedClass.name.trim())) {
      throw new Error('Data wajib kelas (Nama Kelas) tidak lengkap.');
    }

    setActiveGeneratingStudent(student);
    // Give DOM time to update and paginate the hidden print template
    let pageElements: HTMLElement[] = [];
    for (let wait = 0; wait < 20; wait++) {
      await new Promise(r => setTimeout(r, 150));
      pageElements = Array.from(document.querySelectorAll('[id^="jh-midterm-generator-page"]')) as HTMLElement[];
      if (pageElements.length > 0) break;
    }

    if (pageElements.length === 0) {
      throw new Error('Element render layout PDF tidak ditemukan.');
    }

    // 1. Generate PDF
    toast.loading(`Menghasilkan file PDF ${student.name}...`, { id: `pub-${student.id}` });
    const pdfBlob = await generateMidtermPdfBlob(pageElements);
    const fileName = normalizeMidtermFilename(selectedClass.name, student.name, midtermTerm, academicYear);
    const pdfBase64 = await blobToBase64(pdfBlob);

    // 2. Upload to Google Drive (Shared Drive hierarchy: Tahun Ajaran > Semester > Midterm > Kelas) via backend Service Account
    toast.loading(`Mengunggah PDF ${student.name} ke Google Shared Drive...`, { id: `pub-${student.id}` });
    
    let driveFileId = '';
    let driveFileUrl = '';
    let targetClassFolderId = JUNIOR_HIGH_MIDTERM_ROOT_FOLDER_ID;

    try {
      const uploadRes = await fetch('/api/junior-high/midterm/upload-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          pdfBase64,
          fileName,
          academicYear,
          semester,
          midtermTerm,
          className: selectedClass.name
        })
      });

      const uploadData = await uploadRes.json();

      if (!uploadRes.ok || !uploadData.success) {
        const errorDetail = uploadData?.error || `Upload Google Drive gagal dengan status ${uploadRes.status}`;
        throw new Error(errorDetail);
      }

      driveFileId = uploadData.driveFileId;
      driveFileUrl = uploadData.driveFileUrl;
      targetClassFolderId = uploadData.folderId || JUNIOR_HIGH_MIDTERM_ROOT_FOLDER_ID;
    } catch (uploadErr: any) {
      console.error('[CRITICAL] Upload PDF to Shared Drive failed:', uploadErr);
      throw new Error(uploadErr.message || 'Upload ke Google Shared Drive gagal.');
    }

    // 3. Compute version & build snapshot
    const version = await getNextMidtermReportVersion(
      student.id,
      selectedClass.id,
      academicYear,
      semester,
      midtermTerm
    );

    const snapshot = buildLiveSnapshot(student);

    // 4. Save Published Report ONLY after successful Google Drive upload
    toast.loading(`Menyimpan metadata publikasi ke database...`, { id: `pub-${student.id}` });
    await savePublishedMidtermReport({
      id: '',
      unit: 'JUNIOR_HIGH',
      reportType: 'MIDTERM_REPORT',
      studentId: student.id,
      studentNameSnapshot: student.name,
      nisnSnapshot: student.nisn || (student as any).nis || '-',
      classId: selectedClass.id,
      classNameSnapshot: selectedClass.name,
      gradeSnapshot: student.grade || 7,
      academicYear,
      semester,
      midtermTerm,
      version,
      driveFolderId: targetClassFolderId,
      driveFileId,
      driveFileUrl,
      fileName,
      reportSnapshot: snapshot,
      generatedBy: currentUser.uid,
      generatedByName: currentUser.displayName || (currentUser as any).name || 'Guru',
      generatedAt: Date.now()
    });

    toast.success(`Rapor ${student.name} (v${version}) berhasil diterbitkan!`, { id: `pub-${student.id}` });
  };

  const handlePublishSingle = async (student: Student) => {
    if (!canPublish) {
      toast.error('Anda tidak memiliki hak akses untuk mempublikasikan rapor ini.');
      return;
    }

    if (!isDatesValid) {
      toast.error('Lengkapi Tanggal Titimangsa dan Tanggal Cut Off Kehadiran terlebih dahulu.');
      return;
    }

    const sData = studentDataMap[student.id];
    const published = publishedReportsMap[student.id];
    const evalStatus = evaluateStudentMidtermStatus(student, masterGoalsMap, sData, false);

    if (!evalStatus.isReady) {
      toast.error(`Rapor belum lengkap: ${evalStatus.issues[0] || 'Periksa learning goals & comments.'}`);
      return;
    }

    // Enforce General Comments must be APPROVED
    const reviewStatus = sData?.generalCommentReviewStatus || 'DRAFT';
    if (reviewStatus !== 'APPROVED') {
      toast.error(`Rapor ${student.name} tidak dapat dipublish karena General Comments belum disetujui Kepala Sekolah (Status saat ini: ${reviewStatus.replace(/_/g, ' ')}).`);
      return;
    }

    if (published) {
      if (!window.confirm(`Rapor ${student.name} sudah pernah terbit (${published.fileName}). Apakah Anda ingin menerbitkan revisi baru (v${published.version + 1})?`)) {
        return;
      }
    }

    setPublishingStudentId(student.id);
    try {
      await executePublishStudent(student);
      await onRefreshData();
    } catch (err: any) {
      console.error(err);
      toast.error('Gagal mempublikasikan rapor: ' + (err.message || 'Error'), { id: `pub-${student.id}` });
    } finally {
      setPublishingStudentId(null);
      setActiveGeneratingStudent(null);
    }
  };

  const handleBulkPublishReady = async () => {
    if (!canPublish) return;

    if (!isDatesValid) {
      toast.error('Lengkapi Tanggal Titimangsa dan Tanggal Cut Off Kehadiran terlebih dahulu.');
      return;
    }

    const readyStudents = safeStudents.filter(student => {
      if (!student || !student.id) return false;
      const sData = safeStudentDataMap[student.id];
      const published = safePublishedReportsMap[student.id];
      if (published) return false; // skip already published in bulk
      const evalStatus = evaluateStudentMidtermStatus(student, safeMasterGoalsMap, sData, false);
      const reviewStatus = sData?.generalCommentReviewStatus || 'DRAFT';
      return evalStatus.isReady && reviewStatus === 'APPROVED';
    });

    if (readyStudents.length === 0) {
      toast.info('Tidak ada siswa dengan status SIAP TERBIT.');
      return;
    }

    if (!window.confirm(`Terbitkan rapor untuk ${readyStudents.length} siswa yang sudah SIAP TERBIT?`)) {
      return;
    }

    setBulkPublishing(true);
    setPublishProgress({ current: 0, total: readyStudents.length });

    let successCount = 0;
    for (let i = 0; i < readyStudents.length; i++) {
      const st = readyStudents[i];
      setPublishProgress({ current: i + 1, total: readyStudents.length });
      try {
        await executePublishStudent(st);
        successCount++;
      } catch (err) {
        console.error(`Error bulk publishing ${st.name}:`, err);
      }
    }

    setBulkPublishing(false);
    setPublishProgress(null);
    setActiveGeneratingStudent(null);
    await onRefreshData();
    toast.success(`Selesai mempublikasikan ${successCount} dari ${readyStudents.length} rapor siswa.`);
  };

  return (
    <div className="space-y-6">
      {/* Date configurations validation error notice */}
      {!isDatesValid && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-xs text-rose-950 font-bold shadow-sm">
          <AlertCircle size={18} className="text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p>Lengkapi Tanggal Titimangsa dan Tanggal Cut Off Kehadiran terlebih dahulu.</p>
            {cutoffDateRaw && signingDateRaw && cutoffDateRaw > signingDateRaw && (
              <p className="text-[10px] text-rose-700 font-medium normal-case">
                Peringatan: Tanggal Cut Off Kehadiran ({attendanceCutoffDate}) tidak boleh melewati Tanggal Titimangsa ({reportSigningDate}).
              </p>
            )}
          </div>
        </div>
      )}

      {/* Top Banner & Permission Notice */}
      {!canPublish && (
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2.5 text-xs text-amber-900 font-medium">
          <Lock size={16} className="text-amber-600 shrink-0" />
          <span>
            Hanya <strong>Wali Kelas</strong> dari kelas ini atau <strong>Kepala Sekolah / Super Admin / Sekretaris</strong> yang dapat mempublikasikan rapor. Anda dapat melihat status dan pratinjau.
          </span>
        </div>
      )}

      {/* Filter Bar & Bulk Actions */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          {(['ALL', 'READY', 'PUBLISHED', 'DRAFT'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setFilterStatus(tab)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                filterStatus === tab
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab === 'ALL' && `Semua (${safeStudents.length})`}
              {tab === 'READY' && 'Siap Terbit'}
              {tab === 'PUBLISHED' && 'Sudah Terbit'}
              {tab === 'DRAFT' && 'Draft (Belum Lengkap)'}
            </button>
          ))}
        </div>

        {/* Search & Bulk Publish Button */}
        <div className="flex items-center gap-3">
          <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari siswa/NISN..."
              className="text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 w-44"
          />

          {canPublish && (
            <button
              onClick={handleBulkPublishReady}
              disabled={bulkPublishing || !isDatesValid}
              className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 hover:bg-emerald-700 transition-all shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <Upload size={14} />
              {bulkPublishing
                ? `Menerbitkan (${publishProgress?.current}/${publishProgress?.total})...`
                : 'Publish Semua yang Siap'}
            </button>
          )}
        </div>
      </div>

      {/* Table of Students & Readiness Status */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                <th className="p-3.5 w-12 text-center">No</th>
                <th className="p-3.5 w-52">Nama Siswa</th>
                <th className="p-3.5 w-28">NISN</th>
                <th className="p-3.5 w-40 text-center">Learning Goals</th>
                <th className="p-3.5 w-36 text-center">General Comments</th>
                <th className="p-3.5 w-32 text-center">Status Rapor</th>
                <th className="p-3.5 w-52 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    Tidak ada siswa yang sesuai dengan filter.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student, idx) => {
                  const sData = studentDataMap[student.id];
                  const published = publishedReportsMap[student.id];
                  const isPublished = Boolean(published);
                  const evalStatus = evaluateStudentMidtermStatus(student, masterGoalsMap, sData, isPublished);
                  const isPublishing = publishingStudentId === student.id;

                  const gc = sData?.generalComment;
                  const hasFinalComment = Boolean(gc?.finalComment?.trim());

                  return (
                    <tr key={student.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-3.5 text-center font-bold text-slate-400">{idx + 1}</td>
                      <td className="p-3.5">
                        <div className="font-bold text-slate-900 uppercase">{student.name}</div>
                        {published && (
                          <div className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1 mt-0.5">
                            <Check size={11} /> Terbit: v{published.version} ({new Date(published.generatedAt).toLocaleDateString('id-ID')})
                          </div>
                        )}
                      </td>
                      <td className="p-3.5 font-medium text-slate-500">
                        {student.nisn || (student as any).nis || '-'}
                      </td>

                      {/* Learning Goals Column */}
                      <td className="p-3.5 text-center">
                        {isPublished ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg">
                            <CheckCircle2 size={12} /> Lengkap
                          </span>
                        ) : (Array.isArray(evalStatus?.missingGoalsSubjects) && evalStatus.missingGoalsSubjects.length > 0) ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-lg" title={`Belum ada goal di: ${evalStatus.missingGoalsSubjects.join(', ')}`}>
                            <AlertCircle size={12} /> {evalStatus.missingGoalsSubjects.length} Mapel Kosong
                          </span>
                        ) : (evalStatus?.totalGoals ?? 0) === 0 ? (
                          <span className="text-[10px] text-slate-400 font-medium">Belum ada goal</span>
                        ) : evalStatus?.completedGoals === evalStatus?.totalGoals ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg">
                            <CheckCircle2 size={12} /> {evalStatus?.completedGoals ?? 0}/{evalStatus?.totalGoals ?? 0} Remark
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-lg">
                            {evalStatus?.completedGoals ?? 0}/{evalStatus?.totalGoals ?? 0} Terisi
                          </span>
                        )}
                      </td>

                      {/* General Comments Column */}
                      <td className="p-3.5 text-center">
                        {isPublished ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg">
                            <CheckCircle2 size={12} /> Final
                          </span>
                        ) : gc?.isFinal ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg">
                            <CheckCircle2 size={12} /> Final
                          </span>
                        ) : hasFinalComment ? (
                          <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg">
                            Draf Ada
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-lg">
                            Belum Ada
                          </span>
                        )}
                      </td>

                      {/* Status Rapor Column */}
                      <td className="p-3.5 text-center">
                        {isPublished ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 shadow-xs">
                            <CheckCircle2 size={12} /> TERBIT v{published.version}
                          </span>
                        ) : evalStatus.isReady ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-100 text-blue-800 shadow-xs">
                            SIAP TERBIT
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 shadow-xs">
                            BELUM LENGKAP
                          </span>
                        )}
                      </td>

                      {/* Actions Column */}
                      <td className="p-3.5 text-right space-x-2">
                        <button
                          onClick={() => handleOpenPreview(student)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold transition-all cursor-pointer"
                          title="Pratinjau Rapor PDF"
                        >
                          <Eye size={13} />
                          Preview
                        </button>

                        {canPublish && (
                          <button
                            onClick={() => handlePublishSingle(student)}
                            disabled={isPublishing || (!isPublished && !evalStatus.isReady) || !isDatesValid}
                            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-xs cursor-pointer ${
                              !isDatesValid
                                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                : isPublished
                                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                                : evalStatus.isReady
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                            }`}
                            title={
                              !isDatesValid
                                ? 'Lengkapi Tanggal Titimangsa dan Tanggal Cut Off Kehadiran terlebih dahulu'
                                : isPublished
                                ? 'Terbitkan revisi baru (v+1)'
                                : evalStatus.isReady
                                ? 'Publish rapor ke Google Drive & Orang Tua'
                                : 'Belum dapat dipublish karena data belum lengkap'
                            }
                          >
                            <Upload size={13} className={isPublishing ? 'animate-spin' : ''} />
                            {isPublishing ? 'Menerbitkan...' : isPublished ? 'Revisi (v+1)' : 'Publish'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL PREVIEW PDF */}
      {previewStudent && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-700">
            {/* Modal Header */}
            <div className="p-4 px-6 border-b border-slate-800 flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <FileText className="text-emerald-400" size={20} />
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider">
                    Pratinjau Rapor Midterm — {previewStudent.name}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {previewSnapshot ? 'Mode Dokumen Snapshot Resmi' : 'Mode Live Preview'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  setPreviewStudent(null);
                  setPreviewSnapshot(null);
                  setIsPreviewReady(false);
                }}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content / Printable Template Preview */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-800 flex justify-center">
              <MidtermPdfTemplate
                key={`preview-${previewStudent.id}-${previewSnapshot?.publishedAt || previewSnapshot?.id || 'live'}`}
                snapshot={previewSnapshot || undefined}
                student={previewStudent}
                currentClass={selectedClass || undefined}
                academicYear={academicYear}
                semester={semester}
                midtermTerm={midtermTerm}
                masterGoalsMap={masterGoalsMap}
                studentDataDoc={studentDataMap[previewStudent.id]}
                attendance={previewSnapshot ? {
                  sakit: previewSnapshot.attendance?.sakit ?? 0,
                  izin: previewSnapshot.attendance?.izin ?? 0,
                  tanpaKeterangan: previewSnapshot.attendance?.tanpaKeterangan ?? 0
                } : {
                  sakit: cutoffAttendanceMap[previewStudent.id]?.sickLeave ?? studentAttendanceMap[previewStudent.id]?.sickLeave ?? 0,
                  izin: cutoffAttendanceMap[previewStudent.id]?.excusedLeave ?? studentAttendanceMap[previewStudent.id]?.excusedLeave ?? 0,
                  tanpaKeterangan: cutoffAttendanceMap[previewStudent.id]?.absent ?? studentAttendanceMap[previewStudent.id]?.absent ?? 0
                }}
                reportConfig={reportConfig}
                homeroomTeacherProfile={homeroomTeacherProfile || undefined}
                logoUrl={logoUrl}
                reportSigningLocation={reportSigningLocation}
                reportSigningDate={reportSigningDate}
                attendanceCutoffDate={attendanceCutoffDate}
                onReadyChange={handlePreviewReadyChange}
              />
            </div>

            {/* Modal Footer */}
            <div className="p-4 px-6 border-t border-slate-800 flex items-center justify-between bg-slate-900 text-white rounded-b-3xl">
              <span className="text-xs text-slate-400">
                Dokumen A4 resmi standar Lazuardi Junior High
              </span>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => window.print()}
                  disabled={!isPreviewReady}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all"
                >
                  <Download size={14} /> Cetak / Print
                </button>
                <button
                  onClick={() => {
                    setPreviewStudent(null);
                    setPreviewSnapshot(null);
                    setIsPreviewReady(false);
                  }}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold rounded-xl transition-all"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hidden container for off-screen html2canvas PDF rendering */}
      {activeGeneratingStudent && (
        <div style={{ position: 'fixed', left: '-9999px', top: '-9999px', zIndex: -100 }}>
          <MidtermPdfTemplate
            key={`generator-${activeGeneratingStudent.id}`}
            page1Id="jh-midterm-generator-page-1"
            page2Id="jh-midterm-generator-page-2"
            student={activeGeneratingStudent}
            currentClass={selectedClass || undefined}
            academicYear={academicYear}
            semester={semester}
            midtermTerm={midtermTerm}
            masterGoalsMap={masterGoalsMap}
            studentDataDoc={studentDataMap[activeGeneratingStudent.id]}
            attendance={{
              sakit: cutoffAttendanceMap[activeGeneratingStudent.id]?.sickLeave ?? studentAttendanceMap[activeGeneratingStudent.id]?.sickLeave ?? 0,
              izin: cutoffAttendanceMap[activeGeneratingStudent.id]?.excusedLeave ?? studentAttendanceMap[activeGeneratingStudent.id]?.excusedLeave ?? 0,
              tanpaKeterangan: cutoffAttendanceMap[activeGeneratingStudent.id]?.absent ?? studentAttendanceMap[activeGeneratingStudent.id]?.absent ?? 0
            }}
            reportConfig={reportConfig}
            homeroomTeacherProfile={homeroomTeacherProfile || undefined}
            logoUrl={logoUrl}
            reportSigningLocation={reportSigningLocation}
            reportSigningDate={reportSigningDate}
            attendanceCutoffDate={attendanceCutoffDate}
          />
        </div>
      )}
    </div>
  );
};
