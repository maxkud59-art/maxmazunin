/**
 * Заполнить таблицу VkCabinet начальными записями.
 *
 * Запуск:
 *   npx ts-node -r tsconfig-paths/register prisma/seed-cabinets.ts
 *
 * После запуска пометьте нужный кабинет активным:
 *   UPDATE "VkCabinet" SET "isActive" = true WHERE "externalAccountId" = 'easybook';
 * Или через Prisma Studio:
 *   npm run db:studio
 *
 * Один токен VK_ACCESS_TOKEN соответствует одному активному кабинету.
 * Для нескольких кабинетов — несколько токенов и несколько `isActive = true`.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CABINETS = [
  { title: 'EasyBook',           externalAccountId: 'easybook' },
  { title: 'EasyNeon',           externalAccountId: 'easyneon' },
  { title: 'EasyBook (Слава)',   externalAccountId: 'easybook-slava' },
  { title: 'EasyNeon (Слава)',   externalAccountId: 'easyneon-slava' },
  { title: 'EasyBook Сказки',    externalAccountId: 'easybook-skazki' },
  { title: 'КалинкаПринт',      externalAccountId: 'kalinkaprint' },
];

async function main() {
  let created = 0;
  for (const cabinet of CABINETS) {
    const exists = await prisma.vkCabinet.findUnique({ where: { externalAccountId: cabinet.externalAccountId } });
    if (!exists) {
      await prisma.vkCabinet.create({ data: cabinet });
      console.log(`✓ Создан: ${cabinet.title}`);
      created++;
    } else {
      console.log(`  Уже есть: ${cabinet.title}`);
    }
  }
  console.log(`\nГотово: ${created} кабинетов создано.`);
  console.log('Активируйте нужный: npm run db:studio → VkCabinet → isActive = true');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
