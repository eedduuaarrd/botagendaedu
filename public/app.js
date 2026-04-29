const tg = window.Telegram.WebApp;

// Initialize Telegram WebApp
tg.expand();
tg.enableClosingConfirmation();

// Set colors based on Telegram theme
document.body.style.setProperty('--bg-color', tg.themeParams.bg_color || '#0d0f17');
document.body.style.setProperty('--text-primary', tg.themeParams.text_color || '#ffffff');
document.body.style.setProperty('--accent-primary', tg.themeParams.button_color || '#8b5cf6');

const user = tg.initDataUnsafe?.user;
if (user) {
    document.getElementById('greeting').innerText = `Hola, ${user.first_name}!`;
    if (user.photo_url) {
        document.getElementById('user-photo').src = user.photo_url;
    }
} else {
    document.getElementById('greeting').innerText = `Hola, Edu!`;
}

// Set date
const options = { weekday: 'long', day: 'numeric', month: 'long' };
const dateStr = new Date().toLocaleDateString('ca-ES', options);
document.getElementById('date-display').innerText = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

async function fetchData() {
    // Show skeletons (already in HTML by default, but useful for refresh)
    
    try {
        // Parallel fetching
        const [eventsRes, weatherRes, briefingRes] = await Promise.all([
            fetch('/api/today-events'),
            fetch('/api/weather'),
            fetch('/api/briefing')
        ]);

        const events = await eventsRes.json();
        const weather = await weatherRes.json();
        const briefing = await briefingRes.json();

        renderEvents(events);
        renderWeather(weather);
        renderBriefing(briefing);
        renderMailSummary(); // Static for now or fetch if available

    } catch (err) {
        console.error("Error fetching data:", err);
        tg.showAlert("No s'han pogut carregar les dades. Reintenta-ho més tard.");
    }
}

function renderEvents(events) {
    const list = document.getElementById('event-list');
    list.innerHTML = '';

    if (!events || events.length === 0) {
        list.innerHTML = '<li class="loading" style="font-style: normal; opacity: 0.7; padding: 10px;">No tens esdeveniments per avui. Gaudeix del dia! ✨</li>';
        return;
    }

    events.forEach((ev, index) => {
        const li = document.createElement('li');
        li.className = 'event-item';
        li.style.animationDelay = `${0.4 + (index * 0.1)}s`;
        
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
    if (!data) return;
    
    // Simple parsing of weather string
    const tempMatch = data.match(/(\d+)ºC/) || data.match(/(\d+)°/);
    if (tempMatch) {
        document.getElementById('temp-val').innerText = `${tempMatch[1]}°`;
    }
    
    const iconSpan = document.getElementById('weather-icon');
    if (data.toLowerCase().includes('sol') || data.toLowerCase().includes('clar')) iconSpan.innerText = '☀️';
    else if (data.toLowerCase().includes('núvol')) iconSpan.innerText = '⛅';
    else if (data.toLowerCase().includes('pluja')) iconSpan.innerText = '🌧️';
    else iconSpan.innerText = '🌡️';
}

function renderBriefing(data) {
    const content = document.getElementById('summary-content');
    if (typeof data === 'string') {
        content.innerHTML = `<p>${data.replace(/\n/g, '<br>')}</p>`;
    } else {
        content.innerHTML = `<p>Preparat per a un gran dia? Tens l'agenda a punt!</p>`;
    }
}

function renderMailSummary() {
    const mailDiv = document.getElementById('mail-summary');
    mailDiv.innerHTML = '<p style="font-size: 0.9rem; opacity: 0.8;">Tens 3 correus nous sense llegir. Revisa la teva safata d\'entrada per a més detalls.</p>';
}

// Initial fetch
fetchData();

// Navigation & Interactions
document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
        if (btn.classList.contains('active')) return;
        
        tg.HapticFeedback.selectionChanged();
        document.querySelector('.nav-item.active').classList.remove('active');
        btn.classList.add('active');
        
        // Tab logic
        const tab = btn.dataset.tab;
        console.log("Switched to tab:", tab);
    });
});

document.getElementById('add-event-btn').addEventListener('click', () => {
    tg.HapticFeedback.impactOccurred('medium');
    tg.showPopup({
        title: 'Nou Event',
        message: 'Aquesta funció estarà disponible aviat. De moment, pots crear events parlant amb el bot!',
        buttons: [{type: 'ok'}]
    });
});

// Telegram Main Button
tg.MainButton.setText('TANCAR AGENDA');
tg.MainButton.setParams({
    color: tg.themeParams.button_color || '#8b5cf6',
    text_color: tg.themeParams.button_text_color || '#ffffff'
});
tg.MainButton.show();
tg.MainButton.onClick(() => {
    tg.HapticFeedback.notificationOccurred('success');
    tg.close();
});
