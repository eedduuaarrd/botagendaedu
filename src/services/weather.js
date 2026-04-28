import https from 'https';

export function fetchTodayWeather() {
  return new Promise((resolve) => {
    // Balaguer location using wttr.in
    const url = 'https://wttr.in/Balaguer?format=j1';

    https.get(url, { headers: { 'User-Agent': 'curl/7.64.1' } }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
           return resolve(`Error de l'API del temps. Codi: ${res.statusCode}.`);
        }
        try {
          const data = JSON.parse(body);
          if (!data || !data.weather || data.weather.length === 0) {
            return resolve("Error analitzant el format de wttr.in.");
          }

          const today = data.weather[0];
          const maxTemp = today.maxtempC;
          const minTemp = today.mintempC;
          
          let precip = 0;
          if (today.hourly) {
            today.hourly.forEach(h => precip += parseFloat(h.precipMM || 0));
          }

          const currentDesc = data.current_condition && data.current_condition.length > 0 
            ? data.current_condition[0].weatherDesc[0].value 
            : "Desconegut";

          resolve(`Temps avui a Balaguer: ${currentDesc}. Màxima de ${maxTemp}ºC i mínima de ${minTemp}ºC. Precipitació esperada: ${precip.toFixed(1)}mm.`);
        } catch (e) {
          resolve(`Error desxifrant el temps: ${e.message}`);
        }
      });
    }).on('error', (e) => {
      console.error("Error xarxa temps wttr.in:", e);
      resolve(`Error de xarxa obtenint el temps: ${e.message}`);
    });
  });
}
