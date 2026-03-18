// whatsapp.js v4
const { User, WeekPlan, SemanaHistorial, Progreso, Chat } = require('./models');
const { askCoach, parseCambioPerfil } = require('./coach');
const fs = require('fs');

const waPending = new Map();

function getLunes() {
  const h = new Date(); const l = new Date(h);
  l.setDate(h.getDate() - ((h.getDay() + 6) % 7)); l.setHours(0,0,0,0);
  return l;
}

async function getUserByPhoneFlexible(telefono) {
  if (!telefono) return null;
  const all = await User.find({ telefono: { $exists: true, $ne: null } });
  let found = all.find(u => u.telefono === telefono);
  if (found) return found;
  for (const digits of [10, 9, 8]) {
    const suffix = telefono.slice(-digits);
    found = all.find(u => u.telefono?.slice(-digits) === suffix);
    if (found) return found;
  }
  return null;
}

async function handleMessage(client, message) {
  if (message.isGroupMsg) return;
  // Aceptar texto e imágenes
  const esTexto = message.type === 'chat';
  const esImagen = message.type === 'image';
  if (!esTexto && !esImagen) return;

  const telefono = message.from.replace('@c.us', '').replace(/[^0-9]/g, '');
  console.log(`📱 WA [${telefono}] tipo=${message.type}`);

  // MANEJO DE FOTOS DE PROGRESO
  if (esImagen) {
    try {
      let user = await getUserByPhoneFlexible(telefono);
      if (!user) {
        return client.sendText(message.from, '⚠️ Necesitas registrarte primero para guardar fotos de progreso.');
      }
      console.log(`📸 Foto recibida de ${user.nombre}`);
      // Descargar imagen
      const buffer = await client.decryptFile(message);
      if (!buffer) return client.sendText(message.from, '⚠️ No pude descargar la foto. Intenta de nuevo.');
      // Guardar en disco
      const dir = './uploads/fotos';
      if (!require('fs').existsSync(dir)) require('fs').mkdirSync(dir, { recursive: true });
      const filename = Date.now() + '_' + user._id + '.jpg';
      const filepath = dir + '/' + filename;
      require('fs').writeFileSync(filepath, buffer);
      const foto_path = '/uploads/fotos/' + filename;
      // Descripción del caption si existe
      const descripcion = message.caption || message.body || ('Foto WhatsApp ' + new Date().toLocaleDateString('es-CL'));
      // Guardar en progreso
      const { Progreso: ProgresoModel } = require('./models');
      await ProgresoModel.create({ usuario_id: user._id, tipo: 'foto', foto_path, foto_descripcion: descripcion, canal: 'whatsapp' });
      // Guardar estado esperando peso
      waPending.set('foto_peso_' + telefono, { esperando: 'peso_foto', foto_path, foto_descripcion: descripcion });
      await client.sendText(message.from,
        `📸 *¡Foto guardada, ${user.nombre}!* ✅

🔒 Solo tú puedes verla en la app.

⚖️ ¿Cuál es tu peso actual en kg?
(Escribe solo el número, ej: *78.5*)

O escribe *omitir* si no quieres registrarlo ahora.`
      );
    } catch (e) {
      console.error('Error guardando foto WA:', e.message);
      client.sendText(message.from, '⚠️ Error guardando la foto. Intenta subirla desde la app web.');
    }
    return;
  }

  const texto = message.body?.trim();
  if (!texto) return;

  // Verificar si estaba esperando el peso después de una foto
  const keyFotoPeso = 'foto_peso_' + telefono;
  const estadoFoto = waPending.get(keyFotoPeso);
  if (estadoFoto?.esperando === 'peso_foto') {
    waPending.delete(keyFotoPeso);
    if (texto.toLowerCase() !== 'omitir') {
      const pesoVal = parseFloat(texto.replace(',', '.'));
      if (!isNaN(pesoVal)) {
        try {
          let userFoto = await getUserByPhoneFlexible(telefono);
          if (userFoto) {
            userFoto.historial_peso.push({ peso_kg: pesoVal, fecha: new Date(), notas: 'Foto de progreso' });
            userFoto.peso_corporal_kg = pesoVal;
            await userFoto.save();
            const { Progreso: ProgresoFoto } = require('./models');
            await ProgresoFoto.create({ usuario_id: userFoto._id, tipo: 'peso_corporal', peso_corporal_kg: pesoVal, canal: 'whatsapp' });
            await client.sendText(message.from, `⚖️ *Peso registrado: ${pesoVal}kg* ✅

Tu foto y peso quedaron guardados juntos en la app 📊`);
          }
        } catch(e) { console.error('Error peso foto:', e.message); }
      } else {
        await client.sendText(message.from, '⚠️ No entendí el peso. Puedes registrarlo después en la app.');
      }
    } else {
      await client.sendText(message.from, '✅ Foto guardada sin peso. Puedes registrarlo después en *Control de Peso* en la app.');
    }
    return;
  }

  try {
    let user = await getUserByPhoneFlexible(telefono);

    if (user) {
      console.log(`✅ Usuario: ${user.nombre} (${user.telefono})`);
    } else {
      console.log(`⚠️  Sin usuario para: ${telefono}`);
    }

    // ONBOARDING
    if (!user) {
      const estado = waPending.get(telefono) || { step: 0 };

      if (estado.step === 0) {
        waPending.set(telefono, { step: 'check' });
        return client.sendText(message.from, `💪 *¡Hola! Soy MAX, tu coach de fitness.*\n\n¿Ya tienes cuenta en la app web?\n\n1️⃣ *Sí* — vincular mi perfil\n2️⃣ *No* — crear perfil nuevo`);
      }

      if (estado.step === 'check') {
        if (texto === '1' || /si|sí|tengo|cuenta/i.test(texto)) {
          estado.step = 'ask_email'; waPending.set(telefono, estado);
          return client.sendText(message.from, `Perfecto! Dime el *email* con que te registraste en la web:`);
        } else {
          estado.step = 1; waPending.set(telefono, estado);
          return client.sendText(message.from, `Vamos a crear tu perfil 💪\n\n*¿Cuál es tu nombre?*`);
        }
      }

      if (estado.step === 'ask_email') {
        const emailBuscado = texto.trim().toLowerCase();
        const userEncontrado = await User.findOne({ email: emailBuscado });
        if (userEncontrado) {
          userEncontrado.telefono = telefono; await userEncontrado.save();
          waPending.delete(telefono); user = userEncontrado;
          await client.sendText(message.from, `🔥 *¡Vinculado, ${user.nombre}!*\n\nYa tengo tu perfil:\n• Objetivo: ${user.objetivo}\n• Nivel: ${user.nivel}\n• Macros: ${user.dieta?.calorias_objetivo || 0}kcal\n\n*¿Qué necesitas hoy?* 💪`);
        } else {
          return client.sendText(message.from, `⚠️ No encontré cuenta con ese email.\n\nIntenta de nuevo o escribe *nuevo* para crear perfil desde cero.`);
        }
      }

      if (!user && typeof estado.step === 'number') {
        if (estado.step === 1) { estado.nombre = texto; estado.step = 2; waPending.set(telefono, estado); return client.sendText(message.from, `*${texto}* 🙌\n\n*¿Tu objetivo?*\n1️⃣ Hipertrofia\n2️⃣ Fuerza\n3️⃣ Pérdida de Grasa\n4️⃣ Resistencia`); }
        if (estado.step === 2) {
          const objs = {'1':'Hipertrofia','2':'Fuerza','3':'Pérdida de Grasa','4':'Resistencia'};
          estado.objetivo = objs[texto] || texto; estado.step = 3; waPending.set(telefono, estado);
          return client.sendText(message.from, `Objetivo: *${estado.objetivo}* ✅\n\n*¿Tu nivel?*\n1️⃣ Principiante\n2️⃣ Intermedio\n3️⃣ Avanzado`);
        }
        if (estado.step === 3) {
          const niveles = {'1':'Principiante','2':'Intermedio','3':'Avanzado'};
          estado.nivel = niveles[texto] || texto; estado.step = 4; waPending.set(telefono, estado);
          return client.sendText(message.from, `Nivel: *${estado.nivel}* ✅\n\n*¿Tu nacionalidad?* (ej: Chile, Venezuela, Colombia...)`);
        }
        if (estado.step === 4) {
          estado.nacionalidad = texto; waPending.delete(telefono);
          const { User: UserModel } = require('./models');
          const bcrypt = require('bcryptjs');
          user = await UserModel.create({ nombre: estado.nombre, objetivo: estado.objetivo, nivel: estado.nivel, telefono, nacionalidad: estado.nacionalidad, pais_residencia: estado.nacionalidad, registrado_via: 'whatsapp' });
          await client.sendText(message.from, `🔥 *¡Listo ${estado.nombre}!* Perfil creado.\n\nPuedo ayudarte con:\n💪 Rutinas detalladas\n⚡ Alternativas en tiempo real\n🥗 Recetas con macros\n📈 Registro de cargas\n⚖️ Control de peso\n\n*¿Qué necesitas hoy?*`);
        }
        if (!user) return;
      }
      if (!user) return;
    }

    // RESPUESTA NORMAL
    const lunes = getLunes();
    const weekPlan = await WeekPlan.findOne({ usuario_id: user._id }).sort({ creado_at: -1 });
    console.log('Plan encontrado:', weekPlan ? weekPlan._id + ' dias:' + weekPlan.dias?.length : 'NO HAY PLAN');
    const semanaAnterior = await SemanaHistorial.findOne({ usuario_id: user._id, semana_inicio: { $lt: lunes } }).sort({ semana_inicio: -1 });
    const recentProgress = await Progreso.find({ usuario_id: user._id }).sort({ fecha: -1 }).limit(10);

    let chat = await Chat.findOne({ usuario_id: user._id, canal: 'whatsapp' });
    if (!chat) chat = new Chat({ usuario_id: user._id, canal: 'whatsapp', mensajes: [] });
    const historialMensajes = chat.mensajes.slice(-16);

    const { respuesta, registro, cambio, cambioPerfil } = await askCoach({ mensaje: texto, user, weekPlan, recentProgress, historialMensajes, semanaHistorial: semanaAnterior });

    await client.sendText(message.from, respuesta);

    chat.mensajes.push({ rol: 'user', contenido: texto }, { rol: 'assistant', contenido: respuesta });
    chat.mensajes = chat.mensajes.slice(-50); chat.actualizado_at = new Date(); await chat.save();

    if (registro) {
      await Progreso.create({ usuario_id: user._id, tipo: 'ejercicio', ejercicio: registro.ejercicio, peso_kg: registro.peso, reps: registro.reps, series: registro.series, canal: 'whatsapp' });
      user.records.set(registro.ejercicio, { peso_kg: registro.peso, reps: registro.reps, series: registro.series, fecha: new Date().toISOString() });
      await user.save();
      await client.sendText(message.from, `📈 *Guardado:* ${registro.ejercicio} — ${registro.peso}kg × ${registro.reps}reps ✅`);
    }

    console.log('Cambio detectado:', cambio ? JSON.stringify({tipo:cambio.tipo, dia:cambio.dia, indice:cambio.indice}) : 'ninguno');
    if (cambio && weekPlan) {
      const diaObj = weekPlan.dias.find(d => d.dia.toLowerCase() === cambio.dia.toLowerCase());
      console.log('Dia encontrado:', diaObj ? diaObj.dia : 'NO - dias disponibles: ' + weekPlan.dias.map(d=>d.dia).join(','));
      if (diaObj) {
        if (cambio.tipo === 'comida' && diaObj.comidas?.[cambio.indice]) diaObj.comidas[cambio.indice] = { ...cambio.datos, completado: false };
        else if (cambio.tipo === 'ejercicio' && diaObj.ejercicios?.[cambio.indice]) diaObj.ejercicios[cambio.indice] = { ...cambio.datos, completado: false };
        weekPlan.actualizado_at = new Date(); await weekPlan.save();
        const emoji = cambio.tipo === 'comida' ? '🥗' : '💪';
        await client.sendText(message.from, `${emoji} *Plan actualizado en ${cambio.dia}* ✅\nAbre la app para verlo reflejado.`);
      }
    }

    // Cambio de perfil desde WhatsApp → se refleja en la web
    // Comandos de notificaciones via WhatsApp
    const textoLower = texto.toLowerCase();
    if (/activ.*(notif|aviso|recordatorio)|encend.*(notif|aviso)/i.test(texto)) {
      const user2 = await User.findById(user._id);
      user2.preferencias.recordatorios_activos = true;
      await user2.save();
      await client.sendText(message.from,
        `🔔 *¡Notificaciones activadas, ${user.nombre}!* ✅

Te enviaré recordatorios de:
💧 Agua cada ${user.preferencias?.recordatorio_agua_horas || 2} horas
🍽️ Comidas según tu plan
⚖️ Pesaje cada lunes
📸 Foto mensual

Puedes personalizar esto en la app → *Notificaciones*.`
      );
      return;
    }
    if (/desactiv.*(notif|aviso|recordatorio)|apag.*(notif|aviso)/i.test(texto)) {
      const user2 = await User.findById(user._id);
      user2.preferencias.recordatorios_activos = false;
      await user2.save();
      await client.sendText(message.from, `🔕 *Notificaciones desactivadas* ✅
Puedes reactivarlas cuando quieras desde la app o diciéndome "activar notificaciones".`);
      return;
    }
    if (/agua cada (\d+)/i.test(texto)) {
      const horas = parseInt(texto.match(/agua cada (\d+)/i)[1]);
      const user2 = await User.findById(user._id);
      user2.preferencias.recordatorio_agua_horas = horas;
      await user2.save();
      await client.sendText(message.from, `💧 *Recordatorio de agua: cada ${horas} horas* ✅`);
      return;
    }

    if (cambioPerfil?.campo && cambioPerfil?.valor) {
      const update = {};
      const val = isNaN(cambioPerfil.valor) ? cambioPerfil.valor : parseFloat(cambioPerfil.valor);
      update[cambioPerfil.campo] = val;
      await User.findByIdAndUpdate(user._id, { $set: update });
      if (cambioPerfil.campo === 'peso_corporal_kg') {
        await User.findByIdAndUpdate(user._id, { $push: { historial_peso: { peso_kg: val, fecha: new Date() } } });
        await Progreso.create({ usuario_id: user._id, tipo: 'peso_corporal', peso_corporal_kg: val, canal: 'whatsapp' });
        await client.sendText(message.from, `⚖️ *Peso registrado: ${val}kg* ✅\nTu historial de peso se actualizó en la app.`);
      } else {
        await client.sendText(message.from, `✅ *Perfil actualizado:* ${cambioPerfil.campo} → ${val}`);
      }
    }

  } catch (e) {
    console.error('WA error:', e.message);
    client.sendText(message.from, '⚠️ Error temporal. Intenta de nuevo.');
  }
}

async function initWhatsApp() {
  const MODE = process.env.MODE || 'both';
  if (MODE === 'web') { console.log('📱 WhatsApp desactivado'); return null; }
  try {
    const wppconnect = require('@wppconnect-team/wppconnect');
    console.log('📱 Iniciando WhatsApp...');
    const client = await wppconnect.create({
      session: process.env.WPP_SESSION_NAME || 'max-coach',
      autoClose: 0, waitForLogin: true, headless: true, logQR: false, disableWelcome: true,
      catchQR: (base64Qr) => {
        console.log('📲 QR en: http://localhost:' + (process.env.PORT || 3000) + '/admin');
        if (!fs.existsSync('./data')) fs.mkdirSync('./data');
        fs.writeFileSync('./data/qr.txt', base64Qr);
        fs.writeFileSync('./data/qr_status.txt', 'pending');
      },
      statusFind: (status) => {
        console.log('WA:', status);
        if (['isLogged','inChat'].includes(status)) {
          try { fs.writeFileSync('./data/qr_status.txt', 'connected'); } catch {}
        }
      }
    });
    client.onMessage(msg => handleMessage(client, msg));
    console.log('✅ WhatsApp activo');
    return client;
  } catch (e) {
    console.log('⚠️  WhatsApp no disponible:', e.message);
    return null;
  }
}

module.exports = { initWhatsApp };
