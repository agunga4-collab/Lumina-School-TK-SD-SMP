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

  const spiritualSubjects = getCategoryData('SPIRITUAL_HEALTH', 'SPIRITUAL HEALTH');
  const learningJourneySubjects = getCategoryData('LEARNING_JOURNEY', 'LEARNING JOURNEY');
  const weeklyLessonSubjects = getCategoryData('WEEKLY_LESSONS', 'WEEKLY LESSONS');
  const unitActivitySubjects = getCategoryData('UNIT_ACTIVITY', 'UNIT ACTIVITY');

  // React Pagination State
  const [isMeasured, setIsMeasured] = React.useState<boolean>(false);
  const [paginatedPages, setPages] = React.useState<PageConfig[]>([]);

  // Trigger remeasure whenever key identity or goals content changes
  React.useEffect(() => {
    setIsMeasured(false);
  }, [
    studentName, 
    studentNisn, 
    className, 
    effAcademicYear, 
    effTerm, 
    effGeneralComment,
    JSON.stringify(spiritualSubjects),
    JSON.stringify(learningJourneySubjects),
    JSON.stringify(weeklyLessonSubjects),
    JSON.stringify(unitActivitySubjects)
  ]);

  React.useEffect(() => {
    if (isMeasured) return;

    const timer = setTimeout(() => {
      const page1HeaderHeight = document.getElementById('meas-page-1-header')?.offsetHeight || 190;
      const pageGt1HeaderHeight = document.getElementById('meas-page-gt1-header')?.offsetHeight || 40;
      const commentsHeight = document.getElementById('meas-comments')?.offsetHeight || 160;
      const notesAttendanceHeight = document.getElementById('meas-notes-attendance')?.offsetHeight || 120;
      const signatoryHeight = document.getElementById('meas-signatory')?.offsetHeight || 250;

      const categoriesList = [
        { id: 'SPIRITUAL_HEALTH', name: 'SPIRITUAL HEALTH', subjects: spiritualSubjects },
        { id: 'LEARNING_JOURNEY', name: 'LEARNING JOURNEY', subjects: learningJourneySubjects },
        { id: 'WEEKLY_LESSONS', name: 'WEEKLY LESSONS', subjects: weeklyLessonSubjects },
        { id: 'UNIT_ACTIVITY', name: 'UNIT ACTIVITY', subjects: unitActivitySubjects },
      ].filter(c => c.subjects.some(s => s.goals.length > 0));

      const totalPageHeight = 1123;
      const paddingY = 72; // top 36px, bottom 36px
      const footerHeight = 25;
      const usableHeightFirstPage = totalPageHeight - paddingY - page1HeaderHeight - footerHeight;
      const usableHeightSubsequentPage = totalPageHeight - paddingY - pageGt1HeaderHeight - footerHeight;

      const computedPages: PageConfig[] = [];
      let currentPageNumber = 1;
      let currentSpace = usableHeightFirstPage;
      let currentPageContent: any[] = [];

      const startNewPage = () => {
        computedPages.push({
          pageNumber: currentPageNumber,
          headerType: currentPageNumber === 1 ? 'main' : 'repeated',
          content: [...currentPageContent]
        });
        currentPageNumber++;
        currentSpace = usableHeightSubsequentPage;
        currentPageContent = [];
      };

      // Loop categories
      categoriesList.forEach((cat) => {
        const catHeaderHeight = document.getElementById(`meas-cat-header-${cat.id}`)?.offsetHeight || 25;
        const tblHeaderHeight = document.getElementById(`meas-tbl-header-${cat.id}`)?.offsetHeight || 25;

        // Check if cat header + tbl header + first goal of first subject fits
        const firstSubj = cat.subjects[0];
        const firstGoal = firstSubj?.goals[0];
        let firstRowHeight = 45;
        if (firstSubj && firstGoal) {
          const firstRowEl = document.getElementById(`meas-row-${cat.id}-${firstSubj.name.replace(/[^a-zA-Z0-9]/g, '_')}-${firstGoal.id}`);
          firstRowHeight = firstRowEl?.offsetHeight || 45;
        }

        const neededStartHeight = catHeaderHeight + tblHeaderHeight + firstRowHeight;
        if (currentSpace < neededStartHeight) {
          startNewPage();
        }

        // Add category header
        currentPageContent.push({
          type: 'category-header',
          catId: cat.id,
          catName: cat.name,
          height: catHeaderHeight
        });
        currentSpace -= catHeaderHeight;

        let currentTableSubjects: any[] = [];

        cat.subjects.forEach((subj, sIdx) => {
          let subjectGoalsForPage: any[] = [];
          const totalGoals = subj.goals.length > 0 ? subj.goals.length : 1;

          const goalsList = subj.goals.length > 0 ? subj.goals : [{ id: 'empty', text: '(No learning goals recorded)', remark: '-' }];

          goalsList.forEach((goal, gIdx) => {
            const rowId = `meas-row-${cat.id}-${subj.name.replace(/[^a-zA-Z0-9]/g, '_')}-${goal.id}`;
            const rowEl = document.getElementById(rowId);
            const rowHeight = rowEl?.offsetHeight || 45;

            // If row does not fit
            if (currentSpace < rowHeight || (subjectGoalsForPage.length === 0 && currentSpace < rowHeight + tblHeaderHeight)) {
              // Flush current page table if there's any
              if (subjectGoalsForPage.length > 0) {
                currentTableSubjects.push({
                  name: subj.name,
                  goals: [...subjectGoalsForPage],
                  startIndex: sIdx + 1,
                  isContinued: gIdx > 0
                });
              }

              if (currentTableSubjects.length > 0) {
                currentPageContent.push({
                  type: 'subject-table',
                  catId: cat.id,
                  subjects: [...currentTableSubjects]
                });
                currentTableSubjects = [];
              }

              startNewPage();

              // Add continued category header on new page
              currentPageContent.push({
                type: 'category-header-continued',
                catId: cat.id,
                catName: `${cat.name} (Continued)`,
                height: catHeaderHeight
              });
              currentSpace -= catHeaderHeight;

              subjectGoalsForPage = [];
            }

            subjectGoalsForPage.push({
              id: goal.id,
              text: goal.text,
              remark: goal.remark
            });
            currentSpace -= rowHeight;
          });

          if (subjectGoalsForPage.length > 0) {
            currentTableSubjects.push({
              name: subj.name,
              goals: [...subjectGoalsForPage],
              startIndex: sIdx + 1,
              isContinued: goalsList.length > subjectGoalsForPage.length && subjectGoalsForPage.length > 0
            });
          }
        });

        if (currentTableSubjects.length > 0) {
          currentPageContent.push({
            type: 'subject-table',
            catId: cat.id,
            subjects: [...currentTableSubjects]
          });
        }
      });

      // 1. GENERAL COMMENTS BLOCK
      const neededCommentsHeight = 30 + commentsHeight;
      if (currentSpace < neededCommentsHeight) {
        startNewPage();
      }
      currentPageContent.push({
        type: 'general-comments',
        height: commentsHeight
      });
      currentSpace -= neededCommentsHeight;

      // 2. NOTES & ATTENDANCE BLOCK
      if (currentSpace < notesAttendanceHeight) {
        startNewPage();
      }
      currentPageContent.push({
        type: 'notes-attendance',
        height: notesAttendanceHeight
      });
      currentSpace -= notesAttendanceHeight;

      // 3. SIGNATORY BLOCK
      if (currentSpace < signatoryHeight) {
        startNewPage();
      }
      currentPageContent.push({
        type: 'signatory',
        height: signatoryHeight
      });
      currentSpace -= signatoryHeight;

      // Finish last page
      computedPages.push({
        pageNumber: currentPageNumber,
        headerType: currentPageNumber === 1 ? 'main' : 'repeated',
        content: [...currentPageContent]
      });

      setPages(computedPages);
      setIsMeasured(true);
    }, 300);

    return () => clearTimeout(timer);
  }, [
    isMeasured, 
    studentName, 
    studentNisn, 
    className, 
    effAcademicYear, 
    effTerm, 
    effGeneralComment,
    spiritualSubjects,
    learningJourneySubjects,
    weeklyLessonSubjects,
    unitActivitySubjects
  ]);

  // Main Header (Page 1)
  const renderMainHeader = () => (
    <div id="meas-page-1-header">
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
    <div id="meas-page-gt1-header" className="flex justify-between items-center border-b-2 border-black pb-2 mb-4 shrink-0">
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
    <div id="meas-signatory" className="mt-2 pt-2 border-t border-black break-inside-avoid">
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
    <div id="meas-notes-attendance" className="grid grid-cols-2 gap-4 mb-4 break-inside-avoid">
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
          <tr id={`meas-tbl-header-${catId}`} className="bg-white text-black font-bold uppercase border-b border-black">
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

  // PASS 1: Measurement pass (Rendered hidden on absolute layout to measure heights precisely)
  if (!isMeasured) {
    return (
      <div className="absolute opacity-0 pointer-events-none" style={{ width: '722px', left: '-9999px', top: '-9999px' }}>
        {renderMainHeader()}
        {renderRepeatedHeader()}
        
        {/* Render all potential sections with their headers and tables for height measurement */}
        {[
          { id: 'SPIRITUAL_HEALTH', name: 'SPIRITUAL HEALTH', subjects: spiritualSubjects },
          { id: 'LEARNING_JOURNEY', name: 'LEARNING JOURNEY', subjects: learningJourneySubjects },
          { id: 'WEEKLY_LESSONS', name: 'WEEKLY LESSONS', subjects: weeklyLessonSubjects },
          { id: 'UNIT_ACTIVITY', name: 'UNIT ACTIVITY', subjects: unitActivitySubjects },
        ].map(cat => (
          <div key={cat.id}>
            <div id={`meas-cat-header-${cat.id}`} className="bg-black text-white px-2.5 py-1 text-[11px] font-black uppercase tracking-wider mb-1">
              {cat.name}
            </div>
            <table className="w-full text-left border-collapse border border-black text-[10.5px] mb-4">
              <thead>
                <tr id={`meas-tbl-header-${cat.id}`} className="bg-white text-black font-bold uppercase border-b border-black">
                  <th className="border-r border-black p-1.5 w-[8%] text-center">NO.</th>
                  <th className="border-r border-black p-1.5 w-[76%]">SUBJECT AND LEARNING GOALS</th>
                  <th className="p-1.5 w-[16%] text-center">Remark</th>
                </tr>
              </thead>
              <tbody>
                {cat.subjects.map((subj) => (
                  <React.Fragment key={subj.name}>
                    {(subj.goals.length > 0 ? subj.goals : [{ id: 'empty', text: '(No learning goals recorded)', remark: '-' }]).map((goal) => (
                      <tr key={goal.id} id={`meas-row-${cat.id}-${subj.name.replace(/[^a-zA-Z0-9]/g, '_')}-${goal.id}`} className="border-b border-black">
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

        {/* General Comments */}
        <div id="meas-comments" className="mb-4">
          <div className="bg-black text-white px-2.5 py-1 text-[11px] font-black uppercase tracking-wider mb-1">
            GENERAL COMMENTS
          </div>
          <div className="border-2 border-black p-3.5 min-h-[105px] text-[11px] leading-relaxed text-slate-900 bg-white whitespace-pre-wrap">
            {effGeneralComment || '(General comments have not been entered)'}
          </div>
        </div>

        {/* Note & Attendance */}
        {renderAttendanceAndNotes()}

        {/* Signatures */}
        {renderSignatoryBlock()}
      </div>
    );
  }

  // PASS 2: Paginated Render (Beautiful off-screen printable A4 Page divs)
  return (
    <div className="flex flex-col items-center gap-8 py-4 bg-slate-100 font-sans print:bg-white print:p-0">
      {paginatedPages.map((page, pIdx) => {
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
              <span>Page {page.pageNumber} of {paginatedPages.length}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
