import * as fs from "fs";
import path from "path";
import { initConfig, loadConfig } from "../modules/config"; // Adjust import path accordingly
import { NextAffectedConfig } from "../types";

jest.mock("fs");
jest.mock("path");

describe("initConfig", () => {
  const defaultConfig: NextAffectedConfig = {
    pagesDirectories: ["pages", "src/pages", "app", "src/app"],
    excludedExtensions: [".css", ".scss", ".less", ".svg", ".png", ".jpg"],
  };

  it("should not create the config file if it already exists", () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    const consoleSpy = jest.spyOn(console, "log");

    initConfig();

    expect(fs.existsSync).toHaveBeenCalledWith("next-affected.config.json");
    expect(consoleSpy).toHaveBeenCalledWith(
      "next-affected.config.json already exists."
    );
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it("should create the config file if it does not exist", () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    const consoleSpy = jest.spyOn(console, "log");

    initConfig();

    expect(fs.existsSync).toHaveBeenCalledWith("next-affected.config.json");
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      "next-affected.config.json",
      JSON.stringify(defaultConfig, null, 2)
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      "Created next-affected.config.json with default settings."
    );
  });
});

describe("loadConfig", () => {
  const mockProjectDir = "/path/to/project";
  const configFileName = "next-affected.config.json";
  const configFilePath = path.join(mockProjectDir, configFileName);

  const defaultConfig: NextAffectedConfig = {
    pagesDirectories: ["pages", "src/pages", "app", "src/app"],
    excludedExtensions: [".css", ".scss", ".less", ".svg", ".png", ".jpg"],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should load the config file if it exists", () => {
    const mockConfigContent = JSON.stringify(defaultConfig);
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue(mockConfigContent);

    const config = loadConfig(mockProjectDir);

    expect(fs.existsSync).toHaveBeenCalledWith(configFilePath);
    expect(fs.readFileSync).toHaveBeenCalledWith(configFilePath, "utf-8");
    expect(config).toEqual(defaultConfig);
  });

  it("should return the default config if the config file does not exist", () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    const config = loadConfig(mockProjectDir);

    expect(fs.existsSync).toHaveBeenCalledWith(configFilePath);
    expect(fs.readFileSync).not.toHaveBeenCalled();
    expect(config).toEqual(defaultConfig);
  });
});
