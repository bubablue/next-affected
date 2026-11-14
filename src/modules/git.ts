import { execFileSync } from "child_process";
import path from "path";

export interface ChangedFilesOptions {
  base?: string;
  head?: string;
  projectDir: string;
  includeUncommitted?: boolean;
  onlyUncommitted?: boolean;
}

export interface ChangedFiles {
  files: string[];
  readPrevious: (files: string[]) => Map<string, string | null>;
}

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function readBlobs(revision: string, repoPaths: string[], cwd: string): (string | null)[] {
  const output = execFileSync("git", ["cat-file", "--batch"], {
    cwd,
    input: repoPaths.map((repoPath) => `${revision}:${repoPath}\n`).join(""),
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const blobs: (string | null)[] = [];
  let offset = 0;
  for (let index = 0; index < repoPaths.length; index++) {
    const lineEnd = output.indexOf(10, offset);
    const header = /^\S+ (\S+) (\d+)$/.exec(output.toString("utf-8", offset, lineEnd));
    offset = lineEnd + 1;
    if (!header) {
      blobs.push(null);
      continue;
    }
    const size = Number(header[2]);
    blobs.push(header[1] === "blob" ? output.toString("utf-8", offset, offset + size) : null);
    offset += size + 1;
  }
  return blobs;
}

function splitNul(output: string): string[] {
  return output.split("\0").filter((file) => file !== "");
}

function assertRef(ref: string): void {
  if (ref.trim() === "" || ref.startsWith("-")) {
    throw new Error(`Invalid git reference: "${ref}"`);
  }
}

function refExists(ref: string, cwd: string): boolean {
  try {
    git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], cwd);
    return true;
  } catch {
    return false;
  }
}

function resolveBaseRef(base: string, cwd: string): string {
  if (refExists(base, cwd)) {
    return base;
  }
  // Fetch the base branch if it doesn't exist locally
  git(["fetch", "origin", base], cwd);
  return refExists(`origin/${base}`, cwd) ? `origin/${base}` : "FETCH_HEAD";
}

export function getChangedFiles({
  base,
  head = "HEAD",
  projectDir,
  includeUncommitted = false,
  onlyUncommitted = false,
}: ChangedFilesOptions): ChangedFiles {
  const repoRoot = git(["rev-parse", "--show-toplevel"], projectDir).trim();
  const diff = (args: string[]) =>
    splitNul(git(["diff", "--name-only", "-z", ...args], repoRoot));

  let diffFiles: string[];
  let previousRevision: () => string;

  if (onlyUncommitted) {
    // Get uncommitted changes
    diffFiles = diff(["HEAD"]);
    previousRevision = () => "HEAD";
  } else {
    if (!base) {
      throw new Error("A base commit or branch is required (--base).");
    }
    assertRef(base);
    assertRef(head);

    // Ensure base exists
    const baseRef = resolveBaseRef(base, repoRoot);

    // Build the git diff command
    if (includeUncommitted) {
      const mergeBase = git(["merge-base", baseRef, "HEAD"], repoRoot).trim();
      diffFiles = diff([mergeBase]);
      previousRevision = () => mergeBase;
    } else {
      diffFiles = diff([`${baseRef}...${head}`]);
      let mergeBase: string | undefined;
      previousRevision = () => {
        if (mergeBase === undefined) {
          mergeBase = git(["merge-base", baseRef, head], repoRoot).trim();
        }
        return mergeBase;
      };
    }
  }

  // Get untracked files
  const untrackedFiles =
    onlyUncommitted || includeUncommitted
      ? splitNul(git(["ls-files", "--others", "--exclude-standard", "-z"], repoRoot))
      : [];

  const readPrevious = (files: string[]): Map<string, string | null> => {
    const previous = new Map<string, string | null>(files.map((file) => [file, null]));
    if (files.length === 0) return previous;
    try {
      const repoPaths = files.map((file) => path.relative(repoRoot, file).split(path.sep).join("/"));
      readBlobs(previousRevision(), repoPaths, repoRoot).forEach((blob, index) =>
        previous.set(files[index], blob)
      );
    } catch {
      return previous;
    }
    return previous;
  };

  return {
    files: [...new Set([...diffFiles, ...untrackedFiles])].map((file) => path.resolve(repoRoot, file)),
    readPrevious,
  };
}
