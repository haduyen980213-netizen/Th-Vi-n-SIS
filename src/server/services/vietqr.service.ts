/**
 * EMVCo / NAPAS 247 VietQR Payload Builder
 * Produces standard QR strings scannable by all Vietnamese banking apps (SHB, VCB, TCB, MB, BIDV, etc.).
 */

function formatTlv(tag: string, value: string): string {
  const len = Buffer.byteLength(value, 'utf8').toString().padStart(2, '0');
  return `${tag}${len}${value}`;
}

function crc16CcittFalse(input: string): string {
  let crc = 0xffff;
  const buf = Buffer.from(input, 'utf8');
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i] << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export interface VietQrPayloadInput {
  bankBin: string;       // e.g. '970443' for SHB
  accountNumber: string; // e.g. '0946265256'
  amountVnd: number;
  transferContent: string;
}

export function buildVietQrPayload(input: VietQrPayloadInput): string {
  const cleanContent = input.transferContent
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .trim()
    .slice(0, 50);

  // Tag 38: NAPAS 247 Beneficiary Information
  const beneficiaryOrg =
    formatTlv('00', input.bankBin) +
    formatTlv('01', input.accountNumber);

  const merchantAccountInfo =
    formatTlv('00', 'A000000727') +
    formatTlv('01', beneficiaryOrg) +
    formatTlv('02', 'QRIBFTTA');

  // Tag 62: Additional Data Field (Transfer Purpose)
  const additionalData = cleanContent ? formatTlv('08', cleanContent) : '';

  const payloadWithoutCrc =
    formatTlv('00', '01') +
    formatTlv('01', input.amountVnd > 0 ? '12' : '11') +
    formatTlv('38', merchantAccountInfo) +
    formatTlv('53', '704') + // VND currency ISO 4217
    (input.amountVnd > 0 ? formatTlv('54', String(Math.round(input.amountVnd))) : '') +
    formatTlv('58', 'VN') +
    (additionalData ? formatTlv('62', additionalData) : '') +
    '6304';

  const crc = crc16CcittFalse(payloadWithoutCrc);
  return payloadWithoutCrc + crc;
}
