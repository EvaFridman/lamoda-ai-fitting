// Cards per row by the grid's own width (spec 0014 plan §3.3): 4 from 1024px, 3 from 768px,
// otherwise 2. The stylesheet's container queries use the same steps for the server's grid.
export function columnsFor(width: number): number {
  if (width >= 1024) return 4;
  if (width >= 768) return 3;
  return 2;
}
