/** @type {import("jest").Config} */
const config = {
  roots: ["<rootDir>/src/", "<rootDir>/tests/"],
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
};

module.exports = config;
