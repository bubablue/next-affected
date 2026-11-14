import * as fs from "fs";
import os from "os";
import path from "path";
import { DependencyGraph, NextAffectedConfig } from "../types";
import { changedExportNames, parseModule, traceReExports } from "./exports";
import { findAffectedPages } from "./graph";

describe("parseModule", () => {
  const parse = (source: string) => parseModule("/project/src/file.tsx", source);

  it("records named, default, namespace and side-effect imports", () => {
    const info = parse(`
      import Default, { a, b as c } from "./named";
      import * as everything from "./namespace";
      import "./side-effect";
      import type { Props } from "./types";
    `);

    expect(info.imports).toEqual([
      { specifier: "./named", names: ["default", "a", "b"], wide: false },
      { specifier: "./namespace", names: [], wide: true },
      { specifier: "./side-effect", names: [], wide: true },
      { specifier: "./types", names: ["Props"], wide: false },
    ]);
  });

  it("records dynamic imports and require calls as whole-module imports", () => {
    const info = parse(`
      const Desktop = dynamic(() => import("./desktop"));
      const legacy = require("./legacy");
    `);

    expect(info.imports).toEqual([
      { specifier: "./desktop", names: [], wide: true },
      { specifier: "./legacy", names: [], wide: true },
    ]);
  });

  it("separates local exports from re-exports", () => {
    const info = parse(`
      import { Imported } from "./imported";
      export const one = 1, { two } = source;
      export function three() {}
      export class Four {}
      export interface Five {}
      export type Six = string;
      export enum Seven {}
      export default function Page() {}
      const eight = 8;
      export { eight, Imported as Renamed };
      export { nine as Nine } from "./nine";
      export * from "./star";
      export * as ten from "./ten";
    `);

    expect([...info.locals].sort()).toEqual(
      ["Five", "Four", "Seven", "Six", "default", "eight", "one", "three", "two"].sort()
    );
    expect(Object.fromEntries(info.reExports)).toEqual({
      Renamed: { specifier: "./imported", name: "Imported" },
      Nine: { specifier: "./nine", name: "nine" },
      ten: { specifier: "./ten", name: "*" },
    });
    expect(info.stars).toEqual(["./star"]);
  });
});

describe("traceReExports", () => {
  let projectDir: string;
  const config: NextAffectedConfig = {
    pagesDirectories: ["app"],
    excludedExtensions: [".css"],
    excludedPaths: [],
  };

  const files: Record<string, string> = {
    "app/page.tsx": `import { Mobile } from "../src/features";\nexport default function Home() { return <Mobile />; }\n`,
    "app/desktop/page.tsx": `import { Desktop } from "../../src/features";\nexport default function DesktopPage() { return <Desktop />; }\n`,
    "app/all/page.tsx": `import * as features from "../../src/features";\nexport default function All() { return <features.Mobile />; }\n`,
    "src/features/index.ts": `export { Mobile } from "./mobile";\nexport * from "./desktop";\n`,
    "src/features/mobile.tsx": `export function Mobile() { return null; }\n`,
    "src/features/desktop.tsx": `import { Card } from "../card";\nexport function Desktop() { return <Card />; }\n`,
    "src/card.tsx": `export function Card() { return null; }\n`,
  };

  const graph: DependencyGraph = {
    "app/page.tsx": ["src/features/index.ts"],
    "app/desktop/page.tsx": ["src/features/index.ts"],
    "app/all/page.tsx": ["src/features/index.ts"],
    "src/features/index.ts": ["src/features/mobile.tsx", "src/features/desktop.tsx"],
    "src/features/mobile.tsx": [],
    "src/features/desktop.tsx": ["src/card.tsx"],
    "src/card.tsx": [],
  };

  beforeAll(() => {
    projectDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "next-affected-exports-")));
    for (const [file, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(projectDir, file)), { recursive: true });
      fs.writeFileSync(path.join(projectDir, file), content);
    }
  });

  afterAll(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  const routesFor = (changed: string, traced: boolean) =>
    findAffectedPages(
      graph,
      [changed],
      projectDir,
      config,
      Infinity,
      traced ? traceReExports(graph, projectDir) : undefined
    ).map((page) => page.route);

  it("points named imports at the file that declares the export", () => {
    const { traced, through } = traceReExports(graph, projectDir);

    expect(traced["app/page.tsx"]).toEqual([`${projectDir}/src/features/mobile.tsx`]);
    expect(traced["app/desktop/page.tsx"]).toEqual([`${projectDir}/src/features/desktop.tsx`]);
    expect(through["app/page.tsx"]).toEqual([`${projectDir}/src/features/index.ts`]);
  });

  it("records every export name looked up in each module", () => {
    const { lookups } = traceReExports(graph, projectDir);

    expect(lookups["app/desktop/page.tsx"]).toEqual({
      [`${projectDir}/src/features/index.ts`]: ["Desktop"],
      [`${projectDir}/src/features/desktop.tsx`]: ["Desktop"],
    });
    expect(lookups["app/all/page.tsx"]).toEqual({
      [`${projectDir}/src/features/index.ts`]: ["*", "Mobile", "Desktop"],
      [`${projectDir}/src/features/mobile.tsx`]: ["Mobile"],
      [`${projectDir}/src/features/desktop.tsx`]: ["Desktop"],
    });
  });

  it("stops a barrel from spreading a change to pages that use other exports", () => {
    expect(routesFor("src/card.tsx", false)).toEqual(["/", "/all", "/desktop"]);
    expect(routesFor("src/card.tsx", true)).toEqual(["/all", "/desktop"]);
    expect(routesFor("src/features/mobile.tsx", true)).toEqual(["/", "/all"]);
  });

  it("reports every importer of a changed barrel when its previous version is unknown", () => {
    expect(routesFor("src/features/index.ts", true)).toEqual(["/", "/all", "/desktop"]);
  });

  it("keeps madge's edge when an import cannot be traced", () => {
    const untraceable: DependencyGraph = { ...graph, "app/page.tsx": ["src/features/index.ts", "src/missing.ts"] };
    const { traced } = traceReExports(untraceable, projectDir);

    expect(traced["app/page.tsx"]).toContain(`${projectDir}/src/missing.ts`);
  });
});

describe("changed barrel files", () => {
  let projectDir: string;
  const config: NextAffectedConfig = {
    pagesDirectories: ["app"],
    excludedExtensions: [".css"],
    excludedPaths: [],
  };

  const barrel = `export { Mobile } from "./mobile";\nexport * from "./desktop";\nexport { Tablet } from "./tablet";\n`;
  const tablet = `import { Card } from "../card";\nexport { Mobile as Phone } from "./mobile";\nexport function Tablet() { return <Card />; }\n`;

  const files: Record<string, string> = {
    "app/page.tsx": `import { Mobile } from "../src/ui";\nexport default function Home() { return <Mobile />; }\n`,
    "app/desktop/page.tsx": `import { Desktop } from "../../src/ui";\nexport default function DesktopPage() { return <Desktop />; }\n`,
    "app/all/page.tsx": `import * as ui from "../../src/ui";\nexport default function All() { return <ui.Mobile />; }\n`,
    "app/tablet/page.tsx": `import { Tablet } from "../../src/ui";\nexport default function TabletPage() { return <Tablet />; }\n`,
    "src/ui/index.ts": barrel,
    "src/ui/mobile.tsx": `export function Mobile() { return null; }\n`,
    "src/ui/desktop.tsx": `export function Desktop() { return null; }\nexport const DESKTOP_WIDTH = 1024;\n`,
    "src/ui/tablet.tsx": tablet,
    "src/card.tsx": `export function Card() { return null; }\n`,
  };

  const graph: DependencyGraph = {
    "app/page.tsx": ["src/ui/index.ts"],
    "app/desktop/page.tsx": ["src/ui/index.ts"],
    "app/all/page.tsx": ["src/ui/index.ts"],
    "app/tablet/page.tsx": ["src/ui/index.ts"],
    "src/ui/index.ts": ["src/ui/mobile.tsx", "src/ui/desktop.tsx", "src/ui/tablet.tsx"],
    "src/ui/mobile.tsx": [],
    "src/ui/desktop.tsx": [],
    "src/ui/tablet.tsx": ["src/card.tsx", "src/ui/mobile.tsx"],
    "src/card.tsx": [],
  };

  beforeAll(() => {
    projectDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "next-affected-barrel-edit-")));
    for (const [file, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(projectDir, file)), { recursive: true });
      fs.writeFileSync(path.join(projectDir, file), content);
    }
  });

  afterAll(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  const changedIn = (file: string, previous: string | null) =>
    changedExportNames(
      [path.join(projectDir, file)],
      (files) => new Map(files.map((changed) => [changed, previous])),
      projectDir
    ).get(`${projectDir}/${file}`);

  const routesFor = (changed: string[], previous: Record<string, string>) => {
    const changedFiles = changed.map((file) => path.join(projectDir, file));
    const changedExports = changedExportNames(
      changedFiles,
      (files) => new Map(files.map((file) => [file, previous[path.relative(projectDir, file)] ?? null])),
      projectDir
    );
    return findAffectedPages(
      graph,
      changedFiles,
      projectDir,
      config,
      Infinity,
      traceReExports(graph, projectDir),
      changedExports
    ).map((page) => page.route);
  };

  it("lists an added re-export", () => {
    expect(changedIn("src/ui/index.ts", barrel.replace(`export { Tablet } from "./tablet";\n`, ""))).toEqual([
      "Tablet",
    ]);
  });

  it("lists nothing when re-exports are only reordered or reformatted", () => {
    expect(
      changedIn(
        "src/ui/index.ts",
        `export { Tablet } from "./tablet";\n\n// ui\nexport {\n  Mobile,\n} from "./mobile";\nexport * from "./desktop";\n`
      )
    ).toEqual([]);
  });

  it("lists nothing when export * is replaced by the same names", () => {
    expect(changedIn("src/ui/index.ts", barrel.replace(`export { Mobile } from "./mobile";`, `export * from "./mobile";`))).toEqual([]);
  });

  it("lists a re-export that now points to another module", () => {
    expect(
      changedIn("src/ui/index.ts", barrel.replace(`export { Mobile } from "./mobile";`, `export { Phone as Mobile } from "./tablet";`))
    ).toEqual(["Mobile"]);
  });

  it("lists every name an added export * brings in", () => {
    expect(changedIn("src/ui/index.ts", barrel.replace(`export * from "./desktop";\n`, ""))).toEqual([
      "DESKTOP_WIDTH",
      "Desktop",
    ]);
  });

  it("gives up when anything other than export statements changed", () => {
    expect(changedIn("src/ui/tablet.tsx", tablet.replace("<Card />", "null"))).toBeUndefined();
  });

  it("gives up for new files and modules without re-exports", () => {
    const readPrevious = jest.fn().mockReturnValue(new Map());

    expect(changedIn("src/ui/index.ts", null)).toBeUndefined();
    expect(changedExportNames([path.join(projectDir, "src/card.tsx")], readPrevious, projectDir).size).toBe(0);
    expect(readPrevious).not.toHaveBeenCalled();
  });

  it("marks only the pages that import an added export, plus whole-module importers", () => {
    expect(routesFor(["src/ui/index.ts"], {})).toEqual(["/", "/all", "/desktop", "/tablet"]);
    expect(
      routesFor(["src/ui/index.ts"], {
        "src/ui/index.ts": barrel.replace(`export { Tablet } from "./tablet";\n`, ""),
      })
    ).toEqual(["/all", "/tablet"]);
  });

  it("marks no page when no export changed", () => {
    expect(
      routesFor(["src/ui/index.ts"], {
        "src/ui/index.ts": barrel.replace(`export { Mobile } from "./mobile";`, `export * from "./mobile";`),
      })
    ).toEqual([]);
  });

  it("marks pages that reached a barrel through another barrel", () => {
    expect(
      routesFor(["src/ui/tablet.tsx"], {
        "src/ui/tablet.tsx": tablet.replace("Mobile as Phone", "Desktop as Phone"),
      })
    ).toEqual([]);
    expect(
      routesFor(["src/ui/index.ts"], {
        "src/ui/index.ts": barrel.replace(`export { Tablet } from "./tablet";`, `export { Phone as Tablet } from "./tablet";`),
      })
    ).toEqual(["/all", "/tablet"]);
  });

  it("still follows a barrel whose own imports changed", () => {
    expect(
      routesFor(["src/ui/tablet.tsx", "src/card.tsx"], {
        "src/ui/tablet.tsx": tablet.replace("Mobile as Phone", "Mobile as Handset"),
      })
    ).toEqual(["/all", "/tablet"]);
  });
});
