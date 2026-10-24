import React, { useState, useMemo } from 'react';
import {
  Users,
  Shield,
  UserCheck,
  UserPlus,
  Settings2,
  Trash2,
  Sparkles,
  Layers,
  Crown,
  FileText
} from 'lucide-react';
import { toast } from 'sonner';
import { AppUser, Student, Class } from '../../../types';
import {
  SOGroup,
  SOMembership,
  DesignTeamOption
} from '../../../types/schoolOrganizations';
import {
  saveGroup,
  deleteMembership,
  makeGroupId
} from '../../../services/juniorHighSchoolOrganizationsService';
import { AddMemberModal } from './AddMemberModal';
import { ManageGroupModal } from './ManageGroupModal';
import { OsisWeeklyRecap } from './OsisWeeklyRecap';

interface OsisTabProps {
  academicYear: string;
  designTeams: DesignTeamOption[];
  groups: SOGroup[];
  memberships: SOMembership[];
  teachers: AppUser[];
  allStudents: Student[];
  classes: Class[];
  userEmail: string;
  isReadOnly: boolean;
  onRefresh: () => void;
}

export const OsisTab: React.FC<OsisTabProps> = ({
  academicYear,
  designTeams,
  groups,
  memberships,
  teachers,
  allStudents,
  classes,
  userEmail,
  isReadOnly,
  onRefresh,
}) => {
  // Subtab navigation: Struktur & Anggota Tim vs Rekap Laporan Mingguan
  const [subTab, setSubTab] = useState<'MANAGEMENT' | 'RECAP'>('MANAGEMENT');

  // Modal states
  const [activeGroupForAddMember, setActiveGroupForAddMember] = useState<SOGroup | null>(null);
  const [activeGroupForManage, setActiveGroupForManage] = useState<SOGroup | null>(null);
  const [deletingMembershipId, setDeletingMembershipId] = useState<string | null>(null);

  // Group maps
  const groupMap = useMemo(() => {
    const map = new Map<string, SOGroup>();
    groups.forEach(g => {
      if (g.programType === 'OSIS') {
        map.set(g.id, g);
      }
    });
    return map;
  }, [groups]);

  // Executive group
  const execGroupId = makeGroupId(academicYear, 'OSIS', 'executive');
  const executiveGroup: SOGroup = useMemo(() => {
    return (
      groupMap.get(execGroupId) || {
        id: execGroupId,
        academicYear,
        programType: 'OSIS',
        name: 'Pengurus Inti OSIS',
        categoryOrSubtype: 'EXECUTIVE',
        description: 'Presiden, Wakil Presiden, Sekretaris, Bendahara, dan Dewan Inti OSIS Junior High',
        mentorUids: [],
        mentorNames: [],
        currentStage: 'Aktif',
        status: 'active',
        createdAt: '',
        createdBy: '',
        updatedAt: '',
        updatedBy: ''
      }
    );
  }, [groupMap, execGroupId, academicYear]);

  // Design Team groups
  const activeDesignTeams = useMemo(() => {
    return (designTeams || []).filter(dt => dt.isActive);
  }, [designTeams]);

  // Helper to get members of a group
  const getGroupMembers = (groupId: string): SOMembership[] => {
    return memberships.filter(m => m.groupId === groupId && m.status === 'ACTIVE');
  };

  const handleDeleteMember = async (membership: SOMembership) => {
    if (isReadOnly) return;
    if (!window.confirm(`Hapus keanggotaan ${membership.studentName} (${membership.roleTitle}) dari tim ini?`)) {
      return;
    }
    setDeletingMembershipId(membership.id);
    try {
      await deleteMembership(membership.id);
      toast.success(`${membership.studentName} dihapus dari tim`);
      onRefresh();
    } catch (err: any) {
      console.error('Error deleting member:', err);
      toast.error(`Gagal menghapus anggota: ${err.message || 'Terjadi kesalahan'}`);
    } finally {
      setDeletingMembershipId(null);
    }
  };

  // Render a Group Card
  const renderGroupCard = (group: SOGroup, isExecutive: boolean = false) => {
    const members = getGroupMembers(group.id);
    const existingStudentIds = members.map(m => m.studentId);

    return (
      <div
        key={group.id}
        className={`bg-white rounded-2xl border transition-all shadow-xs overflow-hidden flex flex-col ${
          isExecutive
            ? 'border-indigo-300 ring-2 ring-indigo-100 shadow-md'
            : 'border-gray-200 hover:border-gray-300'
        }`}
      >
        {/* Top Header of Card */}
        <div
          className={`p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-3 ${
            isExecutive
              ? 'bg-gradient-to-r from-indigo-50 to-blue-50 border-b border-indigo-100'
              : 'bg-gray-50/60 border-b border-gray-100'
          }`}
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {isExecutive ? (
                <span className="p-1.5 bg-indigo-600 text-white rounded-lg shadow-2xs">
                  <Crown className="w-4 h-4" />
                </span>
              ) : (
                <span className="p-1.5 bg-blue-600 text-white rounded-lg shadow-2xs">
                  <Layers className="w-4 h-4" />
                </span>
              )}
              <h3 className="font-bold text-gray-900 text-base">{group.name}</h3>
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
                {members.length} Siswa
              </span>
            </div>
            {group.description && (
              <p className="text-xs text-gray-600 max-w-xl">{group.description}</p>
            )}

            {/* Mentors & Coordinator Tags */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <div className="flex items-center gap-1.5 text-xs text-gray-600 bg-white px-2.5 py-1 rounded-md border border-gray-200">
                <Shield className="w-3.5 h-3.5 text-blue-600" />
                <span className="font-semibold text-gray-700">Pembina:</span>
                <span>
                  {group.mentorNames && group.mentorNames.length > 0
                    ? group.mentorNames.join(', ')
                    : 'Belum ditentukan'}
                </span>
              </div>
              {group.studentCoordinatorName && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                  <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="font-semibold">Koordinator:</span>
                  <span>{group.studentCoordinatorName}</span>
                </div>
              )}
            </div>
          </div>

          {/* Action buttons on Card Header */}
          {!isReadOnly && (
            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
              <button
                onClick={() => setActiveGroupForManage(group)}
                className="px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1.5 shadow-2xs transition-all"
                title="Atur Pembina & Koordinator"
              >
                <Settings2 className="w-3.5 h-3.5 text-gray-500" />
                Kelola Tim
              </button>
              <button
                onClick={() => setActiveGroupForAddMember(group)}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center gap-1.5 shadow-xs transition-all"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Tambah Anggota
              </button>
            </div>
          )}
        </div>

        {/* Member Table / List */}
        <div className="p-4 flex-1">
          {members.length === 0 ? (
            <div className="py-8 text-center text-xs text-gray-400 bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
              Belum ada anggota terdaftar di {group.name} untuk tahun ajaran {academicYear}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-400 uppercase tracking-wider text-[10px]">
                    <th className="py-2 px-3 font-semibold">Nama Siswa</th>
                    <th className="py-2 px-3 font-semibold">Kelas</th>
                    <th className="py-2 px-3 font-semibold">NIS</th>
                    <th className="py-2 px-3 font-semibold">Jabatan / Posisi</th>
                    <th className="py-2 px-3 font-semibold">Bergabung</th>
                    {!isReadOnly && <th className="py-2 px-3 font-semibold text-right">Aksi</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-gray-700">
                  {members.map(member => (
                    <tr key={member.id} className="hover:bg-blue-50/30 transition-colors">
                      <td className="py-2.5 px-3 font-medium text-gray-900">
                        {member.studentName}
                      </td>
                      <td className="py-2.5 px-3 text-gray-600">{member.className}</td>
                      <td className="py-2.5 px-3 text-gray-500 font-mono text-[11px]">
                        {member.studentId}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                            member.roleTitle.toLowerCase().includes('presiden') ||
                            member.roleTitle.toLowerCase().includes('captain')
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-blue-50 text-blue-800'
                          }`}
                        >
                          {member.roleTitle}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-gray-400 text-[11px]">
                        {member.joinedAt || '-'}
                      </td>
                      {!isReadOnly && (
                        <td className="py-2.5 px-3 text-right">
                          <button
                            disabled={deletingMembershipId === member.id}
                            onClick={() => handleDeleteMember(member)}
                            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                            title="Hapus dari tim"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* SUBTAB NAVIGATION */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
        <button
          onClick={() => setSubTab('MANAGEMENT')}
          className={`px-4 py-2 text-xs font-bold rounded-xl flex items-center gap-2 transition-all ${
            subTab === 'MANAGEMENT'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white text-gray-600 hover:text-gray-900 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          <Users className="w-4 h-4" />
          Struktur & Anggota Tim
        </button>
        <button
          onClick={() => setSubTab('RECAP')}
          className={`px-4 py-2 text-xs font-bold rounded-xl flex items-center gap-2 transition-all ${
            subTab === 'RECAP'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white text-gray-600 hover:text-gray-900 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          <FileText className="w-4 h-4" />
          Rekap Laporan Mingguan
        </button>
      </div>

      {/* VIEW 1: REKAP LAPORAN MINGGUAN */}
      {subTab === 'RECAP' && (
        <OsisWeeklyRecap
          academicYear={academicYear}
          groups={groups}
          memberships={memberships}
          designTeams={designTeams}
          classes={classes}
          allStudents={allStudents}
          onRefreshParent={onRefresh}
        />
      )}

      {/* VIEW 2: STRUKTUR & PENGELOLAAN TIM (EXISTING VIEW) */}
      {subTab === 'MANAGEMENT' && (
        <div className="space-y-8">
          {/* SECTION 1: Pengurus Inti OSIS */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-indigo-600" />
              <h2 className="text-base font-bold text-gray-900">Pengurus Inti OSIS</h2>
              <span className="text-xs text-gray-400">
                • Periode Kepemimpinan Siswa {academicYear}
              </span>
            </div>
            {renderGroupCard(executiveGroup, true)}
          </div>

          {/* SECTION 2: 5 Design Teams */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-600" />
                <h2 className="text-base font-bold text-gray-900">Design Teams</h2>
                <span className="text-xs text-gray-400">
                  • 5 Bidang Strategis Pengembangan Karakter & Kebajikan Siswa
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {activeDesignTeams.map(dt => {
                const dtGroupId = makeGroupId(academicYear, 'OSIS', dt.id);
                const dtGroup: SOGroup =
                  groupMap.get(dtGroupId) || {
                    id: dtGroupId,
                    academicYear,
                    programType: 'OSIS',
                    name: dt.name,
                    categoryOrSubtype: 'DESIGN_TEAM',
                    description: dt.description,
                    mentorUids: [],
                    mentorNames: [],
                    currentStage: 'Aktif',
                    status: 'active',
                    createdAt: '',
                    createdBy: '',
                    updatedAt: '',
                    updatedBy: ''
                  };

                return renderGroupCard(dtGroup, false);
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {activeGroupForAddMember && (
        <AddMemberModal
          isOpen={true}
          onClose={() => setActiveGroupForAddMember(null)}
          group={activeGroupForAddMember}
          classes={classes}
          allStudents={allStudents}
          existingStudentIds={getGroupMembers(activeGroupForAddMember.id).map(m => m.studentId)}
          currentMemberCount={getGroupMembers(activeGroupForAddMember.id).length}
          userEmail={userEmail}
          onSuccess={onRefresh}
        />
      )}

      {activeGroupForManage && (
        <ManageGroupModal
          isOpen={true}
          onClose={() => setActiveGroupForManage(null)}
          group={activeGroupForManage}
          teachers={teachers}
          allStudents={allStudents}
          userEmail={userEmail}
          onSuccess={onRefresh}
        />
      )}
    </div>
  );
};
