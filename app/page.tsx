import { headers } from "next/headers";

import { collectSystemSnapshot, formatBytes, type Row } from "@/lib/system";

/**
 * Shows the request headers, all environment variables, and host data for the current request.
 * Next.js renders the page on each request because it reads the request headers.
 *
 * @returns The page.
 *
 * @example
 * // Open http://localhost:3000 in a browser.
 */
export default async function Page() {
  const requestHeaders = await headers();
  const snapshot = await collectSystemSnapshot();
  const headerRows: Row[] = [...requestHeaders.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const region = process.env.VERCEL_REGION ?? "local";
  const environment = process.env.VERCEL_ENV ?? "development";
  const memoryLimit = process.constrainedMemory();

  return (
    <div className="vbg-shell">
      <a className="vbg-skip-link" href="#main">
        Skip to content
      </a>

      <main id="main">
        <section className="vbg-opening">
          <div className="vbg-opening-claim">
            <h1 className="vbg-title">What this function sees on each request</h1>
            <p className="vbg-meta">
              Environment <span className="vbg-mono">{environment}</span>, collected at{" "}
              <time className="vbg-mono" dateTime={snapshot.collectedAt}>
                {snapshot.collectedAt}
              </time>
            </p>
            <p className="vbg-lede">
              This page shows {headerRows.length} request headers, {snapshot.env.length} environment variables, and
              the host data for one request. The values are not redacted. Anyone who can open this page can read
              every secret in the environment.
            </p>
          </div>

          <div className="vbg-opening-proof">
            <div className="vbg-stat-strip">
              <div className="vbg-stat">
                <p className="vbg-stat-label">Region</p>
                <p className="vbg-stat-value vbg-mono">{region}</p>
                <p className="vbg-stat-detail">{snapshot.uname[1]?.value}</p>
              </div>
              <div className="vbg-stat">
                <p className="vbg-stat-label">CPUs</p>
                <p className="vbg-stat-value">{snapshot.cpu.count}</p>
                <p className="vbg-stat-detail">{snapshot.cpu.model}</p>
              </div>
              <div className="vbg-stat">
                <p className="vbg-stat-label">Memory</p>
                <p className="vbg-stat-value">{formatBytes(memoryLimit || snapshot.memoryTotal)}</p>
                <p className="vbg-stat-detail">{memoryLimit ? "Limit for this process" : "Total on the host"}</p>
              </div>
              <div className="vbg-stat">
                <p className="vbg-stat-label">Node.js</p>
                <p className="vbg-stat-value">{process.versions.node}</p>
                <p className="vbg-stat-detail">
                  {snapshot.uname[0]?.value} {snapshot.uname[4]?.value}
                </p>
              </div>
            </div>
          </div>
        </section>

        <RowSection
          id="headers"
          title="Request headers that reached the function"
          caption="Header names are in lowercase. The proxy adds the x-vercel-* headers."
          keyLabel="Header"
          rows={headerRows}
        />
        <RowSection
          id="env"
          title="Environment variables in the process"
          caption="All values from process.env, in alphabetical order, with no redaction."
          keyLabel="Variable"
          rows={snapshot.env}
        />
        <RowSection
          id="os"
          title="Operating system"
          caption="Fields from /etc/os-release on Linux, or SystemVersion.plist on macOS."
          keyLabel="Field"
          rows={snapshot.os}
        />
        <RowSection id="uname" title="Kernel and host" keyLabel="Field" rows={snapshot.uname} mono={false} />
        <RowSection
          id="cpu"
          title={`${snapshot.cpu.count} CPUs at ${snapshot.cpu.speedMhz} MHz`}
          caption="One row for each logical CPU that os.cpus() returns."
          keyLabel="CPU"
          rows={snapshot.cpu.cores}
        />
        <RowSection id="memory" title="Memory of the host and the process" keyLabel="Measure" rows={snapshot.memory} mono={false} />
        <RowSection id="disk" title="Disk space" keyLabel="Path" rows={snapshot.disk} />
        <RowSection
          id="limits"
          title="Resource limits and usage"
          caption="The cgroup files exist only on Linux hosts."
          keyLabel="Measure"
          rows={snapshot.limits}
          mono={false}
        />
        <RowSection id="network" title="Network interfaces" keyLabel="Interface" rows={snapshot.network} />
        <RowSection id="process" title="Process" keyLabel="Field" rows={snapshot.process} mono={false} />
        <RowSection id="versions" title="Runtime versions" keyLabel="Component" rows={snapshot.versions} />

      </main>

      <footer className="vbg-footer">
        <span className="vbg-logo" role="img" aria-label="Vercel" />
        <span>Internal diagnostic page. Do not share the URL.</span>
      </footer>
    </div>
  );
}

interface RowSectionProps {
  id: string;
  title: string;
  caption?: string;
  keyLabel: string;
  rows: Row[];
  mono?: boolean;
}

function RowSection({ id, title, caption, keyLabel, rows, mono = true }: RowSectionProps) {
  const valueClass = mono ? "vbg-custom-value vbg-mono" : "vbg-custom-value";
  const keyClass = mono ? "vbg-custom-key vbg-mono" : "vbg-custom-key";

  return (
    <section className="vbg-section" aria-labelledby={`${id}-title`}>
      <div className="vbg-flow">
        <h2 id={`${id}-title`} className="vbg-heading-24">
          {title}
        </h2>
        {caption && <p className="vbg-caption">{caption}</p>}
        <div className="vbg-table-wrap">
          <table>
            <caption className="vbg-visually-hidden">
              {title}, {rows.length} rows
            </caption>
            <thead>
              <tr>
                <th scope="col">{keyLabel}</th>
                <th scope="col">Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.label}-${index}`}>
                  <th scope="row" className={keyClass}>
                    {row.label}
                  </th>
                  <td className={valueClass}>{row.value || <span className="vbg-meta">empty</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
