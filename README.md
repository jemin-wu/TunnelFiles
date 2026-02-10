# TunnelFiles

跨平台桌面 SSH/SFTP 可视化文件管理器，像 Finder 一样管理远程服务器文件。

## 功能特性

- **连接管理** - 保存多台服务器配置，支持密码和 SSH Key 认证
- **文件浏览** - 目录导航、面包屑路径、排序、文件属性展示
- **文件操作** - 新建文件夹、重命名、删除
- **文件传输** - 拖拽上传、下载队列、进度显示、并发控制
- **安全认证** - Host Key 指纹校验、密码存储到系统钥匙串

## 安装

### 方式一：Homebrew (macOS 推荐)

```bash
brew tap jemin-wu/tunnelfiles https://github.com/jemin-wu/TunnelFiles
brew install --cask tunnelfiles --no-quarantine
```

### 方式二：手动下载

从 [Releases](https://github.com/jemin-wu/TunnelFiles/releases) 下载对应系统的安装包：

| 系统                  | 文件                               |
| --------------------- | ---------------------------------- |
| macOS (Apple Silicon) | `TunnelFiles_x.x.x_aarch64.dmg`    |
| macOS (Intel)         | `TunnelFiles_x.x.x_x64.dmg`        |
| Windows               | `TunnelFiles_x.x.x_x64-setup.exe`  |
| Linux (Debian/Ubuntu) | `tunnelfiles_x.x.x_amd64.deb`      |
| Linux (AppImage)      | `TunnelFiles_x.x.x_amd64.AppImage` |

### macOS 安装说明

由于应用未经 Apple 签名，首次打开需要以下步骤之一：

**方法 A：右键打开**

1. 右键点击应用 → 打开
2. 在弹窗中点击「打开」

**方法 B：移除隔离属性（推荐）**

```bash
sudo xattr -rd com.apple.quarantine /Applications/TunnelFiles.app
```

### 从源码构建

```bash
git clone https://github.com/jemin-wu/TunnelFiles.git
cd TunnelFiles
pnpm install
pnpm tauri build
```

## 技术栈

- **前端**: React 19 + Vite 7 + TailwindCSS 4 + TypeScript
- **后端**: Rust + Tauri 2
- **通信**: Tauri IPC

## 开发

```bash
pnpm install        # 安装依赖
pnpm tauri dev      # 启动开发环境
pnpm tauri build    # 生产构建
pnpm lint           # ESLint 检查
pnpm format         # Prettier 格式化
```

## 测试策略

### 本地默认（不依赖 E2E）

```bash
pnpm run test:local   # 前端 Vitest + 后端单元测试（不含依赖 SSH 环境的集成测试）
```

如果只想跑前端测试：

```bash
pnpm run test:run
```

如果要跑后端 SSH 集成测试（需要 Docker SSH 环境）：

```bash
pnpm run test:backend:integration
pnpm run e2e:env:down
```

### E2E / 视觉回归（CI 强制）

- CI 会强制执行 `test:e2e` 和 `test:visual`。
- 本地执行 `pnpm run test:e2e` 时，如果当前平台不支持 `tauri-driver`，会自动跳过并返回成功（便于本地开发）。
- 若本地环境完整并想强制执行 E2E：

```bash
pnpm run e2e:env:up
E2E_FORCE=1 pnpm run test:e2e -- --spec test/e2e/specs/smoke.test.ts
pnpm run e2e:env:down
```

## IDE 配置

推荐使用 [VS Code](https://code.visualstudio.com/) 并安装以下插件：

- [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## 许可证

[MIT](LICENSE)
