export function extractArxivId(input) {
  if (!input || typeof input !== 'string') return null;

  const normalized = input.trim();
  const urlMatch = normalized.match(/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5})(?:v\d+)?/i);
  if (urlMatch) return urlMatch[1];

  const idMatch = normalized.match(/^(\d{4}\.\d{4,5})(?:v\d+)?$/);
  if (idMatch) return idMatch[1];

  return null;
}
