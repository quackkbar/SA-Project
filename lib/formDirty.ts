/**
 * Form Dirty State & Navigation Guard Utility
 * Tracks whether user has inputted unsaved data in forms across the application
 * and prompts for confirmation before discarding data when navigating or switching views.
 */

let isDirty = false;

export function setFormDirty(dirty: boolean): void {
  isDirty = dirty;
}

export function isFormDirty(): boolean {
  return isDirty;
}

export function confirmDiscardChanges(
  customMessage?: string
): boolean {
  if (!isDirty) return true;
  const msg =
    customMessage ||
    'คุณมีข้อมูลที่กำลังกรอกอยู่ ต้องการละทิ้งข้อมูลและเปลี่ยนหน้าใช่หรือไม่?';
  const confirmed = typeof window !== 'undefined' ? window.confirm(msg) : true;
  if (confirmed) {
    isDirty = false;
  }
  return confirmed;
}

// Global browser window unload protection
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (isDirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}
