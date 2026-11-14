#!/usr/bin/env node

import { Command } from "commander";
import * as fs from "fs";
import path from "path";
import { initConfig } from "./modules/config";
import { runNextAffected, RunOptions } from "./modules/run";

const { version } = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf-8")
);

const DESCRIPTION = "List Next.js pages affected by changes";

export const EXAMPLES = [
  "",
  "Examples:",
  "  $ next-affected src/components/Button.tsx",
  "  $ next-affected --base main",
  "  $ next-affected --base commit1 --head commit2",
  "  $ next-affected --base main --uncommitted",
  "  $ next-affected --only-uncommitted",
  "  $ next-affected --base main --pages",
  "  $ next-affected --base main --files --pages",
  "  $ next-affected --base main --json",
].join("\n");

export function parseDepth(value: string): number | undefined {
  const depth = Number(value);
  if (!Number.isInteger(depth) || depth < 0) {
    console.error(`Error: --depth must be a non-negative integer, got "${value}". Ignoring it.`);
    return undefined;
  }
  return depth;
}

function withRunOptions(command: Command): Command {
  return command
    .argument("[componentPath]", "Changed file to trace instead of a git diff")
    .option("--project <path>", "Path to the Next.js project", ".")
    .option("-b, --base <commit>", "Base commit or branch")
    .option("-h, --head <commit>", "Head commit or branch", "HEAD")
    .option("-d, --depth <number>", "Max depth for dependency traversal", parseDepth)
    .option("-v, --verbose", "Enable verbose logging")
    .option("-u, --uncommitted", "Include uncommitted changes (requires --base)")
    .option("-o, --only-uncommitted", "Only include uncommitted changes")
    .option("-f, --files", "Print the paths of the affected files (default)")
    .option("-p, --pages", "Print the URLs of the affected pages")
    .option("--json", "Print affected pages as JSON")
    .addHelpText("after", EXAMPLES)
    .action(async (componentPath: string | undefined, options: RunOptions) => {
      await runNextAffected(componentPath, options);
    });
}

const program = new Command();

program
  .name("next-affected")
  .description(DESCRIPTION)
  .version(version)
  .helpOption("--help", "Display help")
  .enablePositionalOptions();

program
  .command("init")
  .description("Initialize next-affected configuration")
  .action(() => {
    initConfig();
  });

withRunOptions(program.command("run").description(DESCRIPTION));
withRunOptions(program);

program.parseAsync(process.argv);

export default program;
