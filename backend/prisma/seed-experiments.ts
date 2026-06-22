/**
 * Seed для экспериментов и разметки диалогов.
 * Запускается отдельно: npx ts-node -P tsconfig.json prisma/seed-experiments.ts
 * Идемпотентен — не удаляет, только upsert/create where not exists.
 */
import { PrismaClient, PaymentStatus, DialogStage, ObjectionType } from '@prisma/client';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

const MANAGER_A = 'manager_ivan';
const MANAGER_B = 'manager_olga';

// Детерминированная имитация того, что даст MockLLM
function mockStageForDialog(conversationId: string): {
  reachedStage: DialogStage; deathStage: DialogStage | null;
  objectionType: ObjectionType; dayInDay: boolean; hadCTA: boolean;
} {
  const hash = parseInt(createHash('sha256').update(conversationId).digest('hex').slice(0, 8), 16);
  const bucket = hash % 100;
  const objections: ObjectionType[] = ['NONE', 'EXPENSIVE', 'THINKING', 'JUST_ASKING', 'IGNORED_AFTER_LINK', 'TIMING', 'OTHER'];

  let reachedStage: DialogStage;
  let deathStage: DialogStage | null = null;
  let objectionType: ObjectionType = 'NONE';

  if (bucket < 10) {
    reachedStage = 'CONTACT'; deathStage = 'CONTACT';
  } else if (bucket < 25) {
    reachedStage = 'REPLIED'; deathStage = 'REPLIED';
  } else if (bucket < 40) {
    reachedStage = 'PRICE_SHOWN'; deathStage = 'PRICE_SHOWN';
    objectionType = objections[hash % objections.length];
  } else if (bucket < 55) {
    reachedStage = 'OBJECTION'; deathStage = 'OBJECTION';
    objectionType = objections[(hash + 1) % objections.length];
  } else if (bucket < 65) {
    reachedStage = 'REBUTTAL'; deathStage = 'REBUTTAL';
    objectionType = 'EXPENSIVE';
  } else if (bucket < 75) {
    reachedStage = 'ORDERED';
  } else if (bucket < 85) {
    reachedStage = 'PREPAID';
  } else {
    reachedStage = 'PAID_FULL';
  }

  return { reachedStage, deathStage, objectionType, dayInDay: bucket % 3 === 0, hadCTA: bucket > 30 };
}

async function main() {
  console.log('🌱 Seed experiments...');

  // Создаём вымышленных VkClient + VkConversation + Order для 40 диалогов
  const TOTAL = 40;
  const conversationIds: string[] = [];
  const orderIds: string[] = [];

  for (let i = 1; i <= TOTAL; i++) {
    const peerId = 9_000_000 + i;
    const managerId = i % 2 === 0 ? MANAGER_A : MANAGER_B;
    const bucket = i % 100;
    const payStatus: PaymentStatus = bucket >= 85 ? 'PAID_FULL' : bucket >= 75 ? 'PREPAID' : bucket >= 65 ? 'ORDERED' : 'ORDERED';

    // VkConversation must come before VkClient (FK peerId on VkClient → VkConversation.peerId)
    const conv = await prisma.vkConversation.upsert({
      where: { peerId },
      create: {
        peerId,
        clientName: `Тест Клиент ${i}`,
        lastMessageText: 'тест',
        lastMessageAt: new Date(Date.now() - i * 3600_000),
      },
      update: {},
    });

    // VkClient (upsert)
    const client = await prisma.vkClient.upsert({
      where: { peerId },
      create: { peerId, fio: `Тест Клиент ${i}` },
      update: {},
    });
    conversationIds.push(conv.id);

    // VkMessages (только если нет)
    const msgCount = await prisma.vkMessage.count({ where: { conversationId: conv.id } });
    if (msgCount === 0) {
      await prisma.vkMessage.createMany({
        data: [
          { conversationId: conv.id, vkMessageId: i * 10 + 1, direction: 'IN', text: 'Привет, хочу узнать о книге', createdAt: new Date(Date.now() - i * 3600_000 - 2000) },
          { conversationId: conv.id, vkMessageId: i * 10 + 2, direction: 'OUT', text: 'Здравствуйте! Рады помочь. Цена от 3500 руб.', createdAt: new Date(Date.now() - i * 3600_000 - 1000) },
        ],
      });
    }

    // Order (только если нет)
    const existing = await prisma.order.findFirst({ where: { clientId: client.id } });
    let orderId: string;
    if (existing) {
      orderId = existing.id;
    } else {
      const order = await prisma.order.create({
        data: {
          clientId: client.id,
          amount: 3500 + (i % 5) * 500,
          managerId,
          paymentStatus: payStatus,
          paidAt: payStatus === 'PAID_FULL' ? new Date(Date.now() - i * 1800_000) : undefined,
          createdAt: new Date(Date.now() - (TOTAL + i) * 24 * 3600_000), // старше maturation window
        },
      });
      orderId = order.id;
    }
    orderIds.push(orderId);

    // DialogAnalysis (upsert)
    const stage = mockStageForDialog(conv.id);
    await prisma.dialogAnalysis.upsert({
      where: { conversationId_analysisVersion: { conversationId: conv.id, analysisVersion: 'v1' } },
      create: {
        conversationId: conv.id,
        orderId,
        managerId,
        reachedStage: stage.reachedStage,
        deathStage: stage.deathStage ?? undefined,
        objectionType: stage.objectionType,
        dayInDay: stage.dayInDay,
        hadCTA: stage.hadCTA,
        confidence: 0.9,
        analysisVersion: 'v1',
        model: 'mock',
        needsReview: false,
      },
      update: {},
    });
  }

  // Эксперимент
  const existing = await prisma.experiment.findFirst({ where: { name: 'Seed: Script A vs B' } });
  let expId: string;
  let variantControlId: string;
  let variantAId: string;

  if (existing) {
    expId = existing.id;
    const variants = await prisma.experimentVariant.findMany({ where: { experimentId: expId } });
    variantControlId = variants.find((v) => v.isControl)?.id ?? variants[0].id;
    variantAId = variants.find((v) => !v.isControl)?.id ?? variants[1].id;
    console.log('Experiment already exists:', expId);
  } else {
    const exp = await prisma.experiment.create({
      data: {
        name: 'Seed: Script A vs B',
        hypothesis: 'Скрипт B с явным CTA даёт более высокую конверсию в оплату',
        stageFrom: 'PRICE_SHOWN',
        stageTo: 'PAID_FULL',
        maturationDays: 1, // short window for smoke test
        minSamplePerVariant: 5,
        pThreshold: 0.05,
        createdById: 'seed',
        status: 'RUNNING',
        startedAt: new Date(),
        variants: {
          create: [
            { name: 'Control (Скрипт A)', isControl: true, weight: 1, scriptRef: 'script-A-v1' },
            { name: 'Вариант B (с CTA)',   isControl: false, weight: 1, scriptRef: 'script-B-v1' },
          ],
        },
      },
      include: { variants: true },
    });
    expId = exp.id;
    variantControlId = exp.variants.find((v) => v.isControl)!.id;
    variantAId = exp.variants.find((v) => !v.isControl)!.id;
    console.log('Created experiment:', expId);
  }

  // Назначения — чередуем варианты внутри каждого менеджера
  let assignedA = 0; let assignedB = 0;
  for (let i = 0; i < orderIds.length; i++) {
    const orderId = orderIds[i];
    const managerId = i % 2 === 0 ? MANAGER_A : MANAGER_B;
    const existing = await prisma.experimentAssignment.findUnique({
      where: { experimentId_orderId: { experimentId: expId, orderId } },
    });
    if (!existing) {
      // Детерминированное чередование
      const chosenId = i % 2 === 0 ? variantControlId : variantAId;
      await prisma.experimentAssignment.create({
        data: { experimentId: expId, variantId: chosenId, orderId, managerId },
      });
      i % 2 === 0 ? assignedA++ : assignedB++;
    }
  }
  console.log(`Assigned: control=${assignedA}, variant=${assignedB}`);

  // Снапшоты за последние 3 дня (чтобы stableSignCount ≥ 3)
  for (let daysAgo = 3; daysAgo >= 1; daysAgo--) {
    const snapshotDate = new Date();
    snapshotDate.setUTCHours(0, 0, 0, 0);
    snapshotDate.setDate(snapshotDate.getDate() - daysAgo);

    for (const [variantId, isControl] of [[variantControlId, true], [variantAId, false]] as [string, boolean][]) {
      await prisma.experimentResultSnapshot.upsert({
        where: { experimentId_variantId_snapshotDate: { experimentId: expId, variantId, snapshotDate } },
        create: {
          experimentId: expId,
          variantId,
          snapshotDate,
          nAssigned: isControl ? 20 : 20,
          nMatured: isControl ? 20 : 20,
          nPaid: isControl ? 5 : 8,
          revenuePaid: 0,
          convToPaid: isControl ? 0.25 : 0.4,
          zVsControl: isControl ? null : 1.4 + (3 - daysAgo) * 0.1,
          pValue: isControl ? null : 0.16 - (3 - daysAgo) * 0.02,
        },
        update: {},
      });
    }
  }

  console.log('✅ Seed experiments done.');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
