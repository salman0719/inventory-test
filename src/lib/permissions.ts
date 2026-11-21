export type Role = "owner" | "staff" | "viewer";
export function can(_role: Role, _action: string): boolean {
  return false;
}
