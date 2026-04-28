import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import cron from 'node-cron';
import { config } from '../config/env.js';
import { parseNaturalLanguage, summarizeEmails, answerEmailQuery, generateMorningGreeting } from '../services/gemini.js';
import { createEvent, listUpcomingEvents, deleteEventById, searchEvent, updateEvent } from '../services/calendar.js';
import { fetchRecentEmails } from '../services/gmail.js';
import { fetchTodayWeather } from '../services/weather.js';
import { addHours } from 'date-fns';

let bot;
if (config.telegramToken && config.telegramToken !== 'your_telegram_bot_token_here') {
  bot = new TelegramBot(config.telegramToken, { polling: true });
}

const pendingActions = new Map();
const userMemories = new Map();
const generateId = () => Math.random().toString(36).substring(2, 9);

const PREFS_FILE = 'preferences.json';
let userPrefs = { summaryTime: '05:00', defaultDuration: 60 };
try {
  if (fs.existsSync(PREFS_FILE)) {
    userPrefs = JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8'));
  }
} catch(e) {}

function savePrefs() {
  fs.writeFileSync(PREFS_FILE, JSON.stringify(userPrefs, null, 2));
}

let cronTask = null;

function updateMemory(chatId, role, text) {
  if (!userMemories.has(chatId)) userMemories.set(chatId, []);
  const mem = userMemories.get(chatId);
  mem.push(`${role}: ${text}`);
  if (mem.length > 6) mem.shift(); 
}

function getMemoryStr(chatId) {
  const mem = userMemories.get(chatId);
  return mem ? mem.join('\n') : "";
}

function saveChatId(chatId) {
  fs.writeFileSync('chat_id.txt', chatId.toString(), 'utf8');
}

export function setupBot() {
  if (!bot) return;

  function scheduleCron() {
    if (cronTask) cronTask.stop();
    const parts = userPrefs.summaryTime.split(':');
    const hour = parts[0] || '5';
    const minute = parts[1] || '0';

    cronTask = cron.schedule(`${minute} ${hour} * * *`, async () => {
      try {
        if (!fs.existsSync('chat_id.txt')) return;
        const activeChatId = fs.readFileSync('chat_id.txt', 'utf8');
        if (!activeChatId) return;

        const today = new Date().toLocaleString('en-CA', {timeZone: 'Europe/Madrid'}).substring(0, 10);
        const events = await listUpcomingEvents(20, today, today);
        
        let eventsText = '';
        if (!events || events.length === 0) {
           eventsText = "Avui tens el dia completament lliure, no hi ha cap esdeveniment programat.";
        } else {
           events.forEach((ev) => {
             const timeStr = ev.start.dateTime ? new Date(ev.start.dateTime).toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' }) : 'Tot el dia';
             eventsText += `- ${timeStr}: ${ev.summary}\n`;
           });
        }
        
        const weatherText = await fetchTodayWeather();
        const greeting = await generateMorningGreeting(eventsText, weatherText);
        bot.sendMessage(activeChatId, greeting);

        try {
          const emails = await fetchRecentEmails(24);
          if (emails.length === 0) {
            bot.sendMessage(activeChatId, "📧 <b>Correus:</b> No tens correus nous de les últimes 24 hores.", {parse_mode: 'HTML'});
          } else {
            const emailsText = emails.map(e => `De: ${e.from}\nAssumpte: ${e.subject}\nResum: ${e.snippet}\n---`).join('\n');
            const summary = await summarizeEmails(emailsText);
            bot.sendMessage(activeChatId, `📧 Resum de correus:\n\n${summary}`);
          }
        } catch (emailErr) {
          console.error("Error processant correus diaris:", emailErr);
          bot.sendMessage(activeChatId, "📧 No he pogut llegir el teu Gmail per fer el resum. Recorda que has d'haver acceptat els permisos de Gmail quan vas iniciar sessió.", {parse_mode: 'HTML'});
        }
      } catch (error) {
        console.error("Error al cron diari:", error);
      }
    }, { timezone: "Europe/Madrid" });
  }

  scheduleCron();

  bot.onText(/\/start/, (msg) => {
    saveChatId(msg.chat.id);
    bot.sendMessage(msg.chat.id, "👋 <b>Hola! Sóc el teu assistent d'agenda.</b>\n\nDigue'm què vols fer amb missatges de veu o text, per exemple:\n\n✨ <i>'Afegeix una reunió demà a les 10'</i>\n🎙️ <i>(També em pots enviar notes de veu)</i>\n📅 <i>'Què tinc avui?'</i>\n⚙️ <i>'Vull que les meves reunions durin 45 minuts per defecte'</i>\n📧 <i>Pots escriure /correus per veure el resum de Gmail!</i>", { parse_mode: 'HTML' });
  });

  bot.onText(/\/correus/, async (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "⏳ <i>Llegint i resumint els correus de les últimes 24h...</i>", {parse_mode: 'HTML'});
    bot.sendChatAction(chatId, 'typing');
    try {
      const emails = await fetchRecentEmails(24);
      if (emails.length === 0) {
        bot.sendMessage(chatId, "📧 <b>Correus:</b> No tens correus nous de les últimes 24 hores.", {parse_mode: 'HTML'});
      } else {
        const emailsText = emails.map(e => `De: ${e.from}\nAssumpte: ${e.subject}\nResum: ${e.snippet}\n---`).join('\n');
        const summary = await summarizeEmails(emailsText);
        bot.sendMessage(chatId, `📧 Resum de correus:\n\n${summary}`);
      }
    } catch (emailErr) {
      console.error("Error processant correus manuals:", emailErr);
      bot.sendMessage(chatId, "❌ No he pogut llegir el teu Gmail. Has acceptat els permisos?", {parse_mode: 'HTML'});
    }
  });

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text || '';
    const voice = msg.voice;

    if (!text && !voice) return;
    if (text.startsWith('/')) return;

    saveChatId(chatId);
    bot.sendChatAction(chatId, 'typing');

    try {
      let audioData = null;
      if (voice) {
         bot.sendMessage(chatId, '🎙️ <i>Processant el teu missatge de veu...</i>', { parse_mode: 'HTML' });
         const fileUrl = await bot.getFileLink(voice.file_id);
         const response = await fetch(fileUrl);
         const buffer = await response.arrayBuffer();
         audioData = {
           base64: Buffer.from(buffer).toString('base64'),
           mimeType: voice.mime_type || 'audio/ogg'
         };
         updateMemory(chatId, "Usuari (Veu)", "(Àudio rebut de " + voice.duration + " segons)");
      } else {
         updateMemory(chatId, "Usuari", text);
      }

      const currentDateString = new Date().toLocaleString('ca-ES', { timeZone: 'Europe/Madrid' });
      const historyStr = getMemoryStr(chatId);
      
      const data = await parseNaturalLanguage(text, currentDateString, historyStr, audioData);

      if (!data || data.confidence < 0.4) {
        updateMemory(chatId, "Bot", "No ho he entès bé.");
        return bot.sendMessage(chatId, "🤔 Ho sento, no he acabat d'entendre bé la teva petició. M'ho pots dir d'una altra manera?");
      }

      switch (data.intent) {
        case 'create_event':
          updateMemory(chatId, "Bot", `He detectat intent de crear esdeveniment: ${data.title}`);
          await handleCreateRequest(chatId, data);
          break;
        case 'query_agenda':
        case 'query_free_time':
          updateMemory(chatId, "Bot", `He mostrat la seva agenda.`);
          await handleQueryRequest(chatId, data);
          break;
        case 'delete_event':
          updateMemory(chatId, "Bot", `Petició per esborrar: ${data.target_event_reference}`);
          await handleDeleteRequest(chatId, data);
          break;
        case 'update_event':
          updateMemory(chatId, "Bot", `Petició per actualitzar: ${data.target_event_reference}`);
          await handleUpdateRequest(chatId, data);
          break;
        case 'update_preferences':
          updateMemory(chatId, "Bot", "Canvi de preferències");
          await handleUpdatePreferences(chatId, data, scheduleCron);
          break;
        case 'query_emails':
          updateMemory(chatId, "Bot", "Buscant als correus");
          await handleEmailQueryRequest(chatId, text);
          break;
        case 'general_chat':
          updateMemory(chatId, "Bot", data.reply_message);
          bot.sendMessage(chatId, data.reply_message || "Hola! En què et puc ajudar amb el teu calendari?");
          break;
        default:
          bot.sendMessage(chatId, `🤖 He entès la teva petició com a "${data.intent}", però encara no tinc aquesta funció perfecta!`);
      }
    } catch (error) {
      console.error(error);
      bot.sendMessage(chatId, "❌ Hi ha hagut un error processant el teu missatge.");
    }
  });

  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const actionId = query.data; 

    const action = pendingActions.get(actionId);
    
    if (!action) {
      bot.answerCallbackQuery(query.id, { text: "⏳ Aquesta acció ja ha caducat." });
      bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId });
      return;
    }

    try {
      bot.answerCallbackQuery(query.id);
      bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId });
      bot.sendChatAction(chatId, 'typing');

      if (action.type === 'cancel') {
         bot.sendMessage(chatId, "🚫 Acció cancel·lada.");
      } else if (action.type === 'create') {
         const text = `🔔 <b>Vols algun recordatori per aquest esdeveniment?</b>`;
         const r10 = generateId(), r30 = generateId(), r60 = generateId(), r1440 = generateId(), rNone = generateId();

         pendingActions.set(r10, { type: 'create_final', data: action.data, reminder: 10 });
         pendingActions.set(r30, { type: 'create_final', data: action.data, reminder: 30 });
         pendingActions.set(r60, { type: 'create_final', data: action.data, reminder: 60 });
         pendingActions.set(r1440, { type: 'create_final', data: action.data, reminder: 1440 });
         pendingActions.set(rNone, { type: 'create_final', data: action.data, reminder: -1 });

         bot.sendMessage(chatId, text, {
           parse_mode: 'HTML',
           reply_markup: {
             inline_keyboard: [
               [{ text: "🔔 10 min abans", callback_data: r10 }, { text: "🔔 30 min abans", callback_data: r30 }],
               [{ text: "🔔 1 hora abans", callback_data: r60 }, { text: "🔔 1 dia abans", callback_data: r1440 }],
               [{ text: "🔕 Sense recordatori", callback_data: rNone }]
             ]
           }
         });
      } else if (action.type === 'create_final') {
         await createEvent(action.data, action.reminder);
         bot.sendMessage(chatId, "✅ <b>Esdeveniment afegit correctament al calendari!</b>", { parse_mode: 'HTML' });
      } else if (action.type === 'delete') {
         await deleteEventById(action.eventId);
         bot.sendMessage(chatId, "🗑️ <b>Esdeveniment esborrat correctament.</b>", { parse_mode: 'HTML' });
      } else if (action.type === 'update') {
         await updateEvent(action.eventId, action.originalEvent, action.data);
         bot.sendMessage(chatId, "🔄 <b>Esdeveniment actualitzat correctament al calendari!</b>", { parse_mode: 'HTML' });
      }
    } catch (error) {
      console.error(error);
      bot.sendMessage(chatId, "❌ Hi ha hagut un error executant l'acció al calendari.");
    }
    
    pendingActions.delete(actionId);
  });

  console.log('🤖 Telegram Bot is running...');
}

async function handleUpdatePreferences(chatId, data, scheduleCronFn) {
  let changed = false;
  if (data.preferences) {
     if (data.preferences.summaryTime) {
       userPrefs.summaryTime = data.preferences.summaryTime;
       scheduleCronFn();
       changed = true;
     }
     if (data.preferences.defaultDuration) {
       userPrefs.defaultDuration = data.preferences.defaultDuration;
       changed = true;
     }
  }

  if (changed) {
     savePrefs();
     bot.sendMessage(chatId, `⚙️ <b>Preferències actualitzades:</b>\n\n🌅 Hora del resum diari: ${userPrefs.summaryTime}\n⏳ Duració per defecte de reunions: ${userPrefs.defaultDuration} minuts\n\n${data.reply_message || "Fet!"}`, { parse_mode: 'HTML' });
  } else {
     bot.sendMessage(chatId, "🤔 No he detectat cap canvi específic de preferències a guardar.");
  }
}

async function handleCreateRequest(chatId, data) {
  // Aplicar defaultDuration si no n'hi ha cap
  if (!data.duration_minutes && !data.end_time && data.time) {
     data.duration_minutes = userPrefs.defaultDuration;
  }

  const timeStr = data.time ? data.time : 'Tot el dia';
  const durationStr = data.duration_minutes ? ` (${data.duration_minutes} minuts)` : '';
  
  let overlapWarning = '';
  if (data.date && data.time) {
    const eventsOfDay = await listUpcomingEvents(50, data.date, data.date);
    const startStr = `${data.date}T${data.time}:00`;
    let endStr = data.end_time ? `${data.date}T${data.end_time}:00` : null;
    
    const newStart = new Date(startStr);
    const newEnd = endStr ? new Date(endStr) : addHours(newStart, data.duration_minutes ? data.duration_minutes/60 : 1);

    const overlapping = eventsOfDay.filter(ev => {
       if (!ev.start.dateTime) return false;
       const evStart = new Date(ev.start.dateTime);
       const evEnd = new Date(ev.end.dateTime);
       return (newStart < evEnd && newEnd > evStart);
    });

    if (overlapping.length > 0) {
       overlapWarning = `\n\n⚠️ <b>ATENCIÓ: Solapament detectat!</b>\nJa tens "<i>${overlapping[0].summary}</i>" programat a la mateixa hora.`;
    }
  }

  const text = `✨ ${data.reply_message || "He detectat que vols crear un esdeveniment."}

📝 <b>Títol:</b> ${data.title || 'Sense títol'}
📆 <b>Data:</b> ${data.date}
⏰ <b>Hora:</b> ${timeStr}${durationStr}
📍 <b>Lloc:</b> ${data.location || 'No especificat'}${overlapWarning}

Vols que ho afegeixi al calendari?`;

  const acceptId = generateId();
  const cancelId = generateId();
  
  pendingActions.set(acceptId, { type: 'create', data });
  pendingActions.set(cancelId, { type: 'cancel' });

  bot.sendMessage(chatId, text, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[
        { text: "✅ Confirmar i afegir", callback_data: acceptId },
        { text: "❌ Cancel·lar", callback_data: cancelId }
      ]]
    }
  });
}

async function handleQueryRequest(chatId, data) {
  const events = await listUpcomingEvents(15, data.date, data.date_end);
  
  if (!events || events.length === 0) {
    let period = "pròximament";
    if (data.date && !data.date_end) {
      const todayStr = new Date().toISOString().substring(0,10);
      period = data.date === todayStr ? "per avui" : `el ${data.date}`;
    } else if (data.date && data.date_end) {
      period = `entre el ${data.date} i el ${data.date_end}`;
    }
    return bot.sendMessage(chatId, `🎉 Tens l'agenda lliure ${period}! No tens cap esdeveniment programat.`);
  }

  let text = `📅 <b>Aquests són els teus esdeveniments:</b>\n\n`;
  events.forEach((ev) => {
    const start = ev.start.dateTime || ev.start.date;
    const dateObj = new Date(start);
    const dateStr = dateObj.toLocaleDateString('ca-ES', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' });
    const timeStr = ev.start.dateTime ? dateObj.toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' }) : 'Tot el dia';
    text += `🔹 <b>${dateStr} (${timeStr})</b>\n└ ${ev.summary}\n\n`;
  });

  bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
}

async function handleDeleteRequest(chatId, data) {
  if (!data.target_event_reference) {
    return bot.sendMessage(chatId, "🤔 No m'ha quedat clar quin esdeveniment vols esborrar. Pots dir-me el nom exacte o la data?");
  }

  const events = await searchEvent(data.target_event_reference, data.date);
  if (!events || events.length === 0) {
    return bot.sendMessage(chatId, `❌ No he trobat cap esdeveniment que es digui o tracti sobre "${data.target_event_reference}".`);
  }

  const event = events[0];
  const dateStr = new Date(event.start.dateTime || event.start.date).toLocaleString('ca-ES');

  const text = `🗑️ <b>He trobat aquest esdeveniment al teu calendari:</b>
  
📝 <b>${event.summary}</b>
⏰ ${dateStr}

N'estàs segur que el vols <b>esborrar per sempre</b>?`;

  const acceptId = generateId();
  const cancelId = generateId();
  
  pendingActions.set(acceptId, { type: 'delete', eventId: event.id });
  pendingActions.set(cancelId, { type: 'cancel' });

  bot.sendMessage(chatId, text, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[
        { text: "🗑️ Sí, esborrar-lo", callback_data: acceptId },
        { text: "❌ No, cancel·lar", callback_data: cancelId }
      ]]
    }
  });
}

async function handleUpdateRequest(chatId, data) {
  if (!data.target_event_reference) {
    return bot.sendMessage(chatId, "🤔 No m'ha quedat clar quin esdeveniment vols modificar. M'ho tornes a dir?");
  }

  const events = await searchEvent(data.target_event_reference);
  if (!events || events.length === 0) {
    return bot.sendMessage(chatId, `❌ No he trobat cap esdeveniment relacionat amb "${data.target_event_reference}".`);
  }

  const event = events[0];
  const oldDateStr = new Date(event.start.dateTime || event.start.date).toLocaleString('ca-ES');
  
  const text = `🔄 <b>Anem a actualitzar aquest esdeveniment:</b>

<b>Actual:</b> ${event.summary} (${oldDateStr})

<b>Canvis a aplicar:</b>
${data.title ? `✏️ Nou títol: ${data.title}\n` : ''}${data.date ? `📆 Nova data: ${data.date}\n` : ''}${data.time ? `⏰ Nova hora: ${data.time}\n` : ''}
Ho veus bé?`;

  const acceptId = generateId();
  const cancelId = generateId();
  
  pendingActions.set(acceptId, { type: 'update', eventId: event.id, originalEvent: event, data });
  pendingActions.set(cancelId, { type: 'cancel' });

  bot.sendMessage(chatId, text, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[
        { text: "🔄 Guardar canvis", callback_data: acceptId },
        { text: "❌ Cancel·lar", callback_data: cancelId }
      ]]
    }
  });
}

async function handleEmailQueryRequest(chatId, userText) {
  bot.sendChatAction(chatId, 'typing');
  try {
    const emails = await fetchRecentEmails(72);
    if (emails.length === 0) {
      return bot.sendMessage(chatId, "Ei! No tens cap correu en els últims dies.");
    }
    const emailsText = emails.map(e => `De: ${e.from}\nAssumpte: ${e.subject}\nResum: ${e.snippet}\n---`).join('\n');
    const answer = await answerEmailQuery(emailsText, userText);
    bot.sendMessage(chatId, answer);
  } catch (err) {
    console.error("Error processant pregunta de correus:", err);
    bot.sendMessage(chatId, "Ostres, no he pogut revisar els teus correus ara mateix.");
  }
}
