# GEN-02 — Layered API Rate Limits and Abuse Controls

**Priority:** High  
**Area:** Public and authenticated API routes

## Observation

The earlier audit flagged incomplete API rate limiting. A single client-side throttle or one narrow rate-limit check is not sufficient protection for publicly reachable calculation or resource-consuming routes.

## Risks

- Automated traffic can consume compute or third-party resources.
- Authenticated users may distribute requests across IP addresses.
- Multiple users behind one IP may be unfairly restricted if IP-only limits are used.
- Expensive endpoints may be abused even if lightweight endpoints are protected.

## Recommended actions

1. Apply limits at the edge or reverse proxy and at the application/API layer.
2. Use appropriate keys such as IP address for anonymous traffic and account/user ID for authenticated traffic; consider endpoint-specific cost.
3. Set tighter controls for expensive calculations, file processing, and routes that trigger paid third-party services.
4. Return a consistent `429 Too Many Requests` response and appropriate retry guidance.
5. Add request-size limits, timeouts, concurrency controls, and input validation where relevant.
6. Log and monitor rate-limit decisions without logging secrets or unnecessary personal data.
7. Test bursts, sustained traffic, multiple users sharing an IP, and authenticated requests from changing IPs.

## Acceptance criteria

- Expensive endpoints have documented limits and resource controls.
- Limits are enforced server-side and cannot be bypassed by client changes.
- Legitimate users receive predictable behavior and useful retry responses.
- Monitoring can distinguish ordinary throttling from sustained abuse.
