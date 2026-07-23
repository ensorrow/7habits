# MentorAgent.tgz（开箱即用运行时）

发行版 / CI 会在打包前执行：

```bash
npm run package:agent
```

生成 `MentorAgent.tgz`（内含官方 Node 二进制 + esbuild 后的导师 API）。App 首次启动解压到
`~/Library/Application Support/SevenHabitsMentor/runtime/<VERSION>/`，再执行其中的 `run`。

本文件不进 git（体积约 30–40MB）；本地 Xcode 构建若缺失，Run Script 阶段会自动生成。
