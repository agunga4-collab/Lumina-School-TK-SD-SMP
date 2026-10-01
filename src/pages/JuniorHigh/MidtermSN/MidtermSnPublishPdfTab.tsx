import * as React from 'react';
import {
  FileText, ExternalLink, RefreshCw, Send, CheckCircle2,
  Clock, ShieldCheck, Loader2, Download
} from 'lucide-react';
import { toast } from 'sonner';
import { publishSnMidtermReport } from '../../../services/juniorHighSnMidtermService';
import { MidtermSnPdfTemplate } from './MidtermSnPdfTemplate';
import type { SnMidtermReportDoc, SnPublishedMidtermReportDoc } from '../../../types/midtermSnReport';
import type { Student, Class, User, ReportConfig } from '../../../types';

interface MidtermSnPublishPdfTabProps {
  currentUser: User;
  selectedClass: Class;
  selectedStudent: Student;
  reportDoc: SnMidtermReportDoc;
  publishedReports: SnPublishedMidtermReportDoc[];
  reportConfig: ReportConfig | null;
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
    if (!reportDoc || !reportDoc.subjects) {
      toast.error('Data draf belum lengkap.');
      return;
    }

    setPublishing(true);
    try {
      const nextVersion = (latestPublished?.reportVersion || 0) + 1;

      const reportSnapshot = {
        student: {
          id: selectedStudent.id,
          name: selectedStudent.name,
          nisn: (selectedStudent as any).nisn || reportDoc.nisn || '',
          className: selectedClass.name
        },
        academicYear: reportDoc.academicYear,
        semester: reportDoc.semester,
        midtermPeriod: reportDoc.midtermPeriod,
        subjects: reportDoc.subjects,
        generalComment: reportDoc.generalComment?.finalComment || '',
        signatory: {
          principalName: reportConfig?.principalName || 'Dra. Hj. Unit Principal',
          homeroomTeacherName: selectedClass.homeroomTeacherName || 'Homeroom Teacher'
        },
        publishedAt: Date.now()
      };

      const dummyDriveUrl = `https://drive.google.com/file/d/SN_MIDTERM_${selectedStudent.id}_v${nextVersion}/view`;
      const dummyFileId = `SN_FILE_${selectedStudent.id}_v${nextVersion}`;
      const dummyFolderId = '1mjxXJKaKSCfn0RNpJWQTsI65DwnhiyqK';

      await publishSnMidtermReport(
        selectedStudent,
        selectedClass,
        reportDoc.academicYear,
        reportDoc.semester,
        reportDoc.midtermPeriod,
        reportSnapshot,
        dummyDriveUrl,
        dummyFileId,
        dummyFolderId,
        nextVersion,
        currentUser
      );

      await onRefreshData();
      toast.success(`Rapor SN untuk ${selectedStudent.name} v${nextVersion} berhasil dipublish!`);
    } catch (err: any) {
      toast.error('Gagal merilis PDF Rapor SN: ' + (err.message || 'Error'));
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
          homeroomTeacherName={selectedClass.homeroomTeacherName}
        />
      </div>
    </div>
  );
};
