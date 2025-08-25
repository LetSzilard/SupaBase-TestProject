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
  "de-DE": "német",
  "fr-FR": "francia",
  "es-ES": "spanyol",
  "it-IT": "olasz",
};

// Nyelv normalizáló függvény
function normalizeLanguage(code) {
  if (!code) return code;

  const c = code.toLowerCase();

  // Magyarok
  if (c.startsWith("hu")) return "magyar";

  // Angolok
  if (c.startsWith("en")) return "angol";

  // Egyéb nyelvek: most nem kezeljük, csak a kódot adjuk vissza
  return code;
}

const toggleBtn = document.getElementById("darkModeToggle");
const logo = document.querySelector(".logo");

function applyTheme(mode) {
  if(mode === "dark") {
    document.body.classList.add("dark");
    toggleBtn.textContent = "☀️";
    logo.src = "https://img.icons8.com/ios-filled/50/ffffff/news.png";
  } else {
    document.body.classList.remove("dark");
    toggleBtn.textContent = "🌙";
    logo.src = "https://img.icons8.com/ios-filled/50/000000/news.png";
  }
  localStorage.setItem("theme", mode);
}

// oldal betöltéskor
const savedTheme = localStorage.getItem("theme");
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
applyTheme(savedTheme || (prefersDark ? "dark" : "light"));

// gomb esemény
toggleBtn.addEventListener("click", () => {
  const isDark = document.body.classList.contains("dark");
  applyTheme(isDark ? "light" : "dark");
});



// Verzió és build dátum megjelenítése
const version = "v0.1"; // ezt te állítod kézzel
const buildDate = new Date().toLocaleString("hu-HU");
document.getElementById("buildInfo").textContent = `Verzió: ${version} | Build: ${buildDate}`;


async function loadArticles() {
  try {
    const { data, error } = await supabase
      .from("articles")
      .select("id, title, summary, content, url, image_url, published_at, language, source_id, sources:source_id(site_name, category)")
      .order("published_at", { ascending: false });

    if (error) throw error;
    allArticles = data ?? [];
    displayedCount = 0;

    populateLanguageFilter();
    populateCategoryFilter();
    populateSourceFilter();
    renderArticles(true);
  } catch (err) {
    console.error("Hiba a hírek betöltésénél:", err);
  }
}

function populateLanguageFilter() {
  const select = document.getElementById("languageFilter");
  select.innerHTML = '<option value="">Összes nyelv</option>';

  // Normalizáljuk az összes cikk nyelvét
  const langs = [...new Set(allArticles.map(a => normalizeLanguage(a.language)).filter(Boolean))];

  langs.forEach(lang => {
    const option = document.createElement("option");
    option.value = lang;
    option.textContent = lang.charAt(0).toUpperCase() + lang.slice(1);
    select.appendChild(option);
  });
}

function populateCategoryFilter() {
  const select = document.getElementById("categoryFilter");
  select.innerHTML = '<option value="">Összes kategória</option>';

  const categories = [...new Set(allArticles.map(a => a.sources?.category).filter(Boolean))];
  categories.forEach(cat => {
    const option = document.createElement("option");
    option.value = cat;
    option.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
    select.appendChild(option);
  });
}

// Feltöltjük a forrás szűrőt
function populateSourceFilter() {
  const filter = document.getElementById("sourceFilter");
  filter.innerHTML = '<option value="">Összes forrás</option>';

  // Összes egyedi forrás
  const sources = [...new Set(allArticles.map(a => a.sources?.site_name).filter(Boolean))];

  sources.forEach(src => {
    const option = document.createElement("option");
    option.value = src;
    option.textContent = src;
    filter.appendChild(option);
  });
}

function renderArticles(reset=false) {
  const container = document.getElementById("articles");
  if (reset) {
    container.innerHTML = "";
    displayedCount = 0;
  }

  const selectedLang = document.getElementById("languageFilter").value;
  const selectedCategory = document.getElementById("categoryFilter").value;
  const selectedSource = document.getElementById("sourceFilter").value;

  let filtered = allArticles;
  if (selectedLang) filtered = filtered.filter(a => a.language === selectedLang);
  if (selectedCategory) filtered = filtered.filter(a => a.sources?.category === selectedCategory);
  if (selectedSource) filtered = filtered.filter(a => a.sources?.site_name === selectedSource);

  const toDisplay = filtered.slice(displayedCount, displayedCount + perPage);
  toDisplay.forEach((article, index) => {
    const div = document.createElement("div");
    div.className = (displayedCount + index === 0) ? "article featured" : "article";

    div.innerHTML = `
      <a href="${article.url}" target="_blank" class="card-link">
        ${article.image_url ? `<img src="${article.image_url}" alt="${article.title}" class="card-image">` : ""}
        <h2 class="card-title">${article.title ?? "Nincs cím"}</h2>
        <small class="card-meta">
          <b>${article.sources?.site_name ?? "ismeretlen forrás"}</b> | ${new Date(article.published_at).toLocaleString()}
        </small>
        <p class="card-summary">
          ${article.summary ?? article.content ?? ""}
        </p>
      </a>
    `;
    container.appendChild(div);
  });

  displayedCount += toDisplay.length;
  document.getElementById("loadMore").style.display = displayedCount < filtered.length ? "block" : "none";
}

// Esemény figyelők
document.getElementById("languageFilter").addEventListener("change", () => renderArticles(true));
document.getElementById("categoryFilter").addEventListener("change", () => renderArticles(true));
document.getElementById("sourceFilter").addEventListener("change", () => renderArticles(true));

// Betöltéskor
populateSourceFilter();
loadArticles(true);

// function renderArticles(reset = false) {
//   const container = document.getElementById("articles");
//   if (reset) {
//     container.innerHTML = "";
//     displayedCount = 0;
//   }

//   const selectedLang = document.getElementById("languageFilter").value;
//   const selectedCategory = document.getElementById("categoryFilter").value;

//   const filtered = allArticles.filter(article => {
//     const articleLang = normalizeLanguage(article.language);
//     const langMatch = !selectedLang || articleLang === selectedLang;
//     const categoryMatch = !selectedCategory || article.sources?.category === selectedCategory;
//     return langMatch && categoryMatch;
//   });

//   const toDisplay = filtered.slice(displayedCount, displayedCount + perPage);

//   toDisplay.forEach((article, index) => {
//     const div = document.createElement("div");
//     div.className = (displayedCount + index === 0) ? "article featured" : "article";

//     div.innerHTML = `
//       <a href="${article.url}" target="_blank">
//         ${article.image_url ? `<img src="${article.image_url}" alt="${article.title}">` : ""}
//         <h2>${article.title ?? "Nincs cím"}</h2>
//         <small><b>${article.sources?.site_name ?? "ismeretlen forrás"}</b> | ${new Date(article.published_at).toLocaleString()}</small>
//         <p>${article.summary ?? article.content ?? ""}</p>
//       </a>
//     `;
//     container.appendChild(div);
//   });

//   displayedCount += toDisplay.length;
//   document.getElementById("loadMore").style.display = displayedCount < filtered.length ? "block" : "none";
// }

// document.getElementById("languageFilter").addEventListener("change", () => renderArticles(true));
// document.getElementById("categoryFilter").addEventListener("change", () => renderArticles(true));
// document.getElementById("loadMore").addEventListener("click", () => renderArticles());
// loadArticles();

// const toggleBtn = document.getElementById("darkModeToggle");
// const logo = document.getElementById("logo");

// function setTheme(mode) {
//   if (mode === "dark") {
//     document.body.classList.add("dark");
//     toggleBtn.textContent = "☀️";
//     logo.src = "https://img.icons8.com/ios-filled/50/ffffff/news.png"; // fehér ikon darkhoz
//   } else {
//     document.body.classList.remove("dark");
//     toggleBtn.textContent = "🌙";
//     logo.src = "https://img.icons8.com/ios-filled/50/000000/news.png"; // fekete ikon lighthoz
//   }
//   localStorage.setItem("theme", mode);
// }

// // Gomb esemény
// toggleBtn.addEventListener("click", () => {
//   const isDark = document.body.classList.contains("dark");
//   setTheme(isDark ? "light" : "dark");
// });

// // Betöltéskor
// const savedTheme = localStorage.getItem("theme") || "light";
// setTheme(savedTheme);

// Automatikus verzió és build dátum
(async function() {
  // Lekérjük a legutóbbi commit dátumát és hash-t a GitHub API-ból
  const repoUser = "felhasznalonev";  // GitHub felhasználó
  const repoName = "rss-hirek";       // repo név
  try {
    const res = await fetch(`https://api.github.com/repos/${repoUser}/${repoName}/commits?per_page=1`);
    const data = await res.json();
    if (data && data.length) {
      const commit = data[0];
      const commitHash = commit.sha.slice(0,7);
      const commitDate = new Date(commit.commit.author.date).toLocaleString("hu-HU");
      document.getElementById("buildInfo").textContent = `Verzió: ${commitHash} | Build: ${commitDate}`;
    }
  } catch(e) {
    console.error("Verzió info lekérése sikertelen:", e);
  }
})();
