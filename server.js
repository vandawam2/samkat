const express = require('express');
const admin = require('firebase-admin');
const app = express();
app.use(express.json());

// ==========================================
// 1. INISIALISASI FIREBASE ADMIN
// ==========================================
// Mengambil kredensial dari Environment Variable Render agar aman
if (!process.env.FIREBASE_CREDENTIALS || !process.env.FIREBASE_DB_URL) {
    console.error("❌ ERROR FATAL: FIREBASE_CREDENTIALS atau FIREBASE_DB_URL belum diatur di Render!");
    process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DB_URL
});

const db = admin.database();
const wordsRef = db.ref('words'); // Kita simpan semua kata di folder "words"

// Cache lokal untuk mempercepat pengiriman data ke Roblox
let localWordsCache = [];

// [SISTEM REAL-TIME] Setiap ada perubahan di database, RAM server otomatis diperbarui
wordsRef.on('value', (snapshot) => {
    const data = snapshot.val();
    if (data) {
        // Firebase menyimpan sebagai Object { "makan": true, "minum": true }
        // Kita ubah menjadi Array ["makan", "minum"]
        localWordsCache = Object.keys(data);
    } else {
        localWordsCache = [];
    }
    console.log(`[Firebase] Sinkronisasi Sukses! Total kata di RAM: ${localWordsCache.length}`);
});

// ==========================================
// 2. KONFIGURASI KEAMANAN (API)
// ==========================================
const SECRET_KEY = "MingHubSuperSecretKey2026";
const VALID_KEYS = ["minghub_premium_123", "test_key", "admin_key"];

function rc4(keyString, dataBuffer) {
    let s = Array.from({ length: 256 }, (_, i) => i);
    let j = 0;
    let key = Buffer.from(keyString, 'utf8');
    for (let i = 0; i < 256; i++) {
        j = (j + s[i] + key[i % key.length]) % 256;
        let temp = s[i]; s[i] = s[j]; s[j] = temp;
    }
    let i = 0; j = 0;
    let res = Buffer.alloc(dataBuffer.length);
    for (let y = 0; y < dataBuffer.length; y++) {
        i = (i + 1) % 256;
        j = (j + s[i]) % 256;
        let temp = s[i]; s[i] = s[j]; s[j] = temp;
        res[y] = dataBuffer[y] ^ s[(s[i] + s[j]) % 256];
    }
    return res;
}

// ==========================================
// 3. ENDPOINT API: /words
// ==========================================
app.post('/words', async (req, res) => {
    try {
        const { nonce, payload } = req.body;
        if (!nonce || !payload) return res.status(400).json({ error: "Invalid Request" });

        const sessionKey = SECRET_KEY + "_" + nonce;
        const encryptedBuffer = Buffer.from(payload, 'base64');
        const decryptedBuffer = rc4(sessionKey, encryptedBuffer);
        
        let requestData;
        try {
            let decryptedString = decryptedBuffer.toString('utf8').replace(/\0/g, '').trim(); 
            requestData = JSON.parse(decryptedString);
        } catch (e) {
            return res.status(403).json({ error: "Security Error: Bad Decryption" });
        }

        const { action, word } = requestData;
        let responseData = { success: true };

        // LOGIKA FIREBASE
        if (action === "get") {
            // Ambil dari Cache RAM, bukan dari DB (Sangat Cepat & Hemat Kuota Firebase)
            responseData.words = localWordsCache; 
        } 
        else if (action === "add" && word) {
            const cleanWord = word.toLowerCase().trim();
            if (!localWordsCache.includes(cleanWord)) {
                // Simpan ke Firebase (Format: child("makan").set(true))
                await wordsRef.child(cleanWord).set(true); 
                console.log(`[+] Kata baru ditambahkan ke Firebase: ${cleanWord}`);
            }
            responseData.message = "Word added";
        } 
        else if (action === "delete" && word) {
            const cleanWord = word.toLowerCase().trim();
            // Hapus dari Firebase
            await wordsRef.child(cleanWord).remove();
            console.log(`[-] Kata salah dihapus dari Firebase: ${cleanWord}`);
            responseData.message = "Word deleted";
        }

        // ENCRYPT RESPONSE KEMBALI
        const resNonce = Math.floor(Math.random() * 900000 + 100000).toString() + Date.now();
        const resSessionKey = SECRET_KEY + "_" + resNonce;
        const resJson = JSON.stringify(responseData);
        const resEncryptedBuffer = rc4(resSessionKey, Buffer.from(resJson, 'utf8'));
        const resPayload = resEncryptedBuffer.toString('base64');

        return res.json({ nonce: resNonce, payload: resPayload });
    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ==========================================
// 4. ENDPOINT API: /checkkey
// ==========================================
app.post('/checkkey', (req, res) => {
    try {
        const { nonce, payload } = req.body;
        if (!nonce || !payload) return res.status(400).json({ error: "Invalid Request" });

        const sessionKey = SECRET_KEY + "_" + nonce;
        const encryptedBuffer = Buffer.from(payload, 'base64');
        const decryptedBuffer = rc4(sessionKey, encryptedBuffer);
        
        let requestData;
        try {
            let decryptedString = decryptedBuffer.toString('utf8').replace(/\0/g, '').trim();
            requestData = JSON.parse(decryptedString);
        } catch (e) {
            return res.status(403).json({ error: "Security Error: Bad Decryption" });
        }

        const { key, username } = requestData;
        let responseData = {};

        if (VALID_KEYS.includes(key)) {
            responseData = { valid: true, message: `Welcome to ZuperMing Hub, ${username}!` };
        } else {
            responseData = { valid: false, message: "Invalid Key!" };
        }

        const resNonce = Math.floor(Math.random() * 900000 + 100000).toString() + Date.now();
        const resSessionKey = SECRET_KEY + "_" + resNonce;
        const resPayload = rc4(resSessionKey, Buffer.from(JSON.stringify(responseData), 'utf8')).toString('base64');

        return res.json({ nonce: resNonce, payload: resPayload });
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 MingHub Server + Firebase berjalan di port ${PORT}`);
});
