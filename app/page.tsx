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

  const osName = findRow(snapshot.os, ["PRETTY_NAME", "ProductName"]);
  const osVersion = findRow(snapshot.os, ["ProductVersion"]);
  const osLabel = [osName, osVersion].filter(Boolean).join(" ") || os.platform();
  const memoryLimit = process.constrainedMemory();
  const sections: RowSectionProps[] = [
    { id: "headers", title: "Headers", keyLabel: "Header", rows: headerRows },
    { id: "env", title: "Environment", keyLabel: "Variable", rows: snapshot.env },
    { id: "os", title: "OS", keyLabel: "Field", rows: snapshot.os, mono: false },
    { id: "kernel", title: "Kernel", keyLabel: "Field", rows: snapshot.uname, mono: false },
    { id: "cpu", title: "CPU", keyLabel: "CPU", rows: snapshot.cpu.cores },
    { id: "memory", title: "Memory", keyLabel: "Measure", rows: snapshot.memory, mono: false },
    { id: "disk", title: "Disk", keyLabel: "Path", rows: snapshot.disk },
    { id: "limits", title: "Limits", keyLabel: "Measure", rows: snapshot.limits, mono: false },
    { id: "network", title: "Network", keyLabel: "Interface", rows: snapshot.network },
    { id: "process", title: "Process", keyLabel: "Field", rows: snapshot.process, mono: false },
    { id: "versions", title: "Versions", keyLabel: "Component", rows: snapshot.versions },
  ];

  return (
    <div className="vbg-shell">
      <a className="vbg-skip-link" href="#main">
        Skip to content
      </a>

      <main id="main">
        <section className="vbg-opening">
          <div className="vbg-opening-claim">
            <h1 className="vbg-title">System dump</h1>
            <nav aria-label="Sections" className="vbg-custom-nav">
              {sections.map((section) => (
                <a key={section.id} href={`#${section.id}`}>
                  {section.title}
                </a>
              ))}
            </nav>
          </div>

          <div className="vbg-opening-proof">
            <div className="vbg-stat-strip">
              <div className="vbg-stat">
                <p className="vbg-stat-label">OS</p>
                <p className="vbg-stat-value vbg-custom-fit" title={osLabel}>
                  {osLabel}
                </p>
                <p className="vbg-stat-detail vbg-mono vbg-custom-fit" title={os.hostname()}>
                  {os.hostname()}
                </p>
              </div>
              <div className="vbg-stat">
                <p className="vbg-stat-label">CPUs</p>
                <p className="vbg-stat-value">{snapshot.cpu.count}</p>
                <p className="vbg-stat-detail vbg-custom-fit" title={snapshot.cpu.model}>
                  {snapshot.cpu.model}
                </p>
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

        {sections.map((section) => (
          <RowSection key={section.id} {...section} />
        ))}
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
    <section id={id} className="vbg-section vbg-custom-section" aria-labelledby={`${id}-title`}>
      <div className="vbg-flow">
        <h2 id={`${id}-title`} className="vbg-heading-24">
          {title}
        </h2>
        <div className="vbg-table-wrap">
          <table className="vbg-custom-table">
            <caption className="vbg-visually-hidden">
              {title}, {rows.length} rows
            </caption>
            <colgroup>
              <col className="vbg-custom-key-col" />
              <col />
            </colgroup>
            <thead className="vbg-visually-hidden">
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
                  <td className={valueClass}>{row.value || <span className="vbg-custom-empty">empty</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
