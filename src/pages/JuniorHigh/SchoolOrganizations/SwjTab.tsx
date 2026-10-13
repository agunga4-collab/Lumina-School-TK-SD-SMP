import React, { useState, useMemo } from 'react';
import {
  Briefcase,
  Shield,
  UserCheck,
  UserPlus,
  Settings2,
  Trash2,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Check
} from 'lucide-react';
import { toast } from 'sonner';
import { AppUser, Student, Class } from '../../../types';
import {
  SOGroup,
  SOMembership,
  SwjRoleOption
} from '../../../types/schoolOrganizations';
import {
  updateGroupStage,
  deleteMembership,
  makeGroupId
} from '../../../services/juniorHighSchoolOrganizationsService';
import { AddMemberModal } from './AddMemberModal';
import { ManageGroupModal } from './ManageGroupModal';

interface SwjTabProps {
  academicYear: string;
  swjRoles: SwjRoleOption[];
  swjFlowStages: string[];
  groups: SOGroup[];
  memberships: SOMembership[];
  teachers: AppUser[];
  allStudents: Student[];
  classes: Class[];
  userEmail: string;
  isReadOnly: boolean;
  onRefresh: () => void;
}

export const SwjTab: React.FC<SwjTabProps> = ({
  academicYear,
  swjRoles,
  swjFlowStages,
  groups,
  memberships,
  teachers,
  allStudents,
  classes,
  userEmail,
  isReadOnly,
  onRefresh,
}) => {
  const [activeGroupForAddMember, setActiveGroupForAddMember] = useState<SOGroup | null>(null);
  const [activeGroupForManage, setActiveGroupForManage] = useState<SOGroup | null>(null);
  const [updatingStageGroupId, setUpdatingStageGroupId] = useState<string | null>(null);
  const [deletingMembershipId, setDeletingMembershipId] = useState<string | null>(null);

  // Group maps
  const groupMap = useMemo(() => {
    const map = new Map<string, SOGroup>();
    groups.forEach(g => {
      if (g.programType === 'SWJ') {
        map.set(g.id, g);
      }
    });
    return map;
  }, [groups]);

  // Active roles
  const activeRoles = useMemo(() => {
    return (swjRoles || []).filter(r => r.isActive);
  }, [swjRoles]);

  const getGroupMembers = (groupId: string): SOMembership[] => {
    return memberships.filter(m => m.groupId === groupId && m.status === 'ACTIVE');
  };

  const handleShiftStage = async (group: SOGroup, newStage: string) => {
    if (isReadOnly) return;
    if (group.currentStage === newStage) return;

    setUpdatingStageGroupId(group.id);
    try {
      await updateGroupStage(
        group.id,
        newStage,
        userEmail,
        group.stageHistory || []
      );
      toast.success(`Tahap alur ${group.name} diubah menjadi: ${newStage}`);
      onRefresh();
    } catch (err: any) {
      console.error('Error shifting stage:', err);
      toast.error(`Gagal menggeser tahap: ${err.message || 'Terjadi kesalahan'}`);
    } finally {
      setUpdatingStageGroupId(null);
    }
  };

  const handleDeleteMember = async (membership: SOMembership) => {
    if (isReadOnly) return;
    if (!window.confirm(`Hapus ${membership.studentName} dari peran ini?`)) {
      return;
    }
    setDeletingMembershipId(membership.id);
    try {
      await deleteMembership(membership.id);
      toast.success(`${membership.studentName} berhasil dihapus`);
      onRefresh();
    } catch (err: any) {
      console.error('Error deleting member:', err);
      toast.error(`Gagal menghapus anggota: ${err.message || 'Terjadi kesalahan'}`);
    } finally {
      setDeletingMembershipId(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Intro banner */}
      <div className="p-4 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 rounded-2xl border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-600 text-white rounded-xl shadow-xs">
            <Briefcase className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-emerald-950">
              School-Wide Jobs (SWJ) — Peran Sukarela Siswa
            </h2>
            <p className="text-xs text-emerald-800">
              Menumbuhkan budaya kontribusi, tanggung jawab bersama, dan kepemimpinan pelayanan di sekolah.
            </p>
          </div>
        </div>
        <div className="text-xs text-emerald-800 bg-white/80 px-3 py-1.5 rounded-xl border border-emerald-200 font-medium">
          Tahun Ajaran: <span className="font-bold text-emerald-950">{academicYear}</span>
        </div>
      </div>

      {/* SWJ Roles Grid */}
      <div className="grid grid-cols-1 gap-6">
        {activeRoles.map(role => {
          const groupId = makeGroupId(academicYear, 'SWJ', role.id);
          const currentStage = groupMap.get(groupId)?.currentStage || swjFlowStages[0] || 'Sosialisasi';
          const group: SOGroup =
            groupMap.get(groupId) || {
              id: groupId,
              academicYear,
              programType: 'SWJ',
              name: role.name,
              categoryOrSubtype: role.id,
              description: role.description,
              mentorUids: [],
              mentorNames: [],
              currentStage: currentStage,
              quota: role.defaultQuota,
              status: 'active',
              createdAt: '',
              createdBy: '',
              updatedAt: '',
              updatedBy: ''
            };

          const members = getGroupMembers(group.id);
          const quota = group.quota ?? role.defaultQuota ?? 6;
          const isFull = members.length >= quota;
          const isOver = members.length > quota;

          return (
            <div
              key={role.id}
              className="bg-white rounded-2xl border border-gray-200 hover:border-gray-300 transition-all shadow-xs overflow-hidden flex flex-col"
            >
              {/* Card Header */}
              <div className="p-5 bg-gray-50/70 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="p-1.5 bg-emerald-600 text-white rounded-lg shadow-2xs">
                      <Briefcase className="w-4 h-4" />
                    </span>
                    <h3 className="font-bold text-gray-900 text-base">{role.name}</h3>

                    {/* Quota Badge */}
                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                        isOver
                          ? 'bg-red-100 text-red-800 border border-red-200'
                          : isFull
                          ? 'bg-amber-100 text-amber-900 border border-amber-200'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {isOver && <AlertTriangle className="w-3 h-3 text-red-600" />}
                      Kuota: {members.length} / {quota} Siswa
                    </span>
                  </div>

                  <p className="text-xs text-gray-600 max-w-2xl">{group.description || role.description}</p>

                  {/* Mentor & Coordinator Tags */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <div className="flex items-center gap-1.5 text-xs text-gray-600 bg-white px-2.5 py-1 rounded-md border border-gray-200">
                      <Shield className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="font-semibold text-gray-700">Pembina Guru:</span>
                      <span>
                        {group.mentorNames && group.mentorNames.length > 0
                          ? group.mentorNames.join(', ')
                          : 'Belum ditentukan'}
                      </span>
                    </div>
                    {group.studentCoordinatorName && (
                      <div className="flex items-center gap-1.5 text-xs text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                        <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="font-semibold">Koordinator Siswa:</span>
                        <span>{group.studentCoordinatorName}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {!isReadOnly && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setActiveGroupForManage(group)}
                      className="px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1.5 shadow-2xs"
                    >
                      <Settings2 className="w-3.5 h-3.5 text-gray-500" />
                      Kelola Tim & Kuota
                    </button>
                    <button
                      onClick={() => setActiveGroupForAddMember(group)}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 flex items-center gap-1.5 shadow-xs"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Tambah Anggota
                    </button>
                  </div>
                )}
              </div>

              {/* STAGE FLOW STEPPER */}
              <div className="px-5 py-3.5 bg-emerald-50/30 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <span className="text-xs font-bold text-gray-600 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-emerald-600" />
                  Alur Rekrutmen & Pelaksanaan:
                </span>

                <div className="flex flex-wrap items-center gap-1.5">
                  {swjFlowStages.map((stageName, sIdx) => {
                    const isCurrent = group.currentStage === stageName;
                    const stageIndex = swjFlowStages.indexOf(group.currentStage);
                    const isPassed = sIdx < stageIndex;

                    return (
                      <React.Fragment key={stageName}>
                        <button
                          type="button"
                          disabled={isReadOnly || updatingStageGroupId === group.id}
                          onClick={() => handleShiftStage(group, stageName)}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                            isCurrent
                              ? 'bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-300'
                              : isPassed
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          } ${isReadOnly ? 'cursor-default' : 'cursor-pointer'}`}
                          title={isReadOnly ? stageName : `Klik untuk mengubah status ke: ${stageName}`}
                        >
                          {isPassed && <Check className="w-3 h-3 text-emerald-700" />}
                          {stageName}
                        </button>
                        {sIdx < swjFlowStages.length - 1 && (
                          <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>

              {/* Members Table */}
              <div className="p-4 flex-1">
                {members.length === 0 ? (
                  <div className="py-7 text-center text-xs text-gray-400 bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
                    Belum ada siswa yang mendaftar / terdaftar untuk peran {role.name}.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-gray-100 text-gray-400 uppercase tracking-wider text-[10px]">
                          <th className="py-2 px-3 font-semibold">Nama Siswa</th>
                          <th className="py-2 px-3 font-semibold">Kelas</th>
                          <th className="py-2 px-3 font-semibold">NIS</th>
                          <th className="py-2 px-3 font-semibold">Jabatan</th>
                          <th className="py-2 px-3 font-semibold">Tanggal Bergabung</th>
                          {!isReadOnly && <th className="py-2 px-3 font-semibold text-right">Aksi</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 text-gray-700">
                        {members.map(member => (
                          <tr key={member.id} className="hover:bg-emerald-50/30 transition-colors">
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
                                  member.roleTitle.toLowerCase().includes('koordinator')
                                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                    : 'bg-gray-100 text-gray-700'
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
                                  title="Hapus dari peran ini"
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
        })}
      </div>

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
