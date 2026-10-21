import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from './auth.service';
import { Policy } from './policy.model';
import { PolicyService } from './policy.service';

@Component({
  selector: 'app-policy-detail',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './policy-detail.component.html'
})
export class PolicyDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly policyService = inject(PolicyService);
  readonly auth = inject(AuthService);

  readonly policy = signal<Policy | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isSafeInteger(id) || id < 1) {
      this.error.set('El identificador de la póliza no es válido.');
      this.loading.set(false);
      return;
    }

    this.policyService.getPolicy(id).subscribe({
      next: (policy) => {
        this.policy.set(policy);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudo cargar la póliza. Puede que ya no exista.');
        this.loading.set(false);
      }
    });
  }
}
