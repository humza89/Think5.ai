/**
 * Lightweight i18n foundation for interview UI.
 * Supports 8 locales with English as the base.
 */

export type Locale = "en" | "es" | "fr" | "de" | "pt" | "ja" | "ko" | "zh";

const DEFAULT_LOCALE: Locale = "en";

const translations: Record<Locale, Record<string, string>> = {
  en: {
    "welcome.title": "Welcome to Your Interview",
    "welcome.duration": "Estimated duration: ~30 minutes (45 min max)",
    "welcome.start": "Start Interview Now",
    "welcome.accommodations": "Request Accommodations",
    "welcome.consent.recording": "I consent to this interview being recorded",
    "welcome.consent.proctoring": "I agree to integrity monitoring during the interview",
    "welcome.consent.privacy": "I have read and agree to the Privacy Policy",
    "interview.connecting": "Connecting...",
    "interview.listening": "Listening...",
    "interview.thinking": "Thinking...",
    "interview.speaking": "Speaking...",
    "interview.paused": "Interview Paused",
    "interview.resume": "Resume Interview",
    "interview.end": "End Interview",
    "interview.complete.title": "Interview Complete",
    "interview.complete.message": "Your recruiter will review your assessment shortly.",
    "precheck.title": "System Check",
    "precheck.retry": "Retry Checks",
    "error.timeout": "The request timed out. Please try again.",
    "error.network": "Network connection lost. Attempting to reconnect...",
    "error.generic": "Something went wrong. Please try again.",
  },
  es: {
    "welcome.title": "Bienvenido a Su Entrevista",
    "welcome.duration": "Duración estimada: ~30 minutos (45 min máx)",
    "welcome.start": "Iniciar Entrevista",
    "welcome.accommodations": "Solicitar Adaptaciones",
    "interview.complete.title": "Entrevista Completada",
    "interview.complete.message": "Su reclutador revisará su evaluación pronto.",
  },
  fr: {
    "welcome.title": "Bienvenue à Votre Entretien",
    "welcome.start": "Commencer l'Entretien",
    "interview.complete.title": "Entretien Terminé",
  },
  de: {
    "welcome.title": "Willkommen zu Ihrem Interview",
    "welcome.start": "Interview Starten",
    "interview.complete.title": "Interview Abgeschlossen",
  },
  pt: { "welcome.title": "Bem-vindo à Sua Entrevista", "welcome.start": "Iniciar Entrevista" },
  ja: { "welcome.title": "面接へようこそ", "welcome.start": "面接を開始" },
  ko: { "welcome.title": "면접에 오신 것을 환영합니다", "welcome.start": "면접 시작" },
  zh: { "welcome.title": "欢迎参加面试", "welcome.start": "开始面试" },
};

export function getTranslations(locale: string): (key: string) => string {
  const lang = (locale?.slice(0, 2) as Locale) || DEFAULT_LOCALE;
  const localeStrings = translations[lang] || translations[DEFAULT_LOCALE];
  const fallback = translations[DEFAULT_LOCALE];
  return (key: string): string => localeStrings[key] || fallback[key] || key;
}

export function detectLocale(acceptLanguage?: string | null): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const preferred = acceptLanguage.split(",").map(lang => {
    const [code, q] = lang.trim().split(";q=");
    return { code: code.trim().slice(0, 2).toLowerCase(), q: q ? parseFloat(q) : 1.0 };
  }).sort((a, b) => b.q - a.q);
  for (const { code } of preferred) {
    if (code in translations) return code as Locale;
  }
  return DEFAULT_LOCALE;
}

export const SUPPORTED_LOCALES = Object.keys(translations) as Locale[];
