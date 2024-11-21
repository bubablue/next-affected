import { execSync } from "child_process";
import { getChangedFiles } from "./git";

jest.mock("child_process");

describe("getChangedFiles", () => {
  const mockExecSync = execSync as jest.Mock;

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.clearAllMocks();
  });

  it("should return the list of changed files", () => {
    const mockRevParseStdout = ""; // For git rev-parse
    const mockDiffStdout = "file1.ts\nfile2.ts"; // For git diff

    // Mocking the sequence of execSync calls
    mockExecSync
      .mockReturnValueOnce(Buffer.from(mockRevParseStdout)) // git rev-parse --verify
      .mockReturnValueOnce(Buffer.from(mockDiffStdout)); // git diff

    const base = "main";
    const head = "feature-branch";
    const projectDir = "/path/to/project";

    const result = getChangedFiles({ base, head, projectDir });

    expect(mockExecSync).toHaveBeenCalledWith(
      `git rev-parse --verify ${base}`,
      { cwd: projectDir }
    );
    expect(mockExecSync).toHaveBeenCalledWith(
      `git diff --name-only ${base}...${head}`,
      { cwd: projectDir }
    );
    expect(result).toEqual(["file1.ts", "file2.ts"]);
  });

  it("should include untracked files if includeUncommitted is true", () => {
    const mockRevParseStdout = ""; // For git rev-parse
    const mockDiffStdout = "file1.ts\nfile2.ts"; // For git diff
    const mockUntrackedStdout = "file3.ts"; // For git ls-files

    mockExecSync
      .mockReturnValueOnce(Buffer.from(mockRevParseStdout)) // git rev-parse --verify
      .mockReturnValueOnce(Buffer.from(mockDiffStdout)) // git diff
      .mockReturnValueOnce(Buffer.from(mockUntrackedStdout)); // git ls-files

    const base = "main";
    const projectDir = "/path/to/project";

    const result = getChangedFiles({
      base,
      head: "",
      projectDir,
      includeUncommitted: true,
    });

    expect(mockExecSync).toHaveBeenCalledWith(
      `git rev-parse --verify ${base}`,
      { cwd: projectDir }
    );
    expect(mockExecSync).toHaveBeenCalledWith(
      `git diff --name-only ${base}`,
      { cwd: projectDir }
    );
    expect(mockExecSync).toHaveBeenCalledWith(
      `git ls-files --others --exclude-standard`,
      { cwd: projectDir }
    );
    expect(result.sort()).toEqual(["file1.ts", "file2.ts", "file3.ts"].sort());
  });

  it("should return only uncommitted changes if onlyUncommitted is true", () => {
    const mockDiffStdout = "file1.ts\nfile2.ts"; // For git diff
    const mockUntrackedStdout = "file3.ts"; // For git ls-files

    mockExecSync
      .mockReturnValueOnce(Buffer.from(mockDiffStdout)) // git diff
      .mockReturnValueOnce(Buffer.from(mockUntrackedStdout)); // git ls-files

    const projectDir = "/path/to/project";

    const result = getChangedFiles({
      base: "",
      head: "",
      projectDir,
      onlyUncommitted: true,
    });

    expect(mockExecSync).toHaveBeenCalledWith(`git diff --name-only`, {
      cwd: projectDir,
    });
    expect(mockExecSync).toHaveBeenCalledWith(
      `git ls-files --others --exclude-standard`,
      { cwd: projectDir }
    );
    expect(result.sort()).toEqual(["file1.ts", "file2.ts", "file3.ts"].sort());
  });

  it("should return an empty array if no files have changed", () => {
    const mockRevParseStdout = ""; // For git rev-parse
    const mockDiffStdout = ""; // No changes

    mockExecSync
      .mockReturnValueOnce(Buffer.from(mockRevParseStdout)) // git rev-parse --verify
      .mockReturnValueOnce(Buffer.from(mockDiffStdout)); // git diff

    const base = "main";
    const head = "feature-branch";
    const projectDir = "/path/to/project";

    const result = getChangedFiles({ base, head, projectDir });

    expect(mockExecSync).toHaveBeenCalledWith(
      `git rev-parse --verify ${base}`,
      { cwd: projectDir }
    );
    expect(mockExecSync).toHaveBeenCalledWith(
      `git diff --name-only ${base}...${head}`,
      { cwd: projectDir }
    );
    expect(result).toEqual([]);
  });

  it("should log an error and exit if execSync throws an error", () => {
    const mockError = new Error("Git command failed");
    mockExecSync.mockImplementation(() => {
      throw mockError;
    });

    const consoleSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const processSpy = jest.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit was called");
    });

    const base = "main";
    const head = "feature-branch";
    const projectDir = "/path/to/project";

    expect(() => getChangedFiles({ base, head, projectDir })).toThrow(
      "process.exit was called"
    );

    expect(consoleSpy).toHaveBeenCalledWith(
      "Error executing Git command:",
      mockError.message
    );
    expect(processSpy).toHaveBeenCalledWith(1);

    consoleSpy.mockRestore();
    processSpy.mockRestore();
  });
});
