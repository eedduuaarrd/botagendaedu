import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import cron from 'node-cron';
import { config } from '../config/env.js';
import { ManagerAgent } from '../agents/ManagerAgent.js';
import { CalendarAgent } from '../agents/CalendarAgent.js';
import { MailAgent } from '../agents/MailAgent.js';
import { WeatherAgent } from '../agents/WeatherAgent.js';
import { createEvent, listUpcomingEvents, deleteEventById, searchEvent, updateEvent } from '../services/calendar.js';
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
        
        const greeting = await WeatherAgent.getMorningGreeting(eventsText);
        bot.sendMessage(activeChatId, greeting);

        try {
          const summary = await MailAgent.getDailyEmailSummary();
          bot.sendMessage(activeChatId, summary);
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
    bot.sendMessage(msg.chat.id, "👋 <b>Hola! Sóc el teu assistent d'agenda.</b>\n\nDigue'm què vols fer amb missatges de veu o text, per exemple:\n\n✨ <i>'Afegeix una reunió demà a les 10'</i>\n🎙️ <i>(També em pots enviar notes de veu)</i>\n📅 <i>'Què tinc avui?'</i>\n⚙️ <i>'Vull que les meves reunions durin 45 minuts per defecte'</i>\n📧 <i>Pots escriure /correus per veure el resum de Gmail!</i>\n🌤️ <i>Escriu /avui per veure el resum diari i el temps!</i>", { parse_mode: 'HTML' });
  });

  bot.onText(/\/correus/, async (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "⏳ <i>Llegint i resumint els correus de les últimes 24h...</i>", {parse_mode: 'HTML'});
    bot.sendChatAction(chatId, 'typing');
    try {
      const summary = await MailAgent.getDailyEmailSummary();
      bot.sendMessage(chatId, summary);
    } catch (emailErr) {
      console.error("Error processant correus manuals:", emailErr);
      bot.sendMessage(chatId, "❌ No he pogut llegir el teu Gmail. Has acceptat els permisos?", {parse_mode: 'HTML'});
    }
  });

  bot.onText(/\/avui/, async (msg) => {
    const chatId = msg.chat.id;
    bot.sendChatAction(chatId, 'typing');
    try {
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
      
      const greeting = await WeatherAgent.getMorningGreeting(eventsText);
      bot.sendMessage(chatId, greeting);
    } catch (error) {
      console.error("Error al /avui:", error);
      bot.sendMessage(chatId, "No he pogut carregar l'agenda i el temps ara mateix.");
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
      
      const data = await ManagerAgent.processUserMessage(text, currentDateString, historyStr, audioData);

      if (!data || data.confidence < 0.4) {
        updateMemory(chatId, "Bot", "No ho he entès bé.");
        return bot.sendMessage(chatId, "🤔 Ho sento, no he acabat d'entendre bé la teva petició. M'ho pots dir d'una altra manera?");
      }

      switch (data.intent) {
        case 'create_event':
          updateMemory(chatId, "Bot", `He detectat intent de crear esdeveniment: ${data.title}`);
          await CalendarAgent.handleCreateRequest(bot, chatId, data, pendingActions, generateId, userPrefs);
          break;
        case 'query_agenda':
        case 'query_free_time':
          updateMemory(chatId, "Bot", `He mostrat la seva agenda.`);
          await CalendarAgent.handleQueryRequest(bot, chatId, data);
          break;
        case 'delete_event':
          updateMemory(chatId, "Bot", `Petició per esborrar: ${data.target_event_reference}`);
          await CalendarAgent.handleDeleteRequest(bot, chatId, data, pendingActions, generateId);
          break;
        case 'update_event':
          updateMemory(chatId, "Bot", `Petició per actualitzar: ${data.target_event_reference}`);
          await CalendarAgent.handleUpdateRequest(bot, chatId, data, pendingActions, generateId);
          break;
        case 'update_preferences':
          updateMemory(chatId, "Bot", "Canvi de preferències");
          await handleUpdatePreferences(chatId, data, scheduleCron);
          break;
        case 'query_emails':
          updateMemory(chatId, "Bot", "Buscant als correus");
          const answer = await MailAgent.handleEmailQuery(text);
          bot.sendMessage(chatId, answer);
          break;
        case 'query_weather':
          updateMemory(chatId, "Bot", "Donant el temps");
          const tempsStr = await WeatherAgent.getWeather();
          bot.sendMessage(chatId, tempsStr);
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

