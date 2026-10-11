import { useMediaQuery } from '../hooks/useMediaQuery';

/**
 * Categorical palette, one step per theme (validated on the app's own card
 * surfaces, #ffffff and #161618: worst adjacent CVD dE 9.1 light / 8.4 dark,
 * normal-vision floor 19.6 / 19.3). In light mode aqua/yellow/magenta sit
 * below 3:1 against white, so every chart ships with a table beside it. Slot
 * order is the CVD-safety mechanism - assign in this fixed order, never cycle
 * or re-sort.
 */
const CATEGORICAL_LIGHT = [
  '#2a78d6', // blue
  '#eb6834', // orange
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#e87ba4', // magenta
  '#008300', // green
  '#6250d6', // violet
  '#e34948', // red
];

const CATEGORICAL_DARK = [
  '#3987e5',
  '#d95926',
  '#199e70',
  '#c98500',
  '#d55181',
  '#008300',
  '#9085e9',
  '#e66767',
];

export interface ChartTheme {
  categorical: string[];
  /** the card the chart sits on: gaps between stacked segments are drawn in it */
  surface: string;
  grid: string;
  axis: string;
  cursor: string;
  label: string;
  deltaGood: string;
  deltaBad: string;
}

const LIGHT: ChartTheme = {
  categorical: CATEGORICAL_LIGHT,
  surface: '#ffffff',
  grid: '#ebebee',
  axis: '#8a8a8f',
  cursor: 'rgba(0,0,0,0.04)',
  label: '#5f5f64',
  deltaGood: '#1b7a3a',
  deltaBad: '#c4001a',
};

const DARK: ChartTheme = {
  categorical: CATEGORICAL_DARK,
  surface: '#161618',
  grid: '#2a2a2d',
  axis: '#8a8a8f',
  cursor: 'rgba(255,255,255,0.05)',
  label: '#a1a1a6',
  deltaGood: '#30d158',
  deltaBad: '#ff6961',
};

/**
 * Recharts paints SVG attributes, which cannot follow the CSS variables in
 * index.css on their own - so the chart reads the matching theme here and
 * repaints when the device switches between light and dark.
 */
export function useChartTheme(): ChartTheme {
  return useMediaQuery('(prefers-color-scheme: dark)') ? DARK : LIGHT;
}

/**
 * Stable color slot per employee: index by id among ALL users (sorted), so a
 * date-filter that hides an employee never repaints the others.
 */
export function colorMap(allIds: number[], categorical: string[]): Map<number, string> {
  const sorted = [...new Set(allIds)].sort((a, b) => a - b);
  return new Map(sorted.map((id, i) => [id, categorical[i % categorical.length]]));
}
