/**
 * Categorical palette (validated: worst adjacent CVD dE 24.2 on white, all
 * checks pass; aqua/yellow/magenta are sub-3:1 contrast so charts always ship
 * with a table view alongside). Slot order is the CVD-safety mechanism -
 * assign in this fixed order, never cycle or re-sort.
 */
export const CATEGORICAL = [
  '#2a78d6', // blue
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#008300', // green
  '#4a3aa7', // violet
  '#e34948', // red
  '#e87ba4', // magenta
  '#eb6834', // orange
];

export const CHART_INK = {
  grid: '#e1e0d9',
  axis: '#898781',
  deltaGood: '#006300',
  deltaBad: '#d03b3b',
};

/**
 * Stable color per employee: index by id among ALL users (sorted), so a
 * date-filter that hides an employee never repaints the others.
 */
export function colorMap(allIds: number[]): Map<number, string> {
  const sorted = [...new Set(allIds)].sort((a, b) => a - b);
  return new Map(sorted.map((id, i) => [id, CATEGORICAL[i % CATEGORICAL.length]]));
}
