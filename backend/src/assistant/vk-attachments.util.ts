/**
 * Утилита для работы с метками вложений VK в тексте быстрых фраз.
 *
 * Формат метки в тексте: [photo-12345_678], [video12345_678], [clip-12345_678],
 *   [audio12345_678], [audio_message12345_678], [doc12345_678]
 * Формат для VK messages.send attachment: photo-12345_678,video12345_678,...
 * Плейсхолдер имени клиента: [Имя]
 */

export interface ParsedMessage {
  cleanText: string;
  attachment: string;
}

/** Regex для маркеров вложений в тексте */
const MARKER_RE = /\[(photo|video|clip|audio_message|audio|doc)(-?\d+_\d+)\]/g;

/**
 * Разбирает текст фразы:
 * - заменяет [Имя] на имя клиента (первое слово из clientName)
 * - извлекает маркеры вложений в строку attachment для VK API
 * - удаляет маркеры из текста
 */
export function parseVkMarkers(text: string, clientName?: string): ParsedMessage {
  let result = text;

  if (clientName) {
    const firstName = clientName.trim().split(/\s+/)[0] ?? clientName.trim();
    result = result.replace(/\[Имя\]/g, firstName);
  } else {
    result = result.replace(/\[Имя\]/g, '');
  }

  const attachments: string[] = [];
  result = result.replace(MARKER_RE, (_, type, ownerAndId) => {
    attachments.push(`${type}${ownerAndId}`);
    return '';
  });

  result = result.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

  return {
    cleanText: result,
    attachment: attachments.join(','),
  };
}

/**
 * Извлекает маркер вложения из VK URL.
 * Пример: https://vk.com/photo-25869828_457438050, type=photo → [photo-25869828_457438050]
 */
export function extractMarkerFromUrl(url: string, type: string): string | null {
  const typeRe = type.replace('_', '_?');
  const pattern = new RegExp(`(?:vk\\.com/)?${typeRe}(-?\\d+_\\d+)`);
  const match = url.match(pattern);
  if (!match) return null;
  return `[${type}${match[1]}]`;
}
