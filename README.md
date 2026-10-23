# sysdump

A page that dumps everything about the environment it runs in: request headers, all environment variables, OS, CPU, memory, disk, network, and process data.

Values are not redacted. Keep the page behind authentication.

It is one file, `server.ts`, with no runtime dependencies. Node.js 24 runs the TypeScript source directly.

```sh
node server.ts                                   # http://127.0.0.1:3000
docker build -t sysdump . && docker run -p 3000:3000 sysdump
```

Link to a section with `#env`, or to one row with `#env-PATH`.
