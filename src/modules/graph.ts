import * as fs from "fs";
import madge from "madge";
import path from "path";
import { AffectedPage, DependencyGraph, NextAffectedConfig } from "../types";
import { ReExportGraphs } from "./exports";
import {
  classifyAppWideFile,
  classifyPageFile,
  findAppWideFiles,
  isWithin,
  normalizePath,
  RouteFile,
  ShellFile,
  shouldExcludeModule,
} from "./utils";

const TS_CONFIG_FILES = ["tsconfig.json", "tsconfig.base.json", "jsconfig.json"];

export async function getDependencyGraph(
  projectDir: string,
  config: NextAffectedConfig
): Promise<DependencyGraph> {
  const pagesDirectories = config.pagesDirectories
    .map((dir) => path.resolve(projectDir, dir))
    .filter((dir) => fs.existsSync(dir));

  if (pagesDirectories.length === 0) {
    throw new Error(
      `No pages directories found in ${projectDir} (checked: ${config.pagesDirectories.join(", ")})`
    );
  }

  const appWideFiles = [
    ...new Set(pagesDirectories.flatMap((dir) => findAppWideFiles(dir, projectDir, config))),
  ];

  const res = await madge([...pagesDirectories, ...appWideFiles], {
    baseDir: projectDir,
    fileExtensions: ["js", "jsx", "ts", "tsx"],
    includeNpm: false,
    tsConfig: findTsConfig(projectDir),
  });

  const dependencyGraph: DependencyGraph = res.obj();
  const isExcluded = (moduleId: string) =>
    shouldExcludeModule(
      normalizePath(path.resolve(projectDir, moduleId)),
      config,
      projectDir
    );

  // Exclude modules and their dependencies based on excludedPaths
  const filteredDependencyGraph: DependencyGraph = {};
  for (const [moduleId, dependencies] of Object.entries(dependencyGraph)) {
    if (isExcluded(moduleId)) {
      continue;
    }
    filteredDependencyGraph[moduleId] = dependencies.filter(
      (dependency) => !isExcluded(dependency)
    );
  }

  return filteredDependencyGraph;
}

export function findTsConfig(projectDir: string): string | undefined {
  for (let dir = path.resolve(projectDir); ; dir = path.dirname(dir)) {
    const found = TS_CONFIG_FILES.map((name) => path.join(dir, name)).find(
      (file) => fs.existsSync(file)
    );
    if (found) {
      return found;
    }
    if (path.dirname(dir) === dir) {
      return undefined;
    }
  }
}

export function buildDependentsIndex(
  dependencyGraph: DependencyGraph,
  projectDir: string
): Map<string, string[]> {
  const dependents = new Map<string, string[]>();

  for (const [moduleId, dependencies] of Object.entries(dependencyGraph)) {
    const modulePath = normalizePath(path.resolve(projectDir, moduleId));
    for (const dependency of dependencies) {
      const dependencyPath = normalizePath(path.resolve(projectDir, dependency));
      const existing = dependents.get(dependencyPath);
      if (existing) {
        existing.push(modulePath);
      } else {
        dependents.set(dependencyPath, [modulePath]);
      }
    }
  }

  return dependents;
}

export function collectDependents(
  seeds: string[],
  dependents: Map<string, string[]>,
  maxDepth: number = Infinity,
  firstHop: (seed: string) => string[] = (seed) => dependents.get(seed) ?? [],
  partialSeeds: ReadonlySet<string> = new Set()
): Set<string> {
  const reached = new Set(seeds);
  const pending = new Set(partialSeeds);
  let frontier = [...reached];

  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const modulePath of frontier) {
      const hop = depth === 1 ? firstHop(modulePath) : dependents.get(modulePath) ?? [];
      for (const dependent of hop) {
        if (!reached.has(dependent) || pending.delete(dependent)) {
          reached.add(dependent);
          next.push(dependent);
        }
      }
    }
    frontier = next;
  }

  return reached;
}

function buildLookupIndex(
  lookups: ReExportGraphs["lookups"],
  projectDir: string
): Map<string, Map<string, string[]>> {
  const index = new Map<string, Map<string, string[]>>();

  for (const [moduleId, files] of Object.entries(lookups)) {
    const modulePath = normalizePath(path.resolve(projectDir, moduleId));
    for (const [file, names] of Object.entries(files)) {
      const byName = index.get(file) ?? new Map<string, string[]>();
      index.set(file, byName);
      for (const name of names) {
        const importers = byName.get(name);
        if (importers) {
          importers.push(modulePath);
        } else {
          byName.set(name, [modulePath]);
        }
      }
    }
  }

  return index;
}

function collectTracedDependents(
  seeds: string[],
  rawDependents: Map<string, string[]>,
  reExports: ReExportGraphs,
  changedExports: Map<string, string[]>,
  projectDir: string,
  maxDepth: number
): Set<string> {
  const traced = buildDependentsIndex(reExports.traced, projectDir);
  const through = buildDependentsIndex(reExports.through, projectDir);
  const lookups = buildLookupIndex(reExports.lookups, projectDir);

  const firstHop = (seed: string): string[] => {
    const names = changedExports.get(seed);
    if (!names) {
      return [traced, rawDependents, through].flatMap((index) => index.get(seed) ?? []);
    }
    if (names.length === 0) return [];
    const byName = lookups.get(seed);
    return [...names, "*"].flatMap((name) => byName?.get(name) ?? []);
  };

  return collectDependents(
    seeds,
    traced,
    maxDepth,
    firstHop,
    new Set(seeds.filter((seed) => changedExports.has(seed)))
  );
}

export function findAffectedPages(
  dependencyGraph: DependencyGraph,
  changedFiles: string[],
  projectDir: string,
  config: NextAffectedConfig,
  maxDepth: number = Infinity,
  reExports?: ReExportGraphs,
  changedExports: Map<string, string[]> = new Map()
): AffectedPage[] {
  const seeds = changedFiles
    .map((file) => normalizePath(path.resolve(projectDir, file)))
    .filter((file) => !shouldExcludeModule(file, config, projectDir));

  const rawDependents = buildDependentsIndex(dependencyGraph, projectDir);
  const reached = reExports
    ? collectTracedDependents(seeds, rawDependents, reExports, changedExports, projectDir, maxDepth)
    : collectDependents(seeds, rawDependents, maxDepth);

  const affected = new Map<string, AffectedPage>();
  const record = (file: string, page: RouteFile) => {
    affected.set(file, {
      route: page.route,
      file: path.relative(projectDir, file).replace(/\\/g, "/"),
      pagesDirectory: page.pagesDirectory,
    });
  };

  const shells: ShellFile[] = [];
  for (const file of reached) {
    const page = classifyPageFile(file, projectDir, config);
    if (page?.kind === "route") {
      record(file, page);
    } else if (page?.kind === "shell") {
      shells.push(page);
    }
    shells.push(...classifyAppWideFile(file, projectDir, config));
  }

  if (shells.length > 0) {
    for (const moduleId of Object.keys(dependencyGraph)) {
      const file = normalizePath(path.resolve(projectDir, moduleId));
      const page = classifyPageFile(file, projectDir, config);
      if (
        page?.kind === "route" &&
        shells.some(
          (shell) =>
            shell.pagesDirectory === page.pagesDirectory &&
            (page.wrappedByShells || shell.includesHandlers) &&
            isWithin(file, shell.scope)
        )
      ) {
        record(file, page);
      }
    }
  }

  return [...affected.values()].sort(
    (a, b) =>
      a.pagesDirectory.localeCompare(b.pagesDirectory) ||
      a.route.localeCompare(b.route) ||
      a.file.localeCompare(b.file)
  );
}
