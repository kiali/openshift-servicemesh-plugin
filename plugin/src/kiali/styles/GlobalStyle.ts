import { kialiStyle } from './StyleUtils';

export const globalStyle = kialiStyle({
  height: '100%',
  margin: 0,
  padding: 0,
  // TODO: possible change to --pf-global--FontFamily--redhat-updated--sans-serif
  fontFamily: 'var(--pf-global--FontFamily--sans-serif)',
  fontSize: '14px',
  overflow: 'hidden',
  $nest: {
    /**
     * Kiosk mode
     */
    '&.kiosk': {
      $nest: {
        '& #page-sidebar': {
          display: 'none'
        },

        '& header[role="kiali_header"]': {
          display: 'none'
        }
      }
    },

    '& #root': {
      height: '100%'
    },

    '& img': {
      verticalAlign: 'middle'
    },

    '& input[type=checkbox], & input[type=radio]': {
      margin: '4px 0 0',
      lineHeight: 'normal'
    },

    /**
     * Remove global page padding by default
     */
    '& .pf-c-page__main-section': {
      padding: 0,
      height: '100%',
      overflowY: 'hidden'
    },

    /**
     * Drawer panels should have less z-index than dropdowns
     */
    '& .pf-c-drawer__panel': {
      zIndex: 199
    },

    /**
     * Health SVG visible
     */
    // eslint-disable-next-line no-multi-str
    '& svg:not(:root).icon-failure, \
     & svg:not(:root).icon-degraded, \
     & svg:not(:root).icon-healthy, \
     & svg:not(:root).icon-na': {
      overflow: 'visible'
    },

    /**
     * Padding for table rows
     */
    '& .pf-c-table:not(.table) tr > *': {
      fontSize: 'var(--kiali-global--font-size)',
      paddingBottom: '8px',
      paddingTop: '8px'
    },

    '& .pf-c-chart svg': {
      overflow: 'visible !important'
    }
  }
});
