import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { formatDate } from '../lib/utils';
import type { MTSSCase, CICODailyReport } from '../types';

export const generateWeeklyCICOReport = async (
  mtssCase: MTSSCase,
  reports: CICODailyReport[],
  weekNumber: number
) => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('SMP LAZUARDI GCS', pageWidth / 2, 20, { align: 'center' });
  doc.setFontSize(14);
  doc.text('LAPORAN CICO MINGGUAN', pageWidth / 2, 28, { align: 'center' });
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(150);
  doc.text('CONFIDENTIAL', pageWidth / 2, 34, { align: 'center' });
  
  doc.setLineWidth(0.5);
  doc.line(20, 40, pageWidth - 20, 40);
  
  // Student Info
  doc.setTextColor(0);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  let y = 50;
  
  const drawRow = (label: string, value: string) => {
    doc.setFont('helvetica', 'bold');
    doc.text(label, 20, y);
    doc.setFont('helvetica', 'normal');
    doc.text(`: ${value}`, 55, y);
    y += 7;
  };
  
  const monday = reports.find(r => new Date(r.date).getDay() === 1)?.date || reports[reports.length-1]?.date;
  const friday = reports.find(r => new Date(r.date).getDay() === 5)?.date || reports[0]?.date;

  drawRow('Nama Siswa', mtssCase.studentName);
  drawRow('Kelas', mtssCase.classId);
  drawRow('Periode', `Minggu ${weekNumber} (${formatDate(monday)} - ${formatDate(friday)})`);
  drawRow('Counselor', mtssCase.picName);
  
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.text('GOALS YANG DIPANTAU:', 20, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  const goals = mtssCase.tier2Meeting?.cicoGoals || [];
  goals.forEach((g, i) => {
    doc.text(`${i + 1}. ${g.label}`, 25 + (i % 2 === 0 ? 0 : 80), y);
    if (i % 2 === 1) y += 7;
  });
  if (goals.length % 2 !== 0) y += 7;
  
  y += 5;
  doc.setLineWidth(0.2);
  doc.line(20, y, pageWidth - 20, y);
  y += 10;
  
  // Daily Table
  doc.setFont('helvetica', 'bold');
  doc.text('RINGKASAN HARIAN:', 20, y);
  y += 10;
  
  // Table Header
  const headers = ['Hari', 'Rata-rata', 'Status', 'Catatan'];
  const colWidths = [30, 25, 35, 80];
  let currentX = 20;
  headers.forEach((h, i) => {
    doc.text(h, currentX, y);
    currentX += colWidths[i];
  });
  y += 2;
  doc.line(20, y, pageWidth - 20, y);
  y += 7;
  
  doc.setFont('helvetica', 'normal');
  reports.sort((a, b) => a.date.localeCompare(b.date)).forEach(r => {
    const dayName = new Intl.DateTimeFormat('id-ID', { weekday: 'long' }).format(new Date(r.date));
    currentX = 20;
    doc.text(dayName, currentX, y);
    currentX += colWidths[0];
    doc.text(r.dailyAvgScore.toFixed(1), currentX, y);
    currentX += colWidths[1];
    doc.text(r.dailyAvgScore >= 2.4 ? 'Mencapai Target' : 'Perlu Bimbingan', currentX, y);
    currentX += colWidths[2];
    const note = r.dailyNote ? (r.dailyNote.length > 40 ? r.dailyNote.substring(0, 37) + '...' : r.dailyNote) : '-';
    doc.text(note, currentX, y);
    y += 7;
  });
  
  y += 10;
  const avg = reports.reduce((acc, r) => acc + r.dailyAvgScore, 0) / reports.length;
  doc.setFont('helvetica', 'bold');
  doc.text('RINGKASAN MINGGU INI:', 20, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.text(`Skor Rata-rata : ${avg.toFixed(1)} / 3.0`, 25, y);
  y += 7;
  doc.text(`Pencapaian     : ${((avg / 3) * 100).toFixed(0)}%`, 25, y);
  y += 7;
  doc.text(`Target         : 80%`, 25, y);
  y += 7;
  doc.setFont('helvetica', 'bold');
  doc.text(`Status         : ${avg >= 2.4 ? 'Mencapai Target' : 'Perlu Bimbingan'}`, 25, y);
  
  y += 15;
  doc.text('REFLEKSI MINGGUAN', 20, y);
  y += 7;
  const reflection = reports.find(r => r.weeklyReflection)?.weeklyReflection;
  doc.setFont('helvetica', 'normal');
  doc.text('Siswa:', 25, y);
  doc.setFont('helvetica', 'italic');
  doc.text(`"${reflection?.studentPositive || '-'}"`, 40, y, { maxWidth: pageWidth - 60 });
  y += 15;
  doc.setFont('helvetica', 'normal');
  doc.text('Rencana:', 25, y);
  doc.setFont('helvetica', 'italic');
  doc.text(`"${reflection?.studentPlan || '-'}"`, 45, y, { maxWidth: pageWidth - 65 });
  y += 15;
  doc.setFont('helvetica', 'normal');
  doc.text('Guru:', 25, y);
  doc.text(reflection?.teacherNote || '-', 40, y, { maxWidth: pageWidth - 60 });
  
  y = 260;
  doc.setLineWidth(0.2);
  doc.text('Tanda Tangan Orang Tua:', 20, y);
  doc.line(20, y + 20, 80, y + 20);
  
  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(`Dicetak dari Lumina — ${formatDate(Date.now().toString())} — Halaman 1/1`, pageWidth / 2, 285, { align: 'center' });
  
  doc.save(`CICO_Weekly_${mtssCase.studentName}_W${weekNumber}.pdf`);
};

export const generateFullCICOReport = async (
  mtssCase: MTSSCase,
  reports: CICODailyReport[]
) => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Basic implementation for now, showing trends
  doc.setFontSize(16);
  doc.text('SMP LAZUARDI GCS', pageWidth / 2, 20, { align: 'center' });
  doc.text('REKAP CICO 4 MINGGU', pageWidth / 2, 28, { align: 'center' });
  
  let y = 50;
  doc.setFontSize(11);
  doc.text(`Nama Siswa: ${mtssCase.studentName}`, 20, y); y += 7;
  doc.text(`Kelas: ${mtssCase.classId}`, 20, y); y += 15;
  
  // Week by Week Summary
  const weeks = [1, 2, 3, 4];
  weeks.forEach(w => {
    const weekReports = reports.filter(r => r.weekNumber === w);
    if (weekReports.length > 0) {
      const avg = weekReports.reduce((acc, r) => acc + r.dailyAvgScore, 0) / weekReports.length;
      doc.text(`Minggu ${w}: ${avg.toFixed(1)} / 3.0 (${((avg/3)*100).toFixed(0)}%)`, 25, y);
      y += 7;
    }
  });

  y += 20;
  doc.text('Rekomendasi Counselor:', 20, y);
  y += 10;
  doc.line(20, y + 20, pageWidth - 20, y + 20);
  
  y = 250;
  doc.text('Counselor', 30, y);
  doc.text('Guru Kelas', 90, y);
  doc.text('Kepala Sekolah', 150, y);
  
  doc.line(20, y + 25, 55, y + 25);
  doc.line(80, y + 25, 115, y + 25);
  doc.line(140, y + 25, 185, y + 25);

  doc.save(`CICO_Full_${mtssCase.studentName}.pdf`);
};

export const generateCaseSummaryReport = async (
  mtssCase: MTSSCase,
  concerns: any[]
) => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  
  doc.setFontSize(16);
  doc.text('SMP LAZUARDI GCS', pageWidth / 2, 20, { align: 'center' });
  doc.text('RANGKUMAN KASUS LENGKAP', pageWidth / 2, 28, { align: 'center' });
  
  let y = 50;
  doc.setFontSize(11);
  doc.text(`Nama Siswa: ${mtssCase.studentName}`, 20, y); y += 7;
  doc.text(`Kelas: ${mtssCase.classId}`, 20, y); y += 15;
  
  doc.setFont('helvetica', 'bold');
  doc.text('Timeline Concerns:', 20, y);
  y += 10;
  doc.setFont('helvetica', 'normal');
  
  concerns.sort((a, b) => a.date.localeCompare(b.date)).forEach((c, i) => {
    doc.text(`${formatDate(c.date)}: ${c.description.substring(0, 80)}...`, 25, y, { maxWidth: pageWidth - 40 });
    y += 12;
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
  });
  
  doc.save(`Case_Summary_${mtssCase.studentName}.pdf`);
};
