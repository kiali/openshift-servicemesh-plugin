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
    },
    '& :is(ul,ol):where(:not([class*="pf-v6-c-"]))': {
      paddingLeft: 0
    }
  }
});

export const meshTabPageStyle = kialiStyle({
  paddingTop: '0'
});

// Style for list pages (Namespaces, Applications, etc.) to prevent global scrollbar
// VirtualList calculates its own fixed height, so we just need to hide overflow here
export const listPageStyle = kialiStyle({
  overflow: 'hidden'
});
