import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Calendar,
  Plus,
  BookOpen,
  MessageSquare,
  Clipboard,
  User,
  Clock,
  Trash,
  FileSpreadsheet,
  ExternalLink,
  AlertTriangle,
  Lock,
  Info
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { elementaryMTSSService } from '../../../services/elementaryMTSSService';
import { ElementaryCoachingSession, MTSSBatchSheet } from '../../../types/elementaryMTSS';
import { toast } from 'sonner';

interface Props {
  caseId: string;
  studentName: string;
  subject: string;
  tier: string;
  isOpen: boolean;
  onClose: () => void;
  onSessionLogged?: () => void;
  onOpenBatchSheet?: (sheetId: string) => void;
  relatedSheets?: MTSSBatchSheet[];
}

export default function CoachingLogDrawer({
  caseId,
  studentName,
  subject,
  tier,
  isOpen,
  onClose,
  onSessionLogged,
  onOpenBatchSheet,
  relatedSheets = []
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
      toast.error('Gagal memuat riwayat sesi coaching');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notes.trim()) {
      toast.error('Catatan intervensi manual tidak boleh kosong.');
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

      toast.success('Berhasil menambahkan catatan manual!');
      setNotes('');
      setShowForm(false);
      fetchSessions();
      if (onSessionLogged) {
        onSessionLogged();
      }
    } catch (err) {
      console.error('Error saving coaching session:', err);
      toast.error('Gagal menyimpan catatan manual.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus catatan manual ini?')) return;

    try {
      await elementaryMTSSService.deleteCoachingSession(caseId, sessionId);
      toast.success('Catatan manual berhasil dihapus');
      fetchSessions();
      if (onSessionLogged) {
        onSessionLogged();
      }
    } catch (err) {
      console.error('Error deleting session:', err);
      toast.error('Gagal menghapus catatan manual');
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
                <h3 className="text-lg font-extrabold tracking-tight">Riwayat & Catatan Individu</h3>
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
                  className="w-full py-3 px-4 border-2 border-dashed border-emerald-300 hover:border-emerald-500 bg-emerald-50/50 hover:bg-emerald-50 text-emerald-800 rounded-2xl font-bold flex items-center justify-center gap-2 cursor-pointer transition-all shadow-2xs"
                >
                  <Plus size={16} />
                  Tambah Catatan Manual Baru
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
                      Log Catatan Manual Baru
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowForm(false)}
                      className="text-slate-400 hover:text-slate-600 text-xs font-bold"
                    >
                      Batal
                    </button>
                  </div>

                  <p className="text-[11px] text-emerald-700 bg-emerald-100/60 p-2.5 rounded-xl">
                    Catatan manual digunakan untuk mencatat intervensi individual di luar jadwal spreadsheet batch.
                  </p>

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
                    {saving ? 'Menyimpan...' : 'Simpan Catatan Manual'}
                  </button>
                </motion.form>
              )}

              {/* Related Spreadsheets Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <FileSpreadsheet size={14} className="text-blue-600" />
                    Spreadsheet Terkait ({relatedSheets.length})
                  </h4>
                  <span className="text-[10px] text-slate-400 font-semibold">
                    {subject}
                  </span>
                </div>

                {relatedSheets.length > 0 ? (
                  <div className="space-y-2.5">
                    {relatedSheets.map((sheet) => (
                      <div
                        key={sheet.id}
                        className="bg-blue-50/40 rounded-2xl p-3.5 border border-blue-100 flex items-center justify-between gap-3 hover:border-blue-200 transition-colors"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-extrabold text-slate-800 truncate">
                              {sheet.className || sheet.classId || 'SD'}
                            </span>
                            <span className="text-[10px] font-bold text-blue-700 bg-blue-100/70 border border-blue-200 px-2 py-0.5 rounded-md">
                              {sheet.semester}
                            </span>
                            <span className="text-[10px] font-semibold text-slate-500">
                              {sheet.academicYear}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-2">
                            <span>Pengajar: <b className="text-slate-700">{sheet.teacherName || '-'}</b></span>
                            <span>•</span>
                            <span>{sheet.orderedBlocks?.length || 0} Kolom Sesi</span>
                          </div>
                        </div>

                        {onOpenBatchSheet && (
                          <button
                            type="button"
                            onClick={() => onOpenBatchSheet(sheet.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-2xs shrink-0"
                            title="Buka Spreadsheet ini"
                          >
                            <ExternalLink size={12} />
                            Buka
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-slate-50 rounded-2xl p-4 border border-dashed border-slate-200 text-center">
                    <p className="text-xs text-slate-500 italic">
                      Belum ada spreadsheet batch yang mencakup siswa ini untuk bidang studi {subject}.
                    </p>
                  </div>
                )}
              </div>

              {/* History Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <MessageSquare size={14} className="text-slate-500" />
                    Riwayat Intervensi ({sessions.length})
                  </h4>
                  <span className="text-[10px] text-slate-400 font-semibold">
                    Gabungan Spreadsheet & Manual
                  </span>
                </div>

                {loading ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2">
                    <Clock size={24} className="text-slate-400 animate-spin" />
                    <span className="text-xs text-slate-500 italic">Memuat riwayat...</span>
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="bg-slate-50 rounded-2xl p-8 border border-dashed border-slate-250 text-center">
                    <BookOpen size={24} className="text-slate-300 mx-auto mb-2" />
                    <p className="text-xs text-slate-500 italic">Belum ada catatan intervensi atau riwayat untuk kasus ini.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sessions.map((session) => {
                      const isSpreadsheet = Boolean(session.batchSheetId);
                      const isArchived = Boolean(session.isArchived || session.sourceStatus === 'inactive');

                      return (
                        <div
                          key={session.id}
                          className={`rounded-2xl p-4 border shadow-2xs flex gap-3 items-start relative transition-all ${
                            isSpreadsheet
                              ? 'bg-blue-50/20 border-blue-100 hover:border-blue-200'
                              : 'bg-white border-slate-200 hover:border-emerald-200'
                          }`}
                        >
                          <div className={`p-2 rounded-xl shrink-0 ${
                            isSpreadsheet ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {isSpreadsheet ? (
                              <FileSpreadsheet size={16} />
                            ) : (
                              <MessageSquare size={16} />
                            )}
                          </div>

                          <div className="flex-1 space-y-2">
                            {/* Top row: Date, Badges, Author & Actions */}
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1">
                                  <Calendar size={12} className="text-slate-400" />
                                  {new Date(session.date).toLocaleDateString('id-ID', {
                                    weekday: 'short',
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric'
                                  })}
                                </span>

                                {/* Source Badge */}
                                {isSpreadsheet ? (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-md">
                                    <FileSpreadsheet size={10} />
                                    Dari Spreadsheet
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-md">
                                    <User size={10} />
                                    Catatan Manual
                                  </span>
                                )}

                                {/* Archived / Inactive Source Notice */}
                                {isArchived && (
                                  <span
                                    className="inline-flex items-center gap-1 text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded"
                                    title={session.archivedReason || 'Blok dikosongkan atau dihapus dari spreadsheet sumber'}
                                  >
                                    <AlertTriangle size={10} />
                                    Sumber Nonaktif
                                  </span>
                                )}

                                {/* Legacy Duplicate Conflict Warning */}
                                {session.hasConflict && (
                                  <span
                                    className="inline-flex items-center gap-1 text-[9px] font-bold bg-orange-100 text-orange-800 border border-orange-300 px-1.5 py-0.5 rounded"
                                    title="Terdeteksi lebih dari satu sesi untuk blok spreadsheet ini dari data lama. Tidak dihapus otomatis."
                                  >
                                    <AlertTriangle size={10} />
                                    Konflik Duplikat
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="text-[9px] font-semibold text-slate-400 flex items-center gap-1 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">
                                  {session.loggedBy}
                                </span>

                                {/* Delete button ONLY for manual notes */}
                                {!isSpreadsheet && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteSession(session.id)}
                                    className="text-slate-350 hover:text-rose-600 transition-colors cursor-pointer p-1"
                                    title="Hapus catatan manual"
                                  >
                                    <Trash size={12} />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Content */}
                            <p className="text-xs text-slate-700 leading-relaxed font-medium bg-slate-50/70 p-2.5 rounded-xl border border-slate-150 whitespace-pre-line">
                              {session.notes}
                            </p>

                            {/* Spreadsheet Read-only Footer with "Buka Spreadsheet Sumber" */}
                            {isSpreadsheet && (
                              <div className="flex items-center justify-between gap-2 pt-1 border-t border-blue-50 text-[11px]">
                                <span className="text-slate-400 flex items-center gap-1">
                                  <Lock size={10} className="text-slate-400" />
                                  Baca-saja (dikelola via spreadsheet)
                                </span>

                                {onOpenBatchSheet && session.batchSheetId && (
                                  <button
                                    type="button"
                                    onClick={() => onOpenBatchSheet(session.batchSheetId!)}
                                    className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-900 font-bold bg-blue-100/70 hover:bg-blue-100 px-2.5 py-1 rounded-lg border border-blue-200 transition-colors cursor-pointer shadow-2xs"
                                  >
                                    <ExternalLink size={11} />
                                    Buka Spreadsheet Sumber
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
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

