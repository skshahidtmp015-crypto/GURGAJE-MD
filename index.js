const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const pino = require("pino");
const express = require("express");

const BOT_NAME = "GURGAJE MD";
const PREFIX = ".";
const OWNER_NUMBER = "923130060527";

const app = express();
app.get("/", (req, res) => res.send(`${BOT_NAME} is running ✅`));
app.listen(process.env.PORT || 3000, () => console.log(`${BOT_NAME} server started`));

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("/tmp/auth_info");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    logger: pino({ level: "silent" }),
    browser: [BOT_NAME, "Chrome", "1.0.0"]
  });

  sock.ev.on("creds.update", saveCreds);

  // Pairing code (safe version)
  if (!sock.authState.creds.registered && typeof sock.requestPairingCode === "function") {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(OWNER_NUMBER);
        console.log(`\n\n🔑 PAIRING CODE: ${code}\n`);
        console.log(`📱 WhatsApp → Linked Devices → Link with phone number\n\n`);
      } catch (err) {
        console.log("Pairing code error:", err.message);
      }
    }, 3000);
  }

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "close") {
      const shouldReconnect = new Boom(lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) startBot();
    } else if (connection === "open") {
      console.log(`✅ ${BOT_NAME} connected!`);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

    if (!text.startsWith(PREFIX)) return;
    const command = text.slice(PREFIX.length).trim().split(" ")[0].toLowerCase();

    switch (command) {
      case "ping":
        await sock.sendMessage(from, { text: "🏓 Pong! GURGAJE MD online hai." });
        break;

      case "menu":
      case "help":
        await sock.sendMessage(from, {
          text: `*🤖 ${BOT_NAME} MENU*\n\n` +
                `${PREFIX}ping — Bot check\n` +
                `${PREFIX}menu — Ye list\n` +
                `${PREFIX}owner — Owner info\n` +
                `${PREFIX}sticker — Image to sticker\n` +
                `${PREFIX}tagall — Sab members tag\n` +
                `${PREFIX}kick — Member nikalna\n` +
                `${PREFIX}promote — Admin banana\n`
        });
        break;

      case "owner":
        await sock.sendMessage(from, { text: `👑 Owner: wa.me/${OWNER_NUMBER}` });
        break;

      case "sticker": {
        const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted?.imageMessage) {
          return sock.sendMessage(from, { text: "❌ Kisi image ko reply karke .sticker likhein" });
        }
        const stream = await sock.downloadMediaMessage({ message: quoted, key: msg.key });
        await sock.sendMessage(from, { sticker: stream });
        break;
      }

      case "tagall": {
        if (!from.endsWith("@g.us")) return;
        const meta = await sock.groupMetadata(from);
        const mentions = meta.participants.map(p => p.id);
        const list = meta.participants.map(p => `@${p.id.split("@")[0]}`).join("\n");
        await sock.sendMessage(from, { text: `📢 *Attention All*\n\n${list}`, mentions });
        break;
      }

      case "kick": {
        if (!from.endsWith("@g.us")) return;
        const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid;
        if (!mentioned?.length) return sock.sendMessage(from, { text: "❌ Kisi ko mention karein" });
        await sock.groupParticipantsUpdate(from, mentioned, "remove");
        await sock.sendMessage(from, { text: "✅ Member remove kar diya" });
        break;
      }

      case "promote": {
        if (!from.endsWith("@g.us")) return;
        const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid;
        if (!mentioned?.length) return sock.sendMessage(from, { text: "❌ Kisi ko mention karein" });
        await sock.groupParticipantsUpdate(from, mentioned, "promote");
        await sock.sendMessage(from, { text: "✅ Admin bana diya" });
        break;
      }

      default:
        break;
    }
  });
}

startBot().catch(err => console.error("Bot error:", err));
