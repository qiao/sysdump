import type { IncomingHttpHeaders } from "node:http";
import os from "node:os";

import { formatBytes, type Row, type SystemSnapshot } from "./system.ts";

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
export function renderPage(headers: IncomingHttpHeaders, snapshot: SystemSnapshot): string {
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
