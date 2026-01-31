
import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
// @ts-ignore
import { startBot, getSocketData, deleteSession } from "./bot.js";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Root route - redirect to status or provide basic info
  app.get('/', (req, res) => {
    res.json({ status: 'active', message: 'WhatsApp Bot Server is running. Use /api/connect with parameters.' });
  });

  app.get('/api/connect', async (req, res) => {
    const loginpairing = req.query.loginpairing as string;
    const qrlogin = req.query.qrlogin as string;
    const logout = req.query.logout as string;

    if (loginpairing) {
        let socketData = getSocketData(loginpairing);
        if (!socketData || socketData.status !== 'connected') {
            if (!socketData) {
                await startBot(loginpairing, 'pairing');
            }
            await new Promise(resolve => setTimeout(resolve, 3500));
            socketData = getSocketData(loginpairing);
        }

        if (socketData?.pairingCode) {
             return res.json({ 
                 status: 'success',
                 pairing_code: socketData.pairingCode,
                 message: 'Masukan kode ini di WhatsApp Anda'
             });
        } else if (socketData?.status === 'connected') {
             return res.json({ status: 'connected', message: 'Bot sudah terhubung' });
        } else {
             return res.json({ status: 'processing', message: 'Sedang memproses, coba lagi...' });
        }
    }

    if (qrlogin) {
        let socketData = getSocketData(qrlogin);
        if (!socketData || socketData.status !== 'connected') {
            if (!socketData) {
                 await startBot(qrlogin, 'qr');
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
            socketData = getSocketData(qrlogin);
        }
        
        if (socketData?.status === 'connected') {
             return res.send(`<html><body><h1>Bot ${qrlogin} Connected!</h1></body></html>`);
        }

        if (socketData?.qr) {
            return res.send(`
                <html>
                    <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#000;color:#0f0;font-family:monospace;">
                        <h1>Scan QR Code: ${qrlogin}</h1>
                        <img src="${socketData.qr}" style="width:300px;height:300px;border:2px solid #0f0;padding:10px;background:#fff;" />
                        <p>Reload if expired</p>
                    </body>
                </html>
            `);
        } else {
            return res.send(`<html><body style="background:#000;color:#0f0;font-family:monospace;"><h1>Generating QR...</h1><script>setTimeout(() => window.location.reload(), 5000)</script></body></html>`);
        }
    }

    if (logout) {
        await deleteSession(logout);
        return res.json({ status: 'success', message: `Sesi ${logout} dihapus` });
    }

    res.status(400).json({ error: 'Missing parameters' });
  });

  app.get('/api/status', async (req, res) => {
      res.json({ message: "Active" });
  });

  return httpServer;
}
