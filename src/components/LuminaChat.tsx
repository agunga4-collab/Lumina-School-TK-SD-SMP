import * as React from "react";
import axios from "axios";
import { Sparkles, Send, Loader2, BookOpen, Clock, Bot, HelpCircle, CornerDownRight } from "lucide-react";
import { cn } from "../lib/utils";

interface Message {
  id: string;
  sender: "user" | "bot";
  textID?: string;
  textEN?: string;
  textCommon?: string; // Fallback or user prompt
  sources?: string[];
  timestamp: Date;
}

export default function LuminaChat({ userId }: { userId: string }) {
  const [messages, setMessages] = React.useState<Message[]>([
    {
      id: "welcome",
      sender: "bot",
      textID: "Halo! Saya Lumina Chat, asisten AI resmi Lazuardi GCS. Tanyakan apa saja mengenai kurikulum, peraturan sekolah, panduan guru, atau info MTSS & LXD akademis resmi.",
      textEN: "Hello! I am Lumina Chat, the official AI assistant of Lazuardi GCS. Ask me anything about the curriculum, school policies, teacher guides, or MTSS & LXD academic info.",
      timestamp: new Date()
    }
  ]);
  const [inputText, setInputText] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [activeLangTab, setActiveLangTab] = React.useState<"ID" | "EN">("ID");

  const popularPrompts = [
    "Apa visi dan misi dari Lazuardi GCS?",
    "Bagaimana panduan MTSS di unit Sekolah?",
    "Apa format standar laporan LXD guru?",
  ];

  const handleSend = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: Message = {
      id: `m-${Date.now()}-user`,
      sender: "user",
      textCommon: text,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText("");
    setLoading(true);

    try {
      const response = await axios.post("/api/lumina-chat", {
        question: text,
        userId: userId
      });

      const { answerID, answerEN, sources } = response.data;

      const botMsg: Message = {
        id: `m-${Date.now()}-bot`,
        sender: "bot",
        textID: answerID,
        textEN: answerEN,
        sources: sources || [],
        timestamp: new Date()
      };

      setMessages(prev => [...prev, botMsg]);
    } catch (err: any) {
      console.error("[LuminaChatError] Fail:", err);
      const errBotMsg: Message = {
        id: `m-${Date.now()}-bot`,
        sender: "bot",
        textID: `Maaf, terjadi kesalahan saat menghubungi AI: ${err.response?.data?.error || err.message}`,
        textEN: `Sorry, an error occurred while reaching the AI: ${err.response?.data?.error || err.message}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errBotMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-gray-150 rounded-[2.5rem] shadow-xl overflow-hidden max-w-4xl mx-auto mt-8 flex flex-col md:flex-row h-[550px] md:h-[450px]">
      {/* Sidebar: Useful info and popular hints */}
      <div className="bg-gray-50/70 p-6 md:w-1/3 border-b md:border-b-0 md:border-r border-gray-150 flex flex-col justify-between">
        <div className="space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-xl text-white shadow-md">
              <Bot size={18} />
            </div>
            <div>
              <h3 className="font-black text-gray-950 text-sm tracking-tight">Lumina Chat AI</h3>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Grounded Knowledge</p>
            </div>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed font-semibold">
            Asisten cerdas berbasis data internal Lazuardi GCS. Menjawab berdasarkan dokumen sah sekolah.
          </p>

          <div className="space-y-2 pt-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
              <HelpCircle size={10} className="text-blue-500" />
              Pertanyaan Populer:
            </p>
            <div className="flex flex-col gap-1.5">
              {popularPrompts.map((promptText, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSend(promptText)}
                  className="text-left text-xs text-gray-650 hover:text-blue-600 hover:bg-white p-2 rounded-xl border border-transparent hover:border-gray-150 transition-all font-semibold leading-relaxed bg-white/40 cursor-pointer"
                >
                  {promptText}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* System Language selection switch */}
        <div className="hidden md:flex justify-between items-center bg-white p-1 rounded-xl border border-gray-100 shadow-inner">
          <button
            type="button"
            onClick={() => setActiveLangTab("ID")}
            className={cn(
              "flex-1 py-1 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all",
              activeLangTab === "ID" ? "bg-gray-950 text-white shadow" : "text-gray-450 hover:text-gray-900"
            )}
          >
            🇮🇩 Indo
          </button>
          <button
            type="button"
            onClick={() => setActiveLangTab("EN")}
            className={cn(
              "flex-1 py-1 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all",
              activeLangTab === "EN" ? "bg-gray-950 text-white shadow" : "text-gray-450 hover:text-gray-900"
            )}
          >
            🇬🇧 English
          </button>
        </div>
      </div>

      {/* Main chat box body */}
      <div className="flex-1 flex flex-col justify-between h-full bg-slate-50/10">
        {/* Messages list */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className={cn("flex flex-col max-w-[85%]", msg.sender === "user" ? "ml-auto items-end" : "mr-auto items-start")}>
              {/* Message bubble */}
              <div
                className={cn(
                  "p-4 rounded-[1.5rem] text-xs leading-relaxed shadow-sm",
                  msg.sender === "user"
                    ? "bg-blue-600 text-white rounded-tr-none px-5 py-3"
                    : "bg-white text-gray-850 rounded-tl-none border border-gray-100"
                )}
              >
                {msg.sender === "user" ? (
                  <p className="font-semibold">{msg.textCommon}</p>
                ) : (
                  <div>
                    {/* Mobile inline tabs if needed */}
                    <p className="font-medium whitespace-pre-wrap leading-relaxed">{activeLangTab === "ID" ? msg.textID : msg.textEN}</p>
                    
                    {/* Sources reference */}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-gray-100 space-y-1">
                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1">
                          <BookOpen size={8} className="text-blue-500" />
                          Rujukan Dokumen:
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {msg.sources.map((src, i) => (
                            <span key={i} className="bg-gray-50 text-[9px] font-semibold text-gray-500 px-1.5 py-0.5 rounded border border-gray-100 float-left flex items-center gap-1">
                              <CornerDownRight size={8} />
                              {src}
                            </span>
                          ))}
                          <div className="clear-both" />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <span className="text-[8px] font-bold text-gray-400 mt-1 uppercase tracking-wider flex items-center gap-1 px-1">
                <Clock size={8} />
                {msg.timestamp.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </span>
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2.5 text-xs text-gray-400 font-bold bg-white/60 p-3 rounded-2xl w-fit border border-gray-100/40 shadow-sm animate-pulse">
              <Loader2 size={12} className="animate-spin text-blue-500" />
              Lumina AI sedang berpikir...
            </div>
          )}
        </div>

        {/* Input box form panel */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend(inputText);
          }}
          className="p-4 border-t border-gray-150 bg-white flex items-center gap-2.5"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={loading}
            placeholder="Tanyakan kurikulum, peraturan Lazuardi GCS..."
            className="flex-1 px-4 py-3 border border-gray-150 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 disabled:bg-gray-50"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || loading}
            className="p-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-100 text-white disabled:text-gray-300 rounded-2xl transition-all shadow-md active:scale-95 cursor-pointer flex items-center justify-center shrink-0"
          >
            <Send size={14} />
          </button>
        </form>
      </div>
    </div>
  );
}
