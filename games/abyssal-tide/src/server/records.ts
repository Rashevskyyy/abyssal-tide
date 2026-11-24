import { BIG_WIN_X } from '../shared/config';
import type { StepResult } from '../shared/types';
import type { Feature, RoundRecord } from './protocol';

/** Незавершений раунд: кроки, що вже зафіксовані. */
export interface RoundInProgress {
  startedAt: number;
  balanceBefore: number;
  steps: StepResult[];
}

/** Додає крок до раунду: платний спін починає новий запис. */
export function appendStep(current: RoundInProgress | null, result: StepResult, balanceBefore: number, now: number): RoundInProgress | null {
  if (result.action === 'spin') return { startedAt: now, balanceBefore, steps: [result] };
  return current ? { ...current, steps: [...current.steps, result] } : null;
}

/** Завершений раунд для історії й replay. Спільне для локального «сервера» і справжнього. */
export function toRecord(current: RoundInProgress, last: StepResult): RoundRecord {
  const features = new Set<Feature>();
  for (const s of current.steps) {
    if (s.fsAwarded) features.add('freeDives');
    if (s.salvageTriggered) features.add('salvage');
    if (s.superActivated) features.add('super');
    if (s.action === 'collect' && s.fullBoard) features.add('fullBoard');
  }
  if (last.roundWin >= last.bet * BIG_WIN_X) features.add('bigWin');
  return {
    roundId: last.roundId,
    bet: last.bet,
    startedAt: current.startedAt,
    balanceBefore: current.balanceBefore,
    balanceAfter: last.balanceAfter,
    win: last.roundWin,
    features: [...features],
    steps: current.steps,
  };
}

