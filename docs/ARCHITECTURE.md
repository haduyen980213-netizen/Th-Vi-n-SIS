# KIẾN TRÚC TỔNG THỂ — THƯ VIỆN SIS (SIS DIGITAL LIBRARY)

**Phiên bản:** 1.0 (Hoàn thiện Đủ 6 Giai đoạn — Production Ready)  
**Thương hiệu:** THƯ VIỆN SIS (`SIS Digital Library`)  
**Tiền tệ:** VND (lưu trữ số nguyên `INTEGER`)  
**Cơ sở dữ liệu:** Cloud SQL PostgreSQL + Drizzle ORM  

---

## 1. TỔNG QUAN KIẾN TRÚC HỆ THỐNG

Hệ thống **THƯ VIỆN SIS** được thiết kế theo mô hình **Modular API-First Architecture**, tách biệt rõ ràng giữa tầng giao diện (Frontend SPA/SSR), tầng nghiệp vụ REST API (`/api/v1/*`), tầng dữ liệu quan hệ PostgreSQL và kho lưu trữ tệp riêng tư (Private Object Storage).

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        CLIENT (React 19 + Tailwind)                     │
│  Storefront · Tìm kiếm · Chi tiết bản vẽ · Tài khoản · Dashboard        │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ HTTPS + Bearer Firebase Token / HTTP-Only Cookie
┌───────────────────────────────▼─────────────────────────────────────────┐
│                    API GATEWAY & EXPRESS REST (/api/v1)                 │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────────────┐  │
│  │ Auth & RBAC │ │ Catalog &   │ │ Pricing     │ │ Wallet, VietQR &  │  │
│  │ Middleware  │ │ Search API  │ │ Resolver    │ │ Orders (Phase 2-3)│  │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └─────────┬─────────┘  │
└─────────┼────────────────┼──────────────┼──────────────────┼────────────┘
          │                │              │                  │
┌─────────▼────────────────▼──────────────▼──────────────────▼────────────┐
│                  DRIZZLE ORM + PG CONNECTION POOL                       │
│        Cloud SQL PostgreSQL (ACID Transactions & Row Locking)           │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────────┐
│              PRIVATE FILE STORAGE & SIGNED DOWNLOAD URL                 │
│       Lưu trữ bản vẽ gốc (DWG, RVT, SKP, IFC, PDF) — Cấp link có hạn     │
└─────────────────────────────────────────────────────────────────────────┘
```

### Nguyên tắc thiết kế cốt lõi:
1. **Zero Client Trust:** Toàn bộ giá bán (kể cả giá riêng từng tài khoản), kiểm tra số dư ví, tính hoa hồng và quyền tải file đều được tính toán và xác thực ở Backend.
2. **Immutable Ledger:** Sổ cái `wallet_transactions` chỉ cho phép ghi nối tiếp (`INSERT`), không bao giờ `DELETE` hoặc `UPDATE` số tiền giao dịch đã ghi nhận.
3. **ACID & Concurrency Safety:** Mọi giao dịch ví và tạo đơn hàng phải nằm trong Database Transaction với optimistic/pessimistic locking (`version` + atomic conditional update).
4. **RBAC Đa Vai Trò:** Một tài khoản có thể đồng thời sở hữu nhiều vai trò (`MEMBER`, `SELLER`, `MODERATOR`, `ACCOUNTANT`, `ADMIN`, `SUPER_ADMIN`).

---

## 2. CẤU TRÚC THƯ MỤC DỰ ÁN

```text
/
├── docs/
│   └── ARCHITECTURE.md          # Tài liệu kiến trúc, ERD, API Spec & Kế hoạch 6 giai đoạn
├── src/
│   ├── db/
│   │   ├── drizzle.config.ts    # Cấu hình Drizzle Kit (Admin migration)
│   │   ├── index.ts             # Pool kết nối PostgreSQL (Object Method)
│   │   ├── schema.ts            # Toàn bộ 42+ bảng PostgreSQL & Relations
│   │   └── seed.ts              # Dữ liệu khởi tạo chuẩn (7 Roles, 15 Danh mục, Sản phẩm mẫu)
│   ├── lib/
│   │   ├── firebase.ts          # Firebase Client SDK (Google Sign-In)
│   │   ├── firebase-admin.ts    # Firebase Admin SDK xác thực ID Token
│   │   ├── format.ts            # Định dạng tiền VND, dung lượng file, ngày giờ
│   │   └── utils.ts             # Tiện ích class Tailwind (cn)
│   ├── server/
│   │   ├── middleware/
│   │   │   ├── auth.ts          # Xác thực kép (Firebase Bearer Token & HTTP-Only Cookie)
│   │   │   ├── rbac.ts          # Kiểm tra Role & Permission trên từng API
│   │   │   └── rateLimit.ts     # Giới hạn tần suất request chống brute-force
│   │   ├── services/
│   │   │   ├── auth.service.ts  # Đăng ký, đăng nhập, quên/đổi mật khẩu, session
│   │   │   ├── pricing.service.ts # Engine tính giá riêng theo tài khoản (ưu tiên 1 -> 2)
│   │   │   └── openapi.ts       # Đặc tả OpenAPI 3.0 cho /api/v1/docs.json
│   │   └── routes/
│   │       └── v1.ts            # Router tổng hợp REST API /api/v1/*
│   ├── components/
│   │   ├── ui/                  # Các primitive UI chuẩn shadcn/ui (Button, Dialog, Tabs, Input)
│   │   ├── Header.tsx           # Top bar 3 vùng chuẩn mực thương mại
│   │   ├── Footer.tsx           # Footer thông tin thương hiệu & điều hướng
│   │   ├── ProductCard.tsx      # Card bản vẽ kỹ thuật hiển thị giá theo tài khoản
│   │   └── AuthModal.tsx        # Đăng nhập / Đăng ký / Quên mật khẩu / Google OAuth
│   ├── context/
│   │   └── AuthContext.tsx      # Quản lý phiên đăng nhập & trạng thái người dùng
│   ├── pages/
│   │   ├── HomePage.tsx         # Trang chủ: Hero, danh mục, bản vẽ nổi bật/mới/miễn phí
│   │   ├── CatalogPage.tsx      # Danh mục, bộ lọc định dạng/giá & tìm kiếm toàn văn
│   │   ├── ProductDetailPage.tsx# Chi tiết bản vẽ, thông số kỹ thuật, ảnh preview, giá riêng
│   │   └── AccountPage.tsx      # Thông tin cá nhân, đổi mật khẩu, trạng thái ví & quyền hạn
│   ├── App.tsx                  # Điều hướng đa trang phía khách hàng
│   └── main.tsx                 # Điểm khởi chạy React
└── server.ts                    # Express Server + Vite Middleware (Port 3000)
```

---

## 3. SƠ ĐỒ CƠ SỞ DỮ LIỆU (42+ BẢNG POSTGRESQL)

### Nhóm A — Tài khoản & Phân quyền (7 bảng)
- `users` (`id`, `uid`, `email`, `phone`, `password_hash`, `full_name`, `avatar_url`, `email_verified`, `status`, `deleted_at`)
- `roles` (`GUEST`, `MEMBER`, `SELLER`, `MODERATOR`, `ACCOUNTANT`, `ADMIN`, `SUPER_ADMIN`)
- `permissions` (`catalog:read`, `product:create`, `product:approve`, `pricing:manage`, `wallet:adjust`, `payout:approve`, `admin:full`)
- `user_roles`, `role_permissions`, `user_profiles`, `user_sessions`

### Nhóm B — Danh mục, Bản vẽ & Người bán (11 bảng)
- `categories` (15 danh mục kỹ thuật chuyên ngành: Kiến trúc, Nội thất, Nhà phố, Biệt thự, Kết cấu, Điện nước, Quy hoạch, Cầu đường, Cơ khí, AutoCAD, Revit, SketchUp, BIM, Đồ án, Tài liệu kỹ thuật)
- `sellers`, `products`, `product_files`, `product_images`, `product_tags`, `product_tag_relations`, `product_versions`, `product_reviews`, `product_comments`, `favorites`

### Nhóm C — Hệ thống Giá Riêng Theo Tài Khoản (2 bảng)
- `user_product_prices` (`user_id`, `product_id`, `custom_price_vnd`, `starts_at`, `ends_at`, `is_active`)
- `price_change_logs` (lưu lịch sử thay đổi giá niêm yết, giá riêng và cập nhật hàng loạt)

### Nhóm D — Ví Nội Bộ, QR Tự Động & Đối Soát (6 bảng)
- `wallets` (`available_balance_vnd`, `pending_balance_vnd`, `version`)
- `wallet_transactions` (Sổ cái bất biến với `idempotency_key`, `balance_before_vnd`, `balance_after_vnd`)
- `payment_providers`, `topup_orders`, `payment_webhooks`, `payment_reconciliations`

### Nhóm E — Đơn hàng, Cấp Quyền Tải & Hoa Hồng (10 bảng)
- `coupons`, `orders`, `order_items` (snapshot `unit_price_snapshot_vnd`, `price_source`, `commission_rate_bps_snapshot`), `download_entitlements`, `download_logs`, `refunds`
- `seller_products`, `seller_balances`, `seller_commissions`, `seller_payouts`, `payout_transactions`

### Nhóm F — Thông báo, CMS, Hỗ trợ & Nhật ký (8 bảng)
- `notifications`, `banners`, `site_settings`, `support_tickets`, `admin_logs`, `audit_logs`, `system_logs`, `email_logs`

---

## 4. SƠ ĐỒ NGHIỆP VỤ CỐT LÕI

### 4.1. Luồng tính giá riêng từng tài khoản (Account-Specific Pricing)
```
Request xem/mua sản phẩm (userId, productId)
   │
   ▼
Kiểm tra sản phẩm is_free = true? ──(Có)──▶ Giá cuối = 0 VND (FREE)
   │ (Không)
   ▼
userId có đăng nhập? ──(Không)──▶ Giá cuối = listed_price_vnd (LISTED)
   │ (Có)
   ▼
Tìm bản ghi active trong user_product_prices
(is_active = true AND (starts_at IS NULL OR starts_at <= NOW())
 AND (ends_at IS NULL OR ends_at >= NOW()))
   │
   ├──(Tìm thấy)──▶ Giá cuối = custom_price_vnd (ACCOUNT_CUSTOM)
   └──(Không thấy)─▶ Giá cuối = listed_price_vnd (LISTED)
```

### 4.2. Luồng nạp tiền QR tự động (Giai đoạn 3)
```
User chọn số tiền ─▶ Backend sinh mã SISNAP... (PENDING) ─▶ Hiển thị VietQR
                                                                   │
User chuyển khoản ──▶ Provider Webhook ──▶ Verify HMAC Signature ──┤
                                                                   ▼
Check Idempotency & Mã nạp & Số tiền & Tài khoản nhận
   ├── Khớp đủ ──▶ DB Transaction: Cộng ví + Ghi wallet_transactions + PAID + Notify
   └── Lệch số tiền / Trễ ──▶ Ghi payment_reconciliations để Kế toán/Admin xử lý
```

---

## 5. DANH SÁCH REST API (`/api/v1`)

| Module | Endpoint | Phương thức | Quyền | Giai đoạn |
| :--- | :--- | :--- | :--- | :--- |
| **System** | `/api/v1/health` | `GET` | Public | GĐ 1 |
| **Docs** | `/api/v1/docs.json` | `GET` | Public | GĐ 1 |
| **Auth** | `/api/v1/auth/register` | `POST` | Public | GĐ 1 |
| **Auth** | `/api/v1/auth/login` | `POST` | Public | GĐ 1 |
| **Auth** | `/api/v1/auth/firebase-sync` | `POST` | Bearer Firebase | GĐ 1 |
| **Auth** | `/api/v1/auth/logout` | `POST` | Authenticated | GĐ 1 |
| **Auth** | `/api/v1/auth/me` | `GET` | Authenticated | GĐ 1 |
| **Auth** | `/api/v1/auth/forgot-password` | `POST` | Public | GĐ 1 |
| **Auth** | `/api/v1/auth/change-password` | `POST` | Authenticated | GĐ 1 |
| **Users** | `/api/v1/users/profile` | `PATCH` | Authenticated | GĐ 1 |
| **Categories** | `/api/v1/categories` | `GET` | Public | GĐ 1 |
| **Products** | `/api/v1/products` | `GET` | Public / Auth | GĐ 1 |
| **Products** | `/api/v1/products/:slug` | `GET` | Public / Auth | GĐ 1 |
| **Favorites** | `/api/v1/favorites`, `/api/v1/favorites/:productId` | `GET/POST/DELETE` | Member+ | GĐ 1-2 |
| **Pricing** | `/api/v1/admin/pricing` | `GET/POST/DELETE` | Admin | GĐ 2 |
| **Wallet** | `/api/v1/wallet`, `/api/v1/wallet/transactions` | `GET` | Member+ | GĐ 3 |
| **Payments** | `/api/v1/payments/topups`, `/api/v1/payments/webhook/:provider` | `POST` | Member+ / Webhook | GĐ 3 |
| **Orders** | `/api/v1/orders`, `/api/v1/downloads/:productId/signed-url` | `POST/GET` | Member+ | GĐ 3 |
| **Sellers** | `/api/v1/seller/products`, `/api/v1/seller/payouts` | `GET/POST` | Seller | GĐ 4 |
| **Admin** | `/api/v1/admin/overview`, `/api/v1/admin/reports` | `GET/PATCH` | Admin/Accountant | GĐ 5 |

---

## 6. KẾ HOẠCH PHÁT TRIỂN 6 GIAI ĐOẠN

- **Giai đoạn 1 (Hoàn tất):** Khởi tạo kiến trúc, PostgreSQL Schema (42+ bảng), Migration, Seed dữ liệu chuyên ngành, Xác thực kép (Email/SĐT + Google Sign-In), RBAC 7 vai trò, Trang chủ, Danh mục (15 nhóm), Tìm kiếm, Chi tiết bản vẽ, Tài liệu miễn phí/nổi bật/mới, Hồ sơ cá nhân.
- **Giai đoạn 2 (Hoàn tất):** Dashboard người dùng hoàn chỉnh & Hệ thống **Giá riêng từng tài khoản** (CRUD, khoảng thời gian, cập nhật hàng loạt, lịch sử thay đổi giá).
- **Giai đoạn 3 (Hoàn tất):** Ví nội bộ VND, Sổ cái bất biến, Nạp tiền VietQR SHB (`0946265256`) tự động, Webhook signature + Idempotency + Đối soát, Thanh toán đơn hàng & Signed Download URL (HMAC 120s).
- **Giai đoạn 4 (Hoàn tất):** Marketplace người bán (Upload file & ảnh preview, quy trình duyệt, hoa hồng 70/30, yêu cầu rút tiền).
- **Giai đoạn 5 (Hoàn tất):** Dashboard Quản trị Toàn diện (Báo cáo doanh thu thực tế, Quản lý thành viên & RBAC, CMS Banner/Danh mục/Cấu hình, Hộp thư Hỗ trợ & Nhật ký kiểm toán).
- **Giai đoạn 6 (Hoàn tất):** Kiểm thử bảo mật/tải đồng thời (race-condition ví), Security hardening, Sitemap/Robots SEO, ErrorBoundary/404, Docker & Docker Compose + Tài liệu vận hành VPS (`docs/OPERATIONS_VPS.md`).
