import { execFileSync } from "child_process";
import { getChangedFiles } from "./git";

jest.mock("child_process");

const mockExecFileSync = execFileSync as unknown as jest.Mock;

type Responses = Record<string, string | Buffer | Error>;

function mockGit(responses: Responses) {
  mockExecFileSync.mockImplementation((command: string, args: string[]) => {
    const key = args.join(" ");
    const response = responses[key];
    if (response === undefined) {
      throw new Error(`Unexpected command: ${command} ${key}`);
    }
    if (response instanceof Error) {
      throw response;
    }
    return response;
  });
}

const calls = () => mockExecFileSync.mock.calls.map(([, args, options]) => ({
  args: (args as string[]).join(" "),
  cwd: (options as { cwd: string }).cwd,
  input: (options as { input?: string }).input,
}));

const blob = (content: string) => `0123abcd blob ${Buffer.byteLength(content)}\n${content}\n`;

describe("getChangedFiles", () => {
  beforeEach(() => {
    mockExecFileSync.mockReset();
  });

  it("diffs base...head and returns absolute paths from the repository root", () => {
    mockGit({
      "rev-parse --show-toplevel": "/repo\n",
      "rev-parse --verify --quiet main^{commit}": "abc\n",
      "diff --name-only -z main...feature": "apps/web/a.ts\0packages/ui/b.ts\0",
    });

    expect(getChangedFiles({ base: "main", head: "feature", projectDir: "/repo/apps/web" }).files).toEqual([
      "/repo/apps/web/a.ts",
      "/repo/packages/ui/b.ts",
    ]);
    expect(calls().slice(1).every((call) => call.cwd === "/repo")).toBe(true);
  });

  it("never runs git through a shell", () => {
    mockGit({
      "rev-parse --show-toplevel": "/repo\n",
      "rev-parse --verify --quiet main;touch pwned^{commit}": "abc\n",
      "diff --name-only -z main;touch pwned...HEAD": "",
    });

    getChangedFiles({ base: "main;touch pwned", projectDir: "/repo" });

    expect(mockExecFileSync).toHaveBeenCalledWith("git", expect.any(Array), expect.any(Object));
  });

  it("compares the working tree with the merge base and adds untracked files when including uncommitted changes", () => {
    mockGit({
      "rev-parse --show-toplevel": "/repo\n",
      "rev-parse --verify --quiet main^{commit}": "abc\n",
      "merge-base main HEAD": "fork\n",
      "diff --name-only -z fork": "a.ts\0b.ts\0",
      "ls-files --others --exclude-standard -z": "b.ts\0new.ts\0",
    });

    expect(getChangedFiles({ base: "main", projectDir: "/repo", includeUncommitted: true }).files).toEqual([
      "/repo/a.ts",
      "/repo/b.ts",
      "/repo/new.ts",
    ]);
  });

  it("includes staged, unstaged and untracked files when only analysing uncommitted changes", () => {
    mockGit({
      "rev-parse --show-toplevel": "/repo\n",
      "diff --name-only -z HEAD": "staged.ts\0unstaged.ts\0",
      "ls-files --others --exclude-standard -z": "new.ts\0",
    });

    expect(getChangedFiles({ projectDir: "/repo", onlyUncommitted: true }).files).toEqual([
      "/repo/staged.ts",
      "/repo/unstaged.ts",
      "/repo/new.ts",
    ]);
  });

  it("fetches a missing base and diffs against the remote-tracking branch", () => {
    mockGit({
      "rev-parse --show-toplevel": "/repo\n",
      "rev-parse --verify --quiet develop^{commit}": new Error("missing"),
      "fetch origin develop": "",
      "rev-parse --verify --quiet origin/develop^{commit}": "abc\n",
      "diff --name-only -z origin/develop...HEAD": "a.ts\0",
    });

    expect(getChangedFiles({ base: "develop", projectDir: "/repo" }).files).toEqual(["/repo/a.ts"]);
  });

  it("returns an empty list when nothing changed", () => {
    mockGit({
      "rev-parse --show-toplevel": "/repo\n",
      "rev-parse --verify --quiet main^{commit}": "abc\n",
      "diff --name-only -z main...HEAD": "",
    });

    expect(getChangedFiles({ base: "main", projectDir: "/repo" }).files).toEqual([]);
  });

  it("requires a base unless only analysing uncommitted changes", () => {
    mockGit({ "rev-parse --show-toplevel": "/repo\n" });

    expect(() => getChangedFiles({ projectDir: "/repo" })).toThrow("A base commit or branch is required");
  });

  it("rejects references that git would read as options", () => {
    mockGit({ "rev-parse --show-toplevel": "/repo\n" });

    expect(() => getChangedFiles({ base: "--output=/tmp/x", projectDir: "/repo" })).toThrow(
      'Invalid git reference: "--output=/tmp/x"'
    );
  });

  it("throws git failures instead of exiting the process", () => {
    const exitSpy = jest.spyOn(process, "exit");
    mockGit({
      "rev-parse --show-toplevel": "/repo\n",
      "rev-parse --verify --quiet main^{commit}": "abc\n",
      "diff --name-only -z main...HEAD": new Error("fatal: bad revision"),
    });

    expect(() => getChangedFiles({ base: "main", projectDir: "/repo" })).toThrow("fatal: bad revision");
    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });
});

describe("readPrevious", () => {
  beforeEach(() => {
    mockExecFileSync.mockReset();
  });

  it("reads every previous version at the merge base of base and head with one git call", () => {
    mockGit({
      "rev-parse --show-toplevel": "/repo\n",
      "rev-parse --verify --quiet main^{commit}": "abc\n",
      "diff --name-only -z main...feature": "src/ui/index.ts\0src/ui/new.ts\0src/ui/accents.ts\0",
      "merge-base main feature": "fork\n",
      "cat-file --batch": Buffer.from(
        blob("export * from './old';\n") +
          "fork:src/ui/new.ts missing\n" +
          blob("export { café } from './menu';\n")
      ),
    });

    const { readPrevious } = getChangedFiles({ base: "main", head: "feature", projectDir: "/repo" });

    expect(readPrevious(["/repo/src/ui/index.ts", "/repo/src/ui/new.ts", "/repo/src/ui/accents.ts"])).toEqual(
      new Map([
        ["/repo/src/ui/index.ts", "export * from './old';\n"],
        ["/repo/src/ui/new.ts", null],
        ["/repo/src/ui/accents.ts", "export { café } from './menu';\n"],
      ])
    );
    expect(calls().filter((call) => call.args === "cat-file --batch")).toEqual([
      {
        args: "cat-file --batch",
        cwd: "/repo",
        input: "fork:src/ui/index.ts\nfork:src/ui/new.ts\nfork:src/ui/accents.ts\n",
      },
    ]);
  });

  it("does not run git when no previous version is read", () => {
    mockGit({
      "rev-parse --show-toplevel": "/repo\n",
      "rev-parse --verify --quiet main^{commit}": "abc\n",
      "diff --name-only -z main...HEAD": "a.ts\0",
    });

    const { readPrevious } = getChangedFiles({ base: "main", projectDir: "/repo" });

    expect(readPrevious([])).toEqual(new Map());
    expect(calls().some((call) => /^(merge-base|cat-file)/.test(call.args))).toBe(false);
  });

  it("reads uncommitted changes against HEAD and the working tree against the merge base", () => {
    mockGit({
      "rev-parse --show-toplevel": "/repo\n",
      "rev-parse --verify --quiet main^{commit}": "abc\n",
      "merge-base main HEAD": "fork\n",
      "diff --name-only -z fork": "a.ts\0",
      "diff --name-only -z HEAD": "a.ts\0",
      "ls-files --others --exclude-standard -z": "",
      "cat-file --batch": Buffer.from(blob("before")),
    });

    getChangedFiles({ base: "main", projectDir: "/repo", includeUncommitted: true }).readPrevious(["/repo/a.ts"]);
    getChangedFiles({ projectDir: "/repo", onlyUncommitted: true }).readPrevious(["/repo/a.ts"]);

    expect(calls().filter((call) => call.args === "cat-file --batch").map((call) => call.input)).toEqual([
      "fork:a.ts\n",
      "HEAD:a.ts\n",
    ]);
  });

  it("treats every file as new when git cannot read them", () => {
    mockGit({
      "rev-parse --show-toplevel": "/repo\n",
      "diff --name-only -z HEAD": "a.ts\0",
      "ls-files --others --exclude-standard -z": "",
      "cat-file --batch": new Error("fatal: not a git repository"),
    });

    expect(getChangedFiles({ projectDir: "/repo", onlyUncommitted: true }).readPrevious(["/repo/a.ts"])).toEqual(
      new Map([["/repo/a.ts", null]])
    );
  });
});
