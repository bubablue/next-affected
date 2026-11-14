import * as fs from "fs";
import path from "path";
import {
  AppRouterConventions,
  NextAffectedConfig,
  PagesRouterConventions,
} from "../types";

const CONFIG_FILE_NAME = "next-affected.config.json";

export type ResolvedConfig = Required<
  Omit<NextAffectedConfig, "appRouter" | "pagesRouter">
> & {
  appRouter: AppRouterConventions;
  pagesRouter: PagesRouterConventions;
};

export const DEFAULT_CONFIG: ResolvedConfig = {
  pagesDirectories: ["pages", "src/pages", "app", "src/app"],
  excludedExtensions: [".css", ".scss", ".less", ".svg", ".png", ".jpg"],
  excludedPaths: [],
  pageExtensions: ["tsx", "ts", "jsx", "js"],
  testFiles: ["\\.(spec|test)\\.[jt]sx?$", "(^|/)__tests__/"],
  appWideFiles: ["middleware", "proxy", "instrumentation", "instrumentation-client", "next.config"],
  appRouter: {
    directoryNames: ["app"],
    pageFiles: ["page"],
    handlerFiles: ["route"],
    layoutFiles: [
      "layout",
      "template",
      "default",
      "loading",
      "error",
      "global-error",
      "not-found",
      "forbidden",
      "unauthorized",
    ],
    metadataFiles: {
      sitemap: "sitemap.xml",
      robots: "robots.txt",
      manifest: "manifest.webmanifest",
      icon: "icon",
      "apple-icon": "apple-icon",
      "opengraph-image": "opengraph-image",
      "twitter-image": "twitter-image",
    },
    hiddenSegments: ["^\\(.+\\)$", "^@"],
    privateSegments: ["^_"],
    slotSegments: ["^@"],
    interceptionMarkers: { "(.)": 0, "(..)": 1, "(...)": "root" },
  },
  pagesRouter: {
    layoutFiles: ["_app", "_document"],
    handlerDirectories: ["api"],
    indexFiles: ["index"],
  },
};

type Check = (value: unknown) => string | null;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringList: Check = (value) =>
  Array.isArray(value) && value.every((item) => typeof item === "string")
    ? null
    : "expected a list of strings";

const patternList: Check = (value) => {
  const reason = stringList(value);
  if (reason) return reason;
  for (const pattern of value as string[]) {
    try {
      new RegExp(pattern);
    } catch {
      return `invalid pattern ${JSON.stringify(pattern)}`;
    }
  }
  return null;
};

const stringMap: Check = (value) =>
  isPlainObject(value) && Object.values(value).every((item) => typeof item === "string")
    ? null
    : "expected an object with string values";

const markerMap: Check = (value) =>
  isPlainObject(value) &&
  Object.values(value).every(
    (item) => item === "root" || (Number.isInteger(item) && (item as number) >= 0)
  )
    ? null
    : 'expected an object whose values are non-negative integers or "root"';

const topLevelChecks: Record<keyof Omit<ResolvedConfig, "appRouter" | "pagesRouter">, Check> = {
  pagesDirectories: stringList,
  excludedExtensions: stringList,
  excludedPaths: stringList,
  pageExtensions: stringList,
  testFiles: patternList,
  appWideFiles: stringList,
};

const appRouterChecks: Record<keyof AppRouterConventions, Check> = {
  directoryNames: stringList,
  pageFiles: stringList,
  handlerFiles: stringList,
  layoutFiles: stringList,
  metadataFiles: stringMap,
  hiddenSegments: patternList,
  privateSegments: patternList,
  slotSegments: patternList,
  interceptionMarkers: markerMap,
};

const pagesRouterChecks: Record<keyof PagesRouterConventions, Check> = {
  layoutFiles: stringList,
  handlerDirectories: stringList,
  indexFiles: stringList,
};

function pick<T extends object>(
  source: unknown,
  defaults: T,
  checks: Record<keyof T, Check>,
  scope: string,
  report: (key: string, reason: string) => void
): T {
  const result = { ...defaults };
  if (source === undefined) return result;
  if (!isPlainObject(source)) {
    report(scope, "expected an object");
    return result;
  }
  for (const key of Object.keys(checks) as (keyof T & string)[]) {
    const value = source[key];
    if (value === undefined) continue;
    const reason = checks[key](value);
    if (reason) {
      report(scope ? `${scope}.${key}` : key, reason);
    } else {
      result[key] = value as T[keyof T & string];
    }
  }
  return result;
}

function resolve(
  source: unknown,
  report: (key: string, reason: string) => void
): ResolvedConfig {
  const { appRouter, pagesRouter, ...defaults } = DEFAULT_CONFIG;
  const sourceObject = isPlainObject(source) ? source : {};
  return {
    ...pick(sourceObject, defaults, topLevelChecks, "", report),
    appRouter: pick(sourceObject.appRouter, appRouter, appRouterChecks, "appRouter", report),
    pagesRouter: pick(sourceObject.pagesRouter, pagesRouter, pagesRouterChecks, "pagesRouter", report),
  };
}

export function resolveConfig(config: NextAffectedConfig): ResolvedConfig {
  return resolve(config, () => {});
}

export function initConfig(): void {
  if (fs.existsSync(CONFIG_FILE_NAME)) {
    console.log(`${CONFIG_FILE_NAME} already exists.`);
    return;
  }

  fs.writeFileSync(CONFIG_FILE_NAME, JSON.stringify(DEFAULT_CONFIG, null, 2));
  console.log(`Created ${CONFIG_FILE_NAME} with default settings.`);
}

export function loadConfig(projectDir: string): ResolvedConfig {
  const configFilePath = path.join(projectDir, CONFIG_FILE_NAME);

  if (!fs.existsSync(configFilePath)) {
    return resolveConfig({} as NextAffectedConfig);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(configFilePath, "utf-8"));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`Error: could not read ${configFilePath} (${reason}). Using the default settings.`);
    return resolveConfig({} as NextAffectedConfig);
  }

  if (!isPlainObject(parsed)) {
    console.error(`Error: ${configFilePath} must contain a JSON object. Using the default settings.`);
    return resolveConfig({} as NextAffectedConfig);
  }

  return resolve(parsed, (key, reason) => {
    console.error(`Error: "${key}" in ${configFilePath} is invalid (${reason}). Using its default.`);
  });
}
