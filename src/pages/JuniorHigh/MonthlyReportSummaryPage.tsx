import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, Calendar, Users, Save, CheckCircle2, RefreshCw, Plus, Trash2, 
  ChevronUp, ChevronDown, Sparkles, BookOpen, Layers, AlertCircle, Info, Check
} from 'lucide-react';
import { db, getClasses } from '../../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { toast } from 'sonner';
import type { Class, ClassReportSummary } from '../../types';

interface ReportItem {
  id: string;
  order: number;
  category: 'WEEKLY_LESSON' | 'UNIT_ACTIVITY';
  title: string;
  summary: string;
}

const indonesianMonths = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

function getIndonesianMonthLabel(periodKey: string): string {
  if (!periodKey || !periodKey.includes('-')) return '';
  const [year, month] = periodKey.split('-');
  const monthIdx = parseInt(month, 10) - 1;
  if (monthIdx >= 0 && monthIdx < 12) {
    return `${indonesianMonths[monthIdx]} ${year}`;
  }
  return periodKey;
}

export default function MonthlyReportSummaryPage() {
  const { profile } = useAuth();
  const { activeYear, activeSemester } = useAcademicYear();

  // Selected parameters
  const [selectedYear, setSelectedYear] = React.useState<string>('2026/2027');
  const [selectedSemester, setSelectedSemester] = React.useState<string>('1');
  const [selectedMonth, setSelectedMonth] = React.useState<string>('');
  const [selectedClassId, setSelectedClassId] = React.useState<string>('');

  // Dropdown list
  const [classesList, setClassesList] = React.useState<Class[]>([]);
  const [loadingClasses, setLoadingClasses] = React.useState<boolean>(false);

  // Form states
  const [learningTitle, setLearningTitle] = React.useState<string>('');
  const [learningSummary, setLearningSummary] = React.useState<string>('');
  const [reportItems, setReportItems] = React.useState<ReportItem[]>([]);
  const [draftStatus, setDraftStatus] = React.useState<'DRAFT' | 'READY'>('DRAFT');

  // Async states
  const [isLoadingDraft, setIsLoadingDraft] = React.useState<boolean>(false);
  const [isSaving, setIsSaving] = React.useState<boolean>(false);

  // Initialize dates and lists
  React.useEffect(() => {
    if (activeYear) setSelectedYear(activeYear);
    if (activeSemester) setSelectedSemester(String(activeSemester));

    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(currentMonthStr);
  }, [activeYear, activeSemester]);

  // Fetch Junior High Classes
  React.useEffect(() => {
    const fetchJHClasses = async () => {
      setLoadingClasses(true);
      try {
        const all = await getClasses();
        const jhClasses = (all || []).filter(c => 
          c.unitId === 'JUNIOR_HIGH' && 
          c.status !== 'archived'
        );
        setClassesList(jhClasses);
        if (jhClasses.length > 0 && !selectedClassId) {
          setSelectedClassId(jhClasses[0].id);
        }
      } catch (err) {
        console.error('Error loading Junior High classes:', err);
        toast.error('Gagal memuat daftar kelas');
      } finally {
        setLoadingClasses(false);
      }
    };
    fetchJHClasses();
  }, [selectedClassId]);

  // Compute deterministic ID
  const getDeterministicId = () => {
    if (!selectedClassId || !selectedYear || !selectedSemester || !selectedMonth) return '';
    const academicYearNormalized = selectedYear.replace(/\//g, '-');
    return `JUNIOR_HIGH_MONTHLY_PROGRESS_${selectedClassId}_${academicYearNormalized}_${selectedSemester}_${selectedMonth}`;
  };

  // Load draft automatically when selection changes
  const loadDraft = async () => {
    const docId = getDeterministicId();
    if (!docId) return;

    setIsLoadingDraft(true);
    try {
      const docRef = doc(db, 'class_report_summaries', docId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data() as ClassReportSummary;
        setLearningTitle(data.sections?.learningJourney?.title || '');
        setLearningSummary(data.sections?.learningJourney?.summary || '');
        
        // Sort items by order
        const sortedItems = [...(data.sections?.weeklyLessonsAndUnitActivities || [])]
          .sort((a, b) => a.order - b.order)
          .map((item, idx) => ({
            ...item,
            order: item.order ?? idx
          }));
        setReportItems(sortedItems);
        setDraftStatus(data.status || 'DRAFT');
      } else {
        // Clear to empty defaults if document doesn't exist
        setLearningTitle('');
        setLearningSummary('');
        setReportItems([]);
        setDraftStatus('DRAFT');
      }
    } catch (err) {
      console.error('Error loading report summary:', err);
      toast.error('Gagal memuat draft ringkasan kelas');
    } finally {
      setIsLoadingDraft(false);
    }
  };

  React.useEffect(() => {
    if (selectedClassId && selectedYear && selectedSemester && selectedMonth) {
      loadDraft();
    }
  }, [selectedClassId, selectedYear, selectedSemester, selectedMonth]);

  // Handle Save (DRAFT or READY)
  const handleSave = async (targetStatus: 'DRAFT' | 'READY') => {
    const docId = getDeterministicId();
    if (!docId) {
      toast.error('Harap pilih kelas dan periode terlebih dahulu');
      return;
    }

    setIsSaving(true);
    try {
      const periodLabel = getIndonesianMonthLabel(selectedMonth);
      const docRef = doc(db, 'class_report_summaries', docId);

      // Re-map order just in case
      const finalizedItems = reportItems.map((item, idx) => ({
        id: item.id || `item_${Date.now()}_${idx}`,
        order: idx,
        category: item.category,
        title: item.title,
        summary: item.summary
      }));

      const payload: ClassReportSummary = {
        unit: 'JUNIOR_HIGH',
        reportType: 'MONTHLY_PROGRESS',
        classId: selectedClassId,
        academicYear: selectedYear,
        semester: selectedSemester,
        periodKey: selectedMonth,
        periodLabel,
        sections: {
          learningJourney: {
            title: learningTitle,
            summary: learningSummary
          },
          weeklyLessonsAndUnitActivities: finalizedItems
        },
        status: targetStatus,
        createdBy: profile?.email || 'unknown',
        createdAt: new Date().toISOString(), // Fallback if setting newly
        updatedAt: new Date().toISOString()
      };

      // Merge with existing createdAt if available
      const existingSnap = await getDoc(docRef);
      if (existingSnap.exists()) {
        const existingData = existingSnap.data();
        payload.createdAt = existingData.createdAt || payload.createdAt;
      }

      await setDoc(docRef, payload);
      setDraftStatus(targetStatus);
      setReportItems(finalizedItems);

      if (targetStatus === 'READY') {
        toast.success('Konten kelas berhasil ditandai SIAP untuk rapor!');
      } else {
        toast.success('Draft konten kelas berhasil disimpan.');
      }
    } catch (err) {
      console.error('Error saving report summary:', err);
      toast.error('Gagal menyimpan data');
    } finally {
      setIsSaving(false);
    }
  };

  // Add Item to list
  const handleAddItem = (category: 'WEEKLY_LESSON' | 'UNIT_ACTIVITY') => {
    const newItem: ReportItem = {
      id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      order: reportItems.length,
      category,
      title: '',
      summary: ''
    };
    setReportItems([...reportItems, newItem]);
    toast.success(`${category === 'WEEKLY_LESSON' ? 'Weekly Lesson' : 'Unit Activity'} ditambahkan`);
  };

  // Remove Item
  const handleRemoveItem = (id: string) => {
    const filtered = reportItems.filter(item => item.id !== id);
    // Reorder remaining items
    const reordered = filtered.map((item, index) => ({
      ...item,
      order: index
    }));
    setReportItems(reordered);
  };

  // Move Item Up or Down
  const handleMoveItem = (index: number, direction: 'UP' | 'DOWN') => {
    if (direction === 'UP' && index === 0) return;
    if (direction === 'DOWN' && index === reportItems.length - 1) return;

    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    const updated = [...reportItems];
    
    // Swap
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;

    // Recalculate orders
    const reordered = updated.map((item, idx) => ({
      ...item,
      order: idx
    }));

    setReportItems(reordered);
  };

  // Handle Item Input changes
  const handleItemChange = (id: string, field: 'title' | 'summary' | 'category', value: string) => {
    const updated = reportItems.map(item => {
      if (item.id === id) {
        return { ...item, [field]: value };
      }
      return item;
    });
    setReportItems(updated);
  };

  const selectedClassObj = classesList.find(c => c.id === selectedClassId);

  return (
    <div id="monthly-report-summary-page" className="min-h-screen bg-slate-50/50 p-6">
      {/* Header Area */}
      <div className="mx-auto max-w-6xl mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#002366]/10 text-[#002366] border border-[#002366]/20">
                JUNIOR HIGH ONLY
              </span>
              <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                <Sparkles size={12} /> Phase 1 Foundation
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <FileText className="text-[#002366]" size={26} />
              Workspace Rapor Bulanan Kelas (Summary)
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Kelola ringkasan pembelajaran kelas dan aktivitas unit bulanan yang akan diterapkan ke seluruh siswa kelas terpilih.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-center">
            <button
              onClick={loadDraft}
              disabled={isLoadingDraft || isSaving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
              title="Memuat ulang data dari database"
            >
              <RefreshCw size={15} className={isLoadingDraft ? 'animate-spin' : ''} />
              Muat Ulang
            </button>
          </div>
        </div>
      </div>

      {/* Control Panel Filter Card */}
      <div className="mx-auto max-w-6xl bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
              <Calendar size={13} className="text-[#002366]" /> Tahun Ajaran
            </label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full text-sm rounded-lg border-slate-200 focus:border-[#002366] focus:ring-[#002366] py-2 bg-slate-50/50"
            >
              <option value="2025/2026">2025/2026</option>
              <option value="2026/2027">2026/2027</option>
              <option value="2027/2028">2027/2028</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Semester
            </label>
            <div className="grid grid-cols-2 gap-2">
              {['1', '2'].map((sem) => (
                <button
                  key={sem}
                  onClick={() => setSelectedSemester(sem)}
                  className={`py-2 text-sm font-semibold rounded-lg border transition-all ${
                    selectedSemester === sem
                      ? 'bg-[#002366] text-white border-[#002366] shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Sem {sem}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
              <Calendar size={13} className="text-[#002366]" /> Periode Bulan
            </label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full text-sm rounded-lg border-slate-200 focus:border-[#002366] focus:ring-[#002366] py-1.5 bg-slate-50/50"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
              <Users size={13} className="text-[#002366]" /> Kelas Junior High
            </label>
            {loadingClasses ? (
              <div className="h-10 flex items-center px-3 bg-slate-50 rounded-lg text-xs text-slate-400">
                <RefreshCw size={14} className="animate-spin mr-2 text-slate-400" />
                Memuat kelas...
              </div>
            ) : (
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="w-full text-sm rounded-lg border-slate-200 focus:border-[#002366] focus:ring-[#002366] py-2 bg-slate-50/50 font-medium"
              >
                <option value="" disabled>-- Pilih Kelas --</option>
                {classesList.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Selected Summary Metadata */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-4 pt-4 border-t border-slate-100 text-xs text-slate-500">
          <div>
            Kelas Terpilih: <strong className="text-slate-800">{selectedClassObj?.name || '-'}</strong>
          </div>
          <div>
            Periode: <strong className="text-slate-800">{selectedMonth ? getIndonesianMonthLabel(selectedMonth) : '-'}</strong>
          </div>
          <div>
            Tahun Ajaran/Sem: <strong className="text-slate-800">{selectedYear} (Semester {selectedSemester})</strong>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span>Status Draft:</span>
            {draftStatus === 'READY' ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Check size={12} /> SIAP UNTUK RAPOR
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                DRAFT
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Workspace Workspace */}
      <div className="mx-auto max-w-6xl">
        {isLoadingDraft ? (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-12 text-center flex flex-col items-center justify-center">
            <RefreshCw size={32} className="animate-spin text-[#002366] mb-3" />
            <p className="text-slate-600 font-medium">Memuat data dari database...</p>
            <p className="text-xs text-slate-400 mt-1">Harap tunggu sebentar</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 1. Learning Journey Card */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-4 flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-[#002366]/5 text-[#002366]">
                  <BookOpen size={18} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800">1. Learning Journey (Perjalanan Pembelajaran)</h2>
                  <p className="text-xs text-slate-500">Judul utama dan ringkasan aktivitas akademik/proyek sepanjang bulan ini.</p>
                </div>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Judul Perjalanan Pembelajaran <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={learningTitle}
                    onChange={(e) => setLearningTitle(e.target.value)}
                    placeholder="Contoh: Eksplorasi Sains & Desain Kreatif"
                    className="w-full rounded-lg border-slate-200 focus:border-[#002366] focus:ring-[#002366] text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Ringkasan Narasi <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    value={learningSummary}
                    onChange={(e) => setLearningSummary(e.target.value)}
                    rows={4}
                    placeholder="Berikan gambaran lengkap petualangan belajar kelas di bulan ini..."
                    className="w-full rounded-lg border-slate-200 focus:border-[#002366] focus:ring-[#002366] text-sm"
                  />
                </div>
              </div>
            </div>

            {/* 2. Weekly Lessons & Unit Activity Card */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-[#002366]/5 text-[#002366]">
                    <Layers size={18} />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-800">2. Weekly Lessons & Unit Activity (Pembelajaran & Unit Aktivitas)</h2>
                    <p className="text-xs text-slate-500">Kelola dan urutkan aktivitas mingguan atau program khusus kelas.</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    onClick={() => handleAddItem('WEEKLY_LESSON')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#002366] text-xs font-semibold border border-blue-200 transition-colors"
                  >
                    <Plus size={14} /> + Lesson
                  </button>
                  <button
                    onClick={() => handleAddItem('UNIT_ACTIVITY')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-semibold border border-purple-200 transition-colors"
                  >
                    <Plus size={14} /> + Unit Activity
                  </button>
                </div>
              </div>

              <div className="p-5">
                {reportItems.length === 0 ? (
                  <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center bg-slate-50/30">
                    <Info size={28} className="mx-auto text-slate-400 mb-2" />
                    <p className="text-sm font-semibold text-slate-600">Belum ada item ditambahkan</p>
                    <p className="text-xs text-slate-400 mt-1 mb-4">Tambahkan setidaknya satu item Weekly Lesson atau Unit Activity menggunakan tombol di kanan atas.</p>
                    <div className="flex items-center justify-center gap-3">
                      <button
                        onClick={() => handleAddItem('WEEKLY_LESSON')}
                        className="flex items-center gap-1 px-4 py-2 rounded-lg bg-[#002366] text-white text-xs font-semibold hover:bg-[#002366]/90 transition-all"
                      >
                        <Plus size={14} /> Tambah Weekly Lesson
                      </button>
                      <button
                        onClick={() => handleAddItem('UNIT_ACTIVITY')}
                        className="flex items-center gap-1 px-4 py-2 rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 transition-all"
                      >
                        <Plus size={14} /> Tambah Unit Activity
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <AnimatePresence initial={false}>
                      {reportItems.map((item, index) => (
                        <motion.div
                          key={item.id}
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.18 }}
                          className={`border rounded-xl shadow-xs overflow-hidden transition-all ${
                            item.category === 'WEEKLY_LESSON' ? 'border-blue-100' : 'border-purple-100'
                          }`}
                        >
                          {/* Item Header Control panel */}
                          <div className={`px-4 py-2.5 flex items-center justify-between border-b ${
                            item.category === 'WEEKLY_LESSON' ? 'bg-blue-50/40 border-blue-100' : 'bg-purple-50/30 border-purple-100'
                          }`}>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-400">#{index + 1}</span>
                              {item.category === 'WEEKLY_LESSON' ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                                  WEEKLY LESSON
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                                  UNIT ACTIVITY
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5">
                              {/* Reordering actions */}
                              <button
                                onClick={() => handleMoveItem(index, 'UP')}
                                disabled={index === 0}
                                className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 transition-colors"
                                title="Pindahkan ke atas"
                              >
                                <ChevronUp size={16} />
                              </button>
                              <button
                                onClick={() => handleMoveItem(index, 'DOWN')}
                                disabled={index === reportItems.length - 1}
                                className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 transition-colors"
                                title="Pindahkan ke bawah"
                              >
                                <ChevronDown size={16} />
                              </button>
                              <div className="w-px h-4 bg-slate-200 mx-1" />
                              <button
                                onClick={() => handleRemoveItem(item.id)}
                                className="p-1 rounded-md text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                                title="Hapus item"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>

                          {/* Item Inputs */}
                          <div className="p-4 bg-white grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="md:col-span-1">
                              <label className="block text-xs font-semibold text-slate-600 mb-1">
                                Kategori
                              </label>
                              <select
                                value={item.category}
                                onChange={(e) => handleItemChange(item.id, 'category', e.target.value)}
                                className="w-full text-xs rounded-lg border-slate-200 focus:border-[#002366] focus:ring-[#002366] py-1.5 bg-slate-50/50"
                              >
                                <option value="WEEKLY_LESSON">Weekly Lesson</option>
                                <option value="UNIT_ACTIVITY">Unit Activity</option>
                              </select>

                              <div className="mt-3">
                                <label className="block text-xs font-semibold text-slate-600 mb-1">
                                  Judul Aktivitas <span className="text-rose-500">*</span>
                                </label>
                                <input
                                  type="text"
                                  value={item.title}
                                  onChange={(e) => handleItemChange(item.id, 'title', e.target.value)}
                                  placeholder="Contoh: Minggu 1: Introduction"
                                  className="w-full text-xs rounded-lg border-slate-200 focus:border-[#002366] focus:ring-[#002366] py-1.5"
                                />
                              </div>
                            </div>

                            <div className="md:col-span-2">
                              <label className="block text-xs font-semibold text-slate-600 mb-1">
                                Ringkasan Pembelajaran / Aktivitas <span className="text-rose-500">*</span>
                              </label>
                              <textarea
                                value={item.summary}
                                onChange={(e) => handleItemChange(item.id, 'summary', e.target.value)}
                                rows={4}
                                placeholder="Tuliskan ringkasan detail aktivitas yang dilakukan pada minggu atau unit ini..."
                                className="w-full text-xs rounded-lg border-slate-200 focus:border-[#002366] focus:ring-[#002366]"
                              />
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Actions Area */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-xs p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <AlertCircle size={15} className="text-[#002366]" />
                <span>Harap simpan draft secara berkala. Perubahan belum tersimpan sampai Anda menekan tombol simpan.</span>
              </div>

              <div className="flex items-center gap-3 justify-end">
                <button
                  onClick={() => handleSave('DRAFT')}
                  disabled={isSaving || isLoadingDraft}
                  className="flex items-center gap-1.5 px-6 py-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 transition-all disabled:opacity-50"
                >
                  <Save size={16} />
                  {isSaving ? 'Menyimpan...' : 'Simpan Draft'}
                </button>

                <button
                  onClick={() => handleSave('READY')}
                  disabled={isSaving || isLoadingDraft || !learningTitle || reportItems.some(i => !i.title)}
                  className="flex items-center gap-1.5 px-6 py-2.5 rounded-lg bg-[#002366] hover:bg-[#002366]/90 text-white text-sm font-semibold shadow-sm transition-all disabled:opacity-50"
                  title={(!learningTitle || reportItems.some(i => !i.title)) ? "Lengkapi judul Learning Journey & judul semua item untuk menandai siap." : ""}
                >
                  <CheckCircle2 size={16} />
                  {isSaving ? 'Menyimpan...' : 'Tandai Siap untuk Rapor'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
