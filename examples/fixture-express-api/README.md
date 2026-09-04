# fixture-express-api

A toy Express checkout API used as the end-to-end fixture for collectors and snapshot tests. It
is not part of the pnpm workspace and is never installed or executed: only its source and test
files matter. The tests intentionally cover the shapes a real vitest suite has: nested
`describe`, `it`/`test`, `.each`, `.skip`, `.only`, `.todo`, template-literal titles and a
file with a syntax error.
