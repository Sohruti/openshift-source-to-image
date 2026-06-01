# Source-to-Image (S2I) on OpenShift

## What is S2I?

**Source-to-Image (S2I)** is a tool and workflow for building reproducible container images from source code. It was created by Red Hat as part of the OpenShift platform. S2I injects application source code into a pre-built **builder image** and assembles a new container image that runs the application — without needing a Dockerfile.

Instead of writing `Dockerfile` instructions like `FROM`, `COPY`, `RUN`, and `CMD`, S2I provides a standardized, secure, and fast way to turn source code into a runnable image.

---

## How S2I Works

```
                    +-------------------+
                    |  Source Code      |
                    |  (Git repo)       |
                    +---------+---------+
                              |
                              v
+------------------+    +-----+------+     +------------------+
|  Builder Image   +--->|  S2I       +---->|  Application     |
|  (Node.js, etc.) |    |  Process   |     |  Image           |
+------------------+    +------------+     +------------------+
                                                    |
                                                    v
                                          +------------------+
                                          |  Deployed on     |
                                          |  OpenShift       |
                                          +------------------+
```

### The S2I Process Step by Step

1. **Fetch source** — S2I downloads source code from a Git repository, a local directory, or a binary input.

2. **Extract the builder image** — The builder image (e.g., `registry.access.redhat.com/ubi8/nodejs-20`) contains the OS, runtime, and build tools.

3. **Run `assemble`** — S2I executes the `assemble` script from the builder image. This typically:
   - Installs dependencies (`npm install`)
   - Copies application source code into the image
   - Compiles or builds artifacts

4. **Commit the new image** — The resulting filesystem is committed as a new container image tagged with the application name.

5. **Run `run`** — When the container starts, S2I executes the `run` script (usually `npm start` or `node server.js`).

### Key S2I Scripts (from builder image)

| Script      | Location            | Purpose                                       |
|-------------|---------------------|-----------------------------------------------|
| `assemble`  | `/usr/libexec/s2i/` | Builds the application during image creation  |
| `run`       | `/usr/libexec/s2i/` | Starts the application when container runs    |
| `save-artifacts` | `/usr/libexec/s2i/` | Preserves build artifacts across rebuilds  |
| `usage`     | `/usr/libexec/s2i/` | Prints usage information                      |

---

## S2I vs Dockerfile

| Feature               | S2I                              | Dockerfile                        |
|-----------------------|----------------------------------|-----------------------------------|
| **Security**          | Runs build as non-root user      | Often runs as root                |
| **Caching**           | Built-in layer caching           | Requires manual multi-stage care  |
| **Speed**             | Faster incremental builds        | Slower for repeated builds        |
| **Reproducibility**   | High (same source = same image)  | Can vary by base image updates    |
| **Resource efficiency**| Lower image size (cached layers)| Can be optimized manually         |
| **Ease of use**       | No Dockerfile needed             | Requires Dockerfile expertise     |
| **Git integration**   | Native Git integration           | Manual `COPY .`                   |

---

## S2I Builder Images

Red Hat provides certified S2I builder images for popular runtimes:

| Language      | Image                                                   |
|---------------|---------------------------------------------------------|
| Node.js       | `registry.access.redhat.com/ubi8/nodejs-20`            |
| Python        | `registry.access.redhat.com/ubi8/python-311`           |
| Java          | `registry.access.redhat.com/ubi8/openjdk-17`           |
| Ruby          | `registry.access.redhat.com/ubi8/ruby-30`              |
| Perl          | `registry.access.redhat.com/ubi8/perl-534`             |
| PHP           | `registry.access.redhat.com/ubi8/php-81`               |
| Go            | `registry.access.redhat.com/ubi8/go-toolkit`           |
| .NET Core     | `registry.access.redhat.com/ubi8/dotnet-60`            |

### Available Node.js Versions

| Version      | Image Tag Example               |
|--------------|---------------------------------|
| Node.js 18   | `registry.access.redhat.com/ubi8/nodejs-18` |
| Node.js 20   | `registry.access.redhat.com/ubi8/nodejs-20` |
| Node.js 22   | `registry.access.redhat.com/ubi8/nodejs-22` (UBI 9) |

---

## Deployment Methods

### 1. Using `oc new-app` (Quickest)

```bash
# Deploy directly from a Git repository
oc new-app nodejs~https://github.com/your-username/source2image.git

# Or specify a branch
oc new-app nodejs~https://github.com/your-username/source2image.git#main
```

This command:
1. Creates a BuildConfig that uses the Node.js S2I builder
2. Creates a Deployment to run the resulting image
3. Creates a Service to expose the application
4. Optionally creates a Route for external access

### 2. Using OpenShift Templates

This project includes pre-built OpenShift templates:

```bash
# Create the template in your project
oc create -f nodejs-ex/openshift/templates/nodejs.json

# Deploy from the template
oc new-app nodejs-example \
  -p SOURCE_REPOSITORY_URL=https://github.com/your-username/source2image.git \
  -p NODEJS_VERSION=22-ubi9

# Expose the service
oc expose svc/nodejs-example
```

**Available templates:**

| Template                        | Description                                     |
|---------------------------------|-------------------------------------------------|
| `nodejs.json`                   | Node.js app without database                    |
| `nodejs-postgresql.json`        | Node.js app with ephemeral PostgreSQL           |
| `nodejs-postgresql-persistent.json` | Node.js app with persistent PostgreSQL      |

### 3. Using Helm Charts

```bash
helm install nodejs-example ./nodejs-ex/helm/nodejs \
  --set source_repository_url=https://github.com/your-username/source2image.git
```

### 4. Using Nodeshift (npm)

```bash
npm run openshift
```

This uses the `nodeshift` npm package to deploy to OpenShift directly.

---

## S2I Build Configuration (BuildConfig)

The S2I build is defined by an OpenShift **BuildConfig** resource. Here is what it looks like:

```yaml
kind: BuildConfig
apiVersion: build.openshift.io/v1
metadata:
  name: nodejs-example
spec:
  source:
    type: Git
    git:
      uri: https://github.com/your-username/source2image.git
      ref: main
    contextDir: nodejs-ex
  strategy:
    type: Source                # <-- This tells OpenShift to use S2I
    sourceStrategy:
      from:
        kind: ImageStreamTag
        name: nodejs:22-ubi9    # <-- The builder image
  output:
    to:
      kind: ImageStreamTag
      name: nodejs-example:latest
  triggers:
    - type: ImageChange         # Rebuild when the builder image updates
    - type: ConfigChange        # Rebuild when the BuildConfig changes
    - type: GitHub              # Rebuild on git push (webhook)
      github:
        secret: <webhook-secret>
```

---

## Environment Variables

The application respects the following environment variables:

| Variable                     | Default        | Description                              |
|------------------------------|----------------|------------------------------------------|
| `PORT`                       | `8080`         | HTTP server port                         |
| `DB_USERNAME`                | `luke`         | PostgreSQL username                      |
| `DB_PASSWORD`                | `secret`       | PostgreSQL password                      |
| `POSTGRESQL_DATABASE`        | `my_data`      | PostgreSQL database name                 |
| `POSTGRESQL_SERVICE_HOST`    | `localhost`    | PostgreSQL hostname                      |
| `JAEGER_SERVICE_NAME`        | `jaeger-all-in-one-inmemory-collector` | Jaeger collector service |
| `JAEGER_NAMESPACE`           | `opentelemetry-js-rhosdt` | Jaeger collector namespace      |
| `JAEGER_COLLECTOR_PORT`      | `14268`        | Jaeger collector port                    |
| `NPM_MIRROR`                 | (empty)        | Custom npm registry mirror URL           |

---

## Health Checks (Probes)

The application exposes two health check endpoints:

| Endpoint   | Purpose               | Used By       |
|------------|-----------------------|---------------|
| `/ready`   | Readiness probe       | Load balancer |
| `/live`    | Liveness probe        | Pod restarter |

These are configured in the `.nodeshift/deployment.yml`:

```yaml
readinessProbe:
  httpGet:
    path: /ready
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 5

livenessProbe:
  httpGet:
    path: /live
    port: 8080
  initialDelaySeconds: 60
  periodSeconds: 3
```

---

## OpenTelemetry / Distributed Tracing

This application supports OpenTelemetry for distributed tracing with Jaeger.

To enable tracing:

```bash
npm run openshift:enable:trace
```

The `tracing.js` file configures:
- **Exporter**: Jaeger (configurable via `JAEGER_SERVICE_NAME`, `JAEGER_NAMESPACE`, `JAEGER_COLLECTOR_PORT` env vars)
- **Instrumentations**: HTTP, Express, PostgreSQL

See [nodejs-ex/OTEL.md](nodejs-ex/OTEL.md) for full setup instructions.

---

## Project Structure

```
source2image/
├── S2I.md                     # This documentation
├── nodejs-ex/                 # Application source code
│   ├── app.js                 # Express application entry
│   ├── bin/www                # HTTP server startup
│   ├── package.json           # Dependencies and scripts
│   ├── logger.js              # Pino logger configuration
│   ├── tracing.js             # OpenTelemetry tracing setup
│   │
│   ├── lib/
│   │   ├── api/fruits.js      # Database query functions (CRUD)
│   │   ├── routes/fruits.js   # Express routes for /api/fruits
│   │   ├── db/index.js        # PostgreSQL connection & init
│   │   └── validations/       # Request validation middleware
│   │
│   ├── public/index.html      # Vue.js frontend
│   ├── tests/                 # Python integration tests
│   ├── test/                  # JavaScript unit tests
│   │
│   ├── openshift/templates/   # OpenShift templates
│   │   ├── nodejs.json
│   │   ├── nodejs-postgresql.json
│   │   └── nodejs-postgresql-persistent.json
│   │
│   ├── helm/nodejs/           # Helm chart
│   ├── .nodeshift/            # Nodeshift deployment configs
│   └── .github/workflows/     # CI configuration
│
└── README.md                  # Project overview
```

---

## Quick Start (Local Development)

```bash
# 1. Install dependencies
cd nodejs-ex
npm install

# 2. Start PostgreSQL (Docker)
docker run --name os-postgres-db \
  -e POSTGRESQL_USER=luke \
  -e POSTGRESQL_PASSWORD=secret \
  -e POSTGRESQL_DATABASE=my_data \
  -d -p 5432:5432 \
  centos/postgresql-10-centos7

# 3. Run the application
DB_USERNAME=luke DB_PASSWORD=secret ./bin/www

# 4. Open in browser
# http://localhost:8080
```

---

## Quick Start (OpenShift)

```bash
# 1. Login to OpenShift
oc login -u developer

# 2. Create a new project
oc new-project my-s2i-app

# 3. Deploy using S2I
oc new-app nodejs:22-ubi9~https://github.com/your-username/source2image.git \
  --context-dir=nodejs-ex

# 4. Expose the route
oc expose svc/source2image

# 5. Get the URL
oc get route
```

---

## Customizing S2I Builds

### .s2i/environment

Place a file at `nodejs-ex/.s2i/environment` with environment variables that should be set during the S2I build:

```
NPM_MIRROR=https://registry.npmjs.org/
```

### .s2i/bin/assemble

You can provide a custom `assemble` script at `nodejs-ex/.s2i/bin/assemble` to override the default build process:

```bash
#!/bin/bash
echo "Running custom assemble script"
npm install --production
npm run build
```

### .s2i/bin/run

You can provide a custom `run` script at `nodejs-ex/.s2i/bin/run` to override how the application starts:

```bash
#!/bin/bash
echo "Starting application..."
exec node /opt/app-root/src/bin/www
```

---

## Troubleshooting

| Problem                          | Likely Cause                              | Solution                                      |
|----------------------------------|-------------------------------------------|-----------------------------------------------|
| Build fails with npm error       | Network issue or missing dependencies     | Check `NPM_MIRROR` or add `.npmrc`            |
| Pod crashes immediately          | Port mismatch or missing env vars         | Verify `PORT` env var and DB connection       |
| Database connection refused      | PostgreSQL not ready or wrong host        | Check `POSTGRESQL_SERVICE_HOST` and probes    |
| OpenTelemetry traces not sending | Jaeger service not running                | Verify Jaeger operator installation           |
| Readiness probe failing          | App starting too slowly                   | Increase `initialDelaySeconds` in probes      |
| Image pull backoff               | Wrong builder image tag                   | Verify `NODEJS_VERSION` is available          |

---

## Resources

- [OpenShift S2I Documentation](https://docs.openshift.com/container-platform/latest/using_images/s2i_images/nodejs.html)
- [S2I GitHub Repository](https://github.com/openshift/source-to-image)
- [Node.js S2I Builder Image](https://catalog.redhat.com/software/containers/ubi8/nodejs-20)
- [OpenShift Templates](https://docs.openshift.com/container-platform/latest/openshift_images/templates.html)

---

## How the Code Works (Step by Step)

### Entry Point — `bin/www`

```
bin/www  →  loads app.js  →  creates HTTP server  →  listens on PORT (default 8080)
```

- `npm start` runs `node .` which uses `package.json`'s `"main": "./bin/www"`
- `normalizePort()` reads `process.env.PORT` or defaults to `8080`
- Creates a raw `http.Server` wrapping the Express app
- Handles errors like port already in use (`EADDRINUSE`)

### Express App Setup — `app.js`

This wires everything together:

```
app.js
  ├── bodyParser.json()          ← parses JSON request bodies
  ├── bodyParser.urlencoded()    ← parses form data
  ├── express.static('public')   ← serves index.html at /
  ├── /api → routes/fruits.js    ← all CRUD routes
  ├── /ready → 200               ← Kubernetes readiness probe
  ├── /live → 200                ← Kubernetes liveness probe
  └── db.init()                  ← creates tables + seed data
```

The error handler on line 34 catches malformed JSON and returns `415 Unsupported Media Type`.

### Database — `lib/db/index.js`

```
lib/db/index.js
  ├── Reads env vars for DB connection (or uses kube-service-bindings on OpenShift)
  ├── Creates a PostgreSQL connection pool
  ├── init() → CREATE TABLE IF NOT EXISTS products + INSERT seed data
  ├── didInitHappen() → SELECT * FROM products (checks if table exists)
  └── query() → checks init, then runs your SQL
```

**The `products` table:**
```sql
id    SERIAL PRIMARY KEY
name  VARCHAR(40) NOT NULL
stock BIGINT
```

**Flow of every request:**
1. `query()` is called
2. It checks if the table exists (`didInitHappen`)
3. If not, runs `init()` to create it
4. Then runs your actual SQL

### API Functions — `lib/api/fruits.js`

Pure SQL wrappers, no Express logic:

| Function | SQL | Purpose |
|----------|-----|---------|
| `find(id)` | `SELECT * FROM products WHERE id = $1` | Get one fruit |
| `findAll()` | `SELECT * FROM products` | Get all fruits |
| `create(name, stock)` | `INSERT INTO products ... RETURNING *` | Add a fruit |
| `update({name, stock, id})` | `UPDATE products SET ... WHERE id = $3` | Edit a fruit |
| `remove(id)` | `DELETE FROM products WHERE id = $1` | Delete a fruit |

### Routes — `lib/routes/fruits.js`

Maps HTTP methods to API functions:

```
GET    /api/fruits      → findAll()   → returns JSON array
GET    /api/fruits/:id  → find(id)    → returns JSON object or 404
POST   /api/fruits      → create()    → returns 201 + new fruit
PUT    /api/fruits/:id  → update()    → returns 204 (no content)
DELETE /api/fruits/:id  → remove()    → returns 204 (no content)
```

**Middleware chain for POST/PUT:**
```
Request → validateCreateUpdateRequest() → route handler → db query → response
```

### Validation — `lib/validations/index.js`

Checks before any create/update:
1. Body is not empty → else `415`
2. `name` is provided → else `422`
3. `stock` is a non-negative number → else `422`
4. If `id` is in body, it must match the URL param → else `422`

### Frontend — `public/index.html`

A **Vue.js 2** single-page app served by Express:

```
Browser loads index.html
  → Vue mounts on #app
  → mounted() calls _refreshPageData()
  → GET /api/fruits populates the table
  → User fills form → clicks Save
  → update() decides POST (new) or PUT (edit)
  → fetch() sends JSON to API
  → _success() refreshes the table + clears form
```

**Form logic:**
- `form.id == -1` → it's a new fruit → `POST /api/fruits`
- `form.id != -1` → editing existing → `PUT /api/fruits/:id`
- Edit button sets `form.id` to the fruit's ID
- Remove button calls `DELETE /api/fruits/:id`

### Request Flow (Full Picture)

```
Browser (Vue)
    │
    ▼
Express (app.js)
    │
    ├── static middleware → serves public/index.html
    │
    ├── /api/fruits (routes/fruits.js)
    │       │
    │       ├── validation middleware
    │       │
    │       └── lib/api/fruits.js
    │               │
    │               └── lib/db/index.js
    │                       │
    │                       └── PostgreSQL pool.query()
    │
    └── /ready, /live → health checks
```
