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
  console.error("[FirebaseAdmin] Initialization failed in generate-weekly-comment:", err.message);
}

function getAdminDb() {
  try {
    return getFirestore();
  } catch (err) {
    return undefined;
  }
}

function replacePromptVariables(promptText: string, variables: Record<string, string> = {}) {
  let result = promptText;
  for (const [key, value] of Object.entries(variables)) {
    const regex1 = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
    const regex2 = new RegExp(`\\{\\s*${key}\\s*\\}`, 'g');
    result = result.replace(regex1, value).replace(regex2, value);
  }
  return result;
}

export function sanitizeAiComment(text: string): string {
  if (!text) return "";
  let cleaned = text.trim();

  // Remove Markdown code block wrappers if any (e.g., ``` or ```text)
  cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/g, "");
  cleaned = cleaned.replace(/\n?```$/g, "");
  cleaned = cleaned.trim();

  // Remove markdown bold/italic formatting
  cleaned = cleaned.replace(/\*\*|\*|_/g, "");

  // Clean line by line to remove conversational intros
  let lines = cleaned.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length > 1) {
    const firstLine = lines[0].toLowerCase();
    const isIntro = 
      firstLine.endsWith(":") || 
      firstLine.startsWith("tentu") || 
      firstLine.startsWith("berikut") || 
      firstLine.startsWith("ini ") || 
      firstLine.startsWith("halo") || 
      firstLine.startsWith("baik") ||
      firstLine.length < 80;

    if (isIntro && !firstLine.includes("minggu ini") && !firstLine.startsWith("ananda") && !firstLine.startsWith("ia ") && !firstLine.startsWith("dia ")) {
      lines.shift();
      cleaned = lines.join("\n").trim();
    }
  }

  // Repeatedly strip surrounding quotes (single, double, curly quotes)
  let prev;
  do {
    prev = cleaned;
    cleaned = cleaned.trim();
    if (
      (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'")) ||
      (cleaned.startsWith('“') && cleaned.endsWith('”')) ||
      (cleaned.startsWith('”') && cleaned.endsWith('”')) ||
      (cleaned.startsWith('“') && cleaned.endsWith('“')) ||
      (cleaned.startsWith('‘') && cleaned.endsWith('’'))
    ) {
      cleaned = cleaned.substring(1, cleaned.length - 1);
    }
  } while (cleaned !== prev);

  // Remove any leftover introductory words at the very beginning of the paragraph
  cleaned = cleaned.replace(/^(tentu,\s*|tentu saja,\s*|berikut adalah\s+|berikut draf komentar:\s*|ini adalah\s*|berikut\s*:\s*)/i, "");

  return cleaned.trim();
}

async function getPrompt(key: string, variables?: Record<string, string>): Promise<string> {
  const defaultTemplates: Record<string, string> = {
    kindergarten_weekly_report: "Buat sebuah laporan narasi mingguan untuk seorang siswa yang berada di {{ageGroupStageString}}. Gunakan 6 developmental stages (Nilai Agama dan Budi Pekerti, Sosial-Emosional, Bahasa, Kognitif, Fisik-Motorik, Seni) sebagai hal yang menjadi fokus dalam laporan. Mulai dengan 'Minggu ini,' atau '{{nickName}} ...'. Gunakan EYD dengan benar. Jika ada domain atau sentra yang berulang, penjelasan digabung saja dan tidak berulang. Jangan gunakan tanda seru. Buat dalam 1 paragraf utuh/tidak terpisah.\n\nPENTING: HANYA berikan teks komentar utama saja. JANGAN gunakan pengantar seperti 'Berikut komentar...', 'Tentu, ini draf...', dll. JANGAN bungkus dalam tanda kutip. JANGAN gunakan format markdown seperti tebal atau miring.\n\nBerikut data observasi mingguan siswa:\n{{observationSummary}}",
    kindergarten_sel_report: "Saya ingin membuat komentar mingguan untuk laporan perkembangan Sosial Emosional siswa {{ageGroupStageString}}. Berikut adalah data kehadiran dan emosi siswa dalam 1 minggu terakhir:\nHappy: {{happy}}, Sad: {{sad}}, Angry: {{angry}}, OK: {{ok}}, No News: {{noNews}}, Sick: {{sick}}, Izin: {{izin}}, Early Leave: {{earlyLeave}}\nBuatkan saya satu paragraf komentar dalam bahasa Indonesia yang singkat dan positif, cocok untuk laporan mingguan. Komentar harus sesuai dengan tahapan perkembangan sosial emosional anak usia yang sesuai, menggambarkan kemampuan anak mengenali dan mengekspresikan emosi, serta bagaimana ia merespons dukungan orang dewasa.\nGunakan bahasa yang hangat untuk ananda bernama: {{nickName}}\n\nPENTING: HANYA berikan teks komentar utama saja. JANGAN gunakan pengantar seperti 'Berikut komentar...', 'Tentu, ini draf...', dll. JANGAN bungkus dalam tanda kutip. JANGAN gunakan format markdown seperti tebal atau miring."
  };

  try {
    const db = getAdminDb();
    let rawPromptText = "";

    if (db) {
      const snap = await db.collection("promptTemplates")
        .where("key", "==", key)
        .where("isActive", "==", true)
        .limit(1)
        .get();

      if (!snap.empty) {
        const doc = snap.docs[0];
        const templateData = doc.data();
        rawPromptText = templateData.prompt || "";
      }
    }

    if (!rawPromptText) {
      rawPromptText = defaultTemplates[key] || `[Prompt belum diisi. Silakan edit melalui Prompt Manager.]`;
    }

    if (variables) {
      return replacePromptVariables(rawPromptText, variables);
    }
    return rawPromptText;
  } catch (error: any) {
    console.error(`[getPrompt] Error fetching prompt key "${key}":`, error);
    const rawPromptText = defaultTemplates[key] || `[Prompt belum diisi. Silakan edit melalui Prompt Manager.]`;
    if (variables) {
      return replacePromptVariables(rawPromptText, variables);
    }
    return rawPromptText;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log("[VercelAPI] Received generate-weekly-comment request");

  try {
    const { studentName, nickName, ageGroup, observationSummary } = req.body;
    if (!studentName) {
      return res.status(400).json({ error: "Missing studentName" });
    }

    const API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || "";
    let detectedKeyName = "";

    if (process.env.GEMINI_API_KEY) {
      detectedKeyName = "GEMINI_API_KEY";
    } else if (process.env.VITE_GEMINI_API_KEY) {
      detectedKeyName = "VITE_GEMINI_API_KEY";
    }

    if (!API_KEY || API_KEY.trim() === "") {
      console.error("[VercelAPI] Neither GEMINI_API_KEY nor VITE_GEMINI_API_KEY is configured on the server.");
      return res.status(500).json({ error: "AI API key is not configured on the server. Please set GEMINI_API_KEY or VITE_GEMINI_API_KEY in Vercel settings." });
    }

    console.log(`[VercelAPI] Detected API key from environment variable: ${detectedKeyName}`);

    const stageString = ageGroup === 'PRA_TK' ? 'Pra TK (usia 2-4 tahun)' : ageGroup === 'TK_B' ? 'TK B (usia 5-6 tahun)' : 'TK A (usia 4-5 tahun)';

    let formattedObs = "Tidak ada records observasi minggu ini.";
    if (Array.isArray(observationSummary) && observationSummary.length > 0) {
      formattedObs = observationSummary.map((obs: any) => {
        const mergedNotesStr = Array.isArray(obs.mergedNotes) && obs.mergedNotes.length > 0
          ? obs.mergedNotes.map((n: string) => `- ${n}`).join("\n")
          : "- Mengikuti aktivitas dengan baik.";
        return `Domain: ${obs.domain}\nAktivitas: ${obs.activityList?.join(", ") || "-"}\nCapaian: ${obs.grades?.join(", ") || "-"}\nCatatan Perkembangan:\n${mergedNotesStr}`;
      }).join("\n\n");
    }

    const prompt = await getPrompt("kindergarten_weekly_report", {
      studentName,
      nickName: nickName || studentName,
      ageGroupStageString: stageString,
      observationSummary: formattedObs,
    });

    const BASE_URL = process.env.VITE_AI_BASE_URL || "https://api.koboillm.com/v1";
    const MODEL = process.env.VITE_AI_MODEL || "gemini/gemini-2.5-flash-lite";

    const aiResponse = await axios.post(`${BASE_URL}/chat/completions`, {
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7
    }, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`,
      },
      timeout: 30000
    });

    const textResult = aiResponse.data?.choices?.[0]?.message?.content || "";
    const sanitizedText = sanitizeAiComment(textResult);
    return res.status(200).json({ text: sanitizedText });
  } catch (error: any) {
    console.error("[VercelAPI] Error in generate-weekly-comment:", error);
    return res.status(500).json({ error: error.message || "Gagal mengenerate komentar menggunakan AI." });
  }
}
