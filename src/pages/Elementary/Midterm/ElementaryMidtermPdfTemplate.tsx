import * as React from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import type { 
  ElementaryMidtermReportSnapshot,
  ElementaryMidtermMasterGoalDoc,
  ElementaryMidtermStudentDataDoc,
} from '../../../types/elementaryMidtermReport';
import {
  normalizeElementarySubjectName,
  ELEMENTARY_OFFICIAL_SUBJECTS,
  getActiveMasterGoals
} from '../../../types/elementaryMidtermReport';
import type { Student, Class, ReportConfig } from '../../../types';

interface ElementaryMidtermPdfTemplateProps {
  snapshot?: ElementaryMidtermReportSnapshot;
  student?: Student;
  currentClass?: Class;
  academicYear?: string;
  semester?: string;
  midtermTerm?: string;
  masterGoalsMap?: Record<string, ElementaryMidtermMasterGoalDoc>;
  studentDataDoc?: ElementaryMidtermStudentDataDoc;
  attendance?: { sakit: number | null; izin: number | null; tanpaKeterangan: number | null };
  reportConfig?: ReportConfig | null;
  logoUrl?: string | null;
  homeroomTeacherProfile?: { displayName: string; niy?: string; signatureUrl?: string | null };
  studentUaName?: string | null;
  page1Id?: string;
  page2Id?: string;
}

export const ElementaryMidtermPdfTemplate: React.FC<ElementaryMidtermPdfTemplateProps> = ({
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
  logoUrl,
  homeroomTeacherProfile,
  studentUaName,
}) => {
  // Derive student identity
  const studentName = snapshot ? snapshot.student.name : (student?.name || '');
  const studentNisn = snapshot ? (snapshot.student.nisn || '-') : (student?.nisn || (student as any)?.nis || '-');
  const className = snapshot ? snapshot.student.className : (currentClass?.name || '');
  const effAcademicYear = snapshot ? snapshot.academicYear : academicYear;
  const effTerm = snapshot ? snapshot.midtermTerm : midtermTerm;
  const effTermRoman = effTerm === '1' ? 'I' : 'II';
  
  const effGeneralComment = snapshot 
    ? snapshot.generalComment 
    : (studentDataDoc?.generalComment?.finalComment || studentDataDoc?.generalComment?.aiDraft || '');
  
  const effAttendance = snapshot ? snapshot.attendance : attendance;
  const effPrincipalName = snapshot 
    ? snapshot.signatory.principalName 
    : (reportConfig?.principalName || 'Principal');
  const effPrincipalTitle = snapshot 
    ? ((snapshot.signatory as any).principalTitle || 'Principal')
    : (reportConfig?.principalTitle || 'Principal');
  const effPrincipalNiy = snapshot 
    ? snapshot.signatory.principalNiy 
    : (reportConfig?.principalNIY || '');
  const effPrincipalSignatureUrl = snapshot 
    ? snapshot.signatory.principalSignatureUrl 
    : (reportConfig?.principalSignatureUrl || null);

  const [dbClass, setDbClass] = React.useState<Class | null>(null);

  React.useEffect(() => {
    if (snapshot) return;
    const targetClassId = student?.classId || currentClass?.id;
    if (!targetClassId) return;

    if (currentClass && currentClass.id === targetClassId) {
      setDbClass(currentClass);
      return;
    }

    const fetchClass = async () => {
      try {
        const snap = await getDoc(doc(db, 'classes', targetClassId));
        if (snap.exists()) {
          setDbClass({ id: snap.id, ...snap.data() } as Class);
        }
      } catch (e) {
        console.warn("Failed to fetch class in PDF Template:", targetClassId, e);
      }
    };
    fetchClass();
  }, [student?.classId, currentClass, snapshot]);

  const effHomeroomName = (() => {
    const isEmail = (val?: string | null) => !!val && val.includes('@');
    if (snapshot) {
      const snapName = snapshot.signatory.homeroomTeacherName;
      if (snapName && !isEmail(snapName)) return snapName;
      return 'Homeroom Teacher';
    }

    const classRoomName = dbClass?.homeroomTeacherName || currentClass?.homeroomTeacherName || homeroomTeacherProfile?.displayName;
    if (classRoomName && !isEmail(classRoomName)) return classRoomName;

    return 'Homeroom Teacher';
  })();

  const effHomeroomNiy = snapshot 
    ? (snapshot.signatory.homeroomTeacherNiy || '') 
    : (homeroomTeacherProfile?.niy || '');
  const effHomeroomSignatureUrl = snapshot 
    ? snapshot.signatory.homeroomTeacherSignatureUrl 
    : (dbClass?.teacherSignatureUrl || currentClass?.teacherSignatureUrl || homeroomTeacherProfile?.signatureUrl || null);

  const effLogoUrl = snapshot?.logoUrl || logoUrl || null;

  const isValidHomeroomSignature = effHomeroomSignatureUrl && 
    effHomeroomSignatureUrl !== "none" && 
    effHomeroomSignatureUrl !== "null" && 
    effHomeroomSignatureUrl !== "" &&
    (effHomeroomSignatureUrl.startsWith("data:") || effHomeroomSignatureUrl.startsWith("http://") || effHomeroomSignatureUrl.startsWith("https://") || effHomeroomSignatureUrl.startsWith("/"));

  const isValidPrincipalSignature = effPrincipalSignatureUrl && 
    effPrincipalSignatureUrl !== "none" && 
    effPrincipalSignatureUrl !== "null" && 
    effPrincipalSignatureUrl !== "" &&
    (effPrincipalSignatureUrl.startsWith("data:") || effPrincipalSignatureUrl.startsWith("http://") || effPrincipalSignatureUrl.startsWith("https://") || effPrincipalSignatureUrl.startsWith("/"));

  const getEffDate = () => {
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    let d = new Date();
    if (snapshot && (snapshot as any).publishedAt) {
      d = new Date((snapshot as any).publishedAt);
    } else if (snapshot && (snapshot as any).createdAt) {
      d = new Date((snapshot as any).createdAt);
    }
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  };
  const formattedDate = getEffDate();

  // Helper to extract subject data
  const getCategoriesFromLive = () => {
    const subjectsMap = masterGoalsMap || {};
    const academicMap: Record<string, { name: string; goals: Array<{ id: string; text: string; remark: string }> }> = {};
    const projectMap: Record<string, { name: string; goals: Array<{ id: string; text: string; remark: string }> }> = {};

    Object.keys(subjectsMap).forEach(subjKey => {
      const doc = subjectsMap[subjKey];
      if (!doc) return;

      const activeGoals = getActiveMasterGoals(doc);
      if (activeGoals.length === 0) return;

      const normName = normalizeElementarySubjectName(doc.subjectKey || subjKey);
      if (!normName) return;

      const studentUa = studentDataDoc?.performingArtsUA || studentUaName || '';

      if (normName === 'Performing Arts') {
        const rawKey = doc.subjectKey || subjKey;
        if (rawKey.includes('-') || rawKey.includes('::')) {
          const keyUa = rawKey.split(/[-:]+/).pop()?.trim();
          if (keyUa && studentUa && keyUa.toLowerCase() !== studentUa.toLowerCase()) {
            return;
          }
        }
      }

      const goalsList = activeGoals.map(g => ({
        id: g.id,
        text: g.text,
        remark: studentDataDoc?.remarks?.[g.id] || '-'
      }));

      let displayName = normName;
      if (normName === 'Performing Arts' && studentUa) {
        displayName = `Performing Arts (${studentUa})`;
      }

      if (doc.category === 'PROJECTS' || normName === 'Projects') {
        if (!projectMap[normName]) {
          projectMap[normName] = { name: displayName, goals: [] };
        }
        projectMap[normName].goals.push(...goalsList);
      } else {
        if (!academicMap[normName]) {
          academicMap[normName] = { name: displayName, goals: [] };
        }
        academicMap[normName].goals.push(...goalsList);
      }
    });

    const sortFn = (a: { name: string }, b: { name: string }) => {
      const idxA = ELEMENTARY_OFFICIAL_SUBJECTS.indexOf(normalizeElementarySubjectName(a.name) as any);
      const idxB = ELEMENTARY_OFFICIAL_SUBJECTS.indexOf(normalizeElementarySubjectName(b.name) as any);
      return (idxA >= 0 ? idxA : 99) - (idxB >= 0 ? idxB : 99);
    };

    const academicSubjects = Object.values(academicMap).sort(sortFn);
    const projectSubjects = Object.values(projectMap);

    return { academicSubjects, projectSubjects };
  };

  const snapshotCategories = snapshot?.categories || [];
  const liveCategories = snapshot ? null : getCategoriesFromLive();

  const rawAcademicSubjects = snapshot 
    ? (snapshotCategories.find(c => c.name === 'SUBJECTS')?.subjects || snapshotCategories[0]?.subjects || [])
    : (liveCategories?.academicSubjects || []);

  const rawProjectSubjects = snapshot 
    ? (snapshotCategories.find(c => c.name === 'PROJECTS')?.subjects || [])
    : (liveCategories?.projectSubjects || []);

  const academicSubjects = rawAcademicSubjects
    .map(subj => {
      const normName = normalizeElementarySubjectName(subj.name);
      if (!normName) return null;
      let displayName = normName;
      if (normName === 'Performing Arts' && (studentUaName || (subj as any).uaName)) {
        displayName = `Performing Arts (${studentUaName || (subj as any).uaName})`;
      } else if (subj.name.includes('Performing Arts') && subj.name.includes('(')) {
        displayName = subj.name;
      }
      return { ...subj, name: displayName };
    })
    .filter(Boolean) as Array<{ name: string; goals: Array<{ id: string; text: string; remark: string }> }>;

  academicSubjects.sort((a, b) => {
    const idxA = ELEMENTARY_OFFICIAL_SUBJECTS.indexOf(normalizeElementarySubjectName(a.name) as any);
    const idxB = ELEMENTARY_OFFICIAL_SUBJECTS.indexOf(normalizeElementarySubjectName(b.name) as any);
    return (idxA >= 0 ? idxA : 99) - (idxB >= 0 ? idxB : 99);
  });

  const projectSubjects = rawProjectSubjects
    .map(subj => {
      const normName = normalizeElementarySubjectName(subj.name);
      return normName ? { ...subj, name: normName === 'Projects' ? 'Projects' : subj.name } : null;
    })
    .filter(Boolean) as Array<{ name: string; goals: Array<{ id: string; text: string; remark: string }> }>;

  const renderAchievementCheck = (remark: string, target: 'A' | 'D' | 'B') => {
    const normRemark = (remark || '').trim().toUpperCase();
    if (normRemark === target) {
      return <span className="font-bold text-slate-900 text-[11px]">✓</span>;
    }
    return null;
  };

  const renderSubjectTable = (
    subjects: Array<{ name: string; goals: Array<{ id: string; text: string; remark: string }> }>,
    startSubjNo = 1
  ) => {
    return (
      <table className="w-full text-left border-collapse border border-slate-900 text-[10px]">
        <thead>
          <tr className="bg-slate-100 text-slate-900 font-bold uppercase border-b border-slate-900 text-center">
            <th className="border-r border-slate-900 p-1.5 w-[7%]">NO.</th>
            <th className="border-r border-slate-900 p-1.5 w-[68%] text-left">SUBJECTS AND LEARNING GOALS</th>
            <th className="p-1.5 w-[25%]" colSpan={3}>
              ACHIEVEMENT
              <div className="grid grid-cols-3 border-t border-slate-900 mt-1 pt-1 font-extrabold text-[9px]">
                <div>A</div>
                <div className="border-x border-slate-900">D</div>
                <div>B</div>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((subj, sIdx) => {
            return (
              <React.Fragment key={`subj-${sIdx}`}>
                {/* Subject Header Row - Displays Subject Number */}
                <tr className="bg-slate-50 font-extrabold border-b border-slate-900 text-slate-900 uppercase tr-keep-together">
                  <td className="border-r border-slate-900 p-1.5 text-center">{startSubjNo + sIdx}</td>
                  <td className="border-r border-slate-900 p-1.5 font-bold" colSpan={4}>
                    {subj.name}
                  </td>
                </tr>

                {/* Goals Rows - Displays Bullet and NO seq number */}
                {subj.goals.map((goal) => {
                  return (
                    <tr key={goal.id} className="border-b border-slate-900/40 tr-keep-together">
                      <td className="border-r border-slate-900 p-1.5 text-center text-slate-500 font-medium text-[9px]">
                        {/* No sequences, empty column */}
                      </td>
                      <td className="border-r border-slate-900 p-1.5 leading-relaxed text-slate-800 flex items-start gap-1">
                        <span className="shrink-0">•</span>
                        <span>{goal.text}</span>
                      </td>
                      <td className="border-r border-slate-900 p-1 text-center w-[8%] font-bold">
                        {renderAchievementCheck(goal.remark, 'A')}
                      </td>
                      <td className="border-r border-slate-900 p-1 text-center w-[8%] font-bold">
                        {renderAchievementCheck(goal.remark, 'D')}
                      </td>
                      <td className="p-1 text-center w-[8%] font-bold">
                        {renderAchievementCheck(goal.remark, 'B')}
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

  // Determine dynamic pagination layout based on goals count & projects
  const totalAcademicGoals = academicSubjects.reduce((acc, s) => acc + s.goals.length, 0);
  const totalProjectGoals = projectSubjects.reduce((acc, s) => acc + s.goals.length, 0);
  const totalGoals = totalAcademicGoals + totalProjectGoals;
  const hasProjects = projectSubjects.length > 0;

  let pageCount = 2;
  if (totalGoals <= 8 && !hasProjects && effGeneralComment.length < 300) {
    pageCount = 1;
  } else if (totalGoals > 18 || (hasProjects && totalGoals > 12) || effGeneralComment.length > 1000) {
    pageCount = 3;
  }

  // Footer text generator
  const normalizedYear = effAcademicYear.replace(/\//g, '-');
  const getFooterHTML = (pageNum: number) => {
    return (
      <div className="absolute bottom-[8mm] left-0 right-0 text-center text-[10px] text-slate-500 font-medium select-none no-print">
        {pageNum} {studentName}/{className}/Mid Term-{effTermRoman}/{normalizedYear}
      </div>
    );
  };

  return (
    <div className="bg-slate-200 p-4 space-y-6 flex flex-col items-center select-none printable-container w-full">
      {/* Dynamic @media print overrides */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * {
            visibility: hidden;
          }
          
          .printable-container, .printable-container * {
            visibility: visible;
          }
          
          .printable-container {
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            background: transparent !important;
          }
          
          .pdf-page {
            width: 210mm !important;
            min-height: 297mm !important;
            height: 297mm !important;
            margin: 0 !important;
            padding: 15mm !important;
            padding-bottom: 20mm !important;
            box-shadow: none !important;
            break-after: page !important;
            page-break-after: always !important;
            background: #fff !important;
            box-sizing: border-box !important;
            position: relative !important;
          }

          .pdf-page:last-child {
            break-after: auto !important;
            page-break-after: auto !important;
          }

          tr.tr-keep-together {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          
          .keep-together {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          
          thead {
            display: table-header-group !important;
          }

          /* Force footer print positioning */
          .absolute-footer {
            position: absolute !important;
            bottom: 8mm !important;
            left: 0 !important;
            right: 0 !important;
            text-align: center !important;
            visibility: visible !important;
          }
        }

        /* Screen Preview styles */
        .pdf-page {
          width: 210mm;
          min-height: 297mm;
          box-sizing: border-box;
          background: #fff;
          margin: 0 auto 12mm;
          padding: 15mm;
          padding-bottom: 20mm;
          overflow: hidden;
          position: relative;
          box-shadow: 0 4px 18px rgba(0,0,0,.18);
        }

        .signature-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          column-gap: 18mm;
          align-items: start;
          width: 100%;
        }

        .signature-image-slot {
          height: 26mm;
          display: flex;
          align-items: flex-end;
          justify-content: center;
        }

        .signature-image-slot img {
          width: auto;
          max-width: 42mm;
          height: auto;
          max-height: 22mm;
          object-fit: contain;
        }
      ` }} />

      {/* CASE 1: 1-PAGE RAPOR (Siswa dengan sedikit LG) */}
      {pageCount === 1 && (
        <div className="pdf-page flex flex-col justify-between">
          <div className="space-y-4">
            {/* Header: Logo Only */}
            <div className="flex items-center justify-start border-b border-slate-200 pb-2">
              {effLogoUrl ? (
                <img 
                  src={effLogoUrl} 
                  alt="Logo" 
                  className="h-10 max-w-[150px] object-contain"
                />
              ) : null}
            </div>

            {/* Student Identity Grid - No Date */}
            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-lg border border-slate-200 text-[10.5px]">
              <div className="space-y-1">
                <div className="flex">
                  <span className="w-24 font-bold text-slate-500 uppercase text-[9px]">Student's Name</span>
                  <span className="font-extrabold text-slate-900">: {studentName}</span>
                </div>
                <div className="flex">
                  <span className="w-24 font-bold text-slate-500 uppercase text-[9px]">NISN</span>
                  <span className="font-bold text-slate-800">: {studentNisn}</span>
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex">
                  <span className="w-20 font-bold text-slate-500 uppercase text-[9px]">Class</span>
                  <span className="font-extrabold text-slate-900">: {className}</span>
                </div>
                <div className="flex">
                  <span className="w-20 font-bold text-slate-500 uppercase text-[9px]">Period</span>
                  <span className="font-bold text-slate-800">: Year {effAcademicYear}, Mid Term {effTermRoman}</span>
                </div>
              </div>
            </div>

            {/* Section 1 Table */}
            <div className="space-y-2">
              <h2 className="text-[10px] font-black uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-0.5">
                SECTION 1: SUBJECTS AND LEARNING GOALS
              </h2>
              {renderSubjectTable(academicSubjects, 1)}
            </div>

            {/* General Comments */}
            <div className="space-y-1 pt-1 keep-together">
              <h3 className="text-[10px] font-black uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-0.5">
                General Comments :
              </h3>
              <div className="p-3 border border-slate-900 rounded-lg bg-slate-50/50 text-[10px] leading-relaxed font-medium whitespace-pre-wrap text-slate-800 min-h-[50px]">
                {effGeneralComment || <span className="text-slate-400 italic">Belum ada komentar.</span>}
              </div>
            </div>

            {/* Legend / Note */}
            <div className="space-y-1 keep-together">
              <h3 className="text-[9px] font-black uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-0.5">
                Note :
              </h3>
              <div className="text-[9px] leading-relaxed text-slate-700">
                <p><strong>A (Achieved):</strong> Demonstrates mastery of learning</p>
                <p><strong>D (Developing):</strong> Shows progress towards achieving learning goals and needs improvement to master them</p>
                <p><strong>B (Beginner):</strong> Early stage of learning, needs further support and guidance</p>
              </div>
            </div>

            {/* Attendance */}
            <div className="space-y-1 pt-1 keep-together">
              <h3 className="text-[10px] font-black uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-0.5">
                ATTENDANCE RECAP
              </h3>
              <div className="grid grid-cols-3 gap-2">
                <div className="border border-slate-200 p-1.5 rounded-lg text-center bg-slate-50">
                  <span className="block text-[8.5px] font-bold text-slate-500 uppercase">Sakit</span>
                  <span className="text-xs font-extrabold text-slate-900">{effAttendance?.sakit ?? 0} hari</span>
                </div>
                <div className="border border-slate-200 p-1.5 rounded-lg text-center bg-slate-50">
                  <span className="block text-[8.5px] font-bold text-slate-500 uppercase">Izin</span>
                  <span className="text-xs font-extrabold text-slate-900">{effAttendance?.izin ?? 0} hari</span>
                </div>
                <div className="border border-slate-200 p-1.5 rounded-lg text-center bg-slate-50">
                  <span className="block text-[8.5px] font-bold text-slate-500 uppercase">Tanpa Keterangan</span>
                  <span className="text-xs font-extrabold text-slate-900">{effAttendance?.tanpaKeterangan ?? 0} hari</span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer signatures */}
          <div className="space-y-3 keep-together text-left pt-2 border-t border-slate-200">
            <div>
              <p className="text-[10px] text-slate-900">Depok, {formattedDate}</p>
              <p className="text-[10px] font-bold text-slate-900 mt-0.5">Acknowledged by,</p>
            </div>

            {/* Signature Grid */}
            <div className="signature-grid">
              <div className="text-center">
                <span className="font-black text-slate-700 uppercase tracking-wider text-[9px] block mb-1">{effPrincipalTitle}</span>
                <div className="signature-image-slot">
                  {isValidPrincipalSignature ? (
                    <img src={effPrincipalSignatureUrl} alt="Signature" />
                  ) : null}
                </div>
                <div className="border-t border-slate-900 pt-1 mt-1 text-center">
                  <p className="font-extrabold text-slate-900 text-[10px]">{effPrincipalName}</p>
                  {effPrincipalNiy && <p className="text-[8.5px] text-slate-500">NIY: {effPrincipalNiy}</p>}
                </div>
              </div>

              <div className="text-center">
                <span className="font-black text-slate-700 uppercase tracking-wider text-[9px] block mb-1">Homeroom Teacher</span>
                <div className="signature-image-slot">
                  {isValidHomeroomSignature ? (
                    <img src={effHomeroomSignatureUrl} alt="Signature" />
                  ) : null}
                </div>
                <div className="border-t border-slate-900 pt-1 mt-1 text-center">
                  <p className="font-extrabold text-slate-900 text-[10px]">{effHomeroomName}</p>
                  {effHomeroomNiy && <p className="text-[8.5px] text-slate-500">NIY: {effHomeroomNiy}</p>}
                </div>
              </div>

              <div className="text-center">
                <span className="font-black text-slate-700 uppercase tracking-wider text-[9px] block mb-1">Parent</span>
                <div className="signature-image-slot">
                  {/* Empty Parent signature space */}
                </div>
                <div className="border-t border-slate-900 pt-1 mt-1 text-center">
                  <p className="font-extrabold text-slate-900 text-[10px]">&nbsp;</p>
                  <p className="text-[8.5px] text-slate-500 font-extrabold">Parent / Guardian</p>
                </div>
              </div>
            </div>
          </div>

          {/* Absolute page footer */}
          <div className="absolute-footer">
            {getFooterHTML(1)}
          </div>
        </div>
      )}

      {/* CASE 2: 2-PAGE RAPOR (Standard / Default) */}
      {pageCount === 2 && (
        <>
          {/* PAGE 1 */}
          <div className="pdf-page flex flex-col justify-between">
            <div className="space-y-4">
              {/* Header: Logo Only */}
              <div className="flex items-center justify-start border-b border-slate-200 pb-2">
                {effLogoUrl ? (
                  <img 
                    src={effLogoUrl} 
                    alt="Logo" 
                    className="h-10 max-w-[150px] object-contain"
                  />
                ) : null}
              </div>

              {/* Student Identity Grid - No Date */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-lg border border-slate-200 text-[10.5px]">
                <div className="space-y-1">
                  <div className="flex">
                    <span className="w-24 font-bold text-slate-500 uppercase text-[9px]">Student's Name</span>
                    <span className="font-extrabold text-slate-900">: {studentName}</span>
                  </div>
                  <div className="flex">
                    <span className="w-24 font-bold text-slate-500 uppercase text-[9px]">NISN</span>
                    <span className="font-bold text-slate-800">: {studentNisn}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex">
                    <span className="w-20 font-bold text-slate-500 uppercase text-[9px]">Class</span>
                    <span className="font-extrabold text-slate-900">: {className}</span>
                  </div>
                  <div className="flex">
                    <span className="w-20 font-bold text-slate-500 uppercase text-[9px]">Period</span>
                    <span className="font-bold text-slate-800">: Year {effAcademicYear}, Mid Term {effTermRoman}</span>
                  </div>
                </div>
              </div>

              {/* Section 1 Table (All Academic) */}
              <div className="space-y-2">
                <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-1">
                  SECTION 1: SUBJECTS AND LEARNING GOALS
                </h2>
                {renderSubjectTable(academicSubjects, 1)}
              </div>
            </div>

            {/* Absolute page footer */}
            <div className="absolute-footer">
              {getFooterHTML(1)}
            </div>
          </div>

          {/* PAGE 2 */}
          <div className="pdf-page flex flex-col justify-between">
            <div className="space-y-4">
              {/* Header: Logo Only */}
              <div className="flex items-center justify-start border-b border-slate-200 pb-2">
                {effLogoUrl ? (
                  <img 
                    src={effLogoUrl} 
                    alt="Logo" 
                    className="h-10 max-w-[150px] object-contain"
                  />
                ) : null}
              </div>

              {/* Section 2 Projects (if any) */}
              {projectSubjects.length > 0 && (
                <div className="space-y-2">
                  <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-1">
                    SECTION 2: PROJECTS AND LEARNING GOALS
                  </h2>
                  {renderSubjectTable(projectSubjects, 1)}
                </div>
              )}

              {/* General Comments */}
              <div className="space-y-1 keep-together">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-1">
                  General Comments :
                </h3>
                <div className="p-4 border border-slate-900 rounded-lg bg-slate-50/50 text-[11px] leading-relaxed font-medium whitespace-pre-wrap text-slate-800 min-h-[60px]">
                  {effGeneralComment || <span className="text-slate-400 italic">Belum ada komentar.</span>}
                </div>
              </div>

              {/* Legend / Note */}
              <div className="space-y-1 keep-together">
                <h3 className="text-[10px] font-black uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1">
                  Note :
                </h3>
                <div className="text-[10px] leading-relaxed text-slate-700 space-y-1">
                  <p><strong>A (Achieved):</strong> Demonstrates mastery of learning</p>
                  <p><strong>D (Developing):</strong> Shows progress towards achieving learning goals and needs improvement to master them</p>
                  <p><strong>B (Beginner):</strong> Early stage of learning, needs further support and guidance</p>
                </div>
              </div>

              {/* Attendance */}
              <div className="space-y-1 keep-together">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-1">
                  ATTENDANCE RECAP
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="border border-slate-300 p-2 rounded-lg text-center bg-slate-50">
                    <span className="block text-[9px] font-bold text-slate-500 uppercase">Sakit</span>
                    <span className="text-sm font-extrabold text-slate-900">{effAttendance?.sakit ?? 0} hari</span>
                  </div>
                  <div className="border border-slate-300 p-2 rounded-lg text-center bg-slate-50">
                    <span className="block text-[9px] font-bold text-slate-500 uppercase">Izin</span>
                    <span className="text-sm font-extrabold text-slate-900">{effAttendance?.izin ?? 0} hari</span>
                  </div>
                  <div className="border border-slate-300 p-2 rounded-lg text-center bg-slate-50">
                    <span className="block text-[9px] font-bold text-slate-500 uppercase">Tanpa Keterangan</span>
                    <span className="text-sm font-extrabold text-slate-900">{effAttendance?.tanpaKeterangan ?? 0} hari</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer signatures - directly under attendance recap with spacing */}
            <div className="space-y-4 keep-together text-left pt-3 border-t border-slate-200">
              <div>
                <p className="text-xs text-slate-900">Depok, {formattedDate}</p>
                <p className="text-xs font-bold text-slate-900 mt-1">Acknowledged by,</p>
              </div>

              {/* Signature Grid */}
              <div className="signature-grid">
                <div className="text-center">
                  <span className="font-black text-slate-700 uppercase tracking-wider text-[9.5px] block mb-1">{effPrincipalTitle}</span>
                  <div className="signature-image-slot">
                    {isValidPrincipalSignature ? (
                      <img src={effPrincipalSignatureUrl} alt="Signature" />
                    ) : null}
                  </div>
                  <div className="border-t border-slate-900 pt-1 mt-1 text-center">
                    <p className="font-extrabold text-slate-900 text-[11px]">{effPrincipalName}</p>
                    {effPrincipalNiy && <p className="text-[9px] text-slate-500">NIY: {effPrincipalNiy}</p>}
                  </div>
                </div>

                <div className="text-center">
                  <span className="font-black text-slate-700 uppercase tracking-wider text-[9.5px] block mb-1">Homeroom Teacher</span>
                  <div className="signature-image-slot">
                    {isValidHomeroomSignature ? (
                      <img src={effHomeroomSignatureUrl} alt="Signature" />
                    ) : null}
                  </div>
                  <div className="border-t border-slate-900 pt-1 mt-1 text-center">
                    <p className="font-extrabold text-slate-900 text-[11px]">{effHomeroomName}</p>
                    {effHomeroomNiy && <p className="text-[9px] text-slate-500">NIY: {effHomeroomNiy}</p>}
                  </div>
                </div>

                <div className="text-center">
                  <span className="font-black text-slate-700 uppercase tracking-wider text-[9.5px] block mb-1">Parent</span>
                  <div className="signature-image-slot">
                    {/* Empty Parent signature space */}
                  </div>
                  <div className="border-t border-slate-900 pt-1 mt-1 text-center">
                    <p className="font-extrabold text-slate-900 text-[11px]">&nbsp;</p>
                    <p className="text-[9px] text-slate-500 font-extrabold">Parent / Guardian</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Absolute page footer */}
            <div className="absolute-footer">
              {getFooterHTML(2)}
            </div>
          </div>
        </>
      )}

      {/* CASE 3: 3-PAGE RAPOR (Siswa dengan banyak LG/Projects) */}
      {pageCount === 3 && (
        <>
          {/* PAGE 1 */}
          <div className="pdf-page flex flex-col justify-between">
            <div className="space-y-4">
              {/* Header: Logo Only */}
              <div className="flex items-center justify-start border-b border-slate-200 pb-2">
                {effLogoUrl ? (
                  <img 
                    src={effLogoUrl} 
                    alt="Logo" 
                    className="h-10 max-w-[150px] object-contain"
                  />
                ) : null}
              </div>

              {/* Student Identity Grid - No Date */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-lg border border-slate-200 text-[10.5px]">
                <div className="space-y-1">
                  <div className="flex">
                    <span className="w-24 font-bold text-slate-500 uppercase text-[9px]">Student's Name</span>
                    <span className="font-extrabold text-slate-900">: {studentName}</span>
                  </div>
                  <div className="flex">
                    <span className="w-24 font-bold text-slate-500 uppercase text-[9px]">NISN</span>
                    <span className="font-bold text-slate-800">: {studentNisn}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex">
                    <span className="w-20 font-bold text-slate-500 uppercase text-[9px]">Class</span>
                    <span className="font-extrabold text-slate-900">: {className}</span>
                  </div>
                  <div className="flex">
                    <span className="w-20 font-bold text-slate-500 uppercase text-[9px]">Period</span>
                    <span className="font-bold text-slate-800">: Year {effAcademicYear}, Mid Term {effTermRoman}</span>
                  </div>
                </div>
              </div>

              {/* Section 1 Table Part 1 (First 5 Academic Subjects) */}
              <div className="space-y-2">
                <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-1">
                  SECTION 1: SUBJECTS AND LEARNING GOALS
                </h2>
                {renderSubjectTable(academicSubjects.slice(0, 5), 1)}
              </div>
            </div>

            {/* Absolute page footer */}
            <div className="absolute-footer">
              {getFooterHTML(1)}
            </div>
          </div>

          {/* PAGE 2 */}
          <div className="pdf-page flex flex-col justify-between">
            <div className="space-y-4">
              {/* Header: Logo Only */}
              <div className="flex items-center justify-start border-b border-slate-200 pb-2">
                {effLogoUrl ? (
                  <img 
                    src={effLogoUrl} 
                    alt="Logo" 
                    className="h-10 max-w-[150px] object-contain"
                  />
                ) : null}
              </div>

              {/* Section 1 Table Part 2 (Remaining Academic Subjects, if any) */}
              {academicSubjects.length > 5 && (
                <div className="space-y-2">
                  <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-1">
                    SECTION 1: SUBJECTS AND LEARNING GOALS (CONTINUED)
                  </h2>
                  {renderSubjectTable(academicSubjects.slice(5), 6)}
                </div>
              )}

              {/* Section 2 Projects (if any) */}
              {projectSubjects.length > 0 && (
                <div className="space-y-2 pt-2">
                  <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-1">
                    SECTION 2: PROJECTS AND LEARNING GOALS
                  </h2>
                  {renderSubjectTable(projectSubjects, 1)}
                </div>
              )}
            </div>

            {/* Absolute page footer */}
            <div className="absolute-footer">
              {getFooterHTML(2)}
            </div>
          </div>

          {/* PAGE 3 */}
          <div className="pdf-page flex flex-col justify-between">
            <div className="space-y-4">
              {/* Header: Logo Only */}
              <div className="flex items-center justify-start border-b border-slate-200 pb-2">
                {effLogoUrl ? (
                  <img 
                    src={effLogoUrl} 
                    alt="Logo" 
                    className="h-10 max-w-[150px] object-contain"
                  />
                ) : null}
              </div>

              {/* General Comments */}
              <div className="space-y-1 keep-together">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-1">
                  General Comments :
                </h3>
                <div className="p-4 border border-slate-900 rounded-lg bg-slate-50/50 text-[11px] leading-relaxed font-medium whitespace-pre-wrap text-slate-800 min-h-[80px]">
                  {effGeneralComment || <span className="text-slate-400 italic">Belum ada komentar.</span>}
                </div>
              </div>

              {/* Legend / Note */}
              <div className="space-y-1 keep-together">
                <h3 className="text-[10px] font-black uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1">
                  Note :
                </h3>
                <div className="text-[10px] leading-relaxed text-slate-700 space-y-1">
                  <p><strong>A (Achieved):</strong> Demonstrates mastery of learning</p>
                  <p><strong>D (Developing):</strong> Shows progress towards achieving learning goals and needs improvement to master them</p>
                  <p><strong>B (Beginner):</strong> Early stage of learning, needs further support and guidance</p>
                </div>
              </div>

              {/* Attendance */}
              <div className="space-y-1 keep-together">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-1">
                  ATTENDANCE RECAP
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="border border-slate-300 p-2.5 rounded-lg text-center bg-slate-50">
                    <span className="block text-[9px] font-bold text-slate-500 uppercase">Sakit</span>
                    <span className="text-sm font-extrabold text-slate-900">{effAttendance?.sakit ?? 0} hari</span>
                  </div>
                  <div className="border border-slate-300 p-2.5 rounded-lg text-center bg-slate-50">
                    <span className="block text-[9px] font-bold text-slate-500 uppercase">Izin</span>
                    <span className="text-sm font-extrabold text-slate-900">{effAttendance?.izin ?? 0} hari</span>
                  </div>
                  <div className="border border-slate-300 p-2.5 rounded-lg text-center bg-slate-50">
                    <span className="block text-[9px] font-bold text-slate-500 uppercase">Tanpa Keterangan</span>
                    <span className="text-sm font-extrabold text-slate-900">{effAttendance?.tanpaKeterangan ?? 0} hari</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer signatures - directly under attendance recap with spacing */}
            <div className="space-y-4 keep-together text-left pt-3 border-t border-slate-200">
              <div>
                <p className="text-xs text-slate-900">Depok, {formattedDate}</p>
                <p className="text-xs font-bold text-slate-900 mt-1">Acknowledged by,</p>
              </div>

              {/* Signature Grid */}
              <div className="signature-grid">
                <div className="text-center">
                  <span className="font-black text-slate-700 uppercase tracking-wider text-[9.5px] block mb-1">{effPrincipalTitle}</span>
                  <div className="signature-image-slot">
                    {isValidPrincipalSignature ? (
                      <img src={effPrincipalSignatureUrl} alt="Signature" />
                    ) : null}
                  </div>
                  <div className="border-t border-slate-900 pt-1 mt-1 text-center">
                    <p className="font-extrabold text-slate-900 text-[11px]">{effPrincipalName}</p>
                    {effPrincipalNiy && <p className="text-[9px] text-slate-500">NIY: {effPrincipalNiy}</p>}
                  </div>
                </div>

                <div className="text-center">
                  <span className="font-black text-slate-700 uppercase tracking-wider text-[9.5px] block mb-1">Homeroom Teacher</span>
                  <div className="signature-image-slot">
                    {isValidHomeroomSignature ? (
                      <img src={effHomeroomSignatureUrl} alt="Signature" />
                    ) : null}
                  </div>
                  <div className="border-t border-slate-900 pt-1 mt-1 text-center">
                    <p className="font-extrabold text-slate-900 text-[11px]">{effHomeroomName}</p>
                    {effHomeroomNiy && <p className="text-[9px] text-slate-500">NIY: {effHomeroomNiy}</p>}
                  </div>
                </div>

                <div className="text-center">
                  <span className="font-black text-slate-700 uppercase tracking-wider text-[9.5px] block mb-1">Parent</span>
                  <div className="signature-image-slot">
                    {/* Empty Parent signature space */}
                  </div>
                  <div className="border-t border-slate-900 pt-1 mt-1 text-center">
                    <p className="font-extrabold text-slate-900 text-[11px]">&nbsp;</p>
                    <p className="text-[9px] text-slate-500 font-extrabold">Parent / Guardian</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Absolute page footer */}
            <div className="absolute-footer">
              {getFooterHTML(3)}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
