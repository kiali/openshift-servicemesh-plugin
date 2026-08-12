import { rs } from '@rstest/core';
import type { FC, ReactNode } from 'react';

export const Link: FC<{ children?: ReactNode; state?: unknown; to: string }> = ({ to, children }) => (
  <a href={to}>{children}</a>
);

export const useParams = rs.fn(() => ({}));
