import * as React from 'react';
import { 
  Camera, Upload, Trash2, Link, Save, CheckCircle2, 
  AlertCircle, RefreshCw, Users, Copy, ExternalLink, Image as ImageIcon,
  Check, X, Eye, FileText, Sparkles, User as UserIcon
} from 'lucide-react';
import type { 
  ElementaryMonthlyProjectDoc, 
  ElementaryMonthlyStudentPhotoDoc,
  ElementaryMonthlyPhotoSnapshot
} from '../../../../types/elementaryMonthlyReport';
import type { Student, Class, User } from '../../../../types';
import { 
  fetchElementaryMonthlyProjectDoc,
  saveElementaryMonthlyProjectDoc,
  fetchElementaryMonthlyStudentPhotos,
  saveElementaryMonthlyStudentPhotoDoc,
  bulkApplyElementaryMonthlyPhotos,
  uploadMonthlyPhoto
} from '../../../../services/elementaryMonthlyReportService';
import { toast } from 'sonner';

interface ProjectAndPhotoTabProps {
  selectedClass: Class | null;
  selectedYear: string;
  selectedSemester: string;
  selectedMonth: string;
  monthLabel: string;
  students: Student[];
  currentUser: User | null;
}

export const ProjectAndPhotoTab: React.FC<ProjectAndPhotoTabProps> = ({
  selectedClass,
  selectedYear,
  selectedSemester,
  selectedMonth,
  monthLabel,
  students,
  currentUser
}) => {
  const classId = selectedClass?.id || '';

  // Project Overview State
  const [projectDoc, setProjectDoc] = React.useState<ElementaryMonthlyProjectDoc | null>(null);
  const [projectTitle, setProjectTitle] = React.useState<string>('');
  const [projectOverview, setProjectOverview] = React.useState<string>('');
  const [sharedAlbumLink, setSharedAlbumLink] = React.useState<string>('');
  const [savingProject, setSavingProject] = React.useState<boolean>(false);

  // Student Photos Map
  const [photosMap, setPhotosMap] = React.useState<Record<string, ElementaryMonthlyStudentPhotoDoc>>({});
  const [loadingData, setLoadingData] = React.useState<boolean>(false);

  // Active Selected Student for Detailed Editing
  const [activeStudentId, setActiveStudentId] = React.useState<string>(students[0]?.id || '');
  const activeStudent = students.find(s => s.id === activeStudentId) || students[0] || null;

  // Active student draft photo states
  const activeStudentPhotoDoc = activeStudent ? photosMap[activeStudent.id] : null;
  const [studentIdentityPhoto, setStudentIdentityPhoto] = React.useState<string>('');
  const [snapshots, setSnapshots] = React.useState<[ElementaryMonthlyPhotoSnapshot, ElementaryMonthlyPhotoSnapshot, ElementaryMonthlyPhotoSnapshot]>([
    { index: 0, url: '', caption: '' },
    { index: 1, url: '', caption: '' },
    { index: 2, url: '', caption: '' }
  ]);
  const [studentAlbumLink, setStudentAlbumLink] = React.useState<string>('');
  const [savingStudentPhotos, setSavingStudentPhotos] = React.useState<boolean>(false);
  const [uploadingSlot, setUploadingSlot] = React.useState<number | 'identity' | null>(null);

  // Modals & Preview
  const [previewImageModal, setPreviewImageModal] = React.useState<{ url: string; title: string } | null>(null);
  const [isBulkApplyOpen, setIsBulkApplyOpen] = React.useState<boolean>(false);
  const [searchQuery, setSearchQuery] = React.useState<string>('');

  // Bulk Apply modal state
  const [applySnapshotsSelection, setApplySnapshotsSelection] = React.useState<{ [key: number]: boolean }>({
    0: true,
    1: true,
    2: true
  });
  const [applyAlbumLink, setApplyAlbumLink] = React.useState<boolean>(true);
  const [selectedStudentIdsForBulk, setSelectedStudentIdsForBulk] = React.useState<string[]>([]);
  const [applyingBulk, setApplyingBulk] = React.useState<boolean>(false);

  // Load Data
  const loadData = React.useCallback(async () => {
    if (!classId || !selectedYear || !selectedSemester || !selectedMonth) return;
    setLoadingData(true);
    try {
      const [proj, photos] = await Promise.all([
        fetchElementaryMonthlyProjectDoc(classId, selectedYear, selectedSemester, selectedMonth),
        fetchElementaryMonthlyStudentPhotos(classId, selectedYear, selectedSemester, selectedMonth)
      ]);
      setProjectDoc(proj);
      setProjectTitle(proj?.projectTitle || '');
      setProjectOverview(proj?.projectOverview || '');
      setSharedAlbumLink(proj?.sharedAlbumLink || '');
      setPhotosMap(photos);
    } catch (err) {
      console.error('Error loading project & photo data:', err);
      toast.error('Gagal memuat dokumentasi proyek & foto.');
    } finally {
      setLoadingData(false);
    }
  }, [classId, selectedYear, selectedSemester, selectedMonth]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  // Sync active student form when student or photosMap changes
  React.useEffect(() => {
    if (!activeStudent) return;
    const doc = photosMap[activeStudent.id];
    setStudentIdentityPhoto(doc?.identityPhotoUrl || '');
    setSnapshots([
      doc?.snapshots?.[0] || { index: 0, url: '', caption: '' },
      doc?.snapshots?.[1] || { index: 1, url: '', caption: '' },
      doc?.snapshots?.[2] || { index: 2, url: '', caption: '' }
    ]);
    setStudentAlbumLink(doc?.albumLink || '');
  }, [activeStudentId, photosMap]);

  // Update default active student if students list changes
  React.useEffect(() => {
    if (students.length > 0 && (!activeStudentId || !students.some(s => s.id === activeStudentId))) {
      setActiveStudentId(students[0].id);
    }
  }, [students, activeStudentId]);

  // Save Project Overview
  const handleSaveProjectOverview = async () => {
    if (!selectedClass) return;
    if (!projectTitle.trim()) {
      toast.error('Judul Proyek wajib diisi.');
      return;
    }
    setSavingProject(true);
    try {
      await saveElementaryMonthlyProjectDoc({
        classId,
        className: selectedClass.name,
        gradeLevel: (selectedClass as any).gradeLevel || 1,
        academicYear: selectedYear,
        semester: selectedSemester,
        month: selectedMonth,
        projectTitle: projectTitle.trim(),
        projectOverview: projectOverview.trim(),
        sharedAlbumLink: sharedAlbumLink.trim()
      }, currentUser);
      toast.success('Overview Proyek Kelas berhasil disimpan.');
      await loadData();
    } catch (err: any) {
      console.error('Error saving project overview:', err);
      toast.error('Gagal menyimpan overview proyek: ' + (err.message || ''));
    } finally {
      setSavingProject(false);
    }
  };

  // Upload Photo for student
  const handleUploadPhoto = async (file: File, target: 'identity' | 0 | 1 | 2) => {
    if (!activeStudent || !selectedClass) return;
    setUploadingSlot(target);
    try {
      const storagePath = `elementary/monthly/${selectedYear.replace(/\//g, '_')}/${selectedMonth}/${classId}/${activeStudent.id}_${target}_${Date.now()}.jpg`;
      const url = await uploadMonthlyPhoto(file, storagePath);

      if (target === 'identity') {
        setStudentIdentityPhoto(url);
      } else {
        setSnapshots(prev => {
          const next = [...prev] as [ElementaryMonthlyPhotoSnapshot, ElementaryMonthlyPhotoSnapshot, ElementaryMonthlyPhotoSnapshot];
          next[target] = { ...next[target], url };
          return next;
        });
      }
      toast.success('Foto berhasil dimuat.');
    } catch (err: any) {
      console.error('Error uploading photo:', err);
      toast.error('Gagal mengunggah foto: ' + (err.message || ''));
    } finally {
      setUploadingSlot(null);
    }
  };

  // Save Student Photos
  const handleSaveStudentPhotos = async () => {
    if (!activeStudent || !selectedClass) return;
    setSavingStudentPhotos(true);
    try {
      await saveElementaryMonthlyStudentPhotoDoc({
        studentId: activeStudent.id,
        studentName: activeStudent.name,
        classId,
        academicYear: selectedYear,
        semester: selectedSemester,
        month: selectedMonth,
        identityPhotoUrl: studentIdentityPhoto.trim(),
        snapshots,
        albumLink: studentAlbumLink.trim()
      }, currentUser);
      toast.success(`Dokumentasi foto ${activeStudent.name} berhasil disimpan.`);
      await loadData();
    } catch (err: any) {
      console.error('Error saving student photos:', err);
      toast.error('Gagal menyimpan foto siswa: ' + (err.message || ''));
    } finally {
      setSavingStudentPhotos(false);
    }
  };

  // Bulk Apply Handler
  const handleOpenBulkModal = () => {
    setSelectedStudentIdsForBulk(students.map(s => s.id));
    setIsBulkApplyOpen(true);
  };

  const handleExecuteBulkApply = async () => {
    if (selectedStudentIdsForBulk.length === 0) {
      toast.error('Pilih setidaknya 1 siswa target.');
      return;
    }

    const snapshotsToApply: { index: number; url: string; caption: string }[] = [];
    [0, 1, 2].forEach(idx => {
      if (applySnapshotsSelection[idx]) {
        snapshotsToApply.push(snapshots[idx]);
      }
    });

    if (snapshotsToApply.length === 0 && !applyAlbumLink) {
      toast.error('Pilih setidaknya satu komponen foto/link untuk disalin bersama.');
      return;
    }

    setApplyingBulk(true);
    try {
      const count = await bulkApplyElementaryMonthlyPhotos({
        classId,
        academicYear: selectedYear,
        semester: selectedSemester,
        month: selectedMonth,
        targetStudentIds: selectedStudentIdsForBulk,
        students,
        snapshotsToApply,
        albumLinkToApply: applyAlbumLink ? studentAlbumLink.trim() : undefined,
        existingPhotosMap: photosMap,
        user: currentUser
      });

      toast.success(`Berhasil menerapkan dokumentasi bersama ke ${count} siswa.`);
      setIsBulkApplyOpen(false);
      await loadData();
    } catch (err: any) {
      console.error('Error executing bulk apply:', err);
      toast.error('Gagal menerapkan bersama: ' + (err.message || ''));
    } finally {
      setApplyingBulk(false);
    }
  };

  // Filtered students list
  const filteredStudents = React.useMemo(() => {
    if (!searchQuery.trim()) return students;
    const q = searchQuery.toLowerCase();
    return students.filter(s => s.name.toLowerCase().includes(q) || (s.nis && s.nis.includes(q)));
  }, [students, searchQuery]);

  return (
    <div className="space-y-6">
      {/* SECTION 1: Class Project Overview Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Camera size={20} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Dokumentasi Proyek Kelas ({monthLabel})
              </h2>
              <p className="text-xs text-slate-500">
                Judul dan deskripsi rangkuman aktivitas proyek yang berlaku untuk seluruh siswa di kelas {selectedClass?.name}.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenBulkModal}
              disabled={loadingData || students.length === 0}
              className="px-3.5 py-2 text-xs font-bold rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Copy size={14} />
              <span>Terapkan Bersama ke Siswa...</span>
            </button>

            <button
              type="button"
              onClick={handleSaveProjectOverview}
              disabled={savingProject}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
            >
              {savingProject ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
              <span>Simpan Overview</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Judul Proyek Bulanan <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={projectTitle}
              onChange={(e) => setProjectTitle(e.target.value)}
              placeholder="Contoh: Eksplorasi Ekosistem & Pemanfaatan Barang Bekas"
              className="w-full text-xs px-3.5 py-2.5 border border-slate-300 rounded-xl bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Judul utama proyek tema pembelajaran di bulan ini.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Tautan Album Dokumentasi Bersama (Opsional)
            </label>
            <div className="relative">
              <input
                type="url"
                value={sharedAlbumLink}
                onChange={(e) => setSharedAlbumLink(e.target.value)}
                placeholder="https://photos.app.goo.gl/... atau Google Drive link"
                className="w-full text-xs pl-8 pr-3.5 py-2.5 border border-slate-300 rounded-xl bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
              <Link size={14} className="absolute left-2.5 top-3 text-slate-400" />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Tautan album galeri lengkap bagi orang tua untuk melihat rekaman dokumentasi kegiatan.
            </p>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Deskripsi Rangkuman Proyek (Project Overview)
            </label>
            <textarea
              rows={3}
              value={projectOverview}
              onChange={(e) => setProjectOverview(e.target.value)}
              placeholder="Jelaskan tujuan kegiatan proyek, kolaborasi siswa, dan produk belajar yang dihasilkan..."
              className="w-full text-xs px-3.5 py-2.5 border border-slate-300 rounded-xl bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500 resize-y"
            />
          </div>
        </div>
      </div>

      {/* SECTION 2: Students List & Individual Student Photos Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Students List Panel (4 Cols) */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-emerald-700" />
              <span className="text-xs font-bold text-slate-800">Daftar Siswa ({students.length})</span>
            </div>
          </div>

          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama siswa..."
            className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl bg-slate-50/50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
          />

          <div className="max-h-[580px] overflow-y-auto space-y-1.5 pr-1">
            {filteredStudents.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">Tidak ada siswa ditemukan.</p>
            ) : (
              filteredStudents.map((s, idx) => {
                const sDoc = photosMap[s.id];
                const filledPhotos = (sDoc?.snapshots || []).filter(snap => Boolean(snap.url)).length;
                const isSelected = s.id === activeStudentId;

                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setActiveStudentId(s.id)}
                    className={`w-full text-left p-2.5 rounded-xl transition-all flex items-center justify-between cursor-pointer border ${
                      isSelected
                        ? 'bg-emerald-50/80 border-emerald-400 text-emerald-950 font-bold shadow-2xs'
                        : 'bg-white hover:bg-slate-50 border-transparent text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-[11px] font-mono text-slate-400 w-5">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <div className="w-7 h-7 rounded-full bg-slate-200 flex-shrink-0 overflow-hidden flex items-center justify-center text-slate-500">
                        {sDoc?.identityPhotoUrl || (s as any).photoUrl ? (
                          <img
                            src={sDoc?.identityPhotoUrl || (s as any).photoUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <UserIcon size={14} />
                        )}
                      </div>
                      <span className="text-xs truncate">{s.name}</span>
                    </div>

                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0 ${
                      filledPhotos === 3
                        ? 'bg-emerald-100 text-emerald-800'
                        : filledPhotos > 0
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {filledPhotos}/3 Foto
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Active Student Photos & Captions Form (8 Cols) */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-5">
          {activeStudent ? (
            <>
              {/* Active Student Header Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 overflow-hidden border border-slate-200 flex items-center justify-center text-slate-400 flex-shrink-0">
                    {studentIdentityPhoto || (activeStudent as any).photoUrl ? (
                      <img
                        src={studentIdentityPhoto || (activeStudent as any).photoUrl}
                        alt={activeStudent.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <UserIcon size={24} />
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{activeStudent.name}</h3>
                    <p className="text-xs text-slate-500">
                      NIS: {activeStudent.nis || '-'} · Kelas {selectedClass?.name}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveStudentPhotos}
                    disabled={savingStudentPhotos}
                    className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    {savingStudentPhotos ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                    <span>Simpan Dokumentasi Siswa</span>
                  </button>
                </div>
              </div>

              {/* Identity Photo Override (Optional) */}
              <div className="p-3.5 bg-slate-50/70 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-slate-800">Foto Profil Khusus Monthly Report</span>
                  <p className="text-[11px] text-slate-500">
                    Secara default menggunakan foto master siswa. Unggah jika ada foto formal/terbaru untuk laporan bulan ini.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {studentIdentityPhoto && (
                    <button
                      type="button"
                      onClick={() => setStudentIdentityPhoto('')}
                      className="px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg font-semibold"
                    >
                      Reset Master
                    </button>
                  )}
                  <label className="px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer flex items-center gap-1.5">
                    <Upload size={13} />
                    <span>{uploadingSlot === 'identity' ? 'Mengunggah...' : 'Pilih Foto Profil'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUploadPhoto(file, 'identity');
                      }}
                    />
                  </label>
                </div>
              </div>

              {/* 3 Project Snapshots Grid */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    3 Foto Project Snapshot &amp; Caption
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    Aspek rasio 4:3, tanpa distorsi (object-cover)
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[0, 1, 2].map((idx) => {
                    const snap = snapshots[idx];
                    const isUploadingThis = uploadingSlot === idx;

                    return (
                      <div
                        key={idx}
                        className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/40 hover:bg-slate-50 transition-colors flex flex-col justify-between space-y-3"
                      >
                        <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                          <span>Snapshot #{idx + 1}</span>
                          {snap.url && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                title="Lihat Foto"
                                onClick={() => setPreviewImageModal({ url: snap.url, title: `Snapshot #${idx + 1} - ${activeStudent.name}` })}
                                className="p-1 hover:bg-slate-200 rounded text-slate-600 cursor-pointer"
                              >
                                <Eye size={13} />
                              </button>
                              <button
                                type="button"
                                title="Hapus Foto"
                                onClick={() => {
                                  setSnapshots(prev => {
                                    const next = [...prev] as [ElementaryMonthlyPhotoSnapshot, ElementaryMonthlyPhotoSnapshot, ElementaryMonthlyPhotoSnapshot];
                                    next[idx] = { ...next[idx], url: '' };
                                    return next;
                                  });
                                }}
                                className="p-1 hover:bg-red-100 rounded text-red-600 cursor-pointer"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Image Preview Box */}
                        <div className="relative aspect-4/3 w-full bg-slate-200 rounded-lg overflow-hidden border border-slate-200 flex items-center justify-center">
                          {snap.url ? (
                            <img
                              src={snap.url}
                              alt={`Snapshot ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="text-center p-3 text-slate-400 space-y-1">
                              <ImageIcon size={24} className="mx-auto text-slate-300" />
                              <span className="text-[10px] font-medium block">Belum ada foto</span>
                            </div>
                          )}

                          {isUploadingThis && (
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white text-xs font-bold">
                              <RefreshCw size={18} className="animate-spin" />
                            </div>
                          )}
                        </div>

                        {/* Upload Button */}
                        <label className="w-full py-1.5 px-3 text-center text-xs font-bold rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer block transition-colors shadow-2xs">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleUploadPhoto(file, idx as 0 | 1 | 2);
                            }}
                          />
                          <span>{snap.url ? 'Ganti Foto' : 'Unggah Foto'}</span>
                        </label>

                        {/* Caption input */}
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                            Caption Deskripsi
                          </label>
                          <textarea
                            rows={2}
                            value={snap.caption || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSnapshots(prev => {
                                const next = [...prev] as [ElementaryMonthlyPhotoSnapshot, ElementaryMonthlyPhotoSnapshot, ElementaryMonthlyPhotoSnapshot];
                                next[idx] = { ...next[idx], caption: val };
                                return next;
                              });
                            }}
                            placeholder="Aktivitas yang dilakukan siswa..."
                            className="w-full text-xs p-2 border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Student Album Link */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tautan Album Foto Siswa (Opsional)
                </label>
                <div className="relative">
                  <input
                    type="url"
                    value={studentAlbumLink}
                    onChange={(e) => setStudentAlbumLink(e.target.value)}
                    placeholder="https://photos.app.goo.gl/... tautan album khusus siswa ini"
                    className="w-full text-xs pl-8 pr-3.5 py-2.5 border border-slate-300 rounded-xl bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  />
                  <Link size={14} className="absolute left-2.5 top-3 text-slate-400" />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Jika dikosongkan, laporan akan memakai tautan album bersama kelas (jika ada).
                </p>
              </div>
            </>
          ) : (
            <div className="p-12 text-center text-slate-400">Pilih siswa di sebelah kiri untuk mengedit foto.</div>
          )}
        </div>
      </div>

      {/* MODAL 1: Bulk Apply Confirmation Modal */}
      {isBulkApplyOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                  <Copy size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Terapkan Dokumentasi Bersama ke Siswa</h3>
                  <p className="text-xs text-slate-500">Salin foto kegiatan &amp; caption siswa aktif ke siswa lainnya.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBulkApplyOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl"
              >
                <X size={18} />
              </button>
            </div>

            {/* Select what components to copy */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">Komponen yang Disalin:</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[0, 1, 2].map((idx) => (
                  <label
                    key={idx}
                    className={`p-2.5 rounded-xl border text-xs font-semibold cursor-pointer flex items-center gap-2 ${
                      applySnapshotsSelection[idx] ? 'bg-emerald-50 border-emerald-400 text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={applySnapshotsSelection[idx]}
                      onChange={(e) => setApplySnapshotsSelection(prev => ({ ...prev, [idx]: e.target.checked }))}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Snapshot #{idx + 1}</span>
                  </label>
                ))}
                <label
                  className={`p-2.5 rounded-xl border text-xs font-semibold cursor-pointer flex items-center gap-2 ${
                    applyAlbumLink ? 'bg-emerald-50 border-emerald-400 text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={applyAlbumLink}
                    onChange={(e) => setApplyAlbumLink(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Link Album</span>
                </label>
              </div>
            </div>

            {/* Target Students Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">
                  Target Siswa ({selectedStudentIdsForBulk.length}/{students.length}):
                </span>
                <div className="space-x-2">
                  <button
                    type="button"
                    onClick={() => setSelectedStudentIdsForBulk(students.map(s => s.id))}
                    className="text-emerald-700 hover:underline font-bold"
                  >
                    Pilih Semua
                  </button>
                  <span className="text-slate-300">·</span>
                  <button
                    type="button"
                    onClick={() => setSelectedStudentIdsForBulk([])}
                    className="text-slate-500 hover:underline font-bold"
                  >
                    Batal Pilih
                  </button>
                </div>
              </div>

              <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-xl p-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5 bg-slate-50/50">
                {students.map((s) => {
                  const isChecked = selectedStudentIdsForBulk.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white text-xs cursor-pointer select-none text-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedStudentIdsForBulk(prev => [...prev, s.id]);
                          } else {
                            setSelectedStudentIdsForBulk(prev => prev.filter(id => id !== s.id));
                          }
                        }}
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="truncate">{s.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-start gap-2">
              <AlertCircle size={16} className="text-amber-700 flex-shrink-0 mt-0.5" />
              <p>
                Menyalin foto bersama tidak akan mengunci data. Setiap siswa tetap dapat diganti fotonya atau disesuaikan caption-nya secara individual.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsBulkApplyOpen(false)}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleExecuteBulkApply}
                disabled={applyingBulk || selectedStudentIdsForBulk.length === 0}
                className="px-5 py-2 text-xs font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1.5 shadow-xs disabled:opacity-50"
              >
                {applyingBulk ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                <span>Konfirmasi Terapkan Bersama</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Full Image Preview Modal */}
      {previewImageModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewImageModal(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-3xl w-full p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-bold text-slate-800">{previewImageModal.title}</span>
              <button
                type="button"
                onClick={() => setPreviewImageModal(null)}
                className="p-1 hover:bg-slate-100 rounded text-slate-500"
              >
                <X size={18} />
              </button>
            </div>
            <div className="max-h-[75vh] flex items-center justify-center overflow-hidden rounded-xl bg-slate-950">
              <img
                src={previewImageModal.url}
                alt="Preview"
                className="max-h-[70vh] w-auto object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
