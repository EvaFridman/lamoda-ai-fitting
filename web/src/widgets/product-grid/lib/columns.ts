// Cards per row by the grid's own width (spec 0014 plan §3.3, O84): 4 from 900px, 3 from 600px,
// otherwise 2. The stylesheet's container queries use the same steps for the server's grid.
export function columnsFor(width: number): number {
  if (width >= 900) return 4;
  if (width >= 600) return 3;
  return 2;
}
