#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const config_1 = require("./modules/config");
const run_1 = require("./modules/run");
const program = new commander_1.Command();
program
    .name("next-affected")
    .description("List Next.js pages affected by changes")
    .version("0.1.1");
program
    .command("init")
    .description("Initialize next-affected configuration")
    .action(() => {
    (0, config_1.initConfig)();
});
program
    .command("run [componentPath]")
    .description("List Next.js pages affected by changes")
    .option("-p, --project <path>", "Path to the Next.js project", ".")
    .option("-b, --base <commit>", "Base commit or branch")
    .option("-h, --head <commit>", "Head commit or branch", "HEAD")
    .option("-d, --depth <number>", "Max depth for dependency traversal", parseInt)
    .option("-v, --verbose", "Enable verbose logging")
    .option("-u, --uncommitted", "Include uncommitted changes")
    .option("-o, --only-uncommitted", "Only include uncommitted changes")
    .on("--help", () => {
    console.log("");
    console.log("Examples:");
    console.log("  $ next-affected run src/components/Button.tsx");
    console.log("  $ next-affected run --base main");
    console.log("  $ next-affected run --base commit1 --head commit2");
    console.log("  $ next-affected run --uncommitted");
    console.log("  $ next-affected run --only-uncommitted");
})
    .action(async (componentPath, options) => {
    await (0, run_1.runNextAffected)(componentPath, options);
});
program.parse(process.argv);
exports.default = program;
