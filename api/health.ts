import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ 
    status: "ok", 
    vercel: true,
    nodeEnv: process.env.NODE_ENV,
    hasSA: !!process.env.FIREBASE_SERVICE_ACCOUNT
  });
}
