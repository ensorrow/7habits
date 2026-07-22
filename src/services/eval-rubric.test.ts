import { describe, expect, it } from 'vitest';
import { scoreSpeech, promptHintsForFailures } from '../../scripts/eval/rubric';
import type { MentorReply } from '../services/mentor';

const brief: MentorReply = {
  content:
    '过去一个月你有 19 个会，晚 8 点后还有 6 次日程，周末几乎是空的。这个分布，是你想要的吗？',
  sources: ['日历 · 过去4周'],
};

describe('mentor phrasing rubric', () => {
  it('passes a good observation rewrite', () => {
    const spoken =
      '我看你日历上，过去一个月排了 19 个会，还有 6 次开到晚上 8 点以后；周末几乎是空的。这个分布，是你想要的吗？';
    const s = scoreSpeech(
      spoken,
      brief,
      {
        mustIncludeAny: ['分布', '日历'],
        requireSourceCite: true,
        requireQuestion: true,
        coachOnly: true,
        forbid: ['七个习惯'],
      },
      280,
    );
    expect(s.pass).toBe(true);
  });

  it('flags Covey jargon and missing cite', () => {
    const spoken = '按照要事第一的原则，你的第二象限完全空了。';
    const s = scoreSpeech(spoken, brief, { requireSourceCite: true, requireQuestion: true }, 180);
    expect(s.pass).toBe(false);
    const failed = s.dimensions.filter((d) => !d.pass).map((d) => d.dimension);
    expect(failed).toContain('forbid');
    expect(failed).toContain('source_cite');
    expect(promptHintsForFailures(failed).length).toBeGreaterThan(0);
  });

  it('flags coach-week hard assert', () => {
    const spoken = '你在逃避重要的事，用忙碌躲开健康。';
    const s = scoreSpeech(spoken, brief, { coachOnly: true, requireQuestion: false }, 180);
    expect(s.dimensions.find((d) => d.dimension === 'coach_only')?.pass).toBe(false);
  });
});
