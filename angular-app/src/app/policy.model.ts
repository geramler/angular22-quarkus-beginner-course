export interface Policy {
  id: number;
  policyNumber: string;
  customerName: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export type PolicyRequest = Omit<Policy, 'id'>;

export interface PolicyFilter {
  text: string;
  status: Policy['status'] | 'ALL';
}
