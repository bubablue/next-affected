import { NextAffectedConfig } from "../types";
import { findAffectedPages } from "./graph";
import {
  getRouteFromPage,
  isPage,
  normalizePath,
  shouldExcludeModule,
} from "./utils";

jest.mock("fs");
jest.mock("madge");
jest.mock("path");
jest.mock("typescript");
jest.mock("./utils");

describe("findAffectedPages", () => {
  const mockDependencyGraph = {
    "file1.ts": ["file2.ts"],
    "file2.ts": [],
  };
  const mockConfig: NextAffectedConfig = {
    pagesDirectories: ["pages"],
    excludedExtensions: [".css"],
    excludedPaths: [],
  };
  const mockProjectDir = "/path/to/project";
  const mockChangedComponent = "file1.ts";

  beforeEach(() => {
    jest.clearAllMocks();
    (normalizePath as jest.Mock).mockImplementation((path) => path);
    (shouldExcludeModule as jest.Mock).mockReturnValue(false);
    (isPage as jest.Mock).mockReturnValue(false);
  });

  it("should find affected pages based on the dependency graph", () => {
    (isPage as jest.Mock).mockReturnValueOnce(true);
    (getRouteFromPage as jest.Mock).mockReturnValue("/mockedRoute");

    const affectedPages = findAffectedPages(
      mockDependencyGraph,
      mockChangedComponent,
      mockProjectDir,
      mockConfig,
      Infinity,
    );

    expect(normalizePath).toHaveBeenCalled();
    expect(affectedPages).toEqual(["/mockedRoute"]);
  });

  it("should not traverse beyond the maxDepth", () => {
    const affectedPages = findAffectedPages(
      mockDependencyGraph,
      mockChangedComponent,
      mockProjectDir,
      mockConfig,
      1, // maxDepth
    );

    expect(affectedPages).toEqual([]);
  });

  it("should exclude modules if shouldExcludeModule returns true", () => {
    (shouldExcludeModule as jest.Mock).mockReturnValue(true);

    const affectedPages = findAffectedPages(
      mockDependencyGraph,
      mockChangedComponent,
      mockProjectDir,
      mockConfig,
      Infinity,
    );

    expect(affectedPages).toEqual([]);
    expect(shouldExcludeModule).toHaveBeenCalled();
  });
});
