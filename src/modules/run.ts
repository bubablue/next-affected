import * as fs from "fs";
import path from "path";
import { AffectedPage } from "../types";
import { loadConfig } from "./config";
import { changedExportNames, traceReExports } from "./exports";
import { getChangedFiles } from "./git";
import { findAffectedPages, findTsConfig, getDependencyGraph } from "./graph";
import { normalizePath } from "./utils";

export interface RunOptions {
  project: string;
  base?: string;
  head?: string;
  depth?: number;
  verbose?: boolean;
  uncommitted?: boolean;
  onlyUncommitted?: boolean;
  json?: boolean;
  files?: boolean;
  pages?: boolean;
}

function printAffectedPages(
  affectedPages: AffectedPage[],
  options: RunOptions,
  showPagesDirectory: boolean
): void {
  if (options.json) {
    console.log(JSON.stringify(affectedPages, null, 2));
    return;
  }

  if (affectedPages.length === 0) {
    console.log("\nNo affected pages found.");
    return;
  }

  const printList = (title: string, lines: string[]) => {
    console.log(`\n${title}`);
    new Set(lines).forEach((line) => console.log(line));
  };

  if (options.files || !options.pages) {
    printList(
      "Affected Files:",
      affectedPages.map((page) => page.file).sort((a, b) => a.localeCompare(b))
    );
  }
  if (options.pages) {
    printList(
      "Affected Pages:",
      affectedPages.map((page) =>
        showPagesDirectory ? `${page.route} (${page.pagesDirectory})` : page.route
      )
    );
  }
}

async function analyze(
  componentPath: string | undefined,
  options: RunOptions
): Promise<AffectedPage[]> {
  if (!componentPath && !options.base && !options.onlyUncommitted) {
    throw new Error(
      "You must specify a component path, --base <commit>, or --only-uncommitted."
    );
  }

  const verbose = (message: string) => {
    if (options.verbose) console.error(message);
  };

  const projectDir = path.resolve(process.cwd(), options.project);
  if (!fs.existsSync(projectDir)) {
    throw new Error(`Project directory not found: ${projectDir}`);
  }
  const config = loadConfig(projectDir);
  const existingPagesDirectories = config.pagesDirectories.filter((dir) =>
    fs.existsSync(path.resolve(projectDir, dir))
  );

  let changedFiles: string[];
  let readPrevious: ((files: string[]) => Map<string, string | null>) | undefined;
  if (componentPath) {
    // Analyze a specific component
    changedFiles = [path.resolve(process.cwd(), componentPath)];
  } else {
    // Analyze changes between Git references
    const changes = getChangedFiles({
      base: options.base,
      head: options.head ?? "HEAD",
      projectDir,
      includeUncommitted: options.uncommitted ?? false,
      onlyUncommitted: options.onlyUncommitted ?? false,
    });
    changedFiles = changes.files;
    readPrevious = changes.readPrevious;
  }

  if (changedFiles.length === 0) {
    console.error("No changes detected.");
    printAffectedPages([], options, false);
    return [];
  }

  console.error(`Found ${changedFiles.length} changed file(s).`);
  changedFiles.forEach((file) => verbose(`  ${path.relative(projectDir, file)}`));

  console.error("Building dependency graph...");
  const dependencyGraph = await getDependencyGraph(projectDir, config);
  verbose(`Dependency graph has ${Object.keys(dependencyGraph).length} modules.`);

  const tsConfigPath = findTsConfig(projectDir);
  const reExports = traceReExports(dependencyGraph, projectDir, tsConfigPath);
  verbose("Traced named imports through re-exports.");

  const graphFiles = new Set(
    Object.keys(dependencyGraph).map((moduleId) => normalizePath(path.resolve(projectDir, moduleId)))
  );
  const changedExports = readPrevious
    ? changedExportNames(
        changedFiles.filter((file) => graphFiles.has(normalizePath(file))),
        readPrevious,
        projectDir,
        tsConfigPath
      )
    : new Map<string, string[]>();
  changedExports.forEach((names, file) =>
    verbose(`  ${path.relative(projectDir, file)}: changed exports: ${names.join(", ") || "none"}`)
  );

  const affectedPages = findAffectedPages(
    dependencyGraph,
    changedFiles,
    projectDir,
    config,
    options.depth ?? Infinity,
    reExports,
    changedExports
  );

  printAffectedPages(affectedPages, options, existingPagesDirectories.length > 1);

  return affectedPages;
}

export async function runNextAffected(
  componentPath: string | undefined,
  options: RunOptions
): Promise<AffectedPage[]> {
  try {
    return await analyze(componentPath, options);
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : String(error));
    return [];
  }
}
