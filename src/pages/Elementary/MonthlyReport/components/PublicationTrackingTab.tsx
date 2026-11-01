import * as React from 'react';
import {
  Eye, Download, Send, Undo2, CheckCircle2, AlertTriangle,
  Calendar, RefreshCw, FileText, Users, ShieldCheck, History, X
} from 'lucide-react';
import type {
  ElementaryMonthlyCurriculumDoc,
  ElementaryMonthlyStudentScoreDoc,
  ElementaryMonthlyProjectDoc,
  ElementaryMonthlyStudentPhotoDoc,
  ElementaryMonthlyStudentNarrativeDoc,
  ElementaryMonthlyAttendanceConfig,
  PublishedElementaryMonthlyReportDoc,
  ElementaryMonthlyReportSignatory
} from '../../../../types/elementaryMonthlyReport';
import { validateElementaryMonthlyPublishEligibility } from '../../../../types/elementaryMonthlyReport';
import {
  calculateStudentAttendanceSummary,
  fetchElementaryMonthlyAttendanceConfig,
  fetchPublishedElementaryMonthlyReports,
  fetchElementaryMonthlyProjectDoc,
  fetchElementaryMonthlyStudentPhotos,
  fetchElementaryMonthlyStudentNarratives,
  fetchElementaryMonthlyReportConfiguration,
  fetchElementaryMonthlyPublicationHistory,
  getPendingElementaryMonthlyPublication,
  hasElementaryMonthlyPublishedPdf,
  publishElementaryMonthlyReport,
  sendElementaryMonthlyReportToPortal,
  revokeElementaryMonthlyReportAccess,
  ElementaryMonthlyPublicationError
} from '../../../../services/elementaryMonthlyReportService';
import type { Student, Class, User } from '../../../../types';
import { MonthlyReportPreviewModal } from './MonthlyReportPreviewModal';
import { AttendanceConfigModal } from './AttendanceConfigModal';
import { toast } from 'sonner';

interface PublicationTrackingTabProps {
  curriculumDoc: ElementaryMonthlyCurriculumDoc | null;
  studentScoresMap: Record<string, ElementaryMonthlyStudentScoreDoc>;
  students: Student[];
  selectedClass: Class | null;
  selectedYear: string;
  selectedSemester: string;
  selectedMonth: string;
  monthLabel: string;
  currentUser: User;
  onRefreshData?: () => void;
}

const EMPTY_SIGNATORY: ElementaryMonthlyReportSignatory = {
  principalName: '', principalTitle: '', principalNiy: '', principalSignatureUrl: null,
  homeroomTeacherId: '', homeroomTeacherName: '', homeroomTeacherNiy: '', homeroomTeacherSignatureUrl: null,
  signingDate: '', signingLocation: ''
};

export const PublicationTrackingTab: React.FC<PublicationTrackingTabProps> = ({
  curriculumDoc, studentScoresMap, students, selectedClass,
  selectedYear, selectedSemester, selectedMonth, monthLabel, currentUser, onRefreshData
}) => {
  const [attendanceConfig, setAttendanceConfig] = React.useState<ElementaryMonthlyAttendanceConfig | null>(null);
  const [publishedReportsMap, setPublishedReportsMap] = React.useState<Record<string, PublishedElementaryMonthlyReportDoc>>({});
  const [loadingPublishData, setLoadingPublishData] = React.useState(false);
  const [loadError, setLoadError] = React.useState('');
  const [projectDoc, setProjectDoc] = React.useState<ElementaryMonthlyProjectDoc | null>(null);
  const [photosMap, setPhotosMap] = React.useState<Record<string, ElementaryMonthlyStudentPhotoDoc>>({});
  const [narrativesMap, setNarrativesMap] = React.useState<Record<string, ElementaryMonthlyStudentNarrativeDoc>>({});
  const [configuredSignatory, setConfiguredSignatory] = React.useState<ElementaryMonthlyReportSignatory>(EMPTY_SIGNATORY);
  const [logoUrl, setLogoUrl] = React.useState<string | null>(null);
  const [configurationIssues, setConfigurationIssues] = React.useState<string[]>([]);
  const [pendingOperations, setPendingOperations] = React.useState<Record<string, string>>({});
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = React.useState(false);
  const [previewStudent, setPreviewStudent] = React.useState<Student | null>(null);
  const [previewVersion, setPreviewVersion] = React.useState<PublishedElementaryMonthlyReportDoc | null>(null);
  const [historyStudent, setHistoryStudent] = React.useState<Student | null>(null);
  const [historyReports, setHistoryReports] = React.useState<PublishedElementaryMonthlyReportDoc[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [processingStudentId, setProcessingStudentId] = React.useState<string | null>(null);
  const [processingMessage, setProcessingMessage] = React.useState('');
  const [isBatchProcessing, setIsBatchProcessing] = React.useState(false);
  const busyRef = React.useRef(false);
  const requestRef = React.useRef(0);
  const contextKey = JSON.stringify([selectedClass?.id, selectedYear, selectedSemester, selectedMonth]);
  const currentContextRef = React.useRef(contextKey);
  currentContextRef.current = contextKey;
  const busy = isBatchProcessing || processingStudentId !== null;

  const contextFor = React.useCallback((studentId: string) => ({
    classId: selectedClass?.id || '', studentId,
    academicYear: selectedYear, semester: selectedSemester, month: selectedMonth
  }), [selectedClass?.id, selectedYear, selectedSemester, selectedMonth]);

  const signatory = React.useMemo<ElementaryMonthlyReportSignatory>(() => ({
    ...configuredSignatory,
    signingDate: attendanceConfig?.signingDate || '',
    signingLocation: attendanceConfig?.signingLocation || ''
  }), [configuredSignatory, attendanceConfig]);

  React.useEffect(() => {
    const pending: Record<string, string> = {};
    for (const student of students) {
      const operationId = getPendingElementaryMonthlyPublication(contextFor(student.id));
      if (operationId) pending[student.id] = operationId;
    }
    setPendingOperations(pending);
  }, [students, contextFor, currentUser.uid]);

  const loadData = React.useCallback(async () => {
    const request = ++requestRef.current;
    if (!selectedClass || !selectedYear || !selectedSemester || !selectedMonth) return;
    setLoadingPublishData(true);
    setLoadError('');
    try {
      const [attConfig, reports, project, photos, narratives, configuration] = await Promise.all([
        fetchElementaryMonthlyAttendanceConfig(selectedClass.id, selectedYear, selectedSemester, selectedMonth),
        fetchPublishedElementaryMonthlyReports(selectedClass.id, selectedYear, selectedSemester, selectedMonth),
        fetchElementaryMonthlyProjectDoc(selectedClass.id, selectedYear, selectedSemester, selectedMonth),
        fetchElementaryMonthlyStudentPhotos(selectedClass.id, selectedYear, selectedSemester, selectedMonth),
        fetchElementaryMonthlyStudentNarratives(selectedClass.id, selectedYear, selectedSemester, selectedMonth),
        fetchElementaryMonthlyReportConfiguration(selectedClass)
      ]);
      if (request !== requestRef.current) return;
      setAttendanceConfig(attConfig);
      const latest: Record<string, PublishedElementaryMonthlyReportDoc> = {};
      for (const report of reports) {
        if (!latest[report.studentId] || report.version > latest[report.studentId].version) latest[report.studentId] = report;
      }
      setPublishedReportsMap(latest);
      setProjectDoc(project);
      setPhotosMap(photos);
      setNarrativesMap(narratives);
      setConfiguredSignatory(configuration.signatory);
      setLogoUrl(configuration.logoUrl);
      setConfigurationIssues(configuration.issues);
    } catch (error) {
      if (request !== requestRef.current) return;
      setConfiguredSignatory(EMPTY_SIGNATORY);
      setLogoUrl(null);
      setLoadError(error instanceof Error ? error.message : 'Gagal memuat data publikasi.');
      toast.error('Gagal memuat data publikasi. Segarkan sebelum menerbitkan rapor.');
    } finally {
      if (request === requestRef.current) setLoadingPublishData(false);
    }
  }, [selectedClass?.id, selectedYear, selectedSemester, selectedMonth]);

  React.useEffect(() => {
    setAttendanceConfig(null);
    setPublishedReportsMap({});
    setProjectDoc(null);
    setPhotosMap({});
    setNarrativesMap({});
    setConfiguredSignatory(EMPTY_SIGNATORY);
    setLogoUrl(null);
    setConfigurationIssues([]);
    setPreviewStudent(null);
    setPreviewVersion(null);
    setHistoryStudent(null);
    void loadData();
    return () => { requestRef.current++; };
  }, [loadData]);

  const studentEvaluations = React.useMemo(() => students.map(student => {
    const scoreDoc = studentScoresMap[student.id] || null;
    const narrativeDoc = narrativesMap[student.id] || null;
    const photoDoc = photosMap[student.id] || null;
    const attSummary = calculateStudentAttendanceSummary(attendanceConfig, student.id);
    const published = publishedReportsMap[student.id] || null;
    const validation = validateElementaryMonthlyPublishEligibility({
      student: { id: student.id, name: student.name }, curriculumDoc,
      studentScoreDoc: scoreDoc, narrativeDoc, projectDoc, photoDoc,
      attendanceSummary: attSummary, signatory, logoUrl
    });
    const extraReasons = [...configurationIssues];
    if (loadingPublishData) extraReasons.push('Data publikasi sedang dimuat.');
    if (loadError) extraReasons.push('Data publikasi belum berhasil dimuat.');
    if (extraReasons.length) {
      validation.isEligible = false;
      validation.blockingReasons.push(...extraReasons);
    }
    return { student, scoreDoc, narrativeDoc, photoDoc, attSummary, published, validation };
  }), [students, studentScoresMap, narrativesMap, photosMap, attendanceConfig,
    publishedReportsMap, curriculumDoc, projectDoc, signatory, logoUrl, configurationIssues, loadingPublishData, loadError]);

  const counters = React.useMemo(() => ({
    total: students.length,
    eligible: studentEvaluations.filter(item => item.validation.isEligible || pendingOperations[item.student.id]).length,
    published: studentEvaluations.filter(item => hasElementaryMonthlyPublishedPdf(item.published)).length,
    sent: studentEvaluations.filter(item => hasElementaryMonthlyPublishedPdf(item.published) && item.published?.deliveryStatus === 'SENT').length,
    opened: studentEvaluations.filter(item => hasElementaryMonthlyPublishedPdf(item.published) && item.published?.isOpened).length
  }), [studentEvaluations, students.length, pendingOperations]);

  const publishItem = async (item: (typeof studentEvaluations)[number], startedContext: string) => {
    const studentId = item.student.id;
    if (!selectedClass) throw new Error('Pilih kelas terlebih dahulu.');
    if (currentContextRef.current === startedContext) setProcessingStudentId(studentId);
    try {
      const published = await publishElementaryMonthlyReport({
        student: item.student, classId: selectedClass.id, className: selectedClass.name,
        gradeLevel: Number(selectedClass.grade), academicYear: selectedYear,
        semester: selectedSemester, month: selectedMonth, curriculumDoc,
        studentScoreDoc: item.scoreDoc, projectDoc, photoDoc: item.photoDoc,
        narrativeDoc: item.narrativeDoc, attendanceConfig, signatory, currentUser,
        onProgress: message => {
          if (currentContextRef.current === startedContext) setProcessingMessage(message);
        }
      });
      if (currentContextRef.current === startedContext) {
        setPublishedReportsMap(previous => ({ ...previous, [studentId]: published }));
        setPendingOperations(previous => {
          const next = { ...previous }; delete next[studentId]; return next;
        });
      }
      return published;
    } catch (error) {
      if (currentContextRef.current === startedContext) {
        const pending = getPendingElementaryMonthlyPublication(contextFor(studentId));
        setPendingOperations(previous => {
          const next = { ...previous };
          if (pending) next[studentId] = pending;
          else delete next[studentId];
          return next;
        });
      }
      throw error;
    }
  };

  const handlePublishSingle = async (student: Student) => {
    if (busyRef.current) return;
    const item = studentEvaluations.find(e => e.student.id === student.id);
    if (!item) return;
    if (!item.validation.isEligible && !pendingOperations[student.id]) {
      toast.error(item.validation.blockingReasons.join(' '));
      return;
    }
    busyRef.current = true;
    const startedContext = contextKey;
    try {
      const report = await publishItem(item, startedContext);
      toast.success(`PDF ${student.name} dan metadata terbit telah dikonfirmasi (v${report.version}).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Publikasi gagal.';
      if (error instanceof ElementaryMonthlyPublicationError && error.partialUpload) toast.warning(message, { duration: 12000 });
      else toast.error(message, { duration: 9000 });
    } finally {
      busyRef.current = false;
      setProcessingStudentId(null);
      setProcessingMessage('');
    }
  };

  const handleBatchPublish = async () => {
    if (busyRef.current) return;
    const eligible = studentEvaluations.filter(item => item.validation.isEligible || pendingOperations[item.student.id]);
    if (!eligible.length) return;
    if (!window.confirm(`Terbitkan atau pulihkan ${eligible.length} rapor? PDF dan metadata harus selesai sebelum status Terbit diberikan. Pengiriman portal tetap terpisah.`)) return;
    busyRef.current = true;
    setIsBatchProcessing(true);
    const startedContext = contextKey;
    let successCount = 0;
    const failures: string[] = [];
    try {
      for (const item of eligible) {
        try {
          await publishItem(item, startedContext);
          successCount++;
        } catch (error) {
          failures.push(`${item.student.name}: ${error instanceof Error ? error.message : 'Publikasi gagal'}`);
        }
      }
      if (failures.length) {
        toast.warning(`${successCount} selesai, ${failures.length} gagal atau menunggu pemulihan. ${failures[0]}`, { duration: 12000 });
      } else toast.success(`${successCount} PDF dan metadata terbit telah dikonfirmasi.`);
    } finally {
      busyRef.current = false;
      setIsBatchProcessing(false);
      setProcessingStudentId(null);
      setProcessingMessage('');
    }
  };

  const handleSendToPortal = async (reportId: string, studentName: string) => {
    if (busyRef.current) return;
    const report = Object.values<PublishedElementaryMonthlyReportDoc>(publishedReportsMap).find(item => item.id === reportId);
    if (!hasElementaryMonthlyPublishedPdf(report)) return;
    busyRef.current = true;
    setProcessingStudentId(report!.studentId);
    setProcessingMessage('Mengirim ke portal');
    const startedContext = contextKey;
    try {
      await sendElementaryMonthlyReportToPortal(reportId, currentUser, report!.version);
      if (currentContextRef.current === startedContext) await loadData();
      toast.success(`Rapor ${studentName} v${report!.version} dikirim ke portal.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal mengirim rapor ke portal.');
    } finally {
      busyRef.current = false;
      setProcessingStudentId(null);
      setProcessingMessage('');
    }
  };

  const handleRevokePortal = async (reportId: string, studentName: string) => {
    if (busyRef.current) return;
    if (!window.confirm(`Tarik akses portal untuk rapor ${studentName}?`)) return;
    busyRef.current = true;
    setIsBatchProcessing(true);
    const startedContext = contextKey;
    try {
      await revokeElementaryMonthlyReportAccess(reportId, currentUser);
      if (currentContextRef.current === startedContext) await loadData();
      toast.success(`Akses portal untuk rapor ${studentName} ditarik.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menarik akses portal.');
    } finally {
      busyRef.current = false;
      setIsBatchProcessing(false);
    }
  };

  const handleBatchSendToPortal = async () => {
    if (busyRef.current) return;
    const reports = Object.values<PublishedElementaryMonthlyReportDoc>(publishedReportsMap).filter(report => hasElementaryMonthlyPublishedPdf(report) && report.deliveryStatus !== 'SENT');
    if (!reports.length) { toast.info('Tidak ada PDF terbit yang menunggu pengiriman.'); return; }
    if (!window.confirm(`Kirim ${reports.length} rapor yang memiliki PDF terbit ke portal siswa & orang tua?`)) return;
    busyRef.current = true;
    setIsBatchProcessing(true);
    const startedContext = contextKey;
    let successCount = 0;
    try {
      for (const report of reports) {
        try {
          await sendElementaryMonthlyReportToPortal(report.id, currentUser, report.version);
          successCount++;
        } catch (error) {
          toast.error(`${report.studentNameSnapshot}: ${error instanceof Error ? error.message : 'Pengiriman gagal'}`);
        }
      }
      if (currentContextRef.current === startedContext) await loadData();
      if (successCount === reports.length) toast.success(`${successCount} rapor dikirim ke portal.`);
      else toast.warning(`${successCount} terkirim, ${reports.length - successCount} gagal.`);
    } finally {
      busyRef.current = false;
      setIsBatchProcessing(false);
    }
  };

  const handleHistory = async (student: Student) => {
    const startedContext = contextKey;
    setHistoryStudent(student);
    setHistoryReports([]);
    setHistoryLoading(true);
    try {
      const reports = await fetchElementaryMonthlyPublicationHistory(contextFor(student.id));
      if (currentContextRef.current === startedContext) setHistoryReports(reports);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Riwayat versi tidak dapat dimuat.');
    } finally {
      if (currentContextRef.current === startedContext) setHistoryLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {(loadError || configurationIssues.length > 0) && (
        <div role="alert" className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Konfigurasi publikasi perlu dilengkapi.</strong>
          {loadError && <p className="mt-1">{loadError}</p>}
          {configurationIssues.length > 0 && (
            <ul className="mt-1 list-disc pl-5">{configurationIssues.map(issue => <li key={issue}>{issue}</li>)}</ul>
          )}
          <p className="mt-1">Preview draft tetap tersedia. Publikasi memerlukan data dan konfigurasi yang tervalidasi.</p>
        </div>
      )}
      {busy && (
        <div role="status" aria-live="polite" className="border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          {processingMessage || 'Memproses operasi yang dipilih.'}
        </div>
      )}
      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Users size={20} />
          </div>
          <div>
            <div className="text-xl font-black text-slate-900">{counters.total}</div>
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Total Siswa</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <ShieldCheck size={20} />
          </div>
          <div>
            <div className="text-xl font-black text-emerald-700">{counters.eligible}</div>
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Siap / Pulihkan</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
            <FileText size={20} />
          </div>
          <div>
            <div className="text-xl font-black text-purple-700">{counters.published}</div>
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Terbit (PDF Drive)</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
            <Send size={20} />
          </div>
          <div>
            <div className="text-xl font-black text-indigo-700">{counters.sent}</div>
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              Terkirim ({counters.opened} Dilihat)
            </div>
          </div>
        </div>
      </div>

      {/* Attendance & Titimangsa Configuration Bar */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar size={14} className="text-blue-600" />
              <span>Presensi &amp; Titimangsa Periode {monthLabel}</span>
            </span>
            {attendanceConfig ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                Terkonfigurasi
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                Belum Diatur
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500">
            {attendanceConfig ? (
              <span>
                Periode: <strong>{attendanceConfig.startDate}</strong> s.d. <strong>{attendanceConfig.endDate}</strong> ({attendanceConfig.totalSchoolDays} hari efektif) · Titimangsa: <strong>{signatory.signingLocation}, {signatory.signingDate}</strong>
              </span>
            ) : (
              <span>Tentukan tanggal mulai/selesai presensi, hari efektif, dan titimangsa sebelum menerbitkan rapor.</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setIsAttendanceModalOpen(true)}
            className="px-3.5 py-2 text-xs font-bold rounded-xl border border-blue-300 bg-blue-50/70 hover:bg-blue-100 text-blue-700 shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Calendar size={14} />
            <span>Atur Presensi &amp; Titimangsa</span>
          </button>
        </div>
      </div>

      {/* Batch Operations Bar */}
      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="text-xs text-slate-600">
          <span className="font-bold text-slate-900">Operasi Massal Kelas:</span> Publikasi membuat PDF Drive dan snapshot berversi. Tombol Pulihkan melanjutkan operasi yang sama. Pengiriman ke portal dilakukan terpisah.
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleBatchPublish}
            disabled={busy || counters.eligible === 0}
            className="px-3.5 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
          >
            <ShieldCheck size={14} />
            <span>Terbitkan / Pulihkan ({counters.eligible})</span>
          </button>

          <button
            type="button"
            onClick={handleBatchSendToPortal}
            disabled={busy || counters.published === 0}
            className="px-3.5 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
          >
            <Send size={14} />
            <span>Kirim Terbit ke Portal</span>
          </button>
        </div>
      </div>

      {/* Students Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <h2 className="text-sm font-bold text-slate-900">
            Daftar Publikasi &amp; Distribusi Siswa ({students.length})
          </h2>

          <button
            type="button"
            onClick={loadData}
            disabled={loadingPublishData || busy}
            className="text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw size={13} className={loadingPublishData ? 'animate-spin' : ''} />
            <span>Segarkan</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-3 w-10 text-center">No</th>
                <th className="py-3 px-3">Nama Siswa</th>
                <th className="py-3 px-3 text-center">LO Nilai</th>
                <th className="py-3 px-3 text-center">Narasi</th>
                <th className="py-3 px-3 text-center">Presensi</th>
                <th className="py-3 px-3 text-center">Status PDF</th>
                <th className="py-3 px-3 text-center">Portal Siswa</th>
                <th className="py-3 px-3 text-center">Tracking</th>
                <th className="py-3 px-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {studentEvaluations.map((item, idx) => {
                const { student: st, scoreDoc, narrativeDoc, attSummary, published, validation } = item;
                const isProcessing = processingStudentId === st.id;

                // LO Nilai Status
                let totalLo = 0;
                let filledLo = 0;
                for (const sub of curriculumDoc?.subjects || []) {
                  for (const lg of sub.learningGoals || []) {
                    for (const lo of lg.learningObjectives || []) {
                      totalLo++;
                      const sc = scoreDoc?.scores?.[lo.id];
                      if (typeof sc === 'number' && Number.isFinite(sc) && sc >= 0 && sc <= 100) filledLo++;
                    }
                  }
                }
                const isLoComplete = totalLo > 0 && filledLo === totalLo;

                // Narrative Status
                const isNarApproved = narrativeDoc?.reviewStatus === 'APPROVED' && !validation.blockingReasons.some(reason => /usang|stale|narasi|Academic Comments|Social Emotional/i.test(reason));

                return (
                  <tr key={st.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-3 text-center text-slate-400 font-semibold">{idx + 1}</td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900">{st.name}</div>
                      <div className="text-[10px] text-slate-500">NISN: {(st as any).nisn || (st as any).nis || '-'}</div>
                      {!validation.isEligible && (
                        <details className="mt-1 text-[10px] text-amber-800 max-w-sm">
                          <summary className="cursor-pointer">Syarat belum lengkap</summary>
                          <ul className="list-disc pl-4 whitespace-normal">
                            {validation.blockingReasons.map((reason, reasonIndex) => <li key={`${reasonIndex}-${reason}`}>{reason}</li>)}
                          </ul>
                        </details>
                      )}
                    </td>

                    {/* LO Score Status */}
                    <td className="py-3 px-3 text-center">
                      {isLoComplete ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                          <CheckCircle2 size={11} />
                          <span>Lengkap</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full" title={`${filledLo} dari ${totalLo} terisi`}>
                          <span>{filledLo}/{totalLo}</span>
                        </span>
                      )}
                    </td>

                    {/* Narrative Status */}
                    <td className="py-3 px-3 text-center">
                      {isNarApproved ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                          <CheckCircle2 size={11} />
                          <span>Approved</span>
                        </span>
                      ) : narrativeDoc?.isSourceStale ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded-full" title="Nilai berubah setelah approved">
                          <AlertTriangle size={11} />
                          <span>Stale</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                          <span>{narrativeDoc?.reviewStatus || 'Draft'}</span>
                        </span>
                      )}
                    </td>

                    {/* Attendance */}
                    <td className="py-3 px-3 text-center">
                      {attSummary.isAvailable ? (
                        <div className="text-[11px] font-bold text-slate-800">
                          {attSummary.percentage}%
                          <div className="text-[9.5px] font-normal text-slate-500">{attSummary.presentDays}/{attSummary.totalDays}h</div>
                        </div>
                      ) : (
                        <span className="text-[10px] text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded-full">
                          Kosong
                        </span>
                      )}
                    </td>

                    {/* Published Snapshot Status */}
                    <td className="py-3 px-3 text-center">
                      {hasElementaryMonthlyPublishedPdf(published) ? (
                        <div>
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
                            <span>v{published.version} Terbit</span>
                          </span>
                          <div className="text-[9px] text-slate-400 mt-0.5">
                            {new Date(published.generatedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                          </div>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-semibold">
                          {published ? (published.driveFileId || published.driveFileUrl || published.fileName || published.driveFolderId ? `v${published.version}; PDF belum terverifikasi` : `Snapshot lama v${published.version}; PDF belum tersedia`) : 'Belum Terbit'}
                        </span>
                      )}
                      {pendingOperations[st.id] && <div className="text-[10px] font-semibold text-amber-700 mt-1">Operasi perlu dipulihkan</div>}
                    </td>

                    {/* Portal Delivery */}
                    <td className="py-3 px-3 text-center">
                      {published?.deliveryStatus === 'SENT' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                          <CheckCircle2 size={11} />
                          <span>Terkirim</span>
                        </span>
                      ) : published?.deliveryStatus === 'REVOKED' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
                          <span>Ditarik</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">Belum Kirim</span>
                      )}
                    </td>

                    {/* Tracking */}
                    <td className="py-3 px-3 text-center">
                      {published?.isOpened ? (
                        <div className="text-[10.5px] font-bold text-indigo-700">
                          {published.openCount}x Dibuka
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400">-</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Preview Internal Button (always accessible) */}
                        <button
                          type="button"
                          onClick={() => { setPreviewVersion(null); setPreviewStudent(st); }}
                          className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
                          title="Preview Internal"
                        >
                          <Eye size={12} />
                          <span>Preview</span>
                        </button>
                        {published && (
                          <button type="button" onClick={() => { void handleHistory(st); }} title="Riwayat versi terbit"
                            className="p-1.5 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">
                            <History size={13} />
                          </button>
                        )}
                        {hasElementaryMonthlyPublishedPdf(published) && (
                          <a href={published!.driveFileUrl} target="_blank" rel="noopener noreferrer" title={`Buka PDF asli v${published!.version} di Drive`}
                            className="p-1.5 border border-slate-300 rounded-lg text-blue-700 hover:bg-blue-50">
                            <Download size={13} />
                          </a>
                        )}

                        {/* Publish Snapshot Button */}
                        <button
                          type="button"
                          onClick={() => handlePublishSingle(st)}
                          disabled={busy || (!validation.isEligible && !pendingOperations[st.id])}
                          className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                          title={pendingOperations[st.id] ? 'Pulihkan operasi yang sama tanpa membuat PDF ganda' : validation.isEligible ? 'Validasi, buat PDF, unggah ke Drive, lalu simpan metadata' : validation.blockingReasons.join('\n')}
                        >
                          <ShieldCheck size={12} />
                          <span>{isProcessing ? 'Memproses' : pendingOperations[st.id] ? 'Pulihkan' : published ? 'Terbitkan Versi' : 'Publish PDF'}</span>
                        </button>

                        {/* Send / Revoke Portal Button */}
                        {published && (hasElementaryMonthlyPublishedPdf(published) || published.deliveryStatus === 'SENT') ? (
                          published.deliveryStatus === 'SENT' ? (
                            <button
                              type="button"
                              onClick={() => handleRevokePortal(published.id, st.name)}
                              disabled={busy}
                              className="px-2 py-1 text-[11px] font-bold rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 transition-colors cursor-pointer"
                              title="Tarik Akses Portal"
                            >
                              <Undo2 size={12} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSendToPortal(published.id, st.name)}
                              disabled={busy || !hasElementaryMonthlyPublishedPdf(published)}
                              className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors flex items-center gap-1 cursor-pointer"
                              title="Kirim ke Portal Siswa & Orang Tua"
                            >
                              <Send size={12} />
                              <span>Kirim</span>
                            </button>
                          )
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {historyStudent && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Riwayat versi rapor">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="font-bold">Riwayat rapor — {historyStudent.name}</h3>
              <button type="button" onClick={() => setHistoryStudent(null)} aria-label="Tutup riwayat"><X size={20} /></button>
            </div>
            {historyLoading ? <p>Memuat versi terbit.</p> : historyReports.length === 0 ? <p>Belum ada riwayat versi yang tersimpan.</p> : (
              <div className="space-y-3">
                {historyReports.map(report => (
                  <div key={`${report.id}-${report.version}`} className="border border-slate-200 p-3 flex flex-wrap justify-between items-center gap-3">
                    <div>
                      <div className="font-semibold">Versi {report.version} · {new Date(report.generatedAt).toLocaleString('id-ID')}</div>
                      <div className="text-xs text-slate-500">{report.fileName || (report.driveFileId || report.driveFileUrl || report.driveFolderId ? 'PDF belum terverifikasi' : 'Snapshot lama; PDF tidak tercatat')}</div>
                      {report.fileName && !hasElementaryMonthlyPublishedPdf(report) && <div className="text-xs text-amber-700">PDF belum terverifikasi</div>}
                      <div className="text-xs text-slate-500">{report.generatedByName || ''}</div>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <button type="button" className="text-blue-700 font-semibold" onClick={() => {
                        setPreviewVersion(report); setPreviewStudent(historyStudent); setHistoryStudent(null);
                      }}>Lihat versi</button>
                      {hasElementaryMonthlyPublishedPdf(report) && (
                        <a href={report.driveFileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-700 font-semibold">PDF asli</a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Attendance Config Modal */}
      {isAttendanceModalOpen && (
        <AttendanceConfigModal
          isOpen={isAttendanceModalOpen}
          onClose={() => setIsAttendanceModalOpen(false)}
          selectedClassId={selectedClass?.id || ''}
          selectedClassName={selectedClass?.name || ''}
          selectedYear={selectedYear}
          selectedSemester={selectedSemester}
          selectedMonth={selectedMonth}
          monthLabel={monthLabel}
          students={students}
          currentConfig={attendanceConfig}
          currentUser={currentUser}
          onSaved={() => { void loadData(); onRefreshData?.(); }}
        />
      )}

      {/* Preview Modal */}
      {previewStudent && (
        <MonthlyReportPreviewModal
          isOpen={!!previewStudent}
          onClose={() => { setPreviewStudent(null); setPreviewVersion(null); }}
          student={previewStudent}
          allStudents={students}
          onSelectStudent={(st) => { setPreviewVersion(null); setPreviewStudent(st); }}
          classInfo={selectedClass}
          academicYear={selectedYear}
          semester={selectedSemester}
          month={selectedMonth}
          monthLabel={monthLabel}
          curriculumDoc={curriculumDoc}
          studentScoresMap={studentScoresMap[previewStudent.id]?.scores || {}}
          narrativeDoc={narrativesMap[previewStudent.id] || null}
          projectDoc={projectDoc}
          photoDoc={photosMap[previewStudent.id] || null}
          attendanceSummary={calculateStudentAttendanceSummary(attendanceConfig, previewStudent.id)}
          signatory={signatory}
          logoUrl={logoUrl}
          publishedReport={previewVersion || publishedReportsMap[previewStudent.id] || null}
        />
      )}
    </div>
  );
};
