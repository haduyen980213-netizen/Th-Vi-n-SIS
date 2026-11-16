import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

interface ZipEntryInput {
  name: string;
  content: Buffer;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function createZipBuffer(entries: ZipEntryInput[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  const now = new Date();
  const dosTime =
    ((now.getHours() & 0x1f) << 11) |
    ((now.getMinutes() & 0x3f) << 5) |
    ((now.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((Math.max(1980, now.getFullYear()) - 1980) & 0x7f) << 9) |
    (((now.getMonth() + 1) & 0x0f) << 5) |
    (now.getDate() & 0x1f);

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const uncompressed = entry.content;
    const compressed = zlib.deflateRawSync(uncompressed);
    const crc = crc32(uncompressed);

    // Local file header (30 bytes + filename)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 flag
    localHeader.writeUInt16LE(8, 8); // deflate compression
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(uncompressed.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, compressed);

    // Central directory header (46 bytes + filename)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0x0800, 8); // UTF-8
    centralHeader.writeUInt16LE(8, 10); // deflate
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(uncompressed.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralDirBuf = Buffer.concat(centralParts);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralDirBuf.length, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirBuf, endRecord]);
}

const PRIVATE_VAULT_DIR = path.resolve(process.cwd(), 'storage', 'private-vault');

export function resolvePrivateVaultPath(storageKey: string): string {
  const normalized = path.normalize(storageKey).replace(/^(\.\.[/\\])+/, '');
  const resolved = path.resolve(PRIVATE_VAULT_DIR, normalized);
  if (!resolved.startsWith(PRIVATE_VAULT_DIR)) {
    throw new Error('Đường dẫn tệp không hợp lệ.');
  }
  return resolved;
}

export function ensureVaultArchiveForProduct(params: {
  storageKey: string;
  productCode: string;
  productTitle: string;
  categoryName: string;
  fileFormat: string;
  softwareVersion: string | null;
  pageOrSheetCount: number;
  sellerName: string;
  summary: string;
}): string {
  const fullPath = resolvePrivateVaultPath(params.storageKey);
  if (fs.existsSync(fullPath)) {
    return fullPath;
  }

  fs.mkdirSync(path.dirname(fullPath), { recursive: true });

  const readmeContent = [
    '====================================================================',
    'THƯ VIỆN SIS (SIS DIGITAL LIBRARY) — HỒ SƠ BẢN VẼ KỸ THUẬT',
    '====================================================================',
    `Mã hồ sơ        : ${params.productCode}`,
    `Tên hồ sơ       : ${params.productTitle}`,
    `Danh mục        : ${params.categoryName}`,
    `Định dạng       : ${params.fileFormat}`,
    `Phần mềm        : ${params.softwareVersion || 'Tiêu chuẩn chung'}`,
    `Số lượng bản vẽ : ${params.pageOrSheetCount} bản vẽ / trang`,
    `Đơn vị phát hành: ${params.sellerName}`,
    '',
    'MÔ TẢ KỸ THUẬT:',
    params.summary,
    '',
    'ĐIỀU KHOẢN SỬ DỤNG:',
    '- Tài liệu được phân phối chính thức qua hệ thống THƯ VIỆN SIS.',
    '- Chỉ sử dụng cho mục đích nghiên cứu, thiết kế và thi công công trình hợp pháp.',
    '- Không phân phối lại gói tệp nguyên bản trên các nền tảng thương mại khác.',
    '====================================================================',
  ].join('\n');

  const manifestJson = JSON.stringify(
    {
      platform: 'THƯ VIỆN SIS',
      code: params.productCode,
      title: params.productTitle,
      category: params.categoryName,
      format: params.fileFormat,
      softwareVersion: params.softwareVersion,
      sheets: params.pageOrSheetCount,
      publisher: params.sellerName,
      generatedAt: new Date().toISOString(),
    },
    null,
    2
  );

  // Minimal valid ASCII DXF CAD reference header/drawing sheet
  const sampleDxf = [
    '0',
    'SECTION',
    '2',
    'HEADER',
    '9',
    '$INSUNITS',
    '70',
    '4',
    '0',
    'ENDSEC',
    '0',
    'SECTION',
    '2',
    'ENTITIES',
    '0',
    'LINE',
    '8',
    'SIS_FRAME',
    '10',
    '0.0',
    '20',
    '0.0',
    '11',
    '42000.0',
    '21',
    '29700.0',
    '0',
    'TEXT',
    '8',
    'SIS_TITLE',
    '10',
    '1000.0',
    '20',
    '1500.0',
    '40',
    '350.0',
    '1',
    `${params.productCode} - THU VIEN SIS`,
    '0',
    'ENDSEC',
    '0',
    'EOF',
  ].join('\n');

  const zipBuf = createZipBuffer([
    { name: 'README_THU_VIEN_SIS.txt', content: Buffer.from(readmeContent, 'utf8') },
    { name: 'MANIFEST_BAN_VE.json', content: Buffer.from(manifestJson, 'utf8') },
    { name: `${params.productCode}_Reference_Sheet.dxf`, content: Buffer.from(sampleDxf, 'utf8') },
  ]);

  fs.writeFileSync(fullPath, zipBuf);
  return fullPath;
}
