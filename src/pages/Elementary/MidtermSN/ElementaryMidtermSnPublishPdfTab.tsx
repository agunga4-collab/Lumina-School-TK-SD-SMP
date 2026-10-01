import * as React from 'react';
import {
  FileText, ExternalLink, RefreshCw, Send, CheckCircle2,
  Clock, ShieldCheck, Loader2, Printer
} from 'lucide-react';
import { toast } from 'sonner';
import { publishElemSnMidtermReport } from '../../../services/elementarySnMidtermService';
import { ElementaryMidtermSnPdfTemplate } from './ElementaryMidtermSnPdfTemplate';
import type { ElementarySnMidtermReportDoc, ElementarySnPublishedMidtermReportDoc } from '../../../types/elementaryMidtermSnReport';
import type { Student, Class, User, ReportConfig } from '../../../types';

interface ElementaryMidtermSnPublishPdfTabProps {
  currentUser: User;
  selectedClass: Class;
  selectedStudent: Student;
  reportDoc: ElementarySnMidtermReportDoc;
  publishedReports: ElementarySnPublishedMidtermReportDoc[];
  reportConfig: ReportConfig | null;
  onRefreshData: () => Promise<void>;
  loading: boolean;
  signingDateRaw?: string;
  cutoffDateRaw?: string;
  showAttendanceRecap?: boolean;
}

export const ElementaryMidtermSnPublishPdfTab: React.FC<ElementaryMidtermSnPublishPdfTabProps> = ({
  currentUser,
  selectedClass,
  selectedStudent,
  reportDoc,
  publishedReports,
  reportConfig,
  onRefreshData,
  loading,
  signingDateRaw,
  cutoffDateRaw,
  showAttendanceRecap = true
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
    try {
      const nextVersion = (latestPublished?.reportVersion || 0) + 1;

      // Build categories matching Elementary snapshot structure
      const academicSubjs = (reportDoc.subjects || [])
        .filter((s) => s.category !== 'PROJECTS' && !s.subjectName.toLowerCase().includes('project'))
        .map((s) => ({
          name: s.subjectName,
          goals: (s.learningGoals || []).map((g) => ({
            id: g.goalId,
            text: g.text,
            remark: g.remark || '-'
          }))
        }))
        .filter((s) => s.goals.length > 0);

      const projectSubjs = (reportDoc.subjects || [])
        .filter((s) => s.category === 'PROJECTS' || s.subjectName.toLowerCase().includes('project'))
        .map((s) => ({
          name: s.subjectName,
          goals: (s.learningGoals || []).map((g) => ({
            id: g.goalId,
            text: g.text,
            remark: g.remark || '-'
          }))
        }))
        .filter((s) => s.goals.length > 0);

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
        categories: [
          { name: 'SUBJECTS', subjects: academicSubjs },
          { name: 'PROJECTS', subjects: projectSubjs }
        ],
        generalComment: reportDoc.generalComment?.finalComment || '',
        attendance: reportDoc.attendance || { sakit: 0, izin: 0, tanpaKeterangan: 0 },
        signatory: {
          principalName: reportConfig?.principalName || 'Principal',
          principalTitle: reportConfig?.principalTitle || 'Principal',
          principalNiy: reportConfig?.principalNIY || '',
          principalSignatureUrl: reportConfig?.principalSignatureUrl || null,
          homeroomTeacherName: selectedClass.homeroomTeacherName || 'Homeroom Teacher'
        },
        showAttendanceRecap,
        publishedAt: Date.now()
      };

      const dummyDriveUrl = `https://drive.google.com/file/d/ELEM_SN_MIDTERM_${selectedStudent.id}_v${nextVersion}/view`;
      const dummyFileId = `ELEM_SN_FILE_${selectedStudent.id}_v${nextVersion}`;
      const dummyFolderId = '1mjxXJKaKSCfn0RNpJWQTsI65DwnhiyqK';

      await publishElemSnMidtermReport(
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
      toast.success(`Rapor SN Elementary untuk ${selectedStudent.name} v${nextVersion} berhasil dipublish!`);
    } catch (err: any) {
      console.error('[ElementaryMidtermSnPublishPdfTab] handlePublish error:', {
        studentId: selectedStudent?.id,
        classId: selectedClass?.id,
        academicYear: reportDoc?.academicYear
      }, err);
      toast.error('Gagal merilis PDF Rapor SN: ' + (err.message || 'Error'));
    } finally {
      setPublishing(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FileText size={20} className="text-amber-800" />
            <h2 className="text-base font-black text-slate-900 tracking-tight">
              Publish & Preview PDF Rapor SN: <span className="text-amber-800">{selectedStudent.name}</span>
            </h2>
          </div>
          <p className="text-xs text-slate-500">
            Publish dilakukan khusus per siswa SN. PDF snapshot akan tersimpan di koleksi SN khusus tanpa tercampur dengan modul reguler.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-2xl transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Printer size={16} />
            <span>Cetak / Cetak PDF</span>
          </button>

          <button
            onClick={handlePublish}
            disabled={publishing}
            className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black rounded-2xl shadow-sm transition-all flex items-center gap-2 cursor-pointer shrink-0 disabled:opacity-50"
          >
            {publishing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            <span>{latestPublished ? 'Publish Versi Baru' : 'Publish Rapor SN'}</span>
          </button>
        </div>
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
          Preview PDF Rapor SN Elementary
        </h3>
        <ElementaryMidtermSnPdfTemplate
          reportDoc={reportDoc}
          student={selectedStudent}
          currentClass={selectedClass}
          academicYear={reportDoc.academicYear}
          semester={reportDoc.semester}
          midtermTerm={reportDoc.midtermPeriod}
          attendance={reportDoc.attendance}
          reportConfig={reportConfig}
          showAttendanceRecap={showAttendanceRecap}
        />
      </div>
    </div>
  );
};
