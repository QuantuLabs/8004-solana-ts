/**
 * Liveness reporting types for endpoint checks
 */
import type { EndpointType } from './enums.js';
export type LivenessStatus = 'not_live' | 'partially' | 'live';
export interface EndpointPingResult {
    type: EndpointType | string;
    endpoint: string;
    ok: boolean;
    status?: number;
    latencyMs?: number;
    skipped?: boolean;
    reason?: 'non_http' | 'unsupported_type' | 'timeout' | 'network' | 'invalid';
}
export interface LivenessReport {
    status: LivenessStatus;
    okCount: number;
    totalPinged: number;
    skippedCount: number;
    results: EndpointPingResult[];
    liveEndpoints: EndpointPingResult[];
    deadEndpoints: EndpointPingResult[];
    skippedEndpoints: EndpointPingResult[];
}
export interface LivenessOptions {
    timeoutMs?: number;
    concurrency?: number;
    includeTypes?: Array<EndpointType | string>;
    treatAuthAsAlive?: boolean;
}
//# sourceMappingURL=liveness.d.ts.map