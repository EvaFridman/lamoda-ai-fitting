// The fittings an open try-on window shows in this tab. The push's toast (A11, A34) is for a
// fitting the user no longer looks at: the window shows its own end.
const shown = new Map<string, number>();

// Marks the fitting shown until the returned function is called (an effect's cleanup).
export function showFitting(id: string): () => void {
  shown.set(id, (shown.get(id) ?? 0) + 1);
  return () => {
    const count = (shown.get(id) ?? 1) - 1;
    if (count > 0) shown.set(id, count);
    else shown.delete(id);
  };
}

export function isFittingShown(id: string): boolean {
  return shown.has(id);
}
