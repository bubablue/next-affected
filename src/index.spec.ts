import { Command } from "commander";

jest.mock("commander", () => ({
  Command: jest.fn().mockImplementation(() => ({
    name: jest.fn().mockReturnThis(),
    description: jest.fn().mockReturnThis(),
    version: jest.fn().mockReturnThis(),
    command: jest.fn().mockReturnThis(),
    option: jest.fn().mockReturnThis(),
    action: jest.fn().mockReturnThis(),
    parse: jest.fn().mockReturnThis(),
    on: jest.fn().mockReturnThis(),
  })),
}));

jest.mock("./modules/config", () => ({
  initConfig: jest.fn(),
}));

jest.mock("./modules/run", () => ({
  runNextAffected: jest.fn(),
}));

describe("CLI Command Tests", () => {
  let program: Command;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    program = require(".").default;
  });

  it("should initialize the next-affected program with the correct metadata", () => {
    expect(program.name).toHaveBeenCalledWith("next-affected");
    expect(program.description).toHaveBeenCalledWith(
      "List Next.js pages affected by changes"
    );
  });

  it("should display help with examples when --help is invoked", () => {
    const onMock = program.on as jest.MockedFunction<any>;
    const helpCallback = onMock.mock.calls[0][1];

    const consoleLogSpy = jest
      .spyOn(console, "log")
      .mockImplementation(() => {});

    helpCallback();

    expect(console.log).toHaveBeenCalledWith("");
    expect(console.log).toHaveBeenCalledWith("Examples:");
    expect(console.log).toHaveBeenCalledWith(
      "  $ next-affected run src/components/Button.tsx"
    );
    expect(console.log).toHaveBeenCalledWith(
      "  $ next-affected run --base main"
    );
    expect(console.log).toHaveBeenCalledWith(
      "  $ next-affected run --base commit1 --head commit2"
    );

    consoleLogSpy.mockRestore();
  });

  it("should parse process.argv and handle the commands", () => {
    expect(program.parse).toHaveBeenCalledWith(process.argv);
  });
});
