/** Normalize BD phone numbers to E.164 (+8801XXXXXXXXX). */
export function normalizeBdPhone(input: string): string | null {
  const raw = input.trim().replace(/[\s\-()]/g, "");
  if (!raw) return null;

  let digits = raw.startsWith("+") ? raw.slice(1) : raw;
  digits = digits.replace(/\D/g, "");

  if (digits.startsWith("880") && digits.length === 13) {
    return `+${digits}`;
  }
  if (digits.startsWith("0") && digits.length === 11 && digits[1] === "1") {
    return `+880${digits.slice(1)}`;
  }
  if (digits.startsWith("1") && digits.length === 10) {
    return `+880${digits}`;
  }
  if (raw.startsWith("+880") && digits.length === 13) {
    return `+${digits}`;
  }

  return null;
}

export function maskPhone(phone: string): string {
  if (phone.length < 6) return phone;
  return `${phone.slice(0, 4)}****${phone.slice(-3)}`;
}
