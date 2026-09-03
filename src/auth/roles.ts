export type AppRole = "admin" | "staff" | "viewer";

const ADMIN_ONLY_PREFIXES = ["/settings/"];
const STAFF_AND_ADMIN_PREFIXES = ["/analytics/"];

export function normalizeRole(role: unknown): AppRole {
  const value = String(role || "")
    .trim()
    .toLowerCase();
  if (value === "admin" || value === "staff" || value === "viewer") {
    return value;
  }
  return "viewer";
}

function normalizePathname(pathname: string): string {
  if (!pathname) return "/";
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

export function canAccessPath(roleInput: unknown, pathname: string): boolean {
  const role = normalizeRole(roleInput);
  const normalizedPath = normalizePathname(pathname);

  if (role === "admin") return true;

  if (ADMIN_ONLY_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix))) {
    return false;
  }

  if (
    STAFF_AND_ADMIN_PREFIXES.some((prefix) =>
      normalizedPath.startsWith(prefix),
    )
  ) {
    return role === "staff";
  }

  // Viewers can read operational pages. Mutation authorization is enforced
  // by the API and by page-level action controls.
  return true;
}

export function canAccessResource(
  roleInput: unknown,
  resource: string,
): boolean {
  const role = normalizeRole(roleInput);

  if (role === "admin" || role === "staff") return true;

  return false;
}

export function canManageBookings(roleInput: unknown): boolean {
  return normalizeRole(roleInput) !== "viewer";
}

export function canManageOperations(roleInput: unknown): boolean {
  return normalizeRole(roleInput) !== "viewer";
}
