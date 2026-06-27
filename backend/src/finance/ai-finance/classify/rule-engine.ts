import { CategorizationRule, FinOperation } from '@prisma/client';

export interface RuleMatch {
  rule: CategorizationRule;
  score: number;
}

export function matchRules(
  operation: Pick<FinOperation, 'counterparty' | 'comment' | 'amountKopecks' | 'type'>,
  rules: CategorizationRule[],
): RuleMatch | null {
  let best: RuleMatch | null = null;

  for (const rule of rules) {
    if (!rule.isActive) continue;
    let score = 0;

    switch (rule.matchType) {
      case 'counterparty':
        if (
          operation.counterparty &&
          operation.counterparty.toLowerCase().includes(rule.pattern.toLowerCase())
        ) {
          score = 1.0;
        }
        break;

      case 'keyword': {
        const haystack = [operation.counterparty ?? '', operation.comment ?? ''].join(' ').toLowerCase();
        if (haystack.includes(rule.pattern.toLowerCase())) {
          score = 0.9;
        }
        break;
      }

      case 'regex':
        try {
          const re = new RegExp(rule.pattern, 'i');
          const haystack = [operation.counterparty ?? '', operation.comment ?? ''].join(' ');
          if (re.test(haystack)) score = 0.85;
        } catch {
          // invalid regex — skip
        }
        break;

      case 'amount_sign':
        if (rule.pattern === 'positive' && operation.amountKopecks > 0) score = 0.7;
        if (rule.pattern === 'negative' && operation.amountKopecks < 0) score = 0.7;
        break;
    }

    if (score > 0 && rule.confidence * score > (best ? best.rule.confidence * best.score : 0)) {
      best = { rule, score };
    }
  }

  return best;
}
