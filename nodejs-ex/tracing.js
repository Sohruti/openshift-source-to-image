const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { trace } = require('@opentelemetry/api');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
const { PgInstrumentation } = require('@opentelemetry/instrumentation-pg');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const JAEGER_SERVICE_NAME = process.env.JAEGER_SERVICE_NAME || 'jaeger-all-in-one-inmemory-collector';
const JAEGER_NAMESPACE = process.env.JAEGER_NAMESPACE || 'opentelemetry-js-rhosdt';
const JAEGER_COLLECTOR_PORT = process.env.JAEGER_COLLECTOR_PORT || '14268';

const exporter = new JaegerExporter({
  endpoint: `http://${JAEGER_SERVICE_NAME}.${JAEGER_NAMESPACE}.svc:${JAEGER_COLLECTOR_PORT}/api/traces`
});

const provider = new NodeTracerProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'nodejs-rest-http-crud'
  })
});

provider.addSpanProcessor(new SimpleSpanProcessor(exporter));

provider.register();

registerInstrumentations({
  instrumentations: [
    new HttpInstrumentation(),
    new ExpressInstrumentation(),
    new PgInstrumentation()
  ],
  tracerProvider: provider
});

trace.getTracer('nodejs-rest-http-crud');
