import { execSync } from "child_process";

export function getChangedFiles({
  base,
  head = "HEAD",
  projectDir,
  includeUncommitted = false,
  onlyUncommitted = false,
}: {
  base: string;
  head?: string;
  projectDir: string;
  includeUncommitted?: boolean;
  onlyUncommitted?: boolean;
}): string[] {
  try {
    console.log(`Base: ${base}`);
    console.log(`Head: ${head}`);
    console.log(`Include Uncommitted: ${includeUncommitted}`);
    console.log(`Only Uncommitted: ${onlyUncommitted}`);

    let changedFiles: string[] = [];

    if (onlyUncommitted) {
      // Get uncommitted changes
      const diffStdout = execSync(`git diff --name-only`, { cwd: projectDir });
      const diffFiles = diffStdout
        .toString()
        .trim()
        .split("\n")
        .filter((file) => file.trim() !== "");

      // Get untracked files
      const untrackedFiles = execSync(
        `git ls-files --others --exclude-standard`,
        { cwd: projectDir }
      )
        .toString()
        .trim()
        .split("\n")
        .filter((file) => file.trim() !== "");

      changedFiles = [...diffFiles, ...untrackedFiles];
    } else {
      if (!includeUncommitted && !head) {
        throw new Error(
          "Head commit must be specified when not including uncommitted changes."
        );
      }

      // Ensure base exists
      try {
        execSync(`git rev-parse --verify ${base}`, { cwd: projectDir });
      } catch {
        // Fetch the base branch if it doesn't exist locally
        execSync(`git fetch origin ${base}`, { cwd: projectDir });
      }

      // Build the git diff command
      const gitDiffCommand = includeUncommitted
        ? `git diff --name-only ${base}`
        : `git diff --name-only ${base}...${head}`;

      console.log(`Git Diff Command: ${gitDiffCommand}`);

      const diffStdout = execSync(gitDiffCommand, { cwd: projectDir });
      const diffFiles = diffStdout
        .toString()
        .trim()
        .split("\n")
        .filter((file) => file.trim() !== "");

      console.log("Diff Files:", diffFiles);

      if (includeUncommitted) {
        // Include untracked files
        const untrackedFiles = execSync(
          `git ls-files --others --exclude-standard`,
          { cwd: projectDir }
        )
          .toString()
          .trim()
          .split("\n")
          .filter((file) => file.trim() !== "");

        changedFiles = [...diffFiles, ...untrackedFiles];
      } else {
        changedFiles = diffFiles;
      }
    }

    console.log("Changed Files:", changedFiles);
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
