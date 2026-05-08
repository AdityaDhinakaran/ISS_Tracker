import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import {
  ArcElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip as ChartTooltip
} from "chart.js";
import { Doughnut, Line } from "react-chartjs-2";
import {
  Bot,
  CalendarDays,
  ExternalLink,
  Loader2,
  MapPin,
  Moon,
  RefreshCw,
  Search,
  Send,
  Sun,
  Trash2,
  Users,
  X
} from "lucide-react";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, ChartTooltip, Legend);

const ISS_POLL_MS = 15000;
const NEWS_TTL_MS = 15 * 60 * 1000;
const MAX_PATH_POINTS = 15;
const MAX_SPEED_POINTS = 30;
const MAX_CHAT_MESSAGES = 30;

const cityHints = [
  { name: "New York, United States", lat: 40.7128, lon: -74.006 },
  { name: "London, United Kingdom", lat: 51.5072, lon: -0.1276 },
  { name: "Tokyo, Japan", lat: 35.6762, lon: 139.6503 },
  { name: "Sydney, Australia", lat: -33.8688, lon: 151.2093 },
  { name: "Mumbai, India", lat: 19.076, lon: 72.8777 },
  { name: "Cape Town, South Africa", lat: -33.9249, lon: 18.4241 },
  { name: "Sao Paulo, Brazil", lat: -23.5558, lon: -46.6396 },
  { name: "Mexico City, Mexico", lat: 19.4326, lon: -99.1332 },
  { name: "Singapore", lat: 1.3521, lon: 103.8198 },
  { name: "Dubai, United Arab Emirates", lat: 25.2048, lon: 55.2708 },
  { name: "Los Angeles, United States", lat: 34.0522, lon: -118.2437 },
  { name: "Auckland, New Zealand", lat: -36.8509, lon: 174.7645 }
];

const categoryConfig = [
  {
    key: "space",
    label: "Space",
    url: "https://api.spaceflightnewsapi.net/v4/articles/?limit=5&ordering=-published_at"
  },
  {
    key: "science",
    label: "Science",
    url: "https://api.spaceflightnewsapi.net/v4/blogs/?limit=5&ordering=-published_at"
  }
];

const fallbackArticles = [
  {
    id: "fallback-1",
    category: "Space",
    title: "ISS dashboard is ready for live tracking",
    source: "Local fallback",
    author: "Dashboard",
    date: new Date().toISOString(),
    image: "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=900&q=80",
    description: "News could not be fetched, so this placeholder keeps the dashboard layout usable.",
    url: "https://www.nasa.gov/international-space-station/"
  },
  {
    id: "fallback-2",
    category: "Science",
    title: "Add a news API key for richer live headlines",
    source: "Local fallback",
    author: "Dashboard",
    date: new Date().toISOString(),
    image: "https://images.unsplash.com/photo-1454789548928-9efd52dc4031?auto=format&fit=crop&w=900&q=80",
    description: "The app supports cached news, search, sorting, refresh, and dashboard-only chat context.",
    url: "https://spaceflightnewsapi.net/"
  }
];

const issIcon = L.divIcon({
  className: "iss-marker",
  html: "<div><span>ISS</span></div>",
  iconSize: [54, 54],
  iconAnchor: [27, 27]
});

function haversineKm(a, b) {
  const earthRadius = 6371;
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function nearestOcean(lat) {
  if (lat > 66) return "Arctic Ocean region";
  if (lat < -55) return "Southern Ocean region";
  if (lat > -35 && lat < 35) return "Equatorial ocean corridor";
  return lat >= 0 ? "Northern ocean corridor" : "Southern ocean corridor";
}

function getNearestPlaceName(lat, lon) {
  const closest = cityHints
    .map((city) => ({ ...city, distance: haversineKm({ lat, lon }, { lat: city.lat, lon: city.lon }) }))
    .sort((a, b) => a.distance - b.distance)[0];
  if (!closest || closest.distance > 1300) return nearestOcean(lat);
  return `Near ${closest.name} (${Math.round(closest.distance)} km away)`;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

async function fetchIssLocation() {
  try {
    const data = await fetchJson("https://api.wheretheiss.at/v1/satellites/25544");
    return {
      lat: Number(data.latitude),
      lon: Number(data.longitude),
      timestamp: Date.now(),
      apiSpeed: Number(data.velocity)
    };
  } catch {
    const data = await fetchJson("http://api.open-notify.org/iss-now.json");
    return {
      lat: Number(data.iss_position.latitude),
      lon: Number(data.iss_position.longitude),
      timestamp: Number(data.timestamp) * 1000
    };
  }
}

async function fetchPeopleInSpace() {
  let data;
  try {
    data = await fetchJson("http://api.open-notify.org/astros.json");
  } catch {
    const proxiedUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent("http://api.open-notify.org/astros.json")}`;
    data = await fetchJson(proxiedUrl);
  }
  return {
    count: data.number,
    people: data.people?.map((person) => `${person.name} (${person.craft})`) ?? []
  };
}

function mapArticle(item, category) {
  return {
    id: `${category}-${item.id ?? item.url ?? item.title}`,
    category,
    title: item.title ?? "Untitled article",
    source: item.news_site ?? item.source?.name ?? "Unknown source",
    author: item.authors?.[0]?.name ?? item.author ?? "Unknown author",
    date: item.published_at ?? item.publishedAt ?? new Date().toISOString(),
    image: item.image_url ?? item.urlToImage ?? "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=900&q=80",
    description: item.summary ?? item.description ?? "No description available.",
    url: item.url
  };
}

async function fetchNewsCategory(category) {
  const cacheKey = `news-cache-${category.key}`;
  const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
  if (cached && Date.now() - cached.savedAt < NEWS_TTL_MS) return cached.articles;

  const apiKey = import.meta.env.VITE_NEWS_API_KEY;
  let articles = [];
  if (apiKey) {
    const newsApiUrl = `https://newsapi.org/v2/everything?q=${encodeURIComponent(category.label)}&pageSize=5&sortBy=publishedAt&apiKey=${apiKey}`;
    const data = await fetchJson(newsApiUrl);
    articles = (data.articles ?? []).slice(0, 5).map((item) => mapArticle(item, category.label));
  } else {
    const data = await fetchJson(category.url);
    articles = (data.results ?? []).slice(0, 5).map((item) => mapArticle(item, category.label));
  }

  localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), articles }));
  return articles;
}

function FitMap({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.setView([position.lat, position.lon], map.getZoom(), { animate: true });
  }, [map, position]);
  return null;
}

function StatCard({ icon: Icon, label, value, subtext }) {
  return (
    <section className="stat-card">
      <Icon size={20} />
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        {subtext ? <span>{subtext}</span> : null}
      </div>
    </section>
  );
}

function SkeletonCard() {
  return (
    <div className="article-card skeleton">
      <div />
      <span />
      <span />
      <span />
    </div>
  );
}

function Toasts({ toasts }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((toast) => (
        <div className={`toast ${toast.type}`} key={toast.id}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}

function Chatbot({ dashboardContext, notify }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [messages, setMessages] = useState(() => {
    return JSON.parse(localStorage.getItem("chat-messages") || "[]");
  });
  const listRef = useRef(null);

  useEffect(() => {
    localStorage.setItem("chat-messages", JSON.stringify(messages.slice(-MAX_CHAT_MESSAGES)));
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  async function askModel(question) {
    const dataText = JSON.stringify(dashboardContext, null, 2).slice(0, 8000);
    const prompt = `<s>[INST] You are a dashboard assistant. Answer ONLY from the dashboard data below. If the answer is not present, say: "I can only answer from the current ISS and news dashboard data." Keep answers short.

Dashboard data:
${dataText}

Question: ${question} [/INST]`;

    const token = import.meta.env.VITE_AI_TOKEN;
    if (!token) return localAnswer(question, dashboardContext);

    try {
      const data = await fetchJson("https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: { max_new_tokens: 180, temperature: 0.2, return_full_text: false }
        })
      });
      return data?.[0]?.generated_text?.trim() || localAnswer(question, dashboardContext);
    } catch {
      return localAnswer(question, dashboardContext);
    }
  }

  async function sendMessage(event) {
    event?.preventDefault();
    const question = input.trim();
    if (!question) return;
    setInput("");
    setMessages((current) => [...current, { role: "user", content: question }].slice(-MAX_CHAT_MESSAGES));
    setTyping(true);
    const answer = await askModel(question);
    setTyping(false);
    setMessages((current) => [...current, { role: "assistant", content: answer }].slice(-MAX_CHAT_MESSAGES));
  }

  function clearChat() {
    setMessages([]);
    notify("Chat history cleared", "success");
  }

  return (
    <>
      <button className="chat-fab" onClick={() => setOpen((value) => !value)} aria-label="Open chatbot">
        {open ? <X /> : <Bot />}
      </button>
      {open ? (
        <aside className="chat-window">
          <header>
            <div>
              <strong>Dashboard AI</strong>
              <span>Answers only from ISS and news data</span>
            </div>
            <button onClick={clearChat} aria-label="Clear chat">
              <Trash2 size={17} />
            </button>
          </header>
          <div className="chat-messages" ref={listRef}>
            {messages.length === 0 ? (
              <p className="empty-chat">Ask about ISS speed, current position, astronauts, article count, or news summaries.</p>
            ) : null}
            {messages.map((message, index) => (
              <div className={`chat-bubble ${message.role}`} key={`${message.role}-${index}`}>
                {message.content}
              </div>
            ))}
            {typing ? <div className="typing">Typing...</div> : null}
          </div>
          <form onSubmit={sendMessage}>
            <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask from dashboard data..." />
            <button type="submit" aria-label="Send message">
              <Send size={18} />
            </button>
          </form>
        </aside>
      ) : null}
    </>
  );
}

function localAnswer(question, context) {
  const q = question.toLowerCase();
  if (q.includes("speed")) return `The current ISS speed is ${Math.round(context.iss.speed || 0).toLocaleString()} km/h.`;
  if (q.includes("latitude") || q.includes("longitude") || q.includes("location") || q.includes("iss")) {
    return `The ISS is at latitude ${context.iss.latitude?.toFixed(3)}, longitude ${context.iss.longitude?.toFixed(3)}, currently ${context.iss.place}.`;
  }
  if (q.includes("astronaut") || q.includes("people")) {
    return `There are ${context.people.count ?? "unknown"} people in space: ${(context.people.names ?? []).join(", ") || "names unavailable"}.`;
  }
  if (q.includes("article") || q.includes("news")) {
    const titles = context.news.articles.map((article) => article.title).slice(0, 5).join("; ");
    return `The dashboard has ${context.news.count} articles. Recent titles: ${titles || "none loaded yet"}.`;
  }
  return "I can only answer from the current ISS and news dashboard data.";
}

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");
  const [positions, setPositions] = useState([]);
  const [speedData, setSpeedData] = useState([]);
  const [issError, setIssError] = useState("");
  const [people, setPeople] = useState({ count: 0, people: [] });
  const [peopleError, setPeopleError] = useState("");
  const [news, setNews] = useState([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsError, setNewsError] = useState("");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("date");
  const [activeCategory, setActiveCategory] = useState("All");
  const [toasts, setToasts] = useState([]);
  const [refreshingCategory, setRefreshingCategory] = useState("");

  const currentPosition = positions.at(-1);
  const previousPosition = positions.at(-2);
  const calculatedSpeed = currentPosition?.speed ?? 0;
  const place = currentPosition ? getNearestPlaceName(currentPosition.lat, currentPosition.lon) : "Locating ISS...";

  function notify(message, type = "info") {
    const id = crypto.randomUUID();
    setToasts((current) => [...current, { id, message, type }]);
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 3200);
  }

  async function updateIss(manual = false) {
    try {
      const next = await fetchIssLocation();
      setIssError("");
      setPositions((current) => {
        const last = current.at(-1);
        const elapsedHours = last ? (next.timestamp - last.timestamp) / 3600000 : 0;
        const speed =
          last && elapsedHours >= 0.002
            ? haversineKm(last, next) / elapsedHours
            : next.apiSpeed ?? last?.speed ?? 0;
        const withSpeed = { ...next, speed };
        setSpeedData((values) => [...values, { time: next.timestamp, speed }].slice(-MAX_SPEED_POINTS));
        return [...current, withSpeed].slice(-MAX_PATH_POINTS);
      });
      if (manual) notify("ISS position refreshed", "success");
    } catch (error) {
      setIssError("Could not fetch ISS position. Try again.");
      if (manual) notify("ISS refresh failed", "error");
    }
  }

  async function updatePeople() {
    try {
      const data = await fetchPeopleInSpace();
      setPeople(data);
      setPeopleError("");
    } catch {
      setPeopleError("People-in-space API is unavailable in this browser session.");
    }
  }

  async function loadNews(forceCategoryKey) {
    setNewsLoading(true);
    setNewsError("");
    try {
      const categories = forceCategoryKey
        ? categoryConfig.filter((category) => category.key === forceCategoryKey)
        : categoryConfig;
      if (forceCategoryKey) localStorage.removeItem(`news-cache-${forceCategoryKey}`);
      const results = await Promise.all(categories.map(fetchNewsCategory));
      const nextArticles = results.flat();
      setNews((current) => {
        if (!forceCategoryKey) return nextArticles;
        const categoryLabel = categoryConfig.find((category) => category.key === forceCategoryKey)?.label;
        return [...current.filter((article) => article.category !== categoryLabel), ...nextArticles];
      });
      notify(forceCategoryKey ? "Category refreshed" : "News loaded", "success");
    } catch {
      setNewsError("Could not fetch live news. Showing local fallback articles.");
      setNews((current) => (current.length ? current : fallbackArticles));
    } finally {
      setNewsLoading(false);
      setRefreshingCategory("");
    }
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    updateIss();
    updatePeople();
    loadNews();
    const timer = setInterval(updateIss, ISS_POLL_MS);
    return () => clearInterval(timer);
  }, []);

  const filteredNews = useMemo(() => {
    return news
      .filter((article) => activeCategory === "All" || article.category === activeCategory)
      .filter((article) => {
        const text = `${article.title} ${article.source} ${article.author} ${article.description}`.toLowerCase();
        return text.includes(query.toLowerCase());
      })
      .sort((a, b) => {
        if (sortBy === "source") return a.source.localeCompare(b.source);
        return new Date(b.date) - new Date(a.date);
      });
  }, [news, query, sortBy, activeCategory]);

  const newsDistribution = useMemo(() => {
    const labels = ["Space", "Science"];
    const counts = labels.map((label) => news.filter((article) => article.category === label).length);
    return {
      labels,
      datasets: [
        {
          data: counts,
          backgroundColor: ["#2dd4bf", "#f97316"],
          borderWidth: 0
        }
      ]
    };
  }, [news]);

  const speedChartData = {
    labels: speedData.map((point) => new Date(point.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })),
    datasets: [
      {
        label: "ISS Speed (km/h)",
        data: speedData.map((point) => Math.round(point.speed)),
        borderColor: "#38bdf8",
        backgroundColor: "rgba(56, 189, 248, 0.18)",
        tension: 0.35,
        fill: false
      }
    ]
  };

  const dashboardContext = {
    iss: {
      latitude: currentPosition?.lat,
      longitude: currentPosition?.lon,
      speed: calculatedSpeed,
      place,
      positionsTracked: positions.length,
      lastUpdated: currentPosition ? formatDate(currentPosition.timestamp) : null
    },
    people: {
      count: people.count,
      names: people.people
    },
    news: {
      count: news.length,
      articles: news.map(({ title, source, author, date, category, description }) => ({
        title,
        source,
        author,
        date,
        category,
        description
      }))
    }
  };

  return (
    <main className="app-shell">
      <Toasts toasts={toasts} />
      <header className="topbar">
        <div>
          <p className="eyebrow">Live orbital intelligence</p>
          <h1>ISS Orbit News Dashboard</h1>
        </div>
        <button className="theme-toggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          {theme === "dark" ? "Light" : "Dark"}
        </button>
      </header>

      <section className="stats-grid">
        <StatCard icon={MapPin} label="Latitude / Longitude" value={currentPosition ? `${currentPosition.lat.toFixed(3)}, ${currentPosition.lon.toFixed(3)}` : "Loading..."} subtext={currentPosition ? formatDate(currentPosition.timestamp) : "Fetching live position"} />
        <StatCard icon={RefreshCw} label="ISS Speed" value={`${Math.round(calculatedSpeed).toLocaleString()} km/h`} subtext={previousPosition ? "Calculated with Haversine formula" : "Waiting for second point"} />
        <StatCard icon={MapPin} label="Current Location" value={place} subtext={`${positions.length} positions tracked`} />
        <StatCard icon={Users} label="People In Space" value={people.count || "Unavailable"} subtext={people.people.slice(0, 2).join(", ") || peopleError || "Fetching astronauts"} />
      </section>

      <section className="dashboard-grid">
        <div className="panel map-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">ISS live tracking</p>
              <h2>Interactive Map</h2>
            </div>
            <button onClick={() => updateIss(true)}>
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>
          {issError ? (
            <div className="error-box">
              {issError}
              <button onClick={() => updateIss(true)}>Retry</button>
            </div>
          ) : null}
          <div className="map-frame">
            <MapContainer center={[0, 0]} zoom={3} minZoom={2} scrollWheelZoom className="leaflet-map">
              <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {currentPosition ? (
                <>
                  <FitMap position={currentPosition} />
                  <Marker position={[currentPosition.lat, currentPosition.lon]} icon={issIcon}>
                    <Tooltip permanent direction="top">
                      ISS: {currentPosition.lat.toFixed(2)}, {currentPosition.lon.toFixed(2)}
                    </Tooltip>
                  </Marker>
                  <Polyline positions={positions.map((point) => [point.lat, point.lon])} color="#38bdf8" weight={3} />
                </>
              ) : null}
            </MapContainer>
          </div>
        </div>

        <div className="panel chart-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Last 30 measurements</p>
              <h2>ISS Speed Trend</h2>
            </div>
          </div>
          <Line
            data={speedChartData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: { y: { ticks: { callback: (value) => `${value}` } } }
            }}
          />
        </div>
      </section>

      <section className="news-layout">
        <div className="panel">
          <div className="panel-header news-heading">
            <div>
              <p className="eyebrow">Latest articles</p>
              <h2>News Dashboard</h2>
            </div>
            <div className="category-actions">
              {categoryConfig.map((category) => (
                <button
                  key={category.key}
                  onClick={() => {
                    setRefreshingCategory(category.key);
                    loadNews(category.key);
                  }}
                >
                  {refreshingCategory === category.key ? <Loader2 className="spin" size={15} /> : <RefreshCw size={15} />}
                  {category.label}
                </button>
              ))}
            </div>
          </div>
          <div className="filters">
            <label>
              <Search size={17} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search articles..." />
            </label>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
              <option value="date">Sort by date</option>
              <option value="source">Sort by source</option>
            </select>
            <select value={activeCategory} onChange={(event) => setActiveCategory(event.target.value)}>
              <option>All</option>
              <option>Space</option>
              <option>Science</option>
            </select>
          </div>
          {newsError ? (
            <div className="error-box">
              {newsError}
              <button onClick={() => loadNews()}>Retry</button>
            </div>
          ) : null}
          <div className="articles-grid">
            {newsLoading ? Array.from({ length: 4 }, (_, index) => <SkeletonCard key={index} />) : null}
            {!newsLoading &&
              filteredNews.map((article) => (
                <article className="article-card" key={article.id}>
                  <img src={article.image} alt="" loading="lazy" />
                  <div>
                    <span className="category-pill">{article.category}</span>
                    <h3>{article.title}</h3>
                    <p>{article.description}</p>
                    <div className="article-meta">
                      <span>{article.source}</span>
                      <span>{article.author}</span>
                      <span>
                        <CalendarDays size={14} />
                        {formatDate(article.date)}
                      </span>
                    </div>
                    <a href={article.url} target="_blank" rel="noreferrer">
                      Read More <ExternalLink size={15} />
                    </a>
                  </div>
                </article>
              ))}
          </div>
        </div>

        <div className="panel distribution-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Clickable filter</p>
              <h2>News Distribution</h2>
            </div>
          </div>
          <Doughnut
            data={newsDistribution}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              onClick: (_, elements) => {
                if (elements.length) setActiveCategory(newsDistribution.labels[elements[0].index]);
              },
              plugins: { legend: { position: "bottom" } }
            }}
          />
          <button className="clear-filter" onClick={() => setActiveCategory("All")}>Show all articles</button>
        </div>
      </section>

      <section className="panel people-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Open Notify astronauts endpoint</p>
            <h2>People in Space Right Now</h2>
          </div>
          <button onClick={updatePeople}>
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
        {peopleError ? <div className="error-box">{peopleError}<button onClick={updatePeople}>Retry</button></div> : null}
        <div className="astronaut-list">
          {people.people.length ? people.people.map((name) => <span key={name}>{name}</span>) : <span>Names unavailable until API responds.</span>}
        </div>
      </section>

      <Chatbot dashboardContext={dashboardContext} notify={notify} />
    </main>
  );
}
