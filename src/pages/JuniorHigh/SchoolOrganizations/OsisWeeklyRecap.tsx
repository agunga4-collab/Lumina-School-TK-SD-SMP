import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileText,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  AlertCircle,
  Eye,
  RefreshCw,
  Users,
  ChevronRight,
  X,
  Calendar,
  Layers,
  Crown,
  Sparkles,
  Info,
  BookOpen,
  ArrowUpRight
} from 'lucide-react';
import { toast } from 'sonner';
import { Class, Student } from '../../../types';
import {
  SOGroup,
  SOMembership,
  SOWeeklyReport,
  DesignTeamOption
} from '../../../types/schoolOrganizations';
import {
  getAllWeeklyReportsByYear,
  makeGroupId
} from '../../../services/juniorHighSchoolOrganizationsService';
import {
  OSIS_START_WEEK,
  OsisWeekPeriod,
  getOsisWeekPeriods,
  getWeekDeadlineUtcMs,
  formatWibDateTime,
  formatWeekLabel,
  isMemberObligatedForOsisWeek
} from '../../../utils/wibWeekHelper';

export interface OsisWeeklyRecapProps {
  academicYear: string;
  groups: SOGroup[];
  memberships: SOMembership[];
  designTeams: DesignTeamOption[];
  classes: Class[];
  allStudents?: Student[];
  onRefreshParent?: () => void;
}

export type FillingStatus = 'SUBMITTED' | 'DRAFT' | 'BELUM_MENGISI';
export type TimelinessStatus = 'ON_TIME' | 'LATE' | 'PENDING' | 'OVERDUE';

export interface ObligationRow {
  key: string; // `${groupId}_${studentId}`
  groupId: string;
  groupName: string;
  isExecutive: boolean;
  studentId: string; // NIS
  studentName: string;
  classId: string;
  className: string;
  roleTitle: string;
  membership: SOMembership;
  report: SOWeeklyReport | null;
  allReports: SOWeeklyReport[]; // In case of duplicate documents
  hasConflict: boolean;
  status: FillingStatus;
  submittedAtStr: string;
  timelinessStatus: TimelinessStatus;
  timelinessLabel: string;
  isRead: boolean;
  readByName: string;
  readAtStr: string;
}

export const OsisWeeklyRecap: React.FC<OsisWeeklyRecapProps> = ({
  academicYear,
  groups,
  memberships,
  designTeams,
  classes,
  onRefreshParent,
}) => {
  // 1. Periods (only >= 2026-10-19)
  const weekPeriods: OsisWeekPeriod[] = useMemo(() => {
    return getOsisWeekPeriods();
  }, []);

  // Default to current week, or the first available period
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>(() => {
    const current = weekPeriods.find(w => w.isCurrent);
    return current ? current.weekStart : (weekPeriods[0]?.weekStart || OSIS_START_WEEK);
  });

  // Filters
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('ALL');
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Weekly reports from Firestore
  const [reports, setReports] = useState<SOWeeklyReport[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState<boolean>(true);
  const [reportError, setReportError] = useState<string | null>(null);

  // Modal view report (strictly read-only)
  const [viewingRow, setViewingRow] = useState<ObligationRow | null>(null);

  // Selected period info
  const selectedPeriod = useMemo(() => {
    return weekPeriods.find(w => w.weekStart === selectedWeekStart) || weekPeriods[0];
  }, [weekPeriods, selectedWeekStart]);

  // Fetch weekly reports for selected week
  const loadReportsForWeek = useCallback(async (weekStart: string) => {
    if (!academicYear || !weekStart) return;
    setIsLoadingReports(true);
    setReportError(null);

    try {
      // Mengambil laporan mingguan seluruh siswa Junior High untuk tahun ajaran & minggu terpilih
      // Service mendukung normalisasi format tahun ajaran ('/' vs '-') secara otomatis
      const fetched = await getAllWeeklyReportsByYear(academicYear, weekStart);
      setReports(fetched);
    } catch (err: any) {
      console.error('Gagal memuat laporan mingguan OSIS:', err);
      const isPermission =
        err?.code === 'permission-denied' ||
        err?.message?.includes('permission') ||
        err?.message?.includes('Missing or insufficient');
      const msg = isPermission
        ? 'Akses ditolak (Missing or insufficient permissions) saat memuat laporan mingguan. Pastikan akun memiliki peran staf Junior High.'
        : (err?.message || 'Gagal memuat laporan mingguan.');
      setReportError(msg);
      toast.error(msg);
    } finally {
      setIsLoadingReports(false);
    }
  }, [academicYear]);

  useEffect(() => {
    loadReportsForWeek(selectedWeekStart);
  }, [loadReportsForWeek, selectedWeekStart]);

  // Map OSIS groups
  const osisGroupsMap = useMemo(() => {
    const map = new Map<string, SOGroup>();
    // Executive group
    const execId = makeGroupId(academicYear, 'OSIS', 'executive');
    map.set(execId, {
      id: execId,
      academicYear,
      programType: 'OSIS',
      name: 'Pengurus Inti OSIS',
      categoryOrSubtype: 'EXECUTIVE',
      mentorUids: [],
      mentorNames: [],
      currentStage: 'Aktif',
      status: 'active',
      createdAt: '',
      createdBy: '',
      updatedAt: '',
      updatedBy: ''
    });

    // Master design teams
    (designTeams || []).forEach(dt => {
      const dtId = makeGroupId(academicYear, 'OSIS', dt.id);
      map.set(dtId, {
        id: dtId,
        academicYear,
        programType: 'OSIS',
        name: dt.name,
        categoryOrSubtype: 'DESIGN_TEAM',
        mentorUids: [],
        mentorNames: [],
        currentStage: 'Aktif',
        status: 'active',
        createdAt: '',
        createdBy: '',
        updatedAt: '',
        updatedBy: ''
      });
    });

    // Merge any existing groups from props
    groups.forEach(g => {
      if (g.programType === 'OSIS') {
        map.set(g.id, g);
      }
    });

    return map;
  }, [academicYear, designTeams, groups]);

  // Build list of valid obligations and match with reports
  const allObligations: ObligationRow[] = useMemo(() => {
    // 1. Ambil keanggotaan aktif yang relevan dengan OSIS
    const osisGroupIds = new Set(Array.from(osisGroupsMap.keys()));
    const rawOsisMembers = memberships.filter(m => {
      if (m.status !== 'ACTIVE') return false;
      return m.programType === 'OSIS' || osisGroupIds.has(m.groupId);
    });

    // 2. Cegah duplikasi pasangan (groupId + studentId) yang sama
    const uniqueMembershipMap = new Map<string, SOMembership>();
    rawOsisMembers.forEach(m => {
      const pairKey = `${m.groupId}_${(m.studentId || '').trim()}`;
      if (!uniqueMembershipMap.has(pairKey)) {
        uniqueMembershipMap.set(pairKey, m);
      }
    });

    // 3. Petakan laporan yang masuk berdasarkan `${groupId}_${studentId}_${weekStart}`
    // Jika ada lebih dari satu dokumen untuk kunci yang sama, catat sebagai konflik ganda
    const reportsByKey = new Map<string, SOWeeklyReport[]>();
    reports.forEach(r => {
      // Pastikan laporan terkait OSIS
      if (r.programType === 'OSIS' || osisGroupIds.has(r.groupId)) {
        const rKey = `${r.groupId}_${(r.studentId || '').trim()}_${(r.weekStart || '').trim()}`;
        const existingList = reportsByKey.get(rKey) || [];
        existingList.push(r);
        reportsByKey.set(rKey, existingList);
      }
    });

    const deadlineMs = getWeekDeadlineUtcMs(selectedWeekStart);
    const nowMs = Date.now();

    const rows: ObligationRow[] = [];

    uniqueMembershipMap.forEach((membership, pairKey) => {
      // Aturan tanggal bergabung: Jangan mewajibkan minggu sebelum anggota bergabung
      const isObligated = isMemberObligatedForOsisWeek(
        membership.joinedAt,
        membership.createdAt,
        selectedWeekStart
      );

      if (!isObligated) {
        return; // Anggota belum bergabung pada minggu ini
      }

      const group = osisGroupsMap.get(membership.groupId);
      const groupName = group?.name || 'OSIS Team';
      const isExecutive = group?.categoryOrSubtype === 'EXECUTIVE' || membership.groupId.includes('_executive');

      const reportLookupKey = `${membership.groupId}_${(membership.studentId || '').trim()}_${selectedWeekStart.trim()}`;
      const matchedReports = reportsByKey.get(reportLookupKey) || [];
      const hasConflict = matchedReports.length > 1;
      const primaryReport = matchedReports[0] || null;

      // Evaluasi status pengisian
      let status: FillingStatus = 'BELUM_MENGISI';
      if (primaryReport) {
        if (primaryReport.status === 'SUBMITTED') {
          status = 'SUBMITTED';
        } else if (primaryReport.status === 'DRAFT') {
          status = 'DRAFT';
        }
      }

      // Waktu pengiriman
      let submittedAtStr = '-';
      let submitTimeMs: number | null = null;
      if (primaryReport && status === 'SUBMITTED') {
        const rawSubmit = primaryReport.submittedAt || primaryReport.updatedAt;
        if (rawSubmit) {
          submittedAtStr = formatWibDateTime(rawSubmit);
          const t = new Date(rawSubmit).getTime();
          if (!isNaN(t)) submitTimeMs = t;
        }
      }

      // Evaluasi ketepatan waktu
      let timelinessStatus: TimelinessStatus = 'PENDING';
      let timelinessLabel = 'Dalam Batas Waktu';

      if (status === 'SUBMITTED') {
        // Penentuan keterlambatan harus memakai waktu pengiriman, bukan updatedAt/readAt
        if (submitTimeMs !== null && submitTimeMs > deadlineMs) {
          timelinessStatus = 'LATE';
          timelinessLabel = 'Terlambat';
        } else if (primaryReport?.isLate) {
          timelinessStatus = 'LATE';
          timelinessLabel = 'Terlambat';
        } else {
          timelinessStatus = 'ON_TIME';
          timelinessLabel = 'Tepat Waktu';
        }
      } else {
        // Belum mengirim (Draf atau Belum Mengisi)
        // "Sebelum deadline, yang belum mengirim jangan dilabeli terlambat"
        if (nowMs <= deadlineMs) {
          timelinessStatus = 'PENDING';
          timelinessLabel = 'Dalam Batas Waktu';
        } else {
          timelinessStatus = 'OVERDUE';
          timelinessLabel = 'Melewati Batas';
        }
      }

      // Status dibaca pembina (terpisah dari status pengiriman)
      const isRead = Boolean(primaryReport?.readAt);
      const readByName = primaryReport?.readByName || 'Pembina';
      const readAtStr = primaryReport?.readAt ? formatWibDateTime(primaryReport.readAt) : '-';

      rows.push({
        key: pairKey,
        groupId: membership.groupId,
        groupName,
        isExecutive,
        studentId: membership.studentId,
        studentName: membership.studentName,
        classId: membership.classId,
        className: membership.className || 'Junior High',
        roleTitle: membership.roleTitle || 'Anggota',
        membership,
        report: primaryReport,
        allReports: matchedReports,
        hasConflict,
        status,
        submittedAtStr,
        timelinessStatus,
        timelinessLabel,
        isRead,
        readByName,
        readAtStr
      });
    });

    // Urutkan: Pengurus inti lebih dulu, lalu nama tim, lalu nama siswa
    return rows.sort((a, b) => {
      if (a.isExecutive !== b.isExecutive) return a.isExecutive ? -1 : 1;
      const grp = a.groupName.localeCompare(b.groupName);
      if (grp !== 0) return grp;
      return (a.studentName || '').localeCompare(b.studentName || '');
    });
  }, [osisGroupsMap, memberships, reports, selectedWeekStart]);

  // Summary Metrics (Kalkulasi akurat sesuai aturan prompt)
  const summary = useMemo(() => {
    const totalObligations = allObligations.length;
    // Bedakan jumlah kewajiban dari jumlah siswa unik
    const uniqueStudentIds = new Set(allObligations.map(o => o.studentId));
    const uniqueStudentCount = uniqueStudentIds.size;

    const submittedCount = allObligations.filter(o => o.status === 'SUBMITTED').length;
    const draftCount = allObligations.filter(o => o.status === 'DRAFT').length;
    const unfilledCount = allObligations.filter(o => o.status === 'BELUM_MENGISI').length;
    // Terkirim terlambat: hanya kewajiban yang SUBMITTED tetapi dikirim setelah deadline
    const lateSubmittedCount = allObligations.filter(
      o => o.status === 'SUBMITTED' && o.timelinessStatus === 'LATE'
    ).length;

    // Persentase = kewajiban yang SUBMITTED / total kewajiban yang valid. Tangani penyebut nol.
    const percentage = totalObligations > 0
      ? Math.round((submittedCount / totalObligations) * 100)
      : 0;

    return {
      totalObligations,
      uniqueStudentCount,
      submittedCount,
      draftCount,
      unfilledCount,
      lateSubmittedCount,
      percentage
    };
  }, [allObligations]);

  // Distinct groups & classes for filters
  const filterGroupOptions = useMemo(() => {
    const set = new Map<string, string>();
    allObligations.forEach(o => {
      set.set(o.groupId, o.groupName);
    });
    return Array.from(set.entries()).map(([id, name]) => ({ id, name }));
  }, [allObligations]);

  const filterClassOptions = useMemo(() => {
    const set = new Set<string>();
    allObligations.forEach(o => {
      if (o.className) set.add(o.className);
    });
    return Array.from(set).sort();
  }, [allObligations]);

  // Filtered rows for the table
  const filteredRows = useMemo(() => {
    return allObligations.filter(row => {
      // Filter Tim
      if (selectedGroupFilter !== 'ALL' && row.groupId !== selectedGroupFilter) {
        return false;
      }
      // Filter Kelas
      if (selectedClassFilter !== 'ALL' && row.className !== selectedClassFilter) {
        return false;
      }
      // Filter Status
      if (selectedStatusFilter !== 'ALL' && row.status !== selectedStatusFilter) {
        return false;
      }
      // Pencarian Nama / NIS
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = row.studentName.toLowerCase().includes(q);
        const matchNis = (row.studentId || '').toLowerCase().includes(q);
        const matchRole = row.roleTitle.toLowerCase().includes(q);
        if (!matchName && !matchNis && !matchRole) {
          return false;
        }
      }
      return true;
    });
  }, [allObligations, selectedGroupFilter, selectedClassFilter, selectedStatusFilter, searchQuery]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Controls & Filter Bar */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-gray-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 text-blue-700 rounded-xl border border-blue-100">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-gray-900">
                  Rekap Laporan Mingguan OSIS & Design Team
                </h2>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-blue-100 text-blue-800">
                  {academicYear}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Pantau pengiriman laporan seluruh pengurus inti dan anggota Design Team per periode minggu.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Week Selector */}
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-gray-200">
              <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="text-xs font-semibold text-gray-600">Minggu:</span>
              <select
                value={selectedWeekStart}
                onChange={e => setSelectedWeekStart(e.target.value)}
                className="bg-transparent text-xs font-bold text-gray-900 focus:outline-hidden cursor-pointer"
              >
                {weekPeriods.map(wp => (
                  <option key={wp.weekStart} value={wp.weekStart}>
                    {wp.label} {wp.isCurrent ? '(Minggu Berjalan)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Refresh button */}
            <button
              onClick={() => {
                loadReportsForWeek(selectedWeekStart);
                if (onRefreshParent) onRefreshParent();
              }}
              disabled={isLoadingReports}
              className="p-2 text-gray-600 hover:text-gray-900 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 shadow-2xs transition-all disabled:opacity-50"
              title="Perbarui data rekap"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingReports ? 'animate-spin text-blue-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* Selected Period Info Banner */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600 bg-blue-50/40 px-3.5 py-2 rounded-xl border border-blue-100">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              Periode Laporan: <strong>{selectedPeriod?.label}</strong> (Senin s/d Minggu WIB).
            </span>
          </div>
          <div className="text-[11px] text-gray-500">
            Batas Pengiriman Tepat Waktu: <strong>{selectedPeriod?.deadlineWibString}</strong>
          </div>
        </div>

        {/* Filters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
          {/* Filter Tim */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">
              Tim / Bidang
            </label>
            <select
              value={selectedGroupFilter}
              onChange={e => setSelectedGroupFilter(e.target.value)}
              className="w-full text-xs font-medium border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">Semua Tim OSIS</option>
              {filterGroupOptions.map(g => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          {/* Filter Kelas */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">
              Kelas
            </label>
            <select
              value={selectedClassFilter}
              onChange={e => setSelectedClassFilter(e.target.value)}
              className="w-full text-xs font-medium border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">Semua Kelas</option>
              {filterClassOptions.map(clsName => (
                <option key={clsName} value={clsName}>
                  Kelas {clsName}
                </option>
              ))}
            </select>
          </div>

          {/* Filter Status Pengisian */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">
              Status Pengisian
            </label>
            <select
              value={selectedStatusFilter}
              onChange={e => setSelectedStatusFilter(e.target.value)}
              className="w-full text-xs font-medium border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">Semua Status</option>
              <option value="SUBMITTED">Sudah Terkirim</option>
              <option value="DRAFT">Masih Draf</option>
              <option value="BELUM_MENGISI">Belum Mengisi</option>
            </select>
          </div>

          {/* Pencarian Nama / NIS */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">
              Cari Siswa / NIS
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Ketik nama atau NIS..."
                className="w-full text-xs font-medium border border-gray-200 rounded-xl pl-8 pr-8 py-2 bg-white text-gray-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500 placeholder-gray-400"
              />
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards (Metric Stats) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Kewajiban */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-2xs">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            Total Kewajiban
          </p>
          <p className="text-2xl font-black text-gray-900 mt-1">
            {summary.totalObligations}
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Dari <strong>{summary.uniqueStudentCount}</strong> siswa unik
          </p>
        </div>

        {/* Sudah Terkirim */}
        <div className="bg-emerald-50/50 border border-emerald-200 rounded-2xl p-4 shadow-2xs">
          <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider flex items-center justify-between">
            <span>Sudah Terkirim</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          </p>
          <p className="text-2xl font-black text-emerald-950 mt-1">
            {summary.submittedCount}
          </p>
          <p className="text-[11px] text-emerald-700 mt-0.5">
            {summary.percentage}% dari total kewajiban
          </p>
        </div>

        {/* Masih Draf */}
        <div className="bg-amber-50/50 border border-amber-200 rounded-2xl p-4 shadow-2xs">
          <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider flex items-center justify-between">
            <span>Masih Draf</span>
            <Clock className="w-3.5 h-3.5 text-amber-600" />
          </p>
          <p className="text-2xl font-black text-amber-950 mt-1">
            {summary.draftCount}
          </p>
          <p className="text-[11px] text-amber-700 mt-0.5">
            Belum disubmit siswa
          </p>
        </div>

        {/* Belum Mengisi */}
        <div className="bg-rose-50/50 border border-rose-200 rounded-2xl p-4 shadow-2xs">
          <p className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider flex items-center justify-between">
            <span>Belum Mengisi</span>
            <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
          </p>
          <p className="text-2xl font-black text-rose-950 mt-1">
            {summary.unfilledCount}
          </p>
          <p className="text-[11px] text-rose-700 mt-0.5">
            Tanpa draf / kiriman
          </p>
        </div>

        {/* Terkirim Terlambat */}
        <div className="bg-orange-50/50 border border-orange-200 rounded-2xl p-4 shadow-2xs">
          <p className="text-[11px] font-semibold text-orange-700 uppercase tracking-wider flex items-center justify-between">
            <span>Kirim Terlambat</span>
            <AlertTriangle className="w-3.5 h-3.5 text-orange-600" />
          </p>
          <p className="text-2xl font-black text-orange-950 mt-1">
            {summary.lateSubmittedCount}
          </p>
          <p className="text-[11px] text-orange-700 mt-0.5">
            Lewat Senin 12.00 WIB
          </p>
        </div>

        {/* Persentase Pengiriman */}
        <div className="bg-blue-50/50 border border-blue-200 rounded-2xl p-4 shadow-2xs flex flex-col justify-between">
          <div>
            <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider">
              Persentase
            </p>
            <p className="text-2xl font-black text-blue-950 mt-1">
              {summary.percentage}%
            </p>
          </div>
          <div className="w-full bg-blue-200 h-1.5 rounded-full overflow-hidden mt-2">
            <div
              className="bg-blue-600 h-full rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, summary.percentage))}%` }}
            />
          </div>
        </div>
      </div>

      {/* Error Alert if loading reports failed */}
      {reportError && (
        <div className="p-5 bg-red-50 border border-red-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-red-900">
                Gagal Memuat Laporan Mingguan
              </h4>
              <p className="text-xs text-red-700 mt-1">{reportError}</p>
              <p className="text-[11px] text-red-600 mt-0.5">
                Periksa hak akses guru Junior High. Kesalahan perizinan tidak dianggap sebagai nol laporan.
              </p>
            </div>
          </div>
          <button
            onClick={() => loadReportsForWeek(selectedWeekStart)}
            className="px-4 py-2 bg-red-600 text-white text-xs font-semibold rounded-xl hover:bg-red-700 flex items-center gap-2 shrink-0 transition-all shadow-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Coba Lagi
          </button>
        </div>
      )}

      {/* Table Container */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-800">
              Daftar Kewajiban Laporan Mingguan
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 font-semibold">
              {filteredRows.length} baris
            </span>
          </div>

          <div className="text-xs text-gray-500">
            {searchQuery || selectedGroupFilter !== 'ALL' || selectedClassFilter !== 'ALL' || selectedStatusFilter !== 'ALL' ? (
              <span>Filter aktif diterapkan</span>
            ) : (
              <span>Menampilkan seluruh kewajiban anggota</span>
            )}
          </div>
        </div>

        {/* Loading Spinner */}
        {isLoadingReports ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs font-bold text-gray-500 tracking-wide">
              Memuat data laporan mingguan...
            </p>
          </div>
        ) : filteredRows.length === 0 ? (
          /* Empty state */
          <div className="py-16 text-center space-y-2">
            <div className="w-12 h-12 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center mx-auto">
              <FileText className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-gray-700">Tidak ada kewajiban laporan yang cocok</p>
            <p className="text-xs text-gray-400 max-w-md mx-auto">
              {allObligations.length === 0
                ? 'Belum ada anggota OSIS aktif yang wajib mengisi laporan pada periode minggu ini.'
                : 'Tidak ada data yang memenuhi kriteria filter atau pencarian saat ini.'}
            </p>
          </div>
        ) : (
          /* Main Table */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500 uppercase tracking-wider text-[10px] bg-gray-50">
                  <th className="py-3 px-4 font-semibold">Nama Siswa</th>
                  <th className="py-3 px-4 font-semibold">Kelas</th>
                  <th className="py-3 px-4 font-semibold">Tim OSIS</th>
                  <th className="py-3 px-4 font-semibold">Jabatan</th>
                  <th className="py-3 px-4 font-semibold text-center">Status Pengisian</th>
                  <th className="py-3 px-4 font-semibold">Waktu Pengiriman</th>
                  <th className="py-3 px-4 font-semibold text-center">Ketepatan Waktu</th>
                  <th className="py-3 px-4 font-semibold text-center">Dibaca Pembina</th>
                  <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {filteredRows.map(row => {
                  return (
                    <tr
                      key={row.key}
                      className="hover:bg-blue-50/20 transition-colors"
                    >
                      {/* Nama Siswa & NIS */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-gray-900">
                          {row.studentName}
                        </div>
                        <div className="text-[11px] text-gray-400 font-mono flex items-center gap-1.5 mt-0.5">
                          <span>NIS: {row.studentId || '-'}</span>
                          {row.hasConflict && (
                            <span
                              className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-300"
                              title={`Terdeteksi ${row.allReports.length} dokumen laporan dengan kunci yang sama. Sistem menandai konflik tanpa menghapus data.`}
                            >
                              ⚠️ Konflik Ganda ({row.allReports.length})
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Kelas */}
                      <td className="py-3 px-4 text-gray-600 font-medium">
                        {row.className}
                      </td>

                      {/* Tim OSIS */}
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                            row.isExecutive
                              ? 'bg-indigo-50 text-indigo-900 border border-indigo-200'
                              : 'bg-blue-50 text-blue-900 border border-blue-200'
                          }`}
                        >
                          {row.isExecutive ? (
                            <Crown className="w-3 h-3 text-indigo-600 shrink-0" />
                          ) : (
                            <Layers className="w-3 h-3 text-blue-600 shrink-0" />
                          )}
                          <span>{row.groupName}</span>
                        </span>
                      </td>

                      {/* Jabatan */}
                      <td className="py-3 px-4">
                        <span className="text-xs text-gray-700 font-medium">
                          {row.roleTitle}
                        </span>
                      </td>

                      {/* Status Pengisian */}
                      <td className="py-3 px-4 text-center">
                        {row.status === 'SUBMITTED' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            Terkirim
                          </span>
                        ) : row.status === 'DRAFT' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            <Clock className="w-3 h-3" />
                            Draf
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                            <AlertCircle className="w-3 h-3 text-gray-400" />
                            Belum Mengisi
                          </span>
                        )}
                      </td>

                      {/* Waktu Pengiriman */}
                      <td className="py-3 px-4 text-gray-600 font-mono text-[11px]">
                        {row.submittedAtStr}
                      </td>

                      {/* Ketepatan Waktu */}
                      <td className="py-3 px-4 text-center">
                        {row.timelinessStatus === 'ON_TIME' ? (
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Tepat Waktu
                          </span>
                        ) : row.timelinessStatus === 'LATE' ? (
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800 border border-red-300">
                            Terlambat
                          </span>
                        ) : row.timelinessStatus === 'OVERDUE' ? (
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                            Melewati Batas
                          </span>
                        ) : (
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-50 text-slate-600 border border-slate-200">
                            Dalam Batas
                          </span>
                        )}
                      </td>

                      {/* Status Dibaca Pembina */}
                      <td className="py-3 px-4 text-center">
                        {row.isRead ? (
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-800 border border-blue-200 cursor-help"
                            title={`Sudah dibaca oleh ${row.readByName} pada ${row.readAtStr}`}
                          >
                            <Eye className="w-3 h-3 text-blue-600" />
                            Sudah Dibaca
                          </span>
                        ) : row.report ? (
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600">
                            Belum Dibaca
                          </span>
                        ) : (
                          <span className="text-gray-400 text-[11px]">-</span>
                        )}
                      </td>

                      {/* Tombol Lihat Laporan */}
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setViewingRow(row)}
                          className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 hover:text-blue-900 inline-flex items-center gap-1.5 shadow-2xs transition-all"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Lihat Laporan
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Lihat Laporan (Strictly Read-Only) */}
      {viewingRow && (
        <ViewReportModal
          row={viewingRow}
          weekLabel={selectedPeriod?.label || ''}
          weekStart={selectedWeekStart}
          weekEnd={selectedPeriod?.weekEnd || ''}
          onClose={() => setViewingRow(null)}
        />
      )}
    </div>
  );
};

// =========================================================================
// MODAL LIHAT LAPORAN (READ-ONLY)
// =========================================================================

interface ViewReportModalProps {
  row: ObligationRow;
  weekLabel: string;
  weekStart: string;
  weekEnd: string;
  onClose: () => void;
}

const ViewReportModal: React.FC<ViewReportModalProps> = ({
  row,
  weekLabel,
  weekStart,
  weekEnd,
  onClose,
}) => {
  const report = row.report;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden border border-gray-100 animate-in fade-in zoom-in duration-200">
        {/* Modal Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-blue-700 to-indigo-800 text-white flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded">
                {row.groupName}
              </span>
              <span className="text-white/60">•</span>
              <span className="text-xs text-white/80">{row.roleTitle}</span>
            </div>
            <h2 className="text-lg font-black tracking-tight">{row.studentName}</h2>
            <p className="text-xs text-white/80">
              Kelas {row.className} • NIS: {row.studentId || '-'} • Periode: {weekLabel}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-xl transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Status Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3.5 bg-gray-50 border border-gray-200 rounded-xl">
            <div>
              <p className="text-[10px] uppercase font-semibold text-gray-500">Status</p>
              <p className="text-xs font-bold text-gray-900 mt-0.5">
                {row.status === 'SUBMITTED' ? (
                  <span className="text-emerald-700 font-bold">Terkirim</span>
                ) : row.status === 'DRAFT' ? (
                  <span className="text-amber-700 font-bold">Masih Draf</span>
                ) : (
                  <span className="text-gray-500 font-bold">Belum Mengisi</span>
                )}
              </p>
            </div>

            <div>
              <p className="text-[10px] uppercase font-semibold text-gray-500">Waktu Kirim</p>
              <p className="text-xs font-medium text-gray-800 mt-0.5">
                {row.submittedAtStr}
              </p>
            </div>

            <div>
              <p className="text-[10px] uppercase font-semibold text-gray-500">Ketepatan</p>
              <p className="text-xs font-bold mt-0.5">
                {row.timelinessStatus === 'ON_TIME' ? (
                  <span className="text-emerald-700">Tepat Waktu</span>
                ) : row.timelinessStatus === 'LATE' ? (
                  <span className="text-red-700">Terlambat</span>
                ) : (
                  <span className="text-gray-600">{row.timelinessLabel}</span>
                )}
              </p>
            </div>

            <div>
              <p className="text-[10px] uppercase font-semibold text-gray-500">Status Dibaca</p>
              <p className="text-xs font-medium text-gray-800 mt-0.5">
                {row.isRead ? (
                  <span className="text-blue-700 font-semibold">Sudah Dibaca</span>
                ) : (
                  <span className="text-gray-500">Belum Dibaca</span>
                )}
              </p>
            </div>
          </div>

          {/* Conflict Warning if multiple docs exist */}
          {row.hasConflict && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-amber-900 text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>Konflik Dokumen Ganda:</strong> Ditemukan{' '}
                <strong>{row.allReports.length} dokumen laporan</strong> dengan kunci yang sama pada
                minggu ini. Sistem menampilkan data yang tercatat tanpa mengubah atau menghapus data ganda tersebut.
              </div>
            </div>
          )}

          {report ? (
            <>
              {/* Section 1: Done Text */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                    Aktivitas yang Sudah Dikerjakan (Done)
                  </h3>
                </div>
                <div className="p-4 bg-slate-50 border border-gray-200 rounded-xl text-gray-800 whitespace-pre-wrap leading-relaxed min-h-[70px]">
                  {report.doneText || (
                    <span className="text-gray-400 italic">Tidak ada catatan aktivitas.</span>
                  )}
                </div>
              </div>

              {/* Section 2: Next Text */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                    Rencana Aktivitas Selanjutnya (Next)
                  </h3>
                </div>
                <div className="p-4 bg-slate-50 border border-gray-200 rounded-xl text-gray-800 whitespace-pre-wrap leading-relaxed min-h-[70px]">
                  {report.nextText || (
                    <span className="text-gray-400 italic">Tidak ada catatan rencana.</span>
                  )}
                </div>
              </div>

              {/* Section 3: Feedback Text */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-purple-500" />
                  <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                    Catatan & Umpan Balik Pembina
                  </h3>
                </div>
                <div className="p-4 bg-purple-50/50 border border-purple-100 rounded-xl text-gray-800 space-y-2">
                  {report.feedbackText ? (
                    <>
                      <p className="whitespace-pre-wrap leading-relaxed">{report.feedbackText}</p>
                      <div className="pt-2 border-t border-purple-100 flex items-center justify-between text-[11px] text-purple-700">
                        <span>Oleh: <strong>{report.feedbackByName || 'Pembina'}</strong></span>
                        <span>{report.feedbackAt ? formatWibDateTime(report.feedbackAt) : '-'}</span>
                      </div>
                    </>
                  ) : (
                    <span className="text-gray-400 italic">Belum ada umpan balik yang diberikan pembina.</span>
                  )}
                </div>
              </div>

              {/* Read Info Note */}
              {report.readAt && (
                <div className="text-[11px] text-gray-500 bg-gray-50 p-3 rounded-lg border border-gray-200 flex items-center gap-2">
                  <Eye className="w-3.5 h-3.5 text-blue-600" />
                  <span>
                    Laporan ini telah ditandai dibaca oleh <strong>{report.readByName || 'Pembina'}</strong> pada{' '}
                    <strong>{formatWibDateTime(report.readAt)}</strong>.
                  </span>
                </div>
              )}
            </>
          ) : (
            /* If no report document exists */
            <div className="py-12 text-center space-y-3 bg-gray-50/60 rounded-xl border border-dashed border-gray-200 p-6">
              <div className="w-10 h-10 bg-gray-200 text-gray-500 rounded-full flex items-center justify-center mx-auto">
                <AlertCircle className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-gray-800">Siswa Belum Mengisi Laporan</h4>
              <p className="text-xs text-gray-500 max-w-md mx-auto">
                Siswa terdaftar aktif sebagai <strong>{row.roleTitle}</strong> di tim{' '}
                <strong>{row.groupName}</strong> untuk periode <strong>{weekLabel}</strong>, namun belum ada
                draf maupun laporan terkirim yang tersimpan di sistem.
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer (Strictly Read-Only) */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <div className="text-[11px] text-gray-500 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-gray-400" />
            <span>Mode Baca-Saja: Membuka rekap tidak mengubah status baca atau dokumen siswa.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-800 text-white text-xs font-semibold rounded-xl hover:bg-gray-900 transition-all shadow-xs"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
