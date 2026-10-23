import { readFile, statfs } from "node:fs/promises";
import os from "node:os";

/** A label and value pair that the page shows as one table row. */
export interface Row {
  label: string;
  value: string;
}

/** The content of one system file. `content` is `null` when the file cannot be read. */
interface RawFile {
  path: string;
  content: string | null;
}

/** All system data that one request collects. */
export interface SystemSnapshot {
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
export async function collectSystemSnapshot(): Promise<SystemSnapshot> {
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
export function formatBytes(bytes: number): string {
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
