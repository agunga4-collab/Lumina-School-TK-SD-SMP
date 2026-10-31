import * as React from 'react';
import { X, Calendar, Save, CheckCircle2, AlertCircle, Users, Check } from 'lucide-react';
import type { 
  ElementaryMonthlyAttendanceConfig 
} from '../../../../types/elementaryMonthlyReport';
import type { Student, User } from '../../../../types';
import { saveElementaryMonthlyAttendanceConfig } from '../../../../services/elementaryMonthlyReportService';
import { toast } from 'sonner';

interface AttendanceConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedClassId: string;
  selectedClassName: string;
  selectedYear: string;
  selectedSemester: string;
  selectedMonth: string;
  monthLabel: string;
  students: Student[];
  currentConfig: ElementaryMonthlyAttendanceConfig | null;
  currentUser: User;
  onSaved: () => void;
}

export const AttendanceConfigModal: React.FC<AttendanceConfigModalProps> = ({
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
  // Derive initial dates based on selectedMonth (YYYY-MM)
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

  // Student Attendance Map
  const [attendanceMap, setAttendanceMap] = React.useState<Record<string, { presentDays: number; totalDays?: number; notes?: string }>>(
    currentConfig?.studentAttendanceMap || {}
  );

  const [isSaving, setIsSaving] = React.useState<boolean>(false);

  // Sync state if currentConfig changes
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
      await saveElementaryMonthlyAttendanceConfig(
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
      toast.success('Konfigurasi presensi & titimangsa berhasil disimpan.');
      onSaved();
      onClose();
    } catch (err: any) {
      console.error('Error saving attendance config:', err);
      toast.error(err.message || 'Gagal menyimpan konfigurasi presensi.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-blue-100 text-blue-800">
                Presensi &amp; Titimangsa
              </span>
              <span className="text-xs text-slate-500 font-semibold">{monthLabel}</span>
            </div>
            <h2 className="text-base font-bold text-slate-900 mt-1">
              Pengaturan Periode Kehadiran &amp; Titimangsa
            </h2>
            <p className="text-xs text-slate-500">
              Periode tanggal kehadiran dapat melintasi batas bulan kalender sesuai jadwal cut-off sekolah.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs">
          {/* Section 1: Period & Total School Days */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
            <h3 className="font-bold text-slate-900 uppercase tracking-wide text-[11px] flex items-center gap-1.5">
              <Calendar size={14} className="text-blue-600" />
              <span>Periode Presensi &amp; Hari Efektif Sekolah</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Tanggal Mulai Periode
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-semibold"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Tanggal Akhir Periode
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-semibold"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Total Hari Efektif Sekolah
                </label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={totalSchoolDays}
                  onChange={(e) => setTotalSchoolDays(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-semibold"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Kota Titimangsa
                </label>
                <input
                  type="text"
                  value={signingLocation}
                  onChange={(e) => setSigningLocation(e.target.value)}
                  placeholder="Depok"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Titimangsa Rapor (Tanggal Tercetak)
                </label>
                <input
                  type="text"
                  value={signingDate}
                  onChange={(e) => setSigningDate(e.target.value)}
                  placeholder="31 Agustus 2025"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-semibold"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Student Attendance Table */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-bold text-slate-900 uppercase tracking-wide text-[11px] flex items-center gap-1.5">
                  <Users size={14} className="text-emerald-600" />
                  <span>Presensi Siswa ({students.length} Siswa)</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Data yang kosong tidak diasumsikan 100% dan akan memblokir publikasi rapor.
                </p>
              </div>

              <button
                type="button"
                onClick={handleBulkSetAllPresent}
                className="self-start sm:self-auto px-3 py-1.5 text-[11px] font-bold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer"
              >
                Isi Semua Hadir Penuh ({totalSchoolDays} Hari)
              </button>
            </div>

            <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-[320px] overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 w-12 text-center">No</th>
                    <th className="py-2.5 px-3">Nama Siswa</th>
                    <th className="py-2.5 px-3 w-36 text-center">Hari Hadir</th>
                    <th className="py-2.5 px-3 w-28 text-center">Persentase</th>
                    <th className="py-2.5 px-3 w-28 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {students.map((st, idx) => {
                    const record = attendanceMap[st.id];
                    const hasRecord = record && typeof record.presentDays === 'number';
                    const present = hasRecord ? record.presentDays : '';
                    const pct = hasRecord && totalSchoolDays > 0 
                      ? Math.round((record.presentDays / totalSchoolDays) * 1000) / 10 
                      : null;

                    return (
                      <tr key={st.id} className="hover:bg-slate-50/70">
                        <td className="py-2 px-3 text-center text-slate-400 font-semibold">{idx + 1}</td>
                        <td className="py-2 px-3 font-semibold text-slate-800">{st.name}</td>
                        <td className="py-2 px-3 text-center">
                          <input
                            type="number"
                            min={0}
                            max={totalSchoolDays}
                            value={present}
                            onChange={(e) => handleStudentPresentChange(st.id, e.target.value)}
                            placeholder="-"
                            className="w-20 px-2 py-1 text-center font-bold border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-white"
                          />
                        </td>
                        <td className="py-2 px-3 text-center font-bold text-slate-700">
                          {pct !== null ? `${pct}%` : '-'}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {hasRecord ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                              <CheckCircle2 size={12} />
                              <span>Terisi</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                              <AlertCircle size={12} />
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

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-200/50 transition-colors cursor-pointer"
          >
            Batal
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Save size={14} />
            <span>{isSaving ? 'Menyimpan...' : 'Simpan Konfigurasi'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
