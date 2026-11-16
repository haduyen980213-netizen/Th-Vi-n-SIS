import bcrypt from 'bcryptjs';
import { count, eq } from 'drizzle-orm';
import { db } from './index.ts';
import {
  categories,
  paymentProviders,
  permissions,
  productFiles,
  productImages,
  products,
  productTags,
  productTagRelations,
  productVersions,
  rolePermissions,
  roles,
  sellerBalances,
  sellerProducts,
  sellers,
  siteSettings,
  userProfiles,
  userRoles,
  users,
  wallets,
  walletTransactions,
} from './schema.ts';

let seedPromise: Promise<void> | null = null;
let seededCompleted = false;

export async function ensureDatabaseSeeded(): Promise<void> {
  if (seededCompleted) return;
  if (seedPromise) return seedPromise;

  seedPromise = runSeed().then(() => {
    seededCompleted = true;
  }).catch((err) => {
    seedPromise = null;
    throw err;
  });

  return seedPromise;
}

async function runSeed(): Promise<void> {
  // 1. Seed 7 RBAC Roles
  const roleSeeds = [
    { code: 'GUEST', name: 'Khách truy cập', description: 'Xem danh mục và tài liệu công khai' },
    { code: 'MEMBER', name: 'Thành viên', description: 'Mua bản vẽ, nạp ví, tải tài liệu và đánh giá' },
    { code: 'SELLER', name: 'Người bán', description: 'Đăng bán bản vẽ kỹ thuật và nhận hoa hồng' },
    { code: 'MODERATOR', name: 'Kiểm duyệt viên', description: 'Duyệt nội dung, bản vẽ và bình luận' },
    { code: 'ACCOUNTANT', name: 'Kế toán', description: 'Đối soát nạp tiền, xử lý chi trả và báo cáo tài chính' },
    { code: 'ADMIN', name: 'Quản trị viên', description: 'Quản trị thành viên, sản phẩm, giá riêng và cấu hình' },
    { code: 'SUPER_ADMIN', name: 'Quản trị tối cao', description: 'Toàn quyền hệ thống và phân quyền RBAC' },
  ];

  await db.insert(roles).values(roleSeeds).onConflictDoNothing({ target: roles.code });

  // 2. Seed Permissions
  const permissionSeeds = [
    { code: 'catalog:read', module: 'CATALOG', description: 'Xem danh mục và bản vẽ công khai' },
    { code: 'favorite:manage', module: 'CATALOG', description: 'Lưu bản vẽ yêu thích' },
    { code: 'wallet:read', module: 'WALLET', description: 'Xem số dư và lịch sử ví cá nhân' },
    { code: 'order:create', module: 'ORDER', description: 'Mua bản vẽ và tạo đơn hàng' },
    { code: 'product:create', module: 'SELLER', description: 'Đăng tải bản vẽ mới' },
    { code: 'product:edit_own', module: 'SELLER', description: 'Chỉnh sửa bản vẽ thuộc sở hữu' },
    { code: 'seller:payout_request', module: 'SELLER', description: 'Tạo yêu cầu rút tiền hoa hồng' },
    { code: 'product:approve', module: 'MODERATION', description: 'Duyệt hoặc từ chối bản vẽ' },
    { code: 'pricing:manage', module: 'PRICING', description: 'Thiết lập giá riêng cho từng tài khoản' },
    { code: 'payment:reconcile', module: 'FINANCE', description: 'Đối soát giao dịch và xử lý webhook' },
    { code: 'payout:approve', module: 'FINANCE', description: 'Duyệt chi trả cho người bán' },
    { code: 'wallet:adjust', module: 'FINANCE', description: 'Điều chỉnh số dư ví kèm nhật ký' },
    { code: 'user:manage', module: 'ADMIN', description: 'Quản lý thành viên và khóa tài khoản' },
    { code: 'admin:full', module: 'ADMIN', description: 'Toàn quyền quản trị hệ thống' },
  ];

  await db.insert(permissions).values(permissionSeeds).onConflictDoNothing({ target: permissions.code });

  const allRoles = await db.select().from(roles);
  const allPerms = await db.select().from(permissions);
  const roleMap = new Map(allRoles.map((r) => [r.code, r.id]));
  const permMap = new Map(allPerms.map((p) => [p.code, p.id]));

  const rolePermMapping: Record<string, string[]> = {
    GUEST: ['catalog:read'],
    MEMBER: ['catalog:read', 'favorite:manage', 'wallet:read', 'order:create'],
    SELLER: ['catalog:read', 'favorite:manage', 'wallet:read', 'order:create', 'product:create', 'product:edit_own', 'seller:payout_request'],
    MODERATOR: ['catalog:read', 'product:approve'],
    ACCOUNTANT: ['catalog:read', 'payment:reconcile', 'payout:approve', 'wallet:adjust'],
    ADMIN: ['catalog:read', 'favorite:manage', 'wallet:read', 'order:create', 'product:approve', 'pricing:manage', 'payment:reconcile', 'user:manage'],
    SUPER_ADMIN: permissionSeeds.map((p) => p.code),
  };

  const rpRows: Array<{ roleId: number; permissionId: number }> = [];
  for (const [roleCode, permCodes] of Object.entries(rolePermMapping)) {
    const rId = roleMap.get(roleCode);
    if (!rId) continue;
    for (const pCode of permCodes) {
      const pId = permMap.get(pCode);
      if (pId) rpRows.push({ roleId: rId, permissionId: pId });
    }
  }
  if (rpRows.length > 0) {
    await db.insert(rolePermissions).values(rpRows).onConflictDoNothing();
  }

  // 3. Seed 15 Required Categories
  const categorySeeds = [
    { name: 'Kiến trúc', slug: 'kien-truc', description: 'Hồ sơ bản vẽ thiết kế kiến trúc dân dụng và công trình công cộng', iconName: 'Compass', sortOrder: 1 },
    { name: 'Nội thất', slug: 'noi-that', description: 'Bản vẽ khai triển chi tiết nội thất, 3D Max, SketchUp và AutoCAD', iconName: 'Armchair', sortOrder: 2 },
    { name: 'Nhà phố', slug: 'nha-pho', description: 'Hồ sơ thiết kế nhà ống, nhà phố hiện đại, tân cổ điển 2-5 tầng', iconName: 'Building2', sortOrder: 3 },
    { name: 'Biệt thự', slug: 'biet-thu', description: 'Bản vẽ biệt thự vườn, biệt thự mái Nhật, biệt thự hiện đại cao cấp', iconName: 'Home', sortOrder: 4 },
    { name: 'Kết cấu', slug: 'ket-cau', description: 'Bản vẽ kết cấu móng, cột, dầm, sàn, nhà thép tiền chế và tính toán tải trọng', iconName: 'Layers', sortOrder: 5 },
    { name: 'Điện nước', slug: 'dien-nuoc', description: 'Hệ thống cơ điện MEP, cấp thoát nước, điều hòa HVAC và PCCC', iconName: 'Zap', sortOrder: 6 },
    { name: 'Quy hoạch', slug: 'quy-hoach', description: 'Đồ án quy hoạch phân khu, khu đô thị, cảnh quan và hạ tầng kỹ thuật', iconName: 'Map', sortOrder: 7 },
    { name: 'Cầu đường', slug: 'cau-duong', description: 'Hồ sơ thiết kế đường giao thông, cầu dầm, nút giao và thoát nước mặt', iconName: 'Route', sortOrder: 8 },
    { name: 'Cơ khí', slug: 'co-khi', description: 'Bản vẽ chế tạo máy, chi tiết cơ khí, SolidWorks, Inventor và băng tải', iconName: 'Cog', sortOrder: 9 },
    { name: 'AutoCAD', slug: 'autocad', description: 'Thư viện block CAD, bản vẽ 2D DWG chuẩn layer và tỷ lệ thi công', iconName: 'PenTool', sortOrder: 10 },
    { name: 'Revit', slug: 'revit', description: 'Mô hình Revit (.RVT), Family chuẩn BIM cho kiến trúc, kết cấu và MEP', iconName: 'Box', sortOrder: 11 },
    { name: 'SketchUp', slug: 'sketchup', description: 'File SketchUp (.SKP) phối cảnh 3D kèm thư viện vật liệu V-Ray/Enscape', iconName: 'Cuboid', sortOrder: 12 },
    { name: 'BIM', slug: 'bim', description: 'Hồ sơ triển khai BIM LOD 300-400, file IFC và quy trình phối hợp bộ môn', iconName: 'Cpu', sortOrder: 13 },
    { name: 'Đồ án', slug: 'do-an', description: 'Đồ án tốt nghiệp kiến trúc, xây dựng, cầu đường đạt điểm xuất sắc', iconName: 'GraduationCap', sortOrder: 14 },
    { name: 'Tài liệu kỹ thuật', slug: 'tai-lieu-ky-thuat', description: 'Tiêu chuẩn TCVN, thuyết minh biện pháp thi công và dự toán mẫu', iconName: 'FileText', sortOrder: 15 },
  ];

  await db.insert(categories).values(categorySeeds).onConflictDoNothing({ target: categories.slug });

  // 4. Seed Default Site Settings & Payment Provider Metadata
  const settingSeeds = [
    { key: 'site_name', value: 'THƯ VIỆN SIS', groupName: 'BRAND', description: 'Tên thương hiệu hiển thị' },
    { key: 'support_email', value: 'hotro@thuviensis.vn', groupName: 'CONTACT', description: 'Email hỗ trợ kỹ thuật' },
    { key: 'support_hotline', value: '1900 6868', groupName: 'CONTACT', description: 'Tổng đài hỗ trợ' },
    { key: 'default_commission_bps', value: '7000', groupName: 'FINANCE', description: 'Tỷ lệ hoa hồng mặc định cho người bán (70%)' },
  ];
  await db.insert(siteSettings).values(settingSeeds).onConflictDoNothing({ target: siteSettings.key });

  await db
    .insert(paymentProviders)
    .values([
      {
        code: 'VIETQR_SHB',
        name: 'Chuyển khoản nhanh VietQR SHB',
        isActive: true,
        configJson: {
          bankCode: 'SHB',
          bankName: 'Ngân hàng TMCP Sài Gòn - Hà Nội (SHB)',
          bankBin: process.env.VIETQR_BANK_BIN || '970443',
          accountNumber: process.env.VIETQR_ACCOUNT_NO || '0946265256',
          accountName: process.env.VIETQR_ACCOUNT_NAME || 'THU VIEN SIS',
        },
      },
    ])
    .onConflictDoUpdate({
      target: paymentProviders.code,
      set: {
        isActive: true,
      },
    });

  // 4b. Ensure primary Admin / Super Admin account (quanly@nhavang.com) exists idempotently
  await ensureMasterAdminAccount(roleMap);

  // 5. Check if products already seeded
  const [{ total }] = await db.select({ total: count() }).from(products);
  if (total > 0) return;

  // Create verified seller accounts for catalog ownership
  const sellerUsers = [
    {
      uid: 'seller_sis_hoang_001',
      email: 'kts.hoang@thuviensis.vn',
      phone: '0901000101',
      fullName: 'KTS. Nguyễn Minh Hoàng',
      emailVerified: true,
      status: 'ACTIVE',
      sellerDisplayName: 'Studio Kiến Trúc Á Đông',
      sellerSlug: 'studio-kien-truc-a-dong',
      specialty: 'Biệt thự & Nhà phố Hiện đại',
      bio: 'Đơn vị hơn 10 năm kinh nghiệm thiết kế hồ sơ thi công dân dụng và thương mại.',
    },
    {
      uid: 'seller_sis_bao_002',
      email: 'ks.bao@thuviensis.vn',
      phone: '0901000102',
      fullName: 'Kỹ sư Trần Quốc Bảo',
      emailVerified: true,
      status: 'ACTIVE',
      sellerDisplayName: 'BIM & Kết Cấu Việt',
      sellerSlug: 'bim-ket-cau-viet',
      specialty: 'Kết cấu BIM Revit & MEP',
      bio: 'Chuyên gia triển khai mô hình BIM LOD 350, kết cấu thép và cơ điện công trình cao tầng.',
    },
    {
      uid: 'seller_sis_namviet_003',
      email: 'design@namvietcons.vn',
      phone: '0901000103',
      fullName: 'Văn phòng Thiết kế Nam Việt',
      emailVerified: true,
      status: 'ACTIVE',
      sellerDisplayName: 'Nam Việt Design Lab',
      sellerSlug: 'nam-viet-design-lab',
      specialty: 'Nội thất, Quy hoạch & Hạ tầng',
      bio: 'Cung cấp hồ sơ thiết kế nội thất chi tiết, bản vẽ cầu đường và tài liệu kỹ thuật chuẩn TCVN.',
    },
  ];

  const sellerRoleId = roleMap.get('SELLER');
  const memberRoleId = roleMap.get('MEMBER');
  const sellerIds: number[] = [];

  for (const s of sellerUsers) {
    const [insertedUser] = await db
      .insert(users)
      .values({
        uid: s.uid,
        email: s.email,
        phone: s.phone,
        fullName: s.fullName,
        emailVerified: s.emailVerified,
        status: s.status,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: { fullName: s.fullName },
      })
      .returning();

    await db.insert(userProfiles).values({ userId: insertedUser.id, jobTitle: s.specialty }).onConflictDoNothing();
    await db.insert(wallets).values({ userId: insertedUser.id }).onConflictDoNothing();
    if (memberRoleId) await db.insert(userRoles).values({ userId: insertedUser.id, roleId: memberRoleId }).onConflictDoNothing();
    if (sellerRoleId) await db.insert(userRoles).values({ userId: insertedUser.id, roleId: sellerRoleId }).onConflictDoNothing();

    const [insertedSeller] = await db
      .insert(sellers)
      .values({
        userId: insertedUser.id,
        displayName: s.sellerDisplayName,
        slug: s.sellerSlug,
        specialty: s.specialty,
        bio: s.bio,
        verifiedStatus: 'VERIFIED',
        commissionRateBps: 7000,
      })
      .onConflictDoUpdate({
        target: sellers.userId,
        set: { displayName: s.sellerDisplayName },
      })
      .returning();

    await db.insert(sellerBalances).values({ sellerId: insertedSeller.id }).onConflictDoNothing();
    sellerIds.push(insertedSeller.id);
  }

  const allCats = await db.select().from(categories);
  const catMap = new Map(allCats.map((c) => [c.slug, c.id]));

  const tagSeeds = [
    { name: 'Hồ sơ thi công đầy đủ', slug: 'ho-so-thi-cong' },
    { name: 'Chuẩn TCVN', slug: 'chuan-tcvn' },
    { name: 'Có file 3D', slug: 'co-file-3d' },
    { name: 'BIM LOD 350', slug: 'bim-lod-350' },
    { name: 'Miễn phí tham khảo', slug: 'mien-phi-tham-khao' },
  ];
  await db.insert(productTags).values(tagSeeds).onConflictDoNothing({ target: productTags.slug });
  const allTags = await db.select().from(productTags);
  const tagMap = new Map(allTags.map((t) => [t.slug, t.id]));

  const IMG_VILLA = '/src/assets/images/drawing_modern_villa_1794798219281.jpg';
  const IMG_TOWNHOUSE = '/src/assets/images/drawing_townhouse_facade_1794798220506.jpg';
  const IMG_BIM = '/src/assets/images/drawing_structural_bim_1794798220917.jpg';
  const IMG_INTERIOR = '/src/assets/images/drawing_interior_living_1794798220391.jpg';
  const IMG_MEP = '/src/assets/images/drawing_mep_mechanical_1794798222346.jpg';
  const IMG_HERO = '/src/assets/images/hero_sis_architecture_1794798218632.jpg';

  const productSeeds = [
    {
      code: 'SIS-BT-001',
      slug: 'ho-so-biet-thu-hien-dai-3-tang-12x20m',
      title: 'Hồ sơ thiết kế thi công Biệt thự hiện đại 3 tầng (12x20m) — Full Kiến trúc, Kết cấu, MEP',
      summary: 'Trọn bộ bản vẽ thi công biệt thự nhiệt đới có hồ bơi, 68 bản vẽ AutoCAD + mô hình SketchUp.',
      description:
        'Hồ sơ thiết kế kỹ thuật thi công hoàn chỉnh cho biệt thự hiện đại 3 tầng diện tích xây dựng 12x20m. Bao gồm đầy đủ mặt bằng công năng, mặt đứng, mặt cắt chi tiết, chi tiết cầu thang, vệ sinh, kết cấu móng cọc, dầm sàn và hệ thống cấp thoát nước – điện chiếu sáng.',
      categorySlug: 'biet-thu',
      sellerIdx: 0,
      listedPriceVnd: 250000,
      isFree: false,
      fileFormat: 'DWG + SKP',
      softwareVersion: 'AutoCAD 2022+ / SketchUp 2023',
      fileSizeBytes: 148500000,
      fileSizeLabel: '141.6 MB',
      pageOrSheetCount: 68,
      thumbnailUrl: IMG_VILLA,
      gallery: [IMG_VILLA, IMG_INTERIOR, IMG_BIM],
      isFeatured: true,
      viewCount: 1842,
      purchaseCount: 94,
      downloadCount: 112,
      ratingAvg: 49,
      tags: ['ho-so-thi-cong', 'co-file-3d'],
    },
    {
      code: 'SIS-NP-002',
      slug: 'ban-ve-nha-pho-4-tang-mat-tien-5m-hien-dai',
      title: 'Bản vẽ thi công Nhà phố 4 tầng mặt tiền 5x18m — Phong cách tối giản xanh',
      summary: 'Bộ hồ sơ xin phép xây dựng và thi công nhà phố 4 tầng, đầy đủ chi tiết lam thép và ban công.',
      description:
        'Bản vẽ kiến trúc & kết cấu nhà phố 4 tầng kích thước 5x18m tối ưu thông gió tự nhiên và ánh sáng giếng trời. File CAD được quản lý layer khoa học, dễ dàng chỉnh sửa theo kích thước khu đất thực tế.',
      categorySlug: 'nha-pho',
      sellerIdx: 0,
      listedPriceVnd: 180000,
      isFree: false,
      fileFormat: 'DWG',
      softwareVersion: 'AutoCAD 2020+',
      fileSizeBytes: 64200000,
      fileSizeLabel: '61.2 MB',
      pageOrSheetCount: 44,
      thumbnailUrl: IMG_TOWNHOUSE,
      gallery: [IMG_TOWNHOUSE, IMG_INTERIOR],
      isFeatured: true,
      viewCount: 2310,
      purchaseCount: 128,
      downloadCount: 145,
      ratingAvg: 48,
      tags: ['ho-so-thi-cong', 'chuan-tcvn'],
    },
    {
      code: 'SIS-BIM-003',
      slug: 'mo-hinh-bim-revit-ket-cau-nha-xuong-khung-thep',
      title: 'Mô hình BIM Revit Kết cấu Nhà xưởng khung thép tiền chế nhịp 36m (LOD 350)',
      summary: 'File Revit (.RVT) + IFC kết cấu móng, cột BTCT và hệ dàn kèo thép không gian chuẩn BIM.',
      description:
        'Hồ sơ mô hình thông tin công trình BIM cho tổ hợp nhà xưởng công nghiệp nhịp 36m x 64m. Tích hợp đầy đủ family liên kết bu-lông neo, bảng thống kê khối lượng thép tự động (BOQ) và bản vẽ shop drawing xuất trực tiếp từ Revit.',
      categorySlug: 'bim',
      sellerIdx: 1,
      listedPriceVnd: 320000,
      isFree: false,
      fileFormat: 'RVT + IFC',
      softwareVersion: 'Revit 2024',
      fileSizeBytes: 215000000,
      fileSizeLabel: '205.0 MB',
      pageOrSheetCount: 52,
      thumbnailUrl: IMG_BIM,
      gallery: [IMG_BIM, IMG_MEP],
      isFeatured: true,
      viewCount: 1290,
      purchaseCount: 67,
      downloadCount: 73,
      ratingAvg: 50,
      tags: ['bim-lod-350', 'chuan-tcvn'],
    },
    {
      code: 'SIS-NT-004',
      slug: 'ho-so-noi-that-can-ho-3-phong-ngu-go-soi',
      title: 'Hồ sơ triển khai Nội thất Căn hộ 3PN phong cách Japandi — SketchUp & CAD chi tiết đồ gỗ',
      summary: 'Full 3D SketchUp V-Ray và bản vẽ bổ kỹ thuật chi tiết tủ bếp, vách ốp gỗ sồi, trần thạch cao.',
      description:
        'Bộ hồ sơ nội thất dành cho căn hộ 110m2 gồm phòng khách, bếp đảo, 3 phòng ngủ và logia. Đính kèm bảng mã vật liệu An Cường, kích thước phủ bì và chi tiết liên kết mộc phục vụ sản xuất xưởng.',
      categorySlug: 'noi-that',
      sellerIdx: 2,
      listedPriceVnd: 150000,
      isFree: false,
      fileFormat: 'SKP + DWG',
      softwareVersion: 'SketchUp 2022 / AutoCAD 2021',
      fileSizeBytes: 186000000,
      fileSizeLabel: '177.4 MB',
      pageOrSheetCount: 38,
      thumbnailUrl: IMG_INTERIOR,
      gallery: [IMG_INTERIOR, IMG_VILLA],
      isFeatured: true,
      viewCount: 1620,
      purchaseCount: 83,
      downloadCount: 91,
      ratingAvg: 49,
      tags: ['co-file-3d', 'ho-so-thi-cong'],
    },
    {
      code: 'SIS-DN-005',
      slug: 'he-thong-mep-hvac-dien-toa-nha-van-phong-7-tang',
      title: 'Bản vẽ MEP Hệ thống Điều hòa Chiller & Điện động lực tòa nhà văn phòng 7 tầng',
      summary: 'Thiết kế kỹ thuật thi công hệ thống HVAC AHU, ống gió, thang máng cáp và tủ điện tổng MSB.',
      description:
        'Hồ sơ cơ điện MEP hoàn chỉnh cho tòa nhà văn phòng hạng B quy mô 7 tầng + 1 hầm. Bao gồm sơ đồ nguyên lý hệ thống Chiller, tính toán tổn thất áp suất đường ống gió, sơ đồ đơn tuyến tủ điện MSB và hệ thống tiếp địa chống sét.',
      categorySlug: 'dien-nuoc',
      sellerIdx: 1,
      listedPriceVnd: 220000,
      isFree: false,
      fileFormat: 'DWG + RVT',
      softwareVersion: 'AutoCAD MEP / Revit 2023',
      fileSizeBytes: 124000000,
      fileSizeLabel: '118.2 MB',
      pageOrSheetCount: 56,
      thumbnailUrl: IMG_MEP,
      gallery: [IMG_MEP, IMG_BIM],
      isFeatured: true,
      viewCount: 980,
      purchaseCount: 41,
      downloadCount: 49,
      ratingAvg: 48,
      tags: ['chuan-tcvn', 'bim-lod-350'],
    },
    {
      code: 'SIS-KT-006',
      slug: 'thu-vien-block-autocad-kien-truc-noi-that-chuan',
      title: 'Thư viện Block AutoCAD Kiến trúc & Ký hiệu bản vẽ chuẩn ISO/TCVN (Bản chia sẻ miễn phí)',
      summary: 'Hơn 850 block CAD 2D cây xanh, xe cộ, nội thất, ký hiệu trục, cao độ và khung tên bản vẽ A1-A3.',
      description:
        'Tài nguyên miễn phí dành cho kiến trúc sư và sinh viên ngành xây dựng. Toàn bộ block đã được chuẩn hóa về layer 0, đơn vị milimet (mm) giúp tăng tốc độ triển khai bản vẽ kỹ thuật trên AutoCAD.',
      categorySlug: 'autocad',
      sellerIdx: 0,
      listedPriceVnd: 0,
      isFree: true,
      fileFormat: 'DWG',
      softwareVersion: 'AutoCAD 2018+',
      fileSizeBytes: 28400000,
      fileSizeLabel: '27.1 MB',
      pageOrSheetCount: 12,
      thumbnailUrl: IMG_HERO,
      gallery: [IMG_HERO, IMG_TOWNHOUSE],
      isFeatured: false,
      viewCount: 4520,
      purchaseCount: 0,
      downloadCount: 890,
      ratingAvg: 50,
      tags: ['mien-phi-tham-khao', 'chuan-tcvn'],
    },
    {
      code: 'SIS-KC-007',
      slug: 'chi-tiet-ket-cau-mong-coc-ly-tam-nha-cao-tang',
      title: 'Bản vẽ Kết cấu Móng cọc ly tâm & Tầng hầm công trình chung cư 18 tầng',
      summary: 'Hồ sơ kết cấu đài cọc, tường vây barrette, hệ giằng shoring và bảng tính Etabs tham khảo.',
      description:
        'Cung cấp chi tiết bố trí cốt thép đài móng, dầm giằng móng, vách lõi thang máy và chi tiết nối thép coupler theo TCVN 5574:2018. Phù hợp tham khảo cho kỹ sư kết cấu và sinh viên làm đồ án tốt nghiệp.',
      categorySlug: 'ket-cau',
      sellerIdx: 1,
      listedPriceVnd: 200000,
      isFree: false,
      fileFormat: 'DWG + PDF',
      softwareVersion: 'AutoCAD 2021+',
      fileSizeBytes: 78500000,
      fileSizeLabel: '74.8 MB',
      pageOrSheetCount: 48,
      thumbnailUrl: IMG_BIM,
      gallery: [IMG_BIM],
      isFeatured: false,
      viewCount: 1120,
      purchaseCount: 54,
      downloadCount: 62,
      ratingAvg: 47,
      tags: ['chuan-tcvn', 'ho-so-thi-cong'],
    },
    {
      code: 'SIS-DA-008',
      slug: 'do-an-tot-nghiep-trung-tam-van-hoa-trien-lam-do-thi',
      title: 'Đồ án Tốt nghiệp Kiến trúc: Trung tâm Triển lãm & Bảo tàng Đô thị (Điểm 9.5)',
      summary: 'Trọn bộ file trình bày dàn trang PSD, bản vẽ CAD mặt bằng tổng thể và mô hình 3D SketchUp.',
      description:
        'Đồ án tốt nghiệp xuất sắc với giải pháp kiến trúc kết cấu nhịp lớn kết hợp không gian cảnh quan ven sông. Bao gồm 12 tờ A1 dàn trang chất lượng cao, file mô hình 3D và thuyết minh chi tiết.',
      categorySlug: 'do-an',
      sellerIdx: 2,
      listedPriceVnd: 90000,
      isFree: false,
      fileFormat: 'DWG + SKP + PDF',
      softwareVersion: 'AutoCAD / SketchUp 2022',
      fileSizeBytes: 310000000,
      fileSizeLabel: '295.6 MB',
      pageOrSheetCount: 24,
      thumbnailUrl: IMG_HERO,
      gallery: [IMG_HERO, IMG_VILLA],
      isFeatured: false,
      viewCount: 1540,
      purchaseCount: 72,
      downloadCount: 80,
      ratingAvg: 49,
      tags: ['co-file-3d'],
    },
    {
      code: 'SIS-RV-009',
      slug: 'bo-family-revit-cua-nhom-xingfa-he-55-va-93',
      title: 'Bộ Family Revit Cửa đi & Cửa sổ nhôm kính hệ Xingfa tham biến thông minh',
      summary: '45 Family cửa đi mở quay, cửa lùa, vách kính mặt dựng tự động cập nhật kích thước và bảng thống kê.',
      description:
        'Thư viện Family Revit (.RFA) được xây dựng chuẩn tham biến (Parametric), đầy đủ cấp độ chi tiết Fine/Medium/Coarse cho mặt bằng và mặt đứng, hỗ trợ xuất thống kê cửa chính xác.',
      categorySlug: 'revit',
      sellerIdx: 1,
      listedPriceVnd: 0,
      isFree: true,
      fileFormat: 'RVT / RFA',
      softwareVersion: 'Revit 2022+',
      fileSizeBytes: 34600000,
      fileSizeLabel: '33.0 MB',
      pageOrSheetCount: 45,
      thumbnailUrl: IMG_TOWNHOUSE,
      gallery: [IMG_TOWNHOUSE],
      isFeatured: false,
      viewCount: 3180,
      purchaseCount: 0,
      downloadCount: 640,
      ratingAvg: 50,
      tags: ['mien-phi-tham-khao', 'bim-lod-350'],
    },
    {
      code: 'SIS-TL-010',
      slug: 'bien-phap-thi-cong-phan-ngam-va-an-toan-lao-dong-mau',
      title: 'Thuyết minh Biện pháp thi công phần thân & An toàn lao động nhà cao tầng (Miễn phí)',
      summary: 'Bộ tài liệu kỹ thuật Word + bản vẽ tổng mặt bằng thi công cần trục tháp, vận thăng lồng.',
      description:
        'Tài liệu mẫu chuẩn phục vụ lập hồ sơ đấu thầu thi công xây lắp: tổ chức công trường, biện pháp cốp pha nhôm, đổ bê tông khối lớn và quy trình nghiệm thu theo Nghị định 06/2021/NĐ-CP.',
      categorySlug: 'tai-lieu-ky-thuat',
      sellerIdx: 2,
      listedPriceVnd: 0,
      isFree: true,
      fileFormat: 'DOCX + DWG',
      softwareVersion: 'AutoCAD / MS Word',
      fileSizeBytes: 19200000,
      fileSizeLabel: '18.3 MB',
      pageOrSheetCount: 86,
      thumbnailUrl: IMG_MEP,
      gallery: [IMG_MEP],
      isFeatured: false,
      viewCount: 2740,
      purchaseCount: 0,
      downloadCount: 512,
      ratingAvg: 48,
      tags: ['mien-phi-tham-khao', 'chuan-tcvn'],
    },
  ];

  for (const p of productSeeds) {
    const categoryId = catMap.get(p.categorySlug);
    const sellerId = sellerIds[p.sellerIdx];
    if (!categoryId || !sellerId) continue;

    const [createdProduct] = await db
      .insert(products)
      .values({
        code: p.code,
        slug: p.slug,
        title: p.title,
        summary: p.summary,
        description: p.description,
        categoryId,
        sellerId,
        listedPriceVnd: p.listedPriceVnd,
        isFree: p.isFree,
        fileFormat: p.fileFormat,
        softwareVersion: p.softwareVersion,
        fileSizeBytes: p.fileSizeBytes,
        fileSizeLabel: p.fileSizeLabel,
        pageOrSheetCount: p.pageOrSheetCount,
        thumbnailUrl: p.thumbnailUrl,
        approvalStatus: 'APPROVED',
        isFeatured: p.isFeatured,
        viewCount: p.viewCount,
        purchaseCount: p.purchaseCount,
        downloadCount: p.downloadCount,
        ratingAvg: p.ratingAvg,
        publishedAt: new Date(),
      })
      .onConflictDoNothing({ target: products.code })
      .returning();

    if (!createdProduct) continue;

    await db.insert(sellerProducts).values({ sellerId, productId: createdProduct.id }).onConflictDoNothing();

    for (let i = 0; i < p.gallery.length; i++) {
      await db.insert(productImages).values({
        productId: createdProduct.id,
        imageUrl: p.gallery[i],
        caption: `Hình ảnh xem trước #${i + 1} — ${p.code}`,
        sortOrder: i + 1,
      });
    }

    const [createdFile] = await db
      .insert(productFiles)
      .values({
        productId: createdProduct.id,
        storageBucket: 'sis-private-vault',
        storageKey: `drawings/${p.code.toLowerCase()}/package-v1.zip`,
        originalFilename: `${p.code}_${p.slug}.zip`,
        mimeType: 'application/zip',
        sizeBytes: p.fileSizeBytes,
        versionLabel: 'v1.0',
        isPrimary: true,
      })
      .returning();

    await db.insert(productVersions).values({
      productId: createdProduct.id,
      versionNumber: 'v1.0',
      changelog: 'Phát hành hồ sơ bản vẽ chuẩn nghiệm thu lần đầu.',
      fileId: createdFile.id,
    });

    for (const tagSlug of p.tags) {
      const tId = tagMap.get(tagSlug);
      if (tId) {
        await db
          .insert(productTagRelations)
          .values({ productId: createdProduct.id, tagId: tId })
          .onConflictDoNothing();
      }
    }
  }
}

async function ensureMasterAdminAccount(roleMap: Map<string, number>): Promise<void> {
  const email = 'quanly@nhavang.com';
  const defaultPassword = 'nhavang256@';
  const unlimitedBalanceVnd = 2_000_000_000;

  let [adminUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!adminUser) {
    const passwordHash = await bcrypt.hash(defaultPassword, 12);
    const [inserted] = await db
      .insert(users)
      .values({
        uid: 'admin_nhavang_quanly',
        email,
        phone: '0946265256',
        passwordHash,
        fullName: 'Quản trị Hệ thống Nhà Vàng',
        emailVerified: true,
        status: 'ACTIVE',
      })
      .onConflictDoNothing()
      .returning();

    if (inserted) {
      adminUser = inserted;
    } else {
      const [refetched] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      adminUser = refetched;
    }
  } else if (!adminUser.passwordHash) {
    const passwordHash = await bcrypt.hash(defaultPassword, 12);
    const [updated] = await db
      .update(users)
      .set({ passwordHash, emailVerified: true, status: 'ACTIVE', updatedAt: new Date() })
      .where(eq(users.id, adminUser.id))
      .returning();
    adminUser = updated;
  }

  if (!adminUser) return;

  await db
    .insert(userProfiles)
    .values({
      userId: adminUser.id,
      companyName: 'THƯ VIỆN SIS — Nhà Vàng Admin',
      jobTitle: 'Quản trị viên Toàn hệ thống',
      city: 'TP. Hồ Chí Minh',
    })
    .onConflictDoNothing();

  // Assign all operational RBAC roles so this account manages every module
  const allManagedRoleCodes = ['MEMBER', 'SELLER', 'MODERATOR', 'ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN'];
  for (const code of allManagedRoleCodes) {
    const roleId = roleMap.get(code);
    if (roleId) {
      await db
        .insert(userRoles)
        .values({ userId: adminUser.id, roleId, assignedBy: adminUser.id })
        .onConflictDoNothing();
    }
  }

  // Ensure verified Seller profile so account can also publish/edit/manage Marketplace products
  const [sellerRow] = await db
    .insert(sellers)
    .values({
      userId: adminUser.id,
      displayName: 'Nhà Vàng Official Store',
      slug: 'nha-vang-official',
      specialty: 'Kho Dữ liệu Kỹ thuật Tổng hợp',
      bio: 'Tài khoản quản trị viên toàn hệ thống THƯ VIỆN SIS.',
      verifiedStatus: 'VERIFIED',
      commissionRateBps: 7000,
    })
    .onConflictDoNothing()
    .returning();

  const effectiveSeller =
    sellerRow ||
    (await db.select().from(sellers).where(eq(sellers.userId, adminUser.id)).limit(1))[0];

  if (effectiveSeller) {
    await db
      .insert(sellerBalances)
      .values({ sellerId: effectiveSeller.id })
      .onConflictDoNothing();
  }

  // Ensure wallet exists and seed initial unlimited credit once via immutable ledger
  await db.insert(wallets).values({ userId: adminUser.id }).onConflictDoNothing();
  const [walletRow] = await db
    .select()
    .from(wallets)
    .where(eq(wallets.userId, adminUser.id))
    .limit(1);

  if (walletRow) {
    const seedIdemKey = 'seed-master-admin-quanly-nhavang-wallet';
    const [existingSeedTx] = await db
      .select({ id: walletTransactions.id })
      .from(walletTransactions)
      .where(eq(walletTransactions.idempotencyKey, seedIdemKey))
      .limit(1);

    if (!existingSeedTx) {
      await db.transaction(async (tx) => {
        const [freshWallet] = await tx
          .select()
          .from(wallets)
          .where(eq(wallets.id, walletRow.id))
          .for('update')
          .limit(1);

        if (!freshWallet) return;

        const targetBalance = Math.max(freshWallet.availableBalanceVnd, unlimitedBalanceVnd);
        const delta = Math.max(0, targetBalance - freshWallet.availableBalanceVnd);

        await tx
          .update(wallets)
          .set({
            availableBalanceVnd: targetBalance,
            totalDepositedVnd: Math.min(2_000_000_000, freshWallet.totalDepositedVnd + delta),
            version: freshWallet.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(wallets.id, freshWallet.id));

        await tx
          .insert(walletTransactions)
          .values({
            txCode: `TX-ADM-SEED-${adminUser.id}`,
            walletId: freshWallet.id,
            userId: adminUser.id,
            txType: 'ADMIN_ADJUST',
            direction: 'CREDIT',
            amountVnd: delta > 0 ? delta : unlimitedBalanceVnd,
            balanceBeforeVnd: freshWallet.availableBalanceVnd,
            balanceAfterVnd: targetBalance,
            status: 'COMPLETED',
            source: 'SYSTEM',
            referenceCode: 'MASTER_ADMIN_SEED',
            description: 'Cấp số dư ví Quản trị viên không giới hạn (quanly@nhavang.com)',
            idempotencyKey: seedIdemKey,
          })
          .onConflictDoNothing();
      });
    }
  }
}
