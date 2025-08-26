let allArticles = [];
let displayedCount = 0;
const perPage = 30;

const supabaseUrl = "https://lcqvsevemstgtdncqoki.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxjcXZzZXZlbXN0Z3RkbmNxb2tpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwMzA0NjYsImV4cCI6MjA3MTYwNjQ2Nn0.sypEbNQyt_ybOUTH0cf4typ6IOG7VyjtBtrWx1COaUw";
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);



const languageMap = {
  "hu-HU": "magyar",
  "en-GB": "angol",
  "en-US": "angol",
  "en": "angol",
  "de-DE": "német",
  "fr-FR": "francia",
  "es-ES": "spanyol",
  "it-IT": "olasz",
};

function normalizeLanguage(code) {
  if (!code) return code;
  const c = code.toLowerCase().trim();
  return languageMap[c] ?? (c.startsWith("hu") ? "magyar" : c.startsWith("en") ? "angol" : c);
}

// Dark mode
const toggleBtn = document.getElementById("darkModeToggle");
const logo = document.querySelector(".logo");
function applyTheme(mode) {
  if (mode === "dark") {
    document.body.classList.add("dark");
    toggleBtn.textContent = "☀";
    logo.src = "images/wtn-logo2-white.png";
  } else {
    document.body.classList.remove("dark");
    toggleBtn.textContent = "☾";
    logo.src = "images/wtn-logo2.png";
  }
  localStorage.setItem("theme", mode);
}
applyTheme(localStorage.getItem("theme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
toggleBtn.addEventListener("click", () => applyTheme(document.body.classList.contains("dark") ? "light" : "dark"));

// Version / Build
document.getElementById("buildInfo").textContent = `Verzió: v0.1 | Build: ${new Date().toLocaleString("hu-HU")}`;

// Load articles
async function loadArticles() {
  try {
    const { data, error } = await supabase
      .from("articles")
      .select("id, title, summary, content, url, image_url, published_at, language, source_id, sources:source_id(site_name)")
      .order("published_at", { ascending: false });
    if (error) throw error;

    allArticles = data ?? [];
    displayedCount = 0;

    populateLanguageFilter();
    populateSourceFilter();
    renderArticles(true);
  } catch (err) {
    console.error("Hiba a hírek betöltésénél:", err);
  }
}

function populateLanguageFilter() {
  const select = document.getElementById("languageFilter");
  if (!select) return;

  select.innerHTML = '<option value="">Összes nyelv</option>';

  // Normalize + csak érvényes értékek
  const langs = allArticles
    .map(a => normalizeLanguage(a.language))
    .filter(Boolean); // kiszűri a null/undefined értékeket

  // Egyedi értékek tömbbé alakítása
  const uniqueLangs = Array.from(new Set(langs));

  // ABC sorrend (magyar ékezetek figyelembevételével)
  uniqueLangs.sort((a, b) => a.localeCompare(b, 'hu', { sensitivity: 'base' }));

  // Feltöltés
  uniqueLangs.forEach(lang => {
    const option = document.createElement("option");
    option.value = lang;
    option.textContent = lang; // itt már a normalizeLanguage adja a végső "English" vagy "Magyar" formát
    select.appendChild(option);
  });
}

function populateSourceFilter() {
  const select = document.getElementById("sourceFilter");
  if (!select) return;

  select.innerHTML = '<option value="">Összes forrás</option>';

  // egyedi források tömbbé alakítása
  const sources = [...new Set(allArticles
    .map(a => a.sources?.site_name)
    .filter(Boolean))];

  // ABC sorrend, magyar ékezetek figyelembevételével
  sources.sort((a, b) => a.localeCompare(b, 'hu', { sensitivity: 'base' }));

  // feltöltés
  sources.forEach(src => {
    const option = document.createElement("option");
    option.value = src;
    option.textContent = src;
    select.appendChild(option);
  });
}

// Render
function renderArticles(reset = false) {
  const container = document.getElementById("articles");
  if (!container) return;
  if (reset) { container.innerHTML = ""; displayedCount = 0; }

  const selectedLang = document.getElementById("languageFilter")?.value;
  const selectedSource = document.getElementById("sourceFilter")?.value;

  let filtered = allArticles;
  if (selectedLang) filtered = filtered.filter(a => normalizeLanguage(a.language) === selectedLang);
  if (selectedSource) filtered = filtered.filter(a => a.sources?.site_name === selectedSource);

  if (!filtered.length) { container.innerHTML = "<p>Nincs találat</p>"; return; }

  const toDisplay = filtered.slice(displayedCount, displayedCount + perPage);
  toDisplay.forEach((article, idx) => {
    const div = document.createElement("div");
    div.className = (displayedCount + idx === 0) ? "article featured" : "article";
    div.innerHTML = `
      <a href="${article.url}" target="_blank" class="card-link">
        ${article.image_url ? `<img src="${article.image_url}" alt="${article.title}" class="card-image">` : ""}
        <h2 class="card-title">${article.title ?? "Nincs cím"}</h2>
        <small class="card-meta">
          <b>${article.sources?.site_name ?? "ismeretlen forrás"}</b> | ${new Date(article.published_at).toLocaleString()}
        </small>
        <p class="card-summary">${article.summary ?? article.content ?? ""}</p>
      </a>`;
    container.appendChild(div);
  });

  displayedCount += toDisplay.length;
  const loadMoreBtn = document.getElementById("loadMore");
  if (loadMoreBtn) loadMoreBtn.style.display = displayedCount < filtered.length ? "block" : "none";
}

// Filters
document.getElementById("languageFilter")?.addEventListener("change", () => renderArticles(true));
document.getElementById("sourceFilter")?.addEventListener("change", () => renderArticles(true));
document.getElementById("loadMore")?.addEventListener("click", () => renderArticles(false));

// Initial load
loadArticles();


const menuToggle = document.getElementById("menuToggle");
const mainMenu = document.querySelector(".main-menu");

if (menuToggle && mainMenu) {
  menuToggle.addEventListener("click", () => {
    mainMenu.style.display = mainMenu.style.display === "flex" ? "none" : "flex";
  });
}