import path from "path";
import { loadConfig } from "./config";
import { getChangedFiles } from "./git";
import { findAffectedPages, getDependencyGraph } from "./graph";

export async function runNextAffected(
  componentPath: string | undefined,
  options: {
    project: string;
    base?: string;
    head?: string;
    depth?: number;
    verbose?: boolean;
    uncommitted?: boolean;
    onlyUncommitted?: boolean;
  }
): Promise<void> {
  try {
    if (options.verbose) console.log("Starting next-affected analysis...");

    const projectDir = path.resolve(process.cwd(), options.project);
    const config = loadConfig(projectDir);
    const maxDepth = options.depth ?? Infinity;

    console.log("Building dependency graph. This may take a while...");

    const dependencyGraph = await getDependencyGraph(projectDir, config);

    if (options.verbose) console.log("Dependency graph built.");

    const affectedPages = new Set<string>();
    const totalModules = Object.keys(dependencyGraph).length;
    let totalProcessedModules = 0;

    if (componentPath) {
      // Analyze a specific component
      if (options.verbose) console.log(`Analyzing component: ${componentPath}`);
      const componentFullPath = path.resolve(process.cwd(), componentPath);
      const componentRelativePath = path.relative(
        projectDir,
        componentFullPath
      );

      const affected = findAffectedPages(
        dependencyGraph,
        componentRelativePath,
        projectDir,
        config,
        maxDepth,
        options.verbose,
        (processedModules) => {
          totalProcessedModules += processedModules;
          if (!options.verbose) {
            process.stdout.write(
              `\rProcessed modules: ${totalProcessedModules}/${totalModules}`
            );
          }
        }
      );
      affected.forEach((page) => affectedPages.add(page));

      if (!options.verbose) {
        process.stdout.write(
          `\rProcessed modules: ${totalProcessedModules}/${totalModules}\n`
        );
      }
    } else if (options.base) {
      // Analyze changes between Git references
      console.log(
        `Getting changed files between ${options.base} and ${
          options.head ?? "HEAD"
        }`
      );
      const changedFiles = getChangedFiles({
        base: options.base,
        head: options.head ?? "HEAD",
        projectDir: projectDir,
        includeUncommitted: options.uncommitted ?? false,
        onlyUncommitted: options.onlyUncommitted ?? false,
      });

      if (changedFiles.length === 0) {
        console.log(
          "No changes detected between the specified commits or branches."
        );
        process.exit(0);
      }

      console.log(`Found ${changedFiles.length} changed files.`);
      console.log("Analyzing affected pages...");

      let processedFiles = 0;
      const totalFiles = changedFiles.length;

      for (const file of changedFiles) {
        if (options.verbose) console.log(`Processing file: ${file}`);
        else {
          // Output progress every file
          process.stdout.write(
            `\rProcessing files: ${processedFiles + 1}/${totalFiles}`
          );
        }

        const affected = findAffectedPages(
          dependencyGraph,
          file,
          projectDir,
          config,
          maxDepth,
          options.verbose,
          (processedModules) => {
            totalProcessedModules += processedModules;
          }
        );
        affected.forEach((page) => affectedPages.add(page));
        processedFiles++;
      }

      if (!options.verbose) {
        process.stdout.write(
          `\nTotal modules processed: ${totalProcessedModules}/${totalModules}\n`
        );
      }
    } else {
      console.error(
        "Error: You must specify a component path or use --base to compare commits or branches."
      );
      process.exit(1);
    }

    if (affectedPages.size > 0) {
      console.log("\nAffected Pages:");
      affectedPages.forEach((page) => console.log(page));
    } else {
      console.log("\nNo affected pages found.");
    }
  } catch (error: any) {
    console.error("Error:", error.message);
    console.error(error);
  }
}
