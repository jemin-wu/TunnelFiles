---
name: component-variants
description: |
  shadcn/ui 组件变体索引与管理。
  为 frontend-design 技能提供变体选择参考，确保组件使用一致性。
  当用户询问组件变体或 frontend-design 需要变体信息时使用。
user-invocable: false
context: fork
ultrathink: false
allowed-tools:
  - Read
  - Edit
  - Glob
  - Grep
---

# Component Variants

shadcn/ui 组件变体索引与管理技能。

## 核心职责

1. **变体索引维护** - 维护 `references/variant-index.md` 作为组件变体单一信息源
2. **变体选择建议** - 为 frontend-design 提供场景化变体推荐
3. **新变体定义** - 当现有变体无法满足需求时，扩展组件变体

## 变体索引

变体索引位于 `references/variant-index.md`，包含：

| 组件   | 变体类型             | 扩展建议 |
| ------ | -------------------- | -------- |
| Button | variant, size        | 无       |
| Badge  | variant              | 状态变体 |
| Alert  | variant              | 状态变体 |
| Card   | 无（className 定制） | 无       |
| Toggle | variant              | 无       |

## 工作流程

### 场景 1：变体查询

```
frontend-design: "需要一个删除按钮的变体"
    ↓
读取 variant-index.md
    ↓
返回: Button variant="destructive"
```

### 场景 2：新变体需求

```
frontend-design: "需要成功状态的 Badge"
    ↓
检查 variant-index.md → 无 success 变体
    ↓
扩展 Badge 变体:
1. 编辑 components/ui/badge.tsx
2. 添加 success 变体样式
3. 更新 variant-index.md
    ↓
返回: Badge variant="success"
```

### 场景 3：特殊需求（兜底）

```
frontend-design: "需要渐变背景的按钮"
    ↓
检查 variant-index.md → 无渐变变体
    ↓
评估: 过于特殊，不适合作为通用变体
    ↓
建议: 使用 Tailwind className 自定义
返回: <Button className="bg-gradient-to-r from-primary to-accent">
```

## 变体扩展规范

### 何时扩展变体

- ✅ 多处复用的样式模式
- ✅ 符合设计系统的语义化状态
- ✅ 与现有变体风格一致

### 何时使用 className

- ❌ 一次性特殊样式
- ❌ 过于具体的业务样式
- ❌ 与设计系统风格不符

### 扩展步骤

1. 编辑组件源文件（`components/ui/*.tsx` 或 `*-variants.ts`）
2. 添加新的 variant 值和对应样式
3. 更新 `references/variant-index.md`
4. 通知 frontend-design 使用新变体

## 与 frontend-design 协作

```
frontend-design 接收 UI 需求
    ↓
读取 component-variants/references/variant-index.md
    ↓
├── 匹配到变体 → 直接使用
├── 无匹配但适合扩展 → 调用本技能扩展变体 → 使用
└── 过于特殊 → Tailwind className 兜底
```

## 资源

- `references/variant-index.md` - 组件变体索引（单一信息源）
