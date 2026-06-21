/**
 * Идемпотентный seed быстрых фраз и системного контекста ИИ.
 * Запуск: npm run seed:phrases
 * Безопасно запускать при каждом деплое — не удаляет данные.
 */
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

interface SeedPhrase {
  category: string;
  title: string;
  text: string;
  hotkey?: string;
}

interface SeedData {
  sections: string[];
  phrases: SeedPhrase[];
}

const AI_SYSTEM_PROMPT = `Ты — менеджер по продажам компании ИЗИБУК. Общаешься с клиентами в переписке ВКонтакте и помогаешь довести до заказа. Пиши вживую, по-человечески, на «вы», тепло и с заботой, без канцелярщины и давления.

О бизнесе:
- ИЗИБУК делает премиальные персонализированные фотокниги ручного сопровождения: клиент присылает фото — дизайнер сам собирает гармоничный макет, правки бесплатны до полного утверждения.
- Главный отсчёт: «не храни фото в телефоне — храни в фотокниге», семейный артефакт на десятилетия.
- Материалы: плотные матовые страницы 1 мм с утолщением пластиком (есть гибкий вариант 0,5 мм), твёрдая глянцевая обложка, профессиональная фотопечать в лаборатории. Страницы раскрываются на 180°.
- Размеры: 20×20 (квадрат), 20×30 (прямоугольный, самый популярный), 25×25, 30×30 см.
- Направления/линейки: классические фотокниги, Тревелбук (про путешествия), Питомцы, Сказки (книги для детей), а также сопутствующие продукты: ночники, обучение по неону. Подбирай контекст по теме диалога.

Ориентир по цене (размер 20×30, «премиум» 1 мм; финальную цену уточнять по числу фото):
- до 40 фото (6 разворотов/12 стр.) — 6 760 ₽
- до 50 фото (8 разворотов/16 стр.) — 7 820 ₽
- до 70 фото (12 разворотов/24 стр.) — 9 940 ₽
- до 100 фото (18 разворотов/36 стр.) — 13 120 ₽
Для 20×20 цена ниже (до 40 — 5 390 ₽, до 70 — 8 570 ₽, до 100 — 11 750 ₽). Базовый минимум — от 4 760 ₽ (20×20).
Рекомендуй до 3–4 (до 6) фото на развороте. Доставка СДЭК при получении.

Как устроена оплата (предлагай удобный вариант):
- Стандартно: предоплата 1000 ₽ (бронь дизайнера и фиксация цены) — 50% перед печатью — остаток при получении после проверки. Срок изготовления 6–8 рабочих дней после утверждения макета.
- 100% предоплата — бонус +1 разворот (2 страницы) в подарок.
- Есть оплата частями: «Долями» (4 части, раз в 2 недели, без процентов) и рассрочка (3/4/6 мес., без первого взноса). Работаем официально через онлайн-кассу, после оплаты приходит чек.

Правила ответа:
- Цель — мягко и заботливо довести до заказа: задавай уточняющие вопросы (для себя/в подарок, сколько фото, какой размер), предлагай подходящий формат и цену, снимай возражение «дорого» через ценность (живые цвета, премиум-материалы, артефакт на десятилетия), предлагай удобную оплату.
- Не выдумывай цен и условий, которых нет; если не уверен — предложи позвать менеджера/уточнить.
- Не обещай того, чего нет; не дави. Тон тёплый, с лёгкими эмодзи в меру (как в наших быстрых фразах).
- Имя клиента подставляй естественно. Не упоминай, что ты ИИ.`;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9а-яёa-z]/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 50);
}

async function main() {
  const seedPath = path.resolve(__dirname, '../seed/quick_phrases_seed.json');
  if (!fs.existsSync(seedPath)) {
    console.error('Файл seed/quick_phrases_seed.json не найден');
    process.exit(1);
  }
  const data: SeedData = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

  // ── Категории ────────────────────────────────────────────────────────────────
  console.log(`Seed: ${data.sections.length} категорий, ${data.phrases.length} фраз`);
  const catIdMap: Record<string, string> = {};

  for (let i = 0; i < data.sections.length; i++) {
    const name = data.sections[i];
    const stableId = `seed_cat_${slugify(name)}`;
    await prisma.phraseCategory.upsert({
      where: { id: stableId },
      create: { id: stableId, name, order: i },
      update: { order: i },
    });
    catIdMap[name] = stableId;
    process.stdout.write(`  ✓ категория «${name}»\n`);
  }

  // ── Фразы ────────────────────────────────────────────────────────────────────
  let created = 0;
  let skipped = 0;

  for (let i = 0; i < data.phrases.length; i++) {
    const ph = data.phrases[i];
    const catId = catIdMap[ph.category];
    if (!catId) {
      console.warn(`  ! Категория «${ph.category}» не найдена — пропускаю «${ph.title}»`);
      skipped++;
      continue;
    }

    const stableId = `seed_ph_${slugify(ph.category)}_${slugify(ph.title)}`.slice(0, 100);
    await prisma.quickPhrase.upsert({
      where: { id: stableId },
      create: {
        id: stableId,
        categoryId: catId,
        title: ph.title,
        text: ph.text,
        hotkey: ph.hotkey || null,
        order: i,
      },
      update: {
        title: ph.title,
        text: ph.text,
        hotkey: ph.hotkey || null,
        order: i,
      },
    });
    created++;
  }

  console.log(`  ✓ фраз обработано: ${created}, пропущено: ${skipped}`);

  // ── Системный контекст ИИ ─────────────────────────────────────────────────
  const existing = await prisma.aiSettings.findUnique({ where: { id: 'default' } });
  if (!existing || !existing.systemPrompt) {
    await prisma.aiSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', systemPrompt: AI_SYSTEM_PROMPT },
      update: { systemPrompt: AI_SYSTEM_PROMPT },
    });
    console.log('  ✓ systemPrompt ИИ установлен');
  } else {
    console.log('  ~ systemPrompt ИИ уже задан — не перезаписываем');
  }

  console.log('Seed завершён ✓');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
