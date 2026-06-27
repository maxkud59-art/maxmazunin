// Seed стандартных SLA-политик для AI-ассистента.
// Запуск: npx ts-node -r tsconfig-paths/register prisma/seed-sla-policies.ts
import { PrismaClient, LifecycleStage } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_POLICIES: Array<{ fromStage: LifecycleStage; toStage: LifecycleStage; businessHours: number }> = [
  { fromStage: 'NEW_LEAD',    toStage: 'PRICE_SENT',    businessHours: 4  },
  { fromStage: 'PRICE_SENT',  toStage: 'OFORMLENO',     businessHours: 24 },
  { fromStage: 'OFORMLENO',   toStage: 'OPLACHENO',     businessHours: 48 }, // главный SLA
  { fromStage: 'IN_PRODUCTION', toStage: 'READY_TO_SHIP', businessHours: 72 },
  { fromStage: 'READY_TO_SHIP', toStage: 'SHIPPED',     businessHours: 8  },
];

async function main() {
  for (const p of DEFAULT_POLICIES) {
    await prisma.slaPolicy.upsert({
      where: { fromStage_toStage: { fromStage: p.fromStage, toStage: p.toStage } },
      update: { businessHours: p.businessHours },
      create: p,
    });
    console.log(`✓ SlaPolicy ${p.fromStage} → ${p.toStage} (${p.businessHours}ч)`);
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
