import * as React from 'react';
import { motion } from 'motion/react';
import { Search, UserCheck, ChevronRight, Zap, Target, BookOpen, Sparkles, Loader2, Edit3, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { GoogleGenAI } from '@google/genai';

const mockStudentSummaries = [
  {
    id: 'S001',
    name: 'Dika Ramadhan',
    classId: '8-A',
    strengths: ['Desain Grafis', 'Matematika'],
    shortGoal: 'Membuat website portofolio',
    reflectionCount: 12,
    lastUpdate: '2 jam yang lalu'
  },
  {
    id: 'S005',
    name: 'Siti Aminah',
    classId: '7-C',
    strengths: ['Public Speaking', 'Bahasa Arab'],
    shortGoal: 'Menang lomba debat sekolah',
    reflectionCount: 5,
    lastUpdate: 'Kemarin'
  }
];

export default function MentorDashboard() {
  const [summaries, setSummaries] = React.useState<Record<string, { text: string; isEditing: boolean; showLabel: boolean }>>({});
  const [loadingId, setLoadingId] = React.useState<string | null>(null);

  const handleGenerateSummary = async (studentId: string, studentName: string) => {
    setLoadingId(studentId);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `Buat ringkasan eksplorasi diri (kekuatan dan mimpi) siswa Junior High bernama ${studentName}. Gunakan bahasa yang memotivasi untuk mentor. Maksimal 3 kalimat.`;
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt
      });
      
      setSummaries(prev => ({
        ...prev,
        [studentId]: { text: response.text || '', isEditing: true, showLabel: true }
      }));
    } catch (error) {
      console.error("AI Error:", error);
    } finally {
      setLoadingId(null);
    }
  };

  const toggleEdit = (studentId: string) => {
    setSummaries(prev => ({
      ...prev,
      [studentId]: { ...prev[studentId], isEditing: !prev[studentId].isEditing }
    }));
  };

  const updateText = (studentId: string, text: string) => {
    setSummaries(prev => ({
      ...prev,
      [studentId]: { ...prev[studentId], text }
    }));
  };
  return (
    <div className="space-y-8 pb-12">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Pantauan Self-Exploration Siswa</h1>
        <p className="text-gray-500">Melihat progres dan mimpi siswa binaanmu di tingkat Junior High.</p>
      </header>

      <div className="flex gap-4 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            placeholder="Cari nama siswa binaan..."
            className="w-full pl-10 pr-4 py-3 bg-white rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button className="px-6 py-3 bg-white border border-gray-200 rounded-xl font-bold text-gray-600 flex items-center gap-2">
          <UserCheck size={18} />
          Binaan Saya
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {mockStudentSummaries.map((s, idx) => (
          <motion.div
            key={s.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.1 }}
            className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow group"
          >
            <div className="flex justify-between items-start mb-6">
              <div className="flex gap-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 font-bold">
                  {s.name[0]}
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">{s.name}</h3>
                  <p className="text-xs text-gray-500">Kelas {s.classId} • Update {s.lastUpdate}</p>
                </div>
              </div>
              <Link to={`/exploration/student/${s.id}`} className="p-2 bg-gray-50 rounded-lg text-gray-400 group-hover:text-blue-500 group-hover:bg-blue-50 transition-all">
                <ChevronRight size={20} />
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              {/* ... (existing strengths/goal) */}
              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  <Zap size={10} className="text-yellow-500" /> 
                  Kekuatan
                </p>
                <div className="flex flex-wrap gap-1">
                  {s.strengths.map(st => (
                    <span key={st} className="px-2 py-0.5 bg-yellow-50 text-yellow-700 rounded-md text-[10px] font-bold ring-1 ring-yellow-100">
                      {st}
                    </span>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  <Target size={10} className="text-blue-500" />
                  Target Saat Ini
                </p>
                <p className="text-xs text-gray-700 font-medium line-clamp-1">{s.shortGoal}</p>
              </div>
            </div>

            {/* AI Summary Section */}
            <div className="bg-blue-50/50 rounded-xl p-4 border border-blue-100/50 mb-6">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-1.5">
                  <Sparkles size={14} className="text-blue-600" />
                  <span className="text-[10px] font-black uppercase text-blue-600 tracking-wider">Highlight AI</span>
                </div>
                {summaries[s.id] ? (
                   <button 
                    onClick={() => toggleEdit(s.id)}
                    className="p-1 text-blue-400 hover:text-blue-600"
                   >
                     {summaries[s.id].isEditing ? <Check size={14} /> : <Edit3 size={14} />}
                   </button>
                ) : (
                  <button 
                    onClick={() => handleGenerateSummary(s.id, s.name)}
                    disabled={loadingId === s.id}
                    className="text-[10px] font-bold text-blue-600 hover:underline disabled:opacity-50"
                  >
                    {loadingId === s.id ? 'Memproses...' : 'Buat Ringkasan (AI)'}
                  </button>
                )}
              </div>
              {summaries[s.id] && (
                <>
                  {summaries[s.id].isEditing ? (
                    <textarea 
                      className="w-full bg-white border border-blue-100 rounded-lg p-2 text-xs text-gray-700 outline-none"
                      rows={2}
                      value={summaries[s.id].text}
                      onChange={(e) => updateText(s.id, e.target.value)}
                    />
                  ) : (
                    <p className="text-xs text-gray-600 italic">"{summaries[s.id].text}"</p>
                  )}
                  {summaries[s.id].showLabel && (
                    <p className="text-[9px] text-blue-500 italic mt-1 font-bold">Dihasilkan oleh Lumina AI – mohon review sebelum disimpan</p>
                  )}
                </>
              )}
            </div>

            <div className="pt-4 border-t border-gray-50 flex justify-between items-center">
              <div className="flex items-center gap-2 text-gray-400">
                <BookOpen size={16} />
                <span className="text-xs font-medium">{s.reflectionCount} Jurnal Refleksi</span>
              </div>
              <button className="text-xs font-bold text-blue-600 hover:underline">
                Lihat Semua Progres
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
