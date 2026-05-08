# ISS Orbit News Dashboard

A React + Vite dashboard that tracks the International Space Station live, shows current space/science news, and includes a chatbot that answers only from the loaded dashboard data.

## Features

- ISS position refreshes automatically every 15 seconds
- Leaflet map with custom ISS marker and last 15-position trajectory
- Haversine speed calculation in km/h
- Nearest place/ocean-style location label
- People currently in space
- News cards with image, title, source, author, date, summary, and read-more link
- Search, sorting, category refresh, loading states, retry errors, and toast notifications
- News cache in localStorage for 15 minutes
- ISS speed line chart and clickable news distribution doughnut chart
- Floating Hugging Face chatbot restricted to dashboard data
- Dark/light mode with localStorage persistence
- Responsive desktop, tablet, and mobile layout

## Environment Variables

Create a `.env` file locally or add these in Vercel:

```bash
VITE_NEWS_API_KEY=your_newsapi_key_here
VITE_AI_TOKEN=your_huggingface_token_here
```

`VITE_NEWS_API_KEY` is optional because the app falls back to a public spaceflight news source.

## Run Locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
