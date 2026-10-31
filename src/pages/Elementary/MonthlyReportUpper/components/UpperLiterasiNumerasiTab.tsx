import * as React from 'react';
import { 
  BarChart2, Settings2, Plus, Trash2, Edit2, CheckCircle2, 
  AlertCircle, BookOpen, Calculator, Globe, RefreshCw, Save 
} from 'lucide-react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ReferenceLine, CartesianGrid 
} from 'recharts';
import type { 
  ElementaryUpperLitNumRecordDoc,
  ElementaryUpperLitNumClassConfigDoc,
  UpperLitNumSubjectField
} from '../../../../types/elementaryMonthlyUpperReport';
import { UPPER_LITNUM_FIELDS } from '../../../../types/elementaryMonthlyUpperReport';
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
}

export const UpperLiterasiNumerasiTab: React.FC<UpperLiterasiNumerasiTabProps> = ({
  selectedClass,
  selectedYear,
  selectedSemester,
  selectedMonth,
  monthLabel,
  students,
  currentUser
}) => {
  // Active Field Tab ('bahasa_indonesia' | 'english' | 'mathematics')
  const [activeField, setActiveField] = React.useState<UpperLitNumSubjectField>('bahasa_indonesia');

  // Selected Student for chart inspection
  const [selectedStudentId, setSelectedStudentId] = React.useState<string>(students[0]?.id || '');

  // Class Config & Records State
  const [classConfig, setClassConfig] = React.useState<ElementaryUpperLitNumClassConfigDoc | null>(null);
  const [recordsMap, setRecordsMap] = React.useState<Record<string, ElementaryUpperLitNumRecordDoc>>({});
  const [loading, setLoading] = React.useState<boolean>(true);

  // Modal for Config Standards & Periods
  const [configModalOpen, setConfigModalOpen] = React.useState<boolean>(false);
  const [configDraft, setConfigDraft] = React.useState<ElementaryUpperLitNumClassConfigDoc | null>(null);

  // Sync selectedStudentId when students change
  React.useEffect(() => {
    if (students.length > 0 && (!selectedStudentId || !students.some(s => s.id === selectedStudentId))) {
      setSelectedStudentId(students[0].id);
    }
  }, [students, selectedStudentId]);

  // Load Config & Records
  const loadData = React.useCallback(async () => {
    if (!selectedClass || !selectedYear) return;
    setLoading(true);
    try {
      const [cfg, recs] = await Promise.all([
        fetchUpperLitNumClassConfig(selectedClass.id, selectedYear),
        fetchUpperLitNumRecordsMap(selectedClass.id, selectedYear)
      ]);
      setClassConfig(cfg);
      setRecordsMap(recs);
    } catch (e) {
      console.error('Error loading litnum data:', e);
      toast.error('Gagal memuat data Literasi & Numerasi.');
    } finally {
      setLoading(false);
    }
  }, [selectedClass, selectedYear]);

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
      setRecordsMap(prev => {
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
      });
    } catch (e: any) {
      toast.error('Gagal menyimpan nilai Literasi & Numerasi.');
    }
  };

  // Save Class Config Draft
  const handleSaveConfig = async () => {
    if (!configDraft) return;
    try {
      await saveUpperLitNumClassConfig(configDraft, currentUser);
      setClassConfig(configDraft);
      toast.success('Standar minimum & periode pembanding berhasil disimpan.');
      setConfigModalOpen(false);
    } catch (e: any) {
      toast.error('Gagal menyimpan pengaturan.');
    }
  };

  // Active Field details
  const activeFieldInfo = UPPER_LITNUM_FIELDS.find(f => f.field === activeField)!;
  const currentStandard = classConfig?.standards?.[activeField] ?? activeFieldInfo.defaultStandard;
  const comparisonPeriods = classConfig?.comparisonPeriods || [
    { periodKey: selectedMonth, label: monthLabel, order: 0 }
  ];

  // Selected student record for chart
  const selectedStudent = students.find(s => s.id === selectedStudentId);
  const selectedStudentRec = selectedStudent ? recordsMap[selectedStudent.id] : null;

  // Chart Data for the selected student:
  // Shows 3 bars per period (Bahasa Indonesia, English, Mathematics) vs their respective standards
  const chartData = React.useMemo(() => {
    if (!selectedStudentRec) return [];

    return comparisonPeriods.map(p => {
      const biScore = selectedStudentRec.periodScores?.bahasa_indonesia?.[p.periodKey]?.score ?? null;
      const engScore = selectedStudentRec.periodScores?.english?.[p.periodKey]?.score ?? null;
      const mathScore = selectedStudentRec.periodScores?.mathematics?.[p.periodKey]?.score ?? null;

      const biStd = classConfig?.standards?.bahasa_indonesia ?? 70;
      const engStd = classConfig?.standards?.english ?? 55;
      const mathStd = classConfig?.standards?.mathematics ?? 70;

      return {
        periodLabel: p.label,
        'Bahasa Indonesia': biScore,
        'English': engScore,
        'Mathematics': mathScore,
        'Standar BI': biStd,
        'Standar English': engStd,
        'Standar Math': mathStd
      };
    });
  }, [selectedStudentRec, comparisonPeriods, classConfig]);

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800">
              Literasi &amp; Numerasi
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-500 font-semibold">{monthLabel}</span>
          </div>
          <h2 className="text-base font-bold text-slate-900 mt-1">
            Capaian Literasi &amp; Numerasi Lintas Periode
          </h2>
          <p className="text-xs text-slate-500">
            Pencatatan angka berkala untuk Bahasa Indonesia, English, dan Mathematics beserta perbandingan standar minimum.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setConfigDraft(JSON.parse(JSON.stringify(classConfig || {})));
            setConfigModalOpen(true);
          }}
          className="px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
        >
          <Settings2 size={14} className="text-indigo-600" />
          <span>Atur Standar &amp; Periode Grafik</span>
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
          <span className="font-bold text-slate-700">Standar Minimum Kelas:</span>
          <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 font-semibold border border-blue-200">
            Bahasa Indonesia: {classConfig?.standards?.bahasa_indonesia ?? 70}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200">
            English: {classConfig?.standards?.english ?? 55}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-800 font-semibold border border-purple-200">
            Mathematics: {classConfig?.standards?.mathematics ?? 70}
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

          <div className="text-xs text-slate-500 font-semibold">
            Standar Minimum: <strong className="text-slate-900">{currentStandard}</strong> · Input nilai angka 0–100 per periode
          </div>
        </div>

        {/* Table per Period */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3 w-10 text-center sticky left-0 bg-slate-100 z-10">No</th>
                <th className="py-2.5 px-3 min-w-[200px] sticky left-10 bg-slate-100 z-10 border-r border-slate-200">
                  Nama Siswa
                </th>
                {comparisonPeriods.map(p => (
                  <th key={p.periodKey} className="py-2.5 px-3 min-w-[130px] text-center border-r border-slate-200">
                    <div className="font-bold text-slate-900">{p.label}</div>
                    <div className="text-[10px] text-slate-500 font-normal">Standar: {currentStandard}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {students.map((st, idx) => {
                const rec = recordsMap[st.id];
                const fieldScores = rec?.periodScores?.[activeField] || {};

                return (
                  <tr key={st.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2 px-3 text-center text-slate-400 font-semibold sticky left-0 bg-white hover:bg-slate-50 z-10">
                      {idx + 1}
                    </td>
                    <td className="py-2 px-3 font-semibold text-slate-800 sticky left-10 bg-white hover:bg-slate-50 z-10 border-r border-slate-200">
                      {st.name}
                    </td>

                    {comparisonPeriods.map(p => {
                      const entry = fieldScores[p.periodKey];
                      const val = entry?.score !== undefined && entry?.score !== null ? entry.score : '';
                      const isBelow = entry?.score !== undefined && entry?.score !== null && entry.score < currentStandard;

                      return (
                        <td key={p.periodKey} className="py-2 px-3 text-center border-r border-slate-200">
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

      {/* Config Standards & Periods Modal */}
      {configModalOpen && configDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Pengaturan Standar &amp; Periode Grafik</h3>
            <p className="text-xs text-slate-500">
              Sesuaikan standar minimum kelulusan per bidang untuk kelas {selectedClass?.name} dan daftar periode yang ditampilkan pada grafik.
            </p>

            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-700 uppercase">Standar Minimum Bidang</h4>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500">Bahasa Indonesia</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={configDraft.standards?.bahasa_indonesia || 70}
                    onChange={(e) => setConfigDraft({
                      ...configDraft,
                      standards: { ...configDraft.standards, bahasa_indonesia: parseInt(e.target.value, 10) || 70 }
                    })}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-center font-bold text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500">English</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={configDraft.standards?.english || 55}
                    onChange={(e) => setConfigDraft({
                      ...configDraft,
                      standards: { ...configDraft.standards, english: parseInt(e.target.value, 10) || 55 }
                    })}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-center font-bold text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500">Mathematics</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={configDraft.standards?.mathematics || 70}
                    onChange={(e) => setConfigDraft({
                      ...configDraft,
                      standards: { ...configDraft.standards, mathematics: parseInt(e.target.value, 10) || 70 }
                    })}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-center font-bold text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-3 border-t border-slate-200">
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
                  className="text-[11px] font-bold text-indigo-600 hover:underline flex items-center gap-1"
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
                      className="p-1.5 text-red-500 hover:text-red-700"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setConfigModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-100"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveConfig}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
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
