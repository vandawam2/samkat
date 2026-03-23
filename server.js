const express = require('express');
const fs = require('fs');
const app = express();

// Middleware untuk mem-parsing JSON dari Roblox
app.use(express.json());

const SECRET_KEY = "MingHubSuperSecretKey2026";
const WORD_FILE = './wordList.lst'; // Disimpan di folder yang sama dengan server.js

// Daftar key valid (Bisa kamu ubah/tambah sesuai kebutuhan)
const VALID_KEYS = ["minghub_premium_123", "test_key", "admin_key"];

// ==========================================
// FUNGSI KRIPTOGRAFI RC4
// ==========================================
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
// MANAJEMEN DATABASE KATA
// ==========================================
function getWords() {
    if (!fs.existsSync(WORD_FILE)) return [];
    const data = fs.readFileSync(WORD_FILE, 'utf8');
    return data.split('\n').map(w => w.trim()).filter(w => w.length > 0);
}

function saveWords(wordsArray) {
    const uniqueWords = [...new Set(wordsArray)].sort();
    fs.writeFileSync(WORD_FILE, uniqueWords.join('\n'), 'utf8');
}

// ==========================================
// ENDPOINT 1: SISTEM KATA (/words)
// ==========================================
app.post('/words', (req, res) => {
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
        let wordsList = getWords();
        let responseData = { success: true };

        if (action === "get") {
            responseData.words = wordsList;
        } else if (action === "add" && word) {
            const cleanWord = word.toLowerCase().trim();
            if (!wordsList.includes(cleanWord) && !cleanWord.includes("#")) {
                wordsList.push(cleanWord);
                saveWords(wordsList);
            }
            responseData.message = "Word added";
        } else if (action === "delete" && word) {
            const cleanWord = word.toLowerCase().trim();
            wordsList = wordsList.filter(w => w !== cleanWord);
            saveWords(wordsList);
            responseData.message = "Word deleted";
        }

        const resNonce = Math.floor(Math.random() * 900000 + 100000).toString() + Date.now();
        const resSessionKey = SECRET_KEY + "_" + resNonce;
        const resJson = JSON.stringify(responseData);
        const resEncryptedBuffer = rc4(resSessionKey, Buffer.from(resJson, 'utf8'));
        const resPayload = resEncryptedBuffer.toString('base64');

        return res.json({ nonce: resNonce, payload: resPayload });
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ==========================================
// ENDPOINT 2: KEY SYSTEM (/checkkey)
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

        const { key, username, hwid } = requestData;
        let responseData = {};

        // Validasi Kunci
        if (VALID_KEYS.includes(key)) {
            responseData = { valid: true, message: `Welcome to ZuperMing Hub, ${username}!` };
            console.log(`[AUTH SUCCESS] User: ${username} | Key: ${key}`);
        } else {
            responseData = { valid: false, message: "Invalid or Expired Key!" };
            console.log(`[AUTH FAILED] User: ${username} | Key: ${key}`);
        }

        const resNonce = Math.floor(Math.random() * 900000 + 100000).toString() + Date.now();
        const resSessionKey = SECRET_KEY + "_" + resNonce;
        const resJson = JSON.stringify(responseData);
        const resEncryptedBuffer = rc4(resSessionKey, Buffer.from(resJson, 'utf8'));
        const resPayload = resEncryptedBuffer.toString('base64');

        return res.json({ nonce: resNonce, payload: resPayload });

    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ==========================================
// JALANKAN SERVER
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 MingHub Server berjalan di port ${PORT}`);
});
