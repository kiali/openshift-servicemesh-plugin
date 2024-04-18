import { store } from 'store/ConfigStore';
import { Theme } from 'types/Common';

export const getKialiTheme = (): Theme => {
  return (store.getState().globalState.theme as Theme) || getDefaultTheme();
};

// Get default theme from system settings
const getDefaultTheme = (): Theme => {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return Theme.DARK;
  }

  return Theme.LIGHT;
};
