// server/upload-server.js — CargoChain photo upload endpoint
// Tiny Express server (~50 LOC). Dev-only; no auth.
// Photo hash is computed in the BROWSER (crypto.subtle.digest) and
// sent in the multipart 'hash' field. Server stores the file under
// /uploads/{hashprefix}.jpg and returns { hash }.

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const hash = (req.body && req.body.hash) || ('nohash_' + Date.now());
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, hash.slice(0, 32) + ext);
  },
});

const upload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 } }); // 2 MB cap

const app = express();
app.use(express.urlencoded({ extended: true }));

app.post('/uploads', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  const hash = req.body.hash || path.parse(req.file.filename).name;
  res.json({
    hash,
    url: `/uploads/${req.file.filename}`,
    size: req.file.size,
  });
});

app.use('/uploads', express.static(UPLOAD_DIR));

const PORT = process.env.UPLOAD_PORT || 3000;
app.listen(PORT, () => {
  console.log(`[upload-server] listening on http://127.0.0.1:${PORT}`);
  console.log(`[upload-server] storing photos in ${UPLOAD_DIR}`);
});
