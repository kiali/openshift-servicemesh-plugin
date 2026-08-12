import type { FC } from 'react';

export const ChartDonut: FC<{
  data?: { x: string; y: number }[];
  [key: string]: unknown;
  subTitle?: string;
  title?: string;
}> = ({ data, title, subTitle }) => (
  <div data-testid="chart-donut" data-title={title} data-subtitle={subTitle}>
    {data?.map(d => (
      <span key={d.x} data-testid={`donut-segment-${d.x}`}>{`${d.x}: ${d.y}`}</span>
    ))}
  </div>
);
