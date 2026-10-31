import * as React from 'react';
import { Check } from 'lucide-react';
import type { 
  ElementaryUpperMonthlyProgressSnapshot,
  ElementaryUpperCurriculumDoc,
  ElementaryUpperStudentDataDoc,
  ElementaryUpperStudentNarrativesDoc,
  ElementaryUpperAttendanceSummary,
  ElementaryUpperReportSignatory,
  UpperLGAverageResult,
  ElementaryUpperSubject
} from '../../../../types/elementaryMonthlyUpperReport';
import { calculateUpperLGAverageAndPredicate } from '../../../../types/elementaryMonthlyUpperReport';
import { formatMonthLabel } from '../../../../services/elementaryMonthlyUpperReportService';
import type { Student, Class } from '../../../../types';

export interface UpperMonthlyProgressDocumentProps {
  snapshot?: ElementaryUpperMonthlyProgressSnapshot | null;
  previewData?: {
    student: Student;
    classInfo?: Class | null;
    academicYear: string;
    semester: string;
    month: string;
    monthLabel: string;
    curriculumDoc: ElementaryUpperCurriculumDoc | null;
    studentDataDoc: ElementaryUpperStudentDataDoc | null;
    narrativesDoc: ElementaryUpperStudentNarrativesDoc | null;
    attendanceSummary: ElementaryUpperAttendanceSummary;
    signatory: ElementaryUpperReportSignatory;
  } | null;
  isDraft?: boolean;
  onReadyChange?: (ready: boolean) => void;
}

export const UpperMonthlyProgressDocument: React.FC<UpperMonthlyProgressDocumentProps> = ({
  snapshot,
  previewData,
  isDraft = false,
  onReadyChange
}) => {
  const student = snapshot ? snapshot.student : previewData?.student;
  const studentName = student?.name || 'Nama Siswa';
  const studentNisn = student && 'nisn' in student ? student.nisn : ((student as Student)?.nis || (student as Student)?.nisn || '-');
  const className = snapshot ? snapshot.student.className : (previewData?.classInfo?.name || 'Class');
  const gradeLevel = snapshot ? snapshot.student.grade : (previewData?.classInfo?.level || 4);

  const academicYear = snapshot ? snapshot.academicYear : (previewData?.academicYear || '2025/2026');
  const semester = snapshot ? snapshot.semester : (previewData?.semester || '1');
  const month = snapshot ? snapshot.month : (previewData?.month || '');
  const monthLabel = snapshot ? snapshot.monthLabel : (previewData?.monthLabel || formatMonthLabel(month));

  const curriculum = snapshot ? snapshot.curriculum : previewData?.curriculumDoc;
  const studentData = snapshot ? null : previewData?.studentDataDoc;

  // Active subjects
  const activeSubjects = React.useMemo<ElementaryUpperSubject[]>(() => {
    if (!curriculum?.subjects) return [];
    return curriculum.subjects.filter(s => s.isActiveForReport !== false);
  }, [curriculum]);

  // Calculate LG results map
  const lgResultsMap = React.useMemo<Record<string, UpperLGAverageResult>>(() => {
    if (snapshot && snapshot.scoresSummary?.lgResults) {
      return snapshot.scoresSummary.lgResults;
    }
    const map: Record<string, UpperLGAverageResult> = {};
    if (curriculum?.subjects && studentData) {
      for (const sub of curriculum.subjects) {
        for (const lg of sub.learningGoals || []) {
          const kkm = lg.kkmOverride || sub.kkm || 70;
          const statusMode = studentData.lgStatus?.[lg.id] || 'AUTO';
          map[lg.id] = calculateUpperLGAverageAndPredicate(
            studentData.scores || {},
            lg.learningObjectives || [],
            kkm,
            statusMode
          );
        }
      }
    }
    return map;
  }, [snapshot, curriculum, studentData]);

  // Active projects & their LG results
  const activeProjects = React.useMemo(() => {
    if (!curriculum?.projects) return [];
    return curriculum.projects.filter(p => p.isActiveForReport !== false);
  }, [curriculum]);

  const projectLgResultsMap = React.useMemo<Record<string, UpperLGAverageResult>>(() => {
    if (snapshot && snapshot.scoresSummary?.projectLgResults) {
      return snapshot.scoresSummary.projectLgResults;
    }
    const map: Record<string, UpperLGAverageResult> = {};
    if (curriculum?.projects && studentData) {
      for (const proj of curriculum.projects) {
        for (const lg of proj.learningGoals || []) {
          const statusMode = studentData.projectLgStatus?.[lg.id] || 'AUTO';
          map[lg.id] = calculateUpperLGAverageAndPredicate(
            studentData.projectScores || {},
            lg.learningObjectives || [],
            70,
            statusMode
          );
        }
      }
    }
    return map;
  }, [snapshot, curriculum, studentData]);

  const generalComment = snapshot
    ? snapshot.narratives?.monthlyGeneralComment
    : previewData?.narrativesDoc?.monthlyGeneralComment || 'Belum ada komentar bulanan.';

  const attendance = snapshot ? snapshot.attendance : (previewData?.attendanceSummary || {
    startDate: '',
    endDate: '',
    presentDays: 0,
    totalDays: 0,
    percentage: 0,
    basisDescription: 'Belum dikonfigurasi',
    isAvailable: false
  });

  const signatory = snapshot ? snapshot.signatory : (previewData?.signatory || {
    principalName: 'Dewi Masyitoh, M.Pd.',
    principalTitle: 'Principal',
    principalNiy: '19820512',
    principalSignatureUrl: null,
    homeroomTeacherName: previewData?.classInfo?.homeroomTeacherName || 'Homeroom Teacher',
    homeroomTeacherNiy: '',
    homeroomTeacherSignatureUrl: null,
    signingDate: 'Depok, ' + monthLabel,
    signingLocation: 'Depok'
  });

  // Split subjects across Page 1 and Page 2:
  // If <= 5 subjects, all on Page 1. If > 5, put 5 on Page 1, rest on Page 2.
  const page1Subjects = React.useMemo(() => {
    if (activeSubjects.length <= 5) return activeSubjects;
    return activeSubjects.slice(0, 5);
  }, [activeSubjects]);

  const page2Subjects = React.useMemo(() => {
    if (activeSubjects.length <= 5) return [];
    return activeSubjects.slice(5);
  }, [activeSubjects]);

  React.useEffect(() => {
    if (onReadyChange) {
      onReadyChange(true);
    }
  }, [onReadyChange]);

  const renderSubjectTable = (subs: ElementaryUpperSubject[], startIdx: number = 0) => (
    <table 
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        border: '1.5px solid #1e3a8a',
        fontSize: '9.5px',
        backgroundColor: '#ffffff',
        marginBottom: '10px'
      }}
    >
      <thead>
        <tr style={{ backgroundColor: '#1e3a8a', color: '#ffffff', textAlign: 'center' }}>
          <th style={{ border: '1px solid #cbd5e1', padding: '6px 4px', width: '36px', fontWeight: 800 }}>NO</th>
          <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'left', fontWeight: 800 }}>
            SUBJECT AND LEARNING GOALS
          </th>
          <th colSpan={4} style={{ border: '1px solid #cbd5e1', padding: '4px', width: '136px', fontWeight: 800 }}>
            ACHIEVEMENT
          </th>
        </tr>
        <tr style={{ backgroundColor: '#2563eb', color: '#ffffff', textAlign: 'center', fontSize: '9px' }}>
          <th style={{ border: '1px solid #cbd5e1', padding: '3px' }}></th>
          <th style={{ border: '1px solid #cbd5e1', padding: '3px' }}></th>
          <th style={{ border: '1px solid #cbd5e1', padding: '3px', width: '34px', fontWeight: 700 }}>A</th>
          <th style={{ border: '1px solid #cbd5e1', padding: '3px', width: '34px', fontWeight: 700 }}>D</th>
          <th style={{ border: '1px solid #cbd5e1', padding: '3px', width: '34px', fontWeight: 700 }}>B</th>
          <th style={{ border: '1px solid #cbd5e1', padding: '3px', width: '34px', fontWeight: 700 }}>IP</th>
        </tr>
      </thead>
      <tbody>
        {subs.map((sub, sIdx) => {
          const actualIndex = startIdx + sIdx + 1;
          const activeLGs = (sub.learningGoals || []).filter(lg => lg.isActiveForReport !== false);
          return (
            <React.Fragment key={sub.id}>
              {/* Subject Title Row */}
              <tr style={{ backgroundColor: '#f1f5f9', fontWeight: 800, color: '#1e3a8a' }}>
                <td style={{ border: '1px solid #cbd5e1', padding: '5px 4px', textAlign: 'center' }}>
                  {actualIndex}
                </td>
                <td colSpan={5} style={{ border: '1px solid #cbd5e1', padding: '5px 8px', letterSpacing: '0.2px' }}>
                  {sub.name.toUpperCase()}
                </td>
              </tr>
              {/* Learning Goals Rows */}
              {activeLGs.length === 0 ? (
                <tr>
                  <td style={{ border: '1px solid #cbd5e1', padding: '4px' }}></td>
                  <td colSpan={5} style={{ border: '1px solid #cbd5e1', padding: '4px 8px', color: '#94a3b8', fontStyle: 'italic' }}>
                    Belum ada Learning Goals aktif.
                  </td>
                </tr>
              ) : (
                activeLGs.map((lg, lgIdx) => {
                  const res = lgResultsMap[lg.id];
                  const pred = res?.predicate || null;
                  return (
                    <tr key={lg.id} style={{ backgroundColor: lgIdx % 2 === 1 ? '#fafafa' : '#ffffff' }}>
                      <td style={{ border: '1px solid #cbd5e1', padding: '4px', textAlign: 'center', color: '#64748b', fontSize: '8.5px' }}>
                        {lg.code || `${actualIndex}.${lgIdx + 1}`}
                      </td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '4px 8px', color: '#1e293b', lineHeight: '1.3' }}>
                        {lg.title}
                      </td>
                      {/* Checkmarks for A, D, B, IP - Raw numbers are NEVER printed! */}
                      <td style={{ border: '1px solid #cbd5e1', padding: '4px', textAlign: 'center' }}>
                        {pred === 'A' && <Check size={13} strokeWidth={3} className="text-blue-700 mx-auto" />}
                      </td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '4px', textAlign: 'center' }}>
                        {pred === 'D' && <Check size={13} strokeWidth={3} className="text-blue-700 mx-auto" />}
                      </td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '4px', textAlign: 'center' }}>
                        {pred === 'B' && <Check size={13} strokeWidth={3} className="text-blue-700 mx-auto" />}
                      </td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '4px', textAlign: 'center', backgroundColor: '#fef3c7' }}>
                        {pred === 'IP' && <span style={{ fontWeight: 800, fontSize: '10px', color: '#b45309' }}>✓</span>}
                      </td>
                    </tr>
                  );
                })
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <div className="elem-upper-monthly-document-container flex flex-col items-center gap-6 py-6 print:p-0 print:gap-0">
      {/* Draft watermark badge */}
      {isDraft && (
        <div className="bg-amber-100 text-amber-900 border border-amber-300 px-4 py-1.5 rounded-full text-xs font-bold shadow-sm">
          PRATINJAU DOKUMEN MONTHLY PROGRESS (DRAFT)
        </div>
      )}

      {/* ========================================================================= */}
      {/* PAGE 1 (STRICT A4: 794px x 1123px)                                      */}
      {/* ========================================================================= */}
      <div
        className="elem-monthly-upper-page bg-white text-slate-800 shadow-xl print:shadow-none"
        style={{
          width: '794px',
          minHeight: '1123px',
          maxHeight: '1123px',
          boxSizing: 'border-box',
          padding: '24px 30px',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Header / Kop Biru */}
        <div
          style={{
            backgroundColor: '#1e3a8a',
            color: '#ffffff',
            borderRadius: '8px',
            padding: '10px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '14px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '8px',
                backgroundColor: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                color: '#1e3a8a',
                fontSize: '22px'
              }}
            >
              L
            </div>
            <div>
              <h2 style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.8px', textTransform: 'uppercase', margin: 0 }}>
                Sekolah Lazuardi Elementary
              </h2>
              <p style={{ fontSize: '10px', color: '#93c5fd', margin: '2px 0 0 0', fontWeight: 600 }}>
                Global Compassionate School · Upper Grade (Gr. 4–6)
              </p>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <h1 style={{ fontSize: '15px', fontWeight: 900, letterSpacing: '0.5px', textTransform: 'uppercase', margin: 0, color: '#f8fafc' }}>
              STUDENT&apos;S PROGRESS REPORT
            </h1>
            <span style={{ fontSize: '10px', color: '#bfdbfe', fontWeight: 700, textTransform: 'uppercase' }}>
              Monthly Assessment · {monthLabel}
            </span>
          </div>
        </div>

        {/* Identity Bar */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '6px 20px',
            backgroundColor: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            padding: '10px 16px',
            marginBottom: '14px',
            fontSize: '10px'
          }}
        >
          <div style={{ display: 'flex', gap: '6px' }}>
            <span style={{ color: '#64748b', fontWeight: 700, minWidth: '95px' }}>Student&apos;s Name</span>
            <span style={{ color: '#0f172a', fontWeight: 800 }}>: {studentName}</span>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <span style={{ color: '#64748b', fontWeight: 700, minWidth: '95px' }}>Academic Year</span>
            <span style={{ color: '#0f172a', fontWeight: 700 }}>: {academicYear}</span>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <span style={{ color: '#64748b', fontWeight: 700, minWidth: '95px' }}>NIS / NISN</span>
            <span style={{ color: '#0f172a', fontWeight: 700 }}>: {studentNisn}</span>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <span style={{ color: '#64748b', fontWeight: 700, minWidth: '95px' }}>Semester</span>
            <span style={{ color: '#0f172a', fontWeight: 700 }}>: Semester {semester}</span>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <span style={{ color: '#64748b', fontWeight: 700, minWidth: '95px' }}>Class / Grade</span>
            <span style={{ color: '#0f172a', fontWeight: 700 }}>: {className} (Grade {gradeLevel})</span>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <span style={{ color: '#64748b', fontWeight: 700, minWidth: '95px' }}>Period</span>
            <span style={{ color: '#1e3a8a', fontWeight: 800 }}>: {monthLabel}</span>
          </div>
        </div>

        {/* Subjects & Learning Goals - First Batch */}
        <div style={{ flex: 1 }}>
          <div
            style={{
              backgroundColor: '#1e3a8a',
              color: '#ffffff',
              padding: '5px 12px',
              borderRadius: '6px 6px 0 0',
              fontSize: '10px',
              fontWeight: 800,
              letterSpacing: '0.8px',
              textTransform: 'uppercase',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <span>SUBJECT AND LEARNING GOALS</span>
            <span style={{ fontSize: '8.5px', fontWeight: 600, color: '#93c5fd' }}>
              (A: Achieved · D: Developing · B: Beginning · IP: In Progress)
            </span>
          </div>

          {renderSubjectTable(page1Subjects, 0)}
        </div>

        {/* Page 1 Footer */}
        <div
          style={{
            borderTop: '1px solid #e2e8f0',
            paddingTop: '6px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '8.5px',
            color: '#94a3b8'
          }}
        >
          <span>Sekolah Lazuardi Elementary · Monthly Progress Report</span>
          <span>Halaman 1 dari 2</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* PAGE 2 (STRICT A4: 794px x 1123px)                                      */}
      {/* ========================================================================= */}
      <div
        className="elem-monthly-upper-page bg-white text-slate-800 shadow-xl print:shadow-none"
        style={{
          width: '794px',
          minHeight: '1123px',
          maxHeight: '1123px',
          boxSizing: 'border-box',
          padding: '24px 30px',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Page 2 Mini Header */}
        <div
          style={{
            borderBottom: '2px solid #1e3a8a',
            paddingBottom: '6px',
            marginBottom: '10px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '9.5px'
          }}
        >
          <span style={{ fontWeight: 800, color: '#1e3a8a', textTransform: 'uppercase' }}>
            Sekolah Lazuardi Elementary · Student&apos;s Progress Report
          </span>
          <span style={{ color: '#475569', fontWeight: 700 }}>
            {studentName} ({className}) · {monthLabel}
          </span>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Remaining Subjects if any */}
          {page2Subjects.length > 0 && (
            <div>
              <div
                style={{
                  backgroundColor: '#1e3a8a',
                  color: '#ffffff',
                  padding: '4px 10px',
                  borderRadius: '4px 4px 0 0',
                  fontSize: '9.5px',
                  fontWeight: 800,
                  textTransform: 'uppercase'
                }}
              >
                SUBJECT AND LEARNING GOALS (CONTINUED)
              </div>
              {renderSubjectTable(page2Subjects, page1Subjects.length)}
            </div>
          )}

          {/* PROJECT AND LEARNING GOALS SECTION */}
          <div style={{ border: '1px solid #1e3a8a', borderRadius: '6px', overflow: 'hidden' }}>
            <div
              style={{
                backgroundColor: '#1e3a8a',
                color: '#ffffff',
                padding: '5px 12px',
                fontSize: '10px',
                fontWeight: 800,
                letterSpacing: '0.8px',
                textTransform: 'uppercase'
              }}
            >
              PROJECT AND LEARNING GOALS
            </div>

            <div style={{ padding: '8px 10px', backgroundColor: '#f8fafc' }}>
              {activeProjects.length === 0 ? (
                <div style={{ fontSize: '9px', color: '#94a3b8', fontStyle: 'italic' }}>
                  Tidak ada proyek khusus untuk periode ini.
                </div>
              ) : (
                activeProjects.map((proj, pIdx) => (
                  <div key={proj.id} style={{ marginBottom: pIdx < activeProjects.length - 1 ? '8px' : '0' }}>
                    <div style={{ display: 'flex', gap: '6px', fontSize: '10px', fontWeight: 800, color: '#1e3a8a', marginBottom: '3px' }}>
                      <span>Project {pIdx + 1}:</span>
                      <span>{proj.name}</span>
                    </div>
                    {proj.performanceOfUnderstanding && (
                      <div style={{ fontSize: '9px', color: '#475569', marginBottom: '6px', lineHeight: '1.3' }}>
                        <span style={{ fontWeight: 700 }}>Performance of Understanding : </span>
                        <span>{proj.performanceOfUnderstanding}</span>
                      </div>
                    )}

                    {/* Project LG Table */}
                    <table
                      style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        border: '1px solid #cbd5e1',
                        fontSize: '9px',
                        backgroundColor: '#ffffff'
                      }}
                    >
                      <thead>
                        <tr style={{ backgroundColor: '#e2e8f0', color: '#1e293b', textAlign: 'center' }}>
                          <th style={{ border: '1px solid #cbd5e1', padding: '4px', width: '32px' }}>NO</th>
                          <th style={{ border: '1px solid #cbd5e1', padding: '4px 8px', textAlign: 'left' }}>Project Learning Goals</th>
                          <th style={{ border: '1px solid #cbd5e1', padding: '4px', width: '32px' }}>A</th>
                          <th style={{ border: '1px solid #cbd5e1', padding: '4px', width: '32px' }}>D</th>
                          <th style={{ border: '1px solid #cbd5e1', padding: '4px', width: '32px' }}>B</th>
                          <th style={{ border: '1px solid #cbd5e1', padding: '4px', width: '32px' }}>IP</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(proj.learningGoals || []).map((lg, lgIdx) => {
                          const res = projectLgResultsMap[lg.id];
                          const pred = res?.predicate || null;
                          return (
                            <tr key={lg.id}>
                              <td style={{ border: '1px solid #cbd5e1', padding: '3px', textAlign: 'center', color: '#64748b' }}>
                                {lgIdx + 1}
                              </td>
                              <td style={{ border: '1px solid #cbd5e1', padding: '3px 8px', color: '#1e293b' }}>
                                {lg.title}
                              </td>
                              <td style={{ border: '1px solid #cbd5e1', padding: '3px', textAlign: 'center' }}>
                                {pred === 'A' && <Check size={12} strokeWidth={3} className="text-blue-700 mx-auto" />}
                              </td>
                              <td style={{ border: '1px solid #cbd5e1', padding: '3px', textAlign: 'center' }}>
                                {pred === 'D' && <Check size={12} strokeWidth={3} className="text-blue-700 mx-auto" />}
                              </td>
                              <td style={{ border: '1px solid #cbd5e1', padding: '3px', textAlign: 'center' }}>
                                {pred === 'B' && <Check size={12} strokeWidth={3} className="text-blue-700 mx-auto" />}
                              </td>
                              <td style={{ border: '1px solid #cbd5e1', padding: '3px', textAlign: 'center', backgroundColor: '#fef3c7' }}>
                                {pred === 'IP' && <span style={{ fontWeight: 800, fontSize: '9px', color: '#b45309' }}>✓</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* COMMENTS SECTION */}
          <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
            <div
              style={{
                backgroundColor: '#1e3a8a',
                color: '#ffffff',
                padding: '4px 10px',
                fontSize: '9.5px',
                fontWeight: 800,
                letterSpacing: '0.5px'
              }}
            >
              COMMENTS:
            </div>
            <div
              style={{
                padding: '8px 12px',
                fontSize: '9.5px',
                lineHeight: '1.45',
                color: '#1e293b',
                minHeight: '65px',
                backgroundColor: '#ffffff'
              }}
            >
              {generalComment}
            </div>
          </div>

          {/* NOTE LEGEND & ATTENDANCE BOX */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.4fr 1fr',
              gap: '12px',
              backgroundColor: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              padding: '8px 12px',
              fontSize: '8.5px'
            }}
          >
            {/* Note Legend */}
            <div>
              <div style={{ fontWeight: 800, color: '#1e3a8a', marginBottom: '3px', textTransform: 'uppercase' }}>
                Note:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '95px 1fr', gap: '2px 4px', color: '#334155' }}>
                <span style={{ fontWeight: 700 }}>A (Achieved)</span>
                <span>: Demonstrates mastery of learning</span>
                <span style={{ fontWeight: 700 }}>D (Developing)</span>
                <span>: Shows progress towards achieving learning</span>
                <span style={{ fontWeight: 700 }}>B (Beginning)</span>
                <span>: Starting to show achievement of learning</span>
                <span style={{ fontWeight: 700 }}>IP (In Progress)</span>
                <span>: Learning goal is currently in progress / will be assessed in subsequent periods</span>
              </div>
            </div>

            {/* Attendance % */}
            <div style={{ borderLeft: '1px solid #cbd5e1', paddingLeft: '12px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ fontWeight: 800, color: '#1e3a8a', marginBottom: '3px', textTransform: 'uppercase' }}>
                Attendance
              </div>
              {attendance.isAvailable ? (
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 900, color: '#0f172a' }}>
                    {attendance.percentage}%
                  </div>
                  <div style={{ fontSize: '8px', color: '#64748b' }}>
                    {attendance.presentDays} of {attendance.totalDays} school days
                  </div>
                </div>
              ) : (
                <div style={{ color: '#94a3b8', fontStyle: 'italic' }}>
                  {attendance.basisDescription || 'Data presensi belum diisi'}
                </div>
              )}
            </div>
          </div>

          {/* SIGNATURES SECTION */}
          <div style={{ marginTop: '4px' }}>
            <div style={{ textAlign: 'right', fontSize: '9px', color: '#334155', fontWeight: 600, marginBottom: '6px' }}>
              {signatory.signingLocation}, {signatory.signingDate}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '12px',
                textAlign: 'center',
                fontSize: '9px'
              }}
            >
              {/* Homeroom Teacher */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ color: '#64748b', fontWeight: 700, marginBottom: '2px' }}>Acknowledged by,</span>
                <span style={{ color: '#0f172a', fontWeight: 700, marginBottom: '2px' }}>Homeroom Teacher</span>
                <div style={{ height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {signatory.homeroomTeacherSignatureUrl ? (
                    <img
                      src={signatory.homeroomTeacherSignatureUrl}
                      alt="Signature"
                      style={{ maxHeight: '42px', maxWidth: '90px', objectFit: 'contain' }}
                    />
                  ) : null}
                </div>
                <div style={{ fontWeight: 800, color: '#0f172a', borderTop: '1px solid #94a3b8', width: '85%', paddingTop: '3px' }}>
                  {signatory.homeroomTeacherName}
                </div>
                {signatory.homeroomTeacherNiy && (
                  <span style={{ fontSize: '8px', color: '#64748b' }}>NIY. {signatory.homeroomTeacherNiy}</span>
                )}
              </div>

              {/* Parents */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ color: '#64748b', fontWeight: 700, marginBottom: '2px' }}>Acknowledged by,</span>
                <span style={{ color: '#0f172a', fontWeight: 700, marginBottom: '2px' }}>Parents</span>
                <div style={{ height: '44px' }} />
                <div style={{ fontWeight: 800, color: '#0f172a', borderTop: '1px solid #94a3b8', width: '85%', paddingTop: '3px' }}>
                  ( .......................................... )
                </div>
              </div>

              {/* Principal */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ color: '#64748b', fontWeight: 700, marginBottom: '2px' }}>Approved by,</span>
                <span style={{ color: '#0f172a', fontWeight: 700, marginBottom: '2px' }}>Principal</span>
                <div style={{ height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {signatory.principalSignatureUrl ? (
                    <img
                      src={signatory.principalSignatureUrl}
                      alt="Signature"
                      style={{ maxHeight: '42px', maxWidth: '90px', objectFit: 'contain' }}
                    />
                  ) : null}
                </div>
                <div style={{ fontWeight: 800, color: '#0f172a', borderTop: '1px solid #94a3b8', width: '85%', paddingTop: '3px' }}>
                  {signatory.principalName}
                </div>
                {signatory.principalNiy && (
                  <span style={{ fontSize: '8px', color: '#64748b' }}>NIY. {signatory.principalNiy}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Page 2 Footer */}
        <div
          style={{
            borderTop: '1px solid #e2e8f0',
            paddingTop: '6px',
            marginTop: '8px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '8.5px',
            color: '#94a3b8'
          }}
        >
          <span>Sekolah Lazuardi Elementary · Monthly Progress Report</span>
          <span>Halaman 2 dari 2</span>
        </div>
      </div>
    </div>
  );
};
