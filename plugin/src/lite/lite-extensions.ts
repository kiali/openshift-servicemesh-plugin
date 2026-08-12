import type { EncodedExtension } from '@openshift-console/dynamic-plugin-sdk-webpack';
import { OSSMC_INTERNAL_TECH_PREVIEW_FLAG } from '../openshift/flags/constants';

const OSSM_CONSOLE = 'ossmconsole';
const ADMIN = 'admin';

const getConsoleTitle = (title: string): string => `%plugin__ossmconsole~${title}%`;

// Unsupported tech preview, off by default -- these routes and nav items only register once a
// customer opts in via spec.internal.techPreview: true on the OSSMConsole CR (see
// ossmcInternalTechPreviewFlag.ts). They provide minimal service mesh visibility even before a
// Kiali backend is configured on the hub cluster.

// Detail routes are registered before list routes so React Router v5
// matches /istios/:name before /istios.

// Scoping these routes to the admin perspective (like the nav items below) lets the Console's
// usePluginRoutes() auto-switch the active perspective when a route is reached while a
// different perspective is active. Without this, the page still
// renders correctly, but the sidebar is left showing the previous perspective's nav.

const liteRequiredFlags = { required: [OSSMC_INTERNAL_TECH_PREVIEW_FLAG] };

const istioDetailRoute: EncodedExtension = {
  flags: liteRequiredFlags,
  type: 'console.page/route',
  properties: {
    component: { $codeRef: 'liteIstioDetailPage.default' },
    exact: true,
    path: `/${OSSM_CONSOLE}/istios/:name`,
    perspective: ADMIN
  }
};

const istiosRoute: EncodedExtension = {
  flags: liteRequiredFlags,
  type: 'console.page/route',
  properties: {
    component: { $codeRef: 'liteIstiosPage.default' },
    exact: true,
    path: `/${OSSM_CONSOLE}/istios`,
    perspective: ADMIN
  }
};

// Separates the lite nav items from the full-OSSMC section above, so it should only render when
// both the full section exists (KIALI_AVAILABLE) and the lite items below it exist (tech preview
// enabled) -- dropping either flag would show a stray divider with nothing (relevant) below it.
const liteSeparator: EncodedExtension = {
  flags: { required: ['KIALI_AVAILABLE', OSSMC_INTERNAL_TECH_PREVIEW_FLAG] },
  type: 'console.navigation/separator',
  properties: {
    id: `${OSSM_CONSOLE}_lite_separator`,
    insertBefore: `${OSSM_CONSOLE}_istios`,
    perspective: ADMIN,
    section: OSSM_CONSOLE
  }
};

const istiosNavItem: EncodedExtension = {
  flags: liteRequiredFlags,
  type: 'console.navigation/href',
  properties: {
    href: `/${OSSM_CONSOLE}/istios`,
    id: `${OSSM_CONSOLE}_istios`,
    name: getConsoleTitle('Istio control planes'),
    perspective: ADMIN,
    section: OSSM_CONSOLE
  }
};

const kialiDetailRoute: EncodedExtension = {
  flags: liteRequiredFlags,
  type: 'console.page/route',
  properties: {
    component: { $codeRef: 'liteKialiDetailPage.default' },
    exact: true,
    path: `/${OSSM_CONSOLE}/kialis/:namespace/:name`,
    perspective: ADMIN
  }
};

const kialisRoute: EncodedExtension = {
  flags: liteRequiredFlags,
  type: 'console.page/route',
  properties: {
    component: { $codeRef: 'liteKialisPage.default' },
    exact: true,
    path: `/${OSSM_CONSOLE}/kialis`,
    perspective: ADMIN
  }
};

const kialisNavItem: EncodedExtension = {
  flags: liteRequiredFlags,
  type: 'console.navigation/href',
  properties: {
    href: `/${OSSM_CONSOLE}/kialis`,
    id: `${OSSM_CONSOLE}_kialis`,
    name: getConsoleTitle('Kiali instances'),
    perspective: ADMIN,
    section: OSSM_CONSOLE
  }
};

export const liteExtensions: EncodedExtension[] = [
  istioDetailRoute,
  istiosRoute,
  liteSeparator,
  istiosNavItem,
  kialiDetailRoute,
  kialisRoute,
  kialisNavItem
];
