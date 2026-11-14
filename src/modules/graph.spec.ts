import * as fs from "fs";
import madge from "madge";
import os from "os";
import path from "path";
import { DependencyGraph, NextAffectedConfig } from "../types";
import { findAffectedPages, findTsConfig, getDependencyGraph } from "./graph";

jest.mock("madge", () => ({ __esModule: true, default: jest.fn() }));

const projectDir = "/project";

const config: NextAffectedConfig = {
  pagesDirectories: ["app"],
  excludedExtensions: [".css"],
  excludedPaths: ["packages"],
};

const graph: DependencyGraph = {
  "app/layout.tsx": ["src/components/header.tsx"],
  "app/page.tsx": ["src/components/button.tsx"],
  "app/(shop)/cart/page.tsx": ["src/components/button.tsx", "app/(shop)/cart/cart-list.tsx"],
  "app/(shop)/cart/cart-list.tsx": ["src/components/price.tsx"],
  "app/(shop)/layout.tsx": [],
  "app/about/page.tsx": [],
  "app/api/health/route.ts": [],
  "app/sitemap.ts": [],
  "app/@modal/default.tsx": [],
  "proxy.ts": ["src/lib/geo.ts"],
  "src/lib/geo.ts": [],
  "src/components/button.tsx": ["src/components/icon.tsx"],
  "src/components/icon.tsx": [],
  "src/components/header.tsx": [],
  "src/components/price.tsx": [],
};

const routesFor = (changedFiles: string[], maxDepth?: number, graphOverride = graph) =>
  findAffectedPages(graphOverride, changedFiles, projectDir, config, maxDepth).map(
    (page) => page.route
  );

describe("findAffectedPages", () => {
  it("returns the routes that import the changed file", () => {
    expect(routesFor(["src/components/button.tsx"])).toEqual(["/", "/cart"]);
  });

  it("returns route objects with file and pages directory", () => {
    expect(findAffectedPages(graph, ["src/components/price.tsx"], projectDir, config)).toEqual([
      { route: "/cart", file: "app/(shop)/cart/page.tsx", pagesDirectory: "app" },
    ]);
  });

  it("accepts absolute changed file paths", () => {
    expect(routesFor(["/project/src/components/button.tsx"])).toEqual(["/", "/cart"]);
  });

  it("reports a changed page itself", () => {
    expect(routesFor(["app/about/page.tsx"])).toEqual(["/about"]);
  });

  it("does not report colocated components as routes", () => {
    expect(routesFor(["app/(shop)/cart/cart-list.tsx"])).toEqual(["/cart"]);
  });

  it("expands a changed layout to every route under it", () => {
    expect(routesFor(["src/components/header.tsx"])).toEqual(["/", "/about", "/cart"]);
    expect(routesFor(["app/(shop)/layout.tsx"])).toEqual(["/cart"]);
  });

  it("does not expand layouts to route handlers or metadata routes", () => {
    expect(routesFor(["app/layout.tsx"])).toEqual(["/", "/about", "/cart"]);
  });

  it("expands a slot's default.tsx to every page under the slot's parent", () => {
    expect(routesFor(["app/@modal/default.tsx"])).toEqual(["/", "/about", "/cart"]);
  });

  it("expands proxy/middleware dependencies to every route, handlers included", () => {
    expect(routesFor(["src/lib/geo.ts"])).toEqual([
      "/",
      "/about",
      "/api/health",
      "/cart",
      "/sitemap.xml",
    ]);
  });

  it("expands a next.config change to every route", () => {
    expect(routesFor(["next.config.ts"])).toEqual([
      "/",
      "/about",
      "/api/health",
      "/cart",
      "/sitemap.xml",
    ]);
  });

  it("merges and deduplicates results across changed files", () => {
    expect(routesFor(["src/components/button.tsx", "src/components/price.tsx"])).toEqual([
      "/",
      "/cart",
    ]);
  });

  it("respects maxDepth", () => {
    expect(routesFor(["src/components/icon.tsx"], 1)).toEqual([]);
    expect(routesFor(["src/components/icon.tsx"], 2)).toEqual(["/", "/cart"]);
  });

  it("finds pages within maxDepth even when a longer path is explored first", () => {
    const diamond: DependencyGraph = {
      "src/long-1.ts": ["src/changed.ts"],
      "src/shared.ts": ["src/changed.ts", "src/long-1.ts"],
      "app/page.tsx": ["src/shared.ts"],
      "src/changed.ts": [],
    };
    expect(routesFor(["src/changed.ts"], 2, diamond)).toEqual(["/"]);
  });

  it("ignores changed files with excluded extensions or paths", () => {
    expect(routesFor(["src/components/button.css", "packages/ui/index.ts"])).toEqual([]);
  });

  it("returns nothing for files that are not in the graph", () => {
    expect(routesFor(["README.md"])).toEqual([]);
  });
});

describe("getDependencyGraph", () => {
  let tmpDir: string;
  const mockedMadge = jest.mocked(madge);

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "next-affected-graph-")));
    fs.mkdirSync(path.join(tmpDir, "app"));
    fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
    mockedMadge.mockReset();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("builds the graph from existing pages directories and app-wide files with the nearest tsconfig", async () => {
    mockedMadge.mockResolvedValue({ obj: () => ({ "app/page.tsx": [] }) } as never);
    fs.writeFileSync(path.join(tmpDir, "proxy.ts"), "export default function proxy() {}");
    fs.writeFileSync(path.join(tmpDir, "next.config.ts"), "export default {}");

    await getDependencyGraph(tmpDir, { ...config, pagesDirectories: ["app", "pages"] });

    const [entries, options] = mockedMadge.mock.calls[0];
    expect([...(entries as string[])].sort()).toEqual(
      [path.join(tmpDir, "app"), path.join(tmpDir, "next.config.ts"), path.join(tmpDir, "proxy.ts")].sort()
    );
    expect(options).toEqual({
      baseDir: tmpDir,
      fileExtensions: ["js", "jsx", "ts", "tsx"],
      includeNpm: false,
      tsConfig: path.join(tmpDir, "tsconfig.json"),
    });
  });

  it("removes excluded modules and edges, matching whole path segments", async () => {
    mockedMadge.mockResolvedValue({
      obj: () => ({
        "app/page.tsx": ["packages/ui/button.tsx", "packages-legacy/ui.tsx", "app/page.css"],
        "packages/ui/button.tsx": [],
        "packages-legacy/ui.tsx": [],
      }),
    } as never);

    await expect(getDependencyGraph(tmpDir, config)).resolves.toEqual({
      "app/page.tsx": ["packages-legacy/ui.tsx"],
      "packages-legacy/ui.tsx": [],
    });
  });

  it("throws when no pages directory exists", async () => {
    await expect(
      getDependencyGraph(tmpDir, { ...config, pagesDirectories: ["pages"] })
    ).rejects.toThrow("No pages directories found");
    expect(mockedMadge).not.toHaveBeenCalled();
  });
});

describe("findTsConfig", () => {
  it("walks up to the nearest tsconfig", () => {
    const tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "next-affected-ts-")));
    fs.writeFileSync(path.join(tmpDir, "tsconfig.base.json"), "{}");
    fs.mkdirSync(path.join(tmpDir, "apps", "web"), { recursive: true });

    expect(findTsConfig(path.join(tmpDir, "apps", "web"))).toBe(
      path.join(tmpDir, "tsconfig.base.json")
    );

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
