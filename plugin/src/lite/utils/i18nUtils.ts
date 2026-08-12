import type { UseTranslationResponse } from 'react-i18next';
import { useTranslation } from 'react-i18next';

// Lite pages share the OSSMC plugin namespace so their strings are merged into
// the same plugin__ossmconsole.json bundle served by the Console.
// Source locale files at src/lite/locales/{lang}/translation.json are picked up
// automatically by the MergeJsonWebpackPlugin glob in webpack.config.ts.
const LITE_I18N_NAMESPACE = 'plugin__ossmconsole';

/** Returns the react-i18next translation function scoped to the OSSMC plugin namespace. */
export const useLiteTranslation = (): UseTranslationResponse<string, undefined> => useTranslation(LITE_I18N_NAMESPACE);
