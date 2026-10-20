import bcrypt from 'bcryptjs';
import {randomBytes} from 'node:crypto';
import {AuthError} from '../errors';
export class PasswordHasher {
  private constructor(private readonly cost: number, private readonly dummy: string) {}
  static async create(cost: number): Promise<PasswordHasher> {
    if (!Number.isInteger(cost) || cost < 12 || cost > 14) throw new AuthError('AUTH_CONFIG');
    return new PasswordHasher(cost, await bcrypt.hash(randomBytes(32).toString('hex'), cost));
  }
  async hash(password: unknown): Promise<string> {
    if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72 || password.includes('\0')) throw new AuthError('AUTH_INPUT');
    return bcrypt.hash(password, this.cost);
  }
  async verify(password: unknown, storedHash: string | null): Promise<boolean> {
    const usable = typeof password === 'string' && Buffer.byteLength(password, 'utf8') <= 1024;
    const validHash = storedHash !== null && /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(storedHash) && bcrypt.getRounds(storedHash) >= 4 && bcrypt.getRounds(storedHash) <= 16;
    // Exactly one bcrypt comparison on unknown, inactive and wrong-password paths.
    const match = await bcrypt.compare(usable ? password : 'invalid-input', validHash ? storedHash! : this.dummy);
    return usable && validHash && match;
  }
}
