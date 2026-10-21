import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Policy, PolicyRequest } from './policy.model';
import { PolicyService } from './policy.service';

describe('PolicyService', () => {
  let service: PolicyService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PolicyService, provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(PolicyService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('filters policies by text (ignoring case and accents) and status', () => {
    const policies: Policy[] = [
      { id: 1, policyNumber: 'POL-1001', customerName: 'María Torres', status: 'ACTIVE' },
      { id: 2, policyNumber: 'POL-1002', customerName: 'Carlos Ruiz', status: 'INACTIVE' }
    ];

    expect(service.filterPolicies(policies, { text: '', status: 'ALL' })).toEqual(policies);
    expect(service.filterPolicies(policies, { text: 'maria', status: 'ALL' })).toEqual([policies[0]]);
    expect(service.filterPolicies(policies, { text: 'pol-1002', status: 'ALL' })).toEqual([policies[1]]);
    expect(service.filterPolicies(policies, { text: '', status: 'INACTIVE' })).toEqual([policies[1]]);
    expect(service.filterPolicies(policies, { text: 'maria', status: 'INACTIVE' })).toEqual([]);
  });

  it('requests the policy list', () => {
    service.getPolicies().subscribe();

    const request = httpTesting.expectOne('http://localhost:8080/api/policies');
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });

  it('requests one policy by id', () => {
    service.getPolicy(5).subscribe();

    const request = httpTesting.expectOne('http://localhost:8080/api/policies/5');
    expect(request.request.method).toBe('GET');
    request.flush({ id: 5, policyNumber: 'POL-005', customerName: 'Nora Díaz', status: 'ACTIVE' });
  });

  it('creates a policy', () => {
    const policy: PolicyRequest = {
      policyNumber: 'POL-006',
      customerName: 'Nora Díaz',
      status: 'ACTIVE'
    };
    service.createPolicy(policy).subscribe();

    const request = httpTesting.expectOne('http://localhost:8080/api/policies');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(policy);
    request.flush({ id: 6, ...policy });
  });

  it('updates a policy', () => {
    const policy: PolicyRequest = {
      policyNumber: 'POL-005',
      customerName: 'Nora Díaz',
      status: 'INACTIVE'
    };
    service.updatePolicy(5, policy).subscribe();

    const request = httpTesting.expectOne('http://localhost:8080/api/policies/5');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(policy);
    request.flush({ id: 5, ...policy });
  });

  it('deletes a policy', () => {
    service.deletePolicy(5).subscribe();

    const request = httpTesting.expectOne('http://localhost:8080/api/policies/5');
    expect(request.request.method).toBe('DELETE');
    request.flush(null);
  });
});
