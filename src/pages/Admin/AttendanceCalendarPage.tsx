import * as React from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  query, 
  where, 
  writeBatch,
  limit,
  orderBy
} from 'firebase/firestore';
import { 
  Calendar as CalendarIcon, 
  Plus, 
  Edit2, 
  Trash2, 
  AlertTriangle, 
  Info, 
  Search, 
  Filter, 
  CheckCircle2, 
  XCircle,
  RefreshCw,
  Lock
} from 'lucide-react';
import { toast } from 'sonner';
import { AttendanceCalendarEvent } from '../../types';

export default function AttendanceCalendarPage() {
  const { profile, user } = useAuth();
  const [events, setEvents] = React.useState<AttendanceCalendarEvent[]>([]);
  const [loading, setLoading] = React.useState(true);
  
  // Filters state
  const [unitFilter, setUnitFilter] = React.useState<string>('ALL');
  const [typeFilter, setTypeFilter] = React.useState<string>('ALL');
  const [searchTerm, setSearchTerm] = React.useState<string>('');

  // Form/Modal state
  const [isOpen, setIsOpen] = React.useState(false);
  const [editingEvent, setEditingEvent] = React.useState<AttendanceCalendarEvent | null>(null);
  const [formDate, setFormDate] = React.useState('');
  const [formUnit, setFormUnit] = React.useState<'KINDERGARTEN' | 'ELEMENTARY' | 'JUNIOR_HIGH' | 'ALL_UNITS'>('ELEMENTARY');
  const [formType, setFormType] = React.useState<AttendanceCalendarEvent['type']>('NATIONAL_HOLIDAY');
  const [formDescription, setFormDescription] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const isSuperAdmin = profile?.role === 'SUPER_ADMIN';

  // Fetch events on mount
  const fetchEvents = React.useCallback(async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'attendance_calendar'),
        orderBy('date', 'desc')
      );
      const snap = await getDocs(q);
      const list: AttendanceCalendarEvent[] = [];
      snap.forEach(d => {
        list.push({ ...d.data(), id: d.id } as AttendanceCalendarEvent);
      });
      setEvents(list);
    } catch (err: any) {
      console.error('Error fetching calendar events:', err);
      toast.error('Gagal Memuat Kalender', {
        description: err.message || 'Terjadi kesalahan jaringan.'
      });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Helper for Indonesia days
  const getIndonesianDayName = (dateStr: string): string => {
    try {
      const date = new Date(dateStr);
      const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
      return days[date.getDay()];
    } catch {
      return '';
    }
  };

  // Helper to determine isSchoolDay based on type
  const isSchoolDayForType = (type: AttendanceCalendarEvent['type']): boolean => {
    return type === 'REPLACEMENT_SCHOOL_DAY' || type === 'HALF_DAY';
  };

  // Open modal for add
  const handleAddClick = () => {
    if (!isSuperAdmin) {
      toast.error('Akses Ditolak', { description: 'Hanya SUPER_ADMIN yang dapat membuat event.' });
      return;
    }
    setEditingEvent(null);
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormUnit('ELEMENTARY');
    setFormType('NATIONAL_HOLIDAY');
    setFormDescription('');
    setIsOpen(true);
  };

  // Open modal for edit
  const handleEditClick = (event: AttendanceCalendarEvent) => {
    if (!isSuperAdmin) {
      toast.error('Akses Ditolak', { description: 'Hanya SUPER_ADMIN yang dapat mengedit event.' });
      return;
    }
    setEditingEvent(event);
    setFormDate(event.date);
    setFormUnit(event.unit);
    setFormType(event.type);
    setFormDescription(event.description);
    setIsOpen(true);
  };

  // Delete event
  const handleDeleteClick = async (event: AttendanceCalendarEvent) => {
    if (!isSuperAdmin) {
      toast.error('Akses Ditolak', { description: 'Hanya SUPER_ADMIN yang dapat menghapus event.' });
      return;
    }

    if (!window.confirm(`Hapus kalender tanggal ${event.date} untuk unit ${event.unit}?`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'attendance_calendar', event.id));
      toast.success('Event Dihapus', { description: `Kalender override pada ${event.date} berhasil dihapus.` });
      fetchEvents();
    } catch (err: any) {
      console.error('Error deleting calendar event:', err);
      toast.error('Gagal Menghapus', { description: err.message });
    }
  };

  // Check past date attendance data
  const checkPastDateAttendanceExists = async (dateStr: string): Promise<boolean> => {
    try {
      const q = query(
        collection(db, 'attendance_records'),
        where('date', '==', dateStr),
        limit(1)
      );
      const snap = await getDocs(q);
      return !snap.empty;
    } catch (err) {
      console.warn('Failed to query past attendance records fast-check:', err);
      return false;
    }
  };

  const getAcademicYearForDate = (dateStr: string): string => {
    const parts = dateStr.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    if (month >= 7) {
      return `${year}/${year + 1}`;
    } else {
      return `${year - 1}/${year}`;
    }
  };

  // Handle Form Submit
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) {
      toast.error('Akses Ditolak', { description: 'Hanya SUPER_ADMIN yang dapat melakukan write.' });
      return;
    }

    if (!formDate || !formDescription.trim()) {
      toast.error('Validasi Gagal', { description: 'Harap isi semua input form.' });
      return;
    }

    const calculatedIsSchoolDay = isSchoolDayForType(formType);
    const todayStr = new Date().toISOString().split('T')[0];

    // Retroactive warning check for past non-school days
    if (!calculatedIsSchoolDay && formDate < todayStr) {
      const hasData = await checkPastDateAttendanceExists(formDate);
      if (hasData) {
        const confirmed = window.confirm(
          "Data presensi yang sudah ada tidak dihapus, tetapi tanggal ini tidak akan dihitung dalam rekap kehadiran setelah kalender disimpan. Lanjutkan simpan?"
        );
        if (!confirmed) return;
      }
    }

    setSaving(true);
    try {
      const academicYear = getAcademicYearForDate(formDate);
      const userIdentifier = user?.email || profile?.name || 'SUPER_ADMIN';

      if (formUnit === 'ALL_UNITS') {
        // Create 3 documents inside a batch
        const batch = writeBatch(db);
        const unitsList: ('KINDERGARTEN' | 'ELEMENTARY' | 'JUNIOR_HIGH')[] = [
          'KINDERGARTEN', 'ELEMENTARY', 'JUNIOR_HIGH'
        ];

        unitsList.forEach(unit => {
          const docId = `${formDate}_${unit}`;
          const docRef = doc(db, 'attendance_calendar', docId);
          batch.set(docRef, {
            id: docId,
            date: formDate,
            unit,
            type: formType,
            isSchoolDay: calculatedIsSchoolDay,
            description: formDescription,
            academicYear,
            createdAt: new Date().toISOString(),
            createdBy: userIdentifier,
            updatedAt: new Date().toISOString(),
            updatedBy: userIdentifier
          });
        });

        await batch.commit();
        toast.success('Batch Simpan Sukses', { description: `Kalender libur/event telah disimpan untuk semua unit pada ${formDate}.` });
      } else {
        // Single unit document
        const docId = `${formDate}_${formUnit}`;
        const docRef = doc(db, 'attendance_calendar', docId);
        await setDoc(docRef, {
          id: docId,
          date: formDate,
          unit: formUnit,
          type: formType,
          isSchoolDay: calculatedIsSchoolDay,
          description: formDescription,
          academicYear,
          createdAt: editingEvent?.createdAt || new Date().toISOString(),
          createdBy: editingEvent?.createdBy || userIdentifier,
          updatedAt: new Date().toISOString(),
          updatedBy: userIdentifier
        });
        toast.success('Kalender Disimpan', { description: `Konfigurasi kalender untuk ${formUnit} pada ${formDate} berhasil disimpan.` });
      }

      setIsOpen(false);
      fetchEvents();
    } catch (err: any) {
      console.error('Error saving calendar override:', err);
      toast.error('Gagal Menyimpan', { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  // Filter events based on criteria
  const filteredEvents = events.filter(e => {
    const matchUnit = unitFilter === 'ALL' || e.unit === unitFilter;
    const matchType = typeFilter === 'ALL' || e.type === typeFilter;
    const matchSearch = searchTerm === '' || 
      e.date.includes(searchTerm) || 
      e.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getAcademicYearForDate(e.date).includes(searchTerm);
    return matchUnit && matchType && matchSearch;
  });

  const getEventBadgeClass = (type: AttendanceCalendarEvent['type']) => {
    switch (type) {
      case 'NATIONAL_HOLIDAY':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'SCHOOL_HOLIDAY':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'SPECIAL_NO_ATTENDANCE_DAY':
        return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'REPLACEMENT_SCHOOL_DAY':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'HALF_DAY':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const getEventTypeName = (type: AttendanceCalendarEvent['type']) => {
    switch (type) {
      case 'NATIONAL_HOLIDAY':
        return 'Hari Libur Nasional';
      case 'SCHOOL_HOLIDAY':
        return 'Libur Sekolah';
      case 'SPECIAL_NO_ATTENDANCE_DAY':
        return 'Khusus Tidak Ada Presensi';
      case 'REPLACEMENT_SCHOOL_DAY':
        return 'Hari Pengganti Sekolah';
      case 'HALF_DAY':
        return 'Setengah Hari';
      default:
        return type;
    }
  };

  const getUnitName = (unit: string) => {
    switch (unit) {
      case 'KINDERGARTEN':
        return 'TK (Kindergarten)';
      case 'ELEMENTARY':
        return 'SD (Elementary)';
      case 'JUNIOR_HIGH':
        return 'SMP (Junior High)';
      default:
        return unit;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 animate-in fade-in duration-200">
      
      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <CalendarIcon size={24} />
            </span>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">Kalender Kehadiran & Hari Libur</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl leading-relaxed">
            Pusat konfigurasi hari sekolah aktif dan pengecualian libur per unit sekolah Lumina.
          </p>
        </div>
        
        {isSuperAdmin ? (
          <button
            onClick={handleAddClick}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#002366] text-white rounded-xl font-bold hover:opacity-90 transition-all text-sm shadow-sm"
          >
            <Plus size={18} />
            Tambah Tanggal
          </button>
        ) : (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 text-gray-500 rounded-xl text-xs font-semibold">
            <Lock size={14} />
            Akses Read-Only
          </div>
        )}
      </div>

      {/* Stats and Warnings summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100/50 rounded-2xl p-5 flex items-start gap-4">
          <div className="bg-white p-3 rounded-xl text-blue-600 shadow-sm border border-blue-100">
            <Info size={20} />
          </div>
          <div>
            <h4 className="font-bold text-blue-900 text-sm">Prinsip Kalender Kehadiran</h4>
            <p className="text-blue-800 text-xs leading-relaxed mt-1">
              Hari sekolah standar adalah Senin s.d. Jumat. Tanggal overrides di bawah berfungsi membatalkan default (seperti menandai libur nasional atau menambahkan hari pengganti).
            </p>
          </div>
        </div>

        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-100/50 rounded-2xl p-5 flex items-start gap-4">
          <div className="bg-white p-3 rounded-xl text-amber-600 shadow-sm border border-amber-100">
            <AlertTriangle size={20} />
          </div>
          <div>
            <h4 className="font-bold text-amber-900 text-sm">Pengaruh Terhadap Laporan</h4>
            <p className="text-amber-800 text-xs leading-relaxed mt-1">
              Hari yang ditandai sebagai non-sekolah (libur) tidak dihitung dalam akumulasi pembagi kehadiran harian, memastikan performa presensi tetap akurat.
            </p>
          </div>
        </div>

        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100/50 rounded-2xl p-5 flex items-start gap-4">
          <div className="bg-white p-3 rounded-xl text-emerald-600 shadow-sm border border-emerald-100">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <h4 className="font-bold text-emerald-900 text-sm">Keamanan Data Aman</h4>
            <p className="text-emerald-800 text-xs leading-relaxed mt-1">
              Data absensi yang sudah telanjur tersimpan tidak akan dihapus dari Firestore saat tanggalnya diliburkan, melainkan hanya dikecualikan dari perhitungan statistik.
            </p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 border border-gray-100 rounded-2xl shadow-sm flex flex-col sm:flex-row gap-3 items-center">
        <div className="relative flex-1 w-full">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input 
            type="text" 
            placeholder="Cari deskripsi, tanggal (YYYY-MM-DD), atau TA..."
            className="w-full bg-gray-50 border border-gray-200 focus:border-blue-300 rounded-xl py-2 pl-10 pr-4 text-sm outline-none transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-gray-500">
            <Filter size={14} />
            <span>Unit:</span>
            <select
              className="bg-transparent outline-none cursor-pointer text-gray-700 font-bold"
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value)}
            >
              <option value="ALL">Semua Unit</option>
              <option value="KINDERGARTEN">TK (Kindergarten)</option>
              <option value="ELEMENTARY">SD (Elementary)</option>
              <option value="JUNIOR_HIGH">SMP (Junior High)</option>
            </select>
          </div>

          <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-gray-500">
            <Filter size={14} />
            <span>Tipe:</span>
            <select
              className="bg-transparent outline-none cursor-pointer text-gray-700 font-bold"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="ALL">Semua Tipe</option>
              <option value="NATIONAL_HOLIDAY">Libur Nasional</option>
              <option value="SCHOOL_HOLIDAY">Libur Sekolah</option>
              <option value="SPECIAL_NO_ATTENDANCE_DAY">Tanpa Presensi</option>
              <option value="REPLACEMENT_SCHOOL_DAY">Hari Pengganti</option>
              <option value="HALF_DAY">Setengah Hari</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Events Table */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-gray-400 font-medium">
            <RefreshCw className="animate-spin text-blue-600 h-8 w-8 mx-auto mb-3" />
            <span>Memuat data overrides kalender...</span>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="p-16 text-center text-gray-400 font-medium space-y-1">
            <CalendarIcon size={32} className="mx-auto text-gray-300 mb-2" />
            <p className="text-gray-800">Tidak Ada Override Kalender Ditemukan</p>
            <p className="text-gray-400 text-xs">Belum ada hari libur/pengganti khusus yang dikonfigurasi pada rentang ini.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-[11px] uppercase tracking-wider font-bold text-gray-400">
                  <th className="px-6 py-4">Tanggal & Hari</th>
                  <th className="px-6 py-4">Unit Sekolah</th>
                  <th className="px-6 py-4">Jenis Event</th>
                  <th className="px-6 py-4 text-center">Status Hari Sekolah</th>
                  <th className="px-6 py-4">Deskripsi</th>
                  <th className="px-6 py-4">TA</th>
                  {isSuperAdmin && <th className="px-6 py-4 text-center">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filteredEvents.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-bold text-gray-900">{item.date}</div>
                      <div className="text-xs text-gray-400 font-medium">{getIndonesianDayName(item.date)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-semibold text-gray-700">{getUnitName(item.unit)}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2.5 py-1 rounded-full border text-xs font-bold ${getEventBadgeClass(item.type)}`}>
                        {getEventTypeName(item.type)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {item.isSchoolDay ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-green-700 bg-green-50 border border-green-100 px-2.5 py-0.5 rounded-full">
                          <CheckCircle2 size={12} />
                          Hari Sekolah
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700 bg-red-50 border border-red-100 px-2.5 py-0.5 rounded-full">
                          <XCircle size={12} />
                          Libur / Off
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-gray-600 font-medium">{item.description}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                        {item.academicYear || getAcademicYearForDate(item.date)}
                      </span>
                    </td>
                    {isSuperAdmin && (
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => handleEditClick(item)}
                            className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                            title="Edit Event"
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            onClick={() => handleDeleteClick(item)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-all"
                            title="Hapus Event"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Form Dialog Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div>
                <h3 className="font-black text-gray-900 text-lg">
                  {editingEvent ? 'Ubah Konfigurasi Hari' : 'Tambah Konfigurasi Kalender'}
                </h3>
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mt-0.5">
                  Lumina School Attendance Calendar System
                </p>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-all text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSave} className="p-8 space-y-5 overflow-y-auto">
              
              {/* Date Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-700 uppercase tracking-wider block">Tanggal</label>
                <input
                  type="date"
                  required
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 focus:border-blue-300 rounded-xl outline-none font-semibold text-sm transition-all"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                />
              </div>

              {/* Unit selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-700 uppercase tracking-wider block">Unit Sekolah</label>
                <select
                  disabled={!!editingEvent}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 focus:border-blue-300 rounded-xl outline-none font-semibold text-sm transition-all disabled:opacity-60"
                  value={formUnit}
                  onChange={(e) => setFormUnit(e.target.value as any)}
                >
                  {!editingEvent && <option value="ALL_UNITS">Semua Unit (Kindergarten, Elementary, Junior High)</option>}
                  <option value="KINDERGARTEN">TK (Kindergarten)</option>
                  <option value="ELEMENTARY">SD (Elementary)</option>
                  <option value="JUNIOR_HIGH">SMP (Junior High)</option>
                </select>
                {!editingEvent && formUnit === 'ALL_UNITS' && (
                  <p className="text-xs text-blue-600 font-bold bg-blue-50/50 border border-blue-100/50 p-2.5 rounded-xl">
                    ✨ Memilih &ldquo;Semua Unit&rdquo; akan membuat 3 dokumen kalender individual sekaligus secara otomatis (TK, SD, & SMP).
                  </p>
                )}
              </div>

              {/* Event Type selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-700 uppercase tracking-wider block">Jenis Event</label>
                <select
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 focus:border-blue-300 rounded-xl outline-none font-semibold text-sm transition-all"
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as any)}
                >
                  <option value="NATIONAL_HOLIDAY">Hari Libur Nasional (Hari Sekolah: Off)</option>
                  <option value="SCHOOL_HOLIDAY">Libur Sekolah (Hari Sekolah: Off)</option>
                  <option value="SPECIAL_NO_ATTENDANCE_DAY">Khusus Tidak Ada Presensi (Hari Sekolah: Off)</option>
                  <option value="REPLACEMENT_SCHOOL_DAY">Hari Pengganti Sekolah (Hari Sekolah: ON)</option>
                  <option value="HALF_DAY">Setengah Hari (Hari Sekolah: ON)</option>
                </select>
              </div>

              {/* Automated Day Status Info */}
              <div className="bg-gray-50 border border-gray-200 p-4 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-black text-slate-500 uppercase tracking-wider block">Status Hari Sekolah Otomatis</span>
                  <span className="text-xs text-slate-400 font-medium">Berdasarkan jenis event yang dipilih</span>
                </div>
                <div>
                  {isSchoolDayForType(formType) ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-green-700 bg-green-100 border border-green-200 px-3 py-1 rounded-full">
                      <CheckCircle2 size={12} />
                      ON (Presensi Aktif)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700 bg-red-100 border border-red-200 px-3 py-1 rounded-full">
                      <XCircle size={12} />
                      OFF (Libur / Off)
                    </span>
                  )}
                </div>
              </div>

              {/* Description Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-700 uppercase tracking-wider block">Deskripsi / Keterangan</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Hari Raya Idul Fitri, Rapat Kerja Guru"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 focus:border-blue-300 rounded-xl outline-none font-semibold text-sm transition-all placeholder:text-gray-300"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                />
              </div>

              {/* Form Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-5 py-2.5 bg-gray-100 text-gray-500 rounded-xl font-bold text-sm hover:bg-gray-100/80 transition-all"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center justify-center gap-1.5 px-6 py-2.5 bg-[#002366] text-white rounded-xl font-bold text-sm hover:opacity-90 transition-all disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <RefreshCw className="animate-spin" size={14} />
                      Menyimpan...
                    </>
                  ) : (
                    'Simpan Kalender'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
