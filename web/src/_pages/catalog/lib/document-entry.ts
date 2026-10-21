// The document was loaded at the current address by following a link or typing it (navigation
// type `navigate`), not by a reload, Back or Forward, and the visitor has not moved since: a page a
// search link opened counts as a search (spec 0014 O105).
export function isDocumentEntry(): boolean {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') {
    return false;
  }
  const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
  return entry?.type === 'navigate' && entry.name === window.location.href;
}
