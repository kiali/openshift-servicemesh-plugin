import { PFSpacer } from 'styles/PfSpacer';
import { kialiStyle } from 'styles/StyleUtils';
import { cssRule } from 'typestyle';

cssRule('.pf-v6-c-tooltip ul', {
  paddingLeft: 0,
  listStyle: 'none'
});

export const detailHeaderStyle = kialiStyle({
  paddingBottom: '0.5rem'
});

export const detailsTabPageStyle = kialiStyle({
  paddingTop: '0'
});

export const detailTitleRowStyle = kialiStyle({
  alignItems: 'center',
  display: 'flex',
  flexWrap: 'nowrap',
  gap: PFSpacer.sm,
  marginTop: '1rem',
  minWidth: 0,
  width: '100%'
});

export const globalStyle = kialiStyle({
  display: 'flex',
  flexDirection: 'column',
  padding: '1rem 1.25rem',
  $nest: {
    '& .pf-v6-c-menu h1': {
      fontSize: 'var(--pf-t--global--font--size--md)'
    },
    '& :is(ul,ol):where(:not([class*="pf-v6-c-"]))': {
      listStyle: 'none',
      paddingLeft: 0
    }
  }
});
