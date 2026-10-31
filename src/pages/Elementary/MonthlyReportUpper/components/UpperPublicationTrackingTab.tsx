import * as React from 'react';
import { 
  Eye, Download, Send, Undo2, CheckCircle2, AlertCircle, AlertTriangle, 
  Calendar, RefreshCw, FileText, Lock, Users, Sparkles, ShieldCheck, BarChart2 
} from 'lucide-react';
import type { 
  ElementaryUpperCurriculumDoc,
  ElementaryUpperStudentDataDoc,
  ElementaryUpperStudentNarrativesDoc,
  ElementaryUpperLitNumRecordDoc,
  ElementaryUpperLitNumClassConfigDoc,
  ElementaryUpperAttendanceConfig,
  PublishedElementaryUpperReportDoc,
  ElementaryUpperReportSignatory,
  ElementaryUpperReportKind
} from '../../../../types/elementaryMonthlyUpperReport';
import { 
  validateUpperMonthlyProgressPublishEligibility,
  validateUpperLiteracyNumeracyPublishEligibility,
  calculateUpperStudentAttendanceSummary,
  normalizeUpperReportFilename
} from '../../../../types/elementaryMonthlyUpperReport';
import { 
  fetchUpperAttendanceConfig,
  fetchPublishedUpperReports,
  publishUpperMonthlyProgressReport,
  publishUpperLiteracyNumeracyReport,
  sendUpperReportToPortal,
  revokeUpperReportAccess,
  fetchUpperLitNumClassConfig,
  fetchUpperStudentNarrativesMap
} from '../../../../services/elementaryMonthlyUpperReportService';
import type { Student, Class, User } from '../../../../types';
import { UpperMonthlyReportPreviewModal } from './UpperMonthlyReportPreviewModal';
import { UpperAttendanceConfigModal } from './UpperAttendanceConfigModal';
import { toast } from 'sonner';

interface UpperPublicationTrackingTabProps {
  curriculumDoc: ElementaryUpperCurriculumDoc | null;
  studentDataMap: Record<string, ElementaryUpperStudentDataDoc>;
  litNumRecordsMap: Record<string, ElementaryUpperLitNumRecordDoc>;
  students: Student[];
  selectedClass: Class | null;
  selectedYear: string;
  selectedSemester: string;
  selectedMonth: string;
  monthLabel: string;
  currentUser: User;
  onRefreshData?: () => void;
}

export const UpperPublicationTrackingTab: React.FC<UpperPublicationTrackingTabProps> = ({
  curriculumDoc,
  studentDataMap,
  litNumRecordsMap,
  students,
  selectedClass,
  selectedYear,
  selectedSemester,
  selectedMonth,
  monthLabel,
  currentUser,
  onRefreshData
}) => {
  const [attendanceConfig, setAttendanceConfig] = React.useState<ElementaryUpperAttendanceConfig | null>(null);
  const [classConfigDoc, setClassConfigDoc] = React.useState<ElementaryUpperLitNumClassConfigDoc | null>(null);
  const [narrativesMap, setNarrativesMap] = React.useState<Record<string, ElementaryUpperStudentNarrativesDoc>>({});
  const [publishedReportsList, setPublishedReportsList] = React.useState<PublishedElementaryUpperReportDoc[]>([]);
  const [loadingData, setLoadingData] = React.useState<boolean>(false);

  // Modals state
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = React.useState<boolean>(false);
  const [previewStudentId, setPreviewStudentId] = React.useState<string | null>(null);
  const [previewInitialKind, setPreviewInitialKind] = React.useState<ElementaryUpperReportKind>('MONTHLY_PROGRESS');

  // Processing state
  const [processingKey, setProcessingKey] = React.useState<string | null>(null);
  const [isBatchProcessing, setIsBatchProcessing] = React.useState<boolean>(false);

  // Signatory Profile
  const signatory: ElementaryUpperReportSignatory = React.useMemo(() => {
    return {
      principalName: 'Dewi Masyitoh, M.Pd.',
      principalTitle: 'Principal',
      principalNiy: '19820512',
      principalSignatureUrl: null,
      homeroomTeacherName: selectedClass?.homeroomTeacherName || currentUser.displayName || currentUser.name || 'Homeroom Teacher',
      homeroomTeacherNiy: (currentUser as any)?.niy || '',
      homeroomTeacherSignatureUrl: (currentUser as any)?.signatureUrl || null,
      signingDate: attendanceConfig?.signingDate || `${attendanceConfig?.endDate?.split('-')[2] || '31'} ${monthLabel}`,
      signingLocation: attendanceConfig?.signingLocation || 'Depok'
    };
  }, [selectedClass, currentUser, attendanceConfig, monthLabel]);

  // Load publication data
  const loadData = React.useCallback(async () => {
    if (!selectedClass || !selectedYear || !selectedSemester || !selectedMonth) return;
    setLoadingData(true);

    try {
      const [attConfig, cfgDoc, narratives, pubReports] = await Promise.all([
        fetchUpperAttendanceConfig(selectedClass.id, selectedYear, selectedSemester, selectedMonth),
        fetchUpperLitNumClassConfig(selectedClass.id, selectedYear),
        fetchUpperStudentNarrativesMap(selectedClass.id, selectedYear, selectedSemester, selectedMonth),
        fetchPublishedUpperReports(selectedClass.id, selectedYear, selectedSemester, selectedMonth)
      ]);

      setAttendanceConfig(attConfig);
      setClassConfigDoc(cfgDoc);
      setNarrativesMap(narratives);
      setPublishedReportsList(pubReports);
    } catch (err) {
      console.error('Error loading upper publication data:', err);
      toast.error('Gagal memuat status publikasi & tracking.');
    } finally {
      setLoadingData(false);
    }
  }, [selectedClass, selectedYear, selectedSemester, selectedMonth]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  // Published Map: key `${studentId}_${reportKind}` -> PublishedDoc
  const publishedMap = React.useMemo<Record<string, PublishedElementaryUpperReportDoc>>(() => {
    const map: Record<string, PublishedElementaryUpperReportDoc> = {};
    for (const r of publishedReportsList) {
      const key = `${r.studentId}_${r.reportKind}`;
      map[key] = r;
    }
    return map;
  }, [publishedReportsList]);

  // Evaluation for each student
  const evaluations = React.useMemo(() => {
    return students.map(st => {
      const stData = studentDataMap[st.id] || null;
      const narratives = narrativesMap[st.id] || null;
      const litRecord = litNumRecordsMap[st.id] || null;
      const attSummary = calculateUpperStudentAttendanceSummary(attendanceConfig, st.id);

      const monthlyProgressEval = validateUpperMonthlyProgressPublishEligibility({
        student: st,
        curriculumDoc,
        studentDataDoc: stData,
        narrativesDoc: narratives,
        attendanceSummary: attSummary,
        signatory
      });

      const litNumEval = validateUpperLiteracyNumeracyPublishEligibility({
        student: st,
        currentMonth: selectedMonth,
        classConfigDoc,
        litNumRecordDoc: litRecord,
        narrativesDoc: narratives,
        signatory
      });

      const publishedMonthly = publishedMap[`${st.id}_MONTHLY_PROGRESS`] || null;
      const publishedLitNum = publishedMap[`${st.id}_LITERACY_NUMERACY`] || null;

      return {
        student: st,
        studentDataDoc: stData,
        narrativesDoc: narratives,
        litNumRecordDoc: litRecord,
        attendanceSummary: attSummary,
        monthlyProgressEval,
        litNumEval,
        publishedMonthly,
        publishedLitNum
      };
    });
  }, [students, studentDataMap, narrativesMap, litNumRecordsMap, attendanceConfig, curriculumDoc, classConfigDoc, signatory, selectedMonth, publishedMap]);

  // Summary counts
  const summary = React.useMemo(() => {
    const total = students.length;
    let monthlyPublished = 0;
    let litNumPublished = 0;
    let portalSent = 0;

    for (const ev of evaluations) {
      if (ev.publishedMonthly) monthlyPublished++;
      if (ev.publishedLitNum) litNumPublished++;
      if ((ev.publishedMonthly?.isSentToPortal) || (ev.publishedLitNum?.isSentToPortal)) {
        portalSent++;
      }
    }

    return { total, monthlyPublished, litNumPublished, portalSent };
  }, [students, evaluations]);

  // Publish Individual Report
  const handlePublishIndividual = async (
    student: Student,
    reportKind: ElementaryUpperReportKind
  ) => {
    if (!selectedClass) return;
    const procKey = `${student.id}_${reportKind}`;
    setProcessingKey(procKey);
    const kindLabel = reportKind === 'MONTHLY_PROGRESS' ? 'Monthly Progress' : 'Literasi & Numerasi';
    const toastId = toast.loading(`Menerbitkan ${kindLabel} untuk ${student.name}...`);

    try {
      const stData = studentDataMap[student.id];
      const narratives = narrativesMap[student.id];
      const attSummary = calculateUpperStudentAttendanceSummary(attendanceConfig, student.id);

      if (reportKind === 'MONTHLY_PROGRESS') {
        if (!curriculumDoc || !stData || !narratives) {
          throw new Error('Data kurikulum, nilai, atau narasi siswa belum lengkap.');
        }
        await publishUpperMonthlyProgressReport(
          {
            student,
            classInfo: selectedClass,
            academicYear: selectedYear,
            semester: selectedSemester,
            month: selectedMonth,
            monthLabel,
            curriculumDoc,
            studentDataDoc: stData,
            narrativesDoc: narratives,
            attendanceSummary: attSummary,
            signatory
          },
          currentUser
        );
      } else {
        const litRecord = litNumRecordsMap[student.id];
        if (!classConfigDoc || !litRecord || !narratives) {
          throw new Error('Konfigurasi kelas, nilai literasi/numerasi, atau narasi belum lengkap.');
        }
        await publishUpperLiteracyNumeracyReport(
          {
            student,
            classInfo: selectedClass,
            academicYear: selectedYear,
            semester: selectedSemester,
            month: selectedMonth,
            monthLabel,
            classConfigDoc,
            recordDoc: litRecord,
            narrativesDoc: narratives,
            signatory
          },
          currentUser
        );
      }

      toast.success(`${kindLabel} berhasil diterbitkan!`, { id: toastId });
      await loadData();
    } catch (err: any) {
      console.error(`Error publishing ${reportKind}:`, err);
      toast.error(err.message || `Gagal menerbitkan ${kindLabel}.`, { id: toastId });
    } finally {
      setProcessingKey(null);
    }
  };

  // Batch Publish for eligible students
  const handleBatchPublish = async (reportKind: ElementaryUpperReportKind) => {
    if (!selectedClass) return;
    const kindLabel = reportKind === 'MONTHLY_PROGRESS' ? 'Monthly Progress' : 'Literasi & Numerasi';

    const eligible = evaluations.filter(ev => {
      const evalResult = reportKind === 'MONTHLY_PROGRESS' ? ev.monthlyProgressEval : ev.litNumEval;
      return evalResult.isEligible;
    });

    if (eligible.length === 0) {
      toast.warning(`Tidak ada siswa yang memenuhi syarat publikasi ${kindLabel}. Periksa catatan merah pada tabel.`);
      return;
    }

    if (!window.confirm(`Terbitkan ${kindLabel} untuk ${eligible.length} siswa yang memenuhi syarat?`)) {
      return;
    }

    setIsBatchProcessing(true);
    const toastId = toast.loading(`Menerbitkan ${kindLabel} secara batch (0/${eligible.length})...`);
    let successCount = 0;

    try {
      for (let i = 0; i < eligible.length; i++) {
        const ev = eligible[i];
        toast.loading(`Menerbitkan ${kindLabel} (${i + 1}/${eligible.length}): ${ev.student.name}...`, { id: toastId });

        if (reportKind === 'MONTHLY_PROGRESS') {
          await publishUpperMonthlyProgressReport(
            {
              student: ev.student,
              classInfo: selectedClass,
              academicYear: selectedYear,
              semester: selectedSemester,
              month: selectedMonth,
              monthLabel,
              curriculumDoc: curriculumDoc!,
              studentDataDoc: ev.studentDataDoc!,
              narrativesDoc: ev.narrativesDoc!,
              attendanceSummary: ev.attendanceSummary,
              signatory
            },
            currentUser
          );
        } else {
          await publishUpperLiteracyNumeracyReport(
            {
              student: ev.student,
              classInfo: selectedClass,
              academicYear: selectedYear,
              semester: selectedSemester,
              month: selectedMonth,
              monthLabel,
              classConfigDoc: classConfigDoc!,
              recordDoc: ev.litNumRecordDoc!,
              narrativesDoc: ev.narrativesDoc!,
              signatory
            },
            currentUser
          );
        }
        successCount++;
      }

      toast.success(`Berhasil menerbitkan ${kindLabel} untuk ${successCount} siswa!`, { id: toastId });
      await loadData();
    } catch (err: any) {
      console.error('Batch publish error:', err);
      toast.error(`Terjadi kesalahan saat batch: ${err.message}`, { id: toastId });
    } finally {
      setIsBatchProcessing(false);
    }
  };

  // Send to Portal
  const handleSendToPortal = async (reportId: string, studentName: string) => {
    const toastId = toast.loading(`Mengirim laporan ${studentName} ke portal...`);
    try {
      await sendUpperReportToPortal(reportId, currentUser);
      toast.success(`Laporan ${studentName} berhasil dikirim ke portal siswa & orang tua.`, { id: toastId });
      await loadData();
    } catch (err: any) {
      console.error('Error sending to portal:', err);
      toast.error('Gagal mengirim ke portal.', { id: toastId });
    }
  };

  // Revoke Access
  const handleRevoke = async (reportId: string, studentName: string) => {
    if (!window.confirm(`Cabut akses portal untuk laporan ${studentName}?`)) return;
    const toastId = toast.loading(`Mencabut akses portal...`);
    try {
      await revokeUpperReportAccess(reportId, currentUser);
      toast.success(`Akses portal untuk ${studentName} berhasil dicabut.`, { id: toastId });
      await loadData();
    } catch (err: any) {
      console.error('Error revoking report access:', err);
      toast.error('Gagal mencabut akses.', { id: toastId });
    }
  };

  // Batch Send All Published to Portal
  const handleBatchSendToPortal = async () => {
    const unSentReports = publishedReportsList.filter(r => !r.isSentToPortal && r.deliveryStatus !== 'SENT');
    if (unSentReports.length === 0) {
      toast.info('Semua dokumen yang sudah diterbitkan sudah berada di portal.');
      return;
    }

    if (!window.confirm(`Kirim ${unSentReports.length} dokumen yang sudah diterbitkan ke portal siswa & orang tua?`)) {
      return;
    }

    setIsBatchProcessing(true);
    const toastId = toast.loading(`Mengirim dokumen ke portal (0/${unSentReports.length})...`);
    let sentCount = 0;

    try {
      for (const r of unSentReports) {
        await sendUpperReportToPortal(r.id, currentUser);
        sentCount++;
      }
      toast.success(`Berhasil mengirim ${sentCount} dokumen ke portal siswa & orang tua!`, { id: toastId });
      await loadData();
    } catch (err: any) {
      console.error('Batch send to portal error:', err);
      toast.error('Gagal mengirim sebagian dokumen.', { id: toastId });
    } finally {
      setIsBatchProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Setup */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-black text-slate-900 tracking-tight">
              Publikasi &amp; Distribusi Rapor Upper Grade (4–6)
            </h2>
            <span className="bg-blue-100 text-blue-800 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
              Dua Dokumen Terpisah
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Kelola verifikasi, pratinjau, publikasi terpisah (Monthly Progress &amp; Literasi Numerasi), dan distribusi ke portal siswa &amp; orang tua.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            type="button"
            onClick={() => setIsAttendanceModalOpen(true)}
            className="flex-1 md:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
          >
            <Calendar size={14} />
            <span>Presensi &amp; Titimangsa</span>
          </button>

          <button
            type="button"
            onClick={() => loadData()}
            disabled={loadingData}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            title="Muat Ulang Data"
          >
            <RefreshCw size={16} className={loadingData ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="text-[11px] font-bold text-slate-500">Total Siswa Terdaftar</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{summary.total}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Kelas {selectedClass?.name}</div>
        </div>

        <div className="bg-white rounded-2xl border border-blue-200 p-4 shadow-sm bg-gradient-to-br from-white to-blue-50/30">
          <div className="text-[11px] font-bold text-blue-700">Monthly Progress Terbit</div>
          <div className="text-2xl font-black text-blue-900 mt-1">
            {summary.monthlyPublished} <span className="text-xs font-semibold text-slate-400">/ {summary.total}</span>
          </div>
          <div className="text-[10px] text-blue-600 mt-0.5">Dokumen Rapor 2 Halaman</div>
        </div>

        <div className="bg-white rounded-2xl border border-indigo-200 p-4 shadow-sm bg-gradient-to-br from-white to-indigo-50/30">
          <div className="text-[11px] font-bold text-indigo-700">Literasi &amp; Numerasi Terbit</div>
          <div className="text-2xl font-black text-indigo-900 mt-1">
            {summary.litNumPublished} <span className="text-xs font-semibold text-slate-400">/ {summary.total}</span>
          </div>
          <div className="text-[10px] text-indigo-600 mt-0.5">Grafik Capaian 1 Halaman</div>
        </div>

        <div className="bg-white rounded-2xl border border-emerald-200 p-4 shadow-sm bg-gradient-to-br from-white to-emerald-50/30">
          <div className="text-[11px] font-bold text-emerald-700">Terkirim ke Portal</div>
          <div className="text-2xl font-black text-emerald-900 mt-1">
            {summary.portalSent} <span className="text-xs font-semibold text-slate-400">/ {summary.total}</span>
          </div>
          <div className="text-[10px] text-emerald-600 mt-0.5">Akses Akun Siswa &amp; Ortu</div>
        </div>
      </div>

      {/* Batch Action Toolbar */}
      <div className="bg-indigo-50/60 border border-indigo-200/80 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-indigo-600" />
          <span className="text-xs font-bold text-indigo-950">Aksi Masal Publikasi:</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => handleBatchPublish('MONTHLY_PROGRESS')}
            disabled={isBatchProcessing}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
          >
            <FileText size={13} />
            <span>Terbitkan Semua Monthly Progress</span>
          </button>

          <button
            type="button"
            onClick={() => handleBatchPublish('LITERACY_NUMERACY')}
            disabled={isBatchProcessing}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
          >
            <BarChart2 size={13} />
            <span>Terbitkan Semua Literasi &amp; Numerasi</span>
          </button>

          <button
            type="button"
            onClick={handleBatchSendToPortal}
            disabled={isBatchProcessing}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
          >
            <Send size={13} />
            <span>Kirim Semua ke Portal</span>
          </button>
        </div>
      </div>

      {/* Main Student Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 w-12 text-center">No</th>
                <th className="px-4 py-3 min-w-[180px]">Siswa</th>
                <th className="px-4 py-3 min-w-[280px]">1. Monthly Progress (2 Hal)</th>
                <th className="px-4 py-3 min-w-[280px]">2. Literasi &amp; Numerasi (1 Hal)</th>
                <th className="px-4 py-3 min-w-[180px]">Portal &amp; Tracking</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {evaluations.map((ev, sIdx) => {
                const { student, monthlyProgressEval, litNumEval, publishedMonthly, publishedLitNum, attendanceSummary } = ev;
                const isMonthlyProc = processingKey === `${student.id}_MONTHLY_PROGRESS`;
                const isLitNumProc = processingKey === `${student.id}_LITERACY_NUMERACY`;

                return (
                  <tr key={student.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* Number */}
                    <td className="px-4 py-3 text-center text-slate-500 font-bold">
                      {sIdx + 1}
                    </td>

                    {/* Student Info */}
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900">{student.name}</div>
                      <div className="text-[10px] text-slate-500">NISN: {student.nisn || student.nis || '-'}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Presensi: {attendanceSummary.isAvailable ? `${attendanceSummary.percentage}% (${attendanceSummary.presentDays}/${attendanceSummary.totalDays} hari)` : 'Belum diisi'}
                      </div>
                    </td>

                    {/* Column 1: Monthly Progress Document */}
                    <td className="px-4 py-3">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          {/* Publish Status Badge */}
                          {publishedMonthly ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-200">
                              <CheckCircle2 size={11} />
                              <span>Terbit v{publishedMonthly.version}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                              <span>Belum Terbit</span>
                            </span>
                          )}

                          {/* Action Buttons */}
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setPreviewStudentId(student.id);
                                setPreviewInitialKind('MONTHLY_PROGRESS');
                              }}
                              className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                              title="Lihat Pratinjau Monthly Progress"
                            >
                              <Eye size={15} />
                            </button>

                            <button
                              type="button"
                              onClick={() => handlePublishIndividual(student, 'MONTHLY_PROGRESS')}
                              disabled={!monthlyProgressEval.isEligible || isMonthlyProc}
                              className="px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[10px] font-bold rounded-lg transition-colors cursor-pointer shadow-xs"
                            >
                              {isMonthlyProc ? '...' : publishedMonthly ? 'Terbitkan Ulang' : 'Terbitkan'}
                            </button>
                          </div>
                        </div>

                        {/* Validation Feedback */}
                        {!monthlyProgressEval.isEligible && (
                          <div className="text-[10px] text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-1.5 space-y-0.5">
                            <div className="font-bold flex items-center gap-1">
                              <AlertCircle size={10} />
                              <span>Syarat Belum Terpenuhi:</span>
                            </div>
                            <ul className="list-disc list-inside pl-1 text-[9.5px]">
                              {monthlyProgressEval.blockingReasons.slice(0, 2).map((r, i) => (
                                <li key={i}>{r}</li>
                              ))}
                              {monthlyProgressEval.blockingReasons.length > 2 && (
                                <li>+{monthlyProgressEval.blockingReasons.length - 2} kendala lainnya</li>
                              )}
                            </ul>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Column 2: Literacy & Numeracy Document */}
                    <td className="px-4 py-3">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          {/* Publish Status Badge */}
                          {publishedLitNum ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-800 border border-indigo-200">
                              <CheckCircle2 size={11} />
                              <span>Terbit v{publishedLitNum.version}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                              <span>Belum Terbit</span>
                            </span>
                          )}

                          {/* Action Buttons */}
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setPreviewStudentId(student.id);
                                setPreviewInitialKind('LITERACY_NUMERACY');
                              }}
                              className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                              title="Lihat Pratinjau Literasi & Numerasi"
                            >
                              <Eye size={15} />
                            </button>

                            <button
                              type="button"
                              onClick={() => handlePublishIndividual(student, 'LITERACY_NUMERACY')}
                              disabled={!litNumEval.isEligible || isLitNumProc}
                              className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[10px] font-bold rounded-lg transition-colors cursor-pointer shadow-xs"
                            >
                              {isLitNumProc ? '...' : publishedLitNum ? 'Terbitkan Ulang' : 'Terbitkan'}
                            </button>
                          </div>
                        </div>

                        {/* Validation Feedback */}
                        {!litNumEval.isEligible && (
                          <div className="text-[10px] text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-1.5 space-y-0.5">
                            <div className="font-bold flex items-center gap-1">
                              <AlertCircle size={10} />
                              <span>Syarat Belum Terpenuhi:</span>
                            </div>
                            <ul className="list-disc list-inside pl-1 text-[9.5px]">
                              {litNumEval.blockingReasons.slice(0, 2).map((r, i) => (
                                <li key={i}>{r}</li>
                              ))}
                              {litNumEval.blockingReasons.length > 2 && (
                                <li>+{litNumEval.blockingReasons.length - 2} kendala lainnya</li>
                              )}
                            </ul>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Column 3: Portal Delivery & Access Tracking */}
                    <td className="px-4 py-3">
                      <div className="space-y-1.5">
                        {/* Delivery Status */}
                        {publishedMonthly?.isSentToPortal || publishedLitNum?.isSentToPortal ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                              <CheckCircle2 size={11} />
                              <span>Terkirim ke Portal</span>
                            </span>

                            {/* Tracking info */}
                            <div className="text-[10px] text-slate-500">
                              {(publishedMonthly?.isOpened || publishedLitNum?.isOpened) ? (
                                <span className="text-emerald-700 font-semibold">
                                  ✓ Sudah dilihat ({Math.max(publishedMonthly?.openCount || 0, publishedLitNum?.openCount || 0)}x)
                                </span>
                              ) : (
                                <span className="text-slate-400 font-medium">Belum dibuka ortu</span>
                              )}
                            </div>

                            {/* Revoke button */}
                            <button
                              type="button"
                              onClick={() => {
                                if (publishedMonthly) handleRevoke(publishedMonthly.id, student.name);
                                if (publishedLitNum) handleRevoke(publishedLitNum.id, student.name);
                              }}
                              className="text-[10px] text-rose-600 hover:text-rose-800 font-semibold block transition-colors cursor-pointer"
                            >
                              Cabut Akses Portal
                            </button>
                          </div>
                        ) : (publishedMonthly || publishedLitNum) ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                              <span>Belum Terkirim</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                if (publishedMonthly) handleSendToPortal(publishedMonthly.id, student.name);
                                if (publishedLitNum) handleSendToPortal(publishedLitNum.id, student.name);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold transition-colors cursor-pointer shadow-xs"
                            >
                              <Send size={11} />
                              <span>Kirim Portal</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[10px] font-medium">-</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Attendance Config Modal */}
      {isAttendanceModalOpen && (
        <UpperAttendanceConfigModal
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
          onSaved={() => loadData()}
        />
      )}

      {/* Dual Preview & PDF Modal */}
      {previewStudentId && (
        <UpperMonthlyReportPreviewModal
          isOpen={!!previewStudentId}
          onClose={() => setPreviewStudentId(null)}
          students={students}
          initialStudentId={previewStudentId}
          selectedClass={selectedClass}
          selectedYear={selectedYear}
          selectedSemester={selectedSemester}
          selectedMonth={selectedMonth}
          monthLabel={monthLabel}
          curriculumDoc={curriculumDoc}
          studentDataMap={studentDataMap}
          narrativesMap={narrativesMap}
          litNumRecordsMap={litNumRecordsMap}
          classConfigDoc={classConfigDoc}
          attendanceConfig={attendanceConfig}
          signatory={signatory}
          publishedReportsMap={publishedMap}
          initialReportKind={previewInitialKind}
        />
      )}
    </div>
  );
};
