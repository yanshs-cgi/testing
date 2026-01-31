
import baileys from '@whiskeysockets/baileys';
const { 
    default: makeWASocket,
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion, 
    makeCacheableSignalKeyStore, 
    jidDecode, 
    getAggregateVotesInPollMessage 
} = baileys;
import pino from 'pino';
import QRCode from 'qrcode';
import fs from 'fs';
import { db } from './db';
import { contacts, sessions } from '@shared/schema';
import { eq } from 'drizzle-orm';

const activeSockets = new Map();
const logger = pino({ level: 'silent' });

export const startBot = async (number, type = 'pairing') => {
    const sessionId = number;
    const authPath = `sessions/${sessionId}`;
    
    if (!fs.existsSync('sessions')) {
        fs.mkdirSync('sessions');
    }

    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        auth: state,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        patchMessageBeforeSending: (message) => {
            const requiresPatch = !!(
                message.buttonsMessage ||
                message.templateMessage ||
                message.listMessage
            );
            if (requiresPatch) {
                message = {
                    viewOnceMessage: {
                        message: {
                            messageContextInfo: {
                                deviceListMetadata: {},
                                deviceListMetadataVersion: 2,
                            },
                            ...message,
                        },
                    },
                };
            }
            return message;
        },
    });

    activeSockets.set(sessionId, { sock, qr: null, pairingCode: null, status: 'connecting' });

    if (type === 'pairing' && !sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(number);
                const socketData = activeSockets.get(sessionId);
                if (socketData) {
                    socketData.pairingCode = code;
                    socketData.status = 'pairing_ready';
                    activeSockets.set(sessionId, socketData);
                }
            } catch (err) {
                console.log('Error requesting pairing code:', err);
            }
        }, 3000);
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        const socketData = activeSockets.get(sessionId) || {};
        
        if (qr) {
            socketData.qr = await QRCode.toDataURL(qr);
            socketData.status = 'qr_ready';
            activeSockets.set(sessionId, socketData);
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                startBot(number, type);
            } else {
                if (fs.existsSync(authPath)) fs.rmSync(authPath, { recursive: true, force: true });
                activeSockets.delete(sessionId);
            }
        } else if (connection === 'open') {
            console.log(`Bot ${number} connected!`);
            socketData.status = 'connected';
            socketData.qr = null;
            socketData.pairingCode = null;
            activeSockets.set(sessionId, socketData);
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message) return;

        const sender = msg.key.remoteJid;
        const pushName = msg.pushName || 'User';
        
        // Auto save contact
        if (sender && !sender.includes('@g.us')) {
            await db.insert(contacts).values({
                phoneNumber: sender.split('@')[0],
                pushName: pushName,
            }).onConflictDoNothing();
        }

        const body = (msg.message.conversation || 
                      msg.message.extendedTextMessage?.text || 
                      msg.message.imageMessage?.caption || 
                      msg.message.videoMessage?.caption || 
                      "").trim();

        if (!body.startsWith('.')) return;

        const args = body.slice(1).trim().split(/ +/);
        const command = args.shift().toLowerCase();
        const isGroup = sender.endsWith('@g.us');
        const prefix = '.';

        const reply = async (text) => {
            await sock.sendMessage(sender, { text }, { quoted: msg });
        };

        console.log(`Processing command: ${command} from ${sender}`);

        try {
            switch (command) {
                case 'menu':
                case 'help':
                    const menuText = `*BOT WHATSAPP SUPER FULL MENU*

*Admin Commands:*
${prefix}kick @tag - Kick member
${prefix}hidetag [text] - Tag all members

*Tools:*
${prefix}decode - Decrypt view-once (reply to msg)
${prefix}owner - Bot owner info
${prefix}runtime - Bot uptime
${prefix}ping - Speed test

*System:*
${prefix}status - Connection status`;
                    await reply(menuText);
                    break;

                case 'ping':
                    await reply('Pong! Bot is active.');
                    break;

                case 'runtime':
                    const uptime = process.uptime();
                    const hours = Math.floor(uptime / 3600);
                    const minutes = Math.floor((uptime % 3600) / 60);
                    const seconds = Math.floor(uptime % 60);
                    await reply(`Runtime: ${hours}h ${minutes}m ${seconds}s`);
                    break;

                case 'decode':
                    const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
                    if (quoted?.viewOnceMessageV2 || quoted?.viewOnceMessage) {
                        const viewOnce = quoted.viewOnceMessageV2 || quoted.viewOnceMessage;
                        const type = Object.keys(viewOnce.message)[0];
                        const media = viewOnce.message[type];
                        delete media.viewOnce;
                        await sock.sendMessage(sender, { [type]: media, caption: 'Decoded View Once Message' }, { quoted: msg });
                    } else {
                        await reply('Reply ke pesan View Once!');
                    }
                    break;

                case 'hidetag':
                    if (!isGroup) return reply('Hanya bisa di grup!');
                    const groupMetadata = await sock.groupMetadata(sender);
                    const participants = groupMetadata.participants.map(p => p.id);
                    await sock.sendMessage(sender, { text: args.join(' ') || 'Hidetag!', mentions: participants });
                    break;

                case 'kick':
                    if (!isGroup) return reply('Hanya bisa di grup!');
                    const target = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || 
                                   (args[0]?.includes('@') ? args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null);
                    if (!target) return reply('Tag atau reply orang yang mau dikick!');
                    await sock.groupParticipantsUpdate(sender, [target], "remove");
                    await reply('Sukses kick member.');
                    break;

                case 'owner':
                    await reply('Owner: Bot Developer');
                    break;

                case 'status':
                    await reply('Bot status: Connected and Running smoothly.');
                    break;

                default:
                    // Only reply if it looks like a command but unknown
                    if (body.startsWith(prefix)) {
                        console.log(`Unknown command: ${command}`);
                    }
                    break;
            }
        } catch (err) {
            console.error('Command Error:', err);
            await reply('Terjadi kesalahan saat menjalankan perintah.');
        }
    });

    return sock;
};

export const getSocketData = (id) => activeSockets.get(id);
export const deleteSession = async (id) => {
    const data = activeSockets.get(id);
    if (data?.sock) data.sock.end();
    activeSockets.delete(id);
    if (fs.existsSync(`sessions/${id}`)) fs.rmSync(`sessions/${id}`, { recursive: true, force: true });
};
