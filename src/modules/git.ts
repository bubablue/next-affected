import { execSync } from "child_process";

export function getChangedFiles({
  base,
  head,
  projectDir,
  includeUncommitted = false,
  onlyUncommitted = false,
}: {
  base: string;
  head: string | null;
  projectDir: string;
  includeUncommitted?: boolean;
  onlyUncommitted?: boolean;
}): string[] {
  try {
    let changedFiles: string[] = [];

    if (onlyUncommitted) {
      const diffStdout = execSync(`git diff --name-only`, { cwd: projectDir });
      const diffFiles = diffStdout
        .toString()
        .trim()
        .split("\n")
        .filter((file) => file);

      const untrackedFiles = execSync(
        `git ls-files --others --exclude-standard`,
        { cwd: projectDir }
      )
        .toString()
        .trim()
        .split("\n")
        .filter((file) => file);

      changedFiles = [...diffFiles, ...untrackedFiles];
    } else {
      if (!includeUncommitted && !head) {
        throw new Error(
          "Head commit must be specified when not including uncommitted changes."
        );
      }

      // Build the git diff command based on the flags
      const gitDiffCommand = includeUncommitted
        ? `git diff --name-only ${base}`
        : `git diff --name-only ${base} ${head}`;

      const diffStdout = execSync(gitDiffCommand, { cwd: projectDir });
      const diffFiles = diffStdout
        .toString()
        .trim()
        .split("\n")
        .filter((file) => file);

      if (includeUncommitted) {
        // Include untracked files
        const untrackedFiles = execSync(
          `git ls-files --others --exclude-standard`,
          { cwd: projectDir }
        )
          .toString()
          .trim()
          .split("\n")
          .filter((file) => file);

        changedFiles = [...diffFiles, ...untrackedFiles];
      } else {
        changedFiles = diffFiles;
      }
    }

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
