import { Injectable } from '@nestjs/common';
import { AiActionType, LifecycleStage } from '@prisma/client';

@Injectable()
export class GuardrailsService {
  // AI никогда не меняет стадию OPLACHENO самостоятельно.
  isStageChangeAllowed(to: LifecycleStage): boolean {
    return to !== 'OPLACHENO';
  }

  // Фильтрует предложения: убирает всё, что звучит как давление или манипуляция.
  filterSuggestions(suggestions: string[]): string[] {
    const forbidden = ['угрожай', 'дави', 'манипул', 'срочно', 'последний шанс', 'скидка истекает'];
    return suggestions.filter(s => !forbidden.some(f => s.toLowerCase().includes(f)));
  }

  // Проверяет, может ли AI-действие данного типа быть создано.
  canCreateAction(type: AiActionType): boolean {
    // SUGGEST_STAGE_CHANGE только для стадий, разрешённых выше — проверяется в сервисе.
    // Все остальные типы разрешены.
    return true;
  }
}
