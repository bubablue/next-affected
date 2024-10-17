jest.mock("madge", () => ({
  __esModule: true,
  default: jest.fn(() => ({
    obj: jest.fn().mockResolvedValue({}),
  })),
}));
