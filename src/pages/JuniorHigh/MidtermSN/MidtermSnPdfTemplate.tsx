import * as React from 'react';
import type { SnMidtermReportDoc } from '../../../types/midtermSnReport';
import type { Student, Class, ReportConfig } from '../../../types';

interface MidtermSnPdfTemplateProps {
  reportDoc?: SnMidtermReportDoc;
  student?: Student;
  currentClass?: Class;
  academicYear?: string;
  semester?: string;
  midtermTerm?: string;
  reportConfig?: ReportConfig | null;
  homeroomTeacherName?: string;
  principalName?: string;
  reportSigningDate?: string;
  page1Id?: string;
  snapshot?: any;
}

export const MidtermSnPdfTemplate: React.FC<MidtermSnPdfTemplateProps> = ({
  reportDoc,
  student,
  currentClass,
  academicYear = '2025/2026',
  semester = '1',
  midtermTerm = '1',
  reportConfig,
  homeroomTeacherName = 'Homeroom Teacher',
  principalName,
  reportSigningDate,
  page1Id = 'jh-sn-midterm-pdf-page-1',
  snapshot
}) => {
  const effStudentName = snapshot?.student?.name || reportDoc?.studentName || student?.name || 'Nama Siswa';
  const effNisn = snapshot?.student?.nisn || reportDoc?.nisn || (student as any)?.nisn || '-';
  const effClassName = snapshot?.student?.className || reportDoc?.className || currentClass?.name || 'Kelas';
  const effYear = snapshot?.academicYear || reportDoc?.academicYear || academicYear;
  const effSemester = snapshot?.semester || reportDoc?.semester || semester;
  const effPeriod = snapshot?.midtermPeriod || reportDoc?.midtermPeriod || midtermTerm;

  const subjects = snapshot?.subjects || reportDoc?.subjects || [];
  const generalComment = snapshot?.generalComment || reportDoc?.generalComment?.finalComment || '';

  const effPrincipalName = snapshot?.signatory?.principalName || principalName || reportConfig?.principalName || 'Dra. Hj. Unit Principal';
  const effHomeroomName = snapshot?.signatory?.homeroomTeacherName || homeroomTeacherName || 'Homeroom Teacher';
  const effSigningDate = snapshot?.reportSigningDate || reportSigningDate || 'Depok, October 2026';

  return (
    <div className="bg-slate-200 p-4 rounded-3xl overflow-x-auto flex flex-col items-center gap-6">
      <div
        id={page1Id}
        className="w-[210mm] min-h-[297mm] bg-white p-[15mm] text-slate-900 shadow-xl font-sans relative flex flex-col justify-between"
        style={{ boxSizing: 'border-box' }}
      >
        {/* Header Branding */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b-2 border-purple-900 pb-3">
            <div className="space-y-0.5">
              <h1 className="text-xl font-black text-purple-950 tracking-tight uppercase">
                LAZUARDI JUNIOR HIGH SCHOOL
              </h1>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                MIDTERM INDIVIDUAL PROGRESS REPORT (SPECIAL NEEDS)
              </p>
            </div>
            <div className="px-3 py-1 bg-purple-900 text-white rounded-xl text-xs font-black uppercase tracking-wider">
              RAPOR SN
            </div>
          </div>

          {/* Student Info Box */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 p-3.5 bg-purple-50/50 rounded-2xl border border-purple-100 text-xs font-semibold">
            <div>
              <span className="text-slate-400 font-bold uppercase block text-[10px]">Nama Siswa:</span>
              <span className="font-extrabold text-purple-950 text-sm">{effStudentName}</span>
            </div>
            <div>
              <span className="text-slate-400 font-bold uppercase block text-[10px]">Kelas:</span>
              <span className="font-bold text-slate-900">{effClassName}</span>
            </div>
            <div>
              <span className="text-slate-400 font-bold uppercase block text-[10px]">NISN:</span>
              <span className="font-bold text-slate-900">{effNisn}</span>
            </div>
            <div>
              <span className="text-slate-400 font-bold uppercase block text-[10px]">Tahun Ajaran / Semester / Periode:</span>
              <span className="font-bold text-slate-900">
                {effYear} | Sem {effSemester} | Midterm {effPeriod}
              </span>
            </div>
          </div>

          {/* Legend Table */}
          <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-[10px] flex items-center justify-around font-bold text-slate-700">
            <span><strong className="text-emerald-700 font-black">A</strong> = Achieved (Menguasai)</span>
            <span><strong className="text-amber-600 font-black">D</strong> = Developing (Perlu Peningkatan)</span>
            <span><strong className="text-rose-600 font-black">B</strong> = Beginning (Perlu Bantuan)</span>
          </div>

          {/* Subjects & Goals Table */}
          <div className="space-y-4 pt-2">
            {subjects.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 border border-dashed rounded-xl">
                Belum ada data pembelajaran untuk dirilis.
              </div>
            ) : (
              subjects.map((subj: any, idx: number) => (
                <div key={idx} className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                  <div className="bg-purple-950 text-white px-3 py-1.5 font-black uppercase tracking-wide flex items-center justify-between">
                    <span>{idx + 1}. {subj.subjectName}</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {(subj.learningGoals || []).length === 0 ? (
                      <div className="p-2 text-[11px] text-slate-400 italic">
                        Tidak ada kriteria penilaian khusus.
                      </div>
                    ) : (
                      subj.learningGoals.map((lg: any, lgIdx: number) => (
                        <div key={lgIdx} className="p-2.5 flex items-center justify-between gap-3 bg-white">
                          <div className="flex items-start gap-2 flex-1">
                            <span className="text-[10px] font-bold text-slate-400">{lgIdx + 1}.</span>
                            <span className="text-[11px] font-semibold text-slate-800">{lg.text}</span>
                          </div>
                          <div className="w-10 text-center shrink-0">
                            <span
                              className={`px-2 py-0.5 rounded-md font-black text-xs ${
                                lg.remark === 'A'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : lg.remark === 'D'
                                  ? 'bg-amber-100 text-amber-800'
                                  : lg.remark === 'B'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-slate-100 text-slate-400'
                              }`}
                            >
                              {lg.remark || '-'}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* General Comment Section */}
          <div className="pt-2">
            <div className="border border-purple-200 rounded-2xl p-4 bg-purple-50/30 space-y-2">
              <h3 className="text-xs font-black text-purple-950 uppercase tracking-wide">
                General Comments (Catatan Umum)
              </h3>
              <p className="text-xs font-semibold text-slate-800 leading-relaxed whitespace-pre-wrap">
                {generalComment || 'Belum ada catatan narasi umum.'}
              </p>
            </div>
          </div>
        </div>

        {/* Signatures Footer */}
        <div className="pt-8 space-y-6">
          <div className="text-right text-xs font-bold text-slate-600">
            {effSigningDate}
          </div>

          <div className="grid grid-cols-3 gap-4 text-center text-xs font-bold text-slate-800">
            <div>
              <p className="mb-12">Orang Tua / Wali</p>
              <p className="border-t border-slate-300 pt-1 font-extrabold">( .................................... )</p>
            </div>
            <div>
              <p className="mb-12">Wali Kelas / Mentor</p>
              <p className="border-t border-slate-300 pt-1 font-extrabold">{effHomeroomName}</p>
            </div>
            <div>
              <p className="mb-12">Kepala SMP Lazuardi</p>
              <p className="border-t border-slate-300 pt-1 font-extrabold">{effPrincipalName}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
