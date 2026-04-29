import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import cron from 'node-cron';
import { config } from '../config/env.js';
import { ManagerAgent } from '../agents/ManagerAgent.js';
import { CalendarAgent } from '../agents/CalendarAgent.js';
import { MailAgent } from '../agents/MailAgent.js';
import { WeatherAgent } from '../agents/WeatherAgent.js';
import { MemoryAgent } from '../agents/MemoryAgent.js';
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
        await sendDailyBriefing(activeChatId);
      } catch (error) {
        console.error("Error al cron diari:", error);
      }
    }, { timezone: "Europe/Madrid" });
  }

  scheduleCron();

  bot.onText(/\/start/, (msg) => {
    saveChatId(msg.chat.id);
    const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${config.port}`;
    
    const welcome = `✨ **Benvingut a l'Ecosistema Cyber-Premium** ✨

Hola Edu! He elevat la teva gestió personal a un nou nivell. Sóc el teu assistent de nova generació, dissenyat per oferir-te el màxim rendiment amb una estètica futurista.

Pots interactuar amb mi aquí mateix o obrir la **Cyber-App** per a una experiència visual immersiva.

Què vols optimitzar avui? 🚀`;

    bot.sendMessage(msg.chat.id, welcome, { 
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: "🌌 Entrar a la Cyber-App", web_app: { url: baseUrl } }],
          [{ text: "📊 Status d'avui", callback_data: 'query_today' }, { text: "📧 Inbox Intelligence", callback_data: 'query_mails' }],
          [{ text: "🌤️ Atmosfera Balaguer", callback_data: 'query_weather' }]
        ]
      }
    });
  });

  bot.onText(/\/correus/, async (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "⏳ Un moment, vaig a veure els teus emails...");
    bot.sendChatAction(chatId, 'typing');
    try {
      const summary = await MailAgent.getDailyEmailSummary();
      bot.sendMessage(chatId, summary);
    } catch (emailErr) {
      console.error("Error processant correus manuals:", emailErr);
      bot.sendMessage(chatId, "Ostres, no he pogut connectar amb el teu Gmail. T'has autenticat correctament? 🤔");
    }
  });

  bot.onText(/\/avui/, async (msg) => {
    const chatId = msg.chat.id;
    saveChatId(chatId);
    bot.sendChatAction(chatId, 'typing');
    await sendDailyBriefing(chatId);
  });

  bot.onText(/\/app/, (msg) => {
    const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${config.port}`;
    bot.sendMessage(msg.chat.id, "Aquí tens la teva agenda visual: 📱", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🚀 Obrir l'App", web_app: { url: baseUrl } }]
        ]
      }
    });
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
         bot.sendMessage(chatId, '🎙️ Escoltant...', { parse_mode: 'HTML' });
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
      console.log('Intent detectat:', JSON.stringify(data));

      if (!data || data.confidence < 0.4) {
        updateMemory(chatId, "Bot", "No ho he entès bé.");
        return bot.sendMessage(chatId, data?.reply_message || "Ei, no t'he entès gaire bé. 🤔 Pots repetir-ho d'una altra manera?");
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
        case 'save_memory':
          updateMemory(chatId, "Bot", "Guardant memòria");
          await MemoryAgent.handleSave(bot, chatId, text);
          break;
        case 'query_memory':
          updateMemory(chatId, "Bot", "Busca en la memòria");
          await MemoryAgent.handleQuery(bot, chatId, text);
          break;
        case 'general_chat':
          updateMemory(chatId, "Bot", data.reply_message);
          bot.sendMessage(chatId, data.reply_message || "Ei! En què et puc ajudar? 😊");
          break;
        default:
          bot.sendMessage(chatId, `Entès! Però aquesta funció encara l'estic aprenent 🤓 Pots demanar-me coses de l'agenda, correus o el temps.`);
      }
    } catch (error) {
      console.error("Error processant missatge:", error);
      const errMsg = error?.message || '';
      if (errMsg.includes('auth') || errMsg.includes('credentials') || error?.status === 401) {
        const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${config.port}`;
        bot.sendMessage(chatId, `🔑 Sembla que no tinc permís per accedir al teu Google Calendar o Gmail. Si us plau, torna'm a autoritzar aquí:\n${baseUrl}/auth`);
      } else {
        bot.sendMessage(chatId, "Ostres, algo ha anat malament per la meva banda 😅 Torna-ho a provar en un moment!");
      }
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
         bot.sendMessage(chatId, "✅ Fet! Ho tinc al calendari 🗓️", { parse_mode: 'HTML' });
      } else if (action.type === 'delete') {
         await deleteEventById(action.eventId);
         bot.sendMessage(chatId, "🗑️ Esborrat! Ja no hi és.", { parse_mode: 'HTML' });
      } else if (action.type === 'update') {
         await updateEvent(action.eventId, action.originalEvent, action.data);
         bot.sendMessage(chatId, "✅ Actualitzat! El teu calendari ja ho té al dia 📅", { parse_mode: 'HTML' });
      } else if (actionId === 'query_today') {
         await sendDailyBriefing(chatId);
      } else if (actionId === 'query_mails') {
         const summary = await MailAgent.getDailyEmailSummary();
         bot.sendMessage(chatId, summary);
      } else if (actionId === 'query_weather') {
         const tempsStr = await WeatherAgent.getWeather();
         bot.sendMessage(chatId, tempsStr);
      }
    } catch (error) {
      console.error(error);
      bot.sendMessage(chatId, "Ui, algo ha fallat amb el calendari 😬 Torna-ho a provar!");
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
     bot.sendMessage(chatId, `⚙️ Fet! Preferències guardades:\n🌅 Resum diari: ${userPrefs.summaryTime}\n⏱️ Durada per defecte: ${userPrefs.defaultDuration} min`);
  } else {
     bot.sendMessage(chatId, "Hmm, no he detectat cap canvi de preferències. Pots dir-m'ho d'una altra manera? 🤔");
  }
}

async function sendDailyBriefing(chatId) {
  try {
    const today = new Date().toLocaleString('en-CA', {timeZone: 'Europe/Madrid'}).substring(0, 10);
    
    // Agenda avui
    const todayEvents = await listUpcomingEvents(20, today, today);
    let todayText = '';
    if (!todayEvents || todayEvents.length === 0) {
      todayText = "Cap event avui 🎉";
    } else {
      todayEvents.forEach((ev) => {
        const timeStr = ev.start.dateTime
          ? new Date(ev.start.dateTime).toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' })
          : 'Tot el dia';
        todayText += `  ▶️ ${timeStr}: ${ev.summary}\n`;
      });
    }

    // Propers 7 dies (excloent avui)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toLocaleString('en-CA', {timeZone: 'Europe/Madrid'}).substring(0, 10);
    const in7days = new Date();
    in7days.setDate(in7days.getDate() + 7);
    const in7daysStr = in7days.toLocaleString('en-CA', {timeZone: 'Europe/Madrid'}).substring(0, 10);

    const weekEvents = await listUpcomingEvents(15, tomorrowStr, in7daysStr);
    let weekText = '';
    if (!weekEvents || weekEvents.length === 0) {
      weekText = "  Cap event els propers 7 dies 😎";
    } else {
      weekEvents.forEach((ev) => {
        const d = new Date(ev.start.dateTime || ev.start.date);
        const dateStr = d.toLocaleDateString('ca-ES', { weekday: 'short', day: 'numeric', month: 'short' });
        const timeStr = ev.start.dateTime
          ? d.toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' })
          : 'Tot el dia';
        weekText += `  📌 ${dateStr} ${timeStr}: ${ev.summary}\n`;
      });
    }

    // Greeting amb temps
    const eventsTextForGreeting = todayText;
    const greeting = await WeatherAgent.getMorningGreeting(eventsTextForGreeting);

    // Agenda formatada
    const agendaMsg = `📅 <b>Agenda d'avui:</b>\n${todayText}\n📆 <b>Propers 7 dies:</b>\n${weekText}`;

    // Enviem els missatges
    bot.sendMessage(chatId, greeting);
    bot.sendMessage(chatId, agendaMsg, { parse_mode: 'HTML' });

    // Correus (petit delay per evitar rate limiting de Gemini)
    try {
      await new Promise(r => setTimeout(r, 2000));
      const emailSummary = await MailAgent.getDailyEmailSummary();
      bot.sendMessage(chatId, emailSummary);
    } catch (emailErr) {
      console.error("Error correus briefing:", emailErr?.message || emailErr);
      bot.sendMessage(chatId, "📧 No he pogut carregar els correus ara.");
    }

  } catch (error) {
    console.error("Error al sendDailyBriefing:", error);
    bot.sendMessage(chatId, "Ei, no he pogut carregar tot el resum ara. Torna-ho a provar en un moment! 🙏");
  }
}
