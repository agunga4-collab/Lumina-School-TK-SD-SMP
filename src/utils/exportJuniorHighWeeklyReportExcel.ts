import * as XLSX from 'xlsx';
import type { SOWeeklyReport } from '../types/schoolOrganizations';
import { formatWeekLabel } from './wibWeekHelper';

export interface ExportWeeklyReportParams {
  reports: SOWeeklyReport[];
  activityTitle?: string;
  weekRangeLabel?: string;
}

export function exportJuniorHighWeeklyReportExcel(params: ExportWeeklyReportParams) {
  const { reports, activityTitle = 'Semua Kegiatan', weekRangeLabel = '' } = params;

  // Header metadata
  const rows: any[][] = [
    ['LUMINA JUNIOR HIGH - REKAP LAPORAN MINGGUAN ORGANISASI (OSIS & SWJ)'],
    [`Kegiatan: ${activityTitle}`],
    weekRangeLabel ? [`Periode Minggu: ${weekRangeLabel}`] : [],
    [`Total Laporan: ${reports.length}`],
    [], // baris kosong
  ];

  // Table Header
  const headers = [
    'No',
    'Minggu',
    'Kegiatan',
    'Program',
    'Nama Siswa',
    'Kelas',
    'Status',
    'Terlambat',
    'Yang Sudah Dilakukan',
    'Rencana Minggu Depan / Follow Up',
    'Umpan Balik Guru',
    'Dibaca Oleh',
    'Tanggal Dibaca'
  ];
  rows.push(headers);

  // Table Data
  reports.forEach((r, idx) => {
    const weekLabel = `${formatWeekLabel(r.weekStart, r.weekEnd)} (${r.weekStart} s/d ${r.weekEnd})`;
    const statusLabel = r.status === 'SUBMITTED' ? 'Terkirim' : 'Draf';
    const isLateLabel = r.isLate ? 'Terlambat' : 'Tepat Waktu';

    rows.push([
      idx + 1,
      weekLabel,
      r.groupName || '-',
      r.programType || '-',
      r.studentName || '-',
      r.className || '-',
      statusLabel,
      isLateLabel,
      r.doneText || '',
      r.nextText || '',
      r.feedbackText || '-',
      r.readByName || (r.readAt ? 'Guru Pembina' : 'Belum dibaca'),
      r.readAt || '-'
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Column widths
  ws['!cols'] = [
    { wch: 6 }, // No
    { wch: 32 }, // Minggu
    { wch: 28 }, // Kegiatan
    { wch: 12 }, // Program
    { wch: 24 }, // Nama
    { wch: 14 }, // Kelas
    { wch: 12 }, // Status
    { wch: 14 }, // Terlambat
    { wch: 45 }, // Yang sudah dilakukan
    { wch: 45 }, // Rencana
    { wch: 30 }, // Umpan balik
    { wch: 20 }, // Dibaca oleh
    { wch: 20 }  // Tanggal dibaca
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Laporan Mingguan');

  const cleanTitle = activityTitle.replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `Laporan_Mingguan_JH_${cleanTitle}_${Date.now()}.xlsx`;

  XLSX.writeFile(wb, filename);
}
