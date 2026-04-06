import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.3,
  debug: false,

  // PII scrubbing: strip sensitive data before sending to Sentry
  beforeSend(event) {
    if (event.user) {
      delete event.user.email;
      delete event.user.ip_address;
      delete event.user.username;
    }
    // Scrub sensitive fields from extra data
    if (event.extra) {
      const sensitiveKeys = ["email", "phone", "name", "fullName", "linkedinUrl", "resumeText"];
      for (const key of sensitiveKeys) {
        if (key in event.extra) {
          event.extra[key] = "[REDACTED]";
        }
      }
    }
    return event;
  },

  beforeSendTransaction(event) {
    // Strip PII from transaction spans
    if (event.spans) {
      for (const span of event.spans) {
        if (span.data) {
          const sensitiveKeys = ["email", "phone", "name", "fullName"];
          for (const key of sensitiveKeys) {
            if (key in span.data) {
              span.data[key] = "[REDACTED]";
            }
          }
        }
      }
    }
    return event;
  },
});
