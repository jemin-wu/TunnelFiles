# 测试规范

## 通用原则

- 测试应当简洁、可读、可维护
- 每个测试只验证一个行为
- 测试命名应清晰描述被测行为
- 避免测试实现细节，关注公共接口
- Mock 外部依赖，不 Mock 被测模块内部

---

## 前端测试

### 技术栈

- Vitest (测试运行器)
- @testing-library/react (组件测试)
- @testing-library/user-event (用户交互)
- jsdom (DOM 环境)

### 文件组织

所有测试文件统一放在根目录的 `__tests__` 文件夹中，按源码目录结构组织：

```
__tests__/
  setup.ts                    # 全局测试设置
  mocks/
    tauri.ts                  # Tauri API mock
  hooks/
    useConnect.test.tsx       # Hook 测试
    useFileList.test.tsx
    useFileOperations.test.tsx
    useDropUpload.test.tsx
  lib/
    error.test.ts             # 工具函数测试
  stores/
    useTransferStore.test.ts  # Store 测试
```

源码结构对应：
```
src/
  hooks/
    useConnect.ts
  lib/
    error.ts
  stores/
    useTransferStore.ts
```

### 命名规范

- 测试文件: `<模块名>.test.ts(x)`
- 含 JSX 的测试必须用 `.tsx` 扩展名
- describe 块: 描述被测模块或功能组
- it/test: 使用 "should + 动作 + 条件" 格式

```typescript
describe("useConnect", () => {
  describe("startConnect", () => {
    it("should navigate on successful connection", async () => {
      // ...
    });

    it("should set needPassword when password not stored", async () => {
      // ...
    });
  });
});
```

### Mock 规范

1. **Tauri API Mock**: 统一放在 `__tests__/mocks/tauri.ts`
2. **模块 Mock**: 在测试文件顶部声明，使用 `vi.mock()`
3. **Mock 数据**: 使用工厂函数创建，便于自定义

```typescript
// 好：工厂函数创建 mock 数据
const createMockTask = (overrides: Partial<TransferTask> = {}): TransferTask => ({
  taskId: "task-1",
  status: "waiting",
  // ... 默认值
  ...overrides,
});

// 好：清晰的 mock 声明
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// 避免：硬编码 mock 数据散落各处
```

### 断言规范

1. 使用具体的匹配器，避免过于宽泛
2. 对象断言优先使用 `toEqual` 或 `toMatchObject`
3. 函数调用断言考虑参数完整性

```typescript
// 好：精确断言
expect(invoke).toHaveBeenCalledWith("sftp_mkdir", {
  sessionId: "session-1",
  path: "/home/user/new-folder",
});

// 好：当参数包含动态值时使用 expect.anything()
expect(toast.success).toHaveBeenCalledWith("操作成功", expect.anything());

// 避免：过于宽泛
expect(invoke).toHaveBeenCalled();
```

### React Query 测试

测试使用 React Query 的 Hook 时：

```typescript
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },  // 禁用重试加速测试
      mutations: { retry: false },
    },
  });
});
```

### Zustand Store 测试

直接测试 store actions，无需渲染组件：

```typescript
beforeEach(() => {
  useTransferStore.setState({ tasks: new Map() });  // 重置状态
});

it("should add task", () => {
  useTransferStore.getState().addTask(mockTask);
  expect(useTransferStore.getState().getTask("task-1")).toEqual(mockTask);
});
```

### 覆盖率目标

| 模块类型 | 目标覆盖率 |
|---------|-----------|
| stores/ | ≥ 80% |
| hooks/ (核心) | ≥ 80% |
| lib/ (工具) | ≥ 70% |
| components/ | ≥ 50% |

核心模块: useConnect, useFileOperations, useFileList, useTransferStore

---

## 后端测试

### 技术栈

- cargo test (内置测试框架)
- mockall (Mock trait)
- tempfile (临时文件)

### 文件组织

```rust
// 单元测试：模块内 tests 子模块
mod session_service {
    // 实现代码...

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn test_session_creation() {
            // ...
        }
    }
}

// 集成测试：tests/ 目录
// tests/integration_test.rs
```

### 命名规范

- 测试函数: `test_<功能>_<场景>` 或 `<功能>_should_<行为>`
- 使用 `#[test]` 属性标记
- 异步测试使用 `#[tokio::test]`

```rust
#[test]
fn parse_error_code_returns_correct_variant() {
    // ...
}

#[tokio::test]
async fn connect_should_fail_with_invalid_host() {
    // ...
}
```

### 错误场景测试

确保覆盖关键错误路径：

```rust
#[test]
fn should_return_auth_failed_for_wrong_password() {
    // ...
}

#[test]
fn should_return_timeout_when_connection_hangs() {
    // ...
}
```

---

## 测试运行

```bash
# 前端
pnpm test           # 监视模式
pnpm test:run       # 单次运行
pnpm test:coverage  # 覆盖率报告

# 后端
cd src-tauri
cargo test          # 运行所有测试
cargo test <name>   # 运行匹配的测试
```
