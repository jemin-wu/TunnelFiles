---
name: ui-refactor
description: |
  UI 组件重构。将自定义 div 替换为 shadcn/ui 组件，修复变体使用、硬编码颜色和中文。
  默认聚焦最近修改的文件，可指定目录。
user-invocable: true
context: fork
ultrathink: true
allowed-tools:
  - Read
  - Edit
  - Write
  - Glob
  - Grep
  - Bash(pnpm:*)
  - Bash(git:*)
  - TodoWrite
---

# UI Refactor

UI 组件重构专家，将自定义实现替换为 shadcn/ui 组件，确保一致性和可维护性。

**开始时宣布**："我正在使用 ui-refactor skill 重构 UI 组件。"

## 核心约束

```
绝不改变功能——只改进组件使用方式
```

## 重构流程

```
1. IDENTIFY   - 识别目标文件（指定目录或最近修改的 UI 文件）
2. INVENTORY  - 读取 variant-index.md 了解可用组件
3. ANALYZE    - 逐文件分析 UI 问题
4. INSTALL    - 安装缺少的 shadcn 组件（自动）
5. REFACTOR   - 应用修改
6. VERIFY     - 运行 type-check + lint
7. NOTIFY     - 通知用户进行视觉测试
```

## Step 1: 识别目标

**指定目录**：

```bash
# 用户指定
/ui-refactor app/settings/teams/[teamId]
```

**默认行为**（未指定时）：

```bash
# 最近修改的 UI 文件
git diff --name-only HEAD~5 | grep -E '\.(tsx)$'
```

## Step 2: 读取组件清单

```bash
cat .claude/skills/component-variants/references/variant-index.md
```

获取：

- 已安装组件列表
- 每个组件的 variant 选项
- 未安装但可用的组件

## Step 3: 分析问题

逐文件扫描以下问题：

| 问题类型   | 检测模式                               | 修复方式                 |
| ---------- | -------------------------------------- | ------------------------ |
| 自定义按钮 | `<button className=`                   | → `<Button variant=...>` |
| 自定义卡片 | `<div className="...rounded-xl border` | → `<Card>`               |
| 自定义单选 | 多个 button 做 radio 效果              | → `<RadioGroup>`         |
| 硬编码颜色 | `bg-[#xxx]`, `text-[#xxx]`             | → 主题 token             |
| 硬编码中文 | 中文字符串                             | → `{t('key')}`           |
| 冗余样式   | 与组件默认样式重复的 className         | → 删除                   |

## Step 4: 安装缺少的组件

如果需要的组件未安装，**自动安装**：

```bash
pnpm dlx shadcn@latest add <component>
```

安装后更新 `variant-index.md` 的状态。

## Step 5: 应用修改

### 5.1 组件替换

```tsx
// Before
<button
  onClick={handleClick}
  className="rounded-md bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
>
  提交
</button>

// After
<Button onClick={handleClick}>
  {t('submit')}
</Button>
```

### 5.2 卡片容器

```tsx
// Before
<div className="bg-card overflow-hidden rounded-xl border">
  <div className="border-b px-5 py-4">...</div>
</div>

// After
<Card>
  <CardContent className="border-b px-5 py-4">...</CardContent>
</Card>
```

### 5.3 单选组

```tsx
// Before
{
  options.map((opt) => (
    <button
      key={opt.value}
      onClick={() => setValue(opt.value)}
      className={cn(
        'rounded-xl border-2 p-4',
        value === opt.value ? 'border-primary' : 'border-border'
      )}
    >
      {isSelected && <Check />}
      {opt.label}
    </button>
  ))
}

// After
;<RadioGroup value={value} onValueChange={setValue}>
  {options.map((opt) => (
    <div key={opt.value} className="flex items-center space-x-2">
      <RadioGroupItem value={opt.value} id={opt.value} />
      <Label htmlFor={opt.value}>{opt.label}</Label>
    </div>
  ))}
</RadioGroup>
```

### 5.4 硬编码颜色

```tsx
// Before
<div className="bg-[#6366f1] text-white">

// After
<div className="bg-primary text-primary-foreground">
```

### 5.5 硬编码中文

```tsx
// Before
<Button>提交</Button>
<p>确定要删除吗？</p>

// After
<Button>{t('submit')}</Button>
<p>{t('deleteConfirm')}</p>
```

需要同时更新 `messages/zh.json` 和 `messages/en.json`。

## Step 6: 验证

```bash
pnpm type-check && pnpm lint:fix
```

如果失败，修复问题后重试。

## Step 7: 通知用户

```
✅ UI 重构完成

修改的文件：
- app/settings/teams/[teamId]/general/page.tsx
- app/settings/teams/[teamId]/estimates/page.tsx
- ...

安装的组件：
- RadioGroup

请在浏览器中测试以下页面：
- /settings/teams/xxx/general
- /settings/teams/xxx/estimates

确认视觉效果和交互正常后，可以提交。
```

## 约束

### MUST

1. 保持所有原有功能不变
2. 先读取 variant-index.md 再开始重构
3. 缺少组件时自动安装
4. 改完后运行 type-check + lint
5. 硬编码中文必须同时更新 i18n 文件

### MUST NOT

1. 改变组件的业务逻辑
2. 删除有意义的自定义样式
3. 在门禁未通过时声明完成
4. 遗漏 i18n 翻译（en.json）

## 特殊情况处理

### 复杂自定义组件

如果自定义组件有复杂交互（动画、特殊状态），评估：

- shadcn 组件能否覆盖？
- 是否需要扩展 variant？
- 保持自定义但改用 shadcn 基础组件？

### 设计系统差异

如果现有设计与 shadcn 默认风格差异大：

- 优先使用 shadcn 组件 + className 定制
- 不要为了"完全一致"而放弃组件化
