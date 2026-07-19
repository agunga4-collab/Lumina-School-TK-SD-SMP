import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calendar, Clock, Plus, Edit2, Archive, Check, X,
  AlertCircle, ChevronRight, Settings, Info, CalendarClock,
  ArrowRight, ShieldAlert, Sparkles, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../context/AuthContext';
import { useAcademicYear } from '../../../context/AcademicYearContext';
import { ACADEMIC_YEARS } from '../../../constants';
import { threeWayConferenceService } from '../../../services/threeWayConferenceService';
import { ConferencePeriod } from '../../../types';

// Format timestamp to readable string
function formatTimestamp(ts: number | null): string {
  if (!ts) return 'Not Set';
  return new Date(ts).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Convert timestamp to datetime-local input string
function tsToDatetimeInput(ts: number | null): string {
  if (!ts) return '';
  const date = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const MM = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `${yyyy}-${MM}-${dd}T${hh}:${mm}`;
}

// Convert datetime-local value to timestamp
function datetimeInputToTs(val: string): number | null {
  if (!val) return null;
  return new Date(val).getTime();
}

export default function ConferencePeriodManagement() {
  const { profile } = useAuth();
  const { activeYear, activeSemester } = useAcademicYear();

  // State
  const [periods, setPeriods] = React.useState<ConferencePeriod[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Form Modal State
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editingPeriod, setEditingPeriod] = React.useState<ConferencePeriod | null>(null);

  // Form Fields
  const [academicYear, setAcademicYear] = React.useState('2025/2026');
  const [semester, setSemester] = React.useState<1 | 2>(2);
  const [label, setLabel] = React.useState('');
  const [status, setStatus] = React.useState<'DRAFT' | 'OPEN' | 'CLOSED' | 'ARCHIVED'>('DRAFT');
  const [gsOpen, setGsOpen] = React.useState('');
  const [gsClose, setGsClose] = React.useState('');
  const [trOpen, setTrOpen] = React.useState('');
  const [trClose, setTrClose] = React.useState('');

  // Fetch all periods
  const fetchPeriods = async () => {
    try {
      setLoading(true);
      const data = await threeWayConferenceService.getConferencePeriods();
      // Sort: non-archived first, then by academicYear and semester desc
      const sorted = [...data].sort((a, b) => {
        if (a.status === 'ARCHIVED' && b.status !== 'ARCHIVED') return 1;
        if (a.status !== 'ARCHIVED' && b.status === 'ARCHIVED') return -1;
        return b.createdAt - a.createdAt;
      });
      setPeriods(sorted);
    } catch (err: any) {
      console.error('Error fetching periods:', err);
      toast.error('Gagal memuat periode konferensi');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchPeriods();
  }, []);

  // Set default form values
  const resetForm = (period: ConferencePeriod | null = null) => {
    if (period) {
      setEditingPeriod(period);
      setAcademicYear(period.academicYear);
      setSemester(period.semester);
      setLabel(period.label);
      setStatus(period.status);
      setGsOpen(tsToDatetimeInput(period.goalSettingOpenDate));
      setGsClose(tsToDatetimeInput(period.goalSettingCloseDate));
      setTrOpen(tsToDatetimeInput(period.trackerOpenDate));
      setTrClose(tsToDatetimeInput(period.trackerCloseDate));
    } else {
      setEditingPeriod(null);
      setAcademicYear(activeYear || '2025/2026');
      setSemester((activeSemester as 1 | 2) || 2);
      setLabel('');
      setStatus('DRAFT');
      setGsOpen('');
      setGsClose('');
      setTrOpen('');
      setTrClose('');
    }
  };

  // Open modal
  const openCreateModal = () => {
    resetForm(null);
    setIsModalOpen(true);
  };

  const openEditModal = (period: ConferencePeriod) => {
    resetForm(period);
    setIsModalOpen(true);
  };

  // Save / Update
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) {
      toast.error('Label/Nama Periode wajib diisi');
      return;
    }

    const gsOpenTs = datetimeInputToTs(gsOpen);
    const gsCloseTs = datetimeInputToTs(gsClose);
    const trOpenTs = datetimeInputToTs(trOpen);
    const trCloseTs = datetimeInputToTs(trClose);

    // Basic Date Logic Check
    if (gsOpenTs && gsCloseTs && gsOpenTs > gsCloseTs) {
      toast.error('Goal Setting: Tanggal buka tidak boleh setelah tanggal tutup');
      return;
    }
    if (trOpenTs && trCloseTs && trOpenTs > trCloseTs) {
      toast.error('Tracker: Tanggal buka tidak boleh setelah tanggal tutup');
      return;
    }

    try {
      setIsSubmitting(true);
      const email = profile?.email || 'unknown_admin';

      if (editingPeriod) {
        // Edit Period
        await threeWayConferenceService.updateConferencePeriod(editingPeriod.id, {
          academicYear,
          semester,
          label,
          status,
          goalSettingOpenDate: gsOpenTs,
          goalSettingCloseDate: gsCloseTs,
          trackerOpenDate: trOpenTs,
          trackerCloseDate: trCloseTs,
          updatedBy: email
        });
        toast.success('Periode berhasil diperbarui');
      } else {
        // Create Period
        await threeWayConferenceService.createConferencePeriod({
          academicYear,
          semester,
          label,
          status,
          goalSettingOpenDate: gsOpenTs,
          goalSettingCloseDate: gsCloseTs,
          trackerOpenDate: trOpenTs,
          trackerCloseDate: trCloseTs,
          createdBy: email,
          updatedBy: email
        });
        toast.success('Periode baru berhasil dibuat');
      }
      setIsModalOpen(false);
      fetchPeriods();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Gagal menyimpan periode');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick Action Update Status
  const handleUpdateStatus = async (period: ConferencePeriod, newStatus: 'OPEN' | 'CLOSED' | 'ARCHIVED') => {
    if (newStatus === 'ARCHIVED') {
      const confirm = window.confirm(`Apakah Anda yakin ingin mengarsipkan periode "${period.label}"? Tindakan ini tidak dapat dibatalkan.`);
      if (!confirm) return;
    }

    try {
      setLoading(true);
      await threeWayConferenceService.updateConferencePeriodStatus(period.id, newStatus);
      toast.success(`Status periode diperbarui menjadi ${newStatus}`);
      fetchPeriods();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Gagal mengubah status periode');
    } finally {
      setLoading(false);
    }
  };

  if (profile?.role !== 'SUPER_ADMIN') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl border border-red-100 p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-red-50 rounded-2xl mx-auto flex items-center justify-center text-red-500">
            <ShieldAlert size={32} />
          </div>
          <h2 className="text-xl font-black text-gray-900 tracking-tight">Akses Ditolak</h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            Hanya Super Admin yang diizinkan untuk mengelola pengaturan periode Three-Way Conference.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -mr-20 -mt-20" />
        <div className="space-y-2 relative">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-blue-600">
            <Settings size={14} /> JUNIOR HIGH OPERATIONAL
          </div>
          <h1 className="text-3xl font-black tracking-tight uppercase italic text-gray-900">
            Three-Way Conference Period
          </h1>
          <p className="text-sm font-medium text-gray-400 max-w-xl">
            Konfigurasi tahun ajaran, semester, tanggal buka/tutup Goal Setting, dan SMART Goal Tracker untuk siswa SMP.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center justify-center gap-2 px-6 py-4 bg-gray-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg hover:bg-blue-600 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 self-start md:self-center"
        >
          <Plus size={16} /> Buat Periode Baru
        </button>
      </div>

      {/* Info Warning */}
      <div className="bg-amber-50/50 border border-amber-200/60 p-6 rounded-3xl flex items-start gap-4">
        <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h4 className="text-sm font-black text-amber-900 uppercase tracking-tight">Aturan Unik Periode Aktif</h4>
          <p className="text-xs text-amber-700 font-bold leading-relaxed">
            Hanya diperbolehkan maksimal **satu** periode aktif (status DRAFT, OPEN, atau CLOSED) untuk kombinasi Tahun Ajaran dan Semester yang sama. Untuk membuat periode baru pada semester yang sama, arsipkan periode lama terlebih dahulu.
          </p>
        </div>
      </div>

      {/* Period List Card */}
      <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-black uppercase italic tracking-tight text-gray-900 flex items-center gap-2">
            <CalendarClock size={20} className="text-blue-500" /> Daftar Periode Konferensi
          </h2>
          <button
            onClick={fetchPeriods}
            className="p-2 hover:bg-gray-50 rounded-xl transition-colors text-gray-400 hover:text-gray-600"
            title="Refresh Data"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {loading ? (
          <div className="p-20 text-center">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">Memuat Periode...</p>
          </div>
        ) : periods.length === 0 ? (
          <div className="p-20 text-center space-y-4">
            <Calendar size={48} className="mx-auto text-gray-300" />
            <div className="space-y-1">
              <h3 className="text-base font-black text-gray-700 uppercase">Belum Ada Periode</h3>
              <p className="text-sm text-gray-400 font-bold">Silakan buat periode konferensi pertama untuk memulai.</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100">
                  <th className="p-6 text-[10px] font-black uppercase tracking-widest text-gray-400">Label / Nama Periode</th>
                  <th className="p-6 text-[10px] font-black uppercase tracking-widest text-gray-400">Tahun Ajaran & Semester</th>
                  <th className="p-6 text-[10px] font-black uppercase tracking-widest text-gray-400">Waktu Goal Setting (Siswa)</th>
                  <th className="p-6 text-[10px] font-black uppercase tracking-widest text-gray-400">Waktu SMART Goal Tracker</th>
                  <th className="p-6 text-[10px] font-black uppercase tracking-widest text-gray-400">Status</th>
                  <th className="p-6 text-[10px] font-black uppercase tracking-widest text-gray-400 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {periods.map((period) => {
                  const isArchived = period.status === 'ARCHIVED';
                  const isOpen = period.status === 'OPEN';
                  const isClosed = period.status === 'CLOSED';
                  const isDraft = period.status === 'DRAFT';

                  return (
                    <tr key={period.id} className="hover:bg-gray-50/30 transition-colors">
                      <td className="p-6">
                        <div className="space-y-1">
                          <span className="font-bold text-gray-900 text-sm block">{period.label}</span>
                          <span className="text-[10px] text-gray-400 font-bold">ID: {period.id}</span>
                        </div>
                      </td>
                      <td className="p-6">
                        <div className="space-y-1">
                          <span className="text-xs font-black text-gray-600 block">{period.academicYear}</span>
                          <span className="text-[10px] font-black uppercase tracking-wider text-purple-600 bg-purple-50 px-2 py-0.5 rounded-md">
                            Semester {period.semester}
                          </span>
                        </div>
                      </td>
                      <td className="p-6">
                        <div className="space-y-1.5 text-xs">
                          <div className="flex items-center gap-1.5 text-gray-500 font-medium">
                            <span className="text-[10px] font-bold text-blue-600 uppercase w-10">Buka:</span>
                            <span>{formatTimestamp(period.goalSettingOpenDate)}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-gray-500 font-medium">
                            <span className="text-[10px] font-bold text-red-500 uppercase w-10">Tutup:</span>
                            <span>{formatTimestamp(period.goalSettingCloseDate)}</span>
                          </div>
                        </div>
                      </td>
                      <td className="p-6">
                        <div className="space-y-1.5 text-xs">
                          <div className="flex items-center gap-1.5 text-gray-500 font-medium">
                            <span className="text-[10px] font-bold text-blue-600 uppercase w-10">Buka:</span>
                            <span>{formatTimestamp(period.trackerOpenDate)}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-gray-500 font-medium">
                            <span className="text-[10px] font-bold text-red-500 uppercase w-10">Tutup:</span>
                            <span>{formatTimestamp(period.trackerCloseDate)}</span>
                          </div>
                        </div>
                      </td>
                      <td className="p-6">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase ${
                          isOpen ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                          isClosed ? 'bg-red-50 text-red-600 border border-red-100' :
                          isArchived ? 'bg-gray-100 text-gray-400' :
                          'bg-amber-50 text-amber-600 border border-amber-100'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            isOpen ? 'bg-emerald-500 animate-pulse' :
                            isClosed ? 'bg-red-500' :
                            isArchived ? 'bg-gray-400' :
                            'bg-amber-500'
                          }`} />
                          {period.status}
                        </span>
                      </td>
                      <td className="p-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* Edit (not for archived) */}
                          {!isArchived && (
                            <button
                              onClick={() => openEditModal(period)}
                              className="p-2 bg-gray-50 hover:bg-blue-50 text-gray-600 hover:text-blue-600 rounded-xl transition-all"
                              title="Edit Detail"
                            >
                              <Edit2 size={14} />
                            </button>
                          )}

                          {/* Quick Open (if draft or closed) */}
                          {(isDraft || isClosed) && (
                            <button
                              onClick={() => handleUpdateStatus(period, 'OPEN')}
                              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-600 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all"
                              title="Buka Periode"
                            >
                              Buka
                            </button>
                          )}

                          {/* Quick Close (if open) */}
                          {isOpen && (
                            <button
                              onClick={() => handleUpdateStatus(period, 'CLOSED')}
                              className="px-3 py-1.5 bg-red-50 hover:bg-red-600 hover:text-white text-red-600 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all"
                              title="Tutup Periode"
                            >
                              Tutup
                            </button>
                          )}

                          {/* Archive (if draft, open or closed) */}
                          {!isArchived && (
                            <button
                              onClick={() => handleUpdateStatus(period, 'ARCHIVED')}
                              className="p-2 bg-gray-50 hover:bg-amber-50 text-gray-400 hover:text-amber-600 rounded-xl transition-all"
                              title="Arsip Periode"
                            >
                              <Archive size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isSubmitting && setIsModalOpen(false)}
              className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-gray-100 z-10"
            >
              <div className="p-8 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-gray-900 uppercase italic tracking-tight">
                    {editingPeriod ? 'Edit Periode Konferensi' : 'Buat Periode Baru'}
                  </h3>
                  <p className="text-xs font-bold text-gray-400 mt-0.5">
                    {editingPeriod ? 'Ubah setelan tanggal dan status periode' : 'Tambahkan periode konferensi baru'}
                  </p>
                </div>
                <button
                  disabled={isSubmitting}
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-2xl transition-all text-gray-400 hover:text-gray-900"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-8 space-y-6">
                {/* Academic Year and Semester */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Tahun Ajaran</label>
                    <select
                      value={academicYear}
                      onChange={(e) => setAcademicYear(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-100 rounded-2xl text-sm font-bold bg-gray-50 focus:outline-none focus:border-blue-500 transition-colors"
                    >
                      {ACADEMIC_YEARS.map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Semester</label>
                    <select
                      value={semester}
                      onChange={(e) => setSemester(Number(e.target.value) as 1 | 2)}
                      className="w-full px-4 py-3 border border-gray-100 rounded-2xl text-sm font-bold bg-gray-50 focus:outline-none focus:border-blue-500 transition-colors"
                    >
                      <option value={1}>Semester 1 (Ganjil)</option>
                      <option value={2}>Semester 2 (Genap)</option>
                    </select>
                  </div>
                </div>

                {/* Period Label */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Nama / Label Periode</label>
                  <input
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Contoh: Mid-Semester 2 Conference 2025/2026"
                    className="w-full px-4 py-3 border border-gray-100 rounded-2xl text-sm font-bold bg-gray-50 focus:outline-none focus:border-blue-500 transition-all placeholder:text-gray-300"
                    required
                  />
                </div>

                {/* Status Selection */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Status Awal</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full px-4 py-3 border border-gray-100 rounded-2xl text-sm font-bold bg-gray-50 focus:outline-none focus:border-blue-500 transition-colors"
                  >
                    <option value="DRAFT">DRAFT (Dalam Persiapan)</option>
                    <option value="OPEN">OPEN (Waktu Pengisian Berjalan)</option>
                    <option value="CLOSED">CLOSED (Ditutup)</option>
                  </select>
                </div>

                {/* Date Ranges */}
                <div className="border-t border-gray-50 pt-6 space-y-6">
                  {/* Goal Setting Section */}
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-600 flex items-center gap-1.5">
                      <Sparkles size={14} /> 1. Rentang Pengisian Goal Setting (Siswa)
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-400 block">Waktu Buka</label>
                        <input
                          type="datetime-local"
                          value={gsOpen}
                          onChange={(e) => setGsOpen(e.target.value)}
                          className="w-full px-4 py-3 border border-gray-100 rounded-2xl text-sm font-bold bg-gray-50 focus:outline-none focus:border-blue-500 transition-all"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-400 block">Waktu Tutup</label>
                        <input
                          type="datetime-local"
                          value={gsClose}
                          onChange={(e) => setGsClose(e.target.value)}
                          className="w-full px-4 py-3 border border-gray-100 rounded-2xl text-sm font-bold bg-gray-50 focus:outline-none focus:border-blue-500 transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  {/* SMART Goal Tracker Section */}
                  <div className="space-y-4 border-t border-gray-50 pt-6">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-purple-600 flex items-center gap-1.5">
                      <Clock size={14} /> 2. Rentang SMART Goal Tracker (Log & Refleksi)
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-400 block">Waktu Buka</label>
                        <input
                          type="datetime-local"
                          value={trOpen}
                          onChange={(e) => setTrOpen(e.target.value)}
                          className="w-full px-4 py-3 border border-gray-100 rounded-2xl text-sm font-bold bg-gray-50 focus:outline-none focus:border-blue-500 transition-all"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-400 block">Waktu Tutup</label>
                        <input
                          type="datetime-local"
                          value={trClose}
                          onChange={(e) => setTrClose(e.target.value)}
                          className="w-full px-4 py-3 border border-gray-100 rounded-2xl text-sm font-bold bg-gray-50 focus:outline-none focus:border-blue-500 transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Submit Buttons */}
                <div className="flex items-center justify-end gap-3 pt-6 border-t border-gray-100">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-3.5 bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-gray-900 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex items-center gap-2 px-8 py-3.5 bg-gray-900 text-white hover:bg-blue-600 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-md transition-all"
                  >
                    {isSubmitting ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <Check size={14} />
                    )}
                    {editingPeriod ? 'Simpan Perubahan' : 'Buat Periode'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
