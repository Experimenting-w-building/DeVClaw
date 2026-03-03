export interface DelegationRequest {
  id: string;
  fromAgent: string;
  toAgent: string;
  task: string;
  waitForResult: boolean;
  timestamp: string;
}

export interface DelegationResult {
  requestId: string;
  fromAgent: string;
  toAgent: string;
  result: string;
  success: boolean;
  durationMs: number;
}
