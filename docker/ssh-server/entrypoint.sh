#!/bin/bash
# Copy mounted SSH keys and fix ownership/permissions
# Volume mounts inherit host UID/GID, which causes SSH to reject key auth
if [ -d /ssh-keys-mount ] && [ -f /ssh-keys-mount/authorized_keys ]; then
    cp /ssh-keys-mount/authorized_keys /home/testuser/.ssh/authorized_keys
    chown testuser:testuser /home/testuser/.ssh/authorized_keys
    chmod 600 /home/testuser/.ssh/authorized_keys
fi

exec /usr/sbin/sshd -D -e
