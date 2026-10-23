# sysdump

A minimal probe for cloud runtimes. Deploy it to a platform, open the page, and see what your code really gets: request headers, environment variables, OS, CPU, memory, disk, network, and process data.

Values are not redacted. Keep the page behind authentication.

It is one file, `server.ts`, with no runtime dependencies. Node.js 24 runs the TypeScript source directly.

```sh
node server.ts                                   # http://127.0.0.1:3000
docker build -t sysdump . && docker run -p 3000:3000 sysdump
```
