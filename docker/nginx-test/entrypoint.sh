#!/bin/bash
set -euo pipefail

mkdir -p /run/sshd /run/nginx
nginx

exec /usr/sbin/sshd -D -e
