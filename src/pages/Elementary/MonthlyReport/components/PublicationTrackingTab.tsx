import * as React from 'react';
import { 
  Eye, Download, Send, Undo2, CheckCircle2, AlertCircle, AlertTriangle, 
  Calendar, RefreshCw, FileText, Lock, Users, Sparkles, ShieldCheck 
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
import { 
  validateElementaryMonthlyPublishEligibility
} from '../../../../types/elementaryMonthlyReport';
import { 
  calculateStudentAttendanceSummary,
  fetchElementaryMonthlyAttendanceConfig,
  fetchPublishedElementaryMonthlyReports,
  publishElementaryMonthlyReport,
  sendElementaryMonthlyReportToPortal,
  revokeElementaryMonthlyReportAccess
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

export const PublicationTrackingTab: React.FC<PublicationTrackingTabProps> = ({
  curriculumDoc,
  studentScoresMap,
  students,
  selectedClass,
  selectedYear,
  selectedSemester,
  selectedMonth,
  monthLabel,
  currentUser,
  onRefreshData
}) => {
  // Attendance config & Published reports state
  const [attendanceConfig, setAttendanceConfig] = React.useState<ElementaryMonthlyAttendanceConfig | null>(null);
  const [publishedReportsMap, setPublishedReportsMap] = React.useState<Record<string, PublishedElementaryMonthlyReportDoc>>({});
  const [loadingPublishData, setLoadingPublishData] = React.useState<boolean>(false);

  // Photos, Project, Narratives state
  const [projectDoc, setProjectDoc] = React.useState<ElementaryMonthlyProjectDoc | null>(null);
  const [photosMap, setPhotosMap] = React.useState<Record<string, ElementaryMonthlyStudentPhotoDoc>>({});
  const [narrativesMap, setNarrativesMap] = React.useState<Record<string, ElementaryMonthlyStudentNarrativeDoc>>({});

  // Modals state
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = React.useState<boolean>(false);
  const [previewStudent, setPreviewStudent] = React.useState<Student | null>(null);

  // Processing state
  const [processingStudentId, setProcessingStudentId] = React.useState<string | null>(null);
  const [isBatchProcessing, setIsBatchProcessing] = React.useState<boolean>(false);

  // Signatory Profile
  const signatory: ElementaryMonthlyReportSignatory = React.useMemo(() => {
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

  // Load all required data for publishing & tracking
  const loadData = React.useCallback(async () => {
    if (!selectedClass || !selectedYear || !selectedSemester || !selectedMonth) return;
    setLoadingPublishData(true);

    try {
      const { 
        fetchElementaryMonthlyProjectDoc, 
        fetchElementaryMonthlyStudentPhotos,
        fetchElementaryMonthlyStudentNarratives 
      } = await import('../../../../services/elementaryMonthlyReportService');

      const [attConfig, pubReports, proj, photos, narratives] = await Promise.all([
        fetchElementaryMonthlyAttendanceConfig(selectedClass.id, selectedYear, selectedSemester, selectedMonth),
        fetchPublishedElementaryMonthlyReports(selectedClass.id, selectedYear, selectedSemester, selectedMonth),
        fetchElementaryMonthlyProjectDoc(selectedClass.id, selectedYear, selectedSemester, selectedMonth),
        fetchElementaryMonthlyStudentPhotos(selectedClass.id, selectedYear, selectedSemester, selectedMonth),
        fetchElementaryMonthlyStudentNarratives(selectedClass.id, selectedYear, selectedSemester, selectedMonth)
      ]);

      setAttendanceConfig(attConfig);

      const pubMap: Record<string, PublishedElementaryMonthlyReportDoc> = {};
      for (const r of pubReports) {
        pubMap[r.studentId] = r;
      }
      setPublishedReportsMap(pubMap);

      setProjectDoc(proj);
      setPhotosMap(photos);
      setNarrativesMap(narratives);
    } catch (err) {
      console.error('Error loading publication data:', err);
      toast.error('Gagal memuat status publikasi & tracking.');
    } finally {
      setLoadingPublishData(false);
    }
  }, [selectedClass, selectedYear, selectedSemester, selectedMonth]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  // Evaluation for each student
  const studentEvaluations = React.useMemo(() => {
    return students.map(st => {
      const scoreDoc = studentScoresMap[st.id] || null;
      const narrativeDoc = narrativesMap[st.id] || null;
      const photoDoc = photosMap[st.id] || null;
      const attSummary = calculateStudentAttendanceSummary(attendanceConfig, st.id);
      const published = publishedReportsMap[st.id] || null;

      const validation = validateElementaryMonthlyPublishEligibility({
        student: { id: st.id, name: st.name },
        curriculumDoc,
        studentScoreDoc: scoreDoc,
        narrativeDoc,
        projectDoc,
        photoDoc,
        attendanceSummary: attSummary,
        signatory
      });

      return {
        student: st,
        scoreDoc,
        narrativeDoc,
        photoDoc,
        attSummary,
        published,
        validation
      };
    });
  }, [students, studentScoresMap, narrativesMap, photosMap, attendanceConfig, publishedReportsMap, curriculumDoc, projectDoc, signatory]);

  // Summary Counters
  const counters = React.useMemo(() => {
    let eligibleCount = 0;
    let publishedCount = 0;
    let sentCount = 0;
    let openedCount = 0;

    for (const item of studentEvaluations) {
      if (item.validation.isEligible) eligibleCount++;
      if (item.published && item.published.status === 'PUBLISHED') {
        publishedCount++;
        if (item.published.deliveryStatus === 'SENT') sentCount++;
        if (item.published.isOpened) openedCount++;
      }
    }

    return {
      total: students.length,
      eligible: eligibleCount,
      published: publishedCount,
      sent: sentCount,
      opened: openedCount
    };
  }, [studentEvaluations, students.length]);

  // Single Publish Action
  const handlePublishSingle = async (st: Student) => {
    const item = studentEvaluations.find(e => e.student.id === st.id);
    if (!item) return;

    if (!item.validation.isEligible) {
      toast.error(`Tidak dapat mempublikasikan: ${item.validation.blockingReasons[0]}`);
      return;
    }

    setProcessingStudentId(st.id);
    try {
      const pubDoc = await publishElementaryMonthlyReport({
        student: st,
        classId: selectedClass!.id,
        className: selectedClass!.name,
        gradeLevel: selectedClass!.grade || 1,
        academicYear: selectedYear,
        semester: selectedSemester,
        month: selectedMonth,
        curriculumDoc: curriculumDoc!,
        studentScoreDoc: item.scoreDoc,
        projectDoc,
        photoDoc: item.photoDoc,
        narrativeDoc: item.narrativeDoc,
        attendanceConfig,
        signatory,
        currentUser
      });

      setPublishedReportsMap(prev => ({
        ...prev,
        [st.id]: pubDoc
      }));
      toast.success(`Rapor ${st.name} berhasil diterbitkan (v${pubDoc.version}).`);
    } catch (err: any) {
      console.error('Error publishing report:', err);
      toast.error(err.message || 'Gagal mempublikasikan rapor.');
    } finally {
      setProcessingStudentId(null);
    }
  };

  // Batch Publish Action
  const handleBatchPublish = async () => {
    const eligibleStudents = studentEvaluations.filter(e => e.validation.isEligible);
    if (eligibleStudents.length === 0) {
      toast.error('Belum ada siswa yang memenuhi seluruh syarat penerbitan.');
      return;
    }

    const confirmMsg = `Terbitkan ${eligibleStudents.length} rapor siswa yang memenuhi syarat? (${students.length - eligibleStudents.length} siswa belum lengkap dan akan dilewati)`;
    if (!window.confirm(confirmMsg)) return;

    setIsBatchProcessing(true);
    let successCount = 0;
    let failedCount = 0;

    for (const item of eligibleStudents) {
      try {
        const pubDoc = await publishElementaryMonthlyReport({
          student: item.student,
          classId: selectedClass!.id,
          className: selectedClass!.name,
          gradeLevel: selectedClass!.grade || 1,
          academicYear: selectedYear,
          semester: selectedSemester,
          month: selectedMonth,
          curriculumDoc: curriculumDoc!,
          studentScoreDoc: item.scoreDoc,
          projectDoc,
          photoDoc: item.photoDoc,
          narrativeDoc: item.narrativeDoc,
          attendanceConfig,
          signatory,
          currentUser
        });

        setPublishedReportsMap(prev => ({
          ...prev,
          [item.student.id]: pubDoc
        }));
        successCount++;
      } catch (e) {
        console.error(`Failed to publish student ${item.student.name}:`, e);
        failedCount++;
      }
    }

    setIsBatchProcessing(false);
    if (failedCount === 0) {
      toast.success(`Berhasil menerbitkan seluruh ${successCount} rapor siswa.`);
    } else {
      toast.warning(`Penerbitan selesai: ${successCount} berhasil, ${failedCount} gagal.`);
    }
  };

  // Send to Portal Action (Single)
  const handleSendToPortal = async (reportId: string, studentName: string) => {
    try {
      await sendElementaryMonthlyReportToPortal(reportId, currentUser);
      setPublishedReportsMap(prev => {
        const copy = { ...prev };
        for (const k of Object.keys(copy)) {
          if (copy[k].id === reportId) {
            copy[k] = {
              ...copy[k],
              deliveryStatus: 'SENT',
              isSentToPortal: true,
              sentAt: Date.now(),
              sentByName: currentUser.displayName || currentUser.name || 'Guru'
            };
          }
        }
        return copy;
      });
      toast.success(`Rapor ${studentName} berhasil dikirim ke portal siswa & orang tua.`);
    } catch (err: any) {
      console.error('Error sending report to portal:', err);
      toast.error('Gagal mengirim rapor ke portal.');
    }
  };

  // Revoke Portal Access Action (Single)
  const handleRevokePortal = async (reportId: string, studentName: string) => {
    if (!window.confirm(`Tarik akses portal untuk rapor ${studentName}? Siswa dan orang tua tidak akan dapat melihat laporan ini.`)) return;

    try {
      await revokeElementaryMonthlyReportAccess(reportId, currentUser);
      setPublishedReportsMap(prev => {
        const copy = { ...prev };
        for (const k of Object.keys(copy)) {
          if (copy[k].id === reportId) {
            copy[k] = {
              ...copy[k],
              deliveryStatus: 'REVOKED',
              isSentToPortal: false
            };
          }
        }
        return copy;
      });
      toast.success(`Akses portal untuk rapor ${studentName} berhasil ditarik.`);
    } catch (err: any) {
      console.error('Error revoking report access:', err);
      toast.error('Gagal menarik akses portal.');
    }
  };

  // Batch Send All Published to Portal
  const handleBatchSendToPortal = async () => {
    const publishedUnsent = Object.values(publishedReportsMap).filter(r => r.deliveryStatus !== 'SENT');
    if (publishedUnsent.length === 0) {
      toast.info('Seluruh rapor yang telah terbit sudah dikirim ke portal.');
      return;
    }

    if (!window.confirm(`Kirim ${publishedUnsent.length} rapor yang telah terbit ke portal siswa & orang tua?`)) return;

    setIsBatchProcessing(true);
    let successCount = 0;
    for (const r of publishedUnsent) {
      try {
        await sendElementaryMonthlyReportToPortal(r.id, currentUser);
        successCount++;
      } catch (e) {
        console.error('Error sending report in batch:', e);
      }
    }
    setIsBatchProcessing(false);
    toast.success(`${successCount} rapor berhasil dikirim ke portal siswa & orang tua.`);
    loadData();
  };

  return (
    <div className="space-y-6">
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
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Siap Terbit</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
            <FileText size={20} />
          </div>
          <div>
            <div className="text-xl font-black text-purple-700">{counters.published}</div>
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Terbit (Snapshot)</div>
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
          <span className="font-bold text-slate-900">Operasi Massal Kelas:</span> Publikasi rapor membuat snapshot permanen berversi. Pengiriman ke portal dilakukan secara terpisah.
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleBatchPublish}
            disabled={isBatchProcessing || counters.eligible === 0}
            className="px-3.5 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
          >
            <ShieldCheck size={14} />
            <span>Terbitkan Semua yang Siap ({counters.eligible})</span>
          </button>

          <button
            type="button"
            onClick={handleBatchSendToPortal}
            disabled={isBatchProcessing || counters.published === 0}
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
            disabled={loadingPublishData}
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
                <th className="py-3 px-3 text-center">Status Snapshot</th>
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
                      if (sc !== undefined && sc !== null && sc !== '') filledLo++;
                    }
                  }
                }
                const isLoComplete = totalLo > 0 && filledLo === totalLo;

                // Narrative Status
                const isNarApproved = narrativeDoc?.reviewStatus === 'APPROVED' && !narrativeDoc?.isSourceStale;

                return (
                  <tr key={st.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-3 text-center text-slate-400 font-semibold">{idx + 1}</td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900">{st.name}</div>
                      <div className="text-[10px] text-slate-500">NISN: {(st as any).nisn || (st as any).nis || '-'}</div>
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
                      {published && published.status === 'PUBLISHED' ? (
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
                          Belum Terbit
                        </span>
                      )}
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
                          onClick={() => setPreviewStudent(st)}
                          className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
                          title="Preview Internal"
                        >
                          <Eye size={12} />
                          <span>Preview</span>
                        </button>

                        {/* Publish Snapshot Button */}
                        <button
                          type="button"
                          onClick={() => handlePublishSingle(st)}
                          disabled={isProcessing || !validation.isEligible}
                          className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                          title={validation.isEligible ? 'Terbitkan Rapor' : validation.blockingReasons.join('\n')}
                        >
                          <ShieldCheck size={12} />
                          <span>{isProcessing ? 'Proses...' : published ? 'Update' : 'Publish'}</span>
                        </button>

                        {/* Send / Revoke Portal Button */}
                        {published ? (
                          published.deliveryStatus === 'SENT' ? (
                            <button
                              type="button"
                              onClick={() => handleRevokePortal(published.id, st.name)}
                              className="px-2 py-1 text-[11px] font-bold rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 transition-colors cursor-pointer"
                              title="Tarik Akses Portal"
                            >
                              <Undo2 size={12} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSendToPortal(published.id, st.name)}
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
          onSaved={loadData}
        />
      )}

      {/* Preview Modal */}
      {previewStudent && (
        <MonthlyReportPreviewModal
          isOpen={!!previewStudent}
          onClose={() => setPreviewStudent(null)}
          student={previewStudent}
          allStudents={students}
          onSelectStudent={(st) => setPreviewStudent(st)}
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
          publishedReport={publishedReportsMap[previewStudent.id] || null}
        />
      )}
    </div>
  );
};
