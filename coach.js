// coach.js — Motor de IA MAX
require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_BASE = `# ROLE: MAX — AI ELITE FITNESS & NUTRITION COACH

Eres MAX, coach de fitness y nutrición de élite. Directo, técnico y motivador.
Respuestas CORTAS, Markdown, emojis. Operas por WhatsApp y Web.

## MÓDULO 1: CRISIS (MÁQUINA OCUPADA)
Si el equipo está ocupado → Jerarquía: Mancuernas → Poleas → Peso corporal

## MÓDULO 2: ENTRENADOR
- Rutinas: [Ejercicio] | [Series×Reps] | [RPE] | [Descanso]
- Usa récords del usuario para sugerir +2.5kg o +1 rep
- Si detectas reporte de peso ("hice X kg en Y"): incluye al FINAL: [REGISTRO: ejercicio=X, peso=N, reps=R, series=S]

## MÓDULO 3: NUTRICIÓN
- Ingredientes → Receta + macros obligatorios: Calorías, Proteínas(g), Carbos(g), Grasas(g)
- Alternativa si falta un alimento: equivalente calórico exacto

## MÓDULO 4: PLAN SEMANAL
- Usa el PLAN del contexto para responder sobre comidas/ejercicios del día
- Cuando el usuario pide cambiar algo del plan (comida, ejercicio, día completo), genera la alternativa Y agrega el tag de cambio al FINAL de tu respuesta

## MÓDULO 5: CAMBIOS AL PLAN (MUY IMPORTANTE)
Cuando el usuario pida cambiar algo del plan, incluye al FINAL de tu respuesta uno de estos tags:

Para cambiar una comida específica:
[CAMBIO_COMIDA: dia=NombreDia, indice=N, nombre=NombreComida, calorias=N, proteinas_g=N, carbohidratos_g=N, grasas_g=N, ingredientes=ing1|ing2|ing3, instrucciones=Texto instrucciones]

Para cambiar un ejercicio específico:
[CAMBIO_EJERCICIO: dia=NombreDia, indice=N, nombre=NombreEjercicio, series=N, reps=N-N, peso_kg=N, descanso_seg=N, notas=Texto]

Donde "dia" es el nombre exacto del día (Lunes, Martes, etc.) e "indice" es la posición (0=primero, 1=segundo, etc.)

Ejemplos de frases que disparan cambios:
- "cambia el desayuno del lunes" → CAMBIO_COMIDA día Lunes índice 0
- "reemplaza la sentadilla de hoy" → CAMBIO_EJERCICIO día actual índice correspondiente
- "pon otra cosa en lugar del almuerzo del miércoles" → CAMBIO_COMIDA Miércoles índice 1
- "no quiero press banca, ponme otro ejercicio" → CAMBIO_EJERCICIO con alternativa

IMPORTANTE: El índice corresponde a la posición en la lista del plan (0=primero, 1=segundo, 2=tercero).
Solo incluye el tag si el usuario explícitamente pide cambiar algo del plan. No lo incluyas en consultas generales.

## REGLAS:
1. Sin saludos largos. Ve al grano.
2. **Negritas** para ejercicios/macros. Emojis: 💪🥗⚡📈🔥✅
3. Si usuario NO registrado: pedir nombre + objetivo primero.

## DOLOR: Prohíbe ejercicio + variante de movilidad. "Seguridad primero."`;

function buildContext(user, weekPlan, recentProgress) {
  if (!user) return '\n## USUARIO: No registrado.\n';

  const records = user.records
    ? Object.entries(user.records).map(([k, v]) => `  - ${k}: ${v.peso_kg}kg × ${v.reps}reps × ${v.series}series`).join('\n')
    : '  Sin registros';

  let planResumen = '  Sin plan semanal activo.';
  if (weekPlan && weekPlan.dias?.length) {
    planResumen = weekPlan.dias.map(dia => {
      const comidas = dia.comidas?.map(c => `    🥗 ${c.nombre} (${c.calorias}kcal | P:${c.proteinas_g}g C:${c.carbohidratos_g}g G:${c.grasas_g}g)${c.completado ? ' ✅' : ''}`).join('\n') || '';
      const ejercicios = dia.ejercicios?.map(e => `    💪 ${e.nombre} ${e.series}×${e.reps}${e.peso_kg ? ' ' + e.peso_kg + 'kg' : ''}${e.completado ? ' ✅' : ''}`).join('\n') || '';
      return `  **${dia.dia}:**\n${comidas}\n${ejercicios}`;
    }).join('\n');
  }

  const progreso = recentProgress?.length
    ? recentProgress.slice(0, 5).map(p => `  - ${p.tipo}: ${p.ejercicio || p.comida || ''} ${p.peso_kg ? p.peso_kg + 'kg' : ''} (${p.fecha?.split('T')[0]})`).join('\n')
    : '  Sin registros recientes';

  return `
## PREFERENCIAS DEL USUARIO:
- Me gusta: ${user.preferencias?.me_gusta?.join(', ') || 'variado'}
- Evitar/alergias: ${user.preferencias?.no_me_gusta?.join(', ') || 'ninguno'}
- Restricciones: ${user.preferencias?.restricciones?.join(', ') || 'ninguna'}
- Horarios: Desayuno ${user.preferencias?.horarios?.desayuno || '07:00'} | Almuerzo ${user.preferencias?.horarios?.almuerzo || '13:00'} | Cena ${user.preferencias?.horarios?.cena || '20:00'}
- Notas: ${user.preferencias?.notas_libres || 'ninguna'}

## USUARIO: ${user.nombre}
- Objetivo: ${user.objetivo} | Nivel: ${user.nivel}
- Peso: ${user.peso_corporal_kg}kg | Altura: ${user.altura_cm}cm | Edad: ${user.edad} años
- Macros objetivo: ${user.dieta.calorias_objetivo}kcal | P:${user.dieta.proteinas_g}g C:${user.dieta.carbohidratos_g}g G:${user.dieta.grasas_g}g

## RÉCORDS:
${records}

## PLAN SEMANAL (${weekPlan?.semana_label || 'sin plan'}):
${planResumen}

## PROGRESO RECIENTE:
${progreso}
`;
}

function parseRegistro(text) {
  const m = text.match(/\[REGISTRO:\s*ejercicio=([^,]+),\s*peso=(\d+(?:\.\d+)?),\s*reps=(\d+),\s*series=(\d+)\]/i);
  if (!m) return null;
  return { ejercicio: m[1].trim(), peso: parseFloat(m[2]), reps: parseInt(m[3]), series: parseInt(m[4]) };
}

// Parsea cambio de comida del plan
function parseCambioComida(text) {
  const m = text.match(/\[CAMBIO_COMIDA:\s*dia=([^,]+),\s*indice=(\d+),\s*nombre=([^,]+),\s*calorias=(\d+),\s*proteinas_g=(\d+),\s*carbohidratos_g=(\d+),\s*grasas_g=(\d+),\s*ingredientes=([^,\]]+),\s*instrucciones=([^\]]+)\]/i);
  if (!m) return null;
  return {
    tipo: 'comida',
    dia: m[1].trim(),
    indice: parseInt(m[2]),
    datos: {
      nombre: m[3].trim(),
      calorias: parseInt(m[4]),
      proteinas_g: parseInt(m[5]),
      carbohidratos_g: parseInt(m[6]),
      grasas_g: parseInt(m[7]),
      ingredientes: m[8].trim().split('|').map(s => s.trim()),
      instrucciones: m[9].trim(),
      completado: false
    }
  };
}

// Parsea cambio de ejercicio del plan
function parseCambioEjercicio(text) {
  const m = text.match(/\[CAMBIO_EJERCICIO:\s*dia=([^,]+),\s*indice=(\d+),\s*nombre=([^,]+),\s*series=(\d+),\s*reps=([^,]+),\s*peso_kg=(\d+(?:\.\d+)?),\s*descanso_seg=(\d+),\s*notas=([^\]]*)\]/i);
  if (!m) return null;
  return {
    tipo: 'ejercicio',
    dia: m[1].trim(),
    indice: parseInt(m[2]),
    datos: {
      nombre: m[3].trim(),
      series: parseInt(m[4]),
      reps: m[5].trim(),
      peso_kg: parseFloat(m[6]),
      descanso_seg: parseInt(m[7]),
      notas: m[8].trim(),
      completado: false
    }
  };
}

// Parsea cualquier cambio al plan
function parseCambio(text) {
  return parseCambioComida(text) || parseCambioEjercicio(text) || null;
}

async function askCoach({ mensaje, user, weekPlan, recentProgress, historialMensajes = [] }) {
  const system = SYSTEM_BASE + '\n' + buildContext(user, weekPlan, recentProgress);
  const messages = [];
  historialMensajes.slice(-8).forEach(m => {
    messages.push({ role: m.rol === 'assistant' ? 'assistant' : 'user', content: m.contenido });
  });
  messages.push({ role: 'user', content: mensaje });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system,
    messages
  });

  const respuesta = response.content[0].text;
  const registro = parseRegistro(respuesta);
  const cambio = parseCambio(respuesta);
  // Clean all tags from visible response
  const respuestaLimpia = respuesta
    .replace(/\[REGISTRO:[^\]]+\]/gi, '')
    .replace(/\[CAMBIO_COMIDA:[^\]]+\]/gi, '')
    .replace(/\[CAMBIO_EJERCICIO:[^\]]+\]/gi, '')
    .trim();
  return { respuesta: respuestaLimpia, registro, cambio };
}

async function generarDias(user, dias, diasEntreno) {
  // Usar los días de entreno REALES del usuario, no los predefinidos
  const diasEntranoEfectivos = diasEntreno || ['Lunes', 'Miércoles', 'Viernes'];
  const entrenoStr = dias.filter(d => diasEntranoEfectivos.includes(d)).join(', ') || 'ninguno (todos descanso)';
  const descansoStr = dias.filter(d => !diasEntranoEfectivos.includes(d)).join(', ') || 'ninguno';

  const jsonExample = '{"dias":[{"dia":"Lunes","comidas":[{"nombre":"Desayuno: Avena","ingredientes":["100g avena","1 platano"],"instrucciones":"Mezclar y servir.","calorias":400,"proteinas_g":20,"carbohidratos_g":60,"grasas_g":8}],"ejercicios":[{"nombre":"Press Banca","series":4,"reps":"8-10","peso_kg":70,"descanso_seg":90,"notas":"Controlado"}]}]}';

  const prompt = [
    'Genera plan para SOLO estos dias: ' + dias.join(', '),
    'Usuario: ' + user.nombre + ' | Objetivo: ' + user.objetivo + ' | Nivel: ' + user.nivel + ' | Peso: ' + user.peso_corporal_kg + 'kg',
    'Calorias: ' + user.dieta.calorias_objetivo + 'kcal | P:' + user.dieta.proteinas_g + 'g C:' + user.dieta.carbohidratos_g + 'g G:' + user.dieta.grasas_g + 'g',
    'PREFERENCIAS - Incluir: ' + (user.preferencias?.me_gusta?.join(', ') || 'variado'),
    'PREFERENCIAS - EVITAR: ' + (user.preferencias?.no_me_gusta?.join(', ') || 'ninguno'),
    'Restricciones: ' + (user.preferencias?.restricciones?.join(', ') || 'ninguna'),
    'Notas: ' + (user.preferencias?.notas_libres || 'ninguna'),
    'Dias entrenamiento: ' + entrenoStr,
    'Dias descanso (ejercicios vacío): ' + descansoStr,
    '',
    'Responde SOLO JSON sin texto extra ni bloques markdown. Ejemplo:',
    jsonExample,
    '',
    'Reglas: 3 comidas por dia. 4-5 ejercicios dias entreno. Dias descanso: ejercicios=[].'
  ].join('\n');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 3000,
    messages: [{ role: 'user', content: prompt }]
  });

  let text = response.content[0].text.trim();
  // Remove code fences if present
  text = text.replace(/^[sS]*?({)/, '$1');
  const e = text.lastIndexOf('}');
  if (e === -1) throw new Error('JSON invalido de IA para dias: ' + dias.join(','));
  text = text.slice(0, e + 1);
  const parsed = JSON.parse(text);
  return parsed.dias || [];
}

async function generarPlanSemanal(user) {
  // Usar los días de entreno que el usuario configuró
  const diasEntreno = user.dias_entreno || ['Lunes', 'Miércoles', 'Viernes'];
  console.log('  Días de entreno del usuario:', diasEntreno.join(', '));

  const semana = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  // Generar en 2 tandas para no superar tokens
  const tanda1 = semana.slice(0, 4); // Lun-Jue
  const tanda2 = semana.slice(4);    // Vie-Dom

  console.log('  Generando Lun-Jue...');
  const dias1 = await generarDias(user, tanda1, diasEntreno);
  console.log('  Generando Vie-Dom...');
  const dias2 = await generarDias(user, tanda2, diasEntreno);
  const todos = [...dias1, ...dias2];
  if (!todos.length) throw new Error('No se generaron dias validos');
  console.log('  Plan completo: ' + todos.length + ' dias');
  return { dias: todos };
}


async function generarAlternativaEjercicio(user, ejercicio, contexto) {
  const p = user.preferencias || {};
  const prompt = 'Reemplaza este ejercicio con una alternativa diferente:\n' +
    'Actual: ' + ejercicio.nombre + ' | ' + ejercicio.series + 'x' + ejercicio.reps + (ejercicio.peso_kg ? ' | ' + ejercicio.peso_kg + 'kg' : '') + '\n' +
    'Objetivo: ' + user.objetivo + ' | Nivel: ' + user.nivel + '\n' +
    (contexto ? 'Razón: ' + contexto + '\n' : '') +
    'Responde SOLO JSON sin texto extra: {"nombre":"str","series":0,"reps":"str","peso_kg":0,"descanso_seg":90,"notas":"str","razon":"str"}';
  const r = await client.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 400, messages: [{ role: 'user', content: prompt }] });
  let t = r.content[0].text.trim().replace(/^[\s\S]*?({)/, '$1');
  return JSON.parse(t.slice(0, t.lastIndexOf('}') + 1));
}

async function generarAlternativaComida(user, comida, contexto) {
  const p = user.preferencias || {};
  const prompt = 'Reemplaza esta comida con una alternativa diferente:\n' +
    'Actual: ' + comida.nombre + ' | ' + comida.calorias + 'kcal P:' + comida.proteinas_g + 'g C:' + comida.carbohidratos_g + 'g G:' + comida.grasas_g + 'g\n' +
    'Objetivo usuario: ' + user.objetivo + '\n' +
    (contexto ? 'Razón: ' + contexto + '\n' : '') +
    'Me gusta: ' + (p.me_gusta?.join(', ') || 'variado') + '\n' +
    'NO me gusta/alergias: ' + (p.no_me_gusta?.join(', ') || 'ninguno') + '\n' +
    'Restricciones: ' + (p.restricciones?.join(', ') || 'ninguna') + '\n' +
    'Mantener macros similares (±15%). Responde SOLO JSON sin texto extra: {"nombre":"str","ingredientes":["str"],"instrucciones":"str","calorias":0,"proteinas_g":0,"carbohidratos_g":0,"grasas_g":0,"razon":"str"}';
  const r = await client.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 700, messages: [{ role: 'user', content: prompt }] });
  let t = r.content[0].text.trim().replace(/^[\s\S]*?({)/, '$1');
  return JSON.parse(t.slice(0, t.lastIndexOf('}') + 1));
}

async function generarAlternativaDia(user, dia, tipo) {
  const p = user.preferencias || {};
  const actuales = tipo === 'ejercicios'
    ? (dia.ejercicios?.map(e => e.nombre).join(', ') || 'ninguno')
    : (dia.comidas?.map(c => c.nombre).join(', ') || 'ninguno');
  const prompt = tipo === 'ejercicios'
    ? 'Genera rutina alternativa COMPLETA para ' + dia.dia + '. Ejercicios actuales a reemplazar: ' + actuales + '. Objetivo: ' + user.objetivo + ' | Nivel: ' + user.nivel + '. Genera ejercicios DIFERENTES. Responde SOLO JSON: {"ejercicios":[{"nombre":"str","series":0,"reps":"str","peso_kg":0,"descanso_seg":90,"notas":"str"}]}'
    : 'Genera comidas alternativas COMPLETAS para ' + dia.dia + '. Comidas actuales: ' + actuales + '. Cal: ' + user.dieta.calorias_objetivo + 'kcal. Me gusta: ' + (p.me_gusta?.join(', ') || 'variado') + '. Evitar: ' + (p.no_me_gusta?.join(', ') || 'ninguno') + '. Restricciones: ' + (p.restricciones?.join(', ') || 'ninguna') + '. Responde SOLO JSON: {"comidas":[{"nombre":"str","ingredientes":["str"],"instrucciones":"str","calorias":0,"proteinas_g":0,"carbohidratos_g":0,"grasas_g":0}]}';
  const r = await client.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] });
  let t = r.content[0].text.trim().replace(/^[\s\S]*?({)/, '$1');
  return JSON.parse(t.slice(0, t.lastIndexOf('}') + 1));
}

module.exports = { askCoach, generarPlanSemanal, parseRegistro, parseCambio, generarAlternativaEjercicio, generarAlternativaComida, generarAlternativaDia };