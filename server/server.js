const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const os = require("os");
const fs = require("fs");
const crypto = require("crypto");
const QRCode = require("qrcode");

const app = express();
const PORT = 3000;

// ========================================
// LAN Device Discovery
// ========================================

const devices = new Map();

const DEVICE_TIMEOUT = 30 * 1000;

app.use(cors());
app.use(express.json());

/* =========================================================
   DIRECTORIES
========================================================= */

const uploadDirectory = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDirectory)) {
    fs.mkdirSync(uploadDirectory, { recursive: true });
}

/* =========================================================
   DATA FILES
========================================================= */

const dataDirectory = path.join(__dirname, "data");

if (!fs.existsSync(dataDirectory)) {
    fs.mkdirSync(dataDirectory, { recursive: true });
}

const devicesFile = path.join(
    dataDirectory,
    "devices.json"
);

const pairingsFile = path.join(
    dataDirectory,
    "pairings.json"
);

if (!fs.existsSync(devicesFile)) {
    fs.writeFileSync(devicesFile, "[]");
}

if (!fs.existsSync(pairingsFile)) {
    fs.writeFileSync(pairingsFile, "[]");
}

/* =========================================================
   JSON HELPERS
========================================================= */

function readJSON(file) {
    try {
        return JSON.parse(
            fs.readFileSync(file, "utf8")
        );
    } catch {
        return [];
    }
}

function writeJSON(file, data) {
    fs.writeFileSync(
        file,
        JSON.stringify(data, null, 4)
    );
}

/* =========================================================
   IP ADDRESS
========================================================= */

function normalizeIP(ip) {
    if (!ip) {
        return "";
    }

    if (ip.startsWith("::ffff:")) {
        return ip.substring(7);
    }

    if (ip === "::1") {
        return "127.0.0.1";
    }

    return ip;
}

function getClientIP(req) {
    return normalizeIP(
        req.socket.remoteAddress
    );
}

/* =========================================================
   SERVER IP
========================================================= */

function getLocalIP() {
    const interfaces = os.networkInterfaces();

    for (const name of Object.keys(interfaces)) {
        for (const network of interfaces[name]) {
            if (
                network.family === "IPv4" &&
                !network.internal
            ) {
                return network.address;
            }
        }
    }

    return "localhost";
}

/* =========================================================
   MULTER
========================================================= */

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDirectory);
    },

    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});

const upload = multer({
    storage
});

/* =========================================================
   STATUS
========================================================= */

app.get("/api/status", (req, res) => {
    res.json({
        status: "online",
        message: "LANShare server is running"
    });
});
// ========================================
// Device Registration
// ========================================

app.post("/api/devices/register", (req, res) => {
    const { name } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({
            error: "Device name is required"
        });
    }

    // Get the IP address of the device
    const ip = req.ip.replace("::ffff:", "");

    const device = {
        name: name.trim(),
        ip: ip,
        lastSeen: Date.now()
    };

    devices.set(ip, device);

    res.json({
        message: "Device registered",
        device: device
    });
});


// ========================================
// Get Active Devices
// ========================================

app.get("/api/devices", (req, res) => {
    const now = Date.now();

    // Remove devices that haven't been seen
    // for more than 30 seconds
    for (const [ip, device] of devices) {
        if (now - device.lastSeen > DEVICE_TIMEOUT) {
            devices.delete(ip);
        }
    }

    res.json(
        Array.from(devices.values())
    );
});


// ========================================
// Device Heartbeat
// ========================================

app.post("/api/devices/heartbeat", (req, res) => {
    const ip = req.ip.replace("::ffff:", "");

    const device = devices.get(ip);

    if (!device) {
        return res.status(404).json({
            error: "Device is not registered"
        });
    }

    device.lastSeen = Date.now();

    res.json({
        message: "Heartbeat received"
    });
});
/* =========================================================
   UPLOAD
========================================================= */

app.post(
    "/upload",
    upload.single("file"),
    (req, res) => {

        if (!req.file) {
            return res.status(400).json({
                error: "No file uploaded"
            });
        }

        res.json({
            message: "File uploaded successfully",
            filename: req.file.originalname,
            size: req.file.size
        });
    }
);

/* =========================================================
   FILE LIST
========================================================= */

app.get("/files", (req, res) => {

    fs.readdir(
        uploadDirectory,
        (err, files) => {

            if (err) {
                return res.status(500).json({
                    error: "Unable to read files"
                });
            }

            const fileList = files.map(
                (file) => {

                    const filePath =
                        path.join(
                            uploadDirectory,
                            file
                        );

                    const stats =
                        fs.statSync(filePath);

                    return {
                        name: file,
                        size: stats.size,
                        modified: stats.mtime
                    };
                }
            );

            res.json(fileList);
        }
    );
});

/* =========================================================
   DOWNLOAD
========================================================= */

app.get(
    "/download/:filename",
    (req, res) => {

        const filename =
            req.params.filename;

        const filePath =
            path.join(
                uploadDirectory,
                filename
            );

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                error: "File not found"
            });
        }

        res.download(
            filePath,
            filename,
            (err) => {

                if (err) {
                    console.error(
                        "Download error:",
                        err
                    );
                }
            }
        );
    }
);

/* =========================================================
   PAIRING
========================================================= */

/*
    Pairing lifetime:

    - QR token valid for 5 minutes
    - Once accepted, pairing becomes active
    - Both devices send heartbeat
    - If either device disappears for 30 seconds,
      pairing is automatically terminated
*/

const PAIR_TOKEN_LIFETIME = 5 * 60 * 1000;
const HEARTBEAT_TIMEOUT = 30 * 1000;

/* ---------------------------------------------------------
   CREATE PAIRING
--------------------------------------------------------- */

app.post(
    "/api/pair/create",
    async (req, res) => {

        const senderIP =
            getClientIP(req);

        const token =
            crypto.randomBytes(24)
                .toString("hex");

        const pairings =
            readJSON(pairingsFile);

        const pairing = {
            id: crypto.randomUUID(),

            token,

            senderIP,

            receiverIP: null,

            senderName: null,

            receiverName: null,

            status: "waiting",

            createdAt: Date.now(),

            senderLastSeen: Date.now(),

            receiverLastSeen: null
        };

        pairings.push(pairing);

        writeJSON(
            pairingsFile,
            pairings
        );

        const localIP =
            getLocalIP();

        const pairingURL =
            `http://${localIP}:${PORT}/pair/${token}`;

        const qrCode =
            await QRCode.toDataURL(
                pairingURL
            );

        res.json({
            success: true,

            pairingId:
                pairing.id,

            token,

            url:
                pairingURL,

            qrCode
        });
    }
);

/* ---------------------------------------------------------
   GET PAIRING
--------------------------------------------------------- */

app.get(
    "/api/pair/:token",
    (req, res) => {

        const pairings =
            readJSON(pairingsFile);

        const pairing =
            pairings.find(
                p =>
                    p.token ===
                    req.params.token
            );

        if (!pairing) {
            return res.status(404).json({
                error:
                    "Pairing invitation not found"
            });
        }

        if (
            Date.now() -
            pairing.createdAt >
            PAIR_TOKEN_LIFETIME
        ) {

            return res.status(410).json({
                error:
                    "Pairing invitation expired"
            });
        }

        res.json({
            success: true,

            senderName:
                pairing.senderName,

            status:
                pairing.status
        });
    }
);

/* ---------------------------------------------------------
   ACCEPT PAIRING
--------------------------------------------------------- */

app.post(
    "/api/pair/:token/accept",
    (req, res) => {

        const receiverIP =
            getClientIP(req);

        const {
            name
        } = req.body;

        if (
            !name ||
            !name.trim()
        ) {

            return res.status(400).json({
                error:
                    "Device name is required"
            });
        }

        const pairings =
            readJSON(pairingsFile);

        const pairing =
            pairings.find(
                p =>
                    p.token ===
                    req.params.token
            );

        if (!pairing) {
            return res.status(404).json({
                error:
                    "Pairing invitation not found"
            });
        }

        if (
            Date.now() -
            pairing.createdAt >
            PAIR_TOKEN_LIFETIME
        ) {

            return res.status(410).json({
                error:
                    "Pairing invitation expired"
            });
        }

        pairing.receiverIP =
            receiverIP;

        pairing.receiverName =
            name.trim();

        pairing.status =
            "connected";

        pairing.receiverLastSeen =
            Date.now();

        /*
            Register receiver device
        */

        const devices =
            readJSON(devicesFile);

        const existingDevice =
            devices.find(
                device =>
                    device.ip ===
                    receiverIP
            );

        if (existingDevice) {

            existingDevice.name =
                name.trim();

            existingDevice.lastSeen =
                Date.now();

        } else {

            devices.push({
                id:
                    crypto.randomUUID(),

                name:
                    name.trim(),

                ip:
                    receiverIP,

                lastSeen:
                    Date.now()
            });
        }

        writeJSON(
            devicesFile,
            devices
        );

        writeJSON(
            pairingsFile,
            pairings
        );

        res.json({
            success: true,

            message:
                "Pairing successful",

            pairingId:
                pairing.id,

            name:
                pairing.receiverName
        });
    }
);

/* ---------------------------------------------------------
   GET PAIRING STATUS
--------------------------------------------------------- */

app.get(
    "/api/pair/:id/status",
    (req, res) => {

        const pairings =
            readJSON(pairingsFile);

        const pairing =
            pairings.find(
                p =>
                    p.id ===
                    req.params.id
            );

        if (!pairing) {

            return res.status(404).json({
                error:
                    "Pairing not found"
            });
        }

        res.json({
            status:
                pairing.status,

            senderIP:
                pairing.senderIP,

            senderName:
                pairing.senderName,

            receiverIP:
                pairing.receiverIP,

            receiverName:
                pairing.receiverName
        });
    }
);

/* ---------------------------------------------------------
   HEARTBEAT
--------------------------------------------------------- */

app.post(
    "/api/pair/:id/heartbeat",
    (req, res) => {

        const clientIP =
            getClientIP(req);

        const pairings =
            readJSON(pairingsFile);

        const pairing =
            pairings.find(
                p =>
                    p.id ===
                    req.params.id
            );

        if (!pairing) {
            return res.status(404).json({
                error:
                    "Pairing not found"
            });
        }

        if (
            clientIP ===
            pairing.senderIP
        ) {

            pairing.senderLastSeen =
                Date.now();

        }

        if (
            clientIP ===
            pairing.receiverIP
        ) {

            pairing.receiverLastSeen =
                Date.now();
        }

        writeJSON(
            pairingsFile,
            pairings
        );

        res.json({
            success: true
        });
    }
);

/* ---------------------------------------------------------
   DISCONNECT
--------------------------------------------------------- */

app.post(
    "/api/pair/:id/disconnect",
    (req, res) => {

        const clientIP =
            getClientIP(req);

        const pairings =
            readJSON(pairingsFile);

        const pairingIndex =
            pairings.findIndex(
                p =>
                    p.id ===
                    req.params.id
            );

        if (
            pairingIndex === -1
        ) {

            return res.status(404).json({
                error:
                    "Pairing not found"
            });
        }

        const pairing =
            pairings[pairingIndex];

        /*
            Either device can disconnect.
        */

        if (
            clientIP !==
            pairing.senderIP &&
            clientIP !==
            pairing.receiverIP
        ) {

            return res.status(403).json({
                error:
                    "You are not part of this pairing"
            });
        }

        pairings.splice(
            pairingIndex,
            1
        );

        writeJSON(
            pairingsFile,
            pairings
        );

        res.json({
            success: true,

            message:
                "Pairing terminated"
        });
    }
);

/* =========================================================
   DEVICES
========================================================= */

app.get(
    "/api/devices",
    (req, res) => {

        const devices =
            readJSON(devicesFile);

        res.json(devices);
    }
);

/* =========================================================
   CLEANUP
========================================================= */

setInterval(
    () => {

        const pairings =
            readJSON(pairingsFile);

        const now =
            Date.now();

        const activePairings =
            pairings.filter(
                pairing => {

                    if (
                        pairing.status !==
                        "connected"
                    ) {
                        return (
                            now -
                            pairing.createdAt <
                            PAIR_TOKEN_LIFETIME
                        );
                    }

                    const senderAlive =
                        now -
                        pairing.senderLastSeen <
                        HEARTBEAT_TIMEOUT;

                    const receiverAlive =
                        now -
                        pairing.receiverLastSeen <
                        HEARTBEAT_TIMEOUT;

                    return (
                        senderAlive &&
                        receiverAlive
                    );
                }
            );

        if (
            activePairings.length !==
            pairings.length
        ) {

            writeJSON(
                pairingsFile,
                activePairings
            );
        }

    },
    10 * 1000
);

/* =========================================================
   FRONTEND
========================================================= */

const frontendPath =
    path.join(
        __dirname,
        "../client/dist"
    );

app.use(
    express.static(
        frontendPath
    )
);

app.use(
    (req, res) => {

        const indexPath =
            path.join(
                frontendPath,
                "index.html"
            );

        if (
            fs.existsSync(indexPath)
        ) {

            res.sendFile(
                indexPath
            );

        } else {

            res.status(404).send(
                "LANShare frontend not built. Run: npm run build"
            );
        }
    }
);

/* =========================================================
   START SERVER
========================================================= */

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        const ip =
            getLocalIP();

        console.log("");
        console.log(
            "======================================"
        );
        console.log(
            "          LANShare Server"
        );
        console.log(
            "======================================"
        );
        console.log("");

        console.log(
            `Local:   http://localhost:${PORT}`
        );

        console.log(
            `LAN:     http://${ip}:${PORT}`
        );

        console.log("");

        console.log(
            "Server is running..."
        );

        console.log("");
    }
);