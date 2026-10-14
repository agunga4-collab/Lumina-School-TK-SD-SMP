import * as React from 'react';
import { motion } from 'motion/react';
import {
  Building2,
  Users,
  Briefcase,
  Trophy,
  CheckCircle2,
  Circle,
  AlertCircle,
  Calendar,
  UserCheck,
  Shield,
  Clock,
  Sparkles,
  ChevronDown
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAcademicYear } from '../../context/AcademicYearContext';
import {
  getStudentMemberships,
  getGroupById,
  getMembershipsByGroup,
  getMasterOptions,
  normalizeAcademicYear
} from '../../services/juniorHighSchoolOrganizationsService';
import {
  DEFAULT_SO_MASTER_OPTIONS,
  type SOGroup,
  type SOMembership,
  type SchoolOrgProgramType,
  type SOMasterOptions
} from '../../types/schoolOrganizations';
import { StudentWeeklyReportSection } from './components/StudentWeeklyReportSection';

interface ActivityItem {
  membership: SOMembership;
  group: SOGroup;
  teamMembers: SOMembership[];
}

export default function StudentSchoolOrganizationsPage() {
  const { profile, currentUser: authUser } = useAuth();
  const currentUser = profile || authUser;
  const { activeYear } = useAcademicYear();

  const [selectedYear, setSelectedYear] = React.useState<string>(activeYear || '2026/2027');
  const [activeTab, setActiveTab] = React.useState<'ALL' | SchoolOrgProgramType>('ALL');
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [activities, setActivities] = React.useState<ActivityItem[]>([]);
  const [masterOptions, setMasterOptions] = React.useState<SOMasterOptions>(DEFAULT_SO_MASTER_OPTIONS);

  // Student identification (NIS: studentId / luminaId)
  const studentId = React.useMemo(() => {
    return ((currentUser as any)?.studentId || currentUser?.luminaId || '').trim();
  }, [currentUser]);

  // Student name
  const studentName = React.useMemo(() => {
    return (currentUser?.displayName || (currentUser as any)?.name || 'Siswa').trim();
  }, [currentUser]);

  // Sync selectedYear if activeYear changes
  React.useEffect(() => {
    if (activeYear) {
      setSelectedYear(activeYear);
    }
  }, [activeYear]);

  // Load master options for fallback stages
  React.useEffect(() => {
    let isMounted = true;
    getMasterOptions().then(opts => {
      if (isMounted && opts) {
        setMasterOptions(opts);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch student activities
  React.useEffect(() => {
    let isCancelled = false;

    const fetchActivities = async () => {
      if (!studentId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // 1. Fetch memberships for this student in selectedYear
        const myMemberships = await getStudentMemberships(studentId, selectedYear);

        if (isCancelled) return;

        if (myMemberships.length === 0) {
          setActivities([]);
          setLoading(false);
          return;
        }

        // 2. Fetch group details & team members for each membership
        const items: ActivityItem[] = [];
        for (const mem of myMemberships) {
          const grp = await getGroupById(mem.groupId);
          if (grp) {
            let members: SOMembership[] = [];
            try {
              members = await getMembershipsByGroup(grp.id);
            } catch (err) {
              console.warn(`Gagal memuat rekan tim untuk grup ${grp.id}:`, err);
            }
            items.push({
              membership: mem,
              group: grp,
              teamMembers: members
            });
          }
        }

        if (!isCancelled) {
          setActivities(items);
        }
      } catch (err: any) {
        console.error('Error fetching student school organizations:', err);
        if (!isCancelled) {
          setError('Gagal memuat daftar organisasi & kegiatan. Silakan coba beberapa saat lagi.');
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    fetchActivities();
    return () => {
      isCancelled = true;
    };
  }, [studentId, selectedYear]);

  // Filter activities by activeTab
  const filteredActivities = React.useMemo(() => {
    if (activeTab === 'ALL') return activities;
    return activities.filter(a => a.membership.programType === activeTab);
  }, [activities, activeTab]);

  const countOSIS = React.useMemo(() => activities.filter(a => a.membership.programType === 'OSIS').length, [activities]);
  const countSWJ = React.useMemo(() => activities.filter(a => a.membership.programType === 'SWJ').length, [activities]);
  const countComp = React.useMemo(() => activities.filter(a => a.membership.programType === 'COMPETITION').length, [activities]);

  const getStagesForGroup = (group: SOGroup): string[] => {
    if (group.programType === 'SWJ') {
      return masterOptions.swjFlowStages && masterOptions.swjFlowStages.length > 0
        ? masterOptions.swjFlowStages
        : DEFAULT_SO_MASTER_OPTIONS.swjFlowStages;
    }
    if (group.programType === 'COMPETITION') {
      return masterOptions.competitionStages && masterOptions.competitionStages.length > 0
        ? masterOptions.competitionStages
        : DEFAULT_SO_MASTER_OPTIONS.competitionStages;
    }
    return [];
  };

  return (
    <div className="min-h-screen bg-slate-50/60 pb-16">
      {/* Header Banner */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-2xl border border-blue-100 shadow-sm">
                  <Building2 size={24} />
                </div>
                <div>
                  <h1 className="text-2xl font-black text-gray-900 tracking-tight">
                    School Organizations
                  </h1>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Lumina Junior High
                  </p>
                </div>
              </div>
              <p className="text-sm text-gray-600 max-w-2xl">
                Portofolio kegiatan OSIS & Design Team, peran School-Wide Jobs (SWJ), dan keikutsertaan Lomba / Kompetisi Anda.
              </p>
            </div>

            {/* Academic Year Selector */}
            <div className="flex items-center gap-2 self-start sm:self-auto bg-gray-50 px-3 py-2 rounded-xl border border-gray-200">
              <Calendar size={16} className="text-gray-500" />
              <label htmlFor="year-select" className="text-xs font-bold text-gray-600">
                Tahun Ajaran:
              </label>
              <select
                id="year-select"
                value={selectedYear}
                onChange={e => setSelectedYear(e.target.value)}
                className="bg-white border border-gray-200 rounded-lg px-2.5 py-1 text-xs font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={activeYear}>{activeYear} (Aktif)</option>
                {selectedYear !== activeYear && (
                  <option value={selectedYear}>{selectedYear}</option>
                )}
                <option value="2026/2027">2026/2027</option>
                <option value="2025/2026">2025/2026</option>
                <option value="2024/2025">2024/2025</option>
              </select>
            </div>
          </div>

          {/* Navigation Filter Tabs */}
          <div className="flex items-center gap-2 mt-8 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setActiveTab('ALL')}
              className={`px-4 py-2 rounded-xl text-xs font-bold tracking-wide transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'ALL'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Semua Kegiatan
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                activeTab === 'ALL' ? 'bg-blue-700 text-white' : 'bg-gray-200 text-gray-700'
              }`}>
                {activities.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('OSIS')}
              className={`px-4 py-2 rounded-xl text-xs font-bold tracking-wide transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'OSIS'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Users size={14} />
              OSIS & Design Team
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                activeTab === 'OSIS' ? 'bg-indigo-700 text-white' : 'bg-gray-200 text-gray-700'
              }`}>
                {countOSIS}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('SWJ')}
              className={`px-4 py-2 rounded-xl text-xs font-bold tracking-wide transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'SWJ'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Briefcase size={14} />
              School-Wide Jobs (SWJ)
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                activeTab === 'SWJ' ? 'bg-emerald-700 text-white' : 'bg-gray-200 text-gray-700'
              }`}>
                {countSWJ}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('COMPETITION')}
              className={`px-4 py-2 rounded-xl text-xs font-bold tracking-wide transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'COMPETITION'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Trophy size={14} />
              Lomba & Kompetisi
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                activeTab === 'COMPETITION' ? 'bg-amber-700 text-white' : 'bg-gray-200 text-gray-700'
              }`}>
                {countComp}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {loading ? (
          <div className="bg-white rounded-3xl p-12 border border-gray-200 text-center shadow-sm">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent mb-4" />
            <p className="text-sm font-bold text-gray-700">Memuat data keanggotaan School Organizations...</p>
            <p className="text-xs text-gray-400 mt-1">Mengambil kegiatan untuk tahun ajaran {selectedYear}</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-3xl p-6 text-center text-red-700">
            <AlertCircle className="mx-auto mb-2 text-red-500" size={28} />
            <p className="text-sm font-bold">{error}</p>
          </div>
        ) : filteredActivities.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 border border-gray-200 text-center shadow-sm max-w-2xl mx-auto">
            <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-blue-100">
              <Building2 size={32} />
            </div>
            <h3 className="text-lg font-black text-gray-900 tracking-tight mb-2">
              Belum Ada Kegiatan Terdaftar
            </h3>
            <p className="text-sm text-gray-500 leading-relaxed max-w-md mx-auto mb-4">
              {activeTab === 'ALL'
                ? `Anda belum terdaftar dalam organisasi OSIS, peran SWJ, maupun Lomba untuk tahun ajaran ${selectedYear}.`
                : `Anda belum memiliki keanggotaan pada kategori ini untuk tahun ajaran ${selectedYear}.`}
            </p>
            <p className="text-xs text-gray-400">
              Hubungi guru pembina atau koordinator kegiatan jika Anda seharusnya sudah terdaftar.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {filteredActivities.map(({ membership, group, teamMembers }) => {
              const programType = membership.programType;
              const stages = getStagesForGroup(group);
              const currentStageIndex = stages.findIndex(s => s.toLowerCase() === (group.currentStage || '').toLowerCase());

              const isOsis = programType === 'OSIS';
              const isSwj = programType === 'SWJ';
              const isComp = programType === 'COMPETITION';

              const badgeColor = isOsis
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                : isSwj
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-700 border-amber-200';

              const programLabel = isOsis
                ? 'OSIS & Design Team'
                : isSwj
                ? 'School-Wide Jobs'
                : 'Lomba & Kompetisi';

              return (
                <motion.div
                  key={membership.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden"
                >
                  {/* Activity Card Header */}
                  <div className="p-6 sm:p-8 border-b border-gray-100">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                          <span className={`text-[11px] font-black uppercase tracking-wider px-3 py-1 rounded-full border ${badgeColor}`}>
                            {programLabel}
                          </span>
                          {group.categoryOrSubtype && (
                            <span className="text-[11px] font-bold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                              {group.categoryOrSubtype === 'EXECUTIVE'
                                ? 'Presidium / BPH'
                                : group.categoryOrSubtype === 'DESIGN_TEAM'
                                ? 'Design Team'
                                : group.categoryOrSubtype}
                            </span>
                          )}
                          <span className="text-[11px] font-medium text-gray-400">
                            TA {group.academicYear}
                          </span>
                        </div>

                        <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">
                          {group.name}
                        </h2>

                        {group.eventDate && (
                          <p className="text-xs font-semibold text-gray-500 mt-1 flex items-center gap-1.5">
                            <Calendar size={13} className="text-amber-500" />
                            Tanggal Pelaksanaan: {group.eventDate}
                          </p>
                        )}
                      </div>

                      {/* Student's Assigned Role / Jabatan */}
                      <div className="self-start md:self-auto bg-gradient-to-br from-blue-50 to-indigo-50/50 border border-blue-100 rounded-2xl px-5 py-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-0.5">
                          Jabatan / Peran Anda
                        </p>
                        <p className="text-base font-black text-gray-900">
                          {membership.roleTitle || 'Anggota'}
                        </p>
                      </div>
                    </div>

                    {/* Mentors / Pembina & Student Coordinator */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6 pt-6 border-t border-gray-100 text-xs">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-slate-100 text-slate-700 rounded-xl mt-0.5">
                          <Shield size={16} />
                        </div>
                        <div>
                          <p className="font-bold text-gray-400 uppercase tracking-wider text-[10px]">
                            Guru Pembina / Mentor
                          </p>
                          <p className="font-bold text-gray-800 text-sm mt-0.5">
                            {group.mentorNames && group.mentorNames.length > 0
                              ? group.mentorNames.join(', ')
                              : 'Belum ditentukan'}
                          </p>
                        </div>
                      </div>

                      {group.studentCoordinatorName && (
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl mt-0.5">
                            <UserCheck size={16} />
                          </div>
                          <div>
                            <p className="font-bold text-gray-400 uppercase tracking-wider text-[10px]">
                              Koordinator Siswa
                            </p>
                            <p className="font-bold text-gray-800 text-sm mt-0.5">
                              {group.studentCoordinatorName}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Stepper Tahap Saat Ini (Baca-Saja untuk SWJ dan Lomba) */}
                  {(isSwj || isComp) && stages.length > 0 && (
                    <div className="p-6 sm:p-8 bg-slate-50/50 border-b border-gray-100">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <Clock size={16} className="text-gray-500" />
                          <h4 className="text-xs font-black uppercase tracking-wider text-gray-700">
                            Tahap Pelaksanaan (Baca-Saja)
                          </h4>
                        </div>
                        <span className="text-xs font-extrabold text-blue-700 bg-blue-100/70 px-3 py-1 rounded-full">
                          Tahap Sekarang: {group.currentStage || stages[0]}
                        </span>
                      </div>

                      {/* Stepper Progress Bar */}
                      <div className="overflow-x-auto py-2">
                        <div className="min-w-[540px] flex items-center justify-between relative">
                          {/* Background Connecting Line */}
                          <div className="absolute top-1/2 left-4 right-4 h-1 bg-gray-200 -translate-y-1/2 z-0" />

                          {stages.map((stageName, idx) => {
                            const isCompleted = currentStageIndex > -1 && idx < currentStageIndex;
                            const isCurrent = currentStageIndex > -1 ? idx === currentStageIndex : idx === 0;

                            return (
                              <div
                                key={stageName}
                                className="relative z-10 flex flex-col items-center group"
                              >
                                <div
                                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-all border-2 ${
                                    isCompleted
                                      ? 'bg-emerald-500 border-emerald-600 text-white shadow-sm'
                                      : isCurrent
                                      ? 'bg-blue-600 border-blue-600 text-white shadow-md ring-4 ring-blue-100'
                                      : 'bg-white border-gray-300 text-gray-400'
                                  }`}
                                >
                                  {isCompleted ? (
                                    <CheckCircle2 size={18} />
                                  ) : (
                                    <span className="text-xs font-black">{idx + 1}</span>
                                  )}
                                </div>
                                <span
                                  className={`mt-2 text-[11px] font-bold text-center tracking-tight max-w-[80px] leading-tight ${
                                    isCurrent
                                      ? 'text-blue-700 font-black'
                                      : isCompleted
                                      ? 'text-gray-700'
                                      : 'text-gray-400'
                                  }`}
                                >
                                  {stageName}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Team Members List (Rekan Satu Kegiatan) */}
                  <div className="p-6 sm:p-8">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Users size={16} className="text-gray-500" />
                        <h4 className="text-xs font-black uppercase tracking-wider text-gray-700">
                          Anggota Tim & Rekan Satu Kegiatan ({teamMembers.length})
                        </h4>
                      </div>
                    </div>

                    {teamMembers.length === 0 ? (
                      <p className="text-xs text-gray-400 italic py-2">
                        Belum ada data anggota lain yang terdaftar.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {teamMembers.map(member => {
                          const isSelf = member.studentId === studentId;

                          return (
                            <div
                              key={member.id}
                              className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                                isSelf
                                  ? 'bg-blue-50/70 border-blue-200 ring-1 ring-blue-200'
                                  : 'bg-white border-gray-200/80 hover:border-gray-300'
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-xs font-black text-gray-900 truncate">
                                    {member.studentName}
                                  </p>
                                  {isSelf && (
                                    <span className="text-[9px] font-extrabold bg-blue-600 text-white px-1.5 py-0.2 rounded-full">
                                      Anda
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-gray-500 font-medium truncate mt-0.5">
                                  {member.className || 'Junior High'}
                                </p>
                              </div>

                              <span className="text-[10px] font-black text-gray-700 bg-gray-100 px-2 py-1 rounded-lg shrink-0">
                                {member.roleTitle || 'Anggota'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Laporan Mingguan (Weekly Report) - Khusus OSIS dan SWJ */}
                  {(membership.programType === 'OSIS' || membership.programType === 'SWJ') && (
                    <StudentWeeklyReportSection
                      group={group}
                      membership={membership}
                      studentId={studentId}
                      studentName={membership.studentName || studentName}
                      academicYear={group.academicYear}
                      teamMembers={teamMembers}
                    />
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
