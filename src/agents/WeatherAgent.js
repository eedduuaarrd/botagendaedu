import { fetchTodayWeather } from '../services/weather.js';
import { generateMorningGreeting, generateWeatherResponse } from '../services/gemini.js';

export class WeatherAgent {
  static async getMorningGreeting(eventsText) {
    try {
      const weatherText = await fetchTodayWeather();
      const greeting = await generateMorningGreeting(eventsText, weatherText);
      return greeting;
    } catch (err) {
      console.error("Error al WeatherAgent:", err);
      return `Bon dia! Aquí tens el teu dia:\n${eventsText}`;
    }
  }

  static async getWeather() {
    try {
      const weatherText = await fetchTodayWeather();
      return await generateWeatherResponse(weatherText);
    } catch (err) {
      console.error("Error al WeatherAgent (getWeather):", err);
      return "No he pogut mirar el temps ara mateix, prova-ho en un moment!";
    }
  }
}
