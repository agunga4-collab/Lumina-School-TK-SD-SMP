import * as React from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
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
  page2Id?: string; // Kept for legacy compatibility if queried specifically
  logoUrl?: string | null;

  reportSigningLocation?: string;
  reportSigningDate?: string;
  attendanceCutoffDate?: string;

  // React onReadyState callback to disable/enable buttons in parent
  onReadyChange?: (ready: boolean) => void;
}

interface PageConfig {
  pageNumber: number;
  headerType: 'main' | 'repeated';
  content: any[];
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
  logoUrl,
  reportSigningLocation = 'Depok',
  reportSigningDate,
  attendanceCutoffDate,
  onReadyChange,
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

  const effSigningLocation = snapshot?.reportSigningLocation || reportSigningLocation || 'Depok';
  const effSigningDate = snapshot?.reportSigningDate || reportSigningDate || '';
  const effCutoffDate = snapshot?.attendanceCutoffDate || attendanceCutoffDate || '';

  const [resolvedLogoUrl, setResolvedLogoUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (snapshot?.logoUrl) {
      setResolvedLogoUrl(snapshot.logoUrl);
      return;
    }
    if (logoUrl) {
      setResolvedLogoUrl(logoUrl);
      return;
    }

    const fetchLogo = async () => {
      try {
        const logoDoc = await getDoc(doc(db, 'settings', 'logos'));
        if (logoDoc.exists()) {
          const data = logoDoc.data() as any;
          if (data?.JUNIOR_HIGH?.reportHeaderLogo?.originalUrl) {
            setResolvedLogoUrl(data.JUNIOR_HIGH.reportHeaderLogo.originalUrl);
          } else if (data?.JUNIOR_HIGH?.rectangular) {
            setResolvedLogoUrl(data.JUNIOR_HIGH.rectangular);
          } else {
            setResolvedLogoUrl(null);
          }
        } else {
          const localLogos = localStorage.getItem('lumina_school_logos');
          if (localLogos) {
            const parsed = JSON.parse(localLogos);
            if (parsed?.JUNIOR_HIGH?.reportHeaderLogo?.originalUrl) {
              setResolvedLogoUrl(parsed.JUNIOR_HIGH.reportHeaderLogo.originalUrl);
            } else if (parsed?.JUNIOR_HIGH?.rectangular) {
              setResolvedLogoUrl(parsed.JUNIOR_HIGH.rectangular);
            } else {
              setResolvedLogoUrl(null);
            }
          }
        }
      } catch (err) {
        console.warn("Failed to load Junior High school logo in template:", err);
      }
    };
    fetchLogo();
  }, [snapshot, logoUrl]);

  // Local states to resolve dynamic Class and Homeroom profile from DB
  const [dbClass, setDbClass] = React.useState<Class | null>(null);

  React.useEffect(() => {
    if (snapshot) return; // Snapshot mode doesn't need DB resolve
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
    : (dbClass?.teacherSignatureUrl || currentClass?.teacherSignatureUrl || null);

  // Validate signatures to prevent broken images
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

  // Derive categories and subject rows
  const getCategoryData = (catId: string, fallbackName: string) => {
    if (snapshot) {
      const categories = Array.isArray(snapshot.categories) ? snapshot.categories : [];
      const found = categories.find(c => c && typeof c.name === 'string' && c.name.toUpperCase() === fallbackName.toUpperCase());
      const rawSubjects = found && Array.isArray(found.subjects) ? found.subjects : [];
      return rawSubjects.map(s => ({
        name: s && typeof s.name === 'string' ? s.name : '',
        goals: s && Array.isArray(s.goals) ? s.goals.map((g: any) => ({
          id: g?.id || '',
          text: g?.text || '',
          remark: g?.remark || '-'
        })) : []
      }));
    }

    const config = JH_MIDTERM_CATEGORIES.find(c => c.id === catId);
    if (!config) return [];

    const subjectsList = Array.isArray(config.subjects) ? config.subjects : [];
    return subjectsList.map(subjName => {
      const master = masterGoalsMap && typeof masterGoalsMap === 'object' ? masterGoalsMap[subjName] : undefined;
      const rawGoals = master && Array.isArray(master.goals) ? master.goals : [];
      const goals = rawGoals.map(g => ({
        id: g?.id || '',
        text: g?.text || '',
        remark: (studentDataDoc?.remarks?.[g?.id] || (subjName === 'Spiritual Health' ? (studentDataDoc?.spiritualHealthRemark || '') : '') || '-')
      }));
      return {
        name: subjName,
        goals
      };
    });
  };

  const spiritualSubjects = React.useMemo(() => getCategoryData('SPIRITUAL_HEALTH', 'SPIRITUAL HEALTH'), [snapshot, masterGoalsMap, studentDataDoc]);
  const learningJourneySubjects = React.useMemo(() => getCategoryData('LEARNING_JOURNEY', 'LEARNING JOURNEY'), [snapshot, masterGoalsMap, studentDataDoc]);
  const weeklyLessonSubjects = React.useMemo(() => getCategoryData('WEEKLY_LESSONS', 'WEEKLY LESSONS'), [snapshot, masterGoalsMap, studentDataDoc]);
  const unitActivitySubjects = React.useMemo(() => getCategoryData('UNIT_ACTIVITY', 'UNIT ACTIVITY'), [snapshot, masterGoalsMap, studentDataDoc]);

  const categoriesKey = React.useMemo(() => {
    return JSON.stringify([spiritualSubjects, learningJourneySubjects, weeklyLessonSubjects, unitActivitySubjects]);
  }, [spiritualSubjects, learningJourneySubjects, weeklyLessonSubjects, unitActivitySubjects]);

  // React Pagination States
  const [isPreparingPreview, setIsPreparingPreview] = React.useState<boolean>(true);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [previewPages, setPreviewPages] = React.useState<PageConfig[]>([]);
  const [retryTrigger, setRetryTrigger] = React.useState<number>(0);

  // Notify parent components only when preview is truly ready or not
  React.useEffect(() => {
    if (onReadyChange) {
      const isReady = !isPreparingPreview && !previewError && previewPages.length > 0;
      onReadyChange(isReady);
    }
  }, [isPreparingPreview, previewError, previewPages.length, onReadyChange]);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const measContainerRef = React.useRef<HTMLDivElement>(null);

  // Main Header (Page 1)
  const renderMainHeader = () => (
    <div id="meas-page-1-header" data-meas-id="page-1-header">
      {/* Header & Logo */}
      <div className="flex items-center justify-between border-b-2 border-black pb-3 mb-4">
        <div className="flex items-center gap-3">
          {resolvedLogoUrl ? (
            <img 
              src={resolvedLogoUrl} 
              alt="Lazuardi Junior High Logo"
              className="h-12 w-auto object-contain"
              crossOrigin={resolvedLogoUrl.startsWith("data:") ? undefined : "anonymous"}
            />
          ) : null}
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

      {/* Student Identity Card */}
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
    </div>
  );

  // Repeated Header (Page > 1)
  const renderRepeatedHeader = () => (
    <div id="meas-page-gt1-header" data-meas-id="page-gt1-header" className="flex justify-between items-center border-b-2 border-black pb-2 mb-4 shrink-0">
      <div className="text-[11px] font-bold text-black uppercase">
        STUDENT'S PROGRESS REPORT — LAZUARDI GCS JUNIOR HIGH
      </div>
      <div className="text-[10px] font-semibold text-slate-700">
        {studentName} ({className})
      </div>
    </div>
  );

  // Signatory Block
  const renderSignatoryBlock = () => (
    <div id="meas-signatory" data-meas-id="signatory" className="mt-2 pt-2 border-t border-black break-inside-avoid">
      <div className="text-[10.5px] text-black text-left mb-2">
        {effSigningLocation}, {effSigningDate || formattedDate}
      </div>

      <div className="grid grid-cols-3 gap-6 text-[10.5px]">
        {/* Principal Column */}
        <div className="flex flex-col text-left items-start">
          <div className="text-[10.5px] font-bold text-black min-h-[16px] mb-1">
            Acknowledged by,
          </div>
          <div className="font-bold text-black mb-2">Principal,</div>
          <div className="h-[50px] flex items-center justify-start">
            {isValidPrincipalSignature ? (
              <img 
                src={effPrincipalSignatureUrl} 
                alt="Principal Signature" 
                className="h-12 w-auto object-contain"
                crossOrigin={effPrincipalSignatureUrl.startsWith("data:") ? undefined : "anonymous"}
              />
            ) : (
              <div className="text-[9px] text-slate-400 italic">Verified Digitally</div>
            )}
          </div>
          <div className="mt-2">
            <div className="font-bold text-black underline">{effPrincipalName || '-'}</div>
            {effPrincipalNiy && <div className="text-[9px] text-slate-600">NIY: {effPrincipalNiy}</div>}
          </div>
        </div>

        {/* Homeroom Teacher Column */}
        <div className="flex flex-col text-center items-center">
          <div className="min-h-[16px] mb-1" />
          <div className="font-bold text-black mb-2">Homeroom Teacher,</div>
          <div className="h-[50px] flex items-center justify-center">
            {isValidHomeroomSignature ? (
              <img 
                src={effHomeroomSignatureUrl} 
                alt="Homeroom Teacher Signature" 
                className="h-12 w-auto object-contain"
                crossOrigin={effHomeroomSignatureUrl.startsWith("data:") ? undefined : "anonymous"}
              />
            ) : (
              <div className="text-[9px] text-slate-400 italic">Verified Digitally</div>
            )}
          </div>
          <div className="mt-2">
            <div className="font-bold text-black underline">{effHomeroomName || '-'}</div>
            <div className="text-[9px] text-slate-600">NIY: {(!effHomeroomNiy || effHomeroomNiy === '-') ? '-' : effHomeroomNiy}</div>
          </div>
        </div>

        {/* Parent Column */}
        <div className="flex flex-col text-center items-center">
          <div className="min-h-[16px] mb-1" />
          <div className="font-bold text-black mb-2">Parent,</div>
          <div className="h-[50px] flex items-center justify-center">
            <div className="h-12" />
          </div>
          <div className="mt-2">
            <div className="font-bold text-black underline">( ............................................ )</div>
            <div className="text-[9px] text-slate-600">Signature & Name</div>
          </div>
        </div>
      </div>
    </div>
  );

  // Attendance & Notes Block
  const renderAttendanceAndNotes = () => (
    <div id="meas-notes-attendance" data-meas-id="notes-attendance" className="grid grid-cols-2 gap-4 mb-4 break-inside-avoid">
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
        <div className="font-bold text-black uppercase mb-1">
          Attendance List
          {effCutoffDate && (
            <span className="block text-[8px] text-slate-500 font-bold italic normal-case mt-0.5">
              Attendance record up to {effCutoffDate}
            </span>
          )}
        </div>
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
  );

  // Render Table slice assigned to a page
  const renderTableSlice = (subjects: any[], catId: string) => {
    return (
      <table className="w-full text-left border-collapse border border-black text-[10.5px] mb-4">
        <thead>
          <tr className="bg-white text-black font-bold uppercase border-b border-black">
            <th className="border-r border-black p-1.5 w-[8%] text-center">NO.</th>
            <th className="border-r border-black p-1.5 w-[76%]">SUBJECT AND LEARNING GOALS</th>
            <th className="p-1.5 w-[16%] text-center">Remark</th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((subj, sIdx) => {
            const rowNo = subj.startIndex;
            const goals = subj.goals;
            return (
              <React.Fragment key={subj.name + sIdx}>
                {goals.map((goal: any, gIdx: number) => {
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
                            {subj.name} {subj.isContinued ? '(Continued)' : ''}
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

  // Measurement DOM definition (rendered offscreen with full geometry)
  const renderMeasurementDom = () => (
    <div
      ref={measContainerRef}
      className="absolute pointer-events-none select-none"
      style={{
        width: '722px',
        maxWidth: '722px',
        position: 'fixed',
        left: '-9999px',
        top: 0,
        zIndex: -9999,
        visibility: 'hidden',
      }}
      aria-hidden="true"
    >
      {renderMainHeader()}
      {renderRepeatedHeader()}
      
      {[
        { id: 'SPIRITUAL_HEALTH', name: 'SPIRITUAL HEALTH', subjects: spiritualSubjects },
        { id: 'LEARNING_JOURNEY', name: 'LEARNING JOURNEY', subjects: learningJourneySubjects },
        { id: 'WEEKLY_LESSONS', name: 'WEEKLY LESSONS', subjects: weeklyLessonSubjects },
        { id: 'UNIT_ACTIVITY', name: 'UNIT ACTIVITY', subjects: unitActivitySubjects },
      ].map(cat => (
        <div key={cat.id}>
          <div id={`meas-cat-header-${cat.id}`} data-meas-id={`cat-header-${cat.id}`} className="bg-black text-white px-2.5 py-1 text-[11px] font-black uppercase tracking-wider mb-1">
            {cat.name}
          </div>
          <table className="w-full text-left border-collapse border border-black text-[10.5px] mb-4">
            <thead>
              <tr id={`meas-tbl-header-${cat.id}`} data-meas-id={`tbl-header-${cat.id}`} className="bg-white text-black font-bold uppercase border-b border-black">
                <th className="border-r border-black p-1.5 w-[8%] text-center">NO.</th>
                <th className="border-r border-black p-1.5 w-[76%]">SUBJECT AND LEARNING GOALS</th>
                <th className="p-1.5 w-[16%] text-center">Remark</th>
              </tr>
            </thead>
            <tbody>
              {cat.subjects.map((subj) => (
                <React.Fragment key={subj.name}>
                  {(subj.goals.length > 0 ? subj.goals : [{ id: 'empty', text: '(No learning goals recorded)', remark: '-' }]).map((goal) => (
                    <tr 
                      key={goal.id} 
                      id={`meas-row-${cat.id}-${subj.name.replace(/[^a-zA-Z0-9]/g, '_')}-${goal.id}`} 
                      data-meas-id={`row-${cat.id}-${subj.name.replace(/[^a-zA-Z0-9]/g, '_')}-${goal.id}`}
                      className="border-b border-black"
                    >
                      <td className="border-r border-black p-1.5 text-center font-bold align-top">1.</td>
                      <td className="border-r border-black p-1.5 align-top">
                        <div className="font-bold text-black mb-1 text-[11px] uppercase">{subj.name}</div>
                        <div className="flex items-start gap-1.5 text-slate-800 leading-snug pl-1">
                          <span className="font-bold text-black select-none">•</span>
                          <span>{goal.text}</span>
                        </div>
                      </td>
                      <td className="p-1.5 text-center align-middle font-bold text-black">{goal.remark}</td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div id="meas-comments" data-meas-id="comments" className="mb-4">
        <div className="bg-black text-white px-2.5 py-1 text-[11px] font-black uppercase tracking-wider mb-1">
          GENERAL COMMENTS
        </div>
        <div className="border-2 border-black p-3.5 min-h-[105px] text-[11px] leading-relaxed text-slate-900 bg-white whitespace-pre-wrap">
          {effGeneralComment || '(General comments have not been entered)'}
        </div>
      </div>

      {renderAttendanceAndNotes()}
      {renderSignatoryBlock()}

      {/* Measurable Footer for accurate height calculations */}
      <div 
        id="meas-footer" 
        data-meas-id="footer" 
        className="border-t border-slate-300 pt-2 flex justify-between items-center text-[9px] text-slate-500 font-medium"
      >
        <span>{studentName} / Midterm {effTerm} - {effAcademicYear}</span>
        <span>Page 1 of 1</span>
      </div>
    </div>
  );

  // Fallback layout when pagination fails or is forced
  const buildFallbackPages = (): PageConfig[] => {
    return [
      {
        pageNumber: 1,
        headerType: 'main',
        content: [
          { type: 'category-header', catId: 'SPIRITUAL_HEALTH', catName: 'SPIRITUAL HEALTH' },
          { type: 'subject-table', catId: 'SPIRITUAL_HEALTH', subjects: spiritualSubjects },
          { type: 'category-header', catId: 'LEARNING_JOURNEY', catName: 'LEARNING JOURNEY' },
          { type: 'subject-table', catId: 'LEARNING_JOURNEY', subjects: learningJourneySubjects },
          { type: 'category-header', catId: 'WEEKLY_LESSONS', catName: 'WEEKLY LESSONS' },
          { type: 'subject-table', catId: 'WEEKLY_LESSONS', subjects: weeklyLessonSubjects },
        ].filter(b => b.type === 'category-header' ? true : (b.subjects && b.subjects.some((s: any) => s.goals.length > 0)))
      },
      {
        pageNumber: 2,
        headerType: 'repeated',
        content: [
          { type: 'category-header', catId: 'UNIT_ACTIVITY', catName: 'UNIT ACTIVITY' },
          { type: 'subject-table', catId: 'UNIT_ACTIVITY', subjects: unitActivitySubjects },
          { type: 'general-comments', height: 160 },
          { type: 'notes-attendance', height: 120 },
          { type: 'signatory', height: 250 }
        ].filter(b => b.type === 'category-header' ? true : (b.type !== 'subject-table' || (b.subjects && b.subjects.some((s: any) => s.goals.length > 0))))
      }
    ];
  };

  // Pure pagination algorithm with strict safe printable area and layout constants
  const computePaginatedPages = (params: {
    categoriesList: Array<{ id: string; name: string; subjects: any[] }>;
    page1HeaderHeight: number;
    pageGt1HeaderHeight: number;
    commentsHeight: number;
    notesAttendanceHeight: number;
    signatoryHeight: number;
    getMeasHeight: (measId: string, fallback: number) => number;
  }): PageConfig[] => {
    const {
      categoriesList,
      page1HeaderHeight,
      pageGt1HeaderHeight,
      commentsHeight,
      notesAttendanceHeight,
      signatoryHeight,
      getMeasHeight,
    } = params;

    // Layout Constants & Dimension Tokens (A4: 794 x 1123 px at 96 DPI)
    const PAGE_HEIGHT = 1123;
    const PAGE_PADDING_TOP = 36;
    const PAGE_PADDING_BOTTOM = 36;

    // Measured footer height from DOM
    const measuredFooterHeight = getMeasHeight('footer', 24);
    // Area reserved exclusively for the footer (border + text + padding)
    const FOOTER_RESERVED_HEIGHT = Math.max(28, measuredFooterHeight + 8);

    // Minimal 16-24px breathing space above footer (we use 24px for generous, professional breathing space)
    const BOTTOM_SAFETY_GAP = 24;

    // CONTENT_MAX_Y: The absolute bottom coordinate that content is forbidden to cross
    const CONTENT_MAX_Y = PAGE_HEIGHT - PAGE_PADDING_BOTTOM - FOOTER_RESERVED_HEIGHT - BOTTOM_SAFETY_GAP;

    // Top reserves: Top of the content area on page 1 vs continuation pages
    const PAGE_TOP_RESERVE = PAGE_PADDING_TOP + page1HeaderHeight + 14;
    const CONTINUATION_TOP_RESERVE = PAGE_PADDING_TOP + pageGt1HeaderHeight + 16;

    const TABLE_BOTTOM_MARGIN = 16;
    const BLOCK_SPACING = 12;

    const computedPages: PageConfig[] = [];
    let currentPageNumber = 1;
    let currentY = PAGE_TOP_RESERVE;
    let currentPageContent: any[] = [];
    let iterationCount = 0;
    const MAX_ITERATIONS = 800;

    const startNewPage = () => {
      if (currentPageContent.length > 0) {
        computedPages.push({
          pageNumber: currentPageNumber,
          headerType: currentPageNumber === 1 ? 'main' : 'repeated',
          content: [...currentPageContent]
        });
        currentPageNumber++;
      }
      currentY = CONTINUATION_TOP_RESERVE;
      currentPageContent = [];
    };

    // Loop through each subject category (Spiritual Health, Learning Journey, Weekly Lessons, Unit Activity)
    categoriesList.forEach((cat) => {
      const SECTION_HEADER_HEIGHT = getMeasHeight(`cat-header-${cat.id}`, 24) + 4; // text bar + mb-1
      const TABLE_HEADER_HEIGHT = getMeasHeight(`tbl-header-${cat.id}`, 26); // table thead row

      // Check first subject & first goal of category
      const firstSubj = cat.subjects[0];
      const firstGoal = firstSubj?.goals?.[0];
      let firstRowHeight = 45;
      if (firstSubj && firstGoal) {
        const rowMeasId = `row-${cat.id}-${firstSubj.name.replace(/[^a-zA-Z0-9]/g, '_')}-${firstGoal.id}`;
        firstRowHeight = getMeasHeight(rowMeasId, 45);
      }

      // Minimum space required to start a category:
      // Category header + Table thead + at least 1 goal row + table bottom margin
      const minCategoryStartHeight = SECTION_HEADER_HEIGHT + TABLE_HEADER_HEIGHT + firstRowHeight + TABLE_BOTTOM_MARGIN;

      // If predicted bottom exceeds CONTENT_MAX_Y, start category on a fresh page
      if (currentY + minCategoryStartHeight > CONTENT_MAX_Y && currentPageContent.length > 0) {
        startNewPage();
      }

      // Add category header
      currentPageContent.push({
        type: 'category-header',
        catId: cat.id,
        catName: cat.name,
        height: SECTION_HEADER_HEIGHT
      });
      currentY += SECTION_HEADER_HEIGHT;

      let currentTableSubjects: any[] = [];

      cat.subjects.forEach((subj, sIdx) => {
        const rowNo = sIdx + 1;
        let subjectGoalsForPage: any[] = [];
        const goalsList = subj.goals.length > 0 ? subj.goals : [{ id: 'empty', text: '(No learning goals recorded)', remark: '-' }];

        goalsList.forEach((goal: any, gIdx: number) => {
          if (++iterationCount > MAX_ITERATIONS) {
            throw new Error("Paginasi melebihi batas iterasi maksimal (safety guard).");
          }

          const rowMeasId = `row-${cat.id}-${subj.name.replace(/[^a-zA-Z0-9]/g, '_')}-${goal.id}`;
          let rowHeight = getMeasHeight(rowMeasId, 45);

          // Guard against single rows taller than the entire page content area
          const maxAllowedRowHeight = CONTENT_MAX_Y - CONTINUATION_TOP_RESERVE - SECTION_HEADER_HEIGHT - TABLE_HEADER_HEIGHT - TABLE_BOTTOM_MARGIN;
          if (rowHeight > maxAllowedRowHeight) {
            rowHeight = maxAllowedRowHeight;
          }

          // If table is not open yet on this page, opening it requires the table header (thead)
          const isTableOpenOnPage = currentTableSubjects.length > 0 || subjectGoalsForPage.length > 0;
          const costToPlace = isTableOpenOnPage ? rowHeight : (TABLE_HEADER_HEIGHT + rowHeight);
          const predictedBottomY = currentY + costToPlace + TABLE_BOTTOM_MARGIN;

          // If row cannot fit within CONTENT_MAX_Y, break to new page
          if (predictedBottomY > CONTENT_MAX_Y && (currentPageContent.length > 0 || isTableOpenOnPage)) {
            // Flush current goals of this subject into the table slice
            if (subjectGoalsForPage.length > 0) {
              currentTableSubjects.push({
                name: subj.name,
                goals: [...subjectGoalsForPage],
                startIndex: rowNo,
                isContinued: gIdx > subjectGoalsForPage.length
              });
              subjectGoalsForPage = [];
            }

            // Flush table to current page
            if (currentTableSubjects.length > 0) {
              currentPageContent.push({
                type: 'subject-table',
                catId: cat.id,
                subjects: [...currentTableSubjects]
              });
              currentTableSubjects = [];
            }

            startNewPage();

            // Repeat section title on continuation page with clean spacing
            currentPageContent.push({
              type: 'category-header-continued',
              catId: cat.id,
              catName: `${cat.name} (Continued)`,
              height: SECTION_HEADER_HEIGHT
            });
            currentY += SECTION_HEADER_HEIGHT;
          }

          // Place goal into subject slice
          subjectGoalsForPage.push({
            id: goal.id,
            text: goal.text,
            remark: goal.remark
          });

          if (currentTableSubjects.length === 0 && subjectGoalsForPage.length === 1) {
            currentY += TABLE_HEADER_HEIGHT + rowHeight;
          } else {
            currentY += rowHeight;
          }
        });

        if (subjectGoalsForPage.length > 0) {
          currentTableSubjects.push({
            name: subj.name,
            goals: [...subjectGoalsForPage],
            startIndex: rowNo,
            isContinued: goalsList.length > subjectGoalsForPage.length && subjectGoalsForPage.length > 0
          });
          subjectGoalsForPage = [];
        }
      });

      if (currentTableSubjects.length > 0) {
        currentPageContent.push({
          type: 'subject-table',
          catId: cat.id,
          subjects: [...currentTableSubjects]
        });
        currentTableSubjects = [];
        currentY += TABLE_BOTTOM_MARGIN;
      }
    });

    // 1. GENERAL COMMENTS BLOCK
    const commentsTotalCost = commentsHeight + BLOCK_SPACING;
    if (currentY + commentsTotalCost > CONTENT_MAX_Y && currentPageContent.length > 0) {
      startNewPage();
    }
    currentPageContent.push({
      type: 'general-comments',
      height: commentsHeight
    });
    currentY += commentsTotalCost;

    // 2. NOTES & ATTENDANCE BLOCK
    const notesTotalCost = notesAttendanceHeight + BLOCK_SPACING;
    if (currentY + notesTotalCost > CONTENT_MAX_Y && currentPageContent.length > 0) {
      startNewPage();
    }
    currentPageContent.push({
      type: 'notes-attendance',
      height: notesAttendanceHeight
    });
    currentY += notesTotalCost;

    // 3. SIGNATORY BLOCK
    const signatoryTotalCost = signatoryHeight + BLOCK_SPACING;
    if (currentY + signatoryTotalCost > CONTENT_MAX_Y && currentPageContent.length > 0) {
      startNewPage();
    }
    currentPageContent.push({
      type: 'signatory',
      height: signatoryHeight
    });
    currentY += signatoryTotalCost;

    // Finish last page
    if (currentPageContent.length > 0) {
      computedPages.push({
        pageNumber: currentPageNumber,
        headerType: currentPageNumber === 1 ? 'main' : 'repeated',
        content: [...currentPageContent]
      });
    }

    return computedPages.length > 0 ? computedPages : buildFallbackPages();
  };

  // Single reliable measurement and pagination lifecycle
  React.useEffect(() => {
    let isCancelled = false;
    let timerId: any = null;
    let timeoutId: any = null;
    let rafId: number | null = null;

    setIsPreparingPreview(true);
    setPreviewError(null);

    // Timeout safety guard: 12 seconds
    timeoutId = setTimeout(() => {
      if (isCancelled) return;
      console.error(`[MidtermPdfTemplate] Pagination timed out after 12s for student: ${studentName}`);
      setPreviewError("Pratinjau rapor tidak dapat disiapkan. Silakan coba lagi.");
      setIsPreparingPreview(false);
    }, 12000);

    const performMeasurementAndPagination = async () => {
      try {
        console.log(`[MidtermPdfTemplate] Memulai proses pratinjau untuk: "${studentName || 'Student'}" (${className || '-'})`);

        // Wait a frame and short delay for the measurement DOM to be attached and layout rendered
        await new Promise<void>((resolve) => {
          rafId = requestAnimationFrame(() => {
            timerId = setTimeout(resolve, 80);
          });
        });

        if (isCancelled) return;

        // Check document fonts ready if available
        if (typeof document !== 'undefined' && (document as any).fonts?.ready) {
          try {
            await Promise.race([
              (document as any).fonts.ready,
              new Promise((r) => setTimeout(r, 200)),
            ]);
          } catch {
            // ignore font load errors or timeouts
          }
        }

        if (isCancelled) return;

        const measContainer = measContainerRef.current;
        if (!measContainer) {
          throw new Error("Container elemen referensi pengukuran belum siap (DOM null).");
        }

        // Safe measurement helper that iterates elements by attribute (avoids querySelector syntax errors)
        const getMeasHeight = (measId: string, fallback: number): number => {
          if (!measContainer) return fallback;
          try {
            const elements = measContainer.querySelectorAll('[data-meas-id]');
            for (let i = 0; i < elements.length; i++) {
              if (elements[i].getAttribute('data-meas-id') === measId) {
                const h = (elements[i] as HTMLElement).offsetHeight;
                if (h && Number.isFinite(h) && h > 0) {
                  return h;
                }
              }
            }
          } catch (err) {
            console.warn('[MidtermPdfTemplate] Error reading height for', measId, err);
          }
          return fallback;
        };

        const page1HeaderHeight = getMeasHeight('page-1-header', 190);
        const pageGt1HeaderHeight = getMeasHeight('page-gt1-header', 40);
        const commentsHeight = getMeasHeight('comments', 160);
        const notesAttendanceHeight = getMeasHeight('notes-attendance', 120);
        const signatoryHeight = getMeasHeight('signatory', 250);

        const categoriesList = [
          { id: 'SPIRITUAL_HEALTH', name: 'SPIRITUAL HEALTH', subjects: spiritualSubjects },
          { id: 'LEARNING_JOURNEY', name: 'LEARNING JOURNEY', subjects: learningJourneySubjects },
          { id: 'WEEKLY_LESSONS', name: 'WEEKLY LESSONS', subjects: weeklyLessonSubjects },
          { id: 'UNIT_ACTIVITY', name: 'UNIT ACTIVITY', subjects: unitActivitySubjects },
        ].filter((c) => c.subjects.some((s) => s.goals && s.goals.length > 0));

        console.log(`[MidtermPdfTemplate] Tinggi terukur untuk "${studentName}":`, {
          header1: page1HeaderHeight,
          headerGt1: pageGt1HeaderHeight,
          comments: commentsHeight,
          notes: notesAttendanceHeight,
          signatory: signatoryHeight,
          activeCategories: categoriesList.length,
        });

        // Run pagination
        const computedPages = computePaginatedPages({
          categoriesList,
          page1HeaderHeight,
          pageGt1HeaderHeight,
          commentsHeight,
          notesAttendanceHeight,
          signatoryHeight,
          getMeasHeight,
        });

        if (isCancelled) return;

        if (!computedPages || computedPages.length === 0) {
          throw new Error("Hasil pembagian halaman kosong.");
        }

        console.log(`[MidtermPdfTemplate] Selesai membagi halaman: ${computedPages.length} halaman A4 untuk ${studentName}`);

        setPreviewPages(computedPages);
        setPreviewError(null);
      } catch (err: any) {
        if (isCancelled) return;
        console.error("[MidtermPdfTemplate] Error saat mengukur dan membagi halaman:", err);
        setPreviewError(err?.message || "Terjadi kesalahan teknis saat membagi tata letak halaman.");
      } finally {
        if (!isCancelled) {
          setIsPreparingPreview(false);
          if (timeoutId) clearTimeout(timeoutId);
        }
      }
    };

    performMeasurementAndPagination();

    return () => {
      isCancelled = true;
      if (timerId) clearTimeout(timerId);
      if (timeoutId) clearTimeout(timeoutId);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [
    studentName,
    studentNisn,
    className,
    effAcademicYear,
    effTerm,
    effGeneralComment,
    categoriesKey,
    retryTrigger,
  ]);

  // Loading/Error states layout
  if (isPreparingPreview || previewError || previewPages.length === 0) {
    return (
      <div ref={containerRef} className="w-[794px] min-w-[794px] min-h-[500px] bg-slate-900 border border-slate-800 rounded-3xl p-12 text-white flex flex-col items-center justify-center space-y-6 relative box-border shadow-2xl">
        {/* Render measurement DOM off-screen */}
        {renderMeasurementDom()}

        {previewError ? (
          <div className="max-w-md p-6 bg-slate-800 border border-red-500/30 rounded-2xl text-center space-y-4 shadow-lg animate-in fade-in">
            <div className="flex justify-center text-red-500">
              <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="space-y-1.5">
              <h4 className="text-base font-bold text-white">Pratinjau rapor tidak dapat disiapkan. Silakan coba lagi.</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                {previewError}
              </p>
            </div>
            <div className="flex justify-center gap-3 pt-2">
              <button
                onClick={() => {
                  setPreviewError(null);
                  setIsPreparingPreview(true);
                  setRetryTrigger((prev) => prev + 1);
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-md"
              >
                Coba Lagi
              </button>
              <button
                onClick={() => {
                  try {
                    const fallback = buildFallbackPages();
                    setPreviewPages(fallback);
                    setPreviewError(null);
                    setIsPreparingPreview(false);
                  } catch (e) {
                    console.error("Fallback construction failed", e);
                  }
                }}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-bold rounded-xl border border-slate-600 transition-all cursor-pointer"
              >
                Gunakan Fallback Layout
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-400"></div>
            <div className="space-y-1.5">
              <p className="text-sm font-black uppercase tracking-wider text-slate-200">Menyiapkan pratinjau rapor...</p>
              <p className="text-xs text-slate-400">Sedang mengukur tinggi konten & membagi halaman A4 secara otomatis.</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // PASS 2: Paginated Render (Beautiful printable A4 Page divs)
  return (
    <div ref={containerRef} className="flex flex-col items-center gap-8 py-4 bg-slate-100 font-sans print:bg-white print:p-0">
      {/* Hidden measurement elements (kept in case of background updates) */}
      {renderMeasurementDom()}

      {previewPages.map((page, pIdx) => {
        // Build unique page ID that will be fetched by the generator off-screen query selector
        const pageIdAttr = pIdx === 0 ? page1Id : (pIdx === 1 ? page2Id : `jh-midterm-generator-page-${pIdx + 1}`);
        
        return (
          <div
            key={page.pageNumber}
            id={pageIdAttr}
            className="w-[794px] min-w-[794px] h-[1123px] min-h-[1123px] bg-white p-[36px] flex flex-col justify-between box-border shadow-md print:shadow-none print:m-0 print:border-none"
            style={{ boxSizing: 'border-box' }}
          >
            <div>
              {/* Top Document Header */}
              {page.headerType === 'main' ? renderMainHeader() : renderRepeatedHeader()}

              {/* Page Contents */}
              <div className="space-y-3">
                {page.content.map((block, bIdx) => {
                  if (block.type === 'category-header' || block.type === 'category-header-continued') {
                    return (
                      <div key={bIdx} className="bg-black text-white px-2.5 py-1 text-[11px] font-black uppercase tracking-wider mb-1">
                        {block.catName}
                      </div>
                    );
                  }

                  if (block.type === 'subject-table') {
                    return (
                      <div key={bIdx}>
                        {renderTableSlice(block.subjects, block.catId)}
                      </div>
                    );
                  }

                  if (block.type === 'general-comments') {
                    return (
                      <div key={bIdx} className="mb-4 break-inside-avoid">
                        <div className="bg-black text-white px-2.5 py-1 text-[11px] font-black uppercase tracking-wider mb-1">
                          GENERAL COMMENTS
                        </div>
                        <div className="border-2 border-black p-3.5 min-h-[105px] text-[11px] leading-relaxed text-slate-900 bg-white whitespace-pre-wrap">
                          {effGeneralComment || '(General comments have not been entered)'}
                        </div>
                      </div>
                    );
                  }

                  if (block.type === 'notes-attendance') {
                    return (
                      <div key={bIdx}>
                        {renderAttendanceAndNotes()}
                      </div>
                    );
                  }

                  if (block.type === 'signatory') {
                    return (
                      <div key={bIdx}>
                        {renderSignatoryBlock()}
                      </div>
                    );
                  }

                  return null;
                })}
              </div>
            </div>

            {/* Bottom Footer */}
            <div className="border-t border-slate-300 pt-2 flex justify-between items-center text-[9px] text-slate-500 font-medium shrink-0">
              <span>{studentName} / Midterm {effTerm} - {effAcademicYear}</span>
              <span>Page {page.pageNumber} of {previewPages.length}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
