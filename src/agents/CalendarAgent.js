import { createEvent, listUpcomingEvents, deleteEventById, searchEvent, updateEvent } from '../services/calendar.js';

export class CalendarAgent {
  static async handleCreateRequest(bot, chatId, data, pendingActions, generateId, userPrefs) {
    if (!data.date || !data.title) {
      return bot.sendMessage(chatId, "Ei, em falten dades 🤔 Pots dir-me la data i el títol de l'event?");
    }

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
      const addHours = (date, h) => { date.setTime(date.getTime() + (h*60*60*1000)); return date; }
      
      const newStart = new Date(startStr);
      const newEnd = endStr ? new Date(endStr) : addHours(new Date(startStr), data.duration_minutes ? data.duration_minutes/60 : 1);

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

    let text = `Ho tinc apuntat! Confirmes? 📅\n\n`;
    text += `🔹 <b>${data.title}</b>\n`;
    text += `📆 ${new Date(data.date).toLocaleDateString('ca-ES')}\n`;
    text += `⏰ ${timeStr}${durationStr}\n`;
    
    if (data.location) text += `📍 ${data.location}\n`;
    if (data.description) text += `📝 ${data.description}\n`;
    if (overlapWarning) text += `${overlapWarning}\n`;
    if (data.participants && data.participants.length > 0) {
      text += `👥 ${data.participants.join(', ')}\n`;
    }

    const acceptId = generateId();
    const cancelId = generateId();
    
    pendingActions.set(acceptId, { type: 'create', data });
    pendingActions.set(cancelId, { type: 'cancel' });

    bot.sendMessage(chatId, text, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ Sí, afegeix-ho!", callback_data: acceptId },
          { text: "❌ Cancel·la", callback_data: cancelId }
        ]]
      }
    });
  }

  static async handleQueryRequest(bot, chatId, data) {
    const start = data.date || new Date().toISOString().split('T')[0];
    const end = data.date_end || start;
    
    const events = await listUpcomingEvents(10, start, end);
    
    let period = start === end ? `el ${new Date(start).toLocaleDateString('ca-ES')}` : `del ${new Date(start).toLocaleDateString('ca-ES')} al ${new Date(end).toLocaleDateString('ca-ES')}`;
    
    if (!events || events.length === 0) {
      return bot.sendMessage(chatId, `🎉 Tens el dia lliure ${period}! Cap event programat, aprofita-ho!`);
    }

    let text = `🗓️ Aquí tens el que tens ${period}:\n\n`;
    events.forEach((ev) => {
      const d = new Date(ev.start.dateTime || ev.start.date);
      const timeStr = ev.start.dateTime ? d.toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' }) : 'Tot el dia';
      const dateStr = d.toLocaleDateString('ca-ES', { weekday: 'short', day: 'numeric', month: 'short' });
      text += `▶️ <b>${dateStr} - ${timeStr}</b>: ${ev.summary}\n`;
    });

    bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
  }

  static async handleDeleteRequest(bot, chatId, data, pendingActions, generateId) {
    if (!data.target_event_reference) {
      return bot.sendMessage(chatId, "Hm, quin event vols esborrar? 🤔 Digue'm el nom o la data.");
    }

    const events = await searchEvent(data.target_event_reference);
    if (!events || events.length === 0) {
      return bot.sendMessage(chatId, `Hmm, no he trobat cap event que s'assembli a "${data.target_event_reference}" 🔎 Prova amb un altre nom?`);
    }

    const event = events[0];
    const dateStr = new Date(event.start.dateTime || event.start.date).toLocaleString('ca-ES');
    
    let text = `Esborro <b>${event.summary}</b>? (${dateStr}) 🗑️`;

    const acceptId = generateId();
    const cancelId = generateId();
    
    pendingActions.set(acceptId, { type: 'delete', eventId: event.id });
    pendingActions.set(cancelId, { type: 'cancel' });

    bot.sendMessage(chatId, text, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: "🗑️ Sí, esborrar", callback_data: acceptId },
          { text: "❌ No, deixa-ho", callback_data: cancelId }
        ]]
      }
    });
  }

  static async handleUpdateRequest(bot, chatId, data, pendingActions, generateId) {
    if (!data.target_event_reference) {
      return bot.sendMessage(chatId, "Quin event vols canviar? 🤔 Digues-m'ho i el busco.");
    }

    const events = await searchEvent(data.target_event_reference);
    if (!events || events.length === 0) {
      return bot.sendMessage(chatId, `No he trobat cap event que s'assembli a "${data.target_event_reference}" 🔍`);
    }

    const event = events[0];
    const oldDateStr = new Date(event.start.dateTime || event.start.date).toLocaleString('ca-ES');
    
    const text = `Canviem <b>${event.summary}</b> (${oldDateStr})? 🔄\n\n${data.title ? `✏️ Nou nom: ${data.title}\n` : ''}${data.date ? `📆 Nova data: ${new Date(data.date).toLocaleDateString('ca-ES')}\n` : ''}${data.time ? `⏰ Nova hora: ${data.time}\n` : ''}`;

    const acceptId = generateId();
    const cancelId = generateId();
    
    pendingActions.set(acceptId, { type: 'update', eventId: event.id, originalEvent: event, data });
    pendingActions.set(cancelId, { type: 'cancel' });

    bot.sendMessage(chatId, text, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ Sí, canvia-ho!", callback_data: acceptId },
          { text: "❌ No, deixa-ho", callback_data: cancelId }
        ]]
      }
    });
  }
}
