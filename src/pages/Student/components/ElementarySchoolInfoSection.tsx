import React, { useState, useEffect } from 'react';
import { 
  Megaphone, FileText, Pin, ChevronRight, Calendar, 
  X, ExternalLink, Download, Loader2, Maximize2 
} from 'lucide-react';
import { 
  ElementarySchoolInformation, 
  ElementarySchoolInfoAttachment,
  getPublishedElementarySchoolInformationForStudent 
} from '../../../services/elementarySchoolInformationService';
import { Student } from '../../../types';

interface ElementarySchoolInfoSectionProps {
  studentData: Student | null;
  classData: any | null;
  unit?: string;
  raporCardSlot?: React.ReactNode;
}

export default function ElementarySchoolInfoSection({
  studentData,
  classData,
  unit = 'ELEMENTARY',
  raporCardSlot
}: ElementarySchoolInfoSectionProps) {
  const [schoolInfoList, setSchoolInfoList] = useState<ElementarySchoolInformation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInfo, setSelectedInfo] = useState<ElementarySchoolInformation | null>(null);
  const [showAllModal, setShowAllModal] = useState(false);
  const [pdfModalAttachment, setPdfModalAttachment] = useState<ElementarySchoolInfoAttachment | null>(null);

  useEffect(() => {
    // Only run query if unit is ELEMENTARY and student/class identity is ready
    if (unit !== 'ELEMENTARY') {
      setLoading(false);
      return;
    }

    const classId = classData?.id || studentData?.classId;
    const className = classData?.name;
    const grade = classData?.grade;

    // Verify class identity is ready
    if (!classId && !className && !grade) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    const fetchInfo = async () => {
      try {
        setLoading(true);
        const data = await getPublishedElementarySchoolInformationForStudent({
          classId,
          className,
          grade
        });
        if (isMounted) {
          setSchoolInfoList(data);
        }
      } catch (err) {
        console.warn('Failed to load elementary school information for student:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchInfo();

    return () => {
      isMounted = false;
    };
  }, [unit, classData?.id, classData?.name, classData?.grade, studentData?.classId]);

  // Display maximum 3 relevant information items on the dashboard
  const displayList = schoolInfoList.slice(0, 3);
  const primaryInfo = displayList[0] || null;
  const secondaryInfos = displayList.slice(1);

  return (
    <div className="space-y-8">
      {/* Two Main Cards Grid (Informasi Sekolah + Rapor Saya) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Card: Informasi Sekolah */}
        {loading ? (
          <div className="bg-white border border-gray-100 p-8 rounded-[2.5rem] shadow-sm flex flex-col justify-between group relative overflow-hidden h-[300px]">
            <div className="space-y-4">
              <div className="w-14 h-14 bg-blue-50 rounded-[1.5rem] flex items-center justify-center text-blue-600">
                <Loader2 size={26} className="animate-spin text-blue-600" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-gray-900 tracking-tight">Informasi Sekolah</h3>
                <p className="text-sm font-semibold text-gray-400">Memeriksa pengumuman terbaru...</p>
              </div>
            </div>
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-50 px-4 py-3 rounded-xl border border-gray-100 text-center">
              Pengumuman & Surat Edaran SD Lazuardi
            </div>
          </div>
        ) : !primaryInfo ? (
          <div className="bg-white border border-gray-100 p-8 rounded-[2.5rem] shadow-sm flex flex-col justify-between group relative overflow-hidden h-[300px]">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl -mr-10 -mt-10 group-hover:scale-110 transition-transform duration-500" />
            
            <div className="space-y-4 relative">
              <div className="w-14 h-14 bg-blue-50 rounded-[1.5rem] flex items-center justify-center text-blue-600">
                <Megaphone size={28} />
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-2xl font-black text-gray-900 tracking-tight">
                    Informasi Sekolah
                  </h3>
                  <span className="px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg text-[9px] font-black uppercase tracking-wider">
                    Terkini
                  </span>
                </div>
                <p className="text-sm font-semibold text-gray-500">
                  Belum ada pengumuman baru untuk kelasmu saat ini.
                </p>
              </div>
            </div>
            
            <div className="pt-6 relative">
              <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-50 px-4 py-3 rounded-xl border border-gray-100 text-center">
                Pengumuman & Surat Edaran SD Lazuardi
              </div>
            </div>
          </div>
        ) : (
          <div 
            onClick={() => setSelectedInfo(primaryInfo)}
            className="bg-white border border-gray-100 p-8 rounded-[2.5rem] shadow-sm hover:shadow-xl hover:border-blue-200 transition-all flex flex-col justify-between group relative overflow-hidden h-[300px] cursor-pointer"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl -mr-10 -mt-10 group-hover:scale-110 transition-transform duration-500" />
            
            <div className="space-y-3 relative">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all duration-300">
                  <Megaphone size={24} />
                </div>
                <div className="flex flex-wrap items-center gap-1.5 justify-end">
                  {primaryInfo.isPinned && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 rounded-md text-[9px] font-black uppercase tracking-wider">
                      <Pin size={9} className="fill-amber-700" />
                      Penting
                    </span>
                  )}
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-md text-[9px] font-black uppercase tracking-wider">
                    {primaryInfo.category}
                  </span>
                  {primaryInfo.hasPdf && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-[9px] font-black uppercase tracking-wider">
                      <FileText size={9} />
                      PDF
                    </span>
                  )}
                </div>
              </div>
              
              <div className="space-y-1.5">
                <h3 className="text-xl font-black text-gray-900 tracking-tight group-hover:text-blue-600 transition-colors line-clamp-2 leading-snug">
                  {primaryInfo.title}
                </h3>
                <p className="text-xs font-semibold text-gray-500 line-clamp-2 leading-relaxed">
                  {primaryInfo.summary || primaryInfo.content || 'Klik untuk membaca detail informasi lengkap.'}
                </p>
              </div>
            </div>
            
            <div className="pt-4 relative flex items-center justify-between text-blue-600 font-black text-[10px] uppercase tracking-widest border-t border-gray-50">
              <span className="text-gray-400 font-bold lowercase tracking-normal">
                {primaryInfo.publishDate || 'Informasi terbaru'}
              </span>
              <div className="flex items-center gap-1">
                <span>Baca Informasi</span>
                <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </div>
        )}

        {/* Slot for Rapor Saya Card */}
        {raporCardSlot}
      </div>

      {/* Up to 3 information items: display cards 2 & 3 if present */}
      {secondaryInfos.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {secondaryInfos.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelectedInfo(item)}
              className="bg-white border border-gray-100 p-5 rounded-3xl shadow-sm hover:shadow-md hover:border-blue-200 transition-all cursor-pointer flex flex-col justify-between group"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {item.isPinned && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 rounded-md text-[9px] font-black uppercase tracking-wider">
                        <Pin size={8} className="fill-amber-700" />
                        Penting
                      </span>
                    )}
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md text-[9px] font-bold">
                      {item.category}
                    </span>
                  </div>
                  {item.hasPdf && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-[9px] font-black uppercase tracking-wider">
                      <FileText size={8} />
                      PDF
                    </span>
                  )}
                </div>

                <h4 className="text-sm font-black text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-1">
                  {item.title}
                </h4>
                <p className="text-xs text-gray-500 line-clamp-2">
                  {item.summary || item.content}
                </p>
              </div>

              <div className="pt-3 mt-2 border-t border-gray-50 flex items-center justify-between text-[10px] font-bold text-gray-400">
                <span>{item.publishDate || 'Informasi terbaru'}</span>
                <span className="text-blue-600 flex items-center gap-1 font-black uppercase tracking-wider">
                  Baca Informasi <ChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Multi-announcements Banner (if > 1 announcements) */}
      {schoolInfoList.length > 1 && (
        <div className="flex items-center justify-between p-4 px-6 bg-blue-50/80 border border-blue-100 rounded-3xl shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
              <Megaphone size={16} />
            </div>
            <div>
              <p className="text-xs font-bold text-blue-900">
                Ada {schoolInfoList.length} informasi sekolah aktif untukmu & orang tua
              </p>
              <p className="text-[11px] text-blue-600 font-medium">
                Klik tombol di samping untuk melihat seluruh daftar pengumuman.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowAllModal(true)}
            className="px-4 py-2 bg-white hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200 text-xs font-bold rounded-xl transition-all shadow-sm"
          >
            Lihat Semua ({schoolInfoList.length})
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: Detail Informasi Lengkap                         */}
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
                      {/* Button: Pop-up Besar */}
                      <button
                        onClick={() => setPdfModalAttachment(selectedInfo.pdfAttachment!)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                      >
                        <Maximize2 size={13} />
                        <span>Lihat PDF</span>
                      </button>

                      {/* Button: Buka di Tab Baru */}
                      <a
                        href={selectedInfo.pdfAttachment.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                      >
                        <ExternalLink size={13} />
                        <span>Tab Baru</span>
                      </a>

                      {/* Button: Unduh */}
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
            {/* Modal Header */}
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

            {/* Modal Body: PDF Viewer Frame */}
            <div className="flex-1 bg-gray-100 relative overflow-hidden flex flex-col">
              <iframe
                src={pdfModalAttachment.fileUrl}
                title={pdfModalAttachment.fileName}
                className="w-full flex-1 border-0"
              />
              {/* Fallback notification */}
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

      {/* ======================================================== */}
      {/* MODAL: Daftar Seluruh Informasi Sekolah                  */}
      {/* ======================================================== */}
      {showAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-blue-50/40">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 text-white rounded-2xl flex items-center justify-center">
                  <Megaphone size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-gray-900">
                    Daftar Informasi Sekolah
                  </h3>
                  <p className="text-xs text-gray-500 font-medium">
                    Semua pengumuman dan surat edaran resmi yang aktif
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAllModal(false)}
                className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-3 overflow-y-auto flex-1 divide-y divide-gray-100">
              {schoolInfoList.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm font-semibold">
                  Belum ada pengumuman yang diterbitkan.
                </div>
              ) : (
                schoolInfoList.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      setSelectedInfo(item);
                      setShowAllModal(false);
                    }}
                    className="pt-3 first:pt-0 p-3 hover:bg-blue-50/50 rounded-2xl transition-all cursor-pointer group flex items-start justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 text-blue-700">
                          {item.category}
                        </span>
                        {item.isPinned && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 rounded-md text-[10px] font-bold">
                            <Pin size={9} className="fill-amber-700" />
                            Penting
                          </span>
                        )}
                        {item.hasPdf && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md text-[10px] font-bold">
                            <FileText size={9} />
                            PDF
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                        {item.title}
                      </h4>
                      <p className="text-xs text-gray-500 line-clamp-2">
                        {item.summary || item.content}
                      </p>
                      <p className="text-[10px] text-gray-400 font-medium pt-1">
                        {item.publishDate || ''} • Oleh: {item.authorName}
                      </p>
                    </div>
                    <ChevronRight size={18} className="text-gray-300 group-hover:text-blue-600 group-hover:translate-x-1 transition-all shrink-0 mt-2" />
                  </div>
                ))
              )}
            </div>

            <div className="p-4 border-t border-gray-100 flex justify-end bg-gray-50/60">
              <button
                onClick={() => setShowAllModal(false)}
                className="px-5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-bold rounded-xl transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
