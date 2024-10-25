import path from "path";
import { NextAffectedConfig } from "../types";

export function isPage(
  modulePath: string,
  projectDir: string,
  config: NextAffectedConfig
): boolean {
  const normalizedPath = normalizePath(modulePath);
  const pagesDirs = config.pagesDirectories.map((dir) =>
    normalizePath(path.join(projectDir, dir))
  );
  return pagesDirs.some((dir) => normalizedPath.startsWith(dir));
}

export function getRouteFromPage(
  pagePath: string,
  projectDir: string,
  config: NextAffectedConfig
): string {
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
  return route || "/";
}

export function normalizePath(filePath: string): string {
  const absolutePath = path.resolve(filePath);
  return absolutePath.replace(/\\/g, "/");
}

export function shouldExcludeModule(
  modulePath: string,
  config: NextAffectedConfig
): boolean {
  return config.excludedExtensions.some((ext) => modulePath.endsWith(ext));
}
