// routes/api.js v4
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { User, WeekPlan, SemanaHistorial, Progreso, Chat } = require('../models');
const { askCoach, generarPlanSemanal, analizarSemana, generarAlternativaEjercicio, generarAlternativaComida, generarAlternativaDia } = require('../coach');

const JWT_SECRET = process.env.JWT_SECRET || 'gym_secret_2026';

// Cloudinary config
const cloudinary = require('cloudinary').v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dbs9kvhxz',
  api_key: process.env.CLOUDINARY_API_KEY || '781183274957775',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'N-ilRuWNFxtfQwoSmOv9MVNOTCA'
});

// Multer memory storage para Cloudinary
const upload = multer({ 
  storage: multer.memoryStorage(), 
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo imágenes'));
  }
});

// Helper para subir a Cloudinary
async function uploadToCloudinary(buffer, userId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'gym-bot/fotos', public_id: Date.now() + '_' + userId, resource_type: 'image' },
      (error, result) => { if (error) reject(error); else resolve(result); }
    );
    stream.end(buffer);
  });
}

// ─── AUTH MIDDLEWARE ──────────────────────────────────────────────────────────
function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Token inválido' }); }
}

function adminAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.es_admin) return res.status(403).json({ error: 'Solo admin' });
    req.user = decoded;
    next();
  } catch { res.status(401).json({ error: 'Token inválido' }); }
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
router.post('/auth/register', async (req, res) => {
  try {
    const { nombre, email, password, objetivo, nivel, peso_corporal_kg, altura_cm, edad, sexo, nacionalidad, pais_residencia } = req.body;
    if (!nombre || !email || !password) return res.status(400).json({ error: 'Nombre, email y password requeridos' });
    if (await User.findOne({ email })) return res.status(400).json({ error: 'Email ya registrado' });
    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ nombre, email, password: hash, objetivo, nivel, peso_corporal_kg, altura_cm, edad, sexo: sexo || 'm', nacionalidad: nacionalidad || 'Chile', pais_residencia: pais_residencia || 'Chile' });
    const token = jwt.sign({ id: user._id, nombre: user.nombre, es_admin: user.es_admin }, JWT_SECRET, { expiresIn: '30d' });
    const u = user.toObject(); delete u.password;
    res.json({ ok: true, token, user: u });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'Usuario no encontrado' });
    if (!await bcrypt.compare(password, user.password)) return res.status(400).json({ error: 'Contraseña incorrecta' });
    user.ultimo_acceso = new Date(); await user.save();
    const token = jwt.sign({ id: user._id, nombre: user.nombre, es_admin: user.es_admin }, JWT_SECRET, { expiresIn: '30d' });
    const u = user.toObject(); delete u.password;
    res.json({ ok: true, token, user: u });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PERFIL ───────────────────────────────────────────────────────────────────
router.get('/profile', auth, async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');
  if (!user) return res.status(404).json({ error: 'No encontrado' });
  res.json({ ok: true, user });
});

router.put('/profile', auth, async (req, res) => {
  try {
    const allowed = ['nombre', 'objetivo', 'nivel', 'peso_corporal_kg', 'altura_cm', 'edad', 'sexo', 'nacionalidad', 'pais_residencia', 'dias_entreno', 'hora_gym', 'dieta_dias', 'telefono', 'dieta'];
    const changes = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) changes[k] = req.body[k]; });
    const user = await User.findByIdAndUpdate(req.user.id, { $set: changes }, { new: true }).select('-password');
    res.json({ ok: true, user });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PREFERENCIAS ─────────────────────────────────────────────────────────────
router.get('/preferences', auth, async (req, res) => {
  const user = await User.findById(req.user.id).select('preferencias');
  res.json({ ok: true, preferencias: user.preferencias || {} });
});

router.put('/preferences', auth, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.user.id, { $set: { preferencias: req.body } }, { new: true }).select('preferencias');
    res.json({ ok: true, preferencias: user.preferencias });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── CONTROL DE PESO ─────────────────────────────────────────────────────────
router.post('/weight', auth, async (req, res) => {
  try {
    const { peso_kg, grasa_corporal_pct, notas } = req.body;
    const user = await User.findById(req.user.id);
    user.historial_peso.push({ peso_kg, grasa_corporal_pct, notas, fecha: new Date() });
    user.peso_corporal_kg = peso_kg;
    await user.save();
    await Progreso.create({ usuario_id: req.user.id, tipo: 'peso_corporal', peso_corporal_kg: peso_kg, grasa_corporal_pct });
    res.json({ ok: true, historial: user.historial_peso });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/weight', auth, async (req, res) => {
  const user = await User.findById(req.user.id).select('historial_peso peso_corporal_kg');
  res.json({ ok: true, historial: user.historial_peso || [], actual: user.peso_corporal_kg });
});

// ─── FOTOS DE PROGRESO ────────────────────────────────────────────────────────
router.post('/photo', auth, upload.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió foto' });
    const { descripcion } = req.body;
    // Subir a Cloudinary
    const result = await uploadToCloudinary(req.file.buffer, req.user.id);
    const foto_path = result.secure_url;
    await Progreso.create({ usuario_id: req.user.id, tipo: 'foto', foto_path, foto_descripcion: descripcion || '' });
    res.json({ ok: true, foto_path, mensaje: '📸 Foto guardada en la nube. Solo tú puedes verla.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/photos', auth, async (req, res) => {
  const fotos = await Progreso.find({ usuario_id: req.user.id, tipo: 'foto' }).sort({ fecha: -1 });
  res.json({ ok: true, fotos });
});

// ─── PLAN SEMANAL ─────────────────────────────────────────────────────────────
function getLunes() {
  const h = new Date(); const l = new Date(h);
  l.setDate(h.getDate() - ((h.getDay() + 6) % 7)); l.setHours(0,0,0,0);
  return l;
}

router.get('/plan/current', auth, async (req, res) => {
  try {
    const lunes = getLunes();
    const plan = await WeekPlan.findOne({ usuario_id: req.user.id, semana_inicio: { $gte: lunes } });
    res.json({ ok: true, plan: plan || null, semana_inicio: lunes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/plan/generate', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    console.log('⚡ Generando plan para', user.nombre);
    const planData = await generarPlanSemanal(user);
    if (!planData?.dias?.length) return res.status(500).json({ error: 'IA no devolvió plan válido' });
    const lunes = getLunes();
    const domingo = new Date(lunes.getTime() + 6*864e5);
    const label = `${lunes.getDate()} ${lunes.toLocaleString('es-CL',{month:'short'})} - ${domingo.getDate()} ${domingo.toLocaleString('es-CL',{month:'short',year:'numeric'})}`;
    await WeekPlan.deleteOne({ usuario_id: req.user.id, semana_inicio: { $gte: lunes } });
    const plan = await WeekPlan.create({ usuario_id: req.user.id, semana_inicio: lunes, semana_label: label, dias: planData.dias, generado_por_ia: true });
    res.json({ ok: true, plan });
  } catch (e) { console.error('Plan error:', e.message); res.status(500).json({ error: e.message }); }
});

// Marcar comida cumplida
router.patch('/plan/:planId/meal/:di/:mi/complete', auth, async (req, res) => {
  try {
    const plan = await WeekPlan.findOne({ _id: req.params.planId, usuario_id: req.user.id });
    if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });
    const meal = plan.dias[+req.params.di]?.comidas[+req.params.mi];
    if (!meal) return res.status(404).json({ error: 'Comida no encontrada' });
    meal.completado = !meal.completado;
    meal.completado_at = meal.completado ? new Date() : null;
    plan.actualizado_at = new Date(); await plan.save();
    if (meal.completado) { console.log('Guardando progreso comida:', meal.nombre, meal.calorias, 'kcal'); await Progreso.create({ usuario_id: req.user.id, tipo: 'comida', comida: meal.nombre, calorias: meal.calorias || 0, proteinas_g: meal.proteinas_g, carbohidratos_g: meal.carbohidratos_g, grasas_g: meal.grasas_g, canal: 'web' });
    }
    res.json({ ok: true, completado: meal.completado });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Marcar ejercicio cumplido (con peso_real y sensacion)
router.patch('/plan/:planId/exercise/:di/:ei/complete', auth, async (req, res) => {
  try {
    const { peso_real_kg, reps_reales, sensacion } = req.body || {};
    const plan = await WeekPlan.findOne({ _id: req.params.planId, usuario_id: req.user.id });
    if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });
    const ex = plan.dias[+req.params.di]?.ejercicios[+req.params.ei];
    if (!ex) return res.status(404).json({ error: 'Ejercicio no encontrado' });
    ex.completado = !ex.completado;
    ex.completado_at = ex.completado ? new Date() : null;
    if (peso_real_kg) ex.peso_real_kg = peso_real_kg;
    if (reps_reales) ex.reps_reales = reps_reales;
    if (sensacion) ex.sensacion = sensacion;
    plan.actualizado_at = new Date(); await plan.save();
    if (ex.completado) {
      const pesoUsado = peso_real_kg || ex.peso_kg;
      await Progreso.create({ usuario_id: req.user.id, tipo: 'ejercicio', ejercicio: ex.nombre, peso_kg: pesoUsado, reps: parseInt(reps_reales||ex.reps)||0, series: ex.series, canal: 'web' });
      // Actualizar historial semanal
      const lunes = getLunes();
      const domingo = new Date(lunes.getTime() + 6*864e5);
      const label = `${lunes.getDate()} ${lunes.toLocaleString('es-CL',{month:'short'})} - ${domingo.getDate()} ${domingo.toLocaleString('es-CL',{month:'short',year:'numeric'})}`;
      let semana = await SemanaHistorial.findOne({ usuario_id: req.user.id, semana_inicio: { $gte: lunes } });
      if (!semana) {
        const user = await User.findById(req.user.id);
        semana = new SemanaHistorial({ usuario_id: req.user.id, semana_inicio: lunes, semana_label: label, peso_corporal_inicio: user.peso_corporal_kg, dias_entrenados: 0, ejercicios: [] });
      }
      // Buscar peso anterior
      const semanaAnterior = await SemanaHistorial.findOne({ usuario_id: req.user.id, semana_inicio: { $lt: lunes } }).sort({ semana_inicio: -1 });
      const exAnterior = semanaAnterior?.ejercicios?.find(e => e.ejercicio === ex.nombre);
      const mejora = exAnterior?.peso_kg ? ((pesoUsado - exAnterior.peso_kg) / exAnterior.peso_kg * 100) : 0;
      semana.ejercicios.push({ ejercicio: ex.nombre, grupo_muscular: ex.grupo_muscular, series_realizadas: ex.series, reps_realizadas: reps_reales || ex.reps, peso_kg: pesoUsado, peso_anterior_kg: exAnterior?.peso_kg, mejora_pct: mejora, sensacion: sensacion || 'normal' });
      semana.dias_entrenados = (semana.dias_entrenados || 0) + 0.25; // aproximado
      await semana.save();
      // Actualizar récord
      const user = await User.findById(req.user.id);
      const recordActual = user.records?.get?.(ex.nombre);
      if (!recordActual || pesoUsado > recordActual.peso_kg) {
        user.records.set(ex.nombre, { peso_kg: pesoUsado, reps: parseInt(reps_reales||ex.reps)||0, series: ex.series, fecha: new Date().toISOString() });
        await user.save();
      }
    }
    res.json({ ok: true, completado: ex.completado });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Alternativas
router.post('/plan/:planId/exercise/:di/:ei/alternativa', auth, async (req, res) => {
  try {
    const plan = await WeekPlan.findOne({ _id: req.params.planId, usuario_id: req.user.id });
    const ex = plan?.dias[+req.params.di]?.ejercicios[+req.params.ei];
    if (!ex) return res.status(404).json({ error: 'Ejercicio no encontrado' });
    const user = await User.findById(req.user.id);
    const alt = await generarAlternativaEjercicio(user, ex, req.body.contexto || '');
    res.json({ ok: true, alternativa: alt });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/plan/:planId/exercise/:di/:ei/aplicar', auth, async (req, res) => {
  try {
    const plan = await WeekPlan.findOne({ _id: req.params.planId, usuario_id: req.user.id });
    if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });
    plan.dias[+req.params.di].ejercicios[+req.params.ei] = { ...req.body.alternativa, completado: false };
    await plan.save(); res.json({ ok: true, plan });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/plan/:planId/meal/:di/:mi/alternativa', auth, async (req, res) => {
  try {
    const plan = await WeekPlan.findOne({ _id: req.params.planId, usuario_id: req.user.id });
    const meal = plan?.dias[+req.params.di]?.comidas[+req.params.mi];
    if (!meal) return res.status(404).json({ error: 'Comida no encontrada' });
    const user = await User.findById(req.user.id);
    const alt = await generarAlternativaComida(user, meal, req.body.contexto || '');
    res.json({ ok: true, alternativa: alt });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/plan/:planId/meal/:di/:mi/aplicar', auth, async (req, res) => {
  try {
    const plan = await WeekPlan.findOne({ _id: req.params.planId, usuario_id: req.user.id });
    if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });
    plan.dias[+req.params.di].comidas[+req.params.mi] = { ...req.body.alternativa, completado: false };
    await plan.save(); res.json({ ok: true, plan });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/plan/:planId/day/:di/alternativa', auth, async (req, res) => {
  try {
    const { tipo = 'ejercicios' } = req.body;
    const plan = await WeekPlan.findOne({ _id: req.params.planId, usuario_id: req.user.id });
    const dia = plan?.dias[+req.params.di];
    if (!dia) return res.status(404).json({ error: 'Día no encontrado' });
    const user = await User.findById(req.user.id);
    const alt = await generarAlternativaDia(user, dia, tipo);
    res.json({ ok: true, alternativa: alt, tipo });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/plan/:planId/day/:di/aplicar', auth, async (req, res) => {
  try {
    const plan = await WeekPlan.findOne({ _id: req.params.planId, usuario_id: req.user.id });
    if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });
    const { tipo, alternativa } = req.body;
    if (tipo === 'ejercicios' && alternativa.ejercicios) plan.dias[+req.params.di].ejercicios = alternativa.ejercicios.map(e => ({ ...e, completado: false }));
    else if (tipo === 'comidas' && alternativa.comidas) plan.dias[+req.params.di].comidas = alternativa.comidas.map(c => ({ ...c, completado: false }));
    await plan.save(); res.json({ ok: true, plan });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── HISTORIAL SEMANAL ────────────────────────────────────────────────────────
router.get('/weekly-history', auth, async (req, res) => {
  const historial = await SemanaHistorial.find({ usuario_id: req.user.id }).sort({ semana_inicio: -1 }).limit(12);
  res.json({ ok: true, historial });
});

router.post('/weekly-history/:id/analyze', auth, async (req, res) => {
  try {
    const semana = await SemanaHistorial.findOne({ _id: req.params.id, usuario_id: req.user.id });
    if (!semana) return res.status(404).json({ error: 'Semana no encontrada' });
    const user = await User.findById(req.user.id);
    const analisis = await analizarSemana(user, semana);
    semana.recomendaciones_ia = analisis;
    await semana.save();
    res.json({ ok: true, analisis });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PROGRESO ─────────────────────────────────────────────────────────────────
router.get('/progress', auth, async (req, res) => {
  try {
    const { periodo = 'semana', tipo } = req.query;
    const ahora = new Date(); let desde = new Date();
    if (periodo === 'semana') desde.setDate(ahora.getDate() - 7);
    else if (periodo === 'mes') desde.setMonth(ahora.getMonth() - 1);
    else if (periodo === 'año') desde.setFullYear(ahora.getFullYear() - 1);
    const query = { usuario_id: req.user.id, fecha: { $gte: desde } };
    if (tipo) query.tipo = tipo;
    const registros = await Progreso.find(query).sort({ fecha: -1 }).limit(100);
    const porDia = {};
    registros.forEach(r => {
      // Usar fecha local Chile (UTC-4) para no cruzar días
      const fechaLocal = new Date(r.fecha.getTime() - 4*60*60*1000);
      const dia = fechaLocal.toISOString().split('T')[0];
      if (!porDia[dia]) porDia[dia] = { ejercicios: 0, comidas: 0, calorias: 0, proteinas: 0 };
      if (r.tipo === 'ejercicio') porDia[dia].ejercicios++;
      if (r.tipo === 'comida') { porDia[dia].comidas++; porDia[dia].calorias += r.calorias || 0; porDia[dia].proteinas += r.proteinas_g || 0; }
    });
    res.json({ ok: true, registros, porDia });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── WHATSAPP STATUS ──────────────────────────────────────────────────────────
router.get('/whatsapp/status', auth, async (req, res) => {
  const user = await User.findById(req.user.id).select('telefono');
  res.json({ ok: true, vinculado: !!user.telefono, telefono: user.telefono || null });
});

// ─── CHAT ─────────────────────────────────────────────────────────────────────
router.post('/chat', auth, async (req, res) => {
  try {
    const { mensaje } = req.body;
    if (!mensaje) return res.status(400).json({ error: 'Mensaje requerido' });
    const user = await User.findById(req.user.id);
    const lunes = getLunes();
    const weekPlan = await WeekPlan.findOne({ usuario_id: req.user.id, semana_inicio: { $gte: lunes } });
    const semanaAnterior = await SemanaHistorial.findOne({ usuario_id: req.user.id, semana_inicio: { $lt: lunes } }).sort({ semana_inicio: -1 });
    const { registros: recentProgress } = await Progreso.find({ usuario_id: req.user.id }).sort({ fecha: -1 }).limit(10).then(r => ({ registros: r })).catch(() => ({ registros: [] }));
    let chat = await Chat.findOne({ usuario_id: req.user.id, canal: 'web' }).sort({ actualizado_at: -1 });
    if (!chat) chat = new Chat({ usuario_id: req.user.id, canal: 'web', mensajes: [] });
    const historialMensajes = chat.mensajes.slice(-16);
    const { respuesta, registro, cambio, cambioPerfil } = await askCoach({ mensaje, user, weekPlan, recentProgress, historialMensajes, semanaHistorial: semanaAnterior });
    chat.mensajes.push({ rol: 'user', contenido: mensaje }, { rol: 'assistant', contenido: respuesta });
    chat.mensajes = chat.mensajes.slice(-50); chat.actualizado_at = new Date(); await chat.save();
    // Guardar registro de ejercicio
    if (registro) {
      await Progreso.create({ usuario_id: req.user.id, tipo: 'ejercicio', ejercicio: registro.ejercicio, peso_kg: registro.peso, reps: registro.reps, series: registro.series, canal: 'web' });
      user.records.set(registro.ejercicio, { peso_kg: registro.peso, reps: registro.reps, series: registro.series, fecha: new Date().toISOString() });
      await user.save();
    }
    // Aplicar cambio al plan
    let planActualizado = null;
    if (cambio && weekPlan) {
      const diaObj = weekPlan.dias.find(d => d.dia.toLowerCase() === cambio.dia.toLowerCase());
      if (diaObj) {
        if (cambio.tipo === 'comida' && diaObj.comidas?.[cambio.indice]) diaObj.comidas[cambio.indice] = { ...cambio.datos, completado: false };
        else if (cambio.tipo === 'ejercicio' && diaObj.ejercicios?.[cambio.indice]) diaObj.ejercicios[cambio.indice] = { ...cambio.datos, completado: false };
        weekPlan.actualizado_at = new Date(); await weekPlan.save(); planActualizado = true;
      }
    }
    // Aplicar cambio de perfil
    if (cambioPerfil?.campo && cambioPerfil?.valor) {
      const update = {};
      const val = isNaN(cambioPerfil.valor) ? cambioPerfil.valor : parseFloat(cambioPerfil.valor);
      update[cambioPerfil.campo] = val;
      await User.findByIdAndUpdate(req.user.id, { $set: update });
      if (cambioPerfil.campo === 'peso_corporal_kg') {
        await User.findByIdAndUpdate(req.user.id, { $push: { historial_peso: { peso_kg: val, fecha: new Date() } } });
        await Progreso.create({ usuario_id: req.user.id, tipo: 'peso_corporal', peso_corporal_kg: val });
      }
    }
    res.json({ ok: true, respuesta, registro, cambio: cambio ? { tipo: cambio.tipo, dia: cambio.dia } : null, planActualizado: !!planActualizado, cambioPerfil: cambioPerfil || null });
  } catch (e) { console.error('Chat error:', e.message); res.status(500).json({ error: e.message }); }
});

// ─── ADMIN ────────────────────────────────────────────────────────────────────
router.get('/admin/users', adminAuth, async (req, res) => {
  const users = await User.find({}).select('-password').sort({ creado_at: -1 });
  res.json({ ok: true, users, total: users.length });
});

router.get('/admin/stats', adminAuth, async (req, res) => {
  const totalUsers = await User.countDocuments();
  const totalPlans = await WeekPlan.countDocuments();
  const totalProgress = await Progreso.countDocuments();
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const activosHoy = await Chat.countDocuments({ actualizado_at: { $gte: hoy } });
  res.json({ ok: true, totalUsers, totalPlans, totalProgress, activosHoy });
});

// Probar notificación manualmente (admin o cualquier usuario)
router.post('/notifications/test', auth, async (req, res) => {
  try {
    const { tipo = 'agua' } = req.body;
    const user = await User.findById(req.user.id);
    if (!user?.telefono) return res.status(400).json({ error: 'No tienes WhatsApp vinculado' });
    // Importar waClient desde app
    const { getWAClient } = require('../app');
    const waClient = getWAClient();
    if (!waClient) return res.status(503).json({ error: 'WhatsApp no está conectado' });
    const mensajes = {
      agua: `💧 *[PRUEBA] ¡Hora de hidratarse, ${user.nombre}!*

Esta es una notificación de prueba de agua. Si ves esto, ¡las notificaciones funcionan! ✅`,
      comida: `🍽️ *[PRUEBA] ¡Hora de comer, ${user.nombre}!*

Esta es una notificación de prueba de comida ✅`,
      pesaje: `⚖️ *[PRUEBA] ¡Día de pesaje, ${user.nombre}!*

Escríbeme tu peso: "mi peso es X kg" ✅`,
      foto: `📸 *[PRUEBA] ¡Foto de progreso, ${user.nombre}!*

🔒 Tus fotos son privadas. Esta es una prueba ✅`
    };
    const msg = mensajes[tipo] || mensajes.agua;
    await waClient.sendText(user.telefono + '@c.us', msg);
    res.json({ ok: true, mensaje: 'Notificación de prueba enviada a +' + user.telefono });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/admin/user/:id', adminAuth, async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  await WeekPlan.deleteMany({ usuario_id: req.params.id });
  await Progreso.deleteMany({ usuario_id: req.params.id });
  res.json({ ok: true });
});

module.exports = router;

// ─── FOTOS — borrar ───────────────────────────────────────────────────────────
router.delete('/photo/:id', auth, async (req, res) => {
  try {
    const foto = await Progreso.findOne({ _id: req.params.id, usuario_id: req.user.id, tipo: 'foto' });
    if (!foto) return res.status(404).json({ error: 'Foto no encontrada' });
    // Borrar archivo físico
    const filePath = '.' + foto.foto_path;
    if (require('fs').existsSync(filePath)) require('fs').unlinkSync(filePath);
    await Progreso.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PESO — editar y borrar ───────────────────────────────────────────────────
router.put('/weight/:index', auth, async (req, res) => {
  try {
    const { peso_kg, grasa_corporal_pct, notas } = req.body;
    const user = await User.findById(req.user.id);
    const idx = parseInt(req.params.index);
    if (!user.historial_peso[idx]) return res.status(404).json({ error: 'Registro no encontrado' });
    if (peso_kg) user.historial_peso[idx].peso_kg = peso_kg;
    if (grasa_corporal_pct !== undefined) user.historial_peso[idx].grasa_corporal_pct = grasa_corporal_pct;
    if (notas !== undefined) user.historial_peso[idx].notas = notas;
    await user.save();
    res.json({ ok: true, historial: user.historial_peso });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/weight/:index', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const idx = parseInt(req.params.index);
    if (!user.historial_peso[idx]) return res.status(404).json({ error: 'Registro no encontrado' });
    user.historial_peso.splice(idx, 1);
    await user.save();
    res.json({ ok: true, historial: user.historial_peso });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── NOTIFICACIONES ───────────────────────────────────────────────────────────
router.get('/notifications', auth, async (req, res) => {
  const user = await User.findById(req.user.id).select('preferencias');
  res.json({ ok: true, notificaciones: user.preferencias || {} });
});

router.put('/notifications', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user.preferencias) user.preferencias = {};
    // Actualizar solo campos de notificaciones
    const campos = ['recordatorios_activos', 'recordatorio_agua_horas', 'notif_agua', 'notif_comida', 'notif_pesaje', 'notif_foto', 'notif_agua_msg', 'notif_comida_msg', 'notif_pesaje_msg', 'notif_foto_msg', 'notif_hora_inicio', 'notif_hora_fin'];
    campos.forEach(c => { if (req.body[c] !== undefined) user.preferencias[c] = req.body[c]; });
    await user.save();
    res.json({ ok: true, notificaciones: user.preferencias });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
