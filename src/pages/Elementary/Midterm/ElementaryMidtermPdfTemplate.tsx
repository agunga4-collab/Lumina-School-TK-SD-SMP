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
  getActiveMasterGoals,
  normalizePerformingArtsUa,
  isPerformingArtsUaMatch,
  extractPerformingArtsUaFromKey
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
  reportSigningDate?: string;
  reportSigningLocation?: string;
  attendanceCutoffDate?: string;
  showAttendanceRecap?: boolean;
  onReadyChange?: (ready: boolean) => void;
}

interface PageData {
  academicSubjects: Array<{
    name: string;
    originalNo: number;
    isContinued?: boolean;
    isLastChunk?: boolean;
    goals: Array<{ id: string; text: string; remark: string }>;
  }>;
  projectSubjects: Array<{
    name: string;
    originalNo: number;
    isContinued?: boolean;
    isLastChunk?: boolean;
    goals: Array<{ id: string; text: string; remark: string }>;
  }>;
  showAcademicHeader?: boolean;
  showProjectHeader?: boolean;
  showFinalBlock?: boolean;
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
  reportSigningDate,
  reportSigningLocation = 'Depok',
  attendanceCutoffDate,
  showAttendanceRecap,
  onReadyChange
}) => {
  // Derive student identity
  const effShowAttendanceRecap = snapshot && ('showAttendanceRecap' in snapshot)
    ? snapshot.showAttendanceRecap !== false
    : showAttendanceRecap !== false;

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

  // Signing date & cutoff overrides
  const effSigningDate = snapshot?.reportSigningDate || reportSigningDate || formattedDate;
  const effSigningLocation = snapshot?.reportSigningLocation || reportSigningLocation || 'Depok';
  const effCutoffDate = snapshot?.attendanceCutoffDate || attendanceCutoffDate || '';

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
        const docUa = extractPerformingArtsUaFromKey(rawKey);
        if (docUa && studentUa) {
          if (!isPerformingArtsUaMatch(docUa, studentUa)) {
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
      if (normName === 'Performing Arts') {
        const uaName = studentUa || extractPerformingArtsUaFromKey(doc.subjectKey || subjKey) || '';
        if (uaName) displayName = `Performing Arts (${uaName})`;
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

  // ----------------------------------------------------
  // REAL-DOM MEASUREMENT AND GREEDY PACKING SYSTEM
  // ----------------------------------------------------
  const [pages, setPages] = React.useState<PageData[]>([]);
  const [isMeasured, setIsMeasured] = React.useState<boolean>(false);
  const [paginationError, setPaginationError] = React.useState<boolean>(false);

  React.useEffect(() => {
    let isCancelled = false;

    const measureAndPaginate = async () => {
      // 1. Wait for character-accurate system fonts to load completely
      if (typeof (document as any).fonts?.ready !== 'undefined') {
        await (document as any).fonts.ready;
      }
      
      // Let React complete initial mount rendering of the hidden measurer container
      await new Promise(r => setTimeout(r, 200));

      if (isCancelled) return;

      try {
        // 2. Measure Logo Header height
        const logoEl = document.getElementById('meas-logo-header');
        const logoHeight = logoEl ? logoEl.getBoundingClientRect().height + 16 : 70; // includes mb-4 (16px)

        // 3. Measure Student Identity Grid height
        const identityEl = document.getElementById('meas-student-identity');
        const identityHeight = identityEl ? identityEl.getBoundingClientRect().height + 16 : 90; // includes mb-4

        // 4. Measure Section Title header height
        const academicTitleEl = document.getElementById('meas-academic-title');
        const academicTitleHeight = academicTitleEl ? academicTitleEl.getBoundingClientRect().height + 8 : 25; // includes mb-2 (8px)

        // 5. Measure standard Table Header (thead) height
        const tableHeaderEl = document.getElementById('meas-table-header');
        const tableHeaderHeight = tableHeaderEl ? tableHeaderEl.getBoundingClientRect().height : 45;

        // 6. Measure Final Block (General Comments, legends, attendance, signatures) height
        const finalBlockEl = document.getElementById('meas-final-block');
        const finalBlockHeight = finalBlockEl ? finalBlockEl.getBoundingClientRect().height : 500;

        // Helper getters for subject row heights and individual goal row heights
        const acadSubjHeaderHeight = (idx: number) => {
          const el = document.getElementById(`meas-subj-row-acad-${idx}`);
          return el ? el.getBoundingClientRect().height : 30;
        };

        const acadGoalRowHeight = (sIdx: number, gIdx: number) => {
          const el = document.getElementById(`meas-goal-row-acad-${sIdx}-${gIdx}`);
          return el ? el.getBoundingClientRect().height : 40;
        };

        const projSubjHeaderHeight = (idx: number) => {
          const el = document.getElementById(`meas-subj-row-proj-${idx}`);
          return el ? el.getBoundingClientRect().height : 30;
        };

        const projGoalRowHeight = (sIdx: number, gIdx: number) => {
          const el = document.getElementById(`meas-goal-row-proj-${sIdx}-${gIdx}`);
          return el ? el.getBoundingClientRect().height : 40;
        };

        // Paginator Constants
        const PAGE_HEIGHT = 1123; // A4 height at 96 DPI
        const PADDING_TOP = 57;   // 15mm
        const PADDING_BOTTOM = 76; // 20mm
        const CONTENT_CAPACITY = PAGE_HEIGHT - PADDING_TOP - PADDING_BOTTOM; // 990px

        const pagesList: PageData[] = [];
        let currentPageIndex = 0;
        
        // Page 1 budget: logo and identity are present
        let remainingHeight = CONTENT_CAPACITY - logoHeight - identityHeight; 

        let currentPage: PageData = {
          academicSubjects: [],
          projectSubjects: [],
          showAcademicHeader: false,
          showProjectHeader: false,
          showFinalBlock: false
        };

        const startNewPage = () => {
          pagesList.push(currentPage);
          currentPageIndex++;
          // Page 2+ budget: only logo is present
          remainingHeight = CONTENT_CAPACITY - logoHeight; 
          currentPage = {
            academicSubjects: [],
            projectSubjects: [],
            showAcademicHeader: false,
            showProjectHeader: false,
            showFinalBlock: false
          };
        };

        // 1. Pack Academic Subjects
        if (academicSubjects.length > 0) {
          currentPage.showAcademicHeader = true;
          remainingHeight -= academicTitleHeight;
          
          if (currentPage.academicSubjects.length === 0) {
            remainingHeight -= tableHeaderHeight;
          }

          academicSubjects.forEach((subj, sIdx) => {
            const originalNo = sIdx + 1;
            let goalIndex = 0;
            let isContinued = false;

            while (goalIndex < subj.goals.length) {
              const currentGoal = subj.goals[goalIndex];
              const firstGoalHeight = acadGoalRowHeight(sIdx, goalIndex);
              const isTableOpenOnPage = currentPage.academicSubjects.length > 0;
              const tableHeaderCost = isTableOpenOnPage ? 0 : tableHeaderHeight;
              
              // Spacing cost required: Subject title row + Table thead header + first goal row
              const minRequired = acadSubjHeaderHeight(sIdx) + tableHeaderCost + firstGoalHeight;

              if (remainingHeight < minRequired) {
                startNewPage();
                currentPage.showAcademicHeader = true;
                remainingHeight -= academicTitleHeight;
              }

              if (currentPage.academicSubjects.length === 0) {
                remainingHeight -= tableHeaderHeight;
              }

              remainingHeight -= acadSubjHeaderHeight(sIdx);

              // Greedy pack goals into the current page slice
              const goalsForThisPage: typeof subj.goals = [];
              while (goalIndex < subj.goals.length) {
                const goal = subj.goals[goalIndex];
                const gh = acadGoalRowHeight(sIdx, goalIndex);
                if (remainingHeight >= gh) {
                  goalsForThisPage.push(goal);
                  remainingHeight -= gh;
                  goalIndex++;
                } else {
                  break;
                }
              }

              if (goalsForThisPage.length > 0) {
                currentPage.academicSubjects.push({
                  name: isContinued ? `${subj.name} (Continued)` : subj.name,
                  originalNo,
                  isContinued,
                  goals: goalsForThisPage,
                  isLastChunk: goalIndex >= subj.goals.length
                });
              }

              if (goalIndex < subj.goals.length) {
                isContinued = true;
              }
            }
          });
        }

        // 2. Pack Project Subjects
        if (projectSubjects.length > 0) {
          const projSectionHeaderCost = academicTitleHeight + tableHeaderHeight;
          const firstProjSubj = projectSubjects[0];
          const firstGoalHeight = projGoalRowHeight(0, 0);
          const minProjRequired = projSectionHeaderCost + projSubjHeaderHeight(0) + firstGoalHeight;

          if (remainingHeight < minProjRequired) {
            startNewPage();
          }

          if (currentPage.projectSubjects.length === 0) {
            currentPage.showProjectHeader = true;
            remainingHeight -= projSectionHeaderCost;
          }

          projectSubjects.forEach((subj, sIdx) => {
            const originalNo = sIdx + 1;
            let goalIndex = 0;
            let isContinued = false;

            while (goalIndex < subj.goals.length) {
              const currentGoal = subj.goals[goalIndex];
              const firstGoalHeight = projGoalRowHeight(sIdx, goalIndex);
              const isTableOpenOnPage = currentPage.projectSubjects.length > 0;
              const tableHeaderCost = isTableOpenOnPage ? 0 : tableHeaderHeight;
              const minRequired = projSubjHeaderHeight(sIdx) + tableHeaderCost + firstGoalHeight;

              if (remainingHeight < minRequired) {
                startNewPage();
                currentPage.showProjectHeader = true;
                remainingHeight -= projSectionHeaderCost;
              }

              if (currentPage.projectSubjects.length === 0) {
                remainingHeight -= tableHeaderHeight;
              }

              remainingHeight -= projSubjHeaderHeight(sIdx);

              const goalsForThisPage: typeof subj.goals = [];
              while (goalIndex < subj.goals.length) {
                const goal = subj.goals[goalIndex];
                const gh = projGoalRowHeight(sIdx, goalIndex);
                if (remainingHeight >= gh) {
                  goalsForThisPage.push(goal);
                  remainingHeight -= gh;
                  goalIndex++;
                } else {
                  break;
                }
              }

              if (goalsForThisPage.length > 0) {
                currentPage.projectSubjects.push({
                  name: isContinued ? `${subj.name} (Continued)` : subj.name,
                  originalNo,
                  isContinued,
                  goals: goalsForThisPage,
                  isLastChunk: goalIndex >= subj.goals.length
                });
              }

              if (goalIndex < subj.goals.length) {
                isContinued = true;
              }
            }
          });
        }

        // 3. Pack Final Block (Comments, Note, Attendance, Signatures)
        if (remainingHeight < finalBlockHeight) {
          startNewPage();
        }

        currentPage.showFinalBlock = true;
        remainingHeight -= finalBlockHeight;

        pagesList.push(currentPage);

        // 4. Safety Verification Check to guarantee NO content loss
        const totalInputGoals = academicSubjects.reduce((acc, s) => acc + s.goals.length, 0) +
                                projectSubjects.reduce((acc, s) => acc + s.goals.length, 0);

        const totalPackedGoals = pagesList.reduce((acc, p) => {
          const acadCount = p.academicSubjects.reduce((sum, s) => sum + s.goals.length, 0);
          const projCount = p.projectSubjects.reduce((sum, s) => sum + s.goals.length, 0);
          return acc + acadCount + projCount;
        }, 0);

        if (totalInputGoals !== totalPackedGoals) {
          console.error(`[SAFETY CHECK FAILED] Total input goals (${totalInputGoals}) does not match packed goals (${totalPackedGoals}). Pagination aborted!`);
          setPaginationError(true);
        } else {
          console.log(`[SAFETY CHECK PASSED] Successfully packed all ${totalInputGoals} goals across ${pagesList.length} pages using real pixel heights.`);
          setPages(pagesList);
          setPaginationError(false);
          setIsMeasured(true);
        }
      } catch (err) {
        console.error("Error during real-DOM height pagination:", err);
        setPaginationError(true);
      }
    };

    measureAndPaginate();

    return () => {
      isCancelled = true;
    };
  }, [academicSubjects.length, projectSubjects.length, effGeneralComment, studentName, effLogoUrl]);

  React.useEffect(() => {
    if (onReadyChange) {
      onReadyChange(isMeasured && !paginationError);
    }
  }, [isMeasured, paginationError, onReadyChange]);

  const normalizedYear = effAcademicYear.replace(/\//g, '-');

  const renderPartitionedTable = (
    subjects: Array<{ name: string; originalNo: number; isContinued?: boolean; isLastChunk?: boolean; goals: Array<{ id: string; text: string; remark: string }> }>,
    sectionTitle: string
  ) => {
    if (subjects.length === 0) return null;
    return (
      <div className="space-y-2">
        <h2 className="text-[10px] font-black uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-0.5">
          {sectionTitle}
        </h2>
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
                  {/* Subject Header Row */}
                  <tr className="bg-slate-50 font-extrabold border-b border-slate-900 text-slate-900 uppercase tr-keep-together">
                    <td className="border-r border-b border-slate-900 p-1.5 text-center align-middle font-bold text-slate-900 text-[10px]">
                      {subj.isContinued ? "" : subj.originalNo}
                    </td>
                    <td className="border-b border-slate-900 p-1.5 font-bold" colSpan={4}>
                      {subj.name}
                    </td>
                  </tr>

                  {/* Goals Rows */}
                  {subj.goals.map((goal, gIdx) => {
                    const isLastGoal = gIdx === subj.goals.length - 1;
                    return (
                      <tr key={goal.id} className="tr-keep-together">
                        <td
                          className={`border-r border-slate-900 p-1.5 text-center align-middle text-[10px] ${
                            isLastGoal ? "border-b border-slate-900" : ""
                          }`}
                        />
                        <td className="border-r border-b border-slate-900 p-1.5 leading-relaxed text-slate-800">
                          <div className="flex items-start gap-1">
                            <span className="shrink-0">•</span>
                            <span>{goal.text}</span>
                          </div>
                        </td>
                        <td className="border-r border-b border-slate-900 p-1 text-center w-[8%] font-bold align-middle">
                          {renderAchievementCheck(goal.remark, 'A')}
                        </td>
                        <td className="border-r border-b border-slate-900 p-1 text-center w-[8%] font-bold align-middle">
                          {renderAchievementCheck(goal.remark, 'D')}
                        </td>
                        <td className="border-b border-slate-900 p-1 text-center w-[8%] font-bold align-middle">
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
      </div>
    );
  };

  const renderMeasurer = () => {
    return (
      <div
        id="elem-pdf-measurer-container"
        style={{
          position: 'absolute',
          left: '-9999px',
          top: 0,
          width: '210mm',
          boxSizing: 'border-box',
          padding: '15mm',
          paddingBottom: '20mm',
          background: '#fff',
          fontFamily: 'sans-serif',
          visibility: 'hidden',
          pointerEvents: 'none'
        }}
        aria-hidden="true"
      >
        {/* 1. Logo Header */}
        <div id="meas-logo-header" className="flex items-center justify-between border-b-2 border-slate-900 pb-2 mb-4">
          {effLogoUrl ? (
            <img src={effLogoUrl} alt="Logo" className="h-14 max-w-[150px] object-contain" />
          ) : <div className="h-14" />}
          <div className="text-right">
            <h1 className="text-[13px] font-black text-slate-900 uppercase">STUDENT'S PROGRESS REPORT</h1>
          </div>
        </div>

        {/* 2. Identity Grid */}
        <div id="meas-student-identity" className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-lg border border-slate-200 text-[10.5px] mb-4">
          <div className="font-extrabold text-slate-900">Name: {studentName}</div>
        </div>

        {/* 3. Section Title */}
        <div id="meas-academic-title" className="text-[10px] font-black uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-0.5 mb-2">
          SECTION 1: SUBJECTS AND LEARNING GOALS
        </div>

        {/* 4. Table Header */}
        <table className="w-full text-left border-collapse border border-slate-900 text-[10px]">
          <thead>
            <tr className="bg-slate-100 text-slate-900 font-bold uppercase border-b border-slate-900 text-center">
              <th id="meas-table-header" className="border-r border-slate-900 p-1.5 w-[7%]">NO.</th>
              <th className="border-r border-slate-900 p-1.5 w-[68%] text-left">SUBJECTS AND LEARNING GOALS</th>
              <th className="p-1.5 w-[25%]" colSpan={3}>ACHIEVEMENT</th>
            </tr>
          </thead>
          <tbody>
            {/* 5. Academic Subjects */}
            {academicSubjects.map((subj, sIdx) => (
              <React.Fragment key={`meas-acad-${sIdx}`}>
                <tr id={`meas-subj-row-acad-${sIdx}`} className="bg-slate-50 font-extrabold border-b border-slate-900 text-slate-900 uppercase">
                  <td className="p-1.5" colSpan={5}>{subj.name}</td>
                </tr>
                {subj.goals.map((goal, gIdx) => (
                  <tr id={`meas-goal-row-acad-${sIdx}-${gIdx}`} key={goal.id} className="border-b border-slate-900">
                    <td className="p-1.5">•</td>
                    <td className="p-1.5 leading-relaxed">{goal.text}</td>
                    <td className="p-1">Check</td>
                  </tr>
                ))}
              </React.Fragment>
            ))}

            {/* 6. Project Subjects */}
            {projectSubjects.map((subj, sIdx) => (
              <React.Fragment key={`meas-proj-${sIdx}`}>
                <tr id={`meas-subj-row-proj-${sIdx}`} className="bg-slate-50 font-extrabold border-b border-slate-900 text-slate-900 uppercase">
                  <td className="p-1.5" colSpan={5}>{subj.name}</td>
                </tr>
                {subj.goals.map((goal, gIdx) => (
                  <tr id={`meas-goal-row-proj-${sIdx}-${gIdx}`} key={goal.id} className="border-b border-slate-900">
                    <td className="p-1.5">•</td>
                    <td className="p-1.5 leading-relaxed">{goal.text}</td>
                    <td className="p-1">Check</td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>

        {/* 7. Final Block */}
        <div id="meas-final-block" className="space-y-4 pt-4">
          <div className="space-y-1">
            <h3 className="text-xs font-black uppercase text-slate-900">General Comments :</h3>
            <div className="p-4 border border-slate-900 rounded-lg text-[11px] leading-relaxed whitespace-pre-wrap min-h-[60px]">
              {effGeneralComment || "Belum ada komentar."}
            </div>
          </div>
          <div className="text-[10px] space-y-1">
            <p><strong>A (Achieved)</strong></p>
          </div>
          {effShowAttendanceRecap && (
            <div className="grid grid-cols-3 gap-3">
              <div className="border border-slate-300 p-2 text-center">Sakit</div>
              <div className="border border-slate-300 p-2 text-center">Izin</div>
              <div className="border border-slate-300 p-2 text-center">Tanpa Keterangan</div>
            </div>
          )}
          <div className="pt-3 border-t border-slate-200">
            <p className="text-xs">{effSigningLocation}, {effSigningDate}</p>
            <div className="signature-grid mt-4">
              <div className="text-center">Principal</div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (paginationError) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-3xl p-8 max-w-xl mx-auto text-center space-y-3 font-sans mt-12 select-none">
        <div className="text-rose-600 font-black text-sm uppercase">PAGINATION MISMATCH ERROR</div>
        <p className="text-xs text-rose-800 leading-relaxed">
          Terdapat ketidakcocokan jumlah learning goals yang berhasil dipaketkan dengan jumlah goal input.
          Proses generate dibatalkan untuk menghindari hilangnya informasi di PDF. Mohon periksa konsol pengembang Anda.
        </p>
      </div>
    );
  }

  if (!isMeasured) {
    return (
      <div className="bg-slate-200 p-8 text-center text-slate-500 font-bold select-none w-full min-h-[400px] flex items-center justify-center">
        {renderMeasurer()}
        <div className="max-w-xl mx-auto p-12 bg-white rounded-3xl shadow-md space-y-4">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-slate-900 border-t-transparent rounded-full" />
          <div className="text-xs uppercase tracking-wider text-slate-400">Measuring document elements...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-200 p-4 space-y-6 flex flex-col items-center select-none printable-container w-full">
      {renderMeasurer()}
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
            overflow: visible !important;
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
            left: 15mm !important;
            right: 15mm !important;
            text-align: right !important;
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

        .absolute-footer {
          position: absolute;
          bottom: 8mm;
          left: 15mm;
          right: 15mm;
          text-align: right;
        }
      ` }} />

      {pages.map((page, pageIdx) => {
        const pageNum = pageIdx + 1;
        return (
          <div key={pageIdx} className="pdf-page flex flex-col justify-between">
            <div className="space-y-4">
              {/* Header */}
              {pageNum === 1 ? (
                <div className="flex items-center justify-between border-b-2 border-slate-900 pb-2">
                  {effLogoUrl ? (
                    <img 
                      src={effLogoUrl} 
                      alt="Logo" 
                      className="h-14 max-w-[150px] object-contain"
                    />
                  ) : <div className="h-14" />}
                  <div className="text-right space-y-0.5">
                    <h1 className="text-[13px] font-black text-slate-900 uppercase tracking-tight leading-tight">
                      STUDENT'S PROGRESS REPORT
                    </h1>
                    <p className="text-[10px] font-black text-slate-700 uppercase tracking-wider">
                      Lazuardi GCS - Elementary
                    </p>
                    <p className="text-[9.5px] text-slate-600 font-bold">
                      Year {effAcademicYear}, Mid Term {effTermRoman}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-start border-b border-slate-200 pb-2">
                  {effLogoUrl ? (
                    <img 
                      src={effLogoUrl} 
                      alt="Logo" 
                      className="h-10 max-w-[150px] object-contain"
                    />
                  ) : null}
                </div>
              )}

              {/* Student Identity Grid - ONLY ON PAGE 1 */}
              {pageNum === 1 && (
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
              )}

              {/* Academic Subjects Table */}
              {page.academicSubjects.length > 0 && renderPartitionedTable(page.academicSubjects, "SECTION 1: SUBJECTS AND LEARNING GOALS")}

              {/* Project Subjects Table */}
              {page.projectSubjects.length > 0 && renderPartitionedTable(page.projectSubjects, "SECTION 2: PROJECTS AND LEARNING GOALS")}

              {/* Final Block (Comments, Note, Attendance, Signatures) */}
              {page.showFinalBlock && (
                <>
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
                  {effShowAttendanceRecap && (
                    <div className="space-y-1 keep-together">
                      <div className="flex justify-between items-baseline border-b border-slate-300 pb-1">
                        <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">
                          ATTENDANCE RECAP
                        </h3>
                        {effCutoffDate && (
                          <span className="text-[9.5px] text-slate-500 font-bold italic">Rekap kehadiran sampai {effCutoffDate}</span>
                        )}
                      </div>
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
                  )}

                  {/* Signatures block directly following the attendance recap */}
                  <div className="space-y-4 keep-together text-left pt-3 border-t border-slate-200">
                    <div>
                      <p className="text-xs text-slate-900">{effSigningLocation}, {effSigningDate}</p>
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
                          <p className="text-[9px] text-slate-500">NIY: {effHomeroomNiy || '-'}</p>
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
                </>
              )}
            </div>

            {/* Absolute Page Footer */}
            <div className="absolute-footer">
              <div className="text-right text-[7.5pt] text-slate-500 font-medium select-none">
                {pageNum} {studentName}/{className}/Mid Term-{effTermRoman}/{normalizedYear}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
