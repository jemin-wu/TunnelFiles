# P9: 表单弹框改为页面

## 目标

将表单类弹框改为独立页面，提升用户体验和交互一致性。

## 改造范围

### 需要改造的弹框

| 弹框组件 | 当前位置 | 目标路由 |
|---------|---------|---------|
| `ConnectionFormDialog` | `ConnectionsPage` 内弹框 | `/connections/new`、`/connections/:id/edit` |
| `SettingsDialog` | `MainLayout` 内弹框 | `/settings` |

### 保留弹框的组件

以下组件保持弹框形式（符合即时确认/输入的交互模式）：

- `HostKeyDialog` - 连接流程中的 SSH 指纹确认
- `PasswordDialog` - 连接流程中的密码/口令输入
- `DeleteConfirmDialog` - 文件删除二次确认
- `RenameDialog` - 文件重命名
- `CreateFolderDialog` - 新建文件夹
- `ConnectionCard` 内的删除确认 - 连接配置删除确认

---

## 任务清单

### T1: 连接表单页面化

#### T1.1 创建连接表单页面
- [ ] 创建 `src/pages/ConnectionFormPage.tsx`
- [ ] 复用 `ConnectionFormDialog` 的表单逻辑
- [ ] 页面布局：居中卡片式表单，带返回按钮
- [ ] 支持新增模式 (`/connections/new`)
- [ ] 支持编辑模式 (`/connections/:id/edit`)

#### T1.2 更新路由配置
- [ ] 在 `router.tsx` 添加路由：
  - `connections/new` -> `ConnectionFormPage`
  - `connections/:id/edit` -> `ConnectionFormPage`

#### T1.3 更新 ConnectionsPage
- [ ] 移除 `ConnectionFormDialog` 引用
- [ ] 「新增连接」按钮改为跳转 `/connections/new`
- [ ] 移除 `formOpen`、`editingProfile` 状态

#### T1.4 更新 ConnectionCard
- [ ] 「编辑」操作改为跳转 `/connections/:id/edit`
- [ ] 移除编辑相关回调

#### T1.5 清理
- [ ] 删除 `src/components/connections/ConnectionFormDialog.tsx`

---

### T2: 设置页面化

#### T2.1 创建设置页面
- [ ] 创建 `src/pages/SettingsPage.tsx`
- [ ] 复用 `SettingsDialog` 的设置逻辑
- [ ] 页面布局：左侧导航 + 右侧内容（预留分类扩展）
- [ ] 保存后自动生效，无需确认按钮

#### T2.2 更新路由配置
- [ ] 在 `router.tsx` 添加路由：`settings` -> `SettingsPage`

#### T2.3 更新 MainLayout
- [ ] 设置按钮改为跳转 `/settings`
- [ ] 移除 `SettingsDialog` 引用
- [ ] 移除 `settingsOpen` 状态

#### T2.4 清理
- [ ] 删除 `src/components/settings/SettingsDialog.tsx`

---

## 验收标准

### 功能验收
- [ ] `/connections/new` 可正常新增连接，保存后跳转回列表
- [ ] `/connections/:id/edit` 可正常编辑连接，保存后跳转回列表
- [ ] `/settings` 可正常修改设置，修改即时生效
- [ ] 表单验证逻辑保持不变
- [ ] 浏览器前进/后退正常工作

### 交互验收
- [ ] 页面切换流畅，无闪烁
- [ ] 未保存离开时有确认提示（可选 V2）
- [ ] 移动端响应式布局正常

### 代码验收
- [ ] 无残留的弹框相关代码
- [ ] 路由配置清晰规范
- [ ] 组件命名一致

---

## 技术方案

### 路由结构

```
/
├── connections              # 连接列表页
│   ├── new                  # 新增连接页
│   └── :id/edit             # 编辑连接页
├── files/:sessionId         # 文件管理页
└── settings                 # 设置页
```

### 页面组件结构

```
src/pages/
├── ConnectionsPage.tsx      # 连接列表（已有）
├── ConnectionFormPage.tsx   # 连接表单（新增）
├── FileManagerPage.tsx      # 文件管理（已有）
├── SettingsPage.tsx         # 设置页（新增）
└── NotFoundPage.tsx         # 404（已有）
```

### 表单页面布局参考

```tsx
// ConnectionFormPage 布局示意
<div className="h-full flex flex-col">
  {/* 顶部工具栏 */}
  <div className="flex items-center px-6 py-4 border-b">
    <Button variant="ghost" onClick={goBack}>
      <ChevronLeft /> 返回
    </Button>
    <h2>{isEdit ? "编辑连接" : "新增连接"}</h2>
  </div>

  {/* 表单内容 */}
  <div className="flex-1 overflow-auto p-6">
    <Card className="max-w-2xl mx-auto">
      {/* 表单字段 */}
    </Card>
  </div>
</div>
```

---

## 依赖关系

- 无后端改动
- 无新增依赖
- 复用现有 UI 组件

## 风险点

- 表单状态在页面切换时需要正确重置
- 编辑页面需要处理 profile 不存在的情况（跳转 404 或返回列表）
