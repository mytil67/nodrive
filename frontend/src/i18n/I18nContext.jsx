import { createContext, useContext, useState, useCallback } from 'react';
import { translations } from './translations.js';

const I18nContext = createContext();

function detectLanguage() {
  const stored = localStorage.getItem('nodrive-lang');
  if (stored && translations[stored]) return stored;
  const nav = navigator.language?.slice(0, 2);
  return nav === 'fr' ? 'fr' : 'en';
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(detectLanguage);

  const setLang = useCallback((l) => {
    localStorage.setItem('nodrive-lang', l);
    setLangState(l);
  }, []);

  const t = useCallback((key, params) => {
    let str = translations[lang]?.[key] || translations.fr[key] || key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        str = str.replace(`{${k}}`, v);
      }
    }
    return str;
  }, [lang]);

  const toggle = useCallback(() => {
    setLang(lang === 'fr' ? 'en' : 'fr');
  }, [lang, setLang]);

  return (
    <I18nContext.Provider value={{ lang, t, toggle }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
