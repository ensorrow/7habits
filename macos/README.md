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
# 终端 1：导师 API（仓库根目录）
npm install
npm run agent

# 终端 2：打开原生工程
open macos/SevenHabitsMentor.xcodeproj
# Xcode → Run（⌘R）
```

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

菜单栏 App 仍依赖本机导师 API：仓库根目录 `npm run agent`（默认 `http://127.0.0.1:8787`）。

> Cursor Cloud / Linux **无法**编译或运行本层（无 Swift/EventKit）。L1/L2 仍在 Linux 验证；L3 包由 GitHub Actions 的 `macos-14` runner 产出。
