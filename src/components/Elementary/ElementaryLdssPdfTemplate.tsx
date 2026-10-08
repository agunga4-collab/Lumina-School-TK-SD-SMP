import * as React from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  LineChart, 
  Line, 
  Cell 
} from 'recharts';
import type { Student, Class, LdssTemplate, LdssSessionAssessment, LdssAge } from '../../types';

interface ElementaryLdssPdfTemplateProps {
  student: Student;
  currentClass: Class;
  academicYear: string;
  sessions: LdssSessionAssessment[];
  templates: LdssTemplate[];
  onReadyChange?: (ready: boolean) => void;
}

interface DomainTrendItem {
  id: string;
  name: string;
  order: number;
  p1: number | null;
  p2: number | null;
  p3: number | null;
  latestScore: number | null;
  deltaText: string;
  deltaType: 'up' | 'down' | 'same' | 'neutral';
  hasDifferentInstrument: boolean;
}

export const ElementaryLdssPdfTemplate: React.FC<ElementaryLdssPdfTemplateProps> = ({
  student,
  currentClass,
  academicYear,
  sessions = [],
  templates = [],
  onReadyChange
}) => {
  // 1. Filter completed sessions only
  const completedSessions = React.useMemo(() => {
    return sessions.filter(
      (s) => s.status?.toUpperCase() === 'COMPLETED' || s.status === 'completed'
    );
  }, [sessions]);

  // 2. Identify sessions per period
  const p1Session = completedSessions.find((s) => s.periodKey === 'LDSS_1');
  const p2Session = completedSessions.find((s) => s.periodKey === 'LDSS_2');
  const p3Session = completedSessions.find((s) => s.periodKey === 'LDSS_3');

  // Latest completed session for general metadata
  const latestSession = React.useMemo(() => {
    if (completedSessions.length === 0) return null;
    return [...completedSessions].sort(
      (a, b) => new Date(b.assessmentDate || b.updatedAt).getTime() - new Date(a.assessmentDate || a.updatedAt).getTime()
    )[0];
  }, [completedSessions]);

  // Determine primary age for domain template lookup
  const primaryAge: LdssAge = (latestSession?.instrumentAge || latestSession?.studentAge || 6) as LdssAge;

  // Find active template for age to get real domain names
  const matchedTemplate = React.useMemo(() => {
    if (!templates || templates.length === 0) return null;
    return (
      templates.find((t) => t.age === primaryAge && t.status === 'active') ||
      templates.find((t) => t.age === primaryAge) ||
      templates[0] ||
      null
    );
  }, [templates, primaryAge]);

  // Build domain map ID -> Real Name
  const domainNameMap = React.useMemo(() => {
    const map = new Map<string, string>();
    // First map from all templates available
    templates.forEach((t) => {
      t.domains?.forEach((d) => {
        if (d.id && d.name) {
          map.set(d.id, d.name);
        }
      });
    });
    return map;
  }, [templates]);

  // Check if instrument age varies between completed periods
  const hasDifferentInstruments = React.useMemo(() => {
    const ages = completedSessions.map((s) => s.instrumentAge || s.studentAge).filter(Boolean);
    const uniqueAges = new Set(ages);
    return uniqueAges.size > 1;
  }, [completedSessions]);

  // 3. Process domain trend list
  const domainTrends = React.useMemo<DomainTrendItem[]>(() => {
    // Gather all domain IDs across completed sessions or template
    const domainIdsSet = new Set<string>();

    if (matchedTemplate && matchedTemplate.domains) {
      matchedTemplate.domains.forEach((d) => domainIdsSet.add(d.id));
    }

    completedSessions.forEach((s) => {
      if (s.domainScores) {
        Object.keys(s.domainScores).forEach((id) => domainIdsSet.add(id));
      }
    });

    const domainIds = Array.from(domainIdsSet);

    const items: DomainTrendItem[] = domainIds.map((domId, index) => {
      // Real domain name lookup
      let name = domainNameMap.get(domId);
      if (!name) {
        if (domId.startsWith('domain_')) {
          const parts = domId.split('_');
          const orderNum = parts[parts.length - 1];
          name = `Domain ${orderNum}`;
        } else {
          name = `Domain ${index + 1}`;
        }
      }

      const p1Val = p1Session?.domainScores?.[domId] ?? null;
      const p2Val = p2Session?.domainScores?.[domId] ?? null;
      const p3Val = p3Session?.domainScores?.[domId] ?? null;

      // Calculate latest available score & delta
      const availableScores = [
        { period: 'LDSS 1', score: p1Val },
        { period: 'LDSS 2', score: p2Val },
        { period: 'LDSS 3', score: p3Val },
      ].filter((x) => x.score !== null) as Array<{ period: string; score: number }>;

      let latestScore: number | null = null;
      let deltaText = '';
      let deltaType: 'up' | 'down' | 'same' | 'neutral' = 'neutral';

      if (availableScores.length > 0) {
        latestScore = availableScores[availableScores.length - 1].score;
        if (availableScores.length >= 2) {
          const prev = availableScores[availableScores.length - 2].score;
          const curr = availableScores[availableScores.length - 1].score;
          const diff = curr - prev;
          if (diff > 0) {
            deltaText = `↑ +${diff}%`;
            deltaType = 'up';
          } else if (diff < 0) {
            deltaText = `↓ ${diff}%`;
            deltaType = 'down';
          } else {
            deltaText = `= 0%`;
            deltaType = 'same';
          }
        }
      }

      return {
        id: domId,
        name,
        order: index + 1,
        p1: p1Val,
        p2: p2Val,
        p3: p3Val,
        latestScore,
        deltaText,
        deltaType,
        hasDifferentInstrument: hasDifferentInstruments
      };
    });

    return items;
  }, [matchedTemplate, completedSessions, p1Session, p2Session, p3Session, domainNameMap, hasDifferentInstruments]);

  // Overall domain overview chart data (Page 1)
  const overviewChartData = React.useMemo(() => {
    return domainTrends.map((dt) => ({
      name: dt.name.length > 20 ? dt.name.substring(0, 18) + '...' : dt.name,
      fullName: dt.name,
      score: dt.latestScore !== null ? dt.latestScore : 0,
      hasData: dt.latestScore !== null
    }));
  }, [domainTrends]);

  // Pagination for Domain Trend Cards (Page 2+)
  // 6 cards per page for optimal A4 layout
  const cardsPerPage = 6;
  const cardPages = React.useMemo(() => {
    const pages: DomainTrendItem[][] = [];
    for (let i = 0; i < domainTrends.length; i += cardsPerPage) {
      pages.push(domainTrends.slice(i, i + cardsPerPage));
    }
    return pages;
  }, [domainTrends]);

  const totalPages = 1 + cardPages.length + 1; // Page 1 (Identity & Overview) + Card Pages + Final Page (Conclusion)

  const printDate = React.useMemo(() => {
    const d = new Date();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }, []);

  // Notify parent component when rendering is ready for html2canvas
  React.useEffect(() => {
    const timer = setTimeout(() => {
      onReadyChange?.(true);
    }, 400);
    return () => clearTimeout(timer);
  }, [onReadyChange]);

  const formattedAssessmentDate = React.useMemo(() => {
    if (!latestSession?.assessmentDate) return '-';
    try {
      const parts = latestSession.assessmentDate.split('-');
      if (parts.length === 3) {
        const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
        const mIdx = parseInt(parts[1], 10) - 1;
        return `${parseInt(parts[2], 10)} ${months[mIdx]} ${parts[0]}`;
      }
    } catch (e) {
      return latestSession.assessmentDate;
    }
    return latestSession.assessmentDate;
  }, [latestSession]);

  return (
    <div id="elementary-ldss-pdf-container" className="font-sans text-slate-900 bg-slate-100 p-4 space-y-8">
      
      {/* ========================================================================= */}
      {/* PAGE 1: IDENTITAS SISWA & GAMBARAN UMUM CAPAIAN DOMAIN                   */}
      {/* ========================================================================= */}
      <div 
        className="pdf-page bg-white w-[794px] h-[1123px] min-w-[794px] min-h-[1123px] mx-auto p-8 flex flex-col justify-between shadow-lg relative box-border overflow-hidden"
        style={{ width: '794px', height: '1123px' }}
      >
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between border-b-2 border-indigo-600 pb-4">
            <div className="flex items-center gap-3">
              {/* Lazuardi Elementary Vector Crest */}
              <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-md">
                L
              </div>
              <div>
                <h1 className="text-xl font-black tracking-wider text-slate-900 uppercase">
                  LAZUARDI ELEMENTARY
                </h1>
                <p className="text-xs font-bold text-indigo-600 tracking-widest uppercase">
                  Lazuardi Developmental Screening System (LDSS)
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="px-3 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-black uppercase tracking-widest rounded-full block mb-1">
                RAPOR HASIL LDSS
              </span>
              <p className="text-[10px] text-slate-500 font-bold">
                Tahun Ajaran {academicYear}
              </p>
            </div>
          </div>

          {/* Student Identity Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 grid grid-cols-2 gap-4 text-xs font-semibold">
            <div className="space-y-2">
              <div className="flex">
                <span className="w-32 text-slate-400 font-bold uppercase text-[10px]">Nama Siswa</span>
                <span className="text-slate-900 font-black text-sm">: {student.name}</span>
              </div>
              <div className="flex">
                <span className="w-32 text-slate-400 font-bold uppercase text-[10px]">Kelas</span>
                <span className="text-slate-800 font-bold">: {currentClass.name}</span>
              </div>
              <div className="flex">
                <span className="w-32 text-slate-400 font-bold uppercase text-[10px]">Usia Instrumen</span>
                <span className="text-slate-800 font-bold">: {primaryAge} Tahun</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex">
                <span className="w-32 text-slate-400 font-bold uppercase text-[10px]">Tanggal Asesmen</span>
                <span className="text-slate-800 font-bold">: {formattedAssessmentDate}</span>
              </div>
              <div className="flex">
                <span className="w-32 text-slate-400 font-bold uppercase text-[10px]">Pengisi / Guru</span>
                <span className="text-slate-800 font-bold">: {latestSession?.createdByName || latestSession?.createdBy?.name || 'Guru Kelas'}</span>
              </div>
              <div className="flex items-center">
                <span className="w-32 text-slate-400 font-bold uppercase text-[10px]">Status Periode</span>
                <div className="flex items-center gap-1.5 font-bold text-[10px]">
                  <span className={`px-2 py-0.5 rounded-md border ${p1Session ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                    LDSS 1: {p1Session ? 'Selesai' : 'Belum'}
                  </span>
                  <span className={`px-2 py-0.5 rounded-md border ${p2Session ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                    LDSS 2: {p2Session ? 'Selesai' : 'Belum'}
                  </span>
                  <span className={`px-2 py-0.5 rounded-md border ${p3Session ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                    LDSS 3: {p3Session ? 'Selesai' : 'Belum'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Metric Summary Cards */}
          <div className="grid grid-cols-4 gap-3 text-center">
            <div className="bg-indigo-50/70 border border-indigo-100 p-3 rounded-2xl">
              <p className="text-[9px] font-black text-indigo-400 uppercase tracking-wider">Kelengkapan</p>
              <p className="text-xl font-black text-indigo-700 mt-0.5">
                {latestSession?.scoringSummary?.percentCompleted ?? 100}%
              </p>
            </div>
            <div className="bg-emerald-50/70 border border-emerald-100 p-3 rounded-2xl">
              <p className="text-[9px] font-black text-emerald-400 uppercase tracking-wider">Rata-Rata Skor</p>
              <p className="text-xl font-black text-emerald-700 mt-0.5">
                {latestSession?.scoringSummary?.averageScore ?? '-'} / 3.0
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Skor 3 / Sangat Baik</p>
              <p className="text-xl font-black text-slate-800 mt-0.5">
                {latestSession?.scoringSummary?.score3Count ?? 0}
              </p>
            </div>
            <div className="bg-amber-50/70 border border-amber-100 p-3 rounded-2xl">
              <p className="text-[9px] font-black text-amber-500 uppercase tracking-wider">Skor 0-1 / Perlu Bimbingan</p>
              <p className="text-xl font-black text-amber-700 mt-0.5">
                {(latestSession?.scoringSummary?.score0Count || 0) + (latestSession?.scoringSummary?.score1Count || 0)}
              </p>
            </div>
          </div>

          {/* Overview Domain Bar Chart */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                Gambaran Capaian Seluruh Domain ({latestSession?.periodLabel || 'Periode Terbaru'})
              </h3>
              <span className="text-[10px] font-bold text-slate-400">Skala 0 - 100%</span>
            </div>

            <div className="h-[460px] w-full pt-2 flex items-center justify-center">
              <BarChart
                width={690}
                height={450}
                data={overviewChartData}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9, fill: '#64748b' }} unit="%" />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  tick={{ fontSize: 9, fontWeight: 'bold', fill: '#1e293b' }} 
                  width={150} 
                />
                <Tooltip 
                  formatter={(val: any) => [`${val}%`, 'Capaian Domain']}
                  contentStyle={{ borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' }}
                />
                <Bar dataKey="score" radius={[0, 6, 6, 0]} barSize={16} isAnimationActive={false}>
                  {overviewChartData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.score >= 75 ? '#10b981' : entry.score >= 50 ? '#6366f1' : '#f59e0b'} 
                    />
                  ))}
                </Bar>
              </BarChart>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 pt-3 flex items-center justify-between text-[9px] font-bold text-slate-400">
          <span>Lazuardi Elementary • Dokumen rahasia • Dicetak {printDate}</span>
          <span>Halaman 1 dari {totalPages}</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* PAGES 2+: KARTU GRAFIK TREN PER DOMAIN (2-COLUMN GRID)                     */}
      {/* ========================================================================= */}
      {cardPages.map((cards, pageIndex) => {
        const pageNum = 2 + pageIndex;
        return (
          <div 
            key={`card-page-${pageIndex}`}
            className="pdf-page bg-white w-[794px] h-[1123px] min-w-[794px] min-h-[1123px] mx-auto p-8 flex flex-col justify-between shadow-lg relative box-border overflow-hidden"
            style={{ width: '794px', height: '1123px' }}
          >
            <div className="space-y-5">
              {/* Header */}
              <div className="flex items-center justify-between border-b-2 border-indigo-600 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-black text-sm">
                    L
                  </div>
                  <div>
                    <h2 className="text-sm font-black tracking-wider text-slate-900 uppercase">
                      RAPOR HASIL LDSS — DETAIL GRAFIK TREN DOMAIN
                    </h2>
                    <p className="text-[10px] font-bold text-indigo-600">
                      {student.name} • Kelas {currentClass.name}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-slate-400">
                  Halaman {pageNum} dari {totalPages}
                </span>
              </div>

              {/* Grid 2 Column for Domain Trend Cards */}
              <div className="grid grid-cols-2 gap-4">
                {cards.map((dt) => {
                  const chartData = [
                    { name: 'LDSS 1', val: dt.p1 },
                    { name: 'LDSS 2', val: dt.p2 },
                    { name: 'LDSS 3', val: dt.p3 },
                  ];

                  return (
                    <div 
                      key={dt.id}
                      className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 shadow-2xs flex flex-col justify-between h-[280px]"
                    >
                      <div className="space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-xs font-black text-slate-900 leading-snug line-clamp-2">
                            {dt.name}
                          </h4>
                          {dt.deltaText && (
                            <span 
                              className={`text-[9px] font-black px-2 py-0.5 rounded-full border whitespace-nowrap ${
                                dt.deltaType === 'up'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : dt.deltaType === 'down'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : 'bg-slate-100 text-slate-600 border-slate-200'
                              }`}
                            >
                              {dt.deltaText}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500 pt-0.5">
                          <span>Terbaru: <strong className="text-indigo-600 font-black">{dt.latestScore !== null ? `${dt.latestScore}%` : 'Belum diisi'}</strong></span>
                        </div>
                      </div>

                      {/* Line Chart Trend across LDSS 1 -> 3 */}
                      <div className="h-[170px] w-full pt-1 flex items-center justify-center">
                        <LineChart
                          width={325}
                          height={165}
                          data={chartData}
                          margin={{ top: 15, right: 15, left: -25, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="2 2" stroke="#f1f5f9" />
                          <XAxis dataKey="name" tick={{ fontSize: 9, fontWeight: 'bold', fill: '#64748b' }} axisLine={false} tickLine={false} />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 8, fill: '#94a3b8' }} unit="%" axisLine={false} tickLine={false} />
                          <Line
                            type="monotone"
                            dataKey="val"
                            stroke="#6366f1"
                            strokeWidth={2.5}
                            dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#ffffff' }}
                            isAnimationActive={false}
                            connectNulls
                          />
                        </LineChart>
                      </div>

                      {/* Period Pill Badges below chart */}
                      <div className="flex items-center justify-between text-[9px] font-bold pt-1 border-t border-slate-100 text-slate-500">
                        <span>L1: {dt.p1 !== null ? `${dt.p1}%` : 'Belum'}</span>
                        <span>L2: {dt.p2 !== null ? `${dt.p2}%` : 'Belum'}</span>
                        <span>L3: {dt.p3 !== null ? `${dt.p3}%` : 'Belum'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {dtHasDiff(cards) && (
                <p className="text-[9px] font-bold text-amber-600 italic pt-1">
                  * Catatan: Terdapat variasi usia instrumen screening antar periode untuk beberapa domain.
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-slate-200 pt-3 flex items-center justify-between text-[9px] font-bold text-slate-400">
              <span>Lazuardi Elementary • Dokumen rahasia • Dicetak {printDate}</span>
              <span>Halaman {pageNum} dari {totalPages}</span>
            </div>
          </div>
        );
      })}

      {/* ========================================================================= */}
      {/* FINAL PAGE: KESIMPULAN & CATATAN PERKEMBANGAN UMUM                       */}
      {/* ========================================================================= */}
      <div 
        className="pdf-page bg-white w-[794px] h-[1123px] min-w-[794px] min-h-[1123px] mx-auto p-8 flex flex-col justify-between shadow-lg relative box-border overflow-hidden"
        style={{ width: '794px', height: '1123px' }}
      >
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between border-b-2 border-indigo-600 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-black text-sm">
                L
              </div>
              <div>
                <h2 className="text-sm font-black tracking-wider text-slate-900 uppercase">
                  RAPOR HASIL LDSS — KESIMPULAN & CATATAN GURU
                </h2>
                <p className="text-[10px] font-bold text-indigo-600">
                  {student.name} • Kelas {currentClass.name}
                </p>
              </div>
            </div>
            <span className="text-[10px] font-bold text-slate-400">
              Halaman {totalPages} dari {totalPages}
            </span>
          </div>

          {/* General Notes Box */}
          <div className="space-y-3">
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-indigo-600 rounded-full inline-block"></span>
              Kesimpulan & Catatan Perkembangan Umum
            </h3>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 min-h-[360px] text-xs font-medium text-slate-800 leading-relaxed space-y-3">
              {latestSession?.generalNotes?.trim() ? (
                latestSession.generalNotes.split('\n').map((paragraph, pIdx) => (
                  <p key={pIdx}>{paragraph}</p>
                ))
              ) : (
                <p className="text-slate-400 italic">Tidak ada catatan kesimpulan umum untuk periode ini.</p>
              )}
            </div>
          </div>

          {/* Signatures & Approval Block */}
          <div className="pt-12 grid grid-cols-2 gap-8 text-xs font-bold text-slate-800 text-center">
            <div className="space-y-16">
              <p>Mengetahui,<br /><strong className="font-black text-slate-900">Kepala Unit Elementary</strong></p>
              <div className="border-t border-slate-300 pt-1 max-w-[200px] mx-auto">
                <p className="font-black">Head of Unit Elementary</p>
              </div>
            </div>

            <div className="space-y-16">
              <p>Depok, {formattedAssessmentDate}<br /><strong className="font-black text-slate-900">Wali Kelas / Guru Pengisi</strong></p>
              <div className="border-t border-slate-300 pt-1 max-w-[200px] mx-auto">
                <p className="font-black">{latestSession?.createdByName || latestSession?.createdBy?.name || 'Guru Kelas'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 pt-3 flex items-center justify-between text-[9px] font-bold text-slate-400">
          <span>Lazuardi Elementary • Dokumen rahasia • Dicetak {printDate}</span>
          <span>Halaman {totalPages} dari {totalPages}</span>
        </div>
      </div>

    </div>
  );
};

// Helper check
function dtHasDiff(cards: DomainTrendItem[]): boolean {
  return cards.some((c) => c.hasDifferentInstrument);
}
