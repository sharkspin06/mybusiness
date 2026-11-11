// Singapore formats used everywhere in the app (see design/DESIGN-APPROVED.md).

const sgd = new Intl.NumberFormat('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 1234.5 -> "S$1,234.50"; negative -> "−S$1,234.50" */
export function formatMoney(amount: number): string {
  const s = 'S$' + sgd.format(Math.abs(amount));
  return amount < 0 ? '\u2212' + s : s;
}

/** Date -> "DD/MM/YYYY" */
export function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Date -> "HH:mm" (24-hour) */
export function formatTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "91234567" / "+6591234567" -> "+65 9123 4567". Non-SG numbers are returned unchanged. */
export function formatPhoneSG(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const local = digits.length === 10 && digits.startsWith('65') ? digits.slice(2) : digits;
  if (local.length !== 8) return raw;
  return `+65 ${local.slice(0, 4)} ${local.slice(4)}`;
}

/** WhatsApp link for an SG number. */
export function whatsappLink(phone: string, text: string): string {
  const digits = phone.replace(/\D/g, '');
  const intl = digits.length === 8 ? '65' + digits : digits;
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;
}
