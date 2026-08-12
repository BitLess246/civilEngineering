// Vercel's Edge runtime exposes `process.env`, but the API project deliberately
// does NOT pull in @types/node: these functions must not reach for Node
// builtins, and having the types available invites exactly that. One ambient
// declaration is the whole of the Node surface they are allowed.
declare const process: { env: Record<string, string | undefined> }
