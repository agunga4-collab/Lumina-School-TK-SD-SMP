import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { toast } from 'sonner';
import { db } from '../../../../lib/firebase';
import type { LearningGoal } from '../../../../types';

interface Props {
  goals: LearningGoal[];
  selectedId: string;
  onSelect: (id: string) => void;
  scopeKey: string;
  userId: string;
  readOnly?: boolean;
  isUAMode?: boolean;
}
export function LearningGoalVisibilityPanel({ goals, selectedId, onSelect, scopeKey, userId, readOnly = false, isUAMode = false }: Props) {
  const identity = `${userId}__${encodeURIComponent(scopeKey)}`;
  const [state, setState] = React.useState<{ key: string; hidden: string[]; ready: boolean }>({ key: '', hidden: [], ready: false });
  const [showHidden, setShowHidden] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const currentKey = React.useRef(identity);
  currentKey.current = identity;
  const saveLock = React.useRef(false);
  React.useEffect(() => {
    let active = true;
    setShowHidden(false);
    setState({ key: identity, hidden: [], ready: false });
    if (!userId) { setState({ key: identity, hidden: [], ready: true }); return; }
    getDoc(doc(db, 'jh_ab_lg_visibility', identity)).then(snap => {
      if (!active) return;
      const hidden = snap.exists() && Array.isArray(snap.data().hiddenLGIds) ? snap.data().hiddenLGIds.filter((id: unknown) => typeof id === 'string') : [];
      setState({ key: identity, hidden, ready: true });
    }).catch(error => {
      if (!active) return;
      setState({ key: identity, hidden: [], ready: true });
      toast.error(`Tidak dapat memuat pilihan hide LG: ${error instanceof Error ? error.message : String(error)}`);
    });
    return () => { active = false; };
  }, [identity, userId]);
  const hidden = state.key === identity ? state.hidden : [];
  const ready = state.key === identity && state.ready;
  const visible = goals.filter(goal => !hidden.includes(goal.id));
  React.useEffect(() => {
    if (!ready || saving) return;
    if (!selectedId && visible.length) onSelect(visible[0].id);
    else if (selectedId && hidden.includes(selectedId)) onSelect(visible[0]?.id || '');
  }, [ready, saving, selectedId, hidden.join('|'), visible.map(goal => goal.id).join('|')]);
  const toggle = async (goal: LearningGoal) => {
    if (readOnly || !ready || saveLock.current || !userId) return;
    const key = identity;
    const next = hidden.includes(goal.id) ? hidden.filter(id => id !== goal.id) : [...hidden, goal.id];
    saveLock.current = true; setSaving(true);
    try {
      await setDoc(doc(db, 'jh_ab_lg_visibility', key), { userId, scopeKey, hiddenLGIds: next, updatedAt: serverTimestamp() });
      if (currentKey.current === key) {
        setState({ key, hidden: next, ready: true });
        if (next.includes(selectedId)) onSelect(goals.find(item => !next.includes(item.id))?.id || '');
      }
    } catch (error) {
      toast.error(`Pilihan hide belum tersimpan: ${error instanceof Error ? error.message : String(error)}`);
    } finally { saveLock.current = false; setSaving(false); }
  };
  if (!goals.length) return <p className="text-xs text-slate-500">Belum ada LG yang sesuai konteks ini.</p>;
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
      <span className="text-slate-500">{visible.length} LG ditampilkan · {goals.length - visible.length} disembunyikan{!ready ? ' · Memuat pilihan…' : ''}</span>
      <button type="button" onClick={() => setShowHidden(value => !value)} className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-purple-700">
        <Eye size={14} />{showHidden ? 'Tutup LG tersembunyi' : 'Lihat LG tersembunyi'}
      </button>
    </div>
    <p className="text-[11px] text-slate-500">Hide hanya mengatur tampilan akun Anda pada konteks ini, tidak menghapus LG, LO, atau nilai.</p>
    <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
      {goals.filter(goal => showHidden || !hidden.includes(goal.id)).map(goal => {
        const concealed = hidden.includes(goal.id);
        const selected = goal.id === selectedId;
        return <div key={goal.id} className={`flex items-start gap-2 rounded-xl border p-3 ${selected ? 'border-purple-400 bg-purple-50' : concealed ? 'border-dashed border-slate-300 bg-slate-50' : 'border-slate-200 bg-white'}`}>
          <button type="button" disabled={concealed || saving} onClick={() => onSelect(goal.id)} className="min-w-0 flex-1 text-left disabled:opacity-50" aria-pressed={selected}>
            <span className="block text-xs font-bold text-purple-800">{goal.code || 'LG'}{selected ? ' · Dipilih' : ''}{concealed ? ' · Disembunyikan' : ''}</span>
            {isUAMode && <span className="text-[10px] text-slate-500">Asal master: {goal.grade || 'tanpa grade'}</span>}
            <span className="mt-1 block whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-800">{goal.goalText || '(Deskripsi LG kosong)'}</span>
          </button>
          {!readOnly && <button type="button" disabled={!ready || saving || !userId} onClick={() => void toggle(goal)} className="flex shrink-0 items-center gap-1 rounded-lg border bg-white px-2 py-1.5 text-[11px] text-slate-600 disabled:opacity-40" aria-label={`${concealed ? 'Tampilkan' : 'Sembunyikan'} ${goal.code || 'LG'}`}>
            {concealed ? <Eye size={13} /> : <EyeOff size={13} />}{concealed ? 'Tampilkan' : 'Hide'}
          </button>}
        </div>;
      })}
    </div>
    {!visible.length && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">Semua LG disembunyikan. Klik “Lihat LG tersembunyi” lalu “Tampilkan”.</p>}
  </div>;
}
