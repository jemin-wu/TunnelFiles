FROM alpine:3.19

RUN apk add --no-cache openssh bash

# Create test user
RUN adduser -D -s /bin/bash testuser && \
    echo "testuser:testpass123" | chpasswd

# Create SSH host keys
RUN ssh-keygen -A

# Configure SSHD
RUN sed -i 's/#PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config && \
    sed -i 's/#PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config && \
    sed -i 's/#PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config && \
    sed -i 's/#Subsystem.*sftp.*/Subsystem sftp \/usr\/lib\/ssh\/sftp-server/' /etc/ssh/sshd_config

# Create test directories for SFTP operations
RUN mkdir -p /home/testuser/test-files && \
    mkdir -p /home/testuser/empty-dir && \
    mkdir -p /home/testuser/readonly-dir && \
    mkdir -p /home/testuser/uploads && \
    echo "Hello, World!" > /home/testuser/test-files/hello.txt && \
    echo "Test content" > /home/testuser/test-files/test.txt && \
    dd if=/dev/urandom of=/home/testuser/test-files/random.bin bs=1024 count=100 2>/dev/null && \
    chown -R testuser:testuser /home/testuser && \
    chmod 555 /home/testuser/readonly-dir

# Create .ssh directory for key auth
RUN mkdir -p /home/testuser/.ssh && \
    chmod 700 /home/testuser/.ssh && \
    chown testuser:testuser /home/testuser/.ssh

EXPOSE 22

CMD ["/usr/sbin/sshd", "-D", "-e"]
