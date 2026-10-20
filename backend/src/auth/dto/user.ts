import {UserRole} from '@prisma/client';
export interface SafeUser {id: string; email: string | null; uid: string | null; role: UserRole}
export function safeUser(user: SafeUser): SafeUser {
  // Explicit allowlist: never spread Prisma records or relations into responses.
  return {id: user.id, email: user.email, uid: user.uid, role: user.role};
}
