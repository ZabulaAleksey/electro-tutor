import { describe, expect, it } from "vitest";
import { resolveLocalApiOrigin, validatePublicApiOrigin } from "./profile-contract";
describe("RC1 explicit public API boundary", () => {
 it("uses declared HTTPS independent of web port", () => {
  expect(resolveLocalApiOrigin({origin:"https://learn.example",port:""},"https://api.example")?.href).toBe("https://api.example/");
 });
 it("rejects credentials, paths, query and non-loopback HTTP without falling back", () => {
  for(const value of ["http://api.example", "https://u:p@api.example", "https://api.example/path", "https://api.example/?token=x", "javascript:alert(1)", "https://api.example/#x"]) expect(validatePublicApiOrigin(value)).toBeNull();
  expect(resolveLocalApiOrigin({origin:"http://127.0.0.1:4322",port:"4322"},"broken")).toBeNull();
  expect(resolveLocalApiOrigin({origin:"https://foreign.example:4322",port:"4322"})).toBeNull();
 });
 it("allows declared loopback HTTP for isolated live evidence", () => {
  expect(validatePublicApiOrigin("http://127.0.0.1:8000")?.href).toBe("http://127.0.0.1:8000/");
 });
});
