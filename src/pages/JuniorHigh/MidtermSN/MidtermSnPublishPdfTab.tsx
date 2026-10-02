import * as React from 'react';
import {
  FileText, ExternalLink, RefreshCw, Send, CheckCircle2,
  Clock, ShieldCheck, Loader2, Download
} from 'lucide-react';
import { toast } from 'sonner';
import { publishSnMidtermReport, ensureDefaultSnSubjects } from '../../../services/juniorHighSnMidtermService';
import { MidtermSnPdfTemplate } from './MidtermSnPdfTemplate';
import { generateMidtermPdfBlob, blobToBase64, normalizeMidtermFilename } from '../../../lib/juniorHighMidtermReportPdf';
import type { SnMidtermReportDoc, SnPublishedMidtermReportDoc } from '../../../types/midtermSnReport';
import type { Student, Class, User, ReportConfig } from '../../../types';

interface MidtermSnPublishPdfTabProps {
  currentUser: User;
  selectedClass: Class;
  selectedStudent: Student;
  reportDoc: SnMidtermReportDoc;
  publishedReports: SnPublishedMidtermReportDoc[];
  reportConfig: ReportConfig | null;
  homeroomTeacherProfile?: { displayName: string; niy?: string; signatureUrl?: string | null } | null;
  studentAttendanceMap?: Record<string, { sickLeave?: number | null; excusedLeave?: number | null; absent?: number | null }>;
  attendanceCutoffDate?: string;
  onRefreshData: () => Promise<void>;
  loading: boolean;
}

export const MidtermSnPublishPdfTab: React.FC<MidtermSnPublishPdfTabProps> = ({
  currentUser,
  selectedClass,
  selectedStudent,
  reportDoc,
  publishedReports,
  reportConfig,
  homeroomTeacherProfile,
  studentAttendanceMap,
  attendanceCutoffDate,
  onRefreshData,
  loading
}) => {
  const [publishing, setPublishing] = React.useState<boolean>(false);

  // Filter published versions for this specific student
  const studentPublishedList = publishedReports
    .filter((p) => p.studentId === selectedStudent.id)
    .sort((a, b) => (b.reportVersion || 0) - (a.reportVersion || 0));

  const latestPublished = studentPublishedList[0] || null;

  const handlePublish = async () => {
    if (!reportDoc || !reportDoc.subjects || !selectedStudent?.id || !selectedClass?.id || !currentUser?.uid) {
      toast.error('Data siswa, kelas, atau draf belum lengkap untuk dipublish.');
      return;
    }

    setPublishing(true);
    const toastId = toast.loading(`Menerbitkan rapor untuk ${selectedStudent.name || 'Siswa'}...`);

    try {
      // 1. Find the rendered A4 page elements inside the template
      let pageElements: HTMLElement[] = [];
      for (let wait = 0; wait < 20; wait++) {
        pageElements = Array.from(document.querySelectorAll('[id^="jh-midterm-generator-page"]')) as HTMLElement[];
        if (pageElements.length > 0) break;
        await new Promise(r => setTimeout(r, 150));
      }

      if (pageElements.length === 0) {
        throw new Error('Element render layout PDF tidak ditemukan. Silakan tunggu hingga pratinjau PDF termuat sepenuhnya.');
      }

      // 2. Generate PDF blob using jsPDF & html2canvas
      toast.loading(`Menghasilkan file PDF ${selectedStudent.name || 'Siswa'}...`, { id: toastId });
      const pdfBlob = await generateMidtermPdfBlob(pageElements);
      const fileName = normalizeMidtermFilename(
        selectedClass.name,
        selectedStudent.name || 'Siswa',
        reportDoc.midtermPeriod,
        reportDoc.academicYear
      );
      const pdfBase64 = await blobToBase64(pdfBlob);

      // 3. Upload to Google Shared Drive via Backend Service Account
      toast.loading(`Mengunggah PDF ${selectedStudent.name || 'Siswa'} ke Google Shared Drive...`, { id: toastId });
      const uploadRes = await fetch('/api/junior-high/midterm/upload-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          pdfBase64,
          fileName,
          academicYear: reportDoc.academicYear,
          semester: reportDoc.semester,
          midtermTerm: reportDoc.midtermPeriod,
          className: selectedClass.name
        })
      });

      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || !uploadData.success) {
        const errorDetail = uploadData?.error || `Upload Google Drive gagal dengan status ${uploadRes.status}`;
        throw new Error(errorDetail);
      }

      const driveFileId = uploadData.driveFileId;
      const driveFileUrl = uploadData.driveFileUrl;
      const driveFolderId = uploadData.folderId;

      if (!driveFileId || !driveFileUrl) {
        throw new Error('Respons Drive tidak lengkap.');
      }

      // 4. Compute next version and build snapshot
      const nextVersion = (latestPublished?.reportVersion || 0) + 1;

      const reportSnapshot = {
        student: {
          id: selectedStudent.id,
          name: selectedStudent.name || 'Siswa SN',
          nisn: (selectedStudent as any).nisn || (selectedStudent as any).nis || reportDoc.nisn || '',
          className: selectedClass.name || ''
        },
        academicYear: reportDoc.academicYear || '',
        semester: reportDoc.semester || '1',
        midtermPeriod: reportDoc.midtermPeriod || '1',
        subjects: ensureDefaultSnSubjects(Array.isArray(reportDoc.subjects) ? reportDoc.subjects : null),
        generalComment: reportDoc.generalComment?.finalComment || '',
        signatory: {
          principalName: reportConfig?.principalName || 'Dra. Hj. Unit Principal',
          principalNiy: reportConfig?.principalNIY || '',
          homeroomTeacherName: homeroomTeacherProfile?.displayName || selectedClass.homeroomTeacherName || 'Homeroom Teacher',
          homeroomTeacherNiy: homeroomTeacherProfile?.niy || '',
          homeroomTeacherSignatureUrl: selectedClass?.teacherSignatureUrl || null
        },
        attendance: {
          sakit: studentAttendanceMap?.[selectedStudent.id]?.sickLeave ?? 0,
          izin: studentAttendanceMap?.[selectedStudent.id]?.excusedLeave ?? 0,
          tanpaKeterangan: studentAttendanceMap?.[selectedStudent.id]?.absent ?? 0
        },
        attendanceCutoffDate: attendanceCutoffDate || '',
        publishedAt: Date.now()
      };

      // 5. Save metadata to database only on successful upload
      toast.loading(`Menyimpan metadata publikasi ke database...`, { id: toastId });
      await publishSnMidtermReport(
        selectedStudent,
        selectedClass,
        reportDoc.academicYear,
        reportDoc.semester,
        reportDoc.midtermPeriod,
        reportSnapshot,
        driveFileUrl,
        driveFileId,
        driveFolderId,
        nextVersion,
        currentUser
      );

      await onRefreshData();
      toast.success(`Rapor SN untuk ${selectedStudent.name} (v${nextVersion}) berhasil diterbitkan ke Shared Drive!`, { id: toastId });
    } catch (err: any) {
      console.error("[MidtermSnPublishPdfTab] handlePublish error:", err);
      toast.error('Gagal menerbitkan PDF Rapor SN: ' + (err.message || 'Error'), { id: toastId });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-purple-900 to-indigo-900 text-white rounded-3xl p-6 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FileText size={20} className="text-purple-300" />
            <h2 className="text-base font-black tracking-tight">
              Publish PDF Rapor SN: <span className="text-amber-300">{selectedStudent.name}</span>
            </h2>
          </div>
          <p className="text-xs text-purple-200">
            Publish dilakukan khusus per siswa SN. PDF snapshot akan tersimpan secara independen.
          </p>
        </div>

        <button
          onClick={handlePublish}
          disabled={publishing}
          className="px-6 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-900 text-xs font-black rounded-2xl shadow-sm transition-all flex items-center gap-2 cursor-pointer shrink-0 disabled:opacity-50"
        >
          {publishing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          <span>{latestPublished ? 'Publish Versi Baru' : 'Publish Rapor SN'}</span>
        </button>
      </div>

      {/* Latest Publication Info */}
      {latestPublished && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-emerald-950 text-xs">
          <div className="flex items-center gap-2 font-bold">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            <div>
              <span>Status: <strong className="text-emerald-700">DIPUBLISH (Versi {latestPublished.reportVersion})</strong></span>
              <p className="text-[11px] font-normal text-emerald-800">
                Dipublish pada: {new Date(latestPublished.publishedAt).toLocaleString('id-ID')} oleh {latestPublished.publishedByName}
              </p>
            </div>
          </div>

          {latestPublished.driveFileUrl && (
            <a
              href={latestPublished.driveFileUrl}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-1.5 transition-all"
            >
              <ExternalLink size={14} /> Buka Drive PDF
            </a>
          )}
        </div>
      )}

      {/* Live Preview */}
      <div className="space-y-3">
        <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide">
          Preview PDF Rapor SN
        </h3>
        <MidtermSnPdfTemplate
          reportDoc={reportDoc}
          student={selectedStudent}
          currentClass={selectedClass}
          academicYear={reportDoc.academicYear}
          semester={reportDoc.semester}
          midtermTerm={reportDoc.midtermPeriod}
          reportConfig={reportConfig}
          homeroomTeacherProfile={homeroomTeacherProfile || undefined}
          attendance={{
            sakit: studentAttendanceMap?.[selectedStudent.id]?.sickLeave ?? 0,
            izin: studentAttendanceMap?.[selectedStudent.id]?.excusedLeave ?? 0,
            tanpaKeterangan: studentAttendanceMap?.[selectedStudent.id]?.absent ?? 0
          }}
          attendanceCutoffDate={attendanceCutoffDate}
        />
      </div>
    </div>
  );
};
