# AI Calendar Assistant

A Telegram bot that manages your Google Calendar using natural language. Built with Node.js, Express, Telegram Bot API, Google Calendar API, and Google Gemini API.

## Features

* **Natural Language Processing**: Understands dates like "tomorrow at 4pm" or "next monday".
* **Multi-Language Support**: Works perfectly with Catalan, Spanish, and English.
* **Smart Reminders**: Automatically adds 1 hour and 10 minutes reminders to your events.
* **Confirmation Flow**: Validates parsed information before modifying your calendar.

## Project Structure

* \`/src\`
  * \`/bot\`: Telegram bot logic, listeners, and handlers.
  * \`/services\`: Integration with external APIs (Gemini, Google Calendar).
  * \`/config\`: Environment variables and Google Auth configuration.
  * \`index.js\`: Main application entry point and Express server.

## Setup Instructions

### 1. Install Dependencies

\`\`\`bash
npm install
\`\`\`

### 2. Environment Variables

Create a \`.env\` file based on \`.env.example\` provided:

\`\`\`bash
cp .env.example .env
\`\`\`

Fill out your details:
* \`TELEGRAM_TOKEN\`: Create a bot via BotFather on Telegram and paste the token here.
* \`GEMINI_API_KEY\`: Get an API key from [Google AI Studio](https://aistudio.google.com/).
* \`GOOGLE_CLIENT_ID\` & \`GOOGLE_CLIENT_SECRET\`: Follow the Google Calendar setup below.

### 3. Google Calendar API Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project.
3. Enable the **Google Calendar API** in the API Library.
4. Go to **APIs & Services > OAuth consent screen** and configure it (you can set it to External/Testing).
5. Add the scopes: \`.../auth/calendar\` and \`.../auth/calendar.events\`.
6. Add your email as a test user.
7. Go to **Credentials > Create Credentials > OAuth client ID**.
8. Application type: **Web application**.
9. Authorized redirect URIs: \`http://localhost:3000/oauth2callback\`.
10. Copy the **Client ID** and **Client Secret** to your \`.env\` file.

### 4. Start the Application

\`\`\`bash
npm start
\`\`\`

*(For development, you can use \`npm run dev\` which uses watch mode)*

### 5. Authorize Google Calendar

1. The console will display: \`Please visit http://localhost:3000/auth to authorize the application.\`
2. Open that URL in your browser.
3. Sign in with your Google Account and grant permissions.
4. The token will be saved locally in \`token.json\`.

### 6. Use the Bot

Message your bot on Telegram:
* *"demà tinc una entrevista a les 16 amb la de recursos humans de Teixidó Associats"*
* *"recorda'm trucar al Marc en 2 hores"*
* *"què tinc demà?"*

## Testing

You can use the following sample phrases in your Telegram chat to test:
* **Creation**: "Dilluns que ve a les 10h tinc metge al CAP per revisió"
* **Query**: "Què tinc aquesta setmana?"
* **Edge case (missing time)**: "Recorda'm el dia 15 de maig pagar el lloguer"
* **Relative time**: "Trucar a l'oficina d'aquí a 3 hores"
