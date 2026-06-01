# Source-to-Image (S2I) Anomaly Report

**Project:** source2image  
**Date:** 2026-06-01  
**Total Issues Found:** 38  

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 1 |
| HIGH | 6 |
| MEDIUM | 10 |
| LOW | 11 |

---

## CRITICAL

### 1. Hardcoded Default Database Credentials

**File:** `nodejs-ex/lib/db/index.js:13-14`

Default credentials `luke` / `secret` are hardcoded. If environment variables are not set, the app silently connects with known credentials.

```javascript
const user = process.env.DB_USERNAME || process.env.POSTGRESQL_USER || 'luke';
const password = process.env.DB_PASSWORD || process.env.POSTGRESQL_PASSWORD || 'secret';
```

**Recommendation:** Remove defaults. Fail loudly if DB env vars are not set.

---

## HIGH

### 2. Database Credentials Exposed in Connection String

**File:** `nodejs-ex/lib/db/index.js:16`

The password is embedded directly in the PostgreSQL connection string. If the connection string is ever logged (e.g., by OpenTelemetry's `PgInstrumentation`), the password will be exposed in trace data.

```javascript
const connectionString = `postgresql://${user}:${password}@${serviceHost}:5432/${databaseName}`;
```

---

### 3. Database Error Objects Leaked to Clients

**File:** `nodejs-ex/lib/routes/fruits.js:42-43, 58-59, 73-74`

Raw error objects from the database driver are sent directly to HTTP clients. This can leak internal database details (table names, column names, connection info, stack traces).

```javascript
// POST, PUT, DELETE all have:
.catch(error => {
    response.status(400);
    response.send(error);    // Leaks internal DB error
});
```

**Recommendation:** Return generic error messages. Log actual errors server-side.

---

### 4. Health Checks Bypass Database Connectivity

**File:** `nodejs-ex/app.js:47-53`

The `/ready` and `/live` endpoints always return 200 without checking if the database is functional. Pods continue receiving traffic even when the database is down.

```javascript
app.use('/ready', (request, response) => {
  return response.sendStatus(200);  // No DB check!
});
```

**Recommendation:** `/ready` should verify database connectivity (`SELECT 1`). `/live` should verify the process is healthy.

---

### 5. Database Init Failure Silently Swallowed

**File:** `nodejs-ex/app.js:55-59`

If database initialization fails, the error is only logged. The application continues to start and serves requests that will all fail because the table doesn't exist. No retry logic or graceful shutdown exists.

```javascript
db.init().then(() => {
  logger.info('Database init\'d');
}).catch(error => {
  logger.error(error);
  // Application continues despite DB failure!
});
```

---

### 6. Race Condition in DB Query Initialization

**File:** `nodejs-ex/lib/db/index.js:46-54`

Every single database query executes an extra `SELECT * FROM products` check first. Under concurrent requests, multiple `init()` calls race. Seed data `INSERT INTO` statements execute multiple times, creating duplicates. This also doubles database round-trips per request.

```javascript
async function query (text, parameters) {
  const initHappened = await didInitHappen();  // Extra query every time
  if (!initHappened) {
    await init();
  }
  return pool.query(text, parameters);
}
```

---

### 7. Seed Data Not Idempotent

**File:** `nodejs-ex/lib/db/index.js:42-44`

`CREATE TABLE IF NOT EXISTS` is idempotent, but `INSERT INTO` has no `ON CONFLICT` or `IF NOT EXISTS` guard. Duplicate seed data will be inserted on every init.

```sql
INSERT INTO products (name, stock) values ('Apple', 10);
INSERT INTO products (name, stock) values ('Orange', 10);
INSERT INTO products (name, stock) values ('Pear', 10);
```

---

## MEDIUM

### 8. GET /fruits/:id Does Not Log Errors

**File:** `nodejs-ex/lib/routes/fruits.js:22-24`

The error handler calls `response.sendStatus(400)` without logging, unlike `GET /fruits` which does `logger.error(error)`.

```javascript
}).catch(() => {
    response.sendStatus(400);  // No logging
});
```

---

### 9. Validation Does Not Properly Reject Missing Stock

**File:** `nodejs-ex/lib/validations/index.js:17-19`

The check `stock === null || isNaN(stock) || stock < 0` accidentally catches `undefined` via `isNaN(undefined) === true`, but the intent is unclear. The code is fragile.

---

### 10. Validation Allows Whitespace-Only Names

**File:** `nodejs-ex/lib/validations/index.js:12-14`

No trimming or length validation. A body with `{ "name": "  ", "stock": 10 }` would pass validation.

---

### 11. `normalizePort` Returns `false` for Negative Ports

**File:** `nodejs-ex/bin/www:56-70`

If `normalizePort` receives a negative number, it returns `false`. `server.listen(false)` causes the server to listen on a random pipe instead of failing with a clear error.

```javascript
function normalizePort (val) {
  // ...
  if (port >= 0) {
    return port;
  }
  return false;  // BUG: server.listen(false) starts on random pipe
}
```

---

### 12. `app.use()` Instead of `app.get()` for Health Checks

**File:** `nodejs-ex/app.js:47-53`

Health check endpoints respond to ANY HTTP method (POST, PUT, DELETE, etc.) instead of only GET.

---

### 13. No Validation on `:id` Route Parameters

**File:** `nodejs-ex/lib/routes/fruits.js:12-13, 47-49, 63-64`

The `id` parameter is never validated as an integer. Non-numeric strings return 0 results instead of a 400 error.

---

### 14. No Request Body Size Limit Configured

**File:** `nodejs-ex/app.js:32-33`

`bodyParser.json()` and `bodyParser.urlencoded()` are used without explicit `limit` options.

---

### 15. No CORS Configuration

**File:** `nodejs-ex/app.js`

No CORS middleware is present. External API consumers will be blocked.

---

### 16. Credentials Secret Template Uses Literal Substitution Variables

**File:** `nodejs-ex/.nodeshift/credentials-secret.yml:8-9`

If nodeshift doesn't substitute variables, the Secret contains literal strings `${DB_USERNAME}` and `${DB_PASSWORD}`.

```yaml
stringData:
  user: "${DB_USERNAME}"
  password: "${DB_PASSWORD}"
```

---

### 17. Inconsistent Error Handling Between GET and POST/PUT/DELETE

**File:** `nodejs-ex/lib/routes/fruits.js`

GET returns `response.sendStatus(400)` (no body). POST/PUT/DELETE return `response.send(error)` (raw error object). No endpoint differentiates between client and server errors.

---

## LOW

### 18. Hardcoded Default Credentials in Documentation

**Files:** `S2I.md:200-202`, `nodejs-ex/README.md:15-19`

Documentation contains hardcoded `DB_USERNAME=luke`, `DB_PASSWORD=secret`. Users will copy these into production.

---

### 19. Unused `logger` Import in DB Module

**File:** `nodejs-ex/lib/db/index.js:3`

`logger` is imported but never used. Dead code.

---

### 20. `SELECT *` in Init Check

**File:** `nodejs-ex/lib/db/index.js:23`

`SELECT * FROM products` fetches all columns and rows just to check table existence. `SELECT 1 FROM products LIMIT 0` would be more efficient.

---

### 21. Unused Vue Data Properties

**File:** `nodejs-ex/public/index.html:96-99`

The Vue data object declares `fruit` which is never used. `method`, `url`, and `data` are used only inside `update()` but are set as reactive state unnecessarily.

---

### 22. Duplicate Test Cases

**File:** `nodejs-ex/test/fruits-test.js:190, 234`

Two tests named `'post - error - id error'` are duplicates of each other.

---

### 23. Placeholder GitHub URLs in package.json

**File:** `nodejs-ex/package.json:29, 32, 34`

Contains `YOUR_USER` as placeholder in `repository`, `bugs`, and `homepage` fields.

---

### 24. Placeholder GitHub URLs in Helm Chart

**File:** `nodejs-ex/helm/nodejs/Chart.yaml:9-11`

Same `your-username` placeholder in Helm chart metadata.

---

### 25. `postCommit` Empty in OpenShift Templates

**Files:** `nodejs-ex/openshift/templates/nodejs-postgresql.json:144`, `nodejs-ex/openshift/templates/nodejs-postgresql-persistent.json:147`

BuildConfig has `"postCommit": {}` while Helm chart has `postCommit: script: npm test`. Inconsistent behavior across deployment methods.

---

### 26. Hardcoded Container Name in Helm DeploymentConfig

**File:** `nodejs-ex/helm/nodejs/templates/deploymentconfig.yaml:31`

Container name is hardcoded as `nodejs-example` while other references use `{{ .Values.name }}`.

---

### 27. `normalizePort` Allows Named Pipes Without Validation

**File:** `nodejs-ex/bin/www:59-61`

Any arbitrary string in the `PORT` environment variable is treated as a named pipe path with no validation.

---

### 28. Variable Shadowing in `normalizePort`

**File:** `nodejs-ex/bin/www:57`

Inner `port` variable shadows the outer module-level `port` variable, causing confusion.

---

### 29. Inconsistent Liveness Probe Timing

- Nodeshift: `initialDelaySeconds: 60`
- Helm: `initialDelaySeconds: 30`
- Templates: `initialDelaySeconds: 30`

---

### 30. Missing Resource Limits in Nodeshift Deployment

**File:** `nodejs-ex/.nodeshift/deployment.yml`

No `resources.limits` or `resources.requests` for CPU or memory defined.

---

### 31. Python Integration Tests Reference `master` Branch

**Files:** `nodejs-ex/tests/test_nodejs.py:33`, `nodejs-ex/tests/test_nodejs_postgresql.py:36, 56`

Tests hardcode `SOURCE_REPOSITORY_REF=master` but the project's default branch is `main`.

---

### 32. Python Test References Wrong Template Name

**File:** `nodejs-ex/tests/test_nodejs_postgresql.py:54`

Template name is `"dancer-example"` instead of `"nodejs-example"` (copy-paste error from another project).

---

### 33. Inconsistent Source Repository URLs

- Helm `values.yaml`: `https://github.com/sclorg/nodejs-ex.git`
- `nodejs.json` template: `https://github.com/sclorg/nodejs-ex.git`
- `nodejs-postgresql.json`: `https://github.com/nodeshift-starters/nodejs-rest-http-crud.git`

---

### 34. `package.json` `main` Field Misuse

**File:** `nodejs-ex/package.json:12`

`main` points to `./bin/www` (a server entry), not a library entry point. `bin/www` also lacks `.js` extension.

---

### 35. `package.json` `files` Field Incomplete

**File:** `nodejs-ex/package.json:17-26`

`logger.js` and `tracing.js` at the root are not explicitly included or excluded.

---

### 36. Inconsistent OpenShift Template Deployment Types

- `nodejs.json` uses `Deployment` (apps/v1)
- Helm uses `DeploymentConfig` (apps.openshift.io/v1)
- PostgreSQL templates use `Deployment` (apps/v1)

---

### 37. No Rate Limiting

No rate limiting middleware is present. The API is vulnerable to brute-force or denial-of-service attacks.

---

### 38. `.nodeshift/credentials-secret.yml` Committed to Git

Secret definition with substitution variables is committed to version control. If real secrets are accidentally placed here, they would be in version control.

---

## Top 5 Priority Fixes

| Priority | Issue | Fix |
|----------|-------|-----|
| 1 | DB errors leaked to clients (#3) | Return generic messages, log server-side |
| 2 | DB init race condition (#6) | Initialize once at startup, remove per-query check |
| 3 | Health checks don't check DB (#4) | Add `SELECT 1` check to `/ready` |
| 4 | Hardcoded credentials (#1) | Remove defaults, fail if env vars missing |
| 5 | `normalizePort` returns false (#11) | Validate and reject negative ports explicitly |
