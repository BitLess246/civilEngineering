# civeng-calc-api — protected calculation service

The structural-design **engine runs here, server-side**, so it is never shipped
to the browser. The SPA (hosted statically on Firebase) posts inputs to these
endpoints cross-origin and renders the returned results. This is the real
protection layer: clients can use the calculator but cannot read the code.

> The engine source lives in `../webapp/src/engine`. The build **bundles** the
> needed solver modules into a single `dist/server.js` (via esbuild), so the
> deployed artifact is self-contained and does not need the webapp source.

## Endpoints

| Method | Path                | Body                                                  | Returns                       |
| ------ | ------------------- | ----------------------------------------------------- | ----------------------------- |
| GET    | `/health`           | —                                                     | `{ ok: true }`                |
| POST   | `/api/steel/beam`   | `{ shapeName, Fy, span, Lb, Cb, wDead, wLive }`       | `{ props, flex, shear, loads }` |
| POST   | `/api/steel/column` | `{ shapeName, Fy, L, Kx, Ky }`                        | `{ props, axial, weak }`      |

More solvers (RC pipeline, frame3d, baseplate, take-off, truss) are added in
later phases — see `HANDOFF.md`.

## Local dev

```bash
cd api
npm install
npm run dev        # tsx watch, http://localhost:8080
npm test           # vitest + supertest
npm run typecheck  # tsc --noEmit
npm run build      # esbuild bundle → dist/server.js
npm start          # node dist/server.js
```

## Environment

| Var              | Purpose                                                              |
| ---------------- | ------------------------------------------------------------------- |
| `PORT`           | Port to bind (injected by Render/Railway/Fly; defaults to 8080).    |
| `ALLOWED_ORIGIN` | Comma-separated origins for CORS lock-down. Unset ⇒ reflect any.    |

## Deploy to a separate Node host (Render / Railway / Fly.io)

The service is a standard Node app. On any of these platforms:

- **Build command:** `npm install && npm run build`
- **Start command:** `npm start`
- **Set** `ALLOWED_ORIGIN` to your SPA origin (e.g. `https://<project>.web.app`).

Then point the SPA at it by setting `VITE_API_URL=https://<your-api-host>` in the
webapp build environment before `npm --prefix webapp run build`.
