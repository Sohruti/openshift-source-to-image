# Node.js CRUD Application on OpenShift (S2I)

A Node.js REST API for fruit stock management, deployed on OpenShift using **Source-to-Image (S2I)** with a PostgreSQL database.

## Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Start PostgreSQL (Docker)
docker run --name os-postgres-db \
  -e POSTGRESQL_USER=luke \
  -e POSTGRESQL_PASSWORD=secret \
  -e POSTGRESQL_DATABASE=my_data \
  -d -p 5432:5432 \
  centos/postgresql-10-centos7

# Run the app
DB_USERNAME=luke DB_PASSWORD=secret ./bin/www
```

Open http://localhost:8080

### Deploy on OpenShift (S2I)

```bash
# One-line deploy using S2I
oc new-app nodejs:22-ubi9~https://github.com/YOUR_USER/source2image.git \
  --context-dir=nodejs-ex

# Expose the route
oc expose svc/source2image
```

## API Endpoints

| Method | Endpoint          | Description          |
|--------|-------------------|----------------------|
| GET    | `/api/fruits`     | List all fruits      |
| GET    | `/api/fruits/:id` | Get one fruit by ID  |
| POST   | `/api/fruits`     | Create a fruit       |
| PUT    | `/api/fruits/:id` | Update a fruit       |
| DELETE | `/api/fruits/:id` | Delete a fruit       |
| GET    | `/ready`          | Readiness probe      |
| GET    | `/live`           | Liveness probe       |

## Scripts

| Command                  | Description                           |
|--------------------------|---------------------------------------|
| `npm start`              | Start the application                 |
| `npm run dev`            | Start with pretty logging             |
| `npm run dev:debug`      | Start with debug output               |
| `npm test`               | Run unit tests                        |
| `npm run openshift`      | Deploy to OpenShift via Nodeshift     |

## Documentation

- [S2I Guide](../S2I.md) — Comprehensive Source-to-Image documentation
- [OpenTelemetry Setup](OTEL.md) — Distributed tracing with Jaeger

## Environment Variables

| Variable                | Default       | Description              |
|-------------------------|---------------|--------------------------|
| `PORT`                  | `8080`        | HTTP server port         |
| `DB_USERNAME`           | `luke`        | PostgreSQL user          |
| `DB_PASSWORD`           | `secret`      | PostgreSQL password      |
| `POSTGRESQL_DATABASE`   | `my_data`     | PostgreSQL database name |
| `POSTGRESQL_SERVICE_HOST` | `localhost` | PostgreSQL hostname    |

## License

Apache-2.0
