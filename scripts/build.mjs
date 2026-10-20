import { cp, rm } from "node:fs/promises";
import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");
const outdir = "dist/extension";

await rm(outdir, { recursive: true, force: true });
await cp("static", outdir, { recursive: true });

const options = {
  entryPoints: ["background", "popup", "options", "blocked"].map((name) => `src/extension/${name}.ts`),
  outdir,
  bundle: true,
  format: "esm",
  target: "chrome120",
  logLevel: "info",
};

if (watch) {
  const context = await esbuild.context(options);
  await context.watch();
} else {
  await esbuild.build(options);
}
