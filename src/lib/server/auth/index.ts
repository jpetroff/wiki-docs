import { notImplemented, type ServiceResult } from '../../shared/result';

export interface User {
  id: string;
  login: string;
  role: 'admin' | 'editor';
}

export interface Session {
  user: User;
  expiresAt: string;
}

export interface AuthService {
  lookupSession(token: string | undefined): Promise<ServiceResult<Session | null>>;
  authorize(permission: 'edit' | 'publish' | 'manage-users', session: Session | null): Promise<ServiceResult<User>>;
  login(login: string, password: string): Promise<ServiceResult<Session>>;
  logout(token: string | undefined): Promise<ServiceResult<void>>;
}

export interface AccountService {
  list(): Promise<ServiceResult<User[]>>;
  create(login: string, password: string, role: User['role']): Promise<ServiceResult<User>>;
  setEnabled(userId: string, enabled: boolean): Promise<ServiceResult<void>>;
  changePassword(userId: string, password: string): Promise<ServiceResult<void>>;
}

// Not-implemented is deliberately distinct from an anonymous session or a grant.
export const authService: AuthService = {
  async lookupSession() { return notImplemented('Session lookup'); },
  async authorize() { return notImplemented('Authorization'); },
  async login() { return notImplemented('Login'); },
  async logout() { return notImplemented('Logout'); }
};

export const accountService: AccountService = {
  async list() { return notImplemented('Account listing'); },
  async create() { return notImplemented('Account creation'); },
  async setEnabled() { return notImplemented('Account activation'); },
  async changePassword() { return notImplemented('Password changes'); }
};
