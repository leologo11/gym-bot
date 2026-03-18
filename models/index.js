// models/index.js — Modelos MongoDB v4
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  email: { type: String, unique: true, sparse: true },
  password: String,
  telefono: { type: String, unique: true, sparse: true },
  es_admin: { type: Boolean, default: false },
  objetivo: { type: String, default: 'General' },
  nivel: { type: String, default: 'Principiante' },
  peso_corporal_kg: { type: Number, default: 70 },
  altura_cm: { type: Number, default: 170 },
  edad: { type: Number, default: 25 },
  sexo: { type: String, default: 'm' },
  nacionalidad: { type: String, default: 'Chile' },
  pais_residencia: { type: String, default: 'Chile' },
  dieta: {
    calorias_objetivo: { type: Number, default: 0 },
    proteinas_g: { type: Number, default: 0 },
    carbohidratos_g: { type: Number, default: 0 },
    grasas_g: { type: Number, default: 0 }
  },
  dias_entreno: [String],
  hora_gym: { type: String, default: '' },  // ej: '18:00'
  dieta_dias: { type: String, default: 'todos' },
  preferencias: {
    me_gusta: [String],
    no_me_gusta: [String],
    restricciones: [String],
    horarios: {
      desayuno: { type: String, default: '07:00' },
      almuerzo: { type: String, default: '13:00' },
      cena: { type: String, default: '20:00' }
    },
    notas_libres: String,
    recordatorio_agua_horas: { type: Number, default: 2 },
    recordatorios_activos: { type: Boolean, default: false }
  },
  records: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
  historial_peso: [{
    peso_kg: Number,
    grasa_corporal_pct: Number,
    fecha: { type: Date, default: Date.now },
    notas: String
  }],
  registrado_via: { type: String, default: 'web' },
  creado_at: { type: Date, default: Date.now },
  ultimo_acceso: { type: Date, default: Date.now }
});

const EjercicioSchema = new mongoose.Schema({
  nombre: String,
  descripcion: String,
  grupo_muscular: String,
  nivel_dificultad: String,
  series: Number,
  reps: String,
  peso_kg: Number,
  descanso_seg: Number,
  notas: String,
  tips: String,
  completado: { type: Boolean, default: false },
  completado_at: Date,
  peso_real_kg: Number,
  reps_reales: String,
  sensacion: String
});

const ComidaSchema = new mongoose.Schema({
  nombre: String,
  tipo: String,
  ingredientes: [{
    nombre: String,
    cantidad: String,
    unidad: String
  }],
  instrucciones: String,
  condimentos: [String],
  tiempo_preparacion_min: Number,
  calorias: Number,
  proteinas_g: Number,
  carbohidratos_g: Number,
  grasas_g: Number,
  sodio_mg: Number,
  azucar_g: Number,
  fibra_g: Number,
  completado: { type: Boolean, default: false },
  completado_at: Date
});

const DiaSchema = new mongoose.Schema({
  dia: String,
  es_descanso: { type: Boolean, default: false },
  comidas: [ComidaSchema],
  ejercicios: [EjercicioSchema],
  notas: String
});

const WeekPlanSchema = new mongoose.Schema({
  usuario_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  semana_inicio: Date,
  semana_label: String,
  dias: [DiaSchema],
  generado_por_ia: { type: Boolean, default: false },
  creado_at: { type: Date, default: Date.now },
  actualizado_at: { type: Date, default: Date.now }
});

const SesionEjercicioSchema = new mongoose.Schema({
  ejercicio: String,
  grupo_muscular: String,
  series_realizadas: Number,
  reps_realizadas: String,
  peso_kg: Number,
  peso_anterior_kg: Number,
  mejora_pct: Number,
  sensacion: String,
  fecha: { type: Date, default: Date.now }
});

const SemanaHistorialSchema = new mongoose.Schema({
  usuario_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  semana_inicio: Date,
  semana_label: String,
  ejercicios: [SesionEjercicioSchema],
  peso_corporal_inicio: Number,
  peso_corporal_fin: Number,
  calorias_promedio: Number,
  dias_entrenados: Number,
  dias_dieta_cumplida: Number,
  notas: String,
  recomendaciones_ia: String,
  creado_at: { type: Date, default: Date.now }
});

const ProgresoSchema = new mongoose.Schema({
  usuario_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tipo: { type: String, enum: ['ejercicio', 'comida', 'peso_corporal', 'foto'] },
  fecha: { type: Date, default: Date.now },
  ejercicio: String,
  peso_kg: Number,
  reps: Number,
  series: Number,
  comida: String,
  calorias: Number,
  proteinas_g: Number,
  carbohidratos_g: Number,
  grasas_g: Number,
  peso_corporal_kg: Number,
  grasa_corporal_pct: Number,
  foto_path: String,
  foto_descripcion: String,
  canal: { type: String, default: 'web' }
});

const ChatSchema = new mongoose.Schema({
  usuario_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  telefono: String,
  canal: { type: String, default: 'web' },
  mensajes: [{
    rol: { type: String, enum: ['user', 'assistant'] },
    contenido: String,
    fecha: { type: Date, default: Date.now }
  }],
  creado_at: { type: Date, default: Date.now },
  actualizado_at: { type: Date, default: Date.now }
});

module.exports = {
  User: mongoose.model('User', UserSchema),
  WeekPlan: mongoose.model('WeekPlan', WeekPlanSchema),
  SemanaHistorial: mongoose.model('SemanaHistorial', SemanaHistorialSchema),
  Progreso: mongoose.model('Progreso', ProgresoSchema),
  Chat: mongoose.model('Chat', ChatSchema)
};
