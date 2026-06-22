import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Calendar, Plus, BookOpen, MessageSquare, Clipboard, User, Clock, Trash } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { elementaryMTSSService } from '../../../services/elementaryMTSSService';
import { ElementaryCoachingSession } from '../../../types/elementaryMTSS';
import { toast } from 'sonner';

interface Props {
  caseId: string;
  studentName: string;
  subject: string;
  tier: string;
  isOpen: boolean;
  onClose: () => void;
  onSessionLogged?: () => void;
}

export default function CoachingLogDrawer({
  caseId,
  studentName,
  subject,
  tier,
  isOpen,
  onClose,
  onSessionLogged
}: Props) {
  const { profile } = useAuth();
  const [sessions, setSessions] = useState<ElementaryCoachingSession[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [showForm, setShowForm] = useState<boolean>(false);

  // Form State
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen && caseId) {
      fetchSessions();
    }
  }, [isOpen, caseId]);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const res = await elementaryMTSSService.fetchCoachingSessions(caseId);
      setSessions(res);
    } catch (err) {
      console.error('Error fetching coaching sessions:', err);
      toast.error('Gagal memuat riwayat coaching sessions');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notes.trim()) {
      toast.error('Catatan/progress sesi tidak boleh kosong.');
      return;
    }

    try {
      setSaving(true);
      const author = profile?.displayName || profile?.email || 'Teacher';

      await elementaryMTSSService.addCoachingSession(caseId, {
        date,
        notes,
        loggedBy: author
      });

      toast.success('Berhasil menambahkan catatan coaching!');
      setNotes('');
      setShowForm(false);
      fetchSessions();
      if (onSessionLogged) {
        onSessionLogged();
      }
    } catch (err) {
      console.error('Error saving coaching session:', err);
      toast.error('Gagal menyimpan coaching session.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus catatan coaching ini?')) return;

    try {
      await elementaryMTSSService.deleteCoachingSession(caseId, sessionId);
      toast.success('Catatan coaching berhasil dihapus');
      fetchSessions();
      if (onSessionLogged) {
        onSessionLogged();
      }
    } catch (err) {
      console.error('Error deleting session:', err);
      toast.error('Gagal menghapus catatan coaching');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black z-50 transition-opacity"
          />

          {/* Drawer Body */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="p-6 border-b border-rose-100 flex items-center justify-between bg-emerald-950 text-white">
              <div className="space-y-1">
                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                  MTSS Academic Elementary
                </span>
                <h3 className="text-lg font-extrabold tracking-tight">Log & Riwayat Intervensi</h3>
                <div className="flex gap-2 flex-wrap items-center mt-1">
                  <span className="bg-emerald-900 text-emerald-200 border border-emerald-800 text-[10px] px-2.5 py-0.5 rounded-full font-bold">
                    {studentName}
                  </span>
                  <span className="bg-teal-900 text-teal-200 border border-teal-800 text-[10px] px-2.5 py-0.5 rounded-full font-bold">
                    {subject}
                  </span>
                  <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${
                    tier === 'Tier 2' 
                      ? 'bg-amber-950 text-amber-200 border-amber-800' 
                      : tier === 'Tier 3'
                      ? 'bg-red-950 text-red-200 border-red-800'
                      : 'bg-purple-950 text-purple-200 border-purple-800'
                  }`}>
                    {tier}
                  </span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-xl bg-emerald-900/60 hover:bg-emerald-900 text-slate-200 cursor-pointer transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content Container */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Add New Log Button or Form */}
              {!showForm ? (
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="w-full py-3 px-4 border-2 border-dashed border-emerald-300 hover:border-emerald-500 bg-emerald-50/50 hover:bg-emerald-50 text-emerald-800 rounded-2xl font-bold flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <Plus size={16} />
                  Tambah Sesi Coaching / Intervensi Baru
                </button>
              ) : (
                <motion.form
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  onSubmit={handleSaveSession}
                  className="bg-emerald-50/40 rounded-2xl p-5 border border-emerald-100 space-y-4"
                >
                  <div className="flex justify-between items-center pb-2 border-b border-emerald-100/50">
                    <span className="text-xs font-black text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Clipboard size={14} />
                      Log Sesi Intervensi Baru
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowForm(false)}
                      className="text-slate-400 hover:text-slate-600 text-xs font-bold"
                    >
                      Batal
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">
                        Tanggal Sesi
                      </label>
                      <div className="relative">
                        <Calendar size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="date"
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                          className="w-full bg-white border border-slate-250 rounded-xl py-2 pl-10 pr-4 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">
                        Catatan Intervensi & Perkembangan
                      </label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Contoh: Memberikan penambahan kosa kata (vocabulary) dsb. Siswa mulai mengerti 2 kata baru hari ini."
                        rows={4}
                        className="w-full bg-white border border-slate-250 rounded-xl p-3.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-350 text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-colors shadow-sm flex items-center justify-center gap-1.5"
                  >
                    {saving ? 'Menyimpan...' : 'Simpan Catatan Coaching'}
                  </button>
                </motion.form>
              )}

              {/* History Section */}
              <div className="space-y-4">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <MessageSquare size={14} className="text-slate-500" />
                  Riwayat Coaching & Intervensi ({sessions.length})
                </h4>

                {loading ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2">
                    <Clock size={24} className="text-slate-400 animate-spin" />
                    <span className="text-xs text-slate-500 italic">Memuat riwayat...</span>
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="bg-slate-50 rounded-2xl p-8 border border-dashed border-slate-250 text-center">
                    <BookOpen size={24} className="text-slate-300 mx-auto mb-2" />
                    <p className="text-xs text-slate-500 italic">Belum ada catatan intervensi atau coaching log untuk kasus ini.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sessions.map((session, index) => (
                      <div
                        key={session.id}
                        className="bg-white rounded-2xl p-4 border border-slate-150 shadow-sm flex gap-3 items-start relative group"
                      >
                        <div className="p-2 rounded-xl bg-slate-50 text-slate-500 shrink-0">
                          <Plus size={16} className="text-emerald-500" />
                        </div>
                        <div className="flex-1 space-y-1 bg-white">
                          <div className="flex items-center justify-between gap-1 flex-wrap">
                            <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1">
                              <Calendar size={12} className="text-slate-400" />
                              {new Date(session.date).toLocaleDateString('id-ID', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                              })}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1 bg-slate-50 px-2 py-0.5 rounded-md">
                                <User size={10} />
                                {session.loggedBy}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDeleteSession(session.id)}
                                className="text-slate-350 hover:text-rose-600 transition-colors cursor-pointer"
                                title="Hapus catatan"
                              >
                                <Trash size={12} />
                              </button>
                            </div>
                          </div>
                          <p className="text-xs text-slate-650 leading-relaxed font-semibold bg-slate-50/50 p-2.5 rounded-xl border border-slate-100">
                            {session.notes}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
