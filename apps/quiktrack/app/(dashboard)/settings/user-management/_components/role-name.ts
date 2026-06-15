/**
 * Display label for an app role. The system "admin" role is stored lowercase
 * in the DB (the server matches on `name === "admin"`), but we present it
 * title-cased in the UI. Custom role names are shown exactly as the user typed
 * them so we don't mangle intentional casing.
 */
export function roleDisplayName(name: string): string {
  return name === "admin" ? "Admin" : name;
}
