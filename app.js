// Forzar DNS Google para MongoDB Atlas
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

// app.js v4
if (!process.env.DOTENV_SKIP) { try { require('dotenv').config(); } catch(e) {} }
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Crear carpetas necesarias
['uploads', 'uploads/fotos', 'data'].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// Rutas API
app.use('/api', require('./routes/api'));

// QR WhatsApp (solo admin)
app.get('/api/qr', (req, res) => {
  try {
    const qr = fs.readFileSync('./data/qr.txt', 'utf8');
    const status = fs.existsSync('./data/qr_status.txt') ? fs.readFileSync('./data/qr_status.txt', 'utf8').trim() : 'pending';
    res.json({ ok: true, qr, status });
  } catch {
    res.json({ ok: false, status: 'no_qr' });
  }
});

// SPA fallback
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ─── RECORDATORIOS ────────────────────────────────────────────────────────────
let waClient = null;
function setWAClient(c) { waClient = c; }

async function enviarRecordatorio(userId, mensaje) {
  if (!waClient) return;
  const { User } = require('./models');
  try {
    const user = await User.findById(userId);
    if (!user?.telefono || !user?.preferencias?.recordatorios_activos) return;
    await waClient.sendText(user.telefono + '@c.us', mensaje);
  } catch (e) { console.error('Error recordatorio:', e.message); }
}

// Agua cada hora
cron.schedule('0 * * * *', async () => {
  if (!waClient) return;
  const { User } = require('./models');
  try {
    const hora = new Date().getHours();
    // Ventana horaria: respetar configuración de cada usuario (default 8am-21pm)
    const usuarios = await User.find({ 'preferencias.recordatorios_activos': true, telefono: { $exists: true, $ne: null } });
    for (const user of usuarios) {
      const cadaHoras = user.preferencias?.recordatorio_agua_horas || 2;
      const horaInicio = user.preferencias?.notif_hora_inicio ?? 8;
      const horaFin = user.preferencias?.notif_hora_fin ?? 21;
      if (hora < horaInicio || hora > horaFin) continue;
      if (hora % cadaHoras === 0 && user.preferencias?.notif_agua !== false) {
        const msg = user.preferencias?.notif_agua_msg || `💧 *¡Hora de hidratarse, ${user.nombre}!*\n\nToma un vaso de agua ahora. La hidratación es clave para tu rendimiento 🏋️`;
        await enviarRecordatorio(user._id, msg);
      }
    }
  } catch (e) { console.error('Cron agua:', e.message); }
});

// Comida 7am, 1pm, 8pm
cron.schedule('0 7,13,20 * * *', async () => {
  if (!waClient) return;
  const { User, WeekPlan } = require('./models');
  try {
    const hora = new Date().getHours();
    const tipo = hora === 7 ? 'desayuno' : hora === 13 ? 'almuerzo' : 'cena';
    const emoji = hora === 7 ? '🌅' : hora === 13 ? '☀️' : '🌙';
    const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const dia = dias[new Date().getDay()];
    const lunes = new Date(); lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7)); lunes.setHours(0,0,0,0);
    const usuarios = await User.find({ 'preferencias.recordatorios_activos': true, telefono: { $exists: true } });
    for (const user of usuarios) {
      const plan = await WeekPlan.findOne({ usuario_id: user._id, semana_inicio: { $gte: lunes } });
      const diaObj = plan?.dias?.find(d => d.dia === dia);
      const comida = diaObj?.comidas?.find(c => c.tipo === tipo);
      if (comida) {
        await enviarRecordatorio(user._id, `${emoji} *¡Hora de ${tipo}, ${user.nombre}!*\n\n📋 Tu plan: *${comida.nombre}*\n🔥 ${comida.calorias}kcal | P:${comida.proteinas_g}g C:${comida.carbohidratos_g}g G:${comida.grasas_g}g\n\n¿Ya comiste? Respóndeme ✅`);
      } else {
        await enviarRecordatorio(user._id, `${emoji} *¡Hora de ${tipo}, ${user.nombre}!*\n\nRecuerda seguir tu plan de nutrición 🥗`);
      }
    }
  } catch (e) { console.error('Cron comida:', e.message); }
});

// Pesaje semanal lunes 8am
cron.schedule('0 8 * * 1', async () => {
  if (!waClient) return;
  const { User } = require('./models');
  try {
    const usuarios = await User.find({ 'preferencias.recordatorios_activos': true, telefono: { $exists: true } });
    for (const user of usuarios) {
      await enviarRecordatorio(user._id, `⚖️ *¡Día de pesaje, ${user.nombre}!*\n\nPésate en ayunas y escríbeme:\n*"mi peso es X kg"*\n\nLo registro automáticamente 📊`);
    }
  } catch (e) { console.error('Cron pesaje:', e.message); }
});

// Foto mensual el 1 de cada mes
cron.schedule('0 9 1 * *', async () => {
  if (!waClient) return;
  const { User } = require('./models');
  try {
    const usuarios = await User.find({ 'preferencias.recordatorios_activos': true, telefono: { $exists: true } });
    for (const user of usuarios) {
      await enviarRecordatorio(user._id, `📸 *¡Foto de progreso mensual, ${user.nombre}!*\n\nDocumenta tu transformación este mes.\n\n🔒 *Tus fotos son 100% privadas — solo tú las ves.*\n\nSúbela en la app web → Fotos Progreso 💪`);
    }
  } catch (e) { console.error('Cron foto:', e.message); }
});

// ─── INICIO ───────────────────────────────────────────────────────────────────
async function start() {
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/gymbot';
  
  // Verificar API key
  console.log('✅ Iniciando MAX Fitness Coach...');
  console.log('🔑 API Key:', process.env.ANTHROPIC_API_KEY ? 'OK' : 'NO ENCONTRADA');

  // Conectar MongoDB
  const isLocal = MONGO_URI.includes('localhost') || MONGO_URI.includes('127.0.0.1');
  console.log(isLocal ? '⏳ Conectando MongoDB Local...' : '⏳ Conectando MongoDB Atlas...');
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      retryWrites: true
    });
    console.log(isLocal ? '✅ MongoDB Local conectado' : '✅ MongoDB Atlas conectado');
  } catch (err) {
    console.error('❌ MongoDB error:', err.message);
    if (!isLocal) {
      console.error('\n👉 Para conectar MongoDB Atlas:');
      console.error('   1. Ve a cloud.mongodb.com → Network Access → Add IP → 0.0.0.0/0');
      console.error('   2. Verifica tu MONGO_URI en .env');
      console.error('   MONGO_URI=mongodb+srv://USUARIO:PASSWORD@cluster0.xxxxx.mongodb.net/gymbot\n');
    }
    process.exit(1);
  }

  // Crear admin si no existe
  const { User } = require('./models');
  const bcrypt = require('bcryptjs');
  try {
    const adminExiste = await User.findOne({ email: 'admin' });
    if (!adminExiste) {
      const hash = await bcrypt.hash('admin', 10);
      await User.create({ nombre: 'Admin', email: 'admin', password: hash, es_admin: true });
      console.log('✅ Admin creado: usuario=admin contraseña=admin');
    }
  } catch (e) {
    console.log('⚠️ Admin ya existe o error:', e.message);
  }

  app.listen(PORT, () => {
    console.log('\n====================================');
    console.log('  🏋️  MAX FITNESS COACH v4.0');
    console.log('====================================');
    console.log(`  🌐 Web:  http://localhost:${PORT}`);
    console.log(`  📲 QR:   http://localhost:${PORT}/qr`);
    console.log(`  🗄️  DB:   ${MONGO_URI.includes('localhost') ? 'MongoDB Local' : 'MongoDB Atlas'}`);
    console.log('====================================\n');
  });

  // WhatsApp
  const MODE = process.env.MODE || 'both';
  if (MODE === 'both' || MODE === 'whatsapp') {
    const { initWhatsApp } = require('./whatsapp');
    const client = await initWhatsApp();
    if (client) setWAClient(client);
  }
}

function getWAClient() { return waClient; }
module.exports = { setWAClient, getWAClient };
start();
