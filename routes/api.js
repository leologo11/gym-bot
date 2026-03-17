// routes/api.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { askCoach, generarPlanSemanal } = require('../coach');

const JWT_SECRET = process.env.JWT_SECRET || 'gym_secret_2026';

function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Token inválido' }); }
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
router.post('/auth/register', async (req, res) => {
  try {
    const { nombre, email, password } = req.body;
    if (!nombre || !email || !password) return res.status(400).json({ error: 'Nombre, email y password requeridos' });
    if (db.getUserByEmail(email)) return res.status(400).json({ error: 'Email ya registrado' });
    const hash = await bcrypt.hash(password, 10);
    const user = db.createUser({ nombre, email, password: hash });
    const token = jwt.sign({ id: user._id, nombre: user.nombre }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ ok: true, token, user: db.sanitizeUser(user) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = db.getUserByEmail(email);
    if (!user) return res.status(400).json({ error: 'Usuario no encontrado' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: 'Contraseña incorrecta' });
    const token = jwt.sign({ id: user._id, nombre: user.nombre }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ ok: true, token, user: db.sanitizeUser(user) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PERFIL ───────────────────────────────────────────────────────────────────
router.get('/profile', auth, (req, res) => {
  const user = db.getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json({ ok: true, user: db.sanitizeUser(user) });
});

router.put('/profile', auth, (req, res) => {
  try {
    const { nombre, objetivo, nivel, peso_corporal_kg, altura_cm, edad, dieta, dias_entreno, dieta_dias, telefono } = req.body;
    const changes = {};
    if (nombre) changes.nombre = nombre;
    if (objetivo) changes.objetivo = objetivo;
    if (nivel) changes.nivel = nivel;
    if (peso_corporal_kg) changes.peso_corporal_kg = peso_corporal_kg;
    if (altura_cm) changes.altura_cm = altura_cm;
    if (edad) changes.edad = edad;
    if (dieta) changes.dieta = dieta;
    if (dias_entreno) changes.dias_entreno = dias_entreno;
    if (dieta_dias) changes.dieta_dias = dieta_dias;
    if (telefono) changes.telefono = telefono;
    const user = db.updateUser(req.user.id, changes);
    res.json({ ok: true, user: db.sanitizeUser(user) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PLAN ─────────────────────────────────────────────────────────────────────
router.get('/plan/current', auth, (req, res) => {
  try {
    const plan = db.getPlanByUser(req.user.id);
    const hoy = new Date();
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
    lunes.setHours(0, 0, 0, 0);
    res.json({ ok: true, plan: plan || null, semana_inicio: lunes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/plan/generate', auth, async (req, res) => {
  try {
    const user = db.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    console.log(`⚡ Generando plan para ${user.nombre}...`);

    const planData = await generarPlanSemanal(user);
    if (!planData?.dias?.length) return res.status(500).json({ error: 'La IA no devolvió un plan válido. Intenta de nuevo.' });

    const hoy = new Date();
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
    lunes.setHours(0, 0, 0, 0);
    const domingo = new Date(lunes.getTime() + 6 * 864e5);
    const label = `${lunes.getDate()} ${lunes.toLocaleString('es-CL', { month: 'short' })} - ${domingo.getDate()} ${domingo.toLocaleString('es-CL', { month: 'short' })} ${domingo.getFullYear()}`;

    const plan = db.createPlan(req.user.id, planData.dias, label, lunes.toISOString());
    console.log(`✅ Plan generado para ${user.nombre}`);
    res.json({ ok: true, plan });
  } catch (e) {
    console.error('Error generando plan:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.patch('/plan/:planId/meal/:diaIndex/:mealIndex/complete', auth, (req, res) => {
  try {
    const plan = db.getPlanById(req.params.planId);
    if (!plan || plan.usuario_id !== req.user.id) return res.status(404).json({ error: 'Plan no encontrado' });
    const meal = plan.dias[+req.params.diaIndex]?.comidas[+req.params.mealIndex];
    if (!meal) return res.status(404).json({ error: 'Comida no encontrada' });
    meal.completado = !meal.completado;
    meal.completado_at = meal.completado ? new Date().toISOString() : null;
    db.updatePlan(req.params.planId, plan);
    if (meal.completado) {
      db.addProgress(req.user.id, { tipo: 'comida', comida: meal.nombre, calorias: meal.calorias, proteinas_g: meal.proteinas_g, carbohidratos_g: meal.carbohidratos_g, grasas_g: meal.grasas_g, canal: 'web' });
    }
    res.json({ ok: true, completado: meal.completado });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/plan/:planId/exercise/:diaIndex/:exIndex/complete', auth, (req, res) => {
  try {
    const { peso_real_kg } = req.body || {};
    const plan = db.getPlanById(req.params.planId);
    if (!plan || plan.usuario_id !== req.user.id) return res.status(404).json({ error: 'Plan no encontrado' });
    const ex = plan.dias[+req.params.diaIndex]?.ejercicios[+req.params.exIndex];
    if (!ex) return res.status(404).json({ error: 'Ejercicio no encontrado' });
    ex.completado = !ex.completado;
    ex.completado_at = ex.completado ? new Date().toISOString() : null;
    if (peso_real_kg) ex.peso_real_kg = peso_real_kg;
    db.updatePlan(req.params.planId, plan);
    if (ex.completado) {
      const pesoUsado = peso_real_kg || ex.peso_kg;
      db.addProgress(req.user.id, { tipo: 'ejercicio', ejercicio: ex.nombre, peso_kg: pesoUsado, reps: parseInt(ex.reps) || 0, series: ex.series, canal: 'web' });
      const user = db.getUserById(req.user.id);
      const recordActual = user.records?.[ex.nombre];
      if (!recordActual || pesoUsado > recordActual.peso_kg) {
        const newRecords = { ...(user.records || {}), [ex.nombre]: { peso_kg: pesoUsado, reps: parseInt(ex.reps) || 0, series: ex.series, fecha: new Date().toISOString() } };
        db.updateUser(req.user.id, { records: newRecords });
      }
    }
    res.json({ ok: true, completado: ex.completado });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PROGRESO ─────────────────────────────────────────────────────────────────
router.get('/progress', auth, (req, res) => {
  try {
    const { periodo = 'semana' } = req.query;
    const data = db.getProgressByUser(req.user.id, periodo);
    res.json({ ok: true, ...data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── CHAT ─────────────────────────────────────────────────────────────────────
router.post('/chat', auth, async (req, res) => {
  try {
    const { mensaje } = req.body;
    if (!mensaje) return res.status(400).json({ error: 'Mensaje requerido' });

    const user = db.getUserById(req.user.id);
    const weekPlan = db.getPlanByUser(req.user.id);
    const { registros: recentProgress } = db.getProgressByUser(req.user.id, 'semana');
    const chat = db.getChatByUser(req.user.id, 'web');
    const historialMensajes = chat.mensajes || [];

    const { respuesta, registro, cambio } = await askCoach({ mensaje, user, weekPlan, recentProgress, historialMensajes });

    // Guardar chat
    const nuevosMensajes = [...historialMensajes, { rol: 'user', contenido: mensaje }, { rol: 'assistant', contenido: respuesta }];
    db.saveChat(req.user.id, 'web', nuevosMensajes);

    // Guardar registro si detectó peso
    if (registro) {
      db.addProgress(req.user.id, { tipo: 'ejercicio', ejercicio: registro.ejercicio, peso_kg: registro.peso, reps: registro.reps, series: registro.series, canal: 'web' });
      const user2 = db.getUserById(req.user.id);
      const newRecords = { ...(user2.records || {}), [registro.ejercicio]: { peso_kg: registro.peso, reps: registro.reps, series: registro.series, fecha: new Date().toISOString() } };
      db.updateUser(req.user.id, { records: newRecords });
    }

    // Aplicar cambio al plan si MAX detectó uno
    let planActualizado = null;
    if (cambio && weekPlan) {
      planActualizado = aplicarCambioAlPlan(weekPlan, cambio);
      if (planActualizado) {
        db.updatePlan(weekPlan._id, planActualizado);
        console.log(`📝 Plan actualizado via chat: ${cambio.tipo} en ${cambio.dia} índice ${cambio.indice}`);
      }
    }

    res.json({ ok: true, respuesta, registro, cambio: cambio ? { tipo: cambio.tipo, dia: cambio.dia, indice: cambio.indice } : null, planActualizado: !!planActualizado });
  } catch (e) {
    console.error('Error chat:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Helper: aplica un cambio detectado por IA directamente al plan
function aplicarCambioAlPlan(plan, cambio) {
  try {
    const diaObj = plan.dias.find(d => d.dia.toLowerCase() === cambio.dia.toLowerCase());
    if (!diaObj) {
      console.log('Día no encontrado:', cambio.dia, '| Días disponibles:', plan.dias.map(d => d.dia));
      return null;
    }
    if (cambio.tipo === 'comida') {
      if (!diaObj.comidas || diaObj.comidas.length <= cambio.indice) return null;
      diaObj.comidas[cambio.indice] = { ...cambio.datos, completado: false };
    } else if (cambio.tipo === 'ejercicio') {
      if (!diaObj.ejercicios || diaObj.ejercicios.length <= cambio.indice) return null;
      diaObj.ejercicios[cambio.indice] = { ...cambio.datos, completado: false };
    }
    return plan;
  } catch (e) {
    console.error('Error aplicando cambio:', e.message);
    return null;
  }
}

module.exports = router;

// ─── PREFERENCIAS ─────────────────────────────────────────────────────────────
router.get('/preferences', auth, (req, res) => {
  const user = db.getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json({ ok: true, preferencias: user.preferencias || {} });
});

router.put('/preferences', auth, (req, res) => {
  try {
    const { me_gusta, no_me_gusta, restricciones, horarios, notas_libres } = req.body;
    const user = db.getUserById(req.user.id);
    const prefs = {
      me_gusta: me_gusta || user.preferencias?.me_gusta || [],
      no_me_gusta: no_me_gusta || user.preferencias?.no_me_gusta || [],
      restricciones: restricciones || user.preferencias?.restricciones || [],
      horarios: horarios || user.preferencias?.horarios || { desayuno: '07:00', almuerzo: '13:00', cena: '20:00' },
      notas_libres: notas_libres !== undefined ? notas_libres : (user.preferencias?.notas_libres || '')
    };
    const updated = db.updateUser(req.user.id, { preferencias: prefs });
    res.json({ ok: true, preferencias: updated.preferencias });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── ALTERNATIVAS ─────────────────────────────────────────────────────────────
const { generarAlternativaEjercicio, generarAlternativaComida, generarAlternativaDia } = require('../coach');

// Alternativa a un ejercicio individual
router.post('/plan/:planId/exercise/:diaIndex/:exIndex/alternativa', auth, async (req, res) => {
  try {
    const { contexto = '' } = req.body;
    const plan = db.getPlanById(req.params.planId);
    if (!plan || plan.usuario_id !== req.user.id) return res.status(404).json({ error: 'Plan no encontrado' });
    const ex = plan.dias[+req.params.diaIndex]?.ejercicios[+req.params.exIndex];
    if (!ex) return res.status(404).json({ error: 'Ejercicio no encontrado' });
    const user = db.getUserById(req.user.id);
    console.log(`⚡ Alternativa ejercicio: ${ex.nombre}`);
    const alternativa = await generarAlternativaEjercicio(user, ex, contexto);
    res.json({ ok: true, alternativa });
  } catch (e) { console.error(e.message); res.status(500).json({ error: e.message }); }
});

// Aplicar alternativa a ejercicio (reemplazar en el plan)
router.patch('/plan/:planId/exercise/:diaIndex/:exIndex/aplicar', auth, (req, res) => {
  try {
    const plan = db.getPlanById(req.params.planId);
    if (!plan || plan.usuario_id !== req.user.id) return res.status(404).json({ error: 'Plan no encontrado' });
    const { alternativa } = req.body;
    if (!alternativa) return res.status(400).json({ error: 'Alternativa requerida' });
    plan.dias[+req.params.diaIndex].ejercicios[+req.params.exIndex] = { ...alternativa, completado: false };
    db.updatePlan(req.params.planId, plan);
    res.json({ ok: true, plan });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Alternativa a una comida individual
router.post('/plan/:planId/meal/:diaIndex/:mealIndex/alternativa', auth, async (req, res) => {
  try {
    const { contexto = '' } = req.body;
    const plan = db.getPlanById(req.params.planId);
    if (!plan || plan.usuario_id !== req.user.id) return res.status(404).json({ error: 'Plan no encontrado' });
    const meal = plan.dias[+req.params.diaIndex]?.comidas[+req.params.mealIndex];
    if (!meal) return res.status(404).json({ error: 'Comida no encontrada' });
    const user = db.getUserById(req.user.id);
    console.log(`⚡ Alternativa comida: ${meal.nombre}`);
    const alternativa = await generarAlternativaComida(user, meal, contexto);
    res.json({ ok: true, alternativa });
  } catch (e) { console.error(e.message); res.status(500).json({ error: e.message }); }
});

// Aplicar alternativa a comida
router.patch('/plan/:planId/meal/:diaIndex/:mealIndex/aplicar', auth, (req, res) => {
  try {
    const plan = db.getPlanById(req.params.planId);
    if (!plan || plan.usuario_id !== req.user.id) return res.status(404).json({ error: 'Plan no encontrado' });
    const { alternativa } = req.body;
    if (!alternativa) return res.status(400).json({ error: 'Alternativa requerida' });
    plan.dias[+req.params.diaIndex].comidas[+req.params.mealIndex] = { ...alternativa, completado: false };
    db.updatePlan(req.params.planId, plan);
    res.json({ ok: true, plan });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Alternativa día completo (ejercicios o comidas)
router.post('/plan/:planId/day/:diaIndex/alternativa', auth, async (req, res) => {
  try {
    const { tipo = 'ejercicios', contexto = '' } = req.body;
    const plan = db.getPlanById(req.params.planId);
    if (!plan || plan.usuario_id !== req.user.id) return res.status(404).json({ error: 'Plan no encontrado' });
    const dia = plan.dias[+req.params.diaIndex];
    if (!dia) return res.status(404).json({ error: 'Día no encontrado' });
    const user = db.getUserById(req.user.id);
    console.log(`⚡ Alternativa día ${dia.dia} (${tipo})`);
    const alternativa = await generarAlternativaDia(user, dia, tipo);
    res.json({ ok: true, alternativa, tipo });
  } catch (e) { console.error(e.message); res.status(500).json({ error: e.message }); }
});

// Aplicar alternativa día completo
router.patch('/plan/:planId/day/:diaIndex/aplicar', auth, (req, res) => {
  try {
    const plan = db.getPlanById(req.params.planId);
    if (!plan || plan.usuario_id !== req.user.id) return res.status(404).json({ error: 'Plan no encontrado' });
    const { tipo, alternativa } = req.body;
    if (tipo === 'ejercicios' && alternativa.ejercicios) {
      plan.dias[+req.params.diaIndex].ejercicios = alternativa.ejercicios.map(e => ({ ...e, completado: false }));
    } else if (tipo === 'comidas' && alternativa.comidas) {
      plan.dias[+req.params.diaIndex].comidas = alternativa.comidas.map(c => ({ ...c, completado: false }));
    }
    db.updatePlan(req.params.planId, plan);
    res.json({ ok: true, plan });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── VINCULAR WHATSAPP ────────────────────────────────────────────────────────
// Verificar si un número ya está vinculado
router.get('/whatsapp/status', auth, (req, res) => {
  const user = db.getUserById(req.user.id);
  res.json({
    ok: true,
    vinculado: !!user.telefono,
    telefono: user.telefono || null
  });
});
