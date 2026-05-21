import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en';
import zh from './locales/zh';
import ms from './locales/ms';
import ar from './locales/ar';
import fa from './locales/fa';
import hi from './locales/hi';

// Initialize i18next
i18n
  .use(initReactI18next)
  .init({
    resources: {
      en, zh, ms, ar, fa, hi
    },
    lng: localStorage.getItem('a11y-language') || 'en', // Default language
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false // React already escapes values
    }
  });

// Handle RTL direction dynamically
i18n.on('languageChanged', (lng) => {
  localStorage.setItem('a11y-language', lng);
  const rtlLanguages = ['ar', 'fa'];
  document.documentElement.dir = rtlLanguages.includes(lng) ? 'rtl' : 'ltr';
});

// Set initial direction
const initialLng = localStorage.getItem('a11y-language') || 'en';
if (['ar', 'fa'].includes(initialLng)) {
  document.documentElement.dir = 'rtl';
}

export default i18n;
