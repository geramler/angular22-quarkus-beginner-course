import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { API_BASE_URL } from './api-url';

export type UserRole = 'ADMIN' | 'USER';

export interface AuthSession {
  token: string;
  username: string;
  role: UserRole;
  expiresAt: number;
}

interface LoginResponse {
  token: string;
  tokenType: string;
  expiresInSeconds: number;
}

const SESSION_KEY = 'policies-auth-token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  readonly session = signal<AuthSession | null>(this.readSession());
  private expirationTimer: ReturnType<typeof setTimeout> | undefined;

  readonly isAdmin = computed(() => this.session()?.role === 'ADMIN');

  constructor() {
    this.scheduleExpiration(this.session());
  }

  login(username: string, password: string): Observable<void> {
    return this.http.post<LoginResponse>(`${API_BASE_URL}/auth/login`, { username, password }).pipe(
      tap((response) => {
        const session = this.createSession(response);
        sessionStorage.setItem(SESSION_KEY, session.token);
        this.session.set(session);
        this.scheduleExpiration(session);
      }),
      map(() => undefined)
    );
  }

  token(): string | null {
    return this.getValidSession()?.token ?? null;
  }

  isAuthenticated(): boolean {
    return this.getValidSession() !== null;
  }

  logout(): void {
    if (this.expirationTimer !== undefined) {
      clearTimeout(this.expirationTimer);
      this.expirationTimer = undefined;
    }
    sessionStorage.removeItem(SESSION_KEY);
    this.session.set(null);
  }

  private getValidSession(): AuthSession | null {
    const session = this.session();
    if (session && session.expiresAt <= Date.now()) {
      this.logout();
      return null;
    }
    return session;
  }

  private scheduleExpiration(session: AuthSession | null): void {
    if (this.expirationTimer !== undefined) {
      clearTimeout(this.expirationTimer);
      this.expirationTimer = undefined;
    }
    if (!session) {
      return;
    }

    const delay = session.expiresAt - Date.now();
    if (delay <= 0) {
      this.logout();
      return;
    }
    this.expirationTimer = setTimeout(() => this.logout(), delay);
  }

  private readSession(): AuthSession | null {
    const token = sessionStorage.getItem(SESSION_KEY);
    if (!token) {
      return null;
    }

    try {
      return this.sessionFromToken(token);
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
  }

  private createSession(response: LoginResponse): AuthSession {
    if (!response.token || response.tokenType.toLowerCase() !== 'bearer') {
      throw new Error('The authentication service returned an invalid token response.');
    }
    const session = this.sessionFromToken(response.token);
    if (session.expiresAt <= Date.now()) {
      throw new Error('The authentication service returned an expired token.');
    }
    return session;
  }

  private sessionFromToken(token: string): AuthSession {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT.');
    }

    const base64Payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const paddedPayload = base64Payload.padEnd(Math.ceil(base64Payload.length / 4) * 4, '=');
    const payload = JSON.parse(atob(paddedPayload)) as {
      exp?: unknown;
      upn?: unknown;
      groups?: unknown;
    };
    const groups = Array.isArray(payload.groups) ? payload.groups : [payload.groups];
    const role = groups.find((group): group is UserRole => group === 'ADMIN' || group === 'USER');
    if (typeof payload.upn !== 'string' || typeof payload.exp !== 'number' || !role) {
      throw new Error('JWT is missing the required authentication claims.');
    }

    return {
      token,
      username: payload.upn,
      role,
      expiresAt: payload.exp * 1000
    };
  }
}
