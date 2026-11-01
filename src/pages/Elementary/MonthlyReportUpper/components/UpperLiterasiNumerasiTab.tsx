import * as React from 'react';
import { 
  BarChart2, Settings2, Plus, Trash2, Edit2, CheckCircle2, 
  AlertCircle, BookOpen, Calculator, Globe, RefreshCw, Save, RotateCcw, AlertTriangle
} from 'lucide-react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid 
} from 'recharts';
import type { 
  ElementaryUpperLitNumRecordDoc,
  ElementaryUpperLitNumClassConfigDoc,
  UpperLitNumSubjectField,
  UpperLitNumPredicate,
  UpperLitNumThresholds
} from '../../../../types/elementaryMonthlyUpperReport';
import { 
  UPPER_LITNUM_FIELDS,
  DEFAULT_LITNUM_TEMPLATES,
  validateLitNumThresholds,
  calculateUpperLitNumPredicate,
  compileLitNumNarrative
} from '../../../../types/elementaryMonthlyUpperReport';
import { 
  fetchUpperLitNumClassConfig,
  fetchUpperLitNumRecordsMap,
  saveUpperLitNumClassConfig,
  saveUpperStudentLitNumScore
} from '../../../../services/elementaryMonthlyUpperReportService';
import type { Student, Class, User } from '../../../../types';
import { toast } from 'sonner';

interface UpperLiterasiNumerasiTabProps {
  selectedClass: Class | null;
  selectedYear: string;
  selectedSemester: string;
  selectedMonth: string;
  monthLabel: string;
  students: Student[];
  currentUser: User;
  classConfig?: ElementaryUpperLitNumClassConfigDoc | null;
  onConfigChange?: (cfg: ElementaryUpperLitNumClassConfigDoc) => void;
  litNumRecordsMap?: Record<string, ElementaryUpperLitNumRecordDoc>;
  onRecordsChange?: (recs: Record<string, ElementaryUpperLitNumRecordDoc>) => void;
  onRefreshData?: () => void;
}

export const UpperLiterasiNumerasiTab: React.FC<UpperLiterasiNumerasiTabProps> = ({
  selectedClass,
  selectedYear,
  selectedSemester,
  selectedMonth,
  monthLabel,
  students,
  currentUser,
  classConfig: propClassConfig,
  onConfigChange,
  litNumRecordsMap: propRecordsMap,
  onRecordsChange,
  onRefreshData
}) => {
  // Active Field Tab ('bahasa_indonesia' | 'english' | 'mathematics')
  const [activeField, setActiveField] = React.useState<UpperLitNumSubjectField>('bahasa_indonesia');

  // Selected Student for chart inspection
  const [selectedStudentId, setSelectedStudentId] = React.useState<string>(students[0]?.id || '');

  // Class Config & Records State (synced with props or locally loaded)
  const [localClassConfig, setLocalClassConfig] = React.useState<ElementaryUpperLitNumClassConfigDoc | null>(null);
  const [localRecordsMap, setLocalRecordsMap] = React.useState<Record<string, ElementaryUpperLitNumRecordDoc>>({});
  const [loading, setLoading] = React.useState<boolean>(false);

  const effectiveConfig = propClassConfig !== undefined ? propClassConfig : localClassConfig;
  const effectiveRecordsMap = propRecordsMap !== undefined ? propRecordsMap : localRecordsMap;

  // Modal for Config Standards, A/D/B Cutoffs, and Templates
  const [configModalOpen, setConfigModalOpen] = React.useState<boolean>(false);
  const [modalTab, setModalTab] = React.useState<'STANDARDS' | 'THRESHOLDS' | 'TEMPLATES' | 'PERIODS'>('STANDARDS');
  const [templateFieldTab, setTemplateFieldTab] = React.useState<UpperLitNumSubjectField>('bahasa_indonesia');
  const [configDraft, setConfigDraft] = React.useState<ElementaryUpperLitNumClassConfigDoc | null>(null);

  // Sync selectedStudentId when students change
  React.useEffect(() => {
    if (students.length > 0 && (!selectedStudentId || !students.some(s => s.id === selectedStudentId))) {
      setSelectedStudentId(students[0].id);
    }
  }, [students, selectedStudentId]);

  // Load Config & Records if not passed from parent
  const loadData = React.useCallback(async () => {
    if (!selectedClass || !selectedYear) return;
    if (propClassConfig && propRecordsMap) return;
    setLoading(true);
    try {
      const [cfg, recs] = await Promise.all([
        fetchUpperLitNumClassConfig(selectedClass.id, selectedYear),
        fetchUpperLitNumRecordsMap(selectedClass.id, selectedYear)
      ]);
      setLocalClassConfig(cfg);
      setLocalRecordsMap(recs);
      if (onConfigChange && cfg) onConfigChange(cfg);
      if (onRecordsChange && recs) onRecordsChange(recs);
    } catch (e) {
      console.error('Error loading litnum data:', e);
      toast.error('Gagal memuat data Literasi & Numerasi.');
    } finally {
      setLoading(false);
    }
  }, [selectedClass, selectedYear, propClassConfig, propRecordsMap, onConfigChange, onRecordsChange]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Score Change
  const handleScoreChange = async (
    student: Student,
    periodKey: string,
    valStr: string,
    minStandard: number
  ) => {
    let score: number | null = null;
    if (valStr.trim() !== '') {
      const parsed = parseFloat(valStr.replace(',', '.'));
      if (!isNaN(parsed)) {
        score = Math.max(0, Math.min(100, parsed));
      }
    }

    try {
      await saveUpperStudentLitNumScore(
        {
          studentId: student.id,
          studentName: student.name,
          classId: selectedClass!.id,
          academicYear: selectedYear,
          field: activeField,
          periodKey,
          score,
          minimumStandard: minStandard,
          sourceDescription: `Asesmen Periode ${periodKey}`
        },
        currentUser
      );

      // Local optimistic update
      const updateRecords = (prev: Record<string, ElementaryUpperLitNumRecordDoc>) => {
        const copy = { ...prev };
        const studentRec = copy[student.id] || {
          id: `${student.id}_${selectedClass!.id}_${selectedYear.replace(/\//g, '_')}`,
          studentId: student.id,
          studentName: student.name,
          classId: selectedClass!.id,
          academicYear: selectedYear,
          periodScores: { bahasa_indonesia: {}, english: {}, mathematics: {} },
          updatedAt: Date.now(),
          updatedBy: currentUser.uid || 'system'
        };

        const fieldScores = { ...(studentRec.periodScores[activeField] || {}) };
        if (score === null) {
          delete fieldScores[periodKey];
        } else {
          fieldScores[periodKey] = {
            score,
            minimumStandard: minStandard,
            sourceDescription: `Asesmen Periode ${periodKey}`
          };
        }

        copy[student.id] = {
          ...studentRec,
          periodScores: {
            ...studentRec.periodScores,
            [activeField]: fieldScores
          }
        };
        return copy;
      };

      const nextRecs = updateRecords(effectiveRecordsMap);
      setLocalRecordsMap(nextRecs);
      if (onRecordsChange) {
        onRecordsChange(nextRecs);
      }
      if (onRefreshData) {
        onRefreshData();
      }
    } catch (e: any) {
      toast.error('Gagal menyimpan nilai Literasi & Numerasi.');
    }
  };

  // Open config modal with full defaults populated
  const handleOpenConfigModal = () => {
    const draft: ElementaryUpperLitNumClassConfigDoc = JSON.parse(
      JSON.stringify(
        effectiveConfig || {
          id: `${selectedClass?.id}_${selectedYear.replace(/\//g, '_')}`,
          classId: selectedClass?.id || '',
          academicYear: selectedYear,
          standards: { bahasa_indonesia: 70, english: 55, mathematics: 70 },
          thresholds: {
            bahasa_indonesia: { minA: 85, minD: 70 },
            english: { minA: 78, minD: 55 },
            mathematics: { minA: 85, minD: 70 }
          },
          narrativeTemplates: DEFAULT_LITNUM_TEMPLATES,
          comparisonPeriods: [
            { periodKey: '2025-08', label: 'Agustus', order: 0 },
            { periodKey: '2025-09', label: 'September', order: 1 },
            { periodKey: 'midterm-1', label: 'Midterm 1', order: 2 }
          ]
        }
      )
    );

    // Ensure thresholds and templates exist
    if (!draft.thresholds) {
      draft.thresholds = {
        bahasa_indonesia: { minA: 85, minD: 70 },
        english: { minA: 78, minD: 55 },
        mathematics: { minA: 85, minD: 70 }
      };
    }
    if (!draft.narrativeTemplates) {
      draft.narrativeTemplates = DEFAULT_LITNUM_TEMPLATES;
    }

    setConfigDraft(draft);
    setModalTab('STANDARDS');
    setConfigModalOpen(true);
  };

  // Save Class Config Draft with strict threshold validation
  const handleSaveConfig = async () => {
    if (!configDraft) return;

    // Validate thresholds for all fields
    for (const f of UPPER_LITNUM_FIELDS) {
      const th = configDraft.thresholds?.[f.field];
      if (th) {
        const valRes = validateLitNumThresholds(th);
        if (!valRes.isValid) {
          toast.error(`Konfigurasi batas A/D/B [${f.label}] tidak valid: ${valRes.error}`);
          setModalTab('THRESHOLDS');
          return;
        }
      }
    }

    try {
      await saveUpperLitNumClassConfig(configDraft, currentUser);
      setLocalClassConfig(configDraft);
      if (onConfigChange) {
        onConfigChange(configDraft);
      }
      if (onRefreshData) {
        onRefreshData();
      }
      toast.success('Pengaturan standar, batas A/D/B, dan template berhasil disimpan.');
      setConfigModalOpen(false);
    } catch (e: any) {
      toast.error('Gagal menyimpan konfigurasi kelas.');
    }
  };

  const currentStandard = effectiveConfig?.standards?.[activeField] ?? (activeField === 'english' ? 55 : 70);
  const currentThresholds = effectiveConfig?.thresholds?.[activeField] ?? (activeField === 'english' ? { minA: 78, minD: 55 } : { minA: 85, minD: 70 });
  const comparisonPeriods = effectiveConfig?.comparisonPeriods || [];

  // Prepare chart data for selected student
  const studentRec = effectiveRecordsMap[selectedStudentId];
  const chartData = comparisonPeriods.map(p => {
    const biVal = studentRec?.periodScores?.bahasa_indonesia?.[p.periodKey]?.score ?? null;
    const engVal = studentRec?.periodScores?.english?.[p.periodKey]?.score ?? null;
    const mathVal = studentRec?.periodScores?.mathematics?.[p.periodKey]?.score ?? null;
    return {
      periodLabel: p.label,
      'Bahasa Indonesia': biVal,
      'English': engVal,
      'Mathematics': mathVal
    };
  });

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
              Literasi &amp; Numerasi
            </span>
            <span className="text-xs text-slate-400 font-semibold">{monthLabel}</span>
          </div>
          <h2 className="text-base font-bold text-slate-900 mt-1">
            Capaian Literasi &amp; Numerasi Lintas Periode
          </h2>
          <p className="text-xs text-slate-500">
            Nilai sumber → rata-rata → predikat A/D/B otomatis → terhubung langsung ke Narasi &amp; Approval tanpa reload.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenConfigModal}
          className="px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
        >
          <Settings2 size={14} className="text-indigo-600" />
          <span>Atur Standar, Batas A/D/B &amp; Template</span>
        </button>
      </div>

      {/* Visual Chart Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <BarChart2 size={18} className="text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Grafik Perkembangan Siswa Lintas Periode
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-600">Pilih Siswa:</label>
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="text-xs font-bold px-3 py-1.5 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white"
            >
              {students.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Clustered Bar Chart */}
        <div className="h-64 sm:h-72 w-full">
          {chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-400">
              Belum ada data nilai tercatat untuk siswa terpilih.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="periodLabel" tick={{ fontSize: 11, fill: '#475569' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#475569' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '11px' }}
                  formatter={(val: any) => [val !== null ? `${val} / 100` : 'Belum dinilai', 'Nilai']}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="Bahasa Indonesia" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="English" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Mathematics" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Minimum Standards Reference Pills */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 text-xs">
          <span className="font-bold text-slate-700">Standar Minimum Grafik:</span>
          <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 font-semibold border border-blue-200">
            Bahasa Indonesia: {effectiveConfig?.standards?.bahasa_indonesia ?? 70} (A ≥ {effectiveConfig?.thresholds?.bahasa_indonesia?.minA ?? 85}, D ≥ {effectiveConfig?.thresholds?.bahasa_indonesia?.minD ?? 70})
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200">
            English: {effectiveConfig?.standards?.english ?? 55} (A ≥ {effectiveConfig?.thresholds?.english?.minA ?? 78}, D ≥ {effectiveConfig?.thresholds?.english?.minD ?? 55})
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-800 font-semibold border border-purple-200">
            Mathematics: {effectiveConfig?.standards?.mathematics ?? 70} (A ≥ {effectiveConfig?.thresholds?.mathematics?.minA ?? 85}, D ≥ {effectiveConfig?.thresholds?.mathematics?.minD ?? 70})
          </span>
        </div>
      </div>

      {/* Scores Input Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Field Switcher */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-xl bg-slate-200/70 p-1 border border-slate-300/60">
            {UPPER_LITNUM_FIELDS.map(f => (
              <button
                key={f.field}
                type="button"
                onClick={() => setActiveField(f.field)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  activeField === f.field ? 'bg-white text-indigo-950 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="text-xs text-slate-600 font-semibold flex items-center gap-2">
            <span>Standar Min: <strong className="text-slate-900">{currentStandard}</strong></span>
            <span className="text-slate-300">|</span>
            <span>Batas A: <strong className="text-emerald-700">≥ {currentThresholds.minA}</strong></span>
            <span className="text-slate-300">|</span>
            <span>Batas D: <strong className="text-blue-700">≥ {currentThresholds.minD}</strong></span>
            <span className="text-slate-300">|</span>
            <span>Batas B: <strong className="text-amber-700">&lt; {currentThresholds.minD}</strong></span>
          </div>
        </div>

        {/* Table per Period */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3 w-10 text-center sticky left-0 bg-slate-100 z-10">No</th>
                <th className="py-2.5 px-3 min-w-[190px] sticky left-10 bg-slate-100 z-10 border-r border-slate-200">
                  Nama Siswa
                </th>
                {/* Specific Period Evaluation Columns */}
                <th className="py-2.5 px-3 min-w-[110px] text-center bg-indigo-50/70 text-indigo-950 border-r border-indigo-200">
                  <div className="font-bold">Rata-rata ({monthLabel})</div>
                  <div className="text-[10px] text-indigo-600 font-normal">Periode Terpilih</div>
                </th>
                <th className="py-2.5 px-3 min-w-[120px] text-center bg-indigo-50/70 text-indigo-950 border-r border-indigo-200">
                  <div className="font-bold">Predikat A/D/B</div>
                  <div className="text-[10px] text-indigo-600 font-normal">Otomatis</div>
                </th>
                <th className="py-2.5 px-3 min-w-[110px] text-center bg-indigo-50/70 text-indigo-950 border-r border-indigo-200">
                  <div className="font-bold">Status Standar</div>
                  <div className="text-[10px] text-indigo-600 font-normal">Std: {currentStandard}</div>
                </th>
                {/* Comparison Periods Inputs */}
                {comparisonPeriods.map(p => (
                  <th key={p.periodKey} className={`py-2.5 px-3 min-w-[120px] text-center border-r border-slate-200 ${p.periodKey === selectedMonth ? 'bg-amber-50/60' : ''}`}>
                    <div className="font-bold text-slate-900">
                      {p.label}
                      {p.periodKey === selectedMonth && <span className="ml-1 text-[9px] text-amber-700 font-black">(Aktif)</span>}
                    </div>
                    <div className="text-[10px] text-slate-500 font-normal">Input Angka</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {students.map((st, idx) => {
                const rec = effectiveRecordsMap[st.id];
                const fieldScores = rec?.periodScores?.[activeField] || {};

                // Current report month calculation (empty != 0, 0 is valid!)
                const currentEntry = fieldScores[selectedMonth];
                const currentScore = currentEntry?.score !== undefined && currentEntry?.score !== null ? currentEntry.score : null;
                const predicate = calculateUpperLitNumPredicate(currentScore, currentThresholds);
                const isAboveStd = currentScore !== null ? currentScore >= currentStandard : null;

                return (
                  <tr key={st.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2 px-3 text-center text-slate-400 font-semibold sticky left-0 bg-white hover:bg-slate-50 z-10">
                      {idx + 1}
                    </td>
                    <td className="py-2 px-3 font-semibold text-slate-800 sticky left-10 bg-white hover:bg-slate-50 z-10 border-r border-slate-200">
                      {st.name}
                    </td>

                    {/* Current Month Average */}
                    <td className="py-2 px-3 text-center bg-indigo-50/20 font-bold border-r border-indigo-100">
                      {currentScore !== null ? (
                        <span className="text-slate-900">{currentScore}</span>
                      ) : (
                        <span className="text-slate-400 font-normal italic">Kosong</span>
                      )}
                    </td>

                    {/* Predicate A/D/B */}
                    <td className="py-2 px-3 text-center bg-indigo-50/20 border-r border-indigo-100">
                      {predicate === 'A' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                          A · Achieved
                        </span>
                      ) : predicate === 'D' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-black text-blue-800 bg-blue-100 px-2 py-0.5 rounded-full">
                          D · Developing
                        </span>
                      ) : predicate === 'B' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-black text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                          B · Beginning
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400 font-normal">Belum ada nilai</span>
                      )}
                    </td>

                    {/* Standard Comparison */}
                    <td className="py-2 px-3 text-center bg-indigo-50/20 border-r border-indigo-100 font-bold text-[11px]">
                      {isAboveStd === true ? (
                        <span className="text-emerald-700">≥ Standar ({currentStandard})</span>
                      ) : isAboveStd === false ? (
                        <span className="text-red-700">&lt; Standar ({currentStandard})</span>
                      ) : (
                        <span className="text-slate-400 font-normal">-</span>
                      )}
                    </td>

                    {/* Comparison Periods Inputs */}
                    {comparisonPeriods.map(p => {
                      const entry = fieldScores[p.periodKey];
                      const val = entry?.score !== undefined && entry?.score !== null ? entry.score : '';
                      const isBelow = entry?.score !== undefined && entry?.score !== null && entry.score < currentStandard;

                      return (
                        <td key={p.periodKey} className={`py-2 px-3 text-center border-r border-slate-200 ${p.periodKey === selectedMonth ? 'bg-amber-50/20' : ''}`}>
                          <div className="inline-flex items-center gap-1.5">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={val}
                              onChange={(e) => handleScoreChange(st, p.periodKey, e.target.value, currentStandard)}
                              placeholder="-"
                              className={`w-18 px-2 py-1 text-center font-bold border rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-xs ${
                                isBelow 
                                  ? 'border-red-300 bg-red-50 text-red-800' 
                                  : val !== '' 
                                  ? 'border-emerald-300 bg-emerald-50/40 text-emerald-900' 
                                  : 'border-slate-300 bg-white'
                              }`}
                            />
                            {isBelow && (
                              <span className="text-[9px] font-black text-red-600 bg-red-100 px-1 py-0.2 rounded" title="Di bawah standar">
                                &lt; Std
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Config Standards, A/D/B Thresholds, Templates & Periods Modal */}
      {configModalOpen && configDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Pengaturan Literasi &amp; Numerasi ({selectedClass?.name})
                </h3>
                <p className="text-xs text-slate-500">
                  Standar minimal grafik, aturan konversi predikat A/D/B, dan template redaksi narasi kualitatif.
                </p>
              </div>
            </div>

            {/* Modal Subtabs */}
            <div className="flex items-center gap-1.5 border-b border-slate-200 pb-2 text-xs font-bold">
              <button
                type="button"
                onClick={() => setModalTab('STANDARDS')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  modalTab === 'STANDARDS' ? 'bg-indigo-100 text-indigo-900' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                1. Standar Minimal Grafik
              </button>
              <button
                type="button"
                onClick={() => setModalTab('THRESHOLDS')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  modalTab === 'THRESHOLDS' ? 'bg-indigo-100 text-indigo-900' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                2. Batas Nilai A/D/B
              </button>
              <button
                type="button"
                onClick={() => setModalTab('TEMPLATES')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  modalTab === 'TEMPLATES' ? 'bg-indigo-100 text-indigo-900' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                3. Template Narasi Kualitatif
              </button>
              <button
                type="button"
                onClick={() => setModalTab('PERIODS')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  modalTab === 'PERIODS' ? 'bg-indigo-100 text-indigo-900' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                4. Periode Grafik
              </button>
            </div>

            {/* TAB 1: STANDARDS */}
            {modalTab === 'STANDARDS' && (
              <div className="space-y-4">
                <p className="text-xs text-slate-600">
                  Garis acuan standar kelulusan minimal yang digambar pada diagram batang (chart) dokumen rapor.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700">Bahasa Indonesia</label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={configDraft.standards?.bahasa_indonesia || 70}
                      onChange={(e) => setConfigDraft({
                        ...configDraft,
                        standards: { ...configDraft.standards, bahasa_indonesia: parseInt(e.target.value, 10) || 70 }
                      })}
                      className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-xl text-center font-bold text-xs"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block text-center">Default: 70</span>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700">English</label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={configDraft.standards?.english || 55}
                      onChange={(e) => setConfigDraft({
                        ...configDraft,
                        standards: { ...configDraft.standards, english: parseInt(e.target.value, 10) || 55 }
                      })}
                      className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-xl text-center font-bold text-xs"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block text-center">Default: 55</span>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700">Mathematics</label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={configDraft.standards?.mathematics || 70}
                      onChange={(e) => setConfigDraft({
                        ...configDraft,
                        standards: { ...configDraft.standards, mathematics: parseInt(e.target.value, 10) || 70 }
                      })}
                      className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-xl text-center font-bold text-xs"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block text-center">Default: 70</span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: THRESHOLDS */}
            {modalTab === 'THRESHOLDS' && (
              <div className="space-y-4">
                <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-200 text-xs text-blue-900 space-y-1">
                  <div className="font-bold">Ketentuan Konversi Predikat A/D/B:</div>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                    <li><strong>Predikat A (Achieved):</strong> Nilai ≥ Batas A (s.d. 100)</li>
                    <li><strong>Predikat D (Developing):</strong> Nilai ≥ Batas D dan &lt; Batas A</li>
                    <li><strong>Predikat B (Beginning):</strong> Nilai &lt; Batas D (mulai dari 0)</li>
                    <li>Validasi: 100 ≥ Batas A &gt; Batas D &gt; 0 (tidak boleh tumpang tindih atau berlubang).</li>
                  </ul>
                </div>

                <div className="space-y-3">
                  {UPPER_LITNUM_FIELDS.map(f => {
                    const th = configDraft.thresholds?.[f.field] || f.defaultThresholds;
                    const errRes = validateLitNumThresholds(th);

                    return (
                      <div key={f.field} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800">{f.label}</span>
                          {!errRes.isValid && (
                            <span className="text-[10px] font-bold text-red-600 flex items-center gap-1">
                              <AlertTriangle size={12} /> {errRes.error}
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-600">Batas Minimal A (Achieved)</label>
                            <input
                              type="number"
                              min={1}
                              max={100}
                              value={th.minA}
                              onChange={(e) => {
                                const nextVal = parseFloat(e.target.value) || 0;
                                setConfigDraft({
                                  ...configDraft,
                                  thresholds: {
                                    ...configDraft.thresholds!,
                                    [f.field]: { ...th, minA: nextVal }
                                  }
                                });
                              }}
                              className="w-full mt-1 px-3 py-1.5 border border-slate-300 rounded-lg text-center font-bold text-xs bg-white"
                            />
                            <span className="text-[9.5px] text-slate-500 mt-0.5 block text-center">
                              Nilai {th.minA} – 100
                            </span>
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-600">Batas Minimal D (Developing)</label>
                            <input
                              type="number"
                              min={1}
                              max={100}
                              value={th.minD}
                              onChange={(e) => {
                                const nextVal = parseFloat(e.target.value) || 0;
                                setConfigDraft({
                                  ...configDraft,
                                  thresholds: {
                                    ...configDraft.thresholds!,
                                    [f.field]: { ...th, minD: nextVal }
                                  }
                                });
                              }}
                              className="w-full mt-1 px-3 py-1.5 border border-slate-300 rounded-lg text-center font-bold text-xs bg-white"
                            />
                            <span className="text-[9.5px] text-slate-500 mt-0.5 block text-center">
                              Nilai {th.minD} – {th.minA - 1} (B: &lt; {th.minD})
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 3: NARRATIVE TEMPLATES */}
            {modalTab === 'TEMPLATES' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-600">
                    Template kalimat kualitatif yang otomatis dipetakan ke Paket 2 Narasi &amp; Approval tanpa AI.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setConfigDraft({
                        ...configDraft,
                        narrativeTemplates: DEFAULT_LITNUM_TEMPLATES
                      });
                      toast.success('Template dikembalikan ke standar awal.');
                    }}
                    className="text-[11px] font-bold text-slate-600 hover:text-indigo-600 flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw size={12} />
                    <span>Reset Standar</span>
                  </button>
                </div>

                {/* Subtabs for field */}
                <div className="flex rounded-xl bg-slate-100 p-1">
                  {UPPER_LITNUM_FIELDS.map(f => (
                    <button
                      key={f.field}
                      type="button"
                      onClick={() => setTemplateFieldTab(f.field)}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                        templateFieldTab === f.field ? 'bg-white text-indigo-900 shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div className="space-y-3">
                  <div className="text-[11px] text-slate-500 font-medium">
                    Gunakan placeholder: <code>{'{studentName}'}</code> (nama siswa), <code>{'{monthLabel}'}</code> (nama bulan).
                  </div>

                  {/* Template A */}
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-emerald-800">
                      Redaksi Predikat A (Achieved)
                    </label>
                    <textarea
                      rows={3}
                      value={configDraft.narrativeTemplates?.[templateFieldTab]?.A || ''}
                      onChange={(e) => {
                        const curFieldTemplates = configDraft.narrativeTemplates?.[templateFieldTab] || DEFAULT_LITNUM_TEMPLATES[templateFieldTab];
                        setConfigDraft({
                          ...configDraft,
                          narrativeTemplates: {
                            ...configDraft.narrativeTemplates!,
                            [templateFieldTab]: { ...curFieldTemplates, A: e.target.value }
                          }
                        });
                      }}
                      className="w-full p-2.5 text-xs border border-slate-300 rounded-xl bg-emerald-50/20"
                    />
                  </div>

                  {/* Template D */}
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-blue-800">
                      Redaksi Predikat D (Developing)
                    </label>
                    <textarea
                      rows={3}
                      value={configDraft.narrativeTemplates?.[templateFieldTab]?.D || ''}
                      onChange={(e) => {
                        const curFieldTemplates = configDraft.narrativeTemplates?.[templateFieldTab] || DEFAULT_LITNUM_TEMPLATES[templateFieldTab];
                        setConfigDraft({
                          ...configDraft,
                          narrativeTemplates: {
                            ...configDraft.narrativeTemplates!,
                            [templateFieldTab]: { ...curFieldTemplates, D: e.target.value }
                          }
                        });
                      }}
                      className="w-full p-2.5 text-xs border border-slate-300 rounded-xl bg-blue-50/20"
                    />
                  </div>

                  {/* Template B */}
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-amber-800">
                      Redaksi Predikat B (Beginning)
                    </label>
                    <textarea
                      rows={3}
                      value={configDraft.narrativeTemplates?.[templateFieldTab]?.B || ''}
                      onChange={(e) => {
                        const curFieldTemplates = configDraft.narrativeTemplates?.[templateFieldTab] || DEFAULT_LITNUM_TEMPLATES[templateFieldTab];
                        setConfigDraft({
                          ...configDraft,
                          narrativeTemplates: {
                            ...configDraft.narrativeTemplates!,
                            [templateFieldTab]: { ...curFieldTemplates, B: e.target.value }
                          }
                        });
                      }}
                      className="w-full p-2.5 text-xs border border-slate-300 rounded-xl bg-amber-50/20"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: PERIODS */}
            {modalTab === 'PERIODS' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-700 uppercase">Periode Pembanding Grafik</h4>
                  <button
                    type="button"
                    onClick={() => {
                      const nextPeriods = [...(configDraft.comparisonPeriods || [])];
                      const newKey = `custom_${Date.now()}`;
                      nextPeriods.push({ periodKey: newKey, label: 'Periode Baru', order: nextPeriods.length });
                      setConfigDraft({ ...configDraft, comparisonPeriods: nextPeriods });
                    }}
                    className="text-[11px] font-bold text-indigo-600 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={12} />
                    <span>Tambah Periode</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {configDraft.comparisonPeriods?.map((p, idx) => (
                    <div key={p.periodKey} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={p.label}
                        onChange={(e) => {
                          const nextPeriods = [...configDraft.comparisonPeriods];
                          nextPeriods[idx].label = e.target.value;
                          setConfigDraft({ ...configDraft, comparisonPeriods: nextPeriods });
                        }}
                        className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold"
                        placeholder="Label Periode (e.g. Agustus / Midterm 1)"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const nextPeriods = configDraft.comparisonPeriods.filter((_, i) => i !== idx);
                          setConfigDraft({ ...configDraft, comparisonPeriods: nextPeriods });
                        }}
                        className="p-1.5 text-red-500 hover:text-red-700 cursor-pointer"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer Buttons */}
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setConfigModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveConfig}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs cursor-pointer"
              >
                Simpan Pengaturan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
