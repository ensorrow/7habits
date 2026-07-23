# macOS 原生壳（L3）

对应 `REQUIREMENTS.md` §2：菜单栏常驻 + 对话窗，通过 **EventKit** 读写系统日历/提醒事项。

## 结构

| 路径 | 职责 |
|------|------|
| `SevenHabitsCore/` | 平台无关 SPM：领域模型、日历分析、`CalendarProviding` 缝、导师 HTTP 客户端、内存日历测试双 |
| `SevenHabitsMentor/` | SwiftUI 菜单栏 App + EventKit 适配 + **内置导师运行时解压/拉起** |
| `SevenHabitsMentor.xcodeproj` | 打开即用的 Xcode 工程 |
| `Resources/MentorAgent.tgz` | 由 `npm run package:agent` 生成：官方 Node + esbuild 后的决策 API |

## 开箱即用（发行版）

CI 打出的 `.app` 内嵌 `MentorAgent.tgz`。首次启动会：

1. 若 `:8787` 已有服务 → 直接复用
2. 否则把 tgz **解压**到 `~/Library/Application Support/SevenHabitsMentor/runtime/<VERSION>/`
3. 执行其中的 `run`（自带 `bin/node` + `index.cjs`）
4. 设置里可选填 **Qoder PAT**（只影响话术润色）

**不需要**本机安装 Node，也不需要 clone 仓库再 `npm run agent`。

## 在 Mac 上从源码运行

```bash
# 仓库根目录
npm install
npm run package:agent   # 生成 Resources/MentorAgent.tgz（Xcode 构建阶段也会跑）

open macos/SevenHabitsMentor.xcodeproj
# Xcode → Run（⌘R）
```

若暂时没有 tgz，设置 → 开发者选项里可填仓库路径，回退到 `npm run agent`。

退出 App 时，若 agent 是本 App 拉起的，会一并结束。

首次冷启动会按需求文档用导师口吻请求日历权限；授权后读取近 4 周 EventKit 事件。周回顾大石头与「第一次周回顾」会写回系统日历（notes 含 `[big-rock]` / `[seven-habits]`）。

## 测试（需 macOS）

```bash
cd macos/SevenHabitsCore
swift test
```

完整 App 构建：

```bash
npm run package:agent
xcodebuild -project macos/SevenHabitsMentor.xcodeproj \
  -scheme SevenHabitsMentor \
  -configuration Debug \
  -destination 'platform=macOS' \
  CODE_SIGNING_ALLOWED=NO \
  build
```

## GitHub 打包（Actions 产物）

CI（`.github/workflows/macos.yml`）在 macOS runner 上会：

1. `npm run package:agent`（打入 arm64 Node + 决策 bundle）
2. `xcodebuild` Release → 校验 `.app/Contents/Resources/MentorAgent.tgz` 存在
3. 上传 **Release `.app` zip** Artifact

下载后解压即可用；Gatekeeper 拦截时：

```bash
xattr -dr com.apple.quarantine SevenHabitsMentor.app
```

启动后会：

- **每 15 分钟**定时扫描干预
- 监听 **`EKEventStoreChanged`**（日历变更后约 1.5s debounce 再扫）
- 对账大石头：EventKit 里被删/被会议覆盖 → `swallowed`；时段已过且仍在 → `done`
- 周回顾的大石头兑现率来自真实 `rocks`

> Cursor Cloud / Linux **无法**编译或运行本层（无 Swift/EventKit）。L1/L2 仍在 Linux 验证；L3 包由 GitHub Actions 的 `macos-14` runner 产出。可在 Linux 上跑 `npm run package:agent` 交叉打出 darwin-arm64 的 tgz。
