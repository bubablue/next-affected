import * as fs from "fs";
import path from "path";
import { NextAffectedConfig } from "../types";
import { DEFAULT_CONFIG, resolveConfig } from "./config";

export type RouteFile = {
  kind: "route";
  route: string;
  pagesDirectory: string;
  wrappedByShells: boolean;
};

export type ShellFile = {
  kind: "shell";
  scope: string;
  pagesDirectory: string;
  includesHandlers: boolean;
};

export type PageFile = RouteFile | ShellFile;

type InterceptionMarker = [marker: string, levels: number | "root"];

interface Conventions {
  pageExtensions: string[];
  testFiles: RegExp[];
  appWideFiles: Set<string>;
  app: {
    directoryNames: Set<string>;
    pageFiles: Set<string>;
    handlerFiles: Set<string>;
    layoutFiles: Set<string>;
    metadataFiles: Map<string, string>;
    hiddenSegments: RegExp[];
    privateSegments: RegExp[];
    slotSegments: RegExp[];
    interceptionMarkers: InterceptionMarker[];
  };
  pages: {
    layoutFiles: Set<string>;
    handlerDirectories: string[];
    indexFiles: Set<string>;
  };
}

const compiled = new WeakMap<NextAffectedConfig, Conventions>();

function patterns(sources: string[]): RegExp[] {
  return sources.flatMap((source) => {
    try {
      return [new RegExp(source)];
    } catch {
      return [];
    }
  });
}

function conventionsOf(config: NextAffectedConfig): Conventions {
  const cached = compiled.get(config);
  if (cached) return cached;

  const resolved = resolveConfig(config);
  const conventions: Conventions = {
    pageExtensions: [...resolved.pageExtensions].sort((a, b) => b.length - a.length),
    testFiles: patterns(resolved.testFiles),
    appWideFiles: new Set(resolved.appWideFiles),
    app: {
      directoryNames: new Set(resolved.appRouter.directoryNames),
      pageFiles: new Set(resolved.appRouter.pageFiles),
      handlerFiles: new Set(resolved.appRouter.handlerFiles),
      layoutFiles: new Set(resolved.appRouter.layoutFiles),
      metadataFiles: new Map(Object.entries(resolved.appRouter.metadataFiles)),
      hiddenSegments: patterns(resolved.appRouter.hiddenSegments),
      privateSegments: patterns(resolved.appRouter.privateSegments),
      slotSegments: patterns(resolved.appRouter.slotSegments),
      interceptionMarkers: Object.entries(resolved.appRouter.interceptionMarkers).sort(
        ([a], [b]) => b.length - a.length
      ),
    },
    pages: {
      layoutFiles: new Set(resolved.pagesRouter.layoutFiles),
      handlerDirectories: resolved.pagesRouter.handlerDirectories,
      indexFiles: new Set(resolved.pagesRouter.indexFiles),
    },
  };
  compiled.set(config, conventions);
  return conventions;
}

const matchesAny = (value: string, regexes: RegExp[]) => regexes.some((regex) => regex.test(value));

export function normalizePath(filePath: string): string {
  return path.resolve(filePath).replace(/\\/g, "/");
}

export function isWithin(filePath: string, directory: string): boolean {
  const file = normalizePath(filePath);
  const dir = normalizePath(directory);
  return file === dir || file.startsWith(dir.endsWith("/") ? dir : `${dir}/`);
}

function labelOf(pagesDirectory: string, projectDir: string): string {
  return path.relative(projectDir, pagesDirectory).replace(/\\/g, "/") || ".";
}

function pagesDirectoriesOf(projectDir: string, config: NextAffectedConfig): string[] {
  return config.pagesDirectories.map((dir) => normalizePath(path.resolve(projectDir, dir)));
}

function findPagesDirectory(
  filePath: string,
  projectDir: string,
  config: NextAffectedConfig
): string | undefined {
  return pagesDirectoriesOf(projectDir, config)
    .filter((dir) => filePath !== dir && isWithin(filePath, dir))
    .sort((a, b) => b.length - a.length)[0];
}

function stripPageExtension(fileName: string, conventions: Conventions): string | null {
  const extension = conventions.pageExtensions.find((ext) => fileName.endsWith(`.${ext}`));
  return extension ? fileName.slice(0, -(extension.length + 1)) : null;
}

function isAppWideFileName(fileName: string, conventions: Conventions): boolean {
  const withoutPageExtension = stripPageExtension(fileName, conventions);
  const dot = fileName.lastIndexOf(".");
  const withoutExtension = dot > 0 ? fileName.slice(0, dot) : fileName;
  return (
    (withoutPageExtension !== null && conventions.appWideFiles.has(withoutPageExtension)) ||
    conventions.appWideFiles.has(withoutExtension)
  );
}

function joinRoute(base: string, segment: string): string {
  return base === "/" ? `/${segment}` : `${base}/${segment}`;
}

function splitInterception(
  segment: string,
  markers: InterceptionMarker[]
): { levels: number | "root"; rest: string } | null {
  let rest = segment;
  let levels = 0 as number | "root";
  let matched = false;

  for (let marker = markers.find(([m]) => rest.startsWith(m)); marker; marker = markers.find(([m]) => rest.startsWith(m))) {
    matched = true;
    rest = rest.slice(marker[0].length);
    levels = marker[1] === "root" || levels === "root" ? "root" : levels + marker[1];
  }

  return matched && rest ? { levels, rest } : null;
}

export function toAppRoute(directory: string, config: NextAffectedConfig = DEFAULT_CONFIG): string {
  const { app } = conventionsOf(config);
  const segments: string[] = [];

  for (const segment of directory.split("/").filter(Boolean)) {
    const interception = splitInterception(segment, app.interceptionMarkers);
    if (interception) {
      if (interception.levels === "root") {
        segments.length = 0;
      } else {
        segments.splice(Math.max(0, segments.length - interception.levels));
      }
      segments.push(interception.rest);
      continue;
    }

    if (!matchesAny(segment, app.hiddenSegments)) {
      segments.push(segment);
    }
  }

  return `/${segments.join("/")}`;
}

function classifyAppRouterFile(
  name: string,
  directory: string,
  pagesDirectory: string,
  label: string,
  config: NextAffectedConfig
): PageFile | null {
  const { app } = conventionsOf(config);
  const segments = directory ? directory.split("/") : [];

  if (segments.some((segment) => matchesAny(segment, app.privateSegments))) {
    return null;
  }
  if (app.pageFiles.has(name) || app.handlerFiles.has(name)) {
    return {
      kind: "route",
      route: toAppRoute(directory, config),
      pagesDirectory: label,
      wrappedByShells: app.pageFiles.has(name),
    };
  }
  const metadataRoute = app.metadataFiles.get(name);
  if (metadataRoute) {
    return {
      kind: "route",
      route: joinRoute(toAppRoute(directory, config), metadataRoute),
      pagesDirectory: label,
      wrappedByShells: false,
    };
  }
  if (app.layoutFiles.has(name)) {
    const lastSegment = segments[segments.length - 1];
    const slotRoot = lastSegment !== undefined && matchesAny(lastSegment, app.slotSegments);
    const scopeSegments = slotRoot ? segments.slice(0, -1) : segments;
    return {
      kind: "shell",
      scope: [pagesDirectory, ...scopeSegments].join("/"),
      pagesDirectory: label,
      includesHandlers: false,
    };
  }
  return null;
}

function classifyPagesRouterFile(
  name: string,
  directory: string,
  pagesDirectory: string,
  label: string,
  config: NextAffectedConfig
): PageFile {
  const { pages } = conventionsOf(config);

  if (directory === "" && pages.layoutFiles.has(name)) {
    return { kind: "shell", scope: pagesDirectory, pagesDirectory: label, includesHandlers: false };
  }

  const segments = directory ? directory.split("/") : [];
  if (!pages.indexFiles.has(name)) {
    segments.push(name);
  }

  return {
    kind: "route",
    route: `/${segments.join("/")}`,
    pagesDirectory: label,
    wrappedByShells: !pages.handlerDirectories.some(
      (handlerDirectory) => directory === handlerDirectory || directory.startsWith(`${handlerDirectory}/`)
    ),
  };
}

export function classifyPageFile(
  modulePath: string,
  projectDir: string,
  config: NextAffectedConfig
): PageFile | null {
  const conventions = conventionsOf(config);
  const filePath = normalizePath(modulePath);
  const pagesDirectory = findPagesDirectory(filePath, projectDir, config);

  if (!pagesDirectory) {
    return null;
  }

  const relativeFile = filePath.slice(pagesDirectory.length + 1);
  const name = stripPageExtension(path.posix.basename(relativeFile), conventions);
  if (name === null || matchesAny(relativeFile, conventions.testFiles)) {
    return null;
  }

  const relativeDir = path.posix.dirname(relativeFile);
  const directory = relativeDir === "." ? "" : relativeDir;
  const label = labelOf(pagesDirectory, projectDir);

  return conventions.app.directoryNames.has(path.posix.basename(pagesDirectory))
    ? classifyAppRouterFile(name, directory, pagesDirectory, label, config)
    : classifyPagesRouterFile(name, directory, pagesDirectory, label, config);
}

export function classifyAppWideFile(
  modulePath: string,
  projectDir: string,
  config: NextAffectedConfig
): ShellFile[] {
  const filePath = normalizePath(modulePath);
  const fileDirectory = path.posix.dirname(filePath);

  if (
    !isAppWideFileName(path.posix.basename(filePath), conventionsOf(config)) ||
    !isWithin(fileDirectory, projectDir)
  ) {
    return [];
  }

  return pagesDirectoriesOf(projectDir, config)
    .filter((pagesDirectory) => pagesDirectory !== fileDirectory && isWithin(pagesDirectory, fileDirectory))
    .map((pagesDirectory) => ({
      kind: "shell",
      scope: pagesDirectory,
      pagesDirectory: labelOf(pagesDirectory, projectDir),
      includesHandlers: true,
    }));
}

export function findAppWideFiles(
  pagesDirectory: string,
  projectDir: string,
  config: NextAffectedConfig
): string[] {
  const conventions = conventionsOf(config);
  const root = normalizePath(projectDir);
  const files: string[] = [];

  for (let dir = path.posix.dirname(normalizePath(pagesDirectory)); isWithin(dir, root); dir = path.posix.dirname(dir)) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      entries = [];
    }
    for (const entry of entries) {
      if (entry.isFile() && isAppWideFileName(entry.name, conventions)) {
        files.push(`${dir}/${entry.name}`);
      }
    }
    if (dir === root) break;
  }

  return files;
}

export function shouldExcludeModule(
  modulePath: string,
  config: NextAffectedConfig,
  projectDir: string
): boolean {
  // Check if the module has an excluded extension
  if (config.excludedExtensions.some((ext) => modulePath.endsWith(ext))) {
    return true;
  }

  // Check if the module is within any of the excluded paths
  return (config.excludedPaths ?? []).some((excludedPath) =>
    isWithin(modulePath, path.resolve(projectDir, excludedPath))
  );
}
