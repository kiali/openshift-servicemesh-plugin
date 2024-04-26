import { kialiStyle } from 'styles/StyleUtils';
import { cssRule } from 'typestyle';

// Overwrite listStyle css value for ul in tooltip
cssRule('.pf-v5-c-tooltip ul', {
  paddingLeft: 0,
  listStyle: 'none'
});

export const globalStyle = kialiStyle({
  display: 'flex',
  flexDirection: 'column',
  overflowY: 'auto',
  $nest: {
    '& .pf-v5-c-menu h1': {
      fontSize: 'var(--pf-v5-global--FontSize--md)'
    }
  }
});
