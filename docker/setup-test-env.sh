#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SSH_KEYS_DIR="$SCRIPT_DIR/ssh-keys"

echo "=== TunnelFiles SSH 测试环境设置 ==="

# Generate SSH keys for testing
if [ ! -f "$SSH_KEYS_DIR/id_ed25519" ]; then
    echo "生成测试 SSH 密钥..."
    ssh-keygen -t ed25519 -f "$SSH_KEYS_DIR/id_ed25519" -N "" -C "test@tunnelfiles"
    ssh-keygen -t ed25519 -f "$SSH_KEYS_DIR/id_ed25519_passphrase" -N "testpass" -C "test-passphrase@tunnelfiles"

    # Create authorized_keys
    cat "$SSH_KEYS_DIR/id_ed25519.pub" > "$SSH_KEYS_DIR/authorized_keys"
    cat "$SSH_KEYS_DIR/id_ed25519_passphrase.pub" >> "$SSH_KEYS_DIR/authorized_keys"
    chmod 600 "$SSH_KEYS_DIR/authorized_keys"
    echo "SSH 密钥生成完成"
else
    echo "SSH 密钥已存在，跳过生成"
fi

# Start Docker containers
echo "启动 Docker SSH 服务..."
cd "$SCRIPT_DIR"
docker compose up -d --build

# Wait for SSH servers to be ready
echo "等待 SSH 服务器就绪..."
for i in {1..30}; do
    if nc -z localhost 2222 2>/dev/null && nc -z localhost 2223 2>/dev/null; then
        echo "SSH 服务器已就绪!"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "错误: SSH 服务器启动超时"
        exit 1
    fi
    sleep 1
done

# Print test info
echo ""
echo "=== 测试环境信息 ==="
echo "SSH 服务器 1: localhost:2222"
echo "SSH 服务器 2: localhost:2223"
echo "用户名: testuser"
echo "密码: testpass123"
echo "SSH 密钥: $SSH_KEYS_DIR/id_ed25519"
echo "带密码的 SSH 密钥: $SSH_KEYS_DIR/id_ed25519_passphrase (密码: testpass)"
echo ""
echo "测试目录结构:"
echo "  /home/testuser/test-files/  - 包含测试文件"
echo "  /home/testuser/empty-dir/   - 空目录"
echo "  /home/testuser/readonly-dir/ - 只读目录"
echo "  /home/testuser/uploads/     - 上传目标目录"
echo ""
echo "运行集成测试: cd src-tauri && cargo test --features integration-test"
echo "停止测试环境: docker compose down"
