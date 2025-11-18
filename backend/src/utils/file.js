export function sanitizeFilename(input) {
  return input
    .replace(/[^a-z0-9-_\.]/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'track';
}
