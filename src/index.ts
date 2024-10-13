#!/usr/bin/env node

import { Command } from "commander";
import * as fs from "fs";
import madge from "madge";
import path from "path";
import ts from "typescript";

interface NextAffectedConfig {
  pagesDirectories: string[];
  excludedExtensions: string[];
}

const program = new Command();

program
  .name("next-affected")
  .description("List Next.js pages affected by changes to a component")
  .version("1.0.0");

program
  .command("init")
  .description("Initialize next-affected configuration")
  .action(() => {
    initConfig();
  });

program
  .command("run <componentPath>")
  .description("List Next.js pages affected by changes to a component")
  .option("-p, --project <path>", "Path to the Next.js project", ".")
  .option("-d, --depth <number>", "Max depth for dependency traversal", parseInt)
  .action(
    async (
      componentPath: string,
      options: { project: string; depth?: number }
    ) => {
      await runNextAffected(componentPath, options);
    }
  );

program.parse(process.argv);

function initConfig() {
  const configFileName = "next-affected.config.json";
  const defaultConfig = {
    pagesDirectories: ["pages", "src/pages", "app", "src/app"],
    excludedExtensions: [".css", ".scss", ".less", ".svg", ".png", ".jpg"],
  };

  if (fs.existsSync(configFileName)) {
    console.log(`${configFileName} already exists.`);
    return;
  }

  fs.writeFileSync(configFileName, JSON.stringify(defaultConfig, null, 2));
  console.log(`Created ${configFileName} with default settings.`);
}

function loadConfig(projectDir: string): NextAffectedConfig {
  const configFileName = "next-affected.config.json";
  const configFilePath = path.join(projectDir, configFileName);

  if (fs.existsSync(configFilePath)) {
    const configContent = fs.readFileSync(configFilePath, "utf-8");
    return JSON.parse(configContent) as NextAffectedConfig;
  } else {
    // Default configuration
    return {
      pagesDirectories: ["pages", "src/pages", "app", "src/app"],
      excludedExtensions: [".css", ".scss", ".less", ".svg", ".png", ".jpg"],
    };
  }
}

async function runNextAffected(
  componentPath: string,
  options: { project: string; depth?: number }
) {
  try {
    const projectDir = path.resolve(process.cwd(), options.project);
    const componentFullPath = path.resolve(process.cwd(), componentPath);
    const componentRelativePath = path.relative(projectDir, componentFullPath);

    const config = loadConfig(projectDir);

    const dependencyGraph = await getDependencyGraph(projectDir, config);

    const maxDepth = options.depth ?? Infinity;

    const affectedPages = findAffectedPages(
      dependencyGraph,
      componentRelativePath,
      maxDepth,
      projectDir,
      config
    );

    if (affectedPages.length > 0) {
      console.log("Affected Pages:");
      affectedPages.forEach((page) => console.log(page));
    } else {
      console.log("No affected pages found.");
    }
  } catch (error: any) {
    console.error("Error:", error.message);
    console.error(error);
  }
}

async function getDependencyGraph(
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
  return res.obj();
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

function findAffectedPages(
  dependencyGraph: Record<string, string[]>,
  changedComponent: string,
  maxDepth: number = Infinity,
  projectDir: string,
  config: NextAffectedConfig
): string[] {
  const visited = new Set<string>();
  const affectedPages = new Set<string>();

  function traverse(module: string, depth: number) {
    if (visited.has(module) || depth > maxDepth) return;
    visited.add(module);

    module = normalizePath(path.resolve(projectDir, module));

    if (shouldExcludeModule(module, config)) {
      return;
    }

    const dependents = Object.keys(dependencyGraph).filter((key) => {
      const deps = dependencyGraph[key];
      if (!deps) return false;

      const normalizedDeps = deps.map((dep) =>
        normalizePath(path.resolve(projectDir, dep))
      );
      return normalizedDeps.includes(module);
    });

    dependents.forEach((dependent) => {
      const normalizedDependent = normalizePath(
        path.resolve(projectDir, dependent)
      );
      if (isPage(normalizedDependent, projectDir, config)) {
        const route = getRouteFromPage(normalizedDependent, projectDir, config);
        affectedPages.add(route);
      } else {
        traverse(dependent, depth + 1);
      }
    });
  }

  traverse(changedComponent, 0);
  return Array.from(affectedPages);
}

function isPage(modulePath: string, projectDir: string, config: NextAffectedConfig): boolean {
  const normalizedPath = normalizePath(modulePath);
  const pagesDirs = config.pagesDirectories.map((dir) =>
    normalizePath(path.join(projectDir, dir))
  );
  return pagesDirs.some((dir) => normalizedPath.startsWith(dir));
}

function getRouteFromPage(pagePath: string, projectDir: string, config: NextAffectedConfig): string {
  const normalizedPagePath = normalizePath(pagePath);
  const pagesDirs = config.pagesDirectories.map((dir) =>
    normalizePath(path.join(projectDir, dir))
  );

  let route = normalizedPagePath;

  for (const dir of pagesDirs) {
    if (normalizedPagePath.startsWith(dir)) {
      route = normalizedPagePath.slice(dir.length);
      break;
    }
  }

  route = route.replace(/\.(js|jsx|ts|tsx)$/, "");
  route = route.replace(/\/index$/, "") || "/";
//   route = route.replace(/\[([^\]]+)\]/g, ":$1"); // Convert [param] to :param
  return route || "/";
}

function normalizePath(filePath: string): string {
  const absolutePath = path.resolve(filePath);
  return absolutePath.replace(/\\/g, "/");
}

function shouldExcludeModule(modulePath: string, config: NextAffectedConfig): boolean {
  return config.excludedExtensions.some((ext) => modulePath.endsWith(ext));
}
