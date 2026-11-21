import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'

// English only for now; every user-facing string goes through a key so more
// languages can be added by adding resource files.
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: 'en',
  fallbackLng: 'en',
  initAsync: false,
  interpolation: { escapeValue: false }, // React already escapes output
})

export default i18n
