# sysdump

A Next.js 16 app that shows, for each request, the request headers, all environment variables, and host data: OS release, `uname`, CPUs, memory, disk, cgroup limits, network interfaces, process data, runtime versions, and raw files such as `/proc/cpuinfo`.

The page does not redact the environment. Anyone who can open the page can read every secret. Put the page behind authentication before you deploy it, and give it no production secrets.

```sh
pnpm install
pnpm dev
```
