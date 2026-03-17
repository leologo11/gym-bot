// app.js — Servidor principal (sin MongoDB)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Inicializar base de datos JSON
const db = require('./db');
db.initDB();

// Rutas API
app.use('/api', require('./routes/api'));

// QR WhatsApp
app.get('/api/qr', (req, res) => {
  try {
    const qr = fs.readFileSync('./data/qr.txt', 'utf8');
    const status = fs.existsSync('./data/qr_status.txt') ? fs.readFileSync('./data/qr_status.txt', 'utf8').trim() : 'pending';
    res.json({ ok: true, qr, status });
  } catch {
    res.json({ ok: false, status: 'no_qr', message: 'QR no generado aún' });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function start() {
  // Crear carpeta data si no existe
  if (!fs.existsSync('./data')) fs.mkdirSync('./data');

  app.listen(PORT, () => {
    console.log('\n====================================');
    console.log('  💪 MAX FITNESS COACH v3.0');
    console.log('====================================');
    console.log(`  🌐 Web:  http://localhost:${PORT}`);
    console.log(`  📲 QR:   http://localhost:${PORT}/qr`);
    console.log(`  ⚙️  Modo: ${process.env.MODE || 'both'}`);
    console.log('  📁 DB:   JSON (data/)');
    console.log('====================================\n');
  });

  // WhatsApp
  const { initWhatsApp } = require('./whatsapp');
  await initWhatsApp();
}

start().catch(e => {
  console.error('Error al iniciar:', e.message);
  process.exit(1);
});
