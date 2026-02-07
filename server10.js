const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal"); // <-- ide kell

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

/* =========================
   WHATSAPP CLIENT
========================= */
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: "./session" }),

    // ✅ Dinamikus web verzió (modern WA)
    webVersionCache: {
        type: "remote",
        remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html"
    },

    puppeteer: {
        headless: true,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage"
        ]
    }
});

/* =========================
   EVENTEK
========================= */

// QR kód
client.on("qr", qr => {
    console.log("📱 QR generálva");
    qrcode.generate(qr, { small: true }); // <-- ez ASCII QR a CMD-be
    io.emit("qr", qr); // maradhat a webre is
});

// Ready
client.on("ready", () => {
    console.log("✅ WhatsApp csatlakozott");
    io.emit("ready");
});

// Auth hiba
client.on("auth_failure", msg => {
    console.log("❌ Auth hiba:", msg);
});

// Disconnect
client.on("disconnected", reason => {
    console.log("⚠️ WA disconnected:", reason);
});

// Bejövő üzenetek (szöveg + képek/GIF)
client.on("message", async msg => {
    let mediaUrl = null;
    try {
        if (msg.hasMedia) {
            const media = await msg.downloadMedia();
            if (media && (media.mimetype.startsWith("image") || media.mimetype === "image/gif")) {
                mediaUrl = `data:${media.mimetype};base64,${media.data}`;
            }
        }
    } catch (e) {
        console.log("Media hiba:", e.message);
    }
    io.emit("message", {
        from: msg.from.replace("@c.us",""),
        body: msg.body,
        media: mediaUrl,
        t: Date.now()
    });
});

/* =========================
   SOCKET.IO
========================= */
io.on("connection", socket => {
    console.log("🌐 Web kliens csatlakozott");

    socket.on("sendMessage", async ({ to, text }) => {
        try {
            await client.sendMessage(to, text);
        } catch (err) {
            console.log("Send hiba:", err.message);
        }
    });
});

/* =========================
   START SERVER
========================= */
client.initialize();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
