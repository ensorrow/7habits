# macOS 原生壳（L3）

对应 `REQUIREMENTS.md` §2：菜单栏常驻 + 对话窗，通过 **EventKit** 读写系统日历/提醒事项。

## 结构

| 路径 | 职责 |
|------|------|
| `SevenHabitsCore/` | 平台无关 SPM：领域模型、日历分析、`CalendarProviding` 缝、导师 HTTP 客户端、内存日历测试双 |
| `SevenHabitsMentor/` | SwiftUI 菜单栏 App + EventKit 适配 |
| `SevenHabitsMentor.xcodeproj` | 打开即用的 Xcode 工程 |

导师**决策**仍在 TypeScript（`src/services/mentor.ts`），由本地 `npm run agent`（`:8787`）提供。原生壳只负责：

1. EventKit 读/写 → `CalendarEvent[]`（对齐 `src/types`）
2. UI：菜单栏 / 对话窗 / 角色仪表盘 / 设置
3. 把 context POST 到 `/api/mentor/turn`

这与 `.cursor/skills/macos-layered-validation.md` 中的集成选项 1 一致。

## 在 Mac 上运行

```bash
# 仓库根目录先装好依赖（只需一次）
npm install

# 打开原生工程
open macos/SevenHabitsMentor.xcodeproj
# Xcode → Run（⌘R）
```

启动时 App 会：

1. 探测 `http://127.0.0.1:8787`；若已有人起了 agent，直接复用
2. 否则（默认开启「自动拉起」）用 `/bin/zsh -lc "npm run agent"` 从仓库根目录拉起进程
3. 设置里可填 **仓库路径**、可选 **Qoder PAT**（写入子进程环境变量）

也可手动：`npm run agent`（另一终端）——App 检测到已在跑就不会再起一份。

退出 App 时，若 agent 是本 App 拉起的，会一并结束。

首次冷启动会按需求文档用导师口吻请求日历权限；授权后读取近 4 周 EventKit 事件。周回顾大石头与「第一次周回顾」会写回系统日历（notes 含 `[big-rock]` / `[seven-habits]`）。

## 测试（需 macOS）

```bash
cd macos/SevenHabitsCore
swift test
```

完整 App 构建：

```bash
xcodebuild -project macos/SevenHabitsMentor.xcodeproj \
  -scheme SevenHabitsMentor \
  -configuration Debug \
  -destination 'platform=macOS' \
  CODE_SIGNING_ALLOWED=NO \
  build
```

## GitHub 打包（Actions 产物）

CI（`.github/workflows/macos.yml`）在 macOS runner 上会额外打出 **Release `.app` zip** 并上传 Artifact：

1. 打开仓库 → **Actions** → **macOS L3**
2. 选一次成功的 run → **Artifacts** → 下载 `SevenHabitsMentor-macos-*.zip`
3. 解压得到 `SevenHabitsMentor.app`

也可手动触发：**Actions → macOS L3 → Run workflow**。勾选 *Also publish a GitHub Release* 会同时发到 Releases（无 Apple Developer 证书，**ad-hoc 签名、未公证**）。

本机首次打开若被 Gatekeeper 拦：右键 →「打开」，或：

```bash
xattr -dr com.apple.quarantine SevenHabitsMentor.app
```

菜单栏 App 会在启动时自动探测并（可选）拉起本机导师 API。仍依赖仓库里已 `npm install` 的 Node 工程；真正的「单文件开箱」要等内嵌决策逻辑。

启动后会：

- **每 15 分钟**定时扫描干预
- 监听 **`EKEventStoreChanged`**（日历变更后约 1.5s debounce 再扫）
- 对账大石头：EventKit 里被删/被会议覆盖 → `swallowed`；时段已过且仍在 → `done`
- 周回顾的大石头兑现率来自真实 `rocks`，不再硬编码 5/3
- **自动拉起** `npm run agent`（可关；设置里填仓库路径 + 可选 PAT）

> Cursor Cloud / Linux **无法**编译或运行本层（无 Swift/EventKit）。L1/L2 仍在 Linux 验证；L3 包由 GitHub Actions 的 `macos-14` runner 产出。
