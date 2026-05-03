// Imports.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");
const os = require("os");

const PORT = 1314;

const clients = new Map(); // Worship team. -> { id, { ws, name, role } }
let msgHistory = []; // { from, text, ts }
let user_count = 0; // I can't use clients.length because they can disconnect.

// ─── HTTP Server ─────────────────────────────────────────────
const server = http.createServer((req, res) => {
    const urlMap = {
        "/": "index.html",
        "/stage": "cecfo-worship_tool.html",
        "/dashboard": "cecfo-worship_dashboard.html"
    };

    const file = urlMap[req.url];
    if (!file) {
        res.writeHead(404);
        return res.end("Not Found");
    }

    const filepath = path.join(__dirname, file);
    if(!fs.existsSync(filepath)) {
        res.writeHead(404);
        return res.end("File not found: " + file);
    }

    const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css" };
    res.writeHead(200, { "Content-Type": mime[path.extname(filepath)] || "text/plain" });
    res.end(fs.readFileSync(filepath));
})

// ─── WebSocket Server ─────────────────────────────────────────────
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
    const id = String(++user_count);
    const client = { id, ws, name: "unknown", role: "unknown" };
    clients.set(id, client);

    ws.on("message", (data) => {
        let msg;
        try {
            msg = JSON.parse(data);
        } catch {
            return;
        }

        handleMessage(client, msg);
    });

    ws.on("close", () => {
        clients.delete(id);
        broadcastRoster();
    });

    ws.on("error", (err) => {  });
});

function handleMessage(client, msg) {
    switch(msg.type) {
        case "register":
            client.name = msg.name || "unknown";
            client.role = msg.role || "client";
            if(client.role === "dashboard") send(client.ws, { type: "history", messages: msgHistory });
            broadcastRoster();
            break;

        case "worship_msg":
            const entry_worship = { from: client.name, text: msg.text, ts: Date.now(), kind: msg.kind || "custom" };
            msgHistory.push(entry_worship);
            if(msgHistory.length > 200) msgHistory.shift();
            forEachRole("dashboard", (c) => send(c.ws, {type: "worship_msg", ...entry_worship }));
            break;

        case "broadcast":
            if(client.role !== "dashboard") return;
            const entry_bcast = { from: "音控组", text: msg.text, ts: Date.now(), kind: "broadcast" };
            msgHistory.push(entry_bcast);
            if(msgHistory.length > 200) msgHistory.shift();
            forEachRole("client", (c) => send(c.ws, { type: "broadcast", from: client.name, text: msg.text, ts: entry_bcast.ts }));
            forEachRole("dashboard", (d) => send(d.ws, { type:"worship_msg", ...entry_bcast }));
            break;

        case "clear_history":
            if(client.role !== "dashboard") return;
            msgHistory = [];
            forEachRole("dashboard", (d) => send(d.ws, { type: "history", messages: [] }));
            break;
        
        case "clear_history_all":
            if(client.role !== "dashboard") return;
            msgHistory = [];
            forEachRole("dashboard", (d) => send(d.ws, { type: "history", messages: [] }));
            forEachRole("client", (c) => send(c.ws, { type: "clear_history" }));
            break;
    }
}

function send(ws, obj) {
    if(ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function forEachRole(role, fn) {
    for(const [, c] of clients) {
        if (c.role === role) fn(c);
    }
}

function broadcastRoster() {
    const members = [...clients.values()].filter(c => c.role === "client").map(c => c.name);
    for(const [, c] of clients) send(c.ws, { type: "roster", members });
}

function getLanIP() {
    const nets = os.networkInterfaces();
    for(const iface of Object.values(nets)) {
        for(const net of iface) {
            if(net.family === "IPv4" && !net.internal) return net.address;
        }
    }
    return "localhost";
}

server.listen(PORT, () => {
    const ip = getLanIP();
    console.log(`Worship team → http://${ip}:${PORT}`);
    console.log(`Mix team → http://${ip}:${PORT}/dashboard\n`);
});