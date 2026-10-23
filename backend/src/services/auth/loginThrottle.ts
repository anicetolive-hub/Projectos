// Limita tentativas de login falhadas por email, para dificultar a
// adivinhação de passwords. Em memória: reinicia com a API, o que é
// aceitável para uma instância única.

export const MAX_FAILURES = 5;
export const LOCK_MINUTES = 15;

interface Entry {
  failures: number;
  lockedUntil: number;
}

export class LoginThrottle {
  private entries = new Map<string, Entry>();

  constructor(
    private maxFailures = MAX_FAILURES,
    private lockMs = LOCK_MINUTES * 60 * 1000,
  ) {}

  /** Minutos que faltam para desbloquear, ou 0 se pode tentar. */
  lockedMinutes(key: string, now = Date.now()): number {
    const entry = this.entries.get(key);
    if (!entry || entry.lockedUntil <= now) return 0;
    return Math.ceil((entry.lockedUntil - now) / 60000);
  }

  registerFailure(key: string, now = Date.now()): void {
    const entry = this.entries.get(key) ?? { failures: 0, lockedUntil: 0 };
    if (entry.lockedUntil !== 0 && entry.lockedUntil <= now) {
      // bloqueio anterior já expirou: recomeça a contagem
      entry.failures = 0;
      entry.lockedUntil = 0;
    }
    entry.failures += 1;
    if (entry.failures >= this.maxFailures) {
      entry.failures = 0;
      entry.lockedUntil = now + this.lockMs;
    }
    this.entries.set(key, entry);
  }

  registerSuccess(key: string): void {
    this.entries.delete(key);
  }
}
