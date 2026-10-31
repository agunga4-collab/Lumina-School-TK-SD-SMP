import * as React from 'react';
import { X, Calendar, Save, CheckCircle2, AlertCircle, Users, Check } from 'lucide-react';
import type { ElementaryUpperAttendanceConfig } from '../../../../types/elementaryMonthlyUpperReport';
import type { Student, User } from '../../../../types';
import { saveUpperAttendanceConfig } from '../../../../services/elementaryMonthlyUpperReportService';
import { toast } from 'sonner';

interface UpperAttendanceConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedClassId: string;
  selectedClassName: string;
  selectedYear: string;
  selectedSemester: string;
  selectedMonth: string;
  monthLabel: string;
  students: Student[];
  currentConfig: ElementaryUpperAttendanceConfig | null;
  currentUser: User;
  onSaved: () => void;
}

export const UpperAttendanceConfigModal: React.FC<UpperAttendanceConfigModalProps> = ({
  isOpen,
  onClose,
  selectedClassId,
  selectedClassName,
  selectedYear,
  selectedSemester,
  selectedMonth,
  monthLabel,
  students,
  currentConfig,
  currentUser,
  onSaved
}) => {
  // Derive default dates based on selectedMonth (YYYY-MM)
  const defaultDates = React.useMemo(() => {
    if (!selectedMonth || !selectedMonth.includes('-')) {
      return { start: '2025-08-01', end: '2025-08-31' };
    }
    const [y, m] = selectedMonth.split('-');
    const yearNum = parseInt(y, 10);
    const monthNum = parseInt(m, 10);
    const lastDay = new Date(yearNum, monthNum, 0).getDate();
    return {
      start: `${y}-${m.padStart(2, '0')}-01`,
      end: `${y}-${m.padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    };
  }, [selectedMonth]);

  const [startDate, setStartDate] = React.useState<string>(currentConfig?.startDate || defaultDates.start);
  const [endDate, setEndDate] = React.useState<string>(currentConfig?.endDate || defaultDates.end);
  const [totalSchoolDays, setTotalSchoolDays] = React.useState<number>(currentConfig?.totalSchoolDays || 22);
  const [signingDate, setSigningDate] = React.useState<string>(
    currentConfig?.signingDate || `${defaultDates.end.split('-')[2]} ${monthLabel}`
  );
  const [signingLocation, setSigningLocation] = React.useState<string>(currentConfig?.signingLocation || 'Depok');

  const [attendanceMap, setAttendanceMap] = React.useState<Record<string, { presentDays: number; totalDays?: number; notes?: string }>>(
    currentConfig?.studentAttendanceMap || {}
  );

  const [isSaving, setIsSaving] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (currentConfig) {
      setStartDate(currentConfig.startDate || defaultDates.start);
      setEndDate(currentConfig.endDate || defaultDates.end);
      setTotalSchoolDays(currentConfig.totalSchoolDays || 22);
      setSigningDate(currentConfig.signingDate || `${defaultDates.end.split('-')[2]} ${monthLabel}`);
      setSigningLocation(currentConfig.signingLocation || 'Depok');
      setAttendanceMap(currentConfig.studentAttendanceMap || {});
    }
  }, [currentConfig, defaultDates, monthLabel]);

  if (!isOpen) return null;

  const handleStudentPresentChange = (studentId: string, value: string) => {
    const val = parseInt(value, 10);
    setAttendanceMap(prev => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        presentDays: isNaN(val) ? 0 : Math.max(0, val)
      }
    }));
  };

  const handleBulkSetAllPresent = () => {
    const nextMap: Record<string, { presentDays: number; totalDays?: number; notes?: string }> = {};
    for (const st of students) {
      nextMap[st.id] = {
        presentDays: totalSchoolDays,
        totalDays: totalSchoolDays
      };
    }
    setAttendanceMap(nextMap);
    toast.success(`Berhasil mengatur ${totalSchoolDays} hari hadir untuk semua siswa.`);
  };

  const handleSave = async () => {
    if (!startDate || !endDate) {
      toast.error('Periode kehadiran (tanggal mulai dan selesai) wajib diisi.');
      return;
    }
    if (totalSchoolDays <= 0) {
      toast.error('Total hari efektif sekolah harus lebih dari 0.');
      return;
    }
    if (!signingDate.trim()) {
      toast.error('Titimangsa penandatanganan rapor wajib diisi.');
      return;
    }

    setIsSaving(true);
    try {
      await saveUpperAttendanceConfig(
        {
          classId: selectedClassId,
          className: selectedClassName,
          academicYear: selectedYear,
          semester: selectedSemester,
          month: selectedMonth,
          startDate,
          endDate,
          totalSchoolDays,
          signingDate: signingDate.trim(),
          signingLocation: signingLocation.trim() || 'Depok',
          studentAttendanceMap: attendanceMap
        },
        currentUser
      );
      toast.success('Konfigurasi presensi & titimangsa Upper Grade berhasil disimpan.');
      onSaved();
      onClose();
    } catch (err) {
      console.error('Error saving upper attendance config:', err);
      toast.error('Gagal menyimpan konfigurasi presensi.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/30 border border-indigo-400/40 flex items-center justify-center text-indigo-300">
              <Calendar size={18} />
            </div>
            <div>
              <h3 className="font-bold text-sm">Konfigurasi Presensi &amp; Titimangsa Rapor Upper Grade</h3>
              <p className="text-xs text-slate-300">
                {selectedClassName} · {monthLabel} ({selectedYear})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-700">
          {/* General Period & Titimangsa Settings */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
            <h4 className="font-bold text-slate-900 text-xs flex items-center gap-2">
              <Calendar size={14} className="text-indigo-600" />
              <span>Periode Hari Efektif &amp; Titimangsa Penandatanganan</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Tanggal Mulai Periode
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Tanggal Selesai Periode
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Total Hari Efektif Sekolah
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={totalSchoolDays}
                    onChange={e => setTotalSchoolDays(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  <span className="text-[11px] text-slate-500 whitespace-nowrap">hari</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-200">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Lokasi Titimangsa
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Depok"
                  value={signingLocation}
                  onChange={e => setSigningLocation(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Titimangsa Rapor (Tanggal Lengkap)
                </label>
                <input
                  type="text"
                  placeholder={`Contoh: 31 ${monthLabel}`}
                  value={signingDate}
                  onChange={e => setSigningDate(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <span className="text-[10px] text-slate-500 mt-0.5 block">
                  Akan tercetak di atas tanda tangan: &quot;{signingLocation}, {signingDate}&quot;
                </span>
              </div>
            </div>
          </div>

          {/* Student Presence Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-900 text-xs flex items-center gap-2">
                  <Users size={14} className="text-indigo-600" />
                  <span>Kehadiran Siswa ({students.length} Siswa)</span>
                </h4>
                <p className="text-[11px] text-slate-500">
                  Data kehadiran tidak boleh diasumsikan 100% secara default. Masukkan jumlah hari hadir masing-masing siswa.
                </p>
              </div>
              <button
                type="button"
                onClick={handleBulkSetAllPresent}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold transition-colors cursor-pointer border border-indigo-200"
              >
                <Check size={13} strokeWidth={2.5} />
                <span>Set Semua Hadir Penuh ({totalSchoolDays} Hari)</span>
              </button>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 font-bold border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 w-12 text-center">No</th>
                    <th className="px-3 py-2">Nama Siswa</th>
                    <th className="px-3 py-2 w-32 text-center">Hari Hadir</th>
                    <th className="px-3 py-2 w-28 text-center">Persentase</th>
                    <th className="px-3 py-2 w-28 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {students.map((st, sIdx) => {
                    const stRec = attendanceMap[st.id];
                    const present = stRec?.presentDays;
                    const isConfigured = typeof present === 'number' && present >= 0;
                    const pct = isConfigured && totalSchoolDays > 0 ? Math.round((present / totalSchoolDays) * 100) : 0;

                    return (
                      <tr key={st.id} className="hover:bg-slate-50/70">
                        <td className="px-3 py-2 text-center text-slate-500 font-semibold">{sIdx + 1}</td>
                        <td className="px-3 py-2">
                          <span className="font-bold text-slate-900">{st.name}</span>
                          <span className="text-[10px] text-slate-500 ml-2">({st.nis || st.nisn || '-'})</span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <div className="inline-flex items-center gap-1.5">
                            <input
                              type="number"
                              min={0}
                              max={totalSchoolDays}
                              value={isConfigured ? present : ''}
                              placeholder="0"
                              onChange={e => handleStudentPresentChange(st.id, e.target.value)}
                              className="w-16 bg-white border border-slate-300 rounded-lg px-2 py-1 text-center font-bold text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            />
                            <span className="text-[10px] text-slate-500">/ {totalSchoolDays}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center">
                          {isConfigured ? (
                            <span className={`font-black ${pct >= 85 ? 'text-emerald-700' : pct >= 70 ? 'text-amber-700' : 'text-rose-700'}`}>
                              {pct}%
                            </span>
                          ) : (
                            <span className="text-slate-400 font-medium">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {isConfigured ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                              <CheckCircle2 size={11} />
                              <span>Diisi</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                              <AlertCircle size={11} />
                              <span>Kosong</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow transition-all cursor-pointer disabled:opacity-50"
          >
            <Save size={15} />
            <span>{isSaving ? 'Menyimpan...' : 'Simpan Konfigurasi Presensi'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
