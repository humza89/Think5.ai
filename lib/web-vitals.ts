/**
 * Web Vitals tracking for interview pages.
 * Reports Core Web Vitals (LCP, CLS) and custom interview metrics.
 */

export interface VitalMetric {
  name: string;
  value: number;
  rating: "good" | "needs-improvement" | "poor";
}

export function reportWebVital(metric: VitalMetric): void {
  const body = JSON.stringify({
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    page: typeof window !== "undefined" ? window.location.pathname : "",
    timestamp: Date.now(),
  });

  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon("/api/analytics/vitals", body);
  } else if (typeof fetch !== "undefined") {
    fetch("/api/analytics/vitals", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    }).catch(() => {});
  }
}

export async function initWebVitals(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === "largest-contentful-paint") {
          reportWebVital({
            name: "LCP",
            value: entry.startTime,
            rating: entry.startTime < 2500 ? "good" : entry.startTime < 4000 ? "needs-improvement" : "poor",
          });
        }
      }
    });
    observer.observe({ type: "largest-contentful-paint", buffered: true });
  } catch {
    // PerformanceObserver not supported
  }
}
