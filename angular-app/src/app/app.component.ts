import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterLink, RouterOutlet],
  template: `
    <main>
      <section class="card">
        <header class="page-header">
          <div>
            <a class="brand" routerLink="/policies"><h1>Gestión de pólizas</h1></a>
            <p class="muted">Angular + Quarkus</p>
          </div>
          <div class="actions">
            @if (auth.session(); as session) {
              <span class="muted">{{ session.username }} ({{ session.role }})</span>
              @if (auth.isAdmin()) {
                <a class="button-link" routerLink="/policies/new">Nueva póliza</a>
              }
              <button type="button" class="secondary" (click)="logout()">Cerrar sesión</button>
            } @else {
              @if (!isLoginPage()) {
                <a class="button-link" routerLink="/login">Iniciar sesión</a>
              }
            }
          </div>
        </header>
        <router-outlet />
      </section>
    </main>
  `
})
export class AppComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  isLoginPage(): boolean {
    return this.router.isActive('/login', {
      paths: 'exact',
      queryParams: 'ignored',
      fragment: 'ignored',
      matrixParams: 'ignored'
    });
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
