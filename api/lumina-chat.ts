import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function initFirebase() {
  if (!getApps().length) {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountJson) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT env is missing');
    }
    const serviceAccount = JSON.parse(serviceAccountJson);
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getFirestore();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { question, userId } = req.body;
    if (!question || !userId) {
      return res.status(400).json({ error: "Missing required fields: question and userId" });
    }

    const db = initFirebase();

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
        "Bantulah pengguna menjawab pertanyaan hangat tentang sekolah berbasis pada dokumen context yang diberikan. " +
        "Format jawaban Anda persis dalam pola ini:\n\n🇮🇩 Bahasa Indonesia:\n[Jawaban Bahasa Indonesia]\n\n🇬🇧 English:\n[Jawaban Bahasa Inggris]";

      // Self-seeding template for administrator convenience
      try {
        await db.collection("promptTemplates").doc("lumina_chat_system_default").set({
          id: "lumina_chat_system_default",
          key: "lumina_chat_system",
          name: "Lumina Chat System Default Prompt",
          unit: "ALL",
          category: "chat",
          prompt: systemInstructionText,
          variables: [],
          description: "Default fallback system instruction for grounded answering.",
          isActive: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          updatedBy: "System Initiative"
        });
        console.log("[LuminaChat] Auto-seeded default lumina_chat_system template successfully.");
      } catch (seedErr: any) {
        console.warn("[LuminaChat] Skipping auto-seed fail:", seedErr.message);
      }
    }

    // 3. Fetch knowledgeBase documents and filter relevant context using case-insensitive search
    const docsSnap = await db.collection("knowledgeBase").get();
    let relevantDocs: any[] = [];
    
    // Simple custom scoring search based on question keywords
    const cleanQuestion = question.toLowerCase().replace(/[^a-zA-Z0-9\s]/g, " ");
    const keywords = cleanQuestion.split(/\s+/).filter((w: string) => w.length > 2);

    if (docsSnap && !docsSnap.empty) {
      relevantDocs = docsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      if (keywords.length > 0) {
        relevantDocs = relevantDocs.map(doc => {
          let score = 0;
          const titleLower = (doc.title || "").toLowerCase();
          const contentLower = (doc.content || "").toLowerCase();

          // Title matching yields highest priority
          if (titleLower.includes(question.toLowerCase())) score += 50;
          if (contentLower.includes(question.toLowerCase())) score += 20;

          keywords.forEach((kw: string) => {
            if (titleLower.includes(kw)) score += 10;
            if (contentLower.includes(kw)) score += 2;
          });

          return { ...doc, score };
        })
        .filter(doc => doc.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      } else {
        relevantDocs = relevantDocs.slice(0, 5);
      }
    }

    // 4. Combine context and identify sources lists
    const context = relevantDocs.map((doc, idx) => `Document ${idx + 1}: [${doc.title}]\n${doc.content}`).join("\n\n");
    const sources = relevantDocs.map(doc => doc.title);

    // 5. Call Koboil LLM API or Google Gemini OpenAPI-compatible endpoint via standard chat completion
    let BASE_URL = process.env.VITE_AI_BASE_URL || "https://api.koboillm.com/v1";
    let API_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";
    let MODEL = process.env.VITE_AI_MODEL || "gemini/gemini-2.5-flash-lite";

    // Dynamic routing fallback: If using a Google Gemini native API key (AIza...) with the default Koboil URL, 
    // reroute to the official Google Gemini OpenAI-compatible REST endpoint.
    if (API_KEY.startsWith("AIza") && BASE_URL.includes("koboillm.com")) {
      console.log("[LuminaChat] Direct Gemini Key detected. Rerouting to Official Google Gemini OpenAI-compatible endpoint.");
      BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
      MODEL = "gemini-2.5-flash";
    }

    const aiResponse = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemInstructionText },
          { role: "user", content: `Konteks dokumen:\n${context || "Tidak ada dokumen pendukung relevan ditemukan di pangkalan data pengetahuan Lazuardi GCS."}\n\nPertanyaan: ${question}` }
        ],
        temperature: 0.7
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      throw new Error(`LLM API failed: ${aiResponse.status} - ${errText}`);
    }

    const resJson = await aiResponse.json() as any;
    const aiText = resJson.choices?.[0]?.message?.content || "";
    
    let answerID = "";
    let answerEN = "";

    // 6. Robust parsing for separators: "🇮🇩 Bahasa Indonesia:" and "🇬🇧 English:"
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
      answerEN = "Sorry, English response is not generated by the AI.";
    } else if (enIndex !== -1) {
      answerEN = aiText.substring(enIndex + enKey.length).trim();
      answerID = "Maaf, respon dalam Bahasa Indonesia tidak di-generate oleh AI.";
    } else {
      answerID = aiText;
      answerEN = aiText;
    }

    return res.json({
      answerID,
      answerEN,
      sources,
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
