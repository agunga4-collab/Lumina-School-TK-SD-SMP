import * as React from 'react';
import type { SELRubric, ElementaryMonthlySelSource } from '../../../../types/elementaryMonthlyReport';
import { SEL_LEVELS, SEL_LABELS, normalizeSELAchievement, renderSELText, assembleRubricSEL, validateSELSource, selSourceFingerprint } from '../../../../lib/elementaryMonthlySELBank';
import { fetchMonthlySELContext, type SELContext } from '../../../../services/elementaryMonthlySELService';
import { SELTemplateConfigModal } from './SELTemplateConfigModal';
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
  return <div className="space-y-3 bg-white p-3 rounded-xl border border-rose-200">
    <div className="flex justify-between gap-2"><strong>Rubrik SEL kelas dan periode</strong><button className="underline text-sm" onClick={() => setRefresh(r=>r+1)}>Muat ulang rubrik</button>{canManage && <button onClick={() => setConfigOpen(true)} className="text-blue-700 underline">Pengaturan Rubrik SEL</button>}</div>
    {loading && <p>Memuat rubrik…</p>}
    {error && <p role="alert" className="text-red-700">{error} <button onClick={() => setRefresh(r=>r+1)}>Coba muat ulang</button></p>}
    {!loading && !active && !error && <p className="bg-amber-50 p-2">Rubrik aktif belum tersedia. Narasi final manual tetap dapat diisi. Capaian tidak dibuat otomatis.</p>}
    {active && <div className="bg-blue-50 p-2"><p>Aktif: {active.name} — v{active.version}</p>{!props.locked && <button onClick={adopt} className="border rounded px-3 py-1">{source.rubricId === active.id ? 'Pilih ulang rubrik / perbarui konteks (reset capaian)' : 'Gunakan rubrik aktif (mulai Belum dinilai)'}</button>}</div>}
    {source.schemaVersion === 2 && <p>Sumber siswa: {rubric?.name || source.rubricId} — v{source.rubricVersion}. {active && active.id !== source.rubricId ? 'Rubrik aktif sudah berbeda. Sumber dan final siswa tetap menggunakan versi tersimpan sampai Anda memilih menggantinya.' : ''}</p>}
    {source.schemaVersion !== 2 && <p className="text-sm">Isian manual/data lama dipertahankan. Memilih rubrik adalah tindakan eksplisit; capaian tidak ditebak dari paragraf.</p>}
    {source.schemaVersion !== 2 && Object.keys(source.aspects || {}).length > 0 && <details><summary>Sumber lama (arsip, tanpa migrasi capaian)</summary><p>{source.opening}</p>{Object.entries(source.aspects || {}).map(([key,a]) => <p key={key}>{key}: {a.selectedText || a.customText || ''} {a.teacherNote}</p>)}<p>{source.closing}</p></details>}
    {rubric && <fieldset disabled={props.locked || loading} className="space-y-3">
      <p>Pembuka: {renderSELText(rubric.opening, source.placeholders || {})}</p>
      {rubric.aspects.map(a => {
        const selected = source.aspects?.[a.key] || {};
        const level = normalizeSELAchievement(selected.achievement);
        const variants = level ? a.levels[level] : [];
        const update = (patch: any) => props.onChange({ ...source, aspects: { ...source.aspects, [a.key]: { ...selected, ...patch } } });
        return <div key={a.key} className="border border-rose-100 p-3 rounded-lg space-y-2">
          <strong>{a.title}</strong>
          <select aria-label={`Capaian ${a.title}`} className="w-full p-2 border rounded" value={level} onChange={e => {
            const achievement = normalizeSELAchievement(e.target.value);
            const list = achievement ? a.levels[achievement] : [];
            // A single wording can be selected with the achievement; multiple variants require explicit selection.
            const v = list.length === 1 ? list[0] : null;
            update({ achievement, variantId: v?.id || '', selectedText: v ? renderSELText(v.text, source.placeholders || {}) : '' });
          }}><option value="">Belum dinilai</option>{SEL_LEVELS.map(l => <option key={l} value={l}>{l} — {SEL_LABELS[l]}</option>)}</select>
          {!!level && <select aria-label={`Varian ${a.title}`} className="w-full p-2 border rounded" value={selected.variantId || ''} onChange={e => { const v = variants.find(v=>v.id===e.target.value); update({ variantId:v?.id || '', selectedText:v ? renderSELText(v.text,source.placeholders || {}) : '' }); }}><option value="">Pilih varian redaksi</option>{variants.map((v,i) => <option key={v.id} value={v.id}>Varian {i+1}: {renderSELText(v.text,source.placeholders || {})}</option>)}</select>}
          <p className="whitespace-pre-wrap bg-slate-50 p-2">{selected.selectedText || 'Redaksi belum dipilih.'}</p>
          <label className="block text-sm">Catatan individual (opsional)<textarea className="w-full border rounded p-2" value={selected.teacherNote || ''} onChange={e => update({ teacherNote:e.target.value })}/></label>
        </div>;
      })}
      <p>Penutup: {renderSELText(rubric.closing,source.placeholders || {})}</p>
      {!!errors.length && <p className="text-amber-800 whitespace-pre-wrap">{errors.join('\n')}</p>}
      {changed && <p className="bg-amber-50 p-2">Sumber belum disusun atau berubah sejak susunan terakhir. Final tetap dipertahankan.</p>}
      <button disabled={!!errors.length || props.locked} className="rounded-lg px-4 py-2 bg-rose-700 text-white disabled:opacity-50" onClick={() => {
        const text = assembleRubricSEL(source,rubric);
        if (!text) return;
        // Fingerprint is applied only if the parent accepts replacement of the final text.
        props.onAssemble(text);
      }}>Susun Narasi SEL</button>
    </fieldset>}
    {configOpen && <SELTemplateConfigModal {...context} gradeLevel={props.gradeLevel || 1} onClose={() => setConfigOpen(false)} onApplied={() => setRefresh(r=>r+1)}/>}
  </div>;
}
