import { loadSavedCredentialsIfExist } from '../src/config/googleAuth.js';
import { listUpcomingEvents } from '../src/services/calendar.js';
import { fetchTodayWeather } from '../src/services/weather.js';
import { generateMorningGreeting } from '../src/services/gemini.js';

async function run() {
  // 1. Auth
  console.log("1. Autenticant...");
  await loadSavedCredentialsIfExist();
  console.log("   OK");

  // 2. Calendar
  console.log("2. Llegint agenda...");
  const today = new Date().toLocaleString('en-CA', {timeZone: 'Europe/Madrid'}).substring(0, 10);
  console.log("   Avui:", today);
  const events = await listUpcomingEvents(20, today, today);
  console.log("   Events:", events ? events.length : "null");

  // 3. Weather
  console.log("3. Llegint temps...");
  const weatherText = await fetchTodayWeather();
  console.log("   Temps:", weatherText);

  // 4. Greeting
  console.log("4. Generant salutació...");
  let eventsText = events && events.length > 0
    ? events.map(ev => `- ${ev.start.dateTime ? new Date(ev.start.dateTime).toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' }) : 'Tot el dia'}: ${ev.summary}`).join('\n')
    : "Avui tens el dia lliure!";
  
  const greeting = await generateMorningGreeting(eventsText, weatherText);
  console.log("   Salutació:", greeting);
}

run().catch(e => {
  console.error("ERROR:", e.message);
  console.error(e.stack);
});
