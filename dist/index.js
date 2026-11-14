#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXAMPLES = void 0;
exports.parseDepth = parseDepth;
const commander_1 = require("commander");
const fs = __importStar(require("fs"));
const path_1 = __importDefault(require("path"));
const config_1 = require("./modules/config");
const run_1 = require("./modules/run");
const { version } = JSON.parse(fs.readFileSync(path_1.default.join(__dirname, "..", "package.json"), "utf-8"));
const DESCRIPTION = "List Next.js pages affected by changes";
exports.EXAMPLES = [
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
function parseDepth(value) {
    const depth = Number(value);
    if (!Number.isInteger(depth) || depth < 0) {
        console.error(`Error: --depth must be a non-negative integer, got "${value}". Ignoring it.`);
        return undefined;
    }
    return depth;
}
function withRunOptions(command) {
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
        .addHelpText("after", exports.EXAMPLES)
        .action(async (componentPath, options) => {
        await (0, run_1.runNextAffected)(componentPath, options);
    });
}
const program = new commander_1.Command();
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
    (0, config_1.initConfig)();
});
withRunOptions(program.command("run").description(DESCRIPTION));
withRunOptions(program);
program.parseAsync(process.argv);
exports.default = program;
