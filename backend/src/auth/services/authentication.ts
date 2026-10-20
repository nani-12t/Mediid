import {AuthConfig} from '../config';
import {PasswordHasher} from '../crypto/password';
import {resetCredential, resetDigest} from '../crypto/reset';
import {safeUser, SafeUser} from '../dto/user';
import {AuthError} from '../errors';
import {canonicalEmail, loginIdentity} from '../identity';
import {IdentityRepository} from '../repositories/identity';
import {AccessTokens, Principal} from '../tokens';
export interface ResetDelivery {
  // An explicit delivery port only; never an API response or logger. No mounted adapter in Phase 2.2A.
  send(email: string, credential: {secret: string; expiresAt: Date}): Promise<void>;
}
const resetResponse = () => ({message: 'If that identity is eligible, reset instructions will be sent.'});
export class Authentication {
  constructor(private readonly config: AuthConfig, private readonly repository: IdentityRepository,
    private readonly passwords: PasswordHasher, private readonly tokens: AccessTokens) {}
  async register(input: Record<string, unknown>): Promise<{token: string; user: SafeUser}> {
    if (Object.keys(input).some(key => !['email', 'password'].includes(key))) throw new AuthError('AUTH_INPUT');
    const email = canonicalEmail(input.email), passwordHash = await this.passwords.hash(input.password);
    const user = await this.repository.registerPatient(email, passwordHash);
    return {token: this.tokens.issue(user), user: safeUser(user)};
  }
  async login(identity: unknown, password: unknown): Promise<{token: string; user: SafeUser}> {
    let lookup: ReturnType<typeof loginIdentity> | undefined;
    try { lookup = loginIdentity(identity); } catch { /* malformed identities take the same bcrypt/error path */ }
    const user = lookup ? await this.repository.find(lookup) : null;
    const match = await this.passwords.verify(password, user?.passwordHash ?? null);
    if (!user || !user.isActive || !match) throw new AuthError('AUTH_CREDENTIALS');
    await this.repository.recordLogin(user.id);
    return {token: this.tokens.issue(user), user: safeUser(user)};
  }
  async authenticate(token: unknown): Promise<Principal> {
    const principal = this.tokens.verify(token), current = await this.repository.byId(principal.id);
    if (!current || !current.isActive || current.role !== principal.role) throw new AuthError('AUTH_TOKEN');
    return principal;
  }
  async me(principal: Principal): Promise<SafeUser> {
    const current = await this.repository.byId(principal.id);
    if (!current || !current.isActive || current.role !== principal.role) throw new AuthError('AUTH_TOKEN');
    return safeUser(current);
  }
  async requestReset(identity: unknown, delivery: ResetDelivery): Promise<{message: string}> {
    let email: string; try { email = canonicalEmail(identity); } catch { return resetResponse(); }
    const user = await this.repository.find({email});
    if (user?.isActive && user.email) {
      const reset = resetCredential(this.config.resetSeconds);
      await this.repository.saveReset(user.id, reset.digest, reset.expiresAt);
      // Delivery failures are deliberately not reflected to callers or logged with secrets.
      await delivery.send(user.email, {secret: reset.secret, expiresAt: reset.expiresAt}).catch(() => undefined);
    }
    return resetResponse();
  }
  async resetPassword(secret: unknown, newPassword: unknown): Promise<{message: string}> {
    const digest = resetDigest(secret), hash = await this.passwords.hash(newPassword);
    if (!await this.repository.consumeReset(digest, hash, new Date())) throw new AuthError('AUTH_RESET');
    return {message: 'Password has been reset.'};
  }
}
