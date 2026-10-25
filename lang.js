// Language support, shared by every page.
// Pages load translations.js, then this file, before their other scripts.
//
// How it works:
// - In the HTML, text marked with data-i18n="some-key" is replaced with
//   TRANSLATIONS[language]["some-key"] from translations.js.
// - In JavaScript, t("English text") returns the translation of that English text.
// - Anything that has no translation yet simply stays in English.

const LANGUAGES = {
  en: "English",
  es: "Español",
  fr: "Français",
  ar: "العربية",
  zh: "中文",
  ur: "اردو",
  ko: "한국어"
};

// Arabic and Urdu are written right to left, so the page layout flips for them.
const RIGHT_TO_LEFT = ["ar", "ur"];

// The chosen language is remembered on this device only (in localStorage), so it stays
// the same when moving between pages. Some browsers block storage, so this can fail.
function savedLanguage() {
  try {
    const saved = localStorage.getItem("language");
    return LANGUAGES[saved] ? saved : null;
  } catch {
    return null;
  }
}

function saveLanguage(code) {
  try {
    localStorage.setItem("language", code);
  } catch {
    // Storage is blocked; the choice just won't be remembered.
  }
}

// On a first visit, use the browser's language if we have it ("es-US" becomes "es").
function browserLanguage() {
  const code = (navigator.language || "en").slice(0, 2).toLowerCase();
  return LANGUAGES[code] ? code : "en";
}

const currentLanguage = savedLanguage() ?? browserLanguage();

// Translate an English sentence. {name} spots are filled in from values, for example
// t("Call {number}", { number: "603-555-0100" }) gives "Llame al 603-555-0100" in Spanish.
function t(english, values = {}) {
  const text = TRANSLATIONS[currentLanguage]?.[english] ?? english;
  return text.replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match);
}

// Swap the page's marked text for the chosen language.
function translatePage() {
  document.documentElement.lang = currentLanguage === "zh" ? "zh-Hans" : currentLanguage;
  document.documentElement.dir = RIGHT_TO_LEFT.includes(currentLanguage) ? "rtl" : "ltr";
  const words = TRANSLATIONS[currentLanguage];
  if (!words) {
    return; // English: the page is already written in English.
  }
  for (const element of document.querySelectorAll("[data-i18n]")) {
    const text = words[element.dataset.i18n];
    // Translations come from our own translations.js file, so they may safely
    // include bold text and links.
    if (text) {
      element.innerHTML = text;
    }
  }
  for (const element of document.querySelectorAll("[data-i18n-placeholder]")) {
    const text = words[element.dataset.i18nPlaceholder];
    if (text) {
      element.placeholder = text;
    }
  }
  for (const element of document.querySelectorAll("[data-i18n-label]")) {
    const text = words[element.dataset.i18nLabel];
    if (text) {
      element.setAttribute("aria-label", text);
    }
  }
}

// Add the language menu to the end of the top navigation bar.
function addLanguagePicker() {
  const nav = document.querySelector(".site-nav");
  if (!nav) {
    return;
  }
  const picker = document.createElement("label");
  picker.className = "language-picker";

  const globe = document.createElement("span");
  globe.setAttribute("aria-hidden", "true");
  globe.textContent = "🌐";

  // Screen readers hear "Language" in every language, so anyone can find it.
  const name = document.createElement("span");
  name.className = "visually-hidden";
  name.textContent = "Language / Idioma / Langue / اللغة / 语言 / زبان / 언어";

  const select = document.createElement("select");
  for (const [code, label] of Object.entries(LANGUAGES)) {
    const option = document.createElement("option");
    option.value = code;
    option.lang = code === "zh" ? "zh-Hans" : code;
    option.textContent = label;
    option.selected = code === currentLanguage;
    select.append(option);
  }
  select.addEventListener("change", () => {
    saveLanguage(select.value);
    // Reload so every part of the page, including the map and results, is redrawn in the new language.
    window.location.reload();
  });

  picker.append(globe, name, select);
  nav.append(picker);
}

translatePage();
addLanguagePicker();
