# Hively – Beehive Tracker

A PWA (Progressive Web App) for beekeepers to manage their hives, inspections, honey harvests, and expenses. Optimized for mobile use directly at the apiary.

## Features

- **Dashboard** – Quick overview: number of hives, honey yield, expenses, and recent activity
- **Hive Management** – Track hives with queen name, breed, year, and health status
- **Inspections** – Log brood status, honey super, varroa treatment, feeding, and temperament
- **AI Voice Assistant** – Dictate inspection notes hands-free (Gemini-powered, Swiss German)
- **Finances** – Categorize expenses and log honey yields per hive
- **Cloud Sync** – Optional synchronization via Supabase (login/registration)
- **Offline-ready** – Local data storage with JSON backup and restore

## Requirements

- [Node.js](https://nodejs.org/) (v18+)
- npm

## Local Development

```bash
# Install dependencies
npm install

# Start development server (http://localhost:5173)
npm run dev
```

## Build & Deployment

```bash
# Create production build
npm run build

# Preview production build locally
npm run preview
```

The project is configured for Netlify (`netlify.toml`). Pushing to the main branch triggers an automatic deploy.

## Environment Variables

For Supabase sync, add the following to a `.env` file:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Without these variables, the app runs fully local — no login, no sync.

## Project Structure

```
src/
  main.js           # App entry point and UI logic
  storage.js        # Local data persistence
  supabase.js       # Supabase client and sync
  voiceAssistant.js # Gemini-powered voice assistant
  style.css         # Global styles
supabase/           # Supabase migrations and config
```

## Tech Stack

- **Vite** – Build tool
- **Supabase** – Backend and authentication
- **Google Gemini** – AI voice assistant
- **Vanilla JS** – No frontend framework
