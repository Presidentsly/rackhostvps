const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));
app.use(express.json());

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: "./session" }),
    puppeteer: {
        headless: true,
        args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage"]
    }
});

let isReady = false;
const inbox = [];

function generateNameFromNumber(number){
    const names = ["Ádám","Bence","Csaba","Dóra","Eszter","Fanni","Gábor","Hanna"];
    const index = parseInt(number.slice(-1)) % names.length;
    return names[index];
}

function formatJID(to){
    if(!to) return "";
    if(to.endsWith("@c.us") || to.endsWith("@g.us")) return to;
    return to.replace(/\D/g,'') + "@c.us";
}

/* =========================
   WHATSAPP EVENTS
========================= */
client.on("qr", qr => {
    console.log("📱 QR generálva");
    qrcode.generate(qr, { small: true });
    io.emit("qr", qr);
});

client.on("ready", () => {
    console.log("✅ WhatsApp csatlakozott");
    isReady = true;
    io.emit("ready");
});

client.on("auth_failure", msg => console.log("❌ Auth hiba:", msg));
client.on("disconnected", reason => console.log("⚠️ WA disconnected:", reason));

client.on("message", async msg => {
    let displayName = msg.from.replace("@c.us","");
    let mediaData = null;

    try{
        const contact = await client.getContactById(msg.from);
        displayName = contact.pushname || contact.name || displayName;
    }catch{
        displayName = generateNameFromNumber(displayName);
    }

    let text = msg.body || "";
    if(!text && msg.hasMedia){
        switch(msg.type){
            case 'image': text="[kép]"; break;
            case 'video': text="[videó]"; break;
            case 'sticker': text="[matrica]"; break;
            case 'document': text="[dokumentum]"; break;
            default: text="[ismeretlen üzenet]";
        }
    } else if(!text) text="[üres üzenet]";

    try{
        if(msg.hasMedia){
            const media = await msg.downloadMedia();
            if(media){
                mediaData = { mimetype: media.mimetype, data: media.data };
            }
        }
    }catch(e){ console.log("Media hiba:", e.message); }

    const msgData = { from: displayName, text, media: mediaData, t: Date.now(), jid: msg.from, self: msg.fromMe };
    inbox.push(msgData);

    // Terminál log
    console.log(`📩 ${displayName} (${msg.from}): ${text}`);

    io.emit("message", msgData);
});

/* =========================
   SOCKET.IO
========================= */
io.on("connection", socket => {
    console.log("🌐 Web kliens csatlakozott");
    socket.emit("history", inbox);

    socket.on("sendMessage", async ({ to, text }) => {
        if(!isReady){ console.log("Send hiba: bot még nem ready"); return; }
        if(!to || !text){ console.log("Send hiba: hiányzó mező"); return; }

        to = formatJID(to);
        if(!to){ console.log("Send hiba: érvénytelen JID"); return; }

        try{
            await client.sendMessage(to,text.normalize("NFC"));
            console.log(`✉️ Üzenet elküldve: ${to} -> ${text}`);
        }catch(err){
            console.log("Send hiba részletesen:", err);
        }
    });
});

/* =========================
   START SERVER
========================= */
client.initialize();

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=>console.log(`🚀 Server running on port ${PORT}`));
