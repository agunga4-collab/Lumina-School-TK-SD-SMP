import React, { useEffect, useMemo, useState } from 'react';
import { 
  Megaphone, Plus, Search, Filter, FileText, Download, 
  Calendar, Eye, Edit3, Archive, Trash2, CheckCircle2, 
  Clock, AlertCircle, Pin, ExternalLink, UploadCloud, 
  X, Loader2, ArrowUpRight, ChevronRight, UserCheck, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/utils';
import { 
  ElementarySchoolInformation, 
  ElementarySchoolInfoAttachment,
  SchoolInfoStatus, 
  SchoolInfoCategory,
  getElementarySchoolInformationList,
  createElementarySchoolInformation,
  updateElementarySchoolInformation,
  deleteElementarySchoolInformation,
  uploadSchoolInformationPdf
} from '../../services/elementarySchoolInformationService';

const CATEGORIES: SchoolInfoCategory[] = [
  'Pengumuman',
  'Agenda',
  'Surat Edaran',
  'Kegiatan Sekolah',
  'Prestasi',
  'Akademik',
  'Lainnya'
];

const GRADE_OPTIONS = [
  { value: '1', label: 'Kelas 1' },
  { value: '2', label: 'Kelas 2' },
  { value: '3', label: 'Kelas 3' },
  { value: '4', label: 'Kelas 4' },
  { value: '5', label: 'Kelas 5' },
  { value: '6', label: 'Kelas 6' }
];

export default function ElementarySchoolInformationPage() {
  const { profile, user } = useAuth();
  const currentUid = profile?.uid || user?.uid || '';
  const currentRole = profile?.role || '';
  const currentUnit = profile?.unitId || (profile as any)?.unit || '';

  // Permission checks
  const isSuperAdmin = currentRole === 'SUPER_ADMIN';
  const isHeadOfElem = (currentRole === 'HEAD_UNIT' || currentRole === 'PRINCIPAL') && 
    (currentUnit === 'ELEMENTARY' || (profile as any)?.units?.includes?.('ELEMENTARY'));

  // All active elementary staff and super admin can create/manage
  const canCreate = isSuperAdmin || isHeadOfElem || 
    ['TEACHER', 'HOMEROOM_TEACHER', 'SECRETARY_ELEM', 'BK_MENTOR', 'COORDINATOR'].includes(currentRole);

  const [informationList, setInformationList] = useState<ElementarySchoolInformation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ALL' | SchoolInfoStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Modal States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ElementarySchoolInformation | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState<ElementarySchoolInformation | null>(null);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<ElementarySchoolInformation | null>(null);

  // Form State
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState<SchoolInfoCategory>('Pengumuman');
  const [formContent, setFormContent] = useState('');
  const [formPublishDate, setFormPublishDate] = useState(new Date().toISOString().split('T')[0]);
  const [formIsPinned, setFormIsPinned] = useState(false);
  const [formTargetAll, setFormTargetAll] = useState(true);
  const [formSelectedGrades, setFormSelectedGrades] = useState<string[]>([]);
  const [formPdfAttachment, setFormPdfAttachment] = useState<ElementarySchoolInfoAttachment | null>(null);
  const [formUploadingPdf, setFormUploadingPdf] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Load Data
  const loadData = async () => {
    try {
      setLoading(true);
      const data = await getElementarySchoolInformationList('ALL');
      setInformationList(data);
    } catch (err: any) {
      console.error('Error fetching school information:', err);
      toast.error('Gagal memuat data informasi sekolah');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter & Search Logic
  const filteredList = useMemo(() => {
    return informationList.filter(item => {
      // Tab status filter
      if (activeTab !== 'ALL' && item.status !== activeTab) {
        return false;
      }
      // Category filter
      if (selectedCategory !== 'ALL' && item.category !== selectedCategory) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesAuthor = (item.authorName || '').toLowerCase().includes(q);
        const matchesContent = (item.content || '').toLowerCase().includes(q);
        const matchesCategory = (item.category || '').toLowerCase().includes(q);
        return matchesTitle || matchesAuthor || matchesContent || matchesCategory;
      }
      return true;
    });
  }, [informationList, activeTab, selectedCategory, searchQuery]);

  // Statistics
  const counts = useMemo(() => {
    return {
      all: informationList.length,
      published: informationList.filter(i => i.status === 'PUBLISHED').length,
      draft: informationList.filter(i => i.status === 'DRAFT').length,
      archived: informationList.filter(i => i.status === 'ARCHIVED').length,
    };
  }, [informationList]);

  // Reset & Open Create Form
  const handleOpenCreate = () => {
    setEditingItem(null);
    setFormTitle('');
    setFormCategory('Pengumuman');
    setFormContent('');
    setFormPublishDate(new Date().toISOString().split('T')[0]);
    setFormIsPinned(false);
    setFormTargetAll(true);
    setFormSelectedGrades([]);
    setFormPdfAttachment(null);
    setIsFormOpen(true);
  };

  // Open Edit Form
  const handleOpenEdit = (item: ElementarySchoolInformation) => {
    // Check permission: author or head of elem or super admin
    const canEdit = isSuperAdmin || isHeadOfElem || item.authorUid === currentUid;
    if (!canEdit) {
      toast.error('Anda tidak memiliki izin untuk mengedit informasi ini.');
      return;
    }

    setEditingItem(item);
    setFormTitle(item.title || '');
    setFormCategory((item.category as SchoolInfoCategory) || 'Pengumuman');
    setFormContent(item.content || '');
    setFormPublishDate(item.publishDate || new Date().toISOString().split('T')[0]);
    setFormIsPinned(Boolean(item.isPinned));
    
    const audience = item.targetAudience || ['ALL'];
    if (audience.includes('ALL') || audience.includes('Semua Kelas')) {
      setFormTargetAll(true);
      setFormSelectedGrades([]);
    } else {
      setFormTargetAll(false);
      setFormSelectedGrades(audience);
    }

    setFormPdfAttachment(item.pdfAttachment || null);
    setIsFormOpen(true);
  };

  // Handle PDF file select
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast.error('Harap pilih file dengan format PDF (.pdf)');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Ukuran file PDF maksimal 10MB');
      return;
    }

    try {
      setFormUploadingPdf(true);
      const attachment = await uploadSchoolInformationPdf(file);
      setFormPdfAttachment(attachment);
      toast.success(`File PDF "${file.name}" berhasil disiapkan!`);
    } catch (err: any) {
      console.error('Error uploading pdf:', err);
      toast.error(err.message || 'Gagal mengunggah file PDF');
    } finally {
      setFormUploadingPdf(false);
      e.target.value = '';
    }
  };

  // Handle Save
  const handleSaveForm = async (targetStatus: SchoolInfoStatus) => {
    if (!formTitle.trim()) {
      toast.error('Judul informasi wajib diisi');
      return;
    }

    const hasText = Boolean(formContent.trim());
    const hasPdf = Boolean(formPdfAttachment);

    if (!hasText && !hasPdf) {
      toast.error('Harap masukkan isi tulisan informasi atau unggah lampiran PDF.');
      return;
    }

    // Determine target audience
    let targetAudience: string[] = ['ALL'];
    let targetGradeNames: string[] = ['Semua Kelas Elementary'];

    if (!formTargetAll && formSelectedGrades.length > 0) {
      targetAudience = formSelectedGrades;
      targetGradeNames = formSelectedGrades.map(g => `Kelas ${g}`);
    }

    try {
      setFormSubmitting(true);

      const authorName = profile?.displayName || user?.displayName || 'Guru Elementary';
      const authorEmail = profile?.email || user?.email || '';
      const authorRole = profile?.jobTitle || currentRole;

      if (editingItem) {
        // Update
        await updateElementarySchoolInformation(editingItem.id, {
          title: formTitle.trim(),
          category: formCategory,
          content: formContent.trim(),
          publishDate: formPublishDate,
          isPinned: formIsPinned,
          targetAudience,
          targetGradeNames,
          hasPdf,
          pdfAttachment: formPdfAttachment,
          status: targetStatus
        });
        toast.success(
          targetStatus === 'PUBLISHED' 
            ? 'Informasi berhasil diperbarui dan diterbitkan!' 
            : 'Perubahan draf berhasil disimpan!'
        );
      } else {
        // Create
        await createElementarySchoolInformation({
          title: formTitle.trim(),
          category: formCategory,
          content: formContent.trim(),
          publishDate: formPublishDate,
          isPinned: formIsPinned,
          unit: 'ELEMENTARY',
          targetAudience,
          targetGradeNames,
          hasPdf,
          pdfAttachment: formPdfAttachment,
          status: targetStatus,
          authorUid: currentUid,
          authorName,
          authorRole,
          authorEmail
        });
        toast.success(
          targetStatus === 'PUBLISHED' 
            ? 'Informasi berhasil diterbitkan!' 
            : 'Draf informasi berhasil disimpan!'
        );
      }

      setIsFormOpen(false);
      await loadData();
    } catch (err: any) {
      console.error('Error saving school information:', err);
      toast.error(err.message || 'Gagal menyimpan informasi sekolah');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Toggle Archive / Publish
  const handleToggleStatus = async (item: ElementarySchoolInformation) => {
    const canManage = isSuperAdmin || isHeadOfElem || item.authorUid === currentUid;
    if (!canManage) {
      toast.error('Anda tidak memiliki izin untuk mengubah status informasi ini.');
      return;
    }

    try {
      const newStatus: SchoolInfoStatus = item.status === 'PUBLISHED' ? 'ARCHIVED' : 'PUBLISHED';
      await updateElementarySchoolInformation(item.id, { status: newStatus });
      toast.success(
        newStatus === 'ARCHIVED' 
          ? 'Informasi berhasil diarsipkan.' 
          : 'Informasi berhasil diterbitkan kembali!'
      );
      await loadData();
    } catch (err: any) {
      console.error('Error updating status:', err);
      toast.error('Gagal memperbarui status');
    }
  };

  // Delete Confirm
  const handleDelete = async () => {
    if (!deleteConfirmItem) return;
    const canManage = isSuperAdmin || isHeadOfElem || deleteConfirmItem.authorUid === currentUid;
    if (!canManage) {
      toast.error('Anda tidak memiliki izin untuk menghapus informasi ini.');
      setDeleteConfirmItem(null);
      return;
    }

    try {
      await deleteElementarySchoolInformation(deleteConfirmItem.id);
      toast.success('Informasi sekolah berhasil dihapus.');
      setDeleteConfirmItem(null);
      await loadData();
    } catch (err: any) {
      console.error('Error deleting information:', err);
      toast.error('Gagal menghapus informasi');
    }
  };

  const getCategoryBadgeClass = (category: string) => {
    switch (category) {
      case 'Pengumuman':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Agenda':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Surat Edaran':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Kegiatan Sekolah':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Prestasi':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'Akademik':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getStatusBadge = (status: SchoolInfoStatus) => {
    switch (status) {
      case 'PUBLISHED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 size={12} />
            Diterbitkan
          </span>
        );
      case 'DRAFT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock size={12} />
            Draf
          </span>
        );
      case 'ARCHIVED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">
            <Archive size={12} />
            Diarsipkan
          </span>
        );
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-16 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 rounded-3xl p-6 md:p-8 text-white shadow-lg relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-10 -translate-y-10 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/15 backdrop-blur-md rounded-full text-xs font-bold uppercase tracking-wider text-blue-100">
              <Megaphone size={14} />
              Komunikasi Elementary
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">
              Informasi Sekolah
            </h1>
            <p className="text-sm md:text-base text-blue-100/90 leading-relaxed">
              Pusat penerbitan pengumuman resmi, surat edaran, dan agenda kegiatan SD Lazuardi. Tersambung langsung ke dashboard siswa.
            </p>
          </div>

          {canCreate && (
            <button
              onClick={handleOpenCreate}
              className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-white text-blue-600 hover:bg-blue-50 font-bold rounded-2xl shadow-md transition-all hover:scale-[1.02] active:scale-[0.98] shrink-0"
            >
              <Plus size={20} />
              <span>Buat Informasi Baru</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="bg-white rounded-3xl p-4 md:p-6 shadow-sm border border-gray-100 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-gray-100 rounded-2xl w-fit overflow-x-auto">
            <button
              onClick={() => setActiveTab('ALL')}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
                activeTab === 'ALL'
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              )}
            >
              Semua ({counts.all})
            </button>
            <button
              onClick={() => setActiveTab('PUBLISHED')}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
                activeTab === 'PUBLISHED'
                  ? "bg-white text-emerald-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              )}
            >
              Diterbitkan ({counts.published})
            </button>
            <button
              onClick={() => setActiveTab('DRAFT')}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
                activeTab === 'DRAFT'
                  ? "bg-white text-amber-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              )}
            >
              Draf ({counts.draft})
            </button>
            <button
              onClick={() => setActiveTab('ARCHIVED')}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
                activeTab === 'ARCHIVED'
                  ? "bg-white text-gray-700 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              )}
            >
              Diarsipkan ({counts.archived})
            </button>
          </div>

          {/* Refresh button */}
          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold text-gray-600 hover:text-blue-600 bg-gray-50 hover:bg-blue-50 rounded-xl transition-colors self-end md:self-auto"
            title="Muat Ulang"
          >
            <RefreshCw size={14} className={cn(loading && "animate-spin")} />
            <span>Segarkan</span>
          </button>
        </div>

        {/* Search & Category Filter */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari berdasarkan judul, nama pembuat, atau kata kunci..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              <option value="ALL">Semua Kategori</option>
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Table / Cards */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center text-gray-400 gap-3">
            <Loader2 className="animate-spin text-blue-600" size={32} />
            <p className="text-sm font-semibold">Memuat daftar informasi...</p>
          </div>
        ) : filteredList.length === 0 ? (
          <div className="p-16 text-center space-y-4">
            <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center mx-auto">
              <Megaphone size={32} />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-gray-800">Tidak ada informasi ditemukan</h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto">
                {searchQuery || selectedCategory !== 'ALL' || activeTab !== 'ALL'
                  ? 'Coba sesuaikan kata kunci pencarian atau filter yang dipilih.'
                  : 'Belum ada informasi yang dibuat untuk unit Elementary.'}
              </p>
            </div>
            {canCreate && (
              <button
                onClick={handleOpenCreate}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors"
              >
                <Plus size={16} />
                <span>Buat Informasi Pertama</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50/75 border-b border-gray-100 text-xs font-black uppercase tracking-wider text-gray-400">
                <tr>
                  <th className="py-4 px-6">Informasi</th>
                  <th className="py-4 px-4">Kategori</th>
                  <th className="py-4 px-4">Sasaran Kelas</th>
                  <th className="py-4 px-4">Lampiran</th>
                  <th className="py-4 px-4">Pembuat & Tanggal</th>
                  <th className="py-4 px-4 text-center">Status</th>
                  <th className="py-4 px-6 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredList.map((item) => {
                  const canManageThis = isSuperAdmin || isHeadOfElem || item.authorUid === currentUid;
                  return (
                    <tr 
                      key={item.id} 
                      className={cn(
                        "hover:bg-blue-50/40 transition-colors group",
                        item.isPinned && "bg-amber-50/20"
                      )}
                    >
                      {/* Judul & Pin */}
                      <td className="py-4 px-6 max-w-sm">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            {item.isPinned && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 rounded-md text-[10px] font-black uppercase tracking-wider">
                                <Pin size={10} className="fill-amber-700" />
                                Disematkan
                              </span>
                            )}
                            <h4 
                              onClick={() => {
                                setPreviewItem(item);
                                setIsPreviewOpen(true);
                              }}
                              className="font-bold text-gray-900 group-hover:text-blue-600 cursor-pointer transition-colors line-clamp-1"
                            >
                              {item.title}
                            </h4>
                          </div>
                          <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
                            {item.summary || item.content || 'Tidak ada cuplikan teks.'}
                          </p>
                        </div>
                      </td>

                      {/* Kategori */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <span className={cn(
                          "px-2.5 py-1 rounded-lg text-xs font-bold border",
                          getCategoryBadgeClass(item.category)
                        )}>
                          {item.category}
                        </span>
                      </td>

                      {/* Sasaran Kelas */}
                      <td className="py-4 px-4 whitespace-nowrap text-xs font-semibold text-gray-600">
                        {item.targetAudience?.includes('ALL') || item.targetAudience?.includes('Semua Kelas') || !item.targetAudience?.length ? (
                          <span className="px-2.5 py-1 bg-gray-100 rounded-lg text-gray-700 font-bold">
                            Semua Kelas
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg font-bold">
                            {item.targetGradeNames?.join(', ') || item.targetAudience.map(g => `Kelas ${g}`).join(', ')}
                          </span>
                        )}
                      </td>

                      {/* Lampiran PDF */}
                      <td className="py-4 px-4 whitespace-nowrap text-xs">
                        {item.hasPdf && item.pdfAttachment ? (
                          <a
                            href={item.pdfAttachment.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg font-bold transition-colors"
                            title={item.pdfAttachment.fileName}
                          >
                            <FileText size={13} />
                            <span className="max-w-[120px] truncate">{item.pdfAttachment.fileName}</span>
                            <ExternalLink size={11} />
                          </a>
                        ) : (
                          <span className="text-gray-400 font-medium">Hanya Tulisan</span>
                        )}
                      </td>

                      {/* Pembuat & Tanggal */}
                      <td className="py-4 px-4 whitespace-nowrap text-xs">
                        <p className="font-bold text-gray-800">{item.authorName}</p>
                        <p className="text-gray-400 font-medium">{item.publishDate || '-'}</p>
                      </td>

                      {/* Status */}
                      <td className="py-4 px-4 whitespace-nowrap text-center">
                        {getStatusBadge(item.status)}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-6 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Preview Button */}
                          <button
                            onClick={() => {
                              setPreviewItem(item);
                              setIsPreviewOpen(true);
                            }}
                            className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Lihat Detail"
                          >
                            <Eye size={16} />
                          </button>

                          {/* Edit Button */}
                          {canManageThis && (
                            <button
                              onClick={() => handleOpenEdit(item)}
                              className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              title="Edit Informasi"
                            >
                              <Edit3 size={16} />
                            </button>
                          )}

                          {/* Toggle Archive */}
                          {canManageThis && (
                            <button
                              onClick={() => handleToggleStatus(item)}
                              className="p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                              title={item.status === 'PUBLISHED' ? 'Arsipkan' : 'Terbitkan Kembali'}
                            >
                              <Archive size={16} />
                            </button>
                          )}

                          {/* Delete Button */}
                          {canManageThis && (
                            <button
                              onClick={() => setDeleteConfirmItem(item)}
                              className="p-1.5 text-gray-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Hapus Informasi"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* MODAL: Form Buat / Edit Informasi                       */}
      {/* ======================================================== */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl border border-gray-100 my-8 overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-blue-50/50 to-indigo-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-md shadow-blue-500/20">
                  <Megaphone size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-gray-900">
                    {editingItem ? 'Edit Informasi Sekolah' : 'Buat Informasi Sekolah Baru'}
                  </h3>
                  <p className="text-xs text-gray-500 font-medium">
                    Khusus unit Elementary • Siswa & orang tua dapat membaca saat diterbitkan
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsFormOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              {/* Judul */}
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-gray-600 block">
                  Judul Informasi <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Contoh: Jadwal Ujian Tengah Semester 1 Tahun Ajaran 2026/2027"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {/* Kategori & Tanggal Terbit */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-gray-600 block">
                    Kategori
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as SchoolInfoCategory)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-gray-600 block">
                    Tanggal Terbit
                  </label>
                  <input
                    type="date"
                    value={formPublishDate}
                    onChange={(e) => setFormPublishDate(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Target Sasaran Audiens */}
              <div className="space-y-2 p-4 bg-gray-50/80 rounded-2xl border border-gray-100">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black uppercase tracking-wider text-gray-700">
                    Sasaran Kelas Siswa
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs font-bold text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formTargetAll}
                      onChange={(e) => {
                        setFormTargetAll(e.target.checked);
                        if (e.target.checked) setFormSelectedGrades([]);
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    Semua Kelas Elementary (1 - 6)
                  </label>
                </div>

                {!formTargetAll && (
                  <div className="pt-2">
                    <p className="text-xs text-gray-500 font-medium mb-2">Pilih tingkat kelas yang dituju:</p>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {GRADE_OPTIONS.map(opt => {
                        const isChecked = formSelectedGrades.includes(opt.value);
                        return (
                          <button
                            type="button"
                            key={opt.value}
                            onClick={() => {
                              if (isChecked) {
                                setFormSelectedGrades(prev => prev.filter(g => g !== opt.value));
                              } else {
                                setFormSelectedGrades(prev => [...prev, opt.value]);
                              }
                            }}
                            className={cn(
                              "px-3 py-2 rounded-xl text-xs font-bold border transition-all text-center",
                              isChecked
                                ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                                : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                            )}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Pin / Disematkan */}
              <div className="flex items-center gap-3 p-3 bg-amber-50/50 rounded-2xl border border-amber-200/60">
                <input
                  type="checkbox"
                  id="form-is-pinned"
                  checked={formIsPinned}
                  onChange={(e) => setFormIsPinned(e.target.checked)}
                  className="w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                />
                <label htmlFor="form-is-pinned" className="text-xs font-bold text-amber-900 cursor-pointer select-none">
                  Sematkan informasi ini di bagian paling atas (Pin Prioritas)
                </label>
              </div>

              {/* Isi Tulisan / Artikel */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black uppercase tracking-wider text-gray-600 block">
                    Isi Tulisan / Pengumuman
                  </label>
                  <span className="text-[11px] text-gray-400 font-medium">
                    {formContent.length} karakter
                  </span>
                </div>
                <textarea
                  rows={6}
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  placeholder="Tuliskan isi pengumuman atau informasi lengkap di sini... (Paragraf dan susunan teks akan ditampilkan rapi bagi siswa dan orang tua)."
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 leading-relaxed resize-y"
                />
              </div>

              {/* Lampiran PDF */}
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-wider text-gray-600 block">
                  Lampiran Dokumen PDF (Opsional jika ada tulisan, wajib jika tanpa tulisan)
                </label>

                {formPdfAttachment ? (
                  <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 flex items-center justify-between">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center shrink-0">
                        <FileText size={20} />
                      </div>
                      <div className="overflow-hidden">
                        <p className="text-sm font-bold text-emerald-900 truncate">
                          {formPdfAttachment.fileName}
                        </p>
                        <p className="text-xs text-emerald-700">
                          {formPdfAttachment.fileSize 
                            ? `${(formPdfAttachment.fileSize / 1024).toFixed(1)} KB` 
                            : 'Dokumen PDF siap terlampir'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFormPdfAttachment(null)}
                      className="p-2 text-emerald-700 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors shrink-0"
                      title="Hapus Lampiran"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ) : (
                  <label className={cn(
                    "border-2 border-dashed border-gray-200 hover:border-blue-400 bg-gray-50/50 hover:bg-blue-50/20 rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all group",
                    formUploadingPdf && "opacity-60 pointer-events-none"
                  )}>
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={handleFileChange}
                      disabled={formUploadingPdf}
                      className="hidden"
                    />
                    {formUploadingPdf ? (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="animate-spin text-blue-600" size={28} />
                        <span className="text-xs font-bold text-gray-600">Sedang mengunggah dan memproses PDF...</span>
                      </div>
                    ) : (
                      <>
                        <div className="w-12 h-12 bg-white text-gray-400 group-hover:text-blue-600 rounded-2xl flex items-center justify-center shadow-sm mb-2 transition-colors">
                          <UploadCloud size={24} />
                        </div>
                        <p className="text-sm font-bold text-gray-700 group-hover:text-blue-600 transition-colors">
                          Klik untuk memilih file PDF
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Format resmi .pdf • Maksimal 10MB
                        </p>
                      </>
                    )}
                  </label>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-gray-100 flex flex-col-reverse sm:flex-row items-center justify-between gap-3 bg-gray-50/60">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                disabled={formSubmitting || formUploadingPdf}
                className="w-full sm:w-auto px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              >
                Batal
              </button>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => handleSaveForm('DRAFT')}
                  disabled={formSubmitting || formUploadingPdf}
                  className="flex-1 sm:flex-none px-5 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-sm font-bold rounded-xl transition-colors shadow-sm"
                >
                  {formSubmitting ? 'Menyimpan...' : 'Simpan Draf'}
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveForm('PUBLISHED')}
                  disabled={formSubmitting || formUploadingPdf}
                  className="flex-1 sm:flex-none px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-all shadow-md shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98]"
                >
                  {formSubmitting ? (
                    <span className="flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin" />
                      Menerbitkan...
                    </span>
                  ) : (
                    'Terbitkan Sekarang'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: Preview Detail Informasi                          */}
      {/* ======================================================== */}
      {isPreviewOpen && previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl border border-gray-100 my-8 overflow-hidden">
            {/* Preview Header */}
            <div className="p-6 border-b border-gray-100 flex items-start justify-between bg-gradient-to-r from-blue-50/30 to-indigo-50/30">
              <div className="space-y-2 pr-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn(
                    "px-2.5 py-0.5 rounded-full text-xs font-bold border",
                    getCategoryBadgeClass(previewItem.category)
                  )}>
                    {previewItem.category}
                  </span>
                  {previewItem.isPinned && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-100 text-amber-800 rounded-full text-xs font-bold">
                      <Pin size={10} className="fill-amber-700" />
                      Disematkan
                    </span>
                  )}
                  {getStatusBadge(previewItem.status)}
                </div>
                <h2 className="text-xl md:text-2xl font-black text-gray-900 leading-snug">
                  {previewItem.title}
                </h2>
                <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <Calendar size={14} className="text-blue-600" />
                    {previewItem.publishDate || 'Tanggal tidak diset'}
                  </span>
                  <span>•</span>
                  <span>Oleh: <strong className="text-gray-800">{previewItem.authorName}</strong></span>
                  <span>•</span>
                  <span>Sasaran: <strong className="text-gray-800">{previewItem.targetGradeNames?.join(', ') || 'Semua Kelas'}</strong></span>
                </div>
              </div>
              <button
                onClick={() => setIsPreviewOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors shrink-0"
              >
                <X size={20} />
              </button>
            </div>

            {/* Preview Body */}
            <div className="p-6 md:p-8 space-y-6 overflow-y-auto flex-1">
              {/* Teks Konten */}
              {previewItem.content && (
                <div className="prose max-w-none text-gray-700 text-sm md:text-base leading-relaxed whitespace-pre-wrap bg-gray-50/50 p-6 rounded-2xl border border-gray-100 font-sans">
                  {previewItem.content}
                </div>
              )}

              {/* Lampiran PDF */}
              {previewItem.hasPdf && previewItem.pdfAttachment && (
                <div className="space-y-3 pt-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-gray-500 flex items-center gap-2">
                    <FileText size={16} className="text-emerald-600" />
                    Lampiran Dokumen PDF
                  </h4>

                  <div className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-12 h-12 bg-emerald-600 text-white rounded-2xl flex items-center justify-center shrink-0 shadow-sm">
                        <FileText size={22} />
                      </div>
                      <div className="overflow-hidden">
                        <p className="text-sm font-bold text-emerald-950 truncate">
                          {previewItem.pdfAttachment.fileName}
                        </p>
                        <p className="text-xs text-emerald-700">
                          {previewItem.pdfAttachment.fileSize 
                            ? `${(previewItem.pdfAttachment.fileSize / 1024).toFixed(1)} KB`
                            : 'Dokumen Resmi PDF'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <a
                        href={previewItem.pdfAttachment.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-emerald-500/20"
                      >
                        <span>Buka PDF</span>
                        <ExternalLink size={13} />
                      </a>
                      <a
                        href={previewItem.pdfAttachment.fileUrl}
                        download={previewItem.pdfAttachment.fileName}
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition-colors"
                      >
                        <Download size={13} />
                        <span>Unduh</span>
                      </a>
                    </div>
                  </div>

                  {/* Inline PDF Preview Frame */}
                  <div className="rounded-2xl border border-gray-200 overflow-hidden bg-gray-100 h-96">
                    <iframe
                      src={previewItem.pdfAttachment.fileUrl}
                      title={previewItem.pdfAttachment.fileName}
                      className="w-full h-full"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Preview Footer */}
            <div className="p-6 border-t border-gray-100 flex items-center justify-end bg-gray-50/60">
              <button
                onClick={() => setIsPreviewOpen(false)}
                className="px-6 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm font-bold rounded-xl transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: Konfirmasi Hapus                                 */}
      {/* ======================================================== */}
      {deleteConfirmItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl border border-gray-100 text-center">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
              <AlertCircle size={24} />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-gray-900">Hapus Informasi Sekolah?</h3>
              <p className="text-sm text-gray-500">
                Informasi &quot;<strong className="text-gray-700">{deleteConfirmItem.title}</strong>&quot; akan dihapus secara permanen.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setDeleteConfirmItem(null)}
                className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleDelete}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold rounded-xl transition-colors shadow-md shadow-rose-500/20"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
