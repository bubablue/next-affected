import * as fs from "fs";
import path from "path";
import { DEFAULT_CONFIG, initConfig, loadConfig } from "./config";

jest.mock("fs");

const mockedFs = jest.mocked(fs);
const projectDir = "/path/to/project";
const configFilePath = path.join(projectDir, "next-affected.config.json");

describe("initConfig", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  it("does not overwrite an existing config file", () => {
    mockedFs.existsSync.mockReturnValue(true);

    initConfig();

    expect(console.log).toHaveBeenCalledWith("next-affected.config.json already exists.");
    expect(mockedFs.writeFileSync).not.toHaveBeenCalled();
  });

  it("writes the default config when none exists", () => {
    mockedFs.existsSync.mockReturnValue(false);

    initConfig();

    expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
      "next-affected.config.json",
      JSON.stringify(DEFAULT_CONFIG, null, 2)
    );
    expect(console.log).toHaveBeenCalledWith(
      "Created next-affected.config.json with default settings."
    );
  });
});

describe("loadConfig", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns the defaults when there is no config file", () => {
    mockedFs.existsSync.mockReturnValue(false);

    expect(loadConfig(projectDir)).toEqual(DEFAULT_CONFIG);
    expect(mockedFs.existsSync).toHaveBeenCalledWith(configFilePath);
    expect(mockedFs.readFileSync).not.toHaveBeenCalled();
  });

  it("fills missing keys from the defaults", () => {
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(JSON.stringify({ pagesDirectories: ["apps/web/app"] }));

    expect(loadConfig(projectDir)).toEqual({
      ...DEFAULT_CONFIG,
      pagesDirectories: ["apps/web/app"],
    });
  });

  it("logs invalid JSON and falls back to the defaults", () => {
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue("{ nope");

    expect(loadConfig(projectDir)).toEqual(DEFAULT_CONFIG);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining(`could not read ${configFilePath}`)
    );
  });

  it("logs an invalid key and uses its default while keeping the valid ones", () => {
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({ excludedPaths: "packages", pagesDirectories: ["apps/shell/app"] })
    );

    expect(loadConfig(projectDir)).toEqual({
      ...DEFAULT_CONFIG,
      pagesDirectories: ["apps/shell/app"],
    });
    expect(console.error).toHaveBeenCalledWith(
      `Error: "excludedPaths" in ${configFilePath} is invalid (expected a list of strings). Using its default.`
    );
  });

  it("rejects patterns that are not valid regular expressions", () => {
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(JSON.stringify({ appRouter: { hiddenSegments: ["("] } }));

    expect(loadConfig(projectDir).appRouter.hiddenSegments).toEqual(
      DEFAULT_CONFIG.appRouter.hiddenSegments
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('"appRouter.hiddenSegments"')
    );
  });

  it("merges router conventions key by key with the defaults", () => {
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({
        appRouter: { pageFiles: ["page", "view"], interceptionMarkers: { "(.)": 0 } },
        pagesRouter: { indexFiles: ["home"] },
      })
    );

    const config = loadConfig(projectDir);

    expect(config.appRouter).toEqual({
      ...DEFAULT_CONFIG.appRouter,
      pageFiles: ["page", "view"],
      interceptionMarkers: { "(.)": 0 },
    });
    expect(config.pagesRouter).toEqual({ ...DEFAULT_CONFIG.pagesRouter, indexFiles: ["home"] });
    expect(console.error).not.toHaveBeenCalled();
  });

  it("rejects interception markers that are not levels or root", () => {
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({ appRouter: { interceptionMarkers: { "(..)": "up" } } })
    );

    expect(loadConfig(projectDir).appRouter.interceptionMarkers).toEqual(
      DEFAULT_CONFIG.appRouter.interceptionMarkers
    );
  });
});
