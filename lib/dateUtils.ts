/**
 * Date Utility Functions for Document and Report Formatting
 * Requirement:
 * - รูปแบบวันที่ในเอกสารเป็น วว/ดด/ปปปป (เป็นวันที่เลขตัวเดียวไม่ต้องใส่ 0 นำหน้า)
 * - รองรับปี พ.ศ. (เช่น 2568) และแปลงปี ค.ศ. (< 2400 เช่น 2025 -> 2568) โดยอัตโนมัติ
 * - รองรับทุกรูปแบบ: YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY, ชื่อเดือนภาษาไทย (ก.พ., กุมภาพันธ์ ฯลฯ)
 */

const THAI_MONTH_MAP: { [key: string]: number } = {
  'มกราคม': 1, 'ม.ค.': 1, 'ม.ค': 1,
  'กุมภาพันธ์': 2, 'ก.พ.': 2, 'ก.พ': 2,
  'มีนาคม': 3, 'มี.ค.': 3, 'มี.ค': 3,
  'เมษายน': 4, 'เม.ย.': 4, 'เม.ย': 4,
  'พฤษภาคม': 5, 'พ.ค.': 5, 'พ.ค': 5,
  'มิถุนายน': 6, 'มิ.ย.': 6, 'มิ.ย': 6,
  'กรกฎาคม': 7, 'ก.ค.': 7, 'ก.ค': 7,
  'สิงหาคม': 8, 'ส.ค.': 8, 'ส.ค': 8,
  'กันยายน': 9, 'ก.ย.': 9, 'ก.ย': 9,
  'ตุลาคม': 10, 'ต.ค.': 10, 'ต.ค': 10,
  'พฤศจิกายน': 11, 'พ.ย.': 11, 'พ.ย': 11,
  'ธันวาคม': 12, 'ธ.ค.': 12, 'ธ.ค': 12,
};

/**
 * Format any date string to Thai document format: ว/ด/ปปปป (เลขตัวเดียวไม่มี 0 นำหน้า, ปี พ.ศ.)
 * e.g. "2025-02-15" -> "15/2/2568"
 *      "2025-07-04" -> "4/7/2568"
 *      "04/07/2568" -> "4/7/2568"
 */
export function formatDocumentDate(dateStr?: string | null): string {
  if (!dateStr || dateStr === '-') return '-';
  const trimmed = String(dateStr).trim();
  if (!trimmed || trimmed === '-') return '-';

  const pad2 = (n: number | string) => String(parseInt(String(n), 10)).padStart(2, '0');

  // 1. Check Thai Month Name in string (e.g. "15 กุมภาพันธ์ 2568" or "4 ก.ค. 2568")
  for (const [mName, mNum] of Object.entries(THAI_MONTH_MAP)) {
    if (trimmed.includes(mName)) {
      const match = trimmed.match(/(\d{1,2})\s+[^\d]+\s*(\d{2,4})?/);
      if (match) {
        const d = parseInt(match[1], 10);
        let y = match[2] ? parseInt(match[2], 10) : new Date().getFullYear() + 543;
        if (y < 100) y += 2500;
        if (y < 2400) y += 543;
        return `${pad2(d)}/${pad2(mNum)}/${y}`;
      }
      return trimmed;
    }
  }

  // Remove time portion if any (T... or space ...)
  const dateOnly = trimmed.split(/[T\s]/)[0];

  // 2. Numeric formats with /, -, or .
  if (dateOnly.includes('/') || dateOnly.includes('-') || dateOnly.includes('.')) {
    const separator = dateOnly.includes('/') ? '/' : (dateOnly.includes('-') ? '-' : '.');
    const parts = dateOnly.split(separator);

    if (parts.length === 3) {
      // Case 2.1: YYYY-MM-DD or YYYY/MM/DD
      if (parts[0].length === 4) {
        let y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const d = parseInt(parts[2], 10);
        if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
          if (y < 2400) y += 543;
          return `${pad2(d)}/${pad2(m)}/${y}`;
        }
      }

      // Case 2.2: DD/MM/YYYY or MM/DD/YYYY
      const p0 = parseInt(parts[0], 10);
      const p1 = parseInt(parts[1], 10);
      let y = parseInt(parts[2], 10);

      if (!isNaN(p0) && !isNaN(p1) && !isNaN(y)) {
        if (y < 100) y += 2500;
        if (y < 2400) y += 543;

        let d = p0;
        let m = p1;

        // If first number is > 12, it must be day
        if (p0 > 12 && p1 <= 12) {
          d = p0;
          m = p1;
        } else if (p1 > 12 && p0 <= 12) {
          // If second number is > 12, first is month (US format MM/DD/YYYY)
          d = p1;
          m = p0;
        }
        return `${pad2(d)}/${pad2(m)}/${y}`;
      }
    }
  }

  // 3. Fallback to native Date
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    const d = parsed.getDate();
    const m = parsed.getMonth() + 1;
    let y = parsed.getFullYear();
    if (y < 2400) y += 543;
    return `${pad2(d)}/${pad2(m)}/${y}`;
  }

  return trimmed;
}

/**
 * Extract Month number (1 - 12) reliably from any date string
 * Returns 1 for Jan, 2 for Feb, ..., 12 for Dec, or null if unparseable
 */
export function getMonthFromDate(dateStr?: string | null): number | null {
  if (!dateStr || dateStr === '-') return null;
  const trimmed = String(dateStr).trim();
  if (!trimmed || trimmed === '-') return null;

  // 1. Thai Month Names
  for (const [mName, mNum] of Object.entries(THAI_MONTH_MAP)) {
    if (trimmed.includes(mName)) {
      return mNum;
    }
  }

  // Remove time portion if any
  const dateOnly = trimmed.split(/[T\s]/)[0];

  // 2. Numeric parts with /, -, or .
  if (dateOnly.includes('/') || dateOnly.includes('-') || dateOnly.includes('.')) {
    const separator = dateOnly.includes('/') ? '/' : (dateOnly.includes('-') ? '-' : '.');
    const parts = dateOnly.split(separator);

    if (parts.length === 3) {
      // YYYY-MM-DD
      if (parts[0].length === 4) {
        const m = parseInt(parts[1], 10);
        return !isNaN(m) && m >= 1 && m <= 12 ? m : null;
      }

      const p0 = parseInt(parts[0], 10);
      const p1 = parseInt(parts[1], 10);

      // p0 > 12 -> p1 is month (e.g. 15/02/2568 -> 2)
      if (p0 > 12 && p1 >= 1 && p1 <= 12) {
        return p1;
      }
      // p1 > 12 -> p0 is month (e.g. 02/15/2568 -> 2)
      if (p1 > 12 && p0 >= 1 && p0 <= 12) {
        return p0;
      }
      // Both <= 12 (standard Thai DD/MM/YYYY)
      if (p1 >= 1 && p1 <= 12) {
        return p1;
      }
    }
  }

  // 3. Fallback to native Date
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    return d.getMonth() + 1;
  }

  return null;
}

/**
 * Convert any date string to standard HTML5 input[type="date"] format (YYYY-MM-DD, CE year)
 * Ensures value binds seamlessly to <input type="date" /> without clearing or errors
 */
export function isoDateForInput(dateStr?: string | null): string {
  if (!dateStr || dateStr === '-') return '';
  const trimmed = String(dateStr).trim();
  if (!trimmed || trimmed === '-') return '';

  // 1. Thai Month Names
  for (const [mName, mNum] of Object.entries(THAI_MONTH_MAP)) {
    if (trimmed.includes(mName)) {
      const match = trimmed.match(/(\d{1,2})\s+[^\d]+\s*(\d{2,4})?/);
      if (match) {
        const d = String(parseInt(match[1], 10)).padStart(2, '0');
        let y = match[2] ? parseInt(match[2], 10) : new Date().getFullYear();
        if (y < 100) y += 2500;
        if (y >= 2400) y -= 543;
        return `${y}-${String(mNum).padStart(2, '0')}-${d}`;
      }
    }
  }

  const dateOnly = trimmed.split(/[T\s]/)[0];

  // 2. If already standard YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    const parts = dateOnly.split('-');
    let y = parseInt(parts[0], 10);
    // If year is BE (e.g. 2568), convert to CE for HTML5 input
    if (y >= 2400) y -= 543;
    return `${y}-${parts[1]}-${parts[2]}`;
  }

  // 3. If DD/MM/YYYY or D/M/YYYY
  if (dateOnly.includes('/') || dateOnly.includes('-') || dateOnly.includes('.')) {
    const separator = dateOnly.includes('/') ? '/' : (dateOnly.includes('-') ? '-' : '.');
    const parts = dateOnly.split(separator);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        let y = parseInt(parts[0], 10);
        if (y >= 2400) y -= 543;
        const m = String(parseInt(parts[1], 10)).padStart(2, '0');
        const d = String(parseInt(parts[2], 10)).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }

      const p0 = parseInt(parts[0], 10);
      const p1 = parseInt(parts[1], 10);
      let y = parseInt(parts[2], 10);
      if (y < 100) y += 2500;
      if (y >= 2400) y -= 543;

      let d = p0;
      let m = p1;
      if (p0 <= 12 && p1 > 12) {
        m = p0;
        d = p1;
      }
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // 4. Fallback to native Date
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return '';
}
