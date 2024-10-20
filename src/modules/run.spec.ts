import path from "path";
import { loadConfig } from "./config";
import { getChangedFiles } from "./git";
import { findAffectedPages, getDependencyGraph } from "./graph";
import { runNextAffected } from "./run";

// Mocking external dependencies
jest.mock("path", () => ({
  resolve: jest.fn(),
  relative: jest.fn(),
}));
jest.mock("./config", () => ({
  loadConfig: jest.fn(),
}));
jest.mock("./git", () => ({
  getChangedFiles: jest.fn(),
}));
jest.mock("./graph", () => ({
  findAffectedPages: jest.fn(),
  getDependencyGraph: jest.fn(),
}));

// Now use jest.mocked to infer the mock type
const mockedPath = jest.mocked(path);
const mockedLoadConfig = jest.mocked(loadConfig);
const mockedFindAffectedPages = jest.mocked(findAffectedPages);
const mockedGetDependencyGraph = jest.mocked(getDependencyGraph);

// Mocking external dependencies
jest.mock("path", () => ({
  resolve: jest.fn(),
  relative: jest.fn(),
}));
jest.mock("./config", () => ({
  loadConfig: jest.fn(),
}));
jest.mock("./git", () => ({
  getChangedFiles: jest.fn(),
}));
jest.mock("./graph", () => ({
  findAffectedPages: jest.fn(),
  getDependencyGraph: jest.fn(),
}));

describe("runNextAffected", () => {
  const options = {
    project: "testProject",
    base: "main",
    head: "HEAD",
    depth: 2,
    verbose: false,
  };

  beforeAll(() => {
    jest.spyOn(global.console, "log").mockImplementation(() => jest.fn());
    jest.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockedPath.resolve.mockReturnValue("/resolved/path");
    mockedPath.relative.mockReturnValue("relative/path");
    mockedLoadConfig.mockReturnValue({
      pagesDirectories: ["pages"],
      excludedExtensions: [".css"],
    });
    mockedGetDependencyGraph.mockResolvedValue({
      moduleA: [],
      moduleB: [],
    });
    mockedFindAffectedPages.mockReturnValue(["/page1", "/page2"]);
  });

  it("should resolve project directory and load configuration", async () => {
    (getChangedFiles as jest.Mock).mockReturnValue(["file1.js", "file2.js"]);
    await runNextAffected(undefined, options);
    expect(path.resolve).toHaveBeenCalledWith(process.cwd(), options.project);
    expect(loadConfig).toHaveBeenCalledWith("/resolved/path");
  });

  it("should process affected pages when componentPath is provided", async () => {
    await runNextAffected("component/path", options);

    expect(path.resolve).toHaveBeenCalledWith(process.cwd(), "component/path");
    expect(findAffectedPages).toHaveBeenCalledWith(
      expect.any(Object), // dependency graph
      "relative/path",
      "/resolved/path",
      expect.any(Object), // config
      options.depth,
      options.verbose,
      expect.any(Function) // processedModules callback
    );
  });

  it("should process affected files when base option is provided", async () => {
    (getChangedFiles as jest.Mock).mockReturnValue(["file1.js", "file2.js"]);

    await runNextAffected(undefined, { ...options, base: "main" });

    expect(getChangedFiles).toHaveBeenCalledWith({
      base: "main",
      head: "HEAD",
      includeUncommitted: false,
      projectDir: "/resolved/path",
    });
    expect(findAffectedPages).toHaveBeenCalledWith(
      expect.any(Object), // dependency graph
      "file1.js",
      "/resolved/path",
      expect.any(Object), // config
      options.depth,
      options.verbose,
      expect.any(Function) // processedModules callback
    );
    expect(findAffectedPages).toHaveBeenCalledWith(
      expect.any(Object), // dependency graph
      "file2.js",
      "/resolved/path",
      expect.any(Object), // config
      options.depth,
      options.verbose,
      expect.any(Function) // processedModules callback
    );
  });

  it("should log affected pages when found", async () => {
    console.log = jest.fn();
    (findAffectedPages as jest.Mock).mockReturnValue(["/page1", "/page2"]);

    await runNextAffected("component/path", options);

    expect(console.log).toHaveBeenCalledWith("\nAffected Pages:");
    expect(console.log).toHaveBeenCalledWith("/page1");
    expect(console.log).toHaveBeenCalledWith("/page2");
  });

  it("should handle errors and log the error message", async () => {
    const error = new Error("Test error");
    (findAffectedPages as jest.Mock).mockImplementation(() => {
      throw error;
    });
    console.error = jest.fn();

    await runNextAffected("component/path", options);

    expect(console.error).toHaveBeenCalledWith("Error:", error.message);
    expect(console.error).toHaveBeenCalledWith(error);
  });
});
