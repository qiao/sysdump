import { createServer } from "node:http";

import { renderPage } from "./render.ts";
import { collectSystemSnapshot } from "./system.ts";

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
