import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function initFirebase() {
  if (!getApps().length) {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT missing');
    initializeApp({ credential: cert(JSON.parse(sa)) });
  }
  return getFirestore();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const db = initFirebase();
    const { question, userId } = req.body;

    if (!question || !userId) return res.status(400).json({ error: 'Missing question or userId' });

    // Verify user
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return res.status(401).json({ error: 'Unauthorized' });

    // Get system prompt
    let systemPrompt = 'Kamu adalah Lumina Chat, asisten AI resmi Lazuardi GCS. Jawab dalam 2 versi: 🇮🇩 Bahasa Indonesia: [jawaban] 🇬🇧 English: [answer]';
    try {
      const promptSnap = await db.collection('promptTemplates')
        .where('key', '==', 'lumina_chat_system')
        .where('isActive', '==', true)
        .limit(1).get();
      if (!promptSnap.empty) systemPrompt = promptSnap.docs[0].data().prompt;
    } catch {}

    // Get knowledge base
    const kbSnap = await db.collection('knowledgeBase').get();
    const q = question.toLowerCase();
    const relevant = kbSnap.docs
      .filter(d => {
        const content = (d.data().content || '').toLowerCase();
        const words = q.split(' ').filter((w: string) => w.length > 3);
        return words.some((w: string) => content.includes(w));
      })
      .slice(0, 5)
      .map(d => `[${d.data().title}]\n${d.data().content}`);

    const context = relevant.length > 0 ? relevant.join('\n\n---\n\n') : 'Tidak ada dokumen relevan ditemukan.';
    const sources = relevant.map(r => r.split('\n')[0].replace('[', '').replace(']', ''));

    // Call Koboil LLM
    const baseUrl = process.env.VITE_AI_BASE_URL || 'https://api.koboillm.com/v1';
    const apiKey = process.env.VITE_GEMINI_API_KEY || '';
    const model = process.env.VITE_AI_MODEL || 'gemini/gemini-2.5-flash-lite';

    if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

    const aiResponse = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Konteks dokumen:\n${context}\n\nPertanyaan: ${question}` }
        ],
        temperature: 0.7
      })
    });

    if (!aiResponse.ok) {
      const err = await aiResponse.text();
      return res.status(500).json({ error: `AI API error: ${err}` });
    }

    const aiData = await aiResponse.json();
    const fullAnswer = aiData?.choices?.[0]?.message?.content || '';

    // Parse bilingual
    const idMatch = fullAnswer.match(/🇮🇩[^:]*:\s*([\s\S]*?)(?=🇬🇧|$)/);
    const enMatch = fullAnswer.match(/🇬🇧[^:]*:\s*([\s\S]*?)$/);
    const answerID = idMatch ? idMatch[1].trim() : fullAnswer;
    const answerEN = enMatch ? enMatch[1].trim() : fullAnswer;

    return res.json({ answerID, answerEN, sources });

  } catch (error: any) {
    console.error('[LuminaChat] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}