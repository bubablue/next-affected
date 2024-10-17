#!/usr/bin/env node

import { Command } from "commander";
import { initConfig } from "./modules/config";
import { runNextAffected } from "./modules/run";

const program = new Command();

program
  .name("next-affected")
  .description("List Next.js pages affected by changes")
  .version("1.0.0");

program
  .command("init")
  .description("Initialize next-affected configuration")
  .action(() => {
    initConfig();
  });

program
  .command("run [componentPath]")
  .description("List Next.js pages affected by changes")
  .option("-p, --project <path>", "Path to the Next.js project", ".")
  .option("-b, --base <commit>", "Base commit or branch")
  .option("-h, --head <commit>", "Head commit or branch", "HEAD")
  .option(
    "-d, --depth <number>",
    "Max depth for dependency traversal",
    parseInt
  )
  .option("-v, --verbose", "Enable verbose logging")
  .on("--help", () => {
    console.log("");
    console.log("Examples:");
    console.log("  $ next-affected run src/components/Button.tsx");
    console.log("  $ next-affected run --base main");
    console.log("  $ next-affected run --base commit1 --head commit2");
  })
  .action(async (componentPath: string | undefined, options: any) => {
    await runNextAffected(componentPath, options);
  });

program.parse(process.argv);

export default program;
