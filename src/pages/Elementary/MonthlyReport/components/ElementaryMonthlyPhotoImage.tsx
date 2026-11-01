import * as React from 'react';
import { AlertCircle, RefreshCw, X } from 'lucide-react';
import type { ElementaryMonthlyCropSettings } from '../../../../types/elementaryMonthlyReport';
import { fetchElementaryMonthlyPhotoBlob } from '../../../../services/elementaryMonthlyReportService';
import { getElementaryMonthlyPhotoStyle, normalizeElementaryMonthlyCrop } from '../../../../lib/elementaryMonthlyPhoto';

export interface ElementaryMonthlyPhotoScope {
  classId: string;
  studentId: string;
  academicYear: string;
  semester: string;
  month: string;
}

interface ElementaryMonthlyPhotoImageProps {
  src: string;
  scope: ElementaryMonthlyPhotoScope;
  alt: string;
  cropSettings?: ElementaryMonthlyCropSettings;
  compact?: boolean;
  onReadyChange?: (ready: boolean) => void;
}

/** Fetch private images with Firebase authentication; only a local Blob URL reaches img. */
const AuthenticatedPhotoImage: React.FC<ElementaryMonthlyPhotoImageProps> = ({
  src, scope, alt, cropSettings, compact = false, onReadyChange,
}) => {
  const [source, setSource] = React.useState('');
  const [ready, setReady] = React.useState(false);
  const [error, setError] = React.useState('');
  const [attempt, setAttempt] = React.useState(0);
  const timerRef = React.useRef<number | null>(null);
  const readyCallback = React.useRef(onReadyChange);
  readyCallback.current = onReadyChange;
  const { classId, studentId, academicYear, semester, month } = scope;

  React.useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let objectUrl = '';
    setSource('');
    setReady(false);
    setError('');
    readyCallback.current?.(false);
    const timeout = window.setTimeout(() => {
      controller.abort();
      if (!disposed) setError('Foto belum selesai dimuat. Silakan coba lagi.');
    }, 30000);
    timerRef.current = timeout;

    void fetchElementaryMonthlyPhotoBlob(
      src, { classId, studentId, academicYear, semester, month }, controller.signal,
    ).then(blob => {
      if (disposed || controller.signal.aborted) return;
      if (!blob.size || !blob.type.startsWith('image/')) {
        throw new Error('Berkas foto yang diterima tidak valid.');
      }
      objectUrl = URL.createObjectURL(blob);
      setSource(objectUrl);
    }).catch((cause: unknown) => {
      if (disposed) return;
      window.clearTimeout(timeout);
      if (timerRef.current === timeout) timerRef.current = null;
      setError(cause instanceof Error && cause.name !== 'AbortError'
        ? cause.message : 'Foto belum selesai dimuat. Silakan coba lagi.');
    });

    return () => {
      disposed = true;
      controller.abort();
      window.clearTimeout(timeout);
      if (timerRef.current === timeout) timerRef.current = null;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, classId, studentId, academicYear, semester, month, attempt]);

  React.useEffect(() => {
    readyCallback.current?.(ready && !error);
  }, [ready, error]);

  return (
    <div className="relative h-full w-full overflow-hidden" aria-busy={!ready && !error}>
      {source && !error && (
        <img
          src={source}
          alt={alt}
          style={{ width: '100%', height: '100%', display: 'block', ...getElementaryMonthlyPhotoStyle(cropSettings) }}
          onLoad={(event) => {
            if (timerRef.current !== null) window.clearTimeout(timerRef.current);
            timerRef.current = null;
            if (event.currentTarget.naturalWidth > 0 && event.currentTarget.naturalHeight > 0) {
              setReady(true);
            } else {
              setError('Foto tidak dapat dibaca.');
            }
          }}
          onError={() => {
            if (timerRef.current !== null) window.clearTimeout(timerRef.current);
            timerRef.current = null;
            setReady(false);
            setError('Foto tidak dapat ditampilkan.');
          }}
        />
      )}
      {!ready && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100 text-slate-500" role="status">
          <RefreshCw size={compact ? 12 : 18} className="animate-spin" />
          <span className="sr-only">Memuat foto</span>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-red-50 p-1 text-center text-red-700" title={error} role="alert">
          <AlertCircle size={compact ? 12 : 18} />
          {!compact && (
            <>
              <span className="text-[10px] leading-tight">{error}</span>
              <button type="button" className="text-[10px] font-semibold underline" onClick={() => setAttempt(value => value + 1)}>
                Muat ulang foto
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export const ElementaryMonthlyPhotoImage: React.FC<ElementaryMonthlyPhotoImageProps> = (props) => (
  <AuthenticatedPhotoImage
    key={JSON.stringify([props.src, props.scope.classId, props.scope.studentId, props.scope.academicYear, props.scope.semester, props.scope.month])}
    {...props}
  />
);

interface ElementaryMonthlyPhotoCropDialogProps {
  src: string;
  scope: ElementaryMonthlyPhotoScope;
  title: string;
  cropSettings?: ElementaryMonthlyCropSettings;
  aspectRatio: number;
  onClose: () => void;
  onApply: (settings: ElementaryMonthlyCropSettings) => void;
}

export const ElementaryMonthlyPhotoCropDialog: React.FC<ElementaryMonthlyPhotoCropDialogProps> = ({
  src, scope, title, cropSettings, aspectRatio, onClose, onApply,
}) => {
  const [settings, setSettings] = React.useState<ElementaryMonthlyCropSettings>({
    ...normalizeElementaryMonthlyCrop(cropSettings),
    aspectRatio,
  });
  const [imageReady, setImageReady] = React.useState(false);
  const titleId = React.useId();

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <h3 id={titleId} className="text-sm font-bold text-slate-900">{title}</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Tutup pengaturan foto">
            <X size={18} />
          </button>
        </div>
        <div className="mx-auto w-full max-w-sm overflow-hidden border border-slate-300 bg-slate-100">
          <div style={{ aspectRatio }}>
            <ElementaryMonthlyPhotoImage src={src} scope={scope} alt={title} cropSettings={settings} onReadyChange={setImageReady} />
          </div>
        </div>
        <p className="text-xs text-slate-500">Atur tampilan foto pada bingkai laporan. Berkas asli di Drive tetap tersimpan.</p>
        <label className="block space-y-1 text-xs font-semibold text-slate-700">
          <span>Tampilan dalam bingkai</span>
          <select
            value={settings.fit}
            onChange={(event) => setSettings(previous => ({
              ...previous, fit: event.target.value as 'contain' | 'cover', x: 50, y: 50, zoom: 1,
            }))}
            className="w-full rounded-lg border border-slate-300 bg-white p-2"
          >
            <option value="contain">Tampilkan seluruh foto</option>
            <option value="cover">Penuhi bingkai (bagian tepi dapat terpotong)</option>
          </select>
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs text-slate-700">
            <span>Posisi horizontal: {Math.round(settings.x ?? 50)}%</span>
            <input className="block w-full" type="range" min="0" max="100" step="1" value={settings.x ?? 50}
              onChange={(event) => setSettings(previous => ({ ...previous, x: Number(event.target.value) }))} />
          </label>
          <label className="space-y-1 text-xs text-slate-700">
            <span>Posisi vertikal: {Math.round(settings.y ?? 50)}%</span>
            <input className="block w-full" type="range" min="0" max="100" step="1" value={settings.y ?? 50}
              onChange={(event) => setSettings(previous => ({ ...previous, y: Number(event.target.value) }))} />
          </label>
          <label className="space-y-1 text-xs text-slate-700 sm:col-span-2">
            <span>Perbesaran: {(settings.zoom ?? 1).toFixed(2)}×</span>
            <input className="block w-full disabled:opacity-40" type="range" min="1" max="3" step="0.05" value={settings.zoom ?? 1} disabled={settings.fit === 'contain'}
              onChange={(event) => setSettings(previous => ({ ...previous, zoom: Number(event.target.value) }))} />
            {settings.fit === 'contain' && <span className="block text-[11px] text-slate-500">Pilih Penuhi bingkai untuk memperbesar dan memotong foto.</span>}
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <button type="button" className="text-xs font-semibold text-slate-600 underline" onClick={() => setSettings({ fit: 'contain', x: 50, y: 50, zoom: 1, aspectRatio })}>
            Tampilkan utuh
          </button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-600">Batal</button>
            <button type="button" disabled={!imageReady} onClick={() => onApply(settings)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
              Terapkan ke Draf
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
