// Seed для ai-finance: правила категоризации + тестовые операции (включая дубль для #7).
// npx ts-node -r tsconfig-paths/register prisma/seed-ai-finance.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Берём первый EXPENSE-категорию для привязки правила
  let marketingCat = await prisma.finCategory.findFirst({
    where: { type: 'expense', name: { contains: 'Маркетинг' } },
  });
  if (!marketingCat) {
    marketingCat = await prisma.finCategory.findFirst({ where: { type: 'expense' } });
  }
  if (!marketingCat) {
    console.log('⚠️  Нет категорий расходов — запусти основной seed финансов сначала.');
    return;
  }

  let incomeCat = await prisma.finCategory.findFirst({ where: { type: 'income' } });

  // 1. Правило для известного контрагента (критерий #2)
  const rule = await prisma.categorizationRule.upsert({
    where: { id: 'seed-rule-yandex-direct' },
    update: {},
    create: {
      id: 'seed-rule-yandex-direct',
      matchType: 'counterparty',
      pattern: 'Яндекс.Директ',
      categoryId: marketingCat.id,
      projectId: null,
      effect: 'DDS_AND_PNL',
      source: 'human',
      confidence: 1.0,
      hitCount: 5,
    },
  });
  console.log(`✓ Правило: ${rule.matchType}="${rule.pattern}" → ${marketingCat.name}`);

  // Находим первый счёт
  const account = await prisma.finAccount.findFirst({ where: { archived: false } });
  if (!account) { console.log('⚠️  Нет счетов.'); return; }

  // 2. Операция, которую должно поймать правило (критерий #2)
  const ruleTargetOp = await prisma.finOperation.upsert({
    where: { source_externalId: { source: 'MANUAL', externalId: 'seed-ai-fin-001' } },
    update: {},
    create: {
      date: new Date('2026-06-10'),
      accountId: account.id,
      amountKopecks: -5000_00,
      type: 'EXPENSE',
      counterparty: 'Яндекс.Директ',
      comment: 'Реклама EasyNeon июнь',
      source: 'MANUAL',
      externalId: 'seed-ai-fin-001',
    },
  });
  console.log(`✓ Операция с известным контрагентом: ${ruleTargetOp.id}`);

  // 3. Дублирующие операции (критерий #7)
  const dup1 = await prisma.finOperation.upsert({
    where: { source_externalId: { source: 'MANUAL', externalId: 'seed-ai-fin-dup1' } },
    update: {},
    create: {
      date: new Date('2026-06-15'),
      accountId: account.id,
      amountKopecks: -12500_00,
      type: 'EXPENSE',
      counterparty: 'Типография Принт24',
      comment: 'Печать партии неонов',
      source: 'MANUAL',
      externalId: 'seed-ai-fin-dup1',
    },
  });
  const dup2 = await prisma.finOperation.upsert({
    where: { source_externalId: { source: 'MANUAL', externalId: 'seed-ai-fin-dup2' } },
    update: {},
    create: {
      date: new Date('2026-06-16'),
      accountId: account.id,
      amountKopecks: -12500_00,
      type: 'EXPENSE',
      counterparty: 'Типография Принт24',
      comment: 'Печать (дубль?)',
      source: 'MANUAL',
      externalId: 'seed-ai-fin-dup2',
    },
  });
  console.log(`✓ Дубль-пара: ${dup1.id} / ${dup2.id} (Типография Принт24, 12500 руб, разница 1 день)`);

  // 4. Несколько незакатегоризированных для бэклога
  if (incomeCat) {
    for (let i = 3; i <= 5; i++) {
      await prisma.finOperation.upsert({
        where: { source_externalId: { source: 'MANUAL', externalId: `seed-ai-fin-00${i}` } },
        update: {},
        create: {
          date: new Date(`2026-06-${10 + i}`),
          accountId: account.id,
          amountKopecks: (i % 2 === 0 ? 1 : -1) * (i * 3000_00),
          type: i % 2 === 0 ? 'INCOME' : 'EXPENSE',
          counterparty: `Контрагент ${i} (неизвестный)`,
          comment: 'Требует классификации',
          source: 'MANUAL',
          externalId: `seed-ai-fin-00${i}`,
        },
      });
    }
    console.log(`✓ 3 незакатегоризированных операции`);
  }

  console.log('\n✅ Seed ai-finance завершён.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
