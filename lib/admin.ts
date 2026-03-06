/**
 * Admin utilities. Uses ADMIN_EMAILS env var (comma-separated) to determine admin access.
 */

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email?.trim()) return false;
  const list = process.env.ADMIN_EMAILS;
  if (!list?.trim()) return false;
  const emails = list.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return emails.includes(email.toLowerCase());
}
