import { execSync } from "child_process";

export function getChangedFiles(
  base: string,
  head: string,
  projectDir: string
): string[] {
  const gitDiffCommand = `git diff --name-only ${base} ${head}`;
  try {
    const stdout = execSync(gitDiffCommand, { cwd: projectDir });
    const files = stdout.toString().trim().split("\n");
    return files.filter((file) => file);
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error executing Git command:", error.message);
    } else {
      console.error("Unknown error executing Git command");
    }
    process.exit(1);
  }
}
