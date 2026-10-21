import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Policy, PolicyRequest } from './policy.model';
import { PolicyService } from './policy.service';

@Component({
  selector: 'app-policy-form',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <section class="editor" aria-label="Formulario de póliza">
      <h2>{{ policyId === null ? 'Nueva póliza' : 'Editar póliza' }}</h2>
      @if (loading()) {
        <p aria-live="polite">Cargando póliza...</p>
      } @else if (loadError()) {
        <p role="alert">{{ loadError() }}</p>
        <a class="button-link secondary" routerLink="/policies">Volver a la lista</a>
      } @else {
        @if (error()) {
          <p role="alert">{{ error() }}</p>
        }
        <form (ngSubmit)="savePolicy()">
          <label>
            Número de póliza
            <input
              name="policyNumber"
              [(ngModel)]="form.policyNumber"
              required
              maxlength="50"
            />
          </label>
          <label>
            Nombre del cliente
            <input
              name="customerName"
              [(ngModel)]="form.customerName"
              required
              maxlength="100"
            />
          </label>
          <label>
            Estado
            <select name="status" [(ngModel)]="form.status" required>
              <option value="ACTIVE">Activa</option>
              <option value="INACTIVE">Inactiva</option>
            </select>
          </label>
          <div class="actions">
            <button type="submit" [disabled]="saving()">
              {{ saving() ? 'Guardando...' : 'Guardar' }}
            </button>
            <a class="button-link secondary" routerLink="/policies">Cancelar</a>
          </div>
        </form>
      }
    </section>
  `
})
export class PolicyFormComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly policyService = inject(PolicyService);

  readonly loading = signal(false);
  readonly loadError = signal('');
  readonly error = signal('');
  readonly saving = signal(false);
  policyId: number | null = null;
  form: PolicyRequest = this.emptyForm();

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam === null) {
      return;
    }

    const id = Number(idParam);
    if (!Number.isSafeInteger(id) || id < 1) {
      this.loadError.set('El identificador de la póliza no es válido.');
      return;
    }

    this.policyId = id;
    this.loading.set(true);
    this.policyService.getPolicy(id).subscribe({
      next: (policy) => {
        this.form = this.toRequest(policy);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set('No se pudo cargar la póliza. Puede que ya no exista.');
        this.loading.set(false);
      }
    });
  }

  savePolicy(): void {
    if (this.saving()) {
      return;
    }

    const request: PolicyRequest = {
      policyNumber: this.form.policyNumber.trim(),
      customerName: this.form.customerName.trim(),
      status: this.form.status
    };
    if (!request.policyNumber || !request.customerName) {
      this.error.set('Completa el número de póliza y el nombre del cliente.');
      return;
    }

    this.error.set('');
    this.saving.set(true);
    const operation = this.policyId === null
      ? this.policyService.createPolicy(request)
      : this.policyService.updatePolicy(this.policyId, request);

    operation.subscribe({
      next: (saved: Policy) => {
        this.router.navigate(['/policies', saved.id]);
      },
      error: () => {
        this.error.set('No se pudo guardar la póliza. Inténtalo de nuevo.');
        this.saving.set(false);
      }
    });
  }

  private toRequest(policy: Policy): PolicyRequest {
    return {
      policyNumber: policy.policyNumber,
      customerName: policy.customerName,
      status: policy.status
    };
  }

  private emptyForm(): PolicyRequest {
    return { policyNumber: '', customerName: '', status: 'ACTIVE' };
  }
}
