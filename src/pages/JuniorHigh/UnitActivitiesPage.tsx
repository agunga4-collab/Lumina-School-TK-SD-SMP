import * as React from 'react';
import { motion } from 'motion/react';
import { 
  Compass, Users, CheckCircle, XCircle, Plus, Search, Filter, 
  Trash2, AlertCircle, X, ChevronDown, Calendar, Briefcase, 
  GraduationCap, Clock, HelpCircle, AlertTriangle
} from 'lucide-react';
import { db, getClasses, getActiveStudents } from '../../lib/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, query, where } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { toast } from 'sonner';
import type { Student, Class, UnitActivityEnrollment } from '../../types';

const CATEGORIES = [
  'Performing Arts',
  'Arts & Makerspace',
  'Physical Education',
  'Digital Literacy'
];

const UA_BY_CATEGORY: Record<string, string[]> = {
  'Performing Arts': ['Orchestra', 'LGP', 'Traditional Music', 'Drumline'],
  'Arts & Makerspace': ['Papercraft', 'Makerspace', 'Seni Kreasi Bebas', 'Membatik', 'Painting'],
  'Physical Education': ['Bola Kecil', 'Bola Besar', 'Senam & Gerak Berirama', 'Atletik', 'Swimming & Physical Training'],
  'Digital Literacy': ['Animation', 'Videography', 'Graphic Design', '3D Structure Building', 'Coding']
};

export function normalizeEnrollmentForUI(e: UnitActivityEnrollment): UnitActivityEnrollment {
  const isLgp = e.isLgp || 
    ['LGP', 'Choir', 'Theatre', 'Musical Theatre Band'].includes(e.normalizedUaName) || 
    ['Choir', 'Theatre', 'Musical Theatre Band'].includes(e.sourceUaName || '');

  const normalizedUaName = isLgp ? 'LGP' : e.normalizedUaName;

  let category = e.category || 'Performing Arts';
  if (isLgp || ['Performing Arts', 'Choir', 'Theatre', 'Musical Theatre Band'].includes(category)) {
    category = 'Performing Arts';
  } else if (['Sports', 'Physical Education'].includes(category)) {
    category = 'Physical Education';
  } else if (['Art', 'Arts & Makerspace'].includes(category)) {
    category = 'Arts & Makerspace';
  } else if (category === 'Digital Literacy') {
    category = 'Digital Literacy';
  } else {
    if (!CATEGORIES.includes(category)) {
      category = 'Performing Arts';
    }
  }

  return {
    ...e,
    normalizedUaName,
    category
  };
}

export default function UnitActivitiesPage() {
  const { profile } = useAuth();
  const { activeYear, activeSemester } = useAcademicYear();

  const canManage = profile?.role === 'SUPER_ADMIN' || profile?.role === 'HEAD_JUNIOR';

  // Selected period
  const [selectedYear, setSelectedYear] = React.useState<string>(activeYear || '2026/2027');
  const [selectedSemester, setSelectedSemester] = React.useState<string>(String(activeSemester || '1'));

  React.useEffect(() => {
    if (activeYear) setSelectedYear(activeYear);
    if (activeSemester) setSelectedSemester(String(activeSemester));
  }, [activeYear, activeSemester]);

  // Master lists
  const [classesList, setClassesList] = React.useState<Class[]>([]);
  const [loadingClasses, setLoadingClasses] = React.useState(false);

  // Enrollments State
  const [enrollments, setEnrollments] = React.useState<UnitActivityEnrollment[]>([]);
  const [loadingEnrollments, setLoadingEnrollments] = React.useState(false);

  // Tab State
  const [activeTab, setActiveTab] = React.useState<'active_semester' | 'student_history'>('active_semester');

  // History Tab States & Filters
  const [allActiveStudents, setAllActiveStudents] = React.useState<Student[]>([]);
  const [loadingActiveStudents, setLoadingActiveStudents] = React.useState(false);
  const [allHistoryEnrollments, setAllHistoryEnrollments] = React.useState<UnitActivityEnrollment[]>([]);
  const [loadingHistoryEnrollments, setLoadingHistoryEnrollments] = React.useState(false);
  const [selectedStudentForDetail, setSelectedStudentForDetail] = React.useState<Student | null>(null);

  const [histFilterClassId, setHistFilterClassId] = React.useState<string>('ALL');
  const [histFilterGrade, setHistFilterGrade] = React.useState<string>('ALL');
  const [histFilterCategory, setHistFilterCategory] = React.useState<string>('ALL');
  const [histSearchKeyword, setHistSearchKeyword] = React.useState<string>('');

  // Filters
  const [filterClassId, setFilterClassId] = React.useState<string>('ALL');
  const [filterGrade, setFilterGrade] = React.useState<string>('ALL');
  const [filterCategory, setFilterCategory] = React.useState<string>('ALL');
  const [filterUaName, setFilterUaName] = React.useState<string>('ALL');
  const [filterStatus, setFilterStatus] = React.useState<string>('CONFIRMED');
  const [searchKeyword, setSearchKeyword] = React.useState<string>('');

  // UI state
  const [showAddModal, setShowAddModal] = React.useState(false);
  const [cancellingEnrollment, setCancellingEnrollment] = React.useState<UnitActivityEnrollment | null>(null);

  // Modal Form State
  const [formCategory, setFormCategory] = React.useState<string>('');
  const [formUa, setFormUa] = React.useState<string>('');
  const [formClassId, setFormClassId] = React.useState<string>('');
  const [students, setStudents] = React.useState<Student[]>([]);
  const [loadingStudents, setLoadingStudents] = React.useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = React.useState<string[]>([]);
  const [isSaving, setIsSaving] = React.useState(false);

  // Load JH classes
  const fetchClasses = async () => {
    setLoadingClasses(true);
    try {
      const all = await getClasses();
      const jhClasses = (all || []).filter(c => 
        c.unitId === 'JUNIOR_HIGH' && 
        c.status !== 'archived'
      );
      setClassesList(jhClasses);
    } catch (err) {
      console.error('Error loading classes:', err);
      toast.error('Gagal memuat daftar kelas');
    } finally {
      setLoadingClasses(false);
    }
  };

  // Load all UA enrollments for the selected year & semester
  const fetchEnrollments = async () => {
    setLoadingEnrollments(true);
    try {
      const q = query(
        collection(db, 'junior_high_unit_activity_enrollments'),
        where('academicYear', '==', selectedYear),
        where('semester', '==', selectedSemester)
      );
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UnitActivityEnrollment));
      setEnrollments(list.map(normalizeEnrollmentForUI));
    } catch (err) {
      console.error('Error loading enrollments:', err);
      toast.error('Gagal memuat data peserta');
    } finally {
      setLoadingEnrollments(false);
    }
  };

  React.useEffect(() => {
    fetchClasses();
  }, []);

  const fetchAllActiveStudents = async () => {
    setLoadingActiveStudents(true);
    try {
      const list = await getActiveStudents('all', selectedYear);
      // Filter only for Junior High classes
      const jhStudents = (list || []).filter(s => 
        classesList.some(c => c.id === s.classId)
      );
      setAllActiveStudents(jhStudents);
    } catch (err) {
      console.error('Error fetching all active students:', err);
    } finally {
      setLoadingActiveStudents(false);
    }
  };

  const fetchAllHistoryEnrollments = async () => {
    setLoadingHistoryEnrollments(true);
    try {
      const q = query(collection(db, 'junior_high_unit_activity_enrollments'));
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UnitActivityEnrollment));
      setAllHistoryEnrollments(list.map(normalizeEnrollmentForUI));
    } catch (err) {
      console.error('Error loading history enrollments:', err);
    } finally {
      setLoadingHistoryEnrollments(false);
    }
  };

  React.useEffect(() => {
    if (classesList.length > 0) {
      fetchAllActiveStudents();
    }
  }, [selectedYear, classesList]);

  React.useEffect(() => {
    fetchAllHistoryEnrollments();
  }, [selectedYear, selectedSemester]);

  React.useEffect(() => {
    fetchEnrollments();
  }, [selectedYear, selectedSemester]);

  // Handle category change in modal form
  React.useEffect(() => {
    setFormUa('');
  }, [formCategory]);

  // Load active students for the selected class in form modal
  React.useEffect(() => {
    const fetchClassStudents = async () => {
      if (!formClassId) {
        setStudents([]);
        return;
      }
      setLoadingStudents(true);
      setSelectedStudentIds([]);
      try {
        const list = await getActiveStudents(formClassId, selectedYear);
        setStudents(list || []);
      } catch (err) {
        console.error('Error loading students:', err);
        toast.error('Gagal memuat siswa kelas');
      } finally {
        setLoadingStudents(false);
      }
    };
    fetchClassStudents();
  }, [formClassId, selectedYear]);

  // Utility to generate dynamic id from UA Name
  const getUaId = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_');

  // Trigger Bulk Save
  const handleBulkSave = async () => {
    if (!canManage) {
      toast.error('Akses ditolak: Anda tidak memiliki wewenang untuk mengelola peserta.');
      return;
    }
    if (!formCategory || !formUa || !formClassId || selectedStudentIds.length === 0) {
      toast.error('Harap isi semua form dan pilih minimal 1 siswa');
      return;
    }

    const selectedClassObj = classesList.find(c => c.id === formClassId);
    if (!selectedClassObj) {
      toast.error('Kelas tidak valid');
      return;
    }

    setIsSaving(true);
    try {
      const batchPromises = selectedStudentIds.map(async (studentId) => {
        const student = students.find(s => s.id === studentId);
        if (!student) return;

        // Double check confirmation to avoid duplicates on fast double-clicks or multiple runs
        const isAlreadyAssigned = enrollments.some(e => 
          e.studentId === studentId && 
          e.status === 'CONFIRMED' && 
          e.academicYear === selectedYear && 
          e.semester === selectedSemester
        );

        if (isAlreadyAssigned) return;

        const isLgpVal = formUa === 'LGP';

        await addDoc(collection(db, 'junior_high_unit_activity_enrollments'), {
          studentId: student.id,
          studentName: student.name,
          classId: selectedClassObj.id,
          className: selectedClassObj.name,
          grade: String(selectedClassObj.grade),
          academicYear: selectedYear,
          semester: selectedSemester,
          category: formCategory,
          sourceUaId: getUaId(formUa),
          sourceUaName: formUa,
          normalizedUaId: getUaId(formUa),
          normalizedUaName: formUa,
          isLgp: isLgpVal,
          status: 'CONFIRMED',
          source: 'MANUAL',
          createdAt: Date.now(),
          createdBy: profile?.uid || 'system',
          createdByName: profile?.displayName || profile?.email || 'Admin',
          updatedAt: Date.now(),
          updatedBy: profile?.uid || 'system',
          updatedByName: profile?.displayName || profile?.email || 'Admin'
        });
      });

      await Promise.all(batchPromises);
      toast.success(`Berhasil menambahkan ${selectedStudentIds.length} peserta Unit Aktivitas`);
      setShowAddModal(false);
      
      // Reset Modal Form
      setFormCategory('');
      setFormUa('');
      setFormClassId('');
      setStudents([]);
      setSelectedStudentIds([]);

      // Refresh list
      fetchEnrollments();
    } catch (err) {
      console.error('Error saving bulk enrollments:', err);
      toast.error('Gagal menyimpan pendaftaran peserta');
    } finally {
      setIsSaving(false);
    }
  };

  // Soft cancel an enrollment
  const handleConfirmCancel = async () => {
    if (!canManage) {
      toast.error('Akses ditolak: Anda tidak memiliki wewenang untuk mengelola peserta.');
      return;
    }
    if (!cancellingEnrollment) return;

    try {
      const docRef = doc(db, 'junior_high_unit_activity_enrollments', cancellingEnrollment.id);
      await updateDoc(docRef, {
        status: 'CANCELLED',
        cancelledAt: Date.now(),
        cancelledBy: profile?.uid || 'system',
        cancelledByName: profile?.displayName || profile?.email || 'Admin',
        cancelReason: 'Dibatalkan secara manual oleh admin',
        updatedAt: Date.now(),
        updatedBy: profile?.uid || 'system',
        updatedByName: profile?.displayName || profile?.email || 'Admin'
      });

      toast.success(`Pendaftaran ${cancellingEnrollment.studentName} berhasil dibatalkan`);
      setCancellingEnrollment(null);
      fetchEnrollments();
    } catch (err) {
      console.error('Error cancelling enrollment:', err);
      toast.error('Gagal membatalkan pendaftaran');
    }
  };

  // Filter Logic (Client-side)
  const filteredEnrollments = enrollments.filter(e => {
    // Search keyword (studentName or NIS)
    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase();
      const nameMatch = e.studentName?.toLowerCase().includes(keyword);
      const nisMatch = e.studentId?.toLowerCase().includes(keyword);
      if (!nameMatch && !nisMatch) return false;
    }

    // Filter class
    if (filterClassId !== 'ALL' && e.classId !== filterClassId) return false;

    // Filter grade
    if (filterGrade !== 'ALL' && e.grade !== filterGrade) return false;

    // Filter category
    if (filterCategory !== 'ALL' && e.category !== filterCategory) return false;

    // Filter UA
    if (filterUaName !== 'ALL' && e.normalizedUaName !== filterUaName) return false;

    // Filter status
    if (filterStatus !== 'ALL' && e.status !== filterStatus) return false;

    return true;
  });

  // Filter Logic for Student History (Client-side)
  const filteredStudentsForHistory = allActiveStudents.filter(student => {
    // Search keyword
    if (histSearchKeyword) {
      const keyword = histSearchKeyword.toLowerCase();
      const nameMatch = student.name?.toLowerCase().includes(keyword);
      const nisMatch = student.id?.toLowerCase().includes(keyword);
      if (!nameMatch && !nisMatch) return false;
    }

    // Class filter
    if (histFilterClassId !== 'ALL' && student.classId !== histFilterClassId) return false;

    // Grade filter
    if (histFilterGrade !== 'ALL') {
      const classObj = classesList.find(c => c.id === student.classId);
      if (!classObj || String(classObj.grade) !== histFilterGrade) return false;
    }

    // Category filter
    if (histFilterCategory !== 'ALL') {
      const studentHistory = allHistoryEnrollments.filter(e => e.studentId === student.id && e.status === 'CONFIRMED');
      const hasCategory = studentHistory.some(e => e.category === histFilterCategory);
      if (!hasCategory) return false;
    }

    return true;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Compass size={22} />
            </div>
            <h1 className="text-xl font-bold text-gray-900">Unit Aktivitas</h1>
          </div>
          <p className="text-xs text-gray-500 font-medium tracking-tight">
            Peserta Unit Aktivitas • Junior High • TA {selectedYear} • Semester {selectedSemester}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">TA</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="bg-transparent text-xs font-semibold text-gray-700 focus:outline-none"
            >
              <option value="2026/2027">2026/2027</option>
              <option value="2025/2026">2025/2026</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Sem</span>
            <select
              value={selectedSemester}
              onChange={(e) => setSelectedSemester(e.target.value)}
              className="bg-transparent text-xs font-semibold text-gray-700 focus:outline-none"
            >
              <option value="1">1</option>
              <option value="2">2</option>
            </select>
          </div>

          {canManage && (
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1.5 bg-[#002366] hover:bg-blue-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-sm cursor-pointer whitespace-nowrap"
            >
              <Plus size={15} />
              Tambah Peserta
            </button>
          )}
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('active_semester')}
          className={`pb-3 px-4 text-xs font-bold transition-all border-b-2 -mb-[1px] cursor-pointer ${
            activeTab === 'active_semester'
              ? 'border-[#002366] text-[#002366]'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          Peserta Semester Aktif
        </button>
        <button
          onClick={() => setActiveTab('student_history')}
          className={`pb-3 px-4 text-xs font-bold transition-all border-b-2 -mb-[1px] cursor-pointer ${
            activeTab === 'student_history'
              ? 'border-[#002366] text-[#002366]'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          Riwayat Siswa
        </button>
      </div>

      {activeTab === 'active_semester' && (
        <>
          {/* Filter Card */}
      <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
        <div className="flex items-center gap-1.5 border-b border-gray-50 pb-2.5">
          <Filter size={14} className="text-gray-400" />
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Filter Pencarian</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Class Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Kelas</label>
            <select
              value={filterClassId}
              onChange={(e) => setFilterClassId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-700 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
            >
              <option value="ALL">Semua Kelas</option>
              {classesList.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Grade Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Grade</label>
            <select
              value={filterGrade}
              onChange={(e) => setFilterGrade(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-700 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
            >
              <option value="ALL">Semua Grade</option>
              <option value="7">Grade 7</option>
              <option value="8">Grade 8</option>
              <option value="9">Grade 9</option>
            </select>
          </div>

          {/* Category Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Kategori UA</label>
            <select
              value={filterCategory}
              onChange={(e) => {
                setFilterCategory(e.target.value);
                setFilterUaName('ALL');
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-700 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
            >
              <option value="ALL">Semua Kategori</option>
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* UA Name Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Unit Aktivitas</label>
            <select
              value={filterUaName}
              onChange={(e) => setFilterUaName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-700 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
            >
              <option value="ALL">Semua UA</option>
              {filterCategory !== 'ALL' ? (
                (UA_BY_CATEGORY[filterCategory] || []).map(ua => (
                  <option key={ua} value={ua}>{ua}</option>
                ))
              ) : (
                Object.values(UA_BY_CATEGORY).flat().map(ua => (
                  <option key={ua} value={ua}>{ua}</option>
                ))
              )}
            </select>
          </div>

          {/* Status Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-700 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
            >
              <option value="ALL">Semua Status</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="MOVED">Moved</option>
            </select>
          </div>

          {/* Student Search */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Nama / NIS</label>
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-2.5 text-gray-400" />
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="Cari siswa..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-2.5 py-1.5 text-xs font-semibold text-gray-700 placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Table Panel */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto relative">
          <table className="w-full text-left border-collapse min-w-[1200px]">
            <thead>
              <tr className="bg-slate-50/50 border-b border-gray-100">
                <th className="sticky left-0 z-20 bg-slate-50 px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider shadow-[2px_0_5px_rgba(0,0,0,0.02)] min-w-[200px]">
                  Nama Siswa
                </th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">NIS</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Kelas</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Grade</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Kategori</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Unit Aktivitas</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Sumber</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Pembaruan Terakhir</th>
                {canManage && <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loadingEnrollments ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <p className="text-xs text-gray-500 font-medium">Memuat data peserta...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredEnrollments.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2 max-w-sm mx-auto">
                      <div className="p-3 bg-slate-50 text-slate-400 rounded-full">
                        <Compass size={28} />
                      </div>
                      <h3 className="text-xs font-bold text-gray-700">Belum Ada Peserta</h3>
                      <p className="text-[11px] text-gray-500 leading-normal">
                        Belum ada peserta Unit Aktivitas yang tercatat untuk periode ini. Klik tombol tambah peserta untuk mendaftarkan siswa.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredEnrollments.map((e, index) => (
                  <tr key={e.id} className="group hover:bg-slate-50/50 transition-colors">
                    <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 px-4 py-3 text-[13px] font-semibold text-gray-800 shadow-[2px_0_4px_rgba(0,0,0,0.015)] border-r border-gray-100/30">
                      {e.studentName}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-gray-500">
                      {e.studentId}
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-gray-700">
                      {e.className}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-gray-500">
                      Grade {e.grade}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-gray-600">
                      {e.category}
                    </td>
                    <td className="px-4 py-3 text-xs font-bold text-gray-900">
                      {e.normalizedUaName}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${
                        e.status === 'CONFIRMED' ? 'bg-green-50 text-green-700 border-green-100' :
                        e.status === 'CANCELLED' ? 'bg-red-50 text-red-700 border-red-100' :
                        'bg-amber-50 text-amber-700 border-amber-100'
                      }`}>
                        {e.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-gray-500">
                      <span className="inline-flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          e.source === 'MANUAL' ? 'bg-blue-500' :
                          e.source === 'IMPORT' ? 'bg-amber-500' :
                          'bg-purple-500'
                        }`} />
                        {e.source}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 font-medium">
                      <div className="flex flex-col">
                        <span>{new Date(e.updatedAt || e.createdAt).toLocaleDateString('id-ID')}</span>
                        <span className="text-[10px] text-gray-400">Oleh: {e.updatedByName || e.createdByName || 'Admin'}</span>
                      </div>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        {e.status === 'CONFIRMED' && (
                          <button
                            onClick={() => setCancellingEnrollment(e)}
                            className="inline-flex items-center gap-1 border border-dashed border-red-200 hover:border-red-400 hover:bg-red-50 text-red-600 px-2 py-1 rounded-lg text-[11px] font-bold transition-all active:scale-95 cursor-pointer"
                          >
                            <Trash2 size={12} />
                            Batalkan
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}

      {/* --- Part A: STUDENT HISTORY VIEW --- */}
      {activeTab === 'student_history' && (
        <>
          {/* Filters for history */}
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex items-center gap-1.5 border-b border-gray-50 pb-2.5">
              <Filter size={14} className="text-gray-400" />
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Filter Riwayat Siswa</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {/* Class Filter */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Kelas</label>
                <select
                  value={histFilterClassId}
                  onChange={(e) => setHistFilterClassId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-700 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
                >
                  <option value="ALL">Semua Kelas</option>
                  {classesList.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Grade Filter */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Grade</label>
                <select
                  value={histFilterGrade}
                  onChange={(e) => setHistFilterGrade(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-700 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
                >
                  <option value="ALL">Semua Grade</option>
                  <option value="7">Grade 7</option>
                  <option value="8">Grade 8</option>
                  <option value="9">Grade 9</option>
                </select>
              </div>

              {/* Category Filter */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Kategori UA</label>
                <select
                  value={histFilterCategory}
                  onChange={(e) => setHistFilterCategory(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-700 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
                >
                  <option value="ALL">Semua Kategori</option>
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Student Search */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Nama / NIS</label>
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    value={histSearchKeyword}
                    onChange={(e) => setHistSearchKeyword(e.target.value)}
                    placeholder="Cari siswa..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-2.5 py-1.5 text-xs font-semibold text-gray-700 placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Main Table for history */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto relative">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-gray-100">
                    <th className="sticky left-0 z-20 bg-slate-50 px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider shadow-[2px_0_5px_rgba(0,0,0,0.02)] min-w-[200px]">
                      Nama Siswa
                    </th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">NIS</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Kelas Saat Ini</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Riwayat Unit Aktivitas</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Jumlah UA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loadingActiveStudents || loadingHistoryEnrollments ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-xs text-gray-400">
                        Memuat data...
                      </td>
                    </tr>
                  ) : filteredStudentsForHistory.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-xs text-gray-400">
                        Siswa tidak ditemukan
                      </td>
                    </tr>
                  ) : (
                    filteredStudentsForHistory.map(student => {
                      const currentClassObj = classesList.find(c => c.id === student.classId);
                      const studentHistory = allHistoryEnrollments
                        .filter(e => e.studentId === student.id && e.status === 'CONFIRMED')
                        .sort((a, b) => {
                          if (a.academicYear !== b.academicYear) {
                            return a.academicYear.localeCompare(b.academicYear);
                          }
                          return a.semester.localeCompare(b.semester);
                        });

                      const hasRecords = studentHistory.length > 0;

                      return (
                        <tr
                          key={student.id}
                          onClick={() => setSelectedStudentForDetail(student)}
                          className="hover:bg-slate-50/50 transition-colors cursor-pointer group"
                        >
                          <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50/50 px-4 py-3 text-xs font-semibold text-gray-900 shadow-[2px_0_5px_rgba(0,0,0,0.02)] min-w-[200px]">
                            {student.name}
                          </td>
                          <td className="px-4 py-3 text-xs font-semibold text-gray-500">{student.id}</td>
                          <td className="px-4 py-3 text-xs text-gray-600 font-medium">{currentClassObj?.name || '-'}</td>
                          <td className="px-4 py-3 text-xs">
                            <div className="flex flex-wrap gap-1.5 max-w-2xl">
                              {hasRecords ? (
                                studentHistory.map(e => {
                                  const isLgp = e.isLgp || ['LGP', 'Choir', 'Theatre', 'Musical Theatre Band'].includes(e.normalizedUaName);
                                  const displayName = isLgp ? 'LGP' : e.normalizedUaName;
                                  return (
                                    <span
                                      key={e.id}
                                      className="inline-flex items-center gap-1 bg-blue-50 text-[#002366] text-[10px] font-bold px-2 py-0.5 rounded border border-blue-100/50"
                                    >
                                      TA {e.academicYear} S{e.semester} — {displayName}
                                    </span>
                                  );
                                })
                              ) : (
                                <span className="text-xs text-gray-400 italic font-medium">Data belum diimpor</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs font-bold text-[#002366]">{studentHistory.length}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Detail Read-Only Student History Modal */}
      {selectedStudentForDetail && (
        <div className="fixed inset-0 bg-slate-950/40 z-50 flex items-center justify-center p-4 backdrop-blur-[2px]">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-2xl w-full overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Users size={18} className="text-[#002366]" />
                <h3 className="text-sm font-bold text-gray-900">Detail Riwayat Siswa</h3>
              </div>
              <button
                onClick={() => setSelectedStudentForDetail(null)}
                className="text-gray-400 hover:text-gray-600 cursor-pointer p-1 rounded-lg hover:bg-gray-50"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* Profile Card */}
              <div className="grid grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div>
                  <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Nama Siswa</span>
                  <span className="text-xs font-bold text-gray-800">{selectedStudentForDetail.name}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">NIS</span>
                  <span className="text-xs font-semibold text-gray-700">{selectedStudentForDetail.id}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Kelas</span>
                  <span className="text-xs font-semibold text-gray-700">
                    {classesList.find(c => c.id === selectedStudentForDetail.classId)?.name || '-'}
                  </span>
                </div>
              </div>

              {/* History Table */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Riwayat Unit Aktivitas</h4>
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-gray-100">
                        <th className="px-4 py-2 font-bold text-gray-500 uppercase tracking-wider">Tahun Ajaran</th>
                        <th className="px-4 py-2 font-bold text-gray-500 uppercase tracking-wider text-center">Semester</th>
                        <th className="px-4 py-2 font-bold text-gray-500 uppercase tracking-wider">Kategori</th>
                        <th className="px-4 py-2 font-bold text-gray-500 uppercase tracking-wider">Unit Aktivitas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {allHistoryEnrollments
                        .filter(e => e.studentId === selectedStudentForDetail.id && e.status === 'CONFIRMED')
                        .sort((a, b) => {
                          if (a.academicYear !== b.academicYear) {
                            return a.academicYear.localeCompare(b.academicYear);
                          }
                          return a.semester.localeCompare(b.semester);
                        })
                        .map(e => {
                          const isLgp = e.isLgp || ['LGP', 'Choir', 'Theatre', 'Musical Theatre Band'].includes(e.normalizedUaName);
                          const displayName = isLgp ? 'LGP' : e.normalizedUaName;
                          return (
                            <tr key={e.id} className="hover:bg-slate-50/50">
                              <td className="px-4 py-2.5 font-semibold text-gray-700">{e.academicYear}</td>
                              <td className="px-4 py-2.5 text-center font-bold text-gray-500">{e.semester}</td>
                              <td className="px-4 py-2.5 font-medium text-gray-500">{e.category}</td>
                              <td className="px-4 py-2.5 font-bold text-[#002366]">{displayName}</td>
                            </tr>
                          );
                        })}
                      {allHistoryEnrollments.filter(e => e.studentId === selectedStudentForDetail.id && e.status === 'CONFIRMED').length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-4 py-6 text-center text-gray-400 italic">
                            Data belum diimpor
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex justify-end px-6 py-4 border-t border-gray-100 bg-slate-50">
              <button
                onClick={() => setSelectedStudentForDetail(null)}
                className="bg-white hover:bg-slate-100 text-gray-600 px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 border border-gray-200 cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Add Modal (Form Bulk Assignment) */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/40 z-50 flex items-center justify-center p-4 backdrop-blur-[2px]">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                  <Compass size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Mendaftarkan Peserta Baru</h3>
                  <p className="text-[10px] text-gray-400 font-medium tracking-tight">Bulk Assignment Semester 1 TA {selectedYear}</p>
                </div>
              </div>
              <button 
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Year & Semester (Static lock for simple visual clarity) */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tahun Ajaran & Semester</label>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-600 flex items-center gap-1.5 select-none">
                    <Calendar size={13} className="text-gray-400" />
                    TA {selectedYear} • Sem {selectedSemester}
                  </div>
                </div>

                {/* Category Selection */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Kategori Rumpun UA *</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-700 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
                  >
                    <option value="">-- Pilih Kategori --</option>
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                {/* UA Selection */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Unit Aktivitas *</label>
                  <select
                    value={formUa}
                    onChange={(e) => setFormUa(e.target.value)}
                    disabled={!formCategory}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-700 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors disabled:opacity-50"
                  >
                    <option value="">-- Pilih UA --</option>
                    {formCategory && (UA_BY_CATEGORY[formCategory] || []).map(ua => (
                      <option key={ua} value={ua}>{ua}</option>
                    ))}
                  </select>
                </div>

                {/* Class Selection */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Kelas Siswa *</label>
                  <select
                    value={formClassId}
                    onChange={(e) => setFormClassId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-700 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
                  >
                    <option value="">-- Pilih Kelas --</option>
                    {classesList.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Student Checklist Panel */}
              {formClassId && (
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Pilih Peserta Didik ({students.length} Siswa)</label>
                    {students.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          // Select all non-allocated students
                          const availableIds = students
                            .filter(s => !enrollments.some(e => e.studentId === s.id && e.status === 'CONFIRMED'))
                            .map(s => s.id);
                          if (selectedStudentIds.length === availableIds.length) {
                            setSelectedStudentIds([]);
                          } else {
                            setSelectedStudentIds(availableIds);
                          }
                        }}
                        className="text-[10px] font-bold text-blue-600 hover:text-blue-800 transition-colors"
                      >
                        {selectedStudentIds.length === students.filter(s => !enrollments.some(e => e.studentId === s.id && e.status === 'CONFIRMED')).length
                          ? 'Deselect All'
                          : 'Select All Available'}
                      </button>
                    )}
                  </div>

                  {loadingStudents ? (
                    <div className="py-8 text-center text-xs text-gray-400">Loading daftar siswa...</div>
                  ) : students.length === 0 ? (
                    <div className="py-8 text-center text-xs text-gray-400">Tidak ada siswa aktif di kelas ini</div>
                  ) : (
                    <div className="border border-slate-100 rounded-xl overflow-hidden max-h-60 overflow-y-auto divide-y divide-slate-50">
                      {students.map(s => {
                        const existingConfirmed = enrollments.find(e => e.studentId === s.id && e.status === 'CONFIRMED');
                        const isAssigned = !!existingConfirmed;

                        return (
                          <div 
                            key={s.id} 
                            className={`flex items-center justify-between p-2.5 transition-colors text-xs ${
                              isAssigned ? 'bg-slate-50 text-gray-400' : 'hover:bg-slate-50/50'
                            }`}
                          >
                            <label className="flex items-center gap-2.5 flex-1 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={selectedStudentIds.includes(s.id)}
                                disabled={isAssigned}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedStudentIds(prev => [...prev, s.id]);
                                  } else {
                                    setSelectedStudentIds(prev => prev.filter(id => id !== s.id));
                                  }
                                }}
                                className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer disabled:opacity-50"
                              />
                              <div className="flex flex-col text-left">
                                <span className="font-semibold">{s.name}</span>
                                <span className="text-[10px] text-gray-400 font-medium">NIS: {s.id}</span>
                              </div>
                            </label>

                            {isAssigned && (
                              <span className="inline-flex items-center gap-0.5 bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border border-amber-100">
                                <AlertTriangle size={8} />
                                Terdaftar: {existingConfirmed.normalizedUaName}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer Summary & Buttons */}
            <div className="px-6 py-4 bg-slate-50 border-t border-gray-100 flex items-center justify-between">
              <div className="text-xs font-semibold text-gray-600">
                Terpilih: <span className="font-bold text-blue-700">{selectedStudentIds.length}</span> siswa
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-500 bg-white hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isSaving || selectedStudentIds.length === 0}
                  onClick={handleBulkSave}
                  className="inline-flex items-center gap-1 bg-[#002366] hover:bg-blue-800 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer whitespace-nowrap"
                >
                  {isSaving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Soft Cancel Confirm Dialog */}
      {cancellingEnrollment && (
        <div className="fixed inset-0 bg-slate-950/40 z-50 flex items-center justify-center p-4 backdrop-blur-[2px]">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-md p-6 space-y-4"
          >
            <div className="flex gap-3 text-red-600">
              <div className="p-2 bg-red-50 rounded-xl shrink-0">
                <AlertCircle size={24} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900 leading-normal">Batalkan Pendaftaran Unit Aktivitas?</h3>
                <p className="text-[11px] text-gray-500 leading-normal mt-0.5">
                  Anda akan membatalkan pendaftaran <strong>{cancellingEnrollment.studentName}</strong> dari Unit Aktivitas <strong>{cancellingEnrollment.normalizedUaName}</strong>.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-[11px] text-gray-600 leading-normal">
              <strong>Catatan Audit:</strong> Data pendaftaran tidak akan dihapus, tetapi statusnya akan berubah menjadi <strong>CANCELLED</strong> dalam rekam riwayat peserta.
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setCancellingEnrollment(null)}
                className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-500 bg-white hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmCancel}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                Konfirmasi Batalkan
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
