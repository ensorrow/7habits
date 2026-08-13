# 7习惯导师

深度践行《高效能人士的7个习惯》的个人导师——把书里的「亲自试一试」做成能用的练习册，并在具体事件里当你思维方式的镜子。

详见 [REQUIREMENTS.md](./REQUIREMENTS.md)。

## 运行

```bash
npm install
npm run dev:all   # Vite UI + Qoder mentor agent API (8787)
```

浏览器打开提示的本地地址。仅 UI（本地规则引擎）：`npm run dev`。仅 Agent 服务：`npm run agent`。

MVP 为 Web 原型（模拟菜单栏 + 对话窗 + 角色仪表盘），日历数据为本地 mock。对话**决策**仍由本地规则引擎驱动；在设置里粘贴 Qoder PAT（或配置 `QODER_PAT` / `QODER_PERSONAL_ACCESS_TOKEN`）后，表达层走 [Qoder Cloud Agents](https://docs.qoder.com/cloud-agents/api/models/list)（写死 `model=auto`）润色话术。

**macOS 原生壳（L3）** 在 [`macos/`](./macos/)：菜单栏 App + EventKit。发行版内嵌 `MentorAgent.tgz`（Node + 决策 API），首次启动解压到 Application Support，填 PAT 即可润色话术——不必再手动 `npm run agent`。详见 [`macos/README.md`](./macos/README.md)。

```bash
npm run dev:all
# 打开设置 → 粘贴 PAT →「保存并检测」
```

也可继续用环境变量：

```bash
export QODER_PAT=your-pat
# 或: export QODER_PERSONAL_ACCESS_TOKEN=your-pat
npm run agent   # 原生壳依赖此服务
open macos/SevenHabitsMentor.xcodeproj
```

Web 原型继续用 mock；原生壳经 EventKit 接入真实日历。

## MVP 覆盖

- **练习册**：书中「亲自试一试」的替代——10 张活表（影响圈、语言改写、角色、使命草稿、四象限、大石头、关系账户、先听懂、第三方案、磨刀）。对话填表，不依赖日历
- 冷启动 10 分钟流程（权限 → 陈述观察 → 三角色萃取 → 第一次周回顾之约）
- 日常对话（苏格拉底式、语言模式追踪、宣言 vs 行为）
- 周回顾三幕剧（回顾-对质-排程）
- 角色仪表盘 / 使命草稿 / 情感账户
- 主动干预预算制（P0–P3）与声量设置
- **macOS L3**：菜单栏 + 对话窗 + EventKit 日历读写（`macos/`）
