/**
 * Validation utilities - Security-hardened v0.3.0
 */
const PRIVATE_IP_PATTERNS = [
    /^127\./,
    /^10\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^169\.254\./,
    /^0\./,
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
    /^localhost$/i,
    /^\[::1\]$/,
    /^\[fe80:/i,
    /^\[fc/i,
    /^\[fd/i,
];
const IPFS_CID_PATTERN = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{58,}|[a-zA-Z0-9]{46,59})$/;
function isPrivateHost(hostname) {
    return PRIVATE_IP_PATTERNS.some(pattern => pattern.test(hostname));
}
export function isValidAgentId(agentId) {
    if (!agentId || typeof agentId !== 'string') {
        return false;
    }
    const strictPattern = /^[1-9]\d*:\d+$/;
    if (!strictPattern.test(agentId)) {
        return false;
    }
    const parts = agentId.split(':');
    const chainId = Number(parts[0]);
    const tokenId = Number(parts[1]);
    return chainId > 0 && tokenId >= 0 &&
        chainId <= Number.MAX_SAFE_INTEGER &&
        tokenId <= Number.MAX_SAFE_INTEGER;
}
export function isValidURI(uri, options = {}) {
    if (!uri || typeof uri !== 'string') {
        return false;
    }
    if (uri.startsWith('ipfs://')) {
        const cid = uri.slice(7).split('/')[0];
        return IPFS_CID_PATTERN.test(cid);
    }
    if (uri.startsWith('/ipfs/')) {
        const cid = uri.slice(6).split('/')[0];
        return IPFS_CID_PATTERN.test(cid);
    }
    try {
        const url = new URL(uri);
        // HTTPS only by default (http allowed via opt-in)
        if (url.protocol === 'http:' && !options.allowHttp) {
            return false;
        }
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            return false;
        }
        if (url.username || url.password) {
            return false;
        }
        if (isPrivateHost(url.hostname)) {
            return false;
        }
        return true;
    }
    catch {
        return false;
    }
}
export function validateURI(uri, fieldName = 'uri', options = {}) {
    if (!uri || typeof uri !== 'string') {
        throw new Error(`${fieldName} must be a non-empty string`);
    }
    if (uri.startsWith('ipfs://') || uri.startsWith('/ipfs/')) {
        const cid = uri.replace(/^(ipfs:\/\/|\/ipfs\/)/, '').split('/')[0];
        if (!IPFS_CID_PATTERN.test(cid)) {
            throw new Error(`${fieldName} contains invalid IPFS CID: ${cid.slice(0, 20)}...`);
        }
        return;
    }
    try {
        const url = new URL(uri);
        if (url.protocol === 'http:' && !options.allowHttp) {
            throw new Error(`${fieldName} must use https (http not allowed by default)`);
        }
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            throw new Error(`${fieldName} must use https or ipfs protocol`);
        }
        if (url.username || url.password) {
            throw new Error(`${fieldName} must not contain credentials`);
        }
        if (isPrivateHost(url.hostname)) {
            throw new Error(`${fieldName} must not reference private/internal addresses`);
        }
    }
    catch (e) {
        if (e instanceof Error && e.message.startsWith(fieldName)) {
            throw e;
        }
        throw new Error(`${fieldName} is not a valid URL`);
    }
}
export function isValidScore(score) {
    return Number.isInteger(score) && score >= 0 && score <= 100;
}
// Validates UTF-8 byte length (multi-byte Unicode chars count as multiple bytes)
export function validateByteLength(str, maxBytes, fieldName) {
    const byteLength = Buffer.byteLength(str, 'utf8');
    if (byteLength > maxBytes) {
        throw new Error(`${fieldName} must be <= ${maxBytes} bytes (got ${byteLength} bytes)`);
    }
}
// Validates nonce is within u32 range (0 to 4294967295)
export function validateNonce(nonce) {
    if (!Number.isInteger(nonce) || nonce < 0 || nonce > 4294967295) {
        throw new Error(`nonce must be a u32 integer (0 to 4294967295), got ${nonce}`);
    }
}
//# sourceMappingURL=validation.js.map