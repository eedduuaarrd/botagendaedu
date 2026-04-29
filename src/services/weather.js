import https from 'https';

export function fetchWeatherDetailed() {
  return new Promise((resolve) => {
    // Balaguer location using wttr.in
    const url = 'https://wttr.in/Balaguer?format=j1';

    https.get(url, { headers: { 'User-Agent': 'curl/7.64.1' } }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
           return resolve({ error: true, status: res.statusCode });
        }
        try {
          const data = JSON.parse(body);
          if (!data || !data.weather || data.weather.length === 0) {
            return resolve({ error: true, message: "No data" });
          }

          const current = data.current_condition[0];
          const forecast = data.weather.slice(0, 3).map(w => ({
            date: w.date,
            max: w.maxtempC,
            min: w.mintempC,
            avg: w.avgtempC,
            desc: w.hourly[4].weatherDesc[0].value // Mid-day desc
          }));

          resolve({
            current: {
              temp: current.temp_C,
              desc: current.weatherDesc[0].value,
              humidity: current.humidity,
              wind: current.windspeedKmph
            },
            forecast
          });
        } catch (e) {
          resolve({ error: true, message: e.message });
        }
      });
    }).on('error', (e) => {
      resolve({ error: true, message: e.message });
    });
  });
}

// Keep the old one for compatibility with agents if needed, but refactor to use the new one
export async function fetchTodayWeather() {
  const data = await fetchWeatherDetailed();
  if (data.error) return "No he pogut obtenir el temps.";
  const today = data.forecast[0];
  return `Temps avui a Balaguer: ${data.current.desc}. Actualment ${data.current.temp}ºC. Màxima de ${today.max}ºC i mínima de ${today.min}ºC.`;
}
