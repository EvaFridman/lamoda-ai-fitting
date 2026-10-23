// The document was loaded at the current address by following a link or typing it (navigation
// type `navigate`), not by a reload, Back or Forward, and the visitor has not moved since: a page a
// search link opened counts as a search (spec 0014 O105).
export function isDocumentEntry(): boolean {
  const entry = navigationEntry();
  return entry?.type === 'navigate' && entry.name === window.location.href;
}

// The path the document was loaded at, whatever the client-side steps since; none when the
// browser keeps no navigation entry (spec 0020 plan §2).
export function documentPathname(): string | undefined {
  const entry = navigationEntry();
  if (entry === undefined) return undefined;
  try {
    return new URL(entry.name).pathname;
  } catch {
    return undefined;
  }
}

function navigationEntry(): PerformanceNavigationTiming | undefined {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') {
    return undefined;
  }
  return (performance.getEntriesByType('navigation') as PerformanceNavigationTiming[])[0];
}
