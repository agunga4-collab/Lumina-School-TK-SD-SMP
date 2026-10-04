import ExcelJS from 'exceljs';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { 
  type ElementaryMidtermMasterGoalDoc, 
  type ElementaryMidtermStudentDataDoc,
  type PublishedElementaryMidtermReport,
  ELEMENTARY_OFFICIAL_SUBJECTS,
  normalizeElementarySubjectName,
  getActiveMasterGoals,
  extractPerformingArtsUaFromKey,
  isPerformingArtsUaMatch,
} from '../types/elementaryMidtermReport';
import type { Student, Class } from '../types';
import { formatWibDateTime } from './exportJuniorHighMidtermExcel';

export interface ExportElementaryMidtermExcelParams {
  selectedClass: Class;
  students: Student[];
  academicYear: string;
  semester: string;
  midtermTerm: string;
  masterGoalsMap: Record<string, ElementaryMidtermMasterGoalDoc>;
  studentDataMap: Record<string, ElementaryMidtermStudentDataDoc>;
  publishedReportsMap: Record<string, PublishedElementaryMidtermReport>;
  studentAttendanceMap: Record<string, { sakit: number | null; izin: number | null; tanpaKeterangan: number | null }>;
  attendanceRecords?: any[];
  reportSigningDate?: string;
  attendanceCutoffDate?: string;
  cutoffDateRaw?: string;
  studentUaMap?: Record<string, string>;
  calculateStudentGoalsProgress: (student: Student) => any;
}

interface GoalColumnDef {
  sectionName: 'Section 1 (Subjects)' | 'Section 2 (Projects)';
  subjectDisplayName: string;
  subjectKey: string;
  goalId: string;
  goalText: string;
  headerTopText: string;
  category: 'SUBJECTS' | 'PROJECTS';
  order: number;
}

/**
 * Generate filename: Backup_Midterm_Elementary_{Kelas}_{TahunAjaran}_Sem{n}_Term{n}_{YYYYMMDD-HHmm}.xlsx
 */
export function generateElementaryBackupFilename(
  className: string,
  academicYear: string,
  semester: string,
  midtermTerm: string,
  date: Date = new Date()
): string {
  const safeClass = (className || 'Kelas').replace(/[\/\\?%*:|"<> ]+/g, '_');
  const safeYear = (academicYear || 'Year').replace(/\//g, '-').replace(/[\/\\?%*:|"<> ]+/g, '_');

  let timeStamp = '';
  try {
    const options: Intl.DateTimeFormatOptions = {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    };
    const parts = new Intl.DateTimeFormat('id-ID', options).formatToParts(date);
    const getPart = (type: string) => parts.find(p => p.type === type)?.value || '';
    const yyyy = getPart('year');
    const mm = getPart('month');
    const dd = getPart('day');
    const hh = getPart('hour');
    const min = getPart('minute');
    timeStamp = `${yyyy}${mm}${dd}-${hh}${min}`;
  } catch (e) {
    timeStamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;
  }

  return `Backup_Midterm_Elementary_${safeClass}_${safeYear}_Sem${semester}_Term${midtermTerm}_${timeStamp}.xlsx`;
}

/**
 * Main export function for Elementary Midterm Report Backup
 */
export async function exportElementaryMidtermExcel(params: ExportElementaryMidtermExcelParams): Promise<void> {
  const {
    selectedClass,
    students,
    academicYear,
    semester,
    midtermTerm,
    masterGoalsMap,
    studentDataMap,
    publishedReportsMap,
    studentAttendanceMap,
    attendanceRecords = [],
    reportSigningDate = '',
    attendanceCutoffDate = '',
    cutoffDateRaw = '',
    studentUaMap = {},
    calculateStudentGoalsProgress,
  } = params;

  if (!selectedClass) {
    throw new Error('Kelas belum dipilih.');
  }

  const safeStudents = Array.isArray(students) ? students.filter(Boolean) : [];
  if (safeStudents.length === 0) {
    throw new Error('Tidak ada data siswa untuk diunduh.');
  }

  // 1. Fetch live delivery tracking records for this class & period from elem_midterm_delivery_tracking
  const trackingMap: Record<string, any> = {};
  try {
    const qTracking = query(
      collection(db, 'elem_midterm_delivery_tracking'),
      where('classId', '==', selectedClass.id),
      where('academicYear', '==', academicYear),
      where('semester', '==', String(semester)),
      where('midtermTerm', '==', String(midtermTerm))
    );
    const snap = await getDocs(qTracking);
    snap.forEach(docSnap => {
      const data = docSnap.data();
      if (data.studentId) {
        trackingMap[data.studentId] = data;
      }
    });
  } catch (err) {
    console.warn('[ExportElementaryExcel] Error fetching elem_midterm_delivery_tracking:', err);
  }

  // 2. Build Goal Columns (Ordered union across official Elementary subjects, student draft goals, and published snapshots)
  // Section 1: Official subjects in official order (excluding Projects)
  // Section 2: Projects
  const goalColumns: GoalColumnDef[] = [];
  const registeredGoalKeys = new Set<string>();

  // Map of student's progress for quick lookup
  const studentProgressMap: Record<string, any> = {};
  safeStudents.forEach(st => {
    try {
      studentProgressMap[st.id] = calculateStudentGoalsProgress(st);
    } catch (e) {
      console.warn('Could not calculate goals progress for student:', st.id, e);
    }
  });

  // Helper to sort subjects according to official Elementary order
  const getSubjectSortIndex = (name: string): number => {
    const norm = normalizeElementarySubjectName(name) || name;
    if (norm === 'Projects') return 999;
    const idx = ELEMENTARY_OFFICIAL_SUBJECTS.indexOf(norm as any);
    return idx >= 0 ? idx : 500;
  };

  // Collect all unique subjects and goals present across draft progress and published snapshots
  interface SubjectGroupCollector {
    displayName: string;
    sectionName: 'Section 1 (Subjects)' | 'Section 2 (Projects)';
    category: 'SUBJECTS' | 'PROJECTS';
    sortIndex: number;
    goals: Array<{ id: string; text: string; order: number }>;
  }

  const subjectCollectors: Record<string, SubjectGroupCollector> = {};

  const ensureCollector = (displayName: string, category: 'SUBJECTS' | 'PROJECTS') => {
    if (!subjectCollectors[displayName]) {
      const isProjects = category === 'PROJECTS' || normalizeElementarySubjectName(displayName) === 'Projects';
      subjectCollectors[displayName] = {
        displayName,
        sectionName: isProjects ? 'Section 2 (Projects)' : 'Section 1 (Subjects)',
        category: isProjects ? 'PROJECTS' : 'SUBJECTS',
        sortIndex: getSubjectSortIndex(displayName),
        goals: [],
      };
    }
    return subjectCollectors[displayName];
  };

  // a. From draft applicable subjects across all students in the class
  safeStudents.forEach(st => {
    const prog = studentProgressMap[st.id];
    if (prog && Array.isArray(prog.applicableSubjects)) {
      prog.applicableSubjects.forEach((subj: any) => {
        const collector = ensureCollector(subj.displayName, subj.category);
        (subj.goals || []).forEach((g: any) => {
          const key = `${collector.displayName}_${g.id || g.text}`;
          if (!registeredGoalKeys.has(key)) {
            registeredGoalKeys.add(key);
            collector.goals.push({
              id: g.id || '',
              text: g.text || '',
              order: g.order || 0,
            });
          }
        });
      });
    }
  });

  // b. From published snapshots across all students in the class (union)
  safeStudents.forEach(st => {
    const pub = publishedReportsMap[st.id];
    const snapCats = pub?.reportSnapshot?.categories || [];
    snapCats.forEach(sc => {
      const catType: 'SUBJECTS' | 'PROJECTS' = sc.name === 'PROJECTS' ? 'PROJECTS' : 'SUBJECTS';
      const snapSubjs = sc.subjects || [];
      snapSubjs.forEach(ss => {
        const collector = ensureCollector(ss.name, catType);
        (ss.goals || []).forEach(sg => {
          const key = `${collector.displayName}_${sg.id || sg.text}`;
          if (!registeredGoalKeys.has(key)) {
            registeredGoalKeys.add(key);
            collector.goals.push({
              id: sg.id || '',
              text: sg.text || '',
              order: 0,
            });
          }
        });
      });
    });
  });

  // Sort subject collectors by section (Section 1 first, Section 2 second), then by official subject index, then alphabetical
  const sortedCollectors = Object.values(subjectCollectors)
    .filter(c => c.goals.length > 0) // Mapel tanpa goal tidak dimunculkan sebagai kolom
    .sort((a, b) => {
      if (a.sectionName !== b.sectionName) {
        return a.sectionName === 'Section 1 (Subjects)' ? -1 : 1;
      }
      if (a.sortIndex !== b.sortIndex) {
        return a.sortIndex - b.sortIndex;
      }
      return a.displayName.localeCompare(b.displayName);
    });

  // Flatten into goalColumns
  sortedCollectors.forEach(collector => {
    collector.goals.forEach(g => {
      goalColumns.push({
        sectionName: collector.sectionName,
        subjectDisplayName: collector.displayName,
        subjectKey: collector.displayName,
        goalId: g.id,
        goalText: g.text,
        headerTopText: `${collector.sectionName} - ${collector.displayName}`,
        category: collector.category,
        order: g.order,
      });
    });
  });

  // 3. Create Workbook & Worksheet
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Lazuardi GCS - Elementary System';
  workbook.lastModifiedBy = 'Lazuardi GCS';
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet('Backup Midterm', {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 2 }], // Freeze top 2 header rows AND columns A & B
  });

  // 4. Define Column Headers Structure
  const infoHeaderTitles = [
    'No',
    'Nama Siswa',
    'NISN',
    'studentId',
    'Kelas',
    'Tahun Ajaran',
    'Semester',
    'Periode Midterm',
    'Status Rapor',
    'Versi PDF',
    'Nama File PDF',
    'Link PDF Drive',
    'Drive File ID',
    'Tanggal Publish',
    'Dipublish Oleh',
  ];

  const pelengkapHeaderTitles = [
    'Status Learning Goals',
    'Status General Comment',
    'General Comment',
    'Tanggal Titimangsa',
    'Tanggal Cut Off Kehadiran',
    'Sakit',
    'Izin',
    'Tanpa Keterangan',
    'Jumlah Dibuka',
    'Pertama Dibuka',
    'Terakhir Dibuka',
    'Dibuka Oleh (Email)',
    'Status Pengiriman',
  ];

  const totalCols = infoHeaderTitles.length + goalColumns.length + pelengkapHeaderTitles.length;

  // Header Colors
  const INFO_HEADER_COLOR = 'FF1E293B';       // Slate 800 (Navy)
  const SECTION1_HEADER_COLOR = 'FF047857';   // Emerald 700
  const SECTION2_HEADER_COLOR = 'FFB45309';   // Amber 700
  const PELENGKAP_HEADER_COLOR = 'FF4338CA';   // Indigo 700

  // 5. Populate Row 1 & Row 2 for Left Section (Info Rapor)
  for (let c = 1; c <= infoHeaderTitles.length; c++) {
    const title = infoHeaderTitles[c - 1];
    worksheet.mergeCells(1, c, 2, c);
    const cell = worksheet.getCell(1, c);
    cell.value = title;
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: INFO_HEADER_COLOR },
    };
    cell.font = {
      name: 'Calibri',
      size: 11,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true,
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF334155' } },
      bottom: { style: 'thin', color: { argb: 'FF334155' } },
      left: { style: 'thin', color: { argb: 'FF334155' } },
      right: { style: 'thin', color: { argb: 'FF334155' } },
    };
  }

  // 6. Populate Row 1 & Row 2 for Middle Section (Goals)
  const goalStartCol = infoHeaderTitles.length + 1;
  const goalEndCol = infoHeaderTitles.length + goalColumns.length;

  // Individual Row 2 goal texts
  for (let i = 0; i < goalColumns.length; i++) {
    const colIdx = goalStartCol + i;
    const colDef = goalColumns[i];

    const cellRow2 = worksheet.getCell(2, colIdx);
    cellRow2.value = colDef.goalText || '-';
    cellRow2.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF8FAFC' }, // Slate 50
    };
    cellRow2.font = {
      name: 'Calibri',
      size: 9.5,
      bold: true,
      color: { argb: 'FF0F172A' },
    };
    cellRow2.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true,
    };
    cellRow2.border = {
      top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    };
  }

  // Merge Row 1 for each subject group
  let currentGroupStart = goalStartCol;
  while (currentGroupStart <= goalEndCol) {
    const groupDef = goalColumns[currentGroupStart - goalStartCol];
    let currentGroupEnd = currentGroupStart;

    while (
      currentGroupEnd + 1 <= goalEndCol &&
      goalColumns[currentGroupEnd + 1 - goalStartCol].headerTopText === groupDef.headerTopText
    ) {
      currentGroupEnd++;
    }

    if (currentGroupStart < currentGroupEnd) {
      worksheet.mergeCells(1, currentGroupStart, 1, currentGroupEnd);
    }

    const cellRow1 = worksheet.getCell(1, currentGroupStart);
    cellRow1.value = groupDef.headerTopText;
    cellRow1.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: {
        argb: groupDef.sectionName === 'Section 2 (Projects)' ? SECTION2_HEADER_COLOR : SECTION1_HEADER_COLOR,
      },
    };
    cellRow1.font = {
      name: 'Calibri',
      size: 11,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    cellRow1.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true,
    };
    cellRow1.border = {
      top: { style: 'thin', color: { argb: 'FFFFFFFF' } },
      bottom: { style: 'thin', color: { argb: 'FFFFFFFF' } },
      left: { style: 'thin', color: { argb: 'FFFFFFFF' } },
      right: { style: 'thin', color: { argb: 'FFFFFFFF' } },
    };

    currentGroupStart = currentGroupEnd + 1;
  }

  // 7. Populate Row 1 & Row 2 for Right Section (Pelengkap)
  const pelengkapStartCol = goalEndCol + 1;
  for (let j = 0; j < pelengkapHeaderTitles.length; j++) {
    const colIdx = pelengkapStartCol + j;
    const title = pelengkapHeaderTitles[j];

    worksheet.mergeCells(1, colIdx, 2, colIdx);
    const cell = worksheet.getCell(1, colIdx);
    cell.value = title;
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: PELENGKAP_HEADER_COLOR },
    };
    cell.font = {
      name: 'Calibri',
      size: 11,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true,
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF312E81' } },
      bottom: { style: 'thin', color: { argb: 'FF312E81' } },
      left: { style: 'thin', color: { argb: 'FF312E81' } },
      right: { style: 'thin', color: { argb: 'FF312E81' } },
    };
  }

  // Set header row heights
  worksheet.getRow(1).height = 26;
  worksheet.getRow(2).height = 48;

  // 8. Populate Data Rows (1 row per student)
  safeStudents.forEach((student, sIdx) => {
    const rowNum = 3 + sIdx;
    const row = worksheet.getRow(rowNum);
    row.height = 22;

    const stData = studentDataMap[student.id];
    const published = publishedReportsMap[student.id];
    const isPublished = Boolean(published);

    const tracking = trackingMap[student.id];
    const progress = studentProgressMap[student.id];

    // Left info values
    const noVal = sIdx + 1;
    const nameVal = student.name || '-';
    const rawNisn = student.nisn || (student as any)?.nis || published?.nisnSnapshot || '';
    const nisnVal = (rawNisn && String(rawNisn).trim()) ? String(rawNisn).trim() : '-';
    const studentIdVal = student.id || '-';
    const classVal = selectedClass.name || published?.classNameSnapshot || '-';
    const yearVal = academicYear || '-';
    const semesterVal = semester || '-';
    const termVal = midtermTerm === '2' ? 'Midterm 2' : 'Midterm 1';
    const statusVal = isPublished ? 'Published' : 'Belum Published';
    const versionVal = isPublished ? `v${published.version}` : '-';
    const fileNameVal = isPublished ? (published.fileName || '-') : '-';
    const driveFileUrlVal = isPublished ? (published.driveFileUrl || '') : '';
    const driveFileIdVal = isPublished ? (published.driveFileId || '-') : '-';
    const publishDateVal = isPublished && published.generatedAt ? formatWibDateTime(published.generatedAt) : '-';
    const publishedByVal = isPublished ? (published.generatedByName || '-') : '-';

    const infoValues = [
      noVal,
      nameVal,
      nisnVal,
      studentIdVal,
      classVal,
      yearVal,
      semesterVal,
      termVal,
      statusVal,
      versionVal,
      fileNameVal,
      driveFileUrlVal,
      driveFileIdVal,
      publishDateVal,
      publishedByVal,
    ];

    infoValues.forEach((val, i) => {
      const colIdx = i + 1;
      const cell = row.getCell(colIdx);

      // Handle Hyperlink for Drive PDF URL (Col 12)
      if (colIdx === 12 && isPublished && driveFileUrlVal) {
        cell.value = {
          text: driveFileUrlVal,
          hyperlink: driveFileUrlVal,
          tooltip: 'Buka PDF di Google Drive',
        };
        cell.font = {
          name: 'Calibri',
          size: 11,
          color: { argb: 'FF2563EB' },
          underline: true,
        };
      } else {
        cell.value = val;
        cell.font = {
          name: 'Calibri',
          size: 11,
          bold: colIdx === 2, // Nama Siswa bold
          color: colIdx === 9 ? (isPublished ? { argb: 'FF166534' } : { argb: 'FF854D0E' }) : { argb: 'FF0F172A' },
        };
      }

      cell.alignment = {
        horizontal: colIdx === 2 || colIdx === 11 || colIdx === 15 ? 'left' : 'center',
        vertical: 'middle',
      };

      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    });

    // Middle Goal Values
    goalColumns.forEach((colDef, gIdx) => {
      const colIdx = goalStartCol + gIdx;
      const cell = row.getCell(colIdx);

      let remarkVal = '';

      if (isPublished && published.reportSnapshot) {
        // Source: Published Snapshot (exact values as published)
        const snapCats = published.reportSnapshot.categories || [];
        for (const sc of snapCats) {
          const snapSubjs = sc?.subjects || [];
          for (const ss of snapSubjs) {
            // Check direct name match or normalized match
            const isMatch = ss.name === colDef.subjectDisplayName || 
                            normalizeElementarySubjectName(ss.name) === normalizeElementarySubjectName(colDef.subjectDisplayName);
            if (isMatch) {
              const goals = ss.goals || [];
              const matched = goals.find(g => 
                (colDef.goalId && g.id === colDef.goalId) || 
                (g.text && g.text.trim() === colDef.goalText.trim())
              );
              if (matched && typeof matched.remark === 'string') {
                const clean = matched.remark.trim().toUpperCase();
                if (['A', 'D', 'B'].includes(clean)) {
                  remarkVal = clean;
                }
                break;
              }
            }
          }
          if (remarkVal) break;
        }
      } else {
        // Source: Draft state (from applicableSubjects progress or direct remarks)
        if (progress && Array.isArray(progSubjs(progress))) {
          const appSubj = progSubjs(progress).find((s: any) => 
            s.displayName === colDef.subjectDisplayName || 
            normalizeElementarySubjectName(s.displayName) === normalizeElementarySubjectName(colDef.subjectDisplayName)
          );
          if (appSubj && Array.isArray(appSubj.goals)) {
            const matchedGoal = appSubj.goals.find((g: any) => g.id === colDef.goalId || g.text?.trim() === colDef.goalText.trim());
            if (matchedGoal && matchedGoal.isFilled && matchedGoal.remark) {
              remarkVal = matchedGoal.remark;
            }
          }
        }
        if (!remarkVal && stData?.remarks?.[colDef.goalId]) {
          const r = String(stData.remarks[colDef.goalId]).trim().toUpperCase();
          if (['A', 'D', 'B'].includes(r)) {
            remarkVal = r;
          }
        }
      }

      cell.value = remarkVal;
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
      };

      // Conditional formatting for A/D/B
      const upperRem = remarkVal.toUpperCase();
      if (upperRem === 'A') {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFDCFCE7' }, // Light emerald
        };
        cell.font = {
          name: 'Calibri',
          size: 11,
          bold: true,
          color: { argb: 'FF166534' },
        };
      } else if (upperRem === 'D') {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFEF9C3' }, // Light yellow
        };
        cell.font = {
          name: 'Calibri',
          size: 11,
          bold: true,
          color: { argb: 'FF854D0E' },
        };
      } else if (upperRem === 'B') {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFEDD5' }, // Light orange
        };
        cell.font = {
          name: 'Calibri',
          size: 11,
          bold: true,
          color: { argb: 'FF9A3412' },
        };
      } else {
        cell.font = {
          name: 'Calibri',
          size: 11,
          color: { argb: 'FF0F172A' },
        };
      }

      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    });

    // Right Pelengkap Values
    // 1. Status Learning Goals
    let statusGoalsVal = 'Belum set goals';
    if (progress) {
      if (progress.totalGoalsCount === 0) {
        statusGoalsVal = 'Belum set goals';
      } else if (progress.isComplete) {
        statusGoalsVal = `Lengkap (${progress.filledGoalsCount}/${progress.totalGoalsCount})`;
      } else {
        statusGoalsVal = `(${progress.filledGoalsCount}/${progress.totalGoalsCount} Terisi)`;
      }
    }

    // 2. Status General Comment
    let statusGcVal = 'Belum ada';
    if (isPublished) {
      statusGcVal = 'Approved';
    } else {
      const revStatus = stData?.generalCommentReviewStatus || 'DRAFT';
      if (revStatus === 'APPROVED') {
        statusGcVal = 'Approved';
      } else if (stData?.generalComment?.finalComment?.trim()) {
        statusGcVal = 'Draft';
      } else {
        statusGcVal = 'Belum ada';
      }
    }

    // 3. General Comment Text
    let generalCommentVal = '';
    if (isPublished && published.reportSnapshot) {
      generalCommentVal = published.reportSnapshot.generalComment || '';
    } else {
      generalCommentVal = stData?.generalComment?.finalComment || stData?.generalComment?.aiDraft || '';
    }

    // 4. Tanggal Titimangsa & Cutoff
    let titimangsaVal = '';
    let cutoffDateVal = '';
    if (isPublished && published.reportSnapshot) {
      titimangsaVal = published.reportSnapshot.reportSigningDate || reportSigningDate || '';
      cutoffDateVal = published.reportSnapshot.attendanceCutoffDate || attendanceCutoffDate || '';
    } else {
      titimangsaVal = reportSigningDate || '';
      cutoffDateVal = attendanceCutoffDate || '';
    }

    // 5. Attendance (Sakit, Izin, Tanpa Keterangan)
    let sakitVal = 0;
    let izinVal = 0;
    let tanpaKetVal = 0;

    if (isPublished && published.reportSnapshot?.attendance) {
      sakitVal = published.reportSnapshot.attendance.sakit ?? 0;
      izinVal = published.reportSnapshot.attendance.izin ?? 0;
      tanpaKetVal = published.reportSnapshot.attendance.tanpaKeterangan ?? 0;
    } else {
      // Calculate dynamic attendance from attendanceRecords up to cutoff date if available
      if (cutoffDateRaw && attendanceRecords.length > 0) {
        const matched = attendanceRecords.filter((r: any) => {
          const recStudentId = r.studentId || '';
          const recDate = r.date || '';
          const recSemester = String(r.semester || '');
          return (
            recStudentId === student.id &&
            recSemester === String(semester) &&
            recDate <= cutoffDateRaw
          );
        });
        matched.forEach((r: any) => {
          const status = (r.status || '').toUpperCase();
          if (status === 'SAKIT') sakitVal++;
          else if (status === 'IZIN') izinVal++;
          else if (status === 'ALPA') tanpaKetVal++;
        });
      } else {
        const att = studentAttendanceMap[student.id] || stData?.attendance;
        sakitVal = att?.sakit ?? 0;
        izinVal = att?.izin ?? 0;
        tanpaKetVal = att?.tanpaKeterangan ?? 0;
      }
    }

    // 6. Tracking Open Fields
    const openCountVal = tracking?.openCount ?? tracking?.viewCount ?? published?.openCount ?? 0;
    const firstOpenedVal = formatWibDateTime(tracking?.firstOpenedAt ?? tracking?.firstViewedAt ?? published?.firstOpenedAt);
    const lastOpenedVal = formatWibDateTime(tracking?.lastOpenedAt ?? tracking?.lastViewedAt ?? published?.lastOpenedAt);
    const openedByVal = tracking?.openedByEmail || published?.openedByEmail || '-';

    // 7. Status Pengiriman dari elem_midterm_delivery_tracking
    let statusPengirimanVal = '-';
    if (tracking) {
      const dStatus = String(tracking.deliveryStatus || '').toLowerCase();
      if (dStatus === 'viewed' || tracking.isOpened) {
        statusPengirimanVal = 'Dilihat';
      } else if (dStatus === 'sent') {
        statusPengirimanVal = 'Terkirim';
      } else if (dStatus === 'withdrawn') {
        statusPengirimanVal = 'Ditarik';
      }
    }

    const pelengkapValues = [
      statusGoalsVal,
      statusGcVal,
      generalCommentVal,
      titimangsaVal,
      cutoffDateVal,
      sakitVal,
      izinVal,
      tanpaKetVal,
      openCountVal,
      firstOpenedVal,
      lastOpenedVal,
      openedByVal,
      statusPengirimanVal,
    ];

    pelengkapValues.forEach((val, pIdx) => {
      const colIdx = pelengkapStartCol + pIdx;
      const cell = row.getCell(colIdx);
      cell.value = val;
      cell.font = {
        name: 'Calibri',
        size: 11,
        color: { argb: 'FF0F172A' },
      };
      cell.alignment = {
        horizontal: pIdx === 2 || pIdx === 11 ? 'left' : 'center',
        vertical: 'middle',
        wrapText: pIdx === 2, // wrapText for General Comment
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    });
  });

  // 9. Set Column Widths & AutoFilter
  worksheet.autoFilter = {
    from: { row: 2, column: 1 },
    to: { row: 2, column: totalCols },
  };

  const infoColWidths = [
    6,  // No
    26, // Nama Siswa
    15, // NISN
    16, // studentId
    16, // Kelas
    14, // Tahun Ajaran
    10, // Semester
    16, // Periode Midterm
    16, // Status Rapor
    12, // Versi PDF
    38, // Nama File PDF
    42, // Link PDF Drive
    34, // Drive File ID
    18, // Tanggal Publish
    22, // Dipublish Oleh
  ];

  const pelengkapColWidths = [
    20, // Status Learning Goals
    20, // Status General Comment
    55, // General Comment
    20, // Tanggal Titimangsa
    22, // Tanggal Cut Off Kehadiran
    10, // Sakit
    10, // Izin
    16, // Tanpa Keterangan
    16, // Jumlah Dibuka
    18, // Pertama Dibuka
    18, // Terakhir Dibuka
    28, // Dibuka Oleh (Email)
    18, // Status Pengiriman
  ];

  for (let c = 1; c <= infoHeaderTitles.length; c++) {
    worksheet.getColumn(c).width = infoColWidths[c - 1] || 15;
  }

  for (let g = 0; g < goalColumns.length; g++) {
    worksheet.getColumn(goalStartCol + g).width = 34;
  }

  for (let p = 0; p < pelengkapHeaderTitles.length; p++) {
    worksheet.getColumn(pelengkapStartCol + p).width = pelengkapColWidths[p] || 18;
  }

  // 10. Generate Excel Buffer & Trigger Browser Download
  const filename = generateElementaryBackupFilename(
    selectedClass.name,
    academicYear,
    semester,
    midtermTerm
  );

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

function progSubjs(prog: any): any[] {
  return prog?.applicableSubjects || [];
}
