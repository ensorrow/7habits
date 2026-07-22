# Mentor phrasing E2E eval

目的：用**固定场景 + 可重复量规**牵引优化 `server/mentorPrompt.ts`，而不是凭感觉改 prompt。

## 分层

| 层 | 测什么 | 命令 |
|----|--------|------|
| L1 决策 | `respond()` 意图/阶段（已有） | `npm test` / `npm run verify` |
| L2 话术自动量规 | 长度、禁词、来源引用、教练模式、brief 锚点… | `npm run eval:mentor` |
| L3 云端表达 | 同一案经 Qoder `model=auto` 润色后再跑量规 | `npm run eval:mentor:live` |

L1 失败 → 改 `src/services/mentor.ts`，不是改 prompt。  
L2/L3 失败 → 看报告里的 **prompt hints**，改 `MENTOR_AGENT_PROMPT` / `buildTurnPrompt`。

## 场景清单（`cases.ts`）

| ID | 牵引的 prompt 规则 |
|----|-------------------|
| CS-intro | 导师≠助手；禁柯维金句 |
| CS-observation | 来源引用；先陈述再提问；长度 |
| CS-roles-draft | 草稿感；不说教 |
| DL-reactive | 「不得不」→「我选择」 |
| DL-pushback | 接得住反驳 |
| WR-open | 禁寒暄；最不后悔 |
| WR-confront-assert | 单点宣言vs行为 |
| WR-confront-coach | 第一周零硬对质 |

## 迭代闭环

```bash
# 1) 先看本地模板基线
npm run eval:mentor

# 2) 开 agent 后看云端润色
QODER_PAT=… npm run agent   # 另一终端
npm run eval:mentor:live

# 3) 读报告
# /opt/cursor/artifacts/mentor-eval-report.md
# 按「优先改 prompt 的方向」只改一条规则

# 4) 复跑 live，对比 score 是否上升
```

## 设计原则

1. **brief 是 ground truth**：本地 `respond()` 决定意图；云端只许润色。
2. **自动量规优先**：不依赖 judge LLM，prompt diff 可对比。
3. **失败→改动映射**：每个维度对应一句具体的 prompt 修改建议。
4. **宁可漏报不可唠叨** 等产品原则：用 `coachOnly` / `singleConfrontation` 固化进量规。
