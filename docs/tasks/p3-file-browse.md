## 阶段 P3: 文件浏览

### P3-1: 实现 SftpService 基础
- **状态**: [x] ✅
- **类型**: 后端
- **等级**: L2 (标准层)
- **依赖**: P2-7
- **描述**: 封装 SFTP 操作基础服务
- **产出**:
  - 文件: `src-tauri/src/services/sftp_service.rs`
  - 获取 Session 的 SFTP Channel
  - 路径规范化处理
  - 错误映射到 AppError
- **验收标准**:
  - 功能:
    - [x] 从 SessionManager 获取 SFTP Channel
    - [x] 路径规范化: 处理 `..`, `.`, 重复 `/`
    - [x] 支持绝对路径和相对路径
  - 安全:
    - [x] 路径遍历防护 (不允许跳出根目录)
    - [x] 特殊字符转义处理
  - 错误处理:
    - [x] ssh2 错误映射到 AppError
    - [x] 会话断开返回 NETWORK_LOST
    - [x] 权限不足返回 PERMISSION_DENIED
  - 可维护:
    - [x] 统一的错误映射表
    - [ ] SFTP 操作封装为 trait (V2 优化)
  - 测试:
    - [x] 路径规范化测试
    - [x] 错误映射测试
- **备注**: 2026-01-11 完成核心功能，trait 封装留待 V2

---

### P3-2: 实现 sftp_list_dir 命令
- **状态**: [x] ✅
- **类型**: 后端
- **等级**: L2 (标准层)
- **依赖**: P3-1
- **描述**: 列出远程目录内容
- **产出**:
  - 文件: `src-tauri/src/commands/sftp.rs`
  - 命令: `sftp_list_dir(session_id: String, path: String, sort: Option<SortSpec>) -> Vec<FileEntry>`
  - FileEntry:
    ```rust
    struct FileEntry {
        name: String,
        path: String,
        is_dir: bool,
        size: Option<u64>,
        mtime: Option<i64>,
        mode: Option<u32>,
    }
    ```
  - SortSpec: `{ field: "name"|"size"|"mtime", order: "asc"|"desc" }`
- **验收标准**:
  - 功能:
    - [x] 返回目录下所有文件和子目录
    - [x] FileEntry 包含完整属性
    - [x] 排序支持 name/size/mtime 升降序
    - [x] 默认按名称升序，目录优先
    - [x] 过滤 `.` 和 `..` 条目
  - 边界条件:
    - [x] 空目录返回空数组
    - [x] 路径不存在返回 NOT_FOUND
    - [x] 路径是文件返回 INVALID_ARGUMENT
    - [x] 大目录 (>5000) 正常返回
  - 性能:
    - [ ] 流式读取，不一次性加载到内存 (ssh2 限制，V2)
    - [x] 大目录响应时间 <2s (integration_tests.rs)
  - 错误处理:
    - [x] 权限不足返回 PERMISSION_DENIED
    - [x] 会话断开返回 NETWORK_LOST
  - 测试:
    - [x] 普通目录列表测试
    - [x] 排序功能测试
    - [x] 大目录性能测试 (integration_tests.rs)
- **备注**: 2026-01-11 完成核心功能，流式读取受 ssh2 库限制

---

### P3-3: 实现 sftp_stat 命令
- **状态**: [x] ✅
- **类型**: 后端
- **等级**: L1 (基础层 - 可选功能)
- **依赖**: P3-1
- **描述**: 获取单个文件/目录元信息
- **产出**:
  - 命令: `sftp_stat(session_id: String, path: String) -> FileEntry`
- **验收标准**:
  - 功能:
    - [x] 返回完整的 FileEntry 结构
    - [x] 支持文件和目录
  - 边界条件:
    - [x] 路径不存在返回 NOT_FOUND
    - [x] 符号链接正确解析 (integration_tests.rs)
  - 错误处理:
    - [x] 权限不足返回 PERMISSION_DENIED
- **备注**: 2026-01-11 完成

---

### P3-4: 前端目录列表状态管理
- **状态**: [x] ✅
- **类型**: 前端
- **等级**: L2 (标准层)
- **依赖**: P0-4, P1-6
- **描述**: 使用 TanStack Query 管理目录数据
- **产出**:
  - `src/hooks/useFileList.ts`
  - `useQuery` 封装 `sftp_list_dir`
  - 缓存 key: `['files', sessionId, path, sort]`
  - 提供 `refetch` 刷新方法
  - 处理 loading/error 状态
- **验收标准**:
  - 功能:
    - [x] useQuery 正确封装 IPC 调用
    - [x] 缓存 key 包含 sessionId + path + sort
    - [x] refetch 强制刷新数据
    - [x] 路径变化自动重新查询
    - [x] loading/error/success 状态正确暴露
  - 性能:
    - [x] 同路径短时间内不重复请求 (staleTime 配置)
    - [x] 后台刷新不阻塞 UI (isFetching 区分)
  - 错误处理:
    - [x] 错误时提供 retry 方法
    - [x] 错误信息传递给 Toast
  - 可维护:
    - [x] TypeScript 类型完整
    - [x] 支持配置 staleTime/cacheTime (lib/query.ts)
  - 测试:
    - [ ] 缓存命中测试 (需集成测试)
    - [ ] 路径切换测试 (需集成测试)
- **备注**: 2026-01-11 完成

---

### P3-5: 前端文件列表组件
- **状态**: [x] ✅
- **类型**: 前端
- **等级**: L3 (高标准层 - 性能敏感)
- **依赖**: P3-4
- **描述**: 文件列表展示组件（支持虚拟列表）
- **产出**:
  - `src/components/file-browser/FileList.tsx`
  - `src/components/file-browser/FileListContainer.tsx`
  - `src/components/file-browser/FileIcon.tsx`
  - `src/hooks/useFileSelection.ts`
  - 使用 `@tanstack/react-virtual`
  - 列: 图标、名称、大小、修改时间
  - 双击目录进入
  - 点击表头排序
  - 选中状态（单选，后续扩展多选）
- **验收标准**:
  - 功能:
    - [x] 列显示: 图标、名称、大小、修改时间
    - [x] 文件类型图标正确 (目录/文件/各类型)
    - [x] 双击目录触发进入事件
    - [x] 单击选中，支持键盘 ↑↓ 切换
    - [x] 表头点击切换排序 (升/降序指示器)
    - [x] 目录优先排序选项 (后端排序)
  - 性能:
    - [x] 虚拟列表: 仅渲染可见行 (overscan=5)
    - [ ] 5000+ 条目滚动 60fps (需实际测试)
    - [ ] 快速滚动无白屏闪烁 (需实际测试)
    - [x] 内存占用与可见行成正比
  - 边界条件:
    - [x] 空目录显示 EmptyState
    - [x] 长文件名截断 + tooltip
    - [x] 大小格式化 (KB/MB/GB)
    - [x] 时间本地化格式 (相对时间 + 完整日期)
  - 可维护:
    - [x] 列宽可配置 (V2) - 已实现 (useColumnWidths.ts)
    - [x] 排序逻辑抽离 (FileListContainer 管理)
  - 测试:
    - [ ] 虚拟列表渲染测试 (需集成测试)
    - [ ] 排序交互测试 (需集成测试)
    - [ ] 大数据集性能基准测试 (需集成测试)
- **备注**: 2026-01-11 完成核心功能

---

### P3-6: 前端面包屑导航组件
- **状态**: [x] ✅
- **类型**: 前端
- **等级**: L1 (基础层)
- **依赖**: P3-4
- **描述**: 路径面包屑导航
- **产出**:
  - `src/components/file-browser/Breadcrumb.tsx`
  - `src/lib/file.ts` (parsePath 函数)
  - 解析路径为层级数组
  - 点击层级跳转到对应目录
  - 根目录显示为 `/` 或 `~`
- **验收标准**:
  - 功能:
    - [x] 路径解析为层级数组
    - [x] 点击层级跳转到对应目录
    - [x] 根目录显示为 `/` 或主机名
    - [x] 当前目录高亮显示
  - 边界条件:
    - [x] 空路径显示根目录
    - [x] 超长路径折叠显示 (省略中间层级，下拉菜单展示)
    - [x] 特殊字符路径正确显示
  - 可维护:
    - [x] 路径解析逻辑独立为工具函数 (lib/file.ts)
- **备注**: 2026-01-11 完成

---

