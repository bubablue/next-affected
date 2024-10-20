import { execSync } from "child_process";

export function getChangedFiles({
  base,
  head,
  projectDir,
  includeUncommitted = false,
}: {
  base: string;
  head: string | null;
  projectDir: string;
  includeUncommitted?: boolean;
}): string[] {
  try {
    if (!includeUncommitted && !head) {
      throw new Error(
        "Head commit must be specified when not including uncommitted changes."
      );
    }

    const gitDiffCommand = includeUncommitted
      ? `git diff --name-only ${base}`
      : `git diff --name-only ${base} ${head}`;

    const diffStdout = execSync(gitDiffCommand, { cwd: projectDir });
    const diffFiles = diffStdout
      .toString()
      .trim()
      .split("\n")
      .filter((file) => file);

    const untrackedFiles = includeUncommitted
      ? execSync(`git ls-files --others --exclude-standard`, {
          cwd: projectDir,
        })
          .toString()
          .trim()
          .split("\n")
          .filter((file) => file)
      : [];

    const changedFiles = [...diffFiles, ...untrackedFiles];

    return changedFiles;
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error executing Git command:", error.message);
    } else {
      console.error("Unknown error executing Git command");
    }
    process.exit(1);
  }
}
