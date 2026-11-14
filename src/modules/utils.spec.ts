import * as fs from "fs";
import os from "os";
import path from "path";
import { NextAffectedConfig } from "../types";
import {
  classifyAppWideFile,
  findAppWideFiles,
  classifyPageFile,
  isWithin,
  normalizePath,
  shouldExcludeModule,
  toAppRoute,
} from "./utils";

const projectDir = "/project";

const defaultConfig: NextAffectedConfig = {
  pagesDirectories: ["pages", "src/pages", "app", "src/app"],
  excludedExtensions: [".css", ".scss"],
  excludedPaths: ["packages"],
};

const monorepoConfig: NextAffectedConfig = {
  pagesDirectories: ["apps/shell/app", "apps/casino/app"],
  excludedExtensions: [".css"],
  excludedPaths: [],
};

describe("normalizePath", () => {
  it("resolves relative segments into an absolute posix path", () => {
    expect(normalizePath("/project/pages/../app/page.tsx")).toBe("/project/app/page.tsx");
  });
});

describe("isWithin", () => {
  it("matches files inside the directory", () => {
    expect(isWithin("/project/app/page.tsx", "/project/app")).toBe(true);
  });

  it("matches the directory itself", () => {
    expect(isWithin("/project/app", "/project/app")).toBe(true);
  });

  it("does not match sibling directories that share a prefix", () => {
    expect(isWithin("/project/apps/web/page.tsx", "/project/app")).toBe(false);
    expect(isWithin("/project/app-config/index.ts", "/project/app")).toBe(false);
  });
});

describe("shouldExcludeModule", () => {
  it("excludes modules with an excluded extension", () => {
    expect(shouldExcludeModule("/project/styles/main.css", defaultConfig, projectDir)).toBe(true);
  });

  it("excludes modules inside an excluded path", () => {
    expect(shouldExcludeModule("/project/packages/ui/button.tsx", defaultConfig, projectDir)).toBe(true);
  });

  it("keeps modules in directories that only share a prefix with an excluded path", () => {
    expect(shouldExcludeModule("/project/packages-legacy/ui.tsx", defaultConfig, projectDir)).toBe(false);
  });

  it("keeps regular modules", () => {
    expect(shouldExcludeModule("/project/pages/home.js", defaultConfig, projectDir)).toBe(false);
  });
});

describe("toAppRoute", () => {
  it.each([
    ["", "/"],
    ["[locale]/casino", "/[locale]/casino"],
    ["(shop)/cart", "/cart"],
    ["[locale]/@modal/login", "/[locale]/login"],
    ["[locale]/@modal/(.)login", "/[locale]/login"],
    ["feed/@modal/(..)photo/[id]", "/photo/[id]"],
    ["a/b/@modal/(..)(..)c", "/c"],
    ["shop/deep/@modal/(...)help", "/help"],
  ])("maps %p to %p", (directory, route) => {
    expect(toAppRoute(directory)).toBe(route);
  });
});

describe("classifyPageFile", () => {
  const classify = (file: string, config: NextAffectedConfig = defaultConfig) =>
    classifyPageFile(file, projectDir, config);

  it("maps App Router pages to their URL, dropping groups and slots", () => {
    expect(classify("/project/app/(shop)/cart/page.tsx")).toEqual({
      kind: "route",
      route: "/cart",
      pagesDirectory: "app",
      wrappedByShells: true,
    });
    expect(classify("/project/app/page.tsx")).toMatchObject({ route: "/" });
  });

  it("maps App Router route handlers", () => {
    expect(classify("/project/src/app/api/health/route.ts")).toEqual({
      kind: "route",
      route: "/api/health",
      pagesDirectory: "src/app",
      wrappedByShells: false,
    });
  });

  it("maps metadata routes to their served path", () => {
    expect(classify("/project/app/sitemap.ts")).toMatchObject({
      route: "/sitemap.xml",
      wrappedByShells: false,
    });
    expect(classify("/project/app/[locale]/opengraph-image.tsx")).toMatchObject({
      route: "/[locale]/opengraph-image",
    });
  });

  it("treats layouts and other segment files as shells scoped to their directory", () => {
    expect(classify("/project/app/[locale]/layout.tsx")).toEqual({
      kind: "shell",
      scope: "/project/app/[locale]",
      pagesDirectory: "app",
      includesHandlers: false,
    });
    expect(classify("/project/app/not-found.tsx")).toEqual({
      kind: "shell",
      scope: "/project/app",
      pagesDirectory: "app",
      includesHandlers: false,
    });
  });

  it("ignores colocated components, private folders and tests in the app directory", () => {
    expect(classify("/project/app/cart/cart-list.tsx")).toBeNull();
    expect(classify("/project/app/_components/page.tsx")).toBeNull();
    expect(classify("/project/app/api/health/__tests__/route.spec.ts")).toBeNull();
    expect(classify("/project/app/cart/page.test.tsx")).toBeNull();
  });

  it("maps Pages Router files, collapsing index files", () => {
    expect(classify("/project/pages/index.tsx")).toMatchObject({ kind: "route", route: "/" });
    expect(classify("/project/pages/blog/index.tsx")).toMatchObject({ route: "/blog" });
    expect(classify("/project/src/pages/blog/[slug].tsx")).toMatchObject({ route: "/blog/[slug]" });
    expect(classify("/project/pages/api/users.ts")).toMatchObject({
      route: "/api/users",
      wrappedByShells: false,
    });
    expect(classify("/project/pages/api.tsx")).toMatchObject({
      route: "/api",
      wrappedByShells: true,
    });
  });

  it("treats _app and _document as shells for the whole Pages Router directory", () => {
    expect(classify("/project/pages/_app.tsx")).toEqual({
      kind: "shell",
      scope: "/project/pages",
      pagesDirectory: "pages",
      includesHandlers: false,
    });
  });

  it("ignores files outside the pages directories", () => {
    expect(classify("/project/src/components/button.tsx")).toBeNull();
    expect(classify("/project/apps/web/app/page.tsx")).toBeNull();
  });

  it("ignores non-source files", () => {
    expect(classify("/project/app/cart/page.module.css")).toBeNull();
  });

  it("labels routes with their pages directory in a monorepo", () => {
    expect(classify("/project/apps/casino/app/[locale]/page.tsx", monorepoConfig)).toEqual({
      kind: "route",
      route: "/[locale]",
      pagesDirectory: "apps/casino/app",
      wrappedByShells: true,
    });
  });

  it("scopes shells at the root of a parallel route slot to the slot's parent", () => {
    expect(classify("/project/app/[locale]/@modal/default.tsx")).toMatchObject({
      kind: "shell",
      scope: "/project/app/[locale]",
    });
    expect(classify("/project/app/[locale]/@modal/(.)login/layout.tsx")).toMatchObject({
      kind: "shell",
      scope: "/project/app/[locale]/@modal/(.)login",
    });
  });

  describe("with custom pageExtensions", () => {
    const config: NextAffectedConfig = {
      ...defaultConfig,
      pageExtensions: ["page.tsx", "api.ts"],
    };

    it("only treats files with a page extension as routes", () => {
      expect(classify("/project/pages/about.page.tsx", config)).toMatchObject({ route: "/about" });
      expect(classify("/project/pages/index.page.tsx", config)).toMatchObject({ route: "/" });
      expect(classify("/project/pages/api/users.api.ts", config)).toMatchObject({
        route: "/api/users",
        wrappedByShells: false,
      });
      expect(classify("/project/pages/about-card.tsx", config)).toBeNull();
    });

    it("applies to App Router special files and Pages Router shells", () => {
      expect(classify("/project/app/cart/page.page.tsx", config)).toMatchObject({ route: "/cart" });
      expect(classify("/project/app/cart/page.tsx", config)).toBeNull();
      expect(classify("/project/pages/_app.page.tsx", config)).toMatchObject({ kind: "shell" });
    });
  });
});

describe("classifyAppWideFile", () => {
  const hybridConfig: NextAffectedConfig = {
    ...defaultConfig,
    pagesDirectories: ["app", "pages"],
  };

  it.each(["middleware.ts", "proxy.ts", "instrumentation.ts", "instrumentation-client.ts"])(
    "treats %s next to the pages directories as affecting every route, handlers included",
    (file) => {
      expect(classifyAppWideFile(`/project/${file}`, projectDir, hybridConfig)).toEqual([
        { kind: "shell", scope: "/project/app", pagesDirectory: "app", includesHandlers: true },
        { kind: "shell", scope: "/project/pages", pagesDirectory: "pages", includesHandlers: true },
      ]);
    }
  );

  it("treats next.config at the Next.js root as affecting every route", () => {
    expect(
      classifyAppWideFile("/project/next.config.mjs", projectDir, {
        ...defaultConfig,
        pagesDirectories: ["src/app"],
      })
    ).toEqual([
      { kind: "shell", scope: "/project/src/app", pagesDirectory: "src/app", includesHandlers: true },
    ]);
  });

  it("applies files in any folder above the pages directory, but not beside it", () => {
    const srcConfig = { ...defaultConfig, pagesDirectories: ["src/app"] };

    expect(classifyAppWideFile("/project/src/middleware.ts", projectDir, srcConfig)).toHaveLength(1);
    expect(classifyAppWideFile("/project/middleware.ts", projectDir, srcConfig)).toHaveLength(1);
    expect(classifyAppWideFile("/project/src/lib/proxy.ts", projectDir, srcConfig)).toEqual([]);
  });

  it("matches names from the config, so a renamed convention needs no release", () => {
    const renamed = { ...defaultConfig, pagesDirectories: ["app"], appWideFiles: ["edge-gateway"] };

    expect(classifyAppWideFile("/project/edge-gateway.ts", projectDir, renamed)).toHaveLength(1);
    expect(classifyAppWideFile("/project/middleware.ts", projectDir, renamed)).toEqual([]);
  });

  it("only matches the app that owns the file in a monorepo", () => {
    expect(
      classifyAppWideFile("/project/apps/casino/proxy.ts", projectDir, monorepoConfig)
    ).toEqual([
      {
        kind: "shell",
        scope: "/project/apps/casino/app",
        pagesDirectory: "apps/casino/app",
        includesHandlers: true,
      },
    ]);
  });

  it("ignores other files", () => {
    expect(classifyAppWideFile("/project/src/proxy-utils.ts", projectDir, hybridConfig)).toEqual([]);
    expect(classifyAppWideFile("/project/app/middleware.ts", projectDir, hybridConfig)).toEqual([]);
  });
});

describe("findAppWideFiles", () => {
  it("finds app-wide files in every folder from the pages directory up to the project", () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "next-affected-wide-")));
    for (const file of ["next.config.mjs", "src/middleware.ts", "src/app/page.tsx", "src/lib/proxy.ts", "src/helpers.ts"]) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), "");
    }

    expect(findAppWideFiles(path.join(root, "src/app"), root, defaultConfig).sort()).toEqual([
      `${root}/next.config.mjs`,
      `${root}/src/middleware.ts`,
    ]);

    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe("conventions from config", () => {
  it("uses App Router file names from the config", () => {
    const config: NextAffectedConfig = {
      ...defaultConfig,
      appRouter: { pageFiles: ["page", "view"], layoutFiles: ["frame"] },
    };

    expect(classifyPageFile("/project/app/cart/view.tsx", projectDir, config)).toMatchObject({
      kind: "route",
      route: "/cart",
    });
    expect(classifyPageFile("/project/app/cart/frame.tsx", projectDir, config)).toMatchObject({
      kind: "shell",
    });
    expect(classifyPageFile("/project/app/cart/layout.tsx", projectDir, config)).toBeNull();
  });

  it("keeps App Router defaults for keys the config leaves out", () => {
    const config: NextAffectedConfig = { ...defaultConfig, appRouter: { pageFiles: ["view"] } };

    expect(classifyPageFile("/project/app/(shop)/cart/view.tsx", projectDir, config)).toMatchObject({
      route: "/cart",
    });
    expect(classifyPageFile("/project/app/layout.tsx", projectDir, config)).toMatchObject({
      kind: "shell",
    });
  });

  it("uses segment patterns and interception markers from the config", () => {
    const config: NextAffectedConfig = {
      ...defaultConfig,
      appRouter: { hiddenSegments: ["^\\{.+\\}$"], interceptionMarkers: { "[up]": 1 } },
    };

    expect(toAppRoute("{shop}/cart", config)).toBe("/cart");
    expect(toAppRoute("(shop)/cart", config)).toBe("/(shop)/cart");
    expect(toAppRoute("feed/[up]photo", config)).toBe("/photo");
  });

  it("uses Pages Router names from the config", () => {
    const config: NextAffectedConfig = {
      ...defaultConfig,
      pagesRouter: { layoutFiles: ["_shell"], handlerDirectories: ["rpc"], indexFiles: ["home"] },
    };

    expect(classifyPageFile("/project/pages/_shell.tsx", projectDir, config)).toMatchObject({ kind: "shell" });
    expect(classifyPageFile("/project/pages/blog/home.tsx", projectDir, config)).toMatchObject({ route: "/blog" });
    expect(classifyPageFile("/project/pages/rpc/users.ts", projectDir, config)).toMatchObject({
      wrappedByShells: false,
    });
  });

  it("uses test file patterns from the config", () => {
    const config: NextAffectedConfig = { ...defaultConfig, testFiles: ["\\.stories\\.tsx$"] };

    expect(classifyPageFile("/project/pages/button.stories.tsx", projectDir, config)).toBeNull();
    expect(classifyPageFile("/project/pages/index.spec.tsx", projectDir, config)).toMatchObject({
      route: "/index.spec",
    });
  });
});
