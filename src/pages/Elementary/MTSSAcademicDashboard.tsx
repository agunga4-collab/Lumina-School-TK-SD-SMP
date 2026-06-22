import React, { useState } from 'react';
import { useMTSSCases } from '../../hooks/useMTSSCases';
import MTSSCaseTable from './components/MTSSCaseTable';
import CoachingLogDrawer from './components/CoachingLogDrawer';
import { 
  GraduationCap, 
  Sparkles, 
  Search, 
  RefreshCw, 
  Award, 
  ShieldAlert, 
  Layers, 
  TrendingUp, 
  BookOpen, 
  MessageSquare,
  HelpCircle,
  FileSpreadsheet
} from 'lucide-react';
import { toast } from 'sonner';

export default function MTSSAcademicDashboard() {
  const { cases, loading, error } = useMTSSCases();
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [subjectFilter, setSubjectFilter] = useState<string>('All');
  const [tierFilter, setTierFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('Active'); // Default show Active first

  // Drawer states
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [selectedCase, setSelectedCase] = useState<{
    id: string;
    studentName: string;
    subject: string;
    tier: string;
  } | null>(null);

  // Trigger state refresh for table
  const [refreshKey, setRefreshKey] = useState<number>(0);

  const triggerRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  const handleOpenCoaching = (caseId: string, studentName: string, subject: string, tier: string) => {
    setSelectedCase({ id: caseId, studentName, subject, tier });
    setDrawerOpen(true);
  };

  // Stats calculation
  const stats = React.useMemo(() => {
    const total = cases.length;
    const active = cases.filter(c => c.status === 'Active' || !c.status).length;
    const achieved = cases.filter(c => c.status === 'Achieved').length;
    const tier2 = cases.filter(c => c.tier === 'Tier 2').length;
    const tier3 = cases.filter(c => c.tier === 'Tier 3').length;
    const sn = cases.filter(c => c.tier === 'SN').length;

    // Subjects counts
    const bahasaCount = cases.filter(c => c.subject === 'Bahasa Indonesia' && c.status !== 'Achieved').length;
    const englishCount = cases.filter(c => c.subject === 'English' && c.status !== 'Achieved').length;
    const numeracyCount = cases.filter(c => c.subject === 'Numeracy' && c.status !== 'Achieved').length;
    const mengajiCount = cases.filter(c => c.subject === 'Mengaji' && c.status !== 'Achieved').length;

    return {
      total,
      active,
      achieved,
      tier2,
      tier3,
      sn,
      subjects: {
        'Bahasa Indonesia': bahasaCount,
        'English': englishCount,
        'Numeracy': numeracyCount,
        'Mengaji': mengajiCount
      }
    };
  }, [cases, refreshKey]);

  // Filter logic
  const filteredCases = React.useMemo(() => {
    return cases.filter((c) => {
      const matchSearch = c.studentName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          c.studentId?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchSubject = subjectFilter === 'All' || c.subject === subjectFilter;
      const matchTier = tierFilter === 'All' || c.tier === tierFilter;
      
      const realStatus = c.status || 'Active';
      const matchStatus = statusFilter === 'All' || realStatus === statusFilter;

      return matchSearch && matchSubject && matchTier && matchStatus;
    });
  }, [cases, searchTerm, subjectFilter, tierFilter, statusFilter, refreshKey]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
      {/* HEADER SECTION */}
      <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-indigo-950 rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden shadow-lg border border-teal-800/40">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 bg-teal-500/10 w-96 h-96 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -translate-x-12 translate-y-12 bg-indigo-500/10 w-96 h-96 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 text-[10px] font-black uppercase tracking-wider">
              <Sparkles size={12} />
              SD Unit - Lazuardi GIS
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight flex items-center gap-2">
              <GraduationCap size={28} className="text-emerald-400" />
              MTSS Academic Elementary
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm font-medium max-w-2xl leading-relaxed">
              Pusat monitoring dan intervensi kustom akademis siswa SD Lazuardi. Siswa yang memperoleh rekomendasi <b>Tier 2 (Monitor)</b>, <b>Tier 3 (Needs Support)</b>, atau <b>SN</b> pada evaluasi berkala otomatis masuk ke dalam sistem kasus ini.
            </p>
          </div>
          <button
            onClick={() => {
              triggerRefresh();
              toast.success('Melakukan refresh sinkronisasi data kasus');
            }}
            className="self-start md:self-auto flex items-center gap-1.5 bg-white/10 hover:bg-white/20 border border-white/10 hover:border-white/20 text-white rounded-2xl px-4 py-2 text-xs font-bold transition-all cursor-pointer shadow-sm shrink-0"
          >
            <RefreshCw size={14} />
            Refresh Sinkronisasi
          </button>
        </div>
      </div>

      {/* QUICK BENTO STATISTICS SECTION */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Active Cases */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/60 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl border border-rose-100">
            <ShieldAlert size={22} />
          </div>
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-black tracking-widest text-slate-400">Kasus Aktif</span>
            <h3 className="text-xl font-extrabold text-slate-800">{stats.active} Kasus</h3>
            <p className="text-[10px] text-slate-450 font-bold">Butuh pantauan berkala</p>
          </div>
        </div>

        {/* Tier 2 (Monitor) count */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/60 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl border border-amber-100">
            <Layers size={22} />
          </div>
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-black tracking-widest text-slate-400">Tier 2 (Monitor)</span>
            <h3 className="text-xl font-extrabold text-slate-800">{stats.tier2} Siswa</h3>
            <p className="text-[10px] text-slate-450 font-bold">Intervensi terfokus</p>
          </div>
        </div>

        {/* Tier 3 (Needs Support) count */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/60 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-red-50 text-red-605 rounded-2xl border border-red-100">
            <TrendingUp size={22} />
          </div>
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-black tracking-widest text-slate-400">Tier 3 (Intensif)</span>
            <h3 className="text-xl font-extrabold text-slate-800">{stats.tier3} Siswa</h3>
            <p className="text-[10px] text-slate-450 font-bold">Bimbingan harian individual</p>
          </div>
        </div>

        {/* Improved students */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/60 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100">
            <Award size={22} />
          </div>
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-black tracking-widest text-slate-400">Lulus / Achieved</span>
            <h3 className="text-xl font-extrabold text-slate-800">{stats.achieved} Kasus</h3>
            <p className="text-[10px] text-slate-450 font-bold">Kembali ke Tier 1 (On track)</p>
          </div>
        </div>
      </div>

      {/* STATISTICS BY SUBJECT DOMAIN */}
      <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5">
        <h3 className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
          <BookOpen size={12} className="text-indigo-500" />
          Distribusi Kasus Aktif per Area Pembelajaran
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(stats.subjects).map(([subject, count]) => (
            <div key={subject} className="bg-white rounded-2xl p-4 border border-slate-100/80 shadow-sm flex flex-col justify-center">
              <span className="text-[10px] font-bold text-slate-550 mb-0.5">{subject}</span>
              <div className="flex items-baseline justify-between">
                <span className="text-xl font-black text-slate-800">{count}</span>
                <span className="text-[9px] font-bold text-slate-450">siswa aktif</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SEARCH AND FILTERS TOOLBAR */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <span className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
            <FileSpreadsheet size={14} className="text-emerald-600" />
            Pengaturan Saringan Kasus ({filteredCases.length})
          </span>
          <div className="relative w-full md:w-80">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama atau ID siswa..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 hover:bg-slate-50 border border-slate-250 hover:border-slate-350 focus:border-indigo-500 rounded-xl py-2 pl-10 pr-4 text-xs font-semibold focus:outline-none transition-all text-slate-800"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          {/* Filter Subject */}
          <div>
            <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">
              Bidang Studi
            </label>
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-250 rounded-xl py-2 px-3 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-750 cursor-pointer"
            >
              <option value="All">Semua Bidang Studi</option>
              <option value="Bahasa Indonesia">Bahasa Indonesia</option>
              <option value="English">English</option>
              <option value="Numeracy">Numeracy</option>
              <option value="Mengaji">Mengaji</option>
            </select>
          </div>

          {/* Filter Tier */}
          <div>
            <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">
              Rekomendasi Tier
            </label>
            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-250 rounded-xl py-2 px-3 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-750 cursor-pointer"
            >
              <option value="All">Semua Tingkat Tier</option>
              <option value="Tier 2">Tier 2 (Monitor)</option>
              <option value="Tier 3">Tier 3 (Intensif)</option>
              <option value="SN">SN (Special Needs)</option>
            </select>
          </div>

          {/* Filter Status */}
          <div>
            <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">
              Status Kasus
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-250 rounded-xl py-2 px-3 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-750 cursor-pointer"
            >
              <option value="All">Semua Status</option>
              <option value="Active">🔴 Active Case</option>
              <option value="Achieved">🟢 Lulus (Achieved)</option>
            </select>
          </div>
        </div>
      </div>

      {/* CASE TABLE */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-20 gap-3 border border-slate-100 rounded-3xl bg-white shadow-sm">
          <RefreshCw size={28} className="text-slate-400 animate-spin" />
          <span className="text-xs text-slate-500 italic">Memuat daftar kasus MTSS...</span>
        </div>
      ) : error ? (
        <div className="bg-red-50 text-red-700 p-6 rounded-3xl border border-red-200">
          <p className="font-bold text-sm">Gagal Sinkronisasi Kasus MTSS</p>
          <p className="text-xs mt-1">{error}</p>
        </div>
      ) : (
        <MTSSCaseTable 
          cases={filteredCases} 
          onLogCoaching={handleOpenCoaching} 
          onRefresh={triggerRefresh}
        />
      )}

      {/* COACHING LOGGER DRAWER */}
      {selectedCase && (
        <CoachingLogDrawer
          isOpen={drawerOpen}
          caseId={selectedCase.id}
          studentName={selectedCase.studentName}
          subject={selectedCase.subject}
          tier={selectedCase.tier}
          onClose={() => {
            setDrawerOpen(false);
            setSelectedCase(null);
          }}
          onSessionLogged={triggerRefresh}
        />
      )}
    </div>
  );
}
