import { expect, afterEach, rs } from '@rstest/core';
import { cleanup } from '@testing-library/react';
import * as jestDomMatchers from '@testing-library/jest-dom/matchers';
import type { ReactNode } from 'react';

expect.extend(jestDomMatchers);

afterEach(() => {
  cleanup();
});

// Pass translation keys through as-is so tests assert on English source strings.
const makeTFunction =
  () =>
  (key: string, opts?: Record<string, unknown>): string => {
    if (!opts) return key;
    return Object.entries(opts).reduce<string>(
      (str, [k, v]) => str.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v)),
      key
    );
  };

rs.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: makeTFunction(),
    i18n: { language: 'en', changeLanguage: () => Promise.resolve() }
  }),
  Trans: ({ children, i18nKey }: { children?: ReactNode; i18nKey?: string }) =>
    children ? <>{children}</> : <>{i18nKey}</>,
  initReactI18next: { type: '3rdParty', init: () => {} }
}));

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
global.ResizeObserver = ResizeObserverStub;

Object.defineProperty(window, 'matchMedia', {
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: rs.fn(),
    removeListener: rs.fn(),
    addEventListener: rs.fn(),
    removeEventListener: rs.fn(),
    dispatchEvent: rs.fn()
  }),
  writable: true
});

window.HTMLElement.prototype.scrollIntoView = rs.fn();
