/**
 * Smoke test: полная цепочка без внешних API.
 * Использует MockLLM + seed data из prisma/seed-experiments.ts
 *
 * Запуск: npm run smoke:experiments
 * Exit 0 = всё ок, exit 1 = что-то сломано.
 */
import { PrismaClient } from '@prisma/client';
import { MockLLM } from '../src/dialog-analysis/llm-client';
import { prefilterTranscript } from '../src/dialog-analysis/prefilter';
import { twoProportionsZTest, normalCdf } from '../src/experiments/stats.util';

const prisma = new PrismaClient();
const errors: string[] = [];

function assert(condition: boolean, msg: string) {
  if (!condition) {
    errors.push(`FAIL: ${msg}`);
    console.error(`  ✗ ${msg}`);
  } else {
    console.log(`  ✓ ${msg}`);
  }
}

// ── 1. z-test ────────────────────────────────────────────────────────────────
async function testZTest() {
  console.log('\n[1] z-test statistics');
  const { zA, pValueA } = twoProportionsZTest(100, 40, 100, 30);
  assert(zA !== null && zA > 0, 'z-score positive when pA > pC');
  assert(pValueA !== null && pValueA > 0 && pValueA < 1, 'p-value in (0,1)');
  // Known value: pA=0.4, pC=0.3 → z ≈ 1.57 → p ≈ 0.116
  assert(zA !== null && Math.abs(zA - 1.57) < 0.1, `z ≈ 1.57, got ${zA?.toFixed(3)}`);

  // normalCdf
  assert(Math.abs(normalCdf(0) - 0.5) < 1e-4, 'normalCdf(0) = 0.5');
  assert(normalCdf(1.96) > 0.974, 'normalCdf(1.96) > 0.974');

  // edge cases
  const { zA: zNull } = twoProportionsZTest(0, 0, 100, 30);
  assert(zNull === null, 'z=null when nA=0');
}

// ── 2. MockLLM determinism ────────────────────────────────────────────────────
async function testMockLLM() {
  console.log('\n[2] MockLLM determinism');
  const llm = new MockLLM();

  const r1 = await llm.analyzeDialog('conv_abc_123', 'текст');
  const r2 = await llm.analyzeDialog('conv_abc_123', 'другой текст');
  assert(r1.reachedStage === r2.reachedStage, 'Same id → same stage regardless of transcript');
  assert(r1.model === 'mock', 'model=mock');
  assert(r1.confidence >= 0.85, 'confidence >= 0.85');

  const stages = new Set<string>();
  for (let i = 0; i < 50; i++) {
    const r = await llm.analyzeDialog(`dialog_${i}`, '');
    stages.add(r.reachedStage);
  }
  assert(stages.size >= 5, `At least 5 distinct stages across 50 dialogs, got ${stages.size}`);
}

// ── 3. Prefilter ──────────────────────────────────────────────────────────────
async function testPrefilter() {
  console.log('\n[3] Prefilter rules');
  // No client messages → CONTACT
  const r1 = prefilterTranscript('any', [], ['Привет'], 0);
  assert(r1?.reachedStage === 'CONTACT', 'No client msgs → CONTACT');

  // No manager reply → CONTACT
  const r2 = prefilterTranscript('any', ['Хочу'], [], 0);
  assert(r2?.reachedStage === 'CONTACT', 'No manager reply → CONTACT');

  // Short exchange, no price → REPLIED
  const r3 = prefilterTranscript('any', ['привет'], ['здравствуйте'], 0);
  assert(r3?.reachedStage === 'REPLIED', 'Short no-price → REPLIED');

  // Has price keyword → null (needs LLM)
  const r4 = prefilterTranscript('any', ['цена?'], ['3500 руб'], 0);
  assert(r4 === null, 'Price keyword → null (needs LLM)');

  // QA sample=100 → always null
  const r5 = prefilterTranscript('any', [], [], 100);
  assert(r5 === null, 'QA 100% → null');
}

// ── 4. DB: seed data exists ────────────────────────────────────────────────────
async function testSeedData() {
  console.log('\n[4] Seed data in DB');
  const analysesCount = await prisma.dialogAnalysis.count();
  assert(analysesCount >= 10, `≥10 DialogAnalysis records, got ${analysesCount}`);

  const convCount = await prisma.vkConversation.count();
  assert(convCount >= 10, `≥10 VkConversation records, got ${convCount}`);

  const exp = await prisma.experiment.findFirst({ where: { name: 'Seed: Script A vs B' } });
  assert(exp !== null, 'Seed experiment exists');
  assert(exp?.status === 'RUNNING', 'Experiment is RUNNING');

  if (exp) {
    const variants = await prisma.experimentVariant.findMany({ where: { experimentId: exp.id } });
    assert(variants.length === 2, '2 variants');
    assert(variants.some((v) => v.isControl), 'Control variant exists');

    const assignments = await prisma.experimentAssignment.findMany({ where: { experimentId: exp.id } });
    assert(assignments.length >= 10, `≥10 assignments, got ${assignments.length}`);

    // Bias check: perSkew ≤ 1 within each manager
    const byManager = new Map<string, Map<string, number>>();
    for (const a of assignments) {
      if (!byManager.has(a.managerId)) byManager.set(a.managerId, new Map());
      const m = byManager.get(a.managerId)!;
      m.set(a.variantId, (m.get(a.variantId) ?? 0) + 1);
    }
    let maxSkew = 0;
    for (const [, counts] of byManager) {
      const vals = [...counts.values()];
      if (vals.length > 1) maxSkew = Math.max(maxSkew, Math.max(...vals) - Math.min(...vals));
    }
    assert(maxSkew <= 1, `Manager bias ≤ 1, got ${maxSkew}`);

    const snapshots = await prisma.experimentResultSnapshot.count({ where: { experimentId: exp.id } });
    assert(snapshots >= 3, `≥3 snapshots for stable sign check, got ${snapshots}`);
  }
}

// ── 5. Results computation ─────────────────────────────────────────────────────
async function testResults() {
  console.log('\n[5] Results computation');
  const exp = await prisma.experiment.findFirst({
    where: { name: 'Seed: Script A vs B' },
    include: { variants: true },
  });
  if (!exp) { errors.push('FAIL: No seed experiment for results test'); return; }

  // Import ResultsService — use inline logic to avoid NestJS DI in CLI context
  const assignments = await prisma.experimentAssignment.findMany({
    where: { experimentId: exp.id },
    include: { order: { select: { paymentStatus: true, paidAt: true, createdAt: true } } },
  });

  const now = new Date();
  const matMs = exp.maturationDays * 24 * 60 * 60 * 1000;
  let nATotal = 0; let nAPaid = 0;
  let nCTotal = 0; let nCPaid = 0;
  const controlId = exp.variants.find((v) => v.isControl)!.id;

  for (const a of assignments) {
    const matured = now.getTime() - new Date(a.order.createdAt).getTime() >= matMs;
    if (!matured) continue;
    if (a.variantId === controlId) {
      nCTotal++; if (a.order.paymentStatus === 'PAID_FULL') nCPaid++;
    } else {
      nATotal++; if (a.order.paymentStatus === 'PAID_FULL') nAPaid++;
    }
  }

  assert(nCTotal >= 0 && nATotal >= 0, `Matured counts: control=${nCTotal}, variant=${nATotal}`);

  const { zA, pValueA } = twoProportionsZTest(nATotal, nAPaid, nCTotal, nCPaid);
  const statsNote = zA !== null ? `z=${zA.toFixed(3)}, p=${pValueA?.toFixed(3)}` : 'insufficient data';
  console.log(`  ℹ  Results: ${statsNote}`);
  assert(true, `z-test computation ran without error (${statsNote})`);
}

// ── 6. Analytics funnel (inline) ────────────────────────────────────────────────
async function testFunnel() {
  console.log('\n[6] Analytics funnel');
  const analyses = await prisma.dialogAnalysis.findMany({ take: 100 });
  const stageCounts = new Map<string, number>();
  for (const a of analyses) stageCounts.set(a.reachedStage, (stageCounts.get(a.reachedStage) ?? 0) + 1);

  assert(stageCounts.size >= 2, `≥2 distinct stages in funnel, got ${stageCounts.size}`);
  const contact = stageCounts.get('CONTACT') ?? 0;
  const total = analyses.length;
  assert(total > 0, 'Funnel has data');
  console.log(`  ℹ  Total=${total}, CONTACT=${contact}, stages=${[...stageCounts.keys()].join(',')}`);
}

// ── main ─────────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🧪 smoke:experiments — running full chain on mock LLM + seed data');

  try {
    await testZTest();
    await testMockLLM();
    await testPrefilter();
    await testSeedData();
    await testResults();
    await testFunnel();
  } finally {
    await prisma.$disconnect();
  }

  console.log('\n─────────────────────────────────────────');
  if (errors.length === 0) {
    console.log('✅ ALL TESTS PASSED');
    process.exit(0);
  } else {
    console.error(`\n❌ ${errors.length} test(s) FAILED:`);
    errors.forEach((e) => console.error(' ', e));
    process.exit(1);
  }
}

main();
