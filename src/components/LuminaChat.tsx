import * as React from "react";
import axios from "axios";
import { Sparkles, Send, Loader2, BookOpen, Clock, Bot, HelpCircle, CornerDownRight, RefreshCw } from "lucide-react";
import { cn } from "../lib/utils";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  contentID: string;  // versi Bahasa Indonesia
  contentEN: string;  // versi English
  sources?: string[];
  timestamp: Date;
  selectedLanguage?: "ID" | "EN";
}

export default function LuminaChat({ userId }: { userId: string }) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      contentID: "Halo! Saya Lumina Chat, asisten AI resmi Lazuardi GCS. Tanyakan apa saja mengenai kurikulum, peraturan sekolah, panduan guru, atau info MTSS & LXD akademis resmi.",
      contentEN: "Hello! I am Lumina Chat, the official AI assistant of Lazuardi GCS. Ask me anything about the curriculum, school policies, teacher guides, or MTSS & LXD academic info.",
      timestamp: new Date()
    }
  ]);
  const [inputText, setInputText] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [outputLang, setOutputLang] = React.useState<"ID" | "EN" >("ID");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const popularPrompts = [
    "Bagaimana panduan MTSS Behavior?",
    "Apa saja strands dalam Integral Education?",
    "Apa itu Learning Journey?",
    "Apa itu Self-Exploration?",
  ];

  const handleSend = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: `m-${Date.now()}-user`,
      role: "user",
      contentID: text,
      contentEN: text,
      timestamp: new Date()
    };

    // Add user message to state
    setMessages(prev => [...prev, userMsg]);
    setInputText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "40px";
    }
    setLoading(true);

    try {
      // Map prior conversation history (excluding the user message we just sent)
      const historyPayload = messages.map(msg => ({
        role: msg.role,
        content: msg.role === "user" ? msg.contentID : (msg.contentID || msg.contentEN)
      }));

      const response = await axios.post("/api/lumina-chat", {
        question: text,
        userId: userId,
        history: historyPayload,
        language: outputLang
      });

      const { answerID, answerEN, sources } = response.data;

      const botMsg: ChatMessage = {
        id: `m-${Date.now()}-bot`,
        role: "assistant",
        contentID: answerID,
        contentEN: answerEN,
        sources: sources || [],
        timestamp: new Date(),
        selectedLanguage: outputLang
      };

      setMessages(prev => [...prev, botMsg]);
    } catch (err: any) {
      console.error("[LuminaChatError] Fail:", err);
      const errBotMsg: ChatMessage = {
        id: `m-${Date.now()}-bot`,
        role: "assistant",
        contentID: `Maaf, terjadi kesalahan saat menghubungi AI: ${err.response?.data?.error || err.message}`,
        contentEN: `Sorry, an error occurred while reaching the AI: ${err.response?.data?.error || err.message}`,
        timestamp: new Date(),
        selectedLanguage: outputLang
      };
      setMessages(prev => [...prev, errBotMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleNewChat = () => {
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        contentID: "Halo! Saya Lumina Chat, asisten AI resmi Lazuardi GCS. Tanyakan apa saja mengenai kurikulum, peraturan sekolah, panduan guru, atau info MTSS & LXD akademis resmi.",
        contentEN: "Hello! I am Lumina Chat, the official AI assistant of Lazuardi GCS. Ask me anything about the curriculum, school policies, teacher guides, or MTSS & LXD academic info.",
        timestamp: new Date()
      }
    ]);
    setInputText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "40px";
    }
  };

  return (
    <div className="bg-white border border-gray-150 rounded-[2.5rem] shadow-xl overflow-hidden max-w-4xl mx-auto mt-8 flex flex-col md:flex-row h-[600px] md:h-[550px]">
      {/* Sidebar: Useful info and popular hints */}
      <div className="bg-gray-50/70 p-6 md:w-1/3 border-b md:border-b-0 md:border-r border-gray-150 flex flex-col justify-between">
        <div className="space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-xl text-white shadow-md">
              <Bot size={18} />
            </div>
            <div>
              <h3 className="font-black text-gray-950 text-sm tracking-tight">Lumina Chat AI</h3>
            </div>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed font-semibold">
            Asisten cerdas berbasis pengetahuan dan data Lazuardi GCS.
          </p>

          {/* New Chat Reset Button */}
          <div className="pt-2">
            <button
              type="button"
              onClick={handleNewChat}
              className="w-full text-center text-xs font-black uppercase tracking-widest text-slate-700 hover:text-slate-900 bg-white border border-gray-200 hover:border-gray-300 hover:bg-slate-50 py-2.5 px-4 rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer flex items-center justify-center gap-2"
            >
              <RefreshCw size={12} className="text-blue-500" />
              Percakapan Baru
            </button>
          </div>

          <div className="space-y-2 pt-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
              <HelpCircle size={10} className="text-blue-500" />
              Pertanyaan Populer:
            </p>
            <div className="flex flex-col gap-1.5 max-h-[160px] md:max-h-none overflow-y-auto">
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

        {/* Output Language Selector to save input/output tokens */}
        <div className="py-3.5 border-t border-gray-150 space-y-2">
          <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">
            Output Bahasa
          </p>
          <div className="flex bg-gray-100 p-1 rounded-xl gap-1">
            <button
              type="button"
              onClick={() => setOutputLang("ID")}
              className={cn(
                "flex-1 text-[10px] font-black uppercase tracking-wider py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer select-none",
                outputLang === "ID"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              )}
            >
              <span>🇮🇩</span> Indo
            </button>
            <button
              type="button"
              onClick={() => setOutputLang("EN")}
              className={cn(
                "flex-1 text-[10px] font-black uppercase tracking-wider py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer select-none",
                outputLang === "EN"
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              )}
            >
              <span>🇬🇧</span> English
            </button>
          </div>
        </div>
      </div>

      {/* Main chat box body */}
      <div className="flex-1 flex flex-col justify-between h-full bg-slate-50/10">
        {/* Messages list */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className={cn("flex flex-col max-w-[85%]", msg.role === "user" ? "ml-auto items-end" : "mr-auto items-start")}>
              {/* Message bubble */}
              <div
                className={cn(
                  "p-4 rounded-[1.5rem] text-xs leading-relaxed shadow-sm",
                  msg.role === "user"
                    ? "bg-blue-600 text-white rounded-tr-none px-5 py-3"
                    : "bg-white text-gray-850 rounded-tl-none border border-gray-100"
                )}
              >
                {msg.role === "user" ? (
                  <p className="font-semibold whitespace-pre-wrap">{msg.contentID}</p>
                ) : (
                  <div className="space-y-3.5">
                    {/* Indonesian Section */}
                    {(!msg.selectedLanguage || msg.selectedLanguage === "ID") && msg.contentID && (
                      <div>
                        {msg.selectedLanguage && (
                          <div className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1.5 flex items-center gap-1 select-none">
                            <span>🇮🇩</span>
                            <span>Bahasa Indonesia</span>
                          </div>
                        )}
                        <p className="font-bold text-gray-900 whitespace-pre-wrap leading-relaxed">
                          {msg.contentID}
                        </p>
                      </div>
                    )}

                    {/* English Section */}
                    {(!msg.selectedLanguage || msg.selectedLanguage === "EN") && msg.contentEN && (
                      <div className={cn(!msg.selectedLanguage && "pt-3 border-t border-gray-100")}>
                        {msg.selectedLanguage && (
                          <div className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1.5 flex items-center gap-1 select-none">
                            <span>🇬🇧</span>
                            <span>English Response</span>
                          </div>
                        )}
                        <p className="font-semibold text-gray-650 italic whitespace-pre-wrap leading-relaxed">
                          {msg.contentEN}
                        </p>
                      </div>
                    )}

                    {/* Sources reference */}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-gray-100 space-y-1">
                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1">
                          <BookOpen size={8} className="text-blue-500" />
                          Rujukan Dokumen:
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {msg.sources.map((src, i) => (
                            <span key={i} className="bg-slate-50 text-[9px] font-semibold text-gray-500 px-1.5 py-0.5 rounded border border-gray-100 float-left flex items-center gap-1">
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
          <div ref={messagesEndRef} />
        </div>

        {/* Input box form panel */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend(inputText);
          }}
          className="p-4 border-t border-gray-150 bg-white flex items-end gap-2.5"
        >
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend(inputText);
              }
            }}
            disabled={loading}
            rows={1}
            placeholder="Tanyakan kurikulum, peraturan Lazuardi GCS... (Shift+Enter untuk baris baru)"
            style={{ height: "40px" }}
            className="flex-1 px-4 py-2.5 border border-gray-150 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 disabled:bg-gray-50 resize-none overflow-y-auto leading-normal"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || loading}
            className="p-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-100 text-white disabled:text-gray-300 rounded-2xl transition-all shadow-md active:scale-95 cursor-pointer flex items-center justify-center shrink-0 mb-0.5"
          >
            <Send size={14} />
          </button>
        </form>
      </div>
    </div>
  );
}
