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
    /^localhost\.?$/i,
    /^\[?::1\]?$/,
    /^\[?fe80:/i,
    /^\[?fc/i,
    /^\[?fd/i,
    /^\[?::ffff:(127\.|10\.|192\.168\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/i,
];
const BLOCKED_HOSTS = [
    'metadata.google.internal',
    'metadata.google.internal.',
    'instance-data.ec2.internal',
    'metadata.azure.com',
];
/**
 * Extract dotted-decimal IPv4 from an IPv6-mapped address.
 * Handles both mixed notation (::ffff:1.2.3.4) and hex notation (::ffff:7f00:1).
 * Returns null if not an IPv6-mapped IPv4 address.
 */
function extractIPv6MappedIPv4(hostname) {
    const h = hostname.replace(/^\[|\]$/g, '');
    const match = h.match(/^::ffff:(.+)$/i);
    if (!match)
        return null;
    const mapped = match[1];
    // Mixed notation: ::ffff:127.0.0.1
    if (mapped.includes('.'))
        return mapped;
    // Hex notation: ::ffff:7f00:0001
    const hexParts = mapped.split(':');
    if (hexParts.length === 2) {
        const hi = parseInt(hexParts[0], 16);
        const lo = parseInt(hexParts[1], 16);
        if (!isNaN(hi) && !isNaN(lo) && hi <= 0xFFFF && lo <= 0xFFFF) {
            return [
                (hi >> 8) & 0xFF,
                hi & 0xFF,
                (lo >> 8) & 0xFF,
                lo & 0xFF,
            ].join('.');
        }
    }
    return null;
}
/**
 * Parse a numeric or non-standard IP notation to dotted-decimal IPv4.
 * Handles decimal (2130706433), hex (0x7f000001), and octal (0177.0.0.1) forms.
 * Returns null if the input is not a valid IP in any notation.
 */
function normalizeIpAddress(hostname) {
    // Pure decimal integer (e.g., 2130706433 = 127.0.0.1)
    if (/^\d+$/.test(hostname)) {
        const num = Number(hostname);
        if (num >= 0 && num <= 0xFFFFFFFF) {
            return [
                (num >>> 24) & 0xFF,
                (num >>> 16) & 0xFF,
                (num >>> 8) & 0xFF,
                num & 0xFF,
            ].join('.');
        }
    }
    // Hex notation (e.g., 0x7f000001)
    if (/^0x[0-9a-fA-F]+$/.test(hostname)) {
        const num = parseInt(hostname, 16);
        if (num >= 0 && num <= 0xFFFFFFFF) {
            return [
                (num >>> 24) & 0xFF,
                (num >>> 16) & 0xFF,
                (num >>> 8) & 0xFF,
                num & 0xFF,
            ].join('.');
        }
    }
    // Dotted notation with octal/hex octets (e.g., 0177.0.0.1)
    const parts = hostname.split('.');
    if (parts.length === 4) {
        const octets = [];
        for (const part of parts) {
            let val;
            if (/^0x[0-9a-fA-F]+$/i.test(part)) {
                val = parseInt(part, 16);
            }
            else if (/^0\d+$/.test(part)) {
                val = parseInt(part, 8);
            }
            else if (/^\d+$/.test(part)) {
                val = parseInt(part, 10);
            }
            else {
                return null;
            }
            if (isNaN(val) || val < 0 || val > 255)
                return null;
            octets.push(val);
        }
        return octets.join('.');
    }
    return null;
}
const IPFS_CID_PATTERN = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{58,}|[a-zA-Z0-9]{46,59})$/;
/**
 * Check if a hostname is a private/internal IP address
 * Used for SSRF protection
 */
export function isPrivateHost(hostname) {
    const h = hostname.toLowerCase();
    if (BLOCKED_HOSTS.includes(h))
        return true;
    if (PRIVATE_IP_PATTERNS.some(pattern => pattern.test(h)))
        return true;
    // Normalize non-standard IP notations (decimal, hex, octal) to dotted-decimal
    const normalized = normalizeIpAddress(h);
    if (normalized && normalized !== h) {
        return PRIVATE_IP_PATTERNS.some(pattern => pattern.test(normalized));
    }
    // Handle IPv6-mapped IPv4 in hex notation (::ffff:7f00:0001)
    const mappedIpv4 = extractIPv6MappedIPv4(h);
    if (mappedIpv4) {
        return PRIVATE_IP_PATTERNS.some(pattern => pattern.test(mappedIpv4));
    }
    return false;
}
/**
 * Check if a URI targets a private/internal host (full URL validation)
 * Used for SSRF protection on fetch calls
 */
export function isBlockedUri(uri) {
    try {
        const url = new URL(uri);
        return isPrivateHost(url.hostname);
    }
    catch {
        return true;
    }
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