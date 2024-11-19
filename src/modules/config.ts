import * as fs from "fs";
import path from "path";
import { NextAffectedConfig } from "../types";

export function initConfig(): void {
  const configFileName = "next-affected.config.json";
  const defaultConfig: NextAffectedConfig = {
    pagesDirectories: ["pages", "src/pages", "app", "src/app"],
    excludedExtensions: [".css", ".scss", ".less", ".svg", ".png", ".jpg"],
    excludedPaths: [],
  };

  if (fs.existsSync(configFileName)) {
    console.log(`${configFileName} already exists.`);
    return;
  }

  fs.writeFileSync(configFileName, JSON.stringify(defaultConfig, null, 2));
  console.log(`Created ${configFileName} with default settings.`);
}

export function loadConfig(projectDir: string): NextAffectedConfig {
  const configFileName = "next-affected.config.json";
  const configFilePath = path.join(projectDir, configFileName);

  if (fs.existsSync(configFilePath)) {
    const configContent = fs.readFileSync(configFilePath, "utf-8");
    return JSON.parse(configContent) as NextAffectedConfig;
  } else {
    return {
      pagesDirectories: ["pages", "src/pages", "app", "src/app"],
      excludedExtensions: [".css", ".scss", ".less", ".svg", ".png", ".jpg"],
      excludedPaths: [],
    };
  }
}
