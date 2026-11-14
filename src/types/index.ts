export interface AppRouterConventions {
  directoryNames: string[];
  pageFiles: string[];
  handlerFiles: string[];
  layoutFiles: string[];
  metadataFiles: Record<string, string>;
  hiddenSegments: string[];
  privateSegments: string[];
  slotSegments: string[];
  interceptionMarkers: Record<string, number | "root">;
}

export interface PagesRouterConventions {
  layoutFiles: string[];
  handlerDirectories: string[];
  indexFiles: string[];
}

export interface NextAffectedConfig {
  pagesDirectories: string[];
  excludedExtensions: string[];
  excludedPaths?: string[];
  pageExtensions?: string[];
  testFiles?: string[];
  appWideFiles?: string[];
  appRouter?: Partial<AppRouterConventions>;
  pagesRouter?: Partial<PagesRouterConventions>;
}

export type DependencyGraph = Record<string, string[]>;

export interface AffectedPage {
  route: string;
  file: string;
  pagesDirectory: string;
}
