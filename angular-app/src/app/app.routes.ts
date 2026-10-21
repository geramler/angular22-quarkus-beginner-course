import { Routes } from '@angular/router';
import { adminGuard, authenticatedGuard } from './auth.guard';
import { LoginComponent } from './login.component';
import { PolicyDetailComponent } from './policy-detail.component';
import { PolicyFormComponent } from './policy-form.component';
import { PolicyListComponent } from './policy-list.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'policies' },
  { path: 'login', component: LoginComponent },
  { path: 'policies', component: PolicyListComponent, canActivate: [authenticatedGuard] },
  {
    path: 'policies/new',
    component: PolicyFormComponent,
    canActivate: [authenticatedGuard, adminGuard]
  },
  {
    path: 'policies/:id/edit',
    component: PolicyFormComponent,
    canActivate: [authenticatedGuard, adminGuard]
  },
  { path: 'policies/:id', component: PolicyDetailComponent, canActivate: [authenticatedGuard] },
  { path: '**', redirectTo: 'policies' }
];
