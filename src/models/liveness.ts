/**
 * Liveness reporting types for service checks
 */

import type { ServiceType } from './enums.js';

export type LivenessStatus = 'not_live' | 'partially' | 'live';

export interface ServicePingResult {
  type: ServiceType | string;
  endpoint: string;
  ok: boolean;
  status?: number;
  latencyMs?: number;
  skipped?: boolean;
  reason?: 'non_http' | 'unsupported_type' | 'timeout' | 'network' | 'invalid';
}

/** @deprecated Use ServicePingResult instead */
export type EndpointPingResult = ServicePingResult;

export interface LivenessReport {
  status: LivenessStatus;
  okCount: number;
  totalPinged: number;
  skippedCount: number;
  results: ServicePingResult[];
  liveServices: ServicePingResult[];
  deadServices: ServicePingResult[];
  skippedServices: ServicePingResult[];
}

export interface LivenessOptions {
  timeoutMs?: number;
  concurrency?: number;
  includeTypes?: Array<ServiceType | string>;
  treatAuthAsAlive?: boolean;
}
