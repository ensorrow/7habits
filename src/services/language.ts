import type { LanguageStats } from '../types';

const REACTIVE = [
  '不得不',
  '没办法',
  '只能',
  '被逼',
  '身不由己',
  '他们让我',
  '必须得',
  '又不是我说了算',
  '没时间',
  '太忙了',
  '控制不了',
];

const PROACTIVE = [
  '我选择',
  '我决定',
  '我想要',
  '我打算',
  '我承诺',
  '我优先',
  '这周我会',
  '我可以',
  '我负责',
];

export function analyzeLanguage(text: string): {
  reactive: string[];
  proactive: string[];
} {
  const reactive = REACTIVE.filter((p) => text.includes(p));
  const proactive = PROACTIVE.filter((p) => text.includes(p));
  return { reactive, proactive };
}

export function mergeLanguageStats(
  prev: LanguageStats,
  text: string,
): LanguageStats {
  const { reactive, proactive } = analyzeLanguage(text);
  return {
    reactiveCount: prev.reactiveCount + reactive.length,
    proactiveCount: prev.proactiveCount + proactive.length,
    reactivePhrases: [...new Set([...prev.reactivePhrases, ...reactive])],
    proactivePhrases: [...new Set([...prev.proactivePhrases, ...proactive])],
  };
}

export function languageShiftSummary(stats: LanguageStats): string | null {
  if (stats.reactiveCount === 0 && stats.proactiveCount === 0) return null;
  if (stats.reactiveCount > stats.proactiveCount + 2) {
    return `这周你的表达里，反应式语言（「${stats.reactivePhrases.slice(0, 2).join('」「')}」）出现了 ${stats.reactiveCount} 次——比主动式多。值得留意。`;
  }
  if (stats.proactiveCount > stats.reactiveCount) {
    return `这周你用了更多主动式表达（「${stats.proactivePhrases.slice(0, 2).join('」「')}」）。这是在选，不是在被推着走。`;
  }
  return null;
}
