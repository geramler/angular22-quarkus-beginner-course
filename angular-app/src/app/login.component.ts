import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="editor" aria-label="Iniciar sesión">
      <h2>Iniciar sesión</h2>
      @if (error()) {
        <p role="alert">{{ error() }}</p>
      }
      <form (ngSubmit)="submit()">
        <label>
          Usuario
          <input name="username" [(ngModel)]="username" autocomplete="username" required />
        </label>
        <label>
          Contraseña
          <input
            name="password"
            type="password"
            [(ngModel)]="password"
            autocomplete="current-password"
            required
          />
        </label>
        <button type="submit" [disabled]="submitting()">
          {{ submitting() ? 'Iniciando sesión...' : 'Iniciar sesión' }}
        </button>
      </form>
      <p class="muted">Las pólizas son de solo lectura para usuarios; los administradores pueden modificarlas.</p>
    </section>
  `
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  username = '';
  password = '';
  readonly submitting = signal(false);
  readonly error = signal('');

  submit(): void {
    if (this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.error.set('');
    this.auth.login(this.username.trim(), this.password).subscribe({
      next: () => {
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        const destination = returnUrl?.startsWith('/') && !returnUrl.startsWith('//')
          ? returnUrl
          : '/policies';
        void this.router.navigateByUrl(destination);
      },
      error: (error: { status?: number }) => {
        this.error.set(error.status === 401
          ? 'El usuario o la contraseña no son correctos.'
          : 'No se pudo iniciar sesión. Verifica que Quarkus esté ejecutándose.');
        this.submitting.set(false);
      }
    });
  }
}
