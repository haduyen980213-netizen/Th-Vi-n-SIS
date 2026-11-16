# HƯỚNG DẪN TRIỂN KHAI & VẬN HÀNH PRODUCTION — THƯ VIỆN SIS

Tài liệu này hướng dẫn quy trình triển khai, bảo mật, sao lưu và phục hồi hệ thống **THƯ VIỆN SIS (SIS Digital Library)** trên máy chủ VPS / Cloud Run bằng Docker Compose hoặc Cloud SQL.

---

## 1. YÊU CẦU HẠ TẦNG TỐI THIỂU

- **CPU / RAM:** 2 vCPU, 4 GB RAM trở lên (khuyến nghị 4 vCPU, 8 GB RAM khi tải lớn).
- **Hệ điều hành:** Ubuntu 22.04 LTS / 24.04 LTS.
- **Phần mềm:** Docker Engine >= 24.x, Docker Compose v2, Nginx (reverse proxy + TLS Let's Encrypt).
- **Lưu trữ:** Ổ SSD tối thiểu 50 GB cho PostgreSQL (`sis_pgdata`) và kho bản vẽ riêng tư (`sis_storage`).

---

## 2. BIẾN MÔI TRƯỜNG BẮT BUỘC (`.env`)

Tạo tệp `.env` từ `.env.example` và điền đầy đủ giá trị bảo mật:

```bash
# Sinh chuỗi bí mật ngẫu nhiên 48 bytes
openssl rand -hex 48
```

Kiểm tra các khóa quan trọng:
- `SESSION_SECRET`: Chuỗi HMAC ký session & signed download URL (tối thiểu 32 bytes, không dùng mặc định).
- `PAYMENT_WEBHOOK_SECRET`: Khóa bí mật xác thực chữ ký HMAC-SHA256 webhook từ cổng thanh toán / ngân hàng.
- `SQL_PASSWORD`: Mật khẩu mạnh cho tài khoản ứng dụng PostgreSQL.
- `VIETQR_BANK_BIN=970443`, `VIETQR_ACCOUNT_NO=0946265256` (Ngân hàng SHB — tài khoản nhận nạp nhanh).
- `ADMIN_BOOTSTRAP_EMAIL`: Email quản trị viên tối cao (`SUPER_ADMIN`).

---

## 3. KHỞI CHẠY BẰNG DOCKER COMPOSE

```bash
# 1. Build và chạy các dịch vụ ở chế độ nền
docker compose up -d --build

# 2. Đẩy schema Drizzle sang PostgreSQL (lần đầu hoặc khi nâng cấp schema)
docker compose exec app npx drizzle-kit push --config=src/db/drizzle.config.ts

# 3. Kiểm tra trạng thái container và healthcheck
docker compose ps
curl -sS http://127.0.0.1:3000/api/v1/health
```

---

## 4. CẤU HÌNH REVERSE PROXY NGINX + SSL (HTTPS)

Cấu hình `/etc/nginx/sites-available/thuviensis.vn`:

```nginx
server {
    listen 80;
    server_name thuviensis.vn www.thuviensis.vn;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name thuviensis.vn www.thuviensis.vn;

    ssl_certificate /etc/letsencrypt/live/thuviensis.vn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/thuviensis.vn/privkey.pem;

    # Giới hạn dung lượng upload khớp với Multer (25 MB bản vẽ + preview)
    client_max_body_size 35M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

> **Lưu ý bảo mật:** Tuyệt đối không ánh xạ thư mục `storage/private-vault` ra Nginx static. Mọi lượt tải bản vẽ gốc phải đi qua `/api/v1/downloads/...` có xác thực chữ ký HMAC hết hạn sau 120 giây.

---

## 5. SAO LƯU & PHỤC HỒI DỮ LIỆU (BACKUP & RESTORE)

### 5.1. Sao lưu PostgreSQL hằng ngày (`cron` 02:00 sáng)

```bash
#!/usr/bin/env bash
set -euo pipefail
BACKUP_DIR="/var/backups/thuviensis"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Dump cơ sở dữ liệu nén gzip
docker exec sis-postgres pg_dump -U sis_app -Fc thu_vien_sis > "$BACKUP_DIR/db_${TIMESTAMP}.dump"

# Sao lưu kho bản vẽ riêng tư & ảnh preview
docker run --rm -v sis_storage:/source:ro -v "$BACKUP_DIR":/backup alpine \
  tar czf "/backup/storage_${TIMESTAMP}.tar.gz" -C /source .

# Giữ lại bản sao lưu trong 14 ngày gần nhất
find "$BACKUP_DIR" -type f -mtime +14 -delete
```

### 5.2. Phục hồi khi xảy ra sự cố

```bash
# Phục hồi PostgreSQL
cat /var/backups/thuviensis/db_YYYYMMDD_HHMMSS.dump | \
  docker exec -i sis-postgres pg_restore -U sis_app -d thu_vien_sis --clean --if-exists

# Phục hồi thư mục storage
docker run --rm -v sis_storage:/target -v /var/backups/thuviensis:/backup alpine \
  sh -c "cd /target && tar xzf /backup/storage_YYYYMMDD_HHMMSS.tar.gz"
```

---

## 6. DANH MỤC KIỂM TRA VẬN HÀNH (PRODUCTION CHECKLIST)

1. Kiểm tra `/api/v1/health` trả về `"status": "OPERATIONAL"` và kiểm tra `sitemap.xml` / `robots.txt`.
2. Xác nhận `SESSION_SECRET` và `PAYMENT_WEBHOOK_SECRET` khác giá trị dev và đã xoay định kỳ.
3. Đảm bảo `NODE_ENV=production` để bật cookie `Secure`, ẩn stack trace chi tiết ở client và kích hoạt cache tài nguyên tĩnh.
4. Theo dõi dung lượng bảng `wallet_transactions`, `admin_logs`, `audit_logs` và `payment_webhooks` qua tab **Quản trị Hệ thống → Báo cáo & Nhật ký**.
