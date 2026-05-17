import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { 
  BarChart3, LayoutGrid, AlertTriangle, ChevronRight, 
  Settings2, Bell, Users, ShieldAlert, TrendingDown, Sparkles, Loader2, Edit3, Check, Save
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { GoogleGenAI } from '@google/genai';

const distributionData: any[] = [];
const areaData: any[] = [];
const alerts: any[] = [];

export default function LiteracyRecap() {
  const [selectedArea, setSelectedArea] = React.useState('Bahasa');
  const [isAiLoading, setIsAiLoading] = React.useState(false);
  const [aiSummary, setAiSummary] = React.useState('');
  const [isEditingAi, setIsEditingAi] = React.useState(false);
  const [showAiLabel, setShowAiLabel] = React.useState(false);

  const handleAiRecap = async () => {
    setIsAiLoading(true);
    setAiSummary('');
    setShowAiLabel(false);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      // In real scenario, use real distribution data
      const prompt = `Buat ringkasan perkembangan literasi dan numerasi kelas 8-A. Data: 15 siswa Level 3 (Lancar), 8 siswa Level 2 (Cukup), 3 siswa Level 1 (Butuh Perhatian). Berikan analisis tren dan rekomendasi strategi kelas. Maksimal 4 kalimat.`;
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt
      });
      
      setAiSummary(response.text || '');
      setIsEditingAi(true); // Open for editing as draft
      setShowAiLabel(true);
    } catch (error) {
      console.error("AI Error:", error);
      setAiSummary("Data menunjukkan mayoritas siswa berada pada Level 3. Fokus utama bulan ini adalah membantu 3 siswa di Level 1 melalui bimbingan intensif.");
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Rekap Literasi & Numerasi</h1>
          <p className="text-gray-500 font-medium tracking-tight">Monitoring capaian dan deteksi risiko akademik.</p>
        </div>
        <div className="flex gap-3">
          <select className="bg-white px-4 py-2 rounded-xl border border-gray-200 text-sm font-bold outline-none shadow-sm">
            <option>Semester Genap 2025/2026</option>
            <option>Semester Ganjil 2025/2026</option>
          </select>
        </div>
      </header>

      <div className="flex justify-end pr-2">
        <button 
          onClick={handleAiRecap}
          disabled={isAiLoading}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md hover:bg-blue-700 transition-all disabled:opacity-50"
        >
          {isAiLoading ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
          Analisis Kelas dengan AI
        </button>
      </div>

      <AnimatePresence>
        {aiSummary && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl p-8 border border-blue-100 shadow-sm space-y-4"
          >
            <div className="flex justify-between items-center bg-blue-50/50 px-4 py-2 rounded-xl border border-blue-100">
               <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-blue-600" />
                  <span className="text-[11px] font-black uppercase text-blue-600 tracking-wider">Kesimpulan Strategis Lumina AI</span>
               </div>
               <button 
                  onClick={() => setIsEditingAi(!isEditingAi)}
                  className="p-1.5 hover:bg-blue-100 rounded-lg text-blue-400 transition-colors"
                >
                  {isEditingAi ? <Check size={16} /> : <Edit3 size={16} />}
                </button>
            </div>
            {isEditingAi ? (
              <textarea 
                className="w-full bg-gray-50 p-4 rounded-xl border border-gray-200 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                value={aiSummary}
                onChange={(e) => setAiSummary(e.target.value)}
              />
            ) : (
              <p className="text-gray-700 leading-relaxed text-sm">
                "{aiSummary}"
              </p>
            )}
            <div className="flex justify-between items-center">
              {showAiLabel && (
                <p className="text-[10px] text-blue-500 italic font-bold">Dihasilkan oleh Lumina AI – mohon review sebelum disimpan</p>
              )}
              <div className="flex gap-2">
                <button className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-all">
                  <Save size={14} />
                  Simpan Ringkasan
                </button>
                <button 
                  onClick={() => setAiSummary('')}
                  className="text-xs font-bold text-gray-400 hover:text-gray-600 px-3 py-1.5"
                >
                  Batal
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Level Distribution (Pie Chart) */}
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <LayoutGrid size={18} className="text-blue-500" />
              Distribusi Level
            </h3>
            <span className="text-[10px] font-black uppercase text-gray-400">Semua Area</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={distributionData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {distributionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-4">
             {distributionData.map(item => (
               <div key={item.name} className="flex items-center gap-2">
                 <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.fill }} />
                 <span className="text-xs text-gray-500 font-medium">{item.name}: <span className="font-bold text-gray-900">{item.value} Siswa</span></span>
               </div>
             ))}
          </div>
        </div>

        {/* Global Progress per Area (Bar Chart) */}
        <div className="lg:col-span-2 bg-white rounded-3xl p-8 shadow-sm border border-gray-100 space-y-6">
           <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <BarChart3 size={18} className="text-purple-500" />
              Perbandingan Capaian per Area
            </h3>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={areaData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                <Tooltip cursor={{fill: '#f9fafb'}} />
                <Legend iconType="circle" />
                <Bar dataKey="L1" name="Belum Lancar (L1)" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} />
                <Bar dataKey="L2" name="Cukup (L2)" stackId="a" fill="#eab308" />
                <Bar dataKey="L3" name="Lancar (L3)" stackId="a" fill="#3b82f6" />
                <Bar dataKey="L4" name="Mahir (L4)" stackId="a" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Stagnancy Alerts */}
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 space-y-6">
           <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <Bell size={18} className="text-red-500" />
              Siswa Berisiko (Stagnan/Tingkat Rendah)
            </h3>
            <Settings2 size={16} className="text-gray-300" />
          </div>
          <div className="space-y-4">
            {alerts.map((alert, idx) => (
              <div key={idx} className="p-5 bg-red-50 border border-red-100 rounded-2xl flex justify-between items-center group">
                 <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-red-600">
                      <TrendingDown size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{alert.name}</p>
                      <p className="text-xs text-red-700 font-medium">Area: {alert.area}</p>
                      <p className="text-[10px] text-red-500 font-bold uppercase mt-1 tracking-wider">{alert.reason}</p>
                    </div>
                 </div>
                 <div className="flex flex-col gap-2">
                    <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-red-600 border border-red-200 rounded-lg text-[10px] font-bold hover:bg-red-600 hover:text-white transition-all shadow-sm">
                       Eskalasi ke MTSS
                       <ChevronRight size={12} />
                    </button>
                    <button className="text-[10px] text-gray-400 font-bold hover:text-gray-600 text-center">Beri Catatan</button>
                 </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action / Next Steps */}
        <div className="bg-blue-600 rounded-3xl p-8 text-white space-y-6 shadow-xl relative overflow-hidden">
           <div className="absolute top-0 right-0 p-8 opacity-10">
              <ShieldAlert size={120} />
           </div>
           <div className="space-y-2 relative z-10">
              <h3 className="text-xl font-bold flex items-center gap-2">
                Program Peningkatan Literasi
              </h3>
              <p className="text-blue-100 text-sm leading-relaxed opacity-90">
                Gunakan data rekap ini untuk merancang kelompok belajar intensif (remedial) atau tantangan pengayaan bagi siswa di level Mahir.
              </p>
           </div>
           <div className="grid grid-cols-2 gap-4 relative z-10 pt-4">
              <div className="bg-white/10 p-4 rounded-2xl border border-white/20">
                <p className="text-2xl font-black">5</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-200">Siswa Butuh Intervensi</p>
              </div>
              <div className="bg-white/10 p-4 rounded-2xl border border-white/20">
                <p className="text-2xl font-black">86%</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-200">Kenaikan Level Rata-rata</p>
              </div>
           </div>
           <div className="pt-4">
             <button className="w-full py-3 bg-white text-blue-600 font-bold rounded-2xl hover:bg-blue-50 transition-all flex items-center justify-center gap-2">
                <Users size={18} />
                Kelola Kelompok Intervensi
             </button>
           </div>
        </div>
      </div>
    </div>
  );
}
