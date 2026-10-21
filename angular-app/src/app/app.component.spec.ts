import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { authInterceptor } from './auth.interceptor';
import { AuthService, UserRole } from './auth.service';
import { AppComponent } from './app.component';
import { routes } from './app.routes';

describe('AppComponent routing', () => {
  let httpTesting: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter(routes)
      ]
    });
    httpTesting = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    TestBed.inject(AuthService).logout();
    httpTesting.verify();
  });

  it('redirects unauthenticated users to login', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    await router.navigateByUrl('/policies');
    fixture.detectChanges();

    expect(router.url).toBe('/login?returnUrl=%2Fpolicies');
    expect(fixture.nativeElement.textContent).toContain('Iniciar sesión');
    httpTesting.expectNone('http://localhost:8080/api/policies');
  });

  it('attaches the JWT and renders the policy list after admin login', async () => {
    await signIn('ADMIN');
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    await router.navigateByUrl('/policies');
    fixture.detectChanges();
    const request = httpTesting.expectOne('http://localhost:8080/api/policies');
    const authorization = request.request.headers.get('Authorization');
    expect(authorization).not.toBeNull();
    expect(authorization?.endsWith(TestBed.inject(AuthService).token() ?? '')).toBe(true);
    request.flush([
      { id: 1, policyNumber: 'POL-001', customerName: 'Ana García', status: 'ACTIVE' }
    ]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('POL-001');
    expect(fixture.nativeElement.textContent).toContain('Ana García');
    expect(fixture.nativeElement.querySelector('a[href="/policies/new"]')).not.toBeNull();
  });

  it('redirects a read-only user away from admin routes', async () => {
    await signIn('USER');
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    await router.navigateByUrl('/policies/new');
    fixture.detectChanges();
    expect(router.url).toBe('/policies');
    httpTesting.expectOne('http://localhost:8080/api/policies').flush([]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('a[href="/policies/new"]')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Editar');
  });

  it('redirects the root URL to the policy list after login', async () => {
    await signIn('ADMIN');
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    await router.navigateByUrl('/');
    fixture.detectChanges();
    httpTesting.expectOne('http://localhost:8080/api/policies').flush([]);
    fixture.detectChanges();

    expect(router.url).toBe('/policies');
    expect(fixture.nativeElement.textContent).toContain('No hay pólizas registradas.');
  });

  async function signIn(role: UserRole): Promise<void> {
    let completed = false;
    TestBed.inject(AuthService).login(role === 'ADMIN' ? 'admin' : 'user', 'password')
      .subscribe(() => completed = true);
    const request = httpTesting.expectOne('http://localhost:8080/api/auth/login');
    const payload = btoa(JSON.stringify({
      exp: Math.floor(Date.now() / 1000) + 3600,
      upn: role === 'ADMIN' ? 'admin' : 'user',
      groups: [role]
    }));
    request.flush({
      token: `header.${payload}.signature`,
      tokenType: 'Bearer',
      expiresInSeconds: 3600
    });
    expect(completed).toBe(true);
  }
});
