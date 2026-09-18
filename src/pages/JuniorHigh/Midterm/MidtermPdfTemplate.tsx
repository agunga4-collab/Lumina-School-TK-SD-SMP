import * as React from 'react';
import type { 
  MidtermReportSnapshot,
  MidtermMasterGoalDoc,
  MidtermStudentDataDoc,
} from '../../../types/midtermReport';
import { JH_MIDTERM_CATEGORIES } from '../../../types/midtermReport';
import type { Student, Class, ReportConfig } from '../../../types';

interface MidtermPdfTemplateProps {
  // Snapshot mode (for published reports viewing) or Live mode (for preview before publish)
  snapshot?: MidtermReportSnapshot;
  
  // Live props (when snapshot not provided)
  student?: Student;
  currentClass?: Class;
  academicYear?: string;
  semester?: string;
  midtermTerm?: string;
  masterGoalsMap?: Record<string, MidtermMasterGoalDoc>;
  studentDataDoc?: MidtermStudentDataDoc;
  attendance?: { sakit: number | null; izin: number | null; tanpaKeterangan: number | null };
  reportConfig?: ReportConfig | null;
  homeroomTeacherProfile?: { displayName: string; niy?: string; signatureUrl?: string | null };
  
  // Print / generation ref IDs
  page1Id?: string;
  page2Id?: string;
}

export const MidtermPdfTemplate: React.FC<MidtermPdfTemplateProps> = ({
  snapshot,
  student,
  currentClass,
  academicYear = '2025/2026',
  semester = '1',
  midtermTerm = '1',
  masterGoalsMap = {},
  studentDataDoc,
  attendance = { sakit: 0, izin: 0, tanpaKeterangan: 0 },
  reportConfig,
  homeroomTeacherProfile,
  page1Id = 'jh-midterm-pdf-page-1',
  page2Id = 'jh-midterm-pdf-page-2',
}) => {
  // Derive student identity
  const studentName = snapshot ? snapshot.student.name : (student?.name || '');
  const studentNisn = snapshot ? (snapshot.student.nisn || '-') : (student?.nisn || (student as any)?.nis || '-');
  const className = snapshot ? snapshot.student.className : (currentClass?.name || '');
  const effAcademicYear = snapshot ? snapshot.academicYear : academicYear;
  const effTerm = snapshot ? snapshot.midtermTerm : midtermTerm;
  const effGeneralComment = snapshot 
    ? snapshot.generalComment 
    : (studentDataDoc?.generalComment?.finalComment || studentDataDoc?.generalComment?.aiDraft || '');
  
  const effAttendance = snapshot ? snapshot.attendance : attendance;
  const effPrincipalName = snapshot 
    ? snapshot.signatory.principalName 
    : (reportConfig?.principalName || 'Principal');
  const effPrincipalNiy = snapshot 
    ? snapshot.signatory.principalNiy 
    : (reportConfig?.principalNIY || '');
  const effPrincipalSignatureUrl = snapshot 
    ? snapshot.signatory.principalSignatureUrl 
    : (reportConfig?.principalSignatureUrl || null);

  const effHomeroomName = snapshot 
    ? snapshot.signatory.homeroomTeacherName 
    : (currentClass?.homeroomTeacherName || homeroomTeacherProfile?.displayName || 'Homeroom Teacher');
  const effHomeroomNiy = snapshot 
    ? snapshot.signatory.homeroomTeacherNiy 
    : (homeroomTeacherProfile?.niy || '');
  const effHomeroomSignatureUrl = snapshot 
    ? snapshot.signatory.homeroomTeacherSignatureUrl 
    : (homeroomTeacherProfile?.signatureUrl || null);

  // Derive categories and subject rows
  // Category 1: SPIRITUAL HEALTH
  // Category 2: LEARNING JOURNEY
  // Category 3: WEEKLY LESSONS
  // Category 4: UNIT ACTIVITY
  const getCategoryData = (catId: string, fallbackName: string) => {
    if (snapshot) {
      const found = snapshot.categories.find(c => c.name.toUpperCase() === fallbackName.toUpperCase());
      return found?.subjects || [];
    }

    const config = JH_MIDTERM_CATEGORIES.find(c => c.id === catId);
    if (!config) return [];

    return config.subjects.map(subjName => {
      const master = masterGoalsMap[subjName];
      const goals = (master?.goals || []).map(g => ({
        id: g.id,
        text: g.text,
        remark: studentDataDoc?.remarks?.[g.id] || (subjName === 'Spiritual Health' ? (studentDataDoc?.spiritualHealthRemark || '') : '') || '-'
      }));
      return {
        name: subjName,
        goals
      };
    });
  };

  const spiritualSubjects = getCategoryData('SPIRITUAL_HEALTH', 'SPIRITUAL HEALTH');
  const learningJourneySubjects = getCategoryData('LEARNING_JOURNEY', 'LEARNING JOURNEY');
  const weeklyLessonSubjects = getCategoryData('WEEKLY_LESSONS', 'WEEKLY LESSONS');
  const unitActivitySubjects = getCategoryData('UNIT_ACTIVITY', 'UNIT ACTIVITY');

  const renderSubjectTable = (subjects: Array<{ name: string; goals: Array<{ id: string; text: string; remark: string }> }>, startNo = 1) => {
    let currentNo = startNo;
    return (
      <table className="w-full text-left border-collapse border border-black text-[10.5px]">
        <thead>
          <tr className="bg-white text-black font-bold uppercase border-b border-black">
            <th className="border-r border-black p-1.5 w-[8%] text-center">NO.</th>
            <th className="border-r border-black p-1.5 w-[76%]">SUBJECT AND LEARNING GOALS</th>
            <th className="p-1.5 w-[16%] text-center">Remark</th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((subj, sIdx) => {
            const rowNo = currentNo++;
            const goals = subj.goals.length > 0 ? subj.goals : [{ id: 'empty', text: '(No learning goals recorded)', remark: '-' }];
            return (
              <React.Fragment key={subj.name + sIdx}>
                {goals.map((goal, gIdx) => {
                  const isFirst = gIdx === 0;
                  return (
                    <tr key={goal.id + gIdx} className="border-b border-black">
                      {isFirst ? (
                        <td 
                          rowSpan={goals.length} 
                          className="border-r border-black p-1.5 text-center font-bold align-top"
                        >
                          {rowNo}.
                        </td>
                      ) : null}
                      <td className="border-r border-black p-1.5 align-top">
                        {isFirst && (
                          <div className="font-bold text-black mb-1 text-[11px] uppercase">
                            {subj.name}
                          </div>
                        )}
                        <div className="flex items-start gap-1.5 text-slate-800 leading-snug pl-1">
                          <span className="font-bold text-black select-none">•</span>
                          <span>{goal.text}</span>
                        </div>
                      </td>
                      <td className="p-1.5 text-center align-middle font-bold text-black">
                        {goal.remark || '-'}
                      </td>
                    </tr>
                  );
                })}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    );
  };

  return (
    <div className="flex flex-col items-center gap-8 py-4 bg-slate-100 font-sans print:bg-white print:p-0">
      {/* PAGE 1 */}
      <div
        id={page1Id}
        className="w-[794px] min-w-[794px] h-[1123px] min-h-[1123px] bg-white p-[36px] flex flex-col justify-between box-border shadow-md print:shadow-none print:m-0 print:border-none"
        style={{ boxSizing: 'border-box' }}
      >
        <div>
          {/* Header & Logo */}
          <div className="flex items-center justify-between border-b-2 border-black pb-3 mb-4">
            <div className="flex items-center gap-3">
              <img 
                src="https://lazuardi.sch.id/wp-content/uploads/2021/04/Logo-Lazuardi-Junior-High.png" 
                alt="Lazuardi Junior High Logo"
                className="h-12 w-auto object-contain"
                crossOrigin="anonymous"
                onError={(e) => {
                  // Fallback to text if external image fails
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <div>
                <h1 className="text-base font-black tracking-wider text-black uppercase leading-tight">
                  STUDENT'S PROGRESS REPORT
                </h1>
                <h2 className="text-xs font-bold tracking-widest text-slate-700 uppercase">
                  LAZUARDI GCS - JUNIOR HIGH
                </h2>
              </div>
            </div>
          </div>

          {/* Vertical Student Identity */}
          <div className="mb-4 bg-slate-50 border border-slate-300 p-2.5 rounded text-[11px] leading-relaxed text-black">
            <div className="grid grid-cols-[130px_16px_1fr] items-center">
              <span className="font-semibold text-slate-700">Student's name</span>
              <span>:</span>
              <span className="font-bold text-black uppercase">{studentName}</span>
            </div>
            <div className="grid grid-cols-[130px_16px_1fr] items-center">
              <span className="font-semibold text-slate-700">NISN</span>
              <span>:</span>
              <span className="font-medium text-black">{studentNisn}</span>
            </div>
            <div className="grid grid-cols-[130px_16px_1fr] items-center">
              <span className="font-semibold text-slate-700">Class</span>
              <span>:</span>
              <span className="font-bold text-black">{className}</span>
            </div>
            <div className="grid grid-cols-[130px_16px_1fr] items-center">
              <span className="font-semibold text-slate-700">Period of Times</span>
              <span>:</span>
              <span className="font-bold text-black">Mid Term {effTerm} Year {effAcademicYear}</span>
            </div>
          </div>

          {/* Section: SPIRITUAL HEALTH */}
          <div className="mb-3">
            <div className="bg-black text-white px-2.5 py-1 text-[11px] font-black uppercase tracking-wider mb-1">
              SPIRITUAL HEALTH
            </div>
            {renderSubjectTable(spiritualSubjects, 1)}
          </div>

          {/* Section: LEARNING JOURNEY */}
          <div className="mb-3">
            <div className="bg-black text-white px-2.5 py-1 text-[11px] font-black uppercase tracking-wider mb-1">
              LEARNING JOURNEY
            </div>
            {renderSubjectTable(learningJourneySubjects, 1)}
          </div>

          {/* Section: WEEKLY LESSONS */}
          <div className="mb-2">
            <div className="bg-black text-white px-2.5 py-1 text-[11px] font-black uppercase tracking-wider mb-1">
              WEEKLY LESSONS
            </div>
            {renderSubjectTable(weeklyLessonSubjects, 1)}
          </div>
        </div>

        {/* Footer Page 1 */}
        <div className="border-t border-slate-300 pt-2 flex justify-between items-center text-[9px] text-slate-500 font-medium">
          <span>{studentName} / Midterm {effTerm} - {effAcademicYear}</span>
          <span>Page 1 of 2</span>
        </div>
      </div>

      {/* PAGE 2 */}
      <div
        id={page2Id}
        className="w-[794px] min-w-[794px] h-[1123px] min-h-[1123px] bg-white p-[36px] flex flex-col justify-between box-border shadow-md print:shadow-none print:m-0 print:border-none"
        style={{ boxSizing: 'border-box' }}
      >
        <div>
          {/* Header Bar */}
          <div className="flex justify-between items-center border-b-2 border-black pb-2 mb-4">
            <div className="text-[11px] font-bold text-black uppercase">
              STUDENT'S PROGRESS REPORT — LAZUARDI GCS JUNIOR HIGH
            </div>
            <div className="text-[10px] font-semibold text-slate-700">
              {studentName} ({className})
            </div>
          </div>

          {/* Section: UNIT ACTIVITY */}
          <div className="mb-4">
            <div className="bg-black text-white px-2.5 py-1 text-[11px] font-black uppercase tracking-wider mb-1">
              UNIT ACTIVITY
            </div>
            {renderSubjectTable(unitActivitySubjects, 1)}
          </div>

          {/* Section: GENERAL COMMENTS (Large bordered box) */}
          <div className="mb-4">
            <div className="bg-black text-white px-2.5 py-1 text-[11px] font-black uppercase tracking-wider mb-1">
              GENERAL COMMENTS
            </div>
            <div className="border-2 border-black p-3.5 min-h-[105px] text-[11px] leading-relaxed text-slate-900 bg-white whitespace-pre-wrap">
              {effGeneralComment || '(General comments have not been entered)'}
            </div>
          </div>

          {/* Bottom Grid: Note & Attendance List */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* Note */}
            <div className="border border-black p-2.5 text-[10.5px]">
              <div className="font-bold text-black uppercase mb-1">Note:</div>
              <div className="space-y-0.5 text-slate-800">
                <div><span className="font-bold">A</span> : Achieved</div>
                <div><span className="font-bold">D</span> : Developing</div>
                <div><span className="font-bold">B</span> : Beginning</div>
              </div>
            </div>

            {/* Attendance List */}
            <div className="border border-black p-2.5 text-[10.5px]">
              <div className="font-bold text-black uppercase mb-1">Attendance List</div>
              <div className="space-y-0.5 text-slate-800">
                <div className="flex justify-between">
                  <span>Sakit:</span>
                  <span className="font-bold">{effAttendance?.sakit ?? 0} hari</span>
                </div>
                <div className="flex justify-between">
                  <span>Izin:</span>
                  <span className="font-bold">{effAttendance?.izin ?? 0} hari</span>
                </div>
                <div className="flex justify-between">
                  <span>Tanpa Keterangan:</span>
                  <span className="font-bold">{effAttendance?.tanpaKeterangan ?? 0} hari</span>
                </div>
              </div>
            </div>
          </div>

          {/* Signatory Block */}
          <div className="mt-2 pt-2 border-t border-black">
            <div className="text-[11px] font-bold text-black mb-3">
              Acknowledged by,
            </div>

            <div className="grid grid-cols-3 gap-6 text-center text-[10.5px]">
              {/* Principal */}
              <div className="flex flex-col justify-between h-[110px] items-center">
                <span className="font-bold text-black">Principal,</span>
                <div className="h-[45px] flex items-center justify-center">
                  {effPrincipalSignatureUrl ? (
                    <img 
                      src={effPrincipalSignatureUrl} 
                      alt="Principal Signature" 
                      className="h-10 w-auto object-contain"
                      crossOrigin="anonymous"
                    />
                  ) : null}
                </div>
                <div>
                  <div className="font-bold text-black underline">{effPrincipalName}</div>
                  {effPrincipalNiy && <div className="text-[9px] text-slate-600">NIY: {effPrincipalNiy}</div>}
                </div>
              </div>

              {/* Homeroom Teacher */}
              <div className="flex flex-col justify-between h-[110px] items-center">
                <span className="font-bold text-black">Homeroom Teacher,</span>
                <div className="h-[45px] flex items-center justify-center">
                  {effHomeroomSignatureUrl ? (
                    <img 
                      src={effHomeroomSignatureUrl} 
                      alt="Homeroom Teacher Signature" 
                      className="h-10 w-auto object-contain"
                      crossOrigin="anonymous"
                    />
                  ) : null}
                </div>
                <div>
                  <div className="font-bold text-black underline">{effHomeroomName}</div>
                  {effHomeroomNiy && <div className="text-[9px] text-slate-600">NIY: {effHomeroomNiy}</div>}
                </div>
              </div>

              {/* Parent */}
              <div className="flex flex-col justify-between h-[110px] items-center">
                <span className="font-bold text-black">Parent,</span>
                <div className="h-[45px] flex items-center justify-center" />
                <div>
                  <div className="font-bold text-black underline">( ............................................ )</div>
                  <div className="text-[9px] text-slate-600">Signature & Name</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Page 2 */}
        <div className="border-t border-slate-300 pt-2 flex justify-between items-center text-[9px] text-slate-500 font-medium">
          <span>{studentName} / Midterm {effTerm} - {effAcademicYear}</span>
          <span>Page 2 of 2</span>
        </div>
      </div>
    </div>
  );
};
