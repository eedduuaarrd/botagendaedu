import { fetchTodayWeather } from '../src/services/weather.js';
import { generateMorningGreeting } from '../src/services/gemini.js';

async function run() {
  console.log("Fetching weather...");
  const weatherText = await fetchTodayWeather();
  console.log("Weather:", weatherText);
  
  console.log("Generating greeting...");
  const greeting = await generateMorningGreeting("- 10:00: Reunió", weatherText);
  console.log("Greeting:", greeting);
}

run();
