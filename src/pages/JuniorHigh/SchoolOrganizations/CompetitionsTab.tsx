import React, { useState, useMemo } from 'react';
import {
  Trophy,
  Plus,
  Shield,
  UserPlus,
  Settings2,
  Trash2,
  Calendar,
  Building,
  ChevronRight,
  Check,
  Clock,
  Filter
} from 'lucide-react';
import { toast } from 'sonner';
import { AppUser, Student, Class } from '../../../types';
import {
  SOGroup,
  SOMembership
} from '../../../types/schoolOrganizations';
import {
  updateGroupStage,
  deleteGroup,
  deleteMembership
} from '../../../services/juniorHighSchoolOrganizationsService';
import { AddMemberModal } from './AddMemberModal';
import { ManageGroupModal } from './ManageGroupModal';
import { AddCompetitionModal } from './AddCompetitionModal';

interface CompetitionsTabProps {
  academicYear: string;
  competitionStages: string[];
  groups: SOGroup[];
  memberships: SOMembership[];
  teachers: AppUser[];
  allStudents: Student[];
  classes: Class[];
  userEmail: string;
  isReadOnly: boolean;
  onRefresh: () => void;
}

export const CompetitionsTab: React.FC<CompetitionsTabProps> = ({
  academicYear,
  competitionStages,
  groups,
  memberships,
  teachers,
  allStudents,
  classes,
  userEmail,
  isReadOnly,
  onRefresh,
}) => {
  const [isAddCompOpen, setIsAddCompOpen] = useState(false);
  const [activeGroupForAddMember, setActiveGroupForAddMember] = useState<SOGroup | null>(null);
  const [activeGroupForManage, setActiveGroupForManage] = useState<SOGroup | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [updatingStageGroupId, setUpdatingStageGroupId] = useState<string | null>(null);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  const [deletingMembershipId, setDeletingMembershipId] = useState<string | null>(null);

  // Filter competitions for this academic year
  const competitions = useMemo(() => {
    return groups.filter(g => g.programType === 'COMPETITION');
  }, [groups]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    competitions.forEach(c => {
      if (c.categoryOrSubtype) set.add(c.categoryOrSubtype);
    });
    return Array.from(set);
  }, [competitions]);

  const filteredCompetitions = useMemo(() => {
    if (selectedCategory === 'ALL') return competitions;
    return competitions.filter(c => c.categoryOrSubtype === selectedCategory);
  }, [competitions, selectedCategory]);

  const getGroupMembers = (groupId: string): SOMembership[] => {
    return memberships.filter(m => m.groupId === groupId && m.status === 'ACTIVE');
  };

  const handleShiftStage = async (comp: SOGroup, newStage: string) => {
    if (isReadOnly) return;
    if (comp.currentStage === newStage) return;

    setUpdatingStageGroupId(comp.id);
    try {
      await updateGroupStage(
        comp.id,
        newStage,
        userEmail,
        comp.stageHistory || []
      );
      toast.success(`Tahap kompetisi "${comp.name}" diubah ke: ${newStage}`);
      onRefresh();
    } catch (err: any) {
      console.error('Error updating stage:', err);
      toast.error(`Gagal mengubah tahap lomba: ${err.message || 'Terjadi kesalahan'}`);
    } finally {
      setUpdatingStageGroupId(null);
    }
  };

  const handleDeleteCompetition = async (comp: SOGroup) => {
    if (isReadOnly) return;
    if (!window.confirm(`Hapus ajang lomba "${comp.name}" beserta seluruh data pesertanya? Tindakan ini tidak dapat dibatalkan.`)) {
      return;
    }
    setDeletingGroupId(comp.id);
    try {
      await deleteGroup(comp.id);
      toast.success(`Lomba "${comp.name}" berhasil dihapus`);
      onRefresh();
    } catch (err: any) {
      console.error('Error deleting competition:', err);
      toast.error(`Gagal menghapus lomba: ${err.message || 'Terjadi kesalahan'}`);
    } finally {
      setDeletingGroupId(null);
    }
  };

  const handleDeleteMember = async (member: SOMembership) => {
    if (isReadOnly) return;
    if (!window.confirm(`Hapus peserta ${member.studentName} dari lomba ini?`)) {
      return;
    }
    setDeletingMembershipId(member.id);
    try {
      await deleteMembership(member.id);
      toast.success(`${member.studentName} dihapus dari daftar peserta`);
      onRefresh();
    } catch (err: any) {
      console.error('Error deleting participant:', err);
      toast.error(`Gagal menghapus peserta: ${err.message || 'Terjadi kesalahan'}`);
    } finally {
      setDeletingMembershipId(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top action bar & filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
        <div className="flex items-center gap-3">
          <Filter className="w-4 h-4 text-gray-500" />
          <span className="text-xs font-semibold text-gray-700">Filter Kategori:</span>
          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white"
          >
            <option value="ALL">Semua Kategori ({competitions.length})</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {!isReadOnly && (
          <button
            onClick={() => setIsAddCompOpen(true)}
            className="px-4 py-2 bg-purple-600 text-white text-xs font-semibold rounded-xl hover:bg-purple-700 flex items-center gap-2 shadow-xs transition-all self-end sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            Tambah Lomba Baru
          </button>
        )}
      </div>

      {/* Competitions List */}
      {filteredCompetitions.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-2xl border border-dashed border-gray-200 space-y-3">
          <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center mx-auto">
            <Trophy className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-gray-800">Belum Ada Kompetisi Terdaftar</h3>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            Daftarkan ajang lomba, olimpiade, festival seni, atau turnamen yang diikuti oleh siswa Junior High pada tahun {academicYear}.
          </p>
          {!isReadOnly && (
            <button
              onClick={() => setIsAddCompOpen(true)}
              className="px-4 py-2 bg-purple-600 text-white text-xs font-semibold rounded-lg hover:bg-purple-700 inline-flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-4 h-4" /> Tambah Lomba Sekarang
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {filteredCompetitions.map(comp => {
            const members = getGroupMembers(comp.id);
            const currentStage = comp.currentStage || competitionStages[0] || 'Info';

            return (
              <div
                key={comp.id}
                className="bg-white rounded-2xl border border-gray-200 hover:border-gray-300 transition-all shadow-xs overflow-hidden flex flex-col"
              >
                {/* Header Card */}
                <div className="p-5 bg-gradient-to-r from-purple-50/40 via-white to-indigo-50/40 border-b border-gray-100 flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="p-1.5 bg-purple-600 text-white rounded-lg shadow-2xs">
                        <Trophy className="w-4 h-4" />
                      </span>
                      <h3 className="font-bold text-gray-900 text-base">{comp.name}</h3>
                      <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800">
                        {comp.categoryOrSubtype || 'Umum'}
                      </span>
                      <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
                        {members.length} Peserta
                      </span>
                    </div>

                    {comp.description && (
                      <p className="text-xs text-gray-600 max-w-3xl">{comp.description}</p>
                    )}

                    {/* Metadata tags: Penyelenggara, Tanggal, Pembimbing */}
                    <div className="flex flex-wrap items-center gap-2 pt-1.5">
                      {comp.organizer && (
                        <div className="flex items-center gap-1 text-xs text-gray-600 bg-white px-2.5 py-1 rounded-md border border-gray-200">
                          <Building className="w-3.5 h-3.5 text-gray-500" />
                          <span className="font-semibold text-gray-700">Penyelenggara:</span>
                          <span>{comp.organizer}</span>
                        </div>
                      )}
                      {comp.targetDate && (
                        <div className="flex items-center gap-1 text-xs text-gray-600 bg-white px-2.5 py-1 rounded-md border border-gray-200">
                          <Calendar className="w-3.5 h-3.5 text-purple-600" />
                          <span className="font-semibold text-gray-700">Pelaksanaan:</span>
                          <span>
                            {new Date(comp.targetDate).toLocaleDateString('id-ID', {
                              timeZone: 'Asia/Jakarta',
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric'
                            })}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-1 text-xs text-gray-600 bg-white px-2.5 py-1 rounded-md border border-gray-200">
                        <Shield className="w-3.5 h-3.5 text-purple-600" />
                        <span className="font-semibold text-gray-700">Pembimbing:</span>
                        <span>
                          {comp.mentorNames && comp.mentorNames.length > 0
                            ? comp.mentorNames.join(', ')
                            : 'Belum ada'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Top action buttons */}
                  {!isReadOnly && (
                    <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
                      <button
                        onClick={() => setActiveGroupForManage(comp)}
                        className="px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1.5 shadow-2xs"
                        title="Atur pembimbing lomba"
                      >
                        <Settings2 className="w-3.5 h-3.5 text-gray-500" />
                        Kelola
                      </button>
                      <button
                        onClick={() => setActiveGroupForAddMember(comp)}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 flex items-center gap-1.5 shadow-xs"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        Tambah Peserta
                      </button>
                      <button
                        disabled={deletingGroupId === comp.id}
                        onClick={() => handleDeleteCompetition(comp)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Hapus lomba"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* TAHAP LOMBA STEPPER */}
                <div className="px-5 py-3 bg-purple-50/30 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <span className="text-xs font-bold text-gray-600 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-purple-600" />
                    Tahap Progres Lomba:
                  </span>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {competitionStages.map((stageName, sIdx) => {
                      const isCurrent = currentStage === stageName;
                      const stageIndex = competitionStages.indexOf(currentStage);
                      const isPassed = sIdx < stageIndex;

                      return (
                        <React.Fragment key={stageName}>
                          <button
                            type="button"
                            disabled={isReadOnly || updatingStageGroupId === comp.id}
                            onClick={() => handleShiftStage(comp, stageName)}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                              isCurrent
                                ? 'bg-purple-600 text-white shadow-xs ring-2 ring-purple-300'
                                : isPassed
                                ? 'bg-purple-100 text-purple-800 hover:bg-purple-200'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            } ${isReadOnly ? 'cursor-default' : 'cursor-pointer'}`}
                            title={isReadOnly ? stageName : `Ubah tahap ke: ${stageName}`}
                          >
                            {isPassed && <Check className="w-3 h-3 text-purple-700" />}
                            {stageName}
                          </button>
                          {sIdx < competitionStages.length - 1 && (
                            <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>

                {/* Participants Table */}
                <div className="p-4 flex-1">
                  {members.length === 0 ? (
                    <div className="py-7 text-center text-xs text-gray-400 bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
                      Belum ada siswa yang didaftarkan sebagai peserta untuk lomba ini.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-gray-100 text-gray-400 uppercase tracking-wider text-[10px]">
                            <th className="py-2 px-3 font-semibold">Nama Siswa</th>
                            <th className="py-2 px-3 font-semibold">Kelas</th>
                            <th className="py-2 px-3 font-semibold">NIS</th>
                            <th className="py-2 px-3 font-semibold">Peran Peserta</th>
                            <th className="py-2 px-3 font-semibold">Terdaftar</th>
                            {!isReadOnly && <th className="py-2 px-3 font-semibold text-right">Aksi</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 text-gray-700">
                          {members.map(member => (
                            <tr key={member.id} className="hover:bg-purple-50/30 transition-colors">
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
                                    member.roleTitle.toLowerCase().includes('ketua')
                                      ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                      : 'bg-purple-50 text-purple-800'
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
                                    title="Hapus peserta"
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
      )}

      {/* Modals */}
      {isAddCompOpen && (
        <AddCompetitionModal
          isOpen={true}
          onClose={() => setIsAddCompOpen(false)}
          academicYear={academicYear}
          stages={competitionStages}
          teachers={teachers}
          userEmail={userEmail}
          onSuccess={onRefresh}
        />
      )}

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
