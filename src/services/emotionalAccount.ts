import type { EmotionalAccount, EmotionalLevel, VolumeSetting } from '../types';

const LEVEL_THRESHOLDS: { level: EmotionalLevel; min: number }[] = [
  { level: 'deep', min: 75 },
  { level: 'trusted', min: 50 },
  { level: 'acquainted', min: 25 },
  { level: 'stranger', min: 0 },
];

export function levelFromBalance(balance: number): EmotionalLevel {
  for (const t of LEVEL_THRESHOLDS) {
    if (balance >= t.min) return t.level;
  }
  return 'stranger';
}

export function deposit(
  account: EmotionalAccount,
  amount: number,
  _reason?: string,
): EmotionalAccount {
  const balance = Math.min(100, account.balance + amount);
  return {
    ...account,
    balance,
    level: levelFromBalance(balance),
    deposits: account.deposits + 1,
    silenceMode: balance >= 25 ? false : account.silenceMode,
  };
}

export function withdraw(
  account: EmotionalAccount,
  amount: number,
): EmotionalAccount {
  const balance = Math.max(0, account.balance - amount);
  return {
    ...account,
    balance,
    level: levelFromBalance(balance),
    withdrawals: account.withdrawals + 1,
  };
}

/** Challenge intensity unlocked by emotional account + week count */
export type ChallengeMode = 'coach' | 'ask' | 'assert';

export function challengeMode(
  account: EmotionalAccount,
  weekCount: number,
  volume: VolumeSetting,
): ChallengeMode {
  if (account.silenceMode) return 'coach';
  if (weekCount < 1) return 'coach'; // first week: pure coach

  const volumeBoost = volume === 'strict' ? 1 : volume === 'quiet' ? -1 : 0;
  const score =
    (account.level === 'deep' ? 3 : account.level === 'trusted' ? 2 : account.level === 'acquainted' ? 1 : 0) +
    volumeBoost;

  if (score >= 3) return 'assert';
  if (score >= 1) return 'ask';
  return 'coach';
}

export function levelLabel(level: EmotionalLevel): string {
  switch (level) {
    case 'stranger':
      return '初识';
    case 'acquainted':
      return '相识';
    case 'trusted':
      return '信任';
    case 'deep':
      return '深交';
  }
}

export function createAccount(): EmotionalAccount {
  return {
    level: 'stranger',
    balance: 10,
    deposits: 0,
    withdrawals: 0,
    silenceMode: false,
  };
}
