export interface QualityLevel {
  level: 'excellent' | 'good' | 'fair' | 'poor' | 'very_poor';
  label: string;
  color: string; // 'green' | 'yellow' | 'red'
}

export interface QualityResult {
  effectiveDpi: number;
  level: QualityLevel['level'];
  levelLabel: string;
  levelColor: string;
  recommendation: string;
  photoPixels: { w: number; h: number };
  requiredPixels: { w: number; h: number };
  cellCm: { w: number; h: number };
}

// Physical spread dimensions in cm (width × height of the open 2-page spread)
const SPREAD_CM: Record<string, { w: number; h: number }> = {
  S20x20: { w: 40, h: 20 },
  S20x30: { w: 40, h: 30 },
  S25x25: { w: 50, h: 25 },
  S30x30: { w: 60, h: 30 },
};

// Fraction of spread width/height each cell occupies, indexed by cellIndex (0-based)
const CELL_FRACTIONS: Record<string, { w: number; h: number }[]> = {
  '1':  [{ w: 1,     h: 1     }],
  '2h': [{ w: 0.5,  h: 1     }, { w: 0.5,  h: 1     }],
  '2v': [{ w: 1,    h: 0.5   }, { w: 1,    h: 0.5   }],
  // areas: '"a b" "a c"', columns: '2fr 1fr', rows: '1fr 1fr'
  '3r': [{ w: 2/3,  h: 1     }, { w: 1/3,  h: 0.5   }, { w: 1/3,  h: 0.5   }],
  // areas: '"a a" "b c"', columns: '1fr 1fr', rows: '2fr 1fr'
  '3b': [{ w: 1,    h: 2/3   }, { w: 0.5,  h: 1/3   }, { w: 0.5,  h: 1/3   }],
  '4':  [{ w: 0.5,  h: 0.5   }, { w: 0.5,  h: 0.5   }, { w: 0.5,  h: 0.5   }, { w: 0.5, h: 0.5 }],
  // areas: '"a b c" "a d e"', columns: '2fr 1fr 1fr', rows: '1fr 1fr'
  '5':  [{ w: 0.5,  h: 1     }, { w: 0.25, h: 0.5   }, { w: 0.25, h: 0.5   }, { w: 0.25, h: 0.5 }, { w: 0.25, h: 0.5 }],
  '6':  [{ w: 1/3,  h: 0.5   }, { w: 1/3,  h: 0.5   }, { w: 1/3,  h: 0.5   }, { w: 1/3, h: 0.5 }, { w: 1/3, h: 0.5 }, { w: 1/3, h: 0.5 }],
  '6v': [{ w: 0.5,  h: 1/3   }, { w: 0.5,  h: 1/3   }, { w: 0.5,  h: 1/3   }, { w: 0.5, h: 1/3 }, { w: 0.5, h: 1/3 }, { w: 0.5, h: 1/3 }],
  // areas: '"a a b c" "d e f g"', columns: '1fr 1fr 1fr 1fr', rows: '1fr 1fr'
  '7':  [{ w: 0.5,  h: 0.5   }, { w: 0.25, h: 0.5   }, { w: 0.25, h: 0.5   }, { w: 0.25, h: 0.5 }, { w: 0.25, h: 0.5 }, { w: 0.25, h: 0.5 }, { w: 0.25, h: 0.5 }],
  '8':  [{ w: 0.25, h: 0.5   }, { w: 0.25, h: 0.5   }, { w: 0.25, h: 0.5   }, { w: 0.25, h: 0.5 }, { w: 0.25, h: 0.5 }, { w: 0.25, h: 0.5 }, { w: 0.25, h: 0.5 }, { w: 0.25, h: 0.5 }],
};

export function calculatePrintQuality(
  photoW: number,
  photoH: number,
  bookSize: string,
  templateId: string,
  cellIndex: number,
): QualityResult {
  const spread = SPREAD_CM[bookSize] ?? SPREAD_CM['S20x20'];
  const fractions = CELL_FRACTIONS[templateId] ?? [{ w: 1, h: 1 }];
  const frac = fractions[Math.min(cellIndex, fractions.length - 1)];

  const cellCm = { w: spread.w * frac.w, h: spread.h * frac.h };
  const cellInches = { w: cellCm.w / 2.54, h: cellCm.h / 2.54 };

  // Use DPI based on the shorter axis to account for landscape/portrait mismatch
  const dpiW = photoW / cellInches.w;
  const dpiH = photoH / cellInches.h;
  const effectiveDpi = Math.round(Math.min(dpiW, dpiH));

  const requiredPixels = {
    w: Math.round(cellInches.w * 300),
    h: Math.round(cellInches.h * 300),
  };

  let level: QualityResult['level'];
  let levelLabel: string;
  let levelColor: string;
  let recommendation: string;

  if (effectiveDpi >= 280) {
    level = 'excellent';
    levelLabel = 'Отлично';
    levelColor = 'green';
    recommendation = 'В этом шаблоне фото будет напечатано с превосходным качеством.';
  } else if (effectiveDpi >= 200) {
    level = 'good';
    levelLabel = 'Хорошо';
    levelColor = 'green';
    recommendation = 'Качество печати хорошее. Небольшое снижение чёткости возможно при очень близком рассмотрении.';
  } else if (effectiveDpi >= 150) {
    level = 'fair';
    levelLabel = 'Допустимо';
    levelColor = 'yellow';
    recommendation = 'Качество на пределе. Рекомендуем выбрать шаблон с меньшим числом ячеек или улучшить фото.';
  } else if (effectiveDpi >= 100) {
    level = 'poor';
    levelLabel = 'Низкое';
    levelColor = 'red';
    recommendation = 'Фото будет напечатано размыто. Выберите шаблон с меньшим числом ячеек или замените снимок.';
  } else {
    level = 'very_poor';
    levelLabel = 'Очень низкое';
    levelColor = 'red';
    recommendation = 'Разрешения фото недостаточно для этого шаблона. Рекомендуем заменить фото или улучшить его через ИИ.';
  }

  return {
    effectiveDpi,
    level,
    levelLabel,
    levelColor,
    recommendation,
    photoPixels: { w: photoW, h: photoH },
    requiredPixels,
    cellCm,
  };
}
