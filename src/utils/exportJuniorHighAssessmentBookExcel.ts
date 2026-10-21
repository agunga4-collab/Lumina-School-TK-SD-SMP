import * as XLSX from 'xlsx';
import {
  JHAssessmentLO,
  JHFormativeEntry,
  JHSummativeEntry,
  LearningGoal,
  Student
} from '../types';
import { formatDateWIB } from '../services/juniorHighAssessmentBookService';

export function exportJuniorHighAssessmentBookExcel(params: {
  className: string;
  subjectName: string;
  academicYear: string;
  semester: string;
  lg: LearningGoal;
  los: JHAssessmentLO[];
  students: Student[];
  formativeEntries: JHFormativeEntry[];
  summativeEntries: JHSummativeEntry[];
  mode?: 'SUBJECT' | 'UNIT_ACTIVITY';
  unitActivityName?: string;
  categoryName?: string;
  targetGrade?: string;
  classesMap?: Record<string, string>;
}) {
  const {
    className,
    subjectName,
    academicYear,
    semester,
    lg,
    los,
    students,
    formativeEntries,
    summativeEntries,
    mode = 'SUBJECT',
    unitActivityName,
    categoryName,
    targetGrade = 'ALL',
    classesMap = {}
  } = params;

  const isUAMode = mode === 'UNIT_ACTIVITY';

  // Build maps
  const formativeMap: Record<string, JHFormativeEntry> = {};
  for (const entry of formativeEntries) {
    formativeMap[`${entry.studentId}_${entry.loId}`] = entry;
  }

  const summativeMap: Record<string, JHSummativeEntry> = {};
  for (const entry of summativeEntries) {
    summativeMap[entry.studentId] = entry;
  }

  // Header metadata rows
  const rows: any[][] = isUAMode
    ? [
        ['LUMINA JUNIOR HIGH - ASSESSMENT BOOK (UNIT AKTIVITAS)'],
        [`Kategori UA: ${categoryName || '-'}`, `Unit Aktivitas: ${unitActivityName || subjectName}`],
        [`Target Kelompok/Grade: ${targetGrade === 'ALL' ? 'Semua Grade' : `Grade ${targetGrade}`}`, `Tahun Ajaran: ${academicYear}`, `Semester: ${semester}`],
        [`Learning Goal (LG): [${lg.code || 'LG'}] ${lg.goalText}`],
        [], // empty row
      ]
    : [
        ['LUMINA JUNIOR HIGH - ASSESSMENT BOOK (REKAP FORMATIF & SUMATIF)'],
        [`Kelas: ${className}`, `Mata Pelajaran: ${subjectName}`],
        [`Tahun Ajaran: ${academicYear}`, `Semester: ${semester}`],
        [`Learning Goal (LG): [${lg.code || 'LG'}] ${lg.goalText}`],
        [], // empty row
      ];

  // Table header
  const tableHeader = ['No', 'NIS / NISN', 'Nama Siswa'];
  if (isUAMode) {
    tableHeader.push('Kelas Asal');
  }

  for (const lo of los) {
    tableHeader.push(`${lo.code} (Skor)`);
    tableHeader.push(`${lo.code} (Tugas)`);
    tableHeader.push(`${lo.code} (Tindak Lanjut)`);
    tableHeader.push(`${lo.code} (Tanggal)`);
  }
  tableHeader.push('Skor Sumatif');
  tableHeader.push('Tugas Sumatif');
  tableHeader.push('Tanggal Sumatif');
  tableHeader.push('Catatan / Tindak Lanjut');

  rows.push(tableHeader);

  // Table data rows
  students.forEach((student, index) => {
    const row: any[] = [
      student.attendanceNumber ?? (student as any).noAbsen ?? index + 1,
      student.nisn || (student as any).nis || '-',
      student.name
    ];

    if (isUAMode) {
      const cls = (student as any).className || classesMap[student.classId] || student.classId || '-';
      row.push(cls);
    }

    for (const lo of los) {
      const f = formativeMap[`${student.id}_${lo.id}`];
      if (f) {
        const scoreDisplay = ['B', 'D', 'A'].includes(f.comprehensionLevel)
          ? `${f.comprehensionLevel} (Skala lama)`
          : f.comprehensionLevel;
        row.push(scoreDisplay);
        row.push(f.formativeTask || '-');
        row.push(f.nextAction || '-');
        row.push(formatDateWIB(f.date));
      } else {
        row.push('-');
        row.push('-');
        row.push('-');
        row.push('-');
      }
    }

    const s = summativeMap[student.id];
    if (s) {
      row.push(s.summativeScore);
      row.push(s.summativeTask || '-');
      row.push(formatDateWIB(s.date));
      row.push(s.notes || '-');
    } else {
      row.push('-');
      row.push('-');
      row.push('-');
      row.push('-');
    }

    rows.push(row);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Column widths
  ws['!cols'] = [
    { wch: 6 },
    { wch: 16 },
    { wch: 28 },
    ...(isUAMode ? [{ wch: 14 }] : []),
    ...los.flatMap(() => [{ wch: 10 }, { wch: 18 }, { wch: 22 }, { wch: 14 }]),
    { wch: 12 },
    { wch: 20 },
    { wch: 14 },
    { wch: 32 }
  ];

  const wb = XLSX.utils.book_new();
  const sheetName = isUAMode ? 'UA Assessment Book' : 'Assessment Book';
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const cleanYear = academicYear.replace(/[^a-zA-Z0-9]/g, '-');
  const cleanSubject = (unitActivityName || subjectName || '').replace(/[^a-zA-Z0-9]/g, '_');
  const cleanClassName = className.replace(/[^a-zA-Z0-9]/g, '_');

  const filename = isUAMode
    ? `AssessmentBook_UA_${cleanSubject}_${cleanYear}_Sem${semester}.xlsx`
    : `AssessmentBook_${cleanClassName}_${cleanSubject}_${cleanYear}_Sem${semester}.xlsx`;

  XLSX.writeFile(wb, filename);
}

