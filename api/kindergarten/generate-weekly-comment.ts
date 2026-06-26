import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { GoogleGenAI } from "@google/genai";

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

async function getPrompt(key: string, variables?: Record<string, string>): Promise<string> {
  const defaultTemplates: Record<string, string> = {
    kindergarten_weekly_report: "Buat sebuah laporan narasi mingguan untuk seorang siswa yang berada di {{ageGroupStageString}}. Gunakan 6 developmental stages (Nilai Agama dan Budi Pekerti, Sosial-Emosional, Bahasa, Kognitif, Fisik-Motorik, Seni) sebagai hal yang menjadi fokus dalam laporan. Mulai dengan 'Minggu ini,' atau '{{nickName}} ...'. Gunakan EYD dengan benar. Jika ada domain atau sentra yang berulang, penjelasan digabung saja dan tidak berulang. Jangan gunakan tanda seru. Buat dalam 1 paragraf utuh/tidak terpisah.\n\nBerikut data observasi mingguan siswa:\n{{observationSummary}}",
    kindergarten_sel_report: "Saya ingin membuat komentar mingguan untuk laporan perkembangan Sosial Emosional siswa {{ageGroupStageString}}. Berikut adalah data kehadiran dan emosi siswa dalam 1 minggu terakhir:\nHappy: {{happy}}, Sad: {{sad}}, Angry: {{angry}}, OK: {{ok}}, No News: {{noNews}}, Sick: {{sick}}, Izin: {{izin}}, Early Leave: {{earlyLeave}}\nBuatkan saya satu paragraf komentar dalam bahasa Indonesia yang singkat dan positif, cocok untuk laporan mingguan. Komentar harus sesuai dengan tahapan perkembangan sosial emosional anak usia yang sesuai, menggambarkan kemampuan anak mengenali dan mengekspresikan emosi, serta bagaimana ia merespons dukungan orang dewasa.\nGunakan bahasa yang hangat untuk ananda bernama: {{nickName}}"
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

    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      console.error("[VercelAPI] GEMINI_API_KEY is not configured");
      return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
    }

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

    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    return res.status(200).json({ text: response.text || "" });
  } catch (error: any) {
    console.error("[VercelAPI] Error in generate-weekly-comment:", error);
    return res.status(500).json({ error: error.message || "Gagal mengenerate komentar menggunakan AI." });
  }
}
