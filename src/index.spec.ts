import { Command } from "commander";
import * as fs from "fs";
import path from "path";
import { runNextAffected } from "./modules/run";

jest.mock("commander", () => ({
  Command: jest.fn().mockImplementation(() => ({
    name: jest.fn().mockReturnThis(),
    description: jest.fn().mockReturnThis(),
    version: jest.fn().mockReturnThis(),
    command: jest.fn().mockReturnThis(),
    argument: jest.fn().mockReturnThis(),
    option: jest.fn().mockReturnThis(),
    helpOption: jest.fn().mockReturnThis(),
    enablePositionalOptions: jest.fn().mockReturnThis(),
    addHelpText: jest.fn().mockReturnThis(),
    action: jest.fn().mockReturnThis(),
    parseAsync: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock("./modules/config", () => ({
  initConfig: jest.fn(),
}));

jest.mock("./modules/run", () => ({
  runNextAffected: jest.fn(),
}));

const mockedRunNextAffected = jest.mocked(runNextAffected);

describe("CLI", () => {
  let program: Command;
  let cli: typeof import(".");

  beforeEach(() => {
    jest.clearAllMocks();
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      cli = require(".");
    });
    program = cli.default;
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  const runAction = () => {
    const actionCalls = (program.action as jest.Mock).mock.calls;
    return actionCalls[actionCalls.length - 1][0];
  };

  it("reads its metadata and version from package.json", () => {
    const { version } = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf-8")
    );

    expect(program.name).toHaveBeenCalledWith("next-affected");
    expect(program.version).toHaveBeenCalledWith(version);
  });

  it("parses process.argv asynchronously", () => {
    expect(program.parseAsync).toHaveBeenCalledWith(process.argv);
  });

  it("prints help examples without the run command", () => {
    expect(program.addHelpText).toHaveBeenCalledWith("after", cli.EXAMPLES);
    expect(cli.EXAMPLES).toContain("  $ next-affected --only-uncommitted");
    expect(cli.EXAMPLES).toContain("  $ next-affected --base main --uncommitted");
    expect(cli.EXAMPLES).not.toContain("next-affected run");
  });

  it("analyses from the top-level command and keeps run as an alias", async () => {
    const actions = (program.action as jest.Mock).mock.calls.map(([action]) => action);
    const analyses = actions.slice(1);

    for (const action of analyses) {
      await action("src/button.tsx", { project: "." });
    }

    expect(program.command).toHaveBeenCalledWith("run");
    expect(program.argument).toHaveBeenCalledTimes(2);
    expect(analyses).toHaveLength(2);
    expect(mockedRunNextAffected).toHaveBeenCalledTimes(2);
  });

  it("keeps -h for --head and options after run for the run command", () => {
    expect(program.helpOption).toHaveBeenCalledWith("--help", "Display help");
    expect(program.enablePositionalOptions).toHaveBeenCalled();
    expect(program.option).toHaveBeenCalledWith("-h, --head <commit>", "Head commit or branch", "HEAD");
    expect(program.option).toHaveBeenCalledWith("-f, --files", "Print the paths of the affected files (default)");
    expect(program.option).toHaveBeenCalledWith("-p, --pages", "Print the URLs of the affected pages");
    expect(program.option).toHaveBeenCalledWith("--project <path>", "Path to the Next.js project", ".");
  });

  it("runs the analysis and never sets a failing exit code", async () => {
    mockedRunNextAffected.mockResolvedValue([]);

    await runAction()("src/button.tsx", { project: "." });

    expect(mockedRunNextAffected).toHaveBeenCalledWith("src/button.tsx", { project: "." });
    expect(process.exitCode).toBeUndefined();
  });

  it("ignores an invalid --depth with an error message instead of exiting", () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    expect(cli.parseDepth("3")).toBe(3);
    expect(cli.parseDepth("0")).toBe(0);
    expect(cli.parseDepth("-1")).toBeUndefined();
    expect(cli.parseDepth("abc")).toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      'Error: --depth must be a non-negative integer, got "abc". Ignoring it.'
    );
    errorSpy.mockRestore();
  });
});
