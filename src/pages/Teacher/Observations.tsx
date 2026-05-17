import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, Loader2, Save, Send, Users, Search, Filter, 
  MessageSquare, FileText, Check, Edit3, Heart, Plus
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface Observation {
  id: string;
  studentName: string;
  notes: string[];
  date: string;
}

const mockObservations: Observation[] = [
  {
    id: 'S001',
    studentName: 'Dika Ramadhan',
    notes: [
      'Menunjukkan minat tinggi pada proyek robotik.',
      'Sering membantu teman sekelas memahami konsep aljabar.',
      'Kemampuan komunikasi verbal meningkat pesat bulan ini.'
    ],
    date: '2026-04-22'
  },
  {
    id: 'S002',
    studentName: 'Alya Putri',
    notes: [
      'Kemajuan pesat di mata pelajaran Bahasa Indonesia.',
      'Masih perlu dorongan untuk berani presentasi di depan kelas.',
      'Sangat teliti dalam mengerjakan tugas mandiri.'
    ],
    date: '2026-04-21'
  }
];

import { GoogleGenAI } from '@google/genai';

export default function Observations() {
  const [selectedStudent, setSelectedStudent] = React.useState<Observation | null>(mockObservations[0]);
  const [isAiLoading, setIsAiLoading] = React.useState(false);
  const [reportType, setReportType] = React.useState<'NARRATIVE' | 'PARENT_SUMMARY'>('NARRATIVE');
  const [generatedText, setGeneratedText] = React.useState<string | null>(null);
  const [isEditing, setIsEditing] = React.useState(false);
  const [showAiLabel, setShowAiLabel] = React.useState(false);

  const handleAiGeneration = async () => {
    if (!selectedStudent) return;
    setIsAiLoading(true);
    setGeneratedText(null);
    setShowAiLabel(false);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const notesContext = selectedStudent.notes.join(". ");
      const prompt = reportType === 'NARRATIVE' 
        ? `Buat narasi perkembangan akademik formal untuk siswa ${selectedStudent.studentName} berdasarkan catatan: "${notesContext}". Gunakan nada profesional.`
        : `Buat ringkasan ramah untuk orang tua siswa ${selectedStudent.studentName} berdasarkan catatan: "${notesContext}". Gunakan nada hangat dan suportif.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });
      
      setGeneratedText(response.text || '');
      setIsEditing(true); // Open for editing
      setShowAiLabel(true);
    } catch (error) {
      console.error("AI Error:", error);
      setGeneratedText("Gagal menghasilkan narasi. Silakan coba lagi.");
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Observasi Siswa & Narasi</h1>
          <p className="text-gray-500">Ubah catatan harian guru menjadi narasi perkembangan yang bermakna.</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 bg-white text-gray-700 border border-gray-200 px-4 py-2 rounded-xl text-sm font-bold hover:bg-gray-50 transition-all">
            <Filter size={16} />
            Filter Kelas
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Student List Sidebar */}
        <div className="lg:col-span-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text"
              placeholder="Cari nama siswa..."
              className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
            {mockObservations.map(student => (
              <button
                key={student.id}
                onClick={() => {
                  setSelectedStudent(student);
                  setGeneratedText(null);
                }}
                className={cn(
                  "w-full flex items-center gap-4 p-4 text-left hover:bg-gray-50 transition-all border-b border-gray-50 last:border-0",
                  selectedStudent?.id === student.id ? "bg-blue-50 border-l-4 border-l-blue-600" : ""
                )}
              >
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                  {student.studentName[0]}
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">{student.studentName}</p>
                  <p className="text-[11px] text-gray-500 font-medium">Terakhir dicatat: {student.date}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Content Section */}
        <div className="lg:col-span-8 space-y-6">
          {selectedStudent ? (
            <>
              <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 space-y-6">
                <div className="flex items-center gap-3 border-b border-gray-50 pb-4">
                   <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                      <FileText size={20} />
                   </div>
                   <h2 className="text-lg font-bold text-gray-900">Catatan Observasi {selectedStudent.studentName}</h2>
                </div>
                
                <div className="space-y-3">
                  {selectedStudent.notes.map((note, idx) => (
                    <div key={idx} className="flex gap-3 p-4 bg-gray-50 rounded-xl border border-gray-100 text-sm italic text-gray-600">
                       <MessageSquare size={16} className="shrink-0 mt-1 text-gray-400" />
                       <p>"{note}"</p>
                    </div>
                  ))}
                  <button className="flex items-center gap-2 text-blue-600 text-xs font-bold px-4 py-2 hover:bg-blue-50 rounded-lg transition-all">
                     <Plus size={14} />
                     Tambah Catatan Baru
                  </button>
                </div>

                <div className="pt-6 border-t border-gray-100 flex flex-wrap gap-4">
                  <button 
                    onClick={() => { setReportType('NARRATIVE'); handleAiGeneration(); }}
                    disabled={isAiLoading}
                    className="flex-1 flex items-center justify-center gap-2 bg-gray-900 text-white font-bold py-3 rounded-xl hover:bg-gray-800 transition-all disabled:opacity-50"
                  >
                    {isAiLoading && reportType === 'NARRATIVE' ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
                    Buat Narasi Perkembangan
                  </button>
                  <button 
                    onClick={() => { setReportType('PARENT_SUMMARY'); handleAiGeneration(); }}
                    disabled={isAiLoading}
                    className="flex-1 flex items-center justify-center gap-2 bg-blue-50 text-blue-600 border border-blue-200 font-bold py-3 rounded-xl hover:bg-blue-100 transition-all disabled:opacity-50"
                  >
                    {isAiLoading && reportType === 'PARENT_SUMMARY' ? <Loader2 className="animate-spin" size={18} /> : <Heart size={18} />}
                    Ringkasan Ortu
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {generatedText && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-white rounded-2xl p-8 shadow-xl border border-blue-100 space-y-4 ring-2 ring-blue-50"
                  >
                    <div className="flex justify-between items-center bg-blue-50 px-4 py-2 rounded-xl border border-blue-100">
                      <div className="flex items-center gap-2">
                        <Sparkles size={16} className="text-blue-600" />
                        <span className="text-[11px] font-black uppercase text-blue-600 tracking-wider">
                          {reportType === 'NARRATIVE' ? 'Narasi Akademik Lumina' : 'Ringkasan Orang Tua Lumina'}
                        </span>
                      </div>
                      <button 
                        onClick={() => setIsEditing(!isEditing)}
                        className="text-blue-400 hover:text-blue-600 transition-colors"
                      >
                        {isEditing ? <Check size={20} /> : <Edit3 size={20} />}
                      </button>
                    </div>

                    {isEditing ? (
                      <textarea 
                        className="w-full p-4 bg-gray-50 rounded-xl border border-gray-200 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                        rows={6}
                        value={generatedText}
                        onChange={(e) => setGeneratedText(e.target.value)}
                      />
                    ) : (
                      <p className="text-gray-700 leading-relaxed text-sm p-2">
                        {generatedText}
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                       <div>
                          <p className="text-[10px] text-gray-300 font-bold uppercase tracking-wider">Lumina AI Assistant</p>
                          {showAiLabel && (
                            <p className="text-[10px] text-blue-500 italic font-bold mt-0.5">Dihasilkan oleh Lumina AI – mohon review sebelum disimpan</p>
                          )}
                       </div>
                       <div className="flex gap-2">
                         <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-100">
                           <Save size={14} />
                           Gunakan Narasi
                         </button>
                         <button className="flex items-center gap-2 px-4 py-2 bg-white text-gray-600 border border-gray-200 rounded-lg text-xs font-bold hover:bg-gray-50 transition-all">
                           <Send size={14} />
                           Kirim ke Ortu
                         </button>
                       </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center space-y-4 opacity-30 py-20 grayscale">
               <Users size={64} />
               <p className="font-bold text-gray-500">Pilih siswa untuk melihat catatan observasi</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
