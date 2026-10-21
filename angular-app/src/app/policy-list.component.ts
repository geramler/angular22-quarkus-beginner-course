import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Policy, PolicyFilter } from './policy.model';
import { PolicyService } from './policy.service';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-policy-list',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section aria-label="Pólizas registradas">
      <h2>Pólizas</h2>
      @if (loading()) {
        <p aria-live="polite">Cargando pólizas...</p>
      } @else if (error()) {
        <p role="alert">{{ error() }}</p>
        <button type="button" (click)="loadPolicies()">Reintentar</button>
      } @else if (policies().length) {
        <div class="filters">
          <label>
            Buscar
            <input
              type="search"
              placeholder="Número o cliente"
              [value]="filter().text"
              (input)="setText($any($event.target).value)"
            />
          </label>
          <label>
            Estado
            <select [value]="filter().status" (change)="setStatus($any($event.target).value)">
              <option value="ALL">Todas</option>
              <option value="ACTIVE">Activas</option>
              <option value="INACTIVE">Inactivas</option>
            </select>
          </label>
        </div>
        @if (!filteredPolicies().length) {
          <p class="muted">Ninguna póliza coincide con el filtro.</p>
        }
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Número</th>
                <th>Cliente</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              @for (policy of filteredPolicies(); track policy.id) {
                <tr>
                  <td>{{ policy.policyNumber }}</td>
                  <td>{{ policy.customerName }}</td>
                  <td>
                    <span class="status" [class.inactive]="policy.status === 'INACTIVE'">
                      {{ policy.status === 'ACTIVE' ? 'Activa' : 'Inactiva' }}
                    </span>
                  </td>
                  <td class="actions">
                    <a class="button-link secondary" [routerLink]="['/policies', policy.id]">Ver</a>
                    @if (auth.isAdmin()) {
                      <a class="button-link secondary" [routerLink]="['/policies', policy.id, 'edit']">
                        Editar
                      </a>
                      <button
                        type="button"
                        class="danger"
                        [disabled]="deletingId() === policy.id"
                        (click)="deletePolicy(policy)"
                      >
                        {{ deletingId() === policy.id ? 'Eliminando...' : 'Eliminar' }}
                      </button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <p class="muted">No hay pólizas registradas.</p>
      }
      @if (actionError()) {
        <p role="alert">{{ actionError() }}</p>
      }
    </section>
  `
})
export class PolicyListComponent implements OnInit {
  private readonly policyService = inject(PolicyService);
  readonly auth = inject(AuthService);

  readonly policies = signal<Policy[]>([]);
  readonly filter = signal<PolicyFilter>({ text: '', status: 'ALL' });
  readonly filteredPolicies = computed(() =>
    this.policyService.filterPolicies(this.policies(), this.filter())
  );
  readonly loading = signal(true);
  readonly error = signal('');
  readonly actionError = signal('');
  readonly deletingId = signal<number | null>(null);

  ngOnInit(): void {
    this.loadPolicies();
  }

  setText(text: string): void {
    this.filter.update((filter) => ({ ...filter, text }));
  }

  setStatus(status: PolicyFilter['status']): void {
    this.filter.update((filter) => ({ ...filter, status }));
  }

  loadPolicies(): void {
    this.loading.set(true);
    this.error.set('');

    this.policyService.getPolicies().subscribe({
      next: (policies) => {
        this.policies.set(policies);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudo conectar con la API. Verifica que Quarkus esté ejecutándose en el puerto 8080.');
        this.loading.set(false);
      }
    });
  }

  deletePolicy(policy: Policy): void {
    if (this.deletingId() !== null) {
      return;
    }

    this.deletingId.set(policy.id);
    this.actionError.set('');
    this.policyService.deletePolicy(policy.id).subscribe({
      next: () => {
        this.policies.update((policies) => policies.filter((item) => item.id !== policy.id));
        this.deletingId.set(null);
      },
      error: () => {
        this.actionError.set('No se pudo eliminar la póliza. Inténtalo de nuevo.');
        this.deletingId.set(null);
      }
    });
  }
}
