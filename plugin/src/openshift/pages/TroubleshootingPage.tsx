import * as React from 'react';
import { useFlag, useResolvedExtensions } from '@openshift-console/dynamic-plugin-sdk';
import type { Extension, ExtensionDeclaration } from '@openshift-console/dynamic-plugin-sdk/lib/types';
import { useLocation } from 'react-router-dom-v5-compat';

import { KialiContainer } from 'openshift/components/KialiContainer';
import { TroubleshootingPage } from 'pages/Troubleshooting/TroubleshootingPage';
import type { OpenAIChatFn, UseOpenAIChat } from 'pages/Troubleshooting/types';

import { setRouterBasename, useInitKialiListeners } from '../utils/KialiIntegration';

type OpenOLSHandlerProps = {
  contextId: string;
  provider: UseOpenAIChat;
};

type OpenOLSHandlerExtension = ExtensionDeclaration<'console.action/provider', OpenOLSHandlerProps>;

const isOpenOLSHandlerExtension = (e: Extension): e is OpenOLSHandlerExtension =>
  e.type === 'console.action/provider' && e.properties?.contextId === 'ols-open-handler';

type TroubleshootingWithOLSProps = {
  useOpenOLS: UseOpenAIChat;
};

// Invokes the Lightspeed provider hook outside KialiContainer's Redux Provider.
const TroubleshootingWithOLS: React.FC<TroubleshootingWithOLSProps> = ({ useOpenOLS }) => {
  const openAIChat: OpenAIChatFn = useOpenOLS();

  return (
    <KialiContainer>
      <TroubleshootingPage openAIChat={openAIChat} />
    </KialiContainer>
  );
};

const TroubleshootingPageOSSMC: React.FC<void> = () => {
  const { pathname } = useLocation();
  // Console SDK hooks must run outside KialiContainer — its Redux Provider replaces Console state.
  const isLightspeedRunning = !!useFlag('LIGHTSPEED_PLUGIN');
  const [extensions, resolved] = useResolvedExtensions(isOpenOLSHandlerExtension);
  const useOpenOLS = (resolved ? extensions[0]?.properties?.provider : undefined) as UseOpenAIChat | undefined;

  setRouterBasename(pathname);

  useInitKialiListeners();

  if (isLightspeedRunning && useOpenOLS) {
    return <TroubleshootingWithOLS useOpenOLS={useOpenOLS} />;
  }

  return (
    <KialiContainer>
      <TroubleshootingPage />
    </KialiContainer>
  );
};

export default TroubleshootingPageOSSMC;
