// db.js — Base de datos JSON pura. Sin MongoDB, sin configuración.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PLANS_FILE = path.join(DATA_DIR, 'plans.json');
const PROGRESS_FILE = path.join(DATA_DIR, 'progress.json');
const CHATS_FILE = path.join(DATA_DIR, 'chats.json');

// Inicializar archivos si no existen
function initDB() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '{}');
  if (!fs.existsSync(PLANS_FILE)) fs.writeFileSync(PLANS_FILE, '{}');
  if (!fs.existsSync(PROGRESS_FILE)) fs.writeFileSync(PROGRESS_FILE, '{}');
  if (!fs.existsSync(CHATS_FILE)) fs.writeFileSync(CHATS_FILE, '{}');
}

function read(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return {}; }
}

function write(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ─── USERS ───────────────────────────────────────────────────────────────────
function getUsers() { return read(USERS_FILE); }

function getUserById(id) {
  return getUsers()[id] || null;
}

function getUserByEmail(email) {
  const users = getUsers();
  return Object.values(users).find(u => u.email === email) || null;
}

function getUserByPhone(phone) {
  const users = getUsers();
  return Object.values(users).find(u => u.telefono === phone) || null;
}

function getUserByPhoneFlexible(phone) {
  if (!phone) return null;
  const users = getUsers();
  const all = Object.values(users).filter(u => u.telefono);
  // 1. Exact match
  let found = all.find(u => u.telefono === phone);
  if (found) return found;
  // 2. Compare last N digits (8, 9, 10) — handles country code differences
  for (const digits of [10, 9, 8]) {
    const suffix = phone.slice(-digits);
    found = all.find(u => u.telefono.slice(-digits) === suffix);
    if (found) return found;
  }
  return null;
}

function createUser(data) {
  const users = getUsers();
  const id = genId();
  const user = {
    _id: id,
    nombre: data.nombre || 'Usuario',
    email: data.email || null,
    password: data.password || null,
    telefono: data.telefono || null,
    objetivo: data.objetivo || 'General',
    nivel: data.nivel || 'Principiante',
    peso_corporal_kg: data.peso_corporal_kg || 70,
    altura_cm: data.altura_cm || 170,
    edad: data.edad || 25,
    dieta: data.dieta || { calorias_objetivo: 0, proteinas_g: 0, carbohidratos_g: 0, grasas_g: 0 },
    preferencias: data.preferencias || {
      me_gusta: [],
      no_me_gusta: [],
      restricciones: [],
      horarios: { desayuno: '07:00', almuerzo: '13:00', cena: '20:00' },
      notas_libres: ''
    },
    dias_entreno: data.dias_entreno || ['Lunes','Miércoles','Viernes'],
    dieta_dias: data.dieta_dias || 'todos',
    records: {},
    registrado_via: data.registrado_via || 'web',
    creado_at: new Date().toISOString()
  };
  users[id] = user;
  write(USERS_FILE, users);
  return user;
}

function updateUser(id, changes) {
  const users = getUsers();
  if (!users[id]) return null;
  users[id] = { ...users[id], ...changes };
  if (changes.dieta) users[id].dieta = { ...users[id].dieta, ...changes.dieta };
  write(USERS_FILE, users);
  return users[id];
}

function sanitizeUser(u) {
  const copy = { ...u };
  delete copy.password;
  return copy;
}

// ─── PLANS ───────────────────────────────────────────────────────────────────
function getPlans() { return read(PLANS_FILE); }

function getPlanByUser(userId) {
  const plans = getPlans();
  // Lunes de esta semana
  const hoy = new Date();
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
  lunes.setHours(0, 0, 0, 0);

  return Object.values(plans).find(p =>
    p.usuario_id === userId &&
    new Date(p.semana_inicio) >= lunes
  ) || null;
}

function createPlan(userId, dias, label, semanainicio) {
  const plans = getPlans();
  // Eliminar plan anterior de esta semana
  Object.keys(plans).forEach(k => {
    if (plans[k].usuario_id === userId && new Date(plans[k].semana_inicio) >= new Date(semanainicio)) {
      delete plans[k];
    }
  });
  const id = genId();
  const plan = {
    _id: id,
    usuario_id: userId,
    semana_inicio: semanainicio,
    semana_label: label,
    dias,
    generado_por_ia: true,
    creado_at: new Date().toISOString(),
    actualizado_at: new Date().toISOString()
  };
  plans[id] = plan;
  write(PLANS_FILE, plans);
  return plan;
}

function updatePlan(planId, plan) {
  const plans = getPlans();
  plan.actualizado_at = new Date().toISOString();
  plans[planId] = plan;
  write(PLANS_FILE, plans);
  return plan;
}

function getPlanById(planId) {
  return getPlans()[planId] || null;
}

// ─── PROGRESS ────────────────────────────────────────────────────────────────
function getProgress() { return read(PROGRESS_FILE); }

function addProgress(userId, entry) {
  const all = getProgress();
  if (!all[userId]) all[userId] = [];
  all[userId].unshift({ ...entry, _id: genId(), fecha: new Date().toISOString() });
  all[userId] = all[userId].slice(0, 200); // max 200 registros
  write(PROGRESS_FILE, all);
}

function getProgressByUser(userId, periodo = 'semana') {
  const all = getProgress();
  const entries = all[userId] || [];
  const ahora = new Date();
  let desde = new Date();
  if (periodo === 'semana') desde.setDate(ahora.getDate() - 7);
  else if (periodo === 'mes') desde.setMonth(ahora.getMonth() - 1);
  else if (periodo === 'año') desde.setFullYear(ahora.getFullYear() - 1);

  const filtered = entries.filter(e => new Date(e.fecha) >= desde);

  // Agrupar por día
  const porDia = {};
  filtered.forEach(r => {
    const dia = r.fecha.split('T')[0];
    if (!porDia[dia]) porDia[dia] = { ejercicios: 0, comidas: 0, calorias: 0, proteinas: 0 };
    if (r.tipo === 'ejercicio') porDia[dia].ejercicios++;
    if (r.tipo === 'comida') { porDia[dia].comidas++; porDia[dia].calorias += r.calorias || 0; porDia[dia].proteinas += r.proteinas_g || 0; }
  });

  return { registros: filtered, porDia };
}

// ─── CHATS ───────────────────────────────────────────────────────────────────
function getChats() { return read(CHATS_FILE); }

function getChatByUser(userId, canal = 'web') {
  const chats = getChats();
  const key = `${userId}_${canal}`;
  return chats[key] || { mensajes: [] };
}

function saveChat(userId, canal, mensajes) {
  const chats = getChats();
  const key = `${userId}_${canal}`;
  chats[key] = { mensajes: mensajes.slice(-50), actualizado_at: new Date().toISOString() };
  write(CHATS_FILE, chats);
}

// Estado temporal para onboarding de WhatsApp
const waPending = new Map();

module.exports = {
  initDB, genId,
  getUserById, getUserByEmail, getUserByPhone, getUserByPhoneFlexible, createUser, updateUser, sanitizeUser,
  getPlanByUser, createPlan, updatePlan, getPlanById,
  addProgress, getProgressByUser,
  getChatByUser, saveChat,
  waPending
};
