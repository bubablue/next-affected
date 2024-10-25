import path from "path";
import { NextAffectedConfig } from "../types";
import {
  getRouteFromPage,
  isPage,
  normalizePath,
  shouldExcludeModule,
} from "./utils";

jest.mock("path", () => ({
  join: jest.fn(),
  resolve: jest.fn(),
}));

describe("isPage", () => {
  const config: NextAffectedConfig = {
    pagesDirectories: ["pages", "src/pages"],
    excludedExtensions: [".css", ".scss"],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (path.join as jest.Mock).mockImplementation((...args) => args.join("/"));
    (path.resolve as jest.Mock).mockImplementation((p) => p);
  });

  it("should return true if modulePath is in a pages directory", () => {
    const projectDir = "/project";
    const modulePath = "/project/pages/home.js";

    expect(isPage(modulePath, projectDir, config)).toBe(true);
  });

  it("should return false if modulePath is not in a pages directory", () => {
    const projectDir = "/project";
    const modulePath = "/project/components/header.js";

    expect(isPage(modulePath, projectDir, config)).toBe(false);
  });

  it("should normalize paths before comparison", () => {
    const projectDir = "/project";
    const modulePath = "/project/pages\\home.js"; // Using backslash to test normalization

    expect(isPage(modulePath, projectDir, config)).toBe(true);
  });
});

describe("getRouteFromPage", () => {
  const config: NextAffectedConfig = {
    pagesDirectories: ["pages", "src/pages"],
    excludedExtensions: [".css", ".scss"],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (path.join as jest.Mock).mockImplementation((...args) => args.join("/"));
    (path.resolve as jest.Mock).mockImplementation((p) => p);
  });

  it("should return the correct route for a page", () => {
    const projectDir = "/project";
    const pagePath = "/project/pages/home.js";

    expect(getRouteFromPage(pagePath, projectDir, config)).toBe("/home");
  });

  it("should return root route for index.js", () => {
    const projectDir = "/project";
    const pagePath = "/project/pages/index.js";

    expect(getRouteFromPage(pagePath, projectDir, config)).toBe("/index");
  });

  it("should normalize paths and handle various extensions", () => {
    const projectDir = "/project";
    const pagePath = "/project/src/pages/blog/post.tsx";

    expect(getRouteFromPage(pagePath, projectDir, config)).toBe("/blog/post");
  });
});

describe("normalizePath", () => {
  it("should normalize Windows paths to POSIX format", () => {
    const windowsPath = "C:\\project\\pages\\home.js";
    (path.resolve as jest.Mock).mockReturnValue(windowsPath);

    expect(normalizePath(windowsPath)).toBe("C:/project/pages/home.js");
  });

  it("should resolve and normalize paths", () => {
    const filePath = "pages/home.js";
    (path.resolve as jest.Mock).mockReturnValue("/project/pages/home.js");

    expect(normalizePath(filePath)).toBe("/project/pages/home.js");
  });
});

describe("shouldExcludeModule", () => {
  const config: NextAffectedConfig = {
    pagesDirectories: ["pages", "src/pages"],
    excludedExtensions: [".css", ".scss"],
  };

  it("should return true if the module path ends with an excluded extension", () => {
    const modulePath = "/project/styles/main.css";

    expect(shouldExcludeModule(modulePath, config)).toBe(true);
  });

  it("should return false if the module path does not end with an excluded extension", () => {
    const modulePath = "/project/pages/home.js";

    expect(shouldExcludeModule(modulePath, config)).toBe(false);
  });
});
