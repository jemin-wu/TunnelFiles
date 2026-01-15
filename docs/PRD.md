# 产品需求文档（PRD）

## 一、产品愿景
打造一款**跨平台桌面 SSH/SFTP 可视化文件管理器**（macOS 优先，后续支持 Windows/Linux），让用户通过“像 Finder 一样”的交互完成远程服务器文件的**浏览、拖拽上传/下载、删除、重命名、创建目录**等操作，并提供稳定的**传输队列与进度反馈**，降低命令行使用门槛，提高日常开发与运维效率。

## 二、功能清单
- **连接配置管理**：新增/编辑/删除连接；测试连接；最近连接；连接状态展示。  
- **认证方式**：密码登录；SSH Key 登录（含 passphrase）；Host Key 指纹校验（known_hosts）。  
- **远程文件浏览**：目录进入/返回；面包屑路径；刷新；排序（名称/大小/时间）；文件属性展示。  
- **远程文件操作**：新建文件夹；重命名；删除（含目录删除策略）。  
- **上传**：拖拽上传（多文件）；手动选择上传；上传队列、进度、取消/重试。  
- **下载**：选中文件下载到本地；下载队列、进度、取消/重试。  
- **传输队列与任务中心**：并发控制；失败重试；任务日志；完成提示。  
- **设置与偏好**：默认下载目录；最大并发数；超时/重试策略；日志级别。  
- **可观测性**：错误提示标准化；本地日志导出；（可选）匿名使用统计开关。  

## 三、详细说明
### 1. 功能描述
#### 1.1 连接配置管理
- **用户场景**：用户需要保存多台服务器并快速连接切换。  
- **功能点**
  - 新增连接：名称、Host、Port（默认 22）、Username、认证方式（密码/Key）、备注（可选）。
  - 编辑/删除连接（删除需二次确认）。
  - 测试连接：返回成功/失败原因（如认证失败、超时、HostKey 不匹配）。
  - 最近连接：展示最近 N=10 条记录，可一键再次连接。
- **约束**
  - Host 支持域名与 IP；Port 范围 1-65535。
  - 密码/私钥口令不得明文落盘（见安全）。

#### 1.2 认证与安全（MVP 必须）
- **密码登录**：输入密码后可选择“记住密码”（默认不勾选）。  
- **SSH Key 登录**：选择本地私钥路径；如需 passphrase，则输入并可选择保存至系统安全存储。  
- **Host Key 校验**（首次连接/变更）：
  - 首次连接弹窗展示指纹（SHA256），用户确认后写入 known_hosts。
  - 若指纹变化：阻断连接并提示风险，用户可选择“信任新的指纹并替换”（需二次确认）。

#### 1.3 远程文件浏览（SFTP）
- **用户场景**：用户连接后像 Finder 一样浏览远程目录。  
- **功能点**
  - 默认进入：用户配置的初始目录（可选），否则进入远程 home。
  - 文件列表：名称、类型（文件/目录）、大小、修改时间（mtime），可选显示权限（mode）。
  - 操作：双击进入目录；返回上级；面包屑跳转；刷新。
  - 排序：名称/大小/修改时间（升/降序）。
- **边界**
  - 大目录（>5000 条）：前端启用虚拟列表；后端允许分页/分批返回（如实现成本高，MVP 可先一次性返回并提示“目录较大可能较慢”）。

#### 1.4 远程文件操作
- **新建文件夹**：输入名称→创建成功后刷新列表；名称校验（不能为空、不能含非法字符）。  
- **重命名**：选中→重命名→冲突提示（同名存在则拒绝并提示）。  
- **删除**
  - 文件：直接删除（unlink），需二次确认（可提供“不再提示”开关，默认提示）。
  - 目录：MVP 提供两种策略（二选一，建议默认 A）  
    - A. **仅允许删除空目录**（rmdir），非空目录提示“目录非空，暂不支持递归删除”（降低误删风险）。  
    - B. 支持递归删除（需强提示 + 明确展示影响范围）。  
  - **推荐 MVP 默认采用策略 A**，将递归删除放入 V2。

#### 1.5 上传（拖拽为核心）
- **拖拽上传**：从本地拖拽文件到文件列表区域 → 自动上传到“当前远程目录”。  
- **多文件**：一次拖拽多个文件生成多个队列任务。  
- **手动上传**：按钮选择文件（作为拖拽补充）。  
- **进度反馈**：每个任务显示 percent、速度、已传/总量；失败可重试；可取消。

#### 1.6 下载
- 选中文件 → “下载” → 选择本地保存路径（默认下载目录） → 进入下载队列。  
- 下载完成后：系统通知/Toast（可配置开关）。

#### 1.7 传输队列与任务中心
- **并发控制**：默认并发 3（可配置 1-6）。  
- **任务状态**：waiting / running / success / failed / canceled。  
- **失败策略**：默认自动重试 2 次（指数退避），仍失败则标记 failed 并展示原因。  
- **取消策略**：running 任务取消后应尽快中止 IO 并释放连接资源。  

### 2. 用户流程
#### 2.1 首次使用流程
1. 打开应用 → 进入“连接管理页”。  
2. 点击“新增连接” → 填写信息 →（可选）测试连接。  
3. 点击“连接”  
4. 首次连接若无 known_hosts：弹出指纹确认 → 用户确认 → 进入文件管理页。  
5. 在文件管理页拖拽上传一个文件 → 在队列中查看进度 → 上传完成提示。

#### 2.2 日常使用流程（文件管理）
1. 选择已保存连接 → 一键连接。  
2. 浏览目录：双击进入/面包屑跳转/刷新。  
3. 上传：拖拽文件到列表区 → 队列显示进度 → 完成。  
4. 下载：选中远程文件 → 下载 → 队列显示进度。  
5. 删除/重命名/新建目录：右键菜单或顶部按钮完成。

#### 2.3 异常流程
- **认证失败**：提示错误原因（账号/密码错误、key 无效、权限不足），停留在连接页可直接修改后重试。  
- **网络中断**：正在运行任务标记为 failed（原因：connection lost）；提示用户“重新连接后可重试任务”。（自动续传 V2）  
- **Host Key 变化**：阻断连接 → 风险提示 → 用户选择信任或取消。  

### 3. 交互与界面要求
#### 3.1 页面与布局
- **连接管理页**
  - 连接列表：名称、Host、User、最近连接时间、状态（未连接/连接中/已连接）。
  - 操作：新增、编辑、删除、测试、连接。
- **文件管理页**
  - 顶部：面包屑路径、刷新按钮、上传按钮、（可选）新建文件夹。
  - 中部：文件列表（支持拖拽覆盖层提示“释放以上传到当前目录”）。
  - 底部/侧边：可折叠“任务中心”（上传/下载队列）。

#### 3.2 关键交互规范
- **拖拽上传**
  - 拖入时显示高亮投放区；释放后立即生成任务并展示。
  - 若拖拽对象为目录：MVP 弹窗提示“不支持文件夹上传（V2 支持）”。  
- **右键菜单（文件/目录）**
  - 文件：下载、重命名、删除
  - 目录：进入、重命名、删除（按策略 A：仅空目录可删）
- **删除确认**
  - 默认二次确认；明确展示目标路径与数量（单个/多个，若后续支持多选）。
- **空态/错误态**
  - 空目录：展示空态插画+“拖拽文件到此上传”
  - 失败：Toast + 队列条目显示错误详情（可展开查看）

#### 3.3 性能与体验要求
- UI 操作不因传输阻塞（传输在后端异步执行）。  
- 列表滚动流畅（大目录采用虚拟列表）。  

### 4. 数据与接口需求
> 采用 Tauri 架构：前端 `invoke(command, payload)` 调用后端；后端 `emit(event, payload)` 推送进度与状态。

#### 4.1 核心数据结构（建议）
**连接配置 Profile**
- profileId: string (uuid)
- name: string
- host: string
- port: number
- username: string
- authType: "password" | "key"
- passwordRef?: string（指向系统安全存储的 key）
- privateKeyPath?: string
- passphraseRef?: string（可选）
- initialRemotePath?: string（可选）
- lastConnectedAt?: number（可选）

**文件条目 FileEntry**
- name: string
- path: string
- isDir: boolean
- size?: number
- mtime?: number
- mode?: number（可选）

**传输任务 TransferTask**
- taskId: string (uuid)
- direction: "upload" | "download"
- localPath: string
- remotePath: string
- status: "waiting" | "running" | "success" | "failed" | "canceled"
- transferred: number
- total?: number
- speed?: number
- errorMessage?: string

#### 4.2 IPC Commands（MVP 必须）
- `profile_list() -> Profile[]`
- `profile_upsert(profile) -> profileId`
- `profile_delete(profileId) -> void`
- `connect(profileId) -> sessionId`
- `disconnect(sessionId) -> void`
- `sftp_list_dir(sessionId, path) -> FileEntry[]`
- `sftp_mkdir(sessionId, path) -> void`
- `sftp_rename(sessionId, from, to) -> void`
- `sftp_delete(sessionId, path, isDir) -> void`
- `transfer_upload(sessionId, localPath, remoteDir) -> taskId`
- `transfer_download(sessionId, remotePath, localDir) -> taskId`
- `transfer_cancel(taskId) -> void`
- `settings_get() -> Settings`
- `settings_set(settings) -> void`

#### 4.3 Events（后端推送）
- `transfer:progress` payload: { taskId, transferred, total, speed, percent }
- `transfer:status` payload: { taskId, status, errorMessage? }
- `session:status` payload: { sessionId, status: "connected|disconnected|error", message? }
- `security:hostkey` payload: { profileId, fingerprint, host, actionRequired: true }
  - 前端收到后弹窗，用户选择信任/拒绝，再调用 `security_trust_hostkey(...)`

#### 4.4 错误码与提示（建议最小集合）
- AUTH_FAILED：认证失败  
- HOSTKEY_MISMATCH：Host Key 不匹配  
- TIMEOUT：连接超时  
- NOT_FOUND：路径不存在  
- PERMISSION_DENIED：权限不足  
- DIR_NOT_EMPTY：目录非空（策略 A）  
- NETWORK_LOST：网络中断  

### 5. 验收标准
#### 5.1 连接配置管理
- 能新增/编辑/删除连接；字段校验正确（host 非空、port 合法）。  
- 测试连接返回明确结果；失败原因可读。  
- 连接成功后进入文件管理页，连接状态正确展示。

#### 5.2 认证与安全
- 密码/口令不以明文写入本地文件；选择“记住”时写入系统安全存储。  
- 首次连接必须出现 Host Key 指纹确认；确认后同主机再次连接不再提示。  
- Host Key 变化时必须阻断并提示风险，默认不允许静默通过。

#### 5.3 文件浏览
- 可进入目录、返回上级、面包屑跳转；刷新后列表更新。  
- 排序生效且与 UI 指示一致；文件属性展示不为空（至少 name/type）。  

#### 5.4 文件操作
- 新建文件夹成功后列表可见；重命名后名称变化且路径正确。  
- 删除文件需二次确认；删除成功后列表不再出现。  
- 删除目录按策略 A：空目录可删；非空目录返回 DIR_NOT_EMPTY 并提示。

#### 5.5 上传/下载/队列
- 拖拽单文件上传：任务进入队列、进度可见、完成后状态 success。  
- 拖拽多文件上传：生成多条任务，并发数不超过设置值。  
- 下载任务同样具备进度与完成提示。  
- 取消任务：状态变更为 canceled，网络连接与文件句柄释放（不再继续传输）。  
- 失败重试：点击重试后可重新发起任务，状态与日志更新正确。

#### 5.6 异常处理
- 网络断开时：running 任务变为 failed 并提示 NETWORK_LOST；重新连接后可手动重试。  
- 权限不足/文件不存在等错误能准确提示并不导致应用崩溃。  
