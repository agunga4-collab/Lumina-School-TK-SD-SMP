import React, { useState } from 'react';
import { ElementaryMTSSCase } from '../../../types/elementaryMTSS';
import { elementaryMTSSService } from '../../../services/elementaryMTSSService';
import { Save, ClipboardList, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  cases: ElementaryMTSSCase[];
  onLogCoaching: (caseId: string, studentName: string, subject: string, tier: string, studentId?: string) => void;
  onRefresh: () => void;
  classesList?: any[];
}

export default function MTSSCaseTable({ cases, onLogCoaching, onRefresh, classesList }: Props) {
  // Store local edits for baseline, target, and status
  const [edits, setEdits] = useState<Record<string, { baselineScore: string; targetScore: string; status: 'Active' | 'Achieved' }>>({});
  const [savingRows, setSavingRows] = useState<Record<string, boolean>>({});

  const handleFieldChange = (caseId: string, field: 'baselineScore' | 'targetScore' | 'status', value: string) => {
    setEdits((prev) => {
      const existingCase = cases.find((c) => c.id === caseId);
      const currentEdit = prev[caseId] || {
        baselineScore: existingCase?.baselineScore || '',
        targetScore: existingCase?.targetScore || '',
        status: existingCase?.status || 'Active'
      };

      return {
        ...prev,
        [caseId]: {
          ...currentEdit,
          [field]: value
        }
      };
    });
  };

  const getRowValue = (caseObj: ElementaryMTSSCase, field: 'baselineScore' | 'targetScore' | 'status') => {
    if (edits[caseObj.id] && edits[caseObj.id][field] !== undefined) {
      return edits[caseObj.id][field];
    }
    return caseObj[field] || '';
  };

  const isRowModified = (caseObj: ElementaryMTSSCase) => {
    const edit = edits[caseObj.id];
    if (!edit) return false;
    return (
      (edit.baselineScore !== (caseObj.baselineScore || '')) ||
      (edit.targetScore !== (caseObj.targetScore || '')) ||
      (edit.status !== (caseObj.status || 'Active'))
    );
  };

  const handleSaveRow = async (caseObj: ElementaryMTSSCase) => {
    const edit = edits[caseObj.id];
    if (!edit) return;

    try {
      setSavingRows((prev) => ({ ...prev, [caseObj.id]: true }));
      await elementaryMTSSService.updateCase(caseObj.id, {
        baselineScore: edit.baselineScore,
        targetScore: edit.targetScore,
        status: edit.status
      });

      toast.success(`Berhasil menyimpan target MTSS untuk ${caseObj.studentName}`);
      
      // Remove from edits
      setEdits((prev) => {
        const copy = { ...prev };
        delete copy[caseObj.id];
        return copy;
      });

      onRefresh();
    } catch (err) {
      console.error('Error saving case row:', err);
      toast.error('Gagal menyimpan target MTSS');
    } finally {
      setSavingRows((prev) => ({ ...prev, [caseObj.id]: false }));
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-900 text-slate-200 uppercase text-[10px] font-black tracking-wider border-b border-slate-800">
              <th className="py-4 px-6">Nama Siswa</th>
              <th className="py-4 px-4 text-center">Kelas</th>
              <th className="py-4 px-4 text-center">Bidang Studi</th>
              <th className="py-4 px-4 text-center">Intervensi Tier</th>
              <th className="py-4 px-4">Baseline Goal</th>
              <th className="py-4 px-4">Target Goal</th>
              <th className="py-4 px-4 text-center">Status</th>
              <th className="py-4 px-6 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cases.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 px-6 text-center text-xs text-slate-500 italic">
                  Tidak ada kasus intervensi aktif di tier ini.
                </td>
              </tr>
            ) : (
              cases.map((caseObj) => {
                const modified = isRowModified(caseObj);
                const saving = savingRows[caseObj.id];
                const baseline = getRowValue(caseObj, 'baselineScore') as string;
                const target = getRowValue(caseObj, 'targetScore') as string;
                const status = getRowValue(caseObj, 'status') as 'Active' | 'Achieved';

                return (
                  <tr
                    key={caseObj.id}
                    className={`transition-colors hover:bg-slate-50/50 ${
                      modified ? 'bg-amber-50/20 shadow-inner' : ''
                    }`}
                  >
                    {/* Student Name */}
                    <td className="py-3 px-6 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="font-extrabold text-xs text-slate-800 flex items-center gap-1.5">
                          {caseObj.studentName}
                          {modified && (
                            <span className="bg-amber-100 text-amber-800 border border-amber-200 rounded-md px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider animate-pulse">
                              Terganti
                            </span>
                          )}
                        </span>
                        <span className="text-[9px] text-slate-450 font-bold uppercase tracking-wider">
                          ID: {caseObj.studentId}
                        </span>
                      </div>
                    </td>

                    {/* Class */}
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-lg">
                        {classesList?.find((c) => c.id === caseObj.classId)?.name || caseObj.classId || '-'}
                      </span>
                    </td>

                    {/* Subject */}
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-xl uppercase tracking-wider border ${
                        caseObj.subject === 'Bahasa Indonesia'
                          ? 'bg-blue-50 text-blue-700 border-blue-100'
                          : caseObj.subject === 'English'
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-100'
                          : caseObj.subject === 'Numeracy'
                          ? 'bg-rose-50 text-rose-700 border-rose-100'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                      }`}>
                        {caseObj.subject}
                      </span>
                    </td>

                    {/* Tier */}
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <span className={`text-[10px] font-black px-2.5 py-1 rounded-xl uppercase tracking-wider border ${
                        caseObj.tier === 'Tier 2'
                          ? 'bg-amber-50 text-amber-700 border-amber-200/80 '
                          : caseObj.tier === 'Tier 3'
                          ? 'bg-rose-50 text-rose-700 border-rose-200/82 '
                          : 'bg-purple-50 text-purple-700 border-purple-200/80 '
                      }`}>
                        {caseObj.tier}
                      </span>
                    </td>

                    {/* Baseline Goal */}
                    <td className="py-3 px-4">
                      <input
                        type="text"
                        value={baseline}
                        onChange={(e) => handleFieldChange(caseObj.id, 'baselineScore', e.target.value)}
                        placeholder="Contoh: Baca 40 WPM"
                        className="w-full bg-slate-50 border border-slate-205 focus:border-indigo-500 rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none transition-colors text-slate-750"
                      />
                    </td>

                    {/* Target Goal */}
                    <td className="py-3 px-4">
                      <input
                        type="text"
                        value={target}
                        onChange={(e) => handleFieldChange(caseObj.id, 'targetScore', e.target.value)}
                        placeholder="Contoh: Capai 80 WPM"
                        className="w-full bg-slate-50 border border-slate-205 focus:border-indigo-500 rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none transition-colors text-slate-750"
                      />
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <select
                        value={status}
                        onChange={(e) => handleFieldChange(caseObj.id, 'status', e.target.value as any)}
                        className={`text-xs font-bold rounded-xl px-2.5 py-1.5 border focus:outline-none transition-all cursor-pointer ${
                          status === 'Active'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}
                      >
                        <option value="Active">🔴 Active</option>
                        <option value="Achieved">🟢 Achieved</option>
                      </select>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-6 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-2">
                        {/* Save Button */}
                        <button
                          type="button"
                          onClick={() => handleSaveRow(caseObj)}
                          disabled={!modified || saving}
                          className={`p-2 rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer ${
                            modified
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                              : 'bg-slate-100 text-slate-350 cursor-not-allowed'
                          }`}
                          title="Simpan perubahan target"
                        >
                          <Save size={14} />
                          {modified && <span className="text-[10px] font-bold uppercase tracking-wider pr-1">Simpan</span>}
                        </button>

                        {/* Riwayat & Catatan Individu */}
                        <button
                          type="button"
                          onClick={() => onLogCoaching(caseObj.id, caseObj.studentName, caseObj.subject, caseObj.tier, caseObj.studentId)}
                          className="p-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/50 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                          title="Buka Riwayat & Catatan Individu"
                        >
                          <ClipboardList size={14} />
                          <span className="text-[10px] font-bold uppercase tracking-wider pr-1">Riwayat & Catatan Individu</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
