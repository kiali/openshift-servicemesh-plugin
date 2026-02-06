import { kialiStyle } from 'styles/StyleUtils';
import { cssRule } from 'typestyle';

// Overwrite listStyle css value for ul in tooltip
cssRule('.pf-v6-c-tooltip ul', {
  paddingLeft: 0,
  listStyle: 'none'
});

export const globalStyle = kialiStyle({
  display: 'flex',
  flexDirection: 'column',
  overflowY: 'auto',
  padding: '1rem 1.25rem',
  $nest: {
    '& .pf-v6-c-menu h1': {
      fontSize: 'var(--pf-t--global--font--size--md)'
    }
  }
});

export const meshTabPageStyle = kialiStyle({
  paddingTop: '0'
});
