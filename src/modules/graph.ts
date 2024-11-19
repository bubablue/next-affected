import * as fs from "fs";
import madge from "madge";
import path from "path";
import ts from "typescript";
import { NextAffectedConfig } from "../types";
import {
  getRouteFromPage,
  isPage,
  normalizePath,
  shouldExcludeModule,
} from "./utils";

export async function getDependencyGraph(
  projectDir: string,
  config: NextAffectedConfig
): Promise<Record<string, string[]>> {
  const tsconfigPath = findTsConfig(projectDir);
  const tsconfigDir = path.dirname(tsconfigPath);

  const parsedConfig = readTsConfig(tsconfigPath);
  const aliases = getAliasesFromTsConfig(parsedConfig, tsconfigDir);

  const possibleEntryPoints = config.pagesDirectories.map((dir) =>
    path.join(projectDir, dir)
  );

  const entryPoints = getExistingEntryPoints(possibleEntryPoints);

  if (entryPoints.length === 0) {
    throw new Error(`No valid entry points found in ${projectDir}`);
  }

  const res = await madge(entryPoints, {
    baseDir: projectDir,
    fileExtensions: ["js", "jsx", "ts", "tsx"],
    includeNpm: false,
    tsConfig: tsconfigPath,
    webpackConfig: fs.existsSync(path.join(projectDir, "next.config.js"))
      ? path.join(projectDir, "next.config.js")
      : undefined,
    alias: aliases,
  });

  const dependencyGraph = res.obj();

  // Exclude modules and their dependencies based on excludedPaths
  const filteredDependencyGraph: Record<string, string[]> = {};

  for (const module in dependencyGraph) {
    const modulePath = normalizePath(path.resolve(projectDir, module));
    if (shouldExcludeModule(modulePath, config, projectDir)) {
      continue;
    }

    const dependencies = dependencyGraph[module].filter((dep) => {
      const depPath = normalizePath(path.resolve(projectDir, dep));
      return !shouldExcludeModule(depPath, config, projectDir);
    });

    filteredDependencyGraph[module] = dependencies;
  }

  return filteredDependencyGraph;
}


function getExistingEntryPoints(entryPoints: string[]): string[] {
  return entryPoints.filter((entryPoint) => fs.existsSync(entryPoint));
}

function findTsConfig(projectDir: string): string {
  const possibleConfigs = ["tsconfig.json", "tsconfig.base.json"];

  let currentDir = projectDir;

  while (true) {
    for (const configName of possibleConfigs) {
      const tsconfigPath = path.join(currentDir, configName);
      if (fs.existsSync(tsconfigPath)) {
        return tsconfigPath;
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      throw new Error("Could not find tsconfig.json or tsconfig.base.json");
    }
    currentDir = parentDir;
  }
}

function readTsConfig(tsconfigPath: string): ts.ParsedCommandLine {
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);

  if (configFile.error) {
    throw new Error(
      ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n")
    );
  }

  const configParseResult = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(tsconfigPath)
  );

  if (configParseResult.errors.length > 0) {
    const errorMessage = configParseResult.errors
      .map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n"))
      .join("\n");
    throw new Error(errorMessage);
  }

  return configParseResult;
}

function getAliasesFromTsConfig(
  parsedConfig: ts.ParsedCommandLine,
  tsconfigDir: string
): { [alias: string]: string } {
  const aliases: { [alias: string]: string } = {};

  if (parsedConfig.options.paths) {
    const paths = parsedConfig.options.paths;

    for (const aliasPattern in paths) {
      const aliasPaths = paths[aliasPattern];

      // Remove the trailing '/*' from the alias if present
      const aliasKey = aliasPattern.replace(/\/\*$/, "");

      // Assume the first path mapping is the primary one
      const targetPath = aliasPaths[0];

      // Remove the trailing '/*' and resolve the absolute path
      const targetDir = path.resolve(
        tsconfigDir,
        targetPath.replace(/\/\*$/, "")
      );

      aliases[aliasKey] = targetDir;
    }
  }

  return aliases;
}

export function findAffectedPages(
  dependencyGraph: Record<string, string[]>,
  changedComponent: string,
  projectDir: string,
  config: NextAffectedConfig,
  maxDepth: number = Infinity,
  verbose: boolean = false,
  onProgress?: (processedModules: number) => void
): string[] {
  const visited = new Set<string>();
  const affectedPages = new Set<string>();
  let processedModules = 0;

  function traverse(module: string, depth: number) {
    if (visited.has(module) || depth > maxDepth) return;

    const modulePath = normalizePath(path.resolve(projectDir, module));

    if (shouldExcludeModule(modulePath, config, projectDir)) {
      return;
    }

    visited.add(module);

    if (isPage(modulePath, projectDir, config)) {
      const route = getRouteFromPage(modulePath, projectDir, config);
      affectedPages.add(route);
    }

    const dependents = Object.keys(dependencyGraph).filter((key) => {
      const deps = dependencyGraph[key];
      if (!deps) return false;

      const normalizedDeps = deps.map((dep) =>
        normalizePath(path.resolve(projectDir, dep))
      );
      return normalizedDeps.includes(modulePath);
    });

    dependents.forEach((dependent) => {
      const dependentPath = normalizePath(path.resolve(projectDir, dependent));
      if (shouldExcludeModule(dependentPath, config, projectDir)) {
        return;
      }
      traverse(dependent, depth + 1);
    });

    processedModules++;

    if (onProgress) {
      onProgress(1);
    }

    if (verbose && processedModules % 100 === 0) {
      console.log(`Processed ${processedModules} modules...`);
    }
  }

  traverse(changedComponent, 0);

  if (verbose) {
    console.log(`Total modules processed: ${processedModules}`);
  }

  return Array.from(affectedPages);
}
