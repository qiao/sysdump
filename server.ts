import { readFile, statfs } from "node:fs/promises";
import { createServer, type IncomingHttpHeaders } from "node:http";
import os from "node:os";

// Listen on loopback by default, so a local run does not show the environment to the network. The Docker image sets HOST=0.0.0.0.
const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 3000);

const server = createServer(async (request, response) => {
  if (request.method !== "GET" || request.url?.split("?")[0] !== "/") {
    response.writeHead(404, { "content-type": "text/plain" }).end("Not found\n");
    return;
  }

  try {
    const html = renderPage(request.headers, await collectSystemSnapshot());

    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
      "x-content-type-options": "nosniff",
    });
    response.end(html);
  } catch (error) {
    console.error(error);
    response.writeHead(500, { "content-type": "text/plain" }).end("Cannot collect the system data\n");
  }
});

server.listen(port, host, () => {
  console.log(`sysdump is listening on http://${host}:${port}`);
});

// Stops on Ctrl+C and on "docker stop" without the 10 s kill timeout.
const stop = () => server.close(() => process.exit(0));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

// Page rendering

/**
 * Renders the full HTML page. Every value goes through `escapeHtml`, because headers and environment values can hold markup.
 *
 * @param headers The request headers.
 * @param snapshot The system data for this request.
 * @returns The HTML document.
 *
 * @example
 * response.end(renderPage(request.headers, await collectSystemSnapshot()));
 */
function renderPage(headers: IncomingHttpHeaders, snapshot: SystemSnapshot): string {
  const headerRows: Row[] = Object.entries(headers)
    .map(([label, value]) => ({ label, value: Array.isArray(value) ? value.join(", ") : (value ?? "") }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const osName = findRow(snapshot.os, ["PRETTY_NAME", "ProductName"]);
  const osVersion = findRow(snapshot.os, ["ProductVersion"]);
  const osLabel = [osName, osVersion].filter(Boolean).join(" ") || os.platform();

  // Without a cgroup limit, constrainedMemory() returns 0 or a value near 2^64, so only a value below the host total is a real limit.
  const constrainedMemory = process.constrainedMemory();
  const memoryLimit = constrainedMemory > 0 && constrainedMemory < snapshot.memoryTotal ? constrainedMemory : 0;

  const sections: Section[] = [
    { id: "headers", title: "Headers", keyLabel: "Header", rows: headerRows, mono: true },
    { id: "env", title: "Environment", keyLabel: "Variable", rows: snapshot.env, mono: true },
    { id: "os", title: "OS", keyLabel: "Field", rows: snapshot.os, mono: false },
    { id: "kernel", title: "Kernel", keyLabel: "Field", rows: snapshot.uname, mono: false },
    { id: "cpu", title: "CPU", keyLabel: "CPU", rows: snapshot.cpu.cores, mono: true },
    { id: "memory", title: "Memory", keyLabel: "Measure", rows: snapshot.memory, mono: false },
    { id: "disk", title: "Disk", keyLabel: "Path", rows: snapshot.disk, mono: true },
    { id: "limits", title: "Limits", keyLabel: "Measure", rows: snapshot.limits, mono: false },
    { id: "network", title: "Network", keyLabel: "Interface", rows: snapshot.network, mono: true },
    { id: "process", title: "Process", keyLabel: "Field", rows: snapshot.process, mono: false },
    { id: "versions", title: "Versions", keyLabel: "Component", rows: snapshot.versions, mono: true },
  ];

  const stats = [
    renderStat("OS", osLabel, os.hostname(), true),
    renderStat("CPUs", String(snapshot.cpu.count), snapshot.cpu.model, false),
    renderStat("Memory", formatBytes(memoryLimit || snapshot.memoryTotal), memoryLimit ? "Limit for this process" : "Total on the host", false),
    renderStat("Node.js", process.versions.node, `${os.type()} ${os.machine()}`, false),
  ];

  const nav = sections.map((section) => `<a href="#${section.id}">${section.title}</a>`).join("");

  return `<!doctype html>
<html lang="en" style="color-scheme: dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>System dump</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400..600&family=Geist+Mono:wght@400..600&display=swap" referrerpolicy="no-referrer">
<link rel="stylesheet" href="https://vercel.com/geist/vercel-brand.css">
<style>
/* Gives every table the same column split, so values line up from one section to the next. */
.vbg-custom-table {
  table-layout: fixed;
}

.vbg-custom-key-col {
  width: 28%;
}

/* Values carry the data, so they get the primary color. Keys get the secondary color. */
.vbg-custom-value {
  color: var(--vbg-text-primary);
  overflow-wrap: anywhere;
  word-break: break-word;
}

.vbg-custom-key {
  color: var(--vbg-text-secondary);
  font-weight: var(--vbg-weight-regular);
  overflow-wrap: anywhere;
}

.vbg-custom-empty {
  color: var(--vbg-text-secondary);
  font-style: italic;
}

/* Marks the row under the pointer, so the eye can follow it across the gap between key and value. */
.vbg-custom-section tbody tr:hover {
  background: var(--vbg-surface-secondary);
}

.vbg-custom-nav {
  display: flex;
  flex-wrap: wrap;
  gap: var(--vbg-space-2) var(--vbg-space-5);
  margin-top: var(--vbg-space-4);
}

.vbg-custom-nav a {
  color: var(--vbg-text-primary);
  text-decoration: none;
}

.vbg-custom-nav a:hover {
  text-decoration: underline;
}

.vbg-custom-section,
.vbg-custom-row {
  scroll-margin-top: var(--vbg-space-6);
}

/* Each section heading and each key links to itself, so a reader can copy a deep link. */
.vbg-custom-anchor {
  color: inherit;
  text-decoration: none;
}

.vbg-custom-anchor:hover {
  text-decoration: underline;
}

/* Marks the row that the URL hash points to. The text color also changes, so the mark does not rely on the background alone. */
.vbg-custom-row:target {
  background: var(--vbg-border-subtle);
}

.vbg-custom-row:target .vbg-custom-key {
  color: var(--vbg-text-primary);
}

/* Keeps each summary value on one line, so long hostnames or OS names cannot push the row out of line. The tables show the full value. */
.vbg-custom-fit {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
</head>
<body class="vbg-report" data-theme="dark">
<div class="vbg-shell">
<a class="vbg-skip-link" href="#main">Skip to content</a>
<main id="main">
<section class="vbg-opening">
<div class="vbg-opening-claim">
<h1 class="vbg-title">System dump</h1>
<nav aria-label="Sections" class="vbg-custom-nav">${nav}</nav>
</div>
<div class="vbg-opening-proof"><div class="vbg-stat-strip">${stats.join("")}</div></div>
</section>
${sections.map(renderSection).join("\n")}
</main>
</div>
</body>
</html>
`;
}

interface Section {
  id: string;
  title: string;
  keyLabel: string;
  rows: Row[];
  mono: boolean;
}

function renderStat(label: string, value: string, detail: string, monoDetail: boolean): string {
  const detailClass = monoDetail ? "vbg-stat-detail vbg-mono vbg-custom-fit" : "vbg-stat-detail vbg-custom-fit";

  return `<div class="vbg-stat">
<p class="vbg-stat-label">${escapeHtml(label)}</p>
<p class="vbg-stat-value vbg-custom-fit" title="${escapeHtml(value)}">${escapeHtml(value)}</p>
<p class="${detailClass}" title="${escapeHtml(detail)}">${escapeHtml(detail)}</p>
</div>`;
}

function renderSection({ id, title, keyLabel, rows, mono }: Section): string {
  const valueClass = mono ? "vbg-custom-value vbg-mono" : "vbg-custom-value";
  const keyClass = mono ? "vbg-custom-key vbg-mono" : "vbg-custom-key";
  const rowIds = toRowIds(id, rows);

  const body = rows
    .map((row, index) => {
      const rowId = rowIds[index] ?? "";
      const value = row.value ? escapeHtml(row.value) : `<span class="vbg-custom-empty">empty</span>`;

      return `<tr id="${rowId}" class="vbg-custom-row"><th scope="row" class="${keyClass}"><a href="#${rowId}" class="vbg-custom-anchor">${escapeHtml(row.label)}</a></th><td class="${valueClass}">${value}</td></tr>`;
    })
    .join("\n");

  return `<section id="${id}" class="vbg-section vbg-custom-section" aria-labelledby="${id}-title">
<div class="vbg-flow">
<h2 id="${id}-title" class="vbg-heading-24"><a href="#${id}" class="vbg-custom-anchor">${title}</a></h2>
<div class="vbg-table-wrap">
<table class="vbg-custom-table">
<caption class="vbg-visually-hidden">${title}, ${rows.length} rows</caption>
<colgroup><col class="vbg-custom-key-col"><col></colgroup>
<thead class="vbg-visually-hidden"><tr><th scope="col">${keyLabel}</th><th scope="col">Value</th></tr></thead>
<tbody>
${body}
</tbody>
</table>
</div>
</div>
</section>`;
}

function findRow(rows: Row[], labels: string[]): string | undefined {
  return rows.find((row) => labels.includes(row.label))?.value;
}

/**
 * Builds one unique, URL-safe element ID for each row, such as `env-PATH` or `headers-user-agent`.
 * A label that repeats in the same section, such as a network interface name, gets a numeric suffix.
 */
function toRowIds(sectionId: string, rows: Row[]): string[] {
  const seen = new Map<string, number>();

  return rows.map((row) => {
    const slug = row.label.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
    const base = `${sectionId}-${slug}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);

    if (count === 0) {
      return base;
    }

    return `${base}-${count + 1}`;
  });
}

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
}

// System data collection

/** A label and value pair that the page shows as one table row. */
interface Row {
  label: string;
  value: string;
}

/** The content of one system file. `content` is `null` when the file cannot be read. */
interface RawFile {
  path: string;
  content: string | null;
}

/** All system data that one request collects. */
interface SystemSnapshot {
  collectedAt: string;
  os: Row[];
  uname: Row[];
  cpu: {
    model: string;
    count: number;
    speedMhz: number;
    cores: Row[];
  };
  memory: Row[];
  memoryTotal: number;
  disk: Row[];
  limits: Row[];
  network: Row[];
  process: Row[];
  versions: Row[];
  env: Row[];
}

/**
 * Collects the host, process, and environment data for the current request.
 * The environment values are not redacted.
 *
 * @returns The system snapshot.
 *
 * @example
 * const snapshot = await collectSystemSnapshot();
 * console.log(snapshot.cpu.model);
 */
async function collectSystemSnapshot(): Promise<SystemSnapshot> {
  const cpus = os.cpus();
  const files = await Promise.all(RAW_FILE_PATHS.map(readRawFile));

  return {
    collectedAt: new Date().toISOString(),
    os: await getOs(files),
    uname: getUname(),
    cpu: {
      model: cpus[0]?.model ?? "unknown",
      count: os.availableParallelism(),
      speedMhz: cpus[0]?.speed ?? 0,
      cores: cpus.map((cpu, index) => ({
        label: `cpu${index}`,
        value: `${cpu.model} at ${cpu.speed} MHz`,
      })),
    },
    memory: getMemory(),
    memoryTotal: os.totalmem(),
    disk: await getDisk(),
    limits: getLimits(files),
    network: getNetwork(),
    process: getProcess(),
    versions: toRows(process.versions),
    env: toRows(process.env),
  };
}

/**
 * Formats a byte count with a binary unit.
 *
 * @param bytes The byte count.
 * @returns The formatted value, such as `1.50 GiB`.
 *
 * @example
 * formatBytes(1536); // "1.50 KiB"
 */
function formatBytes(bytes: number): string {
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  const exponent = Math.min(Math.floor(Math.log2(Math.max(bytes, 1)) / 10), units.length - 1);

  if (exponent === 0) {
    return `${bytes} B`;
  }

  return `${(bytes / 1024 ** exponent).toFixed(2)} ${units[exponent]}`;
}

// The OS and limit sections read these files. The files exist only on Linux hosts.
const RAW_FILE_PATHS = ["/etc/os-release", "/sys/fs/cgroup/cpu.max", "/sys/fs/cgroup/memory.max"];

async function readRawFile(path: string): Promise<RawFile> {
  try {
    return { path, content: await readFile(path, "utf8") };
  } catch {
    return { path, content: null };
  }
}

function toRows(record: Record<string, string | undefined>): Row[] {
  return Object.entries(record)
    .map(([label, value]) => ({ label, value: value ?? "" }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

async function getOs(files: RawFile[]): Promise<Row[]> {
  const osRelease = files.find((file) => file.path === "/etc/os-release")?.content;
  const releaseRows = osRelease ? parseOsRelease(osRelease) : await getMacOsRelease();
  const libc = getLibc(process.report.getReport());

  const rows: Row[] = [
    { label: "Platform", value: os.platform() },
    ...releaseRows,
    { label: "Kernel", value: `${os.type()} ${os.release()}` },
    { label: "Kernel build", value: os.version() },
  ];

  if (libc) {
    rows.push({ label: "glibc runtime", value: libc });
  }

  return rows;
}

function parseOsRelease(content: string): Row[] {
  return content
    .split("\n")
    .filter((line) => line.includes("=") && !line.startsWith("#"))
    .map((line) => {
      const [key, ...rest] = line.split("=");

      return { label: key ?? "", value: rest.join("=").replace(/^"|"$/g, "") };
    });
}

async function getMacOsRelease(): Promise<Row[]> {
  const plist = await readRawFile("/System/Library/CoreServices/SystemVersion.plist");

  if (!plist.content) {
    return [];
  }

  const pairs = [...plist.content.matchAll(/<key>(\w+)<\/key>\s*<string>([^<]*)<\/string>/g)];

  return pairs.map((match) => ({ label: match[1] ?? "", value: match[2] ?? "" }));
}

function getLibc(report: object): string | undefined {
  const header = "header" in report ? report.header : undefined;
  const hasLibc = typeof header === "object" && header !== null && "glibcVersionRuntime" in header;

  if (!hasLibc || typeof header.glibcVersionRuntime !== "string") {
    return undefined;
  }

  return header.glibcVersionRuntime;
}

function getUname(): Row[] {
  return [
    { label: "Kernel name", value: os.type() },
    { label: "Hostname", value: os.hostname() },
    { label: "Kernel release", value: os.release() },
    { label: "Kernel version", value: os.version() },
    { label: "Machine", value: os.machine() },
    { label: "Platform", value: os.platform() },
    { label: "Architecture", value: os.arch() },
    { label: "Endianness", value: os.endianness() },
    { label: "Uptime", value: formatDuration(os.uptime()) },
    { label: "Load average (1, 5, 15 min)", value: os.loadavg().map((load) => load.toFixed(2)).join(", ") },
    { label: "Home directory", value: os.homedir() },
    { label: "Temp directory", value: os.tmpdir() },
  ];
}

function getMemory(): Row[] {
  const total = os.totalmem();
  const free = os.freemem();
  const usage = process.memoryUsage();

  return [
    { label: "Total", value: formatBytes(total) },
    { label: "Free", value: formatBytes(free) },
    { label: "Used", value: `${formatBytes(total - free)} (${(((total - free) / total) * 100).toFixed(1)}%)` },
    { label: "Process RSS", value: formatBytes(usage.rss) },
    { label: "Process heap used", value: formatBytes(usage.heapUsed) },
    { label: "Process heap total", value: formatBytes(usage.heapTotal) },
    { label: "Process external", value: formatBytes(usage.external) },
    { label: "Process array buffers", value: formatBytes(usage.arrayBuffers) },
    { label: "Constrained memory", value: formatLimit(process.constrainedMemory(), total) },
    { label: "Available memory", value: formatBytes(process.availableMemory()) },
  ];
}

async function getDisk(): Promise<Row[]> {
  const mounts = ["/", os.tmpdir(), process.cwd()];
  const stats = await Promise.all(mounts.map(readDiskStats));

  return stats.flat();
}

async function readDiskStats(path: string): Promise<Row[]> {
  try {
    const stats = await statfs(path);
    const total = stats.blocks * stats.bsize;
    const free = stats.bavail * stats.bsize;

    return [{ label: path, value: `${formatBytes(free)} free of ${formatBytes(total)}` }];
  } catch (error) {
    return [{ label: path, value: `Cannot read: ${String(error)}` }];
  }
}

function getLimits(files: RawFile[]): Row[] {
  const cgroupFiles = files.filter((file) => file.path.startsWith("/sys/fs/cgroup/"));
  const rows = cgroupFiles.map((file) => ({ label: file.path, value: file.content?.trim() ?? "Not available" }));
  const resources = process.resourceUsage();

  return [
    ...rows,
    { label: "User CPU time", value: `${(resources.userCPUTime / 1000).toFixed(1)} ms` },
    { label: "System CPU time", value: `${(resources.systemCPUTime / 1000).toFixed(1)} ms` },
    { label: "Max RSS", value: formatBytes(resources.maxRSS * 1024) },
    { label: "Voluntary context switches", value: String(resources.voluntaryContextSwitches) },
    { label: "Involuntary context switches", value: String(resources.involuntaryContextSwitches) },
  ];
}

function getNetwork(): Row[] {
  return Object.entries(os.networkInterfaces()).flatMap(([name, addresses]) =>
    (addresses ?? []).map((address) => ({
      label: name,
      value: `${address.family} ${address.cidr ?? address.address} mac ${address.mac}${address.internal ? " internal" : ""}`,
    })),
  );
}

function getProcess(): Row[] {
  const user = os.userInfo();

  return [
    { label: "PID", value: String(process.pid) },
    { label: "Parent PID", value: String(process.ppid) },
    { label: "User", value: `${user.username} (uid ${user.uid}, gid ${user.gid})` },
    { label: "Shell", value: user.shell ?? "none" },
    { label: "Working directory", value: process.cwd() },
    { label: "Executable", value: process.execPath },
    { label: "Arguments", value: process.argv.join(" ") },
    { label: "Exec arguments", value: process.execArgv.join(" ") || "none" },
    { label: "Process uptime", value: formatDuration(process.uptime()) },
    { label: "Process title", value: process.title },
    { label: "Time zone", value: Intl.DateTimeFormat().resolvedOptions().timeZone },
  ];
}

function formatLimit(limit: number, total: number): string {
  const hasLimit = limit > 0 && limit < total;

  if (!hasLimit) {
    return "No limit";
  }

  return formatBytes(limit);
}

function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = Math.floor(seconds % 60);

  return `${days}d ${hours}h ${minutes}m ${rest}s`;
}
