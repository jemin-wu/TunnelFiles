FROM debian:bookworm-slim

RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      nginx \
      openssh-server \
      netcat-openbsd \
      procps && \
    rm -rf /var/lib/apt/lists/*

RUN mkdir -p /run/sshd /run/nginx && \
    echo "root:rootpass123" | chpasswd

RUN sed -i 's/#PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config && \
    sed -i 's/#PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config && \
    sed -i 's/#PubkeyAuthentication.*/PubkeyAuthentication no/' /etc/ssh/sshd_config

RUN cat <<'EOF' > /etc/nginx/nginx.conf
user root;
worker_processes 1;
pid /run/nginx.pid;

events {
  worker_connections 128;
}

http {
  include /etc/nginx/mime.types;
  default_type application/octet-stream;
  sendfile on;
  keepalive_timeout 65;

  server {
    listen 8080;
    server_name _;

    location / {
      add_header Content-Type text/plain;
      return 200 'ok';
    }
  }
}
EOF

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 22

ENTRYPOINT ["/entrypoint.sh"]
