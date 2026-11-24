/**
 * HTTP API справжнього сервера (каталог server/) — контракт, спільний для сервера й клієнта.
 * За формою як у RGS: запуск сесії → токен; далі кожен крок гри — окремий ідемпотентний запит.
 *
 *   POST /api/launch   { playerId, jurisdiction? }      → LaunchResponse
 *   GET  /api/session                                   → SessionSnapshot
 *   POST /api/play     { stepId, action, bet? }         → StepResult
 *   GET  /api/history                                   → RoundRecord[]
 *   POST /api/topup                                     → SessionSnapshot   (лише демо)
 *   POST /api/reset                                     → SessionSnapshot   (лише демо)
 *
 * Авторизація — `Authorization: Bearer <token>`. Помилки — `{ code, message }` з HTTP-статусом.
 */
import type { GameRules } from '../shared/config';
import type { JurisdictionId } from '../shared/jurisdiction';
import type { RoundRecord, SessionSnapshot, SourceErrorCode } from './protocol';

export const API_VERSION = 1;

export interface LaunchRequest {
  /** Ідентифікатор гравця: у справжньому RGS його дає оператор, у демо — випадковий з браузера. */
  playerId: string;
  jurisdiction?: JurisdictionId;
}

export interface LaunchResponse {
  apiVersion: number;
  token: string;
  snapshot: SessionSnapshot;
  history: RoundRecord[];
  rules: GameRules;
}

export interface ApiError {
  code: SourceErrorCode;
  message: string;
}

/** HTTP-статус для коду помилки рушія. */
export const STATUS: Partial<Record<SourceErrorCode, number>> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  INSUFFICIENT_FUNDS: 402,
  UNEXPECTED_ACTION: 409,
  INVALID_BET: 422,
  BAD_SCRIPT: 500,
};

export const PLAYER_ID = /^[A-Za-z0-9_-]{8,64}$/;
