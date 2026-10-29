import * as React from 'react';
import { X, Calendar, ArrowRight, ShieldCheck, AlertTriangle, Loader2 } from 'lucide-react';
import { JHAssessmentLO } from '../../../../types';
import { formatDateWIB } from '../../../../services/juniorHighAssessmentBookService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  lo: JHAssessmentLO;
  oldDate: string;
  newDate: string;
  affectedCount: number;
  hasConflict?: boolean;
  distinctDates?: { date: string; count: number }[];
  isUAMode?: boolean;
  onConfirm: () => Promise<void>;
}

export function LODateConfirmModal({
  isOpen,
  onClose,
  lo,
  oldDate,
  newDate,
  affectedCount,
  hasConflict = false,
  distinctDates = [],
  isUAMode = false,
  onConfirm
}: Props) {
  const [submitting, setSubmitting] = React.useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm();
      onClose();
    } catch {
      // Error handling is handled in parent callback via toast
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lo-date-confirm-title"
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-200 bg-slate-50/70 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-100 text-purple-700">
              <Calendar size={20} />
            </div>
            <div>
              <h2 id="lo-date-confirm-title" className="font-bold text-slate-900 text-base">
                {hasConflict ? 'Selaraskan Tanggal Asesmen LO' : 'Simpan Perubahan Tanggal Asesmen'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                <span className="font-bold text-purple-700">{lo.code}</span> · {lo.title}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            aria-label="Tutup"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors active:scale-95 disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs text-slate-700">
          {/* Date Comparison Banner */}
          <div className="p-3.5 bg-purple-50/80 border border-purple-200 rounded-xl flex items-center justify-around gap-2 text-center">
            <div className="flex-1">
              <span className="block text-[10px] uppercase font-bold text-slate-500 mb-0.5">Tanggal Saat Ini</span>
              <span className="font-semibold text-slate-800 text-xs">
                {hasConflict ? 'Beragam' : (oldDate ? formatDateWIB(oldDate) : 'Belum ditetapkan')}
              </span>
            </div>
            <div className="p-1.5 rounded-full bg-purple-200 text-purple-800 shrink-0">
              <ArrowRight size={14} />
            </div>
            <div className="flex-1">
              <span className="block text-[10px] uppercase font-bold text-purple-700 mb-0.5">Tanggal Baru (WIB)</span>
              <span className="font-bold text-purple-900 text-xs">
                {formatDateWIB(newDate)}
              </span>
            </div>
          </div>

          {/* Conflict warning if multiple dates exist */}
          {hasConflict && distinctDates.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-amber-800">
                <AlertTriangle size={14} className="shrink-0" />
                <span>Terdeteksi beberapa tanggal penilaian pada LO ini:</span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {distinctDates.map(item => (
                  <span
                    key={item.date}
                    className="px-2 py-0.5 rounded-md bg-white border border-amber-300 text-[11px] font-medium text-slate-700"
                  >
                    {formatDateWIB(item.date)}: <b>{item.count} entri</b>
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-amber-800/90 pt-1">
                Menyelaraskan tanggal akan memperbarui seluruh entri di atas ke tanggal <b>{formatDateWIB(newDate)}</b> tanpa mengubah nilai atau tugas.
              </p>
            </div>
          )}

          {/* Scope notice */}
          <div className="space-y-1">
            <p className="font-medium text-slate-800">
              {affectedCount > 0 ? (
                <>
                  Sebanyak <span className="font-bold text-purple-800">{affectedCount} entri penilaian</span> pada LO ini akan diselaraskan ke tanggal baru.
                </>
              ) : (
                <>Tanggal asesmen untuk LO ini akan ditetapkan menjadi {formatDateWIB(newDate)}.</>
              )}
            </p>
            {isUAMode && (
              <p className="text-[11px] text-slate-500">
                * Berlaku untuk seluruh peserta Unit Aktivitas ini lintas kelas/tingkatan yang terdaftar pada LO ini.
              </p>
            )}
          </div>

          {/* Assurance Box */}
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-emerald-800">
              <ShieldCheck size={14} className="shrink-0" />
              <span>Integritas Nilai Tetap Terjamin</span>
            </div>
            <ul className="text-[11px] space-y-0.5 text-emerald-800/90 list-disc list-inside">
              <li>Nilai capaian (Achieved / Not Achieved) dan tugas siswa <b>tidak dihapus atau diubah</b>.</li>
              <li>Jumlah siswa yang sudah dinilai <b>tetap sama</b> (tidak menjadi 0).</li>
              <li>Waktu input asli (<span className="font-mono">createdAt</span>) dan identitas guru pembuat tetap dipertahankan.</li>
            </ul>
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/70 flex items-center justify-end gap-2.5">
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs cursor-pointer active:scale-95 transition-all disabled:opacity-40"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={handleConfirm}
            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs inline-flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95 transition-all disabled:opacity-50"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            <span>{hasConflict ? 'Selaraskan Tanggal' : 'Konfirmasi & Simpan'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
