import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Send, Brain, ChevronRight, MessageSquareQuote, Loader2, Edit3, Check } from 'lucide-react';
import { cn } from '../../lib/utils';

import { GoogleGenAI, Type } from '@google/genai';

export default function Reflection() {
  const [topic, setTopic] = React.useState('Belajar');
  const [incident, setIncident] = React.useState('');
  const [feelings, setFeelings] = React.useState('');
  const [improvement, setImprovement] = React.useState('');
  const [isAiLoading, setIsAiLoading] = React.useState(false);
  const [aiResult, setAiResult] = React.useState<{ reflection: string; questions: string[] } | null>(null);
  const [isEditingAi, setIsEditingAi] = React.useState(false);
  const [showAiLabel, setShowAiLabel] = React.useState(false);

  const handleAiAssist = async () => {
    if (!incident || !feelings) {
      alert('Tolong ceritakan dulu kejadiannya dan apa yang kamu rasakan ya.');
      return;
    }

    setIsAiLoading(true);
    setAiResult(null);
    setShowAiLabel(false);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `Bantu siswa SMP melakukan refleksi diri. Topik: ${topic}. Kejadian: "${incident}". Perasaan: "${feelings}". Harapan: "${improvement}". Berikan narasi refleksi yang empatik dan 3 pertanyaan pendalaman. Kembalikan dalam JSON format dengan field 'reflection' (string) dan 'questions' (array of strings).`;
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reflection: { type: Type.STRING },
              questions: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["reflection", "questions"]
          }
        }
      });
      
      const resData = JSON.parse(response.text || '{}');
      setAiResult({
        reflection: resData.reflection || '',
        questions: resData.questions || []
      });
      setIsEditingAi(true); // Open for editing as draft
      setShowAiLabel(true);
    } catch (error) {
      console.error("AI Error:", error);
      setAiResult({
        reflection: "Maaf, sepertinya Lumina sedang lelah. Coba ceritakan lagi nanti ya.",
        questions: ["Apa satu hal yang tetap membuatmu bersyukur hari ini?"]
      });
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Jurnal Refleksi Diri</h1>
        <p className="text-gray-500">Mari bercerita dengan jujur ke diri sendiri, Lumina siap mendampingi.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
        {/* Form Section */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 space-y-6">
            <div className="space-y-4">
              <label className="text-sm font-semibold text-gray-700 block">Apa yang ingin kamu refleksikan hari ini?</label>
              <div className="flex flex-wrap gap-2">
                {['Belajar', 'Pergaulan', 'Proyek', 'Lainnya'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTopic(t)}
                    className={cn(
                      "px-4 py-2 rounded-full text-sm font-medium transition-all",
                      topic === t ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-sm font-semibold text-gray-700 block">Ceritakan apa yang terjadi...</label>
              <textarea
                rows={3}
                placeholder="Apa hal utama yang terjadi minggu ini?"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
                value={incident}
                onChange={(e) => setIncident(e.target.value)}
              />
            </div>

            <div className="space-y-4">
              <label className="text-sm font-semibold text-gray-700 block">Bagaimana perasaanmu saat itu?</label>
              <textarea
                rows={2}
                placeholder="Apakah kamu merasa sedih, marah, senang, atau bingung?"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
                value={feelings}
                onChange={(e) => setFeelings(e.target.value)}
              />
            </div>

            <div className="space-y-4">
              <label className="text-sm font-semibold text-gray-700 block">Apa satu hal kecil yang ingin kamu perbaiki?</label>
              <textarea
                rows={2}
                placeholder="Satu langkah kecil saja untuk membuat besok lebih baik..."
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
                value={improvement}
                onChange={(e) => setImprovement(e.target.value)}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={handleAiAssist}
                disabled={isAiLoading}
                className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-100 hover:opacity-90 transition-all disabled:opacity-50"
              >
                {isAiLoading ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
                Bantu Refleksi dengan AI
              </button>
              <button className="px-6 py-3 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 transition-all">
                Simpan
              </button>
            </div>
          </div>
        </div>

        {/* AI Output Section */}
        <div className="lg:col-span-2">
          <AnimatePresence mode="wait">
            {!aiResult ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="bg-blue-50/50 border-2 border-dashed border-blue-200 rounded-3xl p-8 text-center space-y-4"
              >
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto text-blue-500">
                  <Brain size={32} />
                </div>
                <div className="space-y-2">
                  <h3 className="font-bold text-blue-800">Butuh Bantuan Berpikir?</h3>
                  <p className="text-sm text-blue-600 leading-relaxed">
                    Tuliskan ceritamu di sebelah kiri, lalu klik tombol AI. Lumina akan membantu merangkum pikiranmu.
                  </p>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="result"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-6"
              >
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-blue-100 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-3 opacity-10">
                    <MessageSquareQuote size={48} />
                  </div>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-blue-600 uppercase tracking-widest">
                      <Sparkles size={16} />
                      Refleksi Lumina
                    </h3>
                    <button 
                      onClick={() => setIsEditingAi(!isEditingAi)}
                      className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-400 transition-colors"
                    >
                      {isEditingAi ? <Check size={16} /> : <Edit3 size={16} />}
                    </button>
                  </div>
                  
                  {isEditingAi ? (
                    <textarea 
                      className="w-full bg-blue-50/30 p-4 rounded-xl border border-blue-100 text-sm text-gray-700 leading-relaxed outline-none focus:ring-2 focus:ring-blue-500"
                      rows={6}
                      value={aiResult.reflection}
                      onChange={(e) => setAiResult({...aiResult, reflection: e.target.value})}
                    />
                  ) : (
                    <p className="text-gray-700 leading-relaxed text-sm italic">
                      "{aiResult.reflection}"
                    </p>
                  )}
                  
                  {showAiLabel && (
                    <p className="text-[10px] text-blue-500 font-bold italic mt-4">Dihasilkan oleh Lumina AI – mohon review sebelum disimpan</p>
                  )}
                </div>

                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest px-2">Coba rungkan pertanyaan ini...</h3>
                  {aiResult.questions.map((q, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className="bg-white p-4 rounded-xl border border-gray-100 text-sm text-gray-700 flex gap-3 hover:border-blue-200 transition-colors cursor-pointer group"
                    >
                      <div className="w-5 h-5 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                        {idx + 1}
                      </div>
                      <p className="group-hover:text-blue-600 transition-colors">{q}</p>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
