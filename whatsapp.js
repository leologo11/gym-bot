// whatsapp.js
const db = require('./db');
const { askCoach } = require('./coach');
const fs = require('fs');

async function handleMessage(client, message) {
  if (message.isGroupMsg || message.type !== 'chat') return;
  // Normalize phone: remove @c.us, spaces, dashes
  const telefono = message.from.replace('@c.us', '').replace(/[^0-9]/g, '');
  const texto = message.body?.trim();
  if (!texto) return;
  console.log(`📱 WA [${telefono}]: ${texto}`);

  try {
    // Buscar usuario por teléfono con matching flexible
    let user = db.getUserByPhoneFlexible(telefono);
    if (user) {
      console.log(`✅ Usuario encontrado: ${user.nombre} (guardado: ${user.telefono}, llegó: ${telefono})`);
    } else {
      console.log(`⚠️  Sin usuario para número: ${telefono} — iniciando onboarding`);
    }

    // ONBOARDING para usuarios nuevos
    if (!user) {
      const estado = db.waPending.get(telefono) || { step: 0 };

      // STEP 0: Preguntar si ya tiene cuenta registrada en la web
      if (estado.step === 0) {
        db.waPending.set(telefono, { step: 'check_account' });
        return client.sendText(message.from,
          `💪 *¡Hola! Soy MAX, tu coach de fitness.*\n\n` +
          `¿Ya tienes cuenta registrada en la web?\n\n` +
          `1️⃣ *Sí, tengo cuenta* — vincular mi perfil\n` +
          `2️⃣ *No, soy nuevo* — crear perfil nuevo`
        );
      }

      // STEP check_account: Ver si tiene cuenta web
      if (estado.step === 'check_account') {
        if (texto === '1' || texto.toLowerCase().includes('si') || texto.toLowerCase().includes('sí') || texto.toLowerCase().includes('tengo')) {
          estado.step = 'ask_email';
          db.waPending.set(telefono, estado);
          return client.sendText(message.from,
            `Perfecto! 🙌 Para vincularte, dime el *email* con el que te registraste en la web:`
          );
        } else {
          // Es nuevo — flujo normal de registro
          estado.step = 1;
          db.waPending.set(telefono, estado);
          return client.sendText(message.from,
            `Perfecto, te creo un perfil nuevo.\n\n*¿Cuál es tu nombre?*`
          );
        }
      }

      // STEP ask_email: Buscar cuenta por email y vincular
      if (estado.step === 'ask_email') {
        const emailBuscado = texto.trim().toLowerCase();
        const userEncontrado = db.getUserByEmail(emailBuscado);
        if (userEncontrado) {
          // Vincular el teléfono al usuario existente
          db.updateUser(userEncontrado._id, { telefono });
          db.waPending.delete(telefono);
          user = db.getUserById(userEncontrado._id);
          await client.sendText(message.from,
            `🔥 *¡Vinculado, ${user.nombre}!* Ya te reconozco.\n\n` +
            `Tengo tu perfil completo:\n` +
            `• Objetivo: ${user.objetivo}\n` +
            `• Nivel: ${user.nivel}\n` +
            `• Macros: ${user.dieta?.calorias_objetivo || 0}kcal\n\n` +
            `*¿Qué necesitas hoy?* 💪`
          );
          // Continuar con la respuesta normal (no hacer return)
        } else {
          return client.sendText(message.from,
            `⚠️ No encontré ninguna cuenta con ese email.\n\n` +
            `Intenta de nuevo con tu email exacto, o escribe *nuevo* para crear un perfil desde cero.`
          );
        }
      }

      // Si después del ask_email encontramos al usuario, seguimos abajo
      // Si no, flujo de registro nuevo
      if (!user) {
        if (estado.step === 1) {
          estado.nombre = texto; estado.step = 2;
          db.waPending.set(telefono, estado);
          return client.sendText(message.from, `Perfecto, *${texto}*! 🙌\n\n*¿Cuál es tu objetivo?*\n\n1️⃣ Hipertrofia\n2️⃣ Fuerza\n3️⃣ Pérdida de Grasa\n4️⃣ Resistencia`);
        }
        if (estado.step === 2) {
          const objs = { '1': 'Hipertrofia', '2': 'Fuerza', '3': 'Pérdida de Grasa', '4': 'Resistencia' };
          estado.objetivo = objs[texto] || texto; estado.step = 3;
          db.waPending.set(telefono, estado);
          return client.sendText(message.from, `Objetivo: *${estado.objetivo}* ✅\n\n*¿Cuál es tu nivel?*\n\n1️⃣ Principiante\n2️⃣ Intermedio\n3️⃣ Avanzado`);
        }
        if (estado.step === 3) {
          const niveles = { '1': 'Principiante', '2': 'Intermedio', '3': 'Avanzado' };
          estado.nivel = niveles[texto] || texto;
          db.waPending.delete(telefono);
          user = db.createUser({ nombre: estado.nombre, objetivo: estado.objetivo, nivel: estado.nivel, telefono, registrado_via: 'whatsapp' });
          return client.sendText(message.from, `🔥 *¡Listo ${estado.nombre}!* Perfil creado.\n\nYa puedo darte coaching personalizado:\n\n💪 Rutinas\n⚡ Alternativas\n🥗 Recetas con macros\n📈 Registro de cargas\n\n*¿Qué necesitas hoy?*`);
        }
        return; // Sin step válido, esperar próximo mensaje
      }
    }

    if (!user) { db.waPending.delete(telefono); return handleMessage(client, message); }

    const weekPlan = db.getPlanByUser(user._id);
    const { registros: recentProgress } = db.getProgressByUser(user._id, 'semana');
    const chat = db.getChatByUser(user._id, 'whatsapp');
    const historialMensajes = chat.mensajes || [];

    const { respuesta, registro, cambio } = await askCoach({ mensaje: texto, user, weekPlan, recentProgress, historialMensajes });

    await client.sendText(message.from, respuesta);

    const nuevosMensajes = [...historialMensajes, { rol: 'user', contenido: texto }, { rol: 'assistant', contenido: respuesta }];
    db.saveChat(user._id, 'whatsapp', nuevosMensajes);

    if (registro) {
      db.addProgress(user._id, { tipo: 'ejercicio', ejercicio: registro.ejercicio, peso_kg: registro.peso, reps: registro.reps, series: registro.series, canal: 'whatsapp' });
      const newRecords = { ...(user.records || {}), [registro.ejercicio]: { peso_kg: registro.peso, reps: registro.reps, series: registro.series, fecha: new Date().toISOString() } };
      db.updateUser(user._id, { records: newRecords });
      await client.sendText(message.from, `📈 *Guardado:* ${registro.ejercicio} — ${registro.peso}kg × ${registro.reps}reps × ${registro.series}s ✅`);
    }

    // Aplicar cambio al plan si MAX detectó uno
    if (cambio && weekPlan) {
      try {
        const diaObj = weekPlan.dias.find(d => d.dia.toLowerCase() === cambio.dia.toLowerCase());
        if (diaObj) {
          if (cambio.tipo === 'comida' && diaObj.comidas?.[cambio.indice]) {
            diaObj.comidas[cambio.indice] = { ...cambio.datos, completado: false };
          } else if (cambio.tipo === 'ejercicio' && diaObj.ejercicios?.[cambio.indice]) {
            diaObj.ejercicios[cambio.indice] = { ...cambio.datos, completado: false };
          }
          db.updatePlan(weekPlan._id, weekPlan);
          const emoji = cambio.tipo === 'comida' ? '🥗' : '💪';
          await client.sendText(message.from, `${emoji} *Plan actualizado:* ${cambio.datos.nombre} reemplazado en ${cambio.dia} ✅\n\nAbre la app web para verlo reflejado.`);
          console.log(`📝 Plan WA actualizado: ${cambio.tipo} en ${cambio.dia}`);
        }
      } catch (e) {
        console.error('Error aplicando cambio WA:', e.message);
      }
    }
  } catch (e) {
    console.error('WA error:', e.message);
    client.sendText(message.from, '⚠️ Error temporal. Intenta de nuevo.');
  }
}

async function initWhatsApp() {
  const MODE = process.env.MODE || 'both';
  if (MODE === 'web') { console.log('📱 WhatsApp desactivado (MODE=web)'); return null; }

  try {
    const wppconnect = require('@wppconnect-team/wppconnect');
    console.log('📱 Iniciando WhatsApp...');

    const client = await wppconnect.create({
      session: process.env.WPP_SESSION_NAME || 'max-coach',
      autoClose: 0,
      waitForLogin: true,
      headless: true,
      logQR: false,
      disableWelcome: true,
      catchQR: (base64Qr) => {
        console.log('📲 QR disponible en: http://localhost:' + (process.env.PORT || 3000) + '/qr');
        fs.writeFileSync('./data/qr.txt', base64Qr);
        fs.writeFileSync('./data/qr_status.txt', 'pending');
      },
      statusFind: (status) => {
        console.log('WA Status:', status);
        if (status === 'isLogged' || status === 'inChat') {
          try { fs.writeFileSync('./data/qr_status.txt', 'connected'); } catch {}
        }
      }
    });

    client.onMessage((msg) => handleMessage(client, msg));
    console.log('✅ WhatsApp activo');
    return client;
  } catch (e) {
    console.log('⚠️  WhatsApp no disponible:', e.message);
    return null;
  }
}

module.exports = { initWhatsApp };
