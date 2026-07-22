# 7习惯导师

深度践行《高效能人士的7个习惯》的个人导师——不是帮你挤时间的秘书，而是一面思维方式的镜子。

详见 [REQUIREMENTS.md](./REQUIREMENTS.md)。

## 运行

```bash
npm install
npm run dev:all   # Vite UI + Qoder mentor agent API (8787)
```

浏览器打开提示的本地地址。仅 UI（本地规则引擎）：`npm run dev`。仅 Agent 服务：`npm run agent`。

MVP 为 Web 原型（模拟菜单栏 + 对话窗 + 角色仪表盘），日历数据为本地 mock。对话**决策**仍由本地规则引擎驱动；在设置里粘贴 Qoder PAT（或配置 `QODER_PERSONAL_ACCESS_TOKEN`）后，表达层走 [Qoder Agent SDK](https://docs.qoder.com/en/cli/sdk/quick-start) 润色话术。

```bash
npm run dev:all
# 打开设置 → 粘贴 PAT →「保存并检测」
```

也可继续用环境变量：

```bash
export QODER_PERSONAL_ACCESS_TOKEN=your-pat
npm run dev:all
```

本地已 `qodercli login` 时也可：`QODER_USE_CLI_AUTH=1 npm run agent`。

架构预留 EventKit / macOS 原生接入。

## MVP 覆盖

- 冷启动 10 分钟流程（权限 → 陈述观察 → 三角色萃取 → 第一次周回顾之约）
- 日常对话（苏格拉底式、语言模式追踪、宣言 vs 行为）
- 周回顾三幕剧（回顾-对质-排程）
- 角色仪表盘 / 使命草稿 / 情感账户
- 主动干预预算制（P0–P3）与声量设置
