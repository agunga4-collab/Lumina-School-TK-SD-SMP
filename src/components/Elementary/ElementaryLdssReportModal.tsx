import * as React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
  Cell,
  ResponsiveContainer,
} from "recharts";
import {
  X,
  Download,
  BarChart2,
  TrendingUp,
  FileText,
  CheckCircle2,
  CalendarDays,
  User,
  Info,
  Loader2,
  Sparkles,
} from "lucide-react";
import type {
  Student,
  Class,
  LdssTemplate,
  LdssSessionAssessment,
  LdssAge,
} from "../../types";
import { getLdssScoreColor } from "../../lib/elementaryLdssReportPdf";

interface ElementaryLdssReportModalProps {
  student: Student;
  currentClass: Class;
  academicYear: string;
  sessions: LdssSessionAssessment[];
  templates: LdssTemplate[];
  onClose: () => void;
  onDownloadPdf: () => void;
  isPdfGenerating: boolean;
}

interface DomainTrendItem {
  id: string;
  name: string;
  p1: number | null;
  p2: number | null;
  p3: number | null;
  latestScore: number | null;
  deltaText: string;
  deltaType: "up" | "down" | "same" | "neutral";
}

export const ElementaryLdssReportModal: React.FC<ElementaryLdssReportModalProps> = ({
  student,
  currentClass,
  academicYear,
  sessions = [],
  templates = [],
  onClose,
  onDownloadPdf,
  isPdfGenerating,
}) => {
  // 1. ESC key listener to close modal
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // 2. Filter completed sessions only
  const completedSessions = React.useMemo(() => {
    return sessions.filter(
      (s) => s.status?.toUpperCase() === "COMPLETED" || s.status === "completed"
    );
  }, [sessions]);

  // Sort completed sessions by period
  const p1Session = completedSessions.find((s) => s.periodKey === "LDSS_1");
  const p2Session = completedSessions.find((s) => s.periodKey === "LDSS_2");
  const p3Session = completedSessions.find((s) => s.periodKey === "LDSS_3");

  // Latest completed session
  const latestSession = React.useMemo(() => {
    if (completedSessions.length === 0) return null;
    return [...completedSessions].sort(
      (a, b) =>
        new Date(b.assessmentDate || b.updatedAt).getTime() -
        new Date(a.assessmentDate || a.updatedAt).getTime()
    )[0];
  }, [completedSessions]);

  // Selected period state for Overview Chart
  const [selectedOverviewPeriodKey, setSelectedOverviewPeriodKey] = React.useState<string>(
    latestSession?.periodKey || "LDSS_1"
  );

  // Sync overview period if latestSession changes
  React.useEffect(() => {
    if (latestSession?.periodKey) {
      setSelectedOverviewPeriodKey(latestSession.periodKey);
    }
  }, [latestSession]);

  const activeOverviewSession = React.useMemo(() => {
    return (
      completedSessions.find((s) => s.periodKey === selectedOverviewPeriodKey) ||
      latestSession
    );
  }, [completedSessions, selectedOverviewPeriodKey, latestSession]);

  const primaryAge: LdssAge = (latestSession?.instrumentAge ||
    latestSession?.studentAge ||
    6) as LdssAge;

  // Active template for age
  const matchedTemplate = React.useMemo(() => {
    if (!templates || templates.length === 0) return null;
    return (
      templates.find((t) => t.age === primaryAge && t.status === "active") ||
      templates.find((t) => t.age === primaryAge) ||
      templates[0] ||
      null
    );
  }, [templates, primaryAge]);

  // Map domain ID -> Real domain name
  const domainNameMap = React.useMemo(() => {
    const map = new Map<string, string>();
    templates.forEach((t) => {
      t.domains?.forEach((d) => {
        if (d.id && d.name) {
          map.set(d.id, d.name);
        }
      });
    });
    return map;
  }, [templates]);

  // Build domain trends list
  const domainTrends = React.useMemo<DomainTrendItem[]>(() => {
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

    return domainIds.map((domId, index) => {
      let name = domainNameMap.get(domId);
      if (!name) {
        if (domId.startsWith("domain_")) {
          const parts = domId.split("_");
          const orderNum = parts[parts.length - 1];
          name = `Domain ${orderNum}`;
        } else {
          name = `Domain ${index + 1}`;
        }
      }

      const p1Val = p1Session?.domainScores?.[domId] ?? null;
      const p2Val = p2Session?.domainScores?.[domId] ?? null;
      const p3Val = p3Session?.domainScores?.[domId] ?? null;

      const availableScores = [
        { period: "LDSS 1", score: p1Val },
        { period: "LDSS 2", score: p2Val },
        { period: "LDSS 3", score: p3Val },
      ].filter((x) => x.score !== null) as Array<{ period: string; score: number }>;

      let latestScore: number | null = null;
      let deltaText = "";
      let deltaType: "up" | "down" | "same" | "neutral" = "neutral";

      if (availableScores.length > 0) {
        latestScore = availableScores[availableScores.length - 1].score;
        if (availableScores.length >= 2) {
          const prev = availableScores[availableScores.length - 2].score;
          const curr = availableScores[availableScores.length - 1].score;
          const diff = curr - prev;
          if (diff > 0) {
            deltaText = `↑ +${diff}%`;
            deltaType = "up";
          } else if (diff < 0) {
            deltaText = `↓ ${diff}%`;
            deltaType = "down";
          } else {
            deltaText = `= 0%`;
            deltaType = "same";
          }
        }
      }

      return {
        id: domId,
        name,
        p1: p1Val,
        p2: p2Val,
        p3: p3Val,
        latestScore,
        deltaText,
        deltaType,
      };
    });
  }, [
    matchedTemplate,
    completedSessions,
    p1Session,
    p2Session,
    p3Session,
    domainNameMap,
  ]);

  // Overview Bar Chart Data for selectedOverviewPeriodKey
  const overviewChartData = React.useMemo(() => {
    return domainTrends.map((dt) => {
      let score: number | null = null;
      if (selectedOverviewPeriodKey === "LDSS_1") score = dt.p1;
      else if (selectedOverviewPeriodKey === "LDSS_2") score = dt.p2;
      else if (selectedOverviewPeriodKey === "LDSS_3") score = dt.p3;
      else score = dt.latestScore;

      return {
        name: dt.name.length > 22 ? dt.name.substring(0, 20) + "..." : dt.name,
        fullName: dt.name,
        score: score !== null ? score : 0,
        hasData: score !== null,
      };
    });
  }, [domainTrends, selectedOverviewPeriodKey]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-fadeIn">
      {/* Backdrop click closer */}
      <div className="fixed inset-0" onClick={onClose} />

      {/* Modal Card */}
      <div className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh] relative z-10 my-auto">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 bg-slate-50/70 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-black uppercase tracking-wider rounded-full">
                Grafik Hasil LDSS
              </span>
              <span className="text-xs font-bold text-slate-400">
                TA {academicYear}
              </span>
            </div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              {student.name}
            </h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-slate-500">
              <div className="flex items-center gap-1">
                <User size={14} className="text-slate-400" />
                <span>Kelas: <strong className="text-slate-800">{currentClass.name}</strong></span>
              </div>
              <div className="flex items-center gap-1">
                <CalendarDays size={14} className="text-slate-400" />
                <span>Usia Instrumen: <strong className="text-slate-800">{primaryAge} Tahun</strong></span>
              </div>
              <div className="flex items-center gap-1.5 ml-2">
                <span className="text-[10px] font-bold uppercase text-slate-400">Periode Selesai:</span>
                <span className={`px-2 py-0.5 rounded-md border text-[10px] font-black ${p1Session ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                  LDSS 1
                </span>
                <span className={`px-2 py-0.5 rounded-md border text-[10px] font-black ${p2Session ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                  LDSS 2
                </span>
                <span className={`px-2 py-0.5 rounded-md border text-[10px] font-black ${p3Session ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                  LDSS 3
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={isPdfGenerating}
              onClick={onDownloadPdf}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
                isPdfGenerating
                  ? "bg-indigo-100 text-indigo-700 border border-indigo-200 animate-pulse"
                  : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
              }`}
            >
              {isPdfGenerating ? (
                <>
                  <Loader2 size={14} className="animate-spin text-indigo-600" />
                  <span>Membuat PDF...</span>
                </>
              ) : (
                <>
                  <Download size={14} />
                  <span>Unduh PDF</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              title="Tutup Modal (Esc)"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-8 max-h-[calc(90vh-140px)]">
          {/* SECTION 1: Overview Chart (Gambaran Umum Seluruh Domain) */}
          <div className="bg-slate-50/70 rounded-2xl border border-slate-200/80 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/60 pb-3">
              <div className="space-y-0.5">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <BarChart2 className="text-indigo-600" size={16} />
                  Gambaran Capaian Seluruh Domain (Skor % )
                </h3>
                <p className="text-xs text-slate-500 font-semibold">
                  Persentase capaian per domain pada periode screening yang dipilih.
                </p>
              </div>

              {completedSessions.length > 1 && (
                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm w-fit">
                  <span className="text-[10px] font-black uppercase text-slate-400">Pilih Periode:</span>
                  <select
                    value={selectedOverviewPeriodKey}
                    onChange={(e) => setSelectedOverviewPeriodKey(e.target.value)}
                    className="text-xs font-black text-indigo-600 bg-transparent focus:outline-none cursor-pointer"
                  >
                    {p1Session && <option value="LDSS_1">LDSS 1</option>}
                    {p2Session && <option value="LDSS_2">LDSS 2</option>}
                    {p3Session && <option value="LDSS_3">LDSS 3</option>}
                  </select>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm">
              <div className="h-[360px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={overviewChartData}
                    layout="vertical"
                    margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      tick={{ fontSize: 10, fill: "#64748b", fontWeight: 600 }}
                      unit="%"
                    />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={180}
                      tick={{ fontSize: 10, fill: "#334155", fontWeight: 700 }}
                    />
                    <Tooltip
                      formatter={(val: number) => [`${val}%`, "Skor Domain"]}
                      labelFormatter={(label: string) => {
                        const matched = overviewChartData.find((d) => d.name === label);
                        return matched ? matched.fullName : label;
                      }}
                      contentStyle={{
                        backgroundColor: "#1e293b",
                        borderColor: "#334155",
                        borderRadius: "12px",
                        color: "#fff",
                        fontSize: "12px",
                        fontWeight: "bold",
                      }}
                    />
                    <Bar dataKey="score" radius={[0, 6, 6, 0]} barSize={18}>
                      {overviewChartData.map((entry, idx) => {
                        const colorInfo = getLdssScoreColor(entry.hasData ? entry.score : null);
                        const fill = entry.hasData ? colorInfo.hex : "transparent";
                        return <Cell key={`cell-${idx}`} fill={fill} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* SECTION 2: Domain Trend Cards Grid (LDSS 1 -> LDSS 3) */}
          <div className="space-y-4">
            <div className="border-b border-gray-100 pb-2">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <TrendingUp className="text-indigo-600" size={16} />
                Grafik Tren & Perkembangan per Domain (LDSS 1 → LDSS 3)
              </h3>
              <p className="text-xs text-slate-500 font-semibold">
                Setiap kartu menampilkan grafik perkembangan antar-periode untuk satu domain. Periode belum diisi ditampilkan sebagai &quot;Belum diisi&quot;.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {domainTrends.map((dt) => {
                const lineData = [
                  { period: "LDSS 1", score: dt.p1, isFilled: dt.p1 !== null },
                  { period: "LDSS 2", score: dt.p2, isFilled: dt.p2 !== null },
                  { period: "LDSS 3", score: dt.p3, isFilled: dt.p3 !== null },
                ];

                return (
                  <div
                    key={dt.id}
                    className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3 hover:border-indigo-200 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-xs font-black text-slate-900 leading-snug line-clamp-2">
                        {dt.name}
                      </h4>
                      {dt.deltaText ? (
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-black shrink-0 ${
                            dt.deltaType === "up"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : dt.deltaType === "down"
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : "bg-slate-100 text-slate-600 border border-slate-200"
                          }`}
                        >
                          {dt.deltaText}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-50 text-slate-400 border border-slate-100 shrink-0">
                          -
                        </span>
                      )}
                    </div>

                    {/* Line Chart for this Domain */}
                    <div className="h-[150px] w-full pt-1">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={lineData}
                          margin={{ top: 15, right: 20, left: -20, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis
                            dataKey="period"
                            tick={{ fontSize: 9, fill: "#64748b", fontWeight: 700 }}
                          />
                          <YAxis
                            domain={[0, 100]}
                            ticks={[0, 50, 100]}
                            tick={{ fontSize: 9, fill: "#94a3b8", fontWeight: 600 }}
                            unit="%"
                          />
                          <Tooltip
                            formatter={(value: any, name: any, item: any) => {
                              const isFilled = item.payload.isFilled;
                              return [
                                isFilled ? `${value}%` : "Belum diisi",
                                "Skor Domain",
                              ];
                            }}
                            contentStyle={{
                              backgroundColor: "#1e293b",
                              borderColor: "#334155",
                              borderRadius: "8px",
                              color: "#fff",
                              fontSize: "11px",
                              fontWeight: "bold",
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="score"
                            stroke="#6366f1"
                            strokeWidth={3}
                            connectNulls
                            dot={{ r: 4, fill: "#4f46e5", strokeWidth: 2, stroke: "#ffffff" }}
                            activeDot={{ r: 6, fill: "#4338ca" }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Period score breakdown pills */}
                    <div className="grid grid-cols-3 gap-1.5 text-center pt-1 border-t border-slate-100 text-[10px]">
                      <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                        <span className="block font-bold text-slate-400 uppercase text-[9px]">
                          LDSS 1
                        </span>
                        <span className="font-black text-slate-800">
                          {dt.p1 !== null ? `${dt.p1}%` : "Belum diisi"}
                        </span>
                      </div>
                      <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                        <span className="block font-bold text-slate-400 uppercase text-[9px]">
                          LDSS 2
                        </span>
                        <span className="font-black text-slate-800">
                          {dt.p2 !== null ? `${dt.p2}%` : "Belum diisi"}
                        </span>
                      </div>
                      <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                        <span className="block font-bold text-slate-400 uppercase text-[9px]">
                          LDSS 3
                        </span>
                        <span className="font-black text-slate-800">
                          {dt.p3 !== null ? `${dt.p3}%` : "Belum diisi"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SECTION 3: Kesimpulan & Catatan Perkembangan Umum */}
          <div className="bg-amber-50/50 rounded-2xl border border-amber-200/70 p-5 space-y-2">
            <div className="flex items-center gap-2 text-amber-900 font-black text-xs uppercase tracking-wider">
              <FileText size={16} className="text-amber-600 shrink-0" />
              <span>Kesimpulan & Catatan Perkembangan Umum ({activeOverviewSession?.periodLabel || "Periode Terakhir"})</span>
            </div>
            {activeOverviewSession?.generalNotes ? (
              <p className="text-xs text-slate-800 font-semibold leading-relaxed whitespace-pre-wrap bg-white/80 p-4 rounded-xl border border-amber-100 shadow-xs">
                {activeOverviewSession.generalNotes}
              </p>
            ) : (
              <p className="text-xs text-slate-400 italic font-medium bg-white/50 p-3 rounded-xl border border-amber-100">
                Belum ada catatan perkembangan umum yang diisi untuk periode ini.
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-slate-50/80 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500 font-semibold">
            <Info size={14} className="text-indigo-500 shrink-0" />
            <span>Data grafik ini bersumber langsung dari hasil asesmen terverifikasi.</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
            >
              Tutup
            </button>
            <button
              type="button"
              disabled={isPdfGenerating}
              onClick={onDownloadPdf}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
                isPdfGenerating
                  ? "bg-indigo-100 text-indigo-700 border border-indigo-200 animate-pulse"
                  : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
              }`}
            >
              {isPdfGenerating ? (
                <>
                  <Loader2 size={14} className="animate-spin text-indigo-600" />
                  <span>Membuat PDF...</span>
                </>
              ) : (
                <>
                  <Download size={14} />
                  <span>Unduh PDF</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
