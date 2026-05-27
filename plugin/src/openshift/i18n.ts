import i18next, { i18n as I18nInstance } from 'i18next';
import { getI18n } from 'react-i18next';

const fallbackI18n = i18next.createInstance();
void fallbackI18n.init({ fallbackLng: 'en' });

const resolveI18n = (): I18nInstance => getI18n() ?? fallbackI18n;

// Kiali code imports `i18n` directly, but OSSMC relies on the react-i18next instance
// provided by the OpenShift console. Delegating here keeps helper-based translations
// in sync with the active UI language instead of falling back to English.
export const i18n = new Proxy(fallbackI18n as I18nInstance, {
  get: (_target, prop) => {
    const activeI18n = resolveI18n() as unknown as object;
    const value = Reflect.get(activeI18n, prop);
    return typeof value === 'function' ? value.bind(activeI18n) : value;
  }
}) as I18nInstance;
