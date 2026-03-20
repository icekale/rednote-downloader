function normalizeNoteText(input) {
  return String(input || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48);
}

export function sanitizeFileName(input, fallback = 'note') {
  const safe = String(input || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);

  return safe || fallback;
}

export function deriveNoteFileStem(title, description, fallback = 'note') {
  const normalizedTitle = normalizeNoteText(title);
  const normalizedDescription = normalizeNoteText(description);
  const genericTitle = /^X\s*@/i.test(normalizedTitle) || /^X\s+Post$/i.test(normalizedTitle);
  const candidate = normalizedDescription || (!genericTitle ? normalizedTitle : '') || fallback;
  return sanitizeFileName(candidate, fallback);
}

export function inferMediaExtension(item, fallbackExtension = '') {
  const sourceUrl = String(item?.url || '');
  const match = sourceUrl.match(/\.([a-z0-9]{2,5})(?:$|[?#])/i);
  if (match?.[1]) {
    return match[1].toLowerCase();
  }

  if (fallbackExtension) {
    return String(fallbackExtension).replace(/^\./, '').toLowerCase();
  }

  return item?.type === 'video' ? 'mp4' : 'jpg';
}

export function inferMediaBaseName(note, options = {}) {
  const fallbackBaseName = options.fallbackBaseName || note?.noteId || 'rednote-media';
  const stem = deriveNoteFileStem(note?.title, note?.description, fallbackBaseName);

  if (options.batch && note?.noteId) {
    return sanitizeFileName(`${stem}_${note.noteId}`, fallbackBaseName);
  }

  return sanitizeFileName(stem, fallbackBaseName);
}

export function inferMediaFileName(item, note, index, options = {}) {
  if (item?.fileName) {
    return item.fileName;
  }

  const itemIndex = Number.isInteger(item?.index) && item.index > 0
    ? item.index
    : index + 1;
  const totalItems = Number.isInteger(options.totalItems) && options.totalItems > 0
    ? options.totalItems
    : 1;
  const extension = inferMediaExtension(item, options.extension);
  const baseName = sanitizeFileName(
    options.baseName || inferMediaBaseName(note, options),
    options.fallbackBaseName || note?.noteId || 'rednote-media',
  );

  if (item?.type === 'video' && totalItems <= 1) {
    return `${baseName}.${extension}`;
  }

  return `${baseName}_${String(itemIndex).padStart(2, '0')}.${extension}`;
}
