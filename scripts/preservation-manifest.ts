import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const rel = (p: string) => path.relative(root, p).replace(/\\/g, "/");

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function routeOf(file: string): string {
  const relativeDir = path.relative(path.join(root, "app"), path.dirname(file)).replace(/\\/g, "/");
  const parts = relativeDir
    .split("/")
    .filter(Boolean)
    .filter((segment) => !/^\(.+\)$/.test(segment));
  return `/${parts.join("/")}`.replace(/\/$/, "") || "/";
}

function stringsFromArray(source: string, constName: string): string[] {
  const match = source.match(new RegExp(`const\\s+${constName}[^=]*=\\s*\\[([\\s\\S]*?)\\]\\s*;`));
  if (!match) return [];
  return [...match[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
}

function parseRoleMap(source: string): Array<{ prefix: string; roles: string[] }> {
  const block = source.match(/const\s+ROUTE_ROLE_MAP[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!block) return [];
  return [...block[1].matchAll(/["']([^"']+)["']\s*:\s*\[([^\]]*)\]/g)]
    .map((m) => ({
      prefix: m[1],
      roles: [...m[2].matchAll(/["']([^"']+)["']/g)].map((r) => r[1]).sort(),
    }))
    .sort((a, b) => a.prefix.localeCompare(b.prefix));
}

function exportedHttpMethods(source: string): string[] {
  const methods = new Set<string>();
  for (const m of source.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)) methods.add(m[1]);
  for (const m of source.matchAll(/export\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*=/g)) methods.add(m[1]);
  for (const m of source.matchAll(/export\s+const\s*\{([^}]*)\}\s*=/g)) {
    for (const candidate of m[1].split(",").map((s) => s.trim())) {
      if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(candidate)) methods.add(candidate);
    }
  }
  for (const m of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const candidate of m[1].split(",").map((s) => s.trim().split(/\s+as\s+/).pop() ?? "")) {
      if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(candidate)) methods.add(candidate);
    }
  }
  return [...methods].sort();
}

function parsePrismaSchema(schema: string) {
  const models = [...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)]
    .map((m) => ({
      name: m[1],
      fields: [...m[2].matchAll(/^\s+(\w+)\s+([^\s]+)/gm)]
        .filter((f) => !f[1].startsWith("@@"))
        .map((f) => ({ name: f[1], type: f[2] })),
      indexes: [...m[2].matchAll(/@@(index|unique|id)\(([^)]*)\)/g)].map((i) => `${i[1]}(${i[2].replace(/\s+/g, " ").trim()})`),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const enums = [...schema.matchAll(/^enum\s+(\w+)\s*\{([\s\S]*?)^\}/gm)]
    .map((m) => ({
      name: m[1],
      values: m[2]
        .split("\n")
        .map((line) => line.replace(/\/\/.*$/, "").trim())
        .filter((line) => line && !line.startsWith("@@"))
        .map((line) => line.split(/\s+/)[0]),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { models, enums };
}

function parseRlsPolicies(): Array<{ file: string; policy: string; table?: string }> {
  const migrationRoot = path.join(root, "prisma", "migrations");
  const policies: Array<{ file: string; policy: string; table?: string }> = [];
  for (const file of walk(migrationRoot).filter((f) => f.endsWith(".sql"))) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/CREATE\s+POLICY\s+(?:"([^"]+)"|(\w+))\s+ON\s+(?:"([^"]+)"|(\w+))/gi)) {
      policies.push({ file: rel(file), policy: match[1] || match[2], table: match[3] || match[4] });
    }
  }
  return policies.sort((a, b) => `${a.table}:${a.policy}:${a.file}`.localeCompare(`${b.table}:${b.policy}:${b.file}`));
}

function parseFeatureFlags(source: string) {
  return [...source.matchAll(/(\w+)\s*:\s*envBool\(["'](FF_[A-Z0-9_]+)["']\s*,\s*(true|false)\)/g)]
    .map((m) => ({ name: m[1], env: m[2], default: m[3] === "true" }))
    .sort((a, b) => a.env.localeCompare(b.env));
}

function parseTransitions(source: string) {
  const block = source.match(/const\s+VALID_TRANSITIONS[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!block) return {};
  const transitions: Record<string, string[]> = {};
  for (const m of block[1].matchAll(/^\s*(\w+)\s*:\s*\[([^\]]*)\]/gm)) {
    transitions[m[1]] = [...m[2].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]);
  }
  return Object.fromEntries(Object.entries(transitions).sort(([a], [b]) => a.localeCompare(b)));
}

const proxyPath = path.join(root, "proxy.ts");
const proxySource = fs.existsSync(proxyPath) ? fs.readFileSync(proxyPath, "utf8") : "";
const roleMap = parseRoleMap(proxySource);
const publicRoutes = stringsFromArray(proxySource, "publicRoutes").sort();
const publicPrefixes = stringsFromArray(proxySource, "publicPrefixes").sort();

const pages = walk(path.join(root, "app"))
  .filter((f) => /\/page\.(tsx|ts|jsx|js)$/.test(f.replace(/\\/g, "/")))
  .map((file) => {
    const route = routeOf(file);
    const source = fs.readFileSync(file, "utf8");
    const roles = roleMap
      .filter((entry) => route === entry.prefix || route.startsWith(`${entry.prefix}/`))
      .sort((a, b) => b.prefix.length - a.prefix.length)[0]?.roles ?? [];
    const isPublic = publicRoutes.includes(route) || publicPrefixes.some((prefix) => route.startsWith(prefix));
    return {
      route,
      file: rel(file),
      public: isPublic,
      roles,
      protectedRouteComponent: /<ProtectedRoute\b/.test(source),
      dynamic: /\[[^\]]+\]/.test(route),
    };
  })
  .sort((a, b) => a.route.localeCompare(b.route) || a.file.localeCompare(b.file));

const apis = walk(path.join(root, "app", "api"))
  .filter((f) => /\/route\.(tsx|ts|jsx|js)$/.test(f.replace(/\\/g, "/")))
  .map((file) => {
    const source = fs.readFileSync(file, "utf8");
    return { route: routeOf(file), file: rel(file), methods: exportedHttpMethods(source) };
  })
  .sort((a, b) => a.route.localeCompare(b.route));

const schemaPath = path.join(root, "prisma", "schema.prisma");
const schema = fs.existsSync(schemaPath) ? fs.readFileSync(schemaPath, "utf8") : "";
const { models, enums } = parsePrismaSchema(schema);

const inngestIndexPath = path.join(root, "inngest", "functions", "index.ts");
const inngestServePath = path.join(root, "app", "api", "inngest", "route.ts");
const inngestIndex = fs.existsSync(inngestIndexPath) ? fs.readFileSync(inngestIndexPath, "utf8") : "";
const inngestServe = fs.existsSync(inngestServePath) ? fs.readFileSync(inngestServePath, "utf8") : "";
const inngestNames = new Set<string>();
for (const m of inngestIndex.matchAll(/export\s*\{([^}]*)\}\s*from/g)) {
  for (const name of m[1].split(",").map((s) => s.trim()).filter(Boolean)) inngestNames.add(name.split(/\s+as\s+/).pop()!);
}
for (const m of inngestIndex.matchAll(/export\s+const\s+(\w+)/g)) inngestNames.add(m[1]);
const inngest = [...inngestNames]
  .map((name) => ({ name, registered: new RegExp(`\\b${name}\\b`).test(inngestServe) }))
  .sort((a, b) => a.name.localeCompare(b.name));

const vercelPath = path.join(root, "vercel.json");
const vercel = fs.existsSync(vercelPath) ? JSON.parse(fs.readFileSync(vercelPath, "utf8")) : {};
const crons = [...(vercel.crons ?? [])].sort((a, b) => String(a.path).localeCompare(String(b.path)));

const flagsPath = path.join(root, "lib", "feature-flags.ts");
const flags = fs.existsSync(flagsPath) ? parseFeatureFlags(fs.readFileSync(flagsPath, "utf8")) : [];

const stateMachinePath = path.join(root, "lib", "interview-state-machine.ts");
const interviewTransitions = fs.existsSync(stateMachinePath)
  ? parseTransitions(fs.readFileSync(stateMachinePath, "utf8"))
  : {};

const manifest = {
  manifestVersion: 1,
  pages,
  apis,
  prisma: { models, enums, rlsPolicies: parseRlsPolicies() },
  inngest,
  crons,
  featureFlags: flags,
  interviewTransitions,
};

const outDir = path.join(root, "docs", "preservation");
const outPath = path.join(outDir, "manifest.json");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
  [
    `pages ${pages.length}`,
    `apis ${apis.length}`,
    `models ${models.length}`,
    `enums ${enums.length}`,
    `rlsPolicies ${manifest.prisma.rlsPolicies.length}`,
    `inngest ${inngest.length} (${inngest.filter((f) => f.registered).length} registered)`,
    `crons ${crons.length}`,
    `flags ${flags.length}`,
  ].join(" · "),
);
