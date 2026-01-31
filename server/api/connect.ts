import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Cek method GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Ambil query parameter
  const { loginpairing, qrlogin, logout } = req.query;

  // Contoh response
  res.status(200).json({
    message: 'API connect berhasil',
    loginpairing: loginpairing || null,
    qrlogin: qrlogin || null,
    logout: logout || null
  });
}
