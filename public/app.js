const tg = window.Telegram.WebApp;

// Expand to full height
tg.expand();

// Set colors based on Telegram theme
document.body.style.setProperty('--bg-color', tg.themeParams.bg_color || '#0f111a');
document.body.style.setProperty('--text-primary', tg.themeParams.text_color || '#ffffff');

const user = tg.initDataUnsafe?.user;
if (user) {
    document.getElementById('greeting').innerText = `Hola, ${user.first_name}!`;
    if (user.photo_url) {
        document.getElementById('user-photo').src = user.photo_url;
    }
}

// Set date
const options = { weekday: 'long', day: 'numeric', month: 'long' };
document.getElementById('date-display').innerText = new Date().toLocaleDateString('ca-ES', options);

async function fetchData() {
    try {
        // Fetch Today's Events
        const eventsRes = await fetch('/api/today-events');
        const events = await eventsRes.json();
        renderEvents(events);

        // Fetch Weather
        const weatherRes = await fetch('/api/weather');
        const weather = await weatherRes.json();
        renderWeather(weather);

        // Fetch Briefing
        const briefingRes = await fetch('/api/briefing');
        const briefing = await briefingRes.json();
        renderBriefing(briefing);

    } catch (err) {
        console.error("Error fetching data:", err);
    }
}

function renderEvents(events) {
    const list = document.getElementById('event-list');
    list.innerHTML = '';

    if (!events || events.length === 0) {
        list.innerHTML = '<li class="loading">Cap event avui 🎉</li>';
        return;
    }

    events.forEach(ev => {
        const li = document.createElement('li');
        li.className = 'event-item';
        
        const time = ev.start.dateTime 
            ? new Date(ev.start.dateTime).toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' })
            : 'Tot el dia';

        li.innerHTML = `
            <span class="event-time">${time}</span>
            <span class="event-title">${ev.summary}</span>
        `;
        list.appendChild(li);
    });
}

function renderWeather(data) {
    // Assuming weather string like "Temps avui a Balaguer: Partly cloudy. Màxima de 25ºC..."
    const tempMatch = data.match(/Màxima de (\d+)ºC/);
    if (tempMatch) {
        document.getElementById('temp-val').innerText = `${tempMatch[1]}°C`;
    }
    // Icon logic could be more complex, but for now:
    if (data.toLowerCase().includes('cloud')) document.getElementById('weather-icon').innerText = '⛅';
    else if (data.toLowerCase().includes('rain')) document.getElementById('weather-icon').innerText = '🌧️';
    else document.getElementById('weather-icon').innerText = '☀️';
}

function renderBriefing(data) {
    const content = document.getElementById('summary-content');
    content.innerHTML = `<p>${data.replace(/\n/g, '<br>')}</p>`;
}

// Initial fetch
fetchData();

// Navigation logic
document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelector('.nav-item.active').classList.remove('active');
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        // Handle tab switching if needed
    });
});

// Telegram Main Button integration
tg.MainButton.setText('Tancar Agenda');
tg.MainButton.show();
tg.MainButton.onClick(() => tg.close());
