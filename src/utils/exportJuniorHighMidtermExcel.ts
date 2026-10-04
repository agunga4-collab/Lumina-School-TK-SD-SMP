import ExcelJS from 'exceljs';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { 
  JH_MIDTERM_CATEGORIES, 
  type MidtermMasterGoalDoc, 
  type MidtermStudentDataDoc,
  type PublishedMidtermReport,
} from '../types/midtermReport';
import type { Student, Class } from '../types';

export interface ExportJuniorHighMidtermExcelParams {
  selectedClass: Class;
  students: Student[];
  academicYear: string;
  semester: string;
  midtermTerm: string;
  masterGoalsMap: Record<string, MidtermMasterGoalDoc>;
  studentDataMap: Record<string, MidtermStudentDataDoc>;
  publishedReportsMap: Record<string, PublishedMidtermReport>;
  studentAttendanceMap: Record<string, { sickLeave?: number | null; excusedLeave?: number | null; absent?: number | null }>;
  cutoffAttendanceMap?: Record<string, { sickLeave: number | null; excusedLeave: number | null; absent: number | null }>;
  reportSigningDate?: string;
  attendanceCutoffDate?: string;
  disabledSubjects?: string[];
}

interface GoalColumnDef {
  categoryId: string;
  categoryName: string;
  categoryColor: string; // ARGB
  subjectName: string;
  goalId: string;
  goalText: string;
  headerTopText: string;
}

/**
 * Format timestamp into WIB (UTC+7) DD/MM/YYYY HH:mm
 */
export function formatWibDateTime(timestamp: number | string | Date | null | undefined): string {
  if (!timestamp) return '-';
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return '-';

  try {
    const options: Intl.DateTimeFormatOptions = {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    };
    const parts = new Intl.DateTimeFormat('id-ID', options).formatToParts(d);
    const getPart = (type: string) => parts.find(p => p.type === type)?.value || '';

    const day = getPart('day');
    const month = getPart('month');
    const year = getPart('year');
    const hour = getPart('hour');
    const minute = getPart('minute');

    return `${day}/${month}/${year} ${hour}:${minute}`;
  } catch (err) {
    return d.toLocaleString('id-ID');
  }
}

/**
 * Generate filename: Backup_Midterm_JuniorHigh_{Kelas}_{TahunAjaran}_Sem{n}_Term{n}_{YYYYMMDD-HHmm}.xlsx
 */
export function generateBackupFilename(
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

  return `Backup_Midterm_JuniorHigh_${safeClass}_${safeYear}_Sem${semester}_Term${midtermTerm}_${timeStamp}.xlsx`;
}

/**
 * Main export function for Junior High Midterm Report Backup
 */
export async function exportJuniorHighMidtermExcel(params: ExportJuniorHighMidtermExcelParams): Promise<void> {
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
    cutoffAttendanceMap = {},
    reportSigningDate = '',
    attendanceCutoffDate = '',
    disabledSubjects = [],
  } = params;

  if (!selectedClass) {
    throw new Error('Kelas belum dipilih.');
  }

  const safeStudents = Array.isArray(students) ? students.filter(Boolean) : [];
  if (safeStudents.length === 0) {
    throw new Error('Tidak ada siswa di kelas yang dipilih.');
  }

  // 1. Fetch live delivery tracking records for this class & period
  const trackingMap: Record<string, any> = {};
  try {
    const qTracking = query(
      collection(db, 'jh_midterm_delivery_tracking'),
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
    console.warn('[ExportExcel] Error fetching jh_midterm_delivery_tracking:', err);
  }

  // 2. Build Goal Columns (Ordered union across standard categories, master goals, and published snapshots)
  const categoryColorMap: Record<string, string> = {
    'SPIRITUAL_HEALTH': 'FF065F46', // Emerald 800
    'LEARNING_JOURNEY': 'FF075985', // Sky 800
    'WEEKLY_LESSONS': 'FF3730A3',   // Indigo 800
    'UNIT_ACTIVITY': 'FF9A3412',    // Orange 800
  };

  const goalColumns: GoalColumnDef[] = [];
  const registeredGoalKeys = new Set<string>();

  const standardCategories = Array.isArray(JH_MIDTERM_CATEGORIES) ? JH_MIDTERM_CATEGORIES : [];

  for (const cat of standardCategories) {
    const catColor = categoryColorMap[cat.id] || 'FF1E293B';
    const subjects = Array.isArray(cat?.subjects) ? cat.subjects : [];

    for (const subj of subjects) {
      if (!subj) continue;

      // Collect goals for this subject:
      // a. From masterGoalsMap
      const masterGoal = masterGoalsMap?.[subj];
      const masterGoalsList = Array.isArray(masterGoal?.goals) ? masterGoal.goals : [];

      const subjectGoalsOrdered: Array<{ id: string; text: string }> = [];

      masterGoalsList.forEach(g => {
        if (!g) return;
        const key = `${cat.name}_${subj}_${g.id || g.text}`;
        if (!registeredGoalKeys.has(key)) {
          registeredGoalKeys.add(key);
          subjectGoalsOrdered.push({
            id: g.id || '',
            text: typeof g.text === 'string' ? g.text : '',
          });
        }
      });

      // b. From published snapshots across all students for this subject (union)
      safeStudents.forEach(st => {
        const pub = publishedReportsMap?.[st.id];
        const snapCats = pub?.reportSnapshot?.categories || [];
        snapCats.forEach(sc => {
          const snapSubjs = sc?.subjects || [];
          snapSubjs.forEach(ss => {
            if (ss?.name === subj) {
              (ss.goals || []).forEach(sg => {
                if (!sg) return;
                const key = `${cat.name}_${subj}_${sg.id || sg.text}`;
                if (!registeredGoalKeys.has(key)) {
                  registeredGoalKeys.add(key);
                  subjectGoalsOrdered.push({
                    id: sg.id || '',
                    text: typeof sg.text === 'string' ? sg.text : '',
                  });
                }
              });
            }
          });
        });
      });

      // If subject has at least 1 goal, add all its goal columns
      if (subjectGoalsOrdered.length > 0) {
        subjectGoalsOrdered.forEach(g => {
          goalColumns.push({
            categoryId: cat.id,
            categoryName: cat.name,
            categoryColor: catColor,
            subjectName: subj,
            goalId: g.id,
            goalText: g.text,
            headerTopText: `${cat.name} - ${subj}`,
          });
        });
      }
    }
  }

  // Also check if any published report has categories/subjects outside standard categories
  safeStudents.forEach(st => {
    const pub = publishedReportsMap?.[st.id];
    const snapCats = pub?.reportSnapshot?.categories || [];
    snapCats.forEach(sc => {
      const catName = sc?.name || 'OTHER';
      const snapSubjs = sc?.subjects || [];
      snapSubjs.forEach(ss => {
        const subjName = ss?.name || 'Mata Pelajaran';
        const alreadyInCols = goalColumns.some(c => c.subjectName === subjName);
        if (!alreadyInCols && Array.isArray(ss.goals) && ss.goals.length > 0) {
          ss.goals.forEach(sg => {
            const key = `${catName}_${subjName}_${sg.id || sg.text}`;
            if (!registeredGoalKeys.has(key)) {
              registeredGoalKeys.add(key);
              goalColumns.push({
                categoryId: 'OTHER',
                categoryName: catName,
                categoryColor: 'FF1E293B',
                subjectName: subjName,
                goalId: sg.id || '',
                goalText: sg.text || '',
                headerTopText: `${catName} - ${subjName}`,
              });
            }
          });
        }
      });
    });
  });

  // 3. Create Workbook & Worksheet
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Lazuardi GCS - Junior High System';
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
  ];

  const totalCols = infoHeaderTitles.length + goalColumns.length + pelengkapHeaderTitles.length;

  // Header Colors
  const INFO_HEADER_COLOR = 'FF1E293B';       // Slate 800 (Navy)
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

  // First, set individual Row 2 goal texts
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

  // Next, merge Row 1 for each subject group
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
      fgColor: { argb: groupDef.categoryColor },
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

    const sData = studentDataMap?.[student.id];
    const published = publishedReportsMap?.[student.id];
    const isPublished = Boolean(published);

    const tracking = trackingMap[student.id];

    // Left info values
    const noVal = sIdx + 1;
    const nameVal = student.name || '-';
    const nisnVal = student.nisn || (student as any)?.nis || published?.nisnSnapshot || '-';
    const studentIdVal = student.id || '-';
    const classVal = selectedClass.name || published?.classNameSnapshot || '-';
    const yearVal = academicYear || '-';
    const semesterVal = semester || '-';
    const termVal = midtermTerm === '2' ? 'Midterm 2' : 'Midterm 1';
    const statusVal = isPublished ? 'Terbit' : 'Belum Terbit';
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
            if (ss?.name === colDef.subjectName) {
              const goals = ss.goals || [];
              const matched = goals.find(g => 
                (colDef.goalId && g.id === colDef.goalId) || 
                (g.text && g.text.trim() === colDef.goalText.trim())
              );
              if (matched && typeof matched.remark === 'string') {
                remarkVal = matched.remark.trim();
                break;
              }
            }
          }
          if (remarkVal) break;
        }
      } else {
        // Source: Draft state
        if (!disabledSubjects.includes(colDef.subjectName)) {
          const remarks = sData?.remarks || {};
          const r = remarks[colDef.goalId];
          if (typeof r === 'string' && r.trim().length > 0) {
            remarkVal = r.trim();
          } else if (colDef.subjectName === 'Spiritual Health' && sData?.spiritualHealthRemark) {
            remarkVal = sData.spiritualHealthRemark.trim();
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
          bold: Boolean(remarkVal),
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
    let generalCommentVal = '';
    let titimangsaVal = '';
    let cutoffDateVal = '';
    let sakitVal = 0;
    let izinVal = 0;
    let tanpaKetVal = 0;

    if (isPublished && published.reportSnapshot) {
      generalCommentVal = published.reportSnapshot.generalComment || '';
      titimangsaVal = published.reportSnapshot.reportSigningDate || reportSigningDate || '';
      cutoffDateVal = published.reportSnapshot.attendanceCutoffDate || attendanceCutoffDate || '';
      sakitVal = published.reportSnapshot.attendance?.sakit ?? (cutoffAttendanceMap[student.id]?.sickLeave ?? studentAttendanceMap[student.id]?.sickLeave ?? 0);
      izinVal = published.reportSnapshot.attendance?.izin ?? (cutoffAttendanceMap[student.id]?.excusedLeave ?? studentAttendanceMap[student.id]?.excusedLeave ?? 0);
      tanpaKetVal = published.reportSnapshot.attendance?.tanpaKeterangan ?? (cutoffAttendanceMap[student.id]?.absent ?? studentAttendanceMap[student.id]?.absent ?? 0);
    } else {
      generalCommentVal = sData?.generalComment?.finalComment || sData?.generalComment?.aiDraft || '';
      titimangsaVal = reportSigningDate || '';
      cutoffDateVal = attendanceCutoffDate || '';
      sakitVal = cutoffAttendanceMap[student.id]?.sickLeave ?? studentAttendanceMap[student.id]?.sickLeave ?? 0;
      izinVal = cutoffAttendanceMap[student.id]?.excusedLeave ?? studentAttendanceMap[student.id]?.excusedLeave ?? 0;
      tanpaKetVal = cutoffAttendanceMap[student.id]?.absent ?? studentAttendanceMap[student.id]?.absent ?? 0;
    }

    const openCountVal = tracking?.openCount ?? published?.openCount ?? 0;
    const firstOpenedVal = formatWibDateTime(tracking?.firstOpenedAt ?? published?.firstOpenedAt);
    const lastOpenedVal = formatWibDateTime(tracking?.lastOpenedAt ?? published?.lastOpenedAt);
    const openedByVal = tracking?.openedByEmail || published?.openedByEmail || '-';

    const pelengkapValues = [
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
        horizontal: pIdx === 0 || pIdx === 9 ? 'left' : 'center',
        vertical: 'middle',
        wrapText: pIdx === 0, // wrapText for General Comment
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
    14, // Status Rapor
    12, // Versi PDF
    38, // Nama File PDF
    42, // Link PDF Drive
    34, // Drive File ID
    18, // Tanggal Publish
    22, // Dipublish Oleh
  ];

  const pelengkapColWidths = [
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
  const filename = generateBackupFilename(
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
