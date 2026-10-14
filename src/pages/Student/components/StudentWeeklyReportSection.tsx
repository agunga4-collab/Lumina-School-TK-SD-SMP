import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileText,
  Send,
  Save,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Eye,
  Check,
  Calendar,
  MessageSquare,
  Users,
  ShieldCheck,
  ChevronRight,
  Info,
  Lock,
  ChevronDown
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getRecentWeekPeriods,
  formatWeekLabel,
  isSubmissionLate,
  type WeekPeriod
} from '../../../utils/wibWeekHelper';
import {
  getStudentWeeklyReports,
  getGroupWeeklyReports,
  saveStudentWeeklyReport,
  makeWeeklyReportId
} from '../../../services/juniorHighSchoolOrganizationsService';
import type {
  SOGroup,
  SOMembership,
  SOWeeklyReport
} from '../../../types/schoolOrganizations';

interface StudentWeeklyReportSectionProps {
  group: SOGroup;
  membership: SOMembership;
  studentId: string;
  studentName: string;
  academicYear: string;
  teamMembers: SOMembership[];
}

export const StudentWeeklyReportSection: React.FC<StudentWeeklyReportSectionProps> = ({
  group,
  membership,
  studentId,
  studentName,
  academicYear,
  teamMembers
}) => {
  // Only OSIS and SWJ participate in weekly reports
  if (group.programType === 'COMPETITION') {
    return null;
  }

  const isCaptain = Boolean(membership.canAssignTasks);

  // 8 recent weeks
  const weekPeriods = useMemo<WeekPeriod[]>(() => {
    return getRecentWeekPeriods(8);
  }, []);

  const [selectedWeekStart, setSelectedWeekStart] = useState<string>(weekPeriods[0]?.weekStart || '');
  const [activeSubTab, setActiveSubTab] = useState<'MY_REPORT' | 'TEAM_REPORTS'>('MY_REPORT');

  // Reports data
  const [myReports, setMyReports] = useState<Record<string, SOWeeklyReport>>({});
  const [isLoadingReports, setIsLoadingReports] = useState<boolean>(true);

  // Team reports for captain
  const [teamReports, setTeamReports] = useState<SOWeeklyReport[]>([]);
  const [isLoadingTeamReports, setIsLoadingTeamReports] = useState<boolean>(false);
  const [selectedTeamReportModal, setSelectedTeamReportModal] = useState<SOWeeklyReport | null>(null);

  // Form input states for current selected week
  const [doneText, setDoneText] = useState<string>('');
  const [nextText, setNextText] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const effectiveStudentId = useMemo(() => {
    return (membership.studentId || studentId || '').trim();
  }, [membership.studentId, studentId]);

  const effectiveStudentName = useMemo(() => {
    return (membership.studentName || studentName || 'Siswa').trim();
  }, [membership.studentName, studentName]);

  const selectedPeriod = useMemo(() => {
    return weekPeriods.find(p => p.weekStart === selectedWeekStart) || weekPeriods[0];
  }, [weekPeriods, selectedWeekStart]);

  const currentReport = useMemo<SOWeeklyReport | undefined>(() => {
    return myReports[selectedWeekStart];
  }, [myReports, selectedWeekStart]);

  // Load student's own reports for this activity
  const loadMyReports = useCallback(async () => {
    if (!effectiveStudentId || !academicYear) return;
    setIsLoadingReports(true);
    try {
      const allReports = await getStudentWeeklyReports(effectiveStudentId, academicYear);
      // Filter for this specific group
      const groupReportsMap: Record<string, SOWeeklyReport> = {};
      allReports
        .filter(r => r.groupId === group.id)
        .forEach(r => {
          groupReportsMap[r.weekStart] = r;
        });
      setMyReports(groupReportsMap);
    } catch (err: any) {
      console.error('Gagal memuat laporan mingguan siswa:', err);
      toast.error('Gagal memuat data laporan mingguan: ' + (err.message || 'Terjadi kesalahan'));
    } finally {
      setIsLoadingReports(false);
    }
  }, [effectiveStudentId, academicYear, group.id]);

  useEffect(() => {
    loadMyReports();
  }, [loadMyReports]);

  // Sync form inputs when selected week or currentReport changes
  useEffect(() => {
    if (currentReport) {
      setDoneText(currentReport.doneText || '');
      setNextText(currentReport.nextText || '');
    } else {
      setDoneText('');
      setNextText('');
    }
  }, [selectedWeekStart, currentReport]);

  // Load team reports for captain when tab is active
  const loadTeamReports = useCallback(async () => {
    if (!isCaptain || !selectedWeekStart) return;
    setIsLoadingTeamReports(true);
    try {
      const reports = await getGroupWeeklyReports(group.id, selectedWeekStart);
      setTeamReports(reports);
    } catch (err: any) {
      console.error('Gagal memuat laporan tim:', err);
      toast.error('Gagal memuat laporan tim: ' + (err.message || 'Izin akses ditolak'));
    } finally {
      setIsLoadingTeamReports(false);
    }
  }, [isCaptain, group.id, selectedWeekStart]);

  useEffect(() => {
    if (activeSubTab === 'TEAM_REPORTS' && isCaptain) {
      loadTeamReports();
    }
  }, [activeSubTab, isCaptain, loadTeamReports]);

  // Determine report states for selected week
  const isReadByTeacher = Boolean(currentReport?.readAt);
  const isPastWindow = !selectedPeriod?.canStudentSubmit; // beyond 2 weeks ago
  const isFormReadOnly = isReadByTeacher || isPastWindow;
  const isLateNow = isSubmissionLate(selectedPeriod.weekStart);

  // Status badge helper
  const renderStatusBadge = (rep?: SOWeeklyReport, period?: WeekPeriod) => {
    if (!rep) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-gray-100 text-gray-500 border border-gray-200">
          <Clock size={12} />
          Belum diisi
        </span>
      );
    }

    if (rep.readAt) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
          <CheckCircle2 size={12} />
          Sudah dibaca
        </span>
      );
    }

    if (rep.status === 'SUBMITTED') {
      if (rep.isLate) {
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <AlertTriangle size={12} />
            Terlambat
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
          <Check size={12} />
          Terkirim
        </span>
      );
    }

    // DRAFT
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-yellow-100 text-yellow-800 border border-yellow-300">
        <Save size={12} />
        Draf
      </span>
    );
  };

  // Handle save draft or submit
  const handleSaveReport = async (status: 'DRAFT' | 'SUBMITTED') => {
    if (isFormReadOnly) {
      toast.error(
        isReadByTeacher
          ? 'Laporan ini sudah dibaca oleh guru pembina dan terkunci.'
          : 'Pengisian laporan untuk minggu ini sudah melewati batas waktu (maksimal 2 minggu sebelumnya).'
      );
      return;
    }

    if (status === 'SUBMITTED') {
      if (!doneText.trim()) {
        toast.error('Harap isi kolom "Yang sudah dilakukan minggu ini" sebelum mengirim.');
        return;
      }
      if (!nextText.trim()) {
        toast.error('Harap isi kolom "Rencana minggu depan / Follow up" sebelum mengirim.');
        return;
      }
    } else {
      // DRAFT
      if (!doneText.trim() && !nextText.trim()) {
        toast.error('Tidak ada teks yang dapat disimpan sebagai draf.');
        return;
      }
    }

    if (doneText.length > 1500) {
      toast.error('Teks yang sudah dilakukan melebihi batas 1500 karakter.');
      return;
    }
    if (nextText.length > 1500) {
      toast.error('Teks rencana minggu depan melebihi batas 1500 karakter.');
      return;
    }

    setIsSaving(true);
    const isExisting = Boolean(currentReport);
    try {
      const willBeLate = isSubmissionLate(selectedPeriod.weekStart);

      await saveStudentWeeklyReport({
        groupId: group.id,
        groupName: group.name,
        programType: group.programType as 'OSIS' | 'SWJ',
        academicYear: group.academicYear,
        studentId: effectiveStudentId,
        studentName: effectiveStudentName,
        classId: (membership.classId || '').trim(),
        className: (membership.className || 'Junior High').trim(),
        weekStart: selectedPeriod.weekStart,
        weekEnd: selectedPeriod.weekEnd,
        doneText: doneText.trim(),
        nextText: nextText.trim(),
        status,
        isLate: willBeLate,
        isUpdate: isExisting
      });

      // Update state only after successful write
      const updatedReport: SOWeeklyReport = {
        id: makeWeeklyReportId(group.id, effectiveStudentId, selectedPeriod.weekStart),
        groupId: group.id,
        groupName: group.name,
        programType: group.programType as 'OSIS' | 'SWJ',
        academicYear: group.academicYear,
        studentId: effectiveStudentId,
        studentName: effectiveStudentName,
        classId: (membership.classId || '').trim(),
        className: (membership.className || 'Junior High').trim(),
        weekStart: selectedPeriod.weekStart,
        weekEnd: selectedPeriod.weekEnd,
        doneText: doneText.trim(),
        nextText: nextText.trim(),
        status,
        isLate: willBeLate,
        submittedAt: status === 'SUBMITTED' ? new Date().toISOString() : currentReport?.submittedAt || null,
        createdAt: currentReport?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        feedbackText: currentReport?.feedbackText || null,
        feedbackBy: currentReport?.feedbackBy || null,
        feedbackByName: currentReport?.feedbackByName || null,
        feedbackAt: currentReport?.feedbackAt || null,
        readAt: currentReport?.readAt || null,
        readBy: currentReport?.readBy || null,
        readByName: currentReport?.readByName || null
      };

      setMyReports(prev => ({
        ...prev,
        [selectedPeriod.weekStart]: updatedReport
      }));

      if (status === 'SUBMITTED') {
        toast.success(
          willBeLate
            ? 'Laporan berhasil dikirim (Tercatat Terlambat karena lewat batas waktu).'
            : 'Laporan mingguan berhasil dikirim tepat waktu!'
        );
      } else {
        toast.success('Draf laporan mingguan berhasil disimpan.');
      }
    } catch (err: any) {
      const operation = err?.operation || (isExisting ? 'update' : 'create');
      const docPath =
        err?.docPath ||
        `jh_so_weekly_reports/${makeWeeklyReportId(group.id, effectiveStudentId, selectedPeriod.weekStart)}`;
      const fieldsStr =
        err?.payloadFields && Array.isArray(err.payloadFields)
          ? ` [Field: ${err.payloadFields.join(', ')}]`
          : '';
      const errMsg = err?.message || 'Missing or insufficient permissions';

      console.error(
        `[handleSaveReport] Gagal menyimpan laporan mingguan (${operation}) pada "${docPath}"${fieldsStr}. Galat:`,
        err
      );
      toast.error(
        `Gagal menyimpan (${operation}) ke ${docPath}${fieldsStr}: ${errMsg}`
      );
      // DO NOT update UI optimistically on error
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="border-t border-gray-100 bg-slate-50/40 p-6 sm:p-8">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
              <FileText size={18} />
            </div>
            <h3 className="text-base font-black text-gray-900 tracking-tight">
              Laporan Mingguan (Weekly Report)
            </h3>
            {isCaptain && (
              <span className="text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md border border-indigo-200">
                Captain
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Pengisian progres rutin setiap minggu (Senin–Minggu WIB). Batas tepat waktu: Senin pukul 12.00 WIB minggu berikutnya.
          </p>
        </div>

        {/* Sub-tab switcher if Captain */}
        {isCaptain && (
          <div className="flex items-center gap-1.5 bg-gray-200/80 p-1 rounded-xl self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setActiveSubTab('MY_REPORT')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeSubTab === 'MY_REPORT'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Laporan Saya
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('TEAM_REPORTS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeSubTab === 'TEAM_REPORTS'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Users size={13} />
              Laporan Tim
            </button>
          </div>
        )}
      </div>

      {/* Week Selector Chips (8 Weeks) */}
      <div className="mb-6">
        <label className="block text-[11px] font-black uppercase tracking-wider text-gray-500 mb-2">
          Pilih Minggu (8 Minggu Terakhir)
        </label>
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
          {weekPeriods.map((period, index) => {
            const isSelected = period.weekStart === selectedWeekStart;
            const rep = myReports[period.weekStart];
            const hasReport = Boolean(rep);

            return (
              <button
                type="button"
                key={period.weekStart}
                onClick={() => setSelectedWeekStart(period.weekStart)}
                className={`px-3.5 py-2 rounded-xl text-left border transition-all shrink-0 cursor-pointer ${
                  isSelected
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm ring-2 ring-blue-100'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300 hover:bg-blue-50/30'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-extrabold">
                    {index === 0 ? 'Minggu Ini' : `Minggu -${index}`}
                  </span>
                  {period.isCurrent && (
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold ${
                        isSelected ? 'bg-blue-800 text-white' : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      Aktif
                    </span>
                  )}
                </div>
                <p
                  className={`text-[10px] mt-0.5 truncate ${
                    isSelected ? 'text-blue-100' : 'text-gray-500'
                  }`}
                >
                  {period.label}
                </p>
                <div className="mt-1 flex items-center gap-1">
                  {hasReport ? (
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                        isSelected
                          ? 'bg-blue-700 text-white'
                          : rep.readAt
                          ? 'bg-emerald-100 text-emerald-700'
                          : rep.status === 'SUBMITTED'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}
                    >
                      {rep.readAt ? 'Dibaca' : rep.status === 'SUBMITTED' ? 'Terkirim' : 'Draf'}
                    </span>
                  ) : (
                    <span
                      className={`text-[9px] font-medium ${
                        isSelected ? 'text-blue-200' : 'text-gray-400'
                      }`}
                    >
                      Kosong
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* VIEW 1: LAPORAN SAYA (FORMULIR INPUT / BACA-SAJA)                      */}
      {/* ===================================================================== */}
      {activeSubTab === 'MY_REPORT' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
          {/* Card Header for Selected Week */}
          <div className="p-5 border-b border-gray-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Calendar size={15} className="text-blue-600" />
                <h4 className="text-sm font-black text-gray-900">
                  {selectedPeriod.label}
                </h4>
                {selectedPeriod.isCurrent && (
                  <span className="text-[10px] font-extrabold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                    Minggu Berjalan
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Batas pengiriman tepat waktu: <strong className="text-gray-700">{selectedPeriod.deadlineWibString}</strong>
              </p>
            </div>

            <div className="flex items-center gap-2">
              {renderStatusBadge(currentReport, selectedPeriod)}
              {currentReport?.isLate && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                  Terlambat
                </span>
              )}
            </div>
          </div>

          {/* Banner Notice jika ReadOnly / Terkunci / Terlambat */}
          {isReadByTeacher && (
            <div className="mx-5 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs text-emerald-800">
              <Lock size={15} className="shrink-0 text-emerald-600" />
              <span>
                <strong>Laporan Terkunci:</strong> Laporan ini sudah diperiksa dan ditandai dibaca oleh guru pembina. Mode baca-saja.
              </span>
            </div>
          )}

          {!isReadByTeacher && isPastWindow && (
            <div className="mx-5 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-xs text-amber-800">
              <AlertTriangle size={15} className="shrink-0 text-amber-600" />
              <span>
                <strong>Batas Waktu Terlewati:</strong> Anda hanya dapat mengisi laporan minggu berjalan dan 2 minggu sebelumnya. Periode ini sudah ditutup untuk pengisian.
              </span>
            </div>
          )}

          {!isReadByTeacher && !isPastWindow && isLateNow && currentReport?.status !== 'SUBMITTED' && (
            <div className="mx-5 mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-xl flex items-center gap-2 text-xs text-yellow-800">
              <Clock size={15} className="shrink-0 text-yellow-600" />
              <span>
                <strong>Lewat Batas Tepat Waktu:</strong> Batas waktu tepat waktu ({selectedPeriod.deadlineWibString}) sudah terlewati. Pengiriman saat ini akan ditandai <em>Terlambat</em>.
              </span>
            </div>
          )}

          {/* Form Columns: 2 Teks Area (Masing-masing maks 1500 chars) */}
          <div className="p-5 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Kolom 1: Yang sudah dilakukan */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                    Yang sudah dilakukan minggu ini <span className="text-red-500">*</span>
                  </label>
                  <span
                    className={`text-[10px] font-mono font-medium ${
                      doneText.length > 1400 ? 'text-red-600 font-bold' : 'text-gray-400'
                    }`}
                  >
                    {doneText.length} / 1500
                  </span>
                </div>
                <textarea
                  rows={6}
                  disabled={isFormReadOnly || isSaving}
                  value={doneText}
                  onChange={e => setDoneText(e.target.value.slice(0, 1500))}
                  placeholder="Uraikan progres pekerjaan, pelaksanaan kegiatan, peran dalam program, atau kendala yang dihadapi minggu ini..."
                  className={`w-full px-3.5 py-2.5 text-xs rounded-xl border transition-all focus:ring-2 focus:ring-blue-500 focus:outline-none ${
                    isFormReadOnly
                      ? 'bg-gray-50 text-gray-700 border-gray-200 cursor-not-allowed'
                      : 'bg-white text-gray-900 border-gray-300 focus:border-blue-500'
                  }`}
                />
              </div>

              {/* Kolom 2: Rencana minggu depan / follow up */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                    Rencana minggu depan / Follow up / Perbaikan <span className="text-red-500">*</span>
                  </label>
                  <span
                    className={`text-[10px] font-mono font-medium ${
                      nextText.length > 1400 ? 'text-red-600 font-bold' : 'text-gray-400'
                    }`}
                  >
                    {nextText.length} / 1500
                  </span>
                </div>
                <textarea
                  rows={6}
                  disabled={isFormReadOnly || isSaving}
                  value={nextText}
                  onChange={e => setNextText(e.target.value.slice(0, 1500))}
                  placeholder="Tuliskan target prioritas berikutnya, tindak lanjut penugasan, atau perbaikan metode kerja..."
                  className={`w-full px-3.5 py-2.5 text-xs rounded-xl border transition-all focus:ring-2 focus:ring-blue-500 focus:outline-none ${
                    isFormReadOnly
                      ? 'bg-gray-50 text-gray-700 border-gray-200 cursor-not-allowed'
                      : 'bg-white text-gray-900 border-gray-300 focus:border-blue-500'
                  }`}
                />
              </div>
            </div>

            {/* Umpan Balik Guru (Feedback) jika ada */}
            {currentReport?.feedbackText && (
              <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50/60 border border-blue-200 rounded-2xl">
                <div className="flex items-center gap-2 mb-1">
                  <MessageSquare size={14} className="text-blue-600" />
                  <p className="text-xs font-black text-blue-900">
                    Umpan Balik Guru Pembina ({currentReport.feedbackByName || 'Pembina'})
                  </p>
                  {currentReport.readAt && (
                    <span className="text-[10px] text-emerald-700 bg-emerald-100 font-bold px-2 py-0.2 rounded-full">
                      Telah dibaca
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-800 leading-relaxed font-medium mt-1">
                  "{currentReport.feedbackText}"
                </p>
                {currentReport.feedbackAt && (
                  <p className="text-[10px] text-gray-400 mt-1">
                    Diberikan pada: {new Date(currentReport.feedbackAt).toLocaleString('id-ID', {
                      timeZone: 'Asia/Jakarta',
                      dateStyle: 'medium',
                      timeStyle: 'short'
                    })} WIB
                  </p>
                )}
              </div>
            )}

            {/* Action Buttons: Simpan Draf & Kirim */}
            {!isFormReadOnly && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-gray-100">
                <div className="text-[11px] text-gray-500 flex items-center gap-1.5">
                  <Info size={13} className="text-gray-400" />
                  <span>
                    Anda masih dapat memperbarui laporan sebelum ditandai dibaca oleh pembina.
                  </span>
                </div>

                <div className="flex items-center gap-2.5 self-end sm:self-auto">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => handleSaveReport('DRAFT')}
                    className="px-4 py-2 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Save size={14} />
                    Simpan Draf
                  </button>

                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => handleSaveReport('SUBMITTED')}
                    className="px-5 py-2 text-xs font-black text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Send size={14} />
                    {isSaving ? 'Menyimpan...' : 'Kirim Laporan'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* VIEW 2: LAPORAN TIM (KHUSUS CAPTAIN: canAssignTasks == true)          */}
      {/* ===================================================================== */}
      {activeSubTab === 'TEAM_REPORTS' && isCaptain && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-gray-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Users size={16} className="text-indigo-600" />
                <h4 className="text-sm font-black text-gray-900">
                  Laporan Tim: {selectedPeriod.label}
                </h4>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Pantau progres dan laporan yang telah dikirimkan oleh seluruh anggota tim Anda.
              </p>
            </div>

            <button
              type="button"
              onClick={loadTeamReports}
              className="text-xs font-bold text-indigo-700 hover:text-indigo-900 self-start sm:self-auto cursor-pointer flex items-center gap-1"
            >
              Segarkan Data
            </button>
          </div>

          <div className="p-5">
            {isLoadingTeamReports ? (
              <div className="text-center py-10">
                <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-indigo-600 border-t-transparent mb-2" />
                <p className="text-xs text-gray-500">Memuat laporan tim...</p>
              </div>
            ) : teamMembers.length === 0 ? (
              <p className="text-xs text-gray-400 italic text-center py-6">
                Belum ada anggota tim terdaftar.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-400 uppercase text-[10px] font-black tracking-wider">
                      <th className="py-2.5 px-3">Nama Anggota</th>
                      <th className="py-2.5 px-3">Kelas</th>
                      <th className="py-2.5 px-3">Peran</th>
                      <th className="py-2.5 px-3">Status Laporan</th>
                      <th className="py-2.5 px-3">Waktu Kirim</th>
                      <th className="py-2.5 px-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {teamMembers.map(mem => {
                      const rep = teamReports.find(r => r.studentId === mem.studentId);
                      const isSelf = mem.studentId === studentId;

                      return (
                        <tr key={mem.id} className="hover:bg-gray-50/60 transition-colors">
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-gray-800">
                                {mem.studentName}
                              </span>
                              {isSelf && (
                                <span className="text-[9px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.2 rounded-full">
                                  Anda
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-gray-400 font-mono">
                              NIS: {mem.studentId}
                            </span>
                          </td>

                          <td className="py-3 px-3 text-gray-600 font-medium">
                            {mem.className || 'Junior High'}
                          </td>

                          <td className="py-3 px-3">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-gray-100 text-gray-700">
                              {mem.roleTitle || 'Anggota'}
                            </span>
                          </td>

                          <td className="py-3 px-3">
                            {rep ? (
                              <div className="flex items-center gap-1">
                                {rep.readAt ? (
                                  <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                                    Sudah dibaca
                                  </span>
                                ) : rep.status === 'SUBMITTED' ? (
                                  rep.isLate ? (
                                    <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                                      Terlambat
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                                      Terkirim
                                    </span>
                                  )
                                ) : (
                                  <span className="text-[10px] font-bold bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">
                                    Draf
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[10px] font-medium text-gray-400 italic">
                                Belum mengisi
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-3 text-[11px] text-gray-500">
                            {rep?.submittedAt
                              ? new Date(rep.submittedAt).toLocaleDateString('id-ID', {
                                  day: 'numeric',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })
                              : '-'}
                          </td>

                          <td className="py-3 px-3 text-right">
                            {rep ? (
                              <button
                                type="button"
                                onClick={() => setSelectedTeamReportModal(rep)}
                                className="px-2.5 py-1 text-[11px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1"
                              >
                                <Eye size={12} />
                                Baca
                              </button>
                            ) : (
                              <span className="text-gray-300 text-[11px]">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Detail Laporan Anggota Tim (Captain View) */}
      {selectedTeamReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-100 animate-in fade-in zoom-in duration-150">
            {/* Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-blue-700 to-indigo-700 text-white flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black">
                  Laporan: {selectedTeamReportModal.studentName}
                </h3>
                <p className="text-[11px] text-blue-100">
                  {selectedTeamReportModal.className} • Periode {selectedTeamReportModal.weekStart} s/d {selectedTeamReportModal.weekEnd}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTeamReportModal(null)}
                className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <span className="text-gray-500 font-medium">Status Pengiriman:</span>
                <div>{renderStatusBadge(selectedTeamReportModal)}</div>
              </div>

              <div>
                <h5 className="font-bold text-gray-700 uppercase tracking-wider text-[10px] mb-1">
                  Yang Sudah Dilakukan:
                </h5>
                <div className="p-3 bg-gray-50 rounded-xl text-gray-800 leading-relaxed whitespace-pre-wrap border border-gray-100">
                  {selectedTeamReportModal.doneText || '-'}
                </div>
              </div>

              <div>
                <h5 className="font-bold text-gray-700 uppercase tracking-wider text-[10px] mb-1">
                  Rencana Minggu Depan / Follow Up:
                </h5>
                <div className="p-3 bg-gray-50 rounded-xl text-gray-800 leading-relaxed whitespace-pre-wrap border border-gray-100">
                  {selectedTeamReportModal.nextText || '-'}
                </div>
              </div>

              {selectedTeamReportModal.feedbackText && (
                <div className="p-3 bg-blue-50 rounded-xl border border-blue-200">
                  <h5 className="font-bold text-blue-900 uppercase tracking-wider text-[10px] mb-1">
                    Umpan Balik Guru Pembina:
                  </h5>
                  <p className="text-gray-800 italic">
                    "{selectedTeamReportModal.feedbackText}"
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedTeamReportModal(null)}
                className="px-4 py-1.5 text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
