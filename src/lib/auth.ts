import bcrypt from "bcryptjs";

const DEFAULT_PASSWORD = "garderie";

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export function getDefaultPasswordHash(): string {
  return hashPassword(DEFAULT_PASSWORD);
}
