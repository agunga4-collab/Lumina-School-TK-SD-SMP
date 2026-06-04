import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import axios from "axios";

// Firebase Admin Initialization
try {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountJson && !getApps().length) {
    const serviceAccount = JSON.parse(serviceAccountJson);
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    initializeApp({
      credential: cert(serviceAccount),
    });
  }
} catch (err: any) {
  console.error("[FirebaseAdmin] Initialization failed in lumina-chat:", err.message);
}

function getAdminDb() {
  try {
    return getFirestore();
  } catch (err) {
    return undefined;
  }
}

// STOPWORDS list for Indonesian & English to prevent generic interrogatives/pronouns from shifting the conversation context
const STOPWORDS = new Set([
  // Indonesian Interrogatives, Pronouns & Auxiliaries
  "siapa", "apa", "mengapa", "bagaimana", "kapan", "dimana", "di", "mana", "ke", "dari",
  "yang", "untuk", "pada", "dengan", "oleh", "ini", "itu", "dan", "atau", "tetapi",
  "saya", "kamu", "dia", "mereka", "kita", "kami", "anda", "beliau", "punya", "ada", "adalah", "yaitu",
  "yakni", "ialah", "merupakan", "saja", "nya", "kah", "lah", "pun", "semua", "beberapa", "banyak", "sedikit",
  "sebutkan", "berikan", "jelaskan", "deskripsikan", "ceritakan", "tunjukkan", "tuliskan", "jawab", "jawablah",
  "pertanyaan", "tanya", "bertanya", "tentang", "mengenai", "terkait", "terhadap", "bagi", "buat", "atas",
  "dalam", "luar", "antara", "sebelum", "sesudah", "setelah", "hingga", "sampai", "sehingga",
  "karena", "sebab", "oleh karena itu", "jika", "kalau", "apabila", "bila", "supaya", "agar",
  "bertanggung", "tanggung", "jawab", "bertanggungjawab", "melakukan", "terlibat", "menjadi", "bisa", "dapat",
  "boleh", "harus", "wajib", "perlu", "patut", "akan", "sedang", "telah", "sudah", "belum", "pernah",
  "bukan", "tidak", "jangan", "tiada", "tidaklah", "bukanlah", "siapakah", "apakah", "bagaimanakah",
  
  // English Interrogatives, Pronouns & Auxiliaries
  "who", "what", "why", "how", "where", "when", "which", "whose", "whom",
  "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did",
  "a", "an", "the", "and", "or", "but", "if", "because", "as", "until", "while", "of", "at", "by", "for",
  "with", "about", "against", "between", "into", "through", "during", "before", "after", "above", "below",
  "to", "from", "up", "down", "in", "out", "on", "off", "over", "under", "again", "further", "then", "once",
  "here", "there", "all", "any", "both", "each", "few", "more", "most", "other",
  "some", "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very", "can", "will",
  "just", "should", "now", "describe", "explain", "tell", "show", "give", "list", "responsible", "responsibility"
]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { question, userId, history = [], language = "ID" } = req.body;
    
    // Log history received for debugging
    console.log('[LuminaChat] history received:', JSON.stringify(history));

    if (!question || !userId) {
      return res.status(400).json({ error: "Missing required fields: question and userId" });
    }

    const db = getAdminDb();
    if (!db) {
      return res.status(500).json({ error: "Database offline" });
    }

    // 1. Validate userId
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      return res.status(401).json({ error: "Unauthorized: Active user session is required." });
    }

    // 2. Fetch prompt from Firestore matching lumina_chat_system and isActive == true
    const promptSnap = await db.collection("promptTemplates")
      .where("key", "==", "lumina_chat_system")
      .where("isActive", "==", true)
      .limit(1)
      .get();

    let systemInstructionText = "";
    if (!promptSnap.empty) {
      systemInstructionText = promptSnap.docs[0].data().prompt;
    } else {
      // Default fallback system instruction
      systemInstructionText = "Anda adalah Lumina Chat, asisten AI Lazuardi GCS (Global Compassionate School). " +
        "Bantulah pengguna menjawab pertanyaan hangat tentang sekolah berbasis pada dokumen context yang diberikan.";
    }

    // Append output language instruction to restrict generation and save tokens
    let languageInstruction = "";
    if (language === "EN") {
      languageInstruction = "\n\nYou MUST respond ONLY in English. Do NOT write in Indonesian language. " +
        "Format your answer exactly with this label at the very beginning of your response:\n" +
        "🇬🇧 English:\n[Your English response]";
    } else {
      languageInstruction = "\n\nAnda HARUS merespon HANYA dalam Bahasa Indonesia. JANGAN menulis dalam Bahasa Inggris. " +
        "Format jawaban Anda persis dengan label ini di awal respon:\n" +
        "🇮🇩 Bahasa Indonesia:\n[Jawaban Bahasa Indonesia Anda]";
    }

    systemInstructionText += languageInstruction;


    // 3. Fetch knowledgeBase documents and filter relevant context using case-insensitive search
    const docsSnap = await db.collection("knowledgeBase").get();
    let relevantDocs: any[] = [];
    
    // Ekstrak topik dari history (ambil 2 pesan user terakhir)
    const historyContext = history
      .filter((h: any) => h.role === 'user')
      .slice(-2)
      .map((h: any) => h.content || "")
      .join(' ');

    // Gunakan gabungan untuk scoring dokumen
    const searchQuery = historyContext.trim() ? (historyContext.trim() + ' ' + question) : question;

    // Simple custom scoring search based on question and search query keywords
    const cleanSearchQuery = searchQuery.toLowerCase().replace(/[^a-zA-Z0-9\s]/g, " ");
    const keywords = cleanSearchQuery.split(/\s+/).filter((w: string) => w.length > 2);
    const filteredKeywords = keywords.filter(kw => !STOPWORDS.has(kw.toLowerCase()));

    // Dokumen yang sudah dirujuk sebelumnya dapat prioritas lebih tinggi
    const previousSources = history
      .filter((h: any) => h.role === 'assistant' && h.sources)
      .flatMap((h: any) => h.sources || []);

    const cleanQuestionOnly = question.toLowerCase().replace(/[^a-zA-Z0-9\s]/g, " ");
    const questionKeywords = cleanQuestionOnly.split(/\s+/).filter((w: string) => w.length > 2);
    const filteredQuestionKeywords = questionKeywords.filter(kw => !STOPWORDS.has(kw.toLowerCase()));

    const isGenericFollowUp = history.length > 0 && filteredQuestionKeywords.length === 0 && previousSources.length > 0;

    if (docsSnap && !docsSnap.empty) {
      const allDocs: any[] = docsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      if (isGenericFollowUp) {
        // Reuse previous sources directly to avoid noisy irrelevant documents
        relevantDocs = allDocs.filter(doc => previousSources.includes(doc.title));
      } else {
        relevantDocs = allDocs;
        const scoringKeywords = filteredKeywords.length > 0 ? filteredKeywords : keywords;

        if (scoringKeywords.length > 0) {
          relevantDocs = relevantDocs.map(doc => {
            let score = 0;
            const titleLower = (doc.title || "").toLowerCase();
            const contentLower = (doc.content || "").toLowerCase();

            // Title matching yields highest priority
            if (titleLower.includes(searchQuery.toLowerCase())) score += 80;
            if (contentLower.includes(searchQuery.toLowerCase())) score += 30;

            // Directly check the original question too
            if (titleLower.includes(question.toLowerCase())) score += 50;
            if (contentLower.includes(question.toLowerCase())) score += 15;

            scoringKeywords.forEach((kw: string) => {
              if (titleLower.includes(kw)) score += 20;
              if (contentLower.includes(kw)) score += 4;
            });

            // Saat scoring, tambahkan bonus jika dokumen pernah dirujuk
            if (previousSources.includes(doc.title)) {
              score += 150; // Give a massive boost to active topics
            }

            return { ...doc, score };
          })
          .filter(doc => doc.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);
        } else {
          relevantDocs = relevantDocs.slice(0, 5);
        }
      }
    }

    // 4. Combine context and identify sources lists
    const context = relevantDocs.map((doc, idx) => `Document ${idx + 1}: [${doc.title}]\n${doc.content}`).join("\n\n");
    const sources = relevantDocs.map(doc => doc.title);

    // 5. Build alternating history with combined assistant responses
    const trimmedHistory = history.slice(-10);

    const mappedHistory = trimmedHistory.map((h: any) => {
      let contentStr = "";
      if (h.role === "assistant") {
        // If content is an object with answerID/answerEN
        if (typeof h.content === "object" && h.content !== null) {
          const ansID = h.content.answerID || h.content.contentID || "";
          const ansEN = h.content.answerEN || h.content.contentEN || "";
          contentStr = `${ansID} / ${ansEN}`;
        }
        // If the item itself has direct fields
        else if (h.answerID !== undefined || h.answerEN !== undefined || h.contentID !== undefined || h.contentEN !== undefined) {
          const ansID = h.answerID || h.contentID || "";
          const ansEN = h.answerEN || h.contentEN || "";
          contentStr = `${ansID} / ${ansEN}`;
        }
        else {
          contentStr = String(h.content || "");
        }
      } else {
        if (typeof h.content === "object" && h.content !== null) {
          contentStr = h.content.contentID || h.content.answerID || "";
        } else {
          contentStr = String(h.content || "");
        }
      }
      return {
        role: h.role === "assistant" ? "assistant" : "user",
        content: contentStr,
        sources: h.sources || []
      };
    });

    // 6. Check if new keyword is detected in the current query compared to previous user history elements
    let hasNewKeyword = false;

    if (history.length > 0 && filteredQuestionKeywords.length > 0) {
      const historyText = history
        .filter((h: any) => h.role === "user")
        .map((h: any) => {
          let text = "";
          if (typeof h.content === "object" && h.content !== null) {
            text = h.content.contentID || h.content.answerID || "";
          } else {
            text = String(h.content || "");
          }
          return text.toLowerCase();
        })
        .join(" ");

      hasNewKeyword = filteredQuestionKeywords.some((kw: string) => !historyText.includes(kw.toLowerCase()));
    }

    const shouldInjectContext = (history.length === 0) || hasNewKeyword || isGenericFollowUp;

    let finalUserMessage = "";
    if (shouldInjectContext) {
      // First message or newly matching keywords found
      finalUserMessage = `Konteks dokumen:\n${context || "Tidak ada dokumen pendukung relevan ditemukan di pangkalan data pengetahuan Lazuardi GCS."}\n\nPertanyaan: ${question}`;
    } else {
      // Subsequent generic conversational message without duplicating heavy context documents to save tokens
      finalUserMessage = question;
    }

    // 7. Call Koboil LLM API or Google Gemini OpenAPI-compatible endpoint via standard chat completion
    let BASE_URL = process.env.VITE_AI_BASE_URL || "https://api.koboillm.com/v1";
    let API_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";
    let MODEL = process.env.VITE_AI_MODEL || "gemini/gemini-2.5-flash-lite";

    // Dynamic routing fallback: If using a Google Gemini native API key (AIza...) with the default Koboil URL, 
    // reroute to the official Google Gemini OpenAI-compatible REST endpoint.
    if (API_KEY.startsWith("AIza") && BASE_URL.includes("koboillm.com")) {
      console.log("[LuminaChat] Direct Gemini Key detected in API handler. Rerouting to Official Google Gemini OpenAI-compatible endpoint.");
      BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
      MODEL = "gemini-2.5-flash";
    }

    const aiResponse = await axios.post(`${BASE_URL}/chat/completions`, {
      model: MODEL,
      messages: [
        { role: "system", content: systemInstructionText },
        ...mappedHistory,
        { role: "user", content: finalUserMessage }
      ],
      temperature: 0.7
    }, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`,
      },
      timeout: 30000
    });

    const resJson = aiResponse.data;
    const aiText = resJson.choices?.[0]?.message?.content || "";
    let answerID = "";
    let answerEN = "";

    // 8. Robust parsing for separators: "🇮🇩 Bahasa Indonesia:" and "🇬🇧 English:"
    const idKey = "🇮🇩 Bahasa Indonesia:";
    const enKey = "🇬🇧 English:";

    const idIndex = aiText.indexOf(idKey);
    const enIndex = aiText.indexOf(enKey);

    if (idIndex !== -1 && enIndex !== -1) {
      if (idIndex < enIndex) {
        answerID = aiText.substring(idIndex + idKey.length, enIndex).trim();
        answerEN = aiText.substring(enIndex + enKey.length).trim();
      } else {
        answerEN = aiText.substring(enIndex + enKey.length, idIndex).trim();
        answerID = aiText.substring(idIndex + idKey.length).trim();
      }
    } else if (idIndex !== -1) {
      answerID = aiText.substring(idIndex + idKey.length).trim();
      answerEN = "";
    } else if (enIndex !== -1) {
      answerEN = aiText.substring(enIndex + enKey.length).trim();
      answerID = "";
    } else {
      if (language === "EN") {
        answerEN = aiText;
        answerID = "";
      } else {
        answerID = aiText;
        answerEN = "";
      }
    }

    const finalSources = shouldInjectContext ? sources : [];

    return res.json({
      answerID,
      answerEN,
      sources: finalSources,
    });

  } catch (error: any) {
    console.error("[LuminaChatError] Fail to execute grounded chat:", error);
    let errorMsg = "Unknown chat failure";
    if (error instanceof Error) {
      errorMsg = error.message;
    } else if (typeof error === "string") {
      errorMsg = error;
    } else if (error) {
      errorMsg = JSON.stringify(error);
    }
    return res.status(500).json({ error: errorMsg, stack: error?.stack });
  }
}
