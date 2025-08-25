let allArticles = [];
let displayedCount = 0;
const perPage = 30;

const supabaseUrl = "https://lcqvsevemstgtdncqoki.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxjcXZzZXZlbXN0Z3RkbmNxb2tpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwMzA0NjYsImV4cCI6MjA3MTYwNjQ2Nn0.sypEbNQyt_ybOUTH0cf4typ6IOG7VyjtBtrWx1COaUw"; 
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

const languageMap = {
  hu: "magyar",
  en: "angol",
  de: "német",
  fr: "francia",
  es: "spanyol",
  it: "olasz"
  // bővíthető
};


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
    renderArticles(true);
  } catch (err) {
    console.error("Hiba a hírek betöltésénél:", err);
  }
}

function populateLanguageFilter() {
  // normalizált nyelvek
  const langs = [...new Set(allArticles
    .map(a => a.language?.split("-")[0]) // csak az első rész pl. en-GB -> en
    .filter(Boolean)
  )];

  const select = document.getElementById("languageFilter");
  select.innerHTML = '<option value="">Összes nyelv</option>';

  langs.forEach(l => {
    const option = document.createElement("option");
    option.value = l;
    option.textContent = languageMap[l] || l; // ha nincs fordítás, marad kód
    select.appendChild(option);
  });
}

function renderArticles(reset=false) {
  const container = document.getElementById("articles");
  if (reset) {
    container.innerHTML = "";
    displayedCount = 0;
  }

  const selectedLang = document.getElementById("languageFilter").value;
  const filtered = selectedLang 
    ? allArticles.filter(a => a.language?.startsWith(selectedLang))
    : allArticles;

  const toDisplay = filtered.slice(displayedCount, displayedCount + perPage);

  toDisplay.forEach((article, index) => {
    const div = document.createElement("div");
    // Az **aktuális megjelenő lista első elemét** kiemeljük
    div.className = (displayedCount + index === 0) ? "article featured" : "article";

    div.innerHTML = `
      <a href="${article.url}" target="_blank">
        ${article.image_url ? `<img src="${article.image_url}" alt="${article.title}">` : ""}
        <h2>${article.title ?? "Nincs cím"}</h2>
        <small><b>${article.sources?.site_name ?? "ismeretlen forrás"}</b> | ${new Date(article.published_at).toLocaleString()}</small>
        <p>${article.summary ?? article.content ?? ""}</p>
      </a>
    `;
    container.appendChild(div);
  });

  displayedCount += toDisplay.length;
  document.getElementById("loadMore").style.display = displayedCount < filtered.length ? "block" : "none";
}

document.getElementById("languageFilter").addEventListener("change", () => renderArticles(true));
document.getElementById("loadMore").addEventListener("click", () => renderArticles());
loadArticles();

const toggleBtn = document.getElementById("darkModeToggle");
const logo = document.getElementById("logo");

function setTheme(mode) {
  if (mode === "dark") {
    document.body.classList.add("dark");
    toggleBtn.textContent = "☀️";
    logo.src = "https://img.icons8.com/ios-filled/50/ffffff/news.png"; // fehér ikon darkhoz
  } else {
    document.body.classList.remove("dark");
    toggleBtn.textContent = "🌙";
    logo.src = "https://img.icons8.com/ios-filled/50/000000/news.png"; // fekete ikon lighthoz
  }
  localStorage.setItem("theme", mode);
}

// Gomb esemény
toggleBtn.addEventListener("click", () => {
  const isDark = document.body.classList.contains("dark");
  setTheme(isDark ? "light" : "dark");
});

// Betöltéskor
const savedTheme = localStorage.getItem("theme") || "light";
setTheme(savedTheme);
