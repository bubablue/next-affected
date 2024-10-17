import { execSync } from "child_process";
import { getChangedFiles } from "./git";

jest.mock("child_process");

describe("getChangedFiles", () => {
  const mockExecSync = execSync as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return the list of changed files", () => {
    const mockStdout = "file1.ts\nfile2.ts";
    mockExecSync.mockReturnValue(Buffer.from(mockStdout));

    const base = "main";
    const head = "feature-branch";
    const projectDir = "/path/to/project";

    const result = getChangedFiles(base, head, projectDir);

    expect(mockExecSync).toHaveBeenCalledWith(
      `git diff --name-only ${base} ${head}`,
      { cwd: projectDir }
    );
    expect(result).toEqual(["file1.ts", "file2.ts"]);
  });

  it("should return an empty array if no files have changed", () => {
    const mockStdout = "";
    mockExecSync.mockReturnValue(Buffer.from(mockStdout));

    const base = "main";
    const head = "feature-branch";
    const projectDir = "/path/to/project";

    const result = getChangedFiles(base, head, projectDir);

    expect(mockExecSync).toHaveBeenCalledWith(
      `git diff --name-only ${base} ${head}`,
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

    expect(() => getChangedFiles(base, head, projectDir)).toThrow(
      "process.exit was called"
    );

    expect(mockExecSync).toHaveBeenCalledWith(
      `git diff --name-only ${base} ${head}`,
      { cwd: projectDir }
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
