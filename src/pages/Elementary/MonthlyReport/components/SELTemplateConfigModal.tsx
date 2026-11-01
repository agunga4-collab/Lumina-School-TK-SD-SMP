import * as React from 'react';
import type { SELRubric } from '../../../../types/elementaryMonthlyReport';
import { createBlankSELRubric, SEL_LEVELS, SEL_LABELS, renderSELText, validateSELRubric } from '../../../../lib/elementaryMonthlySELBank';
import { listMonthlySELRubrics, saveMonthlySELRubric, applyMonthlySELRubric, SELRequestError } from '../../../../services/elementaryMonthlySELService';

interface Props {
  academicYear: string; semester: string; month: string; gradeLevel: number;
  onClose(): void; onApplied(): void;
}
const inputStyle = 'w-full border border-slate-300 rounded-lg p-2 text-sm bg-white';
const buttonStyle = 'rounded-lg border px-3 py-2 text-sm disabled:opacity-50';
export function SELTemplateConfigModal(props: Props) {
  const [rubric, setRubric] = React.useState(() => ({ ...createBlankSELRubric(props), id: crypto.randomUUID() }));
  const [classes, setClasses] = React.useState<{ id: string; name: string }[]>([]);
  const [rubrics, setRubrics] = React.useState<SELRubric[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [error, setError] = React.useState('');
  const [results, setResults] = React.useState<{ classId: string; status: string }[]>([]);
  const immutable = rubric.status === 'APPLIED';
  const queryContext = JSON.stringify([rubric.academicYear, rubric.semester, rubric.month, rubric.gradeLevel]);
  React.useEffect(() => {
    let live = true;
    setLoading(true); setClasses([]); setError('');
    listMonthlySELRubrics(rubric).then(result => { if (live) { setClasses(result.classes); setRubrics(result.rubrics); } })
      .catch(e => { if (live) setError(e.message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [queryContext]);
  function edit(patch: Partial<SELRubric>) { setRubric(r => ({ ...r, ...patch })); setDirty(true); setResults([]); }
  function close() { if (!busy && (!dirty || confirm('Tutup konfigurasi dan buang perubahan rubrik yang belum disimpan?'))) props.onClose(); }
  function load(r: SELRubric) { if (!dirty || confirm('Ganti isian konfigurasi dan buang perubahan yang belum disimpan?')) { setRubric(r); setDirty(false); setResults([]); } }
  function fork(copyPeriod = false) {
    setRubric(r => ({ ...r, id: crypto.randomUUID(), previousId: r.id, version: r.version + 1, revision: 0,
      status: 'DRAFT', classIds: copyPeriod ? [] : r.classIds, createdAt: 0, createdBy: '', updatedAt: 0, updatedBy: '' }));
    setDirty(true); setResults([]);
  }
  async function persist(apply: boolean) {
    if (busy || loading) return;
    setBusy(true); setError(''); setResults([]);
    try {
      if (apply) { const errors = validateSELRubric(rubric); if (errors.length) throw new Error(errors.join('\n')); }
      const saved = immutable ? rubric : (await saveMonthlySELRubric(rubric)).rubric;
      setRubric(saved); setDirty(false);
      if (!apply) { setRubrics(prev => [saved, ...prev.filter(r => r.id !== saved.id)]); return; }
      let outcome;
      try { outcome = await applyMonthlySELRubric(saved); }
      catch (e) {
        if (!(e instanceof SELRequestError) || e.code !== 'SEL_BINDING_CONFLICT') throw e;
        const conflicts = e.details.conflicts;
        const details = conflicts.map((c: any) => `${classes.find(k => k.id === c.classId)?.name || c.classId}: ${c.rubricId} v${c.version}`).join('\n');
        if (!confirm(`Konflik rubrik aktif:\n${details}\n\nGanti hanya tautan aktif kelas-kelas ini? Narasi siswa lama tetap pada versi sebelumnya.`)) { setError('Penerapan dibatalkan. Draf sudah tersimpan; belum ada kelas yang diubah.'); return; }
        outcome = await applyMonthlySELRubric(saved, conflicts);
      }
      setResults(outcome.results); setRubric(r => ({ ...r, status: 'APPLIED' })); props.onApplied();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const sample = { namaPanggilan: 'Contoh Nama Panggilan', namaSiswa: 'Contoh Nama Siswa', bulan: rubric.month, kelas: 'Contoh Kelas' };
  return <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Konfigurasi rubrik SEL">
    <div className="bg-white rounded-2xl p-5 max-w-4xl w-full max-h-[92vh] overflow-auto space-y-4">
      <div className="flex justify-between"><h3 className="font-bold">Pengaturan Rubrik SEL — Admin</h3><button disabled={busy} onClick={close}>Tutup</button></div>
      <p className="text-sm">Redaksi diisi oleh admin sekolah. Placeholder: {'{namaPanggilan}, {namaSiswa}, {bulan}, {kelas}'}. Urutan aspek mengikuti urutan di bawah.</p>
      {error && <p role="alert" className="bg-red-50 p-3 text-red-800 whitespace-pre-wrap">{error}</p>}
      <select className={inputStyle} disabled={busy || loading} value="" onChange={e => { const r = rubrics.find(r => r.id === e.target.value); if (r) load(r); }}>
        <option value="">Buka rubrik tersimpan pada periode ini…</option>
        {rubrics.map(r => <option key={r.id} value={r.id}>{r.name || '(Draf tanpa nama)'} — v{r.version} — {r.status}</option>)}
      </select>
      <div className="flex gap-2 flex-wrap">
        <button className={buttonStyle} disabled={busy} onClick={() => { if (!dirty || confirm('Buat draf kosong? Perubahan belum tersimpan akan dibuang.')) load({ ...createBlankSELRubric(rubric), id: crypto.randomUUID() }); }}>Draf baru</button>
        <button className={buttonStyle} disabled={busy || !rubric.createdAt} onClick={() => fork(false)}>Buat versi baru sebagai draf</button>
        <button className={buttonStyle} disabled={busy || !rubric.createdAt} onClick={() => fork(true)}>Salin ke periode lain sebagai draf</button>
      </div>
      {immutable && <p className="bg-amber-50 p-2">Versi ini sudah diterapkan dan tidak dapat diedit. Gunakan “Buat versi baru” untuk perubahan.</p>}
      <fieldset disabled={busy || immutable} className="space-y-4 disabled:opacity-80">
        <label className="block">Nama rubrik<input className={inputStyle} value={rubric.name} onChange={e => edit({ name: e.target.value })}/></label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <label>Tahun ajaran<input className={inputStyle} value={rubric.academicYear} placeholder="2026/2027" onChange={e => edit({ academicYear: e.target.value, classIds: [] })}/></label>
          <label>Semester<select className={inputStyle} value={rubric.semester} onChange={e => edit({ semester: e.target.value, classIds: [] })}><option>1</option><option>2</option></select></label>
          <label>Bulan/periode<input className={inputStyle} type="month" value={rubric.month} onChange={e => edit({ month: e.target.value, classIds: [] })}/></label>
          <label>Tingkat<select className={inputStyle} value={rubric.gradeLevel} onChange={e => { const gradeLevel = Number(e.target.value); edit({ gradeLevel, classIds: [], aspects: createBlankSELRubric({ ...rubric, gradeLevel }).aspects }); }}>
            {[1,2,3].map(g => <option key={g} value={g}>Kelas {g}</option>)}
          </select></label>
        </div>
        <div className="border p-3 rounded-lg space-y-2">
          <p>Kelas penerima (default kosong){loading ? ' — memuat kelas…' : ''}</p>
          <label className="block"><input type="checkbox" disabled={loading || !classes.length} checked={!!classes.length && classes.every(c => rubric.classIds.includes(c.id))} onChange={e => edit({ classIds: e.target.checked ? classes.map(c => c.id) : [] })}/> Pilih semua kelas dalam paralel ini</label>
          {classes.map(c => <label className="inline-flex gap-2 mr-4" key={c.id}><input type="checkbox" checked={rubric.classIds.includes(c.id)} onChange={e => edit({ classIds: e.target.checked ? [...rubric.classIds, c.id] : rubric.classIds.filter(id => id !== c.id) })}/>{c.name}</label>)}
          {!loading && !classes.length && <p>Tidak ada kelas aktif Elementary yang sesuai tahun ajaran dan tingkat.</p>}
        </div>
        <label className="block">Kalimat pembuka<textarea className={inputStyle} value={rubric.opening} onChange={e => edit({ opening: e.target.value })}/></label>
        {rubric.aspects.map((aspect, index) => <div className="border rounded-lg p-3 space-y-2" key={aspect.key}>
          <div className="flex gap-2"><input aria-label="Nama aspek" className={inputStyle} value={aspect.title} onChange={e => edit({ aspects: rubric.aspects.map((a,i) => i === index ? { ...a, title: e.target.value } : a) })}/>
            <button type="button" disabled={!index} onClick={() => { const a = [...rubric.aspects]; [a[index-1],a[index]] = [a[index],a[index-1]]; edit({ aspects:a }); }}>↑</button>
            <button type="button" disabled={index === rubric.aspects.length-1} onClick={() => { const a = [...rubric.aspects]; [a[index+1],a[index]] = [a[index],a[index+1]]; edit({ aspects:a }); }}>↓</button>
            <button type="button" onClick={() => edit({ aspects: rubric.aspects.filter((_,i) => i !== index) })}>Hapus</button>
          </div>
          {SEL_LEVELS.map(level => <div key={level} className="space-y-1">
            <p className="font-semibold text-sm">{level} — {SEL_LABELS[level]}</p>
            {aspect.levels[level].map((variant, vIndex) => <div className="flex gap-2" key={variant.id}><textarea className={inputStyle} aria-label={`${aspect.title} ${level} varian ${vIndex+1}`} placeholder="Redaksi admin (kosong sampai diisi)" value={variant.text} onChange={e => edit({ aspects: rubric.aspects.map((a,i) => i !== index ? a : { ...a, levels: { ...a.levels, [level]: a.levels[level].map(v => v.id === variant.id ? { ...v, text: e.target.value } : v) } }) })}/><button onClick={() => edit({ aspects: rubric.aspects.map((a,i) => i !== index ? a : { ...a, levels: { ...a.levels, [level]: a.levels[level].filter(v => v.id !== variant.id) } }) })}>Hapus varian</button></div>)}
            <button className={buttonStyle} onClick={() => edit({ aspects: rubric.aspects.map((a,i) => i !== index ? a : { ...a, levels: { ...a.levels, [level]: [...a.levels[level], { id: crypto.randomUUID(), text: '' }] } }) })}>Tambah varian {level}</button>
          </div>)}
        </div>)}
        <button className={buttonStyle} onClick={() => edit({ aspects: [...rubric.aspects, { key: crypto.randomUUID(), title: '', levels: Object.fromEntries(SEL_LEVELS.map(l => [l, [{ id:'v1',text:'' }]])) as any }] })}>Tambah aspek</button>
        <label className="block">Kalimat penutup<textarea className={inputStyle} value={rubric.closing} onChange={e => edit({ closing: e.target.value })}/></label>
      </fieldset>
      <details className="bg-blue-50 p-3"><summary>Preview CONTOH — bukan data atau capaian siswa</summary><p>{renderSELText(rubric.opening, sample)}</p>{rubric.aspects.map(a => <div key={a.key}><strong>{a.title}</strong>{SEL_LEVELS.map(l => <p key={l}>{l}: {(a.levels[l] || []).map(v => renderSELText(v.text, sample)).join(' / ') || '(redaksi kosong)'}</p>)}</div>)}<p>{renderSELText(rubric.closing,sample)}</p></details>
      {results.length > 0 && <div className="bg-emerald-50 p-3">{results.map(r => <p key={r.classId}>{classes.find(c => c.id === r.classId)?.name || r.classId}: {r.status === 'APPLIED' ? 'Berhasil diterapkan' : 'Sudah digantikan rubrik lain; retry tidak mengaktifkan versi lama'}</p>)}</div>}
      <div className="flex gap-2"><button className={buttonStyle} disabled={busy || immutable || loading} onClick={() => persist(false)}>{busy ? 'Memproses…' : 'Simpan Draf'}</button><button className={buttonStyle} disabled={busy || loading} onClick={() => persist(true)}>Terapkan ke Kelas Terpilih / Periksa ulang hasil</button></div>
      <p className="text-xs">Draf boleh belum lengkap. Penerapan bersifat atomik: semua kelas berhasil atau tidak ada perubahan. Jika respons terputus, ulangi aksi pada ID rubrik yang sama. Menyalin hanya membawa definisi rubrik; kelas tujuan kembali kosong untuk salinan periode.</p>
    </div>
  </div>;
}
