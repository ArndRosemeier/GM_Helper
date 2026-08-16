export function webSearchQuery(prefix: string, find: string): string {
  const term = find.trim();
  if (term.length === 0) {
    throw new Error("Find is empty");
  }
  const head = prefix.trim();
  return head.length === 0 ? term : `${head} ${term}`;
}

export function googleSearchUrl(query: string): string {
  if (query.trim().length === 0) {
    throw new Error("Web search query is empty");
  }
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

