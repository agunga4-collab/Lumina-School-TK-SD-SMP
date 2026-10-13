import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Building2,
  Layers,
  Briefcase,
  Trophy,
  Settings,
  RefreshCw,
  AlertCircle,
  Calendar,
  Lock
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../context/AuthContext';
import { useAcademicYear } from '../../../context/AcademicYearContext';
import { Class, Student, AppUser } from '../../../types';
import {
  SOMasterOptions,
  SOGroup,
  SOMembership,
  DEFAULT_SO_MASTER_OPTIONS
} from '../../../types/schoolOrganizations';
import {
  getMasterOptions,
  getGroups,
  getMembershipsByYear,
  getJuniorHighClasses,
  getJuniorHighEligibleTeachers,
  getJuniorHighAllStudents,
  JuniorHighTeacherOption
} from '../../../services/juniorHighSchoolOrganizationsService';
import { OsisTab } from './OsisTab';
import { SwjTab } from './SwjTab';
import { CompetitionsTab } from './CompetitionsTab';
import { MasterOptionsModal } from './MasterOptionsModal';

export const SchoolOrganizationsPage: React.FC = () => {
  const { profile } = useAuth();
  const { activeYear } = useAcademicYear();

  // Role permissions
  const userRole = (profile?.role || '').toUpperCase();
  const isSuperAdmin = userRole === 'SUPER_ADMIN';
  const isHeadUnit = ['HEAD_UNIT', 'HEAD_JUNIOR'].includes(userRole);
  const canEditMaster = isSuperAdmin || isHeadUnit;
  const isReadOnly = ['PRINCIPAL', 'VICE_PRINCIPAL'].includes(userRole);
  const userEmail = profile?.email || 'admin@lazuardi.sch.id';

  // State
  const [selectedYear, setSelectedYear] = useState<string>(() => {
    return activeYear || '2026/2027';
  });
  const [activeTab, setActiveTab] = useState<'OSIS' | 'SWJ' | 'COMPETITION'>('OSIS');

  // Master data
  const [masterOptions, setMasterOptions] = useState<SOMasterOptions>(DEFAULT_SO_MASTER_OPTIONS);
  const [groups, setGroups] = useState<SOGroup[]>([]);
  const [memberships, setMemberships] = useState<SOMembership[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<AppUser[]>([]);

  // Loading states
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isMasterModalOpen, setIsMasterModalOpen] = useState<boolean>(false);

  // Sync activeYear if changed and selectedYear not yet modified
  useEffect(() => {
    if (activeYear && !selectedYear) {
      setSelectedYear(activeYear);
    }
  }, [activeYear]);

  // Load all data
  const loadData = useCallback(async (showToast: boolean = false) => {
    try {
      if (showToast) setIsRefreshing(true);
      else setIsLoading(true);

      const [optionsData, groupsData, memsData, jhClasses, jhTeachers] = await Promise.all([
        getMasterOptions(),
        getGroups(selectedYear),
        getMembershipsByYear(selectedYear),
        getJuniorHighClasses(selectedYear),
        getJuniorHighEligibleTeachers()
      ]);

      setMasterOptions(optionsData);
      setGroups(groupsData);
      setMemberships(memsData);
      setClasses(jhClasses);
      setTeachers(jhTeachers);

      // Load active students for Junior High classes using getActiveStudents (same as Assessment Book)
      try {
        const { students: jhStudents, errors } = await getJuniorHighAllStudents(jhClasses, selectedYear);
        setAllStudents(jhStudents);
        if (errors.length > 0 && jhStudents.length === 0) {
          toast.error(`Peringatan: ${errors[0]}`);
        }
      } catch (stErr: any) {
        console.warn('Gagal memuat siswa aktif untuk tahun terpilih:', stErr);
        toast.error(`Gagal memuat siswa aktif: ${stErr?.message || 'Galat jaringan'}`);
      }

      if (showToast) {
        toast.success('Data School Organizations berhasil diperbarui');
      }
    } catch (err: any) {
      console.error('Error loading school organizations data:', err);
      toast.error(`Gagal memuat data: ${err.message || 'Terjadi kesalahan sistem'}`);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedYear]);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  // Available academic years
  const availableYears = useMemo(() => {
    const years = ['2024/2025', '2025/2026', '2026/2027', '2027/2028'];
    if (activeYear && !years.includes(activeYear)) {
      years.unshift(activeYear);
    }
    return years;
  }, [activeYear]);

  // Statistics
  const stats = useMemo(() => {
    const osisMems = memberships.filter(m => m.programType === 'OSIS' && m.status === 'ACTIVE');
    const swjMems = memberships.filter(m => m.programType === 'SWJ' && m.status === 'ACTIVE');
    const compMems = memberships.filter(m => m.programType === 'COMPETITION' && m.status === 'ACTIVE');
    const comps = groups.filter(g => g.programType === 'COMPETITION');

    return {
      totalOsis: osisMems.length,
      totalSwj: swjMems.length,
      totalComp: compMems.length,
      totalCompetitions: comps.length
    };
  }, [memberships, groups]);

  return (
    <div className="min-h-screen bg-slate-50/60 pb-16">
      {/* Top Banner / Breadcrumb Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="p-3 bg-gradient-to-br from-blue-700 to-indigo-800 text-white rounded-2xl shadow-sm">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                    Lumina Junior High
                  </span>
                  <span className="text-xs text-gray-400">•</span>
                  <span className="text-xs font-semibold text-gray-500">Organisasi & Kepemimpinan Siswa</span>
                </div>
                <h1 className="text-2xl font-black text-gray-900 tracking-tight">
                  School Organizations
                </h1>
              </div>
            </div>

            {/* Right actions: Year Selector & Master Settings Button */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Year Selector */}
              <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-200">
                <Calendar className="w-4 h-4 text-gray-500" />
                <span className="text-xs font-semibold text-gray-600">Tahun Ajaran:</span>
                <select
                  value={selectedYear}
                  onChange={e => setSelectedYear(e.target.value)}
                  className="bg-transparent text-xs font-bold text-gray-900 focus:outline-hidden cursor-pointer"
                >
                  {availableYears.map(yr => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>

              {/* Refresh button */}
              <button
                onClick={() => loadData(true)}
                disabled={isRefreshing}
                className="p-2 text-gray-500 hover:text-gray-900 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 shadow-2xs transition-all disabled:opacity-50"
                title="Muat ulang data"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
              </button>

              {/* Master Settings Button (only Super Admin, Head Unit, Head Junior) */}
              {canEditMaster && (
                <button
                  onClick={() => setIsMasterModalOpen(true)}
                  className="px-3.5 py-2 bg-white border border-gray-300 text-gray-800 text-xs font-semibold rounded-xl hover:bg-gray-50 flex items-center gap-2 shadow-2xs transition-all"
                >
                  <Settings className="w-4 h-4 text-blue-600" />
                  Pengaturan Master
                </button>
              )}
            </div>
          </div>

          {/* Read Only Banner if Principal or Vice Principal */}
          {isReadOnly && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-amber-900 text-xs font-medium">
              <Lock className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Mode Baca-Saja:</strong> Anda masuk dengan hak akses pimpinan ({userRole}). Anda dapat melihat susunan tim dan siswa namun tidak dapat mengubah data.
              </span>
            </div>
          )}

          {/* Stats Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
            <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider">Anggota OSIS</p>
                <p className="text-xl font-bold text-blue-950 mt-0.5">{stats.totalOsis} <span className="text-xs font-normal text-blue-600">Siswa</span></p>
              </div>
              <div className="p-2 bg-blue-100/80 text-blue-700 rounded-lg">
                <Layers className="w-4 h-4" />
              </div>
            </div>

            <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">Relawan SWJ</p>
                <p className="text-xl font-bold text-emerald-950 mt-0.5">{stats.totalSwj} <span className="text-xs font-normal text-emerald-600">Siswa</span></p>
              </div>
              <div className="p-2 bg-emerald-100/80 text-emerald-700 rounded-lg">
                <Briefcase className="w-4 h-4" />
              </div>
            </div>

            <div className="bg-purple-50/50 border border-purple-100 rounded-xl p-3 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-purple-700 uppercase tracking-wider">Ajang Lomba</p>
                <p className="text-xl font-bold text-purple-950 mt-0.5">{stats.totalCompetitions} <span className="text-xs font-normal text-purple-600">Lomba</span></p>
              </div>
              <div className="p-2 bg-purple-100/80 text-purple-700 rounded-lg">
                <Trophy className="w-4 h-4" />
              </div>
            </div>

            <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-3 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wider">Peserta Lomba</p>
                <p className="text-xl font-bold text-indigo-950 mt-0.5">{stats.totalComp} <span className="text-xs font-normal text-indigo-600">Siswa</span></p>
              </div>
              <div className="p-2 bg-indigo-100/80 text-indigo-700 rounded-lg">
                <Trophy className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-gray-200 mt-6 gap-2">
            <button
              onClick={() => setActiveTab('OSIS')}
              className={`pb-3 px-4 text-xs font-bold flex items-center gap-2 border-b-2 transition-all ${
                activeTab === 'OSIS'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              <Layers className="w-4 h-4" />
              OSIS & Design Team
              <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.2 rounded-full font-bold">
                {stats.totalOsis}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('SWJ')}
              className={`pb-3 px-4 text-xs font-bold flex items-center gap-2 border-b-2 transition-all ${
                activeTab === 'SWJ'
                  ? 'border-emerald-600 text-emerald-600'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              <Briefcase className="w-4 h-4" />
              School-Wide Jobs (SWJ)
              <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.2 rounded-full font-bold">
                {stats.totalSwj}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('COMPETITION')}
              className={`pb-3 px-4 text-xs font-bold flex items-center gap-2 border-b-2 transition-all ${
                activeTab === 'COMPETITION'
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              <Trophy className="w-4 h-4" />
              Lomba & Kompetisi
              <span className="text-[10px] bg-purple-100 text-purple-800 px-2 py-0.2 rounded-full font-bold">
                {stats.totalCompetitions}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {isLoading ? (
          <div className="py-24 text-center space-y-3">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">
              Memuat Data School Organizations...
            </p>
          </div>
        ) : (
          <>
            {activeTab === 'OSIS' && (
              <OsisTab
                academicYear={selectedYear}
                designTeams={masterOptions.designTeams}
                groups={groups}
                memberships={memberships}
                teachers={teachers}
                allStudents={allStudents}
                classes={classes}
                userEmail={userEmail}
                isReadOnly={isReadOnly}
                onRefresh={() => loadData(false)}
              />
            )}

            {activeTab === 'SWJ' && (
              <SwjTab
                academicYear={selectedYear}
                swjRoles={masterOptions.swjRoles}
                swjFlowStages={masterOptions.swjFlowStages}
                groups={groups}
                memberships={memberships}
                teachers={teachers}
                allStudents={allStudents}
                classes={classes}
                userEmail={userEmail}
                isReadOnly={isReadOnly}
                onRefresh={() => loadData(false)}
              />
            )}

            {activeTab === 'COMPETITION' && (
              <CompetitionsTab
                academicYear={selectedYear}
                competitionStages={masterOptions.competitionStages}
                groups={groups}
                memberships={memberships}
                teachers={teachers}
                allStudents={allStudents}
                classes={classes}
                userEmail={userEmail}
                isReadOnly={isReadOnly}
                onRefresh={() => loadData(false)}
              />
            )}
          </>
        )}
      </div>

      {/* Master Options Modal */}
      {isMasterModalOpen && (
        <MasterOptionsModal
          isOpen={true}
          onClose={() => setIsMasterModalOpen(false)}
          options={masterOptions}
          userEmail={userEmail}
          onSuccess={updated => {
            setMasterOptions(updated);
            loadData(false);
          }}
        />
      )}
    </div>
  );
};
export default SchoolOrganizationsPage;
