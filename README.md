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

| 系统 | 文件 |
|------|------|
| macOS (Apple Silicon) | `TunnelFiles_x.x.x_aarch64.dmg` |
| macOS (Intel) | `TunnelFiles_x.x.x_x64.dmg` |
| Windows | `TunnelFiles_x.x.x_x64-setup.exe` |
| Linux (Debian/Ubuntu) | `tunnelfiles_x.x.x_amd64.deb` |
| Linux (AppImage) | `TunnelFiles_x.x.x_amd64.AppImage` |

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

## IDE 配置

推荐使用 [VS Code](https://code.visualstudio.com/) 并安装以下插件：

- [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## 许可证

[MIT](LICENSE)
