import type { UseTranslationResponse } from 'react-i18next';
import { useTranslation } from 'react-i18next';

// Fleet-mesh pages share the OSSMC plugin namespace so their strings are merged into
// the same plugin__ossmconsole.json bundle served by the Console.
// Source strings are extracted from src/fleet-mesh/**/*.{ts,tsx} into
// src/openshift/locales/{lang}/translation.json by the yarn i18n:openshift script.
const MESH_I18N_NAMESPACE = 'plugin__ossmconsole';

/** Returns the react-i18next translation function scoped to the OSSMC plugin namespace. */
export const useMeshTranslation = (): UseTranslationResponse<string, undefined> => useTranslation(MESH_I18N_NAMESPACE);
