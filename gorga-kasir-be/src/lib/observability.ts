import * as Sentry from "@sentry/node";

import { env } from "./env";

let initialized = false;

export function initObservability() {
  if (initialized || !env.sentryDsn) {
    return;
  }

  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.appEnv,
    tracesSampleRate: 0.2
  });

  initialized = true;
}

export function captureException(error: unknown, extras?: Record<string, unknown>) {
  if (!env.sentryDsn) {
    return;
  }

  Sentry.captureException(error, {
    extra: extras
  });
}
