declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.svg' {
  import * as React from 'react';

  const SVGComponent: React.FunctionComponent<React.SVGProps<SVGSVGElement> & { title?: string }>;
  export default SVGComponent;
}

declare module '*.module.scss' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
