import React, { useState, useEffect } from 'react';
import { 
  Megaphone, Search, FileText, Pin, Calendar, 
  ChevronRight, X, ExternalLink, Download, Loader2, Maximize2 
} from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { User as AppUser, Student } from '../../types';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { 
  ElementarySchoolInformation, 
  ElementarySchoolInfoAttachment,
  getPublishedElementarySchoolInformationForStudent 
} from '../../services/elementarySchoolInformationService';

export default function StudentSchoolInformationPage() {
  const { currentUser, activeUnit } = useOutletContext<{ currentUser: AppUser; activeUnit?: string }>();
  
  const [informationList, setInformationList] = useState<ElementarySchoolInformation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedInfo, setSelectedInfo] = useState<ElementarySchoolInformation | null>(null);
  const [pdfModalAttachment, setPdfModalAttachment] = useState<ElementarySchoolInfoAttachment | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchStudentDataAndInfo = async () => {
      if (!currentUser || currentUser.role !== 'STUDENT') {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const studentId = currentUser.luminaId;
        let classDetails: any = null;

        if (studentId && studentId.trim()) {
          const studentProfileRef = doc(db, 'students', studentId.trim());
          const studentProfileSnap = await getDoc(studentProfileRef);
          if (studentProfileSnap.exists()) {
            const studentProfile = studentProfileSnap.data();
            const enrollment = studentProfile.enrollmentHistory?.[0] || {};
            if (enrollment.classId) {
              const classDocRef = doc(db, 'classes', enrollment.classId);
              const classDocSnap = await getDoc(classDocRef);
              if (classDocSnap.exists()) {
                classDetails = { id: classDocSnap.id, ...classDocSnap.data() };
              } else {
                const qClass = query(
                  collection(db, 'classes'),
                  where('name', '==', enrollment.classId)
                );
                const qClassSnap = await getDocs(qClass);
                if (!qClassSnap.empty) {
                  classDetails = { id: qClassSnap.docs[0].id, ...qClassSnap.docs[0].data() };
                }
              }
            }
          }
        }

        const data = await getPublishedElementarySchoolInformationForStudent({
          classId: classDetails?.id,
          className: classDetails?.name,
          grade: classDetails?.grade
        });

        if (isMounted) {
          setInformationList(data);
        }
      } catch (err) {
        console.error('Error fetching student school information:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchStudentDataAndInfo();

    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  // Categories list
  const categories = ['ALL', 'Pengumuman', 'Surat Edaran', 'Agenda', 'Kegiatan Sekolah', 'Prestasi', 'Akademik'];

  // Filtered list
  const filteredList = informationList.filter(item => {
    const matchCategory = selectedCategory === 'ALL' || item.category === selectedCategory;
    const matchSearch = searchQuery.trim() === '' || 
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.summary && item.summary.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.content && item.content.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchCategory && matchSearch;
  });

  return (
    <div className="max-w-5xl mx-auto space-y-8 py-8 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -mr-16 -mt-16" />
        
        <div className="space-y-2 relative">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-black uppercase tracking-wider">
            <Megaphone size={14} />
            <span>SD Lazuardi Elementary</span>
          </div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">
            Informasi Sekolah
          </h1>
          <p className="text-sm font-medium text-gray-500 max-w-xl">
            Semua pengumuman, surat edaran, agenda, dan informasi penting resmi dari sekolah untuk siswa & orang tua.
          </p>
        </div>
      </div>

      {/* Search & Category Filter */}
      <div className="space-y-4">
        <div className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Cari judul informasi atau kata kunci..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm font-medium text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm"
          />
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                selectedCategory === cat
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-200'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {cat === 'ALL' ? 'Semua Kategori' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Information Cards List */}
      {loading ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest">
            Memuat Informasi Sekolah...
          </p>
        </div>
      ) : filteredList.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-3xl p-12 text-center space-y-3 shadow-sm">
          <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto text-gray-400">
            <Megaphone size={26} />
          </div>
          <h3 className="text-lg font-bold text-gray-800">Tidak ada informasi yang ditemukan</h3>
          <p className="text-sm text-gray-500 max-w-sm mx-auto">
            {searchQuery 
              ? 'Tidak ada pengumuman yang cocok dengan pencarian kata kunci tersebut.'
              : 'Belum ada pengumuman aktif untuk kategori ini.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredList.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelectedInfo(item)}
              className="bg-white border border-gray-100 p-6 rounded-3xl shadow-sm hover:shadow-xl hover:border-blue-200 transition-all flex flex-col justify-between group cursor-pointer"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {item.isPinned && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-100 text-amber-800 rounded-md text-[10px] font-black uppercase tracking-wider">
                        <Pin size={9} className="fill-amber-700" />
                        Penting
                      </span>
                    )}
                    <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-md text-[10px] font-black uppercase tracking-wider">
                      {item.category}
                    </span>
                  </div>

                  {item.hasPdf && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-[10px] font-black uppercase tracking-wider">
                      <FileText size={10} />
                      PDF
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <h3 className="text-lg font-black text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2 leading-snug">
                    {item.title}
                  </h3>
                  <p className="text-xs text-gray-500 font-medium line-clamp-3 leading-relaxed">
                    {item.summary || item.content}
                  </p>
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-gray-50 flex items-center justify-between text-xs text-gray-400">
                <span className="flex items-center gap-1 font-medium">
                  <Calendar size={13} className="text-blue-500" />
                  {item.publishDate || 'Informasi terbaru'}
                </span>
                <span className="text-blue-600 font-black text-xs uppercase tracking-wider flex items-center gap-1">
                  Baca Informasi <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: Detail Informasi                                  */}
      {/* ======================================================== */}
      {selectedInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl border border-gray-100 my-8 overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-gray-100 flex items-start justify-between bg-gradient-to-r from-blue-50/50 via-indigo-50/30 to-blue-50/50">
              <div className="space-y-2 pr-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                    {selectedInfo.category}
                  </span>
                  {selectedInfo.isPinned && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-100 text-amber-800 rounded-full text-xs font-bold">
                      <Pin size={10} className="fill-amber-700" />
                      Disematkan
                    </span>
                  )}
                  {selectedInfo.hasPdf && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-xs font-bold">
                      <FileText size={10} />
                      Lampiran PDF
                    </span>
                  )}
                </div>
                <h2 className="text-xl md:text-2xl font-black text-gray-900 leading-snug">
                  {selectedInfo.title}
                </h2>
                <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <Calendar size={13} className="text-blue-600" />
                    {selectedInfo.publishDate || 'Informasi Sekolah'}
                  </span>
                  <span>•</span>
                  <span>Penerbit: <strong className="text-gray-800">{selectedInfo.authorName}</strong></span>
                </div>
              </div>
              <button
                onClick={() => setSelectedInfo(null)}
                className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors shrink-0"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 md:p-8 space-y-6 overflow-y-auto flex-1">
              {/* Teks Konten */}
              {selectedInfo.content && (
                <div className="text-gray-700 text-sm md:text-base leading-relaxed whitespace-pre-wrap font-sans bg-gray-50/70 p-6 rounded-2xl border border-gray-100">
                  {selectedInfo.content}
                </div>
              )}

              {/* Lampiran PDF */}
              {selectedInfo.hasPdf && selectedInfo.pdfAttachment && (
                <div className="space-y-3 pt-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-gray-500 flex items-center gap-2">
                    <FileText size={15} className="text-emerald-600" />
                    Lampiran Dokumen Resmi PDF
                  </h4>

                  <div className="p-4 bg-emerald-50/70 rounded-2xl border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-12 h-12 bg-emerald-600 text-white rounded-2xl flex items-center justify-center shrink-0 shadow-sm">
                        <FileText size={22} />
                      </div>
                      <div className="overflow-hidden">
                        <p className="text-sm font-bold text-emerald-950 truncate">
                          {selectedInfo.pdfAttachment.fileName}
                        </p>
                        <p className="text-xs text-emerald-700">
                          {selectedInfo.pdfAttachment.fileSize 
                            ? `${(selectedInfo.pdfAttachment.fileSize / 1024).toFixed(1)} KB`
                            : 'Dokumen Resmi'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => setPdfModalAttachment(selectedInfo.pdfAttachment!)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                      >
                        <Maximize2 size={13} />
                        <span>Lihat PDF</span>
                      </button>

                      <a
                        href={selectedInfo.pdfAttachment.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                      >
                        <ExternalLink size={13} />
                        <span>Tab Baru</span>
                      </a>

                      <a
                        href={selectedInfo.pdfAttachment.fileUrl}
                        download={selectedInfo.pdfAttachment.fileName}
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition-colors"
                      >
                        <Download size={13} />
                        <span>Unduh</span>
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 px-6 border-t border-gray-100 flex items-center justify-between bg-gray-50/60">
              <span className="text-xs text-gray-400 font-medium">
                SD Lazuardi Elementary
              </span>
              <button
                onClick={() => setSelectedInfo(null)}
                className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-bold rounded-xl transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: Large PDF Viewer (95vw x 90vh Responsive)         */}
      {/* ======================================================== */}
      {pdfModalAttachment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-gray-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl sm:rounded-3xl w-[95vw] h-[90vh] flex flex-col shadow-2xl border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="p-4 px-6 border-b border-gray-200 flex items-center justify-between bg-gray-50 shrink-0">
              <div className="flex items-center gap-3 overflow-hidden pr-4">
                <div className="w-9 h-9 bg-emerald-600 text-white rounded-xl flex items-center justify-center shrink-0">
                  <FileText size={18} />
                </div>
                <div className="overflow-hidden">
                  <h3 className="text-sm sm:text-base font-bold text-gray-900 truncate">
                    {pdfModalAttachment.fileName}
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    Dokumen Informasi Sekolah SD Lazuardi
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={pdfModalAttachment.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                >
                  <ExternalLink size={13} />
                  <span className="hidden sm:inline">Buka di Tab Baru</span>
                  <span className="sm:hidden">Tab Baru</span>
                </a>
                <button
                  onClick={() => setPdfModalAttachment(null)}
                  className="p-1.5 sm:p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-200 rounded-xl transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 bg-gray-100 relative overflow-hidden flex flex-col">
              <iframe
                src={pdfModalAttachment.fileUrl}
                title={pdfModalAttachment.fileName}
                className="w-full flex-1 border-0"
              />
              <div className="p-2.5 px-4 bg-amber-50 border-t border-amber-200 text-amber-900 text-xs flex items-center justify-between shrink-0">
                <span>Jika PDF belum tampil di layar, silakan gunakan tombol "Buka di Tab Baru".</span>
                <a
                  href={pdfModalAttachment.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold underline text-amber-950 ml-2"
                >
                  Buka sekarang
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
