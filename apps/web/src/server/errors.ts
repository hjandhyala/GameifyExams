export type ErrorCode =
  | 'BAD_REQUEST'
  | 'DATE_NOT_AVAILABLE'
  | 'PUZZLE_NOT_SCHEDULED'
  | 'GAME_DISABLED'
  | 'VERSION_UNKNOWN'
  | 'PUZZLE_VOIDED'
  | 'INVALID_MOVE'
  | 'MOVE_AFTER_TERMINAL'
  | 'TOO_MANY_MOVES'
  | 'DUPLICATE_GUESS'
  | 'UNKNOWN_ID'
  | 'BAD_SEQUENCE'
  | 'NOT_TERMINAL'
  | 'RATE_LIMITED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INTERNAL';

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  DATE_NOT_AVAILABLE: 403,
  PUZZLE_NOT_SCHEDULED: 404,
  GAME_DISABLED: 404,
  VERSION_UNKNOWN: 409,
  PUZZLE_VOIDED: 410,
  INVALID_MOVE: 422,
  MOVE_AFTER_TERMINAL: 422,
  TOO_MANY_MOVES: 422,
  DUPLICATE_GUESS: 422,
  UNKNOWN_ID: 422,
  BAD_SEQUENCE: 422,
  NOT_TERMINAL: 422,
  RATE_LIMITED: 429,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL: 500,
};

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
  get status() {
    return STATUS[this.code];
  }
}
