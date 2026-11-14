import { execFileSync } from "child_process";
import * as fs from "fs";
import os from "os";
import path from "path";
import { NextAffectedConfig } from "../types";
import { changedExportNames, traceReExports } from "./exports";
import { getChangedFiles } from "./git";
import { findAffectedPages, getDependencyGraph } from "./graph";

const config: NextAffectedConfig = {
  pagesDirectories: ["app"],
  excludedExtensions: [".css"],
  excludedPaths: [],
};

const files: Record<string, string> = {
  "tsconfig.json": JSON.stringify({
    compilerOptions: {
      baseUrl: ".",
      jsx: "react-jsx",
      moduleResolution: "bundler",
      module: "esnext",
      paths: { "@/*": ["src/*"], "@ui": ["src/ui/index.ts"] },
    },
  }),
  "app/layout.tsx": `import { Header } from "@/components/header";\nexport default function Layout({ children }: { children: unknown }) { return <><Header />{children}</>; }\n`,
  "app/page.tsx": `import { Button } from "@ui";\nexport default function Page() { return <Button />; }\n`,
  "app/(shop)/cart/page.tsx": `import { CartList } from "./cart-list";\nexport default function Cart() { return <CartList />; }\n`,
  "app/(shop)/cart/cart-list.tsx": `import { Price } from "@/components/price";\nexport function CartList() { return <Price />; }\n`,
  "app/about/page.tsx": `export default function About() { return null; }\n`,
  "src/ui/index.ts": `export { Button } from "./button";\n`,
  "src/ui/button.tsx": `export function Button() { return <button />; }\n`,
  "src/components/header.tsx": `export function Header() { return <header />; }\n`,
  "src/components/price.tsx": `export function Price() { return <span />; }\n`,
};

describe("getDependencyGraph + findAffectedPages on a real project", () => {
  let projectDir: string;

  beforeAll(() => {
    projectDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "next-affected-it-")));
    for (const [file, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(projectDir, file)), { recursive: true });
      fs.writeFileSync(path.join(projectDir, file), content);
    }
  });

  afterAll(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  const routesFor = async (changedFile: string) => {
    const graph = await getDependencyGraph(projectDir, config);
    return findAffectedPages(graph, [changedFile], projectDir, config).map((page) => page.route);
  };

  it("resolves tsconfig path aliases, including exact-match aliases", async () => {
    await expect(routesFor("src/ui/button.tsx")).resolves.toEqual(["/"]);
  });

  it("follows colocated components to their route", async () => {
    await expect(routesFor("src/components/price.tsx")).resolves.toEqual(["/cart"]);
  });

  it("expands layout dependencies to every route under the layout", async () => {
    await expect(routesFor("src/components/header.tsx")).resolves.toEqual([
      "/",
      "/about",
      "/cart",
    ]);
  });
});

const pagesRouterFiles: Record<string, string> = {
  "tsconfig.json": JSON.stringify({
    compilerOptions: { baseUrl: ".", jsx: "react-jsx", moduleResolution: "bundler", module: "esnext" },
  }),
  "middleware.page.ts": `import { isAllowed } from "./src/lib/geo";\nexport function middleware() { return isAllowed(); }\n`,
  "pages/_app.page.tsx": `import { Theme } from "../src/theme";\nexport default function App() { return <Theme />; }\n`,
  "pages/_document.page.tsx": `export default function Document() { return null; }\n`,
  "pages/index.page.tsx": `export default function Home() { return null; }\n`,
  "pages/blog/[slug].page.tsx": `import { BlogCard } from "./blog-card";\nexport default function Post() { return <BlogCard />; }\n`,
  "pages/blog/blog-card.tsx": `import { Card } from "../../src/card";\nexport function BlogCard() { return <Card />; }\n`,
  "pages/api/users.api.ts": `import { db } from "../../src/lib/db";\nexport default function handler() { return db(); }\n`,
  "src/theme.tsx": `export function Theme() { return null; }\n`,
  "src/card.tsx": `export function Card() { return <article />; }\n`,
  "src/lib/db.ts": `export function db() { return []; }\n`,
  "src/lib/geo.ts": `export function isAllowed() { return true; }\n`,
};

describe("Pages Router project with pageExtensions and middleware", () => {
  let projectDir: string;
  const pagesConfig: NextAffectedConfig = {
    pagesDirectories: ["pages"],
    excludedExtensions: [".css"],
    excludedPaths: [],
    pageExtensions: ["page.tsx", "page.ts", "api.ts"],
  };

  beforeAll(() => {
    projectDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "next-affected-pages-")));
    for (const [file, content] of Object.entries(pagesRouterFiles)) {
      fs.mkdirSync(path.dirname(path.join(projectDir, file)), { recursive: true });
      fs.writeFileSync(path.join(projectDir, file), content);
    }
  });

  afterAll(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  const routesFor = async (changedFile: string) => {
    const graph = await getDependencyGraph(projectDir, pagesConfig);
    return findAffectedPages(graph, [changedFile], projectDir, pagesConfig).map(
      (page) => page.route
    );
  };

  it("maps a colocated component to its page without reporting the component", async () => {
    await expect(routesFor("src/card.tsx")).resolves.toEqual(["/blog/[slug]"]);
  });

  it("expands _app dependencies to every page but not to API routes", async () => {
    await expect(routesFor("src/theme.tsx")).resolves.toEqual(["/", "/blog/[slug]"]);
  });

  it("reports API routes for their own dependencies", async () => {
    await expect(routesFor("src/lib/db.ts")).resolves.toEqual(["/api/users"]);
  });

  it("expands middleware dependencies to every route, API routes included", async () => {
    await expect(routesFor("src/lib/geo.ts")).resolves.toEqual([
      "/",
      "/api/users",
      "/blog/[slug]",
    ]);
  });
});

const barrelFiles: Record<string, string> = {
  "tsconfig.json": JSON.stringify({
    compilerOptions: {
      baseUrl: ".",
      jsx: "react-jsx",
      moduleResolution: "bundler",
      module: "esnext",
      paths: { "~/features/*": ["src/features/*"] },
    },
  }),
  "app/page.tsx": `import { Mobile } from "~/features/matches";\nexport default function Home() { return <Mobile />; }\n`,
  "app/desktop/page.tsx": `export { default } from "../../src/pages/desktop";\n`,
  "src/pages/desktop.tsx": `import { Desktop } from "~/features/matches";\nexport default function DesktopPage() { return <Desktop />; }\n`,
  "src/features/matches/index.ts": `export { Mobile } from "./mobile";\nexport * from "./desktop";\n`,
  "src/features/matches/mobile.tsx": `export function Mobile() { return null; }\n`,
  "src/features/matches/desktop.tsx": `import { Teams } from "../../teams";\nexport function Desktop() { return <Teams />; }\n`,
  "src/teams.tsx": `export function Teams() { return null; }\n`,
};

describe("barrel files with real madge output", () => {
  let projectDir: string;

  beforeAll(() => {
    projectDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "next-affected-barrel-")));
    for (const [file, content] of Object.entries(barrelFiles)) {
      fs.mkdirSync(path.dirname(path.join(projectDir, file)), { recursive: true });
      fs.writeFileSync(path.join(projectDir, file), content);
    }
  });

  afterAll(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  const routesFor = async (changedFile: string, traced: boolean) => {
    const graph = await getDependencyGraph(projectDir, config);
    const reExports = traced
      ? traceReExports(graph, projectDir, path.join(projectDir, "tsconfig.json"))
      : undefined;
    return findAffectedPages(graph, [changedFile], projectDir, config, Infinity, reExports).map(
      (page) => page.route
    );
  };

  it("follows a page that only re-exports its default", async () => {
    await expect(routesFor("src/pages/desktop.tsx", true)).resolves.toEqual(["/desktop"]);
  });

  it("drops pages that import a different export from the barrel", async () => {
    await expect(routesFor("src/teams.tsx", false)).resolves.toEqual(["/", "/desktop"]);
    await expect(routesFor("src/teams.tsx", true)).resolves.toEqual(["/desktop"]);
  });

  it("reports every importer when the barrel itself changes", async () => {
    await expect(routesFor("src/features/matches/index.ts", true)).resolves.toEqual([
      "/",
      "/desktop",
    ]);
  });
});

describe("barrel edits read from a real git repository", () => {
  let projectDir: string;

  const write = (file: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(projectDir, file)), { recursive: true });
    fs.writeFileSync(path.join(projectDir, file), content);
  };
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args], {
      cwd: projectDir,
      stdio: "ignore",
    });

  beforeAll(() => {
    projectDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "next-affected-git-")));
    for (const [file, content] of Object.entries(barrelFiles)) write(file, content);
    git("init", "-q");
    git("add", ".");
    git("commit", "-q", "-m", "init");

    write(
      "src/features/matches/index.ts",
      `export { Mobile } from "./mobile";\nexport * from "./desktop";\nexport { Tablet } from "./tablet";\n`
    );
    write("src/features/matches/tablet.tsx", `export function Tablet() { return null; }\n`);
    write(
      "app/tablet/page.tsx",
      `import { Tablet } from "~/features/matches";\nexport default function TabletPage() { return <Tablet />; }\n`
    );
  });

  afterAll(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it("marks only the pages that import the export added to a barrel", async () => {
    const { files, readPrevious } = getChangedFiles({ projectDir, onlyUncommitted: true });
    const tsConfigPath = path.join(projectDir, "tsconfig.json");
    const graph = await getDependencyGraph(projectDir, config);
    const reExports = traceReExports(graph, projectDir, tsConfigPath);
    const changedExports = changedExportNames(files, readPrevious, projectDir, tsConfigPath);
    const routes = (changed: Map<string, string[]>) =>
      findAffectedPages(graph, files, projectDir, config, Infinity, reExports, changed).map(
        (page) => page.route
      );

    expect(changedExports).toEqual(
      new Map([[`${projectDir}/src/features/matches/index.ts`, ["Tablet"]]])
    );
    expect(routes(new Map())).toEqual(["/", "/desktop", "/tablet"]);
    expect(routes(changedExports)).toEqual(["/tablet"]);
  });
});
