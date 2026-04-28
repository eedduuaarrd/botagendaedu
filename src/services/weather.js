export async function fetchTodayWeather() {
  try {
    // Lleida coordinates
    const lat = 41.6167;
    const lon = 0.6222;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Europe%2FMadrid&forecast_days=1`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data || !data.daily) {
      return "No he pogut obtenir el temps d'avui.";
    }

    const maxTemp = data.daily.temperature_2m_max[0];
    const minTemp = data.daily.temperature_2m_min[0];
    const precip = data.daily.precipitation_sum[0];
    const code = data.daily.weathercode[0];

    // Interpret weather code roughly
    let status = "Desconegut";
    if (code === 0) status = "Cel serè, molt de sol";
    else if (code >= 1 && code <= 3) status = "Alguns núvols però bé";
    else if (code >= 45 && code <= 48) status = "Boira";
    else if (code >= 51 && code <= 67) status = "Pluja";
    else if (code >= 71 && code <= 77) status = "Neu";
    else if (code >= 80 && code <= 82) status = "Xàfecs";
    else if (code >= 95) status = "Tempesta";

    return `Temps avui a Lleida: ${status}. Màxima de ${maxTemp}ºC i mínima de ${minTemp}ºC. Precipitació esperada: ${precip}mm.`;
  } catch (error) {
    console.error("Error obtenint el temps:", error);
    return "Error llegint el temps avui.";
  }
}
