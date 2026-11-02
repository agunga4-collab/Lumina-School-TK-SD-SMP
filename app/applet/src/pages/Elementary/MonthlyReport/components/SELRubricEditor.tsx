import * as React from 'react';
import type { SELRubric, ElementaryMonthlySelSource } from '../../../../types/elementaryMonthlyReport';
import { SEL_LEVELS, SEL_LABELS, normalizeSELAchievement, renderSELText, assembleRubricSEL, validateSELSource, selSourceFingerprint } from '../../../../lib/elementaryMonthlySELBank';
import { fetchMonthlySELContext, type SELContext } from '../../../../services/elementaryMonthlySELService';
import { SELTemplateConfigModal } from './SELTemplateConfigModal';
import { RefreshCw } from 'lucide-react';

interface Props {
  key?: string;
  context: SELContext; gradeLevel: number; studentName: string; nickname: string; className: string; monthLabel: string;
  source: ElementaryMonthlySelSource; locked: boolean; finalText: string;
  onChange(source: ElementaryMonthlySelSource): void;
  onAssemble(text: string): void;
}

export function SELRubricEditor(props: Props) {
  const { source, context } = props;
  const [active, setActive] = React.useState<SELRubric | null>(null);
  const [pinned, setPinned] = React.useState<SELRubric | null>(null);
  const [canManage, setCanManage] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [configOpen, setConfigOpen] = React.useState(false);
  const [refresh, setRefresh] = React.useState(0);

  const [reloading, setReloading] = React.useState(false);
  const [reloadStatusMsg, setReloadStatusMsg] = React.useState('');

  const key = JSON.stringify([context, source.rubricId, refresh]);

  React.useEffect(() => {
    let live = true;
    setLoading(true); setError(''); setActive(null); setPinned(null);
    fetchMonthlySELContext({ ...context, ...(source.rubricId ? { rubricId: source.rubricId } : {}) })
      .then(r => { if (live) { setActive(r.rubric); setPinned(r.pinnedRubric); setCanManage(r.canManage); } })
      .catch(e => { if (live) setError(e.message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [key]);

  const rubric = source.schemaVersion === 2 ? pinned : null;
  const errors = source.schemaVersion === 2 ? validateSELSource(source, rubric) : [];
  const changed = source.schemaVersion === 2 && source.assembledFingerprint !== selSourceFingerprint(source);

  function adopt() {
    if (!active || props.locked) return;
    if ((props.finalText.trim() || Object.keys(source.aspects || {}).length) && !confirm('Gunakan rubrik aktif dan mulai pilihan aspek dari Belum dinilai? Narasi final Anda tetap dipertahankan.')) return;
    props.onChange({ schemaVersion: 2, rubricId: active.id, rubricVersion: active.version, gradeLevel: active.gradeLevel,
      ...context, opening: active.opening, closing: active.closing, aspects: {},
      placeholders: { namaSiswa: props.studentName, namaPanggilan: props.nickname || props.studentName, bulan: props.monthLabel, kelas: props.className },
      isManuallyEdited: !!props.finalText.trim(), lastAssembledText: '', assembledFingerprint: '' });
  }

  async function handleReloadRubric() {
    if (reloading) return;
    setReloading(true);
    setReloadStatusMsg('Memuat…');
    try {
      const r = await fetchMonthlySELContext({ ...context, ...(source.rubricId ? { rubricId: source.rubricId } : {}) });
      setActive(r.rubric);
      setPinned(r.pinnedRubric);
      setCanManage(r.canManage);
      setReloadStatusMsg('Berhasil memuat ulang rubrik.');
      setTimeout(() => setReloadStatusMsg(''), 3000);
    } catch (e: any) {
      setError(e.message || 'Gagal memuat ulang rubrik.');
      setReloadStatusMsg('Gagal memuat ulang.');
    } finally {
      setReloading(false);
    }
  }

  return (
    <div className="space-y-4 bg-white p-4 sm:p-5 rounded-2xl border border-rose-200/80 shadow-xs">
      {/* Header & Muat Ulang Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-150">
        <div className="flex items-center gap-2">
          <strong className="text-xs font-bold text-slate-800 uppercase tracking-wider">Rubrik SEL Kelas & Periode</strong>
          {reloadStatusMsg && (
            <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
              {reloadStatusMsg}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            disabled={reloading}
            onClick={handleReloadRubric}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs disabled:opacity-50 transition-all cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          >
            <RefreshCw size={13} className={reloading ? 'animate-spin text-blue-600' : 'text-slate-500'} />
            {reloading ? 'Memuat…' : 'Muat Ulang Rubrik'}
          </button>
          {canManage && (
            <button
              type="button"
              onClick={() => setConfigOpen(true)}
              className="text-xs font-semibold text-blue-700 hover:text-blue-800 underline px-1"
            >
              Pengaturan Rubrik SEL
            </button>
          )}
        </div>
      </div>

      {loading && <p className="text-xs text-slate-500 italic py-2">Memuat rubrik…</p>}
      {error && (
        <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 space-y-2">
          <p>{error}</p>
          <button type="button" onClick={handleReloadRubric} className="underline font-semibold">Coba muat ulang</button>
        </div>
      )}

      {!loading && !active && !error && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed">
          Rubrik aktif belum tersedia. Narasi final manual tetap dapat diisi. Capaian tidak dibuat otomatis.
        </div>
      )}

      {active && (
        <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div>
            <strong className="text-blue-900 font-bold block">Rubrik Aktif: {active.name} — v{active.version}</strong>
            <span className="text-blue-700 text-[11px]">Tingkat Kelas {active.gradeLevel}</span>
          </div>
          {!props.locked && (
            <button
              type="button"
              onClick={adopt}
              className="px-3 py-1.5 rounded-lg border border-blue-300 bg-white hover:bg-blue-50 text-blue-800 font-semibold shadow-2xs transition-all cursor-pointer"
            >
              {source.rubricId === active.id ? 'Pilih ulang rubrik / perbarui konteks (reset capaian)' : 'Gunakan rubrik aktif (mulai Belum dinilai)'}
            </button>
          )}
        </div>
      )}

      {source.schemaVersion === 2 && (
        <p className="text-xs text-slate-600">
          Sumber siswa: <strong>{rubric?.name || source.rubricId}</strong> — v{source.rubricVersion}.{' '}
          {active && active.id !== source.rubricId ? 'Rubrik aktif sudah berbeda. Sumber dan final siswa tetap menggunakan versi tersimpan sampai Anda memilih menggantinya.' : ''}
        </p>
      )}

      {source.schemaVersion !== 2 && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 space-y-1">
          <p>Isian manual/data lama dipertahankan. Memilih rubrik adalah tindakan eksplisit; capaian tidak ditebak dari paragraf.</p>
          {Object.keys(source.aspects || {}).length > 0 && (
            <details className="pt-2">
              <summary className="font-semibold cursor-pointer text-slate-700">Sumber lama (arsip, tanpa migrasi capaian)</summary>
              <div className="mt-2 space-y-1 pl-2 border-l-2 border-slate-300 text-[11px]">
                <p>{source.opening}</p>
                {Object.entries(source.aspects || {}).map(([key, a]) => (
                  <p key={key}><strong>{key}</strong>: {a.selectedText || a.customText || ''} {a.teacherNote}</p>
                ))}
                <p>{source.closing}</p>
              </div>
            </details>
          )}
        </div>
      )}

      {rubric && (
        <fieldset disabled={props.locked || loading} className="space-y-4">
          {/* Pembuka Rubrik */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700">Pembuka Rubrik (Admin):</label>
            <textarea
              readOnly
              rows={2}
              value={renderSELText(rubric.opening, source.placeholders || {})}
              className="w-full text-xs p-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 resize-y whitespace-pre-wrap font-sans"
            />
          </div>

          {/* Aspects Editor */}
          <div className="space-y-3">
            {rubric.aspects.map(a => {
              const selected = source.aspects?.[a.key] || {};
              const level = normalizeSELAchievement(selected.achievement);
              const variants = level ? (a.levels[level] || []) : [];
              const update = (patch: any) => props.onChange({ ...source, aspects: { ...source.aspects, [a.key]: { ...selected, ...patch } } });

              return (
                <div key={a.key} className="border border-rose-100 p-3.5 rounded-xl bg-white space-y-2.5 shadow-2xs">
                  <strong className="text-xs font-bold text-slate-800 block">{a.title}</strong>
                  
                  {/* Capaian Level Dropdown (MB/SB/BSH/SAB) */}
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Capaian Aspek:</label>
                    <select
                      aria-label={`Capaian ${a.title}`}
                      className="w-full text-xs p-2.5 border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                      value={level}
                      onChange={e => {
                        const achievement = normalizeSELAchievement(e.target.value);
                        const list = achievement ? (a.levels[achievement] || []) : [];
                        const v = list.length === 1 ? list[0] : null;
                        update({ achievement, variantId: v?.id || '', selectedText: v ? renderSELText(v.text, source.placeholders || {}) : '' });
                      }}
                    >
                      <option value="">Belum dinilai</option>
                      {SEL_LEVELS.map(l => (
                        <option key={l} value={l}>{l} — {SEL_LABELS[l]}</option>
                      ))}
                    </select>
                  </div>

                  {/* Variant Selector (if multiple variants exist for the level) */}
                  {!!level && variants.length > 1 && (
                    <div className="space-y-1">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Pilihan Varian Redaksi:</label>
                      <select
                        aria-label={`Varian ${a.title}`}
                        className="w-full text-xs p-2.5 border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                        value={selected.variantId || ''}
                        onChange={e => {
                          const v = variants.find(v => v.id === e.target.value);
                          update({
                            variantId: v?.id || '',
                            selectedText: v ? renderSELText(v.text, source.placeholders || {}) : ''
                          });
                        }}
                      >
                        <option value="">Pilih varian redaksi ({variants.length} pilihan)</option>
                        {variants.map((v, i) => (
                          <option key={v.id} value={v.id}>Varian {i + 1}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Redaksi Lengkap (ReadOnly Resizable Textarea) */}
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Redaksi Lengkap Terpilih:</label>
                    <textarea
                      readOnly
                      rows={3}
                      value={selected.selectedText || (variants.length === 1 ? renderSELText(variants[0].text, source.placeholders || {}) : 'Redaksi belum dipilih.')}
                      className="w-full text-xs p-2.5 border border-slate-200 rounded-xl bg-slate-50/80 text-slate-800 resize-y whitespace-pre-wrap font-sans"
                      placeholder="Redaksi lengkap akan tampil di sini setelah capaian atau varian dipilih..."
                    />
                  </div>

                  {/* Catatan Individual (Editable Resizable Textarea) */}
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600">Catatan Individual (Opsional):</label>
                    <textarea
                      rows={2}
                      value={selected.teacherNote || ''}
                      onChange={e => update({ teacherNote: e.target.value })}
                      placeholder="Tuliskan catatan khusus atau perkembangan individual siswa pada aspek ini..."
                      className="w-full text-xs p-2.5 border border-slate-300 rounded-xl bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500 resize-y"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Penutup Rubrik */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700">Penutup Rubrik (Admin):</label>
            <textarea
              readOnly
              rows={2}
              value={renderSELText(rubric.closing, source.placeholders || {})}
              className="w-full text-xs p-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 resize-y whitespace-pre-wrap font-sans"
            />
          </div>

          {!!errors.length && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 whitespace-pre-wrap">
              {errors.join('\n')}
            </div>
          )}

          {changed && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
              Sumber belum disusun atau berubah sejak susunan terakhir. Final tetap dipertahankan.
            </div>
          )}

          <button
            type="button"
            disabled={!!errors.length || props.locked}
            className="w-full sm:w-auto rounded-xl px-5 py-2.5 bg-rose-700 hover:bg-rose-800 text-white font-bold text-xs shadow-sm disabled:opacity-50 transition-all cursor-pointer"
            onClick={() => {
              const text = assembleRubricSEL(source, rubric);
              if (!text) return;
              props.onAssemble(text);
            }}
          >
            Susun Narasi SEL
          </button>
        </fieldset>
      )}

      {configOpen && (
        <SELTemplateConfigModal
          {...context}
          gradeLevel={props.gradeLevel || 1}
          onClose={() => setConfigOpen(false)}
          onApplied={() => setRefresh(r => r + 1)}
        />
      )}
    </div>
  );
}
