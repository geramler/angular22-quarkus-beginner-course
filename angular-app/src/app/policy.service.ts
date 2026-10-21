import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api-url';
import { Policy, PolicyFilter, PolicyRequest } from './policy.model';

@Injectable({ providedIn: 'root' })
export class PolicyService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${API_BASE_URL}/policies`;

  getPolicies(): Observable<Policy[]> {
    return this.http.get<Policy[]>(this.apiUrl);
  }

  filterPolicies(policies: Policy[], filter: PolicyFilter): Policy[] {
    const normalize = (value: string) =>
      value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    const text = normalize(filter.text.trim());

    return policies.filter((policy) => {
      const matchesStatus = filter.status === 'ALL' || policy.status === filter.status;
      const matchesText = !text
        || normalize(policy.policyNumber).includes(text)
        || normalize(policy.customerName).includes(text);
      return matchesStatus && matchesText;
    });
  }

  getPolicy(id: number): Observable<Policy> {
    return this.http.get<Policy>(`${this.apiUrl}/${id}`);
  }

  createPolicy(policy: PolicyRequest): Observable<Policy> {
    return this.http.post<Policy>(this.apiUrl, policy);
  }

  updatePolicy(id: number, policy: PolicyRequest): Observable<Policy> {
    return this.http.put<Policy>(`${this.apiUrl}/${id}`, policy);
  }

  deletePolicy(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
