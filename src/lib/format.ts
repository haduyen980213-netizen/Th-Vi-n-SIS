export function formatVnd(amount: number): string {
  if (amount <= 0) {
    return 'Miễn phí';
  }
  return new Intl.NumberFormat('vi-VN').format(amount) + ' ₫';
}

export function formatNumberVi(value: number): string {
  return new Intl.NumberFormat('vi-VN').format(value);
}

export function formatDateVi(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '—';
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}
