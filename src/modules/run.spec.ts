import * as fs from "fs";
import os from "os";
import path from "path";
import { AffectedPage } from "../types";
import { loadConfig } from "./config";
import { changedExportNames, traceReExports } from "./exports";
import { getChangedFiles } from "./git";
import { findAffectedPages, getDependencyGraph } from "./graph";
import { runNextAffected } from "./run";

jest.mock("./config", () => ({ loadConfig: jest.fn() }));
jest.mock("./exports", () => ({ changedExportNames: jest.fn(), traceReExports: jest.fn() }));
jest.mock("./git", () => ({ getChangedFiles: jest.fn() }));
jest.mock("./graph", () => ({
  findAffectedPages: jest.fn(),
  findTsConfig: jest.fn(),
  getDependencyGraph: jest.fn(),
}));

const { DEFAULT_CONFIG } = jest.requireActual("./config");
const reExports = { traced: {}, through: {}, lookups: {} };
const readPrevious = jest.fn();
const changedExports = new Map([["/repo/src/ui/index.ts", ["Tablet"]]]);

const mockedLoadConfig = jest.mocked(loadConfig);
const mockedGetChangedFiles = jest.mocked(getChangedFiles);
const mockedFindAffectedPages = jest.mocked(findAffectedPages);
const mockedGetDependencyGraph = jest.mocked(getDependencyGraph);
const mockedTraceReExports = jest.mocked(traceReExports);
const mockedChangedExportNames = jest.mocked(changedExportNames);

const pages: AffectedPage[] = [
  { route: "/", file: "apps/shell/app/page.tsx", pagesDirectory: "apps/shell/app" },
  { route: "/cart", file: "apps/shell/app/(shop)/cart/page.tsx", pagesDirectory: "apps/shell/app" },
  { route: "/cart", file: "apps/shell/app/@modal/(.)cart/page.tsx", pagesDirectory: "apps/shell/app" },
];

describe("runNextAffected", () => {
  let projectDir: string;
  let stdout: string[];

  beforeEach(() => {
    jest.clearAllMocks();
    projectDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "next-affected-run-")));
    fs.mkdirSync(path.join(projectDir, "apps/shell/app"), { recursive: true });
    stdout = [];
    jest.spyOn(console, "log").mockImplementation((line: string) => {
      stdout.push(line);
    });
    jest.spyOn(console, "error").mockImplementation(() => {});
    mockedLoadConfig.mockReturnValue({
      ...DEFAULT_CONFIG,
      pagesDirectories: ["apps/shell/app", "apps/casino/app"],
    });
    mockedTraceReExports.mockReturnValue(reExports);
    mockedChangedExportNames.mockReturnValue(changedExports);
    mockedGetDependencyGraph.mockResolvedValue({ "apps/shell/app/page.tsx": [] });
    mockedFindAffectedPages.mockReturnValue(pages);
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it("logs an error before doing any work when there is nothing to compare", async () => {
    await expect(runNextAffected(undefined, { project: projectDir })).resolves.toEqual([]);

    expect(console.error).toHaveBeenCalledWith(
      "Error:",
      "You must specify a component path, --base <commit>, or --only-uncommitted."
    );
    expect(mockedGetDependencyGraph).not.toHaveBeenCalled();
  });

  it("logs a missing project directory with a clear message", async () => {
    const missing = path.join(projectDir, "missing");

    await expect(runNextAffected(undefined, { project: missing, base: "main" })).resolves.toEqual([]);

    expect(console.error).toHaveBeenCalledWith("Error:", `Project directory not found: ${missing}`);
    expect(mockedGetChangedFiles).not.toHaveBeenCalled();
  });

  it("analyses a single component resolved from the working directory", async () => {
    await runNextAffected("src/button.tsx", { project: projectDir, depth: 2 });

    expect(mockedLoadConfig).toHaveBeenCalledWith(projectDir);
    expect(mockedGetChangedFiles).not.toHaveBeenCalled();
    expect(mockedFindAffectedPages).toHaveBeenCalledWith(
      expect.any(Object),
      [path.resolve(process.cwd(), "src/button.tsx")],
      projectDir,
      expect.any(Object),
      2,
      reExports,
      new Map()
    );
    expect(mockedChangedExportNames).not.toHaveBeenCalled();
  });

  it("analyses all changed files from git in a single traversal", async () => {
    mockedGetChangedFiles.mockReturnValue({ files: ["/repo/a.ts", "/repo/b.ts"], readPrevious });

    await runNextAffected(undefined, { project: projectDir, base: "main", uncommitted: true });

    expect(mockedGetChangedFiles).toHaveBeenCalledWith({
      base: "main",
      head: "HEAD",
      projectDir,
      includeUncommitted: true,
      onlyUncommitted: false,
    });
    expect(mockedFindAffectedPages).toHaveBeenCalledTimes(1);
    expect(mockedFindAffectedPages).toHaveBeenCalledWith(
      expect.any(Object),
      ["/repo/a.ts", "/repo/b.ts"],
      projectDir,
      expect.any(Object),
      Infinity,
      reExports,
      changedExports
    );
  });

  it("compares changed files of the graph with their previous version from git", async () => {
    const barrel = path.join(projectDir, "src/ui/index.ts");
    const excluded = path.join(projectDir, "packages/ui/index.ts");
    mockedGetDependencyGraph.mockResolvedValue({ "src/ui/index.ts": [] });
    mockedGetChangedFiles.mockReturnValue({ files: [barrel, excluded], readPrevious });

    await runNextAffected(undefined, { project: projectDir, base: "main" });

    expect(mockedChangedExportNames).toHaveBeenCalledWith([barrel], readPrevious, projectDir, undefined);
    expect(mockedFindAffectedPages).toHaveBeenCalledWith(
      expect.any(Object),
      [barrel, excluded],
      projectDir,
      expect.any(Object),
      Infinity,
      reExports,
      changedExports
    );
  });

  it("allows --only-uncommitted without a base", async () => {
    mockedGetChangedFiles.mockReturnValue({ files: ["/repo/a.ts"], readPrevious });

    await runNextAffected(undefined, { project: projectDir, onlyUncommitted: true });

    expect(mockedGetChangedFiles).toHaveBeenCalledWith(
      expect.objectContaining({ base: undefined, onlyUncommitted: true })
    );
  });

  it("skips the graph build when nothing changed", async () => {
    mockedGetChangedFiles.mockReturnValue({ files: [], readPrevious });

    await expect(runNextAffected(undefined, { project: projectDir, base: "main" })).resolves.toEqual([]);

    expect(mockedGetDependencyGraph).not.toHaveBeenCalled();
    expect(stdout).toContain("\nNo affected pages found.");
  });

  it("prints every affected route file by default, sorted by path", async () => {
    await runNextAffected("src/button.tsx", { project: projectDir });

    expect(stdout).toEqual([
      "\nAffected Files:",
      "apps/shell/app/(shop)/cart/page.tsx",
      "apps/shell/app/@modal/(.)cart/page.tsx",
      "apps/shell/app/page.tsx",
    ]);
  });

  it("prints each page URL once, one per line, with --pages", async () => {
    await runNextAffected("src/button.tsx", { project: projectDir, pages: true });

    expect(stdout).toEqual(["\nAffected Pages:", "/", "/cart"]);
  });

  it("prints files and pages when both are requested", async () => {
    await runNextAffected("src/button.tsx", { project: projectDir, files: true, pages: true });

    expect(stdout).toEqual([
      "\nAffected Files:",
      "apps/shell/app/(shop)/cart/page.tsx",
      "apps/shell/app/@modal/(.)cart/page.tsx",
      "apps/shell/app/page.tsx",
      "\nAffected Pages:",
      "/",
      "/cart",
    ]);
  });

  it("labels page URLs with their pages directory when several exist", async () => {
    fs.mkdirSync(path.join(projectDir, "apps/casino/app"), { recursive: true });

    await runNextAffected("src/button.tsx", { project: projectDir, pages: true });

    expect(stdout).toEqual([
      "\nAffected Pages:",
      "/ (apps/shell/app)",
      "/cart (apps/shell/app)",
    ]);
  });

  it("prints JSON when requested", async () => {
    await runNextAffected("src/button.tsx", { project: projectDir, json: true });

    expect(JSON.parse(stdout.join("\n"))).toEqual(pages);
  });

  it("prints an empty message when no pages are affected", async () => {
    mockedFindAffectedPages.mockReturnValue([]);

    await runNextAffected("src/button.tsx", { project: projectDir });

    expect(stdout).toEqual(["\nNo affected pages found."]);
  });

  it("logs failures with console.error instead of throwing", async () => {
    mockedGetDependencyGraph.mockRejectedValue(new Error("boom"));

    await expect(runNextAffected("src/button.tsx", { project: projectDir })).resolves.toEqual([]);

    expect(console.error).toHaveBeenCalledWith("Error:", "boom");
    expect(stdout).toEqual([]);
  });

  it("traces named imports through re-exports before walking the graph", async () => {
    await runNextAffected("src/button.tsx", { project: projectDir });

    expect(mockedTraceReExports).toHaveBeenCalledWith(
      { "apps/shell/app/page.tsx": [] },
      projectDir,
      undefined
    );
  });
});
