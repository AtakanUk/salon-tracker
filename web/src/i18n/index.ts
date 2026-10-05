import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import tr from './tr.json';
import de from './de.json';
import en from './en.json';

const SUPPORTED = ['tr', 'de', 'en'];

/** Before anyone signs in: the last language used on this device, else the browser's. */
function initialLanguage(): string {
  const saved = localStorage.getItem('lang');
  if (saved && SUPPORTED.includes(saved)) return saved;
  const browser = navigator.language.slice(0, 2).toLowerCase();
  return SUPPORTED.includes(browser) ? browser : 'en';
}

i18n.use(initReactI18next).init({
  resources: {
    tr: { translation: tr },
    de: { translation: de },
    en: { translation: en },
  },
  lng: initialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (lang) => {
  localStorage.setItem('lang', lang);
  document.documentElement.lang = lang;
});

export default i18n;
