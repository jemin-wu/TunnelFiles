# Component Variant Index

项目 shadcn/ui 组件变体索引。frontend-design 技能使用此文档选择合适的变体。

## shadcn/ui 组件安装状态

**已安装** - 直接使用：

| 组件         | 用途       | 安装命令  |
| ------------ | ---------- | --------- |
| Accordion    | 折叠面板   | ✅ 已安装 |
| Alert        | 提示框     | ✅ 已安装 |
| AlertDialog  | 确认对话框 | ✅ 已安装 |
| Avatar       | 用户头像   | ✅ 已安装 |
| Badge        | 标签徽章   | ✅ 已安装 |
| Breadcrumb   | 面包屑     | ✅ 已安装 |
| Button       | 按钮       | ✅ 已安装 |
| Calendar     | 日历       | ✅ 已安装 |
| Card         | 卡片容器   | ✅ 已安装 |
| Checkbox     | 复选框     | ✅ 已安装 |
| Collapsible  | 可折叠区域 | ✅ 已安装 |
| ContextMenu  | 右键菜单   | ✅ 已安装 |
| Dialog       | 对话框     | ✅ 已安装 |
| DropdownMenu | 下拉菜单   | ✅ 已安装 |
| Form         | 表单       | ✅ 已安装 |
| Input        | 输入框     | ✅ 已安装 |
| Label        | 标签       | ✅ 已安装 |
| Pagination   | 分页       | ✅ 已安装 |
| Popover      | 弹出框     | ✅ 已安装 |
| Progress     | 进度条     | ✅ 已安装 |
| RadioGroup   | 单选组     | ✅ 已安装 |
| ScrollArea   | 滚动区域   | ✅ 已安装 |
| Select       | 下拉选择   | ✅ 已安装 |
| Separator    | 分隔线     | ✅ 已安装 |
| Sheet        | 侧边抽屉   | ✅ 已安装 |
| Sidebar      | 侧边栏     | ✅ 已安装 |
| Skeleton     | 骨架屏     | ✅ 已安装 |
| Slider       | 滑块       | ✅ 已安装 |
| Sonner       | Toast 通知 | ✅ 已安装 |
| Switch       | 开关       | ✅ 已安装 |
| Table        | 表格       | ✅ 已安装 |
| Tabs         | 标签页     | ✅ 已安装 |
| Textarea     | 多行输入   | ✅ 已安装 |
| Toggle       | 切换按钮   | ✅ 已安装 |
| Tooltip      | 工具提示   | ✅ 已安装 |

**未安装** - 需要时先安装：

| 组件           | 用途       | 安装命令                                     |
| -------------- | ---------- | -------------------------------------------- |
| AspectRatio    | 宽高比容器 | `pnpm dlx shadcn@latest add aspect-ratio`    |
| Carousel       | 轮播图     | `pnpm dlx shadcn@latest add carousel`        |
| Chart          | 图表       | `pnpm dlx shadcn@latest add chart`           |
| Command        | 命令面板   | `pnpm dlx shadcn@latest add command`         |
| DataTable      | 数据表格   | 组合 Table + tanstack                        |
| DatePicker     | 日期选择器 | 组合 Popover + Calendar                      |
| Drawer         | 抽屉       | `pnpm dlx shadcn@latest add drawer`          |
| HoverCard      | 悬浮卡片   | `pnpm dlx shadcn@latest add hover-card`      |
| InputOTP       | 验证码输入 | `pnpm dlx shadcn@latest add input-otp`       |
| Menubar        | 菜单栏     | `pnpm dlx shadcn@latest add menubar`         |
| NavigationMenu | 导航菜单   | `pnpm dlx shadcn@latest add navigation-menu` |
| Resizable      | 可调整大小 | `pnpm dlx shadcn@latest add resizable`       |
| ToggleGroup    | 切换按钮组 | `pnpm dlx shadcn@latest add toggle-group`    |

---

## Button

**源文件**: `components/ui/button-variants.ts`

### variant

| 值            | 场景                         | 示例                                          |
| ------------- | ---------------------------- | --------------------------------------------- |
| `default`     | 主要操作（创建、提交、确认） | `<Button>创建项目</Button>`                   |
| `secondary`   | 次要操作（返回、上一步）     | `<Button variant="secondary">返回</Button>`   |
| `outline`     | 中性操作（取消、关闭）       | `<Button variant="outline">取消</Button>`     |
| `ghost`       | 工具栏/紧凑场景              | `<Button variant="ghost" size="icon">`        |
| `destructive` | 危险操作（删除、移除）       | `<Button variant="destructive">删除</Button>` |
| `link`        | 内联链接样式                 | `<Button variant="link">了解更多</Button>`    |

### size

| 值        | 场景            | 尺寸  |
| --------- | --------------- | ----- |
| `default` | 标准按钮        | h-9   |
| `sm`      | 紧凑场景/表格内 | h-8   |
| `lg`      | 强调/CTA        | h-10  |
| `icon`    | 图标按钮        | 36x36 |
| `icon-sm` | 紧凑图标按钮    | 32x32 |
| `icon-lg` | 大图标按钮      | 40x40 |

### 组合模式

```tsx
// 工具栏按钮组
<div className="flex gap-1">
  <Button variant="ghost" size="icon-sm"><Icon /></Button>
  <Button variant="ghost" size="icon-sm"><Icon /></Button>
</div>

// 对话框底部
<DialogFooter>
  <Button variant="outline">{t('cancel')}</Button>
  <Button>{t('confirm')}</Button>
</DialogFooter>

// 危险操作确认
<AlertDialogAction asChild>
  <Button variant="destructive">{t('delete')}</Button>
</AlertDialogAction>
```

## Badge

**源文件**: `components/ui/badge.tsx`

| variant       | 场景                   | 示例                                          |
| ------------- | ---------------------- | --------------------------------------------- |
| `default`     | 主要标签（状态、类型） | `<Badge>进行中</Badge>`                       |
| `secondary`   | 次要标签（分类、标签） | `<Badge variant="secondary">前端</Badge>`     |
| `outline`     | 轻量标签               | `<Badge variant="outline">草稿</Badge>`       |
| `destructive` | 警告/错误标签          | `<Badge variant="destructive">已过期</Badge>` |

### 扩展建议

项目状态标签建议扩展：

```tsx
// 建议新增的 status 变体
variant: {
  success: 'border-transparent bg-status-success/15 text-status-success',
  warning: 'border-transparent bg-status-warning/15 text-status-warning',
  danger: 'border-transparent bg-status-danger/15 text-status-danger',
  info: 'border-transparent bg-status-info/15 text-status-info',
}
```

## Alert

**源文件**: `components/ui/alert.tsx`

| variant       | 场景          |
| ------------- | ------------- |
| `default`     | 信息提示      |
| `destructive` | 错误/警告提示 |

### 扩展建议

```tsx
// 建议新增
variant: {
  success: 'border-status-success/50 bg-status-success/10 text-status-success [&>svg]:text-status-success',
  warning: 'border-status-warning/50 bg-status-warning/10 text-status-warning [&>svg]:text-status-warning',
}
```

## Card

**源文件**: `components/ui/card.tsx`

Card 无内置变体，通过 className 定制：

| 场景     | className                                                |
| -------- | -------------------------------------------------------- |
| 默认     | `shadow-sm`                                              |
| 悬停效果 | `transition-shadow hover:shadow-md`                      |
| 可点击   | `cursor-pointer hover:shadow-md hover:border-primary/20` |
| 紧凑     | `py-4 gap-4`                                             |
| 无边框   | `border-0 shadow-none`                                   |

### 组合模式

```tsx
// 列表项卡片
<Card className="py-4 gap-3 transition-shadow hover:shadow-md cursor-pointer">
  <CardContent className="flex items-center gap-3">
    ...
  </CardContent>
</Card>

// 统计卡片
<Card className="py-4">
  <CardHeader className="pb-2">
    <CardDescription>{t('label')}</CardDescription>
    <CardTitle className="text-2xl">{value}</CardTitle>
  </CardHeader>
</Card>
```

## Toggle

**源文件**: `components/ui/toggle.tsx`

| variant   | 场景       |
| --------- | ---------- |
| `default` | 标准切换   |
| `outline` | 带边框切换 |

## 无变体组件

以下组件无内置变体，通过 className 定制：

- `Input` - 单一样式
- `Textarea` - 单一样式
- `Select` - 单一样式
- `Checkbox` - 单一样式
- `Switch` - 单一样式
- `Separator` - 单一样式
- `Skeleton` - 单一样式

## 新增变体流程

1. 编辑对应的变体文件（如 `button-variants.ts`）
2. 添加新的 variant 值和样式
3. 更新此索引文档
4. 通知 frontend-design 技能使用新变体
