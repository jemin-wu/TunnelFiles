---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
  - "src/**/*.css"
---

# 前端规范

## 技术栈

- React 19 + TypeScript (strict 模式)
- shadcn/ui (new-york 风格, neutral 主色)
- TailwindCSS 4 + CSS 变量
- react-hook-form + zod 表单验证
- TanStack Query (服务端状态)
- Zustand (客户端状态)

## 状态管理

- **TanStack Query**: 服务端状态（profiles、files 等 IPC 请求）
- **Zustand**: 客户端状态（传输任务队列、实时进度）
- Store 文件放置于 `src/stores/`
- Store 命名: `use<Name>Store.ts` (如 `useTransferStore.ts`)

## 路径别名

使用 `@/` 指向 `src/`:

```typescript
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
```

## 命名规范

- 组件文件: PascalCase (`FileList.tsx`)
- 工具文件: kebab-case (`use-theme.ts`)
- 函数/变量: camelCase (`handleUpload`)
- 类型/接口: PascalCase (`FileEntry`)
- 常量: UPPER_SNAKE_CASE (`MAX_CONCURRENT`)

## 代码规则

- 使用双引号、分号、2空格缩进
- 行宽限制 100 字符
- 未使用变量用 `_` 前缀
- 避免 `any` 类型
- 无需 `import React`（React 19）

## 添加 UI 组件

```bash
npx shadcn@latest add <component>
```

组件放置于 `src/components/ui/`，勿手动修改
