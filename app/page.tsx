import os from "node:os";

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

  const environment = process.env.NODE_ENV ?? "unknown";
  const osName = findRow(snapshot.os, ["PRETTY_NAME", "ProductName"]);
  const osVersion = findRow(snapshot.os, ["ProductVersion"]);
  const memoryLimit = process.constrainedMemory();

  return (
    <div className="vbg-shell">
      <a className="vbg-skip-link" href="#main">
        Skip to content
      </a>

      <main id="main">
        <section className="vbg-opening">
          <div className="vbg-opening-claim">
            <h1 className="vbg-title">System dump</h1>
            <p className="vbg-meta">
              <span className="vbg-mono">NODE_ENV={environment}</span>, collected at{" "}
              <time className="vbg-mono" dateTime={snapshot.collectedAt}>
                {snapshot.collectedAt}
              </time>
            </p>
          </div>

          <div className="vbg-opening-proof">
            <div className="vbg-stat-strip">
              <div className="vbg-stat">
                <p className="vbg-stat-label">OS</p>
                <p className="vbg-stat-value">{[osName, osVersion].filter(Boolean).join(" ") || os.platform()}</p>
                <p className="vbg-stat-detail vbg-mono">{os.hostname()}</p>
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
          title="Headers"
          keyLabel="Header"
          rows={headerRows}
        />
        <RowSection
          id="env"
          title="Environment"
          keyLabel="Variable"
          rows={snapshot.env}
        />
        <RowSection
          id="os"
          title="OS"
          keyLabel="Field"
          rows={snapshot.os}
        />
        <RowSection id="uname" title="Kernel" keyLabel="Field" rows={snapshot.uname} mono={false} />
        <RowSection
          id="cpu"
          title="CPU"
          keyLabel="CPU"
          rows={snapshot.cpu.cores}
        />
        <RowSection id="memory" title="Memory" keyLabel="Measure" rows={snapshot.memory} mono={false} />
        <RowSection id="disk" title="Disk" keyLabel="Path" rows={snapshot.disk} />
        <RowSection
          id="limits"
          title="Limits"
          keyLabel="Measure"
          rows={snapshot.limits}
          mono={false}
        />
        <RowSection id="network" title="Network" keyLabel="Interface" rows={snapshot.network} />
        <RowSection id="process" title="Process" keyLabel="Field" rows={snapshot.process} mono={false} />
        <RowSection id="versions" title="Versions" keyLabel="Component" rows={snapshot.versions} />

      </main>

    </div>
  );
}

function findRow(rows: Row[], labels: string[]): string | undefined {
  return rows.find((row) => labels.includes(row.label))?.value;
}

interface RowSectionProps {
  id: string;
  title: string;
  keyLabel: string;
  rows: Row[];
  mono?: boolean;
}

function RowSection({ id, title, keyLabel, rows, mono = true }: RowSectionProps) {
  const valueClass = mono ? "vbg-custom-value vbg-mono" : "vbg-custom-value";
  const keyClass = mono ? "vbg-custom-key vbg-mono" : "vbg-custom-key";

  return (
    <section className="vbg-section" aria-labelledby={`${id}-title`}>
      <div className="vbg-flow">
        <h2 id={`${id}-title`} className="vbg-heading-24">
          {title}
        </h2>
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
