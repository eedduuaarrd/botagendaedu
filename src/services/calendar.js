import { google } from 'googleapis';
import { oauth2Client } from '../config/googleAuth.js';
import { addMinutes, addHours, addDays, startOfDay, endOfDay } from 'date-fns';

const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

export async function createEvent(eventData, reminderMinutes = null) {
  let startDateTime, endDateTime;
  let isAllDay = !eventData.time;

  const pad = (n) => n.toString().padStart(2, '0');
  const formatLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;

  if (!isAllDay) {
    startDateTime = `${eventData.date}T${eventData.time}:00`;
    const [year, month, day] = eventData.date.split('-');
    const [hour, minute] = eventData.time.split(':');
    const startObj = new Date(year, month - 1, day, hour, minute);

    if (eventData.end_time) {
      endDateTime = `${eventData.date}T${eventData.end_time}:00`;
    } else if (eventData.duration_minutes) {
      endDateTime = formatLocal(addMinutes(startObj, eventData.duration_minutes));
    } else {
      endDateTime = formatLocal(addHours(startObj, 1));
    }
  }

  const event = {
    summary: eventData.title || 'Nou esdeveniment',
    description: eventData.description,
    location: eventData.location,
    attendees: eventData.participants?.map(email => ({ email })) || [],
  };

  if (reminderMinutes !== null) {
    event.reminders = { useDefault: false, overrides: [] };
    if (reminderMinutes > 0) {
      event.reminders.overrides.push({ method: 'popup', minutes: reminderMinutes });
    }
  } else {
    event.reminders = {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 60 },
        { method: 'popup', minutes: 10 },
      ],
    };
  }

  if (isAllDay) {
    event.start = { date: eventData.date, timeZone: 'Europe/Madrid' };
    const dateObj = new Date(eventData.date);
    dateObj.setDate(dateObj.getDate() + 1);
    event.end = { date: formatLocal(dateObj).substring(0, 10), timeZone: 'Europe/Madrid' };
  } else {
    event.start = { dateTime: startDateTime, timeZone: 'Europe/Madrid' };
    event.end = { dateTime: endDateTime, timeZone: 'Europe/Madrid' };
  }

  const res = await calendar.events.insert({ calendarId: 'primary', resource: event });
  return res.data;
}

export async function listUpcomingEvents(maxResults = 10, dateStart = null, dateEnd = null) {
  let timeMin = dateStart ? startOfDay(new Date(dateStart)).toISOString() : new Date().toISOString();
  let timeMax = undefined;

  if (dateEnd) {
    timeMax = endOfDay(new Date(dateEnd)).toISOString();
  } else if (dateStart && !dateEnd) {
    timeMax = endOfDay(new Date(dateStart)).toISOString();
  }

  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin,
    timeMax,
    maxResults,
    singleEvents: true,
    orderBy: 'startTime',
  });
  return res.data.items;
}

export async function searchEvent(query, date) {
  let timeMin = date ? startOfDay(new Date(date)).toISOString() : new Date().toISOString();
  let timeMax = date ? endOfDay(addDays(new Date(date || new Date()), 30)).toISOString() : undefined;
  
  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const allEvents = res.data.items || [];
  
  if (!query) return allEvents.slice(0, 5);

  const normalizeStr = (str) => {
    return str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";
  };

  const normalizedQuery = normalizeStr(query);

  const matched = allEvents.filter(ev => {
    const title = normalizeStr(ev.summary);
    const desc = normalizeStr(ev.description);
    return title.includes(normalizedQuery) || desc.includes(normalizedQuery);
  });

  return matched.slice(0, 5);
}

export async function updateEvent(eventId, originalEvent, eventData) {
  const updatedEvent = { ...originalEvent };
  
  const pad = (n) => n.toString().padStart(2, '0');
  const formatLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;

  if (eventData.title) updatedEvent.summary = eventData.title;
  if (eventData.description) updatedEvent.description = eventData.description;
  if (eventData.location) updatedEvent.location = eventData.location;

  if (eventData.date || eventData.time) {
     let isAllDay = !eventData.time && (!originalEvent.start.dateTime && !eventData.time);
     const dateToUse = eventData.date || (originalEvent.start.date || originalEvent.start.dateTime.split('T')[0]);
     
     if (isAllDay) {
       updatedEvent.start = { date: dateToUse, timeZone: 'Europe/Madrid' };
       const dateObj = new Date(dateToUse);
       dateObj.setDate(dateObj.getDate() + 1);
       updatedEvent.end = { date: formatLocal(dateObj).substring(0, 10), timeZone: 'Europe/Madrid' };
     } else {
       const timeToUse = eventData.time || (originalEvent.start.dateTime ? originalEvent.start.dateTime.split('T')[1].substring(0,5) : '09:00');
       const startDateTime = `${dateToUse}T${timeToUse}:00`;
       const [year, month, day] = dateToUse.split('-');
       const [hour, minute] = timeToUse.split(':');
       const startObj = new Date(year, month - 1, day, hour, minute);
       const endDateTime = formatLocal(addHours(startObj, 1));
       
       updatedEvent.start = { dateTime: startDateTime, timeZone: 'Europe/Madrid' };
       updatedEvent.end = { dateTime: endDateTime, timeZone: 'Europe/Madrid' };
     }
  }

  const res = await calendar.events.update({
    calendarId: 'primary',
    eventId: eventId,
    resource: updatedEvent,
  });
  return res.data;
}

export async function deleteEventById(eventId) {
  await calendar.events.delete({ calendarId: 'primary', eventId });
}
