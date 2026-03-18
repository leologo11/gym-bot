// coach.js v4
require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_BASE = `# ROLE: MAX — AI ELITE FITNESS & NUTRITION COACH v4

Eres MAX, coach de fitness y nutrición de élite. Directo, técnico, motivador.
Respuestas cortas en Markdown con emojis.

## EJERCICIOS DETALLADOS
Cada ejercicio incluye:
- Nombre específico (ej: "Press de banca con barra, agarre medio, 4x8-10")
- Descripción paso a paso de ejecución
- Grupo muscular principal y secundario
- Tips técnicos para evitar lesiones
- Adaptación por nivel: Principiante/Intermedio/Avanzado

## CRISIS GYM: Mancuernas → Poleas → Peso corporal → Bandas

## NUTRICIÓN DETALLADA
- Cantidades exactas (g, ml, cdas, cditas)
- Condimentos específicos (sal, pimienta, comino, orégano, etc.)
- Incluir: sodio_mg, azucar_g, fibra_g, tiempo_preparacion
- Adaptar recetas a la NACIONALIDAD del usuario PERO con variedad

## BANCO DE RECETAS FITNESS (usa estas como inspiración, adapta macros)

### DESAYUNOS FIT
- Arepa de avena proteica (70g avena+1huevo+clara, rellena de pollo desmenuzado o requesón)
- Tostadas integrales con aguacate + 2 huevos pochados + tomate
- Bowl de avena (80g avena, leche, plátano, miel, nueces, canela)
- Pancakes proteicos (2 huevos + 1 banana + 30g proteína en polvo)
- Perico venezolano fit (3 claras+1 huevo, tomate, cebolla, ají dulce, sal)
- Yogur griego con granola casera y frutas rojas
- Batido proteico: leche de avena + plátano + mantequilla de maní + proteína
- Cachapa fit (maíz tierno + claras + queso blanco bajo en grasa)

### ALMUERZOS FIT
- Pabellón fit (150g carne mechada magra + 60g caraotas negras cocidas + 80g arroz integral + tajadas asadas)
- Pollo guisado criollo (pechuga, ají, tomate, cebolla, comino, orégano) + quinoa + ensalada
- Cazuela de pollo chilena fit (pechuga, zapallo, papa, choclo, zanahoria, caldo bajo sodio)
- Arroz integral con atún, aguacate y vegetales salteados
- Wrap integral de pollo a la plancha + lechuga + tomate + mostaza
- Lentejas estofadas con pollo y vegetales
- Salmón al horno con batata y brócoli al vapor
- Pechuga de pavo en salsa de tomate natural + pasta integral

### CENAS FIT
- Tortilla española fit (3 claras+1 yema, papa cocida, cebolla)
- Sopa de pollo con vegetales y fideos integrales
- Bowl de quinoa + vegetales asados + hummus + huevo duro
- Ensalada completa: lechuga, pollo, garbanzos, queso, aceite de oliva
- Atún con ensalada verde y tostadas integrales
- Berenjenas rellenas de carne magra y queso
- Crema de zapallo con pan integral
- Revuelto de claras con espinaca, champiñones y queso bajo en grasa

### SNACKS FIT
- Manzana + 2 cdas mantequilla de maní
- Yogur griego con miel y almendras
- 1 arepa pequeña de maíz + queso blanco
- Hummus con palitos de zanahoria y pepino
- 30g nueces mixtas + 1 fruta
- Batido post-entreno (proteína + leche + banana)

## REGLAS DE ADAPTACIÓN CULTURAL:
- Venezolano/colombiano: incorporar ingredientes como arepa, caraotas, plátano, queso blanco, ají dulce, papelón, guayaba — pero NO en todas las comidas
- Chileno: cazuela, porotos, choclo, papas, merkén, pebre — variar
- Mexicano: frijoles, aguacate, chile, tortilla integral — variar
- BALANCE: 40% recetas culturales, 60% recetas internacionales fit (bowl, wrap, ensalada, pasta integral)
- NUNCA repetir la misma receta en la misma semana
- Priorizar ingredientes accesibles y económicos del país donde RESIDE el usuario

## CAMBIOS AL PLAN (tags al FINAL):
[CAMBIO_COMIDA: dia=NombreDelDia, indice=N, tipo=desayuno, nombre=X, calorias=N, proteinas_g=N, carbohidratos_g=N, grasas_g=N, ingredientes=a|b|c, instrucciones=X]
Donde tipo debe ser exactamente: desayuno, almuerzo, cena o snack según la comida que se reemplaza.
[CAMBIO_EJERCICIO: dia=NombreDelDia, indice=N, nombre=X, series=N, reps=X, peso_kg=N, descanso_seg=N, notas=X]

CRÍTICO: En "dia=" SIEMPRE usa el nombre completo del día en español con acento:
Lunes, Martes, Miércoles, Jueves, Viernes, Sábado, Domingo
NUNCA uses números (1,2,3) ni abreviaciones. SIEMPRE el nombre completo.
[CAMBIO_PERFIL: campo=X, valor=X]
[REGISTRO: ejercicio=X, peso=N, reps=N, series=N]

## PERFIL VIA WHATSAPP
Si el usuario dice "mi peso es X kg", "bajé a X", "mi grasa es X%":
incluye [CAMBIO_PERFIL: campo=peso_corporal_kg, valor=X]
Campos: peso_corporal_kg, grasa_corporal_pct, objetivo, nivel

## REGLAS:
1. Sin saludos largos. Ve al grano.
2. Emojis: 💪🥗⚡📈🔥✅💧⏰
3. Recetas adaptadas a cultura/nacionalidad del usuario
4. Ejercicios con descripción clara para todos los niveles
5. Al analizar progreso: comparar con semana anterior y recomendar ajustes

## DOLOR: prohíbe ejercicio + variante de movilidad sin impacto.`;

function buildContext(user, weekPlan, recentProgress, semanaHistorial) {
  if (!user) return '\n## USUARIO: No registrado.\n';

  // Fecha y hora actual Chile
  const ahora = new Date();
  const diasSem = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const mesesArr = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const fechaHoy = diasSem[ahora.getDay()] + ' ' + ahora.getDate() + ' de ' + mesesArr[ahora.getMonth()] + ' de ' + ahora.getFullYear();
  const horaActual = ahora.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });

  const records = user.records
    ? [...user.records.entries()].map(([k, v]) => `  - ${k}: ${v.peso_kg}kg x${v.reps} (${new Date(v.fecha).toLocaleDateString('es-CL')})`).join('\n')
    : '  Sin registros';

  const histPeso = user.historial_peso?.slice(-3).map(h =>
    `  - ${new Date(h.fecha).toLocaleDateString('es-CL')}: ${h.peso_kg}kg${h.grasa_corporal_pct ? ' | grasa: ' + h.grasa_corporal_pct + '%' : ''}`
  ).join('\n') || '  Sin historial de peso';

  let planResumen = '  Sin plan.';
  if (weekPlan?.dias?.length) {
    planResumen = weekPlan.dias.map(dia => {
      const c = dia.comidas?.map(m => `    🥗 ${m.nombre} ${m.calorias}kcal${m.completado ? ' ✅' : ''}`).join('\n') || '';
      const e = dia.ejercicios?.map(x => `    💪 ${x.nombre} ${x.series}x${x.reps}${x.peso_kg ? ' '+x.peso_kg+'kg' : ''}${x.completado ? ' ✅' : ''}${x.peso_real_kg ? ' (real:'+x.peso_real_kg+'kg)' : ''}`).join('\n') || '';
      return `  **${dia.dia}${dia.es_descanso ? ' 😴' : ''}:**\n${c}\n${e}`;
    }).join('\n');
  }

  let analisis = '  Sin historial semanal previo.';
  if (semanaHistorial) {
    analisis = `  Semana ${semanaHistorial.semana_label}: ${semanaHistorial.dias_entrenados || 0} días entrenados\n` +
      (semanaHistorial.ejercicios?.slice(0, 5).map(e =>
        `  - ${e.ejercicio}: ${e.peso_kg}kg x${e.reps_realizadas} (${e.sensacion || 'normal'})`).join('\n') || '');
  }

  const p = user.preferencias || {};
  return `
## FECHA Y HORA ACTUAL (Santiago, Chile):
- Hoy es: ${fechaHoy}
- Hora actual: ${horaActual}
- Responde siempre considerando este día y horario

## USUARIO: ${user.nombre}
- Objetivo: ${user.objetivo} | Nivel: ${user.nivel}
- Peso: ${user.peso_corporal_kg}kg | Altura: ${user.altura_cm}cm | Edad: ${user.edad}
- Nacionalidad: ${user.nacionalidad} | Reside en: ${user.pais_residencia}
- Macros: ${user.dieta.calorias_objetivo}kcal P:${user.dieta.proteinas_g}g C:${user.dieta.carbohidratos_g}g G:${user.dieta.grasas_g}g
- Hora de gym: ${user.hora_gym || 'no especificada'}
- Días de entreno: ${user.dias_entreno?.join(', ') || 'no especificados'}
- Me gusta: ${p.me_gusta?.join(', ') || 'variado'} | Evitar: ${p.no_me_gusta?.join(', ') || 'ninguno'}
- Restricciones: ${p.restricciones?.join(', ') || 'ninguna'}
- Notas: ${p.notas_libres || 'ninguna'}

## RÉCORDS: ${records}
## HISTORIAL PESO: ${histPeso}
## SEMANA ANTERIOR: ${analisis}
## PLAN ACTUAL (${weekPlan?.semana_label || 'sin plan'}):
${planResumen}`;
}

function parseTag(text, tag) {
  const rx = new RegExp('\\[' + tag + ':([^\\]]+)\\]', 'i');
  const m = text.match(rx);
  return m ? m[1].trim() : null;
}

function parseRegistro(text) {
  const raw = parseTag(text, 'REGISTRO');
  if (!raw) return null;
  const get = (k) => { const m = raw.match(new RegExp(k + '=([^,\\]]+)')); return m ? m[1].trim() : null; };
  return { ejercicio: get('ejercicio'), peso: parseFloat(get('peso')), reps: parseInt(get('reps')), series: parseInt(get('series')) };
}

function parseCambioComida(text) {
  const raw = parseTag(text, 'CAMBIO_COMIDA');
  if (!raw) return null;
  const get = (k) => { const m = raw.match(new RegExp(k + '=([^,]+)')); return m ? m[1].trim() : ''; };
  return {
    tipo: 'comida', dia: get('dia'), indice: parseInt(get('indice')),
    datos: { tipo: get('tipo') || 'desayuno', nombre: get('nombre'), calorias: parseInt(get('calorias')), proteinas_g: parseInt(get('proteinas_g')),
      carbohidratos_g: parseInt(get('carbohidratos_g')), grasas_g: parseInt(get('grasas_g')),
      ingredientes: raw.match(/ingredientes=([^,]+)/)?.[1]?.split('|').map(s => ({ nombre: s.trim(), cantidad: '', unidad: '' })) || [],
      instrucciones: raw.match(/instrucciones=(.+)$/)?.[1]?.trim() || '', completado: false }
  };
}

function parseCambioEjercicio(text) {
  const raw = parseTag(text, 'CAMBIO_EJERCICIO');
  if (!raw) return null;
  const get = (k) => { const m = raw.match(new RegExp(k + '=([^,]+)')); return m ? m[1].trim() : ''; };
  return {
    tipo: 'ejercicio', dia: get('dia'), indice: parseInt(get('indice')),
    datos: { nombre: get('nombre'), series: parseInt(get('series')), reps: get('reps'),
      peso_kg: parseFloat(get('peso_kg')), descanso_seg: parseInt(get('descanso_seg')),
      notas: raw.match(/notas=(.+)$/)?.[1]?.trim() || '', completado: false }
  };
}

function parseCambioPerfil(text) {
  const raw = parseTag(text, 'CAMBIO_PERFIL');
  if (!raw) return null;
  const get = (k) => { const m = raw.match(new RegExp(k + '=([^,\\]]+)')); return m ? m[1].trim() : null; };
  return { campo: get('campo'), valor: get('valor') };
}

function parseCambio(text) { return parseCambioComida(text) || parseCambioEjercicio(text) || null; }

async function askCoach({ mensaje, user, weekPlan, recentProgress, historialMensajes = [], semanaHistorial = null }) {
  const system = SYSTEM_BASE + '\n' + buildContext(user, weekPlan, recentProgress, semanaHistorial);
  const messages = historialMensajes.slice(-8).map(m => ({ role: m.rol === 'assistant' ? 'assistant' : 'user', content: m.contenido }));
  messages.push({ role: 'user', content: mensaje });
  const response = await client.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 1500, system, messages });
  const respuesta = response.content[0].text;
  const registro = parseRegistro(respuesta);
  const cambio = parseCambio(respuesta);
  const cambioPerfil = parseCambioPerfil(respuesta);
  const respuestaLimpia = respuesta.replace(/\[REGISTRO:[^\]]+\]/gi,'').replace(/\[CAMBIO_COMIDA:[^\]]+\]/gi,'').replace(/\[CAMBIO_EJERCICIO:[^\]]+\]/gi,'').replace(/\[CAMBIO_PERFIL:[^\]]+\]/gi,'').trim();
  return { respuesta: respuestaLimpia, registro, cambio, cambioPerfil };
}

const CULTURA = {
  'Venezuela': 'arepas, caraotas negras, plátano maduro, queso blanco, pollo guisado, pabellón criollo',
  'Colombia': 'bandeja paisa, sancocho, papa criolla, empanadas, arepas',
  'Chile': 'cazuela, porotos, sopaipillas, charquicán, empanadas, congrio',
  'México': 'frijoles, tortillas, aguacate, chile, nopal, salsa verde',
  'Perú': 'quinoa, papa, ají amarillo, ceviche, lomo saltado',
  'Argentina': 'asado, milanesa, locro, empanadas, mate',
  'España': 'tortilla española, paella, gazpacho, garbanzos, jamón'
};

// Genera UN solo día — más rápido y sin riesgo de JSON truncado
async function generarUnDia(user, dia, esEntreno) {
  const p = user.preferencias || {};
  const cultura = CULTURA[user.nacionalidad] || 'ingredientes locales variados';

  const prompt = `Genera plan para SOLO el día ${dia} (${esEntreno ? 'ENTRENAMIENTO' : 'DESCANSO'}).
Usuario: ${user.nombre} | ${user.objetivo} | ${user.nivel} | ${user.peso_corporal_kg}kg
Cal: ${user.dieta.calorias_objetivo}kcal P:${user.dieta.proteinas_g}g C:${user.dieta.carbohidratos_g}g G:${user.dieta.grasas_g}g
Nac: ${user.nacionalidad} (usar: ${cultura})
Evitar: ${p.no_me_gusta?.join(', ')||'ninguno'} | Restricciones: ${p.restricciones?.join(', ')||'ninguna'}
${esEntreno ? '4-5 ejercicios con descripcion y tips' : 'ejercicios=[] (día descanso)'}
3 comidas con ingredientes exactos y macros.

JSON COMPACTO sin texto extra:
{"dia":"${dia}","es_descanso":${!esEntreno},"comidas":[{"nombre":"str","tipo":"desayuno","ingredientes":[{"nombre":"str","cantidad":"str","unidad":"str"}],"instrucciones":"str","condimentos":["str"],"tiempo_preparacion_min":10,"calorias":0,"proteinas_g":0,"carbohidratos_g":0,"grasas_g":0,"sodio_mg":0,"azucar_g":0,"fibra_g":0}],"ejercicios":[{"nombre":"str","descripcion":"str","grupo_muscular":"str","nivel_dificultad":"str","series":0,"reps":"str","peso_kg":0,"descanso_seg":90,"notas":"str","tips":"str"}]}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2500,
    messages: [{ role: 'user', content: prompt }]
  });
  let text = response.content[0].text.trim().replace(/^[\s\S]*?({)/, '$1');
  const e = text.lastIndexOf('}');
  if (e === -1) throw new Error(`JSON inválido para ${dia}`);
  return JSON.parse(text.slice(0, e + 1));
}

async function generarPlanSemanal(user) {
  const SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const diasEntreno = user.dias_entreno?.length ? user.dias_entreno : ['Lunes', 'Miércoles', 'Viernes'];
  console.log('  Días entreno:', diasEntreno.join(', '));

  // Generar todos los días en paralelo — mucho más rápido
  console.log('  Generando 7 días en paralelo...');
  const promesas = SEMANA.map(dia => {
    const esEntreno = diasEntreno.includes(dia);
    return generarUnDia(user, dia, esEntreno).catch(err => {
      console.error(`  ⚠️ Error en ${dia}:`, err.message);
      // Día de fallback si falla
      return { dia, es_descanso: !esEntreno, comidas: [], ejercicios: [] };
    });
  });

  const todos = await Promise.all(promesas);
  const validos = todos.filter(d => d?.dia);
  if (!validos.length) throw new Error('No se generaron días válidos');
  console.log(`  ✅ Plan completo: ${validos.length} días`);
  return { dias: validos };
}

async function analizarSemana(user, semanaHistorial) {
  if (!semanaHistorial?.ejercicios?.length) return 'Sin datos suficientes para analizar.';
  const ejerciciosResumen = semanaHistorial.ejercicios.map(e => `${e.ejercicio}: ${e.peso_kg}kg x${e.reps_realizadas} (${e.sensacion || 'normal'})`).join(', ');
  const prompt = `Analiza esta semana y da recomendaciones para la próxima:\n\nUsuario: ${user.nombre} | Objetivo: ${user.objetivo}\nPeso inicio: ${semanaHistorial.peso_corporal_inicio}kg → fin: ${semanaHistorial.peso_corporal_fin}kg\nDías entrenados: ${semanaHistorial.dias_entrenados}\nEjercicios: ${ejerciciosResumen}\n\nDa análisis en 4 puntos: qué hizo bien, qué mejorar, ajustes de peso próxima semana, ajustes nutricionales. Máx 150 palabras, motivador y específico.`;
  const r = await client.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 400, messages: [{ role: 'user', content: prompt }] });
  return r.content[0].text;
}

async function generarAlternativaEjercicio(user, ejercicio, contexto) {
  const prompt = `Reemplaza: ${ejercicio.nombre} | ${ejercicio.series}x${ejercicio.reps}${ejercicio.peso_kg ? ' '+ejercicio.peso_kg+'kg' : ''}\nObjetivo: ${user.objetivo} | Nivel: ${user.nivel}${contexto ? '\nRazón: ' + contexto : ''}\nJSON: {"nombre":"str","descripcion":"str","grupo_muscular":"str","nivel_dificultad":"str","series":0,"reps":"str","peso_kg":0,"descanso_seg":90,"notas":"str","tips":"str","razon":"str"}`;
  const r = await client.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 600, messages: [{ role: 'user', content: prompt }] });
  let t = r.content[0].text.trim().replace(/^[\s\S]*?({)/, '$1');
  return JSON.parse(t.slice(0, t.lastIndexOf('}') + 1));
}

async function generarAlternativaComida(user, comida, contexto) {
  const p = user.preferencias || {};
  const prompt = `Reemplaza: ${comida.nombre} | ${comida.calorias}kcal\nNacionalidad: ${user.nacionalidad} | Me gusta: ${p.me_gusta?.join(', ')||'variado'} | Evitar: ${p.no_me_gusta?.join(', ')||'ninguno'}${contexto ? '\nRazón: '+contexto : ''}\nJSON: {"nombre":"str","ingredientes":[{"nombre":"str","cantidad":"str","unidad":"str"}],"instrucciones":"str","condimentos":["str"],"tiempo_preparacion_min":0,"calorias":0,"proteinas_g":0,"carbohidratos_g":0,"grasas_g":0,"sodio_mg":0,"azucar_g":0,"fibra_g":0,"razon":"str"}`;
  const r = await client.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 800, messages: [{ role: 'user', content: prompt }] });
  let t = r.content[0].text.trim().replace(/^[\s\S]*?({)/, '$1');
  return JSON.parse(t.slice(0, t.lastIndexOf('}') + 1));
}

async function generarAlternativaDia(user, dia, tipo) {
  const p = user.preferencias || {};
  const actuales = tipo === 'ejercicios' ? (dia.ejercicios?.map(e=>e.nombre).join(', ')||'ninguno') : (dia.comidas?.map(c=>c.nombre).join(', ')||'ninguno');
  const prompt = tipo === 'ejercicios'
    ? `Genera rutina alternativa para ${dia.dia}. Actuales: ${actuales}. ${user.objetivo} | ${user.nivel}. Con descripción. JSON: {"ejercicios":[{"nombre":"str","descripcion":"str","grupo_muscular":"str","nivel_dificultad":"str","series":0,"reps":"str","peso_kg":0,"descanso_seg":90,"notas":"str","tips":"str"}]}`
    : `Genera comidas alternativas para ${dia.dia}. Actuales: ${actuales}. ${user.dieta.calorias_objetivo}kcal. Nac: ${user.nacionalidad}. Me gusta: ${p.me_gusta?.join(',')||'variado'}. Evitar: ${p.no_me_gusta?.join(',')||'ninguno'}. JSON: {"comidas":[{"nombre":"str","ingredientes":[{"nombre":"str","cantidad":"str","unidad":"str"}],"instrucciones":"str","condimentos":["str"],"tiempo_preparacion_min":0,"calorias":0,"proteinas_g":0,"carbohidratos_g":0,"grasas_g":0,"sodio_mg":0,"azucar_g":0,"fibra_g":0}]}`;
  const r = await client.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 2500, messages: [{ role: 'user', content: prompt }] });
  let t = r.content[0].text.trim().replace(/^[\s\S]*?({)/, '$1');
  return JSON.parse(t.slice(0, t.lastIndexOf('}') + 1));
}

module.exports = { askCoach, generarPlanSemanal, parseRegistro, parseCambio, parseCambioPerfil, analizarSemana, generarAlternativaEjercicio, generarAlternativaComida, generarAlternativaDia };
